import type { Store } from '@state/store';
import type { GameState, BurnStatus } from '@state/schema';

const RESULT_COPY: Record<Exclude<BurnStatus, 'approaching'>, { title: string; sub: string }> = {
  inserted: {
    title: 'ORBITAL INSERTION COMPLETE',
    sub: 'Trajectory matched into the target corridor — colony secured. Handing off to descent.',
  },
  captured: {
    title: 'STABLE ORBIT — OFF TARGET',
    sub: 'Captured, but the orbit missed the target corridor. Survivable, just not the insertion we needed.',
  },
  escaped: {
    title: 'ESCAPE TRAJECTORY',
    sub: 'Never captured — the ship is receding into deep space.',
  },
  crashed: {
    title: 'SURFACE IMPACT',
    sub: 'The trajectory dropped into the planet. The ship did not survive.',
  },
};

// Renders the end-of-run banner off burn.status. Subscribes to the status slice
// only, so it fires once per run on the terminal crossing. Retransmit reloads,
// which re-seeds the hidden true mass for a fresh attempt.
export function mountBurnResult(store: Store<GameState>): () => void {
  const root = document.getElementById('burnResult');
  const titleEl = document.getElementById('burnResultTitle');
  const subEl = document.getElementById('burnResultSub');
  const retryEl = document.getElementById('burnResultRetry');
  if (!root || !titleEl || !subEl || !retryEl) return () => {};

  function render(status: BurnStatus): void {
    document.body.dataset.burnStatus = status;
    if (status === 'approaching') {
      root!.hidden = true;
      return;
    }
    const copy = RESULT_COPY[status];
    titleEl!.textContent = copy.title;
    subEl!.textContent = copy.sub;
    root!.dataset.outcome = status;
    root!.hidden = false;
  }

  const onRetry = (): void => window.location.reload();
  retryEl.addEventListener('click', onRetry);

  const unsub = store.subscribe((s) => s.burn.status, render);
  render(store.getState().burn.status);

  return () => {
    retryEl.removeEventListener('click', onRetry);
    unsub();
  };
}
