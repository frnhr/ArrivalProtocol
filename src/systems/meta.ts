import type { Store } from '@state/store';
import type { GameState, RunEndCause, RunStats, ArchiveStatus, RunState } from '@state/schema';
import { runScore, runLanded } from '@systems/run-score';
import { emit, NO_PAYLOAD } from '@systems/events';
import { hollowUnitName, GHOST_LINE } from '@data/hollow-text';
import { CLASSIC_FIVE } from '@data/classic-five';
import { AUTHORED_SHIP_NAMES, FINAL_SHIP_NAMES } from '@data/ship-names';
import { currentStop, isEndSlot } from '@systems/map-streams';
import { layerOf } from '@systems/map-geometry';
import {
  META_STORAGE_KEY, META_VERSION, FIRST_UNIT_NUMBER, HOLLOW_NAME_MAX_UNITS,
} from '@data/tuning';

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
// The pure half (loadMeta, saveMeta, the record* steps, lineageOf, hollowName) takes its storage as an
// argument, so the headless suites run it on stubs. The live half (openRunArchive and the archive* calls) holds
// the page's session; run.ts and boot.ts call it at the run's moments, never from a store listener.

// --- The record (§4.5's shape) -----------------------------------------------------------------------

// How a unit's run ended, as the next run remembers it (§4.5's causes). (WP8's interim 'reassigned', a run that ran out
// of ships before LAST LIGHT existed, is gone with that fleet: an archive that still holds it reads ARCHIVE CORRUPT, and
// WIPE ARCHIVE clears it, loudly, like any record this build can't read.)
export type LastCause =
  | 'won-purge' | 'won-merge' | 'unresolved' | 'flagship-lost' | 'overwritten' | 'stayed' | 'abandoned';
export const LAST_CAUSES: readonly LastCause[] = [
  'won-purge', 'won-merge', 'unresolved', 'flagship-lost', 'overwritten', 'stayed', 'abandoned',
];
export type Ending = 'purge' | 'merge';
// Every ending there is (the title's ENDINGS n/2 counts against it).
export const ENDINGS: readonly Ending[] = ['purge', 'merge'];

// What HOLLOW's verbs on ship 5 are weighted by (§4.5: "it fights like you did", WP11).
export interface UnitStats {
  moves: number;
  deletes: number;
}

// The last unit (§4.5), plus the HOLLOW it faced (hollowUnits): a unit that STAYED with its colonists never
// becomes HOLLOW, so the next run meets the one this unit met (WP8 deviation: §4.5's shape has no field for it).
export interface LastUnit {
  number: number;
  woke: number;
  shipName: string;
  cause: LastCause;
  stats: UnitStats;
  hollowUnits: number[];
}

// The run in progress (§4.5's { unit, startedAt }), brought up to date at each ship's start so a run left
// mid-ship can still be named on the next title (WP8 deviation: the fields after startedAt).
export interface ActiveRun {
  unit: number;
  startedAt: number;
  shipName: string;
  woke: number;
  stats: UnitStats;
  hollowUnits: number[];
}

export interface Meta {
  version: typeof META_VERSION;
  runs: number;
  bestScore: number;
  endingsSeen: Ending[];
  mergeBonus: boolean;
  // A unit has flown ARES-VII through (see the header): later runs skip the run-1 lessons (WP8 fix round 1;
  // §4.5's shape has no field for it).
  tutorialDone: boolean;
  activeRun: ActiveRun | null;
  lastUnit: LastUnit | null;
}

