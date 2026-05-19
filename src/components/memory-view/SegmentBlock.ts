import type { Segment } from '@/types/segment';

export interface SegmentPartLayout {
  partSize: number;
  partIdx: number;
  totalParts: number;
  partOffset: number;
}

export interface SegmentBehavior {
  onClick: (seg: Segment, ev: MouseEvent) => void;
  onMouseEnter: (seg: Segment, el: HTMLElement) => void;
  onMouseLeave: (seg: Segment, el: HTMLElement) => void;
}

// Builds a single visual part of a memory segment.
// For non-split segments, totalParts === 1 and partSize === seg.size.
// For split segments, only the first part shows the full label/badge/bar/meta;
// continuation parts show a small ↪ marker so they read as the same file.
export function renderSegmentPart(
  seg: Segment,
  layout: SegmentPartLayout,
  behavior: SegmentBehavior,
): HTMLElement {
  const { partSize, partIdx, totalParts, partOffset } = layout;
  const isFirst = partIdx === 0;
  const isLast = partIdx === totalParts - 1;
  const isSplit = totalParts > 1;

  const el = document.createElement('div');
  let cls = `seg ${seg.type}`;
  const state = 'state' in seg ? seg.state : undefined;
  if (state === 'corrupt') cls += ' corrupt';
  else if (state === 'partial') cls += ' partial';
  if (partSize <= 3) cls += ' compact';
  if (state === 'transferring') cls += ' transferring';
  if (state === 'offline') cls += ' offline offline-state';
  if (state === 'inactive') cls += ' inactive';
  if (isSplit) {
    cls += ' is-part';
    if (!isLast) cls += ' part-continues-right';
    if (!isFirst) cls += ' part-continues-left';
  }
  el.className = cls;
  el.style.gridColumn = `span ${partSize}`;
  el.dataset.id = seg.id;
  el.dataset.partIdx = String(partIdx);
  el.dataset.totalParts = String(totalParts);
  el.dataset.partSize = String(partSize);
  el.dataset.partOffset = String(partOffset);

  if (seg.type === 'redundancy') {
    // Distribute the global used/capacity fill proportionally across parts
    const totalPct = (seg.used / seg.capacity) * 100;
    const partStartPct = (partOffset / seg.size) * 100;
    const partEndPct = ((partOffset + partSize) / seg.size) * 100;
    let localPct = 0;
    if (totalPct > partStartPct) {
      const overlapEnd = Math.min(totalPct, partEndPct);
      localPct = ((overlapEnd - partStartPct) / (partEndPct - partStartPct)) * 100;
    }
    el.style.setProperty('--used', localPct + '%');
  }

  let badge = '';
  if (isFirst) {
    if (seg.type === 'ship' && seg.backup) badge = '<div class="seg-badge alt">BAK ⊃</div>';
    else if (seg.type === 'ship-backup') badge = '<div class="seg-badge alt">ALT</div>';
    else if (seg.type === 'fs-tool') badge = '<div class="seg-badge fs">FS</div>';
  }

  const integrity = 'integrity' in seg ? seg.integrity : undefined;

  let bar = '';
  if (isFirst && integrity !== undefined && seg.type !== 'redundancy' && seg.type !== 'free' && seg.type !== 'encrypted') {
    bar = `<div class="seg-bar"><div class="fill" style="width:${integrity}%"></div></div>`;
  }

  let metaR = '';
  if (isFirst) {
    if (state === 'corrupt') metaR = `<span class="health warn">◆ ${integrity}%</span>`;
    else if (state === 'partial') metaR = `<span class="health partial">${integrity}%</span>`;
    else if (state === 'inactive') metaR = `<span class="health partial">IDLE</span>`;
    else if (state === 'locked') metaR = `<span class="health warn">LOCK</span>`;
    else if (state === 'transferring') metaR = `<span class="health partial">↻ XFER</span>`;
    else if (seg.type === 'redundancy') metaR = `<span class="health">${seg.used}/${seg.capacity}</span>`;
    else metaR = `<span class="health">OK</span>`;
  }

  const sizeLabel = isSplit ? `${partSize}/${seg.size}B` : `${seg.size}B`;

  if (isFirst) {
    el.innerHTML = `
      ${badge}
      <div class="seg-name">${seg.name}</div>
      ${bar}
      <div class="seg-meta"><span>${sizeLabel}</span>${metaR}</div>
    `;
  } else {
    el.innerHTML = `
      <div class="seg-cont-marker">↪</div>
      <div class="seg-meta cont"><span>${partSize} of ${seg.size}B</span></div>
    `;
  }

  el.addEventListener('click', (ev) => behavior.onClick(seg, ev));
  el.addEventListener('mouseenter', () => behavior.onMouseEnter(seg, el));
  el.addEventListener('mouseleave', () => behavior.onMouseLeave(seg, el));
  return el;
}
