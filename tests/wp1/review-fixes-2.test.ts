// WP1 review fixes, round 2: one block per fixed finding, on the real systems.
import { createHarness, check, finish, followStrip } from './harness';
import { computePrediction, getPrediction } from '@systems/predict';
import { skipBlockReason } from '@systems/pace';
import { plotMarkers } from '@systems/flight-hud';
import { stateFromElements } from '@/types/orbit';

const harness = createHarness(1);
const store = harness.store;
const state = () => store.getState();
const text = () => harness.objective()?.text ?? '';

function stepUntil(done: () => boolean, maxWall: number): boolean {
  const end = harness.wall() + maxWall;
  while (harness.wall() < end && harness.status() === 'approaching') {
    harness.step();
    if (done()) return true;
  }
  return false;
}

function placeOrbit(orbit: { x: number; y: number; vx: number; vy: number }): void {
  store.mutate((d) => { d.orbit.x = orbit.x; d.orbit.y = orbit.y; d.orbit.vx = orbit.vx; d.orbit.vy = orbit.vy; });
}

// The opening flown by the book up to the capture, then SPACE held until the loop closes
// (CAPTURED) plus `extraHoldSec`, and released there: the kid who lets go at CAPTURED.
function releaseAtCapture(extraHoldSec: number): void {
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(() => /^RELEASE/.test(text()), 30);
  harness.keyUp('Space');
  stepUntil(() => /TURN AROUND/.test(text()), 5);
  harness.press('KeyS');
  stepUntil(() => /^WAIT/.test(text()), 10);
  harness.press('KeyF');
  stepUntil(() => /HOLD \[SPACE\] NOW/.test(text()), 120);
  harness.keyDown('Space');
  stepUntil(() => getPrediction().outcome === 'closed', 30);
  const end = harness.wall() + extraHoldSec;
  while (harness.wall() < end) harness.step();
  harness.keyUp('Space');
}

function idle(wallSec: number): void {
  const end = harness.wall() + wallSec;
  while (harness.wall() < end && harness.status() === 'approaching') harness.step();
}

