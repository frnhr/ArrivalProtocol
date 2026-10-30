import type { OrbitState, PlanetParams, Ring } from '@/types/orbit';
import type { DecayState, DragKick, DropFactors, GoLowAim, LzState } from '@/types/landing';
import type { GameState } from '@state/schema';
import type { BurnPoint, Prediction } from '@systems/predict';
import { DRAG_LINE_FRAC } from '@data/tuning';

// The landing's orbit math (01-landing §3.7, slice-1b-plan §1.1, §1.4): the DRAG line and its kicks, the decay forecast,
// GO LOWER's target, its burn and its release, the one answer for "is a burn offered now", and the drop solver's domain.
// PURE: no store, no clock. orbit-sim writes the kicks and LandingState.decay, landing.ts the GO LOWER aim and the
// declined burn; pace, the guidance table (L2, L9, L10), the views and AUTOBURN v3 read the answers here.
//
// Imports: types, data/tuning and landing-solve only, and predict as TYPES ONLY. Never predict's values: predict reads
// this module (the 'go-low' and 'lift' burn points), and a value import back would close a load-order cycle
// (tests/unit/wp12/fix1/entries.test.ts loads every module first in a fresh process).
//
// Track ORBIT owns this file. The foundation laid down the final signatures; every body below that says
// TODO(slice1b-ORBIT) returns its neutral value (no kick, no forecast, no fit, no offer), so nothing changes behaviour
// until ORBIT fills it.
//
// Seams named for later slices:
// • AUTOBURN v3 (slice 4) picks the landing orbit and holds it against decay: highestFittingRadius (GO LOWER's target is
//   its per-LZ case), the 'go-low' and 'lift' BurnPoints, decayForecast.
// • AUTODROP (4c): DropSolution.validUntilTSec (nextDragKick over a period), which windows to trust.
// • MERGE's blind drop (7) and SURVEY (6) read the drop factors and no-go arcs, not this module.

// --- The DRAG line and the kicks ---------------------------------------------------------------------------------------

// The DRAG line (§3.7): a dashed circle at the sweet zone's lower edge. Below it each ▼ takes a drag kick.
export function dragLineKm(ring: Readonly<Ring>): number {
  return ring.min + DRAG_LINE_FRAC * (ring.max - ring.min);
}

// A drag kick's retrograde Δv at a ▼ of `rpKm`, km/s (§3.7): DRAG_DV_MAX_KMS × (line − rp) / (line − ring.min), 0 at or
// above the line.
export function dragDvKmS(_rpKm: number, _ring: Readonly<Ring>): number {
  // TODO(slice1b-ORBIT): the kick's Δv.
  return 0;
}

// The next kick due in (fromTSec, toTSec] on the conic through `orbit` (at fromTSec), or null (plan §1.4): at the conic's
// next ▼ while rp < the DRAG line, no sooner than DRAG_KICK_MIN_GAP_FRAC of a period after decay.lastKickTSec, and a
// kick still owed DRAG_KICK_CATCH_UP_FRAC periods after the last is due at once. The coast loops (orbit-sim
// coastWithKicks): coast to the kick, apply it, ask again from the new conic. ARES-VII (drag false) never asks.
export function nextDragKick(
  _orbit: Readonly<OrbitState>, _mu: number, _ring: Readonly<Ring>, _fromTSec: number, _toTSec: number, _decay: Readonly<DecayState>,
): DragKick | null {
  // TODO(slice1b-ORBIT): the kick timing rule.
  return null;
}

// What decay will do to the orbit through `orbit` if nobody burns (closed-form, cheap): the whole orbits until ▼ leaves
// the band (null: it never does, ▼ at or above the DRAG line, or no drag on this ship), and the next kick's Δv.
export interface DecayForecast {
  orbitsToLeave: number | null;
  nextDvKmS: number;
}

export function decayForecast(_orbit: Readonly<OrbitState>, _mu: number, _ring: Readonly<Ring>, _drag: boolean): DecayForecast {
  // TODO(slice1b-ORBIT): the forecast (L10, the 'lift' burn, the decay chip).
  return { orbitsToLeave: null, nextDvKmS: 0 };
}

// --- GO LOWER (§3.7) ---------------------------------------------------------------------------------------------------

