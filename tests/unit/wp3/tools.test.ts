// WP3 spec items 3, 4, 7 and 8 headless: the op rules of §6.5 (durations, refusals with their
// words), the inline-confirm questions and the delete flow through applyTool, the detail panel's
// buttons asking the same rules, and every tool line fitting the strip and the §3.5 glossary.
import { check, finish } from '../wp1/harness';
import { createHarness3 } from './harness3';
import {
  actionScan, actionRepair, actionMove, actionCopy, actionDelete, scanSec, moveSec, copySec,
} from '@state/actions';
import { pickUpTool, applyTool, requestDelete, type ToolDeps, type ConfirmRequest } from '@systems/fs-tools';
import { targetRefusal, deleteQuestion, isOpenFree } from '@systems/tool-targets';
import { getOps } from '@systems/ops-core';
import { computeActions } from '@components/memory-view/DetailPanel';
import { TOOL_REFUSAL, CONFIRM_TEXT, OP_LINES, DELETE_EFFECT } from '@data/tool-text';
import { TOOL_HINTS } from '@data/fs-tools';
import { DELETE_SEC, MAX_LINE_CHARS, SEG_NAME_MAX_CHARS, COMPACT_SEC } from '@data/tuning';
import type { Segment } from '@/types/segment';

const h = createHarness3(1);
let asked: ConfirmRequest | null = null;
const deps: ToolDeps = { ask: (request) => { asked = request; } };
const memory = (): Segment[] => h.store.getState().memory;
const free = (): Segment => memory().filter(isOpenFree).sort((a, b) => b.size - a.size)[0]!;

function fresh(): void {
  h.resetTo('flight');
  h.step();
  asked = null;
}

function timeOf(start: () => unknown): number {
  start();
  return h.runOps();
}

// --- §6.5 durations (AI seconds) --------------------------------------------------------------------
{
  fresh();
  // WP5: the files have their §4.2 sizes (Sensor Interp 8, AI Comms 4, Telemetry 6 blocks); the
  // formulas are checked at the old sizes, the timings at the files' own.
  const sensor = h.seg('Sensor Interp');
  check(`scan: 1.0 + 0.1/block (${sensor.size} blocks)`, Math.abs(timeOf(() => actionScan(h.store, sensor)) - scanSec(sensor.size)) <= 0.051 && scanSec(10) === 2);
  const comms = h.seg('AI Comms');
  check(`move: 1.5 + 0.2/block (${comms.size} blocks)`, Math.abs(timeOf(() => actionMove(h.store, comms, { regionSegIds: [free().id], col: 0 })) - moveSec(comms.size)) <= 0.051 && moveSec(5) === 2.5);
  const telemetry = h.seg('Telemetry');
  check(`copy: 2.0 + 0.3/block (${telemetry.size} blocks)`, Math.abs(timeOf(() => actionCopy(h.store, telemetry, { regionSegIds: [free().id], col: 2 })) - copySec(telemetry.size)) <= 0.051);
  const copy = memory().find((seg) => seg.name === 'Telemetry.cp');
  check('copy: the new file is named .cp, selected, live (not transferring)', copy !== undefined && h.store.getState().ui.selectedId === copy.id
    && (!('state' in copy) || copy.state !== 'transferring'));
  // WP4 removed the Mission file; Cargo Ctrl (no flight effect) is the file that can go.
  check('delete: 1.0 s', Math.abs(timeOf(() => actionDelete(h.store, h.seg('Cargo Ctrl'))) - DELETE_SEC) <= 0.051);
  check('delete: the file becomes free space', !memory().some((seg) => seg.name === 'Cargo Ctrl'));
  const copyOfCopy = actionCopy(h.store, copy!, { regionSegIds: [free().id], col: 0 });
  h.runOps();
  check('a copy of a copy keeps one .cp (names never outgrow a line)', copyOfCopy === null
    && memory().filter((seg) => seg.name === 'Telemetry.cp').length === 2);
}

