// WP7 headless harness: the WP6 harness (store, clock, orbit-sim, predictor, pace, input router, say,
// boot, flight events, director, mode keys, ops core, held-tool sync, licences, faults, the drop cache, the
// landing, HOLLOW) plus the run (systems/run.ts), mounted after HOLLOW as main.ts does. Adds the run's
// own moves (a NEW RUN, a ship of the fleet on its own with a fresh unit carried in) and a defender kid
// who fights HOLLOW the way the strip teaches: REPAIR what is bitten, MOVE the clusters it can reach
// behind a WALL. One harness per test file (systems are module singletons).
import { createHarness6, type Harness6 } from '../wp6/harness6';
import { followDirector } from '../wp2/harness2';
import { mountRun, startRun, transmitNext } from '@systems/run';
import { FIRST_RUN_LINEAGE } from '@systems/meta';
import { pickCard } from '@systems/draft';
import { hollowReach } from '@systems/hollow';
import { resetWorld } from '@systems/reset';
import { actionRepair, actionMove } from '@state/actions';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { isBusy } from '@systems/tool-targets';
import { createInitialState } from '@state/initial';
import { giveWorkedKit, fixtureBoardedVerdict } from '../support/arm-ship';
import { driversInMemory, isInfected } from '@state/selectors';
import { DRIVER_RULES } from '@data/script';
import { WALL_MIN_BLOCKS } from '@data/tuning';
import type { DriverSegment, FreeSegment } from '@/types/segment';

export interface Harness7 extends Harness6 {
  // A NEW RUN on ship 1's title card (the page's own first state).
  newRun: (seed: number) => void;
  // Ship `index` alone, in flight, with a fresh unit carried in (no transit hits; carry.ts freshUnitRacks):
  // for suites that fly a later ship by itself.
  // `kit` (Track RETIRE, the arm only): the tools the worked route has delivered by that ship (support/arm-ship.ts), as the
  // classic five's schedule licensed them on a ship alone.
  // `boarded` (the arm only): HOLLOW forced aboard (support/arm-ship fixtureBoardedVerdict), as the classic VESPER had it.
  shipAlone: (index: number, seed: number, opts?: { kit?: boolean; boarded?: boolean }) => void;
  // One tick of the defender (see the header); true when it started something.
  defend: (reactSec?: number) => boolean;
  // Flies the ship by the strip with the defender on, until it is no longer approaching.
  flyDefending: (maxWall: number) => string[];
  // Steps (defending) until the phase is `phase` or maxWall passes.
  untilPhase: (phase: string, maxWall: number) => boolean;
  // TRANSMIT ▸ without the screen's send (WP7 part 2's TransmitScreen calls the same transmitNext at full white).
  transmit: () => void;
}

export function createHarness7(seed = 1, opts: { soulsFound?: boolean } = {}): Harness7 {
  const base = createHarness6(seed, opts);
  mountRun(base.store);
  const infectedSince = new Map<string, number>();

  const defend = (reactSec = 1): boolean => {
    const state = base.store.getState();
    const now = state.clock.aiSec;
    let acted = false;
    if (!state.run.licences.includes('repair') || state.clock.paused) return false;
    for (const soul of driversInMemory(state)) {
      if (!isInfected(soul)) { infectedSince.delete(soul.id); continue; }
      if (!infectedSince.has(soul.id)) infectedSince.set(soul.id, now);
      if (now - infectedSince.get(soul.id)! < reactSec || getOpsBySeg(soul.id).length > 0 || !canStartOp()) continue;
      if (actionRepair(base.store, soul) === null) acted = true;
    }
    // The kid meets HOLLOW at its wake (as WP6's ship-2 defender): a GAP label it never had a reason to
    // read is no warning, so it walls only once HOLLOW is awake and biting.
    if (!state.run.licences.includes('move') || state.hollow.phase !== 'awake') return acted;
    // Clean clusters within a GAP of HOLLOW go to the far end of the biggest free space (rack D).
    for (const reach of hollowReach(state.memory, now)) {
      if (reach.gapBlocks >= WALL_MIN_BLOCKS || reach.neighbourId === null) continue;
      const soul = state.memory.find((seg): seg is DriverSegment => seg.type === 'driver' && seg.id === reach.neighbourId);
      if (!soul || isInfected(soul) || isBusy(soul) || !canStartOp()) continue;
      const biggest = state.memory.filter((seg): seg is FreeSegment => seg.type === 'free' && seg.reservedBy === undefined)
        .sort((a, b) => b.size - a.size)[0];
      if (!biggest || biggest.size < soul.size) continue;
      if (actionMove(base.store, soul, { regionSegIds: [biggest.id], col: biggest.size - soul.size }) === null) acted = true;
    }
    return acted;
  };

  const harness: Harness7 = {
    ...base,
    newRun(nextSeed) {
      base.resetTo('flight', nextSeed);
      // WP8: a NEW RUN names its lineage; the harness has no archive, so every run here is a first run.
      startRun(base.store, nextSeed, FIRST_RUN_LINEAGE);
      infectedSince.clear();
    },
    shipAlone(index, nextSeed, aloneOpts = {}) {
      base.resetTo('flight', nextSeed);
      const threat = aloneOpts.boarded ? fixtureBoardedVerdict(index, nextSeed) : undefined;
      const state = createInitialState({ seed: nextSeed, shipIndex: index, carried: 'fresh', ...(threat ? { threat } : {}) });
      // A later ship is reached through ship 1, where the driver lessons were met (as harnessState marks them for found
      // colonists): slice 2's rolled arrival damage gives later ships failing drivers too, and a ship alone must not
      // replay run 1's POD 02 lesson there.
      if (opts.soulsFound !== false) state.director.done.push(...DRIVER_RULES.map((rule) => rule.id));
      base.store.update((d) => { Object.assign(d, state); });
      resetWorld();
      if (aloneOpts.kit) giveWorkedKit(base.store);
      infectedSince.clear();
    },
    defend,
    flyDefending(maxWall) {
      return followDirector(base, { reactionSec: 0.4, maxWall, mistake: () => { defend(); return false; } });
    },
    untilPhase(phase, maxWall) {
      const end = base.wall() + maxWall;
      while (base.store.getState().run.phase !== phase && base.wall() < end) { defend(); base.step(); }
      return base.store.getState().run.phase === phase;
    },
    transmit() {
      // WP8: PICK ONE TO CARRY is mandatory. A suite that has not picked takes the first card dealt, as the
      // TRANSMIT screen's interim send does (WP8 part 1).
      const plan = base.store.getState().run.transit;
      if (plan && plan.pick === null && plan.offer.length > 0) {
        const refusal = pickCard(base.store, plan.offer[0]!.id);
        if (refusal !== null) throw new Error(`harness7.transmit: could not pick the first card (${refusal})`);
      }
      transmitNext(base.store);
    },
  };
  return harness;
}
