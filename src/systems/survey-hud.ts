// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §2.14, §6.2): SURVEY's view models, pure,
// which the painters (SitesWindow, plot-survey on the NAV PLOT, GroundTrack through landing-hud, the SHIP CARD through
// desk.ts, TRAINING's AHEAD line through training-model.ts, the LANDING REPORT through landing-report.ts) read. The
// FOUNDATION wrote the final signatures as stubs that answer empty (plan §6.1 item 6); SITES may widen the models' fields
// (they are its own). No module state (plan §2.3). Words are data/sites-text.ts's (and data/survey-text.ts's labels).
import type { GameState } from '@state/schema';

// An arc of the rim in world radians (from < to; `to` may run past 2π): a mapped or unmapped stretch, a swath's edges.
export interface RimArc {
  fromRad: number;
  toRad: number;
}

// A found site's dashed bracket (look 'candidate', landing-hud.ts BracketLook) on the GROUND TRACK: world angles, its label
// (`SITE 4`). landing-hud.ts groundTrackModel lays them onto the overview line and the strip.
export interface SurveyBracket {
  site: string;           // the SurveySite id (a click selects it in SITES)
  centreRad: number;
  halfWidthRad: number;
  label: string;
}

// The GROUND TRACK's candidate brackets (found sites no LZ stands on; plan §2.14). FOUNDATION stub (neutral): none.
export function surveyGroundBrackets(state: Readonly<GameState>): SurveyBracket[] {
  void state;
  return [];
}

// The rim not yet mapped (drawn `░` on the GROUND TRACK: landing-hud.ts terrainStretches' `unmapped`, and the overview
// line's planet.unmapped). FOUNDATION stub (neutral): none (all of a GOOD planet reads as mapped).
export function surveyUnmapped(state: Readonly<GameState>): RimArc[] {
  void state;
  return [];
}

// The NAV PLOT's survey layer (plot-survey.ts, in flight and landing on POOR planets, under the landing layer): the swath's
// wedge (±swath under the ship; twice as wide at v3), the mapped rim, the found candidates' dashed brackets, the guesses'
// `?` and `✕`. FOUNDATION stub (neutral): null (nothing drawn).
export interface SurveyPlotModel {
  wedge: { centreRad: number; halfRad: number } | null;
  mapped: RimArc[];
  brackets: SurveyBracket[];
}

export function surveyPlotModel(state: Readonly<GameState>): SurveyPlotModel | null {
  void state;
  return null;
}

// The SHIP CARD's SITE DATA row for `slot` (desk.ts cardModel's reserved 'site' row, R15): `SITE DATA · GOOD`, `POOR ·
// ARRIVAL CONTROL GUESSED` (warn), and after the ship `POOR · LZ-B MOVED` / `SURVEYED, KEPT` / `NOT SURVEYED`. null: no row.
// FOUNDATION stub (neutral): null.
export interface SurveyCardRow {
  label: string;
  value: string;
  tone: 'plain' | 'good' | 'warn';
}

export function surveyCardRow(state: Readonly<GameState>, slot: number): SurveyCardRow | null {
  void state;
  void slot;
  return null;
}

// TRAINING's AHEAD row's second line for the selected ship `slot` (training-model.ts TrainingModel.aheadSite, R15): `SITE
// DATA POOR · SURVEY FINDS BETTER SITES` (SURVEY's branch open or held), else `SITE DATA POOR · ARRIVAL CONTROL GUESSED THE
// LZs`; null on a GOOD ship or none selected. FOUNDATION stub (neutral): null.
export function surveyAheadLine(state: Readonly<GameState>, slot: number | null): string | null {
  void state;
  void slot;
  return null;
}

// The LANDING REPORT's LZ row suffix for `lz` (landing-report.ts, 01's LZ-row slot): ` · SITE 4`, ` · ROCKY · 5 HARD`.
// FOUNDATION stub (neutral): ''.
export function surveyLzRowSuffix(state: Readonly<GameState>, lz: string): string {
  void state;
  void lz;
  return '';
}

// The SITES window (SitesWindow.ts): its header and rows, or null while it has nothing to show (a GOOD planet). SITES fills
// the model. FOUNDATION stub (neutral): null.
export interface SitesWindowModel {
  header: string;
  status: string | null;
  rows: { site: string; text: string }[];
}

export function sitesWindowModel(state: Readonly<GameState>): SitesWindowModel | null {
  void state;
  return null;
}
