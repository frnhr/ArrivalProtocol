import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Wires the engine-window thrust slider to the burn sim. The slider writes
// burn.thrustPct (the sim's only player input) and also subscribes to it so
// programmatic changes (e.g. a future autopilot skill) reflect in the UI. The
// --p CSS var still paints the track fill. Direction / engage controls remain
// cosmetic for this slice.
export function mountEngineWindow(store: Store<GameState>): () => void {
  const thrust = document.getElementById('thrust') as HTMLInputElement | null;
  const thrustVal = document.getElementById('thrustVal');
  if (!thrust || !thrustVal) return () => {};

  function paint(pct: number): void {
    const text = pct + '%';
    thrustVal!.textContent = text;
    thrust!.style.setProperty('--p', text);
  }

  const onInput = (): void => {
    const pct = Number(thrust.value);
    paint(pct);
    store.update((d) => { d.burn.thrustPct = pct; });
  };
  thrust.addEventListener('input', onInput);

  // Reflect programmatic thrust changes. Setting .value does not re-fire 'input',
  // so no feedback loop.
  const unsub = store.subscribe(
    (s) => s.burn.thrustPct,
    (pct) => {
      thrust.value = String(pct);
      paint(pct);
    },
  );

  paint(store.getState().burn.thrustPct);

  return () => {
    thrust.removeEventListener('input', onInput);
    unsub();
  };
}
