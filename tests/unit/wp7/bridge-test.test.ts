// WP7 acceptance 4 (§6.5, §9 WP7 item 5): the MOVE preview's DOM-free half, systems/move-preview.ts.
// On HALCYON's real layout (slice 1a: rack B `P P P _40`, rack C `P _2 R _1 P _37`, rack D empty):
// • MOVE POD 05 (behind a 1-block GAP) to the far end of rack D: the space it leaves (the GAP, its 8 blocks and the
//   free run after it up to where it lands) is a WALL ✓, the destination is out of HOLLOW's reach, nothing is bridged
//   (§5.1 2:55);
// • MOVE POD 04 (behind a 2-block GAP) away: its old place, the gap and rack B's 40 free blocks are `WALL 50 ✓`;
// • MOVE POD 01 into the free space just past POD 05, one block off it: exposed across `GAP 1`;
// and on a planted strip, the bridge warning (`⚠ BRIDGES HOLLOW TO YOUR CORE`): it fires only when the
// placement leaves HOLLOW a chain of gaps < 4 into rack E that was not there before.
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import { movePreview, memoryAfterMove, reachesRackE, hollowReachAll } from '@systems/move-preview';
import { freeSegment, segmentStarts, assertMemoryInvariants } from '@systems/memory-ops';
import { installTool } from '@systems/licences';
import { MEMORY_TOTAL_BLOCKS, UNIT_RACKS_START } from '@data/memory';
import type { Segment, DriverSegment, HollowSegment, FreeSegment } from '@/types/segment';
import type { GameState } from '@state/schema';
import type { RackHazard } from '@/types/zone';
import { isPodCode, podNumber } from '../support/pod-code';
import { phase2Halcyon } from '../support/hollow-world';

// Final fix pass: the preview also takes the racks a hazard zone is known to hit (the MIND's red rack tags); HALCYON has
// no hazard zones, so none. The hazard warning has its own suite (tests/unit/final-fix/move-hazard.test.ts).
const NO_HAZARDS: readonly RackHazard[] = [];
const h = createHarness7(3, { soulsFound: true });
h.shipAlone(1, 3);
// Phase 3 slice 2: HALCYON is calm now; the preview is checked on its phase-2 racks (support/hollow-world.ts).
phase2Halcyon(h.store);
installTool(h.store, 'move');
const state = () => h.store.getState();
const soul = (code: string): DriverSegment => {
  const found = state().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && isPodCode(seg.pod, code));
  if (!found) throw new Error(`no ${code}`);
  return found;
};
// The free segment holding address `addr`, and the column of `addr` in it.
function at(memory: readonly Segment[], addr: number): { regionSegIds: string[]; col: number } {
  const starts = segmentStarts(memory);
  const index = memory.findIndex((seg, i) => seg.type === 'free' && starts[i]! <= addr && addr < starts[i]! + seg.size);
  if (index < 0) throw new Error(`no free space at ${addr}`);
  return { regionSegIds: [memory[index]!.id], col: addr - starts[index]! };
}
const addrOf = (memory: readonly Segment[], seg: Segment): number => segmentStarts(memory)[memory.indexOf(seg)]!;

// --- HALCYON's own layout ------------------------------------------------------------------------------
{
  const memory = state().memory;
  const c09 = soul('POD 05');
  const toRackDEnd = at(memory, UNIT_RACKS_START - c09.size);
  const preview = movePreview(state(), c09, toRackDEnd, NO_HAZARDS);
  // The 1-block GAP, POD 05's 8 blocks, and the 37 + 64 free after it less the 8 it lands on: 102.
  check('MOVE POD 05 to the end of rack D: the space it leaves is WALL 102 ✓ (the GAP, its blocks and the free run up to where it lands)',
    preview?.source?.blocks === 1 + 8 + 37 + 64 - 8 && preview.source.wall === true, JSON.stringify(preview));
  check('…its new place is out of HOLLOW\'s reach (WALL ✓)', preview?.dest.exposed === false);
  check('…and nothing is bridged (rack E right after it, but the root walled off behind 102 free blocks)', preview?.bridges === false);

  const c08 = soul('POD 04');
  const away = movePreview(state(), c08, at(memory, 200), NO_HAZARDS);
  check('MOVE POD 04 away: rack B\'s 40 free blocks, its old place and the 2-block gap become WALL 50 ✓', away?.source?.blocks === 50 && away.source.wall === true,
    JSON.stringify(away?.source));

  const c07 = soul('POD 01');
  const c10 = soul('POD 05');
  const pastC10 = movePreview(state(), c07, at(memory, addrOf(memory, c10) + c10.size + 1), NO_HAZARDS);
  check('MOVE POD 01 one block past POD 05 (which HOLLOW reaches across its GAP 1): exposed across GAP 1',
    pastC10?.dest.exposed === true && pastC10.dest.gap.blocks === 1 && pastC10.dest.gap.wall === false, JSON.stringify(pastC10?.dest));
  check('…POD 01\'s old place touches no HOLLOW (the edge of rack B, POD 02 on its right): no label', pastC10?.source === null);

  check('a placement the move would refuse (not free space) previews nothing',
    movePreview(state(), c07, { regionSegIds: [c10.id], col: 0 }, NO_HAZARDS) === null);
  const after = memoryAfterMove(memory, c09, toRackDEnd)!;
  let valid = true;
  try { assertMemoryInvariants(after, MEMORY_TOTAL_BLOCKS); } catch { valid = false; }
  check('the previewed memory is a valid 384-block strip and the real one is untouched',
    valid && state().memory === memory && memory.includes(c09) && addrOf(memory, c09) === 147, `POD 05 at ${addrOf(memory, c09)}`);
}

