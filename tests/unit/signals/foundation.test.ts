// Slice 7d FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.2 7d, §2.4 7d, §6.1): the lead's suite.
// • the save: the v8 fixture (tests/unit/save/fixtures/run-save-v8-ship-done-heron.json: seed 7's run 1 at HERON's desk,
//   HELM's note read, its one fragment found) migrates to v9 (the record a note's, 1 fragment), decodes and resumes; the
//   codec's v9 refusals (each source off its ship, a count the ship could not give, twice, off the route);
// • the pure rules (systems/signals.ts): the count, the file's source per ship (the signal `?` ship, a CONTACT stop), the
//   old colony's pick, the `?` card's rule, the records' check;
// • the gates: what this build plays (UNKNOWN_EVENTS_BUILT, ENDINGS_BUILT.contact, TRACES_BUILT.contact), and the tuning's
//   load-time agreements (the signal ship's fragments are the generator's, two stops give about one gift).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RunMapState } from '@/types/map';
import type { TraceKind, TracePlace } from '@/types/trace';
import type { ResidentRecord, SignalRecord } from '@/types/resident';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { createRunMap } from '@systems/map-run';
import { signalCount, contactPaid, signalSourceAt, signalRefusal, oldColonyOf, unknownShown } from '@systems/signals';
import { UNKNOWN_EVENTS_BUILT, OLD_COLONIES } from '@data/unknown';
import { ENDINGS_BUILT } from '@data/endings';
import { TRACES_BUILT } from '@data/traces';
import { stubStorage, pageOpen } from '../save/save-fixture';
import {
  RUN_SAVE_KEY, RUN_SAVE_VERSION, META_STORAGE_KEY, SIGNAL_EVENT_FRAGMENTS, CONTACT_GIFT_CHARGE, CONTACT_STOP_FRAGMENTS, TRACE_GIFT_CHARGE,
  SIGNALS_FOR_CONTACT, TRACE_LAYERS,
} from '@data/tuning';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const FILE = 'run-save-v8-ship-done-heron.json';
const fixture = (): { save: Raw; meta: Raw } => JSON.parse(readFileSync(join(FIXTURES, FILE), 'utf8'));

// --- The gates and the numbers -------------------------------------------------------------------------------------------------
// (7d's gate lines:)
check('built: the `?` ships and their events (UNKNOWN_EVENTS_BUILT)', UNKNOWN_EVENTS_BUILT);
check('built: CONTACT, its row and its trace (ENDINGS_BUILT.contact, TRACES_BUILT.contact)', ENDINGS_BUILT.contact && TRACES_BUILT.contact);
check('RUN_SAVE_VERSION 9 or later (playtest 1 Batch B\'s v10 keeps v9\'s signal records)', RUN_SAVE_VERSION >= 9);
check('the numbers: the signal ship 2, a stop 1 fragment and +8 (two stops +16, against a gift\'s +15), CONTACT\'s price 2 (slice 8)',
  SIGNAL_EVENT_FRAGMENTS === 2 && CONTACT_STOP_FRAGMENTS === 1 && CONTACT_GIFT_CHARGE * 2 - TRACE_GIFT_CHARGE === 1 && SIGNALS_FOR_CONTACT === 2
  && TRACE_LAYERS.contact.join() === '5,7');
{
  // Every arm the generator rolls puts SIGNAL_EVENT_FRAGMENTS on its signal ship, and the file rule reads it (it throws on
  // another count, so 60 arms read each signal ship's source).
  const maps: RunMapState[] = [];
  for (let seed = 1; seed <= 30; seed++) maps.push(createRunMap({ wave: 1 }, seed), createRunMap({ wave: 2 }, seed));
  const run = (map: RunMapState): Parameters<typeof signalSourceAt>[0] => ({
    map, traces: { from: null, kinds: [], places: [], extraSeed: false }, residents: { met: [], signals: [] },
  });
  const bad = maps.flatMap((map) => map.arm.filter((ship) => ship?.reserved.unknownEvent === 'signal')
    .filter((ship) => ship!.reserved.fragments !== SIGNAL_EVENT_FRAGMENTS || signalSourceAt(run(map), ship!.slot)?.fragments !== SIGNAL_EVENT_FRAGMENTS)
    .map((ship) => `${map.run}:${map.armSeed}:${ship!.slot}`));
  const kinds = maps.map((map) => map.arm.filter((ship) => ship?.reserved.unknownEvent !== null && ship !== undefined).length);
  check(`60 arms: three \`?\` ships each (old colony, gone resident, signal), the signal ship's file worth ${SIGNAL_EVENT_FRAGMENTS}`,
    bad.length === 0 && kinds.every((n) => n === 3), `${bad.join(' ')} ${kinds.filter((n) => n !== 3).length} arms short`);
  // The old colony: the ship's own stream picks one of the three, the same on every call; across the arms all three appear.
  const picks = maps.flatMap((map) => map.arm.filter((ship) => ship?.reserved.unknownEvent === 'old-colony')
    .map((ship) => ({ a: oldColonyOf({ seed: 1, map }, ship!.slot).name, b: oldColonyOf({ seed: 99, map }, ship!.slot).name })));
  check('the old colony is the ship\'s own (the same whatever the run seed), and all three appear over 60 arms',
    picks.every((pick) => pick.a === pick.b) && OLD_COLONIES.every((colony) => picks.some((pick) => pick.a === colony.name)));
}

