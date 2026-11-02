import type { GameState, RunState } from '@state/schema';
import type { ShipSlices } from '@state/initial';
import type { ContentVersions } from '@/types/lineage';
import type {
  RunSave, SavePoint, SavePayload, ResumeLine, BootParts, DecodeResult, SaveRefusal, SaveRefusalKind,
} from '@/types/save';
import type { Meta, RunLineage } from '@systems/meta';
import { parseLastUnit, MetaCorrupt } from '@systems/meta-parse';
import { createRunState, createInitialState } from '@state/initial';
import { createRunLog } from '@state/log-selectors';
import { createRunThreat, nominalShipThreat } from '@systems/threat-plan';
import { createRunMap } from '@systems/map-run';
import {
  ShapeError, shapeFail, rec, list, whole, int, num, str, name, bool, isNull, anyRecord, nullable, oneOf, likeReference,
  finiteNumbers, checkArmShip, checkHistory, type Check,
} from '@systems/save-shape';
import { ARM_CONTENT_VERSION } from '@data/arm';
import { MAP_GENERATOR_VERSION } from '@systems/map-generator';
import { MAP_UPDATE_VERSION } from '@systems/map-update';
import { MAP_STATE_VERSION } from '@data/map-state';
import { REPO_CATALOGUE_VERSION } from '@data/repository';
import { shipDefOf, validateShipDef } from '@data/ships';
import { shipSummaryAt } from '@systems/map-run';
import { currentSlot } from '@systems/map-streams';
import { RUN_SAVE_VERSION, FIRST_UNIT_NUMBER } from '@data/tuning';
import { withScratchSegIds } from '@systems/memory-ops';

// The run save's codec and checks (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.1), pure: what a save holds at
// each point (savePayloadAt, buildRunSave), its JSON (encodeRunSave, decodeRunSave) and why a stored one can't be resumed
// (decodeRunSave's checks 1–7 in order, then saveRefusal's against the archive). No store, no storage: the live half is
// systems/save-write.ts, resume and abandon systems/run-save.ts.
// Cycle guard (plan §5.4; slice 3c foundation deviation): a leaf below run.ts, so run.ts's save points can call
// save-write.ts (which encodes through this file) while run-save.ts imports run.ts.
// Track SAVE owns it (the foundation laid the envelope down; the saved run's field checks, the cross-checks and the
// non-finite rule are SAVE's).

export const SAVE_POINTS: readonly SavePoint[] = ['run-start', 'ship-done', 'beam', 'ending-chosen'];

// Every content version the save checks (3c plan §4.4): the code's, now.
export function contentVersions(): ContentVersions {
  return {
    arm: ARM_CONTENT_VERSION, generator: MAP_GENERATOR_VERSION, update: MAP_UPDATE_VERSION, mapState: MAP_STATE_VERSION,
    catalogue: REPO_CATALOGUE_VERSION,
  };
}

// --- What a save holds -------------------------------------------------------------------------------------------------

// The phase a point is written in (3c plan §2.1's table): the boot points right as the boot begins, SHIP DONE at the desk,
// ENDING CHOSEN on the final ship's LANDING REPORT.
const POINT_PHASE: Readonly<Record<SavePoint, RunState['phase']>> = {
  'run-start': 'boot', 'beam': 'boot', 'ship-done': 'desk', 'ending-chosen': 'report',
};

function shipSlicesOf(state: Readonly<GameState>): ShipSlices {
  return structuredClone({
    mission: state.mission, memory: state.memory, clock: state.clock, burn: state.burn, orbit: state.orbit, level: state.level,
    landing: state.landing, hollow: state.hollow, hazards: state.hazards,
  }) as ShipSlices;
}

// The payload at `point` (3c plan §2.1): a boot point keeps the run and the boot's parts (the ship is re-derived from them),
// a world point the run and the ship's slices. Throws when the state is not at that point (a save point called from the
// wrong moment is a bug) or a boot point comes without its parts.
export function savePayloadAt(state: Readonly<GameState>, point: SavePoint, boot: Readonly<BootParts> | null): SavePayload {
  const phase = POINT_PHASE[point];
  if (state.run.phase !== phase) throw new Error(`savePayloadAt(${point}): the run is in '${state.run.phase}', not '${phase}'`);
  const run = structuredClone(state.run) as RunState;
  if (point === 'run-start' || point === 'beam') {
    if (boot === null) throw new Error(`savePayloadAt(${point}): a boot point needs the boot's racks and verdict`);
    const depth = state.run.map.route.length;
    if (point === 'run-start' ? depth !== 1 : depth < 2) throw new Error(`savePayloadAt(${point}): the route has ${depth} stop(s)`);
    return { kind: 'boot', run, carried: structuredClone(boot.carried), threat: structuredClone(boot.threat) };
  }
  if (boot !== null) throw new Error(`savePayloadAt(${point}): a world point takes no boot parts`);
  return { kind: 'world', phase: point === 'ship-done' ? 'desk' : 'report', run, slices: shipSlicesOf(state) };
}

