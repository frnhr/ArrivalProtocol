import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { runEndModel, type RunEndModel, type RunEndShipRow } from '@systems/run-end';
import { startRun } from '@systems/run';
import { archiveLineage, archiveMeta, ENDINGS } from '@systems/meta';
import { newRunSeed } from '@systems/rng';
import { pushModal, registerKeys } from '@systems/input';
import { play, toggleMuted } from '@systems/audio';
import { requireById, replayAnimation, make } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { ARCHIVE_TEXT, endingsLine } from '@data/script';
import { RUN_END_TEXT } from '@data/landing-text';
import {
  RUN_END_ARM_SEC, RUN_END_ROW_GAP_SEC, RUN_END_COUNT_SEC, BEAM_OUT_BLACKOUT_SEC, STARS_PER_SHIP, REPORT_COUNT_HEARTBEAT,
} from '@data/tuning';

// RUN END (§9 WP7 item 7, §4.4): the night screen after the last ship, or after a run lost on the way.
// Top to bottom: the run and unit, the cause as a title with one line of why, the souls that woke (heads,
// rolling up; the hurt yellow line under it for missing memories), every ship of the fleet landing one by
// one with how it ended, its stars and its souls (a ship the run never reached says so), then §4.4's
// half-credit number as the run's SCORE (labelled, with what it counts) and the rank it earns, up to two
// near misses, the seed, and NEW RUN ▸, which starts a fresh run in the page (systems/run.ts startRun: the
// title card again, never a reload). When the archive did not keep the run (OFFLINE, PLAY WITHOUT) the last
// line says the next unit will not remember it (WP8). Presentation on wall time, like the WAKE REPORT; the world is
// stopped. After a BEAM OUT it waits for the old ship's windows to go black first.
// Reduced motion: the rows and lines fade in place and the count is shown whole.
// WP11 part 2 (the lead's item 2: the tone is the cause's): a won finale is the only celebratory screen. Its title takes
// the ending's colour (PURGE a cold white, MERGE HOLLOW's pink running into the mind's blue), an orbit ring breathes
// behind it, the endings found so far stand under it (`ENDINGS 1/2 · PURGE · ???`: there is another way), and a MERGE
// says what it carries into the next run. Every other ending is sombre: a grey night, the title in the warning colour,
// the count plain (no green glow), a falling tone instead of the choir.

function starsText(earned: number): string {
  return '★'.repeat(earned) + '☆'.repeat(Math.max(0, STARS_PER_SHIP - earned));
}

// The count rolls up in steps this big, so it reads as people arriving, not as a blur of digits.
const COUNT_STEP_SOULS = 100;

function shipRowNode(row: RunEndShipRow): HTMLElement {
  const node = make('div', `re-ship outcome-${row.outcome ?? 'none'}`);
  node.append(
    make('span', 're-ship-n', String(row.index + 1)),
    make('span', 're-ship-name', row.shipName),
    make('span', 're-ship-outcome', row.outcomeWord),
    make('span', 're-ship-stars', row.result ? starsText(row.result.stars) : ''),
    make('span', 're-ship-woke', row.landedLine),
    // Slice 1a: the ship's landing points beside its LANDED (the run's SCORE is their sum).
    make('span', 're-ship-points', row.result ? RUN_END_TEXT.shipPoints(row.result.points) : ''),
  );
  return node;
}

export function mountRunEnd(store: Store<GameState>): () => void {
  const root = requireById('runEnd');
  const kickerEl = requireById('reKicker');
  const titleEl = requireById('reTitle');
  const whyEl = requireById('reWhy');
  const endingsEl = requireById('reEndings');
  const carryEl = requireById('reCarry');
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

  // The count rolls up to the run's WOKE (heads), then the missing-memories line lands under it.
  function rollCount(report: RunEndModel): void {
    if (reducedMotion()) {
      totalEl.textContent = report.totalLine;
      return;
    }
    const startMs = performance.now();
    const tick = (now: number): void => {
      const fraction = Math.min(1, (now - startMs) / 1000 / RUN_END_COUNT_SEC);
      const shown = Math.round((report.landed * fraction) / COUNT_STEP_SOULS) * COUNT_STEP_SOULS;
      totalEl.textContent = RUN_END_TEXT.total(fraction < 1 ? shown : report.landed, report.fleetColonists);
      frame = fraction < 1 ? requestAnimationFrame(tick) : null;
    };
    frame = requestAnimationFrame(tick);
  }

  function show(report: RunEndModel): void {
    root.hidden = false;
    root.classList.toggle('reduced', reducedMotion());
    const victory = report.tone === 'victory';
    root.classList.toggle('tone-victory', victory);
    root.classList.toggle('tone-sombre', !victory);
    root.classList.toggle('ending-purge', report.ending === 'purge');
    root.classList.toggle('ending-merge', report.ending === 'merge');
    play(victory ? 'revealChoir' : 'soulLost');
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
    const report = runEndModel(state);
    model = report;
    stopTimers();
    if (!closeModal) closeModal = pushModal('end');
    kickerEl.textContent = report.kicker;
    titleEl.textContent = report.title;
    whyEl.textContent = report.why;
    // The archive's session copy: this run's ending is already in it (recorded as the run ended).
    const endings = report.ending === null || state.archive.status === 'none' ? null : endingsLine(archiveMeta().endingsSeen, ENDINGS);
    endingsEl.hidden = endings === null;
    endingsEl.textContent = endings ?? '';
    carryEl.hidden = report.carryLine === null;
    carryEl.textContent = report.carryLine ?? '';
    totalEl.textContent = RUN_END_TEXT.total(0, report.fleetColonists);
    missingEl.textContent = '';
    missingEl.hidden = true;
    shipsEl.replaceChildren(...report.ships.map(shipRowNode));
    scoreEl.textContent = report.scoreLine;
    scoreNoteEl.textContent = RUN_END_TEXT.scoreNote;
    rankEl.textContent = report.rankLine;
    nearEl.replaceChildren(...report.nearMisses.map((line) => make('div', 're-near-line', line)));
    seedEl.textContent = report.seedLine;
    const archive = state.archive.status;
    const archiveLine = archive === 'ok' || archive === 'none' ? null : ARCHIVE_TEXT.runEnd[archive];
    archiveEl.hidden = archiveLine === null;
    archiveEl.textContent = archiveLine ?? '';
    renderKeyCaps(newBtn, RUN_END_TEXT.newRun, { own: 'SPACE' });
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
    closeModal?.();
    closeModal = null;
  }

  // NEW RUN: a fresh run in the page (the title card again), once the screen has been up long enough. The
  // next unit is the archive's (UNIT-048 after UNIT-047, with its ghost), kept or not (state.archive).
  function newRun(): void {
    if (!model || performance.now() < inputFromMs) return;
    startRun(store, newRunSeed(), archiveLineage());
  }

  const onNew = (event: MouseEvent): void => { event.stopPropagation(); newRun(); };
  newBtn.addEventListener('click', onNew);
  const offKeys = registerKeys({ layer: 'end', codes: ['Space', 'Enter'], onDown: newRun });
  const offMute = registerKeys({ layer: 'end', codes: ['KeyM'], onDown: () => toggleMuted() });
  const unsub = store.subscribe((s) => s.run.phase, (phase) => {
    if (phase === 'end') open();
    else close();
  });
  if (store.getState().run.phase === 'end') open();

  return () => {
    newBtn.removeEventListener('click', onNew);
    offKeys();
    offMute();
    unsub();
    close();
  };
}