// Everything goLowerFit reads: the awaited LZ, the next pod's drop factors, the band, the planet, the landing's tactical
// warp (the sure window is judged in tactical s), the ship now, and the ship's world angle at the LZ's launch point
// (LzWindow.launchRad of the awaited window).
export interface GoLowerInput {
  lz: Readonly<LzState>;
  factors: Readonly<DropFactors>;
  ring: Readonly<Ring>;
  R: number;
  mu: number;
  warp: number;
  orbit: Readonly<OrbitState>;
  launchRad: number;
}

// The radius at launchRad where the sure window reaches LANDING_SURE_MIN_TAC (`targetRadiusKm`, never below `floorKm`,
// ring.min + GO_LOW_FLOOR_MARGIN_KM), and the sure tactical s it gives there.
export interface GoLowerFit {
  targetRadiusKm: number;
  floorKm: number;
  sureTacAtTarget: number;
}

// FROZEN INTERFACE between Track DROP (L9 calls it: `goLower = goLowerFit(...) !== null`) and Track ORBIT (implements it;
// landing.ts builds GoLowAim from the same call), so L9's "or fly lower" and the burn the strip times always agree.
// null: even the floor can't fit the LZ's dot, so L9 names the REPAIR alone.
export function goLowerFit(_input: Readonly<GoLowerInput>): GoLowerFit | null {
  // TODO(slice1b-ORBIT): the target radius (until then L9 is repair-only).
  return null;
}

// AUTOBURN v3's seam (slice 4): the highest launch radius at which every LZ in `lzs` gets a sure window of at least
// LANDING_SURE_MIN_TAC with `factors`, inside `ring`; null when none does. GO LOWER's target is its one-LZ case.
export function highestFittingRadius(
  _lzs: readonly LzState[], _factors: Readonly<DropFactors>, _ring: Readonly<Ring>, _R: number, _mu: number, _warp: number,
): number | null {
  // TODO(slice1b-ORBIT): shared with goLowerFit.
  return null;
}

// GO LOWER's RETRO Δv, km/s, for the ship at its burn point (`atBurn`, half an orbit before `launchRad`): by bisection on
// the retro Δv until the radius at launchRad on the new conic is `targetRadiusKm` (predict's 'go-low' BurnPoint.dvKmS).
export function goLowDvKmS(_atBurn: Readonly<OrbitState>, _launchRad: number, _targetRadiusKm: number, _mu: number): number {
  // TODO(slice1b-ORBIT): the bisection.
  return 0;
}

// The held aim is done (RELEASE): the radius at aim.launchRad on the live conic, projected RELEASE_LEAD_TAC ahead at
// `rateKmPerTac` (how fast that radius moves under the thrust delivered now, km per tactical s; F6's rule), is at or
// below aim.targetRadiusKm, or at or below aim.floorKm.
export function goLowReleased(_orbit: Readonly<OrbitState>, _mu: number, _aim: Readonly<GoLowAim>, _rateKmPerTac: number): boolean {
  // TODO(slice1b-ORBIT): the release rule (no aim is ever held until landing.ts builds one).
  return false;
}

// --- The burn offer and the solver's domain ----------------------------------------------------------------------------

// The burn the landing offers now (plan §1.4), or null: the ONE answer read by pace (TACTICAL, the SKIP's stop), L2
// (FlightContext.burnPoint in landing), the START BURN marker, the countdown chip and the beeps. The plan's burn point
// while the landing goes on, when its reason is 'go-low', 'lift', or a ring trim the tank pays for (!pred.fuelShort, not
// acceptOnly), and it is not the burn the kid declined (state.landing.declined, by burnKey).
export function landingBurnOffer(_state: Readonly<GameState>, _pred: Readonly<Prediction>): BurnPoint | null {
  // TODO(slice1b-ORBIT): the offer.
  return null;
}

// The drop solver's domain (risk 9): a closed orbit with e < DROP_SOLVE_MAX_E, ▼ above the atmosphere, and the pod's kick
// solvable at the sampled ▲ and ▼. Outside it computeDropSolution returns the empty solution (no dot, no windows) and
// L2's flight rows lead, instead of podKickState or dotTrack throwing on an orbit the open engine can now reach.
export function dropSolvable(_orbit: Readonly<OrbitState>, _planet: Readonly<PlanetParams>): boolean {
  // TODO(slice1b-ORBIT): the domain check.
  return true;
}
