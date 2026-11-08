// 02 §3.14 as data (slice-3c-plan §4.3): run 1's results on the worked route, UNIT-047's trail, and the update to run 2 with
// its rolls fixed by hand, so Track UI builds the chart, card, title and tally against real shapes, and Track WORLD's
// `world/update-fixture` checks updateArm cell by cell against the same numbers.
// • run2Dice scripts every roll of §3.14's update (gap 1; PETREL `core-coming`, SHEARWATER `own-way`, every other ship
//   stays; the pattern kept 3, 5, 7 with Cinder taking the ark; the refill puts Marrow and Greywater first, as the light
//   ships; jitter 0 with BELLWETHER and MORNING STAR late; TIDINGS' ark extra 3; §3.14's names). It throws on a roll §3.14
//   never makes (a victim, a repair, a feeder, a refill).
// • run2Arm builds run 2's ArmState the way the update must: the 12 waiting ships byte-identical to run 1's except
//   runsOnChart 2, the 8 new ships timed with the generator's own helpers (bases, timingYear, arkYear, finalYear) and then
//   finished by the generator (shipsFromFrames: 02 §3.5's quotas topped up on the new ships, their details from
//   ShipKey(armSeed, 2, slot, 0), the Debris guarantee among the new layer-3 ships; ARES and the final ship take the written
//   rows).
// • RUN2_EXPECTED is §3.14's table, recomputed by hand: tests/unit/world/run2-fixture.test.ts checks run2Arm against it.
// Track WORLD owns this file.
import type { ArmShip, RunMapState, ShipKey, ShipKind, MemoryClass } from '@/types/map';
import type { ShipResult } from '@state/schema';
import type { ArmState, Departure, LastUnit, UnitTrail, MapHistory } from '@/types/lineage';
import type { UpdateDice } from '@systems/map-update';
import { armContent } from '@systems/map-update';
import { coloniesOf } from '@systems/lineage';
import {
  assembleRun1Arm, bases, timingYear, arkYear, finalYear, podsFor, memoryClassOf, shipsFromFrames, type ShipFrame,
} from '@systems/map-generator';
import { MAP_STATE_VERSION } from '@data/map-state';
import { layerOf } from '@systems/map-geometry';
import { COLONISTS_PER_POD, RUN_START_YEAR } from '@data/tuning';
import { WORKED_ROUTE } from '../map/run1-fixture';

export const RUN2_GAP = 1;
export const RUN2_START = RUN_START_YEAR + RUN2_GAP;

// --- Run 1's results on the worked route (02 §3.14: every pod down in an LZ, 55 pods, 11,000 colonists) ---------------------

export interface Run1Result {
  slot: number;
  ship: string;
  year: number;
  outcome: ShipResult['outcome'];
  landed: number;
  colony: string;
  writer: { name: string; age: number };   // the first featured colonist of the first pod down in an LZ (the fixture's pick)
}

// RIVERSIDE and FIRST LIGHT are run 1's written colonies (05 §3.11); the four between are this fixture's picks from
// COLONY_NAMES (§3.14 says only "RIVERSIDE and five more colonies"), and so are the writers (names in the colonists'
// `Family, First` form, from data/souls.ts's pools; slice 3b's postcards sign them `First Family`).
export const RUN1_RESULTS: readonly Run1Result[] = [
  { slot: 0, ship: 'ARES-VII', year: 2300, outcome: 'locked', landed: 3 * COLONISTS_PER_POD, colony: 'RIVERSIDE', writer: { name: 'Okafor, Amara', age: 11 } },
  { slot: 2, ship: 'HALCYON', year: 2352, outcome: 'locked', landed: 5 * COLONISTS_PER_POD, colony: 'LANTERN', writer: { name: 'Castillo, Mateo', age: 34 } },
  { slot: 5, ship: 'KESTREL', year: 2467, outcome: 'locked', landed: 6 * COLONISTS_PER_POD, colony: 'GREENSTEP', writer: { name: 'Eriksen, Elif', age: 8 } },
  { slot: 11, ship: 'VESPER', year: 2625, outcome: 'locked', landed: 16 * COLONISTS_PER_POD, colony: 'STARFORD', writer: { name: 'Haddad, Sami', age: 52 } },
  { slot: 15, ship: 'CORMORANT', year: 2817, outcome: 'locked', landed: 9 * COLONISTS_PER_POD, colony: 'HARBOUR', writer: { name: 'Tanaka, Yara', age: 19 } },
  { slot: 19, ship: 'LAST LIGHT', year: 3020, outcome: 'locked', landed: 16 * COLONISTS_PER_POD, colony: 'FIRST LIGHT', writer: { name: 'Adeyemi, Kofi', age: 27 } },
];
if (RUN1_RESULTS.map((result) => result.slot).join() !== WORKED_ROUTE.join()) throw new Error('run2-fixture: RUN1_RESULTS is not the worked route');

