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
  {
    // ── Insertion 3 · Tier 3 — the Telemetry gauge unlocks AND the terminal surface
    // arrives damaged: the "terminal gets realistic" beat. The ASSISTANT file (55%) drops
    // its panel into SAFE MODE and makes its typing clumsy; the TERMINAL parser (75%)
    // occasionally garbles even hand-typed commands. The flight is still a forgiving
    // single burn — the challenge is the unreliable surface, and both files can be
    // repaired in MEMORY to steady it. ──
    tier: 3, phaseLabel: 'ORBITAL INSERTION', windows: ['navplot', 'telemetry'], sasModes: ALL_SAS, planet: PLANET,
    approach: easyApproach(14_000),
    thrustForce: 0.13, massEstMt: 8.6, massPmMt: 0.25, sensorConfPct: 70, fuelPct: 100,
    health: { engine: 100, thrust: 100, sensint: 70, termcore: 75, assist: 55 },
    mission: { unitId: 'UNIT-047', shipId: 'HALCYON-2', sector: 'SECTOR 09', destination: 'TRAPPIST-1', distanceLy: 1204, transmissionNum: 49, souls: 2750 },
    evolvedNote: 'sensor-fusion console reconstructed — TELEMETRY gauge online',
  },
];

// ── progression ──
// The level index is carried in BOTH the URL hash (`#lvl=N`) and sessionStorage. RETRANSMIT
// is a full page reload, which preserves the hash — so the hash is the robust transport that
// still works when storage is blocked (private windows, partitioned iframes); storage is a
// nicety on top. Cached per page load so every module-load seed reads the same value.
const LS_KEY = 'ap_levelIndex';
const EVOLVED_KEY = 'ap_evolvedMax';
let cachedIndex: number | null = null;

function readHashNum(key: string): number | null {
  try {
    const m = new RegExp(`(?:^|[#&])${key}=(\\d+)`).exec(location.hash);
    return m ? parseInt(m[1]!, 10) : null;
  } catch { return null; }
}
function writeHashNum(key: string, val: number): void {
  try {
    const cleaned = location.hash.replace(new RegExp(`(?:^|[#&])${key}=\\d+`), '').replace(/^#/, '');
    const parts = cleaned ? cleaned.split('&').filter(Boolean) : [];
    parts.push(`${key}=${val}`);
    location.hash = parts.join('&');
  } catch { /* no location */ }
}

export function currentLevelIndex(): number {
  if (cachedIndex !== null) return cachedIndex;
  let n = readHashNum('lvl');
  if (n === null) { try { n = parseInt(sessionStorage.getItem(LS_KEY) ?? '0', 10) || 0; } catch { n = 0; } }
  cachedIndex = Math.max(0, Math.min(LEVELS.length - 1, n));
  return cachedIndex;
}

export function currentLevel(): LevelDef {
  return LEVELS[currentLevelIndex()]!;
}

export function isLastLevel(): boolean {
  return currentLevelIndex() >= LEVELS.length - 1;
}

// Advance to the next level (clamped at the last). Called on a successful insertion, before
// the RETRANSMIT reload re-seeds the store into the new level.
export function advanceLevel(): void {
  const next = Math.min(LEVELS.length - 1, currentLevelIndex() + 1);
  cachedIndex = next;
  try { sessionStorage.setItem(LS_KEY, String(next)); } catch { /* no storage */ }
  writeHashNum('lvl', next);
}

// True only the FIRST time the run reaches `index` — so the EVOLVED beat fires on arrival
// but not on every retry of that level. Best-effort via storage + hash; if neither persists,
// degrades to re-firing (harmless).
export function isFreshArrival(index: number): boolean {
  let max = -1;
  try { max = parseInt(sessionStorage.getItem(EVOLVED_KEY) ?? '-1', 10); } catch { /* no storage */ }
  const hashMax = readHashNum('evo');
  if (hashMax !== null) max = Math.max(max, hashMax);
  if (index > max) {
    try { sessionStorage.setItem(EVOLVED_KEY, String(index)); } catch { /* no storage */ }
    writeHashNum('evo', index);
    return true;
  }
  return false;
}

export function resetProgress(): void {
  cachedIndex = 0;
  try { sessionStorage.setItem(LS_KEY, '0'); sessionStorage.removeItem(EVOLVED_KEY); } catch { /* no storage */ }
  writeHashNum('lvl', 0);
}
