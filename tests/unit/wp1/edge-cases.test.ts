// WP1 edge cases (spec list) plus the pace and input-router rules they rely on.
import { createHarness, check, finish, TICK } from './harness';
import { requestSkip, skipBlockReason } from '@systems/pace';
import { setPaused } from '@systems/clock';
import { pushModal, activeLayer } from '@systems/input';
import { listResets } from '@systems/reset';
import { getPrediction } from '@systems/predict';
import { stateFromElements } from '@/types/orbit';
import { selectManual } from '@systems/flight-controls';
import { stepAttitude } from '@systems/attitude';
import { ROT_ACCEL, MAX_OMEGA } from '@data/tuning';

const harness = createHarness(11);
const store = harness.store;
const burn = () => store.getState().burn;
const clock = () => store.getState().clock;

function stepFor(wallSec: number): void {
  const end = harness.wall() + wallSec;
  while (harness.wall() < end - 1e-9 && harness.status() === 'approaching') harness.step();
}

// Fly the OUT correction and the flip, leaving the ship coasting toward its capture.
function toCoast(): void {
  harness.keyDown('Space');
  while (harness.rp() < 6000) harness.step();
  harness.keyUp('Space');
  harness.press('KeyS');
  stepFor(3);
}

// --- SPACE held through a terminal status -------------------------------------------------
{
  harness.reset();
  harness.press('KeyS');            // RETRO into an impact course: crashes sooner
  harness.keyDown('Space');
  stepFor(400);
  check('terminal: flight ended while SPACE held', harness.status() !== 'approaching', harness.status());
  check('terminal: throttle released', !burn().firing && burn().firingSource === null);
  check('terminal: clock paused', clock().paused);
  harness.keyUp('Space');
  harness.keyDown('Space');
  check('terminal: a new SPACE is refused', !burn().firing);
  harness.keyUp('Space');
  check('terminal: P cannot resume a finished flight', !setPaused(store, false) && clock().paused);
}

// --- Pause while firing ----------------------------------------------------------------------
{
  harness.reset();
  harness.keyDown('Space');
  stepFor(0.5);
  check('pause: firing before P', burn().firing);
  harness.press('KeyP');
  check('pause: P releases the throttle', !burn().firing && clock().paused);
  const tBefore = clock().tSec;
  const countdownBefore = harness.countdown()?.tacSec;
  stepFor(1);
  check('pause: world frozen', clock().tSec === tBefore && clock().speed === 0);
  check('pause: prediction/countdown frozen while paused', harness.countdown()?.tacSec === countdownBefore);
  // Still physically holding SPACE: the router only sees auto-repeat, which never re-fires.
  harness.press('KeyP');
  check('resume: unpaused', !clock().paused);
  harness.step();
  check('resume: speed snaps to tactical (impact course)', clock().speed === store.getState().level.tacticalWarp, `${clock().speed}`);
  check('resume: a held SPACE does not resume the burn', !burn().firing);
  harness.keyUp('Space');
  harness.keyDown('Space');
  check('resume: a fresh SPACE burns again', burn().firing);
  harness.keyUp('Space');
}

// --- Pause refuses SPACE, presets and SKIP (look-only) ------------------------------------
{
  harness.reset();
  toCoast();
  harness.press('KeyP');
  const mode = burn().sasMode;
  harness.keyDown('Space');
  harness.press('KeyD');
  check('look-only pause: SPACE refused', !burn().firing);
  check('look-only pause: presets refused', burn().sasMode === mode);
  const skip = requestSkip(store);
  check('look-only pause: SKIP refused with PAUSED', !skip.ok && skip.reason === 'PAUSED', JSON.stringify(skip));
  harness.keyUp('Space');
  harness.press('KeyP');
}

