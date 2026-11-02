// LEAD-2 item 1: the analytic coast SKIP. A SKIP is a pure coast, so the sim flies it in exact jumps along the Kepler
// orbit (types/orbit.ts propagateConic, orbit-sim.ts conicCoast) with no warp ceiling, its warp ramps up in about
// SKIP_RAMP_SEC and its last tick lands exactly SKIP_END_LEAD_TAC before the event. Goal: no WAIT the strip offers
// costs more than a few seconds of wall time. Runs on any ship (AP_SHIP=1, 2: tests/unit/lead2/per-ship.test.ts).
//  1. the propagator against the sim's own integrator (h = 0.25 s), on this ship's planet;
//  2. the SKIP's look on a WAIT of about 35,000 tactical minutes: the warp ramps and holds, the clock races, the ship
//     sweeps along its loop (the conic itself does not change), and it lands exactly 15 tac s before START BURN;
//  3. the lead's cases: LEAD-1's deviation 1 (SHRINK ignored for an hour, full tank), the low capture with ▼ 3,450 km
//     (HALCYON's 49-day WAIT, and the PRO/RETRO ping-pong at ▲ the coast SKIP exposed behind it), and the off-ring
//     rows that took one SKIP of 158 s on HALCYON (▼ 4,300 km, ignored 120 s, 44–46% FUEL);
//  4. a press during a SKIP under a WAIT only stops it (review round 2, the lead's ruling): SPACE, held or pressed again
//     from the MIND, burns nothing until a fresh press. [B], which can't engage AUTOBURN on this closed loop, buzzes its
//     refusal and the SKIP runs on (review round 3; the lines that ask for SPACE are tests/unit/lead2/fix3/skip-press.test.ts).
import { createHarness, check, finish, TICK, HARNESS_SHIP } from '../wp1/harness';
import { getPrediction } from '@systems/predict';
import { integrateStep } from '@systems/orbit-sim';
import { paceLabel, countdownChip } from '@systems/flight-hud';
import { propagateConic, stateFromElements, elementsFromState } from '@/types/orbit';
import { releaseAtCapture, captureOffRing, idle, obey, text, stepUntil, flyOnce, longWait as sharedLongWait } from '../wp1-rules/flows';
import { fullOnly, byDepth } from '../depth';
import { resumeHeldThrottle } from '@systems/flight-controls';
import { pressAutoburn, autoburnRefusal } from '@systems/autoburn';
import { asksToHoldSpace } from '@systems/guidance';
import { AUTOBURN_REFUSAL } from '@data/skill-text';
import { on } from '@systems/events';
import { SKIP_DIVISOR, SKIP_RAMP_SEC, SKIP_EASE_OUT_SEC, SKIP_END_LEAD_TAC } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { planet, ring, tacticalWarp, cruiseWarp } = state().level;
const mu = planet.mu;
// What "a few seconds" of SKIP means: the ramp, SKIP_DIVISOR at its warp, the ease-out (fix round 1) and a tick or two.
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + SKIP_EASE_OUT_SEC + 1;
const ship = `ship ${HARNESS_SHIP + 1}`;

// Flies `harness` until the flight ends, and keeps the longest single SKIP and how often each line came up.
function flyObeying(maxWall: number): { longestSkipSec: number; skipSec: number; lines: string[]; nowCount: number } {
  let run = 0;
  let longest = 0;
  let nowCount = 0;
  let prev = '';
  const log = obey(harness, maxWall, () => {
    run = state().clock.pace === 'skip' ? run + TICK : 0;
    longest = Math.max(longest, run);
    const line = text(harness);
    if (line === 'HOLD [SPACE] NOW' && prev !== line) nowCount++;
    prev = line;
  });
  return { longestSkipSec: longest, skipSec: log.skipWallSec, lines: log.lines, nowCount };
}

