// WP3 spec item 1: the ops core. startOp/cancel/abort/abortAll semantics, getOpsBySeg indexing,
// threads (ops + reserved, against the Core's threads), the 10 Hz progress throttle, the world
// reset, and the §9 WP3 edge cases on the threads side (a thread freed while a tool is held; the
// Core dropping below 50 with 2 ops running).
import { check, finish } from '../wp1/harness';
import { createHarness3 } from './harness3';
import {
  startOp, cancelOp, abortOp, abortAll, getOps, getOpsBySeg, threadsBusy, threadsTotal, canStartOp,
  reserveThread, releaseThread, onOpsChange, type OpSpec,
} from '@systems/ops-core';
import { resetWorld } from '@systems/reset';
import { actionScan, actionRepair } from '@state/actions';
import { pickUpTool, applyTool, type ToolDeps } from '@systems/fs-tools';
import { setPaused } from '@systems/clock';
import { TOOL_REFUSAL } from '@data/tool-text';

const h = createHarness3(1);
const deps: ToolDeps = { ask: () => { throw new Error('no confirm expected'); } };

interface Calls { complete: number; cancel: number; abort: number }
function spec(segId: string, seconds: number, calls: Calls, extra: Partial<OpSpec> = {}): OpSpec {
  let elapsed = 0;
  return {
    kind: 'scan', segId, targetIds: [segId], owner: 'test', label: segId, icon: '◎',
    step: (dtAi) => { elapsed += dtAi; return elapsed >= seconds - 1e-9 ? 100 : (elapsed / seconds) * 100; },
    onComplete: () => { calls.complete++; }, onCancel: () => { calls.cancel++; }, onAbort: () => { calls.abort++; },
    ...extra,
  };
}
const fresh = (): Calls => ({ complete: 0, cancel: 0, abort: 0 });

h.resetTo('flight');
h.step();

// --- start / complete / cancel / abort exactly once ---------------------------------------------
{
  const a = fresh();
  const b = fresh();
  const opA = startOp(spec('x-a', 1, a));
  const opB = startOp({ ...spec('x-b', 1, b), targetIds: ['x-b', 'x-shared'] });
  check('two ops hold two threads', threadsBusy() === 2 && !canStartOp());
  let threw = false;
  try { startOp(spec('x-c', 1, fresh())); } catch { threw = true; }
  check('starting without a free thread throws (callers check canStartOp first)', threw);
  check('getOpsBySeg indexes the bar segment and every target', getOpsBySeg('x-shared').length === 1 && getOpsBySeg('x-b')[0]?.id === opB.id && getOpsBySeg('x-a')[0]?.id === opA.id);
  check('cancel ends an operation once, as a cancel', cancelOp(opA.id) && !cancelOp(opA.id) && a.cancel === 1 && a.complete === 0 && a.abort === 0);
  check('abort ends an operation once, as an abort (never onCancel)', abortOp(opB.id) && !abortOp(opB.id) && b.abort === 1 && b.cancel === 0);
  check('ended ops leave the index and free their threads', getOpsBySeg('x-shared').length === 0 && threadsBusy() === 0);
}

// --- complete on AI time; progress throttled to 10 Hz per op ----------------------------------------
{
  const calls = fresh();
  let reports = 0;
  const off = onOpsChange((change) => { if (change.type === 'progress') reports++; });
  startOp(spec('x-timed', 2, calls));
  const start = h.wall();
  while (getOps().length > 0 && h.wall() - start < 5) h.step();
  off();
  check('a 2 s operation completes after 2 s of AI time', calls.complete === 1 && Math.abs(h.wall() - start - 2) < 0.051, `${(h.wall() - start).toFixed(3)} s`);
  check('progress is reported at most 10 times a second', reports >= 15 && reports <= 21, `${reports} reports`);
}

