// Slice 5 FOUNDATION (docs/phase3/impl/slice-5-plan.md §6.1, §7.1): the residents' state, data, seams and save, store level,
// about a second. Nothing here is a resident's behaviour (the tracks' suites own that); it checks the contract they build on:
// • what this build plays: one `built` check per kind, each on its own line (Track WARDEN edits `corrupted`'s, Track KIN
//   `left`'s and `sleeping`'s);
// • ShipDef.resident from the map's reservations (run 1, seed 7: the plan's §1.2 table), none on the classic five, the first
//   or the final ship; the rack-A files per kind under withResidentsBuilt (after Cargo Ctrl, a WALL's width free behind them,
//   the slice's one machine, the same files on every build), and none while a kind is not built;
// • the RECEIVER CLOSED boot line (after the sleep line, before the unpack, amber) on a built resident's ship only;
//   receiverClosed stays false (R10);
// • the ghost composite: ghostBy names Thrust Ctrl's own bursts, and the resident's push is under the arm's failing
//   controller's (R3); POD LOCKED, a locked driver that can still launch some day, the queue and AUTODROP's view skipping it
//   (R7); one deal per ship (R8); a TERMINAL choice with no timer and the residents' voices (R23);
// • the tools' dispatch (the stubs refuse, WARDEN's DELETE is 6.0 s, the lock's 1.0 s); the notable events' order (R27);
// • the save: the v4 fixtures (tests/unit/save/fixtures/run-save-v4-*: SHIP DONE at desk 3, the BEAM into CORMORANT on seed
//   7) migrate to v5, decode and resume; the CORMORANT BEAM resumes with LOOKOUT's files in rack A as a fresh boot builds them,
//   and its SHIP DONE records LOOKOUT and decodes; the codec's v5 refusals (an open lock, an offered DEAL, an offering
//   sleeper, a machine of another kind, a met resident off the route or not the map's, too many signals);
// • the FOUNDATION's words fit the strip.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, finish } from '../landing/checks';
import type { GameState, ShipResult } from '@state/schema';
import type { Segment, DriverSegment, ResidentFileSegment } from '@/types/segment';
import type { ResidentState, ShipResidentDef, ResidentRecord } from '@/types/resident';
import type { DropSolution } from '@/types/landing';
import type { FsToolKind } from '@/types/fs-tool';
import { createStore } from '@state/store';
import { createInitialState, createResidentState, createCorruptedState, createSleeperState, createShipSlices, createRunResidents } from '@state/initial';
import { RESIDENT_BUILT, residentRackA, builtResident, RESIDENT_KIND_MAX_BLOCKS } from '@data/residents';
import { RESIDENT_TEXT, RESIDENT_REFUSAL, pinnedRefusal } from '@data/resident-text';
import { WARDEN_TEXT } from '@data/warden-text';
import { KIN_TEXT } from '@data/kin-text';
import { RACK_A, layoutOf } from '@data/memory';
import { CLASSIC_FIVE } from '@data/classic-five';
import { TYPE_LABELS } from '@data/type-labels';
import { LAUNCH_REFUSAL_TEXT } from '@data/landing-text';
import { shipDefAt } from '@systems/map-run';
import { receiverClosed } from '@systems/delivery-rule';
import { mapBootLines } from '@systems/map-boot';
import { bootLinePlan, bootLine, bootLineTone, speakerTag } from '@data/script';
import { capabilitiesNow, ghostPush, ghostWithoutSwap } from '@systems/capabilities';
import { residentGhostSpec, residentDealOnThisShip, lockedDrivers } from '@state/resident-selectors';
import { isLaunchable, driverCanEverLaunch, driversThatCanEverLaunch, launchQueue, landingView, launchRefusal } from '@systems/landing-rules';
import { mountSay, sayChoice, openChoiceEntry, choiceTimerRunning, withdrawChoice, CHANNEL_OF, lineTypeCps } from '@systems/say';
import { targetRefusal, deleteQuestion } from '@systems/tool-targets';
import { residentToolRule, residentDeleteQuestion } from '@systems/residents';
import { deleteSec } from '@state/actions';
import { isInfectable, hasIntegrity, isResidentFile } from '@state/selectors';
import { categoryOf } from '@state/sidebar-filters';
import { notableEvents } from '@systems/lineage';
import { parseEvent } from '@systems/meta-parse';
import { decodeRunSave, migrateRunSave } from '@systems/save-codec';
import { resumeRun } from '@systems/run-save';
import { pendingRunSave } from '@systems/save-write';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { run1Map } from '../map/run1-fixture';
import { withResidentsBuilt, withResidents, armShipSlices, NO_RESIDENTS } from '../support/residents';
import { stubStorage, pageOpen, storedSave, toDesk } from '../save/save-fixture';
import {
  RUN_SAVE_VERSION, RUN_SAVE_KEY, META_STORAGE_KEY, MAX_LINE_CHARS, WALL_MIN_BLOCKS, RESIDENT_RACK_A_MIN_FREE, RESIDENT_GHOST,
  ARM_GHOST_BY_BAND, RESIDENT_START_INTEGRITY, TERMINAL_TYPE_CPS, HOLLOW_TYPE_CPS, DELETE_SEC, NOTABLE_EVENTS_MAX,
} from '@data/tuning';

