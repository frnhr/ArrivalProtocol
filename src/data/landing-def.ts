import type { ShipLandingDef } from '@/types/landing';
import { LZ_MIN_GAP_DEG, LZ_WIDTH_KM, PODS_MAX } from '@data/tuning';

// The landing data's own rules, apart from data/ships.ts (no SHIPS import), so slice 3's map generator can check what it
// rolls with exactly the checks the written ships pass.

// Throws on landing data that breaks 01-landing §3.5–§3.6 and §3.15's placement rules: the LZ counts sum to the ship's
// `pods`, at most PODS_MAX; labels are unique and follow increasing angle (orbits are CCW, so a kid meets LZ-A first);
// centres in [0, 360); every two brackets at least LZ_MIN_GAP_DEG apart edge to edge, wrapping round, so two windows
// never overlap; no-go arcs 3–8° wide, never overlapping a bracket or each other (a pod in both would be scored twice
// over: landing-rules classifyLanding reads the bracket first). `planetR` turns each bracket's km into degrees.
export function validateLandingDef(id: string, def: ShipLandingDef, pods: number, planetR: number): void {
  const fail = (why: string): never => { throw new Error(`ShipDef ${id} landing: ${why}`); };
  if (def.lzs.length === 0) fail('no landing zone');
  if (!(Number.isInteger(pods) && pods > 0 && pods <= PODS_MAX)) fail(`${pods} pods (at most ${PODS_MAX})`);
  const sum = def.lzs.reduce((total, lz) => total + lz.pods, 0);
  if (sum !== pods) fail(`the LZ counts sum to ${sum} pods, not ${pods}`);
  if (new Set(def.lzs.map((lz) => lz.label)).size !== def.lzs.length) fail('two LZs share a label');
  const halfDeg = (widthKm: number): number => ((widthKm / 2) / planetR) * (180 / Math.PI);
  const apartDeg = (a: number, b: number): number => {
    const apart = Math.abs(a - b);
    return Math.min(apart, 360 - apart);
  };
  def.lzs.forEach((lz, index) => {
    if (!(Number.isInteger(lz.pods) && lz.pods > 0)) fail(`${lz.label} holds ${lz.pods} pods`);
    if (!(lz.centreDeg >= 0 && lz.centreDeg < 360)) fail(`${lz.label} centre ${lz.centreDeg}° is outside [0, 360)`);
    const previous = def.lzs[index - 1];
    if (previous && !(lz.centreDeg > previous.centreDeg)) fail(`${lz.label} is not after ${previous.label} in angle`);
    for (const other of def.lzs.slice(index + 1)) {
      const gap = apartDeg(lz.centreDeg, other.centreDeg) - halfDeg(LZ_WIDTH_KM[lz.width]) - halfDeg(LZ_WIDTH_KM[other.width]);
      if (gap < LZ_MIN_GAP_DEG) fail(`${lz.label} and ${other.label} are ${gap.toFixed(1)}° apart edge to edge (at least ${LZ_MIN_GAP_DEG}°)`);
    }
  });
  def.noGo.forEach((arc, index) => {
    if (!(arc.widthDeg >= 3 && arc.widthDeg <= 8)) fail(`a no-go arc is ${arc.widthDeg}° wide (3–8°)`);
    if (!(arc.centreDeg >= 0 && arc.centreDeg < 360)) fail(`a no-go arc's centre ${arc.centreDeg}° is outside [0, 360)`);
    if (arc.word.trim() === '') fail('a no-go arc has no word');
    for (const lz of def.lzs) {
      if (apartDeg(arc.centreDeg, lz.centreDeg) < arc.widthDeg / 2 + halfDeg(LZ_WIDTH_KM[lz.width])) {
        fail(`the no-go arc at ${arc.centreDeg}° overlaps ${lz.label}`);
      }
    }
    for (const other of def.noGo.slice(index + 1)) {
      if (apartDeg(arc.centreDeg, other.centreDeg) < (arc.widthDeg + other.widthDeg) / 2) {
        fail(`the no-go arcs at ${arc.centreDeg}° and ${other.centreDeg}° overlap`);
      }
    }
  });
  if (def.colonyFirstRun !== null && def.colonyFirstRun.trim() === '') fail('an empty run-1 colony name');
}
