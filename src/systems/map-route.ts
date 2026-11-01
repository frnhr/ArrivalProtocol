import type { RunMapState } from '@/types/map';
import { FIRST_SLOT } from '@data/arm';
import { reachableFrom } from '@systems/map-hop';
import { isEndSlot, shipSummaryAt } from '@systems/map-run';

// Routes on an arm (02-map §3.6, §3.13; slice-3a-plan §2.1): every chain of reachable hops from the first ship to a final
// ship, the best by pods, and how many ships are left after a slot. Pure. Real from the foundation on (the run-1 table's
// 907 routes and 66/69/68/64 best pods are its check). Track GEN owns this file after the foundation.

// A route as the slots it visits, first ship first.
export type Route = readonly number[];

// Every route from `from` (the first ship by default) to a final ship: a depth-first walk over reachable hops. Every
// chain ends at a final ship on a valid arm (checks 1 and 4), so none is dropped. The classic world has one.
export function routes(map: Readonly<RunMapState>, from: number = FIRST_SLOT): Route[] {
  const next = new Map<number, number[]>();
  const out: Route[] = [];
  const walk = (path: number[]): void => {
    const at = path[path.length - 1]!;
    if (isEndSlot(map, at)) { out.push([...path]); return; }
    if (!next.has(at)) next.set(at, reachableFrom(map, at));
    for (const to of next.get(at)!) walk([...path, to]);
  };
  walk([from]);
  return out;
}

// A route's pods (the colonists it could land, in pods: 02 §3.13's measure).
export function routePods(map: Readonly<RunMapState>, route: Route): number {
  return route.reduce((sum, slot) => sum + shipSummaryAt(map, slot).pods, 0);
}

// The best route by pods, overall or (byLength) of each length: the RUN TALLY's near misses and 02 §4.5's statistics.
export function bestRoute(map: Readonly<RunMapState>): Route;
export function bestRoute(map: Readonly<RunMapState>, byLength: true): Map<number, Route>;
export function bestRoute(map: Readonly<RunMapState>, byLength = false): Route | Map<number, Route> {
  const all = routes(map);
  if (all.length === 0) throw new Error('bestRoute: the arm has no route to a final ship');
  if (!byLength) return all.reduce((best, route) => (routePods(map, route) > routePods(map, best) ? route : best));
  const out = new Map<number, Route>();
  for (const route of all) {
    const best = out.get(route.length);
    if (best === undefined || routePods(map, route) > routePods(map, best)) out.set(route.length, route);
  }
  return out;
}

// The fewest and most ships still to visit after `slot`, the final ship included (02 §3.6: the card's `4–6 MORE TO THE
// FINAL SHIP`); [0, 0] on a final ship.
export function shipsLeft(map: Readonly<RunMapState>, slot: number): [number, number] {
  if (isEndSlot(map, slot)) return [0, 0];
  const lengths = routes(map, slot).map((route) => route.length - 1);
  if (lengths.length === 0) throw new Error(`shipsLeft: no way on from slot ${slot}`);
  return [Math.min(...lengths), Math.max(...lengths)];
}

// A route's depth at its last ship (depth is the N-th ship visited, 02 §3.6).
export function depthOf(route: Route): number {
  return route.length;
}
