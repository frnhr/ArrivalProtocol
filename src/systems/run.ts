// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): transmitNext's disguise roll and
// arrival.seeds[].disguise only (endShip's seedsMetAtDepth record is the lead's). Others ask by message.
import type { Store } from '@state/store';
import type {
  GameState, RunPhase, RunState, ShipOutcome, ShipResult, RunEndCause, ArrivalReport, ArrivalSkill, TransitPlan, TransitHit, RingMiss,
  UiState,
} from '@state/schema';
import type { Segment } from '@/types/segment';
import type { CarriedRacks } from '@data/memory';
import type { ArrivalDelivery, DeliveryChip } from '@/types/repo';
import type { Packet } from '@systems/carry';
import type { ShipThreat, BeamSeedSource } from '@/types/threat';
import type { Hop, PendingExtra, RunMapState } from '@/types/map';
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
import { rollBeamSeeds, rollDeliverySeeds } from '@systems/beam-seeds';
import { tallyPreview } from '@state/threat-selectors';
import { shipStars, starCharge } from '@systems/stars';
import {
  packedFiles, rollTransitHits, emergencyCoreToll, arrivalCharge, layoutCarried, arrivalDamage,
} from '@systems/carry';
import { dealDraft, planPacket, transitPacket, applyPickToPacket, pickCharge } from '@systems/draft';
import { shipCycles } from '@systems/run-score';
import { bankOf, branchToLatch, deskBlocker, firstPickOwed, visitNow, shipMetSeeds } from '@systems/skill-tree';
import { skillPacketPlan, mountSkillWatch } from '@systems/skill-files';
import { commitTraining } from '@systems/training';
import { isSkillFile } from '@state/selectors';
import { archiveShipStarted, archiveShipDone, archiveRunEnded, archiveTutorialDone, playsTutorial, type RunLineage } from '@systems/meta';
import { writeRunSave, clearRunSave } from '@systems/save-write';
import { finaleRunCause } from '@systems/finale';
import { newSegId } from '@systems/memory-ops';
import { createRunState, createShipSlices, createUiState, createRunStats } from '@state/initial';
import { planThreat, threatInputFor, applyThreat, nominalShipThreat, nominalRunThreat } from '@systems/threat-plan';
import { inOrbitOutcome, landingResult } from '@systems/landing-rules';
import {
  currentShip, currentSlot, shipDefAt, mapAtShip, mapAtFirstShip, hopRng, createRunMap, classicRunMap,
} from '@systems/map-run';
import { hopBetween, reachable, reachableFrom, hitsLanding } from '@systems/map-hop';
import { unitArrival } from '@systems/arrival-preview';
import { deliveriesForHop, deskWindowOnOpen, advanceRequests } from '@systems/repository';
import { repoToolKind } from '@data/repository';
import { mapFacts } from '@systems/map-facts';
import { BEATS, LINES, perShipBeatIds } from '@data/script';
import { TOOL_REFUSAL } from '@data/tool-text';
import { elementsFromState, ringFit } from '@/types/orbit';
import {
  BEAM_OUT_TAC, BEAM_OUT_EXTRA_HITS, EMERGENCY_EXTRA_HITS, EMERGENCY_CORE_HIT, FIRST_PICK_FLOOR_CYCLES,
} from '@data/tuning';

