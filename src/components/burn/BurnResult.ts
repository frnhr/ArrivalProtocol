import type { Store } from '@state/store';
import type { GameState, BurnStatus, RunPhase, TerminalStatus } from '@state/schema';
import { TERMINAL } from '@systems/flight-hud';
import { lostCardSouls } from '@systems/reveal';
import { play } from '@systems/audio';
import { shipLost, lossPlan, continueAfterLoss, type LossPlan } from '@systems/run';
import { requireById } from '@components/dom';
import { createTypeQueue } from '@components/hud/typewriter';
import { getShip } from '@data/ships';
import { LOSS_BUTTON } from '@data/script';
import { RESULT_BANNER_DELAY_MS, REVEAL_TYPE_CPS, REVEAL_TICK_EVERY_CHARS } from '@data/tuning';
import { CORE_LOST_TEXT } from '@data/hollow-text';

// The card's outcome name for a ship lost to an eaten Core (the CSS colours it like a crash).
const CORE_LOST_OUTCOME = 'core-lost';

// The line under each outcome's title (the title is the shared terminal word). Every line
// stays within MAX_LINE_CHARS, like all on-screen text.
export const RESULT_SUB: Record<TerminalStatus, string> = {
  locked: 'The whole loop is inside the SAFE ORBIT ring. Printer range 100%.',
  accepted: 'Part of the loop is outside the ring. Printing will be slow.',
  stranded: "The loop barely touches the ring. The printers can't reach it.",
  escaped: 'The ship never caught the planet and is heading back into deep space.',
  crashed: 'The ship hit the planet.',
  abandoned: 'You beamed out before the impact. The colonists stayed aboard.',
};

// What the LOST card's button does, in its own words (systems/run.ts lossPlan).
function lossButtonText(state: Readonly<GameState>, plan: LossPlan): string {
  if (plan.kind === 'simulation') return LOSS_BUTTON.simulation;
  if (plan.kind === 'end') return LOSS_BUTTON.end;
  const emergency = plan.outcome === 'crashed' || plan.outcome === 'emergency';
  return emergency ? LOSS_BUTTON.emergency : LOSS_BUTTON.transmit(getShip(state.run.shipIndex + 1).name);
}

// The LOST card (§9 WP5 item 6) over a crashed, escaped, stranded or abandoned ship, or one whose Core
// HOLLOW ate: the outcome, why, and the colonists that did not wake. On ship 1 before the reveal that
// last line IS the reveal (`2,400 souls in memory. 0 woke.`): it types slowly under the choir.
// A locked or accepted ship shows nothing here: it prints, then the WAKE REPORT (components/run/
// WakeReport.ts) takes the screen in 'report'. The card waits RESULT_BANNER_DELAY_MS
// so the outcome's stamp, chord and flash land first. Its button goes on with the run (WP7, never a
// page reload): the run-1 simulation retry, EMERGENCY TRANSMIT, a normal transmit, or the run's end
// (systems/run.ts continueAfterLoss). The run's end has its own screen (components/run/RunEnd.ts).
export function mountBurnResult(store: Store<GameState>): () => void {
  const root = requireById('burnResult');
  const titleEl = requireById('burnResultTitle');
  const subEl = requireById('burnResultSub');
  const soulsEl = requireById('burnResultSouls');
  const retryEl = requireById('burnResultRetry');

  // Cosmetic, wall clock: the card is presentation, and the flight is already over. The souls line
  // types through the shared typewriter, like INSPECT's reveal lines (same speed, same relay ticks).
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  const typing = createTypeQueue(() => !root.hidden);

  const stopTimers = (): void => {
    if (showTimer !== null) { clearTimeout(showTimer); showTimer = null; }
    typing.clear();
  };

  // The souls line, typed when it is the reveal (instant under reduced motion; the choir plays
  // either way: the moment is sound as much as text).
  function showSouls(): void {
    const state = store.getState();
    const card = lostCardSouls(state);
    soulsEl.hidden = false;
    soulsEl.classList.toggle('reveal', card.reveals);
    if (!card.reveals || state.ui.reducedMotion) {
      soulsEl.textContent = card.line;
      if (card.reveals) play('revealChoir');
      return;
    }
    play('revealChoir');
    soulsEl.textContent = '';
    typing.push({
      length: card.line.length,
      cps: REVEAL_TYPE_CPS,
      onUnit: (index) => { if (index % REVEAL_TICK_EVERY_CHARS === 0) play('typeTick', { voice: 'sys' }); },
      paint: (count) => { soulsEl.textContent = card.line.slice(0, count); },
    });
  }

  // The card shows its outcome after RESULT_BANNER_DELAY_MS (the outcome's stamp and chord first).
  function show(outcome: string, title: string, sub: string): void {
    titleEl.textContent = title;
    root.dataset.outcome = outcome;
    subEl.textContent = sub;
    soulsEl.hidden = true;
    showTimer = setTimeout(() => {
      root.hidden = false;
      showTimer = null;
      showSouls();
    }, RESULT_BANNER_DELAY_MS);
  }

  // CORE LOST (WP6): HOLLOW ate the AI Core, in flight or while printing; its button is EMERGENCY TRANSMIT
  // (or the run's end on the last ship).
  function render(phase: RunPhase, status: BurnStatus, coreLost: boolean): void {
    const state = store.getState();
    stopTimers();
    document.body.dataset.burnStatus = coreLost ? CORE_LOST_OUTCOME : status;
    // TRANSMIT and RUN END have their own screens; the card is only ever over a lost ship.
    if (phase === 'transmit' || phase === 'end') {
      root.hidden = true;
      return;
    }
    if (!shipLost(state)) {
      root.hidden = true;
      return;
    }
    const plan = lossPlan(state);
    retryEl.textContent = lossButtonText(state, plan);
    // The CORE LOST card is the one card shown while the static rages (the Core is at 0): it sits above the
    // glitch overlay, so its line and its EMERGENCY TRANSMIT / RUN OVER button can be read (WP6's TODO).
    root.classList.toggle('over-static', coreLost);
    if (coreLost) {
      show(CORE_LOST_OUTCOME, CORE_LOST_TEXT.title, plan.kind === 'end' ? CORE_LOST_TEXT.subOverwritten : CORE_LOST_TEXT.subRecoverable);
      return;
    }
    if (status === 'approaching') throw new Error('BurnResult: a lost ship still approaching');
    show(status, TERMINAL[status].word, RESULT_SUB[status]);
  }

  const onRetry = (): void => {
    if (shipLost(store.getState())) continueAfterLoss(store);
  };
  retryEl.addEventListener('click', onRetry);

  const unsub = store.subscribe((s) => `${s.run.rev}|${s.run.phase}|${s.burn.status}|${s.run.coreLost}`, () => {
    const state = store.getState();
    render(state.run.phase, state.burn.status, state.run.coreLost);
  });
  render(store.getState().run.phase, store.getState().burn.status, store.getState().run.coreLost);

  return () => {
    retryEl.removeEventListener('click', onRetry);
    stopTimers();
    unsub();
  };
}
