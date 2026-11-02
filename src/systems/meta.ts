// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Store } from '@state/store';
import type { GameState, RunEndCause, RunStats, ArchiveStatus, RunState } from '@state/schema';
import type {
  LastCause, LastUnit, UnitStats, UnitTrail, ArmState, ColonyRecord, RouteRecord, NotableEvent, LineageHistory, NextLaunch,
} from '@/types/lineage';
import type { StorageProvider } from '@systems/storage';
import {
  MetaCorrupt, corrupt, isRecord, wholeNumber, text, flag, list_, exactRecord, parseLastUnit, parseTrail, parseColony,
  parseRoute, parseEvent, unitList, unitStats,
} from '@systems/meta-parse';
import { runScore, runLanded } from '@systems/run-score';
import { emit, NO_PAYLOAD } from '@systems/events';
import { hollowUnitName, GHOST_LINE } from '@data/hollow-text';
import { CLASSIC_FIVE } from '@data/classic-five';
import { AUTHORED_SHIP_NAMES, FINAL_SHIP_NAMES } from '@data/ship-names';
import { shipDefOf, validateShipDef } from '@data/ships';
import { trailOf, ghostPlaceReached, mapHistoryOf, coloniesOf, notableEvents, visitsOfTrail } from '@systems/lineage';
import {
  updateArm, updateAfterRun, armStateOfMap, armContent, freshArmState, resetArmAfter, nextLaunchOf, type ArmUpdate,
} from '@systems/map-update';
import { createRunMap } from '@systems/map-run';
import {
  ShapeError, rec, whole, name as nameCheck, nullable, checkArmShip, checkDepartures,
} from '@systems/save-shape';
import {
  META_STORAGE_KEY, META_V1_KEY, META_VERSION, FIRST_UNIT_NUMBER, HOLLOW_NAME_MAX_UNITS, COLONY_HISTORY_MAX_PER_WORLD,
  ROUTE_HISTORY_RUNS, NOTABLE_EVENTS_MAX,
} from '@data/tuning';

export type { LastCause, LastUnit, UnitStats } from '@/types/lineage';
// The record's pure parsers moved to systems/meta-parse.ts (slice 3c review fix, minor 6: the run save's codec reads a last
// unit through them without importing this stateful module).
export { LAST_CAUSES, MetaCorrupt, parseLastUnit } from '@systems/meta-parse';
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
//   MOVEs and DELETEs; slice 3c: and at each SHIP DONE), so a run left mid-ship still has a lineage. Slice 3c made the
//   abandon explicit: the page's open sequence (state/instance.ts) records a leftover activeRun as lastUnit 'abandoned'
//   only when no run save can resume it (abandonActiveRun, with the world update: its ships count as done), and the
//   title's NEW RUN / ABANDON RUN over a save go the same way (systems/run-save.ts abandonRun). RUN END (archiveRunEnded)
//   writes lastUnit and bestScore, runs the world update, stores the next arm and clears activeRun. The run itself is
//   saved between ships (systems/save-write.ts), never mid-ship.
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
//   arm, colonies, routes, events, traces and the title's notes. Run end runs the world update (systems/map-update.ts) and
//   stores its arm; an abandoned run does too, with the ships it visited counted as done; a v1 archive is detected and not
//   carried over (notes.olderArchive); an arm made by other content is replaced by a fresh roll (notes.armReset, 02 §10).
//   `mergeBonus` is gone (plan risk 3, decided: MERGE's next-run thread retires): version 3 dropped it, and a version-2
//   record (the foundation's) is migrated in place (META_MIGRATIONS).
//
// The pure half (loadMeta, saveMeta, the record* steps, lineageOf, hollowName) takes its storage as an
// argument, so the headless suites run it on stubs. The live half (openRunArchive and the archive* calls) holds
// the page's session; run.ts and boot.ts call it at the run's moments, never from a store listener.

