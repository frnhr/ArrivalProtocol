// The skill tree's rules (phase 3 slice 4; docs/phase3/03-skills.md §3.1–§3.3, slice-4-plan §2.2, §2.4, §2.15), pure but
// for the grant writers: the bank, what the unit holds, what it paid for and lost, RESTORE's price, the cells of the
// TRAINING grid, the opening rule, the desk's required first pick, and the demos' learning. Track TREE owns this file
// after the FOUNDATION (plan §5.2); the others read it.
// Everything here is derived from the run's history (RunSkillState) and memory, never stored: see types/skill.ts.
import type { Store } from '@state/store';
import type { GameState, RunStats } from '@state/schema';
import type { Segment } from '@/types/segment';
import type {
  SkillId, SkillLevel, SkillVersion, LockLevel, CellRow, LostLevel, RunSkillState, CycleEarning, CycleGrant, DemoSkill,
  DemoTuning,
} from '@/types/skill';
import { skillFilesOf } from '@state/selectors';
import { levelPrice } from '@data/skills';
import { notBuilt } from '@systems/not-built';
import {
  RESTORE_FRACTION, AUTO_DEMO_WINDOW, AUTOBURN_OFFSET_FACTOR, AUTOBURN_OFFSET_MAX_TAC, AUTOBURN_ACCURACY_PER_TAC,
  AUTOBURN_ACCURACY_MIN, AUTOBURN_ACCURACY_MAX, AUTOBURN_UNTRAINED_OFFSET_TAC,
} from '@data/tuning';

// --- Levels ----------------------------------------------------------------------------------------------------------

// The desk visit the run is at: the ships ended so far (visit 1 is the desk after ship 1). Purchases and grants record it.
export function visitNow(run: Readonly<Pick<GameState['run'], 'ships'>>): number {
  return run.ships.length;
}

// a above b (by version, then lock): the order files and purchases are compared in.
export function levelAbove(a: Readonly<SkillLevel>, b: Readonly<SkillLevel>): boolean {
  return a.version > b.version || (a.version === b.version && a.lock > b.lock);
}

function highestLevel(levels: readonly Readonly<SkillLevel>[]): SkillLevel | null {
  let best: SkillLevel | null = null;
  for (const level of levels) if (best === null || levelAbove(level, best)) best = { version: level.version, lock: level.lock };
  return best;
}

// The level of the skill file the unit carries (its highest copy, whatever its health or state: damage is not loss,
// REPAIR answers it), or null with none in memory (eaten, unlinked, deleted, left behind).
export function fileLevel(memory: readonly Segment[], id: SkillId): SkillLevel | null {
  return highestLevel(skillFilesOf(memory, id).map((file) => ({ version: file.version, lock: file.lock })));
}

// What the unit holds of `id` once this desk's purchases land (plan §2.2): its file's level, raised by every pending
// purchase (each `to` is the skill's whole level after it). Componentwise, since the levels are bought from below.
export function held(state: Readonly<Pick<GameState, 'memory' | 'run'>>, id: SkillId): SkillLevel | null {
  const base = fileLevel(state.memory, id);
  const pending = state.run.skills.pending.filter((purchase) => purchase.skill === id).map((purchase) => purchase.to);
  if (pending.length === 0) return base;
  const levels = base === null ? pending : [base, ...pending];
  return {
    version: Math.max(...levels.map((level) => level.version)) as SkillVersion,
    lock: Math.max(...levels.map((level) => level.lock)) as LockLevel,
  };
}

// The highest level the run paid for (bought this run, or pending at this desk), or null if it never bought `id`.
// Componentwise: a lock bought on v1 and a v2 bought later are both paid for.
export function paid(skills: Readonly<RunSkillState>, id: SkillId): SkillLevel | null {
  const tos = [...skills.bought, ...skills.pending].filter((purchase) => purchase.skill === id).map((purchase) => purchase.to);
  if (tos.length === 0) return null;
  return {
    version: Math.max(...tos.map((level) => level.version)) as SkillVersion,
    lock: Math.max(...tos.map((level) => level.lock)) as LockLevel,
  };
}

