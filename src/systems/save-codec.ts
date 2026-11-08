// Slice 7a: the lead owns this file (docs/phase3/impl/slice-7-plan.md §4.1): the FOUNDATION made the one v6 → v7 bump for
// 7a's three tracks and 7b (R2). A track that needs another saved field asks the lead. (Slice 6's v5 → v6 stands.)
import type { GameState, RunState } from '@state/schema';
import type { ShipSlices } from '@state/initial';
import type { ContentVersions } from '@/types/lineage';
import type {
  RunSave, SavePoint, SavePayload, ResumeLine, BootParts, DecodeResult, SaveRefusal, SaveRefusalKind,
} from '@/types/save';
import type { Meta, RunLineage } from '@systems/meta';
import type { LzState } from '@/types/landing';
import type { SurveyState } from '@/types/survey';
import { parseLastUnit, MetaCorrupt, endingOfV3LastUnit, parseEnding, parseEvent } from '@systems/meta-parse';
import type { TraceKind } from '@/types/trace';
import { traceRefusal, noTraces } from '@systems/traces';
import { signalRefusal, signalCount, SIGNAL_SOURCES } from '@systems/signals';
import { hasUsableTool } from '@state/selectors';
import { shipOnTarget } from '@systems/ending-rules';
import { podsOnTarget } from '@systems/landing-rules';
import { FS_TOOL_KINDS } from '@data/fs-tools';
import type { Segment } from '@/types/segment';
import type { FinaleState } from '@state/schema';
import type { FinalePhase } from '@/types/ending';
import { HOLLOW_PIECES, YOU_PIECES } from '@data/endings';
import {
  createRunState, createInitialState, createRunSkills, createAutodropState, createRunResidents, createResidentState, createSurveyState,
} from '@state/initial';
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
import { RUN_SAVE_VERSION, FIRST_UNIT_NUMBER, CYCLES_ARRIVED, FIRST_PICK_FLOOR_CYCLES, SURVEY_CELLS, NOTABLE_EVENTS_MAX, SIGNALS_FOR_CONTACT } from '@data/tuning';
import { shipCycles } from '@systems/run-score';
import { bankOf } from '@systems/skill-tree';
import { SKILL_IDS, levelPrice } from '@data/skills';
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
    landing: state.landing, hollow: state.hollow, hazards: state.hazards, resident: state.resident,
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
const SLICE_KEYS = ['mission', 'memory', 'clock', 'burn', 'orbit', 'level', 'landing', 'hollow', 'hazards', 'resident'];

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

// A ship's survey record (slice 6, RUN_SAVE_VERSION 6; types/survey.ts SurveyRecord): null on a GOOD planet.
const EFFECTIVE_VERSION_CHECK = oneOf(0, 1, 2, 3);
const checkSurveyMove = rec({ lz: name, from: name, site: name });
const checkSurveyRecord = rec({
  ranAt: EFFECTIVE_VERSION_CHECK,
  mappedPct: (value, at) => {
    whole(value, at);
    if ((value as number) > 100) shapeFail(at, 'is over 100');
  },
  found: whole,
  moves: list(checkSurveyMove),
  badKept: list(rec({ lz: name, ground: oneOf('rocky', 'wet'), known: oneOf('survey', 'touchdown', null) })),
  movedOff: list(rec({ lz: name, ground: oneOf('rocky', 'wet'), known: oneOf('survey', 'touchdown', null) })),
});

