// Slice 1a, F1: the landing's pure math (src/systems/landing-solve.ts) against 01-landing §3.2–§3.3's numbers. No store,
// no clock: states are built from elements, so the suite runs in well under a second.
import { check, finish } from './checks';
import {
  podKickState, podImpact, podArc, dropHalfWidthKm, dotTrack, tauOf, windowsFor, computeDropSolution, type DropSolveInput,
} from '@systems/landing-solve';
import { elementsFromState, stateFromElements, propagateConic, type OrbitState } from '@/types/orbit';
import type { DropFactors, LzState, LzWidth } from '@/types/landing';
import { LZ_WIDTH_KM, POD_AIM_RP_FRAC, LANDING_TACTICAL_WARP } from '@data/tuning';

const MU = 43000;
const R = 3390;
const AIM = POD_AIM_RP_FRAC * R;
const RING = { min: 5000, max: 9000 };
const ONE: DropFactors = { sensor: 1, plotter: 1, driver: 1 };
const DEG = Math.PI / 180;

function wrap(angle: number): number {
  const twoPi = 2 * Math.PI;
  return ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

// A circular CCW orbit of radius r with the ship at world angle `atDeg`.
function circular(r: number, atDeg = 0): OrbitState {
  return stateFromElements(r, 0, atDeg * DEG, 0, MU);
}

function lz(label: string, centreDeg: number, width: LzWidth, pods = 3): LzState {
  const widthKm = LZ_WIDTH_KM[width];
  return { label, centreRad: wrap(centreDeg * DEG), halfWidthRad: widthKm / 2 / R, widthKm, pods, ground: 'flat' };
}

function input(state: OrbitState, lzs: LzState[], factors: DropFactors = ONE): DropSolveInput {
  return { state, tSec: 0, mu: MU, R, ring: RING, lzs, factors, solution: true };
}

function dotRad(state: OrbitState): number {
  return podImpact(podKickState(state, MU, AIM), MU, R).rad;
}

// --- The kick and the arc ---
for (const r of [5000, 6000, 7000, 9000]) {
  const pod = podKickState(circular(r, 40), MU, AIM);
  const rp = elementsFromState(pod, MU).rp;
  check(`the kick from a circular ${r} km orbit puts the pod's ▼ at 0.6 R (${AIM.toFixed(0)} km)`, Math.abs(rp - AIM) < 1e-6, `${rp.toFixed(6)} km`);
}
{
  const ellipse = stateFromElements(5000, (7000 - 5000) / (7000 + 5000), 0.3, 2.0, MU);
  const rp = elementsFromState(podKickState(ellipse, MU, AIM), MU).rp;
  check('the kick on an ellipse (▼ 5,000, ▲ 7,000, mid-way) also reaches 0.6 R', Math.abs(rp - AIM) < 1e-6, `${rp.toFixed(6)} km`);
}

const leads: string[] = [];
let leadsOk = true;
for (const r of [5000, 6000, 7000, 8000, 9000]) {
  const lead = podImpact(podKickState(circular(r), MU, AIM), MU, R).leadRad / DEG;
  leads.push(`${r}: ${lead.toFixed(1)}°`);
  // §3.3: "70° from 5,000 km, 88° from 9,000" (the spec rounds; the exact figure at 5,000 is 69.6°).
  if (!(lead >= 69 && lead <= 89)) leadsOk = false;
}
check('the dot leads the ship by 70–88° on circular orbits of 5,000–9,000 km', leadsOk, leads.join(', '));

{
  let wraps = false;
  let detail = '';
  for (const r of [5000, 7000, 9000]) {
    const ship = circular(r, 170);
    const arc = podArc(ship, MU, R, AIM);
    const first = arc[0]!;
    const last = arc[arc.length - 1]!;
    let swept = 0;
    let previous = Math.atan2(first.y, first.x);
    let belowSurface = false;
    for (const point of arc.slice(1)) {
      const angle = Math.atan2(point.y, point.x);
      const step = wrap(angle - previous);
      if (step < 0) wraps = true;
      swept += step;
      previous = angle;
      if (Math.hypot(point.x, point.y) < R - 1e-6) belowSurface = true;
    }
    const lastR = Math.hypot(last.x, last.y);
    const endsAtDot = Math.abs(wrap(Math.atan2(last.y, last.x) - dotRad(ship))) < 1e-9;
    if (!(swept < Math.PI) || belowSurface || Math.abs(lastR - R) > 1e-6 || !endsAtDot || Math.abs(first.x - ship.x) > 1e-9) wraps = true;
    detail += `${r}: ${(swept / DEG).toFixed(1)}° `;
  }
  check('the pod arc runs forward from the ship to the dot, never below R and never wrapping', !wraps, detail);
}

// --- The drop width ---
{
  const s = dropHalfWidthKm(6000, R, ONE);
  check('the drop width at 6,000 km is ±78 km (§3.3)', Math.round(s) === 78, `±${s.toFixed(1)} km`);
  const damaged = dropHalfWidthKm(6000, R, { sensor: 1.5, plotter: 1, driver: 2 });
  check('the factors multiply (×1.5 × 2 = ×3)', Math.abs(damaged - 3 * s) < 1e-9, `±${damaged.toFixed(1)} km`);
}

// --- The dot's ground speed (§3.2's table, km per game second) ---
{
  const table: [number, number][] = [[5000, 1.99], [6000, 1.51], [7000, 1.2], [9000, 0.82]];
  const rows: string[] = [];
  let ok = true;
  for (const [r, kmPerSec] of table) {
    const track = dotTrack(circular(r), MU, R, AIM);
    const a = track.samples[10]!;
    const b = track.samples[20]!;
    const speed = ((b.theta - a.theta) * R) / (b.tau - a.tau);
    rows.push(`${r}: ${speed.toFixed(3)}`);
    if (Math.abs(speed - kmPerSec) > 0.01) ok = false;
  }
  check('the dot slides at 1.99 / 1.51 / 1.20 / 0.82 km per game s at 5,000 / 6,000 / 7,000 / 9,000 km', ok, rows.join(', '));
}

// --- Windows: sure lengths (§3.2's m = 1 column), edges, retrograde, ellipses ---
{
  const table: [number, number][] = [[5000, 7.6], [6000, 8.0], [7000, 7.6], [9000, 3.9]];
  const rows: string[] = [];
  let ok = true;
  for (const [r, sureTac] of table) {
    const sol = computeDropSolution(input(circular(r, 0), [lz('LZ-A', 150, 'standard')]));
    const w = sol.windows[0]!;
    const lengthTac = w.sureOpenInSec === null || w.sureCloseInSec === null ? NaN : (w.sureCloseInSec - w.sureOpenInSec) / LANDING_TACTICAL_WARP;
    rows.push(`${r}: ${lengthTac.toFixed(2)} s`);
    if (!(Math.abs(lengthTac - sureTac) <= 0.3)) ok = false;
  }
  check('a STANDARD LZ is sure for 7.6 / 8.0 / 7.6 / 3.9 tactical s at ×20 (±0.3 s)', ok, rows.join(', '));
}
{
  // At m = 3 a STANDARD LZ never fits from 6,000 km (§3.2: "never fits").
  const sol = computeDropSolution(input(circular(6000), [lz('LZ-A', 150, 'standard')], { sensor: 1.5, plotter: 1, driver: 2 }));
  const w = sol.windows[0]!;
  check('a dot that never fits has no sure window (m = 3 at 6,000 km)', w.sureOpenInSec === null && w.sureCloseInSec === null && w.closeInSec > w.openInSec);
}
{
  // The edges are where they say: propagate the ship to each edge and look at its dot.
  const ship = circular(6500, 10);
  const zone = lz('LZ-B', 200, 'wide');
  const sol = computeDropSolution(input(ship, [zone]));
  const w = sol.windows[0]!;
  const offAt = (sec: number): number => Math.abs(wrap(dotRad(propagateConic(ship, MU, sec)) - zone.centreRad)) - zone.halfWidthRad;
  const sureAt = (sec: number): number => {
    const at = propagateConic(ship, MU, sec);
    return Math.abs(wrap(dotRad(at) - zone.centreRad)) - (zone.halfWidthRad - dropHalfWidthKm(Math.hypot(at.x, at.y), R, ONE) / R);
  };
  const tol = 1e-6;
  check('the window opens and closes where the dot\'s centre crosses the bracket edges',
    w.openInSec > 0 && Math.abs(offAt(w.openInSec)) < tol && Math.abs(offAt(w.closeInSec)) < tol && offAt((w.openInSec + w.closeInSec) / 2) < 0,
    `open ${w.openInSec.toFixed(2)} s, close ${w.closeInSec.toFixed(2)} s`);
  check('the sure window starts and ends where the whole dot fits', w.sureOpenInSec !== null && w.sureCloseInSec !== null
    && Math.abs(sureAt(w.sureOpenInSec)) < tol && Math.abs(sureAt(w.sureCloseInSec)) < tol
    && w.sureOpenInSec > w.openInSec && w.sureCloseInSec < w.closeInSec);
  // Half-way through it the same LZ reads as open now.
  const mid = propagateConic(ship, MU, (w.openInSec + w.closeInSec) / 2);
  const now = computeDropSolution(input(mid, [zone])).windows[0]!;
  check('inside a window, it is open now (openInSec ≤ 0 < closeInSec) with the same length',
    now.openInSec <= 0 && now.closeInSec > 0 && Math.abs((now.closeInSec - now.openInSec) - (w.closeInSec - w.openInSec)) < 1e-3);
  check('the window\'s band flag and radius read the ship at its middle', w.inBand && Math.abs(w.launchRadius - 6500) < 1e-6);
}
{
  // Windows are sorted by when they open, and every LZ has one.
  const sol = computeDropSolution(input(circular(6000, 0), [lz('LZ-A', 20, 'wide'), lz('LZ-B', 140, 'wide'), lz('LZ-C', 260, 'wide')]));
  const sorted = sol.windows.every((w, i) => i === 0 || sol.windows[i - 1]!.openInSec <= w.openInSec);
  check('every LZ gets its window, sorted by openInSec', sol.windows.length === 3 && sorted, sol.windows.map((w) => `${w.lz} ${w.openInSec.toFixed(0)}`).join(', '));
}
{
  // A clockwise orbit is the CCW one mirrored: the dot and the windows mirror too (risk 18).
  const ccw = stateFromElements(5600, 0.08, 0.7, 1.1, MU);
  const cw: OrbitState = { x: ccw.x, y: -ccw.y, vx: ccw.vx, vy: -ccw.vy };
  const zones = [lz('LZ-A', 100, 'standard'), lz('LZ-B', 250, 'narrow')];
  const mirrored = zones.map((zone) => ({ ...zone, centreRad: wrap(-zone.centreRad) }));
  const a = computeDropSolution(input(ccw, zones));
  const b = computeDropSolution(input(cw, mirrored));
  const dotMirrors = Math.abs(wrap(a.dot!.rad + b.dot!.rad)) < 1e-9;
  const windowsMirror = a.windows.every((w, i) => {
    const m = b.windows[i]!;
    return m.lz === w.lz && Math.abs(m.openInSec - w.openInSec) < 1e-3 && Math.abs(m.closeInSec - w.closeInSec) < 1e-3;
  });
  const arcMirrors = a.arc.every((p, i) => Math.abs(p.x - b.arc[i]!.x) < 1e-6 && Math.abs(p.y + b.arc[i]!.y) < 1e-6);
  check('a retrograde orbit mirrors the dot, the arc and every window', dotMirrors && windowsMirror && arcMirrors);
  // The dot leads in the direction of travel: clockwise, it lies at a smaller angle than the ship.
  const shipAngle = Math.atan2(cw.y, cw.x);
  check('on a clockwise orbit the dot is ahead clockwise', wrap(b.dot!.rad - shipAngle) < 0, `${(wrap(b.dot!.rad - shipAngle) / DEG).toFixed(1)}°`);
}
{
  // On an ellipse each LZ is reached from its own launch radius, so each gets its own drop width (§10 risk 3).
  const ship = stateFromElements(5000, (8000 - 5000) / (8000 + 5000), 0, 0.2, MU);
  const sol = computeDropSolution(input(ship, [lz('LZ-A', 60, 'standard'), lz('LZ-B', 250, 'standard')]));
  const [first, second] = sol.windows;
  check('on an ellipse each LZ gets its own launch radius and drop width',
    first !== undefined && second !== undefined && Math.abs(first.launchRadius - second.launchRadius) > 500
      && Math.abs(first.halfWidthKm - second.halfWidthKm) > 10,
    sol.windows.map((w) => `${w.lz} r ${w.launchRadius.toFixed(0)} ±${w.halfWidthKm.toFixed(0)}`).join(', '));
  const outOfBand = computeDropSolution({ ...input(ship, [lz('LZ-A', 60, 'standard'), lz('LZ-B', 250, 'standard')]), ring: { min: 5000, max: 6000 } });
  check('a window launched from outside the band says so (inBand false)', outOfBand.windows.some((w) => !w.inBand) && outOfBand.windows.some((w) => w.inBand));
  // B1: a window that straddles a band edge reports exactly its in-band part (the window ∩ the band crossings), the same
  // radius test launchRefusal uses for "now".
  const zones = [lz('LZ-A', 60, 'standard'), lz('LZ-B', 250, 'standard')];
  const wide = computeDropSolution({ ...input(ship, zones), ring: { min: 1000, max: 20000 } }).windows[0]!;
  const rAt = (sec: number): number => { const at = propagateConic(ship, MU, sec); return Math.hypot(at.x, at.y); };
  const rOpen = rAt(wide.openInSec);
  const rClose = rAt(wide.closeInSec);
  const edge = (rOpen + rClose) / 2;
  const ring = rOpen < rClose ? { min: 1000, max: edge } : { min: edge, max: 20000 };
  const cut = computeDropSolution({ ...input(ship, zones), ring }).windows.find((w) => w.lz === wide.lz)!;
  check('a window straddling the band edge keeps only its in-band part',
    cut.inBandOpenInSec !== null && cut.inBandCloseInSec !== null
      && Math.abs(cut.inBandOpenInSec - wide.openInSec) < 1e-6 && cut.inBandCloseInSec < wide.closeInSec - 1
      && Math.abs(rAt(cut.inBandCloseInSec) - edge) < 0.5,
    `window ${wide.openInSec.toFixed(1)}–${wide.closeInSec.toFixed(1)} s, in band ${cut.inBandOpenInSec?.toFixed(1)}–${cut.inBandCloseInSec?.toFixed(1)} s, r ${rOpen.toFixed(0)}→${rClose.toFixed(0)}`);
  check('a window wholly in band has its whole length in band', wide.inBandOpenInSec === wide.openInSec && wide.inBandCloseInSec === wide.closeInSec);
}
{
  // τ is measured against the track's own periapsis: a near-circular orbit's noisy periapsis can't shift the windows.
  const ship = circular(6000, 33);
  const track = dotTrack(ship, MU, R, AIM);
  const later = propagateConic(ship, MU, 1234.5);
  // τ is a time since periapsis in [0, T): compare modulo the period.
  const dt = (((tauOf(track, later) - tauOf(track, ship)) % track.periodSec) + track.periodSec) % track.periodSec;
  check('tauOf advances with time on a circle (1,234.5 s later)', Math.abs(dt - 1234.5) < 1e-3, `${dt.toFixed(4)} s`);
  const direct = windowsFor(track, tauOf(track, later), [lz('LZ-A', 200, 'wide')], ONE, RING)[0]!;
  const fresh = computeDropSolution(input(later, [lz('LZ-A', 200, 'wide')])).windows[0]!;
  check('a cached track gives the same windows as a fresh solve', Math.abs(direct.openInSec - fresh.openInSec) < 1e-3);
}
{
  const sol = computeDropSolution({ ...input(circular(6000), [lz('LZ-A', 90, 'wide')]), solution: false });
  check('no Nav Plotter: NO DROP SOLUTION, no dot, no arc, no windows', sol.block === 'no-solution' && sol.dot === null && sol.arc.length === 0 && sol.windows.length === 0);
}
{
  // One full solve (the track included) stays cheap: drop-cache does it once per orbit, the windows at 10 Hz.
  const zones = [lz('LZ-A', 10, 'standard'), lz('LZ-B', 100, 'standard'), lz('LZ-C', 190, 'standard'), lz('LZ-D', 280, 'narrow')];
  const ship = stateFromElements(5200, 0.1, 0.4, 0.9, MU);
  computeDropSolution(input(ship, zones));
  const times: number[] = [];
  for (let i = 0; i < 15; i++) {
    const started = performance.now();
    computeDropSolution(input(ship, zones));
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  // The fastest run, not the median: the tier runs on every core at once, and load only ever adds time.
  const fastest = times[0]!;
  const median = times[Math.floor(times.length / 2)]!;
  check('one full drop solve (track and four windows) costs under 5 ms', fastest < 5,
    `fastest ${fastest.toFixed(2)} ms, median ${median.toFixed(2)} ms`);
}

finish();
