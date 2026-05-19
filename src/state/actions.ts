import type { Store } from './store';
import type { GameState } from './schema';
import type {
  Segment, ShipSegment, ShipBackupSegment, RedundancySegment,
  CoreSegment, ToolSegment, SkillSegment, FsToolSegment,
  SegmentState,
} from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { getRedundancy, getFsTool } from './selectors';
import { mergeAdjacentFree } from '@systems/memory-ops';
import { startOp, type OpShrinker } from '@systems/ops';
import { TOOL_ICONS } from '@data/fs-tools';
import { memAddrOf } from '@systems/memory-ops';
import { renderSegmentPart } from '@components/memory-view/SegmentBlock';
import type { PendingPlacement } from './schema';

// Cursor position is module-local in the fs-tools system; mousemove fires too
// often to route through the store. Memory mutations propagate by bumping
// state.ui.memoryRev via store.update — that's what MemoryStrip watches.
// pickFsTool is a bridge to the fs-tools system's pickUpTool, used by
// actionActivate when its target is itself an fs-tool segment (meta-pickup).
export interface ActionDeps {
  getCursorXY: () => { x: number; y: number };
  pickFsTool: (kind: FsToolKind) => void;
}

// Runs a short fs-tool animation (dock-in + progress fill + fade) docked over
// the target segment. Used by scan / activate / deactivate where the action
// itself is instant logic but the user-visible effect benefits from a tool
// animation. The fs-tool segment goes 'busy' for the duration; the target
// gets `operating: true` so other tools' isValidTarget rejects it.
function runQuickToolOp(
  store: Store<GameState>,
  fsTool: FsToolSegment,
  seg: Segment,
  deps: ActionDeps,
  label: string,
  icon: string,
  dur: number,
  apply: () => void,
): void {
  (seg as Segment & { operating?: boolean }).operating = true;
  fsTool.state = 'busy';
  store.update((d) => { d.ui.memoryRev++; });

  const targetEls = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${seg.id}"]`,
  ));
  if (targetEls.length === 0) {
    (seg as Segment & { operating?: boolean }).operating = false;
    fsTool.state = 'intact';
    return;
  }
  const { x, y } = deps.getCursorXY();

  startOp({
    segId: seg.id,
    fromX: x, fromY: y,
    targetEls,
    label, icon, dur,
    onComplete: () => {
      (seg as Segment & { operating?: boolean }).operating = false;
      fsTool.state = 'intact';
      apply();
      store.update((d) => { d.ui.memoryRev++; });
    },
    onCancel: () => {
      (seg as Segment & { operating?: boolean }).operating = false;
      fsTool.state = 'intact';
      store.update((d) => { d.ui.memoryRev++; });
    },
  });
}

// AI segments that can be repaired (excludes ship systems — those use swap).
type RepairableSegment = CoreSegment | ToolSegment | SkillSegment | FsToolSegment;

function isRepairable(seg: Segment): seg is RepairableSegment {
  return seg.type === 'core' || seg.type === 'tool' ||
         seg.type === 'skill' || seg.type === 'fs-tool';
}

// Reveal a ship system's integrity. Short scan animation (~700ms) so the act
// feels like an action rather than a state flip.
export function actionScan(store: Store<GameState>, seg: ShipSegment, deps: ActionDeps): void {
  if (seg.scanned) return;
  const scan = getFsTool(store.getState(), 'scan');
  if (!scan) return;
  runQuickToolOp(store, scan, seg, deps,
    `SCAN · ${seg.name}`, TOOL_ICONS.scan, 700,
    () => { seg.scanned = true; });
}

// Swap a ship system with its backup. The primary becomes inactive (with .old
// suffix) and the backup takes over with its .alt suffix stripped.
export function actionSwap(store: Store<GameState>, seg: ShipSegment, deps: ActionDeps): void {
  if (!seg.backup) return;
  const backup = store.getState().memory.find((m): m is ShipBackupSegment =>
    m.id === seg.backup,
  );
  if (!backup) return;

  seg.state = 'inactive';
  seg.name += '.old';
  backup.state = 'intact';
  backup.name = backup.name.replace('.alt', '');
  delete seg.backup;

  store.update((d) => { d.ui.memoryRev++; });
}

