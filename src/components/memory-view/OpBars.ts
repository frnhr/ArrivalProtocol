import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { RedundancySegment } from '@/types/segment';
import { onOpsChange, getOps, threadsBusy, threadsTotal, type Op } from '@systems/ops-core';
import { getCursorXY } from '@systems/fs-tools';
import { segmentStarts } from '@systems/memory-ops';
import { cancelPlayerOp } from '@state/actions';
import { getAiCore, getRedundancy, getSegmentById, shownIntegrity, isInfected } from '@state/selectors';
import { chargePartUsedPct, chargeMeta, threadRowHtml } from './SegmentBlock';
import { OP_BAR_DOCK_MS, OP_BAR_FADE_MS, OP_COMPLETE_PCT } from '@data/tuning';
import { partNumber } from '@components/dom';

// The op bars (§6.5, §9 WP3): a view of the ops core, nothing more. An op's progress runs in
// systems/ops-core.ts from the moment it starts; here a bar docks in from the cursor over the
// file's parts (cosmetic), fills with the op's progress, and fades when it ends.
// • The bars live in a layer with the .memory-view class, so they hide with the blue screen,
//   and re-dock onto the rebuilt strip after every memoryRev, on return to blue, on resize, on
//   strip scroll and when the strip's box changes size (a phone's INSPECT drawer opening). A bar
//   that would hang past the strip's visible edge hides instead of floating over the header or a
//   drawer. A ghost row is clipped to the edge instead (WP12): on a phone's scrolling strip the
//   half still in view keeps draining, and only a row wholly out of view hides.
// • A move also drains a ghost of the source's old blocks while the clone fills.
// • Live readouts follow the op at OP_PROGRESS_HZ instead of rebuilding the strip: the repaired
//   file's integrity climbs, REPAIR CHARGE's fill and number tick down, and the Core's thread
//   dots light and go out.
// • SplitOverlay borrows a bar for the unbroken hover copy of a wrapped file.

interface BarPiece {
  element: HTMLElement;
  fill: HTMLElement;
  startFrac: number;  // the slice of the op's progress this piece fills
  endFrac: number;
}

interface BarView {
  operation: Op;
  pieces: BarPiece[];
  // cutTop / cutBottom: the px of the ghost's row outside the strip's visible frame, clipped away.
  drains: { element: HTMLElement; startFrac: number; endFrac: number; cutTop: number; cutBottom: number }[];
  overlays: Set<HTMLElement>;
  dockPending: boolean;  // a new bar waiting for its first (animated) dock on the next frame
}

const views = new Map<number, BarView>();
let layer: HTMLElement | null = null;
let memWrapRef: HTMLElement | null = null;
let storeRef: Store<GameState> | null = null;

function partsOf(segId: string): HTMLElement[] {
  if (!memWrapRef) return [];
  return Array.from(memWrapRef.querySelectorAll<HTMLElement>(`.seg[data-id="${CSS.escape(segId)}"]`));
}

function inMemoryMode(): boolean {
  return storeRef?.getState().ui.mode === 'memory';
}

// Each piece fills one slice of the progress, in fill order: head first, or tail first for an
// overlapping move to the right.
function sliceFractions(sizes: number[], reverse: boolean): { startFrac: number; endFrac: number }[] {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const order = sizes.map((_size, i) => (reverse ? sizes.length - 1 - i : i));
  const out = sizes.map(() => ({ startFrac: 0, endFrac: 0 }));
  let done = 0;
  for (const idx of order) {
    out[idx] = { startFrac: done / total, endFrac: (done + sizes[idx]!) / total };
    done += sizes[idx]!;
  }
  return out;
}

function localPct(globalFrac: number, startFrac: number, endFrac: number): number {
  if (globalFrac <= startFrac) return 0;
  if (globalFrac >= endFrac) return OP_COMPLETE_PCT;
  return ((globalFrac - startFrac) / (endFrac - startFrac)) * OP_COMPLETE_PCT;
}

function makePiece(operation: Op, primary: boolean): BarPiece {
  const element = document.createElement('div');
  element.className = 'op-progress';
  if (operation.view.reverseFill) element.classList.add('reverse-fill');
  if (!primary) element.classList.add('op-continuation');
  const fill = document.createElement('div');
  fill.className = 'op-fill';
  element.appendChild(fill);
  if (primary) {
    const icon = document.createElement('span');
    icon.className = 'op-icon';
    icon.textContent = operation.icon;
    const label = document.createElement('span');
    label.className = 'op-label';
    label.textContent = operation.label;
    const cancel = document.createElement('span');
    cancel.className = 'op-cancel';
    cancel.setAttribute('role', 'button');
    cancel.title = 'Cancel';
    cancel.textContent = '×';
    cancel.addEventListener('click', (event) => {
      event.stopPropagation();
      if (storeRef) cancelPlayerOp(storeRef, operation.id);
    });
    element.append(icon, label, cancel);
  }
  layer!.appendChild(element);
  return { element, fill, startFrac: 0, endFrac: 0 };
}