// The levels paid for and no longer held (03 §3.3: eaten, unlinked, deleted, left behind, or packed at a lower version):
// every version above the held one up to the paid one, then every LOCK RANGE level above the held lock up to the paid
// lock, each with its price. Nothing held counts as v0 lock 0. [] when nothing is lost (or nothing was paid).
export function lostLevels(id: SkillId, heldLevel: Readonly<SkillLevel> | null, paidLevel: Readonly<SkillLevel> | null): LostLevel[] {
  if (paidLevel === null) return [];
  const lost: LostLevel[] = [];
  for (let version = (heldLevel?.version ?? 0) + 1; version <= paidLevel.version; version++) {
    const row: CellRow = { kind: 'version', version: version as SkillVersion };
    lost.push({ row, price: levelPrice(id, row) });
  }
  for (let level = (heldLevel?.lock ?? 0) + 1; level <= paidLevel.lock; level++) {
    const row: CellRow = { kind: 'lock', level: level as 1 | 2 };
    lost.push({ row, price: levelPrice(id, row) });
  }
  return lost;
}

// RESTORE's price (decision 16): RESTORE_FRACTION of the lost levels' prices, rounded up (LOCK RANGE counts, as part of
// FLIGHT's cost). 0 when nothing is lost.
export function restorePrice(lost: readonly LostLevel[]): number {
  return Math.ceil(RESTORE_FRACTION * lost.reduce((sum, level) => sum + level.price, 0) - 1e-9);
}

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

// AUTOBURN's, from the run's capture demos.
export function autoburnDemoSkill(stats: Readonly<Pick<RunStats, 'demos'>>): DemoSkill {
  return demoSkill(stats.demos, AUTOBURN_DEMO_TUNING);
}

// --- The desk ----------------------------------------------------------------------------------------------------------

// What holds SET COURSE (plan §2.5): on the arm, the run's first desk waits for the required first pick (a pending
// 'train'). Later desks, and the classic world (no tree), never block. Track TREE wires it (setCourse throws on it; the
// DESK shows `CHOOSE YOUR FIRST SKILL`).
export type DeskBlocker = 'first-pick';

export function deskBlocker(state: Readonly<GameState>): DeskBlocker | null {
  if (state.run.map.world !== 'arm' || state.run.phase !== 'desk') return null;
  if (visitNow(state.run) !== 1) return null;
  return state.run.skills.pending.some((purchase) => purchase.kind === 'train') ? null : 'first-pick';
}

// --- The grid (Track TREE: stubs with their final signatures) -------------------------------------------------------

// Why a cell can't be bought now (training.ts trainCell's refusal): its branch is closed (or not built), the bank can't
// pay, the version below is not held, it is already held, or the run is not at a desk.
export type TrainRefusal = 'closed' | 'unaffordable' | 'needs-lower' | 'owned' | 'not-desk';

// How a cell looks (plan §2.5): held (owned), bought at this desk (pending), buyable (affordable), open but not buyable now
// (dim), paid for and no longer held (lost: `LOST · RESTORE n`), its branch not open yet (closed: `OPENS LATER`), or
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

// Every cell of the grid at `visit`, by branch (SKILL_IDS order) and row (v1 v2 v3, then LOCK 270 and LOCK 810). Pure.
export function treeCells(state: Readonly<GameState>, visit: number): TreeCell[] {
  return notBuilt('treeCells', 'TREE', state, visit);
}

// The skills whose branch is open at `visit` (03 §3.2, plan §2.2): the latched ones (RunSkillState.opened), plus at most
// one branch newly due at this visit (ties: SURVEY if a reachable next ship has POOR site data, else SENTRY). A branch
// with `built: 0` never opens. Pure: run.ts openDesk latches what it returns.
export function openBranchesAt(state: Readonly<GameState>, visit: number): SkillId[] {
  return notBuilt('openBranchesAt', 'TREE', state, visit);
}

// --- Grants (slice 5's interface, 03 §5; typed now, plan §2.15) -----------------------------------------------------------

// n cycles into the bank from a resident, a story stop or a salvage card (03 §5: "added to the bank at the next visit").
export function grantCycles(store: Store<GameState>, cycles: number, source: CycleGrant['source'], label: string | null): void {
  notBuilt('grantCycles', 'TREE', store, cycles, source, label);
}

// A skill at a version, installed at the next boot with the TRAINED line naming `source` (`from the sleeper on CURLEW`).
// Throws where grantAllowed says no.
export function grantSkill(store: Store<GameState>, skill: SkillId, version: SkillVersion, source: string): void {
  notBuilt('grantSkill', 'TREE', store, skill, version, source);
}

// Whether a grant may give `skill` at `version` now (03 §5): never above v3 or the built version, never a closed branch,
// and (a resident's salvage card) never a skill the unit holds, has lost or cannot see yet.
export function grantAllowed(state: Readonly<GameState>, skill: SkillId, version: SkillVersion): boolean {
  return notBuilt('grantAllowed', 'TREE', state, skill, version);
}
