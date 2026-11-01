// WP3 acceptance 2: the mind runs on AI time. A repair on an 8-block file at 38% completes after
// 3.35 ± 0.05 wall-s at forced world warp ×1 and ×200, and in memory mode (OVERCLOCK), and the
// charge spent is exactly 10 every time. Plus the repair rules around it (§6.5): continuous heal,
// whole-point charging, NO CHARGE, concurrent repairs, the Core staying online, v2, pause.
import { chargePerPoint } from '@state/actions';
import { check, finish } from '../wp1/harness';
import { createHarness3 } from './harness3';
import { actionRepair } from '@state/actions';
import { setDebugWarp } from '@systems/pace';
import { setPaused } from '@systems/clock';
import { setMode } from '@systems/mode';
import { getOps, onOpsChange, threadsBusy } from '@systems/ops-core';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { OP_LINES } from '@data/tool-text';
import type { Segment } from '@/types/segment';
import { MEMORY_LAYOUTS } from '@data/memory';

const h = createHarness3(1);

// The 8-block AI file at 38% (Engine I/O on ship 1), scanned so Repair may target it.
function engineFile(): Segment & { integrity: number; scanned: boolean } {
  const seg = h.store.getState().memory.find((candidate) => candidate.type === 'tool' && candidate.size === 8 && candidate.integrity === 38);
  if (!seg || seg.type !== 'tool') throw new Error('no 8-block tool at 38%');
  seg.scanned = true;
  return seg;
}

interface RepairRun { wall: number; spent: number; integrity: number; worldSec: number; pace: string; progressReports: number; monotonic: boolean }

function timedRepair(setup: () => void): RepairRun {
  h.resetTo('flight');
  h.step();
  setup();
  // Speed-ups glide (×20 → ×200 takes about 3 s); let the world settle at its warp first.
  h.step();
  while (h.store.getState().clock.speed !== h.store.getState().clock.speedTarget) h.step();
  const seg = engineFile();
  const chargeBefore = h.charge().used;
  const tBefore = h.store.getState().clock.tSec;
  let progressReports = 0;
  let monotonic = true;
  let last = seg.integrity;
  const off = onOpsChange((change) => {
    if (change.type !== 'progress') return;
    progressReports++;
    if (change.operation.pct < last) monotonic = false;
    last = change.operation.pct;
  });
  const refusal = actionRepair(h.store, seg);
  if (refusal) throw new Error(`repair refused: ${refusal}`);
  const pace = h.store.getState().clock.overclock ? 'overclock' : h.store.getState().clock.pace;
  const wall = h.runOps();
  off();
  return {
    wall, spent: chargeBefore - h.charge().used, integrity: seg.integrity,
    worldSec: h.store.getState().clock.tSec - tBefore, pace, progressReports, monotonic,
  };
}

const cases: { name: string; setup: () => void }[] = [
  { name: 'forced warp ×1', setup: () => setDebugWarp(h.store, 1) },
  { name: 'forced warp ×200', setup: () => setDebugWarp(h.store, 200) },
  { name: 'memory mode (OVERCLOCK)', setup: () => setMode(h.store, 'memory') },
];
for (const { name, setup } of cases) {
  const run = timedRepair(setup);
  check(`acceptance 2 (${name}): 8 blocks 38→100% in 3.35 ± 0.05 wall-s`, Math.abs(run.wall - 3.35) <= 0.05,
    `${run.wall.toFixed(3)} s, world ran ${run.worldSec.toFixed(1)} game-s (${run.pace})`);
  check(`acceptance 2 (${name}): exactly 10 REPAIR CHARGE spent`, run.spent === 10, `${run.spent}`);
  check(`(${name}) the file ends at 100%`, run.integrity === 100, `${run.integrity}`);
  check(`(${name}) integrity climbs monotonically, reported at most 10 times a second`,
    run.monotonic && run.progressReports <= Math.ceil(run.wall * 10) + 1, `${run.progressReports} reports in ${run.wall.toFixed(2)} s`);
}
// The world really did run at three different speeds while the repair took the same time.
{
  const slow = timedRepair(cases[0]!.setup).worldSec;
  const fast = timedRepair(cases[1]!.setup).worldSec;
  const blue = timedRepair(cases[2]!.setup).worldSec;
  check('the world ran ×1 / ×200 / ×5 while the mind took the same 3.35 s',
    Math.abs(slow - 3.35) < 0.2 && Math.abs(fast - 670) < 15 && Math.abs(blue - 3.35 * 5) < 1,
    `${slow.toFixed(1)} / ${fast.toFixed(1)} / ${blue.toFixed(1)} game-s`);
}

// --- Charge is paid in whole points, never on credit ---------------------------------------------
{
  h.resetTo('flight');
  h.step();
  const seg = engineFile();
  actionRepair(h.store, seg);
  check('a repair takes its first point of charge as it starts healing', h.charge().used === 36);
  h.step();
  check('…and the first point is gone after the first tick', h.charge().used === 35, `${h.charge().used}`);
  check('the file is `repairing` (offline) and locked while it heals', 'state' in seg && seg.state === 'repairing' && seg.operating === true);
  let underPaid = false;
  const spentStart = 36;
  // owed = (integrity − 38) × 0.16; paid = 36 − used ≥ owed at every tick.
  while (getOps().length > 0) {
    h.step();
    const owed = (seg.integrity - 38) * 0.16;
    const paid = spentStart - h.charge().used;
    if (paid + 1e-9 < owed) underPaid = true;
  }
  check('charge paid never falls behind the healing it bought', !underPaid);
  check('the file is back online when the repair ends', 'state' in seg && seg.state === 'intact' && seg.operating === undefined);
}

