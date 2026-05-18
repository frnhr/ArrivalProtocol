import type { FsToolKind } from '@/types/fs-tool';
import type { Segment } from '@/types/segment';
import { TOOL_ICONS, TOOL_HINTS } from '@data/fs-tools';

// Updates the cursor-follower visual to reflect current pickup state.
// Pure DOM patch; legacy still owns the mousemove listener that positions it.
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
