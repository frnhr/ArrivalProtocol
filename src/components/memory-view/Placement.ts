// Movable destination placeholder for move/copy stage 2. Tracks the cursor
// over the strip and writes the chosen placement (region + column) into
// state.ui.pendingPlacement. The fs-tools system reads that on apply.
//
// For move, valid regions include the source plus any adjacent free chunks
// (computeMoveRegion), so a file can slide within its own footprint. For copy,
// only non-source free chunks of sufficient size qualify.
//
// Registers itself with setPlacementBridge so the fs-tools system's mousemove
// + cancelTool paths drive update/clear. No DOM events of its own.

import type { Segment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { computeMoveRegion, setPlacementBridge } from '@systems/fs-tools';

export function mountPlacement(store: Store<GameState>, memWrap: HTMLElement): () => void {
  function clearPlaceholder(): void {
    document.querySelectorAll<HTMLElement>('.seg.dest-hover').forEach((el) => {
      el.classList.remove('dest-hover');
      el.style.removeProperty('--dest-start-pct');
      el.style.removeProperty('--dest-end-pct');
    });
    store.update((d) => { d.ui.pendingPlacement = null; });
  }

  // Paints the .dest-hover gradient across each visual part the placeholder
  // overlaps. The CSS uses --dest-start-pct/--dest-end-pct to draw only the
  // covered sub-range of each part — important for split files.
  function renderPlaceholderInRegion(
    regionSegs: Segment[],
    targetCol: number,
    pickedSource: Segment,
  ): void {
    const regionIds = new Set(regionSegs.map((s) => s.id));
    document.querySelectorAll<HTMLElement>('.seg.dest-hover').forEach((el) => {
      if (!el.dataset.id || !regionIds.has(el.dataset.id)) {
        el.classList.remove('dest-hover');
        el.style.removeProperty('--dest-start-pct');
        el.style.removeProperty('--dest-end-pct');
      }
    });
    const phStart = targetCol;
    const phEnd = targetCol + pickedSource.size;
    let segOffsetInRegion = 0;
    regionSegs.forEach((regSeg) => {
      const parts = Array.from(
        memWrap.querySelectorAll<HTMLElement>(`.seg[data-id="${regSeg.id}"]`),
      );
      parts.forEach((part) => {
        const partSize = parseInt(part.dataset.partSize ?? '0', 10);
        const partOffsetInSeg = parseInt(part.dataset.partOffset ?? '0', 10);
        const partStartInRegion = segOffsetInRegion + partOffsetInSeg;
        const partEndInRegion = partStartInRegion + partSize;
        const iStart = Math.max(phStart, partStartInRegion);
        const iEnd = Math.min(phEnd, partEndInRegion);
        if (iEnd <= iStart) {
          part.classList.remove('dest-hover');
          part.style.removeProperty('--dest-start-pct');
          part.style.removeProperty('--dest-end-pct');
        } else {
          const localStart = ((iStart - partStartInRegion) / partSize) * 100;
          const localEnd = ((iEnd - partStartInRegion) / partSize) * 100;
          part.classList.add('dest-hover');
          part.style.setProperty('--dest-start-pct', localStart + '%');
          part.style.setProperty('--dest-end-pct', localEnd + '%');
        }
      });
      segOffsetInRegion += regSeg.size;
    });
  }

  function updatePlaceholderAt(clientX: number, clientY: number): void {
    const state = store.getState();
    const active = state.ui.activeTool;
    const pickedId = state.ui.pickedSourceId;
    if (!active || !pickedId) return;
    if (active.kind !== 'move' && active.kind !== 'copy') return;
    const pickedSource = state.memory.find((m) => m.id === pickedId);
    if (!pickedSource) return;

    const hit = document.elementFromPoint(clientX, clientY);
    const partEl = hit instanceof Element ? hit.closest<HTMLElement>('.seg') : null;
    if (!partEl || !memWrap.contains(partEl)) { clearPlaceholder(); return; }

    const seg = state.memory.find((m) => m.id === partEl.dataset.id);
    if (!seg) { clearPlaceholder(); return; }

    let regionSegs: Segment[];
    let totalSize: number;
    if (active.kind === 'move') {
      const region = computeMoveRegion(state.memory, pickedSource);
      if (region && region.segs.includes(seg) && region.totalSize >= pickedSource.size) {
        regionSegs = region.segs;
        totalSize = region.totalSize;
      } else if (
        seg.type === 'free' && seg.id !== pickedSource.id && seg.size >= pickedSource.size
      ) {
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
    const partSize = parseInt(partEl.dataset.partSize ?? '0', 10);
    const partOffsetInSeg = parseInt(partEl.dataset.partOffset ?? '0', 10);
    const rect = partEl.getBoundingClientRect();
    const colW = rect.width / partSize;
    const colInPart = Math.floor((clientX - rect.left) / colW);
    let targetCol = segOffsetInRegion + partOffsetInSeg + colInPart;
    const maxStartCol = totalSize - pickedSource.size;
    targetCol = Math.max(0, Math.min(maxStartCol, targetCol));

    renderPlaceholderInRegion(regionSegs, targetCol, pickedSource);
    store.update((d) => {
      d.ui.pendingPlacement = {
        regionSegIds: regionSegs.map((s) => s.id),
        col: targetCol,
      };
    });
  }

  setPlacementBridge(updatePlaceholderAt, clearPlaceholder);

  return () => {
    setPlacementBridge(() => {}, () => {});
    clearPlaceholder();
  };
}
