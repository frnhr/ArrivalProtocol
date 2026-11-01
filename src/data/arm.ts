import { BEAM_RANGE_LY, RING_CLEARANCE_LY } from '@data/tuning';

// THE ARM (docs/phase3/02-map.md §3.2; slice-3a-plan §4.1): one hand-placed set of worlds, the same for every player,
// with stable ids. A world is a place, not a ship: over the runs one world receives many ships (the arm state, run.map,
// says which ship waits where). SOL is at (0, 0); positions are in light-years. Layer centres sit 8, 30, 55, 80, 105,
// 130, 155 and 180 LY from SOL along a gentle bend; layers 2–7 hold three worlds on three lanes (inner, centre, outer).
// WHY: the first hop is phase 2's 22 LY and later layers are 25 LY apart, so single hops are 21–45 LY, two-layer hops
// 45–70 LY and three-layer hops at least 70 LY. 05-story.md §3.11 owns the names. validateArm runs at load.
// Track GEN owns this file after the foundation.

// Bump when a world moves, is added or is renamed: 3c's save refuses an arm state saved against other worlds.
export const ARM_CONTENT_VERSION = 1;

export type Lane = 'inner' | 'centre' | 'outer';

export interface WorldDef {
  slot: number;      // the world id's number: w0 … w19, and the index into run.map.arm
  id: string;        // 'w0' … 'w19'
  name: string;
  x: number;
  y: number;
  layer: number;     // 1 (the first ship) … 8 (the end)
  lane: Lane;
}

function world(slot: number, name: string, x: number, y: number, layer: number, lane: Lane): WorldDef {
  return { slot, id: `w${slot}`, name, x, y, layer, lane };
}

export const WORLDS: readonly WorldDef[] = [
  world(0, 'Kepler-186f', 8, 0, 1, 'centre'),
  world(1, 'Marrow', 33, -10, 2, 'inner'), world(2, 'Tessaly', 29, 4, 2, 'centre'), world(3, 'Dunmore', 30, 16, 2, 'outer'),
  world(4, 'Ostrava', 54, 1, 3, 'inner'), world(5, 'Brine', 54, 10, 3, 'centre'), world(6, 'Pell', 53, 24, 3, 'outer'),
  world(7, 'Larkspur', 81, 13, 4, 'inner'), world(8, 'Calder', 75, 21, 4, 'centre'), world(9, 'Quill', 73, 35, 4, 'outer'),
  world(10, 'Ashgrove', 100, 29, 5, 'inner'), world(11, 'Cinder', 98, 43, 5, 'centre'), world(12, 'Tamsin', 91, 52, 5, 'outer'),
  world(13, 'Greywater', 121, 51, 6, 'inner'), world(14, 'Kettle', 114, 62, 6, 'centre'), world(15, 'Avalon', 107, 72, 6, 'outer'),
  world(16, 'Farhold', 136, 78, 7, 'inner'), world(17, 'Sable', 128, 90, 7, 'centre'), world(18, 'Endmark', 121, 96, 7, 'outer'),
  world(19, 'New Haven', 138, 116, 8, 'centre'),
];

// The first ship's world (layer 1: ARES-n, a fresh unit) and the end slots (02 §3.6: v1 has one, New Haven). A final
// ship is the ship in an end slot; "one hop from the final ship" reads "from any end slot's ship".
export const FIRST_SLOT = 0;
export const END_SLOTS: readonly number[] = [19];
export const LAYER_COUNT = 8;

// 046.log's key rings (05-story.md §3.2): distances from SOL in rounded LY, in the gaps between layers, so a ring is
// crossed exactly when a route enters a new layer. Ring n opens entry n + 1 (ring 4 opens 05–06, ring 5 07–08).
export const RING_LY: readonly number[] = [20, 45, 68, 93, 118, 143];

export function worldAt(slot: number): WorldDef {
  const def = WORLDS[slot];
  if (!def) throw new Error(`worldAt: no world in slot ${slot} (the arm has ${WORLDS.length})`);
  return def;
}

// The slots of one layer, in lane order.
export function slotsInLayer(layer: number): number[] {
  return WORLDS.filter((def) => def.layer === layer).map((def) => def.slot);
}

// A problem the arm check found (an empty list: the arm is good).
export interface ArmDataProblem {
  rule: 'layout' | 'one-layer-out-of-range' | 'three-layers-in-range' | 'near-ring';
  slots: number[];
  detail: string;
}

// The arm check's own distance (rounded whole LY, 02 §3.1). systems/map-geometry.ts distLy is the same rule; this file
// keeps its own copy so the data validates without importing a system.
function lyBetween(a: Readonly<WorldDef>, b: Readonly<WorldDef>): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
}

// 02 §3.2's checks on a set of worlds: ids and slots in order, the first slot alone in layer 1 and the end slots alone in
// the last layer, every one-layer pair within BEAM_RANGE_LY, no pair three or more layers apart within it, and no world
// within RING_CLEARANCE_LY of a ring. Pure (the suites feed it broken arms); validateArm throws on the real one.
export function armProblems(worlds: readonly WorldDef[]): ArmDataProblem[] {
  const problems: ArmDataProblem[] = [];
  worlds.forEach((def, index) => {
    if (def.slot !== index || def.id !== `w${index}`) problems.push({ rule: 'layout', slots: [index], detail: `${def.id} at index ${index}` });
    if (!(Number.isInteger(def.layer) && def.layer >= 1 && def.layer <= LAYER_COUNT)) problems.push({ rule: 'layout', slots: [index], detail: `layer ${def.layer}` });
  });
  const firstLayer = worlds.filter((def) => def.layer === 1).map((def) => def.slot);
  if (firstLayer.join() !== String(FIRST_SLOT)) problems.push({ rule: 'layout', slots: firstLayer, detail: 'layer 1 must hold the first slot alone' });
  const endLayer = worlds.filter((def) => def.layer === LAYER_COUNT).map((def) => def.slot);
  if (endLayer.join() !== END_SLOTS.join()) problems.push({ rule: 'layout', slots: endLayer, detail: 'the last layer must hold the end slots alone' });
  for (const a of worlds) {
    for (const b of worlds) {
      if (b.slot <= a.slot) continue;
      const gap = Math.abs(a.layer - b.layer);
      const d = lyBetween(a, b);
      if (gap === 1 && d > BEAM_RANGE_LY) problems.push({ rule: 'one-layer-out-of-range', slots: [a.slot, b.slot], detail: `${a.name}–${b.name} ${d} LY` });
      if (gap >= 3 && d <= BEAM_RANGE_LY) problems.push({ rule: 'three-layers-in-range', slots: [a.slot, b.slot], detail: `${a.name}–${b.name} ${d} LY` });
    }
    const sol = Math.round(Math.hypot(a.x, a.y));
    for (const ring of RING_LY) {
      if (Math.abs(sol - ring) < RING_CLEARANCE_LY) problems.push({ rule: 'near-ring', slots: [a.slot], detail: `${a.name} at ${sol} LY, ring ${ring}` });
    }
  }
  return problems;
}

export function validateArm(worlds: readonly WorldDef[] = WORLDS): void {
  const problems = armProblems(worlds);
  if (problems.length > 0) throw new Error(`the arm: ${problems.map((problem) => `${problem.rule} (${problem.detail})`).join('; ')}`);
}

validateArm();