const checkShipResult = rec({
  shipId: name, shipName: name, slot: whole, depth: whole,
  outcome: oneOf('locked', 'partial', 'stranded', 'escaped', 'crashed', 'abandoned', 'emergency'),
  stars: whole, fuelLeftPct: num, ringMiss: nullable(rec({ apsis: oneOf('▼', '▲'), km: num })),
  colonistsAboard: whole, lzs: list(anyRecord), offSite: whole, noGo: whole, restored: whole,
  parked: list(rec({ pod: whole, why: str })), notLaunched: whole, landedInLz: whole, points: num, colony: nullable(name), pods: list(anyRecord),
  survey: nullable(checkSurveyRecord),
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
  arm: null, history: { lastUnitNumber: null, colonies: [], routes: [] }, events: [],
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

// The skill tree's history (slice 4, types/skill.ts RunSkillState), field by field. `pending` is always empty at a save
// point (the desk's purchases are undoable until TRANSMIT ▸ and become part of the save at BEAM: a reload at the desk
// restores SHIP DONE's bank, 03 §5), like `transit`.
const SKILL_ID_CHECK = oneOf(...SKILL_IDS);
const SKILL_VERSION_CHECK = oneOf(1, 2, 3);
const checkSkillLevel = rec({ version: SKILL_VERSION_CHECK, lock: oneOf(0, 1, 2) });
const checkEmptyList: Check = (value, at) => {
  list(anyRecord)(value, at);
  if ((value as unknown[]).length !== 0) shapeFail(at, 'is not empty (purchases are undoable until TRANSMIT ▸, never saved)');
};
const checkRunSkills = rec({
  earned: list(rec({ slot: whole, arrived: oneOf(1), landed: whole, pct: whole })),
  grants: list(rec({ source: oneOf('first-pick', 'salvage', 'resident', 'story', 'migration'), cycles: whole, visit: whole, label: nullable(str) })),
  bought: list(rec({ skill: SKILL_ID_CHECK, kind: oneOf('train', 'lock', 'restore', 'grant'), to: checkSkillLevel, cost: whole, visit: whole })),
  pending: checkEmptyList,
  skillGrants: list(rec({ skill: SKILL_ID_CHECK, version: SKILL_VERSION_CHECK, source: name, installedAtDepth: nullable(whole) })),
  opened: list(rec({ skill: SKILL_ID_CHECK, visit: whole })),
  announced: rec(Object.fromEntries(SKILL_IDS.map((id) => [id, nullable(whole)]))),
});

// The arrival's skill files (ArrivalReport.skills, slice 4): the boot's TRAINED / RETRAINED lines read them. Its beam seeds
// each name their decoy or null (slice 4d, RUN_SAVE_VERSION 4: the boot's SENTRY line reads it). The rest of the arrival is
// the boot's to read (its own constructors).
const checkArrival: Check = (value, at) => {
  anyRecord(value, at);
  const arrival = value as Record<string, unknown>;
  list(rec({
    segId: name, skill: SKILL_ID_CHECK, level: checkSkillLevel, kind: oneOf('trained', 'restored', 'packed', 'carried', 'granted'),
  }))(arrival.skills, `${at}.skills`);
  list((seed, where) => {
    anyRecord(seed, where);
    nullable(name)((seed as Record<string, unknown>).disguise, `${where}.disguise`);
  })(arrival.seeds, `${at}.seeds`);
  // Slice 7c (RUN_SAVE_VERSION 8): the traces this arrival applied, as its boot lines say them, and their charge.
  list(rec({ kind: oneOf('trace-gift', 'dish-wiped', 'dish-wild'), trace: TRACE_KIND_CHECK, text: str }))(arrival.traceLines, `${at}.traceLines`);
  whole(arrival.giftCharge, `${at}.giftCharge`);
};

// --- Slice 7c: the traces and the log's book (RUN_SAVE_VERSION 8, plan §2.2 7c) ------------------------------------------

const TRACE_KINDS: readonly TraceKind[] = ['purge', 'merge', 'spare', 'sunset', 'stay', 'reassignment', 'contact'];
const TRACE_KIND_CHECK = oneOf(...TRACE_KINDS);
const checkEndingRecord: Check = (value, at) => {
  try {
    if (parseEnding(value, at) === null) shapeFail(at, 'is not an ending record (null)');
  } catch (error) {
    if (error instanceof MetaCorrupt) shapeFail(at, `is not an ending record (${error.message})`);
    throw error;
  }
};
const checkTraces = rec({
  from: nullable(rec({ unit: whole, ending: checkEndingRecord })),
  kinds: list(TRACE_KIND_CHECK),
  places: list(rec({ kind: oneOf('spare', 'sunset', 'stay', 'contact'), slot: whole, given: bool })),
  extraSeed: bool,
});

// The `???` file's book (R37): 046.log, a stranger's (its unit), or the last unit's (its unit, its step 1 and at most
// NOTABLE_EVENTS_MAX notable events, read as the archive reads them).
function checkLogBook(value: unknown, at: string): void {
  anyRecord(value, at);
  const book = value as Record<string, unknown>;
  if (book.kind === '046') return rec({ kind: oneOf('046') })(value, at);
  if (book.kind === 'stranger') return rec({ kind: oneOf('stranger'), unit: whole })(value, at);
  rec({
    kind: oneOf('last'), unit: whole, step1: oneOf(...HOLLOW_PIECES, 'followed'),
    events: (events, where) => {
      list(anyRecord)(events, where);
      const kept = events as unknown[];
      if (kept.length > NOTABLE_EVENTS_MAX) shapeFail(where, `holds ${kept.length} events, over ${NOTABLE_EVENTS_MAX}`);
      kept.forEach((event, index) => {
        try {
          parseEvent(event, `${where}[${index}]`);
        } catch (error) {
          if (error instanceof MetaCorrupt) shapeFail(`${where}[${index}]`, `is not a notable event (${error.message})`);
          throw error;
        }
      });
    },
  })(value, at);
}

// The first ship that met a seed (slice 4d's lasting record, R11): null, or a depth on the route so far.
function checkSeedsMet(run: Readonly<RunState>, at: string): void {
  const depth = run.threat.seedsMetAtDepth;
  if (depth === null) return;
  whole(depth, `${at}.threat.seedsMetAtDepth`);
  if (depth < 1 || depth > run.map.route.length) {
    shapeFail(`${at}.threat.seedsMetAtDepth`, `is ${depth}, off the route's ${run.map.route.length} stop(s)`);
  }
}

// --- Slice 5: the residents (RUN_SAVE_VERSION 5, plan §2.2) ------------------------------------------------------------

const RESIDENT_KINDS = ['corrupted', 'left', 'sleeping'];
const RESIDENT_SHOWN = ['faulty', 'unknown'];
const SLEEPER_JOBS = ['drops', 'wall', 'mend'];
const checkResidentRecord = rec({
  slot: whole, depth: whole, kind: oneOf(...RESIDENT_KINDS), name: name, shown: oneOf(...RESIDENT_SHOWN),
  fate: oneOf('deleted', 'cured', 'paid', 'ignored', 'left', 'slept', 'woken'), job: nullable(oneOf(...SLEEPER_JOBS)),
  podsParkedLocked: whole, leftoversEaten: whole,
});

// The residents met, read as a whole: each on the route at its own depth, once, and of the kind the map placed there; and
// the signals found (slice 7d, RUN_SAVE_VERSION 9: systems/signals.ts signalRefusal), each on the route, once per ship and
// source, and what that ship could give (a note's no more than it carries, the signal ship's its fragments, a CONTACT stop's
// one).
function checkResidentHistory(run: Readonly<RunState>, at: string): void {
  const { met } = run.residents;
  const seen = new Set<number>();
  met.forEach((record, i) => {
    const where = `${at}.residents.met[${i}]`;
    if (seen.has(record.slot)) shapeFail(where, `meets slot ${record.slot}'s resident twice`);
    seen.add(record.slot);
    const stop = run.map.route[record.depth - 1];
    if (stop === undefined || stop.slot !== record.slot) shapeFail(where, `is slot ${record.slot} at depth ${record.depth}, off the route`);
    const placed = run.map.arm[record.slot]?.reserved.resident ?? null;
    if (placed === null || placed.kind !== record.kind || placed.name !== record.name) shapeFail(where, `is not the resident the map placed in slot ${record.slot}`);
  });
  const signals = signalRefusal(run);
  if (signals !== null) shapeFail(`${at}.residents.signals`, signals);
}

// The ship's resident slice (plan §2.2), field by field, and at rest: every save point is outside a flight (residentShipEnd
// ends every telegraph, offer and job at SHIP DONE; the final ship has none; a boot point holds no slices), so no lock
// counts down, no DEAL stands and no sleeper's offer is open. Exactly the def's kind has a machine.
const checkLock = rec({ pod: whole, segId: name, leftSec: num, totalSec: num, entryId: whole });
const checkResidentDeal = rec({
  phase: oneOf('none', 'offered', 'done'), fileId: nullable(name), fileName: nullable(name), entryId: nullable(whole),
  outcome: nullable(oneOf('accepted', 'refused', 'timeout', 'invalidated')),
});
const checkCorrupted = rec({
  phase: oneOf('dormant', 'awake', 'quiet', 'deleted', 'cured'), surprise: bool, calmAiSec: num, wokeAtAi: nullable(num),
  lockInSec: nullable(num), lock: nullable(checkLock), locksLanded: whole, locksBlocked: whole, bursts: whole, deal: checkResidentDeal,
  angryUntilAi: nullable(num), line: whole,
});
const checkSleeper = rec({
  phase: oneOf('asleep', 'awake', 'offering', 'working'), wokenBy: nullable(oneOf('rm', 'move')), wokeAtAi: nullable(num),
  job: nullable(oneOf(...SLEEPER_JOBS)), entryId: nullable(whole), mendingId: nullable(name), wallId: nullable(name),
});
const checkResidentSlice: Check = (value, at) => {
  rec({
    def: nullable(rec({ kind: oneOf(...RESIDENT_KINDS), shown: oneOf(...RESIDENT_SHOWN), name: name, fragments: whole })),
    corrupted: nullable(checkCorrupted), sleeper: nullable(checkSleeper), left: nullable(rec({ noteRead: bool })),
  })(value, at);
  const slice = value as GameState['resident'];
  const kind = slice.def?.kind ?? null;
  if ((slice.corrupted !== null) !== (kind === 'corrupted') || (slice.sleeper !== null) !== (kind === 'sleeping')
    || (slice.left !== null) !== (kind === 'left')) {
    shapeFail(at, `holds a machine for a resident that is not '${String(kind)}'`);
  }
  if (slice.corrupted !== null) {
    if (slice.corrupted.lock !== null) shapeFail(`${at}.corrupted.lock`, 'counts down at a save point');
    if (slice.corrupted.deal.phase === 'offered') shapeFail(`${at}.corrupted.deal`, 'stands open at a save point');
  }
  if (slice.sleeper !== null && slice.sleeper.phase === 'offering') shapeFail(`${at}.sleeper`, 'is offering at a save point');
};

// The tree's history read as a whole (the foundation review's notes): one earning per ended ship, on the ship it names,
// and a bank that never went below 0 (skill-tree.ts bankOf throws there: a purchase the run could not pay).
function checkSkillHistory(run: Readonly<RunState>, at: string): void {
  const { earned } = run.skills;
  if (earned.length !== run.ships.length) shapeFail(`${at}.skills.earned`, `has ${earned.length} earnings for ${run.ships.length} ended ships`);
  earned.forEach((earning, i) => {
    if (earning.slot !== run.ships[i]!.slot) shapeFail(`${at}.skills.earned[${i}]`, `is slot ${earning.slot}'s, the ship ended there slot ${run.ships[i]!.slot}'s`);
  });
  try {
    bankOf(run.skills);
  } catch {
    shapeFail(`${at}.skills`, 'spends more cycles than the run earned and was granted');
  }
}

// The saved RunState, field by field (every key, exactly: a field a later slice adds bumps RUN_SAVE_VERSION, joins this
// spec, and gets a migration step; slice 4's run.skills was the first). The fields a save point always has empty are
// checked empty: no beam out, no transit, no end cause, no pending purchase.
function checkSavedRun(value: unknown, at: string): void {
  rec({
    rev: whole, phase: oneOf(...RUN_PHASES), seed: whole, unitNumber: whole, wave: whole, lastUnit: nullable(checkLastUnit),
    ghostSpoken: bool, hollowUnits: list(whole), upgrades: list(str), tutorial: bool, shipIndex: whole, map: checkMap,
    licences: list(str), hollowNamed: bool, coreLost: bool, skills: checkRunSkills, repairRenewedOn: nullable(whole),
    ships: list(checkShipResult),
    stats: rec({
      manualCaptures: whole, demos: list(rec({ offsetTac: num })), dropDemos: list(rec({ offsetTac: num })), repairs: whole, moves: whole,
      deletes: whole, driversLost: whole,
      driversBitten: whole, capRefusals: whole, deal: nullable(anyRecord),
    }),
    pendingStarCredit: num, pendingStars: whole, simulationRetryUsed: bool, beamOut: isNull, transit: isNull, arrival: nullable(checkArrival),
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
    residents: rec({ met: list(checkResidentRecord), signals: list(rec({ slot: whole, depth: whole, source: oneOf(...SIGNAL_SOURCES), n: whole })) }),
    traces: checkTraces,
  })(value, at);
  // Slice 7c: the log's book field by field, and the traces by their rules (systems/traces.ts traceRefusal: from the last
  // unit's own ending, tracesOf's kinds, every place a ship its kind's rule allows).
  checkLogBook((value as RunState).log.book, `${at}.log.book`);
  const traces = traceRefusal(value as RunState);
  if (traces !== null) shapeFail(`${at}.traces`, traces);
  // Every key of a fresh run is in the spec above (a field a slice adds fails here first, in the round-trip suite).
  const known = Object.keys(refs().run);
  const have = Object.keys(value as Record<string, unknown>);
  if (known.length !== have.length || known.some((key) => !have.includes(key))) shapeFail(at, 'does not have a fresh run\'s fields');
  checkSkillHistory(value as RunState, at);
  checkSeedsMet(value as RunState, at);
  checkResidentHistory(value as RunState, at);
}

// Memory (the world payload's): a list of segments, each with its id, name, type and size (the layout and every rule
// past that are assertMemoryInvariants', which the resume runs). A skill file (slice 4) also carries its version and its
// lock: its size and its powers are read from them.
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
    if (entry.type === 'upgrade' && (SKILL_IDS as readonly unknown[]).includes(entry.upgrade)) {
      SKILL_VERSION_CHECK(entry.version, `${where}.version`);
      oneOf(0, 1, 2)(entry.lock, `${where}.lock`);
    }
  });
};

