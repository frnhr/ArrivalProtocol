// Track SAVE (slice 3c plan §6.1 save/archive-v2; §2.4): archive v2's record, pure and on stubbed storage.
// • the strict parse, field by field: the stored arm (its ArmShips through the save's own checkArmShip, then
//   validateShipDef), departures, colonies, routes, events, notes, traces, a retired field;
// • migration in place: a foundation record (version 2) loses mergeBonus, its placeholder arm seed 0 becomes null (its run
//   in progress then keeps no trail), and the page writes the migrated record back; another seed is kept;
// • a v1 archive is not carried over: a fresh v2 with notes.olderArchive, written, said once (archiveNotesSaid clears it);
// • the content reset: an arm made by another generator is replaced by a fresh roll at the next run from its start year,
//   the lineage, colonies and history kept, notes.armReset; an abandoned run on the old arm records trail null, no update;
// • the record at run end on the worked route (archiveRunEnded): the trail, the route, the next arm from the world update
//   with its seed, run.next; the caps (colonies per world, the last routes, the events);
// • lineageOf: the retired MERGE bonus is false; the history comes from the stored arm.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { ArmState, UnitTrail } from '@/types/lineage';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import {
  freshMeta, parseMeta, readMeta, loadMeta, saveMeta, recordRunStart, recordRunEnd, recordAbandon, abandonUpdate, lineageOf, openRunArchive,
  archiveMeta, archiveNotesSaid, closeArchive, MetaCorrupt, type Meta,
} from '@systems/meta';
import { armContent } from '@systems/map-update';
import { coloniesOf } from '@systems/lineage';
import {
  META_STORAGE_KEY, META_V1_KEY, META_VERSION, COLONY_HISTORY_MAX_PER_WORLD, ROUTE_HISTORY_RUNS, NOTABLE_EVENTS_MAX,
} from '@data/tuning';
import { run2Arm, RUN1_TRAIL } from '../world/run2-fixture';
import { stubStorage, pageOpen, storedMeta, receiveToReport, beamTo, finalReport, WORKED_ROUTE } from './save-fixture';
import { continueAfterReport } from '@systems/run';

const progress = (trail: UnitTrail | null = null, unit = 47) => ({
  unit, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail,
});
const corruptOf = (record: unknown): string => {
  try {
    parseMeta(JSON.stringify(record));
    return 'read';
  } catch (error) {
    return error instanceof MetaCorrupt ? error.message : `threw ${(error as Error).message}`;
  }
};
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const withArm = (arm: ArmState): Raw => ({ ...freshMeta(1), runs: 1, arm: structuredClone(arm) });

// --- The strict parse ------------------------------------------------------------------------------------------------------
const arm = run2Arm(1);
const good = withArm(arm);
check('a record with a stored arm (run 2\'s, §3.14) reads back exactly', JSON.stringify(parseMeta(JSON.stringify(good)).arm) === JSON.stringify(arm));
const broken: [string, (record: Raw) => void, string][] = [
  ['an arm with an unknown field', (record) => { record.arm.extra = 1; }, 'arm has unknown fields'],
  ['an arm ship with text for a flag', (record) => { record.arm.ships[4].late = 'no'; }, 'arm.ships[4].late'],
  ['an arm ship out of its slot', (record) => { record.arm.ships[4].slot = 5; }, 'arm.ships[4].slot'],
  ['an arm ship missing its reservations', (record) => { delete record.arm.ships[6].reserved; }, 'arm.ships[6]'],
  ['an arm ship that does not build', (record) => { record.arm.ships[4].pods = 99; }, 'does not build'],
  ['a departure with an unknown reason', (record) => { record.arm.departures = [{ slot: 1, name: 'PETREL', reason: 'bored', words: null }]; }, 'arm.departures[0].reason'],
  ['a colony with no name', (record) => { record.colonies = [{ run: 1, unit: 47, slot: 2, year: 2352, landed: 200, name: '' }]; }, 'colonies[0].name'],
  ['a route with a fractional slot', (record) => { record.routes = [{ run: 1, unit: 47, slots: [0, 2.5] }]; }, 'routes[0].slots[1]'],
  ['an event of an unknown kind', (record) => { record.events = [{ kind: 'party', slot: 0, shipName: 'X', value: 1 }]; }, 'events[0].kind'],
  ['notes with an unknown field', (record) => { record.notes.extra = true; }, 'notes has unknown fields'],
  ['a trace (slice 7 places them)', (record) => { record.traces = [{}]; }, 'traces is not empty'],
  ['mergeBonus at version 3 (retired)', (record) => { record.mergeBonus = false; }, 'unknown fields (mergeBonus)'],
];
const wrong = broken.filter(([, change, why]) => {
  const record = structuredClone(good);
  change(record);
  return !corruptOf(record).includes(why);
});
check('the strict parse refuses, naming the field: the arm, its ships, departures, colonies, routes, events, notes, traces, a retired field',
  wrong.length === 0, wrong.map(([what, change]) => { const record = structuredClone(good); change(record); return `${what}: ${corruptOf(record)}`; }).join(' | '));

