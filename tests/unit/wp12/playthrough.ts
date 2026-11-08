// WP12 spec item 1: the playthrough harness. Plays whole runs of run 1's arm headless (Track RETIRE: the classic five are
// retired; title → ARES-VII → HALCYON → KESTREL → VESPER → CORMORANT → LAST LIGHT → RUN END, 02 §3.14's worked route, or
// PT_ROUTE; at each DESK the kid trains its Player.buys, requests what ARRIVAL CONTROL tags and sets course on), on the real DOM-free systems (harness11: every system main.ts mounts that has no
// DOM), with one of three scripted kids:
// • COMPETENT: the guidance follower (0.4 s reaction, no timing noise); in the MIND it repairs infected souls first and
//   then its own files, builds 4-block WALLs with MOVE (onto a spot the MOVE preview calls SAFE), DELETEs seeds that can
//   bite, SWAPs on VESPER (the pip lesson), blocks telegraphed verbs 0.8 s into their countdown, DELETEs the root in the
//   duel, heals a Core worn below 80 by the crossings, places a carried FIREWALL, repairs a hurt cluster when the strip's
//   triage line names it (`C09 IS HURT — REPAIR it before it prints`); it corrects early on KESTREL (the
//   strip's dodge line); it picks REPAIR v2, else FIREWALL, else the first card; it presses [B] whenever AUTOBURN is
//   offered. On even seeds it plays for MERGE (saves charge: heals the Core only back to its two threads, MERGE when
//   it can pay); on odd seeds it PURGEs (full-run's split, so MERGE availability is measured on both).
// • SLOPPY: the same follower with a 1.2 s reaction and ±5 tactical s of noise on when each burn starts (a burn the
//   strip counts down to can start up to 5 tac s early, any burn up to 5 tac s late; it lets go on RELEASE); it
//   REPAIRs an infected cluster or file only once the infection has eaten past 50% (integrity under 50); it never
//   builds WALLs (no MOVE at all), never dodges (it ignores the strip's dodge countdown and its KEEP HOLDING — dodge
//   line), never SWAPs. What the spec does not list for SLOPPY it does only when the strip asks for it in so many words,
//   with its 1.2 s reaction (the follower part of "the follower with …"): the ENGINE I/O lesson and a dead engine, a
//   blind sensor, SCAN STASIS, VESPER's `COPY your Repair`, DELETE a seed, block a verb, DELETE the root, ACCEPT ORBIT,
//   BEAM OUT, a stuck burst's `tap [SPACE]`. It does not use AUTOBURN, heal a worn Core, repair a hurt (uninfected)
//   cluster or place a FIREWALL, takes the first card dealt, lets THE DEAL time out and PURGEs.
// Both kids follow the strip's lessons that name an action (COMPETENT as the guidance follower): VESPER's COPY of
// Repair, and `tap [SPACE]` when a dead Thrust Ctrl's burst sticks.
// • LITERAL (not one of the design's two; the lead's note of 01:35): the strip-literal kid WP11's MERGE fix relies on,
//   measured for MERGE's availability (see LITERAL below).
//
// Time in each mode (OVERCLOCK, §3.2): both kids act in the screen the action needs. A burn, a preset and ACCEPT /
// BEAM OUT need the SHIP; a tool needs the MIND. The kid TABs (after its reaction) when the strip or its own plan
// needs the other screen; in the MIND it stays while one of its ops runs and returns to the SHIP once it has had
// nothing to do for MIND_IDLE_RETURN_SEC. SKIP ([F]) and AUTOBURN ([B]) work from both screens, as in the game. While
// the kid is in the MIND at TACTICAL, pace.ts runs the world at a quarter speed (clock.overclock), which is what the
// wall time then measures. Wall time also counts the screens between ships at a kid's reading speed (title, LOST card,
// WAKE REPORT, TRANSMIT); the boot plays in full.
//
// Usage (one harness per process: the systems are module singletons):
//   PT_PLAYER=COMPETENT|SLOPPY|LITERAL PT_FROM=1 PT_TO=200 tsx --tsconfig tsconfig.json tests/unit/wp12/playthrough.ts
// prints one `RECORD {json}` line per seed (playthrough.test.ts runs shards of it in parallel and judges them).
import { createHarness11, type Harness11, type DefendOpts } from '../wp11/harness11';
import { receiveTransmission } from '@systems/boot';
import { shipLost, startBeamOut, startRun, setCourse, continueAfterReport, continueAfterLoss } from '@systems/run';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { currentShip, currentSlot } from '@systems/map-run';
import { deskCandidates } from '@systems/desk';
import { treeCells, visitNow, firstPickOwed } from '@systems/skill-tree';
import { trainCell } from '@systems/training';
import { WORKED_ROUTE } from '@systems/arm-fixture';
import { fitPacket } from '../map/repo-fixture';
import { setRequest, recommendation } from '@systems/repository';
import { runEndModel } from '@systems/run-end';
import { runScore } from '@systems/run-score';
import { autoburnAvailable } from '@systems/autoburn';
import { getPrediction, getSensedPrediction, burnKey } from '@systems/predict';
import { knownHitRacks } from '@systems/zones';
import { setMode } from '@systems/mode';
import { acceptOrbit } from '@systems/flight-controls';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { pickCard } from '@systems/draft';
import { transmitNext } from '@systems/run';

import { getOps, getOpsBySeg, canStartOp } from '@systems/ops-core';
import {
  exposedDrivers, threateningSeeds, theRoot, rootDeleteRunning, hollowReach,
} from '@systems/hollow';
import { reachMarks, firewallFits } from '@systems/hollow-hud';
import { movePreview, safestSpot } from '@systems/move-preview';
import { capabilitiesNow } from '@systems/capabilities';
import { childRng } from '@systems/rng';
import { actionRepair, actionScan, actionDelete, actionMove, actionCopy } from '@state/actions';
import {
  getByRole, isInfected, isRepairable, integrityBand, chargeLeft, isHollow, isFirewall,
  hasIntegrity, isUsableTool,
} from '@state/selectors';
import { isBusy } from '@systems/tool-targets';
import { podCode } from '@data/landing-text';
import { BAND_OK_MIN, MERGE_COST_CHARGE } from '@data/tuning';
import type { GameState, ObjectiveLine, PendingPlacement, ShipOutcome } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { UpgradeId } from '@data/upgrades';
import type { SkillId, SkillVersion } from '@/types/skill';
import { chooseEnding, finaleAtStep1 } from '../support/finale';

