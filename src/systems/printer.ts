import type { Store } from '@state/store';
import type { GameState, ClusterResult } from '@state/schema';
import type { SoulSegment } from '@/types/segment';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { getPrediction } from '@systems/predict';
import { capabilitiesNow } from '@systems/capabilities';
import { getOpsBySeg, abortOp } from '@systems/ops-core';
import { replaceRange, mergeAdjacentFree, requireAddr, freeSegment, assertMemoryInvariants } from '@systems/memory-ops';
import { childRng, type Rng } from '@systems/rng';
import { say } from '@systems/say';
import { soulsInMemory, soulOutcome, anythingInfected, finalePending } from '@state/selectors';
import { recordClusterGone } from '@state/actions';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { printEcho } from '@data/script';
import { IS_DEV } from '@/env';
import {
  PRINT_RANGE_FLOOR, PRINT_FAST_FACTOR, PRINT_DONE_LINGER_SEC, REVEAL_PRINT_GAP_SEC, FLOAT_SLACK, NO_PRINTER_GIVE_UP_SEC,
} from '@data/tuning';

// The printer (§6.7, §9 WP5 item 7): once the orbit is locked or accepted, the bio-printers on the
// surface receive the colonists one cluster at a time, and each one that prints leaves memory for
// a body on the ground. It runs on AI time (§3.4), in phase 'printing':
// • interval = ship.printBaseSec / max(printer range, PRINT_RANGE_FLOOR) / the Printer Uplink's
//   speed, × PRINT_FAST_FACTOR with PRINT FAST ▸▸. The printer range is the TRUE prediction's
//   green fraction, live; the Uplink's speed is its band (C7), and NO PRINTER halts printing;
// • order: PRINT NEXT if it can print, else the lowest address. A sealed, infected, moving,
//   repairing or busy cluster is skipped, so a repair started before its cluster's turn always
//   finishes first;
// • outcome: integrity ≥ SOUL_WAKE_INTACT_MIN wakes intact, else with missing memories; below
//   PRINT_RANGE_FLOOR range a seeded roll may still give it gaps, p = (floor − range) / floor;
// • each print: `cluster-printed` (the chip flashes, the bell rings, `+200 WOKE` pops), the cluster
//   becomes free space, and the TERMINAL echoes `> print c04 ... 200 WOKE`;
// • with no cluster left the ship lingers PRINT_DONE_LINGER_SEC (and while HOLLOW's story beat is
//   still to be said, or LAST LIGHT's finale is still on: WP11, the duel or the choice), then the WAKE REPORT ('report');
// • while HOLLOW's story after a fight is being told, nothing prints (its lines get a quiet screen).
// While the archive is still being found (the reveal) nothing prints, and the first print waits
// REVEAL_PRINT_GAP_SEC after a reveal ends.

export type PrinterRefusal = string;

let storeRef: Store<GameState> | null = null;
let printRng: Rng | null = null;
let gapAfterReveal = false;
// AI seconds the printer has been halted with no Printer Uplink (NO PRINTER) while clusters wait.
let haltedSec = 0;

function requireStore(): Store<GameState> {
  if (!storeRef) throw new Error('printer: mountPrinter has not run');
  return storeRef;
}

// The seeded stream for the low-range roll (one draw per roll, only when the range is low).
function rollStream(state: Readonly<GameState>): Rng {
  if (!printRng) printRng = childRng(state.run.seed, state.run.shipIndex, 'print');
  return printRng;
}

// AI seconds per cluster, or Infinity when the printer can't print (speed 0: NO PRINTER).
export function printIntervalSec(baseSec: number, range: number, speed: number, fast: boolean): number {
  if (!(speed > 0)) return Infinity;
  const interval = baseSec / Math.max(range, PRINT_RANGE_FLOOR) / speed;
  return fast ? interval * PRINT_FAST_FACTOR : interval;
}

// The printer range (§3.3 P2): the share of the orbit inside the SAFE ORBIT ring, time-weighted,
// from the TRUE prediction (damage never changes where the ship really is).
export function printerRange(): number {
  return getPrediction().greenFraction;
}

// PRINT FAST ▸▸ works only while nothing is infected (§6.7): hurrying the printer while HOLLOW eats
// would only rush the clean clusters out and leave the fight for later. A fast printer that HOLLOW
// bites mid-run slows back down on its own, and speeds up again once the mind is clear.
export function printFastActive(state: Readonly<GameState>): boolean {
  return state.printer.fast && !anythingInfected(state);
}

// The interval right now, as the HUD would show it (`PRINT 2.5 s/cluster`).
export function currentIntervalSec(state: Readonly<GameState>): number {
  return printIntervalSec(state.printer.baseSec, printerRange(), capabilitiesNow(state).printer.speed, printFastActive(state));
}

