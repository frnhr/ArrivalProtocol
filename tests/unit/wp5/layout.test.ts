// WP5 acceptance 2: the ship's memory is built from ship data (§4.2) and validated.
// • buildShipMemory(SHIPS[0]) totals 384, each rack holds exactly 64 blocks with no file straddling a
//   rack, roles are unique, and C12 = OKAFOR sits directly before the R segment;
// • a rack sum of 63, an unknown token and a duplicate role each throw;
// plus the §6.7 names (run 1), the seeded rosters, and what createInitialState makes of it.
import { check, finish } from '../wp1/harness';
import { buildShipMemory, MEMORY_TOTAL_BLOCKS, RACK_A, rackOf, racksLabel, type ShipMemoryDef } from '@data/memory';
import { SHIPS, type ShipDef } from '@data/ships';
import { ARES_RUN1_FAMILIES, FAMILY_POOL, colonistIntro } from '@data/souls';
import { createInitialState } from '@state/initial';
import { childRng, createRng } from '@systems/rng';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import { segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import type { Segment, SoulSegment } from '@/types/segment';
import { RACK_BLOCKS, RACK_COUNT, CLUSTER_BLOCKS, SOULS_PER_CLUSTER, FEATURED_PER_CLUSTER, MAX_LINE_CHARS } from '@data/tuning';

const ship = SHIPS[0]!;
const build = (def: ShipDef = ship, firstRun = true, seed = 1): Segment[] => buildShipMemory(def, null, childRng(seed, 0, 'families'), firstRun, UNNAMED_HOLLOW);
const souls = (memory: readonly Segment[]): SoulSegment[] => memory.filter((seg): seg is SoulSegment => seg.type === 'soul');

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
  check('rack A starts with Life Support, B with C01, C with C07, E with the AI Core, F with Scan',
    firstOf('A')?.name === 'Life Support' && (firstOf('B') as SoulSegment)?.cluster === 'C01' && (firstOf('C') as SoulSegment)?.cluster === 'C07'
    && firstOf('E')?.type === 'core' && firstOf('F')?.name === 'Scan',
    ['A', 'B', 'C', 'E', 'F'].map((rack) => firstOf(rack)?.name).join(' / '));

  const roles = memory.filter((seg) => seg.role).map((seg) => seg.role!);
  check('roles are unique', new Set(roles).size === roles.length, roles.join(','));
  check('every §6.4 role is present once', ['life', 'reactor', 'thrust-ctrl', 'stasis', 'printer', 'cargo', 'core', 'engine-io', 'autopilot',
    'sensor', 'navplot', 'telemetry', 'comms', 'redundancy'].every((role) => roles.includes(role as never)));

  const clusters = souls(memory);
  const c12 = memory.findIndex((seg) => seg.type === 'soul' && seg.cluster === 'C12');
  const root = memory[c12 + 1];
  check('C12 = OKAFOR sits directly before the R segment', c12 >= 0 && (memory[c12] as SoulSegment).family === 'Okafor'
    // WP6: the R token builds HOLLOW's root (it was the old encrypted block in WP5).
    && root?.type === 'hollow' && root.root && root.locked && root.size === 8, `${memory[c12]?.name} → ${root?.name}`);
  check('12 clusters of 8 blocks and 200 souls, numbered C01–C12 in address order',
    clusters.length === 12 && clusters.every((soul, i) => soul.cluster === `C${String(i + 1).padStart(2, '0')}`
      && soul.size === CLUSTER_BLOCKS && soul.souls === SOULS_PER_CLUSTER));
  check('rack B: six clusters, then 16 free; rack C: six clusters, the root, 8 free (merged with the empty rack D)',
    clusters.slice(0, 6).every((soul) => rackOf(starts[memory.indexOf(soul)]!) === 'B')
    && clusters.slice(6).every((soul) => rackOf(starts[memory.indexOf(soul)]!) === 'C')
    && memory[c12 + 2]?.type === 'free' && memory[c12 + 2]!.size === 8 + 64, `after the root: ${memory[c12 + 2]?.size} free`);
  check('racks label: RACKS B–C', racksLabel(memory, clusters) === 'RACKS B–C', racksLabel(memory, clusters));

  // §6.7: the run-1 ship-1 families in order, C12 = OKAFOR with Ada, C09 REYES at 71%.
  check('run 1: the §6.7 families in order', clusters.map((soul) => soul.family).join() === ARES_RUN1_FAMILIES.join(),
    clusters.map((soul) => soul.family.toUpperCase()).join(' '));
  const ada = clusters[11]!.featured[0]!;
  check('C12\'s first colonist, as a person (fix round 1): Ada Okafor, 11, "wants to name the first tree.", first words "Is it morning?"',
    colonistIntro(ada) === 'Ada Okafor, 11, wants to name the first tree.' && ada.firstWords === 'Is it morning?', colonistIntro(ada));
  check('C09 · REYES arrives hurt at 71%, every other cluster at 100%', clusters.every((soul) => soul.integrity === (soul.cluster === 'C09' ? 71 : 100))
    && clusters[8]!.family === 'Reyes');
  check('every cluster names 3 colonists of its family, intros ≤ 70 characters', clusters.every((soul) => soul.featured.length === FEATURED_PER_CLUSTER
    && soul.featured.every((colonist) => colonist.name.startsWith(`${soul.family}, `) && colonistIntro(colonist).length <= MAX_LINE_CHARS)));
  const firstNames = clusters.flatMap((soul) => soul.featured.map((colonist) => colonist.name.split(', ')[1]));
  check('no first name repeats on the ship', new Set(firstNames).size === firstNames.length);
  check('within a family, three different lines and first words', clusters.every((soul) =>
    new Set(soul.featured.map((colonist) => colonist.line)).size === 3 && new Set(soul.featured.map((colonist) => colonist.firstWords)).size === 3));
  check('the archive arrives sealed (ship 1)', clusters.every((soul) => soul.sealed));
  const intros = build(ship, true, 1).filter((seg): seg is SoulSegment => seg.type === 'soul').map((soul) => soul.featured.map(colonistIntro).join());
  check('the same seed rebuilds the same people', intros.join() === clusters.map((soul) => soul.featured.map(colonistIntro).join()).join());
  const other = souls(build(ship, true, 2));
  check('another seed: the same run-1 families and Ada, other colonists', other.map((soul) => soul.family).join() === ARES_RUN1_FAMILIES.join()
    && other[11]!.featured[0]!.name === 'Okafor, Ada'
    && other.some((soul, i) => colonistIntro(soul.featured[1]!) !== colonistIntro(clusters[i]!.featured[1]!)));
  const seeded = souls(build(ship, false, 7));
  check('a later run (seeded): 12 different families from the pool, no scripted Ada', seeded.length === 12
    && new Set(seeded.map((soul) => soul.family)).size === 12 && seeded.every((soul) => FAMILY_POOL.includes(soul.family))
    && !seeded.some((soul) => soul.featured.some((colonist) => colonist.firstWords === 'Is it morning?')),
    seeded.map((soul) => soul.family).join(' '));
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
  const short = throwsWith({ racksBD: { ...ship.memory.racksBD, B: 'C C C C C C _15' } }, /rack B sums to 63, not 64/);
  check('a rack sum of 63 throws (layout string)', short.ok, short.message);
  const shortA = throwsWith({ rackA: [...RACK_A.slice(0, -1), { free: 17 }] }, /rack A sums to 63, not 64/);
  check('a rack sum of 63 throws (written rack A)', shortA.ok, shortA.message);
  const unknown = throwsWith({ racksBD: { ...ship.memory.racksBD, C: 'C C C C C C X _8' } }, /unknown token 'X' in rack C/);
  check('an unknown token throws', unknown.ok, unknown.message);
  const lifeTwice = RACK_A.map((item) => ('free' in item ? item : item.role === 'cargo' ? { ...item, role: 'life' as const } : item));
  const duplicate = throwsWith({ rackA: lifeTwice }, /duplicate role 'life'/);
  check('a duplicate single-instance role throws', duplicate.ok, duplicate.message);
  const hurt = throwsWith({ souls: { ...ship.memory.souls, hurt: { cluster: 13, integrity: 71 } } }, /hurt cluster 13/);
  check('a hurt cluster the ship does not have throws', hurt.ok, hurt.message);
  let carried = '';
  // WP7 packs the carried files (systems/carry.ts); ship 1 always meets a fresh unit, so carried files
  // given to it still throw loudly.
  try { buildShipMemory(ship, { startAddr: 256, segs: [] }, createRng(0), true, UNNAMED_HOLLOW); } catch (error) { carried = String((error as Error).message); }
  check('carried files given to ship 1 throw loudly (it meets a fresh unit)', /fresh unit/.test(carried), carried);
}

// --- createInitialState ----------------------------------------------------------------------------------
{
  const state = createInitialState({ seed: 3 });
  check('the page\'s state: 2,400 souls aboard, the archive sealed, the reveal waiting', state.mission.souls === 2400
    && state.souls.reveal.stage === 'sealed' && state.souls.lead === 'C12' && state.souls.hurt === 'C09'
    && state.printer.baseSec === 2.5 && state.memory.reduce((sum, seg) => sum + seg.size, 0) === 384);
}

finish();
