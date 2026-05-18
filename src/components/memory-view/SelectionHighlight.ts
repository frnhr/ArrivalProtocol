import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Maintains the `.selected` class on every visual part of the currently
// selected segment. Pure DOM patch; runs on selectedId changes. Separate from
// SegmentBlock because parts are rebuilt by MemoryStrip on memory mutations,
// so the class needs reapplying after every render — easiest to do here.
export function mountSelectionHighlight(store: Store<GameState>): () => void {
  function paint(selectedId: string | null): void {
    document.querySelectorAll('.seg.selected').forEach((el) => el.classList.remove('selected'));
    if (selectedId) {
      document
        .querySelectorAll(`.seg[data-id="${selectedId}"]`)
        .forEach((el) => el.classList.add('selected'));
    }
  }

  paint(store.getState().ui.selectedId);
  // Always-false comparator: in-place mutations + render() rebuilds DOM, so we
  // need to repaint on every notify regardless of whether selectedId changed.
  return store.subscribe((s) => s.ui.selectedId, (id) => paint(id), () => false);
}
