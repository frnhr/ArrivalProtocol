import type { ArrivalDamage } from '@data/ships';
import type { ShipLandingDef } from '@/types/landing';
import type { PodRackName } from '@/types/map';

// THE AUTHORED FIVE's written blocks (Track RETIRE, slice-4cde-plan §9.2 phase 1): the parts of ARES-VII, HALCYON, KESTREL,
// VESPER and LAST LIGHT that run 1's arm writes as they are (data/run1-arm.ts RUN1_AUTHORED), and that were read from the
// classic five until the retirement. Phase 2's ships, written once, here; data/classic-five.ts imports them back, so the
// classic five stay byte-identical while the suites still fly them. Data only: no system, no load-time check.

// ARES-VII, Kepler-186f: one WIDE site for 3 pods on a GENTLE plain. LZ-A at 160° places the first window about 1–4 minutes
// of TACTICAL after a typical lock near ▼ (ω ≈ −34°, the dot about 80° ahead), the spec's `LZ-A in 3:40`.
export const ARES_VII_LANDING: ShipLandingDef = {
  lzs: [{ label: 'LZ-A', centreDeg: 160, width: 'wide', pods: 3 }],
  forgiveness: 'gentle',
  terrain: 'PLAINS',
  noGo: [],
  colonyFirstRun: 'RIVERSIDE',
  drag: false,
};
// POD 01 OKAFOR is Ada's family, first in the credits.
export const ARES_VII_LEAD = 1;

// HALCYON: Sensor Interp arrives at 62 at most (ship 2's lesson, slice-2-plan risk 10: a degraded sensor widens the dot,
// and LZ-B's STANDARD bracket shows it).
export const HALCYON_ARRIVAL: readonly ArrivalDamage[] = [{ role: 'sensor', maxIntegrity: 62 }];

// KESTREL: the unit arrives with Sensor Interp at 45% (PATH UNCERTAIN: a grey band and `HIT?`), so the first move is a
// REPAIR.
export const KESTREL_ARRIVAL: readonly ArrivalDamage[] = [{ role: 'sensor', maxIntegrity: 45 }];

// VESPER: the ship's own Thrust Ctrl arrives at 31% (failing, hidden until scanned): the engine fires by itself (ENGINE
// FAULT).
export const VESPER_ARRIVAL: readonly ArrivalDamage[] = [{ role: 'thrust-ctrl', maxIntegrity: 31 }];

// VESPER, Cinder: ROUGH volcanic ground, three sites (the NARROW LZ takes the smallest count, §3.15). Two lava no-go arcs on
// the dot's path (slice 1b, plan §2.1): 5° at 187.4°, 90 km past LZ-B's edge (a late launch or a wide dot), and 6° at
// 293.4°, 88 km before NARROW LZ-C (an early one). A healthy sure launch at 6,000 km (±78 km) never reaches them; a
// degraded Sensor Interp (±117 km) or a failing driver does: §3.6's "a wide dot is a real risk". The pod counts are phase
// 2's 5 · 4 · 3 (12 pods); run 1's arm VESPER, an ark of 16, splits them 6 · 5 · 5 at the same centres (data/run1-arm.ts).
export const VESPER_LANDING: ShipLandingDef = {
  lzs: [
    { label: 'LZ-A', centreDeg: 60, width: 'standard', pods: 5 },
    { label: 'LZ-B', centreDeg: 180, width: 'standard', pods: 4 },
    { label: 'LZ-C', centreDeg: 300, width: 'narrow', pods: 3 },
  ],
  forgiveness: 'rough',
  terrain: 'VOLCANIC',
  noGo: [{ centreDeg: 187.4, widthDeg: 5, word: 'LAVA' }, { centreDeg: 293.4, widthDeg: 6, word: 'LAVA' }],
  colonyFirstRun: null,
  drag: true,
};

// LAST LIGHT, New Haven: GENTLE plains, the final ship's 16 pods over four sites, STANDARD ×3 and NARROW ×1 (§3.15's layer
// 8). The tutorial run calls its colony FIRST LIGHT. Its cliffs (slice 1b, plan §2.1): 6° at 286.6°, 88 km past NARROW
// LZ-D's edge, so the guard reads `LAUNCH INTO CLIFFS? scores 0`.
export const LAST_LIGHT_LANDING: ShipLandingDef = {
  lzs: [
    { label: 'LZ-A', centreDeg: 10, width: 'standard', pods: 4 },
    { label: 'LZ-B', centreDeg: 100, width: 'standard', pods: 4 },
    { label: 'LZ-C', centreDeg: 190, width: 'standard', pods: 4 },
    { label: 'LZ-D', centreDeg: 280, width: 'narrow', pods: 4 },
  ],
  forgiveness: 'gentle',
  terrain: 'PLAINS',
  noGo: [{ centreDeg: 286.6, widthDeg: 6, word: 'CLIFFS' }],
  colonyFirstRun: 'FIRST LIGHT',
  drag: true,
};

// 01-landing §3.16's final-ship layout: sixteen pods, seven in rack B (the belt hits A–B), the root slot `S` in rack C
// between POD 11 (a 2-block GAP) and POD 12 (a 1-block GAP, bitten first), and four in rack D with its last 32 blocks
// free. The slot's rack ends in 21 free: the 16-block root takes its blocks off that tail (5 left), and slice 7's 18-block
// MERGE root still fits (FINAL_ROOT_MAX_BLOCKS). POD 12 leads the credits.
export const LAST_LIGHT_POD_RACKS: Readonly<Partial<Record<PodRackName, string>>> = {
  B: 'P P P P P P P _8', C: 'P P P P _2 S _1 P _21', D: 'P P P P _32',
};
export const LAST_LIGHT_LEAD = 12;
