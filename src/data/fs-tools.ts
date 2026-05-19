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