// Active-state derivation from integrity. Used when re-activating a segment
// whose pre-deactivation state wasn't tracked — we don't want to silently
// "heal" partial/corrupt damage by snapping back to 'intact'.
function activeStateFromIntegrity(integrity: number | undefined): SegmentState {
  if (integrity === undefined) return 'intact';
  if (integrity > 90) return 'intact';
  if (integrity > 50) return 'partial';
  return 'corrupt';
}

// Activate a segment. Generic — works on any segment that carries a state
// (tool, skill, ship, ship-backup, core). Resulting state is derived from
// integrity so corrupt/partial files stay corrupt/partial when re-enabled.
// Special case: when the target is itself an fs-tool segment, this acts as
// a meta-pickup — same effect as clicking that tool's chip in the toolbar,
// fired on op completion so the activate animation still plays.
export function actionActivate(
  store: Store<GameState>,
  seg: Segment,
  deps: ActionDeps,
): void {
  const activate = getFsTool(store.getState(), 'activate');
  if (!activate) return;
  if (!('state' in seg) && seg.type !== 'fs-tool') return;
  runQuickToolOp(store, activate, seg, deps,
    `ACTIVATE · ${seg.name}`, TOOL_ICONS.activate, 500,
    () => {
      if (seg.type === 'fs-tool') {
        deps.pickFsTool(seg.fsTool);
        return;
      }
      const integrity = 'integrity' in seg ? seg.integrity : undefined;
      (seg as Segment & { state?: SegmentState }).state = activeStateFromIntegrity(integrity);
    });
}

// Deactivate a segment. Sets state='inactive' so any consumers of the
// underlying tool/system treat it as disabled. FS-tools cannot be
// deactivated (only deleted) — callers should gate that via isValidTarget.
// Special case: deactivating the AI Core is a reboot-like event; concrete
// gameplay impact is TBD, for now it nudges the player into tools-mode.
export function actionDeactivate(
  store: Store<GameState>,
  seg: Segment,
  deps: ActionDeps,
): void {
  if (!('state' in seg)) return;
  if (seg.type === 'fs-tool') return;
  const deactivate = getFsTool(store.getState(), 'deactivate');
  if (!deactivate) return;
  runQuickToolOp(store, deactivate, seg, deps,
    `DEACTIVATE · ${seg.name}`, TOOL_ICONS.deactivate, 500,
    () => {
      (seg as Segment & { state?: SegmentState }).state = 'inactive';
      if (seg.type === 'core') {
        store.update((d) => { d.ui.mode = 'tools'; });
      }
    });
}

// Reclaim the redundancy pool as free space. Requires user confirmation since
// this destroys the only AI-side repair budget for the run.
export function actionDeleteRedundancy(store: Store<GameState>, deps: ActionDeps): void {
  const r = getRedundancy(store.getState());
  if (!r) return;
  if (!confirm(`Reclaim ${r.used} blocks of redundancy as free space? This cannot be undone.`)) {
    return;
  }
  const memory = store.getState().memory;
  const idx = memory.indexOf(r);
  const next = memory[idx + 1];
  if (next && next.type === 'free') {
    next.size += r.size;
    memory.splice(idx, 1);
  } else {
    // In-place conversion: redundancy slot becomes free. Re-tag the segment.
    const free = r as unknown as Segment;
    (free as { type: 'free' }).type = 'free';
    (free as { name: string }).name = 'Free';
  }
  mergeAdjacentFree(memory);
  store.update((d) => { d.ui.memoryRev++; });
}

// Used by actionDeleteRedundancy and tests — exposed for re-use, not exported
// as part of the action surface.
export function _isRedundancy(seg: Segment): seg is RedundancySegment {
  return seg.type === 'redundancy';
}

