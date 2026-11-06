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
| **`src/systems/training.ts`** | stateful | `trainCell`, `undoPurchase`, `restoreSkill`, `setPackAs`, `commitTraining`, `FIRST_PICK_ENFORCED` |
| **`src/systems/training-model.ts`** | model | `trainingModel(state)` (Track UI) |
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
  opened: { skill: SkillId; visit: number }[];   // 'after-seeds' / 'poor-ahead' branches latched at openDesk (one per visit)
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
- **The opening rule:** `openBranchesAt(state, visit)` is pure (built in the foundation's review follow-up).
  - A branch with `built: 0` never opens.
  - **`'start'` branches (FLIGHT, LANDING) are derived, never latched:** v1 from visit 1, the higher versions and LOCK RANGE from visit 2.
  - **`'after-seeds'` and `'poor-ahead'` branches are latched into `opened`** at openDesk, because whether one is due depends on past visits' map facts. "At most one new branch per visit" counts only these.
  - Ties go to "the next ship needs it": among the reachable candidates, SURVEY if any has POOR site data, else SENTRY.

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
  - `src/systems/skill-tree.ts`, `src/systems/training.ts`, `src/systems/skill-files.ts`;
  - `src/state/selectors.ts` and `src/types/lineage.ts` (named in the review follow-up);
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
  - `src/systems/landing.ts`, `src/systems/landing-hud.ts`: ROUND in landing only (named in the review follow-up);
  - `src/systems/guidance.ts`, `src/systems/landing-guidance.ts` (ROUND tail only), `src/systems/landing-orbit.ts` (`burnSpanClear`);
  - `src/systems/flight-hud.ts` (AUTO button mode, `lockBracket`, `autoGhost`, Engine pip model), `src/components/hud/plot-draw.ts` + `src/components/tools-view/NavPlotWindow.ts` (bracket and ghost), `src/components/tools-view/EngineWindow.ts` (pip);
  - `src/data/skill-text.ts` (every AUTOBURN line ≤ 70: `armedTail`, `threadWait`, `green`, `round`, `reserve*`, `downgraded*`, `offerMode`, `roundTail`, untrained wording);
  - `src/systems/ops-core.ts` (only if the claim needs a hook);
  - `src/systems/skills.ts` `autoburnStatus()` export (the row's live status, read by UI).
- **Tests:** `skills/autoburn-modes.test.ts`, `skills/guidance-auto.test.ts`; rework of `wp9/autoburn-sim`, `wp9/fix1`, `wp9/fix2`, `wp9/lines`, `wp3/ops-core`, `wp10/held-space`, `lead2/*` skip-press asserts.

**Track UI** (TRAINING tab, Skills window, chips, badges, report and tally lines):
- **Owns:**
  - `src/components/desk/TrainingWindow.ts` (new), `DeskTabs.ts`, `DeskScreen.ts` (the [T] key, the step list, the SET COURSE bar's blocker text);
  - `src/systems/desk.ts` (`deskSteps`, `openDeskWindow`, `deskTabBadges.training`), `src/systems/training-model.ts` (`trainingModel`, `TrainingModel`), `UiState.trainingSel` / `trainingHoldSec`;
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
| `skills.ts` | UI | `skillRow` reads FLIGHT's `autoburn.ts autoburnStatus` (that function is FLIGHT's) |
| `selectors.ts`, `types/lineage.ts` | TREE | ask by message |
| `events.ts` | lead | one-line additions on request; FLIGHT may add its own `autoburn-*` events directly |
| `landing.ts`, `landing-hud.ts` | FLIGHT, for ROUND in landing only | |
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
---

## Deviations (foundation)

Recorded by the FOUNDATION agent. Each item changes §2–§5 above and gives its reason. Behaviour changes only where §5.1
says: phase 2's free install after two captures is gone, and AUTOBURN learns from its last 8 demos (UNTRAINED with none).
The page plays run 1 to the second desk with no console errors, and a run-1 save written before this change still
resumes (checked in Chromium).

### What the tracks stand on

- **Types** (`src/types/skill.ts`): §2.2's model, plus three additions:
  - `CellRow` (`{kind:'version',version} | {kind:'lock',level}`) names a cell;
  - `LostLevel { row, price }` is one lost level;
  - `DemoSkill` / `DemoTuning` are what `demoSkill` returns and reads.
- **Pure cores, implemented:**
  - in `skill-tree.ts`: `visitNow`, `levelAbove`, `fileLevel`, `held`, `paid`, `lostLevels`, `restorePrice`, `earnedCycles`, `bankOf`, `demoSkill`, `autoburnDemoSkill`, `deskBlocker`;
  - in `capabilities.ts`: `skillLive`, `effectiveVersion`, `effectiveLock`;
  - in `run-score.ts`: `shipCycles`;
  - in `skill-files.ts`: `skillFile`, `installSkillFile`, `giveSkill`.
- **Stubs** (they throw through `systems/not-built.ts notBuilt(what, track, ...args)`; the batch review deletes that file once nothing calls it):
  - TREE: `treeCells`, `openBranchesAt`, `grantCycles`, `grantSkill`, `grantAllowed`, `trainCell`, `undoPurchase`, `restoreSkill`, `setPackAs`, `commitTraining`, `skillPacketPlan`, `applySkillPlan`, `applySkillBootLine`, `mountSkillWatch`;
  - UI: `trainingModel`;
  - FLIGHT: `autoModeFor`, `lockRangeTac`, `previewModeBurn`, `planToCircle`, `lockBracket`, `autoGhost`, `burnSpanClear`.
- **Ownership:** each file §5.2 hands to a track carries a `// Slice 4: Track X owns this file …` banner on its first line; the CSS files carry it as a `/* */` comment.

### Deviations

1. **The v1 fixtures were dumped by a one-off script**, not by an `AP_SAVE_DUMP=1` branch in `shape-pin`. The script ran before anything changed and was then deleted: the AUTOBURN fixtures needed phase 2's `trainSkillAtBoot`, which this change removes, so the branch could not have stayed. There are three fixtures in `tests/unit/save/fixtures/`, and each holds `{ save, meta }`, so a suite can resume it against its own archive:
   - `run-save-v1-ship-done.json`: desk 1, with no skill;
   - `run-save-v1-ship-done-autoburn.json`: desk 2, carrying phase 2's AUTOBURN.skl, with `skillTrainedOn: 2`;
   - `run-save-v1-beam-autoburn.json`: the BEAM into KESTREL, with the file in `carried.segs`.
2. **The migration back-fills the earnings, and tops up desk 1.** `RUN_SAVE_MIGRATIONS[1]` does everything §2.14 lists, and two things more:
   - Every ship already ended earns its cycles (`shipCycles`), so `earned.length === ships.length` holds for migrated runs too. A migrated run would otherwise have 0 cycles at its next desk.
   - A SHIP DONE save at the run's first desk on the arm gets the first-pick grant. `openDesk` writes that grant before the save, and a resumed desk never opens again. Without the grant, the required first pick (which `setCourse` will throw on) could be unaffordable, and the run would be stuck.
   - It also records the free `bought` entry when an AUTOBURN file is in the save even though `skillTrainedOn` is null.
   - A result that `shipCycles` can't read earns ARRIVED alone, so the step never throws.
3. **`SkillGrant.installedAtDepth: number | null`** was added, so that a grant is installed only once. This saves slice 5 a save bump.
4. **`OpenRule.minVisit` is a `number`** rather than a literal type, so that the data names it.
5. **`lostLevels(id, held, paid)` takes the skill**, and returns `LostLevel[]` with each price. `restorePrice(lost)` sums them, takes RESTORE_FRACTION and rounds up. All four of the plan's cross-checks hold (8, 7, 5, 3).
6. **`held` and `paid` are componentwise maxima:**
   - `held` takes the file's level, raised by each pending purchase's `to`;
   - `paid` takes the highest level across bought ∪ pending.
   Levels are bought from below, so a lock bought on v1 followed by a v2 reads v2 + lock. The file's level is taken from any copy, healthy or not, because damage is not loss.
7. **`skillLive` counts the online copy that works best** (by effective version, then lock, then integrity), not the copy with the highest integrity. With only one copy the two rules agree; with two, this one never prefers a weaker copy.
8. **One install rule: the licences' rule.** `memory-ops.ts unitInstallAddress` is licences' old `installAddress`, which scans back from the end of memory. AUTOBURN's forward `skillAddress` is gone.
   - The one skill placement check that survives, wp9/fix1's "racks E–F full → the end of rack D's tail, beside the unit", passes unchanged under this rule.
   - `installAddress` is gone from `licences.ts`, and every importer now uses `unitInstallAddress`.
   - `isUnitFileType` moved into `memory-ops.ts` to avoid an import cycle; `data/memory.ts` re-exports it.
9. **`giveSkill(store, id, level)`** (in `skill-files.ts`) is the one helper behind `__ap.skill` and the suites' `giveSkillFile`. It replaces any old file of that skill and records a free purchase (cost 0, visit 0, like the migration does), so a lost file reads `NO AUTOBURN.skl`, not `NOT TRAINED YET`. `harness9.giveSkill(offsets)` now records the demos, gives v1 and returns the file.
10. **Boot lines:**
    - `skillBootLines(state): SkillBootLine[]` is pure. It returns `[]` until TREE fills it.
    - `boot.ts` plans and caches the lines at its first tick, and says each one through `applySkillBootLine(store, line)`. That function is stateful (it updates `announced` and installs grants), so the lines are never re-derived while they are being said.
    - `bootLinePlan(state, skillLines: number)` now takes a count instead of a boolean. `'skill'` repeats with ordinals, as `'delivery'` does.
    - The suites that passed `false` now pass `0`.
11. **`applySkillPlan(memory, plan, makeId): SkillPacketEdit { removed, added }`** is the shape `planPacket` feeds to `packUnit`. Removed ids are the replaced files and the originals that PACK AS lowers; they are internal and never shown as drops. Added files are the fresh files and the lowered copies, and carry's sort key places them.
12. **What AUTOBURN does after FOUNDATION:**
    - its demos come from `autoburnDemoSkill`, which counts the last 8, and a file with no demos fires 7.5 s late;
    - refusals and drops read `skillLive`, which gives the same bands as `liveUpgrades` for v1 and v2;
    - its window is `LOCK_RANGE_TAC[0]` (90);
    - while engaged, `burn.auto.mode` is `'capture'` and `claimed` is true. It still takes its thread at engagement; FLIGHT moves that to the claim.
    - "Ever trained" is `paid(...) !== null` (`autoburnEverTrained`), and it decides the refusal words, whether the AUTO button shows, and the Skills row.
    - The Skills window's NEW pulse now follows `run.skills.bought.length`.
13. **The validator applies "v3 above one ship's pay" only to the branches open from the start.** SURVEY v3 costs 4 and SENTRY v3 costs 5 by 03 §3.2. The repair-fairness check takes the worst drain over `HOLLOW_STAGES` and `SEEDS_ONLY_DEF`, using the larger multiplier. The validator also checks `AUTO_THREAD_CLAIM_TAC === TACTICAL_LEAD_BURN_TAC`, a total of 54 cycles, 34 blocks for a full set, and a largest file of 12 blocks.
14. **The file words live with the tree.** `SKILL_FILE_TEXT` in `data/skills.ts` replaces `UPGRADE_FILE_TEXT.autoburn`, and `type-labels.ts` reads it. AUTOBURN's description is phase 2's, apart from the training wording. `DELETE_CARD_EFFECT` and `TRANSMIT_TEXT.withoutCard` gained placeholder lines for AUTODROP, SURVEY and SENTRY, because the record is exhaustive; TREE writes the real words.
15. **Events:**
    - `'skill-trained'` now carries `{skill, level, kind, demos, accuracy}`. Nothing emits it until TREE's `applySkillBootLine` does.
    - `'skill-version'` and `'autoburn-in-lock'` were added, typed and not yet emitted.
16. **Archive:**
    - `RunEnd.skills?` is optional, and `recordRunEnd` copies it. Callers pass nothing until TREE does, so `LastUnit.skills` stays `null` for now.
    - `parseSkillRecord` refuses an unknown skill, a version or lock out of range, a lock on a skill without LOCK RANGE, an accuracy outside 0–100, and a skill listed twice.
17. **Save checks:**
    - `run.skills` is checked field by field, and `pending` must be empty.
    - `burn.auto` gets no inner check, because the slices are `likeReference` and only top-level keys are compared there. The shape pin holds `burn.auto.*` at depth 3 instead.
18. **Tuning not added:** `AUTODROP_*`, `SENTRY_DELETE_FACTOR` and `V3_STEP_KM`. Their sub-slices add them, so 4a carries no dead numbers. The new constants are in two banner blocks, `4 TREE` and `4 FLIGHT`. `AUTO_DEMO_WINDOW` and `AUTOBURN_UNTRAINED_OFFSET_TAC` sit with the existing AUTOBURN demo numbers, because `demoSkill` (TREE) reads them.
19. **Duplicate boot text left in place on purpose:** `AUTOBURN_TEXT.trained/retrained` (in `skill-text.ts`, FLIGHT's) remains next to the new `BOOT_SKILL_TEXT` (TREE's). When TREE's lines are live, FLIGHT should delete the old pair.
20. **Other shapes:**
    - `deskBlocker` returns null outside the desk phase.
    - `visitNow(run)` is `run.ships.length`.
    - `TransitPlan.packAs` is a mutable `Record<string, SkillLevel>`, so drafts can write it.
    - `Capabilities.upgrades` is now keyed by `CardFileKind`.
    - `predict.ts` exports the types `BurnInputs` and `ApsisTimes`, for `planToCircle`'s signature.

### The model against the later sub-slices and slices

- **4c:** `stats.dropDemos` is already saved. `demoSkill` takes AUTODROP's own tuning. `SkillDef.built` opens the branch. 4c's `landing.autodrop` state will need its own bump (R13).
- **4d:** the `after-seeds` rule and `SENTRY` are in the table. `HollowSegment.disguise` lives in memory, which the save pin treats as opaque. `unitInstallAddress` serves the FIREWALL.
- **4e:** `burn.auto.targetKm` and `AutoMode 'landing-orbit'` are typed. `planToCircle` and `burnSpanClear` are stubbed with final signatures.
- **Slice 5:** `CycleGrant.source` already includes `'resident' | 'story'` and has a `label`. `SkillGrant` has `installedAtDepth`. `grantCycles`, `grantSkill` and `grantAllowed` are stubbed.
- **Slice 6:** SURVEY's `built: 0` and its `poor-ahead` rule are in the table.
- **Slice 7:** `LastUnit.skills: SkillRecord[] | null` is parsed and stored, and `ArrivalSkill.kind 'granted'` exists.

## Deviations (foundation, review follow-up)

The changes after the independent review of `ee06350`, in one commit. The review confirmed `bankOf`, graded damage, the held / paid / lost / restore numbers, the size invariant, the migration's coverage of the fixtures, and the shape pin, and found no import cycles. §2.2 and the §5.2 ownership and hot-file tables above are updated to match.

### Blockers

- **B1. `wp11/full-run` (BALANCE_ONLY) no longer expects KESTREL's boot to install AUTOBURN.**
  - Lead decision: the classic world keeps its coverage by being given the file.
  - Right after the beam into KESTREL, with two or more manual captures, the suite calls `giveSkillFile(h.store, 'autoburn', 1)`. This is a classic-only test setup.
  - The check now reads `AUTOBURN.skl v1 in memory after the two manual captures (given: the classic world has no tree)`.
- **B2. `'start'` branches are derived, never latched.**
  - They open when `built > 0`: v1 from visit 1, the rest from visit 2.
  - `RunSkillState.opened` holds only `'after-seeds'` and `'poor-ahead'`, and "one new branch per visit" counts only those.
  - Changed together: `types/skill.ts`'s comment, §2.2, and `openBranchesAt`.
  - `foundation.test`: the migrated desk-1 fixture, once the pick is pushed as pending, clears `deskBlocker`.

### Majors

- **M1. The migration keeps `announced`.** `announced.autoburn` is phase 2's `skillTrainedOn` when that was a number. Otherwise it is the demo count if a file is carried, else null. `foundation.test` asserts it on all three fixtures.
- **M2. `treeCells`, `openBranchesAt` and `skillRows` are implemented.** They are pure reads over `held`, `paid`, `fileLevel`, `bankOf` and `SKILL_TREE`, and TREE may refine them as long as their tests stay.
  - A cell's look and refusal are checked in this order:

    | Order | When | Look / refusal |
    |---|---|---|
    | 1 | the file covers the row | `owned` / `owned` |
    | 2 | a pending purchase covers it | `pending` / `owned` |
    | 3 | it is paid but not held | `lost` / `lost` |
    | 4 | the branch or row is not open | `closed` / `closed` |
    | 5 | the version is above `built` | `unbuilt` / `closed` |
    | 6 | otherwise | `affordable` (no refusal), or `dim` with `not-desk`, then `needs-lower`, then `unaffordable` |

  - `TrainRefusal` gains `'lost'`, because RESTORE is the way back for a lost cell.
  - `seedsMet` (for `'after-seeds'`) reads `stagesPlayed` `'seeds'`, TRACE, `fed`, the last tally, and the current arrival's seeds. **For 4d:** a tie can push SENTRY a visit past that evidence, so 4d may want a sticky record of the first ship that met a seed. SENTRY is not built yet.
  - `poorAhead` reads `reserved.site` of the ships reachable from here, on the arm only.
  - `tests/unit/support/skills.ts` gains `pendPurchase(store, purchase)`, a raw push to `pending`, for the UI suites' pending, owned and lost states.
  - `foundation.test` covers:
    - desk 1: AUTOBURN v1 affordable, v2, v3 and LOCK RANGE closed, the other branches closed;
    - desk 2: v1 owned, v2 dim when the bank can't pay, v3 unbuilt, LOCK 810 needing 270;
    - desk 2 with the file eaten: v1 lost, v2 needing v1 first.
- **M3. Ownership is split cleanly.**
  - `trainingModel` and `TrainingModel` moved to `systems/training-model.ts`, which is UI's.
  - `autoburn.ts autoburnStatus(state): { text, tone }` is FLIGHT's, and is built (not a stub). It holds the status rule that used to be inside the Skills row, unchanged.
  - `skills.ts autoburnRow` (UI's, to become `skillRow`) now reads `autoburnStatus`.
- **M4. `tests/unit/support/desk.ts setCourseFromDesk(store, slot)`** makes the first pick when `deskBlocker` asks for it, then sets course.
  - The arm's `setCourse` callers moved onto it mechanically: 17 sites in 7 files (repository, desk-flow, repo-fixture, link-over, delivery-packet, run1-route, save/resume).
  - The classic world's `support/classic-flow.ts` keeps `setCourse`.
  - `__ap.course` makes the pick itself through `trainCell`.
  - **Deviation:** both helpers are gated by `training.ts FIRST_PICK_ENFORCED = false`. `trainCell` and `commitTraining` are still stubs, endShip records no earnings yet, and a pending purchase can't be saved. Making the pick today would throw, or would write a BEAM save the codec refuses. TREE sets the flag to `true` in the same change that lands the `deskBlocker` throw in `setCourse`, and no other suite needs touching.

### Minors

- **Grants.**
  - `PurchaseKind` gains `'grant'` (cost 0), pushed by `grantSkill` (still a stub), so a granted skill that is later eaten is lost and can be restored by the same rule.
  - `GrantRule = 'card' | 'gift'`. Both `grantSkill` and `grantAllowed` take it.
  - The save accepts `'grant'`.
- **Migration edge.** A v1 SHIP DONE or BEAM save from after the second capture, but before the boot that would have installed AUTOBURN, had an install owed. That boot never comes now. The test for it: no file, two or more demos, and more demos than it was last trained on. The run is paid AUTOBURN v1's price, 3 cycles, as a `'migration'` grant (a new `CycleGrant.source`), so the kid can buy it back at the next desk.
  - The review named BEAM only. SHIP DONE has the same gap, because its next boot also never comes, so both are covered.
  - `foundation.test` asserts it.
- **FLIGHT signatures.**
  - `planToCircle` returns `BurnPoint | null` (null once the loop is that circle).
  - `burnSpanClear(state, sol, startInSec, burnSec)` takes the state, because the drop solution's windows carry no room or bay data.
- **UI state.** `UiState.trainingSel: { skill; row } | null` (the cell chosen by a click or by [1] / [2]) and `trainingHoldSec: number | null` (the TRAIN bar's hold). Both are cleared by a world reset and not saved.
- **`isSkillFile`** now reads `SKILL_IDS.includes(seg.upgrade)`. `assertMemoryInvariants` uses the same test, and throws on a skill-kind upgrade file that has no version or lock.
- **Ownership gaps**, now named in §5.2:

  | File | Owner |
  |---|---|
  | `state/selectors.ts` | TREE |
  | `types/lineage.ts` | TREE |
  | `systems/events.ts` | lead, with one-line additions on request; FLIGHT may add its own `autoburn-*` events directly |
  | `systems/landing.ts`, `landing-hud.ts` | FLIGHT, for ROUND in landing only |

### Notes for the tracks (not built)

- **TREE:**
  - **`checkSavedRun`** should also check:
    - `bankOf >= 0`;
    - `earned.length === ships.length`;
    - every skill-kind upgrade segment in memory or `carried.segs` has a `version` and a `lock`;
    - `arrival.skills` gets a real check (today it is `anyRecord`).
  - **`deskBlocker`** should return null when any skill is already paid (a migrated run that kept its AUTOBURN).
  - **`undoPurchase`** throws outside the desk phase.
  - **`run.ts` order:**
    - the first-pick grant goes inside openDesk's `store.update`, before `writeRunSave('ship-done')`;
    - `commitTraining` runs before `startShip` in `transmitNext`, so the BEAM save holds no pending purchase;
    - set `FIRST_PICK_ENFORCED = true` in the same change.
- **FLIGHT:** update the stale wording in `skill-text.ts` (~line 78, `NO AUTOBURN YET — capture by hand…`, which becomes `NO AUTOBURN — train it between ships`) and in `docs/playtest-checklist.md` (~line 32).
- **UI:**
  - Read `offline` before `band` when showing `skillLive`, so a copy being repaired doesn't read as dead.
  - The Skills window's NEW pulse fires on a migrated resume (`bought` goes 0 → 1). Suppress it for cost-0, visit-0 purchases.


## Deviations (Track TREE)

Recorded by Track TREE (branch `tree-4`, from `f9ee3c1`). The unit tier is green at 118 s on 4 workers (181 passed, 6
balance-only skipped). Each item changes §2–§5 above, with its reason.

### The model and the desk

1. **The levels are a leaf module, `systems/skill-levels.ts`** (`visitNow`, `levelAbove`, `fileLevel`, `held`, `paid`,
   `lostLevels`, `restorePrice`). `skill-tree.ts` re-exports them unchanged. The reason is an import cycle: `skill-tree.ts`
   imports `map-hop` for `poorAhead`, and DELETE's confirm (`tool-targets.ts`) needs RESTORE prices, so importing the whole
   tree there broke the classic five's load order (`layoutFor` undefined at `validateShipDef`).
2. **`deskBlocker` and the first-pick top-up both read `anyPaid(skills)`**, meaning a level bought or pending on any skill.
   A run that already paid for a skill gets no top-up, no blocker, and its first desk opens on the card. `run.ts
   firstPickTopUp(state)` is exported for the views.
3. **The classic world has no tree.** `openBranchesAt` returns `[]` there, so every cell is closed, and `trainCell` and
   `restoreSkill` refuse with `'closed'`. Earnings are still recorded on every world.
4. **`branchToLatch(state, visit)`** (skill-tree.ts) names the `'after-seeds'` / `'poor-ahead'` branch that `openDesk`
   latches. `training-flow` checks the latch with SENTRY's `built` raised for that one check, because 4a builds AUTOBURN
   alone.
5. **`trainCell` and the grid share one rule.** The refusal is `treeCells`' own cell refusal, so the look and the buy never
   disagree. A version keeps the held lock, and a lock keeps the held version.
6. **`commitTraining` does not check the phase.** It runs inside `transmitNext`, and also inside `__ap.slot` / `__ap.route`
   (debug's arrive), so a desk's purchases cross there too. It re-reads the bank afterwards, which throws below 0.
7. **Grants (slice 5's interface) are built.**
   - `grantCycles` refuses anything but a positive whole number.
   - `grantSkill` writes a `SkillGrant` plus a cost-0 `'grant'` purchase that keeps the paid lock.
   - `grantAllowed`:
     - never above `built` or into a closed branch;
     - a `'card'` only gives v1 of a skill never paid for and not held;
     - a `'gift'` only gives a version above the paid one.

### The packet

8. **`PacketPlan.skills: SkillPacketPlan` is required**, so every caller says what training does to its packet.
   - `draft.ts transitPacket(state, plan, makeId)` is the shorthand for a transit plan. It is what the PACKET's model, its
     toggles, `pickCard` and `transmitNext` call.
   - `NO_SKILL_PLAN` is the empty plan.
   - `ArrivalPlan` gains an optional `packAs` instead of `skills`, because the pending purchases are read from the state.
     Left out, nothing is packed lower, which is right at the desk (UI's SHIP CARD and TRAINING preview need no change).
9. **PACK AS lowers the version and keeps the lock**: `skill-files.ts lowerLevels`, matching §3 step 7's `PACK AS v1 (7) ·
   RESTORE 3` for v2 + 270. `setPackAs` accepts any level below the file's (the lock may also go down), and throws otherwise.
10. **The packed copy keeps the original file's id**, as well as its integrity and infection. The transit hits, the boot's
    flashes and `ArrivalReport.skills` then all find the file the kid chose.
11. **PACK AS and the drops exclude each other.**
    - Leaving a packed file behind forgets its PACK AS (`toggleDrop`).
    - PACK AS on a file left behind takes it back at that level.
    - `planPacket` throws on a file that is both dropped and replaced or packed lower.
12. **`Packet.skills: PacketSkill[]`** (carry.ts) names each fresh or packed-lower file. The PACKET's chips and
    `run.ts arrivalSkills` (`ArrivalReport.skills`: trained, restored when every purchase behind it was a RESTORE, packed,
    or carried) read it.
13. **The `'trained'` DropLock is never returned by `dropLock`.** A fresh file is not in memory, so `transmit.ts` adds its
    chip as locked, and `toggleDrop` on it returns `'locked'`. The file it replaces has no chip.
14. **`PacketChip.skill: SkillChip | null`** carries:
    - the level it crosses at, and its nominal level;
    - `trained`, `packedAs`, and the RESTORE price if it is left behind;
    - `packAs: PackAsOption[]`, each with its level, blocks, RESTORE, `active` and text.

    Skills sort last among the files that can stay behind (`SKILLS_LAST`).
15. **`skill-files.ts skillRelief(state)`** lists, cheapest RESTORE first, each skill file not trained here: left behind,
    or packed at each lower version, with the blocks it frees. It is for the cheapest-to-leave hint (§1.1 4b item 5).
    UI's `trainingModel` can read it.
16. **Rack E's sort key** puts skills after the AI tools *and the card files*, in `SKILL_IDS` order.

### The +2 CYCLES card

17. **`UpgradeForm 'cycles'`**, with the tag `TRAINING`, and `CYCLES_CARD_CYCLES = 2` (tuning, in the TREE block).
    - `DraftContext.tree?` and `DraftContext.toFinal?` are optional. `draftContext` / `dealDraft` take the destination as
      `room.to`.
    - The card is last in the pool and filtered before the draws, so classic deals are unchanged. Arm deals now include it
      in their pool.
    - When picked, it is **not** pushed into `run.upgrades`. `commitTraining` writes a `'salvage'` grant instead.
    - **Forced one-line touches outside TREE's files, to keep `tsc` green:**
      - `data/script.ts DRAFT_FORM_TAG.cycles`;
      - `systems/skills.ts` (UI's): `case 'cycles': continue;`;
      - the `Record<UpgradeId, …>` literals in `wp8/draft` and `wp8/p2/ui-models`.

### The boot, the watcher, the end

18. **At most one skill line per skill per boot.** A pending grant comes first, then a file trained or restored at the last
    desk. A carried or packed file gets `RETRAINED` only when the skill was announced before (`announced !== null`) and the
    demos have grown since. Files that were never announced therefore get no line, which covers the suites' `giveSkillFile`
    and the classic world, and keeps the classic boot plans byte-equal.
    - Saying a line sets `announced` to the demo count, or to 0 for a skill without demos.
    - A granted skill is installed in place of the old file.
    - The ONLINE stamp hangs on `'skill-trained'`.
    - From 10 captures on, `TRAINED`'s `from your n captures` becomes `from n captures`. The longer form would pass 70
      characters (`training-flow` checks every boot and PACKET skill line with worst-case numbers).
19. **`mountSkillWatch` is mounted by `mountRun`**, so `main.ts` needs no change and the suites get it too. It emits only
    in `flight` and `landing`: elsewhere, including a grant installed at the boot, it follows silently.
20. **`RunEndModel.skills: RunEndSkills | null`** gives `{ trained, total, unspent, unspentLine, tallyLine }`, on the arm
    only.
    - `trainedCycles` counts every paid level at its cell's price, whether lost or free.
    - `LastUnit.skills` is `[]` for a run that ended holding no skill file. It stays null only for abandons.
21. **DELETE's confirm on a skill file** is `PACKET_SKILL_TEXT.deleteEffect`: `No AUTOBURN until a desk's RESTORE (5
    CYCLES).`
    - The placeholder skill entries in `tool-text.ts DELETE_CARD_EFFECT` and `script.ts TRANSMIT_TEXT.withoutCard` are no
      longer read for skills. They stay because both records are exhaustive.
    - The RESTRICTED rows are built from `SKILL_IDS`, so there are four `.skl` rows.

### The save

22. **`checkSavedRun` also checks:**
    - one earning per ended ship, each on that ship's slot;
    - a bank of at least 0 (a `bankOf` throw becomes a shape refusal);
    - `version` and `lock` on every skill-kind upgrade file, in both the world's memory and the boot's `carried.segs`;
    - `arrival.skills` field by field.

    Because the earnings check comes first, the codec suite's `ships.pop()` route case pops the earning too.

### Tests and debug

23. **Test edits outside the new suites:**
    - `map/link-over`: the first pick's AUTOBURN v1 (6) takes the spare Telemetry copy's 6 blocks, so the narrative's
      numbers stay the same.
    - `map/repository`: the first desk opens on TRAINING, and there are six restricted rows.
    - `map/delivery-packet`: the "nothing upgrades" check looks for the patch file only.
    - `save/codec`: five new shape refusals.
24. **Debug:**
    - `__ap.bank()`, `__ap.train(id, row)`, `__ap.undo(index?)`, `__ap.restore(id)`, `__ap.packAs(segId, version | null)`
      and `__ap.tree()`;
    - `__ap.cycles` goes through `grantCycles`;
    - `__ap.slot` / `__ap.route` record the earnings of the skipped ships.

## Deviations (Track FLIGHT)

Recorded by Track FLIGHT (branch `flight-4`, merged with `tree-4`). Each item changes §2.9, §5.2 or §7 above and gives
its reason; the measurements are from `skills/autoburn-modes`, `skills/lock-range` and a Chromium check on KESTREL.

### What is built

- **Modes** (`autoburn.ts`): `autoModeFor` as §2.9; `lockRangeTac` reads the effective lock; `previewModeBurn(state, mode,
  pred?)` takes an optional prediction (the HUD passes its sensed one; default the cached true one, so it is not strictly
  pure); `roundAim` picks ROUND's circle (R2); `autoOfferMode`, `autoArmedBurn`, `autoFlyingKind` and `autoburnDoneLine`
  feed the strip and the HUD. `autoburnStatus` gains `UNTRAINED 40%`, `WORKS AS v1 — REPAIR IT FOR v2`, the mode and the
  thread wait.
- **Planner** (`predict.ts`): `'round'` BurnReason; `planToCircle` over a new `circleStep` (the stop reads the same rule on
  the ship's exact state); `planModeBurn(state, pred, mode, targetKm)` plans a mode from the prediction's scalars (no
  path walk) for the preview; `noShrink` in BurnInputs for GREEN; `landingInRingBurn` suppressed while engaged.
- **Machine**: the claim at `AUTO_THREAD_CLAIM_TAC`, the late fire, re-arm between v2's burns, the reserve, downgrades,
  takeovers by phase, and `'autoburn-in-lock'` on entering the bracket.
- **Landing**: `burnSpanBlocks` (the LZ a burn span would cost; `burnSpanClear` is its boolean), and `landingBurnOffer`
  always offers an engaged AUTOBURN's burn (pace's TACTICAL lead and the SKIP stop), whatever was declined or latched.
- **HUD**: `lockBracket`, `autoGhost` (gains `omega`, ▼'s direction), `autoLateTac` (the chip's `AUTO LATE 00:03 ·
  NEEDS A THREAD`), `autoburnPip`, mode heads and notes; the NAV PLOT's bracket, `LOCK` label and dashed ghost; the
  Engine window's AUTOBURN pip.
- **Guidance**: §2.9's precedence and tails, the thread-wait row, TRIMMING / ROUNDING, v2's hand-backs, AUTO rows in
  landing's L2, L13's tail (`LandingFlight.autoTail`, optional in `LandingContext`).

### Deviations

1. **ROUND's circle in landing re-aims to ▲'s altitude, one burn at ▲** (the other-apsis rule). When both apsides' burns
   cross a window it rounds at ▼ and says `AUTOBURN: ROUND COSTS LZ-B's WINDOW` on the radio at the press (not on the
   strip). The rule applies to ROUND only. A GREEN trim in landing (an accepted orbit) fires at its apsis whatever the
   window: moving a trim to the other apsis changes which end it fixes, and with the planet not rotating it would wait
   for ever. Measured on KESTREL: with ▼ at 60° its ROUND burn crosses LZ-B's window, and the rule rounds at ▲ (2,910 km)
   instead, losing no window.
2. **The predictor's cache is keyed by the engaged mode** (`predict.ts` `cachedAuto`): an engagement replans at once.
   Without it the armed machine read the pre-press plan (nothing to fly in the ring) and stood down.
3. **A GREEN trim burns while the plan's burn is the same burn this pass** (same reason, apsis and preset, approaching or
   due), not while its START BURN is "due": that tick moves later as the remaining burn shrinks, and the trim re-fired in
   slices.
4. **The fuel reserve also refuses the press** (`SAVING FUEL`, `AUTOBURN KEEPS 20% FUEL — this burn is yours`) when the
   mode's first burn is a trim or a ROUND burn under it; armed, the same check ends it `'reserve'`. Never the capture.
5. **v1 refuses in LANDING as FLIGHT OVER**, as before; a v2 file damaged to v1 does too. A v1 capture engaged in the
   flight ends `'flight-over'` at the lock; GREEN and ROUND go on into LANDING on the same orbit.
6. **Refusal words**: `threads` is gone (the claim replaced it); `tooFar` reads `TOO FAR FROM THE BURN` with the line
   `TOO FAR — [B] works once the ship is in the LOCK bracket` (one line for every lock level and mode); new `round`
   (`ALREADY ROUND`), `impact` (`FIX THE PATH FIRST`) and `reserve`.
7. **The mode and its circle stay on `burn.auto` after `done`/`dropped`** (cleared at idle), so the hand-back words know
   what ended. Two module flags never saved (no save is mid-flight): the burn in hand (`flying`) and whether this
   engagement captured (`captured`, for `CAPTURED, NOT GREEN`).
8. **AUTOBURN's marks on the NAV PLOT and the pip are styled inline** (CSS custom properties in `style`), because the CSS
   files are Track UI's. Neither is drawn on a blind plot (PATH UNCERTAIN, NO SIGNAL). The ghost shows while engaged or
   while [B] would engage it (inside the bracket), not across the whole coast.
9. **The Engine pip is built by EngineWindow**, not WindowGrip: a skill is no CapabilityRole. It is appended to the
   window's pip row on the first paint that finds it and jumps to the file on a click.
10. **Tests**: `wp9/autoburn-sim`'s quick-depth capture (offset 0) moved into `autoburn-modes`'s trained run (R11); its
    −8 / +8 run at full depth. `wp9/fix2` holds no AUTOBURN case, so nothing was cut there. No `round-sweep`
    BALANCE_ONLY suite was written (time); the measurements below come from the quick suites.

### Measurements (KESTREL, quick suites)

- **R1, ROUND in the flight vs in landing.** After KESTREL's capture the loop is in the ring with e ≈ 0.0105 (TOO WIDE path:
  e 0.0028 after GREEN's trims). ROUND's burn at ▼ is a whole loop away (658 tac s), so LOCK 90 and 270 refuse it in the 3 s
  of HOLD STEADY; only LOCK 810 offers it. Pressed there, it stays armed through the lock and rounds in LANDING: e 0.0105 →
  0.0045 for 0.4% FUEL, one loop later. From a locked e = 0.05 ellipse in landing: one burn at ▼, e → 0.0045, 3.0% FUEL.
  ROUND is a landing tool, as R1 said.
- **GREEN from TOO WIDE**: capture (100 → 43.5%), trim at ▲ (rp-high, → 36.7%), trim at ▼ (ra-high) into the ring: FUEL
  100 → 28.3%, three burns, one [F] per coast.
- **R2, a window lost**: none with the other-apsis rule (above). A ROUND burn lasts a few tac s at KESTREL's thrust.
- **R6, the claim**: both threads busy from T−8, one freed 3 tac s after START BURN: the capture fired 3 s late and still
  ended in the ring (FUEL 28.6%, the same as on time).
- **R3, untrained vs trained (v1, corrected KESTREL)**: untrained fired 7.0 tac s late (▼ came first) and ended CAPTURED with
  ▼ 3,040 km, ▲ 3,841 km, a trim left, FUEL 27.9%; trained [0, 0] fired on the tick and ended in the ring (▼ 3,433, ▲ 3,578),
  FUEL 28.6%.
- **LOCK bracket** 300 tac s before KESTREL's capture: 90 → 270 → 300 tac s (the whole coast left).

### Patches requested from other tracks

- **UI (`audio-cues.ts`)**: `'autoburn'` with `to: 'armed'` now also fires on each re-arm between v2's burns; chime only when
  `from` is `'idle'`, `'done'` or `'dropped'`. Map `'autoburn-in-lock'` to the chime (03 §4).
- **UI (`game.css`)**: move the inline styles of `.np-auto-ghost`, `.np-lock`, `.np-lock-label` and the Engine pip
  `[data-skill="autoburn"]` into the stylesheet.
- **UI (`MiniHud.ts`)**: `AUTO_MINI_TEXT.armed` says BRAKES for trims and ROUND too; read `autoArmedBurn` for the kind.
- **Lead (`script.ts`)**: the `AUTOBURN READY` tutorial fires whenever `autoburnAvailable`, now also in LANDING for v2;
  limit it to the flight, and add 03 §4's one-time v2 line (`AUTOBURN v2 — [B] makes it green. [B] on green makes it round.`).
- **Lead (`AGENTS.md`)**: "AUTOBURN v2 (trims to green)" is no longer "designed but not built".

## Deviations (Track UI)

Recorded by Track UI (branch `ui-4`, from `f9ee3c1`, with `tree-4` and then `claude/modest-hawking-209t0f` (TREE + FLIGHT)
merged in). New suite `skills/ui-models` (43 checks, under a second). Checked in Chromium at 1440×900, 1280×720 and
390×844 on run 1's worked route, by the desk's own keys where the shot is about them (`tests/.out/ui-4/`).

### What is built

- **TRAINING [T]** (`components/desk/TrainingWindow.ts`, model `systems/training-model.ts`): visit 1's cards under `CHOOSE
  YOUR FIRST SKILL` (AUTOBURN v1 alone, R5) with ARRIVAL CONTROL's line, [1] [2], TRAIN / ENTER and the 1.5 s bar
  (`TRAINING AUTOBURN v1 · from your 1 capture`, op chirps, `lockArp`), the `TRAINED` stamp, `n CYCLES · SAVED FOR NEXT TIME`
  and `MORE SKILLS OPEN AS YOU GO`; from visit 2 the grid (a column per open branch, LOCK RANGE on a side axis, traces lit
  from the parent, `OPENS LATER` rows), the detail with a looping mini-demo and TRAIN or RESTORE, UNDO beside each
  purchase, the AHEAD row, the packet preview and the `LAST UNIT TRAINED:` line. The bank rolls down on a purchase. On a
  phone the branches are an accordion with the newest open.
- **The desk** (`systems/desk.ts`, `DeskScreen`, `DeskTabs`): the `A SKILL` step first on the arm's first desk, the
  TRAINING tab and its pulsing `n CYCLES` badge, [T], ENTER / [1] [2] / ↑ ↓ routed to the open tab, SET COURSE reading
  `CHOOSE YOUR FIRST SKILL` (and refusing with a buzz that opens the tab) while `firstPickWaits`. The actions
  `selectTrainingCell`, `stepTrainingCell`, `startTrainingHold`, `advanceTrainingHold`, `cancelTrainingHold` and
  `undoTraining` drive TREE's `trainCell`, `restoreSkill` and `undoPurchase`.
- **Reports**: the LANDING REPORT rolls up `TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4` / `PERFECT LANDING · +6` /
  `… NO DESK AHEAD` under the charge, with `+2 CYCLES · FIRST SKILL ON THE HOUSE :)` after a run's first ship below the
  floor (`cyclesReport` over `shipCycles`); RUN END shows `UNSPENT n` under the rank and the tally `TRAINED n of 54 ·
  UNSPENT n`, from TREE's `RunEndModel.skills`.
- **The PACKET**: skill chips over TREE's `PacketChip.skill` (the file name as the tree writes it, the version badge, `→
  brake by hand · RESTORE 5`, PACK AS buttons in the same grid cell, the dashed `TRAINED HERE · ◀ CHART TO UNDO` chip).
- **Graded damage on screen** (`systems/skills.ts`): `skillFileView` (badge `v2▸v1`, offline read before the band, the
  INSPECT line `v2 · 64% · WORKS AS v1 · REPAIR TO 80% FOR v2 (≈ 3 CHARGE)`), `skillTickZones` (the bar's ticks at 80, 50,
  25 labelled `v2 | v1 | off` on a wide chip and in its tooltip), one Skills row per skill with pips `▮▮▯` and a version
  line (lock, the repair estimate, `LOST v2 · RESTORE 3 AT THE NEXT DESK`), and `skillVersionStamp` for the stamps
  (`AUTOBURN v2 → v1`, `AUTOBURN v2 RESTORED`), the 400 ms badge flicker and the sounds. The ONLINE stamp hangs on
  `'skill-trained'`.

### Deviations

1. **The cycles report line, the run-end lines and the stamps' rule live in UI's files** (`training-model.ts cyclesReport`,
   `skills.ts skillVersionStamp`); `landing-report.ts` (UI's since 3c, unlisted in §5.2) is untouched. The LANDING REPORT
   computes the line from its own tally (`points`, `aboard`) through `shipCycles`, the same earning `endShip` records.
2. **`TRAINING_HOLD_SEC` (1.5), the report's roll timing and the bank's roll are view constants** in UI's files, with their
   WHY, rather than in `tuning.ts` (TREE's after the FOUNDATION).
3. **The guidance step's label is `A SKILL`** (the strip reads `1 A SKILL · 2 A SHIP · 3 A FILE · 4 SET COURSE`), not
   `TRAIN`, to match the other steps. Its done-ness and SET COURSE's wait read one rule, `desk.ts firstPickWaits`
   (`FIRST_PICK_ENFORCED && deskBlocker`).
4. **Keys**: ENTER trains while TRAINING is open and its selection can be trained or restored, else it sets course; SPACE
   always sets course. ↑ ↓ move through the grid while TRAINING is open (from visit 2); ← → keep cycling the ships, so the
   AHEAD row follows the chart. [1] [2] pick a card on visit 1 and request a row on the REPOSITORY. ESC stops a filling bar.
5. **The grid's default selection** is the first cell TRAIN can buy, else the first lost one (RESTORE), else the first dim
   one; visit 1 starts with no card chosen until [1] or a click.
6. **The AHEAD row leaves out SITE DATA** (POOR plays GOOD until slice 6, so it would mislead) and writes the noise without
   its middle dot (`NOISE SEVERE 3`), so the worst case fits 70 characters: `NEXT: GOOD HOPE · ARK · 16 PODS · MEMORY 384
   COMPACT · NOISE SEVERE 3`.
7. **The preview's binding word** when everything fits is whichever of the link and the room is smaller; when it does not
   fit, §2.5's `overLink >= over`. Its hint is UNDO when this desk bought something, else the cheapest PACK AS that frees
   enough (TREE's `skillRelief`), else LEAVE FILES BEHIND.
8. **The Skills row does not repeat `WORKS AS v1`** when FLIGHT's `autoburnStatus` already says it; its version line keeps
   the repair estimate in CHARGE. Skills not built yet (AUTODROP, SURVEY, SENTRY) read `v1 READY` until their tracks add a
   status.
9. **A fall to OFF because the counting copy went offline** (the kid's repair or move) stamps nothing and plays nothing; the
   chip says `↻` and INSPECT `OFF WHILE IT IS REPAIRED`. The restore stamp plays `driverSaved` and a loss `sombreFall`
   (`soulLost` / `clusterSaved` are not cues any more).
10. **The NEW pulse** follows bought purchases that are not free (cost 0 at visit 0), so a migrated resume or a `?debug` gift
    does not pulse.
11. **FLIGHT's requests, done here**: the NAV PLOT's `.np-auto-ghost`, `.np-lock` (`.inside` brighter) and `.np-lock-label`
    and the Engine pip `[data-skill="autoburn"]` are styled in `game.css` (NavPlotWindow toggles a class instead of an
    inline opacity); the armed chime only on a fresh arm; `MiniHud` reads `autoArmedBurn` and `AUTO_MINI_TEXT.armed` (in
    FLIGHT's `skill-text.ts`, a one-line widening) takes the burn kind: `BRAKES` / `TRIMS` / `ROUNDS`.
12. **Not built**: the trace "lights from its parent" as an animation (the trace is lit or not); the 4-second mini-demos are
    CSS loops of a few SVG shapes per cell kind, not real plots.

### Requests

- **Lead**: `skills.ts` keeps TREE's `case 'cycles': continue;` (the +2 card is never in `run.upgrades`, so it has no row).
  The e2e `map-desk` / `phone` / `playthrough` checks that read the desk's step list or tab labels will see `A SKILL` first
  and four tabs (labels unchanged: a tab's `[R]` is now its own span, hidden under 1440 px).
