// Slice 5: the lead owns this file (docs/phase3/impl/slice-5-plan.md §5). The words every resident kind shares: the boot's
// `RECEIVER CLOSED` line (04 §3.15), the rack-A files' names, and what they say before a SCAN (plan §3: after a SCAN the
// kinds' own words take over, data/warden-text.ts and data/kin-text.ts). Every line ≤ MAX_LINE_CHARS at its worst case
// (the longest resident name is 7 letters: STEWARD, LOOKOUT, BARNABY); tests/unit/residents/foundation.test.ts checks them.

export const RESIDENT_TEXT = {
  // 04 §3.15: typed on every resident ship's boot, any kind, after the sleep line (02 §4's order 3), in amber (tone
  // 'resident'): on an `unknown` card it is a hint, not a spoiler (plan R9).
  receiverClosed: '> RECEIVER CLOSED · this ship launched with its own AI',
  // The files' names (04 §3.12–§3.14). A resident's own file is named after it.
  file: {
    resident: (name: string): string => `${name}.sys`,
    sleeper: (name: string): string => `${name}.sys`,
    wall: (name: string): string => `${name}.wall`,
    sleepLock: 'sleep.lock',
    note: 'farewell.txt',
    leftover: 'LEFT BEHIND',
  },
  // INSPECT's type line (data/type-labels.ts TYPE_LABELS): the ship's own files, so the line gives no kind away (a sleeper
  // reads as any backup).
  typeLabel: {
    resident: 'Ship System · Onboard AI',
    sleeper: 'Ship System · Backup',
    'sleep-lock': 'Ship System · Lock file',
    note: 'Ship System · Text file',
    leftover: 'Ship System · Left behind',
  },
  // What INSPECT says before a SCAN (04 §3.12: a corrupted resident's card said faulty, a surprise's said nothing; 04 §3.14:
  // the sleeper looks like any inactive backup; 04 §3.13: `LEFT BEHIND · scan me`).
  desc: {
    faulty: 'The ship\'s own AI. Reported faulty.',
    surprise: 'The ship\'s own AI.',
    sleeper: 'Inactive. A backup the ship\'s builders left.',
    sleepLock: 'A lock file.',
    note: 'A note. SCAN reads it.',
    leftover: 'scan me',
  },
} as const;

// The tools' refusals on residents' files (04 §3.12–§3.14; plan §2.10). They join data/tool-text.ts TOOL_REFUSAL, so each
// track's tool rule returns a ToolRefusal with no edit outside its own files. A departed resident's leftovers refuse DELETE
// and COPY with the log's own words (TOOL_REFUSAL.logDelete: `IT ISN'T YOURS TO DELETE`).
export const RESIDENT_REFUSAL = {
  // A `reported faulty` resident before its SCAN (plan R25; the late surprise's first burst scans it).
  scanFirst: 'SCAN IT FIRST',
  residentMove: 'IT WON\'T BE MOVED',
  residentCopy: 'ONE OF IT IS ENOUGH',
  // DELETE on the sleeper (04 §3.14): the hint is the way in.
  sleeperAsleep: 'IT\'S ASLEEP. SOMETHING IS HOLDING IT: sleep.lock',
} as const;

// MOVE on `sleep.lock` (plan §2.9): `PINNED TO MOTH.sys`, named after its sleeper (names are rolled: plan R17).
export type PinnedRefusal = `PINNED TO ${string}.sys`;

export function pinnedRefusal(sleeper: string): PinnedRefusal {
  return `PINNED TO ${sleeper}.sys`;
}
