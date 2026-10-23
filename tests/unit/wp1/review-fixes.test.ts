// WP1 review fixes, round 1: one block per fixed finding, on the real systems.
import { createHarness, check, finish, followStrip, TICK } from './harness';
import { computePrediction, getPrediction } from '@systems/predict';
import { requestSkip } from '@systems/pace';
import { integrateStep } from '@systems/orbit-sim';
import { setPaused } from '@systems/clock';
import {
  holdThrottle, holdRotation, selectManual, setPower,
} from '@systems/flight-controls';
import { buildFlightContext, flightObjective, canAccept } from '@systems/guidance';
import { countdownChip, plotMarkers, acceptModel, acceptLabel } from '@systems/flight-hud';
import { RESULT_SUB } from '@components/burn/BurnResult';
import { stateFromElements, type Vec2 } from '@/types/orbit';
import { createRng } from '@systems/rng';
import { MAX_LINE_CHARS, POWER_MIN_PCT, STRANDED_RANGE_FRAC } from '@data/tuning';

const harness = createHarness(1);
const store = harness.store;
const state = () => store.getState();
const level = () => state().level;

function stepWhile(cond: () => boolean, maxWall = 600): void {
  const end = harness.wall() + maxWall;
  while (cond() && harness.status() === 'approaching' && harness.wall() < end) harness.step();
}

function placeState(s: { x: number; y: number; vx: number; vy: number }): void {
  store.mutate((d) => { d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy; });
}

// Numeric truth for timing checks: coast with the sim's integrator until the ship either
// reaches `radius` inbound (impact) or passes periapsis. Steps are 0.2% of the crossing time.
function numericTimeTo(start: { x: number; y: number; vx: number; vy: number }, target: 'peri' | number): number {
  const mu = level().planet.mu;
  const pos: Vec2 = { x: start.x, y: start.y };
  const vel: Vec2 = { x: start.vx, y: start.vy };
  let elapsed = 0;
  for (let i = 0; i < 5e6; i++) {
    const radius = Math.hypot(pos.x, pos.y);
    const step = Math.min(Math.max(0.002 * radius / Math.hypot(vel.x, vel.y), 0.01), 20);
    const radiusPrev = radius;
    const rDotVPrev = pos.x * vel.x + pos.y * vel.y;
    integrateStep(pos, vel, step, mu, 0, 0);
    const radiusNow = Math.hypot(pos.x, pos.y);
    const rDotV = pos.x * vel.x + pos.y * vel.y;
    if (target === 'peri' && rDotVPrev < 0 && rDotV >= 0) return elapsed + step * (-rDotVPrev / (rDotV - rDotVPrev));
    if (target !== 'peri' && radiusNow <= target) return elapsed + step * ((radiusPrev - target) / (radiusPrev - radiusNow));
    elapsed += step;
  }
  throw new Error('numericTimeTo: never got there');
}

