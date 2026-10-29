import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on } from '@systems/events';
import { requireById } from '@components/dom';
import { screenFocus } from './focus';
import { STAMP_TEXT, FAULT_STAMP } from '@data/script';
import { ZONE_STAMP_TEXT } from '@data/zone-text';
import { HOLLOW_DEAL, HOLLOW_VERB } from '@data/hollow-text';
import { racksText } from '@/types/zone';
import { podCode } from '@data/landing-text';
import { STAMP_DEBOUNCE_MS, STAMP_IN_MS, STAMP_SHOW_MS, STAMP_MAX_WIDTH_FRAC } from '@data/tuning';

// Stamps (§7.3): two or three words in VT323 slammed over the middle of the screen on a moment
// (CLEAR OF THE PLANET, CAPTURED, ORBIT LOCKED …). They scale in over STAMP_IN_MS with a
// one-frame flash, hold, and fade; under reduced motion they only fade (game.css). The newest
// stamp replaces one still showing, and the same kind within STAMP_DEBOUNCE_MS is dropped, so
// a line flickering across a threshold never stamps twice. The thud under each stamp is part of
// its moment's sound (systems/audio-cues), so a stamp itself is silent.

export type StampTone = 'good' | 'danger' | 'plain';

let layer: HTMLElement | null = null;
let storeRef: Store<GameState> | null = null;
let current: HTMLElement | null = null;
let removeTimer: ReturnType<typeof setTimeout> | null = null;
const lastShownAt = new Map<string, number>();

// `kind` groups stamps for the debounce (default: the text itself).
export function showStamp(text: string, tone: StampTone, kind: string = text): boolean {
  if (!layer || !storeRef) throw new Error('showStamp: mountStamps has not run');
  const now = performance.now();
  const last = lastShownAt.get(kind);
  if (last !== undefined && now - last < STAMP_DEBOUNCE_MS) return false;
  lastShownAt.set(kind, now);

  current?.remove();
  if (removeTimer !== null) clearTimeout(removeTimer);
  const stamp = document.createElement('div');
  stamp.className = `stamp tone-${tone}`;
  stamp.textContent = text;
  const focus = screenFocus(storeRef.getState().ui.mode);
  stamp.style.left = `${Math.round(focus.x)}px`;
  stamp.style.top = `${Math.round(focus.y)}px`;
  layer.appendChild(stamp);
  // Sized to the room it lands in: at 1280 wide a long stamp (CLEAR OF THE PLANET) was wider
  // than the plot and covered the Engine window's FUEL readout during the burn. offsetWidth is
  // the layout width, before the scale-in transform.
  const room = focus.width * STAMP_MAX_WIDTH_FRAC;
  const width = stamp.offsetWidth;
  if (width > room) {
    const fontPx = parseFloat(getComputedStyle(stamp).fontSize);
    stamp.style.fontSize = `${Math.floor((fontPx * room) / width)}px`;
  }
  current = stamp;
  // Cosmetic, wall clock: a stamp is gone after its animation, also while paused.
  removeTimer = setTimeout(() => {
    stamp.remove();
    if (current === stamp) current = null;
    removeTimer = null;
  }, STAMP_SHOW_MS);
  return true;
}

export function mountStamps(store: Store<GameState>): () => void {
  if (layer) throw new Error('mountStamps: already mounted');
  storeRef = store;
  const layerEl = requireById<HTMLElement>('stampLayer');
  layerEl.style.setProperty('--stamp-in-ms', `${STAMP_IN_MS}ms`);
  layerEl.style.setProperty('--stamp-show-ms', `${STAMP_SHOW_MS}ms`);
  layer = layerEl;

  const offs = [
    on('clear-of-planet', () => { showStamp(STAMP_TEXT.clearOfPlanet, 'plain'); }),
    on('loop-closed', () => { showStamp(STAMP_TEXT.captured, 'good'); }),
    on('locked', () => { showStamp(STAMP_TEXT.locked, 'good'); }),
    on('accepted', () => { showStamp(STAMP_TEXT.accepted, 'plain'); }),
    on('stranded', () => { showStamp(STAMP_TEXT.stranded, 'danger'); }),
    on('crashed', () => { showStamp(STAMP_TEXT.crashed, 'danger'); }),
    on('escaped', () => { showStamp(STAMP_TEXT.escaped, 'danger'); }),
    // A scripted fault names the file it broke (ENGINE I/O FAULT): the kid's first clue where to look.
    on('file-fault', ({ role }) => {
      const text = FAULT_STAMP[role];
      if (!text) throw new Error(`Stamp: no FAULT_STAMP for a fault on '${role}'`);
      showStamp(text, 'danger');
    }),
    // WP9: debris names the rack it hit (`HIT · RACK C`, §6.8); a correction that takes the path off the cloud
    // gets CLEAR OF THE DEBRIS, the twin of CLEAR OF THE PLANET. A belt's hits are many and small: no stamp.
    on('zone-hit', ({ kind, racks }) => { if (kind === 'debris') showStamp(ZONE_STAMP_TEXT.hit(racksText(racks)), 'danger'); }),
    on('zone-forecast', ({ from, to }) => { if (from === 'hit' && to === 'clear') showStamp(ZONE_STAMP_TEXT.clear, 'good'); }),
    // ...and the dodge's countdown running out (WP9 review round 2, the lead's ruling: said once, loudly).
    on('dodge-lapsed', () => { showStamp(ZONE_STAMP_TEXT.tooLate, 'danger'); }),
    // WP10: THE DEAL's answer, with its cost (the lead's note: both answers cost something you can see). An ACCEPT gave
    // a pod's driver away; a REFUSE, or no answer, makes it bite faster. A withdrawn offer stamps nothing.
    on('deal', ({ outcome, pod }) => {
      if (outcome === 'accepted') showStamp(HOLLOW_DEAL.stampAccepted(podCode(pod)), 'danger');
      else if (outcome === 'refused') showStamp(HOLLOW_DEAL.stampRefused, 'danger');
      else if (outcome === 'timeout') showStamp(HOLLOW_DEAL.stampTimeout, 'danger');
    }),
    // WP11 part 2: a HOLLOW verb stopped by the kid's tool in its last seconds (§3.5's BLOCKED, §5.3 moment 13).
    on('verb-blocked', () => { showStamp(HOLLOW_VERB.stamp, 'good'); }),
  ];

  return () => {
    offs.forEach((off) => off());
    if (removeTimer !== null) clearTimeout(removeTimer);
    current?.remove();
    current = null;
    layer = null;
    storeRef = null;
    lastShownAt.clear();
  };
}
