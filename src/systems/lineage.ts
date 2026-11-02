import type { GameState, RunState } from '@state/schema';
import type { RunMapState } from '@/types/map';
import type { LastCause, LastUnit, UnitTrail, TrailStop, ColonyRecord, NotableEvent } from '@/types/lineage';
import type { LetterSource } from '@systems/inbox';
import { CLASSIC_FIVE } from '@data/classic-five';
import { UNIT_046_TRAIL } from '@data/ship-names';
import { currentStop, armShipAt, isEndSlot, worldSlotOf } from '@systems/map-streams';
import { layerOf } from '@systems/map-geometry';
import { FIRST_UNIT_NUMBER, TRAIL_046_CROSS_PAST_LY, COLONISTS_PER_POD } from '@data/tuning';

// The lineage (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.4; 02-map §3.12, 05-story §3.3, §3.5): what a unit
// leaves the next one, read from data, never from the archive's live session. The trail (route, years, outcomes, the grey
// cross), the colonies it founded, where its ghost speaks, the beacon on ship 1 and the letters to the unit ahead. Pure: no
// store, no storage. unitTrailOf is the one reader the chart, the ghost, the letters and the beacon share.
// Cycle guard (plan §5.4): this file never imports data/script.ts, systems/meta.ts or systems/run.ts (meta.ts imports it).
// The foundation laid it down (trail046, unitTrailOf and the ghost real; the rest stubs marked TODO(3c-WORLD)); Track
// WORLD owns it after.

// --- 046's written trail: run 1's last trail (05 §3.11) ----------------------------------------------------------------

// 046's written trail names colonies, never their size: a colony means at least one pod landed in an LZ (02 §3.12), so
// each of its stops counts one pod's colonists. Only `landed > 0` is ever read of it (a letter needs a colony).
const TRAIL_046_LANDED = COLONISTS_PER_POD;

// UNIT-046's trail (05 §3.11, data/ship-names.ts UNIT_046_TRAIL): WAYPOINT on Kepler-186f (2299), MERIDIAN on Marrow
// (2350), TALLGRASS on Ostrava (2464), and the grey cross past Calder (RELAY 19, 2598), where HOLLOW took it. It set out in
// 2299, a year before 047 (`A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 1 YEAR AGO`). Its ships are not written.
export function trail046(): UnitTrail {
  const stops = UNIT_046_TRAIL.filter((mark) => mark.colony !== null).map((mark): TrailStop => ({
    slot: mark.slot, shipName: null, year: mark.year, outcome: 'locked', landed: TRAIL_046_LANDED, colony: mark.colony, writer: null,
  }));
  const cross = UNIT_046_TRAIL.find((mark) => mark.colony === null);
  const first = stops[0];
  if (cross === undefined || first === undefined) throw new Error('trail046: 046\'s written trail lost its first colony or its grey cross');
  return {
    unit: FIRST_UNIT_NUMBER - 1, run: 0, startYear: first.year, stops,
    lost: { slot: cross.slot, year: cross.year, pastLy: TRAIL_046_CROSS_PAST_LY, cause: 'overwritten' },
  };
}

// The last unit's trail as this run reads it: the archive's (run.lastUnit.trail), else 046's written one on run 1, else
// none (a classic-world record, a run 2 whose last unit kept no trail).
export function unitTrailOf(run: Readonly<Pick<RunState, 'lastUnit' | 'map'>>): UnitTrail | null {
  return run.lastUnit?.trail ?? (run.map.run === 1 ? trail046() : null);
}

// --- This run's trail (what the archive keeps at RUN END and in activeRun) -----------------------------------------------

// This run's trail so far, one stop per route stop: the arm ship's name and approach year, and from its ShipResult the
// outcome, the colonists landed and the colony (the stop of a ship not yet ended has outcome null). null on the classic
// world, which keeps no trail.
// TODO(3c-WORLD): `lost` for the causes flagship-lost, stayed, overwritten and abandoned at the last stop, and each stop's
// writer (the first featured colonist of the first pod down in an LZ), plan §2.4. The foundation's stub leaves both empty.
export function trailOf(run: Readonly<Pick<RunState, 'unitNumber' | 'map' | 'ships'>>, cause: LastCause): UnitTrail | null {
  void cause;
  const map = run.map;
  if (map.world === 'classic') return null;
  const stops = map.route.map((stop, index): TrailStop => {
    const ship = armShipAt(map, stop.slot);
    const result = run.ships[index];
    if (result !== undefined && result.slot !== stop.slot) throw new Error(`trailOf: ship result ${index} is slot ${result.slot}, the route's stop is ${stop.slot}`);
    return {
      slot: stop.slot, shipName: ship.name, year: ship.approachYear, outcome: result?.outcome ?? null, landed: result?.landedInLz ?? 0,
      colony: result !== undefined && result.landedInLz > 0 ? result.colony : null, writer: null,
    };
  });
  return { unit: run.unitNumber, run: map.run, startYear: map.startYear, stops, lost: null };
}

