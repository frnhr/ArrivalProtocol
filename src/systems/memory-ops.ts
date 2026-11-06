// Slice 4: Track TREE owns this file (docs/phase3/impl/slice-4-plan.md §5.2: unitInstallAddress, the skill
// invariants); others ask by message.
import type { Segment, FreeSegment } from '@/types/segment';
import { skillBlocks, skillDef } from '@data/skills';

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
// ids are unique, and no two free segments touch unless one of them is reserved by an op. A skill file (slice 4) is the
// size its version and lock make (data/skills.ts skillBlocks), and only AUTOBURN has a lock.
// Throws on the first violation, naming it.
export function assertMemoryInvariants(memory: readonly Segment[], total: number): void {
  const ids = new Set<string>();
  let sum = 0;
  for (let i = 0; i < memory.length; i++) {
    const seg = memory[i]!;
    if (!Number.isInteger(seg.size) || seg.size < 1) throw new Error(`memory: ${seg.name} (${seg.id}) has size ${seg.size}`);
    if (ids.has(seg.id)) throw new Error(`memory: duplicate id ${seg.id}`);
    if (seg.type === 'upgrade' && 'version' in seg) {
      if (seg.lock !== 0 && skillDef(seg.upgrade).locks.length === 0) throw new Error(`memory: ${seg.name} (${seg.id}) has lock ${seg.lock}`);
      const want = skillBlocks(seg.upgrade, seg.version, seg.lock);
      if (seg.size !== want) throw new Error(`memory: ${seg.name} (${seg.id}) v${seg.version} lock ${seg.lock} is ${seg.size} blocks, not ${want}`);
    }
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

// The unit's own files: what carries from ship to ship (§6.9): the Core, the AI tools, the skills, the fs-tools, the upgrade
// files and FIREWALLs picked between ships, REPAIR CHARGE, and 046.log (05 §3.2: locked in the packet). Ship files, drivers
// and HOLLOW stay. (data/memory.ts re-exports it, where its callers have always found it.)
export function isUnitFileType(seg: Segment): boolean {
  return seg.type === 'core' || seg.type === 'tool' || seg.type === 'fs-tool' || seg.type === 'redundancy'
    || seg.type === 'upgrade' || seg.type === 'firewall' || seg.type === 'log';
}

// Where a new unit file of `size` blocks goes when it is written into memory mid-run (slice 4, plan §2.16 item 3: one rule
// for the licences' tool files, the repository's deliveries written by __ap.give, a granted or debug skill
// (skill-files.ts installSkillFile) and 4d's FIREWALL): the start of the LAST open free region that fits, scanning back from
// the end of memory. That is the receiver's free run right after REPAIR CHARGE (the unit's block is files, seeds, then the
// charge, from rack E's start), on every memory class (a TIGHT ship's receiver is rack E alone), so a new file lands next to
// the unit's others. A receiver with no room after the charge (a TIGHT unit spilled back into the tail) puts it flush
// against the unit's block from below, not at the far end of the pod rack's free run. A full receiver sends it to the last
// free run among the pods. Space a running move or copy reserved is never used. No room at all is a design error (a
// layout that can't take its own files): throws. (Phase 2 had two rules: licences' and AUTOBURN's skillAddress, which
// looked forward from rack E; the skill rule was the only one that disagreed, and its install path is gone.)
export function unitInstallAddress(memory: readonly Segment[], size: number): number {
  const starts = segmentStarts(memory);
  const charge = memory.findIndex((seg) => seg.type === 'redundancy');
  for (let i = memory.length - 1; i >= 0; i--) {
    const seg = memory[i]!;
    if (seg.type !== 'free' || seg.reservedBy !== undefined || seg.size < size) continue;
    if (charge >= 0 && i < charge && memory[i + 1]?.type === 'core' && memory.slice(i + 1, charge).every(isUnitFileType)) {
      return starts[i]! + seg.size - size;
    }
    return starts[i]!;
  }
  throw new Error(`memory: no free space for a ${size}-block unit file`);
}
