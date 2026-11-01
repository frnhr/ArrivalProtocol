import type { Segment, SegmentRole } from '@/types/segment';
import type { LandingState, LandingTally } from '@/types/landing';
import type { FsToolKind } from '@/types/fs-tool';
import type { PlanetParams, Ring } from '@/types/orbit';
import type { Zone } from '@/types/zone';
import type { ShrinkTuning } from '@data/ships';
import type { MemoryClass, RunMapState, Hop, DeskWindowId } from '@/types/map';
import type { HollowDef, RunThreatState, ShipThreat } from '@/types/threat';
import type { UpgradeId, DraftCard } from '@data/upgrades';
import type { LastUnit } from '@systems/meta';

export type ViewMode = 'tools' | 'memory';

export interface MissionMeta {
  unitId: string;          // e.g. 'UNIT-047'
  shipId: string;          // e.g. 'ARES-VII'
  destination: string;     // e.g. 'KEPLER-186F'
  distanceLy: number;      // 581
  transmissionNum: number; // 47
  wave: number;            // the fleet wave this unit flies with (run 1 = wave 1)
  colonists: number;       // colonists aboard at arrival: the pods' (600 on ARES-VII)
}

// CRUISE: a quiet coast, the world runs at ship.cruiseWarp. TACTICAL: something is about to
// happen (crash course, burn, lock hold), the world runs at ship.tacticalWarp so countdowns
// are real seconds. SKIP: the player fast-forwards to the next event at clock.skipWarp (LEAD-2: along the
// orbit in exact jumps, landing on clock.skipEndTSec).
// systems/pace.ts is the only writer.
export type Pace = 'cruise' | 'tactical' | 'skip';

export interface ClockState {
  tSec: number;            // mission (game) seconds
  // AI seconds elapsed: wall seconds while unpaused in an active phase (the mind's clock,
  // §3.4). Log lines, the say() queue and the ticker are timed on it. (mutate)
  aiSec: number;
  // EFFECTIVE multiplier the sim integrates by — continuous. Speed-ups glide toward
  // speedTarget in log space, slow-downs snap (systems/clock.ts). 0 = halted.
  speed: number;
  // Discrete target written ONLY by systems/pace.ts: 0 while paused or outside an active
  // phase, else debugWarp ?? the warp of the current pace.
  speedTarget: number;
  paused: boolean;          // look-only pause (P, tab hidden, terminal outcome in WP1)
  pace: Pace;
  // OVERCLOCK (§6.1): in blue at TACTICAL pace the world runs at OVERCLOCK_FACTOR of the tactical
  // warp while the mind's ops run at full speed. Written by pace.ts with speedTarget.
  overclock: boolean;
  skipWarp: number | null;  // non-null while a SKIP is active (fixed when it was requested)
  // While a SKIP is active: the game time it lands on (pace.ts keeps it current; the clock never passes it).
  skipEndTSec: number | null;
  // While a SKIP is active and a LATER ghost burst comes before skipEndTSec (WP10): that burst's window. The tick that
  // reaches its start lands exactly on its end (no ease toward it), so the burst is flown whole in that tick and the
  // plan is re-checked right after it (systems/ghost-thrust.ts); the SKIP then flies on, or stops on the new line.
  skipWaypoint: SkipWaypoint | null;
  debugWarp: number | null; // the ?debug ladder's override; null = director pace
}

// 'locked': ORBIT LOCK (the whole loop in the ring, held steady 3 s). 'accepted': ACCEPT ORBIT
// or fuel-out on a closed loop with some share in the launch band. 'stranded': the same with range below
// STRANDED_RANGE_FRAC. 'escaped': open, receding past ESCAPE_R_FACTOR × r0, or receding with too
// little FUEL to close the loop at all. 'crashed': impact. 'abandoned': BEAM OUT finished before
// the impact (WP7, §4.3): the unit left a doomed ship and the pods still aboard went with it.
export type BurnStatus = 'approaching' | 'locked' | 'accepted' | 'stranded' | 'escaped' | 'crashed' | 'abandoned';
export type TerminalStatus = Exclude<BurnStatus, 'approaching'>;

// Attitude modes. The four presets track a live direction (velocity frame); 'off' is the
// MANUAL fold (momentum-carrying Q/E thrusters), reachable only through MANUAL.
export type SasMode = 'off' | 'prograde' | 'retrograde' | 'radial-in' | 'radial-out';
export type PresetMode = Exclude<SasMode, 'off'>;

// Who is holding the throttle: the player (SPACE / the BURN button) or AUTOBURN (WP9).
export type FiringSource = 'player' | 'auto';

// AUTOBURN (§6.10, systems/autoburn.ts): idle → armed (engaged, waiting for its moment, RETRO selected) →
// pointing (its moment came while the ship still turns) → burning (it holds the throttle, firingSource
// 'auto') → done (it flew the capture through: the loop in the ring, or braked as far as this burn goes) |
// dropped (it lost what it needs mid-way). `atAi` is when the phase began (the strip's done/lost lines stand a
// few seconds); `end` says why the last engagement ended.
export type AutoburnPhase = 'idle' | 'armed' | 'pointing' | 'burning' | 'done' | 'dropped';
export type AutoburnEnd =
  | 'in-ring' | 'braked' | 'fuel' | 'takeover' | 'cancel' | 'lost' | 'damaged' | 'engine' | 'presets' | 'no-capture' | 'flight-over';

export interface AutoburnState {
  phase: AutoburnPhase;
  atAi: number;
  end: AutoburnEnd | null;
}

