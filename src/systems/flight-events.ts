import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { getPrediction, getSensedPrediction, secUntil, type BurnPoint, type Prediction } from '@systems/predict';
import { landingBurnOffer } from '@systems/landing-orbit';
import { engineOpen } from '@state/selectors';
import { isThrustOn } from '@systems/orbit-sim';
import { emit, NO_PAYLOAD, type ZoneForecast } from '@systems/events';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { capabilitiesNow, type PlotMode } from '@systems/capabilities';
import { zoneVerdict, debrisRack } from '@/types/zone';
import {
  TACTICAL_LEAD_BURN_TAC, BEEP_BURN_TAC, BEEP_IMPACT_TAC, IMPACT_ALARM_TAC, BEEP_REARM_TAC, BEEP_JUMP_TAC,
  LOCK_HOLD_AI_SEC,
} from '@data/tuning';

// The flight's moments, detected from the prediction and the burn state once per tick and
// announced on the event bus (§9 WP2 item 1):
// • the line's state changing (red → flyby → captured → green), with the named moments
//   CLEAR OF THE PLANET, CAPTURED (loop-closed), IN RING and ▼ entering the ring;
// • thrust starting and stopping (delivered thrust, not the throttle: an aligning preset is
//   silent);
// • the START BURN countdown reaching GET READY, 5…1 and NOW, and the impact countdown's
//   last 10 seconds;
// • the impact alarm alert while the crash is under IMPACT_ALARM_TAC away;
// • HOLD STEADY counting 3, 2, 1 toward ORBIT LOCKED;
// • what the instruments can show changing (Sensor Interp, Nav Plotter: exact / ≈ / PATH
//   UNCERTAIN / NO SIGNAL), so a repaired sensor clears with a whoomp (WP4);
// • what the instruments say a debris cloud will do changing (WP9: HIT, CLEAR, or unknown under PATH
//   UNCERTAIN), so the moment a correction clears the cloud can be seen and heard (CLEAR OF THE DEBRIS), and the
//   moment the dodge runs out (the strip's countdown reaching too late), so that is heard too.
// DOM-free, so the harness hears exactly the events the page does.

export type LineState = 'impact' | 'open' | 'closed' | 'in-ring';

export function lineStateOf(pred: Prediction): LineState {
  if (pred.outcome === 'impact') return 'impact';
  if (pred.outcome === 'open') return 'open';
  return pred.fit.inRing ? 'in-ring' : 'closed';
}

// ▼ sits inside the ring on a path that is not falling into the planet.
function lowestInRing(state: Readonly<GameState>, pred: Prediction): boolean {
  const ring = state.level.ring;
  return pred.outcome !== 'impact' && pred.rp >= ring.min && pred.rp <= ring.max;
}

// Watches a countdown (tactical seconds) cross a list of whole-second thresholds, highest
// first. Each threshold fires once per descent: it re-arms only when the countdown climbs back
// BEEP_REARM_TAC above it (the 10 Hz re-estimate wobbles a little), and thresholds skipped by a
// jump of more than BEEP_JUMP_TAC in one tick are passed silently.
interface CountdownWatch {
  last: number | null;
  lowestFired: number;  // the lowest threshold already fired in this descent
}

function newWatch(): CountdownWatch {
  return { last: null, lowestFired: Infinity };
}

function crossed(watch: CountdownWatch, next: number | null, thresholds: readonly number[]): number[] {
  const prev = watch.last;
  watch.last = next;
  if (next === null) { watch.lowestFired = Infinity; return []; }
  if (next > watch.lowestFired + BEEP_REARM_TAC) watch.lowestFired = Infinity;
  if (prev === null || next >= prev) return [];
  const passed = thresholds.filter((sec) => prev > sec && next <= sec && sec < watch.lowestFired);
  if (passed.length === 0) return [];
  watch.lowestFired = Math.min(...passed);
  return prev - next > BEEP_JUMP_TAC ? [] : passed;
}

// GET READY, the 5…1 beeps, then NOW (0).
const BURN_THRESHOLDS: readonly number[] = [
  TACTICAL_LEAD_BURN_TAC,
  ...Array.from({ length: BEEP_BURN_TAC + 1 }, (_unused, i) => BEEP_BURN_TAC - i),
];
const IMPACT_THRESHOLDS: readonly number[] = Array.from({ length: BEEP_IMPACT_TAC }, (_unused, i) => BEEP_IMPACT_TAC - i);

const IMPACT_ALERT_ID = 'impact';

