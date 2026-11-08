// Slice 1a, Track SIM: the landing's pace (01-landing §3.12, plan §1.6). On HALCYON (two LZs: LZ-A 3, LZ-B 2) from a
// constructed lock (the first window is whichever LZ the dot reaches first: `first`, filled; then `other`): the warps switch to LANDING's own at the lock; CRUISE between windows, TACTICAL from
// WINDOW_TACTICAL_LEAD_TAC before an awaited window's launch moment (where its whole dot first fits), inside it, while a
// pod falls and with an alarm; a SKIP lands 8 tac s before the target's launch moment (straight into GET READY and its
// 5…1 beeps, ending on LAUNCH NOW) as one exact conic jump; WINDOW OPEN and PODS IN
// FLIGHT refuse it; a full LZ's window neither holds TACTICAL nor stops a SKIP; a controller that drops inside a SKIP
// (holdsTactical false) lifts the window rule, and AUTODROP's armed controller keeps it (4c, R7); OVERCLOCK covers the landing.
import { check, finish } from './checks';
import { lockOn } from './harness-landing';
import { createHarness5 } from '../wp5/harness5';
import { createInitialState } from '@state/initial';
import { phase2Ship } from '../support/hollow-world';
import { resetWorld } from '@systems/reset';
import { requestLaunch } from '@systems/landing';
import { activeLandingController, registerLandingController, windowRuleHolds } from '@systems/landing-controller';
import { giveSkillFile } from '../support/skills';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { choosePace, isOverclocked, requestSkip, skipBlockReason, windowLaunchInSec } from '@systems/pace';
import { getPrediction } from '@systems/predict';
import { getDropSolution } from '@systems/drop-cache';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { buildLandingContext, landingObjective } from '@systems/landing-guidance';
import { landingFlightOf } from '@systems/guidance';
import { launchMomentInSec } from '@systems/landing-rules';
import { secFromNow } from '@systems/landing-solve';
import { propagateConic, type OrbitState } from '@/types/orbit';
import { DRIVER_RULES } from '@data/script';
import { LANDING_SKIP_REFUSAL } from '@data/landing-text';
import { LANDING_CRUISE_WARP, LANDING_TACTICAL_WARP, WINDOW_TACTICAL_LEAD_TAC } from '@data/tuning';
import type { GameState } from '@state/schema';

const SHIP = 1;  // HALCYON
const h = createHarness5(1, { soulsFound: true });
h.resetTo('flight', 1);
h.store.update((draft) => {
  Object.assign(draft, createInitialState({ seed: 1, shipIndex: SHIP, carried: 'fresh' }));
  draft.hollow.phase = 'dormant';
  draft.director.done.push(...DRIVER_RULES.map((rule) => rule.id), 'engine-io-fault');
});
resetWorld();
// Track RETIRE: run 1's arm HALCYON with phase 2's racks and landing (LZ-A 3 / LZ-B 2: a full LZ before the other,
// support/hollow-world phase2Ship); run 1's own splits 4 / 1. HOLLOW stays asleep.
phase2Ship(h.store, 1);
h.store.update((draft) => { draft.hollow.phase = 'dormant'; });
const state = (): GameState => h.store.getState();
const warp = (): number => state().level.tacticalWarp;
const toWindowTac = (): number | null => { const sec = windowLaunchInSec(state()); return sec === null ? null : sec / warp(); };
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const table = (): ReturnType<typeof landingObjective> => landingObjective(buildLandingContext(state(), getDropSolution(), skipBlockReason(state(), getPrediction()) === null,
  landingFlightOf(state(), getPrediction())));

