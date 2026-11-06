// Track GEN, memory classes step 2 (01-landing §3.16; slice-3a-plan §2.7): the pod-rack rule (layoutPods reproduces 01's
// rows and LAST LIGHT's), the validators per class (rack D only on FULL, a root slot from layer 4), the unpack per class
// (files, the floor, the seeds, the rest) against 01's unit table (65 / 73 / 84 / 104 files), TIGHT's waived floor and its
// 0-charge arrival, the no-room seed rule on a TIGHT ship, the licence spot next to REPAIR CHARGE on a ship with no rack F,
// a DEBRIS cloud only on a rack the ship has, and risk 16: a depth-3 TIGHT ship never leaves a 3a unit with 0 charge.
import { check, finish } from '../landing/checks';
import type { Segment, RedundancySegment } from '@/types/segment';
import type { ShipDef } from '@data/ships';
import { layoutPods } from '@systems/pod-layout';
import { packUnit, layoutCarried, arrivalCharge, type Packet } from '@systems/carry';
import { roomFit, hopBetween } from '@systems/map-hop';
import { shipDefAt } from '@systems/map-run';
import { routes } from '@systems/map-route';
import { unitInstallAddress, segmentStarts } from '@systems/memory-ops';
import { createRng } from '@systems/rng';
import { freshArm } from '@systems/map-generator';
import { validateShipDef } from '@data/ships';
import { buildShipMemory, layoutFor, FRESH_UNIT_RACK_E, FRESH_UNIT_RACK_F, type CarriedRacks } from '@data/memory';
import { classicShip } from '@data/classic-five';
import { nominalShipThreat } from '@systems/threat-plan';
import { RUN_START_YEAR } from '@data/tuning';
import { byDepth } from '../depth';
import { run1Map } from './run1-fixture';
import type { RunMapState } from '@/types/map';

const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };
const json = (value: unknown): string => JSON.stringify(value);

// --- The pod-rack rule ---------------------------------------------------------------------------------------------------
check('layoutPods: ARES-VII (3, COMPACT, calm) → `P P P _40` / `_64`, lead the last pod',
  json(layoutPods(3, 'COMPACT', false, false)) === json({ podRacks: { B: 'P P P _40', C: '_64' }, lead: 3 }));
check('…a layer-2 light ship (3, TIGHT, no slot) → `P P P _40` / `_64` (01 §3.16\'s row)', json(layoutPods(3, 'TIGHT', false, false).podRacks) === json({ B: 'P P P _40', C: '_64' }));
check('…a layer-7 light ship (5, TIGHT, slot) → `P P P _40` / `P _2 S _1 P _45` (R14 leaves 31)',
  json(layoutPods(5, 'TIGHT', true, false)) === json({ podRacks: { B: 'P P P _40', C: 'P _2 S _1 P _45' }, lead: 5 }));
check('…a layer-5 standard ship (8, COMPACT, slot) → `P×6 _16` / `P _2 S _1 P _45` (01: B 6, C `P _2 R14 _1 P _31`)',
  json(layoutPods(8, 'COMPACT', true, false).podRacks) === json({ B: 'P P P P P P _16', C: 'P _2 S _1 P _45' }));
check('…the final ship (16, FULL) is LAST LIGHT\'s written layout, the lead POD 12 at GAP 1',
  json(layoutPods(16, 'FULL', true, true)) === json({ podRacks: classicShip(4).memory.podRacks, lead: classicShip(4).memory.drivers.lead }));
check('…a layer 4–7 ark (16, FULL, slot) holds an R14 with 47 free; a layer-3 ark (15, no slot) fills B, C then D',
  json(layoutPods(16, 'FULL', true, false).podRacks) === json(classicShip(4).memory.podRacks)
  && json(layoutPods(15, 'FULL', false, false).podRacks) === json({ B: 'P P P P P P P _8', C: 'P P P P P P P _8', D: 'P _56' }));
check('…it refuses what no class holds: 9 pods on COMPACT, a final ship with no slot, rack C too full for the root',
  throws(() => layoutPods(9, 'COMPACT', true, false)) && throws(() => layoutPods(16, 'FULL', false, true)));
for (const cls of ['FULL', 'COMPACT', 'TIGHT'] as const) {
  const max = layoutFor(cls).maxPods;
  let ok = true;
  for (let pods = 3; pods <= max; pods++) for (const slot of [false, true]) if (throws(() => layoutPods(pods, cls, slot, false))) ok = false;
  check(`…every pod count 3–${max} on ${cls}, with and without a slot, passes the 40-free and 24-tail budget`, ok);
}

