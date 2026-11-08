// Slice 7b: Track DROP owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §4.2, §5.2), built from the FOUNDATION's
// signatures and its 'merge' resolver's registration (R24–R28; the Deviations (Track DROP 7b) in the plan).
//
// THE LAST LANDING (01-landing §3.17; 05 §3.7): after MERGE, the drivers HOLLOW ate on the final ship come back by radio at
// MERGE_DRIVER_INTEGRITY and their pods land on their own, before the final LANDING REPORT.
// • The start (startLastLanding, called by finale.ts verdictDone once the verdict has typed, gate up, with finale.restored):
//   in one update the FINALE goes 'verdict' → 'last-landing', landing.lastLanding is set (each pod's driver from
//   ending-rules restoredDriver; never in memory, R24), the pods are released (fate 'aboard', riding as beacons, R25), the
//   landing reopens (ended, the linger and the FUEL note cleared, as 7a's reopenLanding did), and the SHIP view is forced
//   (R26). Then the TERMINAL lists each pod (LAST_LANDING_TEXT.radio), the 'last-landing' input layer goes up, and
//   'last-landing-start' is emitted.
// • The flier (R27), decided once at the start: AUTODROP's effective version (capabilities skillLive), and whether a drop
//   solution exists (a dot, and an in-band window on this orbit); with none the pods drop blind.
//   - v2 / v3 fly through autodrop.ts autodropController(state, { version, queue, source: 'merge', armed, skipBetween, pass,
//     view }), deciding (and naming their next launch to pace and the strip) on THE LAST LANDING's view (lastLandingView: no
//     bay, R26). v2's pass is armed here, once per orbit, on the machine's own pass (LastLandingState.pass, the override's
//     `pass`: 7b review), with the counts [G] would prefill; the kid's AUTODROP machine is never written.
//   - v1 and blind are this file's own: one pod per window in the order the ship passes them, whatever the counts (a full
//     LZ means a mislanded pod). v1 times each pod (the window's centre plus AUTODROP's learned offset, inside the pod's
//     sure part: a window with none is no window for v1); blind takes every in-band window, its moment uniform within
//     ±(W/2 + BLIND_MARGIN_KM) of the LZ's centre (each turn on its own 'last-landing:<turn>' stream), its spread
//     ×BLIND_DROP_MULT (the intent's `blind`). The turn is LastLandingState.target, chosen by this file's AI tick, which
//     also launches it (requestLaunch, source 'merge'): Deviation 3, autodrop.ts autodropLaunched throws on an off-site pod.
//   - AUTODROP (any version) gets LAST_LANDING_AUTODROP_ORBITS; from then a pod it has not placed drops blind in the next
//     window.
//   - No drop solution (Nav Plotter dead or missing, 01 §3.17), at the start or mid-landing (a belt hit): blind. The drop
//     cache solves the geometry anyway while THE LAST LANDING runs (the pods' own motors find their fall; its dot is grey), so
//     the blind turns have windows; a flier that loses the plotter mid-landing turns blind there (7b review).
// • The pace (R26): every controller holds TACTICAL, names its next launch, and asks for the SKIP between windows
//   (AutodropOverride.skipBetween for v2/v3, the same rule here for v1 and blind). The cadence (LastLandingState.
//   cadenceLeftSec, set by landing.ts launchDriver) counts down in tactical s of world time, as the bay's does.
// • [ENTER] (skipLastLanding, R28): clock.advance in a loop at the clock's own step until the last landing is over, capped
//   at LAST_LANDING_SKIP_MAX_STEPS (throws). The same rules and streams fly it.
// • The end: every restored pod down (or parked as the landing ended), nothing of theirs falling: landing.lastLanding
//   cleared and the FINALE 'done' in the same update (the codec refuses lastLanding set at ENDING CHOSEN), then
//   'last-landing-end'. Nothing to fly for LANDING_NONE_LEFT_SEC (no drop dot, no in-band window: the ship out of the band)
//   ends the landing first. A ship lost mid-landing (orbit-sim endLandingLost: the landing ends 'ship-lost' under the LOST
//   card, the clock paused, so no AI tick comes) ends it in the post tick (7b review).
// Module-level state: none of the game's (the machine is landing.lastLanding, the resolver is in the registry); `closeLayer`
// is the input layer's handle (UI glue, let go at the end, the unmount and every world reset), and `mounted` the mount guard.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { DropSolution, LandingController, LandingView } from '@/types/landing';
import type { LastLandingState, LastLandingTarget } from '@/types/ending';
import { activeLandingController, registerLandingController } from '@systems/landing-controller';
import { autodropController } from '@systems/autodrop';
import { endLanding, requestLaunch } from '@systems/landing';
import { dropFactors, landingView as landingViewOf, launchQueue, nextToLaunch } from '@systems/landing-rules';
import { autodropOffsetTac, passRows, podSureSpan, windowsAhead, type WindowAt } from '@systems/autodrop-plan';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { getDropSolution } from '@systems/drop-cache';
import { capabilitiesNow, skillLive } from '@systems/capabilities';
import { advance, onAiTick, onGameTick, onPostTick, setPaused } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say, markChannelRead, visibleChannel } from '@systems/say';
import { pushModal, registerKeys } from '@systems/input';
import { togglePause } from '@systems/pace';
import { toggleMuted } from '@systems/audio';
import { cancelTool } from '@systems/fs-tools';
import { visitRng } from '@systems/map-streams';
import { restoredDriver } from '@systems/ending-rules';
import { LAST_LANDING_TEXT } from '@data/last-landing-text';
import {
  AUTODROP_EDGE_MARGIN_TAC, BAY_SLOTS, BLIND_MARGIN_KM, LANDING_NONE_LEFT_SEC, LAST_LANDING_AUTODROP_ORBITS,
  LAST_LANDING_CADENCE_SEC, LAST_LANDING_SKIP_MAX_STEPS, TICK_MS,
} from '@data/tuning';