// --- SKIP refused close to the event; SKIP ends with a snap ---------------------------------
{
  harness.reset();
  const onImpact = skipBlockReason(store.getState(), getPrediction());
  check('skip: refused on an impact course', onImpact === 'IMPACT COURSE', `${onImpact}`);
  toCoast();
  const ok = requestSkip(store);
  check('skip: allowed on a quiet coast', ok.ok, JSON.stringify(ok));
  const skipWarp = clock().skipWarp ?? 0;
  let maxSpeed = 0;
  let lastSkipSpeed = 0;
  while (harness.status() === 'approaching') {
    harness.step();
    maxSpeed = Math.max(maxSpeed, clock().speed);
    if (clock().pace === 'skip') lastSkipSpeed = clock().speed;
    if (clock().skipWarp === null && maxSpeed > 0) break;
  }
  const cruise = store.getState().level.cruiseWarp;
  check('skip: glides up toward its warp', maxSpeed > cruise * 2, `max ${maxSpeed.toFixed(0)} / skipWarp ${skipWarp.toFixed(0)}`);
  // LEAD-2 review round 1: a SKIP that reaches its end point glides down onto it (SKIP_EASE_OUT_SEC, the ramp's
  // mirror), so its last tick already runs near CRUISE; it used to snap from its full warp. A stop the kid or the
  // world causes (SPACE, an alarm) still snaps (tests/unit/lead2/coast-skip.test.ts).
  check('skip: eases down onto its end point and goes on at CRUISE', lastSkipSpeed < cruise * 2 && clock().speed === cruise,
    `last SKIP tick ×${lastSkipSpeed.toFixed(0)}, then ×${clock().speed.toFixed(0)} (CRUISE ×${cruise})`);
  const bpTac = harness.burnPointTac() ?? 0;
  // LEAD-2: a SKIP now lands exactly SKIP_END_LEAD_TAC before the event (it used to end up to a tick early, 15–20
  // tac s); this reads it one CRUISE tick after the landing.
  const cruiseTickTac = (store.getState().level.cruiseWarp * TICK) / store.getState().level.tacticalWarp;
  check('skip: lands 15 tac s before the burn point (read one CRUISE tick later)',
    Math.abs(bpTac - (15 - cruiseTickTac)) < 0.01, `${bpTac.toFixed(3)} tac s`);
  // Now inside the 15 s window: a new SKIP is refused with a reason.
  stepFor(1);
  const late = requestSkip(store);
  check('skip: < 15 tac s before the event is refused', !late.ok && late.reason === 'BURN COMING UP', JSON.stringify(late));
}

// --- Pace: snap to TACTICAL at the burn point ----------------------------------------------
{
  harness.reset();
  toCoast();
  let tacticalAt: number | null = null;
  while (harness.status() === 'approaching' && tacticalAt === null) {
    harness.step();
    if (clock().pace === 'tactical') tacticalAt = harness.burnPointTac();
  }
  check('pace: TACTICAL from 8 tac s before START BURN', tacticalAt !== null && tacticalAt <= 8 && tacticalAt > 7, `${tacticalAt?.toFixed(2)}`);
  check('pace: speed snapped to tactical', clock().speed === store.getState().level.tacticalWarp, `${clock().speed}`);
}

// --- Presets: select-only, aligning, mid-burn change ------------------------------------------
{
  harness.reset();
  harness.keyDown('Space');
  stepFor(0.5);
  check('preset: firing OUT delivers thrust', burn().lastTickDvKmS > 0);
  harness.press('KeyS');
  check('preset: changing preset starts aligning', burn().presetAligning && burn().sasMode === 'retrograde');
  harness.step();
  check('preset: no thrust while aligning (mid-burn change)', burn().lastTickDvKmS === 0 && burn().firing);
  const headingBefore = burn().heading;
  const omegaBefore = burn().omega;
  harness.press('KeyS');
  check('preset: pressing the active preset while aligning is a no-op',
    burn().sasMode === 'retrograde' && burn().heading === headingBefore && burn().omega === omegaBefore);
  let alignedAfter = 0;
  while (burn().presetAligning && alignedAfter < 200) { harness.step(); alignedAfter++; }
  harness.step();
  check('preset: thrust resumes once aligned', !burn().presetAligning && burn().lastTickDvKmS > 0, `${(alignedAfter * 0.05).toFixed(2)} s to align`);
  harness.keyUp('Space');
}

// --- Window blur while SPACE is held --------------------------------------------------------
{
  harness.reset();
  harness.keyDown('Space');
  harness.step();
  check('blur: firing before blur', burn().firing);
  harness.blur();
  check('blur: losing focus releases SPACE', !burn().firing);
  harness.keyUp('Space'); // the late keyup after refocus is harmless
  check('blur: late keyup is harmless', !burn().firing);
  harness.keyDown('Space');
  check('blur: a fresh SPACE burns again', burn().firing);
  harness.reset();
  check('reset: world reset releases held keys', !burn().firing);
}

