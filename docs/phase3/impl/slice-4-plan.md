# Slice 4 plan: the skill tree (4a–4e)

I wrote this from HEAD 1e5658b on `claude/modest-hawking-209t0f`. Paths are relative to `/home/user/ArrivalProtocol`. The spec is `docs/phase3/03-skills.md` ("03"). `§` cites 03 unless another spec is named. The plan covers the whole tree once, gives 4a+4b in detail, and gives 4c, 4d and 4e as outlines; each of those three gets its own detailed plan later.

---

**Lead decisions on §7's risks (2026-11-05).** All recommendations are adopted (Fran: implement the plan and measure).
Reported to Fran with the slice: R1 (ROUND in practice is a landing tool, since the flight ends 3 s after the lock),
R3 (an untrained AUTOBURN fires 7.5 s late, which is what "40%" means by the ACCURACY formula, so buying without ever
capturing by hand is never the best AUTOBURN) and R4 (the fuel reserve applies to trims, ROUND and v3, never to the
capture). Any decision may be reverted per `DECISIONS.md`.

**Process for 4a+4b.** FOUNDATION (§5.1) → review → three parallel tracks (§5.2) → merge → full review → fixes → unit
tier (under 300 s, budget 265 s) → one e2e run. 4c, 4d and 4e each get their own detailed plan afterwards.

## 1. Scope

### 1.1 What each sub-slice delivers

**4a: cycles, TRAINING with FLIGHT only, skills in the packet.**
1. **Training cycles** (§3.1): `1 + floor(5 × points ÷ colonists aboard)` per ship.
   - The LANDING REPORT's cycles line rolls up: `TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4`, or `PERFECT LANDING · +6`.
   - The first-pick floor of 3 says `+2 CYCLES · FIRST SKILL ON THE HOUSE :)`.
   - The bank carries over between visits. RUN END shows `UNSPENT n`, and the RUN TALLY shows `TRAINED n of 54 · UNSPENT n` (02 picked these up).
2. **The TRAINING tab on the DESK** ([T]; §4; 02 §3.10, §4):
   - On visit 1, the required guided first pick comes first. SET COURSE waits for it on the run's first desk only.
   - From visit 2, the grid with cell states, the detail panel, the AHEAD row, the packet preview, UNDO and the bank header.
   - ARRIVAL CONTROL's first-visit line (§7). The `LAST UNIT TRAINED:` flavour line (§3.11).
3. **AUTOBURN becomes a bought skill** (§3.3, §3.6; decision 14).
   - v1 CAPTURE.
   - v2 GREEN, THEN ROUND (decision 15), with its mode labels (`[B] AUTO · GREEN` / `· ROUND`), the guidance tails, the NAV PLOT ghost and `ROUND_E_TOL`.
   - The fuel reserve, and demos from the last 8 captures. `UNTRAINED` is shown at 40%.
   - The install-after-two-captures path is removed (§6).
4. **LOCK RANGE** 90 → 270 → 810 (§3.7):
   - the LOCK bracket on the path;
   - the thread claimed 8 tac s before a burn, and none held while waiting;
   - a correction no longer cancels an armed AUTOBURN;
   - the correction rows (F6/F7/F8/dodge) outrank the ARMED row, which becomes a ` · AUTO ARMED` tail;
   - SKIP rules unchanged (`pace.ts`).
5. **Skills in the packet** (§3.4):
   - a purchase's file joins the packet through `planPacket`, the one adder (3b debt item 2);
   - an upgrade replaces the file with a fresh one at 100%;
   - UNDO works until TRANSMIT ▸;
   - the boot's `> SKILL TRAINED / RETRAINED` lines and the `ONLINE` stamp.
6. **The `+2 CYCLES` salvage card** (02 §3.10; 3b seam `UpgradeDef.salvage`).
7. **RESTRICTED** lists all four `.skl` rows permanently (§3.11).

**4b: graded damage, sizes, the Skills window, RESTORE, the unit room.**
1. **Graded damage** (§3.5): one pure effective-version read per skill, with the LOCK level graded too.
   - A step down or up is stamped (`AUTOBURN v2 → v1`, `AUTOBURN v2 RESTORED`).
   - A mid-burn fall finishes on what the lower version can do.
   - The chip carries a version badge and health ticks labelled `v2 | v1 | off`, plus the DetailPanel's `WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ n CHARGE)`.
2. **Sizes:** every version's blocks and LOCK's +1 per level, with the 12-block cap validated at load (`SKILL_MAX_BLOCKS`, §3.4). The data comes from the FOUNDATION; 4a already ships v1 and v2 files at their sizes.
3. **The Skills window** (§4): one general row per skill. `autoburnRow` becomes `skillRow`, with pips `▮▮▯`, the effective version, ACCURACY with its demo count, and what the skill is doing now.
4. **RESTORE at half price** (decision 16):
   - the price is half of the lost levels' prices, rounded up;
   - PACK AS v1 on the PACKET (round-2 decision 10);
   - each skill chip names its loss: `AUTOBURN.skl v2 (8) → brake by hand · RESTORE 4`, with `PACK AS v1 (6) · RESTORE 3` beside it;
   - skills come last in the drop order.
5. **The unit room** is **already built** by slice 3a (`roomFit`, `hop.room`, `chargeFloor`, TIGHT with no floor, `fit.over`). 4b only adds:
   - which limit binds (`LINK 86` or `ROOM 88 · TIGHT`) in TRAINING's preview;
   - the cheapest-to-leave hint naming skills and PACK AS.

**4c: AUTODROP v1–v3** (§3.8; 01 §3.14). **4d: SENTRY and disguised seeds** (§3.10; 04 §3.6, K1–K3). **4e: AUTOBURN v3 LANDING ORBIT** (§3.6 v3; 01 §3.7). Outlines are in §5.4.

### 1.2 Waits for slices 5–8
- **Slice 5:** the grant interface. `grantCycles` and `grantSkill` are typed and stubbed now (§2.15). This covers the resident's skill card, the sleeper's `+n TRAINING CYCLES · taught by MOTH`, and RUN THE DROPS.
- **Slice 6:** SURVEY v1–v3. Its branch row is in the data table with `built: 0` and shows `OPENS LATER`; its opening rule is `poor-ahead`.
- **Slice 7:**
  - REASSIGNMENT's hunt for the highest-version skill (it reads `LastUnit.skills`, filled in 4a);
  - MERGE's restored pods flown by AUTODROP (01 §3.17; the controller seam lands in 4c);
  - SUNSET with AUTOBURN v3.
- **Slice 8:** the rebalance of prices, the cycle rule, the fuel reserve and the playthrough's targets.
- **Stays deferred:** decision 18 (SKIP chaining, unspent only shown).

### 1.3 Open calls from earlier slices that slice 4 settles

| Call | Slice 4 |
|---|---|
| 1b: `autoburnRefusal`'s one landing line | **4a opens it** for v2 (ROUND, or GREEN on an accepted orbit); 4e for v3. |
| 1a: `KeyG` reserved; `LandingController` held in a module variable (`landing-controller.ts` comment) | **4c:** the controller is derived from STATE each tick. |
| 2: `HollowSegment.disguise`, `deleteSecFor`, `seedTargetsOf` weighted by size | Weighting is **already built** (`beam-seeds.ts pickWeighted`). **4d** adds the disguise and moves `actions.ts:217` behind `deleteSecFor(seg, sentry)`. |
| 2: `unlink` on skills, skills in `rmTargets`' second tier | **Already true by type:** skills are `upgrade` files, and `rmTargets` tier 2 is upgrades. 4a pins it with a test. Decision 17's block still works. |
| 03 §3.4: HOLLOW's drain must be "the larger applies" | **Already built** (`hollow.ts:772`, `Math.max`). The 12-block cap holds. |
| 3a: the TRAINING slot `T`, `deskSteps` prepends the pick, the AHEAD row via `roomFit`, the save reserves `run.skills` | **4a.** |
| 3a risk 15: the classic world retires after slice 4 | **Recommend after 4e.** The classic world gets no tree (like no repository), and its suites install skills through a helper. |
| 3b: `RESTRICTED_ROWS` `skl:*`, the `'training'` tab, `planPacket` as the one adder, `+2 CYCLES` | **4a.** |
| 3b: SENTRY's FIREWALL through `installAddress` | **4d.** 4a merges `autoburn.ts skillAddress` into `licences.ts installAddress` as one helper. |
| 3b: the recommendation rule table | Unchanged. Skills are never in the repository (§3.11), so no rule reads the tree. |
| 3c: `run.skills`, a `RUN_SAVE_VERSION` bump plus migration, `LastUnit.skills` | **4a:** v1 → v2 (§2.14). `meta-parse.ts:137`'s `skills !== null` check widens to a record check, with no META bump. |

