// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §3.2–§3.4, §3.6, §7.2). Pure: AUTODROP's
// volleys, the bay's count by a moment, v2's pass rows, v3's plan and the drop demos' offsets. The FOUNDATION wrote it as
// stubs with their final signatures; each returns a neutral answer (nothing to fly, nothing planned) until DROP builds it,
// and nothing calls them yet.
import type { GameState } from '@state/schema';
import type { BayState, DropSolution, LandingView, LaunchRecord, LzWindow, RepairHint } from '@/types/landing';

// One volley (plan §3.2): `n` pods into `lz`, the first at `firstAtTSec` (game s), each later one `spacingSec` on.
export interface Volley {
  lz: string;
  n: number;
  firstAtTSec: number;
  spacingSec: number;
}

// The volley centred on window `w` (plan §3.2, R5, R6): the sure part is the sure span intersected with the in-band span;
// n = min(the bay loaded at the first launch (bayBy), the LZ's room, the launches that fit), first = centre − (n − 1) ×
// cadence × AUTODROP_SPACING_FRAC + offset, each later one a cadence on, all inside the sure part. `offsetTac` is the
// learned (or untrained) offset, `warp` the tactical warp. null: nothing fits. STUB: null.
export function centredVolley(
  view: Readonly<LandingView>, w: Readonly<LzWindow>, nowTSec: number, offsetTac: number, cadenceTac: number, warp: number,
  room: number, bay: Readonly<BayState>,
): Volley | null {
  void view; void w; void nowTSec; void offsetTac; void cadenceTac; void warp; void room; void bay;
  return null;
}

// The pods the bay holds at `atTSec` (01 §3.4's double window): BAY_SLOTS slots, a reload of BAY_RELOAD_TAC of world time
// per pod from `nowTSec`, less the launches planned before it in this pass (`launchesBefore`, game s). STUB: 0.
export function bayBy(
  bay: Readonly<BayState>, cadenceTac: number, launchesBefore: readonly number[], nowTSec: number, atTSec: number, warp: number,
): number {
  void bay; void cadenceTac; void launchesBefore; void nowTSec; void atTSec; void warp;
  return 0;
}

// One row of v2's POD BAY (plan §3.3): the count set for `lz`, how many this pass can fly there, and the shortfall the bay
// leaves by then (`B ×3 — BAY HAS 1 BY THEN`; null: none).
export interface PassRow {
  lz: string;
  want: number;
  fits: number;
  bayHas: number | null;
}

// v2's rows for the counts in `pass`, one per LZ with room. STUB: [].
export function passRows(state: Readonly<GameState>, view: Readonly<LandingView>, pass: Readonly<Record<string, number>>): PassRow[] {
  void state; void view; void pass;
  return [];
}

// v3's plan (plan §3.4).
export interface PlanRow {
  pass: number;
  lz: string;
  n: number;
  atTSec: number;
  pods: number[];
  mislanded: number;      // pods sent at the wrong-split rate (×MISLANDED_FACTOR): the leftovers, in the last rows
  forecast: boolean;      // after DropSolution.validUntilTSec: drawn dim, re-planned at the kick
}

export interface LandingPlan {
  rows: PlanRow[];          // in time order
  passes: number;
  perLz: Record<string, number>;
  neverFits: { lz: string; repair: RepairHint | null }[];
  complete: boolean;        // every LZ with room reaches its count
}

// The whole landing as v3 would fly it from now (pure, memoised on the launches so far, orbitEpoch, the drop factors and
// loadNext: R18). STUB: the empty plan.
export function planLanding(state: Readonly<GameState>, view: Readonly<LandingView>): LandingPlan {
  void state; void view;
  return { rows: [], passes: 0, perLz: {}, neverFits: [], complete: false };
}

// A manual launch as a drop demo (plan §3.6): (the launch's time − the moment the dot's centre crossed the bracket's
// centre) ÷ the tactical warp, tactical s; null when it is not a demo (off-site). STUB: null.
export function dropDemoOffset(sol: Readonly<DropSolution>, launch: Readonly<LaunchRecord>, warp: number): number | null {
  void sol; void launch; void warp;
  return null;
}
