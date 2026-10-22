import type { GameState, SasMode } from '@state/schema';
import { playsTutorial } from '@systems/meta';
import { secUntil, liftPreset, type Prediction } from '@systems/predict';
import { presetHeading } from '@systems/attitude';
import { integrateStep } from '@systems/orbit-sim';
import { roleHealth, capabilitiesNow, engineFault } from '@systems/capabilities';
import { elementsFromState, type Vec2 } from '@/types/orbit';
import {
  BEAM_OUT_OFFER_TAC, BEAM_OUT_TAC, BEAM_OUT_LIFT_MAX_SEC, SIM_SUBSTEP_MAX_SEC, ENGINE_POWER_BY_BAND,
} from '@data/tuning';

// BEAM OUT's readers (§4.3, §9 WP7 item 6), pure and DOM-free: when the unit may leave a doomed ship, and
// how far the TRANSMITTING bar is. They live apart from systems/run.ts (which starts and cancels the bar
// and plays the soft fails) so the director and the HUD can read them without importing the run's
// phase machine, which imports the script.

// The tutorial run's first ship (run 1's, or the next one's if run 1 never flew it through): the first crash
// is only a simulation and BEAM OUT is not offered yet (§4.3, §9 WP7 item 6).
export function isTutorialShip(state: Readonly<GameState>): boolean {
  return playsTutorial(state.run) && state.run.shipIndex === 0;
}

// AI Comms can still reach ARRIVAL CONTROL (§3.3 C6): ok, degraded or failing. Dead or missing, there is
// no BEAM OUT and no emergency transmit: a crash ends the run.
export function commsUsable(state: Readonly<GameState>): boolean {
  const band = roleHealth(state, 'comms').band;
  return band === 'ok' || band === 'degraded' || band === 'failing';
}

// The thrust the OUT burn is judged at: the kid's POWER through the caps that stay. What passes by itself
// or by F2's REPAIR is left out: an op holding Engine I/O offline (a repair or a move), a dead driver (a
// REPAIR heals it), the Core's busy threads (they finish). Judged at those zeros, a ship one repair from
// safe read as hopeless and BEAM OUT's line went above the fix. 0 with no driver or controller file at
// all: nothing can fire.
function liftAccel(state: Readonly<GameState>): number {
  const caps = capabilitiesNow(state);
  const fault = engineFault(caps);
  if (fault === 'no-driver' || fault === 'no-controller') return 0;
  const driverCap = fault === null ? caps.engine.powerCap : ENGINE_POWER_BY_BAND.ok;
  return state.level.aNominalKmS2 * (state.burn.thrustPct / 100) * Math.min(driverCap, caps.reactor.bandCap);
}

// The Δv the lift (guidance's F4: predict.ts liftPreset, chosen again on every sub-step as the strip does) needs
// right now to lift ▼ out of the planet, flown ahead with the sim's integrator at `accel`; Infinity when that burn
// does not lift it before the ground. Once the burn has spent more than `budgetKmS` (the tank) it stops and returns
// what it spent: the tank can't pay for it, by however much.
export function liftOutDvKmS(state: Readonly<GameState>, accel: number, budgetKmS: number): number {
  if (!(accel > 0)) throw new Error(`liftOutDvKmS: no thrust to lift with (${accel})`);
  const { planet } = state.level;
  const pos: Vec2 = { x: state.orbit.x, y: state.orbit.y };
  const vel: Vec2 = { x: state.orbit.vx, y: state.orbit.vy };
  const reactionDvKmS = state.level.shrink.reactionTac * state.level.tacticalWarp * state.level.aNominalKmS2;
  let selected: SasMode = state.burn.sasMode;
  let spent = 0;
  for (let t = 0; t < BEAM_OUT_LIFT_MAX_SEC; t += SIM_SUBSTEP_MAX_SEC) {
    const orbit = { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y };
    if (elementsFromState(orbit, planet.mu).rp > planet.R) return spent;
    if (spent > budgetKmS) return spent;
    if (Math.hypot(pos.x, pos.y) <= planet.R) return Infinity;
    selected = liftPreset(orbit, planet.mu, planet.R, reactionDvKmS, selected);
    const heading = presetHeading(selected, orbit);
    integrateStep(pos, vel, SIM_SUBSTEP_MAX_SEC, planet.mu, accel * Math.cos(heading), accel * Math.sin(heading));
    spent += accel * SIM_SUBSTEP_MAX_SEC;
  }
  return Infinity;
}

