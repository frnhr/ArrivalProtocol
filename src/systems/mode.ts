import type { Store } from '@state/store';
import type { GameState, ViewMode } from '@state/schema';
import { registerKeys, isKeyHeld } from '@systems/input';
import { resumeHeldThrottle } from '@systems/flight-controls';
import { emit } from '@systems/events';
import { markChannelRead, visibleChannel } from '@systems/say';
import { cancelTool } from '@systems/fs-tools';
import { lastLandingOn } from '@state/selectors';

// SHIP ⇄ MIND (§3, §6.11). ui.mode is the single source of truth: the mode toggle and TAB both
// write it here, and one subscriber (components/dock/ModeToggle) owns body.mode-memory, the
// toggle classes and the scanline wipe. Audio hears 'mode-change' (jackIn / jackOut).
//
// You can only burn while looking at the ship: entering blue lets go of a PLAYER burn (and a
// manual turn). AUTOBURN (WP9) keeps flying, and a running SKIP keeps running. Coming back with
// SPACE still held burns again. A SPACE held through a skipped boot went to the title layer,
// not the game, so that one still needs a fresh press.
//
// Likewise you can only hold a tool while looking at the mind: a tool works on the strip, which
// only blue shows. Leaving blue puts it down as Esc does (INSPECT keeps the file it was used on),
// so its follower card and crosshair never ride over the NAV PLOT, and a window pip selects its
// file instead of the held tool's last target.
//
// Slice 7b (slice-7-plan R26): THE LAST LANDING forces the SHIP view, so the MIND is shut while it runs (the toggle, TAB and
// every other way here do nothing; systems/last-landing.ts puts the SHIP view up as it starts).
export function setMode(store: Store<GameState>, to: ViewMode): void {
  const from = store.getState().ui.mode;
  if (from === to) return;
  if (to === 'memory' && lastLandingOn(store.getState())) return;
  if (to === 'tools' && store.getState().ui.activeTool) cancelTool(store);
  store.update((draft) => {
    draft.ui.mode = to;
    if (to === 'memory') {
      if (draft.burn.firing && draft.burn.firingSource === 'player') {
        draft.burn.firing = false;
        draft.burn.firingSource = null;
        draft.burn.firingFor = null;
      }
      draft.burn.rotInput = 0;
    }
    // The lines waiting on the screen the kid now looks at count as read.
    markChannelRead(draft, visibleChannel(to));
  });
  emit('mode-change', { from, to });
  if (to === 'tools' && isKeyHeld('Space', 'game')) resumeHeldThrottle(store);
}

export function toggleMode(store: Store<GameState>): void {
  setMode(store, store.getState().ui.mode === 'memory' ? 'tools' : 'memory');
}

// TAB flips the screen. Registered by the mode toggle (and directly by headless harnesses).
export function registerModeKeys(store: Store<GameState>): () => void {
  return registerKeys({ layer: 'game', codes: ['Tab'], onDown: () => toggleMode(store) });
}
