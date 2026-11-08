// WP10 acceptance 4 (§9 WP10 item 4, §6.5, §6.6): the COPY licence at VESPER's boot, COPY's refusals, and the
// `near-tools` seed targeting, headless (harness10, every DOM-free system).
// • COPY is licensed at the flight's first moment, CONTROL saying so after its hello; a COPY of Repair makes Repair.cp
//   (a third working Repair), and the strip's lesson `UNIT-046 IS HUNTING YOUR TOOLS — COPY your Repair` stands once the
//   first seed comes for the tools, until that spare exists.
// • COPY's refusals: people (`Souls can't be copied.`), REPAIR CHARGE, the Core, a card's file, HOLLOW (its root LOCKED,
//   an eaten block), a file being eaten, free space; a destination too small; no free thread.
// • `near-tools` (nearToolsSeedSpot): the free gap nearest a filesystem tool's file, the end that faces the tool, one free
//   block from it (a GAP: the seed bites that tool at its next bite); ties to the larger gap; never space a running op
//   reserved; a gap just the seed's size takes it next to the tool; with no tool file left, the largest free region's
//   centre. On VESPER as it arrives (slice 1a pooled receiver) no gap borders a tool: that centre; once its licences
//   are written, next to the last of them.
// • Live on VESPER: the first seed is telegraphed 25 AI s after HOLLOW's wake (and THE DEAL, which holds the seeds while
//   it stands), next to a tool, and bites it unless it is DELETEd.
// • WP11 (the lead's TODO, WP10 question 3): a tool licensed on this ship that the kid has not used here yet
//   (HollowState.untriedTools: COPY from VESPER's boot, SWAP from its first burst; never Repair) is not hunted, and no seed
//   lands within bite of one; its first use makes it fair game. The pure calls above it pass `[]` (every tool tried).
import '../support/classic-world';
import { check, finish } from '../wp1/harness';
import { createHarness10 } from './harness10';
import { nearToolsSeedSpot, threateningSeeds, hollowReach, seedSpotFor, type SeedSpot } from '@systems/hollow';
import { targetRefusal } from '@systems/tool-targets';
import { actionCopy, actionMove, actionScan } from '@state/actions';
import { pickChoice } from '@systems/say';
import { DEAL_REFUSE } from '@systems/hollow-deal';
import { segmentStarts, freeSegment, replaceRange, mergeAdjacentFree } from '@systems/memory-ops';
import { getOps, canStartOp } from '@systems/ops-core';
import { createToolFiles } from '@data/fs-tools';
import { LICENCE_LINES } from '@data/script';
import { installTool } from '@systems/licences';
import { TOOL_REFUSAL } from '@data/tool-text';
import { isUsableTool } from '@state/selectors';
import type { Segment, FreeSegment, FsToolSegment, HollowSegment } from '@/types/segment';
import { SEED_BLOCKS } from '@data/tuning';

const h = createHarness10(13);
const state = () => h.store.getState();
const segNamed = (name: string): Segment => {
  const seg = state().memory.find((candidate) => candidate.name === name);
  if (!seg) throw new Error(`no ${name}`);
  return seg;
};
const addrOf = (memory: readonly Segment[], seg: Segment): number => segmentStarts(memory)[memory.indexOf(seg)]!;
const repairs = (): FsToolSegment[] => state().memory.filter((seg): seg is FsToolSegment => seg.type === 'fs-tool' && seg.fsTool === 'repair');
const biggestFree = (): FreeSegment => state().memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined)
  .sort((a, b) => b.size - a.size)[0]!;

// --- The licence --------------------------------------------------------------------------------------------------
h.vesper(13, { hunt: true, hollowAsleep: true });
h.step();
h.step();
{
  const log = state().log.entries.map((entry) => entry.text);
  const hello = log.findIndex((text) => text.startsWith('Hello, Unit'));
  const licence = log.indexOf(LICENCE_LINES.copy);
  check('COPY is licensed at VESPER\'s first moment (Cp in memory, the COPY chip)', state().run.licences.includes('copy')
    && state().memory.some((seg) => seg.type === 'fs-tool' && seg.fsTool === 'copy'));
  check('…CONTROL says so after its hello', hello >= 0 && licence > hello, log.slice(-4).join(' | '));
  // (A unit flown here by itself also gets MOVE and DELETE at this ship's start, as if HALCYON and KESTREL were lost: they
  // arrived on this ship too, so they are spared as well.)
  check('WP11: …and COPY is spared by HOLLOW until it is used (untriedTools)', state().hollow.untriedTools.includes('copy'),
    state().hollow.untriedTools.join(','));
}

