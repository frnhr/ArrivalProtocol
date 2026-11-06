// The skill tree's rules (phase 3 slice 4; docs/phase3/03-skills.md §3.1–§3.3, slice-4-plan §2.2, §2.4, §2.15), pure but
// for the grant writers: the bank, what the unit holds, what it paid for and lost, RESTORE's price, the cells of the
// TRAINING grid, the opening rule, the desk's required first pick, and the demos' learning. Track TREE owns this file
// after the FOUNDATION (plan §5.2); the others read it.
// Everything here is derived from the run's history (RunSkillState) and memory, never stored: see types/skill.ts.
import type { Store } from '@state/store';
import type { GameState, RunStats } from '@state/schema';
import type { ThreatTally } from '@/types/threat';
import type {
  SkillId, SkillLevel, SkillVersion, CellRow, RunSkillState, CycleEarning, CycleGrant, DemoSkill,
  DemoTuning, SkillRecord, DemoKind,
} from '@/types/skill';
import { levelPrice, skillBlocks, SKILL_TREE, SKILL_IDS } from '@data/skills';
import { reachableFrom } from '@systems/map-hop';
import { currentSlot } from '@systems/map-streams';
import {
  AUTO_DEMO_WINDOW, AUTOBURN_OFFSET_FACTOR, AUTOBURN_OFFSET_MAX_TAC, AUTOBURN_ACCURACY_PER_TAC,
  AUTOBURN_ACCURACY_MIN, AUTOBURN_ACCURACY_MAX, AUTOBURN_UNTRAINED_OFFSET_TAC, AUTODROP_OFFSET_FACTOR, AUTODROP_OFFSET_MAX_TAC,
  AUTODROP_AIM_PER_TAC, AUTODROP_AIM_MIN, AUTODROP_AIM_MAX, AUTODROP_UNTRAINED_OFFSET_TAC,
} from '@data/tuning';

// The levels (held, paid, lost, RESTORE's price) live in the leaf systems/skill-levels.ts; re-exported here with the rest.
export { visitNow, levelAbove, fileLevel, held, paid, lostLevels, restorePrice, restoreCostOf } from '@systems/skill-levels';
import { visitNow, fileLevel, held, paid } from '@systems/skill-levels';

// --- The bank (03 §3.1) ------------------------------------------------------------------------------------------------

export function earnedCycles(earning: Readonly<CycleEarning>): number {
  return earning.arrived + earning.landed;
}

// The cycles to spend now: everything earned and granted, less everything bought and pending. Never stored. Below 0 is a
// bug (a purchase the bank could not pay, or a save edited by hand): throws.
export function bankOf(skills: Readonly<RunSkillState>): number {
  const earned = skills.earned.reduce((sum, earning) => sum + earnedCycles(earning), 0);
  const granted = skills.grants.reduce((sum, grant) => sum + grant.cycles, 0);
  const spent = [...skills.bought, ...skills.pending].reduce((sum, purchase) => sum + purchase.cost, 0);
  const bank = earned + granted - spent;
  if (bank < 0) throw new Error(`bankOf: the bank is ${bank} (earned ${earned}, granted ${granted}, spent ${spent})`);
  return bank;
}

// --- Demos (03 §3.3: "cycles buy the version; your hands set its precision") -------------------------------------------

export const AUTOBURN_DEMO_TUNING: Readonly<DemoTuning> = {
  window: AUTO_DEMO_WINDOW,
  factor: AUTOBURN_OFFSET_FACTOR,
  maxOffsetTac: AUTOBURN_OFFSET_MAX_TAC,
  accuracyPerTac: AUTOBURN_ACCURACY_PER_TAC,
  accuracyMin: AUTOBURN_ACCURACY_MIN,
  accuracyMax: AUTOBURN_ACCURACY_MAX,
  untrainedOffsetTac: AUTOBURN_UNTRAINED_OFFSET_TAC,
};

