// Slice 7b: the FOUNDATION swapped its drivers-to-launch reads to selectors launchDrivers (slice-7-plan R24: THE LAST
// LANDING's radio drivers are never in memory); nothing else here changed.
// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §3, §7.2).
//
// AUTODROP (03 §3.3, §3.5, §3.8; 01 §3.3, §3.4, §3.14): the per-version controller, [L] held (v1), [G] (v2's pass, v3's
// plan), its Core thread, downgrades, its guidance slot and its Skills row. Its machine is state.landing.autodrop (types/
// landing.ts AutodropState), so the controller is derived from the state each tick and dies with its file.
// • v1 CENTRE: while [L] (or the POD BAY's LAUNCH, the phone bar's) is held on the SHIP screen, each volley is timed around
//   the bracket's centre (autodrop-plan.ts nextVolley) and only launched while the window is sure. It holds no thread
//   (plan R8: it is the kid's key, as a manual launch is). A tap let go before the first launch sends nothing and records
//   `end: 'released'`, which R4's one-time lesson reads. Held in an open window where it has nothing more to fly (the next
//   pod's drop is WIDE), the hold lets go (review M1), so the strip's `press [L]` is true.
// • v2 PASS: [G] arms this pass's split (the POD BAY's rows: autodrop-plan.ts passCounts), flown in each LZ's window of the
//   pass, also from the MIND, holding a Core thread from AUTODROP_CLAIM_TAC before a volley until it is flown; PASS DONE.
// • v3 PLAN: [G] flies autodrop-plan.ts planLanding, re-planned after every launch, one [F] per gap (plan R7). It holds only
//   the LZs its plan sends pods to; in a window of another LZ it pins LOAD NEXT to a pod outside the plan and leaves the
//   kid's [L] there (review B2, M2).
// Every version names its next launch to pace (LandingController.nextLaunchAtTSec, review B2): TACTICAL before it, and a
// SKIP stops before it, whichever window the landing itself waits on. Under a higher controller (slice 5's resident, 7's
// MERGE) AUTODROP claims no thread and says nothing (review m5).
// Every launch goes through landing.ts requestLaunch (the controller tick) with the kid's refusals and guards. The post
// tick (autodropTick) runs the machine's edges: the claim, the hold's release, the steps down (plan §3.5), PASS DONE.
// Module-level state allowed here (plan §2.3): none of its own; the plan memo is autodrop-plan.ts's.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type {
  AutodropArm, AutodropEnd, AutodropLine, AutodropState, DropSolution, LandingController, LandingView, LaunchIntent,
} from '@/types/landing';
import type { EffectiveVersion, SkillVersion } from '@/types/skill';
import { activeLandingController, registerLandingController, type ControllerSource } from '@systems/landing-controller';
import { capabilitiesNow, roleHealth, skillLive, ROLE_LABEL, type SkillLive } from '@systems/capabilities';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { emit } from '@systems/events';
import { say } from '@systems/say';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { canClaimThread, releaseThread, reserveThread } from '@systems/ops-core';
import { getDropSolution } from '@systems/drop-cache';
import { getPrediction } from '@systems/predict';
import { landingOrbitAim } from '@systems/autoburn-v3';
import { dropHalfWidthKm } from '@systems/landing-solve';
import { bestRepairForDrop, dropFactors, landingView as landingViewOf, podCounts, lockCanBeFreed } from '@systems/landing-rules';
import { autoburnHoldsLandingOrbit, launchDrivers } from '@state/selectors';
import { demoSkill, AUTODROP_DEMO_TUNING } from '@systems/skill-tree';
import {
  forgetPlanMemo, nextVolley, passCounts, passRows, planLanding, podSureSpan, windowsAhead, windowsAt,
  type LandingPlan, type NextVolley, type PassRow, type WindowAt,
} from '@systems/autodrop-plan';
import { SKILL_TREE } from '@data/skills';
import { AUTODROP_TEXT, type AutodropRefusalWord } from '@data/autodrop-text';
import { minSec, podCode, LANDING_LINES } from '@data/landing-text';
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
// counts when its sure part ends within (armedAt + lead, armedAt + lead + period] (its close, for one with no sure part),
// `lead` being one cadence and the edge margin: a window whose sure part can still take a launch after [G] is this pass's,
// and the same LZ's next one (a period on) the next pass's; one whose sure part is over, or too nearly over for a launch,
// at [G] (a [G] pressed at the tail of a window) is replaced by its next.
// `pass` is the pass's fields: the kid's machine's (state.landing.autodrop), or a wrapping source's own (AutodropOverride.pass:
// THE LAST LANDING's v2, 7b review), so a wrapper never writes the kid's machine.
export interface AutodropPassFields {
  pass: Readonly<Record<string, number>>;
  sent: Readonly<Record<string, number>>;
  armedAtTSec: number | null;
}