// How many passes ahead a turn looks for its window (one pod per window: a full pass of windows, plus the next).
const TURN_PASSES = 3;

// --- Reading the machine -------------------------------------------------------------------------------------------------

function machineOf(state: Readonly<GameState>): Readonly<LastLandingState> | null {
  return state.landing.lastLanding;
}

// The landing goes on under THE LAST LANDING (it may launch).
function flying(state: Readonly<GameState>): boolean {
  return state.landing.lastLanding !== null && state.run.phase === 'landing' && state.landing.ended === null;
}

// AUTODROP v2/v3 fly the pods now: their flier, within their orbits, with a drop solution (a plotter lost this tick turns the
// flier blind in the AI tick; until then AUTODROP does not fly on the plotter-free geometry).
function autodropFlies(state: Readonly<GameState>, ll: Readonly<LastLandingState>): boolean {
  return (ll.flier === 'v2' || ll.flier === 'v3') && ll.autodropUntilTSec !== null && state.clock.tSec < ll.autodropUntilTSec
    && capabilitiesNow(state).drop.solution;
}

// v2's pass before its first arm: nothing to send.
const NO_PASS = { pass: {}, sent: {}, armedAtTSec: null } as const;

// A drop solution AUTODROP or a blind drop can fly on: a dot, and an in-band window on this orbit (launchRefusal lets no
// launch through without both).
function solvable(sol: Readonly<DropSolution> | null, nowTSec: number): sol is DropSolution {
  return sol !== null && sol.block === null && sol.dot !== null && windowsAhead(sol, nowTSec, 1).length > 0;
}