// --- Migration in place (2 → 3) -----------------------------------------------------------------------------------------------
const trail: UnitTrail = { unit: 47, run: 1, startYear: 2300, stops: [{ slot: 0, shipName: 'ARES-VII', year: 2300, outcome: null, landed: 0, colony: null, writer: null }], lost: null };
const v2 = (armSeed: number): Raw => {
  const { version: _version, ...rest } = recordRunStart(freshMeta(armSeed), progress(trail), 0);
  void _version;
  return { ...rest, version: 2, mergeBonus: true };
};
{
  const placeholder = readMeta(JSON.stringify(v2(0)));
  check('a foundation record (version 2, mergeBonus, arm seed 0) migrates to version 3: no mergeBonus, the seed null, its run kept without a trail',
    placeholder.changed && placeholder.meta.version === META_VERSION && !('mergeBonus' in placeholder.meta) && placeholder.meta.armSeed === null
    && placeholder.meta.activeRun?.unit === 47 && placeholder.meta.activeRun.trail === null && placeholder.meta.runs === 1, JSON.stringify(placeholder.meta));
  const seeded = readMeta(JSON.stringify(v2(1234)));
  check('…a version-2 record with a real seed keeps it and its run\'s trail', seeded.changed && seeded.meta.armSeed === 1234
    && JSON.stringify(seeded.meta.activeRun?.trail) === JSON.stringify(trail));
  check('…an abandoned run without a trail records where it was with no world update (no arm to place it on)',
    abandonUpdate(placeholder.meta) === null && recordAbandon(placeholder.meta, null).lastUnit?.cause === 'abandoned');
  const storage = stubStorage({ [META_STORAGE_KEY]: JSON.stringify(v2(1234)) });
  openRunArchive(storage.provider, 99);
  check('…the page writes the migrated record back at once (version 3 on disk)', storedMeta(storage).version === META_VERSION
    && !('mergeBonus' in storedMeta(storage)));
  closeArchive();
  check('a version this build does not know (1, or 4) is corrupt', corruptOf({ ...good, version: 1 }).includes('version')
    && corruptOf({ ...good, version: META_VERSION + 1 }).includes('version'));
}

// --- A v1 archive ----------------------------------------------------------------------------------------------------------
{
  const v1 = '{"version":1,"runs":4}';
  const storage = stubStorage({ [META_V1_KEY]: v1 });
  const loaded = loadMeta(storage.provider, 7);
  check('a v1 archive is not carried over: a fresh v2 (UNIT-047, the page seed) that says so once (notes.olderArchive)', loaded.ok && loaded.changed
    && loaded.meta.runs === 0 && loaded.meta.armSeed === 7 && loaded.meta.notes.olderArchive);
  const store = createStore<GameState>(createInitialState({ seed: 7 }));
  pageOpen(store, storage, 7);
  check('…the page writes it (so the note comes from the stored record); the v1 key is never touched', (storedMeta(storage).notes as { olderArchive: boolean }).olderArchive
    && storage.data.get(META_V1_KEY) === v1 && storage.log.every((entry) => entry.key !== META_V1_KEY));
  archiveNotesSaid(store);
  pageOpen(store, storage, 8);
  check('…once said (archiveNotesSaid) it is cleared, and the next page does not say it again', !archiveMeta().notes.olderArchive
    && !(storedMeta(storage).notes as { olderArchive: boolean }).olderArchive);
  closeArchive();
}

