// Slice 4c–4e: Track ORBIT owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2). Others ask by message.
import type { Store } from '@state/store';
import type { GameState, BurnStatus, PresetMode, SasMode } from '@state/schema';
import type { AutoMode } from '@/types/skill';
import { MODE_RULES } from '@data/autoburn-modes';
import type { GoLowAim } from '@/types/landing';
import { onGameTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import {
  integrateStep, engineAccel, planningAccel, isImpactCourse, closeLoopDvKmS, closeBoundRadius, thrustCapFactor, adaptiveStepSec, isThrustOn,
} from '@systems/orbit-sim';
import { capabilitiesNow, deriveCapabilities, thrustCap, type Capabilities } from '@systems/capabilities';
import { zoneContains, zoneCrossings, chordInsideFrac, chordClosest, chordEntryFrac } from '@systems/zones';
import { presetHeading } from '@systems/attitude';
import { getAiCore } from '@state/selectors';
import { decayForecast, decayLiftAhead, dragLineKm, goLowDvKmS, timeToAngle } from '@systems/landing-orbit';
import { decayWarnOrbits, liftHold } from '@systems/landing-rules';
import { zoneRacks, type Zone, type ZoneHit, type HazardSpan } from '@/types/zone';
import {
  elementsFromState, ringFit, ringFraction, loopRange, semiMajorAxis, keplerConic, radialSigma, universalAnomaly,
  timeFromPeriapsis, orbitalPeriod, inboundSigmaAtRadius, positiveModulo, propagateConic,
  type KeplerConic, type OrbitState, type Ring, type RingFit, type Vec2,
} from '@/types/orbit';
import {
  PREDICT_HZ, PREDICT_STEP_MAX, PREDICT_STEPS_BUDGET,
  PREDICT_POINT_SPACING_FRAC, PREDICT_LOOP_TIME_GUARD, ESCAPE_R_FACTOR, RA_TARGET_FRAC, SWEET_ZONE_FRAC, BURN_POINT_LEAD_FRAC,
  LATE_TRIM_TAC, LATE_TRIM_DV_FACTOR, SIM_SUBSTEP_MAX_SEC, SHRINK_WAIT_TAC, SHRINK_MIN_APO_FRAC,
  SHRINK_FUEL_RESERVE_FRAC, RADIUS_BISECT_STEPS, RP_RATE_PROBE_SEC,
  SHRINK_RESERVE_WAIT_TAC, STRANDED_RANGE_FRAC, STRAND_LINE_MARGIN, SKIP_DIVISOR, BELT_HIT_MEAN_SEC,
  DODGE_PROMISE_MARGIN_KM, DODGE_DEADLINE_RESOLUTION_TAC, DODGE_MEMO_RP_DECIMALS, DODGE_MEMO_ANGLE_DECIMALS,
  DRAG_LIFT_MARGIN_KM, LIFT_HOLD_SLACK_KM, ROUND_E_TOL, ROUND_AIM_E, V3_HOLD_SLACK_KM, CIRCLE_NO_APSIS_E,
} from '@data/tuning';

// The predicted path: what happens if nobody touches the throttle. Pure (computePrediction)
// plus a cached instance refreshed from the game tick (mountPredictor / getPrediction).
//
// Scalars come from exact two-body (Kepler) math: event times, rp/ra, the ring fit and the
// band coverage. That makes every countdown exact and monotonic. The numeric propagation,
// with the same integrator the sim uses, only produces the drawn points and their colour
// spans (and is the seam where drag will go, so the line never lies).

export { ringFit, ringFraction };
export type { RingFit, ZoneHit, HazardSpan };

export type PredictOutcome = 'impact' | 'open' | 'closed';

// impact: the path ends on the surface (red). open: a flyby, or a closed loop's arcs outside
// the ring (dashed FLYBY). in-ring: the arcs of a closed loop inside the ring (green).
export type SpanKind = 'impact' | 'open' | 'in-ring' | 'out-ring';

export interface PathSpan {
  kind: SpanKind;
  from: number;  // index into points (inclusive); neighbouring spans share their boundary point
  to: number;
}

// Why the next burn is needed. capture: close an open path at ▼. missed: ▼ is behind us,
// close the loop now. shrink: climbing away on a loop that is too big, with the next trim far
// off: brake now to shrink it first (WP1-rules 2). The ring reasons trim a closed loop into the ring.
// Slice 1b (landing only, plan §1.4): go-low: GO LOWER's RETRO burn, centred on an orbit angle ('point') half an orbit
// before the awaited LZ's launch point; lift: PRO at ▲ to bring a decaying ▼ back up (landing-rules liftTargetKm; L10's key).
// Neither is a trim (isTrim): TRIM_PROBLEM and trimTarget stay the ring's four.
// Slice 4 (plan §2.9): round: AUTOBURN v2's ROUND (and 4e's landing orbit), an apsis burn toward a circle (planToCircle).
// Planned only while AUTOBURN is engaged in that mode, so only its own rows ever word it.
export type TrimReason = 'rp-low' | 'rp-high' | 'ra-high' | 'ra-low';
export type BurnReason = 'capture' | 'missed' | 'shrink' | TrimReason | 'go-low' | 'lift' | 'round';
// 'point': centred on an orbit angle rather than an apsis (GO LOWER's ◇).
export type BurnEvent = 'peri' | 'apo' | 'now' | 'point';

export interface BurnPoint {
  reason: BurnReason;
  preset: Extract<PresetMode, 'prograde' | 'retrograde'>;
  event: BurnEvent;
  // Game s to the apsis the burn is centred on: 0 for 'now', and negative for a trim whose
  // apsis is behind but which is still due now (see computeBurnPoint).
  eventInSec: number;
  inSec: number;        // game s to the START BURN tick (≤ 0: burn now)
  dvKmS: number;
  estBurnSec: number;   // game s at the current engine accel; Infinity when no thrust is available
  // The ship is on the half-orbit leading INTO the event (the plot shows START BURN only then).
  approaching: boolean;
  // A trim with the other end of the loop out of the ring too (WP1-rules 1): it fixes its own
  // end only, and a second trim at the other apsis follows.
  firstOfTwo: boolean;
  // go-low: the LZ named in KEEP HOLDING (`until LZ-B's dot fits`); absent on every other burn.
  aimLz?: string;
}

// Which burn a burn point is, across recomputes: its reason, the apsis it is centred on, and
// whether it is due now or at the next pass (a late trim whose window closes becomes the same trim
// a loop later). The throttle remembers the one it was pressed for (burn.firingFor), so guidance
// can tell a burn that just did its job from the right burn fired too early.
export function burnKey(burnPoint: Pick<BurnPoint, 'reason' | 'event' | 'eventInSec'> | null): string | null {
  if (!burnPoint) return null;
  return `${burnPoint.reason}|${burnPoint.event}|${burnPoint.eventInSec <= 0 ? 'due' : 'ahead'}`;
}

const SHRINK_KEY = burnKey({ reason: 'shrink', event: 'now', eventInSec: 0 });

export interface Prediction {
  asOfTSec: number;          // game time the prediction describes; subtract elapsed for "now"
  outcome: PredictOutcome;
  points: Vec2[];
  times: number[];           // game s after asOfTSec at which the ship reaches each point
  spans: PathSpan[];
  // WP9 (§6.8): the runs of the drawn path inside a hazard zone that can still hurt (a spent debris cloud
  // has none), overlaid on the colour spans (the plot hatches them), and what the path does with each zone
  // (the labels, the strip's upcoming event, pace and SKIP). Entry points are exact boundary points.
  hazardSpans: HazardSpan[];
  zoneHits: ZoneHit[];
  omega: number;             // direction of ▼ from the planet centre (radians, world frame)
  impactInSec: number | null;
  // Next ▼ / ▲ and the loop's period. null where the path never gets there: ▼ once an open
  // path is past it, ▲ on open paths, and all three on an impact course (the surface first).
  periInSec: number | null;
  apoInSec: number | null;
  periodSec: number | null;
  // Open paths: until ESCAPED (receding past ESCAPE_R_FACTOR·r0, or receding with too little
  // FUEL to close the loop). The drawn line still runs out to that radius (openPathFate).
  escapeInSec: number | null;
  // An open path the tank can no longer close even at ▼ (WP1-rules 3b), or, past ▼, not with
  // the best RETRO burn it can still fly: it will fly away.
  cannotClose: boolean;
  rp: number;
  ra: number;                // Infinity on an open path
  outbound: boolean;
  // On an impact course, the preset that lifts ▼ out of the planet (liftPreset, guidance's F4); null otherwise.
  liftPreset: PresetMode | null;
  fit: RingFit;
  greenFraction: number;     // band coverage: time-weighted fraction of the loop in the ring
  burnPoint: BurnPoint | null; // null on an impact course, in the ring, with an empty tank, or cannotClose
  neededPct: number;         // FUEL % the next burn costs (0 when none)
  // The tank is short of that burn, judged on the same snapshot as the plan (LEAD-2: against the live FUEL the 10 Hz
  // NEEDED went stale between refreshes, and a held trim's KEEP HOLDING line flickered at the boundary).
  fuelShort: boolean;
  // ACCEPT ORBIT is the only way on: the plan's next burn is a trim the tank can't pay for in full (for a
  // first of two, both trims), and even the whole tank spent on it at its apsis leaves a loop the launch band
  // can't reach (the lead's Rule 4, LEAD-1 review rounds 1–3; LEAD-2: only the FUEL is ever to blame, since
  // the coast SKIP crosses any WAIT in seconds). Decided only while nothing burns (a held burn's plan changes
  // under it), then latched for the rest of the flight (burn.acceptOnly): the strip names ACCEPT ORBIT, SKIP
  // is refused, and no countdown points at the burn that was dropped.
  acceptOnly: boolean;
  // ...and that ACCEPT strands the ship (§4.3): the strip says no burn reaches the launch band. While a burn
  // still saves the ship, the strip keeps its WAIT and SKIP, and names ACCEPT only when that does not strand.
  strandedAnyway: boolean;
}

const TWO_PI = 2 * Math.PI;

export function sweetZone(ring: Ring): { lo: number; hi: number } {
  const span = ring.max - ring.min;
  return { lo: ring.min + SWEET_ZONE_FRAC * span, hi: ring.max - SWEET_ZONE_FRAC * span };
}

// How fast ▼ moves under the thrust delivered now (km per game second; + raises it): along the ship's heading at the
// engine's current power, before its sputter. A one-step difference of the conic's periapsis radius, so it is exact
// for the burn being flown whatever the preset, and warp-invariant. 0 while no thrust is delivered.
export function rpRateUnderThrust(state: Readonly<GameState>): number {
  if (!isThrustOn(state)) return 0;
  const mu = state.level.planet.mu;
  const orbit = state.orbit;
  const kickKmS = engineAccel(state) * RP_RATE_PROBE_SEC;
  const pushed = {
    x: orbit.x, y: orbit.y,
    vx: orbit.vx + kickKmS * Math.cos(state.burn.heading), vy: orbit.vy + kickKmS * Math.sin(state.burn.heading),
  };
  return (elementsFromState(pushed, mu).rp - elementsFromState(orbit, mu).rp) / RP_RATE_PROBE_SEC;
}

// Seconds remaining until a predicted event, as seen at game time `nowTSec`. The prediction
// is recomputed at most PREDICT_HZ; in between, countdowns just run down.
export function secUntil(pred: Prediction, eventInSec: number, nowTSec: number): number {
  return eventInSec - (nowTSec - pred.asOfTSec);
}

// The warp a SKIP to an event `gameSec` away runs at, fixed when F is pressed (pace.ts requestSkip): the
// gap in about SKIP_DIVISOR wall seconds, never slower than CRUISE. No ceiling (LEAD-2): a SKIP is a pure
// coast, which the sim flies in exact jumps along the orbit, so a WAIT of 49 tactical days takes the same few
// seconds as one of five minutes.
export function skipWarp(gameSec: number, cruiseWarp: number): number {
  return Math.max(cruiseWarp, gameSec / SKIP_DIVISOR);
}

// A held burn along the burn point's own preset while that burn is due now with its apsis here or
// behind is the kid FINISHING it (a capture that ran past ▼, a trim continued after its apsis,
// a shrink), not starting the next one early: guidance does not call it TOO EARLY, and the
// header hides the next loop's countdown while it runs. A trim that is NOT due (its next pass is
// a loop away) is not being finished by a burn now, however recently its apsis went by.
export function isFinishingBurn(burnPoint: BurnPoint, firing: boolean, sasMode: SasMode): boolean {
  return firing && sasMode === burnPoint.preset && burnPoint.eventInSec <= 0;
}

// What is wrong with each end of a closed loop that is not green: ▼ (fixed by a burn at ▲)
// and/or ▲ (fixed by a burn at ▼). Both can be wrong at once: a capture with ▼ below the ring
// leaves ▲ far above it. ▼'s problem is listed first.
export function trimReasons(fit: RingFit, ring: Ring): TrimReason[] {
  const reasons: TrimReason[] = [];
  if (fit.rp < ring.min) reasons.push('rp-low');
  else if (fit.rp > ring.max) reasons.push('rp-high');
  if (fit.ra > ring.max) reasons.push('ra-high');
  else if (fit.ra < ring.min) reasons.push('ra-low');
  return reasons;
}

// The loop's problem in one reason, for the plot chip: the one the planned burn fixes (a shrink
// fixes a loop that is too big), else ▼'s.
export function loopProblem(pred: Prediction, ring: Ring): TrimReason {
  const reason = pred.burnPoint?.reason;
  if (reason === 'shrink') return 'ra-high';
  if (reason !== undefined && isTrim(reason)) return reason;
  const first = trimReasons(pred.fit, ring)[0];
  if (first === undefined) throw new Error('loopProblem: the loop is in the ring');
  return first;
}

function visViva(mu: number, radius: number, semiMajor: number): number {
  return Math.sqrt(mu * (2 / radius - 1 / semiMajor));
}

// Where each trim aims the apsis it moves: ▼ into the sweet zone, a too-big loop's ▲ to
// RA_TARGET_FRAC of the ring's edge, a too-small loop's ▲ to the sweet zone's low edge.
function trimTarget(reason: TrimReason, ring: Ring): number {
  const sweet = sweetZone(ring);
  if (reason === 'rp-low') return sweet.lo;
  if (reason === 'rp-high') return sweet.hi;
  return reason === 'ra-high' ? RA_TARGET_FRAC * ring.max : sweet.lo;
}

// The impulsive Δv of one trim at `burnRadius` (one apsis of the loop rp × ra): from the loop's
// speed there to the speed of the loop from there to `targetRadius`. Positive speeds up (PRO).
function trimDvKmS(mu: number, loop: { rp: number; ra: number }, burnRadius: number, targetRadius: number): number {
  return visViva(mu, burnRadius, (burnRadius + targetRadius) / 2) - visViva(mu, burnRadius, (loop.rp + loop.ra) / 2);
}

// The impulsive Δv of the trims that bring a closed loop into the ring (▼ first, then ▲). An
// estimate for "is there FUEL for the rest of the fix", not a plan the kid is shown.
function trimPlanDvKmS(fit: RingFit, ring: Ring, mu: number): number {
  let rp = fit.rp;
  let total = 0;
  const reasons = trimReasons(fit, ring);
  if (reasons.includes('rp-low') || reasons.includes('rp-high')) {
    const target = trimTarget(reasons[0]!, ring);
    total += Math.abs(trimDvKmS(mu, fit, fit.ra, target));
    rp = target;
  }
  const raReason = reasons.find((reason) => reason === 'ra-high' || reason === 'ra-low');
  if (raReason) total += Math.abs(trimDvKmS(mu, { rp, ra: fit.ra }, rp, trimTarget(raReason, ring)));
  return total;
}

export interface BurnInputs {
  orbit: Readonly<OrbitState>;
  mu: number;
  ring: Ring;
  fit: RingFit;
  radius: number;
  speed: number;
  outbound: boolean;
  periInSec: number | null;
  apoInSec: number | null;
  periodSec: number | null;
  aEff: number;
  fuelDvKmS: number;     // what is left in the tank
  surfaceR: number;      // the planet's surface (radius, km)
  lateTrimSec: number;   // LATE_TRIM_TAC in game seconds
  shrinkWaitSec: number; // SHRINK_WAIT_TAC in game seconds
  marginDvKmS: number;   // the ship's shrink.marginTac of burning at aEff (ship 1: SHRINK_MARGIN_TAC)
  marginMinDvKmS: number; // the ship's shrink.marginMinTac of burning at aEff (ship 1: SHRINK_MARGIN_MIN_TAC)
  edgeBackOffDvKmS: number; // the ship's shrink.edgeBackOffTac of burning at aEff (WP7; ship 1: the reaction)
  reactionDvKmS: number;  // the ship's shrink.reactionTac of burning at aEff (ship 1: SHRINK_REACTION_TAC)
  // ...and of burning at the ship's full thrust (aNominalKmS2: full POWER, no caps, no thread busy), for trimFlyable.
  flyableReactionDvKmS: number;
  reserveMinDvKmS: number; // the reserve's floor: shrink.marginMinTac of burning at aEff (ShrinkTuning's WHY)
  reserveWaitSec: number; // SHRINK_RESERVE_WAIT_TAC in game seconds
  smallLoopFactor: number; // the ship's shrink.smallLoopFactor (WP7: "already small" per ring)
  holdingShrink: boolean; // the throttle is held for a shrink (burn.firingFor)
  // LANDING (slice 1b): no shrink. It is the capture's tool (a just-captured loop days across); a landing's loop is one
  // the band reaches, and its too-big ▲ gets the ring trim at ▼, which the kid may decline (a shrink is "now" for the
  // whole climb, so it could never be declined, and held TACTICAL and the strip until ▲).
  landing: boolean;
  // Slice 4 (plan §2.9): AUTOBURN engaged in GREEN plans no shrink. It flies only at ▼ and ▲ (03 §3.6), so its trims are
  // phase 2's own targets, the cheapest green.
  noShrink: boolean;
}

// A burn along PRO (+1) or RETRO (−1) flown from the current state one SIM_SUBSTEP_MAX_SEC step
// at a time, with the sim's own integrator at `accel`, the preset tracking the velocity as SAS
// does. A real burn lasts minutes and the ship keeps moving while it runs, so the late trim, the
// shrink and the close-the-loop check all fly it rather than treat it as a kick. Callers bound
// it by FUEL: each step spends stepDvKmS.
interface PresetBurn {
  stepDvKmS: number;
  next(): RingFit;  // flies one step; the loop the ship is on after it
  orbit(): OrbitState; // where the ship is after the steps flown so far
}

function presetBurn(orbit: Readonly<OrbitState>, mu: number, ring: Ring, accel: number, along: 1 | -1): PresetBurn {
  const pos: Vec2 = { x: orbit.x, y: orbit.y };
  const vel: Vec2 = { x: orbit.vx, y: orbit.vy };
  return {
    stepDvKmS: accel * SIM_SUBSTEP_MAX_SEC,
    next() {
      const thrust = (along * accel) / Math.hypot(vel.x, vel.y);
      integrateStep(pos, vel, SIM_SUBSTEP_MAX_SEC, mu, thrust * vel.x, thrust * vel.y);
      return ringFit(elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu), ring);
    },
    orbit: () => ({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }),
  };
}

