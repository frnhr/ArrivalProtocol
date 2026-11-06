// TRAINING at the DESK (phase 3 slice 4; docs/phase3/03-skills.md §3.3, §4; slice-4-plan §2.4–§2.6): buying a cell, UNDO,
// RESTORE, PACK AS on the PACKET, and the commit at TRANSMIT ▸. Track TREE owns this file after the FOUNDATION (plan §5.2);
// the tab's model is Track UI's systems/training-model.ts.
// • Every purchase is a SkillPurchase in run.skills.pending, undoable until TRANSMIT ▸ (◀ CHART goes back to the desk with
//   them kept); its file joins the packet through draft.ts planPacket (skill-files.ts skillPacketPlan), and commitTraining
//   makes them bought as the packet crosses. Nothing here is random, so UNDO is always safe (03 §3.3).
// • PACK AS lives on the transit plan (TransitPlan.packAs) like the drops: ◀ CHART forgets it.
import type { Store } from '@state/store';
import type { GameState, TransitPlan } from '@state/schema';
import type { SkillId, SkillLevel, CellRow, SkillPurchase } from '@/types/skill';
import {
  treeCells, visitNow, held, paid, lostLevels, restorePrice, bankOf, levelAbove, type TrainRefusal,
} from '@systems/skill-tree';
import { skillPacketPlan } from '@systems/skill-files';
import { planPacket } from '@systems/draft';
import { isSkillFile } from '@state/selectors';
import { skillBlocks, SKILL_TREE } from '@data/skills';
import { CYCLES_CARD_CYCLES } from '@data/tuning';

// The required first pick is enforced: setCourse throws on skill-tree.ts deskBlocker, and the helpers that make the pick for
// a caller that only wants to sail (the suites' tests/unit/support/desk.ts setCourseFromDesk, __ap.course) make it.
export const FIRST_PICK_ENFORCED = true;

function sameRow(a: CellRow, b: CellRow): boolean {
  return a.kind === 'version' ? b.kind === 'version' && a.version === b.version : b.kind === 'lock' && a.level === b.level;
}

// The kid buys a cell (TRAIN): a SkillPurchase joins this desk's pending ones, or the refusal says why not (the cell's own,
// skill-tree.ts treeCells: one rule for the grid's looks and the buy). `to` is the skill's whole level once it lands: a
// version keeps the held lock, a LOCK RANGE level the held version. Its file joins the packet at TRANSMIT through planPacket.
export function trainCell(store: Store<GameState>, skill: SkillId, row: CellRow): TrainRefusal | null {
  const state = store.getState();
  if (state.run.phase !== 'desk') return 'not-desk';
  const visit = visitNow(state.run);
  const cell = treeCells(state, visit).find((candidate) => candidate.skill === skill && sameRow(candidate.row, row));
  if (cell === undefined) throw new Error(`trainCell: ${SKILL_TREE[skill].fileName} has no cell ${JSON.stringify(row)}`);
  if (cell.refusal !== null) return cell.refusal;
  const base = held(state, skill);
  const to: SkillLevel = row.kind === 'version'
    ? { version: row.version, lock: base?.lock ?? 0 }
    : { version: base!.version, lock: row.level };
  const purchase: SkillPurchase = { skill, kind: row.kind === 'version' ? 'train' : 'lock', to, cost: cell.price, visit };
  store.update((draft) => { draft.run.skills.pending.push(purchase); });
  return null;
}

// UNDO (until TRANSMIT ▸, 03 §3.3): takes back pending purchase `index`, which must be the last pending one of its skill
// (a lower level under a higher one can't go first). Anything else is a bug: throws, as it does outside the desk (the
// PACKET's ◀ CHART goes back to the desk first; the purchase's file is in the plan there).
export function undoPurchase(store: Store<GameState>, index: number): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') throw new Error(`undoPurchase: not at the DESK (phase ${state.run.phase})`);
  const pending = state.run.skills.pending;
  const purchase = pending[index];
  if (purchase === undefined) throw new Error(`undoPurchase: no pending purchase ${index} (${pending.length} pending)`);
  const later = pending.slice(index + 1).find((other) => other.skill === purchase.skill);
  if (later !== undefined) throw new Error(`undoPurchase: ${SKILL_TREE[purchase.skill].fileName}'s later purchase (${later.kind}) must be undone first`);
  store.update((draft) => { draft.run.skills.pending.splice(index, 1); });
}

