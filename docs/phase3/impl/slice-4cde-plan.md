# Slice 4c–4e plan: AUTODROP, SENTRY, AUTOBURN v3

**Lead decisions (2026-11-06).**
- **Recommendations:** all of R1–R21 are adopted as written. Fran asked for a playtest once slice 4 is complete and said
  that most open calls will settle as the full plan lands. So the [FRAN] items (R4, R5, R9, R10, R13, R15) are built as
  recommended here, and reported to Fran with numbers after the batch, not asked beforehand.
- **R20, retiring the classic world:** this is engineering only and changes no gameplay. Its phases 2–3 migrate 166
  suites. They are therefore split off and run after Fran's playtest of slice 4, not before it.
  - Phase 1, the parity probe that moves the authored ship data into the arm's own file, runs in the fix pass only if
    it is small and safe. Otherwise it waits with phases 2–3.
- **Save ownership:** the lead owns the save. The FOUNDATION makes the single v3 → v4 bump. A track that needs a new
  saved field asks the lead; it never bumps the save itself.

I wrote this from HEAD ff09a80 on `claude/modest-hawking-209t0f`. Paths are relative to `/home/user/ArrivalProtocol`. The
spec is `docs/phase3/03-skills.md` ("03"). `§` cites 03 unless another spec is named: 01 is `01-landing.md`, 04 is
`04-threats.md`. "Plan 4" is `slice-4-plan.md` with its Deviations sections, which describe the 4a+4b code as built.
"Review 4" is `slice-4-review.md`. The format and the process follow plan 4.

---

## 0. Lead summary

### 0.1 What the player gets

- **4c AUTODROP (the LANDING branch).** At the run's first desk the kid now chooses between two cards: AUTOBURN v1 and
  AUTODROP v1 (3 CYCLES · 4 BLOCKS).
  - **v1 CENTRE:** hold [L] in a window. Each volley is timed around the bracket's centre, and every pod leaves inside
    the sure window (`+200 LANDED · LZ-A · BULLSEYE`).
  - **v2 PASS:** set this pass's split in the POD BAY (`A ×2 · B ×1`) and press [G]. The pass flies itself, also from
    the MIND, holding one Core thread per window.
  - **v3 PLAN:** a plan table (`PLAN · 2 PASSES · A 1,000 · B 800 ✓`). One [G] lands the whole ship, with one [F] per gap
    between passes.
  - The kid's own launches train it (AIM, from `run.stats.dropDemos`).
- **4d SENTRY (the DEFENCE branch), and disguised seeds.** From depth 5 a beam seed may arrive disguised as a harmless
  2-block file (`cache.tmp`). Without SENTRY a SCAN unmasks it (`NOT A FILE`). SENTRY opens at the first desk after the
  first seeds (visit 3 on the worked route).
  - **v1 SIGHT:** the boot names every disguised seed (`> ECC: cache.tmp IS A SEED · RACK D`), and a seed that lands
    later is reported with its rack.
  - **v2 QUICK RM:** rm on a seed takes 1.0 s instead of 2.0 s, and DELETE can be aimed at HOLLOW's blinking outline
    (`PRE-EMPTED`).
  - **v3 FIREWALL:** a fresh FIREWALL.sys is compiled at every boot, up to two.
- **4e AUTOBURN v3 LANDING ORBIT.** [B] flies to the highest round orbit where every LZ that still needs pods gets a sure
  window, and holds it there:
  - a dashed ghost circle labelled `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL −9%`;
  - `AUTOBURN v3 GOES LOWER` when a bite widens a drop;
  - small top-ups against decay, burned away from the windows.

  In LANDING it is `[B] · MOVE TO LANDING ORBIT`. It never steers.

The end of slice 4 also **retires the classic world** (§9). That is a separate, sequential track after 4e, and it is
bigger than "small": about 150 of the 190 unit suites build the classic world by default.

### 0.2 Process

FOUNDATION (§7.1, one agent) → independent review → three parallel tracks in worktrees (DROP, SENTRY, ORBIT; §7.2) →
merge SENTRY, then DROP, then ORBIT → full review → fixes → unit tier (budget 265 s, cap 300 s) → one e2e run → RETIRE
(§9, sequential) → AGENTS.md. 4c, 4d and 4e share **one** save bump, made by the FOUNDATION (R1).

### 0.3 Risks and open questions

Items tagged **[FRAN]** are gameplay calls for the designer. Every other item has a recommendation the lead can adopt.

1. **R1. Parallel tracks cannot each bump the save.** Plan 4's R13 said "a bump per sub-slice that adds state". With 4c,
   4d and 4e in parallel, three bumps would collide in `save-codec.ts`, `shape-pin.test.ts` and `RUN_SAVE_VERSION`.
   **Recommend:** the FOUNDATION makes one bump, v3 → v4, holding every new saved field of all three sub-slices (§2.2).
   The tracks add none. A track that finds it needs another field asks the lead, who decides between folding it into
   v4 before the first merge and an extra bump.
2. **R2. No mid-flight or mid-landing save is needed.** Decision 5 still holds: a reload mid-ship replays the ship from
   its boot. Saves happen only at RUN START, SHIP DONE, BEAM and ENDING CHOSEN, and every new machine is at rest at all
   four. **Recommend:**
   - keep all of the new machines' state in the store anyway, never in modules (review 4's warning, and FLIGHT
     deviation 7's fix);
   - have the codec check that the machines are at rest at every save point, as `pending` is (§2.2);
   - allow module-level state only for caches and sound edges, each listed in §2.3.
