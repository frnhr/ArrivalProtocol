// WP5 part 2, slice 1a: the strip as racks and the numbers around it, headless (§9 WP5 items 5 and 9; 01-landing §3.16).
// • rack labels `RACK X · 0xNNN` on rack borders only;
// • how much a chip shows by its width (micro / tiny / narrow / wide) and the names it draws,
//   checked for every file of ship 1 against the pixel room a chip has at 1280 px;
// • the computed .mem-stats: the colonists aboard (no sealed archive any more), charge, free, damage, total;
// • every ship's pod racks (slice-1a-plan §2): the P-token layouts, one driver per pod with the pod count equal to the
//   LZ sum, the free-block budget (POD_RACK_MIN_FREE, root GAPs not counted) and the unit's tail (UNIT_TAIL_BLOCKS),
//   and validatePodRacks throwing on each rule;
// • the live ★ ON TARGET tally (landing-rules onTargetTally) that the MiniHud reads.
// The DOM side (six rows, labels, nothing clipped, no console errors) is the e2e tier.
import '../support/classic-world';
import { check, finish, harnessState } from '../wp1/harness';
import {
  rackLabel, hexAddr, podRackLayouts, shipPodCount, lastPodRackTrailingFree, validatePodRacks, rootSlotRack,
  maxRootFor, MEMORY_LAYOUTS,
} from '@data/memory';
import type { ShipDef } from '@data/ships';
import { stripTier, stripName } from '@data/type-labels';
import { memStatsModel, stripRangeLabel } from '@components/memory-view/MemoryStats';
import { onTargetTally } from '@systems/landing-rules';
import { segmentStarts } from '@systems/memory-ops';
import { createInitialState } from '@state/initial';
import { freshUnitRacks } from '@systems/carry';
import type { GameState } from '@state/schema';
import type { LaunchRecord, Touchdown } from '@/types/landing';
import { POD_RACK_MIN_FREE, RACK_BLOCKS, UNIT_TAIL_BLOCKS, WALL_MIN_BLOCKS } from '@data/tuning';
import { CLASSIC_FIVE } from '@data/classic-five';

// --- Rack labels -------------------------------------------------------------------------------------
check('rack labels: RACK A · 0x000 … RACK F · 0x140', MEMORY_LAYOUTS.FULL.racks.map((_, i) => rackLabel(i * RACK_BLOCKS, MEMORY_LAYOUTS.FULL)).join()
  === 'RACK A · 0x000,RACK B · 0x040,RACK C · 0x080,RACK D · 0x0C0,RACK E · 0x100,RACK F · 0x140');
let threw = false;
try { rackLabel(0x41, MEMORY_LAYOUTS.FULL); } catch { threw = true; }
check('a label off a rack border throws', threw);
check('hexAddr pads and capitalises', hexAddr(0x17f) === '0x17F' && hexAddr(5) === '0x005');

// --- Chip tiers and names ------------------------------------------------------------------------------
check('tiers by width: 1 micro, 2–4 tiny, 5–6 narrow, 7+ wide',
  [1, 2, 3, 4, 5, 6, 7, 8, 36].map(stripTier).join() === 'micro,tiny,tiny,tiny,narrow,narrow,wide,wide,wide');
threw = false;
try { stripTier(0); } catch { threw = true; }
check('a chip of 0 blocks throws', threw);

const state = harnessState(1, false);
const bySize = (name: string) => state.memory.find((seg) => seg.name === name)!;
check('Autopilot breaks as AUTO- / PILOT (a soft hyphen), Engine I/O stays whole',
  stripName(bySize('Autopilot'), 4) === 'Auto­pilot' && stripName(bySize('Engine I/O'), 8) === 'Engine I/O');
check('a 1-block tool file is its icon (Rm: ×)', stripName({ id: 't', name: 'Rm', type: 'fs-tool', size: 1, integrity: 100, scanned: true, fsTool: 'delete', version: 1 }, 1) === '×');

