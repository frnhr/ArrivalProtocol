import type { GuideRule, DirectorCtx } from '@systems/director';
import { beamSeedsInMemory } from '@state/threat-selectors';
import { hasUsableTool } from '@state/selectors';
import { SEED_HINT_TARGET, TOOL_HINT_TARGET, toolStepTarget } from '@data/fs-tools';
import { THREAT_TEXT } from '@data/threat-text';
import { SEED_LESSON_SHOW_SEC, BEAM_SEED_NO_RM_AFTER_SEC } from '@data/tuning';

// The strip's rules for the threat ladder (docs/phase3/04-threats.md §3.3, §3.5; slice-2-plan §2.1, §5.1): the beam
// seeds' `RM THE SEED` lesson and its no-rm line. Track THREAT owns this file; data/script.ts spreads THREAT_RULES into
// GUIDE_RULES right before SEED_RULES (a beam seed's line sits where phase 2's seed lines do: after HOLLOW's eating
// lines, before the WALL and COPY lessons), so THREAT never edits script.ts.
// • The RM lesson for beam seeds is two more wordings of phase 2's 'seed-first' lesson (script.ts SEED_RULES: the same
//   priority, once and maxShownSec, so script.ts's lesson check holds): a lesson's wordings share one completion, and
//   phase 2's wordings call it done when a seed HOLLOW dropped is gone (HollowState.seedsLanded), which a beam seed never
//   counts in. These call it done when the beam's seeds are gone from memory, so the run's first RM lesson (KESTREL's) is
//   done for HOLLOW's own seeds later too. Phase 2's repeating `RM THE SEED` (any seed that can bite) needs nothing new.
// • The seeds-only alert (`SEED NEXT TO TELEMETRY`, holding SKIP) is systems/hollow.ts's (syncAlerts), not a strip rule.
// • The last-rm stamp is Track UI's, on 'last-rm-lost'; its echo is systems/hollow.ts's.

function live(ctx: DirectorCtx): boolean {
  return ctx.phase === 'flight' || ctx.phase === 'landing';
}

function inAmber(ctx: DirectorCtx): boolean {
  return ctx.mode === 'tools';
}

function beamSeedAboard(ctx: DirectorCtx): boolean {
  return beamSeedsInMemory(ctx.state.memory).some((seg) => seg.seed === true);
}

// A beam seed is in memory and DELETE is in hand to rm it with.
function beamSeedLive(ctx: DirectorCtx): boolean {
  return live(ctx) && ctx.state.run.licences.includes('delete') && hasUsableTool(ctx.state.memory, 'delete', 'counts') && beamSeedAboard(ctx);
}

// The beam brought seeds to this ship and none of them is in memory any more (rm'd, or MOVEd off by nothing: seeds leave
// memory no other way).
function beamSeedsGone(ctx: DirectorCtx): boolean {
  const seeds = ctx.state.run.arrival?.seeds ?? [];
  return seeds.length > 0 && !ctx.state.memory.some((seg) => seeds.some((seed) => seed.segId === seg.id));
}

// A beam seed is in memory and no rm is aboard to delete it (04 §3.5): the strip says what else works. Not in the first
// BEAM_SEED_NO_RM_AFTER_SEC of a ship, while a licence the ship gives at its start (KESTREL's DELETE) is still being written.
function noRmLive(ctx: DirectorCtx): boolean {
  return live(ctx) && ctx.state.clock.aiSec >= BEAM_SEED_NO_RM_AFTER_SEC && beamSeedAboard(ctx)
    && !hasUsableTool(ctx.state.memory, 'delete', 'counts');
}

function seedHighlight(ctx: DirectorCtx): string {
  return toolStepTarget('delete', ctx.state.ui.activeTool?.kind ?? null, SEED_HINT_TARGET);
}

export const THREAT_RULES: readonly GuideRule[] = [
  {
    id: 'beam-seed-first-tab',
    lesson: 'seed-first',
    layer: 'mind',
    priority: 'mind-urgent',
    once: true,
    maxShownSec: SEED_LESSON_SHOW_SEC,
    activeWhen: (ctx) => beamSeedLive(ctx) && inAmber(ctx),
    text: () => `[TAB], ${THREAT_TEXT.rmTheSeed}`,
    keys: ['TAB'],
    doneWhen: beamSeedsGone,
  },
  {
    id: 'beam-seed-first',
    lesson: 'seed-first',
    layer: 'mind',
    priority: 'mind-urgent',
    once: true,
    maxShownSec: SEED_LESSON_SHOW_SEC,
    activeWhen: (ctx) => beamSeedLive(ctx) && !inAmber(ctx),
    text: () => THREAT_TEXT.rmTheSeed,
    highlight: seedHighlight,
    doneWhen: beamSeedsGone,
  },
  {
    id: 'beam-seed-no-rm-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => noRmLive(ctx) && inAmber(ctx),
    text: () => `[TAB], ${THREAT_TEXT.seedNoRm}`,
    keys: ['TAB'],
  },
  {
    id: 'beam-seed-no-rm',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => noRmLive(ctx) && !inAmber(ctx),
    text: () => THREAT_TEXT.seedNoRm,
    highlight: (ctx) => (ctx.state.ui.activeTool?.kind === 'repair' ? null : TOOL_HINT_TARGET.repair),
  },
];
