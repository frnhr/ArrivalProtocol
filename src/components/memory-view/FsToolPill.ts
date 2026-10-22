import type { FsToolKind } from '@/types/fs-tool';
import type { Segment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { effectiveToolVersion, getSegmentById } from '@state/selectors';
import { TOOL_ICONS } from '@data/fs-tools';
import { cancelTool, type ConfirmRequest } from '@systems/fs-tools';
import { heldToolHint } from '@systems/tool-targets';
import { onInlineConfirmChange, currentInlineConfirm, answerInlineConfirm } from '@components/hud/InlineConfirm';
import { CONFIRM_TEXT } from '@data/tool-text';
import { on } from '@systems/events';
import { TOOL_REFUSAL_FLASH_MS } from '@data/tuning';
import { requireById } from '@components/dom';

// In-panel mirror of the cursor follower for touch-driven layouts (mobile).
// While a tool is active, this pill replaces the filesystem chips so the
// player can see what's in hand even though there's no cursor to track —
// and the explicit X button gives them a way to drop the tool with a tap.
// While an inline confirm is open it mirrors the question with its own ✓/✗ (§7.1), since a
// phone has no cursor for the floating pill to sit next to.
// A refused tool tap says why here, as the cursor follower does on the desktop (WP3 deferral, WP12: on a phone a refusal
// only buzzed): `⊘ PAUSED`, `⊘ ALL THREADS BUSY …` for one read, with the tool in hand or not.

function renderPill(
  element: HTMLElement,
  kind: FsToolKind | null,
  picked: Segment | null,
  version: number,
  hint: string,
  question: ConfirmRequest | null,
): void {
  if (!kind) {
    element.hidden = true;
    element.innerHTML = '';
    return;
  }
  element.hidden = false;
  if (question) {
    element.innerHTML = `
      <div class="pill-body">
        <span class="label warn">${question.text.question}</span>
        <span class="meta">${question.text.detail}</span>
      </div>
      <button type="button" class="pill-answer yes" data-answer="yes" tabindex="-1">${question.answers?.yes ?? CONFIRM_TEXT.yes}</button>
      <button type="button" class="pill-answer no" data-answer="no" tabindex="-1">${question.answers?.no ?? CONFIRM_TEXT.no}</button>
    `;
    return;
  }
  const icon = TOOL_ICONS[kind] || '▶';
  const verBadge = version > 1 ? `<span class="ver">v${version}</span>` : '';
  const sourceLine = picked
    ? `<span class="source">${picked.name} ${picked.size}B</span>`
    : '';

  element.innerHTML = `
    <div class="pill-body">
      <span class="icon">${icon}</span>
      <span class="label">${kind.toUpperCase()}</span>
      ${verBadge}
      ${sourceLine}
      <span class="meta">${hint}</span>
    </div>
    <button type="button" class="pill-cancel" aria-label="Cancel tool" tabindex="-1">×</button>
  `;
}

export function mountFsToolPill(store: Store<GameState>): () => void {
  const element = requireById('fsToolPill');
  let refusalTimer: ReturnType<typeof setTimeout> | null = null;

  function paint(state: GameState): void {
    if (refusalTimer !== null) return;  // a refusal is on show; it repaints when it ends
    const kind = state.ui.activeTool?.kind ?? null;
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? getSegmentById(state, pickedId) ?? null : null;
    const ver = kind ? effectiveToolVersion(state, kind) : 1;
    const hint = kind ? heldToolHint(state, kind, picked) : '';
    renderPill(element, kind, picked, ver, hint, currentInlineConfirm());
  }

  paint(store.getState());

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const answer = target?.closest<HTMLElement>('[data-answer]')?.dataset.answer;
    if (answer) {
      event.stopPropagation();
      answerInlineConfirm(answer === 'yes');
      return;
    }
    if (!target?.closest('.pill-cancel')) return;
    event.stopPropagation();
    cancelTool(store);
  };
  element.addEventListener('click', onClick);

  const unsub = store.subscribe(
    (s) => [s.ui.activeTool, s.ui.pickedSourceId, s.ui.memoryRev] as const,
    () => paint(store.getState()),
    (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
  );
  const offConfirm = onInlineConfirmChange(() => paint(store.getState()));

  // Wall-clock timing, like the follower's: input feedback, which must also clear while paused.
  function flashRefusal(reason: string): void {
    const body = document.createElement('div');
    body.className = 'pill-body';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = '⊘';
    const label = document.createElement('span');
    label.className = 'label warn';
    label.textContent = reason;
    body.append(icon, label);
    element.replaceChildren(body);
    element.hidden = false;
    element.classList.add('refusal');
    if (refusalTimer !== null) clearTimeout(refusalTimer);
    refusalTimer = setTimeout(() => {
      refusalTimer = null;
      element.classList.remove('refusal');
      paint(store.getState());
    }, TOOL_REFUSAL_FLASH_MS);
  }
  const offRefused = on('refused', ({ reason, tool }) => { if (tool) flashRefusal(reason); });

  return () => {
    element.removeEventListener('click', onClick);
    unsub();
    offConfirm();
    offRefused();
    if (refusalTimer !== null) clearTimeout(refusalTimer);
    element.classList.remove('refusal');
  };
}
