import type { Store } from '@state/store';
import type { GameState, RunPhase } from '@state/schema';
import { TICK_MS, DT_WALL_MAX, GLIDE_SECONDS_PER_DECADE, GLIDE_TAU_SECONDS, SKIP_RAMP_SEC, SKIP_EASE_OUT_SEC } from '@data/tuning';

// The heartbeat, DOM-free. advance(store, dtWall) is the whole tick; mountClock only wires it
// to a 50 ms interval and to tab visibility, and headless harnesses call advance directly.
//
// Two clocks (§3.4): the WORLD (orbit, fuel, hazards) runs on game time = wall × speed and is
// fanned out by onGameTick; the MIND (lock hold, ops, story timers) runs on AI time = wall
// seconds while unpaused, fanned out by onAiTick. Warp never makes a mind timer faster.

type PreTickListener = (dtWall: number) => void;
type GameTickListener = (dtWorld: number, dtWall: number) => void;
type AiTickListener = (dtAi: number) => void;
type PostTickListener = (dtWall: number, dtAi: number) => void;

const preTickListeners = new Set<PreTickListener>();
const gameTickListeners = new Set<GameTickListener>();
const aiTickListeners = new Set<AiTickListener>();
const postTickListeners = new Set<PostTickListener>();

// Runs first in every tick, before the "halted" early-out, so pace can always lift a stop.
// Pace is the only intended user.
export function onPreTick(listener: PreTickListener): () => void {
  preTickListeners.add(listener);
  return () => { preTickListeners.delete(listener); };
}

// World logic. Fires only while the world moves (speed > 0) in an active phase.
export function onGameTick(listener: GameTickListener): () => void {
  gameTickListeners.add(listener);
  return () => { gameTickListeners.delete(listener); };
}

// Mind logic. Fires with wall seconds while unpaused in an active phase.
export function onAiTick(listener: AiTickListener): () => void {
  aiTickListeners.add(listener);
  return () => { aiTickListeners.delete(listener); };
}

// Runs last in every tick, in EVERY phase and while paused: dtAi is the AI time that passed this
// tick (0 when the mind was frozen). For what must keep reacting when the world is stopped: the
// boot sequence, flight-event detection and the director (PAUSED, the end of the flight).
export function onPostTick(listener: PostTickListener): () => void {
  postTickListeners.add(listener);
  return () => { postTickListeners.delete(listener); };
}

// Phases in which time passes: the flight, and the landing (the world coasts, the pods fall on AI time). The title,
// the boot and the LANDING REPORT stop both clocks.
const ACTIVE_PHASES: ReadonlySet<RunPhase> = new Set<RunPhase>(['flight', 'landing']);

export function isActivePhase(phase: RunPhase): boolean {
  return ACTIVE_PHASES.has(phase);
}

// The fastest a running SKIP may go in a tick of `dtWall` with its end point ahead (LEAD-2 review round 1): a glide
// back down through the decades the ramp climbed, over the last SKIP_EASE_OUT_SEC, keyed to the game seconds left so
// it lands on the end point. At one warp to the end, Kepler's fast fall back to ▼ came in one or two frames (502,000 →
// 6,097 km, and the plot's zoom 45× in one 40 ms frame); now the fall takes most of that second. Exact for the tick:
// on a speed schedule C·e^(L·τ/T) (τ the wall seconds left, L the e-folds from CRUISE C to the SKIP's warp, T the
// ease), the game seconds left plus C·T/L shrink by e^(−L·dt/T) a tick. Infinity: nothing to ease (no end point yet,
// or a SKIP at CRUISE's own warp).
function skipEaseCap(state: Readonly<GameState>, dtWall: number): number {
  const { skipWarp, skipEndTSec, tSec } = state.clock;
  const cruise = state.level.cruiseWarp;
  if (skipWarp === null || skipEndTSec === null || !(skipWarp > cruise) || !(dtWall > 0)) return Infinity;
  const efolds = Math.log(skipWarp / cruise);
  const scheduled = skipEndTSec - tSec + (cruise * SKIP_EASE_OUT_SEC) / efolds;
  return Math.max(cruise, (scheduled * -Math.expm1((-efolds * dtWall) / SKIP_EASE_OUT_SEC)) / dtWall);
}

// Moves clock.speed toward clock.speedTarget.
// • Drops SNAP: slowing down must be immediate (Fran), e.g. SKIP ending or a burn starting.
// • Resuming from a halt snaps to min(target, tactical warp), so a resume never lands the
//   player in a fast-forward they did not see coming; anything faster glides up from there.
// • Rises use a floored proportional log glide: big jumps accelerate, the final decade
//   arrives at a steady readable pace, and the glide ends in finite time. A rise to a SKIP's
//   warp is also at least as fast as climbing from CRUISE to it in SKIP_RAMP_SEC (LEAD-2).
// • A running SKIP eases back down onto its end point (skipEaseCap): the target is capped.
function advanceSpeedGlide(store: Store<GameState>, dtWall: number): void {
  const state = store.getState();
  const { speed, skipWarp } = state.clock;
  const skipping = skipWarp !== null && state.clock.speedTarget === skipWarp;
  const speedTarget = skipping ? Math.min(skipWarp, skipEaseCap(state, dtWall)) : state.clock.speedTarget;
  if (speed === speedTarget) return;
  if (speedTarget <= 0 || speedTarget < speed) {
    store.mutate((draft) => { draft.clock.speed = Math.max(0, speedTarget); });
    return;
  }
  if (speed <= 0) {
    const resume = Math.min(speedTarget, state.level.tacticalWarp);
    store.mutate((draft) => { draft.clock.speed = resume; });
    return;
  }
  const logFrom = Math.log10(speed);
  const distance = Math.log10(speedTarget) - logFrom;
  const skipRamp = skipping ? Math.log10(skipWarp / state.level.cruiseWarp) / SKIP_RAMP_SEC : 0;
  const rate = Math.max(1 / GLIDE_SECONDS_PER_DECADE, distance / GLIDE_TAU_SECONDS, skipRamp);
  const step = rate * dtWall;
  const next = step >= distance ? speedTarget : Math.pow(10, logFrom + step);
  store.mutate((draft) => { draft.clock.speed = next; });
}

