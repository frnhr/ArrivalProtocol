// Phase 2's HALCYON geometry on slice 2's calm HALCYON, for the suites that test a FIREWALL or a card against a root
// there (wp8/draft, wp8/p2/ui-models). HALCYON has no root slot since slice 2 (01-landing §3.16), so its rack B
// `P P P P P _24` becomes `P P P P _2 R _1 P _13`: POD 05 moves behind an 8-block root, POD 04 a GAP of 2 to its left and
// POD 05 a GAP of 1 to its right, as phase 2 built it; HOLLOW is phase 2's HALCYON (the WALLS stage). Track THREAT's
// support/hollow-world.ts plantRoot is the general tool; this one keeps those two suites' assertions as they were.
import type { GameState } from '@state/schema';
import type { HollowSegment } from '@/types/segment';
import { freeSegment } from '@systems/memory-ops';
import { phase2HollowOf } from '../support/hollow-world';

export function plantHalcyonRoot(draft: GameState): void {
  if (draft.level.shipName !== 'HALCYON') throw new Error(`plantHalcyonRoot: on ${draft.level.shipName}`);
  const pod5 = draft.memory.findIndex((seg) => seg.type === 'driver' && seg.pod === 5);
  const driver = draft.memory[pod5];
  const tail = draft.memory[pod5 + 1];
  if (driver === undefined || tail?.type !== 'free' || tail.size < 24) throw new Error('plantHalcyonRoot: rack B no longer ends POD 05, _24');
  const root: HollowSegment = { id: 'root', name: '???', type: 'hollow', size: 8, root: true, locked: true, owner: '???' };
  draft.memory.splice(pod5, 2, freeSegment(2), root, freeSegment(1), driver, freeSegment(tail.size - 11));
  draft.hollow.cfg = phase2HollowOf(1);
  draft.ui.memoryRev++;
}
