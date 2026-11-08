// Slice 3c Track WORLD: archive v2's data side (slice-3c-plan §2.4, §6.1 `world/lineage`; 05 §3.3, §3.5, §3.8): trailOf
// from run 1's results on the worked route (names, years, outcomes, colonies, writers), the grey cross for each lost cause
// and none for a won run; the ghost by the trail's cross (never ship 1; a won run speaks at the final ship); the beacon
// (`1 YEAR AGO`, `THIS YEAR`, `3 YEARS AGO`, none without a landing on ship 1); the letters to the unit ahead (one per colony,
// signed, `letter:<run>:<slot>`; none from 046's written trail, whose MERIDIAN stays inbox.ts's); the notable events and their
// cap; the update's input from a run (visitsOf, updateAfterRun); the title's launch line (launchOf). Pure (<1 s).
import { isDeepStrictEqual } from 'node:util';
import { check, finish } from '../landing/checks';
import type { RunState, ShipResult } from '@state/schema';
import type { RunMapState } from '@/types/map';
import type { LastCause, LastUnit } from '@/types/lineage';
import {
  trailOf, trail046, unitTrailOf, ghostPlaceReached, beaconOnFirstShip, letterSourcesFromTrail, notableEvents, coloniesOf, visitsOf, launchOf,
} from '@systems/lineage';
import { updateAfterRun } from '@systems/map-update';
import { hopBetween } from '@systems/map-hop';
import { createRunStats, createRunResidents } from '@state/initial';
import { NOTABLE_EVENTS_MAX } from '@data/tuning';
import { run1Map, WORKED_ROUTE } from '../map/run1-fixture';
import { RUN1_RESULTS, RUN1_TRAIL, RUN1_LAST_UNIT, run2Map, type Run1Result } from './run2-fixture';

// A ShipResult for one of run 1's ships: its pods down in LZ-A, the first carrying the fixture's writer.
function resultOf(row: Readonly<Run1Result>, depth: number, outcome: ShipResult['outcome'] = row.outcome, landed = row.landed): ShipResult {
  return {
    shipId: row.ship.toLowerCase(), shipName: row.ship, slot: row.slot, depth, outcome, stars: 0, fuelLeftPct: 0, ringMiss: null, survey: null,
    colonistsAboard: row.landed, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: 0, landedInLz: landed, points: 0,
    colony: landed > 0 ? row.colony : null,
    pods: landed > 0 ? [{
      pod: 0, family: 'Okafor', colonists: 200, fate: 'down', place: 'lz', lz: 'LZ-A', touch: 'soft', points: 0, parkedWhy: null,
      restored: false, featured: [{ ...row.writer, line: null }, { name: 'Nobody, Second', age: 40, line: null }],
    }] : [],
  };
}

// Run 1's map with the unit on the route's `count`-th ship.
function mapAlong(slots: readonly number[], base: RunMapState = run1Map(1)): RunMapState {
  return {
    ...base,
    route: slots.map((slot, i) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(base, slots[i - 1]!, slot) })),
    galaxyYear: base.arm[slots.at(-1)!]!.approachYear,
  };
}
const results = RUN1_RESULTS.map((row, i) => resultOf(row, i + 1));
const run1: Pick<RunState, 'unitNumber' | 'map' | 'ships' | 'stats' | 'residents'> = {
  unitNumber: 47, map: mapAlong(WORKED_ROUTE), ships: results, stats: createRunStats(), residents: createRunResidents(),
};

// --- trailOf ------------------------------------------------------------------------------------------------------------------
const won = trailOf(run1, 'won-purge');
check('trailOf on run 1\'s worked route: the six stops as UNIT-047\'s trail (names, years, outcomes, landed, colonies, writers), no cross',
  isDeepStrictEqual(won, RUN1_TRAIL), JSON.stringify(won).slice(0, 300));
check('…its colonies are the six of the archive (RIVERSIDE … FIRST LIGHT, 11,000 landed)', coloniesOf(won!).length === 6
  && coloniesOf(won!).reduce((sum, colony) => sum + colony.landed, 0) === 11_000);
