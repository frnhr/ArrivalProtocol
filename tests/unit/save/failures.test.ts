// Track SAVE (slice 3c plan §6.1 save/failures; §2.1's failure table, risks 7 and 9): every way the run save can fail, on
// stubbed storage, store-level (no flights). The failure-path table, row by row:
// • storage unreachable or unreadable at the page's open → OFFLINE (the archive too), RECEIVE plays, nothing written;
// • a write that throws mid-run (QuotaExceeded on the run save's key) → OFFLINE, 'save-lost' once, play goes on, no later
//   point writes; a save that can't be built (a NaN in the state) the same; a clear that throws at RUN END the same, and
//   the save left behind reads stale on the next open;
// • not JSON / another version / a bad shape → CAN'T RESUME with its reason; ABANDON RUN abandons the run in progress
//   (recorded, the world update run with its ships done), clears the save and opens UNIT-048's title, saving again;
// • stale (the run already ended; another tab's run: the last write wins) and an archive that can't be read (corrupt) →
//   CAN'T RESUME; ABANDON only clears what is not in progress, and the CORRUPT box stays;
// • a save whose constructors throw on RESUME → CAN'T RESUME 'resume-threw', the title back as it was;
// • an activeRun with no save (never written, risk 7) → abandoned on open, the update run with its ships;
// • NEW RUN over a resumable save abandons it the same way.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { on } from '@systems/events';
import { archiveMeta, abandonVisits, freshMeta, saveMeta, recordRunStart, recordRunEnd } from '@systems/meta';
import { resumeRun, abandonRun } from '@systems/run-save';
import { receiveTransmission } from '@systems/boot';
import { continueAfterReport } from '@systems/run';
import { META_STORAGE_KEY, RUN_SAVE_KEY, RUN_SAVE_VERSION } from '@data/tuning';
import {
  stubStorage, pageOpen, storedSave, storedMeta, receiveToReport, toDesk, beamTo, finalReport, WORKED_ROUTE, type StubStorage,
} from './save-fixture';

const SEED = 5;
const store = createStore<GameState>(createInitialState({ seed: SEED }));
const state = (): Readonly<GameState> => store.getState();
let lost = 0;
on('save-lost', () => { lost++; });
const quiet = <T>(fn: () => T): T => {
  const error = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = error; }
};
const saveIs = (status: string, refusal: string | null = null): boolean => state().save.status === status
  && (state().save.refusal?.kind ?? null) === refusal;

// A page with UNIT-047's run saved at HALCYON's desk (ship 2 done).
function savedAtHalcyon(): StubStorage {
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toDesk(store);
  beamTo(store, WORKED_ROUTE[1]!);
  toDesk(store);
  return storage;
}

// --- Storage unreachable or unreadable at the open ----------------------------------------------------------------------
for (const how of ['reach', 'get'] as const) {
  const storage = stubStorage();
  storage.fail[how] = true;
  quiet(() => pageOpen(store, storage, SEED));
  storage.fail[how] = false;
  lost = 0;
  quiet(() => receiveToReport(store));
  check(`storage that throws on ${how === 'reach' ? 'reach' : 'read'} at the open: RUN SAVE OFFLINE and ARCHIVE OFFLINE, RECEIVE plays, nothing is written`,
    saveIs('offline') && state().archive.status === 'offline' && state().run.phase === 'report' && storage.log.length === 0 && lost === 0);
}