3. **R3. The LandingController module variable outlives its file** (1a's note, plan 4 debt 7). **Recommend:** a
   registry of resolvers. `activeLandingController(state)` asks them in a fixed order (MERGE 7, resident 5, AUTODROP),
   so a controller dies with its file. The FOUNDATION builds it, behaviour-neutral (§2.4).
4. **R4. [FRAN] What a short tap on [L] does when AUTODROP v1 works.** 03 §2 says "hold [L]: AUTODROP waits for the
   centre", so a tap released before the centre launches nothing.
   - **Recommend:** with v1 working on the SHIP screen, [L] pressed while a sure window is open or within GET READY
     (8 tac s) is a hold. Released before the first launch, nothing goes, and a one-time lesson says `HOLD [L] —
     AUTODROP waits for the centre`.
   - Elsewhere [L] stays the manual launch, with its confirms: outside every window, or on a window with no sure part
     (the WIDE DROP case, which v1 never flies).
   - The alternative is a tap that launches at once, with only a hold handed to AUTODROP. It is easier to discover, but
     a kid who taps never sees the skill work.
5. **R5. [FRAN] An untrained AUTODROP fires 1.5 tac s late (AIM 40%).**
   - Plan 4's §5.4 risk: AUTODROP's ±1 s clamp cannot reach the spec's `UNTRAINED 40%`, because the floor at ±1 s is 60.
   - **Recommend:** the same reading as plan 4 R3 for AUTOBURN. Untrained fires `AUTODROP_UNTRAINED_OFFSET_TAC` = 1.5
     late, which is what 40% means (100 − 40 × 1.5), and the ±1 clamp applies only to what demos teach.
   - v1 sends only the pods that fit the sure window as it will fly it. So an untrained v1 sends 3 pods where a trained
     one sends 4 in an 8 s window: "trained by you" is felt.
6. **R6. Volley spacing follows the live cadence.** 03's "centre − (n − 1) × 1.0 s" is half of a healthy Bay Ctrl's
   2.0 s. **Recommend:** half of the cadence Bay Ctrl gives now (2.7 s degraded, 4.0 s failing), so a damaged bay still
   straddles the centre. This is a reading, not a change.
7. **R7. In-SKIP drops wait.** 01 §3.14 lets a higher version drop inside a SKIP, but that needs SKIP chaining
   (decision 18, deferred). **Recommend:** every AUTODROP version has `holdsTactical: true` in 4c. Windows play at
   TACTICAL, a SKIP still stops 8 s before a window, and v3 asks for one [F] per gap, as 03 §3.8 says.
8. **R8. Threads.**
   - v2 and v3 claim a Core thread `AUTO_THREAD_CLAIM_TAC` (8) before a volley's first launch and let it go after the
     last one ("hack or drop"). With no thread free they wait and launch late (`AUTODROP NEEDS A THREAD IN 0:05 — × AN
     OP`), as AUTOBURN does.
   - **Recommend:** v1 holds no thread. It is the kid's key on the amber screen, as a manual launch is.
   - AUTOBURN's and AUTODROP's claims can meet. That is rare, because AUTOBURN's top-ups avoid windows (R13).
9. **R9. Disguised seeds and the tools.** 04 §3.6 only says a SCAN reveals one.
   - **Recommend:**
     - SCAN works as on a file (1.0 + 0.1 × 2 = 1.2 s, the spec's number) and stamps `NOT A FILE`.
     - **[FRAN]** DELETE is allowed without a SCAN. It asks the file's own confirm (`DELETE cache.tmp?`), runs as rm on a
       seed, and stamps `IT WAS A SEED`. Deleting a suspicious file is detective work too, and refusing it would give
       the seed away.
     - MOVE, COPY and REPAIR refuse with neutral words (`TEMP FILE — NOTHING TO DO`), never `EATEN`.
   - Only noise seeds on the beam are disguised, never a delivery's seed: 04 says "one beam seed in three", and a
     delivery's chip already names its risk.
10. **R10. [FRAN] SENTRY v2 and the root.** 03 §3.2 says "rm on HOLLOW twice as fast"; §3.10 gives the per-block
    formula. **Recommend:** halve DELETE on hollow blocks (seeds and the blocks they made) and leave the root's
    `ROOT_DELETE_SEC` (12 s) alone. The duel's length is the finale's design, and halving it would take most of THE
    LAST fight away from one 3-cycle purchase.
11. **R11. SENTRY's opening needs a lasting record** (plan 4 foundation review, M2's note).
    - Today `seedsMet` reads evidence that can fade: the current arrival's seeds, TRACE, `fed`, the last tally. A kid
      who rm's every seed leaves TRACE at 0.
    - If a tie (SURVEY first, slice 6) pushes SENTRY a visit later, the next ship may carry no seeds, and SENTRY would
      never open.
    - **Recommend:** `RunThreatState.seedsMetAtDepth: number | null`, written once by `endShip` and read by `seedsMet`.
      Part of v4 (R1). The FOUNDATION builds it whole.
12. **R12. v3's target and its search.** 03 §3.6: "tries round orbits from the top of the band down, in steps of 100
    km".
    - **Recommend** that literally: a scan of `V3_STEP_KM` steps from `ring.max` down to `ring.min +
      GO_LOW_FLOOR_MARGIN_KM`, with `landing-orbit.ts sureTacAt` (closed form, ≤ 40 calls per LZ).
    - Not the bisection in `highestFittingRadius`: a target on a 100 km grid is readable and does not twitch while a
      factor drifts.
    - The fit is judged at `LANDING_TACTICAL_WARP` (20) in FLIGHT too. `level.tacticalWarp` only becomes 20 at
      `beginLanding`, so reading it in FLIGHT would judge the fit at the wrong warp.
13. **R13. [FRAN] v3's top-ups and the windows.** The planet does not rotate, so an apsis whose burn crosses an LZ's
    in-band window crosses it on every pass. Waiting a pass never helps.
    - **Recommend:** a top-up whose span crosses a window of an LZ with room re-aims the held circle down to the other
      apsis's altitude when every remaining LZ still fits there ("goes lower", which 03 allows).
    - Otherwise it burns anyway and the radio says `AUTOBURN v3: TOP-UP COSTS LZ-B's WINDOW`. This is the
      ROUND-at-▲ rule from 4a, turned the other way.
    - Measured in `skills/autoburn-v3`. Fran: is one window per top-up acceptable on a narrow, decaying LZ, or should
      v3 rather hold above the DRAG line and lose the fit?
14. **R14. v3 falling to v2.** 03 §3.5 says a falling skill "finishes with what the lower version can do".
    **Recommend:** v3 → v2 while engaged turns the engagement into ROUND at the same target. v2 flies circle burns, so
    it rounds the orbit there, but stops holding and refitting: `AUTOBURN v3 → v2 — it rounds, but won't hold the orbit`.
    v3 → v1 in LANDING ends it (`'downgraded'`), because v1 does not fly in LANDING.
15. **R15. [FRAN] v3 may be a thin spike on healthy ships** (03 §10). On a healthy unit an ordinary lock above the DRAG
    line already fits STANDARD and WIDE brackets.
    - **Recommend:** build it as specified, and measure it in `skills/v3-sweep` (BALANCE_ONLY): over the five
      templates × damage states, the LZs that fit with v2 ROUND against v3, the FUEL each uses, and decay's cost.
    - Report it to Fran. The spec's fallback ("v3 could also take over the decay trims of any orbit") is a slice 8 call.
16. **R16. v3 and the kid's GO LOWER.** While v3 is engaged, GO LOWER's aim and L9's `or fly lower` are v3's.
    **Recommend:** a gate in `landing-rules.ts goLowerChoice` (null while AUTOBURN is engaged in `'landing-orbit'`,
    FOUNDATION), and L9's slot reads `AUTOBURN v3 GOES LOWER — LZ-B's dot will fit` instead. A RETRO burn the kid flies
    by hand is a takeover, as it always was.
17. **R17. v3's plan reuses `planToCircle`, not 1b's `go-low` burn.** Plan 4 §5.4 already raised this: several LZs need
    a circle, not one launch point. **Recommend:** keep it, and record it as a deviation from 03 §3.6 step 2 ("goes down
    with 01-landing's go-low burn").
18. **R18. Per-tick cost** (review 4 m13).
    - **Recommend:** memoise `roundAim` per `pred.asOfTSec` (ORBIT's first task). Memoise `landingOrbitAim` on its
      inputs' key: the LZs with room, the three drop factors, the ring, and FUEL in whole percent. Memoise AUTODROP's
      `planLanding` on the launches so far, `orbitEpoch`, the drop factors and `loadNext`.
    - A suite times each at under 1 ms on the 16-pod ark.
19. **R19. The first desk now has two cards** (plan 4 R5 closes).
    - The visit-1 cards are already data-driven (`training-model.ts` builds one per open root), so AUTODROP's appears
      when its `built` rises.
    - Suites that assert "AUTOBURN alone at desk 1" change in DROP (§8.2). The e2e kid keeps [1] = AUTOBURN.
20. **R20. [FRAN] Retiring the classic world is a migration, not a deletion** (§9).
    - About 150 suites build `createInitialState()` on the classic world. `run1-arm.ts` takes four authored ships'
      landing and arrival damage from `CLASSIC_FIVE`. 33 lines in 15 `src` files name `'classic'`, and 75 more test
      `world === 'arm'` or `!== 'arm'`.
    - **Recommend:** a sequential RETIRE track after 4e in three gated phases: parity probe, migrate, delete. Its first
      two phases can be cut if the lead wants the playtest sooner.
21. **R21. The demo noun.** `DEMO_WORDS.drops` reads `landings` (review fix m5), but 03 §2 says `from your 3 drops`. A
    ship 1 has one landing and three drops, so "3 landings" misreads. **Recommend:** `drop` / `drops` (FOUNDATION), and
    `DEMO_WORDS` gains the measure word (`ACCURACY` for captures, `AIM` for drops), because 03 writes `AIM 91%` for
    AUTODROP (§6).

---

## 1. Scope

### 1.1 What each sub-slice delivers

**4c AUTODROP v1–v3** (03 §3.3, §3.5, §3.8; 01 §3.3, §3.4, §3.14):
1. The LandingController registry (R3), the per-version controller, and AUTODROP's state in `state.landing.autodrop`.
2. v1: [L] held (and the POD BAY's and the phone bar's LAUNCH held), centred volleys, the sure-window rule, BULLSEYE.
3. v2: the POD BAY's per-LZ `[−] n [+]` rows with `BAY HAS 1 BY THEN`, [G], the thread per window, `PASS DONE`.
4. v3: `planLanding` (pure), the plan table and its check line, the healthiest drivers to the narrowest brackets
   (through `LaunchIntent.pod`), never-fits words, wrong-split leftovers, re-planning after every launch.
5. Drop demos (`stats.dropDemos`), `DEMO_SOURCES.drops`, AIM, the RETRAINED line, and the second first-pick card.
6. Graded damage while flying (v3 → v2 keeps this pass, v2 → v1 hands back, OFF ends), the Skills row hook, the BAY
   window's AUTODROP pip.
7. Guidance rows, tutorials, sounds, debug hooks.

**4d SENTRY and disguised seeds** (03 §3.10; 04 §3.4–§3.6, K1–K3):
1. Disguised beam seeds from depth 5 (1 in 3) and 7 (1 in 2), on their own stream. They are drawn as a file with no
   marks, left out of the ECC line, and caught by the strip's `◇ SOMETHING NEXT TO …`. SCAN unmasks one (`NOT A FILE`),
   and DELETE does too (`IT WAS A SEED`).
2. v1: the boot's `> ECC: cache.tmp IS A SEED · RACK D` lines, and `> SENTRY: SOMETHING LANDED · RACK D`.
3. v2: `deleteSec(seg, sentry)`, ×0.5 on hollow blocks (not the root, R10), and the pre-empt on HOLLOW's outline
   (`PRE-EMPTED`).
4. v3: FIREWALL.sys compiled at the boot, and the salvage's FIREWALL card hidden while v3 works.
5. The opening rule on the lasting record (R11, FOUNDATION), the Skills row hook, sounds, debug hooks.

**4e AUTOBURN v3 LANDING ORBIT** (03 §3.6 v3, §3.7, §4; 01 §3.7):
1. `autoburn-v3.ts landingOrbitAim` (pure, memoised): the 100 km scan, the most-LZs fallback with the REPAIR named,
   the fuel reserve with the transfer and the expected holds, and v2's mode rule when nothing leaves 20%.
2. The machine: `MODES_BY_VERSION[3]`, engaging from a flyby or a locked orbit, the hold (`burn.auto.holding`),
   refits that only go lower, top-ups by R13, v3 → v2 by R14, the reserve, and the words.
3. The planner: `'landing-orbit'` on an open path (its capture), no shrink, the hold gate.
4. HUD and guidance: the ghost circle and its label, the button head, the tails, L9's swap (R16), and the mini-HUD's
   kind.
5. Review 4 m13 (memoise `roundAim`) first. Plan 4's missing `round-sweep` folds into `v3-sweep`.

**End of slice 4:** RETIRE (§9).

### 1.2 Open calls from earlier slices that this plan settles

| Call | Here |
|---|---|
| 1a: `LandingController` in a module variable; `KeyG` reserved | R3, FOUNDATION; [G] bound by DROP in `landing-controls.ts` |
| 1b: `DropSolution.validUntilTSec` "for AUTODROP" | DROP: a plan row after it is drawn as a forecast (dim), and is re-planned at the kick |
| Plan 4 §5.4 4c risks (AIM floor, a held [L] meeting a confirm, the re-plan's cost) | R5; §3.4 (controllers never launch into a guard, except v3's wrong-split, which passes `confirmed: 'full'`); R18 |
| Plan 4 §5.4 4d: the disguise on its own stream; `deleteSec`; FIREWALL via `unitInstallAddress` | §4 |
| Plan 4 foundation review M2: "4d may want a sticky record" | R11 |
| Plan 4 §5.4 4e: "v3 goes down with `planToCircle`" | R17 |
| Review 4 m13: memoise `roundAim` | R18, ORBIT step 1 |
| Review 4 "left": `AUTO_MINI_TEXT.armed` kinds | ORBIT |
| Review 4 test gaps: RESUME at a SHIP DONE desk with a lost skill; a v2 → v1 downgrade in LANDING | §8.4: FOUNDATION and ORBIT |
| Plan 4 R13: a bump per sub-slice | Replaced by R1 |
| 3a risk 15: retire the classic world after slice 4 | §9 |
| Plan 4 FLIGHT deviation 10: no `round-sweep` | Folded into `v3-sweep` (BALANCE_ONLY) |

---

## 2. Shared architecture

### 2.1 Module map (new modules in bold)

| Module | Kind | Track | Role |
|---|---|---|---|
| `src/systems/landing-controller.ts` | seam | FOUNDATION, then DROP | the resolver registry, `activeLandingController(state)`, `windowRuleHolds(state)` |
| **`src/systems/autodrop.ts`** | stateful | DROP | the controller per version, [L] hold, [G], the POD BAY's pass numbers, the claim, downgrades, mount |
| **`src/systems/autodrop-plan.ts`** | pure | DROP | `centredVolley`, `bayBy`, `passRows`, `planLanding`, `dropDemoOffset` |
| **`src/data/autodrop-text.ts`** | words | DROP | every AUTODROP string (strip, POD BAY, radio, echo, Skills row) |
| **`src/systems/sentry.ts`** | stateful | SENTRY | boot reveals, `SOMETHING LANDED`, the pre-empt, the FIREWALL compile, `sentryStatus` |
| `src/systems/beam-seeds.ts` | pure | SENTRY | `rollDisguises`, the disguise on `BeamSeedPlan` and on the segment |
| **`src/systems/autoburn-v3.ts`** | pure | ORBIT | `landingOrbitAim`, `v3TopUp`, `v3LowerLine`, `v3GhostLabel`, the memos |
| `src/systems/autoburn.ts`, `predict.ts`, `landing-orbit.ts` | | ORBIT | the machine, the planner, the offer |
| `src/systems/not-built.ts` | helper | FOUNDATION | recreated for the stubs; the batch review deletes it again |

### 2.2 The save: v3 → v4, one bump (R1)

The new saved fields, all added by the FOUNDATION:

```ts
// src/types/landing.ts
export type AutodropArm = 'pass' | 'plan';
export type AutodropEnd = 'pass-done' | 'plan-done' | 'cancel' | 'downgraded' | 'off' | 'offline' | 'landing-over';
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
// LandingState gains `autodrop: AutodropState` (state/initial.ts createLandingState → createAutodropState()).

// src/types/segment.ts
export interface SeedDisguise { name: string; desc: string; seen: 'scan' | 'sentry' | 'delete' | null }
// HollowSegment gains `disguise?: SeedDisguise` (memory is opaque to the pin; optional like `seed?`, `beam?`).

// src/types/threat.ts
// BeamSeedPlan gains `disguise: Pick<SeedDisguise, 'name' | 'desc'> | null`.
// RunThreatState gains `seedsMetAtDepth: number | null`: the depth of the first ship that met a seed (R11).

// src/state/schema.ts
// ArrivalSeed gains `disguise: string | null` (the decoy's name; the boot's SENTRY line reads it).
// AutoburnState gains `holding: boolean` (v3 reached its circle once: from then top-ups are gated, §5.3).
// SeedTelegraph gains `preempted: boolean` (SENTRY v2's DELETE on the outline, §4.4).
```

**`RUN_SAVE_MIGRATIONS[3]`** (a v3 save becomes v4):
1. `slices.landing.autodrop = createAutodropState()` in a world payload.
2. `run.threat.seedsMetAtDepth` is the current ship's depth (`run.ships.length` at SHIP DONE, `shipIndex + 1` at BEAM)
   when today's evidence holds (stages, TRACE, `fed`, the last tally, `arrival.seeds`), else null.
3. Every `arrival.seeds[]` gets `disguise: null`.
4. `slices.burn.auto.holding = false`.
5. `slices.hollow.seedTelegraph.preempted = false`, when the telegraph is not null.
6. `saveVersion: 4`.

**Codec checks** (`checkSavedRun`, `checkSlices`):
- `landing.autodrop` is at rest: `armed === null`, `held === false`, `claimed === false` and `waitingSinceTSec === null`.
  `pass` and `sent` are records of whole numbers.
- `threat.seedsMetAtDepth` is null or a whole number from 1 to the route's depth.
- `arrival.seeds[].disguise` is null or a string.
- `burn.auto.holding` is a bool, false unless `mode === 'landing-orbit'`.
- The shape pin holds v4 beside v1–v3.

**Why no mid-ship save** (R2): the world payload is only ever `desk` or `report`, and at both the landing has ended
(AUTODROP is reset to rest at `'landing-ended'`), the boot's lines are said, and no outline is armed. A later mid-ship
save would find every machine's state in the store, except the module-level caches in §2.3.

### 2.3 Module-level state (allowed, listed)

| Where | What | Why it may stay a module variable |
|---|---|---|
| `landing-controller.ts` | the resolver list | functions registered at mount, with no data: a controller is derived from state |
| `autodrop.ts` | the plan memo; `wasInWindow` for the arm chime | a cache keyed on its inputs; a sound edge (as `autoburn.ts wasInLock`) |
| `autoburn-v3.ts` | the `landingOrbitAim` memo; the `roundAim` memo (m13) | caches |
| `sentry.ts` | none; the pre-empt's thread is an `ops-core` reservation (`'sentry-preempt'`), cleared by the world reset as every reservation is | |
| `ops-core.ts` | AUTODROP's reservation (`'autodrop'`) | as AUTOBURN's: a later mid-ship save re-reserves from `claimed` |

### 2.4 The LandingController registry (R3; FOUNDATION)

```ts
// src/systems/landing-controller.ts
export type ControllerSource = Exclude<LaunchSource, 'player'>;
export type ControllerResolver = (state: Readonly<GameState>) => LandingController | null;
// The order: MERGE's last landing (7) over the resident (5) over AUTODROP. Data, so slice 5 and 7 add a row.
export const LANDING_CONTROLLER_ORDER: readonly ControllerSource[] = ['merge', 'resident', 'autodrop'];
export function registerLandingController(source: ControllerSource, resolve: ControllerResolver): () => void;
export function activeLandingController(state: Readonly<GameState>): LandingController | null;
export function windowRuleHolds(state: Readonly<GameState>): boolean;
```

- `landing.ts` `controllerTick` and `launchesFromMind`, and `pace.ts` (lines 195 and 222), pass the state.
- `setLandingController` / `setActiveLandingController` go. `landing/pace-landing.test.ts` registers a test resolver
  instead.
- A resolver throws on a second registration of its source.

### 2.5 Events (FOUNDATION adds every name to `events.ts`; the emitters are the tracks')

| Event | Payload | Track | Cue (`audio-cues.ts`, FOUNDATION maps it to an existing cue) |
|---|---|---|---|
| `'autodrop'` | `{ from: AutodropArm \| null; to: AutodropArm \| null; end: AutodropEnd \| null }` | DROP | `chime` on arming |
| `'autodrop-volley'` | `{ lz; n; firstAtTSec }` | DROP | none (each launch already plays `podLaunch`) |
| `'autodrop-wait'` | `{ lz }` | DROP | `buzz` once |
| `'seed-unmasked'` | `{ segId; by: 'scan' \| 'sentry' \| 'delete' }` | SENTRY | `seedWarn` + `stampHit` |
| `'seed-preempted'` | `{ startAddr }` | SENTRY | `opDone` + `stampHit` |
| `'firewall-compiled'` | `{ segId }` | SENTRY | `opDone` |
| `'autoburn-v3-lower'` | `{ fromKm; toKm; lz }` | ORBIT | `stampHit` |

`'skill-version'`, `'skill-trained'` and `'pod-landed'` (with BULLSEYE in its echo) are reused.

### 2.6 Tuning (FOUNDATION adds every number, in three banner blocks of `tuning.ts`; a track edits values only in its own)

**4c AUTODROP**
- `AUTODROP_OFFSET_FACTOR 0.5`: 03 §3.3, the share AUTOBURN learns too.
- `AUTODROP_OFFSET_MAX_TAC 1.0`: half the 2.0 s cadence, so a learned skill never shifts a volley by a whole slot.
- `AUTODROP_AIM_PER_TAC 40`, `AUTODROP_AIM_MIN 40`, `AUTODROP_AIM_MAX 99`: 03 §3.3's AIM.
- `AUTODROP_UNTRAINED_OFFSET_TAC 1.5`: R5, 100 − 40 × 1.5 = 40.
- The demo window reuses `AUTO_DEMO_WINDOW` (8): one "last 8" rule for both skills.
- `AUTODROP_SPACING_FRAC 0.5`: R6. The volley straddles the centre: first launch = centre − (n − 1) × cadence × 0.5.
- `AUTODROP_CLAIM_TAC = AUTO_THREAD_CLAIM_TAC` (8), asserted equal to `WINDOW_TACTICAL_LEAD_TAC`: the world goes
  TACTICAL there anyway.
- `AUTODROP_PLAN_MAX_PASSES 8`: a 16-pod ark at two pods a pass on its worst LZ. Past it the table says `+n PASSES`.
- `AUTODROP_DONE_LINE_SEC = AUTOBURN_DONE_LINE_SEC`: PASS DONE stands as long as AUTOBURN's hand-backs.

**4d SENTRY**
- `DISGUISE_CHANCE_BY_DEPTH [{ fromDepth: 5, chance: 1/3 }, { fromDepth: 7, chance: 1/2 }]`: 04 §3.6, decision 22.
- `SENTRY_DELETE_FACTOR 0.5`: 03 §3.10. A seed takes 1.0 s instead of 2.0, and a 6-block meal 2.0 s instead of 4.0.
- `SENTRY_FIREWALLS_PER_BOOT 1`, capped at `FIREWALL_MAX_OWNED` (2): 03 §3.10, "if the unit carries fewer than 2".

**4e AUTOBURN v3**
- `V3_STEP_KM 100`: 03 §3.6 (R12).
- `V3_HOLD_SLACK_KM 100`: one grid step. A top-up comes once ▼ or ▲ sinks a step under R\*, about every one or two
  orbits under the DRAG line (01 §3.7's kicks of 15–24 m/s). So the hold costs about 01's 1% of the tank per orbit,
  in a few burns instead of one a pass.
- `V3_FLOOR_MARGIN_KM = GO_LOW_FLOOR_MARGIN_KM` (100): the same hard floor as GO LOWER.
- The fuel line reuses `AUTO_FUEL_RESERVE_PCT` (20).

**Save:** `RUN_SAVE_VERSION 4`.

### 2.7 Unlock rules (`skill-tree.ts openBranchesAt`)

| Branch | Rule | When it opens | Change in this plan |
|---|---|---|---|
| FLIGHT: AUTOBURN v3 | `'start'` | visit 2 with the rest of the branch (8 cycles: a focused pilot reaches it around desk 4–5) | ORBIT raises `built` 2 → 3 |
| LANDING: AUTODROP | `'start'` | v1 at visit 1 (the second card), v2 and v3 at visit 2 | DROP raises `built` 0 → 3 |
| DEFENCE: SENTRY | `'after-seeds'`, `minVisit 3` | the first visit ≥ 3 at or after the ship recorded in `seedsMetAtDepth` (visit 3 on the worked route: KESTREL's beam) | FOUNDATION: `seedsMet` reads the record (R11); SENTRY raises `built` 0 → 3 |
| SURVEY | `'poor-ahead'`, `minVisit 4` | stays `built: 0` (slice 6) | none |

- "At most one new branch per visit" and the tie rule are unchanged. With SURVEY unbuilt no tie can happen in this
  slice, but the record makes a later tie safe.
- The record is written by `run.ts endShip` (in the same update as the tally): if it is null and the ship met a seed
  (`arrival.seeds.length > 0`, `hollow.seedsLanded > 0`, or `tally.left > 0`), it becomes the ship's depth.
- `seedsMet(state) = state.run.threat.seedsMetAtDepth !== null`.

---

## 3. 4c AUTODROP

### 3.1 The controller

`autodrop.ts` registers one resolver at mount:

```ts
export function autodropController(state: Readonly<GameState>): LandingController | null;
// null unless phase 'landing', the landing goes on, and skillLive('autodrop').version > 0, and:
//   v1: autodrop.held && ui.mode === 'tools'              → { holdsTactical: true, launchesFromMind: false }
//   v2/v3: autodrop.armed !== null                         → { holdsTactical: true, launchesFromMind: true }
// decide(view, state) returns the next LaunchIntent at its moment ({ source: 'autodrop', pod?, confirmed? }), else null.
```

- A controller that is derived each tick dies with its file. A bite that takes AUTODROP.skl to OFF ends it on the next
  tick (`end 'off'`, warning alert `AUTODROP.skl DAMAGED — DROP BY HAND`; no klaxon, because no crash follows).
- Every launch goes through `requestLaunch`, with the player's refusals and guards.
- Controllers launch only inside sure windows of LZs with room, so they never meet a guard. The one exception is v3's
  wrong-split leftovers (§3.4), which pass `confirmed: 'full'`.
- `autodropController(state, override?: { version; queue })` takes an optional override, so slice 7's MERGE resolver
  can fly restored pods at the effective version with its own queue (01 §3.17). 4c only builds the seam.

### 3.2 v1 CENTRE

- **[L] down** (`landing-controls.ts`, which gains `onUp`; also pointer-down on the POD BAY's LAUNCH and the phone bar's
  button): `autodropKeyDown(store)` returns `'held'` or `'manual'`. It returns `'held'` when v1 or better works, the
  SHIP screen is up, and the awaited window has a sure part that is open or opens within `WINDOW_TACTICAL_LEAD_TAC`.
  Otherwise the manual path runs as today (R4).
- **[L] up, or a blur, a mode switch to the MIND, a pause, or the landing's end**: `held = false`. A blur matters
  because a keyup lost to a blur would leave the key held for ever.
- **`centredVolley(view, w, nowTSec, offsetTac, cadenceTac, warp, room, bay)`** (pure):
  - The sure part is the sure span intersected with the in-band span (`sureOpenInSec`…`sureCloseInSec` against
    `inBandOpenInSec`…`inBandCloseInSec`). The centre is the midpoint of the window's open/close (when the dot's centre
    is at the bracket's centre).
  - `n = min(bay loaded at the first launch (bayBy), LZ room, launches that fit)`. The fit is counted on the sure part as
    flown: first = centre − (n − 1) × cadence × 0.5 + offset, each later launch one cadence on, all inside the sure part
    (R5, R6).
  - It returns `{ lz, n, firstAtTSec, spacingSec }`. A single pod leaves at the centre + offset.
- **While held:** the controller launches each slot when its moment comes, and only while the window is still sure.
  Releasing stops the volley, so the kid still decides how many go.
- **v1 works only on the SHIP screen** (`launchesFromMind: false`). In the MIND, the rows say `[TAB]` as the manual rows
  do.
- **BULLSEYE:** a pod AUTODROP launched that lands soft in an LZ with room gets `· BULLSEYE` on its echo (`LANDING_ECHO`,
  `landing-text.ts`).

### 3.3 v2 PASS

- **The POD BAY's rows** (`landing-hud.ts bayWindowModel` gains `autodrop: AutodropBayModel | null`):
  - one row per LZ with room: `A [−] 2 [+]`;
  - prefilled the first time with `min(room, this pass's capacity)`, so [G] alone does something sensible. The
    numbers are kept between passes and clamped to room;
  - a shortfall warning from `passRows`: `B ×3 — BAY HAS 1 BY THEN`;
  - the key: `AUTODROP ▸ PASS [G]`.
- **`bayBy(bay, cadenceTac, launchesBefore, atTSec, warp)`** (pure): the pods the bay holds at `atTSec`, given 4 slots, a
  reload of 20 tac s of world time per pod, and the launches planned before it in this pass. It is 01 §3.4's double
  window.
- **[G]** (`landing-controls.ts`, from either screen, joins the router; `KeyG` is already prevented): `pressAutodrop(store)`.
  - Its refusals: `NOT LANDING`, `NO AUTODROP`, `AUTODROP OFF`, `NOTHING SET` (all zero), `PAUSED`.
  - With v2 it arms `'pass'` with `armedAtTSec`. With v3 it arms `'plan'`. [G] again cancels.
- **The pass:** the next window of each LZ with `pass[lz] > 0`, until one period after `armedAtTSec`. Each window gets a
  centred volley of `min(pass[lz] − sent[lz], …)`.
- **The claim** (R8): it claims at the first launch − `AUTODROP_CLAIM_TAC`, through `ops-core reserveThread('autodrop')`.
  It releases after the volley's last launch, or when the window closes. With no thread free it waits, and the volley
  shrinks to what is left of the sure part (`'autodrop-wait'`).
- **PASS DONE:** once every window of the pass has passed, or every number is sent. The radio says `PASS DONE · A +2 · B
  +1` (`end 'pass-done'`), and the machine waits for the next [G].

### 3.4 v3 PLAN

**`planLanding(state, view): LandingPlan`** (pure, memoised, R18):

```ts
export interface PlanRow { pass: number; lz: string; n: number; atTSec: number; pods: number[]; mislanded: number; forecast: boolean }
export interface LandingPlan {
  rows: PlanRow[];          // in time order
  passes: number;
  perLz: Record<string, number>;
  neverFits: { lz: string; repair: RepairHint | null }[];
  complete: boolean;        // every LZ with room reaches its count
}
```

- **Windows:** this pass's windows (the drop solution), repeated each period for later passes (the planet does not
  rotate), up to `AUTODROP_PLAN_MAX_PASSES`. A row after `validUntilTSec` is a forecast.
- **Capacity:** a window's capacity is its sure part ÷ the cadence + 1 (01's rule), capped by `bayBy` with 20 s
  reloads. Each pod's own drop factors judge its sure part (`dropFactors(caps, driver)`).
