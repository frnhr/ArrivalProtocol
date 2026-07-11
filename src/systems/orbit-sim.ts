import type { Store } from '@state/store';
import type { GameState, BurnStatus } from '@state/schema';
import { onGameTick } from '@systems/clock';
import { stepAttitude } from '@systems/attitude';
import { FUEL_BURN_RATE } from '@data/mission';
import { selectEngineEffectiveness, selectSensorConfidence } from '@state/selectors';
import { elementsFromState, type PlanetParams } from '@/types/orbit';

// 2D two-body orbital-insertion sim. The AI arrives on an APPROXIMATE hyperbola (a large
// miss; hidden true mass) and the player flies it in: a single main throttle thrusts
// along the ship's HEADING, which the player aims with momentum-carrying rotation
// thrusters (nulled by the stop-rotation button). The run resolves only when the player
// commits (END INSERTION) or fuel runs out — time to correct over multiple passes. The
// one immediate terminal is a CRASH (r <= R); a do-nothing flyby ESCAPES once it recedes
// far. On commit / fuel out the orbit is graded: INSERTED (whole orbit inside
// [rMin, rMax]), CAPTURED (closed but off-target), ESCAPED (still hyperbolic).
//
// Numeric churn (orbit + telemetry, 20Hz) goes through store.mutate (no subscriber
// fanout). The single terminal crossing goes through store.update so the footer, result
// banner, NAV PLOT terminal frame, and time controls react — written AFTER the final
// mutate so subscribers read consistent geometry. SI-ish units (km, s).

// Sub-stepping: never integrate the raw dtGame (at x10000 a 50ms tick = 500 game-s,
// which would tunnel through periapsis/surface). Cap the physics step so per-step
// travel stays well under the crash margin; MAX_SUBSTEPS bounds the work so extreme
// time-compression under-advances gracefully rather than locking the tab.
const MAX_PHYS_DT = 1.5;      // seconds per physics step
const MAX_SUBSTEPS = 4000;

// Attitude (rotation) lives in systems/attitude.ts — the manual thrusters and the SAS-style
// autopilot helpers, sharing one set of rotation caps (the future damage seam). Rotation
// runs in game-time, so set attitude at low time-compression: the autopilot snaps onto its
// target under heavy compression, manual rotation does not.

interface Vec { x: number; y: number; }
type Cartesian = { x: number; y: number; vx: number; vy: number };

// a = −μ·r̂/|r|² (gravity) + thrust along the ship's heading (inertial), magnitude
// aThrust. Thrust no longer depends on velocity, so over a sub-step the field is
// position-only and velocity-Verlet stays exactly symplectic.
function accel(pos: Vec, planet: PlanetParams, headingRad: number, aThrust: number): Vec {
  const r = Math.hypot(pos.x, pos.y);
  const invR3 = 1 / (r * r * r);
  let ax = -planet.mu * pos.x * invR3;
  let ay = -planet.mu * pos.y * invR3;
  if (aThrust > 0) {
    ax += aThrust * Math.cos(headingRad);
    ay += aThrust * Math.sin(headingRad);
  }
  return { x: ax, y: ay };
}

// True if the path segment a→b passes within radius R of the origin — used for the
// crash test so a single large step at high time-compression can't tunnel the ship
// clean through the planet without registering. Closest point on the segment to origin.
function segmentHitsCircle(ax: number, ay: number, bx: number, by: number, R: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return cx * cx + cy * cy <= R * R;
}

// Grade a committed orbit (END INSERTION button or fuel-out) from its shape alone:
// inserted / off-target / still-hyperbolic. A CRASH is a physical event — the ship actually
// reaching the surface, detected live in the sub-step loop — NOT something predicted from
// the orbit here. So an orbit whose periapsis dips below R is graded a (closed) capture, not
// a crash: commit while the ship is still alive above the surface and you captured; the ship
// only crashes if it actually falls in.
export function evaluateInsertion(
  orbit: Cartesian,
  planet: PlanetParams,
): Exclude<BurnStatus, 'briefing' | 'approaching' | 'crashed'> {
  const els = elementsFromState(orbit, planet.mu);
  if (els.e >= 1) return 'escaped'; // open trajectory — flew / flying by
  const ra = (els.rp * (1 + els.e)) / (1 - els.e);
  const inBand = (rr: number): boolean => rr >= planet.rMin && rr <= planet.rMax;
  return inBand(els.rp) && inBand(ra) ? 'inserted' : 'captured';
}