// Repair an AI segment using redundancy. Cost scales with damage × size. The
// segment goes offline (state='busy' on the tool side) for the op duration;
// on completion integrity restores to 100 and the redundancy pool shrinks.
// When the pool hits zero, it converts to free space (absorbed by adjacent
// free seg if present, otherwise retyped in place).
export function actionRepair(
  store: Store<GameState>,
  seg: Segment,
  deps: ActionDeps,
): void {
  if (!isRepairable(seg)) return;
  const repair = getFsTool(store.getState(), 'repair');
  const redund = getRedundancy(store.getState());
  if (!repair || !redund) return;
  const cost = Math.ceil(((100 - seg.integrity) / 100) * seg.size * 2);
  if (redund.used < cost) return;

  (seg as Segment & { operating?: boolean }).operating = true;
  repair.state = 'busy';
  store.update((d) => { d.ui.memoryRev++; });

  const targetEls = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${seg.id}"]`,
  ));
  if (targetEls.length === 0) return;
  const { x, y } = deps.getCursorXY();

  startOp({
    segId: seg.id,
    fromX: x, fromY: y,
    targetEls,
    label: `REPAIR · ${seg.name}`,
    icon: TOOL_ICONS.repair,
    dur: 6000,
    onComplete: () => {
      seg.integrity = 100;
      seg.state = 'intact';
      (seg as Segment & { operating?: boolean }).operating = false;
      redund.used = Math.max(0, redund.used - cost);
      if (redund.used === 0) {
        const memory = store.getState().memory;
        const idx = memory.indexOf(redund);
        const next = memory[idx + 1];
        if (next && next.type === 'free') {
          next.size += redund.size;
          memory.splice(idx, 1);
        } else {
          // Retype the redundancy seg in place as free.
          (redund as unknown as { type: 'free' }).type = 'free';
          (redund as unknown as { name: string }).name = 'Free';
        }
        mergeAdjacentFree(memory);
      }
      repair.state = 'intact';
      store.update((d) => { d.ui.memoryRev++; });
    },
    onCancel: () => {
      (seg as Segment & { operating?: boolean }).operating = false;
      repair.state = 'intact';
      store.update((d) => { d.ui.memoryRev++; });
    },
  });
}

// Delete a segment. Core and free are no-ops; redundancy delegates to
// actionDeleteRedundancy. Deleting the last functional Repair tool prompts
// a confirmation since it ends the run's repair capability.
export function actionDelete(
  store: Store<GameState>,
  seg: Segment,
  deps: ActionDeps,
): void {
  if (seg.type === 'core' || seg.type === 'free') return;
  if (seg.type === 'redundancy') { actionDeleteRedundancy(store, deps); return; }

  const delTool = getFsTool(store.getState(), 'delete');
  if (!delTool) return;

  // Warn before destroying the last functional Repair tool.
  if (seg.type === 'fs-tool' && seg.fsTool === 'repair') {
    const memory = store.getState().memory;
    const otherRepair = memory.find((m): m is FsToolSegment =>
      m.type === 'fs-tool' && m.fsTool === 'repair' &&
      m.id !== seg.id && m.integrity > 50,
    );
    if (!otherRepair &&
        !confirm('Deleting the last functional Repair tool will end the run if anything else corrupts. Continue?')) {
      return;
    }
  }

  (seg as Segment & { operating?: boolean }).operating = true;
  delTool.state = 'busy';
  store.update((d) => { d.ui.memoryRev++; });

  const targetEls = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${seg.id}"]`,
  ));
  if (targetEls.length === 0) return;
  const { x, y } = deps.getCursorXY();

  startOp({
    segId: seg.id,
    fromX: x, fromY: y,
    targetEls,
    label: `DELETE · ${seg.name}`,
    icon: TOOL_ICONS.delete,
    dur: 1600,
    onComplete: () => {
      const memory = store.getState().memory;
      const idx = memory.indexOf(seg);
      if (idx !== -1) {
        memory.splice(idx, 1, {
          id: 'free-' + Date.now(),
          name: 'Free',
          type: 'free',
          size: seg.size,
        });
        mergeAdjacentFree(memory);
      }
      delTool.state = 'intact';
      store.update((d) => { d.ui.selectedId = null; });
      store.update((d) => { d.ui.memoryRev++; });
    },
    onCancel: () => {
      (seg as Segment & { operating?: boolean }).operating = false;
      delTool.state = 'intact';
      store.update((d) => { d.ui.memoryRev++; });
    },
  });
}

