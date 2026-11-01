# Slice 1a implementation plan: landing replaces printing on the five ships

Written by the architect agent, reviewed by the lead. The spec is docs/phase3/01-landing.md (§ numbers below are its own), and docs/phase3/DECISIONS.md wins where the two differ. Code style is AGENTS.md's: functions and data over classes, tuning numbers in `src/data/tuning.ts` with a WHY comment, fail loudly, and comments that say WHY.

**What 1a delivers:**
- 8-block `driver` segments in place of `soul` segments.
- The bay: [L] to launch, 4 slots, a 2.0 tac s cadence and a 20 tac s reload in world time.
- The pod arc and the drop dot.
- Pre-set landing zones (LZs) on each ship.
- Scoring per §3.9, and the stars with ★ ON TARGET and FUEL judged at the end of the landing.
- Parking pods in orbit (§3.10).
- The LANDING REPORT.
- The landing guidance table, rows L0–L7 and L11–L13.
- Pace and SKIP to windows (§3.12).
- The GROUND TRACK panel and the POD BAY window.
- The pooled receiver block (§3.16, with no memory classes).
- The removal of printing, the reveal and the WAKE REPORT.

Every ship stays FULL (384 blocks). The phase-2 HOLLOW stays on all five ships (04-threats §8 slice 1: "HOLLOW eats drivers… the five ships keep their phase-2 HOLLOW").

**Lead decisions on §6's risks (2026-10-29).** All 19 recommendations are adopted as written. In particular: no engine
in LANDING in 1a (1b opens it); KESTREL / VESPER / LAST LIGHT keep 12 / 12 / 16 pods; forgiveness classes come into 1a
as data plus one lookup (Brine HARSH, Cinder ROUGH), no-go arcs stay 1b; LAST LIGHT takes §3.16's final-ship layout and
boss-sim is re-measured (fall back to the phase-2 geometry only if the root duel or MERGE collapses); a landing with no
driver left ends itself after 6 s; MERGE restores eaten drivers in place until slice 7. Any of these that turns out to
hurt the game is raised to Fran, per `DECISIONS.md`.

**Process.** Foundation (F1, F2) first, then an architecture review of it, then Tracks SIM, UI and TESTS in parallel
with the file ownership in §4, then TESTS phase 2, a full review and one e2e run. The unit tier stays under the
runner's 300 s (the baseline before slice 1a: 130 suites in 263 s on 4 workers), so new suites replace old ones rather
than add to the total.

---

## 1. Architecture

### 1.1 Module map (new modules in bold)

| Module | Kind | Responsibility |
|---|---|---|
| **`src/types/landing.ts`** | types | Every landing type (§1.2). Depends on nothing but `types/orbit` and `types/segment`. |
| **`src/systems/landing-solve.ts`** | pure math | The pod kick, the pod arc, the dot's track over one orbit, each LZ's window times, and the drop width. Kepler only, no store. |
| **`src/systems/landing-rules.ts`** | pure, reads `GameState` | `isLaunchable`, the launch queue (LOAD NEXT), BAY/NEXT membership, LZ fill, `classifyLanding`, `podPoints`, `launchRefusal`, `launchGuard`, `dropFactors`, `landingResult`, `onTargetTally`, `colonyName`. Shared by SIM, UI and the tests. |
| **`src/systems/drop-cache.ts`** | stateful, tiny | `mountDropCache`, `getDropSolution()`, `currentDropSolution()`. It caches `computeDropSolution` per world, orbit epoch and rounded elements, and refreshes at `PREDICT_HZ`, like predict.ts. It imports only landing-solve, landing-rules, capabilities, clock and reset, so hollow.ts and pace.ts can read it without the import cycle that `tests/unit/wp12/fix1/entries.test.ts` guards (guidance → pace → hollow → printer → script → flight-controls → guidance). |
| **`src/systems/landing.ts`** | stateful mount (replaces printer.ts) | Owns everything listed in §1.4. |
| **`src/systems/landing-controls.ts`** | input | Registers [L] (`KeyL`) with hooks `{ confirm(text, onYes) }` that main.ts wires to `askInline`. [L] pressed in blue plays `buzz` and flashes `SHIP SCREEN`. `KeyG` is reserved for AUTODROP v2 (slice 4c), with a comment and no binding. |
| **`src/systems/landing-guidance.ts`** | pure | `LandingContext`, `buildLandingContext(state, sol)` and `landingObjective(ctx)`, the §3.11 table. A separate file rather than guidance.ts, so the files stay disjoint and the import cycle stays out; guidance.ts re-exports it. |
| **`src/systems/landing-report.ts`** | pure model (replaces wake-report.ts) | `landingReportModel(state)`. It reuses `creditsOf`, reshaped per pod. |
| **`src/systems/landing-hud.ts`** | pure UI models | `bayWindowModel`, `groundTrackModel`, `plotLandingModel` (brackets, dot, arc, streaks, landing marks, beacons), `podTags` (BAY/NEXT), `footerPods`, `miniHudLanding` (`★ ON TARGET 5/6`). |
| **`src/data/landing-text.ts`** | text | Every landing word in the spec as a placeholder (05-story owns the final wording). It imports no systems, so nothing on the cycle pulls in script.ts. |
| **Components** | UI | `src/components/tools-view/PodBayWindow.ts`, `src/components/tools-view/GroundTrack.ts`, `src/components/run/LandingReport.ts` (replaces WakeReport.ts), `src/components/memory-view/LaunchFx.ts` (PrintFx reused as the launch flash). |

**Pure versus side effects.** The math, the rules, the guidance table and the report model are all pure: tested without a store and safe to call from any system. Only landing.ts and landing-controls.ts change state. Only drop-cache.ts holds a cache.

### 1.2 Type sketches (`src/types/landing.ts`)

```ts
export type LzWidth = 'wide' | 'standard' | 'narrow';            // km in tuning LZ_WIDTH_KM
export type ForgivenessClass = 'gentle' | 'rough' | 'harsh';
export type LzGround = 'flat';                                   // SURVEY (slice 6) adds 'rocky' | 'wet'
export type TerrainWord = 'PLAINS' | 'GRASSLAND' | 'OCEAN' | 'VOLCANIC';

// Data: ShipDef.landing. The map's roller (slice 3) returns exactly this type.
export interface LzDef { label: string; centreDeg: number; width: LzWidth; pods: number }
export interface NoGoArcDef { centreDeg: number; widthDeg: number; word: string }   // 1b fills; [] in 1a
export interface ShipLandingDef {
  lzs: readonly LzDef[];
  forgiveness: ForgivenessClass;
  terrain: TerrainWord;
  noGo: readonly NoGoArcDef[];
  colonyFirstRun: string | null;   // RIVERSIDE (ARES-VII), FIRST LIGHT (LAST LIGHT) on the tutorial run
  drag: boolean;                   // read by 1b; false on layer 1
}

// Runtime: copied from the def at ship build and never re-read from SHIPS. SURVEY edits these in place.
export interface LzState { label: string; centreRad: number; halfWidthRad: number; widthKm: number; pods: number; ground: LzGround }
export interface NoGoArcState { centreRad: number; halfWidthRad: number; word: string }

export type Place = 'lz' | 'mislanded' | 'off-site' | 'no-go';
export type Touch = 'soft' | 'hard';
export type ParkReason = 'eaten' | 'dead' | 'no-time';
export type DriverLoss = 'eaten' | 'dead';                         // eaten by HOLLOW, or taken to 0 by a zone
export type LaunchSource = 'player' | 'autodrop' | 'resident' | 'merge';

export interface LaunchRecord {
  atTSec: number; atAi: number; source: LaunchSource;
  launchRadius: number; dotRad: number; halfWidthKm: number;
  landingRad: number;                // decided at launch: dot + u × s, u from childRng(seed, ship, 'drop')
  touch: Touch; driverIntegrity: number;
  arc: Vec2[];                       // the fixed streak path, world km
  descentSec: number;                // AI s: POD_DESCENT_SEC, or POD_FIRST_DESCENT_SEC for run 1's first pod
}
export interface Touchdown { place: Place; lz: string | null; points: number; missKm: number | null; atAi: number }
export type PodFate =
  | { kind: 'aboard' }
  | { kind: 'falling'; launch: LaunchRecord }
  | { kind: 'down'; launch: LaunchRecord; touchdown: Touchdown }
  | { kind: 'parked'; why: ParkReason; restorable: boolean }   // restorable: driver eaten → MERGE (slice 7)
  | { kind: 'not-launched' };
export interface PodRecord {        // one per pod for the whole ship; a pod outlives its driver
  pod: number; family: string; colonists: number; featured: Colonist[];
  driverLost: DriverLoss | null;
  fate: PodFate;
}
export interface BayState { loaded: number; reloadTac: number; cadenceLeftTac: number }
export type LandingEnd = 'all-launched' | 'end-landing' | 'no-driver-left';

export interface LandingState {     // GameState.landing; replaces souls + printer
  lzs: LzState[]; noGo: NoGoArcState[]; forgiveness: ForgivenessClass; terrain: TerrainWord; drag: boolean;
  finalShip: boolean;               // ShipDef.flagship, copied: L0 and the finale's wait
  lead: number;                     // the story pod: credits first, the scripted bite's target on ARES-VII
  hurt: number[];                   // pods built hurt (run 1's POD 02)
  colony: string | null;            // named at the first touchdown
  pods: PodRecord[];
  bay: BayState;
  loadNext: number | null;
  startedAtTSec: number | null;     // set at ORBIT LOCK or ACCEPT
  ended: LandingEnd | null;
  lingerAiSec: number | null;
  fuelAtEndPct: number | null;      // the FUEL star (§3.9)
  orbitEpoch: number;               // bumped on a discrete orbit change (1b drag kick, later burns): a drop-cache key
}

// The drop solution (computeDropSolution, cached by drop-cache.ts)
export interface DropFactors { sensor: number; plotter: number; driver: number }   // all 1 in 1a
export interface DropDot { rad: number; halfWidthKm: number; launchRadius: number; inBand: boolean }
export interface LzWindow {
  lz: string;
  openInSec: number; closeInSec: number;                     // game s from asOf; open ≤ 0 means open now
  sureOpenInSec: number | null; sureCloseInSec: number | null;  // null: the whole dot never fits
  launchRadius: number; halfWidthKm: number; inBand: boolean;   // at the window's middle
}
export interface DropSolution {
  asOfTSec: number; periodSec: number;
  block: 'no-solution' | null;      // Nav Plotter dead or missing (L1)
  dot: DropDot | null; arc: Vec2[]; windows: LzWindow[];     // windows sorted by openInSec
}

// The launch path: the player and every future controller share it
export interface LaunchIntent { source: LaunchSource; pod?: number; confirmed?: 'off-site' | 'full' }
export type LaunchRefusal = 'NOT LANDING' | 'LANDING OVER' | 'PAUSED' | 'SHIP SCREEN' | 'ENGINE FIRING'
  | 'NO DROP SOLUTION' | 'OUT OF THE LAUNCH BAND' | 'NO POD READY' | 'RELOADING' | 'BAY EMPTY';
export type LaunchResult =
  | { kind: 'launched'; pod: number }
  | { kind: 'refused'; reason: LaunchRefusal }
  | { kind: 'confirm'; ask: 'off-site' | 'full'; points: number; text: string };
export interface LandingView {      // §3.14: everything AUTODROP may read
  solution: DropSolution; bay: BayState & { cadenceTac: number; shown: number };
  queue: number[]; remaining: Record<string, number>; aboard: number; falling: number;
}
export interface LandingController {   // AUTODROP (4c), the resident (5), MERGE's landing (7)
  source: Exclude<LaunchSource, 'player'>;
  holdsTactical: boolean;              // §3.14: a higher version may drop inside a SKIP
  launchesFromMind: boolean;
  decide(view: LandingView, state: Readonly<GameState>): LaunchIntent | 'skip' | null;
}

// The per-ship result (§5 "To 02"): flat and JSON-safe, ready for slice 3's save
export interface LzResult { lz: string; count: number; landed: number; mislanded: number; hard: number }  // colonists
export interface PodSummary { pod: number; family: string; colonists: number; fate: PodFate['kind'];
  place: Place | null; lz: string | null; touch: Touch | null; points: number; parkedWhy: ParkReason | null; restored: boolean }
```

