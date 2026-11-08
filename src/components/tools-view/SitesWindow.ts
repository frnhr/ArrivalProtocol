// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.14, §6.2): the SITES window (amber, draggable,
// docked as SITES, shown only on POOR planets): its header (site data, MAPPED %, SURVEY's state and version, [ PAUSE ]),
// the LZs first and then the found sites, and a click's pill row (`SET AS LZ-B (800)`, systems/survey-model.ts
// assignableLzs; survey.ts assignSite). It paints systems/survey-hud.ts sitesWindowModel. index.html holds its container
// (`#sitesWin`, hidden, class survey-only) and its dock item; styles/survey.css shows both once SITES says so.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Mounted by main.ts after the other tools windows. Built by the FOUNDATION as a no-op (it reads no DOM yet): SITES builds the
// window here. Returns the unmount.
export function mountSitesWindow(store: Store<GameState>): () => void {
  void store;
  return () => {};
}
