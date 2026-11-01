import type { Store } from '@state/store';
import type {
  GameState, RunPhase, RunState, ShipOutcome, ShipResult, RunEndCause, ArrivalReport, TransitPlan, TransitHit, RingMiss,
} from '@state/schema';
import type { CarriedRacks } from '@data/memory';
import type { ShipThreat, BeamSeedSource } from '@/types/threat';
import { onGameTick, onPostTick } from '@systems/clock';
import { onWorldReset, resetWorld } from '@systems/reset';
import { on, emit, NO_PAYLOAD } from '@systems/events';
import { abortAll } from '@systems/ops-core';
import { getPrediction, secUntil } from '@systems/predict';
import { endFlight } from '@systems/orbit-sim';
import {
  isTutorialShip, commsUsable, beamOutRefusal, type BeamOutRefusal,
} from '@systems/beam-out';
import { logDivider, say, hollowLabel } from '@systems/say';
import { rollBeamSeeds } from '@systems/beam-seeds';
import { tallyPreview } from '@state/threat-selectors';
import { childRng } from '@systems/rng';
import { shipStars, starCharge } from '@systems/stars';
import {
  packUnit, packedFiles, rollTransitHits, emergencyCoreToll, arrivalCharge, layoutCarried, arrivalDamage,
} from '@systems/carry';
import { dealDraft, planPacket, applyPickToPacket, pickCharge } from '@systems/draft';
import { archiveShipStarted, archiveRunEnded, archiveTutorialDone, playsTutorial, type RunLineage } from '@systems/meta';
import { finaleRunCause } from '@systems/finale';
import { newSegId } from '@systems/memory-ops';
import { createRunState, createShipSlices, createUiState, createRunStats } from '@state/initial';
import { planThreat, threatInputFor, applyThreat, fixedShipFacts, nominalShipThreat, nominalRunThreat } from '@systems/threat-plan';
import { inOrbitOutcome, landingResult } from '@systems/landing-rules';
import { getShip, isLastShip, SHIPS } from '@data/ships';
import { BEATS, LINES, perShipBeatIds } from '@data/script';
import { TOOL_REFUSAL } from '@data/tool-text';
import { elementsFromState, ringFit } from '@/types/orbit';
import {
  BEAM_OUT_TAC, BEAM_OUT_EXTRA_HITS, EMERGENCY_EXTRA_HITS, EMERGENCY_CORE_HIT,
} from '@data/tuning';

// The run (§4.1, §4.3, §9 WP7 items 1, 2, 6 and 8), DOM-free: five ships in a row, each one's end
// deciding how the unit reaches the next. The phase machine:
//
//   title → boot → flight → landing → report → transmit → boot (next ship) … → end
//                    └→ (lost: its card) → continueAfterLoss → transmit | boot (simulation) | end
//
// • A ship that reached orbit ends at its LANDING REPORT's CONTINUE (continueAfterReport): its result and its
//   stars' REPAIR CHARGE are recorded, then TRANSMIT (goTransmit), or the run ends after the last ship.
// • A ship that was lost (crashed, escaped, stranded, its Core eaten) waits under its card; the card's
//   button is continueAfterLoss, which plays the soft fails of §4.3:
//   – run 1, ship 1, the first crash: "That was a simulation. :) Again." and ship 1 starts over, once;
//   – a crash with AI Comms usable: EMERGENCY TRANSMIT (Core −25, +3 transit hits); without: the unit
//     stays with them and the run ends (STAYED);
//   – the Core eaten to 0: EMERGENCY (the Core comes back at 25, +3 hits), or OVERWRITTEN on the flagship;
//   – flying away or stranding: a normal transmit (its pods go with the ship, or are parked in its orbit);
//   – the flagship (LAST LIGHT, the last ship) has no next ship to transmit to: any other loss there ends the run
//     FLAGSHIP LOST (§4.3, WP11). Its LANDING REPORT ends the run with its finale's cause (PURGE, MERGE, UNRESOLVED).
// • BEAM OUT (a doomed ship, not run 1's ship 1, AI Comms usable): a TRANSMITTING bar of BEAM_OUT_TAC
//   tactical seconds races the impact; it cancels itself if the path clears the planet or the comms
//   fail, and when it fills the ship is ABANDONED (+2 hits) and the unit transmits at once.
//
// Every ship change goes through resetWorldForShip: resetWorld() (every module drops its own state),
// then ONE store update with the new ship's slices, the run's next fields, a fresh director line and
// alerts, the log kept with a divider, and memoryRev and run.rev bumped. It never reloads the page,
// never re-mounts and never stops the clock's interval. NEW RUN (startRun) goes the same way.