// A cluster the printer may take now: out of its slab, not being eaten, not moving, not being
// repaired or worked on.
export function isPrintable(soul: SoulSegment): boolean {
  if (soul.sealed || soul.infected || soul.operating) return false;
  return soul.state !== 'transferring' && soul.state !== 'repairing' && soul.state !== 'offline';
}

// The next cluster to print: PRINT NEXT's if it can print now, else the lowest address that can.
export function nextToPrint(state: Readonly<GameState>): SoulSegment | null {
  const printable = soulsInMemory(state).filter(isPrintable);
  const pinned = state.printer.printNext;
  return printable.find((soul) => soul.cluster === pinned) ?? printable[0] ?? null;
}

// Prints `soul` now: its outcome, the moment (before it leaves memory, so the view can flash its
// chip), then the memory change and the record. Any op still on it is aborted (its own onAbort
// settles the charge, rounding up): what is printed is gone.
export function printCluster(store: Store<GameState>, soul: SoulSegment, range: number): ClusterResult {
  const state = store.getState();
  let outcome = soulOutcome(soul.integrity);
  if (outcome === 'woke' && range < PRINT_RANGE_FLOOR
    && rollStream(state)() < (PRINT_RANGE_FLOOR - range) / PRINT_RANGE_FLOOR) {
    outcome = 'gaps';
  }
  const result: ClusterResult = {
    cluster: soul.cluster,
    family: soul.family,
    souls: soul.souls,
    outcome,
    integrity: soul.integrity,
    range,
    featured: soul.featured,
  };
  emit('cluster-printed', { segId: soul.id, cluster: soul.cluster, outcome, souls: soul.souls });
  for (const operation of getOpsBySeg(soul.id)) abortOp(operation.id);

  const memory = store.getState().memory;
  const start = requireAddr(memory, soul);
  replaceRange(memory, start, start + soul.size, [freeSegment(soul.size)], { opId: null, own: [soul] });
  mergeAdjacentFree(memory);
  if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  store.update((draft) => {
    recordClusterGone(draft, soul, result);
    draft.ui.memoryRev++;
  });
  say('cmd', printEcho(soul.cluster, soul.souls, outcome), { critical: true });
  return result;
}

// What the printer is doing, for INSPECT and the mini-HUD: clusters done of the ship's total, the
// seconds per cluster right now (Infinity: NO PRINTER), PRINT FAST.
export interface PrintStatus {
  printing: boolean;
  done: number;
  total: number;
  intervalSec: number;
  fast: boolean;
  halted: boolean;
}

export function printStatus(state: Readonly<GameState>): PrintStatus {
  const done = state.souls.results.length;
  const total = done + soulsInMemory(state).length;
  if (state.run.phase !== 'printing') return { printing: false, done, total, intervalSec: Infinity, fast: state.printer.fast, halted: false };
  const intervalSec = currentIntervalSec(state);
  return { printing: true, done, total, intervalSec, fast: printFastActive(state), halted: !Number.isFinite(intervalSec) };
}

function printingRefusal(state: Readonly<GameState>): PrinterRefusal | null {
  if (state.run.phase !== 'printing') return 'NOT PRINTING';
  if (state.clock.paused) return 'PAUSED';
  return null;
}

// PRINT NEXT (§6.7): this cluster goes to the front of the line. Pressing it again on the same
// cluster takes it back out. A pinned cluster that can't print right now (moving, repairing, later
// infected) is skipped and stays pinned.
export function setPrintNext(store: Store<GameState>, cluster: string): PrinterRefusal | null {
  const state = store.getState();
  const refusal = printingRefusal(state);
  if (refusal) { emit('refused', { reason: refusal }); return refusal; }
  const soul = soulsInMemory(state).find((candidate) => candidate.cluster === cluster);
  if (!soul || soul.sealed) throw new Error(`setPrintNext: ${cluster} is not an open cluster in memory`);
  store.update((draft) => { draft.printer.printNext = draft.printer.printNext === cluster ? null : cluster; });
  return null;
}

// Why PRINT FAST can't be switched on now (null: it can). Switching it off is always allowed.
export const PRINT_FAST_INFECTED = 'INFECTED — REPAIR FIRST';

export function printFastRefusal(state: Readonly<GameState>): PrinterRefusal | null {
  return printingRefusal(state) ?? (anythingInfected(state) ? PRINT_FAST_INFECTED : null);
}

// PRINT FAST ▸▸ (§6.7): a quarter of the interval, while nothing is infected (printFastActive).
export function setPrintFast(store: Store<GameState>, fast: boolean): PrinterRefusal | null {
  const state = store.getState();
  const refusal = fast ? printFastRefusal(state) : printingRefusal(state);
  if (refusal) { emit('refused', { reason: refusal }); return refusal; }
  if (state.printer.fast !== fast) store.update((draft) => { draft.printer.fast = fast; });
  return null;
}

