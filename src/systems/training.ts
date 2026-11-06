// TRAINING at the DESK (phase 3 slice 4; docs/phase3/03-skills.md §3.3, §4; slice-4-plan §2.4–§2.6): buying a cell, UNDO,
// RESTORE, PACK AS on the PACKET, the commit at TRANSMIT ▸, and the tab's model. Ownership after the FOUNDATION (plan §5.2):
// Track TREE owns every export but trainingModel (and its TrainingModel type), which is Track UI's.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SkillId, SkillLevel, CellRow, SkillPurchase } from '@/types/skill';
import type { TrainRefusal, TreeCell } from '@systems/skill-tree';
import { notBuilt } from '@systems/not-built';

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

// --- Track UI -----------------------------------------------------------------------------------------------------------

// The TRAINING tab as it draws (plan §2.5). The fields are Track UI's to shape; these are what the plan names: the bank
// header, visit 1's required first pick (root cards only), the grid from visit 2, the pending purchases UNDO lists, the
// AHEAD row and the packet preview with their binding limit, and the last unit's flavour line.
export interface TrainingModel {
  visit: number;
  bank: number;
  firstPick: boolean;
  cards: TreeCell[];
  cells: TreeCell[];
  pending: SkillPurchase[];
  ahead: string | null;
  preview: string | null;
  binding: 'link' | 'room' | null;
  lastUnitLine: string | null;
}

export function trainingModel(state: Readonly<GameState>): TrainingModel {
  return notBuilt('trainingModel', 'UI', state);
}