export interface BurnState {
  status: BurnStatus;       // changed only on a terminal crossing
  thrustPct: number;        // POWER (MANUAL fold), 0..100; 100 at load
  heading: number;          // radians, inertial — direction the ship points / thrust fires
  omega: number;            // rad per game-second — angular velocity (carries momentum)
  rotInput: -1 | 0 | 1;     // manual rotation input (MANUAL only): −1 = CW, +1 = CCW
  sasMode: SasMode;         // the selected preset, or 'off' for MANUAL
  firing: boolean;          // the throttle is held (discrete; update)
  firingSource: FiringSource | null;
  // The planned burn (predict.ts burnKey) the throttle was pressed for, read only while firing: a
  // hold that outlives its burn hands over to the next one instead of being called TOO EARLY.
  firingFor: string | null;
  presetAligning: boolean;  // |heading − preset target| > PRESET_ALIGN_DEG: no thrust (discrete; update)
  fuelPct: number;          // FUEL: remaining Δv as % of level.dvBudgetKmS (mutate)
  dvDeliveredKmS: number;   // cumulative Δv the engine actually delivered (mutate)
  lastTickDvKmS: number;    // Δv delivered during the last game tick; 0 = engine quiet (mutate)
  lockHoldAiSec: number;    // HOLD STEADY progress toward LOCK_HOLD_AI_SEC (mutate)
  closedIdleAiSec: number;  // time idling on a closed, not-green loop, for ACCEPT ORBIT (mutate)
  missedIdleTac: number;    // tactical s outbound on an open path (▼ missed) with no burn held (mutate)
  // ACCEPT ORBIT is the only way on (predict.ts Prediction.acceptOnly, the lead's Rule 4). The predictor
  // sets it the first time its plan says so, and it stays for the rest of the flight, so the strip's
  // one line never flips back to a burn (discrete; update).
  acceptOnly: boolean;
  // Tactical seconds this ship's engine has delivered thrust, from any source (mutate). Scripted
  // faults wait on it: ship 1's ENGINE I/O FAULT strikes 2 s into the first burn.
  thrustTac: number;
  // The AI second the flight's line first said WAIT (the coast began; the director records it, mutate).
  // HALCYON's MOVE licence and HOLLOW's wake key on it (ShipDef licences atCoast, wake coastLeadSec).
  coastAtAi: number | null;
  // Uncommanded thrust from a damaged Thrust Ctrl (C2), while a burst runs (discrete; update on
  // start and stop). Game-time window [startTSec, endTSec); a sticky burst has endTSec Infinity
  // and stops once SPACE has been pressed and released (releaseArmed: SPACE went down during it).
  ghost: GhostBurst | null;
  // How many ghost bursts have started on this ship (update, with the burst's own start). The first is the alarm
  // moment (WP10, §9 item 2: the klaxon, TACTICAL, the only burst that stops a SKIP); the later ones are counted
  // (`UNCOMMANDED THRUST ×3`) and flown through.
  ghostBursts: number;
  // AUTOBURN's state machine (discrete; update on every phase change).
  auto: AutoburnState;
}

export interface GhostBurst {
  startTSec: number;
  endTSec: number;
  amp: number;              // share of nominal thrust
  sticky: boolean;
  releaseArmed: boolean;
}

// 2D two-body truth integrated by the orbit sim (planet at origin; km, km/s).
export interface OrbitVecState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// A later ghost burst a SKIP flies through (WP10): game times.
export interface SkipWaypoint {
  startTSec: number;
  endTSec: number;
}

// Immutable per ship: the planet, the goal ring and the engine/pace numbers, copied from
// the ShipDef (plus run modifiers) by data/mission.ts createFlight().
export interface LevelState {
  shipId: string;
  shipName: string;
  planet: PlanetParams;
  ring: Ring;
  r0: number;               // start radius (the escape test scales from it)
  // The ship's flight warps; at ORBIT LOCK or ACCEPT they become LANDING_TACTICAL_WARP / LANDING_CRUISE_WARP on every ship
  // (01-landing §3.2). state/actions.ts beginLanding is the only writer after createFlight.
  tacticalWarp: number;
  cruiseWarp: number;
  dvBudgetKmS: number;
  aNominalKmS2: number;
  // SHRINK THE LOOP's stop rule for this ship (ShipDef.shrink, WP7): the margins and the reaction
  // allowance in tactical seconds, and what "already small" means for its ring.
  shrink: ShrinkTuning;
  // The hazard zones of this flight, resolved for this run (systems/zones.ts resolveZones, WP9): KESTREL's
  // debris cloud with its centre on the arrival path and the rack it hits.
  zones: readonly Zone[];
  // The ship's memory class (ShipDef.memoryClass, 01 §3.16): data/memory.ts layoutOf(state) reads its racks, size and
  // receiver from it.
  memoryClass: MemoryClass;
}

// What the hazard zones have done this flight (WP9, systems/zones.ts): the debris clouds already hit (each
// hits once), and what each hit did (the MIND's rack tag says it for the rest of the ship, and must agree with
// the TERMINAL's line: `−25%`, or nothing there for a rack the kid emptied in time). Changed with update, on
// the contact.
export interface DebrisHitRecord {
  zoneId: string;
  files: number;      // the files it hurt
  worstLoss: number;  // the most integrity any one of them lost (a file straddling the rack loses less)
}

export interface HazardsState {
  hitIds: string[];
  debrisHits: DebrisHitRecord[];
}

