// WP10, the lead's item 3 (SKIP and ghost bursts, the lead's ruling), as the lead's clarification of 2026-10-20 09:05
// reads it (strict: "the plan changed" is any of the line or its target burn changing, ▼ or ▲ leaving the ring, the loop
// opening or turning to impact, the FUEL for the fix rising past the tank, a Rule 4 verdict flipping; decided on game
// state at each burst, never on wall time). Only the ship's FIRST uncommanded onset stops a SKIP; later bursts are flown
// through: the SKIP splits its jump at each, flies the burst exactly as the warp-limited sim would, bumps the counter,
// re-plans, and flies on unless that burst changed the plan; then it stops at that burst's end, on the new line. On
// VESPER (HOLLOW asleep: the flight alone), Thrust Ctrl failing:
// • the first onset: a SKIP lands exactly on its start (the alarm moment);
// • a WAIT of over 1,000 tac s (two planted loops, 8 seeds each): one press flies through the bursts and stops exactly
//   at the end of the FIRST burst whose plan changed, as a ×25 run of the same game time judges each burst (the plan
//   at rest right after it against the plan right before it), with the ship then equal to that run (the same bursts in
//   the same windows, the same Δv, FUEL and loop) and the counter showing every burst;
// • the stop is game state's alone: the same SKIP with a 1 s pause in the middle, or with the wall clock jittering,
//   stops at the same burst with the same ship (WP10 review: before the fix it flew 1–4 bursts further on some seeds);
// • with RETRO held far out (VESPER's preset), the burst that takes ▼ out of the ring (or into the planet) stops the
//   SKIP right at its end, and the strip reads the new plan.
// WP10 review fix round 1 rewrote this file: before it, a burst was judged against the plan of the last quiet tick and
// Rule 4 only came a tick after a burst, and the planted WAITs flew 30+ bursts to their landing in one press. Under the
// strict reading no planted loop keeps its plan through 1,000 tac s of bursts (tests/unit/wp10/fix1/probes/one-press.log:
// 40 loops × 4 seeds, every one stops on a changed plan after 1–1,159 tac s).
import { createHarness, check, finish } from '../wp1/harness';
import { fixtureShip } from '../support/arm-ship';
import { setDebugWarp, skipBlockReason, skipTarget } from '@systems/pace';
import { getPrediction, currentPrediction } from '@systems/predict';
import { setPaused } from '@systems/clock';
import { on } from '@systems/events';
import { lastSkipPlanChange, skipPlanOf, planChange, skipTickSec, type PlanChange, type SkipPlan } from '@systems/ghost-thrust';
import { GHOST_WARN_ID } from '@systems/alerts';
import { GHOST_TEXT } from '@data/ghost-text';
import { createInitialState } from '@state/initial';
import { giveTools } from '../map/repo-fixture';
import { resetWorld } from '@systems/reset';
import { stateFromElements, elementsFromState, ringFit } from '@/types/orbit';
import type { SasMode } from '@state/schema';
import { byDepth } from '../depth';

const VESPER = 3;
const h = createHarness(1);
const state = () => h.store.getState();
const warp = fixtureShip(VESPER).flight.tacticalWarp;
const TICK = 0.05;

// The wp1 harness has no stepUntil: step until `until` holds or `maxWall` passes.
function stepUntil(until: () => boolean, maxWall: number): void {
  const end = h.wall() + maxWall;
  while (!until() && h.wall() < end) h.step();
}

function vesper(seed: number): void {
  h.reset(seed);
  h.store.update((d) => {
    Object.assign(d, createInitialState({ seed, shipIndex: VESPER, carried: 'fresh' }));
    d.hollow.phase = 'dormant';
  });
  resetWorld();
  // Track RETIRE: run 1's arm VESPER refuses SKIP while its engine limps with no Swap aboard (ENGINE FAULT — NO SKIP,
  // slice 3b); these SKIPs are flown as phase 2's were, with a Swap file aboard (not swapped: the controller still fires).
  giveTools(h.store, ['swap']);
}

interface Burst { startTSec: number; endTSec: number; inSkip: boolean }

