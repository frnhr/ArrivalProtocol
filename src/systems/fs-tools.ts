import type { Segment, FsToolSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { getRedundancy } from '@state/selectors';
import type { GameState } from '@state/schema';
import type { Store } from '@state/store';
import {
  actionScan, actionRepair, actionDelete, actionMove, actionCopy,
  actionActivate, actionDeactivate, isRedundancyBusy,
  type ActionDeps,
} from '@state/actions';

export interface MoveRegion {
  startIdx: number;
  endIdx: number;
  segs: Segment[];
  totalSize: number;
}

// For move: source plus any contiguous free blocks on either side form the
// candidate placement region. This lets a file slide into adjacent free space,
// including overlapping its current footprint.
export function computeMoveRegion(memory: Segment[], source: Segment): MoveRegion | null {
  const srcIdx = memory.indexOf(source);
  if (srcIdx === -1) return null;
  let startIdx = srcIdx;
  while (startIdx > 0 && memory[startIdx - 1]?.type === 'free') startIdx--;
  let endIdx = srcIdx;
  while (endIdx < memory.length - 1 && memory[endIdx + 1]?.type === 'free') endIdx++;
  const segs = memory.slice(startIdx, endIdx + 1);
  const totalSize = segs.reduce((s, m) => s + m.size, 0);
  return { startIdx, endIdx, segs, totalSize };
}

export interface ValidTargetContext {
  state: GameState;
  activeKind: FsToolKind;
  pickedSource: Segment | null;
}

// Resolves the effective version for the currently-active tool kind: the
// highest version among all healthy copies of that kind, NOT just the one
// segment that was picked up. This avoids the gotcha where a player picks
// up Repair (then v1) and later bumps Repair.bak to v2 — the player gets
// the upgrade without re-picking the chip.
function getActiveToolVersion(state: GameState): number {
  const active = state.ui.activeTool;
  if (!active) return 1;
  let max = 1;
  for (const m of state.memory) {
    if (m.type !== 'fs-tool' || m.fsTool !== active.kind || m.integrity <= 50) continue;
    if (m.version > max) max = m.version;
  }
  return max;
}

// Determines whether a given segment is a valid target for the currently active tool.
// Pure logic; reads only memory + active-tool snapshot, no DOM, no mutation.
export function isValidTarget(seg: Segment, ctx: ValidTargetContext): boolean {
  const { state, activeKind, pickedSource } = ctx;
  const memory = state.memory;
  if ((seg as { operating?: boolean }).operating) return false;
  const segState = 'state' in seg ? seg.state : undefined;

  if (activeKind === 'scan') {
    // Any segment that has a `scanned` field is scannable — re-scanning a
    // previously-scanned file refreshes its readouts (will matter once files
    // start degrading progressively). Concurrent operations on the same target
    // are blocked by the `operating` check above.
    return 'scanned' in seg;
  }
  if (activeKind === 'repair') {
    // Repair v2+ adds the Redundancy segment as a valid target — compacts it
    // by reclaiming the wasted blocks (size − used) as free space. No scan
    // required; redundancy state is always known to the player. The op is
    // permitted even when size == used (nothing to reclaim) — it plays the
    // animation and no-ops on completion, mirroring how Repair on a fully
    // intact file would behave. While ANY repair / compact is in flight the
    // pool is locked so a fresh attempt isn't allowed to interleave.
    if (seg.type === 'redundancy') {
      if (isRedundancyBusy()) return false;
      const ver = getActiveToolVersion(state);
      return ver >= 2;
    }
    // Repair targets must be scanned — otherwise targeting them would leak the
    // very damage info the player has yet to discover.
    const isScannedDamage =
      'scanned' in seg && seg.scanned === true &&
      (segState === 'corrupt' || segState === 'partial') &&
      (seg.type === 'tool' || seg.type === 'skill' || seg.type === 'fs-tool' || seg.type === 'core');
    if (!isScannedDamage) return false;
    const integrity = 'integrity' in seg ? seg.integrity : 0;
    const redund = getRedundancy(state);
    const cost = Math.ceil(((100 - integrity) / 100) * seg.size * 2);
    return !!redund && redund.used >= cost;
  }
  if (activeKind === 'delete') {
    if (seg.type === 'core' || seg.type === 'free') return false;
    if (segState === 'offline' || segState === 'repairing' ||
        segState === 'transferring' || segState === 'busy') return false;
    return true;
  }
  if (activeKind === 'activate' || activeKind === 'deactivate') {
    // FS-tool targets: only valid for Activate, and act as a meta-pickup of
    // that fs-tool (same as clicking the chip). FS-tools cannot be
    // deactivated. Gate matches pickUpTool's own integrity/state checks so
    // invalid-target classes line up with what would actually happen.
    if (seg.type === 'fs-tool') {
      if (activeKind === 'deactivate') return false;
      return seg.integrity > 50;
    }
    const togglable = seg.type === 'tool' || seg.type === 'skill' ||
                      seg.type === 'ship' || seg.type === 'ship-backup' ||
                      seg.type === 'core';
    if (!togglable) return false;
    if (segState === 'transferring' ||
        segState === 'repairing' || segState === 'offline') return false;
    if (activeKind === 'activate') return segState === 'inactive';
    // deactivate: anything currently not inactive
    return segState !== 'inactive';
  }
  if (activeKind === 'move' || activeKind === 'copy') {
    if (!pickedSource) {
      // Stage 1: pick source
      if (seg.type === 'free' || seg.type === 'encrypted') return false;
      if (seg.type === 'core') return false;
      if (segState === 'offline' || segState === 'repairing' ||
          segState === 'transferring' || segState === 'busy') return false;
      return true;
    }
    if (activeKind === 'move') {
      // Move accepts EITHER an in-region slide (source + adjacent free, allowing
      // partial overlap of the source's current footprint) OR any non-adjacent
      // free segment of sufficient size.
      const region = computeMoveRegion(memory, pickedSource);
      if (region && region.totalSize >= pickedSource.size && region.segs.includes(seg)) {
        return true;
      }
      return seg.type === 'free' && seg.size >= pickedSource.size && seg.id !== pickedSource.id;
    }
    // copy
    return seg.type === 'free' && seg.size >= pickedSource.size && seg.id !== pickedSource.id;
  }
  return false;
}

// ----- Cursor position tracking -----
// Lives at module scope, not in the store; mousemove fires too often to route
// through subscribers. Actions read this via getCursorXY for op docking anchor.

let lastMouseX = 0;
let lastMouseY = 0;

export function getCursorXY(): { x: number; y: number } {
  return { x: lastMouseX, y: lastMouseY };
}

// ----- Placement bridge -----
// The Placement component (@components/memory-view/Placement.ts) owns the
// moving-placeholder DOM. The fs-tools system owns the cursor/event pipeline,
// so Placement registers updater/clearer callbacks here and the system fires
// them from mousemove and cancel paths. One-way: system → component.

type PlacementUpdater = (x: number, y: number) => void;
type PlacementClearer = () => void;
let placementUpdater: PlacementUpdater | null = null;
let placementClearer: PlacementClearer | null = null;

export function setPlacementBridge(
  updater: PlacementUpdater,
  clearer: PlacementClearer,
): void {
  placementUpdater = updater;
  placementClearer = clearer;
}

// ----- Tool pickup / cancel / apply -----

export function pickUpTool(store: Store<GameState>, kind: FsToolKind): void {
  const state = store.getState();
  const active = state.ui.activeTool;
  // Re-clicking the same chip cancels (only at stage 1)
  if (active && active.kind === kind && !state.ui.pickedSourceId) {
    cancelTool(store);
    return;
  }
  // Pick the highest-version healthy copy. Identical to getFsTool's
  // selection — kept inline here to avoid coupling pickup logic to the
  // selector module.
  let tool: FsToolSegment | undefined;
  for (const m of state.memory) {
    if (m.type !== 'fs-tool' || m.fsTool !== kind || m.integrity <= 50) continue;
    if (!tool || m.version > tool.version) tool = m;
  }
  if (!tool) return;
  store.update((d) => {
    d.ui.activeTool = { kind, toolSegId: tool!.id };
    d.ui.pickedSourceId = null;
    d.ui.pendingPlacement = null;
  });
}

export function cancelTool(store: Store<GameState>): void {
  store.update((d) => {
    d.ui.activeTool = null;
    d.ui.pickedSourceId = null;
    d.ui.pendingPlacement = null;
  });
  // Placement-preview DOM cleanup — fires the bridge clearer.
  placementClearer?.();
}

// Reset stage-1/2 state but keep the tool in hand so the player can apply it
// again in quick succession. Used after every successful apply — the only way
// out is now an explicit cancel (chip click, ESC, right-click).
function resetToolStage(store: Store<GameState>): void {
  store.update((d) => {
    d.ui.pickedSourceId = null;
    d.ui.pendingPlacement = null;
  });
  placementClearer?.();
}

export function applyTool(
  store: Store<GameState>,
  seg: Segment,
  deps: ActionDeps,
): void {
  const state = store.getState();
  const active = state.ui.activeTool;
  if (!active) return;
  const pickedId = state.ui.pickedSourceId;
  const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;
  if (!isValidTarget(seg, { state, activeKind: active.kind, pickedSource: picked })) return;

  // Single-target tools: stay in the player's hand after applying so a chain
  // of similar ops (scan three files in a row, repair multiple, etc.) doesn't
  // require re-clicking the chip each time. Cancel is explicit: chip re-click,
  // Esc, or right-click.
  if (active.kind === 'scan') {
    actionScan(store, seg, deps);
    return;
  }
  if (active.kind === 'repair') {
    actionRepair(store, seg, deps);
    return;
  }
  if (active.kind === 'delete') {
    actionDelete(store, seg, deps);
    return;
  }
  if (active.kind === 'activate') {
    actionActivate(store, seg, deps);
    return;
  }
  if (active.kind === 'deactivate') {
    actionDeactivate(store, seg, deps);
    return;
  }

  // move / copy
  if (!picked) {
    store.update((d) => { d.ui.pickedSourceId = seg.id; });
    // Prime placement preview at current cursor so stage 2 has a target ready.
    placementUpdater?.(lastMouseX, lastMouseY);
    return;
  }
  const placement = state.ui.pendingPlacement;
  if (!placement) { cancelTool(store); return; }
  if (active.kind === 'move') actionMove(store, picked, placement, deps);
  else actionCopy(store, picked, placement, deps);
  // Keep the tool in hand; reset back to stage-1 (next click picks a new source).
  resetToolStage(store);
}

// ----- Subscriber: target classes -----
// Maintains .valid-target / .invalid-target / .picked-source on .seg elements.
// Repaints on every store notify since memory mutations also reshape which
// targets are valid, and MemoryStrip's full re-render replaces the elements.

function paintTargetClasses(state: GameState): void {
  const tool = state.ui.activeTool;
  const pickedId = state.ui.pickedSourceId;
  const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;

  document.querySelectorAll<HTMLElement>('.seg').forEach((el) => {
    el.classList.remove('valid-target', 'invalid-target', 'picked-source');
    if (!tool) return;
    const id = el.dataset.id;
    const seg = id ? state.memory.find((m) => m.id === id) : null;
    if (!seg) return;
    const valid = isValidTarget(seg, {
      state, activeKind: tool.kind, pickedSource: picked,
    });
    el.classList.add(valid ? 'valid-target' : 'invalid-target');
    if (pickedId && id === pickedId) el.classList.add('picked-source');
  });
}

export function mountTargetClasses(store: Store<GameState>): () => void {
  paintTargetClasses(store.getState());
  return store.subscribe((s) => s, (s) => paintTargetClasses(s), () => false);
}

// ----- Subscriber: body class reflector -----
// Mirrors state.ui.activeTool onto body classes + the FS-chip .picked class.

const TOOL_KINDS: readonly FsToolKind[] = ['scan', 'repair', 'move', 'copy', 'delete', 'activate', 'deactivate'];

function paintBodyClasses(active: GameState['ui']['activeTool']): void {
  document.body.classList.toggle('tool-active', !!active);
  TOOL_KINDS.forEach((k) => {
    document.body.classList.toggle(`tool-${k}`, active?.kind === k);
  });
  document.querySelectorAll<HTMLElement>('.fs-tool-chip').forEach((chip) => {
    chip.classList.toggle('picked', !!active && chip.dataset.fs === active.kind);
  });
}

export function mountBodyClassReflector(store: Store<GameState>): () => void {
  paintBodyClasses(store.getState().ui.activeTool);
  return store.subscribe(
    (s) => s.ui.activeTool,
    (a) => paintBodyClasses(a),
  );
}

// ----- System mount -----
// Wires global handlers (mousemove, ESC, contextmenu, FS-chip clicks) and the
// visual subscribers (target classes, body classes). Returns a teardown.

export function mountFsToolsSystem(store: Store<GameState>): () => void {
  const unsubTargets = mountTargetClasses(store);
  const unsubBody = mountBodyClassReflector(store);

  const follower = document.getElementById('cursorFollower');

  const onMouseMove = (e: MouseEvent): void => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    const state = store.getState();
    if (!state.ui.activeTool) return;
    if (follower) {
      follower.style.left = e.clientX + 'px';
      follower.style.top = e.clientY + 'px';
    }
    if (state.ui.pickedSourceId &&
        (state.ui.activeTool.kind === 'move' || state.ui.activeTool.kind === 'copy')) {
      placementUpdater?.(e.clientX, e.clientY);
    }
  };
  document.addEventListener('mousemove', onMouseMove);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && store.getState().ui.activeTool) cancelTool(store);
  };
  window.addEventListener('keydown', onKeyDown);

  const onContextMenu = (e: MouseEvent): void => {
    if (store.getState().ui.activeTool) {
      e.preventDefault();
      cancelTool(store);
    }
  };
  window.addEventListener('contextmenu', onContextMenu);

  const chipHandlers: Array<{ el: HTMLElement; fn: () => void }> = [];
  document.querySelectorAll<HTMLElement>('.fs-tool-chip.clickable').forEach((chip) => {
    const fn = (): void => {
      if (chip.classList.contains('bad')) return;
      const kind = chip.dataset.fs as FsToolKind | undefined;
      if (!kind) return;
      pickUpTool(store, kind);
    };
    chip.addEventListener('click', fn);
    chipHandlers.push({ el: chip, fn });
  });

  return () => {
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('contextmenu', onContextMenu);
    chipHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn));
    unsubTargets();
    unsubBody();
  };
}
