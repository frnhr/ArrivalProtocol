import type { Store } from '@state/store';
import type { GameState, TimeSpeed } from '@state/schema';
import { onGameTick } from '@systems/clock';

// The header buttons in order: pause, x1, x100, x10K, x1M, x100M. Each is a TARGET the
// effective multiplier (clock.speed) eases toward — steps of ×100 span real-time fine
// control up to skipping the long cruise. Single click = glide toward the value (the
// ramp lives in systems/clock.ts); double click = snap to it immediately.
const SPEEDS: readonly TimeSpeed[] = [0, 1, 100, 10000, 1000000, 100000000];

// Compact readout of the live effective multiplier (×1, ×42.3, ×10K, ×100M …). Paused
// shows the pause glyph. Kept terse — it lives in the cramped header strip.
function formatMult(eff: number): string {
  if (eff <= 0) return '❚❚';
  let val = eff;
  let suffix = '';
  if (eff >= 1e6) { val = eff / 1e6; suffix = 'M'; }
  else if (eff >= 1e3) { val = eff / 1e3; suffix = 'K'; }
  const txt = val >= 100 ? Math.round(val).toString()
    : val % 1 === 0 ? val.toFixed(0)
    : val.toFixed(1);
  return `×${txt}${suffix}`;
}

export function mountTimeControls(store: Store<GameState>): () => void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#speed .speed-btn'));
  if (buttons.length === 0) return () => {};

  const readout = document.getElementById('speedMult');
  const handlers: Array<[HTMLButtonElement, string, () => void]> = [];

  buttons.forEach((btn, idx) => {
    const speed = SPEEDS[idx];
    if (speed === undefined) return;

    // Single click picks the target. Pausing halts at once (a glide-to-zero is
    // meaningless); resuming from a stop floors the effective speed at ×1 so the
    // log glide has a positive value to ramp up from.
    const onClick = (): void => {
      store.update((d) => {
        d.clock.speedTarget = speed;
        if (speed === 0) d.clock.speed = 0;
        else if (d.clock.speed < 1) d.clock.speed = 1;
      });
      paintReadout();
    };
    // Double click snaps straight to the value, skipping the glide.
    const onDbl = (): void => {
      store.update((d) => { d.clock.speedTarget = speed; d.clock.speed = speed; });
      paintReadout();
    };
    btn.addEventListener('click', onClick);
    btn.addEventListener('dblclick', onDbl);
    handlers.push([btn, 'click', onClick], [btn, 'dblclick', onDbl]);
  });

  // The active button tracks the TARGET (where time is heading), so the highlight
  // settles the instant you choose rather than crawling with the glide.
  function paintActive(target: TimeSpeed): void {
    const activeIdx = SPEEDS.indexOf(target);
    buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
  }

  // Live multiplier readout. clock.speed is mutated at 20Hz (no store fanout) so we
  // can't subscribe to it — repaint off the game tick (fires whenever the world is
  // advancing, including mid-glide), plus on target changes for the paused/settled edges.
  let lastReadout = '';
  function paintReadout(): void {
    if (!readout) return;
    const txt = formatMult(store.getState().clock.speed);
    if (txt !== lastReadout) { readout.textContent = txt; lastReadout = txt; }
  }

  paintActive(store.getState().clock.speedTarget);
  paintReadout();
  const unsub = store.subscribe((s) => s.clock.speedTarget, (target) => {
    paintActive(target);
    paintReadout();   // catches terminal stops (target→0) that the tick won't, since ticks halt
  });
  const offTick = onGameTick(paintReadout);

  return () => {
    handlers.forEach(([btn, type, handler]) => btn.removeEventListener(type, handler));
    unsub();
    offTick();
  };
}
