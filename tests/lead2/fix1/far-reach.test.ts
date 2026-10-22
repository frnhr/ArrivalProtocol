// LEAD-2 review round 1, the fixes that show on ship 1's long WAITs (any ship: AP_SHIP=1, 2).
// • No false CRASHED far out: SPACE held with RETRO selected during the long SKIP (since review round 2: SPACE pressed
//   once to stop the SKIP, then held), 2 million km out, reverses the slow
//   velocity at ▲ and the preset turns to push it outward again. The sim's "swung through ▼ under the surface" test read
//   that change of r·v as a pass through ▼ and ended the flight CRASHED at 2.2 million km (the experience review's
//   `space-mid-skip.ts`). It now looks only at sub-steps with no thrust.
// • A SKIP on a loop tens of millions of km across lands SKIP_END_LEAD_TAC before its burn whichever 10 Hz refresh the
//   F lands after (it landed at 0:39 to 14:19 in the browser): its end point comes from a prediction of that moment.
// • The FUEL readout's `short` is the plan's own verdict (Prediction.fuelShort), the strip's: they never disagree while
//   a trim is held (they did for 4.2 s at 31.5% FUEL), and a short tank whose burn is still the plan says USE IT ALL.
import { readFileSync } from 'node:fs';
import { createHarness, check, finish, HARNESS_SHIP } from '../../wp1/harness';
import { getPrediction, secUntil } from '@systems/predict';
import { fuelModel } from '@systems/flight-hud';
import { releaseAtCapture, idle, obey, stepUntil, text } from '../../wp1-rules/flows';
import { SKIP_END_LEAD_TAC } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const ship = `ship ${HARNESS_SHIP + 1}`;
// The FUEL of the very large loops' SKIP case. WP10: VESPER's 25% (0.45 km/s of a 1.8 km/s tank) is ACCEPT ORBIT on
// a 25M km loop (NOT ENOUGH FUEL to reach the printers: no WAIT, no SKIP); it flies ship 1's 25% in km/s (0.7 km/s: 39%).
// WP11: LAST LIGHT (2.5 km/s) flies the same 0.7 km/s: 28%.
const FAR_LOOP_FUEL_PCT = [25, 25, 25, 39, 28][HARNESS_SHIP];
if (FAR_LOOP_FUEL_PCT === undefined) throw new Error(`far-reach: no FUEL set for ship ${HARNESS_SHIP}`);

// --- SPACE held mid-SKIP, far out: no false CRASHED -----------------------------------------------------------------
const FAR_RING_RADII = 20;
{
  const rows: string[] = [];
  let bad = '';
  for (const [intoSkipSec, holdSec] of [[3, 3], [3.5, 2], [4, 3]] as const) {
    releaseAtCapture(harness);
    harness.store.mutate((d) => { d.burn.fuelPct = 25; });
    stepUntil(harness, () => /^WAIT — brake at ▼/.test(text(harness)), 4000);
    harness.press('KeyF');
    idle(harness, intoSkipSec);
    const farKm = Math.hypot(state().orbit.x, state().orbit.y);
    // LEAD-2 review round 2 (the lead's ruling): a press during the SKIP only stops it, so the RETRO hold this check
    // is about is a fresh press after that stop.
    harness.press('Space');
    harness.step();
    harness.keyDown('Space');
    let crashedFarKm: number | null = null;
    const watch = (): void => {
      if (harness.status() === 'crashed' && crashedFarKm === null) crashedFarKm = Math.hypot(state().orbit.x, state().orbit.y);
    };
    for (let t = 0; t < holdSec && harness.status() === 'approaching'; t += 0.05) { harness.step(); watch(); }
    harness.keyUp('Space');
    for (let t = 0; t < 2 && harness.status() === 'approaching'; t += 0.05) { harness.step(); watch(); }
    const row = `SPACE ${intoSkipSec} s into the SKIP at ${(farKm / 1e6).toFixed(2)}M km, held ${holdSec} s: ${harness.status()}`
      + `${crashedFarKm === null ? '' : ` at ${(crashedFarKm / 1e6).toFixed(2)}M km`}, "${text(harness)}"`;
    rows.push(row);
    // Far out: tens of ring radii (ship 1's loop reaches 2.5 million km, KESTREL's a quarter of that); a few tactical
    // seconds there can't bring the ship down to the planet, so any CRASHED is false.
    if (farKm < FAR_RING_RADII * state().level.ring.max || crashedFarKm !== null) bad ||= row;
  }
  check(`${ship}: SPACE held with RETRO during the long SKIP, ${FAR_RING_RADII} ring radii and more out: the flight never ends CRASHED out there`,
    !bad, bad || rows.join(' | '));
}

