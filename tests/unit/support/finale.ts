// Slice 7a (docs/phase3/impl/slice-7-plan.md R5, §2.4): the FINALE for the suites. The lead owns this file; Track FINALE may
// extend it. Every suite that ends a final ship goes through here, so the FINALE's two steps (ENDINGS_BUILT.twoStep) move
// one helper, not twenty suites.
// • chooseEnding(store, hollow, you = 'reassignment', opts): the ending, as the card makes it: step 1's pick, then step 2's
//   (STAY's ship when given). With the two steps down it is WP11's one step (systems/finale.ts chooseFinale: PURGE or MERGE,
//   REASSIGNMENT). With them up the verdict is skipped once typed (skipFinaleEnding), and from 7b THE LAST LANDING too. It
//   returns the refusal (nothing changes then), as chooseFinale did: the card's step 1 must be up (the root fell and the
//   landing settled: settleFinale, or `opts.step` to let this settle it).
// • settleFinale(store, step): the root fell and HOLLOW sleeps ('asleep'): the landing is ended (END LANDING, or as the
//   landing ends itself) and the world stepped (`step`, the suite's own clock) until step 1 is up. A no-op once it is (with
//   the two steps down it comes with the root's fall).
// • finaleAtStep1(state): the card's step 1 is up after the root fell (WP11's 'choice').
// • decidedAs(state): the FINALE's step 1 once decided ('done'), else null (WP11's 'purged' / 'merged' / 'unresolved').
// • decideFinale(finale, hollow, you) / openFinaleStep1(finale): a hand-built FINALE (a draft's hollow.finale) decided, or at
//   step 1 after the root fell, as the suites that construct one used to set WP11's 'purged' or 'choice'.
// • withEndings(gates, fn): `fn` runs with data/endings.ts ENDINGS_BUILT set as given, put back after (the dry run's and the
//   tracks' suites before they raise their gates).
import type { Store } from '@state/store';
import type { GameState, FinaleState } from '@state/schema';
import type { HollowChoice, HollowFate, YouChoice } from '@/types/ending';
import { chooseFinale, pickStep1, pickStep2, pickStay, skipFinaleEnding } from '@systems/finale';
import { endLanding } from '@systems/landing';
import { ENDINGS_BUILT } from '@data/endings';

export interface EndingGates {
  twoStep: boolean;
  night: boolean;
  contact: boolean;
}

export function withEndings<T>(set: Readonly<Partial<EndingGates>>, fn: () => T): T {
  const gates = ENDINGS_BUILT as EndingGates;
  const before: EndingGates = { ...gates };
  Object.assign(gates, set);
  try {
    return fn();
  } finally {
    Object.assign(gates, before);
  }
}

export function finaleAtStep1(state: Readonly<GameState>): boolean {
  return state.hollow.finale.phase === 'step1' && state.hollow.finale.rootFell;
}

export function decidedAs(state: Readonly<GameState>): HollowFate | null {
  const finale = state.hollow.finale;
  return finale.phase === 'done' ? finale.hollow : null;
}

export function decideFinale(finale: FinaleState, hollow: HollowFate, you: YouChoice = 'reassignment'): void {
  finale.phase = 'done';
  finale.rootFell = hollow !== 'followed';
  finale.hollow = hollow;
  finale.you = you;
}

export function openFinaleStep1(finale: FinaleState): void {
  finale.phase = 'step1';
  finale.rootFell = true;
}

// How many steps settleFinale takes at most before it throws (a FINALE that never opens is a bug, said loudly).
const SETTLE_MAX_STEPS = 100_000;

export function settleFinale(store: Store<GameState>, step: () => void): void {
  for (let i = 0; i < SETTLE_MAX_STEPS; i++) {
    const state = store.getState();
    if (state.hollow.finale.phase !== 'asleep') return;
    if (state.landing.ended === null) endLanding(store);
    step();
  }
  throw new Error(`settleFinale: the FINALE did not open in ${SETTLE_MAX_STEPS} steps`);
}

export function chooseEnding(
  store: Store<GameState>, hollow: HollowChoice, you: YouChoice = 'reassignment', opts: { stay?: number; step?: () => void } = {},
): string | null {
  if (opts.step !== undefined) settleFinale(store, opts.step);
  if (!ENDINGS_BUILT.twoStep) {
    if (hollow === 'spare' || you !== 'reassignment' || opts.stay !== undefined) {
      throw new Error(`chooseEnding: ${hollow} + ${you} needs the two steps (ENDINGS_BUILT.twoStep)`);
    }
    return chooseFinale(store, hollow);
  }
  const first = pickStep1(store, hollow);
  if (first !== null) return first;
  const second = opts.stay === undefined ? pickStep2(store, you) : pickStay(store, opts.stay);
  if (second !== null) return second;
  skipFinaleEnding(store);
  return null;
}