// Would a trim started NOW, with its apsis already behind, still land the loop in the ring?
// It lands when the loop turns green at any moment of the burn (that is where the strip says
// RELEASE), and fails once the trimmed apsis passes the trim's target without that, or the
// burn outgrows the tank or LATE_TRIM_DV_FACTOR × the on-time burn (see tuning.ts).
function lateTrimLands(
  input: Pick<BurnInputs, 'orbit' | 'mu' | 'ring' | 'fit' | 'aEff' | 'fuelDvKmS'>, preset: BurnPoint['preset'], event: 'peri' | 'apo', targetRadius: number, onTimeDvKmS: number,
): boolean {
  const { orbit, mu, ring, fit, aEff, fuelDvKmS } = input;
  // No thrust (WP4: a dead engine) cannot land anything.
  if (!(aEff > 0)) return false;
  // A trim at ▼ moves ▲ and a trim at ▲ moves ▼.
  const trimmed = (loop: RingFit): number => (event === 'peri' ? loop.ra : loop.rp);
  const startsAbove = trimmed(fit) > targetRadius;
  const burn = presetBurn(orbit, mu, ring, aEff, preset === 'prograde' ? 1 : -1);
  const steps = Math.floor(Math.min(fuelDvKmS, LATE_TRIM_DV_FACTOR * onTimeDvKmS) / burn.stepDvKmS);
  for (let i = 0; i < steps; i++) {
    const loop = burn.next();
    if (loop.inRing) return true;
    if ((trimmed(loop) > targetRadius) !== startsAbove) return false;
  }
  return false;
}

// A burn point from its plan: the START BURN tick sits half the estimated burn before the event.
// No available thrust (WP4: a dead engine) leaves the burn length undefined, so the tick sits on
// the event itself; guidance reports the dead engine first.
function toBurnPoint(
  plan: Omit<BurnPoint, 'inSec' | 'estBurnSec'>, aEff: number,
): BurnPoint {
  const estBurnSec = aEff > 0 ? plan.dvKmS / aEff : Infinity;
  const lead = Number.isFinite(estBurnSec) ? BURN_POINT_LEAD_FRAC * estBurnSec : 0;
  return { ...plan, inSec: plan.eventInSec - lead, estBurnSec };
}

// Game seconds to the next ▼ and ▲ of a closed loop, and its period.
export interface ApsisTimes {
  peri: number;
  apo: number;
  period: number;
}

// ...from the loop's conic and the game seconds since ▼ (negative before it).
function apsisTimesOf(conic: KeplerConic, sinceRp: number): ApsisTimes {
  const period = orbitalPeriod(conic);
  return { peri: positiveModulo(-sinceRp, period), apo: positiveModulo(period / 2 - sinceRp, period), period };
}

// One trim of a closed loop: fix ▼ by burning at ▲, or ▲ by burning at ▼, aiming the moved
// apsis at its target (trimTarget). Slice 1b's 'lift' (landing only, risk 3) is the same burn with a target override:
// PRO at ▲ lifting a decaying ▼ to the DRAG line + DRAG_LIFT_MARGIN_KM. Its loop is already in the ring, so "a late burn
// still lands the loop in the ring" (lateTrimLands) says nothing for it: it is due now only within LATE_TRIM_TAC of ▲.
// Slice 4: 'round' (planToCircle) is the same burn too, at the apsis `liftAt` names, due now only within LATE_TRIM_TAC.
function planTrim(
  input: Pick<BurnInputs, 'orbit' | 'mu' | 'ring' | 'fit' | 'aEff' | 'fuelDvKmS' | 'lateTrimSec'>, reason: TrimReason | 'lift' | 'round',
  apsisTimes: ApsisTimes, firstOfTwo: boolean,
  targetRadius: number = trimTarget(reason === 'lift' || reason === 'round' ? 'rp-low' : reason, input.ring),
  liftAt: 'apo' | 'peri' = 'apo',
): BurnPoint {
  const { mu, fit, aEff, lateTrimSec } = input;
  const fixesLowest = reason === 'rp-low' || reason === 'rp-high' || ((reason === 'lift' || reason === 'round') && liftAt === 'apo');
  const event = fixesLowest ? 'apo' : 'peri';
  const signedDvKmS = trimDvKmS(mu, fit, fixesLowest ? fit.ra : fit.rp, targetRadius);
  const preset = signedDvKmS > 0 ? 'prograde' : 'retrograde';
  const dvKmS = Math.abs(signedDvKmS);
  const nextEventInSec = fixesLowest ? apsisTimes.apo : apsisTimes.peri;
  // A trim whose apsis is behind (closer than the next pass) can still be due NOW: just past
  // the apsis it costs about the same, and further on as long as burning now still lands the
  // loop. Otherwise the kid waits a whole loop, and right after a capture that loop takes
  // hours of SKIP while braking now would have locked the orbit within seconds.
  const sinceEventSec = apsisTimes.period - nextEventInSec;
  const departing = sinceEventSec < nextEventInSec;
  const dueNow = departing
    && (sinceEventSec <= lateTrimSec || (isTrim(reason) && lateTrimLands(input, preset, event, targetRadius, dvKmS)));
  return toBurnPoint({
    reason, preset, event, dvKmS, firstOfTwo,
    eventInSec: dueNow ? -sinceEventSec : nextEventInSec,
    approaching: !departing,
  }, aEff);
}

// Game seconds from `orbit` to the apsis of the first trim its loop needs (a burn at ▲ fixes ▼, one
// at ▼ fixes ▲; with both ends out, the nearer one, as computeBurnPoint picks it): the WAIT a shrink
// stopped there would leave. 0 for a loop already in the ring.
function firstTrimInSec(orbit: Readonly<OrbitState>, mu: number, ring: Ring, loop: RingFit): number {
  const reasons = trimReasons(loop, ring);
  if (reasons.length === 0) return 0;
  const conic = keplerConic(orbit, mu, elementsFromState(orbit, mu));
  const times = apsisTimesOf(conic, timeFromPeriapsis(conic, universalAnomaly(conic, Math.hypot(orbit.x, orbit.y), radialSigma(orbit, mu))));
  return Math.min(...reasons.map((reason) => (reason === 'rp-low' || reason === 'rp-high' ? times.apo : times.peri)));
}

// "Already small" for the shrink (the ship's shrink.smallLoopFactor, WP7): ▲ within this radius.
function smallLoopRadius(ring: Ring, smallLoopFactor: number): number {
  return smallLoopFactor * ring.max;
}

// RETRO from the current state, flown one step at a time (presetBurn) and remembered, for the shrink:
// the loop after each step, where the ship is then, and whether holding on past a step for the
// over-hold margin would still keep ▼ above the surface. The margin is the ship's shrink.marginTac once ▼
// is below the ring on a loop that is already small (▲ within shrink.smallLoopFactor × the ring's outer
// edge), else shrink.marginMinTac (ShipDef.shrink, WP7; ship 1: SHRINK_MARGIN_TAC, SHRINK_SMALL_LOOP_FACTOR
// and SHRINK_MARGIN_MIN_TAC); it is looked up along the same burn past what the tank holds, so a short
// tank never sinks ▼ further than a full one would.
interface RetroPath {
  stepDvKmS: number;
  loop(step: number): RingFit | undefined;  // undefined past the step that put ▼ underground
  orbit(step: number): OrbitState;
  keepsMargin(step: number): boolean;
}

