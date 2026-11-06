// TRAINING at the DESK (phase 3 slice 4; docs/phase3/03-skills.md §3.3, §4; slice-4-plan §2.4–§2.6): buying a cell, UNDO,
// RESTORE, PACK AS on the PACKET, and the commit at TRANSMIT ▸. Track TREE owns this file after the FOUNDATION (plan §5.2);
// the tab's model is Track UI's systems/training-model.ts.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SkillId, SkillLevel, CellRow } from '@/types/skill';
import type { TrainRefusal } from '@systems/skill-tree';
import { notBuilt } from '@systems/not-built';

// The required first pick is enforced: setCourse throws on skill-tree.ts deskBlocker. Track TREE turns it on in the same
// change that lands that throw (with trainCell, commitTraining and openDesk's first-pick grant); until then the helpers that
// make the pick for a caller that only wants to sail (the suites' tests/unit/support/desk.ts setCourseFromDesk, __ap.course)
// leave it unmade, since trainCell is not built. One switch, so no suite changes when the rule lands.
export const FIRST_PICK_ENFORCED = false;

// --- Track TREE ----------------------------------------------------------------------------------------------------------

// The kid buys a cell (TRAIN): a SkillPurchase joins this desk's pending ones, or the refusal says why not. Its file joins
// the packet at TRANSMIT through planPacket.
export function trainCell(store: Store<GameState>, skill: SkillId, row: CellRow): TrainRefusal | null {
  return notBuilt('trainCell', 'TREE', store, skill, row);
}

// UNDO (until TRANSMIT ▸, 03 §3.3): takes back pending purchase `index`, which must be the last pending one of its skill
// (a lower level under a higher one can't go first). Anything else is a bug: throws.
export function undoPurchase(store: Store<GameState>, index: number): void {
  notBuilt('undoPurchase', 'TREE', store, index);
}

// RESTORE (decision 16): one purchase that brings the skill back at its paid level, fresh, for restorePrice(lost).
export function restoreSkill(store: Store<GameState>, skill: SkillId): TrainRefusal | null {
  return notBuilt('restoreSkill', 'TREE', store, skill);
}

// PACK AS (4b, round-2 decision 10): the PACKET packs file `segId` at a lower `level` (null: as it is). Refused on a file
// trained at this desk (its 'trained' lock: UNDO is the way back there).
export function setPackAs(store: Store<GameState>, segId: string, level: Readonly<SkillLevel> | null): void {
  notBuilt('setPackAs', 'TREE', store, segId, level);
}

// TRANSMIT ▸ (run.ts transmitNext): this desk's pending purchases become bought, and the +2 CYCLES salvage card (when it
// was the pick) becomes a grant.
export function commitTraining(store: Store<GameState>): void {
  notBuilt('commitTraining', 'TREE', store);
}
