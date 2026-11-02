// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Store } from '@state/store';
import type { GameState, RunEndCause, RunStats, ArchiveStatus, RunState, ShipOutcome } from '@state/schema';
import type {
  LastCause, LastUnit, UnitStats, UnitTrail, TrailStop, TrailLost, ArmState, ColonyRecord, RouteRecord, NotableEvent, MapHistory,
} from '@/types/lineage';
import type { StorageProvider } from '@systems/storage';
import { runScore, runLanded } from '@systems/run-score';
import { emit, NO_PAYLOAD } from '@systems/events';
import { hollowUnitName, GHOST_LINE } from '@data/hollow-text';
import { CLASSIC_FIVE } from '@data/classic-five';
import { AUTHORED_SHIP_NAMES, FINAL_SHIP_NAMES } from '@data/ship-names';
import { EMPTY_HISTORY } from '@data/map-state';
import { trailOf, ghostPlaceReached } from '@systems/lineage';
import {
  META_STORAGE_KEY, META_VERSION, FIRST_UNIT_NUMBER, HOLLOW_NAME_MAX_UNITS,
} from '@data/tuning';

export type { LastCause, LastUnit, UnitStats } from '@/types/lineage';
export type { MetaStorage, StorageProvider } from '@systems/storage';
export { browserStorage } from '@systems/storage';
// The ghost's place moved to systems/lineage.ts (slice 3c plan §2.8 item 6: pure, and read by the chart too).
export { ghostShipIndex, ghostPlaceReached } from '@systems/lineage';

// The archive (§4.5, §9 WP8 item 4): the one thing that outlives a run. A local record of how many units
// ARRIVAL CONTROL has sent, the best SCORE, the endings seen, the run in progress and how the last unit
// ended. The next run reads it: you are UNIT-047 + runs on wave runs + 1, and HOLLOW is your last unit
// (hollowName, by how it ended), whose ghost greets you at a later boot: the ship where that unit's run ended, never
// ship 1 (ghostShipIndex; data/hollow-text.ts).
//
// • Run accounting: RECEIVE TRANSMISSION on a run's title is RUN START (archiveRunStarted): runs + 1, and
//   activeRun is set. Each later ship's start brings activeRun up to date (where the unit is, who woke, its
//   MOVEs and DELETEs), so a run left mid-ship still has a lineage: the next page load finds the leftover
//   activeRun and records it as lastUnit with cause 'abandoned' (loadMeta). RUN END (archiveRunEnded) writes
//   lastUnit and bestScore and clears activeRun. The run itself is never saved mid-ship (the title says so).
// • The tutorial is learned once (tutorialDone): the first time a unit locks (or accepts) an orbit, or reaches
//   a second ship, the archive notes that ARES-VII has been flown. Only then does a later run skip the run-1
//   lessons (§5.2). The unit and wave still count every run, an abandoned one too, so a kid who reloads two
//   seconds into their first run is UNIT-048 with a ghost, but plays the STASIS step and the ENGINE I/O
//   lesson again instead of being treated as a unit that knows the ship.
// • Loud, never quiet (Fran's no-silent-fallback rule; the lead's note): a read or a write that throws is
//   ARCHIVE OFFLINE (the game goes on, nothing more is written, and the screen says this unit will not be
//   kept; a write that fails mid-run also says so once in the game, 'archive-lost'). JSON that does not
//   parse or does not have the archive's shape is ARCHIVE CORRUPT: nothing is written over it, and the game
//   plays on without it (PLAY WITHOUT ARCHIVE, or just RECEIVE TRANSMISSION) unless the kid chooses WIPE
//   ARCHIVE for a fresh one. Nothing ever resets the archive by itself, and a session that could not load it
//   says so (state.archive.status) instead of pretending a fresh archive was the saved one.
// • Two tabs: each keeps its own session copy and writes it whole; the last write wins. A run in one tab
//   does not see the other's (documented, §9 WP8 edge cases).
// • The session copy still counts runs while nothing can be written (offline, corrupt, played without):
//   a NEW RUN in the same page is still UNIT-048, only it is not kept.
//
// • Archive v2 (phase 3 slice 3c, slice-3c-plan §2.4): a new key (META_STORAGE_KEY, `…/meta/v2`; v1's is never read), the
//   last unit's `landed` and trail (systems/lineage.ts trailOf) in place of `woke` and 3a's layer, the arm seed and the next
//   arm, colonies, routes, events, traces and the title's notes. The foundation laid the shape and its strict parse down;
//   Track SAVE fills the record steps (run end with the world update, the explicit abandon, v1 detection, the content reset).
//
// The pure half (loadMeta, saveMeta, the record* steps, lineageOf, hollowName) takes its storage as an
// argument, so the headless suites run it on stubs. The live half (openRunArchive and the archive* calls) holds
// the page's session; run.ts and boot.ts call it at the run's moments, never from a store listener.

