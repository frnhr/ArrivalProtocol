import type { Store } from '@state/store';
import type { GameState, LogEntry } from '@state/schema';
import { play } from '@systems/audio';
import { onPostTick } from '@systems/clock';
import { registerKeys } from '@systems/input';
import { pickChoice, lineTypeCps, choiceTimerRunning, choiceSecondsLeft, openChoiceEntry } from '@systems/say';
import { requireById, replayAnimation } from '@components/dom';
import { formatTac } from '@systems/guidance';
import { liveVerbText } from '@systems/flight-hud';
import { verbSecondsLeft } from '@state/selectors';
import { createTypeQueue } from '@components/hud/typewriter';
import { TERMINAL_VISIBLE_LINES, LOG_VIEW_KEEP_ROWS, CHOICE_URGENT_SEC, VERB_TELEGRAPH_TYPE_CPS } from '@data/tuning';

// The TERMINAL (§6.3, §7.1): the mind's own voice, a 4-line pane inside the blue screen, just
// above the filesystem chips. Boot and ECC lines, command echoes (accent) and HOLLOW (pink, its
// lines written in lowercase, one detuned blip per letter, slower than anything else) are typed
// here. Lines spoken while the kid is on the ship wait; on the way in the older ones appear at
// once and the newest types itself (a skipped boot's lines never hold up a new line).
// A line spoken with sayChoice carries inline buttons and a timer that drains on AI time (THE DEAL, WP10); clicking a
// button (or its key, `[Y] ACCEPT` / `[N] REFUSE`) answers it, the timer running out answers null. WP10 part 2:
// • the buttons come up once the line has typed (say.ts starts the timer then too), so the offer is read first;
// • the timer is a bar under the line and a clock beside the buttons (`0:12`), in the warning colour and pulsing
//   for its last CHOICE_URGENT_SEC: the 15 s are pressure (the lead's note);
// • an open choice is pinned to the pane while it stands (sticky): the bites and echoes it brings scroll under it, and
//   a 3-line TERMINAL at 1280×720 never pushes the question out of sight;
// • coming back to blue with its clock already running (the offer came while the kid flew) shows it whole at once:
//   the seconds are already being spent, so none go on watching it type.
// Its keys are game keys of the blue screen, not a modal (§6.11's 'choice' layer): a deal during a burn must not drop
// the SPACE the kid is holding, and in amber Y and N do nothing (the ticker says TAB).
// A click on the lines finishes the typing at once.
// WP11 part 2 (LAST LIGHT): a HOLLOW verb's telegraph (`> rm repair.bak ... 3`, a line said with verbCountdown) counts
// its number down live from the verb's own clock (it stands still while the flight is at TACTICAL), with a pink bar
// draining under it and the line pulsing each second; once the verb has ended (BLOCKED, landed, failed, called off) the
// line greys out where it stands and the outcome types under it: BLOCKED in the good green, a landed verb in the warning
// red (the line's tone).

interface ChoiceButton {
  option: string;
  element: HTMLButtonElement;
}

interface ChoiceView {
  entryId: number;
  row: HTMLElement;
  box: HTMLElement;
  buttons: ChoiceButton[];
  clock: HTMLElement;
  timer: HTMLElement;
  fill: HTMLElement;
  shown: boolean;           // the buttons are up: the line has typed (or the kid finished it with a click)
  offKeys: (() => void) | null;
}

// A verb's telegraph line (WP11 part 2): its text node, the bar under it, and whether it has typed and is still live.
interface VerbRow {
  entryId: number;
  row: HTMLElement;
  text: HTMLElement;
  timer: HTMLElement;
  fill: HTMLElement;
  typed: boolean;
  second: number | null;
}

function keyCode(letter: string): string {
  return `Key${letter}`;
}

function choiceView(entry: LogEntry, row: HTMLElement): ChoiceView | null {
  const choice = entry.choice;
  if (!choice) return null;
  row.classList.add('has-choice');
  const box = document.createElement('span');
  box.className = 'term-choice';
  const buttons = choice.options.map((option, index) => {
    const element = document.createElement('button');
    element.className = 'term-choice-btn';
    element.tabIndex = -1;
    const letter = choice.keys?.[index];
    if (letter !== undefined) {
      const cap = document.createElement('kbd');
      cap.className = 'keycap';
      cap.textContent = letter;
      element.append(cap, ' ');
    }
    element.append(option);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      pickChoice(entry.id, option);
    });
    return { option, element };
  });
  box.append(...buttons.map((button) => button.element));
  const clock = document.createElement('span');
  clock.className = 'term-clock';
  box.appendChild(clock);
  const timer = document.createElement('span');
  timer.className = 'term-timer';
  const fill = document.createElement('span');
  timer.appendChild(fill);
  box.hidden = true;
  timer.hidden = true;
  row.append(box, timer);
  return { entryId: entry.id, row, box, buttons, clock, timer, fill, shown: false, offKeys: null };
}