function recordBursts(): { bursts: Burst[]; off: () => void } {
  const bursts: Burst[] = [];
  const off = on('ghost-start', ({ inSkip }) => {
    const ghost = state().burn.ghost;
    if (!ghost) throw new Error('ghost-start without a burst');
    bursts.push({ startTSec: ghost.startTSec, endTSec: ghost.endTSec, inSkip });
  });
  return { bursts, off };
}

interface Plant { rp: number; ra: number; nu: number; sas: SasMode; heading: number }

// The plant: a loop of `rp` × `ra` km at true anomaly `nu`, the preset `sas` (or the heading fixed when 'off').
function plant(seed: number, where: Plant): void {
  vesper(seed);
  const orbit = stateFromElements(where.rp, (where.ra - where.rp) / (where.ra + where.rp), 0, where.nu, state().level.planet.mu);
  h.store.mutate((d) => { d.orbit.x = orbit.x; d.orbit.y = orbit.y; d.orbit.vx = orbit.vx; d.orbit.vy = orbit.vy; });
  h.store.update((d) => { d.burn.sasMode = where.sas; d.burn.omega = 0; if (where.sas === 'off') d.burn.heading = where.heading; });
}

// Past the first burst and its alarm (the SKIP's landing on it is checked on its own below), at CRUISE.
function pastFirstBurst(): void {
  stepUntil(() => state().burn.ghostBursts > 0, 120);
  stepUntil(() => state().burn.ghost === null && !state().alerts.list.some((alert) => alert.severity === 'alarm'), 20);
}

const loopNow = () => ringFit(elementsFromState(state().orbit, state().level.planet.mu), state().level.ring);

interface SkipRun {
  stopT: number;
  bursts: Burst[];
  change: PlanChange | null;
  skipWarp: number;
  fuel: number;
  dv: number;
  rp: number;
  ra: number;
  wall: number;
  counter: string | null;
}

// One press of F after the first burst; `pauseAtWall`: a 1 s pause that many wall s into the SKIP; `jitter`: the wall
// clock's ticks vary (0.03–0.07 s, a fixed pattern) instead of the even 50 ms.
function skipOnce(seed: number, where: Plant, opts: { pauseAtWall?: number; jitter?: boolean } = {}): SkipRun {
  plant(seed, where);
  pastFirstBurst();
  const skip = recordBursts();
  h.press('KeyF');
  const skipWarp = state().clock.skipWarp ?? NaN;
  let wall = 0;
  let paused = false;
  let tick = 0;
  while ((state().clock.skipWarp !== null || wall === 0) && wall < 60) {
    if (opts.pauseAtWall !== undefined && !paused && wall >= opts.pauseAtWall) {
      paused = true;
      setPaused(h.store, true);
      for (let i = 0; i < 20; i++) h.step();
      setPaused(h.store, false);
    }
    const dt = opts.jitter ? TICK * (0.6 + 0.8 * ((tick * 7919) % 11) / 10) : TICK;
    h.step(dt);
    wall += dt;
    tick++;
  }
  skip.off();
  const loop = loopNow();
  return {
    stopT: state().clock.tSec, bursts: skip.bursts, change: lastSkipPlanChange(), skipWarp, fuel: state().burn.fuelPct,
    dv: state().burn.dvDeliveredKmS, rp: loop.rp, ra: loop.ra, wall,
    counter: state().alerts.list.find((alert) => alert.id === GHOST_WARN_ID)?.text ?? null,
  };
}

// The ×25 reference over the same game time: its bursts, its ship at `stopT`, and the first burst (by its end) at which
// the plan changed, judged as the SKIP judges it: the plan at rest right after the burst against the plan on the tick
// right before it, with the SKIP's own tick (`skipWarp`) as the resolution for the target's move.
function reference(seed: number, where: Plant, stopT: number, skipWarp: number): {
  bursts: Burst[]; firstChangeEndT: number | null; firstChange: PlanChange | null; fuel: number; dv: number; rp: number; ra: number;
} {
  plant(seed, where);
  pastFirstBurst();
  const ref = recordBursts();
  let ended = false;
  const offStop = on('ghost-stop', () => { ended = true; });
  setDebugWarp(h.store, 25);
  let before: SkipPlan = skipPlanOf(state(), currentPrediction());
  let firstChangeEndT: number | null = null;
  let firstChange: PlanChange | null = null;
  while (state().clock.tSec < stopT - 1e-9) {
    const startsBurst = state().burn.ghost === null;
    h.step(Math.min(TICK, (stopT - state().clock.tSec) / 25));
    if (ended) {
      ended = false;
      const after = skipPlanOf(state(), currentPrediction());
      const change = planChange(before, after, skipTickSec(skipWarp));
      if (change !== null && firstChangeEndT === null) { firstChangeEndT = state().clock.tSec; firstChange = change; }
      before = after;
    } else if (startsBurst && state().burn.ghost === null) {
      before = skipPlanOf(state(), currentPrediction());
    }
  }
  setDebugWarp(h.store, null);
  ref.off();
  offStop();
  const loop = loopNow();
  return { bursts: ref.bursts, firstChangeEndT, firstChange, fuel: state().burn.fuelPct, dv: state().burn.dvDeliveredKmS, rp: loop.rp, ra: loop.ra };
}

