// Slice 5: Track WARDEN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.7, §6.2). The FOUNDATION wrote the final
// signatures; the hot-path entry points answer neutrally on a ship with no corrupted resident. Others ask by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { DriverSegment, ResidentSegment, Segment } from '@/types/segment';
import type { ResidentFate, ResidentDealOutcome, CorruptedState, LockTelegraph } from '@/types/resident';
import type { ValidTargetContext } from '@systems/tool-targets';
import { onAiTick, onPostTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { onOpsChange, getOpsBySeg, canStartOp, abortOp } from '@systems/ops-core';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { say, sayChoice, withdrawChoice, openChoiceEntry, choiceMayOpen } from '@systems/say';
import { capabilitiesNow } from '@systems/capabilities';
import { garbleText } from '@systems/garble';
import { launchQueue, registerLockRemedy } from '@systems/landing-rules';
import { assertMemoryInvariants, requireAddr, replaceRange, freeSegment, mergeAdjacentFree } from '@systems/memory-ops';
import { childSeed } from '@systems/rng';
import { currentSlot } from '@systems/map-streams';
import { integrityState, getFsTool, chargeLeft } from '@state/selectors';
import { repairChargeEstimate } from '@state/actions';
import { hollowFirstFightDecided } from '@state/threat-selectors';
import { residentFile, lockedDrivers, lockCap, lockSecondsLeft, residentAngry } from '@state/resident-selectors';
import { TOOL_REFUSAL, type ToolRefusal, type ConfirmText } from '@data/tool-text';
import { RESIDENT_TEXT } from '@data/resident-text';
import { WARDEN_TEXT } from '@data/warden-text';
import { layoutOf } from '@data/memory';
import { rmTargets } from '@systems/hollow';
import { IS_DEV } from '@/env';
import {
  RESIDENT_DELETE_BASE_SEC, RESIDENT_DELETE_PER_BLOCK_SEC, RESIDENT_LOCK_FIRST_SEC, RESIDENT_LOCK_EVERY_SEC,
  RESIDENT_LOCK_TELEGRAPH_SEC, RESIDENT_ANGRY_LOCK_FACTOR, RESIDENT_ANGRY_SEC, SURPRISE_WAKE_SEC, SURPRISE_FIRST_LOCK_SEC,
  RESIDENT_GARBLE, RESIDENT_LINE_EVERY_SEC, DEAL_TIMEOUT_SEC, INTEGRITY_MAX,
} from '@data/tuning';

// The corrupted resident (04 §3.12, plan §2.7), DOM-free: its wake (R9), the locks (R6), its DEAL (R8), DELETE (R25) and the
// REPAIR cure (part b), the late surprise (part e), CONTROL's lines and its record. Its bursts are a ghost source
// (state/resident-selectors.ts residentGhostSpec; capabilities.ts composes it with Thrust Ctrl's), counted and worded by
// systems/ghost-thrust.ts. All its machine state is state.resident.corrupted (plan R2); module state is only what §2.3
// lists (`touched`, the DEAL's answer) and `burstHeard` (a burst of its own since the last tick: its looping line), reset
// with the world.
// • THE WAKE. A `reported faulty` resident wakes at the flight's first AI tick; a late surprise (its card said `unknown`)
//   after SURPRISE_WAKE_SEC of calm flight (04's grace), its file's health shown at once (04: no SCAN hunt) and the stamp's
//   event; on the ship HOLLOW boards (review m6: that ship only), only once HOLLOW's first fight there is decided
//   (threat-selectors hollowFirstFightDecided: a kid never learns two new foes at once). Its first line comes then, and on a faulty ship
//   CONTROL's radio line after it.
// • THE CALM CLOCK. calmAiSec, the surprise's wake and the lock clock (lockInSec, a telegraph's leftSec) run on AI time
//   only while the ship is calm: never at TACTICAL in flight, never in a launch window, never while a DEAL stands (its own or
//   HOLLOW's: review m5) (04
//   §3.12, plan R6), so a lock never lands under a burn's NOW line and the kid always has the calm to block it.
// • THE LOCKS. RESIDENT_LOCK_FIRST_SEC after the wake (SURPRISE_FIRST_LOCK_SEC into the flight for a surprise), then every
//   RESIDENT_LOCK_EVERY_SEC from one telegraph's start to the next (× RESIDENT_ANGRY_LOCK_FACTOR while angry), it aims at
//   the next pod in launch order (landing-rules launchQueue: LOAD NEXT's first, never one locked or busy), only while a Core
//   thread is free (the WP11 ruling for verbs: a kid with no thread can't block it; it waits at 0 until one is). For
//   RESIDENT_LOCK_TELEGRAPH_SEC it counts down in the TERMINAL (`> LOCK POD 07 ... 3`) with a warning that holds SKIP. Any
//   op on that driver meanwhile, or one already running on it, blocks it (`... BLOCKED`): SCAN is the cheap one (the lead's
//   tool-targets.ts lets SCAN aim at the driver a lock counts down on). Otherwise the driver's lockedBy is set: its pod
//   can't launch (`POD LOCKED`) until the resident is deleted, cured or paid. At most lockCap a ship (ceil(pods ÷ 4) ≤ 3).
// • THE DEAL (plan R8), once a ship, while it holds a locked pod, HOLLOW's own deal is idle and no TERMINAL choice stands:
//   it names the fair tier's file (hollow.ts rmTargets) with THE DEAL's 15 s. ACCEPT deletes that file at once, releases
//   every lock and makes it quiet for the ship (no bursts, no locks; it can still be deleted or cured). REFUSE or the
//   timer: RESIDENT_ANGRY_SEC of locks at 0.6 × the interval and bursts twice as often. Withdrawn if the file goes or a
//   MOVE starts on it first, or the ship (or its landing) ends.
// • THE END OF IT. DELETE (6.0 s, its own confirm, a burst every 4 tac s meanwhile) or REPAIR to 100 (about 12 charge):
//   either releases every lock and stops it for good; DELETE stamps `RESIDENT DELETED` (its last line, CONTROL's thanks),
//   the cure says thank you (`RESIDENT CURED`). Both are seen on the AI tick: the file gone, or at 100.
// Runs on the AI tick after HOLLOW's and its DEAL's (residents.ts mounts it there), DOM-free.

const LOCK_ALERT_ID = 'resident-lock';

// An op touched the telegraphed driver since the telegraph began (heard on the ops core, acted on in the tick: an op started
// and cancelled between two ticks still blocks it), as hollow-verbs.ts's.
let touched = false;
// The TERMINAL's answer to its DEAL (or the timer's null), acted on at the next tick, as hollow-deal.ts's.
let answer: { picked: string | null } | null = null;
// One of its own bursts started since the last tick (ghost-start while it is the source): its looping line is said then.
let burstHeard = false;

function resetCorrupted(): void {
  touched = false;
  answer = null;
  burstHeard = false;
}

function nameOf(state: Readonly<GameState>): string {
  const def = state.resident.def;
  if (def === null || def.kind !== 'corrupted') throw new Error('resident-corrupted: no corrupted resident aboard');
  return def.name;
}

// A live ship whose landing has not ended: something is left to lock or bargain over.
function live(state: Readonly<GameState>): boolean {
  return isLivePhase(state) && !(state.run.phase === 'landing' && state.landing.ended !== null);
}

// The calm clock stands still (see the header).
function clockHeld(state: Readonly<GameState>, corrupted: Readonly<CorruptedState>): boolean {
  // Its own DEAL standing (Deviation 10), or HOLLOW's (review m5: no lock lands while the kid reads HOLLOW's 15 s offer, as
  // HOLLOW's verbs wait on it).
  if (corrupted.deal.phase === 'offered' || state.hollow.deal.phase === 'offered') return true;
  if (state.run.phase === 'flight') return state.clock.pace === 'tactical';
  return state.landing.window !== null;
}

// What INSPECT says of its file now: the card's desc until a SCAN, then how it stands (warden-text desc).
function descNow(state: Readonly<GameState>, file: Readonly<ResidentSegment>, corrupted: Readonly<CorruptedState>): string {
  if (!file.scanned) return state.resident.def?.shown === 'unknown' ? RESIDENT_TEXT.desc.surprise : RESIDENT_TEXT.desc.faulty;
  switch (corrupted.phase) {
    case 'dormant': return WARDEN_TEXT.desc.dormant;
    case 'awake': return WARDEN_TEXT.desc.awake;
    case 'quiet': return WARDEN_TEXT.desc.quiet;
    case 'cured': return WARDEN_TEXT.desc.cured;
    case 'deleted': return file.desc ?? WARDEN_TEXT.desc.awake;
  }
}

// Due now (see the header). On HOLLOW's ship the first fight may be decided only after ORBIT LOCK (HOLLOW boarded there sleeps
// until the loop closes): it wakes in the landing then, where it locks but never fires the engine (R4).
function wakeDue(state: Readonly<GameState>, corrupted: Readonly<CorruptedState>): boolean {
  if (!live(state)) return false;
  if (corrupted.surprise && corrupted.calmAiSec < SURPRISE_WAKE_SEC) return false;
  // On the ship HOLLOW boards (R9; its first ship aboard, age 1): only once its first fight here is decided (04 §3.12: a kid
  // never learns two new foes at once). Review m6: on a later ship HOLLOW is no longer new, so the wake is the flight's first
  // tick (or the surprise's 20 s) as anywhere else.
  const boardsHere = state.run.threat.aboard && state.run.threat.age === 1;
  return !boardsHere || hollowFirstFightDecided(state);
}

function wake(store: Store<GameState>): void {
  const state = store.getState();
  const corrupted = state.resident.corrupted!;
  const name = nameOf(state);
  const surprise = corrupted.surprise;
  store.update((draft) => {
    const machine = draft.resident.corrupted!;
    machine.phase = 'awake';
    machine.wokeAtAi = draft.clock.aiSec;
    machine.lockInSec = surprise ? SURPRISE_FIRST_LOCK_SEC - SURPRISE_WAKE_SEC : RESIDENT_LOCK_FIRST_SEC;
    // The late surprise skips the hunt (04 §3.12): its health shows from its wake, and SCAN IT FIRST never applies.
    const file = draft.memory.find((seg): seg is ResidentSegment => seg.type === 'resident');
    // Review M2: drawn as a plain ship file until now; its own amber from the wake.
    if (file?.hidden === true) {
      delete file.hidden;
      draft.ui.memoryRev++;
    }
    if (surprise && file !== undefined && !file.scanned) {
      file.scanned = true;
      if (file.state === undefined || file.state === 'intact' || file.state === 'partial' || file.state === 'corrupt') {
        file.state = integrityState(file.integrity);
      }
      draft.ui.memoryRev++;
    }
  });
  say('resident', surprise ? WARDEN_TEXT.surprise(name) : WARDEN_TEXT.wake(name), { critical: true });
  if (!surprise) say('control', WARDEN_TEXT.controlFaulty(state.level.shipName), { critical: true });
  emit('resident-wake', { kind: 'corrupted', name, surprise });
}

// --- The locks -------------------------------------------------------------------------------------------------------------

function lockInterval(state: Readonly<GameState>): number {
  return RESIDENT_LOCK_EVERY_SEC * (residentAngry(state) ? RESIDENT_ANGRY_LOCK_FACTOR : 1);
}

// The pod it aims at next (plan R6): the next in launch order that is not locked yet (launchQueue skips locked and busy
// drivers), or the one asked for (?debug).
function lockTarget(state: Readonly<GameState>, pod?: number): DriverSegment | null {
  const queue = launchQueue(state);
  if (pod === undefined) return queue[0] ?? null;
  return queue.find((driver) => driver.pod === pod) ?? null;
}

function startLock(store: Store<GameState>, driver: Readonly<DriverSegment>): void {
  touched = false;
  say('resident', WARDEN_TEXT.lockTelegraph(driver.pod, lockSecondsLeft(RESIDENT_LOCK_TELEGRAPH_SEC)), { critical: true, verbCountdown: true });
  const entryId = store.getState().log.entries.at(-1)!.id;
  const lock: LockTelegraph = {
    pod: driver.pod, segId: driver.id, leftSec: RESIDENT_LOCK_TELEGRAPH_SEC, totalSec: RESIDENT_LOCK_TELEGRAPH_SEC, entryId,
  };
  store.update((draft) => { draft.resident.corrupted!.lock = lock; });
  raiseAlert(store, { id: LOCK_ALERT_ID, layer: 'mind', severity: 'warn', text: WARDEN_TEXT.lockAlert(driver.pod), inhibitsSkip: true });
  emit('resident-lock', { pod: driver.pod, phase: 'telegraph' });
}

// The telegraph ends (blocked, landed, or called off) and its warning goes.
function endLock(store: Store<GameState>, count: 'blocked' | 'landed' | null): void {
  if (store.getState().resident.corrupted?.lock === null) return;
  store.update((draft) => {
    const machine = draft.resident.corrupted!;
    machine.lock = null;
    if (count === 'blocked') machine.locksBlocked++;
    if (count === 'landed') machine.locksLanded++;
  });
  touched = false;
  clearAlert(store, LOCK_ALERT_ID);
}

function blockLock(store: Store<GameState>, lock: Readonly<LockTelegraph>): void {
  endLock(store, 'blocked');
  say('resident', WARDEN_TEXT.lockBlocked(lock.pod), { critical: true, tone: 'good' });
  emit('resident-lock', { pod: lock.pod, phase: 'blocked' });
}

function landLock(store: Store<GameState>, lock: Readonly<LockTelegraph>, driver: DriverSegment): void {
  const name = nameOf(store.getState());
  store.update((draft) => {
    driver.lockedBy = name;
    draft.ui.memoryRev++;
  });
  endLock(store, 'landed');
  say('resident', WARDEN_TEXT.lockLanded(name, lock.pod), { critical: true, tone: 'danger' });
  emit('resident-lock', { pod: lock.pod, phase: 'landed' });
  // Its cap reached, it locks no more on this ship.
  if (store.getState().resident.corrupted!.locksLanded >= lockCap(store.getState())) {
    store.update((draft) => { draft.resident.corrupted!.lockInSec = null; });
  }
}

// Every lock it holds lets go (a DELETE, the cure, an ACCEPT): one 'released' a pod.
function releaseLocks(store: Store<GameState>): void {
  const name = nameOf(store.getState());
  const held = lockedDrivers(store.getState()).filter((driver) => driver.lockedBy === name);
  if (held.length === 0) return;
  store.update((draft) => {
    for (const driver of held) delete driver.lockedBy;
    draft.ui.memoryRev++;
  });
  for (const driver of held) emit('resident-lock', { pod: driver.pod, phase: 'released' });
}

function lockTick(store: Store<GameState>, dtAi: number, held: boolean): void {
  const lock = store.getState().resident.corrupted!.lock;
  if (lock !== null) {
    const driver = store.getState().memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.id === lock.segId);
    // Its pod went (launched, or eaten to nothing) before the countdown ran out: the lock comes to nothing.
    if (driver === undefined) endLock(store, null);
    else if (touched || getOpsBySeg(driver.id).length > 0) blockLock(store, lock);
    else if (!held) {
      const leftSec = lock.leftSec - dtAi;
      if (leftSec <= 0) landLock(store, lock, driver);
      else store.mutate((draft) => { draft.resident.corrupted!.lock!.leftSec = leftSec; });
    }
  }
  const state = store.getState();
  const corrupted = state.resident.corrupted!;
  if (corrupted.lockInSec === null) return;
  let inSec = corrupted.lockInSec;
  if (!held) inSec -= dtAi;
  if (!held && inSec <= 0 && corrupted.lock === null && corrupted.phase === 'awake' && live(state) && canStartOp()) {
    const target = corrupted.locksLanded < lockCap(state) ? lockTarget(state) : null;
    if (target !== null) {
      startLock(store, target);
      inSec = lockInterval(store.getState());
    }
  }
  const next = Math.max(0, inSec);
  store.mutate((draft) => { draft.resident.corrupted!.lockInSec = next; });
}

