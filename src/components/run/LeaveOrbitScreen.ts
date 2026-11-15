// Playtest 1 (Fran's note 5; docs/phase3/impl/playtest-1-plan.md §3.3): B-ORDER owns this file. LEAVE ORBIT, the screen
// between a ship's end (its LANDING REPORT's CONTINUE, or a lost ship's card) and the STAR CHART, in the PACKET's own blue
// and its card look (the `.tx-*` rules in styles/game.css):
// • the title: LEAVE ORBIT after a landing, LEAVING <SHIP> after a lost ship; under it the ship, and a lost ship's way out
//   (an EMERGENCY's toll, BEAM OUT's extra hits) in the warning colour;
// • SALVAGE · TAKE ONE WITH YOU: the three cards dealt as the ship ended (the old TRANSMIT's draft, run.leave.offer), each
//   with what it does in one line and why it was offered (`because you lost a pod's driver to HOLLOW`, in the star's gold
//   when it answers how the kid played). A click or [1] [2] [3] picks one (a chime; the others dim); the pick can change
//   until ENTER. A departed resident's leftovers wear their look (`LEFT BEHIND BY LOOKOUT`, the skill card as a `.skl` chip).
// • TAKE IT ▸ [ENTER] (or SPACE): the picked card lifts away and the STAR CHART opens (systems/run.ts leaveOrbit). Without a
//   pick it says TAKE ONE FIRST, buzzes and nudges the cards.
// Picks and ENTER wait for TRANSMIT_ARM_SEC after the screen comes up, so a key meant for the LANDING REPORT's CONTINUE never
// picks by accident. After a BEAM OUT the old ship's windows go black first (systems/desk.ts leaveBlackoutSec; it was the
// desk's), once per ship.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { DraftCardId } from '@data/upgrades';
import { leaveModel, type LeaveModel, type SalvageCardView } from '@systems/leave-orbit';
import { leaveOrbit } from '@systems/run';
import { pickCard } from '@systems/draft';
import { leaveBlackoutSec } from '@systems/desk';
import { leftoverDeckView, type LeftoverDeckView } from '@systems/resident-hud';
import { pushModal, registerKeys } from '@systems/input';
import { play, toggleMuted } from '@systems/audio';
import { requireById, make, replayAnimation } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { DRAFT_TEXT } from '@data/script';
import { TRANSMIT_ARM_SEC, DRAFT_CARDS, LEAVE_TAKE_SEC } from '@data/tuning';

// The keys that pick the cards, in order ([1] [2] [3], the top row or the number pad). Checked against the draft's size at
// load: a card past the last key would show a [4] that does nothing.
const CARD_KEY_CODES: readonly (readonly string[])[] = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']];
if (CARD_KEY_CODES.length < DRAFT_CARDS) {
  throw new Error(`LeaveOrbitScreen: ${CARD_KEY_CODES.length} card keys for a draft of ${DRAFT_CARDS} cards`);
}

// Slice 5 (04 §3.13, plan §2.11): a card of a departed resident's leftover deck wears its look: the skill card is drawn as a
// `.skl` chip (`AUTODROP.skl v1 · FROM THE RESIDENT THAT LEFT`, in the skill green), a pool card carries a small `LEFT` mark.
function cardNode(card: SalvageCardView, look: LeftoverDeckView['cards'][number] | undefined): HTMLButtonElement {
  const button = make('button', 'tx-card');
  button.tabIndex = -1;
  button.dataset.card = card.id;
  button.classList.toggle('boosted', card.boosted);
  button.classList.toggle('picked', card.picked);
  button.classList.toggle('leftover', card.leftover !== undefined);
  button.classList.toggle('leftover-skill', look?.skillChip != null);
  const top = make('span', 'tx-card-top');
  top.append(make('kbd', 'keycap', card.key), make('span', 'tx-card-tag', card.tag));
  if (look?.leftMark != null) top.appendChild(make('span', 'tx-card-left', look.leftMark));
  button.appendChild(top);
  if (look?.skillChip != null) button.appendChild(make('span', 'tx-card-skl', look.skillChip));
  button.append(
    make('span', 'tx-card-title', card.title),
    make('span', 'tx-card-effect', card.effect),
    make('span', 'tx-card-why', DRAFT_TEXT.why(card.why)),
    make('span', 'tx-card-picked', DRAFT_TEXT.picked),
  );
  return button;
}

