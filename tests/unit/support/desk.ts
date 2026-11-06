// Slice 4 (plan §5.1 follow-up M4): SET COURSE from a desk for a suite that only wants to sail on. The arm's first desk
// requires the first skill pick (skill-tree.ts deskBlocker; setCourse throws on it once Track TREE lands the rule): this
// makes it first (AUTOBURN v1 through the real training path, tests/unit/support/skills.ts pickFirstSkill), then sets
// course.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { setCourse } from '@systems/run';
import { deskBlocker } from '@systems/skill-tree';
import { pickFirstSkill } from './skills';

export function setCourseFromDesk(store: Store<GameState>, slot: number): void {
  if (deskBlocker(store.getState()) === 'first-pick') pickFirstSkill(store);
  setCourse(store, slot);
}
