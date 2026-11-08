// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Store } from '@state/store';
import type { GameState, RunState } from '@state/schema';
import type { RunSave, BootPayload, WorldPayload, SaveState } from '@/types/save';
import type { StorageProvider } from '@systems/storage';
import { resetWorld } from '@systems/reset';
import { resetWorldForShip, deskUiOnOpen, startRun } from '@systems/run';
import { startBootFromTitle, unlockAudioFromGesture } from '@systems/boot';
import {
  abandonActiveRun, archiveLineage, activeLineageOf, openRunArchive, archiveMeta, archiveStatusNow, type RunLineage,
} from '@systems/meta';
import { highestSegId, reserveSegIds, assertMemoryInvariants } from '@systems/memory-ops';
import { highestLogEntryId, reserveLogEntryIds } from '@systems/say';
import { newRunSeed } from '@systems/rng';
import { createUiState, createInitialState } from '@state/initial';
import { createRunMap, mapAtFirstShip } from '@systems/map-run';
import { layoutOf } from '@data/memory';
import { EMPTY_HISTORY } from '@data/map-state';
import { pendingRunSave, takePendingRunSave, clearRunSave, runSaveSessionStatus, openRunSave } from '@systems/save-write';

// Resuming and abandoning a saved run (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.2): the stateful half that
// rebuilds the store from a save. The codec and checks are systems/save-codec.ts (pure) and the page's session
// systems/save-write.ts; both are re-exported here so a caller has one import. This file may import systems/run.ts and
// systems/boot.ts (resetWorldForShip, deskUiOnOpen, startRun, startBootFromTitle); they never import it (the plan's cycle
// guard).

export {
  SAVE_POINTS, contentVersions, savePayloadAt, resumeLineOf, buildRunSave, encodeRunSave, decodeRunSave, saveRefusal,
} from '@systems/save-codec';
export {
  openRunSave, closeRunSave, writeRunSave, clearRunSave, pendingRunSave, writeEndingChosen,
} from '@systems/save-write';

// The page's open sequence (slice 3c plan §2.2; state/instance.ts, before the store exists):
// 1. the archive (it no longer abandons a leftover run by itself), a fresh one taking `seed` as its arm seed;
// 2. the run save, checked against the archive (an archive that can't be read vouches for nothing);
// 3. a run in progress that no save can resume (none was written, or the save storage is offline) is abandoned now, with
//    the world update (risk 7: the OFFLINE line warned the kid); a save that can't be resumed waits for ABANDON RUN.
// Returns the store's save state.
export function openPageStorage(provider: StorageProvider, seed: number): SaveState {
  openRunArchive(provider, seed);
  const save = openRunSave(provider, archiveStatusNow() === 'ok' ? archiveMeta() : null);
  if (save.status !== 'cant-resume' && save.resume === null) abandonActiveRun();
  return save;
}

// The page's first state, once its storage is open: a resumable save opens on the saved run's title (its unit, its arm at
// ship 1; nothing is updated before the kid chooses RESUME or NEW RUN); a save that can't be resumed while the archive has a
// run in progress opens on that run's title (its unit and wave, on the arm it was started on: the next unit's lineage would
// count the run in progress twice and meet an arm stored for the run before it); anything else on the next unit's title
// from the archive's lineage, as before 3c.
// Never throws (review fix B1: the page used to open on nothing, with no title and no ABANDON RUN): a title that can't be
// built from the archive and the save is logged loudly, and a plain title opens with RUN SAVE CAN'T RESUME, whose ABANDON
// RUN clears the save and opens the next unit's title (plainTitleState).
export function pageTitleState(seed: number, save: Readonly<SaveState>, reducedMotion: boolean): GameState {
  try {
    return titleStateOf(seed, save, reducedMotion);
  } catch (error) {
    console.error('[run save] the title could not be built from the archive and the save: a plain title opens instead', error);
    takePendingRunSave();
    return plainTitleState(seed, save, reducedMotion);
  }
}

