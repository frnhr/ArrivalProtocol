import { WORLDS, RING_LY, worldAt } from '@data/arm';
import { BEAM_RANGE_LY } from '@data/tuning';

// The arm's geometry (02-map §3.1, §3.2; slice-3a-plan §2.1), pure: whole-LY distances between worlds and from SOL, the
// layer of a slot, and the 046.log rings a distance from SOL has passed. Every distance a rule uses is the rounded one
// (02 §3.1: "the kid can redo every sum on screen"), half up. Track GEN owns this file after the foundation.

// The straight-line distance between two worlds, rounded to the nearest whole LY.
export function distLy(a: number, b: number): number {
  const wa = worldAt(a);
  const wb = worldAt(b);
  return Math.round(Math.hypot(wa.x - wb.x, wa.y - wb.y));
}

// A world's distance from SOL (0, 0), in whole LY: the rings, 05's postcards and the title's `FINAL SHIP 180 LY OUT`.
export function solLy(slot: number): number {
  const def = worldAt(slot);
  return Math.round(Math.hypot(def.x, def.y));
}

export function layerOf(slot: number): number {
  return worldAt(slot).layer;
}

// The rings (their indices, 0 = ring 1 at 20 LY) at or inside `sol` LY from SOL: a boot there has crossed them all.
export function ringsWithin(sol: number): number[] {
  return RING_LY.flatMap((ring, index) => (ring <= sol ? [index] : []));
}

// The rings a beam crosses going out from `fromSol` to `toSol` LY from SOL (05 §3.2: an entry opens at the boot of the
// first ship at or beyond its ring; a two-layer hop opens two).
export function ringsCrossed(fromSol: number, toSol: number): number[] {
  return RING_LY.flatMap((ring, index) => (ring > fromSol && ring <= toSol ? [index] : []));
}

// The distance from point (px, py) to the segment between two worlds, in LY (unrounded: a noise cloud's reach is a
// geometric test, not a number on screen).
export function segmentDistanceLy(px: number, py: number, a: number, b: number): number {
  const wa = worldAt(a);
  const wb = worldAt(b);
  const dx = wb.x - wa.x;
  const dy = wb.y - wa.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - wa.x) * dx + (py - wa.y) * dy) / lengthSq)) : 0;
  return Math.hypot(wa.x + t * dx - px, wa.y + t * dy - py);
}

// Every slot's distance to every other, computed once (the route enumeration asks it thousands of times).
const TABLE: readonly (readonly number[])[] = WORLDS.map((a) => WORLDS.map((b) => distLy(a.slot, b.slot)));

export function distTable(a: number, b: number): number {
  const d = TABLE[a]?.[b];
  if (d === undefined) throw new Error(`distTable: no world pair ${a}–${b}`);
  return d;
}

// Can the unit beam from world `from` (left in `leaveYear`) to world `to` (approaching in `approachYear`)? 02 §3.1:
// outward (a higher layer), within BEAM_RANGE_LY, and in time (it gets there no later than the approach). The ONE rule:
// systems/map-hop.ts reachable reads it on a map, systems/map-generator.ts armReach on a bare arm (the review's m6).
export function beamReaches(from: number, to: number, leaveYear: number, approachYear: number): boolean {
  if (layerOf(to) <= layerOf(from)) return false;
  const d = distTable(from, to);
  return d <= BEAM_RANGE_LY && leaveYear + d <= approachYear;
}