**Driver segment** (`src/types/segment.ts`; `SoulSegment` and `'soul'` are deleted):

```ts
export interface DriverSegment extends SegmentBase, Infectable {
  type: 'driver'; integrity: number; state?: SegmentState;
  pod: number;            // 1-based, numbered in address order when memory is built
  family: string; colonists: number; featured: Colonist[];
}
```

- The segment name is `POD 03 · OKAFOR` and the id is `driver_pod03`.
- `podCode(n)` gives `POD 03`; `podTag(n)` gives `pod03` for TERMINAL echoes.
- The role `'printer'` becomes `'bay'`.

**Schema changes** (`src/state/schema.ts`):
- `RunPhase`: `'printing'` becomes `'landing'`; `'report'` stays and now means the LANDING REPORT.
- Delete `RevealCause`, `RevealStage`, `RevealState`, `ClusterOutcome`, `ClusterResult`, `SoulsState` and `PrinterState`.
- `GameState.landing: LandingState`.
- `MissionMeta.souls` becomes `colonists`.
- `HollowState`: `revealOwed` goes; `deal.cluster` becomes `deal.pod: number | null`; `BiteSpot.cluster` becomes `pod`; `HollowSegment.ateCluster` becomes `atePod?: number`; `finale.restoredInPlace` and `finale.restoredHalf` become `number[]`.
- `RunStats.clustersLost` and `clustersBitten` become `driversLost` and `driversBitten`. The archive stores only moves and deletes, so this rename is safe.
- `ObjectiveSource`: `'printing'` becomes `'landing'`. `FilterKey`: `'souls'` becomes `'pods'`.
- `ShipResult`:

```ts
interface ShipResult {
  shipId: string; shipName: string; slot: number; depth: number;   // 1a: slot = shipIndex, depth = shipIndex + 1
  outcome: ShipOutcome; colonistsAboard: number;
  lzs: LzResult[]; offSite: number; noGo: number; restored: number;
  parked: { pod: number; why: ParkReason }[]; notLaunched: number;
  landedInLz: number;   // colonists in an LZ with room, soft or hard (the headline; runLanded)
  points: number; stars: number; fuelLeftPct: number; ringMiss: RingMiss | null;
  colony: string | null; pods: PodSummary[];
}
```

**Events** (`src/systems/events.ts`):
- Deleted: `reveal-line`, `souls-unsealed`, `crack-shown`, `reveal-done`, `cluster-printed`.
- Added: `landing-start {}`, `window-open {lz}`, `window-sure {lz}`, `window-closed {lz}`, `pod-launched {pod, source, segId}` (emitted before the driver leaves memory so the chip can flash), `pod-entry {pod}`, `pod-landed {pod, place, lz, touch, points, firstOnShip, firstOfRun}`, `lz-full {lz}`, `all-pods-down {}`, `pods-parked {count}`, `landing-ended {reason}`.
- `countdown-beep.kind` gains `'window'`.
- `hollow-infect.soul` and `hollow-consume.soul` become `driver`.

### 1.3 Ship data shape (`src/data/ships.ts`, `src/data/memory.ts`)

- `ShipDef.landing: ShipLandingDef` (new). `ShipDef.printBaseSec` goes.
- `ShipMemoryDef.racksBD` becomes `podRacks: { B: string; C: string; D: string }`. Tokens: `P` is an 8-block driver (it replaces `C`), plus `R`, `Rn` and `_n` as before. Keep the rack letter as the key so slice 3 can make the field `Partial`.
- `ShipMemoryDef.souls` becomes `drivers: { familiesSeedStream; hurt: readonly { pod: number; integrity: number }[]; lead: number; firstRun: ScriptedRoster | null }`. `sealed` goes. `hurt` becomes a list so slice 2's rolled damage needs no type change.
- `HollowDef.printMult` becomes `landMult`. `validateHollowDef` already takes `max(burnMult, printMult)`; keep that with landMult.
- New validators, run at module load:
  - `validateLandingDef(id, def, pods)`: counts sum to the pods; at most 16 pods; labels unique; every bracket at least `LZ_MIN_GAP_DEG` (12) apart edge to edge, with wraparound; centres in [0, 360).
  - `validatePodRacks(ship)`: the pod racks hold at least `POD_RACK_MIN_FREE` (40) free blocks, not counting free tokens of fewer than `WALL_MIN_BLOCKS` next to an `R`; at least `UNIT_TAIL_BLOCKS` (24) trailing free in the last pod rack; driver count equals the sum of LZ pods.
  - The roller (slice 3) reuses `validateLandingDef`.
- `memory.ts`:
  - `parseRackLayout` accepts `P`.
  - The builder creates `DriverSegment`s.
  - `shipColonists(ship)` is the sum of LZ pods × `COLONISTS_PER_POD`.
  - `rackDTrailingFree` becomes `lastPodRackTrailingFree(ship)`.
  - `hurtClusterFor` becomes `hurtDriversFor`.
  - In `RACK_A`, `printer` becomes `{ id: 'bay', name: 'Bay Ctrl', role: 'bay', size: 6 }`. Its 1a description must be honest: "Runs the pod bay's launch rails." Do not claim a damage effect until 1b. Stasis keeps its 4 blocks with a new description ("Keeps the pods' sleepers cold. No flight effect.").

### 1.4 What `landing.ts` does

**Mount and reset.** `mountLanding(store)` registers an AI tick, a game tick and a world reset. The reset clears the `'drop'` rng, the controller and the window-edge memory.

**Game tick (world time).** The bay: `cadenceLeftTac -= dt/tacWarp`, and while `loaded < BAY_SLOTS`, `reloadTac` accrues until `BAY_RELOAD_TAC`, then `loaded++`. The bay is world-time on purpose: SKIP refills it, and OVERCLOCK stretches it.

**AI tick:**
1. Touchdowns: `falling` pods whose `atAi + descentSec ≤ aiNow` call `touchDown`.
2. Window-edge events, and the `countdown-beep` 5…1 before a window.
3. The controller hook (none in 1a).
4. The end check: when no pod is aboard or falling, or `ended` is set, set `lingerAiSec = LANDING_DONE_LINGER_SEC`. Hold it while `hollow.story === 'pending'` or `finalePending(state)`. Then `phase = 'report'` and record `fuelAtEndPct`.
5. The `no-driver-left` auto-end (risk 7).

**`requestLaunch(store, intent)`.** This is the only path that launches:
1. `launchRefusal(state, sol, intent.source)`.
2. `launchGuard` asks for confirmation unless `intent.confirmed` is set.
3. Pick the pod: `intent.pod`, else `nextToLaunch`.
4. Draw `u` and build the `LaunchRecord`.
5. Abort any op on the driver.
6. Emit `pod-launched`, then `replaceRange` → free and `mergeAdjacentFree`.
7. One `store.update`: set the fate to `falling`, spend the bay (`loaded--`, `cadenceLeftTac = cap.bay.cadenceTac`), clear `loadNext` and the selection if they pointed at this pod, bump `memoryRev`.
8. Echo `> launch pod03 ... LZ-A`.

**`touchDown`.** Classify against the projected fill, score with `podPoints`, and write the fate as `down` (fill is counted in touchdown order). Emit `pod-landed` and `lz-full`. Echo `> pod03 ... LANDED`. On the ship's first touchdown, name the colony with `colonyName` and say the radio line.

**Other exported functions:**
- `setLoadNext(store, pod)`: toggles, as PRINT NEXT did.
- `endLanding(store)`: END LANDING, after the UI's inline confirm.
- `parkAboard(draft, outcome)`: used by run.ts for in-orbit endings.
- `setLandingController(ctrl | null)`: the seam for later slices.
- `landingView(state)`.
- `forceLandAll(store)`: dev and tests only. It lands every pod into an LZ with room, soft, through `touchDown`.

### 1.5 Pure computations

**`landing-solve.ts`** (pure; all angles in world radians, CCW-positive, and it must handle `h < 0` by sign):
- `podKickState(state, mu, aimRp)`: scales the velocity along its own direction by `k` so that the pod's rp equals `POD_AIM_RP_FRAC × R`. Bisection on `k ∈ (0, 1)`; throw if it does not converge.
- `podImpact(podState, mu, R)`: returns `{ rad, tofSec }` by taking the inbound root of `r(ν) = R`.
- `podArc(shipState, mu, R, aimRp, n)`: `POD_ARC_POINTS` points from the launch to the impact.
- `dropHalfWidthKm(launchRadius, R, f: DropFactors)` returns `DROP_KM_PER_1000 × (r − R)/1000 × f.sensor × f.plotter × f.driver`.
- `dotTrack(conic, R, aimRp)`: `DROP_SOLVE_SAMPLES` samples over one period (time from periapsis, ship radius, unwrapped dot angle). This is the expensive part, cached by the epoch key.
- `windowsFor(track, tauNow, lzs, factorsAt, ring, R)`: scans one period from `tauNow` for crossings of `|wrap(θ − c)| = halfW` (open and close) and `= halfW − s/R` (sure), then refines each crossing by bisection on exact evaluations (at most 20 iterations).
- `computeDropSolution(input)`: combines the above. It throws in dev if the orbit is not closed during landing.

