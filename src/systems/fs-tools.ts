// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): only if SCAN's completion needs
// a hook. Others ask by message.
import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { GameState } from '@state/schema';
import type { Store } from '@state/store';
import { getFsTool } from '@state/selectors';
import { registerKeys } from '@systems/input';
import { emit } from '@systems/events';
import { onOpsChange } from '@systems/ops-core';
import { onWorldReset } from '@systems/reset';
import { targetRefusal, isValidTarget, deleteQuestion } from '@systems/tool-targets';
import {
  actionScan, actionRepair, actionDelete, actionMove, actionCopy, actionRefusal, actionSwap,
} from '@state/actions';
import { TOOL_REFUSAL, type ConfirmText, type ToolRefusal } from '@data/tool-text';
import { FS_TOOL_KINDS } from '@data/fs-tools';

// The tool in the player's hand (§3.2): pick a chip up, click a file, the action runs. This
// module owns the hand (ui.activeTool, the move/copy two-click stages), the cursor position and
// the strip's valid/invalid target classes. The rules themselves live in tool-targets.ts and
// the actions in state/actions.ts; a refused click explains itself next to the cursor.

// An inline confirm request (components/hud/InlineConfirm shows it; tests answer it directly). A tool's
// question answers ✓ DELETE / ✗ KEEP; another question names its own answers (BEAM OUT: ✓ BEAM OUT / ✗ STAY).
export interface ConfirmRequest {
  text: ConfirmText;
  answers?: { yes: string; no: string };
  onYes: () => void;
}

export interface ToolDeps {
  ask: (request: ConfirmRequest) => void;
}

// ----- Cursor position tracking -----
// Lives at module scope, not in the store; mousemove fires too often to route through
// subscribers. The op bars dock in from here, the inline confirm opens here and the cursor
// follower sits here.

let lastMouseX = 0;
let lastMouseY = 0;

// The file the held tool was last used on in this tool-held session (reset on every fresh
// pickup). INSPECT shows it while the tool stays in hand, so the scan result and the climbing
// repair are visible where the kid looks; cancelTool selects it when the tool is put down.
let lastAppliedTargetId: string | null = null;

export function getCursorXY(): { x: number; y: number } {
  return { x: lastMouseX, y: lastMouseY };
}

export function getLastAppliedTargetId(): string | null {
  return lastAppliedTargetId;
}

// ----- Placement bridge -----
// The Placement component owns the moving-placeholder DOM; this system owns the cursor, so
// Placement registers updater/clearer callbacks here. One-way: system → component.

type PlacementUpdater = (x: number, y: number) => void;
type PlacementClearer = () => void;
let placementUpdater: PlacementUpdater | null = null;
let placementClearer: PlacementClearer | null = null;

export function setPlacementBridge(updater: PlacementUpdater, clearer: PlacementClearer): void {
  placementUpdater = updater;
  placementClearer = clearer;
}

function refuseTool(reason: string): void {
  emit('refused', { reason, tool: true });
}

// ----- Tool pickup / cancel / apply -----

export function pickUpTool(store: Store<GameState>, kind: FsToolKind): void {
  const state = store.getState();
  const active = state.ui.activeTool;
  // Re-clicking the same chip drops the tool (only at stage 1). Dropping is always allowed.
  if (active && active.kind === kind && !state.ui.pickedSourceId) {
    cancelTool(store);
    return;
  }
  // Pause is look-only (§6.1): nothing new goes into the hand.
  if (state.clock.paused) { refuseTool(TOOL_REFUSAL.paused); return; }
  const tool = getFsTool(state, kind);
  if (!tool) { refuseTool(TOOL_REFUSAL.noTool); return; }
  lastAppliedTargetId = null;
  store.update((draft) => {
    draft.ui.activeTool = { kind, toolSegId: tool.id };
    draft.ui.pickedSourceId = null;
    draft.ui.pendingPlacement = null;
  });
}

export function cancelTool(store: Store<GameState>): void {
  store.update((draft) => {
    // Sidebar fallback chain: an in-flight Move/Copy stage-1 pickedSourceId wins, otherwise
    // the most recent single-click target applied during this session. A second cancel gesture
    // (esc / right-click / empty-space click) then clears the selection.
    const fallback = draft.ui.pickedSourceId ?? lastAppliedTargetId;
    if (fallback && draft.memory.some((seg) => seg.id === fallback)) draft.ui.selectedId = fallback;
    draft.ui.activeTool = null;
    draft.ui.pickedSourceId = null;
    draft.ui.pendingPlacement = null;
  });
  lastAppliedTargetId = null;
  placementClearer?.();
}