// RESTORE (decision 16): one purchase that brings the skill back at its paid level, fresh, for restorePrice(lost). Refused
// away from the desk, on the classic world (no tree), with nothing lost ('owned'), or when the bank can't pay.
export function restoreSkill(store: Store<GameState>, skill: SkillId): TrainRefusal | null {
  const state = store.getState();
  if (state.run.phase !== 'desk') return 'not-desk';
  if (state.run.map.world !== 'arm') return 'closed';
  const paidFor = paid(state.run.skills, skill);
  const lost = lostLevels(skill, held(state, skill), paidFor);
  if (paidFor === null || lost.length === 0) return 'owned';
  const cost = restorePrice(lost);
  if (cost > bankOf(state.run.skills)) return 'unaffordable';
  const purchase: SkillPurchase = { skill, kind: 'restore', to: { ...paidFor }, cost, visit: visitNow(state.run) };
  store.update((draft) => { draft.run.skills.pending.push(purchase); });
  return null;
}

// The skill file PACK AS acts on, at its level, and the plan it lives on; anything else is a bug (throws).
function packAsTarget(state: Readonly<GameState>, segId: string): { plan: TransitPlan; level: SkillLevel; skill: SkillId } {
  const plan = state.run.transit;
  if (state.run.phase !== 'transmit' || plan === null) throw new Error(`setPackAs: not on the PACKET (phase ${state.run.phase})`);
  const seg = state.memory.find((candidate) => candidate.id === segId);
  if (seg === undefined || !isSkillFile(seg)) throw new Error(`setPackAs: ${segId} is not a skill file in memory`);
  // A file trained at this desk is replaced by its fresh one in the packet ('trained' lock): UNDO is the way back there.
  if (state.run.skills.pending.some((purchase) => purchase.skill === seg.upgrade)) {
    throw new Error(`setPackAs: ${seg.name} was trained at this desk (◀ CHART TO UNDO)`);
  }
  return { plan, level: { version: seg.version, lock: seg.lock }, skill: seg.upgrade };
}

// PACK AS (4b, round-2 decision 10): the PACKET packs file `segId` at a lower `level` (null: as it is). A file left behind
// comes back into the packet at that level. Refused (throws) on a file trained at this desk, and on a level that is not
// lower than the file's (the version only goes down; the lock may stay or go down). One update: the plan's numbers worked
// out again by planPacket, as toggleDrop does.
export function setPackAs(store: Store<GameState>, segId: string, level: Readonly<SkillLevel> | null): void {
  const state = store.getState();
  const target = packAsTarget(state, segId);
  if (level !== null) {
    if (!(level.lock <= target.level.lock && levelAbove(target.level, level))) {
      throw new Error(`setPackAs: v${level.version} lock ${level.lock} is not below the file's v${target.level.version} lock ${target.level.lock}`);
    }
    skillBlocks(target.skill, level.version, level.lock);
  }
  const packAs = { ...target.plan.packAs };
  if (level === null) delete packAs[segId];
  else packAs[segId] = { version: level.version, lock: level.lock };
  const dropped = level === null ? target.plan.dropped : target.plan.dropped.filter((id) => id !== segId);
  const packet = planPacket(state.memory, { ...target.plan, dropped, skills: skillPacketPlan(state, packAs) });
  store.update((draft) => {
    if (!draft.run.transit) throw new Error('setPackAs: the transit plan vanished');
    draft.run.transit.packAs = packAs;
    draft.run.transit.dropped = [...dropped];
    draft.run.transit.filesBlocks = packet.filesBlocks;
    draft.run.transit.chargeCarried = packet.chargeCarried;
  });
}

// TRANSMIT ▸ (run.ts transmitNext, before the ship starts, so the BEAM save holds no pending purchase): this desk's pending
// purchases become bought, and the +2 CYCLES salvage card (when it was the pick) becomes a grant at this visit. Every
// purchase must still be payable (the bank throws below 0) and its file in the packet (transmitNext checks the layout).
export function commitTraining(store: Store<GameState>): void {
  const state = store.getState();
  const salvage = state.run.transit?.pick === 'cycles';
  store.update((draft) => {
    const skills = draft.run.skills;
    skills.bought.push(...skills.pending);
    skills.pending = [];
    if (salvage) skills.grants.push({ source: 'salvage', cycles: CYCLES_CARD_CYCLES, visit: visitNow(draft.run), label: null });
  });
  bankOf(store.getState().run.skills);
}