// Decorative floating copies of a source's parts during in-place moves.
// Anchored at the pre-splice screen rects so the user perceives the source
// shrinking as the bar fills. Returned as shrinkers for startOp to clip.
interface PartData {
  rect: DOMRect;
  partSize: number;
  partOffset: number;
}
function createSourcePhantoms(
  source: Segment,
  priorState: string | undefined,
  partData: PartData[],
): OpShrinker[] {
  const clone: Segment = structuredClone(source);
  // Not every Segment variant has `state`; assignment is intentional and the
  // cast is the type-erasure needed because of the union. Skip if undefined.
  if (priorState !== undefined) {
    (clone as Segment & { state?: string }).state = priorState;
  } else {
    delete (clone as Segment & { state?: string }).state;
  }
  delete (clone as Segment & { operating?: boolean }).operating;

  // No behavior — phantoms are pointer-events:none and never receive input.
  const noop = () => {};
  const noopBehavior = { onClick: noop, onMouseEnter: noop, onMouseLeave: noop };

  return partData.map((pd, idx) => {
    const phantom = renderSegmentPart(
      clone,
      { partSize: pd.partSize, partIdx: idx, totalParts: partData.length, partOffset: pd.partOffset },
      noopBehavior,
    );
    phantom.removeAttribute('data-id');
    phantom.removeAttribute('data-part-idx');
    phantom.removeAttribute('data-total-parts');
    phantom.style.position = 'fixed';
    phantom.style.left = pd.rect.left + 'px';
    phantom.style.top = pd.rect.top + 'px';
    phantom.style.width = pd.rect.width + 'px';
    phantom.style.height = pd.rect.height + 'px';
    phantom.style.gridColumn = '';
    phantom.style.cursor = 'default';
    phantom.style.pointerEvents = 'none';
    // Above op-progress (450) so the shrinkage reveals the bar fill underneath.
    phantom.style.zIndex = '460';
    phantom.classList.add('source-phantom');
    document.body.appendChild(phantom);
    return { el: phantom, partSize: pd.partSize, isPhantom: true };
  });
}

type PlacementResolved = {
  regionSegs: Segment[];
  regionStartIdx: number;
  regionLen: number;
  totalSize: number;
  destCol: number;
  preSize: number;
  postSize: number;
};

function resolvePlacement(
  memory: readonly Segment[],
  placement: PendingPlacement,
  movedSize: number,
): PlacementResolved | null {
  const regionSegs: Segment[] = [];
  for (const id of placement.regionSegIds) {
    const found = memory.find((m) => m.id === id);
    if (!found) return null;
    regionSegs.push(found);
  }
  const first = regionSegs[0];
  if (!first) return null;
  const regionStartIdx = memory.indexOf(first);
  const regionLen = regionSegs.length;
  const totalSize = regionSegs.reduce((s, r) => s + r.size, 0);
  const destCol = placement.col;
  const preSize = destCol;
  const postSize = totalSize - destCol - movedSize;
  return { regionSegs, regionStartIdx, regionLen, totalSize, destCol, preSize, postSize };
}

function freeSeg(size: number, tag: string): Segment {
  return { id: `${tag}-${Date.now()}`, name: 'Free', type: 'free', size };
}

