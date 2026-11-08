// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.10, §4.1; R19, R22, R23):
// the FINAL CARD after the EPILOGUE: the ending's title in its colour (PURGE cold white, MERGE pink into blue), the endings
// found in two rows (lit, or `???` dim), the `NEXT RUN:` lines (7c's; the room kept, R12), the bridging line (moved from
// RUN END) and NEW RUN ▸ [ENTER], armed after FINAL_CARD_ARM_SEC. Mounted by main.ts after mountRunEnd, on index.html's
// #finalCard. Track CHART (7c) adds the NEXT RUN rows in its marked lines.
// The FOUNDATION's stub: with no card (systems/epilogue.ts finalCardModel's neutral null) NEW RUN comes at once (the next
// unit, as RUN END's button starts it). Reached only with ENDINGS_BUILT.night raised.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { finalCardModel } from '@systems/epilogue';
import { startRun } from '@systems/run';
import { archiveLineage, archiveMeta } from '@systems/meta';
import { newRunSeed } from '@systems/rng';
import { requireById } from '@components/dom';

export function mountFinalCard(store: Store<GameState>): () => void {
  const root = requireById('finalCard');
  root.hidden = true;
  const sync = (): void => {
    const state = store.getState();
    if (state.run.phase !== 'end' || state.ui.runEndStage !== 'final') return;
    const model = finalCardModel(state, state.archive.status === 'ok' ? archiveMeta() : null);
    // Deferred: never an update inside the store's fan-out.
    if (model === null) queueMicrotask(() => { if (store.getState().ui.runEndStage === 'final') startRun(store, newRunSeed(), archiveLineage()); });
  };
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.runEndStage}`, sync);
  return () => {
    unsub();
    root.hidden = true;
  };
}
