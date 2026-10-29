import type { Store } from '@state/store';
import type { GameState, ShipOutcome } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type {
  DropSolution, LandingController, LandingEnd, LandingView, LandingWindow, LaunchIntent, LaunchRecord, LaunchResult, PodRecord,
} from '@/types/landing';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say } from '@systems/say';
import { childRng, type Rng } from '@systems/rng';
import { capabilitiesNow } from '@systems/capabilities';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { currentDropSolution, getDropSolution } from '@systems/drop-cache';
import { dropHalfWidthKm } from '@systems/landing-solve';
import {
  classifyLanding, colonyName, dropFactors, driverTouch, finalFateOfAboard, isLaunchable, landingView as landingViewOf,
  launchGuard, launchRefusal, lzAt, lzDownFill, lzRemaining, missKm, nextToLaunch, podPoints, touchAtTouchdown, windowOpenNow,
} from '@systems/landing-rules';
import { forgetDriver } from '@state/actions';
import { driversInMemory, finalePending } from '@state/selectors';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { LANDING_ECHO, LAUNCH_CONFIRM_TEXT, launchRefusalKey } from '@data/landing-text';
import { IS_DEV } from '@/env';
import {
  BAND_DEGRADED_MIN, LANDING_DONE_LINGER_SEC, LANDING_NONE_LEFT_SEC, POD_DESCENT_SEC, POD_FIRST_DESCENT_SEC,
} from '@data/tuning';

// The landing (01-landing; plan §1.4): replaces phase 2's printer. DOM-free; the only module besides
// landing-controls.ts that changes landing state. The pure rules are landing-rules.ts, the math landing-solve.ts, the
// live drop solution drop-cache.ts.
//
// Mount order (main.ts): mountDropCache after mountPredictor; mountLanding where mountPrinter was, after the ops core
// and before HOLLOW, so a launch wins a same-tick bite; registerLandingKeys (landing-controls.ts) with
// { confirm: askInline }.
//
// FOUNDATION SKELETON (slice 1a F2 and its follow-up): the final signatures, with the launch path, touchdowns, the
// window state and its edge events (LandingState.window: the ONE source of truth for "window open"), END LANDING, the
// risk-7 auto-end, forceLandAll and the end of the landing working, so the run reaches the LANDING REPORT and goes on.
// Track SIM fills the rest: TODO(slice1a-SIM): the bay's game tick (cadence and reload in world time), the GET READY
// beeps before a window, the controller hook, 'pod-entry', and the first touchdown's radio line and beats.
//
// Readers: only this module, guidance's countdowns and landing-hud read drop-cache; everything else (hollow's landMult,
// pace, the chips, the alerts, the tests) reads state.landing.

let dropRng: Rng | null = null;
let controller: LandingController | null = null;

// The seeded stream that places each pod inside its dot (§3.3: u uniform in [−1, 1]); one draw per launch.
function dropStream(state: Readonly<GameState>): Rng {
  if (!dropRng) dropRng = childRng(state.run.seed, state.run.shipIndex, 'drop');
  return dropRng;
}

function podsLeft(state: Readonly<GameState>): { aboard: number; falling: number } {
  let aboard = 0;
  let falling = 0;
  for (const record of state.landing.pods) {
    if (record.fate.kind === 'aboard') aboard++;
    else if (record.fate.kind === 'falling') falling++;
  }
  return { aboard, falling };
}

// --- The launch path -----------------------------------------------------------------------------------------------

