// Final fix pass (the final review's LAST LIGHT and VESPER majors): where a seed lands, judged by the files it would
// really bite, and the strip's RM THE SEED ahead of a lesson's lead-in when the seed's bite reaches the AI Core.
// • seedSpot ('walls', LAST LIGHT): a cluster moved into rack A's free tail beside Cargo Ctrl (the strip's old SAFE spot)
//   no longer pulls the next seed in beside a ship file. The 4-block gap between Cargo Ctrl and the cluster is the
//   smallest WALL touching a soul at the lowest address, the one the rule picked before; now no gap that touches a ship
//   file is used.
// • nearToolsSeedSpot ('near-tools', VESPER): the file on the tool side must BE a filesystem tool, and no spot whose bite
//   on the far side reaches the AI Core or an AI file in rack E is used (a ★★★ kid's racks E–F full of REPAIR CHARGE and
//   cards). Planted rack layouts, each built so the old rule (the nearest gap by the blocks between) picked the bad one.
// • seedBitesAiFile and the director: on VESPER's coast, in the COPY lesson's first seconds, a seed one bite from the
//   Core puts `RM THE SEED` on the strip (outranksLeadIn); one that bites only a tool leaves the lesson its lead-in.
// Usage: node_modules/.bin/tsx --tsconfig tsconfig.json tests/final-fix/seed-spots.test.ts
import { check, finish } from '../wp1/harness';
import { createHarness11 } from '../wp11/harness11';
import { seedSpot, nearToolsSeedSpot, seedBitesAiFile, hollowReach, type SeedSpot } from '@systems/hollow';
import { freeSegment, mergeAdjacentFree, segmentStarts, replaceRange, newSegId } from '@systems/memory-ops';
import { buildDirectorCtx, composeObjective } from '@systems/director';
import { getPrediction } from '@systems/predict';
import { setMode } from '@systems/mode';
import { installTool } from '@systems/licences';
import { GUIDE_RULES } from '@data/script';
import { UNIT_RACKS_START } from '@data/memory';
import { isShipFile, isAiFile } from '@state/selectors';
import { RACK_BLOCKS, SEED_BLOCKS } from '@data/tuning';
import type { Segment, SoulSegment, HollowSegment } from '@/types/segment';
import type { GameState } from '@state/schema';

const h = createHarness11(5);
const state = (): Readonly<GameState> => h.store.getState();
const clone = (memory: readonly Segment[]): Segment[] => structuredClone(memory) as Segment[];

function find(memory: readonly Segment[], test: (seg: Segment) => boolean, what: string): Segment {
  const found = memory.find(test);
  if (!found) throw new Error(`seed-spots: no ${what} in memory`);
  return found;
}

// The free segment a seed spot lands in, and its two neighbours.
function gapAround(memory: readonly Segment[], spot: SeedSpot): { left: Segment | undefined; right: Segment | undefined } {
  const index = memory.findIndex((seg) => seg.id === spot.gapId);
  if (index < 0) throw new Error(`seed-spots: the spot's gap ${spot.gapId} is not in memory`);
  return { left: memory[index - 1], right: memory[index + 1] };
}

// The files a seed landed at `spot` would bite at its next bite (hollowReach's 'bite' verdicts from it).
function bittenBy(memory: readonly Segment[], spot: SeedSpot): Segment[] {
  const after = clone(memory);
  const seed: HollowSegment = { id: newSegId('seed'), name: 'UNIT-046', type: 'hollow', size: SEED_BLOCKS, root: false, locked: false, owner: 'UNIT-046', seed: true };
  replaceRange(after, spot.startAddr, spot.startAddr + SEED_BLOCKS, [seed], { opId: null, own: [] });
  return hollowReach(after, state().clock.aiSec)
    .filter((reach) => reach.hollowId === seed.id && reach.verdict === 'bite')
    .map((reach) => find(after, (seg) => seg.id === reach.neighbourId, 'bitten file'));
}

