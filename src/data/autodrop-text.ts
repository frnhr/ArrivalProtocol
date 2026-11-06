// Slice 4c–4e: Track DROP owns this file (docs/phase3/impl/slice-4cde-plan.md §2.1, §7.2): every AUTODROP string (the
// strip, the POD BAY, the radio, the echo, the Skills row). The FOUNDATION seeded the once-only lessons with the plan's
// words (§3.7); DROP rewords freely and adds the rest. Every line is ≤ MAX_LINE_CHARS (70) at its worst case
// (tests/unit/support/words).

export const AUTODROP_TEXT = {
  // The once-only lessons (data/script.ts SKILL_4CDE_RULES; their conditions are autodrop.ts autodropTutorialDue's).
  tutorial: {
    v1: 'HOLD [L] — AUTODROP waits for the centre',
    v2: 'AUTODROP v2 — set the split in the POD BAY, then [G]',
    v3: 'AUTODROP v3 — [G] flies the whole plan',
  },
} as const;
