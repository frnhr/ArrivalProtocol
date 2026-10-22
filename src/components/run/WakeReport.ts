import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { wakeReportModel, type WakeReportModel, type CreditEntry } from '@systems/wake-report';
import type { ShipStar } from '@systems/stars';
import { pushModal, registerKeys } from '@systems/input';
import { continueAfterReport } from '@systems/run';
import { play, toggleMuted } from '@systems/audio';
import { REPORT_TEXT } from '@data/script';
import { requireById, replayAnimation, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import {
  CREDITS_LINES_PER_SEC, CREDITS_END_AT_FRAC, REPORT_LEAD_HOLD_SEC, WALL_FRAME_MAX_SEC,
  REPORT_STAR_GAP_SEC, REPORT_CHARGE_AFTER_SEC, REPORT_CHOIR_EVERY_SEC, REPORT_COUNT_HEARTBEAT,
  REPORT_STAR_CHIME_AFTER_SEC, REPORT_FANFARE_AFTER_SEC, REPORT_ADVANCE_LOCK_SEC, REPORT_STAR_HURRY_GAP_SEC,
  REPORT_CONTINUE_ARM_SEC,
} from '@data/tuning';

// The WAKE REPORT (§4.1 step 4, §5.1 1:55, §9 WP5 item 8): the payoff of a ship. When the last
// cluster has left memory ('report'), the screen goes to night and the colonists are credited like
// the end of a film. It plays in three stages:
// 1. credits: the lead colonist holds the middle of the screen (Ada Okafor, 11, "Is it morning?",
//    with a bell), then the names roll up at CREDITS_LINES_PER_SEC under the reveal's choir. As each
//    family rises past the count line, the count under the credits rolls up with a heartbeat: WOKE
//    counts heads (WP7), so every family that woke adds its 200; one with missing memories puts the
//    hurt yellow line under the count (`200 WITH MISSING MEMORIES`), which grows as more do;
// 2. stars: the credits give way to the lead's words, the totals and how they woke, then the three
//    stars land one by one (a thud, and a chime for one earned), each missed one with its reason;
// 3. done: the REPAIR CHARGE the stars are worth, and CONTINUE.
// SPACE / ENTER, a click on the card, or SKIP jumps to the next stage; on the last, CONTINUE goes on
// with the run (TRANSMIT to the next ship, or RUN END after the last). SPACE is also the burn key, so every
// stage ignores input for REPORT_ADVANCE_LOCK_SEC after it starts, a skip during the stars still
// lands them one by one (quickly), and CONTINUE takes input only REPORT_CONTINUE_ARM_SEC after it
// appears: mashing can't throw the whole report away. The report owns the keys while it is up
// (input layer 'report'), M still mutes. Everything here is presentation on wall time (requestAnimation
// Frame and timers, like the stamps); the world is stopped in 'report'. Reduced motion: the credits
// stand still as a list (no roll), the count is shown whole, the stars fade in instead of landing.

type Stage = 'credits' | 'stars' | 'done';

// The lead's credit: centred and large, with who she is, what she said and her cluster.
function leadCredit(entry: CreditEntry): HTMLElement {
  const box = make('div', `wr-credit wr-lead outcome-${entry.outcome}`);
  const name = make('div', 'wr-l-name', entry.name);
  name.appendChild(make('span', 'wr-l-age', `, ${entry.age}`));
  box.appendChild(name);
  if (entry.about) box.appendChild(make('div', 'wr-l-about', entry.about));
  box.appendChild(make('div', 'wr-l-words', entry.words === null ? entry.status : `“${entry.words}”`));
  box.appendChild(make('div', 'wr-l-tag', `${entry.cluster} · ${entry.family.toUpperCase()} · ${entry.status}`));
  return box;
}

// Everyone else: two lines, film-credit style. Left, right-aligned: the cluster and how they woke;
// right: the person and their first words.
function credit(entry: CreditEntry): HTMLElement {
  const box = make('div', `wr-credit outcome-${entry.outcome}`);
  box.appendChild(make('div', 'wr-c-code', `${entry.cluster} · ${entry.souls} souls`));
  const who = make('div', 'wr-c-who', entry.name);
  who.appendChild(make('span', 'wr-c-age', `, ${entry.age}`));
  box.appendChild(who);
  box.appendChild(make('div', 'wr-c-status', entry.status));
  box.appendChild(make('div', 'wr-c-words', entry.words === null ? '—' : `“${entry.words}”`));
  return box;
}

// The words the final card keeps from the lead: hers, or that she did not wake. They keep the colour
// of how she woke (#wrEpigraph carries her outcome).
function epigraph(entry: CreditEntry): HTMLElement[] {
  if (entry.words === null) return [make('div', 'wr-e-words', `${entry.name}, ${entry.age}, did not wake.`)];
  return [make('div', 'wr-e-words', `“${entry.words}”`), make('div', 'wr-e-who', `— ${entry.name}, ${entry.age}`)];
}

function starNode(star: ShipStar): HTMLElement {
  const box = make('div', `wr-star ${star.earned ? 'earned' : 'missed'}`);
  box.dataset.star = star.id;
  box.appendChild(make('div', 'wr-s-glyph', star.earned ? '★' : '☆'));
  box.appendChild(make('div', 'wr-s-label', star.label));
  if (star.reason) box.appendChild(make('div', 'wr-s-reason', star.reason));
  return box;
}

export function mountWakeReport(store: Store<GameState>): () => void {
  const root = requireById('wakeReport');
  const titleEl = requireById('wrTitle');
  const routeEl = requireById('wrRoute');
  const creditsEl = requireById('wrCredits');
  const rollEl = requireById('wrRoll');
  const epigraphEl = requireById('wrEpigraph');
  const totalEl = requireById('wrTotal');
  const missingEl = requireById('wrMissing');
  const breakdownEl = requireById('wrBreakdown');
  const starsEl = requireById('wrStars');
  const chargeEl = requireById('wrCharge');
  const skipEl = requireById<HTMLButtonElement>('wrSkip');
  const continueEl = requireById<HTMLButtonElement>('wrContinue');

  // The report on screen, or null.
  let model: WakeReportModel | null = null;
  let stage: Stage = 'credits';
  let closeModal: (() => void) | null = null;
  let frame: number | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  // The roll: its offset from the top of the credits window (px), where it stops, its speed, the lead
  // hold still to go, and the credits not yet counted (with the offset at which each is).
  let offset = 0;
  let endOffset = 0;
  let speedPx = 0;
  let holdLeft = 0;
  let choirIn = 0;
  let lastNow = 0;
  let counted = 0;
  let pending: { at: number; entry: CreditEntry }[] = [];
  // Input: the wall time (ms) before which a press does nothing (the stage just started, or
  // CONTINUE is not armed yet), and whether a skip is already landing the stars.
  let inputFromMs = 0;
  let hurrying = false;

  const reducedMotion = (): boolean => store.getState().ui.reducedMotion;
  const later = (sec: number, action: () => void): void => { timers.push(setTimeout(action, sec * 1000)); };
  const lockInput = (sec: number): void => { inputFromMs = performance.now() + sec * 1000; };
  const stopTimers = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    timers.forEach(clearTimeout);
    timers = [];
  };

  // The count as the headline reads it (heads), and under it the ones who woke with missing memories.
  let countedGaps = 0;
  function paintCount(total: number): void {
    totalEl.textContent = REPORT_TEXT.totals(counted, total);
    missingEl.hidden = countedGaps === 0;
    missingEl.textContent = countedGaps > 0 ? REPORT_TEXT.missing(countedGaps) : '';
  }

  // Counts every credit whose middle has risen past the count line: the height at which the roll
  // stops (CREDITS_END_AT_FRAC up the window), so the last family is counted as the roll ends and
  // the count never jumps when the stars come in. Heads: a family with missing memories counts whole here
  // and shows under it in the hurt yellow (§4.4's half credit is only RUN END's SCORE).
  function countPassed(report: WakeReportModel, countLine: number): void {
    while (pending.length > 0 && offset + pending[0]!.at <= countLine) {
      const { entry } = pending.shift()!;
      if (entry.outcome === 'lost') continue;
      counted += entry.souls;
      if (entry.outcome === 'gaps') countedGaps += entry.souls;
      paintCount(report.total);
      if (!reducedMotion()) replayAnimation(totalEl, 'bump');
      play('heartbeat', { strength: REPORT_COUNT_HEARTBEAT[entry.outcome] });
    }
  }

  function tick(now: number): void {
    const report = model;
    if (!report || stage !== 'credits') return;
    const dtSec = Math.min(WALL_FRAME_MAX_SEC, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (holdLeft > 0) holdLeft -= dtSec;
    else offset = Math.max(endOffset, offset - speedPx * dtSec);
    rollEl.style.transform = `translateY(${offset.toFixed(1)}px)`;
    countPassed(report, creditsEl.clientHeight * (1 - CREDITS_END_AT_FRAC));
    choirIn -= dtSec;
    if (choirIn <= 0) {
      play('revealChoir');
      choirIn = REPORT_CHOIR_EVERY_SEC;
    }
    if (holdLeft <= 0 && offset <= endOffset) { showStars(); return; }
    frame = requestAnimationFrame(tick);
  }

  // Stage 1. The roll starts with the lead in the middle of the window and ends when the last
  // credit is CREDITS_END_AT_FRAC of the way up. Measured after layout: the window's height is
  // whatever the screen gives it.
  function startCredits(report: WakeReportModel): void {
    stage = 'credits';
    renderKeyCaps(skipEl, REPORT_TEXT.skip, { own: 'SPACE' });
    skipEl.hidden = false;
    continueEl.hidden = true;
    const nodes = report.credits.map((entry) => (entry.lead ? leadCredit(entry) : credit(entry)));
    rollEl.replaceChildren(...nodes);
    counted = 0;
    countedGaps = 0;
    paintCount(report.total);
    creditsEl.classList.toggle('still', reducedMotion());

    if (reducedMotion()) {
      // The list stands still; the count is whole; the credits stay up as long as the roll would.
      rollEl.style.transform = '';
      counted = report.woke;
      countedGaps = report.wokeWithGaps;
      paintCount(report.total);
      play('revealChoir');
      const rows = rollEl.offsetHeight / lineHeight();
      later(REPORT_LEAD_HOLD_SEC + rows / CREDITS_LINES_PER_SEC, showStars);
      return;
    }

    const windowH = creditsEl.clientHeight;
    const lead = nodes[0]!;
    offset = windowH / 2 - (lead.offsetTop + lead.offsetHeight / 2);
    endOffset = Math.min(offset, windowH * (1 - CREDITS_END_AT_FRAC) - rollEl.offsetHeight);
    speedPx = CREDITS_LINES_PER_SEC * lineHeight();
    holdLeft = REPORT_LEAD_HOLD_SEC;
    pending = nodes.map((node, i) => ({ at: node.offsetTop + node.offsetHeight / 2, entry: report.credits[i]! }));
    rollEl.style.transform = `translateY(${offset.toFixed(1)}px)`;
    play('revealChoir');
    choirIn = REPORT_CHOIR_EVERY_SEC;
    const leadEntry = report.credits[0]!;
    if (leadEntry.outcome !== 'lost') play('printBell', { gaps: leadEntry.outcome === 'gaps' });
    lastNow = performance.now();
    frame = requestAnimationFrame(tick);
  }

  // One credit line's height, from the stylesheet (the roll's speed is in lines per second).
  function lineHeight(): number {
    const value = parseFloat(getComputedStyle(root).getPropertyValue('--wr-line-h'));
    if (!(value > 0)) throw new Error('WakeReport: --wr-line-h is not set on .wake-report');
    return value;
  }

  // Stage 2: the lead's words, the totals, then the stars one by one.
  function showStars(): void {
    const report = model;
    if (!report || stage !== 'credits') return;
    stopTimers();
    stage = 'stars';
    hurrying = false;
    lockInput(REPORT_ADVANCE_LOCK_SEC);
    counted = report.woke;
    countedGaps = report.wokeWithGaps;
    paintCount(report.total);
    creditsEl.hidden = true;
    const lead = report.credits[0]!;
    epigraphEl.className = `wr-epigraph outcome-${lead.outcome}`;
    epigraphEl.replaceChildren(...epigraph(lead));
    epigraphEl.hidden = false;
    breakdownEl.textContent = report.breakdown;
    breakdownEl.hidden = false;
    starsEl.replaceChildren(...report.stars.map(starNode));
    starsEl.hidden = false;
    report.stars.forEach((_star, i) => later(REPORT_STAR_GAP_SEC * (i + 1), () => landStar(report, i)));
    later(REPORT_STAR_GAP_SEC * report.stars.length + REPORT_CHARGE_AFTER_SEC, showDone);
  }

  function landStar(report: WakeReportModel, index: number): void {
    const node = starsEl.children[index];
    const star = report.stars[index];
    if (!(node instanceof HTMLElement) || !star || node.classList.contains('landed')) return;
    node.classList.add('landed');
    play('stampHit', { heavy: star.earned });
    if (star.earned) play('chime', { falling: false }, { delaySec: REPORT_STAR_CHIME_AFTER_SEC });
    const allLanded = Array.from(starsEl.children).every((child) => child.classList.contains('landed'));
    if (allLanded && report.stars.every((each) => each.earned)) play('lockArp', undefined, { delaySec: REPORT_FANFARE_AFTER_SEC });
  }

  // A skip during the stars: the ones still to come land quickly, each still heard, then the charge.
  function hurryStars(report: WakeReportModel): void {
    stopTimers();
    hurrying = true;
    const waiting = report.stars.map((_star, i) => i).filter((i) => !starsEl.children[i]?.classList.contains('landed'));
    waiting.forEach((index, order) => later(REPORT_STAR_HURRY_GAP_SEC * order, () => landStar(report, index)));
    later(REPORT_STAR_HURRY_GAP_SEC * waiting.length, showDone);
  }

  // Stage 3: what the stars are worth, and the way on. CONTINUE is dim until it is armed.
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
    skipEl.hidden = true;
    renderKeyCaps(continueEl, report.continueLabel, { own: 'SPACE' });
    continueEl.classList.add('arming');
    continueEl.hidden = false;
    later(REPORT_CONTINUE_ARM_SEC, () => continueEl.classList.remove('arming'));
  }

  // SPACE, ENTER, a click on the card: the next stage, once the stage has been up long enough to be
  // seen (a press made before it was armed does nothing; repeats never reach here, input.ts).
  function advance(): void {
    if (!model || hurrying || performance.now() < inputFromMs) return;
    if (stage === 'credits') { showStars(); return; }
    if (stage === 'stars') { hurryStars(model); return; }
    // CONTINUE: the ship's result and its stars go into the run, then TRANSMIT (or RUN END after the
    // last ship). systems/run.ts; the report closes itself when the phase moves on.
    continueAfterReport(store);
  }

  function open(): void {
    const report = wakeReportModel(store.getState());
    model = report;
    titleEl.textContent = report.title;
    routeEl.textContent = report.route;
    creditsEl.hidden = false;
    epigraphEl.hidden = true;
    breakdownEl.hidden = true;
    starsEl.hidden = true;
    chargeEl.hidden = true;
    root.hidden = false;
    root.classList.toggle('reduced', reducedMotion());
    document.body.classList.add('report-open');
    hurrying = false;
    lockInput(REPORT_ADVANCE_LOCK_SEC);
    if (!closeModal) closeModal = pushModal('report');
    // Laid out first: the roll measures the window it rolls in.
    requestAnimationFrame(() => { if (model === report) startCredits(report); });
  }

  function close(): void {
    stopTimers();
    model = null;
    root.hidden = true;
    document.body.classList.remove('report-open');
    closeModal?.();
    closeModal = null;
  }

  // SKIP and CONTINUE are inside the card, so one click handler serves them and the card itself.
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
