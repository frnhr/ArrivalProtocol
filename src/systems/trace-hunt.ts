// =====================================================================================================================
// Slice 7c: Track TRACE owns this file (docs/phase3/impl/slice-7-plan.md §2.4, §5.3; R33's hunt). Pure and DOM-free (no
// store, no module state): systems/hollow.ts and systems/hollow-verbs.ts call it on HOLLOW's hot paths.
// =====================================================================================================================
// REASSIGNMENT's cost (05 §3.8: "it knows what you value"): on the final ship the root is the last unit, and HOLLOW's RM
// verb takes the highest-version `.skl` in memory first while one is a fair target (ties: the larger file; HUNT_PREFER_WEIGHT,
// TRACE's tuning), and its seeds land beside it.
// • huntTarget: hollow-verbs.ts startVerb passes it to hollow.ts chooseVerb as `prefer` (RM takes that file when it is among
//   rmTargets, whatever the tier draw; the draws are taken either way, so a null prefer changes nothing).
// • nearSkillSeedSpot: hollow.ts seedSpotFor's 'near-skill' target, which threat-plan.ts planThreat sets on the FINALE's own
//   seeds only when ThreatInput.traces.hunt (systems/traces.ts finalTraceInput: REASSIGNMENT held and built).
// The hunted skill is the same file for both (huntedSkill): the highest version, then the larger file, then the lower
// address. A skill copy being moved or copied is still the skill (its blocks stand where they are until the op lands).
// hollow.ts imports this file and this file calls hollow.ts seedSpot (the FINALE's own rule, the fallback): a call-time
// cycle only, so neither module reads the other while it loads.
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { SeedSpot } from '@systems/hollow';
import { seedSpot } from '@systems/hollow';
import { isInfectable, isShipFile, huntedSkill } from '@state/selectors';
import { segmentStarts } from '@systems/memory-ops';
import { finalTraces, onFinalShip } from '@systems/traces';
import { currentSlot } from '@systems/map-streams';
import { createRng, hashSeed } from '@systems/rng';
import { HUNT_PREFER_WEIGHT, SEED_BLOCKS, SEED_TOOL_GAP_BLOCKS, WALL_MIN_BLOCKS } from '@data/tuning';

// The skill the root hunts in `memory` (R33), or null when the unit holds none: state/selectors.ts huntedSkill (carry.ts's
// layout reads it too).
export { huntedSkill };

// Does the root hunt on this ship (REASSIGNMENT held and built, on the final ship)?
export function huntsHere(state: Readonly<Pick<GameState, 'run'>>): boolean {
  return finalTraces(state.run).reassignment && onFinalShip(state.run);
}

// The file HOLLOW's RM goes for first now (a segment id), or null: no hunt (no REASSIGNMENT trace, not the final ship, no
// skill in memory). Below a weight of 1 the hunt is a draw of its own (the run, the ship and the verb's ordinal: pure, and
// never a draw from HOLLOW's own streams), so slice 8 can soften it without moving any other roll.
export function huntTarget(state: Readonly<GameState>): string | null {
  if (!huntsHere(state)) return null;
  const skill = huntedSkill(state.memory);
  if (skill === null) return null;
  if (HUNT_PREFER_WEIGHT >= 1) return skill.id;
  if (HUNT_PREFER_WEIGHT <= 0) return null;
  const roll = createRng(hashSeed(`run:${state.run.seed >>> 0}:hunt:${currentSlot(state.run)}:${state.hollow.verbTelegraphs}`))();
  return roll < HUNT_PREFER_WEIGHT ? skill.id : null;
}

// What a near-skill seed must never have in its bite (seedSpot's own fairness, plus the Core: a seed beside the Core on the
// final ship would bite the one file whose loss ends the run): the Core, a tool still untried on this ship, a ship file.
function spared(seg: Readonly<Segment> | undefined, untried: readonly FsToolKind[]): boolean {
  if (seg === undefined) return false;
  return seg.type === 'core' || (seg.type === 'fs-tool' && untried.includes(seg.fsTool)) || isShipFile(seg as Segment);
}

const isOpenFree = (seg: Readonly<Segment> | undefined): boolean => seg?.type === 'free' && seg.reservedBy === undefined;

// Where a 'near-skill' seed lands (R33: "its seeds land beside it"): a free gap with the hunted skill right beside it, the
// seed at the end that faces the skill, SEED_TOOL_GAP_BLOCKS free blocks from it (fewer if the gap is that small, or right
// against it when that keeps the far side a WALL off a file it must spare), so it bites the skill at its next bite, as
// hollow.ts nearToolsSeedSpot does for a tool. Of those gaps the larger first, then the lower address. With no such gap
// (the receiver packs the unit's files back to back, so a skill only has free space beside it once something next to it
// is gone: an RM, a file the kid moved or deleted) or no skill at all, the FINALE's own rule (hollow.ts seedSpot), so the
// hunt never puts a seed where the FINALE's seed could not go. null: nowhere a seed fits. Pure.
export function nearSkillSeedSpot(memory: readonly Segment[], untried: readonly FsToolKind[]): SeedSpot | null {
  const skill = huntedSkill(memory);
  if (skill === null || !isInfectable(skill)) return seedSpot(memory, untried);
  const starts = segmentStarts(memory);
  const at = memory.indexOf(skill);
  let best: { index: number; size: number; towardRight: boolean; toolGap: number } | null = null;
  for (const index of [at - 1, at + 1]) {
    const gap = memory[index];
    if (gap === undefined || !isOpenFree(gap) || gap.size < SEED_BLOCKS) continue;
    // The gap left of the skill faces right (its end toward the skill), the gap right of it faces left.
    const towardRight = index < at;
    const far = memory[towardRight ? index - 1 : index + 1];
    const toolGap = [Math.min(SEED_TOOL_GAP_BLOCKS, gap.size - SEED_BLOCKS), 0]
      .find((candidate) => gap.size - SEED_BLOCKS - candidate >= WALL_MIN_BLOCKS || !spared(far, untried));
    if (toolGap === undefined) continue;
    if (best === null || gap.size > best.size || (gap.size === best.size && index < best.index)) best = { index, size: gap.size, towardRight, toolGap };
  }
  if (best === null) return seedSpot(memory, untried);
  const gap = memory[best.index]!;
  const gapStart = starts[best.index]!;
  const startAddr = best.towardRight ? gapStart + gap.size - best.toolGap - SEED_BLOCKS : gapStart + best.toolGap;
  return { startAddr, gapId: gap.id };
}
