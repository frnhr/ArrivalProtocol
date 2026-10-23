// WP7 item 3 (§6.9): systems/carry.ts, pure. The packing order and the drop locks, what travels with a
// file (integrity, infection; never a recoil), the transit hits' floors over many seeds, the arrival
// charge's star credit and floor, the spill into rack D and the loud overflow. Plus the printer's way out
// of NO PRINTER (WP5's TODO for WP7).
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import {
  packUnit, packedFiles, dropLock, rollTransitHits, arrivalCharge, layoutCarried, emergencyCoreToll, toolKindOf,
  RACK_F_START,
} from '@systems/carry';
import { createRng } from '@systems/rng';
import { createInitialState } from '@state/initial';
import { installTool } from '@systems/licences';
import { buildShipMemory, UNIT_RACKS_START, MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { getShip, type ShipDef } from '@data/ships';
import { assertMemoryInvariants, segmentStarts } from '@systems/memory-ops';
import { hasIntegrity } from '@state/selectors';
import { UNNAMED_HOLLOW } from '@data/hollow-text';
import {
  TRANSIT_LAST_COPY_FLOOR, TRANSIT_CORE_MAX_HIT, CORE_RESET_INTEGRITY, CHARGE_ARRIVAL_FLOOR, TRANSIT_HIT_MIN, TRANSIT_HIT_MAX,
  NO_PRINTER_GIVE_UP_SEC, PRINT_DONE_LINGER_SEC,
} from '@data/tuning';


const halcyon = getShip(1);
const link = halcyon.arrival!.linkBlocks;

// A ship-1 unit with REPAIR licensed, as it leaves ARES-VII.
const h = createHarness7(1, { soulsFound: true });
h.resetTo('flight', 1);
installTool(h.store, 'repair');
const memory = h.store.getState().memory;

// --- Packing -------------------------------------------------------------------------------------------
{
  const packet = packUnit(memory, link, []);
  check('packing: rack E is the Core, then the AI tools by job', packet.rackE.map((seg) => seg.name).join(',')
    === 'AI Core,Engine I/O,Autopilot,Sensor Interp,Nav Plotter,Telemetry,AI Comms', packet.rackE.map((seg) => seg.name).join(','));
  check('…rack F the fs-tools by kind (Scan, then Repair and its .bak)', packet.rackF.map((seg) => seg.name).join(',') === 'Scan,Repair,Repair.bak');
  check('…files 63 blocks (§5.1: LINK 120 · FILES 63), the charge fits whole', packet.filesBlocks === 63 && packet.chargeCarried === 36);
  check('…copies: memory itself is untouched', packedFiles(packet).every((seg) => !memory.includes(seg)));
  const tight = packUnit(memory, 80, []);
  check('…a narrow link carries charge only up to link − files', tight.chargeCarried === 80 - 63, `${tight.chargeCarried}`);
  const files = packedFiles(packet);
  const lock = (name: string): string | null => dropLock(files, files.find((seg) => seg.name === name)!);
  // WP7 part 2 (deliberate): "the last copy of each tool kind" is the filesystem tools' kinds. The other AI
  // tools can stay behind with their consequence on the chip (§6.9: `Autopilot → no W/A/S/D presets`), so
  // Telemetry is no longer locked.
  check('drop locks: the Core, Engine I/O, Nav Plotter and the last copy of a tool kind',
    lock('AI Core') === 'core' && lock('Engine I/O') === 'engine' && lock('Nav Plotter') === 'navplot' && lock('Scan') === 'last-copy'
    && lock('Telemetry') === null && lock('Repair.bak') === null, ['AI Core', 'Engine I/O', 'Nav Plotter', 'Scan', 'Telemetry', 'Repair.bak'].map(lock).join(','));
  // WP7 part 2: the locks are judged against what still goes, so both copies of REPAIR can't be dropped.
  let bothThrew = '';
  try {
    packUnit(memory, link, memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair').map((seg) => seg.id));
  } catch (error) { bothThrew = (error as Error).message; }
  check('…dropping both copies of REPAIR throws (the second is the last copy)', /last-copy/.test(bothThrew), bothThrew);
  const bak = memory.find((seg) => seg.name === 'Repair.bak')!;
  const lighter = packUnit(memory, link, [bak.id]);
  check('…a dropped .bak stays behind and its blocks go to charge', lighter.filesBlocks === 59 && lighter.rackF.every((seg) => seg.name !== 'Repair.bak'));
  let threw = '';
  try { packUnit(memory, link, [memory.find((seg) => seg.type === 'core')!.id]); } catch (error) { threw = (error as Error).message; }
  check('…dropping the Core throws loudly', /can't be left behind/.test(threw), threw);
}

// --- What travels -----------------------------------------------------------------------------------------
{
  const tele = memory.find((seg) => seg.name === 'Telemetry')!;
  h.store.update((d) => {
    if (hasIntegrity(tele)) { tele.infected = { side: 'left' }; tele.recoilUntilAi = 99; tele.operating = true; }
    d.ui.memoryRev++;
  });
  const packed = packedFiles(packUnit(memory, link, [])).find((seg) => seg.name === 'Telemetry')!;
  check('an infected file arrives infected; its recoil and op flag do not travel',
    hasIntegrity(packed) && packed.infected?.side === 'left' && packed.recoilUntilAi === undefined && packed.operating === undefined);
  h.store.update((d) => { if (hasIntegrity(tele)) { delete tele.infected; delete tele.recoilUntilAi; delete tele.operating; } d.ui.memoryRev++; });
}

// --- Transit hits, over many seeds ----------------------------------------------------------------------------
{
  let worstLast = Infinity;
  let worstCoreHit = 0;
  let worstCore = Infinity;
  let hitsBad = 0;
  let total = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const files = packedFiles(packUnit(memory, link, []));
    const before = new Map(files.map((seg) => [seg, hasIntegrity(seg) ? seg.integrity : 0]));
    const hits = rollTransitHits(files, 6, createRng(seed));
    total += hits.length;
    for (const hit of hits) {
      const dealt = hit.from - hit.to;
      if (hit.role === 'core') worstCoreHit = Math.max(worstCoreHit, dealt);
      else if (dealt > TRANSIT_HIT_MAX || (dealt < TRANSIT_HIT_MIN && hit.to !== TRANSIT_LAST_COPY_FLOOR)) hitsBad++;
    }
    const kinds = new Set(files.map(toolKindOf).filter((kind): kind is string => kind !== null && !kind.endsWith('core')));
    for (const kind of kinds) {
      const best = Math.max(...files.filter((seg) => toolKindOf(seg) === kind).map((seg) => (hasIntegrity(seg) ? seg.integrity : 0)));
      const was = Math.max(...files.filter((seg) => toolKindOf(seg) === kind).map((seg) => before.get(seg)!));
      if (was >= TRANSIT_LAST_COPY_FLOOR) worstLast = Math.min(worstLast, best);
    }
    const core = files.find((seg) => seg.type === 'core')!;
    if (hasIntegrity(core)) worstCore = Math.min(worstCore, core.integrity);
  }
  check('400 seeds × 6 hits: every hit 15–35 points (or stopped at a floor)', hitsBad === 0 && total > 0, `${hitsBad} bad of ${total}`);
  check('…the best copy of every tool kind stays at ≥ 60', worstLast >= TRANSIT_LAST_COPY_FLOOR, `${worstLast}`);
  check('…the Core takes at most 15 per hit and never drops below 25', worstCoreHit <= TRANSIT_CORE_MAX_HIT && worstCore >= CORE_RESET_INTEGRITY,
    `${worstCoreHit} / ${worstCore}`);
  const a = rollTransitHits(packedFiles(packUnit(memory, link, [])), 3, createRng(42));
  const b = rollTransitHits(packedFiles(packUnit(memory, link, [])), 3, createRng(42));
  check('…seeded: the same seed hits the same files for the same points', JSON.stringify(a) === JSON.stringify(b));
  const files = packedFiles(packUnit(memory, link, []));
  const toll = emergencyCoreToll(files, 25, false);
  check('the emergency toll: the Core −25 (100 → 75), logged as a hit', toll?.from === 100 && toll.to === 75);
  const low = packedFiles(packUnit(memory, link, []));
  const core = low.find((seg) => seg.type === 'core')!;
  if (core.type === 'core') core.integrity = 20;
  check('…a Core already under 25 is neither lowered nor raised', emergencyCoreToll(low, 25, false) === null && core.type === 'core' && core.integrity === 20);
}

// --- Arrival charge and the layout -------------------------------------------------------------------------
{
  check('arrival charge: carried + 6 per ★', arrivalCharge(14, 18).blocks === 32 && arrivalCharge(14, 18).floorAdded === 0);
  check('…never below 12 (the floor tops it up)', arrivalCharge(3, 6).blocks === CHARGE_ARRIVAL_FLOOR && arrivalCharge(3, 6).floorAdded === 3);
  const packet = packUnit(memory, link, []);
  const layout = layoutCarried(packet, 36 + 12, halcyon);
  const built = buildShipMemory(halcyon, layout.racks, createRng(1), false, UNNAMED_HOLLOW);
  assertMemoryInvariants(built, MEMORY_TOTAL_BLOCKS);
  const starts = segmentStarts(built);
  const addr = (name: string): number => starts[built.findIndex((seg) => seg.name === name)]!;
  check('layout: rack E from 256 (the Core first), rack F from 320 (Scan first), charge last',
    addr('AI Core') === UNIT_RACKS_START && addr('Scan') === RACK_F_START && built.find((seg) => seg.type === 'redundancy')?.size === 48,
    `${addr('AI Core')} ${addr('Scan')}`);
  // Rack F's list one block too long for rack F (11 blocks of tools + 54 of charge): it starts a block
  // early, in rack E's free tail; rack E's own files do not move.
  const snug = layoutCarried(packet, 54, halcyon);
  const snugMemory = buildShipMemory(halcyon, snug.racks, createRng(1), false, UNNAMED_HOLLOW);
  const snugStarts = segmentStarts(snugMemory);
  check('…rack F\'s list a block too long starts a block early, into rack E\'s free tail',
    snugStarts[snugMemory.findIndex((seg) => seg.name === 'Scan')] === RACK_F_START - 1
    && snugStarts[snugMemory.findIndex((seg) => seg.name === 'AI Core')] === UNIT_RACKS_START);
  // An overfull packet: charge for 120 blocks after the 63 of files spills into rack D's free tail.
  const big = layoutCarried(packet, 120, halcyon);
  const spilled = buildShipMemory(halcyon, big.racks, createRng(1), false, UNNAMED_HOLLOW);
  assertMemoryInvariants(spilled, MEMORY_TOTAL_BLOCKS);
  check('…a packet bigger than racks E–F spills backward into rack D\'s free tail', big.racks.startAddr < UNIT_RACKS_START && big.overflowLost === 0,
    `start ${big.racks.startAddr}`);
  // A ship whose rack D is full to its end: the charge that does not fit is lost, loudly.
  const fullD: ShipDef = { ...halcyon, id: 'full-d-test', memory: { ...halcyon.memory, racksBD: { ...halcyon.memory.racksBD, D: '_56 C' } } };
  const lost = layoutCarried(packet, 80, fullD);
  check('…with rack D full at its end, charge that does not fit is lost (CHARGE OVERFLOW)', lost.overflowLost === 80 - (128 - 63)
    && lost.chargeBlocks === 128 - 63, `${lost.overflowLost} lost`);
  let threw = '';
  try { layoutCarried({ ...packet, rackE: [...packet.rackE, ...packet.rackE.map((seg) => ({ ...seg, size: 30 }))] }, 0, fullD); } catch (error) { threw = (error as Error).message; }
  check('…files that do not fit throw', /do not fit/.test(threw), threw);
}

// --- NO PRINTER gives up (WP5's TODO) ---------------------------------------------------------------------
{
  h.resetTo('flight', 2);
  h.setIntegrity('printer', 10);
  h.startPrinting(1);
  const tookSec = h.stepUntil(() => h.store.getState().run.phase === 'report', 60);
  const results = h.store.getState().souls.results;
  check(`NO PRINTER: after ${NO_PRINTER_GIVE_UP_SEC} s the unprinted are lost and the ship goes on to its WAKE REPORT`,
    h.store.getState().run.phase === 'report' && results.length === 12 && results.every((result) => result.outcome === 'lost')
    && tookSec <= NO_PRINTER_GIVE_UP_SEC + PRINT_DONE_LINGER_SEC + 1, `${tookSec.toFixed(1)} s, ${results.length} results`);
}

// --- createInitialState refuses a later ship with no unit -----------------------------------------------
{
  let threw = '';
  try { createInitialState({ seed: 1, shipIndex: 1 }); } catch (error) { threw = (error as Error).message; }
  check('a later ship built without the unit\'s carried files throws loudly (no silent fresh unit)', /carried files/.test(threw), threw);
}

finish();
