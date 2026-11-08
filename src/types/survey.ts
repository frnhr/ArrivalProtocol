// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.2, §5); tracks ask by message. A new saved field is
// folded into the slice's one save bump (v6, R1) by the lead.
// SURVEY's types (01-landing §3.13, 03-skills §3.9): a POOR planet's sites (CONTROL's guesses, the candidates, a wreck), the
// ship's survey machine (LandingState.survey, in the store so a BEAM save rebuilds it from the boot: R2, R20) and the record a
// ship's result keeps (ShipResult.survey). Type-only imports.
import type { LzGround, LzWidth } from '@/types/landing';
import type { EffectiveVersion } from '@/types/skill';

// A planet's site data (02 §3.5's ArmShip.reserved.site, data/ships.ts ShipDef.site): what this build plays is
// data/survey.ts siteDataOf's (POOR plays GOOD until SURVEY_BUILT.poor).
export type SiteData = 'good' | 'poor';

// CONTROL's guess for an LZ (the LZ 3a rolled, standing where it was rolled), a candidate SURVEY can find, or the story's
// wreck (01 §7: `SITE 5 · ROOM 0 · WRECKAGE · OLD POD`), which no LZ can take.
export type SiteKind = 'guess' | 'candidate' | 'wreck';

// A bad ground (R3): ROCKY or WET.
export type BadGround = Exclude<LzGround, 'flat'>;

export interface SurveySite {
  id: string;                   // 'guess-A' (CONTROL's guess for LZ-A), 'site-1' … candidates and wrecks in rim order from 0 rad
  kind: SiteKind;
  number: number;               // a guess: its LZ's index (0: LZ-A); a candidate or a wreck: its SITE number (1…)
  centreRad: number;            // world radians, [0, 2π)
  halfWidthRad: number;         // the true half-width: a WET site's is WET_WIDTH_FACTOR of its class's (R4)
  widthKm: number;              // the true width (a WET site's narrowed)
  width: LzWidth;               // its class, shown as WIDE / STANDARD / NARROW
  roomPods: number;             // ROOM in pods: a guess's is its LZ's count, a wreck's 0
  ground: LzGround;             // the truth
  found: boolean;               // its centre's cell is mapped (a guess is on the guesses' list from the boot, found or not)
  groundKnown: boolean;         // rated by v2+ (R11) or shown by a touchdown (R5); false at the boot on every site
}

// What SURVEY is doing (the 'survey-state' event, the Skills row, the SITES header).
export type SurveyRunning = 'running' | 'waiting' | 'paused' | 'done' | 'off';

// Who made a bad ground known (R5): SURVEY v2's swath, or the first pod down on it.
export type RevealBy = 'survey' | 'touchdown';

export interface SurveyMove {
  lz: string;                   // the LZ's label
  site: string;                 // the site it moved to
}

export interface SurveyReveal {
  site: string;                 // the bad site made known (each stamps once)
  by: RevealBy;
}

export interface SurveyState {
  site: SiteData;
  sites: SurveySite[];          // [] on a GOOD planet
  mapped: boolean[];            // SURVEY_CELLS cells of SURVEY_CELL_DEG from 0 rad; all false until SURVEY runs
  paused: boolean;              // the kid's PAUSE (R7)
  claimed: boolean;             // holds its Core thread (v1, v2; ops-core holdsThread('survey') is the truth mid-ship); false at every save point
  lastRad: number | null;       // the ship's angle at the last mapped tick (the swept cells); null at rest
  ranAt: EffectiveVersion;      // the best version it mapped at on this ship (0: never ran)
  moves: SurveyMove[];          // in order (the report, the record, CONTROL's once-line)
  reveals: SurveyReveal[];      // bad grounds made known, in order
  lines: { firstFind: boolean; mapped: boolean; controlBoot: boolean; controlMoved: boolean };   // said once per ship
}

// Why a site can't take an LZ (R10; survey-model.ts assignRefusal, words in data/survey-text.ts SURVEY_TEXT.refusal).
// 'closed': SURVEY can't assign here (the gate not built, a GOOD planet, no SURVEY aboard that works).
export type AssignRefusal =
  | 'closed' | 'not-found' | 'wreck' | 'too-small' | 'taken' | 'pods-down' | 'falling' | 'window-open' | 'landing-over' | 'same';

// The ship's survey as its result keeps it (ShipResult.survey; null on a GOOD planet): the LANDING REPORT, slice 7's epilogue
// (`RIVERSIDE stayed dry: you moved LZ-B off the lake`) and slice 8's sweeps.
export interface SurveyRecord {
  ranAt: EffectiveVersion;
  mappedPct: number;            // whole, 0..100
  found: number;                // candidates and wrecks found (guesses not counted)
  moves: SurveyMove[];
  badKept: { lz: string; ground: BadGround; known: RevealBy | null }[];   // LZs on bad ground at the end
}
