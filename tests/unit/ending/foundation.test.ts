// Slice 7a FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.2, §2.4, §6.1 ending/foundation): the lead's suite.
// • the save: the v6 fixtures (tests/unit/save/fixtures/run-save-v6-*: ENDING CHOSEN at LAST LIGHT after PURGE on seed 7's
//   worked route, a run 2 desk whose last unit is 'won-merge') migrate to v7 and decode; the finale reads PURGE +
//   REASSIGNMENT, the last unit's ending MERGE + REASSIGNMENT, every featured colonist's line null, THE LAST LANDING null;
//   both resume; the codec's v7 refusals (a decided finale with no step 2, SPARE + SUNSET, STAY naming no ship, THE LAST
//   LANDING set, a pod restored that MERGE never gave back, SHIP DONE with an open finale);
// • the archive: META 3 → 4 of the archive fixture (MERGE + REASSIGNMENT from the trail's last stop, endingsSeen gains
//   'reassignment', traces dropped), each cause's migration, parseEnding strict, recordRunEnd's pieces;
// • the gates and tables: data/endings.ts all down, its option tables, the title keys; the neutral stubs' answers and the
//   throwing ones; finaleRunCause and endingRecordOf; the arbiter shut while the card is up.
import { withClassicWorld } from '../support/classic-fixture';
import { currentSlot } from '@systems/map-run';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { EndingRecord } from '@/types/ending';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { decodeRunSave, migrateRunSave, encodeRunSave, finaleRefusal } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { parseMeta, recordRunEnd, freshMeta, META_MIGRATIONS, MetaCorrupt } from '@systems/meta';
import { parseEnding } from '@systems/meta-parse';
import { optionState, emptyShip, stayCandidates, endingRecordOf, finaleRunCause, reportEndingLine } from '@systems/ending-rules';
import { pickStay, continueFollowed, pickStep1, pickStep2 } from '@systems/finale';
import { isDeepStrictEqual } from 'node:util';
import { chargeLeft } from '@state/selectors';
import { FINALE_TEXT } from '@data/finale-text';
import { epilogueModel, finalCardModel } from '@systems/epilogue';
import { choiceMayOpen, sayChoice, withdrawUntimedChoices, mountSay, openChoiceEntry } from '@systems/say';
import { finaleCardUp, finalePending } from '@state/selectors';
import {
  ENDINGS_BUILT, ENDING_PIECES, STEP1_OPTIONS, STEP2_OPTIONS, step2Options, builtPieces, endingTitleKey,
} from '@data/endings';
import { stubStorage, pageOpen } from '../save/save-fixture';
import { decideFinale, openFinaleStep1 } from '../support/finale';
import {
  RUN_SAVE_KEY, RUN_SAVE_VERSION, META_STORAGE_KEY, META_VERSION, EMPTY_SHIP_FUEL_PCT, STAR_FUEL_PCT, MERGE_COST_CHARGE, SIGNALS_FOR_CONTACT,
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
// The one gate left (the 7a fix pass dropped twoStep and night, review (e)): 7d's CONTACT.
check('built: CONTACT (7d raised it; signals/contact)', ENDINGS_BUILT.contact && JSON.stringify(Object.keys(ENDINGS_BUILT)) === '["contact"]');
// (7c bumped the save to 8: traces/foundation pins it; this suite's v6 fixtures migrate through 7 to it.)
check(`RUN_SAVE_VERSION 7 or later, META_VERSION 4, EMPTY_SHIP_FUEL_PCT = STAR_FUEL_PCT (${STAR_FUEL_PCT}: one ★ notch, R8)`,
  RUN_SAVE_VERSION >= 7 && META_VERSION === 4 && EMPTY_SHIP_FUEL_PCT === STAR_FUEL_PCT);
check('the pieces: seven, all built with CONTACT (ENDINGS n/7, R22)',
  ENDING_PIECES.length === 7 && builtPieces().length === 7 && builtPieces().includes('contact'));
check('step 1 is PURGE MERGE SPARE on keys 1–3, SPARE rules out SUNSET; step 2 is SUNSET STAY REASSIGNMENT CONTACT, on keys 1–4 (7d)',
  STEP1_OPTIONS.map((option) => `${option.key}${option.piece}`).join() === '1purge,2merge,3spare'
  && STEP1_OPTIONS.find((option) => option.piece === 'spare')?.rulesOut === 'sunset'
  && STEP2_OPTIONS.map((option) => option.piece).join() === 'sunset,stay,reassignment,contact'
  && step2Options().map((option) => option.piece).join() === 'sunset,stay,reassignment,contact');
check('a title is keyed by step 2, then step 1; SPARE + SUNSET has none (R8, R23)',
  endingTitleKey('sunset', 'merge') === 'sunset:merge' && endingTitleKey('reassignment', 'followed') === 'reassignment:followed'
  && /rules out SUNSET/.test(threw(() => endingTitleKey('sunset', 'spare'))));

// --- The stubs, the cause, the record ----------------------------------------------------------------------------------------
{
  const store = createStore<GameState>(createInitialState({ seed: 7 }));
  const state = store.getState();
  // As built by Track FINALE (ending/rules has the rest): a fresh world is no final ship in orbit, has no ★ ON TARGET ship
  // and no decided FINALE, so the rows that need them are out of reach (`???` before they were ever chosen).
  check('the built rules on a fresh world: PURGE and REASSIGNMENT open and free, MERGE by its charge meter, SPARE/SUNSET/STAY/CONTACT out of reach and unnamed (CONTACT: 0 of 3 signals); no empty ship, no STAY ship, no report line',
    isDeepStrictEqual(optionState(state, 'purge', []), { kind: 'open', price: null, now: null })
    && isDeepStrictEqual(optionState(state, 'reassignment', []), { kind: 'open', price: null, now: null })
    && isDeepStrictEqual(optionState(state, 'merge', []), { kind: 'open', price: { kind: 'charge', have: chargeLeft(state), need: MERGE_COST_CHARGE }, now: null })
    && ['spare', 'sunset', 'stay'].every((piece) => { const option = optionState(state, piece as never, []); return option.kind === 'needs' && !option.named; })
    && isDeepStrictEqual(optionState(state, 'contact', []), { kind: 'needs', need: FINALE_TEXT.needs.signals(0, SIGNALS_FOR_CONTACT), named: false, price: { kind: 'signals', have: 0, need: SIGNALS_FOR_CONTACT } })
    && !emptyShip(state).ok && stayCandidates(state).length === 0 && reportEndingLine(state) === null);
  check('the card\'s other ways on, as built: pickStay and continueFollowed refuse off the card (NOT NOW), never throw',
    pickStay(store, 0) === 'NOT NOW' && continueFollowed(store) === 'NOT NOW');
  check('a fresh world: no ending (no record), nothing pending, no card', state.hollow.finale.record === null && endingRecordOf(state) === null && !finalePending(state) && !finaleCardUp(state)
    && /not decided/.test(threw(() => finaleRunCause(state))));
  store.update((draft) => {
    draft.landing.finalShip = true;
    decideFinale(draft, 'merge');
  });
  const record = endingRecordOf(store.getState());
  // A headless world is run 1's arm (Track RETIRE): the record names the slot it was decided on, and its real year.
  check('a decided FINALE on a final ship: its frozen record (MERGE + REASSIGNMENT, the root, its slot and year, the kit, no FUEL) and won-merge',
    record !== null && record === store.getState().hollow.finale.record && record.hollow === 'merge' && record.you === 'reassignment'
    && JSON.stringify(record.rootUnits) === '[46]' && store.getState().run.map.world === 'arm' && record.finalSlot === currentSlot(store.getState().run)
    && record.finalYear === store.getState().run.map.galaxyYear && record.kit.includes('scan')
    && record.fuelPct === null && finaleRunCause(store.getState()) === 'won-merge', JSON.stringify(record));
  // The classic world's own branch (review m6; it goes with the classic five): no arm slot, its real year.
  const classic = withClassicWorld(() => createInitialState({ seed: 7 }));
  classic.landing.finalShip = true;
  decideFinale(classic, 'merge');
  check('…on the classic world: no slot, but its year', classic.hollow.finale.record?.finalSlot === null
    && classic.hollow.finale.record?.finalYear === classic.run.map.galaxyYear, JSON.stringify(classic.hollow.finale.record));
  for (const [fate, cause] of [['purge', 'won-purge'], ['spare', 'won-spare'], ['followed', 'unresolved']] as const) {
    store.update((draft) => { decideFinale(draft, fate); });
    check(`…step 1 ${fate} is ${cause} (R17)`, finaleRunCause(store.getState()) === cause);
  }
  check('…a SPARE keeps the empty ship\'s FUEL as shown', endingRecordOf(store.getState())?.fuelPct === null
    && (() => { store.update((draft) => { decideFinale(draft, 'spare'); }); return endingRecordOf(store.getState())?.fuelPct !== null; })());
  // The arbiter (R18): no TERMINAL choice opens while the card is up, and the card's open withdraws an untimed one.
  const unmount = mountSay(store);
  store.update((draft) => { draft.hollow.finale.phase = 'none'; });
  sayChoice('sleeper', 'stay with me?', ['YES'], null, () => undefined);
  const untimed = openChoiceEntry(store.getState());
  store.update((draft) => { openFinaleStep1(draft.hollow.finale); });
  check('the arbiter: the card up (step 1) shuts every choice, timed or not', finaleCardUp(store.getState())
    && !choiceMayOpen(store.getState(), true) && !choiceMayOpen(store.getState(), false));
  check('…and withdrawUntimedChoices closes the untimed one standing', untimed !== null && withdrawUntimedChoices() === 1
    && openChoiceEntry(store.getState()) === null);
  // Review M6: step 1's price is judged again at the confirm. MERGE picked at 25 charge, a REPAIR drains it to 19 under the
  // card: the confirm goes back to step 1 with the reason, nothing applied, and never throws.
  const setCharge = (used: number): void => store.update((draft) => {
    const pool = draft.memory.find((seg) => seg.type === 'redundancy');
    if (pool?.type !== 'redundancy') throw new Error('foundation: no REPAIR CHARGE pool');
    pool.used = used;
  });
  store.update((draft) => { Object.assign(draft.hollow.finale, { phase: 'none', hollow: null, you: null, record: null }); openFinaleStep1(draft.hollow.finale); });
  setCharge(25);
  const picked = pickStep1(store, 'merge');
  setCharge(19);
  let confirmed: string | null = 'threw';
  const thrown = threw(() => { confirmed = pickStep2(store, 'reassignment'); });
  const after = store.getState().hollow.finale;
  check('the confirm re-checks step 1\'s price: MERGE short at the confirm goes back to step 1 with its need, the pick kept, nothing applied',
    picked === null && thrown === '' && confirmed === FINALE_TEXT.needs.charge(19) && after.phase === 'step1' && after.hollow === 'merge'
    && after.you === null && after.record === null && chargeLeft(store.getState()) === 19,
    `${picked} ${String(confirmed)} ${thrown} ${after.phase}`);
  unmount();
}

// The night's stubs (Track NIGHT's block, review M1: apart from FINALE's lines).
{
  const state = createInitialState({ seed: 7 });
  check('the night has no models off the run end (built: ending/epilogue)', epilogueModel(state, null) === null && finalCardModel(state, null) === null);
}

// --- The save: v6 → v7 --------------------------------------------------------------------------------------------------------
function resumeFixture(file: string): ReturnType<typeof createStore<GameState>> {
  const { save, meta } = fixture(file);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  if (store.getState().save.status !== 'ok' || pendingRunSave() === null) throw new Error(`resumeFixture: ${file} is not offered (${JSON.stringify(store.getState().save)})`);
  resumeRun(store);
  return store;
}

const v6Ending = fixture('run-save-v6-ending-chosen-lastlight.json');
{
  const migrated = migrateRunSave(v6Ending.save) as Raw;
  const finale = migrated.payload.slices.hollow.finale;
  const decoded = decodeRunSave(JSON.stringify(v6Ending.save));
  check('the v6 ENDING CHOSEN (LAST LIGHT, PURGE) migrates to v7 (and on to this build\'s version) and decodes', v6Ending.save.saveVersion === 6 && migrated.saveVersion === RUN_SAVE_VERSION && decoded.ok,
    decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  check('…its finale is done: PURGE + REASSIGNMENT, the root fallen, nothing restored, no STAY, no card second (R16)',
    finale.phase === 'done' && finale.hollow === 'purge' && finale.you === 'reassignment' && finale.rootFell === true
    && JSON.stringify(finale.restored) === '[]' && finale.stay === null && finale.cardAtAi === null && !('restoredHalf' in finale),
    JSON.stringify(finale));
  const lastLight = v6Ending.save.payload.run.map.route.at(-1);
  check('…and its ending record, as the confirm would have frozen it: PURGE + REASSIGNMENT at LAST LIGHT\'s slot and year, the kit and charge from its memory (review M4)',
    finale.record?.hollow === 'purge' && finale.record.you === 'reassignment' && finale.record.finalShip === 'LAST LIGHT'
    && finale.record.finalSlot === lastLight.slot && finale.record.finalYear === v6Ending.save.payload.run.map.galaxyYear
    && finale.record.kit.includes('scan') && Number.isInteger(finale.record.charge) && finale.record.fuelPct === null && finale.record.stay === null,
    JSON.stringify(finale.record));
  check('…THE LAST LANDING null, every featured colonist\'s line null (R2, R21)', migrated.payload.slices.landing.lastLanding === null
    && migrated.payload.run.ships.length > 0 && migrated.payload.run.ships.every((ship: Raw) => ship.pods.every((pod: Raw) => pod.featured.every((colonist: Raw) => colonist.line === null))));
  const store = resumeFixture('run-save-v6-ending-chosen-lastlight.json');
  check('…and resumes at LAST LIGHT\'s LANDING REPORT with the finale decided', store.getState().run.phase === 'report'
    && store.getState().landing.finalShip && store.getState().hollow.finale.phase === 'done' && finaleRunCause(store.getState()) === 'won-purge');
}
const v6Run2 = fixture('run-save-v6-ship-done-run2.json');
{
  const migrated = migrateRunSave(v6Run2.save) as Raw;
  const ending = migrated.payload.run.lastUnit.ending;
  const decoded = decodeRunSave(JSON.stringify(v6Run2.save));
  check('the v6 run 2 desk migrates to v7 (and on to this build\'s version) and decodes', v6Run2.save.saveVersion === 6 && migrated.saveVersion === RUN_SAVE_VERSION && decoded.ok,
    decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  const lastStop = v6Run2.save.payload.run.lastUnit.trail.stops.at(-1);
  check('…its last unit\'s ending is MERGE + REASSIGNMENT, the root its HOLLOW, the final ship the trail\'s last stop (R16)',
    ending.hollow === 'merge' && ending.you === 'reassignment' && JSON.stringify(ending.rootUnits) === '[46]' && ending.finalSlot === lastStop.slot
    && ending.finalYear === lastStop.year && ending.finalShip === 'LAST LIGHT' && ending.stay === null && ending.kit.length === 0
    && ending.fuelPct === null && ending.charge === 0, JSON.stringify(ending));
  const store = resumeFixture('run-save-v6-ship-done-run2.json');
  check('…and resumes at run 2\'s first desk, the last unit\'s ending kept', store.getState().run.phase === 'desk'
    && store.getState().run.map.run === 2 && store.getState().run.lastUnit?.ending?.hollow === 'merge');
}

// The codec's v7 refusals, each on the migrated ENDING CHOSEN (or the run 2 desk).
{
  const base = migrateRunSave(v6Ending.save) as Raw;
  const desk = migrateRunSave(v6Run2.save) as Raw;
  const refusal = (from: Raw, edit: (save: Raw) => void): string => {
    const copy = structuredClone(from);
    edit(copy);
    const decoded = decodeRunSave(JSON.stringify(copy));
    return decoded.ok ? 'decoded' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`;
  };
  const cases: [string, Raw, (save: Raw) => void, RegExp][] = [
    ['a decided finale with no step 2', base, (save) => { save.payload.slices.hollow.finale.you = null; }, /both choices/],
    ['a root that stands under PURGE', base, (save) => { save.payload.slices.hollow.finale.rootFell = false; }, /root stands/],
    ['SPARE with SUNSET', base, (save) => { Object.assign(save.payload.slices.hollow.finale, { hollow: 'spare', you: 'sunset' }); }, /SPARE with SUNSET/],
    ['STAY naming no ship of the run', base, (save) => { Object.assign(save.payload.slices.hollow.finale, { you: 'stay', stay: 7 }); }, /STAY names slot 7/],
    ['STAY with no ship', base, (save) => { save.payload.slices.hollow.finale.you = 'stay'; }, /STAY's ship is missing/],
    ['THE LAST LANDING set', base, (save) => { save.payload.slices.landing.lastLanding = { pods: [] }; }, /lastLanding/],
    ['a pod MERGE never gave back', base, (save) => { save.payload.slices.hollow.finale.restored = [3]; }, /restored pod 3/],
    ['a decided finale without its record', base, (save) => { save.payload.slices.hollow.finale.record = null; }, /without its ending record/],
    ['a record that is not the finale\'s', base, (save) => { save.payload.slices.hollow.finale.record.hollow = 'merge'; }, /is not the finale's/],
    ['a record that does not parse', base, (save) => { save.payload.slices.hollow.finale.record.kit = ['jam']; }, /not an ending record/],
    ['an unknown phase', base, (save) => { save.payload.slices.hollow.finale.phase = 'choice'; }, /finale\.phase/],
    ['ENDING CHOSEN at step 1', base, (save) => { save.payload.slices.hollow.finale.phase = 'step1'; }, /^route/],
    ['SHIP DONE with an open finale', desk, (save) => { save.payload.slices.hollow.finale.phase = 'duel'; }, /SHIP DONE with the finale 'duel'/],
    // Review m2: STAY's ship must be ★ ON TARGET, an ended ship by its summaries, the final ship by its live pods.
    ['STAY naming an ended ship off target', base, (save) => {
      const ship = save.payload.run.ships[0];
      for (const pod of ship.pods) Object.assign(pod, { fate: 'parked', place: null, lz: null, touch: null });
      Object.assign(save.payload.slices.hollow.finale, { you: 'stay', stay: ship.slot });
    }, /not a ★ ON TARGET ship/],
    ['STAY naming the final ship off target', base, (save) => {
      for (const record of save.payload.slices.landing.pods) if (record.fate.kind === 'down') record.fate.touchdown.touch = 'hard';
      Object.assign(save.payload.slices.hollow.finale, { you: 'stay', stay: save.payload.run.map.route.at(-1).slot });
    }, /not a ★ ON TARGET ship/],
    ['a last unit\'s ending with SPARE + SUNSET', desk, (save) => { Object.assign(save.payload.run.lastUnit.ending, { hollow: 'spare', you: 'sunset', fuelPct: 30 }); }, /SPARE rules out SUNSET/],
  ];
  for (const [what, from, edit, want] of cases) {
    const got = refusal(from, edit);
    check(`the codec refuses ${what}`, want.test(got), got);
  }
  const roundTrip = decodeRunSave(encodeRunSave((decodeRunSave(JSON.stringify(base)) as { ok: true; save: never }).save));
  check('…and a v7 save round-trips', roundTrip.ok);
  // Review m1: the record is frozen at the confirm, so it stands at 'verdict' and 'last-landing' too (no save point falls
  // there, R14: the codec's own check is called), and before the confirm there is none.
  const slices = base.payload.slices;
  const at = (phase: string, record: unknown = slices.hollow.finale.record): string | null => finaleRefusal(
    'beam', { ...slices.hollow.finale, phase, record }, slices.landing, base.payload.run, base.payload.run.map.route.at(-1).slot);
  check('the codec takes the record at \'verdict\', \'last-landing\' and \'done\', refuses one at step 2, and none from \'verdict\' on',
    at('verdict') === null && at('last-landing') === null && at('done') === null && /before the confirm \('step2'\)/.test(at('step2') ?? '')
    && /without its ending record/.test(at('verdict', null) ?? ''), `${at('verdict')} | ${at('step2')} | ${at('verdict', null)}`);
}

// --- The archive: META 3 → 4 --------------------------------------------------------------------------------------------------
{
  const v3 = JSON.parse(readFileSync(join(FIXTURES, 'meta-v3-won-merge.json'), 'utf8')) as Raw;
  const meta = parseMeta(JSON.stringify(v3));
  const stop = v3.lastUnit.trail.stops.at(-1);
  check('the META-3 archive (run 1 MERGE) reads as META 4: MERGE + REASSIGNMENT from the trail\'s last stop (R16)',
    v3.version === 3 && meta.version === 4 && meta.lastUnit?.ending?.hollow === 'merge' && meta.lastUnit.ending.you === 'reassignment'
    && meta.lastUnit.ending.finalSlot === stop.slot && meta.lastUnit.ending.finalYear === stop.year && meta.lastUnit.ending.finalShip === stop.shipName,
    JSON.stringify(meta.lastUnit?.ending));
  check('…endingsSeen gains REASSIGNMENT, traces is gone', JSON.stringify(v3.endingsSeen) === '["merge"]'
    && JSON.stringify(meta.endingsSeen) === '["merge","reassignment"]' && !('traces' in meta));
  const step = META_MIGRATIONS[3]!;
  const unitOf = (cause: string, trail: unknown = null): Raw => ({ ...v3.lastUnit, cause, trail, shipName: 'LAST LIGHT' });
  const migrated = (cause: string, trail: unknown = null): Raw => (step({ ...v3, endingsSeen: [], lastUnit: unitOf(cause, trail) }).lastUnit as Raw).ending;
  check('…each cause: won-purge → PURGE, unresolved → followed, every lost cause → null; a classic record with no trail keeps its ship only',
    migrated('won-purge').hollow === 'purge' && migrated('unresolved').hollow === 'followed'
    && ['flagship-lost', 'overwritten', 'stayed', 'abandoned', 'signal-lost'].every((cause) => migrated(cause) === null)
    && migrated('won-purge').finalSlot === null && migrated('won-purge').finalYear === null && migrated('won-purge').finalShip === 'LAST LIGHT');
  check('…an empty endingsSeen stays empty', JSON.stringify(step({ ...v3, endingsSeen: [] }).endingsSeen) === '[]');
  check('…but an UNRESOLVED last unit stood by: its archive gains REASSIGNMENT (review m5, as recordRunEnd records it)',
    JSON.stringify(step({ ...v3, endingsSeen: [], lastUnit: unitOf('unresolved') }).endingsSeen) === '["reassignment"]');
  check('…traces at version 4 is an unknown field', (() => {
    try { parseMeta(JSON.stringify({ ...meta, traces: [] })); return false; } catch (error) { return error instanceof MetaCorrupt && /traces/.test(error.message); }
  })());
}
{
  const good: EndingRecord = {
    hollow: 'spare', you: 'stay', rootUnits: [46], finalSlot: 19, finalShip: 'LAST LIGHT', finalYear: 3020,
    stay: { slot: 5, colony: 'RIVERSIDE', year: 2580 }, kit: ['scan', 'delete'], fuelPct: 23, charge: 26,
  };
  check('parseEnding reads a whole record back exactly', JSON.stringify(parseEnding(good, 'e')) === JSON.stringify(good));
  const bad: [string, Partial<Record<keyof EndingRecord, unknown>> & Raw, RegExp][] = [
    ['an unknown step 1', { hollow: 'eat' }, /hollow 'eat'/],
    ['an unknown step 2', { you: 'nap' }, /you 'nap'/],
    ['SPARE + SUNSET', { you: 'sunset', stay: null }, /SPARE rules out SUNSET/],
    ['STAY with no colony', { stay: null }, /missing for STAY/],
    ['a colony without STAY', { you: 'reassignment' }, /set without STAY/],
    ['FUEL kept for neither SPARE nor SUNSET', { hollow: 'purge' }, /fuelPct/],
    ['a tool twice', { kit: ['scan', 'scan'] }, /twice/],
    ['a FUEL over 100', { fuelPct: 101 }, /over 100/],
    ['an extra field', { extra: 1 }, /unknown fields/],
  ];
  for (const [what, edit, want] of bad) {
    const message = threw(() => parseEnding({ ...good, ...edit }, 'e'));
    check(`parseEnding refuses ${what}`, want.test(message), message);
  }
  const ended = recordRunEnd(freshMeta(1), {
    unit: 47, shipName: 'LAST LIGHT', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, cause: 'unresolved', score: 0,
    ending: { ...good, hollow: 'followed', you: 'reassignment', stay: null, fuelPct: null },
  });
  check('recordRunEnd keeps the ending and adds its pieces (a followed step 1 is none)', ended.lastUnit?.ending?.hollow === 'followed'
    && JSON.stringify(ended.endingsSeen) === '["reassignment"]');
  const lost = recordRunEnd(freshMeta(1), {
    unit: 47, shipName: 'VESPER', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null, cause: 'overwritten', score: 0,
  });
  check('…a lost run keeps none', lost.lastUnit?.ending === null && lost.endingsSeen.length === 0);
}

finish();