// Places an element over a screen rect. Re-docks jump straight there; only the first dock of a
// new bar animates in from the cursor (the CSS transition).
function place(element: HTMLElement, rect: { left: number; top: number; width: number }, animate: boolean): void {
  if (!animate) element.style.transition = 'none';
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  if (!animate) {
    void element.offsetWidth;
    element.style.transition = '';
  }
}

// Whether an element spanning [top, top + height) lies wholly inside the strip's visible frame
// (a pixel of slack for rounding).
function insideFrame(top: number, height: number, frame: DOMRect): boolean {
  return top >= frame.top - 1 && top + height <= frame.bottom + 1;
}

interface RangeRect { left: number; top: number; width: number; height: number; blocks: number }

// Screen rects covering the block range [startAddr, endAddr) on the current strip, one per row:
// a moved file's old blocks, whatever segments now hold them.
function rectsForRange(startAddr: number, endAddr: number): RangeRect[] {
  if (!storeRef || !memWrapRef) return [];
  const memory = storeRef.getState().memory;
  const starts = new Map<string, number>();
  segmentStarts(memory).forEach((start, i) => starts.set(memory[i]!.id, start));
  const rows = new Map<number, RangeRect>();
  memWrapRef.querySelectorAll<HTMLElement>('.seg[data-id]').forEach((element) => {
    const segStart = starts.get(element.dataset.id ?? '');
    if (segStart === undefined) return;
    const size = partNumber(element, 'partSize');
    const partStart = segStart + partNumber(element, 'partOffset');
    const overlapStart = Math.max(startAddr, partStart);
    const overlapEnd = Math.min(endAddr, partStart + size);
    if (overlapEnd <= overlapStart || size <= 0) return;
    const rect = element.getBoundingClientRect();
    const colWidth = rect.width / size;
    const left = rect.left + (overlapStart - partStart) * colWidth;
    const width = (overlapEnd - overlapStart) * colWidth;
    const row = rows.get(Math.round(rect.top));
    if (row) {
      const right = Math.max(row.left + row.width, left + width);
      row.left = Math.min(row.left, left);
      row.width = right - row.left;
      row.blocks += overlapEnd - overlapStart;
    } else {
      rows.set(Math.round(rect.top), { left, top: rect.top, width, height: rect.height, blocks: overlapEnd - overlapStart });
    }
  });
  return [...rows.values()].sort((a, b) => a.top - b.top);
}

function dockDrains(view: BarView, frame: DOMRect): void {
  const drain = view.operation.view.drain;
  if (!drain) return;
  const rects = rectsForRange(drain.startAddr, drain.endAddr);
  if (rects.length !== view.drains.length) {
    view.drains.forEach((ghost) => ghost.element.remove());
    view.drains = rects.map(() => {
      const element = document.createElement('div');
      element.className = 'op-drain';
      layer!.appendChild(element);
      return { element, startFrac: 0, endFrac: 0, cutTop: 0, cutBottom: 0 };
    });
  }
  // The ghost empties the opposite way to the bar's fill, so the file reads as pouring over.
  const fractions = sliceFractions(rects.map((rect) => rect.blocks), !view.operation.view.reverseFill);
  rects.forEach((rect, i) => {
    const ghost = view.drains[i]!;
    ghost.startFrac = fractions[i]!.startFrac;
    ghost.endFrac = fractions[i]!.endFrac;
    place(ghost.element, rect, false);
    ghost.element.style.height = `${rect.height}px`;
    ghost.cutTop = Math.max(0, frame.top - rect.top);
    ghost.cutBottom = Math.max(0, rect.top + rect.height - frame.bottom);
    ghost.element.style.visibility = ghost.cutTop + ghost.cutBottom < rect.height ? '' : 'hidden';
  });
}

// A REPAIR fighting HOLLOW (WP6's tug-of-war): its bar slims to a thin strip with the × only, so the
// fight under it (the green pushing the red back) fills the chip even in a 52 px rack row.
function overTug(operation: Op): boolean {
  if (operation.kind !== 'repair' || !storeRef) return false;
  const target = getSegmentById(storeRef.getState(), operation.segId);
  return target !== undefined && isInfected(target);
}

