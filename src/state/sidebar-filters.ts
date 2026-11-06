import type { Segment } from '@/types/segment';
import type { FilterKey, StatusKey } from './schema';
import { healthKnown } from './selectors';

export const ALL_FILTER_KEYS: readonly FilterKey[] = ['ai', 'ship', 'pods', 'filesystem', 'free'];

// Maps a segment to its sidebar category. The labels reflect the player's
// mental model, not the type-system split: AI = the consciousness + its
// abilities (upgrade files included: they are what the unit carries); Ship = vessel subsystems;
// Pods = the pods' drivers (the colonists' filter); Filesystem = managed storage entities (fs-tools,
// redundancy pool, FIREWALLs, HOLLOW's locked blocks, 046.log); Free = unallocated. Exhaustive: a new segment
// type must pick its category here.
export function categoryOf(seg: Segment): FilterKey {
  switch (seg.type) {
    case 'core':
    case 'tool':
    case 'upgrade':
      return 'ai';
    case 'ship':
    case 'ship-backup':
      return 'ship';
    case 'fs-tool':
    case 'hollow':
    case 'redundancy':
    case 'firewall':
    case 'log':
      return 'filesystem';
    case 'free':
      return 'free';
    case 'driver':
      return 'pods';
  }
}

// Status spotlight matchers. A segment "has" backup status if it's a
// ship-backup OR a ship segment with a backup pointer (the actual backup
// segment is the interesting thing, but the player thinks "ships with
// backups").
export function matchesStatus(seg: Segment, key: StatusKey): boolean {
  if (key === 'backup') return seg.type === 'ship-backup';
  // Damage the kid can't see yet (an unscanned ship file) is not counted.
  if (!healthKnown(seg)) return false;
  const state = 'state' in seg ? seg.state : undefined;
  if (key === 'corrupt') return state === 'corrupt';
  if (key === 'partial') return state === 'partial';
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