// The run's phase (§4.1, systems/run.ts). 'title': the title card (nothing moves, audio still
// locked). 'boot': the unit unpacks in blue for a few seconds. 'flight': the ship. 'landing': the
// orbit is locked or accepted and the pods go down (01-landing: the clock runs, the world coasts,
// [L] launches through the windows; systems/landing.ts). 'report': the landing is over and the LANDING
// REPORT owns the screen; the world stops. 'desk': the ship is over and the kid picks the next one on the STAR CHART
// (phase 3 slice 3a, 02-map §3.10: both clocks stopped; systems/run.ts openDesk, setCourse). 'transmit': the next ship
// is chosen and the unit's files are packed for it (the PACKET, WP7 part 2; `◀ CHART` goes back to 'desk'). 'end': the
// run is over (RUN END).
// A crashed, escaped or stranded ship (or one whose Core was eaten) stays in 'flight' with the
// clock paused under its LOST card until the kid goes on (run.ts continueAfterLoss).
export type RunPhase = 'title' | 'boot' | 'flight' | 'landing' | 'report' | 'desk' | 'transmit' | 'end';

// How one ship of the run ended (§4.3, WP7). 'locked' / 'partial': it landed (ORBIT LOCKED, or
// ACCEPT ORBIT / an empty tank on a loop the launch band reaches). 'stranded' / 'escaped': no landing,
// normal transmit. 'crashed': EMERGENCY TRANSMIT (Core −25, +3 transit hits). 'abandoned':
// BEAM OUT finished first (+2 hits). 'emergency': HOLLOW ate the Core to 0 (Core reset, +3 hits).
export type ShipOutcome = 'locked' | 'partial' | 'stranded' | 'escaped' | 'crashed' | 'abandoned' | 'emergency';

// One finished ship (01-landing §5 "To 02"): flat and JSON-safe, ready for slice 3's save. The landing half
// (LandingTally: per-LZ rows, off-site, no-go, parked, the pods' detail, the points and the headline
// landedInLz) is folded by landing-rules landingResult; slot and depth are the map's (in 1a the ship's
// index and index + 1).
export interface ShipResult extends LandingTally {
  shipId: string;
  shipName: string;
  slot: number;
  depth: number;
  outcome: ShipOutcome;
  stars: number;            // ★ earned on its LANDING REPORT (0 for a ship that never landed)
  fuelLeftPct: number;
  // An ACCEPTED loop's distance from a perfect lock (WP7 part 2, RUN END's near-miss line `▼ was 140 km
  // from a perfect lock`): the end of the loop furthest outside the ring and by how many km. null for
  // every other outcome.
  ringMiss: RingMiss | null;
}

export interface RingMiss {
  apsis: '▼' | '▲';
  km: number;
}

// What the kid did this run (§9 WP7 item 8). WP8's draft weights its cards by them, WP9 trains
// AUTOBURN on the demos, WP11 weights HOLLOW's verbs by moves and deletes.
export interface RunStats {
  // Player burns that closed a loop (a capture flown by hand), and for each the START BURN offset:
  // when the burn started minus when the tick said to, in tactical seconds (negative: early).
  manualCaptures: number;
  demos: { offsetTac: number }[];
  repairs: number;          // REPAIR ops that finished (healed to 100 or ran out of charge)
  moves: number;            // MOVE ops that finished
  deletes: number;          // DELETE ops that finished
  driversLost: number;      // drivers HOLLOW ate (their pods are parked, not lost: the ship result counts them)
  driversBitten: number;    // bites HOLLOW landed on a driver, saved or not (WP8: the draft's FIREWALL reason)
  capRefusals: number;      // tool clicks refused because every Core thread was busy
  // THE DEAL (WP10, VESPER, §6.6): how HOLLOW's one offer of the run ended, or null while none was made. Its pod
  // and its moment are kept with it for RUN END and WP11's ending lines.
  deal: DealRecord | null;
}

// accepted: the named pod's driver was given up (eaten at once), every infection cured, the spread paused. refused /
// timeout: `> ok.`, and the bites come faster for a while. invalidated: the named driver launched, moved or was eaten
// first, or the ship ended while the offer stood.
export type DealOutcome = 'accepted' | 'refused' | 'timeout' | 'invalidated';

export interface DealRecord {
  outcome: DealOutcome;
  pod: number;
  shipId: string;
}

// Why a run ended (§4.3, §4.5's causes; RUN END and WP8's archive read it). The fleet ends with LAST LIGHT, the
// flagship (WP11): its finale ends a run 'won-purge', 'won-merge' or 'unresolved'; losing it is 'flagship-lost'. (WP7's
// interim 'end-of-fleet' and 'last-ship-lost' were for a fleet that ended before it, and are gone with it.)
export type RunEndCause =
  | 'won-purge' | 'won-merge' | 'unresolved' | 'flagship-lost' | 'overwritten' | 'stayed' | 'abandoned';

// BEAM OUT (§4.3, §9 WP7 item 6): a TRANSMITTING bar that races the impact, in tactical seconds of
// world time (it is the ship's antenna, not the mind). null while not beaming. (mutate)
export interface BeamOutState {
  progressTac: number;
}

// One transit hit as the boot's ECC lines name it (carry.ts): the file, and its integrity before
// and after. Generated from the hits really applied, so the log can never disagree with the files.
export interface TransitHit {
  // The packed file's id: it keeps it across the link (carry.ts copies files whole), so the boot's red
  // flash finds the very chip the hit landed on (WP7 part 2).
  segId: string;
  fileName: string;
  role: SegmentRole | null;
  from: number;
  to: number;
}

