// Track SAVE (slice 3c plan §6.1 save/codec): the run save's codec on run 1's worked route, store-level, no flights.
// • every point is written by the game itself (systems/save-write.ts through the stub): RUN START, SHIP DONE at each of the
//   five desks, BEAM into each of the five later ships, ENDING CHOSEN on LAST LIGHT's report; each decodes, re-encodes to
//   the very same JSON, and a world point deep-equals a save built again from the state it was written from;
// • the sticky ghost burst's Infinity is tagged and comes back; any other non-finite number and a classic map throw on
//   encode; a point written from the wrong moment throws;
// • the decoder refuses, in order: not JSON, another save version (and migrateRunSave steps a known older one in place),
//   each content version, a missing or unknown key, the saved run field by field (a type, an Infinity in the wrong place,
//   the envelope's copies against the run), a classic map, a route that doesn't match its point, a ship that doesn't build;
// • saveRefusal finds a stale save; the size at each point is printed (INFO, risk 8).
import { isDeepStrictEqual } from 'node:util';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RunSave } from '@/types/save';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { freshMeta, recordRunStart, archiveMeta, FIRST_RUN_LINEAGE } from '@systems/meta';
import { nominalShipThreat } from '@systems/threat-plan';
import {
  buildRunSave, encodeRunSave, decodeRunSave, saveRefusal, contentVersions, savePayloadAt, RUN_SAVE_MIGRATIONS, migrateRunSave,
} from '@systems/save-codec';
import { RUN_SAVE_VERSION, SAVE_SIZE_INFO_BYTES } from '@data/tuning';
import {
  stubStorage, pageOpen, storedSave, receiveToReport, toDesk, beamTo, finalReport, WORKED_ROUTE,
} from './save-fixture';

const SEED = 7;
const storage = stubStorage();
const store = createStore<GameState>(createInitialState({ seed: SEED }));
pageOpen(store, storage, SEED);
check('the page opens on UNIT-047\'s title with a working save and nothing to resume', store.getState().run.phase === 'title'
  && JSON.stringify(store.getState().save) === JSON.stringify({ status: 'ok', resume: null, refusal: null }) && store.getState().run.map.world === 'arm');

// --- Every point on the worked route, as the game writes it ---------------------------------------------------------------
interface Written { label: string; raw: string; save: RunSave; state: GameState }
const written: Written[] = [];
const take = (label: string): void => {
  const { raw, save } = storedSave(storage);
  written.push({ label, raw, save, state: structuredClone(store.getState()) as GameState });
};
receiveToReport(store);
written.push({ ...storedSave(storage), label: 'RUN START', state: structuredClone(store.getState()) as GameState });
for (let i = 1; i < WORKED_ROUTE.length; i++) {
  toDesk(store);
  take(`SHIP DONE ${i}`);
  beamTo(store, WORKED_ROUTE[i]!);
  take(`BEAM ${i + 1}`);
}
// The final ship's LANDING REPORT, a sticky burst held to the end (its Infinity rides the save).
store.update((draft) => { draft.burn.ghost = { startTSec: 12, endTSec: Infinity, amp: 0.4, sticky: true, releaseArmed: false }; });
finalReport(store);
take('ENDING CHOSEN');

const points = written.map((entry) => `${entry.label}:${entry.save.point}`);
check('twelve saves on the worked route: RUN START, five SHIP DONE, five BEAM, ENDING CHOSEN, at the right points', written.length === 12
  && written[0]!.save.point === 'run-start' && written.slice(1, -1).every((entry, i) => entry.save.point === (i % 2 === 0 ? 'ship-done' : 'beam'))
  && written.at(-1)!.save.point === 'ending-chosen', points.join(' '));
check('…each re-encodes to the very JSON that was stored (decode ∘ encode is the identity)',
  written.every((entry) => encodeRunSave(entry.save) === entry.raw), written.filter((entry) => encodeRunSave(entry.save) !== entry.raw).map((e) => e.label).join());
