// WP1 acceptance 3: the predictor agrees with the sim.
//  • no-thrust predicted rp within 1% of the sim's minimum r; periInSec within 2%;
//  • ringFraction within 0.5% of numeric time sampling on 5 orbits;
//  • ringFit.inRing agrees with the sim's lock condition on 1,000 random states.
import { createHarness, check, finish } from './harness';
import { computePrediction, ringFraction, ringFit } from '@systems/predict';
import { integrateStep } from '@systems/orbit-sim';
import { stateFromElements, elementsFromState, type Vec2 } from '@/types/orbit';
import { createRng } from '@systems/rng';

const harness = createHarness(7);
const store = harness.store;
const level = () => store.getState().level;

function placeShip(rp: number, e: number, omega: number, nu: number): void {
  const mu = level().planet.mu;
  const s = stateFromElements(rp, e, omega, nu, mu);
  store.mutate((d) => { d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy; });
}

// --- rp and periInSec vs the sim --------------------------------------------------------
// Inbound states on open and closed paths that pass ▼ above the surface.
const CASES: { rp: number; e: number; nu: number }[] = [
  { rp: 6000, e: 1.18, nu: -2.0 },
  { rp: 4200, e: 1.05, nu: -1.6 },
  { rp: 8500, e: 1.3, nu: -1.2 },
  { rp: 5500, e: 0.35, nu: -2.6 },
  { rp: 7000, e: 0.4, nu: -1.0 },   // closed but too big for the ring, so the sim won't lock mid-test
];
for (const tc of CASES) {
  harness.reset();
  placeShip(tc.rp, tc.e, 0.3, tc.nu);
  // Fixed TACTICAL warp so the sampling is uniform (1 game s per tick).
  store.update((d) => { d.clock.debugWarp = d.level.tacticalWarp; });
  const pred = computePrediction(store.getState());
  const t0 = store.getState().clock.tSec;
  let minR = Infinity;
  let minAt = 0;
  let prevRDotV = -1;
  while (harness.status() === 'approaching' && harness.wall() < 2000) {
    harness.step();
    const o = store.getState().orbit;
    const radius = Math.hypot(o.x, o.y);
    if (radius < minR) { minR = radius; minAt = store.getState().clock.tSec - t0; }
    const rDotV = o.x * o.vx + o.y * o.vy;
    if (prevRDotV < 0 && rDotV >= 0) break;
    prevRDotV = rDotV;
  }
  const rpErr = Math.abs(pred.rp - minR) / minR;
  const periErr = pred.periInSec === null ? Infinity : Math.abs(pred.periInSec - minAt) / minAt;
  check(`rp within 1% (rp ${tc.rp}, e ${tc.e})`, rpErr <= 0.01, `pred ${pred.rp.toFixed(1)} vs sim min r ${minR.toFixed(1)} (${(rpErr * 100).toFixed(3)}%)`);
  check(`periInSec within 2% (rp ${tc.rp}, e ${tc.e})`, periErr <= 0.02, `pred ${pred.periInSec?.toFixed(1)} vs sim ${minAt.toFixed(1)} s (${(periErr * 100).toFixed(3)}%)`);
}

// --- ringFraction vs numeric sampling --------------------------------------------------------
const ORBITS: { rp: number; e: number }[] = [
  { rp: 6000, e: 0.2 },    // fully inside 5,000–9,000
  { rp: 4500, e: 0.3 },    // dips below the ring
  { rp: 6000, e: 0.5 },    // reaches far outside
  { rp: 3800, e: 0.6 },    // crosses both edges
  { rp: 9500, e: 0.1 },    // entirely outside
];
for (const orbitCase of ORBITS) {
  const { planet, ring } = level();
  const semiMajor = orbitCase.rp / (1 - orbitCase.e);
  const analytic = ringFraction(semiMajor, orbitCase.e, ring);
  const s = stateFromElements(orbitCase.rp, orbitCase.e, 0, 0, planet.mu);
  const pos: Vec2 = { x: s.x, y: s.y };
  const vel: Vec2 = { x: s.vx, y: s.vy };
  const period = 2 * Math.PI * Math.sqrt(semiMajor ** 3 / planet.mu);
  const dt = 0.5;
  let inside = 0;
  let elapsed = 0;
  while (elapsed < period) {
    const radius = Math.hypot(pos.x, pos.y);
    const step = Math.min(dt, period - elapsed);
    if (radius >= ring.min && radius <= ring.max) inside += step;
    integrateStep(pos, vel, step, planet.mu, 0, 0);
    elapsed += step;
  }
  const numeric = inside / period;
  check(`ringFraction within 0.5% (rp ${orbitCase.rp}, e ${orbitCase.e})`, Math.abs(analytic - numeric) <= 0.005,
    `analytic ${analytic.toFixed(4)} vs numeric ${numeric.toFixed(4)}`);
}