// What the unit arrived with on this ship (carry.ts arrive), for the boot's lines: the hits, the
// charge it carried, the star credit and the floor, and anything that did not fit.
export interface ArrivalReport {
  hits: TransitHit[];
  chargeCarried: number;    // what crossed the link (min(charge, link − files))
  starCredit: number;       // +6 per ★ on the last ship's LANDING REPORT
  stars: number;
  // The card picked at the TRANSMIT (WP8), and the REPAIR CHARGE it brings on arrival (+12, else 0).
  card: UpgradeId | null;
  cardCharge: number;
  chargeFloorAdded: number; // the floor's top-up (§6.5: never fewer than 12 blocks on arrival)
  chargeOverflowLost: number; // charge that did not fit memory and was lost (loudly)
  scripted: TransitHit[];   // the ship's own arrival damage (§6.9: KESTREL's sensor, VESPER's Thrust Ctrl)
  // Phase 3 slice 3a: the hits ECC corrected while the unit slept (02 §3.3: the hop's transit hits plus the extras, minus
  // what landed). 0 on the classic world (no slack) and on ship 1; the boot's ECC block says it (systems/map-boot.ts).
  eccCorrected: number;
  // Phase 3 slice 2 (04 §3.4, §3.8): the beam seeds laid out behind their targets (the boot's ECC seeds line names each),
  // and HOLLOW's root when it boarded on this beam (the 108% unpack line, the boarding moment). Empty / null otherwise.
  seeds: ArrivalSeed[];
  boarded: { blocks: number; cause: 'trace' | 'forced' } | null;
}

// One beam seed as it arrived (04 §3.4): the file it was rolled to ride behind, and `loose` when the no-room rule made it a
// stray (carry.ts layoutCarried), landed in the largest free region instead: it is next to nothing the ECC line can name.
export interface ArrivalSeed {
  segId: string;
  targetName: string;
  loose?: true;
}

// The transmission being prepared ('transmit'): the next ship, the link and how the unit's files pack
// into it, and the extra hits of the way the last ship ended (BEAM OUT +2, EMERGENCY +3 and Core −25).
// The TRANSMIT screen (WP7 part 2) reads it; transmitNext sends it.
export interface TransitPlan {
  toShipIndex: number;      // the destination's position on the route (its depth − 1)
  toSlot: number;           // the destination's slot (systems/map-run.ts shipDefAt): the classic world's index
  hop: Hop;                 // the beam to it (systems/map-hop.ts): its link, hits, ECC, years and the destination's room
  linkBlocks: number;       // hop.linkBlocks (the draft and the PACKET read it here)
  filesBlocks: number;
  chargeHeld: number;
  chargeCarried: number;
  extraHits: number;
  coreHit: number;
  coreReset: boolean;       // HOLLOW ate the Core: it is restored to CORE_RESET_INTEGRITY (EMERGENCY)
  // The kid's dropped files (by id), from the TRANSMIT screen: they stay behind and free link for charge.
  dropped: string[];
  // PICK ONE TO CARRY (§6.9, WP8): the cards dealt for this transmission (seeded, weighted by the run's
  // stats, fixed once dealt), and the one picked. The pick is mandatory: transmitNext refuses without it.
  offer: DraftCard[];
  pick: UpgradeId | null;
  // The ladder's verdict for the ship being beamed to (systems/threat-plan.ts planThreat, from run.threat after this
  // ship's tally): the PACKET's uninvited chip reads `boards` and `rootBlocks`; transmitNext builds the ship with it.
  threat: ShipThreat;
}

// 046.log's progress through the run (05 §3.2; systems/story-log.ts): kept on the run, not the segment, because the
// segment is copied through every packet. `scanned`: SCAN has read its header (it reads `046.log` from then on);
// `found`: the entries whose key was found (01 after ship 1's report, then at the boots); `read`: the entries the reader
// has typed out; `autoOpened`: entry 01 opened the reader by itself, once a run (run 1 only).
export interface RunLogState {
  scanned: boolean;
  found: number[];
  read: number[];
  autoOpened: boolean;
}

