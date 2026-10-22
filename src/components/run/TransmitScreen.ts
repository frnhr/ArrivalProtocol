import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { UpgradeId } from '@data/upgrades';
import { transmitModel, toggleDrop, type PacketChip, type TransmitModel, type DraftCardView, type CardFileChip } from '@systems/transmit';
import { transmitNext } from '@systems/run';
import { pickCard } from '@systems/draft';
import { unitName } from '@systems/say';
import { pushModal, registerKeys } from '@systems/input';
import { play, toggleMuted } from '@systems/audio';
import { integrityBand } from '@state/selectors';
import { requireById, make, replayAnimation } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { TRANSMIT_TEXT, DRAFT_TEXT } from '@data/script';
import {
  TRANSMIT_ARM_SEC, TRANSMIT_SEND_SEC, TRANSMIT_STREAM_FRAC, WHITE_OUT_IN_SEC, WHITE_OUT_HOLD_SEC, WHITE_OUT_FADE_SEC,
  BEAM_OUT_BLACKOUT_SEC, DRAFT_CARDS,
} from '@data/tuning';

// The TRANSMIT screen (§4.1 step 5, §6.9, §9 WP7 item 4): between two ships, the unit packed for the link.
// Mostly information, in the mind's own blue: where it goes (`NEXT: HALCYON · 2,000 SOULS · 22 LY`), how
// it was left (an EMERGENCY's toll, BEAM OUT's extra hits), the packet against the link (a bar and `LINK 120
// · FILES 63 · CHARGE 14 → FITS`), the files as chips (safest to leave behind first, each with what leaving
// it does; locked ones say why; an infected one warns it will arrive infected), what the crossing costs and
// the REPAIR CHARGE waiting on arrival. A chip can be clicked to leave its file behind only while charge is
// left behind (systems/transmit.ts says so on the screen).
// TRANSMIT ▸ (or SPACE / ENTER, once armed) is the crossing itself, on wall time like the WAKE REPORT: the
// chips stream out one after another while the light-years tick past under a rising FM sweep, then the
// screen floods white; at full white the packet really goes (systems/run.ts transmitNext: the hits, the
// charge, the next ship's world), and the new ship's boot comes up from under the white as it fades. After
// a BEAM OUT the screen waits for the old ship's windows to go black first.
// Reduced motion: the chips do not fly and the white-out is a slow fade through the night instead of a flash.
// PICK ONE TO CARRY (WP8 part 2, §6.9) sits under the headline, before the packet: the decision first, the
// information after. Three cards, each with what it does in one line and why it was offered (`because you
// lost a cluster to HOLLOW`, in the star's gold when it answers how the kid played). A click or [1] [2] [3]
// picks one (a chime; the others dim; a file card's new file joins the packet's chips and bar); the pick can
// change until the send. TRANSMIT ▸ waits for it: without one it says PICK A CARD FIRST, buzzes and nudges
// the cards. Picks wait for the same arm delay as the send, so a click meant for the WAKE REPORT's CONTINUE
// never picks a card by accident.

function chipNode(chip: PacketChip): HTMLButtonElement {
  const button = make('button', 'tx-chip');
  button.tabIndex = -1;
  button.dataset.segId = chip.segId;
  button.classList.toggle('locked', chip.lock !== null);
  button.classList.toggle('dropped', chip.dropped);
  button.classList.toggle('toggleable', chip.toggleable);
  button.classList.toggle('infected', chip.infected);
  const head = make('span', 'tx-chip-head');
  head.append(make('span', 'tx-chip-name', chip.name.toUpperCase()), make('span', 'tx-chip-size', `${chip.blocks}B`));
  if (chip.integrity !== null) {
    head.appendChild(make('span', `tx-chip-health band-${integrityBand(chip.integrity)}`, `${Math.round(chip.integrity)}%`));
  }
  button.appendChild(head);
  const foot = make('span', 'tx-chip-note', chip.dropped ? TRANSMIT_TEXT.dropped : chip.note);
  button.appendChild(foot);
  if (chip.toggleable && chip.chargeGain > 0) button.appendChild(make('span', 'tx-chip-gain', TRANSMIT_TEXT.gain(chip.chargeGain)));
  if (chip.infected && !chip.dropped) button.appendChild(make('span', 'tx-chip-warn', TRANSMIT_TEXT.chipInfected));
  return button;
}

