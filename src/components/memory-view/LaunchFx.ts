import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on } from '@systems/events';
import { requireById } from '@components/dom';
import { podCode, POD_STATE_TEXT } from '@data/landing-text';
import { LAUNCH_FX_MS } from '@data/tuning';

// A driver uploading into its pod (01-landing §3.8, §4): its chip flashes white and `POD 03 · LAUNCHED` floats up where
// it was (the launch flash). landing.ts announces the launch while the chip is still on the strip
// ('pod-launched' comes before the memory change), so this copies the chip's place into a short-lived overlay; the strip
// under it then rebuilds with free space. The label is its own element above the flash, so it outlives the flash and
// keeps a dark backing over the FREE label that replaces the chip. Off screen (amber, a closed phone drawer) there is no
// rect and nothing to draw. Reduced motion: the flash and the label fade in place (game.css).

export function mountLaunchFx(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const layer = document.createElement('div');
  layer.className = 'launch-fx-layer memory-view';
  document.body.appendChild(layer);

  const off = on('pod-launched', ({ pod, segId }) => {
    if (store.getState().ui.mode !== 'memory') return;
    const parts = Array.from(memWrap.querySelectorAll<HTMLElement>(`.seg[data-id="${segId}"]`));
    parts.forEach((part, i) => {
      const rect = part.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const flash = document.createElement('div');
      flash.className = 'launch-flash';
      flash.style.left = `${rect.left}px`;
      flash.style.top = `${rect.top}px`;
      flash.style.width = `${rect.width}px`;
      flash.style.height = `${rect.height}px`;
      layer.appendChild(flash);
      setTimeout(() => flash.remove(), LAUNCH_FX_MS);
      if (i === 0) {
        const label = document.createElement('div');
        label.className = 'launch-label';
        label.textContent = `${podCode(pod)} · ${POD_STATE_TEXT.launched}`;
        label.style.left = `${rect.left + rect.width / 2}px`;
        label.style.top = `${rect.top}px`;
        layer.appendChild(label);
        setTimeout(() => label.remove(), LAUNCH_FX_MS);
      }
    });
  });

  return () => {
    off();
    layer.remove();
  };
}
