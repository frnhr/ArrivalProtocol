import type { OrbitState, PlanetParams, Ring } from '@/types/orbit';
import type { DecayState, DragKick, DropFactors, GoLowAim, GoLowerFit, LzState } from '@/types/landing';
import type { GameState } from '@state/schema';
import type { BurnPoint, Prediction } from '@systems/predict';
import { dropHalfWidthKm, podImpact, podKickFactorSq, podKickState } from '@systems/landing-solve';
import {
  elementsFromState, keplerConic, orbitalPeriod, positiveModulo, propagateConic, radialSigma, stateFromElements, timeFromPeriapsis,
  universalAnomaly,
} from '@/types/orbit';
import { IS_DEV } from '@/env';
import {
  DRAG_LINE_FRAC, DRAG_DV_MAX_KMS, DRAG_KICK_MIN_GAP_FRAC, DRAG_KICK_CATCH_UP_FRAC, GO_LOW_FLOOR_MARGIN_KM, LANDING_SURE_MIN_TAC,
  DROP_SOLVE_MAX_E, POD_AIM_RP_FRAC, LANDING_RELEASE_LEAD_TAC, DECAY_WARN_ORBITS,
} from '@data/tuning';

// The landing's orbit math (01-landing §3.7, slice-1b-plan §1.1, §1.4): the DRAG line and its kicks, the decay forecast,
// GO LOWER's target, its burn and its release, the one answer for "is a burn offered now", and the drop solver's domain.
// PURE: no store, no clock. orbit-sim writes the kicks and LandingState.decay, landing.ts the GO LOWER aim and the
// declined burn; pace, the guidance table (L2, L9, L10), the views and AUTOBURN v3 read the answers here.
//
// Imports: types, data/tuning, env and landing-solve only, and predict as TYPES ONLY. Never predict's values: predict
// reads this module (the 'go-low' and 'lift' burn points), and a value import back would close a load-order cycle
// (tests/unit/wp12/fix1/entries.test.ts loads every module first in a fresh process). NEVER landing-rules either:
// landing-rules (Track DROP) imports this module (goLowerFit for L9), so that edge must stay one-way. And landing-solve
// must never import this module back (computeDropSolution takes dropSolvable's answer as DropSolveInput.solvable).
//
// Track ORBIT owns this file.
//
// Seams named for later slices:
// • AUTOBURN v3 (slice 4) picks the landing orbit and holds it against decay: highestFittingRadius (GO LOWER's target is
//   its per-LZ case), the 'go-low' and 'lift' BurnPoints, decayForecast.
// • AUTODROP (4c): DropSolution.validUntilTSec (nextDragKick over a period), which windows to trust.
// • MERGE's blind drop (7) and SURVEY (6) read the drop factors and no-go arcs, not this module.

// --- Conic geometry the rules below share ------------------------------------------------------------------------------

const TWO_PI = 2 * Math.PI;

// [−π, π)
function wrapPi(angle: number): number {
  return positiveModulo(angle + Math.PI, TWO_PI) - Math.PI;
}

// +1 for counter-clockwise travel, −1 for clockwise (a strong RETRO at a far ▲ can reverse an orbit: landing-solve's
// risk 18).
export function travelSign(orbit: Readonly<OrbitState>): 1 | -1 {
  return orbit.x * orbit.vy - orbit.y * orbit.vx >= 0 ? 1 : -1;
}

// The radius of the conic through `orbit` at world angle `angle` (the polar form r = p / (1 + e·cos(θ − ω)), with ω the
// eccentricity vector's direction, so it holds for either direction of travel). Infinity where an open path never
// reaches that angle.
export function radiusAtAngle(orbit: Readonly<OrbitState>, mu: number, angle: number): number {
  const el = elementsFromState(orbit, mu);
  const h = orbit.x * orbit.vy - orbit.y * orbit.vx;
  const denominator = 1 + el.e * Math.cos(angle - el.omega);
  return denominator > 0 ? (h * h) / mu / denominator : Infinity;
}

// Mean anomaly of true anomaly ν (measured along the travel), in [0, 2π).
function meanAnomalyOf(nu: number, e: number): number {
  const ecc = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  return positiveModulo(ecc - e * Math.sin(ecc), TWO_PI);
}

