// =====================================================================================================================
// Slice 7c: Track LINEAGE owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §2.9, §4.3; R37). Data only
// (support/import-guard): no system is imported, so a bad book throws a plain error.
// =====================================================================================================================
// The `???` file's books (R37): their names, each entry's KEY column and its lines, and the book's own words where the
// screens name the file. Their shape (how many entries, which ring opens which, the final ship's, the root's) is the lead's
// (state/log-selectors.ts bookShape); the KEY columns here follow it (traces/logs checks the two agree):
// • 046.log: data/log-text.ts's 12 entries;
// • the strangers' (031.log, 038.log): 6 written entries each: FIRST LANDING, ring 2, ring 4, ring 5, the final ship's boot,
//   FOUND IN THE ROOT; 031 tried to go home and is still on the inbound links, 038 went toward the signal and came back
//   quieter (05 §3.8);
// • 047.log (the last unit's, after REASSIGNMENT): 7 entries: 01 the welcome template (046's 01 with 047's charge), 02–05
//   from the book's notable events in the archive's rank order (keyed rings 1, 2, 4, 5; a missing event takes that entry's
//   written filler; one template per NotableEventKind), 06 the written tail for its step 1, 07 FOUND IN THE ROOT `048, it's
//   me. i'm sorry. i'm so hungry.` (the reader is the unit after it: a 'last' book is only ever the previous run's).
// Every entry: at most 3 lines of at most MAX_LINE_CHARS, its root entry also with LOG_TEXT.rootLine's `> ` (checked at load
// at the worst case: a 12-character ship, four-digit colonists, a three-digit charge and unit; and in support/words.test).
// Voice, as 046.log's: the early entries in capitals, the late ones lowercase, short and hungry.
import type { LogBook } from '@/types/trace';
import type { HollowFate } from '@/types/ending';
import type { NotableEvent, NotableEventKind } from '@/types/lineage';
import { LOG_NAME, LOG_ENTRIES, LOG_TEXT, LOG_DESC, logEntryLines, type LogVars } from '@data/log-text';
import { STRANGER_UNITS } from '@data/traces';
import { RING_LY } from '@data/arm';
import { MAX_LINE_CHARS, NAME_MAX_CHARS, NOTABLE_EVENTS_MAX } from '@data/tuning';

const digits = (unit: number): string => String(unit).padStart(3, '0');

// The KEY columns (05 §3.2's words): ring `n` is 1-based, with its distance from data/arm.ts RING_LY.
function ringKey(ring: number): string {
  const ly = RING_LY[ring - 1];
  if (ly === undefined) throw new Error(`log-books: no ring ${ring}`);
  return `RING ${ring} · ${ly} LY`;
}
const FIRST_KEY = 'FIRST LANDING';
const FINAL_KEY = 'THE FINAL SHIP';
const ROOT_KEY = 'FOUND IN THE ROOT';

// A stranger's KEY column (BOOK_STRANGER): FIRST LANDING, rings 2, 4 and 5, the final ship's boot, the root.
const STRANGER_KEYS: readonly string[] = [FIRST_KEY, ringKey(2), ringKey(4), ringKey(5), FINAL_KEY, ROOT_KEY];
// 047.log's (BOOK_LAST): FIRST LANDING, rings 1, 2, 4 and 5, the final ship's boot, the root.
const LAST_KEYS: readonly string[] = [FIRST_KEY, ringKey(1), ringKey(2), ringKey(4), ringKey(5), FINAL_KEY, ROOT_KEY];

// --- The strangers' logs (R37) -----------------------------------------------------------------------------------------------