// Back to stage 1 with the tool still in hand, so a chain of moves needs no re-pick.
function resetToolStage(store: Store<GameState>): void {
  store.update((draft) => {
    draft.ui.pickedSourceId = null;
    draft.ui.pendingPlacement = null;
  });
  placementClearer?.();
}

// Runs a single-target action on `seg` and remembers it as the file the held tool works on. It is
// remembered BEFORE the action, whose start repaints INSPECT, and forgotten again on a refusal.
function applyTo(seg: Segment, action: () => ToolRefusal | null): void {
  const previous = lastAppliedTargetId;
  lastAppliedTargetId = seg.id;
  if (action() !== null) lastAppliedTargetId = previous;
}

export function applyTool(store: Store<GameState>, seg: Segment, deps: ToolDeps): void {
  const state = store.getState();
  const active = state.ui.activeTool;
  if (!active) return;

  // Single-target tools stay in the hand after applying, so a chain of scans or repairs needs
  // no re-click. Cancel is explicit: chip re-click, Esc or right-click. Their actions check
  // every rule themselves (pause, the target, a free thread) and announce a refusal.
  switch (active.kind) {
    case 'scan': applyTo(seg, () => actionScan(store, seg)); return;
    case 'repair': applyTo(seg, () => actionRepair(store, seg)); return;
    case 'delete': applyTo(seg, () => requestDelete(store, seg, deps)); return;
    case 'swap': applyTo(seg, () => actionSwap(store, seg)); return;
    case 'move':
    case 'copy':
      break;
  }

  // move / copy: the first click picks the source, the second places it. Picking needs no free
  // thread (one may free up before the placement); the placement's action checks everything.
  if (state.clock.paused) { refuseTool(TOOL_REFUSAL.paused); return; }
  const pickedId = state.ui.pickedSourceId;
  const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;
  const refusal = targetRefusal(seg, { state, activeKind: active.kind, pickedSource: picked });
  if (refusal) { refuseTool(refusal); return; }
  if (!picked) {
    store.update((draft) => { draft.ui.pickedSourceId = seg.id; });
    // Prime the placement preview at the cursor so stage 2 has a target ready.
    placementUpdater?.(lastMouseX, lastMouseY);
    return;
  }
  const placement = state.ui.pendingPlacement;
  if (!placement) { refuseTool(TOOL_REFUSAL.noRoom); return; }
  const place = (): ToolRefusal | null => (active.kind === 'move'
    ? actionMove(store, picked, placement)
    : actionCopy(store, picked, placement));
  // A refused placement (no free thread, no room) keeps the picked source: the next click on a
  // destination tries again without re-picking it.
  applyTo(picked, () => {
    const placeRefusal = place();
    if (placeRefusal === null) resetToolStage(store);
    return placeRefusal;
  });
}

// Deletes a file, asking first through the inline confirm when it can't be undone (§6.5:
// REPAIR CHARGE, ship files, the last copy of a tool). A delete that would be refused (paused,
// the target rules, no free thread …) is refused at once, never after the question; the action
// re-checks everything when the answer is yes. Returns the refusal, or null when it asked or
// started.
export function requestDelete(store: Store<GameState>, seg: Segment, deps: ToolDeps): ToolRefusal | null {
  const state = store.getState();
  const refusal = actionRefusal(state, 'delete', seg);
  if (refusal) { refuseTool(refusal); return refusal; }
  const question = deleteQuestion(state, seg);
  if (question) {
    deps.ask({ text: question, onYes: () => { actionDelete(store, seg); } });
    return null;
  }
  return actionDelete(store, seg);
}

// After memory changes, the hand must still hold a real tool: when the held copy's file is gone
// (deleted, or the move that renamed it finished) the best usable copy takes over, and with no
// usable copy left the tool is dropped (§9 WP3: a thread freed or a file lost while a tool is
// held never leaves a stale hand).
function syncHeldTool(store: Store<GameState>): void {
  const state = store.getState();
  const active = state.ui.activeTool;
  if (!active) return;
  const best = getFsTool(state, active.kind);
  if (!best) { cancelTool(store); return; }
  const heldStillLive = state.memory.some((seg) => seg.id === active.toolSegId && seg.type === 'fs-tool');
  if (!heldStillLive) store.update((draft) => { draft.ui.activeTool = { kind: active.kind, toolSegId: best.id }; });
}

// DOM-free, so headless harnesses mount it too. Deferred: a memory change arrives inside the
// store's fan-out, and the sync may update. It also owns the hand's module state across a world
// reset: the file the tool was last used on belongs to the old ship's memory.
export function mountHeldToolSync(store: Store<GameState>): () => void {
  const unsub = store.subscribe((s) => s.ui.memoryRev, () => queueMicrotask(() => syncHeldTool(store)));
  const offReset = onWorldReset('fs-tools-hand', () => { lastAppliedTargetId = null; }, () => ({ lastAppliedTargetId }));
  return () => { unsub(); offReset(); };
}