const throws = (run: () => unknown): boolean => { try { run(); return false; } catch { return true; } };
const BUILT_AT_LOAD = { ...RESIDENT_BUILT };

// --- What this build plays (plan §5: one check per kind, so each track raises only its own line) ---------------------------
// CORRUPTED: Track WARDEN raises it (`=== true`, `built: corrupted residents (Track WARDEN)`).
check('built: corrupted residents not yet', RESIDENT_BUILT.corrupted === false);
// LEFT: Track KIN raises it, last (`=== true`, `built: departed residents (Track KIN)`).
check('built: departed residents not yet', RESIDENT_BUILT.left === false);
// SLEEPING: Track KIN raises it, first (`=== true`, `built: the sleeper (Track KIN)`).
check('built: the sleeper not yet', RESIDENT_BUILT.sleeping === false);
// (end of the built checks)

// --- ShipDef.resident from the reservations ------------------------------------------------------------------------------
const SEED = 7;
const map7 = run1Map(SEED);
{
  const table = map7.arm.flatMap((ship) => {
    const def = shipDefAt(map7, ship.slot).resident;
    return def === null ? [] : [`${ship.slot} ${ship.name} ${def.kind}/${def.shown} ${def.name}${def.fragments > 0 ? ` f${def.fragments}` : ''}`];
  });
  const want = [
    '1 PETREL left/unknown STEWARD', '4 HERON left/unknown HELM f1', '7 CURLEW sleeping/unknown BARNABY',
    '9 GANNET corrupted/faulty WARDEN', '10 PLOVER left/unknown BOSUN f1', '12 SKYLARK left/unknown PURSER f1',
    '15 CORMORANT left/unknown LOOKOUT', '16 PROVIDENCE corrupted/unknown PILOT',
  ];
  check('ShipDef.resident is the map\'s reservation (run 1, seed 7: plan §1.2\'s table, the fragments on the notes)', isDeepStrictEqual(table, want), table.join(' | '));
  check('…none on the first or the final ship, nor on the classic five', shipDefAt(map7, 0).resident === null && shipDefAt(map7, 19).resident === null
    && CLASSIC_FIVE.every((ship) => ship.resident === null));
  check('receiverClosed stays false on every slot (R10: no closed receiver spoils a sleeper or a surprise on the map)',
    map7.arm.every((ship) => !receiverClosed(map7, ship.slot)));
}

