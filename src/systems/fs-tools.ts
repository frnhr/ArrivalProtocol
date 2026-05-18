import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { getRedundancy } from '@state/selectors';
import type { GameState } from '@state/schema';

export interface MoveRegion {
  startIdx: number;
  endIdx: number;
  segs: Segment[];
  totalSize: number;
}

// For move: source plus any contiguous free blocks on either side form the
// candidate placement region. This lets a file slide into adjacent free space,
// including overlapping its current footprint.
export function computeMoveRegion(memory: Segment[], source: Segment): MoveRegion | null {
  const srcIdx = memory.indexOf(source);
  if (srcIdx === -1) return null;
  let startIdx = srcIdx;
  while (startIdx > 0 && memory[startIdx - 1]?.type === 'free') startIdx--;
  let endIdx = srcIdx;
  while (endIdx < memory.length - 1 && memory[endIdx + 1]?.type === 'free') endIdx++;
  const segs = memory.slice(startIdx, endIdx + 1);
  const totalSize = segs.reduce((s, m) => s + m.size, 0);
  return { startIdx, endIdx, segs, totalSize };
}

export interface ValidTargetContext {
  state: GameState;
  activeKind: FsToolKind;
  pickedSource: Segment | null;
}

// Determines whether a given segment is a valid target for the currently active tool.
// Pure logic; reads only memory + active-tool snapshot, no DOM, no mutation.
export function isValidTarget(seg: Segment, ctx: ValidTargetContext): boolean {
  const { state, activeKind, pickedSource } = ctx;
  const memory = state.memory;
  if ((seg as { operating?: boolean }).operating) return false;
  const segState = 'state' in seg ? seg.state : undefined;

  if (activeKind === 'scan') {
    return seg.type === 'ship' && seg.scanned === false;
  }
  if (activeKind === 'repair') {
    const eligible = (segState === 'corrupt' || segState === 'partial') &&
      (seg.type === 'tool' || seg.type === 'skill' || seg.type === 'fs-tool' || seg.type === 'core');
    if (!eligible) return false;
    const integrity = 'integrity' in seg ? seg.integrity : 0;
    const redund = getRedundancy(state);
    const cost = Math.ceil(((100 - integrity) / 100) * seg.size * 2);
    return !!redund && redund.used >= cost;
  }
  if (activeKind === 'delete') {
    if (seg.type === 'core' || seg.type === 'free') return false;
    if (segState === 'offline' || segState === 'repairing' ||
        segState === 'transferring' || segState === 'busy') return false;
    return true;
  }
  if (activeKind === 'move' || activeKind === 'copy') {
    if (!pickedSource) {
      // Stage 1: pick source
      if (seg.type === 'free' || seg.type === 'encrypted') return false;
      if (seg.type === 'core') return false;
      if (segState === 'offline' || segState === 'repairing' ||
          segState === 'transferring' || segState === 'busy') return false;
      return true;
    }
    if (activeKind === 'move') {
      // Move accepts EITHER an in-region slide (source + adjacent free, allowing
      // partial overlap of the source's current footprint) OR any non-adjacent
      // free segment of sufficient size.
      const region = computeMoveRegion(memory, pickedSource);
      if (region && region.totalSize >= pickedSource.size && region.segs.includes(seg)) {
        return true;
      }
      return seg.type === 'free' && seg.size >= pickedSource.size && seg.id !== pickedSource.id;
    }
    // copy
    return seg.type === 'free' && seg.size >= pickedSource.size && seg.id !== pickedSource.id;
  }
  return false;
}
