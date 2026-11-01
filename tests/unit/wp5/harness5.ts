// WP5 headless harness: the WP4 harness (store, clock, orbit-sim, predictor, pace, input router, say,
// boot, flight events, director, mode keys, ops core, held-tool sync, licences, faults) plus the
// landing (slice 1a: it replaces the reveal and the printer; the WP1 base mounts the drop cache). Pods are
// found by the old cluster codes (`C09` is pod 9, tests/unit/support/pod-code.ts). Every pod lands as the landing begins
// (tests/unit/support/landing-instant.ts), unless the suite sets another landing mode.
// One harness per test file (systems are module singletons); resetTo() between scenarios.
import { createHarness4, type Harness4 } from '../wp4/harness4';
import { mountLanding } from '@systems/landing';
import { isPodCode } from '../support/pod-code';
import { mountInstantLanding } from '../support/landing-instant';
import { endFlight } from '@systems/orbit-sim';
import { driversInMemory } from '@state/selectors';
import { stateFromElements, ringFraction, type Ring } from '@/types/orbit';
import type { DriverSegment } from '@/types/segment';

export interface Harness5 extends Harness4 {
  soul: (code: string) => DriverSegment;
  souls: () => DriverSegment[];
  // Puts the ship on a closed orbit whose share in band (time-weighted share in the ring) is
  // `range`, at its ▼, and ends the flight there as `status` (locked or accepted): the landing starts.
  startLanding: (range: number, status?: 'locked' | 'accepted') => void;
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
  mountLanding(base.store);
  // After the landing, so its tick sees this tick's touchdowns first: the run-flow loops written against printing reach
  // the report.
  mountInstantLanding(base.store);
  const souls = (): DriverSegment[] => driversInMemory(base.store.getState());
  return {
    ...base,
    souls,
    soul(code) {
      const found = souls().find((soul) => isPodCode(soul.pod, code));
      if (!found) throw new Error(`harness5: no pod ${code} in memory`);
      return found;
    },
    startLanding(range, status = 'locked') {
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
