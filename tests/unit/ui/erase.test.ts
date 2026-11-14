// Playtest 1 note 1 (plan §3.12, OPEN-DECISIONS 138): ERASE ALL RECORDS on the title. On stubbed storage, opened the way the
// page opens it (save/save-fixture pageOpen):
// • a played browser (run 1 to RUN END, then run 2 beamed to its second ship: the archive names UNIT-047 and the run save
//   holds UNIT-048's run) is erased by the title's eraseAllRecords: every key of the game's is gone (the three named keys
//   and any other under `arrival-protocol/`), a key that is not the game's stays, and the archive writes nothing more
//   before the reload;
// • the reload is a first visit: its title, its state and what it stores are exactly a never-played browser's on the same
//   seed (UNIT-047 · YEAR 2300, run 1, the tutorial, no RESUME);
// • a browser that refuses the remove says 'failed' (the title's ERASE FAILED) and nothing reloads;
// • the confirm's keys (systems/title.ts titleEraseKey): [DEL] erases, ENTER and ESC keep, nothing else answers, and
//   RECEIVE's ENTER waits while it asks; the words fit the title.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { MetaStorage } from '@systems/storage';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { archiveMeta, archiveShipDone, eraseAllRecords, eraseEverything, gameKeysIn, GAME_KEY_PREFIX, GAME_STORAGE_KEYS } from '@systems/meta';
import { titleModel, titleEraseKey, setTitleEraseAsking, titleEraseAsking } from '@systems/title';
import { continueAfterReport } from '@systems/run';
import { ARCHIVE_TEXT } from '@data/script';
import { META_STORAGE_KEY, META_V1_KEY, RUN_SAVE_KEY, MAX_LINE_CHARS } from '@data/tuning';
import { stubStorage, pageOpen, receiveToReport, beamTo, finalReport, comparable, WORKED_ROUTE, type StubStorage } from '../save/save-fixture';

const SEED = 5;
const FOREIGN = 'someone-else/settings';

// A stub that lists its keys, as localStorage does (Storage.length, key(i)), so the erase finds keys it does not name.
function listed(storage: StubStorage): StubStorage {
  const base = storage.provider;
  const provider = (): MetaStorage => {
    const inner = base();
    return Object.assign(Object.create(inner) as MetaStorage, {
      get length(): number { return storage.data.size; },
      key: (index: number): string | null => [...storage.data.keys()][index] ?? null,
    });
  };
  return { ...storage, provider };
}

const page = (storage: StubStorage) => {
  const store = createStore<GameState>(createInitialState({ seed: SEED }));
  pageOpen(store, storage, SEED);
  return store;
};
const titleOf = (store: ReturnType<typeof page>) => titleModel(store.getState(), archiveMeta().notes);
const gameKeys = (storage: StubStorage): string[] => [...storage.data.keys()].filter((key) => key.startsWith(GAME_KEY_PREFIX)).sort();

// --- A never-played browser: what a first visit stores and shows ------------------------------------------------------------
const virgin = listed(stubStorage());
const first = page(virgin);
const firstTitle = titleOf(first);
const firstState = comparable(first.getState());
const firstStored = new Map(virgin.data);
check('a first visit: UNIT-047 · YEAR 2300, RECEIVE offered, no RESUME, run 1 with the tutorial',
  /^UNIT-047 · YEAR 2300 · /.test(firstTitle.unitLine) && firstTitle.receive && firstTitle.save === null
  && first.getState().run.unitNumber === 47 && first.getState().run.tutorial && firstTitle.erase, firstTitle.unitLine);

// --- A played browser: run 1 to RUN END, run 2 on its second ship ----------------------------------------------------------
const played = listed(stubStorage({ [META_V1_KEY]: '{"phase 2":true}', [FOREIGN]: 'keep me', [`${GAME_KEY_PREFIX}future/v1`]: '{}' }));
{
  const run1 = page(played);
  receiveToReport(run1);
  for (const slot of WORKED_ROUTE.slice(1)) beamTo(run1, slot);
  finalReport(run1, 'purge');
  continueAfterReport(run1);
}
const run2 = page(played);
const run2Title = titleOf(run2);
receiveToReport(run2);
beamTo(run2, WORKED_ROUTE[1]!);
check('played: the archive and the run save are stored, and the title had named UNIT-048',
  played.data.has(META_STORAGE_KEY) && played.data.has(RUN_SAVE_KEY) && /^UNIT-048 /.test(run2Title.unitLine), run2Title.unitLine);
check('gameKeysIn lists the named keys and the other `arrival-protocol/` key, not the foreign one',
  JSON.stringify(gameKeysIn(played.provider).sort()) === JSON.stringify([...GAME_STORAGE_KEYS, `${GAME_KEY_PREFIX}future/v1`].sort()),
  gameKeysIn(played.provider).join(', '));