// --- Closed loops are drawn as one closed turn (no drift tail) ---------------------------
for (const loop of [{ e: 0.2, nu: 1.0 }, { e: 0.9, nu: 0.2 }, { e: 0.999, nu: -0.3 }]) {
  harness.reset();
  placeShip(6000, loop.e, 0.2, loop.nu);
  const pred = computePrediction(store.getState());
  const first = pred.points[0]!;
  const last = pred.points[pred.points.length - 1]!;
  const firstKind = pred.spans[0]!.kind;
  const lastKind = pred.spans[pred.spans.length - 1]!.kind;
  check(`closed loop e ${loop.e} ends on its start point`, Math.hypot(last.x - first.x, last.y - first.y) < 1e-6 && firstKind === lastKind,
    `gap ${Math.hypot(last.x - first.x, last.y - first.y).toExponential(1)} km, spans ${pred.spans.map((span) => span.kind).join('>')}`);
}

// --- ringFit.inRing vs the sim lock condition on 1,000 random states ----------------------
{
  const rng = createRng(12345);
  let agreeNumeric = 0;
  let numericTested = 0;
  let agreeSim = 0;
  let simTested = 0;
  let edgeSkipped = 0;
  let terminalSkipped = 0;
  const { planet, ring } = level();
  for (let i = 0; i < 1000; i++) {
    const rp = 3500 + rng() * 8000;
    const e = rng() * 1.2;
    const omega = rng() * 2 * Math.PI;
    const nu = e < 1 ? (rng() * 2 - 1) * Math.PI : (rng() * 2 - 1) * Math.acos(-1 / e) * 0.8;
    const s = stateFromElements(rp, e, omega, nu, planet.mu);
    const elements = elementsFromState(s, planet.mu);
    const fit = ringFit(elements, ring);
    // States within 1 km of an edge are numerically ambiguous for a sampled check.
    if (Math.abs(fit.rp - ring.min) < 1 || (fit.closed && Math.abs(fit.ra - ring.max) < 1)) { edgeSkipped++; continue; }

    // Numeric truth: propagate one loop and test every sample against the ring.
    let numericInRing = false;
    if (fit.closed) {
      const semiMajor = fit.rp / (1 - elements.e);
      const period = 2 * Math.PI * Math.sqrt(semiMajor ** 3 / planet.mu);
      const pos: Vec2 = { x: s.x, y: s.y };
      const vel: Vec2 = { x: s.vx, y: s.vy };
      let elapsed = 0;
      let minR = Infinity;
      let maxR = 0;
      while (elapsed < period) {
        // Adaptive: ~0.2% of the crossing time, so near-parabolic loops stay cheap.
        const crossing = Math.hypot(pos.x, pos.y) / Math.hypot(vel.x, vel.y);
        const step = Math.min(Math.max(0.002 * crossing, 0.5), 600, period - elapsed);
        integrateStep(pos, vel, step, planet.mu, 0, 0);
        elapsed += step;
        const radius = Math.hypot(pos.x, pos.y);
        minR = Math.min(minR, radius);
        maxR = Math.max(maxR, radius);
      }
      // Sampling misses the exact apsides by a hair; compare with the analytic tolerance.
      numericInRing = minR >= ring.min - 1 && maxR <= ring.max + 1;
    }
    numericTested++;
    if (numericInRing === fit.inRing) agreeNumeric++;

    // The sim's lock condition: one tiny AI tick with the engine quiet advances the hold
    // exactly when the loop is in the ring.
    harness.reset();
    store.mutate((d) => { d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy; });
    harness.step(1e-4);
    if (harness.status() !== 'approaching') { terminalSkipped++; continue; }
    const holdAdvanced = store.getState().burn.lockHoldAiSec > 0;
    if (holdAdvanced === fit.inRing) agreeSim++;
    simTested++;
  }
  check('ringFit.inRing agrees with numeric propagation', agreeNumeric === numericTested,
    `${agreeNumeric}/${numericTested} (${edgeSkipped} within 1 km of an edge skipped)`);
  check('ringFit.inRing agrees with the sim lock condition', agreeSim === simTested && simTested >= 900,
    `${agreeSim}/${simTested} (${terminalSkipped} ended on the spot: crash/escape)`);
}

finish();
