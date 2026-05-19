import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { getRedundancy, getAiCore } from '@state/selectors';
import { getActiveOpCount, onOpLoadChange } from '@systems/ops';

// Footer counters mirror two pool-like resources:
//   • Redundancy — repair budget, drains on Repair ops
//   • Core threads — concurrency budget on the AI Core, ticks with active ops
// Both subscribe with an always-false comparator so in-place mutations
// (which don't change array refs) still trigger repaints. The thread counter
// also listens to op-load changes (which never bump store state) so it tracks
// live op start/finish.
export function mountFooter(store: Store<GameState>): () => void {
  const redundEl = document.getElementById('footRedund');
  const coresEl = document.getElementById('footCores');

  function paintRedund(state: GameState): void {
    if (!redundEl) return;
    const redund = getRedundancy(state);
    redundEl.textContent = redund
      ? `REDUNDANCY: ${redund.used}/${redund.capacity} AVAILABLE`
      : `REDUNDANCY: 0/0 — DEPLETED`;
  }

  function paintCores(state: GameState): void {
    if (!coresEl) return;
    const core = getAiCore(state);
    const inUse = getActiveOpCount();
    if (!core) {
      coresEl.textContent = `THREADS: — / —`;
      return;
    }
    coresEl.textContent = `THREADS: ${inUse}/${core.capacity} ACTIVE`;
  }

  paintRedund(store.getState());
  paintCores(store.getState());

  const unsubStore = store.subscribe((s) => s, (s) => {
    paintRedund(s);
    paintCores(s);
  }, () => false);
  const unsubLoad = onOpLoadChange(() => paintCores(store.getState()));

  return () => { unsubStore(); unsubLoad(); };
}
