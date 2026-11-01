# Slice 3a implementation plan: the galaxy map (arm, run 1's roll, DESK, years, variable memory)

Written by the architect agent from HEAD a6e166c on `claude/modest-hawking-209t0f`. Paths are relative to `/home/user/ArrivalProtocol`. Citations: 02-map.md (02 §n), 01-landing.md (01 §n), 04-threats.md (04 §n), 05-story.md (05 §n). Where they differ, DECISIONS.md wins. "The code as built" means the slice-1a, 1b and 2 plans together with every Deviations section. Code style follows AGENTS.md: functions and data, numbers in tuning.ts with a WHY, fail loudly, and comments that say WHY.

**Lead decisions on §7's risks (2026-11-02).** All recommendations are adopted. Fran (2026-11-02): most open
gameplay calls from slices 1–2 should resolve themselves as the full plan is implemented, so 3a measures them rather
than tuning them (§1.3). Reported to Fran with the slice, not changed quietly: risk 1 (VESPER loses HOLLOW on run 1;
the boarding moves to a generated layer-6/7 ship), risk 2 (run 1 is §3.14's authored structure with rolled details,
not a fresh roll), risk 5 (noise into the final ship; the lever is a cap of one beam seed), risk 8 (round half up;
ALBATROSS's 11-year margin kept as authored), risk 12 (IMPACT COURSE and TOO WIDE are their templates' own) and risk
13 (the sleep line moves into 3a). Any of these may be reverted per `DECISIONS.md`.

**Process.** F1 (the memory and ship-shape refactor, with no visible change) → review → F2 (map types and state, the desk phase, stubs with their final signatures, text, `?debug` hooks) → Tracks GEN, DESK and TESTS in parallel → merge in the order GEN, DESK, TESTS → full review → fixes → unit tier (under 300 s) → one e2e run.

---

## 1. Scope

### 1.1 What 3a delivers

**From 02 (§8, 3a)**
1. **The arm as data** (02 §3.2). It has 20 worlds in 8 layers with stable ids, SOL at (0, 0), and one end slot (w19). The arm check runs at load:
   - every one-layer pair is within 58 LY;
   - no pair three or more layers apart is within range;
   - no world lies within 5 LY of a `046.log` ring.
2. **Time and the beam** (02 §3.1, §3.3):
   - whole-LY distances;
   - approach years, slack, reachability, the galaxy year;
   - link `round(146 − 1.1·d)`, hits `round(d/7)`, ECC `floor(slack/25)`;
   - the BEAM OUT and emergency extras, counted before ECC;
   - noise clouds rolled per run, hop noise 0–3.
3. **Run 1's roll and its checks** (02 §3.4, §3.6, §3.14):
   - the run-1 arm: §3.14's table as authored structure, with ship details rolled from the arm seed (decision in §2.3);
   - the fresh-roll generator (layer bases, timing offsets and jitter, arks from their real neighbours, the ark pattern, the final year, pods, LIGHT_SHARE, at most two late TIGHT ships per layer);
   - validity checks 1–5, with 50 attempts and then a throw.
4. **Generated ships from the five flight templates** (02 §3.5):
   - templates allowed by layer;
   - the modifier library and counts;
   - names from 05's pool;
   - **reservations rolled now and stored, but not shown**: corrupted, left and sleeping residents; the three `?` ships; the 5 fragments; POOR site data. Each comes from its own named stream, so later slices don't move the arms.
5. **Memory classes** (02 §3.4 class rule, 01 §3.16):
   - FULL, COMPACT and TIGHT on every ship;
   - the card's MEMORY row and fit line;
   - the PACKET's room bar and room check;
   - TIGHT's waived floor and its 0-charge confirm.
6. **The DESK** (02 §3.10, §4):
   - the STAR CHART, the SHIP CARD, SET COURSE, `◀ CHART`, arrow-key cycling;
   - the opening beat (ships greying out, `n SHIPS NOW OUT OF YOUR REACH`);
   - a guidance strip with two steps (ship, SET COURSE);
   - a phone layout (bottom sheet).
7. **The years on screen**:
   - the card's top block and its TIMELINE strip (without deliveries);
   - the PACKET headline (`NEXT: KESTREL · 1,200 COLONISTS · 26 LY · 89 YRS EARLY`);
   - the ECC line `ON THE WAY: 4 TRANSIT HITS · ECC FIXES 3 WHILE YOU SLEEP (89 YRS) → 1 LANDS`;
   - the header crumb `UNIT-047 / KESTREL · 2467 / FLYBY`;
   - the boot's ECC block (02 §4 step 5).
8. **The final-ship role** (02 §3.6): `isFinal` = the ship in an end slot, a pulsing `FINAL SHIP` beacon, the run ending at the first final ship landed on, and losing it is FINAL SHIP LOST.
9. **The RUN TALLY for visited ships** (02 §4):
   - one row per visited ship (`3 · KESTREL · 2467 · LANDED 1,000 / 1,200`, stars);
   - the route on a mini chart, `n COLONIES FOUNDED`;
   - score, rank and near misses; ranks are absolute on the arm.
10. **`?debug` helpers**: `__ap.slot(s)`, `__ap.route([...])`, `__ap.runNumber(n)`, `__ap.arm()`, `__ap.hop(a, b)`, `__ap.course(s)`.

**From 01 (§8, slice 3)**

11. **§3.15's roller** inside the generator, keyed by the ship's own rng key (risk 9). It returns:
    - the LZs and counts, with an uneven split 1 in 2 from layer 2;
    - widths, the class and terrain word, no-go arcs by layer (within 150 km of a bracket edge);
    - POOR site data, rolled and stored (it plays GOOD until slice 6);
    - driver arrival damage by layer (the existing `driverArrivalDamage`), and drag.

    It reuses `validateLandingDef`. The per-ship result already lands in `run.ships` (`ShipResult.slot`/`depth` become real); the save itself is 3c.
12. **Variable memory**:
    - step 1 (F1): a refactor with no visible change; size and rack names come from the ship, and every ship stays FULL;
    - step 2 (GEN): COMPACT and TIGHT, the pod-rack generator rule (01 §3.16), the boot's fill order with no floor on TIGHT, `> RECEIVER: 1 RACK · ROOM 88`, and `CHARGE OVERFLOW · n LOST · NO ROOM ON <SHIP>`;
    - the card row and room bar (DESK).

**From 04 (§8 item 3)**

13. **Noise and the seed table** on real hops (`BEAM_SEED_ODDS`, already in tuning.ts). On the tutorial run the first depth-3 beam keeps the scripted Telemetry seed (§2.6).
14. **TRACE on the map**:
    - the desk shows the meter;
    - the card's BEAM row shows `SEEDS 0–2` / `SEEDS: none` before depth 3;
    - the card shows `HOLLOW WILL FIND YOU ON THIS BEAM` from `planThreat(...).boards` for the candidate.
15. **Boarding** by TRACE ≥ 3 or by M3 ("a final ship is reachable from the destination").
16. **The FINALE** keyed by `isFinal`.
17. **The full ladder for 5–8 ships**: planThreat is unchanged, fed by the route's depth.
18. **The root in the packet**: built in slice 2 (`TransitPlan.threat`). **A root slot on every ship in layer 4 or beyond** (the slice-2 foundation note) and on the final ship.

**From 05 (§8 item 3)**

19. **Rings replace the interim keys**: an entry opens at the first boot at or beyond its ring, and a two-layer hop opens two.
20. **046's written trail on the chart**: WAYPOINT 2299, MERIDIAN 2350, TALLGRASS 2464, and a grey cross past Calder at 2598, each `UNIT-046 GETS THERE FIRST` until the galaxy year passes it.
21. **The title line** `ARRIVAL PROTOCOL // OUTWARD BOUND`, `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`. `FLEET_ROUTE_LY` goes.
22. **The BEAM stamp** `OUTWARD BOUND` and CONTROL's "Outward bound! :)".
23. **The ghost line by layer** (interim, §2.9).

### 1.2 NOT in 3a

- **3b (repository and deliveries):**
  - the REPOSITORY window, requests, the delivery rule, delivery chips, SEND ON;
  - the sleep line's delivery companion and the delivery boot lines;
  - REPAIR v2 leaving the salvage pool;
  - **the INBOX** (the welcome, CONTROL's replies as size-0 deliveries, postcards, 046's no-address mail). Why: every message except the welcome is routed by the delivery rule, and the INBOX is a desk window like the REPOSITORY, so one host is built once.
  - deleting `licences.ts`'s interim schedule.
