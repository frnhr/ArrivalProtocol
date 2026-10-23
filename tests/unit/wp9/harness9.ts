// WP9 headless harness: the WP7 harness (every DOM-free system through the run) plus the hazard zones
// (systems/zones.ts, mounted after the orbit sim like main.ts does) and AUTOBURN (its machine and [B]).
// Adds KESTREL on its own (a fresh unit carried in, its arrival damage optional) and a KESTREL-aware defender
// that also REPAIRs a blind Sensor Interp and DELETEs seeds that can bite.
// One harness per test file (systems are module singletons).
import { createHarness7, type Harness7 } from '../wp7/harness7';
import { mountZones } from '@systems/zones';
import { mountAutoburn, registerAutoburnKeys, trainSkillAtBoot, skillBootDue } from '@systems/autoburn';
import { threateningSeeds } from '@systems/hollow';
import { freshUnitRacks, arrivalDamage } from '@systems/carry';
import { resetWorld } from '@systems/reset';
import { createInitialState } from '@state/initial';
import { actionRepair, actionDelete } from '@state/actions';
import { canStartOp, getOpsBySeg } from '@systems/ops-core';
import { getByRole, hasIntegrity } from '@state/selectors';
import { capabilitiesNow } from '@systems/capabilities';
import { followDirector } from '../wp2/harness2';
import { getShip } from '@data/ships';
import type { Segment } from '@/types/segment';

export const KESTREL = 2;

export interface KestrelOpts {
  // The ship's own arrival damage (Sensor Interp to 45%: PATH UNCERTAIN). Off: the fresh unit's 78% (≈).
  arrivalDamage?: boolean;
  // HOLLOW put to sleep for good (a flight suite measures the flight, not the fight).
  hollowAsleep?: boolean;
  // Sensor Interp healed to 100 (exact path) before the flight starts.
  sensorHealed?: boolean;
}

export interface Harness9 extends Harness7 {
  kestrel: (seed: number, opts?: KestrelOpts) => void;
  // One tick of the KESTREL defender (the WP7 defender, plus the blind sensor and the seeds).
  defend9: () => boolean;
  flyDefending9: (maxWall: number) => string[];
  // Records manual captures with these START BURN offsets and installs/retrains AUTOBURN.skl now.
  giveSkill: (offsetsTac: number[]) => string;
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
      const ship = getShip(KESTREL);
      const carried = freshUnitRacks(ship);
      if (kestrelOpts.arrivalDamage) arrivalDamage(carried.segs, ship.arrival!.damage);
      const fresh = createInitialState({ seed: nextSeed, shipIndex: KESTREL, carried });
      if (kestrelOpts.hollowAsleep) fresh.hollow.phase = 'dormant';
      if (kestrelOpts.sensorHealed) {
        const sensor = fresh.memory.find((seg) => seg.role === 'sensor');
        if (!sensor || !hasIntegrity(sensor)) throw new Error('harness9: no sensor');
        sensor.integrity = 100;
        sensor.state = 'intact';
      }
      base.store.update((d) => { Object.assign(d, fresh); });
      resetWorld();
      base.events.length = 0;
    },
    defend9,
    flyDefending9(maxWall) {
      return followDirector(base, { reactionSec: 0.4, maxWall, mistake: () => { defend9(); return false; } });
    },
    giveSkill(offsetsTac) {
      base.store.update((d) => { d.run.stats.demos.push(...offsetsTac.map((offsetTac) => ({ offsetTac }))); });
      if (skillBootDue(state()) === null) throw new Error('harness9.giveSkill: no skill due');
      return trainSkillAtBoot(base.store);
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
