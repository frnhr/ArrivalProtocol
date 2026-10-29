import type { OrbitState, OrbitElements, Ring, Vec2 } from '@/types/orbit';
import type { DropDot, DropFactors, DropSolution, LzState, LzWindow } from '@/types/landing';
import { elementsFromState, stateFromElements, positiveModulo } from '@/types/orbit';
import { DROP_KM_PER_1000, DROP_SOLVE_SAMPLES, POD_AIM_RP_FRAC, POD_ARC_POINTS } from '@data/tuning';
import { IS_DEV } from '@/env';

// The landing's pure math (01-landing §3.2–§3.3): the pod's kick and arc, where it meets the surface (the drop dot),
// the dot's track over one orbit, each LZ's window, and the drop width. Kepler only: no store, no clock, no data but
// the tuning constants, so the sim, the views, AUTODROP and the tests all share one answer.
//
// Angles: world radians (atan2 of a world position), CCW-positive. The planet does not rotate (§3.1), so a bracket and a
// launched arc stay still in this frame and the dot moves exactly as the ship does.
//
// Travel direction: every formula below is written for counter-clockwise motion (h > 0), where the true anomaly grows
// with time. A clockwise orbit (a strong RETRO at a far ▲ can reverse one, risk 18) is mirrored across the x axis
// (y → −y), solved CCW, and its angles mirrored back, so labels and windows come out right either way.

const TWO_PI = 2 * Math.PI;
// Bisection steps per window edge (plan §1.5: at most 20): a 1° sample interval of a 6,000 km orbit (39 game s) refined
// to under a millisecond of game time, far below what any countdown shows.
const EDGE_REFINE_ITERATIONS = 20;
// Radius samples at least across one window when looking for its in-band span: a window lasts a few dozen game s and
// the radius is smooth, so 8 steps can't step over a dip into and out of the band that a kid could act on.
const BAND_SPAN_STEPS = 8;
// Newton steps for Kepler's equation: converges in a handful for every e < 1 the landing sees; more means a bug.
const KEPLER_MAX_ITERATIONS = 50;
const KEPLER_TOL = 1e-13;

// [−π, π)
function wrapPi(angle: number): number {
  return positiveModulo(angle + Math.PI, TWO_PI) - Math.PI;
}

// +1 for CCW travel, −1 for CW (h < 0). A purely radial line (h = 0) has no direction and no landing.
function travelSign(state: OrbitState): 1 | -1 {
  const h = state.x * state.vy - state.y * state.vx;
  if (h === 0) throw new Error('landing-solve: a purely radial path has no travel direction');
  return h > 0 ? 1 : -1;
}

// The mirror across the x axis: its own inverse. Maps a CW state to a CCW one (and back).
function mirror(state: OrbitState): OrbitState {
  return { x: state.x, y: -state.y, vx: state.vx, vy: -state.vy };
}

function inSign(state: OrbitState, sign: 1 | -1): OrbitState {
  return sign > 0 ? state : mirror(state);
}

function periodOf(elements: OrbitElements, mu: number): number {
  if (!(elements.e < 1)) throw new Error(`landing-solve: not a closed orbit (e = ${elements.e})`);
  const a = elements.rp / (1 - elements.e);
  return TWO_PI * Math.sqrt((a * a * a) / mu);
}

// Mean anomaly of true anomaly ν (CCW frame), in [0, 2π).
function meanAnomalyOf(nu: number, e: number): number {
  const ecc = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  return positiveModulo(ecc - e * Math.sin(ecc), TWO_PI);
}

// True anomaly at mean anomaly M (Kepler's equation by Newton).
function trueAnomalyOf(mean: number, e: number): number {
  const m = positiveModulo(mean, TWO_PI);
  let ecc = e < 0.8 ? m : Math.PI;
  for (let i = 0; ; i++) {
    if (i >= KEPLER_MAX_ITERATIONS) throw new Error(`landing-solve: Kepler's equation did not converge (M ${m}, e ${e})`);
    const step = (ecc - e * Math.sin(ecc) - m) / (1 - e * Math.cos(ecc));
    ecc -= step;
    if (Math.abs(step) < KEPLER_TOL) break;
  }
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(ecc / 2), Math.sqrt(1 - e) * Math.cos(ecc / 2));
}

// --- The pod -----------------------------------------------------------------------------------------------------------