- **3c (save and world update):**
  - the run save and its four points;
  - archive v2 (arm state, trail, colonies, routes, events);
  - the world update (launch gap, ARES series by update, TAKEN / REPORTED HOME / leaving reasons, drift limit, steady arm, time valve);
  - the RESUME block;
  - INBOX and log in the save;
  - §3.13's 200-consecutive-run statistics.
- **Slice 4:** TRAINING and its required first-desk pick, the AHEAD row, skills in the restricted list.
- **Slice 5:**
  - the RESIDENT row and `RECEIVER CLOSED`;
  - `?` ships shown as `?`;
  - the fragment glyph.
- **Slice 6:** POOR planets played as POOR.
- **Slice 7:** the run-end order (FINALE before the final report), THE LAST LANDING, trace places, the final ship's last-ending row.
- **After slice 7:** several end slots.

### 1.3 Open calls from slices 1–2: what 3a resolves or moves

| Call | 3a |
|---|---|
| Slice-2 risk 3, "TRACE has no effect yet" | **Resolved.** TRACE ≥ 3 boards HOLLOW at depth ≥ 4 on any hop, and the card says so before SET COURSE. Seeds now ride every beam from depth 3 by noise. The meter's "Something out there is listening." title can go. |
| Slice-2 risk 2, "one ship of HOLLOW before the finale" | **Moved into the route and the kid's hands.** M3 forces boarding only in layers 6–7 (Avalon is the only layer-6 world in range of New Haven, at 54 LY), so a careful kid still gets one HOLLOW ship (04 §3.16 B, by design), while a sloppy kid on noisy hops gets 2–4. TESTS measures the share of routes with ≥ 2 HOLLOW ships under a "leave every seed" policy. The parked lever (the final ship drops its own wall seeds) stays parked until then. |
| Slice-2 risk 1, "calm ships thin" | **Partly resolved:** <ul><li>the desk adds the run's first real decision (ALBATROSS, 15 pods, only from ship 1);</li><li>depth 2 can be a 15-pod ark (about 6 windows by hand) or KESTREL's debris by a long hop;</li><li>the generator guarantees one Debris ship among layer-3 ships reachable from w0 (04 §3.2's recommendation; KESTREL on run 1);</li><li>COMPACT/TIGHT charge squeezes start at depth 2.</li></ul>The "something every ~20 s" playtest check stays. |
| Slice-2 OPENING note, "MERGE margin" (LAST LIGHT link 98) | **Moved to the route.** The final hop's link is now 87–117 by origin (CORMORANT 54 LY gives 87, WAYFARER 26 LY gives 117). ECC on big slack cuts the hits. The classic fixture keeps 98. TESTS measures charge at the choice on the map route (risk 6). |
| Slice-1a risk 2, pod counts 12/12/16 versus 6/16/16 | **Resolved on the arm:** KESTREL 6 (COMPACT), VESPER 16 (FULL ark), LAST LIGHT 16. The classic fixture keeps 12/12/16. |
| Slice-2 foundation note: "any ship at depth ≥ BOARD_MIN_DEPTH needs a root slot" | **Resolved:** a slot on every ship in layer 4 or beyond and on the final ship (the lowest depth in layer 4 is 3, so slots in layers ≤ 3 are never needed). |
| Slice-2 risk 11 / follow-up, the ghost by layer | **Resolved for 3a** by the layer of the named ship on the current arm (§2.9). 3c's grey cross replaces it. |
| Slice-1b, "the ship card proper is slice 3" | **Resolved:** the card carries `PLAINS · off-site pods score half`, `NO-GO ZONES`, `LZ: n · SET BY ARRIVAL CONTROL`. |
| Slice-1a risk 10, the archive's `woke` | Moved to 3c (archive v2). |

---

## 2. Architecture

### 2.1 Module map (new modules in bold)

| Module | Kind | Owner after F2 | Responsibility |
|---|---|---|---|
| **`src/types/map.ts`** | types | GEN | `WorldDef`, `ShipKind`, `TemplateId`, `ModifierId`, `MemoryClass`, `MemoryLayout`, `ArmShip`, `Reservations`, `NoiseCloud`, `Hop`, `RouteStop`, `RunMapState`, `ShipKey` |
| **`src/data/arm.ts`** | data | GEN | the 20 worlds (id, name, x, y, layer, lane), `END_SLOTS = [19]`, `FIRST_SLOT = 0`, `RING_LY` (moved from log-text if it lives there), `validateArm()` at load, `ARM_CONTENT_VERSION` |
| **`src/data/flight-templates.ts`** | data | GEN | the five flight blocks (planet, ring, start, warps, Δv, shrink) moved out of ships.ts, keyed by `TemplateId`; `TEMPLATE_RULES` (from-layer, inherent problem label, modifiers allowed) |
| **`src/data/classic-five.ts`** | data | frozen (lead only) | today's five `ShipDef`s verbatim, plus `CLASSIC_HOPS` (link 120/112/104/98, hits 3/4/5/6, LY 22/27/31/36), `CLASSIC_FACTS` (today's `ShipDef.threat`), `CLASSIC_LICENCES`. **Test and dev fixture**: no game run ever routes through it except via `__ap.ship(n)` |
| **`src/data/run1-arm.ts`** | data | GEN | §3.14's table (slot, name, kind, approach, late, pods) and the authored overrides: HALCYON's sensor 62; Tessaly GENTLE; Brine HARSH all-WIDE with no no-go; Cinder ROUGH with two lava arcs; ARES-VII's written layer-1 row and fresh unit; LAST LIGHT's New Haven row; VESPER's ENGINE FAULT and no resident. Also the reservations (GANNET corrupted `reported faulty` + WARDEN, PROVIDENCE corrupted hidden, CURLEW sleeper) |
| **`src/data/ship-names.ts`** | data | GEN | 05 §3.11's pools (21 generated, final names, ARES numerals, colony pool, 046 trail), `validateNames()` (the whole-word clash rule). **Replaces `Sol` in souls.ts `FIRST_NAME_POOL`** |
| **`src/data/map-text.ts`** | text | DESK | every desk, chart, card, PACKET-room, tally, title and boot-ECC word, `PLACEHOLDER(05)`-bannered |
| **`src/systems/map-geometry.ts`** | pure | F2 → GEN | `distLy(a, b)`, `solLy(s)`, `layerOf(s)`, `ringsCrossed(solLy)` |
| **`src/systems/map-hop.ts`** | pure | F2 → GEN | `hopBetween(map, from, to): Hop`, `hitsLanding(hop, extra)`, `reachable(map, from, to)`, `reachableFrom(map, from)`, `roomFit(unit, hop): RoomFit` |
| **`src/systems/map-noise.ts`** | pure | GEN | `rollNoiseClouds(rng): NoiseCloud[]`, `hopNoise(clouds, a, b): LinkNoise`, `seedRange(noise, depth)` |
| **`src/systems/map-generator.ts`** | pure | GEN | `bases(start)`, `rollTiming`, `arkYear`, `finalYear(arm, floor?)`, `memoryClassOf`, `armChecks(arm): ArmProblem[]`, `freshArm(armSeed, run, start)`, `assembleRun1Arm(armSeed)`, `rollShipDetails(key, slot, kind, layer)` |
| **`src/systems/landing-roller.ts`** | pure | GEN | `rollLanding(key, slot, layer, pods, authored?): ShipLandingDef & { site: 'good' \| 'poor' }` (01 §3.15) |
| **`src/systems/pod-layout.ts`** | pure | GEN | `layoutPods(pods, cls, hasSlot, isFinal): { podRacks; lead }` (01 §3.16 rule) |
| **`src/systems/map-route.ts`** | pure | GEN | `routes(map)`, `bestRoute(map, byLength?)`, `shipsLeft(map, slot): [min, max]`, `depthOf(route)` |
| **`src/systems/map-facts.ts`** | pure | GEN | `mapFacts(map, fromSlot, toSlot, depth): ShipThreatFacts` (replaces `fixedShipFacts`), `oneHopFromFinal(map, slot)` (M3), `nominalRouteThreat(map, slots)` |
| **`src/systems/map-run.ts`** | pure | GEN | `createRunMap(lineage, seed): RunMapState`, `currentSlot(run)`, `currentShip(state)`, `shipDefAt(map, slot)` (memoized `shipDefOf(armShip)`), `shipRng(run, ship, stream)`, `hopRng(run, from, to, stream)` |
| **`src/systems/desk.ts`** | pure + actions | DESK | `chartModel`, `cardModel`, `deskSteps`, `deskOpeningBeat`, `tallyModel` lives in run-end.ts; actions `openDesk` (called by run.ts), `selectShip`, `setCourse`, `backToChart` |
| **`src/components/desk/{DeskScreen,StarChart,ShipCard,chart-draw}.ts`** | view | DESK | the amber DESK, the SVG chart (shared by the title card and the tally's mini chart), the docked card / phone sheet |
| **`src/styles/desk.css`** | css | DESK | with a 3a token block in tokens.css and modes.css |
| `src/data/ships.ts` | data | F1 → GEN | becomes the `ShipDef` type, `validateShipDef`, `shipDefOf(armShip)` (template ⊕ arm ship); `SHIPS`, `getShip`, `isLastShip`, `validateFleet` are deleted (classic-five has its own) |
| `src/data/memory.ts` | data | F1 → GEN | `MEMORY_LAYOUTS`, rack helpers taking a layout |
| `src/systems/run.ts` | stateful | F2 → GEN | the desk phase, `goTransmit(store, toSlot)`, hop rolls, the route, the galaxy year |
| `src/systems/threat-plan.ts` | pure | GEN | `fixedShipFacts` → `classicFacts` (classic-five); `nominalRunThreat(i)` becomes `nominalRouteThreat(CLASSIC_MAP, [0..i])` |
| `src/systems/carry.ts` | pure | GEN | room per destination class, the floor per class, the unit start per layout |
| `src/systems/licences.ts` | stateful | GEN | the interim schedule by act on the arm (§2.8); `CLASSIC_LICENCES` on the classic world |
| `src/state/log-selectors.ts` | pure | GEN | `logEntriesAtBoot(solLy, isFinal)` → rings |
| `src/systems/meta.ts` | live/pure | GEN | `ghostShipIndex` → `ghostDue` by layer (§2.9); archive v1 unchanged |
| `src/systems/transmit.ts` | pure | DESK | room bar, ECC line, years, `◀ CHART`, 0-charge confirm |
| `src/systems/run-end.ts`, `run-score.ts` | pure | DESK | the RUN TALLY model (visited ships only) |
| `src/data/script.ts` | data | DESK | desk guidance; `bootLinePlan` gains `'receiver'` and `'sleep'` and calls GEN's `mapBootLines(state)` (one F2 edit) |
| `src/debug.ts` | dev | GEN | the map helpers; DESK and TESTS request additions |

### 2.2 Type sketches (`src/types/map.ts`)

```ts
export type ShipKind = 'first' | 'light' | 'standard' | 'ark' | 'final';
export type TemplateId = 'impact-a' | 'wide' | 'wide-b' | 'capture' | 'impact-b';
export type ModifierId = 'impact-course' | 'too-wide' | 'sensor-damage' | 'debris' | 'engine-fault' | 'radiation-belt';
export type MemoryClass = 'FULL' | 'COMPACT' | 'TIGHT';
export type RackName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface MemoryLayout {            // MEMORY_LAYOUTS[cls], data/memory.ts
  cls: MemoryClass; racks: readonly RackName[]; totalBlocks: number;   // 384 / 320 / 256
  podRacks: readonly ('B' | 'C' | 'D')[]; unitStart: number;           // rack E's address: 256 / 192 / 192
  receiverBlocks: number; roomForUnit: number; chargeFloor: number;    // 128/128/64; 152/152/88; 12/12/0
  maxPods: number;                                                      // 16 / 8 / 8
}

// The ship's rng key (02 §3.4): every roll OF the ship (template, modifiers, landing, families, hurt drivers, zones,
// omega0) uses it, so a ship rolls the same whatever route led to it, and the same next run (3c).
export interface ShipKey { armSeed: number; reportedRun: number; slot: number; attempt: number }

export interface Reservations {            // rolled in 3a, shown from their slices
  resident: { kind: 'corrupted' | 'left' | 'sleeping'; shown: 'faulty' | 'unknown'; name: string } | null;
  unknownEvent: 'old-colony' | 'gone-resident' | 'signal' | null;   // a `?` ship
  fragments: number;
  site: 'good' | 'poor';
  tracePlace: null;                         // slice 7
}

// The generator's output and what run.map stores: flat and JSON-safe (3c's save).
export interface ArmShip {
  slot: number; id: string; name: string; kind: ShipKind; template: TemplateId; pods: number;
  memoryClass: MemoryClass; approachYear: number; late: boolean;
  timedAgainstStart: number; reportedRun: number; runsOnChart: number; attempt: number;   // 3c's update reads these
  modifiers: ModifierId[]; omega0: number;
  landing: ShipLandingDef; podRacks: Partial<Record<'B' | 'C' | 'D', string>>; lead: number;
  authored: 'ares-vii' | 'halcyon' | 'kestrel' | 'vesper' | 'last-light' | null;
  reserved: Reservations;
}

export interface NoiseCloud { x: number; y: number; r: number; strength: 1 | 2 }

export interface Hop {
  from: number; to: number; distanceLy: number;
  linkBlocks: number; transitHits: number; eccFixes: number;
  leaveYear: number; arriveYear: number; approachYear: number; slackYears: number;   // slack ≥ 0 when reachable
  noise: LinkNoise; memoryClass: MemoryClass; room: number; chargeFloor: number;
}

export interface RouteStop { slot: number; depth: number; hop: Hop | null }   // hop null on ship 1

export interface RunMapState {
  world: 'arm' | 'classic';    // 'classic': the frozen five (tests, __ap.ship); every function below switches once
  run: number;                 // run number: 1 is run 1's arm
  armSeed: number;             // 3a: the run seed (interim); 3c: the archive's
  startYear: number;
  arm: ArmShip[];              // index = slot; [] on the classic world
  noise: NoiseCloud[];
  route: RouteStop[];          // last = the current ship; route.length === run.shipIndex + 1
  galaxyYear: number;          // A(current ship)
  pendingExtra: { extraHits: number; coreHit: number; coreReset: boolean } | null;  // a lost ship's toll, for the hop picked at the desk
}

export interface RoomFit {     // the card's fit line and the PACKET's room bar (01 §3.16)
  files: number; room: number; floor: number; chargeArrives: number; chargeLost: number; over: number;
  word: 'fits' | 'squeezed' | 'leave' | 'no-charge';
}
```

**`ShipDef` stays the runtime input type.** `createShipSlices`, `buildShipMemory`, `layoutCarried`, `validateShipDef` and the landing slice all read it. It is never hand-written outside classic-five.ts and never stored. It is built by the pure, memoized `shipDefOf(armShip)`: the template's flight block, `omega0` replaced, modifiers turned into zones and arrival damage, plus the landing, class and layout.

Changes to `ShipDef`:
- `arrival: { linkBlocks, transitHits, distanceLy, damage }` splits: the first three move to `Hop`, and `damage` becomes `arrivalDamage`.
- `threat: ShipThreatDef` moves to `mapFacts` (classic: `CLASSIC_FACTS`).
- `licences` moves to licences.ts (classic: `CLASSIC_LICENCES`).
- `flagship` becomes `final`.
- New fields: `slot`, `kind`, `template`, `modifiers`, `memoryClass`, `pods`, `approachYear: number | null`.
- `memory.podRacks` becomes `Partial<…>` (the slice-1a seam).
- `memory.aiFiles !== null` iff `kind === 'first'`.

`TransitPlan` gains `toSlot` and `hop: Hop`; `linkBlocks` reads `hop.linkBlocks`; `toShipIndex` stays (= depth − 1).

`RunState` gains `map: RunMapState`. `shipIndex` keeps its meaning of "position on the route", which equals depth − 1 (tutorial checks, `shipIndex === 0`). **Every read that means "which ship" goes through `currentShip(state)` / `shipDefAt`.** On the classic world slot = index, so classic suites are bit-identical.

`RunPhase` gains `'desk'`. `InputLayer` gains `'desk'`. `ui` gains `deskSelected: number | null`.

### 2.3 The five hand-written ships, the templates, and a recognisable run 1

**Templates.** The five flight blocks move unchanged into `flight-templates.ts`: IMPACT-A (ARES-VII), WIDE (HALCYON), WIDE-B (KESTREL), CAPTURE (VESPER), IMPACT-B (LAST LIGHT). A generated ship takes one with `omega0` re-rolled.

**Interpretation, flagged (risk 12):** IMPACT COURSE and FLYBY, TOO WIDE are the template's own arrival and always on as a KNOWN PROBLEM label. The "extra" modifiers (02 §3.5's count by layer) are SENSOR DAMAGE (Sensor Interp ≤ 45 on arrival), DEBRIS (a zone naming a seeded rack the ship has, on WIDE-B), ENGINE FAULT (Thrust Ctrl 31% in rack A, on CAPTURE) and RADIATION BELT (racks A–B, on IMPACT-B).