// --- The first onset stops a SKIP --------------------------------------------------------------------------------
{
  vesper(2);
  h.step();
  h.press('KeyF');
  let landed: number | null = null;
  stepUntil(() => {
    const clock = state().clock;
    if (clock.skipWarp !== null && clock.skipEndTSec !== null && clock.tSec >= clock.skipEndTSec) landed = clock.tSec;
    return state().burn.ghostBursts > 0;
  }, 60);
  check('the first onset: the SKIP lands exactly on its start, and it fires at TACTICAL on the next tick', landed !== null
    && Math.abs(state().burn.ghost!.startTSec - landed) < 1e-6 && state().clock.pace !== 'skip', `${landed} ${state().burn.ghost?.startTSec}`);
}

// --- One press through a WAIT of over 1,000 tac s: flown through until the first burst that changed the plan --------
// Two loops: 6,000 × 30,000 km with the heading along the major axis (the bursts lift ▼ out of the ring), and
// 9,000 × 30,000 km (▼ above the ring: the bursts drain the tank until ACCEPT ORBIT is the only way on, a Rule 4 flip).
const PLANTS: { name: string; where: Plant }[] = [
  { name: '6,000 × 30,000 km', where: { rp: 6000, ra: 30000, nu: -3.1, sas: 'off', heading: 0 } },
  { name: '9,000 × 30,000 km', where: { rp: 9000, ra: 30000, nu: -3.1, sas: 'off', heading: 0 } },
];
const reasons = new Map<string, number>();
for (const { name, where } of PLANTS) {
  let exactStops = 0;
  let sameShips = 0;
  let counted = 0;
  let longest = 0;
  let mostBursts = 0;
  // Quick depth (tests/unit/depth.ts): seed 2 alone on each loop (it flies the SKIP and its ×25 reference; the unit tier's
  // budget, slice 3a's review fixes), whose two loops stop for ▼ leaving the ring and for Rule 4's verdict; full: 1–8.
  const seedList = byDepth([2], [1, 2, 3, 4, 5, 6, 7, 8]);
  const seeds = seedList.length;
  for (const seed of seedList) {
    plant(seed, where);
    pastFirstBurst();
    const t0 = state().clock.tSec;
    const target = skipTarget(state(), getPrediction());
    const waitTac = target === null ? 0 : (target.atTSec - t0) / warp;
    if (!(waitTac > 1000 && skipBlockReason(state(), getPrediction()) === null)) {
      check(`${name}, seed ${seed}: a WAIT of over 1,000 tac s, SKIP offered`, false, `${waitTac.toFixed(0)} tac s`);
      continue;
    }
    const run = skipOnce(seed, where);
    const flown = run.bursts.filter((burst) => burst.inSkip).length;
    longest = Math.max(longest, (run.stopT - t0) / warp);
    mostBursts = Math.max(mostBursts, flown);
    if (run.change !== null) reasons.set(run.change, (reasons.get(run.change) ?? 0) + 1);
    const ref = reference(seed, where, run.stopT, run.skipWarp);
    // It stops at the end of the first burst whose plan changed in the ×25 run, for the same reason; or, with no such
    // burst, on its landing.
    const lastEnd = run.bursts[run.bursts.length - 1]?.endTSec ?? NaN;
    const stoppedRight = run.change !== null
      ? ref.firstChangeEndT !== null && Math.abs(run.stopT - ref.firstChangeEndT) < 1e-6 && Math.abs(run.stopT - lastEnd) < 1e-6
        && ref.firstChange === run.change
      : ref.firstChangeEndT === null;
    if (stoppedRight) exactStops++;
    const sameWindows = run.bursts.length === ref.bursts.length
      && run.bursts.every((burst, i) => Math.abs(burst.startTSec - ref.bursts[i]!.startTSec) < 1e-6 && Math.abs(burst.endTSec - ref.bursts[i]!.endTSec) < 1e-6);
    if (sameWindows && Math.abs(run.dv - ref.dv) < 1e-9 && Math.abs(run.fuel - ref.fuel) < 1e-6
      && Math.abs(run.rp - ref.rp) < 1 && Math.abs(run.ra - ref.ra) < 1) sameShips++;
    if (run.counter === GHOST_TEXT.counter(state().burn.ghostBursts)) counted++;
    if (!stoppedRight || !sameWindows) {
      console.log(`  ${name} seed ${seed}: stop ${run.stopT.toFixed(3)} (${run.change}) vs ×25 first change ${ref.firstChangeEndT?.toFixed(3)} (${ref.firstChange}); bursts ${run.bursts.length}/${ref.bursts.length}`);
    }
  }
  check(`${name}: one press flies through the later bursts and stops exactly at the end of the first one that changed the plan, as a ×25 run judges each burst (${seeds} seeds; up to ${mostBursts} bursts, ${longest.toFixed(0)} tac s)`,
    exactStops === seeds && mostBursts >= 5, `${exactStops}/${seeds}`);
  check('…at that moment the ship equals the ×25 run: the same bursts in the same windows, the same Δv and FUEL, the same loop (within 1 km)',
    sameShips === seeds, `${sameShips}/${seeds}`);
  check('…and the counter shows every burst (`UNCOMMANDED THRUST ×n`)', counted === seeds, `${counted}/${seeds}`);
}
check('the stops name changes in the lead\'s list (here ▼ leaving the ring, and Rule 4\'s verdict)', reasons.has('ring') && reasons.has('verdict'),
  [...reasons].map(([reason, count]) => `${reason} ${count}`).join(', '));

