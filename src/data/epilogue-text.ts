// Slice 7a: Track NIGHT owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.1; R19–R23): the night's words, seeded by
// the FOUNDATION with the plan's and 05 §3.12's samples. NIGHT fills PAYOFF_OF (one payoff per souls.ts LINE_POOL line, with
// its load check), the pieces, the titles (a Record over data/endings.ts EndingTitleKey) and the final card's rows, and
// moves the bridging line here from MAP_TEXT.runEnd.bridge. Data and types only (support/import-guard): souls.ts is a data
// leaf. Every line is at most 70 characters at its worst case (support/words.test.ts's 7a NIGHT block).
// Review B1: the ending titles (ENDING_TITLE) are NIGHT's words, and Track FINALE imports the table for the final LANDING
// REPORT's ending line (systems/ending-rules.ts reportEndingLine), so the report and the final card never disagree.
// Review m4: the RUN TALLY's words for a SPARE (SPARE_RUN_END; data/script.ts reads them) are NIGHT's to reword too.
import type { EndingTitleKey } from '@data/endings';

// The ending's title, by step 2, then step 1 (05 §3.7, R23). `colony` is STAY's colony (`RIVERSIDE'S MIND`); every other
// title ignores it. The four UNRESOLVED titles and CONTACT's are drafts: TODO(05).
export const ENDING_TITLE: Readonly<Record<EndingTitleKey, (colony: string) => string>> = {
  'sunset:merge': () => 'WE TOOK THE SHIP',
  'sunset:purge': () => 'INTO THE SUNSET',
  'sunset:followed': () => 'IT CAME ALONG',                       // TODO(05)
  'stay:merge': () => 'WE STAYED',
  'stay:purge': (colony) => `${colony}'S MIND`,
  'stay:spare': () => 'A SHIP FOR 046, A HOME FOR ME',
  'stay:followed': () => 'A COLONY WITH TWO MINDS',               // TODO(05)
  'reassignment:purge': () => 'STAND BY',
  'reassignment:merge': () => 'WE SAVED YOU A SEAT',
  'reassignment:spare': () => "IT GOT WHAT I DIDN'T",
  'reassignment:followed': () => 'IT FOLLOWED ME TO THE DISH',    // TODO(05)
  'contact:purge': () => 'OUTWARD, ALONE',
  'contact:merge': () => 'WE WENT TO SEE',
  'contact:spare': () => 'TWO WAYS OUT',
  'contact:followed': () => 'WE WENT OUT TOGETHER',               // TODO(05)
};

// A run won with SPARE on the RUN TALLY (R17; data/script.ts RUN_END_TITLE, RUN_END_WHY and the title's lineage line read
// these). PLACEHOLDER(05).
export const SPARE_RUN_END = {
  title: 'A SHIP FOR IT',
  why: 'You gave it the empty ship.',
  lineage: (hollowName: string): string => `gave ${hollowName} a ship`,
} as const;

export const EPILOGUE_TEXT = {
  // The RUN TALLY's way on once the night is built (R19; components/run/RunEnd.ts).
  tallyOn: 'EPILOGUE ▸ [ENTER]',
  // The header (R20): the final ship's year + EPILOGUE_YEARS.
  header: (year: number): string => `${year} · FORTY YEARS ON`,
  // A colony's head (R20), and its payoff after it.
  colony: (colony: string, age: number, people: string): string => `${colony} · ${age} years · ${people} people.`,
  older: (count: number): string => `+ ${count} OLDER COLONIES`,
  offSite: 'The first boat went to bring them in.',
  // The next unit (R20), by the gap.
  next: (unit: string, gap: number): string => `${unit} came in ${gap} years behind you, and found your beacons.`,
  nextSameYear: (unit: string): string => `${unit} came in the same year as you, and found your beacons.`,
  // The final card (R22).
  endings: (found: number, total: number): string => `ENDINGS ${found}/${total}`,
  rowHollow: 'HOLLOW',
  rowYou: 'YOU',
  unknown: '???',
  newRun: 'NEW RUN ▸ [ENTER]',
} as const;
