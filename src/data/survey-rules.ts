// Slice 6: Track SWATH owns this file (docs/phase3/impl/slice-6-plan.md §2.1, R22, §6.2): the strip's one SURVEY row,
// `survey-swap` (`LZ-B IS WET ✕ — SITES: SET SITE 4 AS LZ-B`, priority 'hint', layer 'ship'), shown only when SURVEY knows a
// better place: a known-bad LZ with no pod down, a FLAT found site with ROOM free (survey-model.ts bestSwap), and no window
// open. data/script.ts spreads SURVEY_RULES into GUIDE_RULES right after DROP_LESSON_RULES (the FOUNDATION's one line
// there), so SWATH never edits script.ts. Finds, waits and pauses never go on the strip (01 §3.2: "a choice, not a chore").
// Others ask by message.
// A template is rendered by the tests with no state (TextCtx only: the corpus and the words checks); then it says its worst
// case (`LZ-D IS ROCKY ✕ — SITES: SET SITE 12 AS LZ-D`).
import type { GameState } from '@state/schema';
import type { DirectorCtx, GuideRule, TextCtx } from '@systems/director';
import type { BadGround } from '@/types/survey';
import { isLivePhase } from '@systems/clock';
import { surveySwap } from '@systems/survey-model';
import { siteLabel } from '@data/survey-text';
import { SWATH_TEXT } from '@data/swath-text';

const WORST = { lz: 'LZ-D', ground: 'rocky' as BadGround, site: 'SITE 12' };

function stateOf(ctx: TextCtx): Readonly<GameState> | null {
  return (ctx as Partial<DirectorCtx>).state ?? null;
}

// The swap's words for the state, or the worst case with none.
function swapWords(state: Readonly<GameState> | null): { lz: string; ground: BadGround; site: string } {
  const swap = state === null ? null : surveySwap(state);
  if (swap === null) return WORST;
  const lz = state!.landing.lzs.find((one) => one.label === swap.lz)!;
  return { lz: swap.lz, ground: lz.ground as BadGround, site: siteLabel(swap.site) };
}

function swapLive(ctx: DirectorCtx): boolean {
  const state = ctx.state;
  return isLivePhase(state) && state.landing.ended === null && surveySwap(state) !== null;
}

export const SURVEY_RULES: readonly GuideRule[] = [
  {
    id: 'survey-swap',
    layer: 'ship',
    priority: 'hint',
    activeWhen: swapLive,
    text: (ctx) => { const words = swapWords(stateOf(ctx)); return SWATH_TEXT.strip.swap(words.lz, words.ground, words.site); },
  },
];
