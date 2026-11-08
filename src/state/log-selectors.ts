import type { GameState, RunLogState } from '@state/schema';
import type { LogSegment } from '@/types/segment';
import type { LogBook } from '@/types/trace';
import { LOG_NAME, logEntryLines, type LogVars } from '@data/log-text';
import { bookName, bookEntryLines } from '@data/log-books';
import { currentSlot, isEndSlot, worldSlotOf } from '@systems/map-streams';
import { solLy, ringsWithin } from '@systems/map-geometry';
import { RING_LY } from '@data/arm';

// 046.log's pure rules (docs/phase3/05-story.md §3.2; slice-2-plan §1.1 items 14–15): what a fresh run's log is, when the
// kid knows the file, and which entries a boot finds. Store-free and DOM-free, so data (script.ts's boot plan and SCAN
// lesson), the initial state, the stateful mount (systems/story-log.ts) and the views (systems/log-view.ts) share one rule
// without importing a mount module (the review's minor 7: two `logKnown`s disagreed, and data imported the mount).
// Slice 3a keys the boots by the rings (05 §3.2: an entry opens at the boot of the first ship at or beyond its ring)
// behind bootLogKeys, which data/script.ts's boot plan calls (Track GEN owns it; script.ts is DESK's).

// A run's log before anything is found, holding `book` (slice 7c, R37: systems/traces.ts logBookOf at RUN START; 046.log
// left out).
export function createRunLog(book: LogBook = { kind: '046' }): RunLogState {
  return { scanned: false, found: [], read: [], autoOpened: false, toldReading: false, book: structuredClone(book) as LogBook };
}

// HOLLOW's `> you're reading my log. good. read it slowly.` is due at this boot (05 §3.5; slice-3b-plan §1.1 item 19): once
// a run, at the first boot after entry 05 is read (run.log.read has 5, run.log.toldReading is still false). data/script.ts
// bootLinePlan places the 'reading' line from it, before the log key line; systems/boot.ts sets toldReading as it is said.
export const READING_LINE_AFTER_ENTRY = 5;
export function readingLineDue(state: Readonly<GameState>): boolean {
  const log = state.run.log;
  return log.read.includes(READING_LINE_AFTER_ENTRY) && !log.toldReading;
}

// The kid knows what the file is (slice-2-plan risk 5): scanned, or a key found. The chip's name derives from this, not
// the other way round: the segment is rebuilt with `???` by the simulation retry and copied through every packet, so
// the run's log is the one truth and story-log brings the segment in line with it every tick.
export function logKnown(log: Readonly<RunLogState>): boolean {
  return log.scanned || log.found.length > 0;
}

// Slice 7c (R37): the known name is the book's (046.log, 031.log, 047.log; data/log-books.ts bookName, Track LINEAGE's).
export function logDisplayName(log: Readonly<RunLogState>): LogSegment['name'] {
  return logKnown(log) ? bookName(log.book) : LOG_NAME.unknown;
}

// The entries each of 046.log's rings opens (05 §3.2's key table), ring 1 (20 LY) first: 02, 03, 04, 05–06, 07–08, 09.
// data/arm.ts RING_LY holds the distances; one entry list per ring.
export const RING_ENTRIES: readonly (readonly number[])[] = [[2], [3], [4], [5, 6], [7, 8], [9]];
// The final ship's boot opens the truth's first two entries (05 §3.2: 10–11; 12 is in the root).
export const FINAL_ENTRIES: readonly number[] = [10, 11];
// Any charge renders an entry's words; the check only asks whether they exist.
const FRESH_UNIT_CHARGE_FOR_CHECK = 36;

// --- Slice 7c: the books (R37; the lead's, built in full) ----------------------------------------------------------------
// A book's shape: how many entries, which opens with the first landing, which each ring opens (RING_LY's order), which the
// final ship's boot opens, and which is FOUND IN THE ROOT (it types from the root at its last block). The words are
// data/log-books.ts's (Track LINEAGE): names, KEY columns, lines.
export interface BookShape {
  count: number;
  firstLanding: number;
  rings: readonly (readonly number[])[];
  final: readonly number[];
  root: number;
}

