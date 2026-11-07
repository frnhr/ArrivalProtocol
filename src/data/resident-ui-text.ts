// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): the SHIP CARD's RESIDENT row and its
// after-the-ship words, the LANDING REPORT's resident rows, the PACKET's leftover deck look, the `SIGNAL · n/3` stamp and the
// glossary's RESIDENT and LOCKED POD. The FOUNDATION left it empty. Every line ≤ MAX_LINE_CHARS (70) at its worst case.
// Data only: no system imports, so the words never close an import cycle.

export const RESIDENT_UI_TEXT = {} as const;