// --- Finding 1: event times stay exact through e = 1 and on the near-radial plunge -----------
{
  harness.reset();
  const mu = level().planet.mu;
  let worst = 0;
  let worstAt = '';
  const periAt = new Map<number, number>();
  for (const e of [0.5, 0.99, 0.999, 0.9999, 1 - 1e-9, 1, 1 + 1e-9, 1.0001, 1.001, 1.01, 1.5]) {
    const start = stateFromElements(6000, e, 0.4, -1.4, mu);
    placeState(start);
    const pred = computePrediction(state());
    const truth = numericTimeTo(start, 'peri');
    const error = Math.abs((pred.periInSec ?? NaN) - truth) / truth;
    periAt.set(e, pred.periInSec ?? NaN);
    if (!(error <= worst)) { worst = error; worstAt = `e ${e}: pred ${pred.periInSec?.toFixed(2)} vs ${truth.toFixed(2)} s`; }
  }
  check('timing: periInSec within 0.1% of the integrator for e from 0.5 to 1.5 (through e = 1)', worst <= 1e-3,
    `worst ${(worst * 100).toFixed(4)}% (${worstAt})`);
  const across = [1 - 1e-9, 1, 1 + 1e-9].map((e) => periAt.get(e) ?? NaN);
  const spread = (Math.max(...across) - Math.min(...across)) / across[1]!;
  check('timing: continuous across e = 1', spread < 1e-6, `${across.map((t) => t.toFixed(4)).join(' / ')} s`);
}
{
  // Mirror image of a state flown clockwise: every event time must be the same.
  harness.reset();
  const mu = level().planet.mu;
  const ccw = stateFromElements(6500, 0.4, 0.7, -2.0, mu);
  placeState(ccw);
  const a = computePrediction(state());
  placeState({ x: ccw.x, y: -ccw.y, vx: ccw.vx, vy: -ccw.vy });
  const b = computePrediction(state());
  check('timing: clockwise motion gives the same ▼/▲ times', Math.abs((a.periInSec ?? 0) - (b.periInSec ?? 1)) < 1e-6
    && Math.abs((a.apoInSec ?? 0) - (b.apoInSec ?? 1)) < 1e-6, `${a.periInSec?.toFixed(3)} / ${b.periInSec?.toFixed(3)}`);
}
{
  // The reviewer's repro: press A (IN) on the crash course and hold SPACE; h passes through 0
  // (the orbit's sense of rotation flips) and e → 1. No tick may throw, and once the burn is
  // released the IMPACT countdown must match the actual crash.
  harness.reset();
  harness.press('KeyA');
  harness.keyDown('Space');
  let thrown = '';
  let signFlips = 0;
  let lastSign = 0;
  const samples: { tSec: number; tac: number }[] = [];
  const holdUntil = 17;
  while (harness.status() === 'approaching' && harness.wall() < 400) {
    try { harness.step(); } catch (err) { thrown = String(err); break; }
    const o = state().orbit;
    const sign = Math.sign(o.x * o.vy - o.y * o.vx);
    if (lastSign !== 0 && sign !== 0 && sign !== lastSign) signFlips++;
    if (sign !== 0) lastSign = sign;
    if (harness.wall() >= holdUntil && state().burn.firing) harness.keyUp('Space');
    const countdown = harness.countdown();
    if (harness.wall() > holdUntil + 0.2 && countdown?.kind === 'impact') samples.push({ tSec: state().clock.tSec, tac: countdown.tacSec });
  }
  check('IN plunge: no tick throws', thrown === '', thrown || `${signFlips} sign flips of h, ended ${harness.status()}`);
  check('IN plunge: ends in a crash', harness.status() === 'crashed', harness.status());
  const crashT = state().clock.tSec;
  const warp = level().tacticalWarp;
  const worst = Math.max(...samples.map((sample) => Math.abs(sample.tac - (crashT - sample.tSec) / warp)));
  check('IN plunge: the IMPACT countdown matches the real crash (ballistic part)', samples.length > 20 && worst < 1.05,
    `${samples.length} samples, worst error ${worst.toFixed(2)} tac s`);
}
{
  // Fuzz the degenerate corner: near-radial plunges (h → 0 of either sign) with bound,
  // parabolic and unbound energy. Never throws, and the impact time matches the integrator.
  harness.reset();
  const rng = createRng(4242);
  const { R, mu } = level().planet;
  let failure = '';
  let worst = 0;
  let tested = 0;
  for (let i = 0; i < 400 && !failure; i++) {
    const radius = R + 50 + rng() * 12000;
    const angle = rng() * 2 * Math.PI;
    const escapeSpeed = Math.sqrt(2 * mu / radius);
    const speed = escapeSpeed * (0.6 + rng() * 0.8) * (rng() < 0.15 ? 0 : 1) + (rng() < 0.15 ? escapeSpeed : 0);
    const tangential = (rng() < 0.5 ? -1 : 1) * Math.pow(10, -8 + rng() * 7);
    const radial = -Math.sqrt(Math.max(0, speed * speed - tangential * tangential));
    const rx = Math.cos(angle);
    const ry = Math.sin(angle);
    const start = { x: radius * rx, y: radius * ry, vx: radial * rx - tangential * ry, vy: radial * ry + tangential * rx };
    placeState(start);
    store.mutate((d) => { d.burn.fuelPct = rng() < 0.3 ? 0 : 50; d.burn.firing = rng() < 0.5; });
    try {
      const pred = computePrediction(state());
      const objective = flightObjective(buildFlightContext(state(), pred));
      if (!objective) { failure = 'null objective'; break; }
      if (objective.text.length > MAX_LINE_CHARS) { failure = `long line '${objective.text}'`; break; }
      if (pred.outcome !== 'impact' || pred.impactInSec === null) { failure = `plunge at r ${radius.toFixed(0)} not an impact (${pred.outcome})`; break; }
      if (i % 4 === 0) {
        const truth = numericTimeTo(start, R);
        worst = Math.max(worst, Math.abs(pred.impactInSec - truth) / Math.max(truth, 1));
        tested++;
      }
    } catch (err) {
      failure = `r ${radius.toFixed(0)} v ${speed.toFixed(3)} vt ${tangential.toExponential(1)}: ${String(err)}`;
    }
  }
  check('fuzz: near-radial plunges (rp → 0, e → 1, h of either sign) never throw', failure === '', failure || '400 states');
  check('fuzz: their impact time is within 0.5% of the integrator', worst <= 5e-3, `worst ${(worst * 100).toFixed(4)}% over ${tested}`);
}

