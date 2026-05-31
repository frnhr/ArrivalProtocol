import type { SasMode } from '@state/schema';

// Attitude control: the manual rotation thrusters and the SAS-style autopilot helpers,
// sharing one set of rotation caps. Pure functions (no store, no DOM) so the sim can call
// them and tests can drive them directly.

// Rotation authority of the attitude thrusters. The autopilot slews within these same
// limits the player feels in manual mode, so a turn always reads as a turn.
export const ROT_ACCEL = 0.12;    // rad/game-s² — angular accel while a thruster fires (punchy)
export const MAX_OMEGA = 0.0833;  // rad/game-s  — angular-velocity cap (~4.8°/s, deliberately slow)

// Damage seam: a degraded core could later slew slower / cap lower by passing reduced
// caps to stepAttitude. Default is full authority.
export interface RotCaps { rotAccel: number; maxOmega: number; }
export const DEFAULT_ROT_CAPS: RotCaps = { rotAccel: ROT_ACCEL, maxOmega: MAX_OMEGA };

// Minimal orbital state the autopilot needs to derive its pointing targets.
export interface OrbitVec { x: number; y: number; vx: number; vy: number; }

export interface Attitude { heading: number; omega: number; }

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle)); // → (−π, π]

// The heading an autopilot mode wants, given the live orbital state. null = manual ('off').
// 'hold' uses the heading captured when the mode was engaged.
export function sasTargetHeading(mode: SasMode, holdTarget: number, orbit: OrbitVec): number | null {
  switch (mode) {
    case 'off':        return null;
    case 'hold':       return holdTarget;
    case 'prograde':   return Math.atan2(orbit.vy, orbit.vx);
    case 'retrograde': return Math.atan2(-orbit.vy, -orbit.vx);
    case 'radial-out': return Math.atan2(orbit.y, orbit.x);   // away from the planet
    case 'radial-in':  return Math.atan2(-orbit.y, -orbit.x); // toward the planet
    default:           return null;
  }
}

// Manual step: held thrusters add torque (rotInput −1/0/+1), momentum persists (capped),
// heading integrates.
function stepManual(att: Attitude, rotInput: number, dt: number, caps: RotCaps): Attitude {
  const omega = clamp(att.omega + rotInput * caps.rotAccel * dt, -caps.maxOmega, caps.maxOmega);
  return { omega, heading: wrap(att.heading + omega * dt) };
}

// Autopilot step: a time-optimal slew that drives heading → target, arriving with ~zero
// spin (accelerate, coast at the cap, brake). Respects the same caps as manual.
function stepAuto(att: Attitude, target: number, dt: number, caps: RotCaps): Attitude {
  const err = wrap(target - att.heading);
  // If the whole error fits in one tick at the rate cap, lock on cleanly. This settles the
  // final approach without jitter AND keeps a hold stable under heavy time-compression,
  // where a discrete per-tick slew would otherwise overshoot and spin. (Because the no-snap
  // branch moves heading by at most maxOmega·dt < |err|, it can never overshoot the target.)
  if (Math.abs(err) <= caps.maxOmega * dt) {
    return { omega: 0, heading: wrap(target) };
  }
  // Fastest spin from which we can still brake to a stop by the target: ω = √(2·a·|err|).
  const omegaBrake = Math.sqrt(2 * caps.rotAccel * Math.abs(err));
  const omegaWant = Math.sign(err) * Math.min(caps.maxOmega, omegaBrake);
  // Step ω toward that, limited by the torque available this tick; integrate heading.
  const omega = clamp(
    att.omega + clamp(omegaWant - att.omega, -caps.rotAccel * dt, caps.rotAccel * dt),
    -caps.maxOmega,
    caps.maxOmega,
  );
  return { omega, heading: wrap(att.heading + omega * dt) };
}

// One attitude update for a game tick. With sasMode 'off' the manual thrusters apply;
// otherwise the autopilot drives toward its target and rotInput is ignored. `caps` is the
// damage seam — pass reduced authority to model a degraded core.
export function stepAttitude(
  att: Attitude,
  sasMode: SasMode,
  holdTarget: number,
  rotInput: number,
  orbit: OrbitVec,
  dt: number,
  caps: RotCaps = DEFAULT_ROT_CAPS,
): Attitude {
  const target = sasTargetHeading(sasMode, holdTarget, orbit);
  return target === null
    ? stepManual(att, rotInput, dt, caps)
    : stepAuto(att, target, dt, caps);
}
