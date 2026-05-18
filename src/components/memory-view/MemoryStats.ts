import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { getRedundancy } from '@state/selectors';

// Patches the memory-stats panel (#statRedund, #statFree) on every store notify.
// The store mutates state.memory in place so we use an always-false equals to
// re-evaluate on every notify; once mutations all flow through actions that
// trigger notify(), the panel stays in sync automatically.
export function mountMemoryStats(store: Store<GameState>): () => void {
  const redundEl = document.getElementById('statRedund');
  const freeEl = document.getElementById('statFree');
  if (!redundEl || !freeEl) return () => {};

  function paint(state: GameState): void {
    const redund = getRedundancy(state);
    const free = state.memory
      .filter((m) => m.type === 'free')
      .reduce((s, m) => s + m.size, 0);
    const totalSize = state.memory.reduce((s, m) => s + m.size, 0);
    if (redund) {
      redundEl!.innerHTML =
        `${redund.used} <span class="small">/ ${Math.round((redund.size / totalSize) * 100)}%</span>`;
    } else {
      redundEl!.innerHTML = `0 <span class="small">/ 0%</span>`;
    }
    freeEl!.innerHTML =
      `${free} <span class="small">/ ${Math.round((free / totalSize) * 100)}%</span>`;
  }

  paint(store.getState());
  // Custom always-changed comparator: re-evaluate on every notify since
  // memory mutates in place and the array reference is stable.
  const unsub = store.subscribe(
    (s) => s,
    (s) => paint(s),
    () => false,
  );

  return () => { unsub(); };
}
