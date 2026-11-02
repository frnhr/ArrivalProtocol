// Slice 3c foundation, review follow-up: the shared seams the tracks build on, pure or on a stub archive (<1 s).
// • The arm seed: a headless lineage's is null ("the run seed"), so every suite's run-1 arm is the one it always had; the
//   page's fresh archive takes the page seed; a lineage that names one rolls the arm from it and the noise from the run seed.
// • The archive and the save migrate in place (migrateMeta, migrateRunSave): the current version passes, an unknown one is
//   refused.
// • mapHistoryOf and createRunMap's agreement check; visitsOf; the beacon, the letters and the older colonies; SHIP DONE
//   refreshes the run in progress; the title's notes are cleared once said.
import { isDeepStrictEqual } from 'node:util';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { MetaStorage } from '@systems/storage';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { assembleRun1Arm } from '@systems/map-generator';
import { rollNoiseClouds } from '@systems/map-noise';
import { noiseRng } from '@systems/map-streams';
import {
  FIRST_RUN_LINEAGE, freshMeta, lineageOf, loadMeta, parseMeta, migrateMeta, openRunArchive, closeArchive, archiveRunStarted,
  archiveShipDone, archiveNotesSaid, archiveMeta,
} from '@systems/meta';
import { migrateRunSave } from '@systems/save-codec';
import { endShip } from '@systems/run';
import { mapHistoryOf, visitsOf, beaconOnFirstShip, letterSourcesFromTrail, olderColonies } from '@systems/lineage';
import { META_STORAGE_KEY, META_VERSION, RUN_SAVE_VERSION } from '@data/tuning';
import { run2Arm, run2Map, run2History, RUN1_LAST_UNIT } from './run2-fixture';

const throws = (fn: () => unknown): boolean => { try { fn(); return false; } catch { return true; } };

// --- The arm seed ---------------------------------------------------------------------------------------------------------
check('a headless lineage names no arm seed (null: the run seed), and lineageOf(freshMeta()) neither', FIRST_RUN_LINEAGE.armSeed === null
  && lineageOf(freshMeta()).armSeed === null);
const unchanged = [3, 7, 19].filter((seed) => {
  const map = createRunMap(FIRST_RUN_LINEAGE, seed);
  return map.armSeed === seed && isDeepStrictEqual(map.arm, assembleRun1Arm(seed)) && isDeepStrictEqual(map.noise, rollNoiseClouds(noiseRng(seed)));
});
check('run 1\'s arm is unchanged on the suites\' seeds (3, 7, 19): rolled from the run seed', unchanged.length === 3, unchanged.join());
const named = createRunMap({ ...lineageOf(freshMeta(9)), wave: 1 }, 4);
check('a lineage that names an arm seed rolls the arm from it, and the noise from the run seed', named.armSeed === 9
  && isDeepStrictEqual(named.arm, assembleRun1Arm(9)) && isDeepStrictEqual(named.noise, rollNoiseClouds(noiseRng(4))));
const empty = (): MetaStorage => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
const fresh = loadMeta(empty, 77);
check('the page\'s fresh archive takes the page seed; null and a number both round-trip', fresh.ok && fresh.meta.armSeed === 77
  && parseMeta(JSON.stringify(freshMeta())).armSeed === null && parseMeta(JSON.stringify(freshMeta(77))).armSeed === 77);

// --- Migrations ------------------------------------------------------------------------------------------------------------
const current = JSON.parse(JSON.stringify(freshMeta())) as Record<string, unknown>;
check('the archive at META_VERSION passes migrateMeta as it is; an unknown version (older or newer) is corrupt',
  migrateMeta(current) === current && throws(() => migrateMeta({ ...current, version: 1 })) && throws(() => migrateMeta({ ...current, version: META_VERSION + 1 })));
const save = { saveVersion: RUN_SAVE_VERSION, other: 1 };
check('a run save at RUN_SAVE_VERSION passes migrateRunSave as it is; an unknown one is left for check 2 to refuse',
  migrateRunSave(save) === save && migrateRunSave({ saveVersion: 99 }).saveVersion === 99);

// --- The history and the map ------------------------------------------------------------------------------------------------
const arm = run2Arm(1);
const history = mapHistoryOf(arm, RUN1_LAST_UNIT, run2History().colonies, run2History().routes);
check('mapHistoryOf: the arm\'s gap, valve years, serial and departures, the last unit\'s number, the colonies and routes',
  isDeepStrictEqual(history, run2History()), JSON.stringify(history).slice(0, 200));
