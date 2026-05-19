import type { FsToolKind } from '@/types/fs-tool';
import type { Segment, FsToolSegment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { TOOL_ICONS, TOOL_HINTS } from '@data/fs-tools';

// Effective version of the active tool kind: max version across all healthy
// copies. Mirrors getActiveToolVersion in fs-tools.ts (kept inline here to
// avoid a circular import: fs-tools already depends on CursorFollower's
// peers through actions).
function effectiveVersion(state: GameState, kind: FsToolKind): number {
  let max = 1;
  for (const m of state.memory) {
    if (m.type !== 'fs-tool' || m.fsTool !== kind || m.integrity <= 50) continue;
    if ((m as FsToolSegment).version > max) max = (m as FsToolSegment).version;
  }
  return max;
}

// Renders the cursor-follower body for a given active tool + picked source.
// Pure DOM patch; positioning is owned by the fs-tools system's mousemove.
export function renderCursorFollower(
  followerEl: HTMLElement,
  activeKind: FsToolKind | null,
  pickedSource: Segment | null,
  version: number = 1,
): void {
  if (!activeKind) {
    followerEl.classList.remove('active');
    return;
  }
  followerEl.classList.add('active');
  const icon = TOOL_ICONS[activeKind] || '▶';
  const hintCfg = TOOL_HINTS[activeKind];
  let hint = pickedSource ? (hintCfg?.stage2 || '') : (hintCfg?.stage1 || '');
  // Repair v2 extends Stage-1 targets to include the Redundancy pool. Other
  // tool/version pairs can override their hints here as they ship.
  if (!pickedSource && activeKind === 'repair' && version >= 2) {
    hint = 'select corrupt file or redundancy';
  }
  const verBadge = version > 1 ? ` <span class="ver">v${version}</span>` : '';
  let body = `<span class="icon">${icon}</span><span>${activeKind.toUpperCase()}</span>${verBadge}`;
  if (pickedSource) body += ` <span class="source">| ${pickedSource.name} ${pickedSource.size}B</span>`;
  body += `<span class="meta">${hint}</span>`;
  followerEl.innerHTML = body;
}

// Mounts the follower as a subscriber: visual content reflects (activeTool, pickedSourceId, version).
// Positioning still lives in the fs-tools system's mousemove handler.
export function mountCursorFollower(store: Store<GameState>): () => void {
  const el = document.getElementById('cursorFollower');
  if (!el) return () => {};

  function paint(state: GameState): void {
    const kind = state.ui.activeTool?.kind ?? null;
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;
    const ver = kind ? effectiveVersion(state, kind) : 1;
    renderCursorFollower(el!, kind, picked, ver);
  }

  paint(store.getState());
  // Always-false equals so version bumps on the picked-up tool repaint the
  // follower (the activeTool reference doesn't change when version changes).
  const unsub = store.subscribe((s) => s, (s) => paint(s), () => false);
  return unsub;
}