// --- The bridge, on a planted strip ---------------------------------------------------------------------
// Racks A–D: free up to the root, then a chain the root reaches across small gaps, then an 8-block gap
// (a WALL) before rack E. A 2-block file dropped into the middle of that WALL leaves 3 + 3: a bridge.
let nextId = 0;
const freeOf = (size: number): FreeSegment => freeSegment(size);
const cluster = (code: string): DriverSegment => ({
  id: `t_${code}_${nextId++}`, name: `${code} · Test`, type: 'driver', size: 8, integrity: 100, state: 'intact', pod: podNumber(code),
  family: 'Test', colonists: 200, featured: [],
});
const root = (): HollowSegment => ({ id: `t_root_${nextId++}`, name: '???', type: 'hollow', size: 8, root: true, locked: true, owner: '???' });

// `bridged`: C05 closes the WALL (3 free from C04, then C05 against rack E): HOLLOW already reaches rack E.
function planted(bridged = false): GameState['memory'] {
  const unit = state().memory.filter((_seg, i) => segmentStarts(state().memory)[i]! >= UNIT_RACKS_START);
  const tail: Segment[] = bridged ? [freeOf(3), cluster('C05')] : [freeOf(8)];
  const before: Segment[] = [freeOf(bridged ? 196 : 199), root(), freeOf(2), cluster('C01'), freeOf(3), cluster('C02'), freeOf(3), cluster('C03'),
    freeOf(1), cluster('C04'), ...tail];
  const sum = before.reduce((total, seg) => total + seg.size, 0);
  if (sum !== UNIT_RACKS_START) throw new Error(`planted racks A–D sum to ${sum}`);
  return [...before, ...unit.map((seg) => structuredClone(seg))];
}

{
  const memory = planted();
  assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  h.store.update((d) => { d.memory = memory; d.ui.memoryRev++; });
  check('the planted strip: HOLLOW reaches C01–C04 across gaps of 2, 3, 3, 1, but not rack E (an 8-block WALL)',
    hollowReachAll(memory).size === 5 && !reachesRackE(memory), `${hollowReachAll(memory).size} reached`);
  const mv = state().memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move')!;
  const wallStart = UNIT_RACKS_START - 8;
  const bridge = movePreview(state(), mv, at(memory, wallStart + 3), NO_HAZARDS);
  check('dropping a 2-block file into the middle of that WALL (3 + 3 left): ⚠ BRIDGES HOLLOW TO YOUR CORE',
    bridge?.bridges === true && bridge.dest.exposed === true, JSON.stringify(bridge));
  const edge = movePreview(state(), mv, at(memory, wallStart), NO_HAZARDS);
  check('…at the WALL\'s near edge (right against C04, then 6 free before rack E): exposed, but no bridge',
    edge?.bridges === false && edge.dest.exposed === true, JSON.stringify(edge));
  const far = movePreview(state(), mv, at(memory, 10), NO_HAZARDS);
  check('…far from HOLLOW (rack A\'s free space): safe, no bridge', far?.bridges === false && far.dest.exposed === false);

  // A strip that is already bridged: a move that keeps the bridge does not claim to make it.
  const bridged = planted(true);
  assertMemoryInvariants(bridged, MEMORY_TOTAL_BLOCKS);
  h.store.update((d) => { d.memory = bridged; d.ui.memoryRev++; });
  check('a strip already bridged (C05 sits 0 blocks from rack E, 3 from C04)', reachesRackE(bridged));
  const mvTool = state().memory.find((seg) => seg.type === 'fs-tool' && seg.fsTool === 'move')!;
  const keep = movePreview(state(), mvTool, at(bridged, 20), NO_HAZARDS);
  check('…a move that keeps HOLLOW\'s bridge (Mv out to rack A) does not warn: it was there before',
    keep?.bridges === false && reachesRackE(memoryAfterMove(bridged, mvTool, at(bridged, 20))!), JSON.stringify(keep));
  const c01 = state().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 1)!;
  const cut = memoryAfterMove(bridged, c01, at(bridged, 20))!;
  check('…moving C01 (the root\'s neighbour) away walls the root off: the bridge is gone', !reachesRackE(cut));
  const c05 = state().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 5)!;
  const breakIt = memoryAfterMove(bridged, c05, at(bridged, 20))!;
  check('…moving C05 (the bridging file) away breaks the bridge', !reachesRackE(breakIt));
}

finish();
