import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { REAL_TIME_SPEED, MAX_SPEED_TARGET } from '@state/schema';
import { onGameTick } from '@systems/clock';

// Header time controls: pause ❚❚ · REAL TIME · ×10 · live readout · ÷10.
//
// Everything drives clock.speedTarget (where time is heading); the effective
// clock.speed eases toward it in log-space (the glide lives in systems/clock.ts).
//   • ×10 / ÷10 step the TARGET by one decade and let the speed glide — pressing
//     ×10 twice always lands on ×100, regardless of where the glide currently sits.
//   • REAL TIME is the one control that SNAPS: it drops straight to ×1, no glide
//     (the player wants to slow down *now*, e.g. approaching periapsis).
//   • Pause freezes at once and remembers the multiplier to restore on resume.
// Bounds: ÷10 floors at REAL_TIME_SPEED (×1), ×10 caps at MAX_SPEED_TARGET (×10M);
// the end button disables at its limit.

// Compact readout of the live effective multiplier (×1, ×42.3, ×10K, ×10M …). Paused
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
  const pauseBtn = document.getElementById('speedPause') as HTMLButtonElement | null;
  const realBtn = document.getElementById('speedReal') as HTMLButtonElement | null;
  const upBtn = document.getElementById('speedUp') as HTMLButtonElement | null;
  const downBtn = document.getElementById('speedDown') as HTMLButtonElement | null;
  const readout = document.getElementById('speedMult');
  if (!pauseBtn || !realBtn || !upBtn || !downBtn) return () => {};

  // The multiplier to restore when un-pausing — the target captured the moment we froze.
  let resumeTarget = Math.max(REAL_TIME_SPEED, store.getState().clock.speedTarget || REAL_TIME_SPEED);

  // Floor the effective speed at ×1 on (re)start so the log glide has a positive value
  // to ramp up from — a halted clock (speed 0) has no defined log.
  const floorForGlide = (clock: GameState['clock']): void => {
    if (clock.speed < 1) clock.speed = 1;
  };

  // Pause toggles. Freeze: remember where we were, halt immediately. Resume: restore
  // the remembered target and let the speed glide back up.
  const onPause = (): void => {
    store.update((d) => {
      if (d.clock.speedTarget === 0) {
        d.clock.speedTarget = resumeTarget;
        floorForGlide(d.clock);
      } else {
        resumeTarget = d.clock.speedTarget;
        d.clock.speedTarget = 0;
        d.clock.speed = 0;
      }
    });
    paintReadout();
  };

  // REAL TIME snaps: target AND effective speed jump straight to ×1, skipping the glide.
  const onReal = (): void => {
    store.update((d) => { d.clock.speedTarget = REAL_TIME_SPEED; d.clock.speed = REAL_TIME_SPEED; });
    paintReadout();
  };

  // ×10: step the target up one decade and glide toward it. From a pause the base is
  // ×1, so a single press resumes at ×10. Capped at the ceiling.
  const onUp = (): void => {
    store.update((d) => {
      const base = d.clock.speedTarget === 0 ? REAL_TIME_SPEED : d.clock.speedTarget;
      d.clock.speedTarget = Math.min(MAX_SPEED_TARGET, base * 10);
      floorForGlide(d.clock);
    });
    paintReadout();
  };

  // ÷10: step the target down one decade and glide toward it. Floored at ×1; a no-op
  // at the floor or while paused (the button is also disabled in those states).
  const onDown = (): void => {
    store.update((d) => {
      if (d.clock.speedTarget <= REAL_TIME_SPEED) return;
      d.clock.speedTarget = Math.max(REAL_TIME_SPEED, d.clock.speedTarget / 10);
    });
    paintReadout();
  };

  pauseBtn.addEventListener('click', onPause);
  realBtn.addEventListener('click', onReal);
  upBtn.addEventListener('click', onUp);
  downBtn.addEventListener('click', onDown);

  // Highlight the active state (pause or real time) and disable the steppers at their
  // limits. Tracks the TARGET, so the UI settles the instant you choose rather than
  // crawling with the glide.
  function paintControls(target: number): void {
    pauseBtn!.classList.toggle('active', target === 0);
    realBtn!.classList.toggle('active', target === REAL_TIME_SPEED);
    upBtn!.disabled = target >= MAX_SPEED_TARGET;
    downBtn!.disabled = target <= REAL_TIME_SPEED;   // covers both real time and paused (0)
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

  paintControls(store.getState().clock.speedTarget);
  paintReadout();
  const unsub = store.subscribe((s) => s.clock.speedTarget, (target) => {
    paintControls(target);
    paintReadout();   // catches terminal stops (target→0) that the tick won't, since ticks halt
  });
  const offTick = onGameTick(paintReadout);

  return () => {
    pauseBtn.removeEventListener('click', onPause);
    realBtn.removeEventListener('click', onReal);
    upBtn.removeEventListener('click', onUp);
    downBtn.removeEventListener('click', onDown);
    unsub();
    offTick();
  };
}
