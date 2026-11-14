import type { ConfirmRequest } from '@systems/fs-tools';
import { getCursorXY } from '@systems/fs-tools';
import { pushModal, registerKeys, passKeyDown } from '@systems/input';
import { onWorldReset } from '@systems/reset';
import { emit, NO_PAYLOAD } from '@systems/events';
import { requireById } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { CONFIRM_TEXT } from '@data/tool-text';

// The inline confirm (§7.1, §9 WP3): a small pill next to the cursor that asks before a delete
// that can't be undone (REPAIR CHARGE, a ship file, the last copy of a tool). It replaces the
// browser's blocking dialogs, which froze the clock and broke the spell.
// • ✓ or ENTER says yes; ✗, ESC or a click anywhere else says no. Saying no keeps the tool in the
//   hand (ESC normally drops it; while the pill is open the confirm's input layer hears it).
// • It is an input modal (systems/input.ts): keys held below it are released, and game keys
//   wait until it closes, except TAB and P: they answer no and then switch screens or pause, so a
//   question never traps the kid while the world runs on.
// • While it is open the cursor follower hides (body.inline-confirm-open), so no ghost of the
//   held tool peeks out behind the pill.
// • On a phone, the held-tool pill in the filesystem bar mirrors the question with its own ✓/✗
//   (components/memory-view/FsToolPill), since there is no cursor to sit next to.

// • Playtest 1 (note 23): a question a key asked ([L] at a full LZ, off-site) opens 'centre', big in the middle of the
//   screen, and may name its own answering keys (`yesCodes` / `noCodes`: [L] or ENTER yes, [N] or ESC no). The first
//   [L]'s keyup goes to the game layer that saw its keydown (input.ts), so a press never answers its own question; a
//   second, fresh [L] does.

// How far from the cursor the pill opens, and the margin it keeps from the screen edges (px).
const CURSOR_OFFSET_PX = 14;
const EDGE_MARGIN_PX = 8;

// The keys a question answers to when it names none, and every key a question may name (the confirm layer hears these).
const DEFAULT_YES_CODES: readonly string[] = ['Enter', 'NumpadEnter'];
const DEFAULT_NO_CODES: readonly string[] = ['Escape'];
export const CONFIRM_ANSWER_CODES: readonly string[] = [...DEFAULT_YES_CODES, ...DEFAULT_NO_CODES, 'KeyL', 'KeyN'];

// What `code` answers to the open question: yes, no, or nothing (a key it does not name).
export function confirmAnswerFor(request: Readonly<ConfirmRequest>, code: string): boolean | null {
  if ((request.yesCodes ?? DEFAULT_YES_CODES).includes(code)) return true;
  if ((request.noCodes ?? DEFAULT_NO_CODES).includes(code)) return false;
  return null;
}

function checkCodes(request: Readonly<ConfirmRequest>): void {
  const named = [...(request.yesCodes ?? []), ...(request.noCodes ?? [])];
  const unheard = named.filter((code) => !CONFIRM_ANSWER_CODES.includes(code));
  if (unheard.length > 0) throw new Error(`askInline: the confirm layer does not hear ${unheard.join(', ')}`);
  const both = (request.yesCodes ?? []).filter((code) => (request.noCodes ?? []).includes(code));
  if (both.length > 0) throw new Error(`askInline: ${both.join(', ')} would answer both yes and no`);
}

let current: ConfirmRequest | null = null;
let closeModal: (() => void) | null = null;
const listeners = new Set<(request: ConfirmRequest | null) => void>();
let showRef: ((request: ConfirmRequest) => void) | null = null;
let hideRef: (() => void) | null = null;

export function currentInlineConfirm(): ConfirmRequest | null {
  return current;
}