// --- The record (§4.5's shape; archive v2, slice 3c plan §2.4) ---------------------------------------------

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
  // A unit has flown ARES-VII through (see the header): later runs skip the run-1 lessons (WP8 fix round 1;
  // §4.5's shape has no field for it).
  tutorialDone: boolean;
  activeRun: ActiveRun | null;
  lastUnit: LastUnit | null;
  // Archive v2 (02 §3.12, 3c plan §2.4): the arm seed every run's arm is rolled from (a fresh archive takes the page's run
  // seed, so `?seed=N` on a cleared archive replays run 1 exactly; null, a headless archive's, means "the run seed": the
  // suites' worlds roll run 1's arm from their own seed, as before 3c), the next run's arm (null: run 1's assembled arm, rebuilt
  // from armSeed on demand), the colonies (at most COLONY_HISTORY_MAX_PER_WORLD per world), the last ROUTE_HISTORY_RUNS
  // routes, the last run's notable events (at most NOTABLE_EVENTS_MAX), slice 7's traces, and the title's one-off notes.
  armSeed: number | null;
  arm: ArmState | null;
  colonies: ColonyRecord[];
  routes: RouteRecord[];
  events: NotableEvent[];
  traces: [];
  notes: ArchiveNotes;
}

// An empty archive. `armSeed`: the page's run seed (state/instance.ts threads it through openRunArchive); null (the
// suites') means each run rolls from its own run seed (systems/map-run.ts createRunMap: `lineage.armSeed ?? seed`).
export function freshMeta(armSeed: number | null = null): Meta {
  return {
    version: META_VERSION, runs: 0, bestScore: 0, endingsSeen: [], tutorialDone: false, activeRun: null, lastUnit: null,
    armSeed: armSeed === null ? null : armSeed >>> 0, arm: null, colonies: [], routes: [], events: [], traces: [], notes: { olderArchive: false, armReset: false },
  };
}

// --- Parsing: the archive's shape, checked field by field --------------------------------------------


// The stored next arm (3c plan §2.4), strict. Its content versions are read first: an arm made by other content (another
// arm table, generator, update or map shape) is not corrupt, it is a content reset (02 §10: the next run gets a fresh roll;
// readMeta applies it), and its ships are not read at all (they may not build under this code). Only the fields the reset
// carries over are checked then (the arm seed, its run and start year, the final ships' serial and the last final).
// Otherwise every ArmShip is checked field by field (save-shape checkArmShip, the run save's own check) and must build
// (validateShipDef(shipDefOf(ship))): a ship of this build's content that does not build is a corrupt archive.
type ArmRead = { kind: 'arm'; arm: ArmState } | { kind: 'reset'; prev: ArmState };

const ARM_KEYS = ['armSeed', 'run', 'startYear', 'gap', 'valveYears', 'finalSerial', 'lastFinal', 'ships', 'departures', 'content'];
const checkArmHead = rec({
  armSeed: whole, run: whole, startYear: whole, gap: whole, valveYears: whole, finalSerial: whole,
  lastFinal: nullable(rec({ name: nameCheck, year: whole })),
  content: rec({ arm: whole, generator: whole, update: whole, mapState: whole }),
});

function shaped<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ShapeError) return corrupt(error.message);
    throw error;
  }
}

