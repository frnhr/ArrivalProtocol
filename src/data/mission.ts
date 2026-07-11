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
// Mars-ish planet. The NAV PLOT renderer is scale-free, so we pick physical units so
// the HUD reads in real km/s and km with no conversion layer.
const PLANET: PlanetParams = { R: 3390, rAtm: 3800, rMin: 5000, rMax: 7000, mu: 43000 };

// LEVEL 1 (the terminal "kernel" tutorial): a deliberately trivial approach. The ship
// arrives already CAPTURED on a gentle ellipse whose PERIAPSIS sits mid-band (alt ~2,510
// km) with the APOAPSIS just above the band. A single retrograde burn at periapsis trims
// the apoapsis down into the band → whole orbit inside → INSERTED. Can't escape (already
// closed), can't easily crash (periapsis is in the band and `burn ... until band`
// auto-cuts at first band entry). One burn, fosuccess.
const RP0 = 5_900;             // periapsis radius — alt ~2,510 km, dead centre of the band
const APO0 = 12_000;           // apoapsis radius — above the band; the burn trims it in
const E0 = (APO0 - RP0) / (APO0 + RP0);   // ≈ 0.34, a gentle ellipse
const OMEGA0 = -0.6;
// Start the ship inbound near apoapsis so there's a coast to fast-forward (teaches `warp`)
// and time to point retrograde before periapsis.
const START_RADIUS = 11_000;

// Hidden mass: estimate ± uncertainty; true value seeded within the band, never rendered.
// Tight at level 1 so the trivial burn isn't thrown off — mass uncertainty is a later wrinkle.
const MASS_EST_MT = 8.2;
const MASS_PM_MT = 0.15;

// Engine: max accel = THRUST_FORCE / trueMassMt (km/s²). PUNCHY at level 1 so the single
// trim burn is a satisfying ~15-20 s at ×1, not a multi-minute hold. Higher tiers throttle
// this back down as approaches get harder.
const THRUST_FORCE = 0.16;

// Fuel drain per game-second at full thrust. Running dry auto-commits the current orbit.
// Generous for now so the 2-axis flying can be learned without fuel frustration; tighten
// later so fuel + hidden mass become real constraints.
const FUEL_RATE = 0.005;
export const FUEL_BURN_RATE = FUEL_RATE;

const INITIAL_FUEL_PCT = 100;
const INITIAL_SENSOR_CONF_PCT = 95;   // level 1: crisp sensors so the trivial burn reads clean

// Fixed periapsis + the inbound true anomaly that places the ship at START_RADIUS on the
// ellipse (nu < 0 = approaching periapsis). Deterministic at level 1 so the tutorial plays
// the same every time; later levels reintroduce per-run variation.
const SEED_RP = RP0;
const SEED_NU = -Math.acos(Math.max(-1, Math.min(1, ((SEED_RP * (1 + E0)) / START_RADIUS - 1) / E0)));

export function seedLevel(): LevelState {
  // Level 1 = evolution tier 1, the bare "kernel": pure terminal, NO graphical windows
  // (windows: []). You fly by typing; the finicky bridge panels are re-earned later.
  return {
    index: 0,
    tier: 1,
    phaseLabel: 'BRAKING APPROACH',
    windows: [],
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
