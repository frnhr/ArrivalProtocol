// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §3, §7.2).
//
// AUTODROP (03 §3.3, §3.5, §3.8; 01 §3.3, §3.4, §3.14): the per-version controller, [L] held (v1), [G] (v2's pass, v3's
// plan), its Core thread, downgrades, its guidance slot and its Skills row. Its machine is state.landing.autodrop (types/
// landing.ts AutodropState), so the controller is derived from the state each tick and dies with its file.
// • v1 CENTRE: while [L] (or the POD BAY's LAUNCH, the phone bar's) is held on the SHIP screen, each volley is timed around
//   the bracket's centre (autodrop-plan.ts nextVolley) and only launched while the window is sure. It holds no thread
//   (plan R8: it is the kid's key, as a manual launch is). A tap let go before the first launch sends nothing and records
//   `end: 'released'`, which R4's one-time lesson reads.
// • v2 PASS: [G] arms this pass's split (the POD BAY's rows: autodrop-plan.ts passCounts), flown in each LZ's window of the
//   pass, also from the MIND, holding a Core thread from AUTODROP_CLAIM_TAC before a volley until it is flown; PASS DONE.
// • v3 PLAN: [G] flies autodrop-plan.ts planLanding, re-planned after every launch, one [F] per gap (plan R7).
// Every launch goes through landing.ts requestLaunch (the controller tick) with the kid's refusals and guards. The post
// tick (autodropTick) runs the machine's edges: the claim, the hold's release, the steps down (plan §3.5), PASS DONE.
// Module-level state allowed here (plan §2.3): none of its own; the plan memo is autodrop-plan.ts's.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type {
  AutodropArm, AutodropEnd, AutodropLine, AutodropState, DropSolution, LandingController, LandingView, LaunchIntent,
} from '@/types/landing';
import type { EffectiveVersion, SkillVersion } from '@/types/skill';
import { registerLandingController } from '@systems/landing-controller';
import { capabilitiesNow, skillLive, ROLE_LABEL, type SkillLive } from '@systems/capabilities';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say } from '@systems/say';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { canStartOp, releaseThread, reserveThread } from '@systems/ops-core';
import { getDropSolution } from '@systems/drop-cache';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { dropFactors, landingView as landingViewOf, podCounts } from '@systems/landing-rules';
import { autoburnHoldsLandingOrbit, driversInMemory } from '@state/selectors';
import { demoSkill, AUTODROP_DEMO_TUNING } from '@systems/skill-tree';
import {
  forgetPlanMemo, nextVolley, passCounts, passRows, planLanding, podSureSpan, windowsAt,
  type LandingPlan, type NextVolley, type PassRow, type WindowAt,
} from '@systems/autodrop-plan';
import { SKILL_TREE } from '@data/skills';
import { AUTODROP_TEXT, type AutodropRefusalWord } from '@data/autodrop-text';
import { minSec, podCode } from '@data/landing-text';
import {
  AUTODROP_CLAIM_TAC, AUTODROP_DAMAGED_ALERT_SEC, AUTODROP_DONE_LINE_SEC, AUTODROP_EDGE_MARGIN_TAC, AUTODROP_RELEASE_MARGIN_TAC,
  WINDOW_TACTICAL_LEAD_TAC,
} from '@data/tuning';

// The Core thread's owner (ops-core reserveThread), and the warning alert of a dead AUTODROP.
const OWNER = 'autodrop';
const DAMAGED_ALERT_ID = 'autodrop-damaged';

// --- Reading the machine -------------------------------------------------------------------------------------------------

function landingOn(state: Readonly<GameState>): boolean {
  return state.run.phase === 'landing' && state.landing.ended === null;
}

function viewOf(state: Readonly<GameState>, sol: Readonly<DropSolution>): LandingView {
  return landingViewOf(state, sol, capabilitiesNow(state).bay.cadenceTac);
}

// The pass's window rule (plan §3.3): the next window of each LZ with pods to send, until one period after [G]. A window
// counts when it closes within (armedAt, armedAt + period]: the window open at [G] is this pass's, and the same LZ's next
// one (a period on) is the next pass's.
function inPassOf(state: Readonly<GameState>, view: Readonly<LandingView>): (win: Readonly<WindowAt>) => boolean {
  const armedAt = state.landing.autodrop.armedAtTSec;
  const period = view.solution.periodSec;
  if (armedAt === null) return () => false;
  return (win) => win.close > armedAt && win.close <= armedAt + period;
}