function parseArm(value: unknown): ArmRead | null {
  if (value === null) return null;
  const arm = exactRecord(value, 'arm', ARM_KEYS);
  const { ships, departures, ...head } = arm;
  shaped(() => checkArmHead(head, 'arm'));
  const scalars = head as Omit<ArmState, 'ships' | 'departures'>;
  if (!Array.isArray(ships)) return corrupt('arm.ships is not a list');
  if (JSON.stringify(scalars.content) !== JSON.stringify(armContent())) {
    return { kind: 'reset', prev: { ...structuredClone(scalars), ships: [], departures: [] } };
  }
  shaped(() => {
    ships.forEach((ship, slot) => checkArmShip(ship, `arm.ships[${slot}]`, slot));
    checkDepartures(departures, 'arm.departures');
  });
  for (const ship of ships as ArmState['ships']) {
    try {
      validateShipDef(shipDefOf(ship));
    } catch (error) {
      corrupt(`arm.ships[${ship.slot}] (${ship.name}) does not build: ${(error as Error).message}`);
    }
  }
  // In ArmState's own key order (a stored arm reads back byte for byte).
  const { content, ...rest } = structuredClone(scalars);
  return {
    kind: 'arm',
    arm: { ...rest, ships: structuredClone(ships) as ArmState['ships'], departures: structuredClone(departures) as ArmState['departures'], content },
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

// Archive migrations (slice 3c review follow-up): the key stays META_STORAGE_KEY for good, and a stored record of an older
// version is brought up to META_VERSION here, one version at a time, before the strict parse. Each step takes a record of
// version n and returns one of version n + 1 (a later slice's field gets its default here, never a quiet default in the
// parse). A version this build does not know (newer, or below the key's first) is corrupt. A new key is only for a
// deliberate reset (META_V1_KEY is the one there was).
// 2 → 3 (Track SAVE): the foundation's archives (version 2) are migrated, not reset (a playtest archive keeps its units):
// • `mergeBonus` is dropped (plan risk 3, decided: the run after a MERGE no longer gets its extra thread);
// • an arm seed of 0 with no stored arm is the foundation's placeholder (its page never passed the run seed in), not a
//   seed any arm was rolled from: it becomes null ("the run seed"), so the next run rolls from its own seed and the archive
//   takes that run's arm seed at its end. A run in progress then cannot be placed on an arm (its trail's slots belong to an
//   arm the archive can't rebuild): its trail goes, so abandoning it records where it was without a world update.
// A version-2 record never holds an arm (the foundation read any as corrupt), so nothing else changes.
export const META_MIGRATIONS: Readonly<Record<number, (record: Record<string, unknown>) => Record<string, unknown>>> = {
  2: (record) => {
    const { mergeBonus: _retired, ...rest } = record;
    void _retired;
    const placeholderSeed = rest.armSeed === 0 && rest.arm === null;
    const active = rest.activeRun;
    return {
      ...rest,
      version: 3,
      armSeed: placeholderSeed ? null : rest.armSeed,
      activeRun: placeholderSeed && isRecord(active) ? { ...active, trail: null } : active,
    };
  },
};
export const META_FIRST_VERSION = 2;

export function migrateMeta(record: Record<string, unknown>): Record<string, unknown> {
  let current = record;
  for (;;) {
    const version = current.version;
    if (version === META_VERSION) return current;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < META_FIRST_VERSION || version > META_VERSION) {
      return corrupt(`version ${String(version)}, this build reads ${META_FIRST_VERSION}–${META_VERSION}`);
    }
    const step = META_MIGRATIONS[version];
    if (step === undefined) return corrupt(`no migration from version ${version}`);
    const next = step(current);
    if (next.version !== version + 1) throw new Error(`migrateMeta: the step from ${version} made version ${String(next.version)}`);
    current = next;
  }
}

// The archive's JSON as a Meta, or MetaCorrupt with what was wrong. Strict: a field missing, of the wrong
// type or out of range is corrupt, never a default (a half-read archive would be a quiet reset of that half). An older
// version is migrated first (migrateMeta), and a stored arm made by other content is replaced (readMeta's content reset).
export function parseMeta(raw: string): Meta {
  return readMeta(raw).meta;
}

// parseMeta, and whether reading changed the record (a migration step or a content reset): the page writes it back.
export function readMeta(raw: string): { meta: Meta; changed: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return corrupt(`not JSON (${(error as Error).message})`);
  }
  if (!isRecord(parsed)) return corrupt('not a record');
  const data = migrateMeta(parsed);
  exactRecord(data, 'the archive', [
    'version', 'runs', 'bestScore', 'endingsSeen', 'tutorialDone', 'activeRun', 'lastUnit', 'armSeed', 'arm', 'colonies',
    'routes', 'events', 'traces', 'notes',
  ]);
  const endings = data.endingsSeen;
  if (!Array.isArray(endings) || endings.some((ending) => !(ENDINGS as readonly unknown[]).includes(ending))) corrupt('endingsSeen is not a list of endings');
  if (list_(data.traces, 'traces').length > 0) corrupt('traces is not empty (slice 7 places them)');
  const notes = exactRecord(data.notes, 'notes', ['olderArchive', 'armReset']);
  const meta: Meta = {
    version: META_VERSION,
    runs: wholeNumber(data.runs, 'runs'),
    bestScore: wholeNumber(data.bestScore, 'bestScore'),
    endingsSeen: [...(endings as Ending[])],
    tutorialDone: flag(data.tutorialDone, 'tutorialDone'),
    activeRun: parseActiveRun(data.activeRun),
    lastUnit: parseLastUnit(data.lastUnit),
    armSeed: data.armSeed === null ? null : wholeNumber(data.armSeed, 'armSeed'),
    arm: null,
    colonies: list_(data.colonies, 'colonies').map((colony, i) => parseColony(colony, `colonies[${i}]`)),
    routes: list_(data.routes, 'routes').map((route, i) => parseRoute(route, `routes[${i}]`)),
    events: list_(data.events, 'events').map((event, i) => parseEvent(event, `events[${i}]`)),
    traces: [],
    notes: { olderArchive: flag(notes.olderArchive, 'notes.olderArchive'), armReset: flag(notes.armReset, 'notes.armReset') },
  };
  const arm = parseArm(data.arm);
  const changed = parsed.version !== META_VERSION;
  if (arm === null) return { meta, changed };
  if (arm.kind === 'reset') return { meta: contentReset(meta, arm.prev), changed: true };
  // An arm of another run than the archive's next (or, with a run in progress, that run's) can't be played (systems/map-run.ts
  // createRunMap refuses it): an abandon that could not update it before the review fixes, two tabs, a debug jump. It is
  // replaced like a content reset (review fix B1: the page used to throw at its open).
  const expected = arm.arm.run === meta.runs + 1 || (meta.activeRun !== null && arm.arm.run === meta.runs);
  if (!expected) return { meta: contentReset(meta, { ...arm.arm, ships: [], departures: [] }), changed: true };
  return { meta: { ...meta, arm: arm.arm }, changed };
}

