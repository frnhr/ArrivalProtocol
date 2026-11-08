// WP9 headless harness: the WP7 harness (every DOM-free system through the run) plus the hazard zones
// (systems/zones.ts, mounted after the orbit sim like main.ts does) and AUTOBURN (its machine and [B]).
// Adds KESTREL on its own (a fresh unit carried in, its arrival damage optional) and a KESTREL-aware defender
// that also REPAIRs a blind Sensor Interp and DELETEs seeds that can bite.
// One harness per test file (systems are module singletons).
import { createHarness7, type Harness7 } from '../wp7/harness7';
import { mountZones } from '@systems/zones';
import { mountAutoburn, registerAutoburnKeys } from '@systems/autoburn';
import { giveSkillFile } from '../support/skills';
import type { SkillFileSegment } from '@/types/segment';
import { threateningSeeds } from '@systems/hollow';
import { freshUnitRacks, arrivalDamage } from '@systems/carry';
import { resetWorld } from '@systems/reset';
import { createInitialState, fixtureWorldNow } from '@state/initial';
import { currentShip } from '@systems/map-run';
import type { GameState } from '@state/schema';
import { actionRepair, actionDelete } from '@state/actions';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { getByRole, hasIntegrity } from '@state/selectors';
import { capabilitiesNow } from '@systems/capabilities';
import { followDirector } from '../wp2/harness2';
import type { Segment } from '@/types/segment';
import { phase2Ship } from '../support/hollow-world';
import { giveWorkedKit } from '../support/arm-ship';
import { classicShip } from '@data/classic-five';

export const KESTREL = 2;

export interface KestrelOpts {
  // The ship's own arrival damage (Sensor Interp to 45%: PATH UNCERTAIN). Off: the fresh unit's 78% (≈).
  arrivalDamage?: boolean;
  // The worked route's tools by KESTREL (MOVE, DELETE: support/arm-ship WORKED_KIT; the arm only), as the classic schedule
  // licensed them there.
  kit?: boolean;
  // HOLLOW put to sleep for good (a flight suite measures the flight, not the fight).
  hollowAsleep?: boolean;
  // Sensor Interp healed to 100 (exact path) before the flight starts.
  sensorHealed?: boolean;
  // Phase 3 slice 2: KESTREL as phase 2 had it (its root between POD 09 and POD 10, HOLLOW's own seeds: the SEEDS stage,
  // support/hollow-world.ts phase2Ship). Off: the ship as it is now (beam seeds only, none from a fresh unit, no root).
  phase2Hollow?: boolean;
}

export interface Harness9 extends Harness7 {
  kestrel: (seed: number, opts?: KestrelOpts) => void;
  // One tick of the KESTREL defender (the WP7 defender, plus the blind sensor and the seeds).
  defend9: () => boolean;
  flyDefending9: (maxWall: number) => string[];
  // Records manual captures with these START BURN offsets and gives AUTOBURN.skl v1 now.
  giveSkill: (offsetsTac: number[]) => SkillFileSegment;
  zoneHits: () => { zoneId: string; hits: number; lost: string[] }[];
  segById: (id: string) => Segment | undefined;
}

export function createHarness9(seed = 1, opts: { soulsFound?: boolean } = {}): Harness9 {
  const base = createHarness7(seed, opts);
  mountZones(base.store);
  mountAutoburn(base.store);
  registerAutoburnKeys(base.store);
  const state = () => base.store.getState();

  const defend9 = (): boolean => {
    let acted = base.defend();
    const now = state();
    if (now.clock.paused || !now.run.licences.includes('repair')) return acted;
    const sensor = getByRole(now, 'sensor');
    const plot = capabilitiesNow(now).plot.mode;
    if (sensor && hasIntegrity(sensor) && (plot === 'uncertain') && getOpsBySeg(sensor.id).length === 0 && canStartOp()) {
      if (actionRepair(base.store, sensor) === null) acted = true;
    }
    if (now.run.licences.includes('delete')) {
      for (const seedSeg of threateningSeeds(now.memory, now.clock.aiSec)) {
        if (getOpsBySeg(seedSeg.id).length > 0 || !canStartOp()) continue;
        if (actionDelete(base.store, seedSeg) === null) acted = true;
      }
    }
    return acted;
  };

  const harness: Harness9 = {
    ...base,
    kestrel(nextSeed, kestrelOpts = {}) {
      base.resetTo('flight', nextSeed);
      // Track RETIRE: on the fixture world's arm (state/initial.ts), the fresh unit is laid out for the hop into run 1's
      // KESTREL, and the ship's own arrival damage then lands on the unit's files in memory (the classic five: on the racks).
      let fresh: GameState;
      if (fixtureWorldNow() === 'classic') {
        const ship = classicShip(KESTREL);
        const carried = freshUnitRacks(ship);
        if (kestrelOpts.arrivalDamage) arrivalDamage(carried.segs, ship.arrivalDamage);
        fresh = createInitialState({ seed: nextSeed, shipIndex: KESTREL, carried });
      } else {
        fresh = createInitialState({ seed: nextSeed, shipIndex: KESTREL, carried: 'fresh' });
        if (kestrelOpts.arrivalDamage) arrivalDamage(fresh.memory, currentShip(fresh).arrivalDamage);
      }
      if (kestrelOpts.sensorHealed) {
        const sensor = fresh.memory.find((seg) => seg.role === 'sensor');
        if (!sensor || !hasIntegrity(sensor)) throw new Error('harness9: no sensor');
        sensor.integrity = 100;
        sensor.state = 'intact';
      }
      base.store.update((d) => { Object.assign(d, fresh); });
      resetWorld();
      if (kestrelOpts.kit) giveWorkedKit(base.store);
      if (kestrelOpts.phase2Hollow) phase2Ship(base.store, KESTREL);
      if (kestrelOpts.hollowAsleep) base.store.update((d) => { d.hollow.phase = 'dormant'; });
      base.events.length = 0;
    },
    defend9,
    flyDefending9(maxWall) {
      return followDirector(base, { reactionSec: 0.4, maxWall, mistake: () => { defend9(); return false; } });
    },
    // Slice 4: the captures recorded as demos, and AUTOBURN v1 given (phase 2 installed it at the boot after two captures;
    // the tree sells it now, and the classic world has none: tests/unit/support/skills.ts).
    giveSkill(offsetsTac) {
      base.store.update((d) => { d.run.stats.demos.push(...offsetsTac.map((offsetTac) => ({ offsetTac }))); });
      return giveSkillFile(base.store, 'autoburn', 1);
    },
    zoneHits() {
      return base.events.filter((event) => event.name === 'zone-hit').map((event) => {
        const payload = event.payload as { zoneId: string; hits: unknown[]; lostClusters: string[] };
        return { zoneId: payload.zoneId, hits: payload.hits.length, lost: payload.lostClusters };
      });
    },
    segById: (id) => state().memory.find((candidate) => candidate.id === id),
  };
  return harness;
}
