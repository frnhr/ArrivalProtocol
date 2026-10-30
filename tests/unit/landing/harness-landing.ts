// Slice 1a: the landing for the headless suites. `followLanding` lands a ship by the strip, as a kid who obeys it would;
// `landInstantly` skips the landing for suites that test something else; `lockOn` builds a ship already in orbit (no
// capture flown), which is what keeps the landing suites fast.
//
// followLanding reads the DIRECTOR's line (the strip the kid sees), every tick:
// • a line that names [L] (LAUNCH NOW, LAUNCH — WIDE DROP) presses KeyL, once per reaction: [L] is matched FIRST, before
//   any rule that reads `NOW` as "hold SPACE" (followDirector's), because LAUNCH NOW contains NOW;
// • a line that names [F] (L13's WAIT, the MIND CLEAR hint) presses KeyF while no SKIP runs;
// • L12 (NO POD CAN LAUNCH, and its twin NO LZ IN THE LAUNCH BAND; never L12b) presses END LANDING (landing.ts
//   endLanding, the POD BAY window's button after its inline confirm);
// • an inline confirm at [L] (off-site, or an LZ already full) is answered by `confirm` (default yes: Enter).
// [L] goes through the real key path (landing-controls registerLandingKeys, registered once per store here), so the
// refusals, the guards and SHIP SCREEN in the MIND are the game's own.
import type { Store } from '@state/store';
import type { GameState, ObjectiveLine } from '@state/schema';
import type { Harness2 } from '../wp2/harness2';
import { registerLandingKeys } from '@systems/landing-controls';
import { endLanding, forceLandAll } from '@systems/landing';
import { endFlight } from '@systems/orbit-sim';
import { stateFromElements } from '@/types/orbit';

const keyed = new WeakSet<Store<GameState>>();
let confirmAnswer = true;

// [L] for this harness's store (once: the input router keeps its bindings for the process).
export function ensureLandingKeys(h: Pick<Harness2, 'store'>): void {
  if (keyed.has(h.store)) return;
  keyed.add(h.store);
  registerLandingKeys(h.store, { confirm: (_text, onYes) => { if (confirmAnswer) onYes(); } });
}

export interface FollowLandingOpts {
  reactionSec?: number;   // wall seconds between a line appearing and the kid acting on it (default 0.3)
  maxWall?: number;       // give up after this many wall seconds of landing (default 900)
  confirm?: boolean;      // the answer to an inline confirm at [L] (default true)
  onTick?: () => void;    // called every tick after the step (a test's own checks, a defender)
}

export interface FollowLandingResult {
  texts: string[];        // every distinct line the strip showed, in order
  launchPresses: number;
  skipPresses: number;
  endedByStrip: boolean;  // L12 made the kid press END LANDING
  wall: number;           // wall seconds of landing
  windows: number;        // windows the landing used (a window-open edge followed by a launch in it)
}

// The strip rows that ask for END LANDING: L12 and its twins NO LZ IN THE LAUNCH BAND and NO BAY CTRL (1b's L12-bay),
// exactly. Not L12b (`landing-L12b`, ALL PODS AWAY · n FALLING: pods still falling must come down), and not NO ROOM IN THE
// BAND (`landing-L13-noroom`: its [F] and L3b's [L] land the pods mislanded; END LANDING there is the kid's choice, not
// the strip's ask).
const END_LANDING_ROWS: ReadonlySet<string> = new Set(['landing-L12', 'landing-L12-band', 'landing-L12-bay', 'landing-L12-nodrop']);

function namesKey(line: ObjectiveLine | null, key: string): boolean {
  return line !== null && line.text.includes(`[${key}]`);
}

// Lands the ship the harness is on by the strip, from now until the phase leaves LANDING (or maxWall). Returns what the
// kid saw and did.
export function followLanding(h: Harness2, opts: FollowLandingOpts = {}): FollowLandingResult {
  const reactionSec = opts.reactionSec ?? 0.3;
  const maxWall = opts.maxWall ?? 900;
  confirmAnswer = opts.confirm ?? true;
  ensureLandingKeys(h);
  const result: FollowLandingResult = { texts: [], launchPresses: 0, skipPresses: 0, endedByStrip: false, wall: 0, windows: 0 };
  const start = h.wall();
  let seenSince: { text: string; at: number } | null = null;
  let lastPressAt = -Infinity;
  let windowOpen = false;
  let launchedThisWindow = false;
  while (h.store.getState().run.phase === 'landing' && h.wall() - start < maxWall) {
    h.step();
    opts.onTick?.();
    const state = h.store.getState();
    const isOpen = state.landing.window !== null;
    if (isOpen && !windowOpen) launchedThisWindow = false;
    windowOpen = isOpen;
    const line = h.shown();
    const text = line?.text ?? '';
    if (text !== '' && result.texts[result.texts.length - 1] !== text) result.texts.push(text);
    // Structure, not digits: a countdown ticking is the same line (the reaction clock keeps running).
    const generic = text.replace(/\d+/g, '#');
    if (seenSince === null || seenSince.text !== generic) seenSince = { text: generic, at: h.wall() };
    const ready = h.wall() - seenSince.at >= reactionSec - 1e-9 && h.wall() - lastPressAt >= reactionSec - 1e-9;
    if (!ready || state.clock.paused || state.landing.ended !== null) continue;
    if (namesKey(line, 'L')) {
      h.press('KeyL');
      result.launchPresses++;
      lastPressAt = h.wall();
      if (windowOpen && !launchedThisWindow) { launchedThisWindow = true; result.windows++; }
    } else if (line !== null && END_LANDING_ROWS.has(line.id)) {
      if (endLanding(h.store) === null) result.endedByStrip = true;
      lastPressAt = h.wall();
    } else if (namesKey(line, 'F') && state.clock.skipWarp === null) {
      h.press('KeyF');
      result.skipPresses++;
      lastPressAt = h.wall();
    }
  }
  result.wall = h.wall() - start;
  return result;
}

// For suites that don't test the landing: every pod that can launch lands at once (forceLandAll), then the clock runs
// until the LANDING REPORT (the linger, HOLLOW's story beat and the final ship's duel hold it as in the game). Returns
// the wall seconds it took.
export function landInstantly(h: Harness2, maxWall = 120): number {
  const start = h.wall();
  if (h.store.getState().run.phase !== 'landing') throw new Error(`landInstantly: not landing (phase ${h.store.getState().run.phase})`);
  forceLandAll(h.store);
  while (h.store.getState().run.phase === 'landing' && h.wall() - start < maxWall) h.step();
  return h.wall() - start;
}

export interface LockOpts {
  r?: number;                         // ▼ (km); default the middle of the ship's ring
  e?: number;                         // eccentricity; default 0
  argPeriDeg?: number;                // where ▼ lies (world degrees); default 0
  status?: 'locked' | 'accepted';
}

// The harness's ship put straight into an orbit and locked (or accepted) there: endFlight runs as the lock would, so the
// landing begins with its warps, a full bay and 'landing-start'. No capture is flown.
export function lockOn(h: Pick<Harness2, 'store'>, opts: LockOpts = {}): void {
  const state = h.store.getState();
  const { ring, planet } = state.level;
  const rp = opts.r ?? (ring.min + ring.max) / 2;
  const orbit = stateFromElements(rp, opts.e ?? 0, ((opts.argPeriDeg ?? 0) * Math.PI) / 180, 0, planet.mu);
  h.store.update((draft) => { draft.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; });
  endFlight(h.store, opts.status ?? 'locked');
}
