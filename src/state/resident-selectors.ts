// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §6.2). The FOUNDATION wrote the final
// signatures; the hot-path readers answer neutrally on a ship with no corrupted resident and never throw. Others ask by message.
import type { GameState } from '@state/schema';
import type { DriverSegment, ResidentSegment } from '@/types/segment';
import type { CorruptedState } from '@/types/resident';
import type { GhostSpec } from '@systems/capabilities';
import { driversInMemory } from '@state/selectors';
import { getOpsBySeg } from '@systems/ops-core';
import { WARDEN_TEXT } from '@data/warden-text';
import {
  RESIDENT_GHOST, RESIDENT_GHOST_DELETING, RESIDENT_GHOST_ANGRY, RESIDENT_LOCK_MAX, RESIDENT_LOCK_PODS_PER,
} from '@data/tuning';

// The corrupted resident's pure readers (04 §3.12, plan §2.7). Pure: they read the state (and, for a DELETE running on the
// file, the ops core, as capabilities.ts reads its threads) and change nothing, so the sim (capabilities.ts, orbit-sim
// through it), guidance, the HUD and the tests share one answer.

// The corrupted resident's own file (`WARDEN.sys`), or null: none aboard, or it was deleted.
export function residentFile(state: Readonly<GameState>): ResidentSegment | null {
  for (const seg of state.memory) if (seg.type === 'resident') return seg;
  return null;
}

// The corrupted resident's machine while it is still the ship's problem: awake (bursting and locking) or paid quiet. null
// with none aboard, before its wake, and once it is deleted or cured.
function standing(state: Readonly<GameState>): CorruptedState | null {
  const corrupted = state.resident.corrupted;
  return corrupted !== null && (corrupted.phase === 'awake' || corrupted.phase === 'quiet') ? corrupted : null;
}

// A DELETE runs on WARDEN.sys now (04 §3.12: a burst every 4 tac s meanwhile).
export function residentDeleting(state: Readonly<GameState>): boolean {
  const file = residentFile(state);
  return file !== null && getOpsBySeg(file.id).some((operation) => operation.kind === 'delete');
}

// It is angry: a REFUSE or a timeout less than RESIDENT_ANGRY_SEC ago (plan R8).
export function residentAngry(state: Readonly<GameState>): boolean {
  const corrupted = state.resident.corrupted;
  return corrupted !== null && corrupted.angryUntilAi !== null && state.clock.aiSec < corrupted.angryUntilAi;
}

// What the resident fires now (plan R4–R5, §2.7 step 3), or null: RESIDENT_GHOST while awake in flight with its file above
// 0%, RESIDENT_GHOST_DELETING while a DELETE runs on it, RESIDENT_GHOST_ANGRY before angryUntilAi; null when dormant, quiet,
// deleted or cured, and always in the landing (R4: the arm's limp rule). capabilities.ts deriveCapabilities composes it with
// Thrust Ctrl's own (the stronger push wins, `ghostBy` names the source). The specs are tuning's own objects, so orbit-sim's
// schedule (keyed on the spec) is drawn again only when the spec really changes.
export function residentGhostSpec(state: Readonly<GameState>): GhostSpec | null {
  const corrupted = state.resident.corrupted;
  if (corrupted === null || corrupted.phase !== 'awake' || state.run.phase !== 'flight') return null;
  const file = residentFile(state);
  if (file === null || file.integrity <= 0) return null;
  if (residentDeleting(state)) return RESIDENT_GHOST_DELETING;
  if (residentAngry(state)) return RESIDENT_GHOST_ANGRY;
  return RESIDENT_GHOST;
}

// The corrupted resident is awake on this ship (its bursts and locks may come).
export function corruptedAwake(state: Readonly<GameState>): boolean {
  return state.resident.corrupted?.phase === 'awake';
}

// Whole seconds a lock's countdown shows (`... 3`): rounded up, never 0 while it stands (as selectors verbSecondsLeft).
export function lockSecondsLeft(leftSec: number): number {
  return Math.max(1, Math.ceil(leftSec));
}

// A lock's telegraph as it reads now (`> LOCK POD 07 ... 2`): its number from state.resident.corrupted.lock's own clock, the
// way the TERMINAL counts it and the ticker shows it from amber (flight-hud.ts liveVerbText reads it for a 'resident' line:
// review m3). null while no lock counts down.
export function liveLockText(state: Readonly<GameState>): string | null {
  const lock = state.resident.corrupted?.lock ?? null;
  return lock === null ? null : WARDEN_TEXT.lockTelegraph(lock.pod, lockSecondsLeft(lock.leftSec));
}

// The driver `segId` is the one a lock counts down on: it takes a SCAN, the cheap block (04 §3.12; tool-targets.ts asks).
export function lockAimsAt(state: Readonly<GameState>, segId: string): boolean {
  return state.resident.corrupted?.lock?.segId === segId;
}

// The drivers a resident has locked (DriverSegment.lockedBy set), in address order.
export function lockedDrivers(state: Readonly<GameState>): DriverSegment[] {
  return driversInMemory(state).filter((driver) => driver.lockedBy !== undefined);
}

// The most locks it lands on this ship (04 §3.12): ceil(pods ÷ 4), never more than 3 (a TIGHT ship's 8 pods: 2).
export function lockCap(state: Readonly<GameState>): number {
  return Math.min(RESIDENT_LOCK_MAX, Math.ceil(state.landing.pods.length / RESIDENT_LOCK_PODS_PER));
}

// This ship's one DEAL is the resident's (04 §3.9's "one deal per ship", plan R8): it was offered here, standing or settled.
// HOLLOW's hollow-deal.ts dealOpen reads it, so HOLLOW's deal waits for a later ship by its own rule. With no corrupted
// resident it is false.
export function residentDealOnThisShip(state: Readonly<GameState>): boolean {
  const deal = state.resident.corrupted?.deal ?? null;
  return deal !== null && deal.phase !== 'none';
}

// The resident the THRUST CTRL pip names (`OVERRIDDEN · WARDEN.sys`, its jump to the file; plan §2.7 step 3, pillar 4): it
// fires the engine now (its spec is live) and has fired it at least once on this ship. null otherwise.
export function engineOverriddenBy(state: Readonly<GameState>): { name: string; fileId: string } | null {
  const corrupted = standing(state);
  const def = state.resident.def;
  if (corrupted === null || def === null || corrupted.bursts === 0 || residentGhostSpec(state) === null) return null;
  const file = residentFile(state);
  return file === null ? null : { name: def.name, fileId: file.id };
}