// --- A write that throws mid-run (QuotaExceeded) ------------------------------------------------------------------------------
{
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  storage.fail.setKey = RUN_SAVE_KEY;
  lost = 0;
  quiet(() => toDesk(store));
  check('a run save write that throws (QuotaExceeded) at SHIP DONE: OFFLINE, \'save-lost\' once, the desk opens anyway',
    saveIs('offline') && lost === 1 && state().run.phase === 'desk', `${state().save.status} ${lost}`);
  storage.fail.setKey = null;
  const writes = storage.log.filter((entry) => entry.key === RUN_SAVE_KEY).length;
  beamTo(store, WORKED_ROUTE[1]!);
  toDesk(store);
  check('…no later point writes (BEAM, SHIP DONE), and \'save-lost\' is not said again; the archive keeps writing',
    storage.log.filter((entry) => entry.key === RUN_SAVE_KEY).length === writes && lost === 1 && state().archive.status === 'ok');
}
{
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  store.update((draft) => { draft.burn.fuelPct = Number.NaN; });
  lost = 0;
  quiet(() => toDesk(store));
  check('a save that can\'t be built (a NaN in the state, a bug) goes OFFLINE the same way: \'save-lost\', play goes on',
    saveIs('offline') && lost === 1 && state().run.phase === 'desk');
}
{
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  for (const slot of WORKED_ROUTE.slice(1)) beamTo(store, slot);
  finalReport(store);
  storage.fail.remove = true;
  lost = 0;
  quiet(() => continueAfterReport(store));
  storage.fail.remove = false;
  check('a clear that throws at RUN END: OFFLINE and \'save-lost\'; the run still ends and the archive keeps it',
    saveIs('offline') && lost === 1 && state().run.phase === 'end' && storage.data.has(RUN_SAVE_KEY)
    && (storedMeta(storage).lastUnit as { cause: string }).cause === 'won-purge');
  quiet(() => pageOpen(store, storage, SEED));
  check('…the save left behind reads stale on the next open (the run already ended): CAN\'T RESUME', saveIs('cant-resume', 'stale'));
  const lastUnit = JSON.stringify(storedMeta(storage).lastUnit);
  abandonRun(store, 21);
  check('…ABANDON RUN only clears it (nothing in progress: the last unit stays UNIT-047\'s won run), and UNIT-048\'s title saves again',
    !storage.data.has(RUN_SAVE_KEY) && JSON.stringify(storedMeta(storage).lastUnit) === lastUnit && saveIs('ok') && state().run.unitNumber === 48
    && state().run.phase === 'title');
}

// --- A save that can't be resumed ----------------------------------------------------------------------------------------
const corruptions: [string, (raw: string) => string, string][] = [
  ['not JSON', () => '{ this is not a run save', 'not-json'],
  ['another save version', (raw) => raw.replace(`"saveVersion":${RUN_SAVE_VERSION}`, `"saveVersion":${RUN_SAVE_VERSION + 1}`), 'version'],
  ['another content version', (raw) => raw.replace('"catalogue":', '"catalogue":9'), 'content'],
  ['a bad shape', (raw) => raw.replace('"writtenAt":', '"writtenAt":"soon","was":'), 'shape'],
];
for (const [what, corrupt, kind] of corruptions) {
  const storage = savedAtHalcyon();
  storage.data.set(RUN_SAVE_KEY, corrupt(storage.data.get(RUN_SAVE_KEY)!));
  quiet(() => pageOpen(store, storage, SEED));
  check(`${what}: RUN SAVE CAN'T RESUME · ${kind} (the detail on the console only), the run in progress kept for ABANDON RUN`,
    saveIs('cant-resume', kind) && state().save.resume === null && archiveMeta().activeRun?.unit === 47, JSON.stringify(state().save));
}
{
  // ABANDON RUN from the last of them: recorded, the update run with its two ships done, the save cleared, UNIT-048.
  const storage = stubStorage();
  pageOpen(store, storage, SEED);
  receiveToReport(store);
  toDesk(store);
  beamTo(store, WORKED_ROUTE[1]!);
  toDesk(store);
  storage.data.set(RUN_SAVE_KEY, '{ broken');
  quiet(() => pageOpen(store, storage, SEED));
  const before = structuredClone(archiveMeta());
  abandonRun(store, 31);
  const meta = storedMeta(storage) as { lastUnit: { cause: string; trail: { stops: { slot: number; outcome: string | null }[] } }; arm: { run: number } | null; activeRun: unknown; routes: { slots: number[] }[] };
  check('ABANDON RUN: the run is the last unit, abandoned, its trail the route so far (ARES-VII, HALCYON done)',
    meta.lastUnit.cause === 'abandoned' && JSON.stringify(meta.lastUnit.trail.stops.map((stop) => stop.slot)) === '[0,2]'
    && meta.lastUnit.trail.stops.every((stop) => stop.outcome === 'locked') && meta.activeRun === null, JSON.stringify(meta.lastUnit));
  check('…the world update ran with its ships done (the visits from its trail; the next arm is run 2\'s), and its route is kept',
    JSON.stringify(abandonVisits(before.activeRun!.trail!).map((visit) => visit.slot)) === '[0,2]' && meta.arm?.run === 2
    && JSON.stringify(meta.routes.at(-1)?.slots) === '[0,2]');
  check('…the save is cleared, and UNIT-048\'s title opens with a working save', !storage.data.has(RUN_SAVE_KEY) && saveIs('ok')
    && state().run.unitNumber === 48 && state().run.phase === 'title');
  receiveTransmission(store);
  check('…which saves its RUN START', storedSave(storage).save.unit === 48 && storedSave(storage).save.point === 'run-start');
}

