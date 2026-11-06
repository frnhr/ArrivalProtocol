// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2). Others ask by message.
// The TRAINING tab's model (phase 3 slice 4; docs/phase3/03-skills.md §4; slice-4-plan §2.5): pure, over TREE's reads
// (skill-tree.ts treeCells, bankOf, deskBlocker) and the desk's selection (UiState.trainingSel, trainingHoldSec).
import type { GameState } from '@state/schema';
import type { SkillPurchase } from '@/types/skill';
import type { TreeCell } from '@systems/skill-tree';
import { notBuilt } from '@systems/not-built';

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