// THE LAST LANDING's view (R26: no bay): the pods leave from no bay, so a controller sees a full one with its own cadence
// (LAST_LANDING_CADENCE_SEC, tactical s) and Bay Ctrl is not read. Exported for the suites; `view` is the landing's.
export function lastLandingView(state: Readonly<GameState>, view: Readonly<LandingView>): LandingView {
  const ll = machineOf(state);
  if (ll === null) throw new Error('lastLandingView: THE LAST LANDING is not running');
  return {
    ...view,
    bay: {
      loaded: BAY_SLOTS, reloadTac: 0, cadenceLeftTac: ll.cadenceLeftSec, cadenceTac: LAST_LANDING_CADENCE_SEC,
      shown: Math.min(BAY_SLOTS, view.queue.length),
    },
  };
}

// --- The controllers (R27) -----------------------------------------------------------------------------------------------

// The 'merge' resolver (landing-controller.ts: first in LANDING_CONTROLLER_ORDER): THE LAST LANDING's controller while it
// flies, else null. While it flies it always answers, so neither the kid's hands nor another source fly a restored pod.
// Hot path (asked every tick by the landing, pace and the strip).
export function lastLandingController(state: Readonly<GameState>): LandingController | null {
  const ll = machineOf(state);
  if (ll === null || !flying(state)) return null;
  if (autodropFlies(state, ll)) {
    const v3 = ll.flier === 'v3';
    const inner = autodropController(state, {
      version: v3 ? 3 : 2, queue: launchQueue(state).map((driver) => driver.pod), source: 'merge', armed: v3 ? 'plan' : 'pass',
      skipBetween: true, pass: ll.pass ?? NO_PASS, view: lastLandingView,
    });
    // Between windows it always asks for the SKIP, whatever AUTODROP has planned: with nothing planned (no sure window for
    // any pod) its orbits would otherwise pass at CRUISE with nobody to press SKIP (pace still stops the SKIP before every
    // window and every planned launch, and refuses it inside an open one).
    if (inner !== null) {
      return { ...inner, decide: (view, now) => inner.decide(view, now) ?? (now.landing.window === null ? 'skip' : null) };
    }
  }
  return turnController;
}

// v1 and blind: the turn (LastLandingState.target) is chosen and launched by this file's AI tick; the controller holds
// TACTICAL for it, names it to pace and the strip, and asks for the SKIP between windows (the rule skipBetween gives v2/v3).
const turnController: LandingController = {
  source: 'merge',
  holdsTactical: true,
  launchesFromMind: true,
  decide: (_view, state) => {
    const target = state.landing.lastLanding?.target ?? null;
    if (target === null) return null;
    return state.landing.window === null && target.atTSec > state.clock.tSec ? 'skip' : null;
  },
  nextLaunchAtTSec: (state) => state.landing.lastLanding?.target?.atTSec ?? null,
  waitsFor: (state) => {
    const target = state.landing.lastLanding?.target ?? null;
    return target === null ? null : { lz: target.lz, n: 1, atTSec: target.atTSec };
  },
};

// A blind turn's draw: u uniform in [−1, 1] from this turn's own stream (R27: 'last-landing'), so a skipped landing and a
// watched one roll the same moments.
function blindDraw(state: Readonly<GameState>, turn: number): number {
  return visitRng(state.run, `last-landing:${turn}`)() * 2 - 1;
}