export function mountLeaveOrbitScreen(store: Store<GameState>): () => void {
  const root = requireById('leaveScreen');
  const titleEl = requireById('loTitle');
  const subEl = requireById('loSub');
  const whyEl = requireById('loWhy');
  const draftEl = requireById('loDraft');
  const headingEl = requireById('loHeading');
  const keysEl = requireById('loKeys');
  const cardsEl = requireById('loCards');
  const nothingEl = requireById('loNothing');
  const goBtn = requireById<HTMLButtonElement>('loGo');

  let shown = false;
  let taking = false;
  let model: LeaveModel | null = null;
  let shownDeal = '';
  // The ship whose LEAVE ORBIT last opened: BEAM OUT's blackout plays once per ship (a reload resumes without it).
  let openedFor = '';
  let closeModal: (() => void) | null = null;
  let inputFromMs = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const later = (sec: number, action: () => void): void => { timers.push(setTimeout(action, sec * 1000)); };
  const stopTimers = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function paint(): void {
    const state = store.getState();
    if (state.run.phase !== 'leave') return;
    const next = leaveModel(state);
    model = next;
    titleEl.textContent = next.title;
    subEl.textContent = next.sub;
    whyEl.hidden = next.why === null;
    whyEl.textContent = next.why ?? '';
    whyEl.classList.toggle('emergency', next.emergency);
    // Slice 5: on a ship whose resident left, the deck is what it left behind (`LEFT BEHIND BY LOOKOUT`).
    const deck = leftoverDeckView(state, next.cards);
    headingEl.textContent = deck.headline ?? next.heading;
    draftEl.classList.toggle('leftover-deck', deck.headline !== null);
    renderKeyCaps(keysEl, next.keys);
    keysEl.hidden = next.cards.length === 0;
    nothingEl.hidden = next.nothing === null;
    nothingEl.textContent = next.nothing ?? '';
    // The same deal as on screen (a pick): the cards are patched in place, so the picked one's lift and glow animate; a new
    // deal (a new ship's) builds them.
    const dealKey = next.cards.map((card) => `${card.id}|${card.why}|${card.leftover?.segId ?? ''}`).join(',');
    if (dealKey !== shownDeal) {
      shownDeal = dealKey;
      cardsEl.replaceChildren(...next.cards.map((card, i) => cardNode(card, deck.cards[i])));
    } else {
      cardsEl.querySelectorAll<HTMLElement>('.tx-card').forEach((node) => node.classList.toggle('picked', node.dataset.card === next.pick));
    }
    cardsEl.classList.toggle('has-pick', next.pick !== null);
    if (!taking) {
      goBtn.classList.toggle('waiting', next.waiting);
      renderKeyCaps(goBtn, next.go, { own: 'ENTER' });
    }
  }

  const armed = (): boolean => shown && !taking && !root.hidden && performance.now() >= inputFromMs;
  function pick(id: DraftCardId): void {
    if (!armed() || model?.pick === id) return;
    const refusal = pickCard(store, id);
    if (refusal !== null) throw new Error(`LeaveOrbitScreen: the card '${id}' on screen could not be picked (${refusal})`);
    play('chime', { falling: false });
  }
  function pickByIndex(index: number): void {
    const card = model?.cards[index];
    if (card) pick(card.id);
  }

  // ENTER: the pick is taken (the picked card lifts away), then the STAR CHART.
  function take(): void {
    const current = model;
    if (!armed() || current === null) return;
    if (current.waiting) {
      play('buzz');
      replayAnimation(cardsEl, 'nudge');
      replayAnimation(goBtn, 'nudge');
      return;
    }
    taking = true;
    goBtn.disabled = true;
    play('uiClick');
    cardsEl.classList.add('sending');
    later(store.getState().ui.reducedMotion ? 0 : LEAVE_TAKE_SEC, () => {
      if (store.getState().run.phase === 'leave') leaveOrbit(store);
    });
  }

  function open(): void {
    if (shown) return;
    shown = true;
    taking = false;
    stopTimers();
    if (!closeModal) closeModal = pushModal('leave');
    const state = store.getState();
    root.classList.toggle('reduced', state.ui.reducedMotion);
    cardsEl.classList.remove('sending', 'nudge');
    goBtn.classList.remove('nudge');
    goBtn.disabled = false;
    goBtn.classList.add('arming');
    shownDeal = '';
    paint();
    const ship = `${state.run.seed}|${state.run.unitNumber}|${state.run.ships.length}`;
    const blackout = ship !== openedFor ? leaveBlackoutSec(state) : 0;
    openedFor = ship;
    root.hidden = blackout > 0;
    const show = (): void => {
      root.hidden = false;
      play('transmitIn');
      inputFromMs = performance.now() + TRANSMIT_ARM_SEC * 1000;
      later(TRANSMIT_ARM_SEC, () => goBtn.classList.remove('arming'));
    };
    if (blackout > 0) {
      inputFromMs = Infinity;
      later(blackout, show);
    } else {
      show();
    }
  }

  function close(): void {
    if (!shown) return;
    shown = false;
    taking = false;
    stopTimers();
    root.hidden = true;
    closeModal?.();
    closeModal = null;
    model = null;
  }

  const onCardClick = (event: MouseEvent): void => {
    const id = (event.target as HTMLElement | null)?.closest<HTMLElement>('.tx-card')?.dataset.card;
    if (!id) return;
    event.stopPropagation();
    const offered = model?.cards.find((candidate) => candidate.id === id);
    if (!offered) throw new Error(`LeaveOrbitScreen: a card on screen ('${id}') is not in the offer`);
    pick(offered.id);
  };
  cardsEl.addEventListener('click', onCardClick);
  const onGo = (event: MouseEvent): void => { event.stopPropagation(); take(); };
  goBtn.addEventListener('click', onGo);
  const offCardKeys = CARD_KEY_CODES.map((codes, index) => registerKeys({ layer: 'leave', codes, onDown: () => pickByIndex(index) }));
  const offKeys = registerKeys({ layer: 'leave', codes: ['Enter', 'NumpadEnter', 'Space'], onDown: take });
  const offMute = registerKeys({ layer: 'leave', codes: ['KeyM'], onDown: () => toggleMuted() });

  const unsubPhase = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'leave') open();
    else close();
  });
  const unsubPick = store.subscribe((s) => `${s.run.leave.pick ?? ''}#${s.run.leave.offer.length}`, () => { if (shown) paint(); });
  if (store.getState().run.phase === 'leave') open();

  return () => {
    cardsEl.removeEventListener('click', onCardClick);
    goBtn.removeEventListener('click', onGo);
    offCardKeys.forEach((off) => off());
    offKeys();
    offMute();
    unsubPhase();
    unsubPick();
    close();
  };
}
