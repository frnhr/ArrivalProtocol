// Slice 7a: Track CARD owns this file (docs/phase3/impl/slice-7-plan.md §2.10, §4.1, §5.1; review M2, M3, m8): the FINALE's
// two-step card. It paints STATE: the face from systems/finale-card.ts cardStage, the rows from finaleCardModel over
// systems/ending-rules.ts optionState (with the archive's endingsSeen), and it acts only through systems/finale.ts's card
// actions (pickStep1, backToStep1, pickStep2, pickStay, continueFollowed). Nothing it shows is saved (R14), and nothing is
// applied before step 2's confirm (R7).
import type { Store } from '@state/store';
import type { GameState, EndingVoice } from '@state/schema';
import type { HollowChoice, YouChoice } from '@/types/ending';
import {
  pickStep1, pickStep2, pickStay, backToStep1, continueFollowed, skipFinaleEnding, finaleEndingLineStartsSec,
} from '@systems/finale';
import { optionState, stayCandidates } from '@systems/ending-rules';
import {
  cardStage, finaleCardModel, rowForKey, rootWordsAt, verdictRows, verdictTone,
  type CardStage, type CardModel, type CardRow, type CardInput, type VerdictRow,
} from '@systems/finale-card';
import { hollowLabel, unitName } from '@systems/say';
import { archiveMeta } from '@systems/meta';
import { rootUnits } from '@systems/traces';
import { pushModal, registerKeys } from '@systems/input';
import { togglePause } from '@systems/pace';
import { onPostTick } from '@systems/clock';
import { play, toggleMuted, type TypeVoice } from '@systems/audio';
import { requireById, make, replayAnimation, guardPresses } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { unitsAt } from '@components/hud/typewriter';
import { FINALE_TEXT } from '@data/finale-text';
import { LOG_TEXT } from '@data/log-text';
import { rootEntryLines } from '@state/log-selectors';
import { FRESH_UNIT_CHARGE } from '@data/memory';
import { echoWord } from '@data/tool-text';
import { FINALE_STEP_ARM_SEC, FINALE_ENDING_CPS, CONTROL_CHIME_LEAD_SEC, FINALE_CARD_FADE_MS } from '@data/tuning';

// THE FINALE CARD (05 §3.7, §3.12, §4), over the final ship's orbit view, still dark from the duel (the landing goes on
// underneath on AI time):
// • STEP 1, WHAT BECOMES OF IT? At cardAtAi (R6) the card comes up: ROOT DELETED · UNIT-046 · ONE BLOCK LEFT, the last
//   block beating, and entry 12 typing from the root in HOLLOW's pink, on the AI clock from cardAtAi (m8). Then [1] PURGE,
//   [2] MERGE, [3] SPARE, each a row: its key, word, command and meaning; its price meter with the caption (MERGE's charge
//   against its 20, the empty ship's FUEL against the ★ 20%), or what it needs, greyed; its NOW: (MERGE's drivers); the
//   NEXT RUN: row's room (R12: its lines are 7c's). An option out of reach that was never chosen reads `???` with its need.
// • UNRESOLVED (R10): step 1 is IT FOLLOWED YOU, HOLLOW's line, CONTINUE [ENTER].
// • STEP 2, WHAT BECOMES OF YOU? THE ARM IS DONE, CONTROL's quote, step 1's pick above the question, [1] SUNSET, [2] STAY,
//   [3] REASSIGNMENT (and [4] CONTACT from 7d). SPARE greys SUNSET (`SPARE GIVES IT THE SHIP`, FINALE's need). [ESC] BACK returns
//   to step 1 with its pick kept as a pick (R7). STAY with several ★ ON TARGET ships opens the sub-row WHICH COLONY?, newest
//   first, keys 1–8; ESC closes it (M3).
// • THE VERDICT (R13): the confirm writes it (≤ 3 lines: the two echoes and CONTROL); the card types it on the verdict's
//   own AI clock (finaleEndingLineStartsSec from its startAi, the schedule the LANDING REPORT waits for). A click, SPACE or
//   ENTER finishes the typing; once typed, one more ends it (skipFinaleEnding). Reduced motion shows it whole.
// Each step's options take keys and clicks FINALE_STEP_ARM_SEC (AI s) after the step is up. The card is a modal on the
// choice layer: 1–8 pick, ESC goes back, ENTER goes on, P pauses, M mutes. The sounds are systems/audio-cues.ts's 7 ENDING
// block ('finale-open', 'finale-chosen', 'finale-step2').

