// WP6 headless harness: the WP5 harness (store, clock, orbit-sim, predictor, pace, input router, say,
// boot, flight events, director, mode keys, ops core, held-tool sync, licences, faults, the drop cache and
// the landing) plus HOLLOW (systems/hollow.ts), mounted after the landing exactly as main.ts does.
// One harness per test file (systems are module singletons); resetTo() between scenarios.
import { createHarness5, type Harness5 } from '../wp5/harness5';
import { mountHollow } from '@systems/hollow';
import { mountHollowDeal } from '@systems/hollow-deal';
// Slice 5: the residents, right after THE DEAL as main.ts mounts them (inert while no kind is built, and on every ship with
// no resident).
import { mountResidents } from '@systems/residents';
import { mountSurvey } from '@systems/survey';
// WP11: HOLLOW's verbs and LAST LIGHT's finale, mounted after THE DEAL as main.ts does (inert on a ship without verbs,
// and on every ship but the flagship).
import { mountHollowVerbs } from '@systems/hollow-verbs';
import { mountFinale } from '@systems/finale';
// Slice 7b: THE LAST LANDING's 'merge' resolver, after the finale as main.ts mounts it (inert until Track DROP builds it).
import { mountLastLanding } from '@systems/last-landing';
import { assertMemoryInvariants } from '@systems/memory-ops';
import { isPodCode } from '../support/pod-code';
import type { Segment, DriverSegment } from '@/types/segment';
import { layoutOf } from '@data/memory';

export interface Harness6 extends Harness5 {
  // A cluster by code, or null once it has left memory (printed, or eaten: then it is hollow).
  maybeSoul: (code: string) => DriverSegment | null;
  checkMemory: () => void;
  hollowBlocks: () => Segment[];
  // Slice 7b: takes THE LAST LANDING's 'merge' resolver out of the registry (a suite that registers its own 'merge' resolver
  // calls it first, and mountLastLanding(h.store) after, to put the game's back).
  unmountLastLanding: () => void;
}

export function createHarness6(seed = 1, opts: { soulsFound?: boolean } = {}): Harness6 {
  const base = createHarness5(seed, opts);
  mountHollow(base.store);
  // WP10: THE DEAL after HOLLOW, as main.ts mounts it (inert on a ship whose HOLLOW does not deal).
  mountHollowDeal(base.store);
  mountResidents(base.store);
  // Slice 6: SURVEY right after the residents, as main.ts mounts it.
  mountSurvey(base.store);
  mountHollowVerbs(base.store);
  mountFinale(base.store);
  const offLastLanding = mountLastLanding(base.store);
  return {
    ...base,
    unmountLastLanding: offLastLanding,
    maybeSoul: (code) => base.souls().find((soul) => isPodCode(soul.pod, code)) ?? null,
    checkMemory: () => assertMemoryInvariants(base.store.getState().memory, layoutOf(base.store.getState()).totalBlocks),
    hollowBlocks: () => base.store.getState().memory.filter((seg) => seg.type === 'hollow'),
  };
}
