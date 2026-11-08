// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §6.2): the residents' voices, the lock's countdown
// row and the untimed choice. Others ask by message.
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
import { terminalVoice, choiceHasTimer, lockAimView } from '@systems/resident-hud';
import { createTypeQueue } from '@components/hud/typewriter';
import { sleepLineYears } from '@data/map-text';
import { isBypassLine, bypassMask, bypassResolvedSec, bypassParts } from '@systems/receiver-bypass';
import {
  TERMINAL_VISIBLE_LINES, LOG_VIEW_KEEP_ROWS, CHOICE_URGENT_SEC, VERB_TELEGRAPH_TYPE_CPS, SLEEP_YEAR_ROLL_MS, SLEEP_YEAR_TICK_YEARS,
} from '@data/tuning';

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
// WP11 part 2 (LAST LIGHT): a HOLLOW verb's telegraph (`> unlink repair.bak ... 3`, a line said with verbCountdown)
// counts its number down live from the verb's own clock (it stands still while the flight is at TACTICAL), with a pink
// bar draining under it and the line pulsing each second; once the verb has ended (BLOCKED, landed, failed, called off)
// the line greys out where it stands and the outcome types under it: BLOCKED in the good green, a landed verb in the
// warning red (the line's tone).
// Phase 3 slice 3b (02-map §4 step 2): the boot's sleep line (`> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS`)
// rolls its approach year up from the arrival year as it types, over SLEEP_YEAR_ROLL_MS of wall time, with a soft tick
// ratchet every SLEEP_YEAR_TICK_YEARS: the years are felt, not just read. The line keeps its length (the year keeps its
// digits), so the typing is the same; a line shown at once (a catch-up, reduced motion) shows its true year.
// Slice 5 (04 §4, plan §2.11): a ship's own AI types in amber capitals with its flat one-note blip, the sleeper in the good
// green with its soft sine (systems/resident-hud.ts terminalVoice). A resident's lock (`> LOCK POD 07 ... 3`) counts down as
// a verb does, from state.resident.corrupted.lock (liveVerbText(state, 'resident')), in its own row: the verb rows are keyed
// by speaker, so a HOLLOW verb and a lock never end each other. The sleeper's offer has no timer: no bar, no clock.
// Slice 8 POLISH (04 §3.15, OD 20): the boot's RECEIVER CLOSED line (the 'resident' tone) is a receiver bypass. It shows
// whole as it starts, its letters rolling, and they lock left to right (systems/receiver-bypass.ts) over BYPASS_RESOLVE_SEC
// of its own typing time; the line keeps the queue as long as it always did (its length at TERMINAL_TYPE_CPS), so every line
// after it types when it always did. A click on the lines, the boot's end or reduced motion shows it resolved.

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
// Slice 5: whose countdown it is (HOLLOW's verb, or a resident's lock).
type VerbSource = 'hollow' | 'resident';

interface VerbRow {
  source: VerbSource;
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
  // The telegraphs still counting, one per source (each the newest of its kind; an older one is over).
  const verbRows = new Map<VerbSource, VerbRow>();
  let lastId = 0;

  // A verb's line stops counting: greyed where it stands, its bar gone.
  function endVerbRow(source: VerbSource): void {
    const row = verbRows.get(source);
    if (row === undefined) return;
    row.row.classList.add('verb-over');
    row.row.classList.remove('verb-live', 'verb-urgent');
    row.timer.remove();
    verbRows.delete(source);
  }

  // What a source's countdown reads now: its text, its share left (0..1) and its whole second; null once it has ended. A
  // lock is the one its row was said for (its entryId): a lock telegraphed after it starts its own row.
  function liveCount(row: Readonly<VerbRow>, state: Readonly<GameState>): { text: string; share: number; second: number } | null {
    if (row.source === 'resident') {
      const lock = state.resident.corrupted?.lock ?? null;
      const aim = lockAimView(state);
      const text = liveVerbText(state, 'resident');
      if (lock === null || aim === null || text === null || lock.entryId !== row.entryId) return null;
      return { text, share: aim.progress, second: aim.second };
    }
    const verb = state.hollow.verb;
    const text = liveVerbText(state);
    if (verb === null || text === null) return null;
    // Drained from the countdown this verb started with (the ship's first one is longer: tuning.ts).
    return { text, share: verb.leftSec / verb.totalSec, second: verbSecondsLeft(verb) };
  }

  // Per tick: each live countdown's number and bar, or its end.
  function paintVerbRows(): void {
    const state = store.getState();
    for (const row of [...verbRows.values()]) {
      const live = liveCount(row, state);
      if (live === null) { endVerbRow(row.source); continue; }
      row.fill.style.width = `${Math.max(0, Math.min(100, 100 * live.share))}%`;
      if (!row.typed) continue;
      if (row.text.textContent !== live.text) row.text.textContent = live.text;
      if (row.second !== null && live.second < row.second) replayAnimation(row.row, 'verb-tick');
      row.second = live.second;
      row.row.classList.toggle('verb-urgent', live.second <= 1);
    }
  }

  const scrollToEnd = (): void => { linesEl.scrollTop = linesEl.scrollHeight; };

