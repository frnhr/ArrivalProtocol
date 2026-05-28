import type { Store } from '@state/store';
import type { GameState, TimeSpeed } from '@state/schema';

// The header buttons in order: pause, x1, x10, x100, x1000, x10000.
// Index → speed maps directly to the time multiplier (0 = paused).
const SPEEDS: readonly TimeSpeed[] = [0, 1, 10, 100, 1000, 10000];

export function mountTimeControls(store: Store<GameState>): () => void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#speed .speed-btn'));
  if (buttons.length === 0) return () => {};

  const handlers: Array<[HTMLButtonElement, () => void]> = [];

  buttons.forEach((btn, idx) => {
    const speed = SPEEDS[idx];
    if (speed === undefined) return;
    const handler = (): void => {
      store.update((d) => { d.clock.speed = speed; });
    };
    btn.addEventListener('click', handler);
    handlers.push([btn, handler]);
  });

  // Reflect current speed in the active-button class.
  function paintActive(speed: TimeSpeed): void {
    const activeIdx = SPEEDS.indexOf(speed);
    buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
  }
  paintActive(store.getState().clock.speed);
  const unsub = store.subscribe((s) => s.clock.speed, paintActive);

  return () => {
    handlers.forEach(([btn, handler]) => btn.removeEventListener('click', handler));
    unsub();
  };
}