// The next pod's turn (v1 or blind; null: no pod to fly, or no window ahead): the first window, by centre, that has not had
// its turn. v1's turn is the pod's sure part (the centre plus AUTODROP's learned offset, an edge margin in) and only before
// AUTODROP's orbits run out; past them, and for a blind flier, the blind turn (every in-band window, whatever the counts).
export function nextTurn(state: Readonly<GameState>, ll: Readonly<LastLandingState>, sol: Readonly<DropSolution>): LastLandingTarget | null {
  const driver = nextToLaunch(state);
  if (driver === null) return null;
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;
  const lzOf = (win: Readonly<WindowAt>) => {
    const lz = state.landing.lzs.find((candidate) => candidate.label === win.lz);
    if (lz === undefined) throw new Error(`last-landing: a window for an unknown LZ '${win.lz}'`);
    return lz;
  };
  // A window's turn is over once its centre is passed; the solution re-solved after a launch (the next pod's dot, a drag
  // kick) moves the same window's centre by a hair, so "passed" allows half the window's length.
  const wins = windowsAhead(sol, now, TURN_PASSES).sort((a, b) => a.centre - b.centre)
    .filter((win) => win.centre > ll.passedTSec + (win.close - win.open) / 2);
  const deadline = ll.autodropUntilTSec;
  if (ll.flier === 'v1' && deadline !== null && now < deadline) {
    const offset = autodropOffsetTac(state) * warp;
    const margin = AUTODROP_EDGE_MARGIN_TAC * warp;
    const factors = dropFactors(capabilitiesNow(state), driver);
    for (const win of wins) {
      const span = podSureSpan(win, lzOf(win), dropHalfWidthKm(win.launchRadius, state.level.planet.R, factors));
      if (span === null) continue;
      // The last moment is an edge margin inside the sure part (the AI tick launches up to a tick late), and the moment a
      // margin before that, so a tick always falls between them.
      const untilTSec = span.hi - margin;
      const lo = Math.max(span.lo, now);
      if (untilTSec - margin <= lo) continue;
      const atTSec = Math.min(untilTSec - margin, Math.max(lo, win.centre + offset));
      // A pod v1 cannot place before its orbits run out drops blind in the next window after them.
      if (atTSec >= deadline) break;
      return { lz: win.lz, centreTSec: win.centre, atTSec, untilTSec, blind: false };
    }
  }
  for (const win of wins) {
    if (deadline !== null && win.centre <= deadline) continue;
    const halfKm = lzOf(win).widthKm / 2;
    const reach = ((win.close - win.open) / 2) * ((halfKm + BLIND_MARGIN_KM) / halfKm);
    const atTSec = Math.max(now, win.centre + blindDraw(state, ll.turns) * reach);
    // A tactical second's grace past the last moment, so a tick always falls on a moment drawn at the margin's edge.
    return { lz: win.lz, centreTSec: win.centre, atTSec, untilTSec: Math.max(atTSec, win.centre + reach) + warp, blind: true };
  }
  return null;
}

// --- The start (R24–R27) -------------------------------------------------------------------------------------------------

// THE LAST LANDING starts with MERGE's restored pods (finale.ts verdictDone, gate up; `pods` is finale.restored, in pod
// order, never empty). Each must still be in the ship's orbit (aboard, or parked restorable: R25).
export function startLastLanding(store: Store<GameState>, pods: readonly number[]): void {
  const state = store.getState();
  if (state.hollow.finale.phase !== 'verdict') throw new Error(`startLastLanding: the FINALE is '${state.hollow.finale.phase}', not 'verdict'`);
  if (state.landing.lastLanding !== null) throw new Error('startLastLanding: THE LAST LANDING is already running');
  if (state.run.phase !== 'landing') throw new Error(`startLastLanding: not landing (${state.run.phase})`);
  if (pods.length === 0) throw new Error('startLastLanding: no pod to restore');
  const records = pods.map((pod) => {
    const record = state.landing.pods.find((candidate) => candidate.pod === pod);
    if (record === undefined) throw new Error(`startLastLanding: no pod ${pod} on this ship`);
    const inOrbit = record.fate.kind === 'aboard' || (record.fate.kind === 'parked' && record.fate.restorable);
    if (!inOrbit) throw new Error(`startLastLanding: pod ${pod} is not in the ship's orbit (${record.fate.kind})`);
    return record;
  });
  const now = state.clock.tSec;
  const sol = getDropSolution();
  const version = skillLive(state.memory, 'autodrop').version;
  const blind = version < 1 || !capabilitiesNow(state).drop.solution || !solvable(sol, now);
  const flier: LastLandingState['flier'] = blind ? 'blind' : version >= 3 ? 'v3' : version === 2 ? 'v2' : 'v1';
  const autodropUntilTSec = flier === 'blind' || sol === null ? null : now + LAST_LANDING_AUTODROP_ORBITS * sol.periodSec;
  const machine: LastLandingState = {
    pods: [...pods], drivers: records.map((record) => restoredDriver(record)), flier, orbitsFlown: 0, cadenceLeftSec: 0,
    skipped: false, startTSec: now, autodropUntilTSec, passedTSec: now, turns: 0, target: null, stuckAiSec: 0, pass: null,
  };
  const fromMode = state.ui.mode;
  if (fromMode !== 'tools' && state.ui.activeTool) cancelTool(store);
  store.update((draft) => {
    draft.hollow.finale.phase = 'last-landing';
    draft.landing.lastLanding = machine;
    for (const record of draft.landing.pods) if (pods.includes(record.pod)) record.fate = { kind: 'aboard' };
    draft.landing.ended = null;
    draft.landing.lingerAiSec = null;
    draft.landing.fuelAtEndPct = null;
    draft.landing.goLow = null;
    draft.landing.declined = null;
    draft.landing.noDriverAiSec = 0;
    draft.ui.mode = 'tools';
    markChannelRead(draft, visibleChannel('tools'));
    draft.ui.memoryRev++;
  });
  if (fromMode !== 'tools') emit('mode-change', { from: fromMode, to: 'tools' });
  for (const record of records) say('cmd', LAST_LANDING_TEXT.radio(record.pod, record.family), { critical: true });
  if (closeLayer !== null) throw new Error('startLastLanding: the input layer is already up');
  closeLayer = pushModal('last-landing');
  emit('last-landing-start', { pods: pods.length, flier });
}