// --- Finding 2: a held burn is never fast-forwarded --------------------------------------------
{
  harness.reset();
  harness.keyDown('Space');
  stepWhile(() => harness.rp() < 6000);
  harness.keyUp('Space');
  harness.press('KeyS');
  for (let i = 0; i < 60; i++) harness.step();
  requestSkip(store);
  stepWhile(() => state().clock.speed < (state().clock.skipWarp ?? 0) * 0.99, 20);
  const skipping = state().clock.pace === 'skip' && state().clock.speed > 100;
  harness.press('KeyW');
  harness.keyDown('Space');
  let worstDv = 0;
  for (let i = 0; i < 60; i++) {
    harness.step();
    if (state().clock.speed > level().tacticalWarp) worstDv = Math.max(worstDv, state().burn.lastTickDvKmS);
  }
  harness.keyUp('Space');
  check('SKIP + new preset + SPACE: no thrust is delivered above TACTICAL', skipping && worstDv === 0,
    `skipping=${skipping}, worst Δv in a fast tick ${worstDv.toFixed(4)} km/s`);
}

// --- Finding 3 (+ spec, experience): an empty tank on an open path --------------------------------
{
  harness.reset();
  harness.keyDown('Space');                   // OUT is preset: hold it until the tank is dry
  stepWhile(() => state().burn.fuelPct > 0, 60);
  harness.keyUp('Space');
  const dryAt = harness.wall();
  const dryOutcome = getPrediction().outcome;
  let namedBurn = '';
  let tacticalSec = 0;
  followStrip(harness, 0.4, 120, () => {
    const text = harness.objective()?.text ?? '';
    if (/\[SPACE\]|press \[[WASD]\]/.test(text) && !namedBurn) namedBurn = text;
    if (state().clock.pace === 'tactical') tacticalSec += TICK;
  });
  check('dry tank, open path: the strip never asks for SPACE or a preset', dryOutcome === 'open' && namedBurn === '',
    namedBurn || `outcome after drying ${dryOutcome}`);
  check('dry tank, open path: F skips to the escape, which comes quickly', harness.status() === 'escaped' && harness.wall() - dryAt < 20,
    `${harness.status()} ${(harness.wall() - dryAt).toFixed(1)} s after the tank ran dry; ${tacticalSec.toFixed(1)} s at TACTICAL`);
}
{
  // Not pressing F: the coast runs at CRUISE, not TACTICAL, and the line says what happens.
  // Since WP1-rules 3b the flight ends at ▼ (receding with no FUEL to close the loop), which here
  // is only seconds away, so there is nothing left to SKIP (tests/unit/wp1-rules covers a far ▼).
  harness.reset();
  harness.keyDown('Space');
  stepWhile(() => state().burn.fuelPct > 0, 60);
  harness.keyUp('Space');
  for (let i = 0; i < 40; i++) harness.step();
  const objective = harness.objective();
  check('dry tank: OUT OF FUEL line, pace CRUISE', objective?.id === 'NOFUEL-open'
    && objective.text === 'OUT OF FUEL — the ship will fly past' && harness.pace() === 'cruise',
  `${objective?.text} / ${harness.pace()}`);
}

