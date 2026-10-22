import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { Ring } from '@/types/orbit';
import { onPostTick, isLivePhase } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on } from '@systems/events';
import { raiseAlert, clearAlert, GHOST_ALARM_ID, GHOST_WARN_ID } from '@systems/alerts';
import { capabilitiesNow } from '@systems/capabilities';
import { getPrediction, currentPrediction, sensePrediction, type Prediction, type PredictOutcome } from '@systems/predict';
import { buildFlightContext, flightObjective } from '@systems/guidance';
import { skipTarget, stopSkip, replanSkip, type SkipTarget } from '@systems/pace';
import { GHOST_TEXT } from '@data/ghost-text';
import { GHOST_ALARM_MIN_SEC, SKIP_REPLAN_TICKS, TICK_MS, GHOST_DRIFT_SHOW_SEC, GHOST_DRIFT_MIN_KM } from '@data/tuning';

// The engine firing by itself (C2, §9 WP10 item 2), as the ship tells the kid, DOM-free. The bursts themselves are
// orbit-sim's (the seeded scheduler); this is what they mean on screen and to a SKIP:
// • The ship's FIRST burst is the alarm moment: an alarm alert (the klaxon, the red vignette, the strip's alarm line
//   `UNCOMMANDED THRUST — …`), which holds the world at TACTICAL through the burst and for GHOST_ALARM_MIN_SEC, long
//   enough to read the line. It is also the only burst that stops a SKIP (pace lands on its start), and SWAP is licensed
//   with it (licences.ts).
// • Every LATER burst is counted (`UNCOMMANDED THRUST ×3`: a warning, no klaxon, no pace change), as long as the
//   controller keeps firing. The tutorial after the second event is data/script.ts's (click the THRUST CTRL pip, then
//   SWAP it to Thrust.alt).
// • A SKIP flies through a later burst (the lead's ruling for WP10): pace lands the SKIP's tick on the burst's end and
//   orbit-sim flies the burst whole in it; right after it the plan is judged again here, against the plan just before
//   that burst. The SKIP flies on to its target (re-timed from the fresh prediction) unless the burst changed the plan
//   (planChange, the lead's strict reading of 2026-10-20 09:05): then the SKIP stops, and the kid reads the new line at
//   CRUISE. The verdict reads game state only (the ship right after the burst against the ship right before it), never
//   how the wall clock happened to cut the SKIP into ticks, so a pause or a slow frame moves no stop.
// Events only mark what happened; the post-tick acts on them (never inside an emit, §9).

// What a SKIP is doing, as a later burst may change it: the line the strip shows, where the path goes, what it flies
// to and the burn waiting there, whether ▼ and ▲ sit in the ring, whether the tank pays for the fix, and Rule 4's
// verdict. Read from the true path (the instruments' copy of it for the line), so it is the ship's state, not a
// snapshot a stale sensor happened to keep.
export interface SkipPlan {
  lineId: string | null;
  outcome: PredictOutcome;
  target: SkipTarget | null;
  burnKind: string | null;
  lowestInRing: boolean;
  highestInRing: boolean;
  fuelShort: boolean;
  acceptOnly: boolean;
  strandedAnyway: boolean;
}

function inRing(radius: number, ring: Ring): boolean {
  return radius >= ring.min && radius <= ring.max;
}

export function skipPlanOf(state: Readonly<GameState>, pred: Prediction): SkipPlan {
  const sensed = sensePrediction(pred, capabilitiesNow(state).plot, state.level.planet.R);
  const burnPoint = pred.burnPoint;
  return {
    lineId: flightObjective(buildFlightContext(state, sensed))?.id ?? null,
    outcome: pred.outcome,
    target: skipTarget(state, pred),
    burnKind: burnPoint === null ? null : `${burnPoint.reason}|${burnPoint.preset}|${burnPoint.event}|${burnPoint.firstOfTwo}`,
    lowestInRing: pred.outcome !== 'impact' && inRing(pred.rp, state.level.ring),
    highestInRing: pred.fit.closed && inRing(pred.ra, state.level.ring),
    fuelShort: pred.fuelShort,
    acceptOnly: pred.acceptOnly,
    strandedAnyway: pred.strandedAnyway,
  };
}

// Why a later burst changed a SKIP's plan (the SKIP then stops), or null when it flies on. `tickSec`: the game seconds
// one tick of the SKIP covers at its warp, the resolution it lands with. The lead's list (2026-10-20 09:05): the path now
// hits the planet or opens; ▼ or ▲ left the ring (or came into it: the fix the strip asks for is another one); Rule 4's
// verdict flipped (ACCEPT ORBIT only, STRANDED); the tank no longer pays for the planned fix; the strip's line or the
// burn it plans changed; or the target event moved by more than SKIP_REPLAN_TICKS ticks (a WP10 deviation: the ruling
// says one tick, see tuning.ts).
export type PlanChange = 'impact' | 'opened' | 'ring' | 'verdict' | 'fuel' | 'line' | 'burn' | 'target';

