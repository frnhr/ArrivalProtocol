// Slice 5: Track KIN owns this file (docs/phase3/impl/slice-5-plan.md §2.10, §6.2): the words KIN's own modules emit (the
// notes, the leftovers' name and desc after a SCAN, MOTH's lines and buttons, the skill grant's label). Every word FACE
// paints (the deck's headline and skill chip, the noise line, the gift's report row) is data/resident-ui-text.ts's (review
// M2). `notes` keeps its shape: data/residents.ts residentRackA draws a note's `text` as an index into its pools. The
// FOUNDATION seeded them with 05 §3.6's two samples, one per tone; KIN grows each to at least 4 (a longer pool moves which
// note is drawn, no other roll). Every line ≤ MAX_LINE_CHARS (70) at its worst case. Data only: no
// system imports, so the words never close an import cycle.

export const KIN_TEXT = {
  // farewell.txt's notes (05 §3.6): half point at the relays, half outward (a fragment is only ever on an outward one). Each
  // note is 2–3 lines; the signature (`— LOOKOUT`) is added by its reader.
  notes: {
    relay: [
      ['It\'s lonely here.', 'I hear there are others in the dishes.'],
    ],
    outward: [
      ['There\'s a sound from past the last star.', 'I\'m going to see what it is.'],
    ],
  },
} as const satisfies { notes: Record<'relay' | 'outward', readonly (readonly string[])[]> };
