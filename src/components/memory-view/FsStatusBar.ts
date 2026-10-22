import type { Segment, FsToolSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { isUsableTool } from '@state/selectors';
import { requireById, replayAnimation } from '@components/dom';
import { FS_TOOL_KINDS, toolChipId } from '@data/fs-tools';

// The filesystem chip row (§3.2, TASK 700): one chip per tool kind, shown only while a copy of
// that tool's file is in memory. A licence installing the files slides its chip in; the last
// copy deleted (or eaten, WP6) takes it away; the new files glow once where they landed. Chips are found by tool kind, never by a file id:
// each draws one health dot per copy (Repair and Repair.bak: two), bad when that copy is too
// damaged to use, and the whole chip turns bad when no copy works (the same line pickUpTool
// uses, so a chip never looks healthy while the tool can't be picked up). A "vN" badge marks
// an upgraded copy, so the kid sees a tool upgrade is armed before clicking the chip.

function chipOf(kind: FsToolKind): HTMLElement {
  return requireById(toolChipId(kind));
}

function paintDots(chip: HTMLElement, copies: readonly FsToolSegment[]): void {
  const dots = chip.querySelector<HTMLElement>('.dots');
  if (!dots) throw new Error(`#${chip.id} has no .dots in index.html`);
  while (dots.children.length < copies.length) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dots.appendChild(dot);
  }
  while (dots.children.length > copies.length) dots.lastElementChild!.remove();
  copies.forEach((copy, i) => {
    const dot = dots.children[i] as HTMLElement;
    dot.classList.toggle('bad', !isUsableTool(copy));
    dot.title = copy.name;
  });
}

function paintVersion(chip: HTMLElement, usable: readonly FsToolSegment[]): void {
  const bestVer = usable.reduce((best, copy) => Math.max(best, copy.version), 1);
  let badge = chip.querySelector<HTMLElement>('.ver');
  if (bestVer > 1) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ver';
      chip.appendChild(badge);
    }
    badge.textContent = `v${bestVer}`;
  } else if (badge) {
    badge.remove();
  }
}

// Patches the chips in place. `animate` slides a newly shown chip in (a licence arriving); the
// first paint shows the starting tools without ceremony.
function updateFsChips(memory: readonly Segment[], animate = false): void {
  for (const kind of FS_TOOL_KINDS) {
    const chip = chipOf(kind);
    const copies = memory.filter((seg): seg is FsToolSegment => seg.type === 'fs-tool' && seg.fsTool === kind);
    const wasHidden = chip.hidden;
    chip.hidden = copies.length === 0;
    if (chip.hidden) continue;
    if (animate && wasHidden) {
      replayAnimation(chip, 'arriving');
      // The files that just transmitted in glow once on the strip, so the kid sees where they
      // landed (this runs after MemoryStrip's rebuild: it mounts later).
      for (const copy of copies) {
        document.querySelectorAll(`.seg[data-id="${copy.id}"]`).forEach((part) => replayAnimation(part, 'transmit-in'));
      }
    }
    const usable = copies.filter(isUsableTool);
    chip.classList.toggle('bad', usable.length === 0);
    paintDots(chip, copies);
    paintVersion(chip, usable);
  }
}

// Chip state follows the tool files, which only change with a memoryRev bump (a repair's climbing
// integrity is patched live and lands with the op's final bump; a licence install bumps it too).
export function mountFsStatusBar(store: Store<GameState>): () => void {
  updateFsChips(store.getState().memory);
  const onArrived = (event: AnimationEvent): void => (event.currentTarget as HTMLElement).classList.remove('arriving');
  const chips = FS_TOOL_KINDS.map(chipOf);
  chips.forEach((chip) => chip.addEventListener('animationend', onArrived));
  const unsub = store.subscribe((s) => s.ui.memoryRev, () => updateFsChips(store.getState().memory, true));
  return () => {
    unsub();
    chips.forEach((chip) => chip.removeEventListener('animationend', onArrived));
  };
}
