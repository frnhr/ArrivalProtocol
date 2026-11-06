// Slice 4: Track FLIGHT may add the claim's hook here, nothing else (docs/phase3/impl/slice-4-plan.md §5.2).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { coreThreads } from '@state/selectors';
import { OP_COMPLETE_PCT, OP_PROGRESS_HZ } from '@data/tuning';

// The ops core (§6.5, §9 WP3): every fs-tool op the mind runs, on AI time. No page or view code
// in here, so headless tests drive it with clock.advance(); OpBars.ts is the separate view.
//
// • An op is { kind, segId, targetIds, owner, label, icon, step, onComplete, onCancel, onAbort }.
//   Each AI tick calls step(dtAi), which does the op's work for that slice of AI time and
//   returns its progress 0..100; at 100 the op completes. Warp and SKIP never touch AI time, so
//   a repair takes the same real seconds at ×1 and ×2000, and pause freezes it.
// • cancel(id) is the PLAYER stopping an op (onCancel). abort(id) is the SYSTEM stopping one
//   (a consumed target, a printed cluster: onAbort, never onCancel). Whichever of complete,
//   cancel and abort comes first wins; the others are no-ops, so an op that completes in the
//   same tick its cancel arrives ends exactly once.
// • Every running op holds one Core thread; reserveThread(owner) holds one without an op
//   (AUTOBURN, SWAP). threadsBusy() counts both, and canStartOp() compares them with the Core's
//   threads (capacity, or 1 while the Core is below 50).
// • onOpsChange tells views about start, progress (at most OP_PROGRESS_HZ per op), end, and
//   `threads` whenever the busy count or the thread total changes (a reserve or release, or the
//   Core's integrity crossing CORE_LOW_INTEGRITY mid-op: the views repaint only on changes).
// • A world reset drops every op WITHOUT callbacks: the store's slices have already been
//   replaced, and a callback would reshape the new ship's memory.

export type OpKind = 'scan' | 'repair' | 'compact' | 'move' | 'copy' | 'delete' | 'swap';

// Who started an op or holds a thread: the player (SWAP included, WP10), AUTOBURN; HOLLOW's verbs later (WP11).
export type OpOwner = string;

// View hints, plain data: a move drains its source's old blocks while the clone fills.
export interface OpView {
  reverseFill: boolean;   // fill from the far end (an overlapping move to the right: tail first)
  drain: { startAddr: number; endAddr: number } | null;
  // The bar runs across every file the op touches, in their order (WP10: a SWAP fills from the old controller into
  // its backup, the job handed over), not only the one it sits on.
  spanTargets: boolean;
}

export interface OpSpec {
  kind: OpKind;
  segId: string;                 // the segment the bar sits on (a move's or copy's clone)
  targetIds: readonly string[];  // every segment the op touches (getOpsBySeg indexes them all)
  owner: OpOwner;
  label: string;
  icon: string;
  view?: OpView;
  // Does the op's work for dtAi AI seconds and returns its progress (0..100). step(0) must have
  // no effect: startOp calls it once to read the starting progress (a repair starts at the
  // file's integrity).
  step(dtAi: number): number;
  onComplete(): void;
  onCancel(): void;
  onAbort(): void;
}

export interface Op {
  readonly id: number;
  readonly kind: OpKind;
  readonly segId: string;
  readonly targetIds: readonly string[];
  readonly owner: OpOwner;
  readonly label: string;
  readonly icon: string;
  readonly view: OpView;
  pct: number;          // the latest progress step() reported
  aiSec: number;        // AI seconds the op has run
}

export type OpEndReason = 'complete' | 'cancel' | 'abort' | 'reset';

export type OpsChange =
  | { type: 'start'; operation: Op }
  | { type: 'progress'; operation: Op }
  | { type: 'end'; operation: Op; reason: OpEndReason }
  | { type: 'threads' };

interface Entry {
  operation: Op;
  spec: OpSpec;
  sinceReport: number;  // AI seconds since the last progress report
}

const NO_VIEW: OpView = Object.freeze({ reverseFill: false, drain: null, spanTargets: false });
const REPORT_EVERY_SEC = 1 / OP_PROGRESS_HZ;

const running = new Map<number, Entry>();
const bySeg = new Map<string, Set<number>>();
const reservedThreads = new Set<OpOwner>();
const listeners = new Set<(change: OpsChange) => void>();
let nextOpId = 1;
let storeRef: Store<GameState> | null = null;
// The thread total the views last heard about (null until the first tick looks).
let announcedThreadsTotal: number | null = null;

function requireStore(): Store<GameState> {
  if (!storeRef) throw new Error('ops-core: mountOpsCore has not run');
  return storeRef;
}

function announce(change: OpsChange): void {
  listeners.forEach((listener) => listener(change));
}

