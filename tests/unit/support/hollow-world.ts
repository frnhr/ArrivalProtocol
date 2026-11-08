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
import { buildShipMemory, MEMORY_LAYOUTS, layoutOf } from '@data/memory';
import { createHollowState, createLandingState } from '@state/initial';
import { hollowLabel } from '@systems/say';
import { childRng } from '@systems/rng';
import type { ShipDef } from '@data/ships';
import { currentShip } from '@systems/map-run';
import { fixtureShip } from './arm-ship';

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
// is phase 2's `R P P P _32`. Mutates `memory` and checks it against `totalBlocks` (its class's size: FULL's 384 unless
// given); throws when no free run after `addr` has the blocks.
export function plantRoot(memory: Segment[], addr: number, blocks = ROOT_BLOCKS, owner = UNNAMED_HOLLOW, totalBlocks = MEMORY_LAYOUTS.FULL.totalBlocks): HollowSegment {
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
  assertMemoryInvariants(memory, totalBlocks);
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

// Phase 2's HALCYON and KESTREL landings, for the pods of PHASE2_RACKS (5 and 12): HALCYON's two sites (the lesson is the
// split), KESTREL's three WIDE sites of 4 on HARSH ocean.
export const PHASE2_LANDINGS: Readonly<Record<1 | 2, ShipDef['landing']>> = {
  1: {
    lzs: [{ label: 'LZ-A', centreDeg: 40, width: 'wide', pods: 3 }, { label: 'LZ-B', centreDeg: 190, width: 'standard', pods: 2 }],
    forgiveness: 'gentle', terrain: 'GRASSLAND', noGo: [], colonyFirstRun: null, drag: true,
  },
  2: {
    lzs: [
      { label: 'LZ-A', centreDeg: 20, width: 'wide', pods: 4 }, { label: 'LZ-B', centreDeg: 140, width: 'wide', pods: 4 },
      { label: 'LZ-C', centreDeg: 260, width: 'wide', pods: 4 },
    ],
    forgiveness: 'harsh', terrain: 'OCEAN', noGo: [], colonyFirstRun: null, drag: true,
  },
};
const PHASE2_LEADS: Readonly<Record<1 | 2, number>> = { 1: 5, 2: 10 };

// The ship as phase 2 had it: the ship being flown (the fixture's authored HALCYON or KESTREL: its flight, rack A and
// rolls), with phase 2's FULL memory (racks A–F, the unit at block 256), its pod racks, lead pod and landing. Track RETIRE:
// run 1's arm HALCYON and KESTREL are COMPACT (no rack D), so the phase-2 geometry is this fixture's, not the ship's.
export function phase2ShipDef(index: 1 | 2, ship: ShipDef = fixtureShip(index)): ShipDef {
  const podRacks = PHASE2_RACKS[index];
  const pods = Object.values(podRacks).reduce((sum, rack) => sum + (rack ?? '').split(' ').filter((token) => token === 'P').length, 0);
  return {
    ...ship, memoryClass: 'FULL', pods, landing: structuredClone(PHASE2_LANDINGS[index]) as ShipDef['landing'],
    memory: { ...ship.memory, podRacks: { ...podRacks }, drivers: { ...ship.memory.drivers, lead: PHASE2_LEADS[index] } },
  };
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
  // The unit's files where the ship's class put them (rack E: block 256 on FULL, 192 on COMPACT); they move to FULL's.
  const unitAt = starts.indexOf(layoutOf(state).unitStart);
  if (unitAt < 0) throw new Error('phase2Ship: the unit\'s files do not start at rack E');
  const ship = phase2ShipDef(index, currentShip(state));
  const carried = { startAddr: MEMORY_LAYOUTS.FULL.unitStart, segs: state.memory.slice(unitAt).map((seg) => structuredClone(seg)) };
  const memory = buildShipMemory(ship, carried, childRng(state.run.seed, index, ship.memory.drivers.familiesSeedStream), false, hollowLabel(state.run), { blocks: ROOT_BLOCKS }, []);
  const landing = createLandingState(ship.landing, memory, { finalShip: false, lead: ship.memory.drivers.lead, hurt: [], planetR: state.level.planet.R });
  store.update((draft) => {
    draft.memory = memory;
    draft.level.memoryClass = 'FULL';
    // Phase 2's KESTREL's debris named rack C on the written run (where its POD 07–12 are); run 1's arm KESTREL names B.
    if (index === 2) draft.level.zones = draft.level.zones.map((zone) => (zone.kind === 'debris' ? { ...zone, rack: 'C' } : zone));
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
    root = plantRoot(draft.memory, PHASE2_ROOT_ADDR, ROOT_BLOCKS, hollowLabel(draft.run), layoutOf(draft).totalBlocks);
    draft.hollow = createHollowState(cfg);
    draft.ui.memoryRev++;
  });
  if (root === null) throw new Error('phase2ShipOne: no root planted');
  return root;
}

// Phase 2's HALCYON geometry on the live HALCYON, in place (Track OPENING's helper, folded in here so there is one): its
// rack B `P P P P P _24` becomes `P P P P _2 R _1 P _13`, POD 05 moving behind an 8-block root (POD 04 a GAP of 2 to its
// left, POD 05 a GAP of 1 to its right), and HOLLOW is phase 2's HALCYON (the WALLS stage). For the suites that test a
// FIREWALL or a card against a root there (wp8/draft, wp8/p2/ui-models, wp7/fix1/run-end-and-boot); a store.update
// recipe. phase2Ship rebuilds the racks with phase 2's own layout instead.
export function plantHalcyonRoot(draft: GameState): void {
  if (draft.level.shipName !== 'HALCYON') throw new Error(`plantHalcyonRoot: on ${draft.level.shipName}`);
  const pod5 = draft.memory.findIndex((seg) => seg.type === 'driver' && seg.pod === 5);
  const driver = draft.memory[pod5];
  const tail = draft.memory[pod5 + 1];
  if (driver === undefined || tail?.type !== 'free' || tail.size < 24) throw new Error('plantHalcyonRoot: rack B no longer ends POD 05, _24');
  const root: HollowSegment = {
    id: 'root', name: UNNAMED_HOLLOW, type: 'hollow', size: ROOT_BLOCKS, root: true, locked: true, owner: UNNAMED_HOLLOW, desc: HOLLOW_DESC.root,
  };
  draft.memory.splice(pod5, 2, freeSegment(2), root, freeSegment(1), driver, freeSegment(tail.size - 11));
  draft.hollow.cfg = phase2HollowOf(1);
  draft.ui.memoryRev++;
}