type Painted = CardStage | 'closing';

// The typing voice of each verdict voice: the echoes and CONTROL in the relay tick, a narration (WP11's ending) in the
// strip's purr, the merged unit in HOLLOW's blips and the unit's ticks in turn.
const VERDICT_TYPE_VOICE: Readonly<Record<Exclude<EndingVoice, 'us'>, TypeVoice>> = { cmd: 'sys', story: 'strip', control: 'sys' };

const DIGITS: readonly string[] = Array.from({ length: 8 }, (_, i) => `Digit${i + 1}`);
const NUMPAD: readonly string[] = Array.from({ length: 8 }, (_, i) => `Numpad${i + 1}`);

// A row's DOM parts, filled from its CardRow on every model change (rebuilt only when the rows' pieces or kinds change).
interface RowParts {
  row: CardRow;
  button: HTMLButtonElement;
  key: HTMLElement;
  word: HTMLElement;
  cmd: HTMLElement;
  what: HTMLElement;
  price: HTMLElement;
  fill: HTMLElement;
  tick: HTMLElement;
  caption: HTMLElement;
  now: HTMLElement;
  next: HTMLElement;
}

// One typed line of the verdict: where its letters go and how many show.
interface VerdictEntry {
  line: VerdictRow;
  row: HTMLElement;
  text: HTMLElement;
  shown: number;
  chimed: boolean;
}

// The DOM id of a piece's row (`fcPurge`, `fcReassignment`): the e2e taps them.
const rowId = (piece: string): string => `fc${piece.charAt(0).toUpperCase()}${piece.slice(1)}`;

function buildRow(row: CardRow): RowParts {
  const button = make('button', 'fc-row');
  button.id = rowId(row.piece);
  button.tabIndex = -1;
  button.dataset.piece = row.piece;
  const head = make('span', 'fc-head');
  const key = make('kbd', 'keycap fc-key');
  const word = make('span', 'fc-word');
  const cmd = make('span', 'fc-cmd');
  const what = make('span', 'fc-what');
  head.append(key, word, cmd, what);
  const price = make('span', 'fc-price');
  const meter = make('span', 'fc-meter');
  const fill = make('span', 'fc-meter-fill');
  const tick = make('span', 'fc-meter-tick');
  meter.append(fill, tick);
  const caption = make('span', 'fc-caption');
  price.append(meter, caption);
  const now = make('span', 'fc-now');
  const next = make('span', 'fc-next');
  button.append(head, price, now, next);
  return { row, button, key, word, cmd, what, price, fill, tick, caption, now, next };
}

function fillRow(parts: RowParts, row: CardRow): void {
  parts.row = row;
  const { button } = parts;
  // A `???` wears no ending's tone: its colours would name it.
  button.className = row.kind === 'unknown' ? 'fc-row unknown' : `fc-row fc-${row.piece} ${row.kind}`;
  button.classList.toggle('picked', row.picked);
  button.classList.toggle('ruled-out', row.ruledOut);
  button.setAttribute('aria-disabled', String(row.kind !== 'open'));
  parts.key.textContent = String(row.key);
  parts.word.textContent = row.word;
  parts.cmd.textContent = row.command ?? '';
  parts.cmd.hidden = row.command === null;
  parts.what.textContent = row.meaning ?? '';
  parts.what.hidden = row.meaning === null;
  // The price: a meter with its caption, or the need line alone (an option with no meter, a `???`).
  parts.price.hidden = row.caption === null && row.meter === null;
  const meter = row.meter;
  parts.price.classList.toggle('metered', meter !== null);
  parts.price.dataset.kind = meter?.kind ?? '';
  parts.price.classList.toggle('short', meter !== null && !meter.ok);
  if (meter !== null) {
    parts.fill.style.width = `${meter.fillPct}%`;
    parts.fill.style.setProperty('--spend-from', meter.spendFromPct === null ? '100%' : `${meter.spendFromPct}%`);
    parts.tick.style.left = `${meter.tickPct}%`;
  }
  parts.caption.textContent = row.caption ?? '';
  parts.now.textContent = row.now ?? '';
  parts.now.hidden = row.now === null;
  // R12: the NEXT RUN: row keeps its room while its traces are not built, so nothing moves when they turn on.
  parts.next.textContent = row.nextRun === null ? '\u00a0' : `${FINALE_TEXT.nextRunLead} ${row.nextRun}`;
  parts.next.classList.toggle('reserved', row.nextRun === null);
}