export function advance(store: Store<GameState>, dtWallRaw: number): void {
  // A throttled tab or a sleep can hand us seconds at once; never let one tick lump them.
  const dtWall = Math.min(Math.max(0, dtWallRaw), DT_WALL_MAX);

  preTickListeners.forEach((listener) => listener(dtWall));
  advanceSpeedGlide(store, dtWall);

  const state = store.getState();
  if (!isActivePhase(state.run.phase)) {
    postTickListeners.forEach((listener) => listener(dtWall, 0));
    return;
  }

  const speed = state.clock.speed;
  if (speed > 0) {
    // A SKIP (pace.ts) lands exactly on its end point: its last tick is cut short there, and the clock is
    // set to it rather than summed to it, so no rounding leaves a sliver for one more tick (LEAD-2). Pace ends
    // a SKIP that has reached its end point, so one behind the clock is a broken invariant, not a 0 s tick.
    // WP10: a tick that reaches a later ghost burst's start (skipWaypoint) lands on that burst's end instead, so the
    // burst is flown whole inside it, without ending the SKIP.
    const skipping = state.clock.skipWarp !== null;
    const skipEnd = skipping ? state.clock.skipEndTSec : null;
    if (skipEnd !== null && skipEnd < state.clock.tSec) {
      throw new Error(`clock: the SKIP's end point ${skipEnd} is behind the clock ${state.clock.tSec}`);
    }
    const reach = state.clock.tSec + dtWall * speed;
    const waypoint = skipping ? state.clock.skipWaypoint : null;
    let landAt: number | null = null;
    if (skipEnd !== null && reach >= skipEnd) landAt = skipEnd;
    if (waypoint !== null && reach >= waypoint.startTSec && (landAt === null || waypoint.endTSec < landAt)) landAt = waypoint.endTSec;
    if (landAt !== null && landAt < state.clock.tSec) {
      throw new Error(`clock: the SKIP's waypoint ${landAt} is behind the clock ${state.clock.tSec}`);
    }
    const dtWorld = landAt !== null ? landAt - state.clock.tSec : dtWall * speed;
    // mutate, not update: tSec has no subscribers; a 20 Hz update would fan out to every
    // always-false subscriber and replace DOM between mousedown and mouseup.
    store.mutate((draft) => { draft.clock.tSec = landAt ?? draft.clock.tSec + dtWorld; });
    gameTickListeners.forEach((listener) => listener(dtWorld, dtWall));
  }

  // Re-read: a game tick may have ended the flight (which pauses the clock).
  const after = store.getState();
  let dtAi = 0;
  if (!after.clock.paused && isActivePhase(after.run.phase)) {
    dtAi = dtWall;
    store.mutate((draft) => { draft.clock.aiSec += dtAi; });
    aiTickListeners.forEach((listener) => listener(dtAi));
  }
  postTickListeners.forEach((listener) => listener(dtWall, dtAi));
}

// The ship is still being played: a live flight, or the landing after a lock. A lost ship (crashed, escaped, stranded,
// or its Core eaten) stays paused under its LOST card, and the LANDING REPORT owns the screen once the landing is done.
export function isLivePhase(state: Readonly<GameState>): boolean {
  // A ship whose Core was eaten (WP6) is over too, whatever its phase: its CORE LOST card owns it.
  if (state.run.coreLost) return false;
  return state.run.phase === 'landing' || (state.run.phase === 'flight' && state.burn.status === 'approaching');
}

// Look-only pause. Pausing also lets go of the throttle: a burn must never continue, or
// resume, without a fresh press after the world was frozen. Resuming is refused once the ship
// is no longer live (isLivePhase): its card owns the screen.
export function setPaused(store: Store<GameState>, paused: boolean): boolean {
  const state = store.getState();
  if (state.clock.paused === paused) return true;
  if (!paused && !isLivePhase(state)) return false;
  store.update((draft) => {
    draft.clock.paused = paused;
    if (paused) {
      draft.burn.firing = false;
      draft.burn.firingSource = null;
      draft.burn.firingFor = null;
      draft.burn.rotInput = 0;
    }
  });
  return true;
}

let mounted = false;

export function mountClock(store: Store<GameState>): () => void {
  // A second interval would advance the world twice per 50 ms.
  if (mounted) throw new Error('mountClock: already mounted');
  mounted = true;
  let lastWall = performance.now();
  const handle = setInterval(() => {
    const now = performance.now();
    const dtWall = (now - lastWall) / 1000;
    lastWall = now;
    advance(store, dtWall);
  }, TICK_MS);

  // A hidden tab pauses the game (and the player resumes it with P), so nothing happens
  // while nobody is looking.
  const onVisibility = (): void => { if (document.hidden) setPaused(store, true); };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    clearInterval(handle);
    document.removeEventListener('visibilitychange', onVisibility);
    mounted = false;
  };
}
