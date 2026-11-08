// Slice 7a: Track NIGHT owns this file (docs/phase3/impl/slice-7-plan.md §2.9, §4.1; R19–R23): the night's words, seeded by
// the FOUNDATION with the plan's and 05 §3.12's samples. NIGHT fills PAYOFF_OF (one payoff per souls.ts LINE_POOL line, with
// its load check), the pieces, the titles (a Record over data/endings.ts EndingTitleKey) and the final card's rows, and
// moves the bridging line here from MAP_TEXT.runEnd.bridge. Data and types only (support/import-guard): souls.ts is a data
// leaf. Every line is at most 70 characters at its worst case (support/words.test.ts's 7a NIGHT block).
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