// Run 1's very first pod falls slower (§4: the first landing's moment): the tutorial run, before any pod has left.
function descentSecFor(state: Readonly<GameState>): number {
  const firstOfRun = state.run.tutorial && state.run.ships.length === 0 && state.landing.pods.every((record) => record.fate.kind === 'aboard');
  return firstOfRun ? POD_FIRST_DESCENT_SEC : POD_DESCENT_SEC;
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
  store.update((draft) => {
    const record = draft.landing.pods.find((candidate) => candidate.pod === driver.pod);
    if (!record || record.fate.kind !== 'aboard') throw new Error(`launchDriver: pod ${driver.pod} is not aboard`);
    record.fate = { kind: 'falling', launch };
    if (spendBay) {
      if (draft.landing.bay.loaded < 1) throw new Error('launchDriver: the bay is empty');
      draft.landing.bay.loaded--;
      draft.landing.bay.cadenceLeftTac = cadenceTac;
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
    descentSec: descentSecFor(state),
  };
}

// Whether this asker may launch from the MIND: never the player; a controller only if it says so (like AUTOBURN), and
// only the controller that is active now.
function launchesFromMind(intent: LaunchIntent): boolean {
  if (intent.source === 'player') return false;
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
    const text = guard.ask === 'off-site'
      ? LAUNCH_CONFIRM_TEXT.offSite(state.landing.terrain, guard.points)
      : LAUNCH_CONFIRM_TEXT.full(guard.lz ?? '?', guard.points);
    return { kind: 'confirm', ask: guard.ask, points: guard.points, text };
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

// Every pod still aboard gets its final fate for `outcome` (§3.10: parked in orbit with why, or NOT LAUNCHED once the
// ship left orbit). In a draft. run.ts calls it for the in-orbit endings too. Returns how many were parked.
export function parkAboard(draft: GameState, outcome: ShipOutcome): number {
  let parked = 0;
  for (const record of draft.landing.pods) {
    if (record.fate.kind !== 'aboard') continue;
    record.fate = finalFateOfAboard(record as Readonly<PodRecord>, outcome);
    if (record.fate.kind === 'parked') parked++;
  }
  return parked;
}

// No more launches (§3.10): END LANDING, the risk-7 auto-end, or every pod away. The pods still aboard are parked in
// orbit NOW, not when the report opens, so the PARKED words, the beacons and L0 show while the report waits (LAST LIGHT's
// duel). Pods already falling still come down. MERGE (finale.ts) can reopen it: ended back to null, pods unparked.
function endNow(store: Store<GameState>, reason: LandingEnd): void {
  const state = store.getState();
  if (state.landing.ended !== null) throw new Error(`endNow: the landing already ended (${state.landing.ended})`);
  const outcome: ShipOutcome = state.burn.status === 'locked' ? 'locked' : 'partial';
  let parked = 0;
  store.update((draft) => {
    draft.landing.ended = reason;
    draft.landing.window = null;
    draft.landing.noDriverAiSec = 0;
    parked = parkAboard(draft, outcome);
  });
  if (parked > 0) emit('pods-parked', { count: parked });
  emit('landing-ended', { reason });
}

// The landing is over and the bells have rung out: FUEL is noted for its star (§3.9), and the LANDING REPORT opens.
function finishLanding(store: Store<GameState>): void {
  store.update((draft) => {
    draft.landing.lingerAiSec = null;
    draft.landing.fuelAtEndPct = draft.burn.fuelPct;
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

// Risk 7: pods aboard and none of their drivers in memory (eaten, dead) means nothing can launch any more; after
// LANDING_NONE_LEFT_SEC the landing ends by itself, so headless kids and AFK players never stall.
function noneLeftTick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  if (state.landing.ended !== null) return;
  const inMemory = new Set(driversInMemory(state).map((driver) => driver.pod));
  const stuck = state.landing.pods.some((record) => record.fate.kind === 'aboard')
    && !state.landing.pods.some((record) => record.fate.kind === 'aboard' && inMemory.has(record.pod));
  if (!stuck) {
    if (state.landing.noDriverAiSec !== 0) store.mutate((draft) => { draft.landing.noDriverAiSec = 0; });
    return;
  }
  const waited = state.landing.noDriverAiSec + dtAi;
  if (waited < LANDING_NONE_LEFT_SEC) {
    store.mutate((draft) => { draft.landing.noDriverAiSec = waited; });
    return;
  }
  endNow(store, 'no-driver-left');
}

function tick(store: Store<GameState>, dtAi: number): void {
  let state = store.getState();
  if (state.run.phase !== 'landing') return;
  // 1. Touchdowns, in the order the pods come down.
  const due = state.landing.pods
    .flatMap((record) => (record.fate.kind === 'falling' ? [{ pod: record.pod, at: record.fate.launch.atAi + record.fate.launch.descentSec }] : []))
    .filter((fall) => fall.at <= state.clock.aiSec)
    .sort((a, b) => a.at - b.at);
  for (const fall of due) touchDown(store, fall.pod);
  if (due.length > 0 && podsLeft(store.getState()).aboard === 0 && podsLeft(store.getState()).falling === 0) {
    emit('all-pods-down', {});
  }
  // 2. The window open now (state), and its edges.
  trackWindow(store);
  // 3. The bay, the controller, the beeps: TODO(slice1a-SIM) (see the header).
  // 4. No more launches: every pod away, or no driver left for the pods aboard (risk 7).
  if (store.getState().landing.ended === null && podsLeft(store.getState()).aboard === 0) endNow(store, 'all-launched');
  noneLeftTick(store, dtAi);
  // 5. The end: the landing has ended and nothing is still falling. The last bell rings out (LANDING_DONE_LINGER_SEC),
  // and HOLLOW's story beat and LAST LIGHT's finale are part of this ship: the report waits for them.
  state = store.getState();
  const left = podsLeft(state);
  const over = left.falling === 0 && state.landing.ended !== null;
  if (!over) return;
  const linger = state.landing.lingerAiSec;
  if (linger === null) {
    store.mutate((draft) => { draft.landing.lingerAiSec = LANDING_DONE_LINGER_SEC; });
    return;
  }
  const remaining = linger - dtAi;
  if (remaining > 0 || state.hollow.story === 'pending' || finalePending(state)) {
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
  const refusal = state.run.phase !== 'landing' ? 'NOT LANDING' : state.clock.paused ? 'PAUSED' : null;
  if (refusal) { emit('refused', { reason: refusal }); return refusal; }
  if (!driversInMemory(state).some((driver) => driver.pod === pod)) throw new Error(`setLoadNext: pod ${pod}'s driver is not in memory`);
  store.update((draft) => { draft.landing.loadNext = draft.landing.loadNext === pod ? null : pod; });
  return null;
}

// END LANDING (§3.10, after the POD BAY window's inline confirm): no more launches; pods still falling come down, then
// the pods left aboard are parked in orbit and the LANDING REPORT follows.
export function endLanding(store: Store<GameState>, reason: LandingEnd = 'end-landing'): string | null {
  const state = store.getState();
  const refusal = state.run.phase !== 'landing' ? 'NOT LANDING' : state.landing.ended !== null ? 'LANDING OVER' : null;
  if (refusal) { emit('refused', { reason: refusal }); return refusal; }
  endNow(store, reason);
  return null;
}

// The seam for AUTODROP (4c), the resident (5) and MERGE's last landing (7): one controller at a time, asked every AI
// tick (TODO(slice1a-SIM): the hook in tick). null takes it away. Slice 4 should resolve the controller from STATE each
// tick instead of holding it here: AUTODROP is a file HOLLOW can eat, and a module variable would outlive its file.
// requestLaunch accepts a non-player source only from the controller set here (launchesFromMind).
export function setLandingController(next: LandingController | null): void {
  controller = next;
}

export function landingController(): LandingController | null {
  return controller;
}

// Everything a controller may read (§3.14), live: the state, the current drop solution and Bay Ctrl's cadence.
export function landingView(state: Readonly<GameState>): LandingView {
  const sol = currentDropSolution();
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
      arc: [], descentSec: 0,
    };
    launchDriver(store, driver, launch, false);
    touchDown(store, driver.pod);
    landed++;
  }
  const after = store.getState();
  if (after.landing.ended === null) endNow(store, podsLeft(after).aboard > 0 ? 'end-landing' : 'all-launched');
  return landed;
}

// --- Mount ------------------------------------------------------------------------------------------------------------

let mounted = false;

export function mountLanding(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountLanding: already mounted');
  mounted = true;
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offReset = onWorldReset('landing', () => {
    dropRng = null;
    controller = null;
  }, () => ({ rolled: dropRng !== null, controller: controller !== null }));
  return () => {
    offTick();
    offReset();
    dropRng = null;
    controller = null;
    mounted = false;
  };
}