// --- Its DEAL --------------------------------------------------------------------------------------------------------------

// The fair tier's file (04 §3.3, hollow.ts rmTargets: plan R8), never one being moved or deleted; null: none, so no deal.
// Imported since the review fix pass (M4): data/zone-check.ts took data/ships.ts off the stateful systems, so the import no
// longer closes the load cycle slice 5 met (support/import-guard pins that).
function dealFile(state: Readonly<GameState>): Segment | null {
  return rmTargets(state.memory, state.hollow.untriedTools)
    .find((seg) => !getOpsBySeg(seg.id).some((operation) => operation.kind === 'move' || operation.kind === 'delete')) ?? null;
}

// How the DEAL names its file (`YOUR SPARE MOVE`, `AUTODROP.skl`).
function dealWord(seg: Readonly<Segment>): string {
  return seg.type === 'fs-tool' ? WARDEN_TEXT.dealSpare(seg.fsTool) : seg.name;
}

function dealOpen(state: Readonly<GameState>, corrupted: Readonly<CorruptedState>): boolean {
  return corrupted.phase === 'awake' && corrupted.deal.phase === 'none' && state.hollow.deal.phase === 'none'
    && choiceMayOpen(state, true) && live(state) && lockedDrivers(state).length > 0;
}

function offerDeal(store: Store<GameState>, file: Readonly<Segment>): void {
  const name = nameOf(store.getState());
  answer = null;
  const entryId = sayChoice('resident', WARDEN_TEXT.deal(name, dealWord(file)), [WARDEN_TEXT.dealAccept, WARDEN_TEXT.dealRefuse],
    DEAL_TIMEOUT_SEC, (picked) => { answer = { picked }; },
    { keys: [WARDEN_TEXT.dealAcceptKey, WARDEN_TEXT.dealRefuseKey], tickerWords: WARDEN_TEXT.dealTicker(name) });
  store.update((draft) => {
    draft.resident.corrupted!.deal = { phase: 'offered', fileId: file.id, fileName: file.name, entryId, outcome: null };
  });
}

