import type { Segment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { getMemoryBlocksPerRow } from '@/utils/viewport';
import { renderSegmentPart, type SegmentBehavior } from './SegmentBlock';

function makeRow(addr: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'addr-row';
  const label = document.createElement('div');
  label.className = 'addr-label';
  label.textContent = '0x' + addr.toString(16).padStart(3, '0').toUpperCase();
  const strip = document.createElement('div');
  strip.className = 'mem-strip';
  wrap.appendChild(label);
  wrap.appendChild(strip);
  return wrap;
}

// Full re-render of the memory strip into `container`. Walks the memory array
// and lays out each segment across viewport-sized rows, splitting segments that
// straddle a row boundary into multiple visual parts.
export function renderMemoryStrip(
  container: HTMLElement,
  memory: readonly Segment[],
  behavior: SegmentBehavior,
): void {
  const perRow = getMemoryBlocksPerRow();
  // `.mem-strip` is a CSS grid with `repeat(var(--mem-cols, 64), 1fr)`. We
  // must publish the actual per-row count so segments span the full row
  // width instead of leaving the tail blank.
  container.style.setProperty('--mem-cols', String(perRow));
  container.innerHTML = '';
  let row = makeRow(0);
  let rowSize = 0;
  let cursor = 0;

  for (const seg of memory) {
    // If the previous segment filled the row exactly, advance to a fresh row
    // before processing this seg. Without this, `avail` would be 0 on the
    // first iteration and we'd emit a zero-size phantom continuation part.
    if (rowSize === perRow) {
      container.appendChild(row);
      cursor += rowSize;
      row = makeRow(cursor);
      rowSize = 0;
    }

    // First compute how many parts this segment splits into given current rowSize.
    let totalParts = 0;
    let simRow = rowSize;
    let simRem = seg.size;
    while (simRem > 0) {
      const avail = perRow - simRow;
      const take = Math.min(avail, simRem);
      simRem -= take;
      simRow = simRem > 0 ? 0 : simRow + take;
      totalParts++;
    }

    let remaining = seg.size;
    let partIdx = 0;
    while (remaining > 0) {
      const avail = perRow - rowSize;
      const take = Math.min(avail, remaining);
      const partOffset = seg.size - remaining;
      const strip = row.querySelector('.mem-strip');
      if (strip) {
        strip.appendChild(
          renderSegmentPart(seg, { partSize: take, partIdx, totalParts, partOffset }, behavior),
        );
      }
      rowSize += take;
      remaining -= take;
      partIdx++;
      if (remaining > 0) {
        container.appendChild(row);
        cursor += rowSize;
        row = makeRow(cursor);
        rowSize = 0;
      }
    }
  }
  container.appendChild(row);
}

// Mount MemoryStrip as a store subscriber. Subscribes to state.ui.memoryRev
// (bumped by action functions after in-place memory mutations) with default
// Object.is equality — so it ONLY rebuilds when memory actually changed, not
// on unrelated UI updates like pendingPlacement, selectedId, or activeTool.
// Rebuilding mid-mousemove would wipe Placement's .dest-hover classes; rebuilding
// on selection changes would interrupt clicks between mousedown and mouseup.
//
// MUST mount before subscribers that paint classes onto .seg elements
// (SelectionHighlight, fs-tools target classes) — those repaint after every
// store.update, and need to run AFTER MemoryStrip's rebuild wipes the DOM.
export function mountMemoryStrip(
  store: Store<GameState>,
  container: HTMLElement,
  behavior: SegmentBehavior,
): () => void {
  let lastPerRow = getMemoryBlocksPerRow();
  renderMemoryStrip(container, store.getState().memory, behavior);

  const unsubscribe = store.subscribe(
    (s) => s.ui.memoryRev,
    () => renderMemoryStrip(container, store.getState().memory, behavior),
  );

  // Row width is viewport-dependent; re-render when the breakpoint changes so
  // segment splits are recomputed. Skip when perRow is unchanged to avoid
  // wiping placement/highlight classes on every cosmetic resize.
  const onResize = (): void => {
    const next = getMemoryBlocksPerRow();
    if (next === lastPerRow) return;
    lastPerRow = next;
    renderMemoryStrip(container, store.getState().memory, behavior);
  };
  window.addEventListener('resize', onResize);

  return () => {
    unsubscribe();
    window.removeEventListener('resize', onResize);
  };
}