export function planChange(before: SkipPlan, after: SkipPlan, tickSec: number): PlanChange | null {
  if (after.outcome === 'impact' && before.outcome !== 'impact') return 'impact';
  if (after.outcome === 'open' && before.outcome === 'closed') return 'opened';
  if (after.lowestInRing !== before.lowestInRing || after.highestInRing !== before.highestInRing) return 'ring';
  if (after.acceptOnly !== before.acceptOnly || after.strandedAnyway !== before.strandedAnyway) return 'verdict';
  if (after.fuelShort && !before.fuelShort) return 'fuel';
  if (after.lineId !== before.lineId) return 'line';
  if (after.burnKind !== before.burnKind) return 'burn';
  if ((before.target === null) !== (after.target === null)) return 'target';
  if (before.target !== null && after.target !== null) {
    if (before.target.kind !== after.target.kind) return 'target';
    if (Math.abs(after.target.atTSec - before.target.atTSec) > SKIP_REPLAN_TICKS * tickSec) return 'target';
  }
  return null;
}

// The game seconds one nominal tick covers at a SKIP's warp.
export function skipTickSec(skipWarp: number): number {
  return skipWarp * (TICK_MS / 1000);
}

// --- The live module ---------------------------------------------------------------------------------------------

let firstStartedAtAi: number | null = null;  // the ship's first burst began (its alarm stands from then)
let alarmUp = false;
let burstEndedInSkip = false;               // a later burst a SKIP flew through ended in this tick
let burstThisTick = false;
// The plan a later burst is judged against: as of the tick just before it. Kept on every quiet tick, and after every
// burst a SKIP flew on through (so each burst is judged against the one before it, however many bursts the wall clock
// happened to put into consecutive ticks).
let lastPlan: SkipPlan | null = null;
// The SKIP re-plans after each later burst it flies through: why the last one stopped, for tests and ?debug.
let lastChange: PlanChange | null = null;
// ▼'s drift (ghostDriftKm): its true radius before the burst (before the first of a run of bursts each within
// GHOST_DRIFT_SHOW_SEC of the last), and the AI second the last one ended (null while one runs).
let driftFromRp: number | null = null;
let driftEndedAtAi: number | null = null;

function resetGhostThrust(): void {
  firstStartedAtAi = null;
  alarmUp = false;
  burstEndedInSkip = false;
  burstThisTick = false;
  lastPlan = null;
  lastChange = null;
  driftFromRp = null;
  driftEndedAtAi = null;
}

function driftShown(aiNow: number): boolean {
  return driftFromRp !== null && (driftEndedAtAi === null || aiNow - driftEndedAtAi <= GHOST_DRIFT_SHOW_SEC);
}

// How far the engine firing by itself has moved ▼ (km, true; negative: down), while a burst runs and for
// GHOST_DRIFT_SHOW_SEC after it (WP10 review: the kid must see ▼ drift, and one burst moves it under a pixel). null when
// there is nothing to show: no burst lately, a drift under GHOST_DRIFT_MIN_KM, or a path into the planet (▼ is
// UNDERGROUND, and DON'T HIT THE PLANET says the rest).
export function ghostDriftKm(state: Readonly<GameState>): number | null {
  if (!driftShown(state.clock.aiSec) || driftFromRp === null) return null;
  const pred = getPrediction();
  if (pred.outcome === 'impact') return null;
  const drift = pred.rp - driftFromRp;
  return Math.abs(drift) < GHOST_DRIFT_MIN_KM ? null : drift;
}

export function lastSkipPlanChange(): PlanChange | null {
  return lastChange;
}

function flying(state: Readonly<GameState>): boolean {
  return state.run.phase === 'flight' && isLivePhase(state);
}

// The first burst's alarm: up from its start until the burst is over and the line has stood GHOST_ALARM_MIN_SEC.
function syncAlarm(store: Store<GameState>): void {
  const state = store.getState();
  if (firstStartedAtAi === null) return;
  if (!alarmUp) {
    raiseAlert(store, { id: GHOST_ALARM_ID, layer: 'ship', severity: 'alarm', text: GHOST_TEXT.alarm, inhibitsSkip: true });
    alarmUp = true;
    return;
  }
  const over = state.burn.ghost === null || state.burn.ghostBursts > 1;
  if (over && state.clock.aiSec - firstStartedAtAi >= GHOST_ALARM_MIN_SEC) {
    clearAlert(store, GHOST_ALARM_ID);
    firstStartedAtAi = null;
  }
}