function passWant(state: Readonly<GameState>): (lz: string) => number {
  const { pass, sent } = state.landing.autodrop;
  return (lz) => Math.max(0, (pass[lz] ?? 0) - (sent[lz] ?? 0));
}

// The volley the armed pass flies next, or null (the pass is over).
function passVolley(state: Readonly<GameState>, view: Readonly<LandingView>): NextVolley | null {
  return nextVolley(state, view, passWant(state), inPassOf(state, view));
}

// v1's volley: the next sure window of any LZ with room.
function heldVolley(state: Readonly<GameState>, view: Readonly<LandingView>): NextVolley | null {
  return nextVolley(state, view, (lz) => view.remaining[lz] ?? 0);
}

// The next launch the armed machine waits for (game s), with its LZ and count: the pass's volley, or the plan's first row.
interface NextLaunch {
  lz: string;
  n: number;
  atTSec: number;
  opensAt: number;   // its window's sure part opens (game s): the strip names the volley from GET READY's lead
}

function armedNext(state: Readonly<GameState>, view: Readonly<LandingView>): NextLaunch | null {
  const armed = state.landing.autodrop.armed;
  if (armed === 'pass') {
    const next = passVolley(state, view);
    return next === null ? null : volleyNext(next);
  }
  if (armed === 'plan') {
    const row = planLanding(state, view).rows[0];
    if (row === undefined) return null;
    const win = windowsAt(view.solution, state.clock.tSec).find((candidate) => candidate.lz === row.lz && candidate.close > row.atTSec);
    return { lz: row.lz, n: row.n, atTSec: row.atTSec, opensAt: Math.min(row.atTSec, win?.sure?.lo ?? row.atTSec) };
  }
  return null;
}

function volleyNext(next: Readonly<NextVolley>): NextLaunch {
  return { lz: next.win.lz, n: next.volley.n, atTSec: next.volley.firstAtTSec, opensAt: Math.min(next.volley.firstAtTSec, next.win.sure?.lo ?? Infinity) };
}

// --- The controller (plan §3.1) ------------------------------------------------------------------------------------------

// What slice 7's MERGE resolver passes to fly restored pods at AUTODROP's effective version with its own queue (01 §3.17).
// 4c builds only the seam.
export interface AutodropOverride {
  version: EffectiveVersion;
  queue: readonly number[];
}

// v1, held: the volley's next slot has come, and the window is sure for it now.
function decideHeld(view: LandingView, state: Readonly<GameState>): LaunchIntent | null {
  const next = heldVolley(state, view);
  if (next === null) return null;
  return launchDue(state, next.win, next.volley.firstAtTSec) ? { source: 'autodrop' } : null;
}

// v2, armed: the pass's next slot has come, its thread is held, and the window is sure for it now.
function decidePass(view: LandingView, state: Readonly<GameState>): LaunchIntent | null {
  if (!state.landing.autodrop.claimed) return null;
  const next = passVolley(state, view);
  if (next === null) return null;
  return launchDue(state, next.win, next.volley.firstAtTSec) ? { source: 'autodrop' } : null;
}

// v3, armed: the plan's first row has come, its thread is held, and that pod's own dot fits now. The kid's LOAD NEXT pin
// wins for the next launch (the kid's hands, plan §3.4): the pinned pod goes, and the plan re-plans after it. A leftover
// row (the wrong split) answers its guard (`confirmed: 'full'`, the one guard a controller ever meets: plan §3.1).
function decidePlan(view: LandingView, state: Readonly<GameState>): LaunchIntent | null {
  if (!state.landing.autodrop.claimed) return null;
  const row = planLanding(state, view).rows[0];
  if (row === undefined) return null;
  const now = state.clock.tSec;
  if (now < row.atTSec) return null;
  const pinned = state.landing.loadNext !== null && view.queue[0] === state.landing.loadNext;
  const pod = pinned ? state.landing.loadNext! : row.pods[0];
  if (pod === undefined || !view.queue.includes(pod)) return null;
  const win = windowsAt(view.solution, now).find((candidate) => candidate.lz === row.lz);
  const lz = state.landing.lzs.find((candidate) => candidate.label === row.lz);
  const driver = driversInMemory(state).find((candidate) => candidate.pod === pod);
  if (win === undefined || lz === undefined || driver === undefined) return null;
  const s = dropHalfWidthKm(win.launchRadius, state.level.planet.R, dropFactors(capabilitiesNow(state), driver));
  const span = podSureSpan(win, lz, s);
  const margin = AUTODROP_EDGE_MARGIN_TAC * state.level.tacticalWarp;
  if (span === null || now < span.lo || now > span.hi - margin) return null;
  const intent: LaunchIntent = pinned ? { source: 'autodrop' } : { source: 'autodrop', pod };
  return row.mislanded > 0 ? { ...intent, confirmed: 'full' } : intent;
}

