// Track SAVE (slice 3c plan §6.1 save/resume): resuming at each point rebuilds a playable store, on the WP7 harness (every
// DOM-free system mounted, as main.ts mounts them) and run 1's worked route walked with no flights (save-fixture.ts):
// • RUN START: the same ship-1 boot (comparable state), the boot's lines the same once it plays;
// • SHIP DONE: the same desk; SET COURSE then gives the same plan, offer and deliveries as before the reload;
// • BEAM: the state right after the original startShip (minus rev, the UI and the rebuilt free blocks' ids), and the ship
//   replays from its boot with the same lines (decision 5); a second reload replays it again (the boot writes nothing);
// • ENDING CHOSEN: the final LANDING REPORT; its CONTINUE writes the archive once (the run end, the world update, run.next)
//   and clears the save;
// • after every resume resetReport() is empty (nothing left running), the save is spent (no RESUME offered again), and the
//   id counters are past the save's: in this process, and in a fresh one (the suite re-runs itself as a child with
//   `node --import tsx`, resumes there and mints 50 segment ids and 50 log entry ids with no duplicate).
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { Store } from '@state/store';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { setCourse, backToChart, continueAfterReport } from '@systems/run';
import { resetReport } from '@systems/reset';
import { newSegId, freeSegment, highestSegId } from '@systems/memory-ops';
import { logDivider } from '@systems/say';
import { META_STORAGE_KEY, RUN_SAVE_KEY } from '@data/tuning';
import {
  stubStorage, pageOpen, storedSave, storedMeta, receiveToReport, toDesk, beamTo, finalReport, comparable, WORKED_ROUTE, type StubStorage,
} from './save-fixture';

const CHILD = process.argv.indexOf('--child');

// --- The child: a fresh process resumes a stored save and mints ids ------------------------------------------------------
if (CHILD >= 0) {
  const file = process.argv[CHILD + 1]!;
  const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const storage = stubStorage(stored);
  const savedRaw = stored[RUN_SAVE_KEY]!;
  const savedSeg = highestSegId(savedRaw);
  const savedEntry = Math.max(...(JSON.parse(savedRaw) as { log: { entries: { id: number }[] } }).log.entries.map((entry) => entry.id));
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  resumeRun(store);
  const before = store.getState().log.entries.length;
  const minted: string[] = [];
  for (let i = 0; i < 25; i++) minted.push(newSegId('probe'), freeSegment(1).id);
  const memoryIds = store.getState().memory.map((seg) => seg.id);
  store.update((draft) => { for (let i = 0; i < 25; i++) logDivider(draft, 'probe', 0); });
  const entryIds = store.getState().log.entries.map((entry) => entry.id);
  const newEntries = entryIds.slice(before);
  const ids = [...memoryIds, ...minted];
  const dupSegs = ids.filter((id, i) => ids.indexOf(id) !== i);
  const dupEntries = entryIds.filter((id, i) => entryIds.indexOf(id) !== i);
  // Past the save's, not merely unequal: a fresh process's counters start at zero, below every id the save holds.
  const segsPast = minted.every((id) => Number(id.split('~')[1]) > savedSeg);
  const entriesPast = newEntries.length === 50 && newEntries.every((id) => id > savedEntry);
  console.log(JSON.stringify({ phase: store.getState().run.phase, minted: minted.length, savedSeg, savedEntry, segsPast, entriesPast, dupSegs, dupEntries }));
  process.exit(dupSegs.length === 0 && dupEntries.length === 0 && segsPast && entriesPast ? 0 : 1);
}

// --- The parent ------------------------------------------------------------------------------------------------------------
const { createHarness7 } = await import('../wp7/harness7');
const h = createHarness7(1);
const storage: StubStorage = stubStorage();
const state = (): Readonly<GameState> => h.store.getState();
const SEED = 11;

// The boot as it plays (steps until the flight): the lines it says from now on.
function playBoot(store: Store<GameState>): string[] {
  const from = store.getState().log.entries.length;
  h.stepUntil(() => store.getState().run.phase === 'flight', 30);
  return store.getState().log.entries.slice(from).filter((entry) => !entry.divider).map((entry) => `${entry.speaker}:${entry.text}`);
}

// A reload, then RESUME.
function reloadAndResume(label: string): void {
  pageOpen(h.store, storage, SEED + 100);
  const offered = state().save;
  check(`${label}: the reload's title offers RESUME (UNIT-047, its point) and starts on the saved run's unit`,
    state().run.phase === 'title' && offered.status === 'ok' && offered.resume !== null && offered.resume.unit === 47 && state().run.unitNumber === 47,
    JSON.stringify(offered));
  resumeRun(h.store);
  const drift = resetReport();
  check(`${label}: …after RESUME nothing is left running (resetReport empty), the save spent (no RESUME offered again)`,
    drift.length === 0 && pendingRunSave() === null && state().save.resume === null && state().save.status === 'ok',
    drift.map((entry) => `${entry.name}: ${entry.now}`).join(' | '));
}

const differs = (a: unknown, b: unknown): string => {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys(left).filter((key) => !isDeepStrictEqual(left[key], right[key])).join(', ');
};

pageOpen(h.store, storage, SEED);

// --- RUN START -------------------------------------------------------------------------------------------------------------
receiveToReport(h.store);
h.store.update((draft) => { draft.run.phase = 'boot'; });
const atStart = comparable(state());
const startLines = playBoot(h.store);
reloadAndResume('RUN START');
check('RUN START: the same ship-1 boot (the run, the slices, the log, the director\'s done list)', isDeepStrictEqual(comparable(state()), atStart),
  differs(comparable(state()), atStart));