function inPassOf(state: Readonly<GameState>, view: Readonly<LandingView>, fields: Readonly<AutodropPassFields> = state.landing.autodrop): (win: Readonly<WindowAt>) => boolean {
  const armedAt = fields.armedAtTSec;
  const period = view.solution.periodSec;
  if (armedAt === null) return () => false;
  const lead = ((view.bay.cadenceTac ?? 0) + AUTODROP_EDGE_MARGIN_TAC) * state.level.tacticalWarp;
  return (win) => {
    const ends = win.sure?.hi ?? win.close;
    return ends > armedAt + lead && ends <= armedAt + lead + period;
  };
}

function passWant(state: Readonly<GameState>, fields: Readonly<AutodropPassFields> = state.landing.autodrop): (lz: string) => number {
  const { pass, sent } = fields;
  return (lz) => Math.max(0, (pass[lz] ?? 0) - (sent[lz] ?? 0));
}

// The volley the armed pass flies next, or null (the pass is over).
function passVolley(state: Readonly<GameState>, view: Readonly<LandingView>, fields: Readonly<AutodropPassFields> = state.landing.autodrop): NextVolley | null {
  return nextVolley(state, view, passWant(state, fields), inPassOf(state, view, fields));
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

// `armed` is the machine's arm: the kid's (state.landing.autodrop.armed) or a wrapping source's (AutodropOverride.armed).
function armedNext(
  state: Readonly<GameState>, view: Readonly<LandingView>, armed: AutodropArm | null, fields: Readonly<AutodropPassFields> = state.landing.autodrop,
): NextLaunch | null {
  if (armed === 'pass') {
    const next = passVolley(state, view, fields);
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

// What a wrapping resolver passes to fly the landing at AUTODROP's rules with its own say: slice 5's sleeper (RUN THE DROPS:
// v3 PLAN, source 'resident', armed 'plan', slice-5-plan R11) and slice 7's MERGE (restored pods at the effective version
// with its own queue, 01 §3.17). Review m6: `source` is the wrapping resolver's (registerLandingController checks a resolver
// answers for its own source), and every intent the controller makes carries it. Slice 5: `armed` arms the machine for the
// wrapper (the kid's [G] is not needed), read wherever the controller reads the arm (armedNext and the decision), threaded
// as a parameter (no module variable); held and claimed are still state.landing.autodrop's, and `queue` is not read (MERGE's
// own machine state is slice 7's).
// Slice 5 review fix pass (architecture 2): `skipBetween` asks for the SKIP between passes itself (the [F] the kid would
// press under an armed v3: no window open, nothing to decide, a later launch planned; pace stops that SKIP before it), so
// the sleeper's RUN THE DROPS and MERGE's restored drivers share one rule. A wrapping source also names what it waits for
// (`waitsFor`: the strip's wait row, review M1) and is told of its launches (`autodropLaunched`: the volley event, m4).
// Slice 7b review: `pass` is a wrapping source's own pass (THE LAST LANDING's v2: LastLandingState.pass), read where the kid's
// machine's pass fields would be, so the wrapper never writes landing.autodrop; `view` maps the landing's view to the one the
// wrapper flies by (THE LAST LANDING's: no bay, its own cadence), for the decision and for what the controller names to pace
// and the strip alike, so the three agree.
export interface AutodropOverride {
  version: EffectiveVersion;
  queue: readonly number[];
  source?: ControllerSource;
  armed?: AutodropArm;
  skipBetween?: true;
  pass?: Readonly<AutodropPassFields>;
  view?: (state: Readonly<GameState>, view: Readonly<LandingView>) => LandingView;
}

// v1, held: the volley's next slot has come, and the window is sure for it now.
function decideHeld(view: LandingView, state: Readonly<GameState>): LaunchIntent | null {
  const next = heldVolley(state, view);
  if (next === null) return null;
  return launchDue(state, next.win, next.volley.firstAtTSec) ? { source: 'autodrop' } : null;
}

// v2, armed: the pass's next slot has come, and the window is sure for it now (its thread is checked by the controller).
function decidePass(view: LandingView, state: Readonly<GameState>, fields: Readonly<AutodropPassFields> = state.landing.autodrop): LaunchIntent | null {
  const next = passVolley(state, view, fields);
  if (next === null) return null;
  return launchDue(state, next.win, next.volley.firstAtTSec) ? { source: 'autodrop' } : null;
}

// v3, armed: the plan's first row has come, and that pod's own dot fits now (its thread is checked by the controller). The kid's LOAD NEXT pin
// wins for the next launch (the kid's hands, plan §3.4): the pinned pod goes, and the plan re-plans after it. A leftover
// row (the wrong split) answers its guard (`confirmed: 'full'`, the one guard a controller ever meets: plan §3.1).
function decidePlan(view: LandingView, state: Readonly<GameState>): LaunchIntent | null {
  const row = planLanding(state, view).rows[0];
  if (row === undefined) return null;
  const now = state.clock.tSec;
  if (now < row.atTSec) return null;
  // A pin on a pod the plan holds for no window (AUTODROP's own pin in an unused window, review M2) is the kid's [L]'s, not
  // the plan's: the row flies its own pod.
  const plan = planLanding(state, view);
  const pinned = state.landing.loadNext !== null && view.queue[0] === state.landing.loadNext && !plan.outside.includes(state.landing.loadNext);
  const pod = pinned ? state.landing.loadNext! : row.pods[0];
  if (pod === undefined || !view.queue.includes(pod)) return null;
  const win = windowsAt(view.solution, now).find((candidate) => candidate.lz === row.lz);
  const lz = state.landing.lzs.find((candidate) => candidate.label === row.lz);
  const driver = launchDrivers(state).find((candidate) => candidate.pod === pod);
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
  const source = override?.source ?? 'autodrop';
  const as = (intent: LaunchIntent | null): LaunchIntent | null => (intent === null ? null : { ...intent, source });
  const ad = state.landing.autodrop;
  const armed = override?.armed ?? ad.armed;
  // AUTODROP's own Core thread gates its armed launches; a wrapping source (slice 5's sleeper, slice 7's MERGE) holds its
  // own (review m6).
  const claimed = source !== 'autodrop' || ad.claimed;
  if (armed !== null && version >= 2) {
    const fields = override?.pass;
    const mapView = override?.view;
    const viewFor = (now: Readonly<GameState>, view: LandingView): LandingView => (mapView === undefined ? view : mapView(now, view));
    const decideArmed = (landingView: LandingView, now: Readonly<GameState>): LaunchIntent | null => {
      if (!claimed) return null;
      const view = viewFor(now, landingView);
      return as(armed === 'plan' && version >= 3 ? decidePlan(view, now) : decidePass(view, now, fields ?? now.landing.autodrop));
    };
    const nextLaunchAtTSec = (now: Readonly<GameState>): number | null =>
      withView(now, (view) => armedNext(now, viewFor(now, view), armed, fields ?? now.landing.autodrop)?.atTSec ?? null);
    const controller: LandingController = { source, holdsTactical: true, launchesFromMind: true, decide: decideArmed, nextLaunchAtTSec };
    if (source === 'autodrop') return controller;
    return {
      ...controller,
      decide: (view, now) => {
        const decision = decideArmed(view, now);
        if (decision !== null || override?.skipBetween !== true) return decision;
        const next = nextLaunchAtTSec(now);
        return now.landing.window === null && next !== null && next > now.clock.tSec ? 'skip' : null;
      },
      waitsFor: (now) => withView(now, (view) => {
        const next = armedNext(now, viewFor(now, view), armed, fields ?? now.landing.autodrop);
        return next === null ? null : { lz: next.lz, n: next.n, atTSec: next.atTSec };
      }),
    };
  }
  if (ad.held && state.ui.mode === 'tools') {
    return {
      source, holdsTactical: true, launchesFromMind: false, decide: (view, now) => as(decideHeld(view, now)),
      nextLaunchAtTSec: (now) => withView(now, (view) => heldVolley(now, view)?.volley.firstAtTSec ?? null),
    };
  }
  return null;
}

// `read` on the landing's view now, or null with no drop solution.
function withView<T>(state: Readonly<GameState>, read: (view: LandingView) => T | null): T | null {
  const sol = getDropSolution();
  return sol === null ? null : read(viewOf(state, sol));
}

// Review m5: a higher source (MERGE 7, the resident 5) flies the landing now, so AUTODROP's own machinery stands aside: no
// claim, no strip rows, no PASS DONE (its machine stays as the kid left it).
function shadowed(state: Readonly<GameState>): boolean {
  const active = activeLandingController(state);
  return active !== null && active.source !== 'autodrop';
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

// After a controller launch (landing.ts controllerTick): this pass's sent count (AUTODROP's own launches only: under a
// wrapping source its machine stays as the kid left it), and the volley's event on its first pod (no pod of the same
// source into the same LZ within two cadences before it), for any controller: review m4, a launch that is not the kid's
// hands is a volley whoever flies it (the sleeper 5, MERGE 7). Its size: this pod and what the volley still holds.
export function autodropLaunched(store: Store<GameState>, pod: number, view: Readonly<LandingView>, controller: Readonly<LandingController>): void {
  const state = store.getState();
  const record = state.landing.pods.find((candidate) => candidate.pod === pod);
  if (record === undefined || record.fate.kind !== 'falling') throw new Error(`autodropLaunched: pod ${pod} is not falling`);
  const launch = record.fate.launch;
  const lz = launch.aimLz;
  if (lz === null) throw new Error(`autodropLaunched: AUTODROP launched pod ${pod} off-site`);
  const cadenceSec = (view.bay.cadenceTac ?? 0) * state.level.tacticalWarp;
  const firstOfVolley = !state.landing.pods.some((other) => other.pod !== pod && (other.fate.kind === 'falling' || other.fate.kind === 'down')
    && other.fate.launch.source === launch.source && other.fate.launch.aimLz === lz && launch.atTSec - other.fate.launch.atTSec <= 2 * cadenceSec);
  if (controller.source === 'autodrop') {
    store.update((draft) => {
      const sent = draft.landing.autodrop.sent;
      sent[lz] = (sent[lz] ?? 0) + 1;
    });
  }
  if (!firstOfVolley) return;
  const sol = getDropSolution();
  const after = store.getState();
  let rest: { lz: string; n: number } | null = null;
  if (controller.source !== 'autodrop') {
    rest = controller.waitsFor?.(after) ?? null;
  } else if (sol !== null) {
    rest = armedNext(after, viewOf(after, sol), after.landing.autodrop.armed) ?? (after.landing.autodrop.held ? heldNext(after, viewOf(after, sol)) : null);
  }
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
  // Slice 7b review: THE LAST LANDING's pods are MERGE's to fly (R26), and an arm of the kid's machine then would reach ENDING
  // CHOSEN armed (the codec refuses it). The [G] key is shut by its input layer; this shuts the POD BAY's button too.
  if (state.landing.lastLanding !== null) return refuse('MERGE FLYING');
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
  const empty: AutodropRefusal = live.version >= 3 ? 'NOTHING TO PLAN' : 'NOTHING SET';
  if (sol === null) return refuse(empty);
  const view = viewOf(state, sol);
  const now = state.clock.tSec;
  let to: AutodropArm;
  let line: string;
  let pass: Record<string, number> | null = null;
  const noWindow = noSureWindow(state, view);
  if (live.version >= 3) {
    const plan = planLanding(state, view);
    if (plan.rows.length === 0) return refuse(noWindow ?? empty);
    to = 'plan';
    line = AUTODROP_TEXT.radio.armedPlan(plan.passes);
  } else {
    pass = passCounts(state, view);
    if (!Object.values(pass).some((n) => n > 0)) return refuse(noWindow ?? empty);
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

// Review M4: no LZ with room has a sure window on this orbit (none of its pods fits any of them: v2's rows all `fits 0`, v3's
// plan with every such LZ in neverFits), as the refusal word naming the fix: the REPAIR that would give the first of them
// one (landing-rules bestRepairForDrop: the plan's never-fits rule), `DRIVERS` for a pod driver (the queue is hurt, not one
// pod). null: some LZ has a sure window (then `NOTHING SET` / `NOTHING TO PLAN` is the truth).
function noSureWindow(state: Readonly<GameState>, view: Readonly<LandingView>): AutodropRefusal | null {
  const now = state.clock.tSec;
  const caps = capabilitiesNow(state);
  const wins = windowsAhead(view.solution, now, 2).filter((win) => (view.remaining[win.lz] ?? 0) > 0);
  const plan = planLanding(state, view);
  const fitsSomewhere = plan.rows.some((row) => row.mislanded === 0) || wins.some((win) => win.sure !== null && win.sure.hi > now);
  if (wins.length === 0 || fitsSomewhere) return null;
  for (const win of wins) {
    const lz = state.landing.lzs.find((candidate) => candidate.label === win.lz);
    const hint = lz === undefined ? null : bestRepairForDrop(state, caps, lz, win.launchRadius);
    if (hint !== null) return hint.file === 'sensor' ? 'NO SURE WINDOW · SENSOR INTERP' : hint.file === 'navplot' ? 'NO SURE WINDOW · NAV PLOTTER' : 'NO SURE WINDOW · DRIVERS';
  }
  return 'NO SURE WINDOW';
}

// The POD BAY's [−] n [+] for `lz` (v2): this pass's count, clamped to the LZ's room. The other LZs' prefilled counts are
// written with it, so what the rows showed is what [G] flies. Outside the landing it does nothing.
export function setPassCount(store: Store<GameState>, lz: string, n: number): void {
  const state = store.getState();
  if (!state.landing.lzs.some((candidate) => candidate.label === lz)) throw new Error(`setPassCount: no ${lz} on this ship`);
  if (!Number.isFinite(n)) throw new Error(`setPassCount: ${n} pods`);
  // Slice 7b review: not while THE LAST LANDING flies (its pods are MERGE's; R26).
  if (!landingOn(state) || state.landing.lastLanding !== null) return;
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
    // Slice 6 (R8): a yieldable thread (SURVEY's) is taken when none is free.
    if (canClaimThread()) {
      if (!reserveThread(OWNER, { preempt: true })) throw new Error('autodrop claim: no thread although canClaimThread found one');
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
// The pass is over (plan §3.3): every LZ with pods still to send has no window of the pass left whose sure part is still
// to come (or it is full). Judged by the windows' times, not by whether a volley fits right now: a factor that is only
// passing (Sensor Interp or a driver under the kid's REPAIR, a bay reloading) must not end the pass with nothing sent.
function passOver(state: Readonly<GameState>, view: Readonly<LandingView>): boolean {
  const want = passWant(state);
  const inPass = inPassOf(state, view);
  const now = state.clock.tSec;
  const ahead = windowsAhead(view.solution, now, 2);
  return state.landing.lzs.every((lz) => want(lz.label) < 1 || (view.remaining[lz.label] ?? 0) < 1
    || !ahead.some((win) => win.lz === lz.label && inPass(win) && (win.sure?.hi ?? win.close) > now));
}

// The plan is flown: no row left, and nothing it reads is only passing (a REPAIR or MOVE on Sensor Interp, Nav Plotter or
// a driver aboard can bring a window back). Slice 5 (the lead's hook, review m8): nor a pod aboard held by a resident's lock
// (DriverSegment.lockedBy: it leaves the queue, and a DELETE, a cure or an ACCEPT frees it into the plan), while something
// aboard can still free it (slice 5 review M3: a lock nothing can free is the pod's fate, not a passing factor).
function planOver(state: Readonly<GameState>): boolean {
  const busy = (role: 'sensor' | 'navplot'): boolean => roleHealth(state, role).offline !== null;
  const aboard = new Set(state.landing.pods.filter((record) => record.fate.kind === 'aboard').map((record) => record.pod));
  const driverBusy = launchDrivers(state).some((driver) => aboard.has(driver.pod)
    && (driver.state === 'repairing' || driver.state === 'transferring' || (driver.lockedBy !== undefined && lockCanBeFreed(state))));
  return !busy('sensor') && !busy('navplot') && !driverBusy;
}

function doneTick(store: Store<GameState>, next: Readonly<NextLaunch> | null, view: Readonly<LandingView>): void {
  const state = store.getState();
  const ad = state.landing.autodrop;
  if (ad.armed === null || next !== null) return;
  if (ad.armed === 'pass' ? !passOver(state, view) : !planOver(state)) return;
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
  const sol = getDropSolution();
  if (machine.held && !now.clock.paused && sol !== null) heldTick(store, viewOf(now, sol));
  // Review m5: under a higher controller AUTODROP holds no thread and ends nothing.
  if (machine.armed === null || now.clock.paused || shadowed(now)) {
    if (machine.claimed) claimTick(store, null);
    return;
  }
  if (sol === null) return;
  const view = viewOf(now, sol);
  if (machine.armed === 'plan') pinTick(store, view);
  const after = store.getState();
  if (after.landing.autodrop.armed === null) return;
  const next = armedNext(after, view, after.landing.autodrop.armed);
  claimTick(store, next);
  doneTick(store, next, view);
}

// Review M1: held in an open window where v1 has nothing more to fly (the next pod's drop is WIDE, the sure part is spent,
// the LZ is full), the hold lets go, so the strip's `press [L]` is true and the kid's next press is the manual launch. No
// lesson (`end` stands): the kid did not let go.
function heldTick(store: Store<GameState>, view: Readonly<LandingView>): void {
  const state = store.getState();
  const open = state.landing.window;
  if (open === null) return;
  const next = heldVolley(state, view);
  if (next !== null && next.win.lz === open.lz && next.win.open <= state.clock.tSec) return;
  store.update((draft) => { draft.landing.autodrop.held = false; });
}

// v3's plan flies `lz`: a row of it (a count or a leftover) goes there. Judged by the LZ, not the window: a hand drop in a
// window of an LZ the plan still sends pods to would take that LZ's room from a sure row of a later pass (the review's
// probe: each WIDE drop into LZ-B freed a planned pod, which was then thrown WIDE too).
function planUses(state: Readonly<GameState>, view: Readonly<LandingView>, lz: string): boolean {
  return planLanding(state, view).rows.some((row) => row.lz === lz);
}

// The pod AUTODROP v3 pins to LOAD NEXT now (review M2), or null: in an open window of an LZ with room that the plan does not
// fly, the healthiest pod the plan holds for no window (a pin already on one of those stands: the kid chose it).
function planPin(state: Readonly<GameState>, view: Readonly<LandingView>): number | null {
  const open = state.landing.window;
  if (open === null || (view.remaining[open.lz] ?? 0) < 1 || planUses(state, view, open.lz)) return null;
  const outside = planLanding(state, view).outside;
  const pinned = state.landing.loadNext;
  if (pinned !== null && outside.includes(pinned)) return pinned;
  return outside[0] ?? null;
}

// v3 does not hold the windows it does not use (review M2): there it pins LOAD NEXT to a pod outside the plan, so the kid's
// [L] (L4–L6 stand there) throws that pod and never one the plan keeps for a sure window. Out of such a window a pin on an
// outside pod goes, and the next launch is the plan's again.
function pinTick(store: Store<GameState>, view: Readonly<LandingView>): void {
  const state = store.getState();
  const want = planPin(state, view);
  const pinned = state.landing.loadNext;
  if (want !== null && pinned !== want) {
    store.update((draft) => { draft.landing.loadNext = want; draft.ui.memoryRev++; });
  } else if (want === null && pinned !== null && planLanding(state, view).outside.includes(pinned)) {
    store.update((draft) => { draft.landing.loadNext = null; draft.ui.memoryRev++; });
  }
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
  if (shadowed(state)) return controllerWaitLine(state);
  const live = skillLive(state.memory, 'autodrop');
  const ad = state.landing.autodrop;
  if (live.version < 1 && ad.end === null) return null;
  const view = viewOf(state, sol);
  const text = AUTODROP_TEXT.strip;
  let row: AutodropLine['row'] = null;
  let tail: AutodropLine['tail'] = null;
  if (ad.armed !== null && live.version >= 2) {
    const next = armedNext(state, view, state.landing.autodrop.armed);
    if (ad.waitingSinceTSec !== null && next !== null) {
      row = { id: 'landing-AD-wait', text: text.wait(countdown(state, next.atTSec)), keys: [], urgency: 'now', layer: 'mind' };
    } else if (next !== null && Math.min(tacTo(state, next.atTSec), tacTo(state, next.opensAt)) <= WINDOW_TACTICAL_LEAD_TAC) {
      row = { id: 'landing-AD-fly', text: text.fly(next.lz, next.n, countdown(state, next.atTSec)), keys: ['G'], urgency: 'wait', layer: 'ship' };
    } else if (state.landing.window !== null && armedFor(state, view, state.landing.window.lz)) {
      // A window the machine owns: v2's sure window of an LZ its pass flies, or any window while v3's plan has rows (the plan
      // holds every pod for the windows it chose). It waits, so the strip doesn't offer L4–L6's manual [L] there. A v2 pass
      // leaves a WIDE DROP window, or an LZ it doesn't fly, to the kid's hands.
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
  // The tails offer [G] only when it would fly something (no NOTHING SET: a pass with nothing that fits, an empty plan).
  if (live.version === 2 && passRows(state, view, passCounts(state, view)).some((r) => r.want > 0 && r.fits > 0)) tail = { text: text.tailPass, key: 'G' };
  else if (live.version >= 3 && planLanding(state, view).rows.length > 0) tail = { text: text.tailPlan, key: 'G' };
  return row === null && tail === null ? null : { row, tail };
}

// Slice 5 review fix pass (M1): a controller other than AUTODROP's own flies (the sleeper's RUN THE DROPS 5, MERGE 7: never
// the kid's hands), so AUTODROP's rows stand aside, and while it names a launch it waits for it owns every open window: a
// wait row with no key, so the strip never says `press [L]` for a launch out of its plan (the kid raced MOTH there: 66% landed
// against 77% with no hands). The rule an armed v3 keeps (armedFor), with one difference: a wrapping source runs no pinTick
// (AUTODROP's machine is shadowed), so the windows of an LZ the plan does not fly are its too, or the kid's [L] there would
// throw queue[0], which may be a pod the plan holds for a later window. With nothing left to fly (a hurt driver's pod the plan
// cannot fit) it names none, and the kid's rows come back (L4, L5, L9, L11). The id is AD-armed's, so a sinking orbit (L10)
// still outranks it (review m4 of 4c); no name, no sleeper line (R21).
function controllerWaitLine(state: Readonly<GameState>): AutodropLine | null {
  if (state.landing.window === null) return null;
  const waits = activeLandingController(state)?.waitsFor?.(state) ?? null;
  if (waits === null) return null;
  const text = LANDING_LINES.L13controller(waits.lz, Math.max(0, tacTo(state, waits.atTSec)));
  return { row: { id: 'landing-AD-armed', text, keys: [], urgency: 'wait', layer: 'ship' }, tail: null };
}

// The armed machine owns the open window of `lz`: v3 when its plan sends pods to that LZ, or when it has rows and no pod
// outside the plan to give the kid's [L] (review B2, M2: the windows of an LZ it does not fly are the kid's, with LOAD NEXT
// pinned to a pod the plan does not hold); v2 when the window is sure and the pass sends (or sent) pods there.
function armedFor(state: Readonly<GameState>, view: Readonly<LandingView>, lz: string): boolean {
  const ad = state.landing.autodrop;
  if (ad.armed === 'plan') {
    if (planLanding(state, view).rows.length === 0) return false;
    return planUses(state, view, lz) || planPin(state, view) === null;
  }
  if (state.landing.window?.sure !== true) return false;
  return (ad.sent[lz] ?? 0) > 0 || passWant(state)(lz) > 0;
}

// Whether version `version`'s once-only lesson is due now (data/script.ts SKILL_4CDE_RULES: tut-autodrop-v1/v2/v3):
// • v1 (R4): a tap on [L] was let go before the volley's first launch (`end: 'released'`), while v1 or better works;
// • v2 / v3: the first landing where AUTODROP works as exactly that version, nothing armed yet, pods aboard.
export function autodropTutorialDue(state: Readonly<GameState>, version: SkillVersion): boolean {
  if (!landingOn(state)) return false;
  const live = skillLive(state.memory, 'autodrop').version;
  const ad = state.landing.autodrop;
  if (version === 1) return live >= 1 && ad.end === 'released' && !ad.held;
  if (live !== version || ad.armed !== null || podCounts(state).aboard === 0) return false;
  // Review M4: only on a landing where [G] would fly something (no lesson to press a key that refuses NO SURE WINDOW).
  const sol = getDropSolution();
  if (sol === null || sol.block !== null || sol.dot === null) return false;
  const view = viewOf(state, sol);
  if (version === 2) return passRows(state, view, passCounts(state, view)).some((row) => row.want > 0 && row.fits > 0);
  return planLanding(state, view).rows.length > 0;
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
    const next = sol === null ? null : armedNext(state, viewOf(state, sol), state.landing.autodrop.armed);
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

// Who goes lower for a never-fits `lz`, as its line says it (plan §3.4): the kid (`fly lower`), AUTOBURN v3 while it holds
// the landing orbit (it goes lower itself, GO LOWER is gated), or nobody (review m3): `lz` is in v3's own misses, so v3
// has decided it will not go lower for it.
export function whoGoesLower(state: Readonly<GameState>, lz: string): 'kid' | 'v3' | 'none' {
  if (!autoburnHoldsLandingOrbit(state)) return 'kid';
  const aim = landingOrbitAim(state, getPrediction());
  return aim !== null && aim.misses.some((miss) => miss.lz === lz) ? 'none' : 'v3';
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
