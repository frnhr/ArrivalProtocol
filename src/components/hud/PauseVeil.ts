import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { requireById, requireIn } from '@components/dom';
import { isLivePhase } from '@systems/clock';

// The look-only pause (§6.1): a dim veil over the desk with `PAUSED · P to resume`. It lets
// pointer events through, so the kid can still hover, select and read everything; the
// refusals themselves (SPACE, presets, SKIP) live in the systems. Once the ship is lost or done
// its card owns the screen, so the veil only shows while the ship is live (flight or printing).
// It spans from the objective strip's bottom edge to the footer's top edge, measured: on a phone the header wraps
// to two rows and the strip to two lines, so the desktop's fixed heights (game.css) would put the card over the
// strip (WP1 deferral, WP12).
export function mountPauseVeil(store: Store<GameState>): () => void {
  const veil = requireById('pauseVeil');
  const strip = requireById('objective');
  const footer = requireIn(document, '.footer', '.footer');

  const place = (): void => {
    veil.style.top = `${Math.round(strip.getBoundingClientRect().bottom)}px`;
    veil.style.bottom = `${Math.round(window.innerHeight - footer.getBoundingClientRect().top)}px`;
  };
  const paint = (): void => {
    const state = store.getState();
    veil.hidden = !(state.clock.paused && isLivePhase(state));
    if (!veil.hidden) place();
  };
  // The header can grow while paused (SKIP's reason turns to PAUSED and wraps): follow the strip's box, not only the window.
  const onResize = (): void => { if (!veil.hidden) place(); };
  const observer = new ResizeObserver(onResize);
  observer.observe(strip);
  observer.observe(requireIn(document, '.header', '.header'));
  paint();
  window.addEventListener('resize', onResize);
  const unsub = store.subscribe((s) => `${s.clock.paused}|${s.burn.status}|${s.run.phase}`, paint);
  return () => {
    window.removeEventListener('resize', onResize);
    observer.disconnect();
    unsub();
  };
}