// Room for a name at the 1280×720 minimum: the strip is about 670 px for 64 columns with 3 px gaps
// (about 7.5 px a block). A line holds (chip width − border − padding) / (font × 0.6 + spacing) of
// JetBrains Mono's capitals; a name may take two lines, broken at spaces and soft hyphens.
const COL_PX = 7.5;
const GAP_PX = 3;
const TIER_TYPE: Record<string, { padding: number; font: number; spacingEm: number }> = {
  wide: { padding: 6, font: 10, spacingEm: 0.05 },
  narrow: { padding: 5, font: 10, spacingEm: 0.04 },
  tiny: { padding: 3, font: 8, spacingEm: 0.02 },
  micro: { padding: 0, font: 10, spacingEm: 0 },
};
function linesNeeded(name: string, blocks: number): number {
  const tier = stripTier(blocks);
  const type = TIER_TYPE[tier]!;
  const room = blocks * COL_PX + (blocks - 1) * GAP_PX - 2 - 2 * type.padding;
  const perLine = Math.floor(room / (type.font * 0.6 + type.font * type.spacingEm));
  // Greedy: words (pieces between spaces), and pieces of a word at a soft hyphen (+1 for the "-").
  const words = name.toUpperCase().split(' ');
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const pieces = word.split('­').flatMap((piece) => piece.split('​'));
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]! + (i < pieces.length - 1 && word.includes('­') ? '-' : '');
      if (piece.length > perLine) return Infinity;
      const need = used === 0 ? piece.length : used + (i === 0 ? 1 : 0) + piece.length;
      if (need <= perLine) used = need;
      else { lines++; used = piece.length; }
    }
  }
  return lines;
}
const starts = segmentStarts(state.memory);
const badNames = state.memory
  .map((seg, i) => ({ seg, start: starts[i]! }))
  // 046.log's 2-block chip is drawn by its own look (Track UI's SegmentBlock log chip, slice 2), not by its name.
  .filter(({ seg }) => seg.type !== 'free' && seg.type !== 'driver' && seg.type !== 'log')
  .map(({ seg }) => ({ name: seg.name, shown: stripName(seg, seg.size), lines: linesNeeded(stripName(seg, seg.size), seg.size) }))
  .filter(({ lines }) => lines > 2);
check('every ship-1 file name fits its chip in two lines at 1280 px', badNames.length === 0,
  badNames.map(({ name, lines }) => `${name}: ${lines} lines`).join(' | '));
const crossing = state.memory.map((seg, i) => ({ seg, start: starts[i]! }))
  .filter(({ seg, start }) => seg.type !== 'free' && Math.floor(start / RACK_BLOCKS) !== Math.floor((start + seg.size - 1) / RACK_BLOCKS));
check('no ship-1 file straddles two racks (every chip is whole in its row)', crossing.length === 0, crossing.map(({ seg }) => seg.name).join());

// --- The stats row -------------------------------------------------------------------------------------
{
  const stats = memStatsModel(state);
  // Track UI's words: PODS ABOARD 3, `600 colonists` under it.
  check('stats: 3 pods aboard, 600 colonists (no sealed archive: the drivers are files from the start)', stats.pods.label === 'pods aboard'
    && stats.pods.value === '3' && stats.pods.small === '600 colonists', JSON.stringify(stats.pods));
  check('stats: REPAIR CHARGE 36 blk, MEMORY 384 blk · 6 racks', stats.charge.value === '36' && stats.total.value === '384' && stats.total.small === 'blk · 6 racks');
  const free = state.memory.filter((seg) => seg.type === 'free').reduce((sum, seg) => sum + seg.size, 0);
  check(`stats: FREE ${free} blk (computed)`, stats.free.value === String(free));
  check('stats: DAMAGE counts what the kid can see: Engine I/O 85%, Sensor Interp 78% and POD 02 at 44% (ship files stay hidden)',
    stats.damage.label === 'damage' && stats.damage.tone === 'warn' && stats.damage.value === String(Math.round(0.15 * 8 + 0.22 * 8 + 0.56 * 8)), JSON.stringify(stats.damage));
  check('the strip header range: RACK A → F · 0x000 → 0x17F', stripRangeLabel(state) === 'RACK A → F · 0x000 → 0x17F', stripRangeLabel(state));
}

