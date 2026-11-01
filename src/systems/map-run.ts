import type { GameState } from '@state/schema';
import type { ShipDef } from '@data/ships';
import type { Hop, RouteStop, RunMapState } from '@/types/map';
import type { LinkNoise } from '@/types/threat';
import { CLASSIC_FIVE, CLASSIC_HOPS, CLASSIC_FACTS, classicShip } from '@data/classic-five';
import { layoutFor } from '@data/memory';
import { RUN_START_YEAR } from '@data/tuning';
import { currentSlot, armShipAt } from '@systems/map-streams';

export {
  currentStop, currentSlot, armShipAt, shipKeyOf, keyRng, shipRng, visitRng, hopRng,
} from '@systems/map-streams';

// The run on its map (phase 3 slice 3a, slice-3a-plan §2.2, §2.5): which ship the unit is on and how a ship's ShipDef is
// found (the route position and the random streams live in systems/map-streams.ts, re-exported here). Every read that
// means "which ship" goes through currentShip(state) or shipDefAt(map, slot), never an index into a fleet: on the arm the
// route's position (run.shipIndex = depth − 1) and the ship's slot differ. Each function switches on run.map.world once;
// the classic world (data/classic-five.ts) is slot = index with today's rng keys, so its suites stay bit-identical.
// Track GEN owns this file after the foundation (createRunMap, the arm's shipDefAt).

// --- The classic world --------------------------------------------------------------------------------------------------

// The beam's noise into a classic ship, from its threat facts (the hop's own field; the facts drive the seeds).
function classicNoise(slot: number): LinkNoise {
  const seeds = CLASSIC_FACTS[slot]!.beamSeeds;
  if (seeds.kind === 'none') return 0;
  return seeds.kind === 'noise' ? seeds.noise : seeds.later;
}

// The one hop into classic ship `to` (from the ship before it: the classic world has one route). Its years are fixture
// years: the unit arrives as the ship does (no slack, so no ECC), so the suites' hits are phase 2's.
export function classicHop(from: number, to: number, leaveYear: number): Hop {
  const def = CLASSIC_HOPS[to];
  if (from !== to - 1 || !def) throw new Error(`classicHop: the classic world has no hop ${from} → ${to}`);
  const layout = layoutFor(classicShip(to).memoryClass);
  const arriveYear = leaveYear + def.distanceLy;
  return {
    from, to, distanceLy: def.distanceLy, linkBlocks: def.linkBlocks, transitHits: def.transitHits, eccFixes: 0,
    leaveYear, arriveYear, approachYear: arriveYear, slackYears: 0, noise: classicNoise(to),
    memoryClass: layout.cls, room: layout.roomForUnit, chargeFloor: layout.chargeFloor,
  };
}

// The classic route to ship `index`: every ship before it, in order (slot = index, depth = index + 1).
export function classicRoute(index: number, startYear: number = RUN_START_YEAR): RouteStop[] {
  if (!(Number.isInteger(index) && index >= 0 && index < CLASSIC_FIVE.length)) throw new Error(`classicRoute: no classic ship ${index}`);
  const route: RouteStop[] = [{ slot: 0, depth: 1, hop: null }];
  let year = startYear;
  for (let slot = 1; slot <= index; slot++) {
    const hop = classicHop(slot - 1, slot, year);
    year = hop.approachYear;
    route.push({ slot, depth: slot + 1, hop });
  }
  return route;
}

// The classic world's map with the unit on ship `shipIndex`. `run` is the run number (the lineage's wave).
export function classicRunMap(seed: number, shipIndex: number, run: number): RunMapState {
  const route = classicRoute(shipIndex);
  return {
    world: 'classic', run, armSeed: seed >>> 0, startYear: RUN_START_YEAR, arm: [], noise: [], route,
    galaxyYear: route.at(-1)!.hop?.approachYear ?? RUN_START_YEAR, pendingExtra: null,
  };
}

// --- Where the unit is -------------------------------------------------------------------------------------------------

// The map with the unit arriving on `slot` by `hop` (startShip). The classic world's route is fixed, so a jump
// (__ap.ship) lands on that ship's whole route; on the arm the stop is pushed onto the route.
export function mapAtShip(map: Readonly<RunMapState>, slot: number, hop: Hop | null): RunMapState {
  if (map.world === 'classic') {
    const route = classicRoute(slot, map.startYear);
    return { ...structuredClone(map) as RunMapState, route, galaxyYear: route.at(-1)!.hop?.approachYear ?? map.startYear, pendingExtra: null };
  }
  if (hop === null || hop.to !== slot) throw new Error(`mapAtShip: the arm needs the hop that reaches slot ${slot}`);
  const next = structuredClone(map) as RunMapState;
  next.route.push({ slot, depth: map.route.length + 1, hop });
  next.galaxyYear = hop.approachYear;
  next.pendingExtra = null;
  return next;
}

// The map with the unit back on the route's first ship (the run-1 simulation retry: ship 1 again, as the run began it).
export function mapAtFirstShip(map: Readonly<RunMapState>): RunMapState {
  const next = structuredClone(map) as RunMapState;
  next.route = next.route.slice(0, 1);
  next.galaxyYear = map.startYear;
  next.pendingExtra = null;
  return next;
}

// --- Which ship ---------------------------------------------------------------------------------------------------------

// The ShipDef in `slot`: the classic five by index; on the arm, the ship built from its ArmShip (data/ships.ts shipDefOf,
// pure and memoized: Track GEN).
export function shipDefAt(map: Readonly<RunMapState>, slot: number): ShipDef {
  if (map.world === 'classic') return classicShip(slot);
  armShipAt(map, slot);
  throw new Error('TODO(3a-GEN): shipDefAt on the arm (data/ships.ts shipDefOf)');
}

// The ship being flown.
export function currentShip(state: Readonly<Pick<GameState, 'run'>>): ShipDef {
  return shipDefAt(state.run.map, currentSlot(state.run));
}

// Every ship the run counts as its fleet (RUN END's rows, the colonists it could have landed, PURGE's `n OF m SHIPS`):
// the classic world's five (phase 2's whole fleet, NOT REACHED rows included); on the arm, the ships visited (02 §4: the
// RUN TALLY has a row per visited ship; Track DESK owns the tally).
export function fleetOf(map: Readonly<RunMapState>): readonly ShipDef[] {
  if (map.world === 'classic') return CLASSIC_FIVE;
  return map.route.map((stop) => shipDefAt(map, stop.slot));
}