// The picked card's new file, among the unit's own (it rides the same link and can take a transit hit).
function cardFileNode(file: CardFileChip): HTMLButtonElement {
  const button = make('button', 'tx-chip card-file');
  button.tabIndex = -1;
  const head = make('span', 'tx-chip-head');
  head.append(make('span', 'tx-chip-name', file.name.toUpperCase()), make('span', 'tx-chip-size', `${file.blocks}B`));
  button.append(head, make('span', 'tx-chip-note', DRAFT_TEXT.newFile));
  return button;
}

function cardNode(card: DraftCardView): HTMLButtonElement {
  const button = make('button', 'tx-card');
  button.tabIndex = -1;
  button.dataset.card = card.id;
  button.classList.toggle('boosted', card.boosted);
  button.classList.toggle('picked', card.picked);
  const top = make('span', 'tx-card-top');
  const key = make('kbd', 'keycap', card.key);
  top.append(key, make('span', 'tx-card-tag', card.tag));
  button.append(
    top,
    make('span', 'tx-card-title', card.title),
    make('span', 'tx-card-effect', card.effect),
    make('span', 'tx-card-why', DRAFT_TEXT.why(card.why)),
    make('span', 'tx-card-picked', DRAFT_TEXT.picked),
  );
  return button;
}

// The keys that pick the cards, in order ([1] [2] [3], the top row or the number pad). Checked against the
// draft's size at load: a card past the last key would show a [4] that does nothing.
const CARD_KEY_CODES: readonly (readonly string[])[] = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']];
if (CARD_KEY_CODES.length < DRAFT_CARDS) {
  throw new Error(`TransmitScreen: ${CARD_KEY_CODES.length} card keys for a draft of ${DRAFT_CARDS} cards`);
}