// --- LAST LIGHT: a cluster moved into rack A's free tail --------------------------------------------------------------
{
  h.lastLight(5, { hollowAsleep: true });
  const memory = clone(state().memory);
  const c13 = find(memory, (seg) => seg.type === 'soul' && seg.cluster === 'C13', 'C13') as SoulSegment;
  const cargo = find(memory, (seg) => seg.type === 'ship' && seg.role === 'cargo', 'Cargo Ctrl');
  // C13's old place becomes free space; rack A's free tail (after Cargo Ctrl) becomes [4 free, C13, the rest free].
  const tailIndex = memory.indexOf(cargo) + 1;
  const tail = memory[tailIndex]!;
  if (tail.type !== 'free' || tail.size < c13.size + 4) throw new Error(`seed-spots: rack A's tail is ${tail.type} ${tail.size}`);
  memory.splice(memory.indexOf(c13), 1, freeSegment(c13.size));
  memory.splice(tailIndex, 1, freeSegment(4), c13, freeSegment(tail.size - 4 - c13.size));
  mergeAdjacentFree(memory);
  const spot = seedSpot(memory, []);
  check('LAST LIGHT, C13 moved beside Cargo Ctrl: a seed still has a spot', spot !== null);
  const sides = spot === null ? null : gapAround(memory, spot);
  check('…in a gap that touches no ship file (not the 4 blocks between Cargo Ctrl and C13)',
    sides !== null && !(sides.left !== undefined && isShipFile(sides.left)) && !(sides.right !== undefined && isShipFile(sides.right)),
    sides === null ? 'none' : `${sides.left?.name} | ${sides.right?.name}`);
  check('…and it bites no ship file', spot !== null && bittenBy(memory, spot).every((seg) => !isShipFile(seg)),
    spot === null ? 'none' : bittenBy(memory, spot).map((seg) => seg.name).join(', '));
  const starts = segmentStarts(memory);
  check('(the 4-block gap beside Cargo Ctrl is the lowest smallest WALL next to a soul: the old rule\'s pick)',
    memory.some((seg, index) => seg.type === 'free' && seg.size === 4 && memory[index - 1] === cargo && memory[index + 1] === c13
      && starts[index]! < RACK_BLOCKS));
}