function titleStateOf(seed: number, save: Readonly<SaveState>, reducedMotion: boolean): GameState {
  const pending = pendingRunSave();
  const archive = { status: archiveStatusNow() };
  if (pending !== null) {
    return createInitialState({
      seed: pending.payload.run.seed, phase: 'title', reducedMotion, lineage: lineageOfRun(pending.payload.run), archive,
      save: structuredClone(save) as SaveState, map: mapAtFirstShip(pending.payload.run.map),
    });
  }
  const inProgress = save.status === 'cant-resume' && archive.status === 'ok' ? activeLineageOf(archiveMeta()) : null;
  const lineage = inProgress ?? archiveLineage();
  return createInitialState({
    seed, phase: 'title', reducedMotion, lineage, archive, save: structuredClone(save) as SaveState, map: createRunMap(lineage, seed),
  });
}

// The fallback title (a bug got past the archive's and the save's checks): the next unit's lineage on a fresh roll of its arm
// (no stored arm, no history to disagree with), else run 1's, with RUN SAVE CAN'T RESUME (THE SAVE DOES NOT REBUILD) unless
// the save is OFFLINE. Its ABANDON RUN goes the usual way (abandonRun).
function plainTitleState(seed: number, save: Readonly<SaveState>, reducedMotion: boolean): GameState {
  const refused: SaveState = save.status === 'offline' ? { status: 'offline', resume: null, refusal: null } : {
    status: 'cant-resume', resume: null,
    refusal: save.refusal ?? { kind: 'resume-threw', detail: 'the title could not be built from the archive and the save' },
  };
  const archive = { status: archiveStatusNow() };
  try {
    const lineage: RunLineage = { ...archiveLineage(), arm: null, history: structuredClone(EMPTY_HISTORY) };
    return createInitialState({ seed, phase: 'title', reducedMotion, lineage, archive, save: refused, map: createRunMap(lineage, seed) });
  } catch (error) {
    console.error('[run save] the plain title could not use the archive\'s lineage either: run 1\'s title opens', error);
    return createInitialState({ seed, phase: 'title', reducedMotion, archive, save: refused, map: createRunMap({ wave: 1 }, seed) });
  }
}

// The lineage a saved run was started with (state/instance.ts builds the RESUME title from it: the saved run's unit, wave,
// last unit and HOLLOW, as createRunState reads them).
export function lineageOfRun(run: Readonly<RunState>): RunLineage {
  return {
    unitNumber: run.unitNumber,
    wave: run.wave,
    lastUnit: run.lastUnit === null ? null : structuredClone(run.lastUnit),
    hollowUnits: [...run.hollowUnits],
    tutorialDone: !run.tutorial,
    armSeed: run.map.armSeed,
    arm: null,
    history: structuredClone(run.map.history),
    // Slice 7c: the events the run's book keeps (047.log's), the only ones a run holds of its lineage.
    events: run.log.book.kind === 'last' ? structuredClone(run.log.book.events) : [],
  };
}

// Every id a restored state holds stays unique (3c plan §2.2 step 2): the segment-id and log-entry counters move past the
// save's (never back). ops-core's op ids need nothing: no op runs at any save point.
function reserveIds(save: Readonly<RunSave>): void {
  reserveSegIds(highestSegId(JSON.stringify(save)));
  reserveLogEntryIds(highestLogEntryId(save.log));
}

// A BEAM or RUN START save: the ship replays from its boot (decision 5): the world rebuilt from the run, the racks and the
// verdict exactly as startShip built it (createShipSlices is deterministic by the ShipKey and the visit streams), the log
// as it was saved (it already ends with the ship's divider), then the boot from the title without counting the run again.
function resumeBoot(store: Store<GameState>, save: Readonly<RunSave>, payload: Readonly<BootPayload>): void {
  const logRev = Math.max(store.getState().log.rev, save.log.rev) + 1;
  resetWorldForShip(store, {
    phase: 'boot', run: structuredClone(payload.run) as RunState, carried: structuredClone(payload.carried), threat: structuredClone(payload.threat),
    freshLog: true, done: [...save.done],
    adjust: (draft) => { draft.log = { entries: structuredClone(save.log.entries), rev: logRev }; },
  });
  startBootFromTitle(store, { countRun: false });
}