const crossed = (['flagship-lost', 'stayed', 'overwritten', 'abandoned'] as LastCause[]).every((cause) => {
  const trail = trailOf(run1, cause)!;
  return isDeepStrictEqual(trail.lost, { slot: 19, year: 3020, pastLy: 0, cause });
});
const uncrossed = (['won-purge', 'won-merge', 'unresolved'] as LastCause[]).every((cause) => trailOf(run1, cause)!.lost === null);
check('the grey cross: flagship-lost, stayed (LINK LOST), overwritten and abandoned put it at the last stop; a won or unresolved run none',
  crossed && uncrossed);
const midway = trailOf({ ...run1, map: mapAlong(WORKED_ROUTE.slice(0, 4)), ships: results.slice(0, 3) }, 'abandoned')!;
check('…a run abandoned aboard VESPER: four stops, VESPER\'s with no outcome yet, the cross at Cinder in 2625',
  midway.stops.length === 4 && midway.stops[3]!.outcome === null && midway.stops[3]!.landed === 0 && midway.stops[3]!.writer === null
  && isDeepStrictEqual(midway.lost, { slot: 11, year: 2625, pastLy: 0, cause: 'abandoned' }));
const crashed = trailOf({ ...run1, ships: results.map((result, i) => (i === 2 ? resultOf(RUN1_RESULTS[2]!, 3, 'crashed', 0) : result)) }, 'won-purge')!;
check('…a ship that landed nobody has no colony and no writer', crashed.stops[2]!.colony === null && crashed.stops[2]!.writer === null
  && crashed.stops[2]!.outcome === 'crashed');
check('…the classic world keeps no trail', trailOf({ ...run1, map: { ...run1.map, world: 'classic' } }, 'won-purge') === null);

// --- The ghost by the cross ---------------------------------------------------------------------------------------------------
const lostAt = (slot: number): Pick<LastUnit, 'shipName' | 'trail'> => ({
  shipName: 'CORMORANT', trail: { ...RUN1_TRAIL, lost: { slot, year: 2817, pastLy: 0, cause: 'flagship-lost' } },
});
const reached = (slots: number[], lastUnit: Pick<LastUnit, 'shipName' | 'trail'>): boolean =>
  ghostPlaceReached({ map: mapAlong(slots), shipIndex: slots.length - 1, lastUnit: null }, lastUnit);
check('the ghost speaks at the first boot in or past the cross\'s layer: lost at Avalon (6) → not at VESPER (5), at KITTIWAKE (6)',
  !reached([0, 2, 5, 11], lostAt(15)) && reached([0, 2, 5, 11, 14], lostAt(15)));
check('…never at ship 1, even lost there; past it at once', !reached([0], lostAt(0)) && reached([0, 2], lostAt(0)));
check('…a won run (no cross) and a last unit with no trail speak at the final ship',
  !reached([0, 2, 5, 11, 15], { shipName: 'LAST LIGHT', trail: RUN1_TRAIL }) && reached([0, 2, 5, 11, 15, 19], { shipName: 'LAST LIGHT', trail: RUN1_TRAIL })
  && !reached([0, 2, 5, 11, 15], { shipName: 'LAST LIGHT', trail: null }) && reached([0, 2, 5, 11, 15, 19], { shipName: 'LAST LIGHT', trail: null }));
check('…on run 1, 046\'s cross past Calder (layer 4): at Larkspur, not at Brine', reached([0, 2, 7], { shipName: 'RELAY 19', trail: trail046() })
  && !reached([0, 2, 5], { shipName: 'RELAY 19', trail: trail046() }));

// --- The beacon -----------------------------------------------------------------------------------------------------------
const run2At = (startYear: number, lastUnit: LastUnit | null = RUN1_LAST_UNIT) => {
  const map = run2Map(1);
  return { run: { map: { ...map, startYear }, shipIndex: 0, lastUnit } as unknown as RunState };
};
check('the beacon on ship 1: 046\'s on run 1 (1 YEAR AGO), 047\'s by the gap from run 2 (THIS YEAR at 0, 3 YEARS AGO at 3)',
  isDeepStrictEqual(beaconOnFirstShip({ run: { map: run1Map(1), shipIndex: 0, lastUnit: null } as unknown as RunState }), { unit: 46, yearsAgo: 1 })
  && isDeepStrictEqual(beaconOnFirstShip(run2At(2300)), { unit: 47, yearsAgo: 0 })
  && isDeepStrictEqual(beaconOnFirstShip(run2At(2303)), { unit: 47, yearsAgo: 3 }));
