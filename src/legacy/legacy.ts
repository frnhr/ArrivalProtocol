// @ts-nocheck
// Step 3 of refactor: TS-ified but unchanged behavior. Strict typing happens in later steps.
// Step 4: game data and constants now live in @data/. Behavior remains identical.
// Step 6: the legacy `memory` array is now the same reference as store.getState().memory.
// Mutations made here are visible to anything that reads via the store. We call
// store.notify() at the end of render() so subscribers get re-evaluated.

import { TOOL_ICONS, TOOL_HINTS } from '@data/fs-tools';
import { TYPE_LABELS } from '@data/type-labels';
import { store } from '@state/instance';
import { renderMemoryStrip } from '@components/memory-view/MemoryStrip';
import { renderSegmentPart } from '@components/memory-view/SegmentBlock';
import { renderDetailPanel } from '@components/memory-view/DetailPanel';
import { updateFsChips as updateFsChipsExt } from '@components/memory-view/FsStatusBar';
import { renderCursorFollower } from '@components/cursor-follower/CursorFollower';
import { computeMoveRegion as computeMoveRegionExt, isValidTarget as isValidTargetExt } from '@systems/fs-tools';
import { startOp, getActiveOp } from '@systems/ops';
import { getFsTool, getRedundancy, selectCorruption } from '@state/selectors';
import { actionScan, actionSwap, actionActivate, actionDeleteRedundancy, actionRepair, actionDelete, actionMove, actionCopy } from '@state/actions';
import { mergeAdjacentFree as mergeAdjacentFreeExt, memAddrOf as memAddrOfExt } from '@systems/memory-ops';

  // ===== Memory model =====
  // Continuous strip from low address to high. Convention: ship → free → AI → fs tools → redundancy → free.
  const memory = store.getState().memory;

  // Filesystem tool registry — which ops are available depends on healthy tools
  function getTool(fsName) {
    return memory.find(m => m.fsTool === fsName && (m.integrity || 0) > 50 && m.state !== 'busy');
  }
  function getRedund() { return memory.find(m => m.type === 'redundancy'); }

  // ===== Rendering =====
  const memWrap = document.getElementById('memWrap');

  function totalSizeSoFar(idx) {
    let s = 0;
    for (let i = 0; i < idx; i++) s += memory[i].size;
    return s;
  }

  // Selection/hover/click behavior is still owned by legacy closures here;
  // MemoryStrip just builds the DOM and wires the handlers we pass in.
  const segBehavior = {
    onClick: (s, ev) => {
      if (activeTool) { ev.stopPropagation(); applyTool(s); }
      else selectSegment(s);
    },
    onMouseEnter: (s, el) => onSegHover(s, el),
    onMouseLeave: (s, el) => onSegLeave(s, el),
  };

  function render() {
    renderMemoryStrip(memWrap, memory, segBehavior);
    updateFsChips();
    updateStats();
    // Re-evaluate selectors for anything subscribed to the store. Legacy mutates
    // `memory` (which IS store.getState().memory) in place, so subscribers need a
    // manual nudge here — until each subsystem owns its mutations via store.update().
    store.notify();
  }

  // Thin wrapper around the extracted SegmentBlock module. Kept here so the
  // split-overlay and phantom-creation paths in this file continue to work.
  // Will be removed once those callers migrate in later steps.
  function renderSegPart(s, partSize, partIdx, totalParts, partOffset) {
    return renderSegmentPart(s, { partSize, partIdx, totalParts, partOffset }, segBehavior);
  }

  // ===== Selection / detail panel =====
  let selectedId = null;
  const detailBody = document.getElementById('detailBody');

  function selectSegment(s) {
    selectedId = s.id;
    document.querySelectorAll('.seg.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll(`.seg[data-id="${s.id}"]`).forEach(el => el.classList.add('selected'));
    showDetail(s);
  }

  function showDetail(s) {
    renderDetailPanel(detailBody, s, {
      getFsTool: (kind) => getFsTool(store.getState(), kind),
      getRedundancy: () => getRedundancy(store.getState()),
      onAction: (seg, actionId) => runAction(seg, actionId),
      onCorruptionSliderInput: (pct) => setCorruption(pct),
      getCorruption: () => selectCorruption(store.getState()),
    });
  }

  // ===== Actions =====
  function runAction(s, action) {
    if (action === 'repair') doRepair(s);
    else if (action === 'swap') doSwap(s);
    else if (action === 'activate') doActivate(s);
    else if (action === 'delete_redund') doDeleteRedund();
    else if (action === 'scan') doScan(s);
  }

  // doRepair delegated to actionRepair in @state/actions.ts (see actionDeps binding above)

  // Actions delegated to @state/actions.ts. The deps bag wires legacy's
  // render(), showDetail(), cursor tracking, and selection — once those
  // subsystems are subscriber-driven, the bag disappears.
  const actionDeps = {
    rerender: () => render(),
    refreshDetailFor: (seg) => showDetail(seg),
    getCursorXY: () => ({ x: lastMouseX, y: lastMouseY }),
    clearDetail: () => showEmpty(),
    setSelected: (id) => { selectedId = id; },
  };
  const doSwap        = (s) => actionSwap(store, s, actionDeps);
  const doActivate    = (s) => actionActivate(store, s, actionDeps);
  const doDeleteRedund = () => actionDeleteRedundancy(store, actionDeps);
  const doScan        = (s) => actionScan(store, s, actionDeps);
  const doRepair      = (s) => actionRepair(store, s, actionDeps);
  const doDelete      = (s) => actionDelete(store, s, actionDeps);
  const doMove        = (src, placement) => actionMove(store, src, placement, actionDeps);
  const doCopy        = (src, placement) => actionCopy(store, src, placement, actionDeps);

  // ===== Filesystem tool cursor-stick interaction =====
  let activeTool = null;   // { fsTool: 'scan'|'repair'|'move'|'copy'|'delete' }
  let pickedSource = null; // for move/copy: the source segment object
  const follower = document.getElementById('cursorFollower');
  let lastMouseX = 0, lastMouseY = 0;

  // Op engine moved to @systems/ops.ts. activeOps tracking is private to that module;
  // the split-overlay reads in-flight records via getActiveOp(segId).
  function startOpProgress(opts) {
    return startOp(opts);
  }

  function pickUpTool(fsName) {
    // Toggle off if same tool picked and we're not mid-2-stage operation
    if (activeTool && activeTool.fsTool === fsName && !pickedSource) {
      cancelTool();
      return;
    }
    // Find a healthy tool of this type
    const tool = memory.find(m => m.fsTool === fsName && (m.integrity || 0) > 50 && m.state !== 'busy');
    if (!tool) return; // chip is bad/busy

    activeTool = { fsTool: fsName, toolSegId: tool.id };
    pickedSource = null;
    document.body.classList.add('tool-active', `tool-${fsName}`);
    document.querySelectorAll('.fs-tool-chip.picked').forEach(c => c.classList.remove('picked'));
    document.querySelector(`.fs-tool-chip[data-fs="${fsName}"]`)?.classList.add('picked');
    updateFollower();
    refreshTargetClasses();
  }

  function cancelTool() {
    activeTool = null;
    pickedSource = null;
    document.body.classList.remove('tool-active', 'tool-scan', 'tool-repair', 'tool-move', 'tool-copy', 'tool-delete');
    document.querySelectorAll('.fs-tool-chip.picked').forEach(c => c.classList.remove('picked'));
    document.querySelectorAll('.seg.picked-source').forEach(el => el.classList.remove('picked-source'));
    document.querySelectorAll('.seg.valid-target, .seg.invalid-target, .seg.dest-hover').forEach(el => {
      el.classList.remove('valid-target', 'invalid-target', 'dest-hover');
      el.style.removeProperty('--dest-start-pct');
      el.style.removeProperty('--dest-end-pct');
    });
    pendingPlaceholder = null;
    updateFollower();
  }

  // Pure logic now lives in @systems/fs-tools.ts; these wrappers close over the
  // legacy `activeTool` and `pickedSource` locals so all existing call-sites keep working.
  function computeMoveRegion(source) {
    return computeMoveRegionExt(memory, source);
  }

  function isValidTarget(s) {
    if (!activeTool) return false;
    return isValidTargetExt(s, {
      state: store.getState(),
      activeKind: activeTool.fsTool,
      pickedSource,
    });
  }

  function refreshTargetClasses() {
    document.querySelectorAll('.seg').forEach(el => {
      el.classList.remove('valid-target', 'invalid-target');
      if (!activeTool) return;
      const s = memory.find(m => m.id === el.dataset.id);
      if (!s) return;
      el.classList.add(isValidTarget(s) ? 'valid-target' : 'invalid-target');
    });
    // Re-mark picked source (all parts if split)
    if (pickedSource) {
      document.querySelectorAll(`.seg[data-id="${pickedSource.id}"]`).forEach(el => el.classList.add('picked-source'));
    }
  }

  function updateFollower() {
    renderCursorFollower(follower, activeTool?.fsTool ?? null, pickedSource);
  }

  function applyTool(s) {
    if (!activeTool || !isValidTarget(s)) return;
    const fs = activeTool.fsTool;

    if (fs === 'scan')   { doScan(s);    cancelTool(); return; }
    if (fs === 'repair') { doRepair(s);  cancelTool(); return; }
    if (fs === 'delete') { doDelete(s);  cancelTool(); return; }

    if (fs === 'move' || fs === 'copy') {
      if (!pickedSource) {
        pickedSource = s;
        refreshTargetClasses();
        updateFollower();
        // Initialize placeholder if cursor is already over a valid target
        updatePlaceholderAt(lastMouseX, lastMouseY);
      } else {
        if (!pendingPlaceholder) { cancelTool(); return; }
        if (fs === 'move') doMove(pickedSource, pendingPlaceholder);
        else doCopy(pickedSource, pendingPlaceholder);
        cancelTool();
      }
    }
  }

  function onSegHover(s, el) {
    // Surface the unbroken overlay only when hovering the FIRST part of a split file (not free)
    const totalParts = parseInt(el.dataset.totalParts) || 1;
    const partIdx = parseInt(el.dataset.partIdx) || 0;
    if (totalParts > 1 && partIdx === 0 && s.type !== 'free') showSplitOverlay(s);

    if (!activeTool) return;
    if (!isValidTarget(s)) return;
    // Stage 2 of move/copy: drive the movable placeholder from cursor position
    if ((activeTool.fsTool === 'move' || activeTool.fsTool === 'copy') && pickedSource) {
      updatePlaceholderAt(lastMouseX, lastMouseY);
    }
  }

  function onSegLeave(s, el) {
    hideSplitOverlay(s.id);
    // Placeholder lifetime is managed by mousemove; no per-part cleanup needed here
  }

  // ===== Movable destination placeholder (move/copy stage 2) =====
  // pendingPlaceholder is committed on click. col is the start column within the free block.
  let pendingPlaceholder = null;

  function clearPlaceholder() {
    document.querySelectorAll('.seg.dest-hover').forEach(el => {
      el.classList.remove('dest-hover');
      el.style.removeProperty('--dest-start-pct');
      el.style.removeProperty('--dest-end-pct');
    });
    pendingPlaceholder = null;
  }

  // Render the placeholder spanning across the contiguous region (one or more segs).
  function renderPlaceholderInRegion(regionSegs, targetCol) {
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
    if (!activeTool || !pickedSource) return;
    if (activeTool.fsTool !== 'move' && activeTool.fsTool !== 'copy') return;

    const hit = document.elementFromPoint(clientX, clientY);
    const partEl = hit?.closest?.('.seg');
    if (!partEl || !memWrap.contains(partEl)) { clearPlaceholder(); return; }

    const seg = memory.find(m => m.id === partEl.dataset.id);
    if (!seg) { clearPlaceholder(); return; }

    // Region differs by tool and by which kind of seg the cursor is over:
    //   move + in-region hover → slide within source + adjacent free
    //   move + non-adjacent free hover → drop into that free seg (same shape as copy)
    //   copy → only the hovered free seg
    let regionSegs, totalSize;
    if (activeTool.fsTool === 'move') {
      const region = computeMoveRegion(pickedSource);
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

    // Map cursor pixel → column within region
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

    renderPlaceholderInRegion(regionSegs, targetCol);
    pendingPlaceholder = {
      regionSegIds: regionSegs.map(s => s.id),
      col: targetCol,
    };
  }

  // ===== Hover overlay for files split across rows =====
  // Shows the unbroken file as a tooltip-like preview floating above the first part.
  // If the file has an active op, mirrors a progress bar replica synced to the op.
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
    // No-op if already showing for this seg (avoids flicker between parts)
    if (overlayForSegId === s.id && overlayEl?.classList.contains('visible')) return;

    // Switching segs: clear old op overlay-bar reference
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
    // Render an unbroken version (totalParts = 1, partSize = s.size)
    const unbroken = renderSegPart(s, s.size, 0, 1, 0);
    // Strip identifying attrs — overlay is purely visual; queries should not find it.
    unbroken.removeAttribute('data-id');
    unbroken.removeAttribute('data-part-idx');
    unbroken.removeAttribute('data-total-parts');
    unbroken.style.cursor = 'default';
    unbroken.style.pointerEvents = 'none';
    unbroken.style.gridColumn = '';
    overlay.appendChild(unbroken);

    // Over the same row as the first part, right-aligned to the row's end (= first part's right edge)
    overlay.style.left = (rect.right - fullW) + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = fullW + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.classList.add('visible');
    overlayForSegId = s.id;

    // Mirror an active op's progress bar inside the overlay
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
      // Only the first part keeps the overlay alive — continuation hovers do not
      if (document.querySelector(`.seg[data-id="${segId}"][data-part-idx="0"]:hover`)) return;
      if (!overlayEl) return;
      overlayEl.classList.remove('visible');
      overlayForSegId = null;
      const op = getActiveOp(segId);
      if (op && op.overlayBar) { op.overlayBar = null; }
    }, 60);
  }

  // ===== Filesystem operations =====
  // mergeAdjacentFree delegated to @systems/memory-ops; thin wrapper closes
  // over the local `memory` so existing callers (doMove, doCopy, doDelete)
  // stay the same.
  const mergeAdjacentFreeFromOps = mergeAdjacentFreeExt;
  function mergeAdjacentFree() { mergeAdjacentFreeFromOps(memory); }

  function showEmpty() {
    detailBody.innerHTML = `
      <div class="detail-empty">
        <div class="icon">◇</div>
        <div>select a segment</div>
        <div style="font-size:9px;margin-top:6px;letter-spacing:0.1em">click any block</div>
      </div>`;
  }

  // doDelete delegated to actionDelete in @state/actions.ts (see actionDeps binding above)


  function updateFsChips() {
    updateFsChipsExt(memory);
  }

  // updateStats is now a subscriber-driven component (MemoryStats, Footer).
  // render()'s store.notify() call below fires those subscribers.
  function updateStats() { /* delegated */ }

  // ===== Corruption (delegated to systems/glitch.ts) =====
  // Demo-slider input arrives as 0..100 representing corruption percentage.
  // We translate that into ai.coreIntegrity (100..0) and let the glitch driver react.
  function setCorruption(pct) {
    store.update(d => { d.ai.coreIntegrity = 100 - pct; });
  }

  // Mode toggle, dock items, time controls, clock, velocity sim, and window
  // dragging are now owned by their respective modules under @components and
  // @systems, mounted from src/main.ts after this legacy module executes.

  // FS-tool chip pickup
  document.querySelectorAll('.fs-tool-chip.clickable').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('bad')) return;
      pickUpTool(chip.dataset.fs);
    });
  });
  // Cursor follower tracking (and global cursor position for op-progress docking)
  document.addEventListener('mousemove', e => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (!activeTool) return;
    follower.style.left = e.clientX + 'px';
    follower.style.top = e.clientY + 'px';
    if (pickedSource && (activeTool.fsTool === 'move' || activeTool.fsTool === 'copy')) {
      updatePlaceholderAt(e.clientX, e.clientY);
    }
  });
  // Cancel on ESC or right-click
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeTool) cancelTool();
  });
  window.addEventListener('contextmenu', e => {
    if (activeTool) { e.preventDefault(); cancelTool(); }
  });

  // Initial render
  render();
  setTimeout(() => selectSegment(memory.find(x => x.id === 'engine')), 100);
