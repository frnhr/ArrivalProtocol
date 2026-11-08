// Slice 3c review fixes: one fast regression check per bug, store-level on stubbed storage (the save fixture's page opens;
// the input layer and __ap driven without a DOM). Run 2 and later is where most of them lived.
// • B1: a CAN'T RESUME page on run 2 opens on the run in progress's title (a content bump, a full quota then a NEW RUN, two
//   tabs, the classic jump with no save), run 1's on UNIT-047; a title that can't be built falls back to a plain one;
// • B2: RECEIVE TRANSMISSION refuses over a save (ENTER and SPACE through the input layer, the call itself);
// • M1, M2: the save follows the archive; offline empties the slot, or says it couldn't;
// • minors: the world update's fallbacks (RUN END never half-ended), ENDING CHOSEN only with a save, the neutral cause, the
//   grey cross beside a colony, __ap.archiveAs's cause, __ap.route's runs that end and save.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { Meta } from '@systems/meta';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { on } from '@systems/events';
import {
  archiveMeta, archiveLineage, archiveShipStarted, abandonedMeta, freshMeta, recordRunStart, saveMeta, wipeArchive, playWithoutArchive,
  ghostLine,
} from '@systems/meta';
import { openPageStorage, pageTitleState, abandonRun, resumeRun } from '@systems/run-save';
import { writeEndingChosen } from '@systems/save-write';
import { receiveTransmission, mountBoot } from '@systems/boot';
import { mountInput } from '@systems/input';
import { continueAfterReport, startRun, endRun } from '@systems/run';
import { classicRunMap } from '@systems/map-run';
import { reachableFrom } from '@systems/map-hop';
import { currentSlot, isEndSlot } from '@systems/map-streams';
import { chartTrail } from '@systems/desk';
import { freeSegment } from '@systems/memory-ops';
import { RUN_SAVE_KEY, META_STORAGE_KEY, TRAIL_CROSS_PAST_COLONY_LY } from '@data/tuning';
import {
  stubStorage, pageOpen, storedSave, storedMeta, receiveToReport, toDesk, beamTo, finalReport, WORKED_ROUTE, type StubStorage,
} from './save-fixture';
import { run2Map, RUN1_LAST_UNIT } from '../world/run2-fixture';
import { decideFinale } from '../support/finale';

const SEED = 5;
const store = createStore<GameState>(createInitialState({ seed: SEED }));
const state = (): Readonly<GameState> => store.getState();
const quiet = <T>(fn: () => T): T => {
  const error = console.error;
  const info = console.info;
  console.error = () => {};
  console.info = () => {};
  try { return fn(); } finally { console.error = error; console.info = info; }
};
let lost = 0;
let staleLeft = 0;
on('save-lost', () => { lost++; });
on('save-stale', () => { staleLeft++; });
const saveIs = (status: string, refusal: string | null = null): boolean => state().save.status === status
  && (state().save.refusal?.kind ?? null) === refusal;

// From the run's first report, desk to desk by the first ship in reach, to RUN END.
function playToEnd(): void {
  for (let guard = 0; guard < 20; guard++) {
    if (isEndSlot(state().run.map, currentSlot(state().run))) {
      finalReport(store);
      continueAfterReport(store);
      return;
    }
    toDesk(store);
    beamTo(store, reachableFrom(state().run.map, currentSlot(state().run))[0]!);
  }
  throw new Error('playToEnd: no final ship');
}

// A page whose UNIT-047 ended run 1, then UNIT-048's run 2 at its first desk (saved there).
function run2AtDesk(): StubStorage {
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  playToEnd();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toDesk(store);
  return storage;
}

