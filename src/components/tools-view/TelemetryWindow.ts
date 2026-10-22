import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { getSensedPrediction } from '@systems/predict';
import { capabilitiesNow } from '@systems/capabilities';
import { telemetryModel } from '@systems/flight-hud';
import { requireById } from '@components/dom';
import { createScrambler } from '@components/hud/scrambler';

// Telemetry (§7.1): SPEED, ALTITUDE and TIME TO ▼, painted from the game tick (the clock
// itself is DOM-free). FUEL lives in the Engine window, next to the button that spends it.
// The numbers come through the Telemetry file (C3): below 60% its digits scramble (▓), all of
// them when it is offline or gone (then the window also shows NO TELEMETRY, WindowGrip).
export function mountTelemetryWindow(store: Store<GameState>): () => void {
  const speedEl = requireById('telSpeed');
  const altitudeEl = requireById('telAltitude');
  const periEl = requireById('telTimeToPeri');
  const scramblers = { speed: createScrambler(), altitude: createScrambler(), peri: createScrambler() };

  function patch(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  function paint(): void {
    const state = store.getState();
    const model = telemetryModel(state, getSensedPrediction());
    const scramble = capabilitiesNow(state).telemetryScramble;
    patch(speedEl, scramblers.speed.apply(model.speed, scramble));
    patch(altitudeEl, scramblers.altitude.apply(model.altitude, scramble));
    patch(periEl, scramblers.peri.apply(model.timeToPeri, scramble));
  }

  paint();
  const offTick = onGameTick(() => paint());
  // Ticks stop on a terminal outcome; paint the final frame.
  const unsubStatus = store.subscribe((s) => s.burn.status, () => paint());
  return () => { offTick(); unsubStatus(); };
}
