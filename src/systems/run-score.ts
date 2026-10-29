import type { ShipResult } from '@state/schema';

// The run's two totals (§4.4, 01-landing §3.9), from its finished ships. Apart from run.ts so the archive
// (systems/meta.ts), which run.ts calls at RUN END, can read them without importing the phase machine back.

// The run's SCORE: the sum of every ship's landing points (200 per colonist pod landed soft in an LZ with room, less
// for mislanded, hard or off-site pods, nothing for parked ones).
export function runScore(ships: readonly ShipResult[]): number {
  return ships.reduce((sum, ship) => sum + ship.points, 0);
}

// LANDED: the colonists who came down in an LZ with room, soft or hard (each ship's headline, landedOnTarget).
export function runLanded(ships: readonly ShipResult[]): number {
  return ships.reduce((sum, ship) => sum + ship.landedOnTarget, 0);
}

// The ships of the fleet that reached orbit (ORBIT LOCKED or ACCEPTED: their pods could land), each counted once, out
// of the whole fleet (WP11 part 2, the lead's note): PURGE says `the fleet is home` only when every ship made it, and
// otherwise how many did. `inOrbitNow` is a ship in orbit whose result is not recorded yet (the flagship while it lands:
// its typed ending comes before its LANDING REPORT).
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