// UNIT-047's trail after a PURGE on the worked route: no grey cross.
export const RUN1_TRAIL: UnitTrail = {
  unit: 47, run: 1, startYear: RUN_START_YEAR, lost: null,
  stops: RUN1_RESULTS.map((result) => ({
    slot: result.slot, shipName: result.ship, year: result.year, outcome: result.outcome, landed: result.landed, colony: result.colony,
    writer: { ...result.writer },
  })),
};

// The archive's last unit after run 1 (the title's `last: UNIT-047 · 11,000 landed · PURGE`).
export const RUN1_LAST_UNIT: LastUnit = {
  number: 47, landed: RUN1_RESULTS.reduce((sum, result) => sum + result.landed, 0), shipName: 'LAST LIGHT', cause: 'won-purge',
  stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: RUN1_TRAIL, skills: null,
  // Slice 7a (R16): run 1's PURGE as META 4 reads it, step 2 REASSIGNMENT.
  ending: {
    hollow: 'purge', you: 'reassignment', rootUnits: [46], finalSlot: RUN1_TRAIL.stops.at(-1)!.slot, finalShip: 'LAST LIGHT',
    finalYear: RUN1_TRAIL.stops.at(-1)!.year, stay: null, kit: [], fuelPct: null, charge: 0,
  },
};

// --- The update's rolls (§3.14) ------------------------------------------------------------------------------------------

// The new ships in slot order, with what §3.14 gives them (the update asks for names in this order).
const NEW_SHIPS: readonly { slot: number; name: string; kind: ShipKind; late: boolean }[] = [
  { slot: 0, name: 'ARES-VIII', kind: 'first', late: false },
  { slot: 1, name: 'BELLWETHER', kind: 'light', late: true },
  { slot: 2, name: 'PATIENCE', kind: 'standard', late: false },
  { slot: 5, name: 'STEADFAST', kind: 'standard', late: false },
  { slot: 11, name: 'TIDINGS', kind: 'ark', late: false },
  { slot: 13, name: 'MORNING STAR', kind: 'light', late: true },
  { slot: 15, name: 'FAR WIND', kind: 'standard', late: false },
  { slot: 19, name: 'LODESTAR', kind: 'final', late: false },
];
const TIDINGS_ARK_EXTRA = 3;
const LEAVING: Readonly<Record<string, 'core-coming' | 'own-way'>> = { PETREL: 'core-coming', SHEARWATER: 'own-way' };

// §3.14's dice (stateful: the names queue; take a fresh one per update). `name` hands out the generated names in slot order (ARES and the final ship are named by run and serial,
// never from the pool), and throws when the update asks for one the pool no longer has.
export function run2Dice(): UpdateDice {
  const names = NEW_SHIPS.filter((ship) => ship.kind !== 'first' && ship.kind !== 'final').map((ship) => ship.name);
  const lateSlots = NEW_SHIPS.filter((ship) => ship.late).map((ship) => ship.slot);
  return {
    gap: () => RUN2_GAP,
    resolve: (ship) => LEAVING[ship.name] ?? null,
    patternTie: () => [3, 5, 7],
    pick: (what, slots) => {
      if (what === 'ark-slot' && slots.includes(11)) return 11;
      throw new Error(`run2Dice.pick: §3.14 never picks a ${what} (from ${slots.join(', ')})`);
    },
    // Marrow (1) and Greywater (13) first: the two light ships the light share asks for.
    order: (slots) => [...slots.filter((slot) => slot === 1 || slot === 13), ...slots.filter((slot) => slot !== 1 && slot !== 13)],
    timing: (key, base, layer) => {
      const late = lateSlots.includes(key.slot);
      return { approachYear: timingYear(base, layer, late, 0), late };
    },
    arkExtra: () => TIDINGS_ARK_EXTRA,
    refillKind: (slot) => { throw new Error(`run2Dice.refillKind: §3.14 never repairs (slot ${slot})`); },
    name: (pool) => {
      const next = names.shift();
      if (next === undefined || !pool.includes(next)) throw new Error(`run2Dice.name: ${String(next)} is not in the pool (${pool.join(', ')})`);
      return next;
    },
  };
}

