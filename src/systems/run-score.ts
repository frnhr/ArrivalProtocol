import type { ShipResult } from '@state/schema';
import { WOKE_WITH_GAPS_SCORE } from '@data/tuning';

// The run's two totals (§4.4), from its finished ships. Apart from run.ts so the archive (systems/meta.ts),
// which run.ts calls at RUN END, can read them without importing the phase machine back.

// The run's SCORE (§4.4, the lead's rule: shown only on RUN END, labelled as a score): souls that woke
// intact count 1, with missing memories 0.5.
export function runScore(ships: readonly ShipResult[]): number {
  return ships.reduce((sum, ship) => sum + (ship.woke - ship.half) + ship.half * WOKE_WITH_GAPS_SCORE, 0);
}

// WOKE counts heads (the lead's rule): everyone who woke, intact or with missing memories.
export function runWoke(ships: readonly ShipResult[]): number {
  return ships.reduce((sum, ship) => sum + ship.woke, 0);
}

// The ships of the fleet that reached orbit (ORBIT LOCKED or ACCEPTED: their colonists could be printed), each counted
// once, out of the whole fleet (WP11 part 2, the lead's note): PURGE says `the fleet is home` only when every ship made
// it, and otherwise how many did. `inOrbitNow` is a ship in orbit whose result is not recorded yet (the flagship while
// it prints: its typed ending comes before its WAKE REPORT).
export interface FleetHome {
  home: number;
  total: number;
  all: boolean;
}

export function fleetHome(ships: readonly ShipResult[], fleetSize: number, inOrbitNow: string | null = null): FleetHome {
  const home = new Set(ships.filter((ship) => ship.outcome === 'locked' || ship.outcome === 'partial').map((ship) => ship.shipId));
  if (inOrbitNow !== null) home.add(inOrbitNow);
  return { home: home.size, total: fleetSize, all: home.size >= fleetSize };
}
