// WP4 acceptance 4: the ghost scheduler (C2, §6.4), live from ship 4 (WP10) but built now.
// With Thrust Ctrl at 31% (failing), the mean number of bursts per 120 tactical s at ×25 and at
// ×200 agree within 5% over 200 seeds (the expected mean is about 4.8: 120 / 25, a little less
// because a burst can't start while one runs), and the Δv per burst agrees within 2%. With Thrust
// Ctrl at 50 or better there are none. Plus: sticky bursts end on a SPACE press and release, a
// burst holds the pace at TACTICAL and blocks SKIP, and a fixed controller silences a running one.
//
// A lean harness: the store, the clock heartbeat and orbit-sim only, with the warp pinned, so
// 400 runs of 120 tactical s take seconds. The ship sits on a circular loop at 12,000 km, outside
// the ring, so nothing locks, crashes or runs dry.
import { check, finish } from '../wp1/harness';
import { createStore } from '@state/store';
import type { GameState } from '@state/schema';
import { createInitialState } from '@state/initial';
import { advance } from '@systems/clock';
import { resetWorld } from '@systems/reset';
import { mountOrbitSim } from '@systems/orbit-sim';
import { computePrediction, mountPredictor } from '@systems/predict';
import { choosePace, skipBlockReason } from '@systems/pace';
import { holdThrottle } from '@systems/flight-controls';
import { on } from '@systems/events';
import { hasIntegrity } from '@state/selectors';
import { GHOST_BY_BAND } from '@data/tuning';

// WP12 part 1: the failing controller's spec as tuned (read from the data, not §3.3's numbers).
const FAILING_GHOST = GHOST_BY_BAND.failing;
if (!FAILING_GHOST) throw new Error('ghost-sim: no failing ghost spec');

const TICK = 0.05;
const RUN_TAC = 120;
const SEEDS = 200;
const ORBIT_R = 12000;

const store = createStore<GameState>(createInitialState({ seed: 1 }));
mountOrbitSim(store);
let starts = 0;
let stops = 0;
on('ghost-start', () => { starts++; });
on('ghost-stop', () => { stops++; });

function thrustCtrl(state: GameState) {
  const seg = state.memory.find((candidate) => candidate.role === 'thrust-ctrl');
  if (!seg || !hasIntegrity(seg)) throw new Error('no Thrust Ctrl');
  return seg;
}

function fresh(seed: number, integrity: number, warp: number): void {
  store.update((d) => {
    Object.assign(d, createInitialState({ seed }));
    const speed = Math.sqrt(d.level.planet.mu / ORBIT_R);
    d.orbit = { x: ORBIT_R, y: 0, vx: 0, vy: speed };
    d.clock.speed = warp;
    d.clock.speedTarget = warp;
    thrustCtrl(d).integrity = integrity;
  });
  resetWorld();
  starts = 0;
  stops = 0;
}

function runFor(tac: number): void {
  const state = store.getState();
  const gameSec = tac * state.level.tacticalWarp;
  const end = state.clock.tSec + gameSec;
  while (store.getState().clock.tSec < end - 1e-9) advance(store, TICK);
}

interface Stats { meanEvents: number; dvPerEvent: number }

function stats(warp: number, integrity: number, seeds = SEEDS): Stats {
  let events = 0;
  let dv = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    fresh(seed, integrity, warp);
    runFor(RUN_TAC);
    events += starts;
    dv += store.getState().burn.dvDeliveredKmS;
  }
  return { meanEvents: events / seeds, dvPerEvent: events > 0 ? dv / events : 0 };
}

