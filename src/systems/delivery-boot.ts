import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { deliveryBootLines } from '@systems/map-boot';

// The deliveries unpacked at a boot (02-map §3.9, §4 step 6; slice-3b-plan §2.3 step 5), the stateful half. systems/boot.ts
// calls receiveDeliveryAtBoot as it says each `'delivery'` line (its ordinal among them: systems/map-boot.ts
// deliveryBootLines groups the arrival's deliveries into at most DELIVERY_BOOT_LINES_MAX lines, the last one folded), and
// finishBoot says every planned line, so a skipped boot still installs a patch. Per delivery on the line: the 'delivery'
// event (the chime, the chip sliding in); for the REPAIR v2 patch, renewRepairAtBoot first (idempotent: the later 'charge'
// line's call is then a no-op), then every Repair copy goes to v2, the patch's blocks are freed (mergeAdjacentFree, the
// invariants) and run.upgrades gains 'repair-v2' (the Skills window lists it).
// A module of its own, not systems/repository.ts (the foundation's deviation 1): it needs licences.ts's renewal, which
// imports data/script.ts, and repository.ts must stay importable from script.ts's side of the graph. Track REPO owns it.

export function receiveDeliveryAtBoot(store: Store<GameState>, ordinal: number): void {
  const lines = deliveryBootLines(store.getState());
  if (lines[ordinal] === undefined) throw new Error(`receiveDeliveryAtBoot: no delivery line ${ordinal} at this boot (${lines.length} planned)`);
  throw new Error('TODO(3b-REPO): receiveDeliveryAtBoot');
}
