// Slice 5: Track FACE owns the resident stamps' wiring here (docs/phase3/impl/slice-5-plan.md §6.2).
// Slice 6: Track SITES owns the survey stamps' wiring here (docs/phase3/impl/slice-6-plan.md §2.14, §6.2).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on } from '@systems/events';
import { requireById } from '@components/dom';
import { screenFocus } from './focus';
import { STAMP_TEXT, FAULT_STAMP } from '@data/script';
import type { SkillId } from '@/types/skill';
import { skillVersionStamp } from '@systems/skills';
import { TRAINING_TEXT, BOOT_SKILL_TEXT } from '@data/training-text';
import { ZONE_STAMP_TEXT } from '@data/zone-text';
import { HOLLOW_DEAL, HOLLOW_VERB } from '@data/hollow-text';
import { racksText } from '@/types/zone';
import { podCode, LANDING_STAMP_TEXT } from '@data/landing-text';
import { THREAT_TEXT } from '@data/threat-text';
import { glitchBurst } from '@systems/glitch';
import { wakeStamp, deletedStamp, curedStamp, signalStamp, type ResidentStamp } from '@systems/resident-hud';
import { SITES_TEXT } from '@data/sites-text';
import { siteLabel } from '@data/survey-text';
import { STAMP_DEBOUNCE_MS, STAMP_IN_MS, STAMP_SHOW_MS, STAMP_MAX_WIDTH_FRAC, SKILL_FLICKER_MS, SURPRISE_GLITCH_LEVEL, SURPRISE_GLITCH_MS } from '@data/tuning';

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

function flickerSkillBadges(skill: SkillId, reduced: boolean): void {
  if (reduced) return;
  document.querySelectorAll<HTMLElement>(`.seg[data-skill="${skill}"] .skill-badge`).forEach((badge) => {
    badge.classList.remove('flicker');
    void badge.offsetWidth;
    badge.classList.add('flicker');
    setTimeout(() => badge.classList.remove('flicker'), SKILL_FLICKER_MS);
  });
}

// Slice 5 (plan §2.11; Track FACE's lines below): a resident's moment, stamped, and the late surprise's small tear.
function showResidentStamp(stamp: ResidentStamp | null, kind: string): void {
  if (stamp === null) return;
  showStamp(stamp.text, stamp.tone, kind);
  if (stamp.glitch) glitchBurst(SURPRISE_GLITCH_LEVEL, SURPRISE_GLITCH_MS);
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
    // Slice 1a (01-landing §2, §4): the run's first pod down, and every pod of a ship down (not on a ship that parked
    // some: that one ends quietly, its report says what happened).
    on('pod-landed', ({ firstOfRun }) => { if (firstOfRun) showStamp(LANDING_STAMP_TEXT.firstLanding, 'good'); }),
    // Phase 3 slice 2 (04 §3.3): the unit's last working rm is gone. Information, loudly: the TERMINAL echoes the rule.
    on('last-rm-lost', () => { showStamp(THREAT_TEXT.lastRmStamp, 'danger'); }),
    on('all-pods-down', () => {
      if (store.getState().landing.pods.every((record) => record.fate.kind === 'down')) showStamp(LANDING_STAMP_TEXT.allDown, 'good');
    }),
    // Phase 3 slice 4 (03 §4; plan §2.7): the boot's TRAINED line stamps `AUTOBURN v2 ONLINE`; a skill's effective version
    // moving stamps the step (`AUTOBURN v2 → v1`) or the way back (`AUTOBURN v2 RESTORED`), and its chip's badge flickers
    // for 400 ms (a colour change with reduced motion). A copy the kid took offline (a repair, a move) stamps nothing on
    // the way down: the repair it is getting is the point (skillVersionStamp).
    on('skill-trained', ({ skill, level }) => { showStamp(BOOT_SKILL_TEXT.online(TRAINING_TEXT.skills[skill].name, level.version), 'good'); }),
    on('skill-version', ({ skill, from, to }) => {
      const stamp = skillVersionStamp(store.getState(), skill, from, to);
      if (stamp === null) return;
      showStamp(stamp.text, stamp.tone, `skill-version-${skill}`);
      flickerSkillBadges(skill, store.getState().ui.reducedMotion);
    }),
    // Slice 5 (04 §4, plan §2.11): the late surprise's wake (`THE SHIP'S OWN AI IS AWAKE · RACK A`, with a small tear), a
    // resident deleted or cured, and a signal fragment found (`SIGNAL · 1/3`).
    on('resident-wake', (payload) => showResidentStamp(wakeStamp(payload), 'resident-wake')),
    on('resident-deleted', () => showResidentStamp(deletedStamp(), 'resident-deleted')),
    on('resident-cured', () => showResidentStamp(curedStamp(), 'resident-cured')),
    on('signal-found', ({ count }) => showResidentStamp(signalStamp(count), 'signal-found')),
    // Slice 6 (plan §2.14, R5): a bad ground an LZ stands on made known, by SURVEY's swath or the first pod down there
    // (`LZ-B · WET ✕`); an LZ moved onto a site (`LZ-B → SITE 4`).
    on('site-revealed', ({ lz, ground }) => { showStamp(SITES_TEXT.stamp.bad(lz, ground), 'danger', `site-revealed-${lz}`); }),
    on('lz-moved', ({ lz, to }) => {
      const site = store.getState().landing.survey.sites.find((candidate) => candidate.id === to);
      if (site === undefined) throw new Error(`Stamp: ${lz} moved to '${to}', which the survey does not have`);
      showStamp(SITES_TEXT.stamp.moved(lz, siteLabel(site)), 'good', `lz-moved-${lz}`);
    }),
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