// --- B1: the page always opens --------------------------------------------------------------------------------------------
{
  const storage = run2AtDesk();
  check('setup: UNIT-048\'s run 2 is saved at its first desk', storedSave(storage).save.unit === 48 && storedSave(storage).save.point === 'ship-done'
    && archiveMeta().runs === 2 && archiveMeta().arm?.run === 2);
  storage.data.set(RUN_SAVE_KEY, storage.data.get(RUN_SAVE_KEY)!.replace('"catalogue":', '"catalogue":9'));
  let threw = '';
  try { quiet(() => pageOpen(store, storage, SEED)); } catch (error) { threw = (error as Error).message; }
  check('B1 (probe p1): run 2\'s save of another content version opens on CAN\'T RESUME, never a throw', threw === '' && saveIs('cant-resume', 'content'), threw);
  check('…on the run in progress\'s own title: UNIT-048, wave 2, on the arm stored for run 2 (not UNIT-049 over run 3)',
    state().run.unitNumber === 48 && state().run.wave === 2 && state().run.map.run === 2 && state().run.phase === 'title');
  quiet(() => abandonRun(store, 61));
  const meta = storedMeta(storage) as { lastUnit: { number: number; cause: string }; runs: number; arm: { run: number } };
  check('…ABANDON RUN records UNIT-048 as signal-lost (no ghost line: review minor 7), the arm updated for run 3, UNIT-049\'s title',
    meta.lastUnit.number === 48 && meta.lastUnit.cause === 'signal-lost' && meta.arm.run === 3 && state().run.unitNumber === 49
    && state().run.map.run === 3 && !storage.data.has(RUN_SAVE_KEY) && saveIs('ok'));
  check('…and the ghost of a signal-lost unit says nothing', ghostLine(49, archiveMeta().lastUnit) === null);
}
{
  // Probe p3: run 1's CAN'T RESUME title is UNIT-047's (it read UNIT-048 on run 2's chart before).
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toDesk(store);
  storage.data.set(RUN_SAVE_KEY, '{ broken');
  quiet(() => pageOpen(store, storage, SEED));
  check('B1 (probe p3): run 1\'s CAN\'T RESUME title is UNIT-047\'s, on run 1\'s arm', saveIs('cant-resume', 'not-json')
    && state().run.unitNumber === 47 && state().run.map.run === 1);
  // B2 (probe p3): what ENTER and SPACE did on it.
  const runs = archiveMeta().runs;
  check('B2: RECEIVE TRANSMISSION refuses on a CAN\'T RESUME title (the run not counted again, the save not overwritten)',
    !receiveTransmission(store) && archiveMeta().runs === runs && archiveMeta().activeRun?.unit === 47 && storage.data.get(RUN_SAVE_KEY) === '{ broken');
}
{
  // Probe p2: a full quota on run 3, a NEW RUN in the same page, a reload.
  const storage = run2AtDesk();
  quiet(() => abandonRun(store, 71));
  receiveToReport(store);
  storage.fail.setKey = RUN_SAVE_KEY;
  lost = 0;
  quiet(() => playToEnd());
  storage.fail.setKey = null;
  check('M2 (probe p2): a write that fails on run 3 goes OFFLINE once and empties the slot (no stale save left)',
    saveIs('offline') && lost === 1 && !storage.data.has(RUN_SAVE_KEY));
  startRun(store, 123, archiveLineage(), 'arm');
  quiet(() => receiveToReport(store));
  let threw = '';
  try { quiet(() => pageOpen(store, storage, SEED)); } catch (error) { threw = (error as Error).message; }
  check('B1 (probe p2): …then a NEW RUN in the page and a reload: the page opens (the unsaved run abandoned, the next unit\'s title)',
    threw === '' && saveIs('ok') && state().run.unitNumber === archiveMeta().runs + 47 && archiveMeta().activeRun === null, threw);
}
{
  // Two tabs on run 2: the other tab started UNIT-049's run on the same archive and wrote last.
  const storage = run2AtDesk();
  const mine = structuredClone(archiveMeta()) as Meta;
  const other = recordRunStart({ ...mine, activeRun: null, runs: mine.runs }, {
    unit: 49, shipName: 'ARES-IX', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [48], trail: null,
  }, 0);
  saveMeta(storage.provider, { ...other, arm: mine.arm === null ? null : { ...mine.arm, run: other.runs } });
  let threw = '';
  try { quiet(() => pageOpen(store, storage, SEED)); } catch (error) { threw = (error as Error).message; }
  check('B1: two tabs on run 2: CAN\'T RESUME · superseded (ANOTHER RUN HAS STARTED SINCE), and the title opens on the archive\'s run',
    threw === '' && saveIs('cant-resume', 'superseded') && state().run.unitNumber === 49 && state().run.phase === 'title', threw);
}
{
  // repro-phone2: run 2 on the arm, the classic jump (__ap.ship: activeRun keeps no trail), the save cleared, a reload.
  const storage = run2AtDesk();
  store.update((draft) => { draft.run.map = classicRunMap(draft.run.seed, 1, draft.run.wave); draft.run.shipIndex = 1; draft.run.phase = 'boot'; });
  archiveShipStarted(store);
  storage.data.delete(RUN_SAVE_KEY);
  let threw = '';
  try { quiet(() => pageOpen(store, storage, SEED)); } catch (error) { threw = (error as Error).message; }
  check('B1 (repro-phone2): run 2 jumped to the classic world, no save, a reload: the page opens on UNIT-049\'s title',
    threw === '' && state().run.unitNumber === 49 && state().run.map.run === 3 && archiveMeta().arm?.run === 3 && archiveMeta().notes.armReset, threw);
}
{
  // A title that can't be built at all (a bug past every check): the plain fallback, never a throw.
  const storage = stubStorage();
  quiet(() => openPageStorage(storage.provider, SEED));
  const meta = archiveMeta() as Meta;
  meta.lastUnit = structuredClone(RUN1_LAST_UNIT);
  meta.runs = 1;
  // An arm the lineage would hand run 2 but createRunMap refuses (a broken final ship).
  meta.arm = { ...structuredClone(run2Arm()), ships: [] };
  let threw = '';
  let title: GameState | null = null;
  try { title = quiet(() => pageTitleState(SEED, { status: 'ok', resume: null, refusal: null }, false)); } catch (error) { threw = (error as Error).message; }
  check('B1: a title that can\'t be built falls back to a plain title with CAN\'T RESUME (never a throw at page open)',
    threw === '' && title !== null && title.run.phase === 'title' && title.save.status === 'cant-resume', threw);
}