function recordDeal(store: Store<GameState>, outcome: ResidentDealOutcome): void {
  const fileName = store.getState().resident.corrupted!.deal.fileName;
  store.update((draft) => {
    const deal = draft.resident.corrupted!.deal;
    deal.phase = 'done';
    deal.entryId = null;
    deal.outcome = outcome;
  });
  emit('resident-deal', { outcome, fileName });
}

// The offer taken back unanswered (its buttons go), with its line when it has one: the ship keeps it 'invalidated'.
function withdrawDeal(store: Store<GameState>, line: string | null): void {
  const deal = store.getState().resident.corrupted!.deal;
  if (deal.phase !== 'offered' || deal.entryId === null) return;
  answer = null;
  withdrawChoice(deal.entryId);
  if (line !== null) say('resident', line, { critical: true });
  recordDeal(store, 'invalidated');
}

// ACCEPT: the named file is deleted at once, as an rm would (any op on it stops first), and memory is checked whole.
function deleteNamed(store: Store<GameState>, fileId: string): boolean {
  for (const operation of getOpsBySeg(fileId)) abortOp(operation.id);
  const memory = store.getState().memory;
  const target = memory.find((seg) => seg.id === fileId);
  if (target === undefined) return false;
  const start = requireAddr(memory, target);
  // A deleted backup is no longer its primary's backup (as the kid's own DELETE, state/actions.ts).
  for (const primary of memory) if (primary.type === 'ship' && primary.backup === target.id) delete primary.backup;
  replaceRange(memory, start, start + target.size, [freeSegment(target.size)], { opId: null, own: [target] });
  mergeAdjacentFree(memory);
  if (IS_DEV) assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  store.update((draft) => {
    draft.ui.memoryRev++;
    if (draft.ui.selectedId === fileId) draft.ui.selectedId = null;
    if (draft.ui.pickedSourceId === fileId) draft.ui.pickedSourceId = null;
  });
  return true;
}

