// Slice 3c: Track UI owns this file (docs/phase3/impl/slice-3c-plan.md §5.3); WORLD and SAVE request words by message.
import type { Store } from '@state/store';
import type { GameState, RunPhase, ArchiveStatus } from '@state/schema';
import { receiveTransmission, skipBoot } from '@systems/boot';
import { archiveMeta, wipeArchive, playWithoutArchive, isFirstRun, archiveNotesSaid } from '@systems/meta';
import { builtPieces } from '@data/endings';
import type { EndingPiece } from '@/types/ending';
import { resumeRun, abandonRun } from '@systems/run-save';
import { registerKeys } from '@systems/input';
import {
  titleModel, titleEnterAction, titleAbandonKey, TITLE_ABANDON_CODES, type TitleModel, type TitleNotes, type TitleSaveButton,
  type TitleSaveAction,
} from '@systems/title';
import { play, unlockAudio } from '@systems/audio';
import { requireById, make, replayAnimation } from '@components/dom';
import { renderKeyCaps } from '@components/hud/keycaps';
import { ARCHIVE_TEXT, lineageLine } from '@data/script';
import {
  BOOT_ASSEMBLE_SEC, BOOT_ASSEMBLE_SETTLE_SEC, TITLE_LAUNCH_ROLL_DELAY_SEC, TITLE_LAUNCH_ROLL_SEC, TITLE_LAUNCH_STAMP_AFTER_SEC,
} from '@data/tuning';
import { chartModel } from '@systems/desk';
import { drawChart, LANDSCAPE_ROTATE_DEG, PORTRAIT_ROTATE_DEG } from '@components/desk/chart-draw';
import { MAP_TEXT } from '@data/map-text';