// The pod right after its own motor's retro kick (§3.3: no ship FUEL): the ship's velocity scaled by k along its own
// direction so that the pod's lowest point is aimRp (POD_AIM_RP_FRAC × R). Closed form rather than a search: an apsis
// at radius q satisfies v_q²/2 − μ/q = ε with v_q = h/q, and scaling v by k scales h by k and v² by k², so
//   k² = 2μ(1/r − 1/q) / (v² − h²/q²).
// q < r makes that apsis the periapsis. Throws when no retro kick reaches it (the ship's own ▼ already at or below
// aimRp, or a path so steep no scaled copy dips that low): the landing never asks for either.
export function podKickState(state: OrbitState, mu: number, aimRp: number): OrbitState {
  const r = Math.hypot(state.x, state.y);
  if (!(aimRp > 0 && aimRp < r)) throw new Error(`podKickState: aim ${aimRp} km must be below the ship's ${r.toFixed(0)} km`);
  const v2 = state.vx * state.vx + state.vy * state.vy;
  const h = state.x * state.vy - state.y * state.vx;
  const numerator = 2 * mu * (1 / r - 1 / aimRp);
  const denominator = v2 - (h * h) / (aimRp * aimRp);
  const k2 = numerator / denominator;
  if (!(denominator < 0) || !(k2 > 0 && k2 < 1)) {
    throw new Error(`podKickState: no retro kick puts ▼ at ${aimRp.toFixed(0)} km from r ${r.toFixed(0)} km (k² = ${k2})`);
  }
  const k = Math.sqrt(k2);
  return { x: state.x, y: state.y, vx: state.vx * k, vy: state.vy * k };
}

export interface PodImpact {
  rad: number;      // where it meets the surface (world radians)
  leadRad: number;  // how far ahead of the launch point, along the travel direction (0, 2π)
  tofSec: number;   // the real fall in game seconds (the descent is shown on AI time instead)
}

// The pod's conic in the CCW frame: its elements, and the true anomaly where it crosses R inbound.
function podGeometry(ccw: OrbitState, mu: number, R: number): { el: OrbitElements; nuImpact: number; p: number } {
  const el = elementsFromState(ccw, mu);
  const p = el.rp * (1 + el.e);
  if (!(el.rp < R)) throw new Error(`podImpact: the pod's ▼ (${el.rp.toFixed(0)} km) does not reach the surface (${R} km)`);
  const cosNu = (p / R - 1) / el.e;
  if (!(cosNu >= -1 && cosNu <= 1)) throw new Error(`podImpact: the pod's conic never crosses R (cos ν = ${cosNu})`);
  // The inbound root (before periapsis, ν < 0): the outbound one would be inside the planet.
  return { el, nuImpact: -Math.acos(cosNu), p };
}

// Where a pod in `podState` meets the surface, by the inbound root of r(ν) = R. Pure two-body: no drag (1b's kicks act on
// the ship, never on a pod already falling).
export function podImpact(podState: OrbitState, mu: number, R: number): PodImpact {
  const sign = travelSign(podState);
  const ccw = inSign(podState, sign);
  if (!(Math.hypot(ccw.x, ccw.y) > R)) throw new Error('podImpact: the pod starts at or below the surface');
  const { el, nuImpact } = podGeometry(ccw, mu, R);
  const phi0 = Math.atan2(ccw.y, ccw.x);
  const leadRad = positiveModulo(el.omega + nuImpact - phi0, TWO_PI);
  const period = periodOf(el, mu);
  const tofSec = positiveModulo(((meanAnomalyOf(nuImpact, el.e) - meanAnomalyOf(el.nu, el.e)) / TWO_PI) * period, period);
  return { rad: wrapPi(sign * (phi0 + leadRad)), leadRad, tofSec };
}

// The pod's arc from the launch to the surface, `points` world positions (the first at the ship, the last on R).
// Sampled evenly in true anomaly: what reads on the plot is the shape, not the timing.
export function podArc(shipState: OrbitState, mu: number, R: number, aimRp: number, points: number = POD_ARC_POINTS): Vec2[] {
  if (!(Number.isInteger(points) && points >= 2)) throw new Error(`podArc: ${points} points`);
  const sign = travelSign(shipState);
  const ccw = podKickState(inSign(shipState, sign), mu, aimRp);
  const { el, nuImpact, p } = podGeometry(ccw, mu, R);
  const sweep = positiveModulo(nuImpact - el.nu, TWO_PI);
  const arc: Vec2[] = [];
  for (let i = 0; i < points; i++) {
    const nu = el.nu + (sweep * i) / (points - 1);
    const radius = i === points - 1 ? R : p / (1 + el.e * Math.cos(nu));
    const angle = el.omega + nu;
    arc.push({ x: radius * Math.cos(angle), y: sign * radius * Math.sin(angle) });
  }
  return arc;
}

