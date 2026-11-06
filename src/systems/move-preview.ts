// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): its HOLLOW readers (a decoy alone turns no WALL / GAP label on; a decoy moved is previewed as the file it shows). Others ask by message.
import type { GameState, PendingPlacement } from '@state/schema';
import type { Segment } from '@/types/segment';
import { resolvePlacement } from '@state/actions';
import { freeSegment, mergeAdjacentFree, segmentStarts, requireAddr } from '@systems/memory-ops';
import { rackOf, layoutOf, layoutOfMemory } from '@data/memory';
import { freeRunFrom, isWall, hollowReach } from '@systems/hollow';
import { blocksInRack } from '@systems/zones';
import { isOpenFree } from '@systems/tool-targets';
import { isHollow, isInfectable, isInfected, hasIntegrity } from '@state/selectors';
import type { RackHazard } from '@/types/zone';
import { isVisibleHollow, isDisguised, decoyFileView } from '@state/threat-selectors';
import { RACK_BLOCKS, WALL_MIN_BLOCKS, SEED_BLOCKS } from '@data/tuning';

// The MOVE preview (§6.5, §9 WP7 item 5), pure and DOM-free: what a MOVE to the placement under the
// cursor would do to HOLLOW's reach, judged on memory as it will be once the move is done (the source's
// blocks free, the file at its new address, free space merged). WP7 part 2 paints it next to the
// placeholder (`WALL 9 ✓` / `GAP 2 ✗`, `⚠ LETS ??? REACH YOUR CORE`).
// • source: the free space the file leaves behind, when it touches HOLLOW: a WALL (≥ WALL_MIN_BLOCKS
//   free blocks: the bite fizzles there) or a GAP it bites across. null when it touches no HOLLOW.
// • dest: whether the file at its new address is out of HOLLOW's reach. HOLLOW's reach is every file it
//   could ever get to by its own rule: it bites a neighbour across fewer than WALL_MIN_BLOCKS free blocks,
//   the eaten file turns hollow and bites on; REPAIR CHARGE, a FIREWALL and the end of memory stop it, and
//   so does a WALL. A file in reach is exposed across the GAP its chain reaches it through.
// • bridges: the move leaves HOLLOW a chain of GAPs into rack E (your Core and your AI files) that was
//   not there before. A placement that only keeps a bridge that already existed does not say it again.
// • seals: the file is a FIREWALL.sys and, at its new address, it is what HOLLOW's look ends on, on some
//   side (WP8: `SEALS THIS SIDE ✓` instead of a plain SAFE: this is the move the card was for).
// • infected: the file itself is infected (bitten after the pick, WP12 p3): the infection moves with it, so no spot is
//   safe until it is repaired, whatever the reach says.
// • hazard: a hazard zone is known to hit a rack the file would sit in at its new address (`hazards`: the red rack tags,
//   flight-hud.ts knownHitRacks), for a file it can hurt. Out of HOLLOW's reach is not SAFE there (final review: on LAST
//   LIGHT the preview called rack A SAFE / WALL ✓ for a soul cluster while the belt was coming for racks A–B).

export interface GapLabel {
  blocks: number;
  wall: boolean;     // ≥ WALL_MIN_BLOCKS: `WALL n ✓`; else `GAP n ✗`
}

export interface MovePreview {
  source: GapLabel | null;
  dest: { exposed: false } | { exposed: true; gap: GapLabel };
  bridges: boolean;
  seals: boolean;
  infected: boolean;
  hazard: RackHazard | null;
}

// Memory as it will be once `source` has moved to the placement (a copy; `memory` is not touched).
// null when the placement is not one the move would accept.
export function memoryAfterMove(memory: readonly Segment[], source: Segment, placement: PendingPlacement): Segment[] | null {
  const dest = resolvePlacement(memory, placement, source, 'move');
  if (typeof dest === 'string') return null;
  const sourceStart = requireAddr(memory, source);
  const after: Segment[] = [];
  for (const seg of memory) after.push(seg === source ? freeSegment(seg.size) : { ...seg });
  mergeAdjacentFree(after);
  // The file goes into the (now free) blocks at its destination: split the free run around it.
  const starts = segmentStarts(after);
  const index = after.findIndex((seg, i) => seg.type === 'free' && starts[i]! <= dest.destAddr && dest.destAddr + source.size <= starts[i]! + seg.size);
  if (index < 0) throw new Error(`memoryAfterMove: no free run holds ${source.name} at ${dest.destAddr} (source at ${sourceStart})`);
  const run = after[index]!;
  const pre = dest.destAddr - starts[index]!;
  const post = run.size - pre - source.size;
  after.splice(index, 1, ...(pre > 0 ? [freeSegment(pre)] : []), { ...source }, ...(post > 0 ? [freeSegment(post)] : []));
  return after;
}