**`landing-rules.ts`** (pure):
- `isLaunchable(d)`: not infected, not `operating`, not transferring, repairing or offline, and integrity ≥ `BAND_FAILING_MIN` (25).
- `driverTouch(integrity)`: the failing band is `hard`.
- `launchQueue(state)` and `nextToLaunch(state)`: LOAD NEXT first, then address order, launchable drivers only.
- `bayShown(state)`: `min(loaded, launchable aboard)`.
- `lzProjectedFill(state)`: pods down in the LZ plus pods falling whose `landingRad` lies in it.
- `classifyLanding(lzs, noGo, rad, fill)`: checks no-go first (an empty list in 1a), then the LZ (`lz`, or `mislanded` when full), else `off-site`.
- `placeValue(place, cls)` and `podPoints(place, touch, cls, colonists)`: 200 × place × touch, always a whole number.
- `launchRefusal(state, sol, source)`: in the order of the `LaunchRefusal` union.
- `launchGuard(state, sol)` returns `{ ask: 'off-site' | 'full', points } | null`.
- `dropFactors(caps, driver)`: returns all 1s in 1a.
- `canEverLaunch(state, pod)`: its driver is in memory.
- `landingResult(state, outcome)`: folds pods into `ShipResult` fields. Pods still aboard become `parked` (outcomes locked, partial, stranded or emergency) or `not-launched` (crashed, escaped or abandoned).
- `onTargetTally(state)`: soft landings in an LZ with room, over all colonists aboard. The denominator includes pods that never launched.
- `colonyName(def, firstFamily, rng, firstRun)`: per 05 §: run 1's written name; else half the time `{FAMILY} LANDING`, else a pool name. Uses `childRng(seed, ship, 'colony')`.

**`landing-guidance.ts`** (pure). The first matching row wins; no match throws in dev.