// Tactical seconds to the impact on the true path, or null when it is not an impact course.
export function impactInTac(state: Readonly<GameState>, pred: Prediction): number | null {
  if (pred.outcome !== 'impact' || pred.impactInSec === null) return null;
  return secUntil(pred, pred.impactInSec, state.clock.tSec) / state.level.tacticalWarp;
}

// Why no burn can save a ship on an impact course, the strip's reason for BEAM OUT:
// • 'fuel': lifting ▼ out of the planet takes more Δv than the FUEL left;
// • 'too-late': no OUT burn lifts it before the ground, whatever the tank holds;
// • 'no-engine': no engine driver or thrust controller file at all, so nothing can fire.
export type Hopeless = 'fuel' | 'too-late' | 'no-engine';

// Why this ship can't be saved by burning, or null when a burn still can (or it is not on an impact
// course). A driver that is only offline or dead is judged as repaired (liftAccel): F2's REPAIR leads.
export function hopelessWhy(state: Readonly<GameState>, pred: Prediction): Hopeless | null {
  if (impactInTac(state, pred) === null) return null;
  const accel = liftAccel(state);
  if (!(accel > 0)) return 'no-engine';
  const fuelDv = (state.burn.fuelPct / 100) * state.level.dvBudgetKmS;
  const needed = liftOutDvKmS(state, accel, fuelDv);
  if (needed === Infinity) return 'too-late';
  return fuelDv < needed ? 'fuel' : null;
}

// The ship is doomed: on an impact course with the impact within BEAM_OUT_OFFER_TAC, or with no burn
// that can still save it.
export function shipDoomed(state: Readonly<GameState>, pred: Prediction): boolean {
  const inTac = impactInTac(state, pred);
  if (inTac === null) return false;
  if (inTac < BEAM_OUT_OFFER_TAC) return true;
  return hopelessWhy(state, pred) !== null;
}

// Why BEAM OUT can't be started now, or null when it can (§9 WP7 item 6).
export type BeamOutRefusal = 'not-flying' | 'tutorial' | 'no-comms' | 'not-doomed' | 'beaming' | 'paused';

export function beamOutRefusal(state: Readonly<GameState>, pred: Prediction): BeamOutRefusal | null {
  if (state.run.phase !== 'flight' || state.burn.status !== 'approaching' || state.run.coreLost) return 'not-flying';
  if (isTutorialShip(state)) return 'tutorial';
  if (!commsUsable(state)) return 'no-comms';
  if (state.run.beamOut !== null) return 'beaming';
  if (state.clock.paused) return 'paused';
  if (!shipDoomed(state, pred)) return 'not-doomed';
  return null;
}

// 0..1 of the TRANSMITTING bar.
export function beamOutProgress(state: Readonly<GameState>): number | null {
  const beam = state.run.beamOut;
  return beam === null ? null : Math.min(1, beam.progressTac / BEAM_OUT_TAC);
}

// What the HUD shows of BEAM OUT (the Engine button, COMMS' ABANDON SHIP, the strip):
// • 'beaming': the TRANSMITTING bar is filling (`progress` 0..1), with CANCEL;
// • 'offered': the button, live; 'offered-paused': the same button, resting while the game is paused
//   (pause is look-only), so it does not blink away and back;
// • 'hidden': not on offer (not doomed, the tutorial ship, no comms, the flight is over).
// `hopeless`: why no burn can save the ship (hopelessWhy), so BEAM OUT is the one right move and the strip
// says so with that reason; null while burning (or F2's REPAIR) is still the better answer and the button is
// only the way out.
export type BeamOutView =
  | { look: 'beaming'; progress: number; impactTac: number | null }
  | { look: 'hidden' | 'offered' | 'offered-paused'; hopeless: Hopeless | null; impactTac: number | null };

export function beamOutView(state: Readonly<GameState>, pred: Prediction): BeamOutView {
  const impactTac = impactInTac(state, pred);
  const progress = beamOutProgress(state);
  if (progress !== null && state.run.phase === 'flight' && state.burn.status === 'approaching') {
    return { look: 'beaming', progress, impactTac };
  }
  const refusal = beamOutRefusal(state, pred);
  const pausedButDoomed = refusal === 'paused' && shipDoomed(state, pred);
  if (refusal !== null && !pausedButDoomed) return { look: 'hidden', hopeless: null, impactTac };
  return { look: pausedButDoomed ? 'offered-paused' : 'offered', hopeless: hopelessWhy(state, pred), impactTac };
}