// --- ERASE ALL RECORDS ----------------------------------------------------------------------------------------------------------
const logBefore = played.log.length;
check('the erase takes', eraseAllRecords() === 'ok');
check('after the erase, storage holds nothing of the game\'s', gameKeys(played).length === 0, gameKeys(played).join(', '));
check('…and a key that is not the game\'s is left alone', played.data.get(FOREIGN) === 'keep me');
archiveShipDone(run2); // a write the archive always makes (SHIP DONE): none comes after the erase
check('…and the archive writes nothing more before the reload (only removes in the log since)',
  played.log.slice(logBefore).every((entry) => entry.kind === 'remove') && !played.data.has(META_STORAGE_KEY),
  JSON.stringify(played.log.slice(logBefore)));

// --- The reload: a first visit -----------------------------------------------------------------------------------------------
const reloaded = page(played);
const reloadedTitle = titleOf(reloaded);
check('the reload\'s title is a first visit\'s, field for field', JSON.stringify(reloadedTitle) === JSON.stringify(firstTitle),
  `${reloadedTitle.unitLine} | ${firstTitle.unitLine}`);
check('…its state is a first visit\'s (run 1, UNIT-047, the authored arm, the tutorial)',
  JSON.stringify(comparable(reloaded.getState())) === JSON.stringify(firstState) && reloaded.getState().run.unitNumber === 47
  && reloaded.getState().run.map.run === 1 && reloaded.getState().run.tutorial && reloaded.getState().run.lastUnit === null);
const reloadedGame = new Map([...played.data].filter(([key]) => key.startsWith(GAME_KEY_PREFIX)));
check('…and it stores exactly what a first visit stores', JSON.stringify([...reloadedGame]) === JSON.stringify([...firstStored]),
  `${[...reloadedGame.keys()].join(', ')} | ${[...firstStored.keys()].join(', ')}`);
check('…with no run save and no older-archive note', !played.data.has(RUN_SAVE_KEY) && reloadedTitle.notes.length === 0
  && reloaded.getState().save.resume === null);

// --- A browser that refuses -------------------------------------------------------------------------------------------------
{
  const stuck = stubStorage({ [RUN_SAVE_KEY]: 'x', [META_STORAGE_KEY]: 'y' });
  stuck.fail.remove = true;
  check('a remove the browser refuses: failed (the title says ERASE FAILED, nothing reloads)', eraseEverything(stuck.provider) === 'failed');
  stuck.fail.remove = false;
  stuck.fail.reach = true;
  check('…and storage that cannot be reached: failed too', eraseEverything(stuck.provider) === 'failed');
  stuck.fail.reach = false;
  check('a stub that cannot list its keys still loses the named ones', eraseEverything(stuck.provider) === 'ok' && stuck.data.size === 0);
}

// --- The confirm's keys and words -------------------------------------------------------------------------------------------
check('[DEL] (Delete, Backspace) erases while it asks', titleEraseKey('Delete', true) === 'erase' && titleEraseKey('Backspace', true) === 'erase');
check('ENTER and ESC keep', titleEraseKey('Enter', true) === 'keep' && titleEraseKey('NumpadEnter', true) === 'keep' && titleEraseKey('Escape', true) === 'keep');
check('nothing else answers, and nothing answers while it is not asking',
  titleEraseKey('Space', true) === null && titleEraseKey('KeyY', true) === null && titleEraseKey('Delete', false) === null && titleEraseKey('Enter', false) === null);
setTitleEraseAsking(true);
const waits = titleEraseAsking();
setTitleEraseAsking(false);
check('RECEIVE\'s ENTER can tell the confirm is up (systems/boot.ts waits on it)', waits && !titleEraseAsking());
check('the title offers it only on the title (not while booting)', !titleModel({ ...first.getState(), run: { ...first.getState().run, phase: 'boot' } }, null).erase);
const words = [ARCHIVE_TEXT.erase.button, ARCHIVE_TEXT.erase.confirm, ARCHIVE_TEXT.erase.eraseKey, ARCHIVE_TEXT.erase.keepKey, ARCHIVE_TEXT.erase.failed];
check(`the words fit a line (≤ ${MAX_LINE_CHARS})`, words.every((line) => line.length <= MAX_LINE_CHARS), words.map((line) => line.length).join(' '));
check('the words as the plan has them', ARCHIVE_TEXT.erase.button === 'ERASE ALL RECORDS'
  && ARCHIVE_TEXT.erase.confirm === 'ERASE EVERY UNIT, COLONY AND RUN? · THIS CANNOT BE UNDONE'
  && ARCHIVE_TEXT.erase.eraseKey === 'ERASE [DEL]' && ARCHIVE_TEXT.erase.keepKey === 'KEEP [ENTER]');

finish();