function settleDeal(store: Store<GameState>, picked: string | null): void {
  const state = store.getState();
  const name = nameOf(state);
  const deal = state.resident.corrupted!.deal;
  if (picked === WARDEN_TEXT.dealAccept) {
    if (deal.fileId === null || !deleteNamed(store, deal.fileId)) throw new Error('resident-corrupted: ACCEPT, but the named file is gone (the offer should have been withdrawn)');
    endLock(store, null);
    releaseLocks(store);
    store.update((draft) => {
      const machine = draft.resident.corrupted!;
      machine.phase = 'quiet';
      machine.lockInSec = null;
      machine.angryUntilAi = null;
    });
    say('resident', WARDEN_TEXT.dealAccepted(name), { critical: true });
    recordDeal(store, 'accepted');
    return;
  }
  if (picked !== null && picked !== WARDEN_TEXT.dealRefuse) throw new Error(`resident-corrupted: '${picked}' is not an answer to the deal`);
  anger(store);
  say('resident', WARDEN_TEXT.dealRefused(name), { critical: true });
  recordDeal(store, picked === null ? 'timeout' : 'refused');
}

// REFUSE or the timer (plan R8): angry for RESIDENT_ANGRY_SEC, and the lock already counting comes sooner too, so the
// refusal's cost shows at once (as HOLLOW's refused deal hastes the bite already counting down).
function anger(store: Store<GameState>): void {
  store.update((draft) => {
    const machine = draft.resident.corrupted!;
    machine.angryUntilAi = draft.clock.aiSec + RESIDENT_ANGRY_SEC;
    if (machine.lockInSec !== null) machine.lockInSec *= RESIDENT_ANGRY_LOCK_FACTOR;
  });
}