// How a reached file was reached: across which gap (free blocks) from the file before it in the chain.
interface ReachedVia {
  gapBlocks: number;
}

// HOLLOW's whole reach (see the header), by segment index, with the gap each file is reached across.
export function hollowReachAll(memory: readonly Segment[]): Map<number, ReachedVia> {
  const reached = new Map<number, ReachedVia>();
  const queue: number[] = [];
  // Slice 4d: a disguised seed is the file it shows here (a label a decoy turned on would name it): it starts no reach, and
  // a reach that gets to it goes on through it as through any file (isHollow lets it pass the food test below).
  memory.forEach((seg, index) => {
    if (isVisibleHollow(seg)) { reached.set(index, { gapBlocks: 0 }); queue.push(index); }
  });
  while (queue.length > 0) {
    const from = queue.shift()!;
    for (const step of [-1, 1] as const) {
      const { gapBlocks, nextIndex } = freeRunFrom(memory, from, step);
      const neighbour = memory[nextIndex];
      if (!neighbour || isWall(gapBlocks) || reached.has(nextIndex)) continue;
      if (!isInfectable(neighbour) && !isHollow(neighbour)) continue;
      reached.set(nextIndex, { gapBlocks });
      queue.push(nextIndex);
    }
  }
  return reached;
}

// HOLLOW can reach a file in rack E (your Core and your AI files).
export function reachesRackE(memory: readonly Segment[]): boolean {
  const { unitStart } = layoutOfMemory(memory);
  const rackEEnd = unitStart + RACK_BLOCKS;
  const starts = segmentStarts(memory);
  for (const [index] of hollowReachAll(memory)) {
    const seg = memory[index]!;
    if (isVisibleHollow(seg)) continue;
    const start = starts[index]!;
    if (start < rackEEnd && start + seg.size > unitStart) return true;
  }
  return false;
}

// The free run left where the file was, as a label when HOLLOW is right at one of its ends.
function sourceGap(after: readonly Segment[], sourceStart: number, size: number): GapLabel | null {
  const starts = segmentStarts(after);
  let best: { index: number; overlap: number } | null = null;
  after.forEach((seg, index) => {
    if (seg.type !== 'free') return;
    const overlap = Math.min(starts[index]! + seg.size, sourceStart + size) - Math.max(starts[index]!, sourceStart);
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { index, overlap };
  });
  const found = best as { index: number; overlap: number } | null;
  if (!found) return null;
  const left = after[found.index - 1];
  const right = after[found.index + 1];
  if (!(left && isVisibleHollow(left)) && !(right && isVisibleHollow(right))) return null;
  const blocks = after[found.index]!.size;
  return { blocks, wall: isWall(blocks) };
}

export function movePreview(
  state: Readonly<GameState>, source: Segment, placement: PendingPlacement, hazards: readonly RackHazard[],
): MovePreview | null {
  const after = memoryAfterMove(state.memory, source, placement);
  if (!after) return null;
  const sourceStart = requireAddr(state.memory, source);
  const reach = hollowReachAll(after);
  const destIndex = after.findIndex((seg) => seg.id === source.id);
  const via = reach.get(destIndex);
  const destAddr = segmentStarts(after)[destIndex]!;
  // A zone hurts only files with a health number (zones.ts damageable): a FIREWALL in the belt's rack is fine. A decoy is
  // judged as the healthy unit file it shows (review B1: its preview may not tell it from one).
  const shown = isDisguised(source) ? decoyFileView(source) : source;
  const hazard = hasIntegrity(shown)
    ? hazards.find((candidate) => blocksInRack(destAddr, source.size, candidate.rack, layoutOf(state)) > 0) ?? null
    : null;
  return {
    source: sourceGap(after, sourceStart, source.size),
    dest: via === undefined ? { exposed: false } : { exposed: true, gap: { blocks: via.gapBlocks, wall: false } },
    bridges: reachesRackE(after) && !reachesRackE(state.memory),
    seals: source.type === 'firewall'
      && hollowReach(after, state.clock.aiSec).some((reach) => reach.verdict === 'blocked' && reach.neighbourId === source.id),
    infected: isInfected(shown),
    hazard,
  };
}