| Row | Condition | Line |
|---|---|---|
| L0 | `finalShip`, no pod aboard or falling, finale phase none or duel | `EVERY POD IS DOWN — now DELETE THE ROOT` |
| L1 | `sol.block` set | `NO DROP SOLUTION — TAB, REPAIR NAV PLOTTER` (layer mind, `repairs: 'navplot'`) |
| L2 | **1a stub:** the engine cannot fire in landing (risk 1) | Assert, and leave a comment that 1b fills it. Out-of-band windows are filtered out of "the window" and named in L13. |
| L3 | Open in-band window and its LZ is full | `LZ-A FULL — hold the pods for LZ-B` |
| L4 | Open, sure, bay ready, a pod can launch | `LAUNCH NOW — press [L] · LZ-A 1/3` |
| L5 | Open, centre in, edges out, bay ready | `LAUNCH — press [L] · WIDE DROP, some may miss` |
| L6 | Open, a pod can launch, bay not ready | `RELOADING — next pod in 0:02` |
| L7 | A window opens within `WINDOW_TACTICAL_LEAD_TAC` and a pod can launch | `GET READY — LZ-A IN 0:05` |
| L11 | A pod can't launch and nothing above applies | `POD 07 CAN'T LAUNCH — TAB, REPAIR its driver` (mind, highlights the driver) |
| L12 | Pods aboard and none can ever launch | `NO POD CAN LAUNCH — END LANDING parks them in orbit` |
| L12b | **New** (risk 6): no pod aboard, pods falling, or the linger is running | `ALL PODS AWAY · 2 FALLING` (wait) |
| L13 | Otherwise | `WAIT — LZ-B in 2:10 ▸▸ · [F] to SKIP` |

L13 adds ` · OUT OF BAND` when the next window is out of band.

### 1.6 Changes to existing systems (Track SIM)

**orbit-sim.ts**
- `endFlight`: `printsColonists` becomes `endsInOrbit`, and the phase becomes `'landing'` with `beginLanding(draft)` from actions.ts in the same update.
- `beginLanding(draft)`:
  - It overwrites `draft.level.tacticalWarp/cruiseWarp` with `LANDING_TACTICAL_WARP/LANDING_CRUISE_WARP` (§3.2). Document on `LevelState` that this is its only writer.
  - It fills the bay and sets `startedAtTSec`.
- The landing tick becomes `landingCoast(store, dtWorld)`: an exact `conicCoast` when `pace === 'skip'`, else sub-steps.
- Leave a **1b seam**: `landingKicks(state, t0, t1): Kick[]` returns `[]` in 1a. The jump splits at each kick time, and each kick bumps `landing.orbitEpoch`.
- Rename `printerReachRadius` to `bandReachRadius`.

**pace.ts** (§3.12)
- A landing branch in `choosePace`. TACTICAL when:
  - an in-band window is open, or opens within `WINDOW_TACTICAL_LEAD_TAC`;
  - a pod is falling;
  - an alarm is up;
  - a zone is close (the existing rule);
  - a controller has `holdsTactical`.
- Otherwise CRUISE, or SKIP when asked.
- `nextEvent` gains `kind: 'window'`, landing `WINDOW_TACTICAL_LEAD_TAC` before the window. The target is the next in-band window of an LZ with projected room, else any in-band window.
- New inhibitors `WINDOW OPEN` and `PODS IN FLIGHT`. `'FLIGHT OVER'` no longer applies in landing.
- Remove `SKIP_REFUSAL_COLONISTS` and `COLONISTS_HOLD_RELEASED`.
- `isOverclocked` is true in landing too.
- Rename the existing `landingInSec` to `skipLandsInSec` to avoid the name clash.

**clock.ts**: `ACTIVE_PHASES = {flight, landing}`. `isLivePhase` covers landing.

**director.ts**
- `DirectorCtx.landing: LandingObjective | null`.
- The landing composition uses the flight order with the landing line in the flight line's places: alarm, landing `now` (or a preempting tutorial), lesson lead-in, mind-urgent, tutorial, landing `soon`, hint, landing `wait`.
- Factor out `composeLive(ctx, rules, objective, source)`. The `'printing'` priority goes.

**hollow.ts**
- `drainRatePerSec(cfg, thrust, landing) = cfg.drainPerSec × Math.max(thrust ? cfg.burnMult : 1, landing ? cfg.landMult : 1)`. The spec says "the larger applies"; today's line ~745 multiplies.
- `DrainConditions.landingActive = phase === 'landing' && anyInBandWindowOpen(getDropSolution()) && nextToLaunch(state) !== null`. This is §5's definition.
- `projectedDrainPerSec` uses landMult in landing.
- Soul branches become `isDriver`: `scriptedBite`, `seedSpot`'s `touchesSoul`, `eatenName`, `bittenAgain`, the alerts, and `lostSouls` → `recordDriverLost(draft, d, 'eaten')`.
- Delete `breach`, `revealOwed` and the reveal in `advanceStory`.

**Other HOLLOW and zone files**
- hollow-deal.ts: names a pod.
- zones.ts: a driver taken to 0 is `recordDriverLost(…,'dead')` and freed.
- finale.ts:
  - The duel starts at landing.
  - UNRESOLVED means "the landing is over".
  - MERGE restores in place: the hollow block with `atePod` becomes a driver at `MERGE_DRIVER_INTEGRITY` (80); `driverLost = null`; the landing resumes (`ended = null`, `lingerAiSec = null`).
  - A pod whose block is gone is parked `why: 'eaten', restorable: true`, waiting for slice 7. Risk 9.

**Run and scoring**
- run.ts:
  - `shipResultOf` uses `landingResult`.
  - `continueAfterReport` is unchanged in shape.
  - `shipLost` treats coreLost in landing like flight.
  - In-orbit endings park pods (`parkAboard`) before the report or the card.
- run-score.ts: `runScore` = Σ points; `runWoke` becomes `runLanded` = Σ `landedInLz`; `fleetHome` stays.
- stars.ts: `locked`; `onTarget` (≥ `STAR_ON_TARGET_FRAC` 0.95); `fuel` judged on `fuelAtEndPct ?? burn.fuelPct` and requires locked.
- run-end.ts: `fleetColonists` comes from ShipDef landing.
- meta.ts: the archive's `woke` field is filled with runLanded (risk 10).
- transmit.ts: `shipColonists`.

**carry.ts (pooled receiver, §3.16)**
- `layoutCarried` packs rack E's list and rack F's list back to back from `RACK_E_START`, then the charge, then free space.
- Only when the block is longer than the 128-block receiver does it start earlier, by at most `min(UNIT_TAIL_BLOCKS, lastPodRackTrailingFree(ship))`.
- Charge that does not fit is lost loudly (`chargeOverflowLost`); files that do not fit throw.
- This change is independent of the rest of slice 1a; do it last in SIM.

**capabilities.ts**
- `printer` becomes `bay: { band; cadenceTac }`. In 1a `cadenceTac = BAY_CADENCE_TAC` whatever the band; 1b reads `BAY_CADENCE_BY_BAND`.
- New `drop: { solution: boolean; sensorFactor: 1; plotterFactor: 1 }`. `solution` is false when Nav Plotter is dead or missing; 1b fills the factors.
- `CapabilityRole` and `BAND_COPY`: `printer` becomes `bay`.

**Remaining SIM edits**
- tool-targets.ts and tool-text.ts: drivers can't be copied (`ONE POD, ONE DRIVER`) or deleted (`You can't delete a pod's driver.`); SCAN on a driver reads `NO SCAN NEEDED`.
- boot.ts and script.ts: the `'archive'` boot line goes; the host line reads `> HOST: ARES-VII · 3 PODS · 600 COLONISTS`.
- input.ts: add `KeyL` and `KeyG` to `PREVENTED_CODES`.
- script.ts:
  - Delete `SOUL_RULES`, `PRINTING_RULES`, `revealLines`, `lostSoulsLine`, `printEcho`, `COLONISTS_ASK*`, the `control-check-souls` and `control-found` beats, and FINALE's `stripWaits` rule (now L0).
  - Add `DRIVER_RULES` (the hurt-driver ask: `POD 02 WILL LAND HARD — REPAIR its driver`, both screens), a landing hint (`MIND CLEAR — press [F] to SKIP to LZ-B`), and the beats (`Lovely orbit! Let's get them down. :)` at landing start, `They're down! :)` at the first touchdown).

### 1.7 Extension points to name in code comments

| For | Seam |
|---|---|
| **1b drop width** | `dropFactors(caps, driver)` in landing-rules, and the `DropFactors` argument of `dropHalfWidthKm` and `windowsFor`. Only the factor sources change. `DropDot` gains `uncertain`. |
| **1b forgiveness and no-go** | `classifyLanding(lzs, noGo, …)` already takes `noGo`; `LandingState.noGo` is copied from the def. The class table is used in 1a already (risk 5). |
| **1b decay** | `landingKicks` in orbit-sim plus `orbitEpoch`. drop-cache keys on the epoch, and `DropSolution` gains `validUntilTSec` (the next kick). pace's `nextEvent` gains `'kick'`. |
| **1b Bay Ctrl** | `capabilities.bay.cadenceTac` from the band table; `missing` → `BAY OFFLINE` added to `LaunchRefusal`. |
| **1b GO LOWER and L8–L10** | New rows in landing-guidance. The L2 stub becomes "reuse `flightObjective` F3–F11"; the engine opens in landing (risk 1). |
| **AUTODROP (slice 4c)** | `LandingController` and `setLandingController`; `requestLaunch(intent)` with `source`; `landingView`; `reserveThread` from ops-core; [G] in landing-controls; `launchesFromMind` bypasses `SHIP SCREEN`; `holdsTactical` feeds pace. Holding [L] never repeats: the input router drops auto-repeat already. |
| **The resident (slice 5)** | The same controller with `source: 'resident'`. |
| **MERGE's last landing (slice 7)** | `PodFate.parked.restorable`, `PodSummary.restored`, the `'merge'` source. Slice 7 adds `LandingState.mode`, a blind-drop option in the intent, and `BLIND_MARGIN_KM` / `BLIND_DROP_MULT`. |
| **SURVEY (slice 6)** | The runtime `landing.lzs` (`LzState.ground`) is what scoring reads. Slice 6 adds `landing.sites` and the `'rocky' \| 'wet'` grounds (`driverTouch` takes the LZ's ground). |
| **Variable memory (slice 3)** | `podRacks` keyed by rack; `validatePodRacks` iterates the racks present; `lastPodRackTrailingFree`. New code must not add uses of `MEMORY_TOTAL_BLOCKS` beyond `assertMemoryInvariants`. |
| **Generator-made ships** | `ShipLandingDef` plus `validateLandingDef`. The landing slice is built from the def alone (`createLandingState(def, memory, ship.flagship, firstRun, rng)`); landing code makes no `getShip(shipIndex)` calls. |
| **The save** | `ShipResult` per §5, with a `pods` detail for 05's epilogue (featured colonists can be looked up from family and pod). |

### 1.8 Architecture debt: fix now, or leave alone

**Fix in 1a:**
1. Results modelled as "a cluster left memory" (`ClusterResult` appended on leaving). Pods now exist for the whole ship (`PodRecord`), independent of their driver. This is the core fix: an eaten driver no longer means "lost people".
2. Literal phase checks (`phase === 'printing'`, about 40 sites). Use `isLanding(state)` and `isActivePhase`; the compiler finds every literal once the union changes.
3. Text inside the import cycle (printer → script): landing text moves to `data/landing-text.ts`, and the drop cache sits in its own module.
4. `ShipResult` as `woke/half/lost`: replaced by the flat §5 record.
5. "printer" identifiers in predict.ts and orbit-sim.ts: rename so the glossary stays clean.
6. Ship facts looked up at runtime: `finalShip` and the LZs are copied into state.

**Leave alone:** the 384 / RACK constants and the strip's row count (slice 3); predict.ts internals and the F-table; AUTOBURN; ghost thrust; zone logic; TRANSMIT and the draft; the archive format and `META_VERSION`; rank thresholds (they scale by fleet colonists); per-ship HOLLOW configs other than the landMult rename; the structure of the audio engine.

---

## 2. Ship landing data (all FULL 384, phase-2 HOLLOW kept)

Each pod is 200 colonists. R = 3,390 km, so 1° = 59.2 km. WIDE 500 km is 8.45°, STANDARD 400 km is 6.76° and NARROW 250 km is 4.23°. Orbits are CCW (`stateFromElements`, h > 0), so labels follow increasing angle.

| Ship · world | Pods (colonists) | LZs (centre°, width, pods) | Class · terrain | Colony (run 1) | Lead | Hurt |
|---|---|---|---|---|---|---|
| ARES-VII · Kepler-186f | 3 (600) | LZ-A 160°, WIDE, 3 | GENTLE · PLAINS | RIVERSIDE | POD 01 (Okafor, Ada) | POD 02 BRANDT at 44 on run 1 (§2, §3.15). Later runs: one non-lead pod, reseeded, at 44. |
| HALCYON · Tessaly | 5 (1,000) | LZ-A 40°, WIDE, 3 · LZ-B 190°, STANDARD, 2 | GENTLE · GRASSLAND | rolled | POD 05 | none |
| KESTREL · Brine | 12 (2,400) | LZ-A 20°, WIDE, 4 · LZ-B 140°, WIDE, 4 · LZ-C 260°, WIDE, 4 | HARSH · OCEAN | rolled | POD 10 | none (the debris is its damage) |
| VESPER · Cinder | 12 (2,400) | LZ-A 60°, STANDARD, 5 · LZ-B 180°, STANDARD, 4 · LZ-C 300°, NARROW, 3 | ROUGH · VOLCANIC | rolled | POD 09 | none |
| LAST LIGHT · New Haven | 16 (3,200) | LZ-A 10°, STD, 4 · LZ-B 100°, STD, 4 · LZ-C 190°, STD, 4 · LZ-D 280°, NARROW, 4 | GENTLE · PLAINS | FIRST LIGHT | POD 12 | none |

- **ARES-VII and HALCYON** follow the spec's counts (§2).
- **KESTREL, VESPER and LAST LIGHT** keep today's colonists (2,400 / 2,400 / 3,200), which is 12 / 12 / 16 pods. Splits follow §3.15: 12 pods give 3 LZs at 4·4·4, made uneven to 5·4·3 on VESPER (the NARROW LZ takes the smallest count); 16 pods give 4 LZs at 4·4·4·4. Widths follow the authored rows: Brine all WIDE; layer 5 STANDARD with one NARROW; layer 8 STANDARD ×3 and NARROW ×1. 02-map's worked run-1 roll (6 / 16 / 16) arrives with slice 3 (risk 2).
- **Spacing:** every adjacent pair is at least 90° apart centre to centre, far above 12° edge to edge. No double windows in 1a.
- **Fleet total:** 9,600 colonists, against 12,400 in phase 2.
- **ARES-VII's LZ-A at 160°** places the first window about 1–4 minutes of TACTICAL after a typical lock near ▼ (ω ≈ −34°, dot about 80° ahead), matching the spec's `LZ-A in 3:40`. Tune it after a probe if it opens inside the 8 s lead.
- **1b no-go arcs** (data now, left empty): VESPER lava 5° at 187.4° (89 km past LZ-B's edge) and 6° at 293.4° (89 km before LZ-C); LAST LIGHT a cliff 6° at 286.6° (89 km past LZ-D).
- **Drag:** off on ARES-VII and on for the rest, read in 1b.

**Pod-rack layouts** (`P` = 8-block driver):

| Ship | B | C | D | Free in pod racks (excl. root gaps) / D trailing |
|---|---|---|---|---|
| ARES-VII | `R P P P _32` | `_64` | `_64` | 160 / 64 |
| HALCYON | `P P P _40` | `P _2 R _1 P _37` | `_64` | 141 / 64 |
| KESTREL | `P P P P P P _16` | `P P P _1 R _2 P P P _5` | `_64` | 85 / 64 |
| VESPER | `P P P P P P _16` | `P P _1 R _3 P P P P _4` | `_64` | 84 / 64 |
| LAST LIGHT (§3.16 final ship) | `P P P P P P P _8` | `P P P P _2 R16 _1 P _5` | `P P P P _32` | 45 / 32 |

- **ARES-VII:** root first, so the scripted bite takes POD 01 (rack A's 18 trailing free blocks are a WALL on the root's left). First-run roster `['Okafor','Brandt','Al-Sayed']` with `leadIndex 0` and ADA. This deviates from §3.16's calm COMPACT row because HOLLOW stays (risk 3).
- **HALCYON:** POD 04 at GAP 2 and POD 05 at GAP 1 are bitten at the wake, as C08 and C09 were.
- **KESTREL and VESPER:** today's layouts with `C` → `P`, so THE DEAL, the seeds and the debris on rack C all keep their geometry.
- **LAST LIGHT:** §3.16's final-ship layout; `POD 12` sits at GAP 1. This changes the boss geometry (risk 4).

---

## 3. Removal list (and what replaces each)

**Files**
- `src/systems/printer.ts` → `landing.ts` + `landing-rules.ts`.
- `src/systems/reveal.ts` → nothing (05 §6).
- `src/systems/wake-report.ts` → `landing-report.ts`.
- `src/components/run/WakeReport.ts` → `LandingReport.ts` (reuse its credits scroll and star animation).
- `src/components/memory-view/PrintFx.ts` → `LaunchFx.ts`, the same chip flash on `pod-launched`.

**Functions and exports**
- `isPrintable`, `nextToPrint`, `printCluster`, `printStatus`, `setPrintNext` → `isLaunchable`, `nextToLaunch`, `requestLaunch`, `landingView`, `setLoadNext`. `setPrintFast` and PRINT FAST go with no replacement.
- `printerRange` → `getPrediction().greenFraction`, described as "share in band".
- `revealSouls`, `unsealCluster`, `crackDelaySec`, `lostCardSouls` → none. The LOST card's souls line becomes a pods line from `landingResult`.
- `soulsInMemory`, `isSoul`, `soulOutcome`, `soulCounts`, `archiveSealed`, `revealUnderway`, `revealAwaitsView` → `driversInMemory` (keeping the twin-during-MOVE rule), `isDriver`, `driverTouch`, `colonistCounts`.
- `recordClusterGone`, `lostClusterResult` → `recordDriverLost`.
- `openArchive`, `createSoulsState`, `createPrinterState` → `createLandingState`.
- `clusterCode` → `podCode`. `shipSouls` → `shipColonists`. `rackDTrailingFree` → `lastPodRackTrailingFree`.
- `intactTally` and `intactHudLine` → `onTargetTally` and `miniHudLanding`.
- `hollow.ts`'s `breach`. `boot.ts`'s `'known'` reveal. `bootOpensArchive`.
- `__ap` hooks `revealSouls`, `souls`, `printer`, `printFast`, `printNext`, `printAll`, `wakeReport`, `lostCard` → `pods`, `landing`, `launch(intent)`, `landAll()` (→ `forceLandAll`), `endLanding`, `landingReport`.

**Tuning constants**

| Removed | Replacement |
|---|---|
| `PRINT_RANGE_FLOOR`, `PRINT_FAST_FACTOR`, `NO_PRINTER_GIVE_UP_SEC` | none |
| `PRINT_DONE_LINGER_SEC` | `LANDING_DONE_LINGER_SEC` 1.5 |
| all `REVEAL_*`, `SOULS_ASK_MIN_LEAD_TAC`, `SOULS_ASK_HOLD_SEC`, `HOLLOW_REVEAL_AFTER_FIGHT_SEC` | none |
| `PRINT_FX_MS` | `LAUNCH_FX_MS` |
| `SOUL_WAKE_INTACT_MIN` | none |
| `WOKE_WITH_GAPS_SCORE` | `HARD_LANDING_FACTOR` 0.5 |
| `PRINTER_SPEED_BY_BAND` | `BAY_CADENCE_TAC` 2.0 (1b adds `BAY_CADENCE_BY_BAND`) |
| `STAR_INTACT_FRAC` | `STAR_ON_TARGET_FRAC` 0.95 |
| `CLUSTER_BLOCKS`, `SOULS_PER_CLUSTER`, `FEATURED_PER_CLUSTER` | `DRIVER_BLOCKS` 8, `COLONISTS_PER_POD` 200, `FEATURED_PER_POD` 3 |
| `MERGE_RESTORE_INTEGRITY` | `MERGE_DRIVER_INTEGRITY` 80 |
| `RANK_FLEET_SOULS` | `RANK_FLEET_COLONISTS` (still 12,400, the reference the thresholds were authored against) |

New constants, each with a WHY taken from the spec: `BAY_SLOTS` 4, `BAY_RELOAD_TAC` 20, `DROP_KM_PER_1000` 30, `POD_AIM_RP_FRAC` 0.6, `POD_DESCENT_SEC` 3.5, `POD_FIRST_DESCENT_SEC` 5.0, `LANDING_TACTICAL_WARP` 20, `LANDING_CRUISE_WARP` 60, `WINDOW_TACTICAL_LEAD_TAC` 8, `MISLANDED_FACTOR` 0.75, `OFF_SITE_SCORE_BY_CLASS` {0.5, 0.25, 0}, `LZ_WIDTH_KM` {500, 400, 250}, `LZ_MIN_GAP_DEG` 12, `PODS_MAX` 16, `UNIT_TAIL_BLOCKS` 24, `POD_RACK_MIN_FREE` 40, `DROP_SOLVE_SAMPLES` 360, `POD_ARC_POINTS` 40, `GROUND_TRACK_SPAN_KM` 3000, `LANDING_NONE_LEFT_SEC` 6, `COLONY_FAMILY_NAME_CHANCE` 0.5.

**Text**
- `revealLines`, `lostSoulsLine`, `printEcho`, `WOKE_TEXT`, `REPORT_TEXT`, `CREDIT_STATUS`, `STAR_TEXT.intact`, `STAR_MISSED` intact reasons, `SOUL_RULES`, `PRINTING_RULES`, `PRINT_FAST_HINT_TARGET`, `LINES.printingDone` / `bootArchive`, `COLONISTS_ASK_ID`, `colonistsAskToggle`, `HOLLOW_STORY.breach`, `HOLLOW_FINALE.stripWaits` → `data/landing-text.ts` equivalents.
- `TOOL_REFUSAL.sealed`, `soulScan`, `soulDelete`, `soulCopy` → driver versions.
- `GAPS_WORDS_POOL` → `HARD_WORDS_POOL` (placeholder).
- The NAV PLOT ring label becomes `SAFE ORBIT · LAUNCH BAND` in flight and `LAUNCH BAND` in landing; `PRINTER RANGE n%` becomes `IN BAND n%`; `ACCEPT · PRINTER RANGE` becomes `ACCEPT · IN BAND`.

**Audio**
- `revealPing`, `soulCrack` and `revealChoir` lose their callers; remove them, or keep `revealChoir` for the first landing (UI's call).
- `printBell` stays and becomes the touchdown bell.
- New cues: `podLaunch`, `podEntry`, `windowTone {centred}`.

---

## 4. Work breakdown

### Foundation (one agent, two commits, done first)

**F1: types, data and pure core** (a compile island; nothing else uses it yet)
- New files: `src/types/landing.ts`, `src/systems/landing-solve.ts`, `src/systems/landing-rules.ts`, `src/systems/drop-cache.ts` (complete), `src/data/landing-text.ts` (every spec word, sectioned `// SIM` and `// UI`).
- `src/types/segment.ts`: `DriverSegment`, `'bay'`.
- `src/data/tuning.ts`: all §3 constants, added and removed.
- `src/data/souls.ts`, `src/data/memory.ts`, `src/data/ships.ts`: §1.3 and §2 data and validators.
- Tests: `tests/unit/landing/solve.test.ts` and `rules.test.ts` (see §5).