**Run 1.** The run-1 arm is **§3.14's table as authored structure**: who is where, when, how big, which class, and the reservations. The rest (generated ships' templates, extra modifiers, landing rolls, families, `omega0`) is rolled from `ShipKey(armSeed, 1, slot, 0)`. This is a deliberate reading of 02 §3.12 ("a fresh roll … with the authored ships placed"); risk 2 gives the argument.

The authored ships keep their written details and take run 1's sizes:
- ARES-VII: 3 pods, COMPACT `B: P P P _40`, `C: _64`.
- HALCYON: 5 pods, COMPACT.
- KESTREL: 6 pods, COMPACT, no slot; LZs 3·3 WIDE, HARSH; debris names rack B on the written run (its pods are all in B).
- VESPER: 16-pod ark, FULL, slot; Cinder ROUGH with two lava arcs, 3 LZs 6·5·5.
- LAST LIGHT: 16 pods, FULL, as today.

**The classic five are a frozen fixture, not run 1.** VESPER → LAST LIGHT is 83 LY on the arm, so today's five-ship route cannot exist there. That is why the suites need a fixture world (§6).

**Cross-check of §3.14** (all recomputed with `arm_sim.py`):
- run 1 passes checks 1–5 with 907 routes, and the best route by length is 66 / 69 / 68 / 64 pods (5–8 ships);
- the worked route's LY, links, hits, ECC and slack match the table;
- ARES-VII sees 6 reachable ships;
- ALBATROSS is TOO LATE from every layer-2 ship (by 35, 18 and 11 years);
- GOOD HOPE is TOO LATE from CORMORANT by 15.