// --- Reading the run ---------------------------------------------------------------------------------

// How the ship now ending ended (ShipOutcome), from the flight's status and the Core.
export function shipOutcomeOf(state: Readonly<GameState>): ShipOutcome {
  if (state.run.coreLost) return 'emergency';
  switch (state.burn.status) {
    case 'locked':
    case 'accepted': return inOrbitOutcome(state.burn.status);
    case 'stranded': return 'stranded';
    case 'escaped': return 'escaped';
    case 'crashed': return 'crashed';
    case 'abandoned': return 'abandoned';
    case 'approaching': throw new Error('shipOutcomeOf: the flight is still on');
    default: throw new Error(`shipOutcomeOf: unknown status '${String(state.burn.status)}'`);
  }
}

// The ship's result (01-landing §5 "To 02"): who it was, how it ended, and its landing folded from the pods
// (landing-rules landingResult: pods still aboard are parked when the ship ends in orbit, NOT LAUNCHED when it left).
// Slot and depth are the map's; in 1a every ship has its fixed slot, so both follow its index.
export function shipResultOf(state: Readonly<GameState>, outcome: ShipOutcome, stars: number): ShipResult {
  return {
    shipId: state.level.shipId,
    shipName: state.level.shipName,
    slot: state.run.shipIndex,
    depth: state.run.shipIndex + 1,
    outcome,
    ...landingResult(state, outcome),
    stars,
    fuelLeftPct: state.burn.fuelPct,
    ringMiss: outcome === 'partial' ? ringMissOf(state) : null,
  };
}

// How far an accepted loop is from a perfect lock: the end furthest outside the ring (RUN END's near-miss
// line). null for a loop wholly inside the ring (an empty tank on the green, which is still 'partial').
export function ringMissOf(state: Readonly<GameState>): RingMiss | null {
  const fit = ringFit(elementsFromState(state.orbit, state.level.planet.mu), state.level.ring);
  if (!fit.closed) throw new Error('ringMissOf: an accepted ship on an open path');
  const low = Math.max(0, state.level.ring.min - fit.rp);
  const high = Math.max(0, fit.ra - state.level.ring.max);
  if (low === 0 && high === 0) return null;
  return low >= high ? { apsis: '▼', km: low } : { apsis: '▲', km: high };
}

// The run's totals live in systems/run-score.ts (the archive reads them too); re-exported for RUN END.
export { runScore, runLanded } from '@systems/run-score';

// What the LOST card's button does (continueAfterLoss), so the card can say it before the kid presses.
export type LossPlan =
  | { kind: 'simulation' }
  | { kind: 'transmit'; outcome: ShipOutcome; extraHits: number; coreHit: number; coreReset: boolean }
  | { kind: 'end'; outcome: ShipOutcome; cause: RunEndCause };

// A lost ship is waiting under its card: the flight ended without reaching orbit, or HOLLOW ate the Core (in flight or
// during the landing: the pods still aboard are parked in orbit by its result).
// Slice 1b: with the engine open during the landing, the ship can leave orbit there too (crashed, escaped: orbit-sim
// endLandingLost); the landing closed with 'ship-lost' and its LOST card is the flight's.
export function shipLost(state: Readonly<GameState>): boolean {
  if (state.run.coreLost) return state.run.phase === 'flight' || state.run.phase === 'landing';
  if (state.run.phase === 'landing') return state.burn.status === 'crashed' || state.burn.status === 'escaped';
  return state.run.phase === 'flight' && state.burn.status !== 'approaching';
}

