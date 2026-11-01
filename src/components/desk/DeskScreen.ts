import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { pushModal, registerKeys } from '@systems/input';
import { deskCandidates, selectShip, cycleShip, cardModel, deskSteps } from '@systems/desk';
import { setCourse, backToChart } from '@systems/run';
import { play } from '@systems/audio';
import { MAP_TEXT } from '@data/map-text';

// The DESK (phase 3 slice 3a, 02-map §3.10, §4): between a ship's end and its PACKET. FOUNDATION STUB (F2): a minimal
// full-screen card (the TRANSMIT screen's chrome) listing the ships in reach, the selected ship's card top line, and
// SET COURSE ▸ [ENTER]; ← → cycle the ships; ESC on the PACKET goes ◀ CHART. On the classic world it offers the single
// next ship, so the page still plays the five end to end. Track DESK replaces it (components/desk/{DeskScreen,
// StarChart,ShipCard,chart-draw}.ts: the amber chart, the docked card, the phone bottom sheet, styles/desk.css).

export function mountDeskScreen(store: Store<GameState>): () => void {
  const root = document.createElement('div');
  root.className = 'transmit-screen desk-screen';
  root.id = 'deskScreen';
  root.hidden = true;
  root.innerHTML = `<div class="tx-inner"><div class="tx-head"><div class="tx-title"></div><div class="tx-next" id="deskShip"></div></div>`
    + '<div class="tx-chips" id="deskShips"></div><div class="tx-foot"><button class="tx-go" id="deskGo" tabindex="-1"></button></div></div>';
  document.body.appendChild(root);
  const title = root.querySelector<HTMLElement>('.tx-title')!;
  const shipLine = root.querySelector<HTMLElement>('#deskShip')!;
  const list = root.querySelector<HTMLElement>('#deskShips')!;
  const goBtn = root.querySelector<HTMLButtonElement>('#deskGo')!;
  title.textContent = MAP_TEXT.desk.title;
  let closeModal: (() => void) | null = null;

  function paint(): void {
    const state = store.getState();
    const offered = deskCandidates(state);
    const selected = state.ui.deskSelected;
    list.replaceChildren(...offered.map((slot) => {
      const chip = document.createElement('button');
      chip.className = 'tx-chip';
      chip.dataset.slot = String(slot);
      chip.tabIndex = -1;
      chip.textContent = cardModel(state, slot).top;
      chip.classList.toggle('picked', slot === selected);
      return chip;
    }));
    shipLine.textContent = selected === null ? MAP_TEXT.desk.pickShip : cardModel(state, selected).top;
    const course = deskSteps(state).find((step) => step.id === 'set-course')!;
    goBtn.textContent = course.text;
    goBtn.disabled = selected === null;
  }
  function open(): void {
    if (!closeModal) closeModal = pushModal('desk');
    root.hidden = false;
    paint();
  }
  function close(): void {
    root.hidden = true;
    closeModal?.();
    closeModal = null;
  }
  function go(): void {
    const state = store.getState();
    if (state.run.phase !== 'desk') return;
    if (state.ui.deskSelected === null) { play('buzz'); return; }
    play('lockArp');
    setCourse(store, state.ui.deskSelected);
  }

  const onList = (event: MouseEvent): void => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    if (!chip) return;
    event.stopPropagation();
    if (selectShip(store, Number(chip.dataset.slot))) play('chime', { falling: false });
    else play('buzz');
  };
  const onGo = (event: MouseEvent): void => { event.stopPropagation(); go(); };
  list.addEventListener('click', onList);
  goBtn.addEventListener('click', onGo);
  const offs = [
    registerKeys({ layer: 'desk', codes: ['Enter', 'Space'], onDown: go }),
    registerKeys({ layer: 'desk', codes: ['ArrowRight', 'ArrowDown'], onDown: () => { cycleShip(store, 1); } }),
    registerKeys({ layer: 'desk', codes: ['ArrowLeft', 'ArrowUp'], onDown: () => { cycleShip(store, -1); } }),
    // ◀ CHART [ESC] on the PACKET (Track DESK adds the button to TransmitScreen).
    registerKeys({ layer: 'transmit', codes: ['Escape'], onDown: () => { if (store.getState().run.phase === 'transmit') backToChart(store); } }),
  ];
  const unsubPhase = store.subscribe((s) => s.run.phase, (phase) => { if (phase === 'desk') open(); else close(); });
  const unsubPick = store.subscribe((s) => s.ui.deskSelected, () => { if (!root.hidden) paint(); });
  if (store.getState().run.phase === 'desk') open();

  return () => {
    list.removeEventListener('click', onList);
    goBtn.removeEventListener('click', onGo);
    offs.forEach((off) => off());
    unsubPhase();
    unsubPick();
    close();
    root.remove();
  };
}
