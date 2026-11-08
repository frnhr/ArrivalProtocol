// Slice 7a: Track NIGHT owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §4.1, §5.1; R19): the RUN
// TALLY loses its ending block and the bridge (both move to the FINAL CARD), and its button goes on to the EPILOGUE: it
// reads EPILOGUE ▸ and sets ui.runEndStage 'epilogue' (the keys answer only on the tally). The tally steps aside
// (`night-on`) while the EPILOGUE and the FINAL CARD are up; its modal layer stays open under them. (The 7a fix pass dropped
// the night gate and the tally's own NEW RUN, endings line and bridge: review (e).)
// Slice 4: Track UI's UNSPENT stands. Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { runEndModel, type RunEndModel, type RunEndShipRow, type RunEndNext } from '@systems/run-end';
import { setRunEndStage } from '@systems/run';
import { EPILOGUE_TEXT } from '@data/epilogue-text';
import { archiveMeta } from '@systems/meta';
import { pushModal, registerKeys } from '@systems/input';
import { play, toggleMuted } from '@systems/audio';
import { requireById, replayAnimation, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { ARCHIVE_TEXT } from '@data/script';
import { RUN_END_TEXT } from '@data/landing-text';
import { chartModel } from '@systems/desk';
import { drawChart, LANDSCAPE_ROTATE_DEG } from '@components/desk/chart-draw';
import { MAP_TEXT } from '@data/map-text';
import {
  RUN_END_ARM_SEC, RUN_END_ROW_GAP_SEC, RUN_END_COUNT_SEC, BEAM_OUT_BLACKOUT_SEC, STARS_PER_SHIP, REPORT_COUNT_HEARTBEAT,
} from '@data/tuning';

// RUN END (§9 WP7 item 7, §4.4): the night screen after the last ship, or after a run lost on the way.
// Top to bottom: the run and unit, the cause as a title with one line of why, the colonists who landed
// (rolling up), every ship of the fleet landing one by
// one with how it ended, its stars, its LANDED and its points (a ship the run never reached says so), then §4.4's
// half-credit number as the run's SCORE (labelled, with what it counts) and the rank it earns, up to two
// near misses, the seed, and EPILOGUE ▸ (slice 7a: NEW RUN is the FINAL CARD's). When the archive did not keep the run (OFFLINE, PLAY WITHOUT) the last
// line says the next unit will not remember it (WP8). Presentation on wall time, like the LANDING REPORT; the world is
// stopped. After a BEAM OUT it waits for the old ship's windows to go black first.
// Reduced motion: the rows and lines fade in place and the count is shown whole.
// WP11 part 2 (the lead's item 2: the tone is the cause's): a won finale is the only celebratory screen. Its title takes
// the ending's colour (PURGE a cold white, MERGE HOLLOW's pink running into the mind's blue), an orbit ring breathes
// behind it (slice 7a: the endings found are the FINAL CARD's). Every other ending is sombre: a grey night, the title in the warning colour,
// the count plain (no green glow), a falling tone instead of the choir.
// Phase 3 slice 3a (02-map §4): the ships become the RUN TALLY: one row per ship the run visited (`3 · KESTREL · 2467`,
// its outcome, stars, LANDED and points; a ship the route never took has no row), beside the route on a small chart
// (the STAR CHART's drawing, the visited ships numbered), and `n COLONIES FOUNDED` under it.

function starsText(earned: number): string {
  return '★'.repeat(earned) + '☆'.repeat(Math.max(0, STARS_PER_SHIP - earned));
}

// The count rolls up in steps this big, so it reads as people arriving, not as a blur of digits.
const COUNT_STEP_COLONISTS = 100;

function shipRowNode(row: RunEndShipRow): HTMLElement {
  const node = make('div', `re-ship outcome-${row.outcome}${row.colony ? ' colony' : ''}`);
  node.setAttribute('aria-label', row.tallyLine);
  const name = make('span', 're-ship-name', row.shipName);
  name.appendChild(make('span', 're-ship-year', ` · ${row.year}`));
  node.append(
    make('span', 're-ship-n', String(row.depth)),
    name,
    make('span', 're-ship-outcome', row.outcomeWord),
    make('span', 're-ship-stars', starsText(row.result.stars)),
    make('span', 're-ship-landed', row.landedLine),
    // Slice 1a: the ship's landing points beside its LANDED (the run's SCORE is their sum).
    make('span', 're-ship-points', RUN_END_TEXT.shipPoints(row.result.points)),
  );
  return node;
}

// The RUN TALLY's frame (slice 3a), built round index.html's ship list: its title, the list, and the route's mini chart
// with the colonies line.
interface TallyParts {
  title: HTMLElement;
  chart: HTMLElement;
  svg: SVGSVGElement;
  colonies: HTMLElement;
  undelivered: HTMLElement;
  skills: HTMLElement;
  next: HTMLElement;
}

// Slice 3c: the world update's summary under the route (who launches next and when, the arm's turnover, the valve, the
// ships that moved on), or nothing on the classic world.
function paintNext(host: HTMLElement, next: Readonly<RunEndNext> | null): void {
  host.hidden = next === null;
  if (next === null) { host.replaceChildren(); return; }
  const leave = next.departures;
  host.replaceChildren(
    make('div', 're-next-line', next.line),
    ...(next.valve === null ? [] : [make('div', 're-next-valve', next.valve)]),
    ...(next.summary === null ? [] : [make('div', 're-next-summary', next.summary)]),
    ...(leave === null ? [] : [
      ...leave.lines.map((line) => make('div', 're-next-leave', line)),
      ...(leave.more === null ? [] : [make('div', 're-next-leave more', leave.more)]),
    ]),
  );
  if (leave !== null) host.title = leave.all.join('\n');
}

function buildTally(shipsEl: HTMLElement): TallyParts {
  const tally = make('div', 're-tally');
  const title = make('div', 're-tally-title');
  shipsEl.before(tally);
  const side = make('div', 're-tally-side');
  const chart = make('div', 're-tally-chart');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'star-chart mini');
  chart.appendChild(svg);
  const colonies = make('div', 're-tally-colonies');
  // Slice 3b: the files that never arrived (02 §3.9), under the colonies.
  const undelivered = make('div', 're-tally-undelivered');
  // Slice 3c: the world update's summary (paintNext).
  const next = make('div', 're-tally-next');
  // Slice 4 (02 §4, 03 §3.1): the tree's line, `TRAINED 12 of 54 · UNSPENT 3`, under the files that never arrived.
  const skills = make('div', 're-tally-skills');
  side.append(make('div', 're-tally-route', MAP_TEXT.tally.route), chart, colonies, undelivered, skills, next);
  const list = make('div', 're-tally-list');
  list.append(title, shipsEl);
  tally.append(list, side);
  return { title, chart, svg, colonies, undelivered, skills, next };
}