export interface RunState {
  // Bumped once per world reset (a new ship, the simulation retry, a NEW RUN): painters that keep
  // per-ship things between ticks (a trail, cached geometry, the log's divider) key on it.
  rev: number;
  phase: RunPhase;
  seed: number;             // the one entropy source; every roll is a stream of it (systems/map-run.ts shipRng, hopRng)
  unitNumber: number;       // 47 on run 1 (UNIT-047), 47 + runs after (WP8: the archive counts them)
  wave: number;             // the fleet wave: 1 on run 1, runs + 1 after
  // How the last unit's run ended, from the archive (§4.5; null on the first run): its ghost greets this
  // unit at the boot of the ship where that run ended, never ship 1 (systems/meta.ts ghostShipIndex), and HOLLOW is it
  // (hollowUnits).
  lastUnit: LastUnit | null;
  // The last unit's ghost has typed its line at a boot this run (systems/boot.ts, systems/meta.ts ghostLineDue): it speaks
  // once a run, at the first boot at or past its ship, and HOLLOW's notice after it is `> you remember me. good.`. Kept
  // across ships; false again on a NEW RUN and on the simulation retry.
  ghostSpoken: boolean;
  // Who HOLLOW is on this run (§4.5's table, systems/meta.ts hollowUnitsAfter): [46] on run 1, the last unit
  // after most endings, both after a MERGE. Its blocks read `UNIT-046` once it has said who it is.
  hollowUnits: number[];
  // The last run ended in a MERGE (§4.5, WP11): this unit came with the one it merged with, so its Core starts with
  // MERGE_BONUS_CORE_CAPACITY threads and the screen keeps a faint shimmer for the whole run (MERGE_CORRUPTION_FLOOR).
  mergeBonus: boolean;
  // The cards picked between ships this run, in order (§6.9, WP8): the Skills window lists them.
  upgrades: UpgradeId[];
  // This run plays the run-1 lessons and the written ARES-VII (systems/meta.ts playsTutorial): no unit before
  // it flew ARES-VII through (the archive's tutorialDone). Not the wave: a run left two seconds in counts as a
  // wave but taught nothing, so the next one still gets the STASIS step and the ENGINE I/O lesson.
  tutorial: boolean;
  // The unit's position on the route (depth − 1): 0 on ship 1 (the tutorial checks). Which ship that is lives in
  // `map` (systems/map-run.ts currentShip); on the classic world it is also the slot.
  shipIndex: number;
  // The run's map (phase 3 slice 3a, types/map.ts): the world, the arm, the route so far, the galaxy year.
  map: RunMapState;
  // The fs-tools ARRIVAL CONTROL has licensed this run (§3.2, §6.5). A licence installs the tool's
  // files once; they carry with the unit, so a licence is never issued twice.
  licences: FsToolKind[];
  // HOLLOW has said who it is (`> i was 046.`, on the ship it arrives on since phase 3 slice 2; the ghost names nothing):
  // its blocks and its TERMINAL lines carry its unit name instead of `???` from then on (say.ts hollowLabel).
  // Carried to every later ship.
  hollowNamed: boolean;
  // HOLLOW ate the AI Core to 0 (§3.3 C5): this ship is over (the clock stops under its card, then
  // EMERGENCY TRANSMIT or, on the last ship, OVERWRITTEN).
  coreLost: boolean;
  // AUTOBURN.skl (WP9, §6.10): how many manual captures it was last trained on (installed or retrained at a
  // boot); null until it first installs. A later boot retrains it when there are more.
  skillTrainedOn: number | null;
  // The ship whose boot reissued REPAIR (WP12, the lead's ruling of 2026-10-21 06:20): the unit arrived with no
  // working copy of it, so ARRIVAL CONTROL renewed the licence (systems/licences.ts renewRepairAtBoot); CONTROL says
  // so once that ship's flight starts. null until it happens.
  repairRenewedOn: number | null;
  ships: ShipResult[];      // every finished ship, in order
  stats: RunStats;
  // REPAIR CHARGE the last ship's stars pay on arrival at the next (+6 per ★, §4.4), set at its end.
  pendingStarCredit: number;
  pendingStars: number;
  // Run 1, ship 1: the first crash is "a simulation" and ship 1 restarts once (§4.3).
  simulationRetryUsed: boolean;
  beamOut: BeamOutState | null;
  transit: TransitPlan | null;
  arrival: ArrivalReport | null;
  endCause: RunEndCause | null;
  // The threat ladder's memory (phase 3 slice 2, 04 §3.7–§3.9; systems/threat-plan.ts): TRACE, whether HOLLOW is aboard
  // and for how many ships, what it was fed. During a ship it already counts that ship (its plan applied).
  threat: RunThreatState;
  // 046.log's progress (05 §3.2).
  log: RunLogState;
}

// --- HOLLOW (systems/hollow.ts, §6.6) -----------------------------------------------------------

// asleep: not yet woken (ship 1 until the loop first closes, later ships until boot + n s).
// awake: it bites (every spreadEverySec, if it spreads at all) and eats what it bit.
// dormant: ship 1 after its one scripted bite was decided: it has noticed you, and waits.
export type HollowPhase = 'asleep' | 'awake' | 'dormant';

// Ship 1's story beat after the first fight (`> ...047?`, then CONTROL): 'pending' from the moment
// the fight is decided until both lines are said and CONTROL's has had time to be read. The landing
// holds the LANDING REPORT meanwhile, so a driver eaten (or saved) last never has its beat land under
// the report.
export type HollowStory = 'none' | 'pending' | 'told';

