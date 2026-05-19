import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Map each fs-tool kind to its primary chip element id.
const KIND_TO_CHIP_ID: Record<FsToolKind, string> = {
  scan: 'chip-scan',
  repair: 'chip-repair',
  move: 'chip-move',
  copy: 'chip-copy',
  delete: 'chip-delete',
  activate: 'chip-activate',
  deactivate: 'chip-deactivate',
};

// Patches the chip strip's state classes in place. No remount.
export function updateFsChips(memory: readonly Segment[]): void {
  (Object.entries(KIND_TO_CHIP_ID) as Array<[FsToolKind, string]>).forEach(([kind, chipId]) => {
    const tool = memory.find(
      (m): m is Segment & { type: 'fs-tool' } => m.type === 'fs-tool' && m.fsTool === kind,
    );
    const chip = document.getElementById(chipId);
    if (!chip || !tool) return;
    const dot = chip.querySelector('.dot');
    chip.classList.remove('bad');
    dot?.classList.remove('busy', 'bad');
    const integrity = tool.integrity;
    const state = tool.state;
    if (integrity < 50 || state === 'corrupt') {
      chip.classList.add('bad');
      dot?.classList.add('bad');
    } else if (state === 'busy') {
      dot?.classList.add('busy');
    }
  });

  // Repair.bak is a special case — second physical chip backed by t_repair_b segment.
  const bak = memory.find((m) => m.id === 't_repair_b');
  const bakChip = document.getElementById('chip-repair-b');
  if (bak && 'integrity' in bak && bakChip) {
    bakChip.classList.toggle('bad', bak.integrity < 50);
  }
}

// Mount as store subscriber. Always-false comparator since chip state depends
// on per-segment integrity/state mutations that don't change the array reference.
export function mountFsStatusBar(store: Store<GameState>): () => void {
  updateFsChips(store.getState().memory);
  return store.subscribe((s) => s.memory, (mem) => updateFsChips(mem), () => false);
}
