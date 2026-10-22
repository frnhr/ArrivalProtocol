import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { requireById, paintHintTargets } from '@components/dom';

// Maintains the `.selected` class on every visual part of the currently
// selected segment. Pure DOM patch; runs on selectedId changes. Separate from
// SegmentBlock because parts are rebuilt by MemoryStrip on memory mutations,
// so the class needs reapplying after every render — easiest to do here.
export function mountSelectionHighlight(store: Store<GameState>): () => void {
  function paint(selectedId: string | null): void {
    document.querySelectorAll('.seg.selected').forEach((part) => part.classList.remove('selected'));
    if (selectedId) {
      document
        .querySelectorAll(`.seg[data-id="${selectedId}"]`)
        .forEach((part) => part.classList.add('selected'));
    }
  }

  // The file a strip line points at ("PICK UP REPAIR → CLICK ENGINE I/O") pulses like any hinted
  // control. The strip lights it when the line changes (ObjectiveStrip); a rebuild of the strip
  // replaces the file's element, so the same painter puts the pulse back on the strip here (this
  // mounts after MemoryStrip, so it runs after the rebuild).
  const strip = requireById('memWrap');
  const paintHint = (highlight: string | null): void => paintHintTargets(strip, highlight);

  paint(store.getState().ui.selectedId);
  paintHint(store.getState().director.shown?.highlight ?? null);
  // Always-false comparator: in-place mutations + render() rebuilds DOM, so we
  // need to repaint on every notify regardless of whether selectedId changed.
  const unsubSelected = store.subscribe((s) => s.ui.selectedId, (id) => paint(id), () => false);
  const unsubHint = store.subscribe((s) => s.director.shown?.highlight ?? null, paintHint, () => false);
  return () => { unsubSelected(); unsubHint(); };
}