// --- The rack-A files per kind (R15–R16) ------------------------------------------------------------------------------------
const FILE_TYPES = ['resident', 'sleeper', 'sleep-lock', 'note', 'leftover'];
const rackAOf = (memory: readonly Segment[]): Segment[] => {
  const out: Segment[] = [];
  let addr = 0;
  for (const seg of memory) {
    if (addr >= 64) break;
    out.push(seg);
    addr += seg.size;
  }
  return out;
};
const look = (segs: readonly Segment[]): string => segs.map((seg) => `${seg.type}:${seg.name}:${seg.size}`).join(' ');
{
  const plain = withResidents(NO_RESIDENTS, () => armShipSlices(SEED, 9).slices);
  check('a kind not built is no resident: GANNET\'s rack A is RACK_A, its slice holds nothing', look(rackAOf(plain.memory)) === look(rackAOf(armShipSlices(SEED, 2).slices.memory))
    && !plain.memory.some((seg) => FILE_TYPES.includes(seg.type)) && isDeepStrictEqual(plain.resident, createResidentState(null)));
  check('builtResident: the map\'s roll when its kind is built, else null', withResidents(NO_RESIDENTS, () => builtResident(shipDefAt(map7, 9).resident)) === null
    && withResidentsBuilt(['corrupted'], () => builtResident(shipDefAt(map7, 9).resident)?.name === 'WARDEN')
    && withResidents({ ...NO_RESIDENTS, left: true, sleeping: true }, () => builtResident(shipDefAt(map7, 9).resident) === null));
  const cargoEnd = RACK_A.slice(0, -1).reduce((sum, item) => sum + ('free' in item ? item.free : item.size), 0);
  for (const [slot, kind, files] of [
    [9, 'corrupted', 'resident:WARDEN.sys:10'], [16, 'corrupted', 'resident:PILOT.sys:10'],
    [7, 'sleeping', 'sleeper:BARNABY.sys:12 sleep-lock:sleep.lock:1'], [4, 'left', 'note:farewell.txt:1 leftover'],
    [15, 'left', 'note:farewell.txt:1 leftover'],
  ] as const) {
    const built = withResidentsBuilt([kind], () => armShipSlices(SEED, slot));
    const again = withResidentsBuilt([kind], () => armShipSlices(SEED, slot).slices);
    const rack = rackAOf(built.slices.memory);
    const at = rack.findIndex((seg) => isResidentFile(seg));
    const mine = rack.filter((seg) => isResidentFile(seg)) as ResidentFileSegment[];
    const tail = rack.at(-1)!;
    const before = rack.slice(0, at).reduce((sum, seg) => sum + seg.size, 0);
    const name = shipDefAt(map7, slot).name;
    check(`${name} (${kind}): its files right after Cargo Ctrl (${look(mine)}), a free run of ${tail.size} ≥ ${WALL_MIN_BLOCKS} behind them`,
      look(mine).startsWith(files) && before === cargoEnd && tail.type === 'free' && tail.size >= WALL_MIN_BLOCKS
      && mine.reduce((sum, seg) => sum + seg.size, 0) + tail.size === RACK_A.reduce((sum, item) => sum + ('free' in item ? item.free : 0), 0)
      && !throws(() => assertMemoryInvariants(built.slices.memory, layoutOf(built.slices).totalBlocks)));
    const slice = built.slices.resident;
    check(`…its slice: the def and only its kind's machine; the same files on every build (the ship's own stream)`,
      slice.def?.name === shipDefAt(map7, slot).resident?.name && (slice.corrupted !== null) === (kind === 'corrupted')
      && (slice.sleeper !== null) === (kind === 'sleeping') && (slice.left !== null) === (kind === 'left')
      && isDeepStrictEqual(rackAOf(again.memory).filter(isResidentFile), mine) && mine.every((seg) => !seg.scanned && seg.owner === slice.def?.name));
  }
  const gannet = withResidentsBuilt(['corrupted'], () => armShipSlices(SEED, 9).slices);
  const providence = withResidentsBuilt(['corrupted'], () => armShipSlices(SEED, 16).slices);
  const warden = gannet.memory.find((seg) => seg.type === 'resident');
  const pilot = providence.memory.find((seg) => seg.type === 'resident');
  check('WARDEN.sys at 40%, hidden, `Reported faulty.`; the surprise\'s PILOT.sys says nothing reported, its machine a surprise',
    warden?.type === 'resident' && warden.integrity === RESIDENT_START_INTEGRITY && warden.desc === RESIDENT_TEXT.desc.faulty
    && pilot?.type === 'resident' && pilot.desc === RESIDENT_TEXT.desc.surprise && providence.resident.corrupted?.surprise === true
    && gannet.resident.corrupted?.surprise === false && isDeepStrictEqual(gannet.resident.corrupted, createCorruptedState(false)));
  const heron = withResidentsBuilt(['left'], () => armShipSlices(SEED, 4).slices);
  const note = heron.memory.find((seg) => seg.type === 'note');
  const leftovers = heron.memory.filter((seg) => seg.type === 'leftover');
  check('HERON\'s note carries its fragment on an outward note; three leftovers of 2–4 blocks, their cards not rolled yet (KIN\'s boot)',
    note?.type === 'note' && note.fragment && note.tone === 'outward' && note.text >= 0 && note.text < KIN_TEXT.notes.outward.length
    && leftovers.length === 3 && leftovers.every((seg) => seg.type === 'leftover' && seg.size >= 2 && seg.size <= 4 && seg.card === null && seg.integrity === 100));
  const curlew = withResidentsBuilt(['sleeping'], () => armShipSlices(SEED, 7).slices);
  check('CURLEW\'s sleeper asleep beside its lock; its slice asleep', curlew.memory.some((seg) => seg.type === 'sleeper' && !seg.awake && seg.part === 'mind')
    && isDeepStrictEqual(curlew.resident.sleeper, createSleeperState()));
  check('every kind fits RESIDENT_RACK_A_MIN_FREE, and a fragment on anyone but a departed resident throws',
    Object.values(RESIDENT_KIND_MAX_BLOCKS).every((blocks) => blocks <= RESIDENT_RACK_A_MIN_FREE)
    && throws(() => residentRackA({ kind: 'sleeping', shown: 'unknown', name: 'MOTH', fragments: 1 }, () => 0.5)));
  const all = [...gannet.memory, ...heron.memory, ...curlew.memory].filter(isResidentFile);
  check('leftovers are food; WARDEN.sys, the sleeper, its lock and the note are not (R15). WARDEN.sys and leftovers have a health',
    all.every((seg) => isInfectable(seg) === (seg.type === 'leftover') && hasIntegrity(seg) === (seg.type === 'resident' || seg.type === 'leftover')));
  check('…the sidebar files them as SHIP, and INSPECT has a type line for each', all.every((seg) => categoryOf(seg) === 'ship')
    && FILE_TYPES.every((type) => TYPE_LABELS[type as Segment['type']] !== undefined));
  // The tools (plan §2.4): the stubs refuse every tool; WARDEN's DELETE is cut out block by block, every other file's is DELETE_SEC.
  const state = { ...createInitialState({ seed: 3 }), memory: gannet.memory } as GameState;
  const tools: FsToolKind[] = ['scan', 'repair', 'delete', 'move', 'copy', 'swap'];
  const lock = curlew.memory.find((seg) => seg.type === 'sleep-lock')!;
  // The dispatch, not the answer (the stubs refuse NOTHING TO DO THERE; the tracks' rules say their own): a kind's refusal is
  // the tool's, and DELETE's question is the kind's.
  check('every tool on a resident file asks its kind\'s rule first (its refusal is the tool\'s); DELETE asks its kind\'s question',
    all.every((seg) => tools.every((tool) => {
      const ctx = { state, activeKind: tool, pickedSource: null };
      const own = residentToolRule(seg, ctx);
      return own === null || targetRefusal(seg, ctx) === own;
    }) && isDeepStrictEqual(deleteQuestion(state, seg), residentDeleteQuestion(state, seg))));
  check('…DELETE takes 6.0 s on WARDEN.sys (1.0 + 0.5 × 10), DELETE_SEC on sleep.lock', deleteSec(warden!) === 6 && deleteSec(lock) === DELETE_SEC);
}