// The content reset (02 §10; 3c plan §2.4): the stored arm was made by other content, so the next run gets a fresh roll at
// the next run number from the old arm's start year, the old arm's final-ship lineage carried over (`prev`: its serial and
// last final, freshArmState's floor). The lineage, colonies and history are kept, and the title says so once
// (notes.armReset). A run in progress was played on the old arm: its trail's slots mean nothing on the new one, so it keeps
// no trail (abandoning it records where it was, with no world update: the fresh arm is already the next run's).
function contentReset(meta: Readonly<Meta>, prev: Readonly<ArmState>): Meta {
  let arm: ArmState;
  try {
    arm = freshArmState(prev.armSeed, meta.runs + 1, prev.startYear, prev);
  } catch (error) {
    return corrupt(`the content reset could not roll a fresh arm (${(error as Error).message})`);
  }
  return {
    ...meta,
    arm,
    armSeed: arm.armSeed,
    activeRun: meta.activeRun === null ? null : { ...meta.activeRun, trail: null },
    notes: { ...meta.notes, armReset: true },
  };
}

// --- Storage (systems/storage.ts holds the provider since slice 3c; re-exported above) ------------------------

// `changed`: reading changed the record (an older version migrated, a v1 archive found, a content reset), so the caller
// writes it back at once (openRunArchive): the title's one-off notes are then said from the stored record, and a page
// closed before RUN START does not lose the change. Slice 3c: a leftover activeRun is no longer abandoned here; the page's
// open sequence decides (state/instance.ts: only when no run save can resume it, abandonActiveRun).
export type LoadResult =
  | { ok: true; meta: Meta; changed: boolean }
  | { ok: false; reason: 'unavailable' | 'corrupt'; detail: string };

// Reads the archive. Nothing stored yet is a fresh archive (a first run is not a failure); when the v1 key holds phase 2's
// archive, the fresh one says once that it was not carried over (notes.olderArchive; the v1 key is read for that only,
// never parsed, written or removed). `armSeed`: a fresh archive's (the page's run seed; null in the suites).
export function loadMeta(storage: StorageProvider, armSeed: number | null = null): LoadResult {
  let raw: string | null;
  let older: string | null = null;
  try {
    raw = storage().getItem(META_STORAGE_KEY);
    if (raw === null) older = storage().getItem(META_V1_KEY);
  } catch (error) {
    return { ok: false, reason: 'unavailable', detail: (error as Error).message };
  }
  if (raw === null) {
    if (older === null) return { ok: true, meta: freshMeta(armSeed), changed: false };
    return { ok: true, meta: { ...freshMeta(armSeed), notes: { olderArchive: true, armReset: false } }, changed: true };
  }
  try {
    const read = readMeta(raw);
    return { ok: true, meta: read.meta, changed: read.changed };
  } catch (error) {
    if (error instanceof MetaCorrupt) return { ok: false, reason: 'corrupt', detail: error.message };
    throw error;
  }
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
  // The world update's next arm (02 §3.12), or null (or left out: a record a suite writes for its lineage alone) to keep the
  // stored one (the classic world is never updated).
  nextArm?: ArmState | null;
  // The run's notable events (systems/lineage.ts notableEvents; at most NOTABLE_EVENTS_MAX are kept); left out, none.
  events?: readonly NotableEvent[];
}

