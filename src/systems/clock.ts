import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Wall-clock heartbeat that integrates game-time at dt × speed.
// All time-driven game systems (ops, future burn sim, hazards) subscribe via
// onGameTick — they never read wall-clock time. UI hover/animation effects
// stay on their own setTimeouts/keyframes since they represent direct input
// response, not the world advancing.

const TICK_MS = 50;                  // 20Hz integration step

type GameTickListener = (dtGameSec: number) => void;
const tickListeners = new Set<GameTickListener>();

// Register a consumer to receive game-time deltas. Called once per integration
// step with dt in game-seconds, only when speed > 0. Returns an unsubscribe.
export function onGameTick(listener: GameTickListener): () => void {
  tickListeners.add(listener);
  return () => { tickListeners.delete(listener); };
}

function formatClock(tSec: number): string {
  const t = Math.floor(tSec);
  const h = String(Math.floor(t / 3600)).padStart(5, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return `T+ ${h}:${m}:${s}`;
}

function fmtEta(etaHrs: number): string {
  return Number.isFinite(etaHrs) ? etaHrs.toFixed(1) : '∞';
}

export function mountClock(store: Store<GameState>): () => void {
  const clockEl = document.getElementById('clock');
  const velEl = document.getElementById('vel');
  const distEl = document.getElementById('distVal');
  const etaEl = document.getElementById('etaVal');
  const fuelEl = document.getElementById('fuelVal');

  function paintTelemetry(): void {
    const t = store.getState().telemetry;
    if (velEl) velEl.textContent = t.velocity.toFixed(3);
    if (distEl) distEl.textContent = Math.round(t.distance).toLocaleString('en-US');
    if (etaEl) etaEl.textContent = fmtEta(t.etaHrs);
    if (fuelEl) fuelEl.textContent = Math.round(t.fuelPct).toString();
  }

  // Paint initial state
  if (clockEl) clockEl.textContent = formatClock(store.getState().clock.tSec);
  paintTelemetry();

  let lastWall = performance.now();
  let lastDisplayedSec = Math.floor(store.getState().clock.tSec);

  const handle = setInterval(() => {
    const now = performance.now();
    const dtWall = (now - lastWall) / 1000;
    lastWall = now;

    const speed = store.getState().clock.speed;
    if (speed === 0) return;   // paused — world doesn't advance, no listeners fire

    const dtGame = dtWall * speed;

    // mutate (not update): clock tSec has no store subscribers — the clock
    // patches its own DOM below, and other readers pull on demand. Going through
    // update() at 20Hz would fan out to every always-false-equals subscriber and
    // rebuild the memory strip ~20 times per second, which interrupts clicks
    // (DOM replaced between mousedown and mouseup).
    store.mutate((d) => {
      d.clock.tSec += dtGame;
    });

    // Fan out to game-time subscribers (burn sim, ops, hazard timers) before
    // painting, so telemetry DOM reflects this frame's integrated values.
    tickListeners.forEach((fn) => fn(dtGame));

    // DOM patches — cheap direct writes, no need to subscribe through the store.
    // Clock only repaints when the displayed integer second changes (avoids
    // 20Hz reflows of identical text).
    const tSec = Math.floor(store.getState().clock.tSec);
    if (tSec !== lastDisplayedSec) {
      if (clockEl) clockEl.textContent = formatClock(tSec);
      lastDisplayedSec = tSec;
    }
    paintTelemetry();
  }, TICK_MS);

  return () => {
    clearInterval(handle);
    tickListeners.clear();
  };
}
