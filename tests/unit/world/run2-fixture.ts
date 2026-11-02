// 02 §3.14 as data (slice-3c-plan §4.3): run 1's results on the worked route, UNIT-047's trail, and the update to run 2 with
// its rolls fixed by hand, so Track UI builds the chart, card, title and tally against real shapes before Track WORLD's
// update merges, and WORLD's `world/update-fixture` checks updateArm cell by cell against the same numbers.
// • RUN2_DICE scripts every roll of §3.14's update (gap 1; PETREL `core-coming`, SHEARWATER `own-way`, every other ship
//   stays; the pattern kept 3, 5, 7 with Cinder taking the ark; the refill puts Marrow and Greywater first, as the light
//   ships; jitter 0 with BELLWETHER and MORNING STAR late; TIDINGS' ark extra 3; §3.14's names).
// • run2Arm builds run 2's ArmState the way the update must: the 12 waiting ships byte-identical to run 1's except
//   runsOnChart 2, the 8 new ships timed with the generator's own helpers (bases, timingYear, arkYear, finalYear) and their
//   details rolled from ShipKey(armSeed, 2, slot, 0) as the generator does (rollShipDetails; ARES and the final ship take the
//   written rows). Their reservations are empty: Track WORLD's topUpReservations fills them (update this fixture then).
// • RUN2_EXPECTED is §3.14's table, recomputed by hand: tests/unit/world/run2-fixture.test.ts checks run2Arm against it.
// Track WORLD owns this file after the foundation.
import type { ArmShip, RunMapState, ShipKey, ShipKind, MemoryClass, Reservations } from '@/types/map';
import type { ShipResult } from '@state/schema';
import type { ArmState, Departure, LastUnit, UnitTrail, MapHistory } from '@/types/lineage';
import type { UpdateDice } from '@systems/map-update';
import { armContent } from '@systems/map-update';
import { coloniesOf } from '@systems/lineage';
import {
  assembleRun1Arm, bases, timingYear, arkYear, finalYear, podsFor, memoryClassOf, rollShipDetails,
} from '@systems/map-generator';
import { armShipId } from '@systems/map-streams';
import { RUN1_AUTHORED, type AuthoredOverride } from '@data/run1-arm';
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
}

// RIVERSIDE and FIRST LIGHT are run 1's written colonies (05 §3.11); the four between are this fixture's picks from
// COLONY_NAMES (§3.14 says only "RIVERSIDE and five more colonies").
export const RUN1_RESULTS: readonly Run1Result[] = [
  { slot: 0, ship: 'ARES-VII', year: 2300, outcome: 'locked', landed: 3 * COLONISTS_PER_POD, colony: 'RIVERSIDE' },
  { slot: 2, ship: 'HALCYON', year: 2352, outcome: 'locked', landed: 5 * COLONISTS_PER_POD, colony: 'LANTERN' },
  { slot: 5, ship: 'KESTREL', year: 2467, outcome: 'locked', landed: 6 * COLONISTS_PER_POD, colony: 'GREENSTEP' },
  { slot: 11, ship: 'VESPER', year: 2625, outcome: 'locked', landed: 16 * COLONISTS_PER_POD, colony: 'STARFORD' },
  { slot: 15, ship: 'CORMORANT', year: 2817, outcome: 'locked', landed: 9 * COLONISTS_PER_POD, colony: 'HARBOUR' },
  { slot: 19, ship: 'LAST LIGHT', year: 3020, outcome: 'locked', landed: 16 * COLONISTS_PER_POD, colony: 'FIRST LIGHT' },
];
if (RUN1_RESULTS.map((result) => result.slot).join() !== WORKED_ROUTE.join()) throw new Error('run2-fixture: RUN1_RESULTS is not the worked route');

// UNIT-047's trail after a PURGE on the worked route: no grey cross.
export const RUN1_TRAIL: UnitTrail = {
  unit: 47, run: 1, startYear: RUN_START_YEAR, lost: null,
  stops: RUN1_RESULTS.map((result) => ({
    slot: result.slot, shipName: result.ship, year: result.year, outcome: result.outcome, landed: result.landed, colony: result.colony, writer: null,
  })),
};

