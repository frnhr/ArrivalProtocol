// Slice 3c foundation: the run save's codec skeleton (systems/save-codec.ts), fast and store-free. A save built at a boot
// point and at a world point round-trips deep-equal (util.isDeepStrictEqual: a key lost to JSON's undefined would show);
// a sticky ghost burst's Infinity is tagged and comes back; any other non-finite number and a classic map throw on encode;
// the decoder refuses, in order, what isn't JSON, another save version, each content version mismatched in turn, a missing
// or unknown key, a classic map, a route that doesn't match its point and a ship that doesn't build; saveRefusal finds a
// stale save. Track SAVE grows it into `save/codec` (every point on the worked route, the deep field checks).
import { isDeepStrictEqual } from 'node:util';
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import type { RunSave } from '@/types/save';
import { createInitialState } from '@state/initial';
import { createRunMap } from '@systems/map-run';
import { FIRST_RUN_LINEAGE, freshMeta, recordRunStart } from '@systems/meta';
import { nominalShipThreat } from '@systems/threat-plan';
import {
  buildRunSave, encodeRunSave, decodeRunSave, saveRefusal, contentVersions, savePayloadAt, resumeLineOf,
} from '@systems/save-codec';
import { RUN_SAVE_VERSION, SAVE_SIZE_INFO_BYTES } from '@data/tuning';

const SEED = 7;
const title = createInitialState({ seed: SEED, phase: 'title', map: createRunMap(FIRST_RUN_LINEAGE, SEED) });
const at = (phase: GameState['run']['phase'], touch: (state: GameState) => void = () => {}): GameState => {
  const state = structuredClone(title) as GameState;
  state.run.phase = phase;
  touch(state);
  return state;
};
const BOOT = { carried: null, threat: nominalShipThreat(0) };

// --- Round trips ---------------------------------------------------------------------------------------------------------
const bootSave = buildRunSave(at('boot'), 'run-start', 1, BOOT, 1_700_000_000_000);
const bootBack = decodeRunSave(encodeRunSave(bootSave));
check('a RUN START save round-trips deep-equal', bootBack.ok && isDeepStrictEqual(bootBack.save, bootSave), bootBack.ok ? '' : JSON.stringify(bootBack.refusal));

const sticky = at('report', (state) => {
  state.burn.ghost = { startTSec: 12, endTSec: Infinity, amp: 0.4, sticky: true, releaseArmed: false };
});
const worldSave = buildRunSave(sticky, 'ending-chosen', 1, null, 0);
const raw = encodeRunSave(worldSave);
const worldBack = decodeRunSave(raw);
check('a world save round-trips deep-equal, the sticky burst\'s Infinity tagged and back', worldBack.ok && isDeepStrictEqual(worldBack.save, worldSave)
  && worldBack.save.payload.kind === 'world' && worldBack.save.payload.slices.burn.ghost?.endTSec === Infinity && raw.includes('{"$num":"Infinity"}'),
  worldBack.ok ? '' : JSON.stringify(worldBack.refusal));
console.log(`INFO  a world save is ${raw.length.toLocaleString('en')} bytes (SAVE_SIZE_INFO_BYTES ${SAVE_SIZE_INFO_BYTES.toLocaleString('en')})`);
check('the resume line names the unit, the depth, the ship and the year', JSON.stringify(worldSave.resume)
  === JSON.stringify({ unit: 47, depth: 1, ship: 'ARES-VII', year: 2300, point: 'ending-chosen' }) && isDeepStrictEqual(resumeLineOf(sticky, 'ending-chosen'), worldSave.resume));

// --- Encode refuses ------------------------------------------------------------------------------------------------------
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
const refusalOf = (text: string): string => {
  const result = decodeRunSave(text);
  return result.ok ? 'ok' : result.refusal.kind;
};
const edited = (edit: (save: Record<string, unknown>) => void): string => {
  const data = JSON.parse(raw) as Record<string, unknown>;
  edit(data);
  return JSON.stringify(data);
};
check('not JSON → not-json', refusalOf('{ this is not a run save') === 'not-json');
check('another save version → version', refusalOf(edited((save) => { save.saveVersion = RUN_SAVE_VERSION + 1; })) === 'version');
const contentKeys = Object.keys(contentVersions()) as (keyof ReturnType<typeof contentVersions>)[];
const contentRefused = contentKeys.filter((key) => refusalOf(edited((save) => { (save.content as Record<string, number>)[key]! += 1; })) === 'content');
check('each content version mismatched in turn → content', contentRefused.length === contentKeys.length, contentRefused.join(', '));
check('a missing key and an unknown key → shape', refusalOf(edited((save) => { delete save.done; })) === 'shape'
  && refusalOf(edited((save) => { save.extra = 1; })) === 'shape' && refusalOf(edited((save) => { save.mode = 'ironman'; })) === 'shape');
check('a classic map → classic', refusalOf(edited((save) => { ((save.payload as RunSave['payload']).run.map as { world: string }).world = 'classic'; })) === 'classic');
check('a route that does not match the point → route', refusalOf(edited((save) => { save.point = 'ship-done'; (save.resume as { point: string }).point = 'ship-done'; })) === 'route'
  && refusalOf(edited((save) => { (save.payload as RunSave['payload']).run.shipIndex = 3; })) === 'route');
check('a ship that does not build → ship', refusalOf(edited((save) => { (save.payload as RunSave['payload']).run.map.arm[3]!.pods = 99; })) === 'ship');

// --- The archive's view (stale) ------------------------------------------------------------------------------------------
const running = recordRunStart(freshMeta(), { unit: 47, shipName: 'ARES-VII', landed: 0, stats: { moves: 0, deletes: 0 }, hollowUnits: [46], trail: null }, 0);
check('the archive vouches for its own run (unit and runs agree)', saveRefusal(worldSave, running) === null);
check('…a save from a run the archive no longer has in progress, another unit, another run count, or no archive is refused',
  saveRefusal(worldSave, freshMeta())?.kind === 'stale' && saveRefusal({ ...worldSave, unit: 48 }, running)?.kind === 'stale'
  && saveRefusal({ ...worldSave, archiveRuns: 2 }, running)?.kind === 'stale' && saveRefusal(worldSave, null)?.kind === 'archive');

finish();