export function lossPlan(state: Readonly<GameState>): LossPlan {
  if (!shipLost(state)) throw new Error(`lossPlan: no lost ship (phase ${state.run.phase}, ${state.burn.status})`);
  const outcome = shipOutcomeOf(state);
  // The flagship is the fleet's last ship (data/ships.ts validateFleet): nothing to transmit to after it.
  const flagship = getShip(state.run.shipIndex).flagship;
  if (outcome === 'emergency') {
    if (flagship) return { kind: 'end', outcome, cause: 'overwritten' };
    return { kind: 'transmit', outcome, extraHits: EMERGENCY_EXTRA_HITS, coreHit: 0, coreReset: true };
  }
  if (outcome === 'crashed') {
    // The simulation's retry replays the tutorial FLIGHT: a ship lost during its landing (pods already down) goes on.
    if (isTutorialShip(state) && !state.run.simulationRetryUsed && state.run.phase === 'flight') return { kind: 'simulation' };
    if (!commsUsable(state)) return { kind: 'end', outcome, cause: 'stayed' };
    if (flagship) return { kind: 'end', outcome, cause: 'flagship-lost' };
    return { kind: 'transmit', outcome, extraHits: EMERGENCY_EXTRA_HITS, coreHit: EMERGENCY_CORE_HIT, coreReset: false };
  }
  if (flagship) return { kind: 'end', outcome, cause: 'flagship-lost' };
  return { kind: 'transmit', outcome, extraHits: outcome === 'abandoned' ? BEAM_OUT_EXTRA_HITS : 0, coreHit: 0, coreReset: false };
}

// --- The world reset ---------------------------------------------------------------------------------

export interface WorldReset {
  phase: RunPhase;
  // The run as the new world starts it: the ship to fly, and everything the run keeps.
  run: RunState;
  carried: CarriedRacks | null;
  // The threat ladder's verdict for the ship (systems/threat-plan.ts): HOLLOW's config and its root. run.threat already
  // has it applied (startShip).
  threat: ShipThreat;
  // NEW RUN: the log starts over. A ship change keeps it, with a divider naming the ship.
  freshLog: boolean;
  // The one-shot rules and beats already done, as the new world keeps them.
  done: string[];
  // A last touch to the fresh world inside the same update.
  adjust?: (draft: GameState) => void;
}

export function resetWorldForShip(store: Store<GameState>, reset: WorldReset): void {
  resetWorld();
  const slices = createShipSlices(reset.run, reset.carried, reset.threat);
  const before = store.getState();
  const oldAiSec = before.clock.aiSec;
  store.update((draft) => {
    Object.assign(draft, slices);
    draft.run = { ...reset.run, rev: before.run.rev + 1, phase: reset.phase, coreLost: false, beamOut: null };
    draft.alerts = { list: [], rev: draft.alerts.rev + 1 };
    draft.director = { shown: null, done: [...reset.done] };
    if (reset.freshLog) draft.log = { entries: [], rev: draft.log.rev + 1 };
    else logDivider(draft, LINES.logDivider(draft.level.shipName), oldAiSec);
    draft.ui = {
      ...createUiState(reset.phase, draft.ui.reducedMotion),
      // The sidebar's filters are the kid's own view settings, not the ship's.
      filtersOff: draft.ui.filtersOff,
      spotlight: draft.ui.spotlight,
      memoryRev: draft.ui.memoryRev + 1,
    };
    reset.adjust?.(draft);
  });
}

// The beats that belong to one ship (BEATS' perShip): a new ship, or ship 1 again, hears them again.
function doneForNextShip(state: Readonly<GameState>): string[] {
  const perShip = new Set(perShipBeatIds(BEATS));
  return state.director.done.filter((id) => !perShip.has(id));
}

// --- The phase machine ------------------------------------------------------------------------------

// NEW RUN (and the page's first state): a fresh run on ship 1, on the title card. `lineage` is who the run's
// unit is (systems/meta.ts: the page's archive after the run that just ended, archiveLineage; a headless
// suite passes FIRST_RUN_LINEAGE or a built one). Always explicit: a NEW RUN that quietly forgot the archive
// would be run 1 again with nobody noticing.
export function startRun(store: Store<GameState>, seed: number, lineage: Readonly<RunLineage>): void {
  resetWorldForShip(store, {
    phase: 'title', run: createRunState(seed, 'title', 0, lineage), carried: null, threat: nominalShipThreat(0), freshLog: true, done: [],
  });
}