// The colonies kept: the newest COLONY_HISTORY_MAX_PER_WORLD per world (slot), in the order they were founded.
function capColonies(colonies: readonly ColonyRecord[]): ColonyRecord[] {
  const kept: ColonyRecord[] = [];
  const perWorld = new Map<number, number>();
  for (let i = colonies.length - 1; i >= 0; i--) {
    const colony = colonies[i]!;
    const count = perWorld.get(colony.slot) ?? 0;
    if (count >= COLONY_HISTORY_MAX_PER_WORLD) continue;
    perWorld.set(colony.slot, count + 1);
    kept.unshift(structuredClone(colony));
  }
  return kept;
}

// A unit's run is over, however it ended (RUN END, or abandoned): it becomes the last unit, its trail's colonies and route
// join the history (capped), its notable events replace the last run's, and the world update's arm (when given) is the
// next run's, with its arm seed (a migrated archive's null takes the seed its first updated arm was rolled from).
function recordUnitEnd(meta: Readonly<Meta>, lastUnit: LastUnit, nextArm: ArmState | null, events: readonly NotableEvent[]): Meta {
  const trail = lastUnit.trail;
  const routes: RouteRecord[] = trail === null ? structuredClone(meta.routes)
    : [...structuredClone(meta.routes), { run: trail.run, unit: trail.unit, slots: trail.stops.map((stop) => stop.slot) }].slice(-ROUTE_HISTORY_RUNS);
  return {
    ...meta,
    activeRun: null,
    lastUnit,
    colonies: capColonies([...meta.colonies, ...(trail === null ? [] : coloniesOf(trail))]),
    routes,
    events: structuredClone(events.slice(0, NOTABLE_EVENTS_MAX)) as NotableEvent[],
    arm: nextArm === null ? meta.arm : structuredClone(nextArm),
    armSeed: nextArm === null ? meta.armSeed : nextArm.armSeed,
  };
}

export function recordRunEnd(meta: Readonly<Meta>, end: RunEnd): Meta {
  const endingsSeen = [...meta.endingsSeen];
  const ending: Ending | null = end.cause === 'won-purge' ? 'purge' : end.cause === 'won-merge' ? 'merge' : null;
  if (ending !== null && !endingsSeen.includes(ending)) endingsSeen.push(ending);
  const lastUnit: LastUnit = {
    number: end.unit, landed: end.landed, shipName: end.shipName, cause: end.cause, stats: { ...end.stats },
    hollowUnits: [...end.hollowUnits], trail: end.trail === null ? null : structuredClone(end.trail), skills: null,
  };
  return { ...recordUnitEnd(meta, lastUnit, end.nextArm ?? null, end.events ?? []), bestScore: Math.max(meta.bestScore, Math.round(end.score)), endingsSeen };
}

// How an abandon is recorded (review fix, minor 7): 'abandoned' when the kid chose it (NEW RUN, ABANDON RUN over a save
// that is theirs to give up, a run left with no save to resume it); 'signal-lost' when the game could not give the run back
// (a save refused for another version or content, a ship that no longer builds, a resume that threw): its ghost says
// nothing (data/hollow-text.ts GHOST_LINE) and the title's lineage line blames nobody.
export type AbandonCause = Extract<LastCause, 'abandoned' | 'signal-lost'>;

// The run in progress is abandoned (02 §3.11 "abandoned"): it becomes the last unit, by `cause`, where it was at its last
// ship start or SHIP DONE, and the ships it visited count as done (`nextArm`: the world update with them; abandonUpdate). No
// events (the archive has only the trail of a run it no longer has; slice 7 reads events). The trail's grey cross takes the
// cause. Throws when no run is in progress (a bug: the callers check).
export function recordAbandon(meta: Readonly<Meta>, nextArm: ArmState | null, cause: AbandonCause = 'abandoned'): Meta {
  const run = meta.activeRun;
  if (run === null) throw new Error('recordAbandon: no run in progress');
  const trail = run.trail === null ? null : structuredClone(run.trail);
  if (trail?.lost) trail.lost.cause = cause;
  const lastUnit: LastUnit = {
    number: run.unit, landed: run.landed, shipName: run.shipName, cause, stats: { ...run.stats },
    hollowUnits: [...run.hollowUnits], trail, skills: null,
  };
  return recordUnitEnd(meta, lastUnit, nextArm, []);
}