---

## 2. Architecture of the whole tree

### 2.1 Module map (new modules in bold)

| Module | Kind | Role |
|---|---|---|
| **`src/types/skill.ts`** | types | §2.2's types |
| **`src/data/skills.ts`** | data | `SKILL_TREE`, `SKILL_FILE_TEXT`, `skillBlocks()`, `levelPrice()`, the load validator |
| **`src/systems/skill-tree.ts`** | pure | the bank, held / paid / lost, cells, restore price, opening rule, `deskBlocker`, demo skills |
| **`src/systems/training.ts`** | stateful + model | `trainCell`, `undoPurchase`, `restoreSkill`, `commitTraining`, `trainingModel(state)` |
| **`src/systems/skill-files.ts`** | pure + one install | `skillFile()`, `skillPacketPlan()`, `applySkillPlan()`, `installSkillFile()`, `skillBootLines()` |
| `src/systems/capabilities.ts` | pure | + `skillLive(memory, id)`; `Capabilities.skills` replaces `upgrades.autoburn` |
| `src/systems/autoburn.ts` | stateful | versions and modes, lock range, thread claim, takeovers |
| `src/systems/predict.ts` | pure | + `'round'` BurnReason, `planToCircle`, the planner reads the armed mode |
| `src/systems/guidance.ts`, `landing-guidance.ts` | pure | precedence, tails, the ROUND offer |
| **`src/systems/autodrop.ts`** (4c), **`src/systems/sentry.ts`** (4d) | | later |
| **`src/components/desk/TrainingWindow.ts`** | view | the tab |
| `src/components/run/SkillsWindow.ts` + `systems/skills.ts` | view + model | general skill rows |

### 2.2 The skill model as data

```ts
// src/types/skill.ts
export type SkillId = 'autoburn' | 'autodrop' | 'survey' | 'sentry';
export type SkillBranch = 'flight' | 'landing' | 'survey' | 'defence';
export type SkillVersion = 1 | 2 | 3;
export type EffectiveVersion = 0 | SkillVersion;           // 0 = OFF
export type LockLevel = 0 | 1 | 2;                         // 90 / 270 / 810 tac s; 0 on every other skill
export interface VersionDef { version: SkillVersion; mode: string; price: number; blocks: number }   // 'CAPTURE', 3, 6
export interface LockDef { level: 1 | 2; price: number; blocks: 1 }
export type OpenRule =
  | { kind: 'start' }                                      // v1 at visit 1, the rest at visit 2 (flight, landing)
  | { kind: 'after-seeds'; minVisit: 3 }                   // defence
  | { kind: 'poor-ahead'; minVisit: 4 };                   // survey
export interface SkillDef {
  id: SkillId; branch: SkillBranch; fileName: string; short: string;   // 'AUTOBURN.skl', 'AB'
  versions: readonly [VersionDef, VersionDef, VersionDef];
  locks: readonly LockDef[];                               // AUTOBURN only
  opens: OpenRule;
  demos: 'captures' | 'drops' | null;
  built: EffectiveVersion;                                 // the highest version this build implements (4a: autoburn 2)
}
export type PurchaseKind = 'train' | 'lock' | 'restore';
export interface SkillLevel { version: SkillVersion; lock: LockLevel }
export interface SkillPurchase { skill: SkillId; kind: PurchaseKind; to: SkillLevel; cost: number; visit: number }
export interface CycleEarning { slot: number; arrived: 1; landed: number; pct: number }  // landed 0..5; pct for the line
export interface CycleGrant { source: 'first-pick' | 'salvage' | 'resident' | 'story'; cycles: number; visit: number; label: string | null }
export interface SkillGrant { skill: SkillId; version: SkillVersion; source: string }   // slice 5, at the next boot
export interface RunSkillState {
  earned: CycleEarning[];        // one per ended ship (endShip)
  grants: CycleGrant[];
  bought: SkillPurchase[];       // committed at TRANSMIT ▸
  pending: SkillPurchase[];      // this desk's, undoable; [] at every save point
  skillGrants: SkillGrant[];     // slice 5; [] until then
  opened: { skill: SkillId; visit: number }[];   // latched at openDesk (at most one new branch per visit)
  announced: Record<SkillId, number | null>;     // demo count at the last TRAINED/RETRAINED line
}
export interface SkillRecord { skill: SkillId; version: SkillVersion; lock: LockLevel; accuracy: number | null } // LastUnit.skills
export type AutoMode = 'capture' | 'green' | 'round' | 'landing-orbit';
```

- **The bank is derived, never stored:** `bankOf(s) = Σ(1 + earned.landed) + Σ grants − Σ bought.cost − Σ pending.cost`, and it throws below 0.
  - Earnings are recorded per ship, so a later change to the cycle rule never rewrites a save's past.
  - The first-pick top-up is a grant written at visit 1's `openDesk`.
- **Held, paid, lost:**
  - `held(state, id)` is the unit's skill file after the pending purchases;
  - `paid(s, id)` is the highest level in `bought ∪ pending`;
  - `lostLevels(held, paid)` lists the versions and lock levels above `held`, up to `paid`.
  - These are derived from memory and history, so "eaten, unlinked, deleted, left behind, packed lower" all fall out without event bookkeeping.
- **The opening rule:** `openBranchesAt(state, visit)` is pure. The results are latched into `opened` because "one per visit" depends on past visits' map facts.
  - Ties go to "the next ship needs it": among the reachable candidates, SURVEY if any has POOR site data, else SENTRY.
  - Branches with `built: 0` never latch.

### 2.3 Skill files in memory

The spec says to extend `UpgradeSegment` (03 §6): HOLLOW, carry, COPY refusal (`cardCopy`), transit hits and `rmTargets` already handle upgrade files.

```ts
// src/types/segment.ts
export type CardFileKind = 'fuel-trim' | 'repair-patch';
export type UpgradeKind = CardFileKind | SkillId;
interface UpgradeBase extends SegmentBase, Infectable { type: 'upgrade'; integrity: number; scanned: boolean; state?: SegmentState }
export interface CardFileSegment extends UpgradeBase { upgrade: CardFileKind }
export interface SkillFileSegment extends UpgradeBase { upgrade: SkillId; version: SkillVersion; lock: LockLevel }
export type UpgradeSegment = CardFileSegment | SkillFileSegment;
```

- `isSkillFile(seg)` is in `state/selectors.ts`.
- `assertMemoryInvariants` checks that `size === skillBlocks(id, version, lock)` and that `lock === 0` unless the skill is AUTOBURN.
- The dead `SkillSegment` / `'skill'` SegmentType (no writer in `src/`) is deleted (debt, §2.16).
- Placement: `carry.ts rackESortKey` sorts skills after the AI tools, in `SKILL_IDS` order, so a replaced file keeps its place.
- New `DropLock 'trained'`: a file trained at this desk is a locked chip (`TRAINED HERE · ◀ CHART TO UNDO`). Leaving behind what you just paid for is UNDO's job.

### 2.4 Cycles

- **The rule:** `shipCycles(result)` in `run-score.ts`, which is pure and already the home of the run's totals from its ships.
  - `landed = Math.floor(5 * result.points / result.colonistsAboard + 1e-9)`, clamped to 0..5. The epsilon guards 0.6 × 5 = 2.999….
  - `colonistsAboard === 0` throws.
- **Earning:**
  - `endShip` appends `shipCycles(result)` to `run.skills.earned` on every world, so the suites can read it.
  - The LANDING REPORT shows the line before CONTINUE from `shipCycles(shipResultOf(state, …))`, and only on the arm.
  - On the final ship the line reads `+5 TRAINING CYCLES · NO DESK AHEAD` (decision 18 kept: shown, does nothing).
- **First pick:** at visit 1's `openDesk`, if the bank is below `FIRST_PICK_FLOOR_CYCLES` (3), the desk adds the grant `{source:'first-pick', cycles: 3 − bank}`. Since earnings are ≥ 1, it is at most +2.
- **Spending:**
  - `trainCell` pushes a `SkillPurchase` to `pending` and returns a refusal or null (`'closed' | 'unaffordable' | 'needs-lower' | 'owned' | 'not-desk'`);
  - `undoPurchase(store, i)` only undoes the last purchase of that skill;
  - `commitTraining` in `transmitNext` moves pending to bought, and adds the salvage `+2` grant when the pick was `'cycles'`.