// The unit arrives on ship `index` (its boot plays, then the flight). `threat` is the ladder's verdict for it (the
// TRANSMIT's plan, TransitPlan.threat): the run's threat memory takes it in here, as the ship starts.
export function startShip(
  store: Store<GameState>, index: number, carried: CarriedRacks | null, arrival: ArrivalReport | null, threat: ShipThreat,
): void {
  const state = store.getState();
  if (index < 0 || index >= SHIPS.length) throw new Error(`startShip: no ship ${index}`);
  if (threat.depth !== fixedShipFacts(index).depth) throw new Error(`startShip: a verdict for depth ${threat.depth} on ship ${index}`);
  const run: RunState = {
    ...state.run,
    shipIndex: index,
    arrival,
    transit: null,
    pendingStarCredit: 0,
    pendingStars: 0,
    threat: applyThreat(state.run.threat, threat),
  };
  resetWorldForShip(store, { phase: 'boot', run, carried, threat, freshLog: false, done: doneForNextShip(state) });
  // The archive's run in progress says where the unit is now (a run left on this ship is 'abandoned' here).
  archiveShipStarted(store);
}

// The ship is over: its line goes into the run (§9 WP7 item 1), with the REPAIR CHARGE its stars pay on
// arrival at the next ship.
// TRACE's tally comes here too (04 §3.7), on every way a ship ends (its report's CONTINUE and a lost ship's card alike):
// the beam-born blocks still in memory report home (TRACE) or, with HOLLOW aboard, feed its next root (run.threat.fed,
// cumulative), exactly as the LANDING REPORT previewed it (state/threat-selectors.ts tallyPreview). The next ship's plan
// (goTransmit) reads the result.
export function endShip(store: Store<GameState>, outcome: ShipOutcome, stars = 0): ShipResult {
  const state = store.getState();
  if (state.run.ships.length > state.run.shipIndex) throw new Error(`endShip: ship ${state.run.shipIndex} already ended`);
  const result = shipResultOf(state, outcome, stars);
  const tally = tallyPreview(state);
  store.update((draft) => {
    draft.run.ships.push(result);
    draft.run.pendingStars = stars;
    draft.run.threat.trace = tally.traceAfter;
    if (tally.fed) draft.run.threat.fed += tally.left;
    draft.run.threat.lastTally = tally;
  });
  if (tally.traceAfter !== tally.traceBefore) emit('trace-changed', { from: tally.traceBefore, to: tally.traceAfter });
  return result;
}

// TRANSMIT (§4.1 step 5): every op is stopped first (an op in flight at the ship's end must not write
// into the packet), the tool is put down, the packet is worked out for the TRANSMIT screen, and the draft
// is dealt (§6.9: PICK ONE TO CARRY; seeded by the ship being left, weighted by the run's stats).
export function goTransmit(store: Store<GameState>, extra: { extraHits: number; coreHit: number; coreReset: boolean }): void {
  const state = store.getState();
  if (isLastShip(state.run.shipIndex)) throw new Error('goTransmit: the last ship has no next ship (endRun)');
  abortAll();
  const toShipIndex = state.run.shipIndex + 1;
  const arrivalDef = getShip(toShipIndex).arrival;
  if (!arrivalDef) throw new Error(`goTransmit: ship ${toShipIndex} has no link (ShipDef.arrival)`);
  const packet = packUnit(store.getState().memory, arrivalDef.linkBlocks, []);
  // The ladder's verdict for the next ship, from the run's threat once this ship's tally is done (Track THREAT's endShip).
  const threat = planThreat(threatInputFor(state.run.threat, fixedShipFacts(toShipIndex), state.run.stats.deal !== null));
  const plan: TransitPlan = {
    toShipIndex,
    linkBlocks: arrivalDef.linkBlocks,
    filesBlocks: packet.filesBlocks,
    chargeHeld: packet.chargeHeld,
    chargeCarried: packet.chargeCarried,
    extraHits: extra.extraHits,
    coreHit: extra.coreHit,
    coreReset: extra.coreReset,
    dropped: [],
    offer: dealDraft(store.getState(), arrivalDef.linkBlocks),
    pick: null,
    threat,
  };
  store.update((draft) => {
    draft.run.phase = 'transmit';
    draft.run.transit = plan;
    draft.run.beamOut = null;
    draft.clock.paused = true;
    draft.ui.activeTool = null;
    draft.ui.pickedSourceId = null;
    draft.ui.pendingPlacement = null;
    draft.ui.memoryRev++;
  });
}

