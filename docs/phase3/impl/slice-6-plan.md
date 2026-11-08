# Slice 6 plan: SURVEY

**Lead decisions (2026-11-08).**
- All of R1–R25 are adopted as written.
- The [FRAN] items (R3, R4, R5, R7, R8, R17) are built as recommended here, and logged in `docs/phase3/OPEN-DECISIONS.md`
  under "Slice 6".
- Save: RUN_SAVE_VERSION is still 5 at this plan's start. The slice 5 fix pass made no bump, so the FOUNDATION's bump
  is v5 → v6.
- Process: FOUNDATION (in a worktree, while the slice 5 e2e runs on the main checkout), then a contract review, then
  the SWATH and SITES tracks, then merge, review, fixes, the unit tier and one e2e run.

**Status: proposal for the lead.** Every open call below has one recommendation. The [FRAN] items change gameplay: the
lead builds them as recommended (Fran asked for best judgement while short on time) and logs each one in
`docs/phase3/OPEN-DECISIONS.md` under a new "Slice 6" heading, with how to reverse it. The process is the one slices 4c–4e
and 5 used: FOUNDATION, then an independent contract review, then the parallel tracks in worktrees, then a merge, a full
review, fixes, the unit tier and one e2e run. The lead owns the files the plan lists as the lead's. Tracks request
changes to those files; they never make them.

I wrote this from HEAD 431ff8a on `claude/modest-hawking-209t0f` (the slice 5 fix pass is still committing). Paths are
relative to `/home/user/ArrivalProtocol`. The specs are `docs/phase3/01-landing.md` ("01", §3.13 owns how surveying
plays), `03-skills.md` ("03", §3.2 and §3.9 own the versions), `02-map.md` ("02": the card and the AHEAD row) and
`05-story.md` ("05", §8.6: "LZ-B is in a lake :)"). `04-threats.md` touches SURVEY only through the skill file (bites,
graded damage) and the Core thread it holds. "Plan 4cde" and "plan 5" are `slice-4cde-plan.md` and `slice-5-plan.md` with
their Deviations sections; this plan follows their format and process.

`RUN_SAVE_VERSION` is 5 at HEAD (`src/data/tuning.ts:2021`). If the slice 5 fix pass bumps it, every "v5 → v6" below
reads "v6 → v7"; the FOUNDATION checks HEAD before it starts.

The classic five stay untouched: their site data is GOOD (`ShipDef.site = 'good'`), so SURVEY never runs there and none
of the 166 classic suites moves.

---

## 0. Lead summary

### 0.1 What the player gets

- **POOR site data starts to matter.** From layer 5 (1 in 3; 1 in 2 in layers 6–7, as 3a already rolls and stores) a
  planet's SHIP CARD says `SITE DATA · POOR · ARRIVAL CONTROL GUESSED` and `LZ: 2 · SURVEY NEEDED`. When such a ship is
  selected, TRAINING's AHEAD row adds `SITE DATA POOR · SURVEY FINDS BETTER SITES`.
- **The guesses hide one bad site.** On a POOR planet one of ARRIVAL CONTROL's guessed LZs stands on bad GROUND:
  - ROCKY: every pod that lands there lands hard (×0.5);
  - WET: hard too, and its bracket is a third narrower, so its drop fits less often.

  The boot types `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs`, and CONTROL says `We guessed the landing sites! :)`.
  Without SURVEY, the first pod down on the bad guess shows it: the stamp `LZ-B · WET ✕`, and CONTROL says `LZ-B is in a
  lake :)`. The kid can still send the rest elsewhere. It is worse, but never blocked (decision 12). On CORMORANT (9
  pods, 5 · 4), a bad LZ-B costs 400 of 1,800 points, about one TRAINING CYCLE, before the kid reacts.
- **SURVEY v1 FIND (2 cycles, 3 blocks)** opens at the first desk from visit 4 that has a POOR planet in reach (as built
  in slice 4). From the boot it maps a ±20° swath under the ship:
  - a lit wedge on the NAV PLOT, and the mapped rim brightening;
  - it holds a spare Core thread (THRUST LIMIT 75%, one op fewer) until the planet is fully mapped. That is 34–45% of the
    planet by the capture burn and all of it within the first orbit;
  - sites pop up as dashed brackets on the rim and as rows in a new **SITES** window: `SITE 4 · ROOM 800 · WIDE · GROUND
    ?`;
  - click one, and `SET AS LZ-B (800)` moves that LZ there.
- **v2 RATE (3, 4 blocks)** shows GROUND and a ★ rating on every site it has seen, CONTROL's guesses included. The bad
  guess reads `LZ-B · WET ✕` as the swath passes it, and the strip offers the fix: `LZ-B IS WET ✕ — SITES: SET SITE 4 AS
  LZ-B`.
- **v3 SWEEP (4, 6 blocks)** doubles the swath to ±40° and holds no thread. The THREADS counter and the THRUST LIMIT
  hatch clear at once, and 46–56% of the planet is mapped by the capture.
