// Slice 7b: Track VIEW owns this file (docs/phase3/impl/slice-7-plan.md §2.10, §4.2, §5.2), with index.html's #lastLanding
// (its markup) and styles/landing.css. THE LAST LANDING's header strip over the SHIP view (01 §3.17: `THE LAST LANDING`) and
// its `[ENTER] SKIP TO THE END` hint, painted from systems/last-landing-hud.ts lastLandingHeader (null: hidden). It is keyed
// on the machine (landing.lastLanding), never on the FINALE's phase (7b foundation deviation 9: 7a's interim also runs in
// 'last-landing'). The [ENTER] key itself is Track DROP's (systems/last-landing.ts, on the 'last-landing' input layer); the
// hint is also a button, so a phone with no keyboard can skip too (the same skipLastLanding).
// While it shows, body.ll-on is set (landing.css dims what THE LAST LANDING shuts: the dock, the mode toggle).
// Slice 8 POLISH (OD 66): [ENTER] and the button skip over frames (systems/last-landing.ts skipLastLandingFrames). While that
// runs the hint reads `SKIPPING… n LEFT`, body.ll-skipping is set, and every click, tap and wheel on the page is swallowed
// before any window hears it: nothing the kid does may change the world the skip is flying (its result must be the
// one-call skip's).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { requireById, make } from '@components/dom';
import { lastLandingHeader, type LastLandingHeaderModel } from '@systems/last-landing-hud';
import { lastLandingSkipping, pressSkipLastLanding } from '@systems/last-landing';
import { LAST_LANDING_TEXT } from '@data/last-landing-text';

// What a pointer may not do while the skip runs: each is stopped at the window, in the capture phase, before any target.
const SWALLOWED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend', 'wheel'] as const;

// `[ENTER] SKIP TO THE END` → a keycap and its words (the header's other keycaps' look); a hint with no key stays words.
function hintParts(hint: string): { key: string | null; words: string } {
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(hint);
  return match ? { key: match[1]!, words: match[2]! } : { key: null, words: hint };
}

export function mountLastLandingView(store: Store<GameState>): () => void {
  const root = requireById('lastLanding');
  const strip = make('div', 'll-strip');
  const title = make('span', 'll-title');
  const middle = make('span', 'll-middle');
  const status = make('span', 'll-status');
  const flier = make('span', 'll-flier');
  middle.append(status, flier);
  const skip = make('button', 'll-skip');
  skip.tabIndex = -1;
  skip.type = 'button';
  const keycap = make('kbd', 'keycap');
  const skipWords = make('span', 'll-skip-words');
  skip.append(keycap, skipWords);
  strip.append(title, middle, skip);
  root.replaceChildren(strip);
  root.setAttribute('role', 'status');

  const patch = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

  // The skip over frames: every pointer event swallowed while it runs (added at its first paint, removed at its end).
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  let swallowing = false;
  function setSwallowing(on: boolean): void {
    if (on === swallowing) return;
    swallowing = on;
    for (const type of SWALLOWED_EVENTS) {
      if (on) window.addEventListener(type, swallow, { capture: true, passive: false });
      else window.removeEventListener(type, swallow, { capture: true });
    }
    document.body.classList.toggle('ll-skipping', on);
  }

  let shown = false;
  function paint(model: LastLandingHeaderModel | null): void {
    const on = model !== null;
    root.hidden = !on;
    document.body.classList.toggle('ll-on', on);
    setSwallowing(on && lastLandingSkipping());
    if (on && !shown) {
      // The strip lands as the drivers come back on the radio's sweep (audio-cues: transmitIn, then the stamp).
      root.classList.remove('ll-arrive');
      void root.offsetWidth;
      root.classList.add('ll-arrive');
    }
    shown = on;
    if (model === null) return;
    patch(title, model.title);
    patch(status, model.status);
    status.classList.toggle('all-down', model.left === 0);
    patch(flier, model.flier);
    const skipping = swallowing;
    const { key, words } = hintParts(skipping ? LAST_LANDING_TEXT.skipping(model.left) : model.hint);
    keycap.hidden = key === null;
    patch(keycap, key ?? '');
    patch(skipWords, words);
    skip.classList.toggle('skipping', skipping);
    skip.disabled = model.left === 0 || skipping;
  }

  const onSkip = (event: MouseEvent): void => {
    event.stopPropagation();
    if (lastLandingHeader(store.getState()) === null || lastLandingSkipping()) return;
    pressSkipLastLanding(store);
  };
  skip.addEventListener('click', onSkip);

  // The model is a handful of pods: read on every update, repainted when what it says changes.
  const key = (state: Readonly<GameState>): string => {
    const model = lastLandingHeader(state);
    return model === null ? '' : `${model.status}|${model.flier}|${model.hint}|${model.left}|${state.landing.lastLanding?.skipped === true}`;
  };
  const unsub = store.subscribe(key, () => paint(lastLandingHeader(store.getState())));
  paint(lastLandingHeader(store.getState()));

  return () => {
    skip.removeEventListener('click', onSkip);
    setSwallowing(false);
    unsub();
    root.hidden = true;
    root.classList.remove('ll-arrive');
    document.body.classList.remove('ll-on');
  };
}
