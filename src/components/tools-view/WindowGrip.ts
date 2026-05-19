import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Each window in tools-mode optionally binds to a segment via `data-seg="<id>"`.
// The window-title grip then renders that segment's health: green/intact, yellow
// flicker/partial, red strong-flicker/corrupt. This is the only place the
// player can see *something is wrong* with a system before running Scan —
// segment state still drives the flicker even while the integrity readout in
// the memory strip stays hidden. Visual classes only; CSS owns the animation.
//
// Bands match SegmentBlock's active-state derivation in actions.ts so the
// grip and post-scan strip readout end up telling the same story.

type Band = 'intact' | 'partial' | 'corrupt';

function bandFromIntegrity(integrity: number): Band {
  if (integrity > 90) return 'intact';
  if (integrity > 50) return 'partial';
  return 'corrupt';
}

function paint(state: GameState): void {
  document.querySelectorAll<HTMLElement>('.window[data-seg]').forEach((win) => {
    const segId = win.dataset.seg;
    if (!segId) return;
    const grip = win.querySelector<HTMLElement>('.window-title .grip[data-grip]');
    if (!grip) return;
    const seg = state.memory.find((m) => m.id === segId);
    if (!seg || !('integrity' in seg)) {
      grip.classList.remove('intact', 'partial', 'corrupt');
      grip.classList.add('intact');
      return;
    }
    const band = bandFromIntegrity(seg.integrity);
    grip.classList.remove('intact', 'partial', 'corrupt');
    grip.classList.add(band);
  });
}

export function mountWindowGrips(store: Store<GameState>): () => void {
  paint(store.getState());
  // Always-false equals so in-place integrity mutations are picked up.
  return store.subscribe((s) => s, (s) => paint(s), () => false);
}