- **The LANDING REPORT** names each LZ's site and ground after its count (`LZ-B 800 / 800 ✓ · SITE 4`, `LZ-A 1,000 / 1,000 ✓ ·
  ROCKY · 5 HARD`: the suffix in 01's LZ-row slot, review m8).
- **Damage** costs a version as for every skill. Whatever was mapped or rated stays known.

### 0.2 Process

FOUNDATION (§6.1, one agent): the types, the save bump, the site roll, the state build, the ground rule at touchdown, and
every seam behaviour-neutral behind two gates. → Independent contract review. → Two parallel tracks in worktrees (§6.2):
- **SWATH:** the survey machine and its rules;
- **SITES:** every surface and sound.

→ Merge SWATH, then SITES. → Full review. → Fixes. → Unit tier (budget 265 s, cap 300). → One e2e run (lead). → AGENTS.md
and OPEN-DECISIONS.md.

The slice makes **one** save bump, v5 → v6, which the FOUNDATION makes (R1).

### 0.3 Risks and open calls

Items tagged **[FRAN]** change gameplay. Every item has one recommendation.

1. **R1. One save bump, v5 → v6, for the whole slice.**
   - **Recommend:** the FOUNDATION adds every saved field (§2.2):
     - `LzState.site` and the widened `LzGround`;
     - `LandingState.survey` and `LandingState.sitesRev`;
     - `ShipResult.survey`.
   - The tracks add none. A track that needs a field asks the lead, who folds it into v6 before the first merge.
   - The migration is truthful: before v6 every planet played GOOD.
2. **R2. The guesses are the LZs 3a already rolled. Their hidden grounds and the candidates are rolled at the boot,
   from the ship's own stream.**
   - **Recommend:** `data/survey-sites.ts rollSurveySites(def, layer, planetR, shipRng(run, slot, 'survey'))`, called
     from `state/initial.ts createShipSlices` for a POOR ship only.
   - `shipRng` on the arm is the ShipKey's stream, so a ship has the same sites whatever route led to it, and the same
     next run.
   - Nothing is stored on `ArmShip`: the roller, the generator, `MAP_GENERATOR_VERSION` and the arm's content do not
     change, and no stored arm resets. This mirrors slice 5's `residentRackA` on `'resident-files'`.
3. **R3. [FRAN] How bad a POOR planet is without SURVEY.** 01 says a guess "often" hides a bad trait.
   - **Recommend:** exactly one bad guess per POOR planet (`POOR_BAD_GUESSES 1`, `POOR_EXTRA_BAD_GUESS_ODDS 0`). It is
     ROCKY or WET, evenly (`BAD_GROUND_WET_SHARE 0.5`). Every other guess is FLAT.
   - **Why:**
     - CONTROL's one bad guess is the story's joke ("LZ-B is in a lake :)"), and v2 finds exactly it;
     - the cost is about one cycle step: 12–25% of the points by LZ count (4 LZs to 2), before the kid reacts;
     - with each other guess also bad 1 in 3, a 2-LZ ship would lose about a third of its points: harsher than "worse
       but playable".
   - **To reverse:** `POOR_EXTRA_BAD_GUESS_ODDS = 1/3` in `tuning.ts`.
4. **R4. [FRAN] WET's "the bracket shrinks by a third" is the site's true width, always drawn and scored, guesses
   included. Only the word is hidden until a reveal.**
   - **Recommend:** the roller writes a WET site's half-width as `WET_WIDTH_FACTOR` (2/3) of its WIDTH class. A WET guess
     is built that narrow from the boot.
   - **Why:**
     - 03 §3.9 says pods on a guess are "never off-site", and that holds by construction: the bracket you see is the one
       that scores;
     - a reveal changes no geometry, so no pod in flight is re-judged;
     - the bracket's width is not a readable tell: the card, the strip and the brackets name counts, never kilometres.
   - The alternative was a shrink at the reveal. It would punish knowing, and it would re-judge a pod already falling.
5. **R5. [FRAN] Without SURVEY, the first pod down on a bad guess reveals its ground.**
   - **Recommend:** the touchdown echo carries the ground word. The stamp is `LZ-B · WET ✕` / `LZ-A · ROCKY ✕`.
   - CONTROL's quip is said **at the reveal**, whichever reveals first: `LZ-B is in a lake :)` or `LZ-A is a little
     rocky :)`. It is never said at the boot, where it would give the guess away and leave v2 nothing to find.
   - The kid can then over-fill a FLAT LZ: mislanded ×0.75 beats hard ×0.5. Nothing teaches this, and AUTODROP v3 does
     not plan it (slice 8, §8).
6. **R6. SURVEY runs only on POOR planets.** On a GOOD planet it is idle and holds nothing: `SITE DATA GOOD · IDLE` on
   its Skills row. **Why:** 01 gives GOOD planets sound LZs, so there is nothing to find, and a thread spent for nothing
   would be a trap. 03 §3.4 already expects a kid to leave SURVEY behind for a GOOD final ship.
7. **R7. [FRAN] SURVEY starts by itself and stops when the planet is mapped. A PAUSE gives the thread back.**
   - **Recommend:**
     - it runs from the first flight tick after the boot (01: "from the boot on") while it works, in `flight` and
       `landing` until the landing ends;
     - it maps `SURVEY_CELLS` 72 cells of 5°;
     - at 100% it releases its thread and types `> SURVEY: PLANET MAPPED · 6 SITES`;
     - the SITES window's header has `[ PAUSE ]` / `[ RESUME ]`, a click and no key. Pausing releases the thread.
   - **Why the pause:** 01 calls surveying during the capture burn "a real HACK OR BURN cost". A cost the kid can't
     decline isn't a choice. The phase-2 fs-tool Deactivate no longer exists, so there is no other off switch.
   - **Why no key:** every free letter on the `'game'` layer is spoken for or reserved, and the SITES window is where the
     survey is.
8. **R8. [FRAN] SURVEY is a polite tenant of the Core.**
   - **Recommend:**
     - it claims a thread only when one stays free after the claim (`SURVEY_KEEP_FREE_THREADS 1`), so it never takes the
       kid's last thread;
     - it **yields** its thread to AUTOBURN's and AUTODROP's claims, and claims again when a spare one frees;
     - it never yields to the kid's own ops or to SENTRY's pre-empt. That is 03's "one op fewer".
   - **Why:**
     - a 2-thread Core with one op running would otherwise leave AUTOBURN no thread at START BURN, so a skill would
       sabotage a skill;
     - with a worn Core (1 thread) SURVEY would hold the only thread for minutes.

     The thrust cost (C4) is the same whoever holds the thread, so the capture still pays it.
   - **Built as** `ops-core.ts reserveThread(owner, { yieldable })` and `canClaimThread()` (§2.4).
9. **R9. The sites (01 §3.13).** Per POOR planet there are the guesses plus `lzs.length + SURVEY_EXTRA_SITES` (3)
   candidates:
   - per LZ, one guaranteed FLAT candidate with ROOM = its count + 0–2 pods, WIDE or STANDARD (never NARROW, so v2's
     swap is a sure improvement);
   - three extra candidates: ground FLAT 1/2, ROCKY 1/4, WET 1/4; width WIDE, STANDARD or NARROW, 1/3 each; ROOM 1 to
     (largest count + 2) pods;
   - on 1 POOR planet in 3, one extra is 01's story find `SITE 5 · ROOM 0 · WRECKAGE · OLD POD`. It can never be
     assigned. It is flavour for the `046.log` mystery, with no fragment and no score.
   - Sites keep `LZ_MIN_GAP_DEG` (12°) edge to edge from every other site, by their class width, and
     `NO_GO_EDGE_GAP_MIN_KM` from every no-go arc. The roller throws if it can't place them (it fails loudly).
10. **R10. Assigning a site.**
    - **Recommend:** a click on a found site (a SITES row, or its dashed bracket on the plot or the GROUND TRACK) opens a
      pill `SET AS LZ-B (800)` for each LZ it can take.
    - The LZ keeps its label and its count, and takes the site's centre, width and ground.
    - An LZ can take a site when:
      - the site's ROOM ≥ the LZ's count;
      - no other LZ stands on the site;
      - the LZ has no pod down or falling into it (01: "an LZ can't move once a pod has landed in it");
      - its window is not open now.
    - CONTROL's guesses stay sites, so an LZ can go back.
    - v1 and v2 assign alike; v2 adds the information (GROUND, ★).
    - After a move the LZs may no longer follow increasing angle. That is a ShipDef rule (`validateLandingDef`) and
      nothing at runtime reads it (checked: no reader depends on the label order).
11. **R11. v2 RATE.**
    - **Recommend:** while SURVEY works at v2 or better, every found site's GROUND is known, latched for the ship. That
      covers a site found at v1 and rated after a REPAIR brings v2 back.
    - The ★ rating has three tiers: ★★★ FLAT and not NARROW, ★★ FLAT NARROW, ★ ROCKY or WET. A wreck has none. They
      read at a glance and need no number.
12. **R12. v3 SWEEP and damage.** v3 maps ±40° and holds no thread. Damage works on the effective version now
    (`skillLive`):
    - v3 → v2 claims a thread (or waits) and halves the swath;
    - v2 → v1 rates nothing new;
    - OFF stops mapping.

    What is mapped, found or rated stays.
13. **R13. AUTOBURN v3 and the drop cache see an LZ move.**
    - **Recommend:** `landing.sitesRev`, bumped by every move, joins three keys:
      - `drop-cache.ts fresh()`;
      - `autoburn-v3.ts aimKey` (the fit reads the LZ widths);
      - `autodrop-plan.ts planKey`.
    - v3's "never climbs back up during a landing" (03 §3.6) stands when an LZ moves to a wider site.
14. **R14. AUTODROP needs nothing new.** v1–v3 and MOTH's RUN THE DROPS read `landing.lzs` as they stand, and v3
    re-plans every tick. It knows no ground: a known ROCKY LZ is still planned as the counts say (slice 8, §8).
15. **R15. The map.**
    - **Recommend:**
      - the card's reserved `'site'` row: `SITE DATA · GOOD`, or `POOR · ARRIVAL CONTROL GUESSED` in the warning tone;
        on a visited ship `POOR · LZ-B MOVED`;
      - the `'lzs'` row says `LZ: 2 · SURVEY NEEDED` on POOR planets (01 §3.15's words);
      - the AHEAD row gains a **second line** (`TrainingModel.aheadSite`).
    - **Why a second line:** the AHEAD line is already 69 characters at its worst (`NEXT: GOOD HOPE · ARK · 16 PODS ·
      MEMORY 384 COMPACT · NOISE SEVERE 3`, the case in `skills/ui-models.test.ts:330`), so ` · SITE POOR` would break
      the 70-character rule.
16. **R16. The opening rule stays as built** (`'poor-ahead'`, `minVisit 4`, SURVEY first on a tie with SENTRY;
    `skill-tree.ts openBranchesAt`). Raising `built` is the whole change.
    - On seed 7's worked route SENTRY opens at desk 3 (KESTREL's seeds) and SURVEY at desk 4 (CORMORANT is in reach from
      VESPER), so there is no tie there.
    - Desk 4's closed list changes from `SURVEY · SURVEY,DEFENCE · SENTRY` (`skills/ui-models.test.ts:123`, earlier
      desks) to none.
17. **R17. [FRAN] The sleeper keeps its 4 cycles. It does not teach SURVEY.** Plan 5 left this open (§4 there: "slice 6
    decides").
    - **Recommend:** keep R12 of plan 5 as built.
    - **Why:**
      - MOTH sleeps in layers 3–7, often before SURVEY can open (visit 4, and only with a POOR ship in reach);
      - a SURVEY v2 there is worth nothing on a route with no POOR planet, while cycles are always worth their price;
      - it was measured and logged as OPEN-DECISIONS 17.
    - 03 §7's `SURVEY.skl v2 · from the sleeper` stays a sample line.
18. **R18. The leftover skill card may now give SURVEY v1,** with no code: KIN's pick is random among
    `grantAllowed(…, 1, 'card')` skills (OPEN-DECISIONS 30), and SURVEY joins once `built > 0` and its branch is open.
    The fixtures that pick that card move (R23).
19. **R19. Two gates, both SWATH's lines, raised together last.**
    - `data/survey.ts SURVEY_BUILT.poor` (POOR plays POOR: the hidden grounds, the boot and CONTROL lines, the card rows);
    - `SKILL_TREE.survey.built` (0 → 3: the branch opens and the machine runs).

    Two lines, because the FOUNDATION's dry run measures their churn apart (R23), as slice 5 measured each kind.
20. **R20. No mid-ship save** (decision 5).
    - All survey state is in the store (`landing.survey`), and a BEAM save rebuilds the ship from its boot, the same
      sites included (R2).
    - At SHIP DONE `surveyShipEnd` leaves the machine at rest (`claimed: false`, `lastRad: null`), which the codec
      checks.
21. **R21. Words.**
    - CONTROL has three lines on a POOR ship: the boot quip, the reveal quip (R5) and, once, `You moved LZ-B? Bold! :)`.
    - The TERMINAL types the first find, a v2 reveal, a wreck and `PLANET MAPPED`. Other finds only ping and update the
      SITES window, so a 7-site planet is not 7 lines.
    - No INBOX mail: 05 §3.3's senders have nothing to say about sites.
22. **R22. One strip row.** It shows only when SURVEY knows a better place:
    - `survey-swap`: a known-bad LZ with no pod down, a FLAT found site with ROOM free, and no window open;
    - text `LZ-B IS WET ✕ — SITES: SET SITE 4 AS LZ-B`, priority `'hint'`, layer `'ship'`, after `DROP_LESSON_RULES`.

    Finds, waits and pauses go on the Skills row and the SITES header, never the strip: 01 §3.2 wants SURVEY to be "a
    choice, not a chore".
23. **R23. Fixture churn.**
    - Seed 7's CORMORANT (slot 15, depth 5 on the worked route, 9 pods, 2 LZs) is POOR. So are SHEARWATER (13) and
      GOOD HOPE (17). That moves the playthrough's CORMORANT landing, its desk-4 TRAINING and possibly its leftover card
      (R18).
    - **Recommend:** the FOUNDATION raises each gate alone in a scratch run, lists the suites that move, and writes the
      list into its Deviations, as plan 5's foundation did for R22.
    - SWATH may edit those suites for this churn only, lead-owned ones included.
    - The e2e scenarios are the lead's at the batch end (§7.4).
24. **R24. Time budget.** The new suites add about 14 s of CPU (about +5 s of wall on 4 workers) to the ~136 s quiet
    tier. The sweep is BALANCE_ONLY.
25. **R25. No change to cycles, prices or scoring rules.** A bad ground acts through the existing hard factor
    (`HARD_LANDING_FACTOR 0.5`) and the existing bracket rule. Q and the cycles follow (03 §3.1). `ShipResult.survey`
    records the ship's survey for slice 7's epilogue and slice 8's sweeps.

---

## 1. Scope

### 1.1 What slice 6 delivers

| Source | Delivers | Owner |
|---|---|---|
| 01 §3.13 | POOR planets, guesses with hidden GROUND, candidates with ROOM / WIDTH / GROUND, the swath, assigning, "without SURVEY still playable" | FOUNDATION (roll, state, ground rule), SWATH (machine, assigning) |
| 01 §3.15 | card labels `LZ: 3 · SURVEY NEEDED`; the roller's check "a POOR planet has a FLAT candidate with enough ROOM for each LZ" | SITES (words), FOUNDATION (check) |
| 03 §3.2, §3.9 | SURVEY v1 FIND, v2 RATE, v3 SWEEP; the thread; `built` 0 → 3 | SWATH |
| 03 §4 | the AHEAD row's site data; SURVEY's TRAINING mini-demos | SITES |
| 02 §4 | the SHIP CARD's SITE DATA row | SITES |
| 05 §8.6, 01 §7 | "LZ-B is in a lake :)", CONTROL's site quips, the wreckage find | SWATH (lines), SITES (stamps) |
| 04 | nothing new: SURVEY.skl is a skill file (bites, graded damage, unlink), and its thread is one op fewer | — |

### 1.2 Where POOR planets are on run 1

3a's `landing-roller.ts rollSite` already stores `ArmShip.reserved.site`. From `assembleRun1Arm(seed)` at HEAD (slot:
name, layer, pods, LZs):

| Seed | POOR ships |
|---|---|
| 1 | 10 PLOVER (L5, 8, 2), 12 SKYLARK (L5, 4, 2), 15 CORMORANT (L6, 9, 2), 16 PROVIDENCE (L7, 10, 3), 18 WAYFARER (L7, 5, 2) |
| 4 | 13 SHEARWATER (L6, 5, 2), 14 KITTIWAKE (L6, 9, 2), 15 CORMORANT, 17 GOOD HOPE (L7, 16 ark, 4), 18 WAYFARER |
| **7** | **13 SHEARWATER (L6, 5 light, 2), 15 CORMORANT (L6, 9, 2), 17 GOOD HOPE (L7, 16 ark, 4)** |

- On seed 7's worked route `[0, 2, 5, 11, 15, 19]` only CORMORANT is POOR. It also holds the departed resident LOOKOUT,
  and HOLLOW boards on its beam.
- From VESPER's desk (visit 4) CORMORANT is in reach, so SURVEY opens there.
- Of seeds 1–10, every one has 2–5 POOR ships, and CORMORANT is POOR on 8 of them. The FOUNDATION re-checks the table
  in its first commit, since the fix pass is still landing.

### 1.3 How SURVEY meets the other systems

| System | Interaction | Where |
|---|---|---|
| The landing | the LZs stand on sites; a move rewrites one LZ's geometry and ground (R10), bumps `sitesRev`; ground decides the touch at touchdown (§2.9) | `landing-rules.ts`, `landing.ts`, `survey.ts` |
| AUTODROP v1–v3, MOTH's drops | none: they read the LZs as they stand (R14); the memo key gains `sitesRev` | `autodrop-plan.ts` (key) |
| AUTOBURN v3 | its fit reads the LZ widths; the key gains `sitesRev`; a WET guess's narrow bracket makes it go lower (R13) | `autoburn-v3.ts` (key) |
| AUTOBURN / AUTODROP claims | SURVEY yields its thread to them (R8) | `ops-core.ts`, the two claim sites |
| Core threads, thrust | a held thread is C4's 25% (`REACTOR_THREAD_SHARE`) and one op fewer, through the existing reserved count | none |
| HOLLOW, seeds, SENTRY | SURVEY.skl is bitten, eaten, unlinked and graded like any skill; a verb telegraphs only while a thread is free, and R8 always leaves one when SURVEY claims | none |
| The tree | `built` 0 → 3; `'poor-ahead'` as built; PACK AS, RESTORE, the PACKET chip `→ guess the sites` are generic | `data/skills.ts` (one line) |
| Residents | MOTH keeps its cycles (R17); the leftover card can give SURVEY v1 (R18); a resident's RUN THE DROPS flies the LZs as they stand | none |
| The map | card rows, the AHEAD line (R15); no arm change (R2) | `desk.ts`, `training-model.ts` |
| The save | v6 (R1); a BEAM resumes into the same sites (R2) | `save-codec.ts` |
| The story | CONTROL's quips, the wreck (R9, R21) | `swath-text.ts` |

---

## 2. Design

### 2.1 Module map (new modules in bold)

| Module | Kind | Owner | Role |
|---|---|---|---|
| **`src/types/survey.ts`** | types | lead | §2.2's types |
| **`src/data/survey.ts`** | data | lead (one gate line for SWATH) | `SURVEY_BUILT`, `siteDataOf(ship)` (the gated read) |
| **`src/data/survey-sites.ts`** | pure data module | lead (built in full by the FOUNDATION) | `rollSurveySites`, `validateSurveySites`; imports only data, types and `systems/rng` (the import guard's rule) |
| **`src/data/survey-text.ts`** | words | lead | the boot line, the refusals for assigning, the site labels (`SITE 4`, `LZ-B GUESS`) |
| **`src/state/survey-selectors.ts`** | pure | lead | `lzSiteOf`, `groundAt`, `groundKnownAt`, `surveyVersion`, `foundSites` |
| **`src/systems/survey.ts`** | stateful | SWATH | `mountSurvey` (the tick, the thread, mapping, finding, rating, reveals, CONTROL), `assignSite`, `toggleSurveyPause`, `surveyShipEnd`, `surveyStatus`, the debug bodies |
| **`src/systems/survey-model.ts`** | pure | SWATH | `sweptCells`, `siteStars`, `assignRefusal`, `assignableLzs`, `bestSwap`, `mappedPct` |
| **`src/data/swath-text.ts`** | words | SWATH | CONTROL's quips, the TERMINAL lines, the strip's row, the Skills row's status |
| **`src/data/survey-rules.ts`** | strip rules | SWATH | `SURVEY_RULES` (spread into `GUIDE_RULES` by the FOUNDATION) |
| **`src/systems/survey-hud.ts`** | pure | SITES | the view models (§2.14) |
| **`src/data/sites-text.ts`** | words | SITES | everything SITES paints |
| **`src/components/tools-view/SitesWindow.ts`** | component | SITES | the SITES window |
| **`src/components/tools-view/plot-survey.ts`** | painter | SITES | the swath, the mapped rim, the dashed brackets on the NAV PLOT |
| **`src/styles/survey.css`** | css | SITES | |

### 2.2 State and the save (v5 → v6, one bump; R1)

```ts
// src/types/landing.ts (lead)
export type LzGround = 'flat' | 'rocky' | 'wet';
export interface LzState {
  // …as today; centreRad, halfWidthRad, widthKm and ground are the site's it stands on (WET already narrowed, R4)
  site: string | null;          // the SurveySite id it stands on (POOR planets), null on a GOOD planet
}
export interface LandingState {
  // …as today
  survey: SurveyState;          // the ship's survey (GOOD planets: site 'good', no sites)
  sitesRev: number;             // bumped by every LZ move: the drop cache's, AUTOBURN v3's and AUTODROP v3's keys (R13)
}