// The burn slice as its reference, and AUTOBURN's machine read whole (RUN_SAVE_VERSION 3): its burn in hand is one of the
// plan's burns, and it has one exactly while it points or burns (autoburn.ts burnTick throws on a burning machine without).
const AUTO_PHASES = ['idle', 'armed', 'pointing', 'burning', 'done', 'dropped'];
const checkAutoBurn = rec({
  preset: oneOf('prograde', 'retrograde'), reason: name, event: oneOf('peri', 'apo', 'now', 'point'),
});
function checkBurn(reference: Readonly<Record<string, unknown>>): Check {
  const like = likeReference(reference);
  const autoLike = likeReference(reference.auto as Record<string, unknown>);
  return (value, at) => {
    like(value, at);
    const auto = (value as Record<string, unknown>).auto;
    autoLike(auto, `${at}.auto`);
    const machine = auto as Record<string, unknown>;
    oneOf(...AUTO_PHASES)(machine.phase, `${at}.auto.phase`);
    nullable(checkAutoBurn)(machine.flying, `${at}.auto.flying`);
    const flies = machine.phase === 'pointing' || machine.phase === 'burning';
    if (flies !== (machine.flying !== null)) shapeFail(`${at}.auto.flying`, flies ? 'is empty while it burns' : 'is set while it does not burn');
    // AUTOBURN v3's hold (slice 4e, RUN_SAVE_VERSION 4): only a landing orbit is ever held.
    bool(machine.holding, `${at}.auto.holding`);
    if (machine.holding === true && machine.mode !== 'landing-orbit') shapeFail(`${at}.auto.holding`, `is set in mode '${String(machine.mode)}'`);
  };
}

