// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { GameState } from '@state/schema';
import type { ResumeLine } from '@/types/save';
import { unitName } from '@systems/say';
import { solLy } from '@systems/map-geometry';
import { END_SLOTS } from '@data/arm';
import { MAP_TEXT } from '@data/map-text';

// The title card's model (02-map §3.11, §4; 05-story §3.9, §3.12; slice-3c-plan §3 steps 2 and 6), pure in the state:
// • the unit line: run 1's `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`, and from run 2 the launch line `UNIT-048 · YEAR
//   2303 · LAUNCHED 3 YEARS AFTER UNIT-047` (the time valve's years included), with the roll the view plays up to it (the
//   year and the gap counting up from the last unit's start) and its stamp;
// • the run save's block (GameState.save): `RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625` with [RESUME ▸] and
//   [NEW RUN] (an inline confirm first), or `RUN SAVE CAN'T RESUME · <reason>` with [ABANDON RUN] only (the words are
//   MAP_TEXT.save.reason[refusal.kind]; refusal.detail is the console's, never the screen's), or RUN SAVE OFFLINE; RECEIVE
//   TRANSMISSION is hidden while a save is there;
// • `runs save between ships` under it (said only while the page can save);
// • the archive's one-off notes (an older archive not carried over, the arm redrawn), said once: the view clears them with
//   systems/meta.ts archiveNotesSaid when the kid leaves the title.

export type TitleSaveBlock =
  | { kind: 'resume'; line: string; confirm: string }
  | { kind: 'cant-resume'; line: string }
  | { kind: 'offline'; line: string };

export interface TitleLaunch {
  fromYear: number;         // the last unit's start: the roll's first year
  toYear: number;           // this unit's
  years: number;            // the gap, the valve's years included (the line's number)
  valveYears: number;
  last: string;             // `UNIT-047`
  stamp: string;            // `+3 YEARS`, `SAME YEAR`, `+14 YEARS · THE ARM MOVED ON`
}

export interface TitleModel {
  unit: string;             // `UNIT-048`
  unitLine: string;         // the line as it settles
  launch: TitleLaunch | null;
  save: TitleSaveBlock | null;
  receive: boolean;         // RECEIVE TRANSMISSION is offered
  saveNote: string | null;  // `runs save between ships`
  notes: string[];          // the archive's one-off notes
}

// The archive's one-off notes as the title reads them (systems/meta.ts Meta.notes; null with no archive behind the page).
export interface TitleNotes {
  olderArchive: boolean;
  armReset: boolean;
}

// The RESUME line for a save written at `resume.point` (02 §3.11): a boot point names the ship it is bound for, the desk the
// ship just done, ENDING CHOSEN the final ship's LANDING REPORT.
export function resumeLineText(resume: Readonly<ResumeLine>): string {
  const unit = unitName(resume.unit);
  switch (resume.point) {
    case 'run-start':
    case 'beam': return MAP_TEXT.save.resumeBoot(unit, resume.depth, resume.ship, resume.year);
    case 'ship-done': return MAP_TEXT.save.resumeDesk(unit, resume.depth, resume.year);
    case 'ending-chosen': return MAP_TEXT.save.resumeReport(unit, resume.ship, resume.year);
  }
}

// The launch line's parts from run 2 (the map's history: the gap and the valve's years the update rolled, the last unit's
// number), or null (run 1, the classic world, a run whose last unit the archive no longer names).
export function titleLaunch(state: Readonly<Pick<GameState, 'run'>>): TitleLaunch | null {
  const map = state.run.map;
  const history = map.history;
  if (map.world !== 'arm' || map.run <= 1 || history.lastUnitNumber === null) return null;
  const years = history.gap + history.valveYears;
  let stamp: string;
  if (history.valveYears > 0) stamp = MAP_TEXT.title.stampValve(years);
  else stamp = years === 0 ? MAP_TEXT.title.stampSameYear : MAP_TEXT.title.stamp(years);
  return { fromYear: map.startYear - years, toYear: map.startYear, years, valveYears: history.valveYears, last: unitName(history.lastUnitNumber), stamp };
}

export function titleModel(state: Readonly<Pick<GameState, 'run' | 'save'>>, notes: Readonly<TitleNotes> | null): TitleModel {
  const unit = unitName(state.run.unitNumber);
  const launch = titleLaunch(state);
  const unitLine = launch === null
    ? MAP_TEXT.title.line(unit, state.run.map.startYear, solLy(END_SLOTS[0]!))
    : MAP_TEXT.title.launched(unit, launch.toYear, launch.years, launch.last);
  const save = state.save;
  let block: TitleSaveBlock | null = null;
  if (save.status === 'ok' && save.resume !== null) {
    block = { kind: 'resume', line: resumeLineText(save.resume), confirm: MAP_TEXT.save.abandonConfirm(unitName(save.resume.unit)) };
  } else if (save.status === 'cant-resume') {
    if (save.refusal === null) throw new Error('titleModel: a save that can\'t resume carries no refusal');
    block = { kind: 'cant-resume', line: MAP_TEXT.save.cantResume(MAP_TEXT.save.reason[save.refusal.kind]) };
  } else if (save.status === 'offline') {
    block = { kind: 'offline', line: MAP_TEXT.save.offlineTitle };
  }
  const receive = block === null || block.kind === 'offline';
  return {
    unit, unitLine, launch, save: block, receive,
    saveNote: save.status === 'ok' && save.resume === null ? MAP_TEXT.title.savesBetweenShips : null,
    notes: notes === null ? [] : [
      ...(notes.olderArchive ? [MAP_TEXT.save.olderArchive] : []),
      ...(notes.armReset ? [MAP_TEXT.save.armReset] : []),
    ],
  };
}
