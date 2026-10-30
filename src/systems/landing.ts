import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  BayState, DropSolution, LandingController, LandingEnd, LandingView, LandingWindow, LaunchIntent, LaunchRecord, LaunchResult,
} from '@/types/landing';
import { onAiTick, onGameTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say } from '@systems/say';
import { childRng, type Rng } from '@systems/rng';
import { capabilitiesNow } from '@systems/capabilities';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { currentDropSolution, getDropSolution } from '@systems/drop-cache';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { getPrediction } from '@systems/predict';
import { requestSkip, skipBlockReason } from '@systems/pace';
import { activeLandingController, setActiveLandingController } from '@systems/landing-controller';
import {
  classifyLanding, colonyName, dropFactors, driverTouch, inOrbitOutcome, isLaunchable, landingMoment, landingStuck,
  landingView as landingViewOf, launchGuard, launchGuardText, launchRefusal, lzAt, lzDownFill, lzRemaining, missKm, nextToLaunch, podCounts, podPoints,
  touchAtTouchdown,
  windowOpenNow,
} from '@systems/landing-rules';
import { forgetDriver, parkPodsAboard } from '@state/actions';
import { driversInMemory, finalePending, scriptFightOpen } from '@state/selectors';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { LANDING_ECHO, launchRefusalKey } from '@data/landing-text';
import { IS_DEV } from '@/env';
import {
  BAND_DEGRADED_MIN, BAY_RELOAD_TAC, BAY_SLOTS, BEEP_BURN_TAC, BEEP_JUMP_TAC, BEEP_REARM_TAC, LANDING_DONE_LINGER_SEC,
  LANDING_NONE_LEFT_SEC, POD_DESCENT_SEC, POD_FIRST_DESCENT_SEC,
} from '@data/tuning';

// The landing (01-landing; plan §1.4): replaces phase 2's printer. DOM-free; the only module besides
// landing-controls.ts that changes landing state. The pure rules are landing-rules.ts, the math landing-solve.ts, the
// live drop solution drop-cache.ts.
//
// Mount order (main.ts): mountDropCache after mountPredictor; mountLanding where mountPrinter was, after the ops core
// and before HOLLOW, so a launch wins a same-tick bite; registerLandingKeys (landing-controls.ts) with
// { confirm: askInline }.
//
// Two ticks:
// • the GAME tick (world time) runs the bay: its cadence and its reloads are tactical seconds of WORLD time (§3.4), so a
//   SKIP refills it and OVERCLOCK stretches it exactly as it stretches the window;
// • the AI tick runs everything shown on AI time: the descents ('pod-entry', touchdowns), the window state and its edge
//   events (LandingState.window: the ONE source of truth for "window open"), GET READY's beeps, the controller hook, the
//   risk-7 auto-end and the end of the landing (the linger, then the report).
// The first touchdown's CONTROL beat and radio line are the director's (data/script.ts BEATS, on 'pod-landed'), so they
// are spoken in that order; touchDown names the colony.
//
// Readers of drop-cache: this module (the window state, the beeps, the launch), pace (the SKIP's target and the TACTICAL
// lead), landing-guidance (the table's countdowns) and landing-hud. Everything else (hollow's landMult, the chips, the
// alerts, the tests) reads state.landing.window. Only requestLaunch calls currentDropSolution (a fresh solve per call).

let dropRng: Rng | null = null;

// The seeded stream that places each pod inside its dot (§3.3: u uniform in [−1, 1]); one draw per launch.
function dropStream(state: Readonly<GameState>): Rng {
  if (!dropRng) dropRng = childRng(state.run.seed, state.run.shipIndex, 'drop');
  return dropRng;
}

// --- The launch path -----------------------------------------------------------------------------------------------

// Run 1's very first pod (§4: the first landing's moment): the tutorial run, before any pod has left. It falls slower,
// and its launch record says so (LaunchRecord.firstOfRun: the entry's flare and sound read that, not the descent time).
function firstOfRun(state: Readonly<GameState>): boolean {
  return state.run.tutorial && state.run.ships.length === 0 && state.landing.pods.every((record) => record.fate.kind === 'aboard');
}