// --- abortAll, and the world reset drops ops WITHOUT callbacks ------------------------------------------
{
  const a = fresh();
  const b = fresh();
  startOp(spec('x-1', 5, a));
  startOp(spec('x-2', 5, b));
  abortAll();
  check('abortAll aborts every operation (onAbort)', a.abort === 1 && b.abort === 1 && getOps().length === 0);
  const c = fresh();
  startOp(spec('x-3', 5, c));
  check('reserveThread holds a thread', reserveThread('autoburn') && threadsBusy() === 2);
  let dup = false;
  try { reserveThread('autoburn'); } catch { dup = true; }
  check('a second reserve by the same owner throws', dup);
  check('reserved threads count against canStartOp', !canStartOp() && !reserveThread('swap'));
  const ends: string[] = [];
  const off = onOpsChange((change) => { if (change.type === 'end') ends.push(change.reason); });
  resetWorld();
  off();
  check('world reset: ops and reserved threads are dropped without callbacks', getOps().length === 0 && threadsBusy() === 0
    && c.complete + c.cancel + c.abort === 0 && ends.join() === 'reset');
  check('releaseThread after the reset is a no-op', !releaseThread('autoburn'));
}

// --- Edge: the Core drops below 50 with 2 ops running ----------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  const memory = h.store.getState().memory;
  const core = memory.find((seg) => seg.type === 'core')!;
  const files = memory.filter((seg) => seg.type === 'tool').slice(0, 3);
  actionScan(h.store, files[0]!);
  actionScan(h.store, files[1]!);
  check('two scans run on two threads', threadsBusy() === 2 && threadsTotal() === 2);
  if (core.type === 'core') core.integrity = 40;
  check('Core below 50: one thread', threadsTotal() === 1 && getOps().length === 2);
  const refusal = actionScan(h.store, files[2]!);
  check('Core below 50 with 2 ops running: no new op', refusal === TOOL_REFUSAL.threads, String(refusal));
  h.runOps();
  check('…the running ones finish', files[0]!.type === 'tool' && files[0]!.scanned && files[1]!.type === 'tool' && files[1]!.scanned);
  check('…and then one operation at a time works', actionScan(h.store, files[2]!) === null && threadsBusy() === 1);
  h.runOps();
}

// --- Edge: a thread freed while a tool is held ------------------------------------------------------------
{
  h.resetTo('flight');
  h.step();
  const files = h.store.getState().memory.filter((seg) => seg.type === 'tool').slice(0, 3);
  actionScan(h.store, files[0]!);
  actionScan(h.store, files[1]!);
  pickUpTool(h.store, 'scan');
  h.refusals.length = 0;
  applyTool(h.store, files[2]!, deps);
  check('a click with every thread busy is refused with a reason', h.refusals.at(-1) === TOOL_REFUSAL.threads && getOps().length === 2, h.refusals.join());
  h.runOps();
  applyTool(h.store, files[2]!, deps);
  check('once a thread frees, the same held tool works without a re-pick', getOps().length === 1 && h.store.getState().ui.activeTool?.kind === 'scan');
  h.runOps();
}

// --- Look-only pause: pickup, apply and cancel refused with PAUSED ----------------------------------------
{
  h.resetTo('flight');
  h.step();
  const files = h.store.getState().memory.filter((seg) => seg.type === 'tool');
  setPaused(h.store, true);
  h.refusals.length = 0;
  pickUpTool(h.store, 'scan');
  check('paused: picking up a tool is refused (PAUSED)', h.store.getState().ui.activeTool === null && h.refusals.at(-1) === 'PAUSED');
  setPaused(h.store, false);
  pickUpTool(h.store, 'scan');
  setPaused(h.store, true);
  applyTool(h.store, files[0]!, deps);
  check('paused: applying a held tool is refused (PAUSED)', getOps().length === 0 && h.refusals.at(-1) === 'PAUSED');
  check('paused: a repair button is refused too', actionRepair(h.store, files[0]!) === 'PAUSED');
  check('paused: every refusal is announced for the buzz and the follower', h.events.filter((event) => event.name === 'refused').length >= 3);
  setPaused(h.store, false);
}

finish();