function accuracyOf(offsetTac: number, tuning: Readonly<DemoTuning>): number {
  return Math.round(Math.max(tuning.accuracyMin, Math.min(tuning.accuracyMax, 100 - tuning.accuracyPerTac * Math.abs(offsetTac))));
}

// What a skill learned from the kid's demos (phase 2's autoburnSkill, generalised; AUTODROP reuses it in 4c with its own
// numbers): `factor` × the mean offset of the last `window` demos, clamped to ±maxOffsetTac, and its ACCURACY. With no
// demos it is UNTRAINED: it fires untrainedOffsetTac late (plan §7 R3). `demos` counts every demo recorded (the boot's
// `from your 3 captures`, and RunSkillState.announced's retrain check), the learning only the last `window`.
export function demoSkill(offsets: readonly Readonly<{ offsetTac: number }>[], tuning: Readonly<DemoTuning>): DemoSkill {
  const recent = offsets.slice(-tuning.window);
  if (recent.length === 0) {
    return { demos: 0, learnedOffsetTac: tuning.untrainedOffsetTac, accuracy: accuracyOf(tuning.untrainedOffsetTac, tuning), untrained: true };
  }
  const mean = recent.reduce((sum, demo) => sum + demo.offsetTac, 0) / recent.length;
  const learned = Math.max(-tuning.maxOffsetTac, Math.min(tuning.maxOffsetTac, tuning.factor * mean));
  return { demos: offsets.length, learnedOffsetTac: learned, accuracy: accuracyOf(learned, tuning), untrained: false };
}

// AUTODROP's (03 §3.3; slice-4cde-plan §2.6, R5): half the mean offset of the last 8 drops, ±1 tac s, AIM = clamp(100 −
// 40 × |offset|, 40, 99); untrained, 1.5 tac s late (AIM 40%). DemoSkill.accuracy is its AIM.
export const AUTODROP_DEMO_TUNING: Readonly<DemoTuning> = {
  window: AUTO_DEMO_WINDOW,
  factor: AUTODROP_OFFSET_FACTOR,
  maxOffsetTac: AUTODROP_OFFSET_MAX_TAC,
  accuracyPerTac: AUTODROP_AIM_PER_TAC,
  accuracyMin: AUTODROP_AIM_MIN,
  accuracyMax: AUTODROP_AIM_MAX,
  untrainedOffsetTac: AUTODROP_UNTRAINED_OFFSET_TAC,
};

// AUTOBURN's, from the run's capture demos.
export function autoburnDemoSkill(stats: Readonly<Pick<RunStats, 'demos'>>): DemoSkill {
  return demoSkill(stats.demos, AUTOBURN_DEMO_TUNING);
}

// The run's demo records a skill learns from, by kind.
export type DemoStats = Pick<RunStats, 'demos' | 'dropDemos'>;

interface DemoSource {
  tuning: Readonly<DemoTuning>;
  of: (stats: Readonly<DemoStats>) => readonly Readonly<{ offsetTac: number }>[];
}

// Where each demo kind's learning comes from (SkillDef.demos; review architecture note): one row per kind. A kind whose
// learning is not built yet is null, and its skills read as having no demos. Slice 4c's foundation filled `drops`: the
// kid's launches (run.stats.dropDemos, recorded by Track DROP in landing.ts requestLaunch) with AUTODROP's tuning.
export const DEMO_SOURCES: Readonly<Record<DemoKind, DemoSource | null>> = {
  captures: { tuning: AUTOBURN_DEMO_TUNING, of: (stats) => stats.demos },
  drops: { tuning: AUTODROP_DEMO_TUNING, of: (stats) => stats.dropDemos },
};

// The demo kind a skill learns from now, or null for one with no demos (SURVEY, SENTRY) or whose learning is not built.
export function demoKindOf(id: SkillId): DemoKind | null {
  const kind = SKILL_TREE[id].demos;
  return kind !== null && DEMO_SOURCES[kind] !== null ? kind : null;
}

