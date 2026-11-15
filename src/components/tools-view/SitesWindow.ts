// Slice 6: Track SITES owns this file (docs/phase3/impl/slice-6-plan.md §2.14, §6.2): the SITES window (amber, draggable,
// docked as SITES, shown only on POOR planets): its header (site data, MAPPED %, the rim strip, SURVEY's state and version,
// [ PAUSE ]), the LZs first and then the free sites, and a click's pill row (`SET AS LZ-B (800)`, or the refusal dimmed;
// systems/survey-model.ts assignableLzs, survey.ts assignSite). Playtest 1, C-SITES (note 18): once the landing pins the LZs,
// the row ends with `OPEN AS LZ-C (1,200)` (survey.ts openSite), and a dimmed pill still takes a click, which flashes its
// reason on the strip (`LZ-B HAS PODS DOWN — OPEN SITE 4 AS LZ-C`). It paints systems/survey-hud.ts sitesWindowModel.
// index.html holds its container (`#sitesWin`, hidden, class survey-only) and its dock item; this module marks the page
// `body.survey` while a POOR planet is flown (styles/survey.css shows both then), and closes the window (and a phone's tab)
// when that ends (review M6). It opens itself (SITES_AUTO_OPEN) at the ship's first find, and once at the boot of a POOR
// planet flown without SURVEY (CONTROL's guesses, UNSURVEYED). A click on a free site's bracket anywhere (the NAV PLOT's
// survey layer, the GROUND TRACK: any `[data-site]` that names one, review B1) selects it here.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { on, emit } from '@systems/events';
import { onGameTick } from '@systems/clock';
import { play } from '@systems/audio';
import { sitesWindowModel, openRefusalWords, type SitesRow, type SitesWindowModel } from '@systems/survey-hud';
import { surveyVersion } from '@state/survey-selectors';
import { assignSite, openSite, toggleSurveyPause } from '@systems/survey';
import { openToolWindow, closeToolWindow } from '@components/tools-view/ToolsTabs';
import { requireById, make } from '@components/dom';
import { SITES_TEXT, sitesFlashReason } from '@data/sites-text';
import { SITES_AUTO_OPEN } from '@data/tuning';

// The site the kid clicked (its pills show under it), shared with the NAV PLOT's layer, which marks it. Cleared by a move, a
// new world, and a second click on it.
let selected: string | null = null;
let repaint: (() => void) | null = null;

export function selectedSite(): string | null {
  return selected;
}

// Selects a free site (a click on its row, or its bracket on the plot or the GROUND TRACK), opening the window: on a phone
// too, since the kid asked for it.
export function selectSite(site: string | null): void {
  selected = site;
  if (site !== null && repaint !== null) openToolWindow('sites', { onPhone: true });
  repaint?.();
}

