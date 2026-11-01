import type {
  MissionMeta, ClockState, BurnState, OrbitVecState, LevelState,
} from '@state/schema';
import type { ShipDef } from '@data/ships';
import type { Rng } from '@systems/rng';
import type { Zone } from '@/types/zone';
import { presetHeading } from '@systems/attitude';
import { stateFromElements, inboundAnomalyAtRadius } from '@/types/orbit';
import { unitName } from '@systems/say';
import { FLEET_ROUTE_LY } from '@data/tuning';

// Factories for the per-ship and per-run slices. Each call returns FRESH objects: nothing
// here is a shared constant that the live store could alias and mutate.

export interface FlightMods {
  dvBonusFrac: number;     // carried upgrades widen the Δv budget (WP8); 0 = stock
}

export interface FlightInit {
  level: LevelState;
  orbit: OrbitVecState;
  burn: BurnState;
}

// Places the ship on its arrival hyperbola and arms the engine. The hyperbola is fixed by
// the ship data: e = 1 + rp0·v∞²/μ, the ship sits at r0 on the INBOUND branch, and the
// whole conic is rotated by omega0. `rng` is the ship's flight stream; ship 1 has no seeded
// start variation, later ships draw from it. `mods` is required: a caller that forgot the carried
// upgrades (capabilities.ts flightModsOf) would drop FUEL TRIM without a sound. `zones` are the ship's hazard
// zones as this run resolved them (systems/zones.ts resolveZones; [] on a ship without any).
export function createFlight(ship: ShipDef, rng: Rng, mods: FlightMods, zones: readonly Zone[]): FlightInit {
  void rng;
  const { planet, ring, start } = ship.flight;
  const ecc = 1 + (start.rp0 * start.vInf * start.vInf) / planet.mu;
  const nu = inboundAnomalyAtRadius(start.rp0, ecc, start.r0);
  if (nu === null) throw new Error(`createFlight ${ship.id}: r0 ${start.r0} is not on the arrival hyperbola`);
  const orbit = stateFromElements(start.rp0, ecc, start.omega0, nu, planet.mu);

  const level: LevelState = {
    shipId: ship.id,
    shipName: ship.name,
    planet: { ...planet },
    ring: { ...ring },
    r0: start.r0,
    tacticalWarp: ship.flight.tacticalWarp,
    cruiseWarp: ship.flight.cruiseWarp,
    dvBudgetKmS: ship.flight.dvBudgetKmS * (1 + mods.dvBonusFrac),
    aNominalKmS2: ship.flight.aNominalKmS2,
    shrink: { ...ship.shrink },
    zones: structuredClone(zones),
    memoryClass: ship.memoryClass,
  };

  // The start preset is engaged and already aligned: the very first SPACE fires the right way.
  const burn: BurnState = {
    status: 'approaching',
    thrustPct: 100,
    heading: presetHeading(start.sas, orbit),
    omega: 0,
    rotInput: 0,
    sasMode: start.sas,
    firing: false,
    firingSource: null,
    firingFor: null,
    presetAligning: false,
    fuelPct: 100,
    dvDeliveredKmS: 0,
    lastTickDvKmS: 0,
    lockHoldAiSec: 0,
    closedIdleAiSec: 0,
    missedIdleTac: 0,
    acceptOnly: false,
    thrustTac: 0,
    coastAtAi: null,
    ghost: null,
    ghostBursts: 0,
    auto: { phase: 'idle', atAi: 0, end: null },
  };

  return { level, orbit: { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }, burn };
}

// `unitNumber` and `wave` are the run's (RunState): UNIT-047 on wave 1.
export function createMissionMeta(ship: ShipDef, unitNumber: number, wave: number): MissionMeta {
  return {
    unitId: unitName(unitNumber),
    shipId: ship.name,
    destination: ship.world.toUpperCase(),
    distanceLy: FLEET_ROUTE_LY,
    transmissionNum: unitNumber,
    wave,
    // Counted from the ship's pods by createShipSlices (the drivers its memory was built with).
    colonists: 0,
  };
}

// The clock starts halted; the first tick's pace evaluation lifts it straight to the
// ship's tactical warp (a resume from 0 snaps), so the opening countdown is real seconds.
export function createClockState(): ClockState {
  return {
    tSec: 0,
    aiSec: 0,
    speed: 0,
    speedTarget: 0,
    paused: false,
    pace: 'tactical',
    overclock: false,
    skipWarp: null,
    skipEndTSec: null,
    skipWaypoint: null,
    debugWarp: null,
  };
}