// --- The desk ----------------------------------------------------------------------------------------------------------

// What holds SET COURSE (plan §2.5): on the arm, the run's first desk waits for the required first pick. Later desks, and
// the classic world (no tree), never block. Any skill already paid for (bought, or pending at this desk) clears it: the
// pick made, or a migrated run that kept phase 2's free AUTOBURN (the foundation review's note), which would otherwise be
// asked to buy what it holds. setCourse throws on it (run.ts); the DESK shows `CHOOSE YOUR FIRST SKILL`.
export type DeskBlocker = 'first-pick';

export function deskBlocker(state: Readonly<GameState>): DeskBlocker | null {
  if (state.run.phase !== 'desk') return null;
  return firstPickOwed(state.run) ? 'first-pick' : null;
}

// The run's first desk on the arm (visit 1: the desk after ship 1), the one predicate (review m14: the desk's steps read the
// route's length, the tree the ships ended; they agree today, a debug jump or a migrated route could split them).
export function isFirstDesk(run: Readonly<Pick<GameState['run'], 'map' | 'ships'>>): boolean {
  return run.map.world === 'arm' && visitNow(run) === 1;
}

// The required first pick is still owed (03 §3.1–§3.2): the first desk, and no skill paid for yet. deskBlocker (at the desk),
// the desk's opening tab and its first-pick top-up read it.
export function firstPickOwed(run: Readonly<Pick<GameState['run'], 'map' | 'ships' | 'skills'>>): boolean {
  return isFirstDesk(run) && !anyPaid(run.skills);
}

// The run has paid for some skill (bought this run, or pending at this desk).
export function anyPaid(skills: Readonly<RunSkillState>): boolean {
  return SKILL_IDS.some((id) => paid(skills, id) !== null);
}

// --- The grid (implemented by the FOUNDATION's review follow-up; Track TREE may refine it, its tests staying) -----------

// Why a cell can't be bought now (training.ts trainCell's refusal): its branch or row is closed (or not built), the bank
// can't pay, the level below is not held, it is already held (or pending), it was paid for and lost (RESTORE is the way
// back, training.ts restoreSkill), or the run is not at a desk.
export type TrainRefusal = 'closed' | 'unaffordable' | 'needs-lower' | 'owned' | 'lost' | 'not-desk';

// How a cell looks (plan §2.5): held (owned), bought at this desk (pending), buyable (affordable), open but not buyable now
// (dim), paid for and no longer held (lost: `LOST · RESTORE n`), its branch or row not open yet (closed: `OPENS LATER`), or
// above what this build implements (unbuilt).
export type CellLook = 'owned' | 'pending' | 'affordable' | 'dim' | 'lost' | 'closed' | 'unbuilt';

export interface TreeCell {
  skill: SkillId;
  row: CellRow;
  look: CellLook;
  price: number;                    // the cell's price; a lost cell's is its share of the RESTORE price's input
  blocks: number;                   // the file's size once the cell is held
  refusal: TrainRefusal | null;     // why trainCell would refuse it now (null: it would buy it)
}

// A level covers a row: it holds that version (or more), or that LOCK RANGE level (or more).
function covers(level: Readonly<SkillLevel> | null, row: CellRow): boolean {
  if (level === null) return false;
  return row.kind === 'version' ? level.version >= row.version : level.lock >= row.level;
}

// The rows of a skill, in the grid's order: v1 v2 v3, then its LOCK RANGE levels.
export function skillRows(id: SkillId): CellRow[] {
  const def = SKILL_TREE[id];
  return [
    ...def.versions.map((version): CellRow => ({ kind: 'version', version: version.version })),
    ...def.locks.map((lock): CellRow => ({ kind: 'lock', level: lock.level })),
  ];
}