export function mountRunEnd(store: Store<GameState>): () => void {
  const root = requireById('runEnd');
  const kickerEl = requireById('reKicker');
  const titleEl = requireById('reTitle');
  const whyEl = requireById('reWhy');
  const totalEl = requireById('reTotal');
  const missingEl = requireById('reMissing');
  const shipsEl = requireById('reShips');
  const scoreEl = requireById('reScore');
  const scoreNoteEl = requireById('reScoreNote');
  const rankEl = requireById('reRank');
  const nearEl = requireById('reNear');
  const seedEl = requireById('reSeed');
  const archiveEl = requireById('reArchive');
  const newBtn = requireById<HTMLButtonElement>('reNew');
  const tally = buildTally(shipsEl);
  // Slice 4: RUN END's `UNSPENT n`, under the rank.
  const unspentEl = make('div', 're-unspent');
  unspentEl.hidden = true;
  rankEl.after(unspentEl);

  let model: RunEndModel | null = null;
  let closeModal: (() => void) | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let frame: number | null = null;
  let inputFromMs = Infinity;
  const later = (sec: number, action: () => void): void => { timers.push(setTimeout(action, sec * 1000)); };
  const reducedMotion = (): boolean => store.getState().ui.reducedMotion;
  const stopTimers = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  // The count rolls up to the run's LANDED (colonists in an LZ with room).
  function rollCount(report: RunEndModel): void {
    if (reducedMotion()) {
      totalEl.textContent = report.totalLine;
      return;
    }
    const startMs = performance.now();
    const tick = (now: number): void => {
      const fraction = Math.min(1, (now - startMs) / 1000 / RUN_END_COUNT_SEC);
      const shown = Math.round((report.landed * fraction) / COUNT_STEP_COLONISTS) * COUNT_STEP_COLONISTS;
      totalEl.textContent = RUN_END_TEXT.total(fraction < 1 ? shown : report.landed, report.fleetColonists);
      frame = fraction < 1 ? requestAnimationFrame(tick) : null;
    };
    frame = requestAnimationFrame(tick);
  }

  // The route on the tally's mini chart, at the box's size now (nothing while it has none: the resize observer draws it
  // as soon as it is laid out).
  function drawTallyChart(): void {
    const width = tally.chart.clientWidth;
    const height = tally.chart.clientHeight;
    if (width < 40 || height < 40 || model === null || root.hidden) return;
    drawChart(tally.svg, chartModel(store.getState()), {
      width, height, rotateDeg: LANDSCAPE_ROTATE_DEG, labels: 'route', beams: false, clouds: false, rings: false,
      trail: false, route: true, stars: true, idPrefix: 'tally',
    });
  }
  const chartResize = new ResizeObserver(() => drawTallyChart());
  chartResize.observe(tally.chart);

  function show(report: RunEndModel): void {
    root.hidden = false;
    requestAnimationFrame(() => { if (model === report) drawTallyChart(); });
    root.classList.toggle('reduced', reducedMotion());
    const victory = report.tone === 'victory';
    root.classList.toggle('tone-victory', victory);
    root.classList.toggle('tone-sombre', !victory);
    root.classList.toggle('ending-purge', report.ending === 'purge');
    root.classList.toggle('ending-merge', report.ending === 'merge');
    play(victory ? 'arrivalChoir' : 'sombreFall');
    rollCount(report);
    const rows = Array.from(shipsEl.children) as HTMLElement[];
    rows.forEach((row, i) => later(RUN_END_ROW_GAP_SEC * (i + 1), () => {
      row.classList.add('landed');
      // A ship whose colonists landed comes in with a heartbeat; one that landed nobody, or was never reached, in
      // silence.
      const result = report.ships[i]?.result;
      if (result && result.landedInLz > 0) play('heartbeat', { strength: REPORT_COUNT_HEARTBEAT.woke });
    }));
    const afterRows = RUN_END_ROW_GAP_SEC * (rows.length + 1);
    later(Math.max(afterRows, RUN_END_COUNT_SEC), () => {
      root.classList.add('scored');
      if (!reducedMotion()) replayAnimation(rankEl, 'land');
      play('stampHit', { heavy: !victory });
      if (victory) play('lockArp');
    });
    inputFromMs = performance.now() + RUN_END_ARM_SEC * 1000;
    later(RUN_END_ARM_SEC, () => newBtn.classList.remove('arming'));
  }

  function open(): void {
    if (model) return;
    const state = store.getState();
    // The arm the world update made (the archive's; only an archive the page keeps has it): the tally's turnover.
    const report = runEndModel(state, state.archive.status === 'ok' ? archiveMeta().arm : null);
    model = report;
    stopTimers();
    if (!closeModal) closeModal = pushModal('end');
    kickerEl.textContent = report.kicker;
    titleEl.textContent = report.title;
    whyEl.textContent = report.why;
    totalEl.textContent = RUN_END_TEXT.total(0, report.fleetColonists);
    missingEl.textContent = '';
    missingEl.hidden = true;
    shipsEl.replaceChildren(...report.ships.map(shipRowNode));
    tally.title.textContent = report.tallyTitle;
    tally.colonies.textContent = report.coloniesLine;
    tally.undelivered.hidden = report.undeliveredLine === null;
    tally.undelivered.textContent = report.undeliveredLine ?? '';
    // Slice 4: the cycles left unspent (decision 18: only shown) under the rank, and the tally's TRAINED line; the arm only.
    // (run-end.ts RunEndModel.skills, Track TREE's; null on the classic world.)
    const skillLines = report.skills;
    tally.skills.hidden = skillLines === null;
    tally.skills.textContent = skillLines?.tallyLine ?? '';
    unspentEl.hidden = skillLines === null;
    unspentEl.textContent = skillLines?.unspentLine ?? '';
    paintNext(tally.next, report.next);
    // The route's mini chart is drawn once the screen shows (show(): its size is the CSS box's, and a hidden box has none:
    // drawn here, under a BEAM OUT's delayed show, it was often empty; the e2e run), and again on a resize.
    tally.svg.replaceChildren();
    scoreEl.textContent = report.scoreLine;
    scoreNoteEl.textContent = RUN_END_TEXT.scoreNote;
    rankEl.textContent = report.rankLine;
    nearEl.replaceChildren(...report.nearMisses.map((line) => make('div', 're-near-line', line)));
    seedEl.textContent = report.seedLine;
    const archive = state.archive.status;
    const archiveLine = archive === 'ok' || archive === 'none' ? null : ARCHIVE_TEXT.runEnd[archive];
    archiveEl.hidden = archiveLine === null;
    archiveEl.textContent = archiveLine ?? '';
    renderKeyCaps(newBtn, EPILOGUE_TEXT.tallyOn, { own: 'SPACE' });
    newBtn.classList.add('arming');
    root.classList.remove('scored');
    inputFromMs = Infinity;
    // After a BEAM OUT the old ship's windows go black first (the unit just left it).
    const delay = state.burn.status === 'abandoned' ? BEAM_OUT_BLACKOUT_SEC : 0;
    later(delay, () => { if (model === report) show(report); });
  }

  function close(): void {
    if (!model) return;
    model = null;
    stopTimers();
    root.hidden = true;
    root.classList.remove('night-on');
    closeModal?.();
    closeModal = null;
  }

  // EPILOGUE ▸ (R19), once the screen has been up long enough: the night goes on (the FINAL CARD starts the next run).
  function newRun(): void {
    if (!model || performance.now() < inputFromMs || store.getState().ui.runEndStage !== 'tally') return;
    setRunEndStage(store, 'epilogue');
  }

  const onNew = (event: MouseEvent): void => { event.stopPropagation(); newRun(); };
  newBtn.addEventListener('click', onNew);
  const offKeys = registerKeys({ layer: 'end', codes: ['Space', 'Enter', 'NumpadEnter'], onDown: newRun });
  const offMute = registerKeys({ layer: 'end', codes: ['KeyM'], onDown: () => toggleMuted() });
  const unsub = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'end') open();
    else close();
  });
  if (store.getState().run.phase === 'end') open();
  // Slice 7a (R19): the EPILOGUE and the FINAL CARD stand in the tally's place (its modal layer stays theirs: the 'end' keys).
  const unsubStage = store.subscribe((s) => s.ui.runEndStage, (stage) => {
    if (model !== null) root.classList.toggle('night-on', stage !== 'tally');
  });

  return () => {
    newBtn.removeEventListener('click', onNew);
    offKeys();
    offMute();
    unsub();
    unsubStage();
    chartResize.disconnect();
    close();
  };
}

