// Planet-centered 2D orbital geometry for ONE conic. Angles in radians; radii
// in world units (same scale as PlanetParams). Deliberately independent of any
// simulation so the future live sim can derive the same OrbitElements from its
// {x,y,vx,vy} state and feed the exact same renderer.

export interface OrbitElements {
  rp: number;    // periapsis radius (canonical input; > 0)
  e: number;     // eccentricity (0 circle, <1 ellipse, >1 hyperbola)
  omega: number; // argument of periapsis — rotates the whole conic
  nu: number;    // true anomaly of the ship along the conic
}

export interface PlanetParams {
  R: number;     // surface / crash radius
  rAtm: number;  // atmosphere outer radius
  rMin: number;  // target-altitude band inner radius
  rMax: number;  // target-altitude band outer radius
  mu: number;    // GM — reserved for the live-sim seam; UNUSED by the renderer
}

export interface OrbitRenderOpts {
  showGhost: boolean;
  ghostScale: number; // multiplicative offset applied to e for the ghost conic
  ghostDr: number;    // radial offset (world units) applied to the ghost conic
}

export interface OrbitDerived {
  p: number;          // semi-latus rectum
  a: number;          // semi-major axis (negative for hyperbola)
  ra: number | null;  // apoapsis radius; null for parabola/hyperbola
  isClosed: boolean;  // e < 1
}

export interface Vec2 {
  x: number;
  y: number;
}

// Parabola (e == 1) is a measure-zero degenerate that makes p/a blow up. The
// live sim will essentially never land exactly on it; nudge e off 1 defensively.
const PARABOLA_EPS = 1e-3;

function safeE(e: number): number {
  const clamped = Math.max(0, e);
  if (Math.abs(clamped - 1) < PARABOLA_EPS) {
    return clamped < 1 ? 1 - PARABOLA_EPS : 1 + PARABOLA_EPS;
  }
  return clamped;
}

export function deriveOrbit(el: OrbitElements): OrbitDerived {
  const e = safeE(el.e);
  const p = el.rp * (1 + e);
  const a = el.rp / (1 - e); // negative for hyperbola
  const isClosed = e < 1;
  const ra = isClosed ? (el.rp * (1 + e)) / (1 - e) : null;
  return { p, a, ra, isClosed };
}

// World radius the plot must contain. K keeps the hyperbola's periapsis region
// readable while its branches run off-frame, instead of the asymptotes
// dominating the fit.
export function viewMaxRadius(el: OrbitElements, planet: PlanetParams, K = 4): number {
  const { ra, isClosed } = deriveOrbit(el);
  const orbitR = isClosed && ra !== null ? ra : K * el.rp;
  return Math.max(planet.R, planet.rAtm, planet.rMax, orbitR);
}

// Sample r(φ) = p / (1 + e·cos φ), φ = θ − ω, into world points. For e ≥ 1 the
// branch is open and only valid where the denominator stays positive; we trim
// just inside the asymptotes and clamp at viewMaxR so the arc doesn't run to ∞.
// The kept points form one contiguous run (r is smallest at periapsis, largest
// toward the asymptotes), so dropping r > viewMaxR never leaves an interior gap.
export function sampleConic(
  el: OrbitElements,
  viewMaxR: number,
  steps = 220,
): { pts: Vec2[]; closed: boolean } {
  const e = safeE(el.e);
  const p = el.rp * (1 + e);
  const closedConic = e < 1;

  let phiMin: number;
  let phiMax: number;
  if (closedConic) {
    // Centre the sweep on periapsis (φ=0) so the high-radius region that may get
    // clamped sits at BOTH ends of the sample, never the middle. Clamped points
    // then drop off the ends and the kept arc stays contiguous — no chord drawn
    // across a clipped gap.
    phiMin = -Math.PI;
    phiMax = Math.PI;
  } else {
    const asymptote = Math.acos(-1 / e); // in (π/2, π)
    const margin = (0.5 * Math.PI) / 180;
    phiMin = -asymptote + margin;
    phiMax = asymptote - margin;
  }

  const pts: Vec2[] = [];
  let clamped = false;
  for (let i = 0; i <= steps; i++) {
    const phi = phiMin + ((phiMax - phiMin) * i) / steps;
    const denom = 1 + e * Math.cos(phi);
    if (denom <= 1e-6) { clamped = true; continue; }
    const r = p / denom;
    if (r > viewMaxR) { clamped = true; continue; } // clamp at the view bound
    const theta = phi + el.omega;
    pts.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
  }
  // Only close the loop when the whole curve is present. A clipped ellipse is
  // drawn as the visible open arc, never bridged by a straight chord.
  return { pts, closed: closedConic && !clamped };
}

// Point on the conic at a given true anomaly (used for the ship marker).
export function pointAt(el: OrbitElements, nu: number): Vec2 {
  const e = safeE(el.e);
  const p = el.rp * (1 + e);
  const r = p / Math.max(1 + e * Math.cos(nu), 1e-6);
  const theta = nu + el.omega;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

export function periapsisPoint(el: OrbitElements): Vec2 {
  return { x: el.rp * Math.cos(el.omega), y: el.rp * Math.sin(el.omega) };
}

export function apoapsisPoint(el: OrbitElements, ra: number): Vec2 {
  const theta = el.omega + Math.PI;
  return { x: ra * Math.cos(theta), y: ra * Math.sin(theta) };
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