// --- COPY's refusals ------------------------------------------------------------------------------------------------
// A unit flown here by itself never looked inside on ship 1: its REPAIR comes the way it would have (the licence).
installTool(h.store, 'repair');
check('WP11: Repair is never spared (the COPY lesson\'s target): REPAIR\'s licence leaves it out of untriedTools',
  !state().hollow.untriedTools.includes('repair') && state().hollow.untriedTools.includes('copy'), state().hollow.untriedTools.join(','));
{
  const ctx = (picked: Segment | null = null) => ({ state: state(), activeKind: 'copy' as const, pickedSource: picked });
  const soul = state().memory.find((seg) => seg.type === 'driver')!;
  const root = state().memory.find((seg) => seg.type === 'hollow' && seg.root)!;
  check('COPY refused on people', targetRefusal(soul, ctx()) === TOOL_REFUSAL.driverCopy);
  check('…on REPAIR CHARGE', targetRefusal(segNamed('Repair Charge'), ctx()) === TOOL_REFUSAL.copyCharge);
  check('…on the Core', targetRefusal(segNamed('AI Core'), ctx()) === TOOL_REFUSAL.coreCopy);
  check('…on HOLLOW\'s root (LOCKED)', targetRefusal(root, ctx()) === TOOL_REFUSAL.locked);
  check('…on free space', targetRefusal(biggestFree(), ctx()) === TOOL_REFUSAL.notAFile);
  // A card's file: a FIREWALL laid into rack D.
  h.store.update((d) => {
    const free = d.memory.filter((seg): seg is FreeSegment => seg.type === 'free').sort((a, b) => b.size - a.size)[0]!;
    const start = addrOf(d.memory, free);
    replaceRange(d.memory, start, start + 2, [{ id: 'fw-test', name: 'FIREWALL.sys', type: 'firewall', size: 2 }], { opId: null, own: [] });
    mergeAdjacentFree(d.memory);
    d.ui.memoryRev++;
  });
  check('…on a card\'s file (FIREWALL.sys)', targetRefusal(segNamed('FIREWALL.sys'), ctx()) === TOOL_REFUSAL.cardCopy);
  // A file being eaten.
  h.store.update((d) => { const telem = d.memory.find((seg) => seg.name === 'Telemetry'); if (telem && 'integrity' in telem) telem.infected = { side: 'left' }; });
  check('…on a file being eaten (Telemetry, infected)', targetRefusal(segNamed('Telemetry'), ctx()) === TOOL_REFUSAL.infected);
  h.store.update((d) => { const telem = d.memory.find((seg) => seg.name === 'Telemetry'); if (telem && 'integrity' in telem) delete telem.infected; });
  // Stage 2: a destination too small for Repair (the 1-block gap in rack C).
  const repair = repairs()[0]!;
  const tiny = state().memory.find((seg): seg is FreeSegment => seg.type === 'free' && seg.size === 1)!;
  check('…a destination too small (a 1-block gap for 4-block Repair)', targetRefusal(tiny, ctx(repair)) === TOOL_REFUSAL.noRoom);
  // No free thread.
  actionScan(h.store, segNamed('Reactor'));
  actionScan(h.store, segNamed('Cargo Ctrl'));
  const free = biggestFree();
  check('…no free thread (two SCANs running)', !canStartOp()
    && actionCopy(h.store, repair, { regionSegIds: [free.id], col: free.size - repair.size }) === TOOL_REFUSAL.threads);
  while (getOps().length > 0) h.step();
  // A COPY of Repair into rack D: Repair.cp, a third working Repair.
  const before = repairs().length;
  const dest = biggestFree();
  const startAi = state().clock.aiSec;
  check('a COPY of Repair starts', actionCopy(h.store, repair, { regionSegIds: [dest.id], col: 0 }) === null);
  check('WP11: …the kid\'s first COPY makes COPY fair game for HOLLOW', !state().hollow.untriedTools.includes('copy'), state().hollow.untriedTools.join(','));
  while (getOps().length > 0) h.step();
  const copy = repairs().find((seg) => seg.name === 'Repair.cp');
  check('…and lands as Repair.cp, a working Repair (2.0 + 0.3 × 4 = 3.2 AI s)', copy !== undefined && isUsableTool(copy)
    && repairs().length === before + 1 && Math.abs(state().clock.aiSec - startAi - 3.2) < 0.06, `${(state().clock.aiSec - startAi).toFixed(2)} s`);
}

