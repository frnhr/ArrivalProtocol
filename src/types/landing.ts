// Slices 4c–4e: the lead owns this file (slice-4cde-plan.md §7.2); tracks ask by message.
// Every landing type (docs/phase3/01-landing.md, slice 1a). Type-only imports: Vec2 (types/orbit), Colonist
// (types/segment) and GameState (state/schema, for the controller seam; schema imports this file back, which is fine
// for types). The pure solver, the rules, the sim and the views all speak these.
//
// Angles in STATE are world radians (atan2 of a world position: CCW-positive, 0 along +x); angles in DATA are degrees,
// converted once when the ship's landing slice is built (state/initial.ts createLandingState).

import type { Vec2 } from '@/types/orbit';
import type { Colonist } from '@/types/segment';
import type { GameState, GuideLayer, Urgency } from '@state/schema';
import type { EffectiveVersion } from '@/types/skill';

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

// A no-go arc (§3.6: lava, cliffs, a lake): VESPER's lava and LAST LIGHT's cliffs (slice 1b, plan §2.1). A ship with arcs
// has one within NO_GO_NEAR_EDGE_KM of a bracket edge (validateLandingDef), so a wide dot is a real risk.
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
  drag: boolean;        // the DRAG line and decay (§3.7; false on layer 1: ARES-VII never decays)
}

// --- Runtime: copied from the def when the ship is built and never re-read from a ShipDef. SURVEY edits these in place. ---

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
  predictedTouch: Touch;  // how the driver would land at launch (driverTouch of its integrity): the guard's and the
                          // echo's guess. The final touch is Touchdown.touch, decided at touchdown (SURVEY's grounds)
  driverIntegrity: number;
  arc: Vec2[];            // the fixed streak path, world km, launch to touchdown
  descentSec: number;     // AI s: POD_DESCENT_SEC, or POD_FIRST_DESCENT_SEC for run 1's first pod
  firstOfRun: boolean;    // run 1's very first pod (the slow, bright descent and its sound): said, not inferred
}