export interface HollowState {
  cfg: HollowDef;            // this ship's HOLLOW, from the threat ladder's verdict (ShipThreat.hollow; like `level`)
  phase: HollowPhase;
  story: HollowStory;
  // Ship 1's scripted fight ('loop-closed-once'): the file its one bite infected, from the bite until the fight is
  // decided (cured, or eaten: then `story` turns 'pending'). The LANDING REPORT waits for it (selectors scriptFightOpen),
  // so END LANDING before the fight is decided still lets `> ...047?` land before the report; in state so a save carries
  // it. null on every other ship. (update)
  scriptTargetId: string | null;
  // AI seconds to the next bite (`NEXT BITE m:ss` on every hollow block): one global timer. null
  // while it is not awake or on a ship whose HOLLOW does not spread (ship 1: `NEXT BITE ?:??`). (mutate)
  biteInSec: number | null;
  // Ship 1 ('loop-closed-once'): the AI second its scripted bite lands, set the first time the true
  // path closes (HOLLOW_SCRIPTED_BITE_DELAY_SEC later); null until then. (mutate)
  wakeAtAi: number | null;
  // Seeds (WP9, §6.6; ShipDef hollow.seed): AI seconds to the next seed's telegraph (null while it does not
  // seed: asleep, or a ship without seeds), the telegraph running now, how many seed moments have come (one
  // with nowhere to land counts too: SKIP waits for the first, pace.ts), and how many have landed. (mutate)
  seedInSec: number | null;
  seedTelegraph: SeedTelegraph | null;
  seedMoments: number;
  seedsLanded: number;
  // A timed wake waits while a debris dodge is open on the true path, and WAKE_AFTER_DODGE_SEC after it closes (WP9
  // review round 2, the lead's ruling: nothing outranks the dodge line while the dodge is open): whether it is held
  // this tick, and the AI second the last hold ended (null: never held on this ship). (mutate)
  wakeHeld: boolean;
  wakeHoldEndedAtAi: number | null;
  // THE DEAL (WP10, VESPER; systems/hollow-deal.ts): HOLLOW's one offer on a ship whose HOLLOW deals. (update)
  deal: DealState;
  // HOLLOW's verbs (WP11, LAST LIGHT; systems/hollow-verbs.ts): AI seconds to the next one's telegraph (null on a ship
  // without verbs, or while HOLLOW sleeps; it stands still while the flight is at TACTICAL, so a verb never lands under
  // a burn's lines), the one counting down now, and how many have come, landed and been blocked on this ship (SKIP
  // waits for the first: the coast is its stage). verbTelegraphs counts the verbs actually telegraphed (a turn HOLLOW
  // skipped is a moment, not a telegraph): the first one counts down from VerbDef.firstTelegraphSec. A new ship (and so
  // a NEW RUN) starts it at 0 with the rest of HollowState. (mutate; the telegraph's start and end are updates)
  verbInSec: number | null;
  verb: VerbTelegraph | null;
  verbMoments: number;
  verbTelegraphs: number;
  verbsLanded: number;
  verbsBlocked: number;
  // The tools licensed on this ship that the kid has not used here yet (the lead's WP11 TODO, WP10 question 3): HOLLOW's
  // seeds never hunt their files and its RM never takes them, so a kid can't lose a tool before ever trying it (VESPER's
  // first seed used to land beside Swap, licensed last, on the ship that teaches SWAP). Repair is never in it: it is the
  // COPY lesson's target. Filled by licences.ts, emptied by the kid's first op with each (state/actions.ts). (update)
  untriedTools: FsToolKind[];
  // Where HOLLOW last bit each pod's driver on this ship, and how many times in a row it bit it there (WP11 review, the
  // lead's ruling of 21:30): a driver bitten again in the same spot is in a trap a REPAIR alone never ends (the drivers
  // in the root's GAPs, bitten every 12 s on LAST LIGHT), so the strip asks to MOVE it behind a WALL before it is
  // bitten there again (data/script.ts). A driver that moved starts over. (update, on a bite)
  bitesAt: BiteSpot[];
  // LAST LIGHT's finale (WP11, systems/finale.ts). (update)
  finale: FinaleState;
  // AI seconds of calm flight on this ship (phase 3 slice 2): the clock a calm-only wake counts (HollowWake calmOnly, the
  // seeds-only config's first bite, 04 §3.5). It stands still at TACTICAL, as the first seed's clock does. (mutate)
  calmAiSec: number;
  // A verb telegraphed `unlink` on Repair's last spare on this ship (the review's minor 5, systems/hollow-verbs.ts): the
  // COPY lesson's moment on the fixed five (state/threat-selectors.ts copyLessonDue), latched for the ship so the lesson
  // can follow the verb's BLOCK IT line. (update, at the telegraph)
  unlinkedLastSpare: boolean;
}

export interface BiteSpot {
  pod: number;
  addr: number;
  count: number;
}

// HOLLOW's two verbs on LAST LIGHT (§6.6): MV relocates one of its blocks next to a WALL by your colonists; RM deletes
// one of your spare files. The ids are the design's; on screen RM is `unlink` (data/hollow-text.ts VERB_COMMAND).
export type VerbKind = 'mv' | 'rm';

// A verb counting down in the TERMINAL (`> unlink repair.bak ... 3`) before it lands (§6.6: the telegraph). `targetId`
// is the file it aims at (RM) or the hollow block it moves (MV, to `toAddr`: only an MV has a landing spot, so the two
// kinds are told apart by type, never by a sentinel); any op started on the target meanwhile blocks it (`BLOCKED`).
// `targetWord` is its name in HOLLOW's echo, `targetLabel` on the strip. `totalSec` is the countdown it started from (the
// ship's first verb counts from VerbDef.firstTelegraphSec, every later one from telegraphSec), `leftSec` what is left.
interface VerbTelegraphBase {
  targetId: string;
  targetWord: string;
  targetLabel: string;
  totalSec: number;
  leftSec: number;
}

export type VerbTelegraph =
  | (VerbTelegraphBase & { kind: 'rm'; toAddr: null })
  | (VerbTelegraphBase & { kind: 'mv'; toAddr: number });

// LAST LIGHT's finale (§6.6, §9 WP11 items 4–5). none: the root is still LOCKED (or this is not the flagship).
// duel: the orbit is locked or accepted and the root is open: DELETE THE ROOT (a ROOT_DELETE_SEC op while its verbs come
// every duelEverySec). choice: the root is gone, one last block is left, and HOLLOW has stopped (no bites, seeds or
// verbs): PURGE or MERGE. purged / merged: the kid chose. unresolved: the landing ended with the root alive and nothing
// left to delete it with (§4.3 UNRESOLVED). The LANDING REPORT waits while the duel or the choice stands.
export type FinalePhase = 'none' | 'duel' | 'choice' | 'purged' | 'merged' | 'unresolved';