let lastLine: LineState | null = null;
let lastLowestInRing = false;
let lastThrust = false;
let burnKey: string | null = null;
let burnWatch = newWatch();
let impactWatch = newWatch();
let lastLockCount: number | null = null;
let lastPlotMode: PlotMode | null = null;
const lastForecast = new Map<string, ZoneForecast>();
// Each debris cloud's dodge as the instruments last showed it (ZoneHit.correctionClears; null: no correction applies),
// and the clouds whose dodge has lapsed on this ship: the lapse is said once (the lead's ruling), even if a change in
// the engine's power brought a second or two of the countdown back.
const lastDodge = new Map<string, boolean | null>();
const lapsedDodges = new Set<string>();

function resetTrackers(): void {
  lastLine = null;
  lastLowestInRing = false;
  lastThrust = false;
  burnKey = null;
  burnWatch = newWatch();
  impactWatch = newWatch();
  lastLockCount = null;
  lastPlotMode = null;
  lastForecast.clear();
  lastDodge.clear();
  lapsedDodges.clear();
}

// Each live debris cloud's verdict as the kid's instruments give it: from the SENSED path, and unknown while
// the plot is blind. The first look sets the baseline.
function detectZoneForecast(state: Readonly<GameState>): void {
  const mode = capabilitiesNow(state).plot.mode;
  for (const hit of getSensedPrediction().zoneHits) {
    if (hit.kind !== 'debris') continue;
    // The verdict the plot and the MIND's rack tag show (types/zone.ts). A spent cloud has nothing left to forecast.
    const verdict = zoneVerdict(hit, mode === 'uncertain' || mode === 'no-signal');
    if (verdict === 'spent') continue;
    const from = lastForecast.get(hit.zoneId);
    if (from === verdict) continue;
    lastForecast.set(hit.zoneId, verdict);
    if (from !== undefined) emit('zone-forecast', { zoneId: hit.zoneId, from, to: verdict });
  }
}

// The dodge running out: the ▼ correction could take the sensed path off a debris cloud, and now it can't (the
// strip's countdown just reached too late: on TOO WIDE, or on NOT CLEAR YET after the kid let go in the ring). Only
// what the kid could see: a blind plot shows no dodge at all (its baseline is then unknown, and a lapse while blind
// makes no sound), and a correction that stops applying (the path cleared the cloud, or the kid chose another
// preset) is not a lapse. Once per cloud per ship: the TOO LATE TO DODGE stamp and its sound (Stamp, audio-cues).
function detectDodgeLapse(state: Readonly<GameState>): void {
  const mode = capabilitiesNow(state).plot.mode;
  const seeing = mode === 'exact' || mode === 'approx';
  for (const hit of getSensedPrediction().zoneHits) {
    if (hit.kind !== 'debris') continue;
    const now = seeing ? hit.correctionClears : null;
    const before = lastDodge.get(hit.zoneId);
    lastDodge.set(hit.zoneId, now);
    if (before === true && now === false && !lapsedDodges.has(hit.zoneId)) {
      lapsedDodges.add(hit.zoneId);
      emit('dodge-lapsed', { zoneId: hit.zoneId, rack: debrisRack(hit) });
    }
  }
}

// The first look sets the baseline (ship 1 arrives with a ≈ sensor: not a change).
function detectPlotMode(state: Readonly<GameState>): void {
  const mode = capabilitiesNow(state).plot.mode;
  if (mode === lastPlotMode) return;
  const from = lastPlotMode;
  lastPlotMode = mode;
  if (from !== null) emit('plot-mode', { from, to: mode });
}

// The number HOLD STEADY shows: 3 the moment the hold starts, 1 in its last second. A broken hold
// (thrust again, or the loop left the ring) starts over at 3.
export function lockCount(holdAiSec: number): number | null {
  return holdAiSec > 0 ? Math.max(1, Math.ceil(LOCK_HOLD_AI_SEC - holdAiSec)) : null;
}

function detectLockCount(state: Readonly<GameState>): void {
  const count = lockCount(state.burn.lockHoldAiSec);
  if (count === lastLockCount) return;
  lastLockCount = count;
  if (count !== null) emit('lock-count', { count });
}

function detectLine(state: Readonly<GameState>, pred: Prediction): void {
  const line = lineStateOf(pred);
  const lowest = lowestInRing(state, pred);
  // The first look at a flight sets the baseline: the opening red line is not a "change".
  if (lastLine === null) {
    lastLine = line;
    lastLowestInRing = lowest;
    return;
  }
  if (line !== lastLine) {
    const from = lastLine;
    lastLine = line;
    emit('line-state', { from, to: line });
    if (from === 'impact') emit('clear-of-planet', NO_PAYLOAD);
    if (from === 'open' && (line === 'closed' || line === 'in-ring')) emit('loop-closed', NO_PAYLOAD);
    if (line === 'in-ring') emit('in-ring', NO_PAYLOAD);
  }
  if (lowest && !lastLowestInRing) emit('lowest-in-ring', NO_PAYLOAD);
  lastLowestInRing = lowest;
}