// Game seconds until the ship on the closed loop through `orbit` next reaches world angle `angle`, in [0, period).
// GO LOWER's ◇ is an orbit angle, not an apsis (predict's 'point' burn).
export function timeToAngle(orbit: Readonly<OrbitState>, mu: number, angle: number): number {
  const el = elementsFromState(orbit, mu);
  if (!(el.e < 1)) throw new Error(`timeToAngle: not a closed loop (e = ${el.e})`);
  const sign = travelSign(orbit);
  const period = orbitalPeriod(keplerConic(orbit, mu, el));
  const nuNow = sign * el.nu;
  const nuThere = sign * wrapPi(angle - el.omega);
  return (positiveModulo(meanAnomalyOf(nuThere, el.e) - meanAnomalyOf(nuNow, el.e), TWO_PI) / TWO_PI) * period;
}

// The ship after a retrograde Δv of `dvKmS` (a drag kick; GO LOWER's burn as an impulse).
export function retroKicked(orbit: Readonly<OrbitState>, dvKmS: number): OrbitState {
  const speed = Math.hypot(orbit.vx, orbit.vy);
  if (!(speed > 0)) throw new Error('retroKicked: the ship is at rest');
  const k = 1 - dvKmS / speed;
  return { x: orbit.x, y: orbit.y, vx: orbit.vx * k, vy: orbit.vy * k };
}

// --- The DRAG line and the kicks ---------------------------------------------------------------------------------------

// The DRAG line (§3.7): a dashed circle at the sweet zone's lower edge. Below it each ▼ takes a drag kick.
export function dragLineKm(ring: Readonly<Ring>): number {
  return ring.min + DRAG_LINE_FRAC * (ring.max - ring.min);
}

// A drag kick's retrograde Δv at a ▼ of `rpKm`, km/s (§3.7): DRAG_DV_MAX_KMS × (line − rp) / (line − ring.min), 0 at or
// above the line. Capped at DRAG_DV_MAX_KMS once ▼ is under the band (the name's promise: the most a kick takes), so an
// orbit sinking out of the band keeps sinking at a felt rate, not an ever faster one.
export function dragDvKmS(rpKm: number, ring: Readonly<Ring>): number {
  const line = dragLineKm(ring);
  if (!(rpKm < line)) return 0;
  return DRAG_DV_MAX_KMS * Math.min(1, (line - rpKm) / (line - ring.min));
}

// The kick at the ship's state `at` (game time `atTSec`), or null when its conic's ▼ is not below the DRAG line: the Δv
// from that ▼, where it happens, and the far side's move for the stamp. The far side is the point opposite the kick (at
// ▼ that is ▲); a strong kick turns its own point into ▲, and the stamp then names the far side ▼. An open path takes no
// kick (decay is a loop's: a burn that opened it this tick is the flight's rows' business).
export function dragKickAt(at: Readonly<OrbitState>, mu: number, ring: Readonly<Ring>, atTSec: number): DragKick | null {
  const el = elementsFromState(at, mu);
  if (!(el.e < 1)) return null;
  const rpKm = el.rp;
  const dvKmS = dragDvKmS(rpKm, ring);
  if (!(dvKmS > 0)) return null;
  const rad = Math.atan2(at.y, at.x);
  const after = retroKicked(at, dvKmS);
  const farBefore = radiusAtAngle(at, mu, rad + Math.PI);
  const farAfter = radiusAtAngle(after, mu, rad + Math.PI);
  const kickAtPeri = Math.cos(rad - elementsFromState(after, mu).omega) >= 0;
  return { atTSec, rpKm, dvKmS, rad, apsis: kickAtPeri ? '▲' : '▼', dropKm: farBefore - farAfter };
}

// A kick this share of a period short of DRAG_KICK_MIN_GAP_FRAC still counts (plan §1.4's gap). A strong kick turns its ▼
// into ▲, so the next ▼ is the far side, exactly half an orbit on; under CRUISE the kick lands at the first sub-step
// boundary after its ▼ (up to SIM_SUBSTEP_MAX_SEC late), and that half orbit, measured from the late kick, must not round
// under the gap and lose a kick a SKIP's exact split would keep. 0.1 is still far above the noise the gap is for: a
// near-circular ▼ wobbling back across a tick boundary moments after its kick.
const KICK_GAP_SLACK_FRAC = 0.1;