// Move a segment to a new location. Supports two patterns:
//   1. In-region slide (source overlaps the move region) — uses source phantoms
//      during the visual transfer, then the splice removes source automatically.
//   2. Non-adjacent move (free destination elsewhere) — source stays in place
//      during the op, then onComplete replaces it with free + merges adjacents.
// Active sources prompt for deactivation consent before the move starts. The
// transient `transferring` state during the op reads as "deactivated"; the
// onComplete restore-prior-state path re-activates the moved segment, so the
// user-visible sequence is deactivate → move → reactivate. Inactive sources
// and fs-tools skip the prompt (fs-tools cannot be deactivated).
export function actionMove(
  store: Store<GameState>,
  source: Segment,
  placement: PendingPlacement,
  deps: ActionDeps,
): void {
  const moveTool = getFsTool(store.getState(), 'move');
  if (!moveTool) return;
  const memory = store.getState().memory;
  const resolved = resolvePlacement(memory, placement, source.size);
  if (!resolved) return;
  const { regionSegs, regionStartIdx, regionLen, totalSize, destCol, preSize, postSize } = resolved;

  const sourcePriorState = (source as Segment & { state?: string }).state;
  const needsDeactivation = sourcePriorState !== 'inactive' && source.type !== 'fs-tool';
  if (needsDeactivation) {
    if (!confirm(`Moving "${source.name}" will deactivate it for the duration of the transfer. Continue?`)) {
      return;
    }
  }
  (source as Segment & { operating?: boolean }).operating = true;
  moveTool.state = 'busy';

  const sourceInRegion = regionSegs.includes(source);

  // Direction is determined by absolute addresses. Overlapping forward shifts
  // fill tail-first (memmove); non-overlapping or backward shifts fill head-first.
  const sourceAddr = memAddrOf(memory, source);
  const firstRegionSeg = regionSegs[0]!;
  const regionStartAddr = memAddrOf(memory, firstRegionSeg);
  const destAddr = regionStartAddr + destCol;
  const sourceEndAddr = sourceAddr + source.size;
  const destEndAddr = destAddr + source.size;
  const overlaps = destAddr < sourceEndAddr && sourceAddr < destEndAddr;
  const reverseFill = overlaps && destAddr > sourceAddr;

  // Capture source's screen rects BEFORE splice so phantoms can anchor.
  const preSourceParts = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${source.id}"]`,
  ));
  const preSourcePartData: PartData[] = preSourceParts.map((p) => ({
    rect: p.getBoundingClientRect(),
    partSize: parseInt(p.dataset.partSize ?? '0', 10),
    partOffset: parseInt(p.dataset.partOffset ?? '0', 10),
  }));

  const moved: Segment = structuredClone(source);
  (moved as Segment & { id: string }).id = source.id + '_m' + Date.now();
  (moved as Segment & { state?: string }).state = 'transferring';
  (moved as Segment & { operating?: boolean }).operating = true;

  const insertion: Segment[] = [];
  if (preSize > 0) insertion.push(freeSeg(preSize, 'free-pre'));
  insertion.push(moved);
  if (postSize > 0) insertion.push(freeSeg(postSize, 'free-post'));
  memory.splice(regionStartIdx, regionLen, ...insertion);
  void totalSize;   // captured above; unused after splice
  store.update((d) => { d.ui.memoryRev++; });

  const movedEls = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${moved.id}"]`,
  ));
  if (movedEls.length === 0) return;

  // Shrinkers: in-place uses phantoms (source has been spliced out); non-in-place
  // clips the source's still-rendered DOM directly.
  const shrinkers: OpShrinker[] = sourceInRegion
    ? createSourcePhantoms(source, sourcePriorState, preSourcePartData)
    : Array.from(document.querySelectorAll<HTMLElement>(`.seg[data-id="${source.id}"]`)).map((el) => ({
        el, partSize: parseInt(el.dataset.partSize ?? '0', 10), isPhantom: false,
      }));

  const { x, y } = deps.getCursorXY();
  startOp({
    segId: moved.id,
    fromX: x, fromY: y,
    targetEls: movedEls,
    label: `MOVE · ${source.name}`,
    icon: TOOL_ICONS.move,
    dur: 1600 + source.size * 240,
    reverseFill,
    shrinkers,
    onComplete: () => {
      (moved as Segment & { state?: string }).state = (sourcePriorState as string) || 'intact';
      (moved as Segment & { operating?: boolean }).operating = false;
      // Replace the still-in-place source with free if we didn't splice it out earlier.
      if (!sourceInRegion) {
        const mem = store.getState().memory;
        const srcIdx = mem.indexOf(source);
        if (srcIdx !== -1) {
          mem.splice(srcIdx, 1, freeSeg(source.size, 'free-src'));
          mergeAdjacentFree(mem);
        }
      }
      moveTool.state = 'intact';
      store.update((d) => { d.ui.selectedId = moved.id; });
      store.update((d) => { d.ui.memoryRev++; });
    },
    onCancel: () => {
      (source as Segment & { operating?: boolean }).operating = false;
      const mem = store.getState().memory;
      const movedIdx = mem.indexOf(moved);
      if (movedIdx !== -1) {
        const insertionStart = movedIdx - (preSize > 0 ? 1 : 0);
        const insertionLen = (preSize > 0 ? 1 : 0) + 1 + (postSize > 0 ? 1 : 0);
        mem.splice(insertionStart, insertionLen, ...regionSegs);
        mergeAdjacentFree(mem);
      }
      moveTool.state = 'intact';
      store.update((d) => { d.ui.memoryRev++; });
    },
  });
}

