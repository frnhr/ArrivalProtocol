// Track SAVE's fixture for the save suites (slice 3c plan §6.1): a page on stubbed storage, opened the way state/instance.ts
// opens it (systems/run-save.ts openPageStorage, pageTitleState), and run 1's worked route walked desk to desk with no
// flights (tests/unit/map/repo-fixture.ts: endShip, openDesk, setCourse, a card, transmitNext), so every save point is the
// game's own write through the real session (systems/save-write.ts) into the stub, never a save built by hand.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { MetaStorage, StorageProvider } from '@systems/storage';
import type { RunSave } from '@/types/save';
import type { HollowFate } from '@/types/ending';
import { decideFinale } from '../support/finale';
import { closeArchive } from '@systems/meta';
import { closeRunSave, writeEndingChosen } from '@systems/save-write';
import { openPageStorage, pageTitleState } from '@systems/run-save';
import { decodeRunSave } from '@systems/save-codec';
import { receiveTransmission } from '@systems/boot';
import { sayOwedVerdict } from '@systems/finale';
import { resetWorld } from '@systems/reset';
import { send, toDesk } from '../map/repo-fixture';
import { WORKED_ROUTE } from '../map/run1-fixture';
import { META_STORAGE_KEY, RUN_SAVE_KEY } from '@data/tuning';

export { WORKED_ROUTE };

export interface StubStorage {
  data: Map<string, string>;
  // Every setItem / removeItem, in order (key and kind).
  log: { key: string; kind: 'set' | 'remove' }[];
  // Throw on reaching the storage, on a read, a write or a remove (each a switch a suite flips); `setKey`: a write to that
  // key only (a full quota hits the bigger run save before the archive).
  fail: { reach: boolean; get: boolean; set: boolean; remove: boolean; setKey: string | null };
  provider: StorageProvider;
}

export function stubStorage(initial: Record<string, string> = {}): StubStorage {
  const data = new Map(Object.entries(initial));
  const log: StubStorage['log'] = [];
  const fail: StubStorage['fail'] = { reach: false, get: false, set: false, remove: false, setKey: null };
  const storage: MetaStorage = {
    getItem(key) {
      if (fail.get) throw new Error('stub: getItem refused');
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (fail.set || fail.setKey === key) throw Object.assign(new Error('stub: QuotaExceededError'), { name: 'QuotaExceededError' });
      data.set(key, value);
      log.push({ key, kind: 'set' });
    },
    removeItem(key) {
      if (fail.remove) throw new Error('stub: removeItem refused');
      data.delete(key);
      log.push({ key, kind: 'remove' });
    },
  };
  return {
    data, log, fail,
    provider: () => {
      if (fail.reach) throw new Error('stub: storage blocked');
      return storage;
    },
  };
}

// A page load on `storage` (a reload): the sessions forgotten, the open sequence run, the title state put into `store`
// (as a fresh page's store would start), and every module reset.
export function pageOpen(store: Store<GameState>, storage: StubStorage, seed: number): void {
  closeArchive();
  closeRunSave();
  const save = openPageStorage(storage.provider, seed);
  const title = pageTitleState(seed, save, false);
  store.update((draft) => { Object.assign(draft, title); });
  resetWorld();
}

// What the stub holds under the run save's key, decoded (throws when nothing is there or it doesn't decode).
export function storedSave(storage: StubStorage): { raw: string; save: RunSave } {
  const raw = storage.data.get(RUN_SAVE_KEY);
  if (raw === undefined) throw new Error('storedSave: nothing saved');
  const decoded = decodeRunSave(raw);
  if (!decoded.ok) throw new Error(`storedSave: ${decoded.refusal.kind} (${decoded.refusal.detail})`);
  return { raw, save: decoded.save };
}

export function storedMeta(storage: StubStorage): Record<string, unknown> {
  const raw = storage.data.get(META_STORAGE_KEY);
  if (raw === undefined) throw new Error('storedMeta: no archive');
  return JSON.parse(raw) as Record<string, unknown>;
}

// RECEIVE TRANSMISSION, then the ship's boot and flight skipped: the store stands on ship 1's LANDING REPORT (nothing is
// flown, as in the repo fixture).
export function receiveToReport(store: Store<GameState>): void {
  if (!receiveTransmission(store)) throw new Error('receiveToReport: not on the title');
  store.update((draft) => { draft.run.phase = 'report'; });
}

// From the desk (or the report), to the ship in `slot`: the PACKET's send, landing in its boot.
export function beamTo(store: Store<GameState>, slot: number): void {
  send(store, slot);
}

export { toDesk };

// The final ship's LANDING REPORT with a decided finale, as systems/landing.ts finishLanding opens it (ENDING CHOSEN).
// Slice 7a: decided by its step 1 and REASSIGNMENT (support/finale.ts decideFinale).
export function finalReport(store: Store<GameState>, fate: HollowFate = 'purge'): void {
  store.update((draft) => {
    draft.run.phase = 'report';
    draft.burn.status = 'locked';
    decideFinale(draft.hollow.finale, fate);
  });
  writeEndingChosen(store, sayOwedVerdict);
}

// Every free segment's id with its counter suffix dropped, and the run's rev, for comparing a rebuilt world with the one it
// was saved from (a rebuilt ship mints its own free ids: the counter moved past the save's).
export function comparable(state: Readonly<GameState>): unknown {
  const copy = structuredClone(state) as GameState;
  const strip = (segs: GameState['memory']): void => {
    for (const seg of segs) if (seg.type === 'free') seg.id = 'free';
  };
  strip(copy.memory);
  return {
    run: { ...copy.run, rev: 0 },
    mission: copy.mission, memory: copy.memory, clock: copy.clock, burn: copy.burn, orbit: copy.orbit, level: copy.level,
    landing: copy.landing, hollow: copy.hollow, hazards: copy.hazards,
    log: copy.log.entries, done: copy.director.done,
  };
}
