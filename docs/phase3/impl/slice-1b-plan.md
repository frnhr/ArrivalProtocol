# Slice 1b implementation plan: drop width, no-go arcs, Bay Ctrl, drag and decay, the engine in landing, GO LOWER

**Lead decisions on §5's risks (2026-10-30).** All recommendations are adopted. GO LOWER (risk 1): engine-landing.test
measures it; if a 0.3 s late release can leave the band, the landing's burns run at `LANDING_BURN_POWER` 0.5 and this
goes to Fran with the measurement. The `'lift'` burn (risk 3), no SKIP stop at drag kicks (risk 4), ghost thrust in
landing (risk 5), ship 1 arriving with Sensor Interp at 78 (risk 7, slice 2 decides the calm opening) and no Bay.alt
(risk 8) are reported to Fran with the slice; any of them may be reverted per `DECISIONS.md`.

**Process.** Foundation (§3.0) → architecture review → Tracks ORBIT, DROP and UI in parallel with §3's ownership → merge
(DROP, ORBIT, UI) → full review → fixes → unit tier (under 300 s) → one e2e run.

Written by the architect agent. The spec is docs/phase3/01-landing.md (§ numbers are its own). docs/phase3/DECISIONS.md wins where they differ. The code as built is described by slice-1a-plan.md §1 together with its Deviations sections: Foundation, its follow-up, Track SIM and Review fixes. **That plan has no "Deviations (Track UI)" section, although the brief names one.** The UI facts below were read from the code. Code style follows AGENTS.md: functions and data, numbers in tuning.ts with a WHY comment, fail loudly, WHY comments.

**What 1b delivers (§8):**
- The drop-width factors.
- The grey `DROP UNCERTAIN` dot.
- Bay Ctrl's cadence by band, and `BAY OFFLINE`.
- No-go arcs: their data, the 150 km rule, and the guard in the arc's own word.
- The DRAG line and decay, with exact SKIP splits and the forecast.
- The engine opened during LANDING: trims (L2), `ENGINE FIRING`, and pace near burns.
- GO LOWER.
- Rows L8–L10.
- The two lessons that depend on 1b mechanics.

---

## 1. Architecture

### 1.1 Module map (new modules in bold)

| Module | Kind | 1b responsibility |
|---|---|---|
| **`src/systems/landing-orbit.ts`** | pure | DRAG line, kick Δv, the next ▼ kick on a conic, decay forecast, the GO LOWER math (`goLowerFit`, `goLowDvKmS`, `goLowReleased`), the burn offer (`landingBurnOffer`), the drop solver's domain (`dropSolvable`). Imports only `types/*`, `data/tuning`, `landing-solve`, and type-only `predict`. **Not** predict values (entries.test cycle). |
| `landing-solve.ts` | pure | `LzWindow.launchRad`; `DropDot.uncertain` passed through; `computeDropSolution` returns the empty solution outside `dropSolvable`; `validUntilTSec`. |
| `landing-rules.ts` | pure | Real `dropFactors`; `BAY OFFLINE` in `launchRefusal`; `launchGuard`'s `'no-go'` ask; `bestRepairForDrop`, `dropTooWide` (L9); `landingStuck` (auto-end); `awaited` false with the bay offline. |
| `capabilities.ts` | pure | `bay.cadenceTac` from `BAY_CADENCE_BY_BAND`, `bay.offline`; `drop.sensorFactor/plotterFactor/uncertain`; Bay Ctrl `BAND_COPY` lines. |
| `orbit-sim.ts` | stateful | One game tick for flight and landing (§1.4). Drag kicks are split exactly in SKIP jumps and applied at a sub-step otherwise. Crash and escape are handled in landing. |
| `predict.ts` | pure + cache | `BurnReason` gains `'go-low'` and `'lift'`; `BurnEvent` gains `'point'`; the landing burn plan (§1.5). |
| `guidance.ts` | pure | `landingFlightRow(ctx)`: the F rows in landing mode (F1/F2 overlays, F4, F9/F10 on an open path, F11 trims, GO-LOW and LIFT rows, F3-style RELEASE). |
| `landing-guidance.ts` | pure | Rows L2, L8, L9, L10, L12-bay; a lava variant of L5; L9's SKIP tail. |
| `pace.ts` | stateful reads | Landing TACTICAL near offered burns and on impact courses; `burn` and `impact` events in `landingNextEvent`. **No `'kick'` event** (risk 4). |
| `flight-controls.ts` | input | `engineOpen(state)` replaces `status === 'approaching'`. `lineAsks` reads `landingFlightRow` in landing. |
| `flight-events.ts` | events | Thrust start and stop, and burn beeps, in landing. |
| `landing.ts` | stateful | The GO LOWER aim's lifecycle, declined burns, the `bay-offline` auto-end (through `landingStuck`). |
| `drop-cache.ts` | cache | `validUntilTSec`; re-solve on an epoch bump, which already happens. |
| `hollow.ts` | stateful | `drainConditions.thrustDelivered` counts landing thrust. The max rule is already in. |
| `autoburn.ts` | — | Refuses in landing (`AUTOBURN_REFUSAL.over`): the seam for v3. |
| `run.ts` | — | `shipLost` / `shipOutcomeOf` accept a landing ship that `'crashed'` or `'escaped'`. |
| UI | views | `landing-hud.ts`, `flight-hud.ts`, NavPlotWindow, plot-landing, GroundTrack, PodBayWindow, EngineWindow, CSS, audio. See §3 Track UI. |

**Pure versus stateful.** Every new rule is pure: landing-orbit, landing-rules and the table. State is written in three places only:
- orbit-sim writes the kicks, `decay` and `orbitEpoch`;
- landing.ts writes `goLow`, `declined` and the ending;
- flight-controls writes the throttle.

predict reads `state.landing.goLow` and `state.landing.decay`, never the drop cache, so it stays independent of the cache's mount order.

### 1.2 Type sketches

```ts
// src/types/landing.ts
export type LaunchRefusal = 'NOT LANDING' | 'LANDING OVER' | 'PAUSED' | 'SHIP SCREEN' | 'BAY OFFLINE' | 'ENGINE FIRING'
  | 'NO DROP SOLUTION' | 'OUT OF THE LAUNCH BAND' | 'NO POD READY' | 'RELOADING' | 'BAY EMPTY';
export type LaunchAsk = 'off-site' | 'full' | 'no-go';      // no-go: `LAUNCH INTO LAVA? scores 0`
export interface LaunchIntent { source: LaunchSource; pod?: number; confirmed?: LaunchAsk }
export type LandingEnd = 'all-launched' | 'end-landing' | 'no-driver-left' | 'bay-offline';
export interface DropDot { rad: number; halfWidthKm: number; launchRadius: number; inBand: boolean; uncertain: boolean }
export interface LzWindow { /* 1a fields */ launchRad: number }  // the ship's world angle when the dot crosses the LZ centre
export interface DropSolution { /* 1a fields */ uncertain: boolean;
  validUntilTSec: number | null }   // the next drag kick: windows after it are a forecast (re-solved at the kick)
export interface DragKick { atTSec: number; rpKm: number; dvKmS: number; rad: number;
  apsis: '▲' | '▼'; dropKm: number }  // the far apsis that moved, and by how much (`DRAG · ▲ −110 km`)
export interface DecayState { lastKickTSec: number | null; kicks: number; last: DragKick | null }
export interface GoLowAim {          // GO LOWER (§3.7), sticky once the kid fires for it
  lz: string; launchRad: number; burnRad: number;   // burnRad = launchRad − π·sign (180° before)
  targetRadiusKm: number;            // the radius at launchRad where the sure window reaches LANDING_SURE_MIN_TAC
  floorKm: number;                   // ring.min + GO_LOW_FLOOR_MARGIN_KM
  held: boolean;                     // the kid fired for it: kept until goLowReleased
}
export interface DeclinedBurn { key: string; untilLz: string | null }  // an offered burn that passed unburned
export interface LandingState { /* 1a */ decay: DecayState; goLow: GoLowAim | null; declined: DeclinedBurn | null }
export interface LandingView { /* 1a */ validUntilTSec: number | null; cadenceTac: number | null }  // bay.cadenceTac nullable
// src/systems/capabilities.ts
bay: { band: Band; cadenceTac: number | null; offline: boolean };            // null + offline: missing
drop: { solution: boolean; sensorFactor: number; plotterFactor: number; uncertain: boolean };
// src/systems/predict.ts
export type BurnReason = 'capture' | 'missed' | 'shrink' | TrimReasonRing | 'go-low' | 'lift';
export type BurnEvent = 'peri' | 'apo' | 'now' | 'point';   // 'point': centred on an orbit angle (GO LOWER)
BurnPoint.aimLz?: string;                                   // go-low: the LZ named in KEEP HOLDING
```