// --- Modal stack: a modal releases held game keys; fresh keydown needed after it closes ----
{
  harness.reset();
  harness.keyDown('Space');
  check('modal: firing before the modal', burn().firing);
  const pop = pushModal('confirm');
  check('modal: confirm is the active layer', activeLayer() === 'confirm');
  check('modal: opening it released SPACE', !burn().firing);
  pop();
  check('modal: back to the game layer', activeLayer() === 'game');
  check('modal: still-held SPACE does not resume', !burn().firing);
  harness.keyUp('Space');
  harness.keyDown('Space');
  check('modal: fresh SPACE burns', burn().firing);
  harness.keyUp('Space');
}

// --- Escape receding at high warp ------------------------------------------------------------
for (const warp of [1e5, 1e7]) {
  harness.reset();
  const mu = store.getState().level.planet.mu;
  const s = stateFromElements(7000, 1.4, 0, 0.5, mu); // just past ▼, open, receding
  store.mutate((d) => { d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy; });
  store.update((d) => { d.clock.debugWarp = warp; });
  harness.step(1e-6);
  store.mutate((d) => { d.clock.speed = warp; });
  let ticks = 0;
  while (harness.status() === 'approaching' && ticks < 10) { harness.step(); ticks++; }
  check(`escape at x${warp.toExponential(0)}: ends ESCAPED (no crash, no hang)`, harness.status() === 'escaped',
    `${harness.status()} after ${ticks} tick(s)`);
}

// --- Reset registry ---------------------------------------------------------------------------
{
  const names = listResets();
  check('resets registered: predict + input', names.includes('predict') && names.includes('input-held-keys'), names.join(','));
}

// --- MANUAL rotation brakes when Q/E are let go (playtest 1 note 21, §3.10) ---------------
{
  harness.reset();
  selectManual(store);
  harness.keyDown('KeyQ');
  stepFor(2);
  const spinHeld = burn().omega;
  harness.keyUp('KeyQ');
  stepFor(1.5);
  const spinAfter = burn().omega;
  const headingStopped = burn().heading;
  stepFor(2);
  check('MANUAL: Q held spins the ship', spinHeld > 0, `${spinHeld}`);
  check('MANUAL: letting go of Q stops the spin', spinAfter === 0, `${spinAfter}`);
  check('MANUAL: and the heading stays where it stopped', burn().heading === headingStopped, `${headingStopped} → ${burn().heading}`);

  harness.keyDown('KeyE');
  stepFor(2);
  const spinE = burn().omega;
  harness.keyUp('KeyE');
  stepFor(1.5);
  check('MANUAL: E brakes the same way', spinE < 0 && burn().omega === 0, `${spinE} → ${burn().omega}`);

  // The brake is integrated exactly: one long tick (a CRUISE step, the predictor's coast jump) stops where many short
  // ones do, so the plotted path agrees with the flown one.
  const orbit = { x: 10000, y: 0, vx: 0, vy: 5 };
  const start = { heading: 0.3, omega: MAX_OMEGA };
  const long = stepAttitude(start, 'off', 0, orbit, 10);
  let short = start;
  for (let i = 0; i < 10000; i++) short = stepAttitude(short, 'off', 0, orbit, 0.001);
  const brakeDist = (MAX_OMEGA * MAX_OMEGA) / (2 * ROT_ACCEL);
  check('brake: a long tick stops at ω²/2a, as short ones do',
    long.omega === 0 && short.omega === 0 && Math.abs(long.heading - (0.3 + brakeDist)) < 1e-9 && Math.abs(short.heading - long.heading) < 1e-4,
    `long ${long.heading} short ${short.heading} want ${0.3 + brakeDist}`);
  const half = stepAttitude(start, 'off', 0, orbit, 0.2);
  check('brake: part-way through, the spin slows by rotAccel·dt', Math.abs(half.omega - (MAX_OMEGA - ROT_ACCEL * 0.2)) < 1e-12, `${half.omega}`);
  const held = stepAttitude({ heading: 0, omega: 0 }, 'off', 1, orbit, 0.1);
  check('brake: a held thruster still accelerates', Math.abs(held.omega - ROT_ACCEL * 0.1) < 1e-12, `${held.omega}`);
}

finish();
