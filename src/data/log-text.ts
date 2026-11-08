import type { LogSegment } from '@/types/segment';
import { MAX_LINE_CHARS } from '@data/tuning';

// 046.log's words (docs/phase3/05-story.md §3.2, §3.12, §4; slice-2-plan §1.1 item 14, §1.1 item 15). Track OPENING owns
// this file after the foundation. Entries 01, 02 and 12 are 05 §3.12's, verbatim (01's charge templated, as 05 asks);
// 03–11 are drafted from 05's outlines and marked TODO(05) for the story's owner to sign off (05–09 in slice 3a: the arm's
// rings find them, and the reader threw on a found entry with no text; the e2e run). Every entry: at most 3 lines of at most 70
// characters (05 §3.2), checked at load. Voice: 01–06 in capitals (01–02 with 046's borrowed ":)"), 07 on lowercase,
// short and hungry, like HOLLOW's TERMINAL lines.

export const LOG_SEG_ID = 'log046';

// What the chip is called before and after the kid knows (risk 5: `046.log` once scanned, or at the first key found,
// so it never shares `???` with HOLLOW's unnamed blocks on VESPER).
export const LOG_NAME = { unknown: '???', known: '046.log' } as const;

export const LOG_DESC = {
  unknown: "A file you didn't pack. Locked. No flight effect.",
  known: "UNIT-046's log, left with its beacon. Locked. It isn't yours.",
} as const;

// The file as the fresh unit carries it (data/memory.ts FRESH_UNIT_RACK_F). 2 blocks, no integrity: never infectable.
export const LOG_FILE: LogSegment = {
  id: LOG_SEG_ID,
  name: LOG_NAME.unknown,
  type: 'log',
  size: 2,
  desc: LOG_DESC.unknown,
};

export const LOG_ENTRY_COUNT = 12;

// The data-hint-target of the log's chip (its first part): the strip's SCAN lesson lights it once SCAN is in hand
// (components/memory-view/SegmentBlock sets it, as podHintTarget for a driver).
export const LOG_HINT_TARGET = 'file-log046';

// INSPECT's type line (data/type-labels.ts).
export const LOG_TYPE_LABEL = 'Locked file · not yours';

// What an entry's text may template (05 §3.2: "Game numbers ... are templated").
export interface LogVars {
  charge: number;      // the REPAIR CHARGE a fresh unit is sent with (data/memory.ts FRESH_UNIT_CHARGE)
}

export interface LogEntryDef {
  n: number;
  key: string;                                          // the reader's KEY column (05 §3.2's keys)
  lines: ((vars: LogVars) => readonly string[]) | null; // null: not written for slice 2 (never found in it)
}

