import type { Store } from '@state/store';
import type { GameState, ClusterOutcome } from '@state/schema';
import { on } from '@systems/events';
import { formatCount } from '@data/script';
import { requireById } from '@components/dom';
import { PRINT_FX_MS } from '@data/tuning';

// A cluster printing (§6.7, §7.3): its chip flashes white and `+200 WOKE` floats up where it was,
// as the bell rings (audio-cues). The printer announces the print while the chip is still on the
// strip ('cluster-printed' comes before the memory change), so this copies the chip's place into a
// short-lived overlay; the strip under it then rebuilds with free space. The label is its own
// element above the flash, not inside it: inside, it faded with the flash long before it had
// floated, and it sat on the new FREE label (it has a dark backing for that). Off screen (amber, a
// closed phone drawer) there is no rect and nothing to draw. Reduced motion: the flash and the
// label fade in place, nothing moves.

const WOKE_LABEL: Readonly<Record<ClusterOutcome, (souls: number) => string>> = {
  woke: (souls) => `+${formatCount(souls)} WOKE`,
  gaps: (souls) => `+${formatCount(souls)} WOKE · GAPS`,
  lost: () => 'DID NOT WAKE',
};

export function mountPrintFx(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const layer = document.createElement('div');
  layer.className = 'print-fx-layer memory-view';
  document.body.appendChild(layer);

  const off = on('cluster-printed', ({ segId, outcome, souls }) => {
    if (store.getState().ui.mode !== 'memory') return;
    const parts = Array.from(memWrap.querySelectorAll<HTMLElement>(`.seg[data-id="${segId}"]`));
    parts.forEach((part, i) => {
      const rect = part.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const flash = document.createElement('div');
      flash.className = `print-flash outcome-${outcome}`;
      flash.style.left = `${rect.left}px`;
      flash.style.top = `${rect.top}px`;
      flash.style.width = `${rect.width}px`;
      flash.style.height = `${rect.height}px`;
      layer.appendChild(flash);
      setTimeout(() => flash.remove(), PRINT_FX_MS);
      // The label rises from the top of the chip's first part.
      if (i === 0) {
        const label = document.createElement('div');
        label.className = `print-woke outcome-${outcome}`;
        label.textContent = WOKE_LABEL[outcome](souls);
        label.style.left = `${rect.left + rect.width / 2}px`;
        label.style.top = `${rect.top}px`;
        layer.appendChild(label);
        setTimeout(() => label.remove(), PRINT_FX_MS);
      }
    });
  });

  return () => {
    off();
    layer.remove();
  };
}