// --- §6.5 refusals and their words ---------------------------------------------------------------------
{
  fresh();
  const state = h.store.getState();
  const refusal = (kind: 'scan' | 'repair' | 'delete' | 'move' | 'copy', seg: Segment): string | null =>
    targetRefusal(seg, { state, activeKind: kind, pickedSource: null });
  const charge = h.charge();
  const core = memory().find((seg) => seg.type === 'core')!;
  const ship = h.seg('Cargo Ctrl');
  // Slice 2: ship 1 is calm (no HOLLOW root); its locked file is 046.log, which SCAN reads and every other tool refuses.
  const log = memory().find((seg) => seg.type === 'log')!;
  check('repair on a ship file: SHIP FILES CAN\'T BE HEALED — SWAP OR DELETE IT', refusal('repair', ship) === TOOL_REFUSAL.shipFile);
  // WP4: the AI's own files are always visible (§3.2), so there is no SCAN IT FIRST any more.
  check('repair on an AI file needs no scan (WP4: always visible)', h.seg('Engine I/O').type === 'tool'
    && (h.seg('Engine I/O') as { scanned: boolean }).scanned && refusal('repair', h.seg('Engine I/O')) === null);
  check('repair on REPAIR CHARGE with Repair v1: NEEDS REPAIR v2', refusal('repair', charge) === TOOL_REFUSAL.needsV2);
  check('move REPAIR CHARGE: refused', refusal('move', charge) === TOOL_REFUSAL.moveCharge);
  check('copy REPAIR CHARGE: refused (it would double the repair budget)', refusal('copy', charge) === TOOL_REFUSAL.copyCharge);
  check('delete / move / copy the Core: refused, naming the verb', refusal('delete', core) === TOOL_REFUSAL.coreDelete && refusal('move', core) === TOOL_REFUSAL.coreMove && refusal('copy', core) === TOOL_REFUSAL.coreCopy);
  check('046.log: SCAN reads it; REPAIR, DELETE, MOVE and COPY refuse it (IT ISN\'T YOURS …)', refusal('scan', log) === null
    && refusal('repair', log) === TOOL_REFUSAL.logRepair && refusal('delete', log) === TOOL_REFUSAL.logDelete
    && refusal('move', log) === TOOL_REFUSAL.logMove && refusal('copy', log) === TOOL_REFUSAL.logCopy);
  check('free space is not a file to any tool', refusal('scan', free()) === TOOL_REFUSAL.notAFile && refusal('delete', free()) === TOOL_REFUSAL.notAFile);
  const engine = h.seg('Engine I/O');
  if (engine.type === 'tool') engine.scanned = true;
  check('repair on a scanned, damaged AI file: allowed', refusal('repair', engine) === null);
  h.refusals.length = 0;
  pickUpTool(h.store, 'repair');
  applyTool(h.store, ship, deps);
  check('a refused tool click is announced with its words (the cursor follower shows them)', h.refusals.at(-1) === TOOL_REFUSAL.shipFile && getOps().length === 0);
}

// --- Move: the "will deactivate it" question is gone; the source is offline while it moves -----------
{
  fresh();
  const comms = h.seg('AI Comms');
  pickUpTool(h.store, 'move');
  applyTool(h.store, comms, deps);
  h.store.update((d) => { d.ui.pendingPlacement = { regionSegIds: [free().id], col: 3 }; });
  applyTool(h.store, free(), deps);
  const ops = getOps();
  const clone = memory().find((seg) => seg.id === ops[0]?.segId);
  check('move: no question asked; source and clone are both transferring', asked === null && ops.length === 1
    && 'state' in comms && comms.state === 'transferring' && clone !== undefined && 'state' in clone && clone.state === 'transferring');
  h.runOps();
  check('move: the moved file keeps its id and is selected', memory().filter((seg) => seg.id === comms.id).length === 1
    && h.store.getState().ui.selectedId === comms.id);
  check('move: the tool stays in hand for the next one', h.store.getState().ui.activeTool?.kind === 'move' && h.store.getState().ui.pickedSourceId === null);
}