// --- The tick ------------------------------------------------------------------------------------------------------------

// Every restored pod is down, or parked as the landing ended, and none of them falls: THE LAST LANDING is over.
function settled(state: Readonly<GameState>, ll: Readonly<LastLandingState>): boolean {
  return ll.pods.every((pod) => {
    const kind = state.landing.pods.find((record) => record.pod === pod)?.fate.kind;
    if (kind === undefined) throw new Error(`last-landing: pod ${pod} is gone from the ship`);
    return kind !== 'aboard' && kind !== 'falling';
  });
}

// The end: the machine cleared and the FINALE decided in one update (v2's pass goes with it: the kid's AUTODROP machine was
// never written), the input layer down, then 'last-landing-end' with the restored pods that came down in an LZ with room.
function finish(store: Store<GameState>): void {
  const state = store.getState();
  const ll = machineOf(state);
  if (ll === null) throw new Error('last-landing finish: not running');
  if (state.hollow.finale.phase !== 'last-landing') throw new Error(`last-landing finish: the FINALE is '${state.hollow.finale.phase}'`);
  const landed = ll.pods.filter((pod) => {
    const fate = state.landing.pods.find((record) => record.pod === pod)?.fate;
    return fate?.kind === 'down' && fate.touchdown.place === 'lz';
  }).length;
  store.update((draft) => {
    draft.landing.lastLanding = null;
    draft.hollow.finale.phase = 'done';
  });
  letGoOfLayer();
  emit('last-landing-end', { landed });
}

// v2's pass (R27: re-armed each orbit): the counts [G] would prefill (the POD BAY's rows on THE LAST LANDING's view: each
// LZ's room, what its window this pass can fly), written on the machine's own pass (LastLandingState.pass, the override's
// `pass`); and this pass's sent counts, from the 'merge' launches since it was armed (autodrop.ts counts only its own).
function passTick(store: Store<GameState>, sol: Readonly<DropSolution>): void {
  const state = store.getState();
  const now = state.clock.tSec;
  const ad = machineOf(state)!.pass;
  if (ad === null || now >= ad.armedAtTSec + sol.periodSec) {
    const view = lastLandingView(state, landingViewOf(state, sol, capabilitiesNow(state).bay.cadenceTac));
    const pass: Record<string, number> = {};
    for (const row of passRows(state, view, view.remaining)) pass[row.lz] = Math.min(row.fits, row.bayHas ?? row.fits);
    store.update((draft) => { draft.landing.lastLanding!.pass = { pass, sent: {}, armedAtTSec: now }; });
    return;
  }
  const sent: Record<string, number> = {};
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'falling' && record.fate.kind !== 'down') continue;
    const launch = record.fate.launch;
    if (launch.source !== 'merge' || launch.aimLz === null || launch.atTSec < ad.armedAtTSec) continue;
    sent[launch.aimLz] = (sent[launch.aimLz] ?? 0) + 1;
  }
  const same = Object.keys({ ...sent, ...ad.sent }).every((lz) => (sent[lz] ?? 0) === (ad.sent[lz] ?? 0));
  if (!same) store.update((draft) => { draft.landing.lastLanding!.pass!.sent = sent; });
}