// A slot is due: its moment has come, the window open now is its LZ's and sure (landing.ts writes it from the same drop
// solution), and the moment is still an edge margin inside the sure part (a pod is never sent with its dot over the edge).
function launchDue(state: Readonly<GameState>, win: Readonly<WindowAt>, atTSec: number): boolean {
  const now = state.clock.tSec;
  const open = state.landing.window;
  if (now < atTSec || open === null || open.lz !== win.lz || !open.sure || win.sure === null) return false;
  return now <= win.sure.hi - AUTODROP_EDGE_MARGIN_TAC * state.level.tacticalWarp;
}

// AUTODROP's controller now, or null: null unless phase 'landing', the landing goes on and AUTODROP works (skillLive), and:
//   v1: autodrop.held && ui.mode === 'tools'  → { source: 'autodrop', holdsTactical: true, launchesFromMind: false }
//   v2/v3: autodrop.armed !== null           → { source: 'autodrop', holdsTactical: true, launchesFromMind: true }
// Every version holds TACTICAL in 4c (plan R7: no SKIP chaining yet, so no drop inside a SKIP). `override` is slice 7's seam
// (MERGE's restored pods at the effective version); its queue is not read in 4c.
export function autodropController(state: Readonly<GameState>, override?: Readonly<AutodropOverride>): LandingController | null {
  if (!landingOn(state)) return null;
  const version = override?.version ?? skillLive(state.memory, 'autodrop').version;
  if (version < 1) return null;
  const ad = state.landing.autodrop;
  if (ad.armed !== null && version >= 2) {
    return {
      source: 'autodrop', holdsTactical: true, launchesFromMind: true,
      decide: (view, now) => (ad.armed === 'plan' && version >= 3 ? decidePlan(view, now) : decidePass(view, now)),
    };
  }
  if (ad.held && state.ui.mode === 'tools') {
    return { source: 'autodrop', holdsTactical: true, launchesFromMind: false, decide: (view, now) => decideHeld(view, now) };
  }
  return null;
}

// Mounted with the landing (landing.ts mountLanding): AUTODROP's resolver joins the controller registry, and the post tick
// runs the machine's edges. Returns the unmount.
export function mountAutodrop(store: Store<GameState>): () => void {
  const offResolver = registerLandingController('autodrop', (state) => autodropController(state));
  const offTick = onPostTick(() => autodropTick(store));
  const offReset = onWorldReset('autodrop', forgetPlanMemo, () => ({}));
  return () => {
    offResolver();
    offTick();
    offReset();
    forgetPlanMemo();
  };
}

// --- The machine's writes ------------------------------------------------------------------------------------------------

// The machine at rest (the codec's rule at every save point: nothing held, armed, claimed or waiting; plan §2.2). `pass`,
// `sent`, `flownAs` and the last `end` may stand. The thread is let go by the caller (autodropRest).
export function restAutodrop(draft: AutodropState, end: AutodropEnd | null, atAi: number): void {
  if (draft.armed !== null && end !== null) {
    draft.end = end;
    draft.endAtAi = atAi;
  }
  draft.held = false;
  draft.armed = null;
  draft.armedAtTSec = null;
  draft.claimed = false;
  draft.waitingSinceTSec = null;
}

// Disarms (or lets go of the hold) with `end`, the thread released, the event emitted.
function disarm(store: Store<GameState>, end: AutodropEnd): void {
  const before = store.getState().landing.autodrop;
  const from = before.armed;
  releaseThread(OWNER);
  store.update((draft) => {
    const ad = draft.landing.autodrop;
    const wasArmed = ad.armed !== null;
    restAutodrop(ad, end, draft.clock.aiSec);
    if (!wasArmed) {
      ad.end = end;
      ad.endAtAi = draft.clock.aiSec;
    }
  });
  if (from !== null) emit('autodrop', { from, to: null, end });
}

