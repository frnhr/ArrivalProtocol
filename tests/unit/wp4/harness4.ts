// WP4 headless harness: the WP2 harness (store, clock, orbit-sim, predictor, pace, input router,
// say, boot, flight events, director, mode keys) plus every DOM-free system the ship-1 coupling
// needs: the ops core, the held-tool sync, licences and the scripted faults. Unlike the WP3
// harness it does NOT install the WP3-era tools: the strip is exactly the WP4 seed.
// One harness per test file (systems are module singletons); resetTo() between scenarios.
import { createHarness2, type Harness2 } from '../wp2/harness2';
import type { HarnessOpts } from '../wp1/harness';
import { mountOpsCore, getOps } from '@systems/ops-core';
import { mountHeldToolSync } from '@systems/fs-tools';
import { mountLicences } from '@systems/licences';
import { mountFaults } from '@systems/faults';
import { capabilitiesNow, type Capabilities } from '@systems/capabilities';
import { getByRole, hasIntegrity } from '@state/selectors';
import type { Segment, SegmentRole } from '@/types/segment';
import type { HealthSegment } from '@state/selectors';

export interface Harness4 extends Harness2 {
  caps: () => Capabilities;
  file: (role: SegmentRole) => HealthSegment;
  setIntegrity: (role: SegmentRole, integrity: number) => void;
  // Disarms the scripted ENGINE I/O FAULT for this flight (comparisons that need a fixed engine).
  noFault: () => void;
  runOps: (maxWall?: number) => number;
  seg: (name: string) => Segment;
}

// opts: see HarnessOpts (WP5: the colonists are already found unless soulsFound is false).
export function createHarness4(seed = 1, opts: HarnessOpts = {}): Harness4 {
  const base = createHarness2(seed, opts);
  mountOpsCore(base.store);
  mountHeldToolSync(base.store);
  mountLicences(base.store);
  mountFaults(base.store);
  const file = (role: SegmentRole): HealthSegment => {
    const found = getByRole(base.store.getState(), role);
    if (!found || !hasIntegrity(found)) throw new Error(`harness4: no file with role '${role}'`);
    return found;
  };
  return {
    ...base,
    caps: () => capabilitiesNow(base.store.getState()),
    file,
    setIntegrity(role, integrity) {
      const target = file(role);
      base.store.update((d) => { target.integrity = integrity; d.ui.memoryRev++; });
    },
    noFault() {
      base.store.update((d) => { d.director.done.push('engine-io-fault'); });
    },
    runOps(maxWall = 60) {
      const start = base.wall();
      while (getOps().length > 0 && base.wall() - start < maxWall) base.step();
      return base.wall() - start;
    },
    seg(name) {
      const found = base.store.getState().memory.find((seg) => seg.name === name);
      if (!found) throw new Error(`harness4: no segment named '${name}'`);
      return found;
    },
  };
}