// The title's RESUME line for a save written now at `point`.
export function resumeLineOf(state: Readonly<GameState>, point: SavePoint): ResumeLine {
  const map = state.run.map;
  return {
    unit: state.run.unitNumber, depth: state.run.shipIndex + 1, ship: shipSummaryAt(map, currentSlot(state.run)).name,
    year: map.galaxyYear, point,
  };
}

// The whole save written at `point`. `archiveRuns`: the archive's runs now (the stale rule); `writtenAt`: Date.now().
export function buildRunSave(
  state: Readonly<GameState>, point: SavePoint, archiveRuns: number, boot: Readonly<BootParts> | null, writtenAt: number,
): RunSave {
  return {
    saveVersion: RUN_SAVE_VERSION, mode: 'standard', content: contentVersions(), writtenAt: Math.floor(writtenAt),
    unit: state.run.unitNumber, run: state.run.map.run, archiveRuns, point, resume: resumeLineOf(state, point),
    payload: savePayloadAt(state, point, boot), log: structuredClone(state.log), done: [...state.director.done],
  };
}

// --- JSON ----------------------------------------------------------------------------------------------------------------

// The one non-JSON number the state holds: a sticky ghost burst's end (BurnState.ghost.endTSec, Infinity until SPACE is
// released). Tagged on the way out and back in; any other non-finite number is a bug and throws on encode.
const INFINITY_KEY = 'endTSec';
const INFINITY_TAG = { $num: 'Infinity' } as const;

function isInfinityTag(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '$num' && (value as Record<string, unknown>).$num === 'Infinity';
}

// The save as JSON. Throws on a classic-world map (never saved: 3a's review note) and on a non-finite number other than a
// sticky burst's end.
export function encodeRunSave(save: Readonly<RunSave>): string {
  if (save.payload.run.map.world !== 'arm') throw new Error(`encodeRunSave: a '${save.payload.run.map.world}' map is never saved`);
  return JSON.stringify(save, (key, value: unknown) => {
    if (typeof value !== 'number' || Number.isFinite(value)) return value;
    if (value === Infinity && key === INFINITY_KEY) return INFINITY_TAG;
    throw new Error(`encodeRunSave: '${key}' is ${String(value)}, which JSON can't keep`);
  });
}

