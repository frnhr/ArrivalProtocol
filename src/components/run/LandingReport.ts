import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { pushModal, registerKeys } from '@systems/input';
import { continueAfterReport, shipOutcomeOf } from '@systems/run';
import { landingResult } from '@systems/landing-rules';
import { shipStars } from '@systems/stars';
import { toggleMuted } from '@systems/audio';
import { getShip, isLastShip } from '@data/ships';
import { LANDING_REPORT_TEXT } from '@data/landing-text';
import { requireById, make } from '@components/dom';
import { REPORT_ADVANCE_LOCK_SEC } from '@data/tuning';

// PLACEHOLDER LANDING REPORT (slice 1a F2): just enough that a landed ship shows its count and stars and the run goes on
// to TRANSMIT (or RUN END). It borrows the old WAKE REPORT's card (#wakeReport) and leaves its credits roll hidden.
// TODO(slice1a-UI): the real LANDING REPORT (01-landing §3.11): the per-LZ rows counting up, the colony line, the
// near-miss line, the stars landing one by one, its own DOM and sound.
export function mountLandingReport(store: Store<GameState>): () => void {
  const root = requireById('wakeReport');
  const titleEl = requireById('wrTitle');
  const routeEl = requireById('wrRoute');
  const creditsEl = requireById('wrCredits');
  const epigraphEl = requireById('wrEpigraph');
  const totalEl = requireById('wrTotal');
  const missingEl = requireById('wrMissing');
  const breakdownEl = requireById('wrBreakdown');
  const starsEl = requireById('wrStars');
  const chargeEl = requireById('wrCharge');
  const skipEl = requireById<HTMLButtonElement>('wrSkip');
  const continueEl = requireById<HTMLButtonElement>('wrContinue');

  let open = false;
  let closeModal: (() => void) | null = null;
  // SPACE is also the launch key: a press made in the first moment of the report does nothing, so mashing [L]/SPACE
  // through the last touchdown can't skip it unseen.
  let inputFromMs = 0;

  function paint(): void {
    const state = store.getState();
    const ship = getShip(state.run.shipIndex);
    const tally = landingResult(state, shipOutcomeOf(state));
    titleEl.textContent = LANDING_REPORT_TEXT.title;
    routeEl.textContent = LANDING_REPORT_TEXT.route(ship.name, ship.world, ship.landing.terrain, ship.landing.forgiveness);
    creditsEl.hidden = true;
    epigraphEl.hidden = true;
    missingEl.hidden = true;
    totalEl.textContent = LANDING_REPORT_TEXT.headline(tally.landedOnTarget, tally.colonistsAboard);
    breakdownEl.hidden = false;
    breakdownEl.replaceChildren(
      ...tally.lzs.map((row) => make('div', 'wr-b-row', LANDING_REPORT_TEXT.lzRow(row.lz, row.landed, row.count))),
      ...(tally.offSite > 0 ? [make('div', 'wr-b-row', LANDING_REPORT_TEXT.offSite(tally.offSite))] : []),
      ...(tally.noGo > 0 ? [make('div', 'wr-b-row', LANDING_REPORT_TEXT.noGo(tally.noGo))] : []),
      ...tally.parked.map((parked) => make('div', 'wr-b-row', LANDING_REPORT_TEXT.parked(parked.pod))),
      ...(tally.colony ? [make('div', 'wr-b-row', LANDING_REPORT_TEXT.colony(tally.colony))] : []),
    );
    starsEl.hidden = false;
    starsEl.replaceChildren(...shipStars(state).map((star) => {
      const box = make('div', `wr-star ${star.earned ? 'earned' : 'missed'}`);
      box.dataset.star = star.id;
      box.appendChild(make('div', 'wr-s-glyph', star.earned ? '★' : '☆'));
      box.appendChild(make('div', 'wr-s-label', star.label));
      if (star.reason) box.appendChild(make('div', 'wr-s-reason', star.reason));
      return box;
    }));
    chargeEl.hidden = false;
    chargeEl.textContent = LANDING_REPORT_TEXT.points(tally.points);
    skipEl.hidden = true;
    continueEl.hidden = false;
    continueEl.textContent = isLastShip(state.run.shipIndex) ? LANDING_REPORT_TEXT.runEnd : LANDING_REPORT_TEXT.continue;
  }

  function show(): void {
    open = true;
    paint();
    root.hidden = false;
    document.body.classList.add('report-open');
    inputFromMs = performance.now() + REPORT_ADVANCE_LOCK_SEC * 1000;
    if (!closeModal) closeModal = pushModal('report');
  }

  function hide(): void {
    open = false;
    root.hidden = true;
    document.body.classList.remove('report-open');
    closeModal?.();
    closeModal = null;
  }

  // CONTINUE: the ship's result and stars go into the run (systems/run.ts); the card closes when the phase moves on.
  function advance(): void {
    if (!open || performance.now() < inputFromMs) return;
    continueAfterReport(store);
  }

  const onCardClick = (): void => advance();
  root.addEventListener('click', onCardClick);
  const offKeys = registerKeys({ layer: 'report', codes: ['Space', 'Enter'], onDown: advance });
  const offMute = registerKeys({ layer: 'report', codes: ['KeyM'], onDown: () => toggleMuted() });
  const unsub = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'report' && !open) show();
    else if (phase !== 'report' && open) hide();
  });
  if (store.getState().run.phase === 'report') show();

  return () => {
    root.removeEventListener('click', onCardClick);
    offKeys();
    offMute();
    unsub();
    hide();
  };
}