// --- Inline confirm: which deletes ask, and the flow through applyTool -------------------------------------
{
  fresh();
  const state = h.store.getState();
  const charge = h.charge();
  const chargeQ = deleteQuestion(state, charge);
  check('delete REPAIR CHARGE asks: DELETE REPAIR CHARGE?', chargeQ?.question === 'DELETE REPAIR CHARGE?' && chargeQ.detail.includes('36 charge'), JSON.stringify(chargeQ));
  const cargoQ = deleteQuestion(state, h.seg('Cargo Ctrl'));
  check('delete a ship file asks, with the gap it leaves', cargoQ?.question === 'DELETE CARGO CTRL?' && cargoQ.detail.includes('6-block gap'), JSON.stringify(cargoQ));
  check('delete the last copy of a tool asks', deleteQuestion(state, h.seg('Rm'))?.question === 'DELETE RM?');
  check('delete Repair (Repair.bak exists) does not ask', deleteQuestion(state, h.seg('Repair')) === null);
  // WP4: a delete that kills a flight capability asks too (the last copy of a role); a tool with
  // a second copy (Repair, with Repair.bak) still does not.
  check('delete the last Engine I/O asks, naming the effect (WP4)', deleteQuestion(state, h.seg('Engine I/O'))?.detail.startsWith('The engine stops.') === true);
  check('delete a ship file names its flight effect (WP4)', cargoQ?.detail.startsWith('No flight effect.') === true);

  pickUpTool(h.store, 'delete');
  applyTool(h.store, charge, deps);
  check('applyTool on REPAIR CHARGE opens the question, starts nothing yet', asked !== null && getOps().length === 0);
  const question: ConfirmRequest = asked!;
  asked = null;
  check('…answering no (doing nothing) keeps the charge and the tool', memory().includes(charge) && h.store.getState().ui.activeTool?.kind === 'delete');
  question.onYes();
  check('…answering yes starts a 1 s delete', getOps().length === 1 && getOps()[0]!.kind === 'delete');
  h.runOps();
  check('…and REPAIR CHARGE is gone, its blocks free', !memory().some((seg) => seg.type === 'redundancy'));

  // The last copy of the held tool: deleting it empties the hand.
  fresh();
  pickUpTool(h.store, 'delete');
  const rm = h.seg('Rm');
  applyTool(h.store, rm, deps);
  asked!.onYes();
  h.runOps();
  await Promise.resolve();  // the hand syncs in a microtask after the memory change
  check('deleting the last copy of the held tool drops it from the hand', h.store.getState().ui.activeTool === null);

  // A question answered after the file is already gone does nothing (re-checked at yes).
  fresh();
  const cargo = h.seg('Cargo Ctrl');
  requestDelete(h.store, cargo, deps);
  const pending = asked!;
  actionDelete(h.store, cargo);
  h.runOps();
  h.refusals.length = 0;
  pending.onYes();
  check('a yes after the file is gone is refused, not run twice', getOps().length === 0 && h.refusals.length === 1, h.refusals.join());
}

