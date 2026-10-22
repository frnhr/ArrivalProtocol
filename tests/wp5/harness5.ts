// WP5 headless harness: the WP4 harness (store, clock, orbit-sim, predictor, pace, input router, say,
// boot, flight events, director, mode keys, ops core, held-tool sync, licences, faults) plus the
// Soul Archive's DOM-free systems: the reveal and the printer. Unlike the earlier suites it starts
// with the archive SEALED, as run 1 does (pass soulsFound: true for an open one).
// One harness per test file (systems are module singletons); resetTo() between scenarios.
import { createHarness4, type Harness4 } from '../wp4/harness4';
import { mountReveal } from '@systems/reveal';
import { mountPrinter } from '@systems/printer';
import { endFlight } from '@systems/orbit-sim';
import { soulsInMemory } from '@state/selectors';
import { stateFromElements, ringFraction, type Ring } from '@/types/orbit';
import type { SoulSegment } from '@/types/segment';

export interface Harness5 extends Harness4 {
  soul: (code: string) => SoulSegment;
  souls: () => SoulSegment[];
  // Puts the ship on a closed orbit whose printer range (time-weighted share in the ring) is
  // `range`, at its ▼, and ends the flight there as `status` (locked or accepted): printing starts.
  startPrinting: (range: number, status?: 'locked' | 'accepted') => void;
  // Steps until `until` holds or maxWall passes; returns the wall seconds it took.
  stepUntil: (until: () => boolean, maxWall?: number) => number;
}

// rp at the ring's inner edge and ra found by bisection, so ringFraction(a, e) = range exactly
// (range 1 is a circle in the middle of the ring).
export function orbitForRange(ring: Ring, range: number): { rp: number; ra: number } {
  if (range >= 1) {
    const mid = (ring.min + ring.max) / 2;
    return { rp: mid, ra: mid };
  }
  const rp = ring.min;
  const fraction = (ra: number): number => ringFraction((rp + ra) / 2, (ra - rp) / (ra + rp), ring);
  let inside = ring.max;
  let outside = ring.max * 100;
  for (let i = 0; i < 200; i++) {
    const mid = (inside + outside) / 2;
    if (fraction(mid) > range) inside = mid;
    else outside = mid;
  }
  return { rp, ra: (inside + outside) / 2 };
}

export function createHarness5(seed = 1, opts: { soulsFound?: boolean } = {}): Harness5 {
  const base = createHarness4(seed, { soulsFound: opts.soulsFound ?? false });
  mountReveal(base.store);
  mountPrinter(base.store);
  const souls = (): SoulSegment[] => soulsInMemory(base.store.getState());
  return {
    ...base,
    souls,
    soul(code) {
      const found = souls().find((soul) => soul.cluster === code);
      if (!found) throw new Error(`harness5: no cluster ${code} in memory`);
      return found;
    },
    startPrinting(range, status = 'locked') {
      const state = base.store.getState();
      const { rp, ra } = orbitForRange(state.level.ring, range);
      const ecc = (ra - rp) / (ra + rp);
      const orbit = stateFromElements(rp, ecc, 0, 0, state.level.planet.mu);
      base.store.update((d) => { d.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; });
      endFlight(base.store, status);
    },
    stepUntil(until, maxWall = 600) {
      const start = base.wall();
      while (!until() && base.wall() - start < maxWall) base.step();
      return base.wall() - start;
    },
  };
}
