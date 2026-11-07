import type { Store } from '@state/store';
import type { GameState, ObjectiveLine, LogEntry, ViewMode } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { getPrediction, getSensedPrediction } from '@systems/predict';
import { splitKeyCaps, upcomingEvents, choiceTicker, liveVerbText, type TextPart } from '@systems/flight-hud';
import { tickerEntry, screenOfChannel, receivedText } from '@systems/say';
import { amberBite } from '@systems/hollow-hud';
import { setMode } from '@systems/mode';
import { sameObjectiveStructure, screenOfLayer } from '@systems/director';
import { play } from '@systems/audio';
import { requireById, replayAnimation, paintHintTargets } from '@components/dom';
import { renderParts, type CapOptions } from './keycaps';
import { createTypeQueue, partsLength, revealParts, unitChar } from './typewriter';
import { lineVars, speakerTag } from '@data/script';
import {
  STRIP_TYPE_CPS, STRIP_TYPE_CPS_NOW, STRIP_TICK_EVERY_CHARS, STRIP_CARET_LINGER_SEC,
  HOLLOW_ANNOUNCE_BLIPS, HOLLOW_ANNOUNCE_GAP_SEC,
} from '@data/tuning';

// The objective strip (§7.1): one 28 px row under the header (two lines on a phone: game.css), visible in both modes.
// • Left: the one line that says what to do next. The director (systems/director.ts) composes
//   it (alarms, the flight objective, mind rules, tutorials, hints, PAUSED) and stores it in
//   director.shown; the hysteresis lives there too. A NEW line types itself on with a caret, a
//   layer glyph (◆ SHIP, ◇ MIND) and key caps; the same line with new numbers (a countdown
//   ticking) is patched in place, never retyped. Urgent lines type fastest. New numbers reach
//   the store without a fan-out (director.ts, objectiveStructure), so they are painted per tick.
// • The control the line names glows: `hint-pulse` on every [data-hint-key] element whose key
//   is in the line's keys, and on the [data-hint-target] it highlights.
// • Right: the ticker, the newest unread line of the screen the kid is NOT looking at (§6.3),
//   in that screen's colour; a click on it switches screens. With nothing on the ticker, the
//   next upcoming events (`▲ 05:30 ▸▸`). In amber, HOLLOW's next bite (`BITE 0:12`, WP7) shows beside
//   either while it has something to bite. A TERMINAL choice still standing (THE DEAL, WP10) holds the
//   ticker with its own words and clock, `UNIT-046: WANTS A DEAL · [TAB] 0:12`, urgent in its last seconds.

const LAYER_GLYPH = { ship: '◆', mind: '◇' } as const;
// On a phone a [TAB] cap names the screen the line's controls are on, as the screen button labels it (WP12).
const LAYER_SCREEN_NAME = { ship: 'SHIP', mind: 'MIND' } as const;

