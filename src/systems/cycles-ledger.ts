// Playtest 1: Track B-DESK owns this file (docs/phase3/impl/playtest-1-plan.md §3.6, §4 Batch B). Others ask by message.
// The cycles ledger (Fran's note 15: "training cycles seem to just magically appear"): the REPOSITORY's COMPILE HERE half
// shows where this desk's cycles came from and where they went, one row each, so the bank in its head is a sum the kid can
// read. Pure, over the run's skill history (RunSkillState: what each ship earned, what was granted, what was bought); the
// bank is skill-tree.ts bankOf's, and the rows add up to it (cyclesLedger throws when they do not).
// • CARRIED OVER: what earlier desks left unspent (every ship before the one just left, every grant before this visit,
//   less everything bought before this desk);
// • the ship just left, as its LANDING REPORT line said it (`HALCYON · ARRIVED +1 · LANDED 83% +4`);
// • this visit's grants: the first desk's CORE RESERVE, a resident's lesson (`taught by MOTH`), a SALVAGE card, a story;
// • this desk's purchases, negative, each with UNDO while it is the last of its skill (training-model.ts trainingPending).
// A grant is "this visit's" when it carries this visit's number (CycleGrant.visit, skill-levels.ts visitNow). B-ORDER's
// LEAVE ORBIT grants the +2 CYCLES salvage at the pick, before the desk, so it is this visit's; until then the card is a
// grant of the visit before (training.ts commitTraining, at TRANSMIT ▸) and reads as CARRIED OVER. The sum is right either
// way. A v1 → v2 save migration's grant is always carried.
import type { GameState } from '@state/schema';
import type { CycleGrant, SkillPurchase } from '@/types/skill';
import { bankOf, earnedCycles, visitNow } from '@systems/skill-tree';
import { trainingPending } from '@systems/training-model';
import { shipSummaryAt } from '@systems/map-run';
import { TRAINING_TEXT } from '@data/training-text';
import { CYCLES_LANDED_STEPS, LOCK_RANGE_TAC } from '@data/tuning';

export type LedgerKind = 'carried' | 'ship' | 'grant' | 'spent';

export interface LedgerRow {
  kind: LedgerKind;
  amount: number;              // signed: + came in, − went out
  amountText: string;          // +5 / −3
  text: string;                // HALCYON · ARRIVED +1 · LANDED 83% +4 / AUTOBURN v1
  undo: number | null;         // a purchase's place in run.skills.pending while UNDO can take it back; else null
}

export interface CyclesLedger {
  rows: LedgerRow[];
  bank: number;                // the rows' sum: skill-tree.ts bankOf
}

function row(kind: LedgerKind, amount: number, text: string, undo: number | null = null): LedgerRow {
  return { kind, amount, amountText: TRAINING_TEXT.ledger.amount(amount), text, undo };
}

function grantText(grant: Readonly<CycleGrant>): string {
  switch (grant.source) {
    case 'first-pick': return TRAINING_TEXT.ledger.reserve;
    case 'salvage': return TRAINING_TEXT.ledger.salvage;
    case 'resident': return grant.label ?? TRAINING_TEXT.ledger.story;
    case 'story': return grant.label ?? TRAINING_TEXT.ledger.story;
    case 'migration': throw new Error('cyclesLedger: a migration grant is never this visit\'s');
  }
}

// What a purchase bought, as its cell names it (`AUTOBURN v2`, `AUTOBURN LOCK 270`, `RESTORE AUTODROP v1`).
function purchaseText(purchase: Readonly<SkillPurchase>): string {
  const name = TRAINING_TEXT.skills[purchase.skill].name;
  if (purchase.kind === 'lock') return `${name} ${TRAINING_TEXT.lockName(LOCK_RANGE_TAC[purchase.to.lock])}`;
  const cell = TRAINING_TEXT.cellName(name, purchase.to.version);
  return purchase.kind === 'restore' ? TRAINING_TEXT.ledger.restored(cell) : cell;
}

function isThisVisit(grant: Readonly<CycleGrant>, visit: number): boolean {
  return grant.source !== 'migration' && grant.visit === visit;
}

// The ledger at the desk (phase 'desk'; the run's last earning is the ship just left). A CARRIED OVER of 0 is left out; the
// ship's row is always there (every ship pays ARRIVED +1).
export function cyclesLedger(state: Readonly<GameState>): CyclesLedger {
  const run = state.run;
  if (run.phase !== 'desk') throw new Error(`cyclesLedger: not on the DESK (phase ${run.phase})`);
  const skills = run.skills;
  const visit = visitNow(run);
  const last = skills.earned.at(-1);
  if (last === undefined) throw new Error('cyclesLedger: a desk with no ship ended');
  const fresh = skills.grants.filter((grant) => isThisVisit(grant, visit));
  const bank = bankOf(skills);
  const spent = skills.pending.reduce((sum, purchase) => sum + purchase.cost, 0);
  const lastPaid = earnedCycles(last);
  const carried = bank + spent - lastPaid - fresh.reduce((sum, grant) => sum + grant.cycles, 0);
  if (carried < 0) throw new Error(`cyclesLedger: ${carried} carried over (bank ${bank}, spent here ${spent}, earned ${lastPaid})`);

  const how = last.landed === CYCLES_LANDED_STEPS ? TRAINING_TEXT.report.perfectWord : TRAINING_TEXT.report.earned(last.pct, last.landed);
  const rows: LedgerRow[] = [];
  if (carried > 0) rows.push(row('carried', carried, TRAINING_TEXT.ledger.carried));
  rows.push(row('ship', lastPaid, TRAINING_TEXT.ledger.ship(shipSummaryAt(run.map, last.slot).name, how)));
  for (const grant of fresh) rows.push(row('grant', grant.cycles, grantText(grant)));
  for (const pending of trainingPending(skills.pending)) {
    const purchase = skills.pending[pending.index]!;
    rows.push(row('spent', -purchase.cost, purchaseText(purchase), pending.undoable ? pending.index : null));
  }
  const sum = rows.reduce((total, entry) => total + entry.amount, 0);
  if (sum !== bank) throw new Error(`cyclesLedger: the rows add up to ${sum}, the bank is ${bank}`);
  return { rows, bank };
}
