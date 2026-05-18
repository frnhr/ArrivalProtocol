import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { getRedundancy } from '@state/selectors';

// Footer's redundancy counter mirrors the redundancy pool's used/capacity.
// Subscribes with an always-false comparator so it picks up in-place mutations.
export function mountFooter(store: Store<GameState>): () => void {
  const el = document.getElementById('footRedund');
  if (!el) return () => {};

  function paint(state: GameState): void {
    const redund = getRedundancy(state);
    el!.textContent = redund
      ? `REDUNDANCY: ${redund.used}/${redund.capacity} AVAILABLE`
      : `REDUNDANCY: 0/0 — DEPLETED`;
  }

  paint(store.getState());
  const unsub = store.subscribe((s) => s, (s) => paint(s), () => false);
  return () => { unsub(); };
}