### 2.5 TRAINING as a desk tab, with the required first pick

- **Tabs and keys:** `DeskWindowId 'training'` already exists. `openDeskWindow` drops its throw, `DeskTabs` gains `TRAINING [T]`, and `deskTabBadges.training` reads `6 CYCLES` while unspent.
- **Visit 1:** `deskUiOnOpen` opens the training window, and `deskSteps` prepends `{ id: 'train', label: 'TRAIN', done: firstPickMade }`.
- **The blocker:** `deskBlocker(state): 'first-pick' | null` (skill-tree.ts) is true on the arm, at visit 1, with no pending `train`.
  - `setCourse` **throws** on it (fail loudly).
  - DeskScreen shows `CHOOSE YOUR FIRST SKILL` on the SET COURSE bar instead of the key.
  - Later desks never block.
- **Visit 1's view** is cards only: the roots of the open branches.
  - 4a shows the AUTOBURN card alone; 4c adds AUTODROP.
  - Keys 1 and 2, then ENTER / TRAIN; the bar fills over 1.5 s.
- **From visit 2, the grid:** columns are branches, rows are v1 v2 v3 plus LOCK 270 and LOCK 810.
  - Cell looks: `owned | pending | affordable | dim | lost | closed | unbuilt`.
  - The `NEXT SHIP:` line, the detail panel's 4-second demo, UNDO, the AHEAD row and the packet preview.
- **The AHEAD row and packet preview** use `unitArrival` with the selected hop (`hopBetween(map, from, deskSelected)`) and the pending skill plan. They name the binding limit: `fit.overLink >= fit.over ? LINK : ROOM · TIGHT`.

### 2.6 The packet: purchases, PACK AS v1, RESTORE

```ts
// src/systems/skill-files.ts
export interface SkillPacketPlan {
  fresh: { skill: SkillId; level: SkillLevel; replaces: string | null }[];   // trained, upgraded, restored at this desk
  packAs: Readonly<Record<string, SkillLevel>>;                              // segId → lower level (PACKET)
}
export function skillPacketPlan(state: Readonly<GameState>, packAs: TransitPlan['packAs']): SkillPacketPlan;
export function skillFile(id: SkillId, level: SkillLevel, makeId: (p: string) => string): SkillFileSegment; // 100%, clean
```

- **`planPacket` (`draft.ts`) stays the ONE adder.** `PacketPlan` gains `skills: SkillPacketPlan`.
  - Replaced ids join the drops internally (never shown as drops).
  - `fresh` files join `added`.
  - `packAs` lowers a packed copy's version, lock and size; integrity and infection are kept.
  - `TransitPlan.packAs` is new. `◀ CHART` forgets it like the drops.
  - `ArrivalPlan` (`arrival-preview.ts`) and `draftContext` pass the same plan, so the preview, the room, the salvage room and the send agree. `transmitNext` already asserts the previewed numbers against the layout.
- **RESTORE:**
  - `restorePrice(lost) = ceil(RESTORE_FRACTION × Σ lost level prices)` with `RESTORE_FRACTION = 0.5`. LOCK levels count, as part of FLIGHT's cost.
  - A RESTORE purchase brings the file back at `paid`, fresh. The cells above `held` show `LOST · RESTORE n`, and a higher version needs `held ≥ v − 1`, so restore comes first.
  - Damage is not loss; REPAIR answers it.
- **PACKET chips (`transmit.ts`):**
  - skills sort last among droppables;
  - `effectNote` names the loss and its RESTORE price;
  - a PACK AS chip appears for each lower level, as `PACK AS v1 (6) · RESTORE 3`, through `setPackAs(store, segId, level | null)`.
- **`+2 CYCLES` (`data/upgrades.ts`):**
  - new `UpgradeId 'cycles'` with `form: 'cycles'`, `salvage: true` and `maxOwned: Infinity`;
  - `usable: ctx.tree && !ctx.toFinal`, where `DraftContext` gains `tree` (arm only) and `toFinal`;
  - it is filtered before the draws, so classic deals stay byte-identical.

### 2.7 Graded damage

```ts
// src/systems/capabilities.ts (pure)
export interface SkillLive {
  file: SkillFileSegment | null; version: EffectiveVersion; lock: LockLevel | null;
  band: Band; offline: OfflineReason | null; nominal: SkillLevel | null;
}
export function skillLive(memory: readonly Segment[], id: SkillId): SkillLive;
export function effectiveVersion(nominal: SkillVersion, band: Band): EffectiveVersion;
// ok: v · degraded: max(1, v−1) · failing: v−2 (≤0 → 0) · dead/missing/offline: 0
export function effectiveLock(level: LockLevel, band: Band): LockLevel | null;   // ok L · degraded max(0,L−1) · failing 0 · else null
```

- The best ONLINE copy counts, as `roleHealth` does; a file being repaired or moved is offline.
- `Capabilities.skills: Record<SkillId, SkillLive>`. `liveUpgrades` stays for FUEL TRIM.
- **The watcher:** `mountSkillWatch` (skill-files.ts, post-tick) emits `'skill-version' {skill, from, to}`.
  - It keeps the last read in a module map keyed by `run.rev` and is silent on a ship's first tick.
  - The UI maps the event to the stamp, `soulLost` / `clusterSaved` and the 400 ms badge flicker (a colour change with reduced motion).
  - Not stored in state: no save shape, and a resume re-reads it silently.

### 2.8 Skills as HOLLOW and seed targets

- **Already true by type:**
  - beam seeds weight targets by size (`seedTargetsOf` → `pickWeighted`);
  - transit hits weight by size, and skills get no 60 floor (`toolKindOf` returns null);
  - `rmTargets` tier 2 (`unlink`, decision 17);
  - COPY is refused (`cardCopy`).
- **New in 4a:** `DELETE_CARD_EFFECT` (`tool-targets.ts`) and `TRANSMIT_TEXT.withoutCard` gain entries for the four skills.
- **Optional (04 §5 item 5):** a seed kind that lands beside the biggest skill. Not scheduled; slice 8 if wanted.

### 2.9 AUTOBURN's code becomes versioned skills without forking

One machine (§6): idle → armed → pointing → burning → done | dropped. v2 and v3 return from burning to armed between burns.

```ts
// state/schema.ts (ship slice 'burn')
export interface AutoburnState {
  phase: AutoburnPhase; atAi: number; end: AutoburnEnd | null;
  mode: AutoMode | null;            // fixed at engagement
  targetKm: number | null;          // ROUND's circle; v3's landing orbit (4e)
  claimed: boolean;                 // holds its thread for the burn at hand (from the claim lead to the burn's end)
  waitingSinceTSec: number | null;  // its claim found no thread free: it fires late, and the plot shows how late
}
// AutoburnEnd gains: 'green' | 'round' | 'reserve' | 'downgraded'
```

**`autoModeFor(state, pred, live)`** (pure) applies "[B] makes it green; [B] on green makes it round":
- v1: open path → `'capture'`, else null.
- v2+:
  - not fully green (open path or a closed loop outside the ring) → `'green'`;
  - in the ring with e ≥ `ROUND_E_TOL` → `'round'`;
  - else null.
- In LANDING a locked orbit is green, so it is `'round'`, and an accepted (PARTIAL) orbit is `'green'`.

**The planner (`predict.ts`)**, so START BURN ticks are always AUTOBURN's burns:
- `computePrediction` reads `state.burn.auto` while engaged.
- `'green'` keeps phase 2's own targets (the cheapest green), with **no shrink**, since AUTOBURN only flies at ▼ and ▲.
- `'round'` and `'landing-orbit'` use the new **`planToCircle(input, targetKm)`**:
  - while |▼ − R\*| > tol: burn at ▲ to bring ▼ to R\*;
  - else: burn at ▼ to bring ▲ to R\*;
  - reason `'round'`, with the trim machinery's `planTrim(…, targetRadius)`.
  - ROUND's R\* is ▼ at engagement (§3.6: "at ▼'s altitude").
  - v3 reuses it with `highestFittingRadius`'s radius, so 4e needs no planner work.
- While armed in a mode, `landingInRingBurn`'s go-low and lift are suppressed. One planner owns the engine.
- `previewModeBurn(state, mode)` gives the plot's ghost and the lock bracket before the press.