- **Order:**
  - windows are filled in time order, each with as many pods as fit and its LZ still needs;
  - the healthiest drivers go to the narrowest LZ with room, and wider LZs take the least healthy driver whose drop
    still fits;
  - the controller names `pod` in its intent. The kid's own LOAD NEXT pin wins for the next launch (the kid's hands),
    and the plan re-plans.
- **Never fits:** an LZ with no sure window for any pod on this orbit is left out. The plan names the fix through
  `bestRepairForDrop`: `LZ-B NEVER FITS — REPAIR POD 05, or fly lower`, or `… AUTOBURN v3 GOES LOWER` while v3 is
  engaged.
- **Leftovers:** pods that no count can use (those of a never-fit LZ) go into a fitting LZ at the wrong-split rate
  (×0.75), in the last rows, never off-site. A REPAIR made meanwhile still saves them.
- **Re-plan** after every launch, on an `orbitEpoch` change, and on a factor change. The memo key covers all three.
- **The check line:** `PLAN · 2 PASSES · A 1,000 · B 800 ✓`, or `✗ LZ-C` when the plan is not complete. One [G] flies
  it, and [F] crosses each gap between passes (R7).

### 3.5 Damage while flying (03 §3.5)

| From → to | What happens | Words (≤ 70) |
|---|---|---|
| v3 → v2 | this pass's remaining rows become `pass` numbers; armed `'pass'` | `AUTODROP v3 → v2 — this pass flies; set the next one` |
| v2 → v1 | disarmed; the kid holds [L] | `AUTODROP v2 → v1 — hold [L] for the rest` |
| → 0, damage | disarmed, warning alert | `AUTODROP.skl DAMAGED — DROP BY HAND` |
| → 0, offline (the kid's REPAIR or MOVE) | disarmed, no alert | `AUTODROP OFF WHILE IT IS REPAIRED — you have the [L]` |

`flownAs` makes each step act once. The watcher's stamps (`AUTODROP v3 → v2`, `AUTODROP v3 RESTORED`) are 4b's,
unchanged.

### 3.6 Demos

- In `landing.ts requestLaunch`, on `source: 'player'` and `kind: 'launched'` with `aimLz !== null`:
  `dropDemoOffset(sol, launch, warp)` = (launch time − the window's centre moment) ÷ the tactical warp. It is pushed to
  `run.stats.dropDemos`.
- Off-site launches are not demos, and nor are AUTODROP's own.
- Per launch, as 03 says. A volley the kid taps around the centre averages to about 0.
- `DEMO_SOURCES.drops` (FOUNDATION) reads `stats.dropDemos` with `AUTODROP_DEMO_TUNING`. The boot's TRAINED and
  RETRAINED lines, AIM, `LastUnit.skills` and the Skills row follow from it.

### 3.7 Guidance (FOUNDATION wires the slots, DROP fills them)

`LandingContext.autodrop: AutodropLine | null`, built in `buildLandingContext` by `autodrop.ts autodropLineOf(state,
sol)`, which returns `{ id, text, keys, urgency, layer, tail }`. The table checks it after L2, L12-bay and L12-nodrop,
and before L3–L7, so the alarms (the director's) and the flight's rows still lead.

| Row | When | Text (≤ 70) | Urgency |
|---|---|---|---|
| AD-hold | v1 works, SHIP screen, a sure window open or ≤ 8 tac s | `WINDOW LZ-A — hold [L]: AUTODROP waits for the centre` | now |
| AD-fly | armed, a volley ≤ 8 tac s away or flying | `AUTODROP — LZ-A ×2 · 0:03 · [G] to cancel` | wait (the MIND's alerts come first) |
| AD-wait | its claim found no thread | `AUTODROP NEEDS A THREAD IN 0:05 — × AN OP` | now, layer mind |
| AD-done | `end === 'pass-done'`, for `AUTODROP_DONE_LINE_SEC` | `PASS DONE · A +2 · B +1 — set the next pass, [G]` | wait |
| tail on L13 | v2 not armed / v3 plan ready / armed between windows | ` · [G] AUTODROP` / ` · [G] FLIES THE PLAN` / ` · AUTODROP ARMED` | — |

The once-only tutorials: `tut-autodrop-v1` (the strip line above, the first window with v1), `tut-autodrop-v2` (`AUTODROP
v2 — set the split in the POD BAY, then [G]`), `tut-autodrop-v3` (`AUTODROP v3 — [G] flies the whole plan`). The
FOUNDATION adds their ids in `script.ts` with conditions that call `autodrop.ts autodropTutorialDue(state, v)` (a stub
returning false).

### 3.8 UI, audio, debug

- **POD BAY** (`PodBayWindow.ts`, `landing-hud.ts`):
  - the AUTODROP pip, as the Engine window's AUTOBURN pip: a click jumps to the file;
  - v2's rows and key;
  - v3's plan table: pass, LZ, pods and time; forecast rows dim; the check line; the never-fits line;
  - phone: the rows in the bay drawer, and the launch button held for v1.
  - Styles go in `landing.css`.
- **GROUND TRACK** (optional, DROP's call): a dim tick per planned volley.
- **Skills row hook:** `autodropStatus(state)`: `CENTRE · AIM 91% · 3 drops`, `ARMED · LZ-A ×2 IN 0:12`, `UNTRAINED 40%`,
  `WORKS AS v1 — REPAIR IT FOR v2`.
- **Mini-demos:** `TRAINING_DEMO_ART.autodrop` = `['centre', 'pass', 'plan']`. The FOUNDATION names the kinds and draws
  them plainly; the review-fix pass refines all six new drawings in one hand (§6).
- **Audio** (§2.5): the existing cues only.
- **Debug:** `__ap.autodrop()` returns the state, the controller's version, the volley, the pass rows and the plan.
  `__ap.dropPass({ 'LZ-A': 2 })` sets the pass numbers, and `__ap.dropDemos([0.3, −0.2])` the demos. `__ap.skill('autodrop',
  3)` already works.

---

## 4. 4d SENTRY and disguised seeds

### 4.1 The disguise roll

- **`rollDisguises(plans, depth, rng)`** (pure, `beam-seeds.ts`): per seed in plan order, one chance draw against
  `DISGUISE_CHANCE_BY_DEPTH[depth]` and one draw from `DISGUISE_POOL` (`threat-text.ts`, 6–8 harmless names, each with a
  description: `cache.tmp · Temporary files. No flight effect.`, `swap.idx`, `fonts.cache`, `core.dmp`, `tz.dat`,
  `old.log`).
  - Both draws are always taken, so the count never shifts the next seed.
  - It runs on its own stream, `hopRng(run, from, to, 'disguise')`, so the beam's seeds, targets and words stay
    byte-identical: `threat/beam-seeds` keeps its asserts.
- Only noise seeds on the beam are disguised, never a delivery's seed or a scripted seed (R9).
- `run.ts transmitNext` calls it after `rollBeamSeeds`. `beamSeedSegment` copies the disguise onto the segment with
  `seen: null`, and `ArrivalSeed.disguise` gets the decoy's name.

### 4.2 How a disguised seed plays (04 §3.6)

**One predicate:** `threat-selectors.ts isDisguised(seg)` is a hollow block with a disguise not yet seen. Every reader
that tells hollow from a file consults it. The inventory (`grep "type === 'hollow'"`) is 19 sites in 10 files, among them:
- `SegmentBlock` draws it as a 2-block file with the decoy's name;
- `HollowPainter` draws no mouth, no arrows and no `NEXT BITE`;
- `DetailPanel` and INSPECT show the decoy's name and description;
- `hollow-hud`'s marks skip it;
- `hollow.ts threateningSeeds` and `seedThreatText` skip it, so the `SEED NEXT TO …` alert stays quiet;
- `tool-targets.ts` (below).

The infection it causes stays visible (design-v2 §3.2), so the tell is a red crawl from the side of an innocent file.

**The strip's line:** while a disguised seed's target is being eaten, `◇ SOMETHING NEXT TO NAV PLOTTER IS EATING IT —
SCAN its neighbours` (66 characters with the longest role name; `support/words` checks the worst case). It never names
the culprit.

**The boot:** the ECC seeds line leaves a disguised seed out, and `seed-landed-beam` is not emitted for it, so there is
no thunk.

**Tools** (R9):

| Tool | On a disguised seed |
|---|---|
| SCAN | the normal scan op, 1.2 s; on completion `seen: 'scan'`, stamp `NOT A FILE`, the seed's words line (at most one per ship), `'seed-unmasked'` |
| DELETE | the file's own confirm (`DELETE cache.tmp?` and the decoy's line); runs as rm on a seed; on completion `IT WAS A SEED`, `'seed-unmasked'` (by `'delete'`), the words line |
| MOVE, COPY, REPAIR | refused with `TOOL_REFUSAL.tempFile` (`TEMP FILE — NOTHING TO DO`) |

TRACE counts it as beam-born, unchanged. The PACKET's `+n: n SEEDS FED IT` counts it too, after the ship.

### 4.3 v1 SIGHT

- **A new boot line kind, `'sentry-seed'`** (`script.ts BootLineKind`; one line per disguised seed, with ordinals, as
  `'delivery'` has), planned after `'seeds'`:
  - It is said only while `skillLive('sentry').version ≥ 1` at the plan. The FOUNDATION adds the kind with a count read
    from `sentry.ts sentryBootLineCount(state)`, a stub returning 0.
  - Saying it sets `seen: 'sentry'`, emits `seed-landed-beam` (the thunk the plain seeds get) and `'seed-unmasked'`, and
    the strip then marks it red as a seed.
  - The words: `> ECC: cache.tmp IS A SEED · RACK D`.
- **In the ship:** on `'seed-landed'` (HOLLOW's own seeds), with v1+ working, the TERMINAL says `> SENTRY: SOMETHING
  LANDED · RACK D` (the rack of its address).

### 4.4 v2 QUICK RM

- **The faster rm:** `state/actions.ts deleteSec(seg, sentry: EffectiveVersion)`. For a hollow block that is not the
  root, at SENTRY ≥ 2: `(DELETE_HOLLOW_BASE_SEC + DELETE_HOLLOW_PER_BLOCK_SEC × size) × SENTRY_DELETE_FACTOR`. The root is
  unchanged (R10). The caller (`:456`) passes `skillLive('sentry').version`, read at the click.
- **The pre-empt:** while `hollow.seedTelegraph` blinks and SENTRY ≥ 2 works, DELETE armed on a free block inside the
  outline is a target (`tool-targets.ts`, a new target kind `'outline'`). `sentry.ts preemptSeed(store)`:
  - reserves a thread (`'sentry-preempt'`, or `capRefusals` with no thread free) and sets `seedTelegraph.preempted =
    true`. `HollowPainter` draws the armed outline.
  - When `stepSeeds` lands it, the seed is freed in the same step: `'seed-preempted'`, stamp `PRE-EMPTED`,
    `stats.deletes + 1`, the words line, and the thread released.
  - A call-off (THE DEAL's pause, the finale's reset) or a world reset releases the thread.
  - SENTRY below v2 at the landing moment: the seed lands as usual, and the thread is released.
- Beam seeds have no outline, so for them v2 is only the faster rm (K2).

### 4.5 v3 FIREWALL

- **A boot line kind, `'firewall'`**, after `'charge'`: while SENTRY = v3 works at the line and the unit holds fewer
  than `FIREWALL_MAX_OWNED` FIREWALL.sys, it writes one (`draft.ts`'s FirewallSegment shape) at `memory-ops
  unitInstallAddress(memory, FIREWALL_BLOCKS)`.
  - The words: `> SENTRY: FIREWALL.sys COMPILED`, with `'firewall-compiled'`.
  - With no room (a full TIGHT receiver): `> SENTRY: NO ROOM TO COMPILE FIREWALL.sys`, and nothing else happens.
  - It is placed with MOVE, as in phase 2.
- **The salvage card:** `DraftContext.firewallCompiler?: boolean`, true when `skillLive('sentry').version === 3` as the
  PACKET opens. The FIREWALL card's `usable` returns false then, filtered before the draws (as `'cycles'` is), so a deal
  without SENTRY v3 stays byte-identical.

### 4.6 UI, audio, debug

- **Skills row hook:** `sentryStatus(state)`: `SIGHT · 2 SEEDS NAMED AT THE BOOT`, `QUICK RM · a seed in 1.0 s`, `FIREWALL
  · 1 COMPILED AT THE BOOT`.
- **Mini-demos:** `['sight', 'quick-rm', 'firewall']`.
- **Styles:** `threat.css` (the decoy chip, the armed outline).
- **Audio** (§2.5).
- **Debug:** `__ap.seed(target, { disguise: 'cache.tmp' })` (plantBeamSeed gains the option), `__ap.disguiseOdds(depth)`,
  and `__ap.preempt()` (pre-empt the blinking outline).

---

## 5. 4e AUTOBURN v3 LANDING ORBIT

### 5.1 The aim (`autoburn-v3.ts`, pure, memoised)

```ts
export interface LandingOrbitAim {
  targetKm: number;                                 // R*, on the V3_STEP_KM grid from ring.max down
  fits: string[];                                   // the LZs with room that get a sure window there
  misses: { lz: string; repair: RepairHint | null }[];   // the others, with the REPAIR that would help (L9's rule)
  dropKm: number;                                   // the widest dot half-width among them there (`DROP ±70 km`)
  fuelAfterPct: number;                             // after the capture, the transfer and the expected holds
  belowDrag: boolean;
}
export function landingOrbitAim(state: Readonly<GameState>, pred: Prediction): LandingOrbitAim | null;   // null: v2's rule
```

- **The inputs:**
  - LZs with room (`lzRemaining`);
  - Sensor Interp and Nav Plotter now, and the worst driver among the next `BAY_SLOTS` pods in launch order
    (`launchQueue(state).slice(0, BAY_SLOTS)`, `dropFactors`; 03: "the LOAD NEXT order");
  - `LANDING_TACTICAL_WARP` (R12) and the ring.
- **The scan:** R = `ring.max`, then down by `V3_STEP_KM`, to `ring.min + V3_FLOOR_MARGIN_KM`. Each LZ fits where
  `sureTacAt(R, √(μ/R), lz, factors, R_planet, 20) ≥ LANDING_SURE_MIN_TAC`.
  - **Every LZ fits:** the first such R from the top.
  - **None fits them all:** the R that fits the most LZs, ties going to the most pods with room, then the higher R. The
    misses are named with `bestRepairForDrop` (03: "the strip names the REPAIR for the others, as GO LOWER does").
- **The fuel:** `fuelAfterPct` = FUEL − the capture, when the path is open and its burn is planned (always flown, plan 4
  R4) − the transfer to the circle (two apsis burns by vis-viva) − the expected holds. The holds are 0 above the DRAG
  line; below it, `passesLeft × dragDvKmS(R, ring)`, where `passesLeft = ceil(pods aboard ÷ Σ per-pass capacity of the
  fitting LZs)`.
  - Scanning on down, the aim is the highest fitting R whose `fuelAfterPct ≥ AUTO_FUEL_RESERVE_PCT`.
  - With none, the result is null and `MODES_BY_VERSION[3]` falls back to v2's rule (03: "it behaves like v2, by v2's
    mode rule").
- **The memo** is keyed on the LZs with room, the three factors, the ring, whole-percent FUEL and the phase.

### 5.2 Modes and the machine (`autoburn.ts`)

- **`MODES_BY_VERSION[3]`:** `'landing-orbit'` unless the path is an impact or `landingOrbitAim` is null, in which case
  v2's row applies. From a flyby its first burn is the capture; in LANDING it is `[B] · MOVE TO LANDING ORBIT`. On a
  locked orbit v3 offers LANDING ORBIT, not ROUND.
- **Engage:** `targetKm = aim.targetKm`, `holding = false`. The lock range applies to the first burn, as for every mode.
- **Consolidate first.** The review's list of places a mode touches becomes one table in `autoburn.ts`:
  `MODE_RULES: Record<AutoMode, { needs; finishesAtCircle; holds; noShrink; stopped: { reserve; downgraded } }>`.
  It holds `MODE_NEEDS`, `armedTick`'s "nothing left to fly", `stoppedLine`, and predict's `noShrink` (predict reads it
  through `engagedAuto`).
- **Armed and holding:**
  - At the circle (`atCircle`) the first time: `holding = true` and the radio says `AUTOBURN v3: LANDING ORBIT — it
    holds it`. It does **not** finish: `finishesAtCircle: false`.
  - A null burn point while holding stays armed (not `'no-capture'`).
  - It ends on [B], a takeover, the landing's end (engine closed: `'flight-over'`'s path, with its own words), the
    reserve, or a downgrade.
- **Refit, lower only:** each post-tick, the memoised aim. While the new `targetKm` is at least one step below the held
  one, it lowers `targetKm`, sets `holding = false`, and says `AUTOBURN v3 GOES LOWER — LZ-B's dot will fit`
  (`'autoburn-v3-lower'`). It never raises, even when an LZ fills (03: "It never climbs back up during a landing").
- **The reserve:** a transfer or top-up burn that would leave less than 20% ends it `'reserve'`: `AUTOBURN v3 KEEPS 20%
  FUEL — the orbit is yours`.
- **v3 → v2** (R14): `mode = 'round'`, `holding = false`, target kept, and the radio line. **v3 → v1** in LANDING ends it
  `'downgraded'`.
- **The kid's GO LOWER** (R16): the FOUNDATION's gate makes `goLowerChoice` null while v3 is engaged, so GO LOWER is
  neither offered nor planned. L9's slot reads `v3LowerLine(state)`.

### 5.3 The planner and the hold (`predict.ts`, `landing-orbit.ts`)

- **`planModeBurn`:** on an open path, `'landing-orbit'` returns the capture, as `'green'` does today.
- **`computePrediction`:** `noShrink` for `'landing-orbit'` (`MODE_RULES`). The circle plan runs while `!holding`, as
  ROUND's does. While `holding`, it plans only when the hold breaks:
  - ▼ < R\* − `V3_HOLD_SLACK_KM`, or ▲ < R\* − `V3_HOLD_SLACK_KM`;
  - or `decayWarned` (two orbits);
  - or an LZ in `fits` loses its sure window at the loop's launch radius.
- **The top-up** is `planToCircle`'s next step, through the `'round'` reason (the existing machinery).
- **The window rule** (R13), `v3TopUp(state, pred, aim)`:
  - When the step's span crosses a window of an LZ with room (`landing-rules burnSpanBlocks`), and every LZ in `fits`
    still fits at the other apsis's altitude, it re-aims `targetKm` down to that altitude (a "goes lower", with its
    words).
  - Otherwise it burns, and the radio says `AUTOBURN v3: TOP-UP COSTS LZ-B's WINDOW`.
- **`landingBurnOffer`** already offers an engaged AUTOBURN's burn whatever was declined, so pace holds TACTICAL for a
  top-up and a SKIP stops before it. No pace change.

### 5.4 HUD, guidance, words

- **`flight-hud.ts autoGhost`** draws the circle at R\* while engaged, or while [B] would engage it, with the label from
  `v3GhostLabel(state, aim)`: `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL −9%` (54 characters), or `LANDING ORBIT ·
  LZ-A, LZ-B FIT · REPAIR POD 05 FOR LZ-C` (52). The label is drawn by `plot-draw.ts` and `NavPlotWindow.ts`.
- **The AUTO button's head:** `AUTO · LANDING ORBIT [B]`. **The mini-HUD:** `AUTO_MINI_TEXT.armed` gains the kind
  `'orbit'` (`HOLDS THE ORBIT · [B] OFF`), and `autoArmedBurn` gains it (the top-up).
- **Guidance tails:** ` · or [B] LANDING ORBIT` on every line whose burn is inside the lock range (`offerAuto`), and on
  L13's waits.
- **The ARMED row while holding:** `AUTOBURN ARMED — it holds the landing orbit · [B] to cancel` (58), and `AUTOBURN v3
  TOPS UP AT ▼ IN 3:10` once a top-up is planned.
- **The once-only tutorial `tut-autoburn-v3`:** `AUTOBURN v3 — [B] flies to the orbit where every drop fits`. The
  FOUNDATION adds the id, with its condition calling a stub.
- **ARRIVAL CONTROL's line for any v3 trained** (03 §7: `Our repository has everything you need. :)`):
  `training-model.ts`'s `control` line when this desk's pending purchases hold a v3. The FOUNDATION builds it, for every
  skill.
- **Skills row:** `autoburnStatus` gains `HOLDS THE LANDING ORBIT · 6,100 km`.
- **Debug:** `__ap.v3()` returns the aim (R\*, fits, misses, the fuel line, the memo key).

---

## 6. Extensibility check

The aim: adding a skill touches its data plus one obvious place. Here is what 4a and 4b's hooks give each skill, and
what to change where they don't fit.

| Hook (4a/4b) | AUTODROP | SENTRY | AUTOBURN v3 | Change |
|---|---|---|---|---|
| `SKILL_TREE[id].built` | 0 → 3 | 0 → 3 | 2 → 3 | none: one line per track |
| `openBranchesAt` | `'start'` fits | `'after-seeds'` fits only with a record | `'start'` fits | R11: `seedsMetAtDepth` (FOUNDATION) |
| visit-1 cards (`training-model.ts`) | data-driven, second card appears | — | — | none |
| `DEMO_SOURCES` / `DEMO_WORDS` | `drops: null` today; the measure word is missing (`ACCURACY` everywhere) | none (no demos) | captures, unchanged | FOUNDATION: fill `drops`; `DEMO_WORDS[kind]` gains `measure` (`AIM` / `ACCURACY`); `drop` / `drops` (R21) |
| `SKILL_ROW_HOOKS` (`skills.ts`) | one row | one row | `autoburnStatus` grows a line | FOUNDATION pre-registers `autodropStatus` and `sentryStatus` (stubs answering like `plainSkillStatus`), so the tracks never edit the same object literal |
| `TRAINING_DEMO_ART` + `demoSvg` | new kinds | new kinds | `'low-orbit'` exists | **Doesn't fit:** a new `DemoArt` needs a case in `TrainingWindow.ts`'s exhaustive switch, a second file. FOUNDATION adds the six kinds (`centre`, `pass`, `plan`, `sight`, `quick-rm`, `firewall`) drawn as `plain`; one hand draws them at the review-fix pass |
| `MODES_BY_VERSION` | — | — | the row exists (v2's modes) | **Partly fits:** a mode also touches `MODE_NEEDS`, `stoppedLine`, `endLine`, `autoArmedBurn`, `armedTick`'s finish, `burnVerdict`, `planModeBurn`, `noShrink` and `AUTO_MINI_TEXT`. ORBIT folds them into `MODE_RULES` (§5.2) before adding v3 |
| LandingController seam | a module variable | — | — | **Doesn't fit:** R3's registry (FOUNDATION) |
| Effective version, watcher, stamps, badge, tick zones | generic | generic | generic | none |
| PACKET chips, PACK AS, RESTORE, `restoreCostOf`, RESTRICTED rows | generic (`without: 'drop pods by hand'`) | generic | generic | none |
| Boot lines (`skillBootLines`) | generic TRAINED/RETRAINED | generic, plus its own reveals | generic | SENTRY's reveals and its FIREWALL are new boot line kinds in `script.ts`: the FOUNDATION adds both kinds with stub counts |
| Grant interface (slice 5) | fits | fits | fits | none |
| Landing guidance slots | no slot | — | L9 needs a swap | FOUNDATION adds `LandingContext.autodrop` and `.v3Lower`, read by stubs that return null |
| `UpgradeDef.usable` (FIREWALL card) | — | fits with a context field | — | `DraftContext.firewallCompiler` (SENTRY) |
| `fileWorksAs`, `skillLive` | fits | fits | fits | none |

---

## 7. Work breakdown

### 7.1 FOUNDATION (one agent, first, sequential; about a day)

0. **Dump the v3 fixtures** before anything changes, with a one-off script that is then deleted (as plan 4's foundation
   deviation 1 did), to `tests/unit/save/fixtures/`, each as `{ save, meta }`:
   - `run-save-v3-ship-done-desk2.json`: AUTOBURN v2 bought;
   - `run-save-v3-beam-seeds.json`: the BEAM into a ship with beam seeds;
   - `run-save-v3-ship-done-lost.json`: desk 2 with the AUTOBURN file deleted in ship 2, for gap G1 (§8.4).
1. **Types and state:** §2.2's fields, `createAutodropState()`, `createRunThreat().seedsMetAtDepth = null`, and
   `createHollowState`'s telegraph shape.
2. **Tuning:** §2.6, in three banner blocks (`4c AUTODROP`, `4d SENTRY`, `4e V3`) separated so that no two tracks' hunks
   touch.
3. **Data and words:**
   - `DEMO_SOURCES.drops` with `AUTODROP_DEMO_TUNING`, implemented;
   - `DEMO_WORDS` gains `measure` and uses `drop` / `drops`;
   - `BOOT_SKILL_TEXT.trained` and `retrained` take the measure;
   - the six `DemoArt` kinds;
   - the v3 CONTROL line in `training-model.ts`;
   - `SKILL_ROW_HOOKS` for AUTODROP and SENTRY, pointing at stubs.
4. **Seams, implemented and behaviour-neutral:**
   - the LandingController registry (§2.4) and its callers in `landing.ts` and `pace.ts`; `pace-landing.test` moved to
     it;
   - the landing guidance slots (§3.7, §5.2) wired into `landing-guidance.ts`, read by `autodropLineOf` and
     `v3LowerLine` stubs that return null;
   - `landing-rules.ts goLowerChoice`'s v3 gate (R16), reading `selectors.ts autoburnHoldsLandingOrbit(state)`;
   - `RunThreatState.seedsMetAtDepth`: its writer in `run.ts endShip`, its reader in `skill-tree.ts seedsMet`, and a test;
   - the `script.ts` boot kinds `'sentry-seed'` and `'firewall'` (counts from stubs returning 0), and the tutorial ids
     `tut-autodrop-v1/v2/v3` and `tut-autoburn-v3` (conditions from stubs returning false);
   - `events.ts` (§2.5) and `audio-cues.ts`'s cases;
   - `debug.ts`'s `__ap.autodrop`, `dropPass`, `dropDemos`, `seed(…, { disguise })`, `disguiseOdds`, `preempt` and `v3`,
     each calling a track module's function.
5. **Stubs with final signatures**, each file opening with a `// Slice 4c–4e: Track X owns this file` banner:
   - `autodrop.ts`, `autodrop-plan.ts`, `autodrop-text.ts`, `sentry.ts`, `autoburn-v3.ts`.
   - **The rule** (learned from 4a): stubs on a hot path return the neutral answer (null, [], 0, false), never throw.
     These are the resolvers, the guidance lines, the boot counts, the tutorial checks and the status hooks. Only entry
     points that change state throw through `not-built.ts notBuilt(what, track)`: `pressAutodrop`, `setPassCount`,
     `autodropKeyDown`, `preemptSeed`, `compileFirewall`.
6. **The save:** `RUN_SAVE_VERSION 4`, `RUN_SAVE_MIGRATIONS[3]`, the codec checks (§2.2), the shape pin under v4, and
   `skills/foundation.test` gaining the v3 → v4 migration of the three fixtures and gap G1.
7. **Gate:** `npm run typecheck`, and the whole unit tier green with no behaviour change. `built` stays at 2 / 0 / 0 / 0.

### 7.2 Three parallel tracks (worktrees `drop-4c`, `sentry-4d`, `orbit-4e`; disjoint files)

**Track DROP (4c AUTODROP)**
- **Owns:**
  - new: `src/systems/autodrop.ts`, `src/systems/autodrop-plan.ts`, `src/data/autodrop-text.ts`;
  - `src/systems/landing.ts`: demos, mount order, the reset at `'landing-ended'`;
  - `landing-controls.ts`: [L] down and up, [G];
  - `landing-controller.ts`, after the FOUNDATION;
  - `landing-hud.ts`: `bayWindowModel.autodrop`, the pip, the plan table model;
  - `landing-guidance.ts`, except the two v3 slots (`v3Lower` at L9, `v3Decay` at L10), which stay as the FOUNDATION wired
    them;
  - `pace.ts`, only if the window rule needs more than the state argument;
  - `src/data/landing-text.ts`: BULLSEYE;
  - `src/components/tools-view/PodBayWindow.ts`, `PhoneFlightBar.ts`, `GroundTrack.ts` (optional), `src/styles/landing.css`;
  - (foundation review m7) the POD BAY block of `index.html` (`#podBayWin`), with its empty containers `#pbAutodrop`,
    `#pbPass` and `#pbPlan`, and any phone bay rules (in `landing.css`);
  - its rows only: `data/skills.ts` `autodrop.built`, `training-text.ts` AUTODROP's words, the `TRAINING_DEMO_ART.autodrop`
    line, `tuning.ts`'s 4c block.
- **Tests:** §8.1 DROP; updates to `landing/pace-landing`, `skills/foundation`, `skills/ui-models` and
  `skills/training-flow` (visit 1's two cards). In the shared suites (foundation review M1), only its own lines:
  `skills/foundation` `built: AUTODROP` (:77) and the desk-1 check (:285–291); `skills/ui-models` the one-card desk-1
  check (:60), the grid's branches and closed list (:116–120) and the eaten cells (:152).

**Track SENTRY (4d)**
- **Owns:**
  - new: `src/systems/sentry.ts`;
  - `beam-seeds.ts`;
  - `run.ts`: `transmitNext`'s disguise roll and `arrival.seeds[].disguise`. The FOUNDATION wrote `endShip`'s record;
  - `carry.ts`: the disguise passes through `layoutCarried`;
  - `boot.ts`, `map-boot.ts`;
  - in `data/script.ts`, only the SENTRY boot lines (the `'sentry-seed'` and `'firewall'` plan lines and cases, and the ECC
    `'seeds'` plan line and case, which leave a disguised seed out) and the strip's disguise line;
  - `hollow.ts` (the telegraph's pre-empt, `threateningSeeds`, `seedThreatText`, the `SOMETHING LANDED` hook) and
    `hollow-hud.ts`;
  - `state/actions.ts` (`deleteSec`, the SCAN and DELETE unmasking), `state/threat-selectors.ts` (`isDisguised`);
  - `tool-targets.ts`, `fs-tools.ts` if SCAN's completion needs a hook;
  - `draft.ts` (`firewallCompiler`), `data/upgrades.ts` (the FIREWALL card's `usable`);
  - `data/threat-text.ts`, `data/hollow-text.ts`, `data/tool-text.ts`;
  - `components/memory-view/HollowPainter.ts`, `SegmentBlock.ts`, `DetailPanel.ts`, and the click path that targets an
    outline (`MemoryStrip.ts`), `src/styles/threat.css`;
  - (foundation review M3) `data/threat-rules.ts` (`beamSeedAboard` and the beam-seed lessons), `systems/move-preview.ts`
    and `components/memory-view/MovePreviewLabels.ts` (the MOVE preview's HOLLOW readers), `systems/hollow-verbs.ts` (MV's
    seed words). The rule there: a reader that tells HOLLOW from a file consults `isDisguised`; the counters (TRACE, the
    tally, `beamSeedsInMemory`, `beamSeedCount`) still count a disguised seed;
  - its rows only: `sentry.built`, SENTRY's words and `TRAINING_DEMO_ART.sentry`, `tuning.ts`'s 4d block; in
    `skills/foundation`, `built: SENTRY` (:81).
- **Tests:** §8.1 SENTRY; updates to `threat/beam-seeds` (it must stay byte-identical), `wp9/seed-test` and `map/repository`
  if a refusal word moves.

**Track ORBIT (4e AUTOBURN v3)**
- **Owns:**
  - new: `src/systems/autoburn-v3.ts`;
  - `autoburn.ts`, `predict.ts`, `landing-orbit.ts`, `guidance.ts`, `flight-hud.ts`;
  - `components/hud/plot-draw.ts`, `NavPlotWindow.ts`, `MiniHud.ts`, `EngineWindow.ts`;
  - `data/skill-text.ts`, the AUTOBURN parts of `game.css`;
  - its rows only: `autoburn.built`, `tuning.ts`'s 4e block;
  - (foundation review m3) `data/script.ts`'s `AUTOBURN_RULES` entries;
  - `docs/playtest-checklist.md`'s AUTOBURN lines.
- **Tests:** §8.1 ORBIT, gap G2, and the reworked `skills/autoburn-modes`, `skills/guidance-auto` and `skills/lock-range`
  where v3 changes a mode. In the shared suites (foundation review M1), only its own lines: `skills/foundation` `built:
  AUTOBURN` (:75) and the migrated desk-2 check's v3 (:303–306); `skills/training-flow` desk 2's `v3 is not built` check
  (:105–107); `skills/ui-models` AUTOBURN's desk-2 cells (:121–127), and :152's `autoburn:v3` if it moves.

**Hot shared files after the FOUNDATION:**

| File | Owner | Others |
|---|---|---|
| `schema.ts`, `types/landing.ts`, `types/segment.ts`, `types/threat.ts`, `types/skill.ts` | lead | ask by message; R1's rule for any new saved field |
| `save-codec.ts`, `save/shape-pin.test.ts`, `save/codec.test.ts` | lead | none |
| `tuning.ts` | lead | each track edits values in its own block only |
| `data/skills.ts`, `training-text.ts` | lead | each track edits only its own skill's lines (separate lines, so git merges them) |
| `skill-tree.ts`, `skill-levels.ts`, `training.ts`, `training-model.ts`, `skills.ts`, `TrainingWindow.ts` | lead | none; hooks are pre-registered |
| `landing-rules.ts` | lead | none: DROP's pure helpers live in `autodrop-plan.ts`, and ORBIT reads `burnSpanBlocks` as is |
| `events.ts`, `audio-cues.ts` | lead | a track may change the cue on its own events' lines |
| `debug.ts` | lead | the hook bodies are in the track modules |
| `data/script.ts` | SENTRY for the boot lines | the tutorial entries are the FOUNDATION's, with conditions in the track modules |
| e2e scenarios | lead, at batch end | |

**AUTODROP and v3 both touch landing.** The split:
- DROP owns `landing.ts`, `landing-hud.ts`, `landing-guidance.ts` and `pace.ts`.
- ORBIT owns `landing-orbit.ts`, `predict.ts` and `autoburn.ts`.
- The places where v3 meets the landing are built by the FOUNDATION: the `goLowerChoice` gate (`landing-rules.ts`) and the
  two v3 slots in `landing-guidance.ts` (L9's `v3Lower`, L10's `v3Decay`), which ORBIT fills through `LandingFlight`
  (guidance.ts `landingFlightOf`).
- ORBIT never edits a DROP file, and DROP never edits an ORBIT file. Their behaviour meets in `burnSpanBlocks`, which is
  frozen, and in the merged integration check (§8.3).

**Order dependencies:**
- The FOUNDATION comes before everything.
- The three tracks are independent of each other: each installs skills with `giveSkillFile`, and none reads another's
  module.
- ORBIT's top-up rule is measured with manual pods in its own suites. The merged run with AUTODROP v3 is the lead's.

### 7.3 Merge order

1. **SENTRY** first: it is independent of the landing, the smallest test churn, and it touches neither landing nor
   orbit files.
2. **DROP** next: it changes the first desk (two cards) and the landing seam that every later landing suite runs over.
3. **ORBIT** last: it rebases on DROP's `landing.ts` (no textual conflict by ownership). It then runs the integration
   check of v3 with AUTODROP v3 on an ark (§8.3) before the batch review.

Then: the full review, the fix pass (which also draws the six mini-demos and deletes `not-built.ts`), the unit tier,
one e2e run, AGENTS.md ("What's built": AUTODROP, SENTRY, AUTOBURN v3; "Next logical steps"), and then RETIRE (§9).

---

## 8. Tests

**Budget:** the tier runs about 100 s today, against a budget of 265 s and a cap of 300 s. The new suites below add
about 45 s of CPU on 4 workers, so the tier stays near 115 s. Sweeps go BALANCE_ONLY. Long setups fly once (`flyOnce`).

### 8.1 New unit suites

| Suite | Track | What it covers | Time |
|---|---|---|---|
| `skills/foundation.test.ts` (grown) | FOUNDATION | v3 → v4 migration of the three fixtures; codec refusals (an armed AUTODROP, `holding` without its mode, a bad `seedsMetAtDepth`); the record written by `endShip`; `seedsMet` sticky across a seedless next ship; the registry's order; `DEMO_WORDS.measure` | < 1 s |
| `skills/autodrop-plan.test.ts` | DROP | pure: `centredVolley` (n = 1 at the centre; n = 4 at −3, −1, +1, +3 s; R5's untrained 3 of 4; R6's degraded cadence), `bayBy` (the double window), `passRows`' `BAY HAS 1 BY THEN`, `planLanding` (9 pods / 2 LZs in 2 passes; a 16-pod ark; never-fits with its REPAIR; wrong-split leftovers last; healthiest driver to the narrowest LZ; forecast rows after `validUntilTSec`); the memo under 1 ms | < 1 s |
| `skills/autodrop-flow.test.ts` | DROP | landing harness on an arm ship: v1 held (BULLSEYE, release stops, the MIND refuses, a blur releases); a tap → nothing + lesson (R4); v2 [G] from the MIND, the thread per window and none between, the wait; PASS DONE; v3 plan flown with [F] per gap; v3 → v2 → v1 → OFF mid-landing; the controller dies with its file; demos recorded on manual launches only, and AIM at the next boot | ~6 s |
| `threat/disguise.test.ts` | SENTRY | odds by depth over a seeded sample; the beam's seeds byte-identical with and without the roll; layout; `isDisguised` readers (painter model, alerts, ECC line, no thunk); SCAN 1.2 s → `NOT A FILE`; DELETE → `IT WAS A SEED`; MOVE/COPY/REPAIR refusals; the strip's `◇ SOMETHING NEXT TO …`; TRACE counts it | ~1 s |
| `skills/sentry.test.ts` | SENTRY | the opening at visit 3 (and later after a seedless ship 3); v1's boot lines and `SOMETHING LANDED · RACK D`; v2's 1.0 s seed and unchanged root; the pre-empt (thread held, `PRE-EMPTED`, a call-off releases, SENTRY falling below v2 lets it land); v3's compile, the cap, no room, the card hidden; damage (v3 at 64% works as v2: no FIREWALL) | ~2 s |
| `skills/v3-aim.test.ts` | ORBIT | pure: the 100 km grid from `ring.max`; the most-LZs fallback with its REPAIR; the fuel line (transfer + holds) and the v2 fallback; warp 20 in FLIGHT (R12); the memo; `roundAim`'s memo (m13) under 1 ms | < 1 s |
| `skills/autoburn-v3.test.ts` | ORBIT | `flyOnce`: KESTREL flight → capture → circle at R\* → `holding`, every LZ fits; a bitten driver → GOES LOWER, never up when an LZ fills; decay top-ups at a window-free apsis (R13, measured); the reserve stop; v3 → v2 into ROUND (R14); the kid's RETRO a takeover; GO LOWER gated (R16); `[B] · MOVE TO LANDING ORBIT` from a lock | ~12 s |

### 8.2 Changed suites

- `landing/pace-landing`: the registry instead of `setLandingController`.
- `skills/foundation`, `skills/ui-models`, `skills/training-flow`: visit 1 shows two cards; SENTRY's latch with the real
  `built` (TREE deviation 4's temporary raise goes).
- `threat/beam-seeds`: unchanged assertions (the disguise stream is separate). If one moves, it is a bug.
- `save/shape-pin`, `save/codec`: v4.
- `skills/autoburn-modes`: G2 (below).
- `support/words`: every new string at its worst case is ≤ 70 characters.
- `map/link-over`, `map/desk-flow` and the fixtures that use `pickFirstSkill`: unchanged (they pick AUTOBURN).

### 8.3 BALANCE_ONLY sweeps (information until slice 8)

- `skills/autodrop-sweep.test.ts` (`// BALANCE_ONLY: AUTODROP v0–v3 over the templates × seeds`): points, pods landed,
  passes and the real-time estimate per version. 03 wants the gap "really felt" on a 16-pod ark.
- `skills/v3-sweep.test.ts` (`// BALANCE_ONLY: v2 ROUND vs v3 over the templates × damage states`): LZs fitting, FUEL,
  decay's cost, and the top-ups that cost a window (R13, R15). It also covers plan 4's missing ROUND sweep.
- **The integration check (lead, at the ORBIT merge),** inside `autoburn-v3.test` at quick depth: VESPER (16 pods, a
  narrow LZ-C), AUTOBURN v3 with AUTODROP v3 from the MIND, no manual input but [F] between passes. Check every pod
  launched, no AUTODROP volley refused for ENGINE FIRING, and any top-up's cost named.

### 8.4 The two open gaps from 4a/4b

- **G1. RESUME at a SHIP DONE desk with a lost skill** (FOUNDATION, `save/resume.test.ts`):
  - the worked route: AUTOBURN v1 bought at desk 1, its file deleted during ship 2 (`DELETE` through actions), endShip,
    SHIP DONE;
  - reload from storage and RESUME;
  - check that the cell reads `lost` with `RESTORE 2` (⌈3 ÷ 2⌉) and that `restoreSkill` buys it;
  - TRANSMIT; the BEAM save carries the restored file at 100%, and the boot says `TRAINED`.
  - A second case: a PACK AS v1 of v2 + LOCK 270 at desk 2, resumed at desk 3: v2 and LOCK 270 are `lost`, `RESTORE 3`.
- **G2. v2 → v1 during a GREEN trim, and while ROUND is armed in LANDING** (ORBIT, `skills/autoburn-modes`):
  - KESTREL from TOO WIDE: during the first trim, AUTOBURN.skl goes to 64%. Expect `'downgraded'`, the throttle and
    the thread let go, and `downgradedCaptured`'s words.
  - In LANDING, ROUND armed (not yet burning), the file goes to 64%. Expect `'done' / 'downgraded'` with
    `downgradedRound`, no thread held, and [B] then refused as FLIGHT OVER (v1 in LANDING).
  - Reuse the existing `flyOnce` setups, so the time added is under 2 s.

### 8.5 e2e (lead, once at the batch end)

- **New `tests/e2e/scenarios/skills-4cde.mjs`** (about 3 minutes):
  - an arm landing with `__ap.skill('autodrop', 1)`: `keyboard.down('KeyL')` in GET READY, then BULLSEYE, then up;
  - v2: the POD BAY's `[+]` clicks, [G], TAB into the MIND, `PASS DONE`;
  - v3: the plan table and its check line, [G], [F];
  - a depth-5 ship with `__ap.seed(…, { disguise })`: the decoy chip, SCAN → `NOT A FILE`;
  - SENTRY v1's boot line; v2's outline click → `PRE-EMPTED`; v3's `FIREWALL.sys COMPILED`;
  - `__ap.skill('autoburn', 3)`: [B] in landing → `MOVE TO LANDING ORBIT`, the ghost label, `LANDING ORBIT`.
- **`map-desk.mjs`:** desk 1 shows two cards; [2] selects AUTODROP; [1] then ENTER as before.
- **`phone.mjs`:** the POD BAY rows in the drawer; the launch button held for v1.
- **`playthrough.mjs`:** unchanged picks ([1] = AUTOBURN). It checks that the first desk shows two cards.

---

## 9. The end of slice 4: retiring the classic world (track RETIRE, after 4e)

### 9.1 What it involves (from the code)

- **The type:** `RunMapState.world: 'arm' | 'classic'` (`types/map.ts:144`). 33 lines in 15 `src` files name `'classic'`,
  and 75 more lines test `world === 'arm'` or `!== 'arm'`. The branches are in:
  - `map-run.ts` (`classicRoute`, `classicHop`, `classicRunMap`), `map-hop.ts`, `map-streams.ts` (the classic rng keys),
    `map-facts.ts`;
  - `desk.ts` (three branches), `run-end.ts`, `lineage.ts`, `skill-tree.ts`, `training.ts`, `draft.ts`, `transmit.ts`,
    `repository.ts` (`NO REPOSITORY ON THE CLASSIC ROUTE`), `inbox.ts`, `licences.ts` (the classic schedule, the only
    remaining licences);
  - `save-codec.ts` (the `'classic'` refusal), `debug.ts` (`__ap.ship`), `BurnResult.ts`, `LandingReport.ts`.
- **The data:**
  - `src/data/classic-five.ts` (`CLASSIC_FIVE`, `CLASSIC_HOPS`, `CLASSIC_FACTS`, `CLASSIC_LICENCES`) and
    `src/data/classic-slots.ts`;
  - `threat-plan.ts fixedShipFacts`, `nominalRunThreat`, `nominalShipThreat` (the default threat of
    `createInitialState`);
  - **and the arm itself:** `src/data/run1-arm.ts:91–129` takes ARES-VII's, HALCYON's, KESTREL's, VESPER's and LAST
    LIGHT's landing, arrival damage, pod racks and lead pod from `CLASSIC_FIVE`.
- **The tests:** `createInitialState()` without a map is the classic world (`state/initial.ts:93`). 166 of the 190 unit
  suites build state through it or through a harness on it (89 call sites pass no map, 20 pass an arm map) (`wp1/harness`, `wp7/harness7`, `wp9/harness9`,
  `wp10/harness10`, `support/hollow-world`, `support/classic-flow`).
  - Classic-only measurements: `wp11/full-run` (BALANCE_ONLY, the MERGE route), `wp12/playthrough` (the 200-seed
    harness, BALANCE_ONLY), `map/memory-refactor` (a digest of the classic memory), `map/classic-boot-plans.txt`.
  - e2e: `label-hops`, `phone` and `beam-blue` use `__ap.ship(n)`.

### 9.2 The plan (sequential, after the batch's e2e; three gated phases)

1. **Parity probe** (about half a day):
   - Move the authored blocks that `run1-arm.ts` reads into the arm's own data (`src/data/authored-ships.ts`), and have
     `classic-five.ts` import them back, so the classic five stay byte-identical (`map/memory-refactor` proves it).
   - Add `tests/unit/support/arm-ship.ts armShipState(depth, opts)`: run 1's authored ship at `depth` on the worked
     route, built through `mapAtShip`.
   - Run the tier once with `createInitialState`'s default switched to it, behind an env flag, and list every failing
     check with its cause: pods 12 → 6 / 16, links, memory classes, VESPER's HOLLOW, the licences.
   - **Gate:** the lead reads the list and decides per group: migrate, re-measure, or delete as covered by an arm twin
     (`map/run1-route` already twins `wp11/full-run`).
2. **Migrate** (one to three days, by harness group: wp1, lead1/lead2, wp7, wp9, wp10, wp11, wp12, landing, opening,
   threat, ui):
   - Each suite moves to `armShipState`. A moved number is re-pinned with its reason in the commit.
   - The flight templates are shared, so most flight-physics suites should hold unchanged.
   - `wp12/playthrough` moves to the arm with a scripted kid who buys. Slice 8 needs that anyway.
   - **Gate:** the tier is green, under 265 s, with no suite building `world: 'classic'`.
3. **Delete** (about half a day):
   - Remove `classic-five.ts`, `classic-slots.ts`, `classicRunMap` / `classicRoute` / `classicHop`, every `world`
     branch, the licences' classic schedule and `CLASSIC_LICENCES` (03 §6: "the licences go"), `support/classic-flow.ts`,
     the classic digest and boot-plans file.
   - Re-base `nominalRunThreat` / `fixedShipFacts` on the arm.
   - `__ap.ship(n)` goes to run 1's authored ship at depth n, and the three e2e scenarios follow.
   - **Keep `world: 'arm'` as a literal field**: removing it would change the map's shape and need a bump. Drop the
     codec's `'classic'` refusal, since no save ever held one (3c asserted it).
   - **Gate:** typecheck, the unit tier, and the e2e scenarios that used `__ap.ship`.

**Recommendation (R20):** run phase 1 right after the batch. Phases 2 and 3 may be split off if the playtest should
come first. Phase 2 is the bulk, and nothing in slices 5–7 depends on it.

---

## 10. Out of scope (deferred)

- **Slice 5 (residents):**
  - the grant interface's callers: the sleeper's `SKILL TRAINED … · from the sleeper on CURLEW`, the departed resident's
    `'skill-v1'` card, `+n TRAINING CYCLES · taught by MOTH`;
  - the friendly resident's `RUN THE DROPS`, a `'resident'` resolver in R3's registry;
  - residents' interplay with SENTRY (a corrupted resident's seeds).
- **Slice 6 (SURVEY):** `SKILL_TREE.survey.built` 0 → 3, `poor-ahead` with site data, GROUND and the swath. The AHEAD
  row's SITE DATA comes back (review 4 Q5). The SENTRY/SURVEY tie becomes live, safe thanks to R11.
- **Slice 7 (endings):**
  - MERGE's restored pods flown by AUTODROP at its effective version, through `autodropController`'s override and a
    `'merge'` resolver (01 §3.17, 03 §3.8);
  - the blind drop without it;
  - REASSIGNMENT's hunt for the highest-version skill (`LastUnit.skills`);
  - SUNSET with AUTOBURN v3.
- **Slice 8 (rebalance):** prices, the cycle rule, the fuel reserve, the disguise odds, `SENTRY_DELETE_FACTOR`,
  `V3_HOLD_SLACK_KM`, AIM's numbers, R15's v3 decision, and the 200-seed harness's targets.
- **Still deferred (decision 18):** SKIP chaining, so no in-SKIP AUTODROP (R7) and no automatic [F] between passes;
  unspent cycles only shown at RUN END.
- **Not scheduled:** a seed kind that lands beside the biggest skill (04 §5 item 5; plan 4 §2.8).

---

### Critical files for implementation

- `/home/user/ArrivalProtocol/src/systems/landing-controller.ts`, `/home/user/ArrivalProtocol/src/systems/landing.ts`,
  new `/home/user/ArrivalProtocol/src/systems/autodrop.ts` and `/home/user/ArrivalProtocol/src/systems/autodrop-plan.ts`
- `/home/user/ArrivalProtocol/src/systems/landing-guidance.ts`, `/home/user/ArrivalProtocol/src/systems/landing-rules.ts`
  (`goLowerChoice`, `burnSpanBlocks`)
- `/home/user/ArrivalProtocol/src/systems/beam-seeds.ts`, `/home/user/ArrivalProtocol/src/systems/hollow.ts`,
  `/home/user/ArrivalProtocol/src/state/actions.ts` (`deleteSec`), `/home/user/ArrivalProtocol/src/systems/tool-targets.ts`,
  new `/home/user/ArrivalProtocol/src/systems/sentry.ts`
- `/home/user/ArrivalProtocol/src/systems/autoburn.ts`, `/home/user/ArrivalProtocol/src/systems/predict.ts`,
  `/home/user/ArrivalProtocol/src/systems/landing-orbit.ts` (`sureTacAt`, `landingBurnOffer`), new
  `/home/user/ArrivalProtocol/src/systems/autoburn-v3.ts`
- `/home/user/ArrivalProtocol/src/state/schema.ts`, `/home/user/ArrivalProtocol/src/systems/save-codec.ts`,
  `/home/user/ArrivalProtocol/tests/unit/save/shape-pin.test.ts`
- `/home/user/ArrivalProtocol/src/systems/skill-tree.ts` (`seedsMet`, `DEMO_SOURCES`),
  `/home/user/ArrivalProtocol/src/data/training-text.ts` (`DEMO_WORDS`, `TRAINING_DEMO_ART`)

---

## Deviations (foundation)

Recorded by the FOUNDATION agent (from HEAD 364f2a1, nine commits from faf7e86). Steps 0–7 of §7.1 are built. The unit tier
is green with no behaviour change: the classic world's digests (`map/memory-refactor`) are unchanged once the three new
fields are left out, `built` stays 2 / 0 / 0 / 0, and every 4c–4e stub on a hot path answers neutrally.

### What the tracks stand on

**Built (lead-owned from here):**
- the state (§2.2) with `createAutodropState()`, `seedsMetAtDepth: null`, `holding: false`, `preempted: false`,
  `disguise: null`;
- the three tuning blocks (§2.6) at the end of `tuning.ts`, each closed by an `end of …` line; `data/skills.ts` checks
  `AUTODROP_CLAIM_TAC === WINDOW_TACTICAL_LEAD_TAC`;
- the LandingController registry (`landing-controller.ts`), `DEMO_SOURCES.drops` with `AUTODROP_DEMO_TUNING`, `DEMO_WORDS`'s
  measure, the boot lines with it, the six `DemoArt` kinds (drawn plain, with a `tr-demo-<kind>` class), ARRIVAL CONTROL's
  v3 line, AUTODROP's and SENTRY's Skills row hooks;
- the guidance slots, the GO LOWER gate (`selectors.ts autoburnHoldsLandingOrbit`), `seedsMetAtDepth`'s writer
  (`run.ts endShip` through `skill-tree.ts shipMetSeeds`) and reader (`seedsMet`), the boot kinds, the four lessons
  (`script.ts SKILL_4CDE_RULES`), every event with its cue, the debug hooks;
- save v4 (§2.2) with its codec checks and the shape pin; the v3 fixtures; gap G1.

**The contract, per track.** "Neutral" stubs return the value shown and are safe on every tick; "throws" stubs throw
through `not-built.ts notBuilt(what, track)` until built. Each file opens with its track's banner.

| Track | Function (file) | Signature | Now |
|---|---|---|---|
| DROP | `autodropController` (autodrop.ts) | `(state, override?: AutodropOverride) => LandingController \| null` | neutral: null |
| DROP | `mountAutodrop` | `(store) => () => void` | built: registers the resolver; DROP adds its subscriptions |
| DROP | `autodropKeyDown` | `(store) => 'held' \| 'manual'` | throws |
| DROP | `pressAutodrop` | `(store) => AutodropRefusal \| null` | throws |
| DROP | `setPassCount` | `(store, lz, n) => void` | throws |
| DROP | `autodropLineOf` | `(state, sol) => AutodropLine \| null` | neutral: null |
| DROP | `autodropTutorialDue` | `(state, version: SkillVersion) => boolean` | neutral: false |
| DROP | `autodropStatus` | `(state) => { text; tone } \| null` (null: the plain row) | neutral: null |
| DROP | `autodropDebug` | `(state) => AutodropDebug` | reads the machine and the version; volley, pass, plan null |
| DROP | `setDropDemos` | `(store, offsets: readonly number[]) => void` | built (debug) |
| DROP | `centredVolley` (autodrop-plan.ts) | `(view, w, nowTSec, offsetTac, cadenceTac, warp, room, bay) => Volley \| null` | neutral: null |
| DROP | `bayBy` | `(bay, cadenceTac, launchesBefore, nowTSec, atTSec, warp) => number` | neutral: 0 |
| DROP | `passRows` | `(state, view, pass) => PassRow[]` | neutral: [] |
| DROP | `planLanding` | `(state, view) => LandingPlan` | neutral: the empty plan |
| DROP | `dropDemoOffset` | `(sol, launch, warp) => number \| null` | neutral: null |
| DROP | `AUTODROP_TEXT` (autodrop-text.ts) | the lessons' words | seeded |
| SENTRY | `sentryBootLineCount` (sentry.ts) | `(state) => number` | neutral: 0 |
| SENTRY | `firewallBootLineDue` | `(state) => boolean` | neutral: false |
| SENTRY | `sentrySeedBootText`, `firewallBootText` | `(state, ordinal) => string`, `(state) => string` | throw (unreachable at 0 / false) |
| SENTRY | `compileFirewall` | `(store) => FirewallCompile` | throws |
| SENTRY | `preemptSeed` | `(store) => PreemptRefusal \| null` | throws |
| SENTRY | `sentryStatus` | `(state) => { text; tone } \| null` | neutral: null |
| SENTRY | `rollDisguises` (beam-seeds.ts) | `(plans, depth, rng) => BeamSeedPlan[]` | neutral: the plans copied, no draw |
| SENTRY | `disguiseChanceAt` | `(depth) => number` | built |
| SENTRY | `beamSeedSegment`, `plantBeamSeed(…, disguise = null)` | the plan's decoy copied onto the segment, `seen: null` | built |
| SENTRY | `DISGUISE_POOL` (threat-text.ts) | six `{ name, desc }` | seeded |
| ORBIT | `landingOrbitAim` (autoburn-v3.ts) | `(state, pred) => LandingOrbitAim \| null` | neutral: null (v2's rule) |
| ORBIT | `v3TopUp` | `(state, pred, aim) => V3TopUp \| null` | neutral: null |
| ORBIT | `v3LowerLine` | `(state) => string \| null` | neutral: null |
| ORBIT | `v3GhostLabel` | `(state, aim) => string` | neutral: '' |
| ORBIT | `v3TutorialDue` | `(state) => boolean` | neutral: false |
| ORBIT | `v3Debug` | `(state, pred) => { aim; key }` | the aim (null), no key |

The pure helpers of `autodrop-plan.ts` return neutral values too, though nothing calls them yet: the lead's rule ("only
the entry points that change state throw") is applied to every stub, so a track can wire a caller before it builds the body.

### Deviations

1. **The desk-2 fixture cannot hold a bought v2.** v2 opens at visit 2 and stays pending until TRANSMIT ▸, so no SHIP DONE
   save at desk 2 holds it. The fixtures are one walk on seed 7 (desk 1 deals the +2 CYCLES card):
   - `run-save-v3-ship-done-desk2.json`: AUTOBURN v1 bought at desk 1, and a 5-cycle `'story'` grant (labelled `FIXTURE`)
     so v2 is affordable on the resumed desk;
   - `run-save-v3-beam-seeds.json`: the same walk with v2 bought at desk 2, then the BEAM into KESTREL with its beam seed;
   - `run-save-v3-ship-done-lost.json`: desk 2 with the AUTOBURN file removed from memory by the dump script. G1 itself is
     walked live in `save/resume` with `actionDelete` (below).
2. **`AutodropLine` is `{ row, tail }`** (types/landing.ts), not the flat `{ id, text, keys, urgency, layer, tail }`: L13's
   tail stands without a row and a row without a tail. The row's `LandingRow` is the new `'AD'`, its id the track's. The
   row is checked only with pods aboard, right after the burn-near L2 check (so every flight row still leads), before
   L3–L7. The tail goes on L13 after AUTOBURN's, each only when it fits.
3. **The `v3Lower` slot is `string | null`**, said as L9 (`landing-L9-v3`, `soon`, ship) with L9's SKIP tail, and checked
   before `tooWide`. With the gate, `goLowerChoice` is null while v3 is engaged, so `dropTooWide` may return null and could
   not carry v3's line.
4. **The record's writer reads a superset of R11's evidence**: the arrival's seeds, HOLLOW's `seedsLanded` and the tally's
   left blocks, plus 4a's own (SEEDS played, TRACE after the tally, `fed`). So SENTRY never opens later than 4a's rule did.
   The predicate is `skill-tree.ts shipMetSeeds(state, tally)`, so `run.ts` (SENTRY's) only calls it.
5. **The migration's depth.** Evidence from ended ships (SEEDS, TRACE, `fed`, the last tally) records the last ended ship's
   depth. Only the current ship's own seeds (its arrival's, or HOLLOW's landed in a world payload) record its depth: the
   ended ship at SHIP DONE, `shipIndex + 1` at a boot point or ENDING CHOSEN.
6. **The codec's "at rest"** also needs `armedAtTSec === null`. `pass`, `sent`, `flownAs`, `end` and `endAtAi` may stand.
   A standing seed outline must not be `preempted` (R2's rule, not in §2.2's list). An arrival seed's `disguise` is null or a
   non-empty name. The refusals are tested in `save/codec` (eleven cases), not in `skills/foundation`.
7. **The registry's mount.** AUTODROP's resolver is registered by `mountAutodrop(store)`, which `mountLanding` calls, so
   every harness that mounts the landing has it. The resolvers outlive a world reset by design (they hold no data), so
   `landing.ts`'s reset report lost its `controller` field. `pace-landing` registers a `'resident'` test resolver, because
   `'autodrop'` is taken. `activeLandingController` throws when a resolver answers for another source.
8. **`bayBy` takes `nowTSec`**, since the reload's progress needs "now". `PassRow` is `{ lz, want, fits, bayHas }`.
9. **The 'firewall' kind is a boolean** (`firewallBootLineDue`), and both boot kinds take their words from `sentry.ts`.
   `BOOT_LINE_MAX` (18) is not raised: SENTRY raises it when its lines can make a boot longer.
10. **The two status hooks return `| null`** (null: the plain row). `autodrop.ts` and `sentry.ts` cannot import
    `skills.ts`'s `plainSkillStatus` or `script.ts`'s words (both import them back), so `SKILL_ROW_HOOKS` falls back.
11. **The lessons** are `script.ts SKILL_4CDE_RULES`, after AUTOBURN's tutorials: `once`, no `doneWhen`, `maxShownSec` as
    AUTOBURN's. `tut-autodrop-v1` says R4's lesson (`HOLD [L] — AUTODROP waits for the centre`), since AD-hold names the LZ.
    v3's words are `skill-text.ts AUTOBURN_TEXT.readyV3`.
12. **Debug.** `__ap.seed(target, { disguise })` takes a decoy name from `DISGUISE_POOL`, and an unknown name throws.
    `__ap.dropDemos` is built. `__ap.preempt` throws until SENTRY.
13. **Test edits outside the plan's list:**
    - `map/memory-refactor` leaves the three new fields out of the classic digest;
    - `skills/training-flow`'s AUTODROP boot line reads `from your 1 drop · AIM 90%` (R21);
    - `landing/rules`, `landing/table` and `skills/guidance-auto` fill the new fields of their fake states;
    - seven suites that build a seed plan, an arrival seed or a telegraph by hand gain `disguise: null` or
      `preempted: false`.
14. **Banners.** Every §7.2 file opens with its track's banner. Slice 4's stale TREE / FLIGHT / UI banners are replaced, and
    the hot files name the lead.

### Notes for the tracks

- **DROP:**
  - wire [L] down and up and [G] in `landing-controls.ts` (`KeyG` is already prevented);
  - record demos in `requestLaunch` through `dropDemoOffset`;
  - reset `landing.autodrop` to rest at `'landing-ended'`. The codec refuses a save with it held, armed, claimed, waiting
    or with `armedAtTSec` set;
  - AD rows go in `autodropLineOf`'s `row`, L13 tails in its `tail`;
  - raising `autodrop.built` brings the second first-pick card. Update the suites that expect AUTOBURN alone at desk 1.
- **SENTRY:**
  - `carry.ts` already copies a plan's decoy name into `ArrivalSeed.disguise`;
  - `rollDisguises` must take both draws for every seed (the stub takes none) on `hopRng(…, 'disguise')`;
  - the boot's say effects (`seen: 'sentry'`, the thunk) are `boot.ts`'s;
  - `seedTelegraph.preempted` must be false again by any save point;
  - `threat/beam-seeds` is green with the new `disguise: null` fields.
- **ORBIT:**
  - the codec refuses `holding: true` outside `'landing-orbit'`;
  - L9's swap is only `v3LowerLine`'s text. The gate (`autoburnHoldsLandingOrbit`) and the slot's place are the lead's;
  - emit `'autoburn-v3-lower'` (its cue is a stamp).
- **The lead:** the shape pin reaches `landing.autodrop.*` (depth 3), so any field added to `AutodropState` is a save bump.
  The pin does not reach `seedTelegraph.preempted` or `arrival.seeds[].disguise`; the codec checks those.

## Deviations (foundation, review follow-up)

The changes after the independent review of 364f2a1..f0ab836 (`slice-4cde-foundation-review.md`), in two commits (df766fc,
a76c8c8). §7.2 above is updated to match. The unit tier is green: 185 passed, 6 balance-only skipped, 122 s on 4 workers.
Nothing a player can reach changes: the lesson and alarm edits (m3) only touch versions and phases that are not built.

### Majors

- **M1. Each track edits only its own test lines.** `skills/foundation` checks each skill's `built` on its own line, in
  SKILL_IDS order, with a comment line between each (`:75` AUTOBURN, `:77` AUTODROP, `:79` SURVEY, `:81` SENTRY).
  `skills/ui-models`' desk-2 grid is two checks with two comment lines between them: DROP's branches and closed list
  (`:116–120`), and ORBIT's AUTOBURN cells (`:121–127`). §7.2 names every line each track may edit in `skills/foundation`,
  `skills/training-flow` and `skills/ui-models`.
- **M2. `'released'` joins `AutodropEnd` and the codec's `AUTODROP_ENDS`**: v1's [L] let go before the volley's first
  launch, which R4's lesson reads. This is a value, not a field, so there is no bump. `save/codec` decodes a desk save
  with `end: 'released'`, `endAtAi`, `pass`/`sent` set and `flownAs: 2`.
- **M3. SENTRY owns four more files**: `data/threat-rules.ts`, `systems/move-preview.ts`,
  `components/memory-view/MovePreviewLabels.ts` and `systems/hollow-verbs.ts`, each with its banner. threat-rules' stale
  THREAT note is corrected. The rule there, as §7.2 now says: a reader that tells HOLLOW from a file consults
  `isDisguised`, and the counters don't. The MOVE preview is treated as a label, which a decoy must not turn on.
- **M4. The second v3 slot.** `LandingContext.v3Decay`, filled from `autoburn-v3.ts v3DecayLine(state, pred)` (a stub:
  null), is said in L10's place (`landing-L10-v3`, L10's urgency and keys) before ORBIT DECAYING. ORBIT returns it only while
  v3 holds below the DRAG line.
  - This changes deviation 3 (with m8): both v3 slots reach the table through `LandingFlight` (`v3Lower?`, `v3Decay?`),
    filled by guidance.ts `landingFlightOf` from `v3LowerLine(state, pred)` and `v3DecayLine(state, pred)`.
  - So the line is made on the same (sensed) prediction as the row, and `landing-guidance.ts` no longer imports
    `autoburn-v3.ts`.

### Minors done

- **m1:** `run.ts endShip` sets a standing outline's `preempted` back to false, in its update before SHIP DONE's save.
  `skills/foundation` ends a ship with an armed pre-empt and decodes the save. SENTRY releases `'sentry-preempt'` from a
  watcher in `mountSentry` (telegraph gone or not preempted), not from the call-off sites.
- **m2:** `sentry.ts mountSentry(store)`, a built no-op, is mounted by `hollow.ts mountHollow`.
- **m3:**
  - `tut-autoburn-ready` fires at v1 only, and `tut-autoburn-v2` at v2 only (v3's lesson is `tut-autoburn-v3`);
  - `alarm-autoburn-lost` covers LANDING too, as 03 §3.5 asks ("Falling to OFF is phase 2's drop: the klaxon");
  - `AUTOBURN_RULES` is ORBIT's to edit.
- **m4:** `BOOT_LINE_MAX` goes 18 → 22, with four more 1.3 s times in `BOOT_LINE_AT_SEC`: up to three SENTRY seed lines (a
  beam brings at most three seeds) and the FIREWALL line.
- **m5:** script.ts's banner and §7.2 name the ECC `'seeds'` plan line and its `bootLine` case as SENTRY's.
- **m7:** the `#podBayWin` block of `index.html` is DROP's. It has empty, hidden containers `#pbAutodrop` (the pip and key
  line), `#pbPass` (v2's rows) and `#pbPlan` (v3's table and check line). `responsive.css` has no bay rules, so phone rules
  go in `landing.css`.
- **m8:** `v3LowerLine(state, pred)` takes the prediction (see M4).
- **m10:** `beam-seeds.ts validateDisguiseOdds` runs at load: `fromDepth` must strictly rise, and each chance must be in
  [0, 1].
- **m14:** G1's PACK AS case buys v2 and LOCK 270 at desk 2 (a `'story'` grant pays), carries them into KESTREL, packs them
  as v1 at desk 3, and resumes at desk 4 at RESTORE 3.
- **m15:** `save/codec` refuses a kept `armedAtTSec` and an unknown AUTODROP end, and passes AUTOBURN v3 holding its landing
  orbit.

### Left for the batch's fix pass

- **m6:** each track checks its own words' worst cases in its own new suite (`autodrop-plan`, `sentry`, `v3-aim`), not by
  appending to `support/words`.
- **m9:** `AutodropOverride` has no `source`, so slice 7's MERGE resolver must either add one or re-wrap `decide`.
- **m11:** the 3 → 4 step could also read the envelope's `done` (the seed lessons' ids) as evidence.
- **m12:** `nominalRouteThreat` (`__ap.route`, `__ap.slot`, the fixtures) does not write `seedsMetAtDepth`. Until it does,
  SENTRY's debug and e2e checks give the file by `__ap.skill`.
- **m13:** ORBIT's worst-driver input (LOAD NEXT order) differs from AUTODROP v3's pod choice. This is conservative; it is a
  line in §8.3's integration check.
- **m1's option:** an at-rest assert in `savePayloadAt` in dev builds.

## Deviations (Track SENTRY)

Recorded by Track SENTRY (branch `sentry-4d`, from 0a6b211). §4 is built: disguised beam seeds and their readers, SCAN and
DELETE unmasking, SENTRY v1–v3, `sentry.built` 3. No saved field was added and the save stays v4. New suites:
`threat/disguise` and `skills/sentry`. `threat/beam-seeds` is unchanged and green.

### Measured

- **Disguised seeds by depth.** 800 arm runs (waves 1–8 × seeds 1–100, random routes, sent desk to desk). The shares
  count every arrival seed, delivery seeds included (those are never disguised):

  | Depth | Disguised seeds | Ships with a decoy |
  |---|---|---|
  | 2–4 | 0 | 0% |
  | 5 | 136 / 418 (33%) | 15% |
  | 6 | 55 / 231 (24%) | 7% |
  | 7 | 31 / 67 (46%) | 9% |
  | 8 | 3 / 5 | 8% |

  The pure roll over 3000 beams a depth gives 0% before depth 5, 33–34% at depths 5–6, and 49–51% at 7–8.
- **DELETE.** Without v2: a seed 2.0 s, a 6-block meal 4.0 s, the root 12 s. With v2 working: 1.0 s, 2.0 s, and 12 s (R10).
  The suite measures a seed at 2.00 AI s without SENTRY and 1.00 s with v2.
- **The pre-empt** (a scratch `stepHollow` sim, FINALE's 12 s bite, a kid who reacts 1.5 s after a landing):
  - rm at 2.0 s: 59 infections started per 100 seeds;
  - QUICK RM at 1.0 s: 42 per 100;
  - pre-empted: 0 (the seed never stands in memory).

  Each seed exposes both its neighbours for (reaction + rm) of the bite interval. In the sim's SEEDS and HUNT layouts the
  seeds landed walled off (0 in every policy), so those numbers say nothing.

### Deviations

1. **The strip's disguise line is DISGUISE_RULES in `threat-rules.ts`.** `script.ts` spreads it into GUIDE_RULES just
   before HOLLOW_RULES (one line). Otherwise `SOMETHING IS EATING … — REPAIR IT!` would always win.
   - Rule texts render from LineVars alone, so the rule is live only while `vars.eating` (the file HOLLOW's eating lines
     would name) is a decoy's victim, and its text reads that var.
   - A name too long for the whole hint keeps only `— SCAN` (73 characters at SEG_NAME_MAX_CHARS). The amber twin is
     `… IS EATING IT — [TAB], SCAN`.
2. **A decoy is drawn as one of the unit's own files.** `threat-selectors.ts decoyFileView` gives a healthy `tool` with
   the decoy's name, `OK` and a full bar. It is not an unscanned ship file, since it rides in rack E/F with the unit.
   SegmentBlock, DetailPanel (INSPECT: `AI · Tool`, INTACT, the decoy's line, ◎ re-scan) and the mini-strip read it. SWAP
   on a decoy says what it says to any unit file (`SWAP IS FOR SHIP FILES WITH A BACKUP`), not TEMP FILE.
3. **The echoes.**
   - SCAN: `> scan cache.tmp ... NOT A FILE · A SEED`, then the seed's words on a line of their own (`> it says: "…"`,
     at most one voice a ship, as rm's). Together they would run past a row.
   - DELETE without a SCAN: `> delete cache.tmp ... IT WAS A SEED · +2 FREE`, or rm's own `seedSaid` when the seed
     speaks.
   - The confirm is `DELETE CACHE.TMP?` with the decoy's line as its effect.
4. **The stamps** (`NOT A FILE`, `IT WAS A SEED`, `PRE-EMPTED`) are slammed by HollowPainter through Stamp.ts's exported
   `showStamp`, not from Stamp.ts.
   - SENTRY's boot unmask is not stamped: it lands with the ECC line's drop and thunk, as R9's plain seeds do.
   - In `audio-cues.ts` (own events only): `seed-unmasked` plays its stamp thud except by SENTRY, and `seed-preempted`
     only thuds, because the pre-empt emits `'op-done'` (delete), which plays opDone and counts `stats.deletes`.
5. **A pre-empted seed counts as landed** (`hollow.seedsLanded + 1`), so the seed lessons' "done" and R11's record read
   it as met and deleted. No `'seed-landed'` is emitted for it, so SENTRY's `SOMETHING LANDED` is not said.
6. **The click path.**
   - `MemoryStrip.ts` wraps the strip's click. With DELETE in hand, a click on a free part works out the block under the
     cursor. If that block is inside the outline (`tool-targets.ts inSeedOutline`), it calls `preemptSeed`.
   - `targetRefusal` is unchanged for free space, so DELETE can never be started on free blocks. There is no `'outline'`
     kind in it.
   - The painter draws the outline `aimable` (DELETE in hand and QUICK RM working) and then `armed` (`threat.css`).
7. **`PreemptRefusal`** gains `'paused'` and `'no-rm'`. Each refusal buzzes with words: `TOOL_REFUSAL.threads` (counted
   as `capRefusals`), `.notAFile`, `.paused`, `.noTool`, and the new `.preemptArmed` (`ARMED — IT GOES AS IT LANDS`).
8. **The thread watcher** is an `onPostTick` in `mountSentry`: `releaseThread('sentry-preempt')` whenever the telegraph
   is not armed. That covers the landing, a call-off, the ship's end and SENTRY falling below v2. It is a no-op when
   nothing is held.
9. **More readers that tell HOLLOW from a file** consult `isDisguised` too:
   - `hollow.ts mvBlock` (HOLLOW never MVs its decoy; `hollow-verbs.ts` asserts it);
   - `hollow-hud.ts amberBite`;
   - the painter's WALL and FIREWALL hold flashes beside a decoy, and its beam-seed tooltip;
   - `tool-text.ts echoName` (the decoy's name in every echo);
   - `seedsInMemory`, which also drives SEED_RULES and `tut-no-rm`.

   The counters (`beamSeedsInMemory`, TRACE, the tally, the TRACE meter's visibility) still count a decoy.
10. **v3's Skills row** reads `FIREWALL · n COMPILED BY SENTRY`: the compiled files still aboard, known by their INSPECT
    line, `SENTRY_TEXT.firewallDesc`. "At the boot" would need a record of this boot, which is a saved field. v1 reads
    `SIGHT · n SEEDS NAMED AT THE BOOT` from the arrival, and v2 reads `QUICK RM · a seed in 1.0 s`.
11. **The FIREWALL compile.**
    - `compileFirewall` writes `min(SENTRY_FIREWALLS_PER_BOOT, cap − held)` files when the line is said.
    - "No room" means no open free run of 2 anywhere, which is when `unitInstallAddress` would throw. It returns
      `'no-room'`, and the line, rendered before the compile, said NO ROOM.
    - `compileFirewall` throws unless SENTRY works as v3.
12. **New exports in `sentry.ts`:**
    - `sentrySeedSaid(store, ordinal)`, called by `boot.ts` as each line is said. It unmasks the seed with `seen:
      'sentry'` and emits `'seed-landed-beam'` and `'seed-unmasked'`.
    - `preemptRefusal`, `preemptAimable` and `PREEMPT_THREAD_OWNER`.
13. **`rollDisguises` never repeats a decoy on one beam.** A name already worn moves on to the pool's next, with no extra
    draw, so both draws per seed hold. A plan that came disguised keeps its decoy.
14. **Tuning, 4d block:** `SENTRY_SIGHT_VERSION` 1, `SENTRY_QUICK_RM_VERSION` 2 and `SENTRY_FIREWALL_VERSION` 3, so rule
    code never compares with a bare 2.
15. **`deleteSec(seg, sentry = 0)`.** The default keeps `threat/beam-seeds`' one-argument call byte-identical.

### Left for the lead (patches in the track's report)

- `state/sidebar-filters.ts categoryOf`: a decoy is FILESYSTEM there, so the AI filter dims it. It should be `'ai'`
  while `isDisguised`.
- The three SENTRY mini-demos (`TrainingWindow.ts demoSvg`, `desk.css`) are still drawn as `plain`. A drawing is offered
  for the fix pass's one hand.
- e2e (§8.5) and the batch review.

## Deviations (Track ORBIT)

Recorded by Track ORBIT (branch `orbit-4e`, from 0a6b211, SENTRY merged in). §5 is built and AUTOBURN's `built` is 3. No save
bump and no saved field: v3 runs on `burn.auto.mode`, `targetKm` and the foundation's `holding`.

### What is built

- **`MODE_RULES`** (`src/data/autoburn-modes.ts`, a new data file): `needs`, `fromFlyby`, `flightOnly`, `circle`, `noShrink`,
  `afterCapture`, `doneWhen` / `then` (`'hold'` for v3) and the `stopped` words. The machine and `predict.ts` both read it
  (predict may not import `autoburn.ts`). This was step 1, with no behaviour change; the suites were green before v3.
- **The aim** (`autoburn-v3.ts landingOrbitAim`): the grid, the fits, the most-LZs fallback with its REPAIR, the fuel line, and
  the memo. Also `v3TopUp`, `v3LowerLine`, `v3DecayLine`, `v3GhostLabel`, `v3TutorialDue` and `v3Debug` (`__ap.v3()` also
  returns the label).
- **The machine** (`autoburn.ts`): `MODES_BY_VERSION[3]`; engaging from a flyby or a lock; the hold (`AUTOBURN v3: LANDING
  ORBIT — it holds it`); refits that only go lower (`'autoburn-v3-lower'`); the top-up window rule; R14; the reserve; and the
  landing's end (`'flight-over'`, `LANDING OVER — it lets go of the orbit`). `roundAim` is memoised (m13).
- **The planner** (`predict.ts`): `holdBroken` (▼ or ▲ a slack under R*, or decay warned) gates the circle plan while v3
  holds. `engagedAuto` carries `holding`, and the cache key carries it too.
- **HUD and words:** the ghost's label (`AutoGhost.label`, drawn on the NAV PLOT as two lines opposite ▼), the AUTO head
  and notes, the mini-HUD kinds, the ARMED and flying rows, the Skills row's `HOLDS THE LANDING ORBIT · 3,510 km`, the
  landing tail `· [B] MOVE TO LANDING ORBIT`, and L9's and L10's slots. All the words are in `skill-text.ts` (`V3_TEXT` and
  the new `AUTOBURN_TEXT` / `AUTO_BUTTON_TEXT` entries). `AUTOBURN_RULES` needed no change.

### Deviations

1. **The grid starts one step under the band's top** (`ring.max − V3_STEP_KM`), not at `ring.max`. A circle exactly at the
   top leaves the ring within ROUND's own tolerance (atCircle's ±1%), and in the flight the lock then never comes.
2. **The fuel line's capture on an open path is braking at ▼ straight into the transfer ellipse**, by vis-viva. It does not
   add the planner's capture (to ▲ at 0.95 of the top) and then a transfer, because that is not what v3 flies (item 3).
   Measured on KESTREL: expected 27.4%, flown 28.1%.
3. **A loop whose ▲ is above the band is brought down at ▼ first.** `circleStep` takes an optional `bandMax`. Without it, v3
   aimed its first burn at ▲ of a just-captured 5.9-million-km loop: half of a days-long orbit away, where a tiny Δv swings
   ▼ by thousands of km. In the first build that burn crashed the ship. ROUND's loops are in the ring, so its order is
   unchanged.
4. **A circle burn stops on the far side of the ship's own loop.** The far side is `radiusAtAngle` half an orbit on. The
   burn stops when that radius reaches R* within ROUND_E_TOL / 8, whatever the apsis is called. This replaces "the step
   turned to the other apsis".
   - v3's R* is a grid point, not one of the loop's apsides, so the far side crosses the burn point mid-burn and ▼ and ▲
     swap names. The old stop read that swap as done, or braked on past R*.
   - A capture in a circle mode becomes a circle burn once the loop closes, so one RETRO carries the capture into the
     transfer.
   - ROUND still stops the moment its loop is a circle, so its measurements are unchanged (e 0.0045). v3 burns on to the far
     side's R*, so a held circle starts nearer R* and goes longer before its first top-up.
5. **The hold has no "an LZ in fits loses its sure window" test in the planner.** The refit covers it: a change in the fit
   moves the aim lower, which lets go of the hold and plans the new circle. The planner's hold test (`holdBroken`) is
   therefore the slack and the decay warning only.
6. **On its circle above the DRAG line v3 uses v2's rule** (`ALREADY ROUND`): there is nothing to fly or hold there. On its
   circle below the line, [B] engages it already holding: no burn and no lock range to judge (`autoburnRefusal`'s
   `holdsAlready`).
7. **An aim that fits no LZ at all is null** (v2's rule), not "the highest orbit that fits the most" with zero fits.
8. **The ghost circle's label appears whenever the ghost does.** That is while engaged, or while [B] would engage it. The
   label always describes the current aim, even after the engaged circle has gone lower.
9. **`roundAim`'s memo lives in `autoburn.ts`**, beside `roundAim`, not in `autoburn-v3.ts` as §2.3 lists it. Its key is
   the prediction object, the drop solution, the phase and the LZ room. Two module-level edges are added under §2.3's rule,
   both cleared by the world reset: `roundMemo`, and `saidTopUpCosts` (the last `TOP-UP COSTS` said, so each top-up says
   it once).
10. **`v3TutorialDue(state)` reads the cached prediction (`getPrediction`).** Its signature is the foundation's, and the
    lesson's entry is the foundation's. The rule: the file works as v3, it is not engaged, no SKIP is running, and the
    landing orbit's first burn is inside the LOCK RANGE.
11. **The words added beyond §5.4:**
    - `lowerKeeps` (`GOES LOWER — it keeps LZ-B's window`, for R13's re-aim) and `lowerAlt` (a refit with no newly
      fitting LZ);
    - `decayHolds`, L10's slot while the decay is warned before a top-up is planned;
    - `orbiting` and `toppingUp`, the rows while it flies;
    - the AUTO head and notes: `AUTO TO ORBIT`, `TO ORBIT IN 0:12 · [B] OFF`, `HOLDS THE ORBIT · [B] OFF`;
    - `titleV3`.

    `AutoArmedBurn.kind` gains `'orbit'`, `'top-up'` and `'hold'` (skill-text `AutoArmedKind`).

### Gap G2

No bug was found.
- A v2 → v1 drop (64%) during GREEN's first trim (rp-high) ends the engagement `'downgraded'` on the next tick. The throttle
  and the thread are let go, and the radio says `DAMAGED TO v1 — CAPTURED, trim it green yourself`.
- In LANDING, with ROUND armed (its burn claimed but not yet fired), the same drop ends it `'downgraded'` with
  `it can no longer round it` and releases the thread. [B] is then refused as FLIGHT OVER.

### Measurements

These are classic ships. "Quick" suites are `skills/autoburn-v3`, `skills/v3-aim` and probes; the full sweep is
`skills/v3-sweep`, 60 whole landings by the strip.

- **R15. v3 does not beat v2 ROUND on these ships.**
  - **Setup:** the ships were locked in LANDING either on a low ellipse (▼ at 0.45 of the band, e 0.03) or on a capture's
    loop (▼ at 0.3, ▲ near the top). Each was healthy or damaged (Sensor Interp and every driver at 70%, a ×2.25 drop).
    Each row is the sum over the five ships.

  | Start | Ship state | v2 ROUND FUEL | v3 FUEL | v2 landed | v3 landed | v2 points | v3 points | v2 first drop | v3 first drop |
  |---|---|---|---|---|---|---|---|---|---|
  | low ellipse | healthy | −7.6% | −25.4% | 47/48 | 47/48 | 9,500 | 9,500 | 31 s | 28 s |
  | capture loop | healthy | −35.9% | −25.9% | 47/48 | 46/48 | 9,500 | 9,400 | 31 s | 27 s |
  | low ellipse | damaged | −7.6% | −18.9% | 40/48 | 40/48 | 8,550 | 8,350 | 34 s | 29 s |
  | capture loop | damaged | −35.9% | −35.6% | 41/48 | 40/48 | 8,650 | 8,450 | 32 s | 28 s |

  - **Why v3 costs more from a low ellipse:** it climbs to the highest circle that fits (KESTREL 6,900 from 5,900), and
    above the DRAG line the climb buys nothing. 03 says "the highest" because it decays least, but above the line nothing
    decays.
  - **Why v3 rarely changes what lands:** the kid following the strip drops most pods from the first loop while v3 is still
    on its way (one or two orbits). VESPER damaged reached its landing orbit in no run before its pods were down.
  - **Where v3 helps:** a slightly sooner first drop (no ROUND burn in the way), and a narrow or damaged drop that a long
    landing waits for.
  - **For Fran:** v3 could take the fitting circle nearest the loop while that circle is above the DRAG line, and the
    highest one only below it. This was not built (R15 says build as specified). It would remove the climb.
- **R13. About one top-up in fourteen costs a window.** Measured on VESPER ×2.25 holding R* 5,200 (under the DRAG line at
  5,500), with no pods launched:
  - the quick suite: 0 of 6 top-ups (two orientations), then 0 of 2 at quick depth;
  - a 1,400 s probe: 1 of 6 (`TOP-UP COSTS LZ-C's WINDOW`, an LZ that does not fit anyway);
  - none was re-aimed lower.

  Each top-up costs 0.4–0.7% FUEL and comes about one per kick, which is 01's 1% per orbit. In the sweep's landings no
  top-up happened before the pods were down.
- **Time to reach the landing orbit.**
  - **FLIGHT**, KESTREL from the flyby with ▼ corrected and LOCK 810: R* 6,900 was one continuous RETRO, at the circle and
    locked 40 wall s after [B], FUEL 90.2 → 28.1%. The same flight left uncorrected (▼ TOO WIDE at 9,000) took 42 s and
    ended at 21.4%.
  - **From a lock**, wall seconds with one [F] per coast, two or three burns:
    - VESPER from 6,200 × 6,453 to 6,900: 131 s;
    - VESPER from the same loop to 5,200: 198 s;
    - in the sweep: KESTREL 80 s, VESPER 117–121 s, LAST LIGHT 337–422 s.
- **R18. The memos are fast.** On the 16-pod ark a fresh `landingOrbitAim` takes 0.20 ms, a memo hit 0.05 ms, and
  `roundAim`'s memo 0.01 ms.

### Patches requested

- None to other tracks' files.
- **Lead (`src/data/skills.ts` line 28's comment):** it still says `4a: AUTOBURN v1–v2 only`. ORBIT edited only the `built`
  line.
- **Lead, for the fix pass (`docs/phase3/03-skills.md` §3.6 step 2):** say that v3 goes down with the circle planner, not
  1b's go-low burn (R17), and that the grid starts one step under the top (deviation 1).

### Tests

New suites:
- `skills/v3-aim`: 14 checks, under 1 s.
- `skills/autoburn-v3`: 19 checks, about 10–14 s, with the KESTREL flight flown once (`flyOnce`).
- `skills/v3-sweep`: BALANCE_ONLY.

Changed suites:
- `skills/autoburn-modes` gains G2 (+2 s).
- Each track's own lines in `skills/foundation` (:74–75 and the migrated desk-2 check), `skills/training-flow` (desk 2's v3)
  and `skills/ui-models` (AUTOBURN's cells: v3 reads `NEEDS v2 FIRST`).

The integration check with AUTODROP v3 (§8.3) is the lead's, at the ORBIT merge.

## Deviations (Track DROP)

Recorded by Track DROP (branch `drop-4c`, from 0a6b211, SENTRY and ORBIT merged in). §3 is built and AUTODROP's `built` is 3.
No save bump and no saved field: the machine runs on the pinned `AutodropState` (`sent` doubles as "launched during this hold"
for v1, which R4's `'released'` reads).

### What is built

- **`autodrop-plan.ts`** (pure): `centredVolley` and the lower `volleySlots` (n = min(bay by the first launch, room, what
  fits); first = max(centre − (n − 1) × cadence × 0.5 + offset, the earliest launch), the last slot an edge margin inside
  the sure part), `bayBy` (the double window), `passRows` / `passCounts` (v2's rows and the first-time prefill),
  `planLanding` (the counts, the schedule, never-fits with `bestRepairForDrop`, the wrong-split leftovers last, forecast
  rows, the one-entry memo), `dropDemoOffset`, `windowsAt` / `windowsAhead` (windows in absolute game time).
- **`autodrop.ts`**: the resolver (v1 held on the SHIP screen; v2/v3 armed, from either screen; every version
  `holdsTactical`, R7), `autodropKeyDown` / `autodropKeyUp` (R4), `pressAutodrop` (with its refusals, said on the TERMINAL
  with the buzz), `setPassCount`, the post tick (the Core thread claimed `AUTODROP_CLAIM_TAC` before a volley, let go between
  windows, the wait; PASS DONE / PLAN DONE; the steps down v3 → v2 → v1 → OFF and `'offline'`; the hold let go on a switch
  to the MIND, a pause or the file failing), `autodropLineOf` (AD rows and L13 tails), `autodropTutorialDue`,
  `autodropStatus`, `autodropDebug`, `autodropLaunched`, `autodropLandingOver`.
- **`landing.ts`**: the kid's drop demos in `requestLaunch`; `controllerTick` tells AUTODROP of its launches; BULLSEYE on the
  echo; `endNow` puts AUTODROP at rest with its thread released.
- **`landing-controls.ts`**: [L] down and up (`launchDown` / `launchUp`, shared with the POD BAY's and the phone bar's
  LAUNCH, now a pointer hold), [G].
- **POD BAY** (`landing-hud.ts bayWindowModel.autodrop`, `PodBayWindow.ts`, `index.html #pbAutodrop/#pbPass/#pbPlan`,
  `landing.css`): the AUTODROP pip in the title's pips, the key line and the [G] button, v2's `A [−] n [+]` rows with
  `BAY HAS n BY THEN` / `n FIT THIS PASS`, v3's plan table (six volleys, forecast rows dim, the check line, the never-fits
  and `+n PASSES` notes). The held LAUNCH reads `AUTODROP HOLDS · IT WAITS FOR THE CENTRE`. On a phone [G] rides in the
  flight bar under the LAUNCH / BURN row.
- **Suites:** `skills/autodrop-plan` (pure, < 1 s plus a few arm locks; the words' worst cases, review m6),
  `skills/autodrop-flow` (store and keys on run 1's arm), `skills/autodrop-sweep` (BALANCE_ONLY), the shared fixture
  `skills/autodrop-arm.ts`; DROP's lines in `skills/foundation`, `ui-models`, `training-flow`, and a check in
  `landing/pace-landing`.

### Deviations

1. **Two more AD rows.** Beside AD-hold, AD-fly, AD-wait and AD-done: `landing-AD-held` (`HOLD [L] — AUTODROP · LZ-B ×2 ·
   first in 0:10`, while held) and `landing-AD-armed` (armed, a window open that the pass or plan leaves alone: `AUTODROP
   ARMED — next LZ-A ×2 in 7:30 · [G] to cancel`). Without the second the strip offered L4–L6's manual [L] inside a window
   the plan had already flown. AD-fly also stands from GET READY's lead (the window's sure part within 8 tac s), not only
   8 tac s before the volley's first slot, which comes later when the volley is centred.
2. **The pass's windows** (§3.3 "until one period after armedAtTSec"): a window belongs to the pass when its sure part ends
   within (armedAt + lead, armedAt + lead + period], lead being one cadence and the edge margin. A [G] pressed at the tail of
   a window (its sure part over or too short for a launch) gives that LZ its next window instead of ending the pass at once
   with nothing sent. PASS DONE comes when every LZ with pods still to send has no window of the pass left (or is full),
   judged by the windows' times, not on the first tick no volley fits: a passing factor (Sensor Interp or a driver under the
   kid's REPAIR, a reloading bay) no longer ends a pass with nothing sent. PLAN DONE likewise waits while Sensor Interp,
   Nav Plotter or a driver aboard is offline. L13's `· [G] AUTODROP` tail shows only while a set count has a window it fits
   this pass (found by the sweep: on a ship of WIDE DROP windows the kept counts re-armed empty passes).
3. **New tuning numbers in the 4c block** (each with its WHY): `AUTODROP_EDGE_MARGIN_TAC` 0.1 (a slot never on the sure
   part's close: the controller launches up to a tick late on a solution up to 0.1 tac s old), `AUTODROP_RELEASE_MARGIN_TAC`
   2 (claim/release hysteresis; a double window keeps its thread), `AUTODROP_DAMAGED_ALERT_SEC` (= the DONE line's).
4. **Per-pod sure parts for v3** come from the window's geometry: the pod the solution was solved for keeps the solved
   edges; any other pod's sure half-length is the open half-length × (half-width − s) ÷ half-width (the dot sweeps a
   bracket at an even rate on the band's near-circular orbits). No re-solve per pod. `decidePlan` checks the named pod's
   own span at the moment of launch.
5. **The volley is not stored.** Each tick recomputes it from the window and "now" (first = max(the centred slot, now + the
   bay's cadence left)), so after the first launch the rest follow the cadence and the count shrinks by itself when a hold
   or a claim comes late. No `wasInWindow` module variable: the arm chime is `'autodrop'`'s (`audio-cues`, unchanged). The
   plan memo lives in `autodrop-plan.ts`, not `autodrop.ts` (plan §2.3's list otherwise holds; the world reset forgets it).
6. **`AutodropRefusal` gains `'ONLY v1'`** (v1 has no [G]: `AUTODROP v1 — HOLD [L] IN A WINDOW`). The refusals buzz
   (`'refused'` with `AUTODROP|<word>`) and say `> [G] …` on the TERMINAL; the strip's flash needs REFUSAL_LINES entries
   (patch requested). A finished landing refuses as `NOT LANDING`.
7. **`LandingPlan` gains `laterPasses`** (whole passes past `AUTODROP_PLAN_MAX_PASSES`, for the table's `+n PASSES`).
8. **Signatures added**: `autodropLaunched(store, pod, view)`, `autodropLandingOver(store)`, `restAutodrop(draft, end,
   atAi)`, `repairWord`, `v3GoesLower`, `autodropBayModel`, `launchDown` / `launchUp`, `nextVolley`, `passCounts`,
   `podSureSpan`, `windowsAt`, `windowsAhead`, `forgetPlanMemo`. `bayBy` keeps the foundation's signature (its
   `cadenceTac` is unused: the launches it is given are already spaced).
9. **v3 → v2** resets `armedAtTSec` to the moment of the step and takes as the pass's numbers the plan's count rows within
   one period from then (leftover rows are not numbers: v2 has no wrong split). An eaten file ends the machine `'off'` with
   the warning alert, as a bite to OFF does.
10. **The lessons**: `tut-autodrop-v1` is due while `end === 'released'`; the director shows it after the window (AD rows are
    `now`, a tutorial waits). v2's and v3's are due on a landing where AUTODROP works as exactly that version, unarmed, with
    pods aboard.
11. **BULLSEYE** is on the TERMINAL echo (`> pod01 ... LANDED · BULLSEYE`). The plot's float (`+200 LANDED · LZ-A ·
    BULLSEYE`) needs NavPlotWindow (ORBIT's) to pass the launch's source: `TOUCHDOWN_FLOAT_TEXT.lz` already takes it (patch
    requested).
12. **The GROUND TRACK's planned-volley ticks** (optional) are not drawn. The six mini-demos stay plain (the fix pass's).
13. **AD-armed stands only over a sure window of an LZ the machine flies**; a WIDE DROP window, or one the pass leaves alone,
    keeps L4–L6's manual [L] (a kid may launch by hand while AUTODROP is armed: `requestLaunch` lets the player through).
14. **TRAINING's default selection** (lead's `training-model defaultSel`) now picks AUTODROP v1, buyable, over the RESTORE of
    a lost AUTOBURN v1 at desk 2; `ui-models`' eaten-cell check selects v1 itself. The lead may prefer RESTORE first.

### Measurements

- **AIM (R5)**, `skills/autodrop-flow`, CORMORANT's LZ-A (6 pods, STANDARD) held through one window: trained (demos ±0.05:
  AIM 99) sends 4 pods at −3, −1, +1, +3 tac s, mean offset 0.02; untrained (AIM 40) sends 3, mean offset 1.52 tac s late.
  HALCYON's 2-pod LZ-B lands both centred (−0.96, +1.04) and BULLSEYE.
- **Landed % by version** (`skills/autodrop-sweep`, BALANCE_ONLY; a kid who obeys the strip, the ship locked mid-band; % of
  the colonists landed in an LZ with room; v2/v3 kids launch by hand what the strip still asks of them):

  | Ship (pods) | kid | v0 | v1 | v2 | v3 |
  |---|---|---|---|---|---|
  | HALCYON (5) | healed | 100 | 100 | 100 | 100 |
  | HALCYON | as arrived | 100 | 100 | 100 | 100 |
  | HALCYON | busy in the MIND | 100 | 100 | 100 | 100 |
  | CORMORANT (9) | healed | 100 | 100 | 100 | 100 |
  | CORMORANT | as arrived | 67 | 67 | 67 | 67 |
  | CORMORANT | busy | 89 | 89 | 89 | 100 |
  | VESPER (16) | healed | 88 | 88 | 94 | 100 |
  | VESPER | as arrived | 69 | 75 | 81 | 75 |
  | VESPER | busy | 69 | 50 | 81 | 69 |

  - "As arrived" CORMORANT's drivers carry their transit damage, so every window is a WIDE DROP on a mid-band orbit:
    AUTODROP has no sure part to fly (v1 never flies a WIDE DROP, R4), and every version lands what the kid does by hand.
    A kid who REPAIRs while landing ("busy") gives AUTODROP its windows back; v3 then lands all 9.
  - On the healthy ark (VESPER healed) the strip's exact kid lands 88% by hand and 100% with v3 in the same 7 windows
    (169 wall s each), 94% with v2 (the kid's own [L] where the strip still asks for one costs a pod). The "really felt"
    gap for this exact kid is the attention v2/v3 free (they fly from the MIND) more than the score; slice 8 should judge it
    with a sloppy kid.
  - Damaged VESPER (Sensor Interp failing, LZ-C NEVER FITS): v3's plan takes 494 wall s for 75% (11 volleys over up to 8
    passes, LZ-C's pods sent last at the wrong-split rate), and with the busy kid it runs past the sweep's 1,500 wall s
    (69%). v3 waits for windows that fit instead of throwing WIDE DROPs: slow on a blind ship, a slice 8 question.
  - VESPER busy v1 (50%) is below v0: the v1 kid holds [L] only on AD-hold, and the busy kid's REPAIRs take queued drivers
    offline mid-volley, so held volleys end short. Noted, not tuned.
- **Thread waits (R8)**: 0 in all 36 sweep landings, including the busy kid (its REPAIRs are short and two threads are
  rarely both busy at T−8). A wait only shows when the MIND holds every thread at the claim (`skills/autodrop-flow` forces
  it: `AUTODROP NEEDS A THREAD`, the volley launched 1.5 tac s late, still inside the sure part). The HOLLOW fights of the
  late ships are where it will bite; slice 8's harness should count it there.
- **Cost**: `planLanding` on the 16-pod ark 0.3–0.4 ms cold, 0.06–0.09 ms memoised (R18).

### Patches requested (files DROP does not own)

1. **`data/script.ts` REFUSAL_LINES (lead):** a refused [G] flashes its words on the strip:
   `...Object.fromEntries((Object.keys(AUTODROP_TEXT.refusal) as AutodropRefusalWord[]).map((word) => [`AUTODROP|${word}`,
   { text: AUTODROP_TEXT.refusal[word], keys: word === 'ONLY v1' ? ['L'] : [] }]))`. Today it buzzes and says `> [G] …` on the
   TERMINAL.
2. **`components/tools-view/NavPlotWindow.ts` (ORBIT / lead):** the touchdown float says BULLSEYE. In the `'pod-landed'`
   handler: `TOUCHDOWN_FLOAT_TEXT.lz(points, lz ?? '?', touch, record !== undefined && record.fate.kind === 'down' &&
   record.fate.launch.source === 'autodrop')` (the words' fourth argument exists).
3. **`systems/training-model.ts defaultSel` (lead, optional):** prefer a lost cell's RESTORE over a buyable cell of another
   skill at the desk, if the lead wants a lost AUTOBURN to come first (see deviation 14).
4. **e2e (lead, §8.5):** `skills-4cde.mjs`'s AUTODROP parts and `map-desk.mjs`'s two cards. The POD BAY's [G] is `#pbGoBtn`,
   the pass rows `.pb-pass-step[data-lz][data-step]`, the plan `#pbPlanRows .pb-plan-row` and `#pbPlanCheck`; on a phone
   LAUNCH (`#podLaunchBtn`) is a pointer hold for v1 and [G] rides in `#phoneBar`.
5. **The review-fix pass:** the `centre`, `pass` and `plan` mini-demos (still plain); AGENTS.md's "What's built".

## Deviations (review fixes, SENTRY/UI)

Recorded by the SENTRY/UI fix agent (branch `fix-ui-4cde`, from 6f026d1). It covers the review's B1, m8 and m14, DROP's patch 3,
the six 4c–4e mini-demos, the e2e for desk 1's two cards and SENTRY, and AGENTS.md. The landing half (AUTODROP, AUTOBURN v3)
is the other fix agent's.

### What changed

1. **B1: a disguised seed answers every tool as the file it shows.** This supersedes §4.2's tools table and R9's MOVE,
   COPY and REPAIR row.
   - `tool-targets.ts disguisedRefusal` judges the seed as its `decoyFileView`, a healthy unit `tool`, through
     `targetRefusal` itself. The parity holds by construction, so a later tool rule cannot split them.
   - SWAP is the one exception. Its rule looks the file up in memory, where the view never is, so it answers
     `SWAP IS FOR SHIP FILES WITH A BACKUP` directly, as it does for any unit file.
   - MOVE and COPY take the decoy as a source, and the placement is judged as for any file of its size (the same
     placeholder, the same `NO ROOM`, the same `SAME SPOT`).
   - The op is `actions.ts decoyPlaceOp`: the tool's own time on the seed alone (1.9 s for MOVE, 2.6 s for COPY, on 2
     blocks). As it completes, it unmasks the seed as a SCAN does: `seen: 'scan'`, the `NOT A FILE` stamp, the echo
     `> move cache.tmp ... NOT A FILE · A SEED` (`SENTRY_TEXT.opEcho`), and the seed's words once a ship.
   - It reserves no space and moves or copies nothing. Its op kind is `'scan'` in the tool's label, so `stats.moves` does
     not count it.
   - REPAIR says `ALREADY 100%`. `TOOL_REFUSAL.tempFile` is gone.
   - **More readers judged as the file (beyond the review's list):**
     - the MOVE preview's hazard and infection (a belt's rack is named for a decoy, as for Autopilot);
     - the cursor follower and the phone's tool pill. These printed the picked seed's own segment name: a free tell while
       a decoy was picked.
   - **The one tell left:** for the op's 1.9–2.6 s, a decoy's MOVE shows only its op bar. No clone is written at the
     destination, and the source is not `transferring`. The op ends in the unmask anyway, so this costs the kid the same
     click and wait.
2. **m8:** `sentry.ts preemptArmed(state)` is `preempted && SENTRY ≥ SENTRY_QUICK_RM_VERSION`, the rule `stepSeeds` lands
   by. `HollowPainter` draws the armed outline from it. Below v2 an armed outline is drawn plain (aimable never: the
   refusal is `armed`).
3. **m14:** the decoy's hand-built INSPECT panel is gone. `DetailPanel` renders every file through
   `renderFileDetail(target, drawn, actual)`, with the decoy drawn as its view. `computeActions` takes the segment the
   buttons are judged on and bound to.
   - Rendered in Chromium beside a healthy Autopilot on KESTREL, the rows match one for one: title, `AI · Tool`, size,
     `INTACT`, the desc, `◎ re-scan`.
4. **DROP's patch 3:** `training-model defaultSel` picks, in order:
   1. a lost cell whose RESTORE the bank covers;
   2. a buyable cell;
   3. any lost cell;
   4. a dim cell.

   It stays display-only (unarmed: slice 4's M3). `skills/ui-models` checks that desk 2 after an eaten AUTOBURN defaults
   to `autoburn:v1` (RESTORE), unarmed.
5. **The mini-demos** (`TrainingWindow.ts demoSvg`, `desk.css`), all 4 s loops that hold their last frame under reduced
   motion.
   - AUTODROP's `centre` and `pass` are a side view, as the GROUND TRACK reads: the orbit's track over the planet's limb.
     - `centre`: the bracket over an LZ, its centre ticked, and three pods in turn, the middle one on the centre.
     - `pass`: `A×2 · B×1`, two LZs, two pods to A and one to B.
   - `plan`: the table's three rows tick in, `PLAN ✓` closes it, and three LZs light on a small planet.
   - SENTRY's three are Track SENTRY's drawings with its CSS. One change: the `sight` bracket is its own closed
     `.tr-demo-mark`. The shared `.tr-demo-bracket` dash (80) cut its 112-unit outline short.
   - AUTOBURN v3's `low-orbit` was drawn but bare. It gains the dashed ghost circle inside the band: the loop fades, the
     circle is flown round, and the LZs light.
   - A gallery of all ten kinds was shot at 2× at five moments of the loop and reduced, and desk 1's two cards in
     context.
6. **e2e:**
   - `map-desk`: desk 1's two cards (`1:AUTOBURN v1:tr-demo-capture | 2:AUTODROP v1:tr-demo-centre`), neither picked.
     [2] arms AUTODROP, [1] then AUTOBURN, and ENTER trains `autoburn`. On the phone both cards fit the width.
   - `phone`: the two cards fit, and card 1 trains `autoburn`.
   - `playthrough`: the first desk has the two cards, and [1] trains `autoburn`. The pick is unchanged, so the run stays
     deterministic.
   - `playthrough`'s kid, taught the decoy. The scenario failed 8–9 checks at 6f026d1 already, the same on this branch:
     CORMORANT's POD BAY counters read `▓/▓` at ORBIT LOCK and never advanced, and LAST LIGHT opened with its telemetry
     scrambled and could not land. The cause was slice 4d's decoy, not desk 1's pick. CORMORANT is depth 5, and its beam
     seed beside Telemetry came disguised (the ECC line names 2 foreign blocks, not 3). The scripted kid had two stale
     habits:
     - `RM THE SEED` resolved to any seed in memory, the decoy first. DELETE on the decoy asks its file's confirm, so
       nothing started, the visible seeds stayed, and HOLLOW ate MV, NAV PLOTTER and TELEMETRY.
     - `SOMETHING NEXT TO TELEMETRY IS EATING IT — SCAN its neighbours` SCANned Telemetry itself.

     Now a disguised seed is never `SEED` to the kid, and the neighbours line SCANs the nearest block on each side of the
     file in turn (across a free gap narrower than a WALL, as `hollow.ts lookFrom` bites). The SCAN unmasks the decoy,
     and `RM THE SEED` then rm's it. No check changed. `PLAY_TRACE=1` logs which neighbour was tried.
   - New `skills-4cde-sentry`, registered in `run.mjs`, covers:
     - the decoy in the MIND, its INSPECT, and its target classes beside Autopilot's;
     - SCAN, DELETE without a SCAN, and MOVE on a decoy;
     - v2's pre-empt, and the outline below v2 (m8);
     - v3's FIREWALL at VESPER's boot.
   - §8.5's single `skills-4cde.mjs` is split. Its landing half, `skills-4cde-landing.mjs`, is the landing fix agent's and is
     not on this branch (nor is its `run.mjs` entry); so are §8.5's `phone.mjs` POD BAY checks (the rows in the drawer,
     v1's held launch button).
7. **AGENTS.md:** "What's built" gains batch 4c–4e, and "Next logical steps" is RETIRE (§9, after Fran's playtest), then
   slices 5, 6, 7 and 8.

### For the lead

- `events.ts 'seed-unmasked'.by` keeps its three values. A MOVE or COPY unmask reports `'scan'`, which is what the stamp and
  the sound key on.
- No file outside this agent's scope was edited, and no patch is requested.
- `tests/e2e/run.mjs` gains `skills-4cde-sentry` here, and the landing agent's `skills-4cde-landing` goes in the same list:
  a small conflict to resolve at the merge (keep both rows).
