import type { ShipResult } from '@state/schema';
import type { CycleEarning } from '@/types/skill';
import { CYCLES_ARRIVED, CYCLES_LANDED_STEPS } from '@data/tuning';

// The run's two totals (§4.4, 01-landing §3.9), from its finished ships. Apart from run.ts so the archive
// (systems/meta.ts), which run.ts calls at RUN END, can read them without importing the phase machine back.

// The run's SCORE: the sum of every ship's landing points (200 per colonist pod landed soft in an LZ with room, less
// for mislanded, hard or off-site pods, nothing for parked ones).
export function runScore(ships: readonly ShipResult[]): number {
  return ships.reduce((sum, ship) => sum + ship.points, 0);
}

// LANDED: the colonists who came down in an LZ with room, soft or hard (each ship's headline, landedInLz).
export function runLanded(ships: readonly ShipResult[]): number {
  return ships.reduce((sum, ship) => sum + ship.landedInLz, 0);
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

// A ship's training cycles (phase 3 slice 4, 03 §3.1): ARRIVED +1 always, LANDED +1 for every full CYCLES_PER_STEP_PCT of
// Q = points ÷ colonists aboard (0..1: a pod of 200 landed soft in an LZ with room is 200 points), so 1 + floor(5 × Q). The
// epsilon keeps a share that is a whole step in decimal (0.6 × 5 = 2.999…) on its step. `pct` is Q as the LANDING
// REPORT's line names it (`LANDED 83% +4`). A ship with nobody aboard is a bug (every ship carries pods): throws.
export function shipCycles(result: Readonly<Pick<ShipResult, 'slot' | 'points' | 'colonistsAboard'>>): CycleEarning {
  if (!(result.colonistsAboard > 0)) throw new Error(`shipCycles: slot ${result.slot} has ${result.colonistsAboard} colonists aboard`);
  const q = result.points / result.colonistsAboard;
  if (!(q >= 0 && q <= 1 + 1e-9)) throw new Error(`shipCycles: slot ${result.slot} scored ${result.points} of ${result.colonistsAboard}`);
  const landed = Math.max(0, Math.min(CYCLES_LANDED_STEPS, Math.floor(CYCLES_LANDED_STEPS * q + 1e-9)));
  return { slot: result.slot, arrived: CYCLES_ARRIVED, landed, pct: Math.round(100 * q) };
}
