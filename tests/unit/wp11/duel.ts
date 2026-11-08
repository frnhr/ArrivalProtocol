// LAST LIGHT flown to ORBIT LOCK by the strip-following kid with the defender (the root open, the duel on), the setup
// wp11/merge-test and wp11/fix1 stage their duel scenarios on. Flown once for both suites (flows.ts flyOnce, shared: the
// slice 3b review's unit tier budget; each suite used to fly it for every scenario, on a seed of its own), then HOLLOW
// held still (no bite, seed or verb on its own) so each scenario's eating is the scenario's.
import type { Harness11 } from './harness11';
import { flyOnce } from '../wp1-rules/flows';
import { fixtureWorldNow } from '@state/initial';

// The seed the duel is flown on (merge-test's first scenario's).
export const DUEL_SEED = 41;

export function toTheDuel(h: Harness11): void {
  // One flight per fixture world: the shared cache must never hand a classic suite the arm's duel, or the other way.
  flyOnce(h, fixtureWorldNow() === 'arm' ? 'last-light-duel-arm' : 'last-light-duel', () => {
    // On the arm with the worked route's tools by LAST LIGHT (support/arm-ship), as the classic five's schedule gave them.
    h.lastLight(DUEL_SEED, { kit: fixtureWorldNow() === 'arm' });
    // The scenarios delete the root themselves: the defender only flies and fights until the lock.
    h.flyLastLight(900, { deleteRoot: false });
    if (h.status() !== 'locked') throw new Error(`toTheDuel: LAST LIGHT on seed ${DUEL_SEED} did not lock (${h.status()})`);
    h.step();
  }, { shared: true });
  h.store.update((d) => {
    d.hollow.biteInSec = 9999;
    d.hollow.seedInSec = 9999;
    d.hollow.verbInSec = 9999;
    d.hollow.verb = null;
  });
}
