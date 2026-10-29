import type { Store } from '@state/store';
import type { GameState, EndingLine, EndingVoice } from '@state/schema';
import {
  chooseFinale, finaleChoiceRefusal, finaleEndingShowing, skipFinaleEnding, podsEatenHere, finaleEndingLineStartsSec,
  type FinaleChoice,
} from '@systems/finale';
import { hollowLabel, unitName } from '@systems/say';
import { pushModal, registerKeys } from '@systems/input';
import { togglePause } from '@systems/pace';
import { onPostTick } from '@systems/clock';
import { play, toggleMuted, type TypeVoice } from '@systems/audio';
import { chargeLeft } from '@state/selectors';
import { requireById, requireIn, make, replayAnimation } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { createTypeQueue, unitsAt, type TypeQueue } from '@components/hud/typewriter';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { echoWord } from '@data/tool-text';
import { formatCount } from '@data/format';
import { podCode } from '@data/landing-text';
import {
  MERGE_COST_CHARGE, HOLLOW_TYPE_CPS, FINALE_CHOICE_DELAY_SEC, FINALE_CHOICE_ARM_SEC, FINALE_ENDING_CPS, CONTROL_CHIME_LEAD_SEC,
} from '@data/tuning';

// LAST LIGHT's choice and its typed ending (§1, §6.6, §9 WP11 item 5): the payoff of the run.
// • THE CARD. FINALE_CHOICE_DELAY_SEC after the root's DELETE has completed (the tear and the collapse are seen
//   first), a card comes up over a dimmed screen: ROOT DELETED, the last block pulsing, `UNIT-046 · ONE BLOCK LEFT`,
//   and HOLLOW's last words typing in its pink (`> 047. wait.`). Then the two options, each with the command it runs
//   in TERMINAL words, what it means and what it costs:
//   – [1] PURGE `> rm unit_046`: clean and a little cold: "It is gone for good. The 400 it ate here stay lost."
//   – [2] MERGE `> merge unit_046 -> unit_047`: warm and costly: "It becomes part of you. C13 · C14 come back, with
//     missing memories." Its price is a meter of the kid's REPAIR CHARGE against the MERGE 20 tick (the 20 it will
//     spend hatched out of it); short of it, the button is out of reach and says why: `NEEDS 20 CHARGE (you have 14)`.
//   The buttons take clicks and keys FINALE_CHOICE_ARM_SEC after the card is up (a kid still clicking the root never
//   chooses by accident). The card is a modal for its moment (§6.11's choice layer): 1 and 2 choose, P pauses, M mutes.
//   The delay and the arming are AI seconds (§3.4: story timers stand still while paused).
// • THE ENDING. The choice (systems/finale.ts) writes its typed ending in the same update as its phase; the card clears
//   and types it, line by line, on the ending's own AI clock: every line from finaleEndingLineStartsSec after the
//   ending's startAi, the very schedule the LANDING REPORT waits for, so the card can't fall behind the report or be cut
//   off by it, and pause holds both (WP11 review: on its own wall-clock copy of the schedule it opened late and lost
//   CONTROL's last line). The command echo, the narration, MERGE's merged voice (`> hi. it's us.`, pink into blue) and
//   ARRIVAL CONTROL's verdict after its chime; every line's room is kept from the start, so nothing on the card moves
//   as the next line comes. A click, SPACE or ENTER finishes the typing; once typed, one more ends it
//   (skipFinaleEnding). When its time is up the card fades and the landing (MERGE's restored pods among it)
//   finishes under the kid's eyes.
// The choice's sounds (the hold under the card, PURGE's cold tone, MERGE's converging chord) are cued here and in
// systems/audio-cues.ts ('finale-chosen'); the landing and the world go on underneath throughout (AI time).

type Stage = 'off' | 'waiting' | 'choosing' | 'ending' | 'closing';

// One typed line of the ending on the card: where its letters go, when it starts on the ending's clock, how many show.
interface EndingRow {
  line: EndingLine;
  row: HTMLElement;
  text: HTMLElement;
  startSec: number;
  shown: number;
  chimed: boolean;
}