function retroPath(input: BurnInputs): RetroPath {
  const { orbit, mu, ring, fit, aEff, surfaceR, marginDvKmS, marginMinDvKmS } = input;
  const burn = presetBurn(orbit, mu, ring, aEff, -1);
  const marginSteps = Math.ceil(marginDvKmS / burn.stepDvKmS);
  const marginMinSteps = Math.ceil(marginMinDvKmS / burn.stepDvKmS);
  const smallLoopRa = smallLoopRadius(ring, input.smallLoopFactor);
  const loops: RingFit[] = [fit];                           // loops[k]: the loop after k steps
  const orbits: OrbitState[] = [{ x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }];
  let impactStep = Infinity;                                // the first step that leaves ▼ underground
  const flyTo = (step: number): void => {
    while (loops.length <= step && impactStep === Infinity) {
      const loop = burn.next();
      if (loop.rp <= surfaceR) impactStep = loops.length;
      loops.push(loop);
      orbits.push(burn.orbit());
    }
  };
  return {
    stepDvKmS: burn.stepDvKmS,
    loop(step) {
      flyTo(step);
      return loops[step];
    },
    orbit(step) {
      const stepOrbit = orbits[step];
      if (!stepOrbit) throw new Error(`retroPath: step ${step} was not flown`);
      return stepOrbit;
    },
    keepsMargin(step) {
      flyTo(step);
      const loop = loops[step];
      if (!loop) return false;
      const overHoldSteps = loop.rp < ring.min && loop.ra <= smallLoopRa ? marginSteps : marginMinSteps;
      const heldTo = step + overHoldSteps;
      flyTo(heldTo);
      return impactStep > heldTo;
    },
  };
}

// SHRINK THE LOOP (WP1-rules 2): the ship is on the first half of its climb on a loop that is
// too big, and its next trim is more than SHRINK_WAIT_TAC away. Braking now pulls ▲ in, and
// drags ▼ down with it. Flown with the sim's integrator along RETRO (retroPath), it ends at the first of:
// • ▲ inside the ring ('ring');
// • the over-hold margin ('margin'): holding on for it would put ▼ underground;
// • the tank: the FUEL left must still pay for the trims after the shrink (an impulsive estimate) plus a
//   reserve for a sloppy release, SHRINK_FUEL_RESERVE_FRAC of their cost but at least the ship's
//   shrink.marginMinTac of burning (LEAD-1) ('reserve'). While the trim the shrink would leave is
//   still more than SHRINK_RESERVE_WAIT_TAC away, the reserve may be spent too (LEAD-1: a tank just short
//   of trims plus reserve used to get no shrink at all and a WAIT of hours), down to what holding on
//   SHRINK_REACTION_TAC past the stop would spend: a release within the kid's reaction still leaves the
//   trims paid for (stopping with nothing to spare cost the lock to a release 0.15 s late, review round 1).
//   Running out there, with the WAIT still long, is 'dry': the tank can't buy a shorter WAIT, and the coast
//   SKIP crosses the one it leaves in seconds (LEAD-2). A shrink that leaves the kid unable to finish is not
//   progress, so the trims themselves are never spent.
// A burn on past a stop, or a coast after one, only brings each stop nearer (▲ only comes in, ▼
// only sinks, so the margin asked for only grows; the margin left only shrinks as the ship
// climbs; the trims only get dearer; the WAIT only shortens, so the reserve is only ever asked for
// more; braking from higher up the climb sinks ▼ faster), so the shrink is never offered again once
// it is done, and the plan never flips back and forth during it.
type LockShrinkStop = 'ring' | 'margin' | 'reserve' | 'dry';

function lockShrink(input: BurnInputs, path: RetroPath): { steps: number; stop: LockShrinkStop } {
  const { mu, ring, fuelDvKmS, reactionDvKmS, reserveMinDvKmS } = input;
  const tankSteps = Math.floor(fuelDvKmS / path.stepDvKmS);
  const reactionSteps = Math.ceil(reactionDvKmS / path.stepDvKmS);
  // The FUEL left after `step` steps beyond what the trims then cost (negative past the tank).
  const spareAfter = (step: number): number => {
    const loop = path.loop(step);
    return loop ? fuelDvKmS - step * path.stepDvKmS - trimPlanDvKmS(loop, ring, mu) : -Infinity;
  };
  const reserveFor = (loop: RingFit): number =>
    Math.max(SHRINK_FUEL_RESERVE_FRAC * trimPlanDvKmS(loop, ring, mu), reserveMinDvKmS);
  let steps = 0;
  for (let step = 1; step <= tankSteps; step++) {
    if (!path.keepsMargin(step)) return { steps, stop: 'margin' };
    const loop = path.loop(step)!;
    if (shrinkWaitsLong(input, path, step)) {
      if (spareAfter(step + reactionSteps) < 0) return { steps, stop: 'dry' };
    } else if (spareAfter(step) < reserveFor(loop)) {
      return { steps, stop: 'reserve' };
    }
    steps = step;
    if (loop.ra <= ring.max) return { steps, stop: 'ring' };
  }
  return { steps, stop: 'dry' };
}

// The trim a shrink stopped after `step` steps would leave is more than SHRINK_RESERVE_WAIT_TAC away.
function shrinkWaitsLong(input: BurnInputs, path: RetroPath, step: number): boolean {
  return firstTrimInSec(path.orbit(step), input.mu, input.ring, path.loop(step)!) > input.reserveWaitSec;
}

// The shrink, or null for none.
// • A tank that can't pay for the trims gets none: a shrink that leaves the kid unable to finish is not
//   progress (WP1-rules deviation 2), and the trim, with the whole tank at its apsis, ends on a better loop
//   than braking now would (a LEAD-2 probe: 84% against 48% band coverage
//   with 30% FUEL after 60 s of ignoring the capture). Its WAIT, hours of game time, is seconds of SKIP.
// • A hold pressed for the shrink keeps its plan only while the tank still pays for the trims after it:
//   held past that, the plan just ends (null), F5 says RELEASE, and what the tank pays for after the release
//   decides (LEAD-1 review round 1).
// Then (LEAD-1) a shrink that ends with ▼ still inside the ring on a loop that is already small (the
// stop at the ring's inner edge) backs off the ship's shrink.edgeBackOffTac (ship 1: SHRINK_REACTION_TAC):
// holding on that long more keeps ▼ in the ring, so a human release still leaves the usual trim at ▼,
// minutes away, instead of a PRO at ▲ and three burns. A loop still big there (a capture far up its climb, with the margin nearly spent) keeps
// its whole shrink: every tenth of a second of it saves hours of WAIT, and its fix is long either way.
function planShrink(input: BurnInputs): BurnPoint | null {
  const { mu, ring, fit, aEff, fuelDvKmS } = input;
  if (!(aEff > 0)) return null;
  if (trimPlanDvKmS(fit, ring, mu) > fuelDvKmS) return null;
  const path = retroPath(input);
  let shrinkSteps = lockShrink(input, path).steps;
  const end = path.loop(shrinkSteps)!;
  const smallLoopRa = smallLoopRadius(ring, input.smallLoopFactor);
  if (shrinkSteps > 0 && end.rp >= ring.min && end.rp <= ring.max && end.ra > ring.max && end.ra <= smallLoopRa) {
    // The ship's edge back-off (WP7): ship 1's is the kid's reaction; a ship where ▼ falls from the ring's
    // edge to the surface faster backs off more, so the hand-over keeps ship 1's over-hold before IMPACT.
    const backOffSteps = Math.ceil(input.edgeBackOffDvKmS / path.stepDvKmS);
    const lateLeavesRing = (step: number): boolean => (path.loop(step + backOffSteps)?.rp ?? -Infinity) < ring.min;
    // Only back to loops that are small too: from a small loop every further step is small, so the
    // full margin at the ring's edge still binds after any coast and the stop never moves on (a
    // hand-over on a loop just too big for that could be offered the shrink again a moment later).
    while (shrinkSteps > 0 && lateLeavesRing(shrinkSteps) && path.loop(shrinkSteps - 1)!.ra <= smallLoopRa) shrinkSteps--;
  }
  if (shrinkSteps === 0) return null;
  return toBurnPoint({
    reason: 'shrink', preset: 'retrograde', event: 'now', eventInSec: 0, dvKmS: shrinkSteps * path.stepDvKmS,
    approaching: false, firstOfTwo: false,
  }, aEff);
}

// One trim as a burn at an apsis of a loop: where, which way, and what it costs (impulsive).
interface ApsisBurn {
  loop: { rp: number; ra: number };
  event: 'peri' | 'apo';
  preset: BurnPoint['preset'];
  dvKmS: number;
}

// Would the whole tank, burned at once at the trim's apsis, still leave a loop out of the launch band
// (or one into the planet)? Impulsive, at the apsis the trim is centred on. Only asked of a trim the tank
// can't pay for, so the burn stops short of the trim's own aim and the loop stays closed. The strand line is
// cleared by STRAND_LINE_MARGIN: the real burn is spread around the apsis and ends a little short of the
// impulsive loop, and a kid who obeys a save to the empty tank must not end STRANDED (LEAD-2, tuning.ts).
function tankAtTrimStrands(trim: ApsisBurn, fuelDvKmS: number, mu: number, ring: Ring, surfaceR: number): boolean {
  const { loop } = trim;
  const radius = trim.event === 'apo' ? loop.ra : loop.rp;
  const speed = visViva(mu, radius, (loop.rp + loop.ra) / 2) + (trim.preset === 'prograde' ? fuelDvKmS : -fuelDvKmS);
  const inverseSemiMajor = 2 / radius - (speed * speed) / mu;
  if (!(inverseSemiMajor > 0) || !(speed >= 0)) {
    throw new Error(`tankAtTrimStrands: ${fuelDvKmS.toFixed(3)} km/s at ${trim.event} leaves no closed loop`);
  }
  const otherRadius = 2 / inverseSemiMajor - radius;
  const rp = Math.min(radius, otherRadius);
  return rp <= surfaceR || loopRange(rp, Math.max(radius, otherRadius), ring) < STRANDED_RANGE_FRAC + STRAND_LINE_MARGIN;
}

function isTrim(reason: BurnReason): reason is TrimReason {
  return reason === 'rp-low' || reason === 'rp-high' || reason === 'ra-high' || reason === 'ra-low';
}

// The second trim of a first of two (WP1-rules 1). The first moves the far apsis to its target, which lies
// inside the ring, so what is still out of it is the apsis the first burned at: the second burns at the
// moved apsis and brings that one in.
function secondTrimOf(fit: RingFit, first: BurnPoint, ring: Ring, mu: number): ApsisBurn {
  if (!isTrim(first.reason) || !first.firstOfTwo) throw new Error(`secondTrimOf: ${first.reason} is not a first of two trims`);
  const burnRadius = first.event === 'apo' ? fit.ra : fit.rp;
  const movedTo = trimTarget(first.reason, ring);
  const loop = { rp: Math.min(burnRadius, movedTo), ra: Math.max(burnRadius, movedTo) };
  const signedDvKmS = trimDvKmS(mu, loop, movedTo, trimTarget(burnRadius < movedTo ? 'rp-low' : 'ra-high', ring));
  return {
    loop, event: movedTo === loop.rp ? 'peri' : 'apo', preset: signedDvKmS > 0 ? 'prograde' : 'retrograde', dvKmS: Math.abs(signedDvKmS),
  };
}

// The tank falls short of the trim's whole fix, and even the whole tank spent on it at its apsis leaves a loop
// out of the launch band (Rule 4: the FUEL is to blame, so ACCEPT ORBIT is the only way on). For the first of
// two trims the fix is both burns (LEAD-1 review round 3): the first does not lock the orbit by itself. After a
// capture with ▼ under the ring, the PRO at ▲ cost 0.1% and the RETRO at ▼ after it 31%; with 10–30% FUEL the
// first counted as paid. A tank short of the fix whose burn still reaches the launch band keeps its trim and WAIT:
// held to the empty tank at the apsis it ends ORBIT ACCEPTED (§6.2's fuel-out on a closed loop).
function unpaidFixStrands(fit: RingFit, trim: BurnPoint, fuelDvKmS: number, mu: number, ring: Ring, surfaceR: number): boolean {
  if (trim.event === 'now' || trim.event === 'point') throw new Error(`unpaidFixStrands: the ${trim.reason} burn is not a trim`);
  if (fuelDvKmS < trim.dvKmS) {
    const atApsis: ApsisBurn = { loop: fit, event: trim.event, preset: trim.preset, dvKmS: trim.dvKmS };
    return tankAtTrimStrands(atApsis, fuelDvKmS, mu, ring, surfaceR);
  }
  if (!trim.firstOfTwo) return false;
  const second = secondTrimOf(fit, trim, ring, mu);
  const leftDvKmS = fuelDvKmS - trim.dvKmS;
  return leftDvKmS < second.dvKmS && tankAtTrimStrands(second, leftDvKmS, mu, ring, surfaceR);
}

