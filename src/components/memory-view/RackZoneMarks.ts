import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { on } from '@systems/events';
import { getSensedPrediction } from '@systems/predict';
import { capabilitiesNow } from '@systems/capabilities';
import { rackZoneTags, type RackZoneTag } from '@systems/flight-hud';
import { requireById } from '@components/dom';
import { RACK_TAG_PAINT_HZ, RACK_FLASH_MS } from '@data/tuning';

// The MIND's side of a hazard zone (§3.3 P3, §6.8; the lead's note for WP9: "the debris cloud must name the rack
// it will hit well before contact ... legible on the NAV PLOT and in MIND"):
// • on the strip, a tag under the rack's name while a zone is coming for it (`DEBRIS` over `03:30`, pulsing; blind:
//   `DEBRIS?`), and `HIT` over `−25%` once debris hit it, for the rest of the ship. The rack's label is edged in
//   the tag's colour. A rack the path clears has no tag: steering IN early makes it go away;
// • on the amber mini-strip (inside the MIND chip), the rack's row outlined red while debris is coming for it,
//   so the kid flying the ship sees which colonists are in the line of fire;
// • the moment of a hit: the rack's rows flash red on the screen that is up (the strip in blue, the mini-strip in
//   amber), a belt hit on the rack of the file it struck.
// Everything reads flight-hud's rackZoneTags (the sensed prediction: what the instruments can tell), the same
// verdict the NAV PLOT draws. Tags are re-attached after every strip rebuild and patched at RACK_TAG_PAINT_HZ.

const PAINT_EVERY_SEC = 1 / RACK_TAG_PAINT_HZ;
const MINI_CLASSES = ['ms-zone-hit', 'ms-zone-unknown'] as const;

function tagIn(label: HTMLElement): HTMLElement {
  let tag = label.querySelector<HTMLElement>(':scope > .rack-zone-tag');
  if (!tag) {
    tag = document.createElement('span');
    tag.className = 'rack-zone-tag';
    tag.hidden = true;
    label.appendChild(tag);
  }
  return tag;
}

function paintTag(tag: HTMLElement, model: RackZoneTag | undefined): void {
  if (!model) {
    if (!tag.hidden) tag.hidden = true;
    return;
  }
  tag.hidden = false;
  // A debris hit still to come pulses; one that landed stays still.
  const cls = `rack-zone-tag tone-${model.tone}${model.verdict === 'hit' ? ' coming' : ''}`;
  if (tag.className !== cls) tag.className = cls;
  while (tag.children.length > model.lines.length) tag.lastElementChild?.remove();
  model.lines.forEach((line, i) => {
    let lineEl = tag.children[i] as HTMLElement | undefined;
    if (!lineEl) {
      lineEl = document.createElement('span');
      tag.appendChild(lineEl);
    }
    if (lineEl.textContent !== line) lineEl.textContent = line;
  });
}

function flashBox(layer: HTMLElement, element: Element): void {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const box = document.createElement('div');
  box.className = 'zone-fx rack-flash';
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  layer.appendChild(box);
  setTimeout(() => box.remove(), RACK_FLASH_MS);
}

export function mountRackZoneMarks(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const miniStrip = requireById('miniStrip');
  const layer = document.createElement('div');
  layer.className = 'zone-fx-layer';
  layer.style.setProperty('--rack-flash-ms', `${RACK_FLASH_MS}ms`);
  document.body.appendChild(layer);

  function paint(): void {
    const state = store.getState();
    const tags = state.level.zones.length === 0 ? [] : rackZoneTags(state, getSensedPrediction(), capabilitiesNow(state).plot);
    memWrap.querySelectorAll<HTMLElement>('.addr-row.rack-start').forEach((row) => {
      const label = row.querySelector<HTMLElement>(':scope > .addr-label');
      if (!label) throw new Error('RackZoneMarks: a rack row without its .addr-label');
      const model = tags.find((tag) => tag.rack === row.dataset.rack);
      // Racks no zone names never get a tag element: nothing to hide on ships 1–2.
      if (!model && !label.querySelector('.rack-zone-tag')) return;
      paintTag(tagIn(label), model);
    });
    miniStrip.querySelectorAll<HTMLElement>('.ms-row').forEach((row) => {
      const model = tags.find((tag) => tag.rack === row.dataset.rack);
      const want = model?.verdict === 'hit' ? 'ms-zone-hit' : model?.verdict === 'unknown' ? 'ms-zone-unknown' : null;
      for (const cls of MINI_CLASSES) row.classList.toggle(cls, cls === want);
    });
  }

  // After the strip's and the mini-strip's rebuilds (they subscribe first), a new ship, the screen switching.
  const unsub = store.subscribe(
    (s) => `${s.ui.memoryRev}|${s.run.rev}|${s.ui.mode}|${s.run.phase}`,
    () => paint(),
  );
  let sincePaint = 0;
  const offTick = onPostTick((dtWall) => {
    sincePaint += dtWall;
    if (sincePaint < PAINT_EVERY_SEC) return;
    sincePaint = 0;
    paint();
  });

  // A hit flashes its rack where the kid is looking: the strip's rows in blue, the mini-strip's in amber (the
  // other screen's rows have no size). A belt hit names two racks; it flashes the one its file is in.
  const offHit = on('zone-hit', ({ kind, racks, hits }) => {
    const flashed = kind === 'belt' ? [...new Set(hits.map((hit) => hit.rack))] : racks;
    for (const rack of flashed) {
      const selector = `[data-rack="${CSS.escape(rack)}"]`;
      memWrap.querySelectorAll(`.addr-row${selector}`).forEach((row) => flashBox(layer, row));
      miniStrip.querySelectorAll(`.ms-row${selector}`).forEach((row) => flashBox(layer, row));
    }
    paint();
  });

  paint();
  return () => {
    unsub();
    offTick();
    offHit();
    layer.remove();
  };
}
