// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { GameState } from '@state/schema';
import type { ResumeLine } from '@/types/save';
import { unitName } from '@data/hollow-text';
import { launchOf } from '@systems/lineage';
import { solLy } from '@systems/map-geometry';
import { END_SLOTS } from '@data/arm';
import { MAP_TEXT } from '@data/map-text';
import { traceNextLines } from '@systems/trace-hud';

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
//   systems/meta.ts archiveNotesSaid when the kid leaves the title;
// • (playtest 1 note 1) ERASE ALL RECORDS at the title's foot, in every archive state, with its confirm's keys
//   (titleEraseKey).

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
  // Slice 7c (02 §3.12: the traces are "shown on the title and the final card"): the NEXT RUN: lines the last unit's ending
  // left this run (systems/trace-hud.ts traceNextLines, the final card's own), none on run 1 or after a run with no ending.
  traces: string[];
  // Playtest 1 (note 1, §3.12): ERASE ALL RECORDS is offered, on the title (not while it boots), whatever the archive's
  // state: OFFLINE and CORRUPT included (the remove may fail there, and the title says so).
  erase: boolean;
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
// number), or null (run 1, a run whose last unit the archive no longer names).
export function titleLaunch(state: Readonly<Pick<GameState, 'run'>>): TitleLaunch | null {
  const launch = launchOf(state.run);
  const last = state.run.map.history.lastUnitNumber;
  if (launch === null || last === null) return null;
  const years = launch.gap + launch.valveYears;
  let stamp: string;
  if (launch.valveYears > 0) stamp = MAP_TEXT.title.stampValve(years);
  else stamp = years === 0 ? MAP_TEXT.title.stampSameYear : MAP_TEXT.title.stamp(years);
  return { fromYear: launch.startYear - years, toYear: launch.startYear, years, valveYears: launch.valveYears, last: unitName(last), stamp };
}

// `runs save between ships` is said only while a save would be written: the save works and the archive can vouch for it
// (review fix M1: never beside ARCHIVE CORRUPT, OFFLINE or PLAYING WITHOUT; save-write.ts goes OFFLINE at RUN START then).
export function titleModel(state: Readonly<Pick<GameState, 'run' | 'save' | 'archive'>>, notes: Readonly<TitleNotes> | null): TitleModel {
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
  const ending = state.run.lastUnit?.ending ?? null;
  return {
    unit, unitLine, launch, save: block, receive,
    traces: ending === null ? [] : traceNextLines(ending),
    erase: state.run.phase === 'title',
    saveNote: save.status === 'ok' && save.resume === null && state.archive.status === 'ok' ? MAP_TEXT.title.savesBetweenShips : null,
    notes: notes === null ? [] : [
      ...(notes.olderArchive ? [MAP_TEXT.save.olderArchive] : []),
      ...(notes.armReset ? [MAP_TEXT.save.armReset] : []),
    ],
  };
}

// ENTER on the title's save block (review fixes B2 and minor 1), pure so a suite drives it without a DOM. `asking`: NEW RUN's
// inline confirm is up; `focus`: the save block's button that has the keyboard focus (null: none of them). A focused button
// does what it says by itself (the browser clicks it on ENTER), so the key does nothing more there: with NEW RUN focused,
// ENTER asks, never resumes. Otherwise ENTER is RESUME on the RESUME block, ABANDON RUN on CAN'T RESUME (its only way on),
// and KEEP IT on NEW RUN's confirm: abandoning a run that could be resumed takes a click on ABANDON RUN or its own key,
// [DEL] (titleAbandonKey). No save block (or RUN SAVE OFFLINE): RECEIVE TRANSMISSION's own ENTER (systems/boot.ts).
export type TitleSaveButton = 'resume' | 'new-run' | 'abandon' | 'keep';
export type TitleSaveAction = 'resume' | 'ask' | 'abandon' | 'keep';

export function titleEnterAction(block: Readonly<TitleSaveBlock> | null, asking: boolean, focus: TitleSaveButton | null): TitleSaveAction | null {
  if (block === null || block.kind === 'offline' || focus !== null) return null;
  if (block.kind === 'cant-resume') return 'abandon';
  return asking ? 'keep' : 'resume';
}

// NEW RUN's confirm's deliberate key for ABANDON RUN ([DEL]: Delete, or the Mac's backspace-labelled delete).
export const TITLE_ABANDON_CODES: readonly string[] = ['Delete', 'Backspace'];

export function titleAbandonKey(block: Readonly<TitleSaveBlock> | null, asking: boolean): TitleSaveAction | null {
  return block?.kind === 'resume' && asking ? 'abandon' : null;
}

// ERASE ALL RECORDS' confirm (playtest 1 note 1, §3.12), pure: while it asks, [DEL] (Delete, or the Mac's backspace-labelled
// delete) erases, and ENTER and ESC keep the records. Every other key does nothing, and the save block's keys wait: one
// question at a time on the title. Not asking: nothing (the button itself opens the question).
export type TitleEraseAction = 'erase' | 'keep';
export const TITLE_ERASE_CODES: readonly string[] = TITLE_ABANDON_CODES;
export const TITLE_ERASE_KEEP_CODES: readonly string[] = ['Enter', 'NumpadEnter', 'Escape'];

export function titleEraseKey(code: string, asking: boolean): TitleEraseAction | null {
  if (!asking) return null;
  if (TITLE_ERASE_CODES.includes(code)) return 'erase';
  if (TITLE_ERASE_KEEP_CODES.includes(code)) return 'keep';
  return null;
}

// Whether the erase confirm is up (TitleCard sets it): RECEIVE TRANSMISSION's ENTER and SPACE (systems/boot.ts) wait while
// it asks, so the ENTER that keeps the records never also starts a run. The page's one title, so one flag.
let eraseAsking = false;

export function setTitleEraseAsking(on: boolean): void {
  eraseAsking = on;
}

export function titleEraseAsking(): boolean {
  return eraseAsking;
}
