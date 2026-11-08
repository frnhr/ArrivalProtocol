// Slice 7a: the lead owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §4.1). 7d's CONTACT raises
// ENDINGS_BUILT.contact (one line). Others ask by message. Data and types only (support/import-guard): no system imports this file's readers' state.
import type { HollowChoice, HollowFate, YouChoice, EndingPiece } from '@/types/ending';

// What this build plays of slice 7's endings (R11): contact (7d), CONTACT's row on the FINALE card and its piece in the
// count (absent until raised). The 7a fix pass dropped the twoStep and night gates (raised for good by Tracks FINALE and
// NIGHT) with the WP11 one-step and gate-down paths they switched (review (e)).
export const ENDINGS_BUILT: Readonly<{ contact: boolean }> = {
  // 7d's CONTACT raises this line.
  contact: false,
};

// Every ending piece, in the final card's order (R22): the HOLLOW row, then the YOU row.
export const ENDING_PIECES: readonly EndingPiece[] = ['purge', 'merge', 'spare', 'sunset', 'stay', 'reassignment', 'contact'];
export const HOLLOW_PIECES: readonly HollowChoice[] = ['purge', 'merge', 'spare'];
export const YOU_PIECES: readonly YouChoice[] = ['sunset', 'stay', 'reassignment', 'contact'];

// A piece this build can reach (R22: only built pieces count in `ENDINGS n/6`, n/7 once CONTACT is built).
export function pieceBuilt(piece: EndingPiece): boolean {
  return piece !== 'contact' || ENDINGS_BUILT.contact;
}

export function builtPieces(): EndingPiece[] {
  return ENDING_PIECES.filter(pieceBuilt);
}

// What an option costs (05 §3.7; the card's price meter or need line, systems/ending-rules.ts optionState):
// • none: always open (PURGE, REASSIGNMENT);
// • charge: MERGE_COST_CHARGE REPAIR CHARGE, kept through the duel and spent at the confirm;
// • empty-ship: THE EMPTY SHIP (R8: in orbit after its landing, no pod aboard, FUEL ≥ EMPTY_SHIP_FUEL_PCT);
// • on-target: a ship of this run ★ ON TARGET (R9; STAY's pick);
// • signals: SIGNALS_FOR_CONTACT fragments (7d).
export type PriceKind = 'none' | 'charge' | 'empty-ship' | 'on-target' | 'signals';

// One row of a FINALE step: its key cap (the card's [1]–[4]), its piece, its price, and the step-2 piece it rules out
// (SPARE gives the ship to the root: `SPARE GIVES IT THE SHIP` greys SUNSET, R8). The next run's trace is the piece's own (7c's
// TraceKind is the piece; 'followed' leaves none).
export interface EndingOption<P extends EndingPiece> {
  key: 1 | 2 | 3 | 4;
  piece: P;
  price: PriceKind;
  rulesOut: YouChoice | null;
}

export const STEP1_OPTIONS: readonly EndingOption<HollowChoice>[] = [
  { key: 1, piece: 'purge', price: 'none', rulesOut: null },
  { key: 2, piece: 'merge', price: 'charge', rulesOut: null },
  { key: 3, piece: 'spare', price: 'empty-ship', rulesOut: 'sunset' },
];

export const STEP2_OPTIONS: readonly EndingOption<YouChoice>[] = [
  { key: 1, piece: 'sunset', price: 'empty-ship', rulesOut: null },
  { key: 2, piece: 'stay', price: 'on-target', rulesOut: null },
  { key: 3, piece: 'reassignment', price: 'none', rulesOut: null },
  { key: 4, piece: 'contact', price: 'signals', rulesOut: null },
];

// The step-2 rows this build shows (R11: CONTACT's row is absent until its gate is raised).
export function step2Options(): EndingOption<YouChoice>[] {
  return STEP2_OPTIONS.filter((option) => pieceBuilt(option.piece));
}

// The ending's title is keyed by step 2, then step 1 (05 §3.7, R23): `sunset:merge` is WE TOOK THE SHIP. The words are
// data/epilogue-text.ts's (Track NIGHT), a Record over every key, so a missing title fails to compile. SPARE + SUNSET can't
// be chosen (R8) and has no title.
export type EndingTitleKey = Exclude<`${YouChoice}:${HollowFate}`, 'sunset:spare'>;

export function endingTitleKey(you: YouChoice, hollow: HollowFate): EndingTitleKey {
  if (you === 'sunset' && hollow === 'spare') throw new Error('endingTitleKey: SPARE rules out SUNSET (R8)');
  return `${you}:${hollow}` as EndingTitleKey;
}

// CONTROL's one rule on an ending (7a review M2; 05 §3.8, R33): the unit is non-compliant exactly when it chose SPARE, SUNSET,
// STAY or CONTACT (nobody stood by at the end, or the root was given a ship); everything else is compliant, so MERGE +
// REASSIGNMENT and UNRESOLVED + REASSIGNMENT are. The FINALE's verdict, the epilogue's last line and 7c's wild seed
// (systems/traces.ts traceKindsOf) read this, never their own copy (systems/ending-rules.ts re-exports it). Slice 7c moved it
// here from ending-rules.ts: a rule on two choices, read by the pure trace rules.
export function controlCompliant(hollow: HollowFate, you: YouChoice): boolean {
  return hollow !== 'spare' && you !== 'sunset' && you !== 'stay' && you !== 'contact';
}