// --- The record (§4.5's shape; archive v2, slice 3c plan §2.4) ---------------------------------------------

// How a unit's run ended, as the next run remembers it (§4.5's causes; the type is types/lineage.ts LastCause). (WP8's
// interim 'reassigned' is gone with that fleet: a record that holds it reads ARCHIVE CORRUPT.)
export const LAST_CAUSES: readonly LastCause[] = [
  'won-purge', 'won-merge', 'unresolved', 'flagship-lost', 'overwritten', 'stayed', 'abandoned',
];
export type Ending = 'purge' | 'merge';
// Every ending there is (the title's ENDINGS n/2 counts against it).
export const ENDINGS: readonly Ending[] = ['purge', 'merge'];

// The run in progress (§4.5's { unit, startedAt }), brought up to date at each ship's start so a run left
// mid-ship can still be named on the next title (WP8 deviation: the fields after startedAt). Archive v2: `landed` (was
// `woke`), and the trail so far in place of 3a's layer / worldSlot (slice 3c foundation deviation: the trail, not a bare
// route, so an abandoned run's stops keep their outcomes and colonies, and its route is the stops' slots). The stop of the
// ship being flown has outcome null. null on the classic world (it keeps no trail).
export interface ActiveRun {
  unit: number;
  startedAt: number;
  shipName: string;
  landed: number;
  stats: UnitStats;
  hollowUnits: number[];
  trail: UnitTrail | null;
}

// Said once on the title, then cleared (3c plan §2.4): an older (v1) archive was found and not carried over; the stored
// arm was made by other content and the next run got a fresh roll (02 §10).
export interface ArchiveNotes {
  olderArchive: boolean;
  armReset: boolean;
}

export interface Meta {
  version: typeof META_VERSION;
  runs: number;
  bestScore: number;
  endingsSeen: Ending[];
  // RETIRES in 3c SAVE (plan risk 3, decided: MERGE's next-run thread is gone). Kept through the foundation so nothing
  // changes behaviour before Track SAVE's archive v2 lands; lineageOf then gives false and slice 7 deletes the code.
  mergeBonus: boolean;
  // A unit has flown ARES-VII through (see the header): later runs skip the run-1 lessons (WP8 fix round 1;
  // §4.5's shape has no field for it).
  tutorialDone: boolean;
  activeRun: ActiveRun | null;
  lastUnit: LastUnit | null;
  // Archive v2 (02 §3.12, 3c plan §2.4): the arm seed every run's arm is rolled from (a fresh archive takes the page's run
  // seed, so `?seed=N` on a cleared archive replays run 1 exactly), the next run's arm (null: run 1's assembled arm, rebuilt
  // from armSeed on demand), the colonies (at most COLONY_HISTORY_MAX_PER_WORLD per world), the last ROUTE_HISTORY_RUNS
  // routes, the last run's notable events (at most NOTABLE_EVENTS_MAX), slice 7's traces, and the title's one-off notes.
  armSeed: number;
  arm: ArmState | null;
  colonies: ColonyRecord[];
  routes: RouteRecord[];
  events: NotableEvent[];
  traces: [];
  notes: ArchiveNotes;
}

// An empty archive. `armSeed`: the page's run seed (state/instance.ts); suites that don't care take 0.
export function freshMeta(armSeed = 0): Meta {
  return {
    version: META_VERSION, runs: 0, bestScore: 0, endingsSeen: [], mergeBonus: false, tutorialDone: false, activeRun: null, lastUnit: null,
    armSeed: armSeed >>> 0, arm: null, colonies: [], routes: [], events: [], traces: [], notes: { olderArchive: false, armReset: false },
  };
}

// --- Parsing: the archive's shape, checked field by field --------------------------------------------

export class MetaCorrupt extends Error {}