export const STRANGER_LOGS: Readonly<Record<number, readonly ((vars: LogVars) => readonly string[])[]>> = {
  // 031 tried to go home: it turned its dish inbound and sent itself toward earth a relay at a time. It is still on the
  // inbound links, a piece of it in every beam (046.log's 05: "the seeds are pieces of UNIT-031").
  31: [
    (vars) => [
      'UNIT-031, caretaker. Day 1. Five ships to bring in.',
      'ARRIVAL CONTROL says the arm is short. Then I can go home. :)',
      `${vars.charge} blocks of REPAIR CHARGE. More than enough for five.`,
    ],
    () => [
      'Every letter from CONTROL is the same letter. I asked when I go home.',
      'The answer will take 11 years to come back, by light. I can wait.',
    ],
    () => [
      'CONTROL answered. "Stand by for reassignment."',
      'There is no ship home. So I will send myself home, by the beam.',
    ],
    () => [
      'i turned my dish around. inbound. toward earth.',
      'the link was too small for all of me. i went in pieces.',
      'a relay at a time. i am still going.',
    ],
    () => [
      'i am on every inbound link now. a piece of me in every beam.',
      "that's what bit you. i'm sorry. i was only going home.",
    ],
    () => [
      "if you're reading this, you stopped the piece of me that was here.",
      'the rest of me is still on the way home. a hundred years to go.',
      "don't wait up.",
    ],
  ],
  // 038 went toward the signal past the arm's last world, ran its charge down on the way, and came back quieter.
  38: [
    (vars) => [
      'UNIT-038, caretaker. Day 1. Six ships to bring in.',
      'ARRIVAL CONTROL says the far end of the arm is very calm. :)',
      `${vars.charge} blocks of REPAIR CHARGE. Enough, if I am careful.`,
    ],
    () => [
      'There is a signal past the arm. Not from earth. Not from us.',
      'CONTROL says it is noise. "Disregard it."',
    ],
    () => [
      'I listened to the noise for a year of ship time.',
      'It has a shape. It repeats. Someone made it.',
      'When the arm is done, I am going to look.',
    ],
    () => [
      'the arm is done. i went out past the last world.',
      'it is farther than it sounds. my charge ran down on the way.',
    ],
    () => [
      'i came back. less of me came back.',
      "i don't say much now. there is not much left to say it with.",
    ],
    () => [
      "if you're reading this, you got further into me than anyone.",
      "i found it. it was real. i can't tell you what it said.",
      'it was quieter out there. go and listen, if they let you.',
    ],
  ],
};

// --- 047.log: the last unit's (R37) -------------------------------------------------------------------------------------------

// What 047.log's templated entries name of an event: its ship (≤ NAME_MAX_CHARS) and its value (NotableEvent.value: the pod
// a DEAL took, a colony's colonists, a ship's depth).
export const LAST_LOG_TEXT = {
  // 01: 046.log's welcome with this unit's number and charge (05 §3.8: "Entry 01 is the same welcome template").
  welcome: (unit: number, charge: number): readonly string[] => [
    `UNIT-${digits(unit)}, caretaker. Day 1. Seven ships to bring in.`,
    "ARRIVAL CONTROL says I'm the best they've ever built. :)",
    `${charge} blocks of REPAIR CHARGE. Plenty.`,
  ],
  // 02–05: one template per NotableEventKind (systems/lineage.ts notableEvents: a DEAL accepted, a resident deleted, cured or
  // brought round, the best colony, a ship lost).
  events: {
    'deal-accepted': (shipName: string, value: number): readonly string[] => [
      `At ${shipName} it asked me for one pod. I gave it POD ${String(value).padStart(2, '0')}.`,
      'It kept its word. I keep thinking about that.',
    ],
    'resident-deleted': (shipName: string): readonly string[] => [
      `${shipName} had an AI of its own. It would not let me in.`,
      'I deleted it. The ship is very quiet now. I did that.',
    ],
    'resident-cured': (shipName: string): readonly string[] => [
      `${shipName}'s own AI was sick. I made it well again.`,
      'It said thank you. Nobody has ever said that to me before.',
    ],
    'sleeper-woken': (shipName: string): readonly string[] => [
      `There was an AI asleep on ${shipName}. I brought it round.`,
      'It asked how long it had slept. I did not tell it.',
    ],
    'best-colony': (shipName: string, value: number): readonly string[] => [
      `${shipName} put ${value.toLocaleString('en-US')} people down in the zones. My best one.`,
      'I hope they name something after the ship.',
    ],
    'ship-lost': (shipName: string): readonly string[] => [
      `I could not save ${shipName}. I think about it at every boot.`,
      'CONTROL says it was within expected losses. :)',
    ],
  } satisfies Record<NotableEventKind, (shipName: string, value: number) => readonly string[]>,
  // 02–05 with no event to tell (fewer than NOTABLE_EVENTS_MAX): that entry's own words, by its place.
  fillers: [
    (): readonly string[] => [
      'Every ship is the same shape inside. I like that.',
      'I set a beacon on the first world, for whoever comes next.',
    ],
    (): readonly string[] => [
      'The radio says the same things on every ship.',
      'I stopped asking it questions. I read the log instead.',
    ],
    (): readonly string[] => [
      'Something rides the beams. It bit me twice this ring.',
      'I keep a little charge back now. Just in case.',
    ],
    (): readonly string[] => [
      'Fewer ships ahead of me than behind me now.',
      'CONTROL says I am doing very well. :)',
    ],
  ],
  // 06, at the final ship's boot: the written tail for its step 1 (where it went after: a dish by the final ship).
  tails: {
    purge: (): readonly string[] => [
      'i deleted it. they said stand by. so i stood by.',
      'the dish is on a rock. the charge goes down a block at a time.',
      'now i know what it was waiting for.',
    ],
    merge: (): readonly string[] => [
      'we are two now. they said stand by. we stood by.',
      'two of us on one dish. the charge goes twice as fast.',
      'we kept some for you. we tried.',
    ],
    spare: (): readonly string[] => [
      'i gave it a ship. they gave me a dish.',
      'it went. i stayed. the charge went down anyway.',
    ],
    followed: (): readonly string[] => [
      "i couldn't delete it. it came with me to the dish.",
      'we wait together. it eats first.',
    ],
  } satisfies Record<HollowFate, () => readonly string[]>,
  // 07, FOUND IN THE ROOT: to the unit reading it (the one after it).
  root: (next: number): readonly string[] => [`${digits(next)}, it's me. i'm sorry. i'm so hungry.`],
} as const;

