// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the beam-seed lessons' readers (a
// disguised seed is not a seed to them), and the strip's disguise line (DISGUISE_RULES). Others ask by message.
import type { GuideRule, DirectorCtx } from '@systems/director';
import type { Segment } from '@/types/segment';
import { beamSeedsInMemory, beamEatenInMemory, isDisguised } from '@state/threat-selectors';
import { hollowReach, oppositeSide } from '@systems/hollow';
import { hasUsableTool, isInfected, fileLabel } from '@state/selectors';
import { SEED_HINT_TARGET, BEAM_EATEN_HINT_TARGET, TOOL_HINT_TARGET, toolStepTarget } from '@data/fs-tools';
import { THREAT_TEXT, SENTRY_TEXT } from '@data/threat-text';
import { SEED_LESSON_SHOW_SEC, BEAM_SEED_NO_RM_AFTER_SEC } from '@data/tuning';

// The strip's rules for the threat ladder (docs/phase3/04-threats.md §3.3, §3.5; slice-2-plan §2.1, §5.1): the beam
// seeds' `RM THE SEED` lesson, its no-rm line, and the line for a file a seed ate (DELETE it too). Track SENTRY owns this file in 4c–4e (above); data/script.ts spreads THREAT_RULES into
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

// A beam seed the kid can see is in memory: a disguised one is no seed to the lessons (slice 4d; the RM lesson would light
// it, and the no-rm line would announce it). TRACE still counts it (beamSeedsInMemory).
function beamSeedAboard(ctx: DirectorCtx): boolean {
  return beamSeedsInMemory(ctx.state.memory).some((seg) => seg.seed === true && !isDisguised(seg));
}

// The files disguised seeds are eating right now (04 §3.6): each infected neighbour of a decoy whose red crawl comes in from
// the decoy's side. What the strip names; never the culprit.
function decoyVictims(ctx: DirectorCtx): Segment[] {
  const { memory, clock } = ctx.state;
  const victims: Segment[] = [];
  for (const reach of hollowReach(memory, clock.aiSec)) {
    if (reach.verdict !== 'infected' || reach.neighbourId === null) continue;
    if (!memory.some((seg) => seg.id === reach.hollowId && isDisguised(seg))) continue;
    const victim = memory.find((seg) => seg.id === reach.neighbourId);
    if (victim !== undefined && isInfected(victim) && victim.infected.side === oppositeSide(reach.side)) victims.push(victim);
  }
  return victims;
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

// A block a beam seed ate is in memory, no seed is (the RM lesson comes first), and DELETE is in hand (the review's M1: it
// is inert, but it reports home at the ship's end).
function beamEatenLive(ctx: DirectorCtx): boolean {
  return live(ctx) && !beamSeedAboard(ctx) && ctx.state.run.licences.includes('delete')
    && hasUsableTool(ctx.state.memory, 'delete', 'counts') && beamEatenInMemory(ctx.state.memory).length > 0;
}

function beamEatenGone(ctx: DirectorCtx): boolean {
  return (ctx.state.run.arrival?.seeds.length ?? 0) > 0 && beamEatenInMemory(ctx.state.memory).length === 0 && !beamSeedAboard(ctx);
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
    id: 'beam-eaten-tab',
    lesson: 'beam-eaten',
    layer: 'mind',
    priority: 'mind-urgent',
    once: true,
    maxShownSec: SEED_LESSON_SHOW_SEC,
    activeWhen: (ctx) => beamEatenLive(ctx) && inAmber(ctx),
    text: () => THREAT_TEXT.eatenReportsHomeTab,
    keys: ['TAB'],
    doneWhen: beamEatenGone,
  },
  {
    id: 'beam-eaten',
    lesson: 'beam-eaten',
    layer: 'mind',
    priority: 'mind-urgent',
    once: true,
    maxShownSec: SEED_LESSON_SHOW_SEC,
    activeWhen: (ctx) => beamEatenLive(ctx) && !inAmber(ctx),
    text: () => THREAT_TEXT.eatenReportsHome,
    highlight: (ctx) => toolStepTarget('delete', ctx.state.ui.activeTool?.kind ?? null, BEAM_EATEN_HINT_TARGET),
    doneWhen: beamEatenGone,
  },
  {
    id: 'beam-seed-no-rm-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => noRmLive(ctx) && inAmber(ctx),
    text: () => THREAT_TEXT.seedNoRmTab,
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

// The file HOLLOW's eating lines would name (LineVars.eating: the most urgent one nobody is repairing) is a decoy's victim.
function decoyEatingLive(ctx: DirectorCtx): boolean {
  if (!live(ctx) || ctx.vars.eating === '') return false;
  return decoyVictims(ctx).some((victim) => fileLabel(victim) === ctx.vars.eating);
}

// Slice 4d (04 §3.6, plan §4.2): a disguised seed eating its neighbour. The strip says which file is being eaten and what to
// do (SCAN its neighbours: the culprit is one of them), never which one it is. data/script.ts spreads these ahead of
// HOLLOW_RULES, whose `SOMETHING IS EATING …` would send the kid to REPAIR a file the decoy keeps on eating.
export const DISGUISE_RULES: readonly GuideRule[] = [
  {
    id: 'disguise-eating-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => decoyEatingLive(ctx) && inAmber(ctx),
    text: (ctx) => SENTRY_TEXT.somethingNextToTab(ctx.vars.eating),
    keys: ['TAB'],
  },
  {
    id: 'disguise-eating',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => decoyEatingLive(ctx) && !inAmber(ctx),
    text: (ctx) => SENTRY_TEXT.somethingNextTo(ctx.vars.eating),
    highlight: (ctx) => (ctx.state.ui.activeTool?.kind === 'scan' ? null : TOOL_HINT_TARGET.scan),
  },
];