// --- near-tools targeting, pure ---------------------------------------------------------------------------------
{
  h.vesper(14, { hunt: true, hollowAsleep: true });
  // Slice 1a's pooled receiver (01-landing §3.16) packs the unit's files back to back from rack E's start; on VESPER it
  // leaves a hunting ground before the first tool (carry.ts huntingGapBlocks, review issue 5: a WALL off the AI files,
  // then room for the seed), so as it arrives the seed already borders a tool (Scan) and bites no AI file.
  const arrived = state().memory;
  const arrivedSpot = nearToolsSeedSpot(arrived, [])!;
  const arrivedBites = bittenBy(arrived, arrivedSpot.startAddr);
  check('VESPER as it arrives (pooled receiver, its hunting ground): the seed borders a tool and bites it, no AI file',
    arrivedBites.some((seg) => seg.type === 'fs-tool') && arrivedBites.every((seg) => seg.type === 'fs-tool'),
    `seed at ${arrivedSpot.startAddr} in ${arrivedSpot.gapId}, bites ${arrivedBites.map((seg) => seg.name).join(', ')}`);
  // Its licences written (the flight's first ticks: Mv, Rm and Cp after REPAIR CHARGE, then the free tail): the seed aims
  // one free block after the last of them (the gap next to it, the end that faces it).
  h.step();
  h.step();
  const memory = state().memory;
  const spot = nearToolsSeedSpot(memory, [])!;
  const gapIndex = memory.findIndex((seg) => seg.id === spot.gapId);
  const facing = memory[gapIndex - 1];
  check('VESPER with its licences in memory: the seed aims one free block after the last licence file (the end that faces it)',
    facing?.type === 'fs-tool' && spot.startAddr === addrOf(memory, facing) + facing.size + 1,
    `seed at ${spot.startAddr}, ${facing?.name} at ${facing === undefined ? '-' : addrOf(memory, facing)}`);
  check('…seedSpotFor dispatches on the ship\'s rule', seedSpotFor(memory, 'near-tools', [])?.startAddr === spot.startAddr);

  // Tools on both sides of two gaps at the same distance: the larger gap wins.
  const twin: Segment[] = [
    freeSegment(3), ...createToolFiles('scan'), freeSegment(10), ...createToolFiles('delete'), freeSegment(384 - 3 - 3 - 10 - 1),
  ];
  const twinSpot = nearToolsSeedSpot(twin, [])!;
  // Three gaps touch a tool (3 blocks before Scan, 10 between Scan and Rm, the 367-block tail after Rm): the tail.
  check('ties (every gap touching a tool) go to the larger gap', twinSpot.gapId === twin[4]!.id, twinSpot.gapId);
  const twinStarts = segmentStarts(twin);
  check('…and the seed sits at its end that faces the tool (Rm, on its left), one block away',
    twinSpot.startAddr === twinStarts[3]! + 1 + 1, `${twinSpot.startAddr}`);

  // A gap of exactly the seed's size between two tools, the rest of memory behind a ship file: the seed fills it.
  const filler = { id: 'filler', name: 'Filler', type: 'ship', size: 4, integrity: 100, scanned: true } as Segment;
  const snug: Segment[] = [...createToolFiles('scan'), freeSegment(SEED_BLOCKS), ...createToolFiles('repair'), filler, freeSegment(384 - 3 - SEED_BLOCKS - 8 - 4)];
  const snugSpot = nearToolsSeedSpot(snug, [])!;
  check('a gap just the seed\'s size next to a tool: the seed fills it (no block between)', snugSpot.startAddr === 3, `${snugSpot.startAddr}`);

  // Reserved space is never used: a MOVE reserving the gap the seed aims at sends the seed elsewhere (MOVE comes with the
  // flight's first tick: HALCYON's licence, issued at a later ship's start).
  const thrust = segNamed('Cargo Ctrl');
  const huntedGap = state().memory.find((seg) => seg.id === spot.gapId)!;
  const moveRefusal = huntedGap.type === 'free' ? actionMove(h.store, thrust, { regionSegIds: [huntedGap.id], col: 0 }) : 'no gap';
  check('a MOVE into the gap the seed aims at (next to the last licence file)', moveRefusal === null, String(moveRefusal));
  const movingSpot = nearToolsSeedSpot(state().memory, [])!;
  const reserved = state().memory.filter((seg) => seg.type === 'free' && seg.reservedBy !== undefined).map((seg) => seg.id);
  check('…the seed never aims at the space the MOVE reserved', !reserved.includes(movingSpot.gapId), `${movingSpot.gapId} vs ${reserved.join(',')}`);
  while (getOps().length > 0) h.step();

  // No tool file at all: the largest free region's centre.
  const bare: Segment[] = [freeSegment(10), { id: 'x', name: 'X', type: 'ship', size: 4, integrity: 100, scanned: true } as Segment, freeSegment(370)];
  const bareSpot = nearToolsSeedSpot(bare, [])!;
  check('no tool file left: the centre of the largest free region', bareSpot.startAddr === 14 + Math.floor((370 - SEED_BLOCKS) / 2), `${bareSpot.startAddr}`);
}

