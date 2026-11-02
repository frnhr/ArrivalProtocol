# Slice 3c implementation plan: the save, archive v2 and the world update between runs

The architect agent wrote this from HEAD 527944b on `claude/modest-hawking-209t0f`. Paths are relative to `/home/user/ArrivalProtocol`.

**Citations:** 01-landing.md (01 §n), 02-map.md (02 §n), 03-skills.md (03 §n), 04-threats.md (04 §n), 05-story.md (05 §n). DECISIONS.md wins where they differ. "The code as built" means the slice 1a–3b plans with every Deviations section. The reference for the world update and its statistics is `docs/phase3/map-sim/arm_sim.py` with `results.txt`. Code style follows AGENTS.md: functions and data, numbers in tuning.ts with a WHY, fail loudly, comments that say WHY.

**Lead decisions on §7's risks (2026-11-03).** All recommendations are adopted (Fran: implement the plan and measure).
Reported to Fran with the slice: risk 1 (ENDING CHOSEN is written when the final LANDING REPORT opens; a reload between
the choice and the report replays the final ship until slice 7), risk 2 (archive v1 is not carried over: playtest
archives restart at UNIT-047), risk 3 (MERGE's next-run thread retires, as decided) and risk 4 (the Debris guarantee
applies to new ships only; measured). Any decision may be reverted per `DECISIONS.md`.

**Process:**
1. F (foundation: types, versions, the codec, stubs with final signatures, text, tuning, fixtures).
2. Review.
3. Tracks WORLD, SAVE and UI in parallel.
4. Merge in the order WORLD, SAVE, UI.
5. Full review, then fixes.
6. Unit tier (under 300 s).
7. One e2e run.

---

## 1. Scope

### 1.1 What 3c delivers

**The run save (02 §3.11; 05 §3.3 "mail is part of the save"; 04 M6; 03 §8 item 4)**
1. The run save lives under the key `arrival-protocol/run/v1`, apart from the archive. It is written whole at four points, and each write replaces the last:
   - **RUN START:** RECEIVE TRANSMISSION, and ship 1 again after the simulation retry.
   - **SHIP DONE:** every `openDesk`, which covers the report's CONTINUE and a lost ship's card.
   - **BEAM:** in `startShip` after `transmitNext`, once hits are rolled, ECC applied and the layout done.
   - **ENDING CHOSEN:** see §2.1 and risk 1 for when it is written in 3c.
