// Slice 5: Track FACE owns this file (docs/phase3/impl/slice-5-plan.md §6.2): the resident rows (slice 4's cycles line
// stands). Others ask by message.
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
import { reportTraceLine } from '@systems/hollow-hud';
import { cyclesReport } from '@systems/training-model';
import { TRAINING_TEXT } from '@data/training-text';
import { shipCycles } from '@systems/run-score';
import { currentSlot } from '@systems/map-run';
import { CYCLES_ARRIVED, CYCLES_LANDED_STEPS, REPORT_CYCLES_START_SEC, REPORT_CYCLE_STEP_SEC } from '@data/tuning';
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
// 4. done: the charge they carry (`+18 REPAIR CHARGE ON NEXT SHIP`), the TRACE line (phase 3 slice 2, 04 §4: what the
//    beam seeds left behind will do at CONTINUE, `2 SEEDS LEFT BEHIND · THEY REPORT HOME · TRACE □□□ → ■■□`, from the
//    same tally the ship's end applies), up to two near misses, CONTINUE ▸.
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
  const box = make('div', `lr-row kind-${row.kind} tone-${row.tone}${row.locked ? ' res-locked' : ''}`);
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
  const beaconEl = requireById('lrBeacon');
  const rowsEl = requireById('lrRows');
  const creditsEl = requireById('lrCredits');
  const rollEl = requireById('lrRoll');
  const headlineEl = requireById('lrHeadline');
  const breakdownEl = requireById('lrBreakdown');
  const starsEl = requireById('lrStars');
  const chargeEl = requireById('lrCharge');
  const nearEl = requireById('lrNear');
  const traceEl = requireById('lrTrace');
  const skipEl = requireById<HTMLButtonElement>('lrSkip');
  const continueEl = requireById<HTMLButtonElement>('lrContinue');
  // Slice 4: the cycles line and the first-pick top-up, under the charge (built here: index.html keeps phase 2's skeleton).
  const cyclesEl = make('div', 'lr-cycles');
  // Playtest 1 (B-DESK, §3.6): the line says what cycles are for (`+5 CYCLES TO COMPILE · …`, the REPOSITORY's COMPILE HERE,
  // whose ledger repeats its breakdown), and its hover what they are, as the desk's bank says it.
  cyclesEl.title = TRAINING_TEXT.bankWhy;
  const topUpEl = make('div', 'lr-topup');
  cyclesEl.hidden = true;
  topUpEl.hidden = true;
  // Slice 5 (plan §2.11): the sleeper's gift under the cycles line (01's slot order: what the ship pays, then what it was
  // given), and WARDEN's goodnight under the colony and the beacon (05's story line).
  const giftEl = make('div', 'lr-gift');
  giftEl.hidden = true;
  chargeEl.after(cyclesEl, topUpEl, giftEl);
  const goodnightEl = make('div', 'lr-goodnight');
  goodnightEl.hidden = true;
  beaconEl.after(goodnightEl);
  // Slice 7a (05 §3.7): the final ship's ending line under the colony (landing-report.ts endingLine; null until FINALE).
  const endingEl = make('div', 'lr-ending');
  endingEl.hidden = true;
  colonyEl.after(endingEl);

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
      play('arrivalChoir');
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
    play('arrivalChoir');
    choirIn = REPORT_CHOIR_EVERY_SEC;
    const first = report.credits[0]!;
    play('touchdownBell', { lz: Math.max(0, report.tally.lzs.findIndex((row) => row.lz === first.lz)), landing: touchdownSound(first) });
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
    // Each figure stays with its word when the line wraps (a phone): `1,000 soft`, never `1,000 / soft`.
    breakdownEl.textContent = `${report.breakdown} · ${report.pointsText}`.replace(/(\d) /g, '$1\u00a0').replace(/-/g, '\u2011');
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
    // The world is stopped on the report, so the tally read now is the one CONTINUE applies.
    const trace = reportTraceLine(store.getState());
    traceEl.hidden = trace === null;
    traceEl.textContent = trace?.text ?? '';
    traceEl.dataset.tone = trace?.tone ?? '';
    const near = report.nearMisses.slice(0, NEAR_MISSES_SHOWN);
    nearEl.replaceChildren(...near.map((line) => make('div', 'lr-near-line', line)));
    nearEl.hidden = near.length === 0;
    showGift(report, showCycles());
    skipEl.hidden = true;
    renderKeyCaps(continueEl, report.continueText, { own: 'SPACE' });
    continueEl.classList.add('arming');
    continueEl.hidden = false;
    later(REPORT_CONTINUE_ARM_SEC, () => continueEl.classList.remove('arming'));
  }

  // Slice 4 (plan §1.1 4a item 1, §2.4): the training cycles the ship pays, on the arm, rolled up under the charge
  // (`+5 CYCLES TO COMPILE · ARRIVED +1 · LANDED 83% +4`, `… · PERFECT LANDING`, the final ship's `NO DESK AHEAD`), a tick
  // per cycle; on a run's first ship below the first-pick floor, `+2 CYCLES` under it. From
  // the same earning endShip records at CONTINUE (run-score.ts shipCycles). Reduced motion: the line stands whole.
  // Returns the seconds its roll takes (0 with no line, or under reduced motion), for the gift's line under it (slice 5).
  function showCycles(): number {
    const report = model;
    const state = store.getState();
    cyclesEl.hidden = true;
    topUpEl.hidden = true;
    if (report === null || report.aboard <= 0) return 0;
    const cycles = cyclesReport(
      shipCycles({ slot: currentSlot(state.run), points: report.points, colonistsAboard: report.aboard }),
      report.lastShip, state.run.ships.length === 0,
    );
    cyclesEl.hidden = false;
    cyclesEl.classList.toggle('perfect', cycles.total === CYCLES_ARRIVED + CYCLES_LANDED_STEPS);
    topUpEl.textContent = cycles.topUp ?? '';
    const done = (): void => {
      cyclesEl.textContent = cycles.line;
      topUpEl.hidden = cycles.topUp === null;
    };
    if (reducedMotion()) { done(); return 0; }
    cyclesEl.textContent = cycles.lineAt(0);
    for (let shown = 1; shown <= cycles.total; shown++) {
      later(REPORT_CYCLES_START_SEC + REPORT_CYCLE_STEP_SEC * shown, () => {
        cyclesEl.textContent = cycles.lineAt(shown);
        replayAnimation(cyclesEl, 'bump');
        play('typeTick', { voice: 'sys' });
        if (shown === cycles.total) done();
      });
    }
    return REPORT_CYCLES_START_SEC + REPORT_CYCLE_STEP_SEC * cycles.total;
  }

  // Slice 5 (plan R12): MOTH's gift, one step after the cycles have rolled up (`afterSec`: showCycles' roll), with a chime.
  function showGift(report: LandingReportModel, afterSec: number): void {
    const gift = report.resident.find((row) => row.kind === 'gift');
    giftEl.hidden = true;
    if (gift === undefined) return;
    giftEl.textContent = gift.text;
    if (reducedMotion()) { giftEl.hidden = false; return; }
    later(afterSec + REPORT_CYCLE_STEP_SEC, () => {
      giftEl.hidden = false;
      play('chime', { falling: false });
    });
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
    endingEl.hidden = report.endingLine === null;
    endingEl.textContent = report.endingLine ?? '';
    // Slice 3c: ship 1's beacon (05 §3.5), under the colony: the last unit was here first.
    beaconEl.hidden = report.beaconLine === null;
    beaconEl.textContent = report.beaconLine ?? '';
    // Slice 5 (R24): the resident that was not deleted says goodnight when every pod went down.
    const goodnight = report.resident.find((row) => row.kind === 'goodnight');
    goodnightEl.hidden = goodnight === undefined;
    goodnightEl.textContent = goodnight?.text ?? '';
    giftEl.hidden = true;
    creditsEl.hidden = true;
    rollEl.replaceChildren();
    breakdownEl.hidden = true;
    starsEl.hidden = true;
    chargeEl.hidden = true;
    cyclesEl.hidden = true;
    topUpEl.hidden = true;
    traceEl.hidden = true;
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