// The bursts the kid is shown as still happening: while the controller still fires (a ghost spec), from the first one.
// The warn counter and the THRUST CTRL pip's `FIRED ×n` both read it, so they never disagree.
export function ghostCountShown(state: Readonly<GameState>): number {
  if (state.burn.ghostBursts === 0) return 0;
  return capabilitiesNow(state).thrustCtrl.ghost === null ? 0 : state.burn.ghostBursts;
}

// The counter: the bursts shown, once the first one's alarm is down.
function syncCounter(store: Store<GameState>): void {
  const state = store.getState();
  const count = ghostCountShown(state);
  if (count === 0 || firstStartedAtAi !== null) {
    clearAlert(store, GHOST_WARN_ID);
    return;
  }
  raiseAlert(store, { id: GHOST_WARN_ID, layer: 'ship', severity: 'warn', text: GHOST_TEXT.counter(count), inhibitsSkip: false });
}

// Right after a later burst a SKIP flew through: fly on (re-timed), or stop on the new line. The burst is over (it ended
// in this tick), so the prediction of this very moment is the plan at rest (predict.ts judges Rule 4 only then).
function replanAfterBurst(store: Store<GameState>): void {
  const state = store.getState();
  const skipWarp = state.clock.skipWarp;
  if (skipWarp === null) return;
  const pred = currentPrediction();
  const after = skipPlanOf(state, pred);
  const change = lastPlan === null ? null : planChange(lastPlan, after, skipTickSec(skipWarp));
  lastChange = change;
  if (change !== null) {
    stopSkip(store);
    return;
  }
  replanSkip(store, pred);
  lastPlan = after;
}

let mounted = false;

// Mount after the flight events and before the director (its alarm line reads the alerts raised here), and after the
// predictor (the re-plan reads this tick's path).
export function mountGhostThrust(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountGhostThrust: already mounted');
  mounted = true;
  const offStart = on('ghost-start', ({ first }) => {
    burstThisTick = true;
    const aiNow = store.getState().clock.aiSec;
    if (first) firstStartedAtAi = aiNow;
    // The burst's thrust of this tick is in, but the cached prediction is still the one from before it: ▼ as it was.
    if (!driftShown(aiNow)) driftFromRp = getPrediction().rp;
    driftEndedAtAi = null;
  });
  const offStop = on('ghost-stop', () => {
    burstThisTick = true;
    driftEndedAtAi = store.getState().clock.aiSec;
    if (store.getState().clock.pace === 'skip') burstEndedInSkip = true;
  });
  const offTick = onPostTick(() => {
    const state = store.getState();
    if (!flying(state)) {
      clearAlert(store, GHOST_ALARM_ID);
      clearAlert(store, GHOST_WARN_ID);
      firstStartedAtAi = null;
      alarmUp = false;
      burstEndedInSkip = false;
      burstThisTick = false;
      lastPlan = null;
      driftFromRp = null;
      driftEndedAtAi = null;
      return;
    }
    if (state.clock.paused) return;
    // A held burn (the kid's or AUTOBURN's) moves ▼ too: a drift measured across it would blame the ghost for it.
    if (state.burn.firing) {
      driftFromRp = null;
      driftEndedAtAi = null;
    }
    if (burstEndedInSkip) replanAfterBurst(store);
    burstEndedInSkip = false;
    syncAlarm(store);
    syncCounter(store);
    // The plan a later burst is judged against, on a tick the engine was quiet (a burst flown through has just set it).
    // Only worth the work on a ship whose controller fires (a SKIP elsewhere has no burst to fly through). The 10 Hz
    // prediction is enough here: nothing fires between two refreshes of one coast, so the plan is the same from either.
    const quiet = !burstThisTick && store.getState().burn.ghost === null;
    if (quiet && capabilitiesNow(store.getState()).thrustCtrl.ghost !== null) {
      lastPlan = skipPlanOf(store.getState(), getPrediction());
    }
    burstThisTick = false;
  });
  const offReset = onWorldReset('ghost-thrust', resetGhostThrust, () => ({
    firstStartedAtAi, alarmUp, burstEndedInSkip, burstThisTick, plan: lastPlan !== null, lastChange, driftFromRp, driftEndedAtAi,
  }));
  return () => {
    offStart();
    offStop();
    offTick();
    offReset();
    resetGhostThrust();
    mounted = false;
  };
}