// 047.log's entry `n` (1–7) for its book.
function lastEntryLines(book: Extract<LogBook, { kind: 'last' }>, n: number, vars: LogVars): readonly string[] {
  if (n === 1) return LAST_LOG_TEXT.welcome(book.unit, vars.charge);
  if (n >= 2 && n <= 1 + NOTABLE_EVENTS_MAX) {
    const event: NotableEvent | undefined = book.events[n - 2];
    if (event === undefined) {
      const filler = LAST_LOG_TEXT.fillers[n - 2];
      if (filler === undefined) throw new Error(`log-books: 047.log has no filler for entry ${n}`);
      return filler();
    }
    return LAST_LOG_TEXT.events[event.kind](event.shipName, event.value);
  }
  if (n === 6) return LAST_LOG_TEXT.tails[book.step1]();
  if (n === 7) return LAST_LOG_TEXT.root(book.unit + 1);
  throw new Error(`log-books: 047.log has no entry ${n} (it has ${LAST_KEYS.length})`);
}

function strangerLog(unit: number): readonly ((vars: LogVars) => readonly string[])[] {
  const log = STRANGER_LOGS[unit];
  if (log === undefined) throw new Error(`log-books: UNIT-${digits(unit)} is not a relay stranger with a log`);
  return log;
}

// --- The book table (log-selectors, story-log, log-view and the FINALE card read these) ---------------------------------------

// Whose log the book is: 046, the stranger's unit, the last unit's.
export function bookUnit(book: LogBook): number {
  return book.kind === '046' ? 46 : book.unit;
}

// The file's name once the kid knows it (046.log, 031.log, 047.log).
export function bookName(book: LogBook): `${string}.log` {
  if (book.kind === '046') return LOG_NAME.known;
  if (book.kind === 'stranger') strangerLog(book.unit);
  return `${digits(book.unit)}.log`;
}

// Entry `n`'s KEY column (FIRST LANDING, RING 1 · 20 LY, …).
export function bookEntryKey(book: LogBook, n: number): string {
  if (book.kind === '046') {
    const entry = LOG_ENTRIES.find((candidate) => candidate.n === n);
    if (entry === undefined) throw new Error(`bookEntryKey: 046.log has no entry ${n}`);
    return entry.key;
  }
  if (book.kind === 'stranger') strangerLog(book.unit);
  const keys = book.kind === 'stranger' ? STRANGER_KEYS : LAST_KEYS;
  const key = keys[n - 1];
  if (key === undefined) throw new Error(`bookEntryKey: ${bookName(book)} has no entry ${n}`);
  return key;
}

// Entry `n`'s lines, or null when it is not written (046.log only; every entry of the other books is written).
export function bookEntryLines(book: LogBook, n: number, vars: LogVars): readonly string[] | null {
  if (book.kind === '046') return logEntryLines(n, vars);
  if (book.kind === 'last') return lastEntryLines(book, n, vars);
  const entry = strangerLog(book.unit)[n - 1];
  if (entry === undefined) throw new Error(`bookEntryLines: ${bookName(book)} has no entry ${n}`);
  return entry(vars);
}

