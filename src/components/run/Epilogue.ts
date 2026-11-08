// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.10, §4.1; R19, R20): the
// EPILOGUE, RUN END's night (`.run-end`'s palette, styles/night.css), its lines typed at EPILOGUE_CPS with arrivalChoir under
// it ('epilogue-open'; a tick per line, 'epilogue-line'); one click (or ENTER / SPACE) finishes the typing, a second goes on
// to the FINAL CARD (ui.runEndStage 'final'). Reduced motion shows it whole. Mounted by main.ts after mountRunEnd, on
// index.html's #epilogue; reached from the RUN TALLY's EPILOGUE ▸. Presentation on wall time, like
// RUN END: the world is stopped.
// Every line is laid out whole from the start (its untyped rest transparent), so the typing never moves the lines below.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { epilogueModel, type EpilogueModel } from '@systems/epilogue';
import { setRunEndStage } from '@systems/run';
import { archiveMeta } from '@systems/meta';
import { emit, NO_PAYLOAD } from '@systems/events';
import { registerKeys } from '@systems/input';
import { requireById, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { EPILOGUE_TEXT } from '@data/epilogue-text';
import { EPILOGUE_CPS, EPILOGUE_LINE_GAP_SEC, EPILOGUE_HOLD_SEC, EPILOGUE_ARM_SEC } from '@data/tuning';

interface TypedLine {
  typed: HTMLElement;
  rest: HTMLElement;
  text: string;
  startSec: number;           // from the typing's start
  endSec: number;
}

export function mountEpilogue(store: Store<GameState>): () => void {
  const root = requireById('epilogue');
  root.hidden = true;
  const inner = make('div', 'ne-inner');
  const linesEl = make('div', 'ne-lines');
  const onBtn = make('button', 'ne-on');
  onBtn.tabIndex = -1;
  const foot = make('div', 'ne-foot');
  foot.appendChild(onBtn);
  inner.append(linesEl, foot);
  root.replaceChildren(inner);

  let model: EpilogueModel | null = null;
  let lines: TypedLine[] = [];
  let frame: number | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let openedMs = 0;
  let typingDone = false;
  let nextLine = 0;
  const reducedMotion = (): boolean => store.getState().ui.reducedMotion;

  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  };

  const showOn = (): void => { root.classList.add('typed'); };

  // Every line whole: the typing is over (a click, reduced motion, or its time).
  function finishTyping(hold: boolean): void {
    stop();
    for (const line of lines) {
      line.typed.textContent = line.text;
      line.rest.textContent = '';
      line.typed.parentElement?.classList.add('shown');
    }
    typingDone = true;
    if (hold) holdTimer = setTimeout(showOn, EPILOGUE_HOLD_SEC * 1000);
    else showOn();
  }

  function tick(now: number): void {
    const sec = (now - openedMs) / 1000 - EPILOGUE_ARM_SEC;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (sec < line.startSec) break;
      if (i >= nextLine) {
        nextLine = i + 1;
        line.typed.parentElement?.classList.add('shown');
        emit('epilogue-line', { n: i });
      }
      const chars = Math.min(line.text.length, Math.floor((sec - line.startSec) * EPILOGUE_CPS));
      if (line.typed.textContent!.length !== chars) {
        line.typed.textContent = line.text.slice(0, chars);
        line.rest.textContent = line.text.slice(chars);
      }
    }
    const last = lines[lines.length - 1];
    if (last === undefined || sec >= last.endSec) {
      frame = null;
      finishTyping(true);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function open(next: EpilogueModel): void {
    stop();
    model = next;
    typingDone = false;
    nextLine = 0;
    root.classList.remove('typed');
    root.classList.toggle('reduced', reducedMotion());
    let at = 0;
    lines = next.lines.map((line): TypedLine => {
      const row = make('div', `ne-line kind-${line.kind}`);
      const typed = make('span', 'ne-typed');
      const rest = make('span', 'ne-rest', line.text);
      row.append(typed, rest);
      const startSec = at;
      const endSec = startSec + line.text.length / EPILOGUE_CPS;
      // The header and the step into the pieces breathe a little longer.
      at = endSec + EPILOGUE_LINE_GAP_SEC * (line.kind === 'header' ? 2 : 1);
      return { typed, rest, text: line.text, startSec, endSec };
    });
    linesEl.replaceChildren(...lines.map((line) => line.typed.parentElement!));
    renderKeyCaps(onBtn, EPILOGUE_TEXT.goOn, { own: 'SPACE' });
    root.hidden = false;
    openedMs = performance.now();
    emit('epilogue-open', NO_PAYLOAD);
    if (reducedMotion()) finishTyping(false);
    else frame = requestAnimationFrame(tick);
  }

  function close(): void {
    stop();
    model = null;
    lines = [];
    root.hidden = true;
  }

  // One click finishes the typing, a second goes on (§2.10); nothing before the arm.
  function press(): void {
    if (model === null || store.getState().ui.runEndStage !== 'epilogue') return;
    if (performance.now() < openedMs + EPILOGUE_ARM_SEC * 1000) return;
    if (!typingDone) {
      finishTyping(false);
      return;
    }
    setRunEndStage(store, 'final');
  }

  const sync = (): void => {
    const state = store.getState();
    if (state.run.phase !== 'end' || state.ui.runEndStage !== 'epilogue') {
      close();
      return;
    }
    if (model !== null) return;
    const next = epilogueModel(state, state.archive.status === 'ok' ? archiveMeta() : null);
    // No epilogue to tell (never at a run end, kept as the stub's way on): deferred, never an update inside the fan-out.
    if (next === null) queueMicrotask(() => { if (store.getState().ui.runEndStage === 'epilogue') setRunEndStage(store, 'final'); });
    else open(next);
  };
  const onClick = (event: MouseEvent): void => { event.stopPropagation(); press(); };
  root.addEventListener('click', onClick);
  const offKeys = registerKeys({ layer: 'end', codes: ['Space', 'Enter'], onDown: press });
  const unsub = store.subscribe((s) => `${s.run.phase}|${s.ui.runEndStage}`, sync);
  sync();
  return () => {
    root.removeEventListener('click', onClick);
    offKeys();
    unsub();
    close();
  };
}