function run2Arm(): NonNullable<Meta['arm']> {
  const map = run2Map(SEED);
  return {
    armSeed: map.armSeed, run: 2, startYear: map.startYear, gap: map.history.gap, valveYears: map.history.valveYears,
    finalSerial: map.history.finalSerial, lastFinal: null, ships: map.arm, departures: map.history.departures,
    content: { arm: 1, generator: 2, update: 1, mapState: 1 },
  };
}

// --- B2: the title's keys through the input layer ---------------------------------------------------------------------------
{
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toDesk(store);
  quiet(() => pageOpen(store, storage, SEED));
  const target = new EventTarget();
  const offInput = mountInput(target);
  const offBoot = mountBoot(store);
  const press = (code: string): void => {
    target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
    target.dispatchEvent(Object.assign(new Event('keyup'), { code }));
  };
  const runs = archiveMeta().runs;
  const raw = storage.data.get(RUN_SAVE_KEY);
  press('Enter');
  press('Space');
  check('B2: ENTER and SPACE on a RESUME title never run RECEIVE TRANSMISSION (the run counted once, RUN START not written over the save)',
    state().run.phase === 'title' && archiveMeta().runs === runs && storage.data.get(RUN_SAVE_KEY) === raw && state().save.resume !== null);
  resumeRun(store);
  check('…RESUME still resumes (the desk, the save taken)', state().run.phase === 'desk' && state().save.resume === null);
  offBoot();
  offInput();
}

// --- M1: the save follows the archive ---------------------------------------------------------------------------------------
{
  const storage = stubStorage({ [META_STORAGE_KEY]: '{ not an archive' });
  quiet(() => pageOpen(store, storage, SEED));
  check('M1: ARCHIVE CORRUPT at the open: the save works but says nothing yet (the title hides `runs save between ships`)',
    state().archive.status === 'corrupt' && saveIs('ok'));
  playWithoutArchive(store);
  lost = 0;
  quiet(() => receiveToReport(store));
  check('M1: …PLAY WITHOUT ARCHIVE, RECEIVE: the save goes OFFLINE at RUN START, said once (NO SAVE, the TERMINAL line), nothing written',
    saveIs('offline') && lost === 1 && !storage.data.has(RUN_SAVE_KEY));
  quiet(() => pageOpen(store, storage, SEED));
  wipeArchive(store);
  quiet(() => receiveToReport(store));
  check('M1: …WIPE ARCHIVE instead: the archive is ok, and RUN START is saved', saveIs('ok') && storedSave(storage).save.point === 'run-start');
}

