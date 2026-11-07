// Slice 5: Track KIN owns this file (docs/phase3/impl/slice-5-plan.md §2.1, §2.9, §6.2). The FOUNDATION wrote the final
// signatures and registered the 'resident' landing controller's resolver here; Track KIN built the bodies. Others ask by
// message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Segment, SleeperSegment, SleepLockSegment, DriverSegment } from '@/types/segment';
import type { SleeperJob } from '@/types/resident';
import type { LandingController } from '@/types/landing';
import type { ValidTargetContext } from '@systems/tool-targets';
import type { OpKind } from '@systems/ops-core';
import { autodropController } from '@systems/autodrop';
import { onAiTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { say, sayChoice, withdrawChoice, openChoiceEntry } from '@systems/say';
import { getOpsBySeg } from '@systems/ops-core';
import { segmentStarts, replaceRange, newSegId, assertMemoryInvariants, freeSegment, mergeAdjacentFree, requireAddr } from '@systems/memory-ops';
import { cureNow } from '@systems/hollow';
import { grantCycles } from '@systems/skill-tree';
import { currentSlot } from '@systems/map-streams';
import { shipLaunchYear } from '@systems/map-run';
import { isOpenFree } from '@systems/tool-targets';
import { driversInMemory, isHollow, isInfectable, isInfected, isDriver, integrityState } from '@state/selectors';
import { isDisguised } from '@state/threat-selectors';
import { setIntegrity } from '@state/actions';
import { layoutOf } from '@data/memory';
import { repairRatePerSec } from '@data/fs-tools';
import { RESIDENT_SEG_IDS, SLEEPER_JOB_KEYS } from '@data/residents';
import { RESIDENT_TEXT, pinnedRefusal } from '@data/resident-text';
import { KIN_TEXT } from '@data/kin-text';
import { TOOL_REFUSAL, type ToolRefusal } from '@data/tool-text';
import { INTEGRITY_MAX, SLEEPER_WALL_BLOCKS, SLEEPER_GIFT_CYCLES } from '@data/tuning';

// The sleeper (04 §3.14, plan §2.9): asleep behind sleep.lock, woken by one file op (on 'op-done' with the lock's or its own
// segId), its offer with no timer (say.ts sayChoice with timeoutAiSec null; R23's rule through openChoiceEntry and
// withdrawChoice), its three jobs, the 'resident' controller for RUN THE DROPS (R11) and the gift (R12). All its machine state
// is state.resident.sleeper (plan R2); module state is only what the bus brought between ticks (an op done, a SCAN, the
// offer's answer: §2.3), acted on at the next AI tick and reset with the world.
// • The wake: `phase 'awake'` (woken, no job) at once, its three green lines, 'resident-wake' and 'sleeper-woken', then the
//   offer as soon as no other choice stands: `phase 'offering'`. A DEAL that comes while the offer stands takes it back
//   (`'awake'` again), and it is made again once the DEAL is settled (R23). Woken with no job is at rest at a save point
//   (review M4).
// • RUN THE DROPS: AUTODROP v3's PLAN flown for MOTH (no thread of the kid's, AUTODROP itself shadowed), which also asks for
//   the SKIP between its passes, the [F] the kid would press (R11). In flight it waits. While its plan has rows the strip
//   shows a wait row in every window (no [L]: review M1, autodrop.ts controllerWaitLine).
// • HOLD A WALL: a 4-block MOTH.wall (a `sleeper` segment, part 'wall': no health, so HOLLOW's spread stops at it) at R13's
//   spot, once. Offered only while something hostile shows in memory (a disguised seed shows as a harmless file, so it
//   does not count: the button must not give it away) and the spot exists.
// • MEND DRIVERS: an AI tick after HOLLOW's: the lowest-integrity driver aboard that needs it gains REPAIR v1's rate for its
//   size, with no thread and no charge (no `repairing` state: it stays launchable); at 100 it is cured as a REPAIR cures
//   (hollow.ts cureNow), and MOTH moves on.
// • The gift: SLEEPER_GIFT_CYCLES at the ship's end whenever it was woken, landed or lost (R12, review m10).

const JOBS: readonly SleeperJob[] = ['drops', 'wall', 'mend'];

// What the bus brought since the last tick (never acted on inside an emit).
let opsDone: { kind: OpKind; segId: string }[] = [];
let scanned: string[] = [];
let answer: { picked: string | null } | null = null;

function resetSleeper(): void {
  opsDone = [];
  scanned = [];
  answer = null;
}

const sleeperOf = (state: Readonly<GameState>): GameState['resident']['sleeper'] => state.resident.sleeper;

function mindSeg(memory: readonly Segment[]): SleeperSegment | null {
  const seg = memory.find((candidate) => candidate.id === RESIDENT_SEG_IDS.sleeper);
  return seg !== undefined && seg.type === 'sleeper' ? seg : null;
}

// The years it slept (05 §3.6): the galaxy year at its ship (the approach) less the year its ship launched.
function yearsAsleep(state: Readonly<GameState>): number {
  const slot = currentSlot(state.run);
  const ship = state.run.map.arm[slot];
  if (ship === undefined) throw new Error(`resident-sleeper: no arm ship in slot ${slot}`);
  return ship.approachYear - shipLaunchYear(state.run.map, slot);
}

// --- HOLD A WALL's spot (plan R13) ---------------------------------------------------------------------------------------

export interface WallSpot {
  startAddr: number;
  drivers: number;    // the drivers on that side, before the next blocker or hollow block
}

// Where MOTH.wall would stand now, or null (nothing hostile showing, or no open free run of SLEEPER_WALL_BLOCKS beside it):
// beside the hollow block or seed with the most drivers in reach, on the side facing them, flush against the far end of
// its free run (the end the drivers are on). Ties: the first in address order. Pure.
export function wallSpot(memory: readonly Segment[]): WallSpot | null {
  const starts = segmentStarts(memory);
  let best: WallSpot | null = null;
  memory.forEach((seg, index) => {
    if (!isHollow(seg) || isDisguised(seg)) return;
    for (const step of [-1, 1] as const) {
      let cursor = index + step;
      let blocks = 0;
      while (cursor >= 0 && cursor < memory.length && isOpenFree(memory[cursor]!)) {
        blocks += memory[cursor]!.size;
        cursor += step;
      }
      if (blocks < SLEEPER_WALL_BLOCKS) continue;
      let drivers = 0;
      for (let at = cursor; at >= 0 && at < memory.length; at += step) {
        const next = memory[at]!;
        if (isHollow(next) || !(next.type === 'free' || isInfectable(next))) break;
        if (isDriver(next)) drivers++;
      }
      const startAddr = step === 1 ? starts[index]! + seg.size + blocks - SLEEPER_WALL_BLOCKS : starts[index]! - blocks;
      if (best === null || drivers > best.drivers) best = { startAddr, drivers };
    }
  });
  return best;
}

// The jobs MOTH offers now (04 §3.14: HOLD A WALL not on a ship with nothing hostile in memory).
export function sleeperJobsNow(state: Readonly<GameState>): SleeperJob[] {
  return JOBS.filter((job) => job !== 'wall' || wallSpot(state.memory) !== null);
}

// --- The 'resident' landing controller (plan R11) ------------------------------------------------------------------------

// AUTODROP v3 PLAN flown for the sleeper while it runs the drops (autodrop.ts autodropController with the 'resident' source,
// armed 'plan': no thread, AUTODROP's own machine shadowed), else null. Between its passes it asks for the SKIP itself
// (AutodropOverride.skipBetween, review architecture 2: the rule MERGE's drivers share); pace stops that SKIP before its next
// launch (it holds TACTICAL and names it). systems/residents.ts registers the 'resident' resolver and asks it here.
export function sleeperController(state: Readonly<GameState>): LandingController | null {
  const sleeper = sleeperOf(state);
  if (sleeper === null || sleeper.phase !== 'working' || sleeper.job !== 'drops') return null;
  return autodropController(state, { version: 3, queue: [], source: 'resident', armed: 'plan', skipBetween: true });
}

// --- The machine ---------------------------------------------------------------------------------------------------------

// The offer's choice still stands in the log (a line pushed off the log's end takes its choice with it).
function offerStands(state: Readonly<GameState>, entryId: number): boolean {
  return state.log.entries.some((entry) => entry.id === entryId && entry.choice?.open === true);
}

function offer(store: Store<GameState>): void {
  const state = store.getState();
  const def = state.resident.def;
  if (def === null) throw new Error('resident-sleeper: an offer on a ship with no resident');
  const jobs = sleeperJobsNow(state);
  const words = KIN_TEXT.sleeper;
  const entryId = sayChoice('sleeper', words.offer(def.name), jobs.map((job) => words.jobs[job]), null, (picked) => {
    answer = { picked };
  }, { keys: jobs.map((job) => SLEEPER_JOB_KEYS[job]), tickerWords: words.tickerWords(def.name) });
  store.update((draft) => {
    const sleeper = draft.resident.sleeper!;
    sleeper.phase = 'offering';
    sleeper.entryId = entryId;
  });
}

// The offer is taken back (a DEAL came, R23): woken with no job, offered again once nothing else stands.
function withdrawOffer(store: Store<GameState>): void {
  const entryId = sleeperOf(store.getState())?.entryId ?? null;
  if (entryId !== null && offerStands(store.getState(), entryId)) withdrawChoice(entryId);
  answer = null;
  store.update((draft) => {
    const sleeper = draft.resident.sleeper!;
    sleeper.phase = 'awake';
    sleeper.entryId = null;
  });
}

function wake(store: Store<GameState>, by: 'rm' | 'move'): void {
  const state = store.getState();
  const def = state.resident.def;
  if (def === null || sleeperOf(state)?.phase !== 'asleep') throw new Error('resident-sleeper: no sleeper asleep to wake');
  const years = yearsAsleep(state);
  store.update((draft) => {
    const sleeper = draft.resident.sleeper!;
    sleeper.phase = 'awake';
    sleeper.wokenBy = by;
    sleeper.wokeAtAi = draft.clock.aiSec;
    const seg = mindSeg(draft.memory);
    if (seg !== null) {
      seg.awake = true;
      seg.scanned = true;
      seg.desc = KIN_TEXT.sleeper.awakeDesc(def.name);
    }
    draft.ui.memoryRev++;
  });
  for (const line of KIN_TEXT.sleeper.wake(def.name, years)) say('sleeper', line, { critical: true });
  emit('resident-wake', { kind: 'sleeping', name: def.name, surprise: false });
  emit('sleeper-woken', { name: def.name, by });
}

// MOTH.wall at its spot (R13): placed once, the memory checked whole.
function placeWall(store: Store<GameState>, spot: Readonly<WallSpot>): void {
  const state = store.getState();
  const def = state.resident.def!;
  const wall: SleeperSegment = {
    id: newSegId('sleeper_wall'), name: RESIDENT_TEXT.file.wall(def.name), type: 'sleeper', size: SLEEPER_WALL_BLOCKS, part: 'wall',
    owner: def.name, scanned: true, awake: true, desc: KIN_TEXT.sleeper.wallDesc(def.name),
  };
  store.update((draft) => {
    replaceRange(draft.memory, spot.startAddr, spot.startAddr + SLEEPER_WALL_BLOCKS, [wall], { opId: null, own: [] });
    mergeAdjacentFree(draft.memory);
    assertMemoryInvariants(draft.memory, layoutOf(draft).totalBlocks);
    draft.resident.sleeper!.wallId = wall.id;
    draft.ui.memoryRev++;
  });
}

// The job starts (the offer's button, or __ap.sleeper.job). false: HOLD A WALL whose spot went since the offer.
function startJob(store: Store<GameState>, job: SleeperJob): boolean {
  const state = store.getState();
  const def = state.resident.def!;
  if (job === 'wall') {
    const spot = wallSpot(state.memory);
    if (spot === null) return false;
    placeWall(store, spot);
  }
  store.update((draft) => {
    const sleeper = draft.resident.sleeper!;
    sleeper.phase = 'working';
    sleeper.job = job;
    sleeper.entryId = null;
  });
  say('sleeper', KIN_TEXT.sleeper.jobLine[job](def.name), { critical: true });
  emit('sleeper-job', { job });
  return true;
}

function jobOfButton(picked: string): SleeperJob {
  const job = JOBS.find((candidate) => KIN_TEXT.sleeper.jobs[candidate] === picked);
  if (job === undefined) throw new Error(`resident-sleeper: '${picked}' is not one of the sleeper's jobs`);
  return job;
}

// The driver MEND DRIVERS heals now: the one it is on while that one still needs it, else the lowest-integrity driver aboard
// that needs it (below 100, or still infected) with no op on it (the kid's REPAIR or MOVE is the kid's), the first by
// address on a tie. null: none needs it.
function mendTarget(state: Readonly<GameState>, mendingId: string | null): DriverSegment | null {
  const needs = (driver: DriverSegment): boolean => (driver.integrity < INTEGRITY_MAX || isInfected(driver))
    && driver.state !== 'transferring' && getOpsBySeg(driver.id).length === 0;
  const drivers = driversInMemory(state).filter(needs);
  const current = drivers.find((driver) => driver.id === mendingId);
  if (current !== undefined) return current;
  let best: DriverSegment | null = null;
  for (const driver of drivers) if (best === null || driver.integrity < best.integrity) best = driver;
  return best;
}

function mendTick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  const sleeper = sleeperOf(state)!;
  const target = mendTarget(state, sleeper.mendingId);
  if ((target?.id ?? null) !== sleeper.mendingId) {
    store.update((draft) => { draft.resident.sleeper!.mendingId = target?.id ?? null; });
  }
  if (target === null) return;
  const next = target.integrity + repairRatePerSec(target.size, 1) * dtAi;
  if (next < INTEGRITY_MAX) {
    const band = integrityState(target.integrity);
    store.mutate(() => { setIntegrity(target, next); });
    if (integrityState(target.integrity) !== band) store.update((draft) => { draft.ui.memoryRev++; });
    return;
  }
  if (isInfected(target)) {
    cureNow(store, target);
  } else {
    store.update((draft) => {
      setIntegrity(target, INTEGRITY_MAX);
      draft.ui.memoryRev++;
    });
  }
  store.update((draft) => { draft.resident.sleeper!.mendingId = null; });
}

