// WP5 acceptance 2, slice 1a: the ship's memory is built from ship data (§4.2, 01-landing §3.16, slice-1a-plan §2) and
// validated.
// • buildShipMemory(SHIPS[0]) totals 384, each rack holds exactly 64 blocks with no file straddling a rack, roles are
//   unique (Bay Ctrl's `bay` in Printer Uplink's place), and ARES-VII's pod rack is `R P P P _32`: the root first, then
//   POD 01 OKAFOR (HOLLOW's scripted bite), POD 02 BRANDT at 44 and POD 03 AL-SAYED;
// • a rack sum of 63, an unknown token, a duplicate role and a hurt pod the ship does not have each throw;
// plus the run-1 names, the seeded rosters (a later run reseeds the hurt pod among the non-lead pods), and what
// createInitialState makes of it (600 colonists in 3 pods, aboard, one LZ).
import { check, finish } from '../wp1/harness';
import {
  buildShipMemory, hurtDriversFor, MEMORY_TOTAL_BLOCKS, RACK_A, rackOf, racksLabel, shipColonists, shipPodCount, type ShipMemoryDef,
} from '@data/memory';
import { SHIPS, type ShipDef } from '@data/ships';
import { ARES_RUN1_FAMILIES, FAMILY_POOL, colonistIntro } from '@data/souls';
import { createInitialState } from '@state/initial';
import { driverTouch } from '@systems/landing-rules';
import { childRng, createRng } from '@systems/rng';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import type { Segment, DriverSegment } from '@/types/segment';
import { RACK_BLOCKS, RACK_COUNT, DRIVER_BLOCKS, COLONISTS_PER_POD, FEATURED_PER_POD, MAX_LINE_CHARS } from '@data/tuning';

const ship = SHIPS[0]!;
const build = (def: ShipDef = ship, firstRun = true, seed = 1): Segment[] => buildShipMemory(def, null, childRng(seed, 0, 'families'), firstRun, UNNAMED_HOLLOW);
const drivers = (memory: readonly Segment[]): DriverSegment[] => memory.filter((seg): seg is DriverSegment => seg.type === 'driver');

