// Planet-centred 2D orbital geometry for ONE conic. Angles in radians; radii in world units
// (km, same scale as PlanetParams). Pure math shared by the sim, the predictor, the guidance
// and the plot's projection.

export interface OrbitElements {
  rp: number;    // periapsis radius (canonical input; > 0)
  e: number;     // eccentricity (0 circle, <1 ellipse, >1 hyperbola)
  omega: number; // argument of periapsis — rotates the whole conic
  nu: number;    // true anomaly of the ship along the conic
}

export interface PlanetParams {
  R: number;     // surface / crash radius
  rAtm: number;  // atmosphere outer radius (drawn only; no drag yet)
  mu: number;    // GM (km³/s²)
}

// The SAFE ORBIT ring (= PRINTER RANGE), as radii from the planet centre. Passed explicitly
// everywhere it matters so the planet and the goal never get conflated again.
export interface Ring {
  min: number;
  max: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Projector {
  scale: number;
  project(point: Vec2): Vec2;
}

// World → screen for a square viewBox: planet at center, uniform scale to fit
// viewMaxR with a pixel margin, SVG y-axis flipped (world +y is up).
export function makeProjector(viewMaxR: number, viewBox: number, marginPx: number): Projector {
  const half = viewBox / 2;
  const scale = (half - marginPx) / viewMaxR;
  return {
    scale,
    project: (point) => ({ x: half + point.x * scale, y: half - point.y * scale }),
  };
}

// --- Sim ↔ render seam: Cartesian state <-> orbital elements ---
// Both are pure and unit-agnostic: feed SI (km, km/s, μ in km³/s²) or
// dimensionless units, same code. The live two-body sim integrates {x,y,vx,vy};
// the renderer wants OrbitElements. stateFromElements seeds the sim from a chosen
// conic; elementsFromState reads the current conic back each frame (for the plot)
// and at periapsis (for the capture/escape decision, which keys off |e| and so is
// frame-independent).

export interface OrbitState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Perifocal position+velocity at true anomaly nu, rotated by omega into the
// planet frame. Counterclockwise motion (h > 0). Valid for e > 1 (hyperbola).
export function stateFromElements(
  rp: number, e: number, omega: number, nu: number, mu: number,
): OrbitState {
  const p = rp * (1 + e);
  const h = Math.sqrt(mu * p);
  const r = p / (1 + e * Math.cos(nu));
  // Perifocal frame has periapsis along +x; rotate by omega afterwards.
  const xPf = r * Math.cos(nu);
  const yPf = r * Math.sin(nu);
  const vxPf = -(mu / h) * Math.sin(nu);
  const vyPf = (mu / h) * (e + Math.cos(nu));
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);
  return {
    x: xPf * cosw - yPf * sinw,
    y: xPf * sinw + yPf * cosw,
    vx: vxPf * cosw - vyPf * sinw,
    vy: vxPf * sinw + vyPf * cosw,
  };
}

// Eccentricity-vector method. e is a magnitude (orientation-independent), so the
// capture (e < 1) / escape (e ≥ 1) decision never depends on how nu wraps.
export function elementsFromState(state: OrbitState, mu: number): OrbitElements {
  const { x, y, vx, vy } = state;
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const rDotV = x * vx + y * vy;
  const h = x * vy - y * vx; // scalar specific angular momentum (z of r × v)
  // e_vec = ((v² − μ/r)·r_vec − (r·v)·v_vec) / μ
  const ex = ((v2 - mu / r) * x - rDotV * vx) / mu;
  const ey = ((v2 - mu / r) * y - rDotV * vy) / mu;
  const e = Math.hypot(ex, ey);
  const omega = Math.atan2(ey, ex);
  const p = (h * h) / mu;
  const rp = p / (1 + e);
  const nu = wrapPi(Math.atan2(y, x) - omega);
  return { rp, e, omega, nu };
}

