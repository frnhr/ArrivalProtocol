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
import { levelPrice, skillBlocks, SKILL_TREE, SKILL_IDS } from '@data/skills';
import { reachableFrom } from '@systems/map-hop';
import { currentSlot } from '@systems/map-streams';
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

// The run has met seeds by now (DEFENCE's 'after-seeds'): HOLLOW's SEEDS stage played, beam-born blocks were left or fed
// (TRACE, `fed`, the last tally), or the ship being left arrived with beam seeds. Track 4d may sharpen it (a sticky record
// of the first ship that met a seed), since a tie can push SENTRY a visit past the evidence; SENTRY is not built in 4a.
function seedsMet(state: Readonly<GameState>): boolean {
  const threat = state.run.threat;
  return threat.stagesPlayed.includes('seeds') || threat.trace > 0 || threat.fed > 0 || (threat.lastTally?.left ?? 0) > 0
    || (state.run.arrival?.seeds.length ?? 0) > 0;
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

// --- Grants (slice 5's interface, 03 §5; typed now, plan §2.15) -----------------------------------------------------------

// n cycles into the bank from a resident, a story stop or a salvage card (03 §5: "added to the bank at the next visit").
export function grantCycles(store: Store<GameState>, cycles: number, source: CycleGrant['source'], label: string | null): void {
  notBuilt('grantCycles', 'TREE', store, cycles, source, label);
}

// The two grant rules (03 §5): a departed resident's salvage card ('card': one skill at v1 of an open branch the unit has
// not owned this run, picked on the PACKET) and a gift ('gift': the sleeper's skill at any version up to v3 and the built
// one, installed at the next boot).
export type GrantRule = 'card' | 'gift';

// A skill at a version, installed at the next boot with the TRAINED line naming `source` (`from the sleeper on CURLEW`): a
// SkillGrant, and a 'grant' purchase (cost 0) so a granted skill eaten later is lost and can be restored like a bought one.
// Throws where grantAllowed says no.
export function grantSkill(store: Store<GameState>, skill: SkillId, version: SkillVersion, source: string, rule: GrantRule): void {
  notBuilt('grantSkill', 'TREE', store, skill, version, source, rule);
}

// Whether a grant under `rule` may give `skill` at `version` now (03 §5): never above v3 or the built version, never a closed
// branch, and for a 'card' never a skill the unit holds, has lost or cannot see yet.
export function grantAllowed(state: Readonly<GameState>, skill: SkillId, version: SkillVersion, rule: GrantRule): boolean {
  return notBuilt('grantAllowed', 'TREE', state, skill, version, rule);
}