// --- Repair v2 squeezes REPAIR CHARGE's spent blocks -------------------------------------------------------
{
  fresh();
  for (const seg of memory()) if (seg.type === 'fs-tool' && seg.fsTool === 'repair') seg.version = 2;
  const charge = h.charge();
  charge.used = 20;
  const wall = timeOf(() => actionRepair(h.store, charge));
  check('Repair v2 on REPAIR CHARGE squeezes it to its 20 points in 2.4 s', charge.size === 20 && Math.abs(wall - COMPACT_SEC) <= 0.051, `size ${charge.size}, ${wall.toFixed(2)} s`);
  const engine = h.seg('Engine I/O');
  if (engine.type === 'tool') engine.scanned = true;
  actionRepair(h.store, engine);
  const state = h.store.getState();
  check('REPAIR CHARGE can\'t be squeezed or deleted while a repair spends it',
    targetRefusal(charge, { state, activeKind: 'repair', pickedSource: null }) === TOOL_REFUSAL.chargeBusy
    && targetRefusal(charge, { state, activeKind: 'delete', pickedSource: null }) === TOOL_REFUSAL.chargeBusy);
  h.runOps();
}

// --- The detail panel asks the same rules --------------------------------------------------------------
{
  fresh();
  const state = h.store.getState();
  const engine = h.seg('Engine I/O');
  // WP4: only ship files start unscanned (AI files are always visible).
  const unscanned = computeActions(h.seg('Cargo Ctrl'), state);
  check('panel: an unscanned file offers only SCAN', unscanned.primary.length === 1 && unscanned.primary[0]!.id === 'scan' && !unscanned.primary[0]!.disabled);
  if (engine.type === 'tool') engine.scanned = true;
  const scanned = computeActions(engine, state).primary.find((option) => option.id === 'repair');
  check('panel: a damaged AI file offers REPAIR with its charge estimate (~10)', scanned !== undefined && !scanned.disabled && scanned.cost === '~10 charge', JSON.stringify(scanned));
  const chargeButton = computeActions(h.charge(), state).primary.find((option) => option.id === 'delete_charge');
  check('panel: REPAIR CHARGE offers a delete (through the confirm)', chargeButton !== undefined && !chargeButton.disabled);
  actionRepair(h.store, engine);
  const busy = computeActions(engine, h.store.getState()).primary.find((option) => option.id === 'repair');
  check('panel: a second repair on a file being repaired is disabled with BUSY', busy?.disabled === true && busy.cost === TOOL_REFUSAL.busy, JSON.stringify(busy));
  h.runOps();
}

// --- Every tool line fits the strip and the §3.5 glossary -----------------------------------------------
{
  const worstName = 'W'.repeat(SEG_NAME_MAX_CHARS) + '.cp';
  const longestEffect = Object.values(DELETE_EFFECT).reduce((longest, effect) => (effect.length > longest.length ? effect : longest), '');
  const lines: string[] = [
    ...Object.values(TOOL_REFUSAL),
    CONFIRM_TEXT.deleteCharge(999, 999).question, CONFIRM_TEXT.deleteCharge(999, 999).detail,
    // WP4: the ship-file question names its flight effect (the longest one), and DELETE is now the
    // longest chip name (Deactivate is gone).
    CONFIRM_TEXT.deleteFile(worstName, longestEffect, 999).question, CONFIRM_TEXT.deleteFile(worstName, longestEffect, 999).detail,
    CONFIRM_TEXT.deleteLastTool(worstName, 'delete').question, CONFIRM_TEXT.deleteLastTool(worstName, 'delete').detail,
    ...Object.values(TOOL_HINTS).flatMap((hint) => Object.values(hint)),
    CONFIRM_TEXT.yes, CONFIRM_TEXT.no,
    OP_LINES.noCharge(worstName),
  ];
  const tooLong = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check('every tool line fits one row (≤ 70 chars, worst-case names)', tooLong.length === 0, tooLong.join(' | '));
  const NEVER_SAY = [/redundancy/i, /\bRDN\b/, /\bcores\b/i, /memory mode/i, /tools mode/i];
  const said = lines.filter((line) => NEVER_SAY.some((pattern) => pattern.test(line)));
  check('no tool line uses a "never say" word', said.length === 0, said.join(' | '));
  check('every seed segment name fits SEG_NAME_MAX_CHARS', memory().every((seg) => seg.name.length <= SEG_NAME_MAX_CHARS));
}

finish();
