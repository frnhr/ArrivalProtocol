import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { ArrivalDelivery } from '@/types/repo';
import { deliveryBootLines } from '@systems/map-boot';
import { renewRepairAtBoot } from '@systems/licences';
import { patchInstalls } from '@systems/repository';
import { emit } from '@systems/events';
import { freeSegment, mergeAdjacentFree, assertMemoryInvariants } from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { REPAIR_V2_VERSION } from '@data/tuning';

// The deliveries unpacked at a boot (02-map §3.9, §4 step 6; slice-3b-plan §2.3 step 5), the stateful half. systems/boot.ts
// calls receiveDeliveryAtBoot as it says each `'delivery'` line (its ordinal among them: systems/map-boot.ts
// deliveryBootLines groups the arrival's deliveries into at most DELIVERY_BOOT_LINES_MAX lines, the last one folded), and
// finishBoot says every planned line, so a skipped boot still installs a patch. Per delivery on the line: the 'delivery'
// event (the chime, the chip sliding in); for the REPAIR v2 patch, every Repair copy goes to v2, the patch's blocks are
// freed (mergeAdjacentFree, the invariants) and run.upgrades gains 'repair-v2' (the Skills window lists it).
// REPAIR's renewal comes first, at the first delivery line whatever it carries (licences.ts renewRepairAtBoot; the later
// 'charge' line's call is then a no-op): a renewed Repair is upgraded by a patch on the same boot, and the copies the
// deliveries brought never cancel the renewal (renewRepairAtBoot leaves them out). The arrival puts every patch first and
// the boot never folds one (map-boot.ts), so a patch always installs after the renewal and on a line of its own.
// A module of its own, not systems/repository.ts (the foundation's deviation 1): it needs licences.ts's renewal, which
// imports data/script.ts, and repository.ts must stay importable from script.ts's side of the graph. Track REPO owns it.

export function receiveDeliveryAtBoot(store: Store<GameState>, ordinal: number): void {
  const lines = deliveryBootLines(store.getState());
  const group = lines[ordinal];
  if (group === undefined) throw new Error(`receiveDeliveryAtBoot: no delivery line ${ordinal} at this boot (${lines.length} planned)`);
  if (ordinal === 0) renewRepairAtBoot(store);
  for (const delivery of group) {
    if (delivery.file === 'repair-v2') installRepairPatch(store, delivery);
    emit('delivery', { file: delivery.file });
  }
}

// The REPAIR v2 patch at its boot line: used up either way (its blocks go back to free space). A patch that crossed
// working (repository.ts patchInstalls: not hit below the usable band, as any file works while it is usable) turns every
// Repair copy into v2; a broken one installs nothing (the boot line then makes no claim, map-boot.ts). With no Repair copy
// to upgrade (REPAIR not licensed yet) it is spent for nothing and run.upgrades does not gain v2.
function installRepairPatch(store: Store<GameState>, delivery: Readonly<ArrivalDelivery>): void {
  const state = store.getState();
  const arrival = state.run.arrival;
  if (arrival === null) throw new Error('installRepairPatch: a patch with no arrival');
  for (const id of delivery.segIds) {
    const seg = state.memory.find((candidate) => candidate.id === id);
    if (seg === undefined || seg.type !== 'upgrade' || seg.upgrade !== 'repair-patch') throw new Error(`installRepairPatch: the patch ${id} is not in memory`);
  }
  const works = patchInstalls(arrival, delivery);
  store.update((draft) => {
    const memory = draft.memory;
    for (const id of delivery.segIds) {
      const index = memory.findIndex((seg) => seg.id === id);
      memory[index] = freeSegment(memory[index]!.size);
    }
    mergeAdjacentFree(memory);
    assertMemoryInvariants(memory, layoutOf(draft).totalBlocks);
    const repairs = memory.filter((seg) => seg.type === 'fs-tool' && seg.fsTool === 'repair');
    if (works && repairs.length > 0) {
      for (const seg of repairs) if (seg.type === 'fs-tool') seg.version = Math.max(seg.version, REPAIR_V2_VERSION);
      if (!draft.run.upgrades.includes('repair-v2')) draft.run.upgrades.push('repair-v2');
    }
    draft.ui.memoryRev++;
  });
}

// ?debug's `__ap.give('repair-v2')`: the patch's effect at once, as a working patch's boot line would install it (no file
// is left).
export function upgradeRepairsToV2(store: Store<GameState>): void {
  store.update((draft) => {
    for (const seg of draft.memory) {
      if (seg.type === 'fs-tool' && seg.fsTool === 'repair') seg.version = Math.max(seg.version, REPAIR_V2_VERSION);
    }
    if (!draft.run.upgrades.includes('repair-v2')) draft.run.upgrades.push('repair-v2');
    draft.ui.memoryRev++;
  });
}
