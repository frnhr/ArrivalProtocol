// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the 'outline' target (inSeedOutline),
// a disguised seed under each tool (disguisedRefusal, its decoy's delete confirm). Others ask by message.
import type { GameState } from '@state/schema';
import type { Segment, FreeSegment, ShipSegment, ShipBackupSegment, SegmentRole } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import {
  getRedundancy, isRepairable, isUsableTool, effectiveToolVersion, filesWithRole, isInfected, toolFilesOf, repairableShipFile, repairCeiling,
} from '@state/selectors';
import { getOps } from '@systems/ops-core';
import {
  TOOL_REFUSAL, CONFIRM_TEXT, DELETE_EFFECT, DELETE_EFFECT_WITH_BACKUP, DELETE_EFFECT_OTHER_KEEPS, NO_FLIGHT_EFFECT, DELETE_CARD_EFFECT,
  type ToolRefusal,
  type ConfirmText,
} from '@data/tool-text';
import { TOOL_HINTS } from '@data/fs-tools';
import { INTEGRITY_MAX, REPAIR_V2_VERSION } from '@data/tuning';
import type { SkillFileSegment } from '@/types/segment';
import { isSkillFile } from '@state/selectors';
import { fileLevel, restoreCostOf } from '@systems/skill-levels';
import { SKILL_TREE } from '@data/skills';
import { PACKET_SKILL_TEXT } from '@data/training-text';
import { isDisguised } from '@state/threat-selectors';

// What deleting a skill file costs (slice 4): its skill until a desk's RESTORE, at the price the next desk will ask (the
// levels the run paid for above what is left once it is gone: another copy, or nothing).
function skillDeleteEffect(state: Readonly<GameState>, seg: Readonly<SkillFileSegment>): string {
  const left = fileLevel(state.memory.filter((other) => other !== seg), seg.upgrade);
  const restore = restoreCostOf(state, seg.upgrade, left);
  return PACKET_SKILL_TEXT.deleteEffect(SKILL_TREE[seg.upgrade].fileName.replace('.skl', ''), restore);
}

// What each fs-tool may be used on, and why not (§6.5). Pure: the strip's valid/invalid target
// classes, a click on a segment, the detail panel's buttons and the actions themselves all ask
// the same question here, so the highlight, the refusal next to the cursor and the rule agree.

// Free space a new op may use: free and not reserved by a running move/copy.
export function isOpenFree(seg: Segment): seg is FreeSegment {
  return seg.type === 'free' && seg.reservedBy === undefined;
}

// A file in the middle of an op (or offline for one): no second op may touch it.
export function isBusy(seg: Segment): boolean {
  if (seg.operating) return true;
  const state = 'state' in seg ? seg.state : undefined;
  return state === 'transferring' || state === 'repairing' || state === 'offline' || state === 'busy';
}

// A repair or a v2 squeeze is spending REPAIR CHARGE right now.
export function chargeInUse(): boolean {
  return getOps().some((operation) => operation.kind === 'repair' || operation.kind === 'compact');
}

export interface MoveRegion {
  startIdx: number;
  endIdx: number;
  segs: Segment[];
  totalSize: number;
}

// For a move: the source plus the open free space on either side, so a file can slide within
// its own footprint. Free space another op reserved is not part of it.
export function computeMoveRegion(memory: readonly Segment[], source: Segment): MoveRegion | null {
  const srcIdx = memory.indexOf(source);
  if (srcIdx === -1) return null;
  let startIdx = srcIdx;
  while (startIdx > 0 && isOpenFree(memory[startIdx - 1]!)) startIdx--;
  let endIdx = srcIdx;
  while (endIdx < memory.length - 1 && isOpenFree(memory[endIdx + 1]!)) endIdx++;
  const segs = memory.slice(startIdx, endIdx + 1);
  const totalSize = segs.reduce((sum, seg) => sum + seg.size, 0);
  return { startIdx, endIdx, segs, totalSize };
}

export interface ValidTargetContext {
  state: Readonly<GameState>;
  activeKind: FsToolKind;
  pickedSource: Segment | null;   // a move's or copy's source once picked (stage 2)
}

// Why a tool does nothing on something that is not a working file. HOLLOW's root is LOCKED; a
// block it ate is no file any more (only DELETE clears it, §6.5).
function notAFile(seg: Segment): ToolRefusal {
  if (seg.type === 'hollow') return seg.locked ? TOOL_REFUSAL.locked : TOOL_REFUSAL.eaten;
  return TOOL_REFUSAL.notAFile;
}