export interface Touchdown {
  place: Place;
  lz: string | null;      // the LZ it counts in ('lz' and 'mislanded'), else null
  points: number;         // podPoints: a whole number
  missKm: number | null;  // off-site or no-go: km to the nearest bracket edge (the report's near misses); else null
  touch: Touch;           // final, decided at touchdown (landing-rules touchAtTouchdown): every reader uses this one
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

// Why no more pods launch: every pod away, END LANDING, the risk-7 auto-end (no driver left), Bay Ctrl missing (§3.4's
// BAY OFFLINE: a ship file with no backup never comes back on this ship, so it auto-ends like no-driver-left;
// landing-rules landingStuck names both), or the ship left orbit during the landing ('ship-lost': with the engine open
// in 1b a dry tank under decay can crash and a wild burn can escape; ORBIT's endLandingLost writes it, the pods aboard
// go NOT LAUNCHED and the falling ones still score; landing-rules landingOutcome reads burn.status for the outcome), or
// no drop dot on this orbit with an empty tank ('no-drop', review M1: nothing can bring a window back).
export type LandingEnd = 'all-launched' | 'end-landing' | 'no-driver-left' | 'bay-offline' | 'ship-lost' | 'no-drop';

// --- Decay and GO LOWER (§3.7, slice 1b; landing-orbit.ts is the math, orbit-sim and landing.ts write the state) ---

// One drag kick (§3.7): a retrograde Δv at a ▼ below the DRAG line. `apsis` and `dropKm` are the far apsis that moved and
// by how much, for the stamp (`DRAG · ▲ −110 km`, shown from DRAG_STAMP_MIN_KM); `rad` is where it happened (world rad,
// the stamp's place on the plot); `rpKm` the ▼ it was applied at.
export interface DragKick {
  atTSec: number;
  rpKm: number;
  dvKmS: number;
  rad: number;
  apsis: '▲' | '▼';
  dropKm: number;
}

// The decay so far on this ship (orbit-sim writes it with every kick, in the same update as orbitEpoch).
export interface DecayState {
  lastKickTSec: number | null;  // the kick-timing rule's gap (plan §1.4: at most one kick per DRAG_KICK_MIN_GAP_FRAC period)
  kicks: number;
  last: DragKick | null;        // the stamp, the hiss and the drag lesson read this
}

// GO LOWER (§3.7): the aim the strip offers and, once the kid fires for it, keeps (`held`) until landing-orbit
// goLowReleased. Built by landing.ts from landing-orbit goLowerFit, the same call L9's "or fly lower" asks, so the two
// always agree. AUTOBURN v3 (slice 4) flies the same aim.
export interface GoLowAim {
  lz: string;               // the LZ whose dot should fit (KEEP HOLDING — until LZ-B's dot fits)
  launchRad: number;        // the ship's world angle at that LZ's launch point (LzWindow.launchRad)
  burnRad: number;          // launchRad − π·sign: the RETRO burn is centred half an orbit before it
  targetRadiusKm: number;   // the radius at launchRad where the sure window reaches LANDING_SURE_MIN_TAC
  floorKm: number;          // ring.min + GO_LOW_FLOOR_MARGIN_KM: the hard stop
  held: boolean;            // the kid fired for it: kept until goLowReleased, even if the plan moves
}

// An offered burn (landing-orbit landingBurnOffer) that passed with no Δv delivered for it (risk 2): it stops neither a
// SKIP nor pace again until a launch (for a GO LOWER, a launch into `untilLz`), `untilLz` filling, or a new reason
// (landing.ts clears it).
export interface DeclinedBurn {
  // landing-orbit declineKey of the declined burn: reason|event (+ the aim LZ for go-low), NOT predict burnKey, whose
  // due|ahead part changes when the burn's apsis passes, so the next pass's replan of the same burn would never match.
  key: string;
  untilLz: string | null;   // GO LOWER's LZ: a launch into it or its filling ends the decline (null: any launch, a new reason)
}

// GameState.landing: replaces the phase-2 souls and printer slices. Built by state/initial.ts createLandingState from
// the ship's def and memory alone (no ShipDef lookup at runtime, so generator-made ships need nothing new).
export interface LandingState {
  lzs: LzState[];
  noGo: NoGoArcState[];
  forgiveness: ForgivenessClass;
  terrain: TerrainWord;
  drag: boolean;
  finalShip: boolean;           // ShipDef.final, copied: L0 and the finale's wait
  lead: number;                 // the story pod: credits first, the scripted bite's target beside the root (VESPER's POD 09)
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
  window: LandingWindow | null; // the in-band window open NOW (landing.ts writes it each AI tick): the one source of
                                // truth for "window open" (hollow's landMult, pace, guidance, chips, alerts, tests)
  fuelAtEndPct: number | null;  // FUEL when the landing ended: the FUEL star (§3.9)
  orbitEpoch: number;           // bumped on a discrete orbit change (a drag kick, the end of a burn): a drop-cache key
  // Slice 1b (plan §1.2). orbit-sim writes `decay`; landing.ts writes `goLow` and `declined`. predict reads goLow and
  // decay from here (never from the drop cache), so it stays independent of the cache's mount order.
  decay: DecayState;
  goLow: GoLowAim | null;
  declined: DeclinedBurn | null;
  // Review M2: ghost bursts fired during this landing (orbit-sim counts them with burn.ghostBursts): its first is a SKIP's
  // stop (selectors ghostBurstsThisPhase), and from then the strip's SWAP THRUST CTRL row stands while the engine fires.
  ghostBursts: number;
  // Slice 4c (AUTODROP, docs/phase3/impl/slice-4cde-plan.md §2.2): its machine, in the state so a controller is derived
  // from it each tick (landing-controller.ts) and dies with its file. At rest at every save point (save-codec checks it).
  autodrop: AutodropState;
}

// The window open now (§3.2, risk 13): the dot's centre in `lz`'s bracket while the ship is in the launch band; `sure`
// while the whole dot is. landing.ts emits window-open / window-sure / window-closed on its edges.
export interface LandingWindow {
  lz: string;
  sure: boolean;
}

// --- The drop solution (landing-solve computeDropSolution, cached by drop-cache.ts) ---

// The drop width's multipliers (§3.8): Sensor Interp, Nav Plotter, the driver (landing-rules dropFactors; MERGE's blind
// drop multiplies their product by BLIND_DROP_MULT in slice 7).
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
  uncertain: boolean;     // Sensor Interp failing, dead or missing (§3.8): the grey dot, `≈` labels, DROP UNCERTAIN
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
  // The part of the window launched from inside the band (the window intersected with the ship's band crossings): the
  // first such span that has not ended by the solution's time, or null when the window has none (a window whose in-band
  // part is over this pass is reported as the next pass's: landing-solve windowsFor). "Open" for the rules means inside
  // THIS span (landing-rules openInBandWindow).
  inBandOpenInSec: number | null;
  inBandCloseInSec: number | null;
  inBand: boolean;                // inBandOpenInSec !== null: the LZ can be launched at from inside the band
  launchRad: number;              // the ship's world angle when the dot crosses the LZ's centre: GO LOWER's aim point
}