// AUTODROP's machine (slice 4c, RUN_SAVE_VERSION 4), read whole and at rest: every save point is outside a landing (the
// landing ended resets it, plan R2), so nothing is held, armed, claimed or waiting. Its pass numbers are kept between
// passes, and with the last end's words, they may stand.
const AUTODROP_ENDS = ['pass-done', 'plan-done', 'cancel', 'downgraded', 'off', 'offline', 'landing-over', 'released'];
const wholeCounts: Check = (value, at) => {
  anyRecord(value, at);
  for (const [lz, count] of Object.entries(value as Record<string, unknown>)) whole(count, `${at}.${lz}`);
};
const checkAutodrop = rec({
  held: oneOf(false), armed: isNull, pass: wholeCounts, sent: wholeCounts, armedAtTSec: isNull, claimed: oneOf(false),
  waitingSinceTSec: isNull, flownAs: oneOf(0, 1, 2, 3), end: nullable(oneOf(...AUTODROP_ENDS)), endAtAi: nullable(num),
});
// SURVEY's slice (slice 6, RUN_SAVE_VERSION 6; plan §2.2's codec checks), read whole and at rest: no thread held, no angle
// kept (survey.ts surveyShipEnd, R20); SURVEY_CELLS cells; unique sites (none on a GOOD planet), each LZ on a site of its own
// whose geometry and ground are the LZ's (null on GOOD); every move and reveal naming an LZ and a site the slice has; sitesRev
// at least the moves made.
const checkSurveySite = rec({
  id: name, kind: oneOf('guess', 'candidate', 'wreck'), number: whole, centreRad: num, halfWidthRad: num, widthKm: num,
  width: oneOf('wide', 'standard', 'narrow'), roomPods: whole, ground: oneOf('flat', 'rocky', 'wet'), found: bool, groundKnown: bool,
});
const checkSurveyState = rec({
  site: oneOf('good', 'poor'),
  sites: list(checkSurveySite),
  mapped: (value, at) => {
    list(bool)(value, at);
    if ((value as unknown[]).length !== SURVEY_CELLS) shapeFail(at, `has ${(value as unknown[]).length} cells, not ${SURVEY_CELLS}`);
  },
  paused: bool,
  claimed: oneOf(false),
  lastRad: isNull,
  ranAt: EFFECTIVE_VERSION_CHECK,
  moves: list(checkSurveyMove),
  reveals: list(rec({ site: name, by: oneOf('survey', 'touchdown') })),
  lines: rec({ firstFind: bool, mapped: bool, controlBoot: bool, controlMoved: bool }),
});
const checkLz = rec({
  label: name, centreRad: num, halfWidthRad: num, widthKm: num, pods: whole, ground: oneOf('flat', 'rocky', 'wet'), site: nullable(name),
});
function checkSurvey(landing: Readonly<Record<string, unknown>>, at: string): void {
  list(checkLz)(landing.lzs, `${at}.lzs`);
  checkSurveyState(landing.survey, `${at}.survey`);
  whole(landing.sitesRev, `${at}.sitesRev`);
  const lzs = landing.lzs as LzState[];
  const survey = landing.survey as SurveyState;
  const ids = survey.sites.map((site) => site.id);
  if (new Set(ids).size !== ids.length) shapeFail(`${at}.survey.sites`, 'has two sites with one id');
  if (survey.site === 'good' && ids.length > 0) shapeFail(`${at}.survey.sites`, 'is not empty on a GOOD planet');
  const taken = new Set<string>();
  lzs.forEach((lz, i) => {
    const where = `${at}.lzs[${i}].site`;
    if (lz.site === null) {
      if (survey.site === 'poor') shapeFail(where, 'is null on a POOR planet');
      // Review m9: a GOOD planet's LZs are sound (01 §3.13).
      if (lz.ground !== 'flat') shapeFail(`${at}.lzs[${i}].ground`, `is '${lz.ground}' on a GOOD planet`);
      return;
    }
    if (survey.site === 'good') shapeFail(where, 'names a site on a GOOD planet');
    const site = survey.sites.find((candidate) => candidate.id === lz.site);
    if (site === undefined) shapeFail(where, `names '${lz.site}', which the survey does not have`);
    if (taken.has(site.id)) shapeFail(where, `names '${site.id}', which another LZ stands on`);
    taken.add(site.id);
    if (site.kind === 'wreck') shapeFail(where, `names the wreck '${site.id}'`);
    if (lz.centreRad !== site.centreRad || lz.halfWidthRad !== site.halfWidthRad || lz.widthKm !== site.widthKm || lz.ground !== site.ground) {
      shapeFail(where, `stands on '${site.id}' with another centre, width or ground`);
    }
  });
  const labels = lzs.map((lz) => lz.label);
  survey.moves.forEach((move, i) => {
    if (!labels.includes(move.lz) || !ids.includes(move.from) || !ids.includes(move.site) || move.from === move.site) {
      shapeFail(`${at}.survey.moves[${i}]`, `names ${move.lz}: ${move.from} → ${move.site}, which the slice does not have`);
    }
  });
  survey.reveals.forEach((reveal, i) => {
    if (!ids.includes(reveal.site)) shapeFail(`${at}.survey.reveals[${i}]`, `names '${reveal.site}', which the survey does not have`);
  });
  if ((landing.sitesRev as number) < survey.moves.length) shapeFail(`${at}.sitesRev`, `is ${String(landing.sitesRev)}, under the ${survey.moves.length} moves made`);
}

function checkLanding(reference: Readonly<Record<string, unknown>>): Check {
  const like = likeReference(reference);
  return (value, at) => {
    like(value, at);
    checkAutodrop((value as Record<string, unknown>).autodrop, `${at}.autodrop`);
    checkSurvey(value as Record<string, unknown>, at);
    // Slice 7a (R2): THE LAST LANDING never stands at a save point (it ends before the final LANDING REPORT).
    isNull((value as Record<string, unknown>).lastLanding, `${at}.lastLanding`);
  };
}