// The archive's last unit after run 1 (the title's `last: UNIT-047 · 11,000 landed · PURGE`).
export const RUN1_LAST_UNIT: LastUnit = {
  number: 47, landed: RUN1_RESULTS.reduce((sum, result) => sum + result.landed, 0), shipName: 'LAST LIGHT', cause: 'won-purge',
  stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: RUN1_TRAIL, skills: null,
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

const NO_RESERVATIONS = (): Reservations => ({ resident: null, unknownEvent: null, fragments: 0, site: 'good', tracePlace: null });

// The written row an ARES-n or a final ship flies (map-generator's writtenRow: ARES-VII's, LAST LIGHT's without FIRST LIGHT).
function writtenRow(kind: ShipKind): AuthoredOverride | null {
  if (kind !== 'first' && kind !== 'final') return null;
  const row = structuredClone(RUN1_AUTHORED[kind === 'first' ? 'ares-vii' : 'last-light']) as AuthoredOverride;
  if (kind === 'final' && row.landing) row.landing = { ...row.landing, colonyFirstRun: null };
  return row;
}

// Run 2's ArmState from run 1's arm on `armSeed` (the page's run 1 uses its seed; the suites take 1).
export function run2Arm(armSeed = 1): ArmState {
  const run1 = assembleRun1Arm(armSeed);
  const leaving = new Set([...WORKED_ROUTE, ...run1.filter((ship) => LEAVING[ship.name] !== undefined).map((ship) => ship.slot)]);
  const frames: (Pick<ArmShip, 'slot' | 'approachYear'> | null)[] = run1.map((ship) => (leaving.has(ship.slot) ? null : ship));
  const base = bases(RUN2_START);
  const timed = new Map<number, { approachYear: number; late: boolean }>();
  // Light and standard ships first (the ark and the final ship are timed from their real neighbours).
  for (const ship of NEW_SHIPS) {
    if (ship.kind === 'first') timed.set(ship.slot, { approachYear: RUN2_START, late: false });
    else if (ship.kind === 'light' || ship.kind === 'standard') timed.set(ship.slot, { approachYear: timingYear(base, layerOf(ship.slot), ship.late, 0), late: ship.late });
    const at = timed.get(ship.slot);
    if (at) frames[ship.slot] = { slot: ship.slot, approachYear: at.approachYear };
  }
  const tidings = arkYear(frames, 11, TIDINGS_ARK_EXTRA);
  timed.set(11, { approachYear: tidings, late: false });
  frames[11] = { slot: 11, approachYear: tidings };
  const lastFinal = run1[19]!;
  const finalAt = finalYear(frames, 19, lastFinal.approachYear + Math.max(RUN2_GAP, 1));
  timed.set(19, { approachYear: finalAt, late: false });
  const ships = run1.map((ship): ArmShip => {
    if (!leaving.has(ship.slot)) return { ...structuredClone(ship), runsOnChart: ship.runsOnChart + 1 };
    const fresh = NEW_SHIPS.find((candidate) => candidate.slot === ship.slot);
    const at = timed.get(ship.slot);
    if (fresh === undefined || at === undefined) throw new Error(`run2Arm: slot ${ship.slot} left and §3.14 refills it with nothing`);
    const key: ShipKey = { armSeed: armSeed >>> 0, reportedRun: 2, slot: ship.slot, attempt: 0 };
    const pods = podsFor(fresh.kind, layerOf(ship.slot));
    const memoryClass = memoryClassOf(fresh.kind, pods);
    const template = fresh.kind === 'first' ? 'impact-a' : fresh.kind === 'final' ? 'impact-b' : undefined;
    const { site, ...details } = rollShipDetails(key, fresh.kind, layerOf(ship.slot), {
      slot: ship.slot, pods, memoryClass, ...(template ? { template } : {}),
    }, writtenRow(fresh.kind));
    return {
      slot: ship.slot, id: armShipId(key), name: fresh.name, kind: fresh.kind, template: details.template, pods, memoryClass,
      approachYear: at.approachYear, late: at.late, timedAgainstStart: RUN2_START, reportedRun: 2, runsOnChart: 1, attempt: 0,
      modifiers: [...details.modifiers], omega0: details.omega0, debrisRack: details.debrisRack,
      arrivalDamage: details.arrivalDamage.map((rule) => ({ ...rule })), landing: structuredClone(details.landing),
      podRacks: { ...details.podRacks }, lead: details.lead, authored: null, reserved: { ...NO_RESERVATIONS(), site },
    };
  });
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
