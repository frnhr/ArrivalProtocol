import type { SasMode, PresetMode } from '@state/schema';
import { ROT_ACCEL, MAX_OMEGA, PRESET_ALIGN_DEG } from '@data/tuning';

// Attitude control: the four presets (select-only autopilot targets) and the MANUAL fold's
// momentum-carrying thrusters, sharing one set of rotation caps. Pure functions (no store,
// no DOM) so the sim can call them and tests can drive them directly.

// Damage seam: a degraded Autopilot could later slew slower by passing reduced caps.
export interface RotCaps { rotAccel: number; maxOmega: number; }
export const DEFAULT_ROT_CAPS: RotCaps = { rotAccel: ROT_ACCEL, maxOmega: MAX_OMEGA };

// Minimal orbital state the presets need to derive their pointing targets.
export interface OrbitVec { x: number; y: number; vx: number; vy: number; }

export interface Attitude { heading: number; omega: number; }

const DEG2RAD = Math.PI / 180;
const ALIGN_TOLERANCE_RAD = PRESET_ALIGN_DEG * DEG2RAD;

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle)); // → (−π, π]

// Below this |r̂ − (r̂·v̂)v̂| the ship moves straight along the radius and "radial" in the
// velocity frame is undefined.
const DEGENERATE_NORM = 1e-9;

// Velocity-frame radial (KSP-style): radial-out = normalize(r̂ − (r̂·v̂)v̂), the component of
// "away from the planet" perpendicular to the velocity; radial-in is its negative.
// WHY: on an inbound arrival the velocity points mostly AT the planet, so thrust along the
// raw radius vector is nearly retrograde, has almost no torque on the orbit and barely moves
// the periapsis. Perpendicular to v it rotates the path itself (0.8 km/s OUT at r 12,000 lifts
// rp by ~3,000 km). On a circular orbit r̂ ⊥ v̂, so this equals the old radius-vector radial.
function radialOutHeading(orbit: OrbitVec): number {
  const radius = Math.hypot(orbit.x, orbit.y);
  const speed = Math.hypot(orbit.vx, orbit.vy);
  const rx = orbit.x / radius;
  const ry = orbit.y / radius;
  const vx = orbit.vx / speed;
  const vy = orbit.vy / speed;
  const along = rx * vx + ry * vy;
  const outX = rx - along * vx;
  const outY = ry - along * vy;
  if (Math.hypot(outX, outY) < DEGENERATE_NORM) {
    // Pure radial motion: every perpendicular is equally "out". Pick the counter-clockwise
    // tangent of r̂, which adds h > 0 (the sense every ship in the game orbits in).
    return Math.atan2(rx, -ry);
  }
  return Math.atan2(outY, outX);
}

// The inertial heading a preset points at for the given state.
export function presetHeading(mode: PresetMode, orbit: OrbitVec): number {
  switch (mode) {
    case 'prograde':   return Math.atan2(orbit.vy, orbit.vx);
    case 'retrograde': return Math.atan2(-orbit.vy, -orbit.vx);
    case 'radial-out': return radialOutHeading(orbit);
    case 'radial-in':  return wrap(radialOutHeading(orbit) + Math.PI);
  }
}

// null = MANUAL ('off'): the heading is whatever the Q/E thrusters left it at.
export function sasTargetHeading(mode: SasMode, orbit: OrbitVec): number | null {
  return mode === 'off' ? null : presetHeading(mode, orbit);
}

// True while a preset's target is more than PRESET_ALIGN_DEG away: the engine gives no
// thrust (the burn button reads ALIGNING…). MANUAL is never "aligning".
export function isPresetAligning(mode: SasMode, heading: number, orbit: OrbitVec): boolean {
  const target = sasTargetHeading(mode, orbit);
  if (target === null) return false;
  return Math.abs(wrap(target - heading)) > ALIGN_TOLERANCE_RAD;
}

// The ship flies along `mode`: its preset is `mode`, or, with no preset held (MANUAL: a failing Autopilot lets go of the
// presets), the heading the kid turned to by hand is within PRESET_ALIGN_DEG of `mode`'s (the tolerance a preset fires
// at). GO LOWER's hold reads it (review minor 7: under MANUAL it could never be held).
export function fliesAlong(mode: PresetMode, sasMode: SasMode, heading: number, orbit: OrbitVec): boolean {
  if (sasMode === mode) return true;
  return sasMode === 'off' && Math.abs(wrap(presetHeading(mode, orbit) - heading)) <= ALIGN_TOLERANCE_RAD;
}

// Manual step: held thrusters add torque (rotInput −1/0/+1), momentum persists (capped),
// heading integrates.
function stepManual(att: Attitude, rotInput: number, dt: number, caps: RotCaps): Attitude {
  const omega = clamp(att.omega + rotInput * caps.rotAccel * dt, -caps.maxOmega, caps.maxOmega);
  return { omega, heading: wrap(att.heading + omega * dt) };
}

// Preset step: a time-optimal slew that drives heading → target, arriving with ~zero
// spin (accelerate, coast at the cap, brake). Respects the same caps as manual.
function stepAuto(att: Attitude, target: number, dt: number, caps: RotCaps): Attitude {
  const err = wrap(target - att.heading);
  // If the whole error fits in one tick at the rate cap, lock on cleanly. This settles the
  // final approach without jitter AND keeps a preset stable under heavy time-compression,
  // where a discrete per-tick slew would otherwise overshoot and spin.
  if (Math.abs(err) <= caps.maxOmega * dt) {
    return { omega: 0, heading: wrap(target) };
  }
  // Fastest spin from which we can still brake to a stop by the target: ω = √(2·a·|err|).
  const omegaBrake = Math.sqrt(2 * caps.rotAccel * Math.abs(err));
  const omegaWant = Math.sign(err) * Math.min(caps.maxOmega, omegaBrake);
  const omega = clamp(
    att.omega + clamp(omegaWant - att.omega, -caps.rotAccel * dt, caps.rotAccel * dt),
    -caps.maxOmega,
    caps.maxOmega,
  );
  return { omega, heading: wrap(att.heading + omega * dt) };
}

// One attitude update for a game tick. A preset drives toward its target and ignores
// rotInput; MANUAL applies the thrusters.
export function stepAttitude(
  att: Attitude,
  sasMode: SasMode,
  rotInput: number,
  orbit: OrbitVec,
  dt: number,
  caps: RotCaps = DEFAULT_ROT_CAPS,
): Attitude {
  const target = sasTargetHeading(sasMode, orbit);
  return target === null
    ? stepManual(att, rotInput, dt, caps)
    : stepAuto(att, target, dt, caps);
}