// --- Finding 4 (+ experience): a trim whose apsis just passed is due now ---------------------------
function flyToCaptureStart(): void {
  harness.keyDown('Space');
  stepWhile(() => harness.rp() < 6000);
  harness.keyUp('Space');
  harness.press('KeyS');
  stepWhile(() => (harness.burnPointTac() ?? 99) > 0);
}
for (const lateTac of [4, 8, 12]) {
  // Start the capture late, let go just after the loop closes (past ▼), then obey the strip.
  harness.reset();
  flyToCaptureStart();
  for (let i = 0; i < lateTac / TICK; i++) harness.step();
  harness.keyDown('Space');
  stepWhile(() => !getPrediction().fit.closed);
  for (let i = 0; i < 4; i++) harness.step();
  harness.keyUp('Space');
  for (let i = 0; i < 10; i++) harness.step();
  const after = harness.objective()?.text ?? '';
  const start = harness.wall();
  followStrip(harness, 0.4, 300);
  check(`late capture ${lateTac} tac s, released past ▼: told to burn now, then locks quickly`,
    after === 'HOLD [SPACE] NOW' && harness.status() === 'locked' && harness.wall() - start < 90,
    `"${after}" → ${harness.status()} after ${(harness.wall() - start).toFixed(1)} s`);
}
{
  // The experience reviewer's case: an on-time capture released 1 s after the loop closes, the
  // kid reacting 6 s later.
  harness.reset();
  flyToCaptureStart();
  harness.keyDown('Space');
  stepWhile(() => !getPrediction().fit.closed);
  for (let i = 0; i < 1 / TICK; i++) harness.step();
  harness.keyUp('Space');
  const start = harness.wall();
  followStrip(harness, 6, 300);
  check('released 1 s after CAPTURED, 6 s reactions: locks within 90 s', harness.status() === 'locked' && harness.wall() - start < 90,
    `${harness.status()} after ${(harness.wall() - start).toFixed(1)} s`);
}

// --- Experience: while the kid finishes a burn, no START BURN on the ship, no racing BRAKE IN -------
{
  harness.reset();
  flyToCaptureStart();
  harness.keyDown('Space');
  let finishingTicks = 0;
  let bad = '';
  stepWhile(() => {
    const pred = getPrediction();
    const burnPoint = pred.burnPoint;
    if (pred.outcome === 'closed' && burnPoint && !burnPoint.approaching) {
      finishingTicks++;
      const chip = countdownChip(state(), pred);
      if (chip?.kind === 'burn' && !bad) bad = `chip ${chip.label} ${chip.time}`;
      if (plotMarkers(state(), pred).startBurn !== null && !bad) bad = 'START BURN shown';
    }
    return !harness.inRing();
  });
  harness.keyUp('Space');
  check('finishing the capture: no burn countdown and no START BURN', finishingTicks > 0 && bad === '',
    bad || `${finishingTicks} ticks checked`);
}

// --- Experience: ACCEPT below the strand floor is never suggested and says STRANDED --------------
{
  harness.reset();
  flyToCaptureStart();
  harness.keyDown('Space');
  stepWhile(() => !getPrediction().fit.closed);
  harness.keyUp('Space');
  stepWhile(() => !canAccept(state(), getPrediction()), 60);
  const pred = getPrediction();
  const model = acceptModel(state(), pred);
  const objective = harness.objective();
  check('ACCEPT below the floor: offered but never suggested, labelled STRANDED',
    model.offered && pred.greenFraction < STRANDED_RANGE_FRAC && model.strands && !objective?.text.includes('ACCEPT')
    && !buildFlightContext(state(), pred).showAccept && acceptLabel(model, false).endsWith('· STRANDED'),
  `${(pred.greenFraction * 100).toFixed(1)}% · "${objective?.text}" · ${acceptLabel(model, false)}`);
}