// v1 and blind: the turn chosen when none stands, launched once its moment has come (refused, it tries again each tick:
// RELOADING, the band), and given up once its last moment has passed. A launched or given-up turn is that window's.
function turnTick(store: Store<GameState>, sol: Readonly<DropSolution>): void {
  const state = store.getState();
  const ll = machineOf(state)!;
  const now = state.clock.tSec;
  const target = ll.target;
  const done = (turn: Readonly<LastLandingTarget>): void => {
    store.update((draft) => {
      const machine = draft.landing.lastLanding!;
      machine.passedTSec = Math.max(machine.passedTSec, turn.centreTSec);
      machine.turns++;
      machine.target = null;
    });
  };
  if (target === null) {
    const next = nextTurn(state, ll, sol);
    if (next !== null) store.update((draft) => { draft.landing.lastLanding!.target = next; });
    return;
  }
  if (now < target.atTSec) return;
  if (now > target.untilTSec) {
    done(target);
    return;
  }
  if (activeLandingController(state)?.source !== 'merge') throw new Error('last-landing: the \'merge\' controller is not flying THE LAST LANDING');
  const result = requestLaunch(store, target.blind ? { source: 'merge', blind: true } : { source: 'merge' });
  if (result.kind === 'confirm') throw new Error(`last-landing: a launch asked to confirm (${result.ask}) during THE LAST LANDING`);
  if (result.kind === 'launched') done(target);
}

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  const ll = machineOf(state);
  if (ll === null || state.run.phase !== 'landing') return;
  if (settled(state, ll)) {
    finish(store);
    return;
  }
  if (state.landing.ended !== null) return;
  const now = state.clock.tSec;
  const sol = getDropSolution();
  if (!solvable(sol, now)) {
    // Nothing can fly on this orbit (no drop dot, no in-band window: launchRefusal refuses every launch): the landing ends
    // after LANDING_NONE_LEFT_SEC, as the landing's own auto-ends do, and the pods still aboard are parked.
    const waited = ll.stuckAiSec + dtAi;
    store.mutate((draft) => { draft.landing.lastLanding!.stuckAiSec = waited; });
    if (waited >= LANDING_NONE_LEFT_SEC) endLanding(store, 'no-drop');
    return;
  }
  if (ll.stuckAiSec !== 0) store.mutate((draft) => { draft.landing.lastLanding!.stuckAiSec = 0; });
  // The plotter lost mid-landing (a belt hit; the MIND is shut, so nothing repairs it): no drop solution, so every pod left
  // drops blind from here (R27), and the strip says so.
  if (ll.flier !== 'blind' && !capabilitiesNow(state).drop.solution) {
    store.update((draft) => {
      const machine = draft.landing.lastLanding!;
      machine.flier = 'blind';
      machine.autodropUntilTSec = null;
      machine.target = null;
      machine.pass = null;
    });
    return;
  }
  const orbits = Math.min(LAST_LANDING_AUTODROP_ORBITS, Math.floor((now - ll.startTSec) / sol.periodSec));
  if (ll.autodropUntilTSec !== null && orbits !== ll.orbitsFlown) store.update((draft) => { draft.landing.lastLanding!.orbitsFlown = orbits; });
  if (autodropFlies(state, ll)) {
    if (ll.flier === 'v2') passTick(store, sol);
    return;
  }
  turnTick(store, sol);
}

