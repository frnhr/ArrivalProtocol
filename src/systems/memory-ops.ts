// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Segment, FreeSegment } from '@/types/segment';

// Structural memory helpers (§6.12). The strip is one ordered array; a segment's address is the
// running sum of the sizes before it. Ops, HOLLOW, the printer, seeds and verbs all reshape it
// while other ops run, so every structural change goes through these helpers, works by ADDRESS
// (never by a remembered array index), and is followed by assertMemoryInvariants in dev builds
// and in every headless test. Pure: no store, no DOM.

// Ids for segments made at runtime (free gaps, clones, copies) come from a counter, never the
// clock: two ops finishing in the same tick made colliding Date.now() ids. The counter is never
// reset: ids only need to be unique within one page, and no seed id contains '~'.
let segIdCounter = 0;

export function newSegId(base: string): string {
  segIdCounter++;
  return `${base.replace(/~\d+$/, '')}~${segIdCounter}`;
}

// The highest runtime id number in a stored state's JSON (`free~217"` → 217; 0 when there is none). A state restored into a
// fresh page or process (slice 3c's resume, the suites' flyOnce) carries ids this page's counter has not reached yet.
export function highestSegId(json: string): number {
  let highest = 0;
  for (const match of json.matchAll(/~(\d+)"/g)) highest = Math.max(highest, Number(match[1]));
  return highest;
}

// Moves the counter past `highest` (never back), so the next runtime id can't repeat one a restored state already holds
// (slice 3b review: a setup restored from disk minted `free~217` again beside its own and threw `memory: duplicate id`).
export function reserveSegIds(highest: number): void {
  if (!(Number.isInteger(highest) && highest >= 0)) throw new Error(`reserveSegIds: ${highest} is not an id number`);
  segIdCounter = Math.max(segIdCounter, highest);
}

// Runs `build` and puts the counter back where it was (slice 3c review fix, minor 6): for a throwaway construction whose
// segments never reach a world (the run save's references, save-codec refs()), so reading a save mints no id and moves no
// counter. Anything `build` returns must stay out of the world: its ids will be minted again.
export function withScratchSegIds<T>(build: () => T): T {
  const before = segIdCounter;
  try {
    return build();
  } finally {
    segIdCounter = before;
  }
}

// The counter now (the suites check that a pure read moved nothing).
export function segIdsMinted(): number {
  return segIdCounter;
}

export function freeSegment(size: number, reservedBy?: number): FreeSegment {
  const seg: FreeSegment = { id: newSegId('free'), name: 'Free', type: 'free', size };
  if (reservedBy !== undefined) seg.reservedBy = reservedBy;
  return seg;
}

// Absolute address (zero-based block index) of a segment, or -1 when it is not in memory.
export function memAddrOf(memory: readonly Segment[], seg: Segment): number {
  const idx = memory.indexOf(seg);
  if (idx === -1) return -1;
  let addr = 0;
  for (let i = 0; i < idx; i++) addr += memory[i]!.size;
  return addr;
}

// The address of a segment that must be in memory (an op's own clone, a target it holds).
export function requireAddr(memory: readonly Segment[], seg: Segment): number {
  const addr = memAddrOf(memory, seg);
  if (addr < 0) throw new Error(`memory-ops: ${seg.name} (${seg.id}) is not in memory`);
  return addr;
}

export function totalBlocks(memory: readonly Segment[]): number {
  return memory.reduce((sum, seg) => sum + seg.size, 0);
}

// Start address of every segment, in memory order.
export function segmentStarts(memory: readonly Segment[]): number[] {
  const starts: number[] = [];
  let addr = 0;
  for (const seg of memory) { starts.push(addr); addr += seg.size; }
  return starts;
}

// Makes `addr` a segment boundary by splitting the free segment that covers it (the original
// keeps the head, a new free segment takes the tail, with the same reservation). A boundary or
// either end of memory is left alone; an address inside anything but free space throws.
export function splitFreeAt(memory: Segment[], addr: number): void {
  let start = 0;
  for (let i = 0; i < memory.length; i++) {
    const seg = memory[i]!;
    const end = start + seg.size;
    if (addr <= start) return;
    if (addr < end) {
      if (seg.type !== 'free') throw new Error(`splitFreeAt: address ${addr} is inside ${seg.name} (${seg.type})`);
      const tail = freeSegment(end - addr, seg.reservedBy);
      seg.size = addr - start;
      memory.splice(i + 1, 0, tail);
      return;
    }
    start = end;
  }
  if (addr > start) throw new Error(`splitFreeAt: address ${addr} is past the end of memory (${start})`);
}

// Who may be overwritten by a replaceRange: free space that is unreserved or reserved by this op,
// and the op's own segments (a move's source, a clone).
export interface RangeOwner {
  opId: number | null;
  own: readonly Segment[];
}

// Replaces the blocks [startAddr, endAddr) with `segs` (which must fill exactly that width) and
// returns the segments it took out, in order. Throws if the range holds anything but free space
// and the op's own segments: an op may only ever write where it reserved. Splits free space at
// the two ends when needed; the caller merges afterwards (mergeAdjacentFree).
export function replaceRange(
  memory: Segment[], startAddr: number, endAddr: number, segs: readonly Segment[], owner: RangeOwner,
): Segment[] {
  if (!(startAddr < endAddr)) throw new Error(`replaceRange: empty range ${startAddr}..${endAddr}`);
  const width = endAddr - startAddr;
  const filled = segs.reduce((sum, seg) => sum + seg.size, 0);
  if (filled !== width) throw new Error(`replaceRange: ${filled} blocks do not fill ${startAddr}..${endAddr} (${width})`);
  splitFreeAt(memory, startAddr);
  splitFreeAt(memory, endAddr);
  let first = -1;
  let last = -1;
  let addr = 0;
  for (let i = 0; i < memory.length; i++) {
    if (addr === startAddr) first = i;
    addr += memory[i]!.size;
    if (addr === endAddr) { last = i; break; }
  }
  if (first < 0 || last < first) throw new Error(`replaceRange: ${startAddr}..${endAddr} is not on segment boundaries`);
  const removed = memory.slice(first, last + 1);
  for (const seg of removed) {
    const ours = owner.own.includes(seg);
    const freeForUs = seg.type === 'free' && (seg.reservedBy === undefined || seg.reservedBy === owner.opId);
    if (!ours && !freeForUs) {
      throw new Error(`replaceRange: ${startAddr}..${endAddr} holds ${seg.name} (${seg.type}${seg.type === 'free' ? `, reserved by op ${seg.reservedBy}` : ''})`);
    }
  }
  memory.splice(first, removed.length, ...segs);
  return removed;
}

// Coalesces every run of adjacent free segments in place (the first one absorbs the rest).
// Free space reserved by a running op is never merged: it belongs to that op's address range.
export function mergeAdjacentFree(memory: Segment[]): void {
  for (let i = memory.length - 1; i > 0; i--) {
    const current = memory[i]!;
    const prev = memory[i - 1]!;
    if (current.type === 'free' && prev.type === 'free'
        && current.reservedBy === undefined && prev.reservedBy === undefined) {
      prev.size += current.size;
      memory.splice(i, 1);
    }
  }
}

// Hands an op's reserved free space back to the strip (the caller merges afterwards).
export function releaseReservations(memory: Segment[], opId: number): void {
  for (const seg of memory) {
    if (seg.type === 'free' && seg.reservedBy === opId) delete seg.reservedBy;
  }
}

// The invariants (§6.12): the sizes sum to the strip's total, every size is a whole number ≥ 1,
// ids are unique, and no two free segments touch unless one of them is reserved by an op.
// Throws on the first violation, naming it.
export function assertMemoryInvariants(memory: readonly Segment[], total: number): void {
  const ids = new Set<string>();
  let sum = 0;
  for (let i = 0; i < memory.length; i++) {
    const seg = memory[i]!;
    if (!Number.isInteger(seg.size) || seg.size < 1) throw new Error(`memory: ${seg.name} (${seg.id}) has size ${seg.size}`);
    if (ids.has(seg.id)) throw new Error(`memory: duplicate id ${seg.id}`);
    ids.add(seg.id);
    sum += seg.size;
    const prev = i > 0 ? memory[i - 1]! : null;
    if (prev && prev.type === 'free' && seg.type === 'free'
        && prev.reservedBy === undefined && seg.reservedBy === undefined) {
      throw new Error(`memory: free segments ${prev.id} and ${seg.id} touch at index ${i}`);
    }
  }
  if (sum !== total) throw new Error(`memory: sizes sum to ${sum}, not ${total}`);
}
