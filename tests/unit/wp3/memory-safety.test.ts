// WP3 acceptance 3: memory safety (§6.12). 2,000 seeded random sequences of moves (slides and
// jumps), copies, deletes (whose free space merges with its neighbours), player cancels, system
// aborts and completions never violate assertMemoryInvariants, never leave a stale `operating`
// flag or reservation, and a cancelled move restores the exact pre-move ids, sizes and
// addresses. Plus the §9 WP3 edge cases on the memory side.
//
// A lean harness: only the store, the clock heartbeat, say() and the ops core (no flight), so
// the 2,000 sequences run in seconds. Ops advance through clock.advance exactly as in the game.
import { actionRefusal } from '@state/actions';
import { check, finish } from '../wp1/harness';
import { layoutOf, wp3Fixture } from './harness3';
import { layoutOf as memoryLayoutOf } from '@data/memory';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { createStore } from '@state/store';
import type { GameState, PendingPlacement } from '@state/schema';
import type { Segment } from '@/types/segment';
import { createInitialState } from '@state/initial';
import { advance } from '@systems/clock';
import { resetWorld } from '@systems/reset';
import { mountSay } from '@systems/say';
import { mountOpsCore, getOps, abortOp, cancelOp, startOp, type Op } from '@systems/ops-core';
import { actionMove, actionCopy, actionDelete, actionScan, cancelPlayerOp, moveSec } from '@state/actions';
import { computeMoveRegion, isOpenFree, targetRefusal } from '@systems/tool-targets';
import { assertMemoryInvariants, mergeAdjacentFree, replaceRange, freeSegment, splitFreeAt } from '@systems/memory-ops';
import { createRng, type Rng } from '@systems/rng';

const TICK = 0.05;
const SEQUENCES = 2000;
const STEPS_PER_SEQUENCE = 30;

const store = createStore<GameState>(createInitialState({ seed: 1 }));
mountSay(store);
mountOpsCore(store);

const ONE_ARM = { ...FIRST_RUN_LINEAGE, armSeed: 1 };

function freshState(seed: number, capacity: number): void {
  // Track RETIRE: run 1's arm rolled once (arm seed 1) for every sequence, the run seed still the sequence's: rolling a
  // fresh arm for each of 2,000 seeds cost the tier 10 s, and the sequences' own rng is what they vary.
  store.update((d) => { Object.assign(d, createInitialState({ seed, lineage: ONE_ARM })); });
  resetWorld();
  // WP4: the tools are licences now; install the WP3-era set (Repair, Mv, Cp, Rm) the sequences use.
  wp3Fixture(store);
  const core = store.getState().memory.find((seg) => seg.type === 'core');
  if (core?.type === 'core') core.capacity = capacity;
}

function ticks(count: number): void {
  for (let i = 0; i < count; i++) advance(store, TICK);
}

function pick<T>(rng: Rng, items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)]!;
}

const memory = (): Segment[] => store.getState().memory;

function movable(kind: 'move' | 'copy'): Segment[] {
  const state = store.getState();
  return memory().filter((seg) => targetRefusal(seg, { state, activeKind: kind, pickedSource: null }) === null);
}

// A placement as the preview would make it: a slide within the source's own region, or a spot
// in a free segment that fits.
function placementFor(rng: Rng, source: Segment, kind: 'move' | 'copy', forceSlide = false): PendingPlacement | null {
  if (kind === 'move' && (forceSlide || rng() < 0.5)) {
    const region = computeMoveRegion(memory(), source);
    if (region && region.totalSize > source.size) {
      return { regionSegIds: region.segs.map((seg) => seg.id), col: Math.floor(rng() * (region.totalSize - source.size + 1)) };
    }
  }
  const spot = pick(rng, memory().filter((seg) => isOpenFree(seg) && seg.size >= source.size));
  if (!spot) return null;
  return { regionSegIds: [spot.id], col: Math.floor(rng() * (spot.size - source.size + 1)) };
}

