# Slice 8 plan: THE REBALANCE

**Lead decisions (2026-11-08).**
- All of the plan's recommendations are adopted.
- These four items wait for Fran and are not built: OD 1 (RESTORE after PACK AS), decision 18 (the cycle rule), round 3 item 7
  (MERGE "kept through the duel"), and `EMPTY_SHIP_FUEL_PCT`. They are listed for Fran in OPEN-DECISIONS.
- OD 70 and OD 88 move numbers Fran answered before. They are built as recommended and flagged as "confirm" for Fran.
- Order of work:
  - Step 0 HARNESS and POLISH start now, in worktrees with files disjoint from RETIRE.
  - ECONOMY, THREAT and ENDINGS start after RETIRE merges, because RETIRE phase 3 moves their test movers.
  - The baseline sweep run waits for RETIRE.

**Status: proposal for the lead.** Every open call has one recommendation. Items tagged **[FRAN]** are taste, not numbers,
or they move a number Fran answered. The lead builds each one as recommended and logs it in
`docs/phase3/OPEN-DECISIONS.md` under a new "Slice 8" heading, with how to reverse it. The exceptions are listed in §5
as WAIT.

The process is the one slices 5–7 used: a FOUNDATION step (here **Step 0, HARNESS**), a contract review, parallel tracks
in worktrees, a merge, a review, fixes, the unit tier and one e2e run. The lead owns the files this plan lists as the
lead's, and tracks ask for changes to those files instead of making them.

I wrote this from HEAD 46cf188 on `claude/modest-hawking-209t0f`. That is RETIRE phases 1–2, merged. RETIRE phase 3
(55 classic suites, then the deletion) is still running in its own worktree. Paths are relative to the repo root. The
specs are `docs/phase3/01-landing.md` ("01"), `02-map.md` ("02"), `03-skills.md` ("03"), `04-threats.md` ("04") and
`05-story.md` ("05"). "OD n" is item n of `docs/phase3/OPEN-DECISIONS.md`.

**Where slice 8 starts.**
- `RUN_SAVE_VERSION` is 9 and `META_VERSION` is 4 (`tuning.ts:2025`, `:2035`). Slice 8 needs **no save bump**: a re-price
  never kills a save, because purchases record their cost (`types/skill.ts SkillPurchase.cost`, slice-4 plan §4). No new
  number is saved.
- The arm content versions stay as they are: `ARM_CONTENT_VERSION` 1, `MAP_GENERATOR_VERSION` 2 and
  `MAP_UPDATE_VERSION` 1 (see R3).
- The quick tier takes about 207 s, and its cap for this slice is 265 s. Every sweep below is BALANCE_ONLY, and the
  balance report is a script, not a suite.

---

## 0. Lead summary

### 0.1 What the player gets

- **The same game with fairer edges.** No new screen or mechanic for the kid, except the small rule changes in §2, which
  are each tagged.
- **Cheaper, clearer skills where they underpay.** SURVEY v1 costs 1. AUTOBURN v3 costs 7, if the sweep agrees. SENTRY v1
  names a decoy in about half of the runs that buy it, up from a third.
- **A corrupted resident that punishes ignoring it without killing the flight.**
- **A sleeper that a SCAN + REPAIR kit can wake**, and a HOLD A WALL that actually stops bites.
- **MERGE that a careful kid can afford** about half the time.
- **REASSIGNMENT that no longer beats the other endings.** CONTACT is measured for the first time.
- **[ENTER] in THE LAST LANDING no longer freezes the page.** The `RECEIVER CLOSED` line resolves character by character.
- **For Fran:** one command, `npm run balance:report`, prints one table. Each row has a target, today's number, OK / LOW /
  HIGH, and the OD item it answers.

### 0.2 The steps