// The landing ended (landing.ts endNow) or the phase left it: everything at rest, the thread let go.
export function autodropLandingOver(store: Store<GameState>): void {
  const ad = store.getState().landing.autodrop;
  releaseThread(OWNER);
  if (!ad.held && ad.armed === null && !ad.claimed && ad.waitingSinceTSec === null && ad.armedAtTSec === null) return;
  const from = ad.armed;
  store.update((draft) => { restAutodrop(draft.landing.autodrop, 'landing-over', draft.clock.aiSec); });
  if (from !== null) emit('autodrop', { from, to: null, end: 'landing-over' });
}

// After a controller launch (landing.ts controllerTick): this pass's sent count, and the volley's event on its first pod
// (no AUTODROP pod into the same LZ within two cadences before it). Its size: this pod and what the volley still holds.
export function autodropLaunched(store: Store<GameState>, pod: number, view: Readonly<LandingView>): void {
  const state = store.getState();
  const record = state.landing.pods.find((candidate) => candidate.pod === pod);
  if (record === undefined || record.fate.kind !== 'falling') throw new Error(`autodropLaunched: pod ${pod} is not falling`);
  const launch = record.fate.launch;
  const lz = launch.aimLz;
  if (lz === null) throw new Error(`autodropLaunched: AUTODROP launched pod ${pod} off-site`);
  const cadenceSec = (view.bay.cadenceTac ?? 0) * state.level.tacticalWarp;
  const firstOfVolley = !state.landing.pods.some((other) => other.pod !== pod && (other.fate.kind === 'falling' || other.fate.kind === 'down')
    && other.fate.launch.source === 'autodrop' && other.fate.launch.aimLz === lz && launch.atTSec - other.fate.launch.atTSec <= 2 * cadenceSec);
  store.update((draft) => {
    const sent = draft.landing.autodrop.sent;
    sent[lz] = (sent[lz] ?? 0) + 1;
  });
  if (!firstOfVolley) return;
  const sol = getDropSolution();
  const after = store.getState();
  const rest = sol === null ? null : armedNext(after, viewOf(after, sol)) ?? (after.landing.autodrop.held ? heldNext(after, viewOf(after, sol)) : null);
  emit('autodrop-volley', { lz, n: 1 + (rest !== null && rest.lz === lz ? rest.n : 0), firstAtTSec: launch.atTSec });
}

function heldNext(state: Readonly<GameState>, view: Readonly<LandingView>): NextLaunch | null {
  const next = heldVolley(state, view);
  return next === null ? null : volleyNext(next);
}

// --- The kid's inputs (plan §3.2–§3.3) -----------------------------------------------------------------------------------

// [L] down (landing-controls.ts, also pointer-down on the POD BAY's LAUNCH and the phone bar's button): 'held' when v1 or
// better works, the SHIP screen is up, nothing is armed, and the awaited window has a sure part that is open or opens within
// WINDOW_TACTICAL_LEAD_TAC (plan R4); 'manual' otherwise, and the manual path runs as today (a WIDE DROP window, outside
// every window: the confirms).
export function autodropKeyDown(store: Store<GameState>): 'held' | 'manual' {
  const state = store.getState();
  if (!landingOn(state) || state.clock.paused || state.ui.mode !== 'tools') return 'manual';
  if (state.landing.autodrop.armed !== null || skillLive(state.memory, 'autodrop').version < 1) return 'manual';
  const sol = getDropSolution();
  if (sol === null) return 'manual';
  const next = heldVolley(state, viewOf(state, sol));
  if (next === null || next.win.sure === null) return 'manual';
  if ((next.win.sure.lo - state.clock.tSec) / state.level.tacticalWarp > WINDOW_TACTICAL_LEAD_TAC) return 'manual';
  store.update((draft) => {
    const ad = draft.landing.autodrop;
    ad.held = true;
    ad.sent = {};
    ad.end = null;
    ad.endAtAi = null;
  });
  return 'held';
}

// [L] up (or the button's pointer up): the hold ends. Nothing launched while it was held is R4's tap: `'released'`.
export function autodropKeyUp(store: Store<GameState>): void {
  const ad = store.getState().landing.autodrop;
  if (!ad.held) return;
  const sentAny = Object.values(ad.sent).some((n) => n > 0);
  store.update((draft) => {
    const machine = draft.landing.autodrop;
    machine.held = false;
    if (!sentAny) {
      machine.end = 'released';
      machine.endAtAi = draft.clock.aiSec;
    }
  });
}

// Why [G] did nothing (pressAutodrop's refusals, plan §3.3). 'ONLY v1' (Track DROP): AUTODROP works only as v1, which has
// no [G] (hold [L] instead).
export type AutodropRefusal = AutodropRefusalWord;