// --- The lock -----------------------------------------------------------------------------------------------------------
const flightWarps = [state().level.tacticalWarp, state().level.cruiseWarp];
lockOn(h);
check(`the warps switch at the lock: ${flightWarps.join('/')} → ${LANDING_TACTICAL_WARP}/${LANDING_CRUISE_WARP}`,
  flightWarps[0] !== LANDING_TACTICAL_WARP && state().level.tacticalWarp === LANDING_TACTICAL_WARP
  && state().level.cruiseWarp === LANDING_CRUISE_WARP && state().run.phase === 'landing');
{
  // The window countdown runs in tactical seconds from the first tick: it falls by the world's warp over the tactical
  // warp each tick, gliding up toward CRUISE's cruise/tactical × dt and never past it: no jump (the header's ▼/▲
  // countdown gives way to it at the lock, §3.2).
  const counts: number[] = [];
  for (let i = 0; i < 12; i++) { h.step(); counts.push(toWindowTac() ?? NaN); }
  const steps = counts.slice(1).map((value, i) => counts[i]! - value);
  const most = 0.05 * LANDING_CRUISE_WARP / LANDING_TACTICAL_WARP;
  check('CRUISE between windows after the lock', state().clock.pace === 'cruise', state().clock.pace);
  check('the window countdown falls smoothly from the lock, no jump', steps.every((step, i) => step > 0 && step <= most + 1e-9
    && (i === 0 || Math.abs(step - steps[i - 1]!) < 0.01)), `${steps.map((step) => step.toFixed(4)).join(' ')} (at most ${most})`);
  check('the strip says WAIT with [F] to SKIP', table().row === 'L13' && table().keys.includes('F') && /\[F\] to SKIP/.test(table().text), table().text);
}

// --- SKIP to the window: 8 tac s before it, one exact conic jump --------------------------------------------------------
{
  const startOrbit: OrbitState = { ...state().orbit };
  const startT = state().clock.tSec;
  const target = toWindowTac();
  const beepsBefore = h.events.length;
  const skip = requestSkip(h.store);
  const wall = h.stepUntil(() => state().clock.skipWarp === null && state().clock.pace !== 'skip', 30);
  const left = toWindowTac();
  const exact = propagateConic(startOrbit, state().level.planet.mu, state().clock.tSec - startT);
  const missKm = Math.hypot(exact.x - state().orbit.x, exact.y - state().orbit.y);
  check('F starts a SKIP to the window', skip.ok && target !== null && target > WINDOW_TACTICAL_LEAD_TAC, `${target?.toFixed(0)} tac s ahead`);
  check(`the SKIP lands ${WINDOW_TACTICAL_LEAD_TAC} tac s before the window, at TACTICAL`, left !== null
    && near(left, WINDOW_TACTICAL_LEAD_TAC, 0.2) && state().clock.pace === 'tactical', `${left?.toFixed(3)} tac s left, ${state().clock.pace}`);
  check('the landing SKIP is one exact conic jump (no sub-step drift)', missKm < 1e-3, `${missKm.toExponential(2)} km from the conic`);
  console.log(`INFO  the SKIP to the window took ${wall.toFixed(1)} real s`);
  check('GET READY right after the SKIP', table().row === 'L7' && /GET READY/.test(table().text), table().text);
  // The 5…1 beeps on the way to the launch moment.
  h.stepUntil(() => state().landing.window?.sure === true, 30);
  const beeps = h.events.slice(beepsBefore).filter((event) => event.name === 'countdown-beep'
    && (event.payload as { kind: string }).kind === 'window').map((event) => (event.payload as { secLeft: number }).secLeft);
  check('GET READY beeps 5, 4, 3, 2, 1 (countdown-beep kind window)', beeps.join() === '5,4,3,2,1', beeps.join());
  check('the window is open: TACTICAL, LAUNCH NOW, and SKIP refused WINDOW OPEN', state().clock.pace === 'tactical'
    && table().row === 'L4' && skipBlockReason(state(), getPrediction()) === LANDING_SKIP_REFUSAL.windowOpen,
    `${state().clock.pace} · ${table().text} · ${skipBlockReason(state(), getPrediction())}`);
  check('OVERCLOCK covers the landing (TAB at TACTICAL)', isOverclocked({ ...state(), ui: { ...state().ui, mode: 'memory' } }, 'tactical', getPrediction()));
}

