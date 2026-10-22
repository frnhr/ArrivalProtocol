import type { Store } from '@state/store';
import type { GameState, TransitHit } from '@state/schema';
import { on } from '@systems/events';
import { onWorldReset } from '@systems/reset';
import { requireById } from '@components/dom';
import { ARRIVAL_HIT_STAGGER_SEC, ARRIVAL_HIT_FX_MS } from '@data/tuning';

// The arrival's red flashes (§4.1 step 1, §7.1 boot, §9 WP7 item 3): as the boot's ECC line types what the
// crossing did (`> ECC: AI COMMS −22% · ENGINE I/O −25%`), each file a hit landed on flashes red on the
// strip with what it lost floating off it, one after another (the crackle of each is audio-cues.ts, on the
// same stagger). Generated from the hits really applied (run.arrival, 'arrival-hits'), so the picture, the
// line and the files' health always agree. A fixed layer over the strip, like HOLLOW's moments: it hides
// with the blue screen, so a boot skipped to amber flashes nothing. A hit on the Core (an emergency's toll)
// flashes like any other. Reduced motion: the flash holds still and fades, nothing floats.

function partsOf(root: ParentNode, segId: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`.seg[data-id="${CSS.escape(segId)}"]`));
}

export function mountArrivalFlash(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const layer = document.createElement('div');
  layer.className = 'arrival-fx-layer memory-view';
  document.body.appendChild(layer);
  let timers: ReturnType<typeof setTimeout>[] = [];

  function flash(hit: TransitHit): void {
    if (store.getState().ui.mode !== 'memory') return;
    partsOf(memWrap, hit.segId).forEach((part, i) => {
      const rect = part.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const box = document.createElement('div');
      box.className = 'arrival-fx-hit';
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      layer.appendChild(box);
      if (i === 0) {
        const label = document.createElement('div');
        label.className = 'arrival-fx-label';
        label.textContent = `−${Math.round(hit.from - hit.to)}%`;
        label.style.left = `${rect.left + rect.width / 2}px`;
        label.style.top = `${rect.top + rect.height / 2}px`;
        layer.appendChild(label);
        timers.push(setTimeout(() => label.remove(), ARRIVAL_HIT_FX_MS));
      }
      timers.push(setTimeout(() => box.remove(), ARRIVAL_HIT_FX_MS));
    });
  }

  const offHits = on('arrival-hits', ({ hits }) => {
    layer.classList.toggle('reduced', store.getState().ui.reducedMotion);
    hits.forEach((hit, i) => timers.push(setTimeout(() => flash(hit), i * ARRIVAL_HIT_STAGGER_SEC * 1000)));
  });
  // A new ship (or a NEW RUN mid-boot) never inherits the last arrival's flashes.
  const clear = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
    layer.replaceChildren();
  };
  const offReset = onWorldReset('arrival-flash', clear, () => ({ timers: timers.length, shown: layer.childElementCount }));

  return () => {
    offHits();
    offReset();
    clear();
    layer.remove();
  };
}
