import type { GameState, RunState } from '@state/schema';
import type { ShipSlices } from '@state/initial';
import type { ContentVersions } from '@/types/lineage';
import type {
  RunSave, SavePoint, SavePayload, ResumeLine, BootParts, DecodeResult, SaveRefusal, SaveRefusalKind,
} from '@/types/save';
import type { Meta } from '@systems/meta';
import { ARM_CONTENT_VERSION } from '@data/arm';
import { MAP_GENERATOR_VERSION } from '@systems/map-generator';
import { MAP_UPDATE_VERSION } from '@systems/map-update';
import { MAP_STATE_VERSION } from '@data/map-state';
import { REPO_CATALOGUE_VERSION } from '@data/repository';
import { shipDefOf, validateShipDef } from '@data/ships';
import { shipSummaryAt } from '@systems/map-run';
import { currentSlot } from '@systems/map-streams';
import { RUN_SAVE_VERSION } from '@data/tuning';

// The run save's codec and checks (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.1), pure: what a save holds at
// each point (savePayloadAt, buildRunSave), its JSON (encodeRunSave, decodeRunSave) and why a stored one can't be resumed
// (decodeRunSave's checks 1–7 in order, then saveRefusal's against the archive). No store, no storage: the live half is
// systems/save-write.ts, resume and abandon systems/run-save.ts.
// Cycle guard (plan §5.4; slice 3c foundation deviation): a leaf below run.ts, so run.ts's save points can call
// save-write.ts (which encodes through this file) while run-save.ts imports run.ts.
// The foundation made it real except the deep field checks of a saved run (TODO(3c-SAVE) in checkShape); Track SAVE owns it.

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

// Check 4 (the envelope's keys and types, strict, like parseMeta). Returns what is wrong, or null.
// TODO(3c-SAVE): the saved run field by field (checkSavedRun: RunState, the map, the repo, the inbox, the log; a slice
// 4 field bumps RUN_SAVE_VERSION and joins it), and the world payload's slices. The foundation checks the envelope only.
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
  return null;
}

// A stored save, checked in order (3c plan §2.1; the first failure is the refusal): 1 JSON, 2 the save version, 3 the
// content versions, 4 the shape, 5 an arm map, 6 the route against the point, 7 every ArmShip a valid ShipDef. The archive's
// view (check 8, stale) is saveRefusal's.
export function decodeRunSave(raw: string): DecodeResult {
  let data: unknown;
  try {
    data = JSON.parse(raw, (_key, value: unknown) => (isInfinityTag(value) ? Infinity : value));
  } catch (error) {
    return refuse('not-json', `not JSON (${(error as Error).message})`);
  }
  if (!isRecord(data)) return refuse('not-json', 'not a record');
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
  for (const ship of run.map.arm) {
    try {
      validateShipDef(shipDefOf(ship));
    } catch (error) {
      return refuse('ship', `${String(ship?.name)} (slot ${String(ship?.slot)}): ${(error as Error).message}`);
    }
  }
  return { ok: true, save };
}

// Check 8 (3c plan §2.1): the save belongs to the run the archive has in progress, or it is stale (the run already ended,
// or another tab's run). `meta` null: the archive can't be read (corrupt or offline), so nothing can vouch for the save.
export function saveRefusal(save: Readonly<RunSave>, meta: Readonly<Pick<Meta, 'runs' | 'activeRun'>> | null): SaveRefusal | null {
  if (meta === null) return { kind: 'archive', detail: 'the archive can\'t be read' };
  if (meta.activeRun === null) return { kind: 'stale', detail: 'the archive has no run in progress' };
  if (meta.activeRun.unit !== save.unit) return { kind: 'stale', detail: `the archive's run is unit ${meta.activeRun.unit}'s, the save is unit ${save.unit}'s` };
  if (meta.runs !== save.archiveRuns) return { kind: 'stale', detail: `the archive has counted ${meta.runs} runs, the save ${save.archiveRuns}` };
  return null;
}