// Copy a segment to a destination. Source remains live throughout (no shrinkers).
// Destination region is one free seg; on completion the copy becomes its own seg
// at the chosen column with free pre/post if any.
export function actionCopy(
  store: Store<GameState>,
  source: Segment,
  placement: PendingPlacement,
  deps: ActionDeps,
): void {
  const copyTool = getFsTool(store.getState(), 'copy');
  if (!copyTool) return;
  const memory = store.getState().memory;
  const resolved = resolvePlacement(memory, placement, source.size);
  if (!resolved) return;
  const { regionSegs, regionStartIdx, regionLen, preSize, postSize } = resolved;

  copyTool.state = 'busy';
  // Lock the source so other tools can't target it while the copy is in flight.
  // isValidTarget rejects any segment with operating=true.
  (source as Segment & { operating?: boolean }).operating = true;

  const copied: Segment = structuredClone(source);
  (copied as Segment & { id: string }).id = source.id + '_c' + Date.now();
  (copied as Segment & { name: string }).name = source.name + '.cp';
  (copied as Segment & { state?: string }).state = 'transferring';
  (copied as Segment & { operating?: boolean }).operating = true;

  const insertion: Segment[] = [];
  if (preSize > 0) insertion.push(freeSeg(preSize, 'free-cpre'));
  insertion.push(copied);
  if (postSize > 0) insertion.push(freeSeg(postSize, 'free-cpost'));
  memory.splice(regionStartIdx, regionLen, ...insertion);
  store.update((d) => { d.ui.memoryRev++; });

  const copiedEls = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${copied.id}"]`,
  ));
  if (copiedEls.length === 0) return;

  const sourcePriorState = (source as Segment & { state?: string }).state;
  const { x, y } = deps.getCursorXY();
  startOp({
    segId: copied.id,
    fromX: x, fromY: y,
    targetEls: copiedEls,
    label: `COPY · ${source.name}`,
    icon: TOOL_ICONS.copy,
    dur: 2000 + source.size * 360,
    onComplete: () => {
      (copied as Segment & { state?: string }).state = sourcePriorState || 'intact';
      (copied as Segment & { operating?: boolean }).operating = false;
      (source as Segment & { operating?: boolean }).operating = false;
      copyTool.state = 'intact';
      store.update((d) => { d.ui.selectedId = copied.id; });
      store.update((d) => { d.ui.memoryRev++; });
    },
    onCancel: () => {
      (source as Segment & { operating?: boolean }).operating = false;
      const mem = store.getState().memory;
      const copiedIdx = mem.indexOf(copied);
      if (copiedIdx !== -1) {
        const insertionStart = copiedIdx - (preSize > 0 ? 1 : 0);
        const insertionLen = (preSize > 0 ? 1 : 0) + 1 + (postSize > 0 ? 1 : 0);
        mem.splice(insertionStart, insertionLen, ...regionSegs);
        mergeAdjacentFree(mem);
      }
      copyTool.state = 'intact';
      store.update((d) => { d.ui.memoryRev++; });
    },
  });
}
