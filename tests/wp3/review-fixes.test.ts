// WP3 review fixes (round 1), headless: SWAP obeys the action rules (busy files, a missing
// backup), a deleted backup unlinks its primary, the delete question counts working copies and
// is never asked when the yes would be refused, a refused placement keeps the picked source,
// the thread total announces its changes and never reads "2/1", INSPECT's buttons disable with
// the click's own reason, the held tool's hint, the file INSPECT follows, and the op labels.
import { check, finish } from '../wp1/harness';
import { createHarness3 } from './harness3';
import {
  actionScan, actionRepair, actionMove, actionCopy, actionDelete, actionSwap,
} from '@state/actions';
import {
  pickUpTool, applyTool, requestDelete, getLastAppliedTargetId, type ToolDeps, type ConfirmRequest,
} from '@systems/fs-tools';
import { deleteQuestion, isOpenFree, heldToolHint } from '@systems/tool-targets';
import { getOps, onOpsChange, threadsBusy, threadsTotal } from '@systems/ops-core';
import { setPaused } from '@systems/clock';
import { computeActions } from '@components/memory-view/DetailPanel';
import { threadRowHtml, shownThreadsTotal } from '@components/memory-view/SegmentBlock';
import { TOOL_REFUSAL } from '@data/tool-text';
import { TOOL_HINTS } from '@data/fs-tools';
import { installTool } from '@systems/licences';
import type { Segment, ShipSegment } from '@/types/segment';

const h = createHarness3(1);
let asked: ConfirmRequest | null = null;
const deps: ToolDeps = { ask: (request) => { asked = request; } };
const memory = (): Segment[] => h.store.getState().memory;
const bigFree = (): Segment => memory().filter(isOpenFree).sort((a, b) => b.size - a.size)[0]!;
// WP4's seed has a healthy Thrust Controller (VESPER's 31% arrives in WP10). INSPECT only offers
// the swap for a damaged ship file, so these tests give it the old seed's 22%.
const primary = (): ShipSegment => {
  const thrust = h.seg('Thrust Controller') as ShipSegment;
  thrust.integrity = 22;
  thrust.state = 'corrupt';
  return thrust;
};
const swapOption = (seg: Segment) => computeActions(seg, h.store.getState()).primary.find((option) => (option.id as string) === 'swap');

function fresh(): void {
  h.resetTo('flight');
  h.step();
  asked = null;
}

function scanned(seg: Segment): Segment {
  if ('scanned' in seg) seg.scanned = true;
  return seg;
}

// --- SWAP refuses while either file is mid-op (the move of the backup used to undo it) ---------------
// WP10: SWAP is a tool file now (licensed at VESPER's first uncommanded burst; installed here), a 2 s op holding a
// thread; INSPECT's swap button is gone (it says where the job can go instead). The rules checked here are the same.
const swapAll = (): void => { while (getOps().length > 0) h.step(); };
{
  fresh();
  installTool(h.store, 'swap');
  const thrust = scanned(primary()) as ShipSegment;
  actionScan(h.store, thrust);
  check('swap while the primary is being scanned: refused BUSY, nothing changes',
    actionSwap(h.store, thrust) === TOOL_REFUSAL.busy && thrust.name === 'Thrust Controller' && thrust.backup === 'thrust_b');
  // Final fix pass (naming rule): ComputedActions.demoHtml is notesHtml now; the notes themselves are unchanged.
  check('…and INSPECT has no swap button (WP10: SWAP is a tool), only its note about the backup',
    swapOption(thrust) === undefined && computeActions(thrust, h.store.getState()).notesHtml.includes('Backup: Thrust.alt'));
  h.runOps();

  const backup = h.seg('Thrust.alt');
  check('move of the backup started', actionMove(h.store, backup, { regionSegIds: [bigFree().id], col: 4 }) === null);
  check('swap while the backup moves: refused BUSY', actionSwap(h.store, thrust) === TOOL_REFUSAL.busy);
  check('…INSPECT has no swap button', swapOption(thrust) === undefined);
  h.runOps();
  check('after the move: the primary still owns a live backup',
    thrust.backup === 'thrust_b' && memory().some((seg) => seg.id === 'thrust_b'));
  const started = actionSwap(h.store, thrust);
  swapAll();
  check('the swap then works (a 2 s op): the primary goes .old, the backup takes over',
    started === null && thrust.name === 'Thrust.old' && thrust.state === 'inactive'
    && h.seg('Thrust Controller').type === 'ship-backup' && h.seg('Thrust Controller').role === 'thrust-ctrl');
}