// Whether a row of an open branch is open at `visit` (03 §3.2): a 'start' branch shows its root from visit 1 and the rest
// (higher versions, LOCK RANGE) from visit 2; a branch latched later opens whole.
function rowOpenAt(id: SkillId, row: CellRow, visit: number): boolean {
  if (SKILL_TREE[id].opens.kind !== 'start') return true;
  return row.kind === 'version' && row.version === 1 ? visit >= 1 : visit >= 2;
}

// Every cell of the grid at `visit`, by branch (SKILL_IDS order) and row (skillRows). Pure: reads the open branches, the
// file in memory, what this desk has pending, what the run paid for, and the bank.
export function treeCells(state: Readonly<GameState>, visit: number): TreeCell[] {
  const open = new Set(openBranchesAt(state, visit));
  const bank = bankOf(state.run.skills);
  const atDesk = state.run.phase === 'desk';
  const cells: TreeCell[] = [];
  for (const id of SKILL_IDS) {
    const def = SKILL_TREE[id];
    const inFile = fileLevel(state.memory, id);
    const heldNow = held(state, id);
    const paidFor = paid(state.run.skills, id);
    for (const row of skillRows(id)) {
      const price = levelPrice(id, row);
      const blocks = row.kind === 'version'
        ? skillBlocks(id, row.version, heldNow?.lock ?? 0)
        : skillBlocks(id, heldNow?.version ?? 1, row.level);
      const cell = (look: CellLook, refusal: TrainRefusal | null): TreeCell => ({ skill: id, row, look, price, blocks, refusal });
      if (covers(inFile, row)) { cells.push(cell('owned', 'owned')); continue; }
      if (covers(heldNow, row)) { cells.push(cell('pending', 'owned')); continue; }
      if (covers(paidFor, row)) { cells.push(cell('lost', 'lost')); continue; }
      if (!open.has(id) || !rowOpenAt(id, row, visit)) { cells.push(cell('closed', 'closed')); continue; }
      if (row.kind === 'version' && row.version > def.built) { cells.push(cell('unbuilt', 'closed')); continue; }
      const lowerHeld = row.kind === 'version'
        ? row.version === 1 || covers(heldNow, { kind: 'version', version: (row.version - 1) as SkillVersion })
        : heldNow !== null && (row.level === 1 || heldNow.lock >= row.level - 1);
      const refusal: TrainRefusal | null = !atDesk ? 'not-desk' : !lowerHeld ? 'needs-lower' : price > bank ? 'unaffordable' : null;
      cells.push(cell(refusal === null ? 'affordable' : 'dim', refusal));
    }
  }
  return cells;
}

// --- The opening rule (03 §3.2) ------------------------------------------------------------------------------------------

// The run has met seeds by now (DEFENCE's 'after-seeds'): the lasting record run.ts endShip writes (slice-4cde-plan R11).
// It never fades: a kid who rm's every seed leaves TRACE at 0, and a tie (SURVEY first, slice 6) can push SENTRY a visit
// past a seedless ship, so the evidence itself can't be read at the desk.
export function seedsMet(state: Readonly<GameState>): boolean {
  return state.run.threat.seedsMetAtDepth !== null;
}

// The ship now ending met a seed, or the run already had (endShip's record, R11): it arrived with beam seeds, HOLLOW's own
// seeds landed on it, beam-born blocks were left at its end (`tally`, the one endShip applies), or the run's earlier
// evidence holds (HOLLOW's SEEDS stage played, TRACE, `fed`: what 4a's rule read at the desk, so the record opens SENTRY at
// least as early as that rule did).
export function shipMetSeeds(state: Readonly<GameState>, tally: Readonly<ThreatTally>): boolean {
  const threat = state.run.threat;
  return (state.run.arrival?.seeds.length ?? 0) > 0 || state.hollow.seedsLanded > 0 || tally.left > 0
    || threat.stagesPlayed.includes('seeds') || tally.traceAfter > 0 || threat.fed > 0;
}

