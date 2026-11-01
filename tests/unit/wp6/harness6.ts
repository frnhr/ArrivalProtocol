// WP6 headless harness: the WP5 harness (store, clock, orbit-sim, predictor, pace, input router, say,
// boot, flight events, director, mode keys, ops core, held-tool sync, licences, faults, the drop cache and
// the landing) plus HOLLOW (systems/hollow.ts), mounted after the landing exactly as main.ts does.
// One harness per test file (systems are module singletons); resetTo() between scenarios.
import { createHarness5, type Harness5 } from '../wp5/harness5';
import { mountHollow } from '@systems/hollow';
import { mountHollowDeal } from '@systems/hollow-deal';
// WP11: HOLLOW's verbs and LAST LIGHT's finale, mounted after THE DEAL as main.ts does (inert on a ship without verbs,
// and on every ship but the flagship).
import { mountHollowVerbs } from '@systems/hollow-verbs';
import { mountFinale } from '@systems/finale';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { isPodCode } from '../support/pod-code';
import type { Segment, DriverSegment } from '@/types/segment';
import { MEMORY_LAYOUTS } from '@data/memory';

export interface Harness6 extends Harness5 {
  // A cluster by code, or null once it has left memory (printed, or eaten: then it is hollow).
  maybeSoul: (code: string) => DriverSegment | null;
  checkMemory: () => void;
  hollowBlocks: () => Segment[];
}

export function createHarness6(seed = 1, opts: { soulsFound?: boolean } = {}): Harness6 {
  const base = createHarness5(seed, opts);
  mountHollow(base.store);
  // WP10: THE DEAL after HOLLOW, as main.ts mounts it (inert on a ship whose HOLLOW does not deal).
  mountHollowDeal(base.store);
  mountHollowVerbs(base.store);
  mountFinale(base.store);
  return {
    ...base,
    maybeSoul: (code) => base.souls().find((soul) => isPodCode(soul.pod, code)) ?? null,
    checkMemory: () => assertMemoryInvariants(base.store.getState().memory, MEMORY_LAYOUTS.FULL.totalBlocks),
    hollowBlocks: () => base.store.getState().memory.filter((seg) => seg.type === 'hollow'),
  };
}