// --- Every ship's pod racks ----------------------------------------------------------------------------------
// A ship's built memory (ship 1 as the harness builds it; a later ship with a fresh unit carried in).
function builtMemory(ship: ShipDef): GameState['memory'] {
  const index = CLASSIC_FIVE.indexOf(ship);
  return index === 0 ? harnessState(1, false).memory : createInitialState({ seed: 1, shipIndex: index, carried: freshUnitRacks(ship) }).memory;
}
{
  // slice-2-plan §4 (01-landing §3.16): the pod racks with the root slot `S` (calm ships have none), the free blocks in
  // them (the slot's GAPs and the largest root it may hold not counted) and the last rack's tail.
  const expected: Record<string, { racks: string[]; free: number; tail: number; pods: number }> = {
    'ARES-VII': { racks: ['P P P _40', '_64', '_64'], free: 168, tail: 64, pods: 3 },
    HALCYON: { racks: ['P P P P P _24', '_64', '_64'], free: 152, tail: 64, pods: 5 },
    KESTREL: { racks: ['P P P P P P _16', 'P P P P P P _16', '_64'], free: 96, tail: 64, pods: 12 },
    VESPER: { racks: ['P P P P P P _16', 'P P _2 S _1 P P P _21', 'P _56'], free: 93 - 14, tail: 56, pods: 12 },
    'LAST LIGHT': { racks: ['P P P P P P P _8', 'P P P P _2 S _1 P _21', 'P P P P _32'], free: 61 - 18, tail: 32, pods: 16 },
  };
  const freeOutsideGaps = (ship: ShipDef): number => podRackLayouts(ship).reduce((sum, { tokens }) => sum + tokens.reduce((rackSum, token, index) => {
    if (token.kind !== 'free') return rackSum;
    const isRoot = (near: (typeof tokens)[number] | undefined): boolean => near?.kind === 'root' || near?.kind === 'slot';
    const nextToRoot = isRoot(tokens[index - 1]) || isRoot(tokens[index + 1]);
    return rackSum + (nextToRoot && token.size < WALL_MIN_BLOCKS ? 0 : token.size);
  }, 0), 0) - (rootSlotRack(ship) === null ? 0 : maxRootFor(ship));
  for (const ship of CLASSIC_FIVE) {
    const want = expected[ship.name];
    const lzPods = ship.landing.lzs.reduce((sum, lz) => sum + lz.pods, 0);
    const racks = [ship.memory.podRacks.B, ship.memory.podRacks.C, ship.memory.podRacks.D];
    check(`${ship.name}: pod racks ${racks.join(' | ')}; ${shipPodCount(ship)} drivers = the LZ sum ${lzPods}; ${freeOutsideGaps(ship)} free, tail ${lastPodRackTrailingFree(ship)}`,
      want !== undefined && JSON.stringify(racks) === JSON.stringify(want.racks) && shipPodCount(ship) === want.pods && lzPods === want.pods
      && freeOutsideGaps(ship) === want.free && lastPodRackTrailingFree(ship) === want.tail
      && want.free >= POD_RACK_MIN_FREE && want.tail >= UNIT_TAIL_BLOCKS,
      JSON.stringify(want));
    const drivers = builtMemory(ship).filter((seg) => seg.type === 'driver');
    check(`${ship.name}: the built memory holds POD 01–${String(want?.pods ?? 0).padStart(2, '0')} in address order, every driver 8 blocks`,
      drivers.length === want?.pods && drivers.every((seg, i) => seg.type === 'driver' && seg.pod === i + 1 && seg.size === 8));
  }
  const throws = (ship: ShipDef, podRacks: Partial<ShipDef['memory']['podRacks']>, pattern: RegExp): { ok: boolean; message: string } => {
    try {
      validatePodRacks({ ...ship, memory: { ...ship.memory, podRacks: { ...ship.memory.podRacks, ...podRacks } } });
      return { ok: false, message: 'did not throw' };
    } catch (error) {
      const message = String((error as Error).message);
      return { ok: pattern.test(message), message };
    }
  };
  const lastLight = CLASSIC_FIVE[4]!;
  const tooFull = throws(lastLight, { B: 'P P P P P P P P', D: 'P P P P P _24' }, /27 free blocks \(root gaps and the largest root not counted\), under 40/);
  check('validatePodRacks: under 40 free blocks in the pod racks throws', tooFull.ok, tooFull.message);
  // VESPER with racks B and D full: only rack C's 21 trailing free blocks count, less its largest root (14), not the slot's
  // GAPs of 2 and 1.
  const gapsOnly = throws(CLASSIC_FIVE[3]!, { B: 'P P P P P P P P', D: 'P P P P P P P P' }, /7 free blocks \(root gaps and the largest root not counted\), under 40/);
  check('…the root\'s GAPs (shorter than a WALL, next to an R) do not count as room', gapsOnly.ok, gapsOnly.message);
  const shortTail = throws(lastLight, { D: '_16 P P P P _16' }, /ends in 16 free blocks, under the unit's 24-block tail/);
  check('validatePodRacks: a last pod rack ending in fewer than 24 free blocks throws', shortTail.ok, shortTail.message);
  const extraPod = throws(CLASSIC_FIVE[0]!, { B: 'P P P P _32' }, /4 drivers in the pod racks, but the LZ counts sum to 3 pods/);
  check('validatePodRacks: a driver more than the LZ counts throws', extraPod.ok, extraPod.message);
}

// --- The live ★ ON TARGET tally --------------------------------------------------------------------------
{
  const landed = (state: GameState, pod: number, place: Touchdown['place'], touch: Touchdown['touch']): void => {
    const record = state.landing.pods.find((candidate) => candidate.pod === pod)!;
    const launch = { atTSec: 0, atAi: 0 } as LaunchRecord;
    record.fate = { kind: 'down', launch, touchdown: { place, lz: place === 'lz' ? 'LZ-A' : null, touch, points: 0, missKm: null, atAi: 0 } };
  };
  const ship1 = harnessState(1, false);
  const start = onTargetTally(ship1);
  check('ship 1 before a launch: 0/3 on target, still possible (every pod aboard)', start.onTargetPods === 0 && start.pods === 3
    && start.colonists === 600 && !start.earned && start.possible, JSON.stringify(start));
  landed(ship1, 1, 'lz', 'soft');
  landed(ship1, 3, 'lz', 'soft');
  const two = onTargetTally(ship1);
  check('two soft in the LZ: 2/3, POD 02 still aboard keeps it possible', two.onTargetPods === 2 && two.onTargetColonists === 400 && !two.earned && two.possible);
  landed(ship1, 2, 'lz', 'hard');
  const hard = onTargetTally(ship1);
  check('POD 02 down hard: 2/3 for good (a hard landing is not on target; 95% needs all three)', hard.onTargetPods === 2 && !hard.earned && !hard.possible);
  const all = harnessState(1, false);
  for (const pod of [1, 2, 3]) landed(all, pod, 'lz', 'soft');
  check('all three soft in the LZ: 3/3, earned', onTargetTally(all).onTargetPods === 3 && onTargetTally(all).earned);
  const off = harnessState(1, false);
  landed(off, 1, 'off-site', 'soft');
  check('an off-site pod is not on target: the star is lost', !onTargetTally(off).possible);
}

finish();