  // The clock beside the buttons and the bar under the line, from leftAiSec (mutated per AI tick: painted per tick).
  function paintClock(view: ChoiceView, entry: LogEntry): void {
    const choice = entry.choice;
    if (!choice?.open) return;
    const left = choiceSecondsLeft(choice);
    // Slice 5 (plan R23): a choice with no timer (the sleeper's offer) has no clock and no bar (paintChoice hides both).
    if (choice.timeoutAiSec === null) return;
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
    const timed = choiceHasTimer(choice);
    view.timer.hidden = !timed || !choice.open || !view.shown;
    view.clock.hidden = !timed || !choice.open;
    view.row.classList.toggle('untimed', !timed);
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
    const voice = terminalVoice(entry.speaker);
    row.className = `term-line ${voice.className}${entry.tone ? ` tone-${entry.tone}` : ''}`;
    row.hidden = true;
    const text = document.createElement('span');
    text.className = 'term-text';
    row.appendChild(text);
    const view = choiceView(entry, row);
    if (view) choices.set(entry.id, view);
    // A verb's telegraph: the newest one of its source counts, any older one is over (one verb, one lock at a time).
    let verb: VerbRow | null = null;
    if (entry.verbCountdown) {
      const source: VerbSource = entry.speaker === 'resident' ? 'resident' : 'hollow';
      endVerbRow(source);
      // It jumps the queue: whatever is still waiting to type shows at once, so its seconds start now
      // (VERB_TELEGRAPH_TYPE_CPS).
      queue.finishAll();
      row.classList.add('verb-countdown', 'verb-live');
      const timer = document.createElement('span');
      timer.className = 'term-timer verb-timer';
      const fill = document.createElement('span');
      timer.appendChild(fill);
      row.appendChild(timer);
      verb = { source, entryId: entry.id, row, text, timer, fill, typed: false, second: null };
      verbRows.set(source, verb);
    }
    linesEl.appendChild(row);
    while (linesEl.childElementCount > LOG_VIEW_KEEP_ROWS) linesEl.firstElementChild?.remove();

    const hollow = entry.speaker === 'hollow' || entry.speaker === 'hollow-cmd';
    // 3b: the sleep line's year roll (wall time from the moment it starts typing).
    const roll = entry.speaker === 'mind-sys' && !store.getState().ui.reducedMotion ? sleepLineYears(entry.text) : null;
    let rollFromMs: number | null = null;
    let rollTick = -1;
    const rolledText = (): string => {
      if (roll === null || rollFromMs === null) return entry.text;
      const share = Math.min(1, (performance.now() - rollFromMs) / SLEEP_YEAR_ROLL_MS);
      const year = Math.round(roll.arrive + (roll.approach - roll.arrive) * share);
      const tick = Math.floor((year - roll.arrive) / SLEEP_YEAR_TICK_YEARS);
      if (share < 1 && tick !== rollTick) { rollTick = tick; play('typeTick', { voice: 'strip' }); }
      const digits = String(roll.approach).length;
      return entry.text.slice(0, roll.at) + String(year).padStart(digits, '0') + entry.text.slice(roll.at + digits);
    };
    const rollOn = (): void => {
      if (roll === null || rollFromMs === null || !row.isConnected) return;
      text.textContent = rolledText();
      if (performance.now() - rollFromMs < SLEEP_YEAR_ROLL_MS) requestAnimationFrame(rollOn);
    };
    const reveal = (): void => {
      row.hidden = false;
      scrollToEnd();
    };
    const cps = verb !== null ? VERB_TELEGRAPH_TYPE_CPS : lineTypeCps(entry.speaker);
    // Slice 8: the receiver bypass's mask and the second its last letter locks (null: an ordinary line).
    const bypass = isBypassLine(entry) ? { mask: bypassMask(entry.text, entry.id), resolvedSec: 0 } : null;
    if (bypass !== null) {
      bypass.resolvedSec = bypassResolvedSec(entry.text, bypass.mask);
      row.classList.add('bypass');
    }
    // The bypass as drawn after `count` units of its typing time: rolling, or resolved (done, reduced motion, the boot over).
    const paintBypass = (count: number, done: boolean): void => {
      if (bypass === null) return;
      const state = store.getState();
      const elapsedSec = count / cps;
      const resolved = done || state.ui.reducedMotion || state.run.phase !== 'boot' || elapsedSec >= bypass.resolvedSec;
      if (resolved) {
        if (text.childElementCount > 0 || text.textContent !== entry.text) text.textContent = entry.text;
      } else {
        // A rolling run in its own dimmer span, a locked one as plain text.
        text.replaceChildren(...bypassParts(entry.text, elapsedSec, bypass.mask, entry.id).map((part) => {
          if (!part.rolling) return document.createTextNode(part.text);
          const span = document.createElement('span');
          span.className = 'bp-roll';
          span.textContent = part.text;
          return span;
        }));
      }
      if (resolved && row.classList.contains('bypass-rolling')) replayAnimation(row, 'bypass-locked');
      row.classList.toggle('bypass-rolling', !resolved);
    };
    queue.push({
      length: entry.text.length,
      cps,
      onStart: () => {
        if (roll !== null) rollFromMs = performance.now();
        reveal();
      },
      onUnit: (index) => {
        if (entry.text[index] === ' ') return;
        // Slice 5: a resident's and the sleeper's own voices (04 §4).
        if (voice.sound === 'residentBlip') play('residentBlip');
        else if (voice.sound === 'sleeperVoice') play('sleeperVoice');
        else play('typeTick', { voice: hollow ? 'hollow' : 'sys' });
      },
      paint: (count, done) => {
        if (row.hidden) reveal();
        // A live verb types its number as it is now (the same length: one digit), then counts on per tick.
        const live = verb !== null && verbRows.get(verb.source) === verb ? liveCount(verb, store.getState())?.text ?? null : null;
        if (bypass !== null) paintBypass(count, done);
        else text.textContent = (live ?? rolledText()).slice(0, count);
        // Typed before its roll is over: the year rolls on in place to its end.
        if (done && rollFromMs !== null) requestAnimationFrame(rollOn);
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
      verbRows.clear();
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
    paintVerbRows();
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
