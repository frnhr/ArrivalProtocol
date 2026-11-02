// WP8 acceptance 4 (§4.5, §9 WP8 item 4): the archive, pure, on stubbed storage.
// • a localStorage that throws (on reach, on read, on write) → unavailable / a failed save;
// • corrupt JSON, and JSON without the archive's shape → corrupt (never a quiet default);
// • a round trip preserves every field;
// • a leftover activeRun is kept by the load (slice 3c), and abandoned by abandonActiveRun when no save resumes it;
// plus the run accounting (RUN START runs + 1, a ship start keeps the run in progress up to date, RUN END the
// last unit and the best SCORE), the lineage (UNIT-047 + runs on wave runs + 1), the causes RUN END maps to,
// and the live half: an archive that goes OFFLINE mid-run keeps the game going, says so, and stops writing;
// a CORRUPT one is never written over until WIPE or PLAY WITHOUT.
// WP8 fix round 1: the archive's tutorialDone (strict like every field; set by the first lock or a second ship,
// carried by the lineage, never by a run left before either), and 'archive-lost' once when a write fails mid-run.
import { check, finish } from '../wp1/harness';
import {
  loadMeta, saveMeta, parseMeta, freshMeta, recordRunStart, recordShipStart, recordRunEnd, lineageOf, lastCauseOf,
  openRunArchive, closeArchive, archiveLineage, archiveMeta, archiveRunStarted, archiveShipStarted, archiveRunEnded,
  wipeArchive, playWithoutArchive, MetaCorrupt, recordTutorialDone, archiveTutorialDone, abandonActiveRun, type Meta, type MetaStorage,
  type RunProgress,
} from '@systems/meta';
import { on } from '@systems/events';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import type { GameState, RunEndCause } from '@state/schema';
import { META_STORAGE_KEY, META_VERSION, FIRST_UNIT_NUMBER } from '@data/tuning';

// A Map-backed storage; `failOn` makes one operation throw (as a blocked or full localStorage does).
function stub(initial: Record<string, string> = {}, failOn: Set<'get' | 'set' | 'remove' | 'reach'> = new Set()) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: MetaStorage = {
    getItem: (key) => { if (failOn.has('get')) throw new Error('SecurityError: get'); return data.get(key) ?? null; },
    setItem: (key, value) => { if (failOn.has('set')) throw new Error('QuotaExceededError'); data.set(key, value); writes.push(value); },
    removeItem: (key) => { if (failOn.has('remove')) throw new Error('SecurityError: remove'); data.delete(key); },
  };
  const provider = (): MetaStorage => { if (failOn.has('reach')) throw new Error('SecurityError: localStorage'); return storage; };
  return { provider, data, writes, failOn };
}

const progress = (over: Partial<RunProgress> = {}): RunProgress => ({
  unit: 47, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, ...over,
});

// --- Storage that throws: unavailable ---------------------------------------------------------------
{
  const reach = loadMeta(stub({}, new Set(['reach'])).provider);
  check('a localStorage that cannot even be reached → unavailable', !reach.ok && reach.reason === 'unavailable', JSON.stringify(reach));
  const read = loadMeta(stub({}, new Set(['get'])).provider);
  check('a localStorage whose read throws → unavailable', !read.ok && read.reason === 'unavailable', JSON.stringify(read));
  check('a save that throws → unavailable (and nothing pretends it was kept)', saveMeta(stub({}, new Set(['set'])).provider, freshMeta()) === 'unavailable');
  check('a save that works → ok', saveMeta(stub().provider, freshMeta()) === 'ok');
}