2. **Contents:**
   - the save version and the content versions (arm, generator, update, map state, catalogue);
   - `RunState` whole: route, galaxy year, `run.repo` (deliveries in flight and waiting), `run.inbox.read`, `run.log` (046.log), `run.threat` (TRACE, fed, HOLLOW's ladder), `run.ships` (one `ShipResult` per ship, 01 §8 slice 3), stats, licences, upgrades, `lastUnit` and its trail;
   - at BEAM, the carried racks and the threat verdict;
   - at SHIP DONE and ENDING CHOSEN, the ship's slices;
   - the TERMINAL log and the director's done list.

   Messages are re-derived (3b §2.4). Slice 4's `run.skills` will ride inside `RunState` (§2.7).
3. **Resume** (02 §3.11). The title shows `RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625` with [RESUME ▸] and [NEW RUN].
   - NEW RUN over a save asks first, then records the unit as `abandoned`; the ships it visited count as done.
   - A reload mid-ship replays that ship from its boot with the same seeds (decision 5).
4. **Loud failures:**
   - a write that throws shows `RUN SAVE OFFLINE — a reload will lose this run` (one TERMINAL line, a buzz and a footer tag), and play goes on;
   - a save that doesn't parse, comes from another content version, or doesn't match the archive shows `RUN SAVE CAN'T RESUME`, the reason, and [ABANDON RUN] only.
5. **One step at run end** (02 §3.11): when the RUN TALLY opens (today's `endRun`), the archive record, the world update and the deletion of the run save happen together. A run lost before the final ship is written at once.

**Archive v2 (02 §3.12 "The archive"; 01 risk 10 `woke`)**

6. `arrival-protocol/meta/v2` holds:
   - the arm state: the next run's `ArmState`, the arm seed, the final-ship serial;
   - the last unit, with its trail: route, year and outcome per ship, the grey cross;
   - colonies;
   - the last three routes;
   - up to 4 notable events per run;
   - `traces: []`, reserved for slice 7.

   Two field changes:
   - `woke` becomes `landed`;
   - `layer` and `worldSlot` (3a M3) give way to the trail.

   The v1 key is never touched or read past detection, and the title says once that an older archive was found and not carried over.
7. **Content reset:** when an arm state's versions differ from the code, the next run gets a fresh roll at the next run number. The lineage, colonies and history are kept, and the title says so (02 §10).

**The world update (02 §3.12 steps 1–6, §3.1, §3.4, §3.6; 02 §8 3c)**

8. It is pure, deterministic and seeded `upd:`. It takes the arm the run started with plus the route, and returns the next `ArmState`:
   - the launch gap (`LAUNCH_GAP_TABLE`);
   - Done (colony / `NO COLONY`);
   - Older, in order: the drift limit (final ships included), the third run, `RESOLVE_CHANCE` with its two reasons (authored ships exempt);
   - the ark pattern;
   - reported home: ARES-(VI+run) at w0, a new final ship by serial with its floor, arks, and light or standard ships back to 40% light;
   - the placement quotas topped up on new ships only;
   - checks 1–5 with re-rolls, repairs from attempt 5, and a throw at 50;
   - the time valve (+11 years when the best route is below 63 pods).
9. `TAKEN`, the leaving reasons, `REPORTED HOME` / `2ND RUN ON THE CHART`, and the opening desk's departures block (02 §2, §4).

**Story (05 §8 item 3, §3.3, §3.5, §3.8)**

10. **The last unit's beacon** on ship 1's LANDING REPORT. Run 1 reads `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 1 YEAR AGO`; from run 2 it is by the gap, with `THIS YEAR` for 0.
11. **Letters to the unit ahead:** one per colony of the last route, `FOR UNIT-047`, by the light rule. This fills `letterSources(run)` (the 3b seam).
12. **The ghost by trail:** it speaks at the first boot in or past the layer of the grey cross (never at ship 1), or at the final ship when the last unit was not lost. This replaces 3a's layer lookup.
13. **The title change from run 2:** `UNIT-048 · YEAR 2303 · LAUNCHED 3 YEARS AFTER UNIT-047` (`IN THE SAME YEAR AS UNIT-047` for 0; the valve's 11 years included). The title also says `runs save between ships` (02 §4).

**Tests** (02 §8): §3.13's statistics over 200 consecutive runs; §3.14 as a fixture for the update; save round trips and every failure path.

### 1.2 Not in 3c

- **Slice 4:** the tree. The save carries `run.skills` once it exists (a `RUN_SAVE_VERSION` bump), and archive v2 keeps `lastUnit.skills: null` for 03 §3.11's record.
- **Slice 5:** showing residents, `?` ships and fragments. 3c maintains their quotas in the update, so arms don't move when slice 5 arrives.
- **Slice 7:**
  - the two-step FINALE (ENDING CHOSEN moves to step 2's confirm);
  - traces and trace places;
  - the stranger HOLLOW and `047.log`;
  - the epilogue and final card (3c shows the bridging line on RUN END for now, §2.6);
  - the notable events' use in `047.log`.
- **Later:**
  - mid-ship saves and ironman (decision 5; see §1.3);
  - drawing older routes as faint trails (stored now, drawn later if the playtest wants them);
  - parked pods' beacons found next run. 01 §7 leaves them to 02 and 05, and neither places them in 3c. The ship that parked them is Done and has left the chart, so there is nowhere to show them.
- **The classic world** is never saved and never updated.

### 1.3 Fran's D5 (save and ironman)

DECISIONS round 1 #5: "Reload mid-ship replays the ship from its boot, for now. Later: saving mid-ship, and an ironman mode with one autosave slot that can't be used to savescum (TBD)." 02 §3.11: "Both wait for a playtest of the plain save."

**3c builds the plain save:**
- the four points;
- reload replays the ship from its boot;
- one save slot, which every point overwrites.

**Seams for ironman, not built:**
- `RunSave.mode: 'standard'` (`'ironman'` later);
- one entry point, `writeRunSave(store, point)`, so ironman can add a `'tab-hidden'` point;
- `SavePayload` is a tagged union, so a later `'mid-ship'` payload kind (slices plus module snapshots) slots in;
- the save codec refuses a save from a run the archive no longer has in progress (the stale rule, §2.1). That is not yet a rewind guard: ironman's later check is `resume.depth >= activeRun.trail.stops.length` (review follow-up).

### 1.4 Open calls 3c resolves

| Call | 3c |
|---|---|
| 1a risk 10, archive `woke` | **Resolved:** v2 has `landed`. |
| 3a risk 4, run ≥ 2 a fresh roll named by run | **Resolved:** the world update. ARES by run, final ships by serial. |
| 3a risk 18 / review M3, the ghost by layer | **Resolved:** by the trail's grey cross. `LastUnit.layer` and `worldSlot` go. |
| 3a F2 note, a version field on the map | **Resolved:** `RunMapState.version = MAP_STATE_VERSION`. |
| 3a m5, the ShipDef cache on the full ArmShip | **Confirmed sufficient.** A waiting ship's `runsOnChart` change only adds a cache entry; a re-timed ship has a new id. |
| 3b seam `letterSources` | **Filled** from `lastUnit.trail`. |
| 3b review, restoreState's segment-id counter | **Resolved in src:** `memory-ops reserveSegIds`, `say.ts reserveLogEntryIds`. The tests' `restoreState` uses them. |
| 3a DESK deviation 13, `FLEET_ROUTE_LY` / `MissionMeta.distanceLy` | **Removed** by F (unread since 3a). |
| 05 §8.3 "INBOX and log in the save" | **Built** (`run.inbox`, `run.log`, the TERMINAL log). |

---

## 2. Architecture

### 2.1 The save

**Format.** It is JSON, in a `RunSave` envelope (§2.5). The codec (`encodeRunSave` / `decodeRunSave`, pure) uses one replacer for the only non-JSON number the state holds: a sticky ghost burst's `endTSec: Infinity` becomes `{"$num":"Infinity"}`, and the reviver brings it back. Any other non-finite number throws on encode, because it is a bug. Encoding a `world: 'classic'` map throws.

**Content check on load,** in order. The first failure becomes `cant-resume` with its reason:
1. JSON parses;
2. `saveVersion === RUN_SAVE_VERSION`;
3. `content` equals `contentVersions()`:
   - `ARM_CONTENT_VERSION`;
   - `MAP_GENERATOR_VERSION`;
   - `MAP_UPDATE_VERSION`;
   - `MAP_STATE_VERSION`;
   - `REPO_CATALOGUE_VERSION`;
4. the envelope's keys and types (strict, field by field, like `parseMeta`);
5. `payload.run.map.world === 'arm'`;
6. route length equals `shipIndex + 1`, and the phase matches the point;
7. every `ArmShip` passes `validateShipDef(shipDefOf(...))`;
8. the archive has `activeRun` with the same `unit`, and `archiveRuns === meta.runs`. Otherwise the save is **stale** (the run already ended, or another tab's run).

After the checks, the resume itself runs the real constructors (`createShipSlices`, `assertMemoryInvariants`) inside a try. A throw there is `cant-resume` too, with the message.

**Storage.** `src/systems/storage.ts` takes `MetaStorage`, `StorageProvider` and `browserStorage` out of meta.ts (meta re-exports them). The save's live half mirrors the archive's:
- a session `{ provider, status }`;
- the status goes `ok` → `offline` on the first write that throws (QuotaExceeded included), and nothing more is written that page; `'save-lost'` is emitted;
- a headless world (archive status `'none'`) never writes, so the existing suites are untouched.

**The four points and their payloads:**

| Point | Written in | Payload | A reload resumes at |
|---|---|---|---|
| `run-start` | `boot.ts receiveTransmission` (after `archiveRunStarted`); `run.ts continueAfterLoss` (simulation) | `boot`: `run`, `carried: null`, `threat: nominalShipThreat(0)` | ship 1's boot |
| `ship-done` | `run.ts openDesk` (after its update) | `world`: `phase: 'desk'`, `run` (transit null), the ship slices | that ship's DESK |
| `beam` | `run.ts startShip`, when `hop !== null` | `boot`: `run` as `startShip` built it, `carried`, `threat` | the next ship's boot |
| `ending-chosen` | `run.ts`: the final ship enters `'report'` with a decided finale (risk 1) | `world`: `phase: 'report'` | the final ship's LANDING REPORT |

The ship slices in a `world` payload are `mission, memory, clock, burn, orbit, level, landing, hollow, hazards`. Every payload also carries `log` and `done`.

**Saved or re-derived:**
- **Saved:** the above.
- **Re-derived:**
  - INBOX messages, the chart, the card, the desk models (from `run`);
  - a `boot` payload's ship (from `run`, `carried` and `threat` through `createShipSlices`, deterministic by the ShipKey and visit streams);
  - the UI slice (`createUiState` plus the desk fields `openDesk` sets: `deskUiOnOpen(state)`, extracted from `openDesk`);
  - alerts (empty).
- **The PACKET** is not a save point. A reload there resumes at the DESK, which matches `◀ CHART`'s rule (drops and the pick are forgotten).

**Migration.** There is none for the save (new key). Archive v1 → v2 is in §2.4.

**Failure paths:**

| Case | Status | The title says | Ways on |
|---|---|---|---|
| storage unreachable on read | `offline` | `RUN SAVE OFFLINE` (the archive is offline too) | RECEIVE TRANSMISSION |
| write throws mid-run | `offline` | TERMINAL line plus footer `NO SAVE` | play on |
| not JSON / bad shape / wrong version / wrong content | `cant-resume` | `RUN SAVE CAN'T RESUME · <reason>` | [ABANDON RUN] |
| unit or run mismatch, or archive `activeRun` null (stale) | `cant-resume` | `… · THAT RUN ALREADY ENDED` | [ABANDON RUN]: only clears |
| archive corrupt or offline | `cant-resume` | `… · THE ARCHIVE CAN'T BE READ` | [ABANDON RUN]: clears; the archive's own CORRUPT box stays |
| `activeRun` and no save (the save was never written) | — | the last unit is `abandoned` on load, as v1 did, with the world update | — |

### 2.2 Resuming mid-run

**Page open** (`state/instance.ts`, SAVE):
1. `openRunArchive(browserStorage)`. It no longer abandons `activeRun` by itself.
2. `const save = openRunSave(browserStorage, archiveMeta())`.
3. If there is no save and `activeRun !== null`: `abandonActiveRun()`. It records `abandoned`, runs `updateArm` with `visited = activeRun.route`, and writes.
4. If resumable, the store starts on the **saved run's title**: `createInitialState({ seed: run.seed, phase: 'title', lineage: lineageOfRun(run), map: mapAtFirstShip(run.map), save: { status: 'ok', resume } })`. Nothing is updated before the kid chooses.
5. Otherwise it starts the next unit's title as today, from the archive's lineage, whose `arm` is the updated one.

**`resumeRun(store)`** (run-save.ts):
1. `resetWorld()`.
2. `reserveSegIds(highestSegId(json))` and `reserveLogEntryIds(max entry id)`. `ops-core`'s `nextOpId` needs nothing: ops were aborted at every point.
3. **`boot` payload:** `resetWorldForShip(store, { phase: 'boot', run, carried, threat, freshLog: false, done })`, then the log is replaced by the saved one plus a divider. Then `startBootFromTitle(store, { countRun: false })`, factored out of `receiveTransmission` (mode, unpause, `resetBootTimers`, `transmitIn`; no `archiveRunStarted`, the run is already counted).
4. **`world` payload:** one `store.update`:
   - the slices, `run`, `log`, `director = { shown: null, done }`, `clock.paused = true`;
   - `ui = createUiState(...)`, plus `deskUiOnOpen` at the desk;
   - then `assertMemoryInvariants`.
5. `resetReport()` must be empty afterwards (the suites assert it).

**Abandoning** (`abandonRun(store)`): [NEW RUN] (an inline confirm `ABANDON UNIT-047'S RUN? · ITS SHIPS COUNT AS DONE`), [ABANDON RUN] and `__ap.newRun` all go here:
- `recordAbandon`, the update and the archive write;
- `clearRunSave()`;
- `startRun(store, newRunSeed(), archiveLineage(), 'arm')`.

A stale save only clears.

### 2.3 The world update (`src/systems/map-update.ts`, pure)

```ts
export const MAP_UPDATE_VERSION = 1;
export interface UpdateInput {
  from: Readonly<Pick<ArmState, 'armSeed' | 'run' | 'startYear' | 'finalSerial' | 'lastFinal' | 'ships'>>;
  visited: readonly number[];       // the route's slots (an abandoned run's so far)
}
export interface ArmUpdate { next: ArmState; attempts: number; valveOpened: boolean; bestPods: number; reasons: Record<LeaveReason, number> }
export interface UpdateDice {        // every roll of the update: seeded in play, scripted by §3.14's fixture
  gap(): number;
  resolve(ship: Readonly<ArmShip>): 'core-coming' | 'own-way' | null;   // null: stays (RESOLVE_CHANCE)
  patternTie(): readonly number[];
  pick(what: 'ark-slot' | 'victim' | 'repair' | 'feeder', slots: readonly number[]): number;
  order(slots: readonly number[]): number[];                            // the sim's refill shuffle
  timing(key: ShipKey, base: readonly number[], layer: number): { approachYear: number; late: boolean };  // = rollTiming
  arkExtra(key: ShipKey): number;                                        // = rollArkExtra
  name(pool: readonly string[]): string;
}
export function rollLaunchGap(rng: Rng): number;                 // LAUNCH_GAP_TABLE
export function seededDice(armSeed: number, nextRun: number, pass: 'first' | 'valve'): UpdateDice;  // updRng(`upd:${seed}:${run}:${pass}:${stream}`)
export function updateArm(input: UpdateInput, dice?: UpdateDice, opts?: { valveFloor?: number }): ArmUpdate;
export function freshArmState(armSeed: number, run: number, startYear: number, prev: ArmState | null): ArmState;  // content reset, suites
```

**`updateArm`** ports `arm_sim.py update_arm` and `chain`. The gap is rolled once; `start = from.startYear + gap`. `pass(start)` runs steps 1–5 (`runOne`). If `bestRoutePods(next) < VALVE_FLOOR_PODS`, it runs again from the same input with `start + VALVE_YEARS` and `seededDice(…, 'valve')`.

1. **Done:**
   - visited slots leave as `done`: words `colony` when `landedInLz > 0`, else `no-colony` (read from the route's results by the caller and passed in `visited`);
   - w0 always leaves (`first-past`, said nowhere).
2. **Older:** each remaining ship is copied with `runsOnChart + 1`, then:
   - `start − timedAgainstStart > DRIFT_LIMIT_YEARS` → `drifted` (`own-way`), final ships included;
   - a final ship otherwise stays;
   - `runsOnChart > MAX_RUNS_ON_CHART` → `aged` (`own-way`);
   - a non-authored ship → `dice.resolve`: `resolved` with its words.

   The order is the sim's.
3. **The ark pattern:**
   - an authored ark forces its pattern (the sim's `forced`: VESPER on 3,5,7);
   - otherwise the majority of waiting arks decides, and a tie is `dice.patternTie()`;
   - off-pattern arks leave (`core-coming`);
   - a pattern layer with no ark takes `dice.pick('ark-slot', empty)`. With no empty slot, the oldest non-authored ship leaves (`made-room`, `core-coming`).
4. **Reported home:**
   - plan kinds: `first`, `final` if empty, `ark`, then `dice.order(open)`;
   - light while `need = round(LIGHT_SHARE × nonArk) − lightsWaiting > 0` and the layer is not crowded (fewer than `MAX_LATE_TIGHT_PER_LAYER` from `LATE_TIGHT_FROM_LAYER`), else standard;
   - new keys are `ShipKey(armSeed, nextRun, slot, attempt)`;
   - timing: `dice.timing`; arks: `arkYear` and `dice.arkExtra`;
   - the final ship: `finalYear(trial, end, lastFinal.year + max(gap, FINAL_FLOOR_MIN_GAP_YEARS))`.
5. **Checks:** `armChecks`, up to `GEN_MAX_ATTEMPTS`. From attempt `UPDATE_REPAIR_FROM_ATTEMPT` (5), the sim's repairs apply:
   - `forced-tight` flips a planned late light to standard, else retires a waiting late TIGHT ship (`unreachable`, `core-coming`);
   - from attempt 10, `no-predecessor` on a planned slot retires a feeder (`unreachable`, `own-way`);
   - any other problem on a waiting ship retires it (`unreachable`, `own-way`; a waiting ark is replaced as an ark).

   It throws after 50 attempts, with the problems, the plan and the seed.
6. **Details on success, new ships only:**
   - names from `GENERATED_SHIP_NAMES` minus the names on the chart (`dice.name`; soft-avoid the trail's and the departures' names while the pool allows, risk 5);
   - `aresName(nextRun)`, and `FINAL_SHIP_NAMES[finalSerial % n]` (serial + 1);
   - `topUpReservations(...)`: 02 §3.5's quotas counting the waiting ships' holdings; only new ships are given what's missing; a kept sleeper means no new roll;
   - the Debris guarantee on new layer-3 ships only (risk 4);
   - `rollShipDetails`, then `validateShipDef(shipDefOf(...))` on every new ship.

   Waiting ships stay byte-identical except `runsOnChart` (asserted).

**The steady-arm rule** is steps 2–4 together, exactly as 02 §3.12 defines it. **The time valve** never opens upward (02 §3.12 step 6).

**map-generator.ts edits (WORLD):**
- export `placeReservations`' pieces as `topUpReservations(arm, newSlots, armSeed, run, attempt)`; `freshArm` calls it with every slot new, so its output is unchanged;
- `freshArm(armSeed, run, start, names?: { final: string }, finalFloor?: number)`;
- export `bestRoutePods(arm, startYear)`;
- `MAP_GENERATOR_VERSION` → 2: final names by serial change what a run ≥ 2 fresh roll names.

**map-run.ts `createRunMap(lineage, seed)` (WORLD):**
- `lineage.arm` set: its ships, start year, run (asserted equal to `wave`) and arm seed;
- else run 1: `assembleRun1Arm(lineage.armSeed ?? seed)`;
- else (suites, `__ap.runNumber`, a content reset): `freshArmState`;
- noise is `rollNoiseClouds(noiseRng(seed))`, by the **run seed** (02: noise per run; identical on run 1, where a fresh archive's arm seed is the page seed);
- `map.history` comes from `lineage.history`.

### 2.4 Archive v2 and the lineage (`src/systems/meta.ts` SAVE; `src/systems/lineage.ts` WORLD, pure)

**v2 record:**
- `armSeed`;
- `arm: ArmState | null`: null means run 1's assembled arm from `armSeed`, rebuilt on demand;
- `activeRun` adds `route: number[]`, kept up to date at each ship start, so abandoning never needs the save;
- `lastUnit` (§2.5);
- `colonies`, capped `COLONY_HISTORY_MAX_PER_WORLD`;
- `routes`, the last `ROUTE_HISTORY_RUNS` (3);
- `events`, at most `NOTABLE_EVENTS_MAX` (4) for the last run;
- `traces: []`;
- `notes: { olderArchive, armReset }`, each said once on the title and then cleared.

`mergeBonus` is dropped (risk 3).

**Load:**
- if v2 is missing and v1 is present: a fresh v2 with `notes.olderArchive = true`;
- `freshMeta().armSeed` is the page's run seed, so `?seed=N` on a cleared archive replays run 1 exactly as today;
- `parseMeta` stays strict, field by field;
- an arm whose content differs is replaced by `freshArmState(armSeed, runs + 1, arm.startYear, null)` (`notes.armReset`). An abandoned `activeRun` found with it records `trail: null`, because its slots belong to the old arm.

**Run end:** `archiveRunEnded(store, cause)` (called from `endRun`) does:

```text
trail  = trailOf(run, cause)                     // lineage.ts
upd    = updateArm({ from: run.map (the arm as played), visited: route slots }, seededDice(...))
meta  := recordRunEnd(meta, { …, trail, colonies, routes, events, arm: upd.next })
```

Then it writes, `clearRunSave()` runs, and the store gets `run.next = { unit, run, startYear, gap, valveYears }` for RUN END's bridging line. The update is computed even without an archive (headless and arm), so `run.next` is real in the suites. The classic world skips it.

**lineage.ts (pure, WORLD):**
- `trail046(): UnitTrail` (UNIT_046_TRAIL as a trail; the cross 6 LY past Calder);
- `unitTrailOf(run)`: `run.lastUnit?.trail ?? (map.run === 1 ? trail046() : null)`, the one reader for the chart, the ghost, letters and the beacon;
- `trailOf(run, cause)`: one stop per route stop. Year is the arm ship's approach; outcome, `landedInLz`, colony and writer come from `ShipResult` (the first featured colonist of the first pod down in an LZ). `lost` is set for the causes `flagship-lost | stayed | overwritten | abandoned` at the last stop;
- `coloniesOf(trail)`;
- `notableEvents(run)`: from what exists now (a DEAL accepted, the best colony, a ship lost); residents are slice 5's;
- `ghostPlaceReached(run, lastUnit)`, moved from meta.ts by F: never ship 1; with `trail.lost`, `layerOf(current world) ≥ layerOf(lost.slot)`; else the final ship; a null trail means the final ship;
- `beaconOnFirstShip(state): { unit, yearsAgo } | null`: depth 1 on the arm, the trail has a stop at w0 whose outcome is in orbit (`locked | partial`), and `yearsAgo = map.startYear − stop.year`;
- `letterSourcesFromTrail(run): LetterSource[]`: one per stop with a colony and `landed > 0`, id `letter:<run>:<slot>`, `landedYear = stop.year`, `toUnit = trail.unit`. Run 1 keeps MERIDIAN (046's trail);
- `olderColonies(map)`: `history.colonies` with `year ≤ galaxyYear`.

### 2.5 Type sketches

```ts
// src/types/lineage.ts (F; WORLD after)
export type LeaveReason = 'done' | 'first-past' | 'drifted' | 'aged' | 'resolved' | 'off-pattern-ark' | 'made-room' | 'unreachable';
export type LeaveWords = 'colony' | 'no-colony' | 'core-coming' | 'own-way' | null;
export interface Departure { slot: number; name: string; reason: LeaveReason; words: LeaveWords }
export interface TrailStop {
  slot: number; shipName: string; year: number; outcome: ShipOutcome | null;   // null: the ship it was on when abandoned
  landed: number; colony: string | null; writer: { name: string; age: number } | null;
}
export interface TrailLost { slot: number; year: number; pastLy: number; cause: LastCause }
export interface UnitTrail { unit: number; run: number; startYear: number; stops: TrailStop[]; lost: TrailLost | null }
export interface ColonyRecord { run: number; unit: number; slot: number; year: number; landed: number; name: string }
export interface RouteRecord { run: number; unit: number; slots: number[] }
export interface NotableEvent { kind: 'deal-accepted' | 'best-colony' | 'ship-lost'; slot: number; shipName: string; value: number }
export interface ContentVersions { arm: number; generator: number; update: number; mapState: number; catalogue: number }
export interface ArmState {
  armSeed: number; run: number; startYear: number; gap: number; valveYears: number;
  finalSerial: number; lastFinal: { name: string; year: number } | null;
  ships: ArmShip[]; departures: Departure[]; content: Omit<ContentVersions, 'catalogue'>;
}
export interface MapHistory {           // RunMapState.history ({gap:0,…} empty on run 1 and the classic world)
  gap: number; valveYears: number; lastUnitNumber: number | null; departures: Departure[];
  colonies: ColonyRecord[]; routes: RouteRecord[];
}
export interface NextLaunch { unit: number; run: number; startYear: number; gap: number; valveYears: number }

// systems/meta.ts LastUnit v2 (woke → landed; layer/worldSlot → trail)
export interface LastUnit {
  number: number; landed: number; shipName: string; cause: LastCause; stats: UnitStats; hollowUnits: number[];
  trail: UnitTrail | null; skills: null;     // skills: slice 4 (03 §3.11)
}
// RunLineage gains: armSeed: number; arm: ArmState | null; history: MapHistory (mergeBonus kept as a field, always false)

// src/types/save.ts (F; SAVE after)
export type SavePoint = 'run-start' | 'ship-done' | 'beam' | 'ending-chosen';
export interface ResumeLine { unit: number; depth: number; ship: string; year: number; point: SavePoint }
export interface BootPayload { kind: 'boot'; run: RunState; carried: CarriedRacks | null; threat: ShipThreat }
export interface WorldPayload { kind: 'world'; phase: 'desk' | 'report'; run: RunState; slices: ShipSlices }
export interface RunSave {
  saveVersion: 1; mode: 'standard'; content: ContentVersions; writtenAt: number;
  unit: number; run: number; archiveRuns: number; point: SavePoint; resume: ResumeLine;
  payload: BootPayload | WorldPayload; log: LogState; done: string[];
}
export type SaveStatus = 'none' | 'ok' | 'offline' | 'cant-resume';
export interface SaveState { status: SaveStatus; resume: ResumeLine | null; reason: string | null }  // GameState.save
// schema.ts: GameState.save; RunState.next: NextLaunch | null; RunMapState.version: number; RunMapState.history: MapHistory
```

### 2.6 Pure versus stateful

**Pure:**
- map-update.ts (with injectable dice);
- lineage.ts;
- the codec and checks in run-save.ts (`encodeRunSave`, `decodeRunSave`, `saveRefusal(save, meta)`, `resumeLineOf`, `savePayloadAt(state, point, build)`);
- meta.ts's record steps (`recordRunEnd`, `recordAbandon`, `parseMeta`, `loadMeta`);
- the desk, title and tally models.

A suite can run 200 consecutive updates, round-trip every payload and read every title or chart line with no store.

**Stateful:**
- meta.ts's live half;
- run-save.ts's live half (`openRunSave`, `writeRunSave`, `clearRunSave`, `resumeRun`, `abandonRun`);
- run.ts's calls at the points;
- boot.ts's `startBootFromTitle`;
- the views.

### 2.7 Seams (named in code comments)

- **Slice 4:** `run.skills` rides in `RunState`; adding it bumps `RUN_SAVE_VERSION` and adds a field check in `checkSavedRun`. `lastUnit.skills` is filled by slice 4 (no META bump: the type is `null | SkillRecord[]` from then). A reload at the desk restores the bank as it was at SHIP DONE (03 §8 item 4: consistent).
- **Slice 5:** `topUpReservations` already keeps the quotas. Residents on waiting ships persist with the ship and count toward caps (04 §3.11). `MessageKind` additions are re-derived.
- **Slice 7:**
  - ENDING CHOSEN moves to step 2's confirm (`writeRunSave(store, 'ending-chosen')` is one call);
  - `Meta.traces` and `ArmShip.reserved.tracePlace` are placed by the update (step 4's quota hook, `topUpReservations` gains a trace argument);
  - `events` feed `047.log`;
  - `lastFinal` feeds REASSIGNMENT's wait;
  - the bridging line moves from RUN END to the final card;
  - `mergeBonus` is deleted.
- **Ironman later:** see §1.3.

### 2.8 Architecture debt

**Fix in 3c:**
1. `loadMeta`'s automatic abandon becomes explicit (§2.2).
2. Storage provider moves to `storage.ts`.
3. The segment-id and log-entry counters get src helpers. `tests/unit/wp1-rules/flows.ts passSegIds` calls them.
4. `receiveTransmission` → `startBootFromTitle`.
5. `openDesk`'s UI fields → `deskUiOnOpen`.
6. The ghost moves to lineage.ts.
7. `desk.ts trail046` generalises to `unitTrailOf` (046's trail is run 1's last trail).
8. Interim names by run (`finalShipName(run)`) → serial.
9. Noise by the run seed.
10. `FLEET_ROUTE_LY` and `MissionMeta.distanceLy` go.
11. `LastUnit.layer` and `worldSlot` go.

**Leave alone:**
- the parked refactors (script.ts, game.css, tuning grouping: append blocks only);
- the classic world;
- FinaleChoice's order;
- predict, orbit and hollow internals.

---

## 3. The player's walk

1. **Run 1 ends** at LAST LIGHT's report → CONTINUE → RUN TALLY. In one step:
   - the archive records UNIT-047 with its trail (ARES-VII … LAST LIGHT, colonies RIVERSIDE … FIRST LIGHT);
   - the update rolls a gap of 3 (seeded);
   - the run save is deleted.

   Under the tally's NEW RUN: `UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303. IT HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.`
2. **Title** (NEW RUN, or a reload):
   - `ARRIVAL PROTOCOL // OUTWARD BOUND`, `UNIT-048 · YEAR 2303 · LAUNCHED 3 YEARS AFTER UNIT-047`, `runs save between ships`;
   - the faint chart shows the new beacon `FINAL SHIP · LODESTAR · 3023` (its floor: 3020 + 3) and 047's dashed trail;
   - the lineage line reads `last: UNIT-047 · 11,000 landed · PURGE`.
3. **ARES-VIII:**
   - the boot types `> 2 NEW MESSAGES · INBOX`: the welcome, and RIVERSIDE's `for unit 47` (`SENT 2301 · RECEIVED 2303`, tag `FOR UNIT-047`);
   - the LANDING REPORT reads `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-047 · 3 YEARS AGO`.
4. **First desk:**
   - the opening block: `PETREL · ANOTHER CORE IS ON ITS WAY`, `SHEARWATER · IT WILL COME IN ON ITS OWN`;
   - new nodes tagged `REPORTED HOME`;
   - ALBATROSS's card has the history row `2ND RUN ON THE CHART` and reads `11 YRS EARLY`;
   - 047's trail markers at Tessaly and Brine read `HALCYON · TAKEN · UNIT-047 GETS THERE FIRST`, beside PATIENCE and STEADFAST;
   - CONTROL: `UNIT-047 got here first. :)`.
5. **Second desk** (2355): HALCYON's marker turns green with a rising note, `<colony> · 3 YEARS OLD · UNIT-047`. Older colonies show as faint dots.
6. **Mid-run reload** at the KESTREL-equivalent's desk:
   - the title shows `RESUME · UNIT-048 · SHIP 3 DONE · AT THE DESK · 2470`, [RESUME ▸] [NEW RUN];
   - RESUME opens the same desk (the greying beat replays), the INBOX read marks are kept, and the request in flight is still IN TRANSIT;
   - a reload after TRANSMIT ▸ shows `RESUME · UNIT-048 · SHIP 4 · bound for TIDINGS · 2626`, and the boot replays with the same hits and seeds.
7. **The ghost.** If UNIT-047 had been lost at CORMORANT, the trail would end in a grey cross at Avalon (layer 6), and 048's ghost line would type at its first boot in layer 6 or beyond.

---

## 4. Data

### 4.1 Tuning (`3c WORLD`, each with its WHY; cross-checked against `arm_sim.py`)

| Constant | Value | Source / check |
|---|---|---|
| `LAUNCH_GAP_TABLE` | `[[0, .10], [1, .35], [2, .25], [3, .12], [5, .10], [10, .06], [20, .015], [35, .005]]` | 02 §3.1 = sim `GAP_TABLE`. Mean 2.785, median 2 (sim 2.69–2.81; 10,000-roll test) |
| `DRIFT_LIMIT_YEARS` | 10, strictly greater | sim `start − born_start > DRIFT_LIMIT` |
| `VALVE_FLOOR_PODS` / `VALVE_YEARS` | 63 / 11 | sim; best route without the TIGHT cost |
| `MAX_RUNS_ON_CHART` | 3 (leaves at `runsOnChart > 3` after the increment) | sim `age >= MAX_AGE` with age from 0 |
| `RESOLVE_CHANCE` / `RESOLVE_CORE_SHARE` | 0.2 / 0.5 | 02 §3.12 step 2; authored ships exempt (sim) |
| `FINAL_FLOOR_MIN_GAP_YEARS` | 1 | 02 §3.4 `max(gap, 1)` |
| `UPDATE_REPAIR_FROM_ATTEMPT` / `UPDATE_FEEDER_FROM_ATTEMPT` | 5 / 10 | sim |
| Reused | `GEN_MAX_ATTEMPTS` 50, `LIGHT_SHARE` 0.4, `MAX_LATE_TIGHT_PER_LAYER` 2, `SLEEPER_CHANCE` 0.45, `ARK_PATTERNS` | 3a |
| `COLONY_HISTORY_MAX_PER_WORLD` | 8 | archive size over 200 runs (~1,000 colonies otherwise) |
| `ROUTE_HISTORY_RUNS` / `NOTABLE_EVENTS_MAX` | 3 / 4 | 02 §3.12 |

**`3c SAVE`:**
- `RUN_SAVE_KEY = 'arrival-protocol/run/v1'`;
- `RUN_SAVE_VERSION = 1`;
- `META_STORAGE_KEY = 'arrival-protocol/meta/v2'`, with `META_V1_KEY` kept only to detect;
- `META_VERSION = 2`;
- `SAVE_SIZE_INFO_BYTES = 400_000` (the round-trip suite prints the size, INFO).

**`3c UI`:** `TAKEN_MARK_OFFSET_PX`, `LEAVE_BLOCK_MAX_LINES = 6`.

### 4.2 Leaving reasons (sim rates per run, `results.txt`, the mix player)

| Reason | Words (`MAP_TEXT.chart.leave`, PLACEHOLDER(05)) | Rate |
|---|---|---|
| done | colony marker / `NO COLONY` | 6.04 |
| first-past | (silent; ARES is always new) | 1 |
| aged | `IT WILL COME IN ON ITS OWN` | 2.13 |
| resolved | `ANOTHER CORE IS ON ITS WAY` / `IT WILL COME IN ON ITS OWN`, 50/50 | 2.16 |
| drifted | `IT WILL COME IN ON ITS OWN` | 0.91 |
| unreachable | own way; a late TIGHT blocker: `ANOTHER CORE IS ON ITS WAY` | 0.05 |
| made-room | `ANOTHER CORE IS ON ITS WAY` (02 is silent: recommended) | 0.03 |
| off-pattern-ark | `ANOTHER CORE IS ON ITS WAY` | rare |

### 4.3 The §3.14 update fixture (`tests/unit/world/run2-fixture.ts`; scripted dice)

**The scripted rolls:**
- gap 1;
- PETREL `core-coming` and SHEARWATER `own-way`, every other ship stays;
- the pattern is kept (3,5,7) and Cinder takes the ark;
- the refill order puts Marrow and Greywater first (light);
- jitter 0, with BELLWETHER and MORNING STAR late and TIDINGS' ark extra 3;
- the names are §3.14's.

**Expected:**
- 12 ships wait, each on its 2nd run;
- ARES-VIII 2301;
- BELLWETHER 2362 L 3 TIGHT;
- PATIENCE 2353 5;
- STEADFAST 2468 6;
- TIDINGS 2623 ark 16 (GANNET 2612 + 26 − 12 − 3);
- MORNING STAR 2858 L 5 TIGHT;
- FAR WIND 2818 9 FULL;
- LODESTAR 3021 (its own sum 3020, floor 3020 + 1);
- 6 lights, 3 arks;
- the first attempt passes;
- ALBATROSS is 13 years early from ARES-VIII;
- run 2's best by length is 13,200 / 13,800 / 13,600 / 12,800.

All of these were recomputed by hand against the arm table.

### 4.4 Version constants

| Constant | Value |
|---|---|
| `ARM_CONTENT_VERSION` | 1 |
| `MAP_GENERATOR_VERSION` | 1 → **2** |
| `MAP_UPDATE_VERSION` | 1 (new) |
| `MAP_STATE_VERSION` | 1 (new) |
| `REPO_CATALOGUE_VERSION` | 1 |
| `RUN_SAVE_VERSION` | 1 |
| `META_VERSION` | 2 |

**Who checks what:**
- the archive's arm: arm, generator, update and map state;
- the save: all five, plus its own version.

### 4.5 Statistic bands (`world/update-stats`, against `results.txt`'s persistent rows)

| Statistic | Band |
|---|---|
| Best route, pods | p1 ≥ 64; p10 66–68; median 67–69; p90 69 |
| Best pods drift, runs 1–40 → 161–200 | < 0.5 |
| Correlation, pods taken last run vs next best | \|r\| < 0.15 |
| Ships waiting at RUN START | median 7–10 |
| New ships per update | 10–13 |
| Ages at RUN START | new 48–58%, 2nd run 25–35%, 3rd 13–21% |
| Launch gap | mean 2.5–3.1; max ≤ 35 |
| Valve | opened in ≤ 0.1% of runs |
| First attempt passes | 70–85%; none throws |
| Classes | FULL 30–38%, COMPACT 33–41%, TIGHT 25–33% |
| Late TIGHT ships | 2.3–3.1 per arm; on the best route ≤ 2% |
| Ships on some route | all 20, every run |
| New final ship | 80–92% of runs |
| Authored ships | none waiting by run 4 when not visited |
| Span, first to final ship | median 725–738 |
| Request from ship 2 reaches ship 3 | ≥ 88% |

**INFO only:** runs with no reachable DEBRIS ship at depth 2 (risk 4); the reservations' quotas held in every run.

---

## 5. Work breakdown

### 5.0 FOUNDATION (one agent, one commit; typecheck and every suite green; no visible change)

1. **Types:**
   - `src/types/lineage.ts` and `src/types/save.ts` (§2.5);
   - schema.ts: `GameState.save`, `RunState.next`, `RunMapState.version` and `history`;
   - `LastUnit` v2 and `RunLineage.armSeed / arm / history`;
   - `createRunState` and `createInitialState({ save? })` defaults;
   - every `RunMapState`, `LastUnit` and `RunLineage` literal in src and tests updated: `woke` → `landed` (37 sites, compiler-led), `trail: null`, `skills: null`, `version`, `history: EMPTY_HISTORY`. These are lead-approved mechanical test edits.
2. **Versions and keys** (§4.4), and `contentVersions()` in run-save.ts.
3. **`src/systems/storage.ts`** (moved). Real `memory-ops highestSegId / reserveSegIds`, `say.ts reserveLogEntryIds`; `flows.ts passSegIds` calls them.
4. **The codec, real:** `encodeRunSave` / `decodeRunSave`, the Infinity tag, the classic throw, `saveRefusal`.
5. **Stubs with final signatures** that throw `TODO(3c-WORLD)` / `TODO(3c-SAVE)` / `TODO(3c-UI)` or return empty:
   - `updateArm` stub: `freshArmState` at gap 1 with no departures, so the page keeps playing;
   - real `rollLaunchGap`;
   - lineage.ts: real `trail046` and `unitTrailOf`, real `ghostPlaceReached` moved unchanged (layer logic kept until WORLD), stub `trailOf` returning a stops-only trail;
   - run-save.ts live functions (no-ops while `status === 'none'`);
   - `startBootFromTitle` and `deskUiOnOpen` extracted (real; no behaviour change).
6. **Text:** every 3c string in `map-text.ts` (`MAP_TEXT.save.*`, `title.launched`, `chart.taken / leave / reportedHome / runOnChart / colonyAge / lostCross`, `card.history`, `report.beacon`, `runEnd.bridge`), `PLACEHOLDER(05)`, each ≤ 70 characters at its worst case.
7. **Tuning:** blocks `3c WORLD`, `3c SAVE`, `3c UI`. `FLEET_ROUTE_LY` and `MissionMeta.distanceLy` removed.
8. **`events.ts`:** `'save-lost'`.
9. **Debug signatures:** `__ap.save()`, `saveCorrupt()`, `saveClear()`, `updateArm(route?)`, and `archiveAs(cause)` (v2: run 1 on the worked route through the real update).
10. **`tests/unit/world/run2-fixture.ts`:** §3.14's run-1 results, run 1's trail, and the run-2 arm as data with scripted dice (§4.3), so UI builds against real shapes before WORLD merges.

### 5.1 Track WORLD (the pure world update and the lineage data)

**Owns:**
- `types/lineage.ts`, `systems/map-update.ts`, `systems/lineage.ts`;
- `systems/map-generator.ts`, `systems/map-run.ts`, `data/ship-names.ts`;
- tuning `3c WORLD`;
- `tests/unit/world/**`.

**Steps:**
1. The gap, `seededDice`, steps 1–5, the repairs, the valve.
2. `topUpReservations`, names, the Debris guarantee on new ships, the ARES and final serial.
3. `freshArmState` and the content reset helper.
4. `createRunMap` from `ArmState`, `map.history`, noise by the run seed.
5. lineage.ts: `trailOf`, `coloniesOf`, `notableEvents`, the ghost by trail, `beaconOnFirstShip`, `letterSourcesFromTrail`, `olderColonies`.
6. The suites (§6).

### 5.2 Track SAVE (codec, points, resume, archive v2, failure paths)

**Owns:**
- `types/save.ts`, `systems/run-save.ts`, `systems/meta.ts`, `systems/storage.ts`;
- `state/instance.ts`, `state/initial.ts`, `systems/run.ts`, `systems/boot.ts`;
- `systems/memory-ops.ts`, `systems/say.ts` (counter only), `src/debug.ts`;
- tuning `3c SAVE`;
- `tests/unit/save/**`, and the wp8 suites' migration (`wp8/meta`, `wp8/ghost`, `wp8/run-flow`, `opening/ghost-placement`, `map/run1-roll`'s M3 block).

**Steps:**
1. Archive v2: parse, load, detect v1, content reset, `recordRunEnd` with trail, colonies, routes, events and arm, `recordAbandon`, `activeRun.route`.
2. The live save: open, write at the four points, offline handling, `'save-lost'`, clear at `endRun`.
3. The page's open sequence (§2.2) and `resumeRun` / `abandonRun`.
4. `endRun`: the update, `run.next`, the archive write, the clear.
5. Debug helpers.
6. The suites.

### 5.3 Track UI (title, chart, card, tally, letters, beacon)

**Owns:**
- `components/title/TitleCard.ts`, `index.html` (RESUME block nodes);
- `components/run/RunEnd.ts`, `systems/run-end.ts`;
- `components/desk/*`, `systems/desk.ts`, `systems/inbox.ts`;
- `systems/landing-report.ts` and `components/run/LandingReport.ts` (the beacon row);
- `components/footer/Footer.ts` (`NO SAVE`);
- `data/map-text.ts`, `data/script.ts`, `data/inbox-text.ts`, `styles/*`;
- tuning `3c UI`;
- `tests/unit/map/run2-chart`, the `map/text` extension;
- `tests/e2e/**`.

**Steps:**
1. **Title:**
   - the RESUME block ([RESUME ▸] on ENTER, [NEW RUN] with an inline confirm);
   - CAN'T RESUME with [ABANDON RUN] only; RECEIVE TRANSMISSION hidden while a save exists;
   - the launch line; `runs save between ships`; the once notes (older archive, arm reset).
2. **Chart model:**
   - `unitTrailOf` markers: TAKEN until the year passes, then a colony with its age, `NO COLONY`, the grey cross; the rising `chime` as one turns green;
   - older colonies as faint dots;
   - `REPORTED HOME` on the run's first desk;
   - the card's `history` row (`REPORTED HOME` / `2ND RUN ON THE CHART` / `3RD`);
   - the departures block on the run's first desk;
   - the one-liner `UNIT-047 got here first. :)`;
   - phone layout.
3. **Letters:** `letterSources` from `letterSourcesFromTrail`; bodies from the writer; `FOR UNIT-047`.
4. **The beacon row** on ship 1's report.
5. **RUN END:** the bridging line from `run.next`, and the archive line.
6. **e2e** (§6.3).

### 5.4 Shared hot files and order

| File | Owner | How others add |
|---|---|---|
| `schema.ts`, `events.ts` | F | lead-approved one-liners |
| `run.ts`, `meta.ts`, `initial.ts`, `instance.ts`, `boot.ts`, `debug.ts` | SAVE | WORLD and UI request helpers by message |
| `map-run.ts`, `map-generator.ts`, `lineage.ts`, `ship-names.ts` | WORLD | SAVE and UI read; requests by message |
| `map-text.ts`, `script.ts`, `desk.ts`, `inbox.ts`, `inbox-text.ts` | UI | WORLD's and SAVE's words requested (F seeded them all) |
| `tuning.ts` | F creates blocks | each track only inside its block |
| `classic-five.ts` | frozen | lead only |

**Order:**
1. F, then review.
2. The three tracks start together. SAVE integrates against F's working `updateArm` stub; UI against `run2-fixture`.
3. Merge WORLD first (the real update and the trail), then SAVE (wires them into run end and abandon), then UI.
4. The lead re-runs `world/*`, `save/*` and `map/run2-chart` after each merge.

**Cycle guard:**
- lineage.ts and map-update.ts must not import `data/script.ts`, meta.ts or run.ts;
- run-save.ts imports run.ts only through the functions it calls (`resetWorldForShip`, `deskUiOnOpen`), never the other way. run.ts calls run-save's `writeRunSave`, so `writeRunSave` lives in a leaf `systems/save-write.ts` if `wp12/fix1/entries` finds a cycle.

---

## 6. Tests

The tier is about 198 s on 4 workers against the 300 s cap. New suites are pure or store-level (`createInitialState({ map })`, `endShip`, `openDesk`, `setCourse`, `transmitNext` with `support/landing-instant.ts`), with no flights. That adds about 15 s serial.

### 6.1 New suites

| Suite | Owner | Checks |
|---|---|---|
| `world/update-fixture` (<1 s) | WORLD | §4.3 cell by cell; departures and their words; waiting ships byte-identical except `runsOnChart` |
| `world/update-rules` (~2 s) | WORLD | (list below) |
| `world/update-stats` (~5 s) | WORLD | 2 chains × 50 runs, mix player, 15% failed runs: §4.5's bands at quick tolerances |
| `world/update-stats-full` | WORLD | `// BALANCE_ONLY: 12,000 consecutive runs`: 20 chains × 200 × {best, random, mix}, full bands, plus the fresh-roll baseline |
| `world/lineage` (<1 s) | WORLD | (list below) |
| `save/codec` (~2 s) | SAVE | (list below) |
| `save/resume` (~4 s) | SAVE | (list below) |
| `save/failures` (~1 s) | SAVE | (list below) |
| `save/archive-v2` (~1 s) | SAVE | (list below) |
| `map/run2-chart` (~1 s) | UI | (list below) |

**`world/update-rules`:**
- a gap of 20 clears the arm, final ship included, all `own-way`;
- a gap of exactly 10 keeps last run's ships;
- a 3rd-run ship leaves;
- authored ships never resolve by chance;
- w0 always leaves;
- an unvisited final ship waits, and a new one sits on its floor;
- the ark pattern: kept, tie, off-pattern, made-room;
- the light share is restored, and never a 3rd light ship from layer 5;
- the valve (forced with `valveFloor: 70`): +11, every waiting ship leaves, `valveYears: 11`;
- repairs from attempt 5;
- a throw after 50 (impossible dice);
- determinism, and a different arm seed differs;
- the reservations' quotas after 50 updates;
- names unique;
- ARES and final names;
- every new ShipDef valid;
- the gap table over 10,000 rolls.

**`world/lineage`:**
- `trailOf` from run 1's results;
- the cross for each lost cause;
- the ghost by trail (never ship 1; a won run speaks at the final ship);
- the beacon: `1 YEAR AGO`, `THIS YEAR`, `3 YEARS AGO`, and none when ship 1 had no landing;
- letters: one per colony, `SENT 2301 · RECEIVED 2301` at gap 1; at gap 0, read later or never;
- MERIDIAN on run 1 unchanged.

**`save/codec`:**
- states at all four points round-trip deep-equal, on the worked route (repo fixture);
- the Infinity tag;
- classic throws;
- each version and content field mismatched in turn;
- missing and extra keys;
- size printed (INFO).

**`save/resume`:**
- BEAM resume equals the state right after the original `startShip` (minus rev, ui and log ids);
- SHIP DONE resume, then `setCourse`, gives the same plan, offer and deliveries;
- ENDING CHOSEN resume, then CONTINUE, writes the archive once and clears the save;
- RUN START resume;
- `resetReport()` is empty;
- **the counter in a fresh process:** the suite re-runs itself as a child with `node --import tsx`, decodes, resumes, makes 50 runtime ids and finds no duplicate.

**`save/failures`:**
- stub providers that throw on reach, get, set and remove → `offline` and `'save-lost'`, and play continues;
- corrupt JSON → `cant-resume` with its reason;
- unit and run mismatch, stale, archive corrupt;
- ABANDON records `abandoned` with `activeRun.route`, and the update ran with those ships done;
- NEW RUN over a save abandons;
- a page with `activeRun` and no save abandons on open.

**`save/archive-v2`:**
- strict parse per field;
- v1 present → fresh v2 plus the note once;
- the content reset keeps colonies and lineage;
- the caps;
- `trail: null` for an abandoned run from the old arm.

**`map/run2-chart`:**
- TAKEN until 2352, then `· 52 YEARS OLD · UNIT-047`;
- the grey cross;
- `REPORTED HOME` on the first desk only;
- the history row;
- the departures block;
- older dots only when the galaxy year has reached them;
- the title and resume lines (`map/text`, ≤ 70 characters).

### 6.2 Changed suites

- **wp8/meta:** the recovery test becomes "abandoned only without a save".
- **wp8/ghost, opening/ghost-placement, map/run1-roll:** layer → trail.
- **map/inbox:** run 2 letters.
- **wp8/run-flow, wp8/p2/ui-models:** the title line.

The classic suites are untouched (no saves, no updates).

### 6.3 e2e (once, at the end)

**New `tests/e2e/scenarios/resume.mjs`:**
1. `__ap.archiveClear()`, `__ap.saveClear()`, reload.
2. RECEIVE; land ship 1 (`__ap.landAll`); CONTINUE; reload.
3. Check the RESUME block text, then RESUME → the same desk.
4. HALCYON, SET COURSE, card, TRANSMIT; reload during HALCYON's boot.
5. RESUME → the boot's lines equal the first boot's (captured).
6. `__ap.saveCorrupt()` and reload → CAN'T RESUME with only [ABANDON RUN] → abandoning gives the UNIT-048 title.
7. `__ap.archiveAs('won-purge')` and reload → `LAUNCHED n YEARS AFTER UNIT-047`, the TAKEN markers and the departures block at the first desk, the beacon row, the `FOR UNIT-047` letter.

**`playthrough.mjs`:** the NEW RUN check becomes "run 2 on the updated arm" (ARES-VIII, the launch line, 047's trail).

**Others:** `map-desk` and `run-flow` call `saveClear()` beside `archiveClear()`.

This adds about 3 minutes.

---

## 7. Risks and open questions (each with a recommended answer)

1. **ENDING CHOSEN before slice 7.** Today the finale's choice comes mid-landing (one step), and MERGE resumes the landing. A save at the choice would be a mid-ship save.
   - **Recommend:** write `ending-chosen` when the final ship's LANDING REPORT opens with a decided finale. That resumes exactly where 02 §3.11 says.
   - **The cost:** a reload between the choice and the report replays the final ship, and the choice can be made again.
   - **Accept:** slice 7 moves the choice after the landing and closes the window. Report it to Fran.
2. **Archive v1 is not carried over** (02 §3.12). Fran's 3a/3b playtest archives restart at UNIT-047. **Recommend:** follow the spec; the title says it once.
3. **`mergeBonus` retires** (DECISIONS round 2 #5 "nothing carries"; 05 §5 "MERGE's old next-run Core is gone"). The run after a MERGE loses phase 2's extra thread.
   - **Recommend:** drop it from v2; `lineageOf` gives false; slice 7 deletes the code.
   - It is decided, so report it rather than raise it.
4. **The Debris guarantee on a persistent arm.** Waiting layer-3 ships can't be changed, so some runs ≥ 2 may have no DEBRIS ship reachable at depth 2.
   - **Recommend:** apply it on new ships only, and measure the share (INFO).
   - **Lever if it exceeds 10% of runs:** treat "no DEBRIS ship reachable from w0" as a check failure, so new ships re-roll.
5. **Name pool and reuse.** 21 names for 18 slots; about 9 waiting and about 4 on the trail can leave fewer free names than new ships need.
   - **Recommend:** exclude names on the chart (hard), and avoid the trail's and the departures' names while the pool allows (soft).
6. **ARES ends at run 81** (`aresName` throws). A kid on run 82 would crash in the update.
   - **Recommend:** past run 81, `ARES-<n>` in Arabic numerals (≤ 12 characters), with a comment; raise it with 05's owner.
7. **Abandon on a missing save.** If saves are offline, a reload abandons the run and its ships count as done.
   - **Recommend:** accept. The OFFLINE line warned the kid, and it matches 02's "abandoned" rule.
8. **Save size.** The estimate is 150–250 KB at a world point (the log is the largest part).
   - **Recommend:** measure in `save/codec`.
   - **Lever:** keep the last `LOG_SAVE_MAX_ENTRIES` TERMINAL entries if over `SAVE_SIZE_INFO_BYTES`. QuotaExceeded already follows the OFFLINE path.
9. **Two tabs:** the last write wins. A save from the other tab's run is stale, which gives CAN'T RESUME. **Recommend:** document it, as the archive does.
10. **TAKEN markers at the same world as a REPORTED HOME ship** crowd the chart.
    - **Recommend:** draw the trail marker as a small hollow square offset by `TAKEN_MARK_OFFSET_PX` along the trail, and keep the live node.
    - Check it at 1280 × 720 and on the phone.
11. **INBOX volume** (Fran: leave as built, about 20). Letters add at most 6 a run. **Recommend:** build to 05 §3.3, and print the count per boot in `world/lineage`.
12. **The time valve uses best-route pods without the TIGHT cost** (as the sim). **Recommend:** keep it; the sim found no late TIGHT ship on the best route.
13. **Debug arms.** `endRun`'s update always reads the run's own map (`__ap.runNumber` and `__ap.route` update what was played), while abandonment uses `meta.arm`. **Recommend:** as stated.
14. **Run 1 starts on the authored arm**, not a fresh roll as in the sim. Over 200 runs the effect is negligible. **Recommend:** keep the bands from the sim and report run 1's own row.

No decided item looks likely to hurt gameplay once built, apart from those reported above: 1, 3, and 4 if its INFO goes over 10%.

### Critical Files for Implementation
- /home/user/ArrivalProtocol/src/systems/meta.ts
- /home/user/ArrivalProtocol/src/systems/run.ts
- /home/user/ArrivalProtocol/src/systems/map-generator.ts
- /home/user/ArrivalProtocol/src/systems/map-run.ts
- /home/user/ArrivalProtocol/docs/phase3/map-sim/arm_sim.py

---

## Deviations (foundation)

Recorded by the foundation agent (`Slice 3c F`). Each is a change from §2–§5 above, with its reason. Nothing changes
behaviour: the page plays run 1 to the desks as before (checked in Chromium), and every suite stays green.

### Architecture

1. **The save is three modules, not one `run-save.ts`** (the §5.4 cycle guard, applied up front instead of waiting for
   `wp12/fix1/entries`):
   - `systems/save-codec.ts`, pure: `SAVE_POINTS`, `contentVersions`, `savePayloadAt`, `resumeLineOf`, `buildRunSave`,
     `encodeRunSave`, `decodeRunSave`, `saveRefusal`;
   - `systems/save-write.ts`, the live session (a leaf below run.ts and boot.ts): `openRunSave`, `writeRunSave`,
     `clearRunSave`, `closeRunSave`;
   - `systems/run-save.ts`: `resumeRun`, `abandonRun` (may import run.ts and boot.ts) and a re-export of both others, so a
     caller still has one import.
   run.ts and boot.ts import only `save-write.ts`; nothing imports `run-save.ts` yet.
2. **`writeRunSave(store, point, boot: BootParts | null = null)`.** The BEAM point's racks and verdict are not in the store
   once startShip has built the ship, so the caller passes them (`types/save.ts BootParts`). RUN START passes
   `{ carried: null, threat: nominalShipThreat(0) }`; the world points pass nothing. Still one entry point.
3. **The three easy points are wired now, as no-ops.** `receiveTransmission` (after the archive counts the run), the
   simulation retry, `openDesk` (after its update) and `startShip` (when `hop !== null`) call `writeRunSave`, which returns
   at once unless `GameState.save.status === 'ok'`, and nothing sets `'ok'` before Track SAVE's `openRunSave`. This puts the
   final import graph under the entries suite today. ENDING CHOSEN is a `TODO(3c-SAVE)` above `landing.ts finishLanding`.
4. **`UpdateInput.visited` is `readonly Visit[]`** (`{ slot, colony: boolean }`), not `number[]`. Step 1's words (colony
   or `NO COLONY`) need each visited ship's landing, which a bare slot list cannot carry.
5. **`MapHistory.finalSerial`.** The update needs the arm's final-ship serial, and RUN END's update reads the run's own map
   (risk 13), which held no serial. It lives in the history (0 on run 1: LAST LIGHT). `armStateOfMap(map)` (map-update.ts)
   builds `UpdateInput.from` from a map, taking `lastFinal` from the end slot's ship.
6. **`ActiveRun.trail: UnitTrail | null`, not `route: number[]`.** Abandoning needs each visited ship's outcome, landing
   and colony (the trail, and step 1's words), not only its slot. The current ship's stop has `outcome: null`, which is
   what `TrailStop.outcome`'s null was for. The route is the stops' slots. It is null on the classic world.
7. **`TrailStop.shipName: string | null`.** 05 §3.11 writes 046's trail without ships; null is used only there.
8. **`LastCause`, `UnitStats` and `LastUnit` moved to `types/lineage.ts`** (meta.ts re-exports them), so lineage.ts never
   imports meta.ts. `ghostShipIndex` moved with `ghostPlaceReached`. Both are re-exported from meta.ts, so the existing
   suites' imports still work.
9. **`MAP_STATE_VERSION` and `EMPTY_HISTORY` live in a leaf `data/map-state.ts`.** lineage.ts imports map-streams, so
   putting them in map-run.ts or lineage.ts would make a cycle; the suites' literals import them too. `EMPTY_HISTORY` is
   frozen. Makers take `structuredClone(EMPTY_HISTORY)`, so a write through a shared literal throws.
10. **`MapHistory`, `ArmState` and the history records are in `types/lineage.ts`**, as §2.5 sketched. The update's
    interfaces (`UpdateInput`, `ArmUpdate`, `UpdateDice`, `Visit`) are in map-update.ts, beside `updRng(seed, run, pass,
    stream)` and `armContent()`.
11. **meta.ts's `SaveStatus` (the archive write's result) is renamed `MetaWriteStatus`.** `SaveStatus` is now the run
    save's (`types/save.ts`).

### Archive v2 in the foundation (to keep behaviour)

12. **The key flips to `arrival-protocol/meta/v2` (`META_VERSION` 2) now.** `LastUnit` v2 (`landed`, `trail`,
    `skills: null`) changes the stored shape, so keeping the v1 key would read old archives as CORRUPT. A fresh archive
    behaves exactly as before. Playtest archives restart (risk 2, decided); the v1 note on the title is Track SAVE's.
    `META_V1_KEY` is defined for detection.
13. **`Meta` v2 has its final fields** (`armSeed`, `arm`, `colonies`, `routes`, `events`, `traces: []`, `notes`) with a
    strict parse: exact keys, the trail, colonies, routes and events field by field. Two exceptions:
    - `mergeBonus` stays, marked RETIRES. Dropping it now would change the run after a MERGE (wp11/merge-test). Track
      SAVE drops it, and `lineageOf` then gives false (risk 3).
    - A non-null `arm` reads as corrupt (`TODO(3c-SAVE)`), because nothing writes one before SAVE.
    `freshMeta(armSeed = 0)` takes the seed; the page passes nothing yet.
14. **The archive already writes the trail.** `progressOf` stores `trailOf(run, cause)` in `activeRun` (at each ship
    start, cause 'abandoned') and in `lastUnit` (RUN END). The trail has real stops (name, approach year, outcome,
    landed, colony) and no `lost` or writer yet (`TODO(3c-WORLD)`). `ghostPlaceReached` keeps 3a's rule, reading the
    layer from the trail's last stop instead of `LastUnit.layer`, so the ghost speaks where it did. Track WORLD moves it
    to the grey cross.
15. **`RunLineage` gains `armSeed`, `arm` and `history`.** `lineageOf` fills `history` with `EMPTY_HISTORY` until Track
    SAVE. `createRunMap` still rolls by the run seed and run number (`TODO(3c-WORLD)` marks the switch to `lineage.arm`).

### Smaller

16. **`MAP_GENERATOR_VERSION` is bumped to 2 by F**, as §4.4 lists it, even though the change it versions (final names by
    serial) is Track WORLD's. No stored arm carries a generator version yet, so the timing doesn't matter.
17. **`FLEET_ROUTE_LY` / `MissionMeta.distanceLy` were already gone** (3a removed them). Nothing to do.
18. **`updateArm`'s stub** is `freshArmState(seed, run + 1, start + 1, null)` with gap 1 and no departures. It reads no
    dice. `freshArmState` uses `assembleRun1Arm` for run 1, else `freshArm`, with `finalSerial = run − 1` (3a's interim
    naming). `seededDice` rolls a real `gap()`; its other rolls throw `TODO(3c-WORLD)`.
19. **Text** (`map-text.ts`, PLACEHOLDER(05), each ≤ 70 at its worst case, pinned in `map/text`):
    - `title.launched`, `title.savesBetweenShips`;
    - `chart.taken`, `takenNoShip`, `noColony`, `lostCross`, `leave` (by `LeaveWords`), `leaveLine`, `leaveMore`,
      `reportedHome`, `runOnChart`, `controlFirst`;
    - `card.historyLabel` / `history`, `report.beacon`, `runEnd.bridge` and `bridgeTail`;
    - `save.*`: the three RESUME lines by point, the buttons, the confirm, `cantResume` with `reason` keyed by
      `SaveRefusalKind`, `offline`, `footer`, `olderArchive`, `armReset`.

    The colony-age line is the existing `chart.colony`. 02's one-sentence bridge (> 70 characters) is split into `bridge`
    and `bridgeTail`.
20. **Debug:**
    - `__ap.save()` returns `{ state, stored }`;
    - `saveCorrupt()` and `saveClear()` are real;
    - `updateArm(route?)` runs the (stub) update on this run's arm, marking a colony wherever a pod landed;
    - `archiveAs(cause, landed?)` writes the WP8 record in v2's shape with `trail: null`. The worked-route version through
      the real update is `TODO(3c-SAVE)`.
21. **Counters:** `memory-ops highestSegId(json)` and `reserveSegIds(highest)`, and `say.ts highestLogEntryId(log)` and
    `reserveLogEntryIds(highest)`. They never move a counter back. `flows.ts restoreState` reserves both counters (it
    reserved only segment ids before).
22. **`deskUiOnOpen(state)` is exported from run.ts** and returns the five UI fields `openDesk` sets (`memoryRev` stays
    with the caller). **`startBootFromTitle(store, { countRun })`** is exported from boot.ts.
23. **Fixture** `tests/unit/world/run2-fixture.ts` (Track WORLD):
    - `RUN1_RESULTS`, `RUN1_TRAIL`, `RUN1_LAST_UNIT`;
    - `run2Dice()`, stateful: names are handed out in slot order;
    - `run2Arm(seed)`, `run2History()`, `run2Map(seed)`;
    - `RUN2_EXPECTED`, `RUN2_DEPARTURES`, `RUN2_BEST_BY_LENGTH`.

    New ships are timed with the generator's helpers and their details rolled from `ShipKey(seed, 2, slot, 0)`. Their
    reservations are empty until `topUpReservations`. The four middle colony names (LANTERN, GREENSTEP, STARFORD,
    HARBOUR) are the fixture's picks. `world/run2-fixture.test` checks it against §3.14 cell by cell; every number
    matched on the first run, and so did the 13,200 / 13,800 / 13,600 / 12,800 best routes and ALBATROSS's 13 years.
24. **`save/codec.test`** (the skeleton; Track SAVE grows it):
    - a RUN START and an ENDING CHOSEN save round-trip `isDeepStrictEqual`, the sticky Infinity included;
    - encode throws on NaN, on an untagged Infinity and on a classic map;
    - decode refuses, in order: not-json, version, each content field, shape, classic, route, ship;
    - `saveRefusal` catches stale saves.

    A world save at ARES-VII's report is 27.6 KB (INFO). `checkShape` checks only the envelope; the run's field-by-field
    check is `TODO(3c-SAVE)`.
25. **Ownership banners** head every file named in §5.1–§5.3 (the CSS and index.html are left out). `schema.ts` and
    `events.ts` carry the foundation's "one-liners only" banner.

### For the tracks

- **WORLD:** fill the `TODO(3c-WORLD)` items:
  - in map-update.ts: `seededDice`, `updateArm`, and `freshArmState`'s serial and floor;
  - in lineage.ts: `trailOf`'s `lost` and writers, `notableEvents`, the ghost by `trail.lost`, `beaconOnFirstShip`,
    `letterSourcesFromTrail` and `olderColonies`;
  - in map-run.ts: `createRunMap` from `lineage.arm` / `history`, with noise by the run seed.

  `run2Dice().name` is asked in slot order; widen it to `(pool, slot)` if your update asks in another order, and update
  the fixture's reservations once `topUpReservations` exists.
- **SAVE:** every `TODO(3c-SAVE)`:
  - meta.ts: the record steps, the explicit abandon with `abandonActiveRun`, v1 detection, the content reset, the `arm`
    parse, `mergeBonus`'s retirement and the lineage's history;
  - save-write.ts and run-save.ts;
  - ENDING CHOSEN in landing.ts;
  - `checkShape`'s deep checks;
  - the page's open sequence in instance.ts, with `freshMeta(pageSeed)`;
  - `__ap.archiveAs` on the worked route.

  `wp8/meta`'s round-trip literal is v2-shaped now.
- **UI:** the strings are in `map-text.ts`. Build the chart, card, title and tally against `run2Map()` and
  `RUN1_LAST_UNIT`. `desk.ts trail046` becomes `unitTrailOf`; `inbox.ts letterSources` reads
  `letterSourcesFromTrail` from run 2 on.

## Deviations (foundation, review follow-up)

The independent review of `23ad7c7` confirmed these are sound: the codec, the stale rule, the versions, the counters, the
cycle guard and the §3.14 fixture. On the worked route the save round-trips deep-equal at every SHIP DONE and at ENDING
CHOSEN (31–118 KB). Its items were applied in `Slice 3c F: review follow-up`. None was rejected.

### Blockers

1. **`SaveState { status; resume; refusal: SaveRefusal | null }`** replaces the free `reason` string. The title's words
   are `MAP_TEXT.save.reason[refusal.kind]`. `refusal.detail` goes to the console only and is never shown on screen.
   `'offline'` has no refusal (the status says it).
2. **`LetterSource` moved to `types/lineage.ts`** with `writer: { name, age } | null`. Its id is pinned as
   `letter:<trail run>:<slot>`, and 046's MERIDIAN keeps `letter:meridian`, because ids are saved in `run.inbox.read`.
   inbox.ts and lineage.ts import it from there. `Visit` moved there too (map-update.ts re-exports it).
3. **`Meta.armSeed` and `RunLineage.armSeed` are `number | null`**, where null means "the run seed".
   - `freshMeta(armSeed = null)`, so `FIRST_RUN_LINEAGE.armSeed` is null.
   - `loadMeta(storage, armSeed)` and `openRunArchive(provider, armSeed)` give a fresh archive the page seed (WIPE
     ARCHIVE too). instance.ts now picks the run seed before it opens the archive.
   - `createRunMap` rolls the arm from `lineage.armSeed ?? seed` and the noise from the run seed (02: noise per run; §2.8
     item 9 brought forward). Both are the same on run 1 in the page and in every suite.
   - `world/foundation-seams` pins run 1's arm and noise unchanged on the suites' seeds (3, 7, 19).
   - One visible change: in the page a NEW RUN's fresh roll for run ≥ 2 now rolls from the archive's arm seed, not the
     new run seed. That is the plan's persistent seed; WORLD replaces the roll with `lineage.arm`.

### Majors

4. **`mapHistoryOf(arm, lastUnit, colonies, routes)`** (lineage.ts, real) fills `lineageOf`'s history.
   `createRunMap(lineage, seed)` widens to `Pick<RunLineage,'wave'> & Partial<Pick<…,'armSeed'|'arm'|'history'>>`. It
   keeps the lineage's history (`EMPTY_HISTORY` when there is none) and throws when a stored arm's gap, valve years,
   serial or departures disagree with it. The suites' `as never` casts are gone.
5. **`archiveShipDone(store)`** (meta.ts) refreshes `activeRun` with the ship's result. `openDesk` calls it beside
   `writeRunSave(store, 'ship-done')`, so a run abandoned at a desk keeps that ship's colony.
6. **Migrations in place.**
   - The archive key stays `meta/v2`. `parseMeta` runs `migrateMeta` first: `META_MIGRATIONS` (none yet) steps one version
     at a time, from `META_FIRST_VERSION` 2 up to `META_VERSION`. Any other version is corrupt.
   - A new key is only for a deliberate reset. The tuning.ts comment says so, and so does the run save's.
   - `decodeRunSave` runs `migrateRunSave` (`RUN_SAVE_MIGRATIONS`, none yet) before the version check, so slice 4's
     `run.skills` is a migration step rather than a CAN'T RESUME.
7. **`olderColonies`, `beaconOnFirstShip` and `letterSourcesFromTrail` are real**, and `RUN1_TRAIL`'s stops have writers.
   - `letterSourcesFromTrail` reads only the archive's trail; run 1's MERIDIAN stays inbox.ts's.
   - `beaconOnFirstShip` throws on a beacon dated after the run's start.
   - inbox.ts still uses `letterSources`. Wiring the letters in is Track UI's.

### Minors

- **`updateArm(input, dice: (pass: UpdatePass) => UpdateDice = seeded, opts)`**, so a suite can script the valve's pass.
- **`visitsOf(run)`** (lineage.ts) is used by `__ap.updateArm`, and will be by run end and abandon (Track SAVE).
- **`archiveNotesSaid(store)`** (meta.ts) clears the title's one-off notes in a single write. Track UI calls it.
- **New suite `world/foundation-seams`** (<1 s) covers the arm-seed pins, migrations, `mapHistoryOf`, the agreement check,
  `visitsOf`, the beacon, the letters, the older colonies, SHIP DONE's refresh and the notes.

### Ownership (§5)

- `types/lineage.ts` (WORLD) now holds `LetterSource` and `Visit`.
- `archiveShipDone`, `archiveNotesSaid`, `migrateMeta` and `migrateRunSave` are Track SAVE's, in files it already owns.

### Notes for the tracks (not built)

- **SAVE:**
  - **Audio:** unlock it in `startBootFromTitle`, and on a desk or report resume.
  - **ENDING CHOSEN:**
    - call `abortAll()` before the write;
    - assert that no free segment carries `reservedBy`;
    - restore `clock.paused` as saved;
    - handle `finale.ts`'s `verdictOwed` module state on resume.
  - **Content reset:**
    - pass the old arm to `freshArmState` rather than null, so `finalSerial` and the final ship's floor survive;
    - in `parseArm`, check `content` before `validateShipDef`.
  - **Foundation-built archives:** they carry `mergeBonus` and `armSeed: 0` (a real number). Either accept and migrate
    them, or reset them, and document which.
  - **Write failures:** `writeRunSave` catches an encode throw, goes `offline` with a loud console error, and emits
    `'save-lost'`.
  - **Desk UI:** `deskUiOnOpen` reads the state after `abortAll`.
  - **Ironman (§1.3 overstated it):** the plain stale rule is not a rewind guard. Ironman's later check is
    `resume.depth >= activeRun.trail.stops.length`.
  - **Shared checks:**
    - share one `checkArmShip` between `parseArm` and `checkSavedRun`;
    - `checkShape` cross-checks `save.unit` / `run` / `resume` against `payload.run`;
    - `checkShape` rejects non-finite numbers outside `endTSec`.
  - **Phase listeners:** audit them for the `title→desk` and `title→report` jumps a resume makes.
- **UI:** the inbox's memo key must add the trail's unit, cause and stop count, since letters now depend on the last unit.

## Deviations (Track WORLD)

Recorded by Track WORLD (branch `world-3c`). Each is a change from §2–§6 or from the reference sim, with its reason. The
update reproduces `arm_sim.py`'s rules and its statistics: 12,000 consecutive runs (20 chains × 200 × best, random, mix)
pass every §4.5 band (`world/update-stats-full`, BALANCE_ONLY), and §3.14's update is reproduced cell by cell and whole
(`world/update-fixture`).

### The update (map-update.ts)

1. **`UpdateDice.refillKind(slot)`** is added: the sim's `light if rng < LIGHT_SHARE else std` for a slot a repair empties
   (a retired waiting ship, a feeder). §3.14's dice throw on it (it never repairs).
2. **Repairs keep the late-layer light cap.** The sim's repair refill can make a third light ship in a layer from 5; this
   port turns that one into a standard ship (02 §3.12 step 4: "never a third light ship in a layer from 5 on"). It is rare
   (repairs start only after four failed attempts; about 0.06 ships a run leave by them) and moves no statistic.
3. **The sim's `ark-one-hop-from`.** `armChecks` reports only the ark; the update's repair adds the sim's second name (each
   ship of the layer before that reaches the ark by one hop), so a waiting one leaves as in the sim.
4. **The valve's pass keys its new ships from attempt `GEN_MAX_ATTEMPTS` (50–99)**, so no ShipKey, and no ship id, is
   shared with a ship the first pass timed (3a m5). **SAVE:** `ArmShip.attempt` can be up to 99 in a stored arm.
5. **Departures** are listed done first (in route order), then `first-past`, then the others as they left (slot order); the
   sim counts them in slot order. The opening desk's block reads them so; §3.14's fixture agrees.
6. **Seeded streams** (`upd:<armSeed>:<run>:<pass>:<stream>`): the gap, the pattern tie, each pick kind, the refill order,
   the refill kind and the names one stream each; a ship's resolve roll keyed by its slot (`resolve:<slot>`), so one more
   ship on the chart never moves another's. Timing and ark extras stay on the new ship's own ShipKey (`rollTiming`,
   `rollArkExtra`), as the plan says.
7. **`ArmUpdate.namesReused`**: new generated ships that had to take a departed ship's name (risk 5's soft rule), for the
   statistics.
8. **Names (risk 5) measured:** the hard rule (no name on the chart twice) never fails, but the soft rule (avoid the
   departed ships' names) gives way for about 68% of new generated ships: with about 9 waiting ships and 11 departures a
   run, the 21-name pool leaves about 3 names unused. Recommendation for 05's owner: grow `GENERATED_SHIP_NAMES` to about 32
   if a name coming straight back reads badly in the playtest.
9. **New helpers for the other tracks:** `updateAfterRun(run, dice?)` (the run's own map and route → `{ update, next }`)
   and `nextLaunchOf(unit, arm)` for RUN END's step; `launchOf(run)` in lineage.ts for the title's launch line (from the
   map's history; null on run 1).

### The generator (map-generator.ts) and names

10. **`topUpReservations(arm, held, armSeed, run, attempt, closed?, placed?)`**: `held[slot]` is a waiting ship's
    reservations (null: a new slot) instead of a `newSlots` list, because the quotas count what the waiting ships hold.
    A top-up skips a quota no new slot can take (the fresh roll still throws there): 99.8% of updated arms hold every quota
    exactly (INFO). A late corrupted resident is placed only beside an early one, waiting or new, as the generator does.
    The fresh roll and run 1 call it with nothing held, and their output is byte-identical to before (160 arms compared).
11. **`shipsFromFrames(frames, waiting, keyOf, start, armSeed, run, attempt)`** is the finish the update and §3.14's fixture
    share: waiting ships kept as they are, new ones topped up, detailed, the Debris guarantee among the new reachable
    layer-3 ships, the self-check. When every reachable layer-3 ship waits and none has DEBRIS, the guarantee is not met
    (risk 4): it happened in 0 of 12,000 runs (INFO), far from the 10% lever.
12. **`bestRoutePods(arm)`** takes no start year: a walk from the end over reachable hops (no route enumeration).
13. **`freshArm(armSeed, run, start, names?, finalFloor?)`** as planned. **`freshArmState(…, prev)`** names the next serial
    (`prev.finalSerial + 1`), floors the final ship at `prev`'s final year + max(start − prev.start, 1), and, replacing an
    arm for the same run, keeps its gap and valve years (the title's launch line stays true). Without `prev` the serial
    follows the run (3a's interim).
14. **Names:** `finalShipNameOfSerial(serial)` (0: LAST LIGHT); `finalShipName(run)` stays as the interim (serial run − 1).
    `aresName` never throws past run 81: `ARES-88` onward (risk 6, as recommended; to be raised with 05's owner).

### The map and the lineage (map-run.ts, lineage.ts)

15. **`createRunMap`** asserts a stored arm's run (= the wave) and content (= this build's) and throws otherwise: the archive
    resets a stale arm first, so a mismatch is a bug. Without a stored arm a run ≥ 2 is `freshArmState(…, null)` (unchanged
    output) and its history's `finalSerial` is set to run − 1, so the next update names on from the right serial.
16. **The grey cross** of a lost unit is on the world of its last stop (`pastLy` 0, the stop's approach year): the unit ended
    aboard that ship. Only 046's written cross lies past a world (6 LY past Calder). The archive's activeRun writes cause
    `abandoned`, so a run in progress already carries its cross.
17. **The writer** is null when no pod in an LZ carries a featured colonist (a hand-built result), where inbox.ts's postcard
    writer throws.
18. **`notableEvents`** takes `Pick<RunState, 'map' | 'ships' | 'stats'>`: the DEAL accepted (value: the pod), the best colony
    (colonists), then each lost ship (outcome neither locked nor partial; value: its depth), at most 4.
19. **The ghost** by the cross: a lost unit's speaks from the cross's layer on; a unit with no cross (won, unresolved) or no
    trail at the final ship; never ship 1. `map/run1-roll`'s M3 block (SAVE's migration) needs its trail to carry a cross
    (patch in the WORLD report).

### Suites

20. `world/update-stats` (the tier) is 3 chains × 40 runs by the mixed player at widened bands (`stats.ts QUICK_BANDS`, ~1.5 s);
    `world/update-stats-full` (BALANCE_ONLY) is the plan's 20 × 200 × three players at §4.5's bands plus 800 fresh rolls as
    the baseline (~95 s). `world/chain.ts` plays the chains as `arm_sim.py chain` does, starting from run 1's authored arm
    (risk 14).

**The 12,000-run result against the sim (mix; best and random in the suite):** best route p1 65 / p10 67 / median 68 / p90 69
(sim 65 / 67 / 68 / 69); runs 1–40 → 161–200: 68.01 → 67.91; corr +0.006; waiting median 9, new 11; ages 53 / 30 / 17%; gap
mean 2.86, max 35; valve 0 of 3,980; first attempt 77.9%, worst 14 (sim 12); FULL 34 / COMPACT 37 / TIGHT 29%; late TIGHT
2.69 per arm, on the best route 0.2%; all 20 on some route; new final ship 85%; authored ships gone by run 4; span median 733;
ship-2 request 93.5%. Leaving per update: done 6.03, aged 2.13, resolved 2.10, drifted 1.04, unreachable 0.06, made-room
0.03 (sim 6.04, 2.13, 2.16, 0.91, 0.05, 0.03). The best player's p1 is 64 (sim 65), inside the band.

## Deviations (Track SAVE)

Recorded by the Track SAVE agent (branch `save-3c`). Each is a change from §2–§5 or from the foundation's notes, with its
reason. Every SAVE note of "Deviations (foundation, review follow-up)" is built; where it is built differently, it is here.

### Archive v2

1. **`META_VERSION` 3; the foundation's archives are migrated, not reset.** `mergeBonus` is gone from `Meta` (risk 3), so
   the record's shape changed. The key stays `meta/v2`, and `META_MIGRATIONS[2]` steps a version-2 record in place: it
   drops `mergeBonus`, and an `armSeed` of 0 with no stored arm (the foundation's placeholder, from before the page passed
   its seed in) becomes null ("the run seed"). Its run in progress then loses its trail, because the trail's slots belong
   to an arm the archive can't rebuild. The run after that stores its own arm seed with its updated arm. A follow-up-built
   record keeps its real seed and its trail. `lineageOf().mergeBonus` is always false. `RunLineage.mergeBonus` and
   `RunState.mergeBonus` stay until slice 7 deletes them.
2. **`LoadResult.recovered` is now `changed`.** `loadMeta` no longer abandons anything. `changed` means reading changed
   the record (a migration, a v1 archive found, a content reset), and `openRunArchive` writes it back at once.
3. **The abandon is explicit and runs the world update.** The pure half is `recordAbandon(meta, nextArm)`,
   `abandonUpdate(meta)` and `abandonVisits(trail)`. The live half is `abandonActiveRun(store | null)` (null at the page's
   open, before the store exists). `abandonUpdate` rebuilds the arm the run played through `createRunMap` from the lineage
   before its end (`meta.arm`, else run 1's assembled arm or a fresh roll from `armSeed`, so it follows WORLD's rule
   whatever that becomes). It takes the visits from `activeRun.trail`, and returns null when the run can't be placed: no
   trail (the classic world, a content reset, a migrated foundation record), no arm seed, or a trail of another run.
4. **An abandoned run records no notable events.** The archive has only its trail, not its RunState. Its colonies and
   route are recorded.
5. **`RunEnd` gains `nextArm?` and `events?`** (left out: keep the stored arm, no events), so the suites' lineage-only
   records still build. Run end and abandon share `recordUnitEnd`: colonies capped at the newest
   `COLONY_HISTORY_MAX_PER_WORLD` per world, the last `ROUTE_HISTORY_RUNS` routes, at most `NOTABLE_EVENTS_MAX` events. The
   stored arm's seed becomes `meta.armSeed`.
6. **The content reset happens in the parse** (`readMeta`). The arm's head and its `content` are read first. On a
   mismatch the ships and departures are never read or validated, and the arm becomes
   `freshArmState(prev.armSeed, runs + 1, prev.startYear, prev)`, where `prev` is the old head with empty ships and
   departures: the serial and the last final carry over. A failure to roll is CORRUPT. With matching content, every ship
   goes through `checkArmShip` (shared with the save, in the new `systems/save-shape.ts`) and then
   `validateShipDef(shipDefOf(…))`. A stored arm reads back byte for byte, in `ArmState`'s key order.
7. **`archiveRunEnded` runs the update even headless and sets `run.next`**, with `unit = run.unitNumber + 1`. The save is
   cleared by `endRun`, right after it: `save-write.ts` imports `meta.ts`, so `meta.ts` can't call it.

### The run save

8. **`writeRunSave` also needs the archive to be `ok`.** A save is resumed only when the archive's run in progress is its
   run, so one written while the archive is corrupt, played without or offline could never be resumed.
9. **Session additions.** These are `pendingRunSave()`, `takePendingRunSave()`, `runSaveSessionStatus()` and
   `clearRunSave(store?)`. The store parameter lets a remove that throws go OFFLINE in the store too. Each refusal's detail
   goes to `console.error` only.
10. **ENDING CHOSEN is `writeEndingChosen(store, flushOwed)` in `save-write.ts`.** `landing.ts finishLanding` calls it when
    `landing.finalShip` is set, and it does nothing on the classic world or with an undecided finale. In order: `abortAll()`,
    a throw if any free block is still `reservedBy`, then `finale.ts sayOwedVerdict()` (CONTROL's owed verdict is said now,
    so the saved log has it), then the save. The clock is not touched. The decoder also refuses ENDING CHOSEN off the final
    ship or with an undecided finale.
11. **The page's open sequence lives in `run-save.ts`** (`openPageStorage`, `pageTitleState`) so the suites run it, and
    `state/instance.ts` calls it. It also abandons the run in progress when the save storage is **offline**, not only when
    no save exists, because such a run can't be resumed either.
12. **`abandonRun(store, seed?)` abandons the archive's run in progress whenever there is one.** A stale save whose run
    already ended only clears. When the stale save is another tab's run, the archive's run in progress belongs to the tab
    that wrote last, and that run is the one abandoned (the last write wins, documented in `save-write.ts`). The store's
    save status goes back to the session's (`ok`), so the next run saves.
13. **Resume.**
    - A boot payload restores the saved log as it is, with no extra divider: BEAM's log already ends with the ship's own
      divider, and RUN START's is the title's.
    - A world payload resumes in **`ui.mode = 'tools'`**. In Chromium the resumed desk had the title's blue header until
      then; a played desk is amber.
    - The clock stays as saved.
    - A throw puts the title state back, sets CAN'T RESUME `resume-threw` and drops the pending save.
14. **The audio unlock** moved from `receiveTransmission` into `startBootFromTitle`. `boot.ts unlockAudioFromGesture()`
    calls the page's hook, and `resumeWorld` calls it too.
15. **`checkShape`.**
    - The saved RunState is checked field by field (`save-shape.ts` checkers). So are the map, every ArmShip, the route, the
      history, the ships, the stats, the repo, the inbox and `next`.
    - `beamOut`, `transit` and `endCause` must be null at a save point.
    - The slices, the threat memory, the run log and the beam's verdict use `likeReference`: exactly the keys of a freshly
      built one, and each primitive field of the same type or null. So a field a slice adds never makes the check go
      stale; it is a version bump plus a migration step. Memory segments are checked for id, name, type and size only;
      `assertMemoryInvariants` on resume does the rest.
    - Non-finite numbers are refused anywhere but `endTSec`.
    - Cross-checks: `unit`, `run` and the resume line's unit, depth and year against the run.
    - After the ship check: the resume line's ship and the slices' ship against the current ship, the ships ended per
      point, and each result on its route stop.

### Debug and suites

16. **Debug.** `__ap.resume()` and `__ap.abandon()` are added (the title's RESUME block is Track UI's). `__ap.newRun` goes
    through `abandonRun`. In `__ap.archiveAs(cause, landed?)`, `landed` caps each ship's landing (default: all its pods);
    a colony is named from its landing def, else its world. A lost cause ends on LAST LIGHT; `abandoned` ends while still
    on it.
17. **Suites changed for risk 3 and the explicit abandon.**
    - `wp11/merge-test`: the run after a MERGE has no bonus, and the archive keeps no `mergeBonus`.
    - `wp8/meta`, `wp8/run-flow`, `wp8/fix1/fixes`, `map/run1-roll`: the page's load calls `abandonActiveRun`, or
      `recordAbandon`.
18. **Phase listeners audited** for `title → desk`, `title → report` and `title → boot`.
    - DeskScreen, LandingReport, FinaleChoice, RunEnd and TransmitScreen are driven by state.
    - The director's `phaseEntered` beats all key on `flight`.
    - Boot's modal follows the phase.
    - Only TitleCard reads the previous phase: a resumed BEAM boot gets its `receiving` class (the beam drawn from SOL).
      This is cosmetic, and left to UI (below).

    Nothing needed a change.
19. **The failure table** follows §2.1. A corrupt save, another version or another content version is CAN'T RESUME; only
    storage that can't be reached or read, and a write, clear or build that throws, are OFFLINE.

### Save sizes

These are JSON bytes.
- Store-level, on the worked route with no flights (`save/codec`, small logs): RUN START 18 KB, SHIP DONE 29–53 KB, BEAM
  23–38 KB, ENDING CHOSEN 58 KB.
- Played in Chromium, ARES-VII and HALCYON flown: first desk 31 KB, second desk 39 KB, BEAM into KESTREL 32 KB.

All are far under `SAVE_SIZE_INFO_BYTES` (400 KB).

### Requests to the other tracks

- **UI:**
  - the title's RESUME block calls `resumeRun(store)`; [NEW RUN] (after its confirm) and [ABANDON RUN] call
    `abandonRun(store)`;
  - CAN'T RESUME reads `save.refusal.kind`;
  - the TERMINAL line and buzz for `'save-lost'` need a `script.ts` rule beside `archive-lost` with
    `MAP_TEXT.save.offline` (nothing listens to it yet), and the footer's NO SAVE goes on `save.status === 'offline'`;
  - optional: skip TitleCard's `receiving` class when a resumed boot is past ship 1.
- **WORLD:**
  - none required;
  - `notableEvents` is still the stub, so archives record `[]` until it lands;
  - note that a run started with `__ap.runNumber(n)` stores an arm for run `n + 1` at its end, which a strict
    `createRunMap` run-equals-wave assertion will refuse on the next page (debug only).

### After merging Track WORLD (8a3b77a)

WORLD's requested patches, applied:
1. `archiveRunEnded` calls `updateAfterRun(state.run)`, stores `update.next` and `notableEvents(state.run)`, and sets
   `run.next` to the result's `next`. `__ap.archiveAs` goes through it too.
2. `abandonVisits` follows `visitsOf`'s rule: a colony where `landed > 0`. The abandon's `from` arm is still the one
   `createRunMap` builds for the abandoned run's wave, which is `meta.arm` when stored and run 1's assembled arm
   otherwise.
3. `ArmShip.attempt`: `checkArmShip` already accepts any whole number, the valve's 50–99 included.

Re-checked in Chromium after the merge: the resume walk passes, and `__ap.archiveAs('won-purge')` then a reload gives
`UNIT-048 · YEAR 2303` (a gap of 3, as §3's walk says).
