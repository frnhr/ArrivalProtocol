import type { FsToolKind } from '@/types/fs-tool';
import type { Segment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { TOOL_ICONS, TOOL_HINTS } from '@data/fs-tools';

// Renders the cursor-follower body for a given active tool + picked source.
// Pure DOM patch; positioning is owned by the fs-tools system's mousemove.
export function renderCursorFollower(
  followerEl: HTMLElement,
  activeKind: FsToolKind | null,
  pickedSource: Segment | null,
): void {
  if (!activeKind) {
    followerEl.classList.remove('active');
    return;
  }
  followerEl.classList.add('active');
  const icon = TOOL_ICONS[activeKind] || '▶';
  const hintCfg = TOOL_HINTS[activeKind];
  const hint = pickedSource ? (hintCfg?.stage2 || '') : (hintCfg?.stage1 || '');
  let body = `<span class="icon">${icon}</span><span>${activeKind.toUpperCase()}</span>`;
  if (pickedSource) body += ` <span class="source">| ${pickedSource.name} ${pickedSource.size}B</span>`;
  body += `<span class="meta">${hint}</span>`;
  followerEl.innerHTML = body;
}

// Mounts the follower as a subscriber: visual content reflects (activeTool, pickedSourceId).
// Positioning still lives in the fs-tools system's mousemove handler.
export function mountCursorFollower(store: Store<GameState>): () => void {
  const el = document.getElementById('cursorFollower');
  if (!el) return () => {};

  function paint(state: GameState): void {
    const kind = state.ui.activeTool?.kind ?? null;
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;
    renderCursorFollower(el!, kind, picked);
  }

  paint(store.getState());
  // activeTool object reference is rewritten by pickUp/cancel via store.update;
  // pickedSourceId is a primitive. Object.is comparison fires the listener only
  // on actual pickup/source-change events — not on every notify.
  const unsubA = store.subscribe(
    (s) => s.ui.activeTool,
    () => paint(store.getState()),
  );
  const unsubB = store.subscribe(
    (s) => s.ui.pickedSourceId,
    () => paint(store.getState()),
  );
  return () => { unsubA(); unsubB(); };
}
