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
  }

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
  const offTick = onPostTick(() => paint());
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