export interface DropSolution {
  asOfTSec: number;
  periodSec: number;
  block: 'no-solution' | null;    // Nav Plotter dead or missing (L1): no dot, no arc, no windows
  dot: DropDot | null;
  arc: Vec2[];                    // world km, from the ship to the dot
  windows: LzWindow[];            // sorted by openInSec
  uncertain: boolean;             // as DropDot.uncertain, also when there is no dot
  // Game time of the next drag kick (landing-orbit nextDragKick over one period), null with none due: windows after it
  // are a forecast, solved again at the kick (orbitEpoch). AUTODROP (4c) reads it to trust a window or wait.
  validUntilTSec: number | null;
}

// --- The launch path: the player and every future controller share it (landing.ts requestLaunch) ---

// The inline confirms at [L] (§3.3, §3.6): the dot outside every bracket, a full LZ, the dot's centre over a no-go arc
// (`LAUNCH INTO LAVA? scores 0`, in the arc's own word).
export type LaunchAsk = 'off-site' | 'full' | 'no-go';

export interface LaunchIntent {
  source: LaunchSource;
  pod?: number;                    // a specific pod, else nextToLaunch
  confirmed?: LaunchAsk;           // the inline confirm was answered for this ask
}

// In the order launchRefusal checks them. BAY OFFLINE: Bay Ctrl missing (§3.4); its words on screen avoid "offline"
// (§3.10: next to pods it would read as theirs), see LAUNCH_REFUSAL_TEXT. POD LOCKED (slice 5, plan R7): the pod it would
// launch is held by a corrupted resident's lock (DriverSegment.lockedBy), checked before NO POD READY.
export type LaunchRefusal = 'NOT LANDING' | 'LANDING OVER' | 'PAUSED' | 'SHIP SCREEN' | 'BAY OFFLINE' | 'ENGINE FIRING'
  | 'NO DROP SOLUTION' | 'OUT OF THE LAUNCH BAND' | 'POD LOCKED' | 'NO POD READY' | 'RELOADING' | 'BAY EMPTY';

export type LaunchResult =
  | { kind: 'launched'; pod: number }
  | { kind: 'refused'; reason: LaunchRefusal }
  | { kind: 'confirm'; ask: LaunchAsk; points: number; text: string };

// §3.14: everything AUTODROP may read.
export interface LandingView {
  solution: DropSolution;
  bay: BayState & { cadenceTac: number | null; shown: number };   // cadenceTac null: Bay Ctrl missing (BAY OFFLINE)
  queue: number[];                    // pods in launch order (LOAD NEXT first)
  remaining: Record<string, number>;  // per LZ label: pods it still has room for (projected fill)
  aboard: number;
  falling: number;
}

// AUTODROP (4c), the resident (5), MERGE's landing (7): one controller at a time, derived from the state each tick
// (landing-controller.ts activeLandingController: a resolver per source, asked in LANDING_CONTROLLER_ORDER).
export interface LandingController {
  source: Exclude<LaunchSource, 'player'>;
  holdsTactical: boolean;              // §3.14: a higher version may drop inside a SKIP
  launchesFromMind: boolean;           // like AUTOBURN, the only launch allowed from MIND
  decide(view: LandingView, state: Readonly<GameState>): LaunchIntent | 'skip' | null;
  // Slice 4c review B2: the game time (s) of the controller's next launch, or null with none planned. A controller that
  // holds TACTICAL names it, and pace treats it as a window (TACTICAL inside its lead, a SKIP stops before it): the landing's
  // own awaited window (landing-rules landingMoment) need not be the one the controller flies (a v3 plan's leftovers into a
  // full LZ, a v2 pass into an LZ the landing does not wait on). Absent: the landing's window rule alone.
  nextLaunchAtTSec?(state: Readonly<GameState>): number | null;
  // Slice 5 review fix pass (M1): a controller other than AUTODROP's own and the kid's hands (the sleeper's RUN THE DROPS 5,
  // MERGE 7) names the launch it waits for (its LZ, the pods of that volley, when), or null with nothing left to fly. While it names one it owns every open window:
  // the strip shows a wait row with no key (no `press [L]`, the rule an armed AUTODROP v3 keeps), and the kid's rows come
  // back once it has nothing left. Absent: it never owns a window. AUTODROP's own rows are autodrop.ts's (armedFor).
  waitsFor?(state: Readonly<GameState>): { lz: string; n: number; atTSec: number } | null;
}

