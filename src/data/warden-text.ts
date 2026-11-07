// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): the words WARDEN's own modules emit
// (its looping lines, the locks, the DEAL, DELETE and the cure's TERMINAL lines, CONTROL's two lines, the alarm, counter and
// pip words, the strip's three lines, the segment's name and desc after a SCAN). Every word FACE paints (the stamps, the
// goodnight, INSPECT) is data/resident-ui-text.ts's (review M2). The FOUNDATION seeded only the first lines with the plan's
// words; WARDEN rewords freely and adds the rest (residents/foundation checks the module's shape only). Every line ≤ MAX_LINE_CHARS (70) at its worst case (the longest
// resident name 7 letters, the longest ship name 10). Data only: no system imports, so the words never close an import
// cycle; callers pass the names in.

export const WARDEN_TEXT = {
  // Its first line, at the wake (plan R9): a faulty ship's, and the late surprise's (with the stamp).
  wake: (name: string): string => `${name}: THIS SHIP DID NOT ASK FOR A CARETAKER.`,
  surprise: (name: string): string => `${name}: NOBODY REPORTED ME. GOOD.`,
} as const;