// --- Minors ---------------------------------------------------------------------------------------
{
  // Pause freezes a running SKIP instead of cancelling it.
  harness.reset();
  harness.keyDown('Space');
  stepWhile(() => harness.rp() < 6000);
  harness.keyUp('Space');
  harness.press('KeyS');
  stepWhile(() => state().clock.pace !== 'cruise', 20);
  const waitLine = harness.objective();
  harness.press('KeyF');
  for (let i = 0; i < 20; i++) harness.step();
  const skipWarp = state().clock.skipWarp;
  const duringSkip = harness.objective();
  harness.press('KeyP');
  for (let i = 0; i < 10; i++) harness.step();
  const chipPaused = countdownChip(state(), getPrediction());
  harness.press('KeyP');
  for (let i = 0; i < 4; i++) harness.step();
  check('WAIT names SKIP while it is available, not while skipping', waitLine?.text.endsWith('· [F] SKIP') === true
    && waitLine.keys.includes('F') && duringSkip?.text.includes('SKIP') === false, `"${waitLine?.text}" / "${duringSkip?.text}"`);
  check('pause keeps the SKIP, and the chip drops ▸▸ while frozen', skipWarp !== null && state().clock.skipWarp === skipWarp
    && state().clock.pace === 'skip' && chipPaused?.fastForward === false, `skipWarp ${skipWarp?.toFixed(0)} → ${state().clock.skipWarp?.toFixed(0)}`);
}
{
  // Cmd/Ctrl/Alt chords are left to the browser.
  harness.reset();
  harness.keyDown('Space');
  stepWhile(() => harness.rp() < 6000);
  harness.keyUp('Space');
  harness.press('KeyS');
  stepWhile(() => state().clock.pace !== 'cruise', 20);
  const preventedF = harness.keyWith('keydown', 'KeyF', { metaKey: true });
  harness.keyWith('keyup', 'KeyF', { metaKey: true });
  const preventedP = harness.keyWith('keydown', 'KeyP', { ctrlKey: true });
  harness.keyWith('keyup', 'KeyP', { ctrlKey: true });
  harness.keyWith('keydown', 'KeyW', { altKey: true });
  check('modifier chords: no SKIP, no pause, no preset, default not prevented',
    state().clock.skipWarp === null && !state().clock.paused && state().burn.sasMode === 'retrograde' && !preventedF && !preventedP);
}
{
  // SPACE and the BURN button are separate holds.
  harness.reset();
  harness.keyDown('Space');
  holdThrottle(store, 'pointer', false);           // the cursor leaving the button, no click
  const afterHoverLeave = state().burn.firing;
  holdThrottle(store, 'pointer', true);            // click and hold BURN as well
  holdThrottle(store, 'pointer', false);           // let go of the mouse
  const afterMouseUp = state().burn.firing;
  harness.keyUp('Space');
  const afterSpaceUp = state().burn.firing;
  holdThrottle(store, 'pointer', true);
  harness.press('Space');                          // a SPACE tap during a mouse hold
  const afterTap = state().burn.firing;
  holdThrottle(store, 'pointer', false);
  check('holds: hover-leave, mouse-up and a SPACE tap never cut the other hold',
    afterHoverLeave && afterMouseUp && !afterSpaceUp && afterTap && !state().burn.firing);

  // After a pause the old holds are stale: the button starts a burn, its release ends it.
  harness.keyDown('Space');
  setPaused(store, true);
  setPaused(store, false);
  holdThrottle(store, 'pointer', true);
  const pointerAfterPause = state().burn.firing;
  holdThrottle(store, 'pointer', false);
  check('holds: after a pause a held SPACE no longer counts', pointerAfterPause && !state().burn.firing);
  harness.keyUp('Space');

  // Rotation: Q and E are separate holds, and a click elsewhere never stops a key turn.
  selectManual(store);
  harness.keyDown('KeyQ');
  harness.keyDown('KeyE');
  const both = state().burn.rotInput;
  harness.keyUp('KeyE');
  const backToQ = state().burn.rotInput;
  holdRotation(store, 'pointer', 0);               // a pointerup anywhere on the page
  const afterClick = state().burn.rotInput;
  harness.keyUp('KeyQ');
  check('rotation holds: latest wins, release falls back, clicks are harmless',
    both === -1 && backToQ === 1 && afterClick === 1 && state().burn.rotInput === 0, `${both} ${backToQ} ${afterClick}`);
}
{
  harness.reset();
  setPower(store, 0);
  check(`POWER never goes below ${POWER_MIN_PCT}%`, state().burn.thrustPct === POWER_MIN_PCT, `${state().burn.thrustPct}`);
}
{
  const long = Object.entries(RESULT_SUB).filter(([, line]) => line.length > MAX_LINE_CHARS);
  check(`result banner lines ≤ ${MAX_LINE_CHARS} chars`, long.length === 0, long.map(([status, line]) => `${status} ${line.length}`).join(', '));
}

finish();
