// Consecutive runs on one persistent arm, as docs/phase3/map-sim/arm_sim.py's `chain` plays them (02 §3.13): run 1 on run
// 1's arm (risk 14: the game's run 1 is the authored arm, not a fresh roll), then each run the world update from the last
// arm and the route a player took. Players: 'best' (the best route by pods), 'random' (every hop picked evenly among the
// reachable ships), 'mix' (either, run by run). FAIL_SHARE of runs end before the final ship (the route cut at a random
// stop from the 2nd on, as the sim). Pure: the arms and their statistics with no store (world/update-stats and
// world/update-stats-full read the rows). The player's own rolls are this file's (a `chain:` stream), apart from the
// update's.
import type { ArmShip } from '@/types/map';
import type { ArmState, LeaveReason } from '@/types/lineage';
import { updateArm, freshArmState, type ArmUpdate } from '@systems/map-update';
import { armReach, memoryClassOf } from '@systems/map-generator';
import { layerOf, distTable, solLy } from '@systems/map-geometry';
import { createRng, hashSeed, type Rng } from '@systems/rng';
import { END_SLOTS, FIRST_SLOT, WORLDS, slotsInLayer } from '@data/arm';
import { LATE_TIGHT_FROM_LAYER, RUN_START_YEAR } from '@data/tuning';

export type Player = 'best' | 'random' | 'mix';

// The sim's share of runs that end before the final ship.
export const FAIL_SHARE = 0.15;

export interface RunRow {
  run: number;
  best: number;                 // the best route's pods
  bestLen: number;              // the shortest length reaching it (the sim's best_len)
  onRoutes: number;             // ships on some route (of 20)
  lateTight: number;            // TIGHT ships from LATE_TIGHT_FROM_LAYER
  tightOnBest: boolean;         // a late TIGHT ship on the best route
  classes: string[];
  span: number;                 // the final ship's year minus the first ship's
  waiting: number;              // ships on their 2nd run or later at RUN START (the sim's `persisting`, final ship included)
  ages: number[];               // runsOnChart − 1 of every ship but the first and the final
  finalNew: boolean;            // the final ship reported home this run
  authoredLeft: number;         // authored ships on the chart (HALCYON, KESTREL, VESPER: the sim's AUTHORED)
  debrisAtDepth2: boolean;      // a DEBRIS ship among the layer-3 ships reachable from the first ship
  taken: number;                // the pods of the route the player took
  failed: boolean;
  req23: boolean | null;        // a request from ship 2 reaches ship 3 on the route taken (02 §3.9)
  update: ArmUpdate | null;     // the update that made this run's arm (null on run 1)
}

// The best pods from each slot to a final ship by route length (k ships, the slot included): -Infinity when none.
function bestByLength(arm: readonly ArmShip[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const ship of [...arm].sort((a, b) => layerOf(b.slot) - layerOf(a.slot))) {
    const row = Array.from({ length: 10 }, () => -Infinity);
    if (END_SLOTS.includes(ship.slot)) row[1] = ship.pods;
    else {
      for (const [to, next] of out) {
        if (!armReach(arm, ship.slot, to)) continue;
        for (let k = 1; k < 9; k++) if (next[k]! > -Infinity) row[k + 1] = Math.max(row[k + 1]!, next[k]! + ship.pods);
      }
    }
    out.set(ship.slot, row);
  }
  return out;
}

const lateTight = (ship: Readonly<ArmShip>): boolean => layerOf(ship.slot) >= LATE_TIGHT_FROM_LAYER && ship.memoryClass === 'TIGHT';

// The best route itself (the heaviest; ties to the first successor in slot order).
function bestRoute(arm: readonly ArmShip[], table: Map<number, number[]>): number[] {
  const value = (slot: number): number => Math.max(...table.get(slot)!);
  const route = [FIRST_SLOT];
  while (!END_SLOTS.includes(route.at(-1)!)) {
    const at = route.at(-1)!;
    const target = value(at) - arm[at]!.pods;
    const next = WORLDS.map((def) => def.slot).find((to) => armReach(arm, at, to) && value(to) === target);
    if (next === undefined) throw new Error(`chain: no way on from slot ${at} along the best route`);
    route.push(next);
  }
  return route;
}

function randomRoute(arm: readonly ArmShip[], rng: Rng): number[] {
  const route = [FIRST_SLOT];
  while (!END_SLOTS.includes(route.at(-1)!)) {
    const at = route.at(-1)!;
    const next = WORLDS.map((def) => def.slot).filter((to) => armReach(arm, at, to));
    if (next.length === 0) throw new Error(`chain: no way on from slot ${at}`);
    route.push(next[Math.floor(rng() * next.length)]!);
  }
  return route;
}