// --- A deleted backup unlinks its primary; a dangling link is refused loudly -----------------------------
{
  fresh();
  installTool(h.store, 'swap');
  const thrust = scanned(primary()) as ShipSegment;
  actionScan(h.store, thrust);
  h.runOps();
  actionDelete(h.store, h.seg('Thrust.alt'));
  h.runOps();
  check('deleting the backup clears the primary\'s link', thrust.backup === undefined);
  const options = computeActions(thrust, h.store.getState()).primary.map((option) => option.id);
  check('…INSPECT offers no swap (nor its backup note)', !(options as string[]).includes('swap')
    && !computeActions(thrust, h.store.getState()).notesHtml.includes('Backup:'), options.join());  // notesHtml: see above
  thrust.backup = 'thrust_b';  // a link to a file that is not in memory (should never happen now)
  h.refusals.length = 0;
  check('a swap with no backup in memory is refused NO BACKUP and announced',
    actionSwap(h.store, thrust) === TOOL_REFUSAL.noBackup && h.refusals.at(-1) === TOOL_REFUSAL.noBackup);
  check('…and INSPECT still has no swap button', swapOption(thrust) === undefined);
}

// --- A copy of a ship file does not share its backup --------------------------------------------------
{
  fresh();
  const thrust = primary();
  actionCopy(h.store, thrust, { regionSegIds: [bigFree().id], col: 0 });
  h.runOps();
  const copy = memory().find((seg) => seg.name === 'Thrust Controller.cp');
  check('the copy of Thrust Controller has no backup link', copy !== undefined && copy.type === 'ship' && copy.backup === undefined);
}

// --- The "last copy" question counts working copies -------------------------------------------------------
{
  fresh();
  const repair = h.seg('Repair');
  const bak = h.seg('Repair.bak');
  if (repair.type === 'fs-tool') repair.integrity = 30;
  const question = deleteQuestion(h.store.getState(), bak);
  check('Repair at 30% (unusable): deleting the healthy Repair.bak asks, naming the chip',
    question?.question === 'DELETE REPAIR.BAK?' && question.detail.includes('REPAIR chip'), JSON.stringify(question));
  check('deleting the broken Repair (Repair.bak works) asks nothing', deleteQuestion(h.store.getState(), repair) === null);
}

// --- No question whose yes would be refused (every thread busy) --------------------------------------------
{
  fresh();
  const tools = memory().filter((seg) => seg.type === 'tool');
  actionScan(h.store, tools[0]!);
  actionScan(h.store, tools[1]!);
  h.refusals.length = 0;
  const refusal = requestDelete(h.store, h.charge(), deps);
  check('every thread busy: DELETE REPAIR CHARGE is refused at once, nothing asked',
    refusal === TOOL_REFUSAL.threads && asked === null && h.refusals.at(-1) === TOOL_REFUSAL.threads, String(refusal));
  pickUpTool(h.store, 'delete');
  applyTool(h.store, h.seg('Cargo Ctrl'), deps);
  check('…the same through the held DELETE on a ship file', asked === null && h.refusals.at(-1) === TOOL_REFUSAL.threads);
  h.runOps();
  applyTool(h.store, h.seg('Cargo Ctrl'), deps);
  check('with a thread free the question is asked', (asked as ConfirmRequest | null)?.text.question === 'DELETE CARGO CTRL?');
}

// --- A refused placement keeps the picked source ------------------------------------------------------------
{
  fresh();
  const tools = memory().filter((seg) => seg.type === 'tool');
  const comms = h.seg('AI Comms');
  pickUpTool(h.store, 'move');
  applyTool(h.store, comms, deps);
  actionScan(h.store, tools[0]!);
  actionScan(h.store, tools[1]!);
  h.store.update((d) => { d.ui.pendingPlacement = { regionSegIds: [bigFree().id], col: 3 }; });
  h.refusals.length = 0;
  applyTool(h.store, bigFree(), deps);
  check('placement with every thread busy: refused, the source stays picked',
    h.refusals.at(-1) === TOOL_REFUSAL.threads && h.store.getState().ui.pickedSourceId === comms.id);
  h.runOps();
  h.store.update((d) => { d.ui.pendingPlacement = { regionSegIds: [bigFree().id], col: 3 }; });
  applyTool(h.store, bigFree(), deps);
  check('…a thread free: the next click places it, and the stage resets', getOps().some((op) => op.kind === 'move')
    && h.store.getState().ui.pickedSourceId === null, String(h.store.getState().ui.pickedSourceId));
  check('INSPECT follows the moved file while MOVE stays in hand', getLastAppliedTargetId() === comms.id);
  h.runOps();
}