// What a SCAN found on the sleeper's files (plan §2.9): their words after it.
function readScans(store: Store<GameState>): void {
  const ids = scanned;
  scanned = [];
  const def = store.getState().resident.def;
  if (def === null) return;
  store.update((draft) => {
    for (const id of ids) {
      const seg = draft.memory.find((candidate) => candidate.id === id);
      if (seg?.type === 'sleeper' && seg.part === 'mind') seg.desc = seg.awake ? KIN_TEXT.sleeper.awakeDesc(def.name) : KIN_TEXT.sleeper.scannedDesc;
      else if (seg?.type === 'sleep-lock') seg.desc = KIN_TEXT.sleeper.lockDesc(def.name);
    }
    draft.ui.memoryRev++;
  });
}

function tick(store: Store<GameState>, dtAi: number): void {
  const before = store.getState();
  if (sleeperOf(before) === null) {
    resetSleeper();
    return;
  }
  if (scanned.length > 0) readScans(store);
  const done = opsDone;
  opsDone = [];
  if (sleeperOf(store.getState())!.phase === 'asleep') {
    const waking = done.find((op) => (op.kind === 'delete' && op.segId === RESIDENT_SEG_IDS.sleepLock)
      || (op.kind === 'move' && op.segId === RESIDENT_SEG_IDS.sleeper));
    if (waking !== undefined) wake(store, waking.kind === 'delete' ? 'rm' : 'move');
  }
  const state = store.getState();
  if (!isLivePhase(state)) return;
  const sleeper = sleeperOf(state)!;
  if (sleeper.phase === 'offering') {
    const entryId = sleeper.entryId!;
    const other = openChoiceEntry(state);
    if (answer !== null) {
      // The kid's button (the choice closed with it): the job, or HOLD A WALL whose spot went since the offer.
      const { picked } = answer;
      answer = null;
      if (picked === null || !startJob(store, jobOfButton(picked))) {
        if (picked !== null) say('sleeper', KIN_TEXT.sleeper.noRoom(state.resident.def!.name), { critical: true });
        withdrawOffer(store);
      }
    } else if (state.hollow.deal.phase === 'offered' || (other !== null && other.id !== entryId) || !offerStands(state, entryId)) {
      // R23: a DEAL (or any other choice) takes the offer back; so does a line that left the log with it.
      withdrawOffer(store);
    }
  } else if (sleeper.phase === 'awake' && state.hollow.deal.phase !== 'offered' && openChoiceEntry(state) === null) {
    offer(store);
  } else if (sleeper.phase === 'working' && sleeper.job === 'mend') {
    mendTick(store, dtAi);
  }
}

