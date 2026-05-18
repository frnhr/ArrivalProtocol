// @ts-nocheck
// Step 3 of refactor: TS-ified but unchanged behavior. Strict typing happens in later steps.
// Step 4: game data and constants now live in @data/. Behavior remains identical.
// Step 6: the legacy `memory` array is now the same reference as store.getState().memory.
// Mutations made here are visible to anything that reads via the store. We call
// store.notify() at the end of render() so subscribers get re-evaluated.
// Step 14e: fs-tool state machine + cursor follower + global handlers moved to
// @systems/fs-tools.ts. What remains here: render() pipeline + segBehavior closure,
// runAction dispatcher, split-overlay, placement preview, repair.bak chip.

import { store } from '@state/instance';
import { renderMemoryStrip } from '@components/memory-view/MemoryStrip';
import { renderSegmentPart } from '@components/memory-view/SegmentBlock';
import { mountDetailPanel } from '@components/memory-view/DetailPanel';
import { mountSelectionHighlight } from '@components/memory-view/SelectionHighlight';
import { updateFsChips as updateFsChipsExt } from '@components/memory-view/FsStatusBar';
import {
  computeMoveRegion as computeMoveRegionExt,
  applyTool,
  getCursorXY,
  setPlacementBridge,
} from '@systems/fs-tools';
import { getActiveOp } from '@systems/ops';
import { actionScan, actionSwap, actionActivate, actionDeleteRedundancy, actionRepair, actionDelete } from '@state/actions';

  const memory = store.getState().memory;

  // ===== Rendering =====
  const memWrap = document.getElementById('memWrap');

  // segBehavior is consumed by MemoryStrip when it builds segment parts.
  // Click decides: tool-apply (when a tool is active) or selection update.
  const segBehavior = {
    onClick: (s, ev) => {
      if (store.getState().ui.activeTool) {
        ev.stopPropagation();
        applyTool(store, s, actionDeps);
      } else {
        store.update(d => { d.ui.selectedId = s.id; });
      }
    },
    onMouseEnter: (s, el) => onSegHover(s, el),
    onMouseLeave: (s, el) => onSegLeave(s, el),
  };

  function render() {
    renderMemoryStrip(memWrap, memory, segBehavior);
    updateFsChips();
    // Re-evaluate selectors for anything subscribed to the store. Legacy mutates
    // `memory` (which IS store.getState().memory) in place, so subscribers need a
    // manual nudge here — until each subsystem owns its mutations via store.update().
    store.notify();
  }

  // Thin wrapper used by showSplitOverlay to render an unbroken preview.
  function renderSegPart(s, partSize, partIdx, totalParts, partOffset) {
    return renderSegmentPart(s, { partSize, partIdx, totalParts, partOffset }, segBehavior);
  }

  // ===== Actions =====
  // runAction is the dispatcher invoked by DetailPanel's action buttons. The
  // fs-tools system invokes individual action functions directly via applyTool.
  function runAction(s, action) {
    if (action === 'repair') actionRepair(store, s, actionDeps);
    else if (action === 'swap') actionSwap(store, s, actionDeps);
    else if (action === 'activate') actionActivate(store, s, actionDeps);
    else if (action === 'delete_redund') actionDeleteRedundancy(store, actionDeps);
    else if (action === 'scan') actionScan(store, s, actionDeps);
    else if (action === 'rm') actionDelete(store, s, actionDeps);
  }

  // Transitional callback bag. Once MemoryStrip becomes a subscriber (14g),
  // rerender disappears and actions just call store.notify().
  const actionDeps = {
    rerender: () => render(),
    getCursorXY,
  };

  // ===== Hover handlers — feed into split overlay and placement preview =====

  function onSegHover(s, el) {
    const totalParts = parseInt(el.dataset.totalParts) || 1;
    const partIdx = parseInt(el.dataset.partIdx) || 0;
    if (totalParts > 1 && partIdx === 0 && s.type !== 'free') showSplitOverlay(s);

    const state = store.getState();
    const active = state.ui.activeTool;
    if (!active) return;
    // Stage 2 of move/copy: keep the placeholder following the cursor.
    if (state.ui.pickedSourceId && (active.kind === 'move' || active.kind === 'copy')) {
      const { x, y } = getCursorXY();
      updatePlaceholderAt(x, y);
    }
  }

  function onSegLeave(s, _el) {
    hideSplitOverlay(s.id);
  }

  // ===== Movable destination placeholder (move/copy stage 2) =====
  // Writes the chosen placement into state.ui.pendingPlacement; the fs-tools
  // system reads it from there when applyTool fires for stage 2.

  function clearPlaceholder() {
    document.querySelectorAll('.seg.dest-hover').forEach(el => {
      el.classList.remove('dest-hover');
      el.style.removeProperty('--dest-start-pct');
      el.style.removeProperty('--dest-end-pct');
    });
    store.update(d => { d.ui.pendingPlacement = null; });
  }

  function renderPlaceholderInRegion(regionSegs, targetCol, pickedSource) {
    const regionIds = new Set(regionSegs.map(s => s.id));
    document.querySelectorAll('.seg.dest-hover').forEach(el => {
      if (!regionIds.has(el.dataset.id)) {
        el.classList.remove('dest-hover');
        el.style.removeProperty('--dest-start-pct');
        el.style.removeProperty('--dest-end-pct');
      }
    });
    const phStart = targetCol;
    const phEnd = targetCol + pickedSource.size;
    let segOffsetInRegion = 0;
    regionSegs.forEach(regSeg => {
      const parts = Array.from(memWrap.querySelectorAll(`.seg[data-id="${regSeg.id}"]`));
      parts.forEach(part => {
        const partSize = parseInt(part.dataset.partSize);
        const partOffsetInSeg = parseInt(part.dataset.partOffset);
        const partStartInRegion = segOffsetInRegion + partOffsetInSeg;
        const partEndInRegion = partStartInRegion + partSize;
        const iStart = Math.max(phStart, partStartInRegion);
        const iEnd = Math.min(phEnd, partEndInRegion);
        if (iEnd <= iStart) {
          part.classList.remove('dest-hover');
          part.style.removeProperty('--dest-start-pct');
          part.style.removeProperty('--dest-end-pct');
        } else {
          const localStart = (iStart - partStartInRegion) / partSize * 100;
          const localEnd = (iEnd - partStartInRegion) / partSize * 100;
          part.classList.add('dest-hover');
          part.style.setProperty('--dest-start-pct', localStart + '%');
          part.style.setProperty('--dest-end-pct', localEnd + '%');
        }
      });
      segOffsetInRegion += regSeg.size;
    });
  }

  function updatePlaceholderAt(clientX, clientY) {
    const state = store.getState();
    const active = state.ui.activeTool;
    const pickedId = state.ui.pickedSourceId;
    if (!active || !pickedId) return;
    if (active.kind !== 'move' && active.kind !== 'copy') return;
    const pickedSource = memory.find(m => m.id === pickedId);
    if (!pickedSource) return;

    const hit = document.elementFromPoint(clientX, clientY);
    const partEl = hit?.closest?.('.seg');
    if (!partEl || !memWrap.contains(partEl)) { clearPlaceholder(); return; }

    const seg = memory.find(m => m.id === partEl.dataset.id);
    if (!seg) { clearPlaceholder(); return; }

    let regionSegs, totalSize;
    if (active.kind === 'move') {
      const region = computeMoveRegionExt(memory, pickedSource);
      if (region && region.segs.includes(seg) && region.totalSize >= pickedSource.size) {
        regionSegs = region.segs;
        totalSize = region.totalSize;
      } else if (seg.type === 'free' && seg.id !== pickedSource.id && seg.size >= pickedSource.size) {
        regionSegs = [seg];
        totalSize = seg.size;
      } else {
        clearPlaceholder();
        return;
      }
    } else {
      if (seg.type !== 'free' || seg.id === pickedSource.id || seg.size < pickedSource.size) {
        clearPlaceholder();
        return;
      }
      regionSegs = [seg];
      totalSize = seg.size;
    }

    let segOffsetInRegion = 0;
    for (const r of regionSegs) {
      if (r.id === seg.id) break;
      segOffsetInRegion += r.size;
    }
    const partSize = parseInt(partEl.dataset.partSize);
    const partOffsetInSeg = parseInt(partEl.dataset.partOffset);
    const rect = partEl.getBoundingClientRect();
    const colW = rect.width / partSize;
    const colInPart = Math.floor((clientX - rect.left) / colW);
    let targetCol = segOffsetInRegion + partOffsetInSeg + colInPart;
    const maxStartCol = totalSize - pickedSource.size;
    targetCol = Math.max(0, Math.min(maxStartCol, targetCol));

    renderPlaceholderInRegion(regionSegs, targetCol, pickedSource);
    store.update(d => {
      d.ui.pendingPlacement = {
        regionSegIds: regionSegs.map(s => s.id),
        col: targetCol,
      };
    });
  }

  // Bridge placement updater/clearer into the fs-tools system so the
  // system's mousemove and cancelTool paths can drive them.
  setPlacementBridge(updatePlaceholderAt, clearPlaceholder);

  // ===== Hover overlay for files split across rows =====
  let overlayEl = null;
  let overlayForSegId = null;
  let pendingHide = null;

  function ensureOverlayEl() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'split-overlay';
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function showSplitOverlay(s) {
    if (pendingHide) { clearTimeout(pendingHide); pendingHide = null; }
    if (overlayForSegId === s.id && overlayEl?.classList.contains('visible')) return;

    if (overlayForSegId && overlayForSegId !== s.id) {
      const oldOp = getActiveOp(overlayForSegId);
      if (oldOp && oldOp.overlayBar) { oldOp.overlayBar = null; }
    }

    const firstPart = document.querySelector(`.seg[data-id="${s.id}"][data-part-idx="0"]`);
    if (!firstPart) return;
    const partSize = parseInt(firstPart.dataset.partSize);
    if (!partSize) return;

    const rect = firstPart.getBoundingClientRect();
    const colW = rect.width / partSize;
    const fullW = colW * s.size;

    const overlay = ensureOverlayEl();
    overlay.innerHTML = '';
    const unbroken = renderSegPart(s, s.size, 0, 1, 0);
    unbroken.removeAttribute('data-id');
    unbroken.removeAttribute('data-part-idx');
    unbroken.removeAttribute('data-total-parts');
    unbroken.style.cursor = 'default';
    unbroken.style.pointerEvents = 'none';
    unbroken.style.gridColumn = '';
    overlay.appendChild(unbroken);

    overlay.style.left = (rect.right - fullW) + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = fullW + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.classList.add('visible');
    overlayForSegId = s.id;

    const op = getActiveOp(s.id);
    if (op) {
      const bar = document.createElement('div');
      bar.className = 'op-progress overlay-op-bar';
      bar.style.position = 'absolute';
      bar.style.inset = '0';
      bar.style.width = '100%';
      bar.style.height = '100%';
      bar.innerHTML = `<div class="op-fill" style="width:${op.currentPct}%"></div><span class="op-icon">${op.icon}</span><span class="op-label">${op.label}</span>`;
      overlay.appendChild(bar);
      op.overlayBar = bar;
    }
  }

  function hideSplitOverlay(segId) {
    if (overlayForSegId !== segId) return;
    if (pendingHide) clearTimeout(pendingHide);
    pendingHide = setTimeout(() => {
      pendingHide = null;
      if (document.querySelector(`.seg[data-id="${segId}"][data-part-idx="0"]:hover`)) return;
      if (!overlayEl) return;
      overlayEl.classList.remove('visible');
      overlayForSegId = null;
      const op = getActiveOp(segId);
      if (op && op.overlayBar) { op.overlayBar = null; }
    }, 60);
  }

  function updateFsChips() {
    updateFsChipsExt(memory);
  }

  // Subscriber-driven UI mounted from here because runAction is local.
  mountDetailPanel(store, { onAction: (seg, actionId) => runAction(seg, actionId) });
  mountSelectionHighlight(store);

  // Initial render + initial selection
  render();
  setTimeout(() => {
    const engine = memory.find(x => x.id === 'engine');
    if (engine) store.update(d => { d.ui.selectedId = engine.id; });
  }, 100);
