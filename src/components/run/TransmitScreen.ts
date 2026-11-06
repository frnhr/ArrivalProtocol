// Slice 4: Track UI owns this file (docs/phase3/impl/slice-4-plan.md §5.2): the skill chips and PACK AS buttons over
// TREE's model. Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { UpgradeId } from '@data/upgrades';
import {
  transmitModel, toggleDrop, toggleSendOn, type PacketChip, type TransmitModel, type DraftCardView, type CardFileChip, type SkillChip,
  type UninvitedChip, type DeliveryChipView,
} from '@systems/transmit';
import { logEntryToOpen } from '@systems/log-view';
import { openLogReader } from '@systems/story-log';
import { transmitNext, backToChart } from '@systems/run';
import { pickCard } from '@systems/draft';
import { unitName } from '@systems/say';
import { pushModal, registerKeys } from '@systems/input';
import { play, toggleMuted } from '@systems/audio';
import { integrityBand } from '@state/selectors';
import { requireById, make, replayAnimation } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { TRANSMIT_TEXT, DRAFT_TEXT } from '@data/script';
import { MAP_TEXT } from '@data/map-text';
import { REPO_TEXT } from '@data/repo-text';
import { skillFileView } from '@systems/skills';
import { isSkillFile } from '@state/selectors';
import { SKILLS_TEXT } from '@data/script';
import type { SkillFileSegment } from '@/types/segment';
import { setPackAs } from '@systems/training';
import {
  TRANSMIT_ARM_SEC, TRANSMIT_SEND_SEC, TRANSMIT_STREAM_FRAC, WHITE_OUT_IN_SEC, WHITE_OUT_HOLD_SEC, WHITE_OUT_FADE_SEC, WHITE_OUT_FLOOD_GRACE_SEC,
  DRAFT_CARDS,
} from '@data/tuning';

// The TRANSMIT screen (§4.1 step 5, §6.9, §9 WP7 item 4): between two ships, the unit packed for the link.
// Mostly information, in the mind's own blue: where it goes (`NEXT: HALCYON · 2,000 COLONISTS · 22 LY`), how
// it was left (an EMERGENCY's toll, BEAM OUT's extra hits), the packet against the link (a bar and `LINK 120
// · FILES 63 · CHARGE 14 → FITS`), the files as chips (safest to leave behind first, each with what leaving
// it does; locked ones say why; an infected one warns it will arrive infected), what the crossing costs and
// the REPAIR CHARGE waiting on arrival. A chip can be clicked to leave its file behind only while charge is
// left behind (systems/transmit.ts says so on the screen).
// TRANSMIT ▸ (or SPACE / ENTER, once armed) is the crossing itself, on wall time like the LANDING REPORT: the
// chips stream out one after another while the light-years tick past under a rising FM sweep, then the
// screen floods white; at full white the packet really goes (systems/run.ts transmitNext: the hits, the
// charge, the next ship's world), and the new ship's boot comes up from under the white as it fades. After
// a BEAM OUT the screen waits for the old ship's windows to go black first.
// Reduced motion: the chips do not fly and the white-out is a slow fade through the night instead of a flash.
// PICK ONE TO CARRY (WP8 part 2, §6.9) sits under the headline, before the packet: the decision first, the
// information after. Three cards, each with what it does in one line and why it was offered (`because you
// lost a pod's driver to HOLLOW`, in the star's gold when it answers how the kid played). A click or [1] [2] [3]
// picks one (a chime; the others dim; a file card's new file joins the packet's chips and bar); the pick can
// change until the send. TRANSMIT ▸ waits for it: without one it says PICK A CARD FIRST, buzzes and nudges
// the cards. Picks wait for the same arm delay as the send, so a click meant for the LANDING REPORT's CONTINUE
// never picks a card by accident.
// Phase 3 slice 2 (04 §3.8, §4; 05 §3.2): HOLLOW riding the beam is an uninvited chip after the unit's own, in its pink,
// locked and outside the bar (it rides free); on the beam it boards, the sweep stutters. 046.log's chip reads `046.log ·
// 3/12` and glows while an entry is unread; a click on it opens the LOG READER (it can't be left behind anyway). The
// TRACE line and `NO RM · YOU CAN'T DELETE THE ROOT` (before the final beam) sit with the notes.
// Phase 3 slice 3a (02-map §4, 01-landing §3.16): the PACKET between the DESK and the beam. `◀ CHART [ESC]` goes back to
// the desk until TRANSMIT ▸ (the drops and the pick are forgotten). The room bar sits under the link bar: the files and
// the charge that will arrive against the destination's room, and what does not fit hangs off its end (`26 WON'T FIT`),
// with the charge line naming the loss before it happens; on a TIGHT ship whose room leaves no charge the line turns red
// (`→ 0 ON ARRIVAL`, with buzz and CONTROL's "Travelling light! Very light. :)"), and TRANSMIT ▸ asks inline first
// (`ARRIVE WITH NO REPAIR CHARGE?`, ENTER yes, ESC no). While files plus the floor are over the room, TRANSMIT ▸ waits
// (LEAVE FILES BEHIND FIRST). On the arm the ECC line takes the hits line's place. The send stamps OUTWARD BOUND over the
// screen, and CONTROL says "Outward bound! :)" under the light-years.
// Phase 3 slice 3b (02-map §3.9, §4; 01-landing §3.16; slice-3b-plan §1.1 item 14, §3 step 3): the deliveries that ride
// this hop are a DELIVERIES chip row under the unit's own files (`Mv · 2 BLOCKS · ARRIVED 2337 · [SEND ON]`): a click
// toggles SEND ON (the file stays in the destination's receiver to ride the next hop; on a hop into a final ship the chip
// says `NO SHIP AFTER LAST LIGHT · IT IS LOST`), and the bars and the gate count only the ones that go (systems/transmit.ts
// toggleSendOn, Track REPO). An IN TRANSIT line names what is still behind the unit; the draft is headed SALVAGE on the arm.
// The chips that go stream out with the rest at the send.

