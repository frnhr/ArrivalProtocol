// Every landing type (docs/phase3/01-landing.md, slice 1a). Depends on nothing but types/orbit and types/segment (and
// the GameState type, for the controller seam): the pure solver, the rules, the sim and the views all speak these.
//
// Angles in STATE are world radians (atan2 of a world position: CCW-positive, 0 along +x); angles in DATA are degrees,
// converted once when the ship's landing slice is built (state/initial.ts createLandingState).

import type { Vec2 } from '@/types/orbit';
import type { Colonist } from '@/types/segment';
import type { GameState } from '@state/schema';

export type LzWidth = 'wide' | 'standard' | 'narrow';            // km in tuning LZ_WIDTH_KM
export type ForgivenessClass = 'gentle' | 'rough' | 'harsh';     // off-site score in tuning OFF_SITE_SCORE_BY_CLASS
export type LzGround = 'flat';                                   // SURVEY (slice 6) adds 'rocky' | 'wet'
export type TerrainWord = 'PLAINS' | 'GRASSLAND' | 'OCEAN' | 'VOLCANIC';

// --- Data: ShipDef.landing. The map's roller (slice 3) returns exactly this type, checked by validateLandingDef. ---

export interface LzDef {
  label: string;        // 'LZ-A': labels follow increasing angle (orbits are CCW)
  centreDeg: number;    // [0, 360)
  width: LzWidth;
  pods: number;         // the LZ's count, in pods (× COLONISTS_PER_POD colonists)
}

// A no-go arc (§3.6: lava, cliffs, a lake). 1b fills them; every ship's list is empty in 1a.
export interface NoGoArcDef {
  centreDeg: number;
  widthDeg: number;
  word: string;         // 'LAVA'
}

export interface ShipLandingDef {
  lzs: readonly LzDef[];
  forgiveness: ForgivenessClass;
  terrain: TerrainWord;
  noGo: readonly NoGoArcDef[];
  // The colony's written name on the tutorial run (RIVERSIDE on ARES-VII), else null: colonyName rolls one.
  colonyFirstRun: string | null;
  drag: boolean;        // the DRAG line and decay (read by 1b; false on layer 1)
}

// --- Runtime: copied from the def when the ship is built and never re-read from SHIPS. SURVEY edits these in place. ---

export interface LzState {
  label: string;
  centreRad: number;    // world radians
  halfWidthRad: number; // half the bracket, as surface arc over R
  widthKm: number;
  pods: number;         // its count in pods
  ground: LzGround;
}

export interface NoGoArcState {
  centreRad: number;
  halfWidthRad: number;
  word: string;
}

// Where a pod came down (§3.9): in an LZ with room, in an LZ already at its count, outside every bracket, in a no-go arc.
export type Place = 'lz' | 'mislanded' | 'off-site' | 'no-go';
export type Touch = 'soft' | 'hard';
// Why a pod was parked in orbit when the landing ended (§3.10): its driver was eaten by HOLLOW, taken to 0 some other
// way (a zone), or it simply never got its turn.
export type ParkReason = 'eaten' | 'dead' | 'no-time';
export type DriverLoss = 'eaten' | 'dead';
// Who launched a pod: the kid, AUTODROP (slice 4c), the friendly resident (slice 5), MERGE's last landing (slice 7).
export type LaunchSource = 'player' | 'autodrop' | 'resident' | 'merge';

// Everything decided at launch (§3.3): where the pod lands is fixed then; the descent only shows it.
export interface LaunchRecord {
  atTSec: number;
  atAi: number;
  source: LaunchSource;
  launchRadius: number;   // the ship's radius at launch (km)
  dotRad: number;         // the dot's centre at launch (world rad)
  halfWidthKm: number;    // the drop width s at launch
  aimLz: string | null;   // the bracket the dot's centre was in at launch (the echo's `... LZ-A`), null off-site
  landingRad: number;     // dot + u × s / R, u uniform in [−1, 1] from childRng(seed, ship, 'drop')
  touch: Touch;           // from the driver's integrity at launch (driverTouch)
  driverIntegrity: number;
  arc: Vec2[];            // the fixed streak path, world km, launch to touchdown
  descentSec: number;     // AI s: POD_DESCENT_SEC, or POD_FIRST_DESCENT_SEC for run 1's first pod
}

