import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { categoryOf, matchesStatus } from '@state/sidebar-filters';

// Maintains the `.dimmed` class on every visual part of segments that fall
// outside the active filter / spotlight scope. Pure DOM patch.
//
// Dim rules (a segment is dimmed if either applies):
//   1. Its category appears in ui.filtersOff (player muted that group)
//   2. ui.spotlight is non-empty AND segment doesn't match ANY active spotlight
//
// MUST mount AFTER MemoryStrip — MemoryStrip rebuilds the DOM on memoryRev
// changes, so we need to subscribe after it so our repaint runs against the
// fresh elements. Uses always-false equals so we fire on every store notify
// (including the cascade after MemoryStrip rebuilds).
export function mountDimPainter(store: Store<GameState>): () => void {
  function paint(state: GameState): void {
    const { filtersOff, spotlight } = state.ui;
    const memory = state.memory;

    // Fast lookup: id → boolean (dimmed?)
    const dimmedIds = new Set<string>();
    for (const seg of memory) {
      const cat = categoryOf(seg);
      if (filtersOff.includes(cat)) {
        dimmedIds.add(seg.id);
        continue;
      }
      if (spotlight.length > 0) {
        const anyMatch = spotlight.some((key) => matchesStatus(seg, key));
        if (!anyMatch) dimmedIds.add(seg.id);
      }
    }

    document.querySelectorAll<HTMLElement>('.seg').forEach((el) => {
      const id = el.dataset.id;
      if (!id) return;
      el.classList.toggle('dimmed', dimmedIds.has(id));
    });
  }

  paint(store.getState());
  // Always-false equals: filtersOff / spotlight are arrays mutated through
  // store.update (which creates new refs), but we also need to repaint after
  // MemoryStrip rebuilds on memoryRev bumps — those fire notify too. Easiest
  // path: just paint on every notify; the work is cheap (one querySelectorAll).
  return store.subscribe(
    (s) => s,
    (s) => paint(s),
    () => false,
  );
}