// A possible next ship has POOR site data (SURVEY's 'poor-ahead'; 01 §3.13): among the ships reachable from here. Only the
// arm has site data.
function poorAhead(state: Readonly<GameState>): boolean {
  const map = state.run.map;
  if (map.world !== 'arm') return false;
  return reachableFrom(map, currentSlot(state.run)).some((slot) => map.arm[slot]?.reserved.site === 'poor');
}

function latchedRuleDue(state: Readonly<GameState>, id: SkillId, visit: number): boolean {
  const opens = SKILL_TREE[id].opens;
  if (opens.kind === 'start' || visit < opens.minVisit) return false;
  return opens.kind === 'after-seeds' ? seedsMet(state) : poorAhead(state);
}

// The skills whose branch is open at `visit` (03 §3.2; types/skill.ts OpenRule). A branch with `built: 0` never opens.
// • 'start' branches are derived: open from visit 1 (their rows by rowOpenAt).
// • 'after-seeds' / 'poor-ahead' branches: the ones latched in RunSkillState.opened at or before `visit`, plus at most one
//   newly due at this visit when none was latched at it ("one new branch per visit" counts only these). When both are
//   due, the next ship needs SURVEY (a POOR planet is reachable): it opens first, SENTRY the visit after.
// Pure: run.ts openDesk latches a newly due one.
export function openBranchesAt(state: Readonly<GameState>, visit: number): SkillId[] {
  // The classic world has no tree (plan §7 R10): its suites give skills through tests/unit/support/skills.ts.
  if (state.run.map.world !== 'arm') return [];
  const latched = state.run.skills.opened;
  const open = new Set<SkillId>();
  for (const id of SKILL_IDS) {
    const def = SKILL_TREE[id];
    if (def.built === 0) continue;
    if (def.opens.kind === 'start') {
      if (visit >= 1) open.add(id);
    } else if (latched.some((entry) => entry.skill === id && entry.visit <= visit)) {
      open.add(id);
    }
  }
  if (!latched.some((entry) => entry.visit === visit)) {
    const due = SKILL_IDS.filter((id) => SKILL_TREE[id].built > 0 && !open.has(id) && latchedRuleDue(state, id, visit));
    const first = due.includes('survey') ? 'survey' : due[0];
    if (first !== undefined) open.add(first);
  }
  return SKILL_IDS.filter((id) => open.has(id));
}

// The 'after-seeds' / 'poor-ahead' branch newly due at this desk (openBranchesAt's one new branch), or null: run.ts openDesk
// latches it into RunSkillState.opened, so a later visit keeps it open whatever the map says then.
export function branchToLatch(state: Readonly<GameState>, visit: number): SkillId | null {
  const latched = state.run.skills.opened;
  return openBranchesAt(state, visit).find((id) => SKILL_TREE[id].opens.kind !== 'start' && !latched.some((entry) => entry.skill === id)) ?? null;
}

// --- The run's totals (RUN END, the RUN TALLY, the archive) ---------------------------------------------------------------

// The cycles' worth of the tree the run paid for (the RUN TALLY's `TRAINED n of 54`): every level up to each skill's paid
// level, at its price, whether or not it is still held (lost levels were trained all the same). Free purchases (a migrated
// AUTOBURN, a grant) count at their cell's price: they are part of the tree the unit had.
export function trainedCycles(skills: Readonly<RunSkillState>): number {
  let total = 0;
  for (const id of SKILL_IDS) {
    const level = paid(skills, id);
    if (level === null) continue;
    for (const row of skillRows(id)) if (covers(level, row)) total += levelPrice(id, row);
  }
  return total;
}

