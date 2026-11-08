// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.1, §5). SURVEY_BUILT.poor is Track SWATH's one line
// (raised first, then SKILL_TREE.survey.built in data/skills.ts: plan R19). Others ask by message.
import type { SiteData } from '@/types/survey';
import type { ShipDef } from '@data/ships';
import { SURVEY_CELL_DEG, SURVEY_CELLS } from '@data/tuning';

// What this build plays of POOR site data (plan R19): while `poor` is false every planet plays GOOD (no hidden grounds, no
// boot or CONTROL line, no card rows), whatever the map rolled; a ship's ShipDef.site is the map's roll either way.
export const SURVEY_BUILT: Readonly<{ poor: boolean }> = {
  // Track SWATH raises this line (POOR plays POOR), before SKILL_TREE.survey.built.
  poor: false,
};

// A ship's site data as this build plays it: the map's roll once POOR is built, else GOOD. The one gate every reader goes
// through (state/initial.ts createShipSlices: the sites, the hidden grounds; the card and the AHEAD line through the slice
// or this).
export function siteDataOf(ship: Readonly<Pick<ShipDef, 'site'>>): SiteData {
  return SURVEY_BUILT.poor ? ship.site : 'good';
}

// The cells tile the rim exactly (tuning: SURVEY_CELLS = 360 / SURVEY_CELL_DEG).
if (SURVEY_CELLS * SURVEY_CELL_DEG !== 360) throw new Error(`survey: ${SURVEY_CELLS} cells of ${SURVEY_CELL_DEG}° do not tile the rim`);