// The driver uploads into its pod and leaves memory (§3.8), as a print did: the moment first (the chip can flash), then
// any op on it aborted (its own onAbort settles it), the blocks freed, the pod falling, the bay spent, and the echo.
// `spendBay`: false for forceLandAll (dev and tests), which skips the bay.
function launchDriver(store: Store<GameState>, driver: DriverSegment, launch: LaunchRecord, spendBay: boolean): void {
  emit('pod-launched', { pod: driver.pod, source: launch.source, segId: driver.id });
  for (const operation of getOpsBySeg(driver.id)) abortOp(operation.id);
  const memory = store.getState().memory;
  const start = requireAddr(memory, driver);
  replaceRange(memory, start, start + driver.size, [freeSegment(driver.size)], { opId: null, own: [driver] });
  mergeAdjacentFree(memory);
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  const cadenceTac = capabilitiesNow(store.getState()).bay.cadenceTac;
  if (spendBay && cadenceTac === null) throw new Error('launchDriver: Bay Ctrl is missing (launchRefusal says BAY OFFLINE)');
  store.update((draft) => {
    const record = draft.landing.pods.find((candidate) => candidate.pod === driver.pod);
    if (!record || record.fate.kind !== 'aboard') throw new Error(`launchDriver: pod ${driver.pod} is not aboard`);
    record.fate = { kind: 'falling', launch };
    if (spendBay) {
      if (draft.landing.bay.loaded < 1) throw new Error('launchDriver: the bay is empty');
      draft.landing.bay.loaded--;
      draft.landing.bay.cadenceLeftTac = cadenceTac ?? 0;
    }
    forgetDriver(draft, driver);
    draft.ui.memoryRev++;
  });
  say('cmd', LANDING_ECHO.launch(driver.pod, launch.aimLz), { critical: true });
}

// The drop width is the LAUNCHED driver's (dropFactors of this driver), not the solution's dot, which is solved for
// nextToLaunch: with LOAD NEXT or a controller naming a pod they differ once 1b's driver factor varies.
function launchRecordFor(state: Readonly<GameState>, driver: DriverSegment, sol: DropSolution, intent: LaunchIntent): LaunchRecord {
  const dot = sol.dot;
  if (dot === null) throw new Error('requestLaunch: no drop dot (launchRefusal lets no launch through without one)');
  const R = state.level.planet.R;
  const halfWidthKm = dropHalfWidthKm(dot.launchRadius, R, dropFactors(capabilitiesNow(state), driver));
  const u = dropStream(state)() * 2 - 1;
  return {
    atTSec: state.clock.tSec,
    atAi: state.clock.aiSec,
    source: intent.source,
    launchRadius: dot.launchRadius,
    dotRad: dot.rad,
    halfWidthKm,
    aimLz: lzAt(state.landing.lzs, dot.rad)?.label ?? null,
    landingRad: dot.rad + (u * halfWidthKm) / R,
    predictedTouch: driverTouch(driver.integrity),
    driverIntegrity: driver.integrity,
    arc: sol.arc.map((point) => ({ ...point })),
    descentSec: firstOfRun(state) ? POD_FIRST_DESCENT_SEC : POD_DESCENT_SEC,
    firstOfRun: firstOfRun(state),
  };
}

// Whether this asker may launch from the MIND: never the player; a controller only if it says so (like AUTOBURN), and
// only the controller that is active now.
function launchesFromMind(intent: LaunchIntent): boolean {
  if (intent.source === 'player') return false;
  const controller = activeLandingController();
  if (controller === null || controller.source !== intent.source) {
    throw new Error(`requestLaunch: '${intent.source}' asked to launch but is not the active landing controller`);
  }
  return controller.launchesFromMind;
}