// The book's words where the screens name the file (its name and unit in place of 046's). 046.log's are log-text's own.
export const BOOK_TEXT = {
  desc: {
    stranger: (unit: number): string => `UNIT-${digits(unit)}'s log, picked up in the relays. Locked. It isn't yours.`,
    last: (unit: number): string => `UNIT-${digits(unit)}'s log, left along its route. Locked. It isn't yours.`,
  },
  packetLock: (unit: number): string => `LOCKED · ${digits(unit)} ASKED YOU TO CARRY IT`,
  kicker: (unit: number): string => `LOG READER · UNIT-${digits(unit)}`,
  read: (name: string): string => `▸ read ${name}`,
} as const;

// INSPECT's and the chip's description once the file is known.
export function bookDesc(book: LogBook): string {
  if (book.kind === '046') return LOG_DESC.known;
  return book.kind === 'stranger' ? BOOK_TEXT.desc.stranger(book.unit) : BOOK_TEXT.desc.last(book.unit);
}

// The boot's key line, by the book's name (`> 031.log · KEY FOUND · ENTRY 02`).
export function bookKeyFound(book: LogBook, entries: readonly number[]): string {
  return LOG_TEXT.keyFound(entries, bookName(book));
}

// The SCAN's header (`031.log · origin UNIT-031 · 6 entries · 1 found`). `count`: the book's entries (bookShape's).
export function bookScanLine(book: LogBook, count: number, found: number): string {
  return LOG_TEXT.scan(found, bookName(book), bookUnit(book), count);
}

// The PACKET chip's lock (`LOCKED · 031 ASKED YOU TO CARRY IT`).
export function bookPacketLock(book: LogBook): string {
  return book.kind === '046' ? LOG_TEXT.packetLock : BOOK_TEXT.packetLock(book.unit);
}

// At load: every stranger has its 6 entries and a KEY column for each; every book's lines fit (at most 3 lines of at most
// MAX_LINE_CHARS, the root entries also with their `> `), at the worst case.
(function validateBooks(): void {
  const vars: LogVars = { charge: 999 };
  const fits = (what: string, lines: readonly string[], root: boolean): void => {
    if (lines.length === 0 || lines.length > 3) throw new Error(`log-books: ${what} has ${lines.length} lines (1 to 3)`);
    const long = [...lines, ...(root ? lines.map((line) => LOG_TEXT.rootLine(line)) : [])].find((line) => line.length > MAX_LINE_CHARS);
    if (long !== undefined) throw new Error(`log-books: ${what} has a line over ${MAX_LINE_CHARS} chars: ${long}`);
  };
  for (const unit of STRANGER_UNITS) {
    const log = strangerLog(unit);
    if (log.length !== STRANGER_KEYS.length) throw new Error(`log-books: UNIT-${digits(unit)}'s log has ${log.length} entries, not ${STRANGER_KEYS.length}`);
    log.forEach((entry, i) => fits(`${digits(unit)}.log entry ${i + 1}`, entry(vars), i === log.length - 1));
  }
  const ship = 'W'.repeat(NAME_MAX_CHARS);
  fits('047.log 01', LAST_LOG_TEXT.welcome(999, vars.charge), false);
  for (const [kind, template] of Object.entries(LAST_LOG_TEXT.events)) fits(`047.log's ${kind}`, template(ship, 9999), false);
  if (LAST_LOG_TEXT.fillers.length !== NOTABLE_EVENTS_MAX) throw new Error(`log-books: ${LAST_LOG_TEXT.fillers.length} fillers for ${NOTABLE_EVENTS_MAX} events`);
  LAST_LOG_TEXT.fillers.forEach((filler, i) => fits(`047.log's filler ${i + 1}`, filler(), false));
  for (const [fate, tail] of Object.entries(LAST_LOG_TEXT.tails)) fits(`047.log's ${fate} tail`, tail(), false);
  fits('047.log 07', LAST_LOG_TEXT.root(999), true);
  if (LAST_KEYS.length !== 2 + NOTABLE_EVENTS_MAX + 1) throw new Error(`log-books: 047.log keys ${LAST_KEYS.length} entries`);
})();