function repairRefusal(seg: Segment, state: Readonly<GameState>): ToolRefusal | null {
  if (seg.type === 'redundancy') {
    // Repair v2 squeezes the spent blocks out of REPAIR CHARGE (§6.9 keeps it on v2).
    if (effectiveToolVersion(state, 'repair') < REPAIR_V2_VERSION) return TOOL_REFUSAL.needsV2;
    return chargeInUse() ? TOOL_REFUSAL.chargeBusy : null;
  }
  const shipRepair = repairableShipFile(state, seg);
  if ((seg.type === 'ship' && !shipRepair) || seg.type === 'ship-backup') return TOOL_REFUSAL.shipFile;
  if (seg.type === 'firewall') return TOOL_REFUSAL.firewallHealth;
  if (seg.type === 'log') return TOOL_REFUSAL.logRepair;
  // The arm's Thrust Ctrl heals only so far (selectors repairCeiling): past it, SWAP's.
  if (shipRepair) {
    if (seg.integrity >= repairCeiling(state, seg) && !isInfected(seg)) return TOOL_REFUSAL.fieldRepairMax;
  } else if (!isRepairable(seg)) return notAFile(seg);
  // No scan gate: the AI's own files are always visible (§3.2), so a hurt Engine I/O is one
  // click from a repair. Only ship files hide their health, and those can't be healed (but the arm's Thrust Ctrl).
  // A file HOLLOW bit this very tick is still at 100%, but it is being eaten: a repair started now
  // wins at once (§6.6), so it is never "ALREADY 100%".
  if (seg.integrity >= INTEGRITY_MAX && !isInfected(seg)) return TOOL_REFUSAL.healthy;
  const charge = getRedundancy(state);
  if (!charge || charge.used < 1) return TOOL_REFUSAL.noCharge;
  // Being squeezed or deleted: its size and its points are about to change.
  if (charge.operating) return TOOL_REFUSAL.chargeBusy;
  return null;
}

function placeRefusal(seg: Segment, ctx: ValidTargetContext, picked: Segment): ToolRefusal | null {
  if (ctx.activeKind === 'move') {
    // Slide within the source's own footprint, or any open free space that fits.
    const region = computeMoveRegion(ctx.state.memory, picked);
    if (region && region.totalSize >= picked.size && region.segs.includes(seg)) return null;
  }
  return isOpenFree(seg) && seg.size >= picked.size ? null : TOOL_REFUSAL.noRoom;
}

// Why the active tool can't be used on `seg` right now, or null when it can.
export function targetRefusal(seg: Segment, ctx: ValidTargetContext): ToolRefusal | null {
  const { state, activeKind, pickedSource } = ctx;
  if ((activeKind === 'move' || activeKind === 'copy') && pickedSource) return placeRefusal(seg, ctx, pickedSource);
  if (seg.type === 'free') return TOOL_REFUSAL.notAFile;
  if (isBusy(seg)) return TOOL_REFUSAL.busy;
  if (isDisguised(seg)) return disguisedRefusal(activeKind);
  switch (activeKind) {
    case 'scan':
      if (seg.type === 'driver') return TOOL_REFUSAL.driverScan;
      if (seg.type === 'firewall') return TOOL_REFUSAL.firewallHealth;
      // 046.log: SCAN reads its header (05 §3.2), the one tool that works on it.
      if (seg.type === 'log') return null;
      return 'scanned' in seg ? null : notAFile(seg);
    case 'repair':
      return repairRefusal(seg, state);
    case 'delete':
      if (seg.type === 'core') return TOOL_REFUSAL.coreDelete;
      if (seg.type === 'driver') return TOOL_REFUSAL.driverDelete;
      if (seg.type === 'log') return TOOL_REFUSAL.logDelete;
      // DELETE cuts HOLLOW back block by block (§6.5); the root stays LOCKED until ship 5's duel.
      if (seg.type === 'hollow' && seg.locked) return TOOL_REFUSAL.locked;
      if (seg.type === 'redundancy' && chargeInUse()) return TOOL_REFUSAL.chargeBusy;
      return null;
    case 'move':
    case 'copy':
      // Stage 1: the source.
      if (seg.type === 'hollow') return notAFile(seg);
      if (seg.type === 'core') return activeKind === 'move' ? TOOL_REFUSAL.coreMove : TOOL_REFUSAL.coreCopy;
      if (seg.type === 'log') return activeKind === 'move' ? TOOL_REFUSAL.logMove : TOOL_REFUSAL.logCopy;
      // REPAIR CHARGE stays put (§6.5), and a copy of it would double the repair budget.
      if (seg.type === 'redundancy') return activeKind === 'move' ? TOOL_REFUSAL.moveCharge : TOOL_REFUSAL.copyCharge;
      // Drivers move (carried behind a gap, §3.2) but are never duplicated: one pod, one driver.
      if (seg.type === 'driver' && activeKind === 'copy') return TOOL_REFUSAL.driverCopy;
      // A card's file moves (a FIREWALL is placed with MOVE, §6.9) but is never duplicated: the draft's
      // stacks (FIREWALL ×2, FUEL TRIM ×2) would mean nothing.
      if ((seg.type === 'firewall' || seg.type === 'upgrade') && activeKind === 'copy') return TOOL_REFUSAL.cardCopy;
      // A file being eaten stays where it is (§6.5): heal it first. Moving it would only carry the
      // bite along, and a copy would clone the infection.
      if (isInfected(seg)) return TOOL_REFUSAL.infected;
      return null;
    case 'swap':
      return swapTargetRefusal(state, seg);
  }
}