// The FINALE (slice 7a, RUN_SAVE_VERSION 7; schema FinaleState) field by field. Its cross-checks against the point and the
// pods are finaleRefusal's (decodeRunSave).
const FINALE_PHASES: readonly FinalePhase[] = ['none', 'duel', 'asleep', 'step1', 'step2', 'verdict', 'last-landing', 'done'];
const HOLLOW_FATE_CHECK = oneOf(...HOLLOW_PIECES, 'followed', null);
const YOU_CHECK = oneOf(...YOU_PIECES, null);
const checkFinale = rec({
  phase: oneOf(...FINALE_PHASES), rootFell: bool, hollow: HOLLOW_FATE_CHECK, you: YOU_CHECK, stay: nullable(whole), restored: list(whole),
  cardAtAi: nullable(num),
  ending: nullable(rec({
    choice: rec({ hollow: oneOf(...HOLLOW_PIECES, 'followed'), you: oneOf(...YOU_PIECES) }),
    lines: list(rec({ voice: oneOf('cmd', 'us', 'story', 'control'), text: str })), startAi: num, untilAi: num,
  })),
  unresolvedUntilAi: nullable(num),
  // Review M4: the ending record frozen at the confirm, read as the archive reads one.
  record: (value, at) => {
    try {
      parseEnding(value, at);
    } catch (error) {
      if (error instanceof MetaCorrupt) shapeFail(at, `is not an ending record (${error.message})`);
      throw error;
    }
  },
});

function checkHollow(reference: Readonly<Record<string, unknown>>): Check {
  const like = likeReference(reference);
  return (value, at) => {
    like(value, at);
    checkFinale((value as Record<string, unknown>).finale, `${at}.finale`);
  };
}