// The game seconds a kick must follow the last one by, on a loop of `periodSec`.
function kickGapSec(periodSec: number): number {
  return (DRAG_KICK_MIN_GAP_FRAC - KICK_GAP_SLACK_FRAC) * periodSec;
}

// The next kick due in (fromTSec, toTSec] on the conic through `orbit` (at fromTSec), or null (plan §1.4): at the conic's
// next ▼ while rp < the DRAG line, no sooner than DRAG_KICK_MIN_GAP_FRAC of a period after decay.lastKickTSec, and a
// kick still owed DRAG_KICK_CATCH_UP_FRAC periods after the last is due at once. The coast loops (orbit-sim
// coastWithKicks): coast to the kick, apply it, ask again from the new conic. ARES-VII (drag false) never asks.
// The kick is worked out at the state the conic reaches then (propagateConic): a SKIP's exact split applies it as is; the
// sub-stepped tick applies it at its first sub-step boundary at or after atTSec, from the state there (dragKickAt).
export function nextDragKick(
  orbit: Readonly<OrbitState>, mu: number, ring: Readonly<Ring>, fromTSec: number, toTSec: number, decay: Readonly<DecayState>,
): DragKick | null {
  const el = elementsFromState(orbit, mu);
  if (!(el.e < 1) || !(el.rp < dragLineKm(ring))) return null;
  const conic = keplerConic(orbit, mu, el);
  const period = orbitalPeriod(conic);
  const sinceRp = timeFromPeriapsis(conic, universalAnomaly(conic, Math.hypot(orbit.x, orbit.y), radialSigma(orbit, mu)));
  let at = fromTSec + positiveModulo(-sinceRp, period);
  const last = decay.lastKickTSec;
  if (last !== null) {
    while (at - last < kickGapSec(period)) at += period;
    // A ▼ stepped over or wobbling under the gap: owed at once, so decay never stops quietly.
    const owed = last + DRAG_KICK_CATCH_UP_FRAC * period;
    if (owed < at) at = Math.max(fromTSec, owed);
  }
  if (at > toTSec) return null;
  return dragKickAt(propagateConic(orbit, mu, at - fromTSec), mu, ring, at);
}

// The decay state after `kick` (orbit-sim writes it with orbitEpoch in one update). Dev: at most one kick per gap (plan
// §1.4's assertion), on the loop the kick was applied to (`periodSec`).
export function decayAfter(decay: Readonly<DecayState>, kick: Readonly<DragKick>, periodSec: number): DecayState {
  if (IS_DEV && decay.lastKickTSec !== null && kick.atTSec - decay.lastKickTSec < kickGapSec(periodSec) - 1e-6) {
    throw new Error(`decayAfter: a kick ${kick.atTSec - decay.lastKickTSec} s after the last (the gap is ${kickGapSec(periodSec)} s)`);
  }
  return { lastKickTSec: kick.atTSec, kicks: decay.kicks + 1, last: { ...kick } };
}

// What decay will do to the orbit through `orbit` if nobody burns (closed-form, cheap): the whole orbits until ▼ leaves
// the band (null: it never does, ▼ at or above the DRAG line, or no drag on this ship; 0: ▼ is under the band already),
// the next kick's Δv, and whether `orbitsToLeave` is only a lower bound (past FORECAST_MAX_KICKS: the chip says `N+`).
export interface DecayForecast {
  orbitsToLeave: number | null;
  nextDvKmS: number;
  lowerBound: boolean;
}

// The decay thresholds, named in one place (review nit): the warning (L10, L9's GO LOWER held back, the chip's urgent
// look, the 'lift' burn) comes when decay takes ▼ out of the band within DECAY_WARN_ORBITS orbits, unrounded; the lift's
// ▲ half is planned from twice that (predict landingInRingBurn: the warning comes when ▲ has mostly sunk already).
export function decayWarned(orbitsToLeave: number | null): boolean {
  return orbitsToLeave !== null && orbitsToLeave <= DECAY_WARN_ORBITS;
}

