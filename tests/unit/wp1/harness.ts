// Shared headless harness for WP1 tests. Mounts ONLY the DOM-free systems (store, clock,
// orbit-sim, predict, pace, guidance, input router) on a private store and drives them with
// clock.advance(store, 0.05) — exactly what the 50 ms interval does in the browser.
// Systems are module-level singletons, so a test file creates ONE harness and calls reset()
// between scenarios (the in-app reset path: fresh slices + resetWorld()).
import { createStore, type Store } from '@state/store';
import type { GameState, Pace } from '@state/schema';
import { createInitialState } from '@state/initial';
import { DRIVER_RULES } from '@data/script';
import { advance } from '@systems/clock';
import { mountOrbitSim } from '@systems/orbit-sim';
import { mountPredictor, getPrediction, secUntil, type Prediction } from '@systems/predict';
import { mountDropCache } from '@systems/drop-cache';
import { mountPace, registerTimeKeys, mainCountdown, type Countdown } from '@systems/pace';
import { mountGhostThrust } from '@systems/ghost-thrust';
import { mountInput } from '@systems/input';
import { registerFlightKeys } from '@systems/flight-controls';
import { resetWorld } from '@systems/reset';
import {
  buildFlightContext, flightObjective, createObjectiveFilter, type FlightObjective,
} from '@systems/guidance';
import { elementsFromState, ringFit } from '@/types/orbit';
import { hasIntegrity, integrityState } from '@state/selectors';

export const TICK = 0.05;
// Every harness tick stepped in this process (AP_CHECK_TIMES prints it beside each check).
let ticksStepped = 0;

export interface Harness {
  store: Store<GameState>;
  wall: () => number;
  reset: (seed?: number) => void;
  step: (dtWall?: number) => void;
  keyDown: (code: string) => void;
  keyUp: (code: string) => void;
  press: (code: string) => void;
  // A keydown/keyup with modifier flags (metaKey, ctrlKey, altKey); returns defaultPrevented.
  keyWith: (type: 'keydown' | 'keyup', code: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey', boolean>>) => boolean;
  blur: () => void;
  pred: () => Prediction;
  objective: () => FlightObjective | null;
  shownObjective: () => FlightObjective | null;
  countdown: () => Countdown | null;
  rp: () => number;
  inRing: () => boolean;
  burnPointTac: () => number | null;
  status: () => GameState['burn']['status'];
  pace: () => Pace;
}

export interface HarnessOpts {
  // WP5: run 1 holds SKIP (and puts CHECK THE 2,400 on the coast) until the kid scans STASIS and
  // finds the colonists. The flight suites fly past that step: their colonists are already found,
  // so the coast is the one they were written for. WP5's own suites pass false.
  soulsFound?: boolean;
}

// WP7: `AP_SHIP=1 tsx … <suite>` flies a flight suite on another ship of the fleet (HALCYON), so the
// guidance sweeps written on ship 1 can be run per ship (the lead's per-ship shrink tuning). That ship gets
// a fresh unit carried in (carry.ts freshUnitRacks), and its HOLLOW is put to sleep for good (dormant): a
// flight suite measures the flight, and HALCYON's bites would hold SKIP and eat clusters under it.
export const HARNESS_SHIP = Number(process.env.AP_SHIP ?? 0);
if (!Number.isInteger(HARNESS_SHIP) || HARNESS_SHIP < 0) throw new Error(`AP_SHIP=${process.env.AP_SHIP} is not a ship index`);

// WP10 (lead item 2): VESPER arrives with its Thrust Ctrl failing, so its engine fires by itself. `AP_GHOST=quiet`
// flies a suite on VESPER as after the SWAP (the controller in the role is healthy: no burst), which is what re-checks
// the guidance constants the way the earlier ships were checked; the default (`live`) flies it with the bursts.
export const HARNESS_GHOST = process.env.AP_GHOST ?? 'live';
if (HARNESS_GHOST !== 'live' && HARNESS_GHOST !== 'quiet') throw new Error(`AP_GHOST=${HARNESS_GHOST} is neither live nor quiet`);

// WP11 (the lead's item 3): LAST LIGHT's radiation belt (9,000–12,000 km) lies across every loop bigger than its ring,
// and §6.8 holds TACTICAL from the belt's lead to its exit, so each crossing ends a SKIP (a new one after it) and adds
// wall time. `AP_ZONES=none` flies a suite with the ship's hazard zones taken out, which re-checks the guidance
// constants the way the earlier ships were checked (the zones' own rules are WP9's suites and tests/unit/wp11/lastlight-sim);
// the default (`live`) keeps them.
export const HARNESS_ZONES = process.env.AP_ZONES ?? 'live';
if (HARNESS_ZONES !== 'live' && HARNESS_ZONES !== 'none') throw new Error(`AP_ZONES=${HARNESS_ZONES} is neither live nor none`);

// A fresh ship-1 state, as the harness flies it (see HarnessOpts). Found colonists are also
// triaged: the WP5 tutorials (C09 IS HURT …) are marked done, so the coast reads as it did.
export function harnessState(seed: number, soulsFound: boolean): GameState {
  const state = HARNESS_SHIP === 0
    ? createInitialState({ seed })
    : createInitialState({ seed, shipIndex: HARNESS_SHIP, carried: 'fresh' });
  if (HARNESS_SHIP !== 0) state.hollow.phase = 'dormant';
  if (HARNESS_ZONES === 'none') state.level.zones = [];
  if (HARNESS_GHOST === 'quiet') {
    const controller = state.memory.find((seg) => seg.role === 'thrust-ctrl');
    if (!controller || !hasIntegrity(controller)) throw new Error('AP_GHOST=quiet: no Thrust Ctrl with an integrity');
    controller.integrity = 100;
    controller.state = integrityState(100);
  }
  if (soulsFound) {
    state.director.done.push(...DRIVER_RULES.map((rule) => rule.id));
  }
  return state;
}

export function createHarness(seed = 1, opts: HarnessOpts = {}): Harness {
  const soulsFound = opts.soulsFound ?? true;
  const store = createStore<GameState>(harnessState(seed, soulsFound));
  mountOrbitSim(store);
  mountPredictor(store);
  // Slice 1a: pace reads the landing's drop solution once a flight locks, so every harness has the drop cache (once per
  // store: a second mount throws), right after the predictor as main.ts mounts it.
  mountDropCache(store);
  mountPace(store);
  // WP10: the engine firing by itself (the first burst's alarm, the counter, a SKIP re-planned after a later burst):
  // inert on a ship whose Thrust Ctrl is healthy (ships 1–3), live on VESPER (AP_SHIP=3).
  mountGhostThrust(store);
  const keyTarget = new EventTarget();
  mountInput(keyTarget);
  registerFlightKeys(store);
  registerTimeKeys(store);
  const filter = createObjectiveFilter();
  let shown: FlightObjective | null = null;
  let wall = 0;

  const key = (type: 'keydown' | 'keyup', code: string): void => {
    keyTarget.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }));
  };
  const objective = (): FlightObjective | null => flightObjective(buildFlightContext(store.getState(), getPrediction()));

  return {
    store,
    wall: () => wall,
    reset(nextSeed = seed) {
      store.update((d) => { Object.assign(d, harnessState(nextSeed, soulsFound)); });
      resetWorld();
      filter.reset();
      shown = null;
      wall = 0;
    },
    step(dtWall = TICK) {
      ticksStepped++;
      advance(store, dtWall);
      wall += dtWall;
      // The strip the kid reads: the objective through the hysteresis filter, on AI time.
      shown = filter.next(objective(), store.getState().clock.paused ? 0 : dtWall);
    },
    keyDown: (code) => key('keydown', code),
    keyUp: (code) => key('keyup', code),
    press(code) { key('keydown', code); key('keyup', code); },
    keyWith(type, code, mods) {
      const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ...mods });
      keyTarget.dispatchEvent(event);
      return event.defaultPrevented;
    },
    blur: () => { keyTarget.dispatchEvent(new Event('blur')); },
    pred: () => getPrediction(),
    objective,
    shownObjective: () => shown,
    countdown: () => mainCountdown(store.getState(), getPrediction()),
    rp: () => elementsFromState(store.getState().orbit, store.getState().level.planet.mu).rp,
    inRing: () => ringFit(elementsFromState(store.getState().orbit, store.getState().level.planet.mu), store.getState().level.ring).inRing,
    burnPointTac() {
      const pred = getPrediction();
      const burnPoint = pred.burnPoint;
      if (!burnPoint) return null;
      return secUntil(pred, burnPoint.inSec, store.getState().clock.tSec) / store.getState().level.tacticalWarp;
    },
    status: () => store.getState().burn.status,
    pace: () => store.getState().clock.pace,
  };
}