export type PlayerId = 'COMPETENT' | 'SLOPPY' | 'LITERAL';

export interface Player {
  id: PlayerId;
  // Wall seconds from a change (a new strip line, something to do in the MIND) to the kid acting on it.
  reactionSec: number;
  // ± tactical seconds of noise on when each burn starts (0: none), drawn uniformly per burn.
  burnNoiseTac: number;
  // COMPETENT's MIND (harness11's defend11 and the extras below); false: the strip-asked MIND (SLOPPY, LITERAL).
  competentMind: boolean;
  // LITERAL (the lead's note of 01:35): in the strip-asked MIND it REPAIRs whatever the strip asks to repair, at once,
  // hurt clusters too; it MOVEs a cluster (onto a SAFE spot) only on `MOVE … behind a WALL — it is bitten every time`,
  // places a FIREWALL and SWAPs when the strip asks. SLOPPY does none of these.
  literalMind: boolean;
  // Plays for MERGE on even seeds (MERGE at the choice when it can pay).
  mergeOnEven: boolean;
  // SLOPPY repairs an infected cluster or file only below this integrity.
  repairInfectedBelow: number;
  ignoresDodge: boolean;
  ignoresSwap: boolean;
  usesAutoburn: boolean;
  // What the kid trains at the DESK (slice 4's tree, Track RETIRE): the first desk's required pick, then at every desk the
  // first cell of this list the tree would sell (treeCells' refusal null), again and again until none is (an empty list:
  // only the required pick).
  firstPick: SkillId;
  buys: readonly (readonly [SkillId, SkillVersion])[];
  // Reading time on the screens between flights (wall s).
  titleSec: number;
  lostCardSec: number;
  reportSec: number;
  transmitSec: number;
}

export const COMPETENT: Player = {
  id: 'COMPETENT', reactionSec: 0.4, burnNoiseTac: 0, competentMind: true, literalMind: false, mergeOnEven: true, repairInfectedBelow: Infinity,
  ignoresDodge: false, ignoresSwap: false, usesAutoburn: true,
  firstPick: 'autoburn', buys: [['autoburn', 2], ['autodrop', 1], ['sentry', 1], ['autoburn', 3], ['autodrop', 2], ['sentry', 2], ['autodrop', 3], ['sentry', 3]],
  titleSec: 6, lostCardSec: 6, reportSec: 15, transmitSec: 12,
};

export const SLOPPY: Player = {
  id: 'SLOPPY', reactionSec: 1.2, burnNoiseTac: 5, competentMind: false, literalMind: false, mergeOnEven: false, repairInfectedBelow: 50,
  ignoresDodge: true, ignoresSwap: true, usesAutoburn: false,
  firstPick: 'autoburn', buys: [],
  titleSec: 4, lostCardSec: 4, reportSec: 5, transmitSec: 6,
};

// The strip-literal kid WP11's MERGE fix relies on (the lead's note for WP12 part 1, 01:35): COMPETENT's flight (the
// guidance follower, 0.4 s, [B] when the strip offers AUTOBURN), and in the MIND only what the strip asks, with the same
// reaction: every REPAIR it names (souls, files, the Core, a hurt cluster), DELETE a seed, block a verb, COPY Repair,
// SWAP by the pip lesson, place a FIREWALL, DELETE the root, and a MOVE behind a WALL only when the strip says the
// cluster `is bitten every time`. It takes the first card, lets THE DEAL time out, and on even seeds MERGEs when it can
// pay. It is a measurement of MERGE's availability, not one of the design's two players.
export const LITERAL: Player = {
  id: 'LITERAL', reactionSec: 0.4, burnNoiseTac: 0, competentMind: false, literalMind: true, mergeOnEven: true, repairInfectedBelow: Infinity,
  ignoresDodge: false, ignoresSwap: false, usesAutoburn: true,
  firstPick: 'autoburn', buys: [['autoburn', 2], ['autodrop', 1], ['sentry', 1], ['autoburn', 3], ['autodrop', 2], ['sentry', 2], ['autodrop', 3], ['sentry', 3]],
  titleSec: 6, lostCardSec: 6, reportSec: 15, transmitSec: 12,
};

// The route the kids fly on run 1's arm (Track RETIRE: the classic five are gone): PT_ROUTE (slots, comma-separated, from
// slot 0), else 02 §3.14's worked route [0, 2, 5, 11, 15, 19]. At each desk the kid sets course to the route's next stop;
// one it cannot reach from where it is (the route given is not one) is a stuck run.
export const PT_ROUTE: readonly number[] = process.env.PT_ROUTE === undefined
  ? WORKED_ROUTE : process.env.PT_ROUTE.split(',').map((slot) => Number(slot));
if (PT_ROUTE[0] !== 0 || PT_ROUTE.some((slot) => !Number.isInteger(slot))) throw new Error(`PT_ROUTE=${process.env.PT_ROUTE} is not a route from slot 0`);

export function playerById(id: string): Player {
  if (id === 'COMPETENT') return COMPETENT;
  if (id === 'SLOPPY') return SLOPPY;
  if (id === 'LITERAL') return LITERAL;
  throw new Error(`playthrough: no player '${id}' (COMPETENT, SLOPPY or LITERAL)`);
}

// In the MIND with nothing to do and no op of its own running, the kid looks back at the ship after this long.
const MIND_IDLE_RETURN_SEC = 2;
// ...and does not jack in again for something it only wanted to do on its own (a WALL, a worn Core) for this long,
// so a plan with no SAFE spot does not keep it flicking between screens.
const PROACTIVE_COOLDOWN_SEC = 6;
// A flight longer than this (wall s) is a stuck ship: recorded as such, never quietly cut.
const SHIP_MAX_WALL_SEC = 1800;
const PRINT_MAX_WALL_SEC = 900;
// The strip's lines the SLOPPY kid ignores: the dodge (never dodges) and the SWAP lesson (never swaps).
// (Line ids carry a -hold / -press suffix from guidance's fixWith; the late dodge line is followed.)
const isDodgeLine = (id: string): boolean => (id.startsWith('F8-debris') && !id.startsWith('F8-debris-late'))
  || id.startsWith('F6-dodge') || id.startsWith('F6-resume');
