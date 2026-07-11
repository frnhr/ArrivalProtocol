import type { PlanetParams } from '@/types/orbit';
import type { ToolWindowId, SasMode } from '@state/schema';

// The run's levels. Each level is the next ship the AI is transmitted to; each unlocks
// a little more of the graphical UI as the AI "evolves". The polished window panels are
// re-earned here rather than present from the start. Progress is a single index persisted
// in sessionStorage so RETRANSMIT (a reload) advances on success and retries on failure.

export interface LevelApproach {
  rp: number;       // periapsis radius (km)
  e: number;        // eccentricity (<1 ellipse = already captured; >1 hyperbola = flyby)
  omega: number;    // argument of periapsis (rad) — rotates the conic
  startR: number;   // radius the ship coasts in from (km); nu is derived to place it there
}

export interface LevelDef {
  tier: number;
  phaseLabel: string;           // header crumb + burn-status prefix
  windows: ToolWindowId[];      // graphical panels unlocked this level ([] = pure terminal)
  sasModes: SasMode[];
  planet: PlanetParams;
  approach: LevelApproach;
  thrustForce: number;          // engine authority (max accel = thrustForce / trueMass)
  massEstMt: number;
  massPmMt: number;             // hidden-mass uncertainty (±)
  sensorConfPct: number;        // seed sensor confidence (also derived live from Sensor Interp)
  fuelPct: number;
  health: Record<string, number>;  // per-file integrity overrides for createInitialMemory
  mission: {
    unitId: string; shipId: string; sector: string; destination: string;
    distanceLy: number; transmissionNum: number; souls: number;
  };
  evolvedNote?: string;         // printed by the terminal + shown as a toast on arrival
}

const PLANET: PlanetParams = { R: 3390, rAtm: 3800, rMin: 5000, rMax: 7000, mu: 43000 };
const ALL_SAS: SasMode[] = ['hold', 'prograde', 'retrograde', 'radial-in', 'radial-out'];

// Gentle-ellipse approach: periapsis pre-placed mid-band, apoapsis just above it — a single
// retrograde trim burn drops the apoapsis into the band. Used for the trivially-easy early
// insertions the design calls for.
const easyApproach = (apo: number): LevelApproach => ({
  rp: 5900, e: (apo - 5900) / (apo + 5900), omega: -0.6, startR: Math.min(apo - 500, 11_000),
});

export const LEVELS: LevelDef[] = [
  {
    // ── Insertion 1 · Tier 1 KERNEL — pure terminal, no windows ──
    tier: 1, phaseLabel: 'BRAKING APPROACH', windows: [], sasModes: ALL_SAS, planet: PLANET,
    approach: easyApproach(12_000),
    thrustForce: 0.16, massEstMt: 8.2, massPmMt: 0.15, sensorConfPct: 95, fuelPct: 100,
    health: { engine: 100, thrust: 100, sensint: 100 },
    mission: { unitId: 'UNIT-047', shipId: 'ARES-VII', sector: 'SECTOR 03', destination: 'KEPLER-186', distanceLy: 581, transmissionNum: 47, souls: 2400 },
  },
  {
    // ── Insertion 2 · Tier 2 SIGHT — the NAV PLOT window is re-earned ──
    // Still a single easy trim burn (insertion #2 must stay easy); the NEW thing is that
    // you can now SEE the orbit. Sensor Interp arrives at 78% so the plot's uncertainty
    // band is visibly present — the first hint of the sensor mechanic to come.
    tier: 2, phaseLabel: 'ORBITAL INSERTION', windows: ['navplot'], sasModes: ALL_SAS, planet: PLANET,
    approach: easyApproach(13_500),
    thrustForce: 0.14, massEstMt: 8.4, massPmMt: 0.2, sensorConfPct: 78, fuelPct: 100,
    health: { engine: 100, thrust: 100 },   // sensint left at the template's 78%
    mission: { unitId: 'UNIT-047', shipId: 'MERIDIAN-4', sector: 'SECTOR 05', destination: 'GLIESE-667', distanceLy: 743, transmissionNum: 48, souls: 3100 },
    evolvedNote: 'trajectory visualizer compiled from flight logs — NAV PLOT online',
  },
];

// ── progression (sessionStorage-backed, cached per page load) ──
const LS_KEY = 'ap_levelIndex';
let cachedIndex: number | null = null;

export function currentLevelIndex(): number {
  if (cachedIndex !== null) return cachedIndex;
  let n = 0;
  try { n = parseInt(sessionStorage.getItem(LS_KEY) ?? '0', 10) || 0; } catch { /* no storage */ }
  cachedIndex = Math.max(0, Math.min(LEVELS.length - 1, n));
  return cachedIndex;
}

export function currentLevel(): LevelDef {
  return LEVELS[currentLevelIndex()]!;
}

// Advance to the next level (clamped at the last). Called on a successful insertion, before
// the RETRANSMIT reload re-seeds the store into the new level.
export function advanceLevel(): void {
  const next = Math.min(LEVELS.length - 1, currentLevelIndex() + 1);
  cachedIndex = next;
  try { sessionStorage.setItem(LS_KEY, String(next)); } catch { /* no storage */ }
}

export function resetProgress(): void {
  cachedIndex = 0;
  try { sessionStorage.setItem(LS_KEY, '0'); } catch { /* no storage */ }
}
