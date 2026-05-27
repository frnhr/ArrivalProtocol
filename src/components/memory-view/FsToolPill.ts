import type { FsToolKind } from '@/types/fs-tool';
import type { Segment, FsToolSegment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { TOOL_ICONS, TOOL_HINTS } from '@data/fs-tools';
import { cancelTool } from '@systems/fs-tools';

// In-panel mirror of the cursor follower for touch-driven layouts (mobile).
// While a tool is active, this pill replaces the filesystem chips so the
// player can see what's in hand even though there's no cursor to track —
// and the explicit X button gives them a way to drop the tool with a tap.
// Op progress bars (the "snap above the file" animation) are unrelated and
// continue to work as before.

function effectiveVersion(state: GameState, kind: FsToolKind): number {
  let max = 1;
  for (const m of state.memory) {
    if (m.type !== 'fs-tool' || m.fsTool !== kind || m.integrity <= 50) continue;
    if ((m as FsToolSegment).version > max) max = (m as FsToolSegment).version;
  }
  return max;
}

function renderPill(
  el: HTMLElement,
  kind: FsToolKind | null,
  picked: Segment | null,
  version: number,
): void {
  if (!kind) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const icon = TOOL_ICONS[kind] || '▶';
  const hintCfg = TOOL_HINTS[kind];
  let hint = picked ? (hintCfg?.stage2 ?? '') : (hintCfg?.stage1 ?? '');
  if (!picked && kind === 'repair' && version >= 2) {
    hint = 'select corrupt file or redundancy';
  }
  const verBadge = version > 1 ? `<span class="ver">v${version}</span>` : '';
  const sourceLine = picked
    ? `<span class="source">${picked.name} ${picked.size}B</span>`
    : '';

  el.innerHTML = `
    <div class="pill-body">
      <span class="icon">${icon}</span>
      <span class="label">${kind.toUpperCase()}</span>
      ${verBadge}
      ${sourceLine}
      <span class="meta">${hint}</span>
    </div>
    <button type="button" class="pill-cancel" aria-label="Cancel tool">×</button>
  `;
}

export function mountFsToolPill(store: Store<GameState>): () => void {
  const el = document.getElementById('fsToolPill');
  if (!el) return () => {};

  function paint(state: GameState): void {
    const kind = state.ui.activeTool?.kind ?? null;
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? state.memory.find((m) => m.id === pickedId) ?? null : null;
    const ver = kind ? effectiveVersion(state, kind) : 1;
    renderPill(el!, kind, picked, ver);
  }

  paint(store.getState());

  const onClick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('.pill-cancel')) return;
    e.stopPropagation();
    cancelTool(store);
  };
  el.addEventListener('click', onClick);

  const unsub = store.subscribe((s) => s, paint, () => false);
  return () => {
    el.removeEventListener('click', onClick);
    unsub();
  };
}
