import type { Segment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { getMemoryBlocksPerRow } from '@/utils/viewport';
import { rackOf, rackLabelParts, RACK_LABEL_SEP } from '@data/memory';
import { RACK_BLOCKS } from '@data/tuning';
import { renderSegmentPart, type SegmentBehavior } from './SegmentBlock';
import { guardPresses } from '@components/dom';

// One row of the strip. Memory is six RACKS of 64 blocks (§3.2): on desktop a row is a rack, on a
// phone a rack is two rows of 32. The first row of each rack carries its label, `RACK C · 0x080`
// (the rack's name over its address); a rack's second row on a phone has an empty label, so the
// racks read as places, not as a hex dump. `data-rack` lets a later package flash a rack's rows
// (debris hits RACK C, WP9).
function makeRow(addr: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'addr-row';
  wrap.dataset.rack = rackOf(addr);
  const label = document.createElement('div');
  label.className = 'addr-label';
  if (addr % RACK_BLOCKS === 0) {
    wrap.classList.add('rack-start');
    // The label is data/memory.ts rackLabel, drawn in parts (the separator hidden when stacked).
    const parts = rackLabelParts(addr);
    label.innerHTML = `<span class="rack-name">${parts.name}</span>`
      + `<span class="rack-sep">${RACK_LABEL_SEP}</span><span class="rack-addr">${parts.addr}</span>`;
  }
  const strip = document.createElement('div');
  strip.className = 'mem-strip';
  wrap.appendChild(label);
  wrap.appendChild(strip);
  return wrap;
}

// The rows must fall on rack borders, or a rack label would sit in the middle of a rack.
function assertRowsFitRacks(perRow: number): void {
  if (RACK_BLOCKS % perRow !== 0) {
    throw new Error(`MemoryStrip: a row of ${perRow} blocks does not divide a ${RACK_BLOCKS}-block rack`);
  }
}

// The first address after the rack that holds `addr`.
function rackEnd(addr: number): number {
  return (Math.floor(addr / RACK_BLOCKS) + 1) * RACK_BLOCKS;
}

// Full re-render of the memory strip into `container`. Walks the memory array and lays out each segment across
// viewport-sized rows, splitting segments that straddle a row's end into several visual parts. A row never runs past
// its rack's end, so every rack starts a row (and carries its label).
// On a phone (rows of 32: half a rack) a file that would straddle the row's end starts the next row instead, when it
// fits in one row and inside its rack: a 4-block STASIS cut 2 + 2 across the rows showed `S T…` and `Se…`, its name
// nowhere (WP5, deferred to WP12). The row it leaves ends short, and the rack takes a third row when it must. Free
// space still splits anywhere (it has no name), and so does a file longer than a row. The desktop's rows are whole
// racks, where nothing straddles but the racks' own borders.
// The free space at a rack's end can then spill a few blocks into a third row of their own (ship 1's rack A: `2B` in a
// 17 px box under STASIS, WP12 review). Such a tail is drawn inside the same free run's part on the row before (its
// blocks narrower there), when it is no bigger than that part: a third row only for what needs one.
function renderMemoryStrip(
  container: HTMLElement,
  memory: readonly Segment[],
  behavior: SegmentBehavior,
): void {
  const perRow = getMemoryBlocksPerRow();
  assertRowsFitRacks(perRow);
  const keepFilesWhole = perRow < RACK_BLOCKS;
  // `.mem-strip` is a CSS grid with `repeat(var(--mem-cols, 64), 1fr)`. We
  // must publish the actual per-row count so segments span the full row
  // width instead of leaving the tail blank.
  container.style.setProperty('--mem-cols', String(perRow));
  container.innerHTML = '';
  const rowsPerRack = RACK_BLOCKS / perRow;
  let rowStart = 0;
  let rowSize = 0;  // the blocks (addresses) in the row so far; a folded free tail makes it more than the columns
  let rowsInRack = 1;  // the rows this rack has started, the current one included
  let row = makeRow(0);
  // The last part drawn was a sealed cluster in this row: the next sealed one joins its slab.
  let sealedLeft = false;

  // What a row starting at `start` can still take after `used` blocks: up to its width, never past its rack.
  const roomAt = (start: number, used: number): number => Math.min(perRow - used, rackEnd(start) - (start + used));
  const nextRow = (): void => {
    container.appendChild(row);
    const sameRack = Math.floor((rowStart + rowSize) / RACK_BLOCKS) === Math.floor(rowStart / RACK_BLOCKS);
    rowsInRack = sameRack ? rowsInRack + 1 : 1;
    rowStart += rowSize;
    rowSize = 0;
    row = makeRow(rowStart);
  };

  for (const seg of memory) {
    const segStart = rowStart + rowSize;
    const room = roomAt(rowStart, rowSize);
    // A full row moves on first; so does a named file that would straddle the row's end but fits a row of its own.
    if (room <= 0) nextRow();
    else if (keepFilesWhole && rowSize > 0 && seg.type !== 'free' && seg.size > room && seg.size <= perRow
      && segStart + seg.size <= rackEnd(segStart)) nextRow();

    // The parts it takes from here: as much as each row has room for.
    const sizes: number[] = [];
    const partRows: number[] = [];  // each part's row number within its rack (1 = the rack's first row)
    let simStart = rowStart;
    let simUsed = rowSize;
    let simRows = rowsInRack;
    for (let left = seg.size; left > 0;) {
      const take = Math.min(roomAt(simStart, simUsed), left);
      sizes.push(take);
      partRows.push(simRows);
      left -= take;
      if (left > 0) {
        const next = simStart + simUsed + take;
        simRows = Math.floor(next / RACK_BLOCKS) === Math.floor(simStart / RACK_BLOCKS) ? simRows + 1 : 1;
        simStart = next;
        simUsed = 0;
      } else simUsed += take;
    }
    // A free tail alone in a row past the rack's own (see the header) joins the part before it.
    const spans = [...sizes];
    const last = sizes.length - 1;
    if (keepFilesWhole && seg.type === 'free' && last > 0 && partRows[last]! > rowsPerRack && partRows[last - 1]! === partRows[last]! - 1
      && sizes[last]! <= sizes[last - 1]!) {
      sizes[last - 1]! += sizes[last]!;
      sizes.pop();
      spans.pop();
    }

    const sealed = seg.type === 'soul' && seg.sealed;
    let partOffset = 0;
    sizes.forEach((take, partIdx) => {
      if (partIdx > 0) nextRow();
      const joinsSealedLeft = sealed && rowSize > 0 && sealedLeft;
      const strip = row.querySelector('.mem-strip');
      if (!strip) throw new Error('MemoryStrip: a row without its .mem-strip');
      strip.appendChild(
        renderSegmentPart(seg, {
          partSize: take, partIdx, totalParts: sizes.length, partOffset, joinsSealedLeft,
          ...(spans[partIdx] !== take ? { spanCols: spans[partIdx] } : {}),
        }, behavior),
      );
      sealedLeft = sealed;
      rowSize += take;
      partOffset += take;
    });
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
//
// Printing changes memory on its own clock (a cluster every 2.5 s), so a rebuild can fall between
// a press on a chip and its release, and the click would be lost. A rebuild while a press inside
// the strip is down waits for the click to land; it then comes back as one more memoryRev bump,
// so every painter keyed on the rebuild (bars, highlights, target classes) repaints with it.
export function mountMemoryStrip(
  store: Store<GameState>,
  container: HTMLElement,
  behavior: SegmentBehavior,
): () => void {
  let lastPerRow = getMemoryBlocksPerRow();
  renderMemoryStrip(container, store.getState().memory, behavior);

  const presses = guardPresses(container, () => store.update((draft) => { draft.ui.memoryRev++; }));
  const unsubscribe = store.subscribe(
    (s) => s.ui.memoryRev,
    () => {
      if (presses.holds()) return;
      renderMemoryStrip(container, store.getState().memory, behavior);
    },
  );

  // Row width is viewport-dependent; re-render when the breakpoint changes so
  // segment splits are recomputed. Skip when perRow is unchanged to avoid
  // wiping placement/highlight classes on every cosmetic resize. The re-render is
  // a memoryRev bump, like the press guard's: every painter keyed on the rebuild
  // (HOLLOW's reach marks, the bars, highlights, target classes) repaints with it.
  const onResize = (): void => {
    const next = getMemoryBlocksPerRow();
    if (next === lastPerRow) return;
    lastPerRow = next;
    store.update((draft) => { draft.ui.memoryRev++; });
  };
  window.addEventListener('resize', onResize);

  return () => {
    unsubscribe();
    presses.dispose();
    window.removeEventListener('resize', onResize);
  };
}