// The ONLY way a pod launches (§3.3, §3.14): the kid's [L] (landing-controls playerLaunch) and every future controller go
// through here, with the same refusals (launchRefusal) and guards (launchGuard: the inline confirm, answered by calling
// again with `confirmed`). Only the player's refusals buzz and flash their line: a controller is asked every tick.
export function requestLaunch(store: Store<GameState>, intent: LaunchIntent): LaunchResult {
  const state = store.getState();
  const sol = state.run.phase === 'landing' ? currentDropSolution() : null;
  const refusal = launchRefusal(state, sol, { source: intent.source, fromMind: launchesFromMind(intent) }, intent.pod);
  if (refusal !== null) {
    if (intent.source === 'player') emit('refused', { reason: launchRefusalKey(refusal) });
    return { kind: 'refused', reason: refusal };
  }
  if (sol === null) throw new Error('requestLaunch: no drop solution in LANDING');
  const guard = launchGuard(state, sol, intent.pod);
  if (guard !== null && intent.confirmed !== guard.ask) {
    return { kind: 'confirm', ask: guard.ask, points: guard.points, text: launchGuardText(guard, state.landing.terrain) };
  }
  const driver = intent.pod === undefined ? nextToLaunch(state) : driversInMemory(state).find((candidate) => candidate.pod === intent.pod);
  if (!driver) throw new Error('requestLaunch: no driver to launch (launchRefusal said NO POD READY otherwise)');
  launchDriver(store, driver, launchRecordFor(state, driver, sol, intent), true);
  return { kind: 'launched', pod: driver.pod };
}

// --- Touchdown --------------------------------------------------------------------------------------------------------

// A falling pod comes down where its launch decided (§3.3), classified against the pods already down (§3.5: an LZ
// fills in touchdown order) and scored. The ship's first touchdown names the colony (05 §).
function touchDown(store: Store<GameState>, pod: number): void {
  const state = store.getState();
  const record = state.landing.pods.find((candidate) => candidate.pod === pod);
  if (!record || record.fate.kind !== 'falling') throw new Error(`touchDown: pod ${pod} is not falling`);
  const { launch } = record.fate;
  const { landing } = state;
  const fill = lzDownFill(state);
  const placement = classifyLanding(landing.lzs, landing.noGo, launch.landingRad, fill);
  const touch = touchAtTouchdown(launch);
  const points = podPoints(placement.place, touch, landing.forgiveness, record.colonists);
  const firstOnShip = !landing.pods.some((candidate) => candidate.fate.kind === 'down');
  const firstOfRun = firstOnShip && !state.run.ships.some((ship) => ship.pods.some((summary) => summary.fate === 'down'));
  const colony = landing.colony ?? (firstOnShip
    ? colonyName(landing, record.family, childRng(state.run.seed, state.run.shipIndex, 'colony'), state.run.tutorial)
    : null);
  const lzDef = placement.lz === null ? undefined : landing.lzs.find((lz) => lz.label === placement.lz);
  const fillsLz = placement.place === 'lz' && lzDef !== undefined && (fill[lzDef.label] ?? 0) + 1 === lzDef.pods;
  store.update((draft) => {
    const target = draft.landing.pods.find((candidate) => candidate.pod === pod)!;
    target.fate = {
      kind: 'down',
      launch,
      touchdown: {
        place: placement.place, lz: placement.lz, points, missKm: missKm(landing.lzs, launch.landingRad, state.level.planet.R),
        touch, atAi: state.clock.aiSec,
      },
    };
    draft.landing.colony = colony;
  });
  emit('pod-landed', { pod, place: placement.place, lz: placement.lz, touch, points, firstOnShip, firstOfRun });
  if (fillsLz && lzDef) emit('lz-full', { lz: lzDef.label });
  say('cmd', LANDING_ECHO.touchdown(pod, placement.place, placement.lz, touch), { critical: true });
}

// --- The end of the landing ------------------------------------------------------------------------------------------

// No more launches (§3.10): END LANDING, the risk-7 auto-end, or every pod away. The pods still aboard are parked in
// orbit NOW, not when the report opens, so the PARKED words, the beacons and L0 show while the report waits (LAST LIGHT's
// duel). Pods already falling still come down. FUEL is noted for its star now (§3.9: "at the end of the landing", review
// N3: not when the report opens, after the linger and the finale's wait). MERGE (finale.ts) can reopen it: ended back
// to null, pods unparked, the FUEL note cleared.
function endNow(store: Store<GameState>, reason: LandingEnd): void {
  const state = store.getState();
  if (state.landing.ended !== null) throw new Error(`endNow: the landing already ended (${state.landing.ended})`);
  const outcome = inOrbitOutcome(state.burn.status);
  let parked = 0;
  store.update((draft) => {
    draft.landing.ended = reason;
    draft.landing.window = null;
    draft.landing.noDriverAiSec = 0;
    draft.landing.fuelAtEndPct = draft.burn.fuelPct;
    parked = parkPodsAboard(draft, outcome);
  });
  if (parked > 0) emit('pods-parked', { count: parked });
  emit('landing-ended', { reason });
}