// Can a kid fly this trim into the ring? Not when the Δv between the moved apsis reaching the ring's near edge and
// its far edge is less than the ship's reaction allowance of burning (shrink.reactionTac at the ship's full thrust):
// the strip says RELEASE as the loop enters the ring, and a release that late carries the apsis clean across it. Found once
// the coast SKIP reached these loops (LEAD-2): HALCYON's capture with ▼ 38 km above the surface left a
// 7.2-million-km loop whose PRO at ▲ moved ▼ from 3,428 km to about 45,000 km in one 50 ms tick, RETRO took it back
// under the ring the next, and the strip asked for that pair eleven times, a loop apart; on KESTREL's narrower ring
// the PRO at ▲ of an 81,000 km loop crossed the ring in four ticks, and a kid releasing 0.5 s late ended STRANDED
// with 23% FUEL. Impulsive at the apsis the trim burns at. The allowance is judged at the ship's full thrust, not at
// the power it has now (LEAD-2 review round 1): overshoot only grows with power, and the power moves with every Core
// thread an op takes (a REPAIR started or finished in the MIND flipped KESTREL's plan between ▲ and ▼, moved a running
// SKIP's target, and changed Rule 4's latched verdict at 14–16% FUEL), with the POWER slider and with Engine I/O going
// offline. So the verdict is the loop's and the ship's alone, and holds still on a coast.
function trimFlyable(input: BurnInputs, trim: BurnPoint): boolean {
  const { mu, ring, fit } = input;
  const burnRadius = trim.event === 'apo' ? fit.ra : fit.rp;
  const speedTo = (movedRadius: number): number => visViva(mu, burnRadius, (burnRadius + movedRadius) / 2);
  return Math.abs(speedTo(ring.max) - speedTo(ring.min)) > input.flyableReactionDvKmS;
}

// The START BURN tick (§6.2). Captures aim the far side of the new loop at RA_TARGET_FRAC of
// the ring's edge; trims fix one apsis at the opposite one, aiming for the sweet zone.
function computeBurnPoint(input: BurnInputs): BurnPoint | null {
  const { mu, ring, fit, radius, speed, outbound, periInSec, apoInSec, periodSec, aEff, shrinkWaitSec } = input;
  if (fit.inRing) return null;

  if (!fit.closed) {
    if (outbound) {
      // ▼ is behind: brake now toward a loop whose far side is at the ring's outer target.
      const raTarget = Math.max(radius, RA_TARGET_FRAC * ring.max);
      return toBurnPoint({
        reason: 'missed', preset: 'retrograde', event: 'now', eventInSec: 0,
        dvKmS: speed - visViva(mu, radius, (radius + raTarget) / 2), approaching: false, firstOfTwo: false,
      }, aEff);
    }
    if (periInSec === null) throw new Error('computeBurnPoint: inbound open path without a periapsis time');
    const energy = (speed * speed) / 2 - mu / radius;
    const raTarget = Math.max(fit.rp, RA_TARGET_FRAC * ring.max);
    const vpNow = Math.sqrt(2 * (energy + mu / fit.rp));
    return toBurnPoint({
      reason: 'capture', preset: 'retrograde', event: 'peri', eventInSec: periInSec,
      dvKmS: vpNow - visViva(mu, fit.rp, (fit.rp + raTarget) / 2), approaching: true, firstOfTwo: false,
    }, aEff);
  }

  if (periInSec === null || apoInSec === null || periodSec === null) {
    throw new Error('computeBurnPoint: closed loop without apsis times');
  }
  // WP1-rules 1: when both ends are out of the ring, fix whichever end's burn comes first (a
  // trim due now counts as first). §6.2's fixed order (▼ at ▲ first) made the kid SKIP for 500+ s
  // to ▲ right after a low capture, while braking on at ▼ was due that very moment.
  const apsisTimes = { peri: periInSec, apo: apoInSec, period: periodSec };
  const reasons = trimReasons(fit, ring);
  const trims = reasons.map((reason) => planTrim(input, reason, apsisTimes, reasons.length > 1));
  if (trims.length === 0) throw new Error('computeBurnPoint: a closed loop outside the ring with nothing to trim');
  // ...and of the trims a hand can fly (trimFlyable), when there are any: the other end's trim first makes the
  // loop small enough that this one can be flown. With none, the nearest anyway: there is nothing better to ask.
  const flyable = trims.filter((candidate) => trimFlyable(input, candidate));
  const trim = (flyable.length > 0 ? flyable : trims).reduce((first, next) => (next.eventInSec < first.eventInSec ? next : first));
  // WP1-rules 2: rather than a long WAIT, shrink a too-big loop now, while the ship is on the
  // first half of its climb to ▲ (see SHRINK_MIN_APO_FRAC). That only decides whether to offer
  // one: a shrink under way runs to its own stop, or a small loop offered one near that point of
  // its climb would be cut off a second into the burn and left with a WAIT for ▼.
  // Otherwise the trim, whatever its WAIT: the coast SKIP crosses it in seconds (LEAD-2; before, a WAIT the
  // FUEL was to blame for that SKIP could not cross in two minutes was dropped for ACCEPT ORBIT, the lead's
  // Rule 4, and LEAD-1's deviation 1 left a six-hour SKIP for a lock the tank paid for).
  const earlyClimb = outbound && apoInSec > SHRINK_MIN_APO_FRAC * periodSec;
  if (!input.landing && !input.noShrink && (earlyClimb || (outbound && input.holdingShrink)) && fit.ra > ring.max && trim.inSec > shrinkWaitSec) {
    const shrink = planShrink(input);
    if (shrink) return shrink;
  }
  return trim;
}

// --- The landing's in-ring burns (slice 1b, plan §1.4) ------------------------------------------------------------------
// computeBurnPoint has nothing for a loop in the ring. During the landing two burns may still be planned there, after
// the impact and the ring trims (which computeBurnPoint plans as in flight, on a PARTIAL orbit): GO LOWER on the aim
// landing.ts keeps (state.landing.goLow), then the 'lift' burn when decay will take ▼ out of the band within
// DECAY_WARN_ORBITS. Whether either is OFFERED (pace, L2's lead, the beeps) is landing-orbit landingBurnOffer's call.

// GO LOWER's RETRO burn, centred on the ◇ (aim.burnRad, half an orbit before the LZ's launch point): `eventInSec` is the
// time to that angle on the conic, and the Δv the one that brings the launch point's radius to the aim's target
// (landing-orbit goLowDvKmS, from the ship at the ◇, or from where it is while the burn is due). Due now just past the
// ◇ as a trim is (LATE_TRIM_TAC), and for as long as the kid holds it (aim.held: the burn is under way, centred or not).
// null once the launch point is already at the target.
function planGoLow(input: BurnInputs, aim: Readonly<GoLowAim>): BurnPoint | null {
  const { orbit, mu, aEff, lateTrimSec, periodSec } = input;
  if (periodSec === null) throw new Error('planGoLow: a loop in the ring without a period');
  const nextInSec = timeToAngle(orbit, mu, aim.burnRad);
  const sinceSec = periodSec - nextInSec;
  const departing = sinceSec < nextInSec;
  const dueNow = departing && (aim.held || sinceSec <= lateTrimSec);
  const atBurn = dueNow ? orbit : propagateConic(orbit, mu, nextInSec);
  const dvKmS = goLowDvKmS(atBurn, aim.launchRad, aim.targetRadiusKm, mu);
  if (!(dvKmS > 0)) return null;
  return toBurnPoint({
    reason: 'go-low', preset: 'retrograde', event: 'point', dvKmS, firstOfTwo: false, aimLz: aim.lz,
    eventInSec: dueNow ? -sinceSec : nextInSec,
    approaching: !departing,
  }, aEff);
}

function landingInRingBurn(state: Readonly<GameState>, input: BurnInputs): BurnPoint | null {
  const { landing } = state;
  if (state.run.phase !== 'landing' || landing.ended !== null || !input.fit.inRing) return null;
  if (landing.goLow !== null) {
    const goLow = planGoLow(input, landing.goLow);
    if (goLow !== null) return goLow;
  }
  // The one decay-warning rule (landing-rules decayWarnOrbits): L10 and L9 read it too, so the burn and the lines agree.
  // A lift the kid is holding is planned on to its target even once it has lifted the orbit out of the warning (else
  // the plan, the KEEP HOLDING and the RELEASE vanished a few tenths of a second into the burn: decay.test).
  // And a lift's ▲ half (one PRO at ▲, once ▲ is over the target) is planned while the decay is within twice the
  // warning: the warning comes when ▲ has mostly sunk already, so the lift usually takes two halves, and raising ▲ lifts
  // the orbit out of the warning; planned on the warning alone, the ▲ half was never offered before the kicks undid the
  // first (decay.test). A deviation from "lift when warned" (Track ORBIT): after a GO LOWER under the DRAG line it is
  // offered sooner (declinable, as every lift).
  const holdingLift = state.burn.firing && state.burn.firingFor !== null && state.burn.firingFor.startsWith('lift|');
  const orbitsToLeave = decayForecast(input.orbit, input.mu, input.ring, landing.drag).orbitsToLeave;
  const warned = decayWarnOrbits(state) !== null;
  if (!warned && !holdingLift && !decayLiftAhead(orbitsToLeave)) return null;
  const { periInSec, apoInSec, periodSec } = input;
  if (periInSec === null || apoInSec === null || periodSec === null) throw new Error('landingInRingBurn: a loop without apsis times');
  const times = { peri: periInSec, apo: apoInSec, period: periodSec };
  // While an LZ with room still needs the low orbit GO LOWER flew to (landing-rules liftHold, review fix 2), the lift
  // holds it in the band instead of taking ▼ back over the DRAG line: ▼ back up to the hold's floor if it sank under it
  // (PRO at ▲; first PRO at ▼ when ▲ is under it too), else ▲ back up to the middle of the band (PRO at ▼), each only
  // when LIFT_HOLD_SLACK_KM short. Nothing else: a held lift that reached them shows RELEASE (F3).
  const hold = liftHold(state);
  if (hold !== null) {
    if (input.fit.rp < hold.rpKm - LIFT_HOLD_SLACK_KM) {
      if (input.fit.ra < hold.rpKm) return planTrim(input, 'lift', times, true, hold.raKm, 'peri');
      return planTrim(input, 'lift', times, false, hold.rpKm);
    }
    if (input.fit.ra < hold.raKm - LIFT_HOLD_SLACK_KM) return planTrim(input, 'lift', times, false, hold.raKm, 'peri');
    return null;
  }
  const target = dragLineKm(input.ring) + DRAG_LIFT_MARGIN_KM;
  const raHalf = input.fit.ra >= target && decayLiftAhead(orbitsToLeave);
  if (!warned && !holdingLift && !raHalf) return null;
  // ▼ rises only as high as ▲ is: a decaying loop whose ▲ is under the target too (a near-circle below the line) is lifted
  // in two, as a ring trim with both ends out: first PRO at ▼ to take ▲ a margin over the target (firstOfTwo), then PRO
  // at ▲ to bring ▼ up to it.
  if (input.fit.ra < target) return planTrim(input, 'lift', times, true, target + DRAG_LIFT_MARGIN_KM, 'peri');
  return planTrim(input, 'lift', times, false, target);
}

// What the drawn path does with one zone, as propagatePath walks it (game s after the start).
interface ZoneWalk {
  startInside: boolean;
  enterSec: number | null;
  exitSec: number | null;
  insideSec: number;
  closestKm: number;          // debris: the nearest pass to the centre (Infinity until a step looks)
  closestSec: number | null;
}

// One boundary a propagation step crosses: the ring (the colour changes) or a zone (in or out), at a
// fraction along the step's chord.
interface StepCrossing {
  frac: number;
  zone: number;               // index into the zones; -1 for the ring
}

interface PathWalk {
  points: Vec2[];
  times: number[];
  spans: PathSpan[];
  hazardSpans: HazardSpan[];
  zones: ZoneWalk[];
}

