import type { Store } from '@state/store';
import type { GameState, RunPhase, ArchiveStatus } from '@state/schema';
import { getPrediction } from '@systems/predict';
import { receiveTransmission, skipBoot } from '@systems/boot';
import { archiveMeta, wipeArchive, playWithoutArchive, isFirstRun, ENDINGS } from '@systems/meta';
import { play, unlockAudio } from '@systems/audio';
import { requireById, make } from '@components/dom';
import { LINES, ARCHIVE_TEXT, lineVars, lineageLine } from '@data/script';
import { BOOT_ASSEMBLE_SEC, BOOT_ASSEMBLE_SETTLE_SEC } from '@data/tuning';

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
  const memWrap = requireById('memWrap');

  wipeBtn.textContent = ARCHIVE_TEXT.wipe;
  withoutBtn.textContent = ARCHIVE_TEXT.playWithout;
  archiveHints.replaceChildren(make('div', 'title-archive-hint', ARCHIVE_TEXT.wipeHint), make('div', 'title-archive-hint', ARCHIVE_TEXT.withoutHint));

  // The unit and wave of the run (a NEW RUN starts over with its own), and for a returning unit the one
  // before it and the endings found.
  const paintUnit = (): void => {
    const state = store.getState();
    unitEl.textContent = LINES.titleUnit(lineVars(state, getPrediction()));
    const lineage = lineageLine(state.run.lastUnit);
    lineageEl.hidden = lineage === null;
    lineageEl.textContent = lineage ?? '';
    lineageEl.classList.toggle('stayed', state.run.lastUnit?.cause === 'stayed');
    // The endings live in the archive's session copy, which every browser page opens (state/instance.ts).
    const returning = !isFirstRun(state.run);
    endingsEl.hidden = !returning;
    const seen = returning ? archiveMeta().endingsSeen : [];
    endingsEl.textContent = returning ? ARCHIVE_TEXT.endings(seen.length, ENDINGS.length) : '';
    // WP11 part 2: lit once an ending has been found (RUN END names them: `ENDINGS 1/2 · PURGE · ???`).
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
  const unsubArchive = store.subscribe((s) => s.archive.status, paintArchive);

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
    root.classList.toggle('booting', phase === 'boot');
    if (phase === 'boot' && prev !== null && prev !== 'boot') assembleStrip();
  }

  paint(store.getState().run.phase, null);
  const unsub = store.subscribe((s) => s.run.phase, (phase, prev) => paint(phase, prev));
  const unsubRun = store.subscribe((s) => s.run.rev, paintUnit);

  return () => {
    receiveBtn.removeEventListener('click', onReceive);
    wipeBtn.removeEventListener('click', onWipe);
    withoutBtn.removeEventListener('click', onWithout);
    root.removeEventListener('click', onCardClick);
    if (assembleTimer !== null) clearTimeout(assembleTimer);
    unsub();
    unsubRun();
    unsubArchive();
  };
}