export function decayLiftAhead(orbitsToLeave: number | null): boolean {
  return orbitsToLeave !== null && orbitsToLeave <= 2 * DECAY_WARN_ORBITS;
}

// Kicks the forecast follows at most: a ▼ just under the line takes kicks of a few cm/s for hundreds of orbits, far past
// DECAY_WARN_ORBITS; the band is left within a handful whenever it matters. Past it the forecast is a lower bound.
const FORECAST_MAX_KICKS = 200;

// The kicks as impulses on the loop's (▼, ▲), in time: a kick at ▼ lowers the far side, and a strong one turns its own
// point into ▲ (the next ▼ is then half an orbit on, else a whole one). `orbitsToLeave` is the time until the kick that
// takes ▼ under ring.min, in periods of the loop as it is now (0: ▼ is already under the band). Not a whole number: the
// strip rounds it up (`out of the band in 2 orbits`).
export function decayForecast(orbit: Readonly<OrbitState>, mu: number, ring: Readonly<Ring>, drag: boolean): DecayForecast {
  const el = elementsFromState(orbit, mu);
  if (!drag || !(el.e < 1)) return { orbitsToLeave: null, nextDvKmS: 0, lowerBound: false };
  const nextDvKmS = dragDvKmS(el.rp, ring);
  if (!(nextDvKmS > 0)) return { orbitsToLeave: null, nextDvKmS, lowerBound: false };
  if (el.rp < ring.min) return { orbitsToLeave: 0, nextDvKmS, lowerBound: false };
  const conic = keplerConic(orbit, mu, el);
  const periodNow = orbitalPeriod(conic);
  const sinceRp = timeFromPeriapsis(conic, universalAnomaly(conic, Math.hypot(orbit.x, orbit.y), radialSigma(orbit, mu)));
  let elapsed = positiveModulo(-sinceRp, periodNow);
  let rp = el.rp;
  let ra = (el.rp * (1 + el.e)) / (1 - el.e);
  for (let kick = 0; kick < FORECAST_MAX_KICKS; kick++) {
    const dv = dragDvKmS(rp, ring);
    if (!(dv > 0)) return { orbitsToLeave: null, nextDvKmS, lowerBound: false };
    const speed = Math.sqrt(mu * (2 / rp - 2 / (rp + ra))) - dv;
    const inverseA = 2 / rp - (speed * speed) / mu;
    if (!(inverseA > 0)) throw new Error(`decayForecast: a ${dv} km/s kick opened the loop`);
    const far = 2 / inverseA - rp;
    const turned = far < rp;
    ra = Math.max(rp, far);
    rp = Math.min(rp, far);
    if (rp < ring.min) return { orbitsToLeave: elapsed / periodNow, nextDvKmS, lowerBound: false };
    const period = TWO_PI * Math.sqrt(Math.pow((rp + ra) / 2, 3) / mu);
    elapsed += turned ? period / 2 : period;
  }
  // Still in the band after FORECAST_MAX_KICKS: at least this long (a lower bound, far past any warning), not "never".
  return { orbitsToLeave: elapsed / periodNow, nextDvKmS, lowerBound: true };
}

// --- GO LOWER (§3.7) ---------------------------------------------------------------------------------------------------

// THE shared primitive of GO LOWER and AUTOBURN v3 (foundation review): the sure window, in tactical s, of `lz` for a
// pod launched at `radiusKm` with the ship moving at `speedKmS` and the next pod's `factors`. The whole dot (± s,
// landing-solve dropHalfWidthKm) fits while its centre is within (half-width − s) of the bracket's centre, and the dot
// sweeps the surface at the ship's angular rate (speedKmS / radiusKm, exact on a circle, where the pod's lead angle is
// constant; past an ellipse's ▼ goLowerFit passes dotSweepAtPeri × r instead). 0 when the dot never fits. Closed form.
// The pod's lead angle shrinks with altitude (§3.3: 88° from 9,000 km, 70° from 5,000), so after a GO LOWER burn the true
// launch point moves on a little; engine-landing.test checks the 4 s against the re-solved window.
export function sureTacAt(
  radiusKm: number, speedKmS: number, lz: Readonly<LzState>, factors: Readonly<DropFactors>, R: number, warp: number,
): number {
  if (!(radiusKm > R && speedKmS > 0 && warp > 0)) throw new Error(`sureTacAt: radius ${radiusKm}, speed ${speedKmS}, warp ${warp}`);
  const roomKm = lz.widthKm / 2 - dropHalfWidthKm(radiusKm, R, factors);
  if (roomKm <= 0) return 0;
  const sweepRadPerSec = speedKmS / radiusKm;
  return ((2 * roomKm) / R / sweepRadPerSec) / warp;
}