// The typing voice each ending voice speaks with: the echo and CONTROL's words in the relay tick, the narration in the
// strip's softer purr, and the merged unit in HOLLOW's blips and the unit's ticks in turn (two voices as one).
const ENDING_TYPE_VOICE: Readonly<Record<Exclude<EndingVoice, 'us'>, TypeVoice>> = { cmd: 'sys', story: 'strip', control: 'sys' };
// The card fades out over this long once its ending is done (game.css .finale-choice.closing).
const CLOSE_FADE_MS = 600;

interface OptionParts {
  button: HTMLButtonElement;
  key: HTMLElement;
  word: HTMLElement;
  cmd: HTMLElement;
  what: HTMLElement;
  cost: HTMLElement;
}

function optionParts(button: HTMLButtonElement, what: string): OptionParts {
  return {
    button,
    key: requireIn(button, '.fc-key', `${what}'s .fc-key`),
    word: requireIn(button, '.fc-word', `${what}'s .fc-word`),
    cmd: requireIn(button, '.fc-cmd', `${what}'s .fc-cmd`),
    what: requireIn(button, '.fc-what', `${what}'s .fc-what`),
    cost: requireIn(button, '.fc-cost', `${what}'s .fc-cost`),
  };
}

export function mountFinaleChoice(store: Store<GameState>): () => void {
  const root = requireById('finaleChoice');
  const card = requireById('fcCard');
  const kickerEl = requireById('fcKicker');
  const titleEl = requireById('fcTitle');
  const wordsEl = requireById('fcWords');
  const subEl = requireById('fcSub');
  const optionsEl = requireById('fcOptions');
  const whyEl = requireById('fcWhy');
  const endingEl = requireById('fcEnding');
  const hintEl = requireById('fcHint');
  const purge = optionParts(requireById<HTMLButtonElement>('fcPurge'), 'PURGE');
  const merge = optionParts(requireById<HTMLButtonElement>('fcMerge'), 'MERGE');
  const meterFill = requireIn(merge.button, '.fc-meter-fill', 'MERGE\'s .fc-meter-fill');
  const meterTick = requireIn(merge.button, '.fc-meter-tick', 'MERGE\'s .fc-meter-tick');
  const priceText = requireIn(merge.button, '.fc-price-text', 'MERGE\'s .fc-price-text');

  let stage: Stage = 'off';
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let closeModal: (() => void) | null = null;
  // AI seconds: when the card comes up (stage 'waiting') and when its buttons arm.
  let showAtAi = Infinity;
  let armAtAi = Infinity;
  let wordsQueue: TypeQueue | null = null;
  let endingRows: EndingRow[] = [];
  // The kid finished the typing early (a click): every line shows whole.
  let endingAll = false;
  let endingTyped = false;
  let lastPrice = '';
  const stopFade = (): void => {
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = null;
  };

  const aiNow = (): number => store.getState().clock.aiSec;
  const armed = (): boolean => aiNow() >= armAtAi;

  // --- The card ---

  function paintWords(): void {
    const state = store.getState();
    const hollow = hollowLabel(state.run);
    const hollowWord = echoWord(hollow);
    kickerEl.textContent = HOLLOW_FINALE.choiceKicker;
    titleEl.textContent = HOLLOW_FINALE.choiceTitle(hollow);
    subEl.textContent = HOLLOW_FINALE.choiceSub;
    purge.key.textContent = HOLLOW_FINALE.purgeKey;
    purge.word.textContent = HOLLOW_FINALE.purge;
    purge.cmd.textContent = HOLLOW_FINALE.purgeCmd(hollowWord);
    purge.what.textContent = HOLLOW_FINALE.purgeWhat;
    merge.key.textContent = HOLLOW_FINALE.mergeKey;
    merge.word.textContent = HOLLOW_FINALE.merge;
    merge.cmd.textContent = HOLLOW_FINALE.mergeCmd(hollowWord, echoWord(unitName(state.run.unitNumber)));
    merge.what.textContent = HOLLOW_FINALE.mergeWhat;
    const eaten = podsEatenHere(state);
    const eatenColonists = eaten.reduce((sum, record) => sum + record.colonists, 0);
    purge.cost.textContent = HOLLOW_FINALE.purgeCost(eatenColonists > 0 ? formatCount(eatenColonists) : null);
    merge.cost.textContent = HOLLOW_FINALE.mergeGain(eaten.map((record) => podCode(record.pod)));
  }

  // MERGE's price against the kid's charge: the meter's scale is the larger of the two, so the MERGE tick sits at the
  // price and the fill is the charge; above the price the 20 MERGE spends is hatched off the fill's end. Short of it,
  // the button is out of reach and says why. Repainted per tick (a repair still running spends charge in place).
  function paintPrice(): void {
    const state = store.getState();
    const have = chargeLeft(state);
    const refusal = finaleChoiceRefusal(state, 'merge');
    // PAUSED refuses both and is the pause veil's to say; only MERGE's price is this card's.
    const priced = refusal !== null && refusal !== finaleChoiceRefusal(state, 'purge');
    const key = `${have}|${priced}|${refusal}`;
    if (key === lastPrice) return;
    lastPrice = key;
    const scale = Math.max(have, MERGE_COST_CHARGE);
    meterFill.style.width = `${(100 * have) / scale}%`;
    meterTick.style.left = `${(100 * MERGE_COST_CHARGE) / scale}%`;
    // Where, along the fill, the part MERGE would spend begins (the fill is the charge: its last MERGE_COST_CHARGE).
    meterFill.style.setProperty('--spend-from', `${have > 0 ? (100 * Math.max(0, have - MERGE_COST_CHARGE)) / have : 0}%`);
    priceText.textContent = HOLLOW_FINALE.mergePrice(MERGE_COST_CHARGE, have);
    merge.button.classList.toggle('short', priced);
    merge.button.setAttribute('aria-disabled', String(priced));
    whyEl.hidden = !priced;
    whyEl.textContent = priced ? refusal : '';
  }

  function openModal(): void {
    if (!closeModal) closeModal = pushModal('choice');
  }

  function showCard(): void {
    stage = 'choosing';
    root.hidden = false;
    root.className = 'finale-choice choosing';
    card.className = 'fc-card';
    endingEl.hidden = true;
    endingEl.replaceChildren();
    endingEl.style.minHeight = '';
    hintEl.hidden = true;
    hintEl.classList.remove('pending');
    optionsEl.classList.remove('shown');
    paintWords();
    lastPrice = '';
    paintPrice();
    openModal();
    play('finaleHold');
    // HOLLOW's last words type in its pink and its slow voice; the options come up once they have.
    wordsEl.textContent = '';
    const words = HOLLOW_FINALE.lastWords(store.getState().run.unitNumber);
    wordsQueue?.clear();
    wordsQueue = createTypeQueue(() => true);
    wordsQueue.push({
      length: words.length,
      cps: HOLLOW_TYPE_CPS,
      onUnit: (index) => { if (words[index] !== ' ') play('typeTick', { voice: 'hollow' }); },
      paint: (count, done) => {
        wordsEl.textContent = words.slice(0, count);
        wordsEl.classList.toggle('typing', !done);
        if (done) optionsEl.classList.add('shown');
      },
    });
    wordsQueue.kick();
    armAtAi = aiNow() + FINALE_CHOICE_ARM_SEC;
    root.classList.remove('armed');
  }

  // Per tick while choosing: the buttons arm once their time is up (and show, even if the words are still typing).
  function armIfDue(): void {
    if (stage !== 'choosing' || root.classList.contains('armed') || !armed()) return;
    root.classList.add('armed');
    optionsEl.classList.add('shown');
  }

  function pick(choice: FinaleChoice): void {
    if (stage !== 'choosing' || !armed()) return;
    const refusal = chooseFinale(store, choice);
    if (refusal !== null) replayAnimation(choice === 'merge' ? merge.button : purge.button, 'refused');
  }

  // --- The ending ---

  function typeTickFor(voice: EndingVoice, index: number): TypeVoice {
    if (voice === 'us') return index % 2 === 0 ? 'hollow' : 'sys';
    return ENDING_TYPE_VOICE[voice];
  }

  // Every line's row is laid out from the start, still invisible ('pending'), and the ending's room is held at its final
  // height (holdEndingHeight), so the centred card never grows and the lines already read never move as the next one
  // comes in (WP11 review: the card grew and re-centred with every line).
  function lineRow(line: EndingLine, startSec: number): EndingRow {
    const row = make('div', `fc-line voice-${line.voice} pending`);
    if (line.voice === 'control') row.append(make('span', 'fc-line-tag', HOLLOW_FINALE.controlTag));
    const text = make('span', 'fc-line-text');
    row.append(text);
    return { line, row, text, startSec, shown: 0, chimed: false };
  }

  function startEnding(): void {
    const ending = store.getState().hollow.finale.ending;
    if (ending === null) throw new Error('FinaleChoice: the choice was made but wrote no ending');
    stopFade();
    wordsQueue?.clear();
    stage = 'ending';
    endingTyped = false;
    endingAll = false;
    root.hidden = false;
    root.className = `finale-choice ending chose-${ending.choice}`;
    card.className = `fc-card chose-${ending.choice}`;
    openModal();
    renderKeyCaps(hintEl, HOLLOW_FINALE.endingHint, { own: 'SPACE' });
    hintEl.hidden = false;
    hintEl.classList.add('pending');
    const starts = finaleEndingLineStartsSec(ending.lines);
    endingRows = ending.lines.map((line, i) => lineRow(line, starts[i]!));
    endingEl.replaceChildren(...endingRows.map((entry) => entry.row));
    endingEl.hidden = false;
    holdEndingHeight();
    paintEnding();
  }

  // The ending's height with every line typed in full, measured once with the lines in place (invisible), then held as
  // its min-height while they type from empty.
  function holdEndingHeight(): void {
    endingEl.style.minHeight = '';
    for (const entry of endingRows) entry.text.textContent = entry.line.text;
    endingEl.style.minHeight = `${Math.ceil(endingEl.getBoundingClientRect().height)}px`;
    for (const entry of endingRows) entry.text.textContent = '';
  }

  // The ending's letters at this AI second: each line from its start on the ending's clock, at FINALE_ENDING_CPS
  // (CONTROL's after its chime: a line's room stays dark until its first letter). One typing tick per tick at most.
  function paintEnding(): void {
    const ending = store.getState().hollow.finale.ending;
    if (stage !== 'ending' || ending === null) return;
    const elapsed = aiNow() - ending.startAi;
    for (const entry of endingRows) {
      const length = entry.line.text.length;
      if (!entry.chimed && entry.line.voice === 'control' && !endingAll && elapsed >= entry.startSec - CONTROL_CHIME_LEAD_SEC) {
        entry.chimed = true;
        play('typeTick', { voice: 'control' });
      }
      const count = endingAll ? length : unitsAt(elapsed, entry.startSec, FINALE_ENDING_CPS, length);
      if (count === entry.shown) continue;
      if (!endingAll && count > entry.shown && entry.line.text[count - 1] !== ' ') {
        play('typeTick', { voice: typeTickFor(entry.line.voice, count - 1) });
      }
      entry.shown = count;
      entry.row.classList.toggle('pending', count === 0);
      entry.row.classList.toggle('typing', count > 0 && count < length);
      entry.text.textContent = entry.line.text.slice(0, count);
    }
    const last = endingRows[endingRows.length - 1];
    if (last !== undefined && last.shown >= last.line.text.length) endingDone();
  }

  function endingDone(): void {
    if (endingTyped) return;
    endingTyped = true;
    hintEl.classList.remove('pending');
  }

  // A click, SPACE or ENTER on the ending: finish the typing, or (typed) end it now.
  function advanceEnding(): void {
    if (stage !== 'ending') return;
    if (!endingTyped) {
      endingAll = true;
      paintEnding();
      return;
    }
    skipFinaleEnding(store);
    close();
  }

  // Gone at once, no fade: the run moved on (the LANDING REPORT is up, a NEW RUN began).
  function closeNow(): void {
    stopFade();
    wordsQueue?.clear();
    closeModal?.();
    closeModal = null;
    showAtAi = Infinity;
    armAtAi = Infinity;
    endingRows = [];
    stage = 'off';
    root.hidden = true;
    root.className = 'finale-choice';
    endingEl.replaceChildren();
    endingEl.style.minHeight = '';
  }

  function close(): void {
    if (stage === 'off' || stage === 'closing') return;
    stopFade();
    wordsQueue?.clear();
    closeModal?.();
    closeModal = null;
    showAtAi = Infinity;
    armAtAi = Infinity;
    endingRows = [];
    if (root.hidden) {
      stage = 'off';
      return;
    }
    stage = 'closing';
    root.classList.add('closing');
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      stage = 'off';
      root.hidden = true;
      root.className = 'finale-choice';
      endingEl.replaceChildren();
      endingEl.style.minHeight = '';
    }, CLOSE_FADE_MS);
  }

  // --- What the store says ---

  function sync(): void {
    const state = store.getState();
    const finale = state.hollow.finale;
    if (state.run.phase !== 'landing') {
      // A NEW RUN, a reset or the LANDING REPORT: nothing of the card stays (the report waited for the ending).
      if (stage !== 'off') closeNow();
      return;
    }
    if (finale.phase === 'choice') {
      if (stage === 'off') {
        stage = 'waiting';
        showAtAi = state.clock.aiSec + FINALE_CHOICE_DELAY_SEC;
      } else if (stage === 'choosing') {
        paintPrice();
      }
      return;
    }
    if (finale.phase === 'purged' || finale.phase === 'merged') {
      // The choice writes its ending in the same update as its phase (systems/finale.ts): a chosen finale without one
      // is a bug, never a card to close quietly.
      if (finale.ending === null) throw new Error(`FinaleChoice: the finale is '${finale.phase}' but has no ending`);
      if (finaleEndingShowing(state)) {
        if (stage !== 'ending' && stage !== 'closing') startEnding();
        return;
      }
    }
    if (stage === 'waiting' || stage === 'choosing' || stage === 'ending') close();
  }

  const onPurge = (event: MouseEvent): void => { event.stopPropagation(); pick('purge'); };
  const onMerge = (event: MouseEvent): void => { event.stopPropagation(); pick('merge'); };
  const onCard = (): void => {
    if (stage === 'ending') advanceEnding();
    else if (stage === 'choosing') wordsQueue?.finishAll();
  };
  purge.button.addEventListener('click', onPurge);
  merge.button.addEventListener('click', onMerge);
  root.addEventListener('click', onCard);
  const offKeys = registerKeys({
    layer: 'choice',
    codes: ['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Space', 'Enter', 'NumpadEnter', 'KeyP', 'KeyM'],
    onDown: (code) => {
      if (code === 'KeyP') { togglePause(store); return; }
      if (code === 'KeyM') { toggleMuted(); return; }
      if (stage === 'ending') { advanceEnding(); return; }
      if (code === 'Digit1' || code === 'Numpad1') pick('purge');
      else if (code === 'Digit2' || code === 'Numpad2') pick('merge');
    },
  });
  const unsubs = [
    store.subscribe((s) => s.hollow.finale.phase, sync),
    store.subscribe((s) => s.hollow.finale.ending, sync),
    store.subscribe((s) => s.run.phase, sync),
    store.subscribe((s) => s.ui.memoryRev, sync),
    store.subscribe((s) => s.clock.paused, () => { lastPrice = ''; sync(); }),
  ];
  // The card's delay, its arming and the ending are AI time (the LANDING REPORT waits on the same clock), and a repair
  // spends charge in place: all are read per tick.
  const offTick = onPostTick(() => {
    if (stage === 'waiting' && aiNow() >= showAtAi) showCard();
    if (stage === 'choosing') {
      armIfDue();
      paintPrice();
    } else if (stage === 'ending') {
      if (!finaleEndingShowing(store.getState())) close();
      else paintEnding();
    }
  });
  sync();

  return () => {
    purge.button.removeEventListener('click', onPurge);
    merge.button.removeEventListener('click', onMerge);
    root.removeEventListener('click', onCard);
    offKeys();
    offTick();
    unsubs.forEach((unsub) => unsub());
    stopFade();
    wordsQueue?.clear();
    closeModal?.();
    closeModal = null;
  };
}