// --- Validators per class ------------------------------------------------------------------------------------------------
const map = run1Map(7);
const petrel = shipDefAt(map, 1);     // TIGHT, 3 pods, layer 2
const halcyon = shipDefAt(map, 2);    // COMPACT, 5 pods
const albatross = shipDefAt(map, 6);  // FULL ark, 15 pods
const lapwing = shipDefAt(map, 8);    // TIGHT, layer 4, a slot
const withRacks = (ship: ShipDef, podRacks: ShipDef['memory']['podRacks']): ShipDef => ({ ...ship, memory: { ...ship.memory, podRacks } });
check('rack D only on a FULL ship: a COMPACT layout naming D is refused', throws(() => validateShipDef(withRacks(halcyon, { ...halcyon.memory.podRacks, D: '_64' }))));
check('…a FULL ship must write its three pod racks', throws(() => validateShipDef(withRacks(albatross, { B: albatross.memory.podRacks.B!, C: albatross.memory.podRacks.C! }))));
check('a layer-4 ship needs a root slot (HOLLOW may board on any beam into it)',
  throws(() => validateShipDef(withRacks(lapwing, { B: 'P P _48', C: 'P P _48' }))));
const debrisOn = (ship: ShipDef, rack: string): ShipDef => ({
  ...ship, modifiers: [...ship.modifiers, 'debris'],
  zones: [{ kind: 'debris', id: 'test-debris', centre: { onInboundAtR: 14000 }, r: 900, rack, laterRacks: [rack] }],
  flight: { ...classicShip(2).flight },
});
check('a DEBRIS cloud may only name a rack the ship has (D on a COMPACT ship is refused, B is fine)',
  throws(() => validateShipDef(debrisOn(halcyon, 'D'))) && !throws(() => validateShipDef(debrisOn(halcyon, 'B'))));

// --- The unpack per class (01 §3.16's unit table) ---------------------------------------------------------------------
const freshFiles = (): Segment[] => [...FRESH_UNIT_RACK_E, ...FRESH_UNIT_RACK_F]
  .filter((item): item is Exclude<typeof item, { free: number }> => !('free' in item)).map((item) => structuredClone(item) as Segment);
const freshSize = freshFiles().filter((seg) => seg.type !== 'redundancy').reduce((sum, seg) => sum + seg.size, 0);
// A unit of `files` blocks holding `charge`: the fresh unit, its charge set, and a filler file for the rest.
function unit(files: number, charge: number): Segment[] {
  const segs = freshFiles().map((seg) => (seg.type === 'redundancy' ? { ...seg, used: charge, size: Math.max(1, charge), capacity: Math.max(72, charge) } as RedundancySegment : seg));
  const filler = files - freshSize;
  if (filler < 0) throw new Error(`unit: ${files} is under the fresh unit's ${freshSize}`);
  if (filler > 0) segs.push({ id: 'filler', name: 'Filler', type: 'upgrade', upgrade: 'fuel', size: filler, desc: 'test' } as unknown as Segment);
  return segs;
}
const calm = nominalShipThreat(1);
function arrive(ship: ShipDef, files: number, charge: number, link = 131): { packet: Packet; laid: number; fit: ReturnType<typeof roomFit>; floorAdded: number } {
  const packet = packUnit(unit(files, charge), link, []);
  const layout = layoutFor(ship.memoryClass);
  const hop = { linkBlocks: link, room: layout.roomForUnit, chargeFloor: layout.chargeFloor };
  const fit = roomFit({ files: [...packet.rackE, ...packet.rackF], charge: packet.chargeHeld }, hop);
  const arrival = arrivalCharge(packet.chargeCarried, 0, 0, layout.chargeFloor);
  const laid = fit.over > 0 ? -1 : layoutCarried(packet, arrival.blocks, ship, calm).chargeBlocks;
  return { packet, laid, fit, floorAdded: arrival.floorAdded };
}
check(`the fresh unit is ${freshSize} blocks of files (01's starting kit with REPAIR and Repair.bak, 8 more: 65)`, freshSize + 8 === 65);
const table = [65, 73, 84, 104].map((files) => [halcyon, albatross, petrel].map((ship) => arrive(ship, files, 20)));
check('01\'s table, FULL and COMPACT (room 152, floor 12): 65 / 73 / 84 / 104 files all fit with their 20 charge',
  table.every((row) => row.slice(0, 2).every((cell) => cell.fit.word === 'fits' && cell.laid === 20)), json(table.map((row) => row.map((c) => c.laid))));
check('…TIGHT (room 88, no floor): 65 → all 20 arrive, 73 → 15, 84 → 4, 104 → 16 over (leave 16 behind)',
  table.map((row) => row[2]!).map((cell) => (cell.fit.over > 0 ? `over${cell.fit.over}` : String(cell.laid))).join() === '20,15,4,over16'
  && table[3]![2]!.fit.word === 'leave' && table[1]![2]!.fit.word === 'squeezed' && table[1]![2]!.fit.chargeArrives === 15,
  table.map((row) => `${row[2]!.laid}/${row[2]!.fit.over}`).join());