function checkSlices(value: unknown, at: string): void {
  const reference = refs().slices as unknown as Record<string, Record<string, unknown>>;
  rec({
    mission: likeReference(reference.mission!), memory: checkMemory, clock: likeReference(reference.clock!),
    burn: checkBurn(reference.burn!), orbit: likeReference(reference.orbit!), level: likeReference(reference.level!),
    landing: checkLanding(reference.landing!), hollow: checkHollow(reference.hollow!), hazards: likeReference(reference.hazards!),
    resident: checkResidentSlice,
  })(value, at);
  // SENTRY v2's pre-empt (slice 4d, RUN_SAVE_VERSION 4): a standing outline is never armed at a save point.
  const telegraph = ((value as Record<string, Record<string, unknown>>).hollow!).seedTelegraph;
  if (telegraph !== null && telegraph !== undefined) oneOf(false)((telegraph as Record<string, unknown>).preempted, `${at}.hollow.seedTelegraph.preempted`);
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
// checks, rather than refused (RUN SAVE CAN'T RESUME for every save in flight). A version this build does not know is left
// as it is (check 2 refuses it). Each step works on a copy of the JSON and returns the next version's; it trusts nothing it
// does not touch (the checks after it read the whole result), and throws on nothing: a save it can't make sense of is left
// for the checks to refuse.

// Every memory strip a payload holds: a world point's ship memory, a boot point's carried racks (their strays are seeds).
function payloadStrips(payload: Record<string, unknown>): Record<string, unknown>[][] {
  const strips: unknown[] = [];
  if (isRecord(payload.slices)) strips.push(payload.slices.memory);
  if (isRecord(payload.carried)) strips.push(payload.carried.segs);
  return strips.filter(Array.isArray).map((strip) => (strip as unknown[]).filter(isRecord));
}

// Phase 2's AUTOBURN install rule (WP9: the boot after the second manual capture), kept only to migrate saves made under it.
const PHASE2_DEMOS_TO_TRAIN = 2;

// 1 → 2 (slice 4, plan §2.14): the skill tree.
// • run.skillTrainedOn goes; run.skills is a fresh history (createRunSkills), and run.stats.dropDemos is empty (4c fills it).
// • A unit that arrived at phase 2's free AUTOBURN.skl (the install after two captures; arm runs in flight may carry one)
//   keeps it as AUTOBURN v1 with LOCK RANGE 90 (version 1, lock 0: its 6 blocks are v1's), in the world payload's memory and
//   in a boot payload's carried racks, and the run records it as bought for nothing before the tree (cost 0, visit 0): the
//   bank does not move, and a file eaten since is offered for RESTORE (2 cycles) instead of reading as never trained.
// • Every ship ended so far earns its training cycles now (run-score.ts shipCycles, as endShip records them from slice 4 on),
//   so the bank at the next desk is what the same run would have from the start, and `earned` keeps one entry per ended
//   ship. A SHIP DONE save at the run's first desk also gets that desk's first-pick top-up (03 §3.1's floor): run.ts
//   openDesk writes it before the save, and a resumed desk does not open again, so without it the required first pick
//   could be unaffordable there.
// • `announced.autoburn` keeps what phase 2's boot last said: the captures it was trained on (skillTrainedOn), or for a
//   carried file with no count, every capture so far; null when it was never trained. New captures after it retrain the
//   skill at the next boot, as they did.
// • An install phase 2 still owed (a SHIP DONE or BEAM save after the second capture, before the boot that would have
//   installed AUTOBURN.skl: no file, two or more demos, more than it was last trained on) can't happen any more, so the run
//   is paid AUTOBURN v1's price in cycles instead (a 'migration' grant): the kid buys it back at the next desk.
// • burn.auto gains its mode fields, all empty (no save point is mid-flight: an engaged AUTOBURN is never saved; step 2
//   adds the rest).
// • arrival.skills is empty (no skill line is owed at a boot the save replays: phase 2's install path is gone).
function migrateRunSave1(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const run = payload !== null && isRecord(payload.run) ? payload.run : null;
  if (payload !== null && run !== null) {
    const strips = payloadStrips(payload);
    let carriesAutoburn = false;
    for (const strip of strips) {
      for (const seg of strip) {
        if (seg.type !== 'upgrade' || seg.upgrade !== 'autoburn') continue;
        seg.version = 1;
        seg.lock = 0;
        carriesAutoburn = true;
      }
    }
    const trained = run.skillTrainedOn;
    delete run.skillTrainedOn;
    const skills = createRunSkills();
    if ((trained !== null && trained !== undefined) || carriesAutoburn) {
      skills.bought.push({ skill: 'autoburn', kind: 'train', to: { version: 1, lock: 0 }, cost: 0, visit: 0 });
    }
    const demos = isRecord(run.stats) && Array.isArray(run.stats.demos) ? run.stats.demos.length : 0;
    skills.announced.autoburn = typeof trained === 'number' ? trained : carriesAutoburn ? demos : null;
    const owedInstall = !carriesAutoburn && demos >= PHASE2_DEMOS_TO_TRAIN && (typeof trained !== 'number' || demos > trained)
      && (next.point === 'ship-done' || next.point === 'beam');
    const ships = Array.isArray(run.ships) ? run.ships.filter(isRecord) : [];
    // A result shipCycles can't read (nobody aboard, points out of range: an edited save) earns ARRIVED alone here; the
    // checks after the step judge the rest of it.
    skills.earned = ships.map((ship) => {
      const aboard = ship.colonistsAboard;
      const points = ship.points;
      const readable = typeof aboard === 'number' && aboard > 0 && typeof points === 'number' && points >= 0 && points <= aboard;
      return readable ? shipCycles({ slot: Number(ship.slot), points, colonistsAboard: aboard }) : { slot: Number(ship.slot), arrived: CYCLES_ARRIVED, landed: 0, pct: 0 };
    });
    const world = isRecord(run.map) ? run.map.world : null;
    if (next.point === 'ship-done' && ships.length === 1 && world === 'arm') {
      const bank = skills.earned.reduce((sum, earning) => sum + earning.arrived + earning.landed, 0);
      if (bank < FIRST_PICK_FLOOR_CYCLES) skills.grants.push({ source: 'first-pick', cycles: FIRST_PICK_FLOOR_CYCLES - bank, visit: 1, label: null });
    }
    if (owedInstall) {
      skills.grants.push({ source: 'migration', cycles: levelPrice('autoburn', { kind: 'version', version: 1 }), visit: ships.length, label: null });
    }
    run.skills = skills;
    if (isRecord(run.stats)) run.stats.dropDemos = [];
    if (isRecord(run.arrival)) run.arrival.skills = [];
    const burn = isRecord(payload.slices) && isRecord(payload.slices.burn) ? payload.slices.burn : null;
    if (burn !== null && isRecord(burn.auto)) Object.assign(burn.auto, { mode: null, targetKm: null, claimed: false, waitingSinceTSec: null });
  }
  next.saveVersion = 2;
  return next;
}

// 2 → 3 (slice 4 review, FLIGHT deviation 7): burn.auto gains the burn in hand and the capture flag, both empty (every save
// point so far is outside a flight: no AUTOBURN is engaged in a saved world).
function migrateRunSave2(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const burn = payload !== null && isRecord(payload.slices) && isRecord(payload.slices.burn) ? payload.slices.burn : null;
  if (burn !== null && isRecord(burn.auto)) Object.assign(burn.auto, { flying: null, captured: false });
  next.saveVersion = 3;
  return next;
}

// 3 → 4 (slices 4c–4e, one bump for all three: slice-4cde-plan R1, §2.2). Every field is new and at rest at every save point:
// • a world payload's landing gains AUTODROP's machine at rest (createAutodropState), burn.auto `holding: false`, and a
//   standing seed outline `preempted: false`;
// • every arrival seed names no decoy (`disguise: null`: nothing was disguised before 4d);
// • run.threat.seedsMetAtDepth (R11) is written from the evidence 4a's rule read at the desk, so a run in flight opens
//   SENTRY as it would have: HOLLOW's SEEDS stage played, TRACE, `fed`, the last tally's left blocks (all from ships already
//   ended: the last ended ship's depth), else the current ship's own seeds (its arrival's, or HOLLOW's landed in a world
//   payload: SHIP DONE's ship is ended, ENDING CHOSEN's and a boot point's are not: its depth); null without any.
function migrateRunSave3(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const run = payload !== null && isRecord(payload.run) ? payload.run : null;
  const slices = payload !== null && isRecord(payload.slices) ? payload.slices : null;
  if (slices !== null) {
    if (isRecord(slices.landing)) slices.landing.autodrop = createAutodropState();
    if (isRecord(slices.burn) && isRecord(slices.burn.auto)) slices.burn.auto.holding = false;
    if (isRecord(slices.hollow) && isRecord(slices.hollow.seedTelegraph)) slices.hollow.seedTelegraph.preempted = false;
  }
  if (run !== null) {
    const arrival = isRecord(run.arrival) ? run.arrival : null;
    const seeds = arrival !== null && Array.isArray(arrival.seeds) ? arrival.seeds.filter(isRecord) : [];
    for (const seed of seeds) seed.disguise = null;
    const threat = isRecord(run.threat) ? run.threat : null;
    if (threat !== null) {
      const ended = Array.isArray(run.ships) ? run.ships.length : 0;
      const current = typeof run.shipIndex === 'number' ? run.shipIndex + 1 : ended + 1;
      const tally = isRecord(threat.lastTally) ? threat.lastTally : null;
      const before = (Array.isArray(threat.stagesPlayed) && threat.stagesPlayed.includes('seeds')) || Number(threat.trace) > 0
        || Number(threat.fed) > 0 || Number(tally?.left ?? 0) > 0;
      const hollow = slices !== null && isRecord(slices.hollow) ? slices.hollow : null;
      const now = seeds.length > 0 || Number(hollow?.seedsLanded ?? 0) > 0;
      const thisShip = next.point === 'ship-done' ? ended : current;
      threat.seedsMetAtDepth = before && ended > 0 ? ended : now ? thisShip : before ? current : null;
    }
  }
  next.saveVersion = 4;
  return next;
}

// 4 → 5 (slice 5, one bump for the three tracks: slice-5-plan R1, §2.2). No resident was ever built before v5, so:
// • run.residents is empty (createRunResidents): nothing met, no signal found;
// • a world payload's slices gain the resident slice with no resident (createResidentState(null));
// • memory needs nothing: no v4 save holds the residents' five segment types or a driver's lockedBy, and the log's entries
//   are read as any record, so the new speakers and a choice with no timer pass as they are.
function migrateRunSave4(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  if (payload !== null && isRecord(payload.run)) payload.run.residents = createRunResidents();
  if (payload !== null && isRecord(payload.slices)) payload.slices.resident = createResidentState(null);
  next.saveVersion = 5;
  return next;
}

// 5 → 6 (slice 6, one bump for the two tracks: slice-6-plan R1, §2.2). No v5 world ever played a POOR planet as POOR (every
// planet played GOOD until slice 6), so:
// • a world payload's landing slice: each LZ on no site, the survey at rest on a GOOD planet (createSurveyState('good', [])),
//   no move made (sitesRev 0);
// • each ended ship's result (run.ships[], in a world and a boot payload) records no survey (null);
// • a BEAM save into a POOR ship rebuilds the ship from its boot at the resume, and then plays POOR (plan R2): intended.
function migrateRunSave5(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const slices = payload !== null && isRecord(payload.slices) ? payload.slices : null;
  if (slices !== null && isRecord(slices.landing)) {
    const landing = slices.landing;
    if (Array.isArray(landing.lzs)) for (const lz of landing.lzs.filter(isRecord)) lz.site = null;
    landing.survey = createSurveyState('good', []);
    landing.sitesRev = 0;
  }
  if (payload !== null && isRecord(payload.run) && Array.isArray(payload.run.ships)) {
    for (const ship of payload.run.ships.filter(isRecord)) ship.survey = null;
  }
  next.saveVersion = 6;
  return next;
}

// The ending record of a decided v6 finale (review M4), as the confirm would have written it: step 1 and REASSIGNMENT, the
// root the run's HOLLOW, the final ship from the slices and the route, the kit and the charge from its memory. Unchecked
// input: the checks after the migration read the result.
function migratedRecord(run: Record<string, unknown>, slices: Record<string, unknown>, hollow: string): Record<string, unknown> {
  const map = isRecord(run.map) ? run.map : {};
  const route = Array.isArray(map.route) ? map.route : [];
  const stop = typeof run.shipIndex === 'number' ? route[run.shipIndex] : undefined;
  const memory = (Array.isArray(slices.memory) ? slices.memory : []) as Segment[];
  const pool = memory.find((seg) => seg.type === 'redundancy') as { used?: unknown } | undefined;
  return {
    hollow, you: 'reassignment', rootUnits: run.hollowUnits,
    finalSlot: map.world === 'arm' && isRecord(stop) ? stop.slot : null,
    finalShip: isRecord(slices.level) ? slices.level.shipName : null,
    finalYear: map.galaxyYear,
    stay: null,
    kit: FS_TOOL_KINDS.filter((kind) => hasUsableTool(memory, kind, 'counts')),
    fuelPct: null,
    charge: pool?.used ?? 0,
  };
}

// 6 → 7 (slice 7a, one bump for its three tracks and 7b: slice-7-plan R2, R16). Before slice 7 a won run had one step, and
// CONTROL stood the unit by for reassignment, so a decided finale migrates to its step 1 and REASSIGNMENT:
// • a world payload's hollow.finale: 'purged' → PURGE, 'merged' → MERGE (restored: the pods restored in place), each with
//   the root fallen; 'unresolved' → followed, the root standing; all three 'done' with REASSIGNMENT. 'none' and 'duel' stay
//   (a v6 'choice' never stood at a save point; read as step 1 after the fall). restoredHalf goes, STAY's ship and the
//   card's AI second are null, and a typed ending's choice becomes { hollow, you };
// • its landing slice: THE LAST LANDING null (7b's, R2);
// • every ended ship's pods (run.ships[], in a world and a boot payload): each featured colonist's bio line null (R21: the
//   epilogue's payoff then falls back);
// • a decided finale's ending record (review M4: FinaleState.record, migratedRecord); null for any other phase;
// • run.lastUnit.ending by META 4's rule (meta-parse endingOfV3LastUnit).
function migrateRunSave6(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const slices = payload !== null && isRecord(payload.slices) ? payload.slices : null;
  if (slices !== null && isRecord(slices.hollow) && isRecord(slices.hollow.finale)) {
    const old = slices.hollow.finale;
    const decided: Record<string, { hollow: string; rootFell: boolean }> = {
      purged: { hollow: 'purge', rootFell: true }, merged: { hollow: 'merge', rootFell: true }, unresolved: { hollow: 'followed', rootFell: false },
    };
    const done = typeof old.phase === 'string' ? decided[old.phase] : undefined;
    const ending = isRecord(old.ending) && done !== undefined ? { ...old.ending, choice: { hollow: done.hollow, you: 'reassignment' } } : old.ending;
    const finale: Record<string, unknown> = {
      phase: done !== undefined ? 'done' : old.phase === 'choice' ? 'step1' : old.phase,
      rootFell: done?.rootFell ?? old.phase === 'choice',
      hollow: done?.hollow ?? null,
      you: done !== undefined ? 'reassignment' : null,
      stay: null,
      restored: old.phase === 'merged' && Array.isArray(old.restoredInPlace) ? old.restoredInPlace : [],
      cardAtAi: null,
      ending,
      unresolvedUntilAi: old.unresolvedUntilAi,
      record: done !== undefined && isRecord(payload!.run) ? migratedRecord(payload!.run, slices, done.hollow) : null,
    };
    slices.hollow.finale = finale;
  }
  if (slices !== null && isRecord(slices.landing)) slices.landing.lastLanding = null;
  if (payload !== null && isRecord(payload.run)) {
    const run = payload.run;
    if (Array.isArray(run.ships)) {
      for (const ship of run.ships.filter(isRecord)) {
        if (!Array.isArray(ship.pods)) continue;
        for (const pod of ship.pods.filter(isRecord)) {
          if (Array.isArray(pod.featured)) for (const colonist of pod.featured.filter(isRecord)) colonist.line = null;
        }
      }
    }
    if (isRecord(run.lastUnit)) run.lastUnit.ending = endingOfV3LastUnit(run.lastUnit);
  }
  next.saveVersion = 7;
  return next;
}

// 7 → 8 (slice 7c, one bump for its three tracks: slice-7-plan R2, §2.2 7c). No v7 run played a trace or another book:
// • run.traces: none (noTraces): a v7 run started before traces existed played without them;
// • run.log.book: 046.log, the book every v7 run read (keeping the book the kid was reading is the truth);
// • run.arrival (a boot point's, when set): no trace line, no gift charge.
// run.hollowUnits keeps its meaning (who HOLLOW is mid-run), so a v7 run 2 resumed under v8 keeps the HOLLOW it met.
function migrateRunSave7(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const run = payload !== null && isRecord(payload.run) ? payload.run : null;
  if (run !== null) {
    run.traces = noTraces();
    if (isRecord(run.log)) run.log.book = { kind: '046' };
    if (isRecord(run.arrival)) {
      run.arrival.traceLines = [];
      run.arrival.giftCharge = 0;
    }
  }
  next.saveVersion = 8;
  return next;
}

// 8 → 9 (slice 7d, one bump: slice-7-plan R2, §2.2 7d). Before 7d only a departed resident's note found a signal, one
// fragment each (slice 5's R18), so every record is a note's: `source` 'note', `n` 1. No v8 memory holds the `▓▓░▓` file
// (SegmentType 'signal'), and the old colony's letter is derived from the route, never stored.
// Slice 8 POLISH (the 7d review's NOTED edge): an old colony `?` ship the run had already booted on carries a letter now that
// it never had then. Its id goes into run.inbox.read, so a resumed run does not flag that old mail new at a boot long past.
// A stop whose boot is still to come (the last stop of a BEAM or RUN START save, replayed from its boot) keeps its letter to
// be read there.
function migrateRunSave8(save: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(save);
  const payload = isRecord(next.payload) ? next.payload : null;
  const run = payload !== null && isRecord(payload.run) ? payload.run : null;
  if (run !== null && isRecord(run.residents) && Array.isArray(run.residents.signals)) {
    for (const record of run.residents.signals.filter(isRecord)) {
      record.source = 'note';
      record.n = 1;
    }
  }
  const map = run !== null && isRecord(run.map) ? run.map : null;
  const inbox = run !== null && isRecord(run.inbox) ? run.inbox : null;
  if (map !== null && Array.isArray(map.route) && Array.isArray(map.arm) && inbox !== null && Array.isArray(inbox.read)) {
    const pending = next.point === 'beam' || next.point === 'run-start' ? 1 : 0;
    for (const stop of map.route.slice(0, Math.max(0, map.route.length - pending)).filter(isRecord)) {
      const ship = typeof stop.slot === 'number' ? map.arm[stop.slot] : undefined;
      const id = `old-colony:${String(stop.slot)}`;
      if (isRecord(ship) && isRecord(ship.reserved) && ship.reserved.unknownEvent === 'old-colony' && !inbox.read.includes(id)) inbox.read.push(id);
    }
  }
  next.saveVersion = 9;
  return next;
}

export const RUN_SAVE_MIGRATIONS: Readonly<Record<number, (save: Record<string, unknown>) => Record<string, unknown>>> = {
  1: migrateRunSave1,
  2: migrateRunSave2,
  3: migrateRunSave3,
  4: migrateRunSave4,
  5: migrateRunSave5,
  6: migrateRunSave6,
  7: migrateRunSave7,
  8: migrateRunSave8,
};

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
    if (save.point === 'ending-chosen' && (!slices.landing.finalShip || slices.hollow.finale.phase !== 'done')) {
      return refuse('route', `ENDING CHOSEN on ${current} with the finale '${slices.hollow.finale.phase}'`);
    }
    const finale = finaleRefusal(save.point, slices.hollow.finale, slices.landing, run, currentSlot(run));
    if (finale !== null) return refuse('shape', finale);
  }
  return { ok: true, save };
}

