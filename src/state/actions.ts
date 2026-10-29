import type { Store } from './store';
import type { GameState, PendingPlacement } from './schema';
import type { Segment, RedundancySegment, SegmentState, DriverSegment } from '@/types/segment';
import type { DriverLoss } from '@/types/landing';
import type { FsToolKind } from '@/types/fs-tool';
import {
  getRedundancy, getFsTool, effectiveToolVersion, integrityState, isRepairable, hasIntegrity, shownIntegrity,
  type HealthSegment,
} from './selectors';
import { startOp, cancelOp, canStartOp, type Op, type OpKind, type OpOwner, type OpSpec } from '@systems/ops-core';
import {
  replaceRange, mergeAdjacentFree, releaseReservations, requireAddr, freeSegment, newSegId,
  assertMemoryInvariants,
} from '@systems/memory-ops';
import { targetRefusal, isOpenFree, chargeInUse, swapPair, type SwapPair } from '@systems/tool-targets';
import { emit, NO_PAYLOAD } from '@systems/events';
import { say } from '@systems/say';
import { TOOL_ICONS, repairRatePerSec } from '@data/fs-tools';
import { MEMORY_TOTAL_BLOCKS, rootRemains } from '@data/memory';
import {
  TOOL_REFUSAL, OP_LINES, OP_ECHO, SWAP_DESC, echoName, echoWord, scanFinding, type ToolRefusal, type OpEnding,
} from '@data/tool-text';
import { IS_DEV } from '@/env';
import {
  SCAN_BASE_SEC, SCAN_PER_BLOCK_SEC, MOVE_BASE_SEC, MOVE_PER_BLOCK_SEC, COPY_BASE_SEC,
  COPY_PER_BLOCK_SEC, DELETE_SEC, COMPACT_SEC, REPAIR_CHARGE_PER_POINT_PER_BLOCK, INTEGRITY_MAX,
  OP_COMPLETE_PCT, FLOAT_SLACK, DELETE_HOLLOW_BASE_SEC, DELETE_HOLLOW_PER_BLOCK_SEC, HOLLOW_RECOIL_SEC, SWAP_SEC,
  SEG_NAME_MAX_CHARS, ROOT_DELETE_SEC, BAY_SLOTS, LANDING_TACTICAL_WARP, LANDING_CRUISE_WARP,
} from '@data/tuning';

// A ship file's backup copy is called `<name>.alt` (Thrust.alt); a swapped-out primary `<name>.old` (§6.5).
const BACKUP_SUFFIX = '.alt';
const OLD_SUFFIX = '.old';

// The player's filesystem actions (§6.5), on the DOM-free ops core. Each one re-checks
// everything itself (pause, a usable tool, the target rules of systems/tool-targets.ts, a free
// thread) and returns null when it started, or the refusal it announced ('refused' with
// tool: true; the cursor follower shows it and the buzz plays). So the strip's tool clicks, the
// detail panel's buttons and the headless tests all obey exactly the same rules.
//
// The op discipline:
// • a refused action changes nothing;
// • a started op flags its segments `operating` and bumps memoryRev once; every exit (complete,
//   cancel, abort) clears the flags and bumps it once more;
// • structural changes go through memory-ops by ADDRESS, then assertMemoryInvariants (dev and
//   tests). A move/copy reserves the free space around its clone, so a cancel puts the exact
//   original segments back into the exact blocks they came from.

const PLAYER: OpOwner = 'player';

function refuse(reason: ToolRefusal): ToolRefusal {
  emit('refused', { reason, tool: true });
  return reason;
}

// Why an action can't run on `seg` right now, or null when it can; it announces nothing. Pause is
// look-only (§6.1), the tool needs a usable copy, the target must still be in memory (an inline
// confirm can outlive it) and pass the target rules, and a Core thread must be free (on the target of a verb counting
// down, the refusal says how to free one: WP11). Exported so
// the inline confirm asks only a question whose yes could work, and the detail panel's buttons
// disable with the same reason a click would give.
export function actionRefusal(
  state: Readonly<GameState>, kind: FsToolKind, seg: Segment, picked: Segment | null = null,
): ToolRefusal | null {
  if (state.clock.paused) return TOOL_REFUSAL.paused;
  if (!getFsTool(state, kind)) return TOOL_REFUSAL.noTool;
  if (!state.memory.includes(seg)) return TOOL_REFUSAL.notAFile;
  const target = targetRefusal(seg, { state, activeKind: kind, pickedSource: picked });
  if (target) return target;
  if (!canStartOp()) return state.hollow.verb?.targetId === seg.id ? TOOL_REFUSAL.threadsVerb : TOOL_REFUSAL.threads;
  return null;
}

function checkMemory(memory: readonly Segment[]): void {
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
}

function bumpMemory(store: Store<GameState>): void {
  store.update((draft) => { draft.ui.memoryRev++; });
}

