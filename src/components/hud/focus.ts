import type { ViewMode } from '@state/schema';
import { requireById } from '@components/dom';

// Where a big overlay (a stamp, HOLD STEADY 3-2-1) is centred, in viewport pixels, and how wide
// it may be: over the NAV PLOT while the ship screen shows it, because the moment is about the
// line; otherwise the middle of the screen. The plot is not centred in the viewport (the dock
// and the two window columns push it), so a viewport-centred stamp would sit off the planet.
interface Focus {
  x: number;
  y: number;
  width: number;   // the room the overlay lands in: the plot's width over the plot
}

let plot: Element | null = null;

export function screenFocus(mode: ViewMode): Focus {
  plot ??= requireById('navplotSvg');
  if (mode === 'tools') {
    const rect = plot.getBoundingClientRect();
    // A zero-size plot is a hidden mobile tab: the screen centre is where the kid looks then.
    if (rect.width > 0 && rect.height > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width };
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2, width: window.innerWidth };
}