function refuse(word: AutodropRefusal): AutodropRefusal {
  emit('refused', { reason: `AUTODROP|${word}` });
  say('sys', AUTODROP_TEXT.radio.refused(word), { critical: true });
  return word;
}

// [G] (landing-controls.ts, from either screen): arms v2's 'pass' (with armedAtTSec) or v3's 'plan'; [G] again cancels.
export function pressAutodrop(store: Store<GameState>): AutodropRefusal | null {
  const state = store.getState();
  if (!landingOn(state)) return refuse('NOT LANDING');
  if (state.clock.paused) return refuse('PAUSED');
  const live = skillLive(state.memory, 'autodrop');
  if (live.file === null) return refuse('NO AUTODROP');
  if (live.version === 0) return refuse('AUTODROP OFF');
  const ad = state.landing.autodrop;
  if (ad.armed !== null) {
    disarm(store, 'cancel');
    say('sys', AUTODROP_TEXT.radio.cancel, { critical: true });
    return null;
  }
  if (live.version === 1) return refuse('ONLY v1');
  const sol = getDropSolution();
  if (sol === null) return refuse('NOTHING SET');
  const view = viewOf(state, sol);
  const now = state.clock.tSec;
  let to: AutodropArm;
  let line: string;
  let pass: Record<string, number> | null = null;
  if (live.version >= 3) {
    const plan = planLanding(state, view);
    if (plan.rows.length === 0) return refuse('NOTHING SET');
    to = 'plan';
    line = AUTODROP_TEXT.radio.armedPlan(plan.passes);
  } else {
    pass = passCounts(state, view);
    if (!Object.values(pass).some((n) => n > 0)) return refuse('NOTHING SET');
    to = 'pass';
    line = AUTODROP_TEXT.radio.armedPass(pass);
  }
  store.update((draft) => {
    const machine = draft.landing.autodrop;
    machine.armed = to;
    machine.armedAtTSec = now;
    machine.sent = {};
    machine.held = false;
    machine.end = null;
    machine.endAtAi = null;
    if (pass !== null) machine.pass = { ...pass };
  });
  emit('autodrop', { from: null, to, end: null });
  say('sys', line, { critical: true });
  return null;
}

// The POD BAY's [−] n [+] for `lz` (v2): this pass's count, clamped to the LZ's room. The other LZs' prefilled counts are
// written with it, so what the rows showed is what [G] flies. Outside the landing it does nothing.
export function setPassCount(store: Store<GameState>, lz: string, n: number): void {
  const state = store.getState();
  if (!state.landing.lzs.some((candidate) => candidate.label === lz)) throw new Error(`setPassCount: no ${lz} on this ship`);
  if (!Number.isFinite(n)) throw new Error(`setPassCount: ${n} pods`);
  if (!landingOn(state)) return;
  const sol = getDropSolution();
  if (sol === null) return;
  const view = viewOf(state, sol);
  const counts = passCounts(state, view);
  counts[lz] = Math.max(0, Math.min(view.remaining[lz] ?? 0, Math.round(n)));
  store.update((draft) => { draft.landing.autodrop.pass = counts; });
}

// --- The post tick (the machine's edges) ---------------------------------------------------------------------------------

// The steps down while it flies (plan §3.5; 03 §3.5: "the skill finishes with what the lower version can do"). Each acts
// once (flownAs). A step up (a REPAIR) only moves flownAs: the watcher's RESTORED stamp is 4b's.
function versionChanged(store: Store<GameState>, live: Readonly<SkillLive>): void {
  const state = store.getState();
  const ad = state.landing.autodrop;
  const to = live.version;
  const busy = ad.armed !== null || ad.held;
  if (to < ad.flownAs && busy) {
    if (to >= 2 && ad.armed === 'plan') {
      // v3 → v2: this pass's remaining rows become the pass's numbers.
      const sol = getDropSolution();
      const view = sol === null ? null : viewOf(state, sol);
      const rows = view === null ? [] : planLanding(state, view).rows;
      const until = state.clock.tSec + (view?.solution.periodSec ?? 0);
      const pass: Record<string, number> = {};
      for (const row of rows) if (row.atTSec < until && row.mislanded === 0) pass[row.lz] = (pass[row.lz] ?? 0) + row.n;
      const now = state.clock.tSec;
      store.update((draft) => {
        const machine = draft.landing.autodrop;
        machine.armed = 'pass';
        machine.pass = pass;
        machine.sent = {};
        machine.armedAtTSec = now;
      });
      emit('autodrop', { from: 'plan', to: 'pass', end: null });
      say('sys', AUTODROP_TEXT.radio.v3to2, { critical: true });
    } else if (to === 1 && ad.armed !== null) {
      disarm(store, 'downgraded');
      say('sys', AUTODROP_TEXT.radio.v2to1, { critical: true });
    } else if (to === 0) {
      const offline = live.offline !== null && live.file !== null;
      disarm(store, offline ? 'offline' : 'off');
      say('sys', offline ? AUTODROP_TEXT.radio.offline : AUTODROP_TEXT.radio.damaged, { critical: true });
      if (!offline) {
        raiseAlert(store, { id: DAMAGED_ALERT_ID, layer: 'ship', severity: 'warn', text: AUTODROP_TEXT.radio.damaged, inhibitsSkip: false });
      }
    }
  }
  store.mutate((draft) => { draft.landing.autodrop.flownAs = to; });
}

