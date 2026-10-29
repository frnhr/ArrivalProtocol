import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { pushModal, registerKeys } from '@systems/input';
import { continueAfterReport } from '@systems/run';
import { landingReportModel } from '@systems/landing-report';
import { toggleMuted } from '@systems/audio';
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
    const model = landingReportModel(store.getState());
    titleEl.textContent = model.title;
    routeEl.textContent = model.route;
    creditsEl.hidden = true;
    epigraphEl.hidden = true;
    missingEl.hidden = true;
    totalEl.textContent = model.headline;
    breakdownEl.hidden = false;
    breakdownEl.replaceChildren(
      ...[...model.lzRows, ...model.otherRows, ...(model.colonyLine ? [model.colonyLine] : []), ...model.nearMisses.slice(0, 1)]
        .map((line) => make('div', 'wr-b-row', line)),
    );
    starsEl.hidden = false;
    starsEl.replaceChildren(...model.stars.map((star) => {
      const box = make('div', `wr-star ${star.earned ? 'earned' : 'missed'}`);
      box.dataset.star = star.id;
      box.appendChild(make('div', 'wr-s-glyph', star.earned ? '★' : '☆'));
      box.appendChild(make('div', 'wr-s-label', star.label));
      if (star.reason) box.appendChild(make('div', 'wr-s-reason', star.reason));
      return box;
    }));
    chargeEl.hidden = false;
    chargeEl.textContent = model.pointsText;
    skipEl.hidden = true;
    continueEl.hidden = false;
    continueEl.textContent = model.continueText;
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
