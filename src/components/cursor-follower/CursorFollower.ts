import type { FsToolKind } from '@/types/fs-tool';
import type { Segment } from '@/types/segment';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { effectiveToolVersion, getSegmentById } from '@state/selectors';
import { on } from '@systems/events';
import { onOpsChange, threadsBusy, threadsTotal, getOps } from '@systems/ops-core';
import { getCursorXY } from '@systems/fs-tools';
import { heldToolHint } from '@systems/tool-targets';
import { TOOL_ICONS } from '@data/fs-tools';
import { TOOL_REFUSAL } from '@data/tool-text';
import { TOOL_REFUSAL_FLASH_MS, CAP_FULL_FLASH_MS } from '@data/tuning';
import { requireById } from '@components/dom';

// The chip that follows the cursor while a tool is in hand: the tool, its version, the picked
// source and what to click next. When every Core thread is busy it says so before the click.
// A refused tool click explains itself here (§6.1 "refused with the follower text PAUSED"):
// the reason flashes next to the cursor, in hand or not, and a thread refusal also flashes the
// Core's thread dots (body.cap-full).
// It sits below-right of the cursor and flips to the other side of it near a screen edge, so a
// refusal next to INSPECT's buttons (or the rightmost files) is never cut off. While an op runs
// with a tool still in hand it sits above-right instead: the kid has just clicked a file, and its
// live readout (`↻ 62%`, the meta row at the file's bottom edge) is what to watch, not cover.
// The same rule as the edge flip keeps it on screen near the top.

// How far from the cursor the follower sits, and the margin it keeps from the screen edges (px).
const CURSOR_OFFSET_PX = 7;
const EDGE_MARGIN_PX = 8;

// Renders the cursor-follower body for a given active tool + picked source. Pure DOM patch.
function renderCursorFollower(
  followerEl: HTMLElement,
  activeKind: FsToolKind | null,
  pickedSource: Segment | null,
  version: number,
  // Every thread busy: what to do about it (null: a thread is free, the hint shows).
  threadsNote: string | null,
  hint: string,
): void {
  if (!activeKind) {
    followerEl.classList.remove('active');
    return;
  }
  followerEl.classList.add('active');
  const icon = TOOL_ICONS[activeKind] || '▶';
  const verBadge = version > 1 ? ` <span class="ver">v${version}</span>` : '';
  let body = `<span class="icon">${icon}</span><span>${activeKind.toUpperCase()}</span>${verBadge}`;
  if (pickedSource) body += ` <span class="source">| ${pickedSource.name} ${pickedSource.size}B</span>`;
  body += threadsNote !== null
    ? `<span class="meta warn">${threadsNote}</span>`
    : `<span class="meta">${hint}</span>`;
  followerEl.innerHTML = body;
}

export function mountCursorFollower(store: Store<GameState>): () => void {
  const element = requireById('cursorFollower');
  let refusalTimer: ReturnType<typeof setTimeout> | null = null;
  let capTimer: ReturnType<typeof setTimeout> | null = null;
  // Measured after each repaint (the content changes rarely), so a mousemove reads no layout.
  let width = 0;
  let height = 0;
  // Above the cursor while an op runs with the tool in hand (see the header). Updated on op
  // start/end and on pickup/drop, so a mousemove reads a flag, not the ops.
  let above = false;

  function place(x: number, y: number): void {
    const flipX = x + CURSOR_OFFSET_PX + width > window.innerWidth - EDGE_MARGIN_PX;
    const fitsBelow = y + CURSOR_OFFSET_PX + height <= window.innerHeight - EDGE_MARGIN_PX;
    const fitsAbove = y - CURSOR_OFFSET_PX - height >= EDGE_MARGIN_PX;
    const goAbove = above ? fitsAbove || !fitsBelow : !fitsBelow;
    const left = flipX ? Math.max(EDGE_MARGIN_PX, x - CURSOR_OFFSET_PX - width) : x + CURSOR_OFFSET_PX;
    const top = goAbove ? Math.max(EDGE_MARGIN_PX, y - CURSOR_OFFSET_PX - height) : y + CURSOR_OFFSET_PX;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  function measureAndPlace(): void {
    width = element.offsetWidth;
    height = element.offsetHeight;
    const { x, y } = getCursorXY();
    place(x, y);
  }

  function paint(): void {
    const state = store.getState();
    const kind = state.ui.activeTool?.kind ?? null;
    above = kind !== null && getOps().length > 0;
    if (refusalTimer !== null) return;  // a refusal is on show; it repaints when it ends
    const pickedId = state.ui.pickedSourceId;
    const picked = pickedId ? getSegmentById(state, pickedId) ?? null : null;
    const version = kind ? effectiveToolVersion(state, kind) : 1;
    const hint = kind ? heldToolHint(state, kind, picked) : '';
    // While one of HOLLOW's verbs counts down, waiting for a thread lets it land: the note says how to free one (WP11).
    const full = kind !== null && threadsBusy() >= threadsTotal();
    const threadsNote = full ? (state.hollow.verb !== null ? TOOL_REFUSAL.threadsVerb : TOOL_REFUSAL.threads) : null;
    renderCursorFollower(element, kind, picked, version, threadsNote, hint);
    if (kind) measureAndPlace();
  }

  // The reason, next to the cursor, for one read. Wall-clock timing: input feedback, which must
  // also clear while paused (PAUSED is the most common one).
  function flashRefusal(reason: string): void {
    element.innerHTML = `<span class="icon">⊘</span><span>${reason}</span>`;
    element.classList.add('active', 'refusal');
    measureAndPlace();
    if (refusalTimer !== null) clearTimeout(refusalTimer);
    refusalTimer = setTimeout(() => {
      refusalTimer = null;
      element.classList.remove('refusal');
      paint();
    }, TOOL_REFUSAL_FLASH_MS);
    if (reason === TOOL_REFUSAL.threads || reason === TOOL_REFUSAL.threadsVerb) {
      document.body.classList.add('cap-full');
      if (capTimer !== null) clearTimeout(capTimer);
      capTimer = setTimeout(() => { document.body.classList.remove('cap-full'); capTimer = null; }, CAP_FULL_FLASH_MS);
    }
  }

  const onMouseMove = (event: MouseEvent): void => place(event.clientX, event.clientY);
  document.addEventListener('mousemove', onMouseMove);

  paint();
  const unsub = store.subscribe(
    (s) => [s.ui.activeTool, s.ui.pickedSourceId, s.ui.memoryRev] as const,
    paint,
    (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
  );
  // A verb's countdown starting or ending changes what a full set of threads asks for.
  const offVerb = store.subscribe((s) => s.hollow.verb !== null, paint);
  // A thread freed (or taken) while the tool is held updates the hint at once.
  const offOps = onOpsChange((change) => { if (change.type !== 'progress') paint(); });
  const offRefused = on('refused', ({ reason, tool }) => { if (tool) flashRefusal(reason); });
  return () => {
    document.removeEventListener('mousemove', onMouseMove);
    unsub();
    offVerb();
    offOps();
    offRefused();
    if (refusalTimer !== null) clearTimeout(refusalTimer);
    if (capTimer !== null) clearTimeout(capTimer);
  };
}
