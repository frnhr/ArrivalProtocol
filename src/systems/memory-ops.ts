import type { Segment } from '@/types/segment';

// Coalesce any run of adjacent free segments in place. The first free seg in
// the run absorbs the others' sizes; subsequent ones are spliced out. Mutates
// the array. Safe to call after any memory operation that may leave neighbours.
export function mergeAdjacentFree(memory: Segment[]): void {
  for (let i = memory.length - 1; i > 0; i--) {
    const current = memory[i];
    const prev = memory[i - 1];
    if (current?.type === 'free' && prev?.type === 'free') {
      prev.size += current.size;
      memory.splice(i, 1);
    }
  }
}

// Absolute address (zero-based block index) of a segment. The address is the
// running sum of all preceding segment sizes. Returns -1 if not found.
export function memAddrOf(memory: readonly Segment[], seg: Segment): number {
  const idx = memory.indexOf(seg);
  if (idx === -1) return -1;
  let addr = 0;
  for (let i = 0; i < idx; i++) addr += memory[i]!.size;
  return addr;
}
