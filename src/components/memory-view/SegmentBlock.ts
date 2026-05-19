import type { Segment } from '@/types/segment';
import { getActiveOpCount } from '@systems/ops';

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
  // `scanned` is what gates visible damage indicators on the memory strip.
  // Unscanned files render the bar/state as "unknown"; their underlying state
  // is still in the data (drives glitch, window-grip flicker), just not shown
  // here. Segments without a `scanned` field (free, encrypted, redundancy)
  // count as "known" for rendering purposes.
  const knownScanned = 'scanned' in seg ? seg.scanned : true;
  if (knownScanned) {
    if (state === 'corrupt') cls += ' corrupt';
    else if (state === 'partial') cls += ' partial';
  } else {
    cls += ' unscanned';
  }
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
    // Fill = used / size so the bar is honest about memory blocks. Each visible
    // block in the seg represents one block of memory; "wasted" blocks (size −
    // used, accumulated from drained repairs) show as the empty tail. Compact
    // (Repair v2) reclaims exactly that tail. `capacity` is the historical
    // blueprint max and stays in the detail panel as info, not on the bar.
    const filled = Math.max(0, Math.min(seg.size, seg.used));
    const totalPct = seg.size > 0 ? (filled / seg.size) * 100 : 0;
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
    if (knownScanned) {
      bar = `<div class="seg-bar"><div class="fill" style="width:${integrity}%"></div></div>`;
    } else {
      // Pre-scan: no integrity readout. Render a flat, dim placeholder bar so
      // the row visually parks where the bar would be without revealing health.
      bar = `<div class="seg-bar unscanned"></div>`;
    }
  }

  let metaR = '';
  if (isFirst) {
    // Inactive / transferring / locked are observable mid-op states, not health
    // — show them regardless of scan status. Everything else is gated behind
    // a scan for non-decorative segments.
    if (state === 'inactive') metaR = `<span class="health partial">IDLE</span>`;
    else if (state === 'locked') metaR = `<span class="health warn">LOCK</span>`;
    else if (state === 'transferring') metaR = `<span class="health partial">↻ XFER</span>`;
    else if (seg.type === 'redundancy') metaR = `<span class="health">${seg.used}/${seg.size}</span>`;
    else if (!knownScanned) metaR = `<span class="health unknown">— —</span>`;
    else if (state === 'corrupt') metaR = `<span class="health warn">◆ ${integrity}%</span>`;
    else if (state === 'partial') metaR = `<span class="health partial">${integrity}%</span>`;
    else metaR = `<span class="health">OK</span>`;
  }

  const sizeLabel = isSplit ? `${partSize}/${seg.size}B` : `${seg.size}B`;

  // AI Core renders a row of "thread" dots — one per capacity slot. Lit dots
  // = currently-running ops; dim dots = available slots. Visualizes the hard
  // concurrency cap. Live updates come from paintCoreThreads in main.ts.
  let threadRow = '';
  if (isFirst && seg.type === 'core') {
    const inUse = getActiveOpCount();
    const dots: string[] = [];
    for (let i = 0; i < seg.capacity; i++) {
      dots.push(`<span class="thread-dot${i < inUse ? ' lit' : ''}"></span>`);
    }
    threadRow = `<div class="thread-row" data-threads>${dots.join('')}<span class="thread-count">${inUse}/${seg.capacity}</span></div>`;
  }

  if (isFirst) {
    el.innerHTML = `
      ${badge}
      <div class="seg-name">${seg.name}</div>
      ${bar}
      ${threadRow}
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
