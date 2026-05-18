import type { SegmentType } from '@/types/segment';

export const TYPE_LABELS: Record<SegmentType, string> = {
  core: 'AI · Core Process',
  tool: 'AI · Tool',
  skill: 'AI · Skills',
  'fs-tool': 'Filesystem Utility · in memory',
  ship: 'Ship System · Active',
  'ship-backup': 'Ship System · Backup',
  free: 'Unallocated',
  encrypted: 'Encrypted',
  redundancy: 'Quantum Redundancy Pool',
};
