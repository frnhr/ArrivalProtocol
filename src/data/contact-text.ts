// Slice 7d: CONTACT's words (docs/phase3/impl/slice-7-plan.md §2.9, R41; 05-story §3.7, §3.8, §3.12). Its trace's words:
// the signal stop's card row and boot line, and its `NEXT RUN:` body. The FINALE's command, meaning and need are
// data/finale-text.ts's (7a's, already written), the price line too (FINALE_TEXT.price.signals, 7d), and its epilogue piece
// and titles data/epilogue-text.ts's (its marked CONTACT block). Data only; every line ≤ 70 characters at its worst case
// (support/words.test.ts's 7d block).

export const CONTACT_TEXT = {
  // The signal stop's SHIP CARD row (R38's TRACE row; systems/trace-hud.ts traceCardRow): waiting, then found.
  stopHere: '▓▓░▓ · A SIGNAL STOP',
  // The boot's gift line at a signal stop (systems/trace-gifts.ts arrivalTraceLines): its charge, and its file in rack A.
  stopLine: (charge: number): string => `> A SIGNAL STOP · +${charge} REPAIR CHARGE · ▓▓░▓ IN RACK A`,
  // The FINALE card's and the final card's `NEXT RUN:` body (05 §3.12's style): the gain, then the wild seed's cost.
  nextGain: (stops: number): string => `+ ${stops} signal stops on the map`,
} as const;