const empty = arrive(petrel, 88, 30);
check('TIGHT\'s 0-charge arrival: 88 files leave no room, no floor tops it up, the fit line says NO CHARGE ARRIVES, the ship builds',
  empty.laid === 0 && empty.floorAdded === 0 && empty.fit.word === 'no-charge'
  && !throws(() => buildShipMemory(petrel, layoutCarried(empty.packet, 0, petrel, calm).racks, createRng(1), false, '???', null)));
check('…while a COMPACT ship tops an empty unit up to its floor of 12', arrive(halcyon, 70, 0).laid === 12 && arrive(halcyon, 70, 0).floorAdded === 12);
check('arrivalCharge: the floor is the destination\'s (12 by default, 0 on TIGHT)', arrivalCharge(3, 0).blocks === 12 && arrivalCharge(3, 0, 0, 0).blocks === 3);

// The no-room seed rule on TIGHT (04 §3.4): a seed with no room behind its target lands among the pods.
const seedy = packUnit(unit(85, 10), 131, []);
const target = seedy.rackE.find((seg) => seg.role === 'telemetry')!;
seedy.seeds = [{ targetId: target.id, targetName: target.name, words: 'hello' }];
const seeded = layoutCarried(seedy, arrivalCharge(seedy.chargeCarried, 0, 0, 0).blocks, petrel, calm, '???');
const seededMemory = buildShipMemory(petrel, seeded.racks as CarriedRacks, createRng(1), false, '???', null);
const strayAt = segmentStarts(seededMemory)[seededMemory.findIndex((seg) => seg.type === 'hollow')]!;
check('the no-room seed rule on TIGHT: 85 files leave 3 blocks, the seed is a stray, it lands among the pods',
  seeded.seeds[0]?.loose === true && strayAt < layoutFor('TIGHT').unitStart, `${json(seeded.seeds)} at ${strayAt}`);

// The licence spot: the receiver's free run next to REPAIR CHARGE (a TIGHT ship has no rack F).
const tightAt = (files: number, charge: number): Segment[] =>
  buildShipMemory(petrel, layoutCarried(packUnit(unit(files, charge), 131, []), charge, petrel, calm).racks, createRng(1), false, '???', null);
const roomy = tightAt(57, 3);
const starts = segmentStarts(roomy);
const chargeIndex = roomy.findIndex((seg) => seg.type === 'redundancy');
check('a licence on a TIGHT ship lands right after REPAIR CHARGE, in rack E (it has no rack F)',
  unitInstallAddress(roomy, 4) === starts[chargeIndex]! + roomy[chargeIndex]!.size && unitInstallAddress(roomy, 4) >= layoutFor('TIGHT').unitStart);
const full = tightAt(65, 10);
const unitStartAt = segmentStarts(full)[full.findIndex((seg) => seg.type === 'core')]!;
check('…a full receiver (the unit spilled into the tail): flush against the unit\'s block, not at the far end of rack C',
  unitInstallAddress(full, 4) + 4 === unitStartAt, `${unitInstallAddress(full, 4)} / ${unitStartAt}`);

// --- Risk 16: depth-3 TIGHT hops never leave a 3a unit with 0 charge ------------------------------------------------------
// A 3a depth-3 unit: the fresh kit, MOVE (2) from a depth-2 DEBRIS ship, a card's file (2), AUTOBURN (4): at most 73 files.
const DEPTH3_FILES = 73;
const arms: RunMapState[] = [map, ...Array.from({ length: byDepth(8, 40) }, (_, i): RunMapState => ({
  ...map, run: 2, armSeed: 100 + i, arm: freshArm(100 + i, 2, RUN_START_YEAR),
}))];
let hops3 = 0;
let worst = Infinity;
for (const arm of arms) {
  const seen = new Set<string>();
  for (const route of routes(arm)) {
    if (route.length < 3) continue;
    const key = `${route[1]}-${route[2]}`;
    if (seen.has(key) || arm.arm[route[2]!]!.memoryClass !== 'TIGHT') continue;
    seen.add(key);
    const hop = hopBetween(arm, route[1]!, route[2]!);
    hops3++;
    worst = Math.min(worst, roomFit({ files: [{ size: DEPTH3_FILES }], charge: 36 }, hop).chargeArrives);
  }
}
check(`risk 16: every depth-3 TIGHT hop on ${arms.length} arms (${hops3} hops) lands a ${DEPTH3_FILES}-file unit with charge (worst ${worst})`,
  hops3 > 0 && worst > 0);
finish();