// Numeric propagation for drawing: points thinned to about one per degree of arc, a span
// per colour run, and exact boundary points where a closed loop crosses the ring. A closed
// loop ends after one full swept turn, exactly on its start point: over a days-long period
// a time-bounded run would drift past the start and draw a stray tail over the loop.
// Each point carries the time the ship reaches it, so the plot can put the START BURN tick
// on the drawn line itself rather than on a separately computed (and slightly different) arc.
// Hazard zones (WP9) are walked on the same steps: their boundaries are exact points too, the runs inside
// them are hazard spans, and each zone's first entry, exit, time inside and (debris) nearest pass are kept.
// `live` marks the zones that can still hurt (a debris cloud hits once): only they get hazard spans.
function propagatePath(
  state: Readonly<GameState>, outcome: PredictOutcome, horizonSec: number, zones: readonly Zone[], live: readonly boolean[],
): PathWalk {
  const { planet, ring } = state.level;
  const mu = planet.mu;
  const closedLoop = outcome === 'closed';
  const kindAt = (radius: number): SpanKind => {
    if (outcome === 'impact') return 'impact';
    if (outcome === 'open') return 'open';
    return radius >= ring.min && radius <= ring.max ? 'in-ring' : 'out-ring';
  };

  const pos: Vec2 = { x: state.orbit.x, y: state.orbit.y };
  const vel: Vec2 = { x: state.orbit.vx, y: state.orbit.vy };
  const start: Vec2 = { x: pos.x, y: pos.y };
  let radiusPrev = Math.hypot(pos.x, pos.y);
  let kindPrev = kindAt(radiusPrev);
  const points: Vec2[] = [{ x: pos.x, y: pos.y }];
  const times: number[] = [0];
  const spans: PathSpan[] = [];
  let spanFrom = 0;
  let lastKept: Vec2 = { x: pos.x, y: pos.y };
  let swept = 0;
  const hazardSpans: HazardSpan[] = [];
  const inside = zones.map((zone) => zoneContains(zone, start));
  const hazardFrom: (number | null)[] = inside.map((isInside, i) => (isInside && live[i] ? 0 : null));
  const walks: ZoneWalk[] = inside.map((isInside) => ({
    startInside: isInside, enterSec: isInside ? 0 : null, exitSec: null, insideSec: 0, closestKm: Infinity, closestSec: null,
  }));

  // Long loops (a just-captured orbit can take days) widen the step ceiling so a single
  // prediction stays within PREDICT_STEPS_BUDGET steps; the r/v criterion keeps it accurate.
  const stepMax = Math.max(PREDICT_STEP_MAX, horizonSec / PREDICT_STEPS_BUDGET);
  const timeLimit = closedLoop ? horizonSec * PREDICT_LOOP_TIME_GUARD : horizonSec;
  let elapsed = 0;
  while (elapsed < timeLimit) {
    const radius = Math.hypot(pos.x, pos.y);
    const speed = Math.hypot(vel.x, vel.y);
    const stepWanted = adaptiveStepSec(radius, speed, stepMax);
    const step = Math.min(stepWanted, timeLimit - elapsed);
    const prevX = pos.x;
    const prevY = pos.y;
    integrateStep(pos, vel, step, mu, 0, 0);
    elapsed += step;

    let point: Vec2 = { x: pos.x, y: pos.y };
    let final = elapsed >= timeLimit;
    if (closedLoop) {
      swept += Math.atan2(prevX * pos.y - prevY * pos.x, prevX * pos.x + prevY * pos.y);
      if (Math.abs(swept) >= TWO_PI) { point = start; final = true; }
    }
    const radiusNow = Math.hypot(point.x, point.y);

    if (outcome === 'impact' && radiusNow <= planet.R) {
      // End the line exactly on the surface.
      const frac = (radiusPrev - planet.R) / (radiusPrev - radiusNow);
      points.push({ x: prevX + frac * (point.x - prevX), y: prevY + frac * (point.y - prevY) });
      times.push(elapsed - step + frac * step);
      break;
    }

    const kindNow = kindAt(radiusNow);
    const prevPoint: Vec2 = { x: prevX, y: prevY };
    const crossings: StepCrossing[] = [];
    if (kindNow !== kindPrev) {
      const boundary = (radiusPrev - ring.min) * (radiusNow - ring.min) <= 0 ? ring.min : ring.max;
      crossings.push({ frac: (boundary - radiusPrev) / (radiusNow - radiusPrev), zone: -1 });
    }
    zones.forEach((zone, i) => {
      for (const frac of zoneCrossings(zone, prevPoint, point)) crossings.push({ frac, zone: i });
      const walk = walks[i]!;
      walk.insideSec += chordInsideFrac(zone, prevPoint, point) * step;
      if (zone.kind === 'debris') {
        const nearest = chordClosest(prevPoint, point, zone.centre);
        if (nearest.distance < walk.closestKm) {
          walk.closestKm = nearest.distance;
          walk.closestSec = elapsed - step + nearest.frac * step;
        }
      }
    });
    crossings.sort((a, b) => a.frac - b.frac);
    for (const crossing of crossings) {
      const cross = { x: prevX + crossing.frac * (point.x - prevX), y: prevY + crossing.frac * (point.y - prevY) };
      const crossTime = elapsed - step + crossing.frac * step;
      points.push(cross);
      times.push(crossTime);
      lastKept = cross;
      if (crossing.zone < 0) {
        spans.push({ kind: kindPrev, from: spanFrom, to: points.length - 1 });
        spanFrom = points.length - 1;
        kindPrev = kindNow;
        continue;
      }
      const zoneIndex = crossing.zone;
      const walk = walks[zoneIndex]!;
      const entering = !inside[zoneIndex];
      inside[zoneIndex] = entering;
      if (entering) {
        if (walk.enterSec === null) walk.enterSec = crossTime;
        if (live[zoneIndex]) hazardFrom[zoneIndex] = points.length - 1;
      } else {
        if (walk.enterSec !== null && walk.exitSec === null) walk.exitSec = crossTime;
        const from = hazardFrom[zoneIndex];
        if (from !== null && from !== undefined) hazardSpans.push({ zoneId: zones[zoneIndex]!.id, from, to: points.length - 1 });
        hazardFrom[zoneIndex] = null;
      }
    }
    if (final || Math.hypot(point.x - lastKept.x, point.y - lastKept.y) >= PREDICT_POINT_SPACING_FRAC * radiusNow) {
      points.push({ x: point.x, y: point.y });
      times.push(elapsed);
      lastKept = point;
    }
    radiusPrev = radiusNow;
    if (final) break;
  }
  spans.push({ kind: kindPrev, from: spanFrom, to: points.length - 1 });
  hazardFrom.forEach((from, i) => {
    if (from !== null && points.length - 1 > from) hazardSpans.push({ zoneId: zones[i]!.id, from, to: points.length - 1 });
  });
  hazardSpans.sort((a, b) => a.from - b.from);
  return { points, times, spans, hazardSpans, zones: walks };
}

// --- The debris dodge (WP9) ------------------------------------------------------------------------------
//
// Would the ▼ correction the strip asks for (IN on a path too wide, OUT on one too low: F7/F8) take the path off a
// debris cloud, and until when can the kid still start it? The strip promises the dodge, with that countdown
// (guidance F8), only while it is true, and SKIP waits for the kid to decide (pace.ts).
//
// The correction is flown the way the sim flies it (velocity-frame radial at the engine's current power, the
// sim's sub-steps, bounded by the FUEL) and stopped exactly where ▼ reaches the far edge of the sweet zone: the
// deepest the strip lets the kid hold it (guidance F6 says KEEP HOLDING — dodge DEBRIS C through the sweet zone
// until the path clears the cloud, then RELEASE; RELEASE — too far beyond it). Then the coast on to ▼ (the cloud
// lies on the way in). It promises the dodge only with DODGE_PROMISE_MARGIN_KM to spare (tuning.ts has the WHY).
// While the correction is being held (the F6 stretch, ▼ already in the ring) it is still asked, so F6 knows whether
// holding on can still dodge; and once the kid lets go there with the IN (or OUT) preset still selected, it is asked
// again with a deadline (WP9 review round 2): a release before the path clears no longer drops the dodge without a
// word, the strip offers to finish it (guidance F6-resume) until that deadline runs out too.
//
// It is flown at the worst power the kid's own ops can leave the engine (dodgeAccel): every Core thread busy, each
// taking its share of the reactor. Judged with the threads actually busy, the deadline moved about 2 tactical s each
// time an op started or ended (review round 2 measured 154.2 → 152.0 → 153.5 → 154.2 under two REPAIRs), and a
// countdown never jumps (§2 pillar 5). Judged with none busy (round 2's fix), it lied: a kid who started at the last
// second while two REPAIRs ran was hit (a LEAD-2 probe: 3 broken promises in
// the last 0.7 tactical s). At the worst case the deadline holds still through any ops, and every start it promises
// dodges whatever the threads do; a kid with free threads dodges with room to spare. "Every thread" is the Core's
// capacity, which a flight never changes (LEAD-2 review round 1): its thread count drops to one below 50% integrity,
// so judged at that count the deadline jumped 1.45 tactical s earlier when a REPAIR healed the Core past 50%, and a
// Core that fell under 50% with two ops still running was judged at one. With THREAD+ (three threads) that is a
// quarter of the reactor, and the window is about 4 tactical s shorter.

// The correction to fly: its cloud, the world, the engine and tank, and which way and how deep (`target`).
interface CorrectionSpec {
  zone: Zone;
  mu: number;
  surfaceR: number;
  aEff: number;
  fuelDvKmS: number;
  preset: PresetMode;
  inward: boolean;
  target: number;  // the ▼ radius the burn stops at
}

// One correction from `pos`/`vel`: how far its path passes outside the cloud (km; ≤ 0 when it goes in, and
// -Infinity when it would hit the planet). Mutates `pos` and `vel`.
function correctionMissKm(pos: Vec2, vel: Vec2, spec: CorrectionSpec): number {
  const { zone, mu, aEff, inward, target } = spec;
  if (zone.kind !== 'debris') throw new Error(`correctionMissKm: ${zone.id} is not a debris cloud`);
  let nearest = Infinity;
  // A chord into the cloud already decides the answer: no need to fly on.
  const passes = (from: Vec2): boolean => {
    nearest = Math.min(nearest, chordClosest(from, pos, zone.centre).distance);
    return chordEntryFrac(zone, from, pos) === null;
  };
  const rpOf = (): number => elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu).rp;
  const reached = (rp: number): boolean => (inward ? rp <= target : rp >= target);
  let fuelLeft = spec.fuelDvKmS;
  let rp = rpOf();
  while (!reached(rp) && fuelLeft > 0) {
    const heading = presetHeading(spec.preset, { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y });
    const ax = aEff * Math.cos(heading);
    const ay = aEff * Math.sin(heading);
    const from: Vec2 = { x: pos.x, y: pos.y };
    const fromVel: Vec2 = { x: vel.x, y: vel.y };
    const step = Math.min(SIM_SUBSTEP_MAX_SEC, fuelLeft / aEff);
    integrateStep(pos, vel, step, mu, ax, ay);
    const rpNext = rpOf();
    if (reached(rpNext)) {
      // The sweet zone's edge falls inside this sub-step: fly only the part up to it (an exact stop, so the
      // promise does not jump by a sub-step's worth of thrust from one start time to the next).
      const frac = (rp - target) / (rp - rpNext);
      Object.assign(pos, from);
      Object.assign(vel, fromVel);
      integrateStep(pos, vel, step * frac, mu, ax, ay);
      fuelLeft = 0;
    } else {
      fuelLeft -= aEff * step;
    }
    if (!passes(from)) return nearest - zone.r;
    if (Math.hypot(pos.x, pos.y) <= spec.surfaceR) return -Infinity;
    rp = rpNext;
  }
  // The coast on to ▼, until it is past the cloud's inner edge (nothing further in can reach it before ▼).
  const pastCloud = Math.hypot(zone.centre.x, zone.centre.y) - zone.r;
  let rDotV = pos.x * vel.x + pos.y * vel.y;
  for (let i = 0; i < PREDICT_STEPS_BUDGET && rDotV < 0; i++) {
    const radius = Math.hypot(pos.x, pos.y);
    if (radius < pastCloud) break;
    const speed = Math.hypot(vel.x, vel.y);
    const step = adaptiveStepSec(radius, speed, PREDICT_STEP_MAX);
    const from: Vec2 = { x: pos.x, y: pos.y };
    integrateStep(pos, vel, step, mu, 0, 0);
    if (!passes(from)) return nearest - zone.r;
    rDotV = pos.x * vel.x + pos.y * vel.y;
  }
  return nearest - zone.r;
}

// Coasts `pos`/`vel` (no thrust) for `sec` game seconds with the predictor's steps; false when the coast itself
// runs into the cloud first (a correction started after that is too late).
function coastClear(pos: Vec2, vel: Vec2, sec: number, zone: Zone, mu: number): boolean {
  let left = sec;
  while (left > 0) {
    const radius = Math.hypot(pos.x, pos.y);
    const speed = Math.hypot(vel.x, vel.y);
    const step = Math.min(adaptiveStepSec(radius, speed, PREDICT_STEP_MAX), left);
    const from: Vec2 = { x: pos.x, y: pos.y };
    integrateStep(pos, vel, step, mu, 0, 0);
    if (chordEntryFrac(zone, from, pos) !== null) return false;
    left -= step;
  }
  return true;
}

export interface DebrisDodge {
  clears: boolean;
  // Game s after the prediction's asOf until the last moment a correction started then still dodges (0 when
  // it no longer does).
  untilSec: number;
}

// The dodge, worked out once per coast: while nothing burns, the path and so the deadline stay the same, so it is
// kept by the coast's own numbers (the conic, the FUEL, the engine's power) in absolute game time and only counted
// down; any burn, a change in power or another world works it out again. That also keeps the countdown from
// wobbling by the search's resolution from one 10 Hz prediction to the next.
interface DodgeMemo {
  key: string;
  clearsUntilTSec: number | null;  // null: no start from the memo's moment on dodges
}
const dodgeMemos = new Map<string, DodgeMemo>();

// The coast's conic, rounded (tuning.ts DODGE_MEMO_*): the integrator drifts the osculating elements in their last
// digits from tick to tick on a pure coast, and that drift must not count as a new coast.
function dodgeKey(state: Readonly<GameState>, zone: Zone, aEff: number, fuelDvKmS: number): string {
  const elements = elementsFromState(state.orbit, state.level.planet.mu);
  const conic = [
    elements.rp.toFixed(DODGE_MEMO_RP_DECIMALS), elements.e.toFixed(DODGE_MEMO_ANGLE_DECIMALS),
    elements.omega.toFixed(DODGE_MEMO_ANGLE_DECIMALS),
  ].join('|');
  return `${state.run.rev}|${zone.id}|${aEff}|${fuelDvKmS}|${conic}`;
}