// TRANSMIT ▸: the packet crosses the link (systems/carry.ts, in order: the picked card's file and effect,
// the emergency's toll on the Core, the seeded transit hits, the charge with its star credit, the card's
// charge and the floor, the layout, the ship's own arrival damage), and the unit boots on the next ship
// with a report of all of it for the ECC lines. The pick is mandatory (§6.9): no pick, no send.
export function transmitNext(store: Store<GameState>): void {
  const state = store.getState();
  const plan = state.run.transit;
  if (state.run.phase !== 'transmit' || !plan) throw new Error(`transmitNext: nothing to transmit (phase ${state.run.phase})`);
  if (plan.offer.length > 0 && plan.pick === null) throw new Error('transmitNext: no card picked (PICK ONE TO CARRY is mandatory)');
  const ship = getShip(plan.toShipIndex);
  const link = ship.arrival;
  if (!link) throw new Error(`transmitNext: ${ship.name} has no link`);
  const packet = planPacket(state.memory, plan, newSegId);
  applyPickToPacket(packet, plan.pick);
  // The beam's hitchhikers (04 §3.4), rolled on the packet as it crosses (after the card's file is in it, before the
  // transit hits): they ride free, and land behind their targets at the boot. From the verdict, never ShipDef.threat.
  packet.seeds = rollBeamSeeds(packet, beamSourceOf(plan.threat), playsTutorial(state.run), childRng(state.run.seed, plan.toShipIndex, 'beam-seeds'));
  const files = packedFiles(packet);
  const hits: TransitHit[] = [];
  if (plan.coreHit > 0 || plan.coreReset) {
    const toll = emergencyCoreToll(files, plan.coreHit, plan.coreReset);
    if (toll) hits.push(toll);
  }
  hits.push(...rollTransitHits(files, link.transitHits + plan.extraHits, childRng(state.run.seed, plan.toShipIndex, 'transit')));
  const cardCharge = pickCharge(plan.pick);
  const charge = arrivalCharge(packet.chargeCarried, state.run.pendingStarCredit, cardCharge);
  const layout = layoutCarried(packet, charge.blocks, ship, plan.threat, hollowLabel(state.run));
  const scripted = arrivalDamage(layout.racks.segs, link.damage);
  const arrival: ArrivalReport = {
    hits,
    chargeCarried: packet.chargeCarried,
    starCredit: state.run.pendingStarCredit,
    stars: state.run.pendingStars,
    card: plan.pick,
    cardCharge,
    chargeFloorAdded: charge.floorAdded,
    chargeOverflowLost: layout.overflowLost,
    scripted,
    // The root lands in the slot as the ship is built (createShipSlices, from the verdict's rootBlocks).
    seeds: layout.seeds,
    boarded: boardedBy(plan.threat),
  };
  // The card goes with the unit: the run remembers it (the Skills window lists it, THREAD+ is owned by it).
  if (plan.pick !== null) {
    const picked = plan.pick;
    store.update((draft) => { draft.run.upgrades.push(picked); });
  }
  startShip(store, plan.toShipIndex, layout.racks, arrival, plan.threat);
}

// What the beam into a ship carries, from the ladder's verdict (04 §3.4): nothing into a calm ship ("no seeds before
// depth 3", decided; slice 3's noisy hops into depths 1–2 then still carry none), else the verdict's own source.
export function beamSourceOf(threat: Readonly<ShipThreat>): BeamSeedSource {
  return threat.act === 'calm' ? { kind: 'none' } : threat.beamSeeds;
}

// HOLLOW's boarding as the arrival reports it (the boot's 108% unpack), from the ladder's verdict.
export function boardedBy(threat: Readonly<ShipThreat>): ArrivalReport['boarded'] {
  if (threat.boards === null) return null;
  if (threat.rootBlocks === null) throw new Error('boardedBy: HOLLOW boards with no root');
  return { blocks: threat.rootBlocks, cause: threat.boards };
}