// --- Fill the first LZ, and launch its last pod late so it is still falling when the window closes ----------------------
const first = state().landing.window?.lz ?? '?';
const firstCount = state().landing.lzs.find((lz) => lz.label === first)?.pods ?? 0;
const other = state().landing.lzs.find((lz) => lz.label !== first)?.label ?? '?';
{
  const closeInTac = (): number => {
    const sol = getDropSolution();
    const w = sol?.windows.find((candidate) => candidate.lz === state().landing.window?.lz);
    if (!sol || !w || w.inBandCloseInSec === null) return NaN;
    return secFromNow(sol, w.inBandCloseInSec, state().clock.tSec) / warp();
  };
  const launches: string[] = [];
  for (let i = 0; i < firstCount - 1; i++) {
    h.stepUntil(() => state().landing.bay.cadenceLeftTac <= 0, 10);
    launches.push(requestLaunch(h.store, { source: 'player' }).kind);
  }
  // The last: in the window's last 2 tactical seconds.
  h.stepUntil(() => closeInTac() < 2, 30);
  launches.push(requestLaunch(h.store, { source: 'player' }).kind);
  h.stepUntil(() => state().landing.window === null, 10);
  const falling = state().landing.pods.filter((record) => record.fate.kind === 'falling').length;
  check(`${firstCount} launches fill ${first}`, launches.length === firstCount && launches.every((kind) => kind === 'launched'), launches.join());
  check('a pod falling after the window: TACTICAL, and SKIP refused PODS IN FLIGHT', falling > 0 && state().clock.pace === 'tactical'
    && skipBlockReason(state(), getPrediction()) === LANDING_SKIP_REFUSAL.podsInFlight,
    `${falling} falling, ${state().clock.pace}, ${skipBlockReason(state(), getPrediction())}`);
  h.stepUntil(() => !state().landing.pods.some((record) => record.fate.kind === 'falling'), 10);
  check('the pods down: CRUISE again', (h.step(), state().clock.pace === 'cruise'), state().clock.pace);
}

// --- With the first LZ full, its window is not waited for --------------------------------------------------------------
{
  const sol = getDropSolution();
  const target = windowLaunchInSec(state());
  const otherWindow = sol?.windows.find((w) => w.lz === other);
  const toOther = sol && otherWindow ? launchMomentInSec(sol, otherWindow, state().clock.tSec) : null;
  check(`the SKIP's target is ${other}, the LZ with room`, target !== null && toOther !== null && near(target, toOther, 1e-6),
    `${target?.toFixed(0)} vs ${other} ${toOther?.toFixed(0)} game s`);
  // The full LZ's window as if it were open now: it holds neither TACTICAL nor the SKIP, and the strip says to hold the pods.
  const pred = getPrediction();
  // Track RETIRE: on run 1's arm HALCYON the late pod above (launched in the in-band window's last 2 tac s, its spread past
  // the bracket) can come down off-site, and then the first LZ is not full: the full LZ is written here, the late pod down
  // in it, as the classic HALCYON's seed landed it.
  const landing = structuredClone(state().landing);
  for (const record of landing.pods) {
    if (record.fate.kind === 'down' && record.fate.touchdown.place !== 'lz') record.fate.touchdown = { ...record.fate.touchdown, place: 'lz', lz: first, missKm: null };
  }
  const open: GameState = { ...state(), landing: { ...landing, window: { lz: first, sure: true } } };
  check('a full LZ\'s open window passes at CRUISE', choosePace(open, pred, false, 0.05) === 'cruise', choosePace(open, pred, false, 0.05));
  check('...does not refuse a SKIP', skipBlockReason(open, pred) !== LANDING_SKIP_REFUSAL.windowOpen, String(skipBlockReason(open, pred)));
  const line = landingObjective(buildLandingContext(open, getDropSolution(), skipBlockReason(open, pred) === null, landingFlightOf(open, pred)));
  check(`...and the strip says ${first} FULL — hold the pods for ${other}`, line.row === 'L3'
    && line.text === `${first} FULL — hold the pods for ${other}`, line.text);
}