// --- M2: offline empties the slot, or says it couldn't --------------------------------------------------------------------
{
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toDesk(store);
  storage.fail.set = true;
  storage.fail.remove = true;
  lost = 0;
  staleLeft = 0;
  quiet(() => beamTo(store, WORKED_ROUTE[1]!));
  storage.fail.set = false;
  storage.fail.remove = false;
  check('M2: a write that fails and a slot that can\'t be emptied: OFFLINE, said as `a reload may go back to an older save` (save-stale), once',
    saveIs('offline') && lost === 0 && staleLeft === 1 && storage.data.has(RUN_SAVE_KEY));
  quiet(() => toDesk(store));
  check('…no later point writes', storedSave(storage).save.point === 'ship-done' && storedSave(storage).save.resume.depth === 1);
  endRun(store, 'abandoned');
  check('M2: RUN END on an offline page still clears the slot (clearRunSave whatever the status)', !storage.data.has(RUN_SAVE_KEY));
}

// --- Minor 2: the world update's fallbacks -----------------------------------------------------------------------------------
{
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  for (const slot of WORKED_ROUTE.slice(1)) beamTo(store, slot);
  finalReport(store);
  // A route that names ship 1 twice (a bug): the update throws on it; trailOf does not.
  store.update((draft) => {
    draft.run.map.route[1]!.slot = 0;
    draft.run.ships[1]!.slot = 0;
  });
  quiet(() => continueAfterReport(store));
  check('minor 2: an update that throws at RUN END: RUN END opens all the same, the next arm a fresh roll for run 2 (THE ARM WAS REDRAWN)',
    state().run.phase === 'end' && archiveMeta().arm?.run === 2 && archiveMeta().notes.armReset && state().run.next?.run === 2
    && archiveMeta().activeRun === null && !storage.data.has(RUN_SAVE_KEY));
  const stuck = recordRunStart({ ...freshMeta(SEED), runs: 1, arm: structuredClone(archiveMeta().arm), lastUnit: archiveMeta().lastUnit }, {
    unit: 48, shipName: 'ARES-VIII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [47],
    trail: { unit: 48, run: 2, startYear: archiveMeta().arm!.startYear, lost: null, stops: [0, 0].map((slot) => ({ slot, shipName: 'ARES-VIII', year: 2300, outcome: 'locked' as const, landed: 0, colony: null, writer: null })) },
  }, 0);
  const abandoned = quiet(() => abandonedMeta(stuck));
  check('minor 2: …and at the abandon: the run recorded, the next arm redrawn for run 3 (notes.armReset)',
    abandoned.lastUnit?.number === 48 && abandoned.activeRun === null && abandoned.arm?.run === 3 && abandoned.notes.armReset);
}

// --- Minor 3: ENDING CHOSEN only with a save -------------------------------------------------------------------------------
{
  const headless = createStore<GameState>(createInitialState({ seed: 3, phase: 'report' }));
  headless.update((draft) => { decideFinale(draft, 'purge'); draft.memory.push(freeSegment(1, 999)); });
  let flushed = 0;
  let threw = '';
  try { writeEndingChosen(headless, () => { flushed++; }); } catch (error) { threw = (error as Error).message; }
  check('minor 3: no save behind the page: ENDING CHOSEN stops nothing, flushes nothing and never asserts', threw === '' && flushed === 0
    && headless.getState().memory.some((seg) => seg.type === 'free' && seg.reservedBy === 999), threw);
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  for (const slot of WORKED_ROUTE.slice(1)) beamTo(store, slot);
  store.update((draft) => { draft.run.phase = 'report'; decideFinale(draft, 'purge'); draft.memory.push(freeSegment(1, 999)); });
  // abortAll frees what an op reserved; a block reserved by no op at all stays (the bug the check guards).
  threw = '';
  try { quiet(() => writeEndingChosen(store, () => { flushed++; })); } catch (error) { threw = (error as Error).message; }
  check('minor 3: a block still reserved after the abort with a save: OFFLINE on the console, never a throw out of the final report',
    threw === '' && saveIs('offline'), threw);
}