// The world update for an abandoned run (3c plan risk 13: from the archive's arm, the one the run started on): its trail's
// stops are the visits (a colony where someone landed in an LZ; the ship it was on, never ended, none). null when the run
// can't be placed on an arm: it kept no trail (the classic world, a content reset, a migrated foundation archive), the
// archive has no arm seed to rebuild run 1's arm from, the stored arm is not that run's, or the trail is another run's.
export function abandonUpdate(meta: Readonly<Meta>): ArmUpdate | null {
  const trail = meta.activeRun?.trail ?? null;
  const lineage = activeLineageOf(meta);
  if (trail === null || meta.armSeed === null || lineage === null || (meta.arm !== null && meta.arm.run !== meta.runs)) return null;
  // The arm the run played (systems/map-run.ts createRunMap: the stored arm, run 1's assembled one, or a fresh roll), as the
  // lineage of the run in progress describes it: the wave the run was counted as.
  const map = createRunMap(lineage, meta.armSeed);
  if (map.run !== trail.run || trail.stops.some((stop) => map.arm[stop.slot] === undefined)) return null;
  return updateArm({ from: armStateOfMap(map), visited: visitsOfTrail(trail) });
}

// The archive with its run in progress abandoned (abandonActiveRun's pure half): the world update with the ships it visited
// (abandonUpdate), and when that can't run or throws (review fix, minor 2: a bug in the update must never stop the abandon),
// the arm the next run needs anyway: kept when it is already the next run's (a content reset made it), else a fresh roll
// for the next run from its start year with its final-ship lineage (freshArmState with the old arm as `prev`), said once on
// the title (notes.armReset). Without a stored arm, nothing is stored (the next run rolls run 2's arm, as before 3c's update).
export function abandonedMeta(meta: Readonly<Meta>, cause: AbandonCause = 'abandoned'): Meta {
  let update: ArmUpdate | null = null;
  try {
    update = abandonUpdate(meta);
  } catch (error) {
    console.error('[archive] the world update threw for the abandoned run: the next arm is redrawn', error);
  }
  if (update !== null) return recordAbandon(meta, update.next, cause);
  const arm = meta.arm;
  if (arm === null || arm.run === meta.runs + 1) return recordAbandon(meta, null, cause);
  let reset: ArmState | null = null;
  try {
    reset = freshArmState(arm.armSeed, meta.runs + 1, arm.startYear, arm);
  } catch (error) {
    console.error('[archive] the abandoned run\'s arm could not be redrawn: the next run rolls its own', error);
  }
  const recorded = recordAbandon(meta, reset, cause);
  return { ...recorded, arm: reset, notes: { ...recorded.notes, armReset: true } };
}

// RUN END's cause as the archive keeps it (§4.5 item 6): one for one, now that the fleet ends with the flagship.
export function lastCauseOf(cause: RunEndCause): LastCause {
  return cause;
}

// --- Lineage: who this run's unit is, and who HOLLOW is -------------------------------------------------

// What a run starts with from the archive (§4.5): its unit and wave, the last unit, HOLLOW's units, whether a unit
// before it has flown the tutorial (tutorialDone). Slice 3c: the arm seed, the arm the run starts on (null: run 1's
// assembled arm, or a fresh roll where no arm is stored) and what the runs before left on the map (RunMapState.history:
// the last unit's number, the colonies and routes; the arm's own gap, valve years, serial and departures are read from the
// arm by systems/map-run.ts createRunMap). WP11's MERGE bonus is gone (3c plan risk 3; deleted in the review fixes).
export interface RunLineage {
  unitNumber: number;
  wave: number;
  lastUnit: LastUnit | null;
  hollowUnits: number[];
  tutorialDone: boolean;
  armSeed: number | null;      // null: the run seed (createRunMap's `lineage.armSeed ?? seed`)
  arm: ArmState | null;
  history: LineageHistory;
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
  return lineageAt(meta, FIRST_UNIT_NUMBER + meta.runs, meta.runs + 1);
}

