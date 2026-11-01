import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ChartNode } from '@systems/desk';
import { pushModal, registerKeys } from '@systems/input';
import {
  deskCandidates, selectShip, cycleShip, cardModel, chartModel, deskSteps, deskOpeningBeat, deskControlLine,
} from '@systems/desk';
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
import { MAP_TEXT } from '@data/map-text';
import { DESK_GREY_STEP_MS, DESK_TYPE_CPS } from '@data/tuning';

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

const PHONE_QUERY = '(max-width: 768px)';

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
  const stepEls = [make('span', 'desk-step'), make('span', 'desk-step')];
  const stepText = make('span', 'desk-step-text');
  guide.append(...stepEls, stepText);
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
  chartWin.append(chartTitle, chartHost);
  const cardWin = make('aside', 'desk-win desk-card-win');
  const cardTitle = make('div', 'desk-win-title desk-sheet-handle');
  const cardClose = make('button', 'desk-sheet-close', MAP_TEXT.desk.closeSheet);
  cardClose.tabIndex = -1;
  cardTitle.append(make('span', 'desk-win-grip'), make('span', 'desk-win-name', MAP_TEXT.desk.cardTitle), cardClose);
  const cardHost = make('div', 'desk-card');
  cardWin.append(cardTitle, cardHost);
  body.append(chartWin, cardWin);

  const foot = make('div', 'desk-foot');
  const goBtn = make('button', 'desk-go');
  goBtn.id = 'deskGo';
  goBtn.tabIndex = -1;
  foot.append(goBtn);
  root.append(head, guide, notes, body, foot);
  document.body.appendChild(root);

  const phone = window.matchMedia(PHONE_QUERY);
  let closeModal: (() => void) | null = null;
  let shown = false;
  // The ship whose card is up: the selection, or a ship out of reach the kid clicked to read (the selection stays).
  let inspected: number | null = null;
  let sheetOpen = false;
  let beatPending: number[] = [];
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
    where.textContent = state.run.map.world === 'arm'
      ? `${unit} · ${MAP_TEXT.desk.yearLine(state.run.map.galaxyYear)} · ${here.name}`
      : `${unit} · ${here.name}`;
    paintTraceMeter(trace, traceMeter(state));
    const steps = deskSteps(state);
    const at = steps.findIndex((step) => !step.done);
    stepEls.forEach((el, i) => {
      el.textContent = `${i + 1} ${i === 0 ? MAP_TEXT.desk.stepPick : MAP_TEXT.desk.stepCourse}`;
      el.classList.toggle('done', steps[i]!.done);
      el.classList.toggle('now', i === at);
    });
    stepText.textContent = steps[at]?.text ?? '';
    const selected = state.ui.deskSelected;
    const course = steps.find((step) => step.id === 'set-course')!;
    renderKeyCaps(goBtn, course.text);
    goBtn.classList.toggle('waiting', selected === null);
    chart.paint(chartModel(state), beatPending);
    const showing = inspected ?? selected;
    renderShipCard(cardHost, showing === null ? null : cardModel(state, showing), MAP_TEXT.desk.pickShip);
    root.classList.toggle('sheet-open', sheetOpen && showing !== null);
    root.classList.toggle('has-card', showing !== null);
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
    if (state.ui.deskSelected === null || !deskCandidates(state).includes(state.ui.deskSelected)) {
      play('buzz');
      return;
    }
    play('lockArp');
    setCourse(store, state.ui.deskSelected);
  }

  function cycle(step: 1 | -1): void {
    if (store.getState().run.phase !== 'desk') return;
    inspected = null;
    cycleShip(store, step);
    play('chime', { falling: false });
    paint();
  }

  // CONTROL's line, typed (wall time; reduced motion shows it whole).
  function typeControl(line: string | null): void {
    control.hidden = line === null;
    controlText.textContent = '';
    if (line === null) return;
    if (store.getState().ui.reducedMotion) { controlText.textContent = line; return; }
    let shownChars = 0;
    typing = setInterval(() => {
      shownChars += 1;
      controlText.textContent = line.slice(0, shownChars);
      if (shownChars % 3 === 0) play('typeTick', { voice: 'control' });
      if (shownChars >= line.length && typing !== null) { clearInterval(typing); typing = null; }
    }, 1000 / DESK_TYPE_CPS);
  }

  // The opening beat: the ships whose approach passed since the last desk turn grey one by one.
  function openingBeat(): void {
    const beat = deskOpeningBeat(store.getState());
    beatPending = [...beat.greyed];
    beatLine.hidden = true;
    beatLine.textContent = beat.line ?? '';
    if (beat.greyed.length === 0) return;
    beat.greyed.forEach((slot, i) => {
      timers.push(setTimeout(() => {
        beatPending = beatPending.filter((s) => s !== slot);
        chart.ungrey(slot);
        play('chime', { falling: true });
        if (i === beat.greyed.length - 1) beatLine.hidden = false;
      }, (i + 1) * DESK_GREY_STEP_MS));
    });
  }

  function open(): void {
    if (shown) return;
    shown = true;
    if (!closeModal) closeModal = pushModal('desk');
    inspected = null;
    sheetOpen = false;
    stopTimers();
    root.hidden = false;
    root.classList.toggle('reduced', store.getState().ui.reducedMotion);
    openingBeat();
    typeControl(deskControlLine(store.getState()));
    paint();
  }
  function close(): void {
    if (!shown) return;
    shown = false;
    stopTimers();
    beatPending = [];
    root.hidden = true;
    closeModal?.();
    closeModal = null;
  }

  const onGo = (event: MouseEvent): void => { event.stopPropagation(); go(); };
  const onClose = (event: MouseEvent): void => { event.stopPropagation(); sheetOpen = false; paint(); };
  const onHandle = (event: MouseEvent): void => {
    if (!phone.matches || event.target === cardClose) return;
    sheetOpen = !sheetOpen;
    paint();
  };
  goBtn.addEventListener('click', onGo);
  cardClose.addEventListener('click', onClose);
  cardTitle.addEventListener('click', onHandle);
  const offs = [
    registerKeys({ layer: 'desk', codes: ['Enter', 'NumpadEnter', 'Space'], onDown: go }),
    registerKeys({ layer: 'desk', codes: ['ArrowRight', 'ArrowDown'], onDown: () => cycle(1) }),
    registerKeys({ layer: 'desk', codes: ['ArrowLeft', 'ArrowUp'], onDown: () => cycle(-1) }),
    registerKeys({ layer: 'desk', codes: ['Escape'], onDown: () => { if (sheetOpen) { sheetOpen = false; paint(); } } }),
  ];
  const unsubPhase = store.subscribe((s) => s.run.phase, (phase) => { if (phase === 'desk') open(); else close(); });
  const unsubPick = store.subscribe((s) => s.ui.deskSelected, () => { if (shown) paint(); });
  const unsubTrace = store.subscribe((s) => s.run.threat.trace, () => { if (shown) paint(); });
  if (store.getState().run.phase === 'desk') open();

  return () => {
    goBtn.removeEventListener('click', onGo);
    cardClose.removeEventListener('click', onClose);
    cardTitle.removeEventListener('click', onHandle);
    offs.forEach((off) => off());
    unsubPhase();
    unsubPick();
    unsubTrace();
    close();
    chart.destroy();
    root.remove();
  };
}