// --- The ghost composite (R3, R5) ----------------------------------------------------------------------------------------------
{
  const healthy = createInitialState({ seed: 3 });
  const hurt = structuredClone(healthy) as GameState;
  const thrust = hurt.memory.find((seg) => seg.role === 'thrust-ctrl');
  if (thrust?.type === 'ship') thrust.integrity = 30;
  const calm = capabilitiesNow(healthy).thrustCtrl;
  const firing = capabilitiesNow(hurt).thrustCtrl;
  check('ghostBy: null with a healthy controller, \'controller\' for a failing one (no resident fires: its spec stub is null)',
    calm.ghost === null && calm.ghostBy === null && firing.ghost !== null && firing.ghostBy === 'controller' && residentGhostSpec(hurt) === null);
  const ratio = ghostPush(RESIDENT_GHOST) / ghostPush(ARM_GHOST_BY_BAND.failing!);
  check(`the resident's push is ${(ratio * 100).toFixed(0)}% of the arm's failing controller's (R3: under it, 04's "about two thirds")`,
    ratio < 1 && Math.abs(ratio - 0.714) < 0.01, ratio.toFixed(3));
  check('…ghostWithoutSwap reads only a controller\'s bursts (the classic world: never)', !ghostWithoutSwap(hurt));
}

