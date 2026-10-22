// Hover preview for files that wrap across row breaks: shows an unbroken copy
// of the segment, anchored over the first part's row. If the segment has an
// in-flight op, borrows a bar from OpBars (kept filled with the op's progress)
// so the file reads as a single thing even when its parts are physically split.
//
// Triggered from SegmentBlock onMouseEnter/onMouseLeave via the handle returned
// by mountSplitOverlay. The 60ms pendingHide debounce keeps the overlay stable
// when the cursor crosses internal boundaries within the same logical segment.

import type { Segment } from '@/types/segment';
import { renderSegmentPart, type SegmentBehavior } from './SegmentBlock';
import { attachOverlayBar, paintThreadRows } from './OpBars';
import { partNumber } from '@components/dom';

const HIDE_DEBOUNCE_MS = 60;

const noopBehavior: SegmentBehavior = {
  onClick: () => {},
  onMouseEnter: () => {},
  onMouseLeave: () => {},
};

interface SplitOverlayHandle {
  show: (seg: Segment) => void;
  hide: (segId: string) => void;
  teardown: () => void;
}

export function mountSplitOverlay(memWrap: HTMLElement): SplitOverlayHandle {
  let overlayEl: HTMLDivElement | null = null;
  let overlayForSegId: string | null = null;
  let pendingHide: ReturnType<typeof setTimeout> | null = null;
  // The borrowed op bar (OpBars keeps it filled); detached whenever the copy goes away.
  let detachBar: (() => void) | null = null;
  const dropBar = (): void => { detachBar?.(); detachBar = null; };

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

    // The old copy's bar stops being filled before its DOM is replaced.
    dropBar();

    const firstPart = memWrap.querySelector<HTMLElement>(
      `.seg[data-id="${seg.id}"][data-part-idx="0"]`,
    );
    if (!firstPart) return;
    const partSize = partNumber(firstPart, 'partSize');

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
    paintThreadRows();
    detachBar = attachOverlayBar(seg.id, overlay);
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
      dropBar();
    }, HIDE_DEBOUNCE_MS);
  }

  function teardown(): void {
    if (pendingHide) { clearTimeout(pendingHide); pendingHide = null; }
    dropBar();
    overlayEl?.remove();
    overlayEl = null;
    overlayForSegId = null;
  }

  return { show, hide, teardown };
}