// Everything that must hold between any two ticks, besides the invariants themselves.
function consistency(): string | null {
  const ops = getOps();
  const touched = new Set<string>();
  for (const operation of ops) { touched.add(operation.segId); operation.targetIds.forEach((id) => touched.add(id)); }
  const opIds = new Set(ops.filter((operation) => operation.kind === 'move' || operation.kind === 'copy').map((operation) => operation.id));
  for (const seg of memory()) {
    if (seg.operating && !touched.has(seg.id)) return `${seg.id} is operating with no operation`;
    if (seg.type === 'free' && seg.reservedBy !== undefined && !opIds.has(seg.reservedBy)) return `${seg.id} reserved by ended operation ${seg.reservedBy}`;
  }
  for (const operation of ops) {
    if (operation.kind !== 'move' && operation.kind !== 'copy') continue;
    const clone = memory().find((seg) => seg.id === operation.segId);
    if (!clone || !('state' in clone) || clone.state !== 'transferring') return `operation ${operation.id}: clone ${operation.segId} missing or not transferring`;
  }
  return null;
}

function settled(): string | null {
  for (const seg of memory()) {
    if (seg.operating) return `${seg.id} still operating`;
    if (seg.type === 'free' && seg.reservedBy !== undefined) return `${seg.id} still reserved`;
    if ('state' in seg && seg.state === 'transferring') return `${seg.id} still transferring`;
  }
  return null;
}

// --- 2,000 random sequences -----------------------------------------------------------------------
let violations = 0;
let firstViolation = '';
const counts = { move: 0, slide: 0, copy: 0, delete: 0, cancel: 0, abort: 0, completed: 0, refused: 0 };
for (let sequence = 0; sequence < SEQUENCES; sequence++) {
  const rng = createRng(0x5eed + sequence);
  freshState(sequence + 1, 2 + Math.floor(rng() * 3));
  let failure: string | null = null;
  const note = (what: string): void => { if (!failure) failure = `seq ${sequence}: ${what}`; };
  try {
    for (let step = 0; step < STEPS_PER_SEQUENCE && !failure; step++) {
      const roll = rng();
      const running = getOps();
      if (roll < 0.28) {
        const source = pick(rng, movable('move'));
        const placement = source && placementFor(rng, source, 'move');
        if (source && placement) {
          const slide = placement.regionSegIds.includes(source.id);
          const result = actionMove(store, source, placement);
          if (result) counts.refused++; else { counts.move++; if (slide) counts.slide++; }
        }
      } else if (roll < 0.46) {
        const source = pick(rng, movable('copy'));
        const placement = source && placementFor(rng, source, 'copy');
        if (source && placement) { if (actionCopy(store, source, placement)) counts.refused++; else counts.copy++; }
      } else if (roll < 0.56) {
        const state = store.getState();
        const victim = pick(rng, memory().filter((seg) => targetRefusal(seg, { state, activeKind: 'delete', pickedSource: null }) === null));
        if (victim) { if (actionDelete(store, victim)) counts.refused++; else counts.delete++; }
      } else if (roll < 0.74) {
        const operation = pick(rng, running);
        if (operation) { cancelPlayerOp(store, operation.id); counts.cancel++; }
      } else if (roll < 0.8) {
        const operation = pick(rng, running);
        if (operation) { abortOp(operation.id); counts.abort++; }
      } else {
        const before = getOps().length;
        ticks(1 + Math.floor(rng() * 40));
        counts.completed += Math.max(0, before - getOps().length);
      }
      assertMemoryInvariants(memory(), memoryLayoutOf(store.getState()).totalBlocks);
      const problem = consistency();
      if (problem) note(problem);
    }
    // Let everything finish (or cancel the rest), then nothing may be left half-done.
    if (rng() < 0.5) ticks(400); else getOps().forEach((operation) => cancelOp(operation.id));
    assertMemoryInvariants(memory(), memoryLayoutOf(store.getState()).totalBlocks);
    const leftover = settled();
    if (leftover) note(leftover);
  } catch (err) {
    note(`threw: ${(err as Error).message}`);
  }
  if (failure) { violations++; if (!firstViolation) firstViolation = failure; }
}
check(`acceptance 3: ${SEQUENCES} random sequences never violate the invariants or leave half-done ops`,
  violations === 0, violations ? `${violations} failed; first: ${firstViolation}` : JSON.stringify(counts));
