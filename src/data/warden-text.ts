// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): every corrupted resident's word (its
// looping lines, the locks, the DEAL, DELETE and the cure, the goodnight, INSPECT after a SCAN, CONTROL's two lines, the
// alarm, counter and pip words, the stamps, the strip's three lines). The FOUNDATION seeded only the first lines with the
// plan's words; WARDEN rewords freely and adds the rest. Every line ≤ MAX_LINE_CHARS (70) at its worst case (the longest
// resident name 7 letters, the longest ship name 10). Data only: no system imports, so the words never close an import
// cycle; callers pass the names in.

export const WARDEN_TEXT = {
  // Its first line, at the wake (plan R9): a faulty ship's, and the late surprise's (with the stamp).
  wake: (name: string): string => `${name}: THIS SHIP DID NOT ASK FOR A CARETAKER.`,
  surprise: (name: string): string => `${name}: NOBODY REPORTED ME. GOOD.`,
} as const;
