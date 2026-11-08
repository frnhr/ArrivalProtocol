// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the drop demos, the mount order,
// AUTODROP's reset at 'landing-ended'. Others ask by message.
// Slice 4c (Track DROP): the kid's launches into a bracket are AUTODROP's demos (requestLaunch, plan §3.6); a controller
// launch tells autodrop.ts (its pass count, the volley's event); a pod AUTODROP sent that lands soft with room says
// BULLSEYE; and the landing's end puts AUTODROP at rest with its thread let go (the codec's rule at every save point).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  BayState, DropSolution, GoLowAim, LandingEnd, LandingView, LandingWindow, LaunchIntent, LaunchRecord, LaunchResult,
} from '@/types/landing';
import { onAiTick, onGameTick, onPostTick } from '@systems/clock';
import { fliesAlong } from '@systems/attitude';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say } from '@systems/say';
import type { Rng } from '@systems/rng';
import { capabilitiesNow } from '@systems/capabilities';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { currentDropSolution, getDropSolution } from '@systems/drop-cache';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { getPrediction, secUntil } from '@systems/predict';
import { requestSkip, skipBlockReason } from '@systems/pace';
import { declineKey, landingBurnOffer, travelSign } from '@systems/landing-orbit';
import { activeLandingController } from '@systems/landing-controller';
import { autodropLandingOver, autodropLaunched, mountAutodrop } from '@systems/autodrop';
import { dropDemoOffset } from '@systems/autodrop-plan';
import {
  classifyLanding, colonyName, dropFactors, goLowerChoice, driverTouch, endLandingRefusal, isLaunchable, landingMoment, landingOutcome,
  landingStuck,
  landingView as landingViewOf, launchGuard, launchGuardText, launchRefusal, lzAt, lzDownFill, lzRemaining, missKm, nextToLaunch, podCounts, podPoints,
  touchAtTouchdown,
  windowOpenNow,
} from '@systems/landing-rules';
import { forgetDriver, parkPodsAboard } from '@state/actions';
import { driversInMemory, finalePending, launchDrivers, scriptFightOpen } from '@state/selectors';
import { groundAt, groundKnownAt } from '@state/survey-selectors';
import { layoutOf } from '@data/memory';
import { END_LANDING_REFUSAL_KEY, LANDING_ECHO, launchRefusalKey } from '@data/landing-text';
import { IS_DEV } from '@/env';
import {
  BAND_DEGRADED_MIN, BAY_RELOAD_TAC, BAY_SLOTS, BEEP_BURN_TAC, BEEP_JUMP_TAC, BEEP_REARM_TAC, LANDING_DONE_LINGER_SEC,
  LANDING_NONE_LEFT_SEC, POD_DESCENT_SEC, POD_FIRST_DESCENT_SEC, EARLY_BURN_GUARD_TAC, LATE_TRIM_TAC,
} from '@data/tuning';
import { BLIND_DROP_MULT, LAST_LANDING_CADENCE_SEC } from '@data/tuning';
import { visitRng } from '@systems/map-streams';
import { writeEndingChosen } from '@systems/save-write';
import { sayOwedVerdict } from '@systems/finale';

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
  if (!dropRng) dropRng = visitRng(state.run, 'drop');
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
// `spendBay`: false for forceLandAll (dev and tests), which skips the bay, and during THE LAST LANDING (no bay, R26).
// Slice 7b (R24): a driver MERGE gave back by radio (one of landing.lastLanding.drivers) was never in memory: no op, no
// blocks; it leaves the radio list instead, and THE LAST LANDING's cadence starts (LAST_LANDING_CADENCE_SEC, R26).
function launchDriver(store: Store<GameState>, driver: DriverSegment, launch: LaunchRecord, spendBay: boolean): void {
  emit('pod-launched', { pod: driver.pod, source: launch.source, segId: driver.id });
  const radio = store.getState().landing.lastLanding?.drivers.some((candidate) => candidate.pod === driver.pod) ?? false;
  if (radio && store.getState().memory.some((seg) => seg.id === driver.id)) {
    throw new Error(`launchDriver: pod ${driver.pod}'s driver is both by radio and in memory`);
  }
  if (!radio) {
    for (const operation of getOpsBySeg(driver.id)) abortOp(operation.id);
    const memory = store.getState().memory;
    const start = requireAddr(memory, driver);
    replaceRange(memory, start, start + driver.size, [freeSegment(driver.size)], { opId: null, own: [driver] });
    mergeAdjacentFree(memory);
    if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  }
  const cadenceTac = capabilitiesNow(store.getState()).bay.cadenceTac;
  if (spendBay && cadenceTac === null) throw new Error('launchDriver: Bay Ctrl is missing (launchRefusal says BAY OFFLINE)');
  store.update((draft) => {
    const record = draft.landing.pods.find((candidate) => candidate.pod === driver.pod);
    if (!record || record.fate.kind !== 'aboard') throw new Error(`launchDriver: pod ${driver.pod} is not aboard`);
    record.fate = { kind: 'falling', launch };
    const lastLanding = draft.landing.lastLanding;
    if (radio && lastLanding !== null) {
      lastLanding.drivers = lastLanding.drivers.filter((candidate) => candidate.pod !== driver.pod);
      lastLanding.cadenceLeftSec = LAST_LANDING_CADENCE_SEC;
    }
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
  // Slice 7b (R27): a blind drop of THE LAST LANDING doubles the spread, in the one product (landing-solve dropHalfWidthKm).
  const factors = dropFactors(capabilitiesNow(state), driver);
  const halfWidthKm = dropHalfWidthKm(dot.launchRadius, R, intent.blind === true ? { ...factors, blind: BLIND_DROP_MULT } : factors);
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
// only the controller that is active now (derived from the state: landing-controller.ts's registry).
function launchesFromMind(state: Readonly<GameState>, intent: LaunchIntent): boolean {
  if (intent.source === 'player') return false;
  const controller = activeLandingController(state);
  if (controller === null || controller.source !== intent.source) {
    throw new Error(`requestLaunch: '${intent.source}' asked to launch but is not the active landing controller`);
  }
  return controller.launchesFromMind;
}

// The ONLY way a pod launches (§3.3, §3.14): the kid's [L] (landing-controls playerLaunch) and every future controller go
// through here, with the same refusals (launchRefusal) and guards (launchGuard: the inline confirm, answered by calling
// again with `confirmed`). Only the player's refusals buzz and flash their line: a controller is asked every tick.
// Slice 7b: THE LAST LANDING's launches (landing.lastLanding set, R26) spend no bay and meet no inline confirm (there is no
// kid to ask: its controller decides by the rules, R27, and its pods score by the normal ones); only they may drop blind.
export function requestLaunch(store: Store<GameState>, intent: LaunchIntent): LaunchResult {
  const state = store.getState();
  const lastLanding = state.landing.lastLanding !== null;
  if (intent.blind === true && (intent.source !== 'merge' || !lastLanding)) {
    throw new Error(`requestLaunch: a blind drop asked by '${intent.source}'${lastLanding ? '' : ' outside THE LAST LANDING'}`);
  }
  const sol = state.run.phase === 'landing' ? currentDropSolution() : null;
  const refusal = launchRefusal(state, sol, { source: intent.source, fromMind: launchesFromMind(state, intent) }, intent.pod);
  if (refusal !== null) {
    if (intent.source === 'player') emit('refused', { reason: launchRefusalKey(refusal) });
    return { kind: 'refused', reason: refusal };
  }
  if (sol === null) throw new Error('requestLaunch: no drop solution in LANDING');
  const guard = lastLanding ? null : launchGuard(state, sol, intent.pod);
  if (guard !== null && intent.confirmed !== guard.ask) {
    return { kind: 'confirm', ask: guard.ask, points: guard.points, text: launchGuardText(guard, state.landing.terrain) };
  }
  const driver = intent.pod === undefined ? nextToLaunch(state) : launchDrivers(state).find((candidate) => candidate.pod === intent.pod);
  if (!driver) throw new Error('requestLaunch: no driver to launch (launchRefusal said NO POD READY otherwise)');
  const launch = launchRecordFor(state, driver, sol, intent);
  launchDriver(store, driver, launch, !lastLanding);
  // AUTODROP's demos (03 §3.3, plan §3.6): each launch of the kid's into a bracket, its offset from the window's centre in
  // tactical s. Off-site launches and the controllers' own are not demos.
  const demo = intent.source === 'player' ? playerDemo(state, sol, launch) : null;
  if (demo !== null) store.update((draft) => { draft.run.stats.dropDemos.push({ offsetTac: demo }); });
  // A launch ends a decline (risk 2): the next burn the landing offers is offered again. A declined GO LOWER only on a
  // launch into its own LZ (review minor 4: a pod sent elsewhere leaves that LZ's dot as wide as it was, and clearing it
  // brought the declined burn back every orbit). And GO LOWER's aim (not held: a launch is refused under thrust) is let
  // go: the window it was for has had its pod, and goLowTick builds it again next tick if the next pod's L9 still says
  // fly lower (the plot's ◇ reads the aim, UI's contract).
  const after = store.getState().landing;
  const endsDecline = after.declined !== null && (after.declined.untilLz === null || after.declined.untilLz === launch.aimLz);
  if (endsDecline || (after.goLow !== null && !after.goLow.held)) {
    store.update((draft) => {
      if (endsDecline) draft.landing.declined = null;
      if (draft.landing.goLow !== null && !draft.landing.goLow.held) draft.landing.goLow = null;
    });
  }
  return { kind: 'launched', pod: driver.pod };
}

// The kid's launch as a drop demo (review M3: against the slot the strip cued, autodrop-plan dropDemoOffset), or null.
function playerDemo(state: Readonly<GameState>, sol: Readonly<DropSolution>, launch: Readonly<LaunchRecord>): number | null {
  const earlier = state.landing.pods.flatMap((record) => (record.fate.kind === 'falling' || record.fate.kind === 'down') ? [record.fate.launch.atTSec] : []);
  const cadenceSec = (capabilitiesNow(state).bay.cadenceTac ?? 0) * state.level.tacticalWarp;
  return dropDemoOffset(sol, launch, state.level.tacticalWarp, cadenceSec, earlier);
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
  const touch = touchAtTouchdown(launch, groundAt(landing, placement.lz));
  const points = podPoints(placement.place, touch, landing.forgiveness, record.colonists);
  const firstOnShip = !landing.pods.some((candidate) => candidate.fate.kind === 'down');
  const firstOfRun = firstOnShip && !state.run.ships.some((ship) => ship.pods.some((summary) => summary.fate === 'down'));
  const colony = landing.colony ?? (firstOnShip
    ? colonyName(landing, record.family, visitRng(state.run, 'colony'), state.run.tutorial)
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
    // A GO LOWER declined for this LZ ends when it fills (review minor 4): nothing is left to go lower for there.
    if (fillsLz && draft.landing.declined !== null && draft.landing.declined.untilLz === lzDef?.label) draft.landing.declined = null;
  });
  // BULLSEYE (plan §3.2): a pod AUTODROP sent that came down soft in an LZ with room. On the event (review m11), so the
  // echo and the NAV PLOT's float read the one answer.
  const bullseye = launch.source === 'autodrop' && placement.place === 'lz' && touch === 'soft';
  // Slice 6 (review M1): whether this touchdown makes its LZ's bad ground known, worked out before 'pod-landed' (SWATH's
  // reveal handler marks the ground known on it), for the echo's tail.
  const ground = groundAt(landing, placement.lz);
  const revealing = placement.lz !== null && ground !== 'flat' && !groundKnownAt(landing, placement.lz) ? ground : null;
  emit('pod-landed', { pod, place: placement.place, lz: placement.lz, touch, points, firstOnShip, firstOfRun, bullseye });
  if (fillsLz && lzDef) emit('lz-full', { lz: lzDef.label });
  say('cmd', LANDING_ECHO.touchdown(pod, placement.place, placement.lz, touch, bullseye, revealing), { critical: true });
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
  const outcome = landingOutcome(state.burn.status);
  let parked = 0;
  store.update((draft) => {
    draft.landing.ended = reason;
    draft.landing.window = null;
    draft.landing.noDriverAiSec = 0;
    draft.landing.fuelAtEndPct = draft.burn.fuelPct;
    // The engine closes with the landing (selectors engineOpen): a held throttle lets go, and no burn is offered.
    draft.burn.firing = false;
    draft.burn.firingSource = null;
    draft.burn.firingFor = null;
    draft.landing.goLow = null;
    draft.landing.declined = null;
    parked = parkPodsAboard(draft, outcome);
  });
  // The burn being watched for a decline goes with the engine (review minor 5): MERGE's reopen starts its offers afresh.
  dueWatch = { ...NO_DUE_WATCH };
  // AUTODROP at rest (plan §2.2: the codec refuses a save with it held, armed, claimed or waiting), its thread let go.
  autodropLandingOver(store);
  if (parked > 0) emit('pods-parked', { count: parked });
  emit('landing-ended', { reason });
}

// The landing is over and the bells have rung out: the LANDING REPORT opens. On the final ship its finale is decided by now
// (the report waits for it: finalePending), and this is ENDING CHOSEN (slice 3c plan §2.1, risk 1; systems/save-write.ts:
// the ops stopped, the finale's owed line said, then the save). Slice 7a (R14): it stays here, after THE LAST LANDING, and
// the report opens on a final ship only at 'done' (a report under an undecided FINALE is a bug).
function finishLanding(store: Store<GameState>): void {
  const phase = store.getState().hollow.finale.phase;
  if (store.getState().landing.finalShip && phase !== 'done') throw new Error(`finishLanding: the final ship's FINALE is '${phase}', not decided`);
  store.update((draft) => {
    draft.landing.lingerAiSec = null;
    draft.run.phase = 'report';
  });
  if (store.getState().landing.finalShip) writeEndingChosen(store, sayOwedVerdict);
}

// LandingState.window from the drop solution, with its edge events (window-open, window-sure, window-closed).
// Slice 1b (foundation review note): held steady while thrust is delivered. Under a burn the drop cache re-solves on its
// 1 km element key at 10 Hz and an edge can flicker open, shut and open again; launches are refused then anyway (ENGINE
// FIRING), and the first quiet tick (the burn's end bumps orbitEpoch: a fresh solve) sets the window as it now is.
function trackWindow(store: Store<GameState>): void {
  const state = store.getState();
  const before = state.landing.window;
  const ended = state.landing.ended !== null;
  if (!ended && state.burn.lastTickDvKmS > 0) return;
  const now: LandingWindow | null = !ended ? windowOpenNow(getDropSolution(), state.clock.tSec) : null;
  if (before?.lz === now?.lz && before?.sure === now?.sure) return;
  store.mutate((draft) => { draft.landing.window = now; });
  // (A declined GO LOWER outlives its LZ's window, review minor 4: it ends on a launch into that LZ or when it fills.)
  if (before !== null && before.lz !== now?.lz) emit('window-closed', { lz: before.lz });
  if (now !== null && before?.lz !== now.lz) emit('window-open', { lz: now.lz });
  if (now !== null && now.sure && !(before?.lz === now.lz && before.sure)) emit('window-sure', { lz: now.lz });
}

// The auto-ends (every pod away, landingStuck's) wait while the ship is on a path into the planet (review B1): ending
// then would park the pods in orbit a moment before the crash. The ship is saved (the end comes on the next tick) or
// lost (orbit-sim endLandingLost: 'ship-lost').
function landingEndHeld(): boolean {
  return getPrediction().outcome === 'impact';
}

// Risk 7: pods aboard and none of them can ever launch (their drivers eaten, taken to 0, or dead with no REPAIR left to
// bring them back: landing-rules driverCanEverLaunch), or Bay Ctrl gone (1b's BAY OFFLINE), means nothing can launch any
// more; after LANDING_NONE_LEFT_SEC the landing ends by itself with landing-rules landingStuck's reason, so headless
// kids and AFK players never stall.
function noneLeftTick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  if (state.landing.ended !== null) return;
  const stuck = landingStuck(state, getDropSolution());
  if (stuck === null) {
    if (state.landing.noDriverAiSec !== 0) store.mutate((draft) => { draft.landing.noDriverAiSec = 0; });
    return;
  }
  const waited = state.landing.noDriverAiSec + dtAi;
  if (waited < LANDING_NONE_LEFT_SEC || landingEndHeld()) {
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
  const moment = landingMoment(state, getDropSolution(), now, capabilitiesNow(state).bay.offline);
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
// controller asking every tick never buzzes. The controller is told of each launch it made (autodrop.ts autodropLaunched).
function controllerTick(store: Store<GameState>): void {
  const state = store.getState();
  const controller = activeLandingController(state);
  if (controller === null) return;
  if (state.landing.ended !== null || state.clock.paused) return;
  const sol = getDropSolution();
  if (sol === null) return;
  const view = landingViewOf(state, sol, capabilitiesNow(state).bay.cadenceTac);
  const decision = controller.decide(view, state);
  if (decision === null) return;
  if (decision === 'skip') {
    if (state.clock.skipWarp === null && skipBlockReason(state, getPrediction()) === null) requestSkip(store);
    return;
  }
  if (decision.source !== controller.source) {
    throw new Error(`landing controller '${controller.source}' asked for a launch as '${decision.source}'`);
  }
  const result = requestLaunch(store, decision);
  // Review m4 (slice 5): every controller launch is AUTODROP-built (AUTODROP, the sleeper's RUN THE DROPS, MERGE's), so the
  // volley event is emitted whoever flies; AUTODROP's own sent count only for its own launches.
  if (result.kind === 'launched') autodropLaunched(store, result.pod, view, controller);
}

// --- GO LOWER's aim and the declined burn (slice 1b, plan §1.4; landing-orbit is the math) ----------------------------

// The aim GO LOWER would take now (§3.7), or null: landing-rules goLowerChoice (the soonest too-wide window of an LZ with
// room whose ◇ still comes before it, review fix 1; not while decay is warned, review M4; goLowerFit fits it and the
// tank pays for it), with a pod aboard and a dot to drop by. dropTooWide's `or fly lower` is the same choice for the
// awaited LZ (review minor 1: the line and the burn agree by construction).
function goLowAimNow(state: Readonly<GameState>, sol: Readonly<DropSolution> | null): GoLowAim | null {
  const { landing } = state;
  if (landing.ended !== null || sol === null || sol.block !== null || sol.dot === null) return null;
  // Review M1: the engine is shut in MERGE's reopened landing (selectors engineOpen), so no burn is offered there.
  if (state.hollow.finale.phase === 'last-landing' || podCounts(state).aboard === 0) return null;
  const choice = goLowerChoice(state, sol, capabilitiesNow(state));
  if (choice === null) return null;
  const { fit, launchRad } = choice;
  const burnRad = launchRad - Math.PI * travelSign(state.orbit);
  return { lz: choice.lz, launchRad, burnRad, targetRadiusKm: fit.targetRadiusKm, floorKm: fit.floorKm, held: false };
}

// The aim moved enough to be worth writing (the drop cache re-solves at 10 Hz and the launch point drifts a hair on a
// sub-stepped coast): about 0.3 km of the ship's arc, or a km of target radius.
const AIM_RAD_EPS = 5e-5;
const AIM_KM_EPS = 1;

function aimMoved(before: Readonly<GoLowAim>, after: Readonly<GoLowAim>): boolean {
  return Math.abs(after.launchRad - before.launchRad) > AIM_RAD_EPS || Math.abs(after.targetRadiusKm - before.targetRadiusKm) > AIM_KM_EPS;
}

// The aim's lifecycle (LandingState.goLow, the one writer): OFFERED while goLowAimNow has one (kept current, so predict
// times the ◇ burn on it); HELD from the moment the kid's thrust is delivered for the offered go-low burn (the throttle
// held, the ship flying RETRO by its preset or by hand under MANUAL: attitude fliesAlong, review minor 7; due within the
// early-burn guard; a ghost burst is not the kid's): from then the aim is kept as it is while the burn reshapes the
// windows under it; done (RELEASED) when the kid lets go of the held burn. The words for each phase are
// landingFlightRow's; 'go-low' marks them.
function goLowTick(store: Store<GameState>): void {
  const state = store.getState();
  const aim = state.landing.goLow;
  if (aim?.held) {
    if (!state.burn.firing && state.burn.lastTickDvKmS === 0) {
      store.update((draft) => { draft.landing.goLow = null; });
      emit('go-low', { lz: aim.lz, phase: 'released' });
    }
    return;
  }
  if (aim !== null && state.burn.lastTickDvKmS > 0 && state.burn.firing
    && fliesAlong('retrograde', state.burn.sasMode, state.burn.heading, state.orbit)) {
    const pred = getPrediction();
    const offer = landingBurnOffer(state, pred);
    const dueTac = offer === null ? null : secUntil(pred, offer.inSec, state.clock.tSec) / state.level.tacticalWarp;
    if (offer?.reason === 'go-low' && dueTac !== null && dueTac <= EARLY_BURN_GUARD_TAC) {
      store.update((draft) => { if (draft.landing.goLow) draft.landing.goLow.held = true; });
      emit('go-low', { lz: aim.lz, phase: 'held' });
      return;
    }
  }
  const next = goLowAimNow(state, getDropSolution());
  if (next === null) {
    if (aim !== null) store.update((draft) => { draft.landing.goLow = null; });
    return;
  }
  if (aim === null || aim.lz !== next.lz) {
    store.update((draft) => { draft.landing.goLow = next; });
    emit('go-low', { lz: next.lz, phase: 'offered' });
    return;
  }
  if (aimMoved(aim, next)) store.mutate((draft) => { draft.landing.goLow = next; });
}

// The offered burn the kid is being watched on (risk 2): its decline key, whether its START BURN has come (due), and
// whether thrust was delivered while it was.
interface DueWatch {
  key: string | null;
  dueSinceTSec: number | null;  // game time its START BURN came (null: not due yet)
  burned: boolean;
}

const NO_DUE_WATCH: DueWatch = { key: null, dueSinceTSec: null, burned: false };
let dueWatch: DueWatch = { ...NO_DUE_WATCH };

// LandingState.declined (risk 2, plan §1.4): an offered burn (a ring trim, GO LOWER, the 'lift' burn; never a safety
// burn) the kid let pass with no Δv delivered for it is declined: pace no longer holds TACTICAL for it or stops a SKIP on
// it until a launch (requestLaunch; for GO LOWER a launch into its LZ), GO LOWER's LZ filling (touchDown), or a new
// reason (the plan's burn is another: cleared here). "Let pass": its START BURN came, and then either the plan moved it to the next
// pass (its apsis or ◇ went by) or it stood due for LATE_TRIM_TAC (a trim whose late burn still lands stays due now for
// most of a climb: measured on HALCYON's PARTIAL orbit, 56 real s of TACTICAL under HOLD [SPACE] NOW), unburned.
function declineTick(store: Store<GameState>): void {
  const state = store.getState();
  if (state.landing.ended !== null) return;
  const pred = getPrediction();
  const declined = state.landing.declined;
  if (declined !== null && pred.burnPoint !== null && declineKey(pred.burnPoint) !== declined.key) {
    store.update((draft) => { draft.landing.declined = null; });
  }
  const offer = landingBurnOffer(store.getState(), pred);
  if (offer === null || offer.reason === 'capture' || offer.reason === 'missed') {
    dueWatch = { ...NO_DUE_WATCH };
    return;
  }
  const key = declineKey(offer);
  if (key !== dueWatch.key) dueWatch = { ...NO_DUE_WATCH, key };
  const now = state.clock.tSec;
  const due = secUntil(pred, offer.inSec, now) <= 0;
  if (due) {
    dueWatch.dueSinceTSec ??= now;
    if (state.burn.lastTickDvKmS > 0 || state.burn.firing) dueWatch.burned = true;
  }
  const passed = dueWatch.dueSinceTSec !== null
    && (!due || now - dueWatch.dueSinceTSec >= LATE_TRIM_TAC * state.level.tacticalWarp);
  if (!passed) return;
  if (!dueWatch.burned) {
    const untilLz = offer.reason === 'go-low' ? offer.aimLz ?? null : null;
    store.update((draft) => { draft.landing.declined = { key, untilLz }; });
  }
  dueWatch = { ...NO_DUE_WATCH, key };
}

// The ship left orbit during the landing (orbit-sim endLandingLost: crashed or escaped, the clock paused): the landing
// ends here in the same frame, through endNow ('ship-lost', review B3), so the pods aboard go NOT LAUNCHED. A post-tick,
// because the clock is paused and no AI tick runs under the LOST card.
function shipLostTick(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.phase !== 'landing' || state.landing.ended !== null) return;
  if (state.burn.status === 'crashed' || state.burn.status === 'escaped') endNow(store, 'ship-lost');
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
  // 2b. The burns the landing offers (slice 1b): GO LOWER's aim, and a decline when an offered burn passed unburned.
  goLowTick(store);
  declineTick(store);
  // 3. The controller (AUTODROP's, 4c).
  controllerTick(store);
  // 4. No more launches: every pod away, or no driver left for the pods aboard (risk 7).
  if (store.getState().landing.ended === null && podCounts(store.getState()).aboard === 0 && !landingEndHeld()) endNow(store, 'all-launched');
  noneLeftTick(store, dtAi);
  // 5. The end: the landing has ended and nothing is still falling. The last bell rings out (LANDING_DONE_LINGER_SEC),
  // and the ARRIVAL stage's scripted fight (still undecided after an early END LANDING), HOLLOW's story beat and LAST LIGHT's
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
// the pods left aboard are parked in orbit and the LANDING REPORT follows. Refused on a path into the planet (review B1,
// landing-rules endLandingRefusal 'IMPACT': the POD BAY's button says DON'T HIT THE PLANET first).
export function endLanding(store: Store<GameState>, reason: LandingEnd = 'end-landing'): string | null {
  const refusal = endLandingRefusal(store.getState(), getPrediction().outcome);
  if (refusal) {
    emit('refused', { reason: refusal === 'IMPACT' ? END_LANDING_REFUSAL_KEY : refusal });
    return refusal;
  }
  endNow(store, reason);
  return null;
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
    const driver = launchDrivers(state).find((candidate) => aboard(state, candidate.pod) && isLaunchable(candidate));
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

// The world reset (a new ship, NEW RUN, a test's reset): the drop stream and the per-ship moments. The controllers are
// derived from the state (landing-controller.ts), so there is none to forget.
function forget(): void {
  dropRng = null;
  entered.clear();
  beepWatch = { ...NO_BEEP_WATCH };
  dueWatch = { ...NO_DUE_WATCH };
}

export function mountLanding(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountLanding: already mounted');
  mounted = true;
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offBay = onGameTick((dtWorld) => bayTick(store, dtWorld));
  const offLost = onPostTick(() => shipLostTick(store));
  const offReset = onWorldReset('landing', forget, () => ({
    rolled: dropRng !== null, entered: entered.size, beep: beepWatch.key,
    due: dueWatch.key,
  }));
  // Slice 4c (plan §2.4, §3.1): AUTODROP's resolver joins the controller registry with the landing (Track DROP's mount).
  const offAutodrop = mountAutodrop(store);
  return () => {
    offTick();
    offBay();
    offLost();
    offReset();
    offAutodrop();
    forget();
    mounted = false;
  };
}
