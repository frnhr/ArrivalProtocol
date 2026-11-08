// Slice 7b: Track DROP owns this file (docs/phase3/impl/slice-7-plan.md §4.2, §5.2). Data only (support/import-guard).
// THE LAST LANDING's gate (01-landing §3.17; R24–R28). While it is down, MERGE plays 7a's interim (R15): the eaten drivers
// come back in place in memory and the landing reopens for the kid's hands (systems/finale.ts mergeIn, verdictDone; the
// card's `NOW:` reads FINALE_TEXT.nowInterim, systems/ending-rules.ts mergeRestorable). Raised, MERGE takes every block of
// HOLLOW in, hands the eaten drivers back by radio (landing.lastLanding, never memory), and systems/last-landing.ts
// startLastLanding flies their pods on their own.
// Track DROP raises this line (one line) once startLastLanding, its controller, its tick and skipLastLanding are built.
export const LAST_LANDING_BUILT: boolean = false;