// --- The content reset -------------------------------------------------------------------------------------------------------
{
  const old: Raw = withArm(arm);
  old.arm.content.generator = armContent().generator - 1;
  old.arm.ships[3].pods = 99;   // made by other content: never read, never validated
  old.colonies = coloniesOf(RUN1_TRAIL);
  old.lastUnit = { number: 47, landed: 11000, shipName: 'LAST LIGHT', cause: 'won-purge', stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: RUN1_TRAIL, skills: null };
  old.routes = [{ run: 1, unit: 47, slots: RUN1_TRAIL.stops.map((stop) => stop.slot) }];
  old.runs = 2;
  old.activeRun = { unit: 48, startedAt: 0, shipName: 'ARES-VIII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [47], trail: { ...trail, unit: 48, run: 2 } };
  const read = readMeta(JSON.stringify(old));
  const reset = read.meta;
  check('an arm made by another generator is a content reset, not corrupt: a fresh roll for the next run (3) from its start year, the title told once',
    read.changed && reset.notes.armReset && reset.arm !== null && reset.arm.run === 3 && reset.arm.startYear === arm.startYear
    && JSON.stringify(reset.arm.content) === JSON.stringify(armContent()), JSON.stringify(reset.arm?.content));
  check('…the lineage, colonies and history kept (last unit, colonies, routes)', reset.lastUnit?.number === 47 && reset.colonies.length === old.colonies.length
    && reset.routes.length === 1 && reset.runs === 2);
  check('…the run in progress on the old arm keeps no trail, and abandoning it runs no update (the fresh arm is already the next run\'s)',
    reset.activeRun?.trail === null && abandonUpdate(reset) === null && recordAbandon(reset, null).arm?.run === 3);
}

// --- The record at run end on the worked route ----------------------------------------------------------------------------
{
  const storage = stubStorage();
  const store = createStore<GameState>(createInitialState({ seed: 9 }));
  pageOpen(store, storage, 9);
  receiveToReport(store);
  for (const slot of WORKED_ROUTE.slice(1)) beamTo(store, slot);
  finalReport(store, 'merged');
  continueAfterReport(store);
  const meta = parseMeta(storage.data.get(META_STORAGE_KEY)!);
  check('RUN END writes archive v2\'s record: UNIT-047 won-merge, its trail the worked route with the approach years, no run in progress',
    meta.lastUnit?.cause === 'won-merge' && JSON.stringify(meta.lastUnit.trail?.stops.map((stop) => stop.slot)) === JSON.stringify(WORKED_ROUTE)
    && meta.lastUnit.trail?.stops[1]?.year === 2352 && meta.activeRun === null && meta.endingsSeen.includes('merge'));
  check('…the route kept, the next arm from the world update (run 2, the run\'s own arm seed), run.next UNIT-048',
    JSON.stringify(meta.routes.at(-1)) === JSON.stringify({ run: 1, unit: 47, slots: WORKED_ROUTE }) && meta.arm?.run === 2 && meta.armSeed === 9
    && meta.arm.armSeed === 9 && store.getState().run.next?.unit === 48 && store.getState().run.next?.startYear === meta.arm.startYear);
  check('…and the next lineage reads it: UNIT-048, wave 2, no MERGE bonus (deleted), the stored arm, the last unit in the history',
    lineageOf(meta).unitNumber === 48 && !('mergeBonus' in lineageOf(meta)) && lineageOf(meta).arm?.gap === meta.arm?.gap
    && lineageOf(meta).history.lastUnitNumber === 47);
}

// --- The caps -----------------------------------------------------------------------------------------------------------------
{
  let meta: Meta = freshMeta(1);
  const stop = (run: number) => ({ slot: 2, shipName: 'HALCYON', year: 2300 + run, outcome: 'locked' as const, landed: 200, colony: `C${run}`, writer: null });
  for (let run = 1; run <= COLONY_HISTORY_MAX_PER_WORLD + 3; run++) {
    const runTrail: UnitTrail = { unit: 46 + run, run, startYear: 2300, stops: [{ ...stop(run), slot: 0, colony: null, landed: 0 }, stop(run)], lost: null };
    meta = recordRunEnd(recordRunStart(meta, progress(runTrail, 46 + run), 0), {
      ...progress(runTrail, 46 + run), cause: 'won-purge', score: 0,
      events: Array.from({ length: NOTABLE_EVENTS_MAX + 2 }, (_, i) => ({ kind: 'best-colony' as const, slot: 2, shipName: 'HALCYON', value: i })),
    });
  }
  check(`the caps: at most ${COLONY_HISTORY_MAX_PER_WORLD} colonies a world (the newest), the last ${ROUTE_HISTORY_RUNS} routes, ${NOTABLE_EVENTS_MAX} events`,
    meta.colonies.length === COLONY_HISTORY_MAX_PER_WORLD && meta.colonies[0]!.name === 'C4' && meta.colonies.at(-1)!.name === `C${COLONY_HISTORY_MAX_PER_WORLD + 3}`
    && meta.routes.length === ROUTE_HISTORY_RUNS && meta.routes.at(-1)!.run === COLONY_HISTORY_MAX_PER_WORLD + 3 && meta.events.length === NOTABLE_EVENTS_MAX,
    `${meta.colonies.map((colony) => colony.name).join()} ${meta.routes.length} ${meta.events.length}`);
  check('…and the record round-trips through the strict parse', JSON.stringify(parseMeta(JSON.stringify(meta))) === JSON.stringify(meta));
  const storage = stubStorage();
  check('…and saves', saveMeta(storage.provider, meta) === 'ok');
}

finish();