// What a skill learned from the kid's demos (its kind's DEMO_SOURCES row), or null for a skill that has none (SURVEY,
// SENTRY) or whose learning is not built yet.
export function skillDemos(stats: Readonly<DemoStats>, id: SkillId): DemoSkill | null {
  const kind = demoKindOf(id);
  if (kind === null) return null;
  const source = DEMO_SOURCES[kind]!;
  return demoSkill(source.of(stats), source.tuning);
}

// The skills the unit ends the run with (03 §3.11, LastUnit.skills): each skill whose file is in memory, at its file's
// level, with its demos' accuracy (null for a skill with no demos, or none yet: UNTRAINED). REASSIGNMENT (slice 7) hunts
// the highest version.
export function skillRecords(state: Readonly<Pick<GameState, 'memory' | 'run'>>): SkillRecord[] {
  const records: SkillRecord[] = [];
  for (const id of SKILL_IDS) {
    const level = fileLevel(state.memory, id);
    if (level === null) continue;
    const demos = skillDemos(state.run.stats, id);
    records.push({ skill: id, version: level.version, lock: level.lock, accuracy: demos === null || demos.untrained ? null : demos.accuracy });
  }
  return records;
}

// --- Grants (slice 5's interface, 03 §5; plan §2.15) -----------------------------------------------------------------------

// n cycles into the bank from a resident, a story stop or a salvage card (03 §5: "added to the bank at the next visit"; the
// bank is derived, so it reads them at once), recorded at this visit with the source's line (null: the built-in sources).
export function grantCycles(store: Store<GameState>, cycles: number, source: CycleGrant['source'], label: string | null): void {
  if (!(Number.isInteger(cycles) && cycles > 0)) throw new Error(`grantCycles: ${cycles} is not a positive whole number of cycles`);
  store.update((draft) => {
    draft.run.skills.grants.push({ source, cycles, visit: visitNow(draft.run), label });
  });
}

// The two grant rules (03 §5): a departed resident's salvage card ('card': one skill at v1 of an open branch the unit has
// not owned this run, picked on the PACKET) and a gift ('gift': the sleeper's skill at any version up to v3 and the built
// one, installed at the next boot).
export type GrantRule = 'card' | 'gift';

// A skill at a version, installed at the next boot with the TRAINED line naming `source` (`from the sleeper on CURLEW`): a
// SkillGrant, and a 'grant' purchase (cost 0) so a granted skill eaten later is lost and can be restored like a bought one.
// The purchase keeps the lock the run paid for (v2 given to a v1 + 270 AUTOBURN is v2 + 270). Throws where grantAllowed
// says no.
export function grantSkill(store: Store<GameState>, skill: SkillId, version: SkillVersion, source: string, rule: GrantRule): void {
  const state = store.getState();
  if (!grantAllowed(state, skill, version, rule)) throw new Error(`grantSkill: ${SKILL_TREE[skill].fileName} v${version} can't be granted now (${rule})`);
  const lock = paid(state.run.skills, skill)?.lock ?? 0;
  store.update((draft) => {
    draft.run.skills.skillGrants.push({ skill, version, source, installedAtDepth: null });
    draft.run.skills.bought.push({ skill, kind: 'grant', to: { version, lock }, cost: 0, visit: visitNow(draft.run) });
  });
}

// Whether a grant under `rule` may give `skill` at `version` now (03 §5): never above the built version, never a closed
// branch, never a version the run already paid for (nothing to give), and for a 'card' only v1 of a skill the run never paid
// for (not one it holds, nor one it lost: RESTORE is the way back there).
export function grantAllowed(state: Readonly<GameState>, skill: SkillId, version: SkillVersion, rule: GrantRule): boolean {
  if (version > SKILL_TREE[skill].built) return false;
  if (!openBranchesAt(state, visitNow(state.run)).includes(skill)) return false;
  const paidFor = paid(state.run.skills, skill);
  if (rule === 'card') return version === 1 && paidFor === null && fileLevel(state.memory, skill) === null;
  return paidFor === null || version > paidFor.version;
}