// The TERMINAL's echo of an op that ended (§9 WP6 item 11): the kid's own command, said at once.
function echo(text: string): void {
  say('cmd', text, { critical: true });
}

// How an op that did not complete ended, for its echo: HOLLOW ate a file it worked on (the file left
// memory at 0: systems/hollow.ts turned it into a hollow block, then aborted the op), or it was
// stopped (the kid's ×, a print).
function endingOf(store: Store<GameState>, ...segs: Segment[]): OpEnding {
  const memory = store.getState().memory;
  return segs.some((seg) => !memory.includes(seg) && hasIntegrity(seg) && seg.integrity <= 0) ? 'eaten' : 'stopped';
}

function setOperating(seg: Segment, on: boolean): void {
  if (on) seg.operating = true;
  else delete seg.operating;
}

function stateOf(seg: Segment): SegmentState | undefined {
  return 'state' in seg ? seg.state : undefined;
}

// Sets (or clears, with undefined) a segment's state. Only the types that carry one are touched:
// REPAIR CHARGE, free space, HOLLOW and a FIREWALL have none.
function setState(seg: Segment, state: SegmentState | undefined): void {
  if (seg.type === 'free' || seg.type === 'redundancy' || seg.type === 'hollow' || seg.type === 'firewall') return;
  if (state === undefined) delete seg.state;
  else seg.state = state;
}

// The health labels a scan or a repair re-derives; anything else (inactive, locked …) is a state
// the player set and is kept.
function isHealthLabel(state: SegmentState | undefined): boolean {
  return state === undefined || state === 'intact' || state === 'partial' || state === 'corrupt';
}

// Writes a file's integrity from outside an op (a scripted fault, a debug poke), clamped to
// 0..INTEGRITY_MAX, and re-derives its health word the way a scan or a repair does: a state the
// file is in for an op or by choice (repairing, inactive …) is kept. Mutates `seg` in place; the
// caller bumps memoryRev inside its own update.
export function setIntegrity(seg: HealthSegment, integrity: number): void {
  seg.integrity = Math.max(0, Math.min(INTEGRITY_MAX, integrity));
  if (isHealthLabel(seg.state)) seg.state = integrityState(seg.integrity);
}

// A driver left memory (launched with its pod, eaten for good by HOLLOW, or taken to 0 by a hazard zone): nothing the
// kid pointed at it stays pointed at a file that is gone: LOAD NEXT, the selection (HOLLOW's eaten block takes it over,
// `selectInstead`), and a MOVE picked up from it (a stale pickedSourceId keeps the hand at MOVE's second step). One
// helper for every way out, so they cannot drift apart again. In a draft (inside store.update).
export function forgetDriver(draft: GameState, driver: Readonly<DriverSegment>, selectInstead: string | null = null): void {
  if (draft.landing.loadNext === driver.pod) draft.landing.loadNext = null;
  if (draft.ui.selectedId === driver.id) draft.ui.selectedId = selectInstead;
  if (draft.ui.pickedSourceId === driver.id) draft.ui.pickedSourceId = null;
}

// A driver is gone without its pod (01-landing §3.8: HOLLOW ate it, or a hazard zone took it to 0). The pod outlives
// it: it stays aboard, CAN'T LAUNCH, and is parked in orbit with this reason when the landing ends (§3.10); `eaten` is
// what MERGE may give back (risk 9, slice 7). In a draft.
export function recordDriverLost(draft: GameState, driver: Readonly<DriverSegment>, why: DriverLoss, selectInstead: string | null = null): void {
  const record = draft.landing.pods.find((candidate) => candidate.pod === driver.pod);
  if (!record) throw new Error(`recordDriverLost: no pod ${driver.pod} on this ship`);
  if (record.fate.kind !== 'aboard') throw new Error(`recordDriverLost: pod ${driver.pod} is ${record.fate.kind}, not aboard`);
  record.driverLost = why;
  forgetDriver(draft, driver, selectInstead);
}

// The landing begins (01-landing §3.2, §3.4), in the same update that sets phase 'landing' (orbit-sim endFlight): the
// world switches to LANDING's own warps on every ship, so the window table holds on every planet (risk 14: the only
// writer of level.tacticalWarp / cruiseWarp after createFlight), and the bay starts full. In a draft.
export function beginLanding(draft: GameState): void {
  draft.level.tacticalWarp = LANDING_TACTICAL_WARP;
  draft.level.cruiseWarp = LANDING_CRUISE_WARP;
  draft.landing.bay = { loaded: BAY_SLOTS, reloadTac: 0, cadenceLeftTac: 0 };
  draft.landing.startedAtTSec = draft.clock.tSec;
}

// The tug-of-war is won (§6.6): a REPAIR healed an infected file back to 100. The infection clears
// and the file RECOILS for HOLLOW_RECOIL_SEC (HOLLOW's bites skip it), time to move it behind a
// wall. Mutates `seg`; the caller bumps memoryRev and emits 'hollow-cure'.
export function cureInfection(seg: HealthSegment, aiNow: number): void {
  delete seg.infected;
  seg.recoilUntilAi = aiNow + HOLLOW_RECOIL_SEC;
}

