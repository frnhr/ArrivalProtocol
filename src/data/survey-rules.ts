// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.1, R22, §6.2): the strip's one SURVEY row,
// `survey-swap` (`LZ-B IS WET ✕ — SITES: SET SITE 4 AS LZ-B`, priority 'hint', layer 'ship'), shown only when SURVEY knows a
// better place: a known-bad LZ with no pod down, a FLAT found site with ROOM free (survey-model.ts bestSwap), and no window
// open. data/script.ts spreads SURVEY_RULES into GUIDE_RULES right after DROP_LESSON_RULES (the FOUNDATION's one line
// there), so SWATH never edits script.ts. Finds, waits and pauses never go on the strip (01 §3.2: "a choice, not a chore").
// Others ask by message.
import type { GuideRule } from '@systems/director';

export const SURVEY_RULES: readonly GuideRule[] = [];