function dealTick(store: Store<GameState>): void {
  const state = store.getState();
  const deal = state.resident.corrupted!.deal;
  if (deal.phase !== 'offered') return;
  if (!live(state)) {
    withdrawDeal(store, null);
    return;
  }
  const file = state.memory.find((seg) => seg.id === deal.fileId);
  if (file === undefined || getOpsBySeg(file.id).some((operation) => operation.kind === 'move')) {
    withdrawDeal(store, WARDEN_TEXT.dealNeverMind(nameOf(state)));
    return;
  }
  if (answer !== null) {
    const { picked } = answer;
    answer = null;
    settleDeal(store, picked);
  }
}

// --- The end of it: DELETE, the cure -----------------------------------------------------------------------------------

function stopForGood(store: Store<GameState>): void {
  endLock(store, null);
  withdrawDeal(store, null);
  releaseLocks(store);
  store.update((draft) => {
    const machine = draft.resident.corrupted!;
    machine.lockInSec = null;
    machine.angryUntilAi = null;
  });
}

function deleted(store: Store<GameState>): void {
  const state = store.getState();
  const name = nameOf(state);
  stopForGood(store);
  store.update((draft) => { draft.resident.corrupted!.phase = 'deleted'; });
  say('resident', WARDEN_TEXT.deleted(name), { critical: true });
  say('control', WARDEN_TEXT.controlThanks, { critical: true });
  emit('resident-deleted', { name });
}