// --- The thread total announces its changes; readouts never say 2/1 ------------------------------------------
{
  fresh();
  const core = memory().find((seg) => seg.type === 'core')!;
  if (core.type !== 'core') throw new Error('no core');
  core.integrity = 40;
  core.scanned = true;
  h.step();
  check('Core at 40: one thread', threadsTotal() === 1);
  let threadEvents = 0;
  const off = onOpsChange((change) => { if (change.type === 'threads') threadEvents++; });
  actionRepair(h.store, core);
  while (core.integrity < 50 && getOps().length > 0) h.step();
  h.step();
  check('a repair heals the Core past 50: the total is 2 and a threads change was announced',
    threadsTotal() === 2 && threadEvents >= 1, `events ${threadEvents}, total ${threadsTotal()}`);
  off();
  h.runOps();

  check('busy 2 on 1 thread: the readout shows 2/2, both dots lit, none dashed',
    threadRowHtml(2, 1, 2) === '<span class="thread-dot lit"></span><span class="thread-dot lit"></span><span class="thread-count">2/2</span>',
    threadRowHtml(2, 1, 2));
  check('busy 0 on 1 thread: 0/1 with one dashed dot',
    threadRowHtml(2, 1, 0) === '<span class="thread-dot"></span><span class="thread-dot out"></span><span class="thread-count">0/1</span>');
  check('the footer\'s total follows the same rule', shownThreadsTotal(1, 2) === 2 && shownThreadsTotal(2, 1) === 2);
}

// --- INSPECT's buttons disable with the click's own reason ----------------------------------------------------
{
  fresh();
  const engine = scanned(h.seg('Engine I/O'));
  const tools = memory().filter((seg) => seg.type === 'tool' && seg !== engine);
  actionScan(h.store, tools[0]!);
  actionScan(h.store, tools[1]!);
  const busyOptions = computeActions(engine, h.store.getState()).primary.filter((option) => option.id === 'repair' || option.id === 'scan');
  check('every thread busy: INSPECT\'s repair and re-scan read ALL THREADS BUSY, disabled',
    busyOptions.length === 2 && busyOptions.every((option) => option.disabled && option.cost === TOOL_REFUSAL.threads), JSON.stringify(busyOptions));
  h.runOps();
  setPaused(h.store, true);
  const paused = computeActions(engine, h.store.getState()).primary.find((option) => option.id === 'repair');
  check('paused: INSPECT\'s repair reads PAUSED, disabled', paused?.disabled === true && paused.cost === TOOL_REFUSAL.paused);
  setPaused(h.store, false);
  for (const seg of memory()) if (seg.type === 'fs-tool' && seg.fsTool === 'scan') seg.integrity = 10;
  const noTool = computeActions(engine, h.store.getState()).primary.find((option) => option.id === 'scan');
  check('no working SCAN: INSPECT says THAT TOOL IS DAMAGED (the refusal\'s words)', noTool?.cost === TOOL_REFUSAL.noTool);
}

// --- The held tool's hint, and the file INSPECT follows -----------------------------------------------------------
{
  fresh();
  const state = () => h.store.getState();
  // WP4: AI files are always visible, so REPAIR never has to say "scan a file first" any more.
  check('REPAIR: "select damaged file" (WP4: no scan step)', heldToolHint(state(), 'repair', null) === TOOL_HINTS.repair.stage1);
  check('SCAN: "select a file to check"', heldToolHint(state(), 'scan', null) === 'select a file to check');
  const engine = h.seg('Engine I/O');
  pickUpTool(h.store, 'scan');
  check('before the first use, INSPECT has no worked-on file (it shows the tool)', getLastAppliedTargetId() === null);
  applyTool(h.store, engine, deps);
  check('after a scan click, INSPECT follows Engine I/O while SCAN stays in hand', getLastAppliedTargetId() === engine.id);
  h.refusals.length = 0;
  applyTool(h.store, h.seg('Cargo Ctrl'), deps);
  applyTool(h.store, engine, deps);  // busy: refused
  check('a refused click does not move INSPECT off the file being worked on',
    h.refusals.at(-1) === TOOL_REFUSAL.busy && getLastAppliedTargetId() === h.seg('Cargo Ctrl').id);
  h.runOps();
  check('REPAIR once Engine I/O is known damaged: "select damaged file"', heldToolHint(state(), 'repair', null) === TOOL_HINTS.repair.stage1);
  for (const seg of memory()) if (seg.type === 'fs-tool' && seg.fsTool === 'repair') seg.version = 2;
  check('Repair v2: the hint names REPAIR CHARGE too', heldToolHint(state(), 'repair', null) === TOOL_HINTS.repair.stage1V2);
}

// --- Op labels are the tool's word (the bar sits on the file) ----------------------------------------------------
{
  fresh();
  const engine = scanned(h.seg('Engine I/O'));
  actionRepair(h.store, engine);
  actionScan(h.store, h.seg('Cargo Ctrl'));
  const labels = getOps().map((op) => op.label);
  check('op bar labels: REPAIR, SCAN', labels.join() === 'REPAIR,SCAN', labels.join());
  h.runOps();
  check('threads back to idle', threadsBusy() === 0);
}

finish();