export function mountMindTerminal(store: Store<GameState>): () => void {
  const root = requireById('mindTerminal');
  const linesEl = requireById('mindTermLines');
  root.style.setProperty('--term-lines', String(TERMINAL_VISIBLE_LINES));

  const queue = createTypeQueue(() => store.getState().ui.mode === 'memory');
  const choices = new Map<number, ChoiceView>();
  // The verb telegraph still counting (at most one: the newest; an older one is over).
  let verbRow: VerbRow | null = null;
  let lastId = 0;

  // The verb's line stops counting: greyed where it stands, its bar gone.
  function endVerbRow(): void {
    if (verbRow === null) return;
    verbRow.row.classList.add('verb-over');
    verbRow.row.classList.remove('verb-live', 'verb-urgent');
    verbRow.timer.remove();
    verbRow = null;
  }

  // Per tick: the live verb's number and bar, or its end.
  function paintVerbRow(): void {
    if (verbRow === null) return;
    const state = store.getState();
    const verb = state.hollow.verb;
    const live = liveVerbText(state);
    if (verb === null || live === null) { endVerbRow(); return; }
    const telegraphSec = state.hollow.cfg.verbs?.telegraphSec;
    if (telegraphSec === undefined) throw new Error('MindTerminal: a verb counts down on a ship whose HOLLOW has no verbs');
    verbRow.fill.style.width = `${Math.max(0, Math.min(100, (100 * verb.leftSec) / telegraphSec))}%`;
    if (!verbRow.typed) return;
    if (verbRow.text.textContent !== live) verbRow.text.textContent = live;
    const second = verbSecondsLeft(verb);
    if (verbRow.second !== null && second < verbRow.second) replayAnimation(verbRow.row, 'verb-tick');
    verbRow.second = second;
    verbRow.row.classList.toggle('verb-urgent', second <= 1);
  }

  const scrollToEnd = (): void => { linesEl.scrollTop = linesEl.scrollHeight; };

  // The clock beside the buttons and the bar under the line, from leftAiSec (mutated per AI tick: painted per tick).
  function paintClock(view: ChoiceView, entry: LogEntry): void {
    const choice = entry.choice;
    if (!choice?.open) return;
    const left = choiceSecondsLeft(choice);
    const text = formatTac(left);
    if (view.clock.textContent !== text) view.clock.textContent = text;
    view.fill.style.width = `${(100 * choice.leftAiSec) / choice.timeoutAiSec}%`;
    const running = choiceTimerRunning(store.getState(), entry);
    view.row.classList.toggle('urgent', running && left <= CHOICE_URGENT_SEC);
  }

  function paintChoice(view: ChoiceView, entry: LogEntry | undefined): void {
    const choice = entry?.choice;
    if (!entry || !choice) return;
    view.buttons.forEach((button) => {
      button.element.disabled = !choice.open;
      button.element.classList.toggle('picked', choice.picked === button.option);
    });
    view.timer.hidden = !choice.open || !view.shown;
    view.clock.hidden = !choice.open;
    view.row.classList.toggle('choice-open', choice.open);
    view.row.classList.toggle('timed-out', !choice.open && choice.picked === null);
    if (!choice.open) {
      view.row.classList.remove('urgent');
      view.offKeys?.();
      view.offKeys = null;
    }
    paintClock(view, entry);
  }

  // The line has typed (or a click finished it): the buttons come up, and their keys are heard.
  function showChoice(view: ChoiceView): void {
    if (view.shown) return;
    view.shown = true;
    view.box.hidden = false;
    const entry = store.getState().log.entries.find((candidate) => candidate.id === view.entryId);
    const choice = entry?.choice;
    if (choice?.open && choice.keys !== null) {
      const options = new Map(choice.keys.map((letter, index) => [keyCode(letter), choice.options[index]!]));
      view.offKeys = registerKeys({
        layer: 'game',
        codes: [...options.keys()],
        onDown: (code) => {
          if (store.getState().ui.mode !== 'memory') return;
          const option = options.get(code);
          if (option !== undefined) pickChoice(view.entryId, option);
        },
      });
    }
    paintChoice(view, entry);
    scrollToEnd();
  }

  // A divider between two ships (WP7): drawn whole, in its turn after the lines before it.
  function addDivider(entry: LogEntry): void {
    const row = document.createElement('div');
    row.className = 'term-line log-divider';
    row.textContent = entry.text;
    row.hidden = true;
    linesEl.appendChild(row);
    while (linesEl.childElementCount > LOG_VIEW_KEEP_ROWS) linesEl.firstElementChild?.remove();
    queue.push({ length: 0, cps: 1, paint: () => { row.hidden = false; scrollToEnd(); } });
  }

  function addLine(entry: LogEntry): void {
    if (entry.divider) { addDivider(entry); return; }
    const row = document.createElement('div');
    row.className = `term-line speaker-${entry.speaker}${entry.tone ? ` tone-${entry.tone}` : ''}`;
    row.hidden = true;
    const text = document.createElement('span');
    text.className = 'term-text';
    row.appendChild(text);
    const view = choiceView(entry, row);
    if (view) choices.set(entry.id, view);
    // A verb's telegraph: the newest one counts, any older one is over (one verb at a time).
    let verb: VerbRow | null = null;
    if (entry.verbCountdown) {
      endVerbRow();
      // It jumps the queue: whatever is still waiting to type shows at once, so its 3 s start now (VERB_TELEGRAPH_TYPE_CPS).
      queue.finishAll();
      row.classList.add('verb-countdown', 'verb-live');
      const timer = document.createElement('span');
      timer.className = 'term-timer verb-timer';
      const fill = document.createElement('span');
      timer.appendChild(fill);
      row.appendChild(timer);
      verb = { entryId: entry.id, row, text, timer, fill, typed: false, second: null };
      verbRow = verb;
    }
    linesEl.appendChild(row);
    while (linesEl.childElementCount > LOG_VIEW_KEEP_ROWS) linesEl.firstElementChild?.remove();

    const hollow = entry.speaker === 'hollow' || entry.speaker === 'hollow-cmd';
    const reveal = (): void => {
      row.hidden = false;
      scrollToEnd();
    };
    queue.push({
      length: entry.text.length,
      cps: verb !== null ? VERB_TELEGRAPH_TYPE_CPS : lineTypeCps(entry.speaker),
      onStart: reveal,
      onUnit: (index) => {
        if (entry.text[index] === ' ') return;
        play('typeTick', { voice: hollow ? 'hollow' : 'sys' });
      },
      paint: (count, done) => {
        if (row.hidden) reveal();
        // A live verb types its number as it is now (the same length: one digit), then counts on per tick.
        const live = verb !== null && verbRow === verb ? liveVerbText(store.getState()) : null;
        text.textContent = (live ?? entry.text).slice(0, count);
        row.classList.toggle('typing', !done);
        if (done && view) showChoice(view);
        if (done && verb !== null) verb.typed = true;
        scrollToEnd();
      },
    });
  }

  function sync(): void {
    const entries = store.getState().log.entries;
    if (entries.length === 0 && lastId > 0) {
      queue.clear();
      choices.forEach((view) => view.offKeys?.());
      choices.clear();
      verbRow = null;
      linesEl.replaceChildren();
      lastId = 0;
      return;
    }
    for (const entry of entries) {
      if (entry.id <= lastId) continue;
      lastId = entry.id;
      if (entry.channel === 'mind') addLine(entry);
    }
    // Choices opened or closed (a click, a timeout).
    for (const [entryId, view] of choices) {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) { view.offKeys?.(); choices.delete(entryId); continue; }
      paintChoice(view, entry);
      if (!entry.choice?.open) choices.delete(entryId);
    }
  }

  const onClick = (): void => queue.finishAll();
  linesEl.addEventListener('click', onClick);

  sync();
  const unsubLog = store.subscribe((s) => s.log.rev, sync);
  const unsubMode = store.subscribe((s) => s.ui.mode, (mode) => {
    if (mode !== 'memory') return;
    queue.catchUp();
    // A choice whose clock already runs (it came while the kid flew) is shown whole at once: its seconds are being spent.
    const state = store.getState();
    const open = openChoiceEntry(state);
    if (open !== null && choiceTimerRunning(state, open)) queue.finishAll();
    queue.kick();
  });
  // The clocks drain with leftAiSec, which say.ts mutates per AI tick (no store update); a verb's with hollow.verb.
  const offTick = onPostTick(() => {
    paintVerbRow();
    if (choices.size === 0) return;
    const entries = store.getState().log.entries;
    for (const [entryId, view] of choices) {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (entry?.choice?.open) paintClock(view, entry);
    }
  });

  return () => {
    linesEl.removeEventListener('click', onClick);
    unsubLog();
    unsubMode();
    offTick();
    choices.forEach((view) => view.offKeys?.());
    queue.clear();
  };
}