// A disguised seed under each tool (slice 4d, plan R9): it plays as the harmless file it shows. SCAN works on it as on any
// file (1.2 s, and it unmasks: state/actions.ts actionScan); DELETE works without a SCAN (detective work too: it runs as rm
// on a seed); MOVE, COPY and REPAIR refuse with a temp file's neutral words, and SWAP with what it says to any unit file.
// Never EATEN or LOCKED: a refusal must not give the seed away.
function disguisedRefusal(kind: FsToolKind): ToolRefusal | null {
  switch (kind) {
    case 'scan':
    case 'delete':
      return null;
    case 'move':
    case 'copy':
    case 'repair':
      return TOOL_REFUSAL.tempFile;
    case 'swap':
      return TOOL_REFUSAL.swapShipOnly;
  }
}

// SENTRY v2's 'outline' target (03 §3.10, plan §4.4): the block at `addr` lies inside HOLLOW's blinking seed outline, on
// the open free space that holds it (hollow.ts openFreeHolding: where the seed will land, and where the outline is drawn).
// Only the block test: whether SENTRY v2 works, DELETE is in hand and a thread is free is sentry.ts preemptSeed's to say.
export function inSeedOutline(state: Readonly<GameState>, seg: Readonly<Segment>, addr: number): boolean {
  const telegraph = state.hollow.seedTelegraph;
  if (telegraph === null || !isOpenFree(seg as Segment)) return false;
  if (!(addr >= telegraph.startAddr && addr < telegraph.startAddr + telegraph.size)) return false;
  const at = state.memory.indexOf(seg as Segment);
  if (at < 0) return false;
  let start = 0;
  for (let i = 0; i < at; i++) start += state.memory[i]!.size;
  return start <= telegraph.startAddr && start + seg.size >= telegraph.startAddr + telegraph.size;
}

export function isValidTarget(seg: Segment, ctx: ValidTargetContext): boolean {
  return targetRefusal(seg, ctx) === null;
}