function detectThrust(state: Readonly<GameState>): void {
  const thrust = isThrustOn(state) && !state.clock.paused;
  if (thrust === lastThrust) return;
  lastThrust = thrust;
  if (thrust) emit('firing-start', { source: state.burn.firingSource });
  else emit('firing-stop', NO_PAYLOAD);
}

// `burnPoint`: the burn counted down to (the plan's in flight; in LANDING the burn the landing offers, landing-orbit
// landingBurnOffer: a declined trim or GO LOWER beeps no second time).
function detectCountdowns(store: Store<GameState>, state: Readonly<GameState>, pred: Prediction, burnPoint: BurnPoint | null): void {
  const now = state.clock.tSec;
  const warp = state.level.tacticalWarp;

  // The START BURN countdown. A different burn (a trim after the capture) starts a fresh
  // count. It stays silent while the throttle is held: the kid is already burning, and the
  // re-estimated tick drifting under a running burn must not beep again.
  const key = burnPoint ? `${burnPoint.reason}|${burnPoint.event}` : null;
  if (key !== burnKey) {
    burnKey = key;
    burnWatch = newWatch();
  }
  const burnTac = burnPoint && !state.burn.firing ? secUntil(pred, burnPoint.inSec, now) / warp : null;
  for (const sec of crossed(burnWatch, burnTac, BURN_THRESHOLDS)) {
    if (sec === TACTICAL_LEAD_BURN_TAC) emit('burn-point', { stage: 'ready' });
    else if (sec === 0) {
      emit('countdown-beep', { kind: 'burn', secLeft: 0, final: true });
      emit('burn-point', { stage: 'now' });
    } else emit('countdown-beep', { kind: 'burn', secLeft: sec, final: false });
  }

  const impactTac = pred.impactInSec === null ? null : Math.max(0, secUntil(pred, pred.impactInSec, now)) / warp;
  for (const sec of crossed(impactWatch, impactTac, IMPACT_THRESHOLDS)) {
    emit('countdown-beep', { kind: 'impact', secLeft: sec, final: false });
  }

  if (impactTac !== null && impactTac < IMPACT_ALARM_TAC) {
    raiseAlert(store, { id: IMPACT_ALERT_ID, layer: 'ship', severity: 'alarm', text: 'IMPACT', inhibitsSkip: true });
  } else {
    clearAlert(store, IMPACT_ALERT_ID);
  }
}

let mounted = false;

// Mount after the predictor and before the director: the director acts on the events of the
// same tick.
export function mountFlightEvents(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountFlightEvents: already mounted');
  mounted = true;
  const offTick = onPostTick(() => {
    const state = store.getState();
    // LANDING (slice 1b): the engine is open there, so thrust starting and stopping, the offered burn's beeps and the
    // impact countdown (a wild burn) are heard as in flight. The line's moments, HOLD STEADY and the instruments' are
    // the flight's only.
    if (state.run.phase === 'landing') {
      if (!engineOpen(state)) {
        clearAlert(store, IMPACT_ALERT_ID);
        if (lastThrust) { lastThrust = false; emit('firing-stop', NO_PAYLOAD); }
        return;
      }
      const pred = getPrediction();
      detectThrust(state);
      detectCountdowns(store, state, pred, landingBurnOffer(state, pred));
      return;
    }
    if (state.run.phase !== 'flight') return;
    if (state.burn.status !== 'approaching') {
      clearAlert(store, IMPACT_ALERT_ID);
      if (lastThrust) { lastThrust = false; emit('firing-stop', NO_PAYLOAD); }
      lastLockCount = null;
      return;
    }
    const pred = getPrediction();
    detectThrust(state);
    detectLine(state, pred);
    detectCountdowns(store, state, pred, pred.burnPoint);
    detectLockCount(state);
    detectPlotMode(state);
    detectZoneForecast(state);
    detectDodgeLapse(state);
  });
  const offReset = onWorldReset('flight-events', resetTrackers, () => ({
    lastLine, lastLowestInRing, lastThrust, burnKey, burnWatch, impactWatch, lastLockCount, lastPlotMode, forecasts: lastForecast.size,
    dodges: lastDodge.size, lapsedDodges: lapsedDodges.size,
  }));
  return () => { offTick(); offReset(); mounted = false; };
}