// --- Corrupt: never a quiet default -------------------------------------------------------------------
{
  const notJson = loadMeta(stub({ [META_STORAGE_KEY]: '{ runs: 3,' }).provider);
  check('corrupt JSON → corrupt', !notJson.ok && notJson.reason === 'corrupt', JSON.stringify(notJson));
  const shapes: [string, unknown][] = [
    ['an array', []],
    // Slice 3c: archive v2; a v1 record (another version) is corrupt under the v2 key.
    ['another version', { ...freshMeta(), version: 1 }],
    ['runs as text', { ...freshMeta(), runs: '3' }],
    ['a negative bestScore', { ...freshMeta(), bestScore: -5 }],
    ['an unknown cause', { ...freshMeta(), lastUnit: { number: 47, landed: 0, shipName: 'ARES-VII', cause: 'exploded', stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, skills: null } }],
    ['a lastUnit without stats', { ...freshMeta(), lastUnit: { number: 47, landed: 0, shipName: 'ARES-VII', cause: 'stayed', hollowUnits: [46], trail: null, skills: null } }],
    // Slice 3c SAVE: mergeBonus retired (version 3); a version-3 record that still has it is a shape this build does not know.
    ['mergeBonus at version 3', { ...freshMeta(), mergeBonus: false }],
    // WP8 fix round 1: an archive written before tutorialDone existed is corrupt, never read as "not done".
    ['tutorialDone missing', (() => { const meta: Record<string, unknown> = { ...freshMeta() }; delete meta.tutorialDone; return meta; })()],
    ['tutorialDone as text', { ...freshMeta(), tutorialDone: 'yes' }],
    ['an unknown ending', { ...freshMeta(), endingsSeen: ['purge', 'nap'] }],
  ];
  for (const [what, value] of shapes) {
    const result = loadMeta(stub({ [META_STORAGE_KEY]: JSON.stringify(value) }).provider);
    check(`JSON without the archive's shape (${what}) → corrupt`, !result.ok && result.reason === 'corrupt', JSON.stringify(result));
  }
  let thrown: unknown = null;
  try { parseMeta('nope'); } catch (error) { thrown = error; }
  check('parseMeta throws MetaCorrupt (the load turns it into the status)', thrown instanceof MetaCorrupt);
  const empty = loadMeta(stub().provider);
  check('nothing stored yet is a fresh archive, not a failure (a first run)', empty.ok && empty.meta.runs === 0 && empty.meta.lastUnit === null && !empty.changed);
}

// --- A round trip preserves every field ----------------------------------------------------------------
{
  const meta: Meta = {
    version: META_VERSION, runs: 7, bestScore: 9123, endingsSeen: ['purge', 'merge'], tutorialDone: true,
    activeRun: null,
    lastUnit: {
      number: 53, landed: 6200, shipName: 'VESPER', cause: 'overwritten', stats: { moves: 14, deletes: 3 }, hollowUnits: [51, 52], trail: null, skills: null,
    },
    armSeed: 5, arm: null, colonies: [], routes: [], events: [], traces: [], notes: { olderArchive: false, armReset: false },
  };
  const store = stub();
  check('the round trip saves', saveMeta(store.provider, meta) === 'ok');
  const back = loadMeta(store.provider);
  check('…and loads every field back exactly', back.ok && JSON.stringify(back.meta) === JSON.stringify(meta), back.ok ? JSON.stringify(back.meta) : JSON.stringify(back));
  const withRun: Meta = { ...meta, activeRun: { unit: 54, startedAt: 1_700_000_000_000, shipName: 'HALCYON', landed: 2400, stats: { moves: 2, deletes: 0 }, hollowUnits: [53], trail: null } };
  saveMeta(store.provider, withRun);
  check('a saved run in progress parses (parseMeta keeps activeRun)', JSON.stringify(parseMeta(store.data.get(META_STORAGE_KEY)!)) === JSON.stringify(withRun));
}