check('…and the boot says the same lines once it plays', isDeepStrictEqual(playBoot(h.store), startLines), startLines.length.toString());

// --- SHIP DONE -------------------------------------------------------------------------------------------------------------
h.store.update((draft) => { draft.run.phase = 'report'; });
toDesk(h.store);
const atDesk = comparable(state());
const deskUi = { selected: state().ui.deskSelected, window: state().ui.deskWindow };
setCourse(h.store, WORKED_ROUTE[1]!);
const plan = structuredClone(state().run.transit);
backToChart(h.store);
reloadAndResume('SHIP DONE');
check('SHIP DONE: the same desk (phase desk, the clock paused, the run and the ship\'s slices as they stood)', state().run.phase === 'desk'
  && state().clock.paused && isDeepStrictEqual(comparable(state()), atDesk), differs(comparable(state()), atDesk));
check('…the desk opens as openDesk opens it (deskUiOnOpen: the selection and the tab, no tool held)',
  state().ui.deskSelected === deskUi.selected && state().ui.deskWindow === deskUi.window && state().ui.activeTool === null);
setCourse(h.store, WORKED_ROUTE[1]!);
check('…SET COURSE then gives the same plan, offer and deliveries as before the reload', isDeepStrictEqual(state().run.transit, plan),
  JSON.stringify(state().run.transit?.offer.map((card) => card.id)));
backToChart(h.store);

// --- BEAM ------------------------------------------------------------------------------------------------------------------
beamTo(h.store, WORKED_ROUTE[1]!);
const atBeam = comparable(state());
check('BEAM: the beam into HALCYON was saved (a boot payload with its racks and verdict)', storedSave(storage).save.point === 'beam'
  && storedSave(storage).save.payload.kind === 'boot');
const beamLines = playBoot(h.store);
reloadAndResume('BEAM');
check('BEAM: the state right after the original startShip (minus rev, the UI and the rebuilt free blocks\' ids)',
  state().run.phase === 'boot' && isDeepStrictEqual(comparable(state()), atBeam), differs(comparable(state()), atBeam));
const replayed = playBoot(h.store);
check(`…the ship replays from its boot with the same ${beamLines.length} lines (decision 5: same seeds, same hits)`,
  beamLines.length > 0 && isDeepStrictEqual(replayed, beamLines), `${replayed.join(' / ')}`);
reloadAndResume('BEAM again');
check('…a second reload replays it again (the boot and the flight write nothing)', isDeepStrictEqual(playBoot(h.store), beamLines));

// --- On to the final ship, then ENDING CHOSEN -----------------------------------------------------------------------------
for (const slot of WORKED_ROUTE.slice(2)) beamTo(h.store, slot);
finalReport(h.store, 'purged');
const atEnd = comparable(state());
reloadAndResume('ENDING CHOSEN');
check('ENDING CHOSEN: LAST LIGHT\'s LANDING REPORT as it stood (the finale purged)', state().run.phase === 'report'
  && state().hollow.finale.phase === 'purged' && isDeepStrictEqual(comparable(state()), atEnd), differs(comparable(state()), atEnd));
const metaWrites = storage.log.filter((entry) => entry.key === META_STORAGE_KEY).length;
continueAfterReport(h.store);
const meta = storedMeta(storage);
check('…its CONTINUE ends the run: the archive written once, lastUnit UNIT-047 won-purge with its six-stop trail, no run in progress',
  state().run.phase === 'end' && storage.log.filter((entry) => entry.key === META_STORAGE_KEY).length === metaWrites + 1
  && (meta.lastUnit as { cause: string; trail: { stops: unknown[] } }).cause === 'won-purge'
  && (meta.lastUnit as { trail: { stops: unknown[] } }).trail.stops.length === 6 && meta.activeRun === null);
check('…the save is cleared, and run.next names UNIT-048 on run 2', !storage.data.has(RUN_SAVE_KEY)
  && state().run.next?.unit === 48 && state().run.next?.run === 2, JSON.stringify(state().run.next));
check('…the archive stores the next arm (run 2) from the world update', (meta.arm as { run: number } | null)?.run === 2);

// --- The id counters -------------------------------------------------------------------------------------------------------
{
  // In this process: a save from earlier in the walk, resumed after the counters have moved on, mints nothing it holds.
  const minted = Array.from({ length: 50 }, () => newSegId('probe'));
  const held = state().memory.map((seg) => seg.id);
  check('in this process the segment counter is past every id in the world (50 new ids, none held)', minted.every((id) => !held.includes(id)));
}
{
  // A fresh process: the BEAM save into KESTREL, resumed where the counters start at zero.
  const children = stubStorage();
  pageOpen(h.store, children, SEED);
  receiveToReport(h.store);
  toDesk(h.store);
  beamTo(h.store, WORKED_ROUTE[1]!);
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.out', 'save');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'resume-child.json');
  writeFileSync(file, JSON.stringify(Object.fromEntries(children.data)));
  const run = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', file], { encoding: 'utf8', env: process.env });
  const report = run.stdout.trim().split('\n').at(-1) ?? '';
  check('a fresh process resumes the BEAM save and mints 50 segment ids and 50 log entry ids with no duplicate', run.status === 0
    && report.includes('"phase":"boot"') && report.includes('"minted":50'), `${report} ${run.stderr.slice(-400)}`);
}

finish();