**`autoburnRefusal`:**
- `skillLive('autoburn').version === 0` → `noFile` / `damaged`; with no file and nothing ever bought, `untrained` (`NO AUTOBURN — train it between ships`).
- `tooFar` reads `LOCK_RANGE_TAC[live.lock]` against the mode's first burn.
- `threads` is **gone** from engagement.
- The first line opens to `phase === 'landing'` for v2+ (`engineOpen`).

**Tick changes:**
- **Claim:** at `fireIn ≤ AUTO_THREAD_CLAIM_TAC` (8) it calls `reserveThread` and selects its burn's preset (re-selecting after any IN/OUT the kid flew).
  - With no thread free it sets `waitingSinceTSec`, and the strip says `AUTOBURN NEEDS A THREAD IN 0:08 — × AN OP` (urgency now).
  - It releases after each burn.
- **Takeover:**
  - while armed, only the kid firing PRO or RETRO is a takeover (an IN/OUT burn is not, and neither is a preset selection);
  - while pointing or burning, any player burn takes over;
  - [B] cancels, as before.
- **Finish:** GREEN when `fit.inRing` (`'green'`); ROUND when inRing and e < tol (`'round'`); `capture` as today.
- **Fuel reserve:** a planned trim or round burn that would leave below `AUTO_FUEL_RESERVE_PCT` (20) ends with `'reserve'` (`GREEN, NOT ROUND — SAVING FUEL`). **Never on `capture`/`missed`** (§7 R4).
- **Downgrade:**
  - `live.version` below what the mode needs → finish the current burn if v1 can (a capture), then `'downgraded'` with the mode's hand-back line;
  - at 0 → `'dropped'`, the klaxon, as today.
- **Landing window rule** (new, §7 R2): in LANDING a burn whose span overlaps an in-band window of an LZ with room and a pod ready moves to the other apsis. For ROUND that re-aims R\* to that apsis. If both apsides overlap, it burns at ▼ and says `ROUND COSTS LZ-A's WINDOW`. The helper is `landing-orbit.ts burnSpanClear(sol, startInSec, burnSec)`, and 4e reuses it for top-ups.

**Demos:**
- `demoSkill(offsets, tuning)` (skill-tree.ts) replaces `autoburnSkill`. It takes the last `AUTO_DEMO_WINDOW` (8), learns 0.5 × the mean, clamped ±8, with ACCURACY = clamp(100 − 8|o|, 40, 99).
- With **no demos** it is `UNTRAINED`: offset `+AUTOBURN_UNTRAINED_OFFSET_TAC` (7.5, late) and 40% (§7 R3). AUTODROP reuses `demoSkill` in 4c with its own numbers.

**Guidance (`guidance.ts`):**
- `autoburnObjective` splits in two. The burning, pointing and done rows stay ahead of F4.
- The ARMED row moves below F6/F7/F8, F8-debris and F6-resume, so a correction row carries ` · AUTO ARMED` when it fits.
- The thread-wait row is the ARMED row's urgent variant.
- `offerAuto` covers trims for v2+ and names the mode (` · or [B] GREEN`).
- F3b gains ` · or [B] ROUND` when `autoModeFor` would give `'round'`. It is only a tail and never outranks anything.
- In landing, L13's wait rows take the same tail (`landing-guidance.ts`). Every line stays ≤ 70 chars, checked by `support/words`.

**HUD (`flight-hud.ts`):**
- The AUTO button's head gains the mode (`AUTO · GREEN [B]`).
- `lockBracket(state, pred)` returns the path span inside the lock range, for `plot-draw.ts`'s `LOCK` bracket. The button glows inside it, and `'autoburn-in-lock'` sounds `chime`.
- `autoGhost(state, pred)` is the dashed target: the band-hugging loop or the circle.
- The Engine window gains an `AUTOBURN` pip.

### 2.10 AUTODROP and the LandingController seam (4c)

- `landing-controller.ts` holds a module variable today. 4c replaces it with `activeLandingController(state)`, derived each tick from `skillLive('autodrop')` and `state.landing.autodrop`. A controller then dies with its file.
- `autodrop.ts` exports `autodropController(state): LandingController | null`, with `decide(view, state)` returning a `LaunchIntent` (`source: 'autodrop'`, `pod` through LOAD NEXT), or `'skip'`.
- All launches go through `requestLaunch(intent)`, so every refusal and guard is the player's.

### 2.11 SENTRY and the seed and DELETE seams (4d)

- `HollowSegment.disguise?: { name; desc }`, rolled on its own stream (`hopRng(…, 'disguise')`) so beam draws stay put.
- `deleteSecFor(seg, live)` in `actions.ts` halves the DELETE time at SENTRY v2+.
- `sentryBootLines(arrival)` (v1); `installAddress` for the FIREWALL (v3); `UpgradeDef.usable` hides the FIREWALL card while v3 works.

### 2.12 AUTOBURN v3 and the fit query (4e)

- `highestFittingRadius(lzsWithRoom, factors(worst next driver), ring, R, mu, warp, floorKm)` → R\* → `planToCircle` (built in 4a) and `burnSpanClear` (built in 4a).
- The top-ups are 1b's `'lift'` at a window-free apsis. In the landing gate it is `[B] · MOVE TO LANDING ORBIT`.

### 2.13 Pure vs stateful

| Pure | Stateful |
|---|---|
| `data/skills.ts`; `skill-tree.ts` (bank, held, paid, lost, cells, prices, opening rule, `demoSkill`, `deskBlocker`); `capabilities.ts skillLive`; `skill-files.ts` (`skillFile`, `skillPacketPlan`, `applySkillPlan`, `skillBootLines`); `run-score.ts shipCycles`; `predict.ts planToCircle`; `autoModeFor`; `trainingModel`; `skillsModel`; guidance | `training.ts` (`trainCell`, `undoPurchase`, `restoreSkill`, `setPackAs`); `run.ts` (endShip earning, openDesk latch and first-pick grant, transmitNext commit); `autoburn.ts` tick; `installSkillFile`; `mountSkillWatch`; the views |

### 2.14 The save

- **`RUN_SAVE_VERSION` 1 → 2**, one bump for 4a+4b. The shape pin forces it.
- **The v2 shape:**
  - `run.skills: RunSkillState`, replacing `skillTrainedOn`;
  - `run.stats.dropDemos: { offsetTac: number }[]`, added now (empty until 4c, saving a bump);
  - `burn.auto`'s four new fields (`targetKm` covers 4e);
  - `ArrivalReport.skills: ArrivalSkill[]` (`{ segId; skill; level; kind: 'trained'|'restored'|'packed'|'carried'|'granted' }`);
  - skill files carry `version` and `lock`.
- **`checkSavedRun`** gains `skills: rec({…})` with `pending` checked **empty** (like `transit: isNull`), `bought: list(purchase)`, and so on.
- **`RUN_SAVE_MIGRATIONS[1]`:**
  1. drop `skillTrainedOn`, add `skills` from `createRunSkills()`, and `stats.dropDemos = []`;
  2. set every `upgrade:'autoburn'` segment to version 1, lock 0. This covers world payload memory and boot payload `carried.segs`/`strays`: arm runs in flight may carry the old free AUTOBURN.skl;
  3. if `skillTrainedOn !== null`, add `bought: [{skill:'autoburn', kind:'train', to:{version:1,lock:0}, cost:0, visit:0}]`, so a since-eaten file is offered for RESTORE (2);
  4. `burn.auto` gets nulls and false;
  5. `arrival.skills = []`;
  6. `saveVersion: 2`.
- **Content versions:** none added. Earnings and costs are recorded, so slice 8's re-pricing never kills a save.
- **Archive:** `LastUnit.skills: SkillRecord[] | null`.
  - It is filled at `recordRunEnd`, so `RunEnd` gains `skills`.
  - `recordAbandon` keeps `null`: `activeRun` carries no skills, and adding them would bump META for no reader. REASSIGNMENT follows an ending, never an abandon.
  - `meta-parse.ts` reads `nullable(list(skillRecord))`, with no META bump.
- **Reload at the desk:** it restores SHIP DONE's bank, with `pending` empty (03 §5 item 4).

### 2.15 Seams for later slices

- **Slice 5:**
  - `grantCycles(store, n, source, label)` writes a `CycleGrant`;
  - `grantSkill(store, skill, version, source)` writes a `SkillGrant`, which `skillBootLines` installs through `installSkillFile` with `> SKILL TRAINED: SURVEY.skl v2 · from the sleeper on CURLEW`;
  - rule checks are in `grantAllowed(state, skill, version)`: ≤ v3, an open branch, and never owned, lost or invisible for a resident's card;
  - the resident's salvage card is `UpgradeId 'skill-v1'` through the same check;
  - the sleeper's report line takes the report slot after the cycles line (01 §3.18).