| Step | Delivers | Files | Starts |
|---|---|---|---|
| **0 HARNESS** | the sweeps' new knobs and records, two pure stats suites, the JSON hook, the balance report, a src-copy A/B tool, then the **baseline report** pasted into this plan | `tests/unit/balance/**` (new), `tests/unit/support/balance-out.ts` (new), the sweeps (one hunk each), `wp12/playthrough*`, `package.json` (the lead) | now: its files are disjoint from RETIRE phase 3. **The baseline run waits for RETIRE's merge**, so that the fixture does not move under the numbers |
| **ECONOMY** | cycles, prices, AUTOBURN v3, AUTODROP, SURVEY (OD 1, 3, 9, 53, 54; 03 §8's slice-8 list) | §4.2 | after the baseline |
| **THREAT** | seeds and decoys, the corrupted resident, the sleeper, MIND load (OD 4, 24, 25, 27; 04 §8 item 8) | §4.2 | after the baseline |
| **ENDINGS** | MERGE's margin, the traces, CONTACT, `full-run`'s quick seed (OD 70, 84, 88; 05 §8 item 8) | §4.2 | after the baseline |
| **POLISH** | [ENTER]'s frames, the bypass animation, small debts (OD 20, 66) | §4.2 | any time after Step 0's merge (it moves no balance number) |
| **CLOSE** (the lead) | the final report, `PT_STRICT` targets switched on in `npm run balance`, specs and OPEN-DECISIONS updated | the specs, `OPEN-DECISIONS.md`, `wp12/playthrough.test.ts` | after the tracks merge |

### 0.3 Risks and open calls (R1–R14)

1. **R1. Measure first, then change one knob at a time.** Every change in §2 says what to measure, the change and the
   acceptance number. A track does not change a number until its baseline row is in this plan. Two lessons from the
   vault apply (`Headless defender bug skewed MERGE numbers`, `Balance band was calibrated on a bug`):
   - read one seed's timeline (`PT_TRACE=1`) before tuning from a harness figure;
   - A/B a candidate on a **copy of src** (R2) before committing it.
2. **R2. A/B on a src copy, for every sweep.** Step 0 adds `tests/unit/balance/ab.mjs <name> <overrides.json>`.
   - It copies `src/` to `.tmp/balance/<name>/src` and rewrites the named `export const` values in the copy's
     `data/tuning.ts` and `data/skills.ts`. It throws on a name it cannot find exactly once.
   - It writes a `tsconfig.json` whose `paths` point at the copy.
   - The report then runs any sweep with `TSX_TSCONFIG_PATH` set to it (`run.mjs` already passes that variable, and
     `playthrough.ts` takes `PT_TSCONFIG`).
   - So a track measures 0.10 against 0.15 while other agents run on the real tree. Nothing in `src/` changes until a
     value wins.
3. **R3. Guarded numbers: the arm generator's numbers stay.**
   - Several numbers are drawn into the stored arm. `landing-roller.ts rollLanding` keeps its result on the `ArmShip`,
     and `map/arm-parity` pins run 1's seed-7 arm by digest. These are `POOR_SITE_ODDS_*`, `SLEEPER_CHANCE`,
     `HIDDEN_RESIDENT_ODDS`, `LAYER_SLACK`, `ARK_MARGIN_*`, the size table and the update's `MAX_RUNS_ON_CHART` and
     `RESOLVE_CHANCE`.
   - Changing one moves every stored next arm and the parity pins.
   - **Recommend:** slice 8 does not touch them. A track that finds no other lever asks the lead, who decides on one
     generator bump for the whole slice.
   - This rules out OD 53's third option ("raise the POOR odds").
   - The link formula (`LINK_BASE_TENTHS`, `LINK_PER_LY_TENTHS`) is computed per hop and is not stored. It is a lever,
     but it moves every packet, so it is the last resort for MERGE (R11).
4. **R4. The kids.** The balance kids are `wp12/playthrough.ts`'s COMPETENT, LITERAL and SLOPPY.
   - **LITERAL is "fair":** it does only what the strip asks.
   - **SLOPPY is "hard":** it is late, noisy and ignores the dodge and SWAP.
   - **COMPETENT is the ceiling.**
   - SLOPPY buys nothing today (`buys: []`). Step 0 gives it a `buys: 'cheapest'` policy, the cheapest affordable cell at
     every desk, because a real careless kid still buys what the desk offers.
5. **R5. Routes.** The playthrough flies one route, the worked route `[0, 2, 5, 11, 15, 19]`, which has 55 pods.
   - Step 0 adds `PT_ROUTES=set` to fly four routes in turn per seed:
     - the worked route;
     - a 5-ship route (HOLLOW compressed: README's tension);
     - an 8-ship route;
     - a route through a late TIGHT ship.
   - It picks them from run 1's arm with the map's own reachability (`trace-arm.ts routeVia` / `hopBetween`), pins them in
     `balance/routes.ts`, and throws if one stops being reachable.
6. **R6. What counts as a win.** A win is RUN END's cause `won-purge`, `won-merge` or `won-spare` (`run-end.ts:147`).
   Pods count as landed in an LZ with room (`ShipResult.landedInLz` / 200), as the traces sweep reads them.
7. **R7. The targets become the harness's checks at CLOSE.** `wp12/playthrough.test.ts` keeps classic-era targets: souls
   woke ≥ 85%, the 20–32 min wall time, and "all 5 ships".
   - CLOSE replaces them with §1's targets, in arm terms.
   - `PT_STRICT=1` becomes the default under `--full`, so `npm run balance` fails on a target miss.
   - A target that Fran accepts as missed goes to `KNOWN_GAPS` with Fran's note, as COMPETENT's wall time does today.
   - `npm test` never runs them.
8. **R8. No new quick suite over 2 s.** Step 0's only quick suite is `balance/targets.test.ts`. It checks that every
   target names its source sweep, its metric id and its OD item, in under 1 s. Movers that a track's numbers break are
   fixed in the same track (listed in §2). The tier must stay ≤ 265 s, and every track's last commit records its time.
9. **R9. OPEN-DECISIONS numbering.** The lead writes the items; each track drafts its own text in its Deviations. To avoid
   collisions, the ranges are:
   - ECONOMY 89–96;
   - THREAT 97–104;
   - ENDINGS 105–112;
   - POLISH 113–116;
   - HARNESS 117–119.

   They are renumbered at CLOSE.
10. **R10. Spec text follows the numbers.**
    - A changed number also changes its spec's text: 03 §3.2's table and its 54, 04 §3.12's amp, 04 §3.14's jobs, and 05
      §3.8's table.
    - The tracks draft the edits in their Deviations, and the lead applies them at the merge, as in slices 4–7.
    - `data/skills.ts SPEC_TREE_CYCLES` (54) moves with 03 §3.2 in the same commit.
11. **R11. [FRAN] MERGE's price moves, its timing does not.** Round 3 item 7 ("kept through the duel until a playtest
    decides") stands. Slice 8 changes only `MERGE_COST_CHARGE` (§2, OD 88).
12. **R12. [FRAN] REASSIGNMENT's allowance moves off Fran's +15** (round 3 item 4), with the argument in §2 (OD 70). It is
    built on the recommendation and asked as a confirm.
13. **R13. CONTACT's balance is measured for the first time.** `traces/traces-sweep` gains the CONTACT cases (§3).
14. **R14. Out of the rebalance:** decision 18 (the cycle rule's working values) and the parked refactors. See §6.

---

## 1. The rebalance goals, as numbers

**The bar** (README, shared assumption 9): a 12-year-old should find a run **hard but fair**.
- **Fair:** a kid who does what the strip says wins most runs, and every skill bought pays for itself.
- **Hard:** a careless kid loses ships and sometimes the run, and nothing is a must-buy.
- **Comparable:** each ending's next run is about as good as any other.

Each goal below is a row of the balance report (§3.3), with the metric id the sweeps emit. "Now" is the last measured
number and its source, or `—` where nothing measures it yet. Step 0's baseline replaces every "Now".

| # | Goal | Metric (id) | Target | Now (source) |
|---|---|---|---|---|
| **G1** | **Run win rate** | `win.competent` / `win.literal` / `win.sloppy` (R6) | COMPETENT ≥ 90%; LITERAL ≥ 80%; SLOPPY 30–65% | COMPETENT 83% (5 of 6: OD 88); others — |
| G1b | …a careless run can still end sombre | `sombre.sloppy`: unresolved, overwritten, flagship-lost, stayed | ≥ 15% (the lead's 07:10 ruling, kept) | — |
| G1c | …on a short route and a long one | `win.competent.r5`, `win.competent.r8` (R5) | ≥ 85% on both | — |
| **G2** | **Pods landed** (in an LZ with room, of the route's pods) | `pods.<kid>` | COMPETENT ≥ 85%, worst seed ≥ 60%; LITERAL ≥ 75%; SLOPPY 35–70% | COMPETENT 92% heads, SLOPPY 75% heads (OD 88, six seeds) |
| G2b | Ships lost | `lost.<kid>` per run, `lost1.sloppy` | COMPETENT ≤ 0.1; SLOPPY loses ≥ 1 in ≥ 50% of runs (existing target), mean ≤ 2.5 | — |
| **G3** | **Cycles earned against spent** (worked route, 6 ships, at most 36) | `cyc.earned.<kid>`, `cyc.spent`, `cyc.unspentLastDesk`, `cyc.treeShare` | COMPETENT earns 24–32, leaves ≤ 3 unspent at the last desk, and trains 40–60% of the tree (22–32 of 54: a run can't buy everything); SLOPPY earns ≥ 14; the first-pick floor fires in ≤ 5% of SLOPPY runs | 03 §3.12's sample: 30 earned, 25 spendable, 24 spent |
| **G4** | **How much each skill pays** (paired leave-one-out, §3.2) | `worth.<skill>.v<n>`: Δpods per run ÷ the cells' price | every bought path ≥ 0.10 pod per cycle, or a logged non-pod value (≥ 20 wall s or ≥ 30 thread-s per ship where its problem is); no cell above 0.5 pod per cycle; each v3 over its v2 ≥ 40% of v2's pods per cycle | AUTODROP v3 on the healed ark: +2 pods for 16 cycles (0.13; slice-4cde Measurements); SURVEY v1 +0.24 cycles per POOR ship (OD 53) |
| **G5** | **Threat pressure** | `board.trace.<kid>` (HOLLOW boarded by TRACE, not forced), `eaten.<kid>`, `core.min`, `mind.busy` (share of AI s with every Core thread busy on the last two ships), `waits` (`autodrop-wait` plus AUTOBURN `× AN OP`, per ship) | boarded by TRACE: SLOPPY 15–35%, COMPETENT ≤ 10%; drivers eaten per run: COMPETENT ≤ 2, SLOPPY 4–12; COMPETENT never Core-dead, Core lowest median ≥ 40; `mind.busy` ≤ 30% for COMPETENT; waits ≤ 1 per ship | TRACE boarding 20% under "leave every seed" (3a GEN's measure); the rest — |
| G5b | Decoys met | `decoy.run`: a run that reaches depth 5 meets ≥ 1 disguised seed | ≥ 40% | about 30% (Track SENTRY's 800 runs: 15% / 7% / 9% of ships at depths 5 / 6 / 7) |
| **G6** | **The endings' traces are comparable** (next run, at its final ship) | `trace.Δpods.<ending>`, `trace.Δduel`, `trace.gift` | every ending within ±1.0 pod of no trace (aim ±0.8); duel won within 5 points of no trace; each gift 0 to +15 charge at its ship | REASSIGNMENT +1.2 to +1.6 (OD 70); SUNSET +0.4, STAY +0.1 (OD 45); CONTACT — (OD 84) |
| G6b | The endings' prices can be met | `merge.afford.<kid>` (runs played for MERGE that hold its charge at the choice); `empty.competent` (SPARE / SUNSET's empty ship: FUEL ≥ 20%, no pod aboard); `contact.open` (3 signals held at the final ship by a kid who SCANs signal files) | MERGE 50–85% for COMPETENT and LITERAL; the empty ship in ≥ 50% of COMPETENT runs; CONTACT open in 15–35% of runs | MERGE: COMPETENT 2 of 5, median 11; LITERAL 3 of 5 (OD 88); the rest — |
| G7 | Pace (information) | `wall.competent` | stays a KNOWN_GAP (Fran's playtest decides); no e2e flight past its 6-minute check (CORMORANT took 359 s: slice-7 plan, 7a e2e) | — |

**Why these numbers.**
- **G1:** LITERAL ≥ 80% is "fair": the strip alone wins four runs in five. SLOPPY's band keeps a careless run losable
  (G1b) and not hopeless. The old SLOPPY targets (≥ 30% woke in ≥ 80% of seeds, ≥ 1 ship lost in ≥ 50%, sombre ≥ 15%)
  stay as G1b and G2b.
- **G3:** 03 §3.2's prices assume a focused branch reaches v3 around ship 4 or 5. A COMPETENT run that buys 40–60% of the
  tree has real choices left.
- **G4:** 0.10 pod per cycle means a 16-cycle v3 path is worth about 1.6 pods. That matches the one figure we have
  (AUTODROP v3 on the ark). Above 0.5 pod per cycle a cell is a must-buy.
- **G6:** Fran's rule is comparable effects (PHASE3 §10, 05 §3.8), and slice 7 chose ±1 pod.

---

## 2. The deferred items, one by one

**Every item that is DEFERRED to slice 8 or marked ASK** in OPEN-DECISIONS:

| Item | Status there | What | Owner here |
|---|---|---|---|
| OD 1 | parked by Fran | RESTORE after PACK AS heals the file | ECONOMY (WAIT) |
| OD 3 | DEFERRED | AUTOBURN v3 is thin on healthy ships | ECONOMY |
| OD 4 | DEFERRED | disguised seeds are rare per run | THREAT |
| OD 9 | DEFERRED | AUTODROP adds little on healthy ships | ECONOMY |
| OD 12 | sequencing | retire the classic world before slice 8 | RETIRE (in flight) |
| OD 20 | DEFERRED | the receiver bypass animation | POLISH |
| OD 24 | DEFERRED | an ignored corrupted resident empties the tank | THREAT |
| OD 25 | ASK or DEFERRED | HOLD A WALL adds little | THREAT |
| OD 27 | DEFERRED or ASK | waking BARNABY needs DELETE or MOVE | THREAT |
| OD 53 | DEFERRED | SURVEY v1 is too flat | ECONOMY |
| OD 54 | DEFERRED | SURVEY v3 over v2 | ECONOMY |
| OD 66 | debt | [ENTER]'s freeze; the classic playthrough's stuck runs (the second part ended with OD 88) | POLISH |
| OD 70 | DEFERRED | REASSIGNMENT is +1.2 to +1.6 pods | ENDINGS |
| OD 84 | slice 8's | CONTACT is unmeasured | ENDINGS |
| OD 88 | known gap | MERGE's 20-charge margin; `full-run`'s quick seed | ENDINGS |

**Also from the specs' Slices sections and the README:**
- 01 §8: widths, `DROP_KM_PER_1000`, drag, the score factors and the layer table.
- 02 §8: `LAYER_SLACK`, the ark margin, the link formula, ECC, the TIGHT room and the update's turnover.
- 03 §8: prices, the cycle rule and the fuel reserve.
- 04 §8 item 8: seed odds, the TRACE threshold, the ladder's numbers and the surprise share.
- 05 §8 item 8: the trace numbers.
- README's "Known tensions" and its 200-seed harness.

These are in §2.14–§2.16.

Each item below gives the **measure** (the harness and its metric), the **change** (one recommendation), and the
**acceptance** (the number that closes it). "Conditional" means the change is made only if the measure misses.

### 2.1 SURVEY v1 is flat, and v3 adds little over v2 (OD 53, 54): ECONOMY

- **Measure.**
  - `survey/survey-sweep`, seeds 1–10 (42 POOR ships), as it stands: points against the ship played GOOD, by version.
    Now: none −22.6, v1 −18.6, v2 −0.7, v3 +0.0.
  - New, for OD 54: `SURVEY_SWEEP_KID=busy`, from seed 7, on the POOR CORMORANT that HOLLOW boards. The beam's seeds are
    *not* freed, and the kid SCANs and DELETEs seeds with the WP7/WP11 defender, so the thread matters.
  - The sweep then prints, per version:
    - pods landed;
    - the swap's moment (before ORBIT LOCK, or in the landing);
    - AI s the kid waited for a thread;
    - SURVEY's own thread-s.
  - From the playthrough: `worth.survey.v<n>` (G4) on the 4 routes (R5). The worked route has one POOR ship.
- **Change.**
  1. **SURVEY v1 costs 1 cycle** (`data/skills.ts SKILL_TREE.survey.versions[0].price` 2 → 1). 03 §3.2 already says
     "SURVEY cheaper". The tree costs 53 (`SPEC_TREE_CYCLES`, 03 §3.2, and the RUN TALLY's `TRAINED n of 53`).
     - v1 + v2 then cost 4 and pay back after about 2.8 POOR ships, against 3.5.
     - The case for SURVEY rests on points. In cycles, SURVEY stays a loss on a route with one POOR ship, and that is
       accepted.
  2. Conditional on v1 still closing less than 40% of the gap: **[FRAN] v1 gives a weak tell.**
     - A guess that the approach swath passed shows `GROUND ?` when it is bad, against `FLAT?`. This is
       `survey-model.ts`, on the approach swath only: OD 52's drop-dot swath stays v2's.
     - The kid moves the LZ to a found candidate, blind, as v1 already can.
  3. Conditional on OD 54's measure showing v3 less than +0.5 pod over v2 in the busy case: **v3 sweeps three times the
     swath** (`SURVEY_SWEEP_FACTOR` 2 → 3, ±60°).
     - It then maps most of the rim before ORBIT LOCK (now 46–56% at the capture), so v3's swaps happen before the
       landing starts.
     - "No thread" stays v3's.
- **Acceptance.**
  - v1 closes ≥ 40% of the none→GOOD point gap on the 42 POOR ships (now 18%).
  - v2 stays within 3 points of GOOD.
  - In the busy case, v3 is ≥ +0.5 pod over v2, or v3's ground is known before ORBIT LOCK on ≥ 90% of POOR ships.
  - G4 for SURVEY on the routes that meet a POOR ship.
- **Movers:** `skills/foundation:62` and `skills/cycles:132` pin 54. Also `skills/ui-models` and the words of the
  `TRAINED n of 54` line.

### 2.2 AUTOBURN v3 is thin on healthy ships (OD 3; 03 §10 risk): ECONOMY

- **Measure.**
  - `skills/v3-sweep --full`: the five authored ships × low / capture start × healthy / ×2.25 damage, with no AUTOBURN,
    v2 ROUND and v3. It is already on the arm, since its `shipAlone` is the arm fixture now, but its header still says
    "classic ships" and its numbers were measured on them.
  - Step 0 re-baselines it and adds pods and points per row to the printed table. It also emits `v3.Δpods.damaged`,
    `v3.Δfuel.healthy` and `v3.Δfirst-drop-s`.
  - Plus `worth.autoburn.v3` from the leave-one-out.
- **Change.**
  1. **AUTOBURN v3 costs 7** (`SKILL_TREE.autoburn.versions[2].price` 8 → 7). The validator's floor is "more than one ship
     pays" (6), so 7 is the lowest legal price.
  2. Conditional on v3 still under G4: **v3 also holds any landing orbit against decay.** This is 03 §10's fallback, "v3
     could also take over the decay trims of any orbit".
     - Once LANDING starts with v3 engaged on an orbit the kid chose (GO LOWER or a hand burn), v3 tops it up with
       `V3_HOLD_SLACK_KM`, as it holds its own target.
     - The rule lives in `autoburn-v3.ts`, and it never steers.
- **Acceptance.**
  - On the ×2.25 ships, v3 over v2 is ≥ +1 pod on VESPER and LAST LIGHT, or the first drop comes ≥ 30 wall s sooner.
  - On healthy ships v3 costs no more FUEL than v2 ROUND (now −6.5% against −7.6%).
  - `worth.autoburn.v3` ≥ 0.4 × `worth.autoburn.v2`.
- **Movers:** price pins in `skills/ui-models` and `training-flow`, and the tree total (shared with §2.1).

### 2.3 AUTODROP adds little on healthy ships (OD 9; OD 5): ECONOMY

- **Measure.**
  - `skills/autodrop-sweep`: HALCYON, CORMORANT and VESPER × v0–v3, with the quiet, busy and healed kids, plus a new
    **sloppy** kid (reaction 1.2 s; it misses the first cue of each window one time in three). Slice-4cde's Measurements
    asked for it: "slice 8 should judge it with a sloppy kid".
  - It emits `drop.Δpods.<ship>.<kid>.v<n>`.
  - Also `worth.autodrop.v<n>`.
- **Change.** None by default. AUTODROP's worth is on hard ships and for a careless kid: VESPER healed went 88% → 100% at
  v3. That is 03's design, and a healthy ship needs no help.
- **Conditional** on the sloppy kid gaining less than +10% at v1 on CORMORANT, or less than +15% at v3 on VESPER: **[FRAN]
  v2+ fly a WIDE DROP's in-band opening when no sure window remains in this pass.**
  - Today v3 waits for windows that fit (OD 5). On an as-arrived CORMORANT every window is WIDE, so every version lands
    the same 67%.
  - The rule lives in `autodrop-plan.ts planLanding`'s pass.
- **Acceptance.**
  - Sloppy kid: v1 ≥ +10% landed on a ship of 9 or more pods, and v3 ≥ +15% on the ark.
  - No version below v0 in any row. Now VESPER busy v1 is 50% against v0's 69%, a held volley cut short by the kid's
    REPAIRs: ECONOMY reads that seed's trace first (R1).
  - G4 for AUTODROP.

### 2.4 Disguised seeds are rare per run (OD 4): THREAT

- **Measure.** New, pure and fast: `tests/unit/balance/decoy-stats.test.ts` (BALANCE_ONLY, under 10 s).
  - It covers 800 runs (runs 1–8 × seeds 1–100), random routes plus the 4 pinned routes.
  - For each beam it takes the hop's noise (`hopBetween`), `BEAM_SEED_ODDS` and `disguiseChanceAt(depth)`. A beam has
    P(no decoy) = Σₖ odds[k] · (1 − p)ᵏ, and the run multiplies its beams.
  - It prints `decoy.run`: P(≥ 1 decoy) over runs that reach depth 5. It also prints `decoy.ship` by depth.
  - It should reproduce Track SENTRY's measured 15% / 7% / 9% by depth within sampling error, and Step 0 checks that it
    does. It needs no flight, because the disguise roll
    takes both its draws whatever the chance (`beam-seeds.ts rollDisguises`), so a new rate moves no other roll.
- **The ceiling.** A depth-5 ship gets about 0.5 seeds, and most ships get none. My estimate from those figures: even at
  chance 1 the run share stays near 55–65%. **The rate alone can't make SENTRY v1 name something in most runs.**
- **Change.**
  1. **`DISGUISE_CHANCE_BY_DEPTH` → `[{ fromDepth: 5, chance: 1/2 }, { fromDepth: 7, chance: 2/3 }]`** (from 1/3 and 1/2).
     Decision 22 set "disguised seeds start at depth 5", and that holds. Its rates were "starting values".
  2. **[FRAN] Accept SENTRY v1 as cheap insurance**, with no new power. If `decoy.run` stays under 40% with the new rates,
     **SENTRY v1 costs 1** (2 → 1; the tree loses another cycle, with §2.1's movers).
- **Acceptance.**
  - `decoy.run` ≥ 40%, or SENTRY v1 at 1 cycle.
  - `threat/disguise` and `skills/sentry` stay green: they force their own decoys, and none pins the rate except
    `threat/disguise`'s table check, which reads the constant.

### 2.5 The ignored resident's fuel drain (OD 24; OD 13): THREAT

- **Measure.** `residents/corrupted-sweep` on GANNET.
  - Step 0 adds `CS_SEEDS` (default `7`; the report runs `3,5,7,9,11`) and a `sloppy` follower (reaction 1.2 s), each
    with the eight policies.
  - It emits:
    - `res.fuel.ignore`, `res.fuel.<answer>` and `res.fuel.none`;
    - `res.status.ignore` (locked / accepted / stranded);
    - the bursts' push ratio against a failing Thrust Ctrl.
  - Now (seed 7): ignored 0% FUEL, 41 bursts, 2 pods parked locked. The answers are 19.6–23.3%, against 23.7% with no
    resident.
- **Change.** **`RESIDENT_GHOST.amp`, `RESIDENT_GHOST_DELETING.amp` and `RESIDENT_GHOST_ANGRY.amp` 0.15 → 0.10.**
  - The push is then 0.10 ÷ 14 = 0.0071 per tac s: 48% of the arm's failing controller, against 71%.
  - `capabilities.ts:350`'s check (below the failing controller) still holds.
  - The intervals stay, so anger still doubles the rate.
  - This is the smaller of OD 24's two options. The other, "bursts stop after the first lock", ties a SHIP effect to a MIND
    event the kid may not see from amber. It is the fallback if 0.10 still strands.
- **Acceptance.**
  - Ignored (strip kid and sloppy kid, 5 seeds): the flight ends locked or accepted with FUEL ≥ 5% in ≥ 4 of 5 seeds, and
    ≥ 8 points of FUEL under no resident, so the pressure to act stays.
  - Every answer within 4 points of no resident.
  - 04 §3.12's "about two thirds of an unfixed VESPER" becomes "about half" (R10).

### 2.6 HOLD A WALL adds little (OD 25; OD 18): THREAT, [FRAN]

- **Why it does nothing now.** `resident-sleeper.ts wallSpot` puts the 4-block `MOTH.wall` into a free run of 4 or more
  blocks. By the kid's own rule (`WALL_MIN_BLOCKS` 4: "4 free blocks stop it") that run is already a WALL, so MOTH's wall
  never stops a bite.
- **Measure.** `residents/sleeper-sweep` gains a HOLLOW row: CURLEW with the beam's seed *not* freed, plus a planted seed
  (`__ap.seed`'s helper) beside the drivers.
  - It counts the bites landed on drivers, the drivers eaten, and landed %, with and without HOLD A WALL.
  - It emits `moth.wall.Δeaten`.
- **Change.** **MOTH.wall is a 2-block blocker in a GAP.** It is a sleeper file that bites can't cross, as FIREWALL.sys
  can't be crossed.
  - It goes into the GAP between the hostile block with the most drivers in reach and those drivers: a free run of
    `FIREWALL_BLOCKS` (2) up to `WALL_MIN_BLOCKS` − 1 (3) blocks, flush with the drivers' side.
  - The job is offered only when such a GAP exists (`sleeperJobsNow`).
  - `SLEEPER_WALL_BLOCKS` 4 → 2. The words change in `data/kin-text.ts KIN_TEXT` (the job's line: `I'll stand in the gap.`).
  - The alternative, "the wall heals", keeps a wall where none was needed.
- **Acceptance.** With HOLD A WALL, at least 1 fewer driver bite lands per HOLLOW ship than without (`moth.wall.Δeaten`
  ≤ −1.0 over 5 seeds), and `residents/sleeper` (the quick suite) is green with its wall check moved to the GAP rule.

### 2.7 Waking BARNABY (OD 27): THREAT, [FRAN]

- **The problem.** On seed 7's route the unit reaches CURLEW with SCAN and REPAIR only, and the wake is an rm of
  `sleep.lock` or a MOVE of the sleeper (`resident-sleeper.ts:302`). REPAIR on it says `IT'S ASLEEP, NOT HURT`
  (`resident-text.ts:52`).
- **Measure.** `residents/sleeper-sweep` gains `SLEEPER_KIT=route`: the tools the route delivers, by `WORKED_KIT`'s rule.
  - It prints `sleeper.woken`: the share of seeds where a kid who SCANs the sleeper can wake it.
  - Plus a pure count over 200 run-1 arms × random routes: the share of sleeper ships reached with neither DELETE nor
    MOVE.
- **Change.** **A REPAIR of `sleep.lock` after a SCAN wakes the sleeper.**
  - "The lock is a corrupt sector; REPAIR rewrites it." It costs REPAIR's charge on a 1-block file and runs at REPAIR's
    rate.
  - The refusal text moves to the sleeper itself only, and `KIN_TEXT`'s scanned description names both ways (`rm or
    REPAIR sleep.lock`).
- **Acceptance.** `sleeper.woken` is 100% with SCAN + REPAIR (now 0% on seed 7's route), and the woken share over the
  random routes is ≥ 90%.
  - The sleeper stays rare, because placement doesn't change (R3).

### 2.8 REASSIGNMENT's +1.2 to +1.6 pods (OD 70; OD 46, 67): ENDINGS, [FRAN]

- **Measure.** `traces/traces-sweep`, `TS_SEEDS=20`.
  - The four REASSIGNMENT rows' Δpods against no trace (now +1.5, +1.6, +1.6, +1.2).
  - The kid reaches the duel with 2.5–3 charge on the no-trace runs.
  - The allowance's +15 pays for the REPAIRs that save about one driver, so roughly 0.09 pod per charge.
- **Change.** **A separate allowance, `TRACE_ALLOWANCE_CHARGE = 8`** (new, at the end of the 7c lead block).
  - Readers: `trace-gifts.ts:153` and `:234`, `trace-hud.ts:88`, and traces-sweep's `want.gift`. The cache gifts keep
    `TRACE_GIFT_CHARGE` 15.
  - Why 8: at about 0.09 pod per charge it gives about +0.7 pod, inside ±1 with margin. It matches one CONTACT stop.
  - REASSIGNMENT's cost (the hunt) doesn't bite, because the kid blocks every hunt RM with a SCAN, as a kid who watches
    the TERMINAL does. So the gain has to shrink.
  - This reverses round 3 item 4 (+15), and is logged as a confirm for Fran.
  - The alternatives were rejected:
    - an RM that a SCAN can't block (a new verb rule);
    - a telegraph faster than the kid's reaction (unfair for a kid);
    - a cost in pods (no physical story).
  - `HUNT_PREFER_WEIGHT` stays 1.
- **Acceptance.**
  - All four REASSIGNMENT rows within ±1.0 pod of no trace over 20 seeds.
  - PURGE's own effect, read by difference (PURGE+REASSIGN − REASSIGN), is within ±0.5. So is MERGE's.
- **Movers:** `traces/final-ship` and `traces/gifts` (the allowance's +15 line and sum), `e2e/scenarios/traces.mjs`, and
  `ending/card-models`' NEXT RUN line where it shows the number.

### 2.9 CONTACT is unmeasured (OD 84; OD 50, 81, 82): ENDINGS

- **Measure.**
  - `traces/traces-sweep` gains three CASES: `CONTACT` (`followed` + `contact`), `PURGE+CONTACT` and `MERGE+CONTACT`.
  - The route goes through both signal stops when one route reaches both (`routeVia(map, [stopA, stopB])`), and else
    through one. The row says which.
  - Their gift-ship column reports each stop's +8.
  - New pure suite `balance/signal-stats.test.ts` (BALANCE_ONLY, under 10 s): over 200 run-1 arms × the routes, the share
    where the route flown can collect ≥ 3 fragments (the notes, the signal ship's 2, the gone resident's 1). It emits
    `contact.reach`.
  - The playthrough's COMPETENT SCANs every `▓▓░▓` file and note it meets (a new flag in its MIND policy), and emits
    `contact.open`.
- **Change.** None until measured. The levers, in order:
  1. `CONTACT_GIFT_CHARGE` (8), if CONTACT's Δpods is outside ±1;
  2. `SIGNALS_FOR_CONTACT` (3 → 2), if `contact.open` < 15%;
  3. the stop count (`TRACE_PLACE_COUNT.contact`), if an arm often gives fewer than 2 stops (81: 40 of 40 run-2 arms got
     both).
- **Acceptance.**
  - CONTACT's three rows within ±1.0 pod (G6), each stop +8 at its ship.
  - `contact.open` in 15–35% of runs (G6b). That keeps it the rare, found ending 05 wants.

### 2.10 MERGE's 20-charge margin (OD 88; README tension; slice-3a risk 6): ENDINGS, [FRAN]

- **Measure.**
  - `wp11/full-run` at 50 seeds (`RUN_SEEDS=50`), and the playthrough's COMPETENT and LITERAL at 50 seeds on the 4 routes.
  - It emits `merge.afford.<kid>` and the distribution of charge at the choice (p25 / median / p75).
  - Before any change, read one short seed's timeline with `PT_TRACE=1` (R1). In WP11, a defender bug once looked
    exactly like this gap.
  - Now (6 seeds): COMPETENT 2 of 5, median 11; LITERAL 3 of 5.
- **Change.** **`MERGE_COST_CHARGE` 20 → the highest of 18, 16, 15 or 14 at which `merge.afford` ≥ 50% for both
  COMPETENT and LITERAL**, measured by A/B (R2).
  - The lower bound is 14: the arrival floor on a FULL final ship is 12 (`CHARGE_ARRIVAL_FLOOR`), so a price at the floor
    would make MERGE free for a kid who spends nothing.
  - Every MERGE word reads the constant (`hollow-text.ts keepCharge`, `finale-text.ts`, `ending-rules.ts:182`), so
    VESPER's and CORMORANT's `> keep n charge for me` follow it.
  - If 14 still misses: **POLISH's PACKET hint** (§2.12 item 4), then the link slope as the last resort (R3). Counting
    from the root's unlock would reverse round 3 item 7, so it is not used.
- **Acceptance.**
  - `merge.afford` 50–85% for COMPETENT and LITERAL, so the price still bites.
  - `wp11/full-run` green at `--full`, including "the quick seed reached its MERGE". Its quick seed (4) reaches the choice
    with 13. If the new price is above 13, the quick seed moves to the lowest seed that affords it, with the reason in the
    suite's header.
- **Movers:** `ending/card-models:137` (`COSTS 20 …`), `threat/arrival-story:200`, and `wp11/full-run`'s header comment
  and its `MERGE_COST_CHARGE` reads. The words suites read the constant.

### 2.11 [ENTER]'s freeze in THE LAST LANDING (OD 66): POLISH

- **Measure.** e2e, `last-landing` scenario: 3 and 16 blind pods, [ENTER] at the first pod.
  - A `PerformanceObserver('longtask')` in the page records the longest task.
  - The scenario reads the result and compares it with the headless `skipLastLanding` on the same seed.
  - Now: one task of 2.1 s for 3 blind pods (Chromium).
- **Change.** **`skipLastLandingFrames(store)`** (`systems/last-landing.ts`): the same loop, in chunks.
  - It runs at most `LAST_LANDING_SKIP_FRAME_MS` (12; new, in an "8 POLISH" block) of `advance()` per
    `requestAnimationFrame`, until `landing.lastLanding === null`.
  - It keeps the `LAST_LANDING_SKIP_MAX_STEPS` cap across frames, and keeps the clock rules.
  - The header reads `SKIPPING… n LEFT` while it runs. Keys other than P / M are ignored, and a second [ENTER] does
    nothing.
  - `LastLanding.ts`'s button and `mountLastLanding`'s [ENTER] call it.
  - The headless `skipLastLanding` stays synchronous for the suites (`last-landing-sweep`, `ending/last-landing`).
- **Acceptance.**
  - No long task over 100 ms during the skip.
  - 16 blind pods done in ≤ 4 s wall.
  - The frame result is identical to the synchronous one on the same seed. A unit check uses a fake rAF in
    `ending/last-landing`, and the e2e check compares the landed counts.

### 2.12 The receiver bypass animation (OD 20; 04 §3.15; slice-5 R19): POLISH, [FRAN]

- **The constraint.** Boot lines sit on a fixed 1.3 s step (`BOOT_LINE_AT_SEC`). A 2.5 s bypass would shift every later
  line, the director's boot pacing and the e2e boot waits. That is why slice 5 deferred it.
- **Change.** **The bypass resolves the `RECEIVER CLOSED` line within its own step, in 1.2 s**
  (`BYPASS_RESOLVE_SEC = 1.2`, "8 POLISH").
  - Its characters roll and lock left to right (Uplink's breaker), reusing `systems/garble.ts`'s mask.
  - It hangs on the `'resident'` line tone (`script.ts bootLineTone`) where the TERMINAL and COMMS draw boot lines.
  - A click on the line, or the boot's skip, completes it.
  - Reduced motion shows the line at once.
  - No input, no fail state, and no boot timing moves.
  - This deviates from 04's 2.5 s, for the reason above. The line is a tell, and a shorter tell is still read.
- **Acceptance.**
  - `BOOT_LINE_AT_SEC` and every boot e2e wait are unchanged.
  - e2e `residents`: the line ends fully resolved within 1.3 s, and a click resolves it at once.
  - Reduced motion: no animation frames.

**POLISH's small debts** (each one a commit; none moves a balance number):
1. **`TRACES_BUILT` retired** (OD 83). This is ENDINGS' file (`trace-hud.ts`), so it is done by ENDINGS. It is listed here
   only as a debt.
2. **The phone's FINALE step 2 with four rows** (slice-7d review): `phone.mjs` checks the step-2 sheet on 390 px.
3. **The CORMORANT e2e flight's 1 s margin** (slice-7 plan, 7a e2e: 359 s against a 6-minute check). The check's limit
   becomes 420 s, with the measured spread in its comment. The flight is the strip kid's, and nothing in slice 8 slows it.
4. **The PACKET's MERGE hint** (conditional, for §2.10). On a hop into a final ship, while MERGE was ever chosen or
   `keepCharge` was said:
   - the PACKET's charge row adds `MERGE NEEDS n · this beam brings m` (`MAP_TEXT.packet`);
   - the words are capped at 70 characters, in `support/words`.

### 2.13 RESTORE after PACK AS heals the file (OD 1): ECONOMY, WAIT

- **The case.** Fran parked it: "ok as is for now, we'll circle back once all the mechanics are in place". They are now.
- **Recommend: keep it.**
  - An upgrade already installs fresh code at 100% (03 §3.3), so a restore that does the same is the same rule.
  - Its cost is cycles at half price, which a kid feels more than charge.
  - The playthrough counts `restore.healed`: restores whose file was below 100% when packed. That puts a number on how
    often it matters.
- **Build:** nothing until Fran answers.

### 2.14 The rest of the trace numbers (05 §8 item 8): ENDINGS

- `TRACE_GIFT_CHARGE` 15 for the caches: SUNSET +0.4, STAY +0.1 (OD 45), so kept.
- `TRACE_PURGE_BITE_MULT` 0.85, `TRACE_MERGE_THREADS` 1 and `TRACE_MERGE_ROOT_EXTRA` 2: read by difference in §2.8, and
  kept unless one is outside ±0.5 pod.
- `TRACE_EXTRA_SEEDS` 1: kept.
- `MERGE_DRIVER_INTEGRITY` 80 and the blind drop (`BLIND_MARGIN_KM` 150, `BLIND_DROP_MULT` 2.0): `last-landing-sweep`
  matched 01's figures (0.78 GENTLE, 0.56 HARSH), so kept.
- `EMPTY_SHIP_FUEL_PCT` 20: kept unless G6b's `empty.competent` < 50%. If it is, the price stays and the lead brings it to
  Fran, because the ★ notch shares it (`tuning.ts` 7a lead's check).
- OD 43's v1 at 14% in a room-only-in-LZ-B landing: kept. v1 "times pods, it does not split them" is its design.

### 2.15 The cycle rule, the prices and the fuel reserve (03 §8): ECONOMY

- `CYCLES_ARRIVED` 1, `CYCLES_PER_STEP_PCT` 20, `FIRST_PICK_FLOOR_CYCLES` 3, `RESTORE_FRACTION` 0.5 and
  `CYCLES_CARD_CYCLES` 2 are measured by G3. They change only if G3 misses:
  - earned under 24 for COMPETENT: the steps stay, and the lead brings decision 18 to Fran instead (§6);
  - unspent over 3: the cheapest v2 price comes down by 1.
- The other prices (AUTODROP 3/5/8, SENTRY v2 3 and v3 5, LOCK 1/2) are measured by G4. A cell below 0.10 pod per cycle
  with no logged time value comes down by 1, within the validator's rules: v3 above 6 on the start branches, and prices
  rising within a branch.
- `AUTO_FUEL_RESERVE_PCT` 20: the playthrough counts `GREEN, NOT ROUND — SAVING FUEL` refusals and FUEL at the end of each
  ship. It is kept unless COMPETENT ends ships under the ★ 20% in more than 30% of ships.

### 2.16 Map, landing and threat numbers named by 01, 02 and 04 §8

- **Kept by default.** 01's widths, `DROP_KM_PER_1000`, drag and the score factors (`MISLANDED_FACTOR` 0.75,
  `HARD_LANDING_FACTOR` 0.5, `OFF_SITE_SCORE_BY_CLASS`: decision 11's values).
  - They change only if G2 misses for every kid at once.
  - The owner then is ECONOMY (01 is the landing branch's spec).
- **Guarded (R3):** 02's `LAYER_SLACK`, the ark margin, the size table, `MAX_RUNS_ON_CHART`, `RESOLVE_CHANCE`, and 04's
  surprise share (`HIDDEN_RESIDENT_ODDS`).
- **THREAT's, measured by G5.**
  - `BEAM_SEED_ODDS` and `TRACE_BOARD_AT` 3: if `board.trace.sloppy` is outside 15–35%, `BEAM_SEED_ODDS[1]` moves first.
    Noise 1 is the common case, and `TRACE_BOARD_AT` is a word on screen (`TRACE ■■□`).
  - The ladder's bite numbers (`BEAM_SEED_*`, the HOLLOW stages): only if `eaten.<kid>` misses.
- **The link formula:** §2.10's last resort.
- **ECC** (`ECC_YEARS_PER_HIT` 25): kept.
- **README's tensions.** A 5-ship run (G1c), late MIND load (G5 `mind.busy`) and TIGHT squeeze (the TIGHT route's
  `files.left` per ship, information) are measured.
  - If `mind.busy` misses, the lever is `RESIDENT_LOCK_EVERY_SEC` (40 → 50) on a ship that also holds HOLLOW. The cap of
    16 pods stays.

---

## 3. The sweep plan

### 3.1 Which harness answers which item

Times are on one core unless a worker count is named. **Measured** ones come from earlier plans; **est.** ones are mine,
from the quick tier's times. Step 0 times every row and replaces the estimates in this table.

| Harness (BALANCE_ONLY) | Answers | Knobs (default → report quick / full) | Time |
|---|---|---|---|
| `wp12/playthrough` | G1–G5, G6b; OD 53/3/9 worth (with §3.2); OD 88; R5's routes | `PT_SEEDS` 24 / 200, `PT_PLAYERS` all, `PT_ROUTES` worked / set, `PT_WORKERS` 4 | est. 15 s a COMPETENT run, 20 s LITERAL, 35 s SLOPPY (the quick tier's single COMPETENT seed is 18 s): quick 24 seeds × 3 ≈ 7 min on 4 workers; full 200 × 3 ≈ 60 min on 4 |
| …leave-one-out (§3.2) | G4 | `PT_VARIANT` 4 variants × COMPETENT, 24 / 50 seeds | est. quick 6 min, full 13 min on 4 |
| `wp11/full-run` | OD 88, G6b MERGE | `RUN_SEEDS` 10 / 50 | 50 seeds 310–319 s (measured, slice 7b/7c) |
| `traces/traces-sweep` | G6, OD 70, 84 | `TS_SEEDS` 6 / 20, 9 cases (6 + CONTACT's 3) | 20 seeds × 6 cases 538 s (measured); est. 700 s at 9 cases |
| `survey/survey-sweep` | OD 53, 54 | `SURVEY_SWEEP_SEEDS` 3 / 10, `SURVEY_SWEEP_KID` strip / busy | 10 seeds about 9 min (measured, slice 6); est. + 2 min busy |
| `skills/v3-sweep` | OD 3 | `--full` | est. 6–10 min (60 landings, MAX_WALL 1500) |
| `skills/autodrop-sweep` | OD 9 | `SWEEP_SHIPS`, + sloppy kid | est. 4–6 min |
| `residents/corrupted-sweep` | OD 24 | `CS_SEEDS` 7 / 3,5,7,9,11, + sloppy | 1 seed × 8 flights 11 s (measured); est. 2 min at 5 seeds × 2 kids |
| `residents/sleeper-sweep` | OD 25, 27 | `SLEEPER_SEEDS` 1,3,5,7,9, `SLEEPER_KIT`, the HOLLOW row | est. 3–4 min |
| `ending/last-landing-sweep` | §2.14 blind drop (kept) | `LL_SEEDS` 2 / 8 | 8 seeds 372 s (measured) |
| `balance/decoy-stats` (new, pure) | OD 4, G5b | 800 runs | est. < 10 s |
| `balance/signal-stats` (new, pure) | OD 84, G6b | 200 arms | est. < 10 s |

The lead1 sentinels and `world/update-stats-full` stay in `npm run balance` and out of the report. They pin flight rules
and the arm update, not balance.

### 3.2 What Step 0 adds to the harnesses

- **`wp12/playthrough.ts`.**
  - **Records.** `RunRecord` gains:
    - `cycles: { earned, granted, spent, unspentLastDesk, trained }`, read from `run.skills.earned/grants/bought`;
    - `pods: { aboard, landed }`;
    - `boardedBy: 'trace' | 'forced' | null`;
    - `waits` (the `autodrop-wait` events, plus AUTOBURN's `× AN OP` refusals);
    - `mindBusySec` (AI s with every Core thread busy on the last two ships);
    - `signals` (fragments held at the final ship);
    - `restoresHealed`.

    `ShipRecord` gains `pods`, `landed` and `points`. The table is unchanged in shape, with rows added for these.
  - **Buying.**
    - SLOPPY's `buys: 'cheapest'` (R4).
    - `PT_VARIANT=no-<skill>[-v<n>]` drops that skill (or its versions from n up) from COMPETENT's `buys`. The kid
      spends the cycles on the list's next item, so the variant measures "this skill against the next best buy".
    - `worth = (pods_full − pods_variant) ÷ price of the dropped cells`, paired by seed. The report prints it with its
      standard error, so a 0.1 pod-per-cycle difference on 24 seeds is read as noise when the error says so.
  - **`PT_ROUTES=set`** (R5).
  - **The MIND flag `scansSignals`** (COMPETENT, LITERAL): SCAN every `▓▓░▓` file and note it meets.
- **Each sweep: `BALANCE_JSON=<path>`.**
  - Through `tests/unit/support/balance-out.ts writeMetrics(suite, { id: number | null }, meta)`, each sweep writes its
    metric ids (§1's) next to its usual table.
  - It is one hunk at each sweep's end, and writes nothing without the variable.
- **Knobs.** The sweeps above gain the new knobs (`CS_SEEDS`, `SURVEY_SWEEP_KID`, `SLEEPER_KIT`, the sloppy kids,
  traces' CONTACT cases). Each defaults to today's behaviour, so `npm run balance` prints what it printed.
- **`skills/v3-sweep`'s header** says "run 1's authored ships on the arm" and prints pods and points.
- **`balance/routes.ts`, `balance/targets.ts`, `balance/targets.test.ts` (quick, < 1 s), `balance/decoy-stats`,
  `balance/signal-stats`, `balance/ab.mjs` (R2) and `balance/report.mjs` (§3.3).**

### 3.3 The balance report, for Fran

**`npm run balance:report`** (`node tests/unit/balance/report.mjs`; the lead adds the script to `package.json`).
It is not a suite and `run.mjs` never picks it up (`.mjs`, outside the `*.test.ts` glob).

- **Profiles.**
  - `--quick` (default): §3.1's quick column, est. **15–20 min on 4 cores**.
  - `--full`: est. **90–100 min**.
  - `--only <metric-prefix>` runs only the sweeps that feed those rows, so a track can re-check its own rows in minutes.
  - `--ab <name>` runs against a src copy (R2).
- **How it runs.**
  - The playthrough goes first, alone (it shards itself over `PT_WORKERS`).
  - The single-process sweeps then run in a pool of `BALANCE_WORKERS` (default 4), each spawned as `run.mjs` spawns a
    suite (`node --import tsx`, `AP_DEPTH=full`, its knobs, `BALANCE_JSON`).
  - A crashed sweep prints its tail and leaves its rows `ERR`. The report still prints.
- **Output.** One table to stdout, also written to `tests/.out/balance/report.md` with `report.json` beside it:

  ```
  ARRIVAL PROTOCOL · BALANCE REPORT · 46cf188+ · quick · 2026-11-.. · 17 min
  | #   | Goal                         | Target      | Now    | Last   |      | Seeds | Source          | OD   |
  |-----|------------------------------|-------------|--------|--------|------|-------|-----------------|------|
  | G1  | LITERAL wins                 | ≥ 80%       | 71%    | —      | LOW  | 24    | playthrough     |      |
  | G6  | REASSIGNMENT Δpods (next run)| ±1.0        | +1.5   | +1.5   | HIGH | 6     | traces-sweep    | 70   |
  | G6b | MERGE affordable, COMPETENT  | 50–85%      | 40%    | —      | LOW  | 24    | playthrough     | 88   |
  ...
  ```

  - "Last" is the previous `report.json`, so a track sees what its change moved.
  - Status is OK, LOW, HIGH or INFO (a G7 row).
  - Under the table, one line per LOW / HIGH names the item's lever from §2.
- **Exit codes.** Exit 0 unless a sweep crashed. `--strict` exits 1 on any LOW / HIGH, for a track's own check. Fran runs
  it plain.

### 3.4 Budgets

- **Quick tier.** Step 0 adds only `balance/targets.test.ts` (< 1 s). Each track's movers (§2) are fixed in place, and no
  quick suite gains a seed. Every track's last commit records the tier's time, which must be ≤ 265 s on 4 workers.
- **`npm run balance`** keeps its "about two hours". CLOSE switches on `PT_STRICT` there (R7). The leave-one-out variants
  and the A/B are the report's only.

---

## 4. The work breakdown

### 4.1 Order

1. **Step 0, HARNESS** (one agent, from now).
   - It touches no `src/` file except a debug hook if one is needed, requested from the lead (`debug.ts`).
   - It ends with **the baseline**: `npm run balance:report --full` on the merge of RETIRE, pasted into this plan as
     "Baseline (Step 0)", with the measured times replacing §3.1's estimates.
   - A contract review then checks the metric ids against §1 and the knobs' defaults against today's output (a byte
     comparison of each sweep's table with no new knob set).
2. **ECONOMY, THREAT and ENDINGS** in parallel worktrees, from the baseline commit.
   - Each one runs its measure, decides by A/B (R2), commits the winning values, and fixes its movers.
   - It closes with `npm run balance:report --only <its rows>` and the quick tier's time.
3. **POLISH** may run alongside from Step 0's merge (it moves no balance number). Its e2e changes are run once by the
   lead at CLOSE.
4. **CLOSE** (the lead):
   - the merge;
   - one `--full` report (the slice's acceptance table, pasted into this plan);
   - R7's targets switched on;
   - the specs and OPEN-DECISIONS (R9, R10);
   - the unit tier and one e2e run.

### 4.2 File ownership

Each value lives in its own slice block of `tuning.ts`, and a track edits values only in the blocks it owns here. A new
number goes at the end of its owner's block. POLISH's new numbers go in a new banner block at the end of the file,
`--- Phase 3 slice 8 POLISH`. `data/skills.ts` is ECONOMY's for slice 8 (its header names the lead; the lead hands it
over for this slice).

| Track | `tuning.ts` blocks (values only) | Source files | Test files | OD |
|---|---|---|---|---|
| **HARNESS** | none | none (debug hooks by request) | `tests/unit/balance/**` (new), `support/balance-out.ts` (new), `wp12/playthrough.ts` + `.test.ts`, one hunk in each §3.1 sweep | 117–119 |
| **ECONOMY** | 4 TREE, 4 FLIGHT, 4c AUTODROP, 4e ORBIT, 6 lead, 6 SWATH; 1a/1b landing values only if §2.16 triggers | `data/skills.ts`; conditional: `systems/autoburn-v3.ts`, `systems/autodrop-plan.ts`, `systems/survey-model.ts` and `data/survey-text.ts` | `skills/*` (incl. `v3-sweep`, `autodrop-sweep` after Step 0), `survey/*` | 89–96 |
| **THREAT** | 2 THREAT, 4d SENTRY, 5 WARDEN, 5 KIN | `systems/resident-sleeper.ts`, `data/kin-text.ts` (`KIN_TEXT`), `data/resident-text.ts` (`TOOL_REFUSAL.sleeperRepair`); conditional: `state/resident-selectors.ts` | `residents/*`, `threat/disguise`, `skills/sentry`, `balance/decoy-stats` after Step 0 | 97–104 |
| **ENDINGS** | the WP11 line `MERGE_COST_CHARGE` (`tuning.ts:1328`), 7a lead, 7b lead, 7c lead, 7c TRACE, 7d lead | `systems/trace-gifts.ts`, `systems/trace-hud.ts`, `systems/trace-hunt.ts`, `data/traces.ts`; OD 83's `TRACES_BUILT` | `traces/*`, `ending/*`, `signals/*`, `wp11/full-run`, `balance/signal-stats` after Step 0 | 105–112 |
| **POLISH** | new "8 POLISH" block | `systems/last-landing.ts` (skip only), `components/run/LastLanding.ts`, the boot-line renderers (`components/memory-view/MindTerminal.ts`, `components/comms/CommsWindow.ts`: the `'resident'` tone), one CSS file for the bypass, `data/map-text.ts`'s PACKET hint (conditional) | `ending/last-landing` (the frame check), `e2e/scenarios/{last-landing,residents,phone}.mjs` and the playthrough's CORMORANT check | 113–116 |
| **The lead** | — | `package.json`, `debug.ts`, the specs, `OPEN-DECISIONS.md`, `DECISIONS.md` (untouched: Fran's own) | `wp12/playthrough.test.ts`'s targets at CLOSE | — |

**Conflicts to watch.**
- **RETIRE phase 3** touches 16 `src/` files that name `'classic'`, and the 55 suites it lists, among them
  `skills/cycles`, `skills/sentry` and `traces/{foundation,lineage,ui-models}` (they import `support/classic-flow`).
  - Those are ECONOMY's, THREAT's and ENDINGS' movers.
  - So the three tracks start from a HEAD with RETIRE merged. Then each mover is edited once, after RETIRE.
  - HARNESS's files are disjoint from RETIRE's, so it starts now.
- **`tuning.ts`** hunks stay block-disjoint by the table.
- **`trace-hud.ts`** is ENDINGS' only (OD 83 and the allowance), so POLISH doesn't touch it.
- **`data/map-text.ts`** is RETIRE's (it drops the classic refusal, OD 87), and POLISH's hint waits for RETIRE's merge.
- **This plan file:** each track appends only its own `## Deviations (Track X)`, and the lead resolves the append-only
  conflicts, as in slices 5–7.

### 4.3 Each track's definition of done

- Its §2 items: each one's acceptance met, or a written reason and a proposed OPEN-DECISIONS text (accepted gap, or [FRAN]
  ask).
- Its rows in `npm run balance:report --only …` printed in its Deviations, before and after.
- Its movers green, the quick tier ≤ 265 s with the time recorded, and `npm run typecheck` clean.
- Its spec edits drafted (R10).

---

## 5. Which items need Fran

The lead builds every row marked **BUILD + LOG** on the recommendation, and logs it with how to reverse it. **WAIT** rows
are presented to Fran with the recommendation, and nothing is built.

| Item | The question (taste, or a number Fran answered) | Recommendation | |
|---|---|---|---|
| OD 1 | Should RESTORE after PACK AS heal the file? | Keep: an upgrade heals too, and the price is cycles | **WAIT** (Fran said they would circle back) |
| OD 3 | What should v3 add on healthy ships? | Price 7; if still thin, v3 holds any landing orbit (03's own fallback) | BUILD + LOG |
| OD 4 | Should SENTRY v1 get a second power? | No: rates 1/2 and 2/3, and v1 at 1 cycle if decoys stay under 40% of runs | BUILD + LOG |
| OD 9 | Should AUTODROP fly WIDE DROPs? | Only if the sloppy kid shows no gain (§2.3) | BUILD + LOG (conditional) |
| OD 20 | Is the bypass 1.2 s instead of 04's 2.5 s acceptable? | Yes: no boot timing moves | BUILD + LOG |
| OD 24 | A gentler resident (amp 0.10), not bursts that stop | Amp 0.10 | BUILD + LOG |
| OD 25 | Change what HOLD A WALL means | A 2-block blocker in the GAP | BUILD + LOG |
| OD 27 | Should SCAN + REPAIR wake the sleeper? | Yes: REPAIR of `sleep.lock` | BUILD + LOG |
| OD 53 | SURVEY v1's `GROUND ?` tell | Price 1 first; the tell only if v1 stays under 40% of the gap | BUILD + LOG (tell conditional) |
| OD 54 | SURVEY v3 at three times the swath | Only if v3 < +0.5 pod in the busy case | BUILD + LOG (conditional) |
| OD 70 | REASSIGNMENT's allowance below Fran's +15 (round 3 item 4) | +8 | BUILD + LOG, **asked as a confirm** |
| OD 84 | How rare should CONTACT be? | Open in 15–35% of runs; levers in §2.9 | BUILD + LOG |
| OD 88 | MERGE below Fran's 20 (VESPER's line names it) | The highest of 18 / 16 / 15 / 14 that meets 50% | BUILD + LOG, **asked as a confirm** |
| §2.14 | `EMPTY_SHIP_FUEL_PCT` if the empty ship is rare | Kept unless G6b misses; then asked | WAIT (only if it misses) |
| Decision 18 | Cycles from points only, unspent only shown, no SKIP chaining | Keep the working values (§6) | WAIT (Fran deferred it) |
| Round 3 item 7 | MERGE's 20 "kept through the duel" | Unchanged: only the price moves (R11) | WAIT (Fran: until a playtest) |
| G1, G4 | The targets themselves: LITERAL ≥ 80%, SLOPPY 30–65%, 0.10 pod per cycle | As §1 | BUILD + LOG (the report shows them; Fran may move a band) |

---

## 6. Out of scope

- **Decision 18** (the training rules' working values): no SKIP chaining, no in-SKIP AUTODROP, and unspent cycles shown
  only at RUN END. G3 measures the cycle rule, but changing it is Fran's deferred call.
- **RETIRE phase 3** (OD 12, 85–87): the 55 suites, the classic deletion and the codec's `world` narrowing. Slice 8 only
  waits for it.
- **The arm generator's numbers** (R3), and with them any `MAP_GENERATOR_VERSION` / `ARM_CONTENT_VERSION` bump. They are
  open only by the lead's call, if a track proves no other lever.
- **New content and mechanics**: several end locations, CONTACT's own end, the relay map stop, a seventh rack, and a seed
  that lands beside the biggest skill (04 §5 item 5).
- **OD 5's WIDE pass in AUTODROP v3**, except as §2.3's conditional.
- **OD 61** (THE LAST LANDING out of band still parks), **OD 73** (`· FOUND` rows) and **OD 86** (the kit per suite):
  kept as built.
- **"AUTODROP knows ground"** (slice-6 plan §8: `planLanding` over-filling a FLAT LZ): a mechanic, not a number.
- **The parked refactors** (AGENTS "Next logical steps" 3): `script.ts`'s split, `game.css` by surface, and `tuning.ts`
  grouped by domain. Slice 8 edits values in place and does not move blocks.
- **The e2e playthrough's pace** beyond §2.12's CORMORANT check; the COMPETENT wall-time target stays a KNOWN_GAP for
  Fran's playtest.
- **Save, archive and content versions**: none bump.