function refuse(kind: SaveRefusalKind, detail: string): DecodeResult {
  return { ok: false, refusal: { kind, detail } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): string | null {
  const have = Object.keys(value);
  const missing = keys.filter((key) => !have.includes(key));
  const extra = have.filter((key) => !keys.includes(key));
  if (missing.length === 0 && extra.length === 0) return null;
  return [missing.length > 0 ? `missing ${missing.join(', ')}` : '', extra.length > 0 ? `unknown ${extra.join(', ')}` : ''].filter(Boolean).join('; ');
}

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const ENVELOPE_KEYS = ['saveVersion', 'mode', 'content', 'writtenAt', 'unit', 'run', 'archiveRuns', 'point', 'resume', 'payload', 'log', 'done'];
const RESUME_KEYS = ['unit', 'depth', 'ship', 'year', 'point'];
const BOOT_KEYS = ['kind', 'run', 'carried', 'threat'];
const WORLD_KEYS = ['kind', 'phase', 'run', 'slices'];
const SLICE_KEYS = ['mission', 'memory', 'clock', 'burn', 'orbit', 'level', 'landing', 'hollow', 'hazards'];

// --- Check 4: the shape, field by field ------------------------------------------------------------------------------

const RUN_PHASES: readonly RunState['phase'][] = ['title', 'boot', 'flight', 'landing', 'report', 'desk', 'transmit', 'end'];

const checkHop = rec({
  from: whole, to: whole, distanceLy: int, linkBlocks: whole, transitHits: whole, eccFixes: whole, leaveYear: int, arriveYear: int,
  approachYear: int, slackYears: int, noise: oneOf(0, 1, 2, 3), inRange: bool, memoryClass: oneOf('FULL', 'COMPACT', 'TIGHT'),
  room: whole, chargeFloor: whole,
});

const checkArmShips: Check = (value, at) => {
  if (!Array.isArray(value)) shapeFail(at, 'is not a list');
  value.forEach((ship, slot) => checkArmShip(ship, `${at}[${slot}]`, slot));
};

const checkMap = rec({
  version: oneOf(MAP_STATE_VERSION),
  world: oneOf('arm', 'classic'),
  run: whole,
  armSeed: whole,
  startYear: whole,
  arm: checkArmShips,
  noise: list(rec({ x: num, y: num, r: num, strength: oneOf(1, 2) })),
  route: list(rec({ slot: whole, depth: whole, hop: nullable(checkHop) })),
  galaxyYear: whole,
  pendingExtra: nullable(rec({ extraHits: whole, coreHit: num, coreReset: bool })),
  history: checkHistory,
});

const checkShipResult = rec({
  shipId: name, shipName: name, slot: whole, depth: whole,
  outcome: oneOf('locked', 'partial', 'stranded', 'escaped', 'crashed', 'abandoned', 'emergency'),
  stars: whole, fuelLeftPct: num, ringMiss: nullable(rec({ apsis: oneOf('▼', '▲'), km: num })),
  colonistsAboard: whole, lzs: list(anyRecord), offSite: whole, noGo: whole, restored: whole,
  parked: list(rec({ pod: whole, why: str })), notLaunched: whole, landedInLz: whole, points: num, colony: nullable(name), pods: list(anyRecord),
});

const checkLastUnit: Check = (value, at) => {
  try {
    parseLastUnit(value);
  } catch (error) {
    if (error instanceof MetaCorrupt) shapeFail(at, `is not a last unit (${error.message})`);
    throw error;
  }
};

// The references likeReference reads (built once, lazily: a fresh run, its threat memory and log, and a fresh arm world's
// slices, from the code's own constructors, so a field a slice adds is in the reference the day it is added). Built on a
// scratch segment counter (review fix, minor 6): the throwaway world's ids are never kept, so reading a save moves no id
// counter, and the reference run takes a literal first-run lineage rather than importing the archive.
let references: { run: RunState; slices: ShipSlices; shipThreat: Readonly<Record<string, unknown>> } | null = null;

const REFERENCE_LINEAGE: Readonly<RunLineage> = {
  unitNumber: FIRST_UNIT_NUMBER, wave: 1, lastUnit: null, hollowUnits: [FIRST_UNIT_NUMBER - 1], tutorialDone: false, armSeed: null,
  arm: null, history: { lastUnitNumber: null, colonies: [], routes: [] },
};

function refs(): NonNullable<typeof references> {
  if (references === null) {
    references = withScratchSegIds(() => {
      const world = createInitialState({ seed: 1, phase: 'title', map: createRunMap({ wave: 1 }, 1) });
      return {
        run: createRunState(1, 'title', 0, REFERENCE_LINEAGE),
        slices: shipSlicesOf(world),
        shipThreat: nominalShipThreat(0) as unknown as Record<string, unknown>,
      };
    });
  }
  return references;
}

// The saved RunState, field by field (every key, exactly: a field a later slice adds bumps RUN_SAVE_VERSION, joins this
// spec, and gets a migration step; slice 4's run.skills is the first). The fields a save point always has empty are
// checked empty: no beam out, no transit, no end cause.
function checkSavedRun(value: unknown, at: string): void {
  rec({
    rev: whole, phase: oneOf(...RUN_PHASES), seed: whole, unitNumber: whole, wave: whole, lastUnit: nullable(checkLastUnit),
    ghostSpoken: bool, hollowUnits: list(whole), upgrades: list(str), tutorial: bool, shipIndex: whole, map: checkMap,
    licences: list(str), hollowNamed: bool, coreLost: bool, skillTrainedOn: nullable(whole), repairRenewedOn: nullable(whole),
    ships: list(checkShipResult),
    stats: rec({
      manualCaptures: whole, demos: list(rec({ offsetTac: num })), repairs: whole, moves: whole, deletes: whole, driversLost: whole,
      driversBitten: whole, capRefusals: whole, deal: nullable(anyRecord),
    }),
    pendingStarCredit: num, pendingStars: whole, simulationRetryUsed: bool, beamOut: isNull, transit: isNull, arrival: nullable(anyRecord),
    endCause: isNull,
    threat: likeReference(createRunThreat() as unknown as Record<string, unknown>),
    log: likeReference(createRunLog() as unknown as Record<string, unknown>),
    repo: rec({
      pick: nullable(str),
      requests: list(rec({
        id: name, file: name, fromSlot: whole, toSlot: whole, requestedYear: int, lateness: int, status: name, at: nullable(whole),
        arrivedYear: nullable(int),
      })),
      nextId: whole,
    }),
    inbox: rec({ read: list(str) }),
    next: nullable(rec({ unit: whole, run: whole, startYear: whole, gap: whole, valveYears: whole })),
  })(value, at);
  // Every key of a fresh run is in the spec above (a field a slice adds fails here first, in the round-trip suite).
  const known = Object.keys(refs().run);
  const have = Object.keys(value as Record<string, unknown>);
  if (known.length !== have.length || known.some((key) => !have.includes(key))) shapeFail(at, 'does not have a fresh run\'s fields');
}

// Memory (the world payload's): a list of segments, each with its id, name, type and size (the layout and every rule
// past that are assertMemoryInvariants', which the resume runs).
const checkMemory: Check = (value, at) => {
  if (!Array.isArray(value)) shapeFail(at, 'is not a list');
  value.forEach((seg, i) => {
    const where = `${at}[${i}]`;
    anyRecord(seg, where);
    const entry = seg as Record<string, unknown>;
    name(entry.id, `${where}.id`);
    str(entry.name, `${where}.name`);
    name(entry.type, `${where}.type`);
    whole(entry.size, `${where}.size`);
  });
};

function checkSlices(value: unknown, at: string): void {
  const reference = refs().slices as unknown as Record<string, Record<string, unknown>>;
  rec({
    mission: likeReference(reference.mission!), memory: checkMemory, clock: likeReference(reference.clock!),
    burn: likeReference(reference.burn!), orbit: likeReference(reference.orbit!), level: likeReference(reference.level!),
    landing: likeReference(reference.landing!), hollow: likeReference(reference.hollow!), hazards: likeReference(reference.hazards!),
  })(value, at);
}

// Check 4 (the envelope's keys and types, strict, like parseMeta; then the saved run and the payload field by field, every
// number finite but a sticky burst's end, and the envelope's copies of the unit, the run and the resume line against the
// run they describe). Returns what is wrong, or null.
function checkShape(data: Record<string, unknown>): string | null {
  const envelope = sameKeys(data, ENVELOPE_KEYS);
  if (envelope !== null) return `the save: ${envelope}`;
  if (data.mode !== 'standard') return `mode '${String(data.mode)}' is unknown`;
  if (typeof data.writtenAt !== 'number' || !Number.isFinite(data.writtenAt)) return 'writtenAt is not a time';
  for (const field of ['unit', 'run', 'archiveRuns'] as const) if (!isWhole(data[field])) return `${field} is not a whole number`;
  if (!(SAVE_POINTS as readonly unknown[]).includes(data.point)) return `point '${String(data.point)}' is unknown`;
  const resume = data.resume;
  if (!isRecord(resume)) return 'resume is not a record';
  const resumeKeys = sameKeys(resume, RESUME_KEYS);
  if (resumeKeys !== null) return `resume: ${resumeKeys}`;
  if (!isWhole(resume.unit) || !isWhole(resume.depth) || !isWhole(resume.year) || typeof resume.ship !== 'string' || resume.point !== data.point) {
    return 'resume does not name a unit, a depth, a ship, a year and this point';
  }
  const log = data.log;
  if (!isRecord(log) || !Array.isArray(log.entries) || !isWhole(log.rev) || sameKeys(log, ['entries', 'rev']) !== null) return 'log is not a log';
  if (!Array.isArray(data.done) || data.done.some((id) => typeof id !== 'string')) return 'done is not a list of ids';
  const payload = data.payload;
  if (!isRecord(payload)) return 'payload is not a record';
  if (payload.kind === 'boot') {
    const keys = sameKeys(payload, BOOT_KEYS);
    if (keys !== null) return `payload: ${keys}`;
    if (!isRecord(payload.threat)) return 'payload.threat is not a verdict';
    if (payload.carried !== null && !isRecord(payload.carried)) return 'payload.carried is not racks';
  } else if (payload.kind === 'world') {
    const keys = sameKeys(payload, WORLD_KEYS);
    if (keys !== null) return `payload: ${keys}`;
    if (payload.phase !== 'desk' && payload.phase !== 'report') return `payload.phase '${String(payload.phase)}' is unknown`;
    if (!isRecord(payload.slices)) return 'payload.slices is not a record';
    const slices = sameKeys(payload.slices, SLICE_KEYS);
    if (slices !== null) return `payload.slices: ${slices}`;
  } else {
    return `payload.kind '${String(payload.kind)}' is unknown`;
  }
  const run = payload.run;
  if (!isRecord(run) || !isRecord(run.map) || !Array.isArray(run.map.route) || !Array.isArray(run.map.arm) || !isWhole(run.shipIndex)) {
    return 'payload.run is not a run with a map';
  }
  if (run.map.version !== MAP_STATE_VERSION) return `payload.run.map is version ${String(run.map.version)}, not ${MAP_STATE_VERSION}`;
  try {
    finiteNumbers(data, 'save', INFINITY_KEY);
    checkSavedRun(run, 'payload.run');
    if (payload.kind === 'world') checkSlices(payload.slices, 'payload.slices');
    else {
      likeReference(refs().shipThreat)(payload.threat, 'payload.threat');
      if (payload.carried !== null) {
        const carried = payload.carried as Record<string, unknown>;
        whole(carried.startAddr, 'payload.carried.startAddr');
        checkMemory(carried.segs, 'payload.carried.segs');
      }
    }
    list(anyRecord)(log.entries, 'log.entries');
  } catch (error) {
    if (error instanceof ShapeError) return error.message;
    throw error;
  }
  // The envelope's copies against the run they describe (the review follow-up's cross-checks).
  const saved = run as unknown as RunState;
  if (data.unit !== saved.unitNumber) return `the save is unit ${String(data.unit)}'s, its run unit ${saved.unitNumber}'s`;
  if (data.run !== saved.map.run) return `the save is run ${String(data.run)}, its map run ${saved.map.run}`;
  if (resume.unit !== data.unit || resume.depth !== saved.shipIndex + 1 || resume.year !== saved.map.galaxyYear) {
    return `the resume line (unit ${String(resume.unit)}, depth ${String(resume.depth)}, ${String(resume.year)}) is not the run's`;
  }
  return null;
}

// Run save migrations (slice 3c review follow-up), as the archive's (systems/meta.ts migrateMeta): the key stays
// RUN_SAVE_KEY, and a save of an older version is brought up to RUN_SAVE_VERSION here, one version at a time, before the
// checks: slice 4's `run.skills` is a step that adds it, not a RUN SAVE CAN'T RESUME for every save in flight. Version 1 is
// the first, so there is none yet. A version this build does not know is left as it is (check 2 refuses it).
export const RUN_SAVE_MIGRATIONS: Readonly<Record<number, (save: Record<string, unknown>) => Record<string, unknown>>> = {};

export function migrateRunSave(save: Record<string, unknown>): Record<string, unknown> {
  let current = save;
  for (;;) {
    const version = current.saveVersion;
    if (version === RUN_SAVE_VERSION || typeof version !== 'number') return current;
    const step = RUN_SAVE_MIGRATIONS[version];
    if (step === undefined) return current;
    const next = step(current);
    if (next.saveVersion !== version + 1) throw new Error(`migrateRunSave: the step from ${version} made version ${String(next.saveVersion)}`);
    current = next;
  }
}

// A stored save, checked in order (3c plan §2.1; the first failure is the refusal): 1 JSON, 2 the save version, 3 the
// content versions, 4 the shape, 5 an arm map, 6 the route against the point, 7 every ArmShip a valid ShipDef. The archive's
// view (check 8, stale) is saveRefusal's.
export function decodeRunSave(raw: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (_key, value: unknown) => (isInfinityTag(value) ? Infinity : value));
  } catch (error) {
    return refuse('not-json', `not JSON (${(error as Error).message})`);
  }
  if (!isRecord(parsed)) return refuse('not-json', 'not a record');
  const data = migrateRunSave(parsed);
  if (data.saveVersion !== RUN_SAVE_VERSION) return refuse('version', `save version ${String(data.saveVersion)}, not ${RUN_SAVE_VERSION}`);
  const want = contentVersions();
  const content = data.content;
  if (!isRecord(content) || sameKeys(content, Object.keys(want)) !== null) return refuse('content', 'content versions missing');
  for (const [key, version] of Object.entries(want)) {
    if (content[key] !== version) return refuse('content', `${key} version ${String(content[key])}, this build is ${version}`);
  }
  const shape = checkShape(data);
  if (shape !== null) return refuse('shape', shape);
  // Past checkShape the envelope is a RunSave's; the run inside is checked by what follows and by resume's constructors.
  const save = data as unknown as RunSave;
  const run = save.payload.run;
  if (run.map.world !== 'arm') return refuse('classic', `a '${String(run.map.world)}' map`);
  if (run.map.route.length !== run.shipIndex + 1) return refuse('route', `${run.map.route.length} route stops for ship ${run.shipIndex + 1}`);
  const phase = POINT_PHASE[save.point];
  if (run.phase !== phase) return refuse('route', `point ${save.point} with the run in '${run.phase}'`);
  const boot = save.point === 'run-start' || save.point === 'beam';
  if (boot !== (save.payload.kind === 'boot')) return refuse('route', `point ${save.point} with a '${save.payload.kind}' payload`);
  if (save.point === 'run-start' ? run.map.route.length !== 1 : save.point === 'beam' && run.map.route.length < 2) {
    return refuse('route', `point ${save.point} at depth ${run.map.route.length}`);
  }
  // The ships ended so far: a boot point and ENDING CHOSEN are on a ship not yet ended (its result comes at CONTINUE), SHIP
  // DONE on one just ended.
  const ended = save.point === 'ship-done' ? run.shipIndex + 1 : run.shipIndex;
  if (run.ships.length !== ended) return refuse('route', `point ${save.point} at depth ${run.map.route.length} with ${run.ships.length} ship(s) ended`);
  if (run.ships.some((result, i) => result.slot !== run.map.route[i]!.slot)) return refuse('route', 'a ship result is not its route stop\'s');
  for (const ship of run.map.arm) {
    try {
      validateShipDef(shipDefOf(ship));
    } catch (error) {
      return refuse('ship', `${String(ship?.name)} (slot ${String(ship?.slot)}): ${(error as Error).message}`);
    }
  }
  if (run.map.route.some((stop) => run.map.arm[stop.slot] === undefined)) return refuse('route', 'a route stop is off the arm');
  // The ships the envelope and the slices name are the route's current one.
  const current = shipSummaryAt(run.map, currentSlot(run)).name;
  if (save.resume.ship !== current) return refuse('shape', `the resume line names ${save.resume.ship}, the run is on ${current}`);
  if (save.payload.kind === 'world') {
    const slices = save.payload.slices;
    if (slices.level.shipName !== current) return refuse('shape', `the slices are ${slices.level.shipName}'s, the run is on ${current}`);
    if (save.point === 'ending-chosen' && (!slices.landing.finalShip || !['purged', 'merged', 'unresolved'].includes(slices.hollow.finale.phase))) {
      return refuse('route', `ENDING CHOSEN on ${current} with the finale '${slices.hollow.finale.phase}'`);
    }
  }
  return { ok: true, save };
}

// Check 8 (3c plan §2.1): the save belongs to the run the archive has in progress, or it is stale (the run already ended,
// or another tab's run). `meta` null: the archive can't be read (corrupt or offline), so nothing can vouch for the save.
export function saveRefusal(save: Readonly<RunSave>, meta: Readonly<Pick<Meta, 'runs' | 'activeRun'>> | null): SaveRefusal | null {
  if (meta === null) return { kind: 'archive', detail: 'the archive can\'t be read' };
  if (meta.activeRun === null) return { kind: 'stale', detail: 'the archive has no run in progress' };
  if (meta.activeRun.unit !== save.unit) return { kind: 'superseded', detail: `the archive's run is unit ${meta.activeRun.unit}'s, the save is unit ${save.unit}'s` };
  if (meta.runs !== save.archiveRuns) return { kind: 'superseded', detail: `the archive has counted ${meta.runs} runs, the save ${save.archiveRuns}` };
  return null;
}