const worldOk = written.filter((entry) => entry.save.payload.kind === 'world').every((entry) => isDeepStrictEqual(
  entry.save, buildRunSave(entry.state, entry.save.point, entry.save.archiveRuns, null, entry.save.writtenAt)));
check('…a world point deep-equals the save built again from the state it was written from (no key lost to JSON)', worldOk);
check('…the boot points carry the racks and the verdict the beam built (ship 1: none, nominal)', written.filter((entry) => entry.save.payload.kind === 'boot')
  .every((entry, i) => entry.save.payload.kind === 'boot' && (i === 0 ? entry.save.payload.carried === null : entry.save.payload.carried !== null)
    && entry.save.payload.threat.depth === entry.save.payload.run.shipIndex + 1));
const ending = written.at(-1)!;
check('…the sticky burst\'s Infinity is tagged and comes back', ending.raw.includes('{"$num":"Infinity"}') && ending.save.payload.kind === 'world'
  && ending.save.payload.slices.burn.ghost?.endTSec === Infinity);
check('…the resume lines: RUN START names ARES-VII 2300, BEAM 2 names HALCYON at depth 2, ENDING CHOSEN LAST LIGHT at depth 6',
  JSON.stringify(written[0]!.save.resume) === JSON.stringify({ unit: 47, depth: 1, ship: 'ARES-VII', year: 2300, point: 'run-start' })
  && written[2]!.save.resume.ship === 'HALCYON' && written[2]!.save.resume.depth === 2
  && ending.save.resume.ship === 'LAST LIGHT' && ending.save.resume.depth === 6, JSON.stringify(written.map((entry) => entry.save.resume.ship)));
check('…every save is the archive\'s run: unit 47, archiveRuns 1 (counted at RUN START)', written.every((entry) => entry.save.unit === 47
  && entry.save.archiveRuns === 1 && saveRefusal(entry.save, archiveMeta()) === null));
for (const entry of written) {
  console.log(`INFO  ${entry.label.padEnd(14)} ${entry.save.point.padEnd(13)} ${entry.raw.length.toLocaleString('en').padStart(8)} bytes`);
}
const largest = Math.max(...written.map((entry) => entry.raw.length));
check(`the largest save (${largest.toLocaleString('en')} bytes) is under SAVE_SIZE_INFO_BYTES (${SAVE_SIZE_INFO_BYTES.toLocaleString('en')}; INFO, risk 8)`, largest < SAVE_SIZE_INFO_BYTES);

// --- Encode refuses ------------------------------------------------------------------------------------------------------
const title = createInitialState({ seed: SEED, phase: 'title', map: createRunMap(FIRST_RUN_LINEAGE, SEED) });
const at = (phase: GameState['run']['phase'], touch: (state: GameState) => void = () => {}): GameState => {
  const state = structuredClone(title) as GameState;
  state.run.phase = phase;
  touch(state);
  return state;
};
const BOOT = { carried: null, threat: nominalShipThreat(0) };
const throws = (fn: () => unknown): boolean => { try { fn(); return false; } catch { return true; } };
check('encode throws on any other non-finite number (NaN fuel, an Infinity off a burst\'s end)',
  throws(() => encodeRunSave(buildRunSave(at('report', (state) => { state.burn.fuelPct = Number.NaN; }), 'ending-chosen', 1, null, 0)))
  && throws(() => encodeRunSave(buildRunSave(at('report', (state) => { state.burn.fuelPct = Infinity; }), 'ending-chosen', 1, null, 0))));
const classic = createInitialState({ seed: SEED, phase: 'boot' });
check('a classic-world map is never saved (encode throws)', classic.run.map.world === 'classic'
  && throws(() => encodeRunSave(buildRunSave(classic, 'run-start', 1, BOOT, 0))));
check('a point written from the wrong moment throws (SHIP DONE off the desk; a boot point without its parts)',
  throws(() => savePayloadAt(at('report'), 'ship-done', null)) && throws(() => savePayloadAt(at('boot'), 'run-start', null))
  && throws(() => savePayloadAt(at('boot'), 'beam', BOOT)));