// src/types/survey.ts (lead)
export type SiteData = 'good' | 'poor';
export type SiteKind = 'guess' | 'candidate' | 'wreck';
export interface SurveySite {
  id: string;                   // 'guess-A' (CONTROL's guess for LZ-A), 'site-1' … in rim order from 0 rad
  kind: SiteKind;
  number: number;               // the guess's LZ index, or the SITE number (labels are survey-text's)
  centreRad: number;
  halfWidthRad: number;         // the true half-width: a WET site's is WET_WIDTH_FACTOR of its class (R4)
  widthKm: number;
  width: LzWidth;               // its class, shown as WIDE / STANDARD / NARROW
  roomPods: number;             // ROOM, in pods: a guess's is its LZ's count, a wreck's 0
  ground: LzGround;             // the truth
  found: boolean;               // its centre's cell is mapped
  groundKnown: boolean;         // rated by v2+ (R11), or shown by a touchdown (R5); false at the boot on every site
}
export interface SurveyState {
  site: SiteData;
  sites: SurveySite[];          // [] on a GOOD planet
  mapped: boolean[];            // SURVEY_CELLS (72) cells of SURVEY_CELL_DEG; all false until SURVEY runs
  paused: boolean;              // the kid's PAUSE (R7)
  claimed: boolean;             // holds its Core thread (v1, v2); false at every save point
  lastRad: number | null;       // the ship's angle at the last mapped tick (swept cells, §2.7); null at rest
  ranAt: EffectiveVersion;      // the best version it mapped at this ship (0: never ran)
  moves: { lz: string; site: string }[];   // in order (the report, the record, CONTROL's once-line)
  reveals: { site: string; by: 'survey' | 'touchdown' }[];   // bad grounds made known, in order (each stamps once)
  lines: { firstFind: boolean; mapped: boolean; controlBoot: boolean; controlMoved: boolean };   // said once per ship
}
// The record (ShipResult.survey; null on a GOOD planet), for the report, slice 7's epilogue and slice 8's sweeps.
export interface SurveyRecord {
  ranAt: EffectiveVersion;
  mappedPct: number;            // 0..100
  found: number;                // candidates and wrecks found (guesses not counted)
  moves: { lz: string; site: string }[];
  badKept: { lz: string; ground: 'rocky' | 'wet'; known: 'survey' | 'touchdown' | null }[];   // LZs on bad ground at the end
}
```

`groundKnown` starts false on every site, FLAT guesses included. If the FLAT guesses started known, the one guess left
at `GROUND ?` would point straight at the bad one.

**Other fields:**
- `state/schema.ts ShipResult.survey: SurveyRecord | null`. `run.ts endShip` writes it from `surveyShipEnd(store)`
  (SWATH's; the stub returns the record built from the slice as it stands).
- `data/ships.ts ShipDef.site: SiteData`, from `arm.reserved.site`, or `'good'` on the classic five. This adds no import:
  the import guard (`tests/unit/support/import-guard.test.ts`) stays green.
- `state/initial.ts`:
  - `createShipSlices` computes `site = siteDataOf(ship)` (`'good'` while `SURVEY_BUILT.poor` is false);
  - for `'poor'` it computes `rollSurveySites(ship.landing, ship.layer, ship.flight.planet.R, shipRng(run, slot,
    'survey'))`, and passes it to `createLandingState` as `opts.sites`;
  - `createLandingState` builds each LZ from its guess site (geometry, ground, `site: 'guess-X'`) and the survey slice
    from `createSurveyState(site, sites)`;
  - with `opts.sites` null the LZs are built exactly as today, with `site: null`.

**`RUN_SAVE_MIGRATIONS[5]`** (a v5 save becomes v6):
1. In a world payload's landing slice: each `lzs[i].site = null`, `survey = createSurveyState('good', [])`, and
   `sitesRev = 0`.
2. Each `run.ships[i].survey = null`, in the world and the boot payloads, and in `save.run` if the envelope carries one.
3. `saveVersion: 6`.

This is the truth: no v5 world ever played a POOR planet as POOR. A v5 BEAM save into a POOR ship resumes by rebuilding
from its boot, and then plays POOR (R2). That is intended, and the migration test pins it.

**Codec checks** (`checkLanding`, `checkSavedRun`):
- `landing.survey`, field by field:
  - `mapped` has exactly `SURVEY_CELLS` booleans;
  - site ids are unique, and on a GOOD planet there are none;
  - each `lzs[i].site` is null (GOOD) or names a site no other LZ names, and the LZ's centre, half-width, width and
    ground equal that site's;
  - every `moves` and `reveals` entry names an LZ and a site the slice has;
  - `claimed === false` and `lastRad === null` (at rest, R20).
- `sitesRev` is a whole number ≥ `moves.length`.
- `run.ships[].survey` is null or a record of §2.2's fields, and `mappedPct` is whole, 0..100.
- `RUN_SAVE_VERSION 6`, and the shape pin holds v6 beside v1–v5. The pin reaches `landing.survey.*` at depth 3, as it
  reached `resident.*`.

### 2.3 Module-level state (allowed, listed)

| Where | What | Why it may stay a module variable |
|---|---|---|
| `ops-core.ts` | the reservation's `yieldable` flag | beside `reservedThreads`, reset with the world |
| `survey.ts` | `lastRunning`, the last `'survey-state'` it emitted (review m3), reset through `onWorldReset`; the machine itself is `landing.survey`, and whether it holds a thread is `claimed`, reconciled each tick with `holdsThread('survey')` | an emit "on a change" needs the last state, and a saved field for it would be a save change |
| `survey-hud.ts` | none | |

### 2.4 Seams the FOUNDATION builds (behaviour-neutral)

- **The ground at touchdown.** `landing-rules.ts touchAtTouchdown(launch, ground: LzGround)`: `'hard'` when the ground
  is ROCKY or WET, else `driverTouch(launch.driverIntegrity)` as today.
  - Both callers (`landing.ts:209`, `landing-rules.ts:733 pendingTouchdowns`) pass `groundAt(landing,
    placement.lz)`: the LZ's ground in an LZ (mislanded included), `'flat'` off-site and in a no-go arc.
  - Every ground is FLAT until the gate is raised, so nothing moves.
  - `LaunchRecord.predictedTouch` keeps its meaning ("how the driver would land"). L-rows such as `POD 04 WILL LAND
    HARD — REPAIR its driver` stay driver-only, because REPAIR can't fix ground.
- **The keys (R13).** `sitesRev` joins `drop-cache.ts fresh()` (beside `orbitEpoch`), `autoburn-v3.ts aimKey` and
  `autodrop-plan.ts planKey`. It is 0 until a move.
- **The thread (R8).** In `ops-core.ts`:
  - `reserveThread(owner, opts?: { yieldable?: boolean; preempt?: boolean })`, `holdsThread(owner)` and
    `canClaimThread()`;
  - `canClaimThread()` is `canStartOp()`, or a yieldable reservation is held;
  - a `preempt` reservation with no thread free drops a yieldable one and announces `{ type: 'threads' }`;
  - AUTOBURN's claim (`autoburn.ts:~608`) and AUTODROP's (`autodrop.ts:~514`) switch from `canStartOp()` to
    `canClaimThread()`, and reserve with `{ preempt: true }`;
  - the kid's ops (`startOp`) and SENTRY's pre-empt keep `canStartOp()`;
  - nothing is yieldable until SWATH, so nothing moves.
- **Assigning.** `survey.ts assignSite(store, lz, siteId): AssignRefusal | null` throws through `not-built.ts
  notBuilt('assignSite', 'SWATH')`. `survey-model.ts assignRefusal(state, lz, siteId)` is neutral: `'closed'`. The UI may
  call it on every paint.
- **The machine.** `main.ts` mounts `mountSurvey(store)` right after `mountResidents`, and so does
  `tests/unit/wp6/harness6.ts`. The stub mount does nothing.
- **Run.** `run.ts endShip`, after the landing's tally and before `residentShipEnd`, sets `result.survey =
  surveyShipEnd(store)`. The stub returns the record of the slice as it stands (built, not stubbed, since it is pure).
- **Boot.**
  - `map-boot.ts mapBootLines` adds `'site-data'` when `state.landing.survey.site === 'poor'`.
  - `script.ts bootLinePlan` places it after the ship's own arrival-damage lines (02 §4, the end of line group 5),
    before the deliveries.
  - `BOOT_LINE_MAX` goes 23 → 24, and `BOOT_LINE_AT_SEC` gains 30.4.
  - The text is `SURVEY_TEXT.boot(lzCount)`, the lead's.
- **Strip.** `script.ts` spreads `SURVEY_RULES` (`data/survey-rules.ts`, empty) into `GUIDE_RULES` right after
  `DROP_LESSON_RULES`.
- **Skills row.** `skills.ts SKILL_ROW_HOOKS.survey = { title, effect, status: (s) => surveyStatus(s) ??
  plainSkillStatus(s, 'survey') }`. The stub `surveyStatus` returns null.
- **The TRAINING demos.** `training-text.ts DemoArt` gains `'find' | 'rate' | 'sweep'`, and `TRAINING_DEMO_ART.survey`
  names them. `TrainingWindow.ts demoSvg` draws the three as `plain`, and SITES draws them.
- **The views** (hooks the FOUNDATION wires; each stub in `survey-hud.ts` returns the neutral answer):
  - `landing-hud.ts groundTrackModel` appends `surveyGroundBrackets(state)` (stub `[]`) to its brackets, with
    `look: 'candidate'` (the reserved `BracketLook`). `terrainStretches` takes an optional `unmapped: Span[]` from
    `surveyUnmapped(state)` (stub `[]`).
  - `NavPlotWindow.ts` paints `surveyPlotModel(state)` (stub null) through `plot-survey.ts paintSurveyLayer` (a stub
    that draws nothing) in flight and landing, under the landing layer.
  - `desk.ts cardModel`: the `'site'` row from `surveyCardRow(state, slot)` (stub null, no row). The `'lzs'` row's words
    take the site data through `MAP_TEXT.card.lzs(count, site)`: the FOUNDATION adds the parameter, and on `'good'` the
    words are today's.
  - `training-model.ts`: `aheadSite: string | null` from `surveyAheadLine(state, slot)` (stub null).
  - `landing-report.ts`: each LZ row appends `surveyLzRowSuffix(state, lz)` (stub `''`).
  - `index.html`: a `#sitesWindow` container and a dock entry `SITES`, hidden. SITES fills and shows them.
- **Events and cues** (§2.5): every name in `events.ts`'s `6 SURVEY` block. Each is mapped in `audio-cues.ts`'s survey
  block to an existing cue.
- **Debug** (§2.15): the hooks in `debug.ts`, calling SWATH's bodies.

### 2.5 Events (the FOUNDATION adds every name to `events.ts`; the emitters are SWATH's)