// --- 1. The propagator is exact two-body motion, as the integrator approximates it -----------------------------
{
  const cases = [
    { name: 'flyby inbound', rp: ring.max, e: 1.4, nu: -2.0, dt: 5000 },
    { name: 'just-captured loop', rp: ring.min + 1000, e: 0.999, nu: 0.6, dt: 20000 },
    { name: 'small loop', rp: ring.min + 1000, e: 0.2, nu: 1.0, dt: 30000 },
  ];
  const rows: string[] = [];
  let worst = 0;
  let worstCompose = 0;
  for (const item of cases) {
    const start = stateFromElements(item.rp, item.e, 0.4, item.nu, mu);
    const pos = { x: start.x, y: start.y };
    const vel = { x: start.vx, y: start.vy };
    for (let t = 0; t < item.dt - 1e-9; t += 0.25) integrateStep(pos, vel, Math.min(0.25, item.dt - t), mu, 0, 0);
    const jump = propagateConic(start, mu, item.dt);
    const halves = propagateConic(propagateConic(start, mu, item.dt / 2), mu, item.dt / 2);
    const offKm = Math.hypot(jump.x - pos.x, jump.y - pos.y);
    const composeKm = Math.hypot(halves.x - jump.x, halves.y - jump.y);
    worst = Math.max(worst, offKm);
    worstCompose = Math.max(worstCompose, composeKm);
    rows.push(`${item.name}: ${offKm.toExponential(1)} km from the integrator`);
  }
  check(`${ship}: propagateConic lands within 1 m of the sim's integrator (h 0.25 s), and two half jumps make one`,
    worst < 1e-3 && worstCompose < 1e-6, `${rows.join(', ')}; halves vs one ${worstCompose.toExponential(1)} km`);
}

// Let go at CAPTURED and left alone until SHRINK THE LOOP has lapsed (late in the climb: about half an hour on
// HALCYON and KESTREL, an hour on ship 1): the strip offers the brake at the next ▼, 10,000–35,000 tactical minutes away.
// Flown once, restored for the later scenarios (flows.ts longWait).
const longWait = (): void => sharedLongWait(harness);