export interface Touchdown {
  place: Place;
  lz: string | null;      // the LZ it counts in ('lz' and 'mislanded'), else null
  points: number;         // podPoints: a whole number
  missKm: number | null;  // off-site or no-go: km to the nearest bracket edge (the report's near misses); else null
  atAi: number;
}

export type PodFate =
  | { kind: 'aboard' }
  | { kind: 'falling'; launch: LaunchRecord }
  | { kind: 'down'; launch: LaunchRecord; touchdown: Touchdown }
  // Released into the ship's orbit when the landing ended there (§3.10). restorable: the driver was eaten by HOLLOW,
  // so MERGE may bring the pod back (slice 7's last landing; in 1a it stays parked and scores 0).
  | { kind: 'parked'; why: ParkReason; restorable: boolean }
  // The ship left orbit (crashed, escaped, abandoned) with the pod still aboard.
  | { kind: 'not-launched' };

export type PodFateKind = PodFate['kind'];

// One per pod for the whole ship: a pod outlives its driver, so an eaten driver no longer means "lost people".
export interface PodRecord {
  pod: number;            // 1-based, numbered in address order when memory is built
  family: string;
  colonists: number;
  featured: Colonist[];
  driverLost: DriverLoss | null;
  restored: boolean;      // MERGE gave its driver back (§3.17)
  fate: PodFate;
}

// The bay (§3.4): `loaded` slots ready, the reload's progress toward the next slot, and the cadence left before the
// next launch may go, both in tactical seconds of world time.
export interface BayState {
  loaded: number;
  reloadTac: number;
  cadenceLeftTac: number;
}

export type LandingEnd = 'all-launched' | 'end-landing' | 'no-driver-left';

// GameState.landing: replaces the phase-2 souls and printer slices. Built by state/initial.ts createLandingState from
// the ship's def and memory alone (no getShip at runtime, so generator-made ships need nothing new).
export interface LandingState {
  lzs: LzState[];
  noGo: NoGoArcState[];
  forgiveness: ForgivenessClass;
  terrain: TerrainWord;
  drag: boolean;
  finalShip: boolean;           // ShipDef.flagship, copied: L0 and the finale's wait
  lead: number;                 // the story pod: credits first, the scripted bite's target on ARES-VII
  hurt: number[];               // pods built hurt (run 1's POD 02)
  colonyFirstRun: string | null; // the def's written colony name, copied (null: colonyName rolls one)
  colony: string | null;        // named at the ship's first touchdown
  pods: PodRecord[];            // ordered by pod number
  bay: BayState;
  loadNext: number | null;      // LOAD NEXT's pod
  startedAtTSec: number | null; // set at ORBIT LOCK or ACCEPT (actions.ts beginLanding)
  ended: LandingEnd | null;     // why no more pods will launch (END LANDING, all launched, none left)
  lingerAiSec: number | null;   // AI s left before the LANDING REPORT, once the ship is empty (mutate)
  noDriverAiSec: number;        // AI s with pods aboard and no driver left in memory: the risk-7 auto-end (mutate)
  fuelAtEndPct: number | null;  // FUEL when the landing ended: the FUEL star (§3.9)
  orbitEpoch: number;           // bumped on a discrete orbit change (1b's drag kick, later burns): a drop-cache key
}

// --- The drop solution (landing-solve computeDropSolution, cached by drop-cache.ts) ---

// The drop width's multipliers (§3.8): Sensor Interp, Nav Plotter, the driver. All 1 in 1a (landing-rules dropFactors).
export interface DropFactors {
  sensor: number;
  plotter: number;
  driver: number;
}

// Where a pod launched now would land: the dot's centre, its half-width, and whether the ship is in the launch band.
export interface DropDot {
  rad: number;            // world radians
  halfWidthKm: number;
  launchRadius: number;
  inBand: boolean;
}

