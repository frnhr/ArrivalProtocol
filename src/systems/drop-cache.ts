import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { DropSolution } from '@/types/landing';
import { onGameTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { capabilitiesNow } from '@systems/capabilities';
import { computeDropSolution, dotTrack, type DotTrack } from '@systems/landing-solve';
import { dropFactors, nextToLaunch } from '@systems/landing-rules';
import { elementsFromState } from '@/types/orbit';
import { PREDICT_HZ, POD_AIM_RP_FRAC } from '@data/tuning';

// The live drop solution (01-landing §3.3, §3.14): the dot, the pod's arc and every LZ's window for the ship as it is,
// during LANDING only. Refreshed at PREDICT_HZ like predict.ts, and the expensive part (the dot's track over one orbit)
// is solved once per orbit: keyed on the world, landing.orbitEpoch (bumped by every discrete orbit change: 1b's drag
// kicks, later burns) and the elements rounded to 1 km and 1e-5 in e, because sub-stepping at CRUISE drifts them a hair
// every tick and a track per tick would cost a solve per frame (risk 19).
//
// Imports only landing-solve, landing-rules, capabilities, clock and reset (and data), so hollow.ts and pace.ts can read
// it without closing the import cycle tests/unit/wp12/fix1/entries.test.ts guards. Mount it after mountPredictor.
// Its readers: landing.ts (the window state, the launch), guidance's countdowns and landing-hud. Everything else reads
// state.landing.window, never the cache.

let storeRef: Store<GameState> | null = null;
let cached: DropSolution | null = null;
let cachedRev: number | null = null;
let cachedEpoch: number | null = null;
let sinceRefreshWall = 0;
let track: DotTrack | null = null;
let trackKey: string | null = null;

// Rounding of the track's key (risk 19): about 1 km in ▼ and 1e-5 in e. Finer than any window edge a kid can see move.
// Where ▼ lies (the argument of periapsis, review N4) is keyed as the eccentricity vector scaled by ▼, in km (e·rp·cos ω,
// e·rp·sin ω): the same 1 km, and steady on a near-circular orbit, where ω alone is noise.
const KEY_RP_KM = 1;
const KEY_E = 1e-5;

function trackKeyOf(state: Readonly<GameState>): string {
  const el = elementsFromState(state.orbit, state.level.planet.mu);
  const h = state.orbit.x * state.orbit.vy - state.orbit.y * state.orbit.vx;
  const periKm = el.e * el.rp;
  return [
    state.run.rev, state.landing.orbitEpoch, h >= 0 ? '+' : '-', Math.round(el.rp / KEY_RP_KM), Math.round(el.e / KEY_E),
    Math.round((periKm * Math.cos(el.omega)) / KEY_RP_KM), Math.round((periKm * Math.sin(el.omega)) / KEY_RP_KM),
  ].join('|');
}

// The cached solution is for this world and this orbit epoch (a discrete orbit change re-solves at once, review N4).
function fresh(state: Readonly<GameState>): boolean {
  return cached !== null && cachedRev === state.run.rev && cachedEpoch === state.landing.orbitEpoch;
}

function recompute(state: Readonly<GameState>): DropSolution {
  const caps = capabilitiesNow(state);
  const { planet, ring } = state.level;
  const closed = elementsFromState(state.orbit, planet.mu).e < 1;
  if (caps.drop.solution && closed) {
    const key = trackKeyOf(state);
    if (track === null || key !== trackKey) {
      track = dotTrack(state.orbit, planet.mu, planet.R, POD_AIM_RP_FRAC * planet.R);
      trackKey = key;
    }
  }
  cached = computeDropSolution({
    state: state.orbit,
    tSec: state.clock.tSec,
    mu: planet.mu,
    R: planet.R,
    ring,
    lzs: state.landing.lzs,
    factors: dropFactors(caps, nextToLaunch(state)),
    solution: caps.drop.solution,
  }, caps.drop.solution && closed ? track : null);
  cachedRev = state.run.rev;
  cachedEpoch = state.landing.orbitEpoch;
  sinceRefreshWall = 0;
  return cached;
}

function clear(): void {
  cached = null;
  cachedRev = null;
  cachedEpoch = null;
  sinceRefreshWall = 0;
  track = null;
  trackKey = null;
}

export function mountDropCache(store: Store<GameState>): () => void {
  if (storeRef) throw new Error('mountDropCache: already mounted');
  storeRef = store;
  const offReset = onWorldReset('drop-cache', clear, () => ({
    cached: cached !== null, cachedRev, cachedEpoch, sinceRefreshWall, track: track !== null, trackKey,
  }));
  const offTick = onGameTick((_dtWorld, dtWall) => {
    const state = store.getState();
    if (state.run.phase !== 'landing') {
      if (cached !== null || track !== null) clear();
      return;
    }
    sinceRefreshWall += dtWall;
    if (!fresh(state) || sinceRefreshWall >= 1 / PREDICT_HZ) recompute(state);
  });
  return () => {
    offTick();
    offReset();
    clear();
    storeRef = null;
  };
}

// The drop solution as of its last refresh (computed on demand if none is cached for this world), or null outside
// LANDING. Its window times are relative to its asOfTSec: rebase them with landing-solve secFromNow.
export function getDropSolution(): DropSolution | null {
  if (!storeRef) throw new Error('getDropSolution: mountDropCache has not run');
  const state = storeRef.getState();
  if (state.run.phase !== 'landing') return null;
  return fresh(state) ? cached : recompute(state);
}

// The drop solution for the state as it is right now (recomputed when the cached one is from an earlier tick, keeping
// the PREDICT_HZ cadence): what a launch decides on, so [L] never acts on a dot up to 100 ms old.
// ONLY landing.ts requestLaunch (and its landingView for a controller deciding a launch) may call this: it recomputes on
// every call whose clock moved, so a per-frame or per-tick reader would pay a full solve each time. Everyone else reads
// getDropSolution (the cached one) or, better, state.landing.window.
export function currentDropSolution(): DropSolution | null {
  if (!storeRef) throw new Error('currentDropSolution: mountDropCache has not run');
  const sol = getDropSolution();
  const state = storeRef.getState();
  if (sol === null || sol.asOfTSec === state.clock.tSec) return sol;
  const since = sinceRefreshWall;
  const fresh = recompute(state);
  sinceRefreshWall = since;
  return fresh;
}
