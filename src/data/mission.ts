import type {
  MissionMeta, TelemetryState, ClockState, AiState,
  BurnState, OrbitVecState, LevelState,
} from '@state/schema';
import { stateFromElements, type OrbitState } from '@/types/orbit';
import { currentLevel, currentLevelIndex } from '@data/levels';

// Everything below is seeded from the CURRENT level (levels.ts, sessionStorage-backed).
// A RETRANSMIT reloads the page, so these module-load constants re-read the level that a
// successful insertion advanced to.
const LVL = currentLevel();

export const INITIAL_MISSION: MissionMeta = { ...LVL.mission };

// Mission clock at arrival. Kept as a named constant (not just the seed) because
// instance.ts hands INITIAL_CLOCK to the store BY REFERENCE — tSec mutates as the
// game runs — and the debrief needs the true start time to compute elapsed time.
export const MISSION_START_TSEC = 14 * 3600 + 23 * 60 + 47;    // T+ 14:23:47

export const INITIAL_CLOCK: ClockState = {
  tSec: MISSION_START_TSEC,
  // The run opens paused behind the briefing overlay; BEGIN APPROACH starts time.
  speed: 0,
  speedTarget: 0,
};

export const INITIAL_AI: AiState = {
  coreIntegrity: 100,
  uptimeSec: 0,
};

// --- Orbital insertion level (SI-ish units: km, km/s, μ in km³/s²) ---
// All geometry/engine constants come from the current level definition (levels.ts).
const PLANET = LVL.planet;
const E0 = LVL.approach.e;
const OMEGA0 = LVL.approach.omega;
const START_RADIUS = LVL.approach.startR;
const MASS_EST_MT = LVL.massEstMt;
const MASS_PM_MT = LVL.massPmMt;
const THRUST_FORCE = LVL.thrustForce;

// Fuel drain per game-second at full thrust. Running dry auto-commits the current orbit.
// Generous for now so the 2-axis flying can be learned without fuel frustration; tighten
// later so fuel + hidden mass become real constraints.
const FUEL_RATE = 0.005;
export const FUEL_BURN_RATE = FUEL_RATE;

const INITIAL_FUEL_PCT = LVL.fuelPct;
const INITIAL_SENSOR_CONF_PCT = LVL.sensorConfPct;

// Periapsis + the inbound true anomaly that places the ship at START_RADIUS on the conic
// (nu < 0 = approaching periapsis).
const SEED_RP = LVL.approach.rp;
const SEED_NU = -Math.acos(Math.max(-1, Math.min(1, ((SEED_RP * (1 + E0)) / START_RADIUS - 1) / E0)));

export function seedLevel(): LevelState {
  return {
    index: currentLevelIndex(),
    tier: LVL.tier,
    phaseLabel: LVL.phaseLabel,
    windows: [...LVL.windows],
    ...(LVL.evolvedNote ? { evolvedNote: LVL.evolvedNote } : {}),
    planet: { ...PLANET },
    sasModes: [...LVL.sasModes],
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
    status: 'briefing',
    // Overwritten with the live clock at BEGIN APPROACH; the seed only matters
    // if a future change lets time pass during the pre-commit hold.
    startedTSec: MISSION_START_TSEC,
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
