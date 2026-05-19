import type { FsToolKind } from '@/types/fs-tool';

export const TOOL_ICONS: Record<FsToolKind, string> = {
  scan: '◎',
  repair: '▸',
  move: '⇒',
  copy: '+',
  delete: '×',
  activate: '▶',
  deactivate: '⏸',
};

// Highest known revision per tool kind. Drives the version-demo slider's
// upper bound. A max of 1 = no upgrade path exists yet for that tool, so
// the slider is rendered disabled. Add to the map as new versions ship.
//
//   repair  v2 — compacts the Redundancy segment, freeing the wasted blocks
//                between `used` and `size` as free space.
export const TOOL_MAX_VERSION: Record<FsToolKind, number> = {
  scan: 1,
  repair: 2,
  move: 1,
  copy: 1,
  delete: 1,
  activate: 1,
  deactivate: 1,
};

interface ToolHint {
  stage1: string;
  stage2?: string;
}

export const TOOL_HINTS: Record<FsToolKind, ToolHint> = {
  scan:       { stage1: 'select unscanned ship system' },
  repair:     { stage1: 'select corrupt file' },
  delete:     { stage1: 'select file to delete' },
  move:       { stage1: 'select file to move',  stage2: 'select free destination' },
  copy:       { stage1: 'select file to copy',  stage2: 'select free destination' },
  activate:   { stage1: 'select inactive file' },
  deactivate: { stage1: 'select active file' },
};