// --- The ship-1 layout -------------------------------------------------------------------------------
{
  const memory = build();
  const total = memory.reduce((sum, seg) => sum + seg.size, 0);
  check('384 blocks in 6 racks of 64', total === 384 && MEMORY_TOTAL_BLOCKS === RACK_BLOCKS * RACK_COUNT && MEMORY_TOTAL_BLOCKS === 384, `${total}`);
  let invariants = true;
  try { assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS); } catch { invariants = false; }
  check('the memory invariants hold', invariants);

  const starts = segmentStarts(memory);
  const perRack = new Array<number>(RACK_COUNT).fill(0);
  const straddlers: string[] = [];
  memory.forEach((seg, i) => {
    const start = starts[i]!;
    for (let addr = start; addr < start + seg.size; addr++) perRack[Math.floor(addr / RACK_BLOCKS)]!++;
    if (seg.type !== 'free' && rackOf(start) !== rackOf(start + seg.size - 1)) straddlers.push(seg.name);
  });
  check('each rack sums to 64', perRack.every((blocks) => blocks === RACK_BLOCKS), perRack.join(','));
  check('no file straddles two racks (only free space runs across)', straddlers.length === 0, straddlers.join(', '));

  const firstOf = (rack: string): Segment | undefined => memory.find((_seg, i) => rackOf(starts[i]!) === rack && starts[i]! % RACK_BLOCKS === 0);
  const rackBFirst = firstOf('B');
  check('rack A starts with Life Support, B with HOLLOW\'s root, E with the AI Core, F with Scan',
    firstOf('A')?.name === 'Life Support' && rackBFirst?.type === 'hollow' && rackBFirst.root
    && firstOf('E')?.type === 'core' && firstOf('F')?.name === 'Scan',
    ['A', 'B', 'E', 'F'].map((rack) => firstOf(rack)?.name).join(' / '));

  const roles = memory.filter((seg) => seg.role).map((seg) => seg.role!);
  check('roles are unique', new Set(roles).size === roles.length, roles.join(','));
  check('every §6.4 role is present once, Bay Ctrl\'s `bay` in place of the printer', ['life', 'reactor', 'thrust-ctrl', 'stasis', 'bay', 'cargo', 'core', 'engine-io', 'autopilot',
    'sensor', 'navplot', 'telemetry', 'comms', 'redundancy'].every((role) => roles.includes(role as never)) && !roles.includes('printer' as never));
  const bay = memory.find((seg) => seg.role === 'bay');
  check('Bay Ctrl: 6 blocks in rack A, honest about 1a (no damage effect claimed)', bay?.name === 'Bay Ctrl' && bay.size === 6
    && rackOf(starts[memory.indexOf(bay)]!) === 'A' && 'desc' in bay && bay.desc === 'Runs the pod bay\'s launch rails. Damaged, pods launch further apart; gone, no pod can launch.', bay?.name);

  const pods = drivers(memory);
  const rootIndex = memory.findIndex((seg) => seg.type === 'hollow' && seg.root);
  const root = memory[rootIndex];
  check('the root (8 blocks, locked) sits right after rack A\'s 18 free blocks, POD 01 = OKAFOR right after it', root?.type === 'hollow'
    && root.locked && root.size === 8 && memory[rootIndex - 1]?.type === 'free' && memory[rootIndex - 1]!.size === 18
    && memory[rootIndex + 1]?.type === 'driver' && (memory[rootIndex + 1] as DriverSegment).pod === 1
    && (memory[rootIndex + 1] as DriverSegment).family === 'Okafor', `${memory[rootIndex - 1]?.name} → ${root?.name} → ${memory[rootIndex + 1]?.name}`);
  check('3 drivers of 8 blocks and 200 colonists, POD 01–03 in address order (id driver_pod01, name `POD 01 · OKAFOR`)',
    pods.length === 3 && pods.every((driver, i) => driver.pod === i + 1 && driver.id === `driver_pod0${i + 1}`
      && driver.name === `POD 0${i + 1} · ${driver.family.toUpperCase()}` && driver.size === DRIVER_BLOCKS && driver.colonists === COLONISTS_PER_POD),
    pods.map((driver) => `${driver.id} ${driver.name}`).join(' | '));
  check('the pod count is the LZ sum (3) and 600 colonists', shipPodCount(ship) === 3 && ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0) === 3
    && shipColonists(ship) === 600);
  const after = memory[memory.indexOf(pods[2]!) + 1];
  check('after POD 03: rack B\'s 32 free blocks run on through the empty racks C–D (160)', after?.type === 'free' && after.size === 32 + 64 + 64, `${after?.size}`);
  check('racks label: RACK B', racksLabel(memory, pods) === 'RACK B', racksLabel(memory, pods));

  check('run 1: the written families in order (Okafor, Brandt, Al-Sayed)', pods.map((driver) => driver.family).join() === ARES_RUN1_FAMILIES.join(),
    pods.map((driver) => driver.family.toUpperCase()).join(' '));
  const ada = pods[0]!.featured[0]!;
  check('POD 01\'s first colonist, as a person: Ada Okafor, 11, "wants to name the first tree.", first words "Is it morning?"',
    colonistIntro(ada) === 'Ada Okafor, 11, wants to name the first tree.' && ada.firstWords === 'Is it morning?', colonistIntro(ada));
  check('POD 02 · BRANDT arrives hurt at 44% (it would land hard), every other pod at 100%',
    pods.every((driver) => driver.integrity === (driver.pod === 2 ? 44 : 100)) && pods[1]!.family === 'Brandt' && driverTouch(pods[1]!.integrity) === 'hard' && driverTouch(pods[0]!.integrity) === 'soft',
    pods.map((driver) => `${driver.pod}:${driver.integrity}/${driver.state}`).join(' '));
  check(`every pod names ${FEATURED_PER_POD} colonists of its family, intros ≤ 70 characters`, pods.every((driver) => driver.featured.length === FEATURED_PER_POD
    && driver.featured.every((colonist) => colonist.name.startsWith(`${driver.family}, `) && colonistIntro(colonist).length <= MAX_LINE_CHARS)));
  const firstNames = pods.flatMap((driver) => driver.featured.map((colonist) => colonist.name.split(', ')[1]));
  check('no first name repeats on the ship', new Set(firstNames).size === firstNames.length);
  check('within a family, three different lines and first words', pods.every((driver) =>
    new Set(driver.featured.map((colonist) => colonist.line)).size === 3 && new Set(driver.featured.map((colonist) => colonist.firstWords)).size === 3));
  const intros = drivers(build(ship, true, 1)).map((driver) => driver.featured.map(colonistIntro).join());
  check('the same seed rebuilds the same people', intros.join() === pods.map((driver) => driver.featured.map(colonistIntro).join()).join());
  const other = drivers(build(ship, true, 2));
  check('another seed: the same run-1 families and Ada, other colonists', other.map((driver) => driver.family).join() === ARES_RUN1_FAMILIES.join()
    && other[0]!.featured[0]!.name === 'Okafor, Ada'
    && other.some((driver, i) => colonistIntro(driver.featured[1]!) !== colonistIntro(pods[i]!.featured[1]!)));
  const seeded = drivers(build(ship, false, 7));
  check('a later run (seeded): 3 different families from the pool, no scripted Ada', seeded.length === 3
    && new Set(seeded.map((driver) => driver.family)).size === 3 && seeded.every((driver) => FAMILY_POOL.includes(driver.family))
    && !seeded.some((driver) => driver.featured.some((colonist) => colonist.firstWords === 'Is it morning?')),
    seeded.map((driver) => driver.family).join(' '));
  check('…its lead pod still features a child first (the way Ada was)', seeded[0]!.featured[0]!.age < 18, `${seeded[0]!.featured[0]!.age}`);
  const laterHurt = Array.from({ length: 40 }, (_, seed) => hurtDriversFor(ship, false, createRng(seed)));
  check('a later run reseeds the hurt pod among the non-lead pods (POD 02 or POD 03), still at 44',
    laterHurt.every((hurt) => hurt.length === 1 && (hurt[0]!.pod === 2 || hurt[0]!.pod === 3) && hurt[0]!.integrity === 44)
    && laterHurt.some((hurt) => hurt[0]!.pod === 3),
    laterHurt.slice(0, 8).map((hurt) => hurt.map((driver) => driver.pod).join()).join(' '));
  check('the first run keeps the written hurt pod', JSON.stringify(hurtDriversFor(ship, true, createRng(1))) === JSON.stringify([{ pod: 2, integrity: 44 }]));
}