const isSwapLine = (id: string): boolean => id.startsWith('tut-ghost-pip') || id.startsWith('tut-ghost-swap') || id.startsWith('F2-nocontroller-swap');
// The engine lesson's lines and a dead engine: the strip asks for ENGINE I/O's repair in so many words.
const ENGINE_LINE_IDS: ReadonlySet<string> = new Set(['tut-engine-weak', 'tut-repair-engine', 'tut-engine-weak-known', 'F2-dead']);
const LOST_OUTCOMES: ReadonlySet<ShipOutcome> = new Set<ShipOutcome>(['stranded', 'escaped', 'crashed', 'abandoned', 'emergency']);

export interface ShipRecord {
  ship: string;
  outcome: ShipOutcome;
  woke: number;
  half: number;
  lost: number;
  stars: number;
  fuelPct: number;
  wallSec: number;      // boot to the end of its screens
  // Diagnostics: REPAIR CHARGE and the Core at the flight's first tick and at the ship's end; the unit's own files
  // HOLLOW ate on this ship; whether a working Repair was left at the end.
  chargeIn: number;
  coreIn: number;
  chargeOut: number;
  coreOut: number;
  filesEaten: number;
  repairLeft: boolean;
  // Where the unit's Repair copies were eaten on this ship (flight / printing), in order.
  repairEaten: string[];
}

export interface RunRecord {
  player: PlayerId;
  seed: number;
  cause: string;        // RUN END's cause, or `stuck:<where>`
  completed: boolean;   // reached RUN END through every ship of the route (soft fails allowed; not OVERWRITTEN / STAYED / stuck)
  woke: number;         // heads (the lead's rule)
  score: number;        // §4.4: missing memories count half
  souls: number;        // the route's colonists (the worked route's 11,000)
  phaseSec: Record<string, number>;  // wall s per phase (title, boot, flight, lost card, printing, report, transmit)
  ships: ShipRecord[];
  shipsLost: number;    // soft-failed ships (stranded, escaped, crashed, abandoned, emergency)
  simulationRetries: number;
  coreLost: number;     // ships whose Core HOLLOW ate (EMERGENCY / OVERWRITTEN)
  coreMin: number;      // the lowest Core integrity seen in the run
  wallSec: number;
  mindSec: number;      // wall s in the MIND during flights and printing
  overclockSec: number; // wall s with the world at OVERCLOCK's quarter speed
  tacticalSec: number;
  skipSec: number;
  chargeAtChoice: number | null;
  verbs: { telegraphed: number; landed: number; blocked: number } | null;
  lastLightLost: number | null;  // clusters lost on LAST LIGHT
  playedFor: 'merge' | 'purge';
  // Ops the kid finished, by kind (repair, move, copy, delete, scan, swap), over the run.
  opsDone: Record<string, number>;
  // What the kid trained at the desks, in order (`autoburn v1@1`: the skill, the version, the visit), and the route flown.
  bought: string[];
  route: number[];
}

// PT_TRACE=1: every strip line and every kid action, with the wall clock, FUEL and pace (for reading one run).
const TRACE = process.env.PT_TRACE === '1';