// The thrust the dodge is judged at (see the section's header): the selected POWER and the files' caps (Engine I/O,
// the Reactor's band, the thrust controller), with as many Core threads busy as the Core holds (its capacity).
function dodgeAccel(state: Readonly<GameState>): number {
  const core = getAiCore(state);
  if (!core) throw new Error('dodgeAccel: the AI Core is missing from memory');
  const allBusy = deriveCapabilities(state, core.capacity);
  return state.level.aNominalKmS2 * (state.burn.thrustPct / 100) * thrustCap(allBusy);
}

// Which way the ▼ correction goes (true: IN, the path too wide), or null when none applies: ▼ outside the ring (F7/F8
// ask for it), or in the ring with the correction's preset still selected (held: F6; let go: F6-resume) and ▼ short
// of the sweet zone's far edge. Another preset selected in the ring is the kid's choice to stop correcting.
function correctionInward(state: Readonly<GameState>, fit: RingFit): boolean | null {
  const ring = state.level.ring;
  if (fit.rp > ring.max) return true;
  if (fit.rp < ring.min) return false;
  const sasMode = state.burn.sasMode;
  if (sasMode !== 'radial-in' && sasMode !== 'radial-out') return null;
  const sweet = sweetZone(ring);
  const inward = sasMode === 'radial-in';
  if (inward ? fit.rp <= sweet.lo : fit.rp >= sweet.hi) return null;
  return inward;
}

// The debris dodge of the ▼ correction (see above), or null when no such correction applies (no thrust, a closed
// loop, ▼ in the ring with another preset selected or past the sweet zone). `aEff`: dodgeAccel. `enterInSec`: the
// drawn path's entry into the cloud, the latest a start could be. While the correction is being held only "now" is
// asked (the countdown is not on the strip then).
function debrisDodge(
  state: Readonly<GameState>, zone: Zone, aEff: number, fit: RingFit, fuelDvKmS: number, enterInSec: number,
): DebrisDodge | null {
  const { planet, ring } = state.level;
  if (!(aEff > 0) || fit.closed) return null;
  const inward = correctionInward(state, fit);
  if (inward === null) return null;
  const now = state.clock.tSec;
  const key = dodgeKey(state, zone, aEff, fuelDvKmS);
  const memo = dodgeMemos.get(zone.id);
  if (memo?.key === key) {
    const left = memo.clearsUntilTSec === null ? 0 : memo.clearsUntilTSec - now;
    return { clears: left > 0, untilSec: Math.max(0, left) };
  }
  const sweet = sweetZone(ring);
  const spec: CorrectionSpec = {
    zone, mu: planet.mu, surfaceR: planet.R, aEff, fuelDvKmS, inward,
    preset: inward ? 'radial-in' : 'radial-out', target: inward ? sweet.lo : sweet.hi,
  };
  // A bisection on the start time: `latestDodgeSec` game s from now is the latest start known to dodge (its state is
  // `atLatestDodge`, from which each probe coasts on), `earliestMissSec` the earliest known to miss.
  const atLatestDodge = { pos: { x: state.orbit.x, y: state.orbit.y }, vel: { x: state.orbit.vx, y: state.orbit.vy } };
  const dodgesFrom = (pos: Vec2, vel: Vec2): boolean => correctionMissKm({ ...pos }, { ...vel }, spec) > DODGE_PROMISE_MARGIN_KM;
  if (state.burn.firing) {
    // The FUEL changes every tick of a burn, so nothing is kept: just whether holding on still dodges it.
    return { clears: dodgesFrom(atLatestDodge.pos, atLatestDodge.vel), untilSec: 0 };
  }
  let clearsUntilTSec: number | null = null;
  if (dodgesFrom(atLatestDodge.pos, atLatestDodge.vel)) {
    let latestDodgeSec = 0;
    let earliestMissSec = Math.max(0, enterInSec);
    const resolution = DODGE_DEADLINE_RESOLUTION_TAC * state.level.tacticalWarp;
    while (earliestMissSec - latestDodgeSec > resolution) {
      const probeSec = (latestDodgeSec + earliestMissSec) / 2;
      const pos = { ...atLatestDodge.pos };
      const vel = { ...atLatestDodge.vel };
      if (coastClear(pos, vel, probeSec - latestDodgeSec, zone, planet.mu) && dodgesFrom(pos, vel)) {
        latestDodgeSec = probeSec;
        atLatestDodge.pos = pos;
        atLatestDodge.vel = vel;
      } else {
        earliestMissSec = probeSec;
      }
    }
    clearsUntilTSec = now + latestDodgeSec;
  }
  dodgeMemos.set(zone.id, { key, clearsUntilTSec });
  const left = clearsUntilTSec === null ? 0 : clearsUntilTSec - now;
  return { clears: left > 0, untilSec: Math.max(0, left) };
}

// What the drawn path does with each zone (Prediction.zoneHits), from the walk. A spent debris cloud keeps
// its geometry (pace holds TACTICAL until the ship is out of it, §6.8) but expects no more hits.
function zoneHitsOf(
  zones: readonly Zone[], walks: readonly ZoneWalk[], spentIds: readonly string[], dodge: (zone: Zone, enterInSec: number) => DebrisDodge | null,
): ZoneHit[] {
  return zones.map((zone, i) => {
    const walk = walks[i]!;
    const spent = zone.kind === 'debris' && spentIds.includes(zone.id);
    const debris = zone.kind === 'debris';
    const enters = walk.enterSec !== null;
    // Only asked for a cloud the path still runs into: that is where the strip names the dodge.
    const dodged = debris && walk.enterSec !== null && !spent && !walk.startInside ? dodge(zone, walk.enterSec) : null;
    return {
      zoneId: zone.id,
      kind: zone.kind,
      racks: [...zoneRacks(zone)],
      spent,
      insideNow: walk.startInside,
      enterInSec: walk.enterSec,
      exitInSec: walk.exitSec,
      insideSec: walk.insideSec,
      closestInSec: debris ? walk.closestSec : null,
      missKm: debris ? walk.closestKm - zone.r : 0,
      expectedHits: debris ? (enters && !spent ? 1 : 0) : walk.insideSec / BELT_HIT_MEAN_SEC,
      correctionClears: dodged === null ? null : dodged.clears,
      dodgeInSec: dodged?.clears ? dodged.untilSec : null,
    };
  });
}

export interface PathSample {
  pos: Vec2;
  dir: Vec2;  // unit direction of travel along the drawn line there
}

// Where the ship will be `aheadSec` game seconds after the prediction was made, read off the
// drawn line (linear between its points), or null when that moment is not on the line.
export function samplePath(pred: Prediction, aheadSec: number): PathSample | null {
  const { points, times } = pred;
  const lastTime = times[times.length - 1];
  if (lastTime === undefined || points.length < 2 || aheadSec < 0 || aheadSec > lastTime) return null;
  for (let i = 1; i < times.length; i++) {
    const timeTo = times[i]!;
    if (timeTo < aheadSec) continue;
    const timeFrom = times[i - 1]!;
    const from = points[i - 1]!;
    const to = points[i]!;
    const frac = timeTo > timeFrom ? (aheadSec - timeFrom) / (timeTo - timeFrom) : 0;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue; // a ring-crossing point can coincide with a kept point
    return {
      pos: { x: from.x + frac * (to.x - from.x), y: from.y + frac * (to.y - from.y) },
      dir: { x: (to.x - from.x) / length, y: (to.y - from.y) / length },
    };
  }
  return null;
}

// Game seconds from periapsis where the conic crosses `radius`, inbound (negative) or
// outbound (positive), or null when it never reaches that radius.
function timeAtRadius(conic: KeplerConic, radius: number, leg: 'inbound' | 'outbound'): number | null {
  const sigmaIn = inboundSigmaAtRadius(conic, radius);
  if (sigmaIn === null) return null;
  return timeFromPeriapsis(conic, universalAnomaly(conic, radius, leg === 'inbound' ? sigmaIn : -sigmaIn));
}

interface EscapeInputs {
  conic: KeplerConic;
  sinceRp: number;      // game s since ▼ (negative before it)
  energy: number;       // specific orbital energy (> 0 on an open path)
  radius: number;
  outbound: boolean;
  fuelDvKmS: number;
  escapeRadius: number; // ESCAPE_R_FACTOR · r0: receding past it, the flight is over
  boundRadius: number;  // closeBoundRadius: how far out ▲ may lie for the loop to count as closed
}

interface OpenPathFate {
  escapeInSec: number;
  drawHorizonSec: number;
  cannotClose: boolean;
}

// How an open path ends.
// • drawHorizonSec: game seconds until it recedes past the escape radius (at ▼ when ▼ already
//   lies beyond it): how far the line is drawn, whatever the tank holds (§6.2), so a flyby the
//   tank can't catch still shows the ship flying past instead of a line that stops at ▼.
// • escapeInSec: until ESCAPED, the first moment it recedes with too little FUEL to close the
//   loop at all (WP1-rules 3b), or else past the escape radius; SKIP aims at it. On a coast the
//   close-the-loop Δv only grows with the radius, so that moment is now (or at ▼) when the tank
//   is already short there, else where the two meet, found by bisection on the radius.
// • cannotClose: the tank is short even at ▼ (or here, once past it), the cheapest place to
//   brake, so no burn can catch the planet any more and the escape is certain.
function openPathFate(input: EscapeInputs): OpenPathFate {
  const { conic, sinceRp, energy, radius, outbound, fuelDvKmS, escapeRadius, boundRadius } = input;
  const closeDvAt = (atRadius: number): number =>
    closeLoopDvKmS(atRadius, Math.sqrt(2 * (energy + conic.mu / atRadius)), conic.mu, boundRadius);
  // A flyby whose ▼ already lies beyond the escape radius never crosses it: it escapes the
  // moment it turns outbound, at ▼ (0 s from periapsis).
  const drawHorizonSec = Math.max(0, (timeAtRadius(conic, escapeRadius, 'outbound') ?? 0) - sinceRp);
  const fromRadius = outbound ? radius : conic.rp;
  if (fuelDvKmS < closeDvAt(fromRadius)) return { escapeInSec: Math.max(0, -sinceRp), drawHorizonSec, cannotClose: true };
  if (fromRadius >= escapeRadius || fuelDvKmS >= closeDvAt(escapeRadius)) {
    return { escapeInSec: drawHorizonSec, drawHorizonSec, cannotClose: false };
  }
  let below = fromRadius;
  let above = escapeRadius;
  for (let i = 0; i < RADIUS_BISECT_STEPS; i++) {
    const mid = (below + above) / 2;
    if (closeDvAt(mid) > fuelDvKmS) above = mid;
    else below = mid;
  }
  const shortSec = timeAtRadius(conic, above, 'outbound');
  if (shortSec === null) throw new Error(`openPathFate: the flyby never reaches ${above.toFixed(0)} km`);
  return { escapeInSec: Math.max(0, shortSec - sinceRp), drawHorizonSec, cannotClose: false };
}

// Past ▼, can a RETRO burn from here, at full POWER and with the whole tank, still close the loop
// with ▲ inside boundRadius? The 3b bound holds for any burn direction, so in a band of up to
// about 0.17 km/s even the best RETRO burn falls short of it, and MISSED ▼ would ask for a burn
// that cannot work. No thrust at all (WP4: a dead engine) answers yes: guidance names the engine.
function retroCloses(state: Readonly<GameState>, boundRadius: number, fuelDvKmS: number): boolean {
  const { planet, ring, aNominalKmS2 } = state.level;
  const accel = aNominalKmS2 * thrustCapFactor(state);
  if (!(accel > 0)) return true;
  const burn = presetBurn(state.orbit, planet.mu, ring, accel, -1);
  const steps = Math.floor(fuelDvKmS / burn.stepDvKmS);
  for (let i = 0; i < steps; i++) {
    const loop = burn.next();
    if (loop.closed && loop.ra <= boundRadius) return true;
  }
  return false;
}

// F4's burn, DON'T HIT THE PLANET (LEAD-2 review round 2): the velocity-frame preset that lifts ▼ out of the planet,
// for guidance and for BEAM OUT's "can the tank still lift it?" (beam-out.ts liftOutDvKmS) alike. WP1's rule was OUT
// inbound and PRO outbound (outbound OUT rotates the path the wrong way and LOWERS ▼). Two ways it failed:
// • PRO adds energy, and along a near-radial path it adds almost nothing else: 2 million km out, after a RETRO held
//   during the long SKIP, obeying PRO opened the loop with ▼ still under the surface (ESCAPED under KEEP HOLDING).
//   PRO keeps the angle γ between r and v, so along it h = k·s, with k = r·sin γ (the path's straight-line miss
//   distance) and s the speed, and it reaches the conic with ▼ on the surface at s² = 2μ (1/R − 1/r) / (k²/R² − 1),
//   none when k ≤ R. PRO is asked for only where that comes `reactionDvKmS` (a hand lets go that late after the
//   strip's RELEASE) before the escape speed. Otherwise IN outbound: perpendicular to v it adds no energy and can
//   never open a loop, and it turns v until PRO passes (far out, a few degrees off the radius).
// • Near ▲, where the path crosses the radius, OUT is a push outward: it turns the slow fall into a climb, the strip
//   then asked PRO, gravity turned it back, and the strip switched between OUT and PRO on every refresh (each switch
//   a turn of the ship with no thrust: WP7's doomed-but-savable ship, obeyed, never lifted ▼). So a PRO the kid has
//   selected is kept inbound too while it passes the test above and the path is still more across the radius than
//   along it (h ≥ |r·v|); it lifts ▼ fastest there anyway. Further down the fall OUT takes over, once.
export function liftPreset(
  orbit: Readonly<OrbitState>, mu: number, surfaceR: number, reactionDvKmS: number, selected: SasMode,
): PresetMode {
  const rDotV = orbit.x * orbit.vx + orbit.y * orbit.vy;
  const outbound = rDotV > 0;
  const radial: PresetMode = outbound ? 'radial-in' : 'radial-out';
  if (!outbound && selected !== 'prograde') return radial;
  const radius = Math.hypot(orbit.x, orbit.y);
  const speedSq = orbit.vx * orbit.vx + orbit.vy * orbit.vy;
  const angMom = Math.abs(orbit.x * orbit.vy - orbit.y * orbit.vx);
  if (!outbound && angMom < Math.abs(rDotV)) return radial;
  const missRatioSq = (angMom * angMom) / speedSq / (surfaceR * surfaceR) - 1;
  if (!(missRatioSq > 0)) return radial;
  const clearSpeed = Math.sqrt((2 * mu * (1 / surfaceR - 1 / radius)) / missRatioSq);
  const escapeSpeed = Math.sqrt((2 * mu) / radius);
  return clearSpeed + reactionDvKmS < escapeSpeed ? 'prograde' : radial;
}

