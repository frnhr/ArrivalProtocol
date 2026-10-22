// LEAD-1 item 1: the reaction allowance at the shrink's stop. The verifier's kid lets go the moment
// the chip says CAPTURED, ignores SHRINK THE LOOP for a while, then holds it and lets go of the
// hand-over (`RELEASE [SPACE]! — next: brake at ▼ …`) a human reaction late. Before LEAD-1 the shrink
// stopped with ▼ exactly at the ring's inner edge, so a 0.3–0.6 s late release put ▼ under the ring,
// the line retyped to `burn at ▲`, the fix took three burns and the lock came with 27.3% FUEL instead
// of 33.6% (.tmp/verify-wp1-rules/logs/experience-shrink-lag.log, handover-trace.log).
import { createHarness, check, finish, TICK } from '../wp1/harness';
import { getPrediction } from '@systems/predict';
import { text, idle, releaseAtCapture, stepUntil, obey } from '../wp1-rules/flows';
import { SHRINK_REACTION_TAC, STAR_FUEL_PCT } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { ring } = state().level;

interface Run {
  handOver: string;      // the line that said to let go
  handOverRp: number;    // ▼ (radius, km) at that moment
  afterRelease: string;  // the line a moment after the late release
  rpAfter: number;       // ▼ after the late release
  planAfter: string;     // the burn planned then (ra-high: the trim at ▼; rp-low: the PRO at ▲ first)
  burns: number;         // burns the kid held from the hand-over to the lock
  status: string;
  fuel: number;
}

// Holds the shrink until the strip says RELEASE, keeps holding `lagSec` more, then obeys the strip.
function lateRelease(ignoreSec: number, lagSec: number): Run {
  releaseAtCapture(harness);
  idle(harness, ignoreSec);
  harness.keyDown('Space');
  stepUntil(harness, () => /^RELEASE/.test(text(harness)), 60);
  const handOver = text(harness);
  const handOverRp = getPrediction().rp;
  for (let held = 0; held < lagSec - 1e-9; held += TICK) harness.step();
  harness.keyUp('Space');
  for (let i = 0; i < 3; i++) harness.step();
  const afterRelease = text(harness);
  const pred = getPrediction();
  let burns = 0;
  let wasFiring = false;
  obey(harness, 400, () => {
    const firing = state().burn.firing;
    if (firing && !wasFiring) burns++;
    wasFiring = firing;
  });
  return {
    handOver, handOverRp, afterRelease, rpAfter: pred.rp, planAfter: pred.burnPoint?.reason ?? 'none',
    burns, status: harness.status(), fuel: state().burn.fuelPct,
  };
}

const describe = (run: Run): string =>
  `hand-over "${run.handOver}" at ▼ ${run.handOverRp.toFixed(0)} km; after: "${run.afterRelease}" ▼ ${run.rpAfter.toFixed(0)}, `
  + `plan ${run.planAfter}, ${run.burns} burn(s) to ${run.status}, FUEL ${run.fuel.toFixed(1)}%`;

// --- A kid who lets go within the allowance keeps the two-burn fix ------------------------------
// After 60 s and 90 s of ignoring, the shrink ends on a small loop with room for the whole allowance.
for (const ignoreSec of [60, 90]) {
  for (const lagSec of [0, 0.3, 0.45, SHRINK_REACTION_TAC - 0.1]) {
    const run = lateRelease(ignoreSec, lagSec);
    check(`ignored ${ignoreSec} s, released ${lagSec.toFixed(2)} s late: ▼ stays in the ring, the next burn is the brake at ▼, `
      + `one more burn locks it with the ★ FUEL left`,
      /^RELEASE \[SPACE\]! — next: brake at ▼/.test(run.handOver) && run.rpAfter >= ring.min && run.planAfter === 'ra-high'
      && /^WAIT — brake at ▼/.test(run.afterRelease) && run.burns === 1 && run.status === 'locked' && run.fuel >= 33,
      describe(run));
  }
}

// --- The hand-over itself leaves the allowance: ▼ above the inner edge by what 0.6 s of RETRO sinks it --
// (measured by the late release itself: TACTICAL is ×20, so a wall second is a tactical second).
{
  const lagSec = 0.5;
  const run = lateRelease(60, lagSec);
  const sinkPerTac = (run.handOverRp - run.rpAfter) / lagSec;
  const aboveTac = (run.handOverRp - ring.min) / sinkPerTac;
  check(`the hand-over comes with ▼ about ${SHRINK_REACTION_TAC} tac s of RETRO above the ring's inner edge (it was 5–20 km)`,
    aboveTac >= 0.8 * SHRINK_REACTION_TAC && aboveTac <= 1.5 * SHRINK_REACTION_TAC,
    `▼ ${(run.handOverRp - ring.min).toFixed(0)} km above ${ring.min} km, sinking ${sinkPerTac.toFixed(0)} km per tac s: `
    + `${aboveTac.toFixed(2)} tac s`);
}

// --- After 120 s the loop at the edge is only just small: the allowance is cut where it would turn big --
{
  const run = lateRelease(120, 0.25);
  check('ignored 120 s, released 0.25 s late: still the two-burn fix (the allowance stops at the small-loop size)',
    run.rpAfter >= ring.min && run.planAfter === 'ra-high' && run.burns === 1 && run.status === 'locked' && run.fuel >= 33,
    describe(run));
}

// --- Past the allowance it is the old three-burn fix, and it still locks ------------------------
for (const ignoreSec of [60, 120]) {
  const run = lateRelease(ignoreSec, 1.2);
  check(`ignored ${ignoreSec} s, released 1.2 s late: ▼ under the ring, the PRO at ▲ first, still locked above the ★`,
    run.rpAfter < ring.min && run.planAfter === 'rp-low' && run.status === 'locked' && run.fuel >= STAR_FUEL_PCT,
    describe(run));
}

finish();