// The deletes that need the inline confirm (§6.5), with their consequence; null = no question.
// REPAIR CHARGE and ship files can't be brought back, and neither can the last WORKING copy of a
// tool: a copy too damaged to use (the line getFsTool draws) does not keep the tool in hand. The
// last copy of one of your flight files (Engine I/O, Autopilot …) asks too, naming what the ship
// loses: one stray click with DELETE must not silently kill the engine.
export function deleteQuestion(state: Readonly<GameState>, seg: Segment): ConfirmText | null {
  // Slice 4d (plan R9): a disguised seed asks its decoy's own confirm (`DELETE CACHE.TMP?` and the decoy's line), as the
  // file it shows would; yes runs it as rm on a seed.
  if (isDisguised(seg)) return CONFIRM_TEXT.deleteFile(seg.disguise.name, seg.disguise.desc, seg.size);
  if (seg.type === 'redundancy') return CONFIRM_TEXT.deleteCharge(seg.used, seg.size);
  // A card's file: the card a kid picked goes with it.
  if (seg.type === 'firewall') return CONFIRM_TEXT.deleteFile(seg.name, DELETE_CARD_EFFECT.firewall, seg.size);
  // Slice 4: a skill deleted is lost until a desk's RESTORE (03 §3.3), at the price the next desk will ask.
  if (isSkillFile(seg)) return CONFIRM_TEXT.deleteFile(seg.name, skillDeleteEffect(state, seg), seg.size);
  if (seg.type === 'upgrade') return CONFIRM_TEXT.deleteFile(seg.name, DELETE_CARD_EFFECT[seg.upgrade], seg.size);
  if (seg.type === 'ship' || seg.type === 'ship-backup') {
    return CONFIRM_TEXT.deleteFile(seg.name, shipDeleteEffect(state, seg), seg.size);
  }
  if (seg.role && filesWithRole(state, seg.role).length === 1) {
    return CONFIRM_TEXT.deleteFile(seg.name, DELETE_EFFECT[seg.role], seg.size);
  }
  if (seg.type === 'fs-tool') {
    const othersWork = state.memory.some((other) =>
      other !== seg && other.type === 'fs-tool' && other.fsTool === seg.fsTool && isUsableTool(other));
    if (!othersWork) return CONFIRM_TEXT.deleteLastTool(seg.name, seg.fsTool);
  }
  return null;
}

// What deleting a ship file does to the flight: its role's effect, and how a SWAP undoes it while its backup is there.
// Another file doing the same job (a COPY of it) keeps doing it (WP12 p3, WP10 verify: the confirm said the engine
// stops till a SWAP, while the copy kept it running).
function shipDeleteEffect(state: Readonly<GameState>, seg: ShipSegment | ShipBackupSegment): string {
  if (!seg.role) return NO_FLIGHT_EFFECT;
  const other = filesWithRole(state, seg.role).find((file) => file !== seg && !('state' in file && file.state === 'inactive'));
  if (other) return DELETE_EFFECT_OTHER_KEEPS(other.name);
  const backup = seg.type === 'ship' ? findBackup(state, seg) : undefined;
  if (!backup) return DELETE_EFFECT[seg.role];
  const withBackup = DELETE_EFFECT_WITH_BACKUP[seg.role];
  if (!withBackup) throw new Error(`deleteQuestion: ${seg.name} has a backup, but no line says what a SWAP undoes`);
  return withBackup(backup.name);
}

// A ship file's backup copy, when it is still in memory. The primary keeps the backup's id (seed
// data); a delete of the backup clears it (state/actions.ts), so a missing one here is refused
// loudly (swapRefusal), never skipped.
// WP12 p3 (WP10 verify): a file that holds a role without that link (a COPY of the controller, after the original was
// deleted: a copy never takes the link, state/actions.ts actionCopy) pairs with the backup that backs its role, as long
// as no other file claims that backup. Before, Thrust.alt was refused on the copy, which does the very job it backs.
export function findBackup(state: Readonly<GameState>, seg: ShipSegment): ShipBackupSegment | undefined {
  if (seg.backup) return state.memory.find((other): other is ShipBackupSegment => other.type === 'ship-backup' && other.id === seg.backup);
  const role = seg.role;
  if (role === undefined || seg.state === 'inactive') return undefined;
  return state.memory.find((other): other is ShipBackupSegment => other.type === 'ship-backup' && other.backs?.role === role
    && !state.memory.some((claim) => claim.type === 'ship' && claim.backup === other.id));
}

// The primary whose backup this is (Thrust.alt → Thrust Controller), when it is still in memory: a kid who clicks the
// backup with SWAP in hand means "swap to this one", so the swap is that primary's. With the linked primary gone, the
// ship file that now holds the role it backs (WP12 p3, see findBackup).
export function primaryOf(state: Readonly<GameState>, backup: ShipBackupSegment): ShipSegment | undefined {
  const linked = state.memory.find((other): other is ShipSegment => other.type === 'ship' && other.backup === backup.id);
  if (linked) return linked;
  const role = backup.backs?.role;
  if (role === undefined) return undefined;
  return state.memory.find((other): other is ShipSegment => other.type === 'ship' && other.role === role && other.state !== 'inactive');
}