// The drop width (§3.3): half-width s in km of surface for a pod launched at `launchRadius`.
export function dropHalfWidthKm(launchRadius: number, R: number, f: DropFactors): number {
  if (!(launchRadius > R)) throw new Error(`dropHalfWidthKm: launch radius ${launchRadius} is not above the surface ${R}`);
  return DROP_KM_PER_1000 * ((launchRadius - R) / 1000) * f.sensor * f.plotter * f.driver;
}

// Where a pod launched from `state` lands, in the CCW frame, unwrapped to lie ahead of the ship.
function dotAngleCcw(ccwState: OrbitState, mu: number, R: number, aimRp: number): number {
  const pod = podKickState(ccwState, mu, aimRp);
  const { el, nuImpact } = podGeometry(pod, mu, R);
  const phi0 = Math.atan2(ccwState.y, ccwState.x);
  return phi0 + positiveModulo(el.omega + nuImpact - phi0, TWO_PI);
}

// --- The dot's track over one orbit ------------------------------------------------------------------------------------

export interface DotSample {
  tau: number;     // game s from the track's periapsis
  r: number;       // the ship's radius there
  theta: number;   // the dot's angle (CCW frame), unwrapped along the track
}

// One orbit of the dot, sampled (the expensive part of a solve; drop-cache keys it on the orbit epoch). `elements` and
// every angle are in the CCW frame; `sign` maps them back to the world.
export interface DotTrack {
  sign: 1 | -1;
  elements: OrbitElements;
  mu: number;
  R: number;
  aimRp: number;
  periodSec: number;
  samples: DotSample[];
}

function shipStateAt(track: DotTrack, tau: number): OrbitState {
  const { rp, e, omega } = track.elements;
  const nu = trueAnomalyOf((TWO_PI * tau) / track.periodSec, e);
  return stateFromElements(rp, e, omega, nu, track.mu);
}

// DROP_SOLVE_SAMPLES samples of the dot over one period of the orbit through `state`.
export function dotTrack(state: OrbitState, mu: number, R: number, aimRp: number = POD_AIM_RP_FRAC * R): DotTrack {
  const sign = travelSign(state);
  const elements = elementsFromState(inSign(state, sign), mu);
  const track: DotTrack = { sign, elements, mu, R, aimRp, periodSec: periodOf(elements, mu), samples: [] };
  let last: number | null = null;
  for (let i = 0; i < DROP_SOLVE_SAMPLES; i++) {
    const tau = (track.periodSec * i) / DROP_SOLVE_SAMPLES;
    const at = shipStateAt(track, tau);
    const raw = dotAngleCcw(at, mu, R, aimRp);
    const theta: number = last === null ? raw : last + wrapPi(raw - last);
    track.samples.push({ tau, r: Math.hypot(at.x, at.y), theta });
    last = theta;
  }
  const first = track.samples[0]!.theta;
  // The dot goes round once per orbit, forwards: anything else breaks every window below.
  if (IS_DEV && !(last! > first && last! - first < TWO_PI)) throw new Error('dotTrack: the dot does not move steadily forward');
  return track;
}

// Game seconds since the track's periapsis for a state on (nearly) the same orbit. Measured against the TRACK's own
// periapsis, never the state's: on a near-circular orbit the periapsis direction is noise, and a τ taken from the state's
// own elements would shift every window by however far that noise moved it.
export function tauOf(track: DotTrack, state: OrbitState): number {
  const ccw = inSign(state, track.sign);
  const nu = Math.atan2(ccw.y, ccw.x) - track.elements.omega;
  return (meanAnomalyOf(nu, track.elements.e) / TWO_PI) * track.periodSec;
}

interface TrackPoint {
  tau: number;
  r: number;
  theta: number;
}

// Grid point i of the track, extended periodically (the dot gains 2π per orbit), so any τ range can be walked.
function gridPoint(track: DotTrack, index: number): TrackPoint {
  const n = track.samples.length;
  const cycles = Math.floor(index / n);
  const sample = track.samples[index - cycles * n]!;
  return { tau: sample.tau + cycles * track.periodSec, r: sample.r, theta: sample.theta + cycles * TWO_PI };
}

// The exact dot at τ, unwrapped next to the grid's value there.
function exactPoint(track: DotTrack, tau: number): TrackPoint {
  const step = track.periodSec / track.samples.length;
  const reference = gridPoint(track, Math.floor(tau / step)).theta;
  const at = shipStateAt(track, positiveModulo(tau, track.periodSec));
  const raw = dotAngleCcw(at, track.mu, track.R, track.aimRp);
  return { tau, r: Math.hypot(at.x, at.y), theta: reference + wrapPi(raw - reference) };
}

