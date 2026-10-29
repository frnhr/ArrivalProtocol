import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ShipStar } from '@systems/stars';
import { landingReportModel, type LandingReportCredit, type LandingReportModel, type PodIcon, type ReportRow } from '@systems/landing-report';
import { pushModal, registerKeys } from '@systems/input';
import { continueAfterReport } from '@systems/run';
import { play, toggleMuted, type TouchdownSound } from '@systems/audio';
import { creditName } from '@data/souls';
import { LANDING_REPORT_TEXT, LANDING_REPORT_UI_TEXT, podCode } from '@data/landing-text';
import { requireById, replayAnimation, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import {
  CREDITS_LINES_PER_SEC, CREDITS_END_AT_FRAC, REPORT_LEAD_HOLD_SEC, WALL_FRAME_MAX_SEC, REPORT_STAR_GAP_SEC,
  REPORT_CHARGE_AFTER_SEC, REPORT_CHOIR_EVERY_SEC, REPORT_STAR_CHIME_AFTER_SEC, REPORT_FANFARE_AFTER_SEC,
  REPORT_ADVANCE_LOCK_SEC, REPORT_STAR_HURRY_GAP_SEC, REPORT_CONTINUE_ARM_SEC, REPORT_LZ_ROW_GAP_SEC, REPORT_POD_ICON_GAP_SEC,
} from '@data/tuning';

// The LANDING REPORT (01-landing §4), the payoff of a ship, drawn from landing-report's model. About 15 s, skippable,
// in four stages on wall time (the world is stopped in 'report'):
// 1. rows: the route and the colony (`they are calling it RIVERSIDE`), then one row per LZ counting up, a pod icon at a
//    time (soft, hard, mislanded, an empty slot) with `600 / 600 ✓` or `200 / 400 · 200 SHORT` and a heartbeat, then the
//    OFF-SITE / NO-GO / PARKED IN ORBIT (a beacon) / NOT LAUNCHED / RESTORED rows; the headline `LANDED n / N` counts
//    up under them as each LZ lands;
// 2. credits: the phase-2 roll, reused: the lead colonist held in the middle (`Ada Okafor, 11` and her words, with her
//    pod's bell), then one colonist per pod that scored, each with site and first words (`OKAFOR, ADA (11) · LZ-A ·
//    "Is it morning?"`), under the choir;
// 3. stars: the breakdown and the points, then the three stars land one by one (a thud, a chime for an earned one);
// 4. done: the charge they carry (`+18 REPAIR CHARGE ON NEXT SHIP`), up to two near misses, CONTINUE ▸.
// SPACE / ENTER, a click or SKIP jumps a stage; every stage ignores input for REPORT_ADVANCE_LOCK_SEC after it starts and
// CONTINUE arms REPORT_CONTINUE_ARM_SEC after it shows, so mashing [L] or SPACE through the last touchdown can't throw the
// report away unseen. On the final ship it opens after the finale (landing.ts holds the phase until then). Reduced
// motion: the rows and the credits stand still, the stars fade in.

type Stage = 'rows' | 'credits' | 'stars' | 'done';

const NEAR_MISSES_SHOWN = 2;

const ICON_GLYPH: Readonly<Record<PodIcon, string>> = {
  soft: '▮', hard: '▮', mislanded: '▮', 'mislanded-hard': '▮', empty: '▯', 'off-site': '▪', 'no-go': '✕', parked: '⊙', 'not-launched': '▯',
};

function creditOutcome(credit: LandingReportCredit): string {
  if (credit.place === 'off-site' || credit.place === 'no-go') return 'off-site';
  if (credit.place === 'mislanded') return 'mislanded';
  return credit.touch === 'hard' ? 'hard' : 'soft';
}

function touchdownSound(credit: LandingReportCredit): TouchdownSound {
  const outcome = creditOutcome(credit);
  return outcome === 'off-site' ? 'off-site' : outcome === 'mislanded' ? 'mislanded' : credit.touch;
}

// The lead's credit: centred and large, who she is, what she said, her pod and site.
function leadCredit(credit: LandingReportCredit): HTMLElement {
  const box = make('div', `wr-credit wr-lead lr-outcome-${creditOutcome(credit)}`);
  const colonist = credit.colonist;
  const name = make('div', 'wr-l-name', creditName({ name: colonist.name, age: colonist.age, line: colonist.about, firstWords: colonist.words }));
  name.appendChild(make('span', 'wr-l-age', `, ${colonist.age}`));
  box.appendChild(name);
  box.appendChild(make('div', 'wr-l-about', colonist.about));
  box.appendChild(make('div', 'wr-l-words', `“${colonist.words}”`));
  box.appendChild(make('div', 'wr-l-tag', `${podCode(credit.pod)} · ${credit.family.toUpperCase()} · ${credit.where}`));
  return box;
}

// Everyone else, film-credit style: left the pod and where it came down, right the person and their first words.
function credit(entry: LandingReportCredit): HTMLElement {
  const box = make('div', `wr-credit lr-outcome-${creditOutcome(entry)}`);
  box.appendChild(make('div', 'wr-c-code', podCode(entry.pod)));
  box.appendChild(make('div', 'wr-c-who', `${entry.colonist.name.toUpperCase()} (${entry.colonist.age})`));
  box.appendChild(make('div', 'wr-c-status', entry.where));
  box.appendChild(make('div', 'wr-c-words', `“${entry.colonist.words}”`));
  return box;
}

function rowNode(row: ReportRow): HTMLElement {
  const box = make('div', `lr-row kind-${row.kind} tone-${row.tone}`);
  box.appendChild(make('span', 'lr-label', row.label));
  const icons = make('span', 'lr-icons');
  for (const icon of row.icons) icons.appendChild(make('span', `lr-icon icon-${icon}`, ICON_GLYPH[icon]));
  box.appendChild(icons);
  box.appendChild(make('span', 'lr-text', row.text));
  if (row.why) box.appendChild(make('span', 'lr-why', row.why));
  return box;
}

function starNode(star: ShipStar): HTMLElement {
  const box = make('div', `wr-star ${star.earned ? 'earned' : 'missed'}`);
  box.dataset.star = star.id;
  box.appendChild(make('div', 'wr-s-glyph', star.earned ? '★' : '☆'));
  box.appendChild(make('div', 'wr-s-label', star.label));
  if (star.reason) box.appendChild(make('div', 'wr-s-reason', star.reason));
  return box;
}

export function mountLandingReport(store: Store<GameState>): () => void {
  const root = requireById('landingReport');
  const titleEl = requireById('lrTitle');
  const routeEl = requireById('lrRoute');
  const colonyEl = requireById('lrColony');
  const rowsEl = requireById('lrRows');
  const creditsEl = requireById('lrCredits');
  const rollEl = requireById('lrRoll');
  const headlineEl = requireById('lrHeadline');
  const breakdownEl = requireById('lrBreakdown');
  const starsEl = requireById('lrStars');
  const chargeEl = requireById('lrCharge');
  const nearEl = requireById('lrNear');
  const skipEl = requireById<HTMLButtonElement>('lrSkip');
  const continueEl = requireById<HTMLButtonElement>('lrContinue');

  let model: LandingReportModel | null = null;
  let stage: Stage = 'rows';
  let closeModal: (() => void) | null = null;
  let frame: number | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let inputFromMs = 0;
  let hurrying = false;
  let counted = 0;
  // The roll (the phase-2 credits machinery): its offset, where it stops, its speed, the lead's hold, the choir's clock.
  let offset = 0;
  let endOffset = 0;
  let speedPx = 0;
  let holdLeft = 0;
  let choirIn = 0;
  let lastNow = 0;

  const reducedMotion = (): boolean => store.getState().ui.reducedMotion;
  const later = (sec: number, action: () => void): void => { timers.push(setTimeout(action, sec * 1000)); };
  const lockInput = (sec: number): void => { inputFromMs = performance.now() + sec * 1000; };
  const stopTimers = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    timers.forEach(clearTimeout);
    timers = [];
  };

  function paintHeadline(report: LandingReportModel): void {
    headlineEl.textContent = LANDING_REPORT_TEXT.headline(counted, report.aboard);
  }

  // Stage 1: the rows, one after another; within an LZ row its icons one by one.
  function startRows(report: LandingReportModel): void {
    stage = 'rows';
    renderKeyCaps(skipEl, LANDING_REPORT_UI_TEXT.skip, { own: 'SPACE' });
    skipEl.hidden = false;
    continueEl.hidden = true;
    counted = 0;
    paintHeadline(report);
    const nodes = report.rows.map(rowNode);
    rowsEl.replaceChildren(...nodes);
    if (reducedMotion()) {
      nodes.forEach((node) => node.classList.add('landed', 'filled'));
      counted = report.landed;
      paintHeadline(report);
      later(REPORT_LZ_ROW_GAP_SEC * report.rows.length + 0.6, () => startCredits(report));
      return;
    }
    let at = 0.25;
    report.rows.forEach((row, i) => {
      const node = nodes[i]!;
      later(at, () => {
        node.classList.add('landed');
        const lzRow = report.tally.lzs.find((candidate) => candidate.lz === row.label);
        if (lzRow) {
          counted += lzRow.landed;
          paintHeadline(report);
          replayAnimation(headlineEl, 'bump');
        }
        play('heartbeat', { strength: row.kind === 'lz' ? 0.55 : 0.3 });
      });
      Array.from(node.querySelectorAll('.lr-icon')).forEach((icon, j) => {
        later(at + REPORT_POD_ICON_GAP_SEC * (j + 1), () => icon.classList.add('on'));
      });
      at += REPORT_LZ_ROW_GAP_SEC + REPORT_POD_ICON_GAP_SEC * row.icons.length;
    });
    later(at + 0.4, () => startCredits(report));
  }

  function finishRows(report: LandingReportModel): void {
    rowsEl.querySelectorAll('.lr-row').forEach((node) => node.classList.add('landed'));
    rowsEl.querySelectorAll('.lr-icon').forEach((node) => node.classList.add('on'));
    counted = report.landed;
    paintHeadline(report);
  }

  function lineHeight(): number {
    const value = parseFloat(getComputedStyle(root).getPropertyValue('--wr-line-h'));
    if (!(value > 0)) throw new Error('LandingReport: --wr-line-h is not set on .wake-report');
    return value;
  }

  function tick(now: number): void {
    const report = model;
    if (!report || stage !== 'credits') return;
    const dtSec = Math.min(WALL_FRAME_MAX_SEC, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (holdLeft > 0) holdLeft -= dtSec;
    else offset = Math.max(endOffset, offset - speedPx * dtSec);
    rollEl.style.transform = `translateY(${offset.toFixed(1)}px)`;
    choirIn -= dtSec;
    if (choirIn <= 0) {
      play('revealChoir');
      choirIn = REPORT_CHOIR_EVERY_SEC;
    }
    if (holdLeft <= 0 && offset <= endOffset) { showStars(); return; }
    frame = requestAnimationFrame(tick);
  }

  // Stage 2: the credits (no roll for a ship where no pod scored).
  function startCredits(report: LandingReportModel): void {
    if (!model || model !== report || stage !== 'rows') return;
    stopTimers();
    finishRows(report);
    if (report.credits.length === 0) { stage = 'credits'; showStars(); return; }
    stage = 'credits';
    lockInput(REPORT_ADVANCE_LOCK_SEC);
    creditsEl.hidden = false;
    const nodes = report.credits.map((entry, i) => (i === 0 && entry.lead ? leadCredit(entry) : credit(entry)));
    rollEl.replaceChildren(...nodes);
    creditsEl.classList.toggle('still', reducedMotion());
    play('revealChoir');
    choirIn = REPORT_CHOIR_EVERY_SEC;
    const first = report.credits[0]!;
    play('printBell', { lz: Math.max(0, report.tally.lzs.findIndex((row) => row.lz === first.lz)), landing: touchdownSound(first) });
    if (reducedMotion()) {
      rollEl.style.transform = '';
      later(REPORT_LEAD_HOLD_SEC + nodes.length / CREDITS_LINES_PER_SEC, showStars);
      return;
    }
    // Laid out first: the roll measures the window it rolls in.
    requestAnimationFrame(() => {
      if (model !== report || stage !== 'credits') return;
      const windowH = creditsEl.clientHeight;
      const lead = nodes[0]!;
      offset = windowH / 2 - (lead.offsetTop + lead.offsetHeight / 2);
      endOffset = Math.min(offset, windowH * (1 - CREDITS_END_AT_FRAC) - rollEl.offsetHeight);
      speedPx = CREDITS_LINES_PER_SEC * lineHeight();
      holdLeft = REPORT_LEAD_HOLD_SEC;
      rollEl.style.transform = `translateY(${offset.toFixed(1)}px)`;
      lastNow = performance.now();
      frame = requestAnimationFrame(tick);
    });
  }

  // Stage 3: the breakdown and the points, then the stars one by one.
  function showStars(): void {
    const report = model;
    if (!report || (stage !== 'credits' && stage !== 'rows')) return;
    stopTimers();
    finishRows(report);
    stage = 'stars';
    hurrying = false;
    lockInput(REPORT_ADVANCE_LOCK_SEC);
    creditsEl.hidden = true;
    breakdownEl.textContent = `${report.breakdown} · ${report.pointsText}`;
    breakdownEl.hidden = false;
    starsEl.replaceChildren(...report.stars.map(starNode));
    starsEl.hidden = false;
    report.stars.forEach((_star, i) => later(REPORT_STAR_GAP_SEC * (i + 1), () => landStar(report, i)));
    later(REPORT_STAR_GAP_SEC * report.stars.length + REPORT_CHARGE_AFTER_SEC, showDone);
  }

  function landStar(report: LandingReportModel, index: number): void {
    const node = starsEl.children[index];
    const star = report.stars[index];
    if (!(node instanceof HTMLElement) || !star || node.classList.contains('landed')) return;
    node.classList.add('landed');
    play('stampHit', { heavy: star.earned });
    if (star.earned) play('chime', { falling: false }, { delaySec: REPORT_STAR_CHIME_AFTER_SEC });
    const allLanded = Array.from(starsEl.children).every((child) => child.classList.contains('landed'));
    if (allLanded && report.stars.every((each) => each.earned)) play('lockArp', undefined, { delaySec: REPORT_FANFARE_AFTER_SEC });
  }

  function hurryStars(report: LandingReportModel): void {
    stopTimers();
    hurrying = true;
    const waiting = report.stars.map((_star, i) => i).filter((i) => !starsEl.children[i]?.classList.contains('landed'));
    waiting.forEach((index, order) => later(REPORT_STAR_HURRY_GAP_SEC * order, () => landStar(report, index)));
    later(REPORT_STAR_HURRY_GAP_SEC * waiting.length, showDone);
  }

  // Stage 4: what the stars carry, the near misses, and the way on. CONTINUE is dim until it is armed.
  function showDone(): void {
    const report = model;
    if (!report || stage === 'done') return;
    stopTimers();
    stage = 'done';
    hurrying = false;
    lockInput(REPORT_CONTINUE_ARM_SEC);
    Array.from(starsEl.children).forEach((child) => child.classList.add('landed'));
    chargeEl.textContent = report.chargeLine;
    chargeEl.classList.toggle('none', report.charge === 0 && !report.lastShip);
    chargeEl.hidden = false;
    const near = report.nearMisses.slice(0, NEAR_MISSES_SHOWN);
    nearEl.replaceChildren(...near.map((line) => make('div', 'lr-near-line', line)));
    nearEl.hidden = near.length === 0;
    skipEl.hidden = true;
    renderKeyCaps(continueEl, report.continueText, { own: 'SPACE' });
    continueEl.classList.add('arming');
    continueEl.hidden = false;
    later(REPORT_CONTINUE_ARM_SEC, () => continueEl.classList.remove('arming'));
  }

  function advance(): void {
    if (!model || hurrying || performance.now() < inputFromMs) return;
    if (stage === 'rows') { startCredits(model); return; }
    if (stage === 'credits') { showStars(); return; }
    if (stage === 'stars') { hurryStars(model); return; }
    // CONTINUE: the ship's result and its stars go into the run (systems/run.ts), then TRANSMIT or RUN END; the report
    // closes itself when the phase moves on.
    continueAfterReport(store);
  }

  function open(): void {
    const report = landingReportModel(store.getState());
    model = report;
    titleEl.textContent = report.title;
    routeEl.textContent = report.route;
    colonyEl.hidden = report.colonyLine === null;
    colonyEl.textContent = report.colonyLine ?? '';
    creditsEl.hidden = true;
    rollEl.replaceChildren();
    breakdownEl.hidden = true;
    starsEl.hidden = true;
    chargeEl.hidden = true;
    nearEl.hidden = true;
    root.hidden = false;
    root.classList.toggle('reduced', reducedMotion());
    root.classList.toggle('final-ship', report.finalShip);
    document.body.classList.add('report-open');
    hurrying = false;
    lockInput(REPORT_ADVANCE_LOCK_SEC);
    if (!closeModal) closeModal = pushModal('report');
    startRows(report);
  }

  function close(): void {
    stopTimers();
    model = null;
    root.hidden = true;
    document.body.classList.remove('report-open');
    closeModal?.();
    closeModal = null;
  }

  const onCardClick = (): void => advance();
  root.addEventListener('click', onCardClick);
  const offKeys = registerKeys({ layer: 'report', codes: ['Space', 'Enter'], onDown: advance });
  const offMute = registerKeys({ layer: 'report', codes: ['KeyM'], onDown: () => toggleMuted() });
  const unsub = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'report' && !model) open();
    else if (phase !== 'report' && model) close();
  });
  if (store.getState().run.phase === 'report') open();

  return () => {
    root.removeEventListener('click', onCardClick);
    offKeys();
    offMute();
    unsub();
    close();
  };
}