// The landing is over and the bells have rung out: the LANDING REPORT opens.
function finishLanding(store: Store<GameState>): void {
  store.update((draft) => {
    draft.landing.lingerAiSec = null;
    draft.run.phase = 'report';
  });
}

// LandingState.window from the drop solution, with its edge events (window-open, window-sure, window-closed).
function trackWindow(store: Store<GameState>): void {
  const state = store.getState();
  const before = state.landing.window;
  const now: LandingWindow | null = state.landing.ended === null ? windowOpenNow(getDropSolution(), state.clock.tSec) : null;
  if (before?.lz === now?.lz && before?.sure === now?.sure) return;
  store.mutate((draft) => { draft.landing.window = now; });
  if (before !== null && before.lz !== now?.lz) emit('window-closed', { lz: before.lz });
  if (now !== null && before?.lz !== now.lz) emit('window-open', { lz: now.lz });
  if (now !== null && now.sure && !(before?.lz === now.lz && before.sure)) emit('window-sure', { lz: now.lz });
}

// Risk 7: pods aboard and none of them can ever launch (their drivers eaten, taken to 0, or dead with no REPAIR left to
// bring them back: landing-rules driverCanEverLaunch), or Bay Ctrl gone (1b's BAY OFFLINE), means nothing can launch any
// more; after LANDING_NONE_LEFT_SEC the landing ends by itself with landing-rules landingStuck's reason, so headless
// kids and AFK players never stall.
function noneLeftTick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  if (state.landing.ended !== null) return;
  const stuck = landingStuck(state);
  if (stuck === null) {
    if (state.landing.noDriverAiSec !== 0) store.mutate((draft) => { draft.landing.noDriverAiSec = 0; });
    return;
  }
  const waited = state.landing.noDriverAiSec + dtAi;
  if (waited < LANDING_NONE_LEFT_SEC) {
    store.mutate((draft) => { draft.landing.noDriverAiSec = waited; });
    return;
  }
  endNow(store, stuck);
}

// --- The bay (world time) ---------------------------------------------------------------------------------------------

// §3.4: the cadence counts down and, while a slot is empty, the reload fills it, both in tactical seconds of WORLD time
// (dtWorld / the tactical warp): a SKIP crosses minutes of world and refills the bay; OVERCLOCK runs the world at a
// quarter and the bay with it. Pure, for the tests.
export function bayAfter(bay: Readonly<BayState>, dtTac: number): BayState {
  if (!(dtTac >= 0)) throw new Error(`bayAfter: a negative or NaN step (${dtTac} tac s)`);
  let { loaded, reloadTac } = bay;
  if (loaded < BAY_SLOTS) {
    reloadTac += dtTac;
    while (reloadTac >= BAY_RELOAD_TAC && loaded < BAY_SLOTS) {
      loaded++;
      reloadTac -= BAY_RELOAD_TAC;
    }
    if (loaded >= BAY_SLOTS) reloadTac = 0;
  }
  return { loaded, reloadTac, cadenceLeftTac: Math.max(0, bay.cadenceLeftTac - dtTac) };
}

// Nothing reloads once the landing has ended. A slot filling is a discrete change (the POD BAY window's pips): an update;
// the running numbers are mutated.
function bayTick(store: Store<GameState>, dtWorld: number): void {
  const state = store.getState();
  if (state.run.phase !== 'landing' || state.landing.ended !== null) return;
  const before = state.landing.bay;
  const after = bayAfter(before, dtWorld / state.level.tacticalWarp);
  if (after.loaded !== before.loaded) store.update((draft) => { draft.landing.bay = after; });
  else if (after.reloadTac !== before.reloadTac || after.cadenceLeftTac !== before.cadenceLeftTac) {
    store.mutate((draft) => { draft.landing.bay = after; });
  }
}

// --- GET READY's beeps (§3.11 L7) -------------------------------------------------------------------------------------

