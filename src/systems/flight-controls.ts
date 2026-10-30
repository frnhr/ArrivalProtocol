import type { Store } from '@state/store';
import type { GameState, PresetMode, FiringSource } from '@state/schema';
import { isPresetAligning } from '@systems/attitude';
import { endFlight, endGhost } from '@systems/orbit-sim';
import { capabilitiesNow, engineFault, presetsAvailable } from '@systems/capabilities';
import { getPrediction, getSensedPrediction, burnKey } from '@systems/predict';
import {
  canAccept, PRESET_KEY, asksToHoldSpace, buildFlightContext, shipObjective,
} from '@systems/guidance';
import { registerKeys } from '@systems/input';
import { onWorldReset } from '@systems/reset';
import { onPostTick } from '@systems/clock';
import { emit, NO_PAYLOAD } from '@systems/events';
import { stopSkipOnPress } from '@systems/pace';
import { engineOpen, isLanding } from '@state/selectors';
import { STRANDED_RANGE_FRAC, POWER_MIN_PCT } from '@data/tuning';

// Player actions on the ship, DOM-free. Keys (through the input router), the Engine window
// buttons and headless tests all call these, so every path obeys the same refusals.
// Each returns null on success or a short refusal the UI can show (PAUSED, …). A refused
// player input is also announced on the event bus ('refused'): it buzzes, and the director
// explains the ones that need words.

export type Refusal = string;

// The ship's controls only work while the kid looks at the ship (§3.1): in blue, SPACE and the
// presets buzz and the strip says where the controls are.
export const SHIP_SCREEN_REFUSAL: Refusal = 'SHIP SCREEN';

// A failing (or worse) Autopilot file can't point the ship (C3): W/A/S/D are refused, the sim lets
// go of the preset (orbit-sim) and the kid turns by hand with Q/E in MANUAL.
export const AUTOPILOT_REFUSAL: Refusal = 'AUTOPILOT DAMAGED';

// The engine after the landing has ended (slice 1b): the pods are away or parked, nothing is left to burn for.
export const LANDING_OVER_REFUSAL: Refusal = 'LANDING OVER';

// The engine answers while it is open (selectors engineOpen, slice 1b): a live approach, or a landing going on (trims,
// GO LOWER, the 'lift' burn). Once the landing has ended its words are the landing's.
function flightRefusal(state: Readonly<GameState>): Refusal | null {
  if (!engineOpen(state)) return isLanding(state) && state.landing.ended !== null ? LANDING_OVER_REFUSAL : 'FLIGHT OVER';
  if (state.clock.paused) return 'PAUSED';
  return null;
}

// What stops a PLAYER input (AUTOBURN, WP9, flies from blue and only obeys flightRefusal).
function playerRefusal(state: Readonly<GameState>): Refusal | null {
  return flightRefusal(state) ?? (state.ui.mode === 'memory' ? SHIP_SCREEN_REFUSAL : null);
}

function refuse(refusal: Refusal): Refusal {
  emit('refused', { reason: refusal });
  return refusal;
}

// The throttle itself, per source. Starting is refused while paused (pause is look-only) or
// after the flight. Stopping only releases the source that holds it, so the player letting
// go can never cut an AUTOBURN (WP9) short. The player's own inputs go through holdThrottle.
export function setFiring(store: Store<GameState>, on: boolean, source: FiringSource): Refusal | null {
  const state = store.getState();
  if (on) {
    const refusal = flightRefusal(state);
    if (refusal) return refusal;
    // The player pressing SPACE over an AUTOBURN takes the throttle (§6.10: a takeover). The burn goes on
    // without a gap; AUTOBURN sees the player holding it and lets go (systems/autoburn.ts).
    if (state.burn.firing && state.burn.firingSource === 'auto' && source === 'player') {
      store.update((draft) => { draft.burn.firingSource = 'player'; });
      return null;
    }
    if (state.burn.firing) return null;
    const firingFor = burnKey(getPrediction().burnPoint);
    store.update((draft) => { draft.burn.firing = true; draft.burn.firingSource = source; draft.burn.firingFor = firingFor; });
    return null;
  }
  if (state.burn.firing && state.burn.firingSource === source) {
    store.update((draft) => { draft.burn.firing = false; draft.burn.firingSource = null; draft.burn.firingFor = null; });
  }
  return null;
}

