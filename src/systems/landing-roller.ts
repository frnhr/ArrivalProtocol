import type { ShipKey } from '@/types/map';
import type { ShipLandingDef, LzDef, LzWidth, ForgivenessClass, TerrainWord, NoGoArcDef } from '@/types/landing';
import type { AuthoredOverride } from '@data/run1-arm';
import type { Rng } from '@systems/rng';
import { keyRng } from '@systems/map-streams';
import { validateLandingDef } from '@data/landing-def';
import { FLIGHT_TEMPLATES } from '@data/flight-templates';
import {
  PODS_MAX, LZ_WIDTH_KM, LZ_CENTRE_JITTER_DEG, NO_GO_WIDTH_MIN_DEG, NO_GO_WIDTH_MAX_DEG, NO_GO_EDGE_GAP_MIN_KM,
  NO_GO_EDGE_GAP_MAX_KM, POOR_SITE_ODDS_LAYER5, POOR_SITE_ODDS_LATE,
} from '@data/tuning';
import { LAYER_COUNT } from '@data/arm';

// 01-landing §3.15's roller (slice-3a-plan §1.1 item 11, §2.1): one ship's landing from its ShipKey's 'landing' stream
// (risk 9: 02's key, so a waiting ship lands the same next run): the LZs and their counts (an uneven split 1 in 2 from
// layer 2), widths, the forgiveness class and terrain word, no-go arcs by layer (within 150 km of a bracket edge), POOR
// site data (rolled and stored; it plays GOOD until slice 6), and drag. It reuses data/landing-def.ts validateLandingDef.
// Driver arrival damage stays data/driver-damage.ts's (by layer). Track GEN owns this file after the foundation.
//
// The layer table (01 §3.15), as rolled here:
//   layer 1     1 LZ (3 pods: ARES-n), WIDE, GENTLE, no arcs, drag off
//   layers 2–3  LZ-A WIDE, the rest STANDARD, the last NARROW 1 in 2; GENTLE 2/3, ROUGH 1/3; arcs 0 (layer 3: 0–1)
//   layers 4–5  STANDARD, the last NARROW; each class 1/3; 1 arc; POOR 1 in 3 from layer 5
//   layers 6–7  widths rolled, at least one STANDARD; each class 1/3; arcs 1–2 (layer 7: 2); POOR 1 in 2
//   layer 8     STANDARD ×3, NARROW ×1, GENTLE, 1 arc (New Haven's row; the generator places LAST LIGHT's written one)
// The calm ships' layers (1–3) roll no HARSH planet (only KESTREL's authored Brine is one) and at most one arc. Deviation
// (Track GEN): no double windows (01's optional 12–30° pair from layer 3) are rolled; brackets spread evenly round the rim.

export interface RolledLanding extends ShipLandingDef {
  site: 'good' | 'poor';
}

// Every template flies round the same planet (data/flight-templates.ts): its radius turns a bracket's km into degrees.
const PLANET_R: number = (() => {
  const radii = new Set(Object.values(FLIGHT_TEMPLATES).map((template) => template.flight.planet.R));
  if (radii.size !== 1) throw new Error(`landing-roller: the templates fly round ${radii.size} planet sizes; the roller assumes one`);
  return [...radii][0]!;
})();

const kmToDeg = (km: number): number => (km / PLANET_R) * (180 / Math.PI);
const halfWidthDeg = (width: LzWidth): number => kmToDeg(LZ_WIDTH_KM[width] / 2);
const round1 = (deg: number): number => Math.round(deg * 10) / 10;
const wrap = (deg: number): number => round1(((deg % 360) + 360) % 360) % 360;
const pick = <T>(rng: Rng, list: readonly T[]): T => {
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new Error('landing-roller: picked from an empty list');
  return item;
};
const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

// How many LZs (01 §3.15's count table): 3 pods → 1 on the first ship, else 2; 4–9 → 2; 10–13 → 3; 14–16 → 3 in layers
// 3–5, 4 from layer 6.
export function lzCountFor(pods: number, layer: number): number {
  if (pods === 3) return layer === 1 ? 1 : 2;
  if (pods <= 9) return 2;
  if (pods <= 13) return 3;
  return layer <= 5 ? 3 : 4;
}

// The counts, as even as possible and larger first (6 → 3 · 3, 9 → 5 · 4, 13 → 5 · 4 · 4).
export function evenSplit(pods: number, lzs: number): number[] {
  const base = Math.floor(pods / lzs);
  return Array.from({ length: lzs }, (_, index) => base + (index < pods % lzs ? 1 : 0));
}

function rollWidths(rng: Rng, layer: number, count: number, allWide: boolean): LzWidth[] {
  if (allWide || layer === 1) return Array.from({ length: count }, () => 'wide');
  if (layer <= 3) {
    const narrowLast = rng() < 0.5;
    return Array.from({ length: count }, (_, index) => (index === 0 ? 'wide' : narrowLast && index === count - 1 ? 'narrow' : 'standard'));
  }
  if (layer <= 5 || layer >= 8) return Array.from({ length: count }, (_, index) => (index === count - 1 && count > 1 ? 'narrow' : 'standard'));
  const rolled = Array.from({ length: count }, (): LzWidth => pick(rng, ['wide', 'standard', 'narrow'] as const));
  if (!rolled.includes('standard')) rolled[Math.floor(rng() * count)] = 'standard';
  return rolled;
}

function rollClass(rng: Rng, layer: number): ForgivenessClass {
  if (layer === 1 || layer >= 8) return 'gentle';
  if (layer <= 3) return rng() < 2 / 3 ? 'gentle' : 'rough';
  return pick(rng, ['gentle', 'rough', 'harsh'] as const);
}