function chipNode(chip: PacketChip): HTMLButtonElement {
  const button = make('button', 'tx-chip');
  button.tabIndex = -1;
  button.dataset.segId = chip.segId;
  button.classList.toggle('locked', chip.lock !== null);
  button.classList.toggle('dropped', chip.dropped);
  button.classList.toggle('toggleable', chip.toggleable);
  button.classList.toggle('infected', chip.infected);
  button.classList.toggle('log-chip', chip.log);
  button.classList.toggle('glow', chip.glow);
  if (chip.log) button.dataset.log = '1';
  const head = make('span', 'tx-chip-head');
  // 046.log keeps its own case (`046.log · 3/12`): it is a file name, and it isn't yours.
  head.append(make('span', 'tx-chip-name', chip.log ? chip.name : chip.name.toUpperCase()), make('span', 'tx-chip-size', `${chip.blocks}B`));
  if (chip.integrity !== null) {
    head.appendChild(make('span', `tx-chip-health band-${integrityBand(chip.integrity)}`, `${Math.round(chip.integrity)}%`));
  }
  button.appendChild(head);
  const foot = make('span', 'tx-chip-note', chip.dropped ? TRANSMIT_TEXT.dropped : chip.note);
  button.appendChild(foot);
  // What leaving it behind buys: the charge that then arrives (slice 3a: a squeezing room), at least what then crosses.
  const gain = Math.max(chip.chargeGain, chip.arriveGain);
  if (chip.toggleable && gain > 0) button.appendChild(make('span', 'tx-chip-gain', TRANSMIT_TEXT.gain(gain)));
  if (chip.infected && !chip.dropped) button.appendChild(make('span', 'tx-chip-warn', TRANSMIT_TEXT.chipInfected));
  return button;
}