// The 5…1 before the awaited window's launch moment (landing-rules landingMoment: what GET READY counts down to, the
// opening of the part where the whole dot fits when there is one), only while a pod can launch (GET READY's own
// condition: a countdown to a launch nobody can make is noise), as
// 'countdown-beep' kind 'window': the burn's beeps, so the same cue plays. Crossings only, as in flight-events: a
// countdown that jumps (a SKIP landing 8 s before the window, a fresh target) beeps nothing for the seconds it skipped,
// and each threshold beeps once per window. The opening itself is 'window-open' (its own chime).
const WINDOW_BEEPS: readonly number[] = Array.from({ length: BEEP_BURN_TAC }, (_unused, i) => BEEP_BURN_TAC - i);

interface BeepWatch {
  key: string | null;   // the window counted down to: its LZ and its opening (game s, rounded)
  last: number | null;  // tactical s to it at the last tick
  lowestFired: number;
}

const NO_BEEP_WATCH: BeepWatch = { key: null, last: null, lowestFired: Infinity };
let beepWatch: BeepWatch = { ...NO_BEEP_WATCH };

function beepTick(store: Store<GameState>): void {
  const state = store.getState();
  const now = state.clock.tSec;
  const moment = landingMoment(state, getDropSolution(), now);
  const target = moment.canLaunch ? moment.target : null;
  const opensIn = target?.launchInSec ?? null;
  const key = target === null || opensIn === null ? null : `${target.lz}|${Math.round(now + opensIn)}`;
  if (key !== beepWatch.key) beepWatch = { ...NO_BEEP_WATCH, key };
  const next = opensIn === null || opensIn <= 0 ? null : opensIn / state.level.tacticalWarp;
  const prev = beepWatch.last;
  beepWatch.last = next;
  if (next !== null && next > beepWatch.lowestFired + BEEP_REARM_TAC) beepWatch.lowestFired = Infinity;
  if (next === null || prev === null || next >= prev) return;
  const passed = WINDOW_BEEPS.filter((sec) => prev > sec && next <= sec && sec < beepWatch.lowestFired);
  if (passed.length === 0) return;
  beepWatch.lowestFired = Math.min(...passed);
  if (prev - next > BEEP_JUMP_TAC) return;
  for (const sec of passed) emit('countdown-beep', { kind: 'window', secLeft: sec, final: false });
}

// --- The descent's moments (AI time) ----------------------------------------------------------------------------------

// The share of the descent at which the streak reaches the atmosphere: the first arc point inside rAtm, as a fraction of
// the arc (the streak runs the arc's points evenly over descentSec). null: an arc that never enters (forceLandAll's
// empty one).
export function entryFraction(arc: readonly { x: number; y: number }[], rAtm: number): number | null {
  if (arc.length < 2) return null;
  const index = arc.findIndex((point) => Math.hypot(point.x, point.y) <= rAtm);
  return index < 0 ? null : index / (arc.length - 1);
}

// The pods whose 'pod-entry' has fired on this ship (the flare and the roar play once per pod).
const entered = new Set<number>();

function entryTick(state: Readonly<GameState>): void {
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'falling' || entered.has(record.pod)) continue;
    const { launch } = record.fate;
    const fraction = entryFraction(launch.arc, state.level.planet.rAtm);
    if (fraction === null || launch.atAi + fraction * launch.descentSec > state.clock.aiSec) continue;
    entered.add(record.pod);
    emit('pod-entry', { pod: record.pod, first: launch.firstOfRun });
  }
}

// --- The controller hook (§3.14) --------------------------------------------------------------------------------------

// The active controller (AUTODROP 4c, the resident 5, MERGE's landing 7) is asked once per AI tick with the CACHED view
// (a fresh solve per tick would cost a full solve a tick); a launch it asks for goes through requestLaunch, which
// decides on the fresh solution like the kid's [L]. A SKIP it asks for is requested only when pace allows it, so a
// controller asking every tick never buzzes. None in 1a.
function controllerTick(store: Store<GameState>): void {
  const controller = activeLandingController();
  if (controller === null) return;
  const state = store.getState();
  if (state.landing.ended !== null || state.clock.paused) return;
  const sol = getDropSolution();
  if (sol === null) return;
  const decision = controller.decide(landingViewOf(state, sol, capabilitiesNow(state).bay.cadenceTac), state);
  if (decision === null) return;
  if (decision === 'skip') {
    if (state.clock.skipWarp === null && skipBlockReason(state, getPrediction()) === null) requestSkip(store);
    return;
  }
  if (decision.source !== controller.source) {
    throw new Error(`landing controller '${controller.source}' asked for a launch as '${decision.source}'`);
  }
  requestLaunch(store, decision);
}