// --- Major: the late trim stays due NOW while braking now still lands the loop ----------------
for (const extraHoldSec of [0, 0.5, 1, 3]) {
  // The reviewer's case: let go at CAPTURED, react only 25 s later, then obey the strip.
  releaseAtCapture(extraHoldSec);
  idle(25);
  const line = text();
  const pace = harness.pace();
  const start = harness.wall();
  followStrip(harness, 0.4, 300);
  check(`late trim: released +${extraHoldSec} s past CAPTURED, reacting after 25 s: HOLD NOW at TACTICAL, locks within 60 s`,
    line === 'HOLD [SPACE] NOW' && pace === 'tactical' && harness.status() === 'locked' && harness.wall() - start < 60,
    `"${line}" at ${pace} → ${harness.status()} after ${(harness.wall() - start).toFixed(1)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}
{
  // The window ends where braking stops landing: just before it, braking anyway locks in one
  // burn; just after it, the same burn no longer lands and ▼ falls out. Since WP1-rules 2 the
  // line after the window is SHRINK THE LOOP (it was a WAIT for the next ▼, up to hours of
  // SKIP), and the burn that no longer lands hands over to the next trim (since the WP1-rules
  // review fixes, usually at the next ▼: the shrink stops before ▼ leaves the ring).
  releaseAtCapture(0);
  const releasedAt = harness.wall();
  stepUntil(() => !/HOLD \[SPACE\] NOW/.test(text()), 120);
  const windowSec = harness.wall() - releasedAt;
  const afterLine = text();

  const brakeAnyway = (ignoreSec: number): string => {
    releaseAtCapture(0);
    idle(ignoreSec);
    harness.keyDown('Space');
    stepUntil(() => /RELEASE|TOO EARLY|HOLD STEADY/.test(text()), 60);
    const stop = text();
    harness.keyUp('Space');
    return stop;
  };
  const inside = brakeAnyway(windowSec - 1);
  const outside = brakeAnyway(windowSec + 1);
  check('late trim: the NOW window ends where braking stops landing the loop in the ring',
    windowSec > 30 && /^SHRINK THE LOOP/.test(afterLine) && inside === 'RELEASE [SPACE]!'
    && /^RELEASE \[SPACE\]! — next: (brake at ▼|burn at ▲)/.test(outside),
    `window ${windowSec.toFixed(1)} s, then "${afterLine}"; braking 1 s before: "${inside}", 1 s after: "${outside}"`);
}
{
  // Small loops keep their trims at the apsis: a little past ▼ the burn is still due now. Far
  // past it (where it would cost more than LATE_TRIM_DV_FACTOR × the on-time burn) the next ▼
  // is more than SHRINK_WAIT_TAC away, so since WP1-rules 2 the kid shrinks the loop now
  // instead of waiting for it (before: a WAIT of about 600 tactical s).
  harness.reset(1);
  const mu = state().level.planet.mu;
  const rp = 6000;
  const ra = 9500;
  const e = (ra - rp) / (ra + rp);
  placeOrbit(stateFromElements(rp, e, 0, 0.5, mu));
  const near = computePrediction(state());
  placeOrbit(stateFromElements(rp, e, 0, 2.0, mu));
  const far = computePrediction(state());
  check('late trim: on a small loop, due now just past ▼, shrink now far past it',
    near.burnPoint?.reason === 'ra-high' && near.burnPoint.eventInSec < 0
    && far.burnPoint?.reason === 'shrink' && far.burnPoint.inSec <= 0,
    `near ${near.burnPoint?.reason} ${near.burnPoint?.eventInSec.toFixed(0)} s, far ${far.burnPoint?.reason} ${far.burnPoint?.inSec.toFixed(0)} s`);

  // ... and following the due-now line from just past ▼ locks.
  placeOrbit(stateFromElements(rp, e, 0, 0.5, mu));
  harness.press('KeyS');
  const start = harness.wall();
  followStrip(harness, 0.4, 120);
  check('late trim: obeying the due-now trim on a small loop locks', harness.status() === 'locked',
    `${harness.status()} after ${(harness.wall() - start).toFixed(1)} s`);
}

// --- Minor: no SKIP re-offered in the sliver a SKIP leaves behind ---------------------------
{
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(() => /^RELEASE/.test(text()), 30);
  harness.keyUp('Space');
  stepUntil(() => /TURN AROUND/.test(text()), 5);
  harness.press('KeyS');
  stepUntil(() => /^WAIT/.test(text()), 10);
  harness.press('KeyF');
  stepUntil(() => state().clock.skipWarp !== null, 1);
  stepUntil(() => state().clock.skipWarp === null, 60);
  let offered = '';
  stepUntil(() => {
    if (!offered && (skipBlockReason(state(), getPrediction()) === null || text().includes('[F]'))) offered = text();
    return (harness.burnPointTac() ?? 0) <= 0;
  }, 60);
  check('skip: not offered again between the end of a SKIP and the burn', offered === '',
    offered || `blocked as ${skipBlockReason(state(), getPrediction())}`);
}

// --- Minor: no START BURN behind the ship while waiting past the apsis ----------------------
{
  // Past the window: the strip says WAIT for a ▼ a whole loop away. The plot shows ▼ and its
  // countdown, but no START BURN tick (it would sit right behind the ship).
  releaseAtCapture(0);
  stepUntil(() => /^WAIT/.test(text()), 120);
  const waiting = plotMarkers(state(), getPrediction());
  // A fresh coast toward ▼ still shows it.
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(() => /^RELEASE/.test(text()), 30);
  harness.keyUp('Space');
  harness.press('KeyS');
  stepUntil(() => /^WAIT/.test(text()), 10);
  const approaching = plotMarkers(state(), getPrediction());
  check('plot: START BURN only on the way into its apsis', waiting.startBurn === null && approaching.startBurn !== null
    && waiting.peri !== null, `waiting ${waiting.startBurn === null ? 'hidden' : 'shown'}, approaching ${approaching.startBurn === null ? 'hidden' : 'shown'}`);
}

// --- Minor: a flyby whose ▼ lies beyond the escape radius escapes at ▼ ------------------------
{
  harness.reset(1);
  const mu = state().level.planet.mu;
  const rp = 1.6 * state().level.r0 * 1.5;
  placeOrbit(stateFromElements(rp, 1.2, 0, -0.8, mu));
  const pred = computePrediction(state());
  check('escape: ▼ beyond the escape radius → escape time is the time to ▼, and the path is drawn',
    pred.outcome === 'open' && pred.periInSec !== null && pred.escapeInSec !== null
    && Math.abs(pred.escapeInSec - pred.periInSec) < 1e-6 && pred.points.length > 2,
    `escapeInSec ${pred.escapeInSec?.toFixed(1)}, periInSec ${pred.periInSec?.toFixed(1)}, ${pred.points.length} points`);
}

finish();