// Steps of the scan from the top of a radius range down (highestRadius), then halvings between the last miss and the
// first fit: up to 40 + 40 sureTacAt calls. goLowerFit judges each with dotSweepAtPeri (two pod impacts), so one call
// costs 0.26–0.40 ms (review p2: ARES-VII, LZs 330 / 250 / 180 km wide); L9 asks once a director frame (landing.ts reuses
// its answer, TooWide.goLower), with no memo.
const RADIUS_SCAN_STEPS = 40;
const RADIUS_BISECT_STEPS = 40;

// The highest radius in [lo, hi] where `fits` holds, scanning down from hi (the sure window is not monotonic in the
// radius: a lower launch narrows the dot but sweeps it faster), or null where it holds nowhere on the scan.
function highestRadius(lo: number, hi: number, fits: (radiusKm: number) => boolean): number | null {
  if (fits(hi)) return hi;
  let miss = hi;
  for (let i = 1; i <= RADIUS_SCAN_STEPS; i++) {
    const r = hi - ((hi - lo) * i) / RADIUS_SCAN_STEPS;
    if (!fits(r)) { miss = r; continue; }
    let fit = r;
    for (let j = 0; j < RADIUS_BISECT_STEPS; j++) {
      const mid = (fit + miss) / 2;
      if (fits(mid)) fit = mid; else miss = mid;
    }
    return fit;
  }
  return null;
}

// True anomaly either side of ▼ the dot's sweep is differenced over (dotSweepAtPeri): about a sure window's span.
const SWEEP_PROBE_NU = 0.01;

// How fast the drop dot sweeps the surface, rad per game s, as the ship passes ▼ of the loop ▼ `rpKm` × ▲ `raKm`: the
// ship's angular rate plus how fast the pod's lead angle grows there. On a circle the lead is constant and this is v / r;
// past an ellipse's ▼ the ship turns from falling to climbing, and a pod let go while climbing flies further, so the dot
// runs ahead faster (measured: sureTacAt with v / r promised 4.0 s where the re-solved window gave 3.2). Closed form:
// two pod impacts (landing-solve podKickState and podImpact), no dotTrack.
export function dotSweepAtPeri(rpKm: number, raKm: number, mu: number, R: number): number {
  const lo = Math.min(rpKm, raKm);
  const hi = Math.max(rpKm, raKm);
  const e = (hi - lo) / (hi + lo);
  const aimRp = POD_AIM_RP_FRAC * R;
  const nu0 = rpKm <= raKm ? 0 : Math.PI;
  const dotAt = (nu: number): number => podImpact(podKickState(stateFromElements(lo, e, 0, nu, mu), mu, aimRp), mu, R).rad;
  const sweep = wrapPi(dotAt(nu0 + SWEEP_PROBE_NU) - dotAt(nu0 - SWEEP_PROBE_NU));
  const period = TWO_PI * Math.sqrt(Math.pow((lo + hi) / 2, 3) / mu);
  const dt = (positiveModulo(meanAnomalyOf(nu0 + SWEEP_PROBE_NU, e) - meanAnomalyOf(nu0 - SWEEP_PROBE_NU, e), TWO_PI) / TWO_PI) * period;
  return sweep / dt;
}

// Everything goLowerFit reads: the awaited LZ, the next pod's drop factors, the band, the planet, the landing's tactical
// warp (the sure window is judged in tactical s), the ship now, the ship's world angle at the LZ's launch point
// (LzWindow.launchRad of the awaited window), and the Δv the tank holds (FUEL × the budget).
export interface GoLowerInput {
  lz: Readonly<LzState>;
  factors: Readonly<DropFactors>;
  ring: Readonly<Ring>;
  R: number;
  mu: number;
  warp: number;
  orbit: Readonly<OrbitState>;
  launchRad: number;
  fuelDvKmS: number;
}