// The slots on some route: reachable from the first ship and reaching a final ship.
function onSomeRoute(arm: readonly ArmShip[]): number {
  const forward = new Set([FIRST_SLOT]);
  for (const def of [...WORLDS].sort((a, b) => a.layer - b.layer)) {
    if ([...forward].some((from) => armReach(arm, from, def.slot))) forward.add(def.slot);
  }
  const back = new Set(END_SLOTS);
  for (const def of [...WORLDS].sort((a, b) => b.layer - a.layer)) {
    if ([...back].some((to) => armReach(arm, def.slot, to))) back.add(def.slot);
  }
  return WORLDS.filter((def) => forward.has(def.slot) && back.has(def.slot)).length;
}

// 02 §3.9's delivery rule on a hop (the sim's request_ok): the detour home and back fits the slack.
function requestReaches(arm: readonly ArmShip[], s0: number, s1: number): boolean {
  const detour = solLy(s0) + solLy(s1) - distTable(s0, s1);
  return detour <= arm[s1]!.approachYear - arm[s0]!.approachYear - distTable(s0, s1);
}

export function rowOf(arm: Readonly<ArmState>, update: ArmUpdate | null): Omit<RunRow, 'taken' | 'failed' | 'req23'> & { table: Map<number, number[]> } {
  const ships = arm.ships;
  const table = bestByLength(ships);
  const lengths = table.get(FIRST_SLOT)!;
  const best = Math.max(...lengths);
  const route = bestRoute(ships, table);
  return {
    run: arm.run, best, bestLen: lengths.findIndex((pods) => pods === best), onRoutes: onSomeRoute(ships),
    lateTight: ships.filter(lateTight).length, tightOnBest: route.some((slot) => lateTight(ships[slot]!)),
    classes: ships.map((ship) => memoryClassOf(ship.kind, ship.pods)), span: ships[END_SLOTS[0]!]!.approachYear - ships[FIRST_SLOT]!.approachYear,
    waiting: ships.filter((ship) => ship.runsOnChart > 1).length,
    ages: ships.filter((ship) => ship.slot !== FIRST_SLOT && !END_SLOTS.includes(ship.slot)).map((ship) => ship.runsOnChart - 1),
    finalNew: ships[END_SLOTS[0]!]!.reportedRun === arm.run, authoredLeft: ships.filter((ship) => ship.authored !== null && ship.kind !== 'first' && ship.kind !== 'final').length,
    debrisAtDepth2: slotsInLayer(3).some((slot) => armReach(ships, FIRST_SLOT, slot) && ships[slot]!.modifiers.includes('debris')),
    update, table,
  };
}

// `runs` consecutive runs on arm seed `seed`, played by `player`.
export function chain(seed: number, runs: number, player: Player): RunRow[] {
  const rng = createRng(hashSeed(`chain:${seed}:${player}`));
  let arm: ArmState = freshArmState(seed, 1, RUN_START_YEAR, null);
  let update: ArmUpdate | null = null;
  const rows: RunRow[] = [];
  for (let n = 1; n <= runs; n++) {
    if (update !== null) arm = update.next;
    const { table, ...row } = rowOf(arm, update);
    const policy = player === 'mix' ? (rng() < 0.5 ? 'best' : 'random') : player;
    let route = policy === 'best' ? bestRoute(arm.ships, table) : randomRoute(arm.ships, rng);
    const failed = rng() < FAIL_SHARE;
    if (failed) route = route.slice(0, 2 + Math.floor(rng() * (route.length - 2)));
    rows.push({
      ...row, taken: route.reduce((sum, slot) => sum + arm.ships[slot]!.pods, 0), failed,
      req23: route.length > 2 ? requestReaches(arm.ships, route[1]!, route[2]!) : null,
    });
    if (n < runs) update = updateArm({ from: arm, visited: route.map((slot) => ({ slot, colony: true })) });
  }
  return rows;
}

export const pct = (xs: readonly number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
export const median = (xs: readonly number[]): number => pct(xs, 0.5);
export const mean = (xs: readonly number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

export function corr(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  a.forEach((x, i) => { num += (x - ma) * (b[i]! - mb); da += (x - ma) ** 2; db += (b[i]! - mb) ** 2; });
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export const LEAVE_REASONS: readonly LeaveReason[] = ['done', 'first-past', 'aged', 'resolved', 'drifted', 'unreachable', 'made-room', 'off-pattern-ark'];
