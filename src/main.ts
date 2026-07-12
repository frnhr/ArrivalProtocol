// Style import order matters: tokens first so modes can override them.
import './styles/tokens.css';
import './styles/modes.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/glitch.css';
import './styles/legacy-components.css';
import './styles/responsive.css';
import './styles/terminal.css';

import { store } from '@state/instance';
import type { Segment } from '@/types/segment';
import { mountGlitchDriver } from '@systems/glitch';
import { mountClock } from '@systems/clock';
import { mountOrbitSim } from '@systems/orbit-sim';
import { mountModeToggle } from '@components/dock/ModeToggle';
import { mountDockItems } from '@components/dock/Dock';
import { mountSidebarFilters } from '@components/dock/SidebarFilters';
import { mountTimeControls } from '@components/header/TimeControls';
import { mountAllWindows } from '@components/window/Window';
import { mountEngineWindow } from '@components/tools-view/EngineWindow';
import { mountNavPlotWindow } from '@components/tools-view/NavPlotWindow';
import { mountToolsTabs } from '@components/tools-view/ToolsTabs';
import { mountWindowGrips } from '@components/tools-view/WindowGrip';
import { mountMemoryStats } from '@components/memory-view/MemoryStats';
import { mountFooter } from '@components/footer/Footer';
import { mountBurnResult } from '@components/burn/BurnResult';
import { mountBriefing } from '@components/briefing/Briefing';
import { mountTerminal } from '@components/terminal/Terminal';
import { mountAssistant } from '@components/assistant/Assistant';
import { mountEvolution } from '@systems/evolution';
import { mountFsToolsSystem, applyTool, getCursorXY, pickUpTool } from '@systems/fs-tools';
import { mountCursorFollower } from '@components/cursor-follower/CursorFollower';
import { mountMemoryStrip } from '@components/memory-view/MemoryStrip';
import { mountSelectionHighlight } from '@components/memory-view/SelectionHighlight';
import { mountDimPainter } from '@components/memory-view/DimPainter';
import { mountDetailPanel, type DetailActionId } from '@components/memory-view/DetailPanel';
import { mountSplitOverlay } from '@components/memory-view/SplitOverlay';
import { mountPlacement } from '@components/memory-view/Placement';
import { mountFsStatusBar } from '@components/memory-view/FsStatusBar';
import { mountMobileDrawers } from '@components/memory-view/MobileDrawers';
import { mountFsToolPill } from '@components/memory-view/FsToolPill';
import { setCoresCapacity, onOpLoadChange, getActiveOpCount } from '@systems/ops';
import { getAiCore } from '@state/selectors';
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
mountOrbitSim(store);
mountModeToggle();
mountDockItems();
mountTimeControls(store);
mountAllWindows();
mountToolsTabs();
mountEngineWindow(store);
mountNavPlotWindow(store);
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
mountMobileDrawers();
mountFsToolPill(store);
mountSidebarFilters(store);
mountFooter(store);
mountBurnResult(store);
// Terminal mounts BEFORE Briefing so its burn.status subscription is live when a
// terminal-kernel level auto-begins the run. Evolution gates which graphical windows
// exist before either runs.
mountTerminal(store);
mountAssistant(store);
mountEvolution(store);
mountBriefing(store);
mountPlacement(store, memWrap);

// Wire the AI Core's `capacity` into the ops engine's hard cap. Re-sync on
// every store change so future damage/upgrade paths flow through automatically.
// If the Core is somehow missing, cap drops to 0 and no new ops can start.
function syncCoreCapacity(): void {
  const core = getAiCore(store.getState());
  setCoresCapacity(core ? core.capacity : 0);
}
syncCoreCapacity();
store.subscribe((s) => s, syncCoreCapacity, () => false);

// Repaint the AI Core's thread-dot row in real time as ops start/finish.
// Walks the Core's already-rendered DOM so the memory strip doesn't rebuild
// — that would interrupt clicks and tank in-flight ops.
function paintCoreThreads(): void {
  const core = getAiCore(store.getState());
  if (!core) return;
  const inUse = getActiveOpCount();
  const parts = Array.from(document.querySelectorAll<HTMLElement>(
    `.seg[data-id="${core.id}"]`,
  ));
  parts.forEach((el) => {
    const row = el.querySelector<HTMLElement>('[data-threads]');
    if (!row) return;
    const dots = row.querySelectorAll<HTMLElement>('.thread-dot');
    // Capacity may have changed (demo slider, future upgrades) — rebuild the
    // dot row when its length doesn't match. Otherwise just toggle .lit.
    if (dots.length !== core.capacity) {
      const dotsHtml: string[] = [];
      for (let i = 0; i < core.capacity; i++) {
        dotsHtml.push(`<span class="thread-dot${i < inUse ? ' lit' : ''}"></span>`);
      }
      row.innerHTML = dotsHtml.join('') + `<span class="thread-count">${inUse}/${core.capacity}</span>`;
      return;
    }
    dots.forEach((dot, i) => dot.classList.toggle('lit', i < inUse));
    const count = row.querySelector<HTMLElement>('.thread-count');
    if (count) count.textContent = `${inUse}/${core.capacity}`;
  });
}
onOpLoadChange(paintCoreThreads);

// Mirror the active selection in the mobile inspect drawer header. Resolves
// the name from store state for picked sources / tool segments first so it
// matches what the detail panel actually renders. Empty string when nothing
// is being inspected (renders nothing on desktop; collapsed header on mobile).
function paintInspectSubtitle(): void {
  const el = document.getElementById('inspectSubtitle');
  if (!el) return;
  const state = store.getState();
  const activeTool = state.ui.activeTool;
  let name = '';
  if (activeTool) {
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? state.memory.find((m) => m.id === pickedId) : null;
    const toolSeg = state.memory.find((m) => m.id === activeTool.toolSegId);
    name = picked?.name ?? toolSeg?.name ?? '';
  } else if (state.ui.selectedId) {
    const seg = state.memory.find((m) => m.id === state.ui.selectedId);
    name = seg?.name ?? '';
  }
  el.textContent = name ? `— ${name}` : '';
}

// Initial selection.
const engine = store.getState().memory.find((m) => m.id === 'engine');
if (engine) store.update((d) => { d.ui.selectedId = engine.id; });

paintInspectSubtitle();
store.subscribe((s) => s, paintInspectSubtitle, () => false);

// Dev-only: expose the store for in-browser probing / Playwright assertions.
if (import.meta.env.DEV) {
  (window as unknown as { __store?: typeof store }).__store = store;
}