// The fit's shape lives in types/landing.ts (TooWide carries it).
export type { GoLowerFit };

// FROZEN INTERFACE between Track DROP (L9 calls it: `goLower = goLowerFit(...) !== null`) and Track ORBIT (implements it;
// landing.ts builds GoLowAim from the same call), so L9's "or fly lower" and the burn the strip times always agree.
// null: even the floor can't fit the LZ's dot (L9 names the REPAIR alone), the launch point already gives the LZ its
// LANDING_SURE_MIN_TAC (nothing to go lower for), or the tank can't pay for the burn (review minor 1: L9 said `fly lower`
// on an empty tank; the burn's Δv is goLowDvKmS at its point, as predict's 'go-low' BurnPoint prices it, so L9's offer
// and landingBurnOffer's fuelShort agree).
// The burn is RETRO half an orbit before launchRad, so the launch point becomes the new ▼ and the burn point (its radius
// now, `far`) the new ▲: the ship passes the launch point at ▼'s speed of that loop, which sureTacAt is judged with. The
// target is the HIGHEST such radius with LANDING_SURE_MIN_TAC (the least burn, the least FUEL), else the floor when the
// floor still fits the dot at all (the spec's "or ▼ is 100 km above the band floor").
// Defined through sureTacAt, as highestFittingRadius is: GO LOWER is AUTOBURN v3's one-LZ case by construction. Closed
// form: L9 calls it every director frame, and no landing-solve dotTrack runs inside the scan.
export function goLowerFit(input: Readonly<GoLowerInput>): GoLowerFit | null {
  const { lz, factors, ring, R, mu, warp, orbit, launchRad, fuelDvKmS } = input;
  if (!(fuelDvKmS > 0)) return null;
  const floorKm = ring.min + GO_LOW_FLOOR_MARGIN_KM;
  const top = Math.min(radiusAtAngle(orbit, mu, launchRad), ring.max);
  const far = radiusAtAngle(orbit, mu, launchRad + Math.PI);
  if (!(top > floorKm) || !Number.isFinite(far)) return null;
  const sure = (radiusKm: number): number =>
    sureTacAt(radiusKm, dotSweepAtPeri(radiusKm, far, mu, R) * radiusKm, lz, factors, R, warp);
  if (sure(top) >= LANDING_SURE_MIN_TAC) return null;
  const target = highestRadius(floorKm, top, (radiusKm) => sure(radiusKm) >= LANDING_SURE_MIN_TAC);
  const fit = target !== null ? { targetRadiusKm: target, floorKm, sureTacAtTarget: sure(target) } : (() => {
    const best = widestRadius(floorKm, top, sure);
    return best.sure > 0 ? { targetRadiusKm: best.radiusKm, floorKm, sureTacAtTarget: best.sure } : null;
  })();
  if (fit === null) return null;
  const atBurn = propagateConic(orbit, mu, timeToAngle(orbit, mu, launchRad - Math.PI * travelSign(orbit)));
  return goLowDvKmS(atBurn, launchRad, fit.targetRadiusKm, mu) <= fuelDvKmS ? fit : null;
}

// Halvings of the bracket around the scan's best radius (widestRadius).
const WIDEST_REFINE_STEPS = 30;

// The radius in [lo, hi] with the widest sure window, when none reaches LANDING_SURE_MIN_TAC (Track ORBIT's deviation
// from §3.7's "or ▼ is 100 km above the band floor"): lower is NOT always wider. The dot narrows by 30 km per 1,000 km
// of altitude, but past a deep ▼ it also sweeps faster (dotSweepAtPeri), and from about 1,500 km above the floor down the
// sweep wins: measured on ARES-VII from 8,500 km, the re-solved sure window was 3.28 s at 5,800 km and 3.14 s at the
// floor. Aiming there also keeps a slow release (1.2 s) in the band. A scan, then a ternary search between the best
// sample's neighbours.
function widestRadius(lo: number, hi: number, sure: (radiusKm: number) => number): { radiusKm: number; sure: number } {
  const step = (hi - lo) / RADIUS_SCAN_STEPS;
  let bestI = 0;
  let bestSure = -Infinity;
  for (let i = 0; i <= RADIUS_SCAN_STEPS; i++) {
    const value = sure(hi - step * i);
    if (value > bestSure) { bestSure = value; bestI = i; }
  }
  let a = Math.max(lo, hi - step * (bestI + 1));
  let b = Math.min(hi, hi - step * (bestI - 1));
  for (let i = 0; i < WIDEST_REFINE_STEPS; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (sure(m1) < sure(m2)) a = m1; else b = m2;
  }
  const radiusKm = (a + b) / 2;
  const refined = sure(radiusKm);
  return refined >= bestSure ? { radiusKm, sure: refined } : { radiusKm: hi - step * bestI, sure: bestSure };
}