`TrimReason` stays the four ring reasons, so `TRIM_PROBLEM` and `trimTarget` are unchanged. `isTrim('go-low' | 'lift')` is false. `'lift'` is planned through `planTrim` with the target `dragLine + DRAG_LIFT_MARGIN_KM`. `EVENT_GLYPH` gains `point: '◇'` (wording is UI's).

### 1.3 How 1a's seams are used

- **`dropFactors(caps, driver)`** returns `{ caps.drop.sensorFactor, caps.drop.plotterFactor, DRIVER_DROP_FACTOR_BY_BAND[band] }`, with a driver factor of 1 for null.
  - The table covers `dead` as well (2.0, display only). DetailPanel calls it for every driver, so it must not throw.
  - Only the sources change. drop-cache, `launchRecordFor` and DetailPanel already call it. `windowsFor` keeps one `DropFactors` per solve: the next pod's.
- **`classifyLanding(lzs, noGo, …)`** is unchanged: no-go first already. 1b fills `LandingState.noGo` from the data. The `TODO(slice1b)` in `launchGuard` becomes the `'no-go'` ask, using `noGoAt(...).word`.
- **`landingKicks` and `orbitEpoch`.**
  - `landingKicks(state, t0, t1): LandingKick[]` is **replaced**. A list worked out up front from the start-of-tick conic is wrong for a second kick in the same tick.
  - The replacement is `nextDragKick(orbit, mu, ring, fromTSec, toTSec, decay): DragKick | null` in landing-orbit. The coast loops: coast to the kick, apply it, look for the next one from the new conic.
  - Every kick bumps `orbitEpoch` and writes `landing.decay` in one update, and emits `'drag-kick'`.
  - drop-cache's `fresh()` already re-solves on an epoch bump. Its `validUntilTSec` is the next kick, from `nextDragKick` over one period.
- **`landingMoment`** is unchanged. GO LOWER and L9 read its `target`, and `goLowerFit` reads `target.window.launchRad`. With the bay offline, `awaited` is false: nothing is waited on, there is no TACTICAL, and L12-bay shows.
- **The L2 stub.**
  - The director builds `buildFlightContext(state, sensed)` in landing too, and passes `landingFlightRow(flightCtx)` into `buildLandingContext(state, sol, skipAvailable, flightRow)`.
  - landing-guidance stays pure: it imports no guidance values, only the `FlightObjective` type.
  - L2 keeps the F row's **id** (`F11-now`, `GO-LOW-keep` …), so `createObjectiveFilter`, `isReleaseRow`, followDirector and `lineAsks` work unchanged. `row: 'L2'`.
- **`noneLeftTick`** calls `landingStuck(state): LandingEnd | null` (landing-rules): `'no-driver-left'` as in 1a, or `'bay-offline'`. The same `LANDING_NONE_LEFT_SEC` applies, because a missing ship file never comes back on this ship.

### 1.4 The engine during LANDING, without forking the flight

`engineOpen(state)` lives in selectors: `(phase flight && status approaching) || (phase landing && landing.ended === null)`. Its readers are:
- flight-controls `flightRefusal`: `FLIGHT OVER`, or `LANDING OVER` once the landing has ended;
- flight-hud `burnButton`;
- hollow `drainConditions`;
- flight-events (thrust and beeps only);
- audio-cues (engine loop);
- orbit-sim.

ACCEPT ORBIT, the lock hold, `faults.ts` FILE_FAULTS and `closedIdleAiSec` stay flight-only.

**orbit-sim: one game tick, two modes.** Remove the early `landingCoast` return. The same tick body runs: attitude, presets, ghost scheduling, thrust sub-steps and the SKIP jump. The landing-only differences:

| | Flight | Landing |
|---|---|---|
| Gate | `status === 'approaching'` | `engineOpen` (after the landing ends: the old pure coast, still with kicks) |
| SKIP jump | `conicCoast` | `coastWithKicks`: conic legs split at each `nextDragKick` |
| Sub-step ticks | — | a kick due in the tick is applied at the first sub-step boundary ≥ its time |
| Crash | `endFlight('crashed')` | `endLandingLost(store, 'crashed')`: status, pause, `parkPodsAboard` (pods aboard become not-launched; falling pods still score via `pendingTouchdowns`), `endNow`-like close |
| Escape | the `cannotClose` rule | the same rule, then `endLandingLost(store, 'escaped')` |
| FUEL out | `fuelOutOutcome` | nothing (the landing goes on) |
| `missedIdleTac` | yes | 0 |
| Drop cache | — | `orbitEpoch` bumped once when thrust stops (the falling edge of `lastTickDvKmS > 0`), not every tick |

Kick timing has to be robust: on a near-circular orbit, ▼ is noise under CRUISE sub-stepping. The rule:
- A kick is due at the conic's next ▼ in (t0, t1], when `rp < dragLine`.
- It is due only if `lastKickTSec === null` or the gap is ≥ `DRAG_KICK_MIN_GAP_FRAC × period`.
- If `t1 − lastKickTSec ≥ 1.5 × period` with ▼ still below the line, a missed kick is applied at once.
- A dev assertion checks at most one kick per 0.5 period.

**predict.** It already plans ring trims in landing (on PARTIAL orbits), so only the in-ring branch is new. `computeBurnPoint` in landing:
1. impact: `liftPreset`, as today;
2. ring trims, as today;
3. in the ring with `state.landing.goLow`: a `'go-low'` point burn. `eventInSec` is the time to `burnRad` on the conic; `dvKmS = goLowDvKmS(stateAt(burnRad), targetRadiusKm, mu)`, by bisection on retro Δv for r(launchRad) = target; `inSec = eventInSec − BURN_POINT_LEAD_FRAC × estBurnSec`; `approaching` is true over the half-orbit before the point; `LATE_TRIM_TAC` applies as for trims;
4. in the ring with drag on, the landing going on, and `decayForecast(...).orbitsToLeave ≤ DECAY_WARN_ORBITS`: `'lift'`, PRO at ▲, target `dragLine + DRAG_LIFT_MARGIN_KM`;
5. otherwise null.

`acceptOnly` and `strandedAnyway` stay flight-only (they latch only while approaching).

**`landingBurnOffer(state, pred): BurnPoint | null`** (landing-orbit, pure) is the one answer read by pace, L2, the START BURN marker, the countdown chip and the beeps. It returns the plan's burn point when:
- the landing goes on, and the reason is `go-low`, `lift`, or a ring trim with `!pred.fuelShort && !state.burn.acceptOnly`;
- and `burnKey(bp) !== state.landing.declined?.key`.

landing.ts sets `declined` when an offered burn's due window ends with no Δv delivered for it. It clears `declined` on a launch, on `untilLz`'s window closing, or on a new reason. An ignored burn therefore costs the kid one TACTICAL pass, not one every orbit (risk 2).

**guidance `landingFlightRow(ctx)`.** `FlightContext` gains `landing: boolean`, and `ctx.burnPoint` is the offer. `evaluate` in landing mode:
- skips F3b HOLD STEADY and F11-accept/stranded;
- turns the in-ring F3 into `RELEASE [SPACE]!` only when firing with no offered burn;
- adds GO-LOW rows:
  - `GO-LOW` (turn: `GO LOWER — at ◇ press [S] RETRO`);
  - `burnTimeline('GO-LOW', …)`;
  - `GO-LOW-keep` (`KEEP HOLDING — until LZ-B's dot fits`);
  - `GO-LOW-release` (`RELEASE [SPACE]`, added to `RELEASE_ROWS`);
- adds `LIFT` rows (F11's shape with `TRIM`-like words);
- returns null when no row applies.

`goLowReleased(orbit, aim, …)` is true once the radius at `launchRad` on the live conic, projected `RELEASE_LEAD_TAC` ahead at the current rate (F6's rule), is ≤ `targetRadiusKm`, or ≤ `floorKm`.

**pace (§3.12).** In `landingPace`, after the existing rules:
- TACTICAL when `pred.outcome === 'impact'`;
- TACTICAL when the offered burn's START BURN is within `TACTICAL_LEAD_BURN_TAC`, judged one CRUISE tick ahead like the window lead.

`landingNextEvent` adds `{ kind: 'burn' }` for the offer (`SKIP_END_LEAD_TAC`), plus `'escape'` as in flight. `skipInhibitor` already refuses `ENGINE FIRING`.

### 1.5 Drop, Bay Ctrl and no-go rules

- **capabilities.**
  - `sensorFactor = SENSOR_DROP_FACTOR_BY_BAND[sensor.band]` (ok 1, degraded 1.5, failing, dead and missing 2.5).
  - `plotterFactor = PLOTTER_DROP_FACTOR_BY_BAND[navplot.band]` (ok 1, degraded 1.25, failing 1.5; dead and missing are moot because `solution` is false, so 1).
  - `uncertain = sensor band ∈ {failing, dead, missing}`.
  - `bay.cadenceTac = BAY_CADENCE_BY_BAND[band]` (ok 2.0, degraded 2.7, failing 4.0, dead 10.0, missing null).
  - `validateCapabilityTables` checks the new tables.
- **launchRefusal.** `BAY OFFLINE` comes after `SHIP SCREEN`. `launchDriver` asserts a non-null cadence.
- **L12-bay.** `BAY OFFLINE — END LANDING parks them in orbit` (`landing-L12-bay`), then the auto-end `'bay-offline'`.
- **No-go.**
  - `validateLandingDef` adds: if `noGo.length > 0`, at least one arc lies within `NO_GO_NEAR_EDGE_KM` (150) of a bracket edge (§3.15). slice 3's roller reuses this.
  - `launchGuard` asks `'no-go'` when the dot's centre is over an arc.
  - **Recommended (risk 13):** L5 gains a variant `LAUNCH — press [L] · WIDE DROP, LAVA in reach` when the dot's span overlaps an arc.
- **L8.** Shown when `caps.drop.uncertain`, the next awaited window is ≤ `DROP_UNCERTAIN_LEAD_TAC` (60) away, and `plotFault(caps)?.role === 'sensor'`:
  - cause `hurt`: `DROP UNCERTAIN — TAB, REPAIR SENSOR INTERP` (MIND: no TAB);
  - `repairing` or `moving`: `DROP UNCERTAIN — SENSOR INTERP IS REPAIRING…`;
  - `missing`: `DROP UNCERTAIN — NO SENSOR INTERP` (wait).
- **L9.**
  - `dropTooWide(state, sol, caps)` returns `{ lz, repair: RepairHint | null, goLower: boolean } | null`, for the awaited target whose window has `sureOpenInSec === null`.
  - `bestRepairForDrop` picks the largest factor > 1 among the next driver (if repairable and `repairPossible`), Sensor Interp, then Nav Plotter. Ties go in that order.
  - A repair "gives one" when the factor-1 width at `window.launchRadius` is below the LZ's half-width.
  - `goLower = goLowerFit(...) !== null`.
  - With neither, there is no L9 (L5 shows at the window).

### 1.6 Extension points to name in code comments

| For | Seam |
|---|---|
| **AUTOBURN v3** (slice 4): picks the landing orbit and holds it against decay | `landing-orbit.highestFittingRadius(lzs, factors, ring, R, mu, warp)` (GO LOWER's target is its per-LZ case); `'go-low'` and `'lift'` BurnPoints, which v3 flies through `autoburnRefusal`'s landing gate (the one line to open); `decayForecast`. |
| **AUTODROP** (4c) | `LandingView.validUntilTSec`; `dropFactors(caps, driver)` per pod (send the healthiest driver to the NARROW LZ via `LaunchIntent.pod`); `landing.noGo`; `launchGuard`'s `'no-go'`. |
| **SURVEY** (slice 6) | `landing.noGo` is runtime state (SURVEY may add arcs it finds); `landing-hud.terrainStretches` takes mapped stretches; `NO_GO_NEAR_EDGE_KM` is in the shared validator. |
| **MERGE's blind drop** (7) | `dropFactors` feeds `s × BLIND_DROP_MULT`; no-go arcs are within `BLIND_MARGIN_KM` by the 150 km rule. |
| **The rebalance** (8) | Every 1b number is in the tuning block (§2.2). |

### 1.7 Risks to existing behaviour

- **The flight tick.** The tick's unification is the riskiest edit. Every flight suite must pass unchanged: kicks are inert in flight, and the outcome table is unchanged for flight.
- **SKIP exactness.** `coastWithKicks` keeps the jumps exact between kicks. A test compares one 3-orbit SKIP against the same span in CRUISE sub-steps (▼ within 1 km, the kick count equal).
- **Predictor cost.** No change: the drawn path ignores kicks (an honest osculating loop; the stamp and the decay chip show the change), and `decayForecast` is closed-form.
- **Drop-solve cost.**
  - One `dotTrack` per kick, so per orbit.
  - During a burn, the 1 km element key re-solves at 10 Hz, about 5 ms each, about 5% of a frame budget for a burn of a second or two. Bumping the epoch per thrust tick would cost a solve every frame, so it is **not** done.
- **HOLLOW.**
  - The drain is `drainPerSec × max(burnMult if thrust, landMult if landingActive)`, already in.
  - New: thrust in landing now counts.
  - A burn during an open window gets the larger multiplier, never the product. Covered by test.
- **Partial orbits.** L12-band is now reached only with no fuel, or with the trim declined. Before that, L2 shows F11. review-fixes and flow (HALCYON p2) change.

---

## 2. Data

### 2.1 Ships

Planet R = 3,390 km, so 1° = 59.17 km. The half-widths are: STANDARD 3.380°, NARROW 2.113°, WIDE 4.225°.

| Ship | No-go arcs (centre°, width°, word) | Nearest bracket edge | Drag |
|---|---|---|---|
| ARES-VII | none | — | **false** (never decays) |
| HALCYON | none (layer 2) | — | true |
| KESTREL | none (HARSH, all WIDE, may be calm) | — | true |
| VESPER | `{187.4, 5, 'LAVA'}`, `{293.4, 6, 'LAVA'}` | LZ-B ends at 183.38°, lava starts 184.9°: **1.52° = 90 km past**. Lava ends 296.4°, LZ-C starts 297.89°: **1.49° = 88 km before**. | true |
| LAST LIGHT | `{286.6, 6, 'CLIFFS'}` | LZ-D ends at 282.11°, cliffs start 283.6°: **1.49° = 88 km past** | true |

**Verified against `validateLandingDef`:**
- the widths are within 3–8°;
- no arc overlaps a bracket;
- the arcs don't overlap each other;
- each ship with arcs has one within 150 km of a bracket edge.

Both VESPER arcs sit on the dot's path:
- past LZ-B, where a late launch or a wide dot is at risk;
- before NARROW LZ-C, where an early launch is at risk.

Healthy at 6,000 km (s = 78 km), a sure launch never reaches them. Degraded Sensor Interp at 6,000 km (s = 117 km) or any failing driver does. That is §3.6's "a wide dot is a real risk".

The word `CLIFFS` makes the guard read `LAUNCH INTO CLIFFS? scores 0`. Update the comments in ships.ts at lines ~470 and ~549.

### 2.2 Tuning (new block `// --- Phase 3 slice 1b`, with sub-blocks per track, each constant with its WHY)

- **DROP:**
  - `SENSOR_DROP_FACTOR_BY_BAND`, `PLOTTER_DROP_FACTOR_BY_BAND`, `DRIVER_DROP_FACTOR_BY_BAND` (ok 1, degraded 1.5, failing 2.0, dead 2.0 display only);
  - `BAY_CADENCE_BY_BAND` (replaces the use of `BAY_CADENCE_TAC`; keep it as `.ok`'s alias);
  - `NO_GO_NEAR_EDGE_KM` 150;
  - `DROP_UNCERTAIN_LEAD_TAC` 60.
- **ORBIT:**
  - `DRAG_DV_MAX_KMS` 0.030;
  - the DRAG line is `ring.min + SWEET_ZONE_FRAC × span`. Reuse `SWEET_ZONE_FRAC`, with a comment: the line *is* the sweet zone's lower edge (§3.7);
  - `DRAG_KICK_MIN_GAP_FRAC` 0.5;
  - `DRAG_STAMP_MIN_KM` 10;
  - `DECAY_WARN_ORBITS` 2;
  - `DRAG_LIFT_MARGIN_KM` 50;
  - `LANDING_SURE_MIN_TAC` 4;
  - `GO_LOW_FLOOR_MARGIN_KM` 100;
  - `DROP_SOLVE_MAX_E` 0.6 (the solver's domain, risk 9).
- **UI:** whatever its views need, appended to its own UI block.

### 2.3 Other data

- `data/memory.ts` Bay Ctrl's `desc`: "Runs the pod bay's launch rails. Damaged, pods launch further apart; gone, no pod can launch."
- `data/tool-text.ts` `DELETE_EFFECT.bay`: `NO POD CAN LAUNCH` (it replaces `No effect yet.`).

---

## 3. Work breakdown

### 3.0 Foundation (one agent, one commit, first; typecheck green, nothing changes behaviour)

1. **Types and state.**
   - Everything in §1.2: `types/landing.ts`, predict's unions, the capabilities shape.
   - `state/initial.ts createLandingState` initialises `decay`, `goLow: null` and `declined: null`.
   - `events.ts` adds `'drag-kick'` (a `DragKick`) and `'go-low'` (`{ lz, phase: 'offered' | 'held' | 'released' }`).
   - `selectors.engineOpen` exists but is not yet read.
2. **Records forced by the unions.** Every `Record<LaunchRefusal | LandingEnd | BurnEvent …>` gets its entry:
   - `LAUNCH_REFUSAL_TEXT['BAY OFFLINE']`;
   - `EVENT_GLYPH.point`;
   - `LAUNCH_CONFIRM_TEXT.noGo(word, points)`;
   - the report's words for the `bay-offline` ending.
3. **tuning.ts.** The whole §2.2 block, with its sub-block banners and owners.
4. **landing-text.ts.** Every 1b string in the SIM section, in two banners:
   - `// --- 1b ORBIT` (owned by ORBIT): the L2 wrappers, L10, the GO-LOW and LIFT rows, the drag stamp;
   - `// --- 1b DROP` (owned by DROP): L8 ×3, L9 variants, L5-lava, L12-bay, the lessons `dragSinks` and `dotWide`.
5. **Stubs with final signatures:**
   - `landing-orbit.ts`: everything in §1.1, returning null, 1 or `[]`; `dropSolvable` returns true;
   - `guidance.landingFlightRow` returns null;
   - `landing-rules.dropTooWide`, `bestRepairForDrop` and `landingStuck` (1a behaviour).
6. **landing-guidance.ts finished in the foundation.**
   - All rows wired to context fields:

     ```ts
     LandingContext += {
       flight: FlightObjective | null;
       flightBurnInTac: number | null;
       uncertain: { cause: PlotFaultCause } | null;
       tooWide: TooWide | null;
       decay: { orbits: number } | null;
       bayOffline: boolean;
       lavaInReach: string | null;
     }
     ```
   - Order: L0, L1, **L2**, L3, L3b, L4, L5 (with lava), L6, L7, **L8, L9, L10**, L11, **L12-bay**, L12, L12-band, L13-noroom, L12b, L13.
   - **L2** fires when `flight !== null` and any of: thrust, firing, `flightBurnInTac ≤ 8`, `next?.inBand === false`, `noBandWindow`, or the flight row's id starts with `F4`.
   - The `IS_DEV` thrust throw goes.
   - `buildLandingContext(state, sol, skipAvailable, flightRow)`. The director passes it (one line in director.ts, done in the foundation).
7. **Data.** The no-go arcs (§2.1) and the 150 km check in landing-def.ts.
8. **Harness.** `harness-landing.ts END_LANDING_ROWS` gains `landing-L12-bay`.

### Track ORBIT (drag, decay, the engine in landing, GO LOWER, L2/L10 builders, pace)

- **Owns:**
  - `landing-orbit.ts`, `orbit-sim.ts`, `predict.ts`, `pace.ts`, `guidance.ts`, `flight-controls.ts`, `flight-events.ts`, `autoburn.ts`;
  - `landing.ts` (goLow lifecycle, declined; it calls DROP's `landingStuck`), `landing-solve.ts`, `drop-cache.ts`;
  - `hollow.ts` (`drainConditions` only), `run.ts` (landing lost), `state/selectors.ts` (`engineOpen`), `director.ts` (the L2 plumbing after the foundation);
  - `ghost-thrust.ts` (risk 5: ghost thrust in landing), and `tests/unit/landing/harness-landing.ts` (DROP and UI send it patches; added by the foundation review);
  - the `1b ORBIT` text and tuning sub-blocks;
  - `script.ts`'s drag lesson rule (`◆ BELOW THE DRAG LINE THE ORBIT SINKS`, on `decay.last.dropKm ≥ DRAG_STAMP_MIN_KM` the first time).
- **Order:**
  1. landing-orbit math, then `coastWithKicks` and the kick split in orbit-sim, then `decay`, `'drag-kick'` and `validUntilTSec`;
  2. `engineOpen` and the unified tick, including landing crash and escape;
  3. predict's `'go-low'`, `'lift'` and `'point'`; `landingBurnOffer`; the `declined` lifecycle;
  4. `landingFlightRow` and its GO-LOW and LIFT rows; L2 and L10 context builders;
  5. pace; flight-events beeps; the hollow and autoburn gates;
  6. `dropSolvable` and `LzWindow.launchRad`.

### Track DROP (factors, Bay Ctrl, no-go, L8/L9, the table)

- **Owns:**
  - `capabilities.ts`, `landing-rules.ts`, `landing-guidance.ts` (after the foundation and its review follow-up; ORBIT asks for row changes);
  - `data/ships.ts`, `data/landing-def.ts`, `data/memory.ts` (Bay Ctrl desc), `data/tool-text.ts`;
  - the `1b DROP` text and tuning sub-blocks;
  - `script.ts` (DROP is its only editor in 1b; ORBIT sends its one rule as a patch or request): the `◆ THE DOT IS WIDE — REPAIR, or fly lower` lesson on the first L9.
- **Interface to ORBIT, frozen in the foundation:**

  ```ts
  goLowerFit(i: { lz: LzState; factors: DropFactors; ring: Ring; R: number; mu: number; warp: number;
                  orbit: OrbitState; launchRad: number }): { targetRadiusKm: number; floorKm: number; sureTacAtTarget: number } | null
  ```

  - null means even the floor can't fit, so L9 names the REPAIR alone.
  - DROP calls it and ORBIT implements it. Until ORBIT merges, the stub's null gives repair-only L9s.
  - landing.ts (ORBIT) builds `GoLowAim` from the same call. L9's "or fly lower" and the burn the strip times therefore always agree.

### Track UI (views, words below the banner, CSS, audio)

- **Owns:**
  - `landing-hud.ts`, `flight-hud.ts`, NavPlotWindow, plot-landing, GroundTrack, PodBayWindow, EngineWindow, PhoneFlightBar, Footer, Juice/Stamp;
  - `audio.ts`, `audio-cues.ts`, the CSS;
  - landing-text below the UI banner; tuning's UI block.
- **Work:**
  - **NAV PLOT:**
    - a faint dashed DRAG circle, only when `landing.drag`;
    - no-go arcs red-hatched (an SVG `<pattern>`; today `.np-nogo` is only dashed);
    - a grey dot and grey arc with `≈±280 km` when `sol.uncertain`;
    - the GO LOWER `◇` marker at `burnRad` and a small target tick at `launchRad`;
    - the START BURN tick for `landingBurnOffer` only (not the raw `pred.burnPoint`);
    - the stamp `DRAG · ▲ −110 km` at the kick's `rad` on `'drag-kick'`, when `dropKm ≥ DRAG_STAMP_MIN_KM`.
  - **flight-hud:**
    - `burnButton` reads `engineOpen` (landing: `LANDING OVER` once ended);
    - the countdown chip shows the offered burn when it comes before the window;
    - a decay chip: `DECAY · OUT OF BAND IN 2 ORBITS`, plus the `'lift'` key;
    - `≈` on the drop readouts.
  - **GROUND TRACK:**
    - the lava and cliffs stretch words;
    - terrain variety via `terrainStretches(landing)` (pure, a per-terrain pattern table: VOLCANIC `^`/`·`, OCEAN `≈` with `·` under brackets);
    - out-of-band windows listed as `LZ-B ▸ OUT OF BAND`;
    - the grey dot.
  - **POD BAY:**
    - the BAY CTRL pip states from `BAND_COPY.bay`;
    - `BAY OFFLINE` with LAUNCH disabled;
    - the class line `PLAINS · off-site pods score half` and `NO-GO: LAVA` (the card labels the 1a risk 5 left; the ship card proper is slice 3).
  - **EngineWindow:** live in landing.
  - **Audio:** a soft hiss on `'drag-kick'`; the low bonk for a no-go touchdown; the float `+0 LAVA`.
  - **Telemetry:** below 60 it garbles the stamp, the decay chip, `≈` widths and the GO LOWER countdown, through the existing scramblers.
- UI builds against the foundation's stubs, and against states set directly in tests (`decay.last`, `goLow`).

### Merge order

Foundation → architecture review → ORBIT ∥ DROP ∥ UI. DROP merges first because it is smallest; ORBIT rebases. UI rebases last. Then a full review, the tier, and one e2e run.

---

## 4. Tests

The budget is 137 suites in 231 s on 4 workers, with a 300 s cap. **New suites must stay small** and build their states directly (`lockOn(h, { r, e, argPeriDeg, status })`, plus direct `store.update` of segments and `landing.*`). Target: about +25 s of CPU, about +8 s of wall time.

### New suites

| Suite (owner) | Checks |
|---|---|
| `landing/drop-model.test.ts` (DROP, mostly pure, about 3 s) | <ul><li>Factor tables per band.</li><li>§3.2's m = 1.5 / 2 / 3 rows (±72/97/145 km at 5,000; "never fits" at 7,000 with m = 2), sure seconds within ±0.3 s against `windowsFor`.</li><li>`uncertain` for failing, dead and missing Sensor Interp.</li><li>No solution with a dead or missing Nav Plotter.</li><li>Cadence 2.0/2.7/4.0/10.0 and the refusal order with BAY OFFLINE.</li><li>The `bay-offline` auto-end.</li><li>No-go classification scores 0 on every class.</li><li>`launchGuard` `'no-go'` with its word.</li><li>The 150 km rule (VESPER and LAST LIGHT pass; a crafted def 200 km away throws).</li><li>`bestRepairForDrop` picks.</li><li>L8 ×3, L9 variants, L5-lava, L12-bay from crafted contexts, at ≤ 70 chars with worst-case vars.</li></ul> |
| `landing/decay.test.ts` (ORBIT, about 6 s) | <ul><li>`dragDvKmS`.</li><li>The worked example: a circular 5,250 km orbit on a 5,000–7,000 band; kicks of 15 / 22 / 24 m/s (±1); ▼ at 4,973 km ±10 after three orbits, sim and `decayForecast` agreeing.</li><li>ARES-VII never kicks.</li><li>A 3-orbit SKIP equals CRUISE stepping (▼ ±1 km, same kick count); one kick per ▼ near-circular under CRUISE.</li><li>`orbitEpoch` bump → drop cache re-solved; `validUntilTSec` = next kick.</li><li>The stamp threshold.</li><li>L10 at ≤ 2 orbits, then the `'lift'` burn and its release at the line.</li></ul> |
| `landing/engine-landing.test.ts` (ORBIT, about 12 s) | <ul><li>SPACE burns in landing; `ENGINE FIRING` refuses [L].</li><li>PARTIAL orbit: L2 shows F11; ignoring it sets `declined` (no SKIP stop next pass).</li><li>GO LOWER: offered when the target's dot doesn't fit and the floor does; `◇` timing (`eventInSec` to `burnRad` within 0.5 tac s); a scripted kid holding SPACE on `HOLD [SPACE] NOW` and releasing 0.3 s after `RELEASE` ends with the sure window ≥ 4 s and ▼ in band (risk 1's measurement).</li><li>TACTICAL within 8 s of the burn; the SKIP stops `SKIP_END_LEAD_TAC` before it.</li><li>HOLLOW drain = max(burnMult, landMult) during a burn in an open window.</li><li>AUTOBURN refused.</li><li>A dry tank with ▼ under the planet: `crashed`, pods aboard not-launched, falling pods scored.</li><li>`dropSolvable` false → an empty solution and an L2 row (no throw).</li></ul> |

### Existing suites that change

- `landing/table` (DROP): L2 replaces the throw; new rows; a **fuzz pass** of about 50 crafted contexts asserting that every one matches a row.
- `landing/rules`: `dropFactors` no longer all 1; the refusal order; the guard.
- `landing/bay`: cadence by band.
- `landing/pace-landing`: burn TACTICAL and its SKIP stop.
- `landing/hud` (UI): grey dot, DRAG radius, decay chip, `◇` marker, hatched no-go spans, BAY pip, out-of-band list.
- `landing/flow` and `landing/review-fixes`: HALCYON p2 now meets L2 (the kid declines); VESPER and LAST LIGHT may land in lava. Assert ends and rows, not points.
- `wp4/capabilities`: `bay.offline`, the `drop` factors, `BAND_COPY.bay`.
- **Ship 1:** wp6/wp7 run-flow and story suites. Sensor Interp arrives at 78 (×1.5) and POD 02 at 44 (×2), so POD 02 is ×3 = ±325 km at 7,000 km. That is wider than WIDE LZ-A, so L9 shows. Re-measure any check pinned to ship 1's points.
- `support/words.test`: the never-say rules over the new strings.
- `wp12/fix1/entries`: landing-orbit must stay out of the cycle.
- `wp12/playthrough`: INFO only.
- **e2e, once at the end:**
  - `playthrough.mjs` ship 1 (L9 is possible: the kid follows `[F]`/`[L]`; confirm `LANDED n / N` only);
  - VESPER's report may show a NO-GO row;
  - `phone.mjs` (EngineWindow live in landing).

---

## 5. Risks and open questions (each with a recommended answer)

1. **GO LOWER is a twitch.**
   - At the landing's ×20, full thrust gives about 0.1 km/s per real second. Going from 6,000 km to 5,300 km at the launch point is about 0.084 km/s, so **about 0.8 real s**.
   - A 0.3 s late release overshoots about 250 km, which can drop the launch point out of the band.
   - **Recommend:**
     - judge the release with F6's `RELEASE_LEAD_TAC`;
     - aim at the 4 s radius, keeping the floor + 100 as a hard stop;
     - measure in engine-landing.test.
   - If a 0.3 s reaction leaves the band, the landing's burns run at `LANDING_BURN_POWER` 0.5 (a tuning number, shown on the POWER slider). **Raise this to Fran:** §3.7's "one RETRO burn the strip times and releases" holds only if it is not a twitch.
2. **Offered burns stop SKIPs and force TACTICAL.** A PARTIAL orbit's trim, or a GO LOWER the kid doesn't want, would cost about 30 tac s every orbit. **Recommend** `LandingState.declined`: an offered burn that passes unburned stops neither SKIP nor pace until a launch, its LZ's window passing, or a new reason. L2 still shows it when the next window is out of band.
3. **L10's "plus the trim's key"** needs a burn that exists while still in band. **Recommend** the `'lift'` reason: PRO at ▲, ▼ to the DRAG line + 50 km. It is the hand version of v3's hold, a small spec extension; tell Fran.
4. **Kicks do not stop a SKIP.** This goes against 1a plan §1.7's `'kick'` event. The jump is split exactly at each kick. The SKIP's end only moves nearer (pace's min rule), and the drop cache re-solves on the epoch. Stopping at each kick would add a stop per orbit, making 24-second windows about 30 s. **Recommend: no stop.**
5. **Ghost thrust during landing** (VESPER's damaged Thrust Ctrl) comes with the unified tick. §3.3 lists ghost thrust among the `ENGINE FIRING` causes, so it is intended. It can push the orbit and refuse launches. **Recommend: yes** (SWAP Thrust.alt is the fix the ship already teaches). Watch VESPER's flow and boss-sim timings.
6. **Landing crash and escape.** These were unreachable in 1a. **Recommend** `endLandingLost`: status `crashed`/`escaped`, the LOST card via `shipLost`, pods aboard not-launched, falling pods scored. §3.10 says a crash "plays as CRASHED".
7. **Ship 1 in 1b.**
   - Sensor Interp arrives at 78 (`FRESH_UNIT_RACK_E`), so the first drop is ±117, not the ±78 of §2's narrative.
   - POD 02 unrepaired is ×3 and gets L9.
   - **Recommend:** keep it (honest: the boot names the sensor, and WIDE still fits pods 1 and 3). Slice 2's calm opening decides whether ship 1 arrives healthy.
8. **Bay Ctrl damage is permanent.** It is a ship file with no backup, and REPAIR says `SWAP OR DELETE IT`. A `Bay.alt` would take 6 of rack A's 18 free, below 04's 14 for residents. **Recommend:** no backup. Only LAST LIGHT's belt (rack A) and HOLLOW reach it, and a degraded bay costs 0.7 s per pod.
9. **The drop solver's domain.** With the engine open, the kid can fly orbits where `podKickState` throws (steep paths) or the dot track isn't monotonic (a dev throw). **Recommend** `dropSolvable(elements)`: closed, `e < DROP_SOLVE_MAX_E`, ▼ above `rAtm`, the pod kick solvable at the sampled ▲ and ▼. Outside it, the empty solution and L2's trims or F rows. Fuzz it in table.test. This is "fail loudly" applied to states that should not happen; these now can.
10. **Near-circular ▼ for kicks:** the min-gap and catch-up rule (§1.4), with a dev assertion.
11. **Windows beyond the next kick are a forecast.** `validUntilTSec` names them. The countdowns may jump by about a tactical second at a kick. Accept it; the cadence of re-solving already handles it.
12. **L9 versus SKIP.** L9 is `soon` and shadows L13's `[F] to SKIP`, and 70 characters leave no room for both. **Recommend:**
    - L9 appends ` · [F]` when a SKIP is available and the line fits, else keys `['F']` with no words;
    - followLanding presses `[F]` only on a shown `[F]`, so the tail matters for the headless kids.
13. **No-go arcs only bite on a wide dot**, which the kid can't see coming from a centre-based guard. **Recommend** the L5 variant `WIDE DROP, LAVA in reach`. Without it, lava reads as random.
14. **Lessons.**
    - In 1b: `◆ BELOW THE DRAG LINE THE ORBIT SINKS` (on the first stamped kick) and `◆ THE DOT IS WIDE — REPAIR, or fly lower` (on the first L9). Both are tied to 1b mechanics.
    - In slice 2: `◆ PODS LAND WHERE THE DOT IS` and `◆ 2 SITES …`. They are first-time ship 1–2 lessons in the calm opening, and adding them now would churn every run-flow suite twice.
15. **Stamp noise.** A ▼ a few km under the line kicks under 1 m/s every orbit. **Recommend** `DRAG_STAMP_MIN_KM` 10, for the stamp, the hiss and the lesson. Physics stays continuous.
16. **Sensor Interp being repaired is offline,** so its band is dead and the dot goes ×2.5 grey for the repair's few seconds. This is consistent with the plot's PATH UNCERTAIN. Accept it. L8's `repairing` variant never asks for a second repair.
17. **Bay Ctrl dead (10 s)** means one pod per sure window, so a 12-pod ship takes about 12 windows (about 5 min). That is punishing but rare. Keep §3.4's number and watch it.
18. **A stray SPACE in landing now burns FUEL.** The flight rows' TOO EARLY / RELEASE handle it, and the FUEL star counts it. Accept it. [L] is the landing's key.
19. **LOAD NEXT changes the dot**, because the solution is for the next pod's driver. That is a feature: pin a healthy driver for the NARROW LZ. The POD BAY's `NEXT … ±km` shows it.
20. **Decided items that may hurt gameplay**, to raise with Fran:
    - (a) GO LOWER's burn length (risk 1);
    - (b) `DECAY_WARN_ORBITS` 2 is about two SKIPs, roughly 12 real s. The warning row stands until fixed, but L10 must not be shadowed by the window rows when it matters. Keep it at `soon`, which shows between windows;
    - (c) Bay Ctrl dead at 10 s (risk 17);
    - (d) the spec places drag on every non-layer-1 ship, including calm HALCYON (layer 2). An ordinary lock sits above the line, so in practice it bites only after GO LOWER, which is the intended trade.

### Critical files for implementation

- /home/user/ArrivalProtocol/src/systems/orbit-sim.ts
- /home/user/ArrivalProtocol/src/systems/predict.ts
- /home/user/ArrivalProtocol/src/systems/landing-guidance.ts
- /home/user/ArrivalProtocol/src/systems/landing-rules.ts
- /home/user/ArrivalProtocol/src/systems/capabilities.ts
- /home/user/ArrivalProtocol/src/types/landing.ts (new: /home/user/ArrivalProtocol/src/systems/landing-orbit.ts)

---

## Deviations (foundation)

The foundation (§3.0 items 1–8) is in. Typecheck and the tests' tsc are green. The full unit tier passes (137 suites in 161 s, quick depth, 4 workers). Nothing changes behaviour except that VESPER and LAST LIGHT now have their no-go arcs, so a pod landing in one scores 0. No unit suite pinned points that changed. Each deviation below is listed with its reason.

**Interfaces**
1. **`buildLandingContext(state, sol, skipAvailable, flight: LandingFlight)`.** The fourth argument is `{ row: FlightObjective | null; burnInTac: number | null }`, not the bare flight row.
   - Why: L2's `flightBurnInTac ≤ 8` needs the offered burn's START BURN. landing-guidance can't compute that without importing predict or guidance values, which would bring back the load-order cycle.
   - `guidance.landingFlightOf(state, pred)` builds the argument: `buildFlightContext`, then `landingFlightRow`, plus `ctx.burnPoint?.inTac`. The director's one line, `debug.ts` and pace-landing.test call it.
2. **`LandingContext.firing`** (`state.burn.firing`) is new. L2's "thrust, firing, …" needs it, and §3.0's field list left it out.
3. **`FlightContext.landing: boolean`** is added now (§1.4 lists it).
   - In LANDING, `buildFlightContext` takes `burnPoint` from `landingBurnOffer(state, pred)` (a stub returning null) instead of the raw plan. That makes "ctx.burnPoint is the offer" true from the start.
   - Only `landingFlightOf` builds a flight context in landing, so nothing else changes.
4. **The landing table's fields are wired to stub functions, not left for the tracks to wire.** Each track fills its own function and the row comes alive, without either track editing landing-guidance.ts. The wiring:
   - `uncertain`: built from `caps.drop.uncertain`, the awaited window and `plotFault`.
   - `tooWide`: `landing-rules.dropTooWide`.
   - `decay`: `landing-orbit.decayForecast`.
   - `bayOffline`: `caps.bay.offline`.
   - `lavaInReach`: a new DROP stub, `landing-rules.noGoInReach(noGo, dot, R): NoGoArcState | null`. The plan computes it but names no function, and AUTODROP will want the same answer.
5. **`landingStuck` is already called** by landing.ts `noneLeftTick` (`endNow(store, stuck)`). The plan gave that wiring to ORBIT. With it in place, DROP's `'bay-offline'` takes effect without touching landing.ts. The stub keeps 1a's rule.
6. **`launchGuardText(guard, terrain)`** in landing-rules, with `LaunchGuard.word: string | null`. `requestLaunch` now asks it for the confirm's words.
   - Why: the old ternary sent any ask that was not `'off-site'` to the full-LZ text, so DROP's `'no-go'` ask would have needed an edit in ORBIT's landing.ts.
   - `launchGuard` still returns `'off-site'` for a no-go dot (TODO DROP).
7. **landing-orbit signatures beyond §1.1's names.** The plan named these functions without full signatures:
   - `dropSolvable(orbit, planet: PlanetParams)`, not `(elements)`: it needs mu, R and rAtm, and the pod-kick check needs the state.
   - `goLowDvKmS(atBurn, launchRad, targetRadiusKm, mu)` takes `launchRad` explicitly, so the sign never has to be inferred.
   - `goLowReleased(orbit, mu, aim, rateKmPerTac)` takes the rate as an argument. It is F6's rule, and the rate comes from the thrust state, which is not pure.
   - `decayForecast(orbit, mu, ring, drag)` returns `DecayForecast { orbitsToLeave: number | null; nextDvKmS }`.
   - `goLowerFit` is exactly the frozen shape, with named types `GoLowerInput` and `GoLowerFit`.
8. **Two landing-orbit functions do real work, the rest are stubs:**
   - `dragLineKm(ring)` is real: one line of §3.7, and UI's DRAG circle can use it now.
   - `LzWindow.launchRad` is computed for real in `windowsFor`: the ship's world angle at the centre crossing. A placeholder value would be a trap for DROP's `goLowerFit` call.
   - `DropSolution.validUntilTSec` is null, with a TODO for ORBIT in drop-cache.

**Types**
9. **`TooWide` and `RepairHint`** live in types/landing.ts, so DROP, the table and UI share them. `RepairHint` is `{ file: 'driver'; pod; factor } | { file: 'sensor' | 'navplot'; factor }`.
10. **`TrimReason` is spelled out** as the four ring reasons. `BurnReason` is built from it plus `'go-low' | 'lift'`. Three flight-only places were adjusted to match:
    - predict `isTrim` tests membership of the four;
    - `loopProblem` uses `isTrim`;
    - `unpaidFixStrands` refuses `'point'`.

    guidance's flight table throws on a `'go-low'` or `'lift'` burn during the flight, because those are landing-only. `EVENT_GLYPH` is now a `Record<BurnEvent, string>` with `point: '◇'`.

**Words**
11. **On screen, BAY OFFLINE reads `NO BAY CTRL`.**
    - `LAUNCH_REFUSAL_TEXT['BAY OFFLINE']` is `NO BAY CTRL — no pod can launch`.
    - L12-bay is `NO BAY CTRL — END LANDING parks them in orbit`.
    - Why: §3.10 rules out "offline" next to pods, and both `support/words.test` and `landing/table.test` reject it in landing-text. `NO BAY CTRL` is already `BAND_COPY.bay.missing`.
    - The refusal key `'BAY OFFLINE'` and the ending `'bay-offline'` keep the plan's names.
12. **The report's words for the `bay-offline` ending** are a new `LANDING_END_TEXT: Record<LandingEnd, string | null>` under the DROP banner. Before this, no `Record<LandingEnd>` existed. The other three endings are null, so the report is unchanged. Parked pods' own reason still reads `no time`, and UI decides whether the report shows this line.
13. **L8 has four wordings, not three.**
    - Moving says `IS MOVING…`, not `IS REPAIRING…` (`landing-L8-busy`).
    - The missing variant (`landing-L8-missing`, urgency wait) keeps the SKIP's ` · [F]` tail through the same helper as L9 (risk 12), so a row that shadows L13 never takes the SKIP away.
14. **L9 and L10 details.**
    - L9 is a mind-layer row when it names a REPAIR: it lights Sensor Interp's or Nav Plotter's chip (`repairs`), or the driver in the MIND (`highlight`). It is a ship-layer row for GO LOWER alone.
    - L10 carries the flight row's keys ("plus the trim's key") while one is offered.
    - New row ids: `landing-L5-nogo`, `landing-L8-busy`, `landing-L8-missing`, `landing-L12-bay`.

**Tuning**
15. **Two names beyond the §2.2 list:**
    - `DRAG_LINE_FRAC = SWEET_ZONE_FRAC`: an alias with the WHY, so the line's rule has a name.
    - `DRAG_KICK_CATCH_UP_FRAC` 1.5: §1.4's "missed kick after 1.5 × period", a number that belongs in tuning.

    `BAY_CADENCE_BY_BAND.ok` is `BAY_CADENCE_TAC`.

**Tests changed**
- `landing/table`: the thrust-throws check became L2 checks. Added checks for L5-nogo, L8 ×4, L9 ×3, L10, L12-bay and their order, plus worst-case lengths and never-say words over every 1b string, `[TAB]` wordings included.
- `landing/rules`: the "clear arc" case moved to 168.7°, within 150 km of LZ-A. A new check that an arc 300° away throws. The fake state and the drop literals gained the new fields.
- These suites only needed the new required fields added:
  - drop literals in `landing/solve`, `landing/hud` and `landing/review-fixes`;
  - `FlightContext` literals in `lead1/f1-yield`, `wp9/lines` and `wp9/fix1/fixes`;
  - `landing/pace-landing` passes `landingFlightOf`.
- `landing/harness-landing`: `END_LANDING_ROWS` gains `landing-L12-bay`.

### Deviations (foundation, review follow-up)

An independent review of `abf886b` checked the import graph and the seams. Its findings were applied in one more commit; the foundation's own deviations above still stand where these don't replace them.

**Blockers**
- **B1, no drop dot.** With the engine open, an open path or an orbit outside `dropSolvable` gives `block === null`, `dot === null`, no windows. `LandingContext.noDrop` (that condition) makes L2 lead, and a fallback row `landing-L13-nodrop` (`LANDING_NODROP_LINES.L13noDrop`, ORBIT banner: `NO DROP DOT ON THIS PATH — fly back into the launch band`, urgency wait) covers it with no flight row. Both probe cases are in table.test. (The probe's own `ctx` predates `noDrop`, so it still throws there by construction.)
- **B2, the offer no longer replaces `burnPoint`.** In landing `FlightContext.burnPoint` is the raw plan again (evaluatePath needs one on an open path and an out-of-ring loop; F9/F10 and a declined trim with the next window out of band are named from it). `FlightContext.offer: (BurnPoint & { inTac; burnTac }) | null` is `landingBurnOffer` in landing, null in flight. `landingFlightOf.burnInTac` reads the offer only. `landingBurnOffer`'s doc now says capture, missed and shrink are safety burns, always offered and never declinable.
- **B3, a ship lost during the landing.** `LandingEnd` gains `'ship-lost'` (`LANDING_END_TEXT` null: the LOST card says it). New `landing-rules.landingOutcome(status)` returns crashed / escaped, else `inOrbitOutcome`; `endNow` and the LANDING REPORT use it, so ORBIT's `endLandingLost` can end through `endNow(store, 'ship-lost')` and the pods aboard go NOT LAUNCHED. `engineOpen` in landing also requires `burn.status` locked or accepted.

**Majors**
- **M1.** `landing-orbit.declineKey(bp)` = `reason|event` (+ `|aimLz` for go-low), documented on `DeclinedBurn.key`; predict `burnKey`'s due|ahead would never match the next pass's replan (flight-events keys its beeps the same way).
- **M2.** A near offered burn (`flightBurnInTac ≤ 8`) as L2's only trigger yields to L3, L3b, L4, L5 and L6 while a window is open and a pod can launch. It still beats GET READY (both L7s). Thrust, firing, F4, `noDrop`, the next window out of band and no window in band still lead outright.
- **M3.** L12-bay moved to just after L2. `landingMoment(state, sol, now, bayOffline)` takes a fourth argument (callers pass `capabilitiesNow(state).bay.offline`): with Bay Ctrl missing `canLaunch` and `awaited` are false, so no TACTICAL, WINDOW OPEN or GET READY. Callers updated: pace, landing.ts, landing-hud ×3, flight-hud, landing-guidance, rules.test.
- **M4.** L10 sits above L8 and L9, and takes keys only from a `LIFT-*` row. `dropTooWide`'s doc says `goLower` is false while decay is warned, and that it never returns `{ repair: null, goLower: false }`; `tooWideLine` throws on that.
- **M5, not applied (rejected for the foundation; handed to ORBIT).** Projecting max(burnMult, landMult) in landing (`drainRatePerSec(cfg, engineOpen(state), true)`) was tried and broke `wp6/hollow-sim`: ship 1's tutorial alarm `POD 01 WILL BE EATEN IN 0:10` came 20 s before the eat instead of 10 (ARES-VII: landMult 1, burnMult 2). In the foundation nothing can burn in landing (flight-controls still refuses), so the projection would be wrong for every landing until ORBIT opens the throttle, and the brief says nothing changes behaviour yet. It belongs with ORBIT's engine opening, and it is a design trade for Fran either way: projecting the burn makes every landing countdown (the tutorial's scripted bite included) run at half speed while coasting, as flight's do; projecting landMult makes it jump when the kid burns. See ORBIT's notes.

**Minors**
- `landing-orbit.sureTacAt(radiusKm, speedKmS, lz, factors, R, warp): number` is real (closed form: (2·(half-width − s) / R) / (v / r) / warp, 0 when the dot never fits). `goLowerFit` and `highestFittingRadius` are documented as defined through it (GO LOWER is v3's one-LZ case by construction), as closed-form or memoised (L9 calls them every director frame; never `dotTrack` inside a bisection), and with the caveat that the pod's lead angle shrinks with altitude, so ORBIT tests the 4 s margin against the re-solved window.
- **The solver's domain gate, done differently than asked.** The review asked for `DropSolveInput` to gain the planet so `computeDropSolution` could call `dropSolvable`. That would make landing-solve import landing-orbit, which already imports landing-solve (for `sureTacAt`'s drop width): a two-way edge the project keeps out. Instead `DropSolveInput.solvable: boolean` carries the caller's `dropSolvable(state, planet)` answer: drop-cache's `recompute` asks it once and gates both `dotTrack` and the solve on it; `computeDropSolution` returns the empty solution (no dot, no windows, the real period) when it is false, after the NO DROP SOLUTION check so L1 still wins.
- landing-orbit's header says it never imports landing-rules (DROP's landing-rules → landing-orbit stays one-way), and landing-solve never imports landing-orbit.
- `LandingObjective.warn` is new; L2 keeps the flight row's warning colour, and the director's `landingLine` passes it to the strip.

### Notes for the tracks (foundation review)

**ORBIT**
- predict's in-landing order (§1.4): impact, ring trims, `'go-low'`, `'lift'`. `'lift'` goes through `planTrim` with a target override (`dragLine + DRAG_LIFT_MARGIN_KM`), not `trimTarget`, which stays the ring's.
- Hold the window's edge events (window-open / sure / closed) steady during thrust: the 1 km element key re-solves at 10 Hz under a burn and an edge can flicker.
- MERGE's reopen (finale.ts sets `ended` back to null) must also reset `goLow` and `declined`.
- run.ts `lossPlan`'s simulated retry is flight-only; a ship lost in landing ('ship-lost') must not offer it.
- Decide whether a go-low burn the tank can't pay for (`fuelShort`) is offered; say so in `landingBurnOffer`'s doc.
- `endLandingLost` ends through `endNow(store, 'ship-lost')` (B3).
- M5 (not applied by the foundation): once thrust counts in landing, `hollow.projectedDrainPerSec` should project `drainRatePerSec(cfg, engineOpen(state), true)` so `WILL BE EATEN IN` doesn't jump on a burn. It moves `wp6/hollow-sim`'s tutorial alarm from 10 s to 20 s before the eat on ARES-VII; raise it to Fran with the slice (or keep landMult and accept the jump).

**UI**
- flight-hud reads `pred.burnPoint` at about lines 187, 217, 302, 557 and 794 (the START BURN tick, the countdown chip, the beeps' readers). In landing they should read the offer: pass an injected `offer` parameter (landing-orbit `landingBurnOffer`), not the raw plan.

**DROP**
- L9's words have no TAB from the ship (§3.11's text); decide whether a REPAIR-naming L9 says `TAB, REPAIR …` as L1 and L8 do.
- MERGE's blind drop (slice 7) wants the product of the factors: consider a `DropFactors` product helper (`dropFactorProduct`) beside `dropFactors`, so `s × BLIND_DROP_MULT` has one place.
- `dropTooWide` must return `goLower: false` while decay is warned, and never `{ repair: null, goLower: false }` (M4).
