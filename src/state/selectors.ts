import type { GameState } from './schema';
import type { Segment, RedundancySegment, FsToolSegment, CoreSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';

export function getSegmentById(state: GameState, id: string): Segment | undefined {
  return state.memory.find((seg) => seg.id === id);
}

export function getRedundancy(state: GameState): RedundancySegment | undefined {
  return state.memory.find((seg): seg is RedundancySegment => seg.type === 'redundancy');
}

// The AI Core segment also carries the concurrency budget — the Core IS the
// compute substrate that runs both the player's consciousness and the tools.
// See systems/ops.ts for how `capacity` gates new op starts.
export function getAiCore(state: GameState): CoreSegment | undefined {
  return state.memory.find((seg): seg is CoreSegment => seg.type === 'core');
}

// Find an available fs-tool of the requested kind. "Available" = above 50%
// integrity. Tools are NOT consumed by use — multiple ops of the same kind
// run in parallel against different targets, so there's no busy-mutex on the
// tool segment itself. Global concurrency comes from the AI Core's `capacity`
// (see getAiCore and systems/ops.ts).
export function getFsTool(state: GameState, kind: FsToolKind): FsToolSegment | undefined {
  return state.memory.find(
    (seg): seg is FsToolSegment =>
      seg.type === 'fs-tool' && seg.fsTool === kind && seg.integrity > 50,
  );
}

export function getFreeTotal(state: GameState): number {
  return state.memory
    .filter((seg) => seg.type === 'free')
    .reduce((sum, seg) => sum + seg.size, 0);
}

// Address of a segment is its zero-based block index — the running sum of preceding segment sizes.
export function memAddrOf(state: GameState, segId: string): number | null {
  let addr = 0;
  for (const seg of state.memory) {
    if (seg.id === segId) return addr;
    addr += seg.size;
  }
  return null;
}

export function totalSize(state: GameState): number {
  return state.memory.reduce((sum, seg) => sum + seg.size, 0);
}

// Corruption is the inverse of AI Core integrity, expressed as 0..1.
// Drives the glitch overlay opacity and body filter intensity.
export function selectCorruption(state: GameState): number {
  return Math.max(0, Math.min(1, (100 - state.ai.coreIntegrity) / 100));
}