// --- Live on VESPER: the first seed hunts a tool -------------------------------------------------------------------
{
  h.vesper(15, { hunt: true });
  h.stepUntil(() => state().hollow.phase === 'awake', 60);
  const wokeAt = state().clock.aiSec;
  // The kid answers THE DEAL at once (REFUSE) and heals the two bites, so the seed is the next thing that happens.
  h.stepUntil(() => state().hollow.deal.phase === 'offered', 30);
  const entryId = state().hollow.deal.entryId!;
  pickChoice(entryId, DEAL_REFUSE);
  let copyLine = false;
  let telegraphAt: number | null = null;
  let aimed: { tool: string; gap: number } | null = null;
  h.stepUntil(() => {
    h.defend9();
    const shown = state().director.shown?.id ?? '';
    if (shown.startsWith('tut-copy-repair')) copyLine = true;
    const telegraph = state().hollow.seedTelegraph;
    if (telegraph !== null && telegraphAt === null) {
      telegraphAt = state().clock.aiSec;
      const starts = segmentStarts(state().memory);
      const after = state().memory.findIndex((seg, index) => starts[index]! >= telegraph.startAddr + SEED_BLOCKS && seg.type !== 'free');
      const tool = state().memory[after];
      aimed = tool ? { tool: tool.name, gap: starts[after]! - telegraph.startAddr - SEED_BLOCKS } : null;
    }
    return state().hollow.seedsLanded > 0;
  }, 120);
  // Telegraphed next to a tool (either side).
  check('the first seed is telegraphed 25 AI s after the wake (the deal\'s wait included)', telegraphAt !== null && telegraphAt - wokeAt >= 25 - 0.1,
    `${telegraphAt === null ? '-' : (telegraphAt - wokeAt).toFixed(1)} s after the wake`);
  const seed = state().memory.find((seg) => seg.type === 'hollow' && seg.seed === true);
  const reach = seed ? hollowReach(state().memory, state().clock.aiSec).filter((entry) => entry.hollowId === seed.id) : [];
  const bitesTool = reach.some((entry) => entry.verdict === 'bite' && state().memory.find((seg) => seg.id === entry.neighbourId)?.type === 'fs-tool');
  check('…it lands one block from a filesystem tool and can bite it at the next bite', seed !== undefined && bitesTool
    && threateningSeeds(state().memory, state().clock.aiSec).some((threat) => threat.id === seed.id),
    `${JSON.stringify(aimed)} ${reach.map((entry) => `${entry.side}:${entry.verdict}:${entry.gapBlocks}`).join(',')}`);
  h.stepFor(6, () => { if ((state().director.shown?.id ?? '').startsWith('tut-copy-repair')) copyLine = true; });
  // Final fix pass: the lesson names the enemy as the kid knows it (`UNIT-046`), never HOLLOW; the check reads the id.
  check('…the strip says `UNIT-046 IS HUNTING YOUR TOOLS — COPY your Repair` (or RM THE SEED first)', copyLine
    || state().director.done.some((id) => id.startsWith('tut-copy-repair')) || (state().director.shown?.text ?? '').includes('RM THE SEED'),
    state().director.shown?.text ?? '');
}

