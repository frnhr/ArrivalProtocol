// WP7 item 3 (§6.9): systems/carry.ts, pure. The packing order and the drop locks, what travels with a
// file (integrity, infection; never a recoil), the transit hits' floors over many seeds, the arrival
// charge's star credit and floor, the spill into rack D and the loud overflow. Plus, slice 1a: a landing left with no
// driver to launch ends by itself (plan risk 7), as phase 2's NO PRINTER gave up.
import { check, finish } from '../wp1/harness';
import { createHarness7 } from './harness7';
import {
  packUnit, packedFiles, dropLock, rollTransitHits, arrivalCharge, layoutCarried, emergencyCoreToll, toolKindOf,
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
  LANDING_NONE_LEFT_SEC, UNIT_TAIL_BLOCKS,
} from '@data/tuning';
import { setLandingMode } from '../support/landing-instant';
import { recordDriverLost } from '@state/actions';
import { driversInMemory } from '@state/selectors';
import { freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { nominalShipThreat } from '@systems/threat-plan';


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
// 01-landing §3.16's pooled receiver (layoutCarried): rack E's and F's lists back to back from rack E's start, then REPAIR
// CHARGE, then the free rest; a block longer than the receiver starts earlier, right-aligned to memory's end, by at most
// UNIT_TAIL_BLOCKS into the last pod rack (never into more of it than the ship leaves free at its end).
{
  check('arrival charge: carried + 6 per ★', arrivalCharge(14, 18).blocks === 32 && arrivalCharge(14, 18).floorAdded === 0);
  check('…never below 12 (the floor tops it up)', arrivalCharge(3, 6).blocks === CHARGE_ARRIVAL_FLOOR && arrivalCharge(3, 6).floorAdded === 3);
  const packet = packUnit(memory, link, []);
  const rackEBlocks = packet.rackE.reduce((sum, seg) => sum + seg.size, 0);
  const filesBlocks = rackEBlocks + packet.rackF.reduce((sum, seg) => sum + seg.size, 0);
  const receiver = MEMORY_TOTAL_BLOCKS - UNIT_RACKS_START;
  const layout = layoutCarried(packet, 36 + 12, halcyon, nominalShipThreat(1));
  const built = buildShipMemory(halcyon, layout.racks, createRng(1), false, UNNAMED_HOLLOW, null);
  assertMemoryInvariants(built, MEMORY_TOTAL_BLOCKS);
  const starts = segmentStarts(built);
  const addr = (name: string): number => starts[built.findIndex((seg) => seg.name === name)]!;
  const chargeIndex = built.findIndex((seg) => seg.type === 'redundancy');
  check('layout: from 256 the Core first, rack F\'s list right after rack E\'s (Scan first, no gap), then the charge, then free',
    addr('AI Core') === UNIT_RACKS_START && addr('Scan') === UNIT_RACKS_START + rackEBlocks
    && built[chargeIndex]?.size === 48 && starts[chargeIndex] === UNIT_RACKS_START + filesBlocks
    && built[chargeIndex + 1]?.type === 'free' && chargeIndex + 2 === built.length,
    `Core ${addr('AI Core')}, Scan ${addr('Scan')}, charge at ${starts[chargeIndex]}`);
  // A block one longer than the receiver starts a block early, right-aligned to the end of memory.
  const snug = layoutCarried(packet, receiver - filesBlocks + 1, halcyon, nominalShipThreat(1));
  const snugMemory = buildShipMemory(halcyon, snug.racks, createRng(1), false, UNNAMED_HOLLOW, null);
  assertMemoryInvariants(snugMemory, MEMORY_TOTAL_BLOCKS);
  const snugStarts = segmentStarts(snugMemory);
  check('…a block one longer than the receiver starts a block early (the Core at 255), nothing free after it',
    snug.racks.startAddr === UNIT_RACKS_START - 1 && snugStarts[snugMemory.findIndex((seg) => seg.name === 'AI Core')] === UNIT_RACKS_START - 1
    && snugMemory[snugMemory.length - 1]?.type === 'redundancy' && snug.overflowLost === 0, `start ${snug.racks.startAddr}`);
  // An overfull packet: the tail into rack D (free to its end on HALCYON) is capped at UNIT_TAIL_BLOCKS; the rest is lost.
  const big = layoutCarried(packet, 120, halcyon, nominalShipThreat(1));
  const spilled = buildShipMemory(halcyon, big.racks, createRng(1), false, UNNAMED_HOLLOW, null);
  assertMemoryInvariants(spilled, MEMORY_TOTAL_BLOCKS);
  const room = receiver + UNIT_TAIL_BLOCKS;
  check('…a packet bigger than the receiver takes at most UNIT_TAIL_BLOCKS of rack D, and the charge past that is lost',
    big.racks.startAddr === UNIT_RACKS_START - UNIT_TAIL_BLOCKS && big.chargeBlocks === room - filesBlocks
    && big.overflowLost === 120 - (room - filesBlocks), `start ${big.racks.startAddr}, ${big.overflowLost} lost`);
  // A ship whose rack D is full to its end: no tail at all; the charge that does not fit is lost, loudly.
  const fullD: ShipDef = { ...halcyon, id: 'full-d-test', memory: { ...halcyon.memory, podRacks: { ...halcyon.memory.podRacks, D: '_56 P' } } };
  const lost = layoutCarried(packet, 80, fullD, nominalShipThreat(1));
  check('…with rack D full at its end, charge that does not fit the receiver is lost (CHARGE OVERFLOW)',
    lost.racks.startAddr === UNIT_RACKS_START && lost.overflowLost === 80 - (receiver - filesBlocks)
    && lost.chargeBlocks === receiver - filesBlocks, `${lost.overflowLost} lost`);
  let threw = '';
  try { layoutCarried({ ...packet, rackE: [...packet.rackE, ...packet.rackE.map((seg) => ({ ...seg, size: 30 }))] }, 0, fullD, nominalShipThreat(1)); } catch (error) { threw = (error as Error).message; }
  check('…files that do not fit throw', /do not fit/.test(threw), threw);
}

// --- No driver left: the landing ends by itself (plan risk 7) ------------------------------------------------
{
  h.resetTo('flight', 2);
  setLandingMode('manual');
  h.startLanding(1);
  h.step();
  // Every driver gone (eaten), the pods still aboard: nothing can launch any more.
  h.store.update((d) => {
    for (const driver of driversInMemory(d)) {
      recordDriverLost(d, driver, 'eaten');
      d.memory[d.memory.indexOf(driver)] = freeSegment(driver.size);
    }
    mergeAdjacentFree(d.memory);
    d.ui.memoryRev++;
  });
  // Measured in AI seconds (the risk-7 wait counts AI time). The report then waits for the linger and, on HALCYON, for
  // HOLLOW's story beat (landing.ts: the report waits for it), so only its arrival is checked.
  const aiFrom = h.store.getState().clock.aiSec;
  h.stepUntil(() => h.store.getState().landing.ended !== null, 60);
  const tookSec = h.store.getState().clock.aiSec - aiFrom;
  h.stepUntil(() => h.store.getState().run.phase === 'report', 60);
  const state = h.store.getState();
  check(`no driver left: after ${LANDING_NONE_LEFT_SEC} AI s the landing ends by itself (no-driver-left), every pod parked eaten, and the LANDING REPORT follows`,
    state.run.phase === 'report' && state.landing.ended === 'no-driver-left'
    && state.landing.pods.every((record) => record.fate.kind === 'parked' && record.fate.why === 'eaten')
    && tookSec >= LANDING_NONE_LEFT_SEC - 0.1 && tookSec <= LANDING_NONE_LEFT_SEC + 0.5,
    `ended after ${tookSec.toFixed(1)} AI s as ${state.landing.ended}, ${state.landing.pods.map((record) => record.fate.kind).join()}, phase ${state.run.phase}`);
  setLandingMode('instant');
}

// --- createInitialState refuses a later ship with no unit -----------------------------------------------
{
  let threw = '';
  try { createInitialState({ seed: 1, shipIndex: 1 }); } catch (error) { threw = (error as Error).message; }
  check('a later ship built without the unit\'s carried files throws loudly (no silent fresh unit)', /carried files/.test(threw), threw);
}

finish();