// A step that finishes after `durationSec` AI seconds.
function timedStep(durationSec: number): (dtAi: number) => number {
  let elapsed = 0;
  return (dtAi) => {
    elapsed += dtAi;
    if (elapsed >= durationSec - FLOAT_SLACK) return OP_COMPLETE_PCT;
    return (elapsed / durationSec) * OP_COMPLETE_PCT;
  };
}

export function scanSec(size: number): number { return SCAN_BASE_SEC + SCAN_PER_BLOCK_SEC * size; }
// A file deletes in DELETE_SEC; a block HOLLOW ate takes longer the bigger it is (§6.5); LAST LIGHT's root, open for the
// duel (WP11), takes ROOT_DELETE_SEC whatever its size: the finale's one long op, fought over while it runs.
export function deleteSec(seg: Segment): number {
  if (seg.type !== 'hollow') return DELETE_SEC;
  return seg.root ? ROOT_DELETE_SEC : DELETE_HOLLOW_BASE_SEC + DELETE_HOLLOW_PER_BLOCK_SEC * seg.size;
}
export function moveSec(size: number): number { return MOVE_BASE_SEC + MOVE_PER_BLOCK_SEC * size; }
export function copySec(size: number): number { return COPY_BASE_SEC + COPY_PER_BLOCK_SEC * size; }

// Integrity points per AI second (§6.5), from data/fs-tools.ts (the ship validator reads it too).
export { repairRatePerSec };

export function chargePerPoint(size: number): number {
  return size * REPAIR_CHARGE_PER_POINT_PER_BLOCK;
}

// What healing a file to 100% costs right now, in whole REPAIR CHARGE points (the detail panel's
// estimate; a bite during the repair makes the real bill higher).
export function repairChargeEstimate(integrity: number, size: number): number {
  return Math.ceil((INTEGRITY_MAX - integrity) * chargePerPoint(size) - FLOAT_SLACK);
}

// Every op the kid starts with one of their tools: from then on HOLLOW no longer spares that tool on this ship
// (HollowState.untriedTools: a tool licensed here is left alone until it has been used once).
function startToolOp(store: Store<GameState>, toolKind: FsToolKind, spec: OpSpec): Op {
  const operation = startOp(spec);
  if (store.getState().hollow.untriedTools.includes(toolKind)) {
    store.update((draft) => { draft.hollow.untriedTools = draft.hollow.untriedTools.filter((kind) => kind !== toolKind); });
  }
  return operation;
}

// A one-target op whose effect lands at the end (scan, delete, a v2 squeeze). Op labels
// are the tool's word alone: the bar sits on the file, so a name would only repeat it (and it was
// the part a small file's bar cut off).
// Its echo: `doneEcho` once it completes (read after `apply`, so it can say what the op found or
// freed), else `> scan stasis ... STOPPED` / `... EATEN`.
function runQuickOp(
  store: Store<GameState>, seg: Segment, kind: OpKind, toolKind: FsToolKind, durationSec: number, apply: () => void,
  doneEcho: () => string,
): void {
  const name = echoName(seg);
  const release = (): void => { setOperating(seg, false); bumpMemory(store); };
  startToolOp(store, toolKind, {
    kind,
    segId: seg.id,
    targetIds: [seg.id],
    owner: PLAYER,
    label: toolKind.toUpperCase(),
    icon: TOOL_ICONS[toolKind],
    step: timedStep(durationSec),
    onComplete: () => {
      setOperating(seg, false);
      apply();
      bumpMemory(store);
      echo(doneEcho());
      emit('op-done', { kind, result: 'done' });
    },
    onCancel: () => {
      release();
      echo(OP_ECHO.ended(toolKind, name, 'stopped'));
    },
    onAbort: () => {
      const ending = endingOf(store, seg);
      release();
      echo(OP_ECHO.ended(toolKind, name, ending));
    },
  });
  setOperating(seg, true);
  bumpMemory(store);
}

// --- Scan ------------------------------------------------------------------------------------

// Reveals a file's integrity (§3.2: ship-file damage stays hidden until scanned). A re-scan
// refreshes the readout; player-set states (inactive, locked …) are kept.
export function actionScan(store: Store<GameState>, seg: Segment): ToolRefusal | null {
  const refusal = actionRefusal(store.getState(), 'scan', seg);
  if (refusal) return refuse(refusal);
  runQuickOp(store, seg, 'scan', 'scan', scanSec(seg.size), () => {
    if (!('scanned' in seg)) return;
    seg.scanned = true;
    if (isHealthLabel(seg.state)) seg.state = integrityState(seg.integrity);
    // What a scan finds can matter beyond the file (STASIS: where the colonists are, §1).
    emit('scanned', { segId: seg.id, role: seg.role ?? null });
  }, () => OP_ECHO.scan(echoName(seg), scanFinding(seg.role, hasIntegrity(seg) ? shownIntegrity(seg.integrity) : null)));
  return null;
}