// A SHIP DONE or ENDING CHOSEN save: the desk or the final LANDING REPORT as it stood, in one update (3c plan §2.2 step 4):
// the slices, the run, the log, the director's done list, no alerts, a fresh UI (the desk's fields as openDesk sets them).
// The clock is the saved one (paused at the desk; the report's as it was). Then the memory is checked whole.
function resumeWorld(store: Store<GameState>, save: Readonly<RunSave>, payload: Readonly<WorldPayload>): void {
  resetWorld();
  const before = store.getState();
  const slices = structuredClone(payload.slices) as WorldPayload['slices'];
  const run: RunState = { ...structuredClone(payload.run) as RunState, rev: before.run.rev + 1 };
  const desk = payload.phase === 'desk' ? deskUiOnOpen({ ...before, ...slices, run }) : null;
  const logRev = Math.max(before.log.rev, save.log.rev) + 1;
  store.update((draft) => {
    Object.assign(draft, slices);
    draft.run = run;
    draft.alerts = { list: [], rev: draft.alerts.rev + 1 };
    draft.director = { shown: null, done: [...save.done] };
    draft.log = { entries: structuredClone(save.log.entries), rev: logRev };
    draft.ui = {
      ...createUiState(payload.phase, draft.ui.reducedMotion),
      // The amber screen: the landing is flown there, and its report and the desk open over it (the title's blue would tint
      // the desk's header as no played desk is).
      mode: 'tools',
      filtersOff: draft.ui.filtersOff,
      spotlight: draft.ui.spotlight,
      memoryRev: draft.ui.memoryRev + 1,
      ...(desk ?? {}),
    };
  });
  const state = store.getState();
  assertMemoryInvariants(state.memory, layoutOf(state).totalBlocks);
  unlockAudioFromGesture();
}

// [RESUME ▸] (plan §2.2): the save read at the page's open rebuilds the world. A 'boot' payload replays the ship's boot, a
// 'world' payload restores the desk or the final LANDING REPORT. Nothing is left running that the save did not hold
// (resetWorld; resetReport() is empty afterwards, the suites assert it). A throw in the constructors is RUN SAVE CAN'T
// RESUME with its message: the title of the saved run comes back as it was, with ABANDON RUN only.
export function resumeRun(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.phase !== 'title') throw new Error(`resumeRun: not on the title (phase ${state.run.phase})`);
  const save = pendingRunSave();
  if (save === null || state.save.status !== 'ok' || state.save.resume === null) throw new Error('resumeRun: no save to resume');
  const title = structuredClone(state) as GameState;
  try {
    reserveIds(save);
    if (save.payload.kind === 'boot') resumeBoot(store, save, save.payload);
    else resumeWorld(store, save, save.payload);
  } catch (error) {
    console.error('[run save] the resume threw', error);
    resetWorld();
    store.update((draft) => {
      Object.assign(draft, title);
      draft.save = { status: 'cant-resume', resume: null, refusal: { kind: 'resume-threw', detail: (error as Error).message } };
    });
    takePendingRunSave();
    return;
  }
  takePendingRunSave();
  store.update((draft) => { draft.save = { status: 'ok', resume: null, refusal: null }; });
}

// [NEW RUN] over a save (after its inline confirm), [ABANDON RUN] and __ap.newRun (plan §2.2): the run the archive has in
// progress is recorded as abandoned (its ships count as done, and the world update runs with them: meta.ts
// abandonActiveRun), the save is cleared, and the next unit's title opens on the arm. A stale save whose run already ended
// only clears (nothing is in progress). Another tab's run (the stale rule's other case, 'superseded') is the archive's run
// in progress, so it is the one abandoned: the last write wins, as the header of save-write.ts documents. `seed`: the next
// run's (__ap.newRun's; the page's own is fresh).
// The cause (review fix, minor 7): ABANDON RUN on a RUN SAVE CAN'T RESUME title records 'signal-lost' (the game could not
// give the run back: another version or content, a damaged save, a ship that no longer builds; no ghost line blames the
// kid); NEW RUN over a resumable save, the kid's choice, records 'abandoned'.
export function abandonRun(store: Store<GameState>, seed: number = newRunSeed()): void {
  const cause = store.getState().save.status === 'cant-resume' ? 'signal-lost' : 'abandoned';
  takePendingRunSave();
  abandonActiveRun(store, cause);
  clearRunSave(store);
  const status = runSaveSessionStatus();
  store.update((draft) => {
    if (status !== 'none') draft.save = { status, resume: null, refusal: null };
  });
  startRun(store, seed, archiveLineage(), 'arm');
}