// The picked card's new file, among the unit's own (it rides the same link and can take a transit hit).
// Slice 4 (03 §3.4; plan §2.6, §3 step 7), over TREE's PacketChip.skill: a skill file's chip keeps the tree's file name
// (`AUTOBURN.skl`) with its version badge (`v2`, `v2▸v1` under damage, the packed level once PACK AS is on), says what
// leaving it costs after its name (`→ brake by hand · RESTORE 5`), and is followed in its grid cell by a PACK AS button per
// lower level (`PACK AS v1 (7) · RESTORE 3`), lit when chosen. A file trained at this desk is locked ('trained': TRAINED
// HERE · ◀ CHART TO UNDO) and dashed.
function skillChipNode(chip: PacketChip, skill: Readonly<SkillChip>, seg: Readonly<SkillFileSegment> | null): HTMLElement {
  const node = chipNode(chip);
  node.classList.add('skill-chip');
  node.classList.toggle('skill-fresh', skill.trained);
  node.classList.toggle('packed', skill.packedAs !== null);
  const head = node.querySelector('.tx-chip-head');
  const name = head?.querySelector('.tx-chip-name');
  if (name) name.textContent = chip.name;
  const view = seg !== null && !skill.trained ? skillFileView(seg) : null;
  const text = skill.packedAs !== null ? SKILLS_TEXT.skill.version(skill.packedAs.version) : view?.badge ?? SKILLS_TEXT.skill.version(skill.level.version);
  name?.after(make('span', `tx-chip-badge${view?.damaged ? ' damaged' : ''}`, text));
  const note = node.querySelector('.tx-chip-note');
  const arrow = chip.note.indexOf('→');
  if (note && chip.lock === null && !chip.dropped && arrow >= 0) note.textContent = chip.note.slice(arrow);
  if (chip.dropped || skill.packAs.length === 0) return node;
  const group = make('div', 'tx-chip-group');
  group.appendChild(node);
  skill.packAs.forEach((option, index) => {
    const button = make('button', 'tx-packas', option.text);
    button.tabIndex = -1;
    button.dataset.packSeg = chip.segId;
    button.dataset.packIndex = String(index);
    button.classList.toggle('on', option.active);
    group.appendChild(button);
  });
  return group;
}

function cardFileNode(file: CardFileChip): HTMLButtonElement {
  const button = make('button', 'tx-chip card-file');
  button.tabIndex = -1;
  const head = make('span', 'tx-chip-head');
  head.append(make('span', 'tx-chip-name', file.name.toUpperCase()), make('span', 'tx-chip-size', `${file.blocks}B`));
  button.append(head, make('span', 'tx-chip-note', DRAFT_TEXT.newFile));
  return button;
}

// A delivery riding this hop (02 §3.9): its file, size and the year it reached the receiver; its SEND ON toggle under it.
function deliveryNode(chip: DeliveryChipView): HTMLButtonElement {
  const button = make('button', 'tx-chip tx-delivery toggleable');
  button.tabIndex = -1;
  button.dataset.key = chip.key;
  button.classList.toggle('sent-on', chip.sendOn);
  button.classList.toggle('lost', chip.lost);
  button.setAttribute('aria-label', `${chip.text} · ${chip.sendOnLabel}`);
  const head = make('span', 'tx-chip-head');
  head.append(make('span', 'tx-chip-name', chip.name.toUpperCase()), make('span', 'tx-chip-size', `${chip.blocks}B`));
  button.append(head, make('span', 'tx-chip-note', chip.text), make('span', 'tx-chip-sendon', chip.sendOnLabel));
  return button;
}