// The title card and the boot overlay (§5.1, §7.1). The title is a black card over everything
// with one button, RECEIVE TRANSMISSION; the click unlocks audio (systems/boot calls the hook)
// and starts the boot. During the boot the card turns into a transparent click catcher (any
// click skips) while the memory strip assembles rack by rack, one soft tick per row. The logic
// (phases, timing, keys) is in systems/boot.ts; this is the view.
// The archive on the title (§4.5, §7.1, WP8): a returning unit's lineage line (`last: UNIT-047 · 6,200 landed ·
// overwritten at HALCYON`, in HOLLOW's pink: that unit is what is waiting in the memory) and ENDINGS n/2. When
// the archive is not behind the page it says so in the warning red: OFFLINE (the browser will not keep
// anything), PLAYING WITHOUT ARCHIVE, or CORRUPT, which offers WIPE ARCHIVE or PLAY WITHOUT ARCHIVE; RECEIVE
// TRANSMISSION stays (it plays without the archive, systems/boot.ts), so a kid is never held at the title by
// a question about saving. Never a quiet reset: the red box stays up until the run starts.
// Phase 3 slice 3a (02-map §2, §4; 05 §3.12): the STAR CHART sits faint behind the logo (SOL at the lower left, the band
// of stars, the final ship's amber beacon `FINAL SHIP · LAST LIGHT · 3020`) under `ARRIVAL PROTOCOL // OUTWARD BOUND`
// and `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`; RECEIVE TRANSMISSION draws the beam from SOL to the first ship as
// the card clears (reduced motion: no draw, the chart just fades).
// Slice 3c (02 §3.11, §4; 05 §3.12; systems/title.ts titleModel): from run 2 the line says when this unit launched after the
// last (`UNIT-048 · YEAR 2303 · LAUNCHED 3 YEARS AFTER UNIT-047`), its year and gap rolling up from the last unit's start
// before the gap's stamp lands, and the faint chart carries the last unit's trail. The run save's block: RESUME ▸ [ENTER]
// and NEW RUN (which asks first: ABANDON RUN [ENTER] / KEEP IT [ESC]), or CAN'T RESUME with ABANDON RUN only, or RUN SAVE
// OFFLINE; RECEIVE TRANSMISSION is hidden while a save is there. `runs save between ships` under it, and the archive's
// one-off notes, cleared (archiveNotesSaid) once the kid leaves the title.
export function mountTitleCard(store: Store<GameState>): () => void {
  const root = requireById('titleCard');
  const receiveBtn = requireById<HTMLButtonElement>('titleReceive');
  const unitEl = requireById('titleUnit');
  const archiveEl = requireById('titleArchive');
  const archiveLine = requireById('titleArchiveLine');
  const archiveDetail = requireById('titleArchiveDetail');
  const archiveChoices = requireById('titleArchiveChoices');
  const archiveHints = requireById('titleArchiveHints');
  const wipeBtn = requireById<HTMLButtonElement>('titleWipe');
  const withoutBtn = requireById<HTMLButtonElement>('titlePlayWithout');
  const lineageEl = requireById('titleLineage');
  const endingsEl = requireById('titleEndings');
  const stampEl = requireById('titleStamp');
  const saveEl = requireById('titleSave');
  const saveLine = requireById('titleSaveLine');
  const saveAsk = requireById('titleSaveAsk');
  const resumeBtn = requireById<HTMLButtonElement>('titleResume');
  const newRunBtn = requireById<HTMLButtonElement>('titleNewRun');
  const abandonBtn = requireById<HTMLButtonElement>('titleAbandon');
  const keepBtn = requireById<HTMLButtonElement>('titleKeep');
  const notesEl = requireById('titleNotes');
  const noteEl = requireById('titleNote');
  const memWrap = requireById('memWrap');
  const subEl = root.querySelector<HTMLElement>('.title-sub');
  if (!subEl) throw new Error('TitleCard: index.html lost .title-sub');
  // `ARRIVAL PROTOCOL // OUTWARD BOUND`: the h1 keeps the name, the sub line takes the rest.
  subEl.textContent = MAP_TEXT.title.logo.replace(/^ARRIVAL PROTOCOL\s*/, '');
  const chartHost = document.createElement('div');
  chartHost.className = 'title-chart';
  chartHost.setAttribute('aria-hidden', 'true');
  const chartSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chartSvg.setAttribute('class', 'star-chart');
  chartHost.appendChild(chartSvg);
  root.prepend(chartHost);
  const paintChart = (): void => {
    const state = store.getState();
    if (state.run.phase !== 'title' && state.run.phase !== 'boot') return;
    const width = chartHost.clientWidth;
    const height = chartHost.clientHeight;
    if (width < 40 || height < 40) return;
    const portrait = width < height;
    drawChart(chartSvg, chartModel(state), {
      width, height, rotateDeg: portrait ? PORTRAIT_ROTATE_DEG : LANDSCAPE_ROTATE_DEG, labels: 'beacon', beams: false, clouds: true,
      rings: true, trail: state.run.map.run > 1, route: false, stars: true, beamFromSol: true, idPrefix: 'title',
    });
  };
  const chartResize = new ResizeObserver(paintChart);
  chartResize.observe(chartHost);

  wipeBtn.textContent = ARCHIVE_TEXT.wipe;
  withoutBtn.textContent = ARCHIVE_TEXT.playWithout;
  archiveHints.replaceChildren(make('div', 'title-archive-hint', ARCHIVE_TEXT.wipeHint), make('div', 'title-archive-hint', ARCHIVE_TEXT.withoutHint));

  // The archive's one-off notes, while an archive is behind the page (a headless world has none).
  const notesNow = (): TitleNotes | null => (store.getState().archive.status === 'none' ? null : archiveMeta().notes);
  let model: TitleModel = titleModel(store.getState(), notesNow());
  // The launch line's roll (run 2+): once per run's title (its seed and unit), then the line stays settled.
  let rolledFor = '';
  let rollTimers: ReturnType<typeof setTimeout>[] = [];
  let rollFrame: number | null = null;
  let rolling = false;
  const stopRoll = (): void => {
    rollTimers.forEach(clearTimeout);
    rollTimers = [];
    if (rollFrame !== null) cancelAnimationFrame(rollFrame);
    rollFrame = null;
    rolling = false;
  };
  const settleLaunch = (): void => {
    rolling = false;
    unitEl.textContent = model.unitLine;
    stampEl.hidden = model.launch === null;
    stampEl.textContent = model.launch?.stamp ?? '';
  };
  function rollLaunch(): void {
    const launch = model.launch;
    const state = store.getState();
    const key = `${state.run.seed}|${state.run.unitNumber}`;
    if (launch === null || key === rolledFor) { if (!rolling) settleLaunch(); return; }
    rolledFor = key;
    stopRoll();
    if (state.ui.reducedMotion || launch.years === 0) { settleLaunch(); return; }
    rolling = true;
    stampEl.hidden = true;
    const lineAt = (fraction: number): string => {
      const gap = Math.round(launch.years * fraction);
      return MAP_TEXT.title.launched(model.unit, launch.fromYear + gap, gap, launch.last);
    };
    unitEl.textContent = lineAt(0);
    rollTimers.push(setTimeout(() => {
      const startMs = performance.now();
      let shown = 0;
      const tick = (now: number): void => {
        const fraction = Math.min(1, (now - startMs) / 1000 / TITLE_LAUNCH_ROLL_SEC);
        const gap = Math.round(launch.years * fraction);
        unitEl.textContent = lineAt(fraction);
        if (gap !== shown) { shown = gap; play('typeTick', { voice: 'sys' }); }
        if (fraction < 1) { rollFrame = requestAnimationFrame(tick); return; }
        rollFrame = null;
        rollTimers.push(setTimeout(() => {
          settleLaunch();
          replayAnimation(stampEl, 'land');
          play('stampHit', { heavy: false });
        }, TITLE_LAUNCH_STAMP_AFTER_SEC * 1000));
      };
      rollFrame = requestAnimationFrame(tick);
    }, TITLE_LAUNCH_ROLL_DELAY_SEC * 1000));
  }

  // The run save's block (systems/title.ts): `asking` while NEW RUN's inline confirm is up.
  let asking = false;
  renderKeyCaps(resumeBtn, MAP_TEXT.save.resumeKey);
  newRunBtn.textContent = MAP_TEXT.save.newRun;
  renderKeyCaps(keepBtn, MAP_TEXT.save.keepKey);
  const paintSave = (): void => {
    const block = model.save;
    saveEl.hidden = block === null;
    saveEl.dataset.kind = block?.kind ?? '';
    saveLine.textContent = block?.line ?? '';
    if (block?.kind !== 'resume') asking = false;
    saveAsk.hidden = !asking;
    saveAsk.textContent = block?.kind === 'resume' ? block.confirm : '';
    resumeBtn.hidden = block?.kind !== 'resume' || asking;
    newRunBtn.hidden = block?.kind !== 'resume' || asking;
    abandonBtn.hidden = !(block?.kind === 'cant-resume' || asking);
    keepBtn.hidden = !asking;
    renderKeyCaps(abandonBtn, asking ? MAP_TEXT.save.abandonAskKey : MAP_TEXT.save.abandonKey);
    receiveBtn.hidden = !model.receive;
    noteEl.hidden = model.saveNote === null;
    noteEl.textContent = model.saveNote ?? '';
    notesEl.hidden = model.notes.length === 0;
    notesEl.replaceChildren(...model.notes.map((note) => make('div', 'title-notes-line', note)));
  };

  // The unit and wave of the run (a NEW RUN starts over with its own), and for a returning unit the one
  // before it and the endings found.
  const paintUnit = (): void => {
    const state = store.getState();
    model = titleModel(state, notesNow());
    if (state.run.phase === 'title') rollLaunch();
    else settleLaunch();
    paintSave();
    const lineage = lineageLine(state.run.lastUnit);
    lineageEl.hidden = lineage === null;
    lineageEl.textContent = lineage ?? '';
    lineageEl.classList.toggle('stayed', state.run.lastUnit?.cause === 'stayed');
    // The endings live in the archive's session copy, which every browser page opens (state/instance.ts).
    const returning = !isFirstRun(state.run);
    endingsEl.hidden = !returning;
    // Slice 7a (Track NIGHT, R22): the line counts the built pieces, `ENDINGS n/6` (n/7 once CONTACT is built).
    const pieces: readonly EndingPiece[] = builtPieces();
    const seen = returning ? pieces.filter((ending) => archiveMeta().endingsSeen.includes(ending)) : [];
    endingsEl.textContent = returning ? ARCHIVE_TEXT.endings(seen.length, pieces.length) : '';
    // WP11 part 2: lit once an ending has been found (the FINAL CARD names them).
    endingsEl.classList.toggle('found', seen.length > 0);
  };
  paintUnit();

  // The archive's status (§4.5: storage failure is loud). `wiped`: the kid just answered CORRUPT with WIPE,
  // and the title says the fresh archive took (until the run starts).
  let wiped = false;
  const ARCHIVE_LINE: Readonly<Record<ArchiveStatus, string | null>> = {
    ok: null,
    none: null,
    offline: ARCHIVE_TEXT.offline,
    corrupt: ARCHIVE_TEXT.corrupt,
    without: ARCHIVE_TEXT.without,
  };
  const ARCHIVE_DETAIL: Readonly<Record<ArchiveStatus, string | null>> = {
    ok: null,
    none: null,
    offline: ARCHIVE_TEXT.offlineDetail,
    corrupt: ARCHIVE_TEXT.corruptDetail,
    without: null,
  };
  const paintArchive = (): void => {
    const status = store.getState().archive.status;
    const line = wiped && status === 'ok' ? ARCHIVE_TEXT.wiped : ARCHIVE_LINE[status];
    const detail = ARCHIVE_DETAIL[status];
    const asking = status === 'corrupt';
    archiveEl.hidden = line === null;
    archiveEl.classList.toggle('wiped', wiped && status === 'ok');
    archiveLine.textContent = line ?? '';
    archiveDetail.hidden = detail === null;
    archiveDetail.textContent = detail ?? '';
    archiveChoices.hidden = !asking;
    archiveHints.hidden = !asking;
  };
  paintArchive();
  const unsubArchive = store.subscribe((s) => s.archive.status, () => { paintArchive(); paintUnit(); });

  // CORRUPT's two answers (systems/meta.ts): the status changes, and the title follows it.
  // Each answer is a click: the gesture that lets the page make sound (the chime says it took).
  const onWipe = (event: MouseEvent): void => {
    event.stopPropagation();
    unlockAudio();
    wiped = true;
    wipeArchive(store);
    play('chime', { falling: false });
  };
  const onWithout = (event: MouseEvent): void => {
    event.stopPropagation();
    unlockAudio();
    playWithoutArchive(store);
    play('chime', { falling: true });
  };
  wipeBtn.addEventListener('click', onWipe);
  withoutBtn.addEventListener('click', onWithout);

  const onReceive = (event: MouseEvent): void => {
    event.stopPropagation();
    receiveTransmission(store);
  };
  // The second click of a double-click on RECEIVE lands here (the button no longer takes
  // clicks once booting): it is not a request to skip. boot.ts also has a grace period.
  const onCardClick = (event: MouseEvent): void => {
    if (event.detail > 1) return;
    skipBoot(store);
  };
  receiveBtn.addEventListener('click', onReceive);
  root.addEventListener('click', onCardClick);

  // The run save's answers (systems/run-save.ts): each a click or a key, the gesture that lets the page make sound.
  const onTitle = (): boolean => store.getState().run.phase === 'title';
  const resume = (): void => {
    if (!onTitle() || model.save?.kind !== 'resume' || asking) return;
    unlockAudio();
    resumeRun(store);
  };
  const ask = (): void => {
    if (!onTitle() || model.save?.kind !== 'resume') return;
    unlockAudio();
    asking = true;
    paintSave();
    play('buzz');
  };
  const keep = (): void => {
    if (!asking) return;
    asking = false;
    paintSave();
    play('chime', { falling: false });
  };
  const abandon = (): void => {
    if (!onTitle() || !(asking || model.save?.kind === 'cant-resume')) return;
    unlockAudio();
    asking = false;
    abandonRun(store);
  };
  const clicked = (action: () => void) => (event: MouseEvent): void => { event.stopPropagation(); action(); };
  const onResume = clicked(resume);
  const onNewRun = clicked(ask);
  const onKeep = clicked(keep);
  const onAbandon = clicked(abandon);
  resumeBtn.addEventListener('click', onResume);
  newRunBtn.addEventListener('click', onNewRun);
  keepBtn.addEventListener('click', onKeep);
  abandonBtn.addEventListener('click', onAbandon);
  // ENTER (systems/title.ts titleEnterAction): RESUME, ABANDON RUN on CAN'T RESUME (its only way on), KEEP IT on NEW RUN's
  // confirm, and nothing more over a focused button (the browser clicks it: NEW RUN focused asks, never resumes). [DEL] is
  // the confirm's deliberate ABANDON RUN; ESC takes the confirm back. RECEIVE TRANSMISSION's own ENTER and SPACE
  // (systems/boot.ts) refuse while a save is there (receiveTransmission's guard, review fix B2).
  const SAVE_BUTTONS: readonly [HTMLButtonElement, TitleSaveButton][] = [
    [resumeBtn, 'resume'], [newRunBtn, 'new-run'], [abandonBtn, 'abandon'], [keepBtn, 'keep'],
  ];
  const focused = (): TitleSaveButton | null => SAVE_BUTTONS.find(([btn]) => !btn.hidden && document.activeElement === btn)?.[1] ?? null;
  const act = (action: TitleSaveAction | null): void => {
    if (action === 'resume') resume();
    else if (action === 'ask') ask();
    else if (action === 'abandon') abandon();
    else if (action === 'keep') keep();
  };
  const offKeys = [
    registerKeys({
      layer: 'title', codes: ['Enter', 'NumpadEnter'],
      onDown: () => { if (onTitle()) act(titleEnterAction(model.save, asking, focused())); },
    }),
    registerKeys({
      layer: 'title', codes: TITLE_ABANDON_CODES,
      onDown: () => { if (onTitle()) act(titleAbandonKey(model.save, asking)); },
    }),
    registerKeys({ layer: 'title', codes: ['Escape'], onDown: keep }),
  ];

  // The strip's rows slide in one after another over BOOT_ASSEMBLE_SEC.
  let assembleTimer: ReturnType<typeof setTimeout> | null = null;
  function assembleStrip(): void {
    const rows = Array.from(memWrap.querySelectorAll<HTMLElement>('.addr-row'));
    if (rows.length === 0) throw new Error('TitleCard: the memory strip has no .addr-row to assemble');
    const stepSec = BOOT_ASSEMBLE_SEC / rows.length;
    memWrap.style.setProperty('--row-step', `${stepSec}s`);
    rows.forEach((row, i) => {
      row.style.setProperty('--row', String(i));
      row.classList.add('assembling');
      play('typeTick', { voice: 'sys' }, { delaySec: i * stepSec });
    });
    if (assembleTimer !== null) clearTimeout(assembleTimer);
    // Cosmetic, wall clock: drop the class once the last row has landed.
    assembleTimer = setTimeout(() => {
      rows.forEach((row) => row.classList.remove('assembling'));
      assembleTimer = null;
    }, (BOOT_ASSEMBLE_SEC + BOOT_ASSEMBLE_SETTLE_SEC) * 1000);
  }

  // Every boot assembles the strip: the first from the title, a later ship's after its transmission
  // (WP7), and ship 1 again after the simulation.
  function paint(phase: RunPhase, prev: RunPhase | null): void {
    root.hidden = phase !== 'title' && phase !== 'boot';
    if (phase !== 'title' && wiped) {
      wiped = false;
      paintArchive();
    }
    // The one-off notes were said: the kid has left the title (RECEIVE, RESUME, NEW RUN), so they are cleared for good.
    if (prev === 'title' && phase !== 'title' && model.notes.length > 0) {
      archiveNotesSaid(store);
      model = { ...model, notes: [] };
      notesEl.hidden = true;
    }
    if (phase !== 'title') { asking = false; stopRoll(); settleLaunch(); }
    root.classList.toggle('booting', phase === 'boot');
    // RECEIVE TRANSMISSION (the run's first boot, from the title): the beam draws from SOL to the first ship. A resumed BEAM
    // boot past ship 1 (systems/run-save.ts) is no beam from SOL: the card just clears (Track SAVE's note).
    root.classList.toggle('receiving', phase === 'boot' && prev === 'title' && store.getState().run.shipIndex === 0);
    if (phase === 'title') { paintUnit(); paintChart(); }
    if (phase === 'boot' && prev !== null && prev !== 'boot') assembleStrip();
  }

  paint(store.getState().run.phase, null);
  const unsub = store.subscribe((s) => s.run.phase, (phase, prev) => paint(phase, prev));
  const unsubRun = store.subscribe((s) => s.run.rev, () => { paintUnit(); paintChart(); });
  // The map, the unit and the last unit (a NEW RUN, a resumed run's title) repaint the line; the map repaints the chart.
  const unsubMap = store.subscribe((s) => `${s.run.seed}|${s.run.unitNumber}|${s.run.lastUnit?.number ?? '-'}|${s.run.map.run}|${s.run.map.startYear}`, paintUnit);
  const unsubChart = store.subscribe((s) => s.run.map, paintChart);
  const unsubSave = store.subscribe((s) => s.save, paintUnit);

  return () => {
    resumeBtn.removeEventListener('click', onResume);
    newRunBtn.removeEventListener('click', onNewRun);
    keepBtn.removeEventListener('click', onKeep);
    abandonBtn.removeEventListener('click', onAbandon);
    offKeys.forEach((off) => off());
    stopRoll();
    unsubSave();
    receiveBtn.removeEventListener('click', onReceive);
    wipeBtn.removeEventListener('click', onWipe);
    withoutBtn.removeEventListener('click', onWithout);
    root.removeEventListener('click', onCardClick);
    if (assembleTimer !== null) clearTimeout(assembleTimer);
    chartResize.disconnect();
    unsubMap();
    unsubChart();
    chartHost.remove();
    unsub();
    unsubRun();
    unsubArchive();
  };
}