// --- Repair ----------------------------------------------------------------------------------

// REPAIR CHARGE with no points left leaves memory: its blocks become free space. Waits while any
// repair or squeeze is still running on it.
function retireEmptyCharge(store: Store<GameState>): void {
  const memory = store.getState().memory;
  const charge = getRedundancy(store.getState());
  if (!charge || charge.used > 0 || charge.operating) return;
  if (chargeInUse()) return;
  const start = requireAddr(memory, charge);
  replaceRange(memory, start, start + charge.size, [freeSegment(charge.size)], { opId: null, own: [charge] });
  mergeAdjacentFree(memory);
  checkMemory(memory);
}

// Heals continuously (§6.5): integrity climbs at repairRatePerSec while REPAIR CHARGE ticks down
// at chargePerPoint per point. Charge is paid in whole points BEFORE the healing that uses them,
// so the bill is exactly the used cost rounded up, two repairs can never spend the same point,
// and the pool never goes negative. The op ends at 100, or with NO CHARGE when the pool is empty
// and the paid points are used up. The file is `repairing` (offline) meanwhile; the Core stays
// online. Repair v2 on REPAIR CHARGE itself is the squeeze (actionCompact).
export function actionRepair(store: Store<GameState>, seg: Segment): ToolRefusal | null {
  if (seg.type === 'redundancy') return actionCompact(store, seg);
  const state = store.getState();
  const refusal = actionRefusal(state, 'repair', seg);
  if (refusal) return refuse(refusal);
  const charge = getRedundancy(state);
  if (!isRepairable(seg) || !charge) throw new Error(`actionRepair: ${seg.name} passed the target rules without being repairable`);

  const healPerSec = repairRatePerSec(seg.size, effectiveToolVersion(state, 'repair'));
  const costPerPoint = chargePerPoint(seg.size);
  const priorState = seg.state;
  const onCore = seg.type === 'core';
  const name = echoName(seg);
  let owed = 0;          // charge the healing so far has used (fractional)
  let paid = 0;          // whole points this repair took from the pool
  let outOfCharge = false;

  const step = (dtAi: number): number => {
    if (dtAi > 0 && !outOfCharge) {
      let heal = Math.min(healPerSec * dtAi, INTEGRITY_MAX - seg.integrity);
      while (owed + heal * costPerPoint > paid + FLOAT_SLACK && charge.used >= 1) {
        charge.used -= 1;
        paid += 1;
      }
      const affordable = (paid - owed) / costPerPoint;
      if (heal > affordable + FLOAT_SLACK) {
        heal = Math.max(0, affordable);
        outOfCharge = true;
      }
      seg.integrity = Math.min(INTEGRITY_MAX, seg.integrity + heal);
      owed += heal * costPerPoint;
    }
    if (seg.integrity >= INTEGRITY_MAX - FLOAT_SLACK) {
      seg.integrity = INTEGRITY_MAX;
      return OP_COMPLETE_PCT;
    }
    return outOfCharge ? OP_COMPLETE_PCT : seg.integrity;
  };

  const finish = (): void => {
    setOperating(seg, false);
    setState(seg, isHealthLabel(priorState) ? integrityState(seg.integrity) : priorState);
    retireEmptyCharge(store);
    bumpMemory(store);
  };

  startToolOp(store, 'repair', {
    kind: 'repair',
    segId: seg.id,
    targetIds: [seg.id, charge.id],
    owner: PLAYER,
    label: 'REPAIR',
    icon: TOOL_ICONS.repair,
    step,
    onComplete: () => {
      const stopped = seg.integrity < INTEGRITY_MAX;
      // Healed to 100 while HOLLOW was eating it: the tug-of-war is won (systems/hollow.ts reads the
      // cure from the event; the strip repaints with finish's memoryRev bump).
      const cured = !stopped && seg.infected !== undefined;
      if (cured) cureInfection(seg, store.getState().clock.aiSec);
      finish();
      // Out of charge, the NO CHARGE line is this repair's echo.
      if (stopped) say('mind-sys', OP_LINES.noCharge(seg.name), { critical: true });
      else echo(OP_ECHO.repair(name, paid));
      if (cured) emit('hollow-cure', { segId: seg.id });
      emit('op-done', { kind: 'repair', result: stopped ? 'no-charge' : 'done' });
    },
    onCancel: () => {
      finish();
      echo(OP_ECHO.repairEnded(name, paid, 'stopped'));
    },
    onAbort: () => {
      const ending = endingOf(store, seg);
      finish();
      echo(OP_ECHO.repairEnded(name, paid, ending));
    },
  });
  setOperating(seg, true);
  if (!onCore) seg.state = 'repairing';
  bumpMemory(store);
  return null;
}