// --- WP11: a tool licensed here is spared until it is used (the lead's TODO for WP11) ---------------------------------
// The tools a seed at `startAddr` could bite at the next bite (landed on a copy of memory).
function bittenBy(memory: readonly Segment[], startAddr: number): Segment[] {
  const after = structuredClone(memory) as Segment[];
  const probe: HollowSegment = { id: 'probe-seed', name: 'UNIT-046', type: 'hollow', size: SEED_BLOCKS, root: false, locked: false, owner: 'UNIT-046', seed: true };
  replaceRange(after, startAddr, startAddr + SEED_BLOCKS, [probe], { opId: null, own: [] });
  return hollowReach(after, 0).filter((entry) => entry.hollowId === probe.id && entry.verdict === 'bite' && entry.neighbourId !== null)
    .map((entry) => after.find((seg) => seg.id === entry.neighbourId)!);
}
const toolsIn = (segs: readonly Segment[]): FsToolSegment['fsTool'][] => segs.flatMap((seg) => (seg.type === 'fs-tool' ? [seg.fsTool] : []));
{
  h.vesper(14, { hunt: true, hollowAsleep: true });
  h.step();
  h.step();
  // VESPER after its first moment (its licences in memory): the tool the seed hunts with every tool tried, then spared.
  const memory = state().memory;
  const huntedKind = toolsIn(bittenBy(memory, nearToolsSeedSpot(memory, [])!.startAddr))[0];
  const spared: SeedSpot = nearToolsSeedSpot(memory, huntedKind === undefined ? [] : [huntedKind])!;
  const sparedBites = toolsIn(bittenBy(memory, spared.startAddr));
  // Slice 1a's pooled receiver: the hunted licence (Cp, the last before the free tail) is the only tool beside free space,
  // so with it spared the seed falls back to a spot that bites no tool at all (phase 2: it hunted another tool).
  check('WP11: VESPER, the hunted tool spared: the spared one is not within the seed\'s bite (on the pooled unit it bites no tool)',
    huntedKind !== undefined && !sparedBites.includes(huntedKind), `hunted ${huntedKind} → spared: bites ${sparedBites.join(',') || 'no tool'}`);
  // A gap of three between Scan and Swap: a seed one block from Scan touches Swap on its far side.
  const filler = { id: 'filler2', name: 'Filler', type: 'ship', size: 4, integrity: 100, scanned: true } as Segment;
  const swapFiles = createToolFiles('swap');
  const swapSize = swapFiles.reduce((sum, seg) => sum + seg.size, 0);
  const between: Segment[] = [...createToolFiles('scan'), freeSegment(SEED_BLOCKS + 1), ...swapFiles, filler, freeSegment(384 - 3 - SEED_BLOCKS - 1 - swapSize - 4)];
  const beforeSwap = nearToolsSeedSpot(between, [])!;
  const sparedSwap = nearToolsSeedSpot(between, ['swap'])!;
  check('WP11: a 3-block gap between Scan and an untried Swap: the seed does not take it (Swap would be within its bite)',
    beforeSwap.gapId === between[1]!.id && sparedSwap.gapId !== between[1]!.id && !toolsIn(bittenBy(between, sparedSwap.startAddr)).includes('swap'),
    `tried: ${beforeSwap.gapId}, spared: ${sparedSwap.gapId} (gap ${between[1]!.id})`);
}
// Live, on several VESPER seeds flown by the WP10 defender (it SWAPs when the lesson asks): COPY is untried from the boot,
// SWAP from the first burst until the defender swaps; no seed lands within bite of a tool untried at that moment.
{
  const rows: string[] = [];
  let bad = '';
  let sawSwapSpared = 0;
  for (const seed of [21, 22, 23, 24, 25, 26]) {
    h.vesper(seed, { hunt: true });
    let landed = state().hollow.seedsLanded;
    let swapSpared = false;
    h.stepUntil(() => {
      h.defend10();
      if (state().hollow.untriedTools.includes('swap')) swapSpared = true;
      if (state().hollow.seedsLanded > landed) {
        landed = state().hollow.seedsLanded;
        const untried = state().hollow.untriedTools;
        const seeds = state().memory.filter((seg) => seg.type === 'hollow' && seg.seed === true);
        const reach = hollowReach(state().memory, state().clock.aiSec);
        const bitten = toolsIn(reach.filter((entry) => entry.verdict === 'bite' && seeds.some((seg) => seg.id === entry.hollowId))
          .flatMap((entry) => state().memory.filter((seg) => seg.id === entry.neighbourId)));
        rows.push(`seed ${seed}: untried [${untried.join(',')}], bites ${bitten.join(',') || '-'}`);
        if (bitten.some((kind) => untried.includes(kind))) bad ||= rows[rows.length - 1]!;
      }
      return state().hollow.seedsLanded >= 2;
    }, 150);
    if (swapSpared) sawSwapSpared++;
  }
  check('WP11: live on 6 VESPER seeds: no seed lands within bite of a tool licensed here and not used yet (COPY, SWAP)',
    bad === '' && rows.length >= 6 && sawSwapSpared > 0, bad || `${rows.join(' | ')}; Swap spared for a while on ${sawSwapSpared} of 6`);
}

finish();