check('the sequences really exercised every op', counts.move > 1000 && counts.slide > 300 && counts.copy > 500
  && counts.delete > 500 && counts.cancel > 1000 && counts.abort > 200 && counts.completed > 1000, JSON.stringify(counts));

// --- A cancelled move restores the exact pre-move ids, sizes and addresses ------------------------
{
  let mismatches = 0;
  let firstMismatch = '';
  let slides = 0;
  let jumps = 0;
  for (let trial = 0; trial < 500; trial++) {
    const rng = createRng(0xc0ffee + trial);
    freshState(trial + 1, 2);
    // Every other trial is a slide: a file with free space beside it.
    const slideTrial = trial % 2 === 0;
    const candidates = movable('move').filter((seg) => !slideTrial || (computeMoveRegion(memory(), seg)?.totalSize ?? 0) > seg.size);
    const source = pick(rng, candidates);
    const placement = source && placementFor(rng, source, 'move', slideTrial);
    if (!source || !placement) continue;
    const before = layoutOf(store.getState());
    const stateBefore = 'state' in source ? source.state : undefined;
    if (actionMove(store, source, placement)) continue;
    if (placement.regionSegIds.includes(source.id)) slides++; else jumps++;
    if (layoutOf(store.getState()) === before) { mismatches++; firstMismatch ||= `trial ${trial}: the move changed nothing`; continue; }
    ticks(Math.floor(rng() * (moveSec(source.size) / TICK - 1)));
    const operation = getOps()[0];
    if (!operation) { mismatches++; firstMismatch ||= `trial ${trial}: the move finished too early`; continue; }
    cancelPlayerOp(store, operation.id);
    const after = layoutOf(store.getState());
    const restored = memory().find((seg) => seg.id === source.id);
    const stateOk = restored === source && ('state' in source ? source.state : undefined) === stateBefore && !source.operating;
    if (after !== before || !stateOk) {
      mismatches++;
      firstMismatch ||= `trial ${trial}: ${before}\n   ≠ ${after}`;
    }
  }
  check('acceptance 3: a cancelled move restores the exact ids, sizes and addresses (500 moves)', mismatches === 0,
    mismatches ? firstMismatch : `${slides} slides, ${jumps} jumps`);
}

