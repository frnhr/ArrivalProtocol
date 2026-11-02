import type { GameState, RunState } from '@state/schema';
import type { RunMapState } from '@/types/map';
import type {
  LastCause, LastUnit, UnitTrail, TrailStop, ColonyRecord, RouteRecord, NotableEvent, ArmState, MapHistory, Visit, LetterSource,
} from '@/types/lineage';
import { CLASSIC_FIVE } from '@data/classic-five';
import { UNIT_046_TRAIL } from '@data/ship-names';
import { currentStop, armShipAt, isEndSlot, worldSlotOf } from '@systems/map-streams';
import { layerOf } from '@systems/map-geometry';
import { FIRST_SLOT } from '@data/arm';
import { FIRST_UNIT_NUMBER, TRAIL_046_CROSS_PAST_LY, COLONISTS_PER_POD } from '@data/tuning';

// The lineage (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.4; 02-map §3.12, 05-story §3.3, §3.5): what a unit
// leaves the next one, read from data, never from the archive's live session. The trail (route, years, outcomes, the grey
// cross), the colonies it founded, where its ghost speaks, the beacon on ship 1 and the letters to the unit ahead. Pure: no
// store, no storage. unitTrailOf is the one reader the chart, the ghost, the letters and the beacon share.
// Cycle guard (plan §5.4): this file never imports data/script.ts, systems/meta.ts or systems/run.ts (meta.ts imports it).
// The foundation laid it down (trail046, unitTrailOf, visitsOf, mapHistoryOf, coloniesOf, the beacon, the letters and the
// older colonies real; trailOf's cross and writers, notableEvents and the ghost by the cross marked TODO(3c-WORLD)); Track
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

// The route's visits as the world update reads them (RUN END, abandoning, __ap.updateArm): each stop, with a colony when its
// ship landed someone in an LZ (a ship not yet ended has none).
export function visitsOf(run: Readonly<Pick<RunState, 'map' | 'ships'>>): Visit[] {
  return run.map.route.map((stop, index) => {
    const result = run.ships[index];
    if (result !== undefined && result.slot !== stop.slot) throw new Error(`visitsOf: ship result ${index} is slot ${result.slot}, the route's stop is ${stop.slot}`);
    return { slot: stop.slot, colony: (result?.landedInLz ?? 0) > 0 };
  });
}

// What a run's map remembers of the runs before it (RunMapState.history), from the archive's parts (systems/meta.ts
// lineageOf; the arm's own gap, valve years, serial and departures, so systems/map-run.ts createRunMap can check they agree).
// No arm (run 1, or a fresh roll) is no gap and no departures.
export function mapHistoryOf(
  arm: Readonly<ArmState> | null, lastUnit: Readonly<LastUnit> | null, colonies: readonly ColonyRecord[], routes: readonly RouteRecord[],
): MapHistory {
  return {
    gap: arm?.gap ?? 0,
    valveYears: arm?.valveYears ?? 0,
    finalSerial: arm?.finalSerial ?? 0,
    lastUnitNumber: lastUnit?.number ?? null,
    departures: structuredClone(arm?.departures ?? []),
    colonies: structuredClone([...colonies]),
    routes: structuredClone([...routes]),
  };
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

// Run 1 reads 046's (`SET BY UNIT-046 · 1 YEAR AGO`). None on the classic world, past ship 1, or when the last unit's first
// ship never reached orbit. A stop dated after the run's start is a bug (the unit ahead set out first) and throws.
export function beaconOnFirstShip(state: Readonly<Pick<GameState, 'run'>>): Beacon | null {
  const run = state.run;
  if (run.map.world !== 'arm' || run.shipIndex !== 0) return null;
  const trail = unitTrailOf(run);
  const stop = trail?.stops.find((candidate) => candidate.slot === FIRST_SLOT);
  if (trail === null || stop === undefined || (stop.outcome !== 'locked' && stop.outcome !== 'partial')) return null;
  const yearsAgo = run.map.startYear - stop.year;
  if (yearsAgo < 0) throw new Error(`beaconOnFirstShip: unit ${trail.unit}'s beacon is dated ${stop.year}, after this run's start ${run.map.startYear}`);
  return { unit: trail.unit, yearsAgo };
}

// Letters to the unit ahead (05 §3.3): one per stop of the archive's last trail with a colony and someone landed, id
// `letter:<trail run>:<slot>`, landed in the stop's year, to the trail's unit, signed by the stop's writer. Only the
// archive's trail: run 1 keeps 046's MERIDIAN (systems/inbox.ts letterSources, `letter:meridian`). Track UI wires
// letterSources to it; the light rule (when each is read) is inbox.ts's.
export function letterSourcesFromTrail(run: Readonly<Pick<RunState, 'lastUnit' | 'map'>>): LetterSource[] {
  const trail = run.lastUnit?.trail ?? null;
  if (run.map.world !== 'arm' || trail === null) return [];
  return trail.stops.flatMap((stop): LetterSource[] => (stop.colony === null || stop.landed <= 0 ? [] : [{
    id: `letter:${trail.run}:${stop.slot}`, colony: stop.colony, worldSlot: stop.slot, landedYear: stop.year, toUnit: trail.unit,
    writer: stop.writer === null ? null : { ...stop.writer },
  }]));
}

// Older colonies the chart draws as faint dots: the history's colonies whose year the galaxy year has reached.
export function olderColonies(map: Readonly<RunMapState>): ColonyRecord[] {
  return map.history.colonies.filter((colony) => colony.year <= map.galaxyYear);
}