// --- Decode refuses, in order ----------------------------------------------------------------------------------------------
const refusal = (text: string): string => {
  const result = decodeRunSave(text);
  return result.ok ? 'ok' : `${result.refusal.kind}: ${result.refusal.detail}`;
};
const kind = (text: string): string => refusal(text).split(':')[0]!;
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const desk = written[3]!.raw;   // HALCYON's desk (SHIP DONE 2)
const beam = written[4]!.raw;   // the beam into KESTREL
const edit = (raw: string, change: (save: Raw) => void): string => {
  const data = JSON.parse(raw) as Raw;
  change(data);
  return JSON.stringify(data);
};
check('not JSON → not-json', kind('{ this is not a run save') === 'not-json');
check('another save version → version', kind(edit(desk, (save) => { save.saveVersion = RUN_SAVE_VERSION + 1; })) === 'version');
// Slice 4: the first step (1 → 2, the skill tree; its fixtures are migrated in tests/unit/skills/foundation.test.ts).
check('migrateRunSave knows eight steps (1 → 2, slice 4; 2 → 3, its review; 3 → 4, slices 4c–4e; 4 → 5, slice 5; 5 → 6, slice 6; 6 → 7, slice 7a; 7 → 8, slice 7c; 8 → 9, slice 7d), and leaves an unknown version for check 2',
  Object.keys(RUN_SAVE_MIGRATIONS).join() === '1,2,3,4,5,6,7,8' && isDeepStrictEqual(migrateRunSave({ saveVersion: 0 }), { saveVersion: 0 }));
// 2 → 3: a v2 save (burn.auto without flying / captured) steps up with both empty and decodes; a v3 save burning with its
// burn in hand reads (4c's mid-flight saves).
const v2 = edit(desk, (save) => { save.saveVersion = 2; delete save.payload.slices.burn.auto.flying; delete save.payload.slices.burn.auto.captured; });
const v2Up = decodeRunSave(v2);
check('a v2 save (no burn.auto.flying, captured) migrates to v3 with both empty, and decodes', v2Up.ok
  && v2Up.save.payload.kind === 'world' && v2Up.save.payload.slices.burn.auto.flying === null && v2Up.save.payload.slices.burn.auto.captured === false,
  v2Up.ok ? '' : `${v2Up.refusal.kind}: ${v2Up.refusal.detail}`);