// The colonies a trail founded (archive v2's colonies): one per stop with a colony and someone landed.
export function coloniesOf(trail: Readonly<UnitTrail>): ColonyRecord[] {
  return trail.stops.flatMap((stop) => (stop.colony === null || stop.landed <= 0 ? [] : [{
    run: trail.run, unit: trail.unit, slot: stop.slot, year: stop.year, landed: stop.landed, name: stop.colony,
  }]));
}

// The run's notable events (05 §3.8: at most NOTABLE_EVENTS_MAX, ranked): a DEAL accepted, the best colony, a ship lost.
// TODO(3c-WORLD): plan §2.4; residents' events are slice 5's.
export function notableEvents(run: Readonly<RunState>): NotableEvent[] {
  void run;
  return [];
}

// --- The ghost (05 §3.5) -------------------------------------------------------------------------------------------------

// On the fixed five: the index of the ship where the last unit's run ended (its shipName), or the final ship when the name
// is not one of `shipNames` (a record from an older fleet), and never ship 1 (index 0: a run abandoned on ARES-VII speaks
// at HALCYON). The boot plays it at the first ship this run whose index is at or past this one, once (run.ghostSpoken).
export function ghostShipIndex(lastUnit: Readonly<Pick<LastUnit, 'shipName'>>, shipNames: readonly string[] = CLASSIC_FIVE.map((ship) => ship.name)): number {
  if (shipNames.length < 2) throw new Error(`ghostShipIndex: a fleet of ${shipNames.length} ship(s) has no ship past ship 1 for the ghost`);
  const at = shipNames.indexOf(lastUnit.shipName);
  return Math.max(1, at < 0 ? shipNames.length - 1 : at);
}

// Is this ship at or past where the ghost speaks (05 §3.5: "at the first boot in or past the layer where it was lost …
// never at ship 1: the new unit can't know yet")? On the classic world (or a run with no map: the archive suites), the
// fixed five's index (ghostShipIndex). On the arm, never ship 1, and a last unit with no trail speaks at the final ship.
// TODO(3c-WORLD): by the grey cross (trail.lost: the layer it was lost in; a trail with no cross speaks at the final ship),
// plan §2.4. Until then 3a's interim rule (the review's M3), read from the trail: the layer of the ship its run ended on
// (the trail's last stop), as LastUnit.layer held it before archive v2.
export function ghostPlaceReached(
  run: Readonly<Pick<RunState, 'lastUnit' | 'shipIndex'> & Partial<Pick<RunState, 'map'>>>,
  lastUnit: Readonly<Pick<LastUnit, 'shipName' | 'trail'>>,
): boolean {
  const map = run.map;
  if (map === undefined || map.world === 'classic') return run.shipIndex >= ghostShipIndex(lastUnit);
  if (run.shipIndex === 0) return false;
  const slot = currentStop({ map, shipIndex: run.shipIndex }).slot;
  const ended = lastUnit.trail?.stops.at(-1);
  if (ended === undefined) return isEndSlot(map, slot);
  return layerOf(worldSlotOf(map, slot)) >= layerOf(ended.slot);
}

// --- The beacon, the letters, the older colonies -------------------------------------------------------------------------

// The last unit's beacon on ship 1's LANDING REPORT (05 §3.5: `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-047 · 3
// YEARS AGO`): depth 1 on the arm, the trail has a stop at w0 that ended in orbit, `yearsAgo = map.startYear − stop.year`.
export interface Beacon {
  unit: number;
  yearsAgo: number;
}

// TODO(3c-WORLD): plan §2.4 (the foundation's stub: no beacon).
export function beaconOnFirstShip(state: Readonly<GameState>): Beacon | null {
  void state;
  return null;
}

// Letters to the unit ahead (05 §3.3): one per trail stop with a colony and someone landed, id `letter:<run>:<slot>`,
// landed in the stop's year, to the trail's unit. Run 1 keeps 046's MERIDIAN (systems/inbox.ts letterSources).
// TODO(3c-WORLD): plan §2.4; Track UI wires systems/inbox.ts letterSources to it (the foundation's stub: none).
export function letterSourcesFromTrail(run: Readonly<RunState>): LetterSource[] {
  void run;
  return [];
}

// Older colonies the chart draws as faint dots: the history's colonies whose year the galaxy year has reached.
// TODO(3c-WORLD): plan §2.4 (the foundation's stub: none).
export function olderColonies(map: Readonly<RunMapState>): ColonyRecord[] {
  void map;
  return [];
}