// Repair v2 on REPAIR CHARGE: squeezes the spent blocks (size − points left) out as free space.
// Empty charge leaves memory entirely.
function actionCompact(store: Store<GameState>, charge: RedundancySegment): ToolRefusal | null {
  const refusal = actionRefusal(store.getState(), 'repair', charge);
  if (refusal) return refuse(refusal);
  let freed = 0;
  runQuickOp(store, charge, 'compact', 'repair', COMPACT_SEC, () => {
    const memory = store.getState().memory;
    if (charge.used <= 0) {
      retireEmptyCharge(store);
      if (!memory.includes(charge)) freed = charge.size;
      return;
    }
    const reclaim = charge.size - charge.used;
    if (reclaim <= 0) return;
    // Same blocks, split in two: the charge keeps the head, the spent tail becomes free space.
    charge.size = charge.used;
    freed = reclaim;
    memory.splice(memory.indexOf(charge) + 1, 0, freeSegment(reclaim));
    mergeAdjacentFree(memory);
    checkMemory(memory);
  }, () => OP_ECHO.squeeze(echoName(charge), freed));
  return null;
}

// --- Delete ----------------------------------------------------------------------------------

// Frees a file's blocks (§6.5). The ones that can't be undone (REPAIR CHARGE, ship files, the
// last copy of a tool) ask first through the inline confirm; that question is the caller's
// (fs-tools requestDelete), this only runs the op. A deleted backup is no longer its primary's
// backup: the BAK badge, INSPECT's backup note and the SWAP tool all read that link.
export function actionDelete(store: Store<GameState>, seg: Segment): ToolRefusal | null {
  const refusal = actionRefusal(store.getState(), 'delete', seg);
  if (refusal) return refuse(refusal);
  // LAST LIGHT's root (WP11, §6.6): only the duel opens it (tool-targets refuses a LOCKED one), and its DELETE leaves
  // one last block in its middle (data/memory.ts rootRemains); systems/finale.ts sees the root gone and stops HOLLOW.
  const isRoot = seg.type === 'hollow' && seg.root;
  let lastBlockId: string | null = null;
  runQuickOp(store, seg, 'delete', 'delete', deleteSec(seg), () => {
    const memory = store.getState().memory;
    const start = requireAddr(memory, seg);
    for (const primary of memory) {
      if (primary.type === 'ship' && primary.backup === seg.id) delete primary.backup;
    }
    const remains = seg.type === 'hollow' && seg.root ? rootRemains(seg) : [freeSegment(seg.size)];
    lastBlockId = remains.find((part) => part.type === 'hollow')?.id ?? null;
    replaceRange(memory, start, start + seg.size, remains, { opId: null, own: [seg] });
    mergeAdjacentFree(memory);
    checkMemory(memory);
    store.update((draft) => {
      // The selection follows the root to the block it left (INSPECT then says what that block is).
      if (draft.ui.selectedId === seg.id) draft.ui.selectedId = lastBlockId;
      if (draft.ui.pickedSourceId === seg.id) draft.ui.pickedSourceId = null;
    });
    if (isRoot) emit('root-deleted', NO_PAYLOAD);
  }, () => (seg.type === 'hollow' && seg.root ? OP_ECHO.deleteRoot(echoWord(seg.owner)) : OP_ECHO.delete(echoName(seg), seg.size)));
  return null;
}

// Spends REPAIR CHARGE outside a repair (WP11: MERGE's price), all at once. The caller checked there is enough (a
// shortfall here is a bug and throws). An emptied pool leaves memory like a repair's does.
export function spendCharge(store: Store<GameState>, points: number): void {
  const charge = getRedundancy(store.getState());
  if (!charge || charge.used < points) throw new Error(`spendCharge: ${points} charge asked, ${charge?.used ?? 0} held`);
  store.update((draft) => {
    const pool = draft.memory.find((seg): seg is RedundancySegment => seg.type === 'redundancy');
    if (!pool) throw new Error('spendCharge: REPAIR CHARGE left memory mid-update');
    pool.used -= points;
    draft.ui.memoryRev++;
  });
  retireEmptyCharge(store);
}

// --- Move and copy -----------------------------------------------------------------------------

export interface Destination {
  regionStart: number;
  regionEnd: number;
  destAddr: number;
}

// Turns the placement preview into addresses: the region must still be contiguous, open free
// space (plus the source itself, for a slide), and the file must fit at the chosen column. Exported
// for the MOVE preview (systems/move-preview.ts), which judges the same placement the move would make.
export function resolvePlacement(
  memory: readonly Segment[], placement: PendingPlacement, source: Segment, kind: 'move' | 'copy',
): Destination | ToolRefusal {
  const segs: Segment[] = [];
  for (const id of placement.regionSegIds) {
    const seg = memory.find((candidate) => candidate.id === id);
    if (!seg) return TOOL_REFUSAL.noRoom;
    segs.push(seg);
  }
  const first = segs[0];
  if (!first) return TOOL_REFUSAL.noRoom;
  const firstIdx = memory.indexOf(first);
  const contiguous = segs.every((seg, i) => memory[firstIdx + i] === seg);
  const usable = segs.every((seg) => isOpenFree(seg) || (kind === 'move' && seg === source));
  if (!contiguous || !usable || (kind === 'copy' && segs.length !== 1)) return TOOL_REFUSAL.noRoom;
  const regionStart = requireAddr(memory, first);
  const regionEnd = regionStart + segs.reduce((sum, seg) => sum + seg.size, 0);
  const destAddr = regionStart + placement.col;
  if (placement.col < 0 || destAddr + source.size > regionEnd) return TOOL_REFUSAL.noRoom;
  return { regionStart, regionEnd, destAddr };
}

