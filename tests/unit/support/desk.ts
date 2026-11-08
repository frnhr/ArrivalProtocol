// Slice 4 (plan §5.1 follow-up M4): SET COURSE from a desk for a suite that only wants to sail on. The arm's first desk
// requires the first skill pick (skill-tree.ts deskBlocker; setCourse throws on it once Track TREE lands the rule): this
// makes it first (AUTOBURN v1 through the real training path, tests/unit/support/skills.ts pickFirstSkill), then sets
// course.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { RunMapState } from '@/types/map';
import {
  setCourse, continueAfterReport as runContinueAfterReport, continueAfterLoss as runContinueAfterLoss, type LossPlan,
} from '@systems/run';
import { WORKED_ROUTE } from '@systems/arm-fixture';
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

// The run through the DESK for the suites written before it (slice 3a foundation F2; Track RETIRE moved it here from
// retired support/classic-flow). A ship's end opens the DESK (systems/run.ts openDesk) before TRANSMIT; these set course
// to the worked route's next stop (systems/arm-fixture.ts WORKED_ROUTE: run 1's arm, the fixture world) when the call left
// the run on the desk (and do nothing when it ended the run or restarted ship 1), with the first desk's required pick made
// (setCourseFromDesk). Nothing is requested: the suites' tools are their own. A suite on a later run's arm (a fresh roll)
// sets its own course (climbingRoutes).
export function throughDesk(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') return;
  const next = WORKED_ROUTE[state.run.map.route.length];
  if (next === undefined) throw new Error(`throughDesk: the worked route has no stop after depth ${state.run.map.route.length}`);
  setCourseFromDesk(store, next);
}

export function continueAfterReport(store: Store<GameState>): void {
  runContinueAfterReport(store);
  throughDesk(store);
}

export function continueAfterLoss(store: Store<GameState>): LossPlan {
  const plan = runContinueAfterLoss(store);
  throughDesk(store);
  return plan;
}