// --- A leftover activeRun: abandoned only when no run save can resume it (slice 3c plan §2.2) -----------------------------
{
  const started = recordRunStart(freshMeta(), progress(), 1_700_000_000_000);
  const onHalcyon = recordShipStart(started, progress({ shipName: 'HALCYON', landed: 2200, stats: { moves: 1, deletes: 0 } }));
  const store = stub();
  saveMeta(store.provider, onHalcyon);
  const loaded = loadMeta(store.provider);
  check('loading leaves a leftover activeRun as it is (slice 3c: the page\'s open sequence decides)', loaded.ok && !loaded.changed
    && loaded.meta.activeRun?.shipName === 'HALCYON' && loaded.meta.lastUnit === null && loaded.meta.runs === 1,
    loaded.ok ? JSON.stringify(loaded.meta) : JSON.stringify(loaded));
  // The page's open finds no run save: the run is abandoned (abandonActiveRun), written at once.
  const opened = openRunArchive(store.provider);
  abandonActiveRun();
  const stored = parseMeta(store.data.get(META_STORAGE_KEY)!);
  check('…with no save to resume it, abandonActiveRun records it as lastUnit "abandoned", where the unit was, and writes it', opened === 'ok'
    && stored.activeRun === null && stored.lastUnit?.cause === 'abandoned' && stored.lastUnit.number === 47 && stored.lastUnit.shipName === 'HALCYON'
    && stored.lastUnit.landed === 2200 && stored.runs === 1, JSON.stringify(stored));
  check('…the next run is UNIT-048 on wave 2, and its HOLLOW is UNIT-047', archiveLineage().unitNumber === 48 && archiveLineage().wave === 2
    && JSON.stringify(archiveLineage().hollowUnits) === '[47]');
  closeArchive();
}

// --- The tutorial is learned once (WP8 fix round 1) ------------------------------------------------------------
{
  check('a fresh archive has not seen the tutorial flown, and neither has its first lineage', !freshMeta().tutorialDone && !lineageOf(freshMeta()).tutorialDone);
  // RECEIVE, then the page reloads two seconds into run 1: the run counts (UNIT-048 next), the tutorial does not.
  const store = stub();
  saveMeta(store.provider, recordRunStart(freshMeta(), progress(), 0));
  openRunArchive(store.provider);
  abandonActiveRun();
  check('a run left before it locked an orbit or reached a second ship counts as a wave, but taught nothing',
    archiveLineage().unitNumber === 48 && archiveLineage().wave === 2 && archiveLineage().lastUnit?.cause === 'abandoned' && !archiveLineage().tutorialDone);
  closeArchive();
  const done = recordTutorialDone(freshMeta());
  check('recordTutorialDone sets it, and the lineage carries it to the next run', done.tutorialDone && lineageOf(done).tutorialDone);
  check('…and it outlives every later run, an abandoned one too', recordRunEnd(recordRunStart(done, progress(), 0), { ...progress(), cause: 'abandoned', score: 0 }).tutorialDone);
  // Live: the first lock writes it once; every later one finds it done.
  const live = stub();
  openRunArchive(live.provider);
  const world = worldWith('ok');
  archiveRunStarted(world, 0);
  const before = live.writes.length;
  archiveTutorialDone(world);
  check('the first lock writes tutorialDone', live.writes.length === before + 1 && parseMeta(live.data.get(META_STORAGE_KEY)!).tutorialDone);
  archiveTutorialDone(world);
  check('…once: a later lock writes nothing', live.writes.length === before + 1);
  closeArchive();
  // Live: a unit that reaches a second ship has flown ARES-VII (an EMERGENCY from ship 1 never locked there).
  const second = stub();
  openRunArchive(second.provider);
  const crossed = worldWith('ok');
  archiveRunStarted(crossed, 0);
  archiveShipStarted(crossed);
  check('a ship start on ship 1 (the simulation retry) does not count it', !parseMeta(second.data.get(META_STORAGE_KEY)!).tutorialDone);
  crossed.update((d) => { d.run.shipIndex = 1; d.level.shipName = 'HALCYON'; });
  archiveShipStarted(crossed);
  check('…a ship start on ship 2 does, in the same write', parseMeta(second.data.get(META_STORAGE_KEY)!).tutorialDone);
  closeArchive();
}

