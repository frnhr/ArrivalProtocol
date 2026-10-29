import type { Store } from '@state/store';
import type { GameState, LevelState, TerminalStatus, GhostBurst, SkipWaypoint } from '@state/schema';
import { onGameTick, onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { stepAttitude, isPresetAligning } from '@systems/attitude';
import { smoothNoise, childSeed, childRng, type Rng } from '@systems/rng';
import { emit, NO_PAYLOAD } from '@systems/events';
import { capabilitiesNow, thrustCap, planningThrustCap, presetsAvailable, type GhostSpec } from '@systems/capabilities';
import { beginLanding } from '@state/actions';
import {
  elementsFromState, ringFit, ringFraction, loopRange, semiMajorAxis, propagateConic,
  type OrbitState, type Ring, type RingFit, type Vec2,
} from '@/types/orbit';
import {
  SIM_SUBSTEP_MAX_SEC, SIM_MAX_SUBSTEPS, THRUST_NOISE_PERIOD_TAC, ESCAPE_R_FACTOR,
  STRANDED_RANGE_FRAC, LOCK_HOLD_AI_SEC, RADIUS_BISECT_STEPS, BAND_REACH_SAMPLES,
  PREDICT_STEP_ORBIT_FRAC, PREDICT_STEP_MIN, PREDICT_STEP_MAX, PREDICT_STEPS_BUDGET,
} from '@data/tuning';

// 2D two-body flight. The ship arrives on a hyperbola and the player steers it with presets
// and a held throttle. Terminal outcomes are physical (crash, escape), earned (ORBIT LOCK
// after HOLD STEADY), or forced by the tank (accept / strand on an empty tank; escape once a
// receding flyby can no longer pay to close its loop). There is no "commit" button: the lock
// is automatic.
//
// Per-tick numbers go through store.mutate (no subscriber fan-out). Discrete changes
// (aligning flips, the terminal status) go through store.update, AFTER the final mutate, so
// status subscribers read a consistent final frame.

// --- Shared physics (truth and prediction integrate with exactly these; a SKIP tick's truth is the exact conic,
// conicCoast, sampled at the predictor's own step) -------------------------------------------------------------------

export function accelGravity(pos: Vec2, mu: number): Vec2 {
  const radius = Math.hypot(pos.x, pos.y);
  const invR3 = 1 / (radius * radius * radius);
  return { x: -mu * pos.x * invR3, y: -mu * pos.y * invR3 };
}

// One velocity-Verlet (kick–drift–kick) step, in place. (ax, ay) is a constant extra
// acceleration (thrust) over the step; with it constant the field is position-only, so the
// step stays symplectic and the energy drift stays negligible over a whole flight.
export function integrateStep(pos: Vec2, vel: Vec2, h: number, mu: number, ax: number, ay: number): void {
  let grav = accelGravity(pos, mu);
  const vxHalf = vel.x + 0.5 * (grav.x + ax) * h;
  const vyHalf = vel.y + 0.5 * (grav.y + ay) * h;
  pos.x += vxHalf * h;
  pos.y += vyHalf * h;
  grav = accelGravity(pos, mu);
  vel.x = vxHalf + 0.5 * (grav.x + ax) * h;
  vel.y = vyHalf + 0.5 * (grav.y + ay) * h;
}

// The predictor's adaptive step: about PREDICT_STEP_ORBIT_FRAC of the time it takes to cross the radius at this speed
// (short near ▼, long far out), never under PREDICT_STEP_MIN or over `stepMax`. The predictor's walks and the coast
// SKIP's swept path (conicCoast) share it, so a SKIP tick samples the path as finely as the drawn line does.
export function adaptiveStepSec(radius: number, speed: number, stepMax: number): number {
  return Math.min(Math.max((PREDICT_STEP_ORBIT_FRAC * radius) / speed, PREDICT_STEP_MIN), stepMax);
}

// True if the segment a→b passes within radius R of the origin: the crash test is swept so
// a large sub-step cannot tunnel the ship through the planet.
function segmentHitsCircle(ax: number, ay: number, bx: number, by: number, radius: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const along = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const cx = ax + along * dx;
  const cy = ay + along * dy;
  return cx * cx + cy * cy <= radius * radius;
}

// An impact course: the osculating periapsis is at or below the surface and the ship will
// still pass it (closed loops always come back down; open paths only while inbound).
export function isImpactCourse(fit: RingFit, surfaceR: number, outbound: boolean): boolean {
  return fit.rp <= surfaceR && (fit.closed || !outbound);
}

// The least Δv that could still close an open path with ▲ inside `escapeRadius`, braking at
// `radius` (WP1-rules 3b). A loop through here whose far side stays inside escapeRadius is at
// most (radius + escapeRadius) / 2 across, so the ship's speed must drop to that loop's speed
// here; radial motion only pushes ▲ further out. No burn in any direction removes that much
// speed with less Δv, so with less FUEL the planet can no longer catch the ship. On a coast
// it only grows as the ship climbs (braking is cheapest near ▼), so the verdict never flips.
export function closeLoopDvKmS(radius: number, speed: number, mu: number, escapeRadius: number): number {
  const boundSpeed = Math.sqrt((2 * mu * escapeRadius) / (radius * (radius + escapeRadius)));
  return Math.max(0, speed - boundSpeed);
}

// The widest ▲ any loop can have and still be ACCEPTED when the tank runs dry (share in the launch band
// at least STRANDED_RANGE_FRAC, §4.3), whatever its ▼. A tank that cannot bring ▲ inside this can at
// best strand the ship, which lands nobody, just like flying away. Pure geometry of the ring
// (the range is a share of the period), so it is found once per ring by bisection on ▲.
const reachByRing = new Map<string, number>();

export function bandReachRadius(surfaceR: number, ring: Ring): number {
  const key = `${surfaceR}|${ring.min}|${ring.max}`;
  const known = reachByRing.get(key);
  if (known !== undefined) return known;
  const bestRange = (ra: number): number => {
    let best = loopRange(ring.min, ra, ring);
    for (let i = 0; i <= BAND_REACH_SAMPLES; i++) {
      const rp = surfaceR + ((ring.max - surfaceR) * i) / BAND_REACH_SAMPLES;
      best = Math.max(best, loopRange(rp, ra, ring));
    }
    return best;
  };
  // Double ▲ until the band no longer reaches it, then bisect between the last two.
  let reached = ring.max;
  let missed = 2 * ring.max;
  for (let i = 0; bestRange(missed) >= STRANDED_RANGE_FRAC; i++) {
    if (i >= RADIUS_BISECT_STEPS) throw new Error(`bandReachRadius: no reach limit for ring ${ring.min}–${ring.max}`);
    reached = missed;
    missed *= 2;
  }
  for (let i = 0; i < RADIUS_BISECT_STEPS; i++) {
    const mid = (reached + missed) / 2;
    if (bestRange(mid) >= STRANDED_RANGE_FRAC) reached = mid;
    else missed = mid;
  }
  reachByRing.set(key, reached);
  return reached;
}

// How far out ▲ may lie for the loop to count as closed in the 3b ending (WP1-rules 3b): the
// escape radius, as the lead specified, widened to the band's reach so the flight never ends
// as FLEW AWAY while braking could still bring it home as ACCEPTED (ship 1: 29,046 km).
export function closeBoundRadius(level: Readonly<LevelState>): number {
  return Math.max(ESCAPE_R_FACTOR * level.r0, bandReachRadius(level.planet.R, level.ring));
}

// --- Engine --------------------------------------------------------------------------------

// Fraction of nominal thrust the ship's files allow (§6.2, C1 + C4): min(Engine I/O's power cap,
// the Reactor's share after the busy threads), and nothing without a thrust controller.
export function thrustCapFactor(state: Readonly<GameState>): number {
  return thrustCap(capabilitiesNow(state));
}

// Amplitude of the engine's sputter (noise in [−1, 1] scales thrust by 1 ± jitter), from the
// Engine I/O band: a damaged driver makes the engine cough and surge.
export function thrustJitter(state: Readonly<GameState>): number {
  return capabilitiesNow(state).engine.jitter;
}

// What a burn delivers right now at the selected POWER and current caps, before jitter.
// The burn-point estimate and the sim both use it.
export function engineAccel(state: Readonly<GameState>): number {
  return state.level.aNominalKmS2 * (state.burn.thrustPct / 100) * thrustCapFactor(state);
}

// The accel the flight plan places START BURN with (capabilities.ts planningThrustCap): engineAccel, except while the
// engine driver is offline for the kid's own REPAIR or MOVE of it.
export function planningAccel(state: Readonly<GameState>): number {
  return state.level.aNominalKmS2 * (state.burn.thrustPct / 100) * planningThrustCap(state, capabilitiesNow(state));
}

// The throttle is held on a live flight with fuel and power: thrust is being delivered, or
// will be the moment the preset is aligned. Pace and SKIP ask this, so a held burn is never
// fast-forwarded: a preset can finish aligning inside one huge SKIP tick and would then fire
// for that whole tick.
export function isBurnHeld(state: Readonly<GameState>): boolean {
  const burn = state.burn;
  return burn.status === 'approaching'
    && burn.firing
    && burn.fuelPct > 0
    && engineAccel(state) > 0;
}

// Thrust is delivered: the burn is held and the preset is aligned. Guidance, the lock-hold
// readout and the flame ask this, never `firing` alone.
export function isThrustOn(state: Readonly<GameState>): boolean {
  return isBurnHeld(state) && !state.burn.presetAligning;
}

function noiseSeed(state: Readonly<GameState>): number {
  return childSeed(state.run.seed, state.run.shipIndex, 'thrust-noise');
}

// --- Ghost thrust (C2, §6.4) ------------------------------------------------------------------
//
// A failing Thrust Ctrl fires the engine by itself. The bursts are a Poisson process in game
// time: the gap to the next one is drawn from an exponential with mean meanIntervalTac ×
// tacticalWarp, so the chance a burst starts inside a world tick is exactly
// 1 − exp(−dtWorld / mean), and at most one starts per tick (§6.4). A burst covers the game-time
// window [start, start + durTac × tacticalWarp), starting at its drawn time inside the tick, and is
// applied to exactly the sub-steps inside it (partial sub-steps by their overlap); one that ends
// inside a tick is followed in that same tick by the next when that is due (LEAD-2: it used to wait
// for the next tick, a shift of up to a tick that made ×200 differ from ×25 by a third of a second).
// So the same seed puts the same bursts at the same game times with the same Δv at ×20, ×200 and
// through a SKIP (which lands on each burst's start), as long as a tick is shorter than a burst
// (up to about ×400): warp-invariant by construction. A burst pushes along
// the heading and burns FUEL; the next gap is drawn from its end. A sticky burst runs until SPACE
// is pressed and released (flight-controls). Seeded per ship (childRng 'ghost'); only a ship whose
// Thrust Ctrl is failing or dead ever draws.
// WP10 (the lead's ruling): only the ship's FIRST burst stops a SKIP (it lands on its start, and the burst fires on the
// next tick, the alarm moment). A later burst is flown through: pace lands the SKIP's tick on the burst's END, and that
// tick flies the coast up to the burst's start in one exact jump, then the burst itself in sub-steps exactly as a
// warp-limited tick would (the same window, the same thrust, the heading re-pointed every sub-step), so its Δv and its
// game times stay the same at ×25, ×200 and through a SKIP. Afterwards the plan is re-checked (systems/ghost-thrust.ts).

let ghostRng: Rng | null = null;
let nextGhostTSec: number | null = null;   // game time the next burst is due (null: not drawn)
let scheduledFor: GhostSpec | null = null; // the spec that gap was drawn for (a new band redraws)

function ghostStream(state: Readonly<GameState>): Rng {
  if (!ghostRng) ghostRng = childRng(state.run.seed, state.run.shipIndex, 'ghost');
  return ghostRng;
}

function scheduleGhost(state: Readonly<GameState>, spec: GhostSpec, fromTSec: number): void {
  const draw = ghostStream(state)();
  nextGhostTSec = fromTSec - Math.log(1 - draw) * spec.meanIntervalTac * state.level.tacticalWarp;
  scheduledFor = spec;
}

function clearGhostSchedule(): void {
  nextGhostTSec = null;
  scheduledFor = null;
}

// The gap to the next burst is drawn the first time it is needed for the current spec, from that moment.
function ensureGhostSchedule(state: Readonly<GameState>, spec: GhostSpec, fromTSec: number): number {
  if (scheduledFor !== spec || nextGhostTSec === null) scheduleGhost(state, spec, fromTSec);
  if (nextGhostTSec === null) throw new Error('orbit-sim: the ghost schedule was not drawn');
  return nextGhostTSec;
}

// The burst due inside this tick, if any (it consumes the schedule; the next gap is drawn when it
// ends).
function dueGhost(state: Readonly<GameState>, spec: GhostSpec, tStart: number, tEnd: number): GhostBurst | null {
  const dueTSec = ensureGhostSchedule(state, spec, tStart);
  if (dueTSec >= tEnd) return null;
  const startTSec = Math.max(tStart, dueTSec);
  const sticky = spec.stickChance > 0 && ghostStream(state)() < spec.stickChance;
  nextGhostTSec = null;
  return {
    startTSec,
    endTSec: sticky ? Infinity : startTSec + spec.durTac * state.level.tacticalWarp,
    amp: spec.amp,
    sticky,
    releaseArmed: false,
  };
}

// The share of a sub-step [from, to) a burst covers.
function ghostOverlap(ghost: GhostBurst, from: number, to: number): number {
  return Math.max(0, Math.min(to, ghost.endTSec) - Math.max(from, ghost.startTSec));
}

// A burst is running: the engine is firing by itself.
export function isGhostFiring(state: Readonly<GameState>): boolean {
  return state.burn.ghost !== null;
}

// Game seconds from now until the next burst starts, or null when none can (a healthy controller, a burst
// already running, an empty tank, no live flight). LEAD-2: the coast SKIP jumps along the orbit with no
// sub-steps, so it must land exactly where a burst starts (pace.ts) and leave the burst to the sim's next tick.
// When no gap is drawn yet, it is drawn here exactly as the sim's next tick would draw it: under the same
// conditions, from the same moment (the next tick starts at clock.tSec), from the same seeded stream. So asking
// never moves a burst, and the bursts land at the same game times at ×25, at ×200 and through a SKIP.
export function ghostDueInSec(state: Readonly<GameState>): number | null {
  const burn = state.burn;
  if (state.run.phase !== 'flight' || burn.status !== 'approaching' || burn.ghost !== null || burn.fuelPct <= 0) return null;
  const spec = capabilitiesNow(state).thrustCtrl.ghost;
  if (spec === null) return null;
  return ensureGhostSchedule(state, spec, state.clock.tSec) - state.clock.tSec;
}

// The window of the next ghost burst a SKIP flies through, when it is a LATER burst of this ship (the first one is a
// landing: ghostDueInSec), or null (no burst is coming, a healthy controller, or none has fired yet). Its end is the same
// sum dueGhost makes for the burst (its start plus its length), so the tick lands on exactly the game time the burst
// ends, to the last bit. A sticky burst's end is not known until it starts (the stick is rolled then): the window
// assumes its nominal length, and a burst that sticks is still running when the SKIP's tick ends there, which ends the
// SKIP (pace: ENGINE FIRING).
export function laterBurstWindow(state: Readonly<GameState>): SkipWaypoint | null {
  if (state.burn.ghostBursts === 0 || ghostDueInSec(state) === null) return null;
  const spec = capabilitiesNow(state).thrustCtrl.ghost;
  if (spec === null || nextGhostTSec === null) throw new Error('laterBurstWindow: a burst is due without a schedule');
  return { startTSec: nextGhostTSec, endTSec: nextGhostTSec + spec.durTac * state.level.tacticalWarp };
}

// Ends a running burst (a press-and-release of SPACE, a fixed controller, an empty tank).
export function endGhost(store: Store<GameState>): void {
  if (!store.getState().burn.ghost) return;
  store.update((draft) => { draft.burn.ghost = null; });
  emit('ghost-stop', NO_PAYLOAD);
}

// The outcomes that land the pods (01-landing §3.10): the ship is in an orbit the launch band reaches. A stranded ship
// is in orbit too, but too little of it is in the band to land anyone: it parks its pods with its result instead.
export function startsLanding(status: TerminalStatus): boolean {
  return status === 'locked' || status === 'accepted';
}

// Ends the flight: final status, throttle released so a held SPACE cannot carry into whatever comes
// next, and a ghost burst cut off. A locked or accepted orbit goes on into 'landing' with the clock
// running (beginLanding in the same update: LANDING's warps, a full bay); a lost ship (crashed, escaped,
// stranded) stops with the clock paused under its LOST card. The outcome is announced on the event
// bus (locked / accepted / stranded / escaped / crashed) once the state is final.
export function endFlight(store: Store<GameState>, status: TerminalStatus): void {
  const ghostWasFiring = store.getState().burn.ghost !== null;
  store.update((draft) => {
    draft.burn.status = status;
    draft.burn.firing = false;
    draft.burn.firingSource = null;
    draft.burn.firingFor = null;
    draft.burn.ghost = null;
    draft.burn.rotInput = 0;
    draft.clock.skipWarp = null;
    draft.clock.skipEndTSec = null;
    draft.clock.skipWaypoint = null;
    if (startsLanding(status)) {
      draft.run.phase = 'landing';
      beginLanding(draft);
    } else draft.clock.paused = true;
  });
  if (ghostWasFiring) emit('ghost-stop', NO_PAYLOAD);
  emit(status, NO_PAYLOAD);
  if (startsLanding(status)) emit('landing-start', NO_PAYLOAD);
}

// Terminal outcome of an empty tank, or null to keep flying:
// in ring → the lock hold continues; impact → fly until the crash; open → fly until the
// escape; any other closed loop → accepted at its share in the band, stranded below the floor.
function fuelOutOutcome(state: Readonly<GameState>, fit: RingFit, outbound: boolean): TerminalStatus | null {
  if (fit.inRing) return null;
  if (isImpactCourse(fit, state.level.planet.R, outbound)) return null;
  if (!fit.closed) return null;
  const elements = elementsFromState(state.orbit, state.level.planet.mu);
  const range = ringFraction(semiMajorAxis(elements), elements.e, state.level.ring);
  return range < STRANDED_RANGE_FRAC ? 'stranded' : 'accepted';
}

// The path the ship swept in the last game tick: where it started and where each sub-step ended, and how
// many game seconds each chord between them took. Hazard zones (systems/zones.ts) test these chords, so a
// contact is found on the true swept path at any warp (a 15 s sub-step at ×300 can't tunnel through a
// cloud). Empty in a tick where nothing moved (the flight is over).
const track: Vec2[] = [];
const trackChordSec: number[] = [];

export interface TickTrack {
  points: readonly Vec2[];
  chordSec: readonly number[];  // chordSec[i]: game seconds from points[i] to points[i + 1]
}

export function lastTickTrack(): TickTrack {
  return { points: track, chordSec: trackChordSec };
}

function startTrack(pos: Vec2): void {
  track.length = 0;
  trackChordSec.length = 0;
  track.push({ x: pos.x, y: pos.y });
}

function trackTo(pos: Vec2, chordSec: number): void {
  track.push({ x: pos.x, y: pos.y });
  trackChordSec.push(chordSec);
}

// LEAD-2, the coast SKIP: a SKIP tick moves the ship along its conic in one exact jump (types/orbit.ts
// propagateConic) instead of sub-steps, so no warp is too fast to fly: a SKIP of 49 tactical days lands in
// seconds where 1.2 billion sub-steps would have. Its swept path for the zones is sampled along the same conic,
// each sample jumped to from the tick's start (no error builds up), about one per PREDICT_STEP_ORBIT_FRAC of the
// local crossing time (the predictor's own step), never more than about PREDICT_STEPS_BUDGET a tick. Pace only
// SKIPs a pure coast (no thrust, no ghost burst: it lands on the next one), so there is no thrust to apply here.
// `freshTrack`: false appends to the tick's track (the landing's coast, split at a kick).
function conicCoast(start: Readonly<OrbitState>, mu: number, dtWorld: number, freshTrack = true): OrbitState {
  if (freshTrack) startTrack(start);
  const stepMax = Math.max(PREDICT_STEP_MAX, dtWorld / PREDICT_STEPS_BUDGET);
  let elapsed = 0;
  let sample: OrbitState = { x: start.x, y: start.y, vx: start.vx, vy: start.vy };
  while (elapsed < dtWorld) {
    const radius = Math.hypot(sample.x, sample.y);
    const speed = Math.hypot(sample.vx, sample.vy);
    const step = Math.min(adaptiveStepSec(radius, speed, stepMax), dtWorld - elapsed);
    elapsed = step >= dtWorld - elapsed ? dtWorld : elapsed + step;
    sample = propagateConic(start, mu, elapsed);
    trackTo(sample, step);
  }
  return sample;
}

// Gravity only, the same integrator and sub-steps as the flight, appended to the tick's track.
function steppedCoast(start: Readonly<OrbitState>, mu: number, dtWorld: number): OrbitState {
  const nSub = Math.min(SIM_MAX_SUBSTEPS, Math.max(1, Math.ceil(dtWorld / SIM_SUBSTEP_MAX_SEC)));
  const h = dtWorld / nSub;
  const pos: Vec2 = { x: start.x, y: start.y };
  const vel: Vec2 = { x: start.vx, y: start.vy };
  for (let i = 0; i < nSub && dtWorld > 0; i++) {
    integrateStep(pos, vel, h, mu, 0, 0);
    trackTo(pos, h);
  }
  return { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y };
}

// --- The landing's coast (01-landing §3.7, plan §1.6) ------------------------------------------------------------------

// A discrete change to the orbit at one game time, as a Δv (km/s, world axes): 1b's drag kick at each ▼ below the DRAG
// line (a retrograde Δv of DRAG_DV_MAX_KMS × (line − rp) / (line − ring.min)), later trims.
export interface LandingKick {
  atTSec: number;
  dvx: number;
  dvy: number;
}

// 1b SEAM (decay): the kicks due in (t0, t1], in time order. None in 1a: no ship decays yet (risk 1: no engine and no
// drag in LANDING). 1b reads ShipLandingDef.drag and the DRAG line here, and pace's nextEvent gains a 'kick' so a SKIP
// stops at each one (§3.7: the exact jumps must stop at each ▼ below the line).
export function landingKicks(_state: Readonly<GameState>, _t0: number, _t1: number): LandingKick[] {
  return [];
}

// After the lock the ship coasts with nobody on the throttle (§6.2); the plot animates through the landing. A SKIP tick
// is one exact conic jump (no warp is too fast, LEAD-2); any other tick takes the flight's sub-steps. The tick splits at
// each kick (landingKicks): the coast to it, the Δv, a bump of landing.orbitEpoch (the drop cache keys its dot track on
// it, so the windows are solved again for the new orbit), then on. A locked or accepted orbit never reaches the surface
// (its ▼ is above the atmosphere), so there is nothing to end.
function landingCoast(store: Store<GameState>, dtWorld: number): void {
  const state = store.getState();
  const mu = state.level.planet.mu;
  const exact = state.clock.pace === 'skip';
  const tEnd = state.clock.tSec;
  const tStart = tEnd - dtWorld;
  const stretch = (from: OrbitState, dt: number): OrbitState => (exact ? conicCoast(from, mu, dt, false) : steppedCoast(from, mu, dt));
  let orbit: OrbitState = { x: state.orbit.x, y: state.orbit.y, vx: state.orbit.vx, vy: state.orbit.vy };
  let at = tStart;
  startTrack(orbit);
  const kicks = landingKicks(state, tStart, tEnd);
  for (const kick of kicks) {
    if (!(kick.atTSec > at && kick.atTSec <= tEnd)) {
      throw new Error(`landingCoast: a kick at ${kick.atTSec} outside the tick's (${at}, ${tEnd}] or out of order`);
    }
    orbit = stretch(orbit, kick.atTSec - at);
    orbit = { ...orbit, vx: orbit.vx + kick.dvx, vy: orbit.vy + kick.dvy };
    at = kick.atTSec;
  }
  orbit = stretch(orbit, tEnd - at);
  store.mutate((draft) => {
    draft.orbit.x = orbit.x;
    draft.orbit.y = orbit.y;
    draft.orbit.vx = orbit.vx;
    draft.orbit.vy = orbit.vy;
    draft.burn.lastTickDvKmS = 0;
  });
  if (kicks.length > 0) store.update((draft) => { draft.landing.orbitEpoch += kicks.length; });
}

// One sub-step of `h` game seconds with `accelWanted` km/s² along (dirX, dirY): FUEL drains by DELIVERED Δv, so the
// sub-step where the tank empties delivers only its fuelled fraction; then the step, its chord on the swept track and
// the crash test on that chord. Mutates pos and vel. The warp-limited tick and a SKIP's flown-through burst both step
// through here, so a burst's Δv, FUEL and path are the same either way (WP10, the lead's item 3: warp invariance).
// Callers only ask for thrust while the tank holds some (fuelDv > 0).
interface SubStep {
  fuelDv: number;      // left after this sub-step
  delivered: number;   // Δv delivered in it
  accel: number;       // the acceleration actually applied (0: a coast)
  crashed: boolean;    // its chord crossed the surface
}

function thrustSubStep(
  pos: Vec2, vel: Vec2, h: number, mu: number, surfaceR: number, accelWanted: number, dirX: number, dirY: number, fuelDv: number,
): SubStep {
  let accel = accelWanted;
  let delivered = 0;
  let fuelLeft = fuelDv;
  if (accel > 0) {
    if (accel * h >= fuelLeft) {
      accel = fuelLeft / h;
      delivered = fuelLeft;
      fuelLeft = 0;
    } else {
      delivered = accel * h;
      fuelLeft -= accel * h;
    }
  }
  const prevX = pos.x;
  const prevY = pos.y;
  integrateStep(pos, vel, h, mu, accel * dirX, accel * dirY);
  trackTo(pos, h);
  return { fuelDv: fuelLeft, delivered, accel, crashed: segmentHitsCircle(prevX, prevY, pos.x, pos.y, surfaceR) };
}

// A later ghost burst inside a SKIP tick (WP10): from its start (where the jump ended) to the tick's end, which pace
// lands on the burst's end, in sub-steps of at most SIM_SUBSTEP_MAX_SEC, each pushing along the heading the preset
// points to at that moment (a warp-limited tick re-points once a tick, at most SIM_SUBSTEP_MAX_SEC at TACTICAL ×20…×30),
// for the share of the sub-step the burst covers, and burning FUEL the same way. Mutates pos and vel; returns the rest.
interface FlownBurst {
  attitude: { heading: number; omega: number };
  fuelDv: number;
  delivered: number;
  thrustSec: number;
  crashed: boolean;
}

function flySkipBurst(
  state: Readonly<GameState>, ghost: GhostBurst, pos: Vec2, vel: Vec2, startAttitude: { heading: number; omega: number },
  fuelDvStart: number, tEnd: number,
): FlownBurst {
  const { mu, R } = state.level.planet;
  const span = tEnd - ghost.startTSec;
  const nSub = Math.min(SIM_MAX_SUBSTEPS, Math.max(1, Math.ceil(span / SIM_SUBSTEP_MAX_SEC)));
  const h = span / nSub;
  const burn = state.burn;
  let attitude = startAttitude;
  let fuelDv = fuelDvStart;
  let delivered = 0;
  let thrustSec = 0;
  for (let i = 0; i < nSub; i++) {
    const from = ghost.startTSec + i * h;
    if (i > 0) attitude = stepAttitude(attitude, burn.sasMode, burn.rotInput, { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, h);
    const accel = fuelDv > 0 ? (state.level.aNominalKmS2 * ghost.amp * ghostOverlap(ghost, from, from + h)) / h : 0;
    if (accel > 0) thrustSec += h;
    const step = thrustSubStep(pos, vel, h, mu, R, accel, Math.cos(attitude.heading), Math.sin(attitude.heading), fuelDv);
    fuelDv = step.fuelDv;
    delivered += step.delivered;
    if (step.crashed) return { attitude, fuelDv, delivered, thrustSec, crashed: true };
  }
  return { attitude, fuelDv, delivered, thrustSec, crashed: false };
}

let mounted = false;

export function mountOrbitSim(store: Store<GameState>): () => void {
  // A second mount would integrate the ship twice per tick.
  if (mounted) throw new Error('mountOrbitSim: already mounted');
  mounted = true;
  const offGame = onGameTick((dtWorld) => {
    track.length = 0;
    trackChordSec.length = 0;
    const state = store.getState();
    const burn = state.burn;
    // After a lock or accept the ship keeps coasting with nobody on the throttle (§6.2): landingCoast.
    if (state.run.phase === 'landing') { landingCoast(store, dtWorld); return; }
    if (burn.status !== 'approaching') return;

    const { planet, ring, r0, dvBudgetKmS, tacticalWarp } = state.level;
    const mu = planet.mu;

    // A damaged Autopilot (C3, failing or worse) lets go of the preset: the ship holds the heading
    // it has and the kid turns by hand (MANUAL, Q/E). A discrete change, so an update; the Engine
    // window opens its MANUAL fold from it.
    const caps = capabilitiesNow(state);
    if (burn.sasMode !== 'off' && !presetsAvailable(caps)) {
      store.update((draft) => {
        draft.burn.sasMode = 'off';
        draft.burn.omega = 0;
        draft.burn.rotInput = 0;
        draft.burn.presetAligning = false;
      });
    }

    // Attitude FIRST, from the start-of-tick orbit, so a burn never fires along last tick's
    // heading (the old one-tick lag fired the first RETRO tick prograde).
    let attitude = stepAttitude(
      { heading: burn.heading, omega: burn.omega }, burn.sasMode, burn.rotInput, state.orbit, dtWorld,
    );
    let aligning = isPresetAligning(burn.sasMode, attitude.heading, state.orbit);

    const thrusting = burn.firing && !aligning && burn.fuelPct > 0;
    const aBase = thrusting ? engineAccel(state) : 0;
    const jitter = thrustJitter(state);
    const seed = noiseSeed(state);
    const noisePeriod = THRUST_NOISE_PERIOD_TAC * tacticalWarp;
    const dirX = Math.cos(attitude.heading);
    const dirY = Math.sin(attitude.heading);

    const nSub = Math.min(SIM_MAX_SUBSTEPS, Math.max(1, Math.ceil(dtWorld / SIM_SUBSTEP_MAX_SEC)));
    const h = dtWorld / nSub;
    // The clock advanced tSec before fanning out. The tick ends exactly where the clock now stands (a SKIP's tick lands on
    // its end point or a later burst's end, set exactly: WP10), so tEnd is read, not summed.
    const tEnd = state.clock.tSec;
    const tStart = tEnd - dtWorld;

    // Ghost thrust: a fixed (or swapped) controller silences a running burst at once; otherwise
    // a quiet engine rolls for a new one.
    const ghostSpec = caps.thrustCtrl.ghost;
    let ghost = burn.ghost;
    let ghostStarted = false;
    let ghostSilenced = false;
    if (ghostSpec === null) {
      clearGhostSchedule();
      ghostSilenced = ghost !== null;
      ghost = null;
    } else if (!ghost && burn.fuelPct > 0) {
      ghost = dueGhost(state, ghostSpec, tStart, tEnd);
      ghostStarted = ghost !== null;
    }
    // A burst that was already running and ends inside this tick: the next gap runs from its end, and a burst due
    // before the tick is out starts in it (but never a second start in one tick: one this tick began waits).
    let follow: GhostBurst | null = null;
    let drawnFromEnd = false;
    if (ghostSpec !== null && ghost !== null && !ghostStarted && ghost.endTSec < tEnd) {
      scheduleGhost(state, ghostSpec, ghost.endTSec);
      drawnFromEnd = true;
      follow = dueGhost(state, ghostSpec, ghost.endTSec, tEnd);
    }
    const bursts = [ghost, follow].filter((burst): burst is GhostBurst => burst !== null);

    const pos: Vec2 = { x: state.orbit.x, y: state.orbit.y };
    const vel: Vec2 = { x: state.orbit.vx, y: state.orbit.vy };
    let fuelDv = (burn.fuelPct / 100) * dvBudgetKmS;
    let delivered = 0;
    let crashed = false;
    let rDotVPrev = pos.x * vel.x + pos.y * vel.y;

    // LEAD-2: a SKIP tick is a coast (pace refuses SKIP while the engine fires, by hand or by itself), flown in one
    // exact jump along the conic. The heading is then stepped against where the jump ends, so a preset still points
    // along it when the SKIP stops. WP10: the jump may end at a LATER ghost burst's start (the ship's first burst
    // ends the SKIP before it; pace lands this tick on the later one's end), and the burst is then flown in sub-steps
    // like any tick (flySkipBurst).
    const skipTick = state.clock.pace === 'skip';
    const subSteps = skipTick ? 0 : nSub;
    let thrustSec = 0;
    if (skipTick) {
      if (aBase > 0 || burn.ghost !== null) {
        throw new Error(`orbit-sim: a SKIP tick with ${aBase > 0 ? 'thrust' : 'a ghost burst running'}: pace must end the SKIP first`);
      }
      if (ghost !== null && state.burn.ghostBursts === 0) {
        throw new Error('orbit-sim: the ship\'s first ghost burst inside a SKIP tick: pace must land the SKIP on its start');
      }
      const coastSec = ghost === null ? dtWorld : ghost.startTSec - tStart;
      const end = conicCoast(state.orbit, mu, coastSec);
      Object.assign(pos, { x: end.x, y: end.y });
      Object.assign(vel, { x: end.vx, y: end.vy });
      attitude = stepAttitude({ heading: burn.heading, omega: burn.omega }, burn.sasMode, burn.rotInput, end, coastSec);
      if (ghost !== null) {
        const flown = flySkipBurst(state, ghost, pos, vel, attitude, fuelDv, tEnd);
        attitude = flown.attitude;
        fuelDv = flown.fuelDv;
        delivered = flown.delivered;
        thrustSec = flown.thrustSec;
        crashed = flown.crashed;
      }
      aligning = isPresetAligning(burn.sasMode, attitude.heading, { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y });
      for (let i = 1; i < track.length && !crashed; i++) {
        crashed = segmentHitsCircle(track[i - 1]!.x, track[i - 1]!.y, track[i]!.x, track[i]!.y, planet.R);
      }
    } else {
      startTrack(pos);
    }

    for (let i = 0; i < subSteps; i++) {
      // Fuel drains by DELIVERED Δv inside the sub-step loop, so no warp can overspend it:
      // the sub-step where the tank empties delivers only its fuelled fraction, then a = 0.
      let accel = 0;
      if (aBase > 0 && fuelDv > 0) {
        accel = aBase * (1 + jitter * smoothNoise(seed, tStart + (i + 0.5) * h, noisePeriod));
      }
      if (fuelDv > 0) {
        for (const burst of bursts) accel += (state.level.aNominalKmS2 * burst.amp * ghostOverlap(burst, tStart + i * h, tStart + (i + 1) * h)) / h;
      }
      if (accel > 0) thrustSec += h;
      const step = thrustSubStep(pos, vel, h, mu, planet.R, accel, dirX, dirY, fuelDv);
      fuelDv = step.fuelDv;
      delivered += step.delivered;
      if (step.crashed) { crashed = true; break; }
      // For huge sub-steps (debug warp): if we just swung through periapsis and the osculating
      // periapsis is at/under the surface, the true arc grazed inside R even if the chord
      // didn't. Only on a sub-step with no thrust: only gravity alone turns r·v from falling to
      // climbing at ▼ and nowhere else. Thrust does it anywhere on the loop: a RETRO held at a far ▲
      // reverses the slow velocity and the preset turns to push it outward again, 2 million km from the
      // planet, and that read as a crash once the coast SKIP made such an ▲ seconds away (LEAD-2 review).
      const rDotVNow = pos.x * vel.x + pos.y * vel.y;
      if (step.accel === 0 && rDotVPrev < 0 && rDotVNow >= 0
        && elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu).rp <= planet.R) {
        crashed = true; break;
      }
      rDotVPrev = rDotVNow;
    }

    const radius = Math.hypot(pos.x, pos.y);
    const outbound = pos.x * vel.x + pos.y * vel.y > 0;
    const fit = ringFit(elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu), ring);
    // ▼ is behind on an open path: how long the kid has let that ride without a burn held
    // (WP1-rules 3a; pace stops holding TACTICAL for it after IGNORED_NOW_TAC).
    const missedOpen = !fit.closed && outbound;
    const missedIdleTac = missedOpen && !isBurnHeld(state) ? burn.missedIdleTac + dtWorld / tacticalWarp : 0;

    store.mutate((draft) => {
      draft.orbit.x = pos.x;
      draft.orbit.y = pos.y;
      draft.orbit.vx = vel.x;
      draft.orbit.vy = vel.y;
      draft.burn.heading = attitude.heading;
      draft.burn.omega = attitude.omega;
      draft.burn.fuelPct = (fuelDv / dvBudgetKmS) * 100;
      draft.burn.dvDeliveredKmS += delivered;
      draft.burn.lastTickDvKmS = delivered;
      draft.burn.missedIdleTac = missedIdleTac;
      // The game seconds thrust was delivered (WP10: a SKIP tick that flew a ghost burst counts the burst, not the jump).
      if (delivered > 0) draft.burn.thrustTac += thrustSec / tacticalWarp;
    });

    // A burst that started this tick is announced once the tick's physics is in; one whose
    // window closed inside this tick (or that ran the tank dry) ends here, and the one that followed it starts.
    const announceStart = (started: GhostBurst): void => {
      store.update((draft) => {
        draft.burn.ghost = started;
        draft.burn.ghostBursts++;
      });
      const count = store.getState().burn.ghostBursts;
      emit('ghost-start', { sticky: started.sticky, first: count === 1, count, inSkip: skipTick });
    };
    if (ghostStarted && ghost) announceStart(ghost);
    if (ghostSilenced || (ghost && (ghost.endTSec <= tEnd || fuelDv <= 0))) {
      // The next gap runs from the end of this burst (its window, or now for a dry tank), unless it was drawn
      // from there already for the burst that followed it.
      if (ghost && ghostSpec && !drawnFromEnd) scheduleGhost(store.getState(), ghostSpec, Math.min(ghost.endTSec, tEnd));
      endGhost(store);
      if (follow && ghostSpec && fuelDv > 0) {
        announceStart(follow);
        if (follow.endTSec <= tEnd) {
          scheduleGhost(store.getState(), ghostSpec, follow.endTSec);
          endGhost(store);
        }
      } else if (follow && ghostSpec) {
        // The tank ran dry in this tick: the burst that followed falls silent with the engine, and the next gap
        // runs from now (as for any burst a dry tank ends).
        scheduleGhost(store.getState(), ghostSpec, tEnd);
      }
    }

    const after = store.getState();
    const escapeRadius = ESCAPE_R_FACTOR * r0;
    // Receding on an open path with less FUEL than it takes to close the loop at all: nothing
    // the kid does can catch the planet any more, so the flight ends now instead of minutes of
    // watching the ship leave (WP1-rules 3b). With enough to close it, it keeps flying. A held
    // burn runs on until the tank is dry: the bound is a lower one, and cutting a kid off
    // mid-burn with FUEL left would read as the game giving up on them.
    const cannotClose = missedOpen && !isBurnHeld(after)
      && fuelDv < closeLoopDvKmS(radius, Math.hypot(vel.x, vel.y), mu, closeBoundRadius(after.level));

    let outcome: TerminalStatus | null = null;
    if (crashed) outcome = 'crashed';
    else if (missedOpen && (radius > escapeRadius || cannotClose)) outcome = 'escaped';
    else if (fuelDv <= 0) outcome = fuelOutOutcome(after, fit, outbound);

    if (aligning !== burn.presetAligning) {
      store.update((draft) => { draft.burn.presetAligning = aligning; });
    }
    if (outcome) endFlight(store, outcome);
  });

  // HOLD STEADY: the loop must stay in the ring with the engine quiet for LOCK_HOLD_AI_SEC
  // real seconds. A UI ritual, so AI time; the physical condition is re-checked every tick.
  // The same pass times the idle-on-a-closed-loop clock that offers ACCEPT ORBIT.
  const offAi = onAiTick((dtAi) => {
    const state = store.getState();
    if (state.burn.status !== 'approaching') return;
    const fit = ringFit(elementsFromState(state.orbit, state.level.planet.mu), state.level.ring);
    const quiet = state.burn.lastTickDvKmS === 0;
    const hold = fit.inRing && quiet ? state.burn.lockHoldAiSec + dtAi : 0;
    const idle = fit.closed && !fit.inRing && quiet ? state.burn.closedIdleAiSec + dtAi : 0;
    store.mutate((draft) => {
      draft.burn.lockHoldAiSec = hold;
      draft.burn.closedIdleAiSec = idle;
    });
    if (hold >= LOCK_HOLD_AI_SEC) endFlight(store, 'locked');
  });

  const offReset = onWorldReset('orbit-sim-ghost', () => {
    ghostRng = null;
    clearGhostSchedule();
    track.length = 0;
    trackChordSec.length = 0;
  }, () => ({ rolled: ghostRng !== null, nextGhostTSec, scheduled: scheduledFor !== null, track: track.length }));

  return () => { offGame(); offAi(); offReset(); mounted = false; };
}
