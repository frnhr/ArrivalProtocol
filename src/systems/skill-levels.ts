// The skill tree's levels (phase 3 slice 4; slice-4-plan §2.2): what the unit holds, what the run paid for, what it lost
// and RESTORE's price, read from memory and the run's history alone. A leaf (data and selectors only, no map): DELETE's
// confirm (tool-targets.ts) and the other low modules read it without pulling the map in; systems/skill-tree.ts re-exports
// it with the rest of the tree's rules. Track TREE owns this file.
import type { GameState } from '@state/schema';
import type { Segment } from '@/types/segment';
import type { SkillId, SkillLevel, SkillVersion, LockLevel, CellRow, LostLevel, RunSkillState } from '@/types/skill';
import { skillFilesOf } from '@state/selectors';
import { levelPrice } from '@data/skills';
import { RESTORE_FRACTION } from '@data/tuning';

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
