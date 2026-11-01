import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import {
  logReaderModel, adjacentFoundEntry, logChip, LOG_UI_TEXT, type LogReaderModel, type LogReaderRow,
} from '@systems/log-view';
import { openLogReader, closeLogReader, markLogEntryRead } from '@systems/story-log';
import { pushModal, registerKeys } from '@systems/input';
import { isLivePhase, setPaused } from '@systems/clock';
import { play, toggleMuted } from '@systems/audio';
import { unitsAt } from '@components/hud/typewriter';
import { requireById, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { LOG_STRIP_KNOWN, LOG_STRIP_UNKNOWN } from './SegmentBlock';
import { LOG_TEXT } from '@data/log-text';
import { LOG_READER_CPS, WALL_FRAME_MAX_SEC } from '@data/tuning';

// The LOG READER (05-story §4; slice-2-plan §1.1 item 15, §5.3): 046.log in the mind's blue, over whatever is up (the
// TRANSMIT screen when entry 01 opens by itself after ship 1's report, or the game when INSPECT's READ or the PACKET's
// chip opens it). One row per entry: its number, its KEY, and its text, `[NOT FOUND YET]`, or NEW while a found entry
// waits to be read; the next key under them (`NEXT KEY: RING 2 · 45 LY`). It is open while ui.logReader is set
// (systems/story-log.ts opens it); the entry it is open on types itself the first time (wall time, LOG_READER_CPS, a
// soft tick per character), then markLogEntryRead records it, so the chip stops glowing. A click or a key during the
// typing finishes it. ↑ ↓ (or a click on a found row) move between the found entries; SPACE, ENTER, ESC, CLOSE or a
// click outside the card close it (closeLogReader). It owns the keys while it is up (input layer 'reader'), and over a
// live ship it pauses the world, so reading never costs a pod (the pause lifts as it closes, if the reader made it).
// On a phone it is a full-screen sheet (threat.css). Reduced motion: the entry stands whole at once.

// mountLogChips: 046.log's chip on the strip (SegmentBlock draws it, `data-log-chip`): its name (`???` until the kid
// knows it), `3/12` and the glow while an entry is unread, from run.log (systems/log-view.ts logChip). Patched after every
// strip rebuild (it subscribes after MemoryStrip) and whenever the log changes, which bumps no memoryRev.

export function mountLogChips(store: Store<GameState>): () => void {
  const memWrap = requireById('memWrap');
  const paint = (): void => {
    const chip = logChip(store.getState());
    memWrap.querySelectorAll<HTMLElement>('[data-log-chip]').forEach((part) => {
      part.classList.toggle('glow', chip.glow);
      part.classList.toggle('known', chip.known);
      part.title = chip.glow ? `${chip.label} · ${LOG_UI_TEXT.unread}` : chip.label;
      const name = part.querySelector('[data-log-name]');
      const short = chip.known ? LOG_STRIP_KNOWN : LOG_STRIP_UNKNOWN;
      if (name && name.textContent !== short) name.textContent = short;
      const count = part.querySelector('[data-log-count]');
      const shown = chip.known ? chip.count : '';
      if (count && count.textContent !== shown) count.textContent = shown;
    });
  };
  paint();
  return store.subscribe(
    (s) => `${s.ui.memoryRev}|${s.run.log.scanned}|${s.run.log.found.length}|${s.run.log.read.length}`,
    paint,
  );
}

const TYPE_LEAD_SEC = 0.25;
// One soft tick every this many typed characters (spaces skipped): a patter, not a drum roll.
const TICK_EVERY_CHARS = 2;

function rowNode(row: LogReaderRow): HTMLElement {
  const node = make('div', 'lg-row');
  node.dataset.entry = String(row.n);
  node.classList.toggle('found', row.found);
  node.classList.toggle('missing', !row.found);
  node.classList.toggle('open', row.open);
  node.classList.toggle('unread', row.found && !row.read);
  const head = make('div', 'lg-row-head');
  head.append(make('span', 'lg-num', row.num), make('span', 'lg-key-k', LOG_TEXT.readerKey), make('span', 'lg-key', row.key));
  if (row.found && !row.read && !row.open) head.appendChild(make('span', 'lg-new', LOG_UI_TEXT.unread));
  node.appendChild(head);
  const body = make('div', 'lg-text');
  if (!row.found) body.textContent = LOG_TEXT.notFound;
  else if (row.read && row.lines) body.textContent = row.lines.join('\n');
  // An unread entry shows nothing until it types itself (the open one) or is opened.
  node.appendChild(body);
  return node;
}

export function mountLogReader(store: Store<GameState>): () => void {
  const root = requireById('logReader');
  const card = requireById('lgCard');
  const kickerEl = requireById('lgKicker');
  const titleEl = requireById('lgTitle');
  const countEl = requireById('lgCount');
  const rowsEl = requireById('lgRows');
  const nextEl = requireById('lgNext');
  const closeBtn = requireById<HTMLButtonElement>('lgClose');

  renderKeyCaps(closeBtn, `${LOG_UI_TEXT.close} [ESC]`, { own: 'ESC' });

  let closeModal: (() => void) | null = null;
  let pausedByReader = false;
  let shownKey = '';
  // The entry typing now: its text, how far it has got, and the frame driving it.
  let typing: { entry: number; text: string; shown: number; body: HTMLElement } | null = null;
  let frame: number | null = null;
  let lastFrameMs = 0;
  let elapsedSec = 0;

  const stopTyping = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    typing = null;
  };

  // The typing ends (it ran out, or a click or key finished it): the whole entry stands, and the run records it read.
  const finishTyping = (): void => {
    const job = typing;
    if (job === null) return;
    job.body.textContent = job.text;
    job.body.classList.remove('typing');
    stopTyping();
    markLogEntryRead(store, job.entry);
  };

  const step = (now: number): void => {
    const job = typing;
    if (job === null) return;
    // Wall time, at most WALL_FRAME_MAX_SEC a frame (a hidden tab resumes where it stopped).
    elapsedSec += Math.min(WALL_FRAME_MAX_SEC, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    const units = unitsAt(elapsedSec, TYPE_LEAD_SEC, LOG_READER_CPS, job.text.length);
    if (units > job.shown) {
      for (let i = job.shown; i < units; i++) {
        const char = job.text[i] ?? ' ';
        if (char.trim() !== '' && i % TICK_EVERY_CHARS === 0) { play('typeTick', { voice: 'sys' }); break; }
      }
      job.shown = units;
      job.body.textContent = job.text.slice(0, units);
    }
    if (units >= job.text.length) { finishTyping(); return; }
    frame = requestAnimationFrame(step);
  };

  const startTyping = (row: LogReaderRow): void => {
    stopTyping();
    const body = rowsEl.querySelector<HTMLElement>(`.lg-row[data-entry="${row.n}"] .lg-text`);
    if (!body || !row.lines) throw new Error(`LogReader: entry ${row.n} is open but has no row to type into`);
    typing = { entry: row.n, text: row.lines.join('\n'), shown: 0, body };
    if (store.getState().ui.reducedMotion) { finishTyping(); return; }
    body.classList.add('typing');
    body.textContent = '';
    elapsedSec = 0;
    lastFrameMs = performance.now();
    frame = requestAnimationFrame(step);
  };

  function paint(model: LogReaderModel): void {
    kickerEl.textContent = model.kicker;
    titleEl.textContent = model.title;
    countEl.textContent = model.counts;
    nextEl.textContent = model.nextKey;
    rowsEl.replaceChildren(...model.rows.map(rowNode));
    const open = model.rows.find((row) => row.open);
    if (!open) return;
    const openNode = rowsEl.querySelector<HTMLElement>(`.lg-row[data-entry="${open.n}"]`);
    openNode?.scrollIntoView({ block: 'nearest' });
    if (!open.read) startTyping(open);
  }

  function show(): void {
    if (closeModal === null) closeModal = pushModal('reader');
    root.hidden = false;
    root.classList.toggle('reduced', store.getState().ui.reducedMotion);
    // Reading never costs a pod: a live ship waits (the reader lifts the pause it made as it closes).
    const state = store.getState();
    if (isLivePhase(state) && !state.clock.paused) pausedByReader = setPaused(store, true);
  }

  function hide(): void {
    stopTyping();
    root.hidden = true;
    shownKey = '';
    closeModal?.();
    closeModal = null;
    if (pausedByReader && store.getState().clock.paused) setPaused(store, false);
    pausedByReader = false;
  }

  // Repaint on what the reader shows: the entry it is open on, and what the run has found and read. A read recorded by
  // finishTyping itself changes nothing on screen (the text already stands), so it does not repaint (and retype).
  function sync(): void {
    const state = store.getState();
    if (state.ui.logReader === null) { if (!root.hidden || closeModal !== null) hide(); return; }
    if (root.hidden) show();
    const key = `${state.ui.logReader.entry}|${[...state.run.log.found].sort((a, b) => a - b).join(',')}`;
    if (key === shownKey) return;
    shownKey = key;
    paint(logReaderModel(state));
  }

  // A key while typing finishes the entry; otherwise SPACE / ENTER / ESC close and ↑ ↓ move.
  const close = (): void => {
    finishTyping();
    closeLogReader(store);
  };
  const move = (step: 1 | -1): void => {
    finishTyping();
    const open = store.getState().ui.logReader?.entry;
    if (open === undefined) return;
    const next = adjacentFoundEntry(store.getState(), open, step);
    if (next === null) { play('buzz'); return; }
    openLogReader(store, next);
  };
  const onCloseKey = (): void => {
    if (typing !== null) { finishTyping(); return; }
    close();
  };

  const onRootClick = (event: MouseEvent): void => {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    // Outside the card: close.
    if (target !== null && !card.contains(target)) { close(); return; }
    if (typing !== null) { finishTyping(); return; }
    const row = target?.closest<HTMLElement>('.lg-row.found');
    const entry = row ? Number(row.dataset.entry) : NaN;
    if (Number.isInteger(entry) && entry !== store.getState().ui.logReader?.entry) openLogReader(store, entry);
  };
  root.addEventListener('click', onRootClick);
  const onClose = (event: MouseEvent): void => { event.stopPropagation(); close(); };
  closeBtn.addEventListener('click', onClose);

  const offKeys = [
    registerKeys({ layer: 'reader', codes: ['Space', 'Enter', 'NumpadEnter', 'Escape'], onDown: onCloseKey }),
    registerKeys({ layer: 'reader', codes: ['ArrowUp'], onDown: () => move(-1) }),
    registerKeys({ layer: 'reader', codes: ['ArrowDown'], onDown: () => move(1) }),
    registerKeys({ layer: 'reader', codes: ['KeyM'], onDown: () => toggleMuted() }),
  ];
  const unsub = store.subscribe(
    (s) => `${s.ui.logReader?.entry ?? '-'}|${s.run.log.found.length}`,
    () => sync(),
  );
  sync();

  return () => {
    root.removeEventListener('click', onRootClick);
    closeBtn.removeEventListener('click', onClose);
    offKeys.forEach((off) => off());
    unsub();
    hide();
  };
}
