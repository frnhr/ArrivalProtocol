import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { movePreview, type MovePreview } from '@systems/move-preview';
import { getSegmentById, isHollow } from '@state/selectors';
import { requireById } from '@components/dom';
import { MOVE_PREVIEW_TEXT } from '@data/hollow-text';
import { ZONE_WORD } from '@data/zone-text';
import { knownHitRacks } from '@systems/zones';
import { getSensedPrediction } from '@systems/predict';
import { hollowLabel } from '@systems/say';

// The MOVE preview on the strip (§6.5, §5.1 2:55, §9 WP7 item 5): while a picked file hovers over a place
// it could go, two labels say what the move would do to HOLLOW's reach, judged on memory as it will be
// after the move (systems/move-preview.ts):
// • on the file itself, when it sits next to HOLLOW: what its leaving makes of that space, `LEAVES` over a
//   green `WALL 9 ✓` (the bite will fizzle there) or a red `GAP 2 ✗` (it bites across);
// • on the purple placeholder: a green `SAFE` / `WALL ✓` where HOLLOW can't reach it, a red `IT CAN BITE` /
//   `GAP 1 ✗` where it can, or `⚠ LETS ??? REACH YOUR CORE` when the move would open HOLLOW a chain of
//   gaps into rack E (your Core and your AI files). A FIREWALL.sys placed against HOLLOW says `FIREWALL` /
//   `SEALS THIS SIDE ✓` (WP8). A file bitten after it was picked says `STILL INFECTED` / `REPAIR IT FIRST ✗`
//   wherever it goes (WP12 p3: it kept saying SAFE / WALL ✓ while the infection would move with it). A spot in a
//   rack a hazard zone is known to hit (the rack's red tag) says `⚠ BELT HITS RACK A` instead of SAFE (final review).
// Nothing on a ship without HOLLOW, or while the hand holds anything but MOVE. A fixed layer over the strip
// (it hides with the blue screen), placed from the chips' rects: Placement paints the placeholder first on
// the same mouse move, then sets the placement this subscribes to; a scroll or a rebuild re-places it.


interface Label {
  caption: string;
  value: string;
  tone: 'good' | 'bad';
}

function sourceLabel(preview: MovePreview): Label | null {
  if (!preview.source) return null;
  return preview.source.wall
    ? { caption: MOVE_PREVIEW_TEXT.leaves, value: MOVE_PREVIEW_TEXT.wall(preview.source.blocks), tone: 'good' }
    : { caption: MOVE_PREVIEW_TEXT.leaves, value: MOVE_PREVIEW_TEXT.gap(preview.source.blocks), tone: 'bad' };
}

// A spot both in HOLLOW's reach and in a hazard's rack says the reach (`IT CAN BITE / GAP 1 ✗`: the WALL is what the
// MOVE is for); one out of reach in a hazard's rack names the hazard rather than SAFE.
function destLabel(preview: MovePreview, hollow: string): Label {
  if (preview.infected) return { caption: MOVE_PREVIEW_TEXT.infected, value: MOVE_PREVIEW_TEXT.repairFirst, tone: 'bad' };
  if (preview.bridges) return { caption: '', value: MOVE_PREVIEW_TEXT.bridges(hollow), tone: 'bad' };
  if (preview.seals) return { caption: MOVE_PREVIEW_TEXT.firewall, value: MOVE_PREVIEW_TEXT.seals, tone: 'good' };
  if (preview.dest.exposed) return { caption: MOVE_PREVIEW_TEXT.exposed, value: MOVE_PREVIEW_TEXT.gap(preview.dest.gap.blocks), tone: 'bad' };
  if (preview.hazard) return { caption: '', value: MOVE_PREVIEW_TEXT.hazard(ZONE_WORD[preview.hazard.kind], preview.hazard.rack), tone: 'bad' };
  return { caption: MOVE_PREVIEW_TEXT.safe, value: MOVE_PREVIEW_TEXT.destWall, tone: 'good' };
}