// Every cluster still in memory did not wake (NO PRINTER gave up): each leaves memory as a result,
// like a print that could not happen, and the ship lingers into its WAKE REPORT.
function loseUnprinted(store: Store<GameState>): void {
  const souls = soulsInMemory(store.getState());
  for (const soul of souls) {
    for (const operation of getOpsBySeg(soul.id)) abortOp(operation.id);
    const memory = store.getState().memory;
    const start = requireAddr(memory, soul);
    replaceRange(memory, start, start + soul.size, [freeSegment(soul.size)], { opId: null, own: [soul] });
  }
  mergeAdjacentFree(store.getState().memory);
  if (IS_DEV) assertMemoryInvariants(store.getState().memory, MEMORY_TOTAL_BLOCKS);
  store.update((draft) => {
    for (const soul of souls) {
      draft.souls.results.push({
        cluster: soul.cluster, family: soul.family, souls: soul.souls, outcome: 'lost', integrity: soul.integrity, range: 0, featured: soul.featured,
      });
    }
    draft.printer.printNext = null;
    draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  haltedSec = 0;
}

function tick(store: Store<GameState>, dtAi: number): void {
  const state = store.getState();
  if (state.run.phase !== 'printing') return;
  const printer = state.printer;

  // Every cluster has left memory: the last bell rings out, then the WAKE REPORT. HOLLOW's story
  // beat after a fight (`> ...047?`, WP6) is part of this ship: the report waits for it.
  if (printer.lingerAiSec !== null) {
    const left = printer.lingerAiSec - dtAi;
    if (left > 0 || state.hollow.story === 'pending' || finalePending(state)) store.mutate((draft) => { draft.printer.lingerAiSec = Math.max(0, left); });
    else store.update((draft) => { draft.printer.lingerAiSec = null; draft.run.phase = 'report'; });
    return;
  }
  if (soulsInMemory(state).length === 0) {
    store.mutate((draft) => { draft.printer.lingerAiSec = PRINT_DONE_LINGER_SEC; });
    return;
  }
  // The colonists are still being found: nothing prints until the reveal is over, then the kid
  // gets a moment to see them before the first one leaves.
  if (state.souls.reveal.stage !== 'revealed') return;
  if (gapAfterReveal) {
    gapAfterReveal = false;
    store.mutate((draft) => { draft.printer.waitAiSec = REVEAL_PRINT_GAP_SEC; draft.printer.progress = 0; });
    return;
  }
  if (printer.waitAiSec > 0) {
    store.mutate((draft) => { draft.printer.waitAiSec = Math.max(0, printer.waitAiSec - dtAi); });
    return;
  }
  // HOLLOW's story after a fight (`> ...047?`, CONTROL; systems/hollow.ts) is told over a quiet printer:
  // a print every 2.5 s rang its bell, floated `+200 WOKE` and typed its echo 0.35 s after `> ...047?`,
  // and under CONTROL's line (LEAD-1 review round 1). The work holds where it is (the gap after a reveal
  // still counts down above) and goes on once the story is told.
  if (state.hollow.story === 'pending') return;

  const next = nextToPrint(state);
  const interval = currentIntervalSec(state);
  // NO PRINTER (an infinite interval): the Printer Uplink is a ship file, which nothing heals, so the
  // halt is for good. The strip says `NO PRINTER — nobody can be printed` for NO_PRINTER_GIVE_UP_SEC,
  // then the colonists still in memory are lost and the ship goes on to its WAKE REPORT (a halted
  // printer used to hold the ship forever).
  if (!Number.isFinite(interval)) {
    haltedSec += dtAi;
    if (haltedSec >= NO_PRINTER_GIVE_UP_SEC) loseUnprinted(store);
    return;
  }
  haltedSec = 0;
  // A line of clusters that are all busy right now holds the work too: the printer waits for one, it
  // never banks time.
  if (!next) return;
  let progress = printer.progress + dtAi / interval;
  if (progress >= 1 - FLOAT_SLACK) {
    printCluster(store, next, printerRange());
    progress = Math.max(0, progress - 1);
  }
  store.mutate((draft) => { draft.printer.progress = progress; });
}

let mounted = false;

export function mountPrinter(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountPrinter: already mounted');
  mounted = true;
  storeRef = store;
  // A reveal that ends while printing (the archive was found by the printer) holds the first print.
  const offReveal = on('reveal-done', () => { if (requireStore().getState().run.phase === 'printing') gapAfterReveal = true; });
  const offTick = onAiTick((dtAi) => tick(store, dtAi));
  const offReset = onWorldReset('printer', () => {
    printRng = null;
    gapAfterReveal = false;
    haltedSec = 0;
  }, () => ({ rolled: printRng !== null, gapAfterReveal, haltedSec }));
  return () => {
    offReveal();
    offTick();
    offReset();
    storeRef = null;
    mounted = false;
  };
}