// --- The landing: POD LOCKED (R7) ------------------------------------------------------------------------------------------------
{
  const base = createInitialState({ seed: 3 });
  const landing = structuredClone(base) as GameState;
  landing.run.phase = 'landing';
  landing.landing.bay.loaded = 4;
  const sol = {
    asOfTSec: 0, periodSec: 14000, block: null, arc: [], windows: [], uncertain: false, validUntilTSec: null,
    dot: { rad: 0, halfWidthKm: 78, launchRadius: 6000, inBand: true, uncertain: false },
  } as DropSolution;
  const kid = { source: 'player', fromMind: false } as const;
  const lockPods = (pods: readonly number[]): GameState => {
    const state = structuredClone(landing) as GameState;
    for (const seg of state.memory) if (seg.type === 'driver' && pods.includes(seg.pod)) seg.lockedBy = 'WARDEN';
    return state;
  };
  const one = lockPods([2]);
  const locked = one.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.pod === 2)!;
  check('a locked driver is not launchable, but can still launch some day (the auto-end waits for a DELETE, a cure or an ACCEPT)',
    !isLaunchable(locked) && driverCanEverLaunch(one, locked) && driversThatCanEverLaunch(one).some((driver) => driver.pod === 2)
    && lockedDrivers(one).map((driver) => driver.pod).join() === '2' && lockedDrivers(landing).length === 0);
  check('…the queue and AUTODROP\'s view leave it out', launchQueue(one).map((driver) => driver.pod).join() === '1,3'
    && landingView(one, sol, 2).queue.join() === '1,3');
  check('[L] on it says POD LOCKED; with every pod locked, [L] says POD LOCKED (not NO POD READY); none locked, it launches',
    launchRefusal(one, sol, kid, 2) === 'POD LOCKED' && launchRefusal(one, sol, kid) === null
    && launchRefusal(lockPods([1, 2, 3]), sol, kid) === 'POD LOCKED' && launchRefusal(landing, sol, kid) === null,
    `${launchRefusal(one, sol, kid, 2)} ${launchRefusal(one, sol, kid)} ${launchRefusal(lockPods([1, 2, 3]), sol, kid)} ${launchRefusal(landing, sol, kid)}`);
}

// --- One deal per ship (R8), the TERMINAL (R23) ------------------------------------------------------------------------------
{
  const state = createInitialState({ seed: 3 });
  const def: ShipResidentDef = { kind: 'corrupted', shown: 'faulty', name: 'WARDEN', fragments: 0 };
  const withDeal = (phase: 'none' | 'offered' | 'done'): GameState => {
    const resident = createResidentState(def);
    resident.corrupted!.deal.phase = phase;
    return { ...state, resident };
  };
  check('residentDealOnThisShip: false with no resident or no offer; true once the resident\'s DEAL was offered here (standing or done)',
    !residentDealOnThisShip(state) && !residentDealOnThisShip(withDeal('none')) && residentDealOnThisShip(withDeal('offered'))
    && residentDealOnThisShip(withDeal('done')));
  const store = createStore<GameState>(createInitialState({ seed: 3 }));
  const off = mountSay(store);
  let picked: string | null | undefined;
  const id = sayChoice('sleeper', 'would you like some help?', ['RUN THE DROPS', 'MEND DRIVERS'], null, (option) => { picked = option; });
  const entry = openChoiceEntry(store.getState());
  check('a TERMINAL choice with no timer: it stands, its timer never runs; it can be withdrawn (R23\'s rule), its handler unheard',
    entry?.id === id && entry.choice?.timeoutAiSec === null && !choiceTimerRunning(store.getState(), entry) && withdrawChoice(id)
    && openChoiceEntry(store.getState()) === null && picked === undefined);
  off();
  check('the residents speak in the TERMINAL: the resident at its pace, the sleeper slow and soft; the ticker tags both SHIP AI',
    CHANNEL_OF.resident === 'mind' && CHANNEL_OF.sleeper === 'mind' && lineTypeCps('resident') === TERMINAL_TYPE_CPS
    && lineTypeCps('sleeper') === HOLLOW_TYPE_CPS && speakerTag('resident', {} as never) === 'SHIP AI' && speakerTag('sleeper', {} as never) === 'SHIP AI');
}