// HOLLOW riding the beam (04 §3.8): locked, not yours, free; why it grew under it. aria-label carries the whole line.
function uninvitedNode(chip: UninvitedChip): HTMLButtonElement {
  const button = make('button', 'tx-chip uninvited locked');
  button.tabIndex = -1;
  button.classList.toggle('boards', chip.boards);
  button.setAttribute('aria-label', chip.text);
  button.title = chip.text;
  const head = make('span', 'tx-chip-head');
  head.append(make('span', 'tx-chip-name', chip.owner), make('span', 'tx-chip-size', `${chip.blocks}B`));
  button.append(head, make('span', 'tx-chip-note', chip.note));
  if (chip.fedText !== null) button.appendChild(make('span', 'tx-chip-warn', chip.fedText));
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

// The slice-3a parts of the PACKET, built here (index.html keeps phase 2's skeleton): ◀ CHART in the head, the room bar
// under the link bar, CONTROL's line, the inline confirm in the foot and the BEAM stamp.
interface PacketParts {
  back: HTMLButtonElement;
  room: HTMLElement;
  roomBar: HTMLElement;
  roomFiles: HTMLElement;
  roomCharge: HTMLElement;
  roomOver: HTMLElement;
  roomLine: HTMLElement;
  roomCharges: HTMLElement;
  linkLabel: HTMLElement;
  control: HTMLElement;
  confirm: HTMLElement;
  confirmQ: HTMLElement;
  confirmYes: HTMLButtonElement;
  confirmNo: HTMLButtonElement;
  stamp: HTMLElement;
  sendControl: HTMLElement;
  deliveries: HTMLElement;
  deliveryChips: HTMLElement;
  inTransit: HTMLElement;
}

function buildPacketParts(root: HTMLElement): PacketParts {
  const inner = root.querySelector<HTMLElement>('.tx-inner');
  const head = root.querySelector<HTMLElement>('.tx-head');
  const packet = root.querySelector<HTMLElement>('.tx-packet');
  const foot = root.querySelector<HTMLElement>('.tx-foot');
  const send = root.querySelector<HTMLElement>('.tx-send');
  if (!inner || !head || !packet || !foot || !send) throw new Error('TransmitScreen: index.html lost the PACKET\'s skeleton');
  const back = make('button', 'tx-back', MAP_TEXT.packet.backToChart);
  back.tabIndex = -1;
  head.prepend(back);
  const linkLabel = make('div', 'tx-bar-label', MAP_TEXT.packet.linkLabel);
  packet.prepend(linkLabel);
  const room = make('div', 'tx-packet tx-room');
  const roomLabel = make('div', 'tx-bar-label', MAP_TEXT.packet.roomLabel);
  const roomBar = make('div', 'tx-bar tx-room-bar');
  const roomFiles = make('span', 'tx-bar-files');
  const roomCharge = make('span', 'tx-bar-charge');
  roomBar.append(roomFiles, roomCharge);
  const roomOver = make('div', 'tx-bar-over');
  roomOver.hidden = true;
  const roomLine = make('div', 'tx-packet-line tx-room-line');
  const roomCharges = make('div', 'tx-room-charge');
  room.append(roomLabel, roomBar, roomOver, roomLine, roomCharges);
  packet.after(room);
  const control = make('div', 'tx-control');
  control.hidden = true;
  room.after(control);
  const confirm = make('div', 'tx-confirm');
  confirm.hidden = true;
  const confirmYes = make('button', 'tx-confirm-yes', MAP_TEXT.packet.confirmYes);
  const confirmNo = make('button', 'tx-confirm-no', MAP_TEXT.packet.confirmNo);
  confirmYes.tabIndex = -1;
  confirmNo.tabIndex = -1;
  const buttons = make('div', 'tx-confirm-buttons');
  buttons.append(confirmYes, confirmNo);
  const confirmQ = make('div', 'tx-confirm-q', MAP_TEXT.packet.zeroConfirm);
  confirm.append(confirmQ, buttons, make('div', 'tx-confirm-keys', MAP_TEXT.packet.confirmKeys));
  foot.append(confirm);
  const stamp = make('div', 'tx-stamp', MAP_TEXT.packet.stamp);
  stamp.hidden = true;
  inner.append(stamp);
  const sendControl = make('div', 'tx-send-control');
  sendControl.append(make('span', 'tx-control-tag', MAP_TEXT.packet.controlTag), make('span', 'tx-control-text', MAP_TEXT.packet.control));
  send.append(sendControl);
  // 3b: the DELIVERIES row and the IN TRANSIT line, under the unit's own files.
  const chips = root.querySelector<HTMLElement>('.tx-chips');
  if (!chips) throw new Error('TransmitScreen: index.html lost the PACKET\'s chips');
  const deliveries = make('div', 'tx-deliveries');
  deliveries.hidden = true;
  const deliveryChips = make('div', 'tx-chips tx-delivery-chips');
  deliveries.append(make('div', 'tx-bar-label tx-deliveries-label', REPO_TEXT.packet.deliveriesLabel), deliveryChips);
  const inTransit = make('div', 'tx-intransit');
  inTransit.hidden = true;
  chips.after(deliveries, inTransit);
  return {
    back, room, roomBar, roomFiles, roomCharge, roomOver, roomLine, roomCharges, linkLabel, control, confirm, confirmQ, confirmYes,
    confirmNo, stamp, sendControl, deliveries, deliveryChips, inTransit,
  };
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
  const traceEl = requireById('txTrace');
  const noRmEl = requireById('txNoRm');
  const hitsEl = requireById('txHits');
  const arrivalEl = requireById('txArrival');
  const sendEl = requireById('txSend');
  const sendLine = requireById('txSendLine');
  const sendFill = requireById('txSendFill');
  const sendLy = requireById('txSendLy');
  const goBtn = requireById<HTMLButtonElement>('txGo');
  const whiteOut = requireById('whiteOut');
  const parts = buildPacketParts(root);

  titleEl.textContent = TRANSMIT_TEXT.title;
  draftTitle.textContent = DRAFT_TEXT.title;
  whiteOut.style.setProperty('--wo-in', `${WHITE_OUT_IN_SEC}s`);
  whiteOut.style.setProperty('--wo-fade', `${WHITE_OUT_FADE_SEC}s`);

  let shown = false;
  let sending = false;
  let model: TransmitModel | null = null;
  let shownDeal = '';
  // The TIGHT ship's inline confirm is up (TRANSMIT ▸ on a packet that arrives with no charge), and whether this PACKET
  // has already buzzed its `→ 0 ON ARRIVAL` (once per screen, not per repaint).
  let confirming = false;
  let zeroAnnounced = false;
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
    // (A plan cleared before the phase moves on, as a debug jump from the PACKET does, has nothing left to paint.)
    if (state.run.phase !== 'transmit' || state.run.transit === null) return;
    const next = transmitModel(state);
    model = next;
    nextEl.textContent = next.headline;
    whyEl.hidden = next.why === null;
    whyEl.textContent = next.why ?? '';
    whyEl.classList.toggle('emergency', next.emergency);
    barEl.style.setProperty('--link-blocks', String(next.link));
    barFiles.style.width = `${Math.min(100, (100 * next.files) / next.link)}%`;
    barCharge.style.width = `${(100 * next.chargeCarried) / next.link}%`;
    // Files over the link (the review's B1) hang off the bar's end in red, like the room's; else the charge left behind.
    const overLink = next.room.fit.overLink;
    const left = next.chargeHeld - next.chargeCarried;
    barEl.classList.toggle('over-link', overLink > 0);
    barOver.hidden = overLink <= 0 && left <= 0;
    barOver.textContent = overLink > 0 ? `+${overLink}` : left > 0 ? TRANSMIT_TEXT.over(left) : '';
    barOver.title = overLink > 0 ? '' : left > 0 ? TRANSMIT_TEXT.overTitle(left) : '';
    packetLine.textContent = next.packetLine;
    dropLine.textContent = next.dropLine;
    // Slice 4: a skill file's chip (TREE's PacketChip.skill) with its badge and PACK AS buttons; the file it is in memory
    // gives the damage badge (none for a file trained here: it is fresh).
    const chips: HTMLElement[] = next.chips.map((chip) => {
      if (chip.skill === null) return chipNode(chip);
      const seg = state.memory.find((candidate) => candidate.id === chip.segId);
      return skillChipNode(chip, chip.skill, seg !== undefined && isSkillFile(seg) ? seg : null);
    });
    if (next.cardFile) chips.push(cardFileNode(next.cardFile));
    if (next.uninvited) chips.push(uninvitedNode(next.uninvited));
    chipsEl.replaceChildren(...chips);
    parts.deliveries.hidden = next.deliveries.length === 0;
    parts.deliveryChips.replaceChildren(...next.deliveries.map(deliveryNode));
    parts.inTransit.hidden = next.inTransit === null;
    parts.inTransit.textContent = next.inTransit ?? '';
    draftTitle.textContent = next.salvageTitle ?? DRAFT_TEXT.title;
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
    traceEl.hidden = next.trace === null;
    traceEl.textContent = next.trace?.text ?? '';
    traceEl.dataset.tone = next.trace?.tone ?? '';
    noRmEl.hidden = next.noRm === null;
    noRmEl.textContent = next.noRm ?? '';
    infectedEl.hidden = next.infectedLine === null;
    infectedEl.textContent = next.infectedLine ?? '';
    hitsEl.textContent = next.onTheWay ?? next.hitsLine;
    arrivalEl.textContent = next.arrivalLine;
    paintRoom(next);
  }

  // The room bar (01 §3.16): the files and the charge that arrives against the destination's room.
  function paintRoom(current: TransmitModel): void {
    const room = current.room;
    const fit = room.fit;
    const pct = (blocks: number): string => `${Math.min(100, (100 * blocks) / fit.room)}%`;
    parts.room.dataset.tone = room.tone;
    parts.roomBar.style.setProperty('--link-blocks', String(fit.room));
    parts.roomFiles.style.width = pct(Math.min(fit.files, fit.room));
    parts.roomCharge.style.width = pct(Math.max(0, Math.min(fit.chargeArrives, fit.room - fit.files)));
    const hang = room.tone === 'over' ? fit.over : fit.roomLost;
    parts.roomOver.hidden = hang <= 0;
    parts.roomOver.textContent = room.tone === 'over' ? `+${fit.over}` : hang > 0 ? MAP_TEXT.packet.wontFit(hang) : '';
    parts.roomLine.textContent = room.line;
    parts.roomCharges.hidden = room.charge === null && room.tooMany === null;
    parts.roomCharges.textContent = room.tooMany ?? room.charge ?? '';
    parts.roomCharges.dataset.tone = room.tone;
    const zero = room.confirm !== null;
    parts.control.hidden = !zero;
    parts.control.replaceChildren(make('span', 'tx-control-tag', MAP_TEXT.packet.controlTag), make('span', 'tx-control-text', MAP_TEXT.packet.controlZero));
    parts.confirmQ.textContent = room.confirm ?? MAP_TEXT.packet.zeroConfirm;
    if (zero && !zeroAnnounced && !root.hidden) {
      zeroAnnounced = true;
      play('buzz');
    }
    if (!zero && confirming) closeConfirm();
  }

  // TRANSMIT ▸ once a card is picked (or when none was dealt); before that it says what is missing.
  const awaitingPick = (current: TransmitModel): boolean => current.cards.length > 0 && current.pick === null;
  function paintGo(current: TransmitModel): void {
    if (sending) return;
    const waiting = awaitingPick(current) || current.room.tooMany !== null;
    goBtn.classList.toggle('waiting', waiting);
    const words = awaitingPick(current) ? DRAFT_TEXT.goWaiting : current.room.tooMany !== null ? MAP_TEXT.packet.goOverRoom : TRANSMIT_TEXT.go;
    renderKeyCaps(goBtn, words, { own: 'SPACE' });
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
    confirming = false;
    zeroAnnounced = false;
    parts.confirm.hidden = true;
    goBtn.hidden = false;
    parts.stamp.hidden = true;
    parts.stamp.classList.remove('on');
    parts.back.hidden = false;
    root.classList.toggle('reduced', reducedMotion());
    sendEl.hidden = true;
    goBtn.disabled = false;
    goBtn.classList.add('arming');
    paint();
    // After a BEAM OUT the old ship's windows go black before the DESK comes up (components/desk/DeskScreen.ts, once per
    // desk visit: the review's m4); the PACKET, opened from the desk, never waits for it again.
    root.hidden = false;
    play('transmitIn');
    // A TIGHT ship that takes no charge says so as the screen comes up (01 §3.16: never a surprise).
    if (model !== null && model.room.confirm !== null && !zeroAnnounced) { zeroAnnounced = true; play('buzz'); }
    inputFromMs = performance.now() + TRANSMIT_ARM_SEC * 1000;
    later(TRANSMIT_ARM_SEC, () => goBtn.classList.remove('arming'));
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
    // Files plus the floor over the destination's room, or files over the link: TRANSMIT ▸ waits until files are left
    // behind (01 §3.16; the review's B1).
    if (current.room.tooMany !== null) {
      play('buzz');
      replayAnimation(parts.room, 'nudge');
      replayAnimation(goBtn, 'nudge');
      return;
    }
    // No charge will arrive (a TIGHT ship): asked first, inline; ENTER says yes.
    if (current.room.confirm !== null && !confirming) {
      openConfirm();
      return;
    }
    closeConfirm();
    sending = true;
    parts.back.hidden = true;
    goBtn.disabled = true;
    root.classList.add('sending');
    // HOLLOW boarding on this beam: the sweep stutters (04 §4, the boarding moment begins here).
    play('transmitSweep', { seconds: TRANSMIT_SEND_SEC, stutter: current.uninvited?.boards === true });
    const going = [
      ...Array.from(chipsEl.querySelectorAll<HTMLElement>('.tx-chip:not(.dropped)')),
      ...Array.from(parts.deliveryChips.querySelectorAll<HTMLElement>('.tx-chip:not(.sent-on)')),
    ];
    const stagger = (TRANSMIT_SEND_SEC * TRANSMIT_STREAM_FRAC) / Math.max(1, going.length);
    going.forEach((chip, i) => {
      chip.style.animationDelay = `${(i * stagger).toFixed(3)}s`;
      chip.classList.add('sent');
    });
    // The picked card goes with the packet; the ones left behind fade.
    cardsEl.classList.add('sending');
    sendLine.textContent = TRANSMIT_TEXT.sending(unitName(store.getState().run.unitNumber), current.shipName);
    sendEl.hidden = false;
    // The BEAM stamp (05 §3.12): OUTWARD BOUND over the screen as the packet goes.
    parts.stamp.hidden = false;
    replayAnimation(parts.stamp, 'on');
    play('stampHit', { heavy: false });
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

  function openConfirm(): void {
    confirming = true;
    parts.confirm.hidden = false;
    goBtn.hidden = true;
    play('buzz');
  }
  function closeConfirm(): void {
    confirming = false;
    parts.confirm.hidden = true;
    goBtn.hidden = false;
  }
  // ◀ CHART [ESC]: back to the desk until the send (the confirm's ESC answers no first).
  function toChart(): void {
    if (!shown || sending || root.hidden) return;
    if (confirming) { closeConfirm(); return; }
    if (store.getState().run.phase !== 'transmit') return;
    play('uiClick');
    backToChart(store);
  }

  function startWhiteOut(): void {
    whiteOut.classList.toggle('reduced', reducedMotion());
    whiteOut.classList.remove('fading');
    whiteOut.hidden = false;
    // Laid out first, so the opacity transition runs from 0.
    void whiteOut.offsetWidth;
    whiteOut.classList.add('on');
    // The hold is counted from the flood's END (its transitionend), not from now (slice 3b review, the e2e's KESTREL →
    // VESPER): on a busy page the timer could fire before a frame had drawn the flood, and the crossing swapped `on` for
    // `fading` with the white never shown. The timer stays as the fallback for a flood that never reports its end.
    let held = false;
    const hold = (): void => {
      if (held) return;
      held = true;
      whiteOut.removeEventListener('transitionend', hold);
      later(WHITE_OUT_HOLD_SEC, cross);
    };
    whiteOut.addEventListener('transitionend', hold);
    later(WHITE_OUT_IN_SEC + WHITE_OUT_FLOOD_GRACE_SEC, hold);
  }

  // At full white: the packet crosses (the hits, the charge, the next ship's world; the phase moves on to its boot, which
  // closes this screen), and the new ship shows through as the white fades. The white lifts even when the crossing throws:
  // the error still reaches the console, and the screen under it shows where the run stopped instead of a white page.
  function cross(): void {
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
  }

  const onChipClick = (event: MouseEvent): void => {
    // Slice 4: PACK AS on a skill file (training.ts setPackAs, TREE's): the lit one again packs it as it is.
    const pack = (event.target as HTMLElement | null)?.closest<HTMLElement>('.tx-packas');
    if (pack) {
      event.stopPropagation();
      const segId = pack.dataset.packSeg;
      if (!segId || sending || !armed()) return;
      const option = model?.chips.find((candidate) => candidate.segId === segId)?.skill?.packAs[Number(pack.dataset.packIndex)];
      if (option === undefined) throw new Error(`TransmitScreen: PACK AS on '${segId}' is not in the PACKET's model`);
      setPackAs(store, segId, option.active ? null : option.level);
      play('uiClick');
      return;
    }
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('.tx-chip');
    const segId = chip?.dataset.segId;
    if (!segId || sending) return;
    event.stopPropagation();
    // 046.log: a click reads it (the LOG READER opens over this screen), once a key has been found.
    if (chip?.dataset.log) {
      const entry = logEntryToOpen(store.getState());
      if (entry === null) play('buzz');
      else openLogReader(store, entry);
      return;
    }
    if (toggleDrop(store, segId) !== null) play('buzz');
  };
  chipsEl.addEventListener('click', onChipClick);
  // A delivery chip: SEND ON, or back into the packet (systems/transmit.ts toggleSendOn works the numbers out again).
  const onDeliveryClick = (event: MouseEvent): void => {
    const key = (event.target as HTMLElement | null)?.closest<HTMLElement>('.tx-delivery')?.dataset.key;
    if (key === undefined || sending || !armed()) return;
    event.stopPropagation();
    // A chip on screen that the plan does not hold is a bug; any other refusal (Track REPO's) is the kid's: a buzz.
    const refusal = toggleSendOn(store, key);
    if (refusal === 'no-chip') throw new Error(`TransmitScreen: the delivery chip '${key}' on screen is not in the plan`);
    play(refusal === null ? 'uiClick' : 'buzz');
  };
  parts.deliveryChips.addEventListener('click', onDeliveryClick);
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
  const offKeys = registerKeys({ layer: 'transmit', codes: ['Space', 'Enter', 'NumpadEnter'], onDown: send });
  const offEsc = registerKeys({ layer: 'transmit', codes: ['Escape'], onDown: toChart });
  const onBack = (event: MouseEvent): void => { event.stopPropagation(); toChart(); };
  const onYes = (event: MouseEvent): void => { event.stopPropagation(); if (confirming) send(); };
  const onNo = (event: MouseEvent): void => { event.stopPropagation(); closeConfirm(); };
  parts.back.addEventListener('click', onBack);
  parts.confirmYes.addEventListener('click', onYes);
  parts.confirmNo.addEventListener('click', onNo);
  const offMute = registerKeys({ layer: 'transmit', codes: ['KeyM'], onDown: () => toggleMuted() });

  const unsubPhase = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'transmit') open();
    else close();
  });
  // A dropped file changes the packet (one update in systems/transmit.ts toggleDrop).
  // So does an entry read in the LOG READER over it (046.log's chip stops glowing).
  const unsubDrops = store.subscribe(
    (s) => `${s.run.transit?.dropped.join('|') ?? ''}#${s.run.transit?.pick ?? ''}#${s.run.log.found.length}/${s.run.log.read.length}`
      + `#${s.run.transit?.deliveries.map((chip) => `${chip.key}:${chip.sendOn ? 1 : 0}`).join('|') ?? ''}`
      + `#${JSON.stringify(s.run.transit?.packAs ?? null)}`,
    () => { if (shown && !sending) paint(); },
  );
  if (store.getState().run.phase === 'transmit') open();

  return () => {
    chipsEl.removeEventListener('click', onChipClick);
    parts.deliveryChips.removeEventListener('click', onDeliveryClick);
    cardsEl.removeEventListener('click', onCardClick);
    offCardKeys.forEach((off) => off());
    goBtn.removeEventListener('click', onGo);
    offKeys();
    offEsc();
    parts.back.removeEventListener('click', onBack);
    parts.confirmYes.removeEventListener('click', onYes);
    parts.confirmNo.removeEventListener('click', onNo);
    offMute();
    unsubPhase();
    unsubDrops();
    stopTimers();
    close();
  };
}