export function onOpsChange(listener: (change: OpsChange) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function index(operation: Op): void {
  for (const id of new Set([operation.segId, ...operation.targetIds])) {
    let set = bySeg.get(id);
    if (!set) { set = new Set(); bySeg.set(id, set); }
    set.add(operation.id);
  }
}

function unindex(operation: Op): void {
  for (const id of new Set([operation.segId, ...operation.targetIds])) {
    const set = bySeg.get(id);
    if (!set) continue;
    set.delete(operation.id);
    if (set.size === 0) bySeg.delete(id);
  }
}

// --- Threads -------------------------------------------------------------------------------

export function threadsBusy(): number {
  return running.size + reservedThreads.size;
}

export function threadsTotal(): number {
  return coreThreads(requireStore().getState());
}

export function canStartOp(): boolean {
  return threadsBusy() < threadsTotal();
}

// Holds one thread for `owner` without an op (AUTOBURN, SWAP). false when every thread is busy.
export function reserveThread(owner: OpOwner): boolean {
  if (reservedThreads.has(owner)) throw new Error(`reserveThread: '${owner}' already holds a thread`);
  if (!canStartOp()) return false;
  reservedThreads.add(owner);
  announce({ type: 'threads' });
  return true;
}

export function releaseThread(owner: OpOwner): boolean {
  if (!reservedThreads.delete(owner)) return false;
  announce({ type: 'threads' });
  return true;
}

// --- Ops -----------------------------------------------------------------------------------

// Starts an op. Callers check canStartOp() first (a refused op must leave no half-state behind),
// so starting without a free thread is a bug and throws.
export function startOp(spec: OpSpec): Op {
  requireStore();
  if (!canStartOp()) throw new Error(`startOp(${spec.kind} ${spec.segId}): no free thread`);
  const operation: Op = {
    id: nextOpId++,
    kind: spec.kind,
    segId: spec.segId,
    targetIds: [...spec.targetIds],
    owner: spec.owner,
    label: spec.label,
    icon: spec.icon,
    view: spec.view ?? NO_VIEW,
    pct: 0,
    aiSec: 0,
  };
  operation.pct = spec.step(0);
  running.set(operation.id, { operation, spec, sinceReport: 0 });
  index(operation);
  announce({ type: 'start', operation });
  return operation;
}

// Takes the op out FIRST (its thread is free and getOpsBySeg no longer lists it inside the
// callback), tells the views, then runs the op's own ending.
function end(entry: Entry, reason: Exclude<OpEndReason, 'reset'>): void {
  running.delete(entry.operation.id);
  unindex(entry.operation);
  announce({ type: 'end', operation: entry.operation, reason });
  if (reason === 'complete') entry.spec.onComplete();
  else if (reason === 'cancel') entry.spec.onCancel();
  else entry.spec.onAbort();
}

// The player stops an op. false when it is not running (it already ended).
export function cancelOp(opId: number): boolean {
  const entry = running.get(opId);
  if (!entry) return false;
  end(entry, 'cancel');
  return true;
}

// The system stops an op. false when it is not running.
export function abortOp(opId: number): boolean {
  const entry = running.get(opId);
  if (!entry) return false;
  end(entry, 'abort');
  return true;
}

export function abortAll(): void {
  for (const opId of [...running.keys()]) abortOp(opId);
}

export function getOps(): Op[] {
  return [...running.values()].map((entry) => entry.operation);
}

// The running ops that touch a segment, as their bar's file or as a target.
export function getOpsBySeg(segId: string): Op[] {
  const ids = bySeg.get(segId);
  if (!ids) return [];
  return [...ids].map((opId) => running.get(opId)!.operation);
}

// The total follows the Core's integrity, which a repair (or later a bite) changes without a
// store update, so it is compared once per AI tick and announced when it moved.
function announceThreadsTotalChange(): void {
  const total = threadsTotal();
  if (total === announcedThreadsTotal) return;
  const known = announcedThreadsTotal !== null;
  announcedThreadsTotal = total;
  if (known) announce({ type: 'threads' });
}

function tick(dtAi: number): void {
  // A snapshot: an op's ending may start, cancel or abort others.
  for (const entry of [...running.values()]) {
    if (!running.has(entry.operation.id)) continue;
    entry.operation.aiSec += dtAi;
    const pct = entry.spec.step(dtAi);
    entry.operation.pct = pct;
    if (pct >= OP_COMPLETE_PCT) {
      end(entry, 'complete');
      continue;
    }
    entry.sinceReport += dtAi;
    if (entry.sinceReport >= REPORT_EVERY_SEC) {
      entry.sinceReport = 0;
      announce({ type: 'progress', operation: entry.operation });
    }
  }
  announceThreadsTotalChange();
}

function resetOps(): void {
  const dropped = [...running.values()];
  running.clear();
  bySeg.clear();
  reservedThreads.clear();
  announcedThreadsTotal = null;
  for (const entry of dropped) announce({ type: 'end', operation: entry.operation, reason: 'reset' });
  announce({ type: 'threads' });
}

export function mountOpsCore(store: Store<GameState>): () => void {
  if (storeRef) throw new Error('mountOpsCore: already mounted');
  storeRef = store;
  const offTick = onAiTick(tick);
  const offReset = onWorldReset('ops-core', resetOps,
    () => ({ running: running.size, reserved: reservedThreads.size, announcedThreadsTotal }));
  return () => {
    offTick();
    offReset();
    resetOps();
    storeRef = null;
  };
}
