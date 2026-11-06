// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §5, §7.2). Pure: AUTOBURN v3's
// LANDING ORBIT, the highest round orbit on the V3_STEP_KM grid where every LZ that still needs pods gets a sure window, its
// top-up rule against decay, and its words. The FOUNDATION wrote it as stubs with their final signatures; each returns a
// neutral answer (no aim: v2's rule; no line; no lesson) until ORBIT builds it.
// Module-level state allowed here (plan §2.3): the landingOrbitAim memo and roundAim's (review 4 m13).
import type { GameState } from '@state/schema';
import type { RepairHint } from '@/types/landing';
import type { Prediction } from '@systems/predict';

// v3's target (plan §5.1).
export interface LandingOrbitAim {
  targetKm: number;                                      // R*, on the V3_STEP_KM grid from ring.max down
  fits: string[];                                        // the LZs with room that get a sure window there
  misses: { lz: string; repair: RepairHint | null }[];   // the others, with the REPAIR that would help (L9's rule)
  dropKm: number;                                        // the widest dot half-width among them there (`DROP ±70 km`)
  fuelAfterPct: number;                                  // after the capture, the transfer and the expected holds
  belowDrag: boolean;
}

// The landing orbit now, or null: nothing leaves AUTO_FUEL_RESERVE_PCT, and MODES_BY_VERSION[3] falls back to v2's rule
// (03 §3.6). Memoised on the LZs with room, the three drop factors, the ring, whole-percent FUEL and the phase. Judged at
// LANDING_TACTICAL_WARP in FLIGHT too (R12). STUB: null.
export function landingOrbitAim(state: Readonly<GameState>, pred: Readonly<Prediction>): LandingOrbitAim | null {
  void state; void pred;
  return null;
}

// What a planned top-up does about the windows (plan §5.3, R13): `lower` re-aims the held circle down to the other apsis's
// altitude (every LZ in `fits` still fits there); `costs-window` burns anyway and says `AUTOBURN v3: TOP-UP COSTS LZ-B's
// WINDOW`; `clear` crosses no window of an LZ with room.
export type V3TopUp =
  | { kind: 'lower'; toKm: number; lz: string }
  | { kind: 'costs-window'; lz: string }
  | { kind: 'clear' };

// The top-up's verdict for the burn the prediction plans now, or null with no top-up planned. STUB: null.
export function v3TopUp(state: Readonly<GameState>, pred: Readonly<Prediction>, aim: Readonly<LandingOrbitAim>): V3TopUp | null {
  void state; void pred; void aim;
  return null;
}

// L9's slot while v3 is engaged in its landing orbit (guidance.ts landingFlightOf carries it to the landing table every
// tick, on the prediction the table is built on; R16): `AUTOBURN v3 GOES LOWER — LZ-B's dot will fit`, or null (L9 says its
// own line, or nothing). STUB: null.
export function v3LowerLine(state: Readonly<GameState>, pred: Readonly<Prediction>): string | null {
  void state; void pred;
  return null;
}

// L10's slot (foundation review M4): while v3 holds its landing orbit below the DRAG line, its words outrank L10's `ORBIT
// DECAYING` (the decay is what it is handling): `AUTOBURN v3 TOPS UP AT ▼ IN 3:10 — it holds the orbit`. null: L10 says its
// own line (or none). Carried like v3LowerLine. STUB: null.
export function v3DecayLine(state: Readonly<GameState>, pred: Readonly<Prediction>): string | null {
  void state; void pred;
  return null;
}

// The NAV PLOT's label on the ghost circle (flight-hud.ts autoGhost): `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL
// −9%`, or `LANDING ORBIT · LZ-A, LZ-B FIT · REPAIR POD 05 FOR LZ-C`. STUB: ''.
export function v3GhostLabel(state: Readonly<GameState>, aim: Readonly<LandingOrbitAim>): string {
  void state; void aim;
  return '';
}

// Whether v3's once-only lesson is due now (data/script.ts SKILL_4CDE_RULES: tut-autoburn-v3). STUB: false.
export function v3TutorialDue(state: Readonly<GameState>): boolean {
  void state;
  return false;
}

// `__ap.v3()`: the aim and its memo key (ORBIT: R*, fits, misses, the fuel line). STUB: the aim (null) and no key.
export function v3Debug(state: Readonly<GameState>, pred: Readonly<Prediction>): { aim: LandingOrbitAim | null; key: string | null } {
  return { aim: landingOrbitAim(state, pred), key: null };
}