// --- The stop is game state's alone ------------------------------------------------------------------------------
{
  let same = 0;
  const tries: string[] = [];
  for (const { where } of PLANTS) {
    for (const seed of [2, 5]) {
      const plain = skipOnce(seed, where);
      const paused = skipOnce(seed, where, { pauseAtWall: 1 });
      const jittered = skipOnce(seed, where, { jitter: true });
      const agree = (other: SkipRun): boolean => Math.abs(other.stopT - plain.stopT) < 1e-6 && other.bursts.length === plain.bursts.length
        && Math.abs(other.fuel - plain.fuel) < 1e-6 && Math.abs(other.rp - plain.rp) < 1 && Math.abs(other.ra - plain.ra) < 1
        && other.change === plain.change;
      if (agree(paused) && agree(jittered)) same++;
      tries.push(`${plain.bursts.length}/${paused.bursts.length}/${jittered.bursts.length} bursts`);
    }
  }
  check('a 1 s pause in the middle of the SKIP, or a jittering wall clock, stops it at the same burst with the same ship (4 runs)',
    same === 4, tries.join(', '));
}

// --- RETRO far out: the burst that takes ▼ out of the ring stops the SKIP at its end ----------------------------------
{
  let stops = 0;
  const seen: string[] = [];
  for (let seed = 1; seed <= 4; seed++) {
    const run = skipOnce(seed, { rp: 6000, ra: 42000, nu: -3.0, sas: 'retrograde', heading: 0 });
    const last = run.bursts[run.bursts.length - 1];
    const pred = getPrediction();
    const below = pred.outcome === 'impact' || pred.rp < state().level.ring.min;
    const line = h.objective()?.id ?? '';
    seen.push(`${run.change}:${line}`);
    if ((run.change === 'ring' || run.change === 'impact') && last !== undefined && Math.abs(run.stopT - last.endTSec) < 1e-6
      && below && line !== 'F11-ra-high' && state().clock.skipWarp === null) stops++;
  }
  check('RETRO held far out: the burst that takes ▼ out of the ring (or into the planet) stops the SKIP right at its end, on a new line (4 seeds)',
    stops === 4, seen.join(', '));
}

finish();