**F2: mechanical switch-over** (typecheck green for `src/` and `tests/`, game boots)
- `schema.ts`, `events.ts`, `initial.ts` (`createLandingState`), `selectors.ts`, `actions.ts` (`recordDriverLost`, `beginLanding`).
- Delete `printer.ts`, `reveal.ts`, `wake-report.ts`, `WakeReport.ts`, `PrintFx.ts`, and their mounts in `main.ts`.
- The compiler-driven rename `printing` → `landing` and `soul` → `driver` across `src/` (systems and components), with minimal placeholders:
  - pace: landing → TACTICAL;
  - orbit-sim: landing → `coast` (to be replaced by SIM);
  - director: landing → alarm, mind-urgent, tutorial, then the fallback `WAIT`.
- Implement `stars.ts`, `run-score.ts` and run.ts `shipResultOf` on `landingResult` (all small).
- `landing.ts` is a skeleton exporting the final signatures (`mountLanding`, `requestLaunch`, `setLoadNext`, `endLanding`, `setLandingController`, `landingView`, `forceLandAll`), with `forceLandAll` and `endLanding` working so the report can be reached.
- Tests: delete `wp5/printer`, `wp5/reveal`, `wp5/report`, `lead1/crack-and-tag`, `lead1/skip-hold`. Rename types in the harnesses so `tsc -p tests/tsconfig.json` passes. Other suites may fail at runtime; Track TESTS owns them.
- Exit criteria: `npm run typecheck` passes, the entries test passes, `tests/unit/landing/*` passes, and the page reaches LANDING (no launches yet).

### Ownership after the foundation

- `schema.ts`, `types/*`, `ships.ts`, `memory.ts`, `script.ts`: **SIM only.** Others ask SIM (a one-line request in the PR or a message). UI may add pure read models in `landing-hud.ts` without schema changes.
- `tuning.ts`: SIM owns it. UI may only **append** inside a block it creates at the end of the file (`// --- Landing UI (slice 1a, Track UI)`). TESTS never edits it.
- `landing-text.ts` (foundation follow-up): SIM owns everything above the `// UI` banner; **Track UI owns the UI section below it** (the banner says so; `RUN_END_TEXT` now lives there). TESTS never edits it. Pod ids (`podTag`, `driverSegId`) are in `src/data/pod-ids.ts` (SIM).
- `main.ts`: UI owns it. SIM documents mount order in landing.ts's header: `mountDropCache` after `mountPredictor`; `mountLanding` where `mountPrinter` was (after ops-core, before HOLLOW, so a launch wins a same-tick bite); `registerLandingKeys(store, { confirm: launchConfirm })` (wired by the foundation, through askInline).
- `landing-controls.ts` exists (foundation follow-up): `playerLaunch` and `registerLandingKeys`. **SIM owns the key handling inside it**; UI's buttons (POD BAY, the phone bar) call `playerLaunch` only.
- `landing-report.ts` exists as a stub with the final `LandingReportModel` shape (foundation follow-up). **Track UI owns it** (a pure view model).

### Track SIM (DOM-free logic)

- New files: `src/systems/landing.ts` (implement), `src/systems/landing-controls.ts` (exists; SIM owns its key handling), `src/systems/landing-guidance.ts`.
- Refine: `src/systems/drop-cache.ts`.
- Modify: `src/systems/pace.ts`, `clock.ts`, `orbit-sim.ts`, `predict.ts` (renames only), `director.ts`, `guidance.ts` (re-export), `hollow.ts`, `hollow-deal.ts`, `hollow-verbs.ts`, `finale.ts`, `zones.ts`, `run.ts`, `run-end.ts`, `run-score.ts`, `stars.ts`, `meta.ts`, `transmit.ts`, `carry.ts`, `capabilities.ts`, `licences.ts`, `boot.ts`, `say.ts`, `tool-targets.ts`, `flight-events.ts`, `move-preview.ts`, `input.ts`, `src/debug.ts`.
- Data and state: `src/data/{script,landing-text,ships,memory,souls,tuning,tool-text,hollow-text}.ts`, `src/state/*`, `src/types/*`.
- Order: pace/clock/orbit-sim → landing.ts tick and launch → guidance and director → hollow landMult and drivers → finale → run, stars and report model → capabilities → carry (pooled receiver) → debug hooks.

### Track UI

- Models: `src/systems/landing-report.ts` (the stub from the foundation: `landingReportModel`), `src/systems/flight-hud.ts` (crumbs `ORBIT LOCKED | LANDING · 2/6 DOWN | ALL DOWN`; the countdown chip shows the next window; `IN BAND`; `acceptLabel`; `paceLabel`; `toggleAlert` with `◀ SHIP · LZ-A OPEN`), `src/systems/landing-hud.ts` (new), `src/systems/hollow-hud.ts` (mini kinds `driver` and `driver-hurt`).
- Audio: `src/systems/audio.ts` (podLaunch, podEntry, windowTone, pitched printBell), `src/systems/audio-cues.ts`.
- New components: `PodBayWindow.ts` (`[ L · LAUNCH POD ]`, `▮▮▮▯ 3/4 · RELOAD 0:12`, `NEXT POD 01 · OKAFOR · SOFT · ±78 km`, LZ counters, END LANDING with the inline confirm, the `BAY CTRL` pip), `GroundTrack.ts`, `LandingReport.ts`, `LaunchFx.ts`.
- Modified components: `NavPlotWindow.ts` (brackets, dot, dotted arc, streaks, landing marks, beacons, ring label), `plot-draw.ts`, `DetailPanel.ts` (driver detail, LOAD NEXT, predicted outcome), `SegmentBlock.ts` (driver chips, `BAY`/`NEXT` tags, chip label `P03` where narrow), `MemoryStrip.ts`, `MemoryStats.ts`, `MiniStrip.ts`, `MiniHud.ts`, `Footer.ts` (`PODS: 8 ABOARD · 3 LANDED · 1 CAN'T LAUNCH`), `ModeToggle.ts`, `PhoneFlightBar.ts` (LAUNCH), `ToolsTabs.ts`, `EngineWindow.ts`, `ObjectiveStrip.ts`, `Stamp.ts` (FIRST LANDING, ALL PODS DOWN), `Juice.ts` (`+200 LANDED · LZ-A`, shake, ring pulse), `BurnResult.ts`, `TransmitScreen.ts`, `RunEnd.ts`, `SidebarFilters.ts`.
- Also: `src/main.ts`, `index.html` (the POD BAY window, the GROUND TRACK panel, the LANDING REPORT DOM replacing `#wakeReport`), `src/styles/{game,responsive,tokens}.css`.
- Telemetry below 60 garbles LZ counters, drop widths and window countdowns via `garble.ts`.
- UI can build against F2's skeleton and `forceLandAll`; full checks wait for SIM.

### Track TESTS

- Owns `tests/**`. Phase 1 runs in parallel with SIM and UI (pure suites, harness wiring, deletions). Phase 2 runs after SIM and UI merge (fix the remaining suites, run e2e once). Details in §5.

**Merge order:** F → SIM → UI (rebase on SIM) → TESTS phase 2.

---

## 5. Tests

**Budget.** The unit tier must stay under 300 s overall and under 90 s per suite. New suites use pure functions, or a constructed locked state (a helper `lockedOn(shipIndex, { r: 6000, e: 0 })` builds the state and calls `endFlight(store, 'locked')`), so no capture is flown. Run e2e **once**, at the end.

**Shared helpers (new):** `tests/unit/landing/harness-landing.ts`:
- `followLanding(h, opts)`: per tick, press `KeyL` when the shown line names `[L]`, `KeyF` when it names `[F]`, and call `endLanding` at L12.
- `landInstantly(h)`: calls `forceLandAll`, for suites that don't test landing.
- Plug `followLanding` into `harness7.untilPhase` and `followDirector`'s phase loop, so every run-flow suite lands by the strip.
- **Guard:** `LAUNCH NOW` contains `NOW`, which followDirector's regex treats as "hold SPACE". Match `[L]` first.