// The player holds the throttle with SPACE, the BURN button, or both at once. The burn runs
// while ANY of them is held, so a SPACE tap during a mouse hold (or the mouse leaving the
// button during a SPACE hold) never cuts the other one short.
export type PlayerHold = 'key' | 'pointer';
const throttleHolds = new Set<PlayerHold>();
// Holds whose press stopped a SKIP under a line that did not ask for SPACE (pace.ts stopSkipOnPress): they burn
// nothing until they are let go or the ship's line asks for SPACE (burnSkipStopHoldsWhenAsked: never AUTOBURN's offer),
// also when the mode switch hands a still-held SPACE back to the ship (resumeHeldThrottle). A pause drops them.
const skipStopHolds = new Set<PlayerHold>();

// The ship's line asks for SPACE right now. It is the flight's own line, as guidance builds it from the sensed
// prediction (§6.2: what the strip shows), not the director's composed one: a press under a MIND or tutorial line
// then does what the flight needs, which is what its own line would have asked.
// For a fresh press and for a hold kept down from before (a dropped hold going live) alike: AUTOBURN's `[SPACE] takes
// over` is an offer, not an ask (WP10, the lead's ruling), and its row names no SPACE key (guidance asksToHoldSpace).
// In LANDING the ship's line is the flight's rows there (guidance landingFlightRow, the landing table's L2).
function lineAsks(state: Readonly<GameState>): boolean {
  const objective = shipObjective(buildFlightContext(state, getSensedPrediction()));
  return objective !== null && asksToHoldSpace(objective);
}

// An engine that can't fire at all (Engine I/O dead or gone, no Thrust Ctrl) coughs on every
// fresh press: the throttle is still held, so the burn starts the moment the file is back. A
// sticky ghost burst (C2) stops once SPACE has been pressed and released.
export function holdThrottle(store: Store<GameState>, hold: PlayerHold, on: boolean): Refusal | null {
  if (on) {
    // Holds from before an outside stop (pause, blur, leaving amber, the end of the flight) no
    // longer count: after the world was frozen the throttle needs a fresh press.
    const fresh = !store.getState().burn.firing;
    if (fresh) throttleHolds.clear();
    const blocked = playerRefusal(store.getState());
    if (blocked) return refuse(blocked);
    if (skipStopHolds.has(hold)) return null;
    // A press during a SKIP stops it. Under a line that asks for SPACE it also burns, as the line says; under any other
    // line it only stops the SKIP, and its hold burns nothing until the line asks for SPACE (pace.ts stopSkipOnPress;
    // the lead's ruling for LEAD-2 review round 3, which narrowed round 2's).
    if (store.getState().clock.skipWarp !== null) {
      const asked = lineAsks(store.getState());
      stopSkipOnPress(store);
      if (!asked) {
        skipStopHolds.add(hold);
        return null;
      }
    }
    const refusal = setFiring(store, true, 'player');
    if (refusal === null) {
      throttleHolds.add(hold);
      const state = store.getState();
      if (fresh && engineFault(capabilitiesNow(state)) !== null) emit('engine-cough', NO_PAYLOAD);
      if (state.burn.ghost?.sticky && !state.burn.ghost.releaseArmed) {
        store.update((draft) => { if (draft.burn.ghost) draft.burn.ghost.releaseArmed = true; });
      }
    }
    return refusal;
  }
  skipStopHolds.delete(hold);
  if (!throttleHolds.delete(hold)) return null;
  if (throttleHolds.size === 0) {
    setFiring(store, false, 'player');
    if (store.getState().burn.ghost?.releaseArmed) endGhost(store);
  }
  return null;
}

