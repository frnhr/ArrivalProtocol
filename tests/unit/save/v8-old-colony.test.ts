// Slice 8 POLISH (the 7d review's NOTED edge; docs/phase3/impl/slice-8-plan.md "Deviations (POLISH)"): a v8 run resumed past an
// old colony `?` ship. 7d derives the old colony's letter from the route, so a run saved before 7d would find it in the
// INBOX at a boot it had already flown, flagged new. The 8 → 9 migration (save-codec.ts migrateRunSave8) marks it read:
// • the v8 HERON desk (tests/unit/save/fixtures/run-save-v8-ship-done-heron.json) with HALCYON, a stop it booted on, made the
//   old colony by hand: its letter is in run.inbox.read, the save decodes and resumes, the letter is in the INBOX and not
//   unread;
// • a BEAM save whose last stop is the old colony (its boot still to come) keeps that letter unread, to be read at the boot;
// • a v8 run with no old colony passed: run.inbox.read unchanged.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { inboxMessages, inboxUnread } from '@systems/inbox';
import { stubStorage, pageOpen } from './save-fixture';
import { RUN_SAVE_KEY, META_STORAGE_KEY, RUN_SAVE_VERSION } from '@data/tuning';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const FILE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'run-save-v8-ship-done-heron.json');
const fixture = (): { save: Raw; meta: Raw } => JSON.parse(readFileSync(FILE, 'utf8'));
// The fixture's route: ARES-VII (slot 0), HALCYON (2), HERON (4), at HERON's desk.
const asOldColony = (save: Raw, slot: number): void => { save.payload.run.map.arm[slot].reserved.unknownEvent = 'old-colony'; };

{
  const raw = fixture();
  const plain = migrateRunSave(raw.save) as Raw;
  check('a v8 run with no old colony on its route: run.inbox.read unchanged', JSON.stringify(plain.payload.run.inbox.read) === JSON.stringify(raw.save.payload.run.inbox.read));
}
{
  const raw = fixture();
  asOldColony(raw.save, 2);
  const migrated = migrateRunSave(raw.save) as Raw;
  const decoded = decodeRunSave(JSON.stringify(raw.save));
  check('the v8 HERON desk past an old colony (HALCYON): its letter `old-colony:2` marked read by the 8 → 9 step (and on up), and it decodes',
    migrated.saveVersion === RUN_SAVE_VERSION && migrated.payload.run.inbox.read.includes('old-colony:2') && decoded.ok,
    decoded.ok ? JSON.stringify(migrated.payload.run.inbox.read) : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(raw.save), [META_STORAGE_KEY]: JSON.stringify(raw.meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  if (pendingRunSave() === null) throw new Error('v8-old-colony: the save was not offered');
  resumeRun(store);
  const letter = inboxMessages(store.getState()).find((message) => message.id === 'old-colony:2');
  check('…resumed at the desk: the letter is in the INBOX, and not unread', store.getState().run.phase === 'desk' && letter !== undefined
    && !inboxUnread(store.getState()).some((message) => message.id === 'old-colony:2'), JSON.stringify(letter?.subject ?? null));
}
{
  const raw = fixture();
  asOldColony(raw.save, 2);
  asOldColony(raw.save, 4);
  raw.save.point = 'beam';
  const migrated = migrateRunSave(raw.save) as Raw;
  const read: string[] = migrated.payload.run.inbox.read;
  check('a BEAM save whose last stop is an old colony: that letter stays unread for its boot, the one passed before is read',
    read.includes('old-colony:2') && !read.includes('old-colony:4'), JSON.stringify(read));
}

finish();