// The chips a bar lies over: its file's parts, or (spanTargets: a SWAP) every touched file's parts in address order.
function barParts(operation: Op): HTMLElement[] {
  if (!operation.view.spanTargets || !storeRef) return partsOf(operation.segId);
  const memory = storeRef.getState().memory;
  const order = (segId: string): number => memory.findIndex((seg) => seg.id === segId);
  return [...operation.targetIds].sort((a, b) => order(a) - order(b)).flatMap(partsOf);
}

// Puts a bar's pieces over its file's parts (rebuilding them when the row split changed).
function dock(view: BarView, animate: boolean): void {
  const parts = barParts(view.operation);
  if (parts.length === 0 || !inMemoryMode()) return;
  const tug = overTug(view.operation);
  if (parts.length !== view.pieces.length) {
    view.pieces.forEach((piece) => piece.element.remove());
    let primaryIdx = 0;
    parts.forEach((part, i) => { if (partNumber(part, 'partSize') > partNumber(parts[primaryIdx]!, 'partSize')) primaryIdx = i; });
    view.pieces = parts.map((_part, i) => makePiece(view.operation, i === primaryIdx));
    animate = false;
  }
  const fractions = sliceFractions(parts.map((part) => partNumber(part, 'partSize')), view.operation.view.reverseFill);
  const frame = memWrapRef!.getBoundingClientRect();
  parts.forEach((part, i) => {
    const piece = view.pieces[i]!;
    piece.element.classList.toggle('over-tug', tug);
    piece.startFrac = fractions[i]!.startFrac;
    piece.endFrac = fractions[i]!.endFrac;
    const rect = part.getBoundingClientRect();
    piece.element.style.visibility = insideFrame(rect.top, piece.element.offsetHeight, frame) ? '' : 'hidden';
    place(piece.element, rect, animate);
  });
  dockDrains(view, frame);
  paintFill(view);
}

function paintFill(view: BarView): void {
  const frac = view.operation.pct / OP_COMPLETE_PCT;
  view.pieces.forEach((piece) => { piece.fill.style.width = `${localPct(frac, piece.startFrac, piece.endFrac)}%`; });
  view.drains.forEach((ghost) => {
    const gone = localPct(frac, ghost.startFrac, ghost.endFrac);
    const [right, left] = view.operation.view.reverseFill ? [0, gone] : [gone, 0];
    ghost.element.style.clipPath = `inset(${ghost.cutTop}px ${right}% ${ghost.cutBottom}px ${left}%)`;
  });
  view.overlays.forEach((overlay) => {
    const fill = overlay.querySelector<HTMLElement>('.op-fill');
    if (fill) fill.style.width = `${view.operation.pct}%`;
  });
}

function redockAll(): void {
  views.forEach((view) => { if (!view.dockPending) dock(view, false); });
}

// A new bar starts as a chip at the cursor (where the tool was clicked) and slides onto its
// file. Off the blue screen it simply docks the next time blue is shown.
function startView(operation: Op): void {
  const view: BarView = { operation, pieces: [], drains: [], overlays: new Set(), dockPending: false };
  views.set(operation.id, view);
  if (!inMemoryMode()) return;
  view.dockPending = true;
  const chip = makePiece(operation, true);
  view.pieces = [chip];
  const { x, y } = getCursorXY();
  chip.element.style.transition = 'none';
  chip.element.style.left = `${x}px`;
  chip.element.style.top = `${y}px`;
  chip.element.style.width = `${chip.element.offsetWidth}px`;
  void chip.element.offsetWidth;
  chip.element.style.transition = '';
  // The action rebuilds the strip right after it starts the op: dock on the next frame.
  requestAnimationFrame(() => {
    view.dockPending = false;
    if (views.get(operation.id) === view) dock(view, true);
  });
}

function endView(operation: Op): void {
  const view = views.get(operation.id);
  if (!view) return;
  views.delete(operation.id);
  const leaving = [...view.pieces.map((piece) => piece.element), ...view.drains.map((ghost) => ghost.element)];
  leaving.forEach((element) => {
    element.style.transition = `opacity ${OP_BAR_FADE_MS}ms`;
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
    setTimeout(() => element.remove(), OP_BAR_FADE_MS);
  });
  view.overlays.forEach((overlay) => overlay.remove());
}

// --- Live readouts -----------------------------------------------------------------------------

function paintLiveIntegrity(segId: string, integrity: number): void {
  const shown = shownIntegrity(integrity);
  document.querySelectorAll<HTMLElement>(`[data-live-integrity="${CSS.escape(segId)}"]`).forEach((element) => {
    element.textContent = `${element.dataset.livePrefix ?? ''}${shown}%`;
  });
  partsOf(segId).forEach((part) => {
    const fill = part.querySelector<HTMLElement>('.seg-bar .fill');
    if (fill) fill.style.width = `${integrity}%`;
  });
}