check('…a machine burning with its burn in hand passes the shape', kind(edit(desk, (save) => {
  Object.assign(save.payload.slices.burn.auto, { phase: 'burning', mode: 'capture', claimed: true, captured: true,
    flying: { preset: 'retrograde', reason: 'capture', event: 'peri' } });
})) !== 'shape');
const contentKeys = Object.keys(contentVersions()) as (keyof ReturnType<typeof contentVersions>)[];
const contentRefused = contentKeys.filter((key) => kind(edit(desk, (save) => { save.content[key] += 1; })) === 'content');
check('each content version mismatched in turn → content', contentRefused.length === contentKeys.length, contentRefused.join(', '));
const shapes: [string, string][] = [
  ['a missing key', edit(desk, (save) => { delete save.done; })],
  ['an unknown key', edit(desk, (save) => { save.extra = 1; })],
  ['ironman (not built)', edit(desk, (save) => { save.mode = 'ironman'; })],
  ['the run without a field', edit(desk, (save) => { delete save.payload.run.inbox; })],
  ['the run with a field this build does not know', edit(desk, (save) => { save.payload.run.skills = []; })],
  ['a ship of the arm with text for a flag', edit(desk, (save) => { save.payload.run.map.arm[3].late = 'yes'; })],
  ['a ship of the arm missing a field', edit(desk, (save) => { delete save.payload.run.map.arm[7].reserved; })],
  ['a negative count in the stats', edit(desk, (save) => { save.payload.run.stats.repairs = -1; })],
  ['a request with no id', edit(desk, (save) => { save.payload.run.repo.requests.push({ fromSlot: 0 }); })],
  ['a hop with a fractional year', edit(desk, (save) => { save.payload.run.map.route[1].hop.leaveYear = 2300.5; })],
  ['a slice with text for a number', edit(desk, (save) => { save.payload.slices.burn.fuelPct = 'full'; })],
  ['a slice with an unknown field', edit(desk, (save) => { save.payload.slices.clock.warp = 2; })],
  ['a segment with no id', edit(desk, (save) => { delete save.payload.slices.memory[0].id; })],
  ['an Infinity tag off a burst\'s end', edit(desk, (save) => { save.payload.slices.burn.fuelPct = { $num: 'Infinity' }; })],
  ['a beam\'s verdict missing a field', edit(beam, (save) => { delete save.payload.threat.depth; })],
  ['a save that is another unit\'s than its run', edit(desk, (save) => { save.unit = 48; })],
  ['a resume line at another depth', edit(desk, (save) => { save.resume.depth = 4; })],
  ['a resume line naming another ship', edit(desk, (save) => { save.resume.ship = 'VESPER'; })],
  ['a beam left with a transit plan', edit(beam, (save) => { save.payload.run.transit = save.payload.run.arrival; })],
  // Slice 4 (TREE): the tree's history read as a whole, the skill files' levels, the arrival's skill files.
  ['fewer earnings than ships ended', edit(desk, (save) => { save.payload.run.skills.earned.pop(); })],
  ['an earning on another ship\'s slot', edit(desk, (save) => { save.payload.run.skills.earned[0].slot = 99; })],
  ['a bank below 0', edit(desk, (save) => {
    save.payload.run.skills.bought.push({ skill: 'autoburn', kind: 'train', to: { version: 2, lock: 0 }, cost: 99, visit: 1 });
  })],
  ['a skill file with no version (the carried racks)', edit(beam, (save) => {
    delete (save.payload.carried.segs as Raw[]).find((seg) => seg.upgrade === 'autoburn')!.version;
  })],
  ['an arrival skill of an unknown kind', edit(beam, (save) => { save.payload.run.arrival.skills[0].kind = 'bought'; })],
  // Slice 4 review (v3): AUTOBURN's machine, read whole: a burning machine has its burn in hand, an idle one none.
  ['AUTOBURN burning with no burn in hand', edit(desk, (save) => { save.payload.slices.burn.auto.phase = 'burning'; })],
  ['AUTOBURN idle with a burn in hand', edit(desk, (save) => {
    save.payload.slices.burn.auto.flying = { preset: 'retrograde', reason: 'capture', event: 'peri' };
  })],
  ['AUTOBURN\'s burn in hand on an unknown preset', edit(desk, (save) => {
    save.payload.slices.burn.auto.phase = 'burning';
    save.payload.slices.burn.auto.flying = { preset: 'radial-in', reason: 'capture', event: 'peri' };
  })],
  ['AUTOBURN without its capture flag (a v2 shape at v3)', edit(desk, (save) => { delete save.payload.slices.burn.auto.captured; })],
  // Slices 4c–4e (v4): the new machines at rest, the lasting record on the route.
  ['AUTODROP armed at a save point', edit(desk, (save) => { save.payload.slices.landing.autodrop.armed = 'pass'; })],
  ['AUTODROP held at a save point', edit(desk, (save) => { save.payload.slices.landing.autodrop.held = true; })],
  ['AUTODROP holding its thread', edit(desk, (save) => { save.payload.slices.landing.autodrop.claimed = true; })],
  ['AUTODROP waiting for a thread', edit(desk, (save) => { save.payload.slices.landing.autodrop.waitingSinceTSec = 12; })],
  ['AUTODROP with its [G] moment kept', edit(desk, (save) => { save.payload.slices.landing.autodrop.armedAtTSec = 300; })],
  ['AUTODROP with an end this build does not know', edit(desk, (save) => { save.payload.slices.landing.autodrop.end = 'tapped'; })],
  ['an AUTODROP pass with half a pod', edit(desk, (save) => { save.payload.slices.landing.autodrop.pass = { 'LZ-A': 1.5 }; })],
  ['AUTOBURN holding without the landing orbit', edit(desk, (save) => { save.payload.slices.burn.auto.holding = true; })],
  ['seedsMetAtDepth past the route', edit(desk, (save) => { save.payload.run.threat.seedsMetAtDepth = 9; })],
  ['seedsMetAtDepth at 0', edit(desk, (save) => { save.payload.run.threat.seedsMetAtDepth = 0; })],
  ['a beam seed without its disguise field', edit(beam, (save) => { delete save.payload.run.arrival.seeds[0].disguise; })],
  ['a beam seed disguised as nothing', edit(beam, (save) => { save.payload.run.arrival.seeds[0].disguise = ''; })],
  ['a pre-empted seed outline at a save point', edit(desk, (save) => {
    save.payload.slices.hollow.seedTelegraph = { startAddr: 10, size: 2, leftSec: 1, preempted: true };
  })],
];
const wrongShape = shapes.filter(([, text]) => kind(text) !== 'shape');
check('the shape, field by field → shape (the envelope, the run, the map, the slices, the copies against the run)', wrongShape.length === 0,
  wrongShape.map(([what, text]) => `${what} → ${refusal(text)}`).join(' | '));