function cured(store: Store<GameState>): void {
  const name = nameOf(store.getState());
  stopForGood(store);
  store.update((draft) => { draft.resident.corrupted!.phase = 'cured'; });
  say('resident', WARDEN_TEXT.cured(name), { critical: true, tone: 'good' });
  emit('resident-cured', { name });
}

// --- Its looping lines -----------------------------------------------------------------------------------------------------

// One looping line at a burst of its own, in pool order, garbled at RESIDENT_GARBLE (05 §3.12: it reads as failing; the
// mask is seeded by the run, the ship and the line, so a replay says the same). Not said under a choice standing (its DEAL,
// the sleeper's offer: the TERMINAL's line there is the question) or a lock's countdown, nor within RESIDENT_LINE_EVERY_SEC
// of its last line.
function sayLoopLine(store: Store<GameState>): void {
  const state = store.getState();
  const corrupted = state.resident.corrupted!;
  if (corrupted.lock !== null || openChoiceEntry(state) !== null) return;
  const entries = state.log.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (state.clock.aiSec - entry.t >= RESIDENT_LINE_EVERY_SEC) break;
    if (entry.speaker === 'resident') return;
  }
  const line = WARDEN_TEXT.loop[corrupted.line % WARDEN_TEXT.loop.length]!;
  const seed = childSeed(state.run.seed, currentSlot(state.run), `warden-line-${corrupted.line}`);
  say('resident', WARDEN_TEXT.loopLine(nameOf(state), garbleText(line, RESIDENT_GARBLE, seed)), { critical: true });
  store.update((draft) => { draft.resident.corrupted!.line++; });
}

// --- The tick --------------------------------------------------------------------------------------------------------------

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  const corrupted = state.resident.corrupted;
  if (corrupted === null || !isLivePhase(state)) return;
  if (corrupted.phase === 'deleted' || corrupted.phase === 'cured') return;
  const file = residentFile(state);
  // Deleted (only a DELETE takes it: it is not food, and MOVE refuses it), or REPAIR brought it to 100.
  if (file === null) {
    deleted(store);
    return;
  }
  if (file.integrity >= INTEGRITY_MAX) {
    cured(store);
    return;
  }
  const desc = descNow(state, file, corrupted);
  if (file.desc !== desc) store.update((draft) => { (draft.memory.find((seg) => seg.id === file.id) as ResidentSegment).desc = desc; });
  dealTick(store);
  const now = store.getState().resident.corrupted!;
  const held = clockHeld(store.getState(), now);
  if (!held) store.mutate((draft) => { draft.resident.corrupted!.calmAiSec += dtAi; });
  if (now.phase === 'dormant') {
    if (wakeDue(store.getState(), store.getState().resident.corrupted!)) wake(store);
    return;
  }
  if (now.phase !== 'awake') return;
  if (burstHeard) sayLoopLine(store);
  burstHeard = false;
  lockTick(store, dtAi, held);
  const after = store.getState();
  if (dealOpen(after, after.resident.corrupted!)) {
    const named = dealFile(after);
    if (named !== null) offerDeal(store, named);
  }
}

// --- Can its locks still be freed? (review M3) ------------------------------------------------------------------------------

export type LockRemedy = 'op' | 'delete' | 'cure' | 'deal';