function tick(store: Store<GameState>, dtAi: number): void {
  let state = store.getState();
  if (state.run.phase !== 'landing') return;
  // 1. The descents: the entry flare, then the touchdowns, in the order the pods come down.
  entryTick(state);
  const due = state.landing.pods
    .flatMap((record) => (record.fate.kind === 'falling' ? [{ pod: record.pod, at: record.fate.launch.atAi + record.fate.launch.descentSec }] : []))
    .filter((fall) => fall.at <= state.clock.aiSec)
    .sort((a, b) => a.at - b.at);
  for (const fall of due) touchDown(store, fall.pod);
  const afterFalls = podCounts(store.getState());
  // The last pod is down: `parked` says how many never launched (parked or not launched), so a partial ship's end is
  // not played as a perfect one (audio-cues: lockArp only when none were).
  if (due.length > 0 && afterFalls.aboard === 0 && afterFalls.falling === 0) {
    emit('all-pods-down', { parked: afterFalls.parked + afterFalls['not-launched'] });
  }
  // 2. The window open now (state), and its edges; GET READY's beeps.
  trackWindow(store);
  beepTick(store);
  // 3. The controller (none in 1a).
  controllerTick(store);
  // 4. No more launches: every pod away, or no driver left for the pods aboard (risk 7).
  if (store.getState().landing.ended === null && podCounts(store.getState()).aboard === 0) endNow(store, 'all-launched');
  noneLeftTick(store, dtAi);
  // 5. The end: the landing has ended and nothing is still falling. The last bell rings out (LANDING_DONE_LINGER_SEC),
  // and ship 1's scripted fight (still undecided after an early END LANDING), HOLLOW's story beat and LAST LIGHT's
  // finale are part of this ship: the report waits for them.
  state = store.getState();
  const over = podCounts(state).falling === 0 && state.landing.ended !== null;
  if (!over) return;
  const linger = state.landing.lingerAiSec;
  if (linger === null) {
    store.mutate((draft) => { draft.landing.lingerAiSec = LANDING_DONE_LINGER_SEC; });
    return;
  }
  const remaining = linger - dtAi;
  if (remaining > 0 || state.hollow.story === 'pending' || scriptFightOpen(state) || finalePending(state)) {
    store.mutate((draft) => { draft.landing.lingerAiSec = Math.max(0, remaining); });
    return;
  }
  finishLanding(store);
}

// --- The kid's other controls and the seams ---------------------------------------------------------------------------

// LOAD NEXT (PRINT NEXT renamed, §3.8): this pod goes to the front of the queue; again on the same pod takes it back. A
// pinned pod that can't launch right now is skipped and stays pinned (landing-rules launchQueue).
export function setLoadNext(store: Store<GameState>, pod: number): string | null {
  const state = store.getState();
  const refusal = state.run.phase !== 'landing' ? 'NOT LANDING' : state.landing.ended !== null ? 'LANDING OVER'
    : state.clock.paused ? 'PAUSED' : null;
  if (refusal) { emit('refused', { reason: refusal }); return refusal; }
  if (!driversInMemory(state).some((driver) => driver.pod === pod)) throw new Error(`setLoadNext: pod ${pod}'s driver is not in memory`);
  store.update((draft) => { draft.landing.loadNext = draft.landing.loadNext === pod ? null : pod; });
  return null;
}

// END LANDING (§3.10, after the POD BAY window's inline confirm): no more launches; pods still falling come down, then
// the pods left aboard are parked in orbit and the LANDING REPORT follows.
export function endLanding(store: Store<GameState>, reason: LandingEnd = 'end-landing'): string | null {
  const state = store.getState();
  const refusal = state.run.phase !== 'landing' ? 'NOT LANDING' : state.landing.ended !== null ? 'LANDING OVER'
    : state.clock.paused ? 'PAUSED' : null;
  if (refusal) { emit('refused', { reason: refusal }); return refusal; }
  endNow(store, reason);
  return null;
}