// The root of g between `outside` (g ≥ 0) and `inside` (g < 0), by bisection on exact evaluations.
function refineEdge(track: DotTrack, g: (point: TrackPoint) => number, outside: number, inside: number): number {
  let lo = outside;
  let hi = inside;
  for (let i = 0; i < EDGE_REFINE_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (g(exactPoint(track, mid)) >= 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// From a τ where g < 0, walks the grid in `direction` until g ≥ 0, then refines the edge. Throws if g never turns
// non-negative within an orbit (a bracket the dot never leaves is a broken input).
function edgeFrom(track: DotTrack, g: (point: TrackPoint) => number, from: number, direction: 1 | -1): number {
  const n = track.samples.length;
  const step = track.periodSec / n;
  let index = direction > 0 ? Math.floor(from / step) + 1 : Math.ceil(from / step) - 1;
  for (let walked = 0; walked <= n; walked++, index += direction) {
    const point = gridPoint(track, index);
    if (g(point) >= 0) return refineEdge(track, g, point.tau, from);
  }
  throw new Error('landing-solve: a window edge was not found within one orbit');
}

// The ship's radius at τ (no dot: the band test needs only where the ship is).
function radiusAt(track: DotTrack, tau: number): number {
  const at = shipStateAt(track, positiveModulo(tau, track.periodSec));
  return Math.hypot(at.x, at.y);
}

// The first in-band span of [open, close] that ends after τNow (the window intersected with the ship's band crossings),
// or null. The radius is walked at least BAND_SPAN_STEPS times across the window (and never coarser than the track's
// own grid), and each crossing of a band edge is refined by bisection, so a window that straddles an edge on a PARTIAL
// orbit reports exactly the part [L] would take (launchRefusal reads the same radius test for "now").
function bandSpan(track: DotTrack, ring: Ring, open: number, close: number, tauNow: number): { start: number; end: number } | null {
  const inBand = (tau: number): boolean => {
    const r = radiusAt(track, tau);
    return r >= ring.min && r <= ring.max;
  };
  const edge = (from: number, to: number): number => {
    // from and to disagree on inBand: the crossing between them.
    const fromIn = inBand(from);
    let lo = from;
    let hi = to;
    for (let i = 0; i < EDGE_REFINE_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (inBand(mid) === fromIn) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const gridStep = track.periodSec / track.samples.length;
  const steps = Math.max(BAND_SPAN_STEPS, Math.ceil((close - open) / gridStep));
  const dt = (close - open) / steps;
  let start: number | null = inBand(open) ? open : null;
  let prev = open;
  for (let i = 1; i <= steps; i++) {
    const tau = i === steps ? close : open + i * dt;
    const now = inBand(tau);
    if (start === null && now) start = edge(prev, tau);
    else if (start !== null && !now) {
      const end = edge(prev, tau);
      if (end > tauNow) return { start, end };
      start = null;
    }
    prev = tau;
  }
  return start !== null && close > tauNow ? { start, end: close } : null;
}

// Each LZ's window from τNow (§3.2): the current one if it is open now, else the next. OPEN while the dot's centre is in
// the bracket; SURE while the whole dot (± s) is. Found from the dot's crossing of the bracket's centre (so a sure
// window narrower than one sample is never missed), then each edge refined on exact evaluations. `factors` are the
// drop width's multipliers for the pod that would launch (landing-rules dropFactors). Sorted by openInSec.
export function windowsFor(
  track: DotTrack, tauNow: number, lzs: readonly LzState[], factors: DropFactors, ring: Ring,
): LzWindow[] {
  const n = track.samples.length;
  const step = track.periodSec / n;
  const halfWidthAt = (r: number): number => dropHalfWidthKm(r, track.R, factors);
  const windows: LzWindow[] = [];
  for (const lz of lzs) {
    const centre = track.sign * lz.centreRad;
    const offset = (point: TrackPoint): number => wrapPi(point.theta - centre);
    const openG = (point: TrackPoint): number => Math.abs(offset(point)) - lz.halfWidthRad;
    const sureG = (point: TrackPoint): number => Math.abs(offset(point)) - (lz.halfWidthRad - halfWidthAt(point.r) / track.R);
    let found: LzWindow | null = null;
    // Centre crossings (offset − → +) from one orbit back to one orbit ahead: the first whose window has not closed yet.
    const first = Math.floor((tauNow - track.periodSec) / step);
    for (let index = first; index < first + 2 * n + 1 && found === null; index++) {
      const a = gridPoint(track, index);
      const b = gridPoint(track, index + 1);
      const offA = offset(a);
      const offB = offset(b);
      if (!(offA < 0 && offB >= 0 && offB - offA < Math.PI)) continue;
      let lo = a.tau;
      let hi = b.tau;
      for (let i = 0; i < EDGE_REFINE_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        if (offset(exactPoint(track, mid)) < 0) lo = mid; else hi = mid;
      }
      const tauCentre = (lo + hi) / 2;
      const close = edgeFrom(track, openG, tauCentre, 1);
      if (close <= tauNow) continue;
      const open = edgeFrom(track, openG, tauCentre, -1);
      const middle = exactPoint(track, (open + close) / 2);
      const band = bandSpan(track, ring, open, close, tauNow);
      const fits = sureG(exactPoint(track, tauCentre)) < 0;
      const sureOpen = fits ? edgeFrom(track, sureG, tauCentre, -1) : null;
      const sureClose = fits ? edgeFrom(track, sureG, tauCentre, 1) : null;
      found = {
        lz: lz.label,
        openInSec: open - tauNow,
        closeInSec: close - tauNow,
        sureOpenInSec: sureOpen === null ? null : sureOpen - tauNow,
        sureCloseInSec: sureClose === null ? null : sureClose - tauNow,
        launchRadius: middle.r,
        halfWidthKm: halfWidthAt(middle.r),
        inBandOpenInSec: band === null ? null : band.start - tauNow,
        inBandCloseInSec: band === null ? null : band.end - tauNow,
        inBand: band !== null,
      };
    }
    if (found === null) throw new Error(`windowsFor: no window for ${lz.label} within an orbit`);
    windows.push(found);
  }
  return windows.sort((a, b) => a.openInSec - b.openInSec);
}

// --- The whole solution ------------------------------------------------------------------------------------------------

export interface DropSolveInput {
  state: OrbitState;            // the ship, now
  tSec: number;                 // game time of `state`
  mu: number;
  R: number;
  ring: Ring;                   // the launch band
  lzs: readonly LzState[];
  factors: DropFactors;
  solution: boolean;            // capabilities.drop.solution: false with Nav Plotter dead or missing (L1)
}

// The drop solution for the ship as it is (§3.3, §3.14): the dot now, the pod's arc, and every LZ's next window.
// `track` is the cached dotTrack for this orbit (drop-cache.ts); omitted, it is computed here. Throws in dev on an
// open path: the landing only ever happens on a closed orbit.
export function computeDropSolution(input: DropSolveInput, track: DotTrack | null = null): DropSolution {
  const elements = elementsFromState(input.state, input.mu);
  // An open path is a state the game can be in (1b's burns while landing, a dev hook ending the flight on the
  // approach), not a bug: there is simply no dot and no window until the ship is back on a loop.
  if (!(elements.e < 1)) return { asOfTSec: input.tSec, periodSec: Infinity, block: null, dot: null, arc: [], windows: [] };
  const periodSec = periodOf(elements, input.mu);
  if (!input.solution) return { asOfTSec: input.tSec, periodSec, block: 'no-solution', dot: null, arc: [], windows: [] };
  const aimRp = POD_AIM_RP_FRAC * input.R;
  const solved = track ?? dotTrack(input.state, input.mu, input.R, aimRp);
  const launchRadius = Math.hypot(input.state.x, input.state.y);
  const dot: DropDot = {
    rad: podImpact(podKickState(input.state, input.mu, aimRp), input.mu, input.R).rad,
    halfWidthKm: dropHalfWidthKm(launchRadius, input.R, input.factors),
    launchRadius,
    inBand: launchRadius >= input.ring.min && launchRadius <= input.ring.max,
  };
  return {
    asOfTSec: input.tSec,
    periodSec: solved.periodSec,
    block: null,
    dot,
    arc: podArc(input.state, input.mu, input.R, aimRp),
    windows: windowsFor(solved, tauOf(solved, input.state), input.lzs, input.factors, input.ring),
  };
}

// A window time from a solution (`openInSec` and the like, relative to its asOfTSec) as seconds from `nowTSec`: the
// solution refreshes at PREDICT_HZ, and countdowns run down in between.
export function secFromNow(sol: Readonly<DropSolution>, inSec: number, nowTSec: number): number {
  return inSec - (nowTSec - sol.asOfTSec);
}

// The signed angle from `from` to `to` (world radians), in [−π, π): the rules' and views' one wrap.
export function angleDelta(from: number, to: number): number {
  return wrapPi(to - from);
}