// --- L9: DROP TOO WIDE (§3.11, plan §1.5; landing-rules dropTooWide and bestRepairForDrop) ---

// The file whose REPAIR gives the awaited LZ a sure window: the next pod's driver, Sensor Interp or Nav Plotter, with the
// factor it takes off the drop width (> 1). The L9 line names it; the MIND lights it.
export type RepairHint =
  | { file: 'driver'; pod: number; factor: number }
  | { file: 'sensor'; factor: number }
  | { file: 'navplot'; factor: number };

// GO LOWER's fit (landing-orbit goLowerFit): the radius at the launch point where the sure window reaches
// LANDING_SURE_MIN_TAC (`targetRadiusKm`, never below `floorKm`, ring.min + GO_LOW_FLOOR_MARGIN_KM), and the sure tactical
// s it gives there.
export interface GoLowerFit {
  targetRadiusKm: number;
  floorKm: number;
  sureTacAtTarget: number;
}

// The awaited LZ has no sure window, and a REPAIR or GO LOWER would give one (with neither there is no L9: L5 shows at
// the window). `goLower`: landing-orbit goLowerFit's fit (a target above the floor that the tank pays for), carried so
// landing.ts builds GO LOWER's aim from this very answer (review minor 1: L9's `or fly lower` and the burn agree by
// construction, and the fit is worked out once a frame); `launchRad`: the awaited window's (LzWindow.launchRad).
export interface TooWide {
  lz: string;
  repair: RepairHint | null;
  goLower: GoLowerFit | null;
  launchRad: number;
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
  // The featured colonists (name 'Okafor, Ada', age at landing): rolled from the run's rng, so kept here. The age is the
  // postcards' (slice 3b review m6: `I'm 12 now` in colony year 1 is the age plus the colony's years).
  featured: FeaturedColonist[];
}

// A featured colonist as a pod's summary keeps them (PodSummary.featured).
export interface FeaturedColonist {
  name: string;
  age: number;
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
  landedInLz: number;                   // colonists in an LZ with room, soft or hard: the headline (runLanded)
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

// --- Slice 4c: AUTODROP's machine (slice-4cde-plan §2.2, §3; Track DROP fills it, the FOUNDATION typed it) ---

// What [G] armed: v2's one pass, or v3's whole plan.
export type AutodropArm = 'pass' | 'plan';
// Why the last pass or plan ended (the strip's words). 'released': v1's [L] let go before the volley's first launch, so
// nothing went (R4's one-time `HOLD [L]` lesson reads it; foundation review M2).
export type AutodropEnd = 'pass-done' | 'plan-done' | 'cancel' | 'downgraded' | 'off' | 'offline' | 'landing-over' | 'released';

export interface AutodropState {
  held: boolean;                    // v1: [L] (or a LAUNCH button) held on the SHIP screen
  armed: AutodropArm | null;        // v2's [G] (this pass), v3's [G] (the plan)
  pass: Record<string, number>;     // v2: pods per LZ for this pass (the POD BAY's [−] n [+]), kept between passes
  sent: Record<string, number>;     // launched since [G] (`PASS DONE · A +2 · B +1`)
  armedAtTSec: number | null;       // game s at [G]: a pass ends one period later
  claimed: boolean;                 // holds its Core thread for the volley at hand
  waitingSinceTSec: number | null;  // its claim found no thread free (it launches late)
  flownAs: EffectiveVersion;        // the version it flew at the last tick (a downgrade acts once)
  end: AutodropEnd | null;          // why the last pass or plan ended (the strip's words)
  endAtAi: number | null;
}

// The guidance slot AUTODROP fills (slice-4cde-plan §3.7; autodrop.ts autodropLineOf, read by landing-guidance.ts
// buildLandingContext): its own row (AD-hold, AD-fly, AD-wait, AD-done), checked after L2, L12-bay and L12-nodrop and before
// L3–L7, and the tail it puts on L13's waits (` · [G] AUTODROP`). Either may be null.
export interface AutodropLine {
  row: { id: string; text: string; keys: string[]; urgency: Urgency; layer: GuideLayer } | null;
  tail: { text: string; key: string | null } | null;
}