// What could still free its locks on this ship, or null: nothing aboard can (it then holds them to the landing's end, and the
// landing treats a locked pod as one that can never launch: landing-rules driverCanEverLaunch). In order: an op already on
// WARDEN.sys (a DELETE or REPAIR running); a DELETE in hand; a REPAIR in hand with the charge for the whole cure (state/actions
// repairChargeEstimate: 12 from 40%, more after a hit); its DEAL standing, or still to come (none offered on this ship, HOLLOW's
// idle, a fair-tier file to name). A file not yet scanned needs a SCAN in hand first (R25). The lock never lets go by itself.
// Anything but an awake resident holding a lock answers 'op' (no lock of its to judge: R7's rule stands).
export function lockRemedy(state: Readonly<GameState>): LockRemedy | null {
  const corrupted = state.resident.corrupted;
  const file = residentFile(state);
  if (corrupted === null || file === null || corrupted.phase !== 'awake') return 'op';
  if (file.operating === true || getOpsBySeg(file.id).length > 0) return 'op';
  const canTouch = file.scanned || getFsTool(state, 'scan') !== undefined;
  if (canTouch && getFsTool(state, 'delete') !== undefined) return 'delete';
  if (canTouch && getFsTool(state, 'repair') !== undefined && chargeLeft(state) >= repairChargeEstimate(file.integrity, file.size)) return 'cure';
  if (corrupted.deal.phase === 'offered') return 'deal';
  if (corrupted.deal.phase === 'none' && state.hollow.deal.phase === 'none' && dealFile(state) !== null) return 'deal';
  return null;
}

// --- What the dispatcher asks (systems/residents.ts) -----------------------------------------------------------------------

let mounted = false;

// Mounted by systems/residents.ts mountResidents (after THE DEAL, as main.ts and harness6 mount it). Returns the unmount.
export function mountResidentCorrupted(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountResidentCorrupted: already mounted');
  mounted = true;
  const offOps = onOpsChange((change) => {
    if (change.type !== 'start') return;
    const lock = store.getState().resident.corrupted?.lock ?? null;
    if (lock === null) return;
    const { operation } = change;
    if (operation.segId === lock.segId || operation.targetIds.includes(lock.segId)) touched = true;
  });
  const offBurst = on('ghost-start', () => {
    const state = store.getState();
    if (state.resident.corrupted?.phase === 'awake' && capabilitiesNow(state).thrustCtrl.ghostBy === 'resident') burstHeard = true;
  });
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offRemedy = registerLockRemedy((state) => lockRemedy(state) !== null);
  // A ship that is over (lost, landed, its landing ended) takes a countdown and an open offer with it, and the warning.
  const offOver = onPostTick(() => {
    const state = store.getState();
    const corrupted = state.resident.corrupted;
    if (corrupted === null || live(state)) return;
    if (corrupted.lock !== null) endLock(store, null);
    if (corrupted.deal.phase === 'offered') withdrawDeal(store, null);
  });
  const offReset = onWorldReset('resident-corrupted', resetCorrupted, () => ({ touched, answer, burstHeard }));
  return () => {
    offOps();
    offBurst();
    offTick();
    offRemedy();
    offOver();
    offReset();
    resetCorrupted();
    mounted = false;
  };
}

// Why the active tool can't be used on WARDEN.sys, or null when the kind allows it (the tools' own rules then still apply:
// REPAIR's charge, ALREADY 100%). Plan R25: DELETE and REPAIR wait for a SCAN (`SCAN IT FIRST`; the late surprise's wake
// scans it); MOVE and COPY refuse it (`IT WON'T BE MOVED`, `ONE OF IT IS ENOUGH`). SCAN and SWAP fall through.
export function corruptedToolRule(seg: Readonly<ResidentSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  switch (ctx.activeKind) {
    case 'move': return TOOL_REFUSAL.residentMove;
    case 'copy': return TOOL_REFUSAL.residentCopy;
    case 'delete':
    case 'repair': return seg.scanned ? null : TOOL_REFUSAL.scanFirst;
    case 'scan':
    case 'swap': return null;
  }
}

// How long DELETE takes on WARDEN.sys (04 §3.12: 1.0 + 0.5 per block, 6.0 s for 10 blocks: HOLLOW's per-block DELETE).
export function corruptedDeleteSec(seg: Readonly<ResidentSegment>): number {
  return RESIDENT_DELETE_BASE_SEC + RESIDENT_DELETE_PER_BLOCK_SEC * seg.size;
}

// DELETE's inline confirm on WARDEN.sys (`DELETE WARDEN.sys?` · `It is the ship's own mind.`), built here so the name keeps
// its case (CONFIRM_TEXT.deleteFile upper-cases it).
export function corruptedDeleteQuestion(state: Readonly<GameState>, seg: Readonly<ResidentSegment>): ConfirmText {
  void state;
  return { question: WARDEN_TEXT.confirmQuestion(seg.owner), detail: WARDEN_TEXT.confirmDetail };
}

