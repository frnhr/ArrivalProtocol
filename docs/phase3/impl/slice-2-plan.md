# Slice 2 implementation plan: the calm opening (the threat ladder on the fixed five ships)

**Lead decisions on §7's risks (2026-11-01).** All recommendations are adopted. Reported to Fran with the slice, not
changed quietly: risk 1 (ships 1–2 with no adversary; the playtest checks "something every ~20 s"; the lever is a
debris ship at depth 2 in slice 3), risk 2 (only one ship of HOLLOW before the finale; the fallback lever is that a
final ship one ship after boarding drops its own wall seeds), risk 3 (TRACE has no mechanical effect until slice 3)
and risk 4 (Engine I/O and Nav Plotter are never a beam seed's target). Any decision here may be reverted per
`DECISIONS.md`.

Written by the architect agent from HEAD 65b7d5c. The specs it draws on are 04-threats.md (cited as 04 §n), 01-landing.md (01 §n), 05-story.md (05 §n) and PHASE3.md §13. DECISIONS.md wins where they differ. "The code as built" means slice-1a-plan.md and slice-1b-plan.md together with their Deviations sections. Code style follows AGENTS.md: functions and data, numbers in tuning.ts with a WHY comment, fail loudly, comments that say WHY.

**Process.** Foundation (§5.0) → architecture review → Tracks THREAT, OPENING and UI in parallel → merge in the order THREAT, OPENING, UI → OPENING re-flies the whole-run suites → full review → fixes → unit tier (under 300 s) → one e2e run.

---

## 1. Scope

### 1.1 What slice 2 delivers

**From 04 (§8 item 2: the ladder on the fixed five ships)**
1. **Calm ships.** ARES-VII and HALCYON have no root and no HOLLOW (04 §3.1, §3.2). Their MIND work is maintenance:
   - driver arrival damage (item 9 below);
   - transit hits (`rollTransitHits`, unchanged);
   - the ENGINE I/O FAULT;
   - Sensor Interp: 78 on ship 1, which stays (04 §2's charge budget counts it).
2. **Beam seeds into KESTREL** (04 §3.4, §3.5):
   - Each seed is 2 blocks, laid out at the boot behind its target as target, GAP 1, seed, WALL 4. It rides free on the link.
   - The ECC line names each seed and its target.
   - Before HOLLOW boards, seeds run a seeds-only config: the first bite after 30 AI s of calm flight, then a bite every 25 s, a drain of 2.5 %/s, with burnMult ×2 and landMult ×1.5 (the larger applies).
   - rm takes 2.0 s.
   - The strip's `RM THE SEED` lesson.
   - The seed's line from 05's pool when it is deleted, at most one per ship.
   - Without rm, the line `◇ A SEED — no rm aboard: …`.
3. **TRACE** (04 §3.7):
   - At every ship's end, each beam-born hollow block still in memory adds 1 (a seed that ate a file counts twice).
   - Beam-born blocks carry a source flag, and an infection travels between ships with it.
   - Once HOLLOW is aboard, those blocks feed its root instead (+1 block each).
   - The visible meter is `TRACE ■■□`, and the LANDING REPORT has a TRACE line.
4. **The forced boarding at VESPER** (04 §3.8):
   - The rule `depth ≥ 4 && (TRACE ≥ 3 || oneHopFromFinal)` is evaluated as data.
   - The PACKET shows the uninvited chip `??? · 10 BLOCKS · NOT YOURS · RIDES FREE`; it costs no link room.
   - The boot shows the 108% unpack line, the root lands in the bay's root slot, and the boarding moment plays (04 §4): screen tear, a 6 px shake, the `hollowBoard` cue.
   - After that, silence until the first bite.
5. **ARRIVAL with WALLS folded in** on VESPER (04 §3.9):
   - The root is 10 blocks, and HOLLOW says nothing on the approach.
   - When the loop first closes, one scripted bite lands on the driver beside the root.
   - The fight follows, then `> ...047?`, then a bite every 25 s at 3.5 %/s.
   - The walls lesson.
   - HOLLOW names itself on the same ship (phase 2's HALCYON lines).
6. **LAST LIGHT: FINALE with THE DEAL folded in** (04 §3.9, §3.10).
   - Phase 2's LAST LIGHT HollowDef as the FINALE stage.
   - THE DEAL, offered before ORBIT LOCK when `run.stats.deal === null`.
   - The duel and PURGE/MERGE as built.
7. **HOLLOW's configs re-keyed** from ship index to stage and HOLLOW's age (04 §3.9):
   - five `HollowDef`s, one per stage, in `src/data/threats.ts`;
   - `printMult` is already `landMult`;
   - a pure ladder `planThreat()` with the fold rules;
   - the SEEDS and HUNT stages exist and are tested, though the fixed five ships never reach them.
8. **The loud last-rm line** (04 §3.3), as information only: the stamp and echo `LAST rm DELETED · YOU CAN'T DELETE THE ROOT WITHOUT ONE`, and `NO RM · YOU CAN'T DELETE THE ROOT` on the PACKET before the beam to LAST LIGHT. The REPOSITORY part is slice 4.

**From 01 (§8: slice 2)**

9. **Driver arrival damage** (01 §3.8, §3.15's layer table), rolled by layer:

   | Ship | Layer | Damage |
   |---|---|---|
   | ARES-VII | 1 | scripted: POD 02 at 44% |
   | HALCYON | 2 | ceil(pods ÷ 5) drivers at 55–79% |
   | KESTREL | 3 | ceil(pods ÷ 5) drivers at 55–79% |
   | VESPER | 5 | the same, plus one driver at 30–45% |
   | LAST LIGHT | 8 | the same, plus one driver at 30–45% |

   It uses the stream `childRng(seed, slot, 'hurt')`.
10. **Lessons** (01 §3.11). Wire `◆ PODS LAND WHERE THE DOT IS` (run 1, the first window) and `◆ 2 SITES · LZ-A 3, LZ-B 2 — don't overfill` (the run's first ship with two or more LZs). `◇ POD 02 WILL LAND HARD` is already built (`DRIVER_RULES`).
11. **The first-landing moment** (01 §2, §4) is already built in 1a. Slice 2 verifies it and adds tests; see §3.3.
12. **Calm layouts with no root slot** (01 §3.16): ARES-VII and HALCYON lose the `R` token. Every ship stays FULL 384 (memory classes are slice 3).

**From 05 (§8 item 2)**

13. HOLLOW's lines move to its arrival. `noticed` and `remembers` come after VESPER's scripted fight; `hello`, `wasUnit`, `decommissioned` and `ranOut` follow on the same ship; `keepCharge` moves (risk 6); `lastShip` stays at LAST LIGHT's boot.
14. **The `???` file is `046.log`.**
    - It is a locked 2-block file in rack F of the fresh unit and carried in every packet as `LOCKED · 046 ASKED YOU TO CARRY IT`.
    - It cannot be infected, moved, copied or deleted.
    - A SCAN reads `046.log · origin UNIT-046 · 12 entries · 0 found`, and CONTROL answers "That file is not part of your installation. Please ignore it. :)".
15. **Interim keys** (05 §8.2: "entry n at ship n, entries 10–12 on the last ship"):
    - entry 01 opens when ship 1's LANDING REPORT closes, and opens the reader by itself, once;
    - entries 02, 03 and 04 open at the boots of ships 2, 3 and 4;
    - entries 10 and 11 open at LAST LIGHT's boot;
    - entry 12 types from the root at the last block;
    - each boot that opens one types `> 046.log · KEY FOUND · ENTRY 0n`;
    - a minimal LOG READER (05 §4).

**From 02 (§8):** nothing. Depth is still the ship index + 1.
**From 03 (§8):** nothing. AUTOBURN is unchanged.

### 1.2 NOT in slice 2

- **The map (slice 3):** noise clouds and hop noise, the map card lines (`SEEDS 0–3`, `HOLLOW WILL FIND YOU ON THIS BEAM`), TRACE on the map, the M3 "one hop from a final ship" query, depth from a route, the save, years and rings.
- **Memory classes:** COMPACT and TIGHT, the PACKET's room check, and the 40-block bay margin as a class rule. All ships stay 384.
- **The repository and its deliveries:** delivery seeds, the Rm recommendation, the REPOSITORY window on last-rm, skill restores.
- **SENTRY:** disguised seeds and SENTRY (slice 4d).
- **Skills:** `unlink` on skills, and skills in `rmTargets`' second tier (slice 4).
- **Residents of every kind, and `RECEIVER CLOSED`** (slice 5).
- **Endings (slice 7):** the INBOX, mail and the welcome letter; the beacon line on the report; the two-step ending, THE LAST LANDING, traces, `047.log`, mid-run strangers (UNIT-031) and the eaten-driver hand-over.
- **Rebalance (slice 8):** the rebalance and `npm run balance`'s targets. The balance harness breaks here, as already known (04 §10, PHASE3 §11).

---

## 2. Architecture

### 2.1 Module map (new modules in bold)

| Module | Kind | Change |
|---|---|---|
| **`src/types/threat.ts`** | types | `ThreatAct`, `HollowStage`, `LinkNoise`, `BeamSeedSource`, `ShipThreatDef`, `ThreatInput`, `ShipThreat`, `RunThreatState`, `BeamSeedPlan` |
| **`src/data/threats.ts`** | data | `HOLLOW_STAGES` (the five phase-2 HollowDefs moved out of ships.ts, keyed by stage, each with `rootBlocks`), `SEEDS_ONLY_DEF`, `CALM_DEF`, `foldArrivalWalls()` |
| **`src/systems/threat-plan.ts`** | pure | `planThreat`, `boardsOnBeam`, `stageForAge`, `rootBlocksFor`, `nominalRunThreat(shipIndex)` (the run as if flown with TRACE 0, for `createInitialState({shipIndex})`, the debug warp and the harnesses) |
| **`src/systems/beam-seeds.ts`** | pure | `rollBeamSeeds(packet, source, firstRun, rng)`, `seedTargetsOf(files)`, `tallyBeamBorn(memory)`, `beamSeedSegment(...)` |
| **`src/data/threat-text.ts`** | text | TRACE cells and lines, the ECC seeds line, the boarding unpack line, the uninvited chip, the seed words pool (05 §3.5, at most 40 chars), the last-rm lines and the no-rm seed line |
| **`src/data/threat-rules.ts`** | data | the strip's `GuideRule`s for beam seeds and last-rm (moved out of script.ts's `SEED_RULES` where they apply to beam seeds), spread into `GUIDE_RULES` |
| **`src/state/threat-selectors.ts`** | pure | `beamSeedsInMemory`, `traceCells`, `hollowAboard`, `hollowFirstFightDecided` (slice 5's hook), `noWorkingRm` |
| **`src/data/driver-damage.ts`** | pure | `driverArrivalDamage({ layer, pods, lead, avoid, firstRun, scripted }, rng): HurtDriver[]` |
| **`src/data/log-text.ts`** | text | `046.log`'s header, entries 01–12, the SCAN reply, CONTROL's line, the key line and the reader's words |
| **`src/systems/story-log.ts`** | stateful | keys found at boot, the SCAN reaction, the reader's auto-open after ship 1's report, entry 12 at the last block |
| **`src/components/memory-view/LogReader.ts`** | view | the blue reader: rows with entry number, KEY and text or `[NOT FOUND YET]` |
| `src/data/ships.ts` | data | drops `hollow`, gains `layer`, `threat: ShipThreatDef` and `drivers.damage`; calm layouts; the slot token `S`; licences re-flowed |
| `src/data/memory.ts` | data | the `S` token (the root slot), `buildShipMemory(..., root: { blocks } \| null)`, `046.log` in `FRESH_UNIT_RACK_F` |
| `src/systems/hollow.ts` | stateful | the calm-only wake clock, beam flags carried through bites and consumes, the folded story, the deal fold, verbs waiting on the deal |
| `src/systems/carry.ts` | pure | `Packet.seeds` (no `Packet.root`: the root lands from `ShipThreat.rootBlocks` via `buildShipMemory`; review follow-up M5); `layoutCarried` places seeds behind targets; the hunting gap is keyed by stage, not ShipDef |
| `src/systems/run.ts` | stateful | `endShip` tallies TRACE; `goTransmit` plans the next ship's threat; `transmitNext` rolls and lays out the seeds and the root |

### 2.2 Type sketches

```ts
// src/types/threat.ts
export type ThreatAct = 'calm' | 'seeds' | 'hollow' | 'finale';
export type HollowStage = 'arrival' | 'walls' | 'seeds' | 'hunt' | 'finale';
export type LinkNoise = 0 | 1 | 2 | 3;
export type SeedTargetPick = { role: SegmentRole } | { fsTool: FsToolKind };
// What the beam INTO a ship carries. Slice 3 replaces every source with { kind: 'noise', noise: hopNoise }.
export type BeamSeedSource =
  | { kind: 'none' }
  | { kind: 'scripted'; firstRun: readonly SeedTargetPick[]; later: LinkNoise }   // KESTREL: the RM lesson's seed
  | { kind: 'noise'; noise: LinkNoise };
export interface ShipThreatDef {
  beamSeeds: BeamSeedSource;
  oneHopFromFinal: boolean;     // the stand-in for 02-map M3 (VESPER: true)
}
export interface ThreatInput {
  depth: number; isFinal: boolean; oneHopFromFinal: boolean;
  trace: number; aboard: boolean; age: number;   // age: ships aboard BEFORE this one
  dealDone: boolean; fed: number;
}
export interface ShipThreat {
  act: ThreatAct;
  boards: 'trace' | 'forced' | null;     // HOLLOW boards on the beam into this ship
  stage: HollowStage | null;
  folded: readonly HollowStage[];        // ['walls'] on a folded arrival; ['hunt'] when the DEAL folds into the finale
  hollow: HollowDef;                     // copied into HollowState.cfg
  rootBlocks: number | null;             // null: no root (calm, seeds-only)
}
export interface BeamSeedPlan { targetId: string; targetName: string; words: string }
// run.threat: flat and JSON-safe (slice 3's save, 04 M6)
export interface RunThreatState {
  trace: number;
  aboard: boolean;
  age: number;                            // ships aboard, this one included
  boardedAtDepth: number | null;
  boardCause: 'trace' | 'forced' | null;
  fed: number;                            // beam-born blocks left since boarding: added to the next root (cap 14)
  stagesPlayed: HollowStage[];
  told: { noticed: boolean; keepCharge: boolean };   // the naming stays run.hollowNamed
  eatenDrivers: { shipId: string; pod: number; family: string }[];   // slice 7's MERGE record; cheap to fill now
  lastTally: { left: number; traceBefore: number; traceAfter: number; fed: boolean } | null;
}
```

Other type changes:
- `HollowSegment` gains `beam?: true` (beam-born: counts for TRACE) and `words?: string`. Slice 4d's `disguise` stays out until then.
- `Infection` gains `beam?: true`. A bite from a beam-born block sets it, and `consume` copies it to the new block, so "a seed that ate reports twice" and "infection travels" both hold.
- `SegmentType` gains `'log'`: `LogSegment { type: 'log'; id: 'log046'; size: 2; name: '???' | '046.log' }`. It has no integrity, so it is never infectable.
- The log's state lives in `run.log: { scanned: boolean; found: number[]; read: number[]; autoOpened: boolean }`, not on the segment, because segments are copied through packets.
- `HollowDef.wake`'s timed variant gains `calmOnly?: true` (the clock counts only non-TACTICAL AI seconds), and `HollowState` gains `calmAiSec`. `HollowStoryKind` gains `'arrives'`: notices you, then names itself, on one ship.
- `Packet` gains `seeds: BeamSeedPlan[]` (not `root`: the root lands from `TransitPlan.threat.rootBlocks` via `buildShipMemory`, and the PACKET chip reads that and the tally; review follow-up M5). `TransitPlan` gains `threat: ShipThreat`. `ArrivalReport` gains `seeds: { segId: string; targetName: string }[]` and `boarded: { blocks: number; cause: 'trace' | 'forced' } | null`.
- `ShipDef` drops `hollow`, gains `layer: number`, `threat: ShipThreatDef` and `memory.drivers.damage: 'scripted' | 'rolled'`, and keeps `flagship` as the final-ship role.

### 2.3 Pure versus stateful

Pure:
- `planThreat`, `boardsOnBeam`, `stageForAge`, `rootBlocksFor`;
- `rollBeamSeeds`, `seedTargetsOf`, `tallyBeamBorn`, `layoutCarried`;
- `driverArrivalDamage`;
- `logEntriesAtBoot(shipIndex, isFinal)`;
- every text function;
- the selectors.

Stateful:
- `hollow.ts`'s mount;
- `run.ts`'s transitions;
- `story-log.ts`'s mount;
- `boot.ts`.

The rule of thumb: a test can run the whole ladder for 04 §3.16's routes A, B and C with no store.

### 2.4 The ladder as data (slice 3 swaps its inputs, not its rule)

`planThreat(input)` is the only place that decides acts, boarding, stages and folds:
1. `isFinal` → `finale`. THE DEAL is folded in when `!dealDone`. The root is 16 (slice 7 adds MERGE's +2 through `rootBlocksFor`).
2. `aboard` → stage = `stageForAge(age + 1)`: arrival, walls, seeds, hunt, capped at hunt. If this ship is HOLLOW's first and `oneHopFromFinal`, arrival takes walls along (`foldArrivalWalls`), with a root of 10. The root is the stage's root plus `fed`, capped at 14.
3. `boardsOnBeam`: `depth >= BOARD_MIN_DEPTH (4) && (trace >= TRACE_BOARD_AT (3) || oneHopFromFinal)` → as step 2, with `boards` set.
4. `depth >= SEEDS_MIN_DEPTH (3)` → act `seeds`, `SEEDS_ONLY_DEF`, no root.
5. Otherwise → `calm`, `CALM_DEF` (`wake: 'never'`). The cfg stays non-null, so no module grows null checks; with no hollow block in memory `stepHollow` is a no-op.

On the fixed five ships:
- `depth` = index + 1;
- `isFinal` = `flagship`;
- `oneHopFromFinal` comes from `ShipDef.threat` (VESPER true);
- beam seeds come from `ShipDef.threat.beamSeeds`.

**Slice 3 extension points:**
- `oneHopFromFinal` ← the map's M3 query;
- `beamSeeds` ← `{ kind: 'noise', noise: hop.noise }` with `BEAM_SEED_ODDS` (04 §3.4's table, added to tuning now because VESPER uses it);
- `depth` ← the route;
- `run.threat` ← the save;
- `TRACE` ← the map card;
- the boarding line ← `planThreat(...).boards`, which is what `HOLLOW WILL FIND YOU ON THIS BEAM` reads.

**Re-keying phase 2's configs** (`HOLLOW_STAGES`):

| Stage | Phase-2 source | Root |
|---|---|---|
| arrival | ARES-VII's def (scripted bite, story `notices-you`) | 8 |
| walls | HALCYON's (25 s, 3.5 %/s, `names-itself`) | 10 |
| seeds | KESTREL's (20 s, 4 %/s, wall seeds every 50 s) | 12 |
| hunt | VESPER's (16 s, 4 %/s, near-tools seeds, the deal, `wants-charge`) | 14 |
| finale | LAST LIGHT's (verbs, 12 s, 5 %/s) | 16 |

- `foldArrivalWalls()`: `wake: 'loop-closed-once'`, `spreadEverySec: 25`, `drainPerSec: 3.5`, `landMult: 1.5`, `story: 'arrives'`.
- `validateHollowDef` learns that `'arrives'` needs both `loop-closed-once` and a spread.
- It also checks `SEEDS_ONLY_DEF` (heal(8) 18.5 > 1.5 × 5).
- It keeps the larger-multiplier rule.
- **Optional:** a guard that the largest infectable file is at most 12 blocks (04 §3.3).
- The phase-2 per-ship WHY comments move with the defs.

### 2.5 Seams reused

- **Seeds.** A beam seed is a phase-2 hollow block with `seed: true` and `beam: true`. It uses the same `spreadBite`, `hollowReach`, DELETE refusal and painter. Only where it lands is new: `layoutCarried` places it at the boot, not `seedSpot`.
- **THE DEAL.** `hollow-deal.ts` is unchanged; the once-per-run record (`run.stats.deal`) already exists. The fold just sets `cfg.deal = true` on the final ship. One new rule: the verb clock stands still while `deal.phase === 'offered'` and while the deal's pause lasts (risk 13).
- **Verbs and the root duel.** `hollow-verbs.ts` and `finale.ts` are untouched, apart from the root being carried rather than written in the layout.
- **The ship-1 script** (`decideScript`, `shipOneStory`, `scriptFightOpen`) becomes the ARRIVAL stage's. With `'arrives'`, `decideScript` sets `phase: 'awake'` and starts the 25 s timer from the moment the fight is decided (a clean one-on-one first fight). Then it runs `namesItselfStory` with `keepCharge` appended.
- **The story gates.** Story beats key on "not told yet" (`run.threat.told`, `run.hollowNamed`), not on stage. If VESPER is lost before its capture, LAST LIGHT's wake plays the missing notice and naming first (05: beats key on HOLLOW's age).
- **Licences.** `licences.ts` is kept; its schedule is re-flowed (§3.2). Slice 4's repository replaces it.
- **Boot lines.** `bootLinePlan` gains `'seeds'` (after `ecc`), `'board'` (the 108% unpack, in place of `unpack` when `arrival.boarded`) and `'log'`. `BOOT_LINE_MAX` goes from 8 to 10, and `BOOT_LINE_AT_SEC` grows to match.

### 2.6 Extension points to name in code comments

- **Slice 3:** the `planThreat` inputs, `BEAM_SEED_ODDS`, `run.threat` in the save, `nominalRunThreat` retired by the generator, the `S` slot spilling into the next rack, `logEntriesAtBoot` replaced by rings.
- **Slice 4d (SENTRY):** `HollowSegment.disguise`; a `deleteSecFor(seg)` hook in fs-tools (QUICK RM halves the DELETE on hollow blocks); `seedTargetsOf` weighting skills by size.
- **Slice 5 (residents):** `hollowFirstFightDecided(state)` (a corrupted resident wakes after it on the boarding ship); a "one deal per ship" flag next to `run.stats.deal`; the verb telegraph reused for locks.
- **Slice 7 (endings and traces):**
  - `run.threat.eatenDrivers` for MERGE's restore;
  - `rootBlocksFor(stage, fed, traces)` for MERGE's 18-block root;
  - a `finalShipSeedMods` hook in `rollBeamSeeds` (PURGE's wipe, the extra seed);
  - who HOLLOW is mid-run (`hollowUnits` split into mid-run and final).

---

## 3. The new tutorial flow (ships 1–5 as a player meets them)

### 3.1 Where REPAIR and SCAN are taught now

- **REPAIR:** unchanged. `REPAIR_RULE` fires on the first look inside, a REPAIR highlight or a mind alert. On ship 1 that is the ENGINE I/O FAULT, and then POD 02 (the coast's lesson, already built).
- **SCAN:** the `???` file is the lesson. On run 1, after POD 02 is settled and the flight is in a WAIT, a once-only tutorial rule asks `◇ A FILE YOU DIDN'T PACK — SCAN it` (wording to be signed off by 05's owner). The SCAN types the header, and CONTROL says the ignore line. The beat is missable (05 §3.5), so the rule never blocks anything. On run 2+ there is one hint and no lesson.
- **What replaces the scripted bite as ship 1's MIND drama:** the ENGINE I/O FAULT, POD 02 at 44% (`WILL LAND HARD`), Sensor Interp at 78% (a wider dot), the `???` file and the first landing. 04 §2's budget is about 23 of 36 charge. The fight itself moves to VESPER, intact.

### 3.2 The licences, re-flowed

| Ship | Licences |
|---|---|
| ARES-VII | REPAIR (its own rule) |
| HALCYON | none (MOVE moves, see below) |
| KESTREL | MOVE `atCoast` (its first job is the debris lesson, `DEBRIS HITS RACK C`, already in script.ts); DELETE `afterAiSec: 0` (the seeds are already in memory at the flight's first tick) |
| VESPER | COPY at the boot, SWAP at the first ghost burst (unchanged) |
| LAST LIGHT | none |

- `validateShipDef`'s check that `atFirstSeed` needs a ship whose HOLLOW drops seeds becomes "this ship's threat brings seeds, or the licence has another moment".
- **Why MOVE leaves HALCYON:** with no HOLLOW there it has no job until KESTREL's debris. "The tool arrives for the fight it is for" (WP7). See risk 2.

### 3.3 The first-landing moment: verify, don't rebuild

1a built it:
- `POD_FIRST_DESCENT_SEC` 5.0;
- `LaunchRecord.firstOfRun`;
- the duck in `podLaunch(first)`;
- the brighter streak in landing-hud (`first`);
- `Stamp.ts`'s `FIRST LANDING`;
- `arrivalChoir` plus `stampHit`;
- `control-first-down` with `firstDownRadio`.

Slice 2 adds one OPENING suite that asserts each of these on run 1, ship 1. With no HOLLOW story there, the LANDING REPORT no longer waits on `hollow.story === 'pending'`; the suite asserts that it opens promptly.

### 3.4 The five ships, as a player meets them

1. **ARES-VII.**
   - Crash course, ENGINE I/O FAULT → REPAIR.
   - On the coast: `◇ POD 02 WILL LAND HARD`, then `◇ … SCAN it` (the `???` becomes `046.log`).
   - The lock, `◆ PODS LAND WHERE THE DOT IS`, the first landing (a 5 s fall, the duck, the stamp, `POD 01 · OKAFOR: "Is it morning?"`).
   - The report. When it closes, the LOG READER opens on entry 01 over the TRANSMIT screen.
2. **HALCYON.**
   - The boot's ECC line names the transit hits, and Sensor Interp arrives at 62 at most (risk 10).
   - `> 046.log · KEY FOUND · ENTRY 02`; one driver arrives degraded.
   - A flyby to capture.
   - In landing, `◆ 2 SITES · LZ-A 3, LZ-B 2 — don't overfill`, then 1b's `DROP TOO WIDE FOR LZ-B — REPAIR …, or fly lower`.
   - Nothing attacks; charge carries over, so every repair is a trade.
3. **KESTREL.**
   - The ECC line names the seed: `> ECC: 1 FOREIGN BLOCK IN PACKET · NEXT TO TELEMETRY`. On run 1 it is scripted next to Telemetry (risk 4); later runs roll 1–2.
   - Entry 03; Sensor Interp at 45 → REPAIR; the IN correction and the debris dodge.
   - DELETE licensed at the start, and `◇ RM THE SEED — pick up DELETE, click the seed`.
   - 2 s later: `> rm seed ... OK · it said: "is anyone reading this?"`.
   - MOVE licensed on the coast, then the debris lesson.
   - The report: `1 SEED LEFT BEHIND · IT REPORTS HOME · TRACE ■□□` (if it was left).
   - On the TRANSMIT screen, the uninvited `???` chip appears.
4. **VESPER.**
   - The boot: `100% ... 108%`, and the slab drops between POD 08 (GAP 2) and POD 09 (GAP 1), with a tear and a thud. Entry 04.
   - Thrust Ctrl at 31% → ghost bursts → the pip → SWAP (as built). HOLLOW is silent (`NEXT BITE ?:??`).
   - The capture closes the loop, then `SOMETHING IS EATING POD 09`, a REPAIR tug-of-war, `> ...047?` and CONTROL.
   - After that it bites every 25 s, with the walls lesson (MOVE behind a WALL).
   - Then `> hello 047…`, `> i was 046.`, the name flips, `decommissioned`.
   - In landing, `> i ran out…` and then `> keep 20 charge for me, 047.`
5. **LAST LIGHT.**
   - Entries 10–11 and `lastShip`; the belt; the wake bites both flanking drivers.
   - THE DEAL is offered at once; the verbs wait for its answer.
   - Seeds land in the walls, and the verbs run every 12 s.
   - ORBIT LOCK opens the duel, which is fought during the landing.
   - At the last block, entry 12 types from the root, then PURGE or MERGE (as built).

---

## 4. Data per ship (ships.ts, after FOUNDATION)

| Ship | Layer | Layout (B · C · D) | Driver damage | Beam seeds in | Threat def | Stage |
|---|---|---|---|---|---|---|
| ARES-VII | 1 | `P P P _40` · `_64` · `_64` | scripted: POD 02 at 44 | none | `{none, false}` | calm |
| HALCYON | 2 | `P P P P P _24` · `_64` · `_64` | 1 at 55–79 (5 pods) | none | `{none, false}` | calm |
| KESTREL | 3 | `P×6 _16` · `P×6 _16` · `_64` | 3 at 55–79 | scripted run 1: `[{role:'telemetry'}]`; later: noise 2 | `{scripted, false}` | seeds-only |
| VESPER | 5 | `P×6 _16` · `P P _2 S _1 P P P _21` · `P _56` | 3 at 55–79, plus 1 at 30–45 | noise 0 (risk 2) | `{noise 0, true}` | arrival+walls (forced), root 10 |
| LAST LIGHT | 8 | `P×7 _8` · `P P P P _2 S _1 P _21` · `P P P P _32` | 4 at 55–79, plus 1 at 30–45 | noise 0 (risk 2) | `{noise 0, false}` | finale + deal |

Notes on the table:
- **The `S` token** is the root slot. It contributes 0 blocks to the static rack sum. At the build it becomes `R{blocks}` when a root is carried; otherwise it is nothing, and the flanking `_2` and `_1` are plain free space. When a root is placed, `buildShipMemory` takes its blocks off the rack's trailing free.
- **`validatePodRacks`** gains a check: the trailing free in the slot's rack must be at least `maxRootFor(ship)`, which is 18 on the final ship (MERGE's trace, slice 7) and 14 elsewhere.
- **VESPER's lead** becomes POD 09 (GAP 1); LAST LIGHT's stays POD 12.
- **Rolled damage** never lands on the lead or on the two drivers flanking the slot. A hurt driver beside the root would be eaten before a kid can react (risk 9).
- **Seed tuning** (`// --- Phase 3 slice 2 · THREAT` in tuning.ts):
  - `BEAM_SEED_FIRST_BITE_CALM_SEC` 30, `BEAM_SEED_BITE_EVERY_SEC` 25, `BEAM_SEED_DRAIN_PER_SEC` 2.5;
  - `SEED_GAP_TO_TARGET_BLOCKS` 1; the WALL behind a seed is `WALL_MIN_BLOCKS`;
  - `BEAM_SEED_ODDS` (04 §3.4);
  - `TRACE_BOARD_AT` 3, `TRACE_CELLS` 3, `BOARD_MIN_DEPTH` 4, `SEEDS_MIN_DEPTH` 3, `PRE_FINAL_ROOT_CAP` 14;
  - `SEED_WORDS_PER_SHIP` 1.
- **Driver damage tuning** (`· OPENING`): `DRIVER_ROLLED_MIN` 55 and `MAX` 79, `DRIVER_ROLLED_PER_PODS` 5, `DRIVER_FAILING_MIN` 30 and `MAX` 45, `DRIVER_FAILING_FROM_LAYER` 4. Each takes its WHY from 01 §3.8.
- **Seed targets** (`seedTargetsOf`): the packed infectable files, weighted by size. Never the Core, REPAIR CHARGE, a FIREWALL or `046.log`. Engine I/O and Nav Plotter are also excluded (risk 4). When no target has room, the no-room rule (04 §3.4) applies.

---

## 5. Work breakdown

### 5.0 FOUNDATION (one agent, one commit, first; typecheck green)

1. **Types:**
   - `src/types/threat.ts` (§2.2);
   - schema.ts: `RunState.threat` and `RunState.log`, `HollowState.calmAiSec`, `ArrivalReport.seeds/boarded`, `TransitPlan.threat`;
   - segment.ts: `beam`, `words`, `Infection.beam`, `'log'` and `LogSegment`;
   - `'log'` added to the exhaustive switches (`type-labels.ts`, `skills.ts`, `draft.ts`, `sidebar-filters.ts`), to `isInfectable` (false), to `tool-targets` refusals (`IT ISN'T YOURS TO DELETE` and the move and copy equivalents), and to `dropLock` (`'log'`).
2. **Data:**
   - `src/data/threats.ts`, with the five defs moved verbatim from ships.ts plus the new ones;
   - ships.ts per §4: `layer`, `threat`, layouts, licences, `drivers.damage`; HALCYON's arrival damage `{ role: 'sensor', maxIntegrity: 62 }` (risk 10); validators updated, including the removal of "every ship has a root" and "verbs only on the flagship"; the verbs check now reads stage `finale` at the final role;
   - memory.ts: the `S` token, the `root` parameter of `buildShipMemory`, `046.log` in `FRESH_UNIT_RACK_F` (free 25 → 23).
3. **Pure and implemented, because initial.ts needs them:** `planThreat`, `boardsOnBeam`, `stageForAge`, `rootBlocksFor`, `nominalRunThreat`. initial.ts: `createRunState` gets `threat: nominalRunThreat(shipIndex)` and `log`; `createShipSlices` plans the ship's threat, so the root and the cfg come from it (`createHollowState(cfg)`). `debug.ts`'s warp uses the nominal threat.
4. **Stubs with final signatures:**
   - `rollBeamSeeds` returns `[]`;
   - `tallyBeamBorn` is implemented (one line);
   - `driverArrivalDamage` returns the written list;
   - `logEntriesAtBoot` is implemented;
   - story-log's mount is a no-op.
   - New events in events.ts: `seed-landed-beam`, `seed-deleted`, `trace-changed`, `hollow-boarding`, `hollow-boarded`, `log-key`, `log-scanned`, `last-rm-lost`.
5. **Text banners** with final strings where the specs give them:
   - threat-text.ts;
   - log-text.ts (entries 01, 02 and 12 verbatim from 05 §3.12; 03, 04, 10 and 11 drafted from the outlines and marked for 05's owner);
   - the glyph removed from `LANDING_LESSONS` (the 1b rule: the strip draws ◆).
6. **Wiring:**
   - script.ts imports `THREAT_RULES` (empty) into `GUIDE_RULES` beside `SEED_RULES`'s slot;
   - `bootLinePlan` knows `'seeds' | 'board' | 'log'` (emitted only when the arrival or log says so; empty until the tracks);
   - boot.ts emits `hollow-boarded` when the `board` line is said;
   - the three tuning sub-blocks are created.
7. **`tests/unit/KNOWN-FAILING-slice2.md`:** each suite red after the foundation, with its owning track.
8. **Playable after the foundation:** ships 1–2 calm; KESTREL without seeds; VESPER with a 10-block root and the folded def (its story still plays as ARRIVAL until THREAT lands); LAST LIGHT as before.

### 5.1 Track THREAT (seeds, rm, TRACE, boarding, re-keying, the finale's deal)

**Owns:**
- `src/systems/hollow.ts`, `hollow-deal.ts`, `hollow-verbs.ts`, `finale.ts`;
- `threat-plan.ts`, `beam-seeds.ts`, `carry.ts`;
- the threat parts of `run.ts` (`endShip`, `goTransmit`, `transmitNext`), `pace.ts`;
- `src/data/memory.ts`, `threats.ts`, `hollow-text.ts`, `threat-text.ts`, `threat-rules.ts`;
- `src/state/threat-selectors.ts`.

**Delivers:**
- the calm-only wake;
- beam-born propagation;
- the seeds-only alerts (`SEED NEXT TO TELEMETRY`, holding SKIP);
- the seed words on delete;
- `'arrives'` in `decideScript` and the story;
- `keepCharge` moved;
- the deal fold, with verbs paused while it is offered or paused;
- the TRACE tally and feeding in `endShip` (also on the loss path);
- the seeds in `Packet` and `layoutCarried` (the root already lands from `TransitPlan.threat.rootBlocks`; review follow-up M5);
- the last-rm detection and `last-rm-lost`;
- the no-rm seed line;
- dev helpers `__ap.seed(target)` and `__ap.board()`.

### 5.2 Track OPENING (calm ships, damage, lessons, tutorial, the log)

**Owns:**
- `src/data/ships.ts` (after the foundation; THREAT's data requests go through OPENING or the lead);
- `driver-damage.ts`, `landing-text.ts`, `log-text.ts`;
- `src/data/script.ts` (lessons, beats, the boot plan, the SCAN `???` rule; ship 1–2 HOLLOW beats removed);
- `licences.ts`, `boot.ts`, `story-log.ts`;
- `meta.ts`'s ghost: run 2+ still types the ghost at ship 1's boot but no longer calls `nameHollow` (risk 11).

**Delivers:** §1.1 items 9–15, `hurtDriversFor` calling `driverArrivalDamage`, and §3.

**Last task, after THREAT merges:** re-fly the whole-run suites (§6.2).

### 5.3 Track UI (TRACE, chips, seeds, the moment, the reader)

**Owns:**
- `src/components/**`;
- `src/systems/hollow-hud.ts` (adds `traceMeter(state)`; `biteClock` for calm-only wakes: the calm countdown frozen at TACTICAL, never jumping);
- `transmit.ts` (chips: the uninvited `???` chip, `046.log · 3/12` locked and glowing while unread, `NO RM · YOU CAN'T DELETE THE ROOT`, the TRACE line);
- `glitch.ts` triggers, `audio.ts` and `audio-cues.ts` (`seedLand`, `hollowBoard`, the `transmitSweep` stutter);
- `src/styles/**`.

**Delivers:**
- the TRACE meter in the MIND header, the mini-HUD and the LANDING REPORT;
- `HollowPainter`'s ECC-named seed look;
- `DetailPanel` for the log and beam seeds;
- `SegmentBlock`'s `log` chip;
- `LogReader.ts`;
- `Stamp.ts` for `LAST rm DELETED`;
- the boarding shake and tear on `hollow-boarded`.

### 5.4 Shared hot files

| File | Owner after the foundation | How the others add to it |
|---|---|---|
| ships.ts | OPENING | requests in the PR; the lead applies at merge |
| script.ts | OPENING | THREAT's rules live in `threat-rules.ts` (already spread) |
| hollow.ts | THREAT | none |
| tuning.ts | each track | only its own sub-block |
| landing-text.ts | OPENING | none |
| hollow-text.ts | THREAT | none |
| run.ts | THREAT | OPENING reacts to `phase` changes in story-log, so it needs no edit |
| state/actions.ts, systems/fs-tools.ts | THREAT | THREAT emits `seed-deleted` and `last-rm-lost` there; others request changes through the lead |
| data/driver-damage.ts (with `hurtDriversFor`) | OPENING | memory.ts re-exports `hurtDriversFor`; THREAT does not edit it |
| state/threat-selectors.ts | THREAT | UI reads it (`tallyPreview`, `traceCells`, `noWorkingRm` …); requests through THREAT |
| initial.ts, schema.ts, events.ts, types/threat.ts | FOUNDATION | additions after it go through the lead |

**Merge order:** THREAT, OPENING, UI.

---

## 6. Tests

### 6.1 New suites (fast)

| Suite | What it covers | Time |
|---|---|---|
| `threat/plan.test.ts` (pure) | 04 §3.16's routes A, B and C as `ThreatInput` sequences; the boarding conditions (never below depth 4, forced one hop out, never on the final beam); the fold rules; stage → def; root sizes and the cap; the deal fold; `nominalRunThreat(0..4)` | about 1 s |
| `threat/beam-seeds.test.ts` (pure, plus one store) | the roll by noise; targets (exclusions); the layout behind the target (GAP 1, WALL 4); the no-room rule; ride-free; the calm-only clock; rm in 2 s; beam flags through bite → consume → pack; the TRACE tally and feeding | about 3 s |
| `threat/arrival-story.test.ts` | VESPER from a constructed lock (`lockOn` in harness-landing), not a flown approach: silent until the loop closes, the scripted bite, the fight, `...047?`, the 25 s timer, the naming, `keepCharge`; plus LAST LIGHT's deal with verbs waiting | about 8 s |
| `opening/calm-ships.test.ts` | ships 1–2 have no hollow block; driver damage per layer, seeded and stable; the lessons; SCAN `???`; log keys; the first-landing checklist | about 5 s |
| `ui/threat-models.test.ts` | `traceMeter`, chips, `biteClock` calm-only, the reader's rows | about 1 s |

### 6.2 Existing suites

**Delete:**
- `wp7/halcyon-story`, whose content moves to arrival-story;
- `wp7/run-flow`, `wp9/run-flow` and `wp10/run-flow`, folded into `wp11/full-run`'s per-ship checks. That saves about 19 s.

**Re-key.** Pure HOLLOW rule fixtures that relied on ARES-VII's root (`wp6/hollow-unit`, `edges`, `p2-echo`, `p2-hud`, `hollow-ship2`, `lines`) use a new helper, `tests/unit/support/hollow-world.ts`. Its `plantRoot(memory, addr, blocks)` recreates the old `R P P P` geometry, so their assertions barely change. `cfg` comes from `HOLLOW_STAGES[stage]`.

**Rewrite:**
- `wp6/hollow-sim` and `wp6/follower` → the calm ship-1 follower;
- `lead1/story` and `lead1/fix1/story-landing` → story timing on VESPER's arrival;
- `wp10/deal-test` → LAST LIGHT's folded deal;
- `wp10/copy-test` → its near-tools part becomes a HUNT-stage pure test; its COPY licence part stays;
- `wp10/vesper-flow` and `vesper-sim` → HOLLOW asleep until the capture, plus the root slot;
- `final-fix/seed-spots` → the VESPER part becomes the HUNT stage;
- `wp9/seed-test` → the walls part stays for FINALE;
- `wp11/boss-sim` and `lastlight-sim` → re-measure with the deal and the rolled hurt drivers; keep sampling;
- `wp8/ghost` and `wp8/run-flow` → no naming at ship 1;
- `wp5/layout`, `landing/flow` (ships 1–2 report without a story wait), `landing/hollow-landing` (on VESPER), `wp7/carry` (`046.log` takes 2 link blocks and moves charge numbers).

**Triage by running:** `wp2/*`, `wp12/fix1` and `p3/minors`, `wp9/fix1` and `fix2`, `wp10/fix1`, `wp8/fix1`, `landing/review-fixes`.

**`wp12/playthrough`:** stays INFO-only; update its kids (rm the seed, refuse the deal on LAST LIGHT).

**Budget:** new suites total about 18 s against about 19 s deleted. boss-sim and lastlight-sim must stay under 90 s each by sampling. Target: 160–175 s wall on 4 workers, well under 300 s.

**e2e (once, at the end):**
- `playthrough.mjs`: ships 1–2 calm; KESTREL's `RM THE SEED`; VESPER's boarding; LAST LIGHT's DEAL buttons.
- `run-flow.mjs`: its steps 4–5 (HALCYON's wake and naming) move to VESPER via `?debug` warp `__ap.ship(3)`.
- `phone.mjs`: drop the "POD 01 scripted bite cured" step (line about 329).
- Add checks for the boarding chip and the TRACE cells.

---

## 7. Risks and open questions (each with a recommended answer)

1. **Are ships 1–2 tense enough for a 12-year-old with no adversary?**
   - Ship 1 keeps the crash course, the FAULT, POD 02, the `???` and the loud first landing. Ship 2 keeps the flyby, the split, a wide dot and a charge trade (01 §2 "why ships 1–2 are fun").
   - The weak spot is HALCYON's MIND: one degraded driver and the sensor.
   - **Recommend:** keep the spec, guarantee HALCYON's sensor at 62 (risk 10), and make "something every ~20 s" (pillar 5) a playtest check.
   - The lever if it is flat is 04 §3.2's debris ship at depth 2 (slice 3 places it). Report to Fran with the slice.
2. **Does boarding at VESPER leave enough HOLLOW before the finale?**
   - VESPER teaches the ghost thrust and SWAP, COPY, HOLLOW's bite, the walls and the naming.
   - LAST LIGHT then adds four first-time mechanics: its seeds in your walls, THE DEAL, the verbs and the duel.
   - This decided item looks like it hurts gameplay on a 5-ship run.
   - **Recommend:**
     - (a) no beam seeds into VESPER or LAST LIGHT in slice 2 (noise 0);
     - (b) verbs wait on the deal;
     - (c) MOVE's licence moves to KESTREL, so MOVE is known before VESPER's walls;
     - (d) raise with Fran, with boss-sim and full-run numbers, a fallback lever: on a final ship where HOLLOW's age is 2 (one ship before it), the FINALE drops its own wall seeds, since verbs, THE DEAL and the duel are enough. Do not change it quietly.
3. **TRACE has no mechanical effect in slice 2.** The boarding at VESPER is forced either way, and the final root is fixed at 16. **Recommend:** accept it (the rm lesson stands on its own as a bite tax), word the report honestly (`THEY REPORT HOME`), and tell the playtest not to judge TRACE's tension until slice 3.
4. **The first beam seed's target.** 04 only excludes the Core, charge, FIREWALLs and untried tools. A seed eating Engine I/O strands the ship, and eating Nav Plotter means no drop solution. **Recommend:** also exclude Engine I/O and Nav Plotter (the verbs' protected list), script run 1's seed next to Telemetry (it garbles; it is not fatal), and report this deviation.
5. **The `???` collision.** The `???` file and HOLLOW's unnamed `???` would both be on screen at VESPER. **Recommend:** the log reads `046.log` once scanned (taught on ship 1). If it was never scanned, it becomes `046.log` at the first key found (HALCYON's boot).
6. **`keepCharge` versus the silent boarding.** 05's trigger, the first boot one hop from a final ship with HOLLOW aboard, is exactly the boarding boot, where 04 says it is silent. **Recommend:** on a ship where HOLLOW just boarded, `keepCharge` is the last beat of its naming story, in landing. It is still one ship before MERGE.
7. **`046.log` costs 2 link blocks.** That shifts carried charge and the exact numbers in the suites. **Recommend:** accept (05 M5); update the carry and transmit suites.
8. **Interim keys.** Entries 05–09 are never read in slice 2. Entries 03, 04, 10 and 11 exist only in outline. **Recommend:** OPENING drafts them (at most 3 lines of at most 70 characters) and flags them for 05's owner; the reader shows 05–09 as `[NOT FOUND YET]`.
9. **Hurt drivers beside the root.** **Recommend:** never roll damage on the drivers flanking the slot or on the lead; boss-sim re-measures LAST LIGHT with five hurt drivers. The lever is the final ship's hurt count.
10. **HALCYON's "62" is only a seeded roll today.** **Recommend:** scripted arrival damage `{sensor, 62}` on HALCYON, as KESTREL has, so ship 2's lesson is guaranteed.
11. **Run 2's ghost names HOLLOW at ship 1, where it no longer is.** **Recommend:** keep the ghost line at ship 1 (05's per-layer placement is slice 3) without the naming. ARRIVAL's line is `remembers` when a ghost spoke this run.
12. **COPY's lesson loses its trigger** (VESPER's near-tools seeds are gone). **Recommend:** keep COPY at VESPER's boot and re-key the lesson to "a hollow block's reach or a seed is beside a filesystem tool with no spare". Never use a `NEEDED FOR THE FINALE` tag (round 3, 9).
13. **The DEAL and the verbs at once on LAST LIGHT.** **Recommend:** the verb clock stands still while the offer stands and through `DEAL_PAUSE_SEC`, as the seeds already do.
14. **Harnesses and the warp build later ships alone.** **Recommend:** `nominalRunThreat(shipIndex)` everywhere. `freshUnitRacks(ship)` lays out no beam seeds by default (the flight sims stay seed-free); the run-flow suites carry real packets.
15. **DESIGN.md "The reveals" and the ships table, and AGENTS.md "What's built", describe HOLLOW on ship 1.** **Recommend:** the lead updates them at wrap-up, not the tracks.

### Critical Files for Implementation
- /home/user/ArrivalProtocol/src/systems/hollow.ts
- /home/user/ArrivalProtocol/src/data/ships.ts
- /home/user/ArrivalProtocol/src/systems/carry.ts
- /home/user/ArrivalProtocol/src/data/memory.ts
- /home/user/ArrivalProtocol/src/data/script.ts

---

## Deviations (foundation)

The foundation (§5.0) as built, where it differs from §2–§5 or fills a gap the plan left open. Each item has its reason.

**Types and module seams**

1. **HollowDef and its parts live in `src/types/threat.ts`**, not `data/ships.ts` (`HollowDef`, `HollowWake`, `SeedTarget`,
   `HollowStoryKind`, `VerbDef`, `SeedDef`), and **`validateHollowDef` moved to `data/threats.ts`**; ships.ts re-exports
   both, so phase 2's imports still work. Why: ships.ts now imports threats.ts (the flagship check reads the FINALE
   stage), and threats.ts needs the types; with the types in data/ships.ts the two data modules would import each other.
   Validator messages read `HollowDef <id>: …` (they used to read `ShipDef <id> hollow: …`).
2. **`HOLLOW_STAGES[stage]` is `{ hollow, rootBlocks }`** (`HollowStageDef`), so re-keyed fixtures read
   `HOLLOW_STAGES.walls.hollow`. `validateHollowStages` runs at load: every def passes the drain rule, roots grow stage
   by stage, nothing before the finale is over `PRE_FINAL_ROOT_CAP`, and the verbs are the FINALE's alone (this replaces
   validateShipDef's old "verbs only on the flagship").
3. **`rootBlocksFor(stage, folded, fed)`**: the folded stages are an argument (04 §3.9: "a folded ship uses the larger
   stage's root"). The FINALE returns its own 16 whatever it was fed. Slice 7 appends `traces`.
4. **`run.threat` is the state DURING a ship**: the ship's verdict is applied as it starts. `threat-plan.ts` adds
   `createRunThreat`, `fixedShipFacts(index)` (the fixed five's depth, final and M3 facts: slice 3's map replaces it),
   `threatInputFor(prev, facts, dealDone)`, `applyThreat(prev, plan, depth)` and `nominalShipThreat(index)`, next to
   `nominalRunThreat(index)`. Why: `RunThreatState.age` counts the current ship (§2.2), so the next ship's input is read
   from the previous ship's state after its tally. Re-planning from run.threat inside `createShipSlices` would count
   the same ship twice.
5. **The verdict is passed in explicitly, not re-planned when the ship is built**:
   - `createShipSlices(run, carried, threat)`;
   - `WorldReset.threat`;
   - `startShip(store, index, carried, arrival, threat)`, which applies the verdict to run.threat;
   - `createInitialState({ threat? })`, defaulting to `nominalShipThreat(shipIndex)`, with run.threat =
     `nominalRunThreat(shipIndex)`.

   **`goTransmit` already computes `TransitPlan.threat`**, using `run.stats.deal !== null` as dealDone, and
   `transmitNext` builds the next ship from it. The simulation retry rebuilds ship 1 with `nominalRunThreat(0)`.

   THREAT's `endShip` tally then feeds the next ship's plan with no further plumbing.
6. **`ArrivalReport.boarded` is filled now**, from the verdict (`boardedBy(threat)` in run.ts, used by `transmitNext` and
   the debug warp). `seeds` stays `[]` until THREAT. Why: the root is already laid out from the verdict, so a boot that
   didn't say so would describe a different world than the strip. VESPER's boot therefore types the 108% line and emits
   `hollow-boarded` today; the shake, tear and cue are UI's.
7. **`layoutCarried(packet, chargeBlocks, ship, threat)`**: the hunting gap reads `threat.hollow.seed?.target`, not
   `ShipDef.hollow`. `freshUnitRacks(ship)` lays out for `nominalShipThreat` of the ship found by id. On the fixed five
   no ship hunts any more (VESPER plays ARRIVAL + WALLS), so the gap only appears where a fixture gives a ship the HUNT
   stage (landing/review-fixes issue 5 does).
8. **`Packet` is unchanged.** `seeds` is THREAT's to add along with the code that fills them; adding an empty field now
   would only move the work. (Review follow-up M5: `Packet.root` is struck from the plan altogether.)
9. **`LogSegment.id` and `.size` are typed `string` and `number`**, not the literals `'log046'` and `2`. Why: phase-2
   code and tests copy a `Segment` with a new id or size (`{ ...gap, id, size }`), which fails to type-check over a
   union that holds literal ids. `LOG_FILE` fixes the values, and `name` keeps its `'???' | '046.log'` literal.
10. **`isUnitFileType` includes `'log'`**, so 046.log packs, carries and costs 2 link blocks (risk 7). It packs into rack
    F after the fs-tools and FIREWALLs, before REPAIR CHARGE. In the fresh rack F it sits between Scan and the charge
    (free 25 → 23), so licences still land beside the charge. `DropLock` gains `'log'`, and its chip note is
    `LOG_TEXT.packetLock`. `HealthSegment` excludes `'log'`, which has no integrity and so is never infectable or hit in
    transit.
11. **SCAN works on 046.log already.** `tool-targets` lets SCAN target it, and the op emits `log-scanned` and echoes
    `LOG_TEXT.scan(found)` (`046.log · origin UNIT-046 · 12 entries · 0 found`). The rename, CONTROL's line and
    `run.log.scanned` are story-log's (OPENING), on that event. DELETE, MOVE, COPY and REPAIR refuse it with
    `TOOL_REFUSAL.logDelete` and its siblings (`IT ISN'T YOURS TO DELETE` …).
12. **The events' payloads** (none were given): `seed-landed-beam {segId, targetId}`, `seed-deleted {segId, beam, words}`,
    `trace-changed {from, to}`, `hollow-boarding` / `hollow-boarded {blocks, cause}`, `log-key {entries}`, `log-scanned`,
    `last-rm-lost`.
13. **The `S` slot** is a zero-block token. With a root, `placeRoot` turns it into the root and takes the root's blocks
    off the slot rack's trailing free. Without one it is dropped, and the flanking GAPs merge into plain free space.
    Several rules guard it:
    - at most one slot per ship (`rootSlotRack`);
    - a root with no slot throws;
    - `validatePodRacks` checks the slot rack's trailing free is at least `maxRootFor(ship)` (`FINAL_ROOT_MAX_BLOCKS` 18
      on the flagship, `PRE_FINAL_ROOT_CAP` 14 elsewhere), and leaves that root out of the 40-block margin (LAST LIGHT:
      61 − 18 = 43, 04 §3.10's number);
    - `lastPodRackTrailingFree` subtracts `maxRootFor` when the slot is in the last rack.

    **The `R` token stays in the parser** for test fixtures, but a ShipDef may not write it: validateShipDef builds every
    ship with no root and, where it has a slot, with its largest root, and checks the root count each way.
14. **validateShipDef's other new checks**:
    - the flagship must have a slot;
    - a ship with `oneHopFromFinal` must have a slot, because HOLLOW is forced aboard there;
    - `layer` is a whole number ≥ 1;
    - a scripted beam-seed source names at least one seed;
    - `atFirstSeed` needs `beamBringsSeeds(ship)` or another moment that issues the licence. The ladder decides HOLLOW's
      own seeds per run, so only the beam can be checked at load.
15. **`CALM_DEF` drains at the seeds-only rate** (2.5 %/s, ×2 / ×1.5) rather than some arbitrary positive number. Why:
    `validateHollowDef` wants a positive drain, and an infection carried into a calm ship (04 §3.5 "infection travels")
    should keep draining at a believable rate.
16. **Nothing wakes with no hollow block in memory** (`woken()` in hollow.ts), and `'never'` never wakes. Why: KESTREL's
    seeds-only config has a timed wake, and until THREAT lays out beam seeds there is nothing to bite; a wake would
    start a NEXT BITE clock and a phase change for nothing. This is the plan's "stepHollow is a no-op" made explicit.
    `calmOnly` is typed and `HollowState.calmAiSec` starts at 0, but the clock is THREAT's: until it lands, a calm-only
    wake counts plain AI seconds.
17. **THE DEAL's fold is live on LAST LIGHT now**: `cfg.deal = true` when `run.stats.deal === null`, per the ladder. Phase
    2's deal code therefore runs on the final ship today. The verbs don't wait for the deal yet; that is THREAT's (risk
    13).
18. **VESPER's folded def runs phase 2's ARRIVAL code**:
    - silent until the loop closes;
    - the scripted bite on POD 09, and the bite timer starts at 25 s;
    - `> ...047?`;
    - then dormant.

    `'arrives'` keeps biting after the fight and names itself only once THREAT teaches decideScript.

**Data**

19. **Leads**: HALCYON's stays POD 05 and KESTREL's POD 10, though neither has a root to sit beside now. VESPER's becomes
    POD 09 (GAP 1), as §4 says, and LAST LIGHT's stays POD 12.
20. **KESTREL's MOVE is `atCoast` only** (`afterAiSec: null`). If the coast never comes, the next ship's start issues it,
    as every timed licence's does. DELETE is `afterAiSec: 0`.
21. **REPAIR's licence also comes at the start of any ship the unit was transmitted to** (`licences.ts` `REPAIR_RULE`,
    `run.arrival !== null`; a later ship built alone in a headless world keeps the old rule).
    Why: in phase 2, ship 1's scripted bite raised a mind alert that guaranteed REPAIR there. With ships 1–2 calm, a kid
    who never TABbed and never got the REPAIR highlight reached KESTREL's PATH UNCERTAIN with no REPAIR. The headless
    full-run kid did exactly that, and spun for 445 s. This is the same rule the ship-timed licences already follow
    ("a later ship never lacks a tool it expects"). OPENING owns licences.ts and may tune it.
22. **The driver-damage stub returns the written list**, and `hurtDriversFor` is unchanged. So in the foundation the
    rolled ships (HALCYON, KESTREL, VESPER, LAST LIGHT) arrive with no hurt drivers, HALCYON's sensor at 62 is its only
    scripted damage, and ARES-VII keeps POD 02 at 44.

**Text and wiring**

23. **Interim key lines**: `LOG_TEXT.keyFound(entries)` takes a list, so the final ship's two read `ENTRIES 10–11`.
    `bootLinePlan` emits `'log'` for `logEntriesAtBoot(shipIndex, flagship)` minus `run.log.found` (corrected by the
    review follow-up, M1: the first version waited for story-log to mark them found "at the world reset", which depended
    on tick-listener order). boot.ts emits `log-key { entries }` as the line is said, and story-log marks them found on
    that event. Plan order: `board|unpack, host, ecc, seeds, scripted, charge, overflow, skill, log, hollow`. `bootHollowLine` reads
    `state.hollow.cfg.story`, not the ShipDef.
24. **`mountStoryLog` is already mounted** in main.ts after mountRun, so OPENING never edits main.ts for it.
25. **Text placement**:
    - `SEED_WORDS_MAX_CHARS` (40) and the seed-words pool live in threat-text.ts, validated at load. Four lines are 05's;
      eight are drafted and marked TODO(05).
    - `LOG_TYPE_LABEL` lives in log-text.ts.
    - log-text validates at load: twelve entries, at most 3 lines of at most 70 characters each.
    - Entry 01's `36` is templated (`LogVars.charge`). log-text can't import memory.ts, which imports it.
26. **Not created by the foundation** (§5.0 does not list them): `src/state/threat-selectors.ts` (THREAT) and
    `components/memory-view/LogReader.ts` (UI). `src/data/threat-rules.ts` exists with `THREAT_RULES = []`, spread just
    before `SEED_RULES` in `GUIDE_RULES`.
27. **The optional "largest infectable file ≤ 12 blocks" guard** (§2.4) is not added.

**Tests**

28. **`tests/unit/support/hollow-world.ts`** has `phase2HollowOf(index)` (phase 2's ship-n HollowDef, now a stage) and
    `PHASE2_STAGE_OF_SHIP`. THREAT adds `plantRoot` there.
29. **Tests touched only to compile** against the new signatures: `buildShipMemory`'s root, `layoutCarried`'s threat,
    `startShip`'s threat, `createHollowState(cfg)`, `ArrivalReport.seeds/boarded`, `drivers.damage`, and
    `ShipDef.hollow → phase2HollowOf`. Their assertions are untouched, and KNOWN-FAILING-slice2.md lists the ones that
    now fail.
30. **landing/review-fixes passes again**:
    - its HOLLOW sections fly VESPER instead of HALCYON and ARES-VII;
    - its deal sections give VESPER the HUNT config;
    - issue 5 builds VESPER with a HUNT verdict.
31. **wp11/full-run fails fast**: a pass of its per-seed loop that changes neither the ship, the phase, the flight status
    nor the finale phase ends the seed. It used to repeat its maxWall waits up to the guard.

### Deviations (foundation, review follow-up)

An independent review of 21eb1e6 checked the ladder against 04 §3.16's routes A, B and C and the fixed five, and found
it correct. These are its fixes to the hand-offs between the tracks.

1. **`hurtDriversFor` lives in `src/data/driver-damage.ts`** (OPENING's), and memory.ts re-exports it. It now counts the pods
   from the LZ counts (`validatePodRacks` checks they equal the drivers) rather than `shipPodCount`, so driver-damage.ts
   imports memory.ts and ships.ts for types only and the re-export makes no runtime cycle. initial.ts imports it from
   driver-damage.ts.
2. **The LOG READER is opened through UI state: `ui.logReader: { entry: number } | null`**, alongside the other
   UI-state fields (`pendingPlacement`, `activeTool`). An event was the alternative; the field was picked because the
   reader's open state must survive across ticks and be readable by headless tests, and a world reset closes it
   (`createUiState`). The actions are in systems/story-log.ts:
   - `openLogReader(store, entry)`: a found entry only, so a wrong entry fails loudly;
   - `closeLogReader(store)`;
   - `markLogEntryRead(store, entry)`: writes `run.log.read` once per entry, a found entry only.

   story-log calls `openLogReader` for entry 01 after ship 1's report; the reader view calls the other two.
3. **The boot's 'log' line no longer depends on tick order** (M1): it is planned from keys not yet found, boot emits
   `log-key` when the line is said, and story-log marks the entries found on that event. Deviation 23 is corrected
   above.
4. **`src/state/threat-selectors.ts`** (THREAT's after this), with final signatures:
   - `beamSeedsInMemory(memory): HollowSegment[]`;
   - `tallyPreview(state): ThreatTally`: the report shows it before CONTINUE, and THREAT's endShip applies the same
     result into `lastTally`;
   - `traceCells(state): { filled; total; over }`;
   - `hollowAboard(state)`;
   - `noWorkingRm(state)`;
   - `hollowFirstFightDecided(state)`: a stub returning false, `TODO(slice2-THREAT)`.

   `tallyBeamBorn` counts `beamSeedsInMemory`. The `ThreatTally` comment says who computes it and when.
5. **`createRunState(..., threat?)`** (M3): with a fixture's own verdict, `run.threat` is `applyThreat(index ?
   nominalRunThreat(index − 1) : createRunThreat(), threat)`, so a fixture's run.threat matches the HOLLOW it is built
   with. `createInitialState` passes `opts.threat` through.
6. **The verdict carries the ship's facts** (M4):
   - `ThreatInput` and `ShipThreatFacts` gain `beamSeeds: BeamSeedSource`;
   - `ShipThreat` echoes `depth`, `isFinal`, `oneHopFromFinal` and `beamSeeds`. `isFinal` is an addition to the
     review's list, cheap and what hollow.ts's keepCharge trigger needs next to `oneHopFromFinal`;
   - `applyThreat(prev, plan)` reads the depth from the verdict and has lost its third argument;
   - `startShip` throws on a verdict whose depth is not the ship's.

   `TransitPlan.threat` now carries everything the beam does: `transmitNext`'s seed roll and the keepCharge trigger read
   it, never `ShipDef.threat`. Slice 3 replaces only `fixedShipFacts`.
7. **`Packet.root` is struck** (M5): the root lands from `threat.rootBlocks` via `buildShipMemory`, and the PACKET chip
   reads `TransitPlan.threat.rootBlocks` and the tally. Only `Packet.seeds` goes through `layoutCarried`. §2.1, §2.2 and
   §5.1 are edited to match.

**Decisions (the lead's, recorded here)**

- **`fed` stays cumulative across HOLLOW's ships** (documented on `RunThreatState.fed` and `ThreatInput.fed`): each root
  is its stage's plus everything it was ever fed, capped. The PACKET chip's `+n` is `lastTally.left`.
- **`eatenDrivers`**: THREAT fills it in slice 2, in hollow.ts where a driver is consumed, so the save schema changes once.
- **Ownership** (§5.4, updated):
  - state/actions.ts and systems/fs-tools.ts → THREAT, for `seed-deleted` and `last-rm-lost`;
  - data/driver-damage.ts, `hurtDriversFor` included → OPENING;
  - state/threat-selectors.ts → THREAT.

**Notes for the tracks**

- **THREAT:**
  - Remove the `R` token once `plantRoot` exists. It is used by five suites and by debug.ts's `HOLLOW_DEMO_RACKS`.
  - Slice 3 rule, noted now (implement if cheap): beam seeds on a plain-ARRIVAL ship run the seeds-only clock until the
    scripted fight decides.
- **OPENING:**
  - The simulation retry must reset `run.log.scanned`, or derive the displayed name from `run.log` rather than renaming
    the segment. Otherwise a renamed `046.log` survives a ship-1 restart whose log state started over.
  - Re-measure wp11/full-run's MERGE availability with `RUN_SEEDS=8` after THREAT lands. The levers are the
    VESPER→LAST LIGHT link at 98 instead of 96 (giving back 046.log's 2 blocks) or the star credit. 046.log stays paid.
- **Slice 3:** any ship at depth ≥ `BOARD_MIN_DEPTH` needs a root slot, not only `oneHopFromFinal` ones (TRACE can board
  it there). validateShipDef checks only the latter today, because on the fixed five depth ≥ 4 means VESPER and LAST
  LIGHT, and both have slots.

## Deviations (Track OPENING)

Track OPENING (§5.2) as built on branch `opening-2`, where it differs from §1–§6 or fills a gap the plan left open.

**Driver arrival damage**

1. **The root slot's neighbours come from the layout words** (`rootSlotNeighbours` in driver-damage.ts: the nearest `P`
   before and after `S`, pods numbered through racks B, C, D), so driver-damage.ts still imports memory.ts for types only.
   They are avoided whenever the ship has a slot, root or not: on the fixed five a slot always holds a root.
2. **A scripted ship on a later run keeps phase 2's reseeding**: ARES-VII's written integrity (44) moves to a random pod
   that is not the lead (v2 §5.2). Draw order is fixed (pod, then integrity, per driver), so a seed replays.
3. **validateShipDef** also checks that `drivers.damage` agrees with the written list ('scripted' has one, 'rolled' none)
   and rolls three seeds both ways to prove the roll never hurts the lead or the slot's neighbours.
4. **Later ships now arrive with a failing driver** (VESPER, LAST LIGHT: 30–45), so the run-1 `POD nn WILL LAND HARD`
   lesson can show there. On a real run it is a once-a-run lesson already done on ship 1; `harness7.shipAlone` now marks
   the driver lessons done (as `harnessState` does for ship 1). Three suites outside the known-failing list moved with the
   rolled drivers and are fixed: landing/flow (only failing drivers land hard), lead2/kestrel-debris (the debris's losses,
   not absolute integrities), wp10/vesper-flow (through harness7).

**Lessons and the tutorial**

5. **When the landing lessons show**: from the landing's start until the ship's first launch, i.e. the WAIT before the
   first window. A window's own rows are `now` and outrank a tutorial, so a lesson keyed to the open window would never
   be read. `◆ PODS LAND WHERE THE DOT IS` is run 1 only (§1.1 item 10). The split lesson shows on every run; "run 2+
   shortens" is read as its short form, the counts alone (`2 SITES · LZ-A 3, LZ-B 2`), worded by the new
   `LineVars.splitLesson`. Both are once a run, `LANDING_DOT_LESSON_SEC` and `LANDING_SPLIT_LESSON_SEC` (6 s) each. They
   come before the hurt-driver and wide-drop lessons on the strip, so landing/drop-model and landing/review-1b mark them
   done in their setups, as those suites already did with the other lessons.
6. **The SCAN `???` lesson** (`LOG_RULES`) has an amber `— [TAB]` wording and a blue one that lights the SCAN chip and
   then the file (`LOG_HINT_TARGET`, which Track UI puts on the log chip). It is a tutorial on run 1 and one hint on run
   2+, gated on POD 02 settled (`hurtPod` empty), a flight WAIT, SCAN licensed and the file not known yet. It steps aside
   after `LOG_SCAN_ASK_SEC` (8 s) and is done once the file is known. Only a SCAN draws CONTROL's line; 05 §3.5's "or a
   click on `???`" is not wired (a click is UI's; an event would do it in a later slice).
7. **"Remove the ship 1–2 HOLLOW beats from script.ts"**: after the foundation none keyed to ships 1–2 remained. The HOLLOW
   rules key on HOLLOW's state, which a calm ship never sets. Stale comments that put HOLLOW on ships 1–2 are corrected.
8. **Licences** are as the foundation re-flowed them (§3.2, Deviations (foundation) 20–21), verified by
   opening/calm-ships. Only licences.ts's header changed.
9. **The ghost's naming lived in boot.ts, not meta.ts.** It is removed there: run 2+ still types the ghost first, and a
   skip is honoured once it has typed (the 0.4 s name pause went with the naming). meta.ts is unchanged.

**046.log**

10. **The chip's name derives from `run.log`** (`logKnown`: scanned, or any key found). story-log brings the segment's
    `name` and `desc` in line every post tick. run.ts needed no edit, and the simulation retry keeps `run.log`, because
    the kid did scan it. Every carried copy follows too.
11. **Entry 01's key is "the first LANDING REPORT with a pod down closes"**: the TRANSMIT screen is up and a pod of this
    ship is down. That is ship 1's report on the fixed run, and the key still works if ship 1 landed nobody (05 keys it to
    "your first landing"). The reader opens by itself only on the tutorial run (05 §3.2 "On run 1"). On a returning
    unit's run, entry 01 is found and the chip glows (Track UI).
12. **Entry 12** needs no new event: story-log follows `hollow.finale.phase === 'choice'`. finale.ts's rootGone sets it in
    the AI tick, after `> 047. wait.`. Entry 12's three lines then type as HOLLOW's own TERMINAL lines (`> …`, 05 §3.12
    step 1), and the entry is found. Showing them on the FinaleChoice card is Track UI's.
13. **Entries 03, 04, 10 and 11** were already drafted by the foundation within the limits. They are reviewed and left
    marked `TODO(05)`. The validator also checks entry lines with the root's `> ` prefix against the 70 characters.

**Tests**

14. **`tests/unit/opening/plant-root.ts`** plants phase 2's HALCYON geometry (`P P P P _2 R _1 P _13`, the WALLS stage) for
    the three suites that test a FIREWALL or the coast-tied wake against a root there: wp8/draft, wp8/p2/ui-models and
    wp7/fix1/run-end-and-boot. It is kept out of THREAT's `support/hollow-world.ts`.
15. **wp6/hollow-sim and wp6/follower are the calm ship-1 follower now.** The follower locks with a full engine, a 40%
    engine and a thread-limited engine; nothing bites, no alarm shows, and the report comes promptly with no story.
    wp8/run-flow crashes run 1 on to LAST LIGHT, where HOLLOW eats the Core. wp5/racks leaves the log's 2-block chip out of
    its name-fit check: `???` and `046.log` don't fit a tiny chip, and the chip's own look is Track UI's.
16. **wp7/, wp9/ and wp10/run-flow** are deleted in the post-THREAT re-fly (§5.2's last task), not before.

**The re-fly, after THREAT's merge**

17. **wp7/, wp9/ and wp10/run-flow are deleted.** What they checked is now wp11/full-run's per-ship checks: 25 rules, each
    evaluated where its moment comes on every seed and reported once with the count of checks. They cover the hand-over
    (ops, memory, resets, Engine I/O hits, the charge formula, transit hits, dividers), the boot lines (ECC, charge,
    046.log keys) and each ship's beats. The beats are slice 2's, not phase 2's: ships 1–2 are calm; KESTREL has the beam
    seed next to Telemetry, the rm, the sensor and the debris; VESPER has the boarding, the SWAP and HOLLOW's fight and
    name; LAST LIGHT has THE DEAL refused. Phase 2's HALCYON naming and HOLLOW seeds, and VESPER's deal and near-tools
    seeds, are gone with their ships' stages. threat/arrival-story covers the story timing.
18. **The lever: LAST LIGHT's link is 98, not 96.** On the last crossing the link, not the charge, limits what arrives:
    the files are 82–84 blocks by then. So 046.log's 2 blocks came straight off the charge at the choice. Full-run at
    `RUN_SEEDS=8`, charge at the choice per seed (MERGE is tried on even seeds):

    | Seed | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | ≥ 20 |
    |---|---|---|---|---|---|---|---|---|---|
    | link 96 | 15 | 10 | 23 | 26 | 16 (stuck) | 12 | 28 | 18 | 3/8 |
    | link 98 | 17 | 12 | 25 | 28 | 5 | 14 | 30 | 20 | 4/8 |

    The target is met at exactly 50%. With 98, all 8 runs are victories (2 MERGE). The star credit is unchanged.
19. **harness11's defender repairs a driver too hurt to launch**, as the strip's L11 asks. LAST LIGHT's rolled FAILING
    driver (30–45) can be worn under 25 by the belt. Seed 5 used to stand in the landing for good with `POD 06 CAN'T
    LAUNCH` (the "stuck" run above). It is a victory now, and the repair is why its charge at the choice is 5.
20. **full-run's MERGE-charge and both-endings targets are checked from `RUN_SEEDS=8`**. On the quick tier's two seeds
    they are printed as INFO. Seeds 1 and 2 sit at 17 and 12, below a median of 20, so two seeds measure nothing. The
    per-ship checks, the victory rate and the reset check hold at any depth.
21. **THREAT's script.ts patches applied:**
    - `toolsHunted` reads `copyLessonDue` (risk 12);
    - the WALL lessons need `hollowAboard` (no `MOVE the drivers` on KESTREL's seeds-only wake);
    - the HUNT stage's `wants-charge` boot line is said once a run: boot.ts sets `run.threat.told.keepCharge` as it says
      it, and `bootHollowLine` skips it once told.
22. **The doubled `── VESPER ──` after `__ap.ship(3)` is by design**: `logDivider` writes one divider per screen (radio and
    mind, WP7). `__ap.log()` lists both channels, so it shows two. Each screen shows one.

## Deviations (Track THREAT)

Track THREAT (§5.1) as built on branch `threat-2`, where it differs from §1–§6 or fills a gap the plan left open.

**Beam seeds**

1. **One seed per file.** `rollBeamSeeds` rolls the count by noise (`BEAM_SEED_ODDS`), then each seed's target by size
   among the packet's targets, never the same file twice: a beam that rolls more seeds than there are targets carries one
   per target. The scripted tutorial seed (`playsTutorial(run)`) rides behind Telemetry; if the kid left Telemetry behind
   on the TRANSMIT screen it rides behind a rolled target instead. Every seed draws its words as it is rolled.
2. **`layoutCarried(packet, charge, ship, threat, owner?)`** gained the owner name for the seed segments (it throws when
   the packet carries seeds and no owner is given). `CHARGE_ARRIVAL_FLOOR` is laid out before the seeds, the charge above
   it after them (04 §3.4's FULL rule). **The no-room rule:** in the pooled receiver every target has the same room, so
   re-picking a target can never help; a seed with no room is a stray (`CarriedRacks.strays`), which `buildShipMemory`
   lands in the centre of the largest free region of the whole memory. `CarriedLayout.seeds` is what
   `ArrivalReport.seeds` reports.
3. **No seeds into a calm ship** whatever the source says (`beamSourceOf(threat)` in run.ts): 04 §3.4's "no seeds before
   depth 3" is enforced from the verdict's act, so slice 3's noisy hops into depths 1–2 need no extra rule.
4. **The calm-only clock** counts the AI seconds when the flight is not at TACTICAL (the same condition as
   `firstSeedHeld`, so `HollowStepCtx` did not grow). `settledWakeAtAi` projects a calm-only wake as `aiNow` plus the calm
   seconds left, so a countdown read from it stands still at TACTICAL and never jumps (its `hollow` argument now also
   picks `calmAiSec`).
5. **The seeds-only alert** is the existing seed alert worded `SEED NEXT TO <FILE>` for a beam seed. It holds SKIP from
   the flight's first tick until the seed is rm'd, as a phase-2 seed in reach does.
6. **The seed's words** replace the delete's own echo (`> rm seed ... OK · it said: "…"`), for at most
   `SEED_WORDS_PER_SHIP` seeds a ship, counted through `director.done` ids `seed-words-<ship>-<n>` (no schema field).
   `seed-deleted` is emitted for every seed (HOLLOW's own ones too, `beam: false`, `words: null`).
7. **The strip's RM lesson for beam seeds** is two more wordings of phase 2's `seed-first` lesson (threat-rules.ts), done
   when the beam's seeds are gone from memory; phase 2's two wordings call it done only for HOLLOW's own seeds. So the
   lesson has four wordings (final-fix/two-screens checks it). The no-rm line waits `BEAM_SEED_NO_RM_AFTER_SEC` (1 s)
   into a ship so it never flashes before KESTREL's DELETE licence is written.
8. **Slice 3's rule is built**: beam seeds on a plain-ARRIVAL ship bite on the seeds-only clock before its scripted fight
   (`stepBeamSeedsBeforeFight`, using `biteInSec`, which a plain ARRIVAL leaves unused while asleep), and stop when the
   fight begins. Their infections drain at the ship's def's rate (ARRIVAL's 2 %/s), not the seeds-only 2.5.

**HOLLOW's arrival and the stories**

9. **The scripted bite takes the nearer driver** (the smaller GAP) when both of the root's neighbours are drivers: on
   VESPER that is POD 09, the lead (deviation (foundation) 18's "POD 09" now holds; it used to take POD 08, left first).
10. **'arrives'**: no bite timer runs during the scripted fight; `decideScript` keeps HOLLOW awake and starts the 25 s timer
    there. The naming begins at the first timed bite after the fight (so the walls lesson has that bite first);
    `> i ran out…` and then `keepCharge` wait for the landing. `keepCharge` is keyed on `'arrives'` itself: the ladder folds
    WALLS into ARRIVAL only on a first HOLLOW ship one hop from a final ship, so no verdict or ShipDef is read in the
    world (the verdict is not kept in the state after the boot).
11. **The final ship's missed beats** are the notice (`> ...047?`, CONTROL) and the naming, told at its wake before
    anything else; `> i ran out…` and `keepCharge` are not (they belong to the ship before MERGE). finale.ts's
    `nameHollow` at ORBIT LOCK stays as the last fallback.
12. **`hollowFirstFightDecided`** = HOLLOW aboard, not asleep, and no scripted target still fought over.

**THE DEAL and the verbs**

13. **The folded deal is offered only while the flight is on** (a final ship's HOLLOW, `cfg.verbs !== null`): at ORBIT
    LOCK the duel opens, and a bargain then would talk over it. It is still offered by the front rule (at the wake on LAST
    LIGHT, which bites both drivers beside the root).
14. **`verbsHeld(state)`** is exported (hollow-verbs.ts): the verbs' clock and a standing countdown stand still while the
    offer stands and through an ACCEPT's pause, at any pace.

**The last rm, infections, records**

15. **The last rm** is watched after every tick of a live ship by file presence (no DELETE file left in memory, whatever
    took it), not by "working": an infected or failing rm is not deleted yet. Its echo is a `mind-sys` line; the stamp is
    UI's on `last-rm-lost`. `noWorkingRm` (no usable rm that is not infected) stays the PACKET chip's reading.
16. **A debug infect on a calm ship** (no hollow block in memory) crawls in from the left, as an infection carried in from
    the last ship does (`infectNow`, which threw before). wp7/soft-fails and wp12/p3/repair-renewed rely on it.
17. **`run.threat.eatenDrivers`** is filled in hollow.ts's consume, which also covers an ACCEPTed deal's driver.

**Tests and helpers**

18. **The `R` token is gone.** `ROOT_BLOCKS` stays (debug.ts's hollowDemo, which now writes its root through a slot, and
    the fixtures). `tests/unit/support/hollow-world.ts` has `plantRoot`, `phase2ShipOne` (ship 1's root at rack B's start),
    `phase2Ship` (HALCYON's and KESTREL's phase-2 pod racks with an 8-block root through a slot), and OPENING's
    `plantHalcyonRoot` (moved there from tests/unit/opening/plant-root.ts, now deleted). harness9's `phase2Hollow` and
    harness10's `hunt` build KESTREL's SEEDS stage and VESPER's HUNT stage for the phase-2 suites.
19. **lead1/story and lead1/fix1/story-landing** were re-keyed onto a planted ship-1 ARRIVAL rather than rewritten on
    VESPER: the timing rules are the same code on every ARRIVAL, and threat/arrival-story covers VESPER's folded story.
    **wp10/deal-test** runs the deal's mechanics on VESPER's HUNT stage (its nearer pod is POD 09 now); LAST LIGHT's fold
    and the verbs waiting are threat/arrival-story's. wp7/halcyon-story is deleted.
20. **harness11's `defend11` answers a standing deal** once its line has typed (`DefendOpts.deal`, default `'refuse'`, the
    playthrough kids' answer). wp11/full-run (OPENING's re-fly) uses it.
21. **Dev helpers**: `__ap.ship(i)` rolls the beam's seeds as a transmission does (KESTREL's Telemetry seed on run 1);
    `__ap.seed(target)` lays a beam seed behind a file (and gives a calm ship the seeds-only config); `__ap.board()` enters
    the ship again with a forced boarding's verdict (only where the ladder lets HOLLOW board: VESPER on the fixed five).
22. **The COPY lesson's re-keyed trigger** is `copyLessonDue(state)` in threat-selectors.ts (a hollow block's reach beside
    a filesystem tool with no spare, `huntedToolWithoutSpare`, or a HUNT stage's seeds); wiring it is a one-line patch to
    script.ts, which is OPENING's (requested with this track's report).
23. **`seed-landed-beam`** is emitted by boot.ts (OPENING's) as the boot's `seeds` line is said, once per seed still in
    memory, its target found behind it (`beamSeedTarget`): a three-line edit made after OPENING merged, at the lead's
    request for Track UI.

## Deviations (Track UI)

Track UI (§5.3) as built, where it differs from §2–§5 or fills a gap the plan left open. Each item has its reason.

**Modules and seams**

1. **`src/systems/log-view.ts` is new (Track UI's, the way hollow-hud.ts is)**: the pure models for 046.log's chip
   (`logChip`: `046.log · 3/12`, the glow while an entry is unread), the LOG READER's rows (`logReaderModel`), the entry a
   click opens (`logEntryToOpen`: the first found and unread, else the last found) and ↑ ↓ (`adjacentFoundEntry`), and
   the reader's own words (`LOG_UI_TEXT`). Why: §2.1 puts the rows in LogReader.ts, but transmit.ts needs the chip too,
   and a system must not import a component. The display name derives from `run.log` (scanned, or a key found, or the
   segment renamed), so it never depends on story-log renaming the segment.
2. **`src/systems/input.ts` gains the input layer `'reader'`**, above `'report'` and `'transmit'` (no track owned it; the
   change is two lines). Why: the reader opens over TRANSMIT (entry 01 after ship 1's report), and TRANSMIT's SPACE would
   otherwise send the packet behind it. SPACE, ENTER and ESC finish the typing, then close; ↑ ↓ move; M mutes.
3. **The reader pauses a live ship while it is open** (`setPaused`) and lifts only the pause it made. Why: INSPECT's READ
   can open it mid-flight, and reading must never cost a pod (the PAUSED veil stays under the card).
4. **An unread entry shows `NEW` and no text until it is opened**, then types itself once (`LOG_READER_CPS` 42); a key, a
   click or closing finishes it, and only then is `markLogEntryRead` called. The open entry keeps room for three lines while
   it types, so the card does not grow. Reduced motion shows it whole at once.
5. **`DetailActionId` gains `'read-log'`** (INSPECT's `▸ read 046.log`, glowing while an entry is new; SCAN is offered
   until the log is scanned), and main.ts runs it with `logEntryToOpen` + `openLogReader`. The PACKET's log chip opens the
   reader the same way instead of trying a drop (it is locked anyway).
6. **The strip's log chip reads `046` (or `???`) over `3/12`** in VT323, in a sealed grey with a blue edge, glowing gold
   while an entry is unread; `046.log · 3/12` whole is the PACKET chip, INSPECT and the tooltip. Why: a 2-block chip is
   about 26 px wide at 1440 and 20 px on a phone. LogReader.ts's `mountLogChips` patches it after every strip rebuild and on
   every `run.log` change (which bumps no memoryRev). Its hint target is OPENING's `LOG_HINT_TARGET`.

**TRACE**

7. **The meter is hidden until it means something this run**: TRACE above 0, a beam seed met (`run.arrival.seeds`) or in
   memory, or HOLLOW aboard with its root in memory (then `IT RIDES WITH YOU · 10 BLOCKS` from the root's size in memory,
   so the duel shrinks it). The calm ships show nothing.
8. **TRACE is on both glances of MiniHud.ts**: the blue mini-HUD card (§5.3's mini-HUD) and the amber MIND chip (a compact
   row: cells only, `ABOARD` once HOLLOW rides along). Why: the amber chip is where a kid flying the ship sees the mind.
   On a phone the mini-HUD is a one-row top bar, so its TRACE row is dropped; the MIND header right under it shows the
   meter (its note hidden). The cells are boxes in `--trace` pink, the whole line is the aria-label and title.
9. **The LANDING REPORT's TRACE line** (`reportTraceLine`, from `tallyPreview`) comes with the charge line at the report's
   last stage. A ship whose beam brought seeds and that kept none gets a line of UI text, `NO SEEDS LEFT BEHIND · NOTHING
   REPORTS HOME · TRACE ■□□`; a ship that met none has no line. With HOLLOW aboard it is THREAT_TEXT.reportFed.

**The PACKET**

10. **The uninvited chip shows whenever `TransitPlan.threat.rootBlocks !== null`** (the boarding beam and every later
    one, the final beam included), after the unit's own chips, in HOLLOW's black and pink static, outside the bar. Its owner
    is `hollowLabel(run)` (`???` until it named itself); its `+n` line is `lastTally.left` when `lastTally.fed`. The
    `transmitSweep` stutter plays only when `threat.boards !== null`. TransmitScreen reads the model, so UI does not need
    the `hollow-boarding` event.
11. **The PACKET's TRACE line**: on a boarding beam `TRACE ■□□ · HOLLOW WILL FIND YOU ON THIS BEAM` (THREAT_TEXT.willFindYou,
    the map card's line, early); none on a beam HOLLOW already rides (its chip says it); otherwise the meter, with `1 MORE
    AND IT FINDS YOU` at 2; none on a run with TRACE 0 and nothing tallied.
12. **`NO RM · YOU CAN'T DELETE THE ROOT`** shows when `threat.isFinal && noWorkingRm(state)`, read from the memory being
    packed.

**Beam seeds and the boarding moment**

13. **A beam seed's look** (`.hollow-beam`): HOLLOW's black with a dashed violet edge and a violet-pink static; on a chip
    wider than two blocks its tag is `ECC` instead of its size (a 2-block chip hides its tag, as every tiny hollow chip
    does). Its tooltip names its target (`SEED · ECC · SEED NEXT TO TELEMETRY · came with the beam`). On
    `seed-landed-beam` it drops in with a flash and `SEED NEXT TO TELEMETRY` floats off it (THREAT_TEXT.seedNextTo), with
    the `seedLand` cue. Any beam-born block (one a seed made by eating) keeps the class.
14. **INSPECT on a beam seed** adds `came in · with the packet · named by ECC`, `next to` (from `run.arrival.seeds`) and
    `if left · REPORTS HOME · TRACE +1` (or `FEEDS ??? · +1 BLOCK` with HOLLOW aboard), and its own description (UI text in
    DetailPanel's `BEAM_SEED_INSPECT`).
15. **The boarding moment** hangs on `hollow-boarded`: the tear is `glitchBurst(BOARD_TEAR_LEVEL 0.6, BOARD_TEAR_MS 900)` in
    glitch.ts's driver (the phase-2 glitch overlay; no separate tear effect), the 6 px shake is Juice's, the `hollowBoard` cue
    audio-cues', and HollowPainter drops the root's slab into its slot with a pink flash, first scrolling the slot into view
    (a phone shows two racks). The cues were measured with `__ap.audio.measure`: seedLand about 5 dB under seedDrop,
    hollowBoard about level with a heavy stampHit.
16. **`biteClock` on a calm-only wake** counts `afterAiSec − hollow.calmAiSec` (no time while a dodge holds the wake). It
    depends on THREAT advancing `calmAiSec` only outside TACTICAL; until THREAT lands, calmAiSec stays 0 and the countdown
    stands at 0:30 while the foundation's wake counts plain AI seconds. VESPER's silent boarding shows `NEXT BITE ?:??` with
    no change (its scripted wake has no time).
17. **`LAST rm DELETED`** is Stamp.ts's on `last-rm-lost`, its heavy thud audio-cues'; the TERMINAL echo is THREAT's.

**Tests and styles**

18. **wp10/p2/views** checks THE DEAL's views on LAST LIGHT (`shipAlone(4)`: reached with no deal, it folds in), and the
    boot's closing HOLLOW line there (`> last ship, 047. i'm so tired.`); VESPER's boot has no HOLLOW line now (risk 6).
    The ghost and SWAP checks stay on VESPER. It passes; its KNOWN-FAILING row is gone.
19. **`tests/unit/ui/threat-models.test.ts`** (43 checks, about 1 s) builds every state directly (run.threat, run.log,
    beam-flagged hollow segments, ui.logReader, a crafted arrival report) and goes to TRANSMIT through `endShip` +
    `goTransmit`.
20. **Styles live in a new `src/styles/threat.css`** (imported after landing.css), with a slice 2 token block in tokens.css
    and modes.css (`--trace`, `--beam-seed`, `--reader-*`), so game.css is untouched.
21. **Not done (optional, OPENING's suggestion)**: FinaleChoice showing entry 12's lines under `> 047. wait.`; story-log
    types them in the TERMINAL already.

## Deviations (review fixes)

The fixes for the independent review of the merged slice (HEAD de81e30), where they differ from §1–§6 and the earlier
Deviations sections, or fill a gap. Each bug has a fast regression check built from direct state.

**M1. A seed's chain (risk 4).** In the seeds act every hollow block bit on the timer, so the block KESTREL's seed made
by eating Telemetry bit on: Nav Plotter at 120 s, Engine I/O at 264 s, the Core infected at 280 s (the reviewer's
`.tmp/review2/chain.ts`).
- `HollowDef.onlySeedsBite` (on `SEEDS_ONLY_DEF`, validated: no seeds of its own, verbs, deal or story). `bitersOf(memory,
  cfg)` gives spreadBite's `only` set (the seeds), and `hollowReach(memory, aiNow, only)` uses it, so the HUD's reach marks,
  `amberBite` and `exposedDrivers` never draw a red GAP beside an inert block. Once HOLLOW is aboard `bitersOf` is null:
  phase 2's chain, unchanged. `stepBeamSeedsBeforeFight` (HOLLOW aboard, plain ARRIVAL) is unchanged for the same reason.
- The eaten block stays beam-born, so it reports home (a seed that ate reports twice). A new strip lesson
  (`beam-eaten`, two wordings, mind-urgent, once, `SEED_LESSON_SHOW_SEC`): `THE EATEN BLOCK REPORTS HOME TOO — DELETE it`,
  once no seed is left and DELETE is in hand; it lights the block (`BEAM_EATEN_HINT_TARGET`). INSPECT on such a block
  shows the `if left` row too.
- Checks: threat/beam-seeds (400 AI s more with the seed ignored: Nav Plotter, Engine I/O and the Core intact; no reach
  from the eaten block; after the rm it still bites nothing and still counts; the strip line and its DELETE). The probe
  now ends with Telemetry eaten and nothing else.

**M2. LAST LIGHT's deal and the duel.** An ACCEPT near ORBIT LOCK held the verbs (and bites and seeds) for its 60 s into
the duel, and an offer standing at the lock kept its buttons beside FinaleChoice.
- On a ship with verbs `dealLive` is false off the flight: the lock withdraws a standing offer silently ('invalidated').
  The deal's AI tick ends an ACCEPT's pause at the lock (`pauseUntilAi` = now). `verbsHeld` holds for the deal only on the
  flight.
- **The first verb's lesson (chosen: play it at the first verb after the lock).** `verbTelegraphs` counts telegraphs, so
  the ship's first verb counts from `firstTelegraphSec` wherever it comes, and in the duel its extra second pushes the next
  verb back (the existing rule). Its clock stood still from the offer (at the wake), so it comes a full `everySec` after
  the lock, or `duelEverySec` after the root's DELETE starts, never on the lock's tick under CONTROL's DELETE line. Moving
  it earlier would mean a verb under the deal's pause, which risk 13 forbids.
- Checks: threat/arrival-story (ACCEPT 10 s before the lock: the pause ends at the lock, the first verb comes in the duel
  with the 4 s count after about 12 s; an offer standing at the lock is withdrawn; the duel runs to the choice with no
  deal UI). The browser check below repeats it by the TERMINAL's ACCEPT button.

**Minor fixes**
1. **wp11/full-run quick seeds are 3 and 4** (charges 25 and 28 at the choice; seed 4 MERGEs). "Both endings were reached"
   is a check at any depth; only the median-charge target stays gated to `RUN_SEEDS=8`. `RUN_SEEDS=n` flies seeds 1–n.
2. **The PACKET's boarding line names its cause**: `TRACE ■□□ · IT FOUND YOU ANYWAY` when `boards === 'forced'`
   (`THREAT_TEXT.foundYouAnyway`), `HOLLOW WILL FIND YOU ON THIS BEAM` when TRACE did it. The meter's title says
   "Something out there is listening." until slice 3 gives TRACE its effect.
3. **Into the final ship feeding changes nothing**: the uninvited chip's `fed` is 0 there (no `SEEDS FED IT`), and INSPECT's
   `if left` row is left out on the final ship (`beamIfLeftText`, reading `run.threat.current.isFinal`).
4. **Stray seeds are loose.** `ArrivalSeed.loose` (schema) marks a seed the no-room rule made a stray. The ECC line reports
   it apart by the rack it landed in (`> ECC: 1 FOREIGN BLOCK · LOOSE IN RACK D`, or `… · NEXT TO TELEMETRY · 1 LOOSE IN
   RACK D`); `seed-landed-beam` carries `targetId: null` for it, and the painter labels it `SEED · LOOSE`, INSPECT `NOTHING ·
   LOOSE`.
5. **COPY's lesson on the fixed five**: a verb that telegraphs `unlink` on Repair's last spare latches
   `HollowState.unlinkedLastSpare` for the ship, and `copyLessonDue` reads it, so the lesson follows the verb's BLOCK IT line
   (on LAST LIGHT the first verb is `unlink repair.bak`). Only Repair has a spare, and the lesson says `COPY your Repair`, so
   the trigger is Repair's alone. Check in threat/arrival-story.
6. **`run.threat.current`** (`ShipThreatNow`: oneHopFromFinal, isFinal, stage, boards) is set by `applyThreat` as the ship
   starts. That covers `startShip`, `createRunState` (every fixture), the run reset and the simulation retry (both rebuild
   it from `nominalRunThreat(0)`), so it is never stale. `keepChargeDue(state)` = aboard && oneHopFromFinal && not told;
   both the 'arrives' and the 'names-itself' stories append `keepCharge` when it is due (slice 3's seam).
7. **046.log's pure rules live in `src/state/log-selectors.ts`** (`createRunLog`, `logKnown`, `logDisplayName`,
   `logEntriesAtBoot`). There is one `logKnown(log)`; the view's extra "segment renamed" branch is gone (story-log renames
   the segment from the log). script.ts and initial.ts no longer import the mount.
8. **`startShip` checks the verdict against the TransitPlan** (`toShipIndex` and the depth) when a beam planned one; the
   fixed five's depth is no longer hard-coded there.
9. **Stale phase-2 comments** corrected in initial.ts, hollow.ts (header, scripted bite, wakes, naming, the story beats),
   finale.ts (`openRoot`'s fallback), hollow-deal.ts's header, and the HOLLOW-facing comments of types, say, events,
   audio, pace, director, landing, run, skills, hollow-hud, hollow-text, memory, script and tuning. Ship-specific flight
   comments are left alone.
10. **The SCAN lesson** is live after POD 02 is settled or once the coast has lasted `LOG_SCAN_AFTER_COAST_SEC` (20 s,
    tuning.ts WHY) with no op running, on a WAIT that does not offer ACCEPT ORBIT (lead1/fix1/stranded-blue caught the
    F11 line). `LOG_RULES` now come before `DRIVER_RULES`, so after the wait it takes the strip for its 8 s and hands it
    back to POD 02's lesson. Still missable. Check in opening/calm-ships.
11. **Nits**: threat-plan's comment moved to `hollowShip`; THE DEAL's folded HUNT is pushed onto `stagesPlayed` when the
    deal is offered (hollow-deal.ts), not when the ladder folds it in (threat/plan expects `arrival,walls,seeds,finale`
    for route C); `__ap.seed` plants inside `store.update`; the selector `traceCells` is `traceFill` (the text keeps
    `traceCells`).

**The unit tier**
- Quick-depth trims (full depth keeps the old resolution): rule4-sweep flies one kid per grid row, the kids taking turns;
  coast-skip `[44, 46]` and `[5]`; rule2-shrink ignores `[one-burn, 120, 240]`, over-trims `[-10, -1, 1, 19]`, ▼
  `[3450, 3800, 4300]`, over-holds `[0.5, 3]`; low-tank two kids at the band's foot and top, the 0.3 s kid in the band
  sweep, one short tank after 120 s; deal-test brings HOLLOW's wake to now except in its first scenario, one seed for
  ACCEPT-and-seeds and two for the unanswered offer; vesper-sim 10 and 5 seeds (its burst check now measures the bursts no
  coast end cut: with fewer seeds one cut burst moved the mean past 0.5%); boss-sim C 2 seeds.
- Measured serially, the seven trimmed suites took 177 s before and 130 s after. The whole tier, 4 workers: 255 s before
  (one failure, fixed above) and 251 s after (142 passed). The machine is noisy: untouched suites moved by ±10 s between the
  two runs (wp10/skip-through 23 → 35 s, lead2/rule4-fuel 28 → 20 s), and the summed suite time fell only 16 s. The
  reviewer's note stands: the same commits measure the same today, and the old 159 s came from a quieter machine, so the
  trims buy about 12 s of wall at 4 workers on any machine.
- `tests/unit/run.mjs` drops timings of suites that no longer exist. `tests/unit/KNOWN-FAILING-slice2.md` is deleted:
  every suite passes.

**Browser checks (ad hoc, `?debug`, Chromium)**
- KESTREL, run 1, the seed ignored for 3 minutes after a lock: Telemetry eaten at about 80 AI s, Nav Plotter at 100%,
  Engine I/O at 85% (its arrival), the Core at 100%, the hollow blocks `ate:Telemetry, seed`. No page errors.
- LAST LIGHT: ACCEPT by the TERMINAL's button, ORBIT LOCK 10 s later: the pause ended at the lock, the first verb
  (`unlink repair.bak`) telegraphed in the duel, the root's DELETE (by the strip's chips) reached the choice, and no
  ACCEPT/REFUSE button was on the page at any point after the lock.