let mounted = false;

// Mounted by systems/residents.ts mountResidents (after the corrupted and departed residents' modules, so after HOLLOW and
// its DEAL: MEND's tug-of-war, R23's withdrawal the tick a DEAL is offered). Returns the unmount. (The 'resident' landing
// resolver is the dispatcher's since the review fix pass: residents.ts mountResidents.)
export function mountResidentSleeper(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountResidentSleeper: already mounted');
  mounted = true;
  const offOp = on('op-done', ({ kind, result, segId }) => {
    if (result === 'done' && segId !== null && sleeperOf(store.getState()) !== null) opsDone.push({ kind, segId });
  });
  const offScan = on('scanned', ({ segId }) => {
    if (segId === RESIDENT_SEG_IDS.sleeper || segId === RESIDENT_SEG_IDS.sleepLock) scanned.push(segId);
  });
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offReset = onWorldReset('resident-sleeper', resetSleeper, () => ({ opsDone, scanned, answer }));
  return () => {
    offOp();
    offScan();
    offTick();
    offReset();
    resetSleeper();
    mounted = false;
  };
}

// Why the active tool can't be used on the sleeper, its lock or its wall (plan §2.9: DELETE on the sleeper refused with its
// hint, REPAIR and COPY refused on it; MOVE allowed; DELETE on the lock allowed, MOVE refused `PINNED TO MOTH.sys`), or null
// when the kind allows it: the tools' own rules then still apply. tool-targets.ts asks it through residents.ts
// residentToolRule. SCAN works on all three; SWAP on none (no backup).
export function sleeperToolRule(seg: Readonly<SleeperSegment | SleepLockSegment>, ctx: Readonly<ValidTargetContext>): ToolRefusal | null {
  const tool = ctx.activeKind;
  if (tool === 'scan') return null;
  if (tool === 'swap') return TOOL_REFUSAL.swapShipOnly;
  if (seg.type === 'sleep-lock') {
    if (tool === 'delete') return null;
    if (tool === 'move') return pinnedRefusal(seg.owner);
    if (tool === 'copy') return TOOL_REFUSAL.logCopy;
    return TOOL_REFUSAL.notAFile;
  }
  if (seg.part === 'wall') {
    switch (tool) {
      case 'delete': return TOOL_REFUSAL.wallDelete;
      case 'move': return TOOL_REFUSAL.wallMove;
      case 'copy': return TOOL_REFUSAL.sleeperCopy;
      case 'repair': return TOOL_REFUSAL.firewallHealth;
    }
  }
  switch (tool) {
    // Awake, it is a mind that is not the unit's (the log's own words); asleep, the hint is the way in (04 §3.14).
    case 'delete': return seg.awake ? TOOL_REFUSAL.logDelete : TOOL_REFUSAL.sleeperAsleep;
    case 'repair': return seg.awake ? TOOL_REFUSAL.firewallHealth : TOOL_REFUSAL.sleeperRepair;
    case 'copy': return TOOL_REFUSAL.sleeperCopy;
    case 'move': return null;
  }
}

