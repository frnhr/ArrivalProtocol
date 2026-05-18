// Hover preview for files that wrap across row breaks: shows an unbroken copy
// of the segment, anchored over the first part's row. If the segment has an
// in-flight op, mirrors that op's progress bar into the overlay so the file
// reads as a single thing even when the underlying parts are physically split.
//
// Triggered from SegmentBlock onMouseEnter/onMouseLeave via the handle returned
// by mountSplitOverlay. The 60ms pendingHide debounce keeps the overlay stable
// when the cursor crosses internal boundaries within the same logical segment.

import type { Segment } from '@/types/segment';
import { renderSegmentPart, type SegmentBehavior } from './SegmentBlock';
import { getActiveOp } from '@systems/ops';

const HIDE_DEBOUNCE_MS = 60;

const noopBehavior: SegmentBehavior = {
  onClick: () => {},
  onMouseEnter: () => {},
  onMouseLeave: () => {},
};

export interface SplitOverlayHandle {
  show: (seg: Segment) => void;
  hide: (segId: string) => void;
  teardown: () => void;
}

export function mountSplitOverlay(memWrap: HTMLElement): SplitOverlayHandle {
  let overlayEl: HTMLDivElement | null = null;
  let overlayForSegId: string | null = null;
  let pendingHide: ReturnType<typeof setTimeout> | null = null;

  function ensureOverlayEl(): HTMLDivElement {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'split-overlay';
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function show(seg: Segment): void {
    if (pendingHide) { clearTimeout(pendingHide); pendingHide = null; }
    if (overlayForSegId === seg.id && overlayEl?.classList.contains('visible')) return;

    // Detach overlay-bar pointer from any previously-mirrored op so the op
    // engine stops writing into the (about-to-be-replaced) overlay DOM.
    if (overlayForSegId && overlayForSegId !== seg.id) {
      const oldOp = getActiveOp(overlayForSegId);
      if (oldOp) oldOp.overlayBar = null;
    }

    const firstPart = memWrap.querySelector<HTMLElement>(
      `.seg[data-id="${seg.id}"][data-part-idx="0"]`,
    );
    if (!firstPart) return;
    const partSize = parseInt(firstPart.dataset.partSize ?? '0', 10);
    if (!partSize) return;

    const rect = firstPart.getBoundingClientRect();
    const colW = rect.width / partSize;
    const fullW = colW * seg.size;

    const overlay = ensureOverlayEl();
    overlay.innerHTML = '';
    const unbroken = renderSegmentPart(
      seg,
      { partSize: seg.size, partIdx: 0, totalParts: 1, partOffset: 0 },
      noopBehavior,
    );
    // Strip identifiers so this preview doesn't collide with real strip queries
    // (e.g. placement, hover targeting). Pointer-events off keeps it inert.
    unbroken.removeAttribute('data-id');
    unbroken.removeAttribute('data-part-idx');
    unbroken.removeAttribute('data-total-parts');
    unbroken.style.cursor = 'default';
    unbroken.style.pointerEvents = 'none';
    unbroken.style.gridColumn = '';
    overlay.appendChild(unbroken);

    // Right-align to the row's right edge so the unbroken preview never spills
    // past the strip — the first part is always at the row's right end.
    overlay.style.left = (rect.right - fullW) + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = fullW + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.classList.add('visible');
    overlayForSegId = seg.id;

    const op = getActiveOp(seg.id);
    if (op) {
      const bar = document.createElement('div');
      bar.className = 'op-progress overlay-op-bar';
      bar.style.position = 'absolute';
      bar.style.inset = '0';
      bar.style.width = '100%';
      bar.style.height = '100%';
      bar.innerHTML =
        `<div class="op-fill" style="width:${op.currentPct}%"></div>` +
        `<span class="op-icon">${op.icon}</span>` +
        `<span class="op-label">${op.label}</span>`;
      overlay.appendChild(bar);
      op.overlayBar = bar;
    }
  }

  function hide(segId: string): void {
    if (overlayForSegId !== segId) return;
    if (pendingHide) clearTimeout(pendingHide);
    pendingHide = setTimeout(() => {
      pendingHide = null;
      // Cursor may have re-entered the first part while we were debouncing.
      if (document.querySelector(`.seg[data-id="${segId}"][data-part-idx="0"]:hover`)) return;
      if (!overlayEl) return;
      overlayEl.classList.remove('visible');
      overlayForSegId = null;
      const op = getActiveOp(segId);
      if (op) op.overlayBar = null;
    }, HIDE_DEBOUNCE_MS);
  }

  function teardown(): void {
    if (pendingHide) { clearTimeout(pendingHide); pendingHide = null; }
    overlayEl?.remove();
    overlayEl = null;
    overlayForSegId = null;
  }

  return { show, hide, teardown };
}