// --- Edge: a cancel after the clone's neighbours merged (address restore) -------------------------
{
  freshState(7, 3);
  const comms = memory().find((seg) => seg.name === 'AI Comms')!;
  // WP5: on the rack layout the biggest free region sits right after the locked root (which can't
  // be deleted), so take the biggest one whose left neighbour can go.
  const deletableBefore = (seg: Segment): boolean => {
    const index = memory().indexOf(seg);
    return index > 0 && actionRefusal(store.getState(), 'delete', memory()[index - 1]!) === null;
  };
  const bigFree = memory().filter(isOpenFree).filter(deletableBefore).sort((a, b) => b.size - a.size)[0]!;
  const freeAddr = (seg: Segment): number => { let addr = 0; for (const other of memory()) { if (other === seg) return addr; addr += other.size; } return -1; };
  const regionStart = freeAddr(bigFree);
  // Jump AI Comms to the middle of the biggest free segment: free(pre) · clone · free(post), reserved.
  actionMove(store, comms, { regionSegIds: [bigFree.id], col: 10 });
  const before = layoutOf(store.getState());
  // The segment right before that free region is deleted: its blocks become free and touch the
  // reserved pre-gap (allowed: reserved space never merges).
  let neighbour: Segment | null = null;
  let addr = 0;
  for (const seg of memory()) { if (addr + seg.size === regionStart) neighbour = seg; addr += seg.size; }
  const deleted = neighbour !== null && actionDelete(store, neighbour) === null;
  ticks(Math.ceil(1.0 / TICK) + 1);
  const moveOp = getOps().find((operation) => operation.kind === 'move');
  check('edge: a neighbour of the move region was deleted while the move ran', deleted && moveOp !== undefined && layoutOf(store.getState()) !== before);
  if (moveOp) cancelPlayerOp(store, moveOp.id);
  let ok = true;
  try { assertMemoryInvariants(memory(), memoryLayoutOf(store.getState()).totalBlocks); } catch { ok = false; }
  const commsBack = memory().includes(comms) && !comms.operating && (!('state' in comms) || comms.state !== 'transferring');
  // The restored free space merged with the deleted neighbour's: one free run from the neighbour's start.
  const merged = memory().find((seg) => seg.type === 'free' && freeAddr(seg) === regionStart - (neighbour?.size ?? 0));
  check('edge: the cancel restores by address; the restored gap merges with the new free space',
    ok && commsBack && merged !== undefined && merged.size === (neighbour?.size ?? 0) + bigFree.size, `${merged?.size} blocks`);
}

// --- Edge: free space reserved by a running move is not a destination, and never merges ----------
{
  freshState(3, 3);
  const telemetry = memory().find((seg) => seg.name === 'Telemetry')!;
  // WP5: on the rack layout the biggest free region sits right after the locked root (which can't
  // be deleted), so take the biggest one whose left neighbour can go.
  const deletableBefore = (seg: Segment): boolean => {
    const index = memory().indexOf(seg);
    return index > 0 && actionRefusal(store.getState(), 'delete', memory()[index - 1]!) === null;
  };
  const bigFree = memory().filter(isOpenFree).filter(deletableBefore).sort((a, b) => b.size - a.size)[0]!;
  actionMove(store, telemetry, { regionSegIds: [bigFree.id], col: 4 });
  const reserved = memory().filter((seg) => seg.type === 'free' && seg.reservedBy !== undefined);
  const state = store.getState();
  const cargo = memory().find((seg) => seg.name === 'Cargo Ctrl')!;
  check('edge: a move reserves the free space around its clone', reserved.length === 2, `${reserved.length}`);
  check('edge: reserved space is not a copy destination', reserved.every((seg) => targetRefusal(seg, { state, activeKind: 'copy', pickedSource: cargo }) !== null));
  const regionOf = computeMoveRegion(memory(), cargo);
  check('edge: a slide region stops at reserved space', regionOf !== null && regionOf.segs.every((seg) => seg.type !== 'free' || seg.reservedBy === undefined));
  mergeAdjacentFree(memory());
  check('edge: mergeAdjacentFree leaves reserved space alone', memory().filter((seg) => seg.type === 'free' && seg.reservedBy !== undefined).length === 2);
  ticks(200);
}

// --- replaceRange refuses to overwrite what isn't its own ---------------------------------------------
{
  freshState(4, 2);
  const telemetry = memory().find((seg) => seg.name === 'Telemetry')!;
  let addr = 0;
  for (const seg of memory()) { if (seg === telemetry) break; addr += seg.size; }
  let threw = false;
  try { replaceRange(memory(), addr, addr + telemetry.size, [freeSegment(telemetry.size)], { opId: null, own: [] }); } catch { threw = true; }
  check('replaceRange throws on a range holding someone else\'s file', threw && memory().includes(telemetry));
  threw = false;
  try { splitFreeAt(memory(), addr + 1); } catch { threw = true; }
  check('splitFreeAt throws inside a file', threw);
  const sizes = [...memory()].map((seg) => seg.size).join(',');
  splitFreeAt(memory(), addr);
  check('splitFreeAt at a boundary changes nothing', [...memory()].map((seg) => seg.size).join(',') === sizes);
}

