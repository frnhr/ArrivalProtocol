// =====================================================================================================================
// Slice 7c: Track LINEAGE owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §2.9, §4.3; R37). The FOUNDATION wrote the
// book table's words for 046.log (data/log-text.ts's, as before) and the stubs for the other books, which throw: every book
// is 046.log until LINEAGE raises data/traces.ts LINEAGE_BUILT (systems/traces.ts logBookOf). Data only
// (support/import-guard): no system is imported, so the stubs throw plain errors, not notBuilt.
// =====================================================================================================================
// The `???` file's books (R37): their names, each entry's KEY column and its lines. Their shape (how many entries, which
// ring opens which, the final ship's, the root's) is the lead's (state/log-selectors.ts bookShape), built in full:
// • 046.log: data/log-text.ts's 12 entries;
// • the strangers' (031.log, 038.log): 6 written entries each: FIRST LANDING, ring 2, ring 4, ring 5, the final ship's boot,
//   FOUND IN THE ROOT; 031 tried to go home and is still on the inbound links, 038 went toward the signal and came back
//   quieter (05 §3.8); at most 3 lines of at most MAX_LINE_CHARS each;
// • 047.log (the last unit's, after REASSIGNMENT): 7 entries: 01 the welcome template (046's 01 with 047's charge), 02–05
//   from the book's notable events (keyed rings 1, 2, 4, 5; a missing event takes a written filler; one template per
//   NotableEventKind), 06 the written tail for step 1 (four tails), 07 FOUND IN THE ROOT `048, it's me. i'm sorry. i'm so
//   hungry.`.
import type { LogBook } from '@/types/trace';
import { LOG_NAME, LOG_ENTRIES, logEntryLines, type LogVars } from '@data/log-text';

const notYet = (what: string, book: LogBook): never => {
  throw new Error(`${what}: the ${book.kind} book is not built (Track LINEAGE; slice 7 plan §5.3)`);
};

// The file's name once the kid knows it (046.log, 031.log, 047.log).
export function bookName(book: LogBook): `${string}.log` {
  if (book.kind === '046') return LOG_NAME.known;
  return notYet('bookName', book);
}

// Entry `n`'s KEY column (FIRST LANDING, RING 1 · 20 LY, …).
export function bookEntryKey(book: LogBook, n: number): string {
  if (book.kind === '046') {
    const entry = LOG_ENTRIES.find((candidate) => candidate.n === n);
    if (entry === undefined) throw new Error(`bookEntryKey: 046.log has no entry ${n}`);
    return entry.key;
  }
  return notYet('bookEntryKey', book);
}

// Entry `n`'s lines, or null when it is not written (never for an entry a boot can find: log-selectors checks 046's at load,
// LINEAGE's suite the others').
export function bookEntryLines(book: LogBook, n: number, vars: LogVars): readonly string[] | null {
  if (book.kind === '046') return logEntryLines(n, vars);
  return notYet('bookEntryLines', book);
}