// --- AUTOBURN's modes (slice 4, plan §2.9; Track FLIGHT) ------------------------------------------------------------------

// A loop's eccentricity from its two apsides (0 for a circle).
export function loopEccentricity(loop: Readonly<{ rp: number; ra: number }>): number {
  return (loop.ra - loop.rp) / (loop.ra + loop.rp);
}

// The loop is the circle of radius `targetKm` (ROUND's aim, ROUND_AIM_E): e under the aim, and its mean radius within
// ROUND_E_TOL of the target. Both, so a near-circle at another height (4e's landing orbit after a drag kick) is not "done".
export function atCircle(loop: Readonly<{ rp: number; ra: number }>, targetKm: number): boolean {
  return loopEccentricity(loop) < ROUND_AIM_E && Math.abs((loop.rp + loop.ra) / 2 - targetKm) <= ROUND_E_TOL * targetKm;
}

// The next apsis burn toward the circle of radius `targetKm` (plan §2.9): while ▼ is off R* by more than half the
// tolerance, at ▲ to bring ▼ to R* (first of two: the ▲ burn leaves ▲ where it was); else at ▼ to bring ▲ to R*. null at
// the circle. The planner reads it on the 10 Hz prediction; the machine's stop (autoburn.ts) reads the far side of the
// ship's own loop against R* every tick, whichever apsis it burns at.
// Slice 4e: a loop whose ▲ is above `bandMax` (AUTOBURN v3 right after its capture, or from a flyby whose ▼ is TOO WIDE)
// is brought down at ▼ first, its ▲ to R*: the burn at ▲ of a just-captured loop is half of a days-long orbit away, and a
// tiny Δv there swings ▼ by thousands of km. ROUND's loops are in the ring, so its order is unchanged.
export interface CircleStep {
  at: 'peri' | 'apo';
  targetRadius: number;
  firstOfTwo: boolean;
}

export function circleStep(loop: Readonly<{ rp: number; ra: number }>, targetKm: number, bandMax = Infinity): CircleStep | null {
  if (atCircle(loop, targetKm)) return null;
  const tolKm = (ROUND_E_TOL / 2) * targetKm;
  if (loop.ra > bandMax && Math.abs(loop.ra - targetKm) > tolKm) {
    return { at: 'peri', targetRadius: targetKm, firstOfTwo: Math.abs(loop.rp - targetKm) > tolKm };
  }
  if (Math.abs(loop.rp - targetKm) > tolKm) return { at: 'apo', targetRadius: targetKm, firstOfTwo: Math.abs(loop.ra - targetKm) > tolKm };
  return { at: 'peri', targetRadius: targetKm, firstOfTwo: false };
}

// Slice 4 (plan §2.9): the burn that takes a closed loop to a circle of radius `targetKm` (ROUND's R* at engagement; 4e's
// landing orbit), as circleStep names it, with planTrim's machinery and reason 'round'; null once the loop is that circle
// (atCircle). Pure.
export function planToCircle(
  input: Readonly<Pick<BurnInputs, 'orbit' | 'mu' | 'ring' | 'fit' | 'aEff' | 'fuelDvKmS' | 'lateTrimSec'>>,
  apsisTimes: Readonly<ApsisTimes>, targetKm: number,
): BurnPoint | null {
  if (!input.fit.closed) throw new Error('planToCircle: an open path has no circle to aim at');
  const step = circleStep(input.fit, targetKm, input.ring.max);
  if (step === null) return null;
  const times = loopEccentricity(input.fit) < CIRCLE_NO_APSIS_E ? quarterTurnTimes(input.orbit, apsisTimes.period) : apsisTimes;
  return planTrim(input, 'round', times, step.firstOfTwo, step.targetRadius, step.at);
}

// Review m2: on a loop with no apsis to speak of (CIRCLE_NO_APSIS_E), both "apsides" are the next quarter turn of the ship's
// polar angle (0°, 90°, 180°, 270° in the plane, in its direction of travel): a fixed point in space, so the countdown to
// it runs down as the ship flies, where the noise of ▼'s angle would move it every tick. Once the burn starts the loop is
// no longer round and its real apsides take over.
function quarterTurnTimes(orbit: Readonly<OrbitState>, period: number): ApsisTimes {
  const quarter = Math.PI / 2;
  const angle = Math.atan2(orbit.y, orbit.x);
  const prograde = orbit.x * orbit.vy - orbit.y * orbit.vx >= 0;
  const into = ((angle % quarter) + quarter) % quarter;
  const ahead = prograde ? quarter - into : into;
  const inSec = (ahead / (2 * Math.PI)) * period;
  // The "period" between two such points is a quarter turn: planTrim reads it for the time since the last one, so a burn
  // whose point has just gone by (an AUTOBURN offset, a late claim) is still due now (lateTrimSec), as at an apsis.
  return { peri: inSec, apo: inSec, period: period / 4 };
}

// AUTOBURN engaged (armed, pointing or burning) in a mode, as the planner reads it (state.burn.auto; predict may not
// import autoburn.ts, which imports it), or null.
export function engagedAuto(state: Readonly<GameState>): { mode: AutoMode; targetKm: number | null; holding: boolean } | null {
  const auto = state.burn.auto;
  const engaged = auto.phase === 'armed' || auto.phase === 'pointing' || auto.phase === 'burning';
  return engaged && auto.mode !== null ? { mode: auto.mode, targetKm: auto.targetKm, holding: auto.holding } : null;
}

// AUTOBURN v3's hold breaks (plan §5.3): once it holds its circle R*, a top-up is planned only when ▼ or ▲ has sunk
// V3_HOLD_SLACK_KM under R* (a grid step: about every one or two orbits under the DRAG line), or decay would take ▼ out of
// the band within DECAY_WARN_ORBITS. A refit that changes the fit sets the circle lower and lets go of the hold itself
// (autoburn.ts), so the fit needs no test here.
export function holdBroken(state: Readonly<GameState>, loop: Readonly<{ rp: number; ra: number }>, targetKm: number): boolean {
  return loop.rp < targetKm - V3_HOLD_SLACK_KM || loop.ra < targetKm - V3_HOLD_SLACK_KM || decayWarnOrbits(state) !== null;
}

// The burn AUTOBURN in `mode` would fly first, from a prediction made with or without it engaged (autoburn.ts
// previewModeBurn: the NAV PLOT's ghost and LOCK bracket before the press, and its lock range at the press). The times are
// the prediction's (game s after pred.asOfTSec), like pred.burnPoint's. While engaged in that mode the prediction already
// plans it (computePrediction), so this is pred.burnPoint; before the press it is the same plan made from the prediction's
// own scalars, cheaply (no path walk). null with nothing to fly (an impact course, an empty tank, a loop already there).
export function planModeBurn(state: Readonly<GameState>, pred: Prediction, mode: AutoMode, targetKm: number | null): BurnPoint | null {
  if (pred.outcome === 'impact' || state.burn.fuelPct <= 0) return null;
  const engaged = engagedAuto(state);
  if (engaged !== null && engaged.mode === mode && engaged.targetKm === targetKm) return pred.burnPoint;
  const capture = pred.burnPoint !== null && (pred.burnPoint.reason === 'capture' || pred.burnPoint.reason === 'missed') ? pred.burnPoint : null;
  if (pred.outcome === 'open') return MODE_RULES[mode].fromFlyby ? capture : null;
  if (mode === 'capture' || pred.periInSec === null || pred.apoInSec === null || pred.periodSec === null) return null;
  const input = {
    orbit: state.orbit, mu: state.level.planet.mu, ring: state.level.ring, fit: pred.fit, aEff: planningAccel(state),
    fuelDvKmS: (state.burn.fuelPct / 100) * state.level.dvBudgetKmS, lateTrimSec: LATE_TRIM_TAC * state.level.tacticalWarp,
  };
  const times = { peri: pred.periInSec, apo: pred.apoInSec, period: pred.periodSec };
  if (MODE_RULES[mode].circle) return targetKm === null ? null : planToCircle(input, times, targetKm);
  // GREEN on a closed loop: the ring trim, the cheapest green, never a shrink.
  if (pred.fit.inRing) return null;
  if (pred.burnPoint !== null && isTrim(pred.burnPoint.reason)) return pred.burnPoint;
  const reasons = trimReasons(pred.fit, state.level.ring);
  const trims = reasons.map((reason) => planTrim(input, reason, times, reasons.length > 1));
  return trims.reduce<BurnPoint | null>((first, next) => (first === null || next.eventInSec < first.eventInSec ? next : first), null);
}