// A free gap a seed can't bite across from its middle (hollow.ts seedSpot lands a seed in the centre of a WALL next to a
// soul): WALL_MIN_BLOCKS free blocks left on both sides of it.
const SEED_PROOF_GAP = 2 * WALL_MIN_BLOCKS + SEED_BLOCKS;

// The free blocks right before and right after the segment at `index` (0 where it abuts a file or the end of memory).
function freeBeside(memory: readonly Segment[], index: number): [number, number] {
  const size = (seg: Segment | undefined): number => (seg?.type === 'free' ? seg.size : 0);
  return [size(memory[index - 1]), size(memory[index + 1])];
}

// Where a kid reading the preview puts `source` (the playthrough's rule since WP11, harness11): at either end of an open
// free region big enough, a spot the preview calls SAFE (out of HOLLOW's reach, no bridge into rack E, no hazard zone
// known to hit its rack, the file not infected), the one farthest from HOLLOW's nearest block. The strip's bitten-again
// MOVE ask names its rack (final review: on LAST LIGHT the farthest SAFE spot was rack A, which the belt was coming
// for). Of those, a spot that leaves no seed a WALL to aim at beside the file comes first: each free gap beside it
// either under WALL_MIN_BLOCKS (no WALL, so no seed aims there) or so wide that a seed in its middle bites nothing.
// Without that, a cluster moved out of the belt's racks sat behind a 4-block WALL (beside C16, or beside the AI Core at
// rack D's end), the next seed landed in it and bit both, again and again: the strip-literal kid reached the choice
// with MERGE's 20 charge in 57 of 192 runs instead of 154 of 198 (the final fix pass's playthrough experiments). null: nowhere is SAFE. Pure.
export function safestSpot(state: Readonly<GameState>, source: Segment, hazards: readonly RackHazard[]): PendingPlacement | null {
  const memory = state.memory;
  const hollowAddrs = memory.filter(isVisibleHollow).map((block) => requireAddr(memory, block));
  let best: { spot: PendingPlacement; seedProof: boolean; distance: number } | null = null;
  for (const region of memory) {
    if (!isOpenFree(region) || region.size < source.size) continue;
    for (const col of new Set([0, region.size - source.size])) {
      const spot: PendingPlacement = { regionSegIds: [region.id], col };
      const preview = movePreview(state, source, spot, hazards);
      if (preview === null || preview.infected || preview.dest.exposed || preview.bridges || preview.hazard !== null) continue;
      const after = memoryAfterMove(memory, source, spot);
      if (after === null) throw new Error(`safestSpot: the preview judged a placement the move refuses (${source.name})`);
      const seedProof = freeBeside(after, after.findIndex((seg) => seg.id === source.id))
        .every((free) => free < WALL_MIN_BLOCKS || free >= SEED_PROOF_GAP);
      const spotAddr = requireAddr(memory, region) + col;
      const distance = Math.min(...hollowAddrs.map((addr) => Math.abs(addr - spotAddr)));
      const better = best === null || (seedProof !== best.seedProof ? seedProof : distance > best.distance);
      if (better) best = { spot, seedProof, distance };
    }
  }
  return best?.spot ?? null;
}

// The rack a placement's first block is in (`D`).
export function placementRack(memory: readonly Segment[], placement: PendingPlacement): string {
  const region = memory.find((seg) => seg.id === placement.regionSegIds[0]);
  if (!region) throw new Error(`placementRack: no segment '${placement.regionSegIds[0]}' in memory`);
  return rackOf(requireAddr(memory, region) + placement.col, layoutOfMemory(memory));
}