**New suites** (`tests/unit/landing/`)

| Suite | Checks |
|---|---|
| `solve.test.ts` (F1, pure) | The kick reaches rp = 0.6R. The dot leads 70–88° on circular orbits of 5,000–9,000 km. Dot ground speeds match the §3.2 table. Drop width ±78 km at 6,000. Sure lengths for a STANDARD LZ at ×20 match the §3.2 table within ±0.3 s (7.6/8.0/7.6/3.9 at m = 1). The arc never wraps. Retrograde orbits mirror. On an ellipse each LZ gets its own launch radius. One solve costs under 5 ms. |
| `rules.test.ts` (F1, pure) | The band → launchable/touch table. Queue order with LOAD NEXT. Classification and fill in touchdown order. The 400 + 800 case scores 1,150 with `LZ-A 200 SHORT`. Every points combination. Refusal order. Guards (`scores 100`, `scores 150`). `colonyName` is deterministic and honours run 1's written names. `landingResult` folds parked versus not-launched by outcome. ON TARGET counts unlaunched pods in the denominator. |
| `bay.test.ts` | Cadence 2.0 tac s, reload 20 tac s of world time, a SKIP refills, OVERCLOCK quarters the real-time rate, `shown = min(loaded, launchable)`. |
| `table.test.ts` | Each row L0–L7, L11–L13 and L12b from crafted contexts. Every line ≤ `MAX_LINE_CHARS` with worst-case vars. None of the never-say words (scatter, deorbit, insertion, IMPACT used for a pod). No match throws in dev. |
| `pace-landing.test.ts` | The warps switch at the lock with no countdown jump. TACTICAL rules. SKIP lands 8 tac s before a window. `WINDOW OPEN` and `PODS IN FLIGHT` inhibit. The landing SKIP is an exact conic jump. |
| `flow.test.ts` | All five ships from a constructed lock, landed by the strip: every pod down, the report reached, real seconds per window printed as INFO (target 24–30). END LANDING parks. An eaten driver gives CAN'T LAUNCH, then `parked eaten`. A crashed or abandoned outcome gives `not-launched`. Core lost in landing parks every pod. HOLLOW's story and the finale hold the report. |
| `hollow-landing.test.ts` | drain = drainPerSec × max. landMult applies only with an open window and a launchable pod. The projected drain uses landMult in landing. MERGE restores in place, a restored pod launches again, and a pod with its block gone is `parked restorable`. |
| `report.test.ts` | Replaces `wp5/report`: LZ rows, OFF-SITE / NO-GO / PARKED rows, credits (no line for pods scoring 0 or never launched), the headline `LANDED n / N`, near misses, stars, the final ship waiting for the finale. |

**Existing suites**
- **Deleted in F2:** `wp5/printer`, `wp5/reveal`, `wp5/report`, `lead1/crack-and-tag`, `lead1/skip-hold`.
- **Rewrite:**
  - `wp5/layout` and `wp5/racks`: new layouts, P tokens, pod-rack rules, pod count = LZ sum.
  - `wp5/models`: fold into `table.test.ts`'s words checks.
  - `wp5/follower` and `wp6/follower`: no sealed archive; the literal follower reaches LANDING.
  - `lead1/fix1/story-printer` becomes `story-landing`: the story holds the report, and no launch echo lands on `> ...047?`.
  - `lead1/story`, `wp7/carry` (pooled receiver), `wp4/capabilities` (`bay` role, `drop`), `wp1/hud` and `wp2/ui-models` (IN BAND, crumbs), `wp12/p3/cleanup` and `minors` (PRINT FAST checks go), `wp11/merge-test` (driver restore), `wp11/p2/views`, `wp11/p2/purge-fleet`.
- **Mechanical plus `followLanding`:** `wp6/*`, `wp7/{run-flow,halcyon-story,bridge-test,p2-models,soft-fails}`, `wp8/*`, `wp9/*`, `wp10/*`, `wp11/{full-run,boss-sim,lastlight-sim,fix1}`, `final-fix/*`, and `lead1`/`lead2`/`wp1-rules` (only `'printing'` mentions).
- **Re-measure `wp11/boss-sim` and `lastlight-sim`** against LAST LIGHT's new layout (risk 4).
- **Over budget:** if a run-flow suite goes over 90 s with landing by strip, switch its non-landing ships to `landInstantly` and keep the strip on one ship.
- **Information only:** `wp12/playthrough.test.ts` (PHASE3 §11). Every design target prints `INFO`, or fails only with `PT_STRICT=1`. The hard check that remains is that each kid's run ends. `playthrough.ts`'s kids land with `followLanding`; SLOPPY may leave pods for END LANDING.
- **Keep:** `wp12/fix1/entries.test.ts`. It must pass with the new modules; drop-cache.ts and landing-text.ts exist so it can.

**E2E** (TESTS phase 2; one run of `npm run test:e2e`)
- `playthrough.mjs`: the landing by the strip (press L on `[L]`, F on `[F]`, END LANDING plus Enter on L12), then the LANDING REPORT checks (`LANDED n / N`, credits, stars).
- `run-flow.mjs` and `phone.mjs`: `__ap.landAll()` instead of `printAll`. On the phone, the GROUND TRACK replaces the readout row and LAUNCH is in the phone bar.
- `desk.mjs`: drop the STASIS chip assumptions.

---

## 6. Risks and open questions (each with a recommended answer)