// HOLLOW keeps eating while a file moves (§6.6): a bite or a drain lands on whichever copy of the
// file it reaches. When the move ends, the copy that survives carries the worst of both: the lower
// integrity and any infection, re-labelled. So a move never heals a bite, and a cancel never
// "un-bites" the file that slid.
function carryHarm(from: Segment, to: Segment): void {
  if (!hasIntegrity(from) || !hasIntegrity(to)) return;
  if (from.integrity < to.integrity) setIntegrity(to, from.integrity);
  if (from.infected && !to.infected) to.infected = { ...from.infected };
}

// The new segments for a destination region: open free space before and after the clone,
// reserved by the op so nothing merges into it or places there until it ends.
function carve(dest: Destination, clone: Segment, opId: number): Segment[] {
  const pre = dest.destAddr - dest.regionStart;
  const post = dest.regionEnd - (dest.destAddr + clone.size);
  return [
    ...(pre > 0 ? [freeSegment(pre, opId)] : []),
    clone,
    ...(post > 0 ? [freeSegment(post, opId)] : []),
  ];
}

// Moves a file to a new address (§6.5: 1.5 s + 0.2 s per block). Two shapes:
// • a SLIDE within the source's own footprint plus its free neighbours: the source leaves the
//   strip at once and its clone (same id) fills in at the new spot;
// • a JUMP to free space elsewhere: the source stays where it is, offline, until the clone is
//   written, then becomes free space and the clone takes its id.
// Both the source and the clone are `transferring` (offline) meanwhile. A cancel or abort puts
// the original segments back into the region's exact blocks.
export function actionMove(store: Store<GameState>, source: Segment, placement: PendingPlacement): ToolRefusal | null {
  const state = store.getState();
  const refusal = actionRefusal(state, 'move', source);
  if (refusal) return refuse(refusal);
  const memory = state.memory;
  const dest = resolvePlacement(memory, placement, source, 'move');
  if (typeof dest === 'string') return refuse(dest);
  const sourceStart = requireAddr(memory, source);
  const sourceEnd = sourceStart + source.size;
  const slide = sourceStart >= dest.regionStart && sourceEnd <= dest.regionEnd;
  if (slide && dest.destAddr === sourceStart) return refuse(TOOL_REFUSAL.sameSpot);
  // An overlapping move to the right fills tail first (memmove), so the bar reads that way.
  const destEnd = dest.destAddr + source.size;
  const reverseFill = dest.destAddr < sourceEnd && sourceStart < destEnd && dest.destAddr > sourceStart;
  const priorState = stateOf(source);
  const name = echoName(source);

  const clone = structuredClone(source);
  setOperating(clone, false);
  clone.id = slide ? source.id : newSegId(source.id);
  let originals: Segment[] = [];

  const restore = (): void => {
    const mem = store.getState().memory;
    if (mem.includes(clone)) {
      // The original segments go back into the region's exact blocks; a slid file keeps any bite
      // it took on the way.
      if (slide) carryHarm(clone, source);
      replaceRange(mem, dest.regionStart, dest.regionEnd, originals, { opId: operation.id, own: [clone] });
    } else {
      // HOLLOW ate the clone where it was being written (systems/hollow.ts converts it in place,
      // then aborts this op): its blocks are HOLLOW's now, so only the free space the move reserved
      // around it is handed back. A jump's source is still where it was and comes back online; a
      // slid file had no other copy, and is gone.
      releaseReservations(mem, operation.id);
    }
    if (!slide) {
      setState(source, priorState);
      setOperating(source, false);
    }
    mergeAdjacentFree(mem);
    checkMemory(mem);
    bumpMemory(store);
  };

  const operation = startToolOp(store, 'move', {
    kind: 'move',
    segId: clone.id,
    targetIds: [clone.id, source.id],
    owner: PLAYER,
    label: 'MOVE',
    icon: TOOL_ICONS.move,
    view: { reverseFill, drain: { startAddr: sourceStart, endAddr: sourceEnd }, spanTargets: false },
    step: timedStep(moveSec(source.size)),
    onComplete: () => {
      const mem = store.getState().memory;
      releaseReservations(mem, operation.id);
      setState(clone, priorState);
      setOperating(clone, false);
      if (!slide) {
        carryHarm(source, clone);
        const start = requireAddr(mem, source);
        replaceRange(mem, start, start + source.size, [freeSegment(source.size)], { opId: null, own: [source] });
        clone.id = source.id;
      }
      mergeAdjacentFree(mem);
      checkMemory(mem);
      store.update((draft) => { draft.ui.selectedId = clone.id; draft.ui.memoryRev++; });
      echo(OP_ECHO.done('move', name));
      emit('op-done', { kind: 'move', result: 'done' });
    },
    onCancel: () => {
      restore();
      echo(OP_ECHO.ended('move', name, 'stopped'));
    },
    onAbort: () => {
      const ending = endingOf(store, clone, source);
      restore();
      echo(OP_ECHO.ended('move', name, ending));
    },
  });

  setState(clone, 'transferring');
  setOperating(clone, true);
  originals = replaceRange(memory, dest.regionStart, dest.regionEnd, carve(dest, clone, operation.id), {
    opId: null, own: slide ? [source] : [],
  });
  if (!slide) {
    setState(source, 'transferring');
    setOperating(source, true);
  }
  checkMemory(memory);
  bumpMemory(store);
  return null;
}

