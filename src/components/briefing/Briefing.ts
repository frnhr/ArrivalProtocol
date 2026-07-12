import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Run start. The flight terminal is the intro for every level — its boot sequence (and the
// EVOLVED beat on levels that unlock something) is the briefing — so this simply commits
// the run: flip briefing → approaching, stamp the elapsed-time base, and start the clock at
// ×1. The terminal mounts before this component, so its burn.status subscription catches
// the transition and prints the boot lines.
//
// (The full-screen briefing overlay markup in index.html is retained, unused, for higher
// evolution tiers that may reintroduce a formal briefing later.)
export function mountBriefing(store: Store<GameState>): () => void {
  const overlay = document.getElementById('briefing');
  if (overlay) overlay.hidden = true;

  if (store.getState().burn.status === 'briefing') {
    store.update((d) => {
      d.burn.status = 'approaching';
      d.burn.startedTSec = d.clock.tSec;
      d.clock.speedTarget = 1;
      d.clock.speed = 1;
    });
  }

  return () => {};
}