// --- Warp invariance --------------------------------------------------------------------------------
{
  const slow = stats(25, 31);
  const fast = stats(200, 31);
  const eventsDiff = Math.abs(slow.meanEvents - fast.meanEvents) / slow.meanEvents;
  const dvDiff = Math.abs(slow.dvPerEvent - fast.dvPerEvent) / slow.dvPerEvent;
  check('ghost: mean bursts per 120 tac s at ×25 and ×200 agree within 5%', eventsDiff <= 0.05,
    `×25 ${slow.meanEvents.toFixed(3)}, ×200 ${fast.meanEvents.toFixed(3)} (${(eventsDiff * 100).toFixed(2)}%)`);
  // WP12 part 1 retuned the failing controller (GHOST_BY_BAND.failing: 10 tac s, 0.3; §3.3 had 25 tac s, 0.15): the
  // expected count is 120 ÷ (mean interval + a burst, which blocks the next), within the old check's −10% / +6%.
  const perRun = 120 / (FAILING_GHOST.meanIntervalTac + FAILING_GHOST.durTac);
  check(`ghost: …about ${perRun.toFixed(1)} a run (120 / ${FAILING_GHOST.meanIntervalTac}, minus the time a burst blocks the next)`,
    slow.meanEvents > perRun * 0.9 && slow.meanEvents < perRun * 1.06, slow.meanEvents.toFixed(3));
  check('ghost: Δv per burst agrees within 2%', dvDiff <= 0.02,
    `×25 ${(slow.dvPerEvent * 1000).toFixed(3)} m/s, ×200 ${(fast.dvPerEvent * 1000).toFixed(3)} m/s (${(dvDiff * 100).toFixed(2)}%)`);
  // SKIP's ceiling: a tick is 100 game s there, five bursts' worth.
  const skip = stats(2000, 31);
  check('ghost: …and at ×2000 (SKIP) within 5% too', Math.abs(skip.meanEvents - slow.meanEvents) / slow.meanEvents <= 0.05
    && Math.abs(skip.dvPerEvent - slow.dvPerEvent) / slow.dvPerEvent <= 0.02,
    `×2000 ${skip.meanEvents.toFixed(3)} bursts, ${(skip.dvPerEvent * 1000).toFixed(3)} m/s`);
  // amp × 5 m/s² × 1 tac s (20 game s): 30 m/s at WP12's 0.3 (15 m/s at §3.3's 0.15); a burst cut off by the end of a
  // run is shorter.
  const burstMs = FAILING_GHOST.amp * 5 * FAILING_GHOST.durTac * 20;
  check(`ghost: a burst is amp × nominal × duration (${burstMs.toFixed(0)} m/s)`, Math.abs(slow.dvPerEvent * 1000 - burstMs) < 0.5 * (burstMs / 15),
    (slow.dvPerEvent * 1000).toFixed(3));
}

// --- No ghost from a healthy controller ----------------------------------------------------------------
{
  const healthy = [50, 79, 100].map((integrity) => stats(200, integrity, 20).meanEvents);
  check('ghost: none with Thrust Ctrl at 50 / 79 / 100', healthy.every((mean) => mean === 0), healthy.join(','));
}

// --- Sticky bursts, the pace, SKIP and a fix ------------------------------------------------------------
// The throttle reads the prediction (which burn it was pressed for): mounted only now, so the
// 400 statistics runs above stay cheap.
mountPredictor(store);
{
  // A dead controller (stick 0.3): run until a sticky burst runs past its 1 s.
  let sticky = false;
  for (let seed = 1; seed <= 200 && !sticky; seed++) {
    fresh(seed, 10, 20);
    for (let i = 0; i < 2000 && !sticky; i++) {
      advance(store, TICK);
      const ghost = store.getState().burn.ghost;
      sticky = ghost !== null && ghost.sticky;
    }
  }
  check('sticky: a dead controller sometimes sticks', sticky);
  runFor(5);
  check('sticky: still firing 5 tac s later', store.getState().burn.ghost?.sticky === true);
  const pred = computePrediction(store.getState());
  check('a burst holds the pace at TACTICAL', choosePace(store.getState(), pred, true, TICK) === 'tactical');
  check('a burst blocks SKIP (ENGINE FIRING)', skipBlockReason(store.getState(), pred) === 'ENGINE FIRING');
  holdThrottle(store, 'key', true);
  advance(store, TICK);
  check('sticky: pressing SPACE does not end it yet', store.getState().burn.ghost !== null);
  holdThrottle(store, 'key', false);
  check('sticky: releasing SPACE ends it', store.getState().burn.ghost === null && stops >= 1);

  // A failing controller mid-burst, fixed (a swap or a repair would do this): silent at once.
  let firing = false;
  for (let seed = 1; seed <= 50 && !firing; seed++) {
    fresh(seed, 31, 20);
    for (let i = 0; i < 4000 && !firing; i++) {
      advance(store, TICK);
      firing = store.getState().burn.ghost !== null;
    }
  }
  check('fix: found a running burst', firing);
  store.update((d) => { thrustCtrl(d).integrity = 100; });
  const before = stops;
  advance(store, TICK);
  check('fix: a healthy controller silences a running burst at once', store.getState().burn.ghost === null && stops === before + 1
    && store.getState().burn.lastTickDvKmS === 0);
}

finish();