// ----- Subscriber: target classes -----
// Maintains .valid-target / .invalid-target / .picked-source on .seg elements. Repaints on every
// store notify (memory mutations reshape validity and MemoryStrip's rebuild replaces the
// elements) and when an op starts or ends (a busy file or REPAIR CHARGE in use).

function paintTargetClasses(state: GameState): void {
  const tool = state.ui.activeTool;
  const pickedId = state.ui.pickedSourceId;
  const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;

  document.querySelectorAll<HTMLElement>('.seg').forEach((element) => {
    element.classList.remove('valid-target', 'invalid-target', 'picked-source');
    if (!tool) return;
    const id = element.dataset.id;
    const seg = id ? state.memory.find((m) => m.id === id) : null;
    if (!seg) return;
    const valid = isValidTarget(seg, { state, activeKind: tool.kind, pickedSource: picked });
    element.classList.add(valid ? 'valid-target' : 'invalid-target');
    if (pickedId && id === pickedId) element.classList.add('picked-source');
  });
}

export function mountTargetClasses(store: Store<GameState>): () => void {
  paintTargetClasses(store.getState());
  const unsub = store.subscribe((s) => s, (s) => paintTargetClasses(s), () => false);
  const offOps = onOpsChange((change) => {
    if (change.type !== 'progress') paintTargetClasses(store.getState());
  });
  return () => { unsub(); offOps(); };
}

// ----- Subscriber: body class reflector -----
// Mirrors state.ui.activeTool onto body classes + the FS-chip .picked class.

function paintBodyClasses(active: GameState['ui']['activeTool']): void {
  document.body.classList.toggle('tool-active', !!active);
  FS_TOOL_KINDS.forEach((kind) => {
    document.body.classList.toggle(`tool-${kind}`, active?.kind === kind);
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
// Wires global handlers (mousemove, ESC, contextmenu, FS-chip clicks) and the visual
// subscribers (target classes, body classes). Returns a teardown.

export function mountFsToolsSystem(store: Store<GameState>): () => void {
  const unsubTargets = mountTargetClasses(store);
  const unsubBody = mountBodyClassReflector(store);
  const unsubHeld = mountHeldToolSync(store);

  // Remembers the cursor (the follower places itself from it: components/cursor-follower) and
  // moves the placement preview.
  const onMouseMove = (event: MouseEvent): void => {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    const state = store.getState();
    if (!state.ui.activeTool) return;
    if (state.ui.pickedSourceId &&
        (state.ui.activeTool.kind === 'move' || state.ui.activeTool.kind === 'copy')) {
      placementUpdater?.(event.clientX, event.clientY);
    }
  };
  document.addEventListener('mousemove', onMouseMove);

  // Escape and right-click cascade: first dismiss the active tool, then clear the lingering
  // selection. Registered through the input router (one keyboard owner, modal-aware: while the
  // inline confirm is open, Esc answers it and the tool stays in hand).
  const offEscape = registerKeys({
    layer: 'game',
    codes: ['Escape'],
    onDown: () => {
      const state = store.getState();
      if (state.ui.activeTool) { cancelTool(store); return; }
      if (state.ui.selectedId) store.update((draft) => { draft.ui.selectedId = null; });
    },
  });

  const onContextMenu = (event: MouseEvent): void => {
    const state = store.getState();
    if (state.ui.activeTool) {
      event.preventDefault();
      cancelTool(store);
      return;
    }
    if (state.ui.selectedId) {
      event.preventDefault();
      store.update((draft) => { draft.ui.selectedId = null; });
    }
  };
  window.addEventListener('contextmenu', onContextMenu);

  const chipHandlers: Array<{ element: HTMLElement; fn: () => void }> = [];
  document.querySelectorAll<HTMLElement>('.fs-tool-chip.clickable').forEach((chip) => {
    const fn = (): void => {
      const kind = chip.dataset.fs as FsToolKind | undefined;
      if (!kind) return;
      pickUpTool(store, kind);
    };
    chip.addEventListener('click', fn);
    chipHandlers.push({ element: chip, fn });
  });

  return () => {
    document.removeEventListener('mousemove', onMouseMove);
    offEscape();
    window.removeEventListener('contextmenu', onContextMenu);
    chipHandlers.forEach(({ element, fn }) => element.removeEventListener('click', fn));
    unsubTargets();
    unsubBody();
    unsubHeld();
  };
}
