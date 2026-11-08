import type { GameState } from '@state/schema';
import type { LogSegment, Segment } from '@/types/segment';
import { LOG_TEXT } from '@data/log-text';
import { bookEntryKey, bookEntryLines, bookName, bookUnit, BOOK_TEXT } from '@data/log-books';
import { FRESH_UNIT_CHARGE } from '@data/memory';
import { logKnown, logDisplayName, bookShape } from '@state/log-selectors';

// 046.log as the screens show it (05-story §3.2, §4; slice-2-plan §5.3), pure and DOM-free, so the headless tests check
// what a kid would read: the chip (`046.log · 3/12`, glowing while an entry is unread) on the strip, in INSPECT and on
// the PACKET, and the LOG READER's rows (number, KEY, the text or `[NOT FOUND YET]`, then the next key). The log's
// progress is run.log (systems/story-log.ts, Track OPENING's); this file is Track UI's, the way hollow-hud.ts is. The name is derived from it too, so a ship-1 restart that started the log
// over can't leave a stale `046.log` behind (slice-2-plan, notes for OPENING).

// The reader's own words beside log-text's (OPENING's): the column heads, the next key, the way out.
export const LOG_UI_TEXT = {
  // Slice 7c (R37): the reader's kicker and title follow the book (data/log-books.ts BOOK_TEXT.kicker, bookName).
  kicker: 'LOG READER · UNIT-046',
  entry: 'ENTRY',
  nextKey: (key: string): string => `NEXT KEY: ${key}`,
  allFound: 'EVERY KEY FOUND',
  close: 'CLOSE',
  unread: 'NEW',
  read: '▸ read 046.log',
  readCost: (unread: number): string => (unread > 0 ? `${unread} new` : 'open'),
  found: (found: number, total: number): string => `${found} / ${total} found`,
  lockedState: 'LOCKED · NOT YOURS',
} as const;

export interface LogChipModel {
  known: boolean;       // scanned, or a key found: the kid knows it is 046.log
  name: string;         // ??? / 046.log
  found: number;
  total: number;
  unread: number;
  glow: boolean;        // an entry found and not read yet (05 §4: the chip glows)
  count: string;        // 3/12
  label: string;        // 046.log · 3/12, or ??? before it is known
}

export function logSegment(memory: readonly Segment[]): LogSegment | null {
  return (memory.find((seg) => seg.type === 'log') as LogSegment | undefined) ?? null;
}

export function logChip(state: Readonly<GameState>): LogChipModel {
  const log = state.run.log;
  // The one rule (state/log-selectors.ts): scanned, or a key found; story-log renames the segment from it.
  const known = logKnown(log);
  const found = log.found.length;
  const unread = log.found.filter((n) => !log.read.includes(n)).length;
  // Slice 7c (R37): the book's entry count and name (every book is 046.log until LINEAGE_BUILT).
  const total = bookShape(log.book).count;
  const count = `${found}/${total}`;
  const name = logDisplayName(log);
  return { known, name, found, total, unread, glow: unread > 0, count, label: known ? `${name} · ${count}` : name };
}

// The entry a click on the chip (or INSPECT's READ) opens: the first one found and not read yet, else the last one
// found. null: nothing found yet (the reader never opens on an entry it can't show).
export function logEntryToOpen(state: Readonly<GameState>): number | null {
  const log = state.run.log;
  const found = [...log.found].sort((a, b) => a - b);
  const unread = found.find((n) => !log.read.includes(n));
  return unread ?? found[found.length - 1] ?? null;
}

export interface LogReaderRow {
  n: number;
  num: string;                      // 01
  key: string;                      // FIRST LANDING / RING 1 · 20 LY
  found: boolean;
  read: boolean;
  open: boolean;                    // the entry the reader is open on
  lines: readonly string[] | null;  // null: [NOT FOUND YET]
}

export interface LogReaderModel {
  title: string;                    // 046.log
  kicker: string;
  counts: string;                   // 3 / 12 found
  open: number | null;
  rows: LogReaderRow[];
  nextKey: string;                  // NEXT KEY: RING 4 · 93 LY, or EVERY KEY FOUND
}

export function logReaderModel(state: Readonly<GameState>): LogReaderModel {
  const log = state.run.log;
  const open = state.ui.logReader?.entry ?? null;
  // Slice 7c (R37): the book's entries, keys and lines (data/log-books.ts, Track LINEAGE's words).
  const entries = Array.from({ length: bookShape(log.book).count }, (_, i) => ({ n: i + 1, key: bookEntryKey(log.book, i + 1) }));
  const rows = entries.map((entry): LogReaderRow => {
    const found = log.found.includes(entry.n);
    const lines = found ? bookEntryLines(log.book, entry.n, { charge: FRESH_UNIT_CHARGE }) : null;
    // A found entry the slice never wrote is a data bug (log-text writes every entry a slice can find).
    if (found && lines === null) throw new Error(`logReaderModel: entry ${entry.n} is found but has no text`);
    return {
      n: entry.n, num: String(entry.n).padStart(2, '0'), key: entry.key, found, read: log.read.includes(entry.n),
      open: entry.n === open, lines,
    };
  });
  const next = rows.find((row) => !row.found);
  return {
    title: log.book.kind === '046' ? LOG_TEXT.readerTitle : bookName(log.book),
    kicker: log.book.kind === '046' ? LOG_UI_TEXT.kicker : BOOK_TEXT.kicker(bookUnit(log.book)),
    counts: LOG_UI_TEXT.found(log.found.length, entries.length),
    open,
    rows,
    nextKey: next === undefined ? LOG_UI_TEXT.allFound : LOG_UI_TEXT.nextKey(next.key),
  };
}

// The found entry before or after `entry` in the reader (↑ / ↓), or null at either end.
export function adjacentFoundEntry(state: Readonly<GameState>, entry: number, step: 1 | -1): number | null {
  const found = [...state.run.log.found].sort((a, b) => a - b);
  const index = found.indexOf(entry);
  if (index < 0) throw new Error(`adjacentFoundEntry: entry ${entry} is not found`);
  return found[index + step] ?? null;
}