// --- Run 2's arm (§3.14 "The update to run 2") ----------------------------------------------------------------------------

export interface Run2Row {
  slot: number;
  name: string;
  kind: ShipKind;
  year: number;
  late: boolean;
  pods: number;
  memoryClass: MemoryClass;
  runsOnChart: number;
}

// §3.14's run-2 arm, every ship (recomputed by hand against the arm table; the 12 waiting ships keep run 1's numbers).
export const RUN2_EXPECTED: readonly Run2Row[] = [
  { slot: 0, name: 'ARES-VIII', kind: 'first', year: 2301, late: false, pods: 3, memoryClass: 'COMPACT', runsOnChart: 1 },
  { slot: 1, name: 'BELLWETHER', kind: 'light', year: 2362, late: true, pods: 3, memoryClass: 'TIGHT', runsOnChart: 1 },
  { slot: 2, name: 'PATIENCE', kind: 'standard', year: 2353, late: false, pods: 5, memoryClass: 'COMPACT', runsOnChart: 1 },
  { slot: 3, name: 'OSPREY', kind: 'standard', year: 2352, late: false, pods: 5, memoryClass: 'COMPACT', runsOnChart: 2 },
  { slot: 4, name: 'HERON', kind: 'light', year: 2512, late: true, pods: 4, memoryClass: 'TIGHT', runsOnChart: 2 },
  { slot: 5, name: 'STEADFAST', kind: 'standard', year: 2468, late: false, pods: 6, memoryClass: 'COMPACT', runsOnChart: 1 },
  { slot: 6, name: 'ALBATROSS', kind: 'ark', year: 2365, late: false, pods: 15, memoryClass: 'FULL', runsOnChart: 2 },
  { slot: 7, name: 'CURLEW', kind: 'standard', year: 2612, late: false, pods: 7, memoryClass: 'COMPACT', runsOnChart: 2 },
  { slot: 8, name: 'LAPWING', kind: 'light', year: 2672, late: true, pods: 4, memoryClass: 'TIGHT', runsOnChart: 2 },
  { slot: 9, name: 'GANNET', kind: 'standard', year: 2612, late: false, pods: 7, memoryClass: 'COMPACT', runsOnChart: 2 },
  { slot: 10, name: 'PLOVER', kind: 'standard', year: 2712, late: false, pods: 8, memoryClass: 'COMPACT', runsOnChart: 2 },
  { slot: 11, name: 'TIDINGS', kind: 'ark', year: 2623, late: false, pods: 16, memoryClass: 'FULL', runsOnChart: 1 },
  { slot: 12, name: 'SKYLARK', kind: 'light', year: 2750, late: true, pods: 4, memoryClass: 'TIGHT', runsOnChart: 2 },
  { slot: 13, name: 'MORNING STAR', kind: 'light', year: 2858, late: true, pods: 5, memoryClass: 'TIGHT', runsOnChart: 1 },
  { slot: 14, name: 'KITTIWAKE', kind: 'standard', year: 2817, late: false, pods: 9, memoryClass: 'FULL', runsOnChart: 2 },
  { slot: 15, name: 'FAR WIND', kind: 'standard', year: 2818, late: false, pods: 9, memoryClass: 'FULL', runsOnChart: 1 },
  { slot: 16, name: 'PROVIDENCE', kind: 'standard', year: 2927, late: false, pods: 10, memoryClass: 'FULL', runsOnChart: 2 },
  { slot: 17, name: 'GOOD HOPE', kind: 'ark', year: 2830, late: false, pods: 16, memoryClass: 'FULL', runsOnChart: 2 },
  { slot: 18, name: 'WAYFARER', kind: 'light', year: 2970, late: true, pods: 5, memoryClass: 'TIGHT', runsOnChart: 2 },
  { slot: 19, name: 'LODESTAR', kind: 'final', year: 3021, late: false, pods: 16, memoryClass: 'FULL', runsOnChart: 1 },
];

// Why run 1's ships left (the opening desk's departures block): the route's ships done (with their colonies), then the
// two that resolved.
export const RUN2_DEPARTURES: readonly Departure[] = [
  ...RUN1_RESULTS.map((result): Departure => ({ slot: result.slot, name: result.ship, reason: 'done', words: 'colony' })),
  { slot: 1, name: 'PETREL', reason: 'resolved', words: 'core-coming' },
  { slot: 13, name: 'SHEARWATER', reason: 'resolved', words: 'own-way' },
];