// The seam for AUTODROP (4c), the resident (5) and MERGE's last landing (7): one controller at a time, asked every AI
// tick (controllerTick). null takes it away. It is held in landing-controller.ts (pace reads its holdsTactical).
// requestLaunch accepts a non-player source only from the controller set here (launchesFromMind).
export function setLandingController(next: LandingController | null): void {
  setActiveLandingController(next);
}

export function landingController(): LandingController | null {
  return activeLandingController();
}

// Everything a controller may read (§3.14): the state, the drop solution as of its last refresh (never a fresh solve:
// only requestLaunch decides on currentDropSolution) and Bay Ctrl's cadence.
export function landingView(state: Readonly<GameState>): LandingView {
  const sol = getDropSolution();
  if (sol === null) throw new Error('landingView: no drop solution outside LANDING');
  return landingViewOf(state, sol, capabilitiesNow(state).bay.cadenceTac);
}

// Dev and tests only (`__ap.landAll()`): every pod whose driver can launch lands at once, soft, in an LZ with room,
// through the real launch and touchdown (the bay is skipped). Ops on the drivers aboard are aborted first (their own
// onAbort settles them: a MOVE puts its twin back), so a driver that was merely busy launches; one that still can't
// (infected, dead, offline) stays aboard, and the landing ends, so it is parked as END LANDING would.
export function forceLandAll(store: Store<GameState>): number {
  const before = store.getState();
  if (before.run.phase !== 'landing') throw new Error(`forceLandAll: not landing (phase ${before.run.phase})`);
  const aboard = (state: Readonly<GameState>, pod: number): boolean =>
    state.landing.pods.some((record) => record.pod === pod && record.fate.kind === 'aboard');
  for (const driver of driversInMemory(before)) {
    if (aboard(before, driver.pod)) for (const operation of getOpsBySeg(driver.id)) abortOp(operation.id);
  }
  let landed = 0;
  for (;;) {
    const state = store.getState();
    const driver = driversInMemory(state).find((candidate) => aboard(state, candidate.pod) && isLaunchable(candidate));
    if (!driver) break;
    const remaining = lzRemaining(state);
    const lz = state.landing.lzs.find((candidate) => (remaining[candidate.label] ?? 0) > 0) ?? state.landing.lzs[state.landing.lzs.length - 1];
    if (!lz) throw new Error('forceLandAll: the ship has no LZ');
    const launch: LaunchRecord = {
      atTSec: state.clock.tSec, atAi: state.clock.aiSec, source: 'player', launchRadius: Math.hypot(state.orbit.x, state.orbit.y),
      dotRad: lz.centreRad, halfWidthKm: 0, aimLz: lz.label, landingRad: lz.centreRad, predictedTouch: 'soft',
      // The touch is decided at touchdown from this integrity: written soft here, as the dev hook promises.
      driverIntegrity: Math.max(driver.integrity, BAND_DEGRADED_MIN),
      arc: [], descentSec: 0, firstOfRun: firstOfRun(state),
    };
    launchDriver(store, driver, launch, false);
    touchDown(store, driver.pod);
    landed++;
  }
  const after = store.getState();
  if (after.landing.ended === null) endNow(store, podCounts(after).aboard > 0 ? 'end-landing' : 'all-launched');
  return landed;
}

// --- Mount ------------------------------------------------------------------------------------------------------------

let mounted = false;

// The world reset (a new ship, NEW RUN, a test's reset): the drop stream, the controller and the per-ship moments.
function forget(): void {
  dropRng = null;
  setActiveLandingController(null);
  entered.clear();
  beepWatch = { ...NO_BEEP_WATCH };
}

export function mountLanding(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountLanding: already mounted');
  mounted = true;
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offBay = onGameTick((dtWorld) => bayTick(store, dtWorld));
  const offReset = onWorldReset('landing', forget, () => ({
    rolled: dropRng !== null, controller: activeLandingController() !== null, entered: entered.size, beep: beepWatch.key,
  }));
  return () => {
    offTick();
    offBay();
    offReset();
    forget();
    mounted = false;
  };
}
