// Phase 3 slice 2: HOLLOW's configs moved from the ships to the stages (src/data/threats.ts HOLLOW_STAGES). Phase 2's
// suites were written against "ship n's HOLLOW"; each ship's def now lives on as one stage (04 §3.9's table), so a suite
// that still means phase 2's ship-n numbers reads them here. And ships 1–2 are calm now (no root, no slot): a suite that
// means phase 2's ship-1 geometry (`R P P P`: the root at rack B's start, POD 01 right beside it) plants the root itself
// (plantRoot, phase2ShipOne), so its assertions barely change (slice-2-plan §6.2).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { HollowDef, HollowStage } from '@/types/threat';
import type { Segment, HollowSegment } from '@/types/segment';
import { HOLLOW_STAGES } from '@data/threats';
import { HOLLOW_DESC, UNNAMED_HOLLOW } from '@data/hollow-text';
import { RACK_BLOCKS, ROOT_BLOCKS } from '@data/tuning';
import { segmentStarts, assertMemoryInvariants, freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { MEMORY_TOTAL_BLOCKS, UNIT_RACKS_START, buildShipMemory } from '@data/memory';
import { createHollowState, createLandingState } from '@state/initial';
import { hollowLabel } from '@systems/say';
import { childRng } from '@systems/rng';
import { SHIPS, type ShipDef } from '@data/ships';

// Phase 2's ship index → the stage its HollowDef became.
export const PHASE2_STAGE_OF_SHIP: readonly HollowStage[] = ['arrival', 'walls', 'seeds', 'hunt', 'finale'];

// Phase 2's HollowDef for ship `index` (ARES-VII 0 … LAST LIGHT 4), copied.
export function phase2HollowOf(index: number): HollowDef {
  const stage = PHASE2_STAGE_OF_SHIP[index];
  if (stage === undefined) throw new Error(`phase2HollowOf: no phase-2 ship ${index}`);
  return structuredClone(HOLLOW_STAGES[stage].hollow);
}

// Rack B's first address: where phase 2's ship-1 root stood (`R P P P` in rack B).
export const PHASE2_ROOT_ADDR = RACK_BLOCKS;

// HOLLOW's root planted at `addr` (the start of a segment, or a free block), its blocks taken from the first free run at
// or after `addr`, so the segments in between shift up by as many: ARES-VII's `P P P _40` with plantRoot(memory, 64)
// is phase 2's `R P P P _32`. Mutates `memory` and checks it; throws when no free run after `addr` has the blocks.
export function plantRoot(memory: Segment[], addr: number, blocks = ROOT_BLOCKS, owner = UNNAMED_HOLLOW): HollowSegment {
  const starts = segmentStarts(memory);
  let at = starts.indexOf(addr);
  if (at < 0) {
    // Inside a free run: split it at `addr`.
    const inside = memory.findIndex((seg, index) => seg.type === 'free' && starts[index]! < addr && starts[index]! + seg.size > addr);
    if (inside < 0) throw new Error(`plantRoot: ${addr} is neither a segment's start nor inside free space`);
    const run = memory[inside]!;
    const left = addr - starts[inside]!;
    memory.splice(inside, 1, freeSegment(left), freeSegment(run.size - left));
    at = inside + 1;
  }
  const freeAt = memory.findIndex((seg, index) => index >= at && seg.type === 'free' && seg.size >= blocks);
  if (freeAt < 0) throw new Error(`plantRoot: no ${blocks} free blocks at or after ${addr}`);
  const run = memory[freeAt]!;
  if (run.size === blocks) memory.splice(freeAt, 1);
  else memory[freeAt] = freeSegment(run.size - blocks);
  const root: HollowSegment = {
    id: 'root', name: owner, type: 'hollow', size: blocks, root: true, locked: true, owner, desc: HOLLOW_DESC.root,
  };
  memory.splice(at, 0, root);
  mergeAdjacentFree(memory);
  assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  return root;
}

// Phase 2's pod racks on the ships slice 2 made calm or seeds-only, written through the slot as the ladder brings a root
// (an 8-block root, phase 2's `R`, takes its blocks off the slot rack's tail):
// • HALCYON (`P P P _40`, `P _2 R _1 P _37`): the root between POD 04 (a 2-block GAP) and POD 05 (a 1-block GAP);
// • KESTREL (`P×6 _16`, `P P P _1 R _2 P P P _5`): the root between POD 09 (GAP 1) and POD 10 (GAP 2).
export const PHASE2_RACKS: Readonly<Record<1 | 2, ShipDef['memory']['podRacks']>> = {
  1: { B: 'P P P _40', C: 'P _2 S _1 P _45', D: '_64' },
  2: { B: 'P P P P P P _16', C: 'P P P _1 S _2 P P P _13', D: '_64' },
};
export const PHASE2_HALCYON_RACKS = PHASE2_RACKS[1];

// The ship with phase 2's pod racks (its own pods and LZs).
export function phase2ShipDef(index: 1 | 2): ShipDef {
  const ship = SHIPS[index]!;
  return { ...ship, memory: { ...ship.memory, podRacks: { ...PHASE2_RACKS[index] } } };
}

export function phase2HalcyonDef(): ShipDef {
  return phase2ShipDef(1);
}

// HALCYON as phase 2 had it (phase2Ship).
export function phase2Halcyon(store: Store<GameState>, cfg: HollowDef = phase2HollowOf(1)): void {
  phase2Ship(store, 1, cfg);
}

// HALCYON or KESTREL as phase 2 had it, on the ship being flown: its racks A–D rebuilt with phase 2's pod racks and an
// 8-block root (the unit's racks E–F kept as they are; no driver arrives hurt), its landing slice for those drivers, and
// HOLLOW's config `cfg` (phase 2's def for that ship, its stage, unless given), asleep. The unit's files must start at
// rack E.
export function phase2Ship(store: Store<GameState>, index: 1 | 2, cfg: HollowDef = phase2HollowOf(index)): void {
  const state = store.getState();
  const starts = segmentStarts(state.memory);
  const unitAt = starts.indexOf(UNIT_RACKS_START);
  if (unitAt < 0) throw new Error('phase2Ship: the unit\'s files do not start at rack E');
  const ship = phase2ShipDef(index);
  const carried = { startAddr: UNIT_RACKS_START, segs: state.memory.slice(unitAt).map((seg) => structuredClone(seg)) };
  const memory = buildShipMemory(ship, carried, childRng(state.run.seed, index, ship.memory.drivers.familiesSeedStream), false, hollowLabel(state.run), { blocks: ROOT_BLOCKS }, []);
  const landing = createLandingState(ship.landing, memory, { finalShip: false, lead: ship.memory.drivers.lead, hurt: [], planetR: state.level.planet.R });
  store.update((draft) => {
    draft.memory = memory;
    draft.landing = landing;
    draft.mission.colonists = landing.pods.reduce((sum, record) => sum + record.colonists, 0);
    draft.hollow = createHollowState(cfg);
    draft.ui.memoryRev++;
  });
}

// The world on ship 1 as phase 2 had it: the root at rack B's start (POD 01 right beside it, rack A's free tail on its
// left) and HOLLOW's config `cfg` (phase 2's ARES-VII def, the ARRIVAL stage, unless given), asleep. For the suites whose
// HOLLOW rules were written on ship 1; call it after the harness's reset.
export function phase2ShipOne(store: Store<GameState>, cfg: HollowDef = phase2HollowOf(0)): HollowSegment {
  let root: HollowSegment | null = null;
  store.update((draft) => {
    root = plantRoot(draft.memory, PHASE2_ROOT_ADDR, ROOT_BLOCKS, hollowLabel(draft.run));
    draft.hollow = createHollowState(cfg);
    draft.ui.memoryRev++;
  });
  if (root === null) throw new Error('phase2ShipOne: no root planted');
  return root;
}