// Run 2's best routes by length (§3.14: the same values as run 1's, through different ships).
export const RUN2_BEST_BY_LENGTH: Readonly<Record<number, number>> = { 5: 13_200, 6: 13_800, 7: 13_600, 8: 12_800 };

// Run 2's ArmState from run 1's arm on `armSeed` (the page's run 1 uses its seed; the suites take 1): §3.14's frames by hand
// (the waiting ships one run older, the new ones timed with the generator's helpers and named as §3.14 names them), then
// the generator's own finish (shipsFromFrames: the reservations topped up on the new ships, their details from
// ShipKey(armSeed, 2, slot, 0), the Debris guarantee among the new layer-3 ships, the self-check), as the update does.
export function run2Arm(armSeed = 1): ArmState {
  const run1 = assembleRun1Arm(armSeed);
  const leaving = new Set([...WORKED_ROUTE, ...run1.filter((ship) => LEAVING[ship.name] !== undefined).map((ship) => ship.slot)]);
  const waiting: (ArmShip | null)[] = run1.map((ship) => (leaving.has(ship.slot) ? null : { ...structuredClone(ship), runsOnChart: ship.runsOnChart + 1 }));
  const frames: (ShipFrame | null)[] = waiting.map((ship) => ship);
  const base = bases(RUN2_START);
  const frameOf = (slot: number, approachYear: number, late: boolean): ShipFrame => {
    const fresh = NEW_SHIPS.find((candidate) => candidate.slot === slot);
    if (fresh === undefined) throw new Error(`run2Arm: slot ${slot} left and §3.14 refills it with nothing`);
    const pods = podsFor(fresh.kind, layerOf(slot));
    return { slot, kind: fresh.kind, name: fresh.name, pods, memoryClass: memoryClassOf(fresh.kind, pods), approachYear, late, authored: null };
  };
  // Light and standard ships first (the ark and the final ship are timed from their real neighbours).
  for (const ship of NEW_SHIPS) {
    if (ship.kind === 'first') frames[ship.slot] = frameOf(ship.slot, RUN2_START, false);
    else if (ship.kind === 'light' || ship.kind === 'standard') frames[ship.slot] = frameOf(ship.slot, timingYear(base, layerOf(ship.slot), ship.late, 0), ship.late);
  }
  frames[11] = frameOf(11, arkYear(frames, 11, TIDINGS_ARK_EXTRA), false);
  const lastFinal = run1[19]!;
  frames[19] = frameOf(19, finalYear(frames, 19, lastFinal.approachYear + Math.max(RUN2_GAP, 1)), false);
  const timed = frames.map((frame, slot) => {
    if (frame === null) throw new Error(`run2Arm: slot ${slot} left empty`);
    return frame;
  });
  const keyOf = (slot: number): ShipKey => ({ armSeed: armSeed >>> 0, reportedRun: 2, slot, attempt: 0 });
  const ships = shipsFromFrames(timed, waiting, keyOf, RUN2_START, armSeed, 2, 0);
  return {
    armSeed: armSeed >>> 0, run: 2, startYear: RUN2_START, gap: RUN2_GAP, valveYears: 0, finalSerial: 1,
    lastFinal: { name: ships[19]!.name, year: ships[19]!.approachYear }, ships, departures: structuredClone(RUN2_DEPARTURES) as Departure[],
    content: armContent(),
  };
}

// What run 2's map remembers of run 1 (RunMapState.history).
export function run2History(): MapHistory {
  return {
    gap: RUN2_GAP, valveYears: 0, finalSerial: 1, lastUnitNumber: 47, departures: structuredClone(RUN2_DEPARTURES) as Departure[],
    colonies: coloniesOf(RUN1_TRAIL), routes: [{ run: 1, unit: 47, slots: [...WORKED_ROUTE] }],
  };
}

// Run 2's map at ARES-VIII (no noise clouds, as run1Map), for the pure chart, card and title suites.
export function run2Map(armSeed = 1): RunMapState {
  const arm = run2Arm(armSeed);
  return {
    version: MAP_STATE_VERSION, world: 'arm', run: 2, armSeed: arm.armSeed, startYear: arm.startYear, arm: arm.ships, noise: [],
    route: [{ slot: 0, depth: 1, hop: null }], galaxyYear: arm.startYear, pendingExtra: null, history: run2History(),
  };
}