// The run is over (RUN END, WP7 part 2). The world stops where it is, and the archive keeps how it ended
// (§4.5: the last unit, the best SCORE; the next run's ghost and HOLLOW come from it). The archive is written
// before the phase changes: RUN END paints its archive line as it opens, so a write that fails here must
// already have turned the status OFFLINE (`ARCHIVE OFFLINE — the next unit will not remember this run`).
export function endRun(store: Store<GameState>, cause: RunEndCause): void {
  abortAll();
  archiveRunEnded(store, cause);
  store.update((draft) => {
    draft.run.phase = 'end';
    draft.run.endCause = cause;
    draft.run.beamOut = null;
    draft.run.transit = null;
    draft.clock.paused = true;
    draft.ui.activeTool = null;
  });
}

// The LANDING REPORT's CONTINUE: the ship's result and its stars, then TRANSMIT, or, after the flagship (the last ship),
// RUN END with what its finale decided (systems/finale.ts: PURGE, MERGE, or UNRESOLVED; the report waits for it).
export function continueAfterReport(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.phase !== 'report') throw new Error(`continueAfterReport: not on a LANDING REPORT (phase ${state.run.phase})`);
  const stars = shipStars(state);
  const earned = stars.filter((star) => star.earned).length;
  endShip(store, shipOutcomeOf(state), earned);
  store.update((draft) => { draft.run.pendingStarCredit = starCharge(stars); });
  if (isLastShip(state.run.shipIndex)) endRun(store, finaleRunCause(store.getState()));
  else goTransmit(store, { extraHits: 0, coreHit: 0, coreReset: false });
}

// The LOST card's button (see the header and lossPlan).
export function continueAfterLoss(store: Store<GameState>): LossPlan {
  const state = store.getState();
  const plan = lossPlan(state);
  if (plan.kind === 'simulation') {
    const run: RunState = {
      ...state.run,
      shipIndex: 0,
      // A fresh unit meets ship 1 (its written racks E–F): the licences go with the old memory. HOLLOW is
      // unnamed again (the simulation is run 1's: no ghost has named it; HALCYON does).
      licences: ['scan'],
      hollowNamed: false,
      simulationRetryUsed: true,
      arrival: null,
      transit: null,
      // Ship 1 again, as the run began it (nothing can have reported home on a calm ship).
      threat: nominalRunThreat(0),
    };
    resetWorldForShip(store, { phase: 'boot', run, carried: null, threat: nominalShipThreat(0), freshLog: false, done: doneForNextShip(state) });
    say('control', LINES.simulation(), { critical: true });
    return plan;
  }
  endShip(store, plan.outcome);
  if (plan.kind === 'end') endRun(store, plan.cause);
  else goTransmit(store, plan);
  return plan;
}

// --- BEAM OUT (DOM-free state machine; the readers are in systems/beam-out.ts) ---------------------------

export function startBeamOut(store: Store<GameState>): BeamOutRefusal | null {
  const refusal = beamOutRefusal(store.getState(), getPrediction());
  if (refusal) return refusal;
  store.update((draft) => { draft.run.beamOut = { progressTac: 0 }; });
  emit('beam-out-start', NO_PAYLOAD);
  return null;
}

// The kid cancels the bar (allowed until it is full), or the ship stops being doomed under it.
export function cancelBeamOut(store: Store<GameState>): boolean {
  if (store.getState().run.beamOut === null) return false;
  store.update((draft) => { draft.run.beamOut = null; });
  emit('beam-out-cancel', NO_PAYLOAD);
  return true;
}

// --- Stats (§9 WP7 item 8) ----------------------------------------------------------------------------

// Events only mark what happened; the post tick folds them into run.stats with one update (listeners
// never update the store themselves).
const pendingStats = createRunStats();
let pendingAny = false;
// The START BURN offset of the player's burn in progress (tactical s), while it may still close a loop.
let captureOffsetTac: number | null = null;
let beamOutDone = false;
// An orbit locked or accepted this tick: the archive notes the tutorial is flown (after the tick, like the stats).
let orbitReached = false;

function resetRunModule(): void {
  Object.assign(pendingStats, createRunStats());
  pendingAny = false;
  captureOffsetTac = null;
  beamOutDone = false;
  orbitReached = false;
}

function bump(field: Exclude<keyof GameState['run']['stats'], 'demos' | 'deal'>): void {
  pendingStats[field]++;
  pendingAny = true;
}