// A scripted kid who obeys the strip: lets go on RELEASE/TOO EARLY/WAIT/TURN AROUND, presses
// any named preset key, holds on hold/KEEP HOLDING/NOW, and presses F whenever the line names it.
export function followStrip(h: Harness, reactionSec: number, maxWall: number, onTick?: () => void): void {
  let holding = false;
  const setHolding = (on: boolean): void => {
    if (on && !holding) h.keyDown('Space');
    if (!on && holding) h.keyUp('Space');
    holding = on;
  };
  const react = (text: string): void => {
    const keyMatch = text.match(/press \[([WASD])\]/);
    if (/RELEASE|TOO EARLY|WAIT|TURN AROUND/.test(text)) {
      setHolding(false);
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
    } else {
      if (keyMatch) h.press(`Key${keyMatch[1]}`);
      if (/hold \[SPACE\]|KEEP HOLDING|NOW/.test(text)) setHolding(true);
    }
    if (text.includes('[F]')) h.press('KeyF');
  };
  const queue: { at: number; text: string }[] = [];
  let lastText = '';
  const end = h.wall() + maxWall;
  while (h.status() === 'approaching' && h.wall() < end) {
    h.step();
    onTick?.();
    const text = h.shownObjective()?.text ?? '';
    if (text !== lastText) { lastText = text; queue.push({ at: h.wall() + reactionSec, text }); }
    while (queue.length > 0 && queue[0]!.at <= h.wall() + 1e-9) react(queue.shift()!.text);
  }
  setHolding(false);
}

// Tiny assertion kit: collect results, print PASS/FAIL lines, exit non-zero on any failure.
const results: { name: string; ok: boolean; detail: string }[] = [];

// AP_CHECK_TIMES=1 starts each line with the seconds since the suite started and the harness ticks stepped so far, to
// find where a slow suite spends its time (the unit tier's budget: tests/unit/run.mjs). The ticks do not depend on how
// busy the machine is.
const STAMP_CHECKS = process.env.AP_CHECK_TIMES === '1';

export function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  const stamp = STAMP_CHECKS ? `[${process.uptime().toFixed(1).padStart(5)} s ${String(ticksStepped).padStart(7)} t] ` : '';
  console.log(`${stamp}${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// A suite that ran no check at all is a broken suite (a filter that matched nothing, an early return), not a pass
// (final review, Fran's fail-loudly rule).
export function finish(): void {
  const failed = results.filter((result) => !result.ok);
  console.log(`---- ${results.length - failed.length}/${results.length} checks passed`);
  if (results.length === 0) {
    console.log('FAIL  the suite ran no checks');
    process.exit(1);
  }
  if (failed.length > 0) process.exit(1);
}