// --- A SKIP on a very large loop lands 15 tac s before its burn, from either refresh phase --------------------------
{
  const stages = JSON.parse(readFileSync('tests/wp1-rules/stage-states.json', 'utf8')) as { name: string; orbit: { x: number; y: number; vx: number; vy: number } }[];
  const shrinkStage = stages.find((stage) => stage.name === 'shrink');
  if (!shrinkStage) throw new Error('far-reach: no shrink stage');
  const rows: string[] = [];
  let bad = '';
  let staleSeen = false;
  for (const semiMajorKm of [12.5e6, 40e6]) {
    for (const ticks of [49, 50]) {
      harness.reset(1);
      const { orbit } = shrinkStage;
      harness.store.mutate((d) => {
        const mu = d.level.planet.mu;
        const radius = Math.hypot(orbit.x, orbit.y);
        const speed = Math.hypot(orbit.vx, orbit.vy);
        const want = Math.sqrt(mu * (2 / radius - 1 / semiMajorKm));
        Object.assign(d.orbit, { x: orbit.x, y: orbit.y, vx: (orbit.vx * want) / speed, vy: (orbit.vy * want) / speed });
        d.burn.fuelPct = FAR_LOOP_FUEL_PCT;
        d.burn.sasMode = 'retrograde';
        d.burn.heading = Math.atan2(-orbit.vy, -orbit.vx);
        d.burn.omega = 0;
      });
      for (let i = 0; i < ticks; i++) harness.step();
      const warp = state().level.tacticalWarp;
      const staleTac = (state().clock.tSec - getPrediction().asOfTSec) / warp;
      if (staleTac > 0) staleSeen = true;
      harness.press('KeyF');
      // Read on the landing tick itself: the clock stands exactly on the SKIP's end point.
      let leftTac = NaN;
      stepUntil(harness, () => {
        const clock = state().clock;
        if (clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) {
          const pred = getPrediction();
          leftTac = pred.burnPoint ? secUntil(pred, pred.burnPoint.inSec, clock.tSec) / warp : NaN;
        }
        return clock.skipWarp === null;
      }, 30);
      const row = `a ${semiMajorKm / 1e6}M km, F ${staleTac.toFixed(1)} tac s after the last refresh: lands ${leftTac.toFixed(2)} tac s before the burn`;
      rows.push(row);
      if (!(Math.abs(leftTac - SKIP_END_LEAD_TAC) < 0.1)) bad ||= row;
    }
  }
  check(`${ship}: a SKIP on a 25M / 80M km loop lands ${SKIP_END_LEAD_TAC} tac s before its burn, also when F comes between two refreshes`,
    !bad && staleSeen, bad || rows.join(' | '));
}

// --- The FUEL readout and the strip agree on a short tank -----------------------------------------------------------
{
  const rows: string[] = [];
  let mismatches = 0;
  let useItAll = false;
  for (const fuel of [30, 31, 31.5, 32, 33]) {
    releaseAtCapture(harness);
    idle(harness, 60);
    harness.store.mutate((d) => { d.burn.fuelPct = fuel; });
    let rowMismatches = 0;
    obey(harness, 200, () => {
      const current = state();
      if (current.burn.status !== 'approaching') return;
      const pred = getPrediction();
      const hud = fuelModel(current, pred);
      if (hud.neededPct === null) return;
      if (hud.short !== pred.fuelShort) rowMismatches++;
      if (hud.short && /· USE IT ALL$/.test(hud.needText)) useItAll = true;
      if (hud.short && !/· USE IT ALL$/.test(hud.needText)) rowMismatches++;
    });
    mismatches += rowMismatches;
    rows.push(`${fuel}%: ${rowMismatches} ticks apart, ${harness.status()}`);
  }
  check(`${ship}: let go at CAPTURED, 60 s idle, 30–33% FUEL, the strip obeyed: the FUEL readout's short tank is the strip's on every tick, and says USE IT ALL`,
    mismatches === 0 && useItAll, rows.join(' | '));
}

finish();