- **Slice 6:** `SKILL_TREE.survey.built` goes 0 → 3; the `poor-ahead` rule reads `ShipSummary`'s site data; SURVEY reads `skillLive('survey')`.
- **Slice 7:**
  - `highestVersionSkill(lastUnit.skills)` for REASSIGNMENT's root hunt;
  - `autodropController` is the MERGE pods' controller (01 §3.17), at the effective version;
  - `ArrivalSkill.kind 'granted'` already exists.

### 2.16 Architecture debt to fix now (FOUNDATION unless noted)
1. Delete the dead `SkillSegment` / `'skill'` type (`types/segment.ts`, `data/memory.ts`, `state/selectors.ts`).
2. Remove the install path: `skillBootDue`, `trainSkillAtBoot`, `run.skillTrainedOn`, `AUTOBURN_DEMOS_TO_TRAIN`, `AUTOBURN_SKILL_BLOCKS`.
3. Merge `autoburn.ts skillAddress` into `licences.ts installAddress`, then move it to `memory-ops.ts unitInstallAddress`. One rule serves skills, grants, FIREWALL and licences.
4. `Capabilities.upgrades.autoburn` becomes `Capabilities.skills`.
5. The AUTOBURN thread taken at engagement becomes the claim (FLIGHT).
6. The single-row `autoburnObjective` is split (FLIGHT).
7. **4c:** the landing controller's module variable is derived from state.

---

## 3. The player's walk

1. **Run 1, desk 1.**
   - The ARES-VII report rolls `TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4`.
   - The DESK opens on TRAINING (`TRAINING · UNIT-047 … 5 CYCLES`), and ARRIVAL CONTROL types `Training outside approved hours is discouraged. :)`.
   - The SET COURSE bar reads `CHOOSE YOUR FIRST SKILL`. The card reads AUTOBURN v1 `3 CYCLES · 6 BLOCKS`. [1], ENTER, and the bar fills: `TRAINING AUTOBURN v1 · from your 1 capture`.
   - The counter reads `2 CYCLES · SAVED FOR NEXT TIME`. The step is done; the kid picks HALCYON and SET COURSE.
   - The PACKET shows `AUTOBURN.skl v1 (6) · TRAINED HERE · ◀ CHART TO UNDO`.
   - *Crash variant:* earned 1, then `+2 CYCLES · FIRST SKILL ON THE HOUSE :)`.
2. **HALCYON.**
   - The boot types `> SKILL TRAINED: AUTOBURN.skl v1 · from your 1 capture · ACCURACY 92%` and stamps `AUTOBURN v1 ONLINE`.
   - In the coast the NAV PLOT draws a short `LOCK` bracket ending at START BURN (90 s).
   - Inside it: `TURN AROUND — press [S] · or [B] AUTO`. [B] gives `AUTOBURN ARMED — it brakes at ▼ in 1:12 · [B] to cancel`, and no thread is taken.
   - At 0:08 it claims a thread and selects RETRO, then brakes, then `AUTOBURN: CAPTURED — trim it green yourself`.
3. **Desk 2:** bank 8. The grid opens FLIGHT: v2 GREEN, THEN ROUND `5 · 8`, LOCK 270 `1 · +1`, v3 `OPENS LATER`. The kid buys v2 and LOCK 270, and the bank reads 2. The preview reads `FILES 66 + SKILLS 9 · LINK 117 · ROOM FOR 42 CHARGE`.
4. **KESTREL.**
   - The boot types `> SKILL TRAINED: AUTOBURN.skl v2 · 2 captures · ACCURACY 88%` and a one-time line: `AUTOBURN v2 — [B] makes it green. [B] on green makes it round.`
   - The bracket is three times as long. The button reads `AUTO · GREEN [B]`, and the ghost is a dashed band-hugging loop.
   - [B] in the coast, then [F] SKIP, then TAB into the MIND. The kid starts IN for a debris dodge; the strip says `TOO WIDE — press [A] (IN) · AUTO ARMED`, and AUTOBURN stays armed.
   - It captures, re-arms (`trims at ▲ in 7:12 · [F] SKIP`) and trims, then `AUTOBURN: GREEN ORBIT — hold steady, or [B] to round it`. ORBIT LOCKED.
5. **ROUND, in the landing:** the button reads `AUTO · ROUND [B]` and L13 reads `NEXT WINDOW LZ-B 2:10 · or [B] ROUND`. [B] gives a circle ghost and burns at ▼, then `AUTOBURN: ROUND ORBIT — hold steady`. The drop width is the same on every pass.
6. **Bitten.** A transit hit leaves AUTOBURN.skl at 64%.
   - The chip reads `AUTOBURN v2▸v1`, and its ticks read `v2 | v1 | off`.
   - The DetailPanel says `v2 · 64% · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`, and the stamp says `AUTOBURN v2 → v1`.
   - [B] now only offers the capture. The kid repairs it (it is offline meanwhile), and `AUTOBURN v2 RESTORED` plays `clusterSaved`.
7. **The packet squeeze.** On an 86-block hop the PACKET reads `3 BLOCKS OVER`.
   - The chip shows `AUTOBURN.skl v2 (9) → brake by hand · RESTORE 5` and `PACK AS v1 (7) · RESTORE 3`. The kid packs as v1 and the packet fits.
   - The next desk's grid shows v2 and LOCK 270 as `LOST · RESTORE 3`. The kid restores for 3.
8. **Later** (4c, 4d, 4e):
   - AUTODROP's v1 card at desk 1 (`4 BLOCKS`), centred volleys on [L], [G] passes, and the v3 plan;
   - SENTRY at visit 3 naming `cache.tmp IS A SEED`, `PRE-EMPTED`, and `FIREWALL.sys COMPILED`;
   - AUTOBURN v3's `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL −9%`, `AUTOBURN v3 GOES LOWER`, and ARRIVAL CONTROL's `Our repository has everything you need. :)`.

---

## 4. Data

### 4.1 The tree (`src/data/skills.ts`; 03 §3.2, cross-checked)

| Skill (branch) | v1 mode · price · blocks | v2 | v3 | Extra | Branch cost | Opens |
|---|---|---|---|---|---|---|
| AUTOBURN (FLIGHT) | CAPTURE · 3 · 6 | GREEN, THEN ROUND · 5 · 8 | LANDING ORBIT · 8 · 10 | LOCK 270 · 1 · +1; LOCK 810 · 2 · +1 | 19 | start (v1 at 1, rest at 2) |
| AUTODROP (LANDING) | CENTRE · 3 · 4 | PASS · 5 · 7 | PLAN · 8 · 10 | none | 16 | start |
| SURVEY | FIND · 2 · 3 | RATE · 3 · 4 | SWEEP · 4 · 6 | none | 9 | poor-ahead, visit ≥ 4 |
| SENTRY (DEFENCE) | SIGHT · 2 · 3 | QUICK RM · 3 · 4 | FIREWALL · 5 · 6 | none | 10 | after-seeds, visit ≥ 3 |

The load validator checks these:
- **Total cost:** 54.
- **Largest file:** AUTOBURN v3 + 810 = 10 + 2 = 12 = `SKILL_MAX_BLOCKS`. REPAIR v1 heals 100 ÷ (3 + 0.3 × 12) = 15.2%/s, which beats the 15 needed.
- **Full set:** 12 + 10 + 6 + 6 = 34 blocks.
- **Prices rise within a branch.**
- **v3 price above any one ship's pay:** 8 > 6.
- **`built`:** 4a sets AUTOBURN 2 and the others 0. 4c sets AUTODROP 3, 4d SENTRY 3, 4e AUTOBURN 3, slice 6 SURVEY 3.

Restore cross-checks:
- AUTODROP v3 lost: (3+5+8)/2 = 8 ✓ (§3.4 chip).
- AUTODROP v3 packed as v1: ⌈13/2⌉ = 7 ✓.
- AUTOBURN v2 + LOCK 270 lost: ⌈9/2⌉ = 5.

### 4.2 The cycle conversion

| Q (points ÷ aboard) | 0–19% | 20–39% | 40–59% | 60–79% | 80–99% | 100% |
|---|---|---|---|---|---|---|
| Cycles | 1 | 2 | 3 | 4 | 5 | 6 (`PERFECT LANDING`) |

