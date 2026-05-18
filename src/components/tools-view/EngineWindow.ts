// Wires the engine-window thrust slider. Visual-only for now — the slider
// position drives the --p CSS var that paints the track fill. When the burn
// simulation comes online, thrust should be written to state.telemetry.fuelPct
// (or a new state.engine.thrustPct slot) and the slider become a subscriber.
export function mountEngineWindow(): () => void {
  const thrust = document.getElementById('thrust') as HTMLInputElement | null;
  const thrustVal = document.getElementById('thrustVal');
  if (!thrust || !thrustVal) return () => {};

  const onInput = (): void => {
    const value = thrust.value;
    thrustVal.textContent = value + '%';
    thrust.style.setProperty('--p', value + '%');
  };

  thrust.addEventListener('input', onInput);
  return () => thrust.removeEventListener('input', onInput);
}
