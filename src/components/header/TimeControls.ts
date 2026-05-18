// Speed button row in the header. Visual-only at this stage — the actual
// burn-sim doesn't consume the speed multiplier yet. When it does, the
// click handler should dispatch to `state.clock.speed` via store.update().
export function mountTimeControls(): () => void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#speed .speed-btn'));
  const handlers: Array<[HTMLButtonElement, () => void]> = [];

  buttons.forEach((btn) => {
    const handler = (): void => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    };
    btn.addEventListener('click', handler);
    handlers.push([btn, handler]);
  });

  return () => {
    handlers.forEach(([btn, handler]) => btn.removeEventListener('click', handler));
  };
}