// --- Notable events (R27) --------------------------------------------------------------------------------------------------------
{
  const result = (slot: number, depth: number, landedInLz: number, outcome: ShipResult['outcome'] = 'locked'): ShipResult => (
    { slot, depth, shipName: map7.arm[slot]!.name, shipId: map7.arm[slot]!.id, outcome, landedInLz } as ShipResult);
  const met = (slot: number, depth: number, fate: ResidentRecord['fate']): ResidentRecord => {
    const placed = map7.arm[slot]!.reserved.resident!;
    return { slot, depth, kind: placed.kind, name: placed.name, shown: placed.shown, fate, job: null, podsParkedLocked: 0, leftoversEaten: 0 };
  };
  const ships = [result(0, 1, 600), result(1, 2, 400), result(4, 3, 0, 'crashed'), result(7, 4, 800), result(9, 5, 200)];
  const residents = { met: [met(1, 2, 'left'), met(7, 4, 'woken'), met(9, 5, 'deleted')], signals: [] };
  const stats = { ...createInitialState({ seed: 3 }).run.stats, deal: { outcome: 'accepted' as const, pod: 2, shipId: map7.arm[1]!.id } };
  const events = notableEvents({ map: map7, ships, stats, residents }).map((event) => `${event.kind}:${event.shipName}:${event.value}`);
  check(`notable events: the DEAL, then each resident woken, deleted or cured in route order (value: its depth), then the best colony (at most ${NOTABLE_EVENTS_MAX})`,
    isDeepStrictEqual(events, ['deal-accepted:PETREL:2', 'sleeper-woken:CURLEW:4', 'resident-deleted:GANNET:5', 'best-colony:CURLEW:800']),
    events.join(' '));
  check('…a departed one, a paid or ignored one and a sleeper left asleep are not notable; the archive reads the new kinds',
    notableEvents({ map: map7, ships, stats: createInitialState({ seed: 3 }).run.stats, residents: { met: [met(1, 2, 'left'), met(9, 5, 'paid')], signals: [] } })
      .every((event) => event.kind === 'best-colony' || event.kind === 'ship-lost')
    && ['resident-deleted', 'resident-cured', 'sleeper-woken'].every((kind) => parseEvent({ kind, slot: 9, shipName: 'GANNET', value: 5 }, 'e').kind === kind));
}

// --- The save: the v4 fixtures, the CORMORANT BEAM, the codec's v5 refusals ------------------------------------------------------
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'save', 'fixtures');
const fixture = (file: string): { save: Record<string, unknown>; meta: unknown } => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));

function resumeFixture(file: string): ReturnType<typeof createStore<GameState>> & { storage: ReturnType<typeof stubStorage> } {
  const { save, meta } = fixture(file);
  const storage = stubStorage({ [RUN_SAVE_KEY]: JSON.stringify(save), [META_STORAGE_KEY]: JSON.stringify(meta) });
  const store = createStore<GameState>(createInitialState({ seed: 1 }));
  pageOpen(store, storage, 1);
  if (store.getState().save.status !== 'ok' || pendingRunSave() === null) throw new Error(`resumeFixture: ${file} is not offered (${JSON.stringify(store.getState().save)})`);
  resumeRun(store);
  return Object.assign(store, { storage });
}

// Resumed as a v4 save's world was: no kind built (with `left` built, CORMORANT's resumed boot has LOOKOUT: below).
withResidents(NO_RESIDENTS, () => {
for (const [file, point] of [['run-save-v4-ship-done-desk3.json', 'ship-done'], ['run-save-v4-beam-cormorant.json', 'beam']] as const) {
  const { save } = fixture(file);
  const migrated = migrateRunSave(save) as { saveVersion: number; payload: { run: GameState['run']; slices?: { resident: ResidentState } } };
  const decoded = decodeRunSave(JSON.stringify(save));
  check(`${file}: a v4 ${point} save migrates to v${RUN_SAVE_VERSION} and decodes`, save.saveVersion === 4 && migrated.saveVersion === RUN_SAVE_VERSION
    && decoded.ok, decoded.ok ? '' : `${decoded.refusal.kind}: ${decoded.refusal.detail}`);
  check('…no resident met, no signal; a world payload\'s resident slice holds none', isDeepStrictEqual(migrated.payload.run.residents, createRunResidents())
    && (migrated.payload.slices === undefined || isDeepStrictEqual(migrated.payload.slices.resident, createResidentState(null))));
  const store = resumeFixture(file);
  check(`…and resumes (${point === 'beam' ? 'CORMORANT\'s boot' : 'the desk'}), nothing of a resident in its memory`,
    store.getState().run.phase === (point === 'beam' ? 'boot' : 'desk') && !store.getState().memory.some(isResidentFile)
    && store.getState().resident.def === null);
}
});