// --- Run accounting ------------------------------------------------------------------------------------------
{
  const started = recordRunStart(freshMeta(), progress(), 1234.9);
  check('RUN START: runs + 1 and the run in progress set (unit, start time, where it is)', started.runs === 1 && started.activeRun?.unit === 47
    && started.activeRun.startedAt === 1234 && started.activeRun.shipName === 'ARES-VII');
  let threw = false;
  try { recordShipStart(freshMeta(), progress()); } catch { threw = true; }
  check('a ship start with no run started throws (RUN START always comes first)', threw);
  const ended = recordRunEnd(started, { ...progress({ shipName: 'HALCYON', landed: 4200, stats: { moves: 5, deletes: 1 } }), cause: 'overwritten', score: 4100.5 });
  check('RUN END: lastUnit with its stats, the best SCORE, no run in progress', ended.activeRun === null && ended.lastUnit?.cause === 'overwritten'
    && ended.lastUnit.landed === 4200 && ended.lastUnit.stats.moves === 5 && ended.lastUnit.stats.deletes === 1 && ended.bestScore === 4101
    && ended.runs === 1, JSON.stringify(ended));
  const worse = recordRunEnd(recordRunStart(ended, progress({ unit: 48 }), 0), { ...progress({ unit: 48 }), cause: 'stayed', score: 100 });
  check('a worse run keeps the best SCORE', worse.bestScore === 4101 && worse.runs === 2 && worse.lastUnit?.number === 48);
  const merged = recordRunEnd(worse, { ...progress({ unit: 49 }), cause: 'won-merge', score: 0 });
  check('a MERGE is an ending seen; its next-run bonus is retired (slice 3c, risk 3: the lineage never carries it)', merged.endingsSeen.includes('merge')
    && !lineageOf(merged).mergeBonus && !('mergeBonus' in merged));
  const lineage = lineageOf(ended);
  check('the lineage: UNIT-047 + runs on wave runs + 1', lineage.unitNumber === FIRST_UNIT_NUMBER + 1 && lineage.wave === 2 && lineage.lastUnit?.number === 47);
  // WP11: the fleet ends with the flagship, so RUN END's causes are §4.5's, kept one for one (WP7/WP8's interim
  // 'last-ship-lost' → flagship-lost and 'end-of-fleet' → reassigned are gone with the fleet that ended early).
  const map: [RunEndCause, string][] = [
    ['overwritten', 'overwritten'], ['stayed', 'stayed'], ['flagship-lost', 'flagship-lost'],
    ['won-purge', 'won-purge'], ['won-merge', 'won-merge'], ['unresolved', 'unresolved'], ['abandoned', 'abandoned'],
  ];
  check('RUN END\'s causes as the archive keeps them (one for one)', map.every(([cause, kept]) => lastCauseOf(cause) === kept));
  // ...and an archive written with WP8's 'reassigned' is a record this build can't read: CORRUPT, loudly (WIPE ARCHIVE).
  const oldRecord = { ...freshMeta(), runs: 1, lastUnit: { number: 47, woke: 9200, shipName: 'VESPER', cause: 'reassigned', stats: { moves: 0, deletes: 0 }, hollowUnits: [46] } };
  const read = loadMeta(stub({ [META_STORAGE_KEY]: JSON.stringify(oldRecord) }).provider);
  check('…an archive that still holds WP8\'s interim "reassigned" reads ARCHIVE CORRUPT (never a quiet default)', !read.ok && read.reason === 'corrupt', JSON.stringify(read));
}