export function mountObjectiveStrip(store: Store<GameState>): () => void {
  const root = requireById('objective');
  const glyphEl = requireById('objectiveGlyph');
  const textEl = requireById('objectiveText');
  const caretEl = requireById('objectiveCaret');
  const tickerEl = requireById<HTMLButtonElement>('objectiveTicker');
  const tickerGlyph = requireById('tickerGlyph');
  const tickerTag = requireById('tickerTag');
  const tickerText = requireById('tickerText');
  const upcomingEl = requireById('objectiveUpcoming');
  const biteEl = requireById('objectiveBite');

  // --- The typed line ---
  const queue = createTypeQueue(() => true);
  let shownId: string | null = null;
  let shownText = '';
  let parts: TextPart[] = [];
  let revealed = 0;
  // How the line's caps read on a phone (keycaps.ts): [TAB] is its screen; during the boot SPACE skips (no burn), so
  // `click or [SPACE] to skip` reads `click to skip` there.
  let capOptions: CapOptions = {};
  const capOptionsFor = (line: ObjectiveLine): CapOptions => (store.getState().run.phase === 'boot'
    ? { tab: LAYER_SCREEN_NAME[line.layer], own: 'SPACE' }
    : { tab: LAYER_SCREEN_NAME[line.layer] });
  let caretTimer: ReturnType<typeof setTimeout> | null = null;

  const setCaret = (typing: boolean): void => {
    if (caretTimer !== null) { clearTimeout(caretTimer); caretTimer = null; }
    caretEl.hidden = false;
    caretEl.classList.toggle('typing', typing);
    // Cosmetic, wall clock: the caret lingers a moment after the line is complete.
    if (!typing) caretTimer = setTimeout(() => { caretEl.hidden = true; caretTimer = null; }, STRIP_CARET_LINGER_SEC * 1000);
  };

  function typeLine(line: ObjectiveLine): void {
    queue.clear();
    parts = splitKeyCaps(line.text);
    capOptions = capOptionsFor(line);
    revealed = 0;
    renderParts(textEl, []);
    setCaret(true);
    queue.push({
      // Read live: the line can grow or shrink while it types (a SKIP hint appearing, 9:59 →
      // 10:00), and a length fixed at push would end it cut short.
      get length() { return partsLength(parts); },
      cps: line.urgency === 'now' ? STRIP_TYPE_CPS_NOW : STRIP_TYPE_CPS,
      onUnit: (index) => {
        if (index % STRIP_TICK_EVERY_CHARS === 0 && unitChar(parts, index) !== ' ') play('typeTick', { voice: 'strip' });
      },
      paint: (count, done) => {
        revealed = count;
        renderParts(textEl, revealParts(parts, count), capOptions);
        if (done) setCaret(false);
      },
    });
  }

  function paintLine(line: ObjectiveLine | null): void {
    root.dataset.urgency = line?.urgency ?? 'wait';
    root.dataset.layer = line?.layer ?? 'ship';
    // A countdown in its last seconds (the debris dodge's): the warning colour, on the same line (nothing retypes).
    root.dataset.warn = line?.warn === true ? 'true' : 'false';
    glyphEl.textContent = line ? LAYER_GLYPH[line.layer] : '';
    // A line for the other screen (hold [SPACE] while in blue) also lights the TAB toggle: the
    // way to the control it names.
    const lineScreen: ViewMode | null = line ? screenOfLayer(line.layer) : null;
    const elsewhere = lineScreen !== null && lineScreen !== store.getState().ui.mode && (line?.keys.length ?? 0) > 0;
    const keys = elsewhere && line ? [...line.keys, 'TAB'] : line?.keys ?? [];
    document.querySelectorAll<HTMLElement>('[data-hint-key]').forEach((control) => {
      control.classList.toggle('hint-pulse', keys.includes(control.dataset.hintKey ?? ''));
    });
    paintHintTargets(document, line?.highlight ?? null);

    if (!line) {
      queue.clear();
      shownId = null;
      shownText = '';
      parts = [];
      renderParts(textEl, []);
      caretEl.hidden = true;
      return;
    }
    if (line.id !== shownId) {
      shownId = line.id;
      shownText = line.text;
      typeLine(line);
      return;
    }
    patchText(line.text);
  }

  // Same instruction, new words or numbers: patch in place (mid-type, keep typing the new text).
  function patchText(text: string): void {
    if (text === shownText) return;
    shownText = text;
    parts = splitKeyCaps(text);
    if (queue.busy()) renderParts(textEl, revealParts(parts, revealed), capOptions);
    else renderParts(textEl, parts, capOptions);
  }

  paintLine(store.getState().director.shown);
  const unsubLine = store.subscribe((s) => s.director.shown, paintLine, sameObjectiveStructure);
  // The TAB glow depends on the screen too (same line: nothing is retyped).
  const unsubMode = store.subscribe((s) => s.ui.mode, () => paintLine(store.getState().director.shown));

  // --- The ticker and the upcoming events (they change with the AI clock and the countdowns,
  //     so they are painted per tick, patching only what changed) ---
  let tickerId: number | null = null;
  let tickerChoiceKey = '';
  let lastUpcoming = '';
  let lastBite = '';

  function announce(entry: LogEntry): void {
    // A short "you have a message" from the other screen: CONTROL's chime, HOLLOW's blips.
    if (entry.speaker === 'control') play('typeTick', { voice: 'control' });
    else if (entry.speaker === 'hollow' || entry.speaker === 'hollow-cmd') {
      for (let i = 0; i < HOLLOW_ANNOUNCE_BLIPS; i++) play('typeTick', { voice: 'hollow' }, { delaySec: i * HOLLOW_ANNOUNCE_GAP_SEC });
    } else play('typeTick', { voice: 'sys' });
  }

  function paintTicker(): void {
    const state = store.getState();
    const entry = state.run.phase === 'title' ? null : tickerEntry(state);
    const id = entry?.id ?? null;
    if (id !== tickerId) {
      tickerId = id;
      tickerEl.hidden = entry === null;
      if (entry) {
        const fromShip = entry.channel === 'radio';
        tickerEl.dataset.from = fromShip ? 'ship' : 'mind';
        tickerEl.dataset.speaker = entry.speaker;
        tickerGlyph.textContent = fromShip ? LAYER_GLYPH.ship : LAYER_GLYPH.mind;
        tickerTag.textContent = `${speakerTag(entry.speaker, lineVars(state, getPrediction()))}:`;
        tickerText.textContent = receivedText(entry);
        tickerChoiceKey = '';
        tickerEl.title = fromShip ? 'Switch to the SHIP screen to read it [TAB]' : 'Switch to the MIND screen to read it [TAB]';
        // Restart the slide-in for every new line.
        replayAnimation(tickerEl, 'fresh');
        announce(entry);
      }
    }
    // A standing choice: its words and its clock, patched as the seconds go (the line itself is in the TERMINAL). A verb's
    // telegraph counts down here as it does in the TERMINAL (WP11 review).
    const choice = entry ? choiceTicker(state, entry) : null;
    const counting = entry?.verbCountdown === true ? liveVerbText(state, entry.speaker) : null;
    const choiceKey = choice ? `${choice.text}|${choice.urgent}` : counting !== null ? `verb|${counting}` : '';
    if (choiceKey !== tickerChoiceKey) {
      tickerChoiceKey = choiceKey;
      if (choice) renderParts(tickerText, splitKeyCaps(choice.text));
      else if (counting !== null) tickerText.textContent = counting;
      else if (entry) tickerText.textContent = receivedText(entry);
      tickerEl.classList.toggle('choice', choice !== null);
      tickerEl.classList.toggle('urgent', choice?.urgent === true);
    }
    const upcoming = entry ? '' : upcomingEvents(state, getSensedPrediction());
    if (upcoming !== lastUpcoming) {
      lastUpcoming = upcoming;
      upcomingEl.textContent = upcoming;
    }
    // HOLLOW's next bite while the kid flies (WP7): in blue every hollow block counts it down already. It
    // stays beside the ticker too: HOLLOW's own lines fill the ticker just when its bites matter.
    const live = state.run.phase === 'flight' || state.run.phase === 'landing';
    const bite = live && state.ui.mode === 'tools' ? amberBite(state) : null;
    const biteKey = bite ? `${bite.text}|${bite.urgent}` : '';
    if (biteKey !== lastBite) {
      lastBite = biteKey;
      biteEl.hidden = bite === null;
      biteEl.textContent = bite?.text ?? '';
      biteEl.classList.toggle('urgent', bite?.urgent === true);
    }
  }

  const onTickerClick = (): void => {
    if (tickerId === null) return;
    const entry = store.getState().log.entries.find((candidate) => candidate.id === tickerId);
    if (entry) setMode(store, screenOfChannel(entry.channel));
  };
  tickerEl.addEventListener('click', onTickerClick);
  // The countdown in the shown line: the director mutated it this tick (it runs first).
  function paintNumbers(): void {
    const line = store.getState().director.shown;
    if (line && line.id === shownId) patchText(line.text);
  }

  paintTicker();
  const offTick = onPostTick(() => { paintNumbers(); paintTicker(); });

  return () => {
    unsubLine();
    unsubMode();
    offTick();
    tickerEl.removeEventListener('click', onTickerClick);
    queue.clear();
    if (caretTimer !== null) clearTimeout(caretTimer);
  };
}