// AUTOBURN v3's seam (slice 4): the highest launch radius at which every LZ in `lzs` gets a sure window of at least
// LANDING_SURE_MIN_TAC with `factors`, from a circular orbit inside `ring`; null when none does. GO LOWER's target is its
// one-LZ case: both are defined through sureTacAt (and the same scan), never dotTrack.
export function highestFittingRadius(
  lzs: readonly LzState[], factors: Readonly<DropFactors>, ring: Readonly<Ring>, R: number, mu: number, warp: number,
): number | null {
  if (lzs.length === 0) return null;
  const fits = (radiusKm: number): boolean =>
    lzs.every((lz) => sureTacAt(radiusKm, Math.sqrt(mu / radiusKm), lz, factors, R, warp) >= LANDING_SURE_MIN_TAC);
  return highestRadius(ring.min, ring.max, fits);
}

// GO LOWER's RETRO Δv, km/s, for the ship at its burn point (`atBurn`, half an orbit before `launchRad`; or the ship now
// while the burn is due): by bisection on the retro Δv until the radius at launchRad on the new conic is
// `targetRadiusKm` (predict's 'go-low' BurnPoint.dvKmS). 0 when that radius is already at or under the target.
export function goLowDvKmS(atBurn: Readonly<OrbitState>, launchRad: number, targetRadiusKm: number, mu: number): number {
  if (!(radiusAtAngle(atBurn, mu, launchRad) > targetRadiusKm)) return 0;
  let lo = 0;
  let hi = Math.hypot(atBurn.vx, atBurn.vy) / 2;
  if (radiusAtAngle(retroKicked(atBurn, hi), mu, launchRad) > targetRadiusKm) {
    throw new Error(`goLowDvKmS: half the speed off does not bring the launch point to ${targetRadiusKm.toFixed(0)} km`);
  }
  for (let i = 0; i < RADIUS_BISECT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (radiusAtAngle(retroKicked(atBurn, mid), mu, launchRad) > targetRadiusKm) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// How fast the radius at aim.launchRad moves under the thrust delivered now, km per GAME second (− lowers it): a one-step
// difference of the conic along the ship's heading, as predict's rpRateUnderThrust is for ▼. `accelKmS2` is the
// delivered acceleration (0: no thrust, rate 0).
export function launchRadiusRate(
  orbit: Readonly<OrbitState>, mu: number, launchRad: number, accelKmS2: number, heading: number, probeSec: number,
): number {
  if (!(accelKmS2 > 0)) return 0;
  const kick = accelKmS2 * probeSec;
  const pushed = { ...orbit, vx: orbit.vx + kick * Math.cos(heading), vy: orbit.vy + kick * Math.sin(heading) };
  return (radiusAtAngle(pushed, mu, launchRad) - radiusAtAngle(orbit, mu, launchRad)) / probeSec;
}

// The held aim is done (RELEASE): the radius at aim.launchRad on the live conic, projected LANDING_RELEASE_LEAD_TAC ahead
// at `rateKmPerTac` (how fast that radius moves under the thrust delivered now, km per tactical s; F6's rule with its own
// lead, see tuning.ts), is at or below aim.targetRadiusKm or aim.floorKm, or ▼ itself is at or below the floor (an
// eccentric loop whose ▼ is not at the launch point: the band's hard stop holds anyway).
export function goLowReleased(orbit: Readonly<OrbitState>, mu: number, aim: Readonly<GoLowAim>, rateKmPerTac: number): boolean {
  const projected = radiusAtAngle(orbit, mu, aim.launchRad) + Math.min(0, rateKmPerTac) * LANDING_RELEASE_LEAD_TAC;
  return projected <= aim.targetRadiusKm || projected <= aim.floorKm || elementsFromState(orbit, mu).rp <= aim.floorKm;
}

// --- The burn offer and the solver's domain ----------------------------------------------------------------------------

// Which burn a burn point is for the decline (DeclinedBurn.key): its reason and the event it is centred on, plus the LZ
// for go-low. Not predict burnKey: its due|ahead part flips as the apsis passes, so the next pass's replan of the burn the
// kid just declined would not match and be offered again (flight-events keys its beeps the same way).
export function declineKey(burnPoint: Readonly<Pick<BurnPoint, 'reason' | 'event' | 'aimLz'>>): string {
  const base = `${burnPoint.reason}|${burnPoint.event}`;
  return burnPoint.reason === 'go-low' ? `${base}|${burnPoint.aimLz ?? ''}` : base;
}

// The burns the landing may never decline: an open path's capture or missed ▼. Everything else (a ring trim, GO LOWER,
// the 'lift' burn) is the kid's choice. (No shrink is planned in landing: predict gives a too-big loop its ring trim.)
function safetyBurn(reason: BurnPoint['reason']): boolean {
  return reason === 'capture' || reason === 'missed';
}

// The burn the landing offers now (plan §1.4), or null: the ONE answer read by pace (TACTICAL, the SKIP's stop), L2's
// lead (FlightContext.offer in landing; FlightContext.burnPoint stays the raw plan, which the flight rows need on an open
// path), the START BURN marker, the countdown chip, the beeps and HOLLOW's projected drain. The plan's burn point while the
// landing goes on (and the ship is in orbit), when:
// • its reason is 'capture' or 'missed': safety burns (an open path in landing), always
//   offered and never declinable;
// • or 'go-low', 'lift', or a ring trim the tank pays for (!pred.fuelShort; a trim also not after ACCEPT ORBIT's latch,
//   burn.acceptOnly), and it is not the burn the kid declined (state.landing.declined.key === declineKey(bp)).
// A go-low or lift the tank can't pay for in full is NOT offered (ORBIT's decision, foundation note): half a GO LOWER
// leaves the dot still too wide and half a lift still sinks, so the strip would time a burn that buys nothing. Without
// the offer neither pace nor L2 pulls the kid to it; the plan's own row still names it where L2 leads anyway.
export function landingBurnOffer(state: Readonly<GameState>, pred: Readonly<Prediction>): BurnPoint | null {
  if (state.run.phase !== 'landing' || state.landing.ended !== null) return null;
  if (state.burn.status !== 'locked' && state.burn.status !== 'accepted') return null;
  const burnPoint = pred.burnPoint;
  if (burnPoint === null) return null;
  if (safetyBurn(burnPoint.reason)) return burnPoint;
  if (pred.fuelShort) return null;
  const ringTrim = burnPoint.reason !== 'go-low' && burnPoint.reason !== 'lift';
  if (ringTrim && state.burn.acceptOnly) return null;
  if (state.landing.declined?.key === declineKey(burnPoint)) return null;
  return burnPoint;
}

// The drop solver's domain (risk 9): a closed orbit with e < DROP_SOLVE_MAX_E, ▼ above the atmosphere, and the pod's kick
// solvable at the sampled ▲ and ▼. Outside it computeDropSolution returns the empty solution (no dot, no windows) and
// L2's flight rows lead, instead of podKickState or dotTrack throwing on an orbit the open engine can now reach.
export function dropSolvable(orbit: Readonly<OrbitState>, planet: Readonly<PlanetParams>): boolean {
  if (orbit.x * orbit.vy - orbit.y * orbit.vx === 0) return false;
  const el = elementsFromState(orbit, planet.mu);
  if (!(el.e < DROP_SOLVE_MAX_E) || !(el.rp > planet.rAtm)) return false;
  const aimRp = POD_AIM_RP_FRAC * planet.R;
  return [0, Math.PI].every((nu) => podKickFactorSq(stateFromElements(el.rp, el.e, el.omega, nu, planet.mu), planet.mu, aimRp) !== null);
}