// The lineage of the run in progress (meta.activeRun; null when there is none): the unit and the wave it was counted as at
// RUN START, on the arm it started on (the stored arm is that run's until its end or abandon updates it). The title of a
// run whose save can't be resumed is built from it (systems/run-save.ts pageTitleState), and so is its abandon's update.
export function activeLineageOf(meta: Readonly<Meta>): RunLineage | null {
  if (meta.activeRun === null) return null;
  return lineageAt(meta, meta.activeRun.unit, meta.runs);
}

// The lineage of unit `unitNumber` on wave `wave`. The stored arm goes with it only when it is that wave's (the archive keeps
// it so: the load and the record steps reset an arm of another run; review fix B1). One of another run is replaced here
// too, by a fresh roll for the wave from its start year with its final-ship lineage (map-update freshArmState), so a bug
// that slipped past them can never stop a title from opening (systems/map-run.ts createRunMap would throw on it).
function lineageAt(meta: Readonly<Meta>, unitNumber: number, wave: number): RunLineage {
  return {
    unitNumber,
    wave,
    lastUnit: meta.lastUnit === null ? null : structuredClone(meta.lastUnit),
    hollowUnits: hollowUnitsAfter(meta.lastUnit),
    tutorialDone: meta.tutorialDone,
    armSeed: meta.armSeed,
    arm: armForWave(meta.arm, wave),
    history: mapHistoryOf(meta.lastUnit, meta.colonies, meta.routes),
  };
}

function armForWave(arm: Readonly<ArmState> | null, wave: number): ArmState | null {
  if (arm === null) return null;
  if (arm.run === wave) return structuredClone(arm) as ArmState;
  try {
    return freshArmState(arm.armSeed, wave, arm.startYear, arm);
  } catch {
    return null;
  }
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
  freshArmSeed: number | null;    // a fresh archive's arm seed (the page's run seed): WIPE ARCHIVE starts from it too
}

let session: Session | null = null;

// Opens the page's archive of runs (state/instance.ts, before the store exists: the first title already names
// UNIT-048). Not the SOUL ARCHIVE of colonists (state/initial.ts openArchive unseals that one). A record changed on load
// (migrated, a v1 archive found, a content reset) is written back at once. A leftover activeRun is left as it is: the
// page's open sequence abandons it only when no run save can resume it (abandonActiveRun).
// Returns the status the store starts with. A load that failed starts a fresh session copy (the run still
// has a unit number), and the status says the archive is not behind it; the console says why.
// `armSeed`: the page's run seed, a fresh archive's arm seed (state/instance.ts picks the seed first).
export function openRunArchive(provider: StorageProvider, armSeed: number | null = null): ArchiveStatus {
  const loaded = loadMeta(provider, armSeed);
  if (!loaded.ok) {
    session = { provider, meta: freshMeta(armSeed), status: loaded.reason === 'corrupt' ? 'corrupt' : 'offline', freshArmSeed: armSeed };
    console.error(`[archive] ${loaded.reason}: ${loaded.detail}`);
    return session.status;
  }
  session = { provider, meta: loaded.meta, status: 'ok', freshArmSeed: armSeed };
  if (loaded.changed) write();
  return session.status;
}