// --- Minor 8: the grey cross beside a colony ----------------------------------------------------------------------------------
{
  const run = createInitialState({ seed: 3, phase: 'title', map: run2Map(1) }).run;
  const lastUnit = structuredClone(RUN1_LAST_UNIT);
  const trail = lastUnit.trail!;
  const lastStop = trail.stops.at(-1)!;
  trail.lost = { slot: lastStop.slot, year: lastStop.year, pastLy: 0, cause: 'abandoned' };
  const marks = chartTrail({ ...run, lastUnit })!.marks;
  const atWorld = marks.filter((mark) => mark.slot === lastStop.slot);
  check('minor 8: a unit lost after its last ship founded a colony: the colony\'s mark stays, the grey cross stands past it',
    atWorld.length === 2 && atWorld.some((mark) => mark.kind !== 'lost' && mark.colony === lastStop.colony && mark.offset)
    && atWorld.some((mark) => mark.kind === 'lost' && !mark.offset), JSON.stringify(atWorld.map((mark) => [mark.kind, mark.colony, mark.offset])));
  const bare = structuredClone(lastUnit);
  bare.trail!.stops.at(-1)!.colony = null;
  bare.trail!.stops.at(-1)!.landed = 0;
  const bareMarks = chartTrail({ ...run, lastUnit: bare })!.marks.filter((mark) => mark.slot === lastStop.slot);
  check(`…one lost aboard a ship that founded nothing: the cross is that stop's mark (TRAIL_CROSS_PAST_COLONY_LY ${TRAIL_CROSS_PAST_COLONY_LY} only beside a colony)`,
    bareMarks.length === 1 && bareMarks[0]!.kind === 'lost');
}

// --- Minor 9 and the e2e route bug: __ap without a DOM ----------------------------------------------------------------------
{
  (globalThis as Record<string, unknown>).window = { location: { search: '?debug' } };
  const { mountDebug } = await import('@/debug');
  const storage = stubStorage();
  pageOpen(store, storage, 4);
  receiveToReport(store);
  store.update((draft) => { draft.run.phase = 'flight'; });
  quiet(() => mountDebug(store));
  const ap = (globalThis as unknown as { window: { __ap: { route: (slots: number[]) => void; archiveAs: (cause: string) => void } } }).window.__ap;
  let threw = '';
  try { ap.archiveAs('wonpurge'); } catch (error) { threw = (error as Error).message; }
  check('minor 9: __ap.archiveAs refuses a cause that is not one (nothing written)', /not a cause/.test(threw), threw);
  quiet(() => ap.route([0, 2, 5, 11, 15, 19]));
  check('e2e route bug: __ap.route gives each skipped stop a result, so the route and the results agree',
    JSON.stringify(state().run.ships.map((result) => result.slot)) === '[0,2,5,11,15]' && state().run.ships.every((result) => result.landedInLz === 0));
  check('…and its BEAM save reads back (it read DAMAGED)', storedSave(storage).save.point === 'beam' && storedSave(storage).save.resume.depth === 6);
  store.update((draft) => { draft.run.phase = 'report'; });
  let ended = '';
  try { finalReport(store); continueAfterReport(store); } catch (error) { ended = (error as Error).message; }
  check('…and the routed run ends (RUN END, the update, the archive)', ended === '' && state().run.phase === 'end' && archiveMeta().lastUnit?.number === 47
    && archiveMeta().arm?.run === 2, ended);
  // e2e run-flow's bug (Track RETIRE's fixture world): __ap.runNumber(n) on a page whose archive holds the next run's arm
  // (run 2 here) built a fixture map from that stored arm with the wave set to n, and createRunMap threw.
  const runNumber = (globalThis as unknown as { window: { __ap: { runNumber: (run: number) => void } } }).window.__ap.runNumber;
  const runs: string[] = [];
  for (const run of [1, 3, 2, 1]) {
    try {
      quiet(() => runNumber(run));
      runs.push(`${run}:${state().run.wave}:${state().run.map.run}:${state().run.phase}`);
    } catch (error) {
      runs.push(`${run}: ${(error as Error).message}`);
    }
  }
  check('__ap.runNumber across runs (1, 3, 2, 1) with run 2\'s arm stored: each a fresh title on its own run\'s map, no throw',
    runs.join() === '1:1:1:title,3:3:3:title,2:2:2:title,1:1:1:title', runs.join(' | '));
}

finish();
