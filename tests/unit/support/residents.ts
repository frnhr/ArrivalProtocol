// Slice 5 (plan §6.2 "Order dependencies"): residents for the suites. The tracks test their kind on run 1's arm with its
// RESIDENT_BUILT line raised for the suite alone, before they raise it in data/residents.ts.
// • withResidentsBuilt(kinds, fn): `fn` runs with those kinds built (the rest as data/residents.ts has them), and the flags
//   are put back after, even when it throws. Every ship built inside (state/initial.ts createShipSlices: a world reset, a
//   resume, startShip) plays those kinds; a ship built before keeps what it was built with.
// • withResidents(flags, fn): the same with each named kind set as given, built or not (a check about a kind that is not
//   built holds whatever data/residents.ts raises).
// • armShipSlices(seed, slot): run 1's arm ship in `slot` (run1Map(seed)) as the beam from ARES-VII would build it: its ship
//   slices, store-free, on a calm verdict (no HOLLOW aboard) and a fresh unit's files over a link wide enough for all of them
//   (a far ship's real hop from ARES-VII is too thin), for the suites that only look at the built ship (its rack A, its
//   resident slice).
import type { RunState } from '@state/schema';
import type { ShipSlices } from '@state/initial';
import type { ResidentKind } from '@/types/resident';
import type { ShipThreat } from '@/types/threat';
import { createRunState, createShipSlices } from '@state/initial';
import { RESIDENT_BUILT } from '@data/residents';
import { mapAtShip, shipDefAt } from '@systems/map-run';
import { hopBetween } from '@systems/map-hop';
import { freshUnitRacks } from '@systems/carry';
import { nominalShipThreat } from '@systems/threat-plan';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { run1Map } from '../map/run1-fixture';

export function withResidents<T>(set: Readonly<Partial<Record<ResidentKind, boolean>>>, fn: () => T): T {
  const flags = RESIDENT_BUILT as Record<ResidentKind, boolean>;
  const before = { ...flags };
  Object.assign(flags, set);
  try {
    return fn();
  } finally {
    Object.assign(flags, before);
  }
}

export function withResidentsBuilt<T>(kinds: readonly ResidentKind[], fn: () => T): T {
  return withResidents(Object.fromEntries(kinds.map((kind) => [kind, true])), fn);
}

// No kind built: the world before slice 5 (a v4 save's).
export const NO_RESIDENTS: Readonly<Record<ResidentKind, boolean>> = { corrupted: false, left: false, sleeping: false };

// Wider than any fresh unit's files: armShipSlices is about the ship, not the beam.
const WIDE_LINK_BLOCKS = 1000;

export function armShipSlices(seed: number, slot: number): { run: RunState; slices: ShipSlices } {
  const start = run1Map(seed);
  const hop = hopBetween(start, 0, slot);
  const map = mapAtShip(start, slot, hop);
  // The run is only the template the slices are built from (createRunState's ship results and earnings, which the fixture
  // world now fills for the route it builds, are left empty as they always were here: map/arm-parity pins these slices).
  const template = createRunState(seed, 'boot', 1, FIRST_RUN_LINEAGE);
  const run: RunState = { ...template, map, ships: [], skills: { ...template.skills, earned: [] } };
  const calm: ShipThreat = { ...nominalShipThreat(1), rootBlocks: null };
  const carried = freshUnitRacks(shipDefAt(map, slot), WIDE_LINK_BLOCKS, calm);
  return { run, slices: createShipSlices(run, carried, calm) };
}
