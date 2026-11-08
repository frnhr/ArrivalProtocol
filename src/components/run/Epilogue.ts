// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.10, §4.1; R19, R20): the
// EPILOGUE, RUN END's night (`.run-end`'s palette, styles/night.css), its lines typed at EPILOGUE_CPS with arrivalChoir under
// it; one click finishes the typing, a second goes on to the FINAL CARD (ui.runEndStage 'final'). Reduced motion shows it
// whole. Mounted by main.ts after mountRunEnd, on index.html's #epilogue.
// The FOUNDATION's stub: with no epilogue (systems/epilogue.ts epilogueModel's neutral null) the screen skips straight to the
// final card. Reached only with ENDINGS_BUILT.night raised (RunEnd's EPILOGUE ▸ sets the stage).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { epilogueModel } from '@systems/epilogue';
import { setRunEndStage } from '@systems/run';
import { archiveMeta } from '@systems/meta';
import { requireById } from '@components/dom';

export function mountEpilogue(store: Store<GameState>): () => void {
  const root = requireById('epilogue');
  root.hidden = true;
  const sync = (): void => {
    const state = store.getState();
    if (state.run.phase !== 'end' || state.ui.runEndStage !== 'epilogue') return;
    const model = epilogueModel(state, state.archive.status === 'ok' ? archiveMeta() : null);
    // Deferred: never an update inside the store's fan-out.
    if (model === null) queueMicrotask(() => { if (store.getState().ui.runEndStage === 'epilogue') setRunEndStage(store, 'final'); });
  };
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.runEndStage}`, sync);
  return () => {
    unsub();
    root.hidden = true;
  };
}