export function mountOrbitSim(store: Store<GameState>): () => void {
  return onGameTick((dtGame) => {
    const s0 = store.getState();
    if (s0.burn.status !== 'approaching') return;

    const planet = s0.level.planet;
    const burn = s0.burn;

    const fuelBefore = s0.telemetry.fuelPct;
    // Memory → flight: the drivetrain only delivers what its backing files can
    // carry (Engine I/O tool × active Thrust Controller copy). Fuel drain below
    // stays proportional to COMMANDED throttle — a damaged drivetrain burns the
    // same propellant for less thrust, which is the repair incentive.
    const engEff = selectEngineEffectiveness(s0);
    const aMax = fuelBefore > 0 ? (engEff * burn.thrustForce) / burn.trueMassMt : 0;
    const aThrust = (burn.thrustPct / 100) * aMax;
    const heading = burn.heading; // thrust direction this tick (fixed across sub-steps)

    const nSub = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dtGame / MAX_PHYS_DT)));
    const h = dtGame / nSub;

    const pos: Vec = { x: s0.orbit.x, y: s0.orbit.y };
    const vel: Vec = { x: s0.orbit.vx, y: s0.orbit.vy };

    // CRASH is the only mid-step terminal — flying into the planet can't be undone.
    let crashed = false;
    let rDotVPrev = pos.x * vel.x + pos.y * vel.y;
    for (let i = 0; i < nSub; i++) {
      const prevX = pos.x;
      const prevY = pos.y;
      // Velocity-Verlet (kick–drift–kick). Thrust is along the fixed heading, so the
      // field is position-only over the sub-step — exactly symplectic.
      let a = accel(pos, planet, heading, aThrust);
      const vxHalf = vel.x + 0.5 * a.x * h;
      const vyHalf = vel.y + 0.5 * a.y * h;
      pos.x += vxHalf * h;
      pos.y += vyHalf * h;
      a = accel(pos, planet, heading, aThrust);
      vel.x = vxHalf + 0.5 * a.x * h;
      vel.y = vyHalf + 0.5 * a.y * h;
      // Crash on the swept path, not just the endpoint — guards against tunneling.
      if (segmentHitsCircle(prevX, prevY, pos.x, pos.y, planet.R)) { crashed = true; break; }
      // Belt-and-suspenders for very large sub-steps (extreme time-compression): if we just
      // swung through periapsis and the osculating periapsis is at/under the surface, the
      // true arc grazed inside R even when the straight chord didn't quite dip below it.
      const rDotVNow = pos.x * vel.x + pos.y * vel.y;
      if (rDotVPrev < 0 && rDotVNow >= 0
        && elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, planet.mu).rp <= planet.R) {
        crashed = true; break;
      }
      rDotVPrev = rDotVNow;
    }

    const final: Cartesian = { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y };
    const r = Math.hypot(pos.x, pos.y);
    const speed = Math.hypot(vel.x, vel.y);
    const rDotV = pos.x * vel.x + pos.y * vel.y;
    const els = elementsFromState(final, planet.mu);
    const vRadial = r > 0 ? Math.abs(rDotV) / r : 0;
    const tToPeriHrs = rDotV < 0 ? (r - els.rp) / Math.max(vRadial, 1e-9) / 3600 : Infinity;

    // Fuel drains by GAME-TIME (∝ dtGame), independent of sub-step count.
    const fuelDelta = fuelBefore > 0 ? FUEL_BURN_RATE * (burn.thrustPct / 100) * dtGame : 0;
    const fuelAfter = Math.max(0, fuelBefore - fuelDelta);

    // Attitude (per tick, game-time): the autopilot helpers (sasMode) slew the heading
    // toward prograde / retrograde / radial / a held attitude; sasMode 'off' applies the
    // manual rotation thrusters. Both share one rotation authority — pass reduced caps here
    // later to model a damaged core. Pointing targets read the fresh post-step orbit.
    const { heading: headingNext, omega } = stepAttitude(
      { heading: burn.heading, omega: burn.omega },
      burn.sasMode,
      burn.holdTarget,
      burn.rotInput,
      final,
      dtGame,
    );

    // Terminal resolution. Only TWO automatic end conditions, both physical events: the
    // ship actually crashing into the surface (caught in the sub-step loop above), and the
    // tank running dry. Everything else — including a flyby that escapes to infinity — keeps
    // running; the player ends those manually with END INSERTION. Never auto-end otherwise.
    let outcome: BurnStatus | null = null;
    if (crashed) {
      outcome = 'crashed';
    } else if (fuelBefore > 0 && fuelAfter <= 0) {
      outcome = evaluateInsertion(final, planet); // auto-commit when the tank empties
    }

    // Final geometry + telemetry first (mutate, no fanout)…
    store.mutate((d) => {
      d.orbit.x = pos.x;
      d.orbit.y = pos.y;
      d.orbit.vx = vel.x;
      d.orbit.vy = vel.y;
      d.orbit.tToPeriHrs = tToPeriHrs;
      d.burn.heading = headingNext;
      d.burn.omega = omega;
      const t = d.telemetry;
      t.velocity = speed;
      t.distance = Math.max(0, r - planet.R);
      t.etaHrs = tToPeriHrs;
      t.fuelPct = fuelAfter;
      // Live sensor confidence from the Sensor Interp file's health — the HUD
      // readout tracks it via paintTelemetry; the NAV PLOT reads the selector
      // directly so its ghost band stays fresh even across pauses.
      t.sensorConfPct = selectSensorConfidence(s0);
    });

    // …then flip status (update → subscribers read consistent terminal geometry).
    if (outcome) {
      const final2: BurnStatus = outcome;
      store.update((d) => {
        d.burn.status = final2;
        d.clock.speed = 0;
        d.clock.speedTarget = 0;
      });
    }
  });
}