Two findings:
- **Rounding.** LAST LIGHT's 3020 needs WAYFARER at 2927 + 42.5 → **2970: round half up**. Python's `round` gives 2969, and the final year would be 3015. Rule: integer arithmetic with half-up `Math.round` everywhere, for example link = `Math.round((1460 − 11·d) / 10)`. That gives 119 at 25 LY and 97 at 45 LY, where the sim's half-even gives 118 and 96; the range stays 82–123.
- **ALBATROSS's margin.** ALBATROSS at 2365 is 11 years before its earliest neighbour (OSPREY 2352 + 24 = 2376). The ark rule (12 + 0–4) gives 2360–2364. Check 3 still passes. Recommendation: keep 2365 as authored data (`14 YRS EARLY` in 02 §2) and make the margin a generator rule, not a validity check. Raise with Fran.

### 2.4 Pure versus stateful

**Pure (no store):** everything in `map-*.ts`, `landing-roller.ts`, `pod-layout.ts`, `shipDefOf`, `roomFit`, `planThreat` with `mapFacts`, the desk, card, chart and tally models, `logEntriesAtBoot`, and every text function. A test can roll 200 arms, enumerate routes, plan the ladder along any route and compute every card row with no store.

**Stateful:**
- `run.ts`: `openDesk`, `goTransmit`, `transmitNext`, `startShip`, `startRun`;
- `desk.ts`'s actions;
- `licences.ts`'s mount;
- `boot.ts`;
- the components.

### 2.5 The run's flow

```
title → boot → flight → landing → report ─CONTINUE→ endShip → [final? endRun : openDesk]
                           └ lost card → continueAfterLoss → endShip → [end | openDesk with pendingExtra]
desk ─SET COURSE(slot)→ goTransmit(store, toSlot) → transmit (PACKET) ─◀ CHART→ desk
                                                    └ TRANSMIT ▸ → transmitNext → startShip(toSlot) → boot
```

**`goTransmit(store, toSlot)`:**
- throws on an unreachable slot;
- builds `hop = hopBetween(map, current, toSlot)` and the verdict `planThreat(threatInputFor(run.threat, mapFacts(map, from, to, depth + 1), dealDone))`;
- packs against `hop.linkBlocks`, applies `pendingExtra`, and deals the draft from `childRng(seed, fromSlot, 'draft')`.

**`transmitNext`** rolls:
- transit hits from `hopRng(run, from, to, 'transit')`, which is `childRng(run.seed, toSlot, 'transit:' + fromSlot)` (02 §3.4; the classic world keeps `(seed, index, 'transit')`);
- `hitsLanding = max(0, hop.transitHits + extraHits − hop.eccFixes)`;
- beam seeds from `'beam-seeds:' + from`.

It then lays out against the destination's `MemoryLayout`, pushes the `RouteStop`, sets `galaxyYear = hop.approachYear`, and calls `startShip`.

**`backToChart`** clears `transit` (drops and pick are forgotten) and keeps `pendingExtra`.

No reachable ship from a non-final ship throws (checks 1 and 4 guarantee one).

### 2.6 `fixedShipFacts` replaced by map facts

`mapFacts(map, from, to, depth)` returns:
- `depth`: route length + 1;
- `isFinal`: `END_SLOTS.includes(to)`;
- `oneHopFromFinal`: `END_SLOTS.some((e) => reachable(map, to, e))` (M3; the final year is set so range implies time);
- `beamSeeds`: `depth === SEEDS_MIN_DEPTH ? { kind: 'scripted', firstRun: [{ role: 'telemetry' }], later: hop.noise } : { kind: 'noise', noise: hop.noise }`.

`rollBeamSeeds` already plays the scripted pick only on the tutorial run, so the RM lesson is guaranteed on run 1 whatever the noise. `beamSourceOf` already blocks seeds into calm ships.

The classic world returns `CLASSIC_FACTS[index]`. `nominalRunThreat(i)` survives as `nominalRouteThreat(CLASSIC_MAP, [0..i])` for the fixtures. `__ap.route` uses the same function on the arm.

### 2.7 Variable memory: the refactor path

**F1 (no visible change).**
- `MEMORY_LAYOUTS = { FULL }` only.
- `ShipDef.memoryClass: 'FULL'`, and `state.level.memoryClass`, set from the ship in `createFlight`.
- A selector `layoutOf(state)`, plus `layoutForTotal(total)` (fail-loud: 384/320/256 map one-to-one onto the classes) for pure helpers that only hold segments.
- Replace:
  - `MEMORY_TOTAL_BLOCKS` (assertMemoryInvariants in landing, licences, autoburn, finale×2, hollow, hollow-verbs, zones, actions, memory, debug, ships);
  - `RACK_NAMES` (MiniStrip, MemoryStats, zones `rackKnown`/`rackStart`, move-preview `rackEEnd`, carry `RACK_F_START`, memory `racksLabel`);
  - `RACK_COUNT` (hollow-hud `miniStripRows`);
  - `rackOf(addr)` → `rackOf(addr, layout)` (MemoryStrip, script.ts, zones, move-preview);
  - `UNIT_RACKS_START` → `layout.unitStart` (autoburn, hollow, move-preview, carry, memory, ships).
- `layoutCarried` reads the destination ship's layout; `buildShipMemory` asserts against the ship's total.
- The constants are deleted at the end of F1, so the compiler finds every site. The suites stay unchanged and green.

**GEN, step 2.**
- COMPACT and TIGHT layouts.
- `validatePodRacks` per class: at most `maxPods`; rack D only on FULL; a slot when `layer ≥ 4 || final`.
- `layoutPods`:
  - B takes `min(7, pods − (slot ? 2 : 0))`;
  - C takes `k` extra pods + `P _2 S _1 P`, with k as large as keeps C's trailing free ≥ `maxRootFor`;
  - the rest goes to D;
  - then the 40-free and 24-tail checks;
  - lead = the GAP-1 neighbour, else the last pod.

  This reproduces LAST LIGHT's `P×7 _8 / P P P P _2 S _1 P _21 / P P P P _32` and 01 §3.16's TIGHT rows.
- `arrivalCharge(…, floor)` with `floor = layout.chargeFloor` (TIGHT 0).
- The boot's fill order: files, floor, seeds, rest.
- Debris may only name a rack the ship has (zones validation).
- The licence and skill install spot is the receiver's free run next to REPAIR CHARGE, not "rack F" (TIGHT has no F).

### 2.8 Interim licences (not in any spec; flagged, risk 3)

3a has no repository, and today's licences are keyed by ShipDef (KESTREL: DELETE and MOVE; VESPER: COPY and SWAP). On the arm, licences.ts issues them by act:
- DELETE at the start of the first ship with depth ≥ 3;
- MOVE at its coast, or at a Debris ship's coast, whichever comes first;
- COPY at the boot of HOLLOW's first ship;
- SWAP at the first uncommanded burst on any ENGINE FAULT ship;
- REPAIR's first-look rule unchanged;
- "a licence never issued is issued at the next ship's start" kept.

