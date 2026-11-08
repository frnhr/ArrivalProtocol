// Slice 4 (plan §5.1 follow-up M4): SET COURSE from a desk for a suite that only wants to sail on. The arm's first desk
// requires the first skill pick (skill-tree.ts deskBlocker; setCourse throws on it once Track TREE lands the rule): this
// makes it first (AUTOBURN v1 through the real training path, tests/unit/support/skills.ts pickFirstSkill), then sets
// course.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { RunMapState } from '@/types/map';
import { setCourse } from '@systems/run';
import { deskBlocker } from '@systems/skill-tree';
import { pickFirstSkill } from './skills';
import { reachableFrom } from '@systems/map-hop';
import { layerOf } from '@systems/map-geometry';
import { END_SLOTS, FIRST_SLOT } from '@data/arm';

export function setCourseFromDesk(store: Store<GameState>, slot: number): void {
  if (deskBlocker(store.getState()) === 'first-pick') pickFirstSkill(store);
  setCourse(store, slot);
}

// Every route from ship 1 to a final ship that climbs a layer a hop (each stop reachable from the one before, further out),
// shortest first, then by slot order: a later run's arm is a fresh roll, so a suite that sails past run 1 picks its route
// from the arm it is on (run 1's own is systems/arm-fixture.ts WORKED_ROUTE).
export function climbingRoutes(map: Readonly<RunMapState>): number[][] {
  const found: number[][] = [];
  const walk = (path: number[]): void => {
    const here = path.at(-1)!;
    if (END_SLOTS.includes(here)) { found.push(path); return; }
    for (const next of reachableFrom(map, here)) if (layerOf(next) > layerOf(here)) walk([...path, next]);
  };
  walk([FIRST_SLOT]);
  return found.sort((a, b) => a.length - b.length);
}