// --- The live half: OFFLINE mid-run, CORRUPT, WIPE and PLAY WITHOUT ----------------------------------------
function worldWith(status: GameState['archive']['status']) {
  return createStore<GameState>(createInitialState({ seed: 3, phase: 'title', lineage: archiveLineage(), archive: { status } }));
}
{
  const store = stub();
  check('an empty archive opens ok', openRunArchive(store.provider) === 'ok');
  const world = worldWith('ok');
  archiveRunStarted(world, 1000);
  check('RUN START is written (runs 1, a run in progress)', parseMeta(store.data.get(META_STORAGE_KEY)!).runs === 1
    && parseMeta(store.data.get(META_STORAGE_KEY)!).activeRun !== null);
  store.failOn.add('set');
  let lost = 0;
  const offLost = on('archive-lost', () => { lost++; });
  world.update((d) => { d.run.shipIndex = 1; d.level.shipName = 'HALCYON'; });
  archiveShipStarted(world);
  check('storage that throws mid-run: the archive goes OFFLINE and says so; nothing throws into the game',
    world.getState().archive.status === 'offline');
  check('…the game hears it once (\'archive-lost\': the TERMINAL line and the buzz)', lost === 1);
  const writesBefore = store.writes.length;
  store.failOn.delete('set');
  archiveRunEnded(world, 'stayed');
  check('…and stays offline for the page: nothing more is written, even once storage works again', store.writes.length === writesBefore
    && world.getState().archive.status === 'offline');
  check('…while the session still counts the run (a NEW RUN in this page is UNIT-048)', archiveMeta().lastUnit?.cause === 'stayed'
    && archiveLineage().unitNumber === 48);
  check('…and the loss was announced only once', lost === 1);
  offLost();
  closeArchive();
}
{
  const store = stub({ [META_STORAGE_KEY]: 'garbage' });
  const opened = openRunArchive(store.provider);
  check('a corrupt archive opens as CORRUPT, with a fresh session copy (UNIT-047), not pretending it loaded', opened === 'corrupt'
    && archiveLineage().unitNumber === 47);
  const world = worldWith('corrupt');
  archiveRunStarted(world, 0);
  archiveRunEnded(world, 'overwritten');
  check('…and it is never written over by the run (until the kid chooses)', store.data.get(META_STORAGE_KEY) === 'garbage' && store.writes.length === 0);
  playWithoutArchive(world);
  archiveRunStarted(world, 0);
  check('PLAY WITHOUT ARCHIVE: status "without", still nothing written', world.getState().archive.status === 'without' && store.data.get(META_STORAGE_KEY) === 'garbage');
  closeArchive();
}
{
  const store = stub({ [META_STORAGE_KEY]: 'garbage' });
  openRunArchive(store.provider);
  const world = worldWith('corrupt');
  wipeArchive(world);
  check('WIPE ARCHIVE: the bad record is removed, the archive is ok and fresh', world.getState().archive.status === 'ok'
    && !store.data.has(META_STORAGE_KEY) && archiveMeta().runs === 0);
  archiveRunStarted(world, 0);
  check('…and the next RUN START is written', parseMeta(store.data.get(META_STORAGE_KEY)!).runs === 1);
  let threw = false;
  try { wipeArchive(world); } catch { threw = true; }
  check('WIPE on an archive that is not corrupt throws (it is only ever the kid\'s answer to CORRUPT)', threw);
  closeArchive();
}
{
  const store = stub({}, new Set(['get']));
  check('an archive whose read throws opens OFFLINE', openRunArchive(store.provider) === 'offline');
  closeArchive();
  const world = createStore<GameState>(createInitialState({ seed: 3, phase: 'title' }));
  let threw = false;
  try { archiveRunStarted(world, 0); } catch { threw = true; }
  check('a headless world with no archive (status none) records nothing and does not throw', !threw && world.getState().archive.status === 'none');
  world.update((d) => { d.archive = { status: 'ok' }; });
  threw = false;
  try { archiveRunStarted(world, 0); } catch { threw = true; }
  check('…but a world that claims an archive with none opened throws (a bug, never a quiet skip)', threw);
}

finish();
