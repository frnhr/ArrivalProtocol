// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.7, §6.2). The FOUNDATION wrote the final
// signatures: the hot-path stubs answer neutrally and never throw; the entry points that change state throw through
// not-built.ts until WARDEN builds them (plan §6.1 item 5). Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ResidentSegment } from '@/types/segment';
import type { ResidentFate } from '@/types/resident';
import type { ValidTargetContext } from '@systems/tool-targets';
import { TOOL_REFUSAL, type ToolRefusal, type ConfirmText } from '@data/tool-text';
import { notBuilt } from '@systems/not-built';
import { RESIDENT_DELETE_BASE_SEC, RESIDENT_DELETE_PER_BLOCK_SEC } from '@data/tuning';

// The corrupted resident (04 §3.12, plan §2.7): its wake (R9), the bursts (state/resident-selectors.ts residentGhostSpec),
// the locks (R6), its DEAL (R8), DELETE (R25) and the REPAIR cure (part b), the late surprise (part e), CONTROL's lines and
// its record. All its machine state is state.resident.corrupted (plan R2); module state is only what §2.3 lists (`touched`,
// the DEAL's answer), reset with the world.

// Mounted by systems/residents.ts mountResidents (after THE DEAL, as main.ts and harness6 mount it). Built by the
// FOUNDATION as a no-op: WARDEN adds its ticks and subscriptions here. Returns the unmount.
export function mountResidentCorrupted(store: Store<GameState>): () => void {
  void store;
  return () => {};
}

// Why the active tool can't be used on WARDEN.sys (plan R25: SCAN IT FIRST before a SCAN on a `reported faulty` ship, MOVE
// and COPY refused), or null when the kind allows it: the tools' own rules then still apply (REPAIR's charge, ALREADY 100%,
// an infection). tool-targets.ts targetRefusal asks it through residents.ts residentToolRule.
// FOUNDATION stub (hot path, neutral): NOTHING TO DO THERE (no such file exists until WARDEN raises RESIDENT_BUILT).
export function corruptedToolRule(seg: Readonly<ResidentSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  void seg;
  void ctx;
  return TOOL_REFUSAL.notAFile;
}

// How long DELETE takes on WARDEN.sys (04 §3.12: 1.0 + 0.5 per block, 6.0 s for 10 blocks: HOLLOW's per-block DELETE).
// state/actions.ts deleteSec asks it through residents.ts residentDeleteSec. Built by the FOUNDATION (pure).
export function corruptedDeleteSec(seg: Readonly<ResidentSegment>): number {
  return RESIDENT_DELETE_BASE_SEC + RESIDENT_DELETE_PER_BLOCK_SEC * seg.size;
}

// DELETE's inline confirm on WARDEN.sys (`DELETE WARDEN.sys? It is the ship's own mind.`), or null. tool-targets.ts
// deleteQuestion asks it through residents.ts residentDeleteQuestion. FOUNDATION stub (neutral): null.
export function corruptedDeleteQuestion(state: Readonly<GameState>, seg: Readonly<ResidentSegment>): ConfirmText | null {
  void state;
  void seg;
  return null;
}

// The ship is ending (systems/residents.ts residentShipEnd, from run.ts endShip, before SHIP DONE's save): end any telegraph
// and withdraw a standing DEAL, so the slice is at rest (the codec checks it), and say how the resident's ship ended for it:
// deleted, cured, paid (an ACCEPT) or ignored, and the pods still locked when the landing ended (plan §2.7 step 8).
// FOUNDATION stub (neutral): ignored, none locked.
export function corruptedShipEnd(store: Store<GameState>): { fate: Extract<ResidentFate, 'deleted' | 'cured' | 'paid' | 'ignored'>; podsParkedLocked: number } {
  void store;
  return { fate: 'ignored', podsParkedLocked: 0 };
}

// --- Debug entry points (debug.ts __ap.resident.*; plan §2.12). They change state: they throw until WARDEN builds them. ---

// __ap.resident.wake(): the resident wakes now (its first line, CONTROL's on a faulty ship, 'resident-wake').
export function wakeResidentNow(store: Store<GameState>): void {
  notBuilt('wakeResidentNow', 'WARDEN', store);
}

// __ap.resident.lock(pod?): a lock telegraphs now on `pod` (default: the next pod in launch order not locked yet).
export function lockNow(store: Store<GameState>, pod?: number): void {
  notBuilt('lockNow', 'WARDEN', store, pod);
}

// __ap.resident.deal(): the resident's DEAL is offered now (it needs a locked pod and HOLLOW's deal idle, plan R8).
export function offerResidentDealNow(store: Store<GameState>): void {
  notBuilt('offerResidentDealNow', 'WARDEN', store);
}

// __ap.resident.angry(): as if its DEAL was refused now (RESIDENT_ANGRY_SEC of faster locks and bursts).
export function angerResidentNow(store: Store<GameState>): void {
  notBuilt('angerResidentNow', 'WARDEN', store);
}
