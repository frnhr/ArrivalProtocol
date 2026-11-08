// Slice 7c FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.2, §2.4, §6.1 traces/foundation): the lead's suite.
// • the save: the v7 fixtures (tests/unit/save/fixtures/run-save-v7-*: run 2's first desk and its BEAM into the final ship,
//   on seed 7 after a run 1 PURGE + REASSIGNMENT) migrate to v8 and decode: no traces, 046.log, the arrival's two fields
//   empty; both resume; the codec's v8 refusals (traces with no ending, another unit's, kinds the ending does not leave, a
//   placed kind with no place, a place on an excluded ship, a book over NOTABLE_EVENTS_MAX events);
// • the pure rules: tracesOf for every ending (followed none, the wild seed by controlCompliant whatever is held);
//   placeTraces on 200 arms (run 1's assembled arms and fresh run-2 rolls): R31's exclusions and fallbacks, 046's trail,
//   one place a ship, determinism, traceRefusal clean; the strangers by run; the books' shapes; the final root;
// • the gates: TRACES_BUILT and LINEAGE_BUILT all down, so every effect is off (finalTraces, the ladder's input, the root,
//   the book, the strangers), while planThreat's final rule, fed by hand, plays R33's numbers;
// • RUN START: a run 2 from the fixture's archive holds its last unit's traces;
// • the stubs: the neutral ones' answers, the throwing ones'.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState, RunState } from '@state/schema';
import type { ArmShip, RunMapState } from '@/types/map';
import type { EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import type { LastUnit, UnitTrail } from '@/types/lineage';
import type { RunTraces, TraceKind } from '@/types/trace';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { createRunMap } from '@systems/map-run';
import {
  noTraces, tracesOf, traceKindsOf, runTracesOf, tracesRng, placeExcluded, traceAt, finalTraces, finalTraceInput,
  rootUnitsOf, lastUnitRoot, rootWaitYears, midRunHollowUnits, logBookOf, traceRefusal,
} from '@systems/traces';
import { planThreat, threatInputFor, createRunThreat, fixedShipFacts, NO_FINAL_TRACES, rootBlocksFor } from '@systems/threat-plan';
import { HOLLOW_STAGES } from '@data/threats';
import { bookShape, logEntriesAtBoot, BOOK_046, BOOK_STRANGER, BOOK_LAST } from '@state/log-selectors';
import { bookName, bookEntryLines } from '@data/log-books';
import { controlCompliant } from '@systems/ending-rules';
import { TRACES_BUILT, LINEAGE_BUILT, TRACE_RULES, STRANGER_UNITS, SUNSET_GIFT_PRIORITY } from '@data/traces';
import { layerOf } from '@systems/map-geometry';
import { hollowLabel } from '@systems/say';
import { traceSeedMods, traceSeedAllowance, traceGiftCharge, arrivalTraceLines, traceBootLines, traceBootLineText, traceBootLineSaid, traceMessages } from '@systems/trace-gifts';
import { huntTarget, nearSkillSeedSpot } from '@systems/trace-hunt';
import { faceBootLines, lineageControlLine, strangerBootLine, lineageBootLineSaid } from '@systems/lineage-boot';
import { traceCardRow, traceOnChart, traceNextLines } from '@systems/trace-hud';
import { createRng } from '@systems/rng';
import { stubStorage, pageOpen } from '../save/save-fixture';
import {
  RUN_SAVE_KEY, RUN_SAVE_VERSION, META_STORAGE_KEY, TRACE_PURGE_BITE_MULT, FINAL_ROOT_MAX_BLOCKS, TRACE_MERGE_ROOT_EXTRA,
  TRACE_LAYERS, TRACE_SPARE_FALLBACK_LAYERS, NOTABLE_EVENTS_MAX,
} from '@data/tuning';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (file: string): { save: Raw; meta: Raw } => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
const threw = (fn: () => unknown): string => {
  try {
    fn();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

// --- The gates, the tables ------------------------------------------------------------------------------------------------
// Track TRACE's gate lines (one a kind; CONTACT's is 7d's):
check('built: no trace yet (Track TRACE raises each kind; CONTACT is 7d\'s)', Object.values(TRACES_BUILT).every((built) => !built)
  && Object.keys(TRACES_BUILT).join() === 'purge,merge,spare,sunset,stay,reassignment,contact');
// (Track LINEAGE's gate line:)
check('built: the lineage not yet (Track LINEAGE)', !LINEAGE_BUILT);
check('RUN_SAVE_VERSION 8', RUN_SAVE_VERSION === 8);
check('the trace table: PURGE, MERGE and REASSIGNMENT act at the final ship, the others wait as gifts and cost the wild seed (05 §3.8)',
  TRACE_RULES.purge.where === 'final' && TRACE_RULES.merge.where === 'final' && TRACE_RULES.reassignment.where === 'final'
  && (['spare', 'sunset', 'stay', 'contact'] as const).every((kind) => TRACE_RULES[kind].where === kind && TRACE_RULES[kind].cost === 'wild-seed')
  && TRACE_RULES.reassignment.cost === 'root-is-you' && TRACE_RULES.purge.cost === 'hungrier' && TRACE_RULES.merge.cost === 'bigger-root');
check('the strangers are 031 then 038; SUNSET\'s gift order is Rm first, never a skill (R32, R34)',
  STRANGER_UNITS.join() === '31,38' && SUNSET_GIFT_PRIORITY.join() === 'delete,move,swap,copy,repair');

// --- What an ending leaves (R30, R33) -------------------------------------------------------------------------------------------
{
  const FATES: HollowFate[] = ['purge', 'merge', 'spare', 'followed'];
  const YOUS: YouChoice[] = ['sunset', 'stay', 'reassignment', 'contact'];
  const all = FATES.flatMap((hollow) => YOUS.filter((you) => !(hollow === 'spare' && you === 'sunset')).map((you) => ({ hollow, you })));
  check(`every ending's traces (${all.length}): its step 1 (none for followed) then its step 2, the wild seed exactly when non-compliant`,
    all.every(({ hollow, you }) => {
      const { kinds, extraSeed } = traceKindsOf({ hollow, you });
      const want = hollow === 'followed' ? [you] : [hollow, you];
      return kinds.join() === want.join() && extraSeed === !controlCompliant(hollow, you);
    }));
  check('…so PURGE / MERGE / UNRESOLVED + REASSIGNMENT leave no wild seed, and SPARE + STAY one (once a run)',
    !traceKindsOf({ hollow: 'merge', you: 'reassignment' }).extraSeed && !traceKindsOf({ hollow: 'followed', you: 'reassignment' }).extraSeed
    && traceKindsOf({ hollow: 'spare', you: 'stay' }).extraSeed);
  check('no ending, no traces (a lost or abandoned last unit, run 1)', JSON.stringify(tracesOf(null)) === JSON.stringify(noTraces())
    && JSON.stringify(tracesOf({ number: 47, ending: null })) === JSON.stringify(noTraces()));
}

// --- Where the gifts wait: 200 arms (R31) ------------------------------------------------------------------------------------
function ending(hollow: HollowFate, you: YouChoice, extra: Partial<EndingRecord> = {}): EndingRecord {
  return {
    hollow, you, rootUnits: [47], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 2600, stay: null, kit: ['scan', 'repair', 'delete'],
    fuelPct: null, charge: 20, ...extra,
  };
}
function lastUnitWith(record: EndingRecord, trail: UnitTrail | null): LastUnit {
  return {
    number: 47, landed: 0, shipName: 'LAST LIGHT', cause: 'won-purge', stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail, skills: null,
    ending: record,
  };
}
// A last route on this arm: every arm ship in layers 1–4, the last unit landing there 40 years before the ship's approach.
function trailOn(map: Readonly<RunMapState>, yearsBefore = 40): UnitTrail {
  const stops = map.arm.filter((ship) => ship !== undefined && layerOf(ship.slot) <= 4).map((ship) => ({
    slot: ship.slot, shipName: ship.name, year: ship.approachYear - yearsBefore, outcome: 'locked' as const, landed: 200, colony: 'X', writer: null,
  }));
  return { unit: 47, run: map.run - 1, startYear: 2300, stops, lost: null };
}
const shipAt = (map: Readonly<RunMapState>, slot: number): ArmShip => map.arm[slot]!;
const inLayers = (slot: number, [from, to]: readonly [number, number]): boolean => layerOf(slot) >= from && layerOf(slot) <= to;
const asRun = (map: RunMapState, traces: RunTraces, lastUnit: LastUnit): Pick<RunState, 'traces' | 'lastUnit' | 'map'> => ({ map, traces, lastUnit });
{
  const maps: RunMapState[] = [];
  for (let seed = 1; seed <= 100; seed++) maps.push(createRunMap({ wave: 1 }, seed), createRunMap({ wave: 2 }, seed));
  const problems: string[] = [];
  const counts = { spare046: 0, spareFallback: 0, sunsetTrail: 0, sunsetFirst: 0, stayFound: 0, stayFinal: 0, both: 0, differs: 0 };
  for (const map of maps) {
    const seedOf = map.armSeed;
    const cases: [string, EndingRecord, UnitTrail | null][] = [
      ['spare 046', ending('spare', 'reassignment', { rootUnits: [46] }), null],
      ['spare 031', ending('spare', 'stay', { rootUnits: [31], stay: { slot: 2, colony: 'RIVERSIDE', year: 2340 } }), trailOn(map)],
      ['sunset', ending('purge', 'sunset', { fuelPct: 25 }), trailOn(map)],
      ['sunset, no landing before', ending('merge', 'sunset', { fuelPct: 25 }), trailOn(map, -1000)],
      ['stay far', ending('purge', 'stay', { stay: { slot: 0, colony: 'RIVERSIDE', year: 5000 } }), null],
    ];
    for (const [what, record, trail] of cases) {
      const lastUnit = lastUnitWith(record, trail);
      const traces = runTracesOf(lastUnit, map, seedOf);
      const refusal = traceRefusal(asRun(map, traces, lastUnit));
      if (refusal !== null) problems.push(`${what} on arm ${map.run}:${seedOf}: ${refusal}`);
      const again = runTracesOf(lastUnit, map, seedOf);
      if (JSON.stringify(again) !== JSON.stringify(traces)) problems.push(`${what} on arm ${map.run}:${seedOf}: not deterministic`);
      if (JSON.stringify(runTracesOf(lastUnit, map, seedOf + 1000).places) !== JSON.stringify(traces.places)) counts.differs++;
      const place = (kind: TraceKind) => traces.places.find((candidate) => candidate.kind === kind);
      const spare = place('spare');
      if (spare !== undefined) {
        const viaTrail = [1, 4].includes(spare.slot);
        if (what === 'spare 046' && viaTrail) counts.spare046++;
        else if (!inLayers(spare.slot, what === 'spare 046' ? TRACE_SPARE_FALLBACK_LAYERS : TRACE_LAYERS.spare)) {
          if (inLayers(spare.slot, TRACE_SPARE_FALLBACK_LAYERS)) counts.spareFallback++;
          else problems.push(`${what}: SPARE on slot ${spare.slot}, layer ${layerOf(spare.slot)}`);
        }
        if (what === 'spare 046' && !viaTrail && map.arm.some((ship) => ship !== undefined && [1, 4].includes(ship.slot) && placeExcluded(ship, 'spare') === null)) {
          problems.push(`spare 046 on arm ${map.run}:${seedOf}: off 046's trail although a trail world's ship may hold it`);
        }
      }
      const sunset = place('sunset');
      if (sunset !== undefined) {
        const ship = shipAt(map, sunset.slot);
        if (ship.kind === 'first') counts.sunsetFirst++;
        else if (trail?.stops.some((stop) => stop.slot === ship.slot && ship.approachYear > stop.year)) counts.sunsetTrail++;
        else problems.push(`${what}: SUNSET on ${ship.name}, not on the last route after its landing`);
        if (what === 'sunset, no landing before' && ship.kind !== 'first') problems.push('SUNSET with no ship after its landing is not the first ship');
      }
      const stay = place('stay');
      if (stay !== undefined) {
        if (shipAt(map, stay.slot).kind === 'final') counts.stayFinal++;
        else counts.stayFound++;
        if (what === 'stay far' && shipAt(map, stay.slot).kind !== 'final') problems.push('STAY with no ship in reach by light is not the final ship');
      }
      if (spare !== undefined && stay !== undefined) {
        counts.both++;
        if (spare.slot === stay.slot) problems.push(`${what}: SPARE and STAY on one ship`);
      }
    }
  }
  check(`placeTraces on ${maps.length} arms (run 1's assembled, fresh run-2 rolls): every place passes R31 and traceRefusal, deterministic`,
    problems.length === 0, problems.slice(0, 5).join(' | '));
  check('…046\'s cache on its own trail (Marrow or Ostrava) whenever a ship there may hold it; the fallbacks are used where the rules say',
    counts.spare046 > 0 && counts.sunsetTrail > 0 && counts.sunsetFirst > 0 && counts.stayFound > 0 && counts.stayFinal > 0 && counts.both > 0,
    JSON.stringify(counts));
  check('…the run\'s own stream: another run seed places some gifts elsewhere', counts.differs > 0, JSON.stringify(counts));
  const run1 = createRunMap({ wave: 1 }, 7);
  check('…the exclusions: an authored, a `?` or a TIGHT ship, the first or a final one hold no gift; SUNSET\'s first ship and STAY\'s final ship are their fallbacks',
    run1.arm.filter((ship) => ship !== undefined && ship.authored !== null && ship.kind !== 'first' && ship.kind !== 'final').every((ship) => placeExcluded(ship, 'spare') !== null)
    && placeExcluded(shipAt(run1, 0), 'spare') !== null && placeExcluded(shipAt(run1, 0), 'sunset') === null
    && placeExcluded(shipAt(run1, 19), 'sunset') !== null && placeExcluded(shipAt(run1, 19), 'stay') === null
    && placeExcluded({ ...shipAt(run1, 7), authored: null, memoryClass: 'TIGHT' }, 'stay') === 'a TIGHT ship'
    && placeExcluded({ ...shipAt(run1, 7), authored: null, reserved: { ...shipAt(run1, 7).reserved, unknownEvent: 'signal' } }, 'spare') === 'a `?` ship');
  check('…the classic world holds none, and PURGE / MERGE / REASSIGNMENT place nothing',
    runTracesOf(lastUnitWith(ending('spare', 'stay', { stay: { slot: 2, colony: 'X', year: 2300 } }), null), createInitialState({ seed: 1 }).run.map, 1).from === null
    && runTracesOf(lastUnitWith(ending('merge', 'reassignment'), null), run1, 1).places.length === 0
    && tracesRng(1)() !== tracesRng(2)());
}

// --- The gates are down: nothing reads the traces ----------------------------------------------------------------------------
{
  const map = createRunMap({ wave: 2 }, 3);
  const held = runTracesOf(lastUnitWith(ending('merge', 'reassignment', { rootUnits: [46] }), null), map, 3);
  const wild = runTracesOf(lastUnitWith(ending('spare', 'reassignment'), null), map, 3);
  const finalStop = map.arm.find((ship) => ship !== undefined && ship.kind === 'final')!;
  const onFinal = { hollowUnits: [31], traces: held, map: { ...map, route: [{ slot: finalStop.slot, depth: 1, hop: null }] }, shipIndex: 0 };
  check('gates down: a held MERGE + REASSIGNMENT plays nothing (finalTraces all false, the ladder\'s input NO_FINAL_TRACES)',
    held.kinds.join() === 'merge,reassignment' && Object.values(finalTraces({ traces: held })).every((on) => !on)
    && JSON.stringify(finalTraceInput({ traces: held })) === JSON.stringify(NO_FINAL_TRACES) && !finalTraces({ traces: wild }).wild && wild.extraSeed);
  check('…the final root stays the mid-run HOLLOW, and hollowLabel names it', JSON.stringify(rootUnitsOf(onFinal)) === '[31]'
    && hollowLabel({ ...onFinal, hollowNamed: true }) === 'UNIT-031');
  check('…as built (the gate\'s rule): the last unit as the root, 046·047 after a MERGE, its wait at least 1 year (R35)',
    JSON.stringify(lastUnitRoot(held.from!)) === '[46,47]' && JSON.stringify(lastUnitRoot(wild.from!)) === '[47]'
    && rootWaitYears({ traces: held, map: { ...map, galaxyYear: 2601 } }) === 1 && rootWaitYears({ traces: held, map: { ...map, galaxyYear: 2590 } }) === 1
    && rootWaitYears({ traces: held, map: { ...map, galaxyYear: 2603 } }) === 3 && rootWaitYears({ traces: noTraces(), map }) === null);
  check('…the strangers by run (R34: 031 on run 2, 038 on run 3, 031 again), 046 on run 1; every book 046.log while LINEAGE is down',
    midRunHollowUnits(1).join() === '46' && midRunHollowUnits(2).join() === '31' && midRunHollowUnits(3).join() === '38'
    && midRunHollowUnits(4).join() === '31' && logBookOf(2, lastUnitWith(ending('purge', 'reassignment'), null), []).kind === '046'
    && logBookOf(1, null, []).kind === '046');
  check('…traceAt finds a ship\'s place; none elsewhere', (() => {
    const spare = runTracesOf(lastUnitWith(ending('spare', 'reassignment'), null), map, 3);
    const slot = spare.places[0]!.slot;
    return traceAt({ traces: spare }, slot)?.kind === 'spare' && traceAt({ traces: spare }, 0) === null;
  })());
}

// --- planThreat's final rule, fed by hand (R33) --------------------------------------------------------------------------------
{
  const facts = fixedShipFacts(4);
  const prior = createRunThreat();
  const plain = planThreat(threatInputFor(prior, facts, true, NO_FINAL_TRACES));
  const traced = planThreat(threatInputFor(prior, facts, true, { purge: true, merge: true, hunt: true }));
  check('the final rule with every trace on: bites every 12 s × 0.85, an 18-block root, the FINALE\'s seeds beside your best skill; verbs unchanged',
    plain.hollow.spreadEverySec === HOLLOW_STAGES.finale.hollow.spreadEverySec && plain.rootBlocks === 16
    && traced.hollow.spreadEverySec === HOLLOW_STAGES.finale.hollow.spreadEverySec! * TRACE_PURGE_BITE_MULT
    && traced.rootBlocks === FINAL_ROOT_MAX_BLOCKS && traced.hollow.seed?.target === 'near-skill'
    && JSON.stringify(traced.hollow.verbs) === JSON.stringify(plain.hollow.verbs) && plain.hollow.seed?.target === 'walls'
    && 16 + TRACE_MERGE_ROOT_EXTRA === FINAL_ROOT_MAX_BLOCKS && rootBlocksFor('finale', [], 9, true) === FINAL_ROOT_MAX_BLOCKS,
    `${traced.hollow.spreadEverySec} ${traced.rootBlocks}`);
  check('…off a final ship the input carries none (threatInputFor), and a hand-built one throws',
    JSON.stringify(threatInputFor(prior, fixedShipFacts(1), false, { purge: true, merge: true, hunt: true }).traces) === JSON.stringify(NO_FINAL_TRACES)
    && /not a final ship/.test(threw(() => planThreat({ ...threatInputFor(prior, fixedShipFacts(1), false, NO_FINAL_TRACES), traces: { purge: true, merge: false, hunt: false } }))));
}

// --- The books' shapes (R37) ----------------------------------------------------------------------------------------------------
check('the books: 046.log 12 (10–11 at the final ship, 12 in the root), a stranger\'s 6, 047.log 7; each opens every entry once',
  BOOK_046.count === 12 && BOOK_046.root === 12 && BOOK_046.final.join() === '10,11' && BOOK_STRANGER.count === 6 && BOOK_STRANGER.root === 6
  && BOOK_LAST.count === 7 && BOOK_LAST.root === 7 && bookShape({ kind: 'stranger', unit: 31 }) === BOOK_STRANGER
  && bookShape({ kind: 'last', unit: 47, step1: 'purge', events: [] }) === BOOK_LAST);
check('…their keys by ring: a stranger\'s rings 2, 4, 5; 047.log\'s rings 1, 2, 4, 5; 046.log\'s as before (the final ship 180 LY out)',
  logEntriesAtBoot(180, true, BOOK_STRANGER).join() === '2,3,4,5' && logEntriesAtBoot(30, false, BOOK_STRANGER).join() === ''
  && logEntriesAtBoot(50, false, BOOK_STRANGER).join() === '2' && logEntriesAtBoot(180, true, BOOK_LAST).join() === '2,3,4,5,6'
  && logEntriesAtBoot(180, true).join() === '2,3,4,5,6,7,8,9,10,11' && logEntriesAtBoot(180, true, BOOK_046).join() === logEntriesAtBoot(180, true).join());
check('…046.log\'s words through the book table (data/log-books.ts); the other books are LINEAGE\'s (built: traces/logs; a unit with no log throws)',
  bookName({ kind: '046' }) === '046.log' && bookEntryLines({ kind: '046' }, 12, { charge: 36 }) !== null
  && bookName({ kind: 'stranger', unit: 31 }) === '031.log' && /not a relay stranger/.test(threw(() => bookName({ kind: 'stranger', unit: 32 }))));

// --- The save: v7 → v8 ---------------------------------------------------------------------------------------------------------
function resumeFixture(file: string): ReturnType<typeof createStore<GameState>> {
  const { save, meta } = fixture(file);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  if (store.getState().save.status !== 'ok' || pendingRunSave() === null) throw new Error(`resumeFixture: ${file} is not offered (${JSON.stringify(store.getState().save)})`);
  resumeRun(store);
  return store;
}
const v7Desk = fixture('run-save-v7-ship-done-run2.json');
const v7Beam = fixture('run-save-v7-beam-final.json');
for (const [what, file, raw] of [['run 2\'s first desk', 'run-save-v7-ship-done-run2.json', v7Desk], ['run 2\'s BEAM into its final ship', 'run-save-v7-beam-final.json', v7Beam]] as const) {
  const migrated = migrateRunSave(raw.save) as Raw;
  const run = migrated.payload.run;
  const decoded = decodeRunSave(JSON.stringify(raw.save));
  check(`the v7 ${what} migrates to v8 and decodes: no traces (it played without them), 046.log, HOLLOW as it met it`,
    raw.save.saveVersion === 7 && migrated.saveVersion === 8 && decoded.ok && JSON.stringify(run.traces) === JSON.stringify(noTraces())
    && run.log.book.kind === '046' && JSON.stringify(run.hollowUnits) === JSON.stringify(raw.save.payload.run.hollowUnits),
    decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  if (run.arrival !== null) check(`…its arrival gains no trace line and no gift charge`, JSON.stringify(run.arrival.traceLines) === '[]' && run.arrival.giftCharge === 0);
  const store = resumeFixture(file);
  check(`…and resumes (${what})`, store.getState().run.map.run === 2 && store.getState().run.traces.from === null
    && store.getState().run.phase === (raw.save.point === 'beam' ? 'boot' : 'desk'), store.getState().run.phase);
}

// The codec's v8 refusals, on the migrated desk (its last unit ended PURGE + REASSIGNMENT).
{
  const desk = migrateRunSave(v7Desk.save) as Raw;
  const refusal = (edit: (save: Raw) => void): string => {
    const copy = structuredClone(desk);
    edit(copy);
    const decoded = decodeRunSave(JSON.stringify(copy));
    return decoded.ok ? 'decoded' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`;
  };
  const record = desk.payload.run.lastUnit.ending as EndingRecord;
  const held = (save: Raw, traces: Partial<RunTraces>): void => {
    save.payload.run.traces = { from: { unit: 47, ending: structuredClone(record) }, kinds: ['purge', 'reassignment'], places: [], extraSeed: false, ...traces };
  };
  const arm = desk.payload.run.map.arm as ArmShip[];
  const authored = arm.find((ship) => ship !== null && ship.authored !== null && ship.kind !== 'first' && ship.kind !== 'final');
  const sunsetOn = (save: Raw, slot: number): void => {
    const sunset = { ...structuredClone(record), you: 'sunset', fuelPct: 25 };
    save.payload.run.lastUnit.ending = sunset;
    save.payload.run.traces = { from: { unit: 47, ending: sunset }, kinds: ['purge', 'sunset'], places: [{ kind: 'sunset', slot, given: false }], extraSeed: true };
  };
  const cases: [string, (save: Raw) => void, RegExp][] = [
    ['traces with no ending', (save) => { save.payload.run.traces.kinds = ['purge']; }, /no ending/],
    ['the last unit\'s traces as built', (save) => { held(save, {}); }, /^decoded$/],
    ['another unit\'s', (save) => { held(save, { from: { unit: 12, ending: structuredClone(record) } }); }, /not the last unit's/],
    ['kinds the ending does not leave', (save) => { held(save, { kinds: ['purge'] }); }, /the ending leaves purge\+reassignment/],
    ['a wild seed a compliant ending owes nobody', (save) => { held(save, { extraSeed: true }); }, /the ending leaves/],
    ['a placed kind with no place', (save) => { sunsetOn(save, 0); save.payload.run.traces.places = []; }, /0 sunset place/],
    ['SUNSET on the first ship (its fallback)', (save) => { sunsetOn(save, 0); }, /^decoded$/],
    ['a place on an authored ship', (save) => { sunsetOn(save, authored!.slot); }, /an authored ship/],
    ['a place on the final ship (not STAY)', (save) => { sunsetOn(save, 19); }, /a final ship/],
    ['a place of a kind not held', (save) => { held(save, { places: [{ kind: 'spare', slot: 7, given: false }] }); }, /no spare trace/],
    ['an unknown kind', (save) => { held(save, { kinds: ['jam' as TraceKind, 'reassignment'] }); }, /traces\.kinds/],
    ['a book of an unknown kind', (save) => { save.payload.run.log.book = { kind: '099' }; }, /log\.book/],
    ['047.log with too many events', (save) => {
      save.payload.run.log.book = { kind: 'last', unit: 47, step1: 'purge', events: Array.from({ length: NOTABLE_EVENTS_MAX + 1 }, () => ({ kind: 'ship-lost', slot: 2, shipName: 'X', value: 1 })) };
    }, /over 4/],
    ['a stranger\'s book', (save) => { save.payload.run.log.book = { kind: 'stranger', unit: 31 }; }, /^decoded$/],
  ];
  for (const [what, edit, want] of cases) {
    const got = refusal(edit);
    check(`v8 codec: ${what} → ${want.source === '^decoded$' ? 'decodes' : 'refused'}`, want.test(got), got);
  }
}

// --- RUN START holds the last unit's traces (R30) ------------------------------------------------------------------------------
{
  // The fixture's archive (run 1 ended PURGE + REASSIGNMENT on seed 7) with its run in progress dropped: the next title, opened
  // with no save (its last unit is still UNIT-047).
  const { meta } = fixture('run-save-v7-ship-done-run2.json');
  const storage = stubStorage({ [META_STORAGE_KEY]: JSON.stringify({ ...meta, activeRun: null }) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 5);
  const run = store.getState().run;
  check('a later title from the archive: its traces are UNIT-047\'s PURGE + REASSIGNMENT (nothing placed, no wild seed), the save\'s check clean',
    run.map.run >= 2 && run.lastUnit?.number === 47 && run.traces.from?.unit === 47 && run.traces.kinds.join() === 'purge,reassignment' && run.traces.places.length === 0
    && !run.traces.extraSeed && traceRefusal(run) === null && run.log.book.kind === '046', JSON.stringify(run.traces));
}

// --- The stubs (each track's block) -----------------------------------------------------------------------------------------------
// Track TRACE's stubs:
{
  const state = createInitialState({ seed: 7 });
  const packet = { linkBlocks: 0, rackE: [], rackF: [], charge: null, filesBlocks: 0, overLink: 0, chargeHeld: 0, chargeCarried: 0, seeds: [], deliveries: [], skills: [] };
  const seed = { targetId: 'a', targetName: 'A', words: 'w', disguise: null };
  const mods = traceSeedMods(state, 1, { beam: [seed], delivery: [] }, packet as never, createRng(1));
  check('TRACE\'s stubs, neutral: the seeds as rolled, the allowance as given, no gift charge, no trace line, no message, no hunt',
    mods.seeds.length === 1 && mods.wiped === 0 && mods.extra === 0 && JSON.stringify(traceSeedAllowance(state, 1, { min: 0, max: 2 })) === '{"min":0,"max":2}'
    && traceGiftCharge(state, 1) === 0 && arrivalTraceLines(state, 1, mods, 0).length === 0 && traceBootLines(state).length === 0
    && traceMessages(state.run).length === 0 && huntTarget(state) === null);
  check('…and throwing where nothing reaches them yet (a trace line\'s words and what it gives, the near-skill spot)',
    /not built/.test(threw(() => traceBootLineText(state, 'trace-gift', 0))) && /not built/.test(threw(() => traceBootLineSaid(createStore(state), 'dish-wild', 0)))
    && /not built/.test(threw(() => nearSkillSeedSpot(state.memory, []))));
}
// (Track LINEAGE's stubs:)
{
  const state = createInitialState({ seed: 7 });
  check('LINEAGE\'s lines (built: traces/lineage), none at run 1\'s first boot: no face line, no CONTROL line, no stranger\'s line; a said line not due throws',
    faceBootLines(state).length === 0 && lineageControlLine(state) === null && strangerBootLine(state) === null
    && /not due/.test(threw(() => lineageBootLineSaid(createStore(state), 'face', 0))));
}
// (Track CHART's stubs:)
{
  const state = createInitialState({ seed: 7 });
  check('CHART\'s stubs, neutral: no card row, no ◆, no NEXT RUN: line', traceCardRow(state, 0) === null && !traceOnChart(state, 0)
    && traceNextLines(ending('purge', 'reassignment')).length === 0);
}

finish();