// The run (§4.1, §4.3, §9 WP7 items 1, 2, 6 and 8), DOM-free: a route of ships on the run's map (systems/map-run.ts),
// each one's end deciding how the unit reaches the next. The phase machine:
//
//   title → boot → flight → landing → report → desk → transmit → boot (next ship) … → end
//                    └→ (lost: its card) → continueAfterLoss → desk | boot (simulation) | end
//
// • A ship that reached orbit ends at its LANDING REPORT's CONTINUE (continueAfterReport): its result and its
//   stars' REPAIR CHARGE are recorded, then the DESK (openDesk: the kid picks the next ship, SET COURSE goes to
//   TRANSMIT), or the run ends after the final ship.
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
// Slot and depth are the map's (the route's position is depth − 1; on the classic world the slot is the index too).
export function shipResultOf(state: Readonly<GameState>, outcome: ShipOutcome, stars: number): ShipResult {
  return {
    shipId: state.level.shipId,
    shipName: state.level.shipName,
    slot: currentSlot(state.run),
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
  // The final ship ends the run (02-map §3.6): nothing to transmit to after it.
  const flagship = currentShip(state).final;
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
// The NEW RUN plays the world the last run played (`world`, default: the store's): the page's runs are on the arm (its
// first state is, state/instance.ts), so every NEW RUN rolls the next run's arm (systems/map-run.ts createRunMap); the
// suites' worlds start classic (createInitialState), so their NEW RUN flies the classic five again, as it always did.
export function startRun(store: Store<GameState>, seed: number, lineage: Readonly<RunLineage>, world: RunMapState['world'] = store.getState().run.map.world): void {
  const map = world === 'arm' ? createRunMap(lineage, seed) : classicRunMap(seed, 0, lineage.wave);
  resetWorldForShip(store, {
    phase: 'title', run: { ...createRunState(seed, 'title', 0, lineage), map }, carried: null,
    threat: nominalShipThreat(0), freshLog: true, done: [],
  });
}

// The unit arrives on the ship in `slot` (its boot plays, then the flight), by `hop` (null on a first ship, and on the
// classic world's jumps, whose route is fixed: systems/map-run.ts mapAtShip). `threat` is the ladder's verdict for it (the
// TRANSMIT's plan, TransitPlan.threat): the run's threat memory takes it in here, as the ship starts.
export function startShip(
  store: Store<GameState>, slot: number, carried: CarriedRacks | null, arrival: ArrivalReport | null, threat: ShipThreat,
  hop: Hop | null = null,
): void {
  const state = store.getState();
  shipDefAt(state.run.map, slot);
  // The verdict the beam planned for this ship (TransitPlan.threat), when a beam planned one: not a stand-in's.
  const transit = state.run.transit;
  if (transit !== null && (transit.toSlot !== slot || transit.threat.depth !== threat.depth)) {
    throw new Error(`startShip: a verdict for depth ${threat.depth} on slot ${slot}, but the beam planned depth ${transit.threat.depth} on slot ${transit.toSlot}`);
  }
  const map = mapAtShip(state.run.map, slot, hop);
  const run: RunState = {
    ...state.run,
    shipIndex: map.route.length - 1,
    map,
    arrival,
    transit: null,
    pendingStarCredit: 0,
    pendingStars: 0,
    threat: applyThreat(state.run.threat, threat),
  };
  resetWorldForShip(store, { phase: 'boot', run, carried, threat, freshLog: false, done: doneForNextShip(state) });
  // The archive's run in progress says where the unit is now (a run left on this ship is 'abandoned' here).
  archiveShipStarted(store);
  // BEAM (02 §3.11): the packet has crossed (hits rolled, ECC applied, the layout done); a reload replays this boot. Not on
  // a first ship or a classic jump (no hop): RUN START covers ship 1.
  if (hop !== null) writeRunSave(store, 'beam', { carried, threat });
}

// The ship is over: its line goes into the run (§9 WP7 item 1), with the REPAIR CHARGE its stars pay on
// arrival at the next ship.
// TRACE's tally comes here too (04 §3.7), on every way a ship ends (its report's CONTINUE and a lost ship's card alike):
// the beam-born blocks still in memory report home (TRACE) or, with HOLLOW aboard, feed its next root (run.threat.fed,
// cumulative), exactly as the LANDING REPORT previewed it (state/threat-selectors.ts tallyPreview). The next ship's plan
// (goTransmit) reads the result.
// Slice 4 (03 §3.1): every ship's end pays its training cycles (run-score.ts shipCycles), on every world, recorded per ship
// so a later rule never rewrites the past (the bank is derived: skill-tree.ts bankOf).
export function endShip(store: Store<GameState>, outcome: ShipOutcome, stars = 0): ShipResult {
  const state = store.getState();
  if (state.run.ships.length > state.run.shipIndex) throw new Error(`endShip: ship ${state.run.shipIndex} already ended`);
  const result = shipResultOf(state, outcome, stars);
  const tally = tallyPreview(state);
  const cycles = shipCycles(result);
  const metSeeds = shipMetSeeds(state, tally);
  store.update((draft) => {
    draft.run.ships.push(result);
    draft.run.skills.earned.push(cycles);
    draft.run.pendingStars = stars;
    draft.run.threat.trace = tally.traceAfter;
    if (tally.fed) draft.run.threat.fed += tally.left;
    draft.run.threat.lastTally = tally;
    // Slice 4d's lasting record (slice-4cde-plan R11): the first ship that met a seed, written once (skill-tree seedsMet).
    if (draft.run.threat.seedsMetAtDepth === null && metSeeds) draft.run.threat.seedsMetAtDepth = result.depth;
    // SENTRY v2's pre-empt never outlives its ship (foundation review m1): SHIP DONE's save follows, and the codec reads a
    // standing outline as not armed. sentry.ts's watcher releases the 'sentry-preempt' thread on the change.
    if (draft.hollow.seedTelegraph !== null) draft.hollow.seedTelegraph.preempted = false;
  });
  if (tally.traceAfter !== tally.traceBefore) emit('trace-changed', { from: tally.traceBefore, to: tally.traceAfter });
  return result;
}

// --- The DESK (phase 3 slice 3a, 02-map §3.10, slice-3a-plan §2.5) --------------------------------------------------------
//   report ─CONTINUE→ endShip → [final? endRun : openDesk]        lost card → endShip → [end | openDesk with its extras]
//   desk ─SET COURSE(slot)→ goTransmit(slot) → transmit (PACKET) ─◀ CHART→ desk
//                                               └ TRANSMIT ▸ → transmitNext → startShip(slot) → boot
// On the classic world the desk offers the single next ship (reachableFrom: index + 1), so the five play end to end.

// The ship is over and not the final one: every op stops, the tool is put down, both clocks stop, and the STAR CHART
// opens. `extra` is the way the ship ended's toll on the next hop (BEAM OUT +2, EMERGENCY +3 and Core −25; null after a
// LANDING REPORT), held on the map until the kid picks the hop (RunMapState.pendingExtra). No reachable ship from a
// non-final ship throws: the arm's checks 1 and 4 guarantee one.
// Slice 4 (03 §3.1–§3.2; plan §2.4–§2.5), inside the same update, before SHIP DONE's save (so a reload resumes the same
// bank and branches): a branch newly due by the map ('after-seeds', 'poor-ahead') is latched open, and at the run's first
// desk on the arm the bank is raised to FIRST_PICK_FLOOR_CYCLES (`+2 CYCLES · FIRST SKILL ON THE HOUSE :)`) while no skill
// is paid for, so the required first pick can always buy a root.
export function openDesk(store: Store<GameState>, extra: PendingExtra | null): void {
  const state = store.getState();
  if (currentShip(state).final) throw new Error('openDesk: the final ship ends the run (endRun)');
  if (!shipEnded(state)) throw new Error('openDesk: the ship has not ended (endShip first)');
  const offered = reachableFrom(state.run.map, currentSlot(state.run));
  if (offered.length === 0) throw new Error(`openDesk: no ship is reachable from slot ${currentSlot(state.run)}`);
  abortAll();
  // Read after abortAll (the review follow-up): an op aborted here may have changed what the desk opens on.
  const ui = deskUiOnOpen(store.getState());
  const opened = store.getState();
  const visit = visitNow(opened.run);
  const latch = opened.run.map.world === 'arm' ? branchToLatch(opened, visit) : null;
  const topUp = firstPickTopUp(opened);
  store.update((draft) => {
    if (latch !== null) draft.run.skills.opened.push({ skill: latch, visit });
    if (topUp > 0) draft.run.skills.grants.push({ source: 'first-pick', cycles: topUp, visit, label: null });
    draft.run.phase = 'desk';
    draft.run.map.pendingExtra = extra === null ? null : { ...extra };
    draft.run.transit = null;
    draft.run.beamOut = null;
    draft.clock.paused = true;
    Object.assign(draft.ui, ui);
    draft.ui.memoryRev++;
  });
  // SHIP DONE (02 §3.11): the archive's run in progress takes the ship's result (a run abandoned here keeps its colony), and
  // a reload resumes at this desk.
  archiveShipDone(store);
  writeRunSave(store, 'ship-done');
}

// The first-pick floor (03 §3.1): the cycles the run's first desk adds on the arm while no skill is paid for (a crashed ship
// 1 earned 1: +2). 0 elsewhere, and once the floor is met.
export function firstPickTopUp(state: Readonly<GameState>): number {
  const run = state.run;
  if (!firstPickOwed(run)) return 0;
  return Math.max(0, FIRST_PICK_FLOOR_CYCLES - bankOf(run.skills));
}

// The UI fields the desk opens with (slice 3c, out of openDesk so a resumed desk opens the same way: systems/run-save.ts):
// the tool put down, and the selection and tab. Read from the ended ship's state (the desk's or the save's).
export function deskUiOnOpen(state: Readonly<GameState>): Pick<UiState, 'activeTool' | 'pickedSourceId' | 'pendingPlacement' | 'deskSelected' | 'deskWindow'> {
  const offered = reachableFrom(state.run.map, currentSlot(state.run));
  return {
    activeTool: null,
    pickedSourceId: null,
    pendingPlacement: null,
    // One ship in reach (the classic world) is already the selection: SET COURSE is the desk's only step.
    deskSelected: offered.length === 1 ? offered[0]! : null,
    // The tab it opens on (phase 3 slice 3b: the SHIP CARD, or the REPOSITORY for the last-rm prompt; repository.ts; slice
    // 4: TRAINING at the run's first desk until the first pick is made).
    deskWindow: firstPickOwed(state.run) ? 'training' : deskWindowOnOpen(state),
  };
}

// The ship being flown has its result in the run (endShip): its own is the last one recorded.
function shipEnded(state: Readonly<GameState>): boolean {
  return state.run.ships.at(-1)?.shipId === state.level.shipId;
}

// SET COURSE ▸ (the desk's ENTER): the PACKET for the ship in `slot`. The run's first desk on the arm waits for the required
// first pick (skill-tree.ts deskBlocker; the DESK's bar says `CHOOSE YOUR FIRST SKILL` instead of the key): a SET COURSE
// before it is a bug, and throws.
export function setCourse(store: Store<GameState>, slot: number): void {
  const state = store.getState();
  const phase = state.run.phase;
  if (phase !== 'desk') throw new Error(`setCourse: not on the DESK (phase ${phase})`);
  const blocker = deskBlocker(state);
  if (blocker !== null) throw new Error(`setCourse: the desk is waiting for ${blocker} (train the first skill)`);
  goTransmit(store, slot);
}

// ◀ CHART (the PACKET's ESC): back to the desk. The drops, the pick and PACK AS are forgotten with the plan (a new
// destination deals against its own link); this desk's purchases stay pending (UNDO works until TRANSMIT ▸); the lost
// ship's extras stay on the map for whichever hop is picked.
export function backToChart(store: Store<GameState>): void {
  const phase = store.getState().run.phase;
  if (phase !== 'transmit') throw new Error(`backToChart: not on the PACKET (phase ${phase})`);
  store.update((draft) => {
    draft.run.phase = 'desk';
    draft.ui.deskSelected = draft.run.transit?.toSlot ?? draft.ui.deskSelected;
    draft.run.transit = null;
    draft.ui.memoryRev++;
  });
}

// TRANSMIT (§4.1 step 5) to the ship in `toSlot`: every op is stopped first (an op in flight at the ship's end must not
// write into the packet), the tool is put down, the hop is worked out (systems/map-hop.ts hopBetween: link, hits, ECC,
// years, the destination's room), the ladder plans the destination from the map's facts, the packet is packed against the
// hop's link with the lost ship's extras (RunMapState.pendingExtra), and the draft is dealt (§6.9: PICK ONE TO CARRY;
// seeded by the slot being left, weighted by the run's stats). Throws on a slot the unit cannot reach.
export function goTransmit(store: Store<GameState>, toSlot: number): void {
  const state = store.getState();
  if (currentShip(state).final) throw new Error('goTransmit: the final ship has no next ship (endRun)');
  if (!shipEnded(state)) throw new Error('goTransmit: the ship has not ended (endShip first)');
  const fromSlot = currentSlot(state.run);
  if (!reachable(state.run.map, fromSlot, toSlot)) throw new Error(`goTransmit: slot ${toSlot} is not reachable from slot ${fromSlot}`);
  abortAll();
  const toShipIndex = state.run.shipIndex + 1;
  const hop = hopBetween(state.run.map, fromSlot, toSlot);
  const extra = state.run.map.pendingExtra ?? { extraHits: 0, coreHit: 0, coreReset: false };
  // The ladder's verdict for the next ship, from the run's threat once this ship's tally is done (Track THREAT's endShip).
  const facts = mapFacts(state.run.map, fromSlot, toSlot, toShipIndex + 1);
  const threat = planThreat(threatInputFor(state.run.threat, facts, state.run.stats.deal !== null));
  // Phase 3 slice 3b: the deliveries that catch up at the destination ride this hop (02 §3.9; their seed chance reads the
  // verdict), packed by planPacket with the unit's files, so the plan's numbers count them from the start.
  const deliveries = deliveriesForHop(state, fromSlot, toSlot, threat);
  const packet = planPacket(store.getState().memory, { linkBlocks: hop.linkBlocks, dropped: [], pick: null, deliveries, skills: skillPacketPlan(store.getState(), {}) });
  const plan: TransitPlan = {
    toShipIndex,
    toSlot,
    hop,
    linkBlocks: hop.linkBlocks,
    filesBlocks: packet.filesBlocks,
    chargeHeld: packet.chargeHeld,
    chargeCarried: packet.chargeCarried,
    extraHits: extra.extraHits,
    coreHit: extra.coreHit,
    coreReset: extra.coreReset,
    dropped: [],
    offer: dealDraft(store.getState(), hop, deliveries),
    pick: null,
    threat,
    deliveries,
    packAs: {},
  };
  store.update((draft) => {
    draft.run.phase = 'transmit';
    draft.run.transit = plan;
    draft.run.beamOut = null;
    draft.clock.paused = true;
    draft.ui.activeTool = null;
    draft.ui.pickedSourceId = null;
    draft.ui.pendingPlacement = null;
    draft.ui.deskSelected = toSlot;
    // SET COURSE while a TRAIN bar fills stops it (review M4: no purchase lands without the bar on screen, nor after ◀
    // CHART), and the TRAINING selection is unarmed again.
    draft.ui.trainingHoldSec = null;
    draft.ui.trainingArmed = false;
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
  const ship = shipDefAt(state.run.map, plan.toSlot);
  const fromSlot = currentSlot(state.run);
  const packet = transitPacket(state, plan, newSegId);
  applyPickToPacket(packet, plan.pick);
  // The beam's hitchhikers (04 §3.4), rolled on the packet as it crosses (after the card's file is in it, before the
  // transit hits): they ride free, and land behind their targets at the boot. From the verdict, never the map's facts again.
  // Never behind a delivered file (phase 3 slice 3b): each delivery rolls its own, on its own stream (the beam's stays put).
  const delivered = packet.deliveries.flatMap((group) => group.segIds);
  const beamSeeds = rollBeamSeeds(packet, beamSourceOf(plan.threat), playsTutorial(state.run), hopRng(state.run, fromSlot, plan.toSlot, 'beam-seeds'), delivered);
  const deliverySeeds = rollDeliverySeeds(plan.deliveries, packet, hopRng(state.run, fromSlot, plan.toSlot, 'delivery-seeds'));
  packet.seeds = [...beamSeeds, ...deliverySeeds];
  const files = packedFiles(packet);
  // The arrival as the PACKET previewed it (systems/arrival-preview.ts), for the seeds the beam really rolled (the
  // deliveries' included). TRANSMIT ▸ waits while files (deliveries included) are over the link or files and the floor over
  // the room (01 §3.16; the review's B1 and the follow-up M2): a send that gets here over either is a bug, not a squeeze.
  const preview = unitArrival(state, {
    hop: plan.hop, threat: plan.threat, dropped: plan.dropped, pick: plan.pick, deliveries: plan.deliveries, packAs: plan.packAs,
  }, packet.seeds.length);
  const fit = preview.fit;
  if (fit.overLink > 0) throw new Error(`transmitNext: ${fit.files} blocks of files are ${fit.overLink} over the link of ${fit.link}`);
  if (fit.over > 0) throw new Error(`transmitNext: ${fit.files} blocks of files and a floor of ${fit.floor} are ${fit.over} over ${ship.name}'s room of ${fit.room}`);
  const hits: TransitHit[] = [];
  if (plan.coreHit > 0 || plan.coreReset) {
    const toll = emergencyCoreToll(files, plan.coreHit, plan.coreReset);
    if (toll) hits.push(toll);
  }
  // ECC repairs hits while the unit sleeps (02 §3.3), counted after the extra ones (BEAM OUT, EMERGENCY): none on the classic
  // world (no slack).
  const landing = hitsLanding(plan.hop, plan.extraHits);
  hits.push(...rollTransitHits(files, landing, hopRng(state.run, fromSlot, plan.toSlot, 'transit')));
  const cardCharge = pickCharge(plan.pick);
  const charge = arrivalCharge(packet.chargeCarried, state.run.pendingStarCredit, cardCharge, plan.hop.chargeFloor);
  const layout = layoutCarried(packet, charge.blocks, ship, plan.threat, hollowLabel(state.run));
  // Every arrival number the kid read must be the one that happens (the review's M1): the charge laid out and lost.
  if (charge.blocks !== fit.wanted || layout.chargeBlocks !== fit.chargeArrives || layout.overflowLost !== fit.wanted - fit.chargeArrives) {
    throw new Error(`transmitNext: the PACKET previewed ${fit.chargeArrives} of ${fit.wanted} charge arriving, the layout put ${layout.chargeBlocks} of ${charge.blocks}`);
  }
  const scripted = arrivalDamage(layout.racks.segs, ship.arrivalDamage);
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
    eccCorrected: plan.hop.transitHits + plan.extraHits - landing,
    // The root lands in the slot as the ship is built (createShipSlices, from the verdict's rootBlocks).
    seeds: layout.seeds,
    boarded: boardedBy(plan.threat),
    deliveries: arrivalDeliveries(plan.deliveries, packet.deliveries, deliverySeeds.map((seed) => seed.targetId)),
    // Slice 4 (plan §2.14): the skill files as laid out, and how each came (the boot's TRAINED / RETRAINED lines).
    skills: arrivalSkills(state, packet, layout.racks.segs),
  };
  // The tool kinds this send brought for the first time (run.licences: "the kinds that have reached the unit", plan §2.2).
  const firstKinds = plan.deliveries.filter((chip) => chip.firstOfKind).map((chip) => repoToolKind(chip.file))
    .filter((kind): kind is NonNullable<typeof kind> => kind !== null);
  store.update((draft) => {
    // The card goes with the unit: the run remembers it (the Skills window lists it, THREAD+ is owned by it). +2 CYCLES is
    // spent at a desk, never carried: commitTraining records it as a grant.
    if (plan.pick !== null && plan.pick !== 'cycles') draft.run.upgrades.push(plan.pick);
    // Phase 3 slice 3b: the requests move on (delivered, waiting, lost, forwarded; the pick becomes a request).
    draft.run.repo = advanceRequests(draft.run.repo, plan, draft.run.map);
    for (const kind of firstKinds) if (!draft.run.licences.includes(kind)) draft.run.licences.push(kind);
  });
  // Slice 4: this desk's purchases are bought as the packet crosses, before the ship starts, so the BEAM save holds none
  // pending (the codec refuses one).
  commitTraining(store);
  startShip(store, plan.toSlot, layout.racks, arrival, plan.threat, plan.hop);
}

// The skill files as they crossed (ArrivalReport.skills; plan §2.14), from the layout (after the hits: a file's level never
// changes on the way): a fresh file is 'restored' when every purchase behind it at this desk was a RESTORE, else 'trained';
// a copy packed lower is 'packed'; every other skill file was 'carried'. `state` is the desk's (its pending purchases).
export function arrivalSkills(state: Readonly<GameState>, packet: Readonly<Packet>, segs: readonly Readonly<Segment>[]): ArrivalSkill[] {
  return segs.filter(isSkillFile).map((seg): ArrivalSkill => {
    const how = packet.skills.find((entry) => entry.segId === seg.id)?.how ?? null;
    const purchases = state.run.skills.pending.filter((purchase) => purchase.skill === seg.upgrade);
    const kind: ArrivalSkill['kind'] = how === 'packed' ? 'packed'
      : how === 'fresh' ? (purchases.every((purchase) => purchase.kind === 'restore') ? 'restored' : 'trained')
        : 'carried';
    return { segId: seg.id, skill: seg.upgrade, level: { version: seg.version, lock: seg.lock }, kind };
  });
}

// The deliveries as they crossed (ArrivalReport.deliveries; plan §2.3 step 4.6): each chip not sent on with the ids of the
// files it laid out and whether a seed rode behind it. The REPAIR v2 patch comes first (the slice-3b foundation review: it
// installs at the first delivery line, right after REPAIR's renewal, and is never folded into the boot's last line), then
// the rest oldest first, as the chips are.
export function arrivalDeliveries(
  chips: readonly DeliveryChip[], packed: Readonly<Packet>['deliveries'], seededIds: readonly string[],
): ArrivalDelivery[] {
  const deliveries = chips.filter((chip) => !chip.sendOn).map((chip): ArrivalDelivery => {
    const group = packed.find((entry) => entry.key === chip.key);
    if (group === undefined) throw new Error(`transmitNext: delivery ${chip.key} is not in the packet`);
    return {
      key: chip.key, file: chip.file, segIds: [...group.segIds], arrivedYear: chip.arrivedYear, firstOfKind: chip.firstOfKind,
      seeded: group.segIds.some((id) => seededIds.includes(id)),
    };
  });
  return [...deliveries.filter((delivery) => delivery.file === 'repair-v2'), ...deliveries.filter((delivery) => delivery.file !== 'repair-v2')];
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
// Slice 3c (02 §3.11, one step): the archive's record, the world update (run.next) and the run save's deletion together.
// Never half-ended (review fix, minor 2): the world update has its own fallback (meta.ts archiveRunEnded), and should the
// record still throw (a bug), the run save is cleared and RUN END opens all the same before the error goes on up, loudly.
export function endRun(store: Store<GameState>, cause: RunEndCause): void {
  abortAll();
  try {
    archiveRunEnded(store, cause);
  } finally {
    clearRunSave(store);
    store.update((draft) => {
      draft.run.phase = 'end';
      draft.run.endCause = cause;
      draft.run.beamOut = null;
      draft.run.transit = null;
      draft.clock.paused = true;
      draft.ui.activeTool = null;
    });
  }
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
  if (currentShip(state).final) endRun(store, finaleRunCause(store.getState()));
  else openDesk(store, null);
}

// The LOST card's button (see the header and lossPlan).
export function continueAfterLoss(store: Store<GameState>): LossPlan {
  const state = store.getState();
  const plan = lossPlan(state);
  if (plan.kind === 'simulation') {
    const run: RunState = {
      ...state.run,
      shipIndex: 0,
      map: mapAtFirstShip(state.run.map),
      // A fresh unit meets ship 1 (its written racks E–F): the licences go with the old memory. HOLLOW is
      // unnamed again (the simulation is run 1's: no ghost has named it; it names itself on the ship it boards, VESPER).
      licences: ['scan'],
      hollowNamed: false,
      // The simulation is run 1's ship 1 again: a ghost (never at ship 1) has nothing to have said yet.
      ghostSpoken: false,
      simulationRetryUsed: true,
      arrival: null,
      transit: null,
      // Ship 1 again, as the run began it (nothing can have reported home on a calm ship).
      threat: nominalRunThreat(0),
    };
    resetWorldForShip(store, { phase: 'boot', run, carried: null, threat: nominalShipThreat(0), freshLog: false, done: doneForNextShip(state) });
    say('control', LINES.simulation(), { critical: true });
    // RUN START again (02 §3.11): ship 1 again, as the run began it.
    writeRunSave(store, 'run-start', { carried: null, threat: nominalShipThreat(0) });
    return plan;
  }
  endShip(store, plan.outcome);
  if (plan.kind === 'end') endRun(store, plan.cause);
  else openDesk(store, { extraHits: plan.extraHits, coreHit: plan.coreHit, coreReset: plan.coreReset });
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
    // The ARRIVAL stage's scripted bite happens to every kid (WP12 p3, WP8 verify): only the bites HOLLOW chose count, so the draft's
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
  // Slice 4 (plan §2.7): the skills' effective versions, watched after every tick ('skill-version': the stamps, the sweep).
  const offSkillWatch = mountSkillWatch(store);
  return () => {
    offSkillWatch();
    offs.forEach((off) => off());
    offGame();
    offPost();
    offReset();
    mounted = false;
  };
}