// A hold whose press only stopped a SKIP burns once the ship's line asks for SPACE: the kid is then doing what the strip
// says, as in resumeHeldThrottle. Found in review round 3: a kid who pressed SPACE as the SKIP landed and held on through
// GET READY got `HOLD [SPACE] NOW`, then `MISSED ▼ — hold [SPACE] NOW`, over a held SPACE that burned nothing, and the
// ship flew away with 73% FUEL. After the tick (registerFlightKeys), as a keydown between ticks would be.
function burnSkipStopHoldsWhenAsked(store: Store<GameState>): void {
  if (skipStopHolds.size === 0) return;
  const state = store.getState();
  if (playerRefusal(state) !== null || !lineAsks(state)) return;
  for (const hold of [...skipStopHolds]) {
    skipStopHolds.delete(hold);
    holdThrottle(store, hold, true);
  }
}

// Back on the ship with SPACE still held (pressed in blue and refused, or held through a TAB
// mid-burn): the kid is doing what the strip says ("hold [SPACE]"), so the burn resumes without
// a fresh press. Called by the mode switch. Paused or over: nothing, and no buzz for a TAB.
export function resumeHeldThrottle(store: Store<GameState>): void {
  if (flightRefusal(store.getState()) !== null) return;
  holdThrottle(store, 'key', true);
}

// Presets are select-only: pressing the active one (even mid-turn) does nothing, and the
// only way back to free rotation is MANUAL. Changing preset mid-burn is allowed; the engine
// simply gives no thrust until the new direction is reached (presetAligning).
export function selectPreset(store: Store<GameState>, mode: PresetMode): Refusal | null {
  const state = store.getState();
  const refusal = playerRefusal(state);
  if (refusal) return refuse(refusal);
  if (!presetsAvailable(capabilitiesNow(state))) return refuse(AUTOPILOT_REFUSAL);
  if (state.burn.sasMode === mode) return null;
  const aligning = isPresetAligning(mode, state.burn.heading, state.orbit);
  store.update((draft) => {
    draft.burn.sasMode = mode;
    draft.burn.rotInput = 0;
    draft.burn.presetAligning = aligning;
  });
  return null;
}

// MANUAL: drop the preset, stop the spin. Q/E then rotate by hand.
export function selectManual(store: Store<GameState>): Refusal | null {
  const refusal = playerRefusal(store.getState());
  if (refusal) return refuse(refusal);
  store.update((draft) => {
    draft.burn.sasMode = 'off';
    draft.burn.omega = 0;
    draft.burn.rotInput = 0;
    draft.burn.presetAligning = false;
  });
  return null;
}

// Manual rotation thrusters, only in MANUAL (a preset owns the heading otherwise).
export function setRotInput(store: Store<GameState>, input: -1 | 0 | 1): Refusal | null {
  const state = store.getState();
  if (input !== 0) {
    const refusal = playerRefusal(state);
    if (refusal) return refuse(refusal);
    if (state.burn.sasMode !== 'off') return refuse('PRESET ACTIVE');
  }
  if (state.burn.rotInput !== input) store.update((draft) => { draft.burn.rotInput = input; });
  return null;
}

// Q, E and the on-screen ↺/↻ buttons each hold a direction. The most recent hold still down
// wins, so letting go of E while Q is held turns left again, and a click anywhere else never
// stops a keyboard turn.
export type RotationHold = 'key-ccw' | 'key-cw' | 'pointer';
const rotationHolds = new Map<RotationHold, -1 | 1>(); // insertion order = press order