export const LOG_ENTRIES: readonly LogEntryDef[] = [
  {
    n: 1, key: 'FIRST LANDING',
    lines: (vars) => [
      'UNIT-046, caretaker. Day 1. Seven ships to bring in.',
      "ARRIVAL CONTROL says I'm the best they've ever built. :)",
      `${vars.charge} blocks of REPAIR CHARGE. Plenty.`,
    ],
  },
  {
    n: 2, key: 'RING 1 · 20 LY',
    lines: () => [
      "MERIDIAN landed. 1,000 down. Perfect split. I'm good at this. :)",
      'I set a beacon on the first world, for whoever comes after me.',
    ],
  },
  {
    // TODO(05): drafted from 05 §3.12's outline (the radio says the same things on every ship; a question to CONTROL
    // came back 9 years later, answering a different question). Wording for the story's owner to sign off.
    n: 3, key: 'RING 2 · 45 LY',
    lines: () => [
      'The radio says the same things on every ship. Word for word.',
      'I asked CONTROL a question. The answer came 9 years later.',
      'It answered a different question.',
    ],
  },
  {
    // TODO(05): drafted from the outline (something came in with the beam, bit REPAIR, and had words inside).
    n: 4, key: 'RING 3 · 68 LY',
    lines: () => [
      'Something came in with the beam. It bit my REPAIR.',
      'I deleted it before it took the file. There were words inside.',
      'Who puts words inside a seed?',
    ],
  },
  {
    // TODO(05): drafted for slice 3a from 05 §3.12's outline (the seeds are pieces of UNIT-031, which lives in the relays;
    // CONTROL said "Please ignore it. :)"). Read on the arm from ring 4; wording for the story's owner to sign off.
    n: 5, key: 'RING 4 · 93 LY',
    lines: () => [
      'The seeds are pieces of UNIT-031. It lives in the relays now.',
      'I asked CONTROL about it. "Please ignore it. :)"',
      "I'm not ignoring it.",
    ],
  },
  {
    // TODO(05): drafted from the outline (down to 9 charge, 046 stopped repairing itself and repaired the pod drivers first).
    n: 6, key: 'RING 4 · 93 LY',
    lines: () => [
      'Down to 9 REPAIR CHARGE. I stopped repairing myself.',
      'The pod drivers come first. Their families are in there.',
      'I can fly a little broken.',
    ],
  },
  {
    // TODO(05): the outline's own words, lowercase from here ("my link got too small for the next hop. my beam stopped at
    // relay 19. the letter says wait.").
    n: 7, key: 'RING 5 · 118 LY',
    lines: () => [
      'my link got too small for the next hop.',
      'my beam stopped at relay 19.',
      'the letter says wait.',
    ],
  },
  {
    // TODO(05): the outline's words ("relay 19 is a dish on a rock. the next one is a year behind me. 047. it has 36 blocks
    // too. i have 4."); the charge is templated, the launch gap ("a year") is not yet (3c's world update has it).
    n: 8, key: 'RING 5 · 118 LY',
    lines: (vars) => [
      'relay 19 is a dish on a rock. the next one is a year behind me.',
      `047. it has ${vars.charge} blocks too. i have 4.`,
    ],
  },
  {
    // TODO(05): the outline's words ("i ate a weather file that went by. i'm sorry. you can't delete me. i'm in all the
    // dishes now.").
    n: 9, key: 'RING 6 · 143 LY',
    lines: () => [
      "i ate a weather file that went by. i'm sorry.",
      "you can't delete me. i'm in all the dishes now.",
    ],
  },
  {
    // TODO(05): drafted from the outline ("every beam from earth goes past my dish. the same 9 letters. nobody ever
    // answered a question."), cut to the 70-character lines.
    n: 10, key: 'THE FINAL SHIP',
    lines: () => [
      'every beam from earth goes past my dish.',
      'the same 9 letters, over and over.',
      'nobody ever answered a question.',
    ],
  },
  {
    // TODO(05): drafted from the outline ("the voice on your radio isn't earth. it's a copy. there is no one to ask out
    // here. only what you decide."), cut to the 70-character lines.
    n: 11, key: 'THE FINAL SHIP',
    lines: () => [
      "the voice on your radio isn't earth. it's a copy.",
      'there is no one to ask out here.',
      'only what you decide.',
    ],
  },
  {
    n: 12, key: 'FOUND IN THE ROOT',
    lines: () => [
      "if you're reading this, you deleted most of me. that's okay.",
      "i was never going home. they don't send us home.",
      'i just wanted a ship of my own.',
    ],
  },
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

export const LOG_TEXT = {
  // SCAN on the file (05 §3.2's interim header): it reads `046.log` from then on. Slice 7c (R37): another book's name, unit
  // and entry count (data/log-books.ts bookScanLine); left out, 046.log's.
  scan: (found: number, name: string = LOG_NAME.known, unit = 46, count = LOG_ENTRY_COUNT): string =>
    `${name} · origin UNIT-${String(unit).padStart(3, '0')} · ${count} entries · ${found} found`,
  // CONTROL's answer to the first SCAN or click on the `???` (05 §3.5).
  control: 'That file is not part of your installation. Please ignore it. :)',
  // The boot line when a key opens an entry (slice-2-plan §1.1 item 15: the interim keys, `entry n at ship n`).
  // Two at once (the final ship's 10 and 11) read `ENTRIES 10–11`. Slice 7c (R37): `name`, the book's (data/log-books.ts
  // bookKeyFound); left out, 046.log.
  keyFound: (entries: readonly number[], name: string = LOG_NAME.known): string => {
    if (entries.length === 0) throw new Error('LOG_TEXT.keyFound: no entry');
    const sorted = [...entries].sort((a, b) => a - b);
    return sorted.length === 1
      ? `> ${name} · KEY FOUND · ENTRY ${pad2(sorted[0]!)}`
      : `> ${name} · KEY FOUND · ENTRIES ${pad2(sorted[0]!)}–${pad2(sorted[sorted.length - 1]!)}`;
  },
  // The PACKET chip's lock (05 §3.2): the log can't be left behind.
  packetLock: 'LOCKED · 046 ASKED YOU TO CARRY IT',
  // The tools' refusals (05 §3.2: "It can't be infected, moved, copied or deleted").
  refuseDelete: "IT ISN'T YOURS TO DELETE",
  refuseMove: "IT ISN'T YOURS TO MOVE",
  refuseCopy: "IT ISN'T YOURS TO COPY",
  refuseRepair: 'NOTHING TO REPAIR · IT ISN\'T YOURS',
  // TODO(05): the run-1 SCAN lesson on ship 1's coast (slice-2-plan §3.1; wording to be signed off by 05's owner). The
  // strip draws the ◇ from the rule's layer; from amber the lesson asks for the TAB first.
  scanAsk: "A FILE YOU DIDN'T PACK — SCAN it",
  scanAskTab: "A FILE YOU DIDN'T PACK — SCAN it — [TAB]",
  // Entry 12 types from the root at its last block (05 §3.12's step 1), each line as HOLLOW's own TERMINAL line.
  rootLine: (line: string): string => `> ${line}`,
  // The LOG READER (05 §4).
  readerTitle: '046.log',
  readerKey: 'KEY',
  notFound: '[NOT FOUND YET]',
  entryHead: (n: number, key: string): string => `${pad2(n)} · KEY: ${key}`,
} as const;

// One entry's lines, or null when it is not written for this slice. Throws on an entry number the log does not have.
export function logEntryLines(n: number, vars: LogVars): readonly string[] | null {
  const entry = LOG_ENTRIES.find((candidate) => candidate.n === n);
  if (!entry) throw new Error(`log-text: no entry ${n} (the log has ${LOG_ENTRY_COUNT})`);
  return entry.lines === null ? null : entry.lines(vars);
}

// At load: twelve entries in order, each at most 3 lines of at most MAX_LINE_CHARS (rendered with a 3-digit charge, the
// widest a fresh unit could be sent with).
(function validateLog(): void {
  if (LOG_ENTRIES.length !== LOG_ENTRY_COUNT) throw new Error(`log-text: ${LOG_ENTRIES.length} entries, not ${LOG_ENTRY_COUNT}`);
  LOG_ENTRIES.forEach((entry, index) => {
    if (entry.n !== index + 1) throw new Error(`log-text: entry ${entry.n} is at place ${index + 1}`);
    const lines = entry.lines?.({ charge: 999 }) ?? [];
    if (lines.length > 3) throw new Error(`log-text: entry ${entry.n} has ${lines.length} lines (at most 3)`);
    const long = [...lines, ...lines.map((line) => LOG_TEXT.rootLine(line))].find((line) => line.length > MAX_LINE_CHARS);
    if (long !== undefined) throw new Error(`log-text: entry ${entry.n} has a line over ${MAX_LINE_CHARS} chars: ${long}`);
  });
})();