// The pair a SWAP on `seg` works on (WP10, §6.5): a ship file and its backup, clicked on either one. A backup whose
// primary is gone (deleted, or eaten: orphanedBackup) is a pair of its own, with no primary: the SWAP puts it into
// service. null: no pair.
export interface SwapPair {
  primary: ShipSegment | null;
  backup: ShipBackupSegment;
}

export function swapPair(state: Readonly<GameState>, seg: Segment): SwapPair | null {
  if (seg.type === 'ship') {
    const backup = findBackup(state, seg);
    return backup ? { primary: seg, backup } : null;
  }
  if (seg.type === 'ship-backup') {
    const primary = primaryOf(state, seg);
    if (primary) return { primary, backup: seg };
    return orphanedBackup(state, seg) ? { primary: null, backup: seg } : null;
  }
  return null;
}

// A backup whose job nobody does any more: its primary was deleted or eaten, and no file holds the role it backs
// (WP10 review). A SWAP on it hands it that job.
export function orphanedBackup(state: Readonly<GameState>, backup: ShipBackupSegment): boolean {
  return backup.backs !== undefined && filesWithRole(state, backup.backs.role).length === 0;
}

// The backup a SWAP would put into service for `role` now that nothing does that job (guidance names it), or null.
export function spareFor(state: Readonly<GameState>, role: SegmentRole): ShipBackupSegment | null {
  return state.memory.find((seg): seg is ShipBackupSegment =>
    seg.type === 'ship-backup' && seg.backs?.role === role && orphanedBackup(state, seg)) ?? null;
}

// What a SWAP of Thrust Ctrl would put into service, and whether a Swap file can do it now (WP12 p3, WP10 verify: the
// strip asked for `SWAP in Thrust.alt` with the Swap file eaten), or null: no SWAP licence, no backup, or no Swap file at
// all. The backup is the orphaned spare when the controller is gone (guidance's F2 NO THRUST CONTROLLER), else the
// controller's own backup (the landing's ghost-thrust row, review M2: the controller is there and fires by itself).
export interface ControllerSwap {
  name: string;
  swapReady: boolean;
}

export function controllerSwapOf(state: Readonly<GameState>): ControllerSwap | null {
  if (!state.run.licences.includes('swap')) return null;
  const controller = filesWithRole(state, 'thrust-ctrl').find((seg): seg is ShipSegment => seg.type === 'ship');
  const spare = controller === undefined ? spareFor(state, 'thrust-ctrl') : findBackup(state, controller) ?? null;
  const swapFiles = toolFilesOf(state.memory, 'swap');
  if (spare === null || swapFiles.length === 0) return null;
  return { name: spare.name, swapReady: swapFiles.some(isUsableTool) };
}

// Why a ship file can't be swapped to its backup right now (the SWAP tool, WP10). Only a ship file that has a backup
// (or the backup itself), and neither file may be mid-op: a move of the backup copies it at its start, so a swap during
// the move would be undone when the move lands, and two swaps of one pair would hand the job over twice.
function swapRefusal(state: Readonly<GameState>, seg: Segment): ToolRefusal | null {
  if (!state.memory.includes(seg)) return TOOL_REFUSAL.notAFile;
  if (seg.type !== 'ship' && seg.type !== 'ship-backup') return TOOL_REFUSAL.swapShipOnly;
  const pair = swapPair(state, seg);
  if (!pair) return TOOL_REFUSAL.noBackup;
  if ((pair.primary !== null && isBusy(pair.primary)) || isBusy(pair.backup)) return TOOL_REFUSAL.busy;
  return null;
}

// SWAP's stage-1 rule inside targetRefusal (whose busy check on the clicked file has already run).
function swapTargetRefusal(state: Readonly<GameState>, seg: Segment): ToolRefusal | null {
  if (seg.type === 'hollow') return notAFile(seg);
  return swapRefusal(state, seg);
}

// What to click next under the held tool (the cursor follower and the phone's tool pill).
export function heldToolHint(state: Readonly<GameState>, kind: FsToolKind, picked: Segment | null): string {
  const hints = TOOL_HINTS[kind];
  if (picked) return hints.stage2 ?? hints.stage1;
  if (kind === 'repair' && effectiveToolVersion(state, 'repair') >= REPAIR_V2_VERSION && hints.stage1V2) return hints.stage1V2;
  return hints.stage1;
}