export function computePrediction(state: Readonly<GameState>): Prediction {
  const { planet, ring, r0, dvBudgetKmS, tacticalWarp, shrink } = state.level;
  const mu = planet.mu;
  const orbit = state.orbit;
  const elements = elementsFromState(orbit, mu);
  const fit = ringFit(elements, ring);
  const radius = Math.hypot(orbit.x, orbit.y);
  const speed = Math.hypot(orbit.vx, orbit.vy);
  const outbound = orbit.x * orbit.vx + orbit.y * orbit.vy > 0;
  const conic = keplerConic(orbit, mu, elements);
  const sinceRp = timeFromPeriapsis(conic, universalAnomaly(conic, radius, radialSigma(orbit, mu)));
  const impact = isImpactCourse(fit, planet.R, outbound);
  const fuelDvKmS = (state.burn.fuelPct / 100) * dvBudgetKmS;
  const outcome: PredictOutcome = impact ? 'impact' : fit.closed ? 'closed' : 'open';
  const auto = engagedAuto(state);

  let periInSec: number | null = null;
  let apoInSec: number | null = null;
  let periodSec: number | null = null;
  let impactInSec: number | null = null;
  let escapeInSec: number | null = null;
  let drawHorizonSec: number | null = null;
  let cannotClose = false;
  if (impact) {
    const surfaceRp = timeAtRadius(conic, planet.R, 'inbound');
    if (surfaceRp === null) throw new Error('computePrediction: impact course that never reaches the surface');
    // Before periapsis (by the same anomaly the times use), the next surface crossing is this
    // leg's. Past it (outbound, or a ship braked to rest, which sits exactly at ▲) it is the
    // next leg's, one loop later, which only a closed loop has.
    if (sinceRp <= 0) {
      impactInSec = Math.max(0, surfaceRp - sinceRp);
    } else {
      if (!(conic.alpha > 0)) throw new Error('computePrediction: an impact course past periapsis on an open path');
      impactInSec = positiveModulo(surfaceRp - sinceRp, orbitalPeriod(conic));
    }
  } else if (fit.closed) {
    periodSec = orbitalPeriod(conic);
    periInSec = positiveModulo(-sinceRp, periodSec);
    apoInSec = positiveModulo(periodSec / 2 - sinceRp, periodSec);
  } else {
    periInSec = outbound ? null : -sinceRp;
    const boundRadius = closeBoundRadius(state.level);
    ({ escapeInSec, drawHorizonSec, cannotClose } = openPathFate({
      conic, sinceRp, energy: (speed * speed) / 2 - mu / radius, radius, outbound,
      fuelDvKmS, escapeRadius: ESCAPE_R_FACTOR * r0, boundRadius,
    }));
    // The flight itself still ends on the bound alone (orbit-sim), so this never ends it early.
    if (outbound && !cannotClose && !retroCloses(state, boundRadius, fuelDvKmS)) cannotClose = true;
  }

  // How far ahead to draw: to the surface, one full loop, or out past the escape radius.
  const horizonSec = impactInSec ?? periodSec ?? drawHorizonSec ?? 0;

  const zones = state.level.zones;
  const live = zones.map((zone) => !(zone.kind === 'debris' && state.hazards.hitIds.includes(zone.id)));
  const walk = propagatePath(state, outcome, horizonSec, zones, live);
  const { points, times, spans, hazardSpans } = walk;
  // An empty tank plans no burn: nothing could pay for it, so the line just shows its fate. Nor
  // does a flyby the tank can no longer catch: it flies away whatever the kid burns.
  const outOfFuel = state.burn.fuelPct <= 0;
  // The plan's engine (capabilities.ts planningThrustCap): as it fires now, except while the kid's own REPAIR or MOVE of
  // Engine I/O holds it offline (WP12 p3: START BURN no longer leaps onto ▼ for those seconds).
  const aEff = planningAccel(state);
  // A hand's reaction of burning at the ship's full thrust (trimFlyable's allowance, and F4's margin before the loop
  // opens): fixed, so neither verdict moves with the POWER slider or a busy Core thread (LEAD-2 review round 1).
  const flyableReactionDvKmS = shrink.reactionTac * tacticalWarp * state.level.aNominalKmS2;
  const burnInputs: BurnInputs = {
    orbit, mu, ring, fit, radius, speed, outbound, periInSec, apoInSec, periodSec, aEff,
    fuelDvKmS,
    surfaceR: planet.R,
    lateTrimSec: LATE_TRIM_TAC * tacticalWarp,
    shrinkWaitSec: SHRINK_WAIT_TAC * tacticalWarp,
    // The stop rule's numbers are the ship's own (ShipDef.shrink, WP7): they are a kid's hands in tactical
    // seconds, but where the ring's edge falls along a shrink depends on the ship. The reserve's floor is the
    // same promise as the margin it backs (ShrinkTuning's marginMinTac WHY), so it is marginMinTac.
    marginDvKmS: shrink.marginTac * tacticalWarp * aEff,
    marginMinDvKmS: shrink.marginMinTac * tacticalWarp * aEff,
    edgeBackOffDvKmS: shrink.edgeBackOffTac * tacticalWarp * aEff,
    reactionDvKmS: shrink.reactionTac * tacticalWarp * aEff,
    flyableReactionDvKmS,
    reserveMinDvKmS: shrink.marginMinTac * tacticalWarp * aEff,
    smallLoopFactor: shrink.smallLoopFactor,
    reserveWaitSec: SHRINK_RESERVE_WAIT_TAC * tacticalWarp,
    holdingShrink: state.burn.firing && state.burn.firingFor === SHRINK_KEY,
    landing: state.run.phase === 'landing',
    noShrink: auto !== null && MODE_RULES[auto.mode].noShrink,
  };
  // Slice 4 (plan §2.9): while AUTOBURN is engaged the plan is its mode's, so the START BURN ticks are always its burns:
  // ROUND (and 4e's landing orbit) the circle's burns on a closed loop, GREEN the ring's trims with no shrink; and the
  // landing's in-ring GO LOWER and lift are not planned (one planner owns the engine).
  // While v3 holds its circle it plans only when the hold breaks (holdBroken): a top-up, through the circle's own burns.
  const circle = auto !== null && MODE_RULES[auto.mode].circle && auto.targetKm !== null && fit.closed
    && (!auto.holding || holdBroken(state, fit, auto.targetKm))
    && periInSec !== null && apoInSec !== null && periodSec !== null
    ? { targetKm: auto.targetKm, times: { peri: periInSec, apo: apoInSec, period: periodSec } } : null;
  const burnPoint = impact || outOfFuel || cannotClose ? null
    : circle !== null ? planToCircle(burnInputs, circle.times, circle.targetKm)
      : computeBurnPoint(burnInputs) ?? (auto === null ? landingInRingBurn(state, burnInputs) : null);
  const greenFraction = outcome === 'closed' ? ringFraction(semiMajorAxis(elements), elements.e, ring) : 0;
  // ACCEPT ORBIT only (see Prediction.acceptOnly). Judged only while nothing burns: under a held burn the
  // plan ends early on purpose (a shrink held past its stop says RELEASE and lets the tank decide after the
  // release), and a latched verdict must not come from that moment. Once latched it holds while the loop is
  // closed and outside the ring; a burn that brings it into the ring still locks, and one that bends it into
  // the planet still gets DON'T HIT THE PLANET. At rest means nothing fires now: no held burn and no ghost burst
  // running. A ghost burst that ended in this tick is over (WP10 review: a SKIP flying through bursts judges the plan
  // right after each one, and with "no Δv this tick" the verdict only came a tick later, after more bursts).
  const atRest = !state.burn.firing && state.burn.ghost === null;
  const unpaidTrimStrands = burnPoint !== null && isTrim(burnPoint.reason)
    && unpaidFixStrands(fit, burnPoint, fuelDvKmS, mu, ring, planet.R);
  // The flight's only (plan §1.4): it latches while approaching, and an accepted orbit lands; in the landing a trim the
  // tank can't pay for is simply not offered (landing-orbit landingBurnOffer).
  const acceptOnly = state.run.phase !== 'landing' && outcome === 'closed' && !fit.inRing && burnPoint !== null
    && (state.burn.acceptOnly || (atRest && unpaidTrimStrands));
  const strandedAnyway = acceptOnly && greenFraction < STRANDED_RANGE_FRAC;

  return {
    asOfTSec: state.clock.tSec,
    outcome,
    points,
    times,
    spans,
    hazardSpans,
    zoneHits: zoneHitsOf(zones, walk.zones, state.hazards.hitIds,
      (zone, enterInSec) => (outcome === 'open' && !outbound ? debrisDodge(state, zone, dodgeAccel(state), fit, fuelDvKmS, enterInSec) : null)),
    omega: elements.omega,
    impactInSec,
    periInSec,
    apoInSec,
    periodSec,
    escapeInSec,
    cannotClose,
    rp: fit.rp,
    ra: fit.ra,
    outbound,
    liftPreset: impact ? liftPreset(orbit, mu, planet.R, flyableReactionDvKmS, state.burn.sasMode) : null,
    fit,
    greenFraction,
    burnPoint,
    neededPct: burnPoint ? (burnPoint.dvKmS / dvBudgetKmS) * 100 : 0,
    fuelShort: burnPoint !== null && fuelDvKmS < burnPoint.dvKmS,
    acceptOnly,
    strandedAnyway,
  };
}

// --- Cached instance ---------------------------------------------------------------------

let storeRef: Store<GameState> | null = null;
let cached: Prediction | null = null;
// The world (run.rev) the cache was computed for. A reset clears the cache, but the new ship's slices
// land in the store after it (systems/run.ts resetWorldForShip), and anything that asked for the
// prediction in between got the old ship's: a cache from another world is never served.
let cachedRev: number | null = null;
// ...and the AUTOBURN engagement it planned for (slice 4: the plan is the engaged mode's, so an engagement, a re-aim or an
// end replans at once; else the 10 Hz cache served the old plan for a tick and the machine read "nothing to fly").
let cachedAuto = '';
let sinceRecomputeWall = 0;
let lastFiring = false;
let lastStatus: BurnStatus | null = null;
let lastOutOfFuel = false;
// The sensed prediction (getSensedPrediction): what it was made from, and for which sensor state.
let sensed: Prediction | null = null;
let sensedFrom: Prediction | null = null;
let sensedKey = '';

function autoKey(state: Readonly<GameState>): string {
  const auto = engagedAuto(state);
  return auto === null ? '' : `${auto.mode}|${auto.targetKm ?? ''}|${auto.holding ? 'hold' : ''}`;
}

function recompute(state: Readonly<GameState>): Prediction {
  const pred = computePrediction(state);
  cached = pred;
  cachedRev = state.run.rev;
  cachedAuto = autoKey(state);
  sinceRecomputeWall = 0;
  lastFiring = state.burn.firing;
  lastStatus = state.burn.status;
  lastOutOfFuel = state.burn.fuelPct <= 0;
  return pred;
}

// Mount after mountOrbitSim so each refresh reads the freshly integrated state. Refreshes at
// most PREDICT_HZ, and immediately when a burn starts/stops, the status changes or the tank
// runs dry, so the line (and the burn it plans) reacts on the very next frame.
export function mountPredictor(store: Store<GameState>): () => void {
  if (storeRef) throw new Error('mountPredictor: already mounted');
  storeRef = store;
  const offReset = onWorldReset('predict', () => {
    cached = null;
    cachedRev = null;
    cachedAuto = '';
    sinceRecomputeWall = 0;
    lastFiring = false;
    lastStatus = null;
    lastOutOfFuel = false;
    sensed = null;
    sensedFrom = null;
    sensedKey = '';
    dodgeMemos.clear();
  }, () => ({
    cached: cached !== null, cachedRev, sinceRecomputeWall, lastFiring, lastStatus, lastOutOfFuel, sensed: sensed !== null, sensedKey,
    dodgeMemos: dodgeMemos.size,
  }));
  const offTick = onGameTick((_dtWorld, dtWall) => {
    const state = store.getState();
    sinceRecomputeWall += dtWall;
    if (cached === null
      || cachedRev !== state.run.rev
      || cachedAuto !== autoKey(state)
      || sinceRecomputeWall >= 1 / PREDICT_HZ
      || state.burn.firing !== lastFiring
      || state.burn.status !== lastStatus
      || (state.burn.fuelPct <= 0) !== lastOutOfFuel) {
      recompute(state);
    }
    // Rule 4's verdict is final (Prediction.acceptOnly): kept in the flight's state so that no later
    // re-plan (a burn the kid makes anyway) brings a WAIT or a shrink back after the strip has said ACCEPT ORBIT.
    if (cached?.acceptOnly && !state.burn.acceptOnly && state.burn.status === 'approaching') {
      store.update((draft) => { draft.burn.acceptOnly = true; });
    }
  });
  return () => {
    offTick();
    offReset();
    storeRef = null;
    cached = null;
    sensed = null;
    sensedFrom = null;
  };
}

// The current true prediction (computed on demand if nothing has ticked yet, e.g. at load
// or right after a world reset).
export function getPrediction(): Prediction {
  if (!storeRef) throw new Error('getPrediction: mountPredictor has not run');
  const state = storeRef.getState();
  return cached !== null && cachedRev === state.run.rev && cachedAuto === autoKey(state) ? cached : recompute(state);
}

// The true prediction for the state as it is right now: recomputed when the cached one is from an earlier tick, with
// the 10 Hz cadence kept. A SKIP fixes its warp and end point from it (pace.ts requestSkip; LEAD-2 review round 1):
// on a loop tens of millions of km across, CRUISE's integrator moves the next ▼ by tens of tactical seconds between two
// refreshes, a SKIP's end point only ever moves nearer, and one taken from the older refresh landed the SKIP up to 14
// tactical minutes early (a LEAD-2 probe). The SKIP's own ticks are exact conic jumps, so
// every refresh after its first agrees with it.
export function currentPrediction(): Prediction {
  if (!storeRef) throw new Error('currentPrediction: mountPredictor has not run');
  const pred = getPrediction();
  const state = storeRef.getState();
  if (pred.asOfTSec === state.clock.tSec) return pred;
  const sinceRefresh = sinceRecomputeWall;
  const fresh = recompute(state);
  sinceRecomputeWall = sinceRefresh;
  return fresh;
}

// --- What the instruments show (WP4, §3.3 C3, §6.2) ----------------------------------------------
//
// Damage never alters the TRUE prediction: the lock, the band coverage, pace and the moments
// (flight-events) read getPrediction(). Everything the kid reads, and guidance, read the SENSED
// one, which is the true prediction as the Sensor Interp file can report it:
// • exact (ok): the true prediction itself;
// • approx (degraded): the ▼ / ▲ altitudes (rp, ra) rounded to the sensor's fuzz (±fuzzKm),
//   shown as ≈. Only those readings move: the ring fit (`fit`, the single definition of green),
//   the outcome, the burn point and every time stay the truth, so the line's colour, HOLD STEADY,
//   the lock and the trim plan never disagree with each other;
// • uncertain (failing or worse): the last snapshot, refreshed only every staleTac tactical
//   seconds (the grey PATH UNCERTAIN band), its countdowns running down from it in between.
// LOWFUEL's "can no longer close" verdict is a fate, not a reading, so it is the true one too.

// Rounds an altitude to the sensor's fuzz (radii in km from the planet centre; ∞ stays ∞).
function fuzzRadius(radius: number, surfaceR: number, fuzzKm: number): number {
  if (!Number.isFinite(radius)) return radius;
  return surfaceR + Math.round((radius - surfaceR) / fuzzKm) * fuzzKm;
}

// The sensed copy of one true prediction (pure).
export function sensePrediction(truth: Prediction, plot: Capabilities['plot'], surfaceR: number): Prediction {
  if (plot.mode === 'exact' || !(plot.fuzzKm > 0)) return truth;
  return { ...truth, rp: fuzzRadius(truth.rp, surfaceR, plot.fuzzKm), ra: fuzzRadius(truth.ra, surfaceR, plot.fuzzKm) };
}

export function getSensedPrediction(): Prediction {
  if (!storeRef) throw new Error('getSensedPrediction: mountPredictor has not run');
  const truth = getPrediction();
  const state = storeRef.getState();
  const plot = capabilitiesNow(state).plot;
  // The world is part of the key: a stale sensor's snapshot from the last ship (its game clock long
  // past this one's) must never stand in for this ship's path.
  const key = `${state.run.rev}|${plot.mode}|${plot.fuzzKm}`;
  if (sensed && sensedKey === key) {
    if (sensedFrom === truth) return sensed;
    // A stale sensor keeps its snapshot until the next refresh (game seconds, so OVERCLOCK and
    // SKIP stretch and squeeze it like every countdown).
    if (plot.staleTac > 0 && truth.asOfTSec - sensed.asOfTSec < plot.staleTac * state.level.tacticalWarp) return sensed;
  }
  sensed = sensePrediction(truth, plot, state.level.planet.R);
  sensedFrom = truth;
  sensedKey = key;
  return sensed;
}