// The ship is ending (systems/residents.ts residentShipEnd, from run.ts endShip, before SHIP DONE's save): any telegraph ends
// and a standing DEAL is withdrawn, so the slice is at rest (the codec checks it), and how the resident's ship ended for it:
// deleted, cured, paid (an ACCEPT) or ignored, and its pods still locked when the landing ended (parked in orbit).
export function corruptedShipEnd(store: Store<GameState>): { fate: Extract<ResidentFate, 'deleted' | 'cured' | 'paid' | 'ignored'>; podsParkedLocked: number } {
  const corrupted = store.getState().resident.corrupted;
  if (corrupted === null) throw new Error('corruptedShipEnd: no corrupted resident aboard');
  endLock(store, null);
  withdrawDeal(store, null);
  resetCorrupted();
  const state = store.getState();
  const name = nameOf(state);
  const parked = lockedDrivers(state).filter((driver) => driver.lockedBy === name
    && state.landing.pods.some((record) => record.pod === driver.pod && record.fate.kind === 'parked')).length;
  const machine = state.resident.corrupted!;
  let fate: Extract<ResidentFate, 'deleted' | 'cured' | 'paid' | 'ignored'> = 'ignored';
  if (machine.phase === 'deleted') fate = 'deleted';
  else if (machine.phase === 'cured') fate = 'cured';
  else if (machine.deal.outcome === 'accepted') fate = 'paid';
  return { fate, podsParkedLocked: parked };
}

// --- Debug entry points (debug.ts __ap.resident.*; plan §2.12) ---------------------------------------------------------

function requireMachine(state: Readonly<GameState>, what: string): CorruptedState {
  const corrupted = state.resident.corrupted;
  if (corrupted === null) throw new Error(`${what}: no corrupted resident on ${state.level.shipName} (__ap.resident.place('corrupted') puts one there)`);
  return corrupted;
}

// __ap.resident.wake(): the resident wakes now (its first line, CONTROL's on a faulty ship, 'resident-wake'), whatever its
// grace or HOLLOW's first fight says.
export function wakeResidentNow(store: Store<GameState>): void {
  const corrupted = requireMachine(store.getState(), 'wakeResidentNow');
  if (corrupted.phase !== 'dormant') throw new Error(`wakeResidentNow: it is ${corrupted.phase}, not dormant`);
  if (!isLivePhase(store.getState())) throw new Error('wakeResidentNow: the ship is not live (wait for the flight)');
  wake(store);
}

// __ap.resident.lock(pod?): a lock telegraphs now on `pod` (default: the next pod in launch order not locked yet), whatever
// its clock, its cap or the threads say.
export function lockNow(store: Store<GameState>, pod?: number): void {
  const state = store.getState();
  const corrupted = requireMachine(state, 'lockNow');
  if (corrupted.phase !== 'awake') throw new Error(`lockNow: it is ${corrupted.phase}, not awake`);
  if (corrupted.lock !== null) throw new Error('lockNow: a lock is already counting down');
  const target = lockTarget(state, pod);
  if (target === null) throw new Error(`lockNow: ${pod === undefined ? 'no pod' : `pod ${pod}`} can be locked (aboard, launchable, not locked)`);
  startLock(store, target);
  store.mutate((draft) => { draft.resident.corrupted!.lockInSec = lockInterval(store.getState()); });
}

// __ap.resident.deal(): its DEAL is offered now, naming the fair tier's file, even with no pod locked (HOLLOW's deal must be
// idle, and no other choice standing: plan R8, R23).
export function offerResidentDealNow(store: Store<GameState>): void {
  const state = store.getState();
  const corrupted = requireMachine(state, 'offerResidentDealNow');
  if (corrupted.phase !== 'awake') throw new Error(`offerResidentDealNow: it is ${corrupted.phase}, not awake`);
  if (corrupted.deal.phase !== 'none') throw new Error('offerResidentDealNow: its DEAL was already offered on this ship');
  if (state.hollow.deal.phase !== 'none') throw new Error('offerResidentDealNow: HOLLOW\'s DEAL holds this ship\'s one deal');
  if (!choiceMayOpen(state, true)) throw new Error('offerResidentDealNow: another TERMINAL choice stands');
  const file = dealFile(state);
  if (file === null) throw new Error('offerResidentDealNow: no file to name (the fair tiers are empty)');
  offerDeal(store, file);
}

// __ap.resident.angry(): as if its DEAL was refused now (RESIDENT_ANGRY_SEC of faster locks and bursts).
export function angerResidentNow(store: Store<GameState>): void {
  const corrupted = requireMachine(store.getState(), 'angerResidentNow');
  if (corrupted.phase !== 'awake') throw new Error(`angerResidentNow: it is ${corrupted.phase}, not awake`);
  anger(store);
}