// Copies a file into free space (§6.5: 2.0 s + 0.3 s per block). The source keeps running (only
// locked against other tools); the copy is `transferring` until written. A cancel or abort puts
// the original free space back.
export function actionCopy(store: Store<GameState>, source: Segment, placement: PendingPlacement): ToolRefusal | null {
  const state = store.getState();
  const refusal = actionRefusal(state, 'copy', source);
  if (refusal) return refuse(refusal);
  const memory = state.memory;
  const dest = resolvePlacement(memory, placement, source, 'copy');
  if (typeof dest === 'string') return refuse(dest);
  const sourceState = stateOf(source);
  const name = echoName(source);

  const copy = structuredClone(source);
  setOperating(copy, false);
  copy.id = newSegId(source.id);
  // One .cp only: a copy of a copy keeps the name, so names never outgrow a line.
  if (!copy.name.endsWith('.cp')) copy.name = `${copy.name}.cp`;
  // The backup belongs to the original: two primaries pointing at one backup could both swap to it. Likewise a copy of
  // a backup is no backup the ship's data knows of (two spares for one job could both be put into service).
  if (copy.type === 'ship') delete copy.backup;
  if (copy.type === 'ship-backup') delete copy.backs;
  let originals: Segment[] = [];

  const restore = (): void => {
    const mem = store.getState().memory;
    // A copy HOLLOW ate while it was written stays HOLLOW's: only the reserved space goes back.
    if (mem.includes(copy)) replaceRange(mem, dest.regionStart, dest.regionEnd, originals, { opId: operation.id, own: [copy] });
    else releaseReservations(mem, operation.id);
    setOperating(source, false);
    mergeAdjacentFree(mem);
    checkMemory(mem);
    bumpMemory(store);
  };

  const operation = startToolOp(store, 'copy', {
    kind: 'copy',
    segId: copy.id,
    targetIds: [copy.id, source.id],
    owner: PLAYER,
    label: 'COPY',
    icon: TOOL_ICONS.copy,
    step: timedStep(copySec(source.size)),
    onComplete: () => {
      const mem = store.getState().memory;
      releaseReservations(mem, operation.id);
      setState(copy, sourceState);
      setOperating(copy, false);
      setOperating(source, false);
      mergeAdjacentFree(mem);
      checkMemory(mem);
      store.update((draft) => { draft.ui.selectedId = copy.id; draft.ui.memoryRev++; });
      echo(OP_ECHO.done('copy', name));
      emit('op-done', { kind: 'copy', result: 'done' });
    },
    onCancel: () => {
      restore();
      echo(OP_ECHO.ended('copy', name, 'stopped'));
    },
    onAbort: () => {
      const ending = endingOf(store, copy, source);
      restore();
      echo(OP_ECHO.ended('copy', name, ending));
    },
  });

  setState(copy, 'transferring');
  setOperating(copy, true);
  originals = replaceRange(memory, dest.regionStart, dest.regionEnd, carve(dest, copy, operation.id), { opId: null, own: [] });
  setOperating(source, true);
  checkMemory(memory);
  bumpMemory(store);
  return null;
}

// --- Cancel ----------------------------------------------------------------------------------

// The × on an op's bar. Pause is look-only, so a frozen op can't be cancelled either.
export function cancelPlayerOp(store: Store<GameState>, opId: number): ToolRefusal | null {
  if (store.getState().clock.paused) return refuse(TOOL_REFUSAL.paused);
  cancelOp(opId);
  return null;
}

// --- Swap (WP10) ------------------------------------------------------------------------------------