// --- An alarm, and a controller that drops inside a SKIP --------------------------------------------------------------
{
  const pred = getPrediction();
  raiseAlert(h.store, { id: 'test-alarm', layer: 'mind', severity: 'alarm', text: 'TEST ALARM', inhibitsSkip: true });
  check('an alarm holds TACTICAL and refuses the SKIP', choosePace(state(), pred, false, 0.05) === 'tactical'
    && skipBlockReason(state(), pred) === 'TEST ALARM', String(skipBlockReason(state(), pred)));
  clearAlert(h.store, 'test-alarm');
  const openB: GameState = { ...state(), landing: { ...state().landing, window: { lz: other, sure: true } } };
  check('an awaited window open: TACTICAL, WINDOW OPEN', choosePace(openB, pred, false, 0.05) === 'tactical'
    && skipBlockReason(openB, pred) === LANDING_SKIP_REFUSAL.windowOpen);
  // Slice 4c–4e (plan §2.4): a test resolver in the registry (AUTODROP's own is registered by mountLanding, and answers
  // null with no AUTODROP.skl), derived from the state each time pace asks.
  let holdsTactical = false;
  const off = registerLandingController('resident', () => ({ source: 'resident', holdsTactical, launchesFromMind: true, decide: () => null }));
  check('a controller that drops inside a SKIP lifts the window rule', choosePace(openB, pred, false, 0.05) === 'cruise'
    && skipBlockReason(openB, pred) !== LANDING_SKIP_REFUSAL.windowOpen);
  holdsTactical = true;
  check('a controller that holds TACTICAL keeps it', choosePace(openB, pred, false, 0.05) === 'tactical');
  off();
  check('…and with no controller the window rule holds again', choosePace(openB, pred, false, 0.05) === 'tactical'
    && skipBlockReason(openB, pred) === LANDING_SKIP_REFUSAL.windowOpen);
  // Slice 4c (plan R7): AUTODROP's own resolver, armed: its controller flies and holds TACTICAL (no drop inside a SKIP).
  const file = giveSkillFile(h.store, 'autodrop', 2);
  const armed: GameState = { ...openB, memory: state().memory, landing: { ...openB.landing, autodrop: { ...openB.landing.autodrop, armed: 'pass', armedAtTSec: state().clock.tSec } } };
  const controller = activeLandingController(armed);
  check('AUTODROP armed (R7): its controller flies from the MIND and keeps the window rule (TACTICAL, WINDOW OPEN)',
    controller?.source === 'autodrop' && controller.holdsTactical && controller.launchesFromMind && windowRuleHolds(armed)
      && choosePace(armed, pred, false, 0.05) === 'tactical' && skipBlockReason(armed, pred) === LANDING_SKIP_REFUSAL.windowOpen);
  check('…not armed and not held, AUTODROP flies nothing', activeLandingController(openB) === null);
  h.store.update((draft) => {
    draft.memory = draft.memory.map((seg) => (seg.id === file.id ? freeSegment(seg.size) : seg));
    mergeAdjacentFree(draft.memory);
    draft.ui.memoryRev++;
  });
}

// --- The SKIP flies to the other LZ (past the full one's next window when it comes first) -------------------------------
{
  const ok = requestSkip(h.store).ok;
  h.stepUntil(() => state().clock.skipWarp === null && state().clock.pace !== 'skip', 30);
  const left = toWindowTac();
  const sol = getDropSolution();
  const target = sol ? sol.windows.find((w) => near((launchMomentInSec(sol, w, state().clock.tSec) ?? NaN) / warp(), left ?? NaN, 0.5)) : undefined;
  check(`the next SKIP lands 8 tac s before ${other}`, ok && left !== null && near(left, WINDOW_TACTICAL_LEAD_TAC, 0.2) && target?.lz === other,
    `${left?.toFixed(2)} tac s before ${target?.lz}`);
}

finish();