// --- Invariant checker catches each kind of breakage -----------------------------------------------
{
  const throws = (mutate: (copy: Segment[]) => void): boolean => {
    const copy = structuredClone(createInitialState({ seed: 1 }).memory);
    mutate(copy);
    try { assertMemoryInvariants(copy, memoryLayoutOf(store.getState()).totalBlocks); return false; } catch { return true; }
  };
  check('invariants: a wrong total throws', throws((copy) => { copy[0]!.size += 1; }));
  check('invariants: a zero size throws', throws((copy) => { copy.splice(1, 0, { id: 'zero', name: 'Free', type: 'free', size: 0 }); }));
  check('invariants: a duplicate id throws', throws((copy) => { copy[1]!.id = copy[0]!.id; }));
  check('invariants: two touching free segments throw', throws((copy) => {
    const index = copy.findIndex((seg) => seg.type === 'free');
    const free = copy[index]!;
    free.size -= 1;
    copy.splice(index + 1, 0, { id: 'extra', name: 'Free', type: 'free', size: 1 });
  }));
  check('invariants: touching free segments are fine when one is reserved', !throws((copy) => {
    const index = copy.findIndex((seg) => seg.type === 'free');
    const free = copy[index]!;
    free.size -= 1;
    copy.splice(index + 1, 0, { id: 'extra', name: 'Free', type: 'free', size: 1, reservedBy: 99 });
  }));
}

// --- An op completing in the same tick as its cancel ends exactly once ---------------------------
{
  freshState(5, 3);
  const calls = { completeA: 0, completeB: 0, cancelB: 0, abortB: 0 };
  let opB: Op | null = null;
  const timed = (): ((dtAi: number) => number) => { let elapsed = 0; return (dtAi) => { elapsed += dtAi; return elapsed >= 1 - 1e-9 ? 100 : elapsed * 100; }; };
  startOp({
    kind: 'scan', segId: 'test-a', targetIds: [], owner: 'test', label: 'A', icon: 'a', step: timed(),
    onComplete: () => { calls.completeA++; if (opB) cancelOp(opB.id); }, onCancel: () => {}, onAbort: () => {},
  });
  opB = startOp({
    kind: 'scan', segId: 'test-b', targetIds: [], owner: 'test', label: 'B', icon: 'b', step: timed(),
    onComplete: () => { calls.completeB++; }, onCancel: () => { calls.cancelB++; }, onAbort: () => { calls.abortB++; },
  });
  ticks(Math.ceil(1 / TICK) + 2);
  const lateCancel = cancelOp(opB.id);
  check('same tick: B cancelled by A\'s completion ends once, as a cancel', calls.completeA === 1 && calls.cancelB === 1
    && calls.completeB === 0 && calls.abortB === 0 && !lateCancel, JSON.stringify(calls));
}

// --- A scan on a file whose move is running is refused (busy), and both finish cleanly -------------
{
  freshState(6, 3);
  const sensor = memory().find((seg) => seg.name === 'Sensor Interp')!;
  // WP5: on the rack layout the biggest free region sits right after the locked root (which can't
  // be deleted), so take the biggest one whose left neighbour can go.
  const deletableBefore = (seg: Segment): boolean => {
    const index = memory().indexOf(seg);
    return index > 0 && actionRefusal(store.getState(), 'delete', memory()[index - 1]!) === null;
  };
  const bigFree = memory().filter(isOpenFree).filter(deletableBefore).sort((a, b) => b.size - a.size)[0]!;
  actionMove(store, sensor, { regionSegIds: [bigFree.id], col: 0 });
  const refused = actionScan(store, sensor);
  check('a file being moved can\'t be scanned (busy)', refused === 'BUSY — WAIT FOR IT TO FINISH', String(refused));
  ticks(200);
  check('…and the move completes with the file keeping its id', memory().some((seg) => seg.id === sensor.id && 'state' in seg && seg.state !== 'transferring') && settled() === null);
}

finish();