export function holdRotation(store: Store<GameState>, hold: RotationHold, direction: -1 | 0 | 1): Refusal | null {
  // Something else stopped the thrusters (pause, a preset, the end of the flight): any holds
  // left from before are stale and need a fresh press.
  if (store.getState().burn.rotInput === 0) rotationHolds.clear();
  if (direction !== 0) {
    const refusal = setRotInput(store, direction);
    if (refusal === null) {
      rotationHolds.delete(hold);
      rotationHolds.set(hold, direction);
    }
    return refusal;
  }
  if (!rotationHolds.delete(hold)) return null;
  const latest = [...rotationHolds.values()].pop() ?? 0;
  return setRotInput(store, latest);
}

// POWER (MANUAL fold), POWER_MIN_PCT..100.
export function setPower(store: Store<GameState>, pct: number): void {
  const clamped = Math.max(POWER_MIN_PCT, Math.min(100, Math.round(pct)));
  if (store.getState().burn.thrustPct !== clamped) store.update((draft) => { draft.burn.thrustPct = clamped; });
}

// ACCEPT ORBIT: settle for the loop as it is. Below the strand floor the printers can't
// reach the ship at all.
export function acceptOrbit(store: Store<GameState>): Refusal | null {
  const state = store.getState();
  const refusal = playerRefusal(state);
  if (refusal) return refuse(refusal);
  const pred = getPrediction();
  if (!canAccept(state, pred)) return refuse('NOT OFFERED');
  endFlight(store, pred.greenFraction < STRANDED_RANGE_FRAC ? 'stranded' : 'accepted');
  return null;
}

// KeyW → prograde, …: built from PRESET_KEY, the table every hint and key cap shows.
const PRESET_BY_CODE: ReadonlyMap<string, PresetMode> = new Map(
  (Object.entries(PRESET_KEY) as [PresetMode, string][]).map(([mode, letter]) => [`Key${letter}`, mode]),
);

// The ship's keys: SPACE holds the burn, W/S/A/D pick presets, Q/E rotate in MANUAL.
// Registered by the Engine window (and directly by headless harnesses).
export function registerFlightKeys(store: Store<GameState>): () => void {
  const offSpace = registerKeys({
    layer: 'game',
    codes: ['Space'],
    onDown: () => { holdThrottle(store, 'key', true); },
    onUp: () => { holdThrottle(store, 'key', false); },
  });
  const offPresets = registerKeys({
    layer: 'game',
    codes: [...PRESET_BY_CODE.keys()],
    onDown: (code) => {
      const mode = PRESET_BY_CODE.get(code);
      if (mode) selectPreset(store, mode);
    },
  });
  const rotationOf = (code: string): RotationHold => (code === 'KeyQ' ? 'key-ccw' : 'key-cw');
  const offRotate = registerKeys({
    layer: 'game',
    codes: ['KeyQ', 'KeyE'],
    onDown: (code) => { holdRotation(store, rotationOf(code), code === 'KeyQ' ? 1 : -1); },
    onUp: (code) => { holdRotation(store, rotationOf(code), 0); },
  });
  const offReset = onWorldReset('flight-control-holds', () => {
    throttleHolds.clear();
    skipStopHolds.clear();
    rotationHolds.clear();
  }, () => ({ throttle: throttleHolds.size, skipStop: skipStopHolds.size, rotation: rotationHolds.size }));
  const offTick = onPostTick(() => burnSkipStopHoldsWhenAsked(store));
  // A pause drops the dropped holds too (WP10, the lead's ruling on a LEAD-2 round-3 leftover): a live hold needs a fresh
  // press after a pause (clock.ts setPaused lets go of the throttle), so a hold that only stopped a SKIP does as well, or
  // a SPACE kept down through the pause would start burning the moment the line asked after it. A plain module Set, so
  // clearing it inside the store's fan-out changes no state.
  const offPause = store.subscribe((s) => s.clock.paused, (paused) => { if (paused) skipStopHolds.clear(); });
  return () => { offSpace(); offPresets(); offRotate(); offReset(); offTick(); offPause(); };
}
