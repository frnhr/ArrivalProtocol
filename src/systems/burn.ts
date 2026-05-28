import type { Store } from '@state/store';
import type { GameState, BurnStatus } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { FUEL_BURN_RATE } from '@data/mission';

// The braking-burn simulation. Subscribes to the clock's game-time fan-out and
// integrates velocity/distance/fuel each step, then detects arrival. Numeric
// churn goes through store.mutate (20Hz, no subscriber rebuild — same discipline
// as the clock). The single terminal crossing per run goes through store.update
// so the footer, result banner, and time controls react.
export function mountBurnSim(store: Store<GameState>): () => void {
  return onGameTick((dtGame) => {
    if (store.getState().burn.status !== 'approaching') return;

    let nextStatus: BurnStatus | null = null;

    store.mutate((d) => {
      const b = d.burn;
      const t = d.telemetry;

      const decel = (b.thrustMaxKN * (b.thrustPct / 100)) / b.trueMassMt;
      t.velocity = Math.max(0, t.velocity - decel * dtGame);
      t.distance = Math.max(0, t.distance - t.velocity * dtGame);
      t.fuelPct = Math.max(0, t.fuelPct - FUEL_BURN_RATE * (b.thrustPct / 100) * dtGame);
      t.etaHrs = t.velocity > 1e-6 ? t.distance / t.velocity / 3600 : Infinity;

      if (t.distance <= 0) {
        if (t.velocity > b.targetVelMax) nextStatus = 'overshoot';
        else if (t.velocity < b.targetVelMin) nextStatus = 'undershoot';
        else nextStatus = 'arrived';
      } else if (t.velocity <= 0) {
        // Stopped short of the destination — can't ever arrive.
        nextStatus = 'undershoot';
      }
    });

    if (nextStatus) {
      const outcome = nextStatus;
      store.update((d) => {
        d.burn.status = outcome;
        d.clock.speed = 0;
      });
    }
  });
}
