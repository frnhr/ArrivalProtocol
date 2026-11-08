// Slice 7b: Track VIEW owns this file (docs/phase3/impl/slice-7-plan.md §2.10, §4.2, §5.2). Pure: THE LAST LANDING's view
// models (R29), read every paint, so the FOUNDATION's stubs are neutral (the screen shows what it showed in 7a). The words are
// data/last-landing-text.ts's. Readers: components/run/LastLanding.ts (the header strip and its hint), the POD BAY window's
// RESTORED row (PodBayWindow.ts, VIEW's marked edit), and landing-report.ts (the RESTORED BY MERGE row's counts and icons,
// the credits' `(restored)`; the lead's hooks). The beacons' `restored` is landing-hud parkedBeacons' (the lead's), drawn by
// VIEW in plot-landing.ts.
// ending/last-landing-models (VIEW's suite) checks them on hand-built states.
import type { GameState } from '@state/schema';
import type { LandingTally, PodSummary } from '@/types/landing';
import type { PodIcon } from '@systems/landing-report';

// The header strip over the SHIP view while THE LAST LANDING flies (01 §3.17): `THE LAST LANDING`, the pods still to come
// down, and `[ENTER] SKIP TO THE END`; null when it is not running.
export interface LastLandingHeaderModel {
  title: string;
  left: number;
  hint: string;
}

export function lastLandingHeader(state: Readonly<GameState>): LastLandingHeaderModel | null {
  void state;
  return null;
}

// The POD BAY window's `RESTORED 4` row (R29), or null (no row).
export interface PodBayRestoredRow {
  count: number;
  text: string;
}

export function podBayRestoredRow(state: Readonly<GameState>): PodBayRestoredRow | null {
  void state;
  return null;
}

// The final LANDING REPORT's RESTORED BY MERGE row (R29: `4 RESTORED · 3 LANDED · 1 OFF-SITE`, with its pods' icons), or null:
// landing-report.ts then draws the row as 7a did (its label, no counts, no icons).
export interface RestoredReportRow {
  text: string;
  icons: PodIcon[];
}

export function restoredReportRow(tally: Readonly<LandingTally>): RestoredReportRow | null {
  void tally;
  return null;
}

// What a restored pod's credit adds after its place (R29: ` (restored)`), '' for every other pod and until built.
export function restoredCreditTag(pod: Readonly<PodSummary>): string {
  void pod;
  return '';
}