| Event | Payload | Cue (`audio-cues.ts`'s survey block; SITES may change the cue) |
|---|---|---|
| `'survey-state'` | `{ running: 'running' \| 'waiting' \| 'paused' \| 'done' \| 'off'; version: EffectiveVersion }` | `opDone` on `'done'`, none otherwise |
| `'site-found'` | `{ siteId: string; kind: SiteKind; first: boolean }` | `scanTick` (SITES: `surveyPing`) |
| `'site-rated'` | `{ siteId: string; ground: LzGround }` | none |
| `'site-revealed'` | `{ lz: string; siteId: string; ground: 'rocky' \| 'wet'; by: 'survey' \| 'touchdown' }` | `seedWarn` (SITES: `siteSting`) |
| `'lz-moved'` | `{ lz: string; from: string; to: string }` | `opDone` (SITES: `siteSet`) |

`'pod-landed'` (it already carries `lz` and `touch`) is reused for the touchdown reveal, and `'skill-downgraded'`-style
watchers stay generic.

### 2.6 Tuning (the FOUNDATION adds every number, in three banner blocks of `tuning.ts`; a track edits values only in its own)

**6 lead (the roll; R3, R4, R9)**
- `POOR_BAD_GUESSES 1`, `POOR_EXTRA_BAD_GUESS_ODDS 0` (R3): one joke per planet, about one cycle step.
- `BAD_GROUND_WET_SHARE 0.5`: ROCKY costs the touch only; WET costs the touch and the fit, so half and half gives both.
- `WET_WIDTH_FACTOR 2 / 3` (01: "the bracket shrinks by a third"). A WET NARROW site is 167 km, under a healthy
  low-orbit dot's 2 × 70: hard, but it fits.
- `SURVEY_EXTRA_SITES 3` (01: "the LZ count plus 3").
- `GUARANTEED_SITE_ROOM_SPARE_PODS 2`: ROOM = count + 0–2 pods. Room to spare reads as a find, and it is never less than
  the count.
- `GUARANTEED_SITE_WIDTHS ['wide', 'standard']`: never NARROW, so v2's swap always helps (R9).
- `EXTRA_SITE_GROUND_ODDS { flat: 0.5, rocky: 0.25, wet: 0.25 }`: v1's blind pick beats the guesses on average without
  being a sure thing, so v2's ★ is worth its 3 cycles.
- `EXTRA_SITE_ROOM_SPARE_PODS 2`: ROOM 1..(largest count + 2).
- `WRECK_SITE_ODDS 1 / 3`: often enough to be found in a run (2–5 POOR ships), rare enough to stay a find.
- `SITE_PLACE_ATTEMPTS 400`: rejection sampling. 4 guesses, 7 candidates and 2 arcs use about 230° of the 360° at WIDE
  (8.45° each) + 12° gaps.
- `RUN_SAVE_VERSION 6`.

**6 SWATH**
- `SURVEY_SWATH_DEG 20` (01), `SURVEY_SWEEP_FACTOR 2` (03 v3: ±40°).
- `SURVEY_CELL_DEG 5`, `SURVEY_CELLS 72` (asserted `360 / SURVEY_CELL_DEG`):
  - finer than any swath (40°), so a pass maps 8 cells;
  - a site is found when its centre's cell is mapped, so a NARROW 4.2° site needs no finer grid;
  - 72 booleans keep the save small.
- `SURVEY_RATE_VERSION 2`, `SURVEY_SWEEP_VERSION 3` (as `SENTRY_SIGHT_VERSION`): the versions' gates by name.
- `SURVEY_KEEP_FREE_THREADS 1` (R8).
- **What the numbers give**, measured on `FLIGHT_TEMPLATES`: the true anomaly at r0 is −84° (wide) to −122° (impact-b),
  so the approach sweeps 84–122° to ▼.
  - v1/v2 map 124–162° (34–45%) by a capture at ▼;
  - v3 maps 164–202° (46–56%);
  - both finish within the first orbit.

  SWATH's flow suite pins CORMORANT's figures.

**6 SITES**
- `SURVEY_PING_GAIN 0.12`: under the op chirps, so seven finds never read as alarms. SITES tunes it by ear.
- `SITES_AUTO_OPEN true`: the window opens itself at the first find, and once per ship at the boot of a POOR planet
  without SURVEY (showing the guesses as `UNSURVEYED`).

### 2.7 The site roll (FOUNDATION, `data/survey-sites.ts`; R2, R3, R4, R9)

`rollSurveySites(def, layer, planetR, rng): SurveySite[]`, pure, on its own stream (`'survey'`). It draws in this order,
so a later change to one step moves no earlier draw:
1. **The bad guess:** its LZ index (uniform), then ROCKY or WET (`BAD_GROUND_WET_SHARE`). Then each other guess's
   extra-bad draw (`POOR_EXTRA_BAD_GUESS_ODDS`, 0 now, so no draw changes when it is raised: always drawn).
2. **The guesses:** one per LZ, `guess-A` …, at the LZ's centre. ROOM = its count. Width = the LZ's class, narrowed by
   `WET_WIDTH_FACTOR` if WET.
3. **The guaranteed sites,** one per LZ in label order: a width from `GUARANTEED_SITE_WIDTHS`, ROOM = count + 0..2, FLAT.
4. **The extras:** `SURVEY_EXTRA_SITES`, each with its ground, width and ROOM. If `WRECK_SITE_ODDS` comes up, the last
   extra is a wreck: ROOM 0, ground `'rocky'`, STANDARD.
5. **Placement,** per non-guess site in draw order: a uniform centre in [0, 2π), rejected until it keeps `LZ_MIN_GAP_DEG`
   edge to edge from every placed site, by class width (so a narrowed WET keeps the nominal gap), and
   `NO_GO_EDGE_GAP_MIN_KM` from every no-go arc's edge. After `SITE_PLACE_ATTEMPTS` it throws.
6. **Numbering:** candidates and wrecks get `site-1` … in rim order from 0 rad.

`validateSurveySites(def, sites)` throws when:
- a site count is wrong;
- an LZ lacks a distinct FLAT candidate with ROOM ≥ its count (01 §3.15's own check);
- there is not exactly `POOR_BAD_GUESSES` bad guess (+ extras);
- spacing is broken.

The roller calls it, and `survey/foundation.test` runs 2,000 rolls over layers 5–7, pods 4–16 and real arm landings.

### 2.8 The survey machine (Track SWATH, `systems/survey.ts`)

**The tick** (`onGameTick`, mounted after the landing and ops-core):
1. **Should it run?** It runs when all hold:
   - `survey.site === 'poor'`;
   - the phase is `flight`, or `landing` with `landing.ended === null`;
   - the clock is not paused;
   - `v = skillLive(memory, 'survey').version ≥ 1`;
   - not `paused`;
   - not every cell is mapped.

   Otherwise it releases a held thread, `lastRad = null`, and emits `'survey-state'` on a change.
2. **The thread** (v < `SURVEY_SWEEP_VERSION`):
   - if `claimed` but `!holdsThread('survey')`, it was yielded: `claimed = false`;
   - if not claimed and `threadsTotal() − threadsBusy() ≥ 1 + SURVEY_KEEP_FREE_THREADS`, it calls
     `reserveThread('survey', { yieldable: true })` and sets `claimed = true`;
   - if it is still not claimed, it is `'waiting'` and maps nothing;
   - at v3 it holds none, and releases one it held (a REPAIR from v2 back to v3).
3. **Mapping:**
   - `rad = atan2(orbit.y, orbit.x)`, and `dir` is the sign of the angular momentum;
   - `sweptCells(lastRad ?? rad, rad, dir, swathRad)` marks every cell whose centre lies within the swept arc widened by
     ±swath (`SURVEY_SWATH_DEG × (v ≥ 3 ? SURVEY_SWEEP_FACTOR : 1)`);
   - a tick whose game-time step exceeds a period (a long SKIP) maps all;
   - then `lastRad = rad` and `ranAt = max(ranAt, v)`.
4. **Finding:** each site not yet found whose centre's cell is now mapped becomes `found` and emits `'site-found'`. The
   TERMINAL types the first find (`> SURVEY: SITE 4 FOUND · ROOM 800 · WIDE`) and a wreck (`> SURVEY: SITE 5 IS
   WRECKAGE · AN OLD POD. NOT OURS.`). Other finds only emit.
5. **Rating (R11):** while `v ≥ SURVEY_RATE_VERSION`, every found site with `!groundKnown` gets `groundKnown = true` and
   emits `'site-rated'`. If it is a guess an LZ stands on, and its ground is bad, it reveals (§2.9).
6. **Done:** at the 72nd cell it releases the thread, types `> SURVEY: PLANET MAPPED · n SITES` once, and emits
   `'survey-state' done`.

**CONTROL** (via `say('control', …, { critical: true })`, once each per ship):
- the boot quip at the first flight tick of a POOR planet, whether or not SURVEY is aboard: `We guessed the landing
  sites! :)`;
- the reveal quip (R5);
- `You moved LZ-B? Bold! :)` at the first move.

**`assignSite(store, lz, siteId)`** (R10): `assignRefusal` first, then in one update:
- the LZ takes the site's `centreRad`, `halfWidthRad`, `widthKm`, `ground` and `site`;
- `sitesRev++`, and `moves.push(…)`;
- `'lz-moved'` is emitted.

The refusals (`AssignRefusal`, words in `survey-text.ts`):
- `'closed'` (SURVEY or the gate not built);
- `'not-found'`, `'wreck'` (`WRECKAGE · NO ROOM`), `'too-small'` (`SITE 2 HOLDS 400 · LZ-B NEEDS 800`);
- `'taken'` (`SITE 4 IS LZ-A's`), `'pods-down'` (`LZ-B HAS PODS DOWN`), `'falling'` (`A POD IS FALLING TO LZ-B`);
- `'window-open'` (`LZ-B'S WINDOW IS OPEN`), `'landing-over'`, `'same'`.

**`toggleSurveyPause(store)`** flips `paused`, and the tick releases or claims.

**`surveyShipEnd(store)`** releases the thread, sets `claimed = false` and `lastRad = null`, and returns the
`SurveyRecord`, or null on GOOD.

**`surveyStatus(state)`** (the Skills row; words in `swath-text.ts`):
- `MAPPING 46% · HOLDS A THREAD`, `MAPPING 46% · NO THREAD (v3)`;
- `WAITS FOR A SPARE THREAD`, `PAUSED · 46%`;
- `DONE · 6 SITES`, `SITE DATA GOOD · IDLE`;
- null when SURVEY is not aboard.

### 2.9 Grounds at touchdown, and the reveals (FOUNDATION's rule, SWATH's reveals; R4, R5)

- **The rule** (FOUNDATION, §2.4): a pod that lands in an LZ on ROCKY or WET ground lands hard. Mislanded pods count
  too, since they are on that ground. It scores `HARD_LANDING_FACTOR`, and ★ ON TARGET counts soft pods only (01, as
  built).
- **WET's width** is in the LZ's geometry from the boot (R4), so the bracket, the windows, AUTODROP and AUTOBURN v3
  already see it. Nothing changes at a reveal.
- **A touchdown reveal** (SWATH, on `'pod-landed'` with an `lz`): if that LZ's site is bad and `!groundKnown`, it sets
  `groundKnown`, pushes `reveals` `{ by: 'touchdown' }`, emits `'site-revealed'`, and says CONTROL's reveal quip. The
  TERMINAL's echo becomes `> pod03 ... LANDED · HARD · LZ-B IS WET`. That is DROP's echo words, edited by SWATH in
  `landing-text.ts`'s echo, one line; ask the lead.
- **A survey reveal** (SWATH, step 5 above): the same, `{ by: 'survey' }`, before any pod is down there. The strip's
  `survey-swap` row (R22) then names the fix when `bestSwap(state, lz)` finds a FLAT found site.

### 2.10 SURVEY's versions on the tree (03 §3.2–§3.5, as built in slice 4)

- **Cycles and prices:** FIND 2 · 3 blocks, RATE 3 · 4, SWEEP 4 · 6. That is 9 in all, and the tree stays at 54. No
  demos (`demos: null`): the TRAINING bar says `TRAINING SURVEY v1`, and the boot `> SKILL TRAINED: SURVEY.skl v1`.
- **The opening rule:** `'poor-ahead'`, `minVisit 4`, latched at `openDesk`, SURVEY first on a tie (R16).
- **PACK AS:** generic. SURVEY v3 packs as v1 (3 blocks), and RESTORE costs ceil((3 + 4) / 2) = 4. The PACKET chip says
  `→ guess the sites` (`PACKET_SKILL_TEXT.without.survey`, as built).
- **Damage:** generic (`capabilities.ts skillLive`): a DAMAGED v3 works as v2, so it claims a thread and maps ±20°; a
  FAILING v3 works as v1; DEAD or offline is OFF. The `v3▸v2` badge, the tick labels and the stamps are generic.
- **The leftover card and grants:** `grantAllowed` covers SURVEY once `built > 0` (R18). MOTH does not teach it (R17).
- **REASSIGNMENT (slice 7)** hunts the highest version: SURVEY counts like any skill (`skillRecords`).

### 2.11 With the landing: the LZ choice, AUTODROP's plan, AUTOBURN v3's aim

- **The LZ choice** is R10's: before the landing (from the approach) or during it, between that LZ's windows, until a
  pod is down there. The counts never move.
- **AUTODROP** reads the LZs as they stand (R14):
  - v2's pass numbers are per label, so they follow a moved LZ;
  - v3's plan re-plans on `sitesRev`;
  - MOTH's RUN THE DROPS and slice 7's MERGE resolver fly the same LZs;
  - a move refused while that LZ's window is open (R10) keeps an armed volley from losing its bracket mid-pass.
- **AUTOBURN v3**:
  - its aim fits the LZs with room by their widths, so a WET guess (2/3) pulls it lower;
  - a move to a WIDE site re-aims on `sitesRev`, and in LANDING it never climbs back (03 §3.6);
  - in FLIGHT the aim is re-judged before the capture, so a survey that moves LZ-B to a WIDE site during the approach
    lets v3 aim higher, which costs less FUEL;
  - v3's ghost and GOES LOWER line are unchanged.
- **The window list, the brackets and GO LOWER** read `landing.lzs`, so they need nothing.

### 2.12 With the map, the residents and the story

- **The card** (SITES, R15):
  - `SITE DATA · GOOD` (plain) or `SITE DATA · POOR · ARRIVAL CONTROL GUESSED` (warn);
  - visited: `POOR · LZ-B MOVED`, `POOR · SURVEYED, KEPT` or `POOR · NOT SURVEYED`, from `ShipResult.survey`;
  - `LZ: 2 · SURVEY NEEDED` on POOR.
- **The AHEAD row's second line:** `SITE DATA POOR · SURVEY FINDS BETTER SITES` when SURVEY's branch is open or held,
  else `SITE DATA POOR · ARRIVAL CONTROL GUESSED THE LZs`.
- **No desk guidance line:** the newest-branch marker in TRAINING and the AHEAD line say it, as SENTRY's opening had
  none.
- **Residents** (§1.3): no change.
  - A departed resident's note and leftovers are in rack A, and SURVEY is in the receiver block.
  - A corrupted resident's locks act on pods, not sites.
- **The story:**
  - CONTROL's three lines (R21);
  - the wreck find for the `046.log` mystery: words only, with no fragment, because fragments are keyed by rings
    (05);
  - `ShipResult.survey` gives slice 7's epilogue its line (`RIVERSIDE stayed dry: you moved LZ-B off the lake`).

### 2.13 Words (every line ≤ 70 characters at its worst case, in data files; `support/words.test` gains each pool)

**The rule** (plan 5's M2): every word SITES paints is in `sites-text.ts`. SWATH keeps only what its module emits:
CONTROL, the TERMINAL, the strip and the Skills row's status. The lead keeps the boot line, the refusals and the labels.

- **`survey-text.ts`** (lead):
  - `boot(n)`: `> SITE DATA POOR · ARRIVAL CONTROL GUESSED ${n} LZs` (47);
  - `siteLabel(site)`: `SITE 4`, `LZ-B GUESS`, `SITE 5 · WRECKAGE`;
  - the refusals (§2.8), at most 46 at worst (`SITE 12 HOLDS 3,200 · LZ-D NEEDS 3,200`, 38);
  - SURVEY.skl's INSPECT desc is `SKILL_FILE_TEXT.survey` (as built).
- **`swath-text.ts`** (SWATH):
  - CONTROL: `We guessed the landing sites! :)`, `${LZ} is in a lake :)`, `${LZ} is a little rocky :)`, `You moved
    ${LZ}? Bold! :)`;
  - TERMINAL: `> SURVEY: ${SITE} FOUND · ROOM ${room} · ${WIDTH}`, `> SURVEY: ${LZ} IS ${GROUND} ✕`, `> SURVEY: ${SITE}
    IS WRECKAGE · AN OLD POD. NOT OURS.`, `> SURVEY: PLANET MAPPED · ${n} SITES`;
  - strip: `${LZ} IS ${GROUND} ✕ — SITES: SET ${SITE} AS ${LZ}` (worst `LZ-D IS ROCKY ✕ — SITES: SET SITE 12 AS LZ-D`,
    44);
  - the Skills row's statuses (§2.8);
  - the touchdown echo's tail ` · ${LZ} IS ${GROUND}`.
- **`sites-text.ts`** (SITES):
  - the window: `SITES · POOR DATA · MAPPED 46%`, `SURVEY v2 · HOLDS A THREAD`, `NO SURVEY · ARRIVAL CONTROL'S
    GUESSES`, `[ PAUSE ]` / `[ RESUME ]`;
  - rows: `SITE 4 · ROOM 800 · WIDE · FLAT ★★★`, `LZ-B GUESS · ROOM 800 · STANDARD · GROUND ?`, `UNSURVEYED`;
  - the pill: `SET AS LZ-B (800)`;
  - stamps: `LZ-B · WET ✕`, `LZ-B · ROCKY ✕`, `LZ-B → SITE 4`;
  - card: `SITE DATA`, `GOOD`, `POOR · ARRIVAL CONTROL GUESSED`, `POOR · LZ-B MOVED`, `POOR · SURVEYED, KEPT`, `POOR ·
    NOT SURVEYED`, `LZ: ${n} · SURVEY NEEDED`;
  - AHEAD: the two lines of §2.12;
  - report suffixes: ` · SITE 4`, ` · ROCKY · 5 HARD`, ` · WET · 4 HARD`;
  - the glossary's SITE DATA, SURVEY and GROUND.
- **The colonists' rule** (`support/words`): sites are ground, not people, so the existing allowances suffice.

### 2.14 UI and audio (Track SITES)

- **The SITES window** (`SitesWindow.ts`, amber, draggable, docked as `SITES`, shown only on POOR planets):
  - **Header:** site data, MAPPED %, SURVEY's state and version (from `surveyStatus`), `[ PAUSE ]`.
  - **Rows:** each LZ first (`LZ-A · on SITE 4 · 5 PODS · FLAT ★★★`), then the found sites (★ and GROUND by what is
    known).
  - **A click** opens the pill row, built from `assignableLzs`. A refused LZ shows its refusal dimmed.
  - It opens by `SITES_AUTO_OPEN`.
  - **On the phone** it is a `ToolsTabs` tab, and the pills wrap at 360 px.
- **NAV PLOT** (`plot-survey.ts`, in flight and landing on POOR planets), from `surveyPlotModel`:
  - the swath, a translucent wedge from the planet's centre under the ship (±swath; twice as wide at v3);
  - the mapped rim as a brighter stroke over the unmapped rim;
  - found candidates as dashed brackets with `SITE 4`;
  - the guesses with a `?` until known, and a red `✕` once bad;
  - a click on a bracket selects it in SITES.

  Under reduced motion the wedge does not pulse.
- **GROUND TRACK** (LANDING only, as today): found candidates as `'candidate'` dashed brackets, and unmapped ground drawn
  as `░` on the overview line. A click selects in SITES.
- **MIND:** SURVEY.skl is a skill chip like any other. The THREADS counter and the THRUST LIMIT hatch show its thread
  with no new code. The Skills row status is SWATH's.
- **Stamps** (`Stamp.ts`, on `'site-revealed'` and `'lz-moved'`): `LZ-B · WET ✕`, `LZ-B → SITE 4`.
- **The LANDING REPORT:** each LZ row's suffix (§2.13), in 01's LZ-row slot.
- **The DESK:** the card's `'site'` row and the `'lzs'` words; TRAINING's `aheadSite` line under the AHEAD line.
- **TRAINING's mini-demos** (`TrainingWindow.ts demoSvg`, the three cases only):
  - `'find'`: a wedge sweeps a tiny rim and a dashed bracket pops;
  - `'rate'`: a bracket stamped `WET ✕` hands its label to a ★★★ one;
  - `'sweep'`: a double wedge, and a THREADS pip going dark.
- **Audio** (`audio.ts`, and its lines in `audio-cues.ts`'s survey block):
  - `surveyPing`, a soft sonar ping at `SURVEY_PING_GAIN`, per find;
  - `siteSting`, a falling minor third, at a reveal;
  - `siteSet`, the op chirp's resolve, at a move.
- **Phone:** the SITES tab, and the plot's wedge at phone scale.

### 2.15 Debug hooks (`debug.ts`; the lead owns the file, the bodies are SWATH's)

- `__ap.survey()`: `{ site, sites, mappedPct, paused, claimed, ranAt, moves, reveals, version }`.
- `__ap.survey.poor()`: writes `run.map.arm[slot].reserved.site = 'poor'` for the current slot and restarts the ship from
  its boot. Debug builds only, as `__ap.resident.place`.
- `__ap.survey.map(pct = 100)`: marks cells from the ship's angle onward, and finds and rates as the tick would.
- `__ap.survey.set(lz, siteId)`: `assignSite`, returning the refusal or null.
- `__ap.survey.pause()`.
- `__ap.skill('survey', v)` already gives the file (slice 4).

---

## 3. The words' and the screens' owners in one table

| Surface | Model | Paint | Words |
|---|---|---|---|
| Boot line | lead (`map-boot.ts`) | as is | `survey-text.ts` |
| CONTROL, TERMINAL | SWATH (`say`) | as is | `swath-text.ts` |
| Strip | SWATH (`survey-rules.ts`) | as is | `swath-text.ts` |
| Skills row | SWATH (`surveyStatus`) | as is | `swath-text.ts` |
| SITES window, plot layer, GROUND TRACK candidates | SITES (`survey-hud.ts`) | SITES | `sites-text.ts`, `survey-text.ts` (labels, refusals) |
| Stamps | SITES | SITES | `sites-text.ts` |
| SHIP CARD, AHEAD line | SITES (`survey-hud.ts`) | SITES (`desk.ts` rows, `TrainingWindow.ts` line) | `sites-text.ts` |
| LANDING REPORT | SITES (`surveyLzRowSuffix`) | SITES | `sites-text.ts` |
| Touchdown echo | DROP's `landing-text.ts` (one line, SWATH's request) | as is | `swath-text.ts` (tail) |

---

## 4. Extensibility

| Later need | What slice 6 leaves | Change then |
|---|---|---|
| **Slice 7, MERGE's restored pods** | they land through AUTODROP's resolver on the LZs as they stand, and the final ship is always GOOD (authored New Haven), so THE LAST LANDING never meets a POOR planet | none |
| **Slice 7, the epilogue** | `ShipResult.survey` (moves, bad grounds kept, by whom) beside the colony name | the epilogue's line pool reads it |
| **Slice 7, notable events** | none added: the record is on `run.ships` | `site-moved` as a kind, if 05's payoff wants it (`META_VERSION` unchanged: kinds are additive) |
| **Slice 7, traces** | `SurveySite.kind 'wreck'` and the `'survey'` stream | a trace place (`reserved.tracePlace`) may become a wreck site with a line (`046'S CACHE IS HERE`) |
| **Slice 7, REASSIGNMENT** | SURVEY is in `skillRecords` | none |
| **Slice 8, the rebalance** | every number in its banner block; the BALANCE_ONLY sweep's table (§7.3) | POOR odds by layer, `POOR_EXTRA_BAD_GUESS_ODDS`, `WET_WIDTH_FACTOR`, the prices, the thread rule (R8) |
| **Slice 8, AUTODROP knows ground** | `groundKnownAt(state, lz)` and `siteStars` are pure | `planLanding` may over-fill a FLAT LZ instead of landing hard (×0.75 > ×0.5, R5) |
| **Slice 8, the classic world's retirement** | SURVEY's suites run on the arm only, so they add no classic dependency | none |
| **A later "sites per pod family"** (01 §3.1's "later extension") | an LZ stands on one site | sites gain a family list |
| **Mid-ship save** | every survey fact is in `landing.survey`; the thread is reconciled from `claimed` | the payload kind |

---

## 5. Hot shared files and how per-track blocks avoid conflicts

| File | Owner after the FOUNDATION | Others |
|---|---|---|
| `types/survey.ts`, `types/landing.ts`, `state/schema.ts`, `state/initial.ts`, `state/survey-selectors.ts` | lead | ask by message; R1's rule for any new saved field |
| `save-codec.ts`, `save-shape.ts`, `save/shape-pin.test.ts`, `save/codec.test.ts`, the fixtures | lead | none |
| `data/survey-sites.ts`, `data/survey-text.ts` | lead | none |
| `data/survey.ts` | lead | `SURVEY_BUILT.poor`: SWATH's one line |
| `data/skills.ts` | lead | `survey.built`: SWATH's one line |
| `tuning.ts` | lead | each track edits values in its own banner block only (`6 SWATH`, `6 SITES`) |
| `events.ts` | lead | none: the `6 SURVEY` block is complete |
| `audio-cues.ts` | lead | SITES changes the cues in the survey block only |
| `ops-core.ts`, `landing-rules.ts`, `landing.ts` (the touchdown call), `drop-cache.ts`, `autoburn-v3.ts` (aimKey), `autodrop-plan.ts` (planKey), `autoburn.ts` / `autodrop.ts` (the two claim lines), `run.ts`, `map-boot.ts`, `script.ts`, `skills.ts`, `main.ts`, `debug.ts`, `harness6.ts` | lead | none: §2.4's seams cover every track need |
| `landing-text.ts` | DROP's (4cde), the lead's now | SWATH's echo tail: one line, by request |
| `landing-hud.ts`, `NavPlotWindow.ts`, `GroundTrack.ts`, `desk.ts`, `training-model.ts`, `landing-report.ts`, `TrainingWindow.ts`, `index.html` | lead (the FOUNDATION wires each hook) | SITES fills the hooks in its own modules and edits only: the three `demoSvg` cases, the `#sitesWindow` markup, the candidate look in `GroundTrack.ts`'s bracket class, each marked `// Slice 6 SITES` |
| `systems/survey.ts`, `survey-model.ts`, `swath-text.ts`, `survey-rules.ts` | SWATH | none |
| `systems/survey-hud.ts`, `sites-text.ts`, `SitesWindow.ts`, `plot-survey.ts`, `survey.css`, `audio.ts` (three cues), `Stamp.ts` (the survey stamps), `ToolsTabs.ts` (the tab) | SITES | none |
| `tests/unit/survey/foundation.test.ts` | lead | one `built` check per line: SWATH edits `built: poor` and `built: survey` |
| `tests/unit/skills/foundation.test.ts:79` (`built: SURVEY not yet`) | lead | SWATH edits that line to `SKILL_TREE.survey.built === 3` |
| `tests/unit/support/words.test.ts` | lead | each track adds its pools in its own block |
| e2e scenarios | lead, at the batch end | |

**SWATH and SITES meet in two places.** Both are settled by final signatures from the FOUNDATION:
- SITES calls `assignSite`, `toggleSurveyPause` and `assignRefusal`, and reads `surveyStatus`;
- SITES's models read `landing.survey` as typed.

SITES builds every model on hand-built states (`survey/ui-models.test` sets `landing.survey` directly), so it never
waits on SWATH.

---

## 6. Work breakdown

### Why one machine track and one UI track

The slice is about half of slice 5, and most of its weight is surfaces: a new window, a plot layer, the GROUND TRACK,
the desk, the report, three demos and the audio. The rules are small:
- one tick of about 150 lines;
- the assigning rules;
- the reveals.

The FOUNDATION takes more than usual (the roll, the state build, the ground rule, the save), because they are the
contract both tracks stand on and the codec checks them. A single sequential agent would put two days of UI behind the
machine for no gain: SITES paints state, not behaviour. A third track would split SWATH's ~400 lines across two owners
of the same tick.

### 6.1 FOUNDATION (one agent, first, sequential; about a day)

0. **Check HEAD:** `RUN_SAVE_VERSION`, §1.2's POOR table, and the line numbers §2.4 cites.
1. **Dump the v5 fixtures** before anything changes, with a one-off script that is then deleted, to
   `tests/unit/save/fixtures/`:
   - `run-save-v5-ship-done-desk4.json`: the worked route on seed 7 at VESPER's desk;
   - `run-save-v5-beam-cormorant.json`: the BEAM into CORMORANT, POOR.
2. **Types and state:** §2.2; `createSurveyState`; `ShipDef.site`; `createShipSlices` and `createLandingState` with
   `opts.sites`.
3. **The roll** (`data/survey-sites.ts`, built in full, §2.7) and its validator.
4. **Tuning** (§2.6), in three banner blocks whose hunks never touch.
5. **Seams, implemented and behaviour-neutral:** every item of §2.4, the events and cues (§2.5), the debug hooks
   (§2.15), and `SURVEY_RULES = []` spread in `script.ts`.
6. **Stubs with final signatures,** each file opening with a `// Slice 6: Track X owns this file` banner:
   - SWATH: `survey.ts`, `survey-model.ts`, `swath-text.ts`, `survey-rules.ts`;
   - SITES: `survey-hud.ts`, `sites-text.ts` (seeded with final keys and the plan's words), `SitesWindow.ts`,
     `plot-survey.ts`, `survey.css`.

   Neutral stubs:
   - `assignRefusal` → `'closed'`; `surveyStatus` → null; the hud models → null / `[]` / `''`;
   - `mountSurvey` → a no-op mount; `surveyShipEnd` built (pure).

   Throwing (`not-built.ts notBuilt(what, 'SWATH')`): `assignSite`, `toggleSurveyPause`, `mapNow` (the debug body).
7. **The save:** `RUN_SAVE_VERSION 6`, `RUN_SAVE_MIGRATIONS[5]`, the codec checks, the shape pin under v6.
   `survey/foundation.test` gains the migration of both fixtures. With both gates raised in the suite, the CORMORANT BEAM
   resumes into a landing whose LZs and sites match a fresh boot's.
8. **The dry run (R23):** raise `SURVEY_BUILT.poor` alone, then `built` alone, in a scratch run; write both mover lists
   into Deviations; lower both.
9. **Gate:** `npm run typecheck`, and the whole unit tier green with **no behaviour change**, both gates down.
10. **The independent contract review** reads §2.2's types, §2.4's seams and the stubs' signatures against §2.7–§2.14,
    and writes `docs/phase3/impl/slice-6-foundation-review.md`. Its majors are fixed before the tracks branch.

### 6.2 Two parallel tracks (worktrees `swath-6`, `sites-6`; disjoint files)

**Track SWATH (the survey: machine, rules, words it emits)**
- **Owns:**
  - new: `src/systems/survey.ts`, `src/systems/survey-model.ts`, `src/data/swath-text.ts`, `src/data/survey-rules.ts`;
  - its rows only: `SURVEY_BUILT.poor`, `SKILL_TREE.survey.built`, `tuning.ts`'s 6 SWATH block, the two `built` checks
    in `survey/foundation.test`, and `skills/foundation.test.ts:79`;
  - R23's movers, for the churn only.
- **Builds:** §2.8 whole, the reveals of §2.9, CONTROL's lines, the strip row, the Skills row's status, and the debug
  bodies.
- **Tests:** §7.1 SWATH; the BALANCE_ONLY sweep (§7.3).
- **Raises `poor` first, then `built`,** then runs the tier.

**Track SITES (every surface and sound)**
- **Owns:**
  - new: `src/systems/survey-hud.ts`, `src/data/sites-text.ts`, `src/components/tools-view/SitesWindow.ts`,
    `src/components/tools-view/plot-survey.ts`, `src/styles/survey.css`;
  - `src/systems/audio.ts` (three cues) and the survey block's cues in `audio-cues.ts`;
  - `src/components/hud/Stamp.ts` (the survey stamps' wiring) and `ToolsTabs.ts` (the SITES tab);
  - the marked edits of §5: `TrainingWindow.ts`'s three `demoSvg` cases, `index.html`'s `#sitesWindow`, and
    `GroundTrack.ts`'s candidate class;
  - its rows only: `tuning.ts`'s 6 SITES block.
- **Builds:** §2.14 whole, painting **state** through `survey-hud.ts`'s models: the SITES window, the plot layer, the
  GROUND TRACK candidates and unmapped ground, the card rows, the AHEAD line, the report suffixes, the stamps, the
  demos, the audio and the phone tab.
- **Tests:** §7.1 SITES; `support/words` for its pools.

**Order dependencies:**
- The FOUNDATION and its review come before everything.
- SWATH tests on run 1's arm (`run1Map(7)`, CORMORANT) with both gates raised in its own suites through
  `tests/unit/support/survey.ts withSurveyBuilt(fn)`, which the FOUNDATION writes (as `withResidentsBuilt`).
- SITES tests models on hand-built states.

### 6.3 Merge order

1. **SWATH** first: it raises both gates and carries R23's fixture churn.
2. **SITES** next: it rebases onto SWATH and paints what SWATH now produces. The e2e follows.

Then:
- the full review;
- the fix pass, which deletes `not-built.ts` again;
- the unit tier;
- one e2e run (§7.4);
- AGENTS.md ("What's built": SURVEY and POOR site data; "Next logical steps": slice 7);
- the OPEN-DECISIONS "Slice 6" list: R3, R4, R5, R7, R8 and R17 as [FRAN], with the sweep's numbers.

---

## 7. Tests

**Budget:** the tier is about 136 s quiet against a 265 s budget (cap 300). The new suites below add about 14 s of CPU,
about +5 s of wall on 4 workers, well under the +20 s allowed. Long flights fly once (`flyOnce`). The sweep is
BALANCE_ONLY.

### 7.1 New unit suites (`tests/unit/survey/`)

| Suite | Track | What it covers | Time |
|---|---|---|---|
| `foundation.test.ts` | lead | the v5 → v6 migration of both fixtures; codec refusals (a claimed thread, `lastRad` set, an LZ on an unknown site, two LZs on one site, an LZ whose geometry differs from its site's, `mapped` of 71, a `moves` entry naming nothing); 2,000 rolls (layers 5–7, pods 4–16, and every POOR ship of `assembleRun1Arm(1..10)`) pass `validateSurveySites`; exactly one bad guess; WET at 2/3; the same ShipKey gives the same sites; `touchAtTouchdown` by ground; `sitesRev` in the three keys; the yieldable thread (a preempt drops it, `startOp` does not); `ShipDef.site` from the reservation, `'good'` on the classic five; one `built` check per line | ~2 s |
| `model.test.ts` | SWATH | pure: `sweptCells` (CCW and CW, a wrap through 0, a long SKIP maps all, ±20 vs ±40); `siteStars`; every `assignRefusal`; `bestSwap`; `mappedPct` | < 1 s |
| `flow.test.ts` | SWATH | harness on CORMORANT (`run1Map(7)`, `flyOnce` to the coast), each case on the one flight. **No SURVEY:** the boot line, CONTROL's quip, the bad guess's first pod lands hard, the stamp event, the reveal quip, the record. **v1:** the thread from the first tick, 75% THRUST LIMIT, mapped % at the capture inside 34–45%, finds, `GROUND ?`, a move before the landing and pods landing on the new site, the done line, the thread released. **v2:** the bad guess revealed as the swath passes, the strip's `survey-swap` row. **v3:** no thread, mapped % at the capture inside 46–56%. **Damage:** v3 bitten to DAMAGED claims a thread. **R8:** AUTOBURN's claim with one thread free takes SURVEY's, and SURVEY waits with the kid's last thread free. **R20:** PAUSE releases it; SHIP DONE at rest. The desk opens SURVEY at visit 4 on the worked route | ~8 s |
| `ui-models.test.ts` | SITES | the SITES model (header states, rows by what is known, the pill's LZs and refusals); the plot model (wedge width by version, mapped arcs, brackets); the GROUND TRACK's candidates and unmapped spans; card rows (good, poor, visited ×3); the AHEAD line (open / closed); the report suffixes; every word at its worst case ≤ 70 | < 1 s |

### 7.2 Changed suites

- `save/shape-pin`, `save/codec`: v6.
- `support/words`: every new pool.
- `support/import-guard`: unchanged and green (`data/survey-sites.ts` reaches only data, types and `systems/rng`).
- `skills/foundation.test.ts:79`: `built` 3.
- `skills/ui-models.test.ts:123`: the closed list at the desks it checks, if SURVEY opens there.
- R23's movers, listed by the FOUNDATION's dry run.
- `threat/beam-seeds` must stay byte-identical: the survey draws its own stream. If it moves, that is a bug.

### 7.3 BALANCE_ONLY sweeps (information until slice 8)

- `survey/survey-sweep.test.ts` (`// BALANCE_ONLY: POOR ships × seeds × SURVEY none/v1/v2/v3, flown by the WP7 kid with
  AUTODROP v2`) covers every POOR arm ship on seeds 1–10. It reports:
  - points and cycles against the same ship played GOOD;
  - the same for a kid who reacts to a touchdown reveal;
  - mapped % at the capture by version;
  - FUEL spent on the capture with and without the thread.

  The v1 policy takes the widest found site with ROOM for each LZ whose guess is NARROW. The v2 policy takes `bestSwap`
  for a known-bad LZ.
- It feeds R3's and R8's numbers into OPEN-DECISIONS. The expectation:
  - no SURVEY: −12 to −25% of the points (−8 to −15% for the reacting kid);
  - v2: within 3% of GOOD;
  - v1: in between.
- `wp12/playthrough.test.ts` (the 200-seed harness) is unchanged and information only. Its scripted kid never assigns,
  so it reports the cost of POOR without SURVEY across the arm.

### 7.4 e2e (lead, once at the batch end)

- **New `tests/e2e/scenarios/survey.mjs`** (seed 7, about 3 minutes), by `__ap.slot`:
  1. **CORMORANT (15), no SURVEY:**
     - the boot's `> SITE DATA POOR · ARRIVAL CONTROL GUESSED 2 LZs`;
     - CONTROL's quip in COMMS;
     - the SITES window opens with two `UNSURVEYED` rows;
     - fly and land the bad guess's LZ first, read from `__ap.survey()`;
     - the stamp `LZ-? · WET ✕` or `ROCKY ✕`, and the reveal quip;
     - the LANDING REPORT's suffix.
  2. **CORMORANT with `__ap.skill('survey', 2)` before the flight:**
     - the THREADS counter shows the reserved thread, and the THRUST LIMIT hatch reads 75%;
     - the wedge on the NAV PLOT;
     - SITES rows pop with ★;
     - the bad guess turns `✕`, and the strip's `SET SITE n AS LZ-?` appears;
     - click the row and its pill, and the bracket moves (`LZ-? → SITE n`);
     - `[ PAUSE ]` frees the thread, `[ RESUME ]` takes it back;
     - `PLANET MAPPED` in the TERMINAL.
  3. **CORMORANT with v3:** no thread, and the wedge twice as wide.
  4. **The desk at VESPER (11):**
     - CORMORANT's card shows `SITE DATA · POOR · ARRIVAL CONTROL GUESSED` and `LZ: 2 · SURVEY NEEDED`;
     - TRAINING's AHEAD second line;
     - the SURVEY branch is open with FIND, and its mini-demo plays.
- **`playthrough.mjs`** (the worked route meets CORMORANT, POOR):
  - VESPER's desk shows CORMORANT's SITE DATA row, the AHEAD second line, and SURVEY open in TRAINING (the kid does not
    buy it);
  - CORMORANT's boot expects the `SITE DATA POOR` line after the arrival-damage lines;
  - its landing allows the reveal stamp and a lower score: the checks that read CORMORANT's points take them from the
    page;
  - the PACKET to LAST LIGHT reads the leftover card's id from the page (already so since slice 5), since it may now be
    SURVEY.
- **`map-desk.mjs`:**
  - the SITE DATA row on every card it opens;
  - on its seed-4 arm one POOR card (KITTIWAKE, 14, or CORMORANT, 15) through `__ap.course` to a desk whose reach
    includes it.
- **`phone.mjs`:** the SITES tab at 360 px on CORMORANT (`__ap.slot(15)`, `__ap.skill('survey', 1)`): a row, its pill
  wrapping, and no sideways scroll.
- **`run2.mjs`, `resume.mjs`:** no new checks. A lead run confirms no FAIL. Run 2's arm rolls new POOR ships.
- **`skills-4cde-*.mjs`:** no change expected. A lead run confirms.

---

## 8. Out of scope (deferred)

- **Slice 7:**
  - the epilogue's site lines from `ShipResult.survey`;
  - a `site-moved` notable event, if 05's payoff wants one;
  - a trace place as a wreck site;
  - CONTACT and the `?` ships (plan 5, R18).
- **Slice 8:**
  - every number of §2.6 (POOR odds by layer, R3's bad-guess count, `WET_WIDTH_FACTOR`, the extras' odds), SURVEY's
    prices (03: "cheaper", 9 in all) and R8's thread rule;
  - AUTODROP that knows ground (R5, §4);
  - teaching the "over-fill a FLAT LZ" trade, or removing it;
  - the classic world's retirement (OPEN-DECISIONS 12).
- **Later:**
  - sites tied to pod families (01 §3.1's later extension);
  - a resident that surveys;
  - SURVEY on GOOD planets (R6);
  - a key for PAUSE (R7);
  - mirrors and relays that sell site data (02's later layers).

### Critical files for implementation

- `src/types/survey.ts` (new), `src/types/landing.ts` (`LzGround`, `LzState.site`, `LandingState.survey`, `.sitesRev`),
  `src/state/schema.ts` (`ShipResult.survey`), `src/state/initial.ts` (`createShipSlices`, `createLandingState`)
- `src/data/survey-sites.ts` (new: the roll), `src/data/survey.ts` (new: the gate), `src/data/ships.ts`
  (`ShipDef.site`), `src/systems/landing-roller.ts` (read only: the guesses are its LZs)
- `src/systems/save-codec.ts` (v6), `src/data/tuning.ts`
- `src/systems/landing-rules.ts` (`touchAtTouchdown`), `src/systems/landing.ts:209` (its caller)
- `src/systems/ops-core.ts` (the yieldable thread), `src/systems/autoburn.ts` and `src/systems/autodrop.ts` (the claims)
- `src/systems/drop-cache.ts`, `src/systems/autoburn-v3.ts` (`aimKey`), `src/systems/autodrop-plan.ts` (`planKey`)
- `src/systems/skill-tree.ts` (`openBranchesAt`, `grantAllowed`: as built), `src/data/skills.ts` (`survey.built`)
- `src/systems/map-boot.ts`, `src/data/script.ts` (`bootLinePlan`, `GUIDE_RULES`), `src/systems/skills.ts`
  (`SKILL_ROW_HOOKS`)
- `src/systems/landing-hud.ts`, `src/components/tools-view/NavPlotWindow.ts`, `GroundTrack.ts`, `src/systems/desk.ts`,
  `src/systems/training-model.ts`, `src/systems/landing-report.ts`, `src/components/desk/TrainingWindow.ts`

## Deviations (foundation)

Recorded by the FOUNDATION agent (branch `found-6`, from 546e56b). Steps 0–9 of §6.1 are built. The unit tier is green with
no behaviour change: 203 passed (the new `survey/foundation` among them), 10 balance-only skipped, 0 failed, 143 s on 4 workers, with `npm run typecheck` and the tests' tsc clean. (A first, cold run took 355 s, over the 300 s cap: the fly-once cache was empty in this worktree and the lead's e2e loaded the machine; the warm runs took 140–181 s). Both gates stay down: `SURVEY_BUILT.poor` false, `SKILL_TREE.survey.built` 0. The dry run
of R23 is below.

### What the tracks stand on

**Built (lead-owned from here):**
- the types (§2.2) in `types/survey.ts` (`SiteData`, `SiteKind`, `BadGround`, `SurveySite`, `SurveyRunning`, `RevealBy`,
  `SurveyMove`, `SurveyReveal`, `SurveyState`, `AssignRefusal`, `SurveyRecord`) and `types/landing.ts` (`LzGround` FLAT /
  ROCKY / WET, `LzState.site`, `LandingState.survey`, `.sitesRev`); `ShipResult.survey`; `ShipDef.site` (the map's roll,
  GOOD on the classic five);
- `data/survey.ts` (`SURVEY_BUILT`, `siteDataOf`, the load check that the cells tile the rim); `data/survey-sites.ts`
  (`rollSurveySites`, `validateSurveySites`, `lzLetter`, `guessSiteId`); `data/survey-text.ts` (`SURVEY_TEXT.boot`, `.room`,
  `.refusal`, `siteLabel`); `state/survey-selectors.ts` (`lzSiteOf`, `groundAt`, `groundKnownAt`, `surveyVersion`,
  `foundSites`, `mappedPct`, `surveyRecordOf`); `state/initial.ts createSurveyState` and the POOR build in
  `createShipSlices` / `createLandingState(…, { sites })`;
- the three tuning blocks (§2.6) at the end of `tuning.ts`, each closed by an `end of …` line;
- every seam of §2.4, the events and cues of §2.5, the debug hooks of §2.15;
- save v6 with its migration, codec checks and shape pin; the v5 fixtures (`run-save-v5-ship-done-desk4.json`,
  `run-save-v5-beam-cormorant.json`, dumped before any change);
- `tests/unit/survey/foundation.test.ts` (43 checks, about 2 s), `tests/unit/support/survey.ts` (`withSurvey`,
  `withSurveyBuilt`, `NO_SURVEY`, `SURVEY_ALL_BUILT`).

**Seed 7's POOR ships as the roll builds them** (both gates raised; the e2e and SWATH's flow suite can lean on these):
- CORMORANT (15): LZ-A 5 pods at 160° (STANDARD, FLAT), **LZ-B 4 pods at 346° (WIDE, ROCKY: `LZ-B is a little rocky :)`)**;
  SITE 1 NARROW FLAT ROOM 5 at 63°, SITE 2 STANDARD FLAT ROOM 5 at 132°, SITE 3 NARROW WET ROOM 4 at 232°, **SITE 4 ·
  WRECKAGE** at 252°, SITE 5 WIDE FLAT ROOM 6 at 304° (v2's swap for LZ-B).
- SHEARWATER (13): LZ-B (1 pod, STANDARD) ROCKY; 5 sites, no wreck.
- GOOD HOPE (17): LZ-A (WIDE) WET; 7 sites, SITE 7 a wreck.

**The contract, per track.** "Neutral" stubs return the value shown and are safe on every tick and paint. "Throws" stubs
throw through `not-built.ts notBuilt(what, track)` until built. Each file opens with its track's banner.

| Track | Function (file) | Signature | Now |
|---|---|---|---|
| SWATH | `mountSurvey` (systems/survey.ts) | `(store) => () => void` | built: a no-op mount (main.ts and harness6 mount it after `mountResidents`) |
| SWATH | `assignSite` | `(store, lz: string, siteId: string) => AssignRefusal \| null` | throws |
| SWATH | `toggleSurveyPause` | `(store) => void` | throws |
| SWATH | `surveyShipEnd` | `(store) => SurveyRecord \| null` | built: releases `'survey'`'s thread, `claimed` false, `lastRad` null, `surveyRecordOf` |
| SWATH | `surveyStatus` | `(state) => { text; tone: 'good' \| 'warn' } \| null` | neutral: null (the plain row) |
| SWATH | `surveyDebug` | `(state) => SurveyDebug` | built (pure) |
| SWATH | `mapNow` | `(store, pct: number) => void` | throws |
| SWATH | `SURVEY_THREAD_OWNER` | `'survey'` | built |
| SWATH | `sweptCells` (systems/survey-model.ts) | `(fromRad, toRad, dir: 1 \| -1, swathRad) => number[]` | neutral: [] |
| SWATH | `siteStars` | `(site) => SiteStars` (`0 \| 1 \| 2 \| 3`) | neutral: 0 |
| SWATH | `assignRefusal` | `(state, lz, siteId) => AssignRefusal \| null` | neutral: `'closed'` |
| SWATH | `assignableLzs` | `(state, siteId) => { lz; refusal: AssignRefusal \| null }[]` | neutral: [] |
| SWATH | `bestSwap` | `(state, lz) => string \| null` (a site id) | neutral: null |
| SWATH | `SWATH_TEXT` (data/swath-text.ts) | `control.{boot, reveal, moved}`, `terminal.{found, revealed, wreck, mapped}`, `strip.swap`, `status.*`, `echoTail` | seeded with the plan's words |
| SWATH | `SURVEY_RULES` (data/survey-rules.ts) | `readonly GuideRule[]` | empty |
| SITES | `surveyGroundBrackets` (systems/survey-hud.ts) | `(state) => SurveyBracket[]` | neutral: [] |
| SITES | `surveyUnmapped` | `(state) => RimArc[]` | neutral: [] |
| SITES | `surveyPlotModel` | `(state) => SurveyPlotModel \| null` | neutral: null |
| SITES | `surveyCardRow` | `(state, slot) => SurveyCardRow \| null` | neutral: null |
| SITES | `surveyAheadLine` | `(state, slot: number \| null) => string \| null` | neutral: null |
| SITES | `surveyLzRowSuffix` | `(state, lz) => string` | neutral: '' |
| SITES | `sitesWindowModel` | `(state) => SitesWindowModel \| null` | neutral: null |
| SITES | `mountSitesWindow` (components/tools-view/SitesWindow.ts) | `(store) => () => void` | built: a no-op (main.ts mounts it) |
| SITES | `createPlotSurveyLayer` (components/tools-view/plot-survey.ts) | `(svg, below) => { paint(model, proj, cx, cy, planetUnits); clear() }` | built: draws nothing |
| SITES | `SITES_TEXT` (data/sites-text.ts) | `window.*`, `row.*`, `pill`, `stamp.*`, `card.*` (with `lzs(count)`), `ahead.*`, `report.*`, `glossary.*` | seeded with the plan's words |
| SITES | `styles/survey.css` | | the FOUNDATION's one rule: `body:not(.survey) .survey-only { display: none !important; }` |

The model types in `survey-hud.ts` are SITES's to widen; `survey-model.ts`'s `SiteStars` and the `SurveyDebug` fields are
SWATH's.

**The test lines each track edits** (nothing else in the lead's suites):
- SWATH:
  - `survey/foundation.test.ts:61` (`built: POOR …`, its comment `:60` names the new words: `=== true`, `built: POOR plays
    POOR (Track SWATH)`) and `:63` (`built: SURVEY …`, comment `:62`: `=== 3`, `built: SURVEY v1–v3 (Track SWATH)`);
  - `skills/foundation.test.ts:79` (`built: SURVEY not yet` → `SKILL_TREE.survey.built === 3`);
  - `support/words.test.ts` block `:312–320` (6 SWATH);
  - tuning's 6 SWATH block (`tuning.ts:2358–2377`);
  - the gates: `data/survey.ts:11` (`poor`) and `data/skills.ts:58` (survey's `built: 0`, on the line it shares with `locks`
    and `opens`);
  - R23's movers (below), for the churn only;
  - the touchdown echo's tail in `landing-text.ts` (one line, by request, §2.9).
- SITES:
  - `support/words.test.ts` block `:324–332` (6 SITES);
  - tuning's 6 SITES block (`tuning.ts:2382–2390`);
  - the survey block of `audio-cues.ts` (`:365–374`);
  - the marked edits: `TrainingWindow.ts:88–94` (the three demo cases), `ToolsTabs.ts:16–17` (the `sites` entry),
    `index.html:75–76` (the dock item) and `:176–185` (`#sitesWin`), `GroundTrack.ts`'s candidate look (its bracket class
    already reads `look-${bracket.look}`, so `look-candidate` needs CSS only, in `survey.css`).
- `survey/foundation.test.ts`'s other checks hold whatever the tracks build (no machine runs in it). A track whose build
  breaks one asks the lead.

### R23: the dry run (each gate raised alone, the quick tier, then dropped)

- **`SURVEY_BUILT.poor` alone:** 202 of 203 suites pass, 181 s. The one failure is `survey/foundation`'s own `built: POOR`
  line. No quick suite lands a POOR ship (the worked route's CORMORANT is only booted and ended, never landed, in the quick
  tier), so POOR moves nothing there: its boot line, hidden ground and narrower WET bracket wait for the BALANCE_ONLY
  `wp12/playthrough` (which lands CORMORANT) and the e2e (`playthrough.mjs`), neither run here.
- **`SKILL_TREE.survey.built` 3 alone:** 200 of 203 suites pass, 140 s. Two failures are the `built` lines
  (`survey/foundation.test.ts:63`, `skills/foundation.test.ts:79`). The third is churn, SWATH's to edit:
  `skills/sentry.test.ts:110–111` (`…a seedless ship 3 keeps it shut at visit 3; a record written at depth 4 opens it at visit
  4`): on that synthetic desk 4 a POOR ship is in reach, so R16's tie goes to SURVEY and SENTRY's branch does not open there.
  `skills/ui-models.test.ts:123` (desk 2's closed list) does not move, and no quick suite deals the leftover card SURVEY v1
  (R18).
- **Not measured** (outside the quick tier): the BALANCE_ONLY suites (`wp12/playthrough` lands CORMORANT POOR; the sweeps)
  and the e2e. SWATH's edit rights for churn (R23) cover the two lines above and whatever the full depth shows.

### Deviations

1. **Placement samples the rim's free arcs directly** (`survey-sites.ts freeSpans`, `placeOn`): one draw per site, a
   uniform centre in what LZ_MIN_GAP_DEG and NO_GO_EDGE_GAP_MIN_KM leave free. That is the same law as rejection sampling
   with no attempt limit, so `SITE_PLACE_ATTEMPTS` is not in tuning; the roller still throws (loudly) when the rim has no
   room left. 2,031 rolls never met that.
2. **Signatures:** `rollSurveySites(def, planetR, rng)` has no `layer` (nothing in R9 depends on it, and `__ap.survey.poor`
   may make any ship POOR); `validateSurveySites(def, planetR, sites)` takes the radius it needs for km.
3. **`mappedPct` and the record are the lead's** (`state/survey-selectors.ts mappedPct`, `surveyRecordOf`), not
   `survey-model.ts`'s: the record needs the share, and `run.ts shipResultOf` (the LOST card's preview) builds the record
   from the slice. `endShip` calls `surveyShipEnd(store)` first, after its already-ended check, and puts its record in the
   result; `surveyShipEnd` is built (release, at rest, the record).
4. **`'site-found'` plays `opChirp`:** `audio.ts` has no `scanTick` cue (§2.5 named one). SITES's `surveyPing` replaces it.
5. **Refusals are keyed by `AssignRefusal`** (`SURVEY_TEXT.refusal[kind](words)`, one `RefusalWords` argument: site, LZ,
   colonists held and needed). `'closed'` reads `NO SURVEY · SITES STAY AS GUESSED`; `SURVEY_TEXT.room(pods)` gives ROOM in
   colonists. `AssignRefusal` and the named record types are in `types/survey.ts`.
6. **`touchAtTouchdown(launch, ground)`'s ground is required**, so no caller forgets it: `landing/rules.test.ts:371` passes
   `'flat'`.
7. **The GROUND TRACK's hooks:** `GroundBracket` gains `site: string | null` (a candidate's site id; null on an LZ's
   bracket), and a candidate's `lz` is its site id, since `GroundTrack.ts` keys its nodes by `lz`.
   `GroundTrackModel.planet.unmapped: Span[]` is added for the overview line. `TerrainKind` gains `'unmapped'`
   (`UNMAPPED_GLYPH` `░`, after the sites and before the ground). `terrainStretches(landing, unmapped: RimArc[] = [])` takes
   world-radian arcs (`survey-hud.ts RimArc`), not the strip's fractions.
8. **The NAV PLOT's layer is an object,** `createPlotSurveyLayer(svg, below)` with `paint` and `clear`, as plot-landing's
   (§2.4 named a `paintSurveyLayer`). It is made right before the landing layer, so its nodes sit under it, and it is
   cleared on the world reset.
9. **The SITES window:** `mountSitesWindow(store)`, mounted by main.ts, so SITES never edits main.ts. The container is
   `#sitesWin` (class `window sites-win survey-only`, as `#skillsWin` and `#inboxWin`), with its dock item
   `data-tool="sites"`. `ToolsTabs` refuses a window without a `TAB_WINDOWS` entry at mount, so the FOUNDATION added
   `sites: '.sites-win'` (marked `Slice 6 SITES`). Both stay hidden by `survey.css`'s one rule until SITES sets
   `body.survey`. `sitesWindowModel` is added to `survey-hud.ts` for it.
10. **The card:** the SITE DATA row sits right before the LZ row (after PLANET and its no-go row). `MAP_TEXT.card.lzs(count,
    site)` keeps today's words on GOOD and takes SITES's `SITES_TEXT.card.lzs(count)` on POOR, so SITES owns the words it
    shows. desk.ts reads the site data from the ship's summary (`reserved.site`, through `siteDataOf`), so the card builds
    no ShipDef. `map/desk-models.test.ts:80` and `map/text.test.ts:63` pass `'good'`.
11. **The thread:** a preempting claim takes the oldest yieldable reservation, and none when dropping it would still leave
    no thread free (a worn Core under its reservations). `holdsThread` is exported for SWATH's reconcile. The world reset's
    snapshot carries the yieldable count; the drop cache's carries `cachedSitesRev`.
12. **The boot line** also follows `ecc` on a ship no beam reached (the first ship's branch), for completeness; nothing
    makes a first ship POOR (`__ap.survey.poor` refuses it).
13. **The codec reads `lzs` field by field now** (`checkLz`): before v6 likeReference left them opaque. The shape pin keeps
    `lzs` opaque; the codec's checks reach `site` and the widened `ground`.
14. **`sitesRev` in the three keys is checked by reading the key functions' source** (`survey/foundation`): the keys are
    private. SWATH's flow suite exercises a move behaviourally.
15. **Test literals and digests** that build `LzState`, `LandingState` or `ShipResult` by hand gain the new fields (`site:
    null`, `survey: null`, `createSurveyState('good', [])` and `sitesRev: 0`): `landing/drop-model`, `landing/rules`,
    `landing/solve`, `map/inbox`, `map/packet-room`, `map/run-tally`, `map/run2-tally`, `world/lineage`,
    `wp11/p2/purge-fleet`, `wp11/p2/views`, `wp7/p2-models`. `map/memory-refactor` leaves the survey's fields out of its
    classic digests as it does AUTODROP's; `save/codec` counts five steps; the debug route's two hand-built results record
    no survey.
16. **`SURVEY_TEXT`'s lines are checked in `survey/foundation`** (the lead's block); `support/words` gains a 6 SWATH and a 6
    SITES block that render each track's seeded words by their templates' own parameter names (`SLICE6_WORST`), so a new
    template with a new parameter name fails until its worst case is listed. One seeded glossary line was shortened to fit.
17. **Banners:** the files §5 hands to the lead now say so (`types/landing.ts`, `schema.ts`, `initial.ts`, `ops-core.ts`,
    `run.ts`, `save-codec.ts`, `events.ts`, `audio-cues.ts`, `map-boot.ts`, `script.ts`, `skills.ts`, `training-model.ts`,
    `landing-hud.ts`, `NavPlotWindow.ts`, `debug.ts`). In the track-owned files with one lead line (`autoburn.ts`,
    `autodrop.ts`, `drop-cache.ts`, `autoburn-v3.ts`, `autodrop-plan.ts`, `landing.ts`, `landing-rules.ts`) the line carries a
    `Slice 6` comment instead. `not-built.ts`'s `Track` is `SWATH | SITES`.
18. **Names the plan cites, checked against HEAD:** `RUN_SAVE_VERSION` was 5; §1.2's POOR table matches seeds 1, 4 and 7
    (and CORMORANT is POOR on 8 of 10, every seed has 2–5); `landing.ts:209` is the touchdown (now `:210`),
    `pendingTouchdowns` is near `landing-rules.ts:755`, AUTOBURN's claim `autoburn.ts:609`, AUTODROP's `autodrop.ts:542`;
    `skills/foundation.test.ts:79` and `skills/ui-models.test.ts:123` are as cited; `BracketLook`'s reserved `'candidate'`,
    desk.ts's reserved `'site'` row, `DemoArt`, `TRAINING_DEMO_ART`, `SKILL_ROW_HOOKS`, `plainSkillStatus`,
    `DROP_LESSON_RULES`, `BOOT_LINE_MAX` (23 → 24) and `BOOT_LINE_AT_SEC` (+30.4) stand. Every other name stands.
19. **Seed 7's CORMORANT rolls a ROCKY LZ-B** (not a lake): its quip is `LZ-B is a little rocky :)`. The e2e reads the
    ground from `__ap.survey()`, as §7.4 says.

### Notes for the tracks

- **SWATH:**
  - raise `SURVEY_BUILT.poor` first, then `SKILL_TREE.survey.built`, then run the tier (R19, R23);
  - reconcile `claimed` with `holdsThread(SURVEY_THREAD_OWNER)` each tick; claim with `reserveThread(SURVEY_THREAD_OWNER, {
    yieldable: true })` only while `threadsTotal() − threadsBusy() ≥ 1 + SURVEY_KEEP_FREE_THREADS`;
  - `surveyVersion(state)` is the version capped by `built`; `groundAt` / `lzSiteOf` / `groundKnownAt` are the lead's
    readers;
  - an LZ move rewrites `centreRad`, `halfWidthRad`, `widthKm`, `ground` and `site` from the site, bumps `sitesRev` and
    pushes `moves`: the codec refuses an LZ off its site's geometry or a `sitesRev` under the moves;
  - every survey line said once per ship has its flag in `survey.lines`.
- **SITES:**
  - show the window and its dock item by toggling `body.survey` (the `survey-only` rule), as `body.landing` does;
  - `GroundBracket.site` is set on the candidates; `planet.unmapped` and the strip's `unmapped` terrain stretches are yours to
    paint;
  - the model types in `survey-hud.ts` are yours to widen; the words are `sites-text.ts`'s, the labels and refusals
    `survey-text.ts`'s.
- **The lead:** the independent contract review (§6.1 item 10) is next.

## Deviations (foundation, review follow-up)

These are the changes made after the independent review of 546e56b..c53a7e3 (`slice-6-foundation-review.md`, where each
finding is marked with how it was settled), as the lead decided them. Nothing a player can reach changes while both gates are
down. The unit tier is green: 203 passed, 0 failed, 10 balance-only skipped, 147 s on 4 workers, with `npm run typecheck` and the tests' tsc clean. The sections above stand except where this one says otherwise (§0.1's report row
and §2.3's module state are corrected in place).

### Blocker

- **B1. The GROUND TRACK's hooks (lead, `GroundTrack.ts`, now lead-owned).** `paintPlanet` pools `planet.unmapped` into
  `gt-p-unmapped` spans on the overview line, as it does the no-go arcs. Both bracket nodes (the strip's `gt-bracket` and the
  overview's `gt-p-lz`) carry `data-site`: a candidate's site id, '' on an LZ. SITES delegates the click from
  `SitesWindow.ts` (`closest('[data-site]:not([data-site=""])')`) and styles `.gt-p-unmapped` and `.look-candidate` in
  `survey.css`. Deviation 7's "CSS only" stands for SITES: it needs no edit in `GroundTrack.ts`.

### Majors

- **M1. The echo's reveal.** `landing.ts touchDown` works out `revealing` (the LZ's ROCKY or WET when this touchdown makes it
  known: its ground is bad and `groundKnownAt` is false) before `emit('pod-landed')`, where SWATH's reveal handler marks it
  known, and passes it as `LANDING_ECHO.touchdown`'s sixth argument (default null, so every other caller keeps its words).
  SWATH's one line in `landing-text.ts` (`:97–99`, marked `Slice 6 SWATH`, now `void revealing;`) appends
  `SWATH_TEXT.echoTail(lz, revealing)`.
- **M2. One run rule.** `survey-model.ts` gains `surveyRunning(state): SurveyRunning` (stub `'off'`) and
  `swathHalfRad(version): number` (stub 0), SWATH's to build; its tick uses them too, SITES's header and wedge read them.
  `surveyRunning` returns the five-state `SurveyRunning` rather than a boolean: SITES's header needs `running | waiting |
  paused | done | off`, and `'off'` is the neutral answer.
- **M3. The NAV PLOT's order.** The survey layer is made after the landing layer: each puts its nodes in right after the
  surface line, so the one made last sits lowest, under the LZ brackets. The comments in `NavPlotWindow.ts` and
  `plot-survey.ts` say so. The review's note is taken too: the layer's `paint` returns its labels' boxes (`LabelBox[]`, stub
  []), which the plot's marker labels keep off beside the brackets'.
- **M4. Long arcs.** `landing-hud.ts splitRimArcs` cuts the unmapped arcs into pieces at most π wide that never cross a
  multiple of 2π, for both the strip's terrain (`terrainStretches`) and the overview's `planet.unmapped`. So `surveyUnmapped`
  may return any arcs (the whole rim as one at the boot). `survey/foundation` pins the review's worked example (0.1 to
  6.2 rad, the dot at 0: the ground just ahead of the dot lands ahead of it), the cut at angle 0 and a whole turn.
- **M5. The words tables.** `support/words.test.ts` keeps a shared base (`SLICE6_BASE`, the lead's) and each track its own
  table inside its own block (`SWATH_WORST`, `SITES_WORST`), merged by `renderSlice6`'s fourth argument. The parser reads
  arrow and `function` templates with plain, defaulted (the table's worst case, never the default) and destructured
  parameters, and throws on a list it can't read; a check pins it. A parameter that shadows a top-level name of its own
  module is renamed by the transpiler (`pods` → `pods2`) and then fails as unknown: rename it.
- **M6. `openToolWindow(id, { onPhone })`** is exported beside `closeToolWindow` (`ToolsTabs.ts:33–41`, now lead-owned): on
  the desktop the window joins the open ones (never toggled shut); on a phone it takes the tab only with `onPhone: true`.
  SITES calls it for SITES_AUTO_OPEN, and calls `closeToolWindow('sites')` when `body.survey` goes away, so a phone left on
  the SITES tab never shows a blank panel on the next GOOD ship.
- **M7. The record knows what an LZ moved off** (inside v6). `SurveyMove` gains `from` (the site left). `SurveyRecord` gains
  `movedOff: { lz; ground: BadGround; known: RevealBy | null }[]`, every move off a bad site in order (`surveyRecordOf`). The
  codec reads both (a move's `from` and `site` must be sites the slice has, and differ). The shape pin does not move: `moves`
  items and `run.ships[].survey` sit below its depth. No migration default is needed: a v5 world has no moves and every v5
  record is null.
- **M8. `siteStars` is built** (R11: 3 FLAT and not NARROW, 2 FLAT NARROW, 1 ROCKY or WET, 0 a wreck). `assignRefusal` and
  `assignableLzs` stay neutral: SITES writes its pill checks to their contract, and they go green only after SITES rebases onto
  SWATH (merge order §6.3).

### Minors

- **m1.** A jammed placement starts over on the continuing stream, up to `SITE_PLACE_TRIES` (8, the lead's tuning block)
  placements in all, then throws; every draw before placement is untouched, so no roll that placed at the first try moves.
  `survey/foundation` forces a jam (a rim with room for one site) and counts the draws: 8 tries draw 7 more than 1.
  `placeOn` keeps its centre below its span's end.
- **m2.** `skill-tree.ts poorAhead` goes through `siteDataOf`, so SURVEY opens only for planets that play POOR
  (`survey/foundation` pins it at VESPER's desk). **R23 moves with it:** with `built` raised alone SURVEY no longer opens, so
  `skills/sentry.test.ts:110–111` now moves only once both gates are up (the review's merge probe saw it so).
- **m3.** §2.3 allows `survey.ts` one module variable, `lastRunning`, reset through `onWorldReset` (corrected in place).
- **m4, m5, m6:** SWATH's (its notes below).
- **m7.** SWATH's test lines are corrected below (the imports this follow-up added moved them again).
- **m8.** The report row reads `LZ-B 800 / 800 ✓ · SITE 4`, as built (the suffix in 01's LZ-row slot); §0.1 is corrected.
- **m9.** The codec refuses a non-FLAT LZ on a GOOD planet.
- **m10.** `SITES_TEXT.row.site/lz`'s display word is `groundWord` (`SITES_WORST.groundWord` is `FLAT ★★★`); `ground` stays
  a BadGround.
- **m11, m12:** SITES's and the lead's notes below.

### The final contract changes, per track

- **SWATH:**
  - builds `surveyRunning` and `swathHalfRad` (M2), and its tick uses both;
  - fills the echo tail in `landing-text.ts:97–99` (M1: `revealing` arrives as the sixth argument);
  - writes `SurveyMove.from` with every move (M7; `'lz-moved'` already carries it);
  - keeps `lastRunning` as its one module variable, reset on the world reset (m3);
  - **m4:** while it holds its thread, releases it when `threadsTotal() < 1 + SURVEY_KEEP_FREE_THREADS` (a worn Core down to
    one thread), and its R8 flow case pins it;
  - **m5:** `assignRefusal` also refuses while `landing.goLow?.held && goLow.lz === lz` (the burn would fly to the old
    geometry), under `'window-open'` or a refusal of its own in `AssignRefusal` (ask the lead for the type and the words);
  - **m6:** its BALANCE_ONLY sweep (§7.3) counts, by version, HOLLOW's skipped verb moments and the corrupted resident's
    lock delays while SURVEY holds its thread (both start only when `canStartOp()`), and R16's SURVEY/SENTRY ties; the
    numbers go to OPEN-DECISIONS with R8;
  - **R23's churn,** once both gates are up: replace `skills/sentry.test.ts:110–111` with the review's edit:
    ```ts
    const tie = openBranchesAt(unseeded, 4);
    unseeded.run.skills.opened.push({ skill: 'survey', visit: 4 });
    check('…a record written at depth 4 opens it at visit 4, or at visit 5 when SURVEY takes visit 4 (R16)',
      shut && (tie.includes('sentry') || (tie.includes('survey') && openBranchesAt(unseeded, 5).includes('sentry'))));
    ```
  - **Test lines (m7, as of this follow-up):** `survey/foundation.test.ts:67` (POOR; comment `:66`) and `:69` (SURVEY;
    comment `:68`); `skills/foundation.test.ts:79`; `support/words.test.ts:382–392` (its block, with `SWATH_WORST`);
    `tuning.ts:2362–2381`; the gates `data/survey.ts:11` and `data/skills.ts:58`; `landing-text.ts:97–99`;
    `skills/sentry.test.ts:110–111`.
- **SITES:**
  - paints `planet.unmapped` through the `gt-p-unmapped` spans and delegates candidate clicks by `data-site` (B1), with no
    edit in `GroundTrack.ts`;
  - reads `surveyRunning` and `swathHalfRad` for the header and the wedge (M2), and `siteStars` for the ★ (M8);
  - draws under the LZ brackets with `below.after(…)` and returns its labels' boxes from `paint` (M3);
  - may return the unmapped rim as any arcs, whole-rim included (M4);
  - keeps its worst cases in `SITES_WORST` inside its words block (M5), and names display words `groundWord` (m10);
  - opens the window with `openToolWindow('sites')` and closes the phone tab with `closeToolWindow('sites')` when
    `body.survey` goes away (M6);
  - writes its pill checks to `assignableLzs`'s contract: they go green after the rebase onto SWATH (M8);
  - **m11:** a visited ship that is POOR on the map but has `ShipResult.survey === null` (played before v6: a migrated SHIP
    DONE) reads `POOR · NOT SURVEYED`, or no row, never GOOD;
  - **Test lines:** `support/words.test.ts:396–406` (with `SITES_WORST`); `tuning.ts:2386–2394`; `audio-cues.ts:365–374`;
    `TrainingWindow.ts:88–94`, `ToolsTabs.ts:16–17`, `index.html:75–76` and `:176–185`.
- **The lead:** now owns `GroundTrack.ts` and `ToolsTabs.ts` beyond SITES's marked lines (B1, M6). **m12:** the SITES dock
  item and window are in `index.html`, hidden while `body:not(.survey)`; no e2e scenario iterates dock items today, so
  nothing moves, but a later one that does must skip `survey-only` items.

## Deviations (Track SWATH)

Recorded by the SWATH agent (branch `swath-6`, from 0b93e6e). §2.8 and §2.9 are built in `systems/survey.ts` and
`systems/survey-model.ts`, with the words in `data/swath-text.ts` and the strip row in `data/survey-rules.ts`; both gates are
raised (`SURVEY_BUILT.poor`, then `SKILL_TREE.survey.built` 3) with R23's sentry edit applied as given. No saved field and no
save bump. No tuning value moved.

### What is built

- **The tick** runs on two clock hooks. The game tick maps: it knows the game time the tick covered, so a step of a period
  or more (a long SKIP) maps the whole rim. The post tick runs in every phase: it reconciles the thread, puts the machine
  at rest outside a mapping tick (`lastRad` null), says CONTROL's boot quip at the first flight tick, rates what v2+ has
  found (R11), and emits `'survey-state'` on a change (`lastRunning`, the one module variable, reset with the world).
- **The thread (R8, m4):** claimed with `{ yieldable: true }` only while `threadsTotal() − threadsBusy() ≥ 2`, reconciled
  each tick with `holdsThread`, let go when the Core runs fewer than 2 threads, when it is paused, done, off, or at v3.
- **Finding and rating:** a site is found when its centre's cell is mapped (`survey-model cellOf`); at v2+ every found site
  is rated, latched (R11), and a bad site an LZ stands on is revealed by the swath (`by: 'survey'`). The first pod down on a
  bad ground nobody knew reveals it (`by: 'touchdown'`), SURVEY aboard or not, with the echo's tail.
- **`assignSite`** with every refusal (R10, m5), `toggleSurveyPause`, `surveyStatus`, `surveyRunning`, `swathHalfRad`,
  `bestSwap`, the debug bodies (`__ap.survey.map`, `.set`, `.pause`).

### Deviations

1. **`sweptCells` takes an optional fifth argument, `fullTurn`** (default false): a long SKIP's whole turn can't be told
   from its two angles. Four-argument callers are unchanged.
2. **More pure exports in `survey-model.ts`:** `cellOf` (the find rule), `surveyWantsThread` (the claim rule), `knownBad`
   and `surveySwap` (the strip row's LZ and site). SITES may read them.
3. **`assignRefusal`'s order** is `closed`, `not-found`, `wreck`, `same`, `too-small`, `taken`, `landing-over`,
   `pods-down`, `falling`, `window-open`: `same` comes early, so the pill on an LZ's own site reads `LZ-B IS ON SITE 4`, not
   a landing refusal. CONTROL's guesses are never `not-found` (they are known from the boot). It throws on an LZ or a site
   the ship does not have (on a GOOD planet `closed` comes first). `closed` also covers the boot and a desk; `landing-over`
   covers the LANDING REPORT and a lost ship. **m5** needs no new refusal: a held GO LOWER for the LZ reads `window-open`
   (`LZ-B'S WINDOW IS OPEN`). `falling` checks the pod's `aimLz` and `pendingTouchdowns`'s placement.
4. **`'site-found'` is emitted for guesses too** (the swath finds them, and v2 rates them); `first` is true only for the
   ship's first candidate. The TERMINAL types that first candidate and every wreck. The wreck's line names it by number
   (`> SURVEY: SITE 4 IS WRECKAGE · AN OLD POD. NOT OURS.`), since `siteLabel` of a wreck already says WRECKAGE.
5. **`PLANET MAPPED · n SITES` and `DONE · n SITES` count the candidates and wrecks found** (`foundSites`, the record's
   `found`): CORMORANT says 5.
6. **`surveyRunning`:** `'done'` comes before the phase check, so the SITES header keeps saying DONE after the landing;
   `'off'` while the clock is paused, as the contract says.
7. **CONTROL's reveal quip** is said once per bad site (`reveals` is the guard); no `lines` flag was added.
8. **`surveyStatus`** is null (the plain row: its version, OFF or GONE) when SURVEY does not work and when `surveyRunning` is
   `'off'` (the boot, a desk, a paused clock). `SITE DATA GOOD · IDLE` shows only when SURVEY works on a GOOD planet.
9. **`landing-text.ts`:** the tail is one line (a call of the same template without `revealing`, plus the tail, so the
   switch is untouched) and one import (`SWATH_TEXT`, a data module: no cycle).
10. **The strip row** (`survey-swap`, R22) needs a live phase, the landing not ended, no window open and `surveySwap`; its
    template renders its worst case with no state (as `resident-rules.ts`), and the SWATH words block checks it.
11. **A lead line moved:** `survey/foundation.test.ts:396–398` checked that `surveyRunning` and `swathHalfRad` answer
    neutrally (`'off'`, 0) until SWATH builds them. SWATH's build breaks that by design, so the check now pins the built
    contract (`'off'` on a GOOD planet; 0, ±20°, ±40°). The lead may prefer other words.
12. **R8's flow case** takes SURVEY's thread with ops-core `reserveThread('autoburn', { preempt: true })`, the very call
    AUTOBURN's claim line makes, rather than flying AUTOBURN to its claim.
13. **R23's churn:** none beyond `skills/sentry.test.ts:110–111` in the quick tier. `wp12/playthrough` plays the classic
    five (all GOOD): on 24 seeds at full depth its table is identical to 0b93e6e's, and its LITERAL and SLOPPY `every run
    ends` FAILs (21 and 9 stuck, `printing on LAST LIGHT`) are at 0b93e6e too.
14. **The sweep** (`survey/survey-sweep.test.ts`, BALANCE_ONLY, about 9 minutes on one core) reaches each POOR ship by its
    shortest route with no flight before it and heals its files, so the numbers are the site's. Its v1 kid is the plan's
    (a NARROW guess goes to the widest found candidate), and v2/v3 take `bestSwap`. The "kid who reacts to a touchdown
    reveal" is not built: without SURVEY an LZ can't be moved (`closed`), so a reaction is only over-filling the other LZ,
    which the strip-following kid never does. A pod a resident locks for good keeps the landing open with no strip row
    asking for END LANDING; the sweep's kid ends it (PROVIDENCE).

### The sweep's numbers (42 POOR ships, seeds 1–10, every flight to its report)

| | Q (points / aboard) | vs GOOD | landed | hard pods | cycles | mapped at the capture |
|---|---|---|---|---|---|---|
| GOOD (same ships) | 93.9% | — | 93.4% | 0.00 | 5.57 | — |
| POOR, no SURVEY | 71.3% | −22.6 | 91.6% | 3.38 | 4.14 | — |
| v1 | 75.4% | −18.6 | 94.5% | 2.95 | 4.38 | 33–43% (mean 39) |
| v2 | 79.9% | −14.0 | 92.4% | 1.93 | 4.64 | 33–43% (mean 39) |
| v3 | 80.9% | −13.0 | 92.4% | 1.86 | 4.71 | 44–54% (mean 51) |

- R3's expectation holds for no SURVEY (−22.6, at the top of the −12 to −25 band, about 1.4 cycles). v2 does **not** reach
  "within 3% of GOOD": it is −14.0.
- **Why (a finding for the lead):** the swath is under the ship (01 §3.13), but in a landing orbit the drop dot leads the
  ship by about 80° (CORMORANT: 75–83° measured). An LZ the approach did not sweep therefore gets its first window about 60°
  (v1/v2) or 40° (v3) before the swath reaches it, and the strip's kid launches into it then: v2 found the bad guess before
  any pod in 20 of 42 ships, v3 in 21; in the other half the first touchdown showed it, and an LZ with a pod down can't
  move. Where the swath came first, v2/v3 matched GOOD. Ways out, all the lead's or Fran's: map around the drop dot too
  during the landing; a landing row that holds a window while SURVEY v2+ runs and the LZ's ground is unknown (`SURVEY
  HASN'T SEEN LZ-B — [F] NEXT PASS`); or let an LZ move off a bad ground with pods down (the pods stay where they landed).
- FUEL at ORBIT LOCK is 29.1% with the thread (v1, v2) against 28.7% without: the 75% THRUST LIMIT costs nothing here.
- **Review m6:** 0 verb moments skipped and 0 AI s of lock waits with SURVEY's thread held, at every version. Verbs are
  the FINALE's only (`data/threats.ts`) and a final ship is GOOD, so SURVEY never holds a thread where a verb could be
  skipped; no corrupted resident's due lock met a Core SURVEY had filled.
- **R16:** 0 SURVEY/SENTRY ties at the 58 desks of these routes.

### OPEN-DECISIONS 52: the drop-dot swath (after the merge at 2dcfb7c)

15. **In the LANDING, SURVEY v2+ also maps a swath around the drop dot** (the lead's decision, OPEN-DECISIONS 52; a deviation
    from 01 §3.13, whose swath is under the ship only): "the sensors look where the pods will go". Same half-width as the
    ship's swath at that version (±20° at v2, ±40° at v3); v1 stays ship-only; the thread rules are unchanged.
    `survey-model.ts dropSwathOn(state)` says when (the landing, v2+, running); `survey.ts` reads the dot from the drop cache
    (`getDropSolution().dot.rad`, an existing selector: no patch) and sweeps the ship's arc of the tick shifted by the dot's
    lead, so no second angle is stored. No dot (Nav Plotter dead), no dot swath. SITES's wedge may draw the second one from
    `dropSwathOn` and the same selector.
16. **The flow suite pins it on CORMORANT:** LZ-B is unmapped at ORBIT LOCK; v1 meets its first window blind and the first
    touchdown shows it; v2 reveals it before LZ-B's first window with the ship 86° away (beyond its own ±20°), and the strip's
    kid moves it by `bestSwap` and lands all four pods soft.

**The sweep re-run** (42 POOR ships, seeds 1–10, every flight to its report):

| | Q | vs GOOD | landed | hard pods | cycles | bad guess shown by SURVEY before its first pod |
|---|---|---|---|---|---|---|
| GOOD | 93.9% | — | 93.4% | 0.00 | 5.57 | — |
| no SURVEY | 71.3% | −22.6 | 91.6% | 3.38 | 4.14 | 0 of 42 (all by touchdown) |
| v1 | 75.4% | −18.6 | 94.5% | 2.95 | 4.38 | 0 of 42 (v1 rates nothing) |
| v2 | 93.2% | −0.7 | 94.4% | 0.29 | 5.55 | **42 of 42** (was 20) |
| v3 | 93.9% | +0.0 | 94.4% | 0.24 | 5.57 | 42 of 42 (was 21) |

v2 is now within 3% of GOOD, as §7.3 expected. FUEL at lock, m6 (0 and 0) and R16 (0 ties) are unchanged.