const noLanding: LastUnit = { ...RUN1_LAST_UNIT, trail: { ...RUN1_TRAIL, stops: RUN1_TRAIL.stops.map((stop, i) => (i === 0 ? { ...stop, outcome: 'crashed' as const } : stop)) } };
check('…none when the last unit\'s ship 1 never reached orbit, none past ship 1', beaconOnFirstShip(run2At(2301, noLanding)) === null
  && beaconOnFirstShip({ run: { ...run2At(2301).run, shipIndex: 1 } }) === null);

// --- Letters to the unit ahead ----------------------------------------------------------------------------------------------
const letters = letterSourcesFromTrail({ map: run2Map(1), lastUnit: RUN1_LAST_UNIT });
check('letters to the unit ahead: one per colony of UNIT-047\'s route, landed in its year, signed by its writer, `letter:1:<slot>`',
  letters.length === 6 && letters.every((letter, i) => letter.id === `letter:1:${WORKED_ROUTE[i]}` && letter.toUnit === 47
    && letter.colony === RUN1_RESULTS[i]!.colony && letter.landedYear === RUN1_RESULTS[i]!.year && letter.writer?.name === RUN1_RESULTS[i]!.writer.name));
check('…none from a colony that landed nobody; none on run 1 (046\'s MERIDIAN is inbox.ts\'s, `letter:meridian`)',
  letterSourcesFromTrail({ map: run2Map(1), lastUnit: { ...RUN1_LAST_UNIT, trail: crashed } }).length === 5
  && letterSourcesFromTrail({ map: run1Map(1), lastUnit: null }).length === 0
  && unitTrailOf({ map: run1Map(1), lastUnit: null })?.stops.some((stop) => stop.colony === 'MERIDIAN') === true);

// --- Notable events ---------------------------------------------------------------------------------------------------------
const stats = { ...createRunStats(), deal: { outcome: 'accepted' as const, pod: 4, shipId: 'vesper' } };
const lossy = results.map((result, i) => (i === 1 || i === 2 || i === 4 ? resultOf(RUN1_RESULTS[i]!, i + 1, 'crashed', 0) : result));
const events = notableEvents({ map: run1.map, ships: lossy, stats, residents: run1.residents });
check(`notable events (05 §3.8's rank, at most ${NOTABLE_EVENTS_MAX}): the DEAL accepted, the best colony, then the ships lost in route order`,
  isDeepStrictEqual(events.map((event) => `${event.kind}:${event.shipName}:${event.value}`), [
    'deal-accepted:VESPER:4', 'best-colony:VESPER:3200', 'ship-lost:HALCYON:2', 'ship-lost:KESTREL:3',
  ]), events.map((event) => `${event.kind}:${event.shipName}:${event.value}`).join(' '));
check('…a calm run has only its best colony; the classic world none', isDeepStrictEqual(notableEvents(run1).map((event) => event.kind), ['best-colony'])
  && notableEvents({ ...run1, map: { ...run1.map, world: 'classic' } }).length === 0);

// --- The update's input from a run --------------------------------------------------------------------------------------------
check('visitsOf: the route\'s stops with a colony where someone landed in an LZ', isDeepStrictEqual(visitsOf({ unitNumber: 47, map: run1.map, ships: crashed.stops.map((_, i) => (i === 2 ? resultOf(RUN1_RESULTS[2]!, 3, 'crashed', 0) : results[i]!)) }),
  WORKED_ROUTE.map((slot, i) => ({ slot, colony: i !== 2 }))));
const after = updateAfterRun(run1);
check('updateAfterRun: the run\'s own arm and route → run 2\'s arm (the six done) and run.next for UNIT-048',
  after.update.next.run === 2 && after.update.reasons.done === 6 && after.next.unit === 48 && after.next.run === 2
  && after.next.startYear === after.update.next.startYear && after.next.gap === after.update.next.gap);
check('launchOf (the title\'s line): UNIT-048 in 2301, 1 year after the last; the valve\'s years ride with it; none on run 1',
  isDeepStrictEqual(launchOf({ unitNumber: 48, map: run2Map(1) }), { unit: 48, run: 2, startYear: 2301, gap: 1, valveYears: 0 })
  && launchOf({ unitNumber: 48, map: { ...run2Map(1), history: { ...run2Map(1).history, valveYears: 11 } } })?.valveYears === 11
  && launchOf({ unitNumber: 47, map: run1Map(1) }) === null);

finish();