export function mountSitesWindow(store: Store<GameState>): () => void {
  const win = requireById('sitesWin');
  const body = requireById('sitesBody');

  const head = make('div', 'sw-head');
  const title = make('span', 'sw-title');
  const pauseBtn = make('button', 'sw-pause');
  pauseBtn.tabIndex = -1;
  pauseBtn.title = SITES_TEXT.window.pauseTitle;   // the model's own title (review m2: v3's pause frees no thread) on paint
  head.append(title, pauseBtn);
  const rim = make('div', 'sw-rim');
  const status = make('div', 'sw-status');
  const lzHead = make('div', 'sw-section', SITES_TEXT.window.lzHead);
  const lzList = make('div', 'sw-list sw-lzs');
  const siteHead = make('div', 'sw-section', SITES_TEXT.window.foundHead);
  const siteList = make('div', 'sw-list sw-sites');
  const empty = make('div', 'sw-empty');
  const hint = make('div', 'sw-hint');
  body.append(head, rim, status, lzHead, lzList, siteHead, siteList, empty, hint);

  const patch = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

  // A row: its words, the ground's word in its own colour (★ in the good tone, ✕ in the warning one).
  function rowNode(row: SitesRow): HTMLElement {
    const node = make(row.selectable ? 'button' : 'div', `sw-row kind-${row.kind}`);
    if (row.selectable) (node as HTMLButtonElement).tabIndex = -1;
    node.dataset.site = row.selectable ? row.site ?? '' : '';
    node.dataset.ground = row.ground.known ?? 'unknown';
    node.classList.toggle('selected', row.selected);
    node.classList.toggle('moved', row.moved);
    // The ground goes to the right edge (the row's words end `… · FLAT ★★★`): its stars a size up, the font has none.
    const cut = row.kind === 'wreck' ? row.text.length : row.text.length - row.ground.word.length;
    node.append(make('span', 'sw-row-text', row.text.slice(0, cut).replace(/ · $/, '')));
    if (cut < row.text.length) {
      const ground = make('span', 'sw-ground');
      const word = row.text.slice(cut);
      const star = word.indexOf('★');
      if (star < 0) ground.textContent = word;
      else ground.append(word.slice(0, star), make('span', 'sw-stars', word.slice(star)));
      node.append(ground);
    }
    return node;
  }

  function pillsNode(model: SitesWindowModel): HTMLElement {
    const row = make('div', 'sw-pills');
    for (const pill of model.pills) {
      const button = make('button', `sw-pill kind-${pill.kind}${pill.refusal === null ? '' : ' refused'}`, pill.text);
      button.tabIndex = -1;
      button.dataset.lz = pill.lz;
      button.dataset.kind = pill.kind;
      // Not `disabled`: a disabled button takes no click, and a refused pill's click says why on the strip.
      if (pill.refusal !== null) button.setAttribute('aria-disabled', 'true');
      if (pill.flash !== null) button.dataset.flash = pill.flash;
      row.appendChild(button);
    }
    return row;
  }

  let lastKey = '';
  let wasShown = false;
  let bootOpenedRev = -1;

  function paint(): void {
    const state = store.getState();
    const model = sitesWindowModel(state, selected);
    const shown = model !== null;
    if (shown !== wasShown) {
      document.body.classList.toggle('survey', shown);
      // Gone (the desk, or a GOOD planet next): the window and a phone's SITES tab close, so no blank panel stays (M6).
      if (!shown) closeToolWindow('sites');
      wasShown = shown;
    }
    if (model === null) return;
    // Once per ship: a POOR planet flown without SURVEY opens on CONTROL's guesses (SITES_AUTO_OPEN; not a phone's tab).
    if (SITES_AUTO_OPEN && bootOpenedRev !== state.run.rev) {
      bootOpenedRev = state.run.rev;
      if (surveyVersion(state) === 0) openToolWindow('sites');
    }
    // A selection that is no free site any more (an LZ took it, a wreck was clicked) lets go.
    if (selected !== null && !model.sites.some((row) => row.selected)) selected = null;
    if (win.hidden) return;
    const key = JSON.stringify(model);
    if (key === lastKey) return;
    lastKey = key;
    patch(title, model.header);
    pauseBtn.hidden = model.pause === null;
    patch(pauseBtn, model.pause?.label ?? '');
    pauseBtn.classList.toggle('paused', model.pause?.paused === true);
    if (model.pause !== null && pauseBtn.title !== model.pause.title) pauseBtn.title = model.pause.title;
    patch(rim, model.rim);
    patch(status, model.status);
    status.className = `sw-status tone-${model.tone}`;
    lzList.replaceChildren(...model.lzs.map(rowNode));
    const nodes: HTMLElement[] = [];
    let pills: HTMLElement | null = null;
    for (const row of model.sites) {
      nodes.push(rowNode(row));
      if (row.selected && model.pills.length > 0) { pills = pillsNode(model); nodes.push(pills); }
    }
    siteList.replaceChildren(...nodes);
    // A site picked low in the list: its pills scrolled into the window's view. By hand, in the body alone: scrollIntoView
    // would also scroll the desk's overflow-hidden containers.
    if (pills !== null) {
      const below = pills.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
      if (below > 0) body.scrollTop += below + 4;
    }
    empty.hidden = model.empty === null;
    patch(empty, model.empty ?? '');
    hint.hidden = model.hint === null;
    patch(hint, model.hint ?? '');
  }

  const onBodyClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const pill = target?.closest<HTMLButtonElement>('.sw-pill');
    if (pill) {
      event.stopPropagation();
      const lz = pill.dataset.lz;
      if (lz === undefined || selected === null) return;
      // A refused pill: its reason on the strip (the 'refused' event also buzzes: audio-cues).
      if (pill.dataset.flash !== undefined) {
        emit('refused', { reason: sitesFlashReason(pill.dataset.flash) });
        return;
      }
      const siteId = selected;
      const site = store.getState().landing.survey.sites.find((one) => one.id === siteId);
      if (site === undefined) return;
      if (pill.dataset.kind === 'open') {
        // Refused at the click (no Core thread free for the commit, or the model was a tick old): its words on the strip.
        const refusal = openSite(store, siteId);
        if (refusal === null) selected = null;
        else emit('refused', { reason: sitesFlashReason(SITES_TEXT.flash(openRefusalWords(store.getState(), site, refusal))) });
      } else {
        const refusal = assignSite(store, lz, siteId);
        if (refusal === null) selected = null;
        else {
          const fresh = sitesWindowModel(store.getState(), siteId)?.pills.find((one) => one.kind === 'move' && one.lz === lz);
          emit('refused', { reason: sitesFlashReason(fresh?.flash ?? refusal) });
        }
      }
      lastKey = '';
      paint();
      return;
    }
    if (target?.closest('.sw-pause')) {
      event.stopPropagation();
      play('uiClick');
      toggleSurveyPause(store);
      paint();
    }
    // A site's row is a `[data-site]` like the plot's and the GROUND TRACK's brackets: the document's handler selects it.
  };
  body.addEventListener('click', onBodyClick);

  // Any free site's node on the page (a row here, a bracket on the plot or the GROUND TRACK) selects it; a second click on the
  // selected one lets it go.
  const onDocClick = (event: MouseEvent): void => {
    const node = (event.target as Element | null)?.closest<HTMLElement | SVGElement>('[data-site]:not([data-site=""])');
    const site = node?.dataset.site;
    if (site === undefined || !document.body.classList.contains('survey')) return;
    play('uiClick');
    selectSite(selected === site ? null : site);
  };
  document.addEventListener('click', onDocClick);

  const offFound = on('site-found', ({ first }) => { if (first && SITES_AUTO_OPEN) openToolWindow('sites'); });
  const offMoved = on('lz-moved', () => { selected = null; });
  const offTick = onGameTick(() => paint());
  const unsub = store.subscribe(
    (s) => `${s.run.rev}|${s.run.phase}|${s.landing.survey.site}|${s.landing.sitesRev}|${s.landing.survey.paused}|${s.ui.memoryRev}`,
    () => paint(),
  );
  const offWorld = store.subscribe((s) => s.run.rev, () => { selected = null; });
  // Opened (the dock, a tab, or the code above): painted at once, the clock paused too.
  const opened = new MutationObserver(() => { lastKey = ''; paint(); });
  opened.observe(win, { attributes: true, attributeFilter: ['hidden'] });
  repaint = () => { lastKey = ''; paint(); };
  paint();

  return () => {
    body.removeEventListener('click', onBodyClick);
    document.removeEventListener('click', onDocClick);
    offFound();
    offMoved();
    offTick();
    unsub();
    offWorld();
    opened.disconnect();
    repaint = null;
    selected = null;
    document.body.classList.remove('survey');
  };
}