export function freshMeta(): Meta {
  return {
    version: META_VERSION, runs: 0, bestScore: 0, endingsSeen: [], mergeBonus: false, tutorialDone: false, activeRun: null, lastUnit: null,
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
  if (!isRecord(value)) corrupt('lastUnit is not a record');
  const cause = value.cause;
  if (typeof cause !== 'string' || !(LAST_CAUSES as readonly string[]).includes(cause)) corrupt(`lastUnit.cause '${String(cause)}' is unknown`);
  return {
    number: wholeNumber(value.number, 'lastUnit.number'),
    woke: wholeNumber(value.woke, 'lastUnit.woke'),
    shipName: text(value.shipName, 'lastUnit.shipName'),
    cause: cause as LastCause,
    stats: unitStats(value.stats, 'lastUnit.stats'),
    hollowUnits: unitList(value.hollowUnits, 'lastUnit.hollowUnits'),
  };
}

function parseActiveRun(value: unknown): ActiveRun | null {
  if (value === null) return null;
  if (!isRecord(value)) corrupt('activeRun is not a record');
  return {
    unit: wholeNumber(value.unit, 'activeRun.unit'),
    startedAt: wholeNumber(value.startedAt, 'activeRun.startedAt'),
    shipName: text(value.shipName, 'activeRun.shipName'),
    woke: wholeNumber(value.woke, 'activeRun.woke'),
    stats: unitStats(value.stats, 'activeRun.stats'),
    hollowUnits: unitList(value.hollowUnits, 'activeRun.hollowUnits'),
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
  const endings = data.endingsSeen;
  if (!Array.isArray(endings) || endings.some((ending) => !(ENDINGS as readonly unknown[]).includes(ending))) corrupt('endingsSeen is not a list of endings');
  if (typeof data.mergeBonus !== 'boolean') corrupt('mergeBonus is not true or false');
  if (typeof data.tutorialDone !== 'boolean') corrupt('tutorialDone is not true or false');
  return {
    version: META_VERSION,
    runs: wholeNumber(data.runs, 'runs'),
    bestScore: wholeNumber(data.bestScore, 'bestScore'),
    endingsSeen: [...(endings as Ending[])],
    mergeBonus: data.mergeBonus,
    tutorialDone: data.tutorialDone,
    activeRun: parseActiveRun(data.activeRun),
    lastUnit: parseLastUnit(data.lastUnit),
  };
}

// --- Storage -------------------------------------------------------------------------------------------

// What the archive needs of localStorage (headless suites pass stubs). The provider is a function because
// reaching window.localStorage can itself throw (storage blocked by the browser): that is ARCHIVE OFFLINE.
export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type StorageProvider = () => MetaStorage;

// The page's archive storage (§4.5): localStorage. Reaching it can itself throw (storage blocked by the
// browser, a sandboxed frame), so it is reached through this function every time, inside the archive's own
// try: a throw there is ARCHIVE OFFLINE, said on screen, never a crash. Headless suites pass stubs instead.
export function browserStorage(): MetaStorage {
  return window.localStorage;
}

export type LoadResult =
  | { ok: true; meta: Meta; recovered: boolean }
  | { ok: false; reason: 'unavailable' | 'corrupt'; detail: string };

// A run left without a RUN END (the page closed or reloaded mid-run) is the last unit, 'abandoned' where it
// was when its last ship started.
function abandon(run: ActiveRun): LastUnit {
  return {
    number: run.unit, woke: run.woke, shipName: run.shipName, cause: 'abandoned', stats: { ...run.stats }, hollowUnits: [...run.hollowUnits],
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

export type SaveStatus = 'ok' | 'unavailable';

export function saveMeta(storage: StorageProvider, meta: Readonly<Meta>): SaveStatus {
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
  woke: number;
  stats: UnitStats;
  hollowUnits: readonly number[];
}

export function recordRunStart(meta: Readonly<Meta>, progress: RunProgress, now: number): Meta {
  return { ...meta, runs: meta.runs + 1, activeRun: { ...activeOf(progress), startedAt: Math.max(0, Math.floor(now)) } };
}

function activeOf(progress: RunProgress): Omit<ActiveRun, 'startedAt'> {
  return { unit: progress.unit, shipName: progress.shipName, woke: progress.woke, stats: { ...progress.stats }, hollowUnits: [...progress.hollowUnits] };
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
    lastUnit: {
      number: end.unit, woke: end.woke, shipName: end.shipName, cause: end.cause, stats: { ...end.stats }, hollowUnits: [...end.hollowUnits],
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
// starts with MERGE_BONUS_CORE_CAPACITY threads and a faint permanent shimmer).
export interface RunLineage {
  unitNumber: number;
  wave: number;
  lastUnit: LastUnit | null;
  hollowUnits: number[];
  tutorialDone: boolean;
  mergeBonus: boolean;
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
    lastUnit: meta.lastUnit === null ? null : { ...meta.lastUnit, stats: { ...meta.lastUnit.stats }, hollowUnits: [...meta.lastUnit.hollowUnits] },
    hollowUnits: hollowUnitsAfter(meta.lastUnit),
    tutorialDone: meta.tutorialDone,
    mergeBonus: meta.mergeBonus,
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

// Where this run's ghost speaks (05 §3.5: "at the first boot in or past the layer where it was lost … never at ship 1: the
// new unit can't know yet"), on the fixed five: the index of the ship where the last unit's run ended (its shipName), or
// the final ship when the name is not one of `shipNames` (a record from an older fleet), and never ship 1 (index 0: a run
// abandoned on ARES-VII speaks at HALCYON). The boot plays it at the first ship this run whose index is at or past this
// one, once (run.ghostSpoken; systems/boot.ts), so a ship skipped or lost before it never makes it vanish or repeat.
// Slice 3's seam: the galaxy map replaces "ship index" with the layer where the last unit was lost, and the boot's "at or
// past" with the moment the new unit passes the grey cross on the chart.
export function ghostShipIndex(lastUnit: Readonly<Pick<LastUnit, 'shipName'>>, shipNames: readonly string[] = CLASSIC_FIVE.map((ship) => ship.name)): number {
  if (shipNames.length < 2) throw new Error(`ghostShipIndex: a fleet of ${shipNames.length} ship(s) has no ship past ship 1 for the ghost`);
  const at = shipNames.indexOf(lastUnit.shipName);
  return Math.max(1, at < 0 ? shipNames.length - 1 : at);
}

// Is this ship at or past where the ghost speaks? On the classic world (or a run with no map: the archive suites), the
// fixed five's index (ghostShipIndex). On the arm, by layer (slice-3a-plan §2.9, interim until 3c's trail and grey cross):
// the last unit's ship (its shipName) is looked up on the current arm, and the ghost speaks at the first boot whose ship's
// layer is at or past that ship's layer, never at ship 1; a name the arm does not hold (a fresh roll, an older fleet)
// speaks at the final ship.
export function ghostPlaceReached(
  run: Readonly<Pick<RunState, 'lastUnit' | 'shipIndex'> & Partial<Pick<RunState, 'map'>>>, lastUnit: Readonly<Pick<LastUnit, 'shipName'>>,
): boolean {
  const map = run.map;
  if (map === undefined || map.world === 'classic') return run.shipIndex >= ghostShipIndex(lastUnit);
  if (run.shipIndex === 0) return false;
  const slot = currentStop({ map, shipIndex: run.shipIndex }).slot;
  const lostOn = map.arm.find((ship) => ship.name === lastUnit.shipName);
  if (lostOn === undefined) return isEndSlot(map, slot);
  return layerOf(slot) >= layerOf(lostOn.slot);
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

function progressOf(state: Readonly<GameState>): RunProgress {
  return {
    unit: state.run.unitNumber,
    shipName: state.level.shipName,
    // Risk 10 (no META_VERSION bump): the archive's `woke` field now holds the colonists LANDED (on target). Slice 3's
    // save replaces the record.
    woke: runLanded(state.run.ships),
    stats: unitStatsOf(state.run.stats),
    hollowUnits: state.run.hollowUnits,
  };
}

// RUN START: RECEIVE TRANSMISSION on a run's title (systems/boot.ts).
export function archiveRunStarted(store: Store<GameState>, now: number = Date.now()): void {
  if (!hasArchive(store.getState())) return;
  const current = requireSession();
  current.meta = recordRunStart(current.meta, progressOf(store.getState()), now);
  write();
  syncStatus(store);
}

// A later ship starts (systems/run.ts startShip): the run in progress is where the unit is now, and a unit
// on its second ship has flown ARES-VII through (one write for both).
export function archiveShipStarted(store: Store<GameState>): void {
  const state = store.getState();
  if (!hasArchive(state)) return;
  const current = requireSession();
  current.meta = recordShipStart(current.meta, progressOf(state));
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
  current.meta = recordRunEnd(current.meta, { ...progressOf(state), cause: lastCauseOf(cause), score: runScore(state.run.ships) });
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