1. **Can the engine fire during LANDING?** §3.3 refuses launches while the engine fires, which implies burns are possible; but phase 2 coasts after the lock, and trims and decay are 1b. **Recommend: no engine in 1a.** The landing coasts, as printing did, with SKIP support. ACCEPTED orbits land only through in-band windows; out-of-band windows read `OUT OF BAND`. The `ENGINE FIRING` refusal and the L2 row are kept as code paths, and 1b opens the engine in landing (flight-controls, orbit-sim and predict's trims).
2. **KESTREL, VESPER and LAST LIGHT pod counts.** 02's worked run-1 roll is 6 / 16 / 16; today's colonists give 12 / 12 / 16. **Recommend 12 / 12 / 16** so phase-2 HOLLOW geometry and balance hold; 02's counts arrive with slice 3's generator.
3. **ARES-VII and HALCYON in §3.16 are calm** (no root, COMPACT), but 04 slice 1 keeps the phase-2 HOLLOW on all five ships. **Recommend** the FULL layouts in §2 (root kept); slice 2 moves them to §3.16's calm rows.
4. **LAST LIGHT's §3.16 layout** puts the root in rack C between POD 11 and POD 12 (gaps 2 and 1, against 2 and 2 in phase 2) and 7 pods in rack B (the belt hits A–B). This moves the boss balance. **Recommend** adopting it as specified and re-measuring boss-sim. If MERGE availability or root-duel wins fall sharply, fall back to the phase-2 layout with `C` → `P`. Its D tail of 12 is fine in practice: a 96-block link never spills.
5. **Forgiveness is listed as 1b**, but scoring needs an off-site value. **Recommend** pulling the class field and the 3-entry table into 1a (data plus one lookup). Card labels, terrain glyph variety and no-go arcs stay 1b. The alternative is to set all five ships to GENTLE in 1a and let 1b flip Brine and Cinder.
6. **Gaps in the table.** It has no row for "everything launched, pods still falling or the linger running", and L4–L7 assume a pod can launch. **Recommend** adding L12b `ALL PODS AWAY · n FALLING` (wait) and requiring "a pod can launch" in L4–L7, so L11 shows otherwise.
7. **L12 relies on the player** pressing END LANDING; phase 2 gave up automatically after 8 s. **Recommend** the same: if no pod aboard has a driver in memory, the landing ends by itself after `LANDING_NONE_LEFT_SEC` (6) with L12 shown, so headless kids and AFK players never stall.
8. **The minute-1 reveal and run 1's SCAN step disappear** (05 §6 removes reveal.ts), and the tutorial no longer teaches SCAN on ship 1. **Accept for 1a** (slice 2 owns the calm-opening lessons). Keep SCAN licensed; the REPAIR licence does not depend on the reveal (licences.ts `REPAIR_RULE`).
9. **MERGE in 1a.** §3.17's last landing is slice 7. **Recommend** in-place restore of eaten drivers at 80% (their pods launch normally, and the landing resumes if it had ended); pods whose blocks are gone stay `parked`, `restorable: true`, and score 0 until slice 7. MERGE's half credit for those disappears; note it in the PR.
10. **The archive's `woke` field.** **Recommend** no `META_VERSION` bump: fill `woke` with `runLanded` (colonists landed on target) and leave a comment. Slice 3's save replaces it. `bestScore` stays comparable (points ≈ colonists).
11. **Fleet size falls from 12,400 to 9,600 colonists.** Ranks already scale by fleet colonists against the 12,400 reference, so they adapt; perfect landings are now needed for top ranks. Balance is information only (PHASE3 §11).
12. **Mislanded is decided at touchdown, not at launch** (§3.5: "fill in touchdown order"). The guard at [L] uses the projected fill (pods down plus pods falling into that LZ) so `LZ-A IS FULL` shows before the overfill.
13. **What "window open" means** for landMult, pace and SKIP: the dot centre is inside a bracket **and** the ship is in band. Out-of-band windows are not open.
14. **The warps switch at lock** by overwriting `level.tacticalWarp/cruiseWarp`. HALCYON and KESTREL go from 25/80 to 20/60, VESPER from 30/80, LAST LIGHT from 30/60. HOLLOW and the descent run on AI time and are unaffected. Zone leads are in tactical seconds and stay consistent. Document `beginLanding` as the only writer.
15. **The hurt POD 02 at 44% plus Ada's scripted bite** may squeeze ship 1's 36 charge. **Recommend** adopting 44 (it makes the lesson count: a hard landing) and checking the charge in `wp6` and `flow.test`. If it starves the fight, use 55.
16. **Where the table lives.** The spec puts `landingObjective` in guidance.ts. **Recommend** `landing-guidance.ts`, re-exported from guidance.ts, because of the import cycle and disjoint ownership.
17. **Driver chip width.** `POD 03` is twice as long as `C12` on narrow chips and on the phone. UI decides between `P03` and `POD 03` per available width; phone.mjs's whole-word check covers it.
18. **Angles and travel direction.** LZ labels assume CCW travel. landing-solve must handle `h < 0` (a strong RETRO at a far ▲ can reverse it); add a test.
19. **Drop-solve cost.** 360 samples with bisection per orbit epoch. The orbit drifts slightly while sub-stepping at CRUISE, so key on the epoch plus elements rounded to about 1 km and 1e-5 in e; never recompute every tick.

---

## Deviations (Foundation, F1 + F2)

What the foundation built differently from §1–§4, and why. Everything else follows the plan as written.

**Math and rules (F1)**
- **Pod kick in closed form, not bisection.** `podKickState` solves the RETRO kick that puts periapsis at `0.6 R` exactly (`k² = 2μ(1/r − 1/q) / (v² − h²/q²)`); the impact point is the inbound root of the pod's conic. Exact, branch-free and about 100× cheaper than bisecting, so the 360-sample dot track costs well under the 5 ms budget. Retrograde orbits are solved by mirroring (y → −y).
- **`windowsFor(track, tauNow, lzs, factors, ring)`** takes one `DropFactors` for the whole orbit instead of a `factorsAt(t)` callback, and reads `R` from the track. In 1a the factors are constant (all 1); 1b can widen the signature when sensors start to vary along the orbit.
- **`validateLandingDef(id, def, pods, planetR)`** has a 4th parameter: the LZ widths are in km, and the ≥ 12° gap rule needs the half-angles, which need the planet's radius.
- **Extra fields:** `LaunchRecord.aimLz` (the LZ the launch was aimed at, for the report's near-miss line), `PodRecord.restored` (MERGE gave the driver back; the report's `RESTORED BY MERGE`), `LandingState.colonyFirstRun` (the def's run-1 colony name, copied so the slice needs no ShipDef lookup) and `LandingState.noDriverAiSec` (the risk-7 auto-end's timer, for SIM).
- **`landingResult` resolves falling pods** through `pendingTouchdowns(state)` instead of throwing, so a ship whose Core is eaten mid-descent still scores its pods where they were going to land.
- **`landingView` lives in landing-rules** as the pure `landingView(state, solution, cadenceTac)`; landing.ts's `landingView(state)` is the live wrapper (drop cache + capabilities). Controllers and tests can build a view without the store.
- **`podCode` / `podTag` / `driverName` live in data/landing-text.ts** (not data/memory.ts), so the strip, the echoes and the report share one spelling without pulling memory.ts into the pure modules.
- **`computeDropSolution` on an open path** (e ≥ 1) returns an empty solution (no dot, no windows) instead of throwing in dev: a dev hook can end the flight on the approach, and 1b's burns can open the orbit while landing. The drop cache skips the dot track then.
- **drop-cache's `getDropSolution()` returns `null` outside LANDING** (not a stale solution), so a caller can't read flight-time windows.

**State and wiring (F2)**
- **`createLandingState(def, memory, { finalShip, lead, hurt, planetR })`**: the plan's sketch passed the ShipDef; this takes only what the slice needs, so generator-made ships (§1.7) need nothing new. Run 1's written colony name is applied at naming time from `colonyFirstRun` + `run.tutorial`.
- **orbit-sim's `printsColonists` became `startsLanding`**, not `endsInOrbit`: STRANDED ends in orbit but never lands. `endsInOrbit(outcome)` exists in landing-rules for the report's parked-versus-not-launched fold.
- **`requestLaunch` is complete in the skeleton** (refusals, guards and the launch itself): forceLandAll goes through the same `launchDriver`/`touchDown`, so the report path is real. Left to SIM: the bay's game tick, window-edge events and beeps, the controller hook, `pod-entry`, the first touchdown's radio line, the risk-7 auto-end (all marked `TODO(slice1a-SIM)` in landing.ts).
- **`setLoadNext` and `endLanding` return `string | null`** (the refusal, after emitting `refused`), like the tool actions, so the DetailPanel and the POD BAY window can show why.
- **Boot:** the `archive` boot line is gone with the archive; the REPAIR licence it used to issue now comes on the `host` line (`bootLicensesRepair`, replacing `bootOpensArchive`).
- **`DRIVER_RULES`** (the hurt-driver lesson: `tut-hurt-driver-tab`, `tut-hurt-driver`, `tut-hurt-driver-known`) replace `SOUL_RULES` already in F2, because the hurt POD 02 at 44% needs its REPAIR lesson for the boot flow to stay playable; SIM owns the words.
- **`exposedDrivers` / `bittenAgainDrivers` return `DriverSegment[]`**, not codes.
- **`podHintTarget(label)`** gives `driver-pod02` (from the strip's `POD 02`).
- **Placeholders beyond the plan's list**, each marked: the MiniHud's print row shows `LANDING · n/N DOWN` and `★ ON TARGET n/N` (`TODO(slice1a-UI)`); the LOST card's souls line is a pods line (`LOST_CARD_TEXT.pods`, `TODO(slice1a-UI)`); the LANDING REPORT placeholder (components/run/LandingReport.ts) borrows the WAKE REPORT's DOM; driver chips keep the old `soul*` CSS classes next to `driver`; audio maps `pod-landed` to `printBell`.
- **Text switched in F2** because it was wrong on screen: the NAV PLOT ring label (`SAFE ORBIT · LAUNCH BAND`; the landing-only `LAUNCH BAND` is UI's), `ACCEPT · IN BAND n%`, the LOST card's RESULT_SUB lines, HOLLOW_FINALE `stripWaits` / `stripWaitsNobody`.
- **`__ap` extras:** `loadNext(pod)` and `onTarget()` besides the plan's `pods`, `landing`, `launch(intent)`, `landAll`, `endLanding`, `landingReport`. `hollowDemo()` rebuilds the landing slice with its 10 pods in one LZ.

**Tests (F2)**
- Besides the five deleted suites and the harness renames (wp1, wp2, wp5, wp6, wp11 harnesses and wp12/playthrough.ts typecheck for real), **46 suites that still read phase-2 APIs** (cluster codes, `souls.results`, `printer`, the reveal) carry a first-line `// @ts-nocheck: TODO(slice1a-TESTS)` so `tsc -p tests/tsconfig.json` stays green until Track TESTS rewrites them per §5. Remove the pragma as each one is moved over: `grep -rl "@ts-nocheck: TODO(slice1a-TESTS)" tests`.
- `tests/unit/landing/pod-code.ts` maps the old codes onto pods (`C09` → pod 9), so the harnesses' `soul('C09')` lookups keep working.

### Foundation follow-up (after the architecture review of f86ea88..cd6782c)

**Blockers fixed**
- **One "window open now".** `LzWindow` gains `inBandOpenInSec` / `inBandCloseInSec`: the window intersected with the ship's band crossings (radius roots on the track, bisected like the other edges); `inBand` means that span exists. `openInBandWindow` uses that span, so on a PARTIAL orbit whose window straddles a band edge the rules, the strip and [L]'s OUT OF THE LAUNCH BAND agree. landing.ts's AI tick writes **`LandingState.window: { lz: string; sure: boolean } | null`** (`windowOpenNow`) and emits `window-open` / `window-sure` / `window-closed` on its edges. hollow's `drainConditions` reads `state.landing.window` plus `nextToLaunch` for landMult (§5's definition, TODO removed), so `hollow-hud` needs no mounted cache. Only landing.ts, guidance's countdowns and landing-hud read drop-cache.
- **`landing-controls.ts`**: `playerLaunch(store, confirm, pod?)` runs the whole requestLaunch → confirm → re-call loop; `registerLandingKeys(store, { confirm })` binds [L] (game layer, no auto-repeat; in the MIND it refuses with SHIP SCREEN), KeyG is reserved; both are in input.ts's PREVENTED_CODES. main.ts wires it with an askInline adapter (`✓ LAUNCH` / `✗ WAIT`).
- **Ownership seams**: the landing-text UI banner; `RUN_END_TEXT` moved there; `landing-report.ts` stub (`LandingReportModel`, `landingReportModel(state)` on real data; the placeholder screen and `__ap.landingReport()` use it); `targetWindow(state, sol, nowTSec)` in landing-rules for pace's SKIP, the countdown chip and landing-hud.

**Majors fixed**
- `Touchdown.touch` is final, decided at touchdown (`touchAtTouchdown(launch)` = driverTouch of the driver at launch; SURVEY's grounds later). `LaunchRecord.touch` is now `predictedTouch`. Every reader uses `touchdown.touch`.
- `launchRecordFor` computes the drop width with `dropFactors(caps, theLaunchedDriver)`.
- `launchRefusal(state, sol, { source, fromMind }, pod?)`: SHIP SCREEN whenever the screen is the MIND and the asker may not launch from there; `requestLaunch` derives `fromMind` from the active controller (and throws if a non-player source is not the active controller). Only the player's refusals emit 'refused', with a namespaced reason (`LAUNCH|…`) that data/script.ts REFUSAL_LINES flashes as `LAUNCH_REFUSAL_TEXT`.
- Pods are parked the moment `ended` is set (END LANDING, the auto-end, all launched, forceLandAll: landing.ts `endNow`, which also emits `pods-parked` and `landing-ended`); `finishLanding` only records FUEL and opens the report. MERGE's reopening also unparks pods parked `no-time` (their drivers are in memory).
- `landedOnTarget` → **`landedInLz`** (types, selectors, ShipResult, run-score, run-end, the archive's `woke`).
- The risk-7 auto-end: pods aboard with none of their drivers in memory end the landing after `LANDING_NONE_LEFT_SEC` (`no-driver-left`).

**Minors done**: `landing-start` emitted from endFlight and `burn.lastTickDvKmS` reset in beginLanding; launch refusals flash a line; `forceLandAll` aborts ops on the drivers aboard, then launches only `isLaunchable` ones; `finale.ts isFlagship` reads `state.landing.finalShip`; `validateLandingDef` moved to `src/data/landing-def.ts` (no SHIPS import) and rejects no-go arcs over a bracket or each other; `PodSummary.featured` (names); `podTag` / `driverSegId` in `src/data/pod-ids.ts`; header and controller comments; drop-cache's "only requestLaunch calls currentDropSolution" note.

## Deviations (Track SIM)

What Track SIM built differently from §1–§6, and why. Everything else follows the plan and the foundation's deviations.

**Pace and SKIP**
- **The windows the landing waits on.** TACTICAL around a window, WINDOW OPEN and the SKIP's target count only a window
  of an LZ with projected room (or of any LZ once none has room, never the case in 1a: the counts sum to the pods), and
  only while a pod is aboard and the landing goes on. A full LZ's window passes at CRUISE and a SKIP flies through it;
  otherwise HALCYON's kid sat through LZ-A's 24 s window at TACTICAL with SKIP refused after LZ-A was full. The strip
  still says L3 if the kid meets it. `state.landing.window` stays the one "open now" (landMult, L3, the chips).
- **pace reads the drop cache** for the time to the next launch moment (`windowLaunchInSec`, exported for UI's countdown
  chip), as §1.1 allowed; "open now" comes from state. The lead is judged one CRUISE tick ahead, as the dodge's is, so TACTICAL
  starts by the 8 s mark and never a tick past it.
- **`holdsTactical`** reads as §3.14 words it: the window rule (TACTICAL around windows, WINDOW OPEN) holds for hand drops
  and for a controller that holds TACTICAL; a controller with `holdsTactical: false` drops inside a SKIP. It does not
  force TACTICAL by itself. The controller lives in `systems/landing-controller.ts` so pace reads it without importing
  landing.ts (which imports pace for a controller's SKIP); landing.ts keeps `setLandingController` / `landingController`.
- New SKIP refusals: `WINDOW COMING UP` (the "too close" case before GET READY) and `THE LANDING IS OVER`.
- `landingInSec` is `skipLandsInSec`; no ghost burst is looked for during the landing (the ship only coasts there).

**Guidance**
- **The launch moment.** "The window" the landing counts to is its *sure* opening when this pass has one (where the whole
  dot first fits; else the opening: `landing-rules launchMomentInSec`). The TACTICAL lead, the SKIP's landing point
  (8 tac s before it), L13's WAIT, L7's GET READY and the 5…1 beeps all count to it, so GET READY's 8 s end on LAUNCH
  NOW; while the dot's centre is in but its edges are not yet, the row is still L7, not L5. Read literally, L5 (`LAUNCH —
  WIDE DROP, some may miss`) showed at every window's first seconds and a kid who obeyed sent the first pod half
  off-site; keyed to the opening, the strip jumped from `WAIT 0:09` to `GET READY 0:13`. L5 now shows only for a dot that
  won't fit this pass. "Open" (WINDOW OPEN, landMult, L3) stays the centre-in span. Real seconds per window by the strip:
  23.7–26.9 (ARES-VII 24.7 with its 5 s first descent, HALCYON 23.9, KESTREL 26.9, VESPER 23.7, LAST LIGHT 23.8).
- **L12's twin** `NO LZ IN THE LAUNCH BAND — END LANDING parks them in orbit` (id `landing-L12-band`): a PARTIAL orbit
  whose in-band arc never puts the dot on a bracket can't land anyone with the engine closed (risk 1); without it the
  strip said WAIT forever. followLanding treats both ids as L12.
- **L11** shows only when no pod can launch now and one aboard needs the kid (its driver is not already being repaired
  or moved); a busy driver falls through to L13. **L13** offers `· [F] to SKIP` only while a SKIP would start.
- **The MIND wordings**: L1 and L11 drop their `TAB,` in blue (as F1/F2 do); the ship rows that ask for [L] or the POD
  BAY (L4–L7, L12) say `[TAB]` first there (the flight's fromMind rule).
- `windowsAsOf` (landing-rules) rolls a window that closed since the cached solve on by one period; targetWindow and the
  table use it, so a solution up to a refresh old always has a next window (ARES-VII had no row for one tick).
- The director composes both phases with one `composeLive(ctx, rules, urgency, line)`; the `'landing'` GuidePriority and
  the placeholder line are gone. `LineVars` gains `nextLz` (filled by the director from the table) and `firstDownRadio`.

**Landing**
- **The first touchdown's radio line** is spoken by the director's beat `control-first-down` after CONTROL's `They're
  down! :)`, so the order is right (a `say` in touchDown would come first). A pod that came down hard sends a line from
  `HARD_WORDS_POOL` instead of its lead's first words.
- **`pod-entry`** fires at the share of the descent where the arc first enters `rAtm` (the streak runs the arc's points
  evenly over descentSec).
- **The controller hook** asks with the cached view (`landingView` now reads `getDropSolution`); only `requestLaunch`
  calls `currentDropSolution` (review note).
- **Parking at the ending.** `parkPodsAboard` (state/actions) writes the pods' final fate the moment the ending is known:
  `endFlight` for stranded / crashed / escaped / abandoned, and HOLLOW's `endCoreLost` (with `pods-parked`), besides
  landing.ts's `endNow`. Before, those ships' pods stayed `aboard` in state while their result said parked.
- `orbit-sim` keeps the flight's sub-steps between SKIPs, as planned; `LandingKick` is `{ atTSec, dvx, dvy }`.

**Not done in 1a (left for UI, 05 or 1b)**: the §3.11 lessons (`◆ PODS LAND WHERE THE DOT IS`, `◆ 2 SITES …`) are text in
landing-text but not yet guide rules; the no-go ask in the arc's own word is a `TODO(slice1b)` in launchGuard.

## Deviations (Review fixes)

What the logic fixes after the full review changed, and the design choices made. The regression checks are in
`tests/unit/landing/review-fixes.test.ts` (states built directly, about 4 s) unless named otherwise.

**Pods parked while their drivers are still in memory**
- **The choice: `recordDriverLost` updates a parked pod** (over "parking provisional until finishLanding"). endNow keeps
  parking at the moment the landing ends, so the PARKED words, the beacons and L0 still show through the linger and the
  finale's wait, and a driver HOLLOW or a zone takes afterwards rewrites the parked fate with the loss
  (`landing-rules parkedFateOf`: why `eaten` or `dead`, `restorable` for eaten) and sets `driverLost`. MERGE's unpark rule
  stays right: only `no-time` pods reopen, and an eaten one comes back with its driver. Provisional parking would have
  meant a second "aboard but over" state that every reader (report, beacons, L0, the LOST card) had to learn.
- **THE DEAL** (`hollow-deal dealLive`): not offered once the landing has ended, and an offer standing at the end is
  withdrawn silently (`invalidated`, as for a ship that is over), also when an answer came in the same tick.

**Ship 1's scripted fight**: `HollowState.scriptTargetId` holds the bitten file until the fight is decided (a save can
carry it); the report waits while `selectors scriptFightOpen` (the target still in memory), so END LANDING before the
fight still lets `> ...047?` land first. A target that left memory some other way never holds the report for good.

**The launch moment (M3)**: `landing-rules landingMoment(state, sol, nowTSec)` returns `{ awaited, canLaunch, noBand,
roomInBand, upcoming, open, target }`: `upcoming` the in-band windows as of now (rolled by windowsAsOf) with their
in-band opening, close and launch moment in game s from now; `open` the state's window with `launchCome` and
`awaited`; `target` the window the landing waits on. Pace (TACTICAL, WINDOW OPEN, the SKIP), the table, the beeps,
the countdown chip, the mini-HUD and the ground track read it; `targetWindow` is gone. Gating, once for all:
- **awaited**: LANDING, not ended, and a pod aboard that can launch some day (M2's rule); nothing counts down otherwise.
- **the beeps** count only while a pod can launch now (GET READY's own condition).
- **the chip's and the mini-HUD's OPEN** only for an awaited window whose launch moment has come.
- **the ground track** lists in-band windows only, soonest launch moment first.
- **landing-solve**: a window still open whose in-band part is over this pass is reported as the next pass's (the
  crossing search now reaches two orbits ahead), so `LzWindow.inBand` means "this LZ can be launched at from the band
  at all". Before, such an LZ read as out of band for the rest of its window.

**No room in the band (M1)**: only LZs whose window is in the band are named, waited on or counted down to.
`roomInBand` false (every in-band LZ full) with pods that can launch: the target is the next in-band window, full, and
- **L3b** (`landing-L3b`, keys [L]) while it is open, its launch moment come and the bay ready: `NO ROOM IN THE BAND —
  [L] lands in a full LZ (¾), or END LANDING` (the factor from MISLANDED_FACTOR). [L] goes through the `full` confirm.
- **L13's twin** (`landing-L13-noroom`) until then: `NO ROOM IN THE BAND — LZ-A in 2:10 · [F] to SKIP, or END LANDING`,
  never with [L] (a press between windows would ask the off-site confirm). Pace and SKIP target that window.
- L3 (`hold the pods for LZ-B`) names only an in-band LZ with room; L7 never counts to a full window.
- `tests/unit/landing/flow.test.ts` flies HALCYON ACCEPTed at ▼ 5,500 km, e 0.4, ω 260° by the strip (p2).

**Pods that can never launch (M2)**: `landing-rules driverCanEverLaunch`: a driver at or above the failing band always
can (it waits for an infection or an op); below it only with a repair running on it, or `selectors repairPossible` (a
usable Repair and charge ≥ 1, the rule `rootDeletable` uses for its Rm). The table's anyCanEver, L11 (never asks for a
REPAIR that can't start), the risk-7 auto-end and the moment's `awaited` share it.

**L0 and 'all-pods-down' (item 3)**: L0 says `EVERY POD IS DOWN — now DELETE THE ROOT` only when every pod is down,
else `HOLLOW_FINALE.stripWaitsNobody`. `'all-pods-down'` carries `{ parked }` (pods that never launched); audio-cues
plays lockArp and the stamp's thud only for 0, as the stamp shows only then.

**VESPER's hunting ground (issue 5)**: on a ship whose seeds hunt tools, `carry.ts layoutCarried` lays out rack E's
list, then `WALL_MIN_BLOCKS + SEED_BLOCKS + SEED_TOOL_GAP_BLOCKS` (7) free blocks, then rack F's list, the charge and
the free rest, when the receiver has the room (it never costs charge or spills into the tail). The seed lands one block
from the first tool with a WALL behind it: phase 2's geometry (rack E's free tail, the tools from rack F's start). A gap
after the last tool instead would let a chain that eats the tools run on into AI Comms and the Core. Other ships keep
§3.16's back-to-back block.

**Minors**
- N2: RUN END's NOBODY WOKE and its tone count the flagship's colonists down with points (mislanded and off-site
  included, no-go not), from the state that ended the run (`landing.finalShip`, the run's result for `level.shipId`).
- N3: FUEL is noted at endNow; MERGE's reopening clears it.
- N4: the drop cache is fresh only for the current `orbitEpoch`; the dot track's key adds `e·rp·cos ω`, `e·rp·sin ω`
  rounded to 1 km (steady on a near-circular orbit, where ω alone is noise).
- N5: `landing-rules inOrbitOutcome(status)`; landing-report reads the ship name, destination and final ship from state.
- N6: `rootDeletable`, `rootDeleteRunning` (the root's `operating` flag: only DELETE targets a hollow block) and
  `repairPossible` live in selectors (hollow.ts and finale.ts re-export them); `buildLandingContext(state, sol,
  skipAvailable)` takes the SKIP's availability from its caller, so the table imports no stateful module.
- N7: `setLoadNext` refuses `LANDING OVER`, `endLanding` refuses `PAUSED`; the POD BAY's END LANDING is disabled while
  paused.
- `podCounts` / `podsWithFate` in landing-rules replace the four pod-count helpers; `parkAboard` is gone.
- The report's breakdown counts a mislanded pod once. Run 1's first pod is `LaunchRecord.firstOfRun` and rides on
  `'pod-entry'` (`first`).

**Edits outside Track SIM's files** (each a mechanical consequence): `src/debug.ts` (the new buildLandingContext
argument), `src/systems/audio-cues.ts` (lockArp gated on `parked`; `first` from the event), `landing-hud.ts` and
`flight-hud.ts` (the landingMoment readers; END LANDING disabled while paused), `tests/unit/wp10/copy-test.test.ts` and
`wp10/fix1/fixes.test.ts` (VESPER's hunting ground), `wp11/fix1/fix1.test.ts` (stripWaitsNobody is a check),
`wp6/hollow-sim.test.ts` (the tug line), `wp12/playthrough.ts` (the rule ids), `tests/unit/KNOWN-FAILING-slice1a.md`.
