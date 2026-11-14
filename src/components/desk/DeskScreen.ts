// Playtest 1: Track B-DESK owns this file (docs/phase3/impl/playtest-1-plan.md §3.6, §4 Batch B): everything inside the
// desk screen. B-ORDER owns how the desk is reached (run.ts openDesk, deskUiOnOpen). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ChartNode } from '@systems/desk';
import { pushModal, registerKeys } from '@systems/input';
import {
  deskCandidates, selectShip, cycleShip, cardModel, chartModel, deskSteps, deskOpeningBeat, deskControlLine, deskOpening,
  openDeskWindow, toggleRequest, deskTabBadges, deskDepartures, chartLegend, firstPickWaits, deskEnter, disarmTraining,
} from '@systems/desk';
import { trainingModel } from '@systems/training-model';
import { repoModel } from '@systems/repository';
import type { RepoFileId } from '@/types/repo';
import { setCourse } from '@systems/run';
import { currentSlot, shipSummaryAt } from '@systems/map-run';
import { traceMeter } from '@systems/hollow-hud';
import { unitName } from '@systems/say';
import { play } from '@systems/audio';
import { make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { paintTraceMeter } from '@components/hud/TraceMeter';
import { mountStarChart } from '@components/desk/StarChart';
import { renderShipCard } from '@components/desk/ShipCard';
import { buildDeskTabs, shownTab, type DeskTab } from '@components/desk/DeskTabs';
import { renderRepository } from '@components/desk/RepositoryWindow';
import { mountInboxView } from '@components/desk/InboxView';
import { mountTrainingWindow } from '@components/desk/TrainingWindow';
import { TRAINING_TEXT } from '@data/training-text';
import { MAP_TEXT } from '@data/map-text';
import { REPO_FILE_IDS } from '@data/repository';
import { DESK_GREY_STEP_MS, DESK_TYPE_CPS, DESK_SHEET_PEEK_PX } from '@data/tuning';

// The DESK (phase 3 slice 3a; 02-map §3.10, §4; slice-3a-plan §3): between a ship's end and its PACKET, in amber
// whatever screen the kid was on (both clocks are stopped). Top to bottom:
// • the head: STAR CHART, the unit and the galaxy year, the ship being left, the TRACE meter (04 §4);
// • the guidance strip's two steps (a ship, then SET COURSE), the current one lit, and CONTROL's line on a run's first
//   desk, typed; the opening beat's `2 SHIPS NOW OUT OF YOUR REACH`;
// • the STAR CHART window (components/desk/StarChart.ts) with the SHIP CARD docked right (ShipCard.ts);
// • SET COURSE ▸ KESTREL [ENTER], pinned at the bottom.
// A click on a ship in reach selects it (chime) and shows its card; a click on any other ship shows its card too, but
// buzzes and leaves the selection where it was (02 §4: `buzz` on a TOO LATE click); ← → cycle the ships in reach; ENTER
// sets course (lockArp). The opening beat greys the ships whose approach passed since the last desk one by one, each
// with a quiet falling tone (reduced motion: no fade, the same tones and words). On a phone (≤ 768 px) the arm stands
// upright and scrolls, a tap opens the card as a bottom sheet over the chart (a handle or ✕ closes it), and SET COURSE
// stays pinned at the bottom.
// Slice 3b (02 §4; slice-3b-plan §3, §5.2 items 1–3): the right window holds three tabs, CARD / REPOSITORY [R] /
// INBOX [I] (components/desk/DeskTabs.ts) with their badges; R and I open theirs (again: back to the card), Escape goes
// back to the card, and while the REPOSITORY is open the number keys [1]–[7] request (or clear) a row. The guidance strip's
// steps are a list (the first desk has three: a ship, a file, SET COURSE). On a phone the tabs are the sheet's handle: the
// sheet always peeks its tab bar on the arm, and a tab opens it.
// Slice 3c (02 §4; 3c plan §3 steps 4–5): the opening desk of a run ≥ 2 lists the ships that moved on in a box over the
// chart's empty sky (a click puts it away), CONTROL says `UNIT-047 got here first. :)`, the opening beat turns the last
// unit's newly passed colonies green after the greying (a rising chime each), and a key in the chart's corner says what
// the trail's marks are (a phone drops it: the card's LAST UNIT row says it there).
// Playtest 1 (B-DESK, §3.6, Fran's note 15): TRAINING is merged into the REPOSITORY. Its one scrolling host holds two
// halves, FROM EARTH (RepositoryWindow.ts: the requests) over COMPILE HERE (TrainingWindow.ts: the skills, and the cycles
// ledger that says where they come from). The tabs are CARD / REPOSITORY [R] / INBOX [I]. `ui.deskWindow` says which half
// has the keys: 'repository' FROM EARTH ([1]–[7] request a row), 'training' COMPILE HERE ([1] [2] pick a card, ↑ ↓ step
// the grid, ENTER trains an armed cell), so the save codec and run.ts deskUiOnOpen keep 'training' as the alias for it.
// [R] and [T] open their half (scrolled to it) or, when it already has the keys, go back to the card; a click inside a
// half gives it the keys without scrolling.

const PHONE_QUERY = '(max-width: 768px)';
// The REPOSITORY's number keys, one per catalogue row (data/repository.ts REPO_FILE_IDS has seven).
const REQUEST_KEY_CODES: readonly (readonly string[])[] = [1, 2, 3, 4, 5, 6, 7].map((n) => [`Digit${n}`, `Numpad${n}`]);
if (REPO_FILE_IDS.length > REQUEST_KEY_CODES.length) {
  throw new Error(`DeskScreen: ${REQUEST_KEY_CODES.length} request keys for ${REPO_FILE_IDS.length} repository rows`);
}

export function mountDeskScreen(store: Store<GameState>): () => void {
  const root = make('div', 'desk-screen');
  root.id = 'deskScreen';
  root.hidden = true;
  const head = make('div', 'desk-head');
  const title = make('div', 'desk-title', MAP_TEXT.desk.title);
  const where = make('div', 'desk-where');
  const trace = make('span', 'trace-meter desk-trace');
  trace.hidden = true;
  head.append(title, where, trace);

  const guide = make('div', 'desk-guide');
  const stepList = make('span', 'desk-steps');
  const stepText = make('span', 'desk-step-text');
  guide.append(stepList, stepText);
  const control = make('div', 'desk-control');
  const controlTag = make('span', 'desk-control-tag', MAP_TEXT.desk.controlTag);
  const controlText = make('span', 'desk-control-text');
  control.append(controlTag, controlText);
  const beatLine = make('div', 'desk-beat');
  const notes = make('div', 'desk-notes');
  notes.append(control, beatLine);

  const body = make('div', 'desk-body');
  const chartWin = make('div', 'desk-win desk-chart-win');
  const chartTitle = make('div', 'desk-win-title');
  chartTitle.append(make('span', 'desk-win-grip'), make('span', 'desk-win-name', MAP_TEXT.desk.title));
  const chartHost = make('div', 'desk-chart');
  // Slice 3c: the opening desk's departures block (`PETREL · ANOTHER CORE IS ON ITS WAY`), over the chart's empty sky.
  const leaveBox = make('div', 'desk-leave');
  leaveBox.hidden = true;
  // Slice 3c: the key for the trail's marks (systems/desk.ts chartLegend), in the chart's lower-right corner.
  const legend = make('div', 'desk-legend');
  legend.hidden = true;
  legend.setAttribute('aria-hidden', 'true');
  chartWin.append(chartTitle, chartHost, leaveBox, legend);
  let legendKey = '';
  const cardWin = make('aside', 'desk-win desk-card-win');
  const cardTitle = make('div', 'desk-win-title desk-sheet-handle');
  const cardClose = make('button', 'desk-sheet-close', MAP_TEXT.desk.closeSheet);
  cardClose.tabIndex = -1;
  const tabs = buildDeskTabs();
  cardTitle.append(make('span', 'desk-win-grip'), tabs.root, cardClose);
  const cardHost = make('div', 'desk-card');
  // The REPOSITORY: FROM EARTH over COMPILE HERE, one scroll (playtest 1, B-DESK). The run's first desk opens on COMPILE
  // HERE (run.ts deskUiOnOpen's 'training').
  const repoHost = make('div', 'desk-card desk-repo');
  const earthHost = make('div', 'rp-earth');
  const training = mountTrainingWindow(store);
  repoHost.append(earthHost, training.root);
  const inbox = mountInboxView(store, 'desk');
  const inboxHost = make('div', 'desk-card desk-inbox');
  inboxHost.appendChild(inbox.root);
  cardWin.append(cardTitle, cardHost, repoHost, inboxHost);
  body.append(chartWin, cardWin);

  const foot = make('div', 'desk-foot');
  const goBtn = make('button', 'desk-go');
  goBtn.id = 'deskGo';
  goBtn.tabIndex = -1;
  foot.append(goBtn);
  root.append(head, guide, notes, body, foot);
  root.style.setProperty('--sheet-peek', `${DESK_SHEET_PEEK_PX}px`);
  document.body.appendChild(root);

  const phone = window.matchMedia(PHONE_QUERY);
  let closeModal: (() => void) | null = null;
  let shown = false;
  // The ship whose card is up: the selection, or a ship out of reach the kid clicked to read (the selection stays).
  let inspected: number | null = null;
  let sheetOpen = false;
  let beatPending: number[] = [];
  let greenPending: number[] = [];
  // The desk visit whose opening (the greying chimes, CONTROL's typed line, BEAM OUT's blackout) has played: one per ship
  // left, keyed by the run and run.ships.length (the review's m3: every ◀ CHART return replayed it).
  let openedVisit: string | null = null;
  // The REPOSITORY half last scrolled to (null: the REPOSITORY is closed), and whether the half changed by a click inside
  // it (no scroll: the kid is looking at it).
  let scrolledHalf: 'earth' | 'compile' | null = null;
  let halfByClick = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let typing: ReturnType<typeof setInterval> | null = null;
  const stopTimers = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
    if (typing !== null) clearInterval(typing);
    typing = null;
  };

  const chart = mountStarChart(chartHost, {
    portrait: () => phone.matches,
    onHover: (node: Readonly<ChartNode> | null) => { if (node) play('typeTick', { voice: 'sys' }); },
    onPick: (slot) => pick(slot),
  });

  function paint(): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    const from = currentSlot(state.run);
    const here = shipSummaryAt(state.run.map, from);
    const unit = unitName(state.run.unitNumber);
    where.textContent = `${unit} · ${MAP_TEXT.desk.yearLine(state.run.map.galaxyYear)} · ${here.name}`;
    paintTraceMeter(trace, traceMeter(state));
    const steps = deskSteps(state);
    const at = steps.findIndex((step) => !step.done);
    // The steps as a list (3a had two hard-coded; 3b's first desk has three, slice 4 prepends TRAINING).
    while (stepList.childElementCount < steps.length) stepList.appendChild(make('span', 'desk-step'));
    while (stepList.childElementCount > steps.length) stepList.lastElementChild?.remove();
    steps.forEach((step, i) => {
      const el = stepList.children[i] as HTMLElement;
      el.textContent = `${i + 1} ${step.label}`;
      el.dataset.step = step.id;
      el.classList.toggle('done', step.done);
      el.classList.toggle('now', i === at);
    });
    stepText.textContent = steps[at]?.text ?? '';
    const selected = state.ui.deskSelected;
    const course = steps.find((step) => step.id === 'set-course')!;
    // Slice 4: the run's first desk waits for the required first pick (desk.ts firstPickWaits): the bar says so.
    const blocked = firstPickWaits(state);
    // Review M3: while a TRAINING cell is armed the bar shows what ENTER does (`TRAIN ▸ 1 CYCLE [ENTER]`), and a click on it
    // does the same; SPACE still sets course (the step says so).
    const trains = deskEnter(state) === 'train' ? trainingModel(state).detail?.action ?? null : null;
    goBtn.dataset.does = trains === null ? 'set-course' : 'train';
    renderKeyCaps(goBtn, trains !== null ? trains.label : blocked ? TRAINING_TEXT.chooseFirst : course.text);
    goBtn.classList.toggle('waiting', trains !== null ? !trains.enabled : selected === null || blocked);
    goBtn.classList.toggle('blocked', trains === null && blocked);
    const chartNow = chartModel(state);
    chart.paint(chartNow, beatPending, greenPending);
    const items = chartLegend(chartNow);
    const key = items.map((item) => `${item.kind}:${item.words}`).join('|');
    if (key !== legendKey) {
      legendKey = key;
      legend.hidden = items.length === 0;
      legend.replaceChildren(...items.map((item) => {
        const line = make('div', `desk-legend-item kind-${item.kind}`);
        line.append(make('span', 'desk-legend-glyph'), make('span', 'desk-legend-words', item.words));
        return line;
      }));
    }
    const showing = inspected ?? selected;
    const tab = state.ui.deskWindow;
    const half = tab === 'repository' ? 'earth' : tab === 'training' ? 'compile' : null;
    tabs.paint(tab, deskTabBadges(state));
    cardHost.hidden = tab !== null;
    repoHost.hidden = half === null;
    inboxHost.hidden = tab !== 'inbox';
    root.dataset.tab = shownTab(tab);
    if (half === null) delete root.dataset.half;
    else root.dataset.half = half;
    if (tab === null) renderShipCard(cardHost, showing === null ? null : cardModel(state, showing), MAP_TEXT.desk.pickShip);
    // The REPOSITORY's ETAs are for the ship SET COURSE goes to (the selection, not a ship only inspected).
    if (half !== null) {
      renderRepository(earthHost, repoModel(state, selected));
      training.paint();
    }
    if (tab === 'inbox') inbox.paint();
    if (half !== scrolledHalf) {
      if (half !== null && !halfByClick) repoHost.scrollTop = half === 'earth' ? 0 : training.root.offsetTop;
      scrolledHalf = half;
    }
    halfByClick = false;
    root.classList.toggle('sheet-open', sheetOpen && (showing !== null || tab !== null));
    root.classList.toggle('has-card', showing !== null || tab !== null);
    root.classList.add('has-tabs');
  }

  // A tab (a click, R, I, Escape): the card is null. On a phone a tab opens the sheet it lives in. A key ticks here; a click
  // already ticked on its pointerdown (systems/input.ts emitUiClicks: the review's double click sound).
  function showTab(next: DeskTab, byKey = true): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    const id = next === 'card' ? null : next;
    if (state.ui.deskWindow === id && id === null && !phone.matches) return;
    if (byKey) play('uiClick');
    openDeskWindow(store, id);
    if (phone.matches) sheetOpen = true;
    paint();
  }
  // R, T and I open their tab, or go back to the card when it is already open.
  function toggleTab(id: Exclude<DeskTab, 'card'>): void {
    showTab(store.getState().ui.deskWindow === id ? 'card' : id);
  }

  // A REQUEST toggle (a click on a row, or its number key while the REPOSITORY is open).
  function request(file: RepoFileId): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    const next = toggleRequest(store, file);
    play('chime', { falling: next === null });
    paint();
  }
  function requestRow(index: number): void {
    const state = store.getState();
    if (state.run.phase !== 'desk' || state.ui.deskWindow !== 'repository') return;
    const row = repoModel(state, state.ui.deskSelected).available[index];
    if (row === undefined) { play('buzz'); return; }
    request(row.id);
  }

  function pick(slot: number): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    if (slot === currentSlot(state.run)) return;
    inspected = slot;
    sheetOpen = true;
    if (selectShip(store, slot)) {
      inspected = null;
      play('chime', { falling: false });
    } else {
      play('buzz');
    }
    paint();
  }

  function go(): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    // Slice 4: SET COURSE waits for the first pick (setCourse throws on it): a buzz, and TRAINING comes up.
    if (firstPickWaits(state)) {
      play('buzz');
      if (state.ui.deskWindow !== 'training') showTab('training', false);
      return;
    }
    // A TRAIN bar still filling stops here (goTransmit clears it: review M4), so nothing lands, now or after ◀ CHART.
    if (state.ui.deskSelected === null || !deskCandidates(state).includes(state.ui.deskSelected)) {
      play('buzz');
      return;
    }
    play('lockArp');
    setCourse(store, state.ui.deskSelected);
  }

  // A key TRAINING takes while its tab is open (`act` says whether it did; then it ticks).
  function trainingKey(act: () => boolean): boolean {
    const state = store.getState();
    if (state.run.phase !== 'desk' || state.ui.deskWindow !== 'training') return false;
    if (!act()) return false;
    play('uiClick');
    return true;
  }

  function cycle(step: 1 | -1): void {
    if (store.getState().run.phase !== 'desk') return;
    inspected = null;
    cycleShip(store, step);
    play('chime', { falling: false });
    paint();
  }

  // CONTROL's line, typed (wall time; reduced motion, or back from the PACKET, shows it whole).
  function typeControl(line: string | null, typed: boolean): void {
    control.hidden = line === null;
    controlText.textContent = '';
    if (line === null) return;
    if (store.getState().ui.reducedMotion || !typed) { controlText.textContent = line; return; }
    let shownChars = 0;
    typing = setInterval(() => {
      shownChars += 1;
      controlText.textContent = line.slice(0, shownChars);
      if (shownChars % 3 === 0) play('typeTick', { voice: 'control' });
      if (shownChars >= line.length && typing !== null) { clearInterval(typing); typing = null; }
    }, 1000 / DESK_TYPE_CPS);
  }

  // The opening beat: the ships whose approach passed since the last desk turn grey one by one. `replay` false (back from
  // the PACKET): they are grey already and the line is up, in silence.
  // Slice 3c: then the last unit's colonies the year has passed turn green one by one, each with a soft rising note.
  function openingBeat(replay: boolean, delayMs: number): void {
    const beat = deskOpeningBeat(store.getState());
    beatLine.textContent = beat.line ?? '';
    if (!replay) {
      beatPending = [];
      greenPending = [];
      beatLine.hidden = beat.line === null;
      return;
    }
    beatPending = [...beat.greyed];
    greenPending = [...beat.greened];
    beatLine.hidden = true;
    beat.greyed.forEach((slot, i) => {
      timers.push(setTimeout(() => {
        beatPending = beatPending.filter((s) => s !== slot);
        chart.ungrey(slot);
        play('chime', { falling: true });
        if (i === beat.greyed.length - 1) beatLine.hidden = false;
      }, delayMs + (i + 1) * DESK_GREY_STEP_MS));
    });
    const greenFrom = delayMs + (beat.greyed.length + 1) * DESK_GREY_STEP_MS;
    beat.greened.forEach((slot, i) => {
      timers.push(setTimeout(() => {
        greenPending = greenPending.filter((s) => s !== slot);
        chart.green(slot);
        play('chime', { falling: false });
      }, greenFrom + i * DESK_GREY_STEP_MS));
    });
  }

  // The opening desk's departures block (systems/desk.ts deskDepartures): the ships that moved on since the last run.
  function paintDepartures(): void {
    const block = deskDepartures(store.getState());
    leaveBox.hidden = block === null;
    if (block === null) { leaveBox.replaceChildren(); return; }
    leaveBox.title = block.all.join('\n');
    leaveBox.replaceChildren(
      make('div', 'desk-leave-title', block.title),
      ...block.lines.map((line) => make('div', 'desk-leave-line', line)),
      ...(block.more === null ? [] : [make('div', 'desk-leave-more', block.more)]),
    );
  }

  function open(): void {
    if (shown) return;
    shown = true;
    if (!closeModal) closeModal = pushModal('desk');
    inspected = null;
    stopTimers();
    const state = store.getState();
    // A desk that opens on a tab (the REPOSITORY after the last rm: openDesk) shows it at once, on a phone too.
    sheetOpen = phone.matches && state.ui.deskWindow !== null;
    // systems/desk.ts deskOpening: the opening once per desk visit; after a BEAM OUT the old ship's windows go black first
    // (Telemetry's blackout), and the desk comes up out of the dark, once (the review's m3, m4).
    const opening = deskOpening(state, openedVisit);
    openedVisit = opening.visit;
    const first = opening.replay;
    root.classList.toggle('reduced', state.ui.reducedMotion);
    const blackoutMs = opening.blackoutSec * 1000;
    root.hidden = blackoutMs > 0;
    if (blackoutMs > 0) timers.push(setTimeout(() => { root.hidden = false; }, blackoutMs));
    openingBeat(first, blackoutMs);
    paintDepartures();
    if (first && blackoutMs > 0) {
      control.hidden = true;
      timers.push(setTimeout(() => typeControl(deskControlLine(store.getState()), true), blackoutMs));
    } else {
      typeControl(deskControlLine(state), first);
    }
    paint();
  }
  function close(): void {
    if (!shown) return;
    shown = false;
    stopTimers();
    beatPending = [];
    greenPending = [];
    scrolledHalf = null;
    root.hidden = true;
    closeModal?.();
    closeModal = null;
  }

  // The bar does what it shows: TRAIN while a cell is armed, else SET COURSE.
  const onGo = (event: MouseEvent): void => {
    event.stopPropagation();
    if (deskEnter(store.getState()) === 'train') { training.press(); paint(); return; }
    go();
  };
  const onClose = (event: MouseEvent): void => { event.stopPropagation(); sheetOpen = false; paint(); };
  const onHandle = (event: MouseEvent): void => {
    const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>('.desk-tab')?.dataset.tab as DeskTab | undefined;
    if (tab !== undefined) { event.stopPropagation(); showTab(tab, false); return; }
    if (!phone.matches || event.target === cardClose) return;
    sheetOpen = !sheetOpen;
    paint();
  };
  const onRepoClick = (event: MouseEvent): void => {
    const file = (event.target as HTMLElement | null)?.closest<HTMLElement>('.rp-row')?.dataset.file as RepoFileId | undefined;
    if (file === undefined) return;
    event.stopPropagation();
    request(file);
  };
  earthHost.addEventListener('click', onRepoClick);
  // A click in a half gives it the keys (before the half's own handler: a cell clicked in COMPILE HERE is armed for ENTER).
  const focusHalf = (id: 'repository' | 'training') => (): void => {
    const state = store.getState();
    if (state.run.phase !== 'desk' || state.ui.deskWindow === id) return;
    halfByClick = true;
    openDeskWindow(store, id);
  };
  const onEarthDown = focusHalf('repository');
  const onCompileDown = focusHalf('training');
  earthHost.addEventListener('click', onEarthDown, true);
  training.root.addEventListener('click', onCompileDown, true);
  // The departures block goes away on a click (it is the opening desk's news, not a control).
  const onLeaveClick = (event: MouseEvent): void => { event.stopPropagation(); leaveBox.hidden = true; };
  leaveBox.addEventListener('click', onLeaveClick);
  goBtn.addEventListener('click', onGo);
  cardClose.addEventListener('click', onClose);
  cardTitle.addEventListener('click', onHandle);
  const offs = [
    // ENTER trains only a TRAINING cell the kid picked this visit (03 §4: [1], then ENTER; review M3: systems/desk.ts
    // deskEnter); otherwise it sets course. SPACE always sets course.
    registerKeys({
      layer: 'desk', codes: ['Enter', 'NumpadEnter'],
      onDown: () => { if (deskEnter(store.getState()) !== 'train' || !trainingKey(() => training.press())) go(); paint(); },
    }),
    registerKeys({ layer: 'desk', codes: ['Space'], onDown: go }),
    registerKeys({ layer: 'desk', codes: ['ArrowRight'], onDown: () => cycle(1) }),
    registerKeys({ layer: 'desk', codes: ['ArrowLeft'], onDown: () => cycle(-1) }),
    // ↑ ↓ move through the grid while TRAINING is open (from visit 2), else they cycle the ships like → ←.
    registerKeys({ layer: 'desk', codes: ['ArrowDown'], onDown: () => { if (!trainingKey(() => training.step(1))) cycle(1); } }),
    registerKeys({ layer: 'desk', codes: ['ArrowUp'], onDown: () => { if (!trainingKey(() => training.step(-1))) cycle(-1); } }),
    registerKeys({
      layer: 'desk', codes: ['Escape'],
      onDown: () => {
        if (store.getState().ui.trainingHoldSec !== null) { training.cancel(); paint(); return; }
        // An armed cell is disarmed first (review M3): the tab stays, ENTER sets course again.
        if (deskEnter(store.getState()) === 'train') { disarmTraining(store); training.paint(); paint(); return; }
        if (store.getState().ui.deskWindow !== null && !(phone.matches && sheetOpen)) { showTab('card'); return; }
        if (sheetOpen) { sheetOpen = false; paint(); }
      },
    }),
    registerKeys({ layer: 'desk', codes: ['KeyR'], onDown: () => toggleTab('repository') }),
    registerKeys({ layer: 'desk', codes: ['KeyI'], onDown: () => toggleTab('inbox') }),
    registerKeys({ layer: 'desk', codes: ['KeyT'], onDown: () => toggleTab('training') }),
    // The number keys request a REPOSITORY row there, and pick a card on TRAINING's first visit ([1], [2]).
    ...REQUEST_KEY_CODES.map((codes, index) => registerKeys({
      layer: 'desk', codes, onDown: () => { if (!trainingKey(() => training.card(index))) requestRow(index); },
    })),
  ];
  const unsubPhase = store.subscribe((s) => s.run.phase, (phase) => { if (phase === 'desk') open(); else close(); });
  const unsubPick = store.subscribe((s) => s.ui.deskSelected, () => { if (shown) paint(); });
  const unsubTrace = store.subscribe((s) => s.run.threat.trace, () => { if (shown) paint(); });
  // 3b: the tab (openDesk opens the REPOSITORY after the last rm), the request and the read marks.
  const unsubTabs = store.subscribe(
    (s) => `${s.ui.deskWindow ?? ''}|${s.run.repo.pick ?? ''}|${s.run.inbox.read.length}|${s.run.skills.pending.length}`
      + `|${s.ui.trainingArmed ? 1 : 0}|${JSON.stringify(s.ui.trainingSel)}|${s.ui.trainingHoldSec === null ? 0 : 1}`,
    () => {
      if (!shown) return;
      const tabNow = store.getState().ui.deskWindow;
      if (phone.matches && (tabNow === 'repository' || tabNow === 'training') && !sheetOpen) sheetOpen = true;
      paint();
    },
  );
  if (store.getState().run.phase === 'desk') open();

  return () => {
    goBtn.removeEventListener('click', onGo);
    cardClose.removeEventListener('click', onClose);
    cardTitle.removeEventListener('click', onHandle);
    offs.forEach((off) => off());
    unsubPhase();
    unsubPick();
    unsubTrace();
    unsubTabs();
    earthHost.removeEventListener('click', onRepoClick);
    earthHost.removeEventListener('click', onEarthDown, true);
    training.root.removeEventListener('click', onCompileDown, true);
    leaveBox.removeEventListener('click', onLeaveClick);
    inbox.destroy();
    training.destroy();
    close();
    chart.destroy();
    root.remove();
  };
}