// The run in progress is abandoned (3c plan §2.2): the page opened with no run save to resume it (risk 7: a save that was
// never written, or offline), or the kid chose NEW RUN / ABANDON RUN over a save (systems/run-save.ts abandonRun). It is
// recorded as the last unit 'abandoned' with the world update (its ships count as done), and written. Nothing in progress:
// nothing to do. `store`: the page's store once it exists (its archive status follows); null at the page's open, before it.
export function abandonActiveRun(store: Store<GameState> | null = null, cause: AbandonCause = 'abandoned'): void {
  const current = requireSession();
  if (current.meta.activeRun === null) return;
  current.meta = abandonedMeta(current.meta, cause);
  write();
  if (store !== null) syncStatus(store);
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

// The session's status now (state/instance.ts reads it after the page's open sequence, which may have written).
export function archiveStatusNow(): Exclude<ArchiveStatus, 'none'> {
  return requireSession().status;
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

// SHIP DONE (systems/run.ts openDesk, beside the run save's point): the run in progress takes the ship's result, so a run
// abandoned at the desk keeps that ship's colony (activeRun was otherwise last written at the ship's start, its outcome null).
export function archiveShipDone(store: Store<GameState>): void {
  const state = store.getState();
  if (!hasArchive(state)) return;
  const current = requireSession();
  current.meta = recordShipStart(current.meta, progressOf(state, 'abandoned'));
  write();
  syncStatus(store);
}

// The title said its one-off notes (an older archive not carried over, the arm redrawn): cleared, so they are said once
// (Track UI calls it once the title has shown them). Nothing to clear writes nothing.
export function archiveNotesSaid(store: Store<GameState>): void {
  if (!hasArchive(store.getState())) return;
  const current = requireSession();
  if (!current.meta.notes.olderArchive && !current.meta.notes.armReset) return;
  current.meta = { ...current.meta, notes: { olderArchive: false, armReset: false } };
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

// RUN END (systems/run.ts endRun), one step (02 §3.11): the world update runs on the arm the run played (3c plan risk 13:
// its own map) with its route's ships done, the archive keeps the last unit, its trail, colonies, route and events and the
// next arm, and the run learns who comes next (run.next, RUN END's bridging line). The update runs with or without an
// archive (a headless arm run gets its run.next too); the classic world is never updated. The run save is cleared by the
// caller (systems/run.ts endRun, right after: save-write.ts sits below this file).
// Never throws from the update (review fix, minor 2: a throw here left RUN END half-ended, the phase never set): an update
// that throws is said loudly on the console, and the next arm is a fresh roll for the next run from this run's start year
// with its final-ship lineage (runEndUpdate), said once on the title (notes.armReset).
export function archiveRunEnded(store: Store<GameState>, cause: RunEndCause): void {
  const state = store.getState();
  const after = state.run.map.world === 'arm' ? runEndUpdate(state.run) : null;
  if (hasArchive(state)) {
    const current = requireSession();
    const ended = recordRunEnd(current.meta, {
      ...progressOf(state, lastCauseOf(cause)), cause: lastCauseOf(cause), score: runScore(state.run.ships), nextArm: after?.arm ?? null,
      events: after === null || after.reset ? [] : safeEvents(state.run),
    });
    current.meta = after?.reset === true ? { ...ended, arm: after.arm, notes: { ...ended.notes, armReset: true } } : ended;
    write();
    syncStatus(store);
  }
  if (after !== null) store.update((draft) => { draft.run.next = after.next; });
}

// RUN END's world update (map-update updateAfterRun), or its fallback when it throws (a bug): the next run's fresh roll
// (map-update resetArmAfter), and with that failing too, no arm (the next run rolls its own; the archive's lineage never
// hands a run an arm of another wave).
function runEndUpdate(run: Readonly<RunState>): { arm: ArmState | null; next: NextLaunch | null; reset: boolean } {
  try {
    const { update, next } = updateAfterRun(run);
    return { arm: update.next, next, reset: false };
  } catch (error) {
    console.error('[archive] the world update threw at RUN END: the next arm is redrawn', error);
  }
  try {
    const arm = resetArmAfter(armStateOfMap(run.map), run.map.run + 1);
    return { arm, next: nextLaunchOf(run.unitNumber, arm), reset: true };
  } catch (error) {
    console.error('[archive] the next arm could not be redrawn either: the next run rolls its own', error);
    return { arm: null, next: null, reset: true };
  }
}

// The run's notable events, or none when reading them throws (the record is kept either way).
function safeEvents(run: Readonly<RunState>): NotableEvent[] {
  try {
    return notableEvents(run);
  } catch (error) {
    console.error('[archive] the run\'s notable events could not be read: none are kept', error);
    return [];
  }
}

// ARCHIVE CORRUPT's two ways on (§4.5): WIPE ARCHIVE throws the bad record away for a fresh one (a remove
// that throws is OFFLINE), PLAY WITHOUT ARCHIVE keeps it untouched and writes nothing this page.
export function wipeArchive(store: Store<GameState>): void {
  const current = requireSession();
  if (current.status !== 'corrupt') throw new Error(`wipeArchive: the archive is ${current.status}, not corrupt`);
  current.meta = freshMeta(current.freshArmSeed);
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