// --- NO CHARGE ------------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  h.charge().used = 3;
  const seg = engineFile();
  const logBefore = h.log().length;
  actionRepair(h.store, seg);
  const wall = h.runOps();
  // 3 charge at 0.16 per point buys 18.75 points: 38 → 56.75.
  check('NO CHARGE: the repair stops where the charge ends (38 → 56.75%)', Math.abs(seg.integrity - 56.75) < 1e-6, `${seg.integrity}`);
  check('NO CHARGE: it stops early, not after the full repair time', wall < 1.2, `${wall.toFixed(2)} s`);
  const spoken = h.log().slice(logBefore).map((entry) => entry.text);
  check('NO CHARGE: the TERMINAL says so', spoken.includes(OP_LINES.noCharge(seg.name)), spoken.join(' | '));
  check('NO CHARGE: an op-done event with result no-charge', h.events.some((event) => event.name === 'op-done' && (event.payload as { result: string }).result === 'no-charge'));
  const charge = h.store.getState().memory.find((candidate) => candidate.type === 'redundancy');
  check('empty REPAIR CHARGE leaves memory as free space', charge === undefined);
  let ok = true;
  try { assertMemoryInvariants(h.store.getState().memory, MEMORY_LAYOUTS.FULL.totalBlocks); } catch { ok = false; }
  check('…and the strip still holds its invariants', ok);
  check('the file is no longer locked and shows its new health', 'state' in seg && seg.state === 'partial' && seg.operating === undefined);
  const refusal = actionRepair(h.store, seg);
  check('a new repair is refused: no charge left', refusal === 'NO REPAIR CHARGE LEFT', String(refusal));
}

// --- Two repairs at once share the pool exactly ----------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  h.charge().used = 5;
  const engine = engineFile();
  const sensor = h.seg('Sensor Interp');
  if (sensor.type !== 'tool') throw new Error('sensor');
  sensor.scanned = true;
  const startEngine = engine.integrity;
  const startSensor = sensor.integrity;
  actionRepair(h.store, engine);
  actionRepair(h.store, sensor);
  check('two repairs hold both threads', threadsBusy() === 2);
  h.runOps();
  // WP5: the cost per point is the file's size × 2/100 (Sensor Interp is 8 blocks since §4.2's racks).
  const bought = (engine.integrity - startEngine) * chargePerPoint(engine.size) + (sensor.integrity - startSensor) * chargePerPoint(sensor.size);
  check('two repairs never heal more than 5 charge buys', bought <= 5 + 1e-9, `bought ${bought.toFixed(4)}`);
  check('…and the pool ends at exactly 0, never below', h.store.getState().memory.every((seg) => seg.type !== 'redundancy' || seg.used === 0));
}

// --- The Core stays online while repaired -----------------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  const core = h.store.getState().memory.find((seg) => seg.type === 'core');
  if (!core || core.type !== 'core') throw new Error('core');
  core.scanned = true;
  core.integrity = 70;
  core.state = 'partial';
  actionRepair(h.store, core);
  h.step();
  check('the Core is never `repairing` (offline) while healed', core.state === 'partial' && core.operating === true, String(core.state));
  const wall = h.runOps();
  check('the Core heals 16 blocks 70→100 in 30/(100/7.8) s', Math.abs(wall - 30 / (100 / 7.8)) <= 0.06, `${wall.toFixed(3)} s`);
  check('the Core ends intact', core.integrity === 100 && String(core.state) === 'intact');
}

// --- Repair v2 heals twice as fast ----------------------------------------------------------------
{
  const run = timedRepair(() => {
    for (const seg of h.store.getState().memory) if (seg.type === 'fs-tool' && seg.fsTool === 'repair') seg.version = 2;
  });
  check('Repair v2: the same repair in half the time (1.675 s)', Math.abs(run.wall - 1.675) <= 0.05, `${run.wall.toFixed(3)} s`);
  check('Repair v2: the same charge (10)', run.spent === 10, `${run.spent}`);
}

// --- Pause freezes the op; the AI time adds up to the same total -----------------------------------
{
  h.resetTo('flight');
  h.step();
  const seg = engineFile();
  actionRepair(h.store, seg);
  h.stepFor(1);
  const midIntegrity = seg.integrity;
  const midCharge = h.charge().used;
  setPaused(h.store, true);
  h.stepFor(2);
  check('pause mid-op: integrity and charge frozen', seg.integrity === midIntegrity && h.charge().used === midCharge);
  check('pause mid-op: the repair is still running', getOps().length === 1);
  setPaused(h.store, false);
  const rest = h.runOps();
  check('after pause: 1 s + the rest = 3.35 ± 0.05 s of AI time', Math.abs(1 + rest - 3.35) <= 0.05, `${(1 + rest).toFixed(3)} s`);
}

finish();