// --- VESPER: the tool-hunting seed --------------------------------------------------------------------------------
// A unit alone on VESPER has only what a fresh unit carries: the licences a run would have issued by now come first.
function vesperArrived(seed: number): void {
  h.vesper(seed, { hollowAsleep: true });
  for (const kind of ['repair', 'move', 'delete', 'swap'] as const) if (!state().run.licences.includes(kind)) installTool(h.store, kind);
  for (let i = 0; i < 10; i++) h.step();
}
vesperArrived(5);
const vesper = clone(state().memory);
const unitStart = segmentStarts(vesper).findIndex((start) => start >= UNIT_RACKS_START);
const prefix = vesper.slice(0, unitStart);
if (segmentStarts(vesper)[unitStart] !== UNIT_RACKS_START) throw new Error('seed-spots: racks A–D do not end at rack E');
const pick = (test: (seg: Segment) => boolean, what: string): Segment => structuredClone(find(vesper, test, what));
const core = pick((seg) => seg.type === 'core', 'AI Core');
const engine = pick((seg) => seg.type === 'tool' && seg.role === 'engine-io', 'Engine I/O');
const comms = pick((seg) => seg.type === 'tool' && seg.role === 'comms', 'AI Comms');
const repair = pick((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair', 'Repair');
const scan = pick((seg) => seg.type === 'fs-tool' && seg.fsTool === 'scan', 'Scan');
const swap = pick((seg) => seg.type === 'fs-tool' && seg.fsTool === 'swap', 'Swap');
const charge = pick((seg) => seg.type === 'redundancy', 'REPAIR CHARGE');
const sized = <T extends Segment>(seg: T, size: number, id: string): T => ({ ...structuredClone(seg), size, id });
// Racks E and F laid out as given (the planted part), padded with free space to the end of memory.
function planted(unit: Segment[]): Segment[] {
  const used = unit.reduce((sum, seg) => sum + seg.size, 0);
  const rest = 2 * RACK_BLOCKS - used;
  if (rest < 0) throw new Error(`seed-spots: the planted racks E–F take ${used} blocks`);
  return [...clone(prefix), ...unit, ...(rest > 0 ? [freeSegment(rest)] : [])];
}

{
  const spot = nearToolsSeedSpot(vesper, []);
  const bitten = spot === null ? [] : bittenBy(vesper, spot);
  check('VESPER as it arrives: the seed lands one block from a filesystem tool and bites it', spot !== null
    && bitten.some((seg) => seg.type === 'fs-tool'), bitten.map((seg) => seg.name).join(', '));
  check('…and bites no AI file (the Core, an AI tool, a card)', bitten.every((seg) => !isAiFile(seg)), bitten.map((seg) => seg.name).join(', '));
}

{
  // A COPY of Repair beside the Core, behind a 3-block gap, with the only other gap by a tool a 2-block one at the end of
  // rack F (the ★★★ kid's racks are full). The old rule took the larger gap: the seed one block from Repair.cp, and the
  // Core right behind it.
  const copy = sized(repair, 4, 'repair-copy');
  const fillE = sized(charge, RACK_BLOCKS - core.size - 3 - copy.size, 'charge-e');
  const fillF = sized(charge, RACK_BLOCKS - scan.size - swap.size - 2, 'charge-f');
  const memory = [...clone(prefix), core, freeSegment(3), copy, fillE, scan, fillF, swap, freeSegment(2)];
  const spot = nearToolsSeedSpot(memory, []);
  const bitten = spot === null ? [] : bittenBy(memory, spot);
  check('racks E–F full, a gap between the Core and Repair.cp: the seed does not land there', spot !== null
    && gapAround(memory, spot).left?.id !== core.id, spot === null ? 'none' : `${gapAround(memory, spot).left?.name} | ${gapAround(memory, spot).right?.name}`);
  check('…it bites a filesystem tool and never the Core', bitten.some((seg) => seg.type === 'fs-tool') && bitten.every((seg) => seg.type !== 'core'),
    bitten.map((seg) => seg.name).join(', '));
}

{
  // The nearest gap by the blocks between: AI Comms on one side, Engine I/O (an AI tool, not a filesystem tool) on the
  // other, Scan past Engine I/O. The old rule put the seed against Engine I/O, "hunting" Scan behind it.
  const fillE = sized(charge, RACK_BLOCKS - core.size - comms.size - 3 - engine.size, 'charge-e');
  const memory = planted([core, fillE, comms, freeSegment(3), engine, scan, repair, sized(charge, 20, 'charge-f'), swap]);
  const spot = nearToolsSeedSpot(memory, []);
  const bitten = spot === null ? [] : bittenBy(memory, spot);
  check('a gap whose tool side is Engine I/O (an AI tool) is not hunted', spot !== null
    && bitten.every((seg) => !isAiFile(seg)), spot === null ? 'none' : bitten.map((seg) => seg.name).join(', '));
}

{
  // Nothing beside a tool spares the AI files: the centre of the largest region that bites none of them, or no seed.
  const fillE = sized(charge, RACK_BLOCKS - core.size - 3 - repair.size, 'charge-e');
  const memory = [...clone(prefix), core, freeSegment(3), sized(repair, repair.size, 'repair-copy'), fillE, sized(charge, RACK_BLOCKS, 'charge-f')];
  const spot = nearToolsSeedSpot(memory, []);
  const bitten = spot === null ? [] : bittenBy(memory, spot);
  check('with no safe gap beside a tool, the fallback spot bites no AI file either', bitten.every((seg) => !isAiFile(seg)),
    spot === null ? 'no seed' : bitten.map((seg) => seg.name).join(', '));
}

// --- RM THE SEED before the COPY lesson's lead-in when the seed's bite reaches the Core ---------------------------------
{
  const plantSeed = (nextTo: 'core' | 'tool'): void => {
    h.store.update((d) => {
      const target = nextTo === 'core'
        ? d.memory.find((seg) => seg.type === 'core')!
        : d.memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'scan')!;
      const starts = segmentStarts(d.memory);
      // The free space just before the target: one free block, then the seed.
      const index = d.memory.indexOf(target);
      const before = d.memory[index - 1];
      if (!before || before.type !== 'free' || before.size < SEED_BLOCKS + 1) throw new Error(`seed-spots: no free space before ${target.name}`);
      const at = starts[index]! - 1 - SEED_BLOCKS;
      const seed: HollowSegment = { id: newSegId('seed'), name: 'UNIT-046', type: 'hollow', size: SEED_BLOCKS, root: false, locked: false, owner: 'UNIT-046', seed: true };
      replaceRange(d.memory, at, at + SEED_BLOCKS, [seed], { opId: null, own: [] });
      d.hollow.seedsLanded = 1;
      if (!d.run.licences.includes('delete')) d.run.licences.push('delete');
      d.ui.memoryRev++;
    });
  };
  const shownWith = (): string | undefined => {
    const ctx = buildDirectorCtx(state(), getPrediction(), {
      events: new Set(), phaseEntered: null, mindQuietSec: 0, flash: null, leadShownSec: new Map([['copy-repair', 0]]),
    });
    if (ctx.flight?.urgency === 'now') throw new Error(`seed-spots: the flight line is NOW (${ctx.flight.text}): pick a coast`);
    return composeObjective(ctx, GUIDE_RULES)?.id;
  };
  // VESPER's opening is a WAIT. Rack D is empty on VESPER, so the blocks before the Core (the start of rack E) are free;
  // Scan has free space before it once the licences have filled rack F from its end.
  vesperArrived(6);
  setMode(h.store, 'memory');
  plantSeed('tool');
  check('a seed that bites only Scan: the COPY lesson keeps its lead-in (`… IS HUNTING YOUR TOOLS — COPY your Repair`)',
    !seedBitesAiFile(state().memory, state().clock.aiSec) && shownWith() === 'tut-copy-repair', String(shownWith()));
  vesperArrived(6);
  setMode(h.store, 'memory');
  plantSeed('core');
  // `hollow-seed-first` here (the run's first seed: this unit never met KESTREL's), the same `RM THE SEED`.
  check('a seed one bite from the AI Core: `RM THE SEED` comes before the lesson\'s lead-in',
    seedBitesAiFile(state().memory, state().clock.aiSec) && (shownWith() ?? '').startsWith('hollow-seed'), String(shownWith()));
}

finish();