// The armed machine's thread (plan R8): claimed AUTODROP_CLAIM_TAC before the next volley's first launch, let go once the
// next volley is further than AUTODROP_CLAIM_TAC + AUTODROP_RELEASE_MARGIN_TAC (or there is none); with no thread free it
// waits (`'autodrop-wait'`, once) and launches late, its volley shrunk to what is left of the sure part.
function claimTick(store: Store<GameState>, next: Readonly<NextLaunch> | null): void {
  const state = store.getState();
  const ad = state.landing.autodrop;
  const inTac = next === null ? null : (next.atTSec - state.clock.tSec) / state.level.tacticalWarp;
  const far = inTac === null || inTac > AUTODROP_CLAIM_TAC + AUTODROP_RELEASE_MARGIN_TAC;
  if (ad.claimed) {
    if (far) {
      releaseThread(OWNER);
      store.update((draft) => { draft.landing.autodrop.claimed = false; });
    }
    return;
  }
  if (inTac !== null && inTac <= AUTODROP_CLAIM_TAC && next !== null) {
    if (canStartOp()) {
      if (!reserveThread(OWNER)) throw new Error('autodrop claim: no thread although canStartOp found one');
      store.update((draft) => { draft.landing.autodrop.claimed = true; draft.landing.autodrop.waitingSinceTSec = null; });
    } else if (ad.waitingSinceTSec === null) {
      const since = state.clock.tSec;
      store.update((draft) => { draft.landing.autodrop.waitingSinceTSec = since; });
      emit('autodrop-wait', { lz: next.lz });
    }
    return;
  }
  if (ad.waitingSinceTSec !== null && far) store.update((draft) => { draft.landing.autodrop.waitingSinceTSec = null; });
}

// PASS DONE (no volley left in the pass) and PLAN DONE (no row left), said with what was sent.
function doneTick(store: Store<GameState>, next: Readonly<NextLaunch> | null): void {
  const ad = store.getState().landing.autodrop;
  if (ad.armed === null || next !== null) return;
  const sent = { ...ad.sent };
  const end: AutodropEnd = ad.armed === 'pass' ? 'pass-done' : 'plan-done';
  disarm(store, end);
  say('sys', end === 'pass-done' ? AUTODROP_TEXT.radio.passDone(sent) : AUTODROP_TEXT.radio.planDone(sent), { critical: true });
}

export function autodropTick(store: Store<GameState>): void {
  const state = store.getState();
  const ad = state.landing.autodrop;
  if (ad.endAtAi !== null && state.clock.aiSec - ad.endAtAi >= AUTODROP_DAMAGED_ALERT_SEC) clearAlert(store, DAMAGED_ALERT_ID);
  if (!landingOn(state)) {
    if (state.run.phase === 'landing' || ad.armed !== null || ad.held || ad.claimed) autodropLandingOver(store);
    return;
  }
  const live = skillLive(state.memory, 'autodrop');
  if (live.version !== ad.flownAs) versionChanged(store, live);
  const now = store.getState();
  const machine = now.landing.autodrop;
  // The hold lets go on a switch to the MIND, a pause or the file working no more (a keyup lost to a blur is input.ts's:
  // its releaseAllKeys sends the keyup). No lesson: the kid did not let go.
  if (machine.held && (now.ui.mode !== 'tools' || now.clock.paused || live.version < 1)) {
    store.update((draft) => { draft.landing.autodrop.held = false; });
  }
  if (machine.armed === null || now.clock.paused) {
    if (machine.claimed) claimTick(store, null);
    return;
  }
  const sol = getDropSolution();
  if (sol === null) return;
  const next = armedNext(now, viewOf(now, sol));
  claimTick(store, next);
  doneTick(store, next);
}