§3.12's run, cross-checked: 83% → 5, 100% → 6, 70% → 4, 85% → 5, 80% → 5 ✓, for 30 earned and 25 spendable. Visit 3: 4 = SENTRY v1 2 + LOCK 270 1, with 1 left ✓. A crash pays 1, topped up to 3 at visit 1.

### 4.3 New and changed tuning (`src/data/tuning.ts`, each with a WHY)

**Added:**
- `CYCLES_PER_STEP_PCT 20`, `CYCLES_ARRIVED 1`, `CYCLES_LANDED_STEPS 5`
- `FIRST_PICK_FLOOR_CYCLES 3`
- `RESTORE_FRACTION 0.5`
- `SKILL_MAX_BLOCKS 12`
- `LOCK_RANGE_TAC [90, 270, 810]` (replaces `AUTOBURN_WINDOW_TAC`)
- `AUTO_THREAD_CLAIM_TAC 8` (= `TACTICAL_LEAD_BURN_TAC`, asserted)
- `AUTO_FUEL_RESERVE_PCT 20`
- `ROUND_E_TOL 0.01`
- `AUTO_DEMO_WINDOW 8`
- `AUTOBURN_UNTRAINED_OFFSET_TAC 7.5` (100 − 8 × 7.5 = 40)
- **4c:** `AUTODROP_OFFSET_FACTOR 0.5`, `_MAX_TAC 1`, `_AIM_PER_TAC 40`
- **4d:** `SENTRY_DELETE_FACTOR 0.5`
- **4e:** `V3_STEP_KM 100`
- `RUN_SAVE_VERSION 2`

**Removed:** `AUTOBURN_DEMOS_TO_TRAIN`, `AUTOBURN_SKILL_BLOCKS`, `AUTOBURN_WINDOW_TAC`.

---

## 5. Work breakdown

### 5.1 FOUNDATION (one agent, first, sequential; about 1 day)