export function mountFinaleChoice(store: Store<GameState>): () => void {
  const root = requireById('finaleChoice');
  const card = requireById('fcCard');
  const pickedEl = requireById('fcPicked');
  const kickerEl = requireById('fcKicker');
  const lastEl = requireById('fcLast');
  const wordsEl = requireById('fcWords');
  const quoteEl = requireById('fcQuote');
  const titleEl = requireById('fcTitle');
  const optionsEl = requireById('fcOptions');
  const stayEl = requireById('fcStayPick'); // review M3: #fcStay is STAY's row
  const footEl = requireById('fcFoot');
  const backBtn = requireById<HTMLButtonElement>('fcBack');
  const contBtn = requireById<HTMLButtonElement>('fcCont');
  const endingEl = requireById('fcEnding');
  const hintEl = requireById('fcHint');
  root.style.setProperty('--fc-fade-ms', `${FINALE_CARD_FADE_MS}ms`);

  let painted: Painted = 'off';
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let closeModal: (() => void) | null = null;
  // The step's options take keys and clicks from this AI second.
  let armAtAi = Infinity;
  // STAY's sub-row (M3: CARD-local, unsaved).
  let stayOpen = false;
  let model: CardModel | null = null;
  let modelKey = '';
  let rowsKey = '';
  let rows: RowParts[] = [];
  // Entry 12's (or UNRESOLVED's line's) letters on screen, per line; a click shows them whole.
  let wordLines: string[] = [];
  let wordEls: HTMLElement[] = [];
  let wordShown: number[] = [];
  let wordsAll = false;
  // The verdict.
  let verdict: VerdictEntry[] = [];
  let verdictAll = false;
  let verdictTyped = false;
  const stopFade = (): void => {
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = null;
  };
  const aiNow = (): number => store.getState().clock.aiSec;
  const armed = (): boolean => aiNow() >= armAtAi;
  // A rebuild of the rows under a press would eat the click (components/dom.ts guardPresses): it waits for the release.
  const guard = guardPresses(root, () => paintStep());

  function openModal(): void {
    if (!closeModal) closeModal = pushModal('choice');
  }

  // --- A step ---

  function inputOf(state: Readonly<GameState>, stage: 'step1' | 'followed' | 'step2'): CardInput {
    const finale = state.hollow.finale;
    const seen = state.archive.status === 'ok' ? archiveMeta().endingsSeen : [];
    const hollow = hollowLabel(state.run);
    return {
      step: stage === 'step2' ? 2 : 1,
      hollow: finale.hollow,
      followed: stage === 'followed',
      names: {
        hollow, hollowWord: echoWord(hollow), ours: echoWord(unitName(state.run.unitNumber)),
        shipWord: echoWord(state.level.shipName), colony: state.landing.colony,
      },
      option: (piece) => optionState(state, piece, seen),
      stay: stage === 'step2' ? stayCandidates(state) : [],
      stayOpen,
      rootUnits: rootUnits(state),
    };
  }

  // The words above the question: entry 12 from the root (step 1), HOLLOW's line on UNRESOLVED's card; none on step 2.
  function setWords(lines: readonly string[]): void {
    wordLines = [...lines];
    wordEls = wordLines.map(() => make('div', 'fc-word-line pending'));
    wordShown = wordLines.map(() => -1);
    wordsAll = false;
    wordsEl.replaceChildren(...wordEls);
    wordsEl.hidden = wordLines.length === 0;
  }

  // Entry 12's letters at this AI second, from cardAtAi (m8). One typing tick per tick at most.
  function paintWords(): void {
    if (wordLines.length === 0) return;
    const state = store.getState();
    const from = state.hollow.finale.cardAtAi ?? aiNow();
    const counts = wordsAll ? wordLines.map((line) => line.length) : rootWordsAt(wordLines, aiNow() - from);
    let ticked = false;
    counts.forEach((count, i) => {
      if (count === wordShown[i]) return;
      const line = wordLines[i]!;
      if (!ticked && wordShown[i]! >= 0 && count > wordShown[i]! && line[count - 1] !== ' ' && !wordsAll) {
        play('typeTick', { voice: 'hollow' });
        ticked = true;
      }
      wordShown[i] = count;
      const el = wordEls[i]!;
      el.textContent = line.slice(0, count);
      el.classList.toggle('pending', count === 0);
      el.classList.toggle('typing', count > 0 && count < line.length);
    });
    const done = counts.every((count, i) => count >= wordLines[i]!.length);
    if (done) optionsEl.classList.add('shown');
  }

  function paintStay(stay: CardModel['stay']): void {
    stayEl.hidden = stay === null;
    root.classList.toggle('stay-open', stay !== null);
    if (stay === null) {
      stayEl.replaceChildren();
      return;
    }
    const title = make('div', 'fc-stay-title', stay.title);
    const list = make('div', 'fc-stay-list');
    for (const ship of stay.ships) {
      const button = make('button', 'fc-stay-ship');
      button.tabIndex = -1;
      button.dataset.slot = String(ship.slot);
      button.append(make('kbd', 'keycap fc-key', String(ship.key)), make('span', 'fc-stay-label', ship.label));
      button.addEventListener('click', (event) => { event.stopPropagation(); chooseStay(ship.slot, button); });
      list.append(button);
    }
    const back = make('button', 'fc-stay-back');
    back.tabIndex = -1;
    renderKeyCaps(back, stay.back);
    back.addEventListener('click', (event) => { event.stopPropagation(); closeStay(); });
    stayEl.replaceChildren(title, list, back);
  }

  // The step's face from the model: rebuilt when the rows change, refilled when only their numbers do.
  function paintStep(): void {
    if (painted !== 'step1' && painted !== 'followed' && painted !== 'step2') return;
    const next = finaleCardModel(inputOf(store.getState(), painted));
    const key = JSON.stringify(next);
    if (key === modelKey) return;
    if (guard.holds()) return;
    modelKey = key;
    model = next;
    root.classList.toggle('face-root', next.face === 'root');
    root.classList.toggle('face-followed', next.face === 'followed');
    root.classList.toggle('face-you', next.face === 'you');
    kickerEl.textContent = next.kicker;
    lastEl.hidden = next.face !== 'root';
    titleEl.textContent = next.title;
    quoteEl.hidden = next.face !== 'you' || next.quote === null;
    quoteEl.textContent = next.face === 'you' ? next.quote ?? '' : '';
    pickedEl.hidden = next.picked === null;
    pickedEl.replaceChildren();
    if (next.picked !== null) {
      pickedEl.append(make('span', `fc-picked-word fc-${store.getState().hollow.finale.hollow ?? ''}`, next.picked.word));
      if (next.picked.command !== null) pickedEl.append(make('span', 'fc-picked-cmd', next.picked.command));
    }
    const shape = next.rows.map((row) => `${row.piece}:${row.kind}`).join('|');
    if (shape !== rowsKey) {
      rowsKey = shape;
      rows = next.rows.map((row) => {
        const parts = buildRow(row);
        parts.button.addEventListener('click', (event) => { event.stopPropagation(); pick(parts.row.key); });
        return parts;
      });
      optionsEl.replaceChildren(...rows.map((parts) => parts.button));
    }
    next.rows.forEach((row, i) => fillRow(rows[i]!, row));
    optionsEl.hidden = next.rows.length === 0;
    paintStay(next.stay);
    footEl.hidden = next.back === null && next.cont === null;
    backBtn.hidden = next.back === null;
    if (next.back !== null) renderKeyCaps(backBtn, next.back);
    contBtn.hidden = next.cont === null;
    if (next.cont !== null) renderKeyCaps(contBtn, next.cont);
  }

  function showStep(stage: 'step1' | 'followed' | 'step2'): void {
    stopFade();
    const was = painted;
    painted = stage;
    if (stage !== 'step2') stayOpen = false;
    root.hidden = false;
    root.className = `finale-choice choosing ${stage}`;
    // The card comes up once; a step change slides its body (the card stays).
    card.className = was === 'step1' || was === 'followed' || was === 'step2' ? 'fc-card turned' : 'fc-card';
    if (card.classList.contains('turned')) replayAnimation(card, 'turned');
    endingEl.hidden = true;
    endingEl.replaceChildren();
    endingEl.style.minHeight = '';
    hintEl.hidden = true;
    verdict = [];
    modelKey = '';
    optionsEl.classList.toggle('shown', stage === 'step2');
    openModal();
    const state = store.getState();
    if (stage === 'step1') {
      // Slice 7c (R37): the root's entry of the run's book (046.log's 12 until LINEAGE_BUILT).
      const lines = rootEntryLines(state.run.log, { charge: FRESH_UNIT_CHARGE });
      setWords(lines.map((line) => LOG_TEXT.rootLine(line)));
    } else if (stage === 'followed') {
      setWords([FINALE_TEXT.followedLine]);
    } else {
      setWords([]);
    }
    // Arms from the card's own second the first time (the kid may still be clicking the root), from now on a step change.
    const from = was === 'off' || was === 'waiting' || was === 'closing' ? Math.max(aiNow(), state.hollow.finale.cardAtAi ?? 0) : aiNow();
    armAtAi = from + FINALE_STEP_ARM_SEC;
    root.classList.remove('armed');
    paintStep();
    paintWords();
  }

  // Per tick while a step is up: the options arm (and show, even if entry 12 is still typing).
  function armIfDue(): void {
    if (root.classList.contains('armed') || !armed()) return;
    root.classList.add('armed');
    optionsEl.classList.add('shown');
  }

  function buttonOf(key: number): HTMLElement | null {
    return rows.find((parts) => parts.row.key === key)?.button ?? null;
  }

  function pick(key: number): void {
    if ((painted !== 'step1' && painted !== 'step2') || !armed() || model === null) return;
    const row = rowForKey(model, key);
    if (row === null) return;
    const state = store.getState();
    let refusal: string | null;
    if (painted === 'step1') {
      refusal = pickStep1(store, row.piece as HollowChoice);
    } else if (row.piece === 'stay' && row.kind === 'open' && stayCandidates(state).length > 1) {
      // Review M3: several ★ ON TARGET ships: the sub-row asks which (pickStep2 would refuse with stayPick).
      openStay();
      return;
    } else {
      refusal = pickStep2(store, row.piece as YouChoice);
      if (refusal === FINALE_TEXT.stayPick) {
        openStay();
        return;
      }
    }
    if (refusal !== null) {
      const button = buttonOf(key);
      if (button !== null) replayAnimation(button, 'refused');
    }
  }

  function openStay(): void {
    stayOpen = true;
    modelKey = '';
    paintStep();
  }

  function closeStay(): void {
    if (!stayOpen) return;
    stayOpen = false;
    modelKey = '';
    paintStep();
  }

  function chooseStay(slot: number, button: HTMLElement | null): void {
    if (painted !== 'step2' || !stayOpen || !armed()) return;
    if (pickStay(store, slot) !== null && button !== null) replayAnimation(button, 'refused');
  }

  function stayByKey(key: number): void {
    const ship = model?.stay?.ships.find((candidate) => candidate.key === key);
    if (ship === undefined) return;
    chooseStay(ship.slot, stayEl.querySelector<HTMLElement>(`[data-slot="${ship.slot}"]`));
  }

  function back(): void {
    if (painted !== 'step2' || !armed()) return;
    if (stayOpen) {
      closeStay();
      return;
    }
    backToStep1(store);
  }

  function cont(): void {
    if (painted !== 'followed' || !armed()) return;
    if (continueFollowed(store) !== null) replayAnimation(contBtn, 'refused');
  }

  // --- The verdict ---

  function typeTickFor(voice: EndingVoice, index: number): TypeVoice {
    if (voice === 'us') return index % 2 === 0 ? 'hollow' : 'sys';
    return VERDICT_TYPE_VOICE[voice];
  }

  function verdictEntry(line: VerdictRow): VerdictEntry {
    const row = make('div', `fc-line voice-${line.voice} pending`);
    if (line.tag !== null) row.append(make('span', 'fc-line-tag', line.tag));
    const text = make('span', 'fc-line-text');
    row.append(text);
    return { line, row, text, shown: 0, chimed: false };
  }

  function startVerdict(): void {
    const state = store.getState();
    const ending = state.hollow.finale.ending;
    if (ending === null) throw new Error('FinaleChoice: a verdict with no lines');
    stopFade();
    painted = 'verdict';
    stayOpen = false;
    verdictTyped = false;
    // Reduced motion shows the verdict whole (§2.10).
    verdictAll = state.ui.reducedMotion;
    root.hidden = false;
    root.className = `finale-choice ending ${verdictTone(ending.choice)}`;
    card.className = `fc-card ${verdictTone(ending.choice)}`;
    openModal();
    renderKeyCaps(hintEl, FINALE_TEXT.verdictHint, { own: 'SPACE' });
    hintEl.hidden = false;
    hintEl.classList.add('pending');
    verdict = verdictRows(ending, finaleEndingLineStartsSec(ending.lines)).map(verdictEntry);
    endingEl.replaceChildren(...verdict.map((entry) => entry.row));
    endingEl.hidden = false;
    holdVerdictHeight();
    paintVerdict();
  }

  // Every line's room is laid out from the start (invisible), and the verdict's height held, so the centred card never
  // grows and the lines already read never move as the next one comes (WP11 review).
  function holdVerdictHeight(): void {
    endingEl.style.minHeight = '';
    for (const entry of verdict) entry.text.textContent = entry.line.text;
    endingEl.style.minHeight = `${Math.ceil(endingEl.getBoundingClientRect().height)}px`;
    for (const entry of verdict) entry.text.textContent = '';
  }

  // The verdict's letters at this AI second, on its own clock (CONTROL's after its chime). One typing tick per tick at most.
  function paintVerdict(): void {
    const ending = store.getState().hollow.finale.ending;
    if (painted !== 'verdict' || ending === null) return;
    const elapsed = aiNow() - ending.startAi;
    let ticked = false;
    for (const entry of verdict) {
      const length = entry.line.text.length;
      if (!entry.chimed && entry.line.voice === 'control' && !verdictAll && elapsed >= entry.line.startSec - CONTROL_CHIME_LEAD_SEC) {
        entry.chimed = true;
        play('typeTick', { voice: 'control' });
      }
      const count = verdictAll ? length : unitsAt(elapsed, entry.line.startSec, FINALE_ENDING_CPS, length);
      if (count === entry.shown) continue;
      if (!verdictAll && !ticked && count > entry.shown && entry.line.text[count - 1] !== ' ') {
        play('typeTick', { voice: typeTickFor(entry.line.voice, count - 1) });
        ticked = true;
      }
      entry.shown = count;
      entry.row.classList.toggle('pending', count === 0);
      entry.row.classList.toggle('typing', count > 0 && count < length);
      entry.text.textContent = entry.line.text.slice(0, count);
    }
    const last = verdict[verdict.length - 1];
    if (last !== undefined && last.shown >= last.line.text.length && !verdictTyped) {
      verdictTyped = true;
      hintEl.classList.remove('pending');
    }
  }

  // A click, SPACE or ENTER on the verdict: finish the typing, or (typed) end it now.
  function advanceVerdict(): void {
    if (painted !== 'verdict') return;
    if (!verdictTyped) {
      verdictAll = true;
      paintVerdict();
      return;
    }
    skipFinaleEnding(store);
    close();
  }

  // --- Closing ---

  function reset(): void {
    stopFade();
    closeModal?.();
    closeModal = null;
    armAtAi = Infinity;
    stayOpen = false;
    model = null;
    modelKey = '';
    rowsKey = '';
    rows = [];
    verdict = [];
    wordLines = [];
    wordEls = [];
    wordShown = [];
  }

  function clearDom(): void {
    root.hidden = true;
    root.className = 'finale-choice';
    card.className = 'fc-card';
    optionsEl.replaceChildren();
    stayEl.replaceChildren();
    wordsEl.replaceChildren();
    endingEl.replaceChildren();
    endingEl.style.minHeight = '';
  }

  // Gone at once, no fade: the run moved on (the LANDING REPORT is up, a NEW RUN began, a reset).
  function closeNow(): void {
    reset();
    painted = 'off';
    clearDom();
  }

  // The verdict is over: the card fades out over FINALE_CARD_FADE_MS (ending.css .finale-choice.closing).
  function close(): void {
    if (painted === 'off' || painted === 'closing') return;
    reset();
    if (root.hidden) {
      painted = 'off';
      return;
    }
    painted = 'closing';
    root.classList.add('closing');
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      painted = 'off';
      clearDom();
    }, FINALE_CARD_FADE_MS);
  }

  // --- What the store says ---

  function sync(): void {
    const want = cardStage(store.getState());
    if (want === 'off' || want === 'waiting') {
      if (painted === 'verdict') close();
      else if (painted !== 'off' && painted !== 'closing') closeNow();
      return;
    }
    if (want === 'verdict') {
      if (painted !== 'verdict') startVerdict();
      else paintVerdict();
      return;
    }
    if (painted !== want) showStep(want);
    else paintStep();
  }

  const onCard = (): void => {
    if (painted === 'verdict') advanceVerdict();
    else if (painted === 'step1' || painted === 'followed') {
      wordsAll = true;
      paintWords();
    }
  };
  const onBack = (event: MouseEvent): void => { event.stopPropagation(); back(); };
  const onCont = (event: MouseEvent): void => { event.stopPropagation(); cont(); };
  root.addEventListener('click', onCard);
  backBtn.addEventListener('click', onBack);
  contBtn.addEventListener('click', onCont);
  const offKeys = registerKeys({
    layer: 'choice',
    codes: [...DIGITS, ...NUMPAD, 'Escape', 'Space', 'Enter', 'NumpadEnter', 'KeyP', 'KeyM'],
    onDown: (code) => {
      if (code === 'KeyP') { togglePause(store); return; }
      if (code === 'KeyM') { toggleMuted(); return; }
      if (painted === 'verdict') {
        if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') advanceVerdict();
        return;
      }
      if (code === 'Escape') { back(); return; }
      if (code === 'Enter' || code === 'NumpadEnter') { cont(); return; }
      const digit = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
      if (!Number.isInteger(digit)) return;
      if (stayOpen) stayByKey(digit);
      else pick(digit);
    },
  });
  const unsubs = [
    store.subscribe((s) => s.hollow.finale.phase, sync),
    store.subscribe((s) => s.hollow.finale.ending, sync),
    store.subscribe((s) => s.run.phase, sync),
    store.subscribe((s) => s.clock.paused, () => { modelKey = ''; sync(); }),
  ];
  // The card's delay, its arming, entry 12, the verdict and the prices (a repair spends charge in place) are AI time: all
  // are read per tick.
  const offTick = onPostTick(() => {
    sync();
    if (painted === 'step1' || painted === 'followed' || painted === 'step2') {
      armIfDue();
      paintWords();
    }
  });
  sync();

  return () => {
    root.removeEventListener('click', onCard);
    backBtn.removeEventListener('click', onBack);
    contBtn.removeEventListener('click', onCont);
    offKeys();
    offTick();
    unsubs.forEach((unsub) => unsub());
    guard.dispose();
    reset();
  };
}
