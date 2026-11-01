import type { MemoryClass, PodRackName } from '@/types/map';

// 01-landing §3.16's pod-rack rule (slice-3a-plan §2.7 step 2): a ship's pod racks from its pods, class, root slot and
// final role. B takes min(7, pods − (slot ? 2 : 0)); C takes k more pods and `P _2 S _1 P`, k as large as keeps C's
// trailing free ≥ maxRootFor; the rest goes to D (FULL only); then the 40-free and 24-tail checks; the lead is the GAP-1
// neighbour of the slot, else the last pod. It reproduces LAST LIGHT's `P×7 _8 / P P P P _2 S _1 P _21 / P P P P _32`.
// Pure. Track GEN owns this file after the foundation.

export interface PodLayout {
  podRacks: Partial<Record<PodRackName, string>>;
  lead: number;
}

// TODO(3a-GEN): the rule.
export function layoutPods(pods: number, cls: MemoryClass, hasSlot: boolean, isFinal: boolean): PodLayout {
  throw new Error(`TODO(3a-GEN): layoutPods (${pods} pods, ${cls}, slot ${hasSlot}, final ${isFinal})`);
}
