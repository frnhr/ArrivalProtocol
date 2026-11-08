// Slice 7c, Track TRACE: run 2 on a fresh arm, after a last unit's ending of the suite's choice, for traces/gifts,
// traces/final-ship and traces/traces-sweep. The run starts through the game's own RUN START (systems/run.ts startRun with a
// run-2 lineage: run.traces rolled and placed as a real run 2's are), ship 1's boot is played or skipped, and the arm is
// beamed desk to desk with no flights (map/repo-fixture's send: every send is the real one), along a route through the
// ships a scenario needs. The ship the scenario looks at has its boot played (the trace lines said by systems/boot.ts).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import type { LastUnit, UnitTrail } from '@/types/lineage';
import type { RunMapState } from '@/types/map';
import type { RunLineage } from '@systems/meta';
import type { Route } from '@systems/map-route';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { startRun } from '@systems/run';
import { receiveTransmission } from '@systems/boot';
import { createRunMap } from '@systems/map-run';
import { routes } from '@systems/map-route';
import { isEndSlot } from '@systems/map-streams';
import { layerOf } from '@systems/map-geometry';
import { send } from '../map/repo-fixture';

// A last unit's ending (EndingRecord), the fields a suite does not name as a plain run 1's: UNIT-047 at LAST LIGHT.
export function endingOf(hollow: HollowFate, you: YouChoice, extra: Partial<EndingRecord> = {}): EndingRecord {
  return {
    hollow, you, rootUnits: [46], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 2600, stay: null,
    kit: ['scan', 'repair', 'delete', 'move'], fuelPct: hollow === 'spare' || you === 'sunset' ? 25 : null, charge: 20, ...extra,
  };
}

export function lastUnitOf(ending: EndingRecord, trail: UnitTrail | null = null): LastUnit {
  return {
    number: 47, landed: 800, shipName: 'LAST LIGHT', cause: ending.hollow === 'merge' ? 'won-merge' : 'won-purge', stats: { moves: 0, deletes: 0 },
    hollowUnits: [46], trail, skills: null, ending,
  };
}

// Run 2's lineage after `lastUnit` (the arm a fresh roll from the run seed: no archive arm).
export function lineage2(lastUnit: LastUnit | null): RunLineage {
  return { ...FIRST_RUN_LINEAGE, unitNumber: 48, wave: 2, lastUnit, hollowUnits: [47], tutorialDone: true, armSeed: null, arm: null };
}

// The arm run 2 rolls from `seed` (startRun's own: createRunMap(lineage, seed)).
export function arm2(seed: number): RunMapState {
  return createRunMap(lineage2(null), seed);
}

// A last route on `map`: every ship in layers 1–4, the last unit landing there `yearsBefore` years before its approach (a
// negative number: after it, so no SUNSET ship qualifies).
export function trailOn(map: Readonly<RunMapState>, yearsBefore = 40): UnitTrail {
  const stops = map.arm.filter((ship) => ship !== undefined && ship !== null && layerOf(ship.slot) >= 1 && layerOf(ship.slot) <= 4).map((ship) => ({
    slot: ship.slot, shipName: ship.name, year: ship.approachYear - yearsBefore, outcome: 'locked' as const, landed: 200, colony: 'X', writer: null,
  }));
  return { unit: 47, run: 1, startYear: 2300, stops, lost: null };
}

// RUN START of run 2 on `seed` after `lastUnit`, and ship 1's boot: played (`playBoot`: the trace lines said) or not; the
// ship then ends on its LANDING REPORT.
export function startRun2(
  store: Store<GameState>, step: () => void, seed: number, lastUnit: LastUnit | null, playBoot = false,
): void {
  startRun(store, seed, lineage2(lastUnit));
  receiveTransmission(store);
  if (playBoot) bootOut(store, step);
  store.update((draft) => { draft.run.phase = 'report'; });
}

// The boot played to its flight (every line said, as systems/boot.ts says them).
export function bootOut(store: Store<GameState>, step: () => void, maxSteps = 4000): void {
  for (let i = 0; i < maxSteps && store.getState().run.phase === 'boot'; i++) step();
  if (store.getState().run.phase === 'boot') throw new Error('trace-arm: the boot did not end');
}

// A route on `map` from the first ship to a final ship through every slot in `via` (the longest such, then the lowest
// slots: deterministic), or null.
export function routeVia(map: Readonly<RunMapState>, via: readonly number[] = []): Route | null {
  const all = routes(map).filter((route) => via.every((slot) => route.includes(slot)));
  if (all.length === 0) return null;
  return all.reduce((best, route) => (route.length > best.length || (route.length === best.length && route.join() < best.join()) ? route : best));
}

// Beamed desk to desk along `route` (from the ship the unit is on, its first slot) up to and including `toSlot`, with
// `asks[i]` requested at desk i; the boot of `toSlot` is played. Ends in that ship's flight.
export function beamTo(
  store: Store<GameState>, step: () => void, route: Route, toSlot: number, asks: readonly (Parameters<typeof send>[2])[] = [],
): void {
  const at = route.indexOf(toSlot);
  if (at < 1) throw new Error(`trace-arm: slot ${toSlot} is not past the route's first ship (${route.join(',')})`);
  for (let i = 1; i <= at; i++) send(store, route[i]!, asks[i - 1] ?? null);
  bootOut(store, step);
}

export function finalSlotOf(route: Route, map: Readonly<RunMapState>): number {
  const last = route[route.length - 1]!;
  if (!isEndSlot(map, last)) throw new Error(`trace-arm: route ${route.join(',')} does not end at a final ship`);
  return last;
}