// --- Readers (hot paths: the guidance table, the director, the Skills window) --------------------------------------------

function tacTo(state: Readonly<GameState>, atTSec: number): number {
  return (atTSec - state.clock.tSec) / state.level.tacticalWarp;
}

// A countdown for the strip, or null once the moment has come.
function countdown(state: Readonly<GameState>, atTSec: number): string | null {
  const tac = tacTo(state, atTSec);
  return tac > 0.05 ? minSec(tac) : null;
}

// AUTODROP's guidance slot (plan §3.7; landing-guidance.ts buildLandingContext reads it every tick): its own row (AD-wait,
// AD-fly, AD-done, AD-held, AD-hold, in that order) and its tail on L13's waits.
export function autodropLineOf(state: Readonly<GameState>, sol: Readonly<DropSolution>): AutodropLine | null {
  if (!landingOn(state) || sol.block !== null || sol.dot === null) return null;
  const live = skillLive(state.memory, 'autodrop');
  const ad = state.landing.autodrop;
  if (live.version < 1 && ad.end === null) return null;
  const view = viewOf(state, sol);
  const text = AUTODROP_TEXT.strip;
  let row: AutodropLine['row'] = null;
  let tail: AutodropLine['tail'] = null;
  if (ad.armed !== null && live.version >= 2) {
    const next = armedNext(state, view);
    if (ad.waitingSinceTSec !== null && next !== null) {
      row = { id: 'landing-AD-wait', text: text.wait(countdown(state, next.atTSec)), keys: [], urgency: 'now', layer: 'mind' };
    } else if (next !== null && Math.min(tacTo(state, next.atTSec), tacTo(state, next.opensAt)) <= WINDOW_TACTICAL_LEAD_TAC) {
      row = { id: 'landing-AD-fly', text: text.fly(next.lz, next.n, countdown(state, next.atTSec)), keys: ['G'], urgency: 'wait', layer: 'ship' };
    } else if (state.landing.window !== null) {
      // A window open that the machine has flown (or that its pass or plan leaves alone): it waits, so the strip doesn't
      // offer the manual [L] of L4–L6 in its place.
      const words = next === null ? text.armedIdle : text.armedNext(next.lz, next.n, minSec(Math.max(0, tacTo(state, next.atTSec))));
      row = { id: 'landing-AD-armed', text: words, keys: ['G'], urgency: 'wait', layer: 'ship' };
    } else {
      tail = { text: text.tailArmed, key: null };
    }
    return { row, tail };
  }
  const done = (ad.end === 'pass-done' || ad.end === 'plan-done') && ad.endAtAi !== null
    && state.clock.aiSec - ad.endAtAi < AUTODROP_DONE_LINE_SEC;
  if (done) {
    const words = ad.end === 'pass-done' ? text.passDone(ad.sent) : text.planDone(ad.sent);
    row = { id: 'landing-AD-done', text: words, keys: ad.end === 'pass-done' ? ['G'] : [], urgency: 'wait', layer: 'ship' };
  }
  if (row === null && live.version >= 1 && state.ui.mode === 'tools') {
    const next = heldVolley(state, view);
    if (next !== null && next.win.sure !== null && tacTo(state, next.win.sure.lo) <= WINDOW_TACTICAL_LEAD_TAC) {
      row = ad.held
        ? { id: 'landing-AD-held', text: text.held(next.win.lz, next.volley.n, countdown(state, next.volley.firstAtTSec)), keys: ['L'], urgency: 'now', layer: 'ship' }
        : { id: 'landing-AD-hold', text: text.hold(next.win.lz), keys: ['L'], urgency: 'now', layer: 'ship' };
    }
  }
  if (live.version === 2) tail = { text: text.tailPass, key: 'G' };
  else if (live.version >= 3 && planLanding(state, view).rows.length > 0) tail = { text: text.tailPlan, key: 'G' };
  return row === null && tail === null ? null : { row, tail };
}

// Whether version `version`'s once-only lesson is due now (data/script.ts SKILL_4CDE_RULES: tut-autodrop-v1/v2/v3):
// • v1 (R4): a tap on [L] was let go before the volley's first launch (`end: 'released'`), while v1 or better works;
// • v2 / v3: the first landing where AUTODROP works as exactly that version, nothing armed yet, pods aboard.
export function autodropTutorialDue(state: Readonly<GameState>, version: SkillVersion): boolean {
  if (!landingOn(state)) return false;
  const live = skillLive(state.memory, 'autodrop').version;
  const ad = state.landing.autodrop;
  if (version === 1) return live >= 1 && ad.end === 'released' && !ad.held;
  return live === version && ad.armed === null && podCounts(state).aboard > 0;
}

