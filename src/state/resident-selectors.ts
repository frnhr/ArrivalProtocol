// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §6.2). The FOUNDATION wrote the final
// signatures; the stubs on hot paths answer neutrally and never throw (plan §6.1 item 5). Others ask by message.
import type { GameState } from '@state/schema';
import type { DriverSegment } from '@/types/segment';
import type { GhostSpec } from '@systems/capabilities';
import { driversInMemory } from '@state/selectors';

// The corrupted resident's pure readers (04 §3.12, plan §2.7). Pure: they read the state and change nothing, so the sim
// (capabilities.ts, orbit-sim through it), guidance, the HUD and the tests share one answer.

// What the resident fires now (plan R4–R5, §2.7 step 3), or null: RESIDENT_GHOST while awake in flight with its file above
// 0%, RESIDENT_GHOST_DELETING while a DELETE runs on it, RESIDENT_GHOST_ANGRY before angryUntilAi; null when dormant, quiet,
// deleted or cured, and always in the landing (the arm's limp rule). capabilities.ts deriveCapabilities composes it with
// Thrust Ctrl's own (the stronger push wins, `ghostBy` names the source).
// FOUNDATION stub (hot path, neutral): null.
export function residentGhostSpec(state: Readonly<GameState>): GhostSpec | null {
  void state;
  return null;
}

// The corrupted resident is awake on this ship (its bursts and locks may come). FOUNDATION stub (neutral): false.
export function corruptedAwake(state: Readonly<GameState>): boolean {
  void state;
  return false;
}

// The drivers a resident has locked (DriverSegment.lockedBy set), in address order. Built by the FOUNDATION: no lock is
// ever landed until WARDEN, so it is empty.
export function lockedDrivers(state: Readonly<GameState>): DriverSegment[] {
  return driversInMemory(state).filter((driver) => driver.lockedBy !== undefined);
}

// This ship's one DEAL is the resident's (04 §3.9's "one deal per ship", plan R8): it was offered here, standing or settled.
// HOLLOW's hollow-deal.ts dealOpen reads it, so HOLLOW's deal waits for a later ship by its own rule. Built by the
// FOUNDATION: with no corrupted resident it is false.
export function residentDealOnThisShip(state: Readonly<GameState>): boolean {
  const deal = state.resident.corrupted?.deal ?? null;
  return deal !== null && deal.phase !== 'none';
}