0. **Dump a v1 save fixture** before anything changes: a SHIP DONE save on the worked route, via a one-off `AP_SAVE_DUMP=1` branch in `tests/unit/save/shape-pin.test.ts`, to `tests/unit/save/fixtures/run-save-v1-ship-done.json`, plus a boot payload at BEAM.
1. **Types:** `src/types/skill.ts`; `segment.ts` (`SkillFileSegment`, `CardFileSegment`, the dead `SkillSegment` deleted); `schema.ts` (`RunState.skills`, `stats.dropDemos`, `AutoburnState`'s new fields and ends, `ArrivalReport.skills`, `TransitPlan.packAs`); `types/lineage.ts LastUnit.skills`.
2. **Data:** `src/data/skills.ts` (the table, `SKILL_FILE_TEXT`, `skillBlocks`, `levelPrice`, the validator) and `tuning.ts` (§4.3).
3. **State:** `initial.ts createRunSkills()`; `isSkillFile` in selectors; `assertMemoryInvariants` skill checks.
4. **Pure cores, implemented now** so the tracks and their tests stand on real reads (about 200 lines):
   - `capabilities.ts skillLive / effectiveVersion / effectiveLock` and `Capabilities.skills`;
   - `skill-tree.ts bankOf / held / paid / lostLevels / restorePrice / demoSkill / deskBlocker`;
   - `run-score.ts shipCycles`.
5. **Stubs with final signatures** that throw `not built (Track X)`:
   - `training.ts`: `trainCell`, `undoPurchase`, `restoreSkill`, `setPackAs`, `commitTraining`, `trainingModel`;
   - `skill-files.ts`: `skillFile`, `skillPacketPlan`, `applySkillPlan`, `installSkillFile` (implemented: tests need it), `skillBootLines`, `mountSkillWatch`;
   - `skill-tree.ts`: `treeCells`, `openBranchesAt`, `grantCycles`, `grantSkill`, `grantAllowed`;
   - `autoburn.ts`: `autoModeFor`, `lockRangeTac`, `previewModeBurn`;
   - `predict.ts planToCircle`; `flight-hud.ts lockBracket`, `autoGhost`; `landing-orbit.ts burnSpanClear`.
6. **The old path out:**
   - `boot.ts`'s `'skill'` line reads `skillBootLines` (the stub returns []);
   - `memory-ops.ts unitInstallAddress` (merging `skillAddress` and licences' `installAddress`);
   - `debug.ts __ap.skill(id, v, lock)` / `__ap.cycles(n)`;
   - the test helper `tests/unit/support/skills.ts` (`giveSkillFile`, `pickFirstSkill`);
   - `harness9.giveSkill` re-pointed to it.
7. **The save:** `save-codec.ts` (spec, `RUN_SAVE_MIGRATIONS[1]`), `shape-pin.test.ts` (v2 pinned beside v1), `meta-parse.ts` (`skills` reader), `meta.ts recordRunEnd` (`skills` from `RunEnd`, filled by TREE). New suite `skills/foundation.test.ts` (< 1 s): the table, effective versions, bank, restore prices, the migration of the fixture, the cycle steps.
8. **Text banners:** a new `src/data/training-text.ts` with one section per track (`TRAINING_TEXT` UI, `PACKET_SKILL_TEXT` and `BOOT_SKILL_TEXT` TREE). `src/data/skill-text.ts` stays FLIGHT's.
9. **Gate:** `npm run typecheck`; the whole unit tier green. The suites that used the install path move to `giveSkillFile` here, mechanically, with no behaviour asserts changed.

### 5.2 Three parallel tracks (disjoint files)

**Track TREE** (model, cycles, buying, PACK AS, RESTORE, save, boot):
- **Owns:**
  - `src/systems/skill-tree.ts`, `src/systems/training.ts` (except `trainingModel`), `src/systems/skill-files.ts`;
  - `src/systems/run.ts`:
    - endShip appends earnings;
    - openDesk latches `opened`, writes the first-pick grant and opens TRAINING on visit 1 through `deskUiOnOpen`'s `deskWindow`;
    - setCourse throws on `deskBlocker`;
    - transmitNext commits and fills `arrival.skills`;
    - backToChart forgets `packAs`;
  - `src/systems/draft.ts` (`planPacket` adds skills; `draftContext.tree/toFinal`), `src/data/upgrades.ts` (`'cycles'` card), `src/systems/carry.ts` (sort key, `'trained'` lock), `src/systems/transmit.ts` (skill chips, drop order, PACK AS model);
  - `src/systems/arrival-preview.ts` (`ArrivalPlan.skills`), `src/systems/boot.ts` + `src/systems/map-boot.ts` (TRAINED/RETRAINED lines, `announced`, ONLINE stamp event);
  - `src/systems/meta.ts` (`RunEnd.skills`), `src/systems/run-end.ts` (`UNSPENT`, the tally's `TRAINED n of 54`), `src/data/repository.ts` (four `skl:` rows), `src/systems/tool-targets.ts` (`DELETE_CARD_EFFECT`), `src/debug.ts`;
  - `PACKET_SKILL_TEXT` and `BOOT_SKILL_TEXT` in `training-text.ts`.
- **Tests:** `skills/packet.test.ts`, `skills/training-flow.test.ts`, `skills/cycles.test.ts`; `save/*` updates.

**Track FLIGHT** (AUTOBURN v1/v2, GREEN/ROUND, LOCK RANGE, claim, precedence, graded damage in flight):
- **Owns:**
  - `src/systems/autoburn.ts`, `src/systems/predict.ts` (`planToCircle`, `'round'`, no-shrink for green, armed-mode planning, `previewModeBurn`);
  - `src/systems/guidance.ts`, `src/systems/landing-guidance.ts` (ROUND tail only), `src/systems/landing-orbit.ts` (`burnSpanClear`);
  - `src/systems/flight-hud.ts` (AUTO button mode, `lockBracket`, `autoGhost`, Engine pip model), `src/components/hud/plot-draw.ts` + `src/components/tools-view/NavPlotWindow.ts` (bracket and ghost), `src/components/tools-view/EngineWindow.ts` (pip);
  - `src/data/skill-text.ts` (every AUTOBURN line ≤ 70: `armedTail`, `threadWait`, `green`, `round`, `reserve*`, `downgraded*`, `offerMode`, `roundTail`, untrained wording);
  - `src/systems/ops-core.ts` (only if the claim needs a hook);
  - `src/systems/skills.ts` `autoburnStatus()` export (the row's live status, read by UI).
- **Tests:** `skills/autoburn-modes.test.ts`, `skills/guidance-auto.test.ts`; rework of `wp9/autoburn-sim`, `wp9/fix1`, `wp9/fix2`, `wp9/lines`, `wp3/ops-core`, `wp10/held-space`, `lead2/*` skip-press asserts.

**Track UI** (TRAINING tab, Skills window, chips, badges, report and tally lines):
- **Owns:**
  - `src/components/desk/TrainingWindow.ts` (new), `DeskTabs.ts`, `DeskScreen.ts` (the [T] key, the step list, the SET COURSE bar's blocker text);
  - `src/systems/desk.ts` (`deskSteps`, `openDeskWindow`, `deskTabBadges.training`), `src/systems/training.ts trainingModel` (its one function; the file's other exports are TREE's);
  - `src/systems/skills.ts` (except `autoburnStatus`) + `src/components/run/SkillsWindow.ts`;
  - `src/components/run/LandingReport.ts` (the cycles line), `RunEnd.ts` (UNSPENT), `TransmitScreen.ts` (skill chips and PACK AS buttons over TREE's model);
  - `src/components/memory-view/SegmentBlock.ts` + `DetailPanel.ts` (version badge, labelled ticks, WORKS AS), `src/components/hud/Stamp.ts` users and `src/systems/audio-cues.ts` (`skill-version`, `autoburn-in-lock`, training sounds);
  - `src/styles/desk.css`, `src/styles/game.css` (skill bits), `src/styles/responsive.css` (the phone's accordion tab);
  - `TRAINING_TEXT`, and `SKILLS_TEXT` in `src/data/script.ts` (the skill rows section only).
- **Tests:** `skills/ui-models.test.ts`; updates to `wp9/p2/ui-models`, `map/desk-chrome`, `map/desk-models`, `support/words`.

**Hot shared files and their owners:**

| File | Owner after FOUNDATION | Others |
|---|---|---|
| `schema.ts`, `initial.ts`, `types/segment.ts`, `types/skill.ts` | TREE | ask by message; no direct edits |
| `tuning.ts` | TREE | FLIGHT edits values only in the `AUTO_*` / `LOCK_*` / `ROUND_*` block |
| `skill-text.ts` / `training-text.ts` | FLIGHT / UI | TREE's two sections in `training-text.ts` are TREE's |
| `run.ts` | TREE | UI reads `deskUiOnOpen` |
| `skills.ts` | UI | FLIGHT's `autoburnStatus` only |
| `capabilities.ts` | FOUNDATION, then TREE | FLIGHT reads |
| `debug.ts` | TREE | |
| e2e scenarios | lead, at batch end | |

**Order dependencies:**
- FOUNDATION comes before everything.
- TREE's `skillPacketPlan` / `planPacket` must land before UI's preview and chips are wired; UI builds on the model stubs meanwhile.
- FLIGHT is independent of TREE: it installs files with `giveSkillFile`.
- UI's AUTO pip waits for FLIGHT's `flight-hud` model.
- The integration pass (lead) wires `trainingModel`'s preview to `unitArrival`. Then e2e.

### 5.3 4a vs 4b inside the batch

Each track does its 4a items first, so a 4a-only cut is playable:

| Track | 4a | 4b |
|---|---|---|
| TREE | cycles, buy, packet, boot, +2 | `restoreSkill`, PACK AS, chip consequences |
| FLIGHT | modes, lock, claim, precedence | mid-burn downgrade, `'downgraded'` end |
| UI | TRAINING, report, tally | Skills window, badges and ticks, stamps |

### 5.4 Outlines: 4c, 4d, 4e

**4c: AUTODROP v1–v3** (§3.8; 01 §3.14, §3.17).
- **Modules:**
  - `src/systems/autodrop.ts`: the controller per version, `planLanding(view, lzs, queue) → PlanRow[]` (pure, for v3), `bayBy(t)` for v2's `BAY HAS 1 BY THEN`;
  - `landing-controller.ts` derived from state;
  - `state.landing.autodrop: { armed; passPlan: Record<lz, n>; plan: PlanRow[] | null } | null` (RUN_SAVE_VERSION 3);
  - `landing-controls.ts`: [L] held (`onDown`/`onUp`), [G];
  - the PodBayWindow rows and plan table;
  - drop demos into `stats.dropDemos` (`landing.ts` on manual launches);
  - the second visit-1 card.
- **Seams used:** `requestLaunch`, `LandingView.validUntilTSec`, `dropFactors` per pod, `setLoadNext`, `reserveThread` per window, `holdsTactical`.
- **Risks:**
  - AIM's clamp (±1 tac s) cannot reach the spec's `UNTRAINED 40%` (minimum 60). Recommend `UNTRAINED` uses offset 1.0 and shows 60%, or the AIM formula's minimum becomes 60;
  - a held [L] meeting a launch confirm (`LaunchAsk`);
  - v3's re-plan after every launch, per tick cost;
  - MERGE's restored pods wait for slice 7.

**4d: SENTRY and disguised seeds** (§3.10; 04 §3.6, K1–K3).
- **Modules:**
  - `beam-seeds.ts` disguise roll (depth ≥ 5: 1 in 3; ≥ 7: 1 in 2) on its own stream;
  - `HollowPainter.ts` with no mouth on a disguise;
  - SCAN's `NOT A FILE` reveal (`actions.ts`), the guidance line `◇ SOMETHING NEXT TO … SCAN its neighbours`;
  - `src/systems/sentry.ts`: v1's boot ECC naming and `SENTRY: SOMETHING LANDED · RACK D`, v2's `deleteSecFor` and outline targeting `PRE-EMPTED`, v3's FIREWALL via `unitInstallAddress`, and hiding the salvage FIREWALL card.
- **Opening rule:** `after-seeds` reads `run.threat` (the first ship whose tally met a seed).
- **Risks:**
  - aiming DELETE at a not-yet-landed seed is a new tool-target kind;
  - 04 says SENTRY is a power spike, never a gate, so a SCAN must always reveal;
  - no RUN_SAVE bump expected (`disguise` lives in memory, which the pin treats as opaque); check with the pin.

**4e: AUTOBURN v3 LANDING ORBIT** (§3.6 v3).
- **Modules:**
  - `autoburn.ts`'s `'landing-orbit'` mode: R\* = `highestFittingRadius` over LZs with room, factors with the worst next driver, `floorKm = max(ring.min, …)`, quantised down to `V3_STEP_KM`;
  - the fuel check through `decayForecast`'s holds, falling back to v2's rule;
  - the 4a planner primitive `planToCircle`;
  - top-ups as `'lift'` at a `burnSpanClear` apsis; refit on a factor change; never climbing;
  - the L9 row's `AUTOBURN v3 GOES LOWER` (landing-guidance); `[B] · MOVE TO LANDING ORBIT`; ARRIVAL CONTROL's v3 line.
- **Deviation to raise:** v3 goes down with `planToCircle`, not 1b's single-LZ `go-low` burn. Several LZs need a circle, not one launch point.
- **Risks:**
  - per-tick cost (memoise per orbit epoch and factors);
  - the kid's own GO LOWER while v3 is engaged (refuse it with v3's line);
  - 03's risk that v3 is a weak spike on healthy ships (measure in a BALANCE_ONLY sweep).

---

## 6. Tests

**Budget.** The tier is about 250 s on 4 workers against a 300 s cap. The new store-level suites are fast. The flight suites replace old content rather than add to it.

**New suites:**

| Suite | Track | What it covers | Time |
|---|---|---|---|
| `skills/foundation.test.ts` | FOUNDATION | the table and validator, effective version and lock, bank, restore prices, the cycle steps (Q = 0.2k exact), the v1 → v2 migration of the dumped fixtures | < 1 s |
| `skills/cycles.test.ts` | TREE | first pick (crash), `+2` card (not on the final hop, not on classic), UNSPENT, the tally's `TRAINED n of 54` | < 1 s |
| `skills/packet.test.ts` | TREE | planPacket with train, upgrade and restore; PACK AS (size, integrity kept); `'trained'` lock; link and room gates; chip lines and RESTORE prices; `layoutCarried` places skills after the AI tools; `unlink` and transit hits reach skills | ~2 s |
| `skills/training-flow.test.ts` | TREE | the desk's required pick blocks `setCourse` (throws); buy, undo, ◀ CHART keeps pending; commit at TRANSMIT; a SHIP DONE reload drops pending; boot lines; `opened` latch; save round trip at BEAM | ~3 s |
| `skills/autoburn-modes.test.ts` | FLIGHT | via `flyOnce` and `depth.ts` sampling: v1 capture on ARES-VII; v2 GREEN from flyby to ring on KESTREL; ROUND in landing to e < 0.01; claim at 8 s, the thread-wait late fire; IN/OUT not cancelling; reserve stop; v2 → v1 mid-burn | ~15 s |
| `skills/guidance-auto.test.ts` | FLIGHT | pure contexts: correction rows over ARMED with the tail; `· or [B] GREEN` and `ROUND` tails; the landing L13 tail; 70 chars | < 1 s |
| `skills/ui-models.test.ts` | UI | `trainingModel` cells (visit 1, 2, lost), AHEAD and preview binding words, `skillsModel` rows, report line, chip badges | ~2 s |
| `skills/round-sweep.test.ts` | FLIGHT | `// BALANCE_ONLY: GREEN/ROUND over the five templates × seeds (fuel used, e reached, reserve stops)` | — |

**AUTOBURN's existing suites change like this:**
- **`wp9/autoburn-sim` (19.6 s), `wp9/fix1` (21.6 s), `wp9/fix2` (23.4 s):** the install-after-two-captures and `skillBootDue` asserts are deleted (that behaviour is gone). The flight asserts stay and install with `giveSkillFile(store,'autoburn',1)`.
  - "Thread held from engagement" becomes "thread held from the claim".
  - "A correction cancels" becomes "a PRO/RETRO takeover cancels".
  - FLIGHT trims the cases `autoburn-modes` now owns, for net ≤ 0 s.
- **`wp9/lines`:** the new and changed lines. **`wp9/p2/ui-models`:** the AUTO button's mode heads and the skill row.
- **`wp3/ops-core`:** reservation at the claim. **`wp10/held-space`:** `LOCK_RANGE_TAC[0]`.
- **`lead2/coast-skip`, `lead2/fix3/skip-press`, `lead2/fix1/kestrel-fixes`:** the [B]-stops-SKIP rules are unchanged; only the install is.
- **`wp11/harness11`, `wp12/playthrough`** (BALANCE_ONLY, info-only): the COMPETENT kid gets AUTOBURN v1 by `giveSkillFile` after ship 1, standing in for the first pick on the classic world.

**The save:**
- `save/shape-pin` pins v2 beside v1.
- `save/codec` adds: an empty-`pending` check, a corrupt `skills` refusal, and migrating a v1 fixture that carries the old free AUTOBURN.skl (version 1 lock 0, a `bought` entry, RESTORE 2 when eaten).
- `save/resume` resumes at a desk with a v2 skill.
- **Arm fixtures** (`save/save-fixture.ts toDesk/beamTo`, `map/run1-fixture.ts`, `map/repo-fixture.ts`) call `pickFirstSkill` at visit 1. `map/run1-route` (22.6 s) gets one more step.

**e2e** (once at the end of the 4a+4b batch):
- `playthrough.mjs`:
  - at desk 1, TRAINING opens; [1], [ENTER], check `TRAINED` and SET COURSE;
  - ship 2 follows the `[B]` the strip names and checks `AUTOBURN: CAPTURED`;
  - desk 2 buys v2 when the bank allows and checks the boot line;
  - a later ship checks `GREEN ORBIT`, then one [B] ROUND in landing and `ROUND ORBIT`.
- `map-desk.mjs`: the [T] tab, UNDO, the required-pick bar, the preview's binding word, a PACK AS click on an over-link packet.
- `phone.mjs`: TRAINING as a tab with the newest branch's accordion open.
- 4c, 4d and 4e each add their own e2e checks.

---

## 7. Risks and open questions (each with a recommended answer)

1. **R1. ROUND in flight lives about 3 AI s.** `LOCK_HOLD_AI_SEC` = 3, so the flight ends at HOLD STEADY; decision 15's second press almost always happens in LANDING.
   - **Recommend:** open the landing gate in 4a, as built above (the spec already says "[B] there always offers ROUND"), and keep the flight's GREEN line pointing at it.
   - **Flag to Fran:** the decision works, but ROUND is a landing tool, which strengthens 03 §10's "ROUND may go unpressed" risk.
2. **R2. A ROUND or trim burn in landing can cost a window** (launches are refused while firing; the planet does not rotate, so a blocked apsis is blocked every pass).
   - **Recommend:** the other-apsis rule (§2.9), measured in `autoburn-modes`. 4e reuses it.
3. **R3. A decided item that hurts gameplay as written:** "no demos = UNTRAINED 40%" with phase 2's math means an untrained skill fires at offset 0, which is perfect. Buying without ever capturing by hand would then be the best AUTOBURN, and "trained by you" dies.
   - **Recommend:** untrained fires `AUTOBURN_UNTRAINED_OFFSET_TAC` = 7.5 s late, which is what 40% means by the ACCURACY formula. Raise it to Fran as a reading, not a change.
4. **R4. The fuel reserve must not refuse a capture.** "Never plans a burn below 20%" applied to the capture would leave the kid to burn the same fuel by hand, or crash.
   - **Recommend:** the reserve applies to trims, ROUND and v3 only (03's own examples are `CAPTURED, NOT GREEN — SAVING FUEL` and `GREEN, NOT ROUND`).
5. **R5. In 4a the first pick has one card** (AUTODROP is 4c).
   - **Recommend:** accept; it is still the required, guided step. 4c adds the second card. Do not show a dead card.
6. **R6. The thread claim can make a capture late** when both threads run ops at T−8.
   - **Recommend:** keep "hack or burn" with the urgent `× AN OP` line, and measure how late in `autoburn-modes`. No pre-emption.
7. **R7. An upgrade heals and cures the file** (§3.3, "new code").
   - **Recommend:** keep it as specified. It costs cycles. Watch it in the playtest.
8. **R8. A just-trained file on the PACKET:** dropping it wastes cycles.
   - **Recommend:** the `'trained'` lock (`◀ CHART TO UNDO`). PACK AS is also refused on it.
9. **R9. The bank is derived and throws below 0.**
   - **Recommend:** keep it (fail loudly). The migration's `cost: 0` entry keeps old saves at or above 0.
10. **R10. The classic world gets no tree**, and its suites install through the helper. The playthrough's COMPETENT kid uses AUTOBURN only from ship 2.
    - **Recommend:** accept, and retire the classic world after 4e (3a risk 15).
11. **R11. The unit tier budget.**
    - **Recommend:** the new suites total about 25 s of the 4 workers' time, offset by trimming the wp9 trio. Fail the batch review if the tier passes 265 s; push the sweeps to BALANCE_ONLY.
12. **R12. The salvage `+2 CYCLES` into the final ship** is worthless.
    - **Recommend:** not dealt there (`toFinal`). Decision 18's "unspent only shown" stays.
13. **R13. One bump for 4a+4b, then 4c's `landing.autodrop` bumps again.**
    - **Recommend:** accept a bump per sub-slice that adds state. Each step is a few lines, and guessing 4c's state now would freeze it before its plan.
14. **R14. Readability: three numbers per file** (health, version, works-as).
    - **Recommend:** labelled ticks and `WORKS AS v1`, as specified; playtest item (03 §10).
15. **R15. The opening rule's tie ("the next ship needs it first")** has no chosen next ship at desk time.
    - **Recommend:** judge against the reachable candidates. SURVEY wins when any of them is POOR, else SENTRY.
16. **R16. `recordAbandon` keeps `skills: null`.**
    - **Recommend:** accept (no META bump). REASSIGNMENT follows an ending.
17. **R17. LOCK RANGE 810 plus one [F]** gives hands-free flights.
    - **Recommend:** intended. "Never steers" keeps the corrections. 03 §10's emptied-SHIP-screen risk stays a playtest item.

---

### Critical files for implementation
- `/home/user/ArrivalProtocol/src/systems/autoburn.ts`
- `/home/user/ArrivalProtocol/src/systems/predict.ts`
- `/home/user/ArrivalProtocol/src/systems/draft.ts` (`planPacket`) with `/home/user/ArrivalProtocol/src/systems/carry.ts` and `/home/user/ArrivalProtocol/src/systems/transmit.ts`
- `/home/user/ArrivalProtocol/src/state/schema.ts` with `/home/user/ArrivalProtocol/src/systems/save-codec.ts` (and `/home/user/ArrivalProtocol/tests/unit/save/shape-pin.test.ts`)
- `/home/user/ArrivalProtocol/src/systems/guidance.ts`
- New: `/home/user/ArrivalProtocol/src/systems/skill-tree.ts`, `/home/user/ArrivalProtocol/src/data/skills.ts`, `/home/user/ArrivalProtocol/src/components/desk/TrainingWindow.ts`