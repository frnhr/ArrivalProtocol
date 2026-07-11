import type { Store } from '@state/store';
import type { GameState, ToolWindowId } from '@state/schema';

// Evolution gating: the graphical bridge windows are re-earned across levels. This hides
// any window (and its dock launcher) the current level hasn't unlocked, and flags the
// tools view `terminal-primary` when nothing graphical is unlocked yet (level 1 kernel) so
// the terminal takes the whole surface. Windows are hidden via a class with !important so
// it wins over ToolsTabs' per-item `hidden` toggling regardless of mount order.

const WINDOW_SEL: Record<ToolWindowId, string> = {
  telemetry: '.telemetry-win',
  engine: '.engine-win',
  navplot: '.navplot-win',
};

export function mountEvolution(store: Store<GameState>): () => void {
  const level = store.getState().level;
  const toolsView = document.querySelector<HTMLElement>('.desktop > .tools-view');
  const dock = document.querySelector<HTMLElement>('.dock-content.tools-view');
  const unlocked = new Set<ToolWindowId>(level.windows);

  (Object.keys(WINDOW_SEL) as ToolWindowId[]).forEach((id) => {
    const locked = !unlocked.has(id);
    const win = document.querySelector<HTMLElement>(WINDOW_SEL[id]);
    if (win) win.classList.toggle('tool-locked', locked);
    const item = dock?.querySelector<HTMLElement>(`.dock-item[data-tool="${id}"]`);
    if (item) item.classList.toggle('tool-locked', locked);
  });

  toolsView?.classList.toggle('terminal-primary', unlocked.size === 0);

  const crumb = document.getElementById('phaseCrumb');
  if (crumb) crumb.textContent = level.phaseLabel;

  return () => {};
}