export interface FinaleState {
  phase: FinalePhase;
  // MERGE's restoration (plan risk 9; 01-landing §3.17 is slice 7): the pods whose eaten drivers turned back into
  // drivers in place (their pods launch again), and the pods whose blocks were gone (moved away by the kid's DELETE, or
  // MV'd and deleted): those stay parked, restorable, for slice 7's last landing.
  restoredInPlace: number[];
  restoredHalf: number[];
  // WP11 part 2: the typed ending the choice brought (FinaleChoice types it over the screen), and the AI second until
  // which it holds the LANDING REPORT back (finalePending): its lines have typed and been read. null before the choice
  // (and after an UNRESOLVED end, which has no typed ending). Written in the same update as the choice's phase, so no
  // listener ever sees a chosen finale without its ending.
  ending: FinaleEnding | null;
  // UNRESOLVED's last line (`> you can't delete me now. i'll come with you.`) holds the LANDING REPORT back until this AI
  // second: it has typed in the TERMINAL and been read (WP11 review: the report used to cut it off mid-word). null
  // before an UNRESOLVED end.
  unresolvedUntilAi: number | null;
}

// One line of a typed ending (§9 WP11 item 5), by who says it: `cmd` the TERMINAL's echo of the choice, `us` the merged
// unit (MERGE's `> hi. it's us.`), `story` the narration (`the fleet is home.`), `control` ARRIVAL CONTROL's verdict.
export type EndingVoice = 'cmd' | 'us' | 'story' | 'control';

export interface EndingLine {
  voice: EndingVoice;
  text: string;
}

// `startAi` is the AI second its first line begins to type (FinaleChoice types every line to finaleEndingLineStartsSec
// from there, on AI time: the card can neither fall behind nor be cut off by the report, and pause holds both).
export interface FinaleEnding {
  choice: 'purge' | 'merge';
  lines: EndingLine[];
  startAi: number;
  untilAi: number;
}

// none: not offered yet. offered: the choice stands in the TERMINAL with its timer. done: answered, timed out or
// invalidated: never offered again on this ship.
export type DealPhase = 'none' | 'offered' | 'done';

export interface DealState {
  phase: DealPhase;
  // The named pod (its driver is the one at that front): its number, its driver's segment and where it was when the offer
  // was made. Moving it (a MOVE starting on it, or it no longer standing at that address) invalidates the offer, as
  // launching or losing it does.
  pod: number | null;
  segId: string | null;
  startAddr: number | null;
  // The TERMINAL line that carries the choice (say.ts sayChoice), while it stands.
  entryId: number | null;
  // What the answer bought, in AI seconds: ACCEPT, no bites and no seeds until pauseUntilAi; REFUSE (or the timer), the
  // bite interval shortened until hasteUntilAi.
  pauseUntilAi: number | null;
  hasteUntilAi: number | null;
}

// A seed about to land (§6.6: a blinking outline for SEED_TELEGRAPH_SEC): where (the 2 blocks at startAddr),
// and how long until it does. Re-aimed at the landing if the spot was taken meanwhile (systems/hollow.ts).
export interface SeedTelegraph {
  startAddr: number;
  size: number;
  leftSec: number;
}

export type AlertLayer = 'ship' | 'mind';
export type AlertSeverity = 'info' | 'warn' | 'alarm';

export interface Alert {
  id: string;
  layer: AlertLayer;
  severity: AlertSeverity;
  text: string;
  inhibitsSkip: boolean;
}

// Append/remove in place, then bump rev (subscribers select s.alerts.rev). Empty in WP1.
export interface AlertsState {
  list: Alert[];
  rev: number;
}

// --- Voice (systems/say.ts) ---------------------------------------------------------------

// Who speaks. control: ARRIVAL CONTROL; sys: ship system notices; hollow: the thing in the
// memory, in its own words (slow); hollow-cmd: its commands echoed in your TERMINAL (`> infect c12   [user: ???]`,
// its verbs' countdowns: WP11), in its pink but at the TERMINAL's pace, so LAST LIGHT's verbs every few seconds never
// fall behind what they echo; cmd: your command echoes; mind-sys: the unit's own boot and ECC lines.
export type Speaker = 'control' | 'sys' | 'hollow' | 'hollow-cmd' | 'cmd' | 'mind-sys';
// Where a line appears: the amber COMMS radio, or the blue TERMINAL inside the mind.
export type Channel = 'radio' | 'mind';

// An inline choice in the TERMINAL (sayChoice): buttons with a timer bar. leftAiSec is mutated
// per AI tick; open/picked change with update.
export interface LogChoice {
  options: string[];
  timeoutAiSec: number;
  leftAiSec: number;
  open: boolean;
  picked: string | null;   // null while open, and when it timed out
  // WP10: the key that answers each option in the TERMINAL (`Y`, `N`: a KeyboardEvent code without its `Key`), and
  // the words the ticker shows on the other screen while it stands (`WANTS A DEAL`). null: buttons only, and the
  // ticker shows the line itself.
  keys: string[] | null;
  tickerWords: string | null;
}

export interface LogEntry {
  id: number;
  speaker: Speaker;
  channel: Channel;
  text: string;
  t: number;               // clock.aiSec when it was spoken
  unread: boolean;         // spoken on the screen the kid was not looking at, not yet seen
  choice: LogChoice | null;
  // The share of the line's letters lost on the way in (0..1): a CONTROL line received while the
  // AI Comms file was failing or worse (C6). Fixed when spoken: a repair clears the next line.
  garble: number;
  // A rule between two ships (WP7: the log keeps its history across a transmission): `text` is the
  // new ship's name. Shown at once, never typed, never on the ticker.
  divider?: true;
  // WP11 part 2: a HOLLOW verb's telegraph (`> unlink repair.bak ... 3`): the TERMINAL counts its number down live from
  // hollow.verb while the verb stands, with a draining bar under it, and greys it out once the verb has ended.
  verbCountdown?: true;
  // WP11 part 2: how the TERMINAL colours a line beyond its speaker: a verb BLOCKED is a win ('good'), one that landed
  // is a loss ('danger').
  tone?: LineTone;
}