// --- The save: v8 → v9 -------------------------------------------------------------------------------------------------------
function resumeFixture(raw: { save: Raw; meta: Raw }): ReturnType<typeof createStore<GameState>> {
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(raw.save), [META_STORAGE_KEY]: JSON.stringify(raw.meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  if (store.getState().save.status !== 'ok' || pendingRunSave() === null) throw new Error(`resumeFixture: not offered (${JSON.stringify(store.getState().save)})`);
  resumeRun(store);
  return store;
}
const v8 = fixture();
{
  const migrated = migrateRunSave(v8.save) as Raw;
  const decoded = decodeRunSave(JSON.stringify(v8.save));
  check('the v8 desk (HERON\'s note read) migrates to v9: its one record a note\'s, 1 fragment; it decodes',
    v8.save.saveVersion === 8 && migrated.saveVersion === 9 && decoded.ok
    && JSON.stringify(migrated.payload.run.residents.signals) === JSON.stringify([{ slot: 4, depth: 3, source: 'note', n: 1 }]),
    decoded.ok ? JSON.stringify(migrated.payload.run.residents.signals) : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  const store = resumeFixture(v8);
  const run = store.getState().run;
  check('…and resumes at HERON\'s desk with 1 signal (CONTACT not yet paid)', run.phase === 'desk' && signalCount(run) === 1 && !contactPaid(run),
    `${run.phase} ${signalCount(run)}`);
}
{
  const desk = migrateRunSave(v8.save) as Raw;
  const refusal = (edit: (save: Raw) => void): string => {
    const copy = structuredClone(desk);
    edit(copy);
    const decoded = decodeRunSave(JSON.stringify(copy));
    return decoded.ok ? 'decoded' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`;
  };
  const signal = (save: Raw, record: Raw): void => { save.payload.run.residents.signals.push(record); };
  // The route's second stop (HALCYON, slot 2) made a signal ship by hand.
  const asSignalShip = (save: Raw): void => { save.payload.run.map.arm[2].reserved.unknownEvent = 'signal'; save.payload.run.map.arm[2].reserved.fragments = 2; };
  const cases: [string, (save: Raw) => void, RegExp][] = [
    ['the note\'s record as migrated', () => undefined, /^decoded$/],
    ['a record with no source', (save) => { delete save.payload.run.residents.signals[0].source; }, /missing source/],
    ['an unknown source', (save) => { save.payload.run.residents.signals[0].source = 'radio'; }, /source/],
    ['a note found twice', (save) => { signal(save, { slot: 4, depth: 3, source: 'note', n: 1 }); }, /found twice/],
    ['a note with 2 fragments that carries 1', (save) => { save.payload.run.residents.signals[0].n = 2; }, /whose note carries 1/],
    ['a note off the route', (save) => { save.payload.run.residents.signals[0].depth = 2; }, /off the route/],
    ['the signal event on a ship with none', (save) => { signal(save, { slot: 2, depth: 2, source: 'signal-event', n: 2 }); }, /signal ship/],
    ['the signal event on the signal ship', (save) => { asSignalShip(save); signal(save, { slot: 2, depth: 2, source: 'signal-event', n: 2 }); }, /^decoded$/],
    ['…with 1 of its 2', (save) => { asSignalShip(save); signal(save, { slot: 2, depth: 2, source: 'signal-event', n: 1 }); }, /signal ship's 2/],
    ['a CONTACT stop with no CONTACT trace', (save) => { signal(save, { slot: 2, depth: 2, source: 'contact-stop', n: 1 }); }, /no CONTACT stop/],
    ['zero fragments', (save) => { save.payload.run.residents.signals[0].n = 0; }, /found 0/],
  ];
  for (const [what, edit, want] of cases) {
    const got = refusal(edit);
    check(`v9 codec: ${what} → ${want.source === '^decoded$' ? 'decodes' : 'refused'}`, want.test(got), got);
  }
}

// --- The pure rules ------------------------------------------------------------------------------------------------------------
{
  const map = createRunMap({ wave: 1 }, 7);
  const base = { map, traces: { from: null, kinds: [] as TraceKind[], places: [] as TracePlace[], extraSeed: false }, residents: { met: [] as ResidentRecord[], signals: [] as SignalRecord[] }, seed: 7 };
  const kittiwake = map.arm[14]!;
  check('seed 7\'s run 1: KITTIWAKE (14) is the signal ship, LAPWING (8) the old colony, PLOVER (10) the gone resident',
    kittiwake.reserved.unknownEvent === 'signal' && map.arm[8]!.reserved.unknownEvent === 'old-colony' && map.arm[10]!.reserved.unknownEvent === 'gone-resident');
  check('the `?` card shows on the three until visited, on no other ship', unknownShown(base, 14) && unknownShown(base, 8) && unknownShown(base, 10)
    && !unknownShown(base, 4) && !unknownShown({ map: { ...map, route: [...map.route, { slot: 14, depth: 2, hop: null }] } }, 14));
  check('KITTIWAKE holds a signal-event file of 2; HERON none (its note is the resident\'s)',
    JSON.stringify(signalSourceAt(base, 14)) === JSON.stringify({ source: 'signal-event', fragments: 2 }) && signalSourceAt(base, 4) === null);
  const found = { ...base, residents: { met: [] as ResidentRecord[], signals: [{ slot: 14, depth: 4, source: 'signal-event' as const, n: 2 }] } };
  check('…once found, it holds nothing more; the count is the records\' sum', signalSourceAt(found, 14) === null && signalCount(found) === 2);
  const contact = {
    ...base,
    traces: { from: null, kinds: [] as TraceKind[], places: [{ kind: 'contact' as const, slot: 15, given: false }, { kind: 'contact' as const, slot: 16, given: true }], extraSeed: false },
  };
  check('a CONTACT stop holds a file of 1 while its place waits; a given place holds none',
    JSON.stringify(signalSourceAt(contact, 15)) === JSON.stringify({ source: 'contact-stop', fragments: 1 }) && signalSourceAt(contact, 16) === null);
  const off = { ...base, map: { ...map, route: [{ slot: 0, depth: 1, hop: null }] }, residents: { met: [] as ResidentRecord[], signals: [{ slot: 4, depth: 1, source: 'note' as const, n: 1 }] } };
  check('signalRefusal: a record off the route', /off the route/.test(signalRefusal(off) ?? ''));
}

finish();
