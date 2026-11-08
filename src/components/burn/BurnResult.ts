import type { Store } from '@state/store';
import type { GameState, BurnStatus, RunPhase, TerminalStatus } from '@state/schema';
import { TERMINAL } from '@systems/flight-hud';
import { shipLost, lossPlan, continueAfterLoss, shipOutcomeOf, shipResultOf, type LossPlan } from '@systems/run';
import { shipCycles } from '@systems/run-score';
import { cyclesReport } from '@systems/training-model';
import { landingResult } from '@systems/landing-rules';
import { residentReportRows } from '@systems/resident-hud';
import { requireById, make } from '@components/dom';
import { MAP_TEXT } from '@data/map-text';
import { LOSS_BUTTON } from '@data/script';
import { RESULT_BANNER_DELAY_MS } from '@data/tuning';
import { LOST_CARD_TEXT, POD_STATE_TEXT } from '@data/landing-text';
import { CORE_LOST_TEXT } from '@data/hollow-text';

// The card's outcome name for a ship lost to an eaten Core (the CSS colours it like a crash).
const CORE_LOST_OUTCOME = 'core-lost';

// The line under each outcome's title (the title is the shared terminal word). Every line
// stays within MAX_LINE_CHARS, like all on-screen text.
export const RESULT_SUB: Record<TerminalStatus, string> = {
  locked: 'The whole loop is inside the LAUNCH BAND. Every pass can drop.',
  accepted: 'Part of the loop is outside the band. Fewer chances to drop.',
  stranded: "The loop barely touches the band. The pods can't reach the ground.",
  escaped: 'The ship never caught the planet and is heading back into deep space.',
  crashed: 'The ship hit the planet.',
  abandoned: 'You beamed out before the impact. The colonists stayed aboard.',
};

// What the LOST card's button does, in its own words (systems/run.ts lossPlan).
function lossButtonText(plan: LossPlan): string {
  if (plan.kind === 'simulation') return LOSS_BUTTON.simulation;
  if (plan.kind === 'end') return LOSS_BUTTON.end;
  const emergency = plan.outcome === 'crashed' || plan.outcome === 'emergency';
  if (emergency) return LOSS_BUTTON.emergency;
  // Every ship's end goes through the desk: the kid picks the next ship on the chart.
  return MAP_TEXT.lossToChart;
}

// The LOST card (§9 WP5 item 6) over a crashed, escaped, stranded or abandoned ship, or one whose Core
// HOLLOW ate: the outcome, why, and the pods line (`2,400 colonists aboard · 0 landed`, from colonistCounts).
// A locked or accepted ship shows nothing here: it lands its pods, then the LANDING REPORT (components/run/
// LandingReport.ts) takes the screen in 'report'. The card waits RESULT_BANNER_DELAY_MS
// so the outcome's stamp, chord and flash land first. Its button goes on with the run (WP7, never a
// page reload): the run-1 simulation retry, EMERGENCY TRANSMIT, a normal transmit, or the run's end
// (systems/run.ts continueAfterLoss). The run's end has its own screen (components/run/RunEnd.ts).
export function mountBurnResult(store: Store<GameState>): () => void {
  const root = requireById('burnResult');
  const titleEl = requireById('burnResultTitle');
  const subEl = requireById('burnResultSub');
  const podsEl = requireById('burnResultPods');
  const cyclesEl = requireById('burnResultCycles');
  const retryEl = requireById('burnResultRetry');

  // Cosmetic, wall clock: the card is presentation, and the flight is already over.
  let showTimer: ReturnType<typeof setTimeout> | null = null;

  const stopTimers = (): void => {
    if (showTimer !== null) { clearTimeout(showTimer); showTimer = null; }
  };

  // The pods line (01-landing §3.10, one word per state): the pods still aboard are NOT LAUNCHED when the ship left
  // orbit with them, PARKED IN ORBIT when it ended there (a Core eaten mid-landing, STRANDED), and the colonists who
  // made it down first are counted after them.
  function showPods(): void {
    const state = store.getState();
    const tally = landingResult(state, shipOutcomeOf(state));
    const notLaunched = tally.pods.filter((pod) => pod.fate === 'not-launched').length;
    const parked = tally.parked.length;
    const landed = tally.pods.filter((pod) => pod.fate === 'down').reduce((sum, pod) => sum + pod.colonists, 0);
    podsEl.hidden = false;
    podsEl.textContent = notLaunched > 0 ? LOST_CARD_TEXT.podsFate(notLaunched, POD_STATE_TEXT.notLaunched, landed)
      : parked > 0 ? LOST_CARD_TEXT.podsFate(parked, POD_STATE_TEXT.parked, landed) : LOST_CARD_TEXT.allDown(landed);
    showCycles();
  }

  // Slice 4 (the review's designer Q4): a lost ship still pays its training cycles (ARRIVED +1, and whatever landed before
  // it was lost), and BEAM OUT and EMERGENCY ships have no LANDING REPORT to say so: the card says it in the report's words,
  // from the same earning endShip records at the button (run-score.ts shipCycles; training-model.ts cyclesReport), with the
  // first pick's top-up under it on a run's first ship. Not before the simulation's
  // retry (the ship is flown again, nothing is earned).
  function showCycles(): void {
    const state = store.getState();
    cyclesEl.hidden = true;
    const plan = lossPlan(state);
    if (plan.kind === 'simulation') return;
    // Slice 5 review m2: the sleeper's gift is paid landed or lost (R12, review m10), so the LOST card says it too, under the
    // cycles in the LANDING REPORT's words (resident-hud residentReportRows).
    const gifts = residentReportRows(state).filter((row) => row.kind === 'gift').map((row) => make('div', 'burn-result-gift', row.text));
    const result = shipResultOf(state, shipOutcomeOf(state), 0);
    const lines: HTMLElement[] = [];
    if (result.colonistsAboard > 0) {
      const report = cyclesReport(shipCycles(result), plan.kind === 'end', state.run.ships.length === 0);
      lines.push(make('div', 'burn-result-cycles-line', report.line), ...(report.topUp === null ? [] : [make('div', 'burn-result-topup', report.topUp)]));
    }
    if (lines.length + gifts.length === 0) return;
    cyclesEl.replaceChildren(...lines, ...gifts);
    cyclesEl.hidden = false;
  }

  // The card shows its outcome after RESULT_BANNER_DELAY_MS (the outcome's stamp and chord first).
  function show(outcome: string, title: string, sub: string): void {
    titleEl.textContent = title;
    root.dataset.outcome = outcome;
    subEl.textContent = sub;
    podsEl.hidden = true;
    cyclesEl.hidden = true;
    showTimer = setTimeout(() => {
      root.hidden = false;
      showTimer = null;
      showPods();
    }, RESULT_BANNER_DELAY_MS);
  }

  // CORE LOST (WP6): HOLLOW ate the AI Core, in flight or while landing; its button is EMERGENCY TRANSMIT
  // (or the run's end on the last ship).
  function render(phase: RunPhase, status: BurnStatus, coreLost: boolean): void {
    const state = store.getState();
    stopTimers();
    document.body.dataset.burnStatus = coreLost ? CORE_LOST_OUTCOME : status;
    // The DESK, TRANSMIT and RUN END have their own screens; the card is only ever over a lost ship.
    if (phase === 'desk' || phase === 'transmit' || phase === 'end') {
      root.hidden = true;
      return;
    }
    if (!shipLost(state)) {
      root.hidden = true;
      return;
    }
    const plan = lossPlan(state);
    retryEl.textContent = lossButtonText(plan);
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