check('…the refusal names the field (`payload.run.map.arm[3].late is not true or false`)',
  refusal(shapes[5]![1]).includes('payload.run.map.arm[3].late'), refusal(shapes[5]![1]));
check('…AUTODROP at rest with what may stand (the review\'s M2 \'released\' end, its moment, the pass numbers, flownAs 2) decodes', decodeRunSave(edit(desk, (save) => {
  Object.assign(save.payload.slices.landing.autodrop, { end: 'released', endAtAi: 812.5, pass: { 'LZ-A': 2, 'LZ-B': 1 }, sent: { 'LZ-A': 2 }, flownAs: 2 });
})).ok);
check('…AUTOBURN v3 holding its landing orbit passes the shape', kind(edit(desk, (save) => {
  Object.assign(save.payload.slices.burn.auto, { phase: 'armed', mode: 'landing-orbit', targetKm: 6100, holding: true });
})) !== 'shape');
check('…a disguised arrival seed and a recorded first seed on the route pass the shape', kind(edit(beam, (save) => {
  save.payload.run.arrival.seeds[0].disguise = 'cache.tmp';
  save.payload.run.threat.seedsMetAtDepth = save.payload.run.map.route.length;
})) !== 'shape');
check('a classic map → classic', kind(edit(desk, (save) => {
  save.payload.run.map.world = 'classic';
})) === 'classic');
check('a route that does not match the point → route (the point, the depth, the ships ended)',
  kind(edit(desk, (save) => { save.point = 'ending-chosen'; save.resume.point = 'ending-chosen'; save.payload.phase = 'report'; save.payload.run.phase = 'report'; })) === 'route'
  && kind(edit(desk, (save) => { save.payload.run.shipIndex = 3; save.resume.depth = 4; })) === 'route'
  && kind(edit(desk, (save) => { save.payload.run.ships.pop(); save.payload.run.skills.earned.pop(); })) === 'route');
check('ENDING CHOSEN with an undecided finale → route', kind(edit(ending.raw, (save) => { save.payload.slices.hollow.finale.phase = 'step1'; })) === 'route');
check('a ship that does not build → ship', kind(edit(desk, (save) => { save.payload.run.map.arm[3].pods = 99; })) === 'ship');

// --- The archive's view (stale) ------------------------------------------------------------------------------------------
const deskSave = written[3]!.save;
const running = recordRunStart(freshMeta(), { unit: 47, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null }, 0);
check('the archive vouches for its own run (unit and runs agree)', saveRefusal(deskSave, running) === null);
check('…a save from a run the archive no longer has in progress (stale), another unit or run count (superseded: review minor 7), or no archive is refused',
  saveRefusal(deskSave, freshMeta())?.kind === 'stale' && saveRefusal({ ...deskSave, unit: 48 }, running)?.kind === 'superseded'
  && saveRefusal({ ...deskSave, archiveRuns: 2 }, running)?.kind === 'superseded' && saveRefusal(deskSave, null)?.kind === 'archive');

finish();