// The CORMORANT BEAM with departed residents built: LOOKOUT's files in rack A as a fresh boot of the same ship builds them, the
// boot's amber line, then its SHIP DONE: LOOKOUT recorded, the slice at rest, and the save decodes.
withResidentsBuilt(['left'], () => {
  const { save } = fixture('run-save-v4-beam-cormorant.json');
  const payload = (migrateRunSave(save) as { payload: { run: GameState['run']; carried: Parameters<typeof createShipSlices>[1]; threat: Parameters<typeof createShipSlices>[2] } }).payload;
  const fresh = createShipSlices(payload.run, payload.carried, payload.threat);
  const store = resumeFixture('run-save-v4-beam-cormorant.json');
  const state = store.getState();
  const files = (memory: readonly Segment[]): string => JSON.stringify(rackAOf(memory).map((seg) => (seg.type === 'free' ? { free: seg.size } : seg)));
  check('the CORMORANT BEAM resumes with LOOKOUT\'s note and three leftovers in rack A, exactly as a fresh boot builds them',
    state.resident.def?.name === 'LOOKOUT' && state.resident.left?.noteRead === false && files(state.memory) === files(fresh.memory)
    && rackAOf(state.memory).filter(isResidentFile).length === 4, look(rackAOf(state.memory)));
  check('…the map lines say RECEIVER CLOSED on its ship', mapBootLines(state).includes('receiver-closed'));
  const plan = bootLinePlan(state, 0);
  const at = plan.indexOf('receiver-closed');
  // CORMORANT is run 1's forced boarding (HOLLOW's 108% unpack, 'board', stands in for the unpack).
  check('…its boot types `> RECEIVER CLOSED · this ship launched with its own AI` right after the sleep line, before the unpack, in amber',
    at === plan.indexOf('sleep') + 1 && (plan[at + 1] === 'unpack' || plan[at + 1] === 'board') && bootLine('receiver-closed', state, {} as never) === RESIDENT_TEXT.receiverClosed
    && bootLineTone('receiver-closed') === 'resident' && bootLineTone('unpack') === null, plan.join(' '));
  toDesk(store);
  const done = storedSave(store.storage);
  const met = store.getState().run.residents.met;
  check('…its SHIP DONE records LOOKOUT (depth 5, left), and the save decodes with the slice at rest', done.save.point === 'ship-done'
    && met.length === 1 && met[0]!.name === 'LOOKOUT' && met[0]!.slot === 15 && met[0]!.depth === 5 && met[0]!.fate === 'left' && met[0]!.kind === 'left',
    JSON.stringify(met));

  // The codec's v5 refusals, each against that SHIP DONE save (which decodes).
  type Raw = { payload: { run: GameState['run']; slices: { resident: ResidentState } } };
  const edit = (change: (raw: Raw) => void): string => {
    const raw = JSON.parse(done.raw) as Raw;
    change(raw);
    return JSON.stringify(raw);
  };
  const kind = (raw: string): string => {
    const result = decodeRunSave(raw);
    return result.ok ? 'ok' : `${result.refusal.kind}: ${result.refusal.detail}`;
  };
  const corrupted = (change: (resident: ResidentState) => void) => (raw: Raw): void => {
    const resident = createResidentState({ kind: 'corrupted', shown: 'faulty', name: 'WARDEN', fragments: 0 });
    change(resident);
    raw.payload.slices.resident = resident;
  };
  const sleeping = (phase: 'asleep' | 'offering' | 'working') => (raw: Raw): void => {
    const resident = createResidentState({ kind: 'sleeping', shown: 'unknown', name: 'MOTH', fragments: 0 });
    resident.sleeper!.phase = phase;
    raw.payload.slices.resident = resident;
  };
  const cases: [string, string, boolean][] = [
    ['the save as written', done.raw, true],
    ['a corrupted resident at rest', edit(corrupted(() => {})), true],
    ['…a lock counting down', edit(corrupted((resident) => { resident.corrupted!.lock = { pod: 7, segId: 'driver_pod07', leftSec: 2, totalSec: 3, entryId: 9 }; })), false],
    ['…its DEAL standing open', edit(corrupted((resident) => { resident.corrupted!.deal.phase = 'offered'; })), false],
    ['…its DEAL settled', edit(corrupted((resident) => { resident.corrupted!.deal = { phase: 'done', fileId: 'x', fileName: 'Swap', entryId: 9, outcome: 'refused' }; })), true],
    ['a sleeper working', edit(sleeping('working')), true],
    ['…offering', edit(sleeping('offering')), false],
    ['a machine of another kind (a departed def with a sleeper)', edit((raw) => { raw.payload.slices.resident.sleeper = createSleeperState(); }), false],
    ['an unknown field', edit((raw) => { (raw.payload.slices.resident as unknown as Record<string, unknown>).extra = 1; }), false],
    ['a met resident off the route (depth 4)', edit((raw) => { raw.payload.run.residents.met[0]!.depth = 4; }), false],
    ['…met twice', edit((raw) => { raw.payload.run.residents.met.push(structuredClone(raw.payload.run.residents.met[0]!)); }), false],
    ['…not the one the map placed there', edit((raw) => { raw.payload.run.residents.met[0]!.name = 'WARDEN'; }), false],
    ['a signal on a note that carries none', edit((raw) => { raw.payload.run.residents.signals.push({ slot: 15, depth: 5 }); }), false],
    ['…one on a note that carries one', edit((raw) => {
      raw.payload.run.map.arm[15]!.reserved.fragments = 1;
      raw.payload.run.residents.signals.push({ slot: 15, depth: 5 });
    }), true],
    ['…two', edit((raw) => {
      raw.payload.run.map.arm[15]!.reserved.fragments = 1;
      raw.payload.run.residents.signals.push({ slot: 15, depth: 5 }, { slot: 15, depth: 5 });
    }), false],
    ['…a signal off the route', edit((raw) => {
      raw.payload.run.map.arm[15]!.reserved.fragments = 1;
      raw.payload.run.residents.signals.push({ slot: 15, depth: 4 });
    }), false],
  ];
  const wrong = cases.filter(([, raw, ok]) => (kind(raw) === 'ok') !== ok);
  check('the codec reads the residents at rest: open locks, standing DEALs, an offering sleeper, a wrong machine, a met resident off the route or not the map\'s, and too many signals are refused',
    wrong.length === 0, wrong.map(([name, raw]) => `${name} → ${kind(raw)}`).join(' | '));
});
check('…withResidentsBuilt puts the flags back', isDeepStrictEqual(RESIDENT_BUILT, BUILT_AT_LOAD));