// --- 2. The SKIP's look on a long WAIT ---------------------------------------------------------------------------
{
  longWait();
  const line = text(harness);
  const before = elementsFromState(state().orbit, mu);
  const pred = getPrediction();
  const waitTac = pred.burnPoint ? (pred.burnPoint.inSec - (state().clock.tSec - pred.asOfTSec)) / tacticalWarp : NaN;
  const t0 = state().clock.tSec;
  harness.press('KeyF');
  let wallSec = 0;
  let maxSpeed = 0;
  let ramped = true;
  let easing = false;   // fix round 1: past its peak the warp glides back down onto the end point, and only down
  let lastSpeed = 0;
  const speeds: number[] = [];
  let farthest = 0;
  let label = '';
  let chipFast = false;
  let landedTac = NaN;
  let landedTSec = NaN;
  while (state().clock.skipWarp !== null && wallSec < 60) {
    harness.step();
    wallSec += TICK;
    const clock = state().clock;
    if (clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) {
      // The landing tick: the clock stands exactly on the SKIP's end point.
      landedTac = harness.burnPointTac() ?? NaN;
      landedTSec = clock.tSec;
    }
    if (clock.pace !== 'skip') continue;
    // While it SKIPs, the warp only ever climbs, then holds, then (the ease-out) only ever falls.
    if (clock.speed < lastSpeed) easing = true;
    else if (easing && clock.speed > lastSpeed) ramped = false;
    lastSpeed = clock.speed;
    speeds.push(clock.speed);
    maxSpeed = Math.max(maxSpeed, clock.speed);
    farthest = Math.max(farthest, Math.hypot(state().orbit.x, state().orbit.y));
    if (!label) label = paceLabel(state());
    chipFast ||= countdownChip(state(), getPrediction())?.fastForward === true;
  }
  const after = elementsFromState(state().orbit, mu);
  const raceTac = (landedTSec - t0) / tacticalWarp;
  check(`${ship}: a WAIT of ${(waitTac / 60).toFixed(0)} tactical minutes ("${line.replace(/\d+:\d+/, 'm:ss')}") takes one SKIP of a few seconds`,
    /^WAIT — brake at ▼ in \d+:\d\d · \[F\] SKIP$/.test(line) && waitTac > 60 * 60 && wallSec <= FEW_SKIP_SEC && wallSec >= SKIP_DIVISOR,
    `${wallSec.toFixed(2)} wall s`);
  check(`${ship}: …it lands exactly ${SKIP_END_LEAD_TAC} tac s before START BURN`,
    Math.abs(landedTac - SKIP_END_LEAD_TAC) < 0.01, `${landedTac.toFixed(4)} tac s before`);
  // The ease-out: the last tick at SKIP pace runs within a decade of CRUISE, and the fall to it takes several ticks.
  const easeTicks = speeds.length - speeds.lastIndexOf(maxSpeed) - 1;
  const easedTo = speeds[speeds.length - 1] ?? Infinity;
  check(`${ship}: …the time-lapse: the warp ramps up, holds (×${maxSpeed.toExponential(1)}) and eases back down over ${easeTicks} ticks, the clock races, the header says SKIP ▸▸`,
    ramped && easeTicks >= 8 && easeTicks <= 2 * SKIP_EASE_OUT_SEC / TICK && easedTo < 10 * cruiseWarp && maxSpeed > 100 * cruiseWarp && Math.abs(raceTac - (waitTac - SKIP_END_LEAD_TAC)) < 0.01 && /^SKIP ▸▸ ×/.test(label) && chipFast,
    `"${label}", the clock moved ${(raceTac / 60).toFixed(0)} tac min, chip ▸▸ ${chipFast}`);
  check(`${ship}: …the ship sweeps along its loop out to ▲ and back, and the loop itself is untouched (a pure coast)`,
    farthest > 0.9 * pred.ra && Math.abs(after.rp - before.rp) / before.rp < 1e-6 && Math.abs(after.e - before.e) < 1e-9,
    `farthest ${farthest.toFixed(0)} km of ▲ ${pred.ra.toFixed(0)}; ▼ ${before.rp.toFixed(3)} → ${after.rp.toFixed(3)} km, e Δ ${(after.e - before.e).toExponential(1)}`);
  flyObeying(120);
  check(`${ship}: …and the flight then locks`, harness.status() === 'locked', `${harness.status()}, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- 3a. LEAD-1's deviation 1: SHRINK THE LOOP ignored for an hour with a full tank --------------------------------
// It was `WAIT — brake at ▼ in 35248:24 · [F] SKIP` with 68% FUEL: about six wall hours of SKIP.
fullOnly(`${ship}: SHRINK ignored for an hour (LEAD-1 deviation 1)`, () => {
  releaseAtCapture(harness);
  idle(harness, 3600);
  const offer = text(harness);
  const start = harness.wall();
  const flown = flyObeying(300);
  check(`${ship}: SHRINK ignored for an hour (LEAD-1 deviation 1): the WAIT is a few seconds of SKIP, and it locks`,
    harness.status() === 'locked' && flown.longestSkipSec <= FEW_SKIP_SEC,
    `"${offer.replace(/\d+:\d+/, 'm:ss')}" → ${harness.status()} after ${(harness.wall() - start).toFixed(0)} s, longest SKIP ${flown.longestSkipSec.toFixed(1)} s, `
    + `FUEL ${state().burn.fuelPct.toFixed(1)}%`);
});

// --- 3b. The low capture, ▼ 3,450 km (HALCYON's 49-day WAIT) ---------------------------------------------------
// The review's probe (.tmp/review/WP7/spec/low-capture-3450.ts, log tests/unit/wp7/fix1/halcyon-low-capture-3450.log): the
// opening correction stopped at ▼ 3,450 km, the capture held to CAPTURED, 20 s of idling, then the strip obeyed with F
// pressed whenever offered. With the coast SKIP alone the WAIT took seconds, but the PRO at ▲ of that loop moved ▼
// clean across the ring in one tick and the strip asked for PRO/RETRO pairs eleven times (270 s); predict.ts
// trimFlyable now takes the RETRO at ▼ first.
{
  captureOffRing(harness, 3450);
  stepUntil(harness, () => /HOLD \[SPACE\] NOW/.test(text(harness)), 120);
  harness.keyDown('Space');
  stepUntil(harness, () => getPrediction().outcome === 'closed', 60);
  harness.keyUp('Space');
  idle(harness, 20);
  const offer = text(harness);
  const start = harness.wall();
  const flown = flyObeying(400);
  check(`${ship}: the low capture (▼ 3,450 km): locked within 2 minutes, every SKIP a few seconds, at most two NOW burns after the offer`,
    harness.status() === 'locked' && harness.wall() - start < 120 && flown.longestSkipSec <= FEW_SKIP_SEC && flown.nowCount <= 2,
    `"${offer.replace(/\d+:\d+/, 'm:ss')}" → ${harness.status()} after ${(harness.wall() - start).toFixed(0)} s, `
    + `${flown.nowCount} HOLD NOW, longest SKIP ${flown.longestSkipSec.toFixed(1)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- 3c. The off-ring rows that took one 158 s SKIP on HALCYON ---------------------------------------------------
{
  const rows: string[] = [];
  let bad = '';
  // Quick depth: the rows' low end (slice 3a's review fixes, the unit tier's budget; the capture and the ignore are the
  // rows' cost, flown once either way); full: all three.
  for (const fuelPct of byDepth([44], [44, 45, 46])) {
    // The rows differ only in the FUEL set after the ignore: the capture and the ignore are flown once (flows.ts flyOnce).
    flyOnce(harness, 'off the ring 4,300 km, ignored 120 s', () => {
      captureOffRing(harness, 4300);
      stepUntil(harness, () => /HOLD \[SPACE\] NOW/.test(text(harness)), 120);
      harness.keyDown('Space');
      stepUntil(harness, () => getPrediction().outcome === 'closed', 60);
      harness.keyUp('Space');
      idle(harness, 120);
    });
    harness.store.mutate((d) => { d.burn.fuelPct = Math.min(d.burn.fuelPct, fuelPct); });
    for (let i = 0; i < 4; i++) harness.step();
    const flown = flyObeying(400);
    rows.push(`${fuelPct}%: ${harness.status()}, longest SKIP ${flown.longestSkipSec.toFixed(1)} s`);
    if (!['locked', 'accepted'].includes(harness.status()) || flown.longestSkipSec > FEW_SKIP_SEC) bad ||= rows[rows.length - 1]!;
  }
  check(`${ship}: off the ring (▼ 4,300 km, ignored 120 s, 44–46% FUEL; HALCYON's 158 s SKIP): every SKIP a few seconds`,
    bad === '', bad || rows.join(' | '));
}

// --- 4. A press during a SKIP only stops it (the lead's ruling for LEAD-2 review round 2) ---------------------------
// SPACE pressed during a SKIP used to burn at once (the SKIP ended on the very next tick, as a SKIP tick never carries
// thrust): far out on a just-captured loop a 0.3 s RETRO tap stranded the ship, and obeying the lift line after it
// could end ESCAPED. Now, under a line that does not ask for SPACE (this WAIT), the press only stops the SKIP; holding it
// does nothing, and burning takes a fresh press. (Review round 3: under a line that asks for SPACE it burns, as the line
// says; tests/unit/lead2/fix3/skip-press.test.ts.)
{
  const rows: string[] = [];
  let bad = '';
  // Quick depth (tests/unit/depth.ts): late in the SKIP, farthest out (the tier trim); full: early, its middle and late.
  for (const intoSkipSec of byDepth([5], [2, 3.5, 5])) {
    longWait();
    harness.press('KeyF');
    idle(harness, intoSkipSec);
    const farKm = Math.hypot(state().orbit.x, state().orbit.y);
    const skipping = state().clock.skipWarp !== null;
    // The line under the SKIP does not ask for SPACE (skip-press's round-3 rule burns only under one that does).
    const objective = harness.objective();
    const asked = objective !== null && asksToHoldSpace(objective);
    const fuelBefore = state().burn.fuelPct;
    harness.keyDown('Space');
    harness.step();
    const stopped = state().clock.skipWarp === null && state().clock.pace !== 'skip';
    idle(harness, 2);
    const fuelHeld = state().burn.fuelPct;
    const firedWhileHeld = state().burn.firing;
    const lineHeld = text(harness);
    harness.keyUp('Space');
    // A fresh press burns again (checked without letting a tick pass, so nothing is spent out here).
    harness.keyDown('Space');
    const freshFires = state().burn.firing;
    harness.keyUp('Space');
    const flown = flyObeying(400);
    const row = `${intoSkipSec} s into the SKIP at ${(farKm / 1e6).toFixed(2)}M km: asks SPACE ${asked}, stopped ${stopped}, FUEL ${fuelBefore.toFixed(1)} → `
      + `${fuelHeld.toFixed(1)}% after 2 s held, "${lineHeld.replace(/\d+:\d+/, 'm:ss')}", fresh press fires ${freshFires}; `
      + `then ${harness.status()}, longest SKIP ${flown.longestSkipSec.toFixed(1)} s`;
    rows.push(row);
    const ok = skipping && !asked && stopped && fuelHeld === fuelBefore && !firedWhileHeld && /^WAIT — .* · \[F\] SKIP$/.test(lineHeld)
      && freshFires && ['locked', 'accepted'].includes(harness.status()) && flown.longestSkipSec <= FEW_SKIP_SEC;
    if (!ok) bad ||= row;
  }
  // (tests/unit/lead2/fix3/skip-press.test.ts's check 3, flown here: this suite has the long WAIT already.)
  check(`${ship}: SPACE pressed and held during the long SKIP, far out, under a line that does not ask for it: the SKIP stops, `
    + 'nothing burns, the strip shows its WAIT; a fresh press burns; obeyed, the flight locks or is accepted', bad === '', bad || rows.join(' | '));
}
{
  // From the MIND: SPACE is refused there (the ship's controls are on the ship), so the SKIP runs on; back on the ship
  // with SPACE still held, the mode switch hands the hold to the throttle (resumeHeldThrottle), and it stops the SKIP
  // without burning (the line is a WAIT). [B] during a SKIP on this closed loop, where AUTOBURN has nothing to capture
  // (or no AUTOBURN.skl on the unit), buzzes that refusal and the SKIP runs on (review round 3: round 2 stopped it in
  // silence; only a [B] that would toggle AUTOBURN stops a SKIP).
  longWait();
  harness.press('KeyF');
  idle(harness, 2);
  const fuelBefore = state().burn.fuelPct;
  harness.store.update((d) => { d.ui.mode = 'memory'; });
  harness.keyDown('Space');
  harness.step();
  const skippingInMind = state().clock.skipWarp !== null;
  harness.store.update((d) => { d.ui.mode = 'tools'; });
  resumeHeldThrottle(harness.store);
  harness.step();
  const stoppedOnShip = state().clock.skipWarp === null;
  idle(harness, 1);
  const quiet = !state().burn.firing && state().burn.fuelPct === fuelBefore;
  harness.keyUp('Space');
  harness.press('KeyF');
  harness.step();
  const skippingAgain = state().clock.skipWarp !== null;
  // [B] is refused for AUTOBURN's own reason (this unit's, never SKIPPING), and pressAutoburn returns that refusal
  // (tests/unit/lead2/fix3/skip-press.test.ts's check 4, flown here beside the long WAIT).
  const refusal = autoburnRefusal(state(), getPrediction());
  const refusals: string[] = [];
  const offRefused = on('refused', (payload) => { refusals.push(payload.reason); });
  const returned = pressAutoburn(harness.store);
  offRefused();
  harness.step();
  check(`${ship}: SPACE from the MIND is refused and the SKIP runs on; back on the ship the held SPACE stops it without burning; `
    + '[B] that AUTOBURN refuses here for its own reason buzzes that reason and the SKIP runs on',
    skippingInMind && stoppedOnShip && quiet && skippingAgain && state().clock.skipWarp !== null
    && state().burn.auto.phase === 'idle' && refusals.length === 1
    && refusal !== null && refusal !== AUTOBURN_REFUSAL.skipping && returned === refusal,
    `in the MIND skipping ${skippingInMind}; on the ship stopped ${stoppedOnShip}, quiet ${quiet}; F again ${skippingAgain}; `
    + `[B]: refusal ${refusal}, returned ${returned}, skipWarp ${state().clock.skipWarp}, AUTOBURN ${state().burn.auto.phase}, `
    + `refusals ${JSON.stringify(refusals)}`);
}

finish();