3b deletes this schedule.

### 2.9 The ghost by layer (interim)

`ghostDue(run)` finds `lastUnit.shipName` on the current arm. In 3a every run 1 is the same arm structure, and a fresh-rolled later run shares slots. If found, the ghost speaks at the first boot whose ship's layer is ≥ that ship's layer (never ship 1). If not found, it speaks at the final ship. 3c replaces the lookup with archive v2's trail and grey cross.

### 2.10 Seams for later slices (name them in code comments)

- **3b:**
  - `Hop.slackYears` and `solLy` for the delivery rule;
  - `packUnit(..., added)` for delivered files;
  - `TransitPlan.deliveries` reserved;
  - `BootLineKind` `'delivery'`;
  - the desk's window slots `R` and `I` (`DeskWindowId = 'chart' | 'card' | 'repository' | 'training' | 'inbox'`);
  - `deskSteps(state)` (3b inserts "the recommended file");
  - `licences.ts`'s interim block marked `TODO(3b)`;
  - `roomFit` already takes the file list, so a delivery's room shows with no new type.
- **3c:**
  - `RunMapState` is JSON-safe;
  - `ArmShip.reportedRun / runsOnChart / timedAgainstStart / attempt` are filled now;
  - the generator exports `bases`, `rollNewShip`, `arkYear`, `finalYear(arm, floor)`, `armChecks` and `bestRoutePods` for `map-update.ts` (3c) steps 2–6;
  - `createRunMap(lineage, seed)` is the one place 3c swaps "run ≥ 2 = fresh roll" for "the archive's updated arm";
  - `armSeed` moves from the run seed to the archive;
  - `ARM_CONTENT_VERSION` plus a generator version for the save's content check;
  - `ShipResult` already per-ship.
- **Slice 4:** the TRAINING slot `T`; `deskSteps` prepends the required pick; the AHEAD row reads `roomFit(unit, hopBetween(...))`; the save reserves `run.skills`.
- **Slice 5:** `ArmShip.reserved.resident` / `unknownEvent` / `fragments`; `cardModel` rows behind `CARD_ROWS_LIVE` (RESIDENT off in 3a); `BootLineKind 'receiver-closed'` reserved; rack A keeps 18 free.
- **Slice 7:** `reserved.tracePlace`; the final card's last-ending row; the tally as its own screen after the final report, so slice 7 inserts FINALE and THE LAST LANDING before it.

### 2.11 Architecture debt

**Fix in 3a:**
1. Runtime `getShip(shipIndex)` / `SHIPS` reads (run.ts ×18, initial.ts, transmit.ts, carry.ts `freshUnitRacks`, licences.ts, meta.ts, finale.ts, run-end.ts, director.ts, BurnResult.ts, BeamOutAsk.ts, skills.ts, script.ts ×3, debug.ts) → `currentShip(state)`, `state.landing.finalShip`, `run.threat.current.isFinal`, `shipDefAt(map, slot)`.
2. The 384 / rack constants (§2.7).
3. ShipDef mixing ship, hop and map facts (§2.2).
4. `flagship` + `validateFleet` + `isLastShip` → the final role.
5. Ranks scaled by fleet colonists. On the arm they are absolute (`rankBasis(map)` = `RANK_FLEET_COLONISTS`, so thresholds 3,000 / 6,800 / 10,700); the classic world keeps its scaling, so its suites stay.
6. `childRng(seed, shipIndex, …)` keyed by index → `shipRng` / `hopRng` (§2.5, risk 9).
7. RUN END's `NOT REACHED` rows, `fleetColonists()`, `fleetHome(…, SHIPS.length)` → visited ships.
8. `logEntriesAtBoot(shipIndex)` → rings.
9. `freshUnitRacks(ship)` looking up the SHIPS index → takes a verdict argument (default: the classic nominal).

**Leave alone:**
- the parked refactors (script.ts text and rules, game.css by surface, tuning.ts grouping: only add blocks);
- predict, orbit-sim and hollow internals;
- the salvage draft's mechanics (it stays the PACKET's top section; the SALVAGE wording comes with 3b);
- archive v1's format and `META_VERSION` (3c);
- FinaleChoice's order (slice 7);
- the TransmitScreen layout beyond the new rows.

---

## 3. The player's walk (run 1)

