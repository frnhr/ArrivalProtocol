// Slice 3a review follow-up: the classic world's places (B2), its one route (M4), what the desk reads of a ship before
// it is built (B1), arm ships' ids (M5), the hop's range flag, and run 1's authored data never shared with the store.
import { check, finish } from '../landing/checks';
import { classicRunMap, shipSummaryAt, worldSlotOf, isEndSlot, armShipId, shipDefAt } from '@systems/map-run';
import { hopBetween } from '@systems/map-hop';
import { routes, shipsLeft, routePods } from '@systems/map-route';
import { solLy } from '@systems/map-geometry';
import { assembleRun1Arm } from '@systems/map-generator';
import { CLASSIC_FIVE, CLASSIC_WORLD_SLOTS, classicShip } from '@data/classic-five';
import { RUN1_AUTHORED } from '@data/run1-arm';
import { WORLDS } from '@data/arm';
import { run1Map } from './run1-fixture';

const classic = classicRunMap(1, 0, 1);
check('classic slots sit on their own worlds: w0, w2, w5, w11, w19 (not Marrow for HALCYON)',
  CLASSIC_WORLD_SLOTS.join() === '0,2,5,11,19' && CLASSIC_FIVE.every((ship) => WORLDS[worldSlotOf(classic, ship.slot)]!.name === ship.world));
check('…classic SOL distances 8, 29, 55, 107, 180', CLASSIC_FIVE.map((ship) => solLy(worldSlotOf(classic, ship.slot))).join() === '8,29,55,107,180');
check('…the arm\'s slot is its world', worldSlotOf(run1Map(), 7) === 7);
check('the classic world has one route of five ships, LAST LIGHT its end; 4 ships left after ARES-VII',
  routes(classic).length === 1 && routes(classic)[0]!.join() === '0,1,2,3,4' && isEndSlot(classic, 4) && !isEndSlot(classic, 3)
  && shipsLeft(classic, 0).join() === '4,4' && shipsLeft(classic, 4).join() === '0,0' && routePods(classic, routes(classic)[0]!) === 48);

const map = run1Map(7);
const vesper = shipSummaryAt(map, 11);
check('an arm ship reads without being built: VESPER at Cinder, ark, 16 pods, 3,200 colonists, FULL, 2625, layer 5, ENGINE FAULT',
  vesper.name === 'VESPER' && vesper.world === 'Cinder' && vesper.worldSlot === 11 && vesper.kind === 'ark' && vesper.pods === 16
  && vesper.colonists === 3200 && vesper.memoryClass === 'FULL' && vesper.approachYear === 2625 && vesper.layer === 5
  && vesper.modifiers.includes('engine-fault') && vesper.forgiveness === 'rough' && vesper.reserved?.resident === null, JSON.stringify(vesper));
check('…the final ship says so; a late TIGHT ship too', shipSummaryAt(map, 19).final && shipSummaryAt(map, 18).late && shipSummaryAt(map, 18).memoryClass === 'TIGHT');
const kestrel = shipSummaryAt(classic, 2);
check('…a classic ship reads from its ShipDef: KESTREL at Brine, 12 pods, debris in rack C, its fixture year',
  kestrel.world === 'Brine' && kestrel.worldSlot === 5 && kestrel.pods === 12 && kestrel.colonists === 2400 && kestrel.debrisRack === 'C'
  && kestrel.approachYear === hopBetween(classic, 1, 2).approachYear && kestrel.reserved === null, JSON.stringify(kestrel));
// Track GEN: an arm ship is built from its ArmShip (data/ships.ts shipDefOf), memoized on its id; two arm seeds roll two
// different generated ships in one slot (the same structure, other details).
const other = run1Map(9);
const rolled = (m: typeof map): string => JSON.stringify([7, 8, 9, 10, 12, 13, 14, 15].map((slot) => shipDefAt(m, slot).landing));
check('…an arm ship is built (shipDefAt → shipDefOf, cached on its id) and differs across two arm seeds',
  shipDefAt(map, 11).name === 'VESPER' && shipDefAt(map, 11) === shipDefAt(structuredClone(map), 11) && shipDefAt(classic, 2) === classicShip(2)
  && shipDefAt(other, 11).pods === shipDefAt(map, 11).pods && rolled(other) !== rolled(map));

// Ids (M5): an arm ship's id is its ShipKey, so two seeds' VESPERs differ and a cache keyed on it is run-safe.
check('arm ship ids are armSeed:reportedRun:slot:attempt, unique per seed',
  map.arm[11]!.id === '7:1:11:0' && run1Map(8).arm[11]!.id !== map.arm[11]!.id && armShipId({ armSeed: 7, reportedRun: 2, slot: 11, attempt: 3 }) === '7:2:11:3'
  && new Set(map.arm.map((ship) => ship.id)).size === map.arm.length);

// The hop's range flag.
check('hopBetween flags range: ARES-VII → ALBATROSS 51 LY in range, → CURLEW (three layers) out',
  hopBetween(map, 0, 6).inRange && !hopBetween(map, 0, 7).inRange && hopBetween(classic, 0, 1).inRange);

// run 1's authored details are copies: the store may mutate an arm without touching the classic five or the table.
const arm = assembleRun1Arm(3);
arm[19]!.landing.lzs[0]!.pods = 99;
arm[0]!.podRacks.B = 'changed';
check('assembleRun1Arm copies RUN1_AUTHORED (mutating an arm leaves LAST LIGHT and the table alone)',
  classicShip(4).landing.lzs[0]!.pods === 4 && RUN1_AUTHORED['last-light'].landing!.lzs[0]!.pods === 4 && RUN1_AUTHORED['ares-vii'].podRacks!.B === 'P P P _40');
check('the run map round-trips through JSON', JSON.stringify(JSON.parse(JSON.stringify(map))) === JSON.stringify(map));
// The review's m5: shipDefOf is memoized on the ArmShip's whole content, so a ship re-timed or re-rolled under the same
// id (3c's world update) is built again, never served stale; the same content is the same ShipDef.
{
  const before = run1Map(6);
  const after = structuredClone(before);
  const ship = after.arm[13]!;
  ship.approachYear += 5;
  ship.podRacks = { ...ship.podRacks };
  ship.landing = { ...ship.landing, lzs: ship.landing.lzs.map((lz) => ({ ...lz })) };
  const same = structuredClone(before);
  check('shipDefOf: the same id with another approach year is a new ShipDef; the same content is the cached one',
    shipDefAt(after, 13).approachYear === (shipDefAt(before, 13).approachYear ?? 0) + 5 && after.arm[13]!.id === before.arm[13]!.id
    && shipDefAt(same, 13) === shipDefAt(before, 13));
}
finish();