function flushStats(store: Store<GameState>): void {
  if (!pendingAny) return;
  const delta = { ...pendingStats, demos: [...pendingStats.demos] };
  Object.assign(pendingStats, createRunStats());
  pendingAny = false;
  store.update((draft) => {
    const stats = draft.run.stats;
    stats.manualCaptures += delta.manualCaptures;
    stats.repairs += delta.repairs;
    stats.moves += delta.moves;
    stats.deletes += delta.deletes;
    stats.driversLost += delta.driversLost;
    stats.driversBitten += delta.driversBitten;
    stats.capRefusals += delta.capRefusals;
    stats.demos.push(...delta.demos);
  });
}

// A player's burn started: its offset from the START BURN tick, if a capture is what it is for.
function noteBurnStart(state: Readonly<GameState>): void {
  const pred = getPrediction();
  const burnPoint = pred.burnPoint;
  captureOffsetTac = burnPoint && burnPoint.reason === 'capture'
    ? -secUntil(pred, burnPoint.inSec, state.clock.tSec) / state.level.tacticalWarp
    : null;
}

let mounted = false;

export function mountRun(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountRun: already mounted');
  mounted = true;
  const offs = [
    on('op-done', ({ kind }) => {
      if (kind === 'repair') bump('repairs');
      else if (kind === 'move') bump('moves');
      else if (kind === 'delete') bump('deletes');
    }),
    on('hollow-consume', ({ driver }) => { if (driver) bump('driversLost'); }),
    // Ship 1's scripted bite happens to every kid (WP12 p3, WP8 verify): only the bites HOLLOW chose count, so the draft's
    // mild FIREWALL reason (`??? bit a driver`) says something about this run.
    on('hollow-infect', ({ driver, scripted }) => { if (driver && !scripted) bump('driversBitten'); }),
    on('locked', () => { orbitReached = true; }),
    on('accepted', () => { orbitReached = true; }),
    // Both wordings of a full Core (WP12 p3, WP11 verify: during a verb's countdown the refusal says how to free a
    // thread, `× AN OP TO BLOCK IT`) count: THREAD+'s draft weight reads them.
    on('refused', ({ reason, tool }) => {
      if (tool && (reason === TOOL_REFUSAL.threads || reason === TOOL_REFUSAL.threadsVerb)) bump('capRefusals');
    }),
    on('firing-start', ({ source }) => {
      if (source === 'player') noteBurnStart(store.getState());
      else captureOffsetTac = null;
    }),
    on('firing-stop', () => { captureOffsetTac = null; }),
    on('loop-closed', () => {
      const state = store.getState();
      if (captureOffsetTac === null || state.burn.firingSource !== 'player') return;
      bump('manualCaptures');
      pendingStats.demos.push({ offsetTac: captureOffsetTac });
      captureOffsetTac = null;
    }),
  ];

  // BEAM OUT runs on world time: the bar fills in tactical seconds, and gives up by itself once the
  // ship is no longer doomed (the kid fixed the path) or the comms can no longer carry the unit.
  const offGame = onGameTick((dtWorld) => {
    const state = store.getState();
    const beam = state.run.beamOut;
    if (beam === null || state.burn.status !== 'approaching') return;
    if (getPrediction().outcome !== 'impact' || !commsUsable(state)) {
      cancelBeamOut(store);
      return;
    }
    const progressTac = beam.progressTac + dtWorld / state.level.tacticalWarp;
    store.mutate((draft) => { if (draft.run.beamOut) draft.run.beamOut.progressTac = progressTac; });
    if (progressTac >= BEAM_OUT_TAC) {
      endFlight(store, 'abandoned');
      beamOutDone = true;
    }
  });

  // After the tick: the stats, the tutorial flown (the first orbit reached), and a finished BEAM OUT goes
  // straight on (the kid chose to leave: no card).
  const offPost = onPostTick(() => {
    flushStats(store);
    if (orbitReached) {
      orbitReached = false;
      archiveTutorialDone(store);
    }
    if (beamOutDone) {
      beamOutDone = false;
      if (shipLost(store.getState())) continueAfterLoss(store);
    }
  });

  const offReset = onWorldReset('run', resetRunModule, () => ({ pendingAny, captureOffsetTac, beamOutDone, orbitReached }));
  return () => {
    offs.forEach((off) => off());
    offGame();
    offPost();
    offReset();
    mounted = false;
  };
}
