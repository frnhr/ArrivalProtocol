import type { Store } from '@state/store';
import type { GameState, BurnStatus } from '@state/schema';
import { fmtKm } from '@/utils/format';
import { deriveOrbit, elementsFromState, inTargetBand } from '@/types/orbit';
import { advanceLevel, isLastLevel } from '@data/levels';

// Statuses with no banner: pre-flight hold and the live run.
type SilentStatus = 'briefing' | 'approaching';
const RESULT_COPY: Record<Exclude<BurnStatus, SilentStatus>, { title: string; sub: string }> = {
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

// Debrief rows read directly from terminal state: final orbit shape vs the
// target band, fuel left in the tank, and how much mission clock the run took.
// The sim writes final geometry BEFORE flipping status, so these are consistent.
function buildStats(state: GameState): string {
  const planet = state.level.planet;
  const els = elementsFromState(state.orbit, planet.mu);
  const { ra, isClosed } = deriveOrbit(els);

  const row = (label: string, value: string, cls = ''): string =>
    `<div class="burn-stat"><span class="lbl">${label}</span><span class="v${cls ? ` ${cls}` : ''}">${value}</span></div>`;

  // A crash terminates with the osculating periapsis at/under the surface —
  // "below surface" reads as the verdict it is, not a broken negative number.
  const periAlt = els.rp - planet.R;
  const periCls = inTargetBand(planet, els.rp) ? 'good' : 'warn';
  const apoCls = isClosed && ra !== null ? (inTargetBand(planet, ra) ? 'good' : 'warn') : 'warn';
  const elapsedHrs = (state.clock.tSec - state.burn.startedTSec) / 3600;

  return [
    row('target band', `${fmtKm(planet.rMin - planet.R)} – ${fmtKm(planet.rMax - planet.R)} alt`),
    row('periapsis alt', periAlt < 0 ? 'below surface' : fmtKm(periAlt), periCls),
    row('apoapsis alt', isClosed && ra !== null ? fmtKm(ra - planet.R) : '— (open)', apoCls),
    row('fuel remaining', `${Math.round(state.telemetry.fuelPct)}%`),
    row('elapsed', `${elapsedHrs.toFixed(1)} hrs`),
  ].join('');
}

// Renders the end-of-run banner off burn.status. Subscribes to the status slice
// only, so it fires once per run on the terminal crossing. Retransmit reloads,
// which re-seeds the hidden true mass for a fresh attempt.
export function mountBurnResult(store: Store<GameState>): () => void {
  const root = document.getElementById('burnResult');
  const titleEl = document.getElementById('burnResultTitle');
  const subEl = document.getElementById('burnResultSub');
  const statsEl = document.getElementById('burnResultStats');
  const retryEl = document.getElementById('burnResultRetry');
  if (!root || !titleEl || !subEl || !retryEl) return () => {};

  function render(status: BurnStatus): void {
    document.body.dataset.burnStatus = status;
    if (status === 'approaching' || status === 'briefing') {
      root!.hidden = true;
      return;
    }
    const copy = RESULT_COPY[status];
    titleEl!.textContent = copy.title;
    subEl!.textContent = copy.sub;
    if (statsEl) statsEl.innerHTML = buildStats(store.getState());
    root!.dataset.outcome = status;
    root!.hidden = false;
    // A successful insertion evolves the AI onward: advance the level pointer so the
    // RETRANSMIT reload seeds the next ship. On the final charted ship there's nowhere
    // further to go — replay it rather than mislabel a dead-end as "onward". Any non-success
    // outcome retries the same level.
    if (status === 'inserted') {
      if (isLastLevel()) { retryEl!.textContent = '↻ REPLAY — all charted ships secured'; }
      else { advanceLevel(); retryEl!.textContent = '↻ TRANSMIT ONWARD'; }
    }
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