// 046.log (05 §3.2): 12 entries, the rings above, 10–11 at the final ship, 12 in the root.
export const BOOK_046: Readonly<BookShape> = { count: 12, firstLanding: 1, rings: RING_ENTRIES, final: FINAL_ENTRIES, root: 12 };
// A stranger's book (R37): FIRST LANDING, ring 2, ring 4, ring 5, the final ship's boot, FOUND IN THE ROOT.
export const BOOK_STRANGER: Readonly<BookShape> = { count: 6, firstLanding: 1, rings: [[], [2], [], [3], [4], []], final: [5], root: 6 };
// 047.log (R37): 01 the welcome, 02–05 keyed rings 1, 2, 4 and 5, 06 at the final ship's boot, 07 in the root.
export const BOOK_LAST: Readonly<BookShape> = { count: 7, firstLanding: 1, rings: [[2], [3], [], [4], [5], []], final: [6], root: 7 };

export function bookShape(book: Readonly<LogBook>): Readonly<BookShape> {
  switch (book.kind) {
    case '046': return BOOK_046;
    case 'stranger': return BOOK_STRANGER;
    case 'last': return BOOK_LAST;
  }
}

// At load: each shape has a ring list per ring, opens every entry exactly once (the first landing, a ring, the final ship's
// boot or the root), and 046.log has the words for every entry a boot can open (log-view.ts throws on a found entry with
// none, loudly, at the reader; this says it before any run: the e2e run found 05–09 on the arm with no text). The other
// books' words are LINEAGE's suite's to check (data/log-books.ts).
for (const shape of [BOOK_046, BOOK_STRANGER, BOOK_LAST]) {
  if (shape.rings.length !== RING_LY.length) throw new Error(`log-selectors: ${shape.rings.length} ring entry lists for ${RING_LY.length} rings`);
  const opened = [shape.firstLanding, ...shape.rings.flat(), ...shape.final, shape.root].sort((a, b) => a - b);
  if (opened.join() !== Array.from({ length: shape.count }, (_, i) => i + 1).join()) {
    throw new Error(`log-selectors: a ${shape.count}-entry book opens ${opened.join()}`);
  }
}
for (const n of [...BOOK_046.rings.flat(), ...BOOK_046.final]) {
  if (logEntryLines(n, { charge: FRESH_UNIT_CHARGE_FOR_CHECK }) === null) throw new Error(`log-selectors: entry ${n} opens at a boot but has no text`);
}

// The root's entry's lines (FOUND IN THE ROOT: 046.log's 12), as story-log types them at the root's last block and the FINALE
// card shows them. Throws when the book has no words for it (a data bug).
export function rootEntryLines(log: Readonly<RunLogState>, vars: Readonly<LogVars>): readonly string[] {
  const n = bookShape(log.book).root;
  const lines = bookEntryLines(log.book, n, vars);
  if (lines === null) throw new Error(`rootEntryLines: entry ${n} (FOUND IN THE ROOT) is not written`);
  return lines;
}

// The entries whose keys a boot `solLy` LY from SOL finds (05 §3.2; slice 3a: the rings replace 05 §8.2's interim keys):
// every ring at or inside that distance (an entry opens at the boot of the first ship at or beyond its ring, so a
// two-layer hop opens two rings, and a boot past a ring whose entry a lost ship never found finds it now), and on a final
// ship 10–11. Entry 01 opens when ship 1's LANDING REPORT closes and entry 12 at the root's last block, so no boot finds
// them. The boot plan takes out the entries the run has found (data/script.ts bootLogEntries).
// Slice 7c: by the run's book (`shape`; 046.log's left out).
export function logEntriesAtBoot(solLy: number, isFinal: boolean, shape: Readonly<BookShape> = BOOK_046): number[] {
  if (!(Number.isInteger(solLy) && solLy >= 0)) throw new Error(`logEntriesAtBoot: ${solLy} LY from SOL`);
  const entries = ringsWithin(solLy).flatMap((ring) => shape.rings[ring]!);
  return isFinal ? [...entries, ...shape.final] : entries;
}

// The entries this boot's keys open, before the run's found ones are taken out (data/script.ts bootLogEntries): by the
// current ship's world's distance from SOL, and the final ship's two. The review follow-up M3: script.ts calls this, never
// re-derives the rule.
export function bootLogKeys(state: Readonly<Pick<GameState, 'run'>>): number[] {
  const slot = currentSlot(state.run);
  return logEntriesAtBoot(solLy(worldSlotOf(state.run.map, slot)), isEndSlot(state.run.map, slot), bookShape(state.run.log.book));
}