// Normalize an angle to [−π, π).
function wrapPi(angle: number): number {
  const twoPi = 2 * Math.PI;
  let a = (angle + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return a - Math.PI;
}

// --- The single definition of "green" ---------------------------------------------------

export interface RingFit {
  closed: boolean;  // e < 1: the loop is closed (captured)
  rp: number;       // osculating periapsis radius (can be < R on an impact course)
  ra: number;       // apoapsis radius; Infinity on an open path
  inRing: boolean;  // the WHOLE loop lies inside the ring
}

// a = rp / (1 − e): positive on a closed loop, negative on an open path.
export function semiMajorAxis(elements: OrbitElements): number {
  return elements.rp / (1 - elements.e);
}

// Green means closed ∧ rp ≥ ring.min ∧ ra ≤ ring.max. The sim's ORBIT LOCK, the predictor's
// line colour, the guidance and ACCEPT ORBIT all call this one function, so they can never
// disagree about whether the kid made it.
export function ringFit(elements: OrbitElements, ring: Ring): RingFit {
  const closed = elements.e < 1;
  const ra = closed ? (elements.rp * (1 + elements.e)) / (1 - elements.e) : Infinity;
  return { closed, rp: elements.rp, ra, inRing: closed && elements.rp >= ring.min && ra <= ring.max };
}

// Below this eccentricity the orbit is a circle for ring purposes: the eccentric-anomaly
// inversion divides by e and loses all precision.
const CIRCLE_E = 1e-9;

// Time-weighted fraction of a closed orbit spent inside the ring (the PRINTER RANGE).
// Analytic, via Kepler: r = a(1 − e·cos E) and M = E − e·sin E. r rises monotonically with E
// on [0, π] and the orbit is symmetric, so the fraction of time with r in [lo, hi] is
// (M(E_hi) − M(E_lo)) / π. Open paths spend no lasting time anywhere: 0.
export function ringFraction(a: number, e: number, ring: Ring): number {
  if (!(e < 1) || a <= 0) return 0;
  if (e < CIRCLE_E) return a >= ring.min && a <= ring.max ? 1 : 0;
  const rp = a * (1 - e);
  const ra = a * (1 + e);
  // A loop wholly inside the ring is exactly 100%: the acos below lands a hair short of π at
  // ▲, which would show a locked orbit as "99%".
  if (rp >= ring.min && ra <= ring.max) return 1;
  const lo = Math.max(rp, ring.min);
  const hi = Math.min(ra, ring.max);
  if (lo >= hi) return 0;
  const eccAt = (radius: number): number => Math.acos(Math.max(-1, Math.min(1, (1 - radius / a) / e)));
  const meanAt = (ecc: number): number => ecc - e * Math.sin(ecc);
  return (meanAt(eccAt(hi)) - meanAt(eccAt(lo))) / Math.PI;
}

// The PRINTER RANGE of the loop with these ends (▼ at rp, ▲ at ra, radii in km): ringFraction from
// the apsides, for a loop that is planned rather than flown.
export function loopRange(rp: number, ra: number, ring: Ring): number {
  return ringFraction((rp + ra) / 2, (ra - rp) / (ra + rp), ring);
}

// True anomaly on the INBOUND branch where the conic crosses `radius`, or null when the
// conic never reaches that radius. (The outbound crossing is its negative's mirror, +value.)
// Used to place the ship at the start; event TIMES use the universal form below.
export function inboundAnomalyAtRadius(rp: number, e: number, radius: number): number | null {
  if (e < CIRCLE_E) return null; // a circle never crosses a radius, it sits on one
  const p = rp * (1 + e);
  const cosNu = (p / radius - 1) / e;
  if (cosNu > 1 || cosNu < -1) return null;
  return -Math.acos(cosNu);
}

// --- Kepler timing (exact for the two-body problem the sim integrates) ------------------
//
// Event times use universal variables built from the radius and the radial velocity, never
// from the true anomaly. One formula then covers every conic and runs straight through e = 1
// (the instant a capture closes the loop) and through the near-radial plunge a kid gets by
// holding IN on the crash course (h → 0, rp → 0, ν → π). The true-anomaly forms are singular
// at both, and their sign assumes counter-clockwise motion, which that plunge can flip.

export interface KeplerConic {
  mu: number;
  alpha: number;  // 1/a = 2/r − v²/μ, from the state: > 0 closed, 0 parabola, < 0 open
  p: number;      // semi-latus rectum h²/μ (0 on a purely radial line)
  rp: number;
  e: number;
}

export function keplerConic(state: OrbitState, mu: number, elements: OrbitElements): KeplerConic {
  const radius = Math.hypot(state.x, state.y);
  const h = state.x * state.vy - state.y * state.vx;
  return {
    mu,
    alpha: 2 / radius - (state.vx * state.vx + state.vy * state.vy) / mu,
    p: (h * h) / mu,
    rp: elements.rp,
    e: elements.e,
  };
}

// σ = r·v/√μ, the radial-velocity term of the universal formulas (< 0 inbound).
export function radialSigma(state: OrbitState, mu: number): number {
  return (state.x * state.vx + state.y * state.vy) / Math.sqrt(mu);
}

// Below |z| = 1 the Stumpff closed forms lose digits to cancellation; the series is exact there.
const STUMPFF_SERIES_LIMIT = 1;
// Terms fall by (2k+2)(2k+3) each; ten reach 1/23!, far below double precision.
const STUMPFF_SERIES_TERMS = 10;

// Stumpff S(z) = (√z − sin √z) / z^{3/2}, continued to z ≤ 0 (sinh) and through 0 (= 1/6).
function stumpffS(z: number): number {
  if (Math.abs(z) < STUMPFF_SERIES_LIMIT) {
    let term = 1 / 6;
    let sum = term;
    for (let k = 1; k < STUMPFF_SERIES_TERMS; k++) {
      term *= -z / ((2 * k + 2) * (2 * k + 3));
      sum += term;
    }
    return sum;
  }
  if (z > 0) {
    const root = Math.sqrt(z);
    return (root - Math.sin(root)) / (root * root * root);
  }
  const root = Math.sqrt(-z);
  return (Math.sinh(root) - root) / (root * root * root);
}

// Universal anomaly χ, measured from periapsis in the direction of motion (negative before
// it), at `radius` with radial term `sigma`: √a·E on a closed loop, √−a·F on an open path,
// σ on a parabola. Written as atan/atanh(x)/√|α| so it stays exact as α → 0.
export function universalAnomaly(conic: KeplerConic, radius: number, sigma: number): number {
  const { alpha } = conic;
  if (alpha > 0) {
    const root = Math.sqrt(alpha);
    return Math.atan2(sigma * root, 1 - alpha * radius) / root;
  }
  if (alpha < 0) {
    const root = Math.sqrt(-alpha);
    const tanhF = (sigma * root) / (1 - alpha * radius);
    // (1 − αr)² − σ²|α| = 1 + p|α| > 0, so |tanh F| < 1 on every real state.
    if (!(Math.abs(tanhF) < 1)) throw new Error(`universalAnomaly: |tanh F| = ${tanhF} on an open path`);
    return Math.atanh(tanhF) / root;
  }
  return sigma;
}

// Game seconds from periapsis to universal anomaly χ (negative before periapsis):
// √μ·t = rp·χ + e·χ³·S(αχ²). Both terms share χ's sign, so nothing cancels.
export function timeFromPeriapsis(conic: KeplerConic, chi: number): number {
  return (conic.rp * chi + conic.e * chi * chi * chi * stumpffS(conic.alpha * chi * chi)) / Math.sqrt(conic.mu);
}

// Stumpff C(z) = (1 − cos √z) / z, continued like S (cosh for z < 0, 1/2 at 0).
function stumpffC(z: number): number {
  if (Math.abs(z) < STUMPFF_SERIES_LIMIT) {
    let term = 1 / 2;
    let sum = term;
    for (let k = 1; k < STUMPFF_SERIES_TERMS; k++) {
      term *= -z / ((2 * k + 1) * (2 * k + 2));
      sum += term;
    }
    return sum;
  }
  if (z > 0) return (1 - Math.cos(Math.sqrt(z))) / z;
  return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
}

// Halvings and Newton steps the coast propagator may take before it gives up loudly: the bracket's doubling
// reaches any jump the game makes within a few dozen, and the safeguarded Newton converges in under ten.
const PROPAGATE_MAX_ITERATIONS = 200;
// Converged once a Newton step moves χ by less than this share of it: double precision, near enough.
const PROPAGATE_CHI_REL_TOL = 1e-14;

// The ship `dtSec` game seconds further along its conic with no thrust: exact two-body motion, as the sim's
// integrator approximates it (LEAD-2's coast SKIP jumps along it, so a SKIP of 49 days lands where the
// integrator would have, without integrating 49 days). Universal variables from the current state (Lagrange
// f and g), so one formula covers loops, flybys and the e = 1 of a capture, and a just-captured loop's days-long
// leg is as exact as a minute's. A loop's jump is first cut to under one period: the motion repeats.
export function propagateConic(state: OrbitState, mu: number, dtSec: number): OrbitState {
  if (!(dtSec >= 0) || !Number.isFinite(dtSec)) throw new Error(`propagateConic: dt ${dtSec} is not a finite forward time`);
  const r0 = Math.hypot(state.x, state.y);
  const rootMu = Math.sqrt(mu);
  const alpha = 2 / r0 - (state.vx * state.vx + state.vy * state.vy) / mu;
  const sigma0 = (state.x * state.vx + state.y * state.vy) / rootMu;  // r0·v_r0 / √μ
  let dt = dtSec;
  if (alpha > 0) dt = positiveModulo(dt, (2 * Math.PI) / (rootMu * Math.pow(alpha, 1.5)));
  if (dt === 0) return { ...state };
  // √μ·Δt = σ0·χ²·C + (1 − α·r0)·χ³·S + r0·χ, with z = α·χ²: increasing in χ (its slope is the radius).
  const timeOf = (chi: number): number => {
    const z = alpha * chi * chi;
    return sigma0 * chi * chi * stumpffC(z) + (1 - alpha * r0) * chi * chi * chi * stumpffS(z) + r0 * chi;
  };
  const radiusOf = (chi: number): number => {
    const z = alpha * chi * chi;
    return sigma0 * chi * (1 - z * stumpffS(z)) + (1 - alpha * r0) * chi * chi * stumpffC(z) + r0;
  };
  const goal = rootMu * dt;
  // Bracket the root (χ = 0 is Δt = 0), then Newton kept inside the bracket (a bisection when it would leave it).
  let below = 0;
  let above = goal / r0;
  for (let i = 0; timeOf(above) < goal; i++) {
    if (i >= PROPAGATE_MAX_ITERATIONS) throw new Error(`propagateConic: no bracket for a ${dtSec} s coast`);
    below = above;
    above *= 2;
  }
  let chi = (below + above) / 2;
  for (let i = 0; ; i++) {
    if (i >= PROPAGATE_MAX_ITERATIONS) throw new Error(`propagateConic: Kepler's equation did not converge for a ${dtSec} s coast`);
    const error = timeOf(chi) - goal;
    if (error > 0) above = chi; else below = chi;
    let next = chi - error / radiusOf(chi);
    if (!(next > below && next < above)) next = (below + above) / 2;
    const step = Math.abs(next - chi);
    chi = next;
    if (step <= PROPAGATE_CHI_REL_TOL * chi || above - below <= PROPAGATE_CHI_REL_TOL * chi) break;
  }
  const z = alpha * chi * chi;
  const f = 1 - (chi * chi / r0) * stumpffC(z);
  const g = dt - (chi * chi * chi / rootMu) * stumpffS(z);
  const x = f * state.x + g * state.vx;
  const y = f * state.y + g * state.vy;
  const radius = Math.hypot(x, y);
  const fDot = (rootMu / (radius * r0)) * (z * stumpffS(z) - 1) * chi;
  const gDot = 1 - (chi * chi / radius) * stumpffC(z);
  return { x, y, vx: fDot * state.x + gDot * state.vx, vy: fDot * state.y + gDot * state.vy };
}

// value mod modulus in [0, modulus). Adds the modulus only to a negative remainder: a loop right after capture has a
// period of 1e17 s, and adding it to a small positive time would round that time to the nearest 64 s.
export function positiveModulo(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

export function orbitalPeriod(conic: KeplerConic): number {
  if (!(conic.alpha > 0)) throw new Error(`orbitalPeriod: not a closed loop (1/a = ${conic.alpha})`);
  return (2 * Math.PI) / (Math.sqrt(conic.mu) * Math.pow(conic.alpha, 1.5));
}

// The radial term σ where the conic crosses `radius` on its INBOUND leg (≤ 0), or null when
// it never reaches that radius. σ² = 2r − αr² − p; the range check above it guarantees
// σ² ≥ 0, so a rounding hair below zero at an apsis is clamped rather than lost.
export function inboundSigmaAtRadius(conic: KeplerConic, radius: number): number | null {
  if (radius < conic.rp) return null;
  if (conic.alpha > 0 && radius > 2 / conic.alpha - conic.rp) return null;
  return -Math.sqrt(Math.max(0, 2 * radius - conic.alpha * radius * radius - conic.p));
}