// One LZ's next window, in game seconds from the solution's asOfTSec. A window is OPEN while the dot's centre is in the
// bracket and SURE while the whole dot is; it counts as open for the rules only when launched from inside the band.
export interface LzWindow {
  lz: string;
  openInSec: number;              // ≤ 0: open now
  closeInSec: number;
  sureOpenInSec: number | null;   // null: the whole dot never fits this pass
  sureCloseInSec: number | null;
  launchRadius: number;           // at the window's middle
  halfWidthKm: number;
  inBand: boolean;
}

export interface DropSolution {
  asOfTSec: number;
  periodSec: number;
  block: 'no-solution' | null;    // Nav Plotter dead or missing (L1): no dot, no arc, no windows
  dot: DropDot | null;
  arc: Vec2[];                    // world km, from the ship to the dot
  windows: LzWindow[];            // sorted by openInSec
}

// --- The launch path: the player and every future controller share it (landing.ts requestLaunch) ---

export interface LaunchIntent {
  source: LaunchSource;
  pod?: number;                    // a specific pod, else nextToLaunch
  confirmed?: 'off-site' | 'full'; // the inline confirm was answered for this ask
}

// In the order launchRefusal checks them.
export type LaunchRefusal = 'NOT LANDING' | 'LANDING OVER' | 'PAUSED' | 'SHIP SCREEN' | 'ENGINE FIRING'
  | 'NO DROP SOLUTION' | 'OUT OF THE LAUNCH BAND' | 'NO POD READY' | 'RELOADING' | 'BAY EMPTY';

export type LaunchAsk = 'off-site' | 'full';

export type LaunchResult =
  | { kind: 'launched'; pod: number }
  | { kind: 'refused'; reason: LaunchRefusal }
  | { kind: 'confirm'; ask: LaunchAsk; points: number; text: string };

// §3.14: everything AUTODROP may read.
export interface LandingView {
  solution: DropSolution;
  bay: BayState & { cadenceTac: number; shown: number };
  queue: number[];                    // pods in launch order (LOAD NEXT first)
  remaining: Record<string, number>;  // per LZ label: pods it still has room for (projected fill)
  aboard: number;
  falling: number;
}

// AUTODROP (4c), the resident (5), MERGE's landing (7): one controller at a time (landing.ts setLandingController).
export interface LandingController {
  source: Exclude<LaunchSource, 'player'>;
  holdsTactical: boolean;              // §3.14: a higher version may drop inside a SKIP
  launchesFromMind: boolean;           // like AUTOBURN, the only launch allowed from MIND
  decide(view: LandingView, state: Readonly<GameState>): LaunchIntent | 'skip' | null;
}

// --- The per-ship result (§5 "To 02"): flat and JSON-safe, ready for slice 3's save ---

// One LZ's row, in colonists: its count, those that landed with room (soft or hard), those mislanded, and how many of
// either came down hard.
export interface LzResult {
  lz: string;
  count: number;
  landed: number;
  mislanded: number;
  hard: number;
}

export interface PodSummary {
  pod: number;
  family: string;
  colonists: number;
  fate: PodFateKind;
  place: Place | null;
  lz: string | null;
  touch: Touch | null;
  points: number;
  parkedWhy: ParkReason | null;
  restored: boolean;
}

// The landing half of a ShipResult (state/schema.ts), folded from the pods by landing-rules landingResult.
export interface LandingTally {
  colonistsAboard: number;
  lzs: LzResult[];
  offSite: number;                          // colonists
  noGo: number;                             // colonists
  restored: number;                         // colonists whose driver MERGE gave back
  parked: { pod: number; why: ParkReason }[];
  notLaunched: number;                      // colonists
  landedOnTarget: number;                   // colonists in an LZ with room, soft or hard: the headline (runLanded)
  points: number;
  colony: string | null;
  pods: PodSummary[];
}

// ★ ON TARGET (§3.9): soft landings in an LZ with room over everyone aboard (unlaunched pods count in the denominator).
// Live during the landing (the mini-HUD's `★ ON TARGET 5/6` counts pods), final in the report.
export interface OnTargetTally {
  onTargetPods: number;
  pods: number;
  onTargetColonists: number;
  colonists: number;
  earned: boolean;     // at least STAR_ON_TARGET_FRAC of the colonists (so far, or for good once the landing is over)
  possible: boolean;   // it can still be earned: every pod not yet down would have to land soft on target
}