// The placeholder's box on screen: the covered share of every part Placement marked (--dest-start-pct /
// --dest-end-pct), joined. null when nothing is marked.
function placeholderRect(root: ParentNode): DOMRect | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  root.querySelectorAll<HTMLElement>('.seg.dest-hover').forEach((part) => {
    const rect = part.getBoundingClientRect();
    if (rect.width <= 0) return;
    const startPct = parseFloat(part.style.getPropertyValue('--dest-start-pct'));
    const endPct = parseFloat(part.style.getPropertyValue('--dest-end-pct'));
    if (!Number.isFinite(startPct) || !Number.isFinite(endPct)) throw new Error('MovePreviewLabels: a .dest-hover part without --dest-start-pct / --dest-end-pct');
    left = Math.min(left, rect.left + (rect.width * startPct) / 100);
    right = Math.max(right, rect.left + (rect.width * endPct) / 100);
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  });
  return Number.isFinite(left) ? new DOMRect(left, top, right - left, bottom - top) : null;
}

export function mountMovePreviewLabels(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const layer = document.createElement('div');
  layer.className = 'move-preview-layer memory-view';
  document.body.appendChild(layer);

  function place(label: Label, rect: DOMRect, where: 'source' | 'dest'): HTMLElement {
    const node = document.createElement('div');
    node.className = `move-preview-label ${where} tone-${label.tone}${label.caption ? '' : ' single'}`;
    if (label.caption) {
      const caption = document.createElement('span');
      caption.className = 'mp-caption';
      caption.textContent = label.caption;
      node.appendChild(caption);
    }
    const value = document.createElement('span');
    value.className = 'mp-value';
    value.textContent = label.value;
    node.appendChild(value);
    node.style.left = `${rect.left + rect.width / 2}px`;
    // On the file: over its middle. Over the placeholder: a flag on its top edge, clear of the cursor and
    // the held tool's pill, which sit on the placeholder itself.
    node.style.top = `${where === 'source' ? rect.top + rect.height / 2 : rect.top}px`;
    layer.appendChild(node);
    return node;
  }

  // A placeholder right under the file it moves (the natural drag: straight down a rack) puts its flag on
  // the file's own label. The file's label then becomes a flag on the file's top edge instead, pointing up:
  // the two stack a row apart, each on its own box. (Slid sideways, the placeholder's flag landed beside
  // the file's label in the same colour on the same row, read as one strip and covered the next driver;
  // under the placeholder it sat beneath the held tool's pill.)
  function keepApart(dest: HTMLElement, source: HTMLElement, sourceRect: DOMRect): void {
    const destRect = dest.getBoundingClientRect();
    const labelRect = source.getBoundingClientRect();
    const overlap = destRect.left < labelRect.right && labelRect.left < destRect.right
      && destRect.top < labelRect.bottom && labelRect.top < destRect.bottom;
    if (!overlap) return;
    source.classList.add('above');
    source.style.top = `${sourceRect.top}px`;
  }

  function paint(): void {
    layer.replaceChildren();
    const state = store.getState();
    const placement = state.ui.pendingPlacement;
    if (state.ui.mode !== 'memory' || state.ui.activeTool?.kind !== 'move' || !state.ui.pickedSourceId || !placement) return;
    if (!state.memory.some(isHollow)) return;
    const source = getSegmentById(state, state.ui.pickedSourceId);
    if (!source) return;
    const preview = movePreview(state, source, placement, knownHitRacks(state, getSensedPrediction()));
    if (!preview) return;
    const destRect = placeholderRect(memWrap);
    const destNode = destRect ? place(destLabel(preview, hollowLabel(state.run)), destRect, 'dest') : null;
    const fromLabel = sourceLabel(preview);
    const sourcePart = memWrap.querySelector<HTMLElement>(`.seg[data-id="${CSS.escape(source.id)}"]`);
    const sourceRect = sourcePart?.getBoundingClientRect();
    // A slide inside the file's own footprint: the placeholder already sits on it, and says it all.
    if (fromLabel && sourceRect && sourceRect.width > 0 && !sourcePart!.classList.contains('dest-hover')) {
      const sourceNode = place(fromLabel, sourceRect, 'source');
      if (destNode) keepApart(destNode, sourceNode, sourceRect);
    }
  }

  const unsub = store.subscribe(
    (s) => `${s.ui.memoryRev}|${s.ui.mode}|${s.ui.activeTool?.kind ?? ''}|${s.ui.pickedSourceId ?? ''}|${s.ui.pendingPlacement?.regionSegIds.join(',') ?? ''}:${s.ui.pendingPlacement?.col ?? ''}`,
    paint,
  );
  const onScroll = (): void => paint();
  memWrap.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  return () => {
    unsub();
    memWrap.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    layer.remove();
  };
}
