// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §3, §7.2). The FOUNDATION wrote it
// as stubs with their final signatures (plan §7.1 item 5): the hot-path readers below return a neutral answer (no
// controller, no line, no lesson, the plain Skills row) so the game plays exactly as before; the entry points that change
// state throw through not-built.ts until DROP builds them. mountAutodrop (the resolver's registration) and setDropDemos
// (a debug write) are built.
//
// AUTODROP (03 §3.3, §3.5, §3.8; 01 §3.3, §3.4, §3.14): the per-version controller, [L] held (v1), [G] (v2's pass, v3's
// plan), its Core thread, downgrades, its guidance slot and its Skills row. Its machine is state.landing.autodrop (types/
// landing.ts AutodropState), so the controller is derived from the state each tick and dies with its file.
// Module-level state allowed here (plan §2.3): the plan memo, and `wasInWindow` for the arm chime.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { AutodropLine, AutodropState, DropSolution, LandingController } from '@/types/landing';
import type { EffectiveVersion, SkillVersion } from '@/types/skill';
import { registerLandingController } from '@systems/landing-controller';
import { skillLive } from '@systems/capabilities';
import { notBuilt } from '@systems/not-built';

// --- The controller (plan §3.1) ------------------------------------------------------------------------------------------

// What slice 7's MERGE resolver passes to fly restored pods at AUTODROP's effective version with its own queue (01 §3.17).
// 4c builds only the seam.
export interface AutodropOverride {
  version: EffectiveVersion;
  queue: readonly number[];
}

// AUTODROP's controller now, or null. DROP: null unless phase 'landing', the landing goes on and
// skillLive('autodrop').version > 0, and:
//   v1: autodrop.held && ui.mode === 'tools'  → { source: 'autodrop', holdsTactical: true, launchesFromMind: false }
//   v2/v3: autodrop.armed !== null           → { source: 'autodrop', holdsTactical: true, launchesFromMind: true }
// decide(view, state) returns the next LaunchIntent at its moment ({ source: 'autodrop', pod?, confirmed? }), else null.
// STUB (hot path: landing-controller.ts asks it every tick): null, the kid's hands.
export function autodropController(state: Readonly<GameState>, override?: Readonly<AutodropOverride>): LandingController | null {
  void state;
  void override;
  return null;
}

// Mounted with the landing (landing.ts mountLanding): AUTODROP's resolver joins the controller registry. Returns the
// unmount. BUILT (DROP adds its own subscriptions here: the arm chime's edge, the blur release).
export function mountAutodrop(store: Store<GameState>): () => void {
  void store;
  return registerLandingController('autodrop', (state) => autodropController(state));
}

// --- The kid's inputs (plan §3.2–§3.3) -----------------------------------------------------------------------------------

// [L] down (landing-controls.ts, also pointer-down on the POD BAY's LAUNCH and the phone bar's button): 'held' when v1 or
// better works, the SHIP screen is up, and the awaited window has a sure part that is open or opens within
// WINDOW_TACTICAL_LEAD_TAC (plan R4); 'manual' otherwise, and the manual path runs as today. STUB: throws.
export function autodropKeyDown(store: Store<GameState>): 'held' | 'manual' {
  return notBuilt('autodropKeyDown', 'DROP', store);
}

// Why [G] did nothing (pressAutodrop's refusals, plan §3.3).
export type AutodropRefusal = 'NOT LANDING' | 'NO AUTODROP' | 'AUTODROP OFF' | 'NOTHING SET' | 'PAUSED';

// [G] (landing-controls.ts, from either screen): arms v2's 'pass' (with armedAtTSec) or v3's 'plan'; [G] again cancels.
// STUB: throws.
export function pressAutodrop(store: Store<GameState>): AutodropRefusal | null {
  return notBuilt('pressAutodrop', 'DROP', store);
}

// The POD BAY's [−] n [+] for `lz` (v2): this pass's count, clamped to the LZ's room. STUB: throws.
export function setPassCount(store: Store<GameState>, lz: string, n: number): void {
  notBuilt('setPassCount', 'DROP', store, lz, n);
}

// --- Readers (hot paths: the guidance table, the director, the Skills window) --------------------------------------------

// AUTODROP's guidance slot (plan §3.7; landing-guidance.ts buildLandingContext reads it every tick). STUB: null.
export function autodropLineOf(state: Readonly<GameState>, sol: Readonly<DropSolution>): AutodropLine | null {
  void state;
  void sol;
  return null;
}

// Whether version `version`'s once-only lesson is due now (data/script.ts SKILL_4CDE_RULES: tut-autodrop-v1/v2/v3). STUB:
// false, never due.
export function autodropTutorialDue(state: Readonly<GameState>, version: SkillVersion): boolean {
  void state;
  void version;
  return false;
}

// The Skills window's status for AUTODROP (systems/skills.ts SKILL_ROW_HOOKS): `CENTRE · AIM 91% · 3 drops`, `ARMED · LZ-A
// ×2 IN 0:12`, `UNTRAINED 40%`, `WORKS AS v1 — REPAIR IT FOR v2`. null: the plain row (whether it works). STUB: null.
export function autodropStatus(state: Readonly<GameState>): { text: string; tone: 'good' | 'warn' } | null {
  void state;
  return null;
}

// --- Debug (`__ap.autodrop()`, `__ap.dropDemos([...])`) -----------------------------------------------------------------

export interface AutodropDebug {
  state: AutodropState;
  version: EffectiveVersion;          // what the file works as now (skillLive)
  controller: boolean;                // a controller is active now
  volley: unknown;                    // DROP: the volley at hand (autodrop-plan.ts Volley)
  pass: unknown;                      // DROP: the POD BAY's pass rows (autodrop-plan.ts passRows)
  plan: unknown;                      // DROP: v3's plan (autodrop-plan.ts planLanding)
}

// STUB (reads only): the machine and the file's version; the volley, the pass rows and the plan are DROP's (null now).
export function autodropDebug(state: Readonly<GameState>): AutodropDebug {
  return {
    state: structuredClone(state.landing.autodrop), version: skillLive(state.memory, 'autodrop').version,
    controller: autodropController(state) !== null, volley: null, pass: null, plan: null,
  };
}

// The kid's drop demos, set by hand (each a launch's offset from its window's centre, tactical s): what AIM learns from.
// BUILT (debug and suites only).
export function setDropDemos(store: Store<GameState>, offsets: readonly number[]): void {
  if (!offsets.every(Number.isFinite)) throw new Error(`setDropDemos: ${offsets.join(', ')} are not all numbers`);
  store.update((draft) => { draft.run.stats.dropDemos = offsets.map((offsetTac) => ({ offsetTac })); });
}
