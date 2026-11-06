// Slice 4 (plan §5.1 item 6): skills for the suites. Phase 2 installed AUTOBURN.skl at the boot after two manual captures;
// slice 4 sells it at the desk instead, and the classic world has no desk tree. A suite that needs a skill file gives it
// here; one that walks the arm's first desk makes the required first pick here.
// • giveSkillFile: the file at a level, in memory now (skill-files.ts giveSkill: any old file of the skill replaced, at the
//   one mid-run install address, and a free purchase recorded so a later loss reads as lost, not never trained). Demos
//   are the suite's own (run.stats.demos).
// • pickFirstSkill: the arm's first desk's required pick through the real training path (training.ts trainCell), AUTOBURN
//   v1 by default. Track TREE builds trainCell: until then it throws (not built).
// • pendPurchase: a raw push to this desk's pending purchases, no rule checked (for the UI suites: the pending, owned and
//   lost looks of skill-tree.ts treeCells). Never sail with one in a save: the codec refuses pending purchases.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SkillFileSegment } from '@/types/segment';
import type { SkillId, SkillVersion, LockLevel, SkillPurchase } from '@/types/skill';
import { giveSkill } from '@systems/skill-files';
import { trainCell } from '@systems/training';

export function giveSkillFile(store: Store<GameState>, id: SkillId, version: SkillVersion = 1, lock: LockLevel = 0): SkillFileSegment {
  return giveSkill(store, id, { version, lock });
}

export function pickFirstSkill(store: Store<GameState>, id: SkillId = 'autoburn'): void {
  const refusal = trainCell(store, id, { kind: 'version', version: 1 });
  if (refusal !== null) throw new Error(`pickFirstSkill: ${id} v1 refused (${refusal})`);
}

export function pendPurchase(store: Store<GameState>, purchase: Readonly<SkillPurchase>): void {
  store.update((draft) => { draft.run.skills.pending.push(structuredClone(purchase) as SkillPurchase); });
}
