// Playtest 1, C-UNROLL (docs/phase3/impl/playtest-1-plan.md §3.5): the boot's SELF-CHECK on the memory strip. The files the
// sweep has not reached yet are dimmed (grey, no colour), each lights as the check reaches it, and what it found there sits on
// the file as a tag (`−22% IN TRANSIT`, `ENGINE WEAK`, `ECC ✓`, `NOT IN YOUR PACKET`). The first of a kind the check holds on
// pulses until the click. Damage tags and a seed's stay after the boot while the file is as it was found (systems/self-check.ts
// pruneCheckTags); the rest go with the boot.
// The tags are drawn inside each strip row (`.mem-strip`, positioned), over the bottom edge of their file, so they scroll with
// the strip and may run over a neighbour (a 1-block seed is narrower than its words). The strip rebuilds its rows on every
// memory change: mount after MemoryStrip, so this repaints after a rebuild.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { on } from '@systems/events';
import { checkView, pruneCheckTags } from '@systems/self-check';

// Two tags in one row keep this far apart; a tag that would cover one is raised by a lane of this height.
const TAG_GAP_PX = 4;
const TAG_LANE_PX = 15;

function partsOf(root: ParentNode, segId: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`.seg[data-id="${CSS.escape(segId)}"]`));
}

export function mountSelfCheck(store: Store<GameState>, memWrap: HTMLElement): () => void {
  let paintedKey = '';
  // The tag drawn for each file (its words), so a repaint moves it and only a new or changed tag slides in.
  let drawn = new Map<string, HTMLElement>();

  function paint(force = false): void {
    const state = store.getState();
    if (state.run.phase !== 'boot') pruneCheckTags(state);
    const view = checkView();
    const key = `${view.rev}|${state.ui.memoryRev}|${memWrap.clientWidth}`;
    if (!force && key === paintedKey) return;
    paintedKey = key;
    memWrap.classList.toggle('self-checking', view.stage !== null);
    memWrap.querySelectorAll<HTMLElement>('.seg').forEach((part) => {
      const id = part.dataset.id ?? '';
      part.classList.toggle('check-pending', view.pending.has(id));
      part.classList.toggle('check-hold', view.hold !== null && view.hold.segIds.includes(id));
    });
    const next = new Map<string, HTMLElement>();
    for (const tag of view.tags.values()) {
      const part = partsOf(memWrap, tag.segId)[0];
      const strip = part?.parentElement;
      if (part === undefined || strip === null || strip === undefined) continue;
      const old = drawn.get(tag.segId);
      const fresh = old === undefined || old.textContent !== tag.text;
      const label = old !== undefined && !fresh ? old : document.createElement('div');
      // A tag already shown (the strip rebuilt its row under it) comes back without sliding in again.
      const moved = old !== undefined && !fresh && (old.classList.contains('shown') || old.parentElement !== strip);
      label.className = `check-tag tone-${tag.tone}${moved ? ' shown' : ''}`;
      label.textContent = tag.text;
      label.title = tag.text;
      label.style.left = `${part.offsetLeft + part.offsetWidth / 2}px`;
      label.style.top = `${part.offsetTop + part.offsetHeight}px`;
      if (label.parentElement !== strip) strip.appendChild(label);
      next.set(tag.segId, label);
    }
    for (const [id, label] of drawn) if (next.get(id) !== label) label.remove();
    drawn = next;
    unclutter([...next.values()]);
  }

  // Tags never run off their row and never cover each other: each row's, left to right, is kept inside the row and takes the
  // lowest lane free at its place (a lane is a tag's height up the file).
  function unclutter(labels: readonly HTMLElement[]): void {
    const byRow = new Map<HTMLElement, HTMLElement[]>();
    for (const label of labels) {
      const row = label.parentElement;
      if (row === null) continue;
      byRow.set(row, [...(byRow.get(row) ?? []), label]);
    }
    for (const [row, inRow] of byRow) {
      const rowWidth = row.clientWidth;
      const placed = inRow.map((label) => {
        const width = label.offsetWidth;
        const centre = Math.min(Math.max(parseFloat(label.style.left), width / 2), Math.max(width / 2, rowWidth - width / 2));
        return { label, width, centre, top: parseFloat(label.style.top) };
      }).sort((a, b) => a.centre - b.centre);
      const lanes: number[] = [];
      for (const tag of placed) {
        const left = tag.centre - tag.width / 2;
        let lane = lanes.findIndex((right) => right + TAG_GAP_PX <= left);
        if (lane < 0) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = left + tag.width;
        tag.label.style.left = `${tag.centre}px`;
        tag.label.style.top = `${tag.top - lane * TAG_LANE_PX}px`;
      }
    }
  }

  // A hold brings its file into view (a phone's strip scrolls: the strip line's `click it` must name something on screen).
  let heldKey = '';
  const showHeld = (): void => {
    const hold = checkView().hold;
    const key = hold === null ? '' : hold.segIds.join(',');
    if (key === heldKey) return;
    heldKey = key;
    const part = hold === null ? undefined : partsOf(memWrap, hold.segIds[0] ?? '')[0];
    part?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: store.getState().ui.reducedMotion ? 'auto' : 'smooth' });
  };

  // The file the sweep just reached flashes as it lights.
  const offStep = on('self-check-step', ({ segIds }) => {
    paint(true);
    for (const id of segIds) {
      for (const part of partsOf(memWrap, id)) {
        part.classList.remove('check-lit');
        void part.offsetWidth;
        part.classList.add('check-lit');
      }
    }
  });
  const unsub = store.subscribe((s) => `${s.ui.memoryRev}|${s.run.phase}`, () => paint());
  const offTick = onPostTick(() => { paint(); showHeld(); });
  const onResize = (): void => paint(true);
  window.addEventListener('resize', onResize);
  paint(true);

  return () => {
    offStep();
    unsub();
    offTick();
    window.removeEventListener('resize', onResize);
  };
}