check('…no arm and no last unit is the empty history', isDeepStrictEqual(mapHistoryOf(null, null, [], []), {
  gap: 0, valveYears: 0, finalSerial: 0, lastUnitNumber: null, departures: [], colonies: [], routes: [],
}));
check('createRunMap keeps the lineage\'s history, and throws when a stored arm disagrees with it',
  isDeepStrictEqual(createRunMap({ wave: 2, armSeed: 1, arm, history }, 5).history, history)
  && throws(() => createRunMap({ wave: 2, armSeed: 1, arm, history: { ...history, gap: 4 } }, 5)));

// --- Visits, the beacon, the letters, the older colonies ----------------------------------------------------------------------
const run1 = createInitialState({ seed: 3, phase: 'title', map: createRunMap(FIRST_RUN_LINEAGE, 3) });
check('run 1\'s beacon is 046\'s, a year before 2300', isDeepStrictEqual(beaconOnFirstShip(run1), { unit: 46, yearsAgo: 1 }));
const run2 = createInitialState({ seed: 3, phase: 'title', map: run2Map(1), lineage: { ...FIRST_RUN_LINEAGE, wave: 2, unitNumber: 48, lastUnit: RUN1_LAST_UNIT } });
check('run 2\'s beacon is UNIT-047\'s, the gap ago; THIS YEAR at gap 0; none when ship 1 never reached orbit',
  isDeepStrictEqual(beaconOnFirstShip(run2), { unit: 47, yearsAgo: 1 })
  && beaconOnFirstShip({ run: { ...run2.run, map: { ...run2.run.map, startYear: 2300 } } })?.yearsAgo === 0
  && beaconOnFirstShip({ run: { ...run2.run, lastUnit: { ...RUN1_LAST_UNIT, trail: { ...RUN1_LAST_UNIT.trail!, stops: RUN1_LAST_UNIT.trail!.stops.map((stop) => ({ ...stop, outcome: 'crashed' as const })) } } } }) === null);
const letters = letterSourcesFromTrail(run2.run);
check('letters to the unit ahead: one per colony of the trail, `letter:1:<slot>`, signed by the stop\'s writer; none on run 1',
  letters.length === 6 && letters[0]!.id === 'letter:1:0' && letters[0]!.colony === 'RIVERSIDE' && letters[0]!.toUnit === 47
  && letters[0]!.writer?.name === 'Okafor, Amara' && letters.every((letter) => letter.landedYear > 0) && letterSourcesFromTrail(run1.run).length === 0);
check('older colonies: only those the galaxy year has reached (RIVERSIDE in 2301; all six by 3021)',
  olderColonies(run2.run.map).map((colony) => colony.name).join() === 'RIVERSIDE'
  && olderColonies({ ...run2.run.map, galaxyYear: 3021 }).length === 6);
check('visitsOf: the route\'s stops, a colony where an LZ landing happened', isDeepStrictEqual(visitsOf(run2.run), [{ slot: 0, colony: false }]));

// --- SHIP DONE refreshes the run in progress; the title's notes are said once -------------------------------------------------
{
  const data = new Map<string, string>();
  let writes = 0;
  const storage: MetaStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); writes++; }, removeItem: (key) => { data.delete(key); } };
  openRunArchive(() => storage, 3);
  const world = createStore<GameState>(createInitialState({ seed: 3, phase: 'boot', map: createRunMap(FIRST_RUN_LINEAGE, 3), archive: { status: 'ok' } }));
  archiveRunStarted(world, 0);
  check('RUN START: the run in progress has ship 1 with no outcome yet', archiveMeta().activeRun?.trail?.stops[0]?.outcome === null);
  endShip(world, 'locked');
  archiveShipDone(world);
  check('SHIP DONE: the run in progress takes the ship\'s result (a run abandoned at the desk keeps it)',
    archiveMeta().activeRun?.trail?.stops[0]?.outcome === 'locked' && parseMeta(data.get(META_STORAGE_KEY)!).activeRun?.trail?.stops[0]?.outcome === 'locked');
  closeArchive();
  data.set(META_STORAGE_KEY, JSON.stringify({ ...freshMeta(3), notes: { olderArchive: true, armReset: true } }));
  openRunArchive(() => storage, 3);
  const before = writes;
  archiveNotesSaid(world);
  const afterOnce = writes;
  archiveNotesSaid(world);
  check('the title\'s notes are cleared once said (one write), and saying them again writes nothing',
    !archiveMeta().notes.olderArchive && !archiveMeta().notes.armReset && afterOnce === before + 1 && writes === afterOnce);
  closeArchive();
}

finish();