function paintLiveCharge(charge: RedundancySegment): void {
  partsOf(charge.id).forEach((part) => {
    part.style.setProperty('--used', `${chargePartUsedPct(charge, partNumber(part, 'partOffset'), partNumber(part, 'partSize'))}%`);
    const meta = part.querySelector<HTMLElement>('[data-live-charge]');
    if (meta) meta.textContent = chargeMeta(charge);
  });
}

function paintLive(operation: Op): void {
  if (!storeRef || operation.kind !== 'repair') return;
  const state = storeRef.getState();
  const target = getSegmentById(state, operation.segId);
  if (target && 'integrity' in target) paintLiveIntegrity(target.id, target.integrity);
  const charge = getRedundancy(state);
  if (charge) paintLiveCharge(charge);
}

// Every Core thread row on the page (the strip and a hover copy).
export function paintThreadRows(): void {
  if (!storeRef) return;
  const core = getAiCore(storeRef.getState());
  if (!core) return;
  const html = threadRowHtml(core.capacity, threadsTotal(), threadsBusy());
  document.querySelectorAll<HTMLElement>('[data-threads]').forEach((row) => {
    if (row.innerHTML !== html) row.innerHTML = html;
  });
}

// --- SplitOverlay's borrowed bar ---------------------------------------------------------------

// A full-size bar for the hover copy of a wrapped file, filled with its op's progress; null when
// no op runs on that file. The returned function takes it away again.
export function attachOverlayBar(segId: string, container: HTMLElement): (() => void) | null {
  const view = [...views.values()].find((candidate) => candidate.operation.segId === segId);
  if (!view) return null;
  const bar = document.createElement('div');
  bar.className = 'op-progress overlay-op-bar';
  const fill = document.createElement('div');
  fill.className = 'op-fill';
  fill.style.width = `${view.operation.pct}%`;
  const icon = document.createElement('span');
  icon.className = 'op-icon';
  icon.textContent = view.operation.icon;
  const label = document.createElement('span');
  label.className = 'op-label';
  label.textContent = view.operation.label;
  bar.append(fill, icon, label);
  container.appendChild(bar);
  view.overlays.add(bar);
  return () => {
    view.overlays.delete(bar);
    bar.remove();
  };
}

// --- Mount -------------------------------------------------------------------------------------

export function mountOpBars(store: Store<GameState>, memWrap: HTMLElement): () => void {
  if (layer) throw new Error('mountOpBars: already mounted');
  storeRef = store;
  memWrapRef = memWrap;
  layer = document.createElement('div');
  layer.className = 'op-bars-layer memory-view';
  layer.style.setProperty('--op-dock-ms', `${OP_BAR_DOCK_MS}ms`);
  document.body.appendChild(layer);

  const offOps = onOpsChange((change) => {
    if (change.type === 'start') startView(change.operation);
    else if (change.type === 'end') endView(change.operation);
    if (change.type === 'progress') {
      const view = views.get(change.operation.id);
      if (view) paintFill(view);
      paintLive(change.operation);
      return;
    }
    if (change.type !== 'threads') paintLive(change.operation);
    paintThreadRows();
  });
  // MemoryStrip mounts first, so this runs after its rebuild.
  const unsubMemory = store.subscribe((s) => s.ui.memoryRev, () => { redockAll(); paintThreadRows(); });
  const unsubMode = store.subscribe((s) => s.ui.mode, (mode) => { if (mode === 'memory') redockAll(); });
  // MemoryStrip (mounted first) rebuilds on a breakpoint change without a memoryRev bump.
  const onResize = (): void => { redockAll(); paintThreadRows(); };
  const onScroll = (): void => redockAll();
  window.addEventListener('resize', onResize);
  memWrap.addEventListener('scroll', onScroll, { passive: true });
  // The strip's box can change with no window resize and no memoryRev (a phone's INSPECT drawer
  // opening under it): re-dock whenever it, or the column holding it, changes size.
  const resizeObserver = new ResizeObserver(() => redockAll());
  resizeObserver.observe(memWrap);
  if (memWrap.parentElement) resizeObserver.observe(memWrap.parentElement);
  paintThreadRows();
  getOps().forEach(startView);

  return () => {
    offOps();
    unsubMemory();
    unsubMode();
    window.removeEventListener('resize', onResize);
    memWrap.removeEventListener('scroll', onScroll);
    resizeObserver.disconnect();
    views.clear();
    layer?.remove();
    layer = null;
    storeRef = null;
    memWrapRef = null;
  };
}