// --- Validation throws ---------------------------------------------------------------------------------
function throwsWith(memory: Partial<ShipMemoryDef>, pattern: RegExp): { ok: boolean; message: string } {
  const def: ShipDef = { ...ship, memory: { ...ship.memory, ...memory } };
  try {
    buildShipMemory(def, null, createRng(0), true, UNNAMED_HOLLOW);
    return { ok: false, message: 'did not throw' };
  } catch (error) {
    const message = String((error as Error).message);
    return { ok: pattern.test(message), message };
  }
}
{
  const short = throwsWith({ podRacks: { ...ship.memory.podRacks, B: 'R P P P _31' } }, /rack B sums to 63, not 64/);
  check('a rack sum of 63 throws (layout string)', short.ok, short.message);
  const shortA = throwsWith({ rackA: [...RACK_A.slice(0, -1), { free: 17 }] }, /rack A sums to 63, not 64/);
  check('a rack sum of 63 throws (written rack A)', shortA.ok, shortA.message);
  const unknown = throwsWith({ podRacks: { ...ship.memory.podRacks, C: 'P C _48' } }, /unknown token 'C' in rack C/);
  check('an unknown token throws (phase 2\'s `C` cluster token is gone)', unknown.ok, unknown.message);
  const lifeTwice = RACK_A.map((item) => ('free' in item ? item : item.role === 'cargo' ? { ...item, role: 'life' as const } : item));
  const duplicate = throwsWith({ rackA: lifeTwice }, /duplicate role 'life'/);
  check('a duplicate single-instance role throws', duplicate.ok, duplicate.message);
  const hurt = throwsWith({ drivers: { ...ship.memory.drivers, hurt: [{ pod: 4, integrity: 44 }] } }, /hurt pod 4 is not one of 3/);
  check('a hurt pod the ship does not have throws', hurt.ok, hurt.message);
  const lead = throwsWith({ drivers: { ...ship.memory.drivers, lead: 5 } }, /lead pod 5 is not one of 3/);
  check('a lead pod the ship does not have throws', lead.ok, lead.message);
  let carried = '';
  // WP7 packs the carried files (systems/carry.ts); ship 1 always meets a fresh unit, so carried files
  // given to it still throw loudly.
  try { buildShipMemory(ship, { startAddr: 256, segs: [] }, createRng(0), true, UNNAMED_HOLLOW); } catch (error) { carried = String((error as Error).message); }
  check('carried files given to ship 1 throw loudly (it meets a fresh unit)', /fresh unit/.test(carried), carried);
}

// --- createInitialState ----------------------------------------------------------------------------------
{
  const state = createInitialState({ seed: 3 });
  const lz = state.landing.lzs[0];
  check('the page\'s state: 600 colonists in 3 pods, all aboard, lead POD 01, POD 02 hurt, one WIDE LZ-A for 3',
    state.mission.colonists === 600 && state.landing.pods.length === 3 && state.landing.pods.every((record) => record.fate.kind === 'aboard')
    && state.landing.lead === 1 && JSON.stringify(state.landing.hurt) === '[2]' && state.landing.lzs.length === 1
    && lz?.label === 'LZ-A' && lz.pods === 3 && lz.widthKm === 500 && state.landing.forgiveness === 'gentle'
    && state.landing.colonyFirstRun === 'RIVERSIDE' && !state.landing.finalShip
    && state.memory.reduce((sum, seg) => sum + seg.size, 0) === 384,
    JSON.stringify({ colonists: state.mission.colonists, pods: state.landing.pods.length, lead: state.landing.lead, hurt: state.landing.hurt, lz }));
  check('…the bay empty until the lock fills it, nothing ended', state.landing.bay.loaded === 0 && state.landing.ended === null
    && state.landing.startedAtTSec === null && state.landing.window === null);
}

finish();
