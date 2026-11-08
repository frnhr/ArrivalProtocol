// Slice 7b: Track VIEW owns this file (docs/phase3/impl/slice-7-plan.md §2.10, §4.2, §5.2), with index.html's #lastLanding
// (its markup) and styles/landing.css. THE LAST LANDING's header strip over the SHIP view (01 §3.17: `THE LAST LANDING`) and
// its `[ENTER] SKIP TO THE END` hint, painted from systems/last-landing-hud.ts lastLandingHeader (null: hidden). The FOUNDATION
// left a mount that paints nothing; the [ENTER] key itself is Track DROP's (systems/last-landing.ts, on the 'last-landing'
// input layer).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

export function mountLastLandingView(store: Store<GameState>): () => void {
  void store;
  return () => {};
}