1. **Title.** `ARRIVAL PROTOCOL // OUTWARD BOUND`, `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`. The chart sits faint behind the logo: SOL at the lower left, the band of stars, and the amber beacon `FINAL SHIP · LAST LIGHT · 3020`. RECEIVE TRANSMISSION draws SOL → ARES-VII (reduced motion: no draw). The ship-1 tutorial plays as today, on a COMPACT ship: five rack rows, `MEMORY 320 · COMPACT`.
2. **First DESK** (after the LANDING REPORT's CONTINUE; both clocks stopped).
   - Opening beat: 046's trail sits faint on Kepler-186f, Marrow and Ostrava (`UNIT-046 GETS THERE FIRST`), with a grey cross past Calder.
   - Six lines fan out from ARES-VII: three short, three long (solid when CLEAN, hatched across noise).
   - The strip reads `PICK YOUR NEXT SHIP — click a ship or ← →`, and CONTROL says `Lovely work, Unit 47! :) Pick your next ship.`
   - Clicking HALCYON shows the card:
     - `HALCYON · Tessaly · 1,000 COLONISTS · 5 PODS`
     - `APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY`
     - KNOWN PROBLEMS `FLYBY, TOO WIDE`
     - `MEMORY 320 · COMPACT · ROOM FOR YOU 152 · YOU FIT`
     - `GRASSLAND · off-site pods score half`
     - `LZ: 2 · SET BY ARRIVAL CONTROL`
     - `21 LY · LINK 123 · 3 HITS (ECC fixes 1) · NOISE CLEAN · SEEDS: none`
     - `SHIP 2 OF YOUR RUN · 4–6 MORE TO THE FINAL SHIP`
     - the TIMELINE `2300 you leave · 2321 you get there · 2352 ▲ approach`.
   - ALBATROSS, the bigger ARK node at the end of a long line, reads `51 LY · LINK 90 · 7 HITS · 14 YRS EARLY` and, in red, `ONLY FROM HERE`.
   - The strip moves on to `SET COURSE ▸ HALCYON [ENTER]`.
3. **PACKET.** Phase 2's TRANSMIT with SALVAGE on top.
   - Headline `NEXT: HALCYON · 1,000 COLONISTS · 21 LY · 31 YRS EARLY`.
   - The link bar sits beside the new room bar (`ROOM 152 · FILES 65 + FLOOR 12`).
   - `ON THE WAY: 3 TRANSIT HITS · ECC FIXES 1 WHILE YOU SLEEP (31 YRS) → 2 LAND`.
   - `◀ CHART [ESC]`.
   - TRANSMIT ▸ shows the `OUTWARD BOUND` stamp, the white-out, and the header year ticks to 2352.
4. **HALCYON's boot.** `> ASLEEP IN HALCYON'S RECEIVER · 2321 → 2352 · 31 YEARS` (rolled, risk 13), the ECC block, `> 046.log · KEY FOUND: 20 LY OUT · ENTRY 02`.
5. **At KESTREL's desk** (2467): `2 SHIPS NOW OUT OF YOUR REACH`, with PETREL and ALBATROSS greying. VESPER's card reads `ARK · ENGINE FAULT · MEMORY 384 · FULL · 55 LY · LINK 86 · 8 HITS (ECC fixes 4) · NOISE LOW · 1 · SEEDS 0–2`. LAPWING's reads `MEMORY 256 · TIGHT · ROOM FOR YOU 88 · CHARGE SQUEEZED: 9 ARRIVES`.
6. **At VESPER's desk:** CORMORANT's card says `HOLLOW WILL FIND YOU ON THIS BEAM` (M3: New Haven is in range). The PACKET carries the uninvited chip as built. CORMORANT plays ARRIVAL + WALLS.
7. **LAST LIGHT:** the FINALE as built. Its LANDING REPORT leads to the **RUN TALLY**: six rows, the route on a mini chart, `5 COLONIES FOUNDED`, score, an absolute rank, near misses, NEW RUN.

**Phone (≤ 768 px):** the arm runs bottom to top, a tap opens the card as a bottom sheet, and SET COURSE is pinned at the bottom.

---

## 4. Data

### 4.1 The arm (02 §3.2; verified)

| Layer | Inner | Centre | Outer |
|---|---|---|---|
| 1 | | w0 Kepler-186f (8, 0) | |
| 2 | w1 Marrow (33, −10) | w2 Tessaly (29, 4) | w3 Dunmore (30, 16) |
| 3 | w4 Ostrava (54, 1) | w5 Brine (54, 10) | w6 Pell (53, 24) |
| 4 | w7 Larkspur (81, 13) | w8 Calder (75, 21) | w9 Quill (73, 35) |
| 5 | w10 Ashgrove (100, 29) | w11 Cinder (98, 43) | w12 Tamsin (91, 52) |
| 6 | w13 Greywater (121, 51) | w14 Kettle (114, 62) | w15 Avalon (107, 72) |
| 7 | w16 Farhold (136, 78) | w17 Sable (128, 90) | w18 Endmark (121, 96) |
| 8 | | w19 New Haven (138, 116), end slot | |

Measured from the table:
- one-layer pairs: at most 45 LY;
- two-layer pairs: 45–70 LY, 31 of 42 in range;
- three-layer pairs: at least 70 LY;
- ring clearance ≥ 9.0 LY;
- links 82–123 under half-up.

### 4.2 Generator tables (tuning.ts `// --- Phase 3 slice 3a GEN`, each with 02's WHY)

| Constant | Value |
|---|---|
| `RUN_START_YEAR` | 2300 |
| `BEAM_RANGE_LY` | 58 |
| `LINK_BASE_TENTHS` / `LINK_PER_LY_TENTHS` | 1460 / 11, i.e. `round((1460 − 11·d)/10)` |
| `TRANSIT_LY_PER_HIT` | 7 |
| `ECC_YEARS_PER_HIT` | 25 |
| `LAYER_AXIS_GAP_LY` | 22, then 25 |
| `LAYER_SLACK` | `[30, 90, 120, 75, 80, 85, 90]` (hop out of layer k) |
| `LATE_OFFSET` | 0.5 (0.3 in layer 2); late 50/50 |
| `TIMING_JITTER` | ±4 |
| `ARK_MARGIN_YEARS` | 12 + 0–4 |
| `ARK_PATTERNS` | `[[3, 5, 7], [4, 6]]` |
| `FINAL_MARGIN_YEARS` | 20, rounded up to a multiple of 5 |
| Pods | light 3 + ⌊layer/3⌋, standard 3 + layer, ark `min(16, round(2.2·(4 + layer)))`, first 3, final 16 |
| `LIGHT_SHARE` | 0.4 (Bernoulli per slot, as the sim's fresh roll does) |
| `MAX_LATE_TIGHT_PER_LAYER` | 2, from layer 5 |
| `GEN_MAX_ATTEMPTS` | 50 |
| `NOISE_CLOUDS` | strengths `[1, 1, 1, 2]`; radius 12–18; centre 45–167 LY from SOL along the arm's bend, lateral ±16 LY; no two centres closer than 20 LY (risk 14) |

**Memory class:** light → TIGHT; ark, final or pods ≥ 9 → FULL; otherwise COMPACT (first ship COMPACT).

**Templates by layer:**

| Template | From layer | Inherent label | Extra modifiers allowed |
|---|---|---|---|
| IMPACT-A | 1 | `IMPACT COURSE` | `SENSOR DAMAGE` |
| WIDE | 2 | `FLYBY, TOO WIDE` | `SENSOR DAMAGE` |
| WIDE-B | 3 | `FLYBY, TOO WIDE` | `SENSOR DAMAGE`, `DEBRIS · RACK ?` |
| CAPTURE | 4 | (none) | `SENSOR DAMAGE`, `ENGINE FAULT` (4+) |
| IMPACT-B | 5 | `IMPACT COURSE` | `SENSOR DAMAGE` (3+), `RADIATION BELT` (5+) |

**Extra modifier counts:** 0 in layer 2, up to 1 in layers 3–5, up to 2 in layers 6–7. A corrupted-resident slot is CAPTURE with no extras.

**Reservation streams:** `res-corrupted`, `res-left`, `res-sleeper`, `unknown-events`, `fragments`, `site` (02 §3.5's quotas and rules).

### 4.3 Run 1's ships and classes (from §3.14 and the class rule)

| Layer | Ships (approach, pods, class) |
|---|---|
| 1 | ARES-VII 2300, 3, COMPACT |
| 2 | PETREL 2361 L, 3, TIGHT · HALCYON 2352, 5, COMPACT · OSPREY 2352, 5, COMPACT |
| 3 | HERON 2512 L, 4, TIGHT · KESTREL 2467, 6, COMPACT · ALBATROSS 2365 ark, 15, FULL |
| 4 | CURLEW 2612, 7, COMPACT (sleeper) · LAPWING 2672 L, 4, TIGHT · GANNET 2612, 7, COMPACT (corrupted, faulty, CAPTURE) |
| 5 | PLOVER 2712, 8, COMPACT · VESPER 2625 ark, 16, FULL · SKYLARK 2750 L, 4, TIGHT |
| 6 | SHEARWATER 2857 L, 5, TIGHT · KITTIWAKE 2817, 9, FULL · CORMORANT 2817, 9, FULL |
| 7 | PROVIDENCE 2927, 10, FULL (corrupted, hidden, CAPTURE) · GOOD HOPE 2830 ark, 16, FULL · WAYFARER 2970 L, 5, TIGHT |
| 8 | LAST LIGHT 3020, 16, FULL |

That gives FULL 7, COMPACT 7, TIGHT 6 (35 / 35 / 30%), matching 02 §3.4.

**The worked route** (the fixture for TESTS):

| Ship | Approach | LY | Arrive | Slack | Link | Hits − ECC |
|---|---|---|---|---|---|---|
| ARES-VII | 2300 | | | | | |
| HALCYON | 2352 | 21 | 2321 | 31 | 123 | 3 − 1 |
| KESTREL | 2467 | 26 | 2378 | 89 | 117 | 4 − 3 |
| VESPER | 2625 | 55 | 2522 | 103 | 86 | 8 − 4 |
| CORMORANT | 2817 | 30 | 2655 | 162 | 113 | 4 − 6 → 0 |
| LAST LIGHT | 3020 | 54 | 2871 | 149 | 87 | 8 − 5 |

Distances from SOL: 8, 29, 55, 107, 129, 180. Rings read 02 at HALCYON, 03 at KESTREL, 04–06 at VESPER, 07–08 at CORMORANT, and 09–11 at LAST LIGHT.

### 4.4 Noise and seeds

`BEAM_SEED_ODDS` (already in tuning.ts):

| Noise | 0 seeds | 1 | 2 | 3 | Mean |
|---|---|---|---|---|---|
| CLEAN | 100% | | | | 0 |
| LOW | 60% | 35% | 5% | | 0.45 |
| NOISY | 25% | 45% | 25% | 5% | 1.1 |
| SEVERE | 5% | 30% | 40% | 25% | 1.85 |

- Card ranges: `SEEDS 0` / `0–2` / `0–3` / `0–3`, and `SEEDS: none` before depth 3.
- Hop noise is the sum of the strengths of the clouds whose centre lies closer than r to the segment, capped at 3.
- Clouds are rolled at RUN START from `childRng(run.seed, 0, 'noise')`.
- The delivery column is 3b's.

### 4.5 Expected statistics (`results.txt`, fresh roll; TESTS checks bands, not points)

| Statistic | Expected |
|---|---|
| Valid first try | 84.7% (at most 5 attempts) |
| Best route, pods | p1 63, p10 66, median 67, p90 69 |
| Best route length | 5: 1%, 6: 40%, 7: 60% |
| Classes | FULL 34%, COMPACT 37%, TIGHT 30% |
| Late TIGHT ships per arm | 2.72, on the best route ~1% |
| Routes per arm | median ~1,072 (667–1,347) |
| Span, first to final ship | median 721 years (686–732) |
| Every ship on some route | 100% |

Not simulated, so measured for the first time in 3a:
- noise per hop and per route;
- the share of routes with TRACE ≥ 3 by depth 4/5 when every seed is left;
- final-hop links.

---

## 5. Work breakdown

### 5.0 FOUNDATION (one agent, two commits; typecheck green; the suites pass unchanged after F1)

**F1: the refactor with no visible change.**
1. Move the five ShipDefs to `src/data/classic-five.ts` as `CLASSIC_FIVE`, with `CLASSIC_HOPS`, `CLASSIC_FACTS` and `CLASSIC_LICENCES`. Move their flight blocks to `flight-templates.ts`. Reshape `ShipDef` (§2.2).
2. `RunState.map` with `world: 'classic'` everywhere. `currentShip` / `shipDefAt` / `shipRng` / `hopRng` (the classic world keeps today's keys). Replace every runtime `getShip`/`SHIPS`/`isLastShip` read (§2.11 item 1).
3. Memory refactor step 1 (§2.7), with `FULL` only.
4. `createInitialState({ shipIndex })` still means "classic ship n". Harness signatures unchanged.

**F2: the map's skeleton.**
1. `types/map.ts`, `data/arm.ts` (with `validateArm`), `data/ship-names.ts` (with `validateNames`; replace `Sol`), and `data/run1-arm.ts` as §4.3's table.
2. **Real** `map-geometry.ts` and `map-hop.ts` (the formulas are ten lines and both tracks need true numbers), with `roomFit`.
3. Stubs with final signatures that throw `TODO(3a-GEN)` or return run-1 data:
   - `map-generator` (`assembleRun1Arm` returns the table with placeholder details), `map-noise` (no clouds), `landing-roller`, `pod-layout`;
   - `map-route`, `map-facts`, `createRunMap`;
   - `desk.ts` models (`chartModel`, `cardModel` returning typed empty rows).
4. `RunPhase 'desk'`, the input layer, `openDesk` / `setCourse` / `backToChart`. `goTransmit(store, toSlot)`; on the classic world the desk offers the single next ship, so the page still plays the five end to end.
5. `bootLinePlan` kinds `'receiver'` and `'sleep'` via GEN's `mapBootLines` stub.
6. tuning.ts blocks `3a GEN` and `3a DESK` (constants with WHY).
7. `map-text.ts` with every 3a string, `PLACEHOLDER(05)`.
8. `__ap` signatures: `slot`, `route`, `runNumber`, `arm`, `hop`, `course`.
9. An empty `src/styles/desk.css` imported.

### 5.1 Track GEN (pure map, memory classes in the sim, the flow)

Owns: `map-*.ts`, `landing-roller.ts`, `pod-layout.ts`, `data/arm.ts`, `run1-arm.ts`, `flight-templates.ts` rules, `ship-names.ts`, `memory.ts`, `carry.ts`, `ships.ts`, `run.ts`, `threat-plan.ts`, `licences.ts`, `log-selectors.ts`, `meta.ts` (ghost only), `boot.ts`, `debug.ts`, tuning `3a GEN`.

1. The generator:
   - `freshArm`, timing, arks, pattern, final year, checks 1–5 and retries;
   - reservations;
   - `assembleRun1Arm` (authored overrides);
   - `createRunMap`: run 1 → run-1 arm; run ≥ 2 → `freshArm(run.seed, run)` with `ARES-(VI+run)` at w0 and `FINAL_NAMES[run − 2]` at w19 (interim, risk 4);
   - the Debris guarantee among layer-3 ships reachable from w0.
2. The landing roller and `layoutPods`. `shipDefOf`. `validateShipDef` on every generated ship (the generator throws on its own bad output).
3. Memory classes step 2 (§2.7): layouts, validators, the floor, the fill order, the RECEIVER and OVERFLOW boot lines, the install spot.
4. Noise clouds and hop noise; `mapFacts`; `nominalRouteThreat`; switch the page's world to `'arm'`.
5. The flow: hop rolls, `pendingExtra`, the route, the galaxy year, `endShip` → `openDesk`.
6. Rings (`logEntriesAtBoot(solLy, isFinal)`). The ghost by layer. Interim licences.
7. `mapBootLines`: the ECC block, `> ASLEEP IN …` (risk 13), `> RECEIVER: 1 RACK · ROOM 88`.
8. `__ap.slot` / `route` / `runNumber` / `arm` / `hop` / `course`.

### 5.2 Track DESK/UI

Owns: `desk.ts`, `components/desk/*`, `TransmitScreen.ts`, `transmit.ts`, `run-end.ts`, `run-score.ts`, `RunEnd.ts` (→ RUN TALLY), MemoryStrip, MiniStrip, MemoryStats, MIND header, TitleCard, header crumb, Stamp (BEAM), `input.ts`, `main.ts`, `script.ts`, `map-text.ts`, `styles/*`, `audio-cues.ts`, tuning `3a DESK`.

1. **Chart:**
   - SVG, Uplink square nodes, arks bigger, a TIGHT notch, the final beacon;
   - lines CLEAN solid / hatched by noise, clouds as hatched static;
   - node states reachable / urgent (slack < 10) / TOO LATE / OUT OF RANGE / past / visited;
   - the route trail, 046's trail and cross, rings with the next one labelled;
   - hover reasons; `buzz` on a TOO LATE click.
2. **Card** (rows as in §3). The fit line from `roomFit`. `NO RM · YOU CAN'T DELETE THE ROOT` on a final ship. The TIMELINE.
3. **Desk screen:** the opening greying beat (a soft tone per ship), `← →` cycling, ENTER sets course, guidance steps, and the phone bottom sheet.
4. **PACKET:**
   - the room bar;
   - `CHARGE 38 → 12 ON ARRIVAL · 26 WON'T FIT`;
   - TIGHT `→ 0 ON ARRIVAL` in red, with the `ARRIVE WITH NO REPAIR CHARGE?` inline confirm;
   - TRANSMIT ▸ waits while files + floor > room (`toggleDrop` allows a drop when over room even if it gains no charge);
   - the ECC line, the years headline, `◀ CHART [ESC]`.
5. Strip rows by class, `MEMORY 256 · TIGHT`.
6. The title line and chart, the crumb year, the BEAM stamp.
7. The RUN TALLY model and view (`rankBasis`, visited ships, colonies, the mini route).

### 5.3 Track TESTS

Owns: `tests/unit/**`, `tests/e2e/**`, `tests/unit/run.mjs` timings.

1. Migrate suites to the classic world explicitly (`classicShip(i)` in place of `getShip(i)` / `SHIPS[i]` in about 61 files). Harness signatures are kept; mechanical, starting right after F1.
2. New suites (§6.1).
3. The e2e playthrough on a scripted route (§6.3). `run-flow` moves its HOLLOW checks to CORMORANT; a new `map-desk.mjs` scenario.

### 5.4 Shared hot files and order

| File | Owner | How others add |
|---|---|---|
| `ships.ts`, `memory.ts`, `run.ts` | F1/F2 → GEN | DESK reads only; requests by message |
| `tuning.ts` | F2 creates blocks | each track only inside its own block |
| `script.ts` | DESK | GEN's boot conditions live in `map-boot` (`mapBootLines`), already called |
| `schema.ts` | F2 (all 3a fields) | a later field: lead-approved one-line additions |
| `classic-five.ts` | frozen | lead only |
| `debug.ts` | GEN | DESK and TESTS request helpers |

**Order:**
- F1 → review → F2.
- GEN, DESK and TESTS start together. DESK builds against F2's real hop math and the run-1 table; TESTS' migration needs only F1.
- Merge GEN first (the page switches to the arm), then DESK, then TESTS. TESTS re-runs the run-flow and e2e after both.

---

## 6. Tests

### 6.1 New suites (each target under 5 s, unless noted)

| Suite | Checks |
|---|---|
| `map/arm` | `validateArm`; the ranges of §4.1; names clash rule |
| `map/run1-roll` | §3.14 as a fixture: years (half-up: WAYFARER 2970, LAST LIGHT 3020), checks pass, 907 routes, best by length 66/69/68/64, the worked route's LY, link, hits, ECC, slack and SOL distances, ALBATROSS reachable only from ARES-VII, classes 7/7/6, the reservations placed |
| `map/generator-stats` | 200 fresh rolls (quick depth 50): every arm valid in ≤ 50 attempts, bands around §4.5, every ship on some route, every generated `ShipDef` passes `validateShipDef`, slots on every layer-4+ ship, no rack D outside FULL, the Debris guarantee; noise distribution reported as INFO |
| `map/memory-classes` | `MEMORY_LAYOUTS` numbers (152/152/88; floor 12/12/0), `layoutPods` reproduces 01 §3.16's rows, `layoutCarried` per class with 01's unit table (65/73/84/104 files), TIGHT 0-charge, the no-room seed rule on TIGHT, `roomFit` words |
| `map/route-threat` | `planThreat` along 04 §3.16 routes A/B/C on real arm facts; M3 on run 1 (CORMORANT true, VESPER false); boarding forced at CORMORANT on the worked route; the scripted first seed at depth 3; INFO: share of routes with ≥ 2 HOLLOW ships when every seed is left; final-hop link spread |
| `map/desk-models` | card rows for HALCYON, ALBATROSS (`ONLY FROM HERE`), VESPER from KESTREL, LAPWING (TIGHT fit), a final ship with no rm; node states; greying count `2 SHIPS NOW OUT OF YOUR REACH` at KESTREL; `deskSteps` |
| `map/run1-route` (about 15 s) | headless run 1 through `openDesk`/`setCourse` on `[0, 2, 5, 11, 15, 19]` with instant landings (`support/landing-instant.ts`): phases, hop rolls keyed by slot, galaxy year, rings at each boot, the boarding at CORMORANT, interim licences arriving, RUN TALLY rows and absolute rank; charge at the choice printed (risk 6) |
| `map/memory-refactor` (part of F1) | a FULL classic world is byte-identical before and after (memory dumps of ships 0–4 against a stored digest) |

Total new: about 35 s serial, spread over workers. If the tier goes over 280 s, trim `generator-stats` to 30 arms in quick depth (the full 200 arms run in `npm run balance`), before touching old suites.

### 6.2 Existing suites

- **The classic world is the migration.** The five ShipDefs, their links, hits, facts, licences and roll keys (`seed, index`) are frozen in `classic-five.ts`. So `shipAlone(index)`, `__ap.ship(n)`, `nominalRunThreat(i)`, `freshUnitRacks` and every geometry assertion keep their exact numbers. The only edits are imports (`classicShip`) and F1's signature threading.
- **Expected assertion changes** (listed in a `KNOWN-FAILING-slice3a.md` until fixed):
  - rings instead of interim keys: VESPER now finds 04–06 and LAST LIGHT 07–11 on the classic world too (one rule; classic ships get their arm worlds' SOL distances 8/29/55/107/180). Affects opening/calm-ships, wp11/full-run and threat/arrival-story's log checks;
  - RUN END → RUN TALLY: no `NOT REACHED` rows (wp7/run-end-and-boot, wp11/p2/purge-fleet);
  - BurnResult's "TRANSMIT TO X" button → "TO THE CHART".
- **Retire:** nothing in 3a. wp11/full-run stays classic (the MERGE measurement on the old route), and `map/run1-route` is its map twin. Later slices migrate suites to the arm opportunistically and then delete the classic world (risk 15).

### 6.3 e2e (once at the end)

- **`playthrough.mjs`:**
  - run 1 through the real DESK on the route `[0, 2, 5, 11, 15, 19]`;
  - at each desk the kid clicks the named node and presses ENTER. `?debug` is only read, except `__ap.course(slot)` as a fallback when a click misses (logged as FAIL);
  - landings by the strip on ships 1, 2 and the final; `__ap.landAll` elsewhere;
  - per-ship checks re-keyed: KESTREL's seed, VESPER's ghost thrust and 16 pods, CORMORANT's boarding, LAST LIGHT's deal and duel;
  - then the RUN TALLY and NEW RUN (a fresh roll, run 2: `ARES-VIII` at w0).
- **`run-flow.mjs`:** HOLLOW's wake, bite, naming and MOVE checks via `__ap.route([0, 2, 5, 11, 15])` (CORMORANT, forced boarding) in place of `__ap.ship(3)`. LAST LIGHT checks via `__ap.route([..., 19])`.
- **New `map-desk.mjs`:**
  - chart, card and SET COURSE; `◀ CHART` and back;
  - a TOO LATE click (buzz, no course);
  - TIGHT's 0-charge confirm (a forced unit via `__ap`);
  - the phone bottom sheet;
  - the title's beacon.
- **`label-hops`, `phone`, `beam-blue`** keep `__ap.ship(n)` (classic) and add one arm ship each for the strip's 4/5-row layouts.
- About 6 extra minutes on top of the ~15 (a 6th ship, the desk). Accept.

---

## 7. Risks and open questions (each with a recommended answer)

1. **VESPER loses HOLLOW on run 1.** On the arm, Cinder is 83 LY from New Haven, so M3 forces the boarding at CORMORANT (or KITTIWAKE/PROVIDENCE routes), a generated 9-pod FULL ship. VESPER becomes a 16-pod ark seeds ship with ghost thrust: run 1's longest ship. **Recommend** keeping the spec. GEN makes sure a generated FULL layer-6/7 ship's slot and drivers give ARRIVAL + WALLS VESPER's geometry (the GAP-1 lead beside the slot); TESTS adds a boss-style check on CORMORANT. Report to Fran.
2. **Run 1: authored structure versus a roll** (02 §3.12 says a roll). **Recommend authored structure** (§2.3), because:
   - the tutorial run stays the same for every player;
   - 05 §3.12's sample text (the years, RIVERSIDE's postcards) stays true;
   - §3.14 becomes the test fixture for free;
   - playtests compare.

   Details still roll from the arm seed, and noise rolls per run. Raise with Fran as a deviation.
3. **Interim licences by act** (§2.8): needed because 3a ships before the repository. **Recommend** the act schedule; delete it in 3b.
4. **NEW RUN in 3a.** With no world update, run ≥ 2 is a fresh roll with ARES-VIII and LODESTAR named by run number. **Recommend** this (variety for playtests) over replaying run 1's arm. 3c swaps it in `createRunMap` only.
5. **Noise into the final ship.** A NOISY or SEVERE last hop adds up to 3 beam seeds to the verbs, THE DEAL and the duel (slice-2 risk 2 kept LAST LIGHT CLEAN). **Recommend** shipping the spec, measuring in `map/route-threat` and the playtest, and raising a cap of 1 seed on the beam into a final ship as the lever. Do not change it quietly.
6. **The MERGE margin moves to the route** (final links 87–117). **Recommend** measuring charge at the choice in `map/run1-route` across routes ending at CORMORANT, PROVIDENCE, GOOD HOPE and WAYFARER. The lever is slice 8's, not 3a's.
7. **Big ships by hand:** VESPER 16 and ALBATROSS 15 at depth 2–4, before AUTODROP (01 risk 2). **Recommend** accepting it and checking "minutes per ship" in the playtest.
8. **Spec fixes** (§2.3): round half up everywhere, in integer arithmetic; ALBATROSS's 11-year margin kept as authored, with the margin a generator rule. Send both to Fran.
9. **The rng key conflict.** 01 §3.15 says `childRng(runSeed, slot, 'landing')`; 02 §3.4 says the ship key. **Recommend 02**: a waiting ship must land the same next run. Per-visit rolls (transit, beam seeds, draft) use the run seed and slots.
10. **Unit tier budget** (about 251 s today). **Recommend** the classic world (no re-flown old suites) plus about 35 s of new suites, with `generator-stats` trimmed first if needed.
11. **POOR site data before slice 6.** **Recommend** rolling and storing it now in its own stream, playing it GOOD, with the card saying `SET BY ARRIVAL CONTROL`.
12. **Modifier interpretation** (IMPACT COURSE / TOO WIDE are inherent to their templates). **Recommend** it, since templates must fly unchanged; confirm with Fran.
13. **The sleep line `> ASLEEP IN …`.** 02 §8 puts it in 3b, but it is where the years happen and the ECC line refers to sleep. **Recommend** moving it into 3a; 3b keeps the delivery lines.
14. **Noise-cloud placement is underdetermined.** **Recommend** §4.2's rule, with `generator-stats` reporting per-route noise. If some arm leaves every final beam SEVERE, add "at least one CLEAN or LOW hop into the final ship" as a re-roll rule. Clouds over a world are allowed (02: "a remembered ship can still sit behind a new cloud").
15. **Two VESPERs** (classic 12 pods with HOLLOW; arm 16-pod ark). **Recommend** naming the world `classic` everywhere, using it only through `__ap.ship` and the fixtures, and sunsetting it after slice 4, once suites move to arm fixtures.
16. **Round 3 Q8** ("the first seed ship is never a TIGHT ship you'd reach with 0 charge"). In 3a a depth-3 unit is 73–82 files against TIGHT's 88, so charge is at least about 6. **Recommend** a `map/memory-classes` assertion over generated depth-3 TIGHT hops, plus the PACKET confirm as the backstop.
17. **The salvage deal and `◀ CHART`.** The deal reads the link, so a different destination can change the cards. **Recommend** keying the stream by the slot being left (02 §3.4) and keeping the pick if it is still offered. Revisit with 3b's SALVAGE pass.
18. **Archive v1's `shipName`** for the ghost on fresh-rolled runs. **Recommend** the layer lookup (§2.9), falling back to the final ship; 3c replaces it.

### Critical Files for Implementation
- /home/user/ArrivalProtocol/src/data/ships.ts
- /home/user/ArrivalProtocol/src/data/memory.ts
- /home/user/ArrivalProtocol/src/systems/run.ts
- /home/user/ArrivalProtocol/src/systems/threat-plan.ts
- /home/user/ArrivalProtocol/src/systems/carry.ts
- /home/user/ArrivalProtocol/docs/phase3/map-sim/arm_sim.py