export function onInlineConfirmChange(listener: (request: ConfirmRequest | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify(): void {
  document.body.classList.toggle('inline-confirm-open', current !== null);
  listeners.forEach((listener) => listener(current));
}

// Answers the open question (no-op when none is open). Yes runs the request's action after the
// pill has closed, so the action sees the game layer again.
export function answerInlineConfirm(yes: boolean): void {
  const request = current;
  if (!request) return;
  current = null;
  closeModal?.();
  closeModal = null;
  hideRef?.();
  notify();
  if (yes) request.onYes();
}

// Opens the pill next to the cursor. A second question replaces the first (answered no).
export function askInline(request: ConfirmRequest): void {
  if (!showRef) throw new Error('askInline: mountInlineConfirm has not run');
  checkCodes(request);
  if (current) answerInlineConfirm(false);
  current = request;
  closeModal = pushModal('confirm');
  showRef(request);
  notify();
  emit('ui-click', NO_PAYLOAD);
}

export function mountInlineConfirm(): () => void {
  const pill = requireById('inlineConfirm');
  const questionEl = requireById('inlineConfirmQuestion');
  const detailEl = requireById('inlineConfirmDetail');
  const yesBtn = requireById<HTMLButtonElement>('inlineConfirmYes');
  const noBtn = requireById<HTMLButtonElement>('inlineConfirmNo');
  const mirror = requireById('fsToolPill');
  const keysEl = pill.querySelector<HTMLElement>('.ic-keys');
  if (!keysEl) throw new Error('InlineConfirm: index.html lost the pill\'s key hint');
  const defaultKeys = [...keysEl.childNodes].map((node) => node.cloneNode(true));
  showRef = (request) => {
    questionEl.textContent = request.text.question;
    detailEl.textContent = request.text.detail;
    detailEl.hidden = request.text.detail === '';
    // A tool's delete answers DELETE / KEEP; BEAM OUT names its own (WP7).
    yesBtn.textContent = request.answers?.yes ?? CONFIRM_TEXT.yes;
    noBtn.textContent = request.answers?.no ?? CONFIRM_TEXT.no;
    if (request.keys !== undefined) renderKeyCaps(keysEl, request.keys);
    else keysEl.replaceChildren(...defaultKeys.map((node) => node.cloneNode(true)));
    const centre = request.placement === 'centre';
    pill.classList.toggle('centre', centre);
    pill.hidden = false;
    if (centre) {
      // CSS centres it on the screen (.inline-confirm.centre).
      pill.style.left = '';
      pill.style.top = '';
      return;
    }
    // Next to the cursor, kept on screen.
    const { x, y } = getCursorXY();
    const box = pill.getBoundingClientRect();
    const left = Math.min(Math.max(EDGE_MARGIN_PX, x + CURSOR_OFFSET_PX), window.innerWidth - box.width - EDGE_MARGIN_PX);
    const top = Math.min(Math.max(EDGE_MARGIN_PX, y + CURSOR_OFFSET_PX), window.innerHeight - box.height - EDGE_MARGIN_PX);
    pill.style.left = `${Math.max(EDGE_MARGIN_PX, left)}px`;
    pill.style.top = `${Math.max(EDGE_MARGIN_PX, top)}px`;
  };
  hideRef = () => { pill.hidden = true; };

  const onYes = (event: MouseEvent): void => { event.stopPropagation(); answerInlineConfirm(true); };
  const onNo = (event: MouseEvent): void => { event.stopPropagation(); answerInlineConfirm(false); };
  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);

  // A press anywhere else answers no, and that press does nothing else: the click that follows
  // it is swallowed, so dismissing the pill never also uses the tool on what was clicked.
  let swallowClick = false;
  const onPointerDown = (event: PointerEvent): void => {
    swallowClick = false;
    if (!current) return;
    const target = event.target as Node | null;
    if (target && (pill.contains(target) || mirror.contains(target))) return;
    swallowClick = true;
    answerInlineConfirm(false);
  };
  const onClick = (event: MouseEvent): void => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('click', onClick, true);

  const offKeys = registerKeys({
    layer: 'confirm',
    codes: CONFIRM_ANSWER_CODES,
    onDown: (code) => {
      if (!current) return;
      const yes = confirmAnswerFor(current, code);
      if (yes !== null) answerInlineConfirm(yes);
    },
  });
  const offPassKeys = registerKeys({
    layer: 'confirm',
    codes: ['Tab', 'KeyP'],
    onDown: (code) => { answerInlineConfirm(false); passKeyDown(code); },
  });
  // A new ship or run never inherits a question about the old one.
  const offReset = onWorldReset('inline-confirm', () => answerInlineConfirm(false), () => ({ open: current !== null }));

  return () => {
    answerInlineConfirm(false);
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('click', onClick, true);
    offKeys();
    offPassKeys();
    offReset();
    showRef = null;
    hideRef = null;
  };
}
