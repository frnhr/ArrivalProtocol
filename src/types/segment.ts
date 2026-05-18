// Segment is the unit of the memory strip. A memory layout is an ordered list of segments.
// The discriminated union below is the canonical shape; legacy code may temporarily relax
// some fields via `// @ts-nocheck` during the migration.

import type { FsToolKind } from '@/types/fs-tool';

export type SegmentType =
  | 'core'
  | 'tool'
  | 'skill'
  | 'fs-tool'
  | 'ship'
  | 'ship-backup'
  | 'free'
  | 'encrypted'
  | 'redundancy';

export type SegmentState =
  | 'intact'
  | 'corrupt'
  | 'partial'
  | 'inactive'
  | 'locked'
  | 'busy'
  | 'offline'
  | 'transferring'
  | 'repairing';

interface SegmentBase {
  id: string;
  name: string;
  size: number;
  desc?: string;
  // Runtime-mutable: flagged true while an op is animating against this segment.
  operating?: boolean;
}

export interface CoreSegment extends SegmentBase {
  type: 'core';
  integrity: number;
  state?: SegmentState;
}

export interface ToolSegment extends SegmentBase {
  type: 'tool';
  integrity: number;
  state?: SegmentState;
}

export interface SkillSegment extends SegmentBase {
  type: 'skill';
  integrity: number;
  state?: SegmentState;
}

export interface FsToolSegment extends SegmentBase {
  type: 'fs-tool';
  integrity: number;
  fsTool: FsToolKind;
  state?: SegmentState;
}

export interface ShipSegment extends SegmentBase {
  type: 'ship';
  integrity: number;
  scanned: boolean;
  backup?: string;
  state?: SegmentState;
}

export interface ShipBackupSegment extends SegmentBase {
  type: 'ship-backup';
  integrity: number;
  scanned: boolean;
  state?: SegmentState;
}

export interface FreeSegment extends SegmentBase {
  type: 'free';
}

export interface EncryptedSegment extends SegmentBase {
  type: 'encrypted';
  state?: 'locked';
}

export interface RedundancySegment extends SegmentBase {
  type: 'redundancy';
  used: number;
  capacity: number;
}

export type Segment =
  | CoreSegment
  | ToolSegment
  | SkillSegment
  | FsToolSegment
  | ShipSegment
  | ShipBackupSegment
  | FreeSegment
  | EncryptedSegment
  | RedundancySegment;