// The names a swap leaves (§6.5: the primary becomes `.old`): the backup takes over the job's own name (Thrust.alt
// becomes Thrust Controller, the file the THRUST CTRL pip and every line name), and the old primary is called after
// the backup's base with `.old` (Thrust.old), so the pair still reads as a pair and no name outgrows a strip label.
// A backup put into service after its primary is gone takes the name the ship's data gives the job (`backs`).
function swapNames(pair: SwapPair): { old: string | null; taking: string } {
  const { primary, backup } = pair;
  if (primary === null) {
    if (!backup.backs) throw new Error(`actionSwap: ${backup.name} has no primary and backs no job`);
    return { old: null, taking: backup.backs.name };
  }
  const base = backup.name.endsWith(BACKUP_SUFFIX) ? backup.name.slice(0, -BACKUP_SUFFIX.length) : primary.name;
  const old = `${base}${OLD_SUFFIX}`;
  if (old.length > SEG_NAME_MAX_CHARS) throw new Error(`actionSwap: '${old}' is longer than ${SEG_NAME_MAX_CHARS} characters`);
  // The backup takes the job's own name (`Thrust Controller`), also when the file doing it was a copy (`….cp`, WP12 p3).
  return { old, taking: backup.backs?.name ?? primary.name };
}

// Hands a ship file's job to its backup (§6.5, §9 WP10 item 3): the SWAP tool, clicked on the ship file or on its
// backup. A SWAP_SEC op that holds a Core thread like any op; both files are busy meanwhile, and the job moves only
// when it completes (a cancel, or HOLLOW eating one of them, changes nothing). Then the primary is switched off
// (`inactive`, `.old`, no role) and the backup takes the role and the name, so the capabilities read it from the next
// tick: a failing Thrust Ctrl's ghost thrust stops (orbit-sim silences a running burst at once).
// The backup keeps its own integrity, health word and infection (WP3 verify, the lead's item: it used to be marked
// intact whatever it was, so a damaged backup read as healthy). A swap reads both files, so both are scanned: the kid
// sees the old file's damage (the cause) and the new one's health (the fix) without a SCAN of their own.
// A backup whose primary is gone (deleted or eaten, tool-targets.ts orphanedBackup) is put into service alone: the same
// op on the backup only, which takes the job its data names (WP10 review: the healthy Thrust.alt was stranded).
export function actionSwap(store: Store<GameState>, seg: Segment): ToolRefusal | null {
  const state = store.getState();
  const refusal = actionRefusal(state, 'swap', seg);
  if (refusal) return refuse(refusal);
  const pair = swapPair(state, seg);
  if (!pair) throw new Error(`actionSwap: ${seg.name} passed the target rules without a backup`);
  const { primary, backup } = pair;
  const role = primary === null ? backup.backs?.role : primary.role;
  if (!role) throw new Error(`actionSwap: ${(primary ?? backup).name} has no job to hand over`);
  const names = swapNames(pair);
  const files: Segment[] = primary === null ? [backup] : [primary, backup];
  const handedTo = echoName(backup);
  // The echo names the file that did the job, then the one taking it (`> swap thrust_controller thrust.alt ... OK`);
  // with the primary gone, only the backup.
  const echoed = primary === null ? handedTo : echoName(primary);
  const release = (): void => {
    for (const file of files) setOperating(file, false);
    bumpMemory(store);
  };
  startToolOp(store, 'swap', {
    kind: 'swap',
    segId: files[0]!.id,
    targetIds: files.map((file) => file.id),
    owner: PLAYER,
    label: 'SWAP',
    icon: TOOL_ICONS.swap,
    // One bar across both files, filling from the primary into its backup: the job being handed over (WP10 part 2).
    view: { reverseFill: false, drain: null, spanTargets: primary !== null },
    step: timedStep(SWAP_SEC),
    onComplete: () => {
      for (const file of files) setOperating(file, false);
      if (primary !== null) {
        if (names.old === null) throw new Error(`actionSwap: no .old name for ${primary.name}`);
        primary.state = 'inactive';
        primary.name = names.old;
        primary.scanned = true;
        primary.desc = SWAP_DESC.old;
        delete primary.role;
        delete primary.backup;
      }
      backup.role = role;
      backup.name = names.taking;
      backup.scanned = true;
      backup.desc = SWAP_DESC.taking;
      delete backup.backs;
      if (isHealthLabel(backup.state)) backup.state = integrityState(backup.integrity);
      store.update((draft) => {
        if (primary !== null && draft.ui.selectedId === primary.id) draft.ui.selectedId = backup.id;
        draft.ui.memoryRev++;
      });
      echo(primary === null ? OP_ECHO.done('swap', handedTo) : OP_ECHO.swap(echoed, handedTo));
      emit('op-done', { kind: 'swap', result: 'done' });
    },
    onCancel: () => {
      release();
      echo(OP_ECHO.ended('swap', echoed, 'stopped'));
    },
    onAbort: () => {
      const ending = endingOf(store, ...files);
      release();
      echo(OP_ECHO.ended('swap', echoed, ending));
    },
  });
  for (const file of files) setOperating(file, true);
  bumpMemory(store);
  return null;
}