// --- Stale: another tab's run (the last write wins) -----------------------------------------------------------------------
{
  const storage = savedAtHalcyon();
  // The other tab started its own run on the same archive and wrote last: its run is the one in progress now.
  const other = recordRunStart(recordRunEnd(recordRunStart(freshMeta(SEED), {
    unit: 47, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null,
  }, 0), { unit: 47, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, cause: 'abandoned', score: 0 }),
  { unit: 48, shipName: 'ARES-VIII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [47], trail: null }, 0);
  saveMeta(storage.provider, other);
  quiet(() => pageOpen(store, storage, SEED));
  check('two tabs: this tab\'s save is unit 47\'s, the archive\'s run in progress unit 48\'s (written last): CAN\'T RESUME · stale',
    saveIs('cant-resume', 'stale'));
  abandonRun(store, 41);
  check('…ABANDON RUN abandons the archive\'s run in progress (the other tab\'s: the last write wins, documented) and clears the save',
    (storedMeta(storage).lastUnit as { number: number; cause: string }).number === 48 && !storage.data.has(RUN_SAVE_KEY) && state().run.unitNumber === 49);
}

// --- The archive can't be read ----------------------------------------------------------------------------------------------
{
  const storage = savedAtHalcyon();
  storage.data.set(META_STORAGE_KEY, '{ not an archive');
  quiet(() => pageOpen(store, storage, SEED));
  check('an archive that can\'t be read (CORRUPT) vouches for no save: CAN\'T RESUME · archive', saveIs('cant-resume', 'archive')
    && state().archive.status === 'corrupt');
  abandonRun(store, 51);
  check('…ABANDON RUN clears the save; the archive\'s CORRUPT box stays (nothing written over it)', !storage.data.has(RUN_SAVE_KEY)
    && state().archive.status === 'corrupt' && storage.data.get(META_STORAGE_KEY) === '{ not an archive' && saveIs('ok'));
}

// --- The resume itself throws ---------------------------------------------------------------------------------------------
{
  const storage = savedAtHalcyon();
  // A segment one block bigger: every field reads, the memory's layout does not (assertMemoryInvariants on RESUME).
  const data = JSON.parse(storage.data.get(RUN_SAVE_KEY)!) as { payload: { slices: { memory: { size: number }[] } } };
  data.payload.slices.memory[0]!.size += 1;
  storage.data.set(RUN_SAVE_KEY, JSON.stringify(data));
  pageOpen(store, storage, SEED);
  check('a save whose memory does not add up passes the decoder and is offered', saveIs('ok') && state().save.resume?.point === 'ship-done');
  quiet(() => resumeRun(store));
  check('…RESUME throws in the constructors: CAN\'T RESUME · resume-threw, the title back as it was (UNIT-047, ship 1)',
    saveIs('cant-resume', 'resume-threw') && state().run.phase === 'title' && state().run.unitNumber === 47 && state().run.shipIndex === 0);
}

// --- An activeRun and no save (risk 7) -----------------------------------------------------------------------------------------
{
  const storage = savedAtHalcyon();
  storage.data.delete(RUN_SAVE_KEY);
  pageOpen(store, storage, SEED);
  const meta = storedMeta(storage) as { lastUnit: { cause: string; trail: { stops: unknown[] } }; activeRun: unknown; arm: { run: number } | null };
  check('an activeRun with no save (never written, or lost): abandoned on open, its two ships in the trail, the update run, written',
    meta.activeRun === null && meta.lastUnit.cause === 'abandoned' && meta.lastUnit.trail.stops.length === 2 && meta.arm?.run === 2
    && saveIs('ok') && state().run.unitNumber === 48);
}

// --- NEW RUN over a resumable save --------------------------------------------------------------------------------------------
{
  const storage = savedAtHalcyon();
  pageOpen(store, storage, SEED);
  check('a resumable save: the title offers RESUME (HALCYON\'s desk)', saveIs('ok') && state().save.resume?.ship === 'HALCYON');
  abandonRun(store, 61);
  const meta = storedMeta(storage) as { lastUnit: { cause: string; number: number }; activeRun: unknown };
  check('…NEW RUN over it (after its confirm) abandons UNIT-047\'s run, clears the save and opens UNIT-048\'s title',
    meta.lastUnit.cause === 'abandoned' && meta.lastUnit.number === 47 && meta.activeRun === null && !storage.data.has(RUN_SAVE_KEY)
    && state().run.unitNumber === 48 && state().save.resume === null);
}

finish();