// The ship is ending (systems/residents.ts residentShipEnd): a standing offer is withdrawn (woken with no job: the slice at
// rest, the codec refuses an offering sleeper), the gift is paid if it was woken (R12: landed or lost, review m10), and the
// record says whether it was woken and which job it did.
export function sleeperShipEnd(store: Store<GameState>): { fate: 'slept' | 'woken'; job: SleeperJob | null } {
  const state = store.getState();
  const sleeper = sleeperOf(state);
  const def = state.resident.def;
  if (sleeper === null || def === null) throw new Error('sleeperShipEnd: no sleeper on this ship');
  if (sleeper.phase === 'offering') withdrawOffer(store);
  resetSleeper();
  if (sleeper.phase === 'asleep') return { fate: 'slept', job: null };
  grantCycles(store, SLEEPER_GIFT_CYCLES, 'resident', `taught by ${def.name}`);
  return { fate: 'woken', job: sleeperOf(store.getState())!.job };
}

// --- Debug entry points (debug.ts __ap.sleeper.*; plan §2.12) ------------------------------------------------------------

// __ap.sleeper.wake(): the sleeper wakes now, as an rm of its lock would wake it: the lock goes, then its lines,
// 'sleeper-woken' and, at the next tick, the offer.
export function wakeSleeperNow(store: Store<GameState>): void {
  const state = store.getState();
  if (sleeperOf(state)?.phase !== 'asleep') throw new Error('wakeSleeperNow: no sleeper asleep on this ship');
  const lock = state.memory.find((seg) => seg.id === RESIDENT_SEG_IDS.sleepLock);
  if (lock !== undefined) {
    store.update((draft) => {
      const at = requireAddr(draft.memory, lock);
      replaceRange(draft.memory, at, at + lock.size, [freeSegment(lock.size)], { opId: null, own: [lock] });
      mergeAdjacentFree(draft.memory);
      draft.ui.memoryRev++;
    });
  }
  wake(store, 'rm');
}

// __ap.sleeper.job(job): the sleeper takes `job` now, as its offer's button would (a standing offer is answered). Throws
// while it sleeps, once it has a job, or for HOLD A WALL with no spot.
export function pickSleeperJob(store: Store<GameState>, job: SleeperJob): void {
  const sleeper = sleeperOf(store.getState());
  if (sleeper === null || sleeper.phase === 'asleep') throw new Error('pickSleeperJob: no sleeper awake on this ship');
  if (sleeper.phase === 'working') throw new Error(`pickSleeperJob: the sleeper already has a job (${sleeper.job})`);
  if (sleeper.phase === 'offering' && sleeper.entryId !== null && offerStands(store.getState(), sleeper.entryId)) withdrawChoice(sleeper.entryId);
  answer = null;
  if (!startJob(store, job)) throw new Error('pickSleeperJob: HOLD A WALL has no spot (nothing hostile, or no free run of 4)');
}