export type LineTone = 'good' | 'danger';

// Appended in place by say.ts (update), then rev bumps. Subscribers select s.log.rev.
export interface LogState {
  entries: LogEntry[];
  rev: number;
}

// --- Director (systems/director.ts) ----------------------------------------------------------

export type Urgency = 'now' | 'soon' | 'wait';
export type GuideLayer = 'ship' | 'mind';

// Which composition step produced the line on the objective strip (§6.3, plus the director's
// own overrides: a refused input's explanation, PAUSED, the boot, the end of the flight).
export type ObjectiveSource =
  'flash' | 'paused' | 'boot' | 'over' | 'alarm' | 'flight' | 'mind-urgent' | 'tutorial' | 'hint' | 'landing';

// The one line the objective strip shows. Replaced (update) only when it changes.
export interface ObjectiveLine {
  id: string;
  text: string;              // ≤ MAX_LINE_CHARS, with [KEY] caps
  keys: readonly string[];   // controls with these data-hint-key values glow
  urgency: Urgency;
  layer: GuideLayer;         // ◆ ship or ◇ mind
  highlight: string | null;  // a data-hint-target the strip also lights (a chip, a file)
  source: ObjectiveSource;
  // The line's countdown is about to run out (guidance FlightObjective.warn): the strip's warning colour.
  warn?: boolean;
}

export interface DirectorState {
  shown: ObjectiveLine | null;
  done: string[];            // one-shot rules and beats already completed this run
}

export interface ActiveTool {
  kind: FsToolKind;
  toolSegId: string;       // id of the fs-tool segment that owns this pickup
}

export interface PendingPlacement {
  regionSegIds: string[];  // segments forming the contiguous valid region
  col: number;             // column within that region where the new copy will start
}

export type FilterKey = 'ai' | 'ship' | 'pods' | 'filesystem' | 'free';
export type StatusKey = 'corrupt' | 'partial' | 'backup';

export interface UiState {
  mode: ViewMode;
  selectedId: string | null;
  activeTool: ActiveTool | null;
  pickedSourceId: string | null;
  pendingPlacement: PendingPlacement | null;
  // Bumped by action functions after in-place memory mutations. Subscribers
  // that need to rebuild on memory shape/state changes watch this counter
  // (with default Object.is equality) instead of using always-false equals,
  // so they don't fan out on every unrelated UI update.
  memoryRev: number;
  // Sidebar filters: which categories are currently muted. Empty = all
  // visible (default). Adding a key dims segments in that category.
  filtersOff: FilterKey[];
  // Sidebar spotlights: which statuses are pinned. Empty = no spotlight
  // (default — all segments at full opacity). When non-empty, segments that
  // don't match ANY active spotlight get dimmed.
  spotlight: StatusKey[];
  // Reduced motion for the session (§7.3): starts from prefers-reduced-motion, the header [◐]
  // flips it. Removes shake, stamp scale, flashes and pulses; never hides information. A world
  // reset for the next ship must carry it over (createInitialState's reducedMotion option).
  reducedMotion: boolean;
  // The LOG READER (phase 3 slice 2, 05 §4): open on this entry of 046.log, or closed. Opened by systems/story-log.ts
  // (entry 01 by itself after ship 1's LANDING REPORT, run 1, once) or by INSPECT on the log; the reader view
  // (components/memory-view/LogReader.ts, Track UI) draws it and closes it. A world reset closes it (createUiState).
  logReader: { entry: number } | null;
  // The ship the kid is looking at on the DESK (its slot; the SHIP CARD shows it, SET COURSE goes there), or null before
  // the first pick (phase 3 slice 3a, systems/desk.ts selectShip). A world reset clears it (createUiState).
  deskSelected: number | null;
  // The desk window open beside the chart and card (02 §3.10: R / T / I; 3b's repository and INBOX, slice 4's TRAINING),
  // or null. The PACKET's TIGHT confirm (`ARRIVE WITH NO REPAIR CHARGE?`) is the inline confirm's, not state here.
  deskWindow: DeskWindowId | null;
}

// The archive behind this page (§4.5, systems/meta.ts). 'ok': loaded (or empty) and written at the run's
// moments. 'offline': storage threw (on the load, or on a write mid-run): the game goes on, nothing is kept.
// 'corrupt': what is stored does not read as an archive; nothing is written over it until the kid chooses.
// 'without': the kid chose PLAY WITHOUT ARCHIVE. 'none': a headless world with no archive opened.
export type ArchiveStatus = 'ok' | 'offline' | 'corrupt' | 'without' | 'none';

export interface ArchiveState {
  status: ArchiveStatus;
}

export interface GameState {
  mission: MissionMeta;
  memory: Segment[];
  clock: ClockState;
  burn: BurnState;
  orbit: OrbitVecState;
  level: LevelState;
  run: RunState;
  alerts: AlertsState;
  log: LogState;
  director: DirectorState;
  // The ship's pods and their landing (01-landing; systems/landing.ts): replaces phase 2's souls and printer.
  landing: LandingState;
  hollow: HollowState;
  hazards: HazardsState;
  ui: UiState;
  // Lives across every world reset (it is the page's, not the ship's or the run's).
  archive: ArchiveState;
  // Running fs-tool ops live in systems/ops-core.ts (module state, reset with the world): their
  // closures hold live segment references that a store snapshot could not.
}