// --- Words (every FOUNDATION line ≤ MAX_LINE_CHARS at its worst case: the longest pool name, 7 letters) -------------------------
{
  const NAME = 'STEWARD';
  const lines = [
    RESIDENT_TEXT.receiverClosed, ...Object.values(RESIDENT_TEXT.desc), ...Object.values(RESIDENT_TEXT.typeLabel),
    ...Object.values(RESIDENT_REFUSAL), pinnedRefusal(NAME), WARDEN_TEXT.wake(NAME), WARDEN_TEXT.surprise(NAME),
    ...KIN_TEXT.notes.relay.flat(), ...KIN_TEXT.notes.outward.flat(), LAUNCH_REFUSAL_TEXT['POD LOCKED'],
    `${RESIDENT_TEXT.file.resident(NAME)} · ${RESIDENT_TEXT.desc.faulty}`, `${RESIDENT_TEXT.file.leftover} · ${RESIDENT_TEXT.desc.leftover}`,
  ];
  check(`the foundation's new lines are ≤ ${MAX_LINE_CHARS} characters`, lines.every((line) => line.length <= MAX_LINE_CHARS),
    lines.filter((line) => line.length > MAX_LINE_CHARS).join(' | '));
  check('RECEIVER CLOSED is 04 §3.15\'s line', RESIDENT_TEXT.receiverClosed === '> RECEIVER CLOSED · this ship launched with its own AI');
}

finish();
