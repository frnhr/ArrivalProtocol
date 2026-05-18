import type { Segment } from '@/types/segment';
import type { FilterKey, StatusKey } from './schema';

export const ALL_FILTER_KEYS: readonly FilterKey[] = ['ai', 'ship', 'filesystem', 'free'];

// Maps a segment to its sidebar category. The labels reflect the player's
// mental model, not the type-system split: AI = the consciousness + its
// abilities; Ship = vessel subsystems; Filesystem = managed storage entities
// (fs-tools, redundancy pool, locked archives); Free = unallocated.
export function categoryOf(seg: Segment): FilterKey {
  switch (seg.type) {
    case 'core':
    case 'tool':
    case 'skill':
      return 'ai';
    case 'ship':
    case 'ship-backup':
      return 'ship';
    case 'fs-tool':
    case 'encrypted':
    case 'redundancy':
      return 'filesystem';
    case 'free':
      return 'free';
  }
}

// Status spotlight matchers. A segment "has" backup status if it's a
// ship-backup OR a ship segment with a backup pointer (the actual backup
// segment is the interesting thing, but the player thinks "ships with
// backups").
export function matchesStatus(seg: Segment, key: StatusKey): boolean {
  const state = 'state' in seg ? seg.state : undefined;
  if (key === 'corrupt') return state === 'corrupt';
  if (key === 'partial') return state === 'partial';
  if (key === 'backup') return seg.type === 'ship-backup';
  return false;
}

// Live counts shown in the sidebar status section. Computed from memory.
export function countByStatus(memory: readonly Segment[]): Record<StatusKey, number> {
  const out: Record<StatusKey, number> = { corrupt: 0, partial: 0, backup: 0 };
  for (const seg of memory) {
    if (matchesStatus(seg, 'corrupt')) out.corrupt++;
    if (matchesStatus(seg, 'partial')) out.partial++;
    if (matchesStatus(seg, 'backup')) out.backup++;
  }
  return out;
}