// The terrain word a class reads as (01 §3.6's examples, within the words the GROUND TRACK draws: landing-hud.ts
// TERRAIN_PATTERN has PLAINS, GRASSLAND, OCEAN and VOLCANIC; a new word needs its pattern there first).
function terrainFor(rng: Rng, forgiveness: ForgivenessClass): TerrainWord {
  if (forgiveness === 'gentle') return pick(rng, ['PLAINS', 'GRASSLAND'] as const);
  return forgiveness === 'rough' ? 'VOLCANIC' : 'OCEAN';
}

const NO_GO_WORDS: Readonly<Record<TerrainWord, readonly string[]>> = {
  PLAINS: ['CLIFFS', 'LAKE'], GRASSLAND: ['CLIFFS', 'LAKE'], VOLCANIC: ['LAVA'], OCEAN: ['REEF'],
};

function arcCountFor(rng: Rng, layer: number): number {
  if (layer <= 2) return 0;
  if (layer === 3) return rng() < 0.5 ? 0 : 1;
  if (layer <= 5 || layer >= 8) return 1;
  if (layer === 6) return rng() < 0.5 ? 1 : 2;
  return 2;
}

// No-go arcs, each beside a different bracket edge (an LZ and a side), its near edge NO_GO_EDGE_GAP km from it.
function rollArcs(rng: Rng, lzs: readonly LzDef[], count: number, terrain: TerrainWord): NoGoArcDef[] {
  const sides = lzs.flatMap((lz) => [{ lz, dir: -1 }, { lz, dir: 1 }]);
  const arcs: NoGoArcDef[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * sides.length);
    const side = sides.splice(index, 1)[0];
    if (!side) throw new Error(`landing-roller: no bracket edge left for no-go arc ${i + 1} of ${count}`);
    const widthDeg = round1(between(rng, NO_GO_WIDTH_MIN_DEG, NO_GO_WIDTH_MAX_DEG));
    const gapDeg = kmToDeg(between(rng, NO_GO_EDGE_GAP_MIN_KM, NO_GO_EDGE_GAP_MAX_KM));
    const centreDeg = wrap(side.lz.centreDeg + side.dir * (halfWidthDeg(side.lz.width) + gapDeg + widthDeg / 2));
    arcs.push({ centreDeg, widthDeg, word: pick(rng, NO_GO_WORDS[terrain]) });
  }
  return arcs.sort((a, b) => a.centreDeg - b.centreDeg);
}

// POOR site data (02 §3.5): 1 in 3 in layer 5, 1 in 2 in layers 6–7, never elsewhere; its own stream, drawn every time
// (so a slice that reads it moves nothing else).
function rollSite(key: Readonly<ShipKey>, layer: number): 'good' | 'poor' {
  const odds = layer === 5 ? POOR_SITE_ODDS_LAYER5 : layer === 6 || layer === 7 ? POOR_SITE_ODDS_LATE : 0;
  return keyRng(key, 'site')() < odds ? 'poor' : 'good';
}

// `authored` is an authored ship's written parts (data/run1-arm.ts RUN1_AUTHORED), honoured over the roll: a whole written
// landing, or the class, terrain, LZ split, all-WIDE and the no-go policy. An authored ship's site data is GOOD (written).
// The result is stored on the ArmShip (shipDefOf has no armSeed to roll it again).
export function rollLanding(key: Readonly<ShipKey>, layer: number, pods: number, authored: Readonly<AuthoredOverride> | null): RolledLanding {
  const id = `slot ${key.slot}`;
  if (!(Number.isInteger(pods) && pods >= 3 && pods <= PODS_MAX)) throw new Error(`rollLanding ${id}: ${pods} pods (3–${PODS_MAX})`);
  if (!(Number.isInteger(layer) && layer >= 1 && layer <= LAYER_COUNT)) throw new Error(`rollLanding ${id}: layer ${layer}`);
  const site = authored === null ? rollSite(key, layer) : 'good';
  if (authored?.landing) {
    const written = structuredClone(authored.landing) as ShipLandingDef;
    validateLandingDef(id, written, pods, PLANET_R);
    return { ...written, site };
  }
  const rng = keyRng(key, 'landing');
  let counts = authored?.lzPods ? [...authored.lzPods] : evenSplit(pods, lzCountFor(pods, layer));
  if (!authored?.lzPods && layer >= 2 && counts.length > 1 && rng() < 0.5 && counts[counts.length - 1]! >= 2) {
    counts = counts.map((count, index) => count + (index === 0 ? 1 : index === counts.length - 1 ? -1 : 0));
  }
  const step = 360 / counts.length;
  const start = rng() * step;
  const centres = counts.map((_, index) => wrap(start + index * step + between(rng, -LZ_CENTRE_JITTER_DEG, LZ_CENTRE_JITTER_DEG)))
    .sort((a, b) => a - b);
  const widths = rollWidths(rng, layer, counts.length, authored?.allWide ?? false);
  const lzs: LzDef[] = centres.map((centreDeg, index) => ({
    label: `LZ-${String.fromCharCode(65 + index)}`, centreDeg, width: widths[index]!, pods: counts[index]!,
  }));
  const forgiveness = authored?.forgiveness ?? rollClass(rng, layer);
  const terrain = authored?.terrain ?? terrainFor(rng, forgiveness);
  const noGo = authored?.noGo === 'none' ? []
    : Array.isArray(authored?.noGo) ? authored.noGo.map((arc) => ({ ...arc }))
      : rollArcs(rng, lzs, arcCountFor(rng, layer), terrain);
  const landing: ShipLandingDef = { lzs, forgiveness, terrain, noGo, colonyFirstRun: null, drag: layer > 1 };
  validateLandingDef(id, landing, pods, PLANET_R);
  return { ...landing, site };
}