// The FINALE against the point and the ship (slice 7a, R2, R7–R9, R14), or what is wrong:
// • SHIP DONE is on a ship whose FINALE never opened ('none'); ENDING CHOSEN is 'done' (decodeRunSave's route check);
// • a decided FINALE has both choices, and its root fell exactly when step 1 was not 'followed'; SPARE rules out SUNSET;
// • STAY names a ship (a slot of an ended ship, or the final ship's), and nothing else names one;
// • the pods MERGE gave back are pods of this ship restored by it (7a's interim restores in place, so their driver is no
//   longer lost: their records say `restored`);
// • STAY's ship is ★ ON TARGET (review m2): an ended ship by its summaries (ending-rules shipOnTarget), the final ship by
//   its live pods (landing-rules podsOnTarget). At ENDING CHOSEN the final tally is never lower than at the confirm: MERGE's
//   restored pods only add soft LZ landings, as every colonist already counts in the denominator.
// • CONTACT holds its SIGNALS_FOR_CONTACT signals (7d: held, never spent);
// • the record is frozen at the confirm ('verdict', FINALE D11), so a finale from 'verdict' on ('last-landing', 'done')
//   holds its ending record, which agrees with its choices, and one before the confirm none (review M4, m1).
// Exported for ending/foundation (no save point falls in 'verdict' or 'last-landing', so only a direct call reaches them).
export function finaleRefusal(
  point: SavePoint, finale: Readonly<FinaleState>, landing: Readonly<ShipSlices['landing']>, run: Readonly<RunState>, slot: number,
): string | null {
  if (point === 'ship-done' && finale.phase !== 'none') return `SHIP DONE with the finale '${finale.phase}'`;
  if (finale.phase === 'done') {
    if (finale.hollow === null || finale.you === null) return 'a decided finale without both choices';
    if (finale.rootFell !== (finale.hollow !== 'followed')) return `the root ${finale.rootFell ? 'fell' : 'stands'} with step 1 '${finale.hollow}'`;
  }
  if (finale.hollow === 'spare' && finale.you === 'sunset') return 'SPARE with SUNSET (SPARE gives the root the ship)';
  if ((finale.you === 'stay') !== (finale.stay !== null)) return `STAY's ship is ${finale.stay === null ? 'missing' : 'set without STAY'}`;
  if (finale.stay !== null && finale.stay !== slot && !run.ships.some((ship) => ship.slot === finale.stay)) return `STAY names slot ${finale.stay}, no ship of this run`;
  if (finale.stay !== null) {
    const ended = run.ships.find((ship) => ship.slot === finale.stay);
    const onTarget = ended !== undefined ? shipOnTarget(ended) : podsOnTarget(landing.pods);
    if (!onTarget) return `STAY names slot ${finale.stay}, not a ★ ON TARGET ship of this run`;
  }
  // Slice 7d (R41): CONTACT's price is held, not spent, so a CONTACT ending holds SIGNALS_FOR_CONTACT fragments still.
  if (finale.you === 'contact' && signalCount(run) < SIGNALS_FOR_CONTACT) return `CONTACT with ${signalCount(run)} of ${SIGNALS_FOR_CONTACT} signals`;
  const restorable = new Set(landing.pods.filter((record) => record.restored).map((record) => record.pod));
  const stray = finale.restored.find((pod) => !restorable.has(pod));
  if (stray !== undefined) return `MERGE restored pod ${stray}, which it never gave back`;
  // Review M4 / FINALE D11 (m1): the record is frozen at the confirm ('verdict'), so it stands through 'verdict',
  // 'last-landing' and 'done' (no save point falls in the first two: R14), and before the confirm there is none.
  const record = finale.record;
  const decided = finale.phase === 'verdict' || finale.phase === 'last-landing' || finale.phase === 'done';
  if (!decided) return record === null ? null : `an ending record before the confirm ('${finale.phase}')`;
  if (record === null) return 'a decided finale without its ending record';
  if (record.hollow !== finale.hollow || record.you !== finale.you || (record.stay?.slot ?? null) !== finale.stay) {
    return `the ending record (${record.hollow} + ${record.you}) is not the finale's (${finale.hollow} + ${finale.you})`;
  }
  return null;
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