// The Skills window's status for AUTODROP (systems/skills.ts SKILL_ROW_HOOKS): `CENTRE · AIM 91% · 3 drops`, `ARMED · LZ-A
// ×2 IN 0:12`, `UNTRAINED 40%`, `WORKS AS v1 — REPAIR IT FOR v2`. null: the plain row (the file gone, or too damaged to work).
export function autodropStatus(state: Readonly<GameState>): { text: string; tone: 'good' | 'warn' } | null {
  const live = skillLive(state.memory, 'autodrop');
  if (live.file === null || live.version === 0) return null;
  const words = AUTODROP_TEXT.status;
  const ad = state.landing.autodrop;
  if (landingOn(state) && ad.armed !== null) {
    if (ad.waitingSinceTSec !== null) return { text: words.waiting, tone: 'warn' };
    const sol = getDropSolution();
    const next = sol === null ? null : armedNext(state, viewOf(state, sol));
    return { text: next === null ? words.armedIdle : words.armed(next.lz, next.n, minSec(Math.max(0, tacTo(state, next.atTSec)))), tone: 'good' };
  }
  if (landingOn(state) && ad.held) return { text: words.holding, tone: 'good' };
  if (live.nominal !== null && live.version < live.nominal.version) return { text: words.worksAs(live.version, live.nominal.version), tone: 'warn' };
  const skill = demoSkill(state.run.stats.dropDemos, AUTODROP_DEMO_TUNING);
  const mode = SKILL_TREE.autodrop.versions[live.version - 1]?.mode ?? 'CENTRE';
  if (skill.untrained) return { text: words.untrained(mode, skill.accuracy), tone: 'warn' };
  return { text: words.trained(mode, skill.accuracy, skill.demos), tone: 'good' };
}

// The REPAIR a never-fits LZ names, as the strip and the POD BAY say it (`POD 05`, `SENSOR INTERP`).
export function repairWord(hint: Readonly<LandingPlan['neverFits'][number]['repair']>): string | null {
  if (hint === null) return null;
  return hint.file === 'driver' ? podCode(hint.pod) : hint.file === 'sensor' ? ROLE_LABEL.sensor : ROLE_LABEL.navplot;
}

// AUTOBURN v3 holds the landing orbit: the never-fits line says it goes lower instead of `fly lower` (plan §3.4).
export function v3GoesLower(state: Readonly<GameState>): boolean {
  return autoburnHoldsLandingOrbit(state);
}

// --- Debug (`__ap.autodrop()`, `__ap.dropDemos([...])`) -----------------------------------------------------------------

export interface AutodropDebug {
  state: AutodropState;
  version: EffectiveVersion;          // what the file works as now (skillLive)
  controller: boolean;                // a controller is active now
  volley: unknown;                    // the volley at hand (autodrop-plan.ts Volley): the armed pass's, else v1's
  pass: unknown;                      // the POD BAY's pass rows (autodrop-plan.ts passRows)
  plan: unknown;                      // v3's plan (autodrop-plan.ts planLanding)
}

export function autodropDebug(state: Readonly<GameState>): AutodropDebug {
  const sol = state.run.phase === 'landing' ? getDropSolution() : null;
  const view = sol === null ? null : viewOf(state, sol);
  const ad = state.landing.autodrop;
  let pass: PassRow[] | null = null;
  if (view !== null) pass = passRows(state, view, { ...passCounts(state, view) });
  return {
    state: structuredClone(ad), version: skillLive(state.memory, 'autodrop').version,
    controller: autodropController(state) !== null,
    volley: view === null ? null : (ad.armed === 'pass' ? passVolley(state, view) : heldVolley(state, view))?.volley ?? null,
    pass, plan: view === null ? null : planLanding(state, view),
  };
}

// The kid's drop demos, set by hand (each a launch's offset from its window's centre, tactical s): what AIM learns from.
// BUILT (debug and suites only).
export function setDropDemos(store: Store<GameState>, offsets: readonly number[]): void {
  if (!offsets.every(Number.isFinite)) throw new Error(`setDropDemos: ${offsets.join(', ')} are not all numbers`);
  store.update((draft) => { draft.run.stats.dropDemos = offsets.map((offsetTac) => ({ offsetTac })); });
}