// R26: the cadence between launches, in tactical s of world time (a SKIP crosses it at once, as it refills the bay).
function cadenceTick(store: Store<GameState>, dtWorld: number): void {
  const state = store.getState();
  const ll = machineOf(state);
  if (ll === null || ll.cadenceLeftSec <= 0 || state.run.phase !== 'landing') return;
  const left = Math.max(0, ll.cadenceLeftSec - dtWorld / state.level.tacticalWarp);
  store.mutate((draft) => { draft.landing.lastLanding!.cadenceLeftSec = left; });
}

// A ship lost mid-landing (orbit-sim endLandingLost; landing.ts closes the landing 'ship-lost' in its post tick, its pods
// aboard NOT LAUNCHED): THE LAST LANDING is over with it. The clock is paused under the LOST card, so no AI tick would end it,
// and [ENTER]'s loop would spin to its cap. Run in the post tick, after landing.ts's.
function lostTick(store: Store<GameState>): void {
  const state = store.getState();
  if (state.landing.lastLanding !== null && state.landing.ended === 'ship-lost') finish(store);
}

// --- [ENTER] (R28) -------------------------------------------------------------------------------------------------------

// [ENTER] SKIP TO THE END: THE LAST LANDING flown to its end now, by the same rules and streams (a skipped result may differ
// from a watched one only by tick granularity): the clock's own step, a paused clock let go first. A machine that does not
// end within LAST_LANDING_SKIP_MAX_STEPS is a bug, said loudly.
export function skipLastLanding(store: Store<GameState>): void {
  const state = store.getState();
  if (state.landing.lastLanding === null) throw new Error('skipLastLanding: THE LAST LANDING is not running');
  if (state.clock.paused && !setPaused(store, false)) throw new Error('skipLastLanding: the clock will not run (the ship is not live)');
  store.update((draft) => { draft.landing.lastLanding!.skipped = true; });
  for (let step = 0; step < LAST_LANDING_SKIP_MAX_STEPS; step++) {
    if (store.getState().landing.lastLanding === null) return;
    advance(store, TICK_MS / 1000);
  }
  throw new Error(`skipLastLanding: THE LAST LANDING did not end in ${LAST_LANDING_SKIP_MAX_STEPS} steps`);
}

// --- Mount ---------------------------------------------------------------------------------------------------------------

let mounted = false;
let closeLayer: (() => void) | null = null;

function letGoOfLayer(): void {
  closeLayer?.();
  closeLayer = null;
}

// Mounted after the FINALE (main.ts, wp6/harness6): the 'merge' resolver joins the controller registry, the AI tick (the
// turns, v2's pass, the end), the game tick (the cadence), the post tick (a ship lost mid-landing), the 'last-landing'
// layer's keys ([ENTER], P, M) and the reset.
export function mountLastLanding(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountLastLanding: already mounted');
  mounted = true;
  const offResolver = registerLandingController('merge', lastLandingController);
  const offAi = onAiTick((dtAi) => tick(store, dtAi));
  const offGame = onGameTick((dtWorld) => cadenceTick(store, dtWorld));
  const offPost = onPostTick(() => lostTick(store));
  const offKeys = registerKeys({
    layer: 'last-landing',
    codes: ['Enter', 'NumpadEnter', 'KeyP', 'KeyM'],
    onDown: (code) => {
      if (code === 'KeyP') togglePause(store);
      else if (code === 'KeyM') toggleMuted();
      else if (store.getState().landing.lastLanding !== null) skipLastLanding(store);
    },
  });
  const offReset = onWorldReset('last-landing', letGoOfLayer, () => ({ layer: closeLayer !== null }));
  return () => {
    offResolver();
    offAi();
    offGame();
    offPost();
    offKeys();
    offReset();
    letGoOfLayer();
    mounted = false;
  };
}