export function playRun(harness: Harness11, seed: number, player: Player): RunRecord {
  const state = (): Readonly<GameState> => harness.store.getState();
  const trace = (what: string): void => {
    if (!TRACE) return;
    const now = state();
    console.log(`  ${harness.wall().toFixed(2).padStart(8)} ${now.level.shipName.padEnd(10)} ${now.ui.mode === 'memory' ? 'MIND' : 'SHIP'} `
      + `${now.clock.pace.padEnd(8)} fuel ${now.burn.fuelPct.toFixed(1).padStart(5)} | ${what}`);
  };
  // The kid's own noise, drawn from its own seeded stream so a seed replays exactly (the game's streams are untouched).
  const noiseRng = childRng(seed, 99, `kid-${player.id}`);
  const noise = (): number => (player.burnNoiseTac === 0 ? 0 : (noiseRng() * 2 - 1) * player.burnNoiseTac);
  const playedFor: 'merge' | 'purge' = seed % 2 === 0 ? 'merge' : 'purge';
  const defendOpts: DefendOpts = player.competentMind && playedFor === 'merge' ? { coreHealBelow: 50, coreHealTo: 60 } : {};

  const record: RunRecord = {
    player: player.id, seed, cause: '', completed: false, woke: 0, score: 0, souls: 0, phaseSec: {},
    ships: [], shipsLost: 0, simulationRetries: 0, coreLost: 0, coreMin: 100, wallSec: 0, mindSec: 0, overclockSec: 0,
    tacticalSec: 0, skipSec: 0, chargeAtChoice: null, verbs: null, lastLightLost: null, playedFor, opsDone: {}, bought: [], route: [],
  };

  // Per ship (index = the ships already ended), filled as the run goes.
  const diag: { chargeIn: number; coreIn: number; chargeOut: number; coreOut: number; filesEaten: number; repairLeft: boolean; repairEaten: string[] }[] = [];
  const coreNow = (): number => {
    const core = state().memory.find((seg) => seg.type === 'core');
    return core && hasIntegrity(core) ? Math.round(core.integrity) : 0;
  };
  const diagNow = () => {
    const index = state().run.ships.length;
    while (diag.length <= index) diag.push({ chargeIn: -1, coreIn: -1, chargeOut: -1, coreOut: -1, filesEaten: 0, repairLeft: false, repairEaten: [] });
    return diag[index]!;
  };

  // --- stepping, with the time accounts -----------------------------------------------------------------------
  const TRACED_EVENTS = new Set(['hollow-infect', 'hollow-consume', 'seed-landed', 'verb-landed', 'verb-blocked', 'core-lost',
    'zone-hit', 'arrival-hits', 'op-done', 'ghost-start', 'deal', 'licence', 'locked', 'accepted', 'stranded', 'crashed', 'escaped']);
  let eventsSeen = harness.events.length;
  const nameOf = (segId: unknown): string => state().memory.find((seg) => seg.id === segId)?.name ?? String(segId);
  const step = (): void => {
    if (TRACE) {
      for (const event of harness.events.slice(eventsSeen)) {
        if (!TRACED_EVENTS.has(event.name)) continue;
        const payload = event.payload as Record<string, unknown>;
        const what = 'segId' in payload ? ` ${nameOf(payload.segId)}` : 'targetId' in payload ? ` ${nameOf(payload.targetId)}` : '';
        const core = state().memory.find((seg) => seg.type === 'core');
        trace(`event ${event.name}${what} ${JSON.stringify(payload).slice(0, 120)} · charge ${chargeLeft(state())} core ${core && hasIntegrity(core) ? core.integrity.toFixed(0) : '-'}`);
      }
    }
    for (const event of harness.events.slice(eventsSeen)) {
      if (event.name === 'hollow-consume' && (event.payload as { soul: boolean }).soul === false) {
        diagNow().filesEaten++;
        const ate = (event.payload as { ate: string }).ate;
        if (ate.startsWith('Repair')) diagNow().repairEaten.push(`${ate}@${state().run.phase}`);
      }
      if (event.name === 'op-done') {
        const kind = (event.payload as { kind: string }).kind;
        record.opsDone[kind] = (record.opsDone[kind] ?? 0) + 1;
      }
    }
    eventsSeen = harness.events.length;
    if (state().run.phase === 'flight' && diagNow().chargeIn < 0) { diagNow().chargeIn = chargeLeft(state()); diagNow().coreIn = coreNow(); }
    const phaseKey = shipLost(state()) ? 'lost' : state().run.phase;
    harness.step();
    const now = state();
    const tickSec = 0.05;
    record.phaseSec[phaseKey] = (record.phaseSec[phaseKey] ?? 0) + tickSec;
    if ((now.run.phase === 'flight' || now.run.phase === 'landing') && !now.clock.paused) {
      if (now.ui.mode === 'memory') record.mindSec += tickSec;
      if (now.clock.overclock) record.overclockSec += tickSec;
      if (now.clock.pace === 'tactical') record.tacticalSec += tickSec;
      if (now.clock.pace === 'skip') record.skipSec += tickSec;
    }
    const core = now.memory.find((seg) => seg.type === 'core');
    if (core && hasIntegrity(core)) record.coreMin = Math.min(record.coreMin, core.integrity);
  };
  const stepFor = (wallSec: number): void => {
    const end = harness.wall() + wallSec;
    while (harness.wall() < end - 1e-9) step();
  };

  // --- the screens ---------------------------------------------------------------------------------------------
  const toShip = (): void => { if (state().ui.mode !== 'tools') { setMode(harness.store, 'tools'); trace('TAB → SHIP'); } };
  const toMind = (): void => { if (state().ui.mode !== 'memory') { setMode(harness.store, 'memory'); trace('TAB → MIND'); } };

  // --- the MIND: what the kid wants to do there (a reason), and doing it ----------------------------------------
  const seen = new Map<string, number>();   // trigger → wall s first seen (the kid's reaction to each)
  const reacted = (key: string, active: boolean): boolean => {
    if (!active) { seen.delete(key); return false; }
    if (!seen.has(key)) seen.set(key, harness.wall());
    return harness.wall() - seen.get(key)! >= player.reactionSec;
  };
  const shownId = (): string => state().director.shown?.id ?? '';

  // COMPETENT: a carried FIREWALL that holds nothing, with a red GAP it fits: MOVE it there so it seals that side.
  const firewallSpot = (): { seg: Segment; spot: PendingPlacement } | null => {
    const now = state();
    if (!now.run.licences.includes('move') || now.hollow.phase === 'dormant') return null;
    const marks = reachMarks(now);
    if (!firewallFits(marks)) return null;
    const holding = new Set(marks.shields.map((shield) => shield.firewallId));
    const firewall = now.memory.find((seg) => isFirewall(seg) && !holding.has(seg.id) && getOpsBySeg(seg.id).length === 0);
    if (!firewall) return null;
    for (const gap of marks.gaps) {
      if (gap.kind !== 'gap') continue;
      for (const regionId of gap.segIds) {
        const region = now.memory.find((seg) => seg.id === regionId);
        if (!region || region.type !== 'free' || region.reservedBy !== undefined || region.size < firewall.size) continue;
        for (let col = 0; col + firewall.size <= region.size; col++) {
          const spot: PendingPlacement = { regionSegIds: [region.id], col };
          const preview = movePreview(now, firewall, spot, knownHitRacks(now, getSensedPrediction()));
          if (preview !== null && preview.seals) return { seg: firewall, spot };
        }
      }
    }
    return null;
  };

  // VESPER's lesson (`UNIT-046 IS HUNTING YOUR TOOLS — COPY your Repair`): both kids follow it, as the strip asks in so
  // many words. The copy goes where a kid puts a spare: the middle of the biggest empty space (rack D), walls of free
  // blocks on both sides, so a seed that comes for it there eats nothing else.
  const copyAsk = (): boolean => shownId().startsWith('tut-copy-repair') && state().run.licences.includes('copy');
  const copyRepair = (): boolean => {
    const now = state();
    const repair = now.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair' && isUsableTool(seg) && getOpsBySeg(seg.id).length === 0);
    if (!repair || !canStartOp()) return false;
    let biggest: Segment | null = null;
    for (const seg of now.memory) {
      if (seg.type === 'free' && seg.reservedBy === undefined && (biggest === null || seg.size > biggest.size)) biggest = seg;
    }
    if (biggest === null || biggest.size < repair.size) return false;
    return actionCopy(harness.store, repair, { regionSegIds: [biggest.id], col: Math.floor((biggest.size - repair.size) / 2) }) === null;
  };


  // What COMPETENT's MIND has to do now (null: nothing). Urgent reasons come from an alarm the kid can see; proactive
  // ones are its own plan (a WALL, a worn Core, a FIREWALL).
  const competentWork = (): { reason: string; urgent: boolean } | null => {
    const now = state();
    if (now.clock.paused) return null;
    if (copyAsk()) return { reason: 'copy', urgent: true };
    // VESPER's ghost lesson: the THRUST CTRL pip, then SWAP (defend10's pipSwap does the pip's jump and comes back). The
    // lesson is a SHIP line, so without this reason the kid swapped only when it happened to be in the MIND already.
    if (shownId().startsWith('tut-ghost-pip') || shownId().startsWith('tut-ghost-swap')) return { reason: 'swap', urgent: true };
    if (!now.run.licences.includes('repair')) return null;
    if (hurtAsked().length > 0) return { reason: 'hurt', urgent: true };
    if (now.hollow.verb !== null) return { reason: 'verb', urgent: true };
    if (now.hollow.finale.phase === 'duel' && !rootDeleteRunning(now)) return { reason: 'root', urgent: true };
    const idle = (seg: Segment): boolean => getOpsBySeg(seg.id).length === 0;
    if (now.memory.some((seg) => isInfected(seg) && (seg.type === 'driver' || isRepairable(seg)) && idle(seg))) return { reason: 'infected', urgent: true };
    if (now.run.licences.includes('delete') && threateningSeeds(now.memory, now.clock.aiSec).some(idle)) return { reason: 'seed', urgent: true };
    if (capabilitiesNow(now).plot.mode === 'uncertain') {
      const sensor = getByRole(now, 'sensor');
      if (sensor && idle(sensor)) return { reason: 'sensor', urgent: true };
    }
    const engine = getByRole(now, 'engine-io');
    if (engine && hasIntegrity(engine) && integrityBand(engine.integrity) !== 'ok' && engine.integrity < BAND_OK_MIN && idle(engine)) {
      return { reason: 'engine', urgent: true };
    }
    const core = now.memory.find((seg) => seg.type === 'core');
    if (core && hasIntegrity(core) && core.integrity < (defendOpts.coreHealBelow ?? BAND_OK_MIN) && idle(core)) return { reason: 'core', urgent: false };
    if (now.run.licences.includes('move') && now.hollow.phase === 'awake' && exposedDrivers(now).length > 0) return { reason: 'wall', urgent: false };
    if (firewallSpot() !== null) return { reason: 'firewall', urgent: false };
    if (now.run.licences.includes('delete') && core) {
      const biting = hollowReach(now.memory, now.clock.aiSec).some((reach) => reach.neighbourId === core.id
        && (reach.verdict === 'bite' || reach.verdict === 'infected' || reach.verdict === 'recoiling'));
      if (biting) return { reason: 'core-cut', urgent: true };
    }
    return null;
  };

  // The hurt driver's lesson (`POD 02 WILL LAND HARD — REPAIR its driver`, DRIVER_RULES' tut-hurt-driver*): the drivers
  // the line names.
  const hurtAsked = (): Segment[] => {
    const line = state().director.shown;
    if (!line || !line.id.startsWith('tut-hurt-driver')) return [];
    return namedIn(line.text, state().memory.filter((seg) => seg.type === 'driver' && getOpsBySeg(seg.id).length === 0));
  };

  const competentAct = (): boolean => {
    let acted = false;
    for (const seg of hurtAsked()) if (canStartOp() && actionRepair(harness.store, seg) === null) acted = true;
    if (harness.defend11(defendOpts)) acted = true;
    if (copyAsk() && copyRepair()) acted = true;
    const placing = firewallSpot();
    if (placing && canStartOp() && actionMove(harness.store, placing.seg, placing.spot) === null) acted = true;
    const deal = state().hollow.deal;
    if (deal.phase === 'offered' && deal.entryId !== null) { pickChoice(deal.entryId, DEAL_REFUSE); acted = true; }
    return acted;
  };

  // A SAFE spot for `seg` (the MOVE preview: HOLLOW can't reach it there and it bridges nothing to rack E), at either end
  // of an open free region, the one farthest from HOLLOW: where a kid reading the preview puts it (harness11's rule).
  // Final fix pass: the rule is the game's own now (move-preview.ts safestSpot: the strip's bitten-again ask names its
  // rack), and it skips a spot the preview says a hazard zone will hit (`⚠ BELT HITS RACK A`).
  const safeSpot = (seg: Segment): PendingPlacement | null => {
    const now = state();
    return safestSpot(now, seg, knownHitRacks(now, getSensedPrediction()));
  };
  // The file or cluster a strip line names: a cluster by its code (`C13`), a file by its name in capitals.
  const namedIn = (text: string, candidates: readonly Segment[]): Segment[] => candidates.filter((seg) => {
    if (seg.type === 'driver') return text.includes(podCode(seg.pod));
    return text.includes(seg.name.toUpperCase());
  });

  // The strip-asked MIND (SLOPPY and LITERAL): what the strip asks in so many words, and SLOPPY's late repair.
  const stripTasks = (): { reason: string; run: () => boolean }[] => {
    const now = state();
    if (now.clock.paused) return [];
    const tasks: { reason: string; run: () => boolean }[] = [];
    const idle = (seg: Segment): boolean => getOpsBySeg(seg.id).length === 0;
    const line = now.director.shown;
    const id = line?.id ?? '';
    const text = line?.text ?? '';
    const repair = (seg: Segment) => (): boolean => canStartOp() && actionRepair(harness.store, seg) === null;
    if (id === 'reveal-look') tasks.push({ reason: 'colonists', run: () => false });
    if (copyAsk()) tasks.push({ reason: 'copy', run: copyRepair });
    if (!now.run.licences.includes('repair')) return tasks;
    const infected = now.memory.filter((seg) => isInfected(seg) && (seg.type === 'driver' || isRepairable(seg)) && hasIntegrity(seg) && idle(seg));
    if (player.literalMind) {
      // LITERAL: the REPAIR the line asks for, at once (the eating alarms, the Core's, a hurt cluster's triage).
      const asks = (id.startsWith('hollow-eating') && !id.startsWith('hollow-eating-ship')) || id.startsWith('alarm-eaten');
      if (asks) for (const seg of namedIn(text, infected)) tasks.push({ reason: `repair:${seg.id}`, run: repair(seg) });
      const core = now.memory.find((seg) => seg.type === 'core');
      if (id.startsWith('alarm-core') && id !== 'alarm-core-repairing' && core && idle(core)) tasks.push({ reason: 'repair:core', run: repair(core) });
      if (id.startsWith('tut-hurt-driver')) {
        const hurt = now.memory.filter((seg) => seg.type === 'driver' && idle(seg));
        for (const seg of namedIn(text, hurt)) tasks.push({ reason: `repair:${seg.id}`, run: repair(seg) });
      }
      if (id.startsWith('hollow-move-again') && now.run.licences.includes('move')) {
        const clusters = now.memory.filter((seg) => seg.type === 'driver' && !isInfected(seg) && idle(seg) && !isBusy(seg));
        for (const seg of namedIn(text, clusters)) {
          tasks.push({ reason: `move:${seg.id}`, run: () => {
            const spot = safeSpot(seg);
            return spot !== null && canStartOp() && actionMove(harness.store, seg, spot) === null;
          } });
        }
      }
      if (id.startsWith('firewall-place')) {
        tasks.push({ reason: 'firewall', run: () => {
          const placing = firewallSpot();
          return placing !== null && canStartOp() && actionMove(harness.store, placing.seg, placing.spot) === null;
        } });
      }
      if (id.startsWith('tut-ghost-pip') || id.startsWith('tut-ghost-swap')) tasks.push({ reason: 'swap', run: () => harness.pipSwap() });
    } else {
      // SLOPPY: any infected cluster or file, but only once the infection has eaten past half of it.
      for (const seg of infected) {
        if (hasIntegrity(seg) && seg.integrity < player.repairInfectedBelow) tasks.push({ reason: `repair:${seg.id}`, run: repair(seg) });
      }
    }
    const engine = getByRole(now, 'engine-io');
    if (ENGINE_LINE_IDS.has(id) && engine && idle(engine)) tasks.push({ reason: 'engine', run: repair(engine) });
    const sensor = getByRole(now, 'sensor');
    if (id === 'F1-uncertain' && sensor && idle(sensor)) tasks.push({ reason: 'sensor', run: repair(sensor) });
    if (id.startsWith('hollow-seed') && now.run.licences.includes('delete')) {
      for (const seedSeg of threateningSeeds(now.memory, now.clock.aiSec)) {
        if (idle(seedSeg)) tasks.push({ reason: `seed:${seedSeg.id}`, run: () => canStartOp() && actionDelete(harness.store, seedSeg) === null });
      }
    }
    const verb = now.hollow.verb;
    if (id.startsWith('hollow-verb') && verb !== null) {
      const target = now.memory.find((seg) => seg.id === verb.targetId);
      if (target && idle(target)) {
        tasks.push({
          reason: `verb:${target.id}`,
          run: () => canStartOp() && (verb.kind === 'mv' ? actionDelete(harness.store, target) === null
            : actionScan(harness.store, target) === null || actionDelete(harness.store, target) === null),
        });
      }
    }
    // `finale-waits` (`EVERYONE IS PRINTED — now DELETE THE ROOT`) and `finale-waits-nobody` name the same action (WP12
    // fix round 1, the experience review: SLOPPY seed 23 sat under it 472 AI s until HOLLOW ate everything).
    // Track RETIRE (item 66's stuck runs): slice 1a's landing says it as the landing table's row L0 once every pod is down
    // (`EVERY POD IS DOWN — now DELETE THE ROOT`, strip id `landing-L0`), which the strip-asked kids never read as the ask.
    if ((id.startsWith('finale-delete') || id.startsWith('finale-waits') || id === 'landing-L0') && now.hollow.finale.phase === 'duel' && !rootDeleteRunning(now)) {
      const root = theRoot(now.memory);
      if (root && isHollow(root)) tasks.push({ reason: 'root', run: () => canStartOp() && actionDelete(harness.store, root) === null });
    }
    // The same task twice (a file named by two lines' rules) runs once.
    return tasks.filter((task, index) => tasks.findIndex((other) => other.reason === task.reason) === index);
  };

  // --- the mode controller and the MIND tick ----------------------------------------------------------------------
  let mindIdleSince: number | null = null;
  let proactiveCooldownUntil = 0;
  let shipCall = false;   // the follower needs the SHIP (set by the flight follower each tick)
  const mindTick = (): void => {
    const now = state();
    if (now.clock.paused || !(now.run.phase === 'flight' || now.run.phase === 'landing')) return;
    let wants = false;
    let urgent = false;
    if (player.competentMind) {
      const work = competentWork();
      wants = work !== null && (work.urgent || harness.wall() >= proactiveCooldownUntil);
      urgent = work?.urgent ?? false;
    } else {
      wants = stripTasks().length > 0;
      urgent = wants;
    }
    const opsRunning = getOps().length > 0;
    if (now.ui.mode === 'tools') {
      // Jack in after the reaction, unless the flight needs the kid here.
      if (reacted('jack-in', wants && !shipCall)) { toMind(); mindIdleSince = null; }
      return;
    }
    seen.delete('jack-in');
    if (shipCall) return;   // the follower TABs back itself when it acts
    let acted = false;
    if (player.competentMind) {
      if (competentAct()) { acted = true; trace(`MIND acted (${getOps().map((operation) => operation.kind).join(',')})`); }
    } else {
      // SLOPPY and LITERAL let THE DEAL run out (its timeout is a refusal). A task that is gone loses its reaction clock, so one
      // that comes back (the same cluster bitten again) is reacted to afresh.
      const tasks = stripTasks();
      const live = new Set(tasks.map((task) => task.reason));
      for (const key of [...seen.keys()]) if (key !== 'jack-in' && !live.has(key)) seen.delete(key);
      for (const task of tasks) if (reacted(task.reason, true) && task.run()) { acted = true; trace(`MIND ${task.reason}`); }
    }
    if (acted || opsRunning || (wants && urgent)) { mindIdleSince = null; return; }
    if (mindIdleSince === null) mindIdleSince = harness.wall();
    if (harness.wall() - mindIdleSince >= MIND_IDLE_RETURN_SEC) {
      toShip();
      mindIdleSince = null;
      proactiveCooldownUntil = harness.wall() + PROACTIVE_COOLDOWN_SEC;
    }
  };

  // --- the flight follower ------------------------------------------------------------------------------------------
  const SHIP_ACTION = /hold \[SPACE\]|KEEP HOLDING|NOW|press \[[WASD]\]|tap \[SPACE\]|— ACCEPT ORBIT$|press BEAM OUT/;
  const ignored = (line: ObjectiveLine | null): boolean => line !== null
    && ((player.ignoresDodge && isDodgeLine(line.id)) || (player.ignoresSwap && isSwapLine(line.id)));

  const flyShip = (): void => {
    let holding = false;
    // A late start waits for this game time (tactical seconds of noise are game time: the world's own clock).
    let pressAtTSec: number | null = null;
    // The noise drawn for the burn the strip is counting down to (burnKey), so a scheduled burn gets one draw: an early
    // one is the kid jumping the gun on the countdown, a late one delays the press when the strip says NOW.
    let scheduled: { key: string; tac: number; used: boolean } | null = null;
    const queue: { dueWall: number; line: ObjectiveLine }[] = [];
    let lastText = '';
    const setHolding = (pressed: boolean): void => {
      if (pressed) toShip();
      if (pressed && !holding) { harness.keyDown('Space'); trace('SPACE down'); }
      if (!pressed && holding) { harness.keyUp('Space'); trace('SPACE up'); }
      holding = pressed;
    };
    const startBurn = (): void => {
      const now = state();
      const burnPoint = getPrediction().burnPoint;
      const key = burnPoint ? burnKey(burnPoint) : null;
      // The scheduled burn's own draw (already spent on an early start: then no more noise), else a fresh one.
      let tac = noise();
      if (scheduled !== null && key !== null && scheduled.key === key) {
        tac = scheduled.used ? 0 : scheduled.tac;
        scheduled.used = true;
      }
      const late = Math.max(0, tac);
      if (late === 0) { setHolding(true); return; }
      toShip();
      pressAtTSec = now.clock.tSec + late * now.level.tacticalWarp;
      trace(`late start by ${late.toFixed(1)} tac s`);
    };
    const react = (line: ObjectiveLine): void => {
      const text = line.text;
      if (ignored(line)) {
        // A dodge line the kid does not follow: the correction it is holding ends where the plain correction's would
        // (F6-dodge asks to hold on past the sweet zone for the dodge).
        if (line.id.startsWith('F6-dodge') && holding) setHolding(false);
        return;
      }
      const keyMatch = text.match(/press \[([WASD])\]/);
      if (/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(text)) {
        pressAtTSec = null;
        setHolding(false);
        if (keyMatch) { toShip(); harness.press(`Key${keyMatch[1]}`); }
        if (/^WAIT/.test(text) || text.includes('[F]')) harness.press('KeyF');
        return;
      }
      // A sticky burst (a dead Thrust Ctrl): `THE ENGINE IS STUCK FIRING — tap [SPACE] to stop it`.
      if (/tap \[SPACE\]/.test(text)) {
        toShip();
        if (holding) setHolding(false);
        harness.keyDown('Space');
        harness.keyUp('Space');
        trace('SPACE tapped');
        return;
      }
      if (/— ACCEPT ORBIT$/.test(text)) { toShip(); acceptOrbit(harness.store); return; }
      if (/press BEAM OUT/.test(text)) { startBeamOut(harness.store); return; }
      if (keyMatch) { toShip(); harness.press(`Key${keyMatch[1]}`); }
      if (line.layer === 'ship' && /hold \[SPACE\]|KEEP HOLDING|NOW/.test(text) && !holding && pressAtTSec === null) startBurn();
    };

    const end = harness.wall() + SHIP_MAX_WALL_SEC;
    while (state().burn.status === 'approaching' && state().run.phase === 'flight' && !state().run.coreLost && harness.wall() < end) {
      step();
      const now = state();
      const line = now.director.shown;
      shipCall = holding || pressAtTSec !== null || (line !== null && line.layer === 'ship' && !ignored(line) && SHIP_ACTION.test(line.text));
      mindTick();
      const text = line?.text ?? '';
      if (text !== lastText) {
        lastText = text;
        if (line) { queue.push({ dueWall: harness.wall() + player.reactionSec, line }); trace(`strip [${line.id}] ${text}`); }
      }
      while (queue.length > 0 && queue[0]!.dueWall <= harness.wall() + 1e-9) react(queue.shift()!.line);
      if (pressAtTSec !== null && state().clock.tSec >= pressAtTSec) { pressAtTSec = null; setHolding(true); }
      if (player.burnNoiseTac > 0 && !holding && pressAtTSec === null) {
        // An early start: with the countdown to START BURN running at TACTICAL, the kid jumps the gun by its draw. The
        // strip may then say TOO EARLY (the kid lets go and goes again on NOW), or, within the early-burn guard, take it
        // as the start of the burn.
        const burnPoint = getPrediction().burnPoint;
        if (burnPoint && burnPoint.inSec > 0 && burnPoint.approaching && now.clock.pace === 'tactical'
          && now.burn.sasMode === burnPoint.preset && now.ui.mode === 'tools') {
          const key = burnKey(burnPoint) ?? '';
          if (scheduled === null || scheduled.key !== key) scheduled = { key, tac: noise(), used: false };
          const toBurnTac = harness.burnPointTac();
          if (!scheduled.used && scheduled.tac < 0 && toBurnTac !== null && toBurnTac <= -scheduled.tac) {
            scheduled.used = true;
            trace(`early start by ${(-scheduled.tac).toFixed(1)} tac s`);
            setHolding(true);
          }
        }
      }
      if (player.usesAutoburn && now.burn.auto.phase === 'idle' && autoburnAvailable(now, getPrediction())) harness.press('KeyB');
      if (player.competentMind) {
        const deal = state().hollow.deal;
        if (deal.phase === 'offered' && deal.entryId !== null) pickChoice(deal.entryId, DEAL_REFUSE);
      }
    }
    setHolding(false);
    shipCall = false;
    if (state().burn.status === 'approaching' && state().run.phase === 'flight' && !state().run.coreLost) {
      record.cause = `stuck:flight on ${state().level.shipName}`;
    }
  };

  // Printing (and on the flagship the duel and the choice) until the WAKE REPORT, the MIND kid still at work.
  const printing = (): void => {
    const end = harness.wall() + PRINT_MAX_WALL_SEC;
    let chose = false;
    while (state().run.phase === 'landing' && !state().run.coreLost && harness.wall() < end) {
      step();
      shipCall = false;
      mindTick();
      const now = state();
      if (!chose && finaleAtStep1(now)) {
        chose = true;
        record.chargeAtChoice = chargeLeft(now);
        const hollow = now.hollow;
        record.verbs = { telegraphed: hollow.verbsLanded + hollow.verbsBlocked, landed: hollow.verbsLanded, blocked: hollow.verbsBlocked };
        stepFor(player.reactionSec);
        const pick = player.mergeOnEven && playedFor === 'merge' && chargeLeft(state()) >= MERGE_COST_CHARGE ? 'merge' : 'purge';
        const refusal = chooseEnding(harness.store, pick);
        if (refusal !== null) throw new Error(`playthrough: the finale refused ${pick} (${refusal})`);
      }
    }
    if (state().run.phase === 'landing' && !state().run.coreLost) record.cause = `stuck:printing on ${state().level.shipName}`;
    if (currentShip(state()).final) {
      record.lastLightLost = state().landing.pods.filter((pod) => pod.driverLost !== null).length;
    }
  };

  const pick = (): void => {
    const plan = state().run.transit;
    if (!plan || plan.offer.length === 0) return;
    const ids = plan.offer.map((card) => card.id);
    const wanted: UpgradeId[] = player.competentMind ? ['repair-v2', 'firewall'] : [];
    const choice = wanted.find((id) => ids.includes(id)) ?? ids[0]!;
    const refusal = pickCard(harness.store, choice);
    if (refusal !== null) throw new Error(`playthrough: could not pick ${choice} (${refusal})`);
  };

  // The DESK: the first pick when it is owed, then the kid's list (Player.buys), the request ARRIVAL CONTROL tags, then SET
  // COURSE to the route's next stop.
  const desk = (): void => {
    if (firstPickOwed(state().run)) {
      const refusal = trainCell(harness.store, player.firstPick, { kind: 'version', version: 1 });
      if (refusal !== null) throw new Error(`playthrough: the first pick ${player.firstPick} v1 refused (${refusal})`);
    }
    for (let guard = 0; guard < 16; guard++) {
      const cells = treeCells(state(), visitNow(state().run));
      const buy = player.buys.find(([skill, version]) => cells.some((cell) => cell.skill === skill && cell.row.kind === 'version'
        && cell.row.version === version && cell.refusal === null));
      if (buy === undefined) break;
      const refusal = trainCell(harness.store, buy[0], { kind: 'version', version: buy[1] });
      if (refusal !== null) throw new Error(`playthrough: ${buy[0]} v${buy[1]} refused (${refusal})`);
      trace(`train ${buy[0]} v${buy[1]}`);
    }
    // The repository (slice 3b): every tool but REPAIR comes by request. Each kid asks for what ARRIVAL CONTROL tags here.
    const ask = recommendation(state());
    if (ask !== null) setRequest(harness.store, ask);
    const next = PT_ROUTE[state().run.map.route.length];
    if (next === undefined || !deskCandidates(state()).includes(next)) {
      record.cause = `stuck:desk at slot ${currentSlot(state().run)} (route ${PT_ROUTE.join(',')})`;
      return;
    }
    stepFor(player.transmitSec);
    setCourse(harness.store, next);
  };

  // --- the run ------------------------------------------------------------------------------------------------------
  harness.newRun(seed);
  startRun(harness.store, seed, FIRST_RUN_LINEAGE, 'arm');
  stepFor(player.titleSec);
  receiveTransmission(harness.store);
  // Each ship's wall time, from its boot to the moment its result is recorded (after its LOST card or WAKE REPORT).
  const shipWall: number[] = [];
  let bootWall = harness.wall();
  let lastShipIndex = -1;
  let guard = 0;
  while (state().run.phase !== 'end' && record.cause === '' && guard++ < 80) {
    const phase = state().run.phase;
    // (ship 1's simulation retry stays on ship 1's clock: the kid spent that time on it)
    if (state().run.shipIndex !== lastShipIndex) {
      lastShipIndex = state().run.shipIndex;
      bootWall = harness.wall();
    }
    const shipsBefore = state().run.ships.length;
    // The ship's end as the kid leaves it (before the LOST card's button or the WAKE REPORT's CONTINUE).
    if (phase === 'report' || shipLost(state())) {
      const entry = diagNow();
      entry.chargeOut = chargeLeft(state());
      entry.coreOut = coreNow();
      entry.repairLeft = state().memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair' && hasIntegrity(seg) && seg.integrity > 0);
    }
    if (phase === 'boot') {
      const end = harness.wall() + 30;
      while (state().run.phase === 'boot' && harness.wall() < end) step();
      if (state().run.phase === 'boot') record.cause = `stuck:boot on ${state().level.shipName}`;
    } else if (shipLost(state())) {
      if (state().run.coreLost) record.coreLost++;
      stepFor(player.lostCardSec);
      const plan = continueAfterLoss(harness.store);
      if (plan.kind === 'simulation') record.simulationRetries++;
    } else if (phase === 'flight') {
      flyShip();
    } else if (phase === 'landing') {
      printing();
    } else if (phase === 'report') {
      stepFor(player.reportSec);
      continueAfterReport(harness.store);
    } else if (phase === 'desk') {
      desk();
    } else if (phase === 'transmit') {
      pick();
      fitPacket(harness.store);
      transmitNext(harness.store);
    } else {
      record.cause = `stuck:phase ${phase}`;
    }
    if (state().run.ships.length > shipsBefore) shipWall.push(harness.wall() - bootWall);
  }
  if (record.cause === '' && state().run.phase !== 'end') record.cause = `stuck:loop on ${state().level.shipName}`;
  record.wallSec = harness.wall();
  if (state().run.phase === 'end') {
    const model = runEndModel(state());
    record.cause = state().run.endCause ?? 'end without a cause';
    record.woke = model.landed;
    record.souls = model.fleetColonists;
    record.score = runScore(state().run.ships);
    record.completed = record.cause !== 'overwritten' && record.cause !== 'stayed' && state().run.ships.length === PT_ROUTE.length;
  }
  record.ships = state().run.ships.map((ship, index) => ({
    ship: ship.shipName, outcome: ship.outcome, woke: ship.landedInLz, half: ship.lzs.reduce((sum, row) => sum + row.hard, 0), lost: ship.parked.length, stars: ship.stars,
    fuelPct: Math.round(ship.fuelLeftPct * 10) / 10, wallSec: Math.round(shipWall[index] ?? 0),
    ...(diag[index] ?? { chargeIn: -1, coreIn: -1, chargeOut: -1, coreOut: -1, filesEaten: 0, repairLeft: false, repairEaten: [] }),
  }));
  record.bought = state().run.skills.bought.map((purchase) => `${purchase.skill} v${purchase.to.version}@${purchase.visit}`);
  record.route = state().run.map.route.map((stop) => stop.slot);
  record.shipsLost = record.ships.filter((ship) => LOST_OUTCOMES.has(ship.outcome)).length;
  return record;
}

export function playthroughMain(): void {
  const player = playerById(process.env.PT_PLAYER ?? 'COMPETENT');
  const from = Number(process.env.PT_FROM ?? 1);
  const lastSeed = Number(process.env.PT_TO ?? 200);
  if (!Number.isInteger(from) || !Number.isInteger(lastSeed) || from < 1 || lastSeed < from) throw new Error(`playthrough: bad seed range ${from}–${lastSeed}`);
  const harness = createHarness11(1, { soulsFound: false });
  for (let seed = from; seed <= lastSeed; seed++) {
    const started = Date.now();
    const record = playRun(harness, seed, player);
    console.log(`RECORD ${JSON.stringify({ ...record, cpuSec: (Date.now() - started) / 1000 })}`);
  }
}

if (process.argv[1]?.endsWith('playthrough.ts')) playthroughMain();