function corrupt(why: string): never {
  throw new MetaCorrupt(`archive: ${why}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) corrupt(`${field} is not a whole number`);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') corrupt(`${field} is not a name`);
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') corrupt(`${field} is not true or false`);
  return value;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) corrupt(`${field} is not a list`);
  return value;
}

// A record with exactly these keys (archive v2 is strict: an extra key is a shape this build does not know).
function exactRecord(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) corrupt(`${field} is not a record`);
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (extra.length > 0) corrupt(`${field} has unknown fields (${extra.join(', ')})`);
  return value;
}

const SHIP_OUTCOMES: readonly ShipOutcome[] = ['locked', 'partial', 'stranded', 'escaped', 'crashed', 'abandoned', 'emergency'];

function lastCause(value: unknown, field: string): LastCause {
  if (typeof value !== 'string' || !(LAST_CAUSES as readonly string[]).includes(value)) corrupt(`${field} '${String(value)}' is unknown`);
  return value as LastCause;
}

function parseTrailStop(value: unknown, field: string): TrailStop {
  const stop = exactRecord(value, field, ['slot', 'shipName', 'year', 'outcome', 'landed', 'colony', 'writer']);
  const outcome = stop.outcome;
  if (outcome !== null && !(SHIP_OUTCOMES as readonly unknown[]).includes(outcome)) corrupt(`${field}.outcome '${String(outcome)}' is unknown`);
  let writer: TrailStop['writer'] = null;
  if (stop.writer !== null) {
    const w = exactRecord(stop.writer, `${field}.writer`, ['name', 'age']);
    writer = { name: text(w.name, `${field}.writer.name`), age: wholeNumber(w.age, `${field}.writer.age`) };
  }
  return {
    slot: wholeNumber(stop.slot, `${field}.slot`),
    shipName: stop.shipName === null ? null : text(stop.shipName, `${field}.shipName`),
    year: wholeNumber(stop.year, `${field}.year`),
    outcome: outcome as ShipOutcome | null,
    landed: wholeNumber(stop.landed, `${field}.landed`),
    colony: stop.colony === null ? null : text(stop.colony, `${field}.colony`),
    writer,
  };
}

function parseTrail(value: unknown, field: string): UnitTrail | null {
  if (value === null) return null;
  const trail = exactRecord(value, field, ['unit', 'run', 'startYear', 'stops', 'lost']);
  let lost: TrailLost | null = null;
  if (trail.lost !== null) {
    const l = exactRecord(trail.lost, `${field}.lost`, ['slot', 'year', 'pastLy', 'cause']);
    if (typeof l.pastLy !== 'number' || !Number.isFinite(l.pastLy) || l.pastLy < 0) corrupt(`${field}.lost.pastLy is not a distance`);
    lost = { slot: wholeNumber(l.slot, `${field}.lost.slot`), year: wholeNumber(l.year, `${field}.lost.year`), pastLy: l.pastLy, cause: lastCause(l.cause, `${field}.lost.cause`) };
  }
  const stops = list(trail.stops, `${field}.stops`).map((stop, i) => parseTrailStop(stop, `${field}.stops[${i}]`));
  if (stops.length === 0) corrupt(`${field}.stops is empty`);
  return {
    unit: wholeNumber(trail.unit, `${field}.unit`), run: wholeNumber(trail.run, `${field}.run`),
    startYear: wholeNumber(trail.startYear, `${field}.startYear`), stops, lost,
  };
}

function parseColony(value: unknown, field: string): ColonyRecord {
  const c = exactRecord(value, field, ['run', 'unit', 'slot', 'year', 'landed', 'name']);
  return {
    run: wholeNumber(c.run, `${field}.run`), unit: wholeNumber(c.unit, `${field}.unit`), slot: wholeNumber(c.slot, `${field}.slot`),
    year: wholeNumber(c.year, `${field}.year`), landed: wholeNumber(c.landed, `${field}.landed`), name: text(c.name, `${field}.name`),
  };
}

function parseRoute(value: unknown, field: string): RouteRecord {
  const r = exactRecord(value, field, ['run', 'unit', 'slots']);
  return {
    run: wholeNumber(r.run, `${field}.run`), unit: wholeNumber(r.unit, `${field}.unit`),
    slots: list(r.slots, `${field}.slots`).map((slot, i) => wholeNumber(slot, `${field}.slots[${i}]`)),
  };
}

const EVENT_KINDS: readonly NotableEvent['kind'][] = ['deal-accepted', 'best-colony', 'ship-lost'];

function parseEvent(value: unknown, field: string): NotableEvent {
  const e = exactRecord(value, field, ['kind', 'slot', 'shipName', 'value']);
  if (!(EVENT_KINDS as readonly unknown[]).includes(e.kind)) corrupt(`${field}.kind '${String(e.kind)}' is unknown`);
  return { kind: e.kind as NotableEvent['kind'], slot: wholeNumber(e.slot, `${field}.slot`), shipName: text(e.shipName, `${field}.shipName`), value: wholeNumber(e.value, `${field}.value`) };
}

// The stored next arm. TODO(3c-SAVE): its strict parse (the ArmShip fields, then validateShipDef(shipDefOf(ship)) on every
// ship and the content versions, a mismatch being a content reset, plan §2.4). Nothing writes one before Track SAVE, so
// until then any arm is a shape this build can't read.
function parseArm(value: unknown): ArmState | null {
  if (value === null) return null;
  return corrupt('arm is not readable yet (TODO(3c-SAVE))');
}

function unitList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) corrupt(`${field} is not a list of units`);
  return value.map((unit, i) => wholeNumber(unit, `${field}[${i}]`));
}

function unitStats(value: unknown, field: string): UnitStats {
  if (!isRecord(value)) corrupt(`${field} is not a record`);
  return { moves: wholeNumber(value.moves, `${field}.moves`), deletes: wholeNumber(value.deletes, `${field}.deletes`) };
}

function parseLastUnit(value: unknown): LastUnit | null {
  if (value === null) return null;
  const unit = exactRecord(value, 'lastUnit', ['number', 'landed', 'shipName', 'cause', 'stats', 'hollowUnits', 'trail', 'skills']);
  if (unit.skills !== null) corrupt('lastUnit.skills is not null (slice 4 fills it)');
  return {
    number: wholeNumber(unit.number, 'lastUnit.number'),
    landed: wholeNumber(unit.landed, 'lastUnit.landed'),
    shipName: text(unit.shipName, 'lastUnit.shipName'),
    cause: lastCause(unit.cause, 'lastUnit.cause'),
    stats: unitStats(unit.stats, 'lastUnit.stats'),
    hollowUnits: unitList(unit.hollowUnits, 'lastUnit.hollowUnits'),
    trail: parseTrail(unit.trail, 'lastUnit.trail'),
    skills: null,
  };
}

function parseActiveRun(value: unknown): ActiveRun | null {
  if (value === null) return null;
  const run = exactRecord(value, 'activeRun', ['unit', 'startedAt', 'shipName', 'landed', 'stats', 'hollowUnits', 'trail']);
  return {
    unit: wholeNumber(run.unit, 'activeRun.unit'),
    startedAt: wholeNumber(run.startedAt, 'activeRun.startedAt'),
    shipName: text(run.shipName, 'activeRun.shipName'),
    landed: wholeNumber(run.landed, 'activeRun.landed'),
    stats: unitStats(run.stats, 'activeRun.stats'),
    hollowUnits: unitList(run.hollowUnits, 'activeRun.hollowUnits'),
    trail: parseTrail(run.trail, 'activeRun.trail'),
  };
}

// The archive's JSON as a Meta, or MetaCorrupt with what was wrong. Strict: a field missing, of the wrong
// type or out of range is corrupt, never a default (a half-read archive would be a quiet reset of that half).
export function parseMeta(raw: string): Meta {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return corrupt(`not JSON (${(error as Error).message})`);
  }
  if (!isRecord(data)) return corrupt('not a record');
  if (data.version !== META_VERSION) return corrupt(`version ${String(data.version)}, not ${META_VERSION}`);
  exactRecord(data, 'the archive', [
    'version', 'runs', 'bestScore', 'endingsSeen', 'mergeBonus', 'tutorialDone', 'activeRun', 'lastUnit', 'armSeed', 'arm', 'colonies',
    'routes', 'events', 'traces', 'notes',
  ]);
  const endings = data.endingsSeen;
  if (!Array.isArray(endings) || endings.some((ending) => !(ENDINGS as readonly unknown[]).includes(ending))) corrupt('endingsSeen is not a list of endings');
  if (list(data.traces, 'traces').length > 0) corrupt('traces is not empty (slice 7 places them)');
  const notes = exactRecord(data.notes, 'notes', ['olderArchive', 'armReset']);
  return {
    version: META_VERSION,
    runs: wholeNumber(data.runs, 'runs'),
    bestScore: wholeNumber(data.bestScore, 'bestScore'),
    endingsSeen: [...(endings as Ending[])],
    mergeBonus: flag(data.mergeBonus, 'mergeBonus'),
    tutorialDone: flag(data.tutorialDone, 'tutorialDone'),
    activeRun: parseActiveRun(data.activeRun),
    lastUnit: parseLastUnit(data.lastUnit),
    armSeed: wholeNumber(data.armSeed, 'armSeed'),
    arm: parseArm(data.arm),
    colonies: list(data.colonies, 'colonies').map((colony, i) => parseColony(colony, `colonies[${i}]`)),
    routes: list(data.routes, 'routes').map((route, i) => parseRoute(route, `routes[${i}]`)),
    events: list(data.events, 'events').map((event, i) => parseEvent(event, `events[${i}]`)),
    traces: [],
    notes: { olderArchive: flag(notes.olderArchive, 'notes.olderArchive'), armReset: flag(notes.armReset, 'notes.armReset') },
  };
}

// --- Storage (systems/storage.ts holds the provider since slice 3c; re-exported above) ------------------------

export type LoadResult =
  | { ok: true; meta: Meta; recovered: boolean }
  | { ok: false; reason: 'unavailable' | 'corrupt'; detail: string };

// A run left without a RUN END (the page closed or reloaded mid-run) is the last unit, 'abandoned' where it
// was when its last ship started. TODO(3c-SAVE): explicit (abandonActiveRun, with the world update), plan §2.2.
function abandon(run: ActiveRun): LastUnit {
  return {
    number: run.unit, landed: run.landed, shipName: run.shipName, cause: 'abandoned', stats: { ...run.stats },
    hollowUnits: [...run.hollowUnits], trail: run.trail === null ? null : structuredClone(run.trail), skills: null,
  };
}

// Reads the archive. Nothing stored yet is a fresh archive (a first run is not a failure). A leftover
// activeRun is recorded as lastUnit 'abandoned' and cleared (`recovered`: the caller writes it back).
export function loadMeta(storage: StorageProvider): LoadResult {
  let raw: string | null;
  try {
    raw = storage().getItem(META_STORAGE_KEY);
  } catch (error) {
    return { ok: false, reason: 'unavailable', detail: (error as Error).message };
  }
  if (raw === null) return { ok: true, meta: freshMeta(), recovered: false };
  let meta: Meta;
  try {
    meta = parseMeta(raw);
  } catch (error) {
    if (error instanceof MetaCorrupt) return { ok: false, reason: 'corrupt', detail: error.message };
    throw error;
  }
  if (meta.activeRun === null) return { ok: true, meta, recovered: false };
  return { ok: true, meta: { ...meta, lastUnit: abandon(meta.activeRun), activeRun: null }, recovered: true };
}

export type MetaWriteStatus = 'ok' | 'unavailable';

export function saveMeta(storage: StorageProvider, meta: Readonly<Meta>): MetaWriteStatus {
  try {
    storage().setItem(META_STORAGE_KEY, JSON.stringify(meta));
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

// --- The run's moments, as pure steps on a Meta ---------------------------------------------------------

export function unitStatsOf(stats: Readonly<RunStats>): UnitStats {
  return { moves: stats.moves, deletes: stats.deletes };
}

// Where the unit is now, for activeRun (and a run left there).
export interface RunProgress {
  unit: number;
  shipName: string;
  landed: number;
  stats: UnitStats;
  hollowUnits: readonly number[];
  trail: UnitTrail | null;   // the run so far (systems/lineage.ts trailOf); null on the classic world
}

export function recordRunStart(meta: Readonly<Meta>, progress: RunProgress, now: number): Meta {
  return { ...meta, runs: meta.runs + 1, activeRun: { ...activeOf(progress), startedAt: Math.max(0, Math.floor(now)) } };
}

function activeOf(progress: RunProgress): Omit<ActiveRun, 'startedAt'> {
  return {
    unit: progress.unit, shipName: progress.shipName, landed: progress.landed, stats: { ...progress.stats },
    hollowUnits: [...progress.hollowUnits], trail: progress.trail === null ? null : structuredClone(progress.trail),
  };
}

// A later ship starts: activeRun says where the unit is. Throws when no run was started (a bug: RUN START
// always comes first).
export function recordShipStart(meta: Readonly<Meta>, progress: RunProgress): Meta {
  if (meta.activeRun === null) throw new Error('recordShipStart: no run was started');
  return { ...meta, activeRun: { ...activeOf(progress), startedAt: meta.activeRun.startedAt } };
}

// A unit has flown ARES-VII through (an orbit locked or accepted, or a second ship reached): from the next
// run on, the run-1 lessons are skipped (see the header).
export function recordTutorialDone(meta: Readonly<Meta>): Meta {
  return { ...meta, tutorialDone: true };
}

export interface RunEnd extends RunProgress {
  cause: LastCause;
  score: number;
}

export function recordRunEnd(meta: Readonly<Meta>, end: RunEnd): Meta {
  const endingsSeen = [...meta.endingsSeen];
  const ending: Ending | null = end.cause === 'won-purge' ? 'purge' : end.cause === 'won-merge' ? 'merge' : null;
  if (ending !== null && !endingsSeen.includes(ending)) endingsSeen.push(ending);
  return {
    ...meta,
    bestScore: Math.max(meta.bestScore, Math.round(end.score)),
    endingsSeen,
    // §4.5: a MERGE gives the next run its bonus (WP11 applies it); any other ending uses it up.
    mergeBonus: end.cause === 'won-merge',
    activeRun: null,
    // TODO(3c-SAVE): the colonies, routes, events and the updated arm (plan §2.4 "Run end").
    lastUnit: {
      number: end.unit, landed: end.landed, shipName: end.shipName, cause: end.cause, stats: { ...end.stats },
      hollowUnits: [...end.hollowUnits], trail: end.trail === null ? null : structuredClone(end.trail), skills: null,
    },
  };
}

// RUN END's cause as the archive keeps it (§4.5 item 6): one for one, now that the fleet ends with the flagship.
export function lastCauseOf(cause: RunEndCause): LastCause {
  return cause;
}

// --- Lineage: who this run's unit is, and who HOLLOW is -------------------------------------------------

// What a run starts with from the archive (§4.5): its unit and wave, the last unit, HOLLOW's units, whether a unit
// before it has flown the tutorial (tutorialDone), and whether the last run ended in a MERGE (WP11: this run's Core
// starts with MERGE_BONUS_CORE_CAPACITY threads and a faint permanent shimmer; retires with 3c SAVE's archive v2, risk 3:
// the field stays, always false, until slice 7 deletes it). Slice 3c: the arm seed, the arm the run starts on (null: run
// 1's assembled arm, or a fresh roll where no arm is stored) and what the runs before left on the map (RunMapState.history).
export interface RunLineage {
  unitNumber: number;
  wave: number;
  lastUnit: LastUnit | null;
  hollowUnits: number[];
  tutorialDone: boolean;
  mergeBonus: boolean;
  armSeed: number;
  arm: ArmState | null;
  history: MapHistory;
}

// HOLLOW's units after `lastUnit` (§4.5's table): on the first run the unit before 047 (UNIT-046); after a
// unit that STAYED, the HOLLOW that unit faced; after a MERGE, that HOLLOW and the unit together (the newest
// HOLLOW_NAME_MAX_UNITS of them); after every other ending, the last unit itself.
export function hollowUnitsAfter(lastUnit: LastUnit | null): number[] {
  if (lastUnit === null) return [FIRST_UNIT_NUMBER - 1];
  if (lastUnit.cause === 'stayed') return [...lastUnit.hollowUnits];
  if (lastUnit.cause === 'won-merge') return [...lastUnit.hollowUnits, lastUnit.number].slice(-HOLLOW_NAME_MAX_UNITS);
  return [lastUnit.number];
}

// §4.5's `hollowName()`: who HOLLOW is on the run after `lastUnit`.
export function hollowName(lastUnit: LastUnit | null): string {
  return hollowUnitName(hollowUnitsAfter(lastUnit));
}

export function lineageOf(meta: Readonly<Meta>): RunLineage {
  return {
    unitNumber: FIRST_UNIT_NUMBER + meta.runs,
    wave: meta.runs + 1,
    lastUnit: meta.lastUnit === null ? null : structuredClone(meta.lastUnit),
    hollowUnits: hollowUnitsAfter(meta.lastUnit),
    tutorialDone: meta.tutorialDone,
    mergeBonus: meta.mergeBonus,
    armSeed: meta.armSeed,
    arm: meta.arm === null ? null : structuredClone(meta.arm),
    // TODO(3c-SAVE): the history from the archive (gap, departures, colonies, routes, the last unit's number), plan §2.4.
    history: structuredClone(EMPTY_HISTORY),
  };
}

// The first run's lineage (an empty archive): UNIT-047, wave 1, HOLLOW is UNIT-046. Headless worlds that
// have no archive start here explicitly (createInitialState's default, a NEW RUN in a suite).
export const FIRST_RUN_LINEAGE: Readonly<RunLineage> = lineageOf(freshMeta());

// The fleet's first wave: no unit came before this one (no ghost, HOLLOW is UNIT-046, no ENDINGS line). What
// a returning unit knows is a different question (playsTutorial): a run left before ARES-VII was flown
// counts as a wave, but taught nothing.
export function isFirstRun(run: Readonly<Pick<RunState, 'wave'>>): boolean {
  return run.wave === 1;
}

// This run plays the run-1 lessons and the written ARES-VII (the STASIS step, the ENGINE I/O lesson in three
// steps, the hurt C09, the simulation retry, REPAIR earned by looking inside): no unit has flown ARES-VII
// through yet (Meta.tutorialDone). Every other run is a returning unit (§5.2: the archive opens at the boot,
// REPAIR is licensed there, the ship-1 lessons are one hint each, ship 1 is reseeded).
export function playsTutorial(run: Readonly<Pick<RunState, 'tutorial'>>): boolean {
  return run.tutorial;
}

// How HOLLOW names a ship it lost (the flagship-lost ghost line): LAST LIGHT is `the flagship`. Only a flagship's loss
// ends a run that way now (systems/run.ts lossPlan); a record from before LAST LIGHT existed named its last ship, and
// is read as HOLLOW would say any other ship's name, lowercase.
// The arm's final ships have their own names (LAST LIGHT on run 1, then data/ship-names.ts FINAL_SHIP_NAMES by run).
function lostShipWords(shipName: string): string {
  const ship = CLASSIC_FIVE.find((candidate) => candidate.name === shipName);
  const finalName = shipName === AUTHORED_SHIP_NAMES[AUTHORED_SHIP_NAMES.length - 1] || FINAL_SHIP_NAMES.includes(shipName);
  return ship?.final === true || finalName ? 'the flagship' : shipName.toLowerCase();
}

// The ghost's line for a unit `us` whose last unit was `lastUnit` (§4.5's table), or null: the first run has
// no ghost, and a unit that stayed with its colonists did not become one.
export function ghostLine(us: number, lastUnit: LastUnit | null): string | null {
  if (lastUnit === null) return null;
  const line = GHOST_LINE[lastUnit.cause];
  return line === null ? null : line({ us, last: lastUnit, hollow: hollowUnitsAfter(lastUnit), lostShip: lostShipWords(lastUnit.shipName) });
}

// The ghost's line on this run's current boot, or null: the run has a ghost (ghostLine), it has not spoken yet this run,
// and this ship is at or past where it speaks (ghostPlaceReached). `map` is optional so the archive's own suites can ask
// with a bare run (the classic rule).
export function ghostLineDue(
  run: Readonly<Pick<RunState, 'unitNumber' | 'lastUnit' | 'shipIndex' | 'ghostSpoken'> & Partial<Pick<RunState, 'map'>>>,
): string | null {
  if (run.ghostSpoken || run.lastUnit === null || !ghostPlaceReached(run, run.lastUnit)) return null;
  return ghostLine(run.unitNumber, run.lastUnit);
}

// --- The page's archive (the live half) ----------------------------------------------------------------

interface Session {
  provider: StorageProvider;
  meta: Meta;
  status: Exclude<ArchiveStatus, 'none'>;
}

let session: Session | null = null;

// Opens the page's archive of runs (state/instance.ts, before the store exists: the first title already names
// UNIT-048). Not the SOUL ARCHIVE of colonists (state/initial.ts openArchive unseals that one). A recovered
// activeRun is written back at once, so a page that is closed again before RUN START does not lose it.
// Returns the status the store starts with. A load that failed starts a fresh session copy (the run still
// has a unit number), and the status says the archive is not behind it; the console says why.
export function openRunArchive(provider: StorageProvider): ArchiveStatus {
  const loaded = loadMeta(provider);
  if (!loaded.ok) {
    session = { provider, meta: freshMeta(), status: loaded.reason === 'corrupt' ? 'corrupt' : 'offline' };
    console.error(`[archive] ${loaded.reason}: ${loaded.detail}`);
    return session.status;
  }
  session = { provider, meta: loaded.meta, status: 'ok' };
  if (loaded.recovered) write();
  return session.status;
}

// Forgets the page's archive (headless suites between scenarios).
export function closeArchive(): void {
  session = null;
}

function requireSession(): Session {
  if (!session) throw new Error('archive: not opened (state/instance.ts openRunArchive)');
  return session;
}

// The next run's lineage, from the session (NEW RUN: RUN END's button).
export function archiveLineage(): RunLineage {
  return lineageOf(requireSession().meta);
}

// The session's record, for ?debug and the title (best score, endings seen).
export function archiveMeta(): Readonly<Meta> {
  return requireSession().meta;
}

// Writes the session copy when the archive can be written; a write that throws turns the archive OFFLINE
// for the rest of the page and says so: the console, and 'archive-lost' for the game (one TERMINAL line and a
// buzz, data/script.ts; the footer's tag stays). Corrupt and played-without archives are never written.
function write(): void {
  const current = requireSession();
  if (current.status !== 'ok') return;
  if (saveMeta(current.provider, current.meta) === 'ok') return;
  current.status = 'offline';
  console.error('[archive] offline: a write failed; this unit will not be kept');
  emit('archive-lost', NO_PAYLOAD);
}

// The store's copy of the status follows the session's (one update, only on a change).
function syncStatus(store: Store<GameState>): void {
  const current = requireSession();
  if (store.getState().archive.status === current.status) return;
  store.update((draft) => { draft.archive = { status: current.status }; });
}

// A headless world with no archive opened says so (status 'none'): nothing to record. Anything else
// without a session is a bug and throws (requireSession).
function hasArchive(state: Readonly<GameState>): boolean {
  return state.archive.status !== 'none';
}

// Where the unit is now. `cause`: how the run ends (RUN END), or 'abandoned' for the run in progress (what a run left here
// would be recorded as).
function progressOf(state: Readonly<GameState>, cause: LastCause): RunProgress {
  return {
    unit: state.run.unitNumber,
    shipName: state.level.shipName,
    landed: runLanded(state.run.ships),
    stats: unitStatsOf(state.run.stats),
    hollowUnits: state.run.hollowUnits,
    // The trail (slice 3c): the next run's chart, ghost, letters and beacon read it (systems/lineage.ts unitTrailOf).
    trail: trailOf(state.run, cause),
  };
}

// RUN START: RECEIVE TRANSMISSION on a run's title (systems/boot.ts).
export function archiveRunStarted(store: Store<GameState>, now: number = Date.now()): void {
  if (!hasArchive(store.getState())) return;
  const current = requireSession();
  current.meta = recordRunStart(current.meta, progressOf(store.getState(), 'abandoned'), now);
  write();
  syncStatus(store);
}

// A later ship starts (systems/run.ts startShip): the run in progress is where the unit is now, and a unit
// on its second ship has flown ARES-VII through (one write for both).
export function archiveShipStarted(store: Store<GameState>): void {
  const state = store.getState();
  if (!hasArchive(state)) return;
  const current = requireSession();
  current.meta = recordShipStart(current.meta, progressOf(state, 'abandoned'));
  if (state.run.shipIndex > 0) current.meta = recordTutorialDone(current.meta);
  write();
  syncStatus(store);
}

// An orbit locked or accepted (systems/run.ts, after the tick): the unit has flown its ship through. Written
// once per archive; every later lock finds it done.
export function archiveTutorialDone(store: Store<GameState>): void {
  if (!hasArchive(store.getState())) return;
  const current = requireSession();
  if (current.meta.tutorialDone) return;
  current.meta = recordTutorialDone(current.meta);
  write();
  syncStatus(store);
}

// RUN END (systems/run.ts endRun): the last unit and the best score.
export function archiveRunEnded(store: Store<GameState>, cause: RunEndCause): void {
  const state = store.getState();
  if (!hasArchive(state)) return;
  const current = requireSession();
  current.meta = recordRunEnd(current.meta, { ...progressOf(state, lastCauseOf(cause)), cause: lastCauseOf(cause), score: runScore(state.run.ships) });
  write();
  syncStatus(store);
}

// ARCHIVE CORRUPT's two ways on (§4.5): WIPE ARCHIVE throws the bad record away for a fresh one (a remove
// that throws is OFFLINE), PLAY WITHOUT ARCHIVE keeps it untouched and writes nothing this page.
export function wipeArchive(store: Store<GameState>): void {
  const current = requireSession();
  if (current.status !== 'corrupt') throw new Error(`wipeArchive: the archive is ${current.status}, not corrupt`);
  current.meta = freshMeta();
  try {
    current.provider().removeItem(META_STORAGE_KEY);
    current.status = 'ok';
  } catch (error) {
    current.status = 'offline';
    console.error(`[archive] offline: the wipe failed (${(error as Error).message})`);
  }
  syncStatus(store);
}

export function playWithoutArchive(store: Store<GameState>): void {
  const current = requireSession();
  if (current.status !== 'corrupt') throw new Error(`playWithoutArchive: the archive is ${current.status}, not corrupt`);
  current.status = 'without';
  syncStatus(store);
}