export function mountTransmitScreen(store: Store<GameState>): () => void {
  const root = requireById('transmitScreen');
  const titleEl = requireById('txTitle');
  const draftEl = requireById('txDraft');
  const draftTitle = requireById('txDraftTitle');
  const draftKeys = requireById('txDraftKeys');
  const cardsEl = requireById('txCards');
  const nextEl = requireById('txNext');
  const whyEl = requireById('txWhy');
  const barEl = requireById('txBar');
  const barFiles = requireById('txBarFiles');
  const barCharge = requireById('txBarCharge');
  const barOver = requireById('txBarOver');
  const packetLine = requireById('txPacketLine');
  const dropLine = requireById('txDropLine');
  const chipsEl = requireById('txChips');
  const infectedEl = requireById('txInfected');
  const hitsEl = requireById('txHits');
  const arrivalEl = requireById('txArrival');
  const sendEl = requireById('txSend');
  const sendLine = requireById('txSendLine');
  const sendFill = requireById('txSendFill');
  const sendLy = requireById('txSendLy');
  const goBtn = requireById<HTMLButtonElement>('txGo');
  const whiteOut = requireById('whiteOut');

  titleEl.textContent = TRANSMIT_TEXT.title;
  draftTitle.textContent = DRAFT_TEXT.title;
  whiteOut.style.setProperty('--wo-in', `${WHITE_OUT_IN_SEC}s`);
  whiteOut.style.setProperty('--wo-fade', `${WHITE_OUT_FADE_SEC}s`);

  let shown = false;
  let sending = false;
  let model: TransmitModel | null = null;
  let shownDeal = '';
  let closeModal: (() => void) | null = null;
  let inputFromMs = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let frame: number | null = null;
  const later = (sec: number, action: () => void): void => { timers.push(setTimeout(action, sec * 1000)); };
  const reducedMotion = (): boolean => store.getState().ui.reducedMotion;
  const stopTimers = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  function paint(): void {
    const state = store.getState();
    if (state.run.phase !== 'transmit') return;
    const next = transmitModel(state);
    model = next;
    nextEl.textContent = next.headline;
    whyEl.hidden = next.why === null;
    whyEl.textContent = next.why ?? '';
    whyEl.classList.toggle('emergency', next.emergency);
    barEl.style.setProperty('--link-blocks', String(next.link));
    barFiles.style.width = `${(100 * next.files) / next.link}%`;
    barCharge.style.width = `${(100 * next.chargeCarried) / next.link}%`;
    const left = next.chargeHeld - next.chargeCarried;
    barOver.hidden = left <= 0;
    barOver.textContent = left > 0 ? `−${left}` : '';
    packetLine.textContent = next.packetLine;
    dropLine.textContent = next.dropLine;
    const chips = next.chips.map(chipNode);
    if (next.cardFile) chips.push(cardFileNode(next.cardFile));
    chipsEl.replaceChildren(...chips);
    draftEl.hidden = next.cards.length === 0;
    renderKeyCaps(draftKeys, DRAFT_TEXT.keys(next.cards.length));
    // The same deal as on screen (a pick, a drop): the cards are patched in place, so the picked one's lift
    // and glow animate; a new deal (a new TRANSMIT) builds them.
    const dealKey = next.cards.map((card) => `${card.id}|${card.why}`).join(',');
    if (dealKey !== shownDeal) {
      shownDeal = dealKey;
      cardsEl.replaceChildren(...next.cards.map(cardNode));
    } else {
      cardsEl.querySelectorAll<HTMLElement>('.tx-card').forEach((node) => node.classList.toggle('picked', node.dataset.card === next.pick));
    }
    cardsEl.classList.toggle('has-pick', next.pick !== null);
    paintGo(next);
    infectedEl.hidden = next.infectedLine === null;
    infectedEl.textContent = next.infectedLine ?? '';
    hitsEl.textContent = next.hitsLine;
    arrivalEl.textContent = next.arrivalLine;
  }

  // TRANSMIT ▸ once a card is picked (or when none was dealt); before that it says what is missing.
  const awaitingPick = (current: TransmitModel): boolean => current.cards.length > 0 && current.pick === null;
  function paintGo(current: TransmitModel): void {
    if (sending) return;
    const waiting = awaitingPick(current);
    goBtn.classList.toggle('waiting', waiting);
    renderKeyCaps(goBtn, waiting ? DRAFT_TEXT.goWaiting : TRANSMIT_TEXT.go, { own: 'SPACE' });
  }

  // A card is picked (a click, or its key), once the screen has armed. Changing the pick is allowed until
  // the send; picking the one already picked does nothing.
  const armed = (): boolean => shown && !sending && !root.hidden && performance.now() >= inputFromMs;
  function pick(id: UpgradeId): void {
    if (!armed() || model?.pick === id) return;
    const refusal = pickCard(store, id);
    if (refusal !== null) throw new Error(`TransmitScreen: the card '${id}' on screen could not be picked (${refusal})`);
    play('chime', { falling: false });
  }
  function pickByIndex(index: number): void {
    const card = model?.cards[index];
    if (card) pick(card.id);
  }
  function open(): void {
    if (shown) return;
    shown = true;
    sending = false;
    stopTimers();
    if (!closeModal) closeModal = pushModal('transmit');
    root.classList.remove('sending');
    // A refused send's shake belongs to that screen: fresh cards must not replay it.
    cardsEl.classList.remove('sending', 'nudge');
    goBtn.classList.remove('nudge');
    shownDeal = '';
    root.classList.toggle('reduced', reducedMotion());
    sendEl.hidden = true;
    goBtn.disabled = false;
    goBtn.classList.add('arming');
    paint();
    // After a BEAM OUT the old ship's windows go black first (Telemetry's blackout): this is the moment
    // the unit left, and the packet screen comes up out of the dark.
    const delay = store.getState().burn.status === 'abandoned' ? BEAM_OUT_BLACKOUT_SEC : 0;
    later(delay, () => {
      root.hidden = false;
      play('transmitIn');
      inputFromMs = performance.now() + TRANSMIT_ARM_SEC * 1000;
      later(TRANSMIT_ARM_SEC, () => goBtn.classList.remove('arming'));
    });
  }

  function close(): void {
    if (!shown) return;
    shown = false;
    // The white-out's own timers keep running: it lifts off the next ship's boot after the screen is gone.
    if (!sending) stopTimers();
    root.hidden = true;
    closeModal?.();
    closeModal = null;
    model = null;
  }

  // The crossing: the files stream out, the light-years tick past, then the white-out and the jump.
  function send(): void {
    const current = model;
    if (!shown || sending || !current || root.hidden || performance.now() < inputFromMs) return;
    // PICK ONE TO CARRY is mandatory (§6.9): no pick, no send. The cards are nudged so the eye finds them.
    if (awaitingPick(current)) {
      play('buzz');
      replayAnimation(cardsEl, 'nudge');
      replayAnimation(goBtn, 'nudge');
      return;
    }
    sending = true;
    goBtn.disabled = true;
    root.classList.add('sending');
    play('transmitSweep', { seconds: TRANSMIT_SEND_SEC });
    const going = Array.from(chipsEl.querySelectorAll<HTMLElement>('.tx-chip:not(.dropped)'));
    const stagger = (TRANSMIT_SEND_SEC * TRANSMIT_STREAM_FRAC) / Math.max(1, going.length);
    going.forEach((chip, i) => {
      chip.style.animationDelay = `${(i * stagger).toFixed(3)}s`;
      chip.classList.add('sent');
    });
    // The picked card goes with the packet; the ones left behind fade.
    cardsEl.classList.add('sending');
    sendLine.textContent = TRANSMIT_TEXT.sending(unitName(store.getState().run.unitNumber), current.shipName);
    sendEl.hidden = false;
    const startMs = performance.now();
    const tick = (now: number): void => {
      // Wall time, in step with the send's own timer (the white-out comes when it ends).
      const fraction = Math.min(1, (now - startMs) / 1000 / TRANSMIT_SEND_SEC);
      sendFill.style.width = `${(fraction * 100).toFixed(1)}%`;
      sendLy.textContent = TRANSMIT_TEXT.distance((fraction * current.distanceLy).toFixed(1), current.distanceLy);
      frame = fraction < 1 ? requestAnimationFrame(tick) : null;
    };
    frame = requestAnimationFrame(tick);
    later(TRANSMIT_SEND_SEC, startWhiteOut);
  }

  function startWhiteOut(): void {
    whiteOut.classList.toggle('reduced', reducedMotion());
    whiteOut.classList.remove('fading');
    whiteOut.hidden = false;
    // Laid out first, so the opacity transition runs from 0.
    void whiteOut.offsetWidth;
    whiteOut.classList.add('on');
    later(WHITE_OUT_IN_SEC + WHITE_OUT_HOLD_SEC, () => {
      // At full white: the packet crosses (the hits, the charge, the next ship's world; the phase moves on
      // to its boot, which closes this screen), and the new ship shows through as the white fades. The white
      // lifts even when the crossing throws: the error still reaches the console, and the screen under it
      // shows where the run stopped instead of a white page.
      try {
        transmitNext(store);
      } finally {
        sending = false;
        whiteOut.classList.add('fading');
        whiteOut.classList.remove('on');
        later(WHITE_OUT_FADE_SEC, () => {
          whiteOut.hidden = true;
          whiteOut.classList.remove('fading');
        });
      }
    });
  }

  const onChipClick = (event: MouseEvent): void => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('.tx-chip');
    const segId = chip?.dataset.segId;
    if (!segId || sending) return;
    event.stopPropagation();
    if (toggleDrop(store, segId) !== null) play('buzz');
  };
  chipsEl.addEventListener('click', onChipClick);
  const onCardClick = (event: MouseEvent): void => {
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.tx-card');
    const id = card?.dataset.card;
    if (!id) return;
    event.stopPropagation();
    const offered = model?.cards.find((candidate) => candidate.id === id);
    if (!offered) throw new Error(`TransmitScreen: a card on screen ('${id}') is not in the offer`);
    pick(offered.id);
  };
  cardsEl.addEventListener('click', onCardClick);
  const offCardKeys = CARD_KEY_CODES.map((codes, index) => registerKeys({ layer: 'transmit', codes, onDown: () => pickByIndex(index) }));
  const onGo = (event: MouseEvent): void => { event.stopPropagation(); send(); };
  goBtn.addEventListener('click', onGo);
  const offKeys = registerKeys({ layer: 'transmit', codes: ['Space', 'Enter'], onDown: send });
  const offMute = registerKeys({ layer: 'transmit', codes: ['KeyM'], onDown: () => toggleMuted() });

  const unsubPhase = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'transmit') open();
    else close();
  });
  // A dropped file changes the packet (one update in systems/transmit.ts toggleDrop).
  const unsubDrops = store.subscribe((s) => `${s.run.transit?.dropped.join('|') ?? ''}#${s.run.transit?.pick ?? ''}`, () => { if (shown && !sending) paint(); });
  if (store.getState().run.phase === 'transmit') open();

  return () => {
    chipsEl.removeEventListener('click', onChipClick);
    cardsEl.removeEventListener('click', onCardClick);
    offCardKeys.forEach((off) => off());
    goBtn.removeEventListener('click', onGo);
    offKeys();
    offMute();
    unsubPhase();
    unsubDrops();
    stopTimers();
    close();
  };
}
