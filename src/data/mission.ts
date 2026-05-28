import type { MissionMeta, TelemetryState, ClockState, AiState, BurnState } from '@state/schema';

export const INITIAL_MISSION: MissionMeta = {
  unitId: 'UNIT-047',
  shipId: 'ARES-VII',
  sector: 'SECTOR 03',
  destination: 'KEPLER-186',
  distanceLy: 581,
  transmissionNum: 47,
  souls: 2400,
};

export const INITIAL_TELEMETRY: TelemetryState = {
  velocity: 47.382,
  distance: 8_247_032,
  etaHrs: 174.2,
  fuelPct: 87,
  massEstMt: 8.2,
  massPmMt: 0.3,
  sensorConfPct: 62,
};

export const INITIAL_CLOCK: ClockState = {
  tSec: 14 * 3600 + 23 * 60 + 47,    // T+ 14:23:47
  speed: 1,
};

export const INITIAL_AI: AiState = {
  coreIntegrity: 100,
  uptimeSec: 0,
};

// Burn tuning. At 100% thrust the achievable decel is ~25% above what's needed
// to stop exactly at arrival, so full thrust overshoots into an undershoot
// (stops short) and a steady ~74% lands in the window — leaving margin both
// ways. THRUST_MAX_KN is force at 100%; decel = THRUST_MAX_KN * frac / trueMass.
const THRUST_MAX_KN = 0.0015;
// Fuel drain per game-second at 100% thrust. A full-thrust journey spends most
// of the tank but doesn't deplete it — fuel isn't a terminal condition yet.
const FUEL_RATE = 0.0002;
const TARGET_VEL_MIN = 0.5;   // km/s — safe arrival window
const TARGET_VEL_MAX = 2.0;

export const FUEL_BURN_RATE = FUEL_RATE;

export function seedBurn(): BurnState {
  const { massEstMt, massPmMt } = INITIAL_TELEMETRY;
  const trueMassMt = massEstMt + (Math.random() * 2 - 1) * massPmMt;
  return {
    thrustPct: 0,
    trueMassMt,
    thrustMaxKN: THRUST_MAX_KN,
    targetVelMin: TARGET_VEL_MIN,
    targetVelMax: TARGET_VEL_MAX,
    status: 'approaching',
  };
}
