import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

function formatClock(tSec: number): string {
  const h = String(Math.floor(tSec / 3600)).padStart(5, '0');
  const m = String(Math.floor((tSec % 3600) / 60)).padStart(2, '0');
  const s = String(tSec % 60).padStart(2, '0');
  return `T+ ${h}:${m}:${s}`;
}

// Drives mission clock and the placeholder velocity simulator.
// Writes through the store so future subscribers (TelemetryWindow, etc.) react.
// The clock tick is 1Hz; velocity wobble is 1.25Hz — both cheap enough to clone state.
export function mountClock(store: Store<GameState>): () => void {
  const clockEl = document.getElementById('clock');
  const velEl = document.getElementById('vel');

  if (clockEl) clockEl.textContent = formatClock(store.getState().clock.tSec);
  if (velEl) velEl.textContent = store.getState().telemetry.velocity.toFixed(3);

  const tickId = setInterval(() => {
    store.update((d) => { d.clock.tSec = d.clock.tSec + 1; });
    if (clockEl) clockEl.textContent = formatClock(store.getState().clock.tSec);
  }, 1000);

  const velId = setInterval(() => {
    store.update((d) => {
      d.telemetry.velocity = d.telemetry.velocity + (Math.random() - 0.5) * 0.004;
    });
    if (velEl) velEl.textContent = store.getState().telemetry.velocity.toFixed(3);
  }, 800);

  return () => {
    clearInterval(tickId);
    clearInterval(velId);
  };
}
