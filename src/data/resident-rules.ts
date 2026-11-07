// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §6.2): the strip's corrupted-resident lines
// (`THE SHIP'S AI IS FIRING THE ENGINE — find it in RACK A`, `BLOCK THE LOCK — SCAN pod 07 (3…)`, `POD 07 LOCKED —
// DELETE or REPAIR WARDEN.sys`). data/script.ts spreads RESIDENT_RULES into GUIDE_RULES right before GHOST_ALARM_RULES
// (the FOUNDATION's one line there), so a resident's line sits where the engine's alarm lines do and WARDEN never edits
// script.ts. The strip never names a sleeper or a departed resident's files (plan R21). Others ask by message.
import type { GuideRule } from '@systems/director';

// FOUNDATION stub: no rule yet.
export const RESIDENT_RULES: readonly GuideRule[] = [];
