import type { Segment } from '@/types/segment';
import { renderSegmentPart, type SegmentBehavior } from './SegmentBlock';

const PER_ROW = 64;

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
// and lays out each segment across PER_ROW-wide rows, splitting segments that
// straddle a row boundary into multiple visual parts.
export function renderMemoryStrip(
  container: HTMLElement,
  memory: readonly Segment[],
  behavior: SegmentBehavior,
): void {
  container.innerHTML = '';
  let row = makeRow(0);
  let rowSize = 0;
  let cursor = 0;

  for (const seg of memory) {
    // First compute how many parts this segment splits into given current rowSize.
    let totalParts = 0;
    let simRow = rowSize;
    let simRem = seg.size;
    while (simRem > 0) {
      const avail = PER_ROW - simRow;
      const take = Math.min(avail, simRem);
      simRem -= take;
      simRow = simRem > 0 ? 0 : simRow + take;
      totalParts++;
    }

    let remaining = seg.size;
    let partIdx = 0;
    while (remaining > 0) {
      const avail = PER_ROW - rowSize;
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
