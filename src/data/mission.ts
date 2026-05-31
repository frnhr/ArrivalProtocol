import type {
  MissionMeta, TelemetryState, ClockState, AiState,
  BurnState, OrbitVecState, LevelState,
} from '@state/schema';
import { stateFromElements, type PlanetParams, type OrbitState } from '@/types/orbit';

export const INITIAL_MISSION: MissionMeta = {
  unitId: 'UNIT-047',
  shipId: 'ARES-VII',
  sector: 'SECTOR 03',
  destination: 'KEPLER-186',
  distanceLy: 581,
  transmissionNum: 47,
  souls: 2400,
};

export const INITIAL_CLOCK: ClockState = {
  tSec: 14 * 3600 + 23 * 60 + 47,    // T+ 14:23:47
  speed: 1,
  speedTarget: 1,
};

export const INITIAL_AI: AiState = {
  coreIntegrity: 100,
  uptimeSec: 0,
};

// --- Orbital insertion level (SI-ish units: km, km/s, μ in km³/s²) ---
// Mars-ish planet. The NAV PLOT renderer is scale-free, so we pick physical units so
// the HUD reads in real km/s and km with no conversion layer.
const PLANET: PlanetParams = { R: 3390, rAtm: 3800, rMin: 5000, rMax: 7000, mu: 43000 };

// Incoming hyperbola (e > 1). The periapsis arrives FAR ABOVE the band — a large miss,
// randomized each run — so the opening move is to steer it down toward the band, then
// brake/shape and commit when the whole orbit sits in the band.
const E0 = 1.6;
const OMEGA0 = -0.6;
const RP_SEED_MIN = 250_000;
const RP_SEED_MAX = 400_000;
// Starting distance from the planet (the ship coasts in from here).
const START_RADIUS = 778_000;

// Hidden mass: the estimate ± uncertainty shown to the player; true value seeded within
// the band and never rendered. With the narrow "whole orbit in band" target, this
// ±3.7% meaningfully shifts the burn the player needs.
const MASS_EST_MT = 8.2;
const MASS_PM_MT = 0.3;

// Engine: max accel = THRUST_FORCE / trueMassMt (km/s²); the main throttle scales thrust
// along the ship heading within that. Enough authority to steer a large miss in over the
// long approach, still controllable near periapsis at low throttle / low time-compression.
const THRUST_FORCE = 0.03;

// Fuel drain per game-second at full thrust. Running dry auto-commits the current orbit.
// Generous for now so the 2-axis flying can be learned without fuel frustration; tighten
// later so fuel + hidden mass become real constraints.
const FUEL_RATE = 0.005;
export const FUEL_BURN_RATE = FUEL_RATE;

const INITIAL_FUEL_PCT = 100;
const INITIAL_SENSOR_CONF_PCT = 62;

// Randomized incoming periapsis + the inbound true anomaly that places the ship at
// START_RADIUS on that hyperbola. Computed once per load so seedOrbit and
// INITIAL_TELEMETRY agree; a reload (Retransmit) reseeds for a fresh approach.
const SEED_RP = RP_SEED_MIN + Math.random() * (RP_SEED_MAX - RP_SEED_MIN);
const SEED_NU = -Math.acos(Math.max(-1, Math.min(1, ((SEED_RP * (1 + E0)) / START_RADIUS - 1) / E0)));

export function seedLevel(): LevelState {
  // All attitude helpers unlocked for now; gate per level / engine version later.
  return {
    planet: { ...PLANET },
    sasModes: ['hold', 'prograde', 'retrograde', 'radial-in', 'radial-out'],
  };
}

export function seedOrbit(): OrbitVecState {
  const state = seedState();
  return { ...state, tToPeriHrs: estTimeToPeriHrs(state, SEED_RP) };
}

export function seedBurn(): BurnState {
  const trueMassMt = MASS_EST_MT + (Math.random() * 2 - 1) * MASS_PM_MT;
  const s = seedState();
  const heading = Math.atan2(s.vy, s.vx); // start pointing prograde
  return {
    thrustPct: 0,
    heading,
    omega: 0,
    rotInput: 0,
    sasMode: 'off',
    holdTarget: heading,
    trueMassMt,
    thrustForce: THRUST_FORCE,
    status: 'approaching',
  };
}

// Derived from the seed orbit so the pre-run HUD matches the plot — no jump on tick 1.
export const INITIAL_TELEMETRY: TelemetryState = buildInitialTelemetry();

function seedState(): OrbitState {
  return stateFromElements(SEED_RP, E0, OMEGA0, SEED_NU, PLANET.mu);
}

function buildInitialTelemetry(): TelemetryState {
  const state = seedState();
  const r = Math.hypot(state.x, state.y);
  return {
    velocity: Math.hypot(state.vx, state.vy),
    distance: Math.max(0, r - PLANET.R),
    etaHrs: estTimeToPeriHrs(state, SEED_RP),
    fuelPct: INITIAL_FUEL_PCT,
    massEstMt: MASS_EST_MT,
    massPmMt: MASS_PM_MT,
    sensorConfPct: INITIAL_SENSOR_CONF_PCT,
  };
}

// Cheap time-to-periapsis (the same estimate the sim paints): radial distance to
// periapsis over radial speed. Infinity while receding.
function estTimeToPeriHrs(state: OrbitState, rp: number): number {
  const r = Math.hypot(state.x, state.y);
  const rDotV = state.x * state.vx + state.y * state.vy;
  if (rDotV >= 0) return Infinity;
  const vRadial = Math.abs(rDotV) / r;
  return (r - rp) / Math.max(vRadial, 1e-9) / 3600;
}
