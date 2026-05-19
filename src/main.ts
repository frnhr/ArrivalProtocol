// Style import order matters: tokens first so modes can override them.
import './styles/tokens.css';
import './styles/modes.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/glitch.css';
import './styles/legacy-components.css';

import { store } from '@state/instance';
import type { Segment } from '@/types/segment';
import { mountGlitchDriver } from '@systems/glitch';
import { mountClock } from '@systems/clock';
import { mountModeToggle } from '@components/dock/ModeToggle';
import { mountDockItems } from '@components/dock/Dock';
import { mountSidebarFilters } from '@components/dock/SidebarFilters';
import { mountTimeControls } from '@components/header/TimeControls';
import { mountAllWindows } from '@components/window/Window';
import { mountEngineWindow } from '@components/tools-view/EngineWindow';
import { mountWindowGrips } from '@components/tools-view/WindowGrip';
import { mountMemoryStats } from '@components/memory-view/MemoryStats';
import { mountFooter } from '@components/footer/Footer';
import { mountFsToolsSystem, applyTool, getCursorXY, pickUpTool } from '@systems/fs-tools';
import { mountCursorFollower } from '@components/cursor-follower/CursorFollower';
import { mountMemoryStrip } from '@components/memory-view/MemoryStrip';
import { mountSelectionHighlight } from '@components/memory-view/SelectionHighlight';
import { mountDimPainter } from '@components/memory-view/DimPainter';
import { mountDetailPanel, type DetailActionId } from '@components/memory-view/DetailPanel';
import { mountSplitOverlay } from '@components/memory-view/SplitOverlay';
import { mountPlacement } from '@components/memory-view/Placement';
import { mountFsStatusBar } from '@components/memory-view/FsStatusBar';
import {
  actionScan, actionSwap, actionActivate, actionDeleteRedundancy,
  actionRepair, type ActionDeps,
} from '@state/actions';

// Cursor position is module-local in fs-tools (mousemove writes; everything else reads).
// pickFsTool is the bridge that lets actionActivate meta-pick-up an fs-tool
// when Activate is applied to an fs-tool segment in memory.
const actionDeps: ActionDeps = {
  getCursorXY,
  pickFsTool: (kind) => pickUpTool(store, kind),
};

// DetailPanel action buttons dispatch through this. The fs-tools system
// invokes individual action functions directly via applyTool.
function runAction(seg: Segment, action: DetailActionId): void {
  if (action === 'repair') actionRepair(store, seg, actionDeps);
  else if (action === 'swap' && seg.type === 'ship') actionSwap(store, seg, actionDeps);
  else if (action === 'activate' && seg.type === 'ship-backup') actionActivate(store, seg, actionDeps);
  else if (action === 'delete_redund') actionDeleteRedundancy(store, actionDeps);
  else if (action === 'scan') actionScan(store, seg, actionDeps);
}

mountGlitchDriver(store);
mountClock(store);
mountModeToggle();
mountDockItems();
mountTimeControls(store);
mountAllWindows();
mountEngineWindow();
mountWindowGrips(store);

// SplitOverlay handle is needed by segBehavior, so mount it before MemoryStrip.
const memWrap = document.getElementById('memWrap');
if (!memWrap) throw new Error('memWrap container missing from DOM');
const splitOverlay = mountSplitOverlay(memWrap);

// Click decides apply-vs-select; hover drives split-overlay. Placement updates
// flow through the fs-tools system's mousemove → placement bridge.
const segBehavior = {
  onClick: (seg: Segment, ev: MouseEvent): void => {
    if (store.getState().ui.activeTool) {
      ev.stopPropagation();
      applyTool(store, seg, actionDeps);
    } else {
      // Toggle: clicking the currently-selected segment deselects.
      const alreadySelected = store.getState().ui.selectedId === seg.id;
      store.update((d) => { d.ui.selectedId = alreadySelected ? null : seg.id; });
    }
  },
  onMouseEnter: (seg: Segment, el: HTMLElement): void => {
    const totalParts = parseInt(el.dataset.totalParts ?? '1', 10);
    const partIdx = parseInt(el.dataset.partIdx ?? '0', 10);
    if (totalParts > 1 && partIdx === 0 && seg.type !== 'free') splitOverlay.show(seg);
  },
  onMouseLeave: (seg: Segment): void => splitOverlay.hide(seg.id),
};

// Click on background area of memWrap (address labels, empty space below rows)
// deselects. Clicks on .seg elements bubble through, but closest() finds the
// seg and we ignore them — the seg's own handler already ran.
memWrap.addEventListener('click', (ev) => {
  if (store.getState().ui.activeTool) return;
  if ((ev.target as HTMLElement).closest('.seg')) return;
  if (store.getState().ui.selectedId === null) return;
  store.update((d) => { d.ui.selectedId = null; });
});

// Mount order matters for store-notify cascade:
//   1. MemoryStrip rebuilds DOM (always-false equals → fires every notify)
//   2. SelectionHighlight + fs-tools target classes repaint .seg classes
//      (must subscribe AFTER MemoryStrip so they run after the rebuild)
//   3. DetailPanel, MemoryStats, FsStatusBar, Footer — independent of .seg classes
mountMemoryStrip(store, memWrap, segBehavior);
mountFsToolsSystem(store);
mountSelectionHighlight(store);
mountDimPainter(store);
mountCursorFollower(store);
mountDetailPanel(store, { onAction: runAction });
mountMemoryStats(store);
mountFsStatusBar(store);
mountSidebarFilters(store);
mountFooter(store);
mountPlacement(store, memWrap);

// Initial selection.
const engine = store.getState().memory.find((m) => m.id === 'engine');
if (engine) store.update((d) => { d.ui.selectedId = engine.id; });
