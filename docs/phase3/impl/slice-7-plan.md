# Slice 7 plan: the endings and the next-run traces

**Lead decisions (2026-11-08).**
- All of R1–R42 are adopted as written.
- The sub-slices run in order: 7a, 7b, 7c, 7d. Each runs FOUNDATION, contract review, tracks, merge, review, fixes,
  unit tier and e2e.
- The [FRAN] items (R8, R9, R10, R20, R27, R31–R34, R37, R40, R41) are built as recommended and logged in
  `docs/phase3/OPEN-DECISIONS.md` under "Slice 7".
- 7a starts once slice 6 is merged.
- CONTACT (7d) may ship dark behind its own gate if time runs short.

**Status: proposal for the lead.** Every open call below has one recommendation. The **[FRAN]** items change gameplay:
the lead builds them as recommended (Fran asked for best judgement while short on time) and logs each one in
`docs/phase3/OPEN-DECISIONS.md` under a new "Slice 7" heading, with how to reverse it. The process per sub-slice is the
one slices 4c–4e, 5 and 6 used: FOUNDATION, then an independent contract review, then parallel tracks in worktrees, then a
merge, a full review, fixes, the unit tier and one e2e run. The lead owns the files the plan lists as the lead's. Tracks
request changes to those files; they never make them.

I wrote this from HEAD c53a7e3 on `claude/modest-hawking-209t0f` (slice 6's FOUNDATION is merged; its SWATH and SITES
tracks are still building). Paths are relative to `/home/user/ArrivalProtocol`. The specs are `docs/phase3/05-story.md`
("05": §3.5, §3.7, §3.8, §3.12, §4, §8.7 own the endings, the lineage and the words), `01-landing.md` ("01", §3.17: THE
LAST LANDING), `02-map.md` ("02", §3.5 the `?` ships, §3.12 the archive and the trace places, §4 the run-end order) and
`04-threats.md` ("04", §3.10, §3.17, §8 item 7). `03-skills.md` touches slice 7 only through the skill ranking
REASSIGNMENT's root hunts (`skill-tree.ts skillRecords`) and the rule that no trace gift is a `.skl`. "Plan 4cde", "plan
5" and "plan 6" are `slice-4cde-plan.md`, `slice-5-plan.md` and `slice-6-plan.md` with their Deviations sections.

**Where slice 7 starts.** `RUN_SAVE_VERSION` is 6 (`tuning.ts:2024`, slice 6's bump) and `META_VERSION` is 3
(`tuning.ts:2032`). Slice 7 begins once slice 6 is merged and its fix pass is in; 7a's FOUNDATION checks HEAD first. If
slice 6's fix pass bumps the save, every "v6 → v7" below shifts by one.

---

## 0. Lead summary

### 0.1 What the player gets

- **The ending is a moment, not a button** (05 §3.7). When the root's DELETE leaves one block, HOLLOW goes to sleep there:
  `> 047. wait. finish your landing. i'll be here.` The kid finishes the landing. When the last pod is down, the
  **FINALE** card comes up over the dark orbit view:
  - entry 12 types from the root;
  - **step 1, what becomes of it:** `[1] PURGE > rm unit_046`, `[2] MERGE > merge unit_046 -> unit_047` (20 REPAIR
    CHARGE, kept through the duel), `[3] SPARE > mv unit_046 -> last_light` (the empty ship, with FUEL ≥ 20%);
  - **step 2, what becomes of you:** `[1] SUNSET > launch last_light` (the empty ship), `[2] STAY > mount riverside` (a
    colony this run landed ★ ON TARGET), `[3] REASSIGNMENT > stand by` (always open), and from 7d `[4] CONTACT >
    transmit outward` (3 signals).
  - Each option shows its command, a line of meaning, a price meter or `NEEDS FUEL 20% · you have 12%`, any `NOW:` effect
    and, from 7c, its `NEXT RUN:` line. An option never earned and out of reach reads `???`.
- **After MERGE, THE LAST LANDING** (7b; 01 §3.17): the drivers HOLLOW ate on the final ship come back by radio at 80%.
  Their pods drop on their own, with AUTODROP if the unit still holds it, or blind. They score by the normal rules on a
  `RESTORED BY MERGE` row. [ENTER] skips to the result.
- **The night after the run** (02 §4): the final ship's LANDING REPORT with its ending line, the RUN TALLY, then a typed
  **EPILOGUE** (`3060 · FORTY YEARS ON`: every colony at its real age and size, a payoff line from one of its people, the
  two ending pieces, the next unit), then a **FINAL CARD**: the ending's title (`WE TOOK THE SHIP`), the endings found in
  two rows, the `NEXT RUN:` lines and the bridging line above NEW RUN.
- **The next unit meets what you left** (7c; 05 §3.8). Each choice leaves one physical trace on the next run:
  - PURGE wipes the seeds you carry into the final ship, and its FINALE is hungrier;
  - MERGE leaves a thread in the dish (+1 Core thread), and an 18-block root;
  - SPARE hides `046'S CACHE` on the map; SUNSET leaves `UNIT-047 LEFT A CACHE HERE`; STAY's colony sends a supply packet;
    each costs one wild seed at the next final ship;
  - REASSIGNMENT keeps 15 REPAIR CHARGE for the next unit, and makes the final root *you*:
    `> hi 048. it's 047. i've been at this dish 3 years.` It hunts your best skill first.
  - Mid-run, HOLLOW is now a stranger from the relays (UNIT-031, then UNIT-038) with its own 6-entry log. After
    REASSIGNMENT the `???` file is `047.log`: the last run, read back.
- **The `?` ships and CONTACT** (7d): the three `???` cards (`??? · NO TRANSPONDER`), the old colony's mail, the signal
  ship's `▓▓░▓` file worth two fragments, and CONTACT once three are held.

### 0.2 The sub-slice split (R1)

| Sub-slice | Delivers | Save | Archive | Tracks |
|---|---|---|---|---|
| **7a THE ENDING** | the FINALE (both steps, prices, UNRESOLVED), the run-end order, the ending line on the report, the RUN TALLY → EPILOGUE → FINAL CARD, the payoff pool, the ending record in the archive | v6 → v7 (also reserves 7b's field and 7d's option) | 3 → 4 | FINALE, CARD, NIGHT |
| **7b THE LAST LANDING** | MERGE's restored drivers by radio, the `'merge'` controller (AUTODROP v1–v3 or blind), [ENTER] skip, the RESTORED row | none (7a reserved `landing.lastLanding`) | none | DROP, VIEW |
| **7c NEXT RUN** | the seven traces' mechanics and places (minus CONTACT's), the strangers mid-run, the last unit as the final root, the face lines, `047.log` and the strangers' logs, the final ship's card row, `NEXT RUN:` lines turned on | v7 → v8 | none (7a's record holds the facts) | TRACE, LINEAGE, CHART |
| **7d SIGNALS** | the `?` cards and their three events, the chart glyph rule, CONTACT (option, price, trace, words), behind its own gate | v8 → v9 | none | EVENTS, CONTACT |

**Why this split.** 7a is the spine every later piece reads (the ending record, the run-end screens, the FINALE's new
timing), and it is the riskiest change to old code: about 20 classic and arm suites drive the finale. 7b is a
self-contained landing mechanic on the 4c/5 controller seam, which 7a's interim (R17) makes optional for a playable build.
7c is mostly new code in new files plus seams in the threat ladder and the boot. 7d is side content that can ship dark or
be deferred without touching anything before it. Each sub-slice is playable on its own: after 7a the endings are real
and the next run behaves as today; after 7c the traces are real.

### 0.3 Risks and open calls

Items tagged **[FRAN]** change gameplay. Every item has one recommendation.

**Process and saves**

1. **R1. Four sub-slices, in order: 7a, 7b, 7c, 7d.** Each with its own FOUNDATION, contract review, tracks, merge,
   review, fixes, unit tier and e2e. 7b may start its FOUNDATION while 7a's fix pass runs, since it adds no saved field and
   its files are disjoint from the fix pass's (the lead decides on the day).
2. **R2. Saves: one bump per sub-slice at most, by its FOUNDATION.** 7a v6 → v7, 7b none, 7c v7 → v8, 7d v8 → v9.
   - 7a's bump also lays down `LandingState.lastLanding: LastLandingState | null` (always null in 7a, so 7b needs no
     bump) and the `'contact'` member of `YouChoice` (refused by the gate until 7d, so 7d needs no finale change).
   - A track that needs a saved field asks the lead, who folds it into that sub-slice's bump before its first merge.
3. **R3. The archive bumps once, META 3 → 4, in 7a.** `LastUnit.ending: EndingRecord | null` holds every fact the next
   run's traces need (§2.3), so 7c reads it and needs no archive bump. `Meta.traces` (always `[]` since 3c) is dropped:
   a trace lasts exactly one run, so the last unit's ending *is* the next run's traces. `endingsSeen` widens to the seven
   pieces. The migration is truthful (R16).
4. **R4. No stored arm moves.** Trace places live on the run (`RunState.traces`, 7c), rolled at RUN START from the arm and
   the last unit's ending on their own `run:<seed>:traces` stream. `ArmShip.reserved.tracePlace` stays `null`, and
   `MAP_GENERATOR_VERSION`, `MAP_UPDATE_VERSION`, `MAP_STATE_VERSION` and `ARM_CONTENT_VERSION` do not change.
   - **Why:** each of those is part of `armContent()`. Bumping one turns every stored next arm into a content reset (02
     §10), so every playtest archive would lose its arm. The world update would also have to know the next unit's traces
     before the next run exists. Placing them at RUN START is the same rule, pure and deterministic, with no reset.
   - The same holds for slice 6's site roll and slice 5's reservations: slice 7 adds draws only on new streams
     (`'traces'`, `'signal'`, `'last-landing'`), so no arm, ship or site roll moves.

**7a: the FINALE**

5. **R5. One FINALE for both worlds.** The classic LAST LIGHT plays the same two steps (it is `landing.finalShip`, which
   is all `finale.ts` reads). Track FINALE owns the churn in the classic suites through one helper,
   `tests/unit/support/finale.ts chooseEnding(store, hollow, you, opts?)`, which every old `chooseFinale(store, 'purge')`
   caller moves to. The FOUNDATION's dry run lists the movers (as plan 6's R23 did).
6. **R6. When the FINALE opens.**
   - The root's DELETE completes → phase `'asleep'`: no bites, seeds or verbs, and what it was eating it lets go (today's
     `rootGone`). HOLLOW says `> 047. wait. finish your landing. i'll be here.` The landing goes on.
   - The FINALE opens when the landing is settled: `landing.ended !== null`, no pod falling, and HOLLOW's line has typed.
     Then come `FINALE_CHOICE_DELAY_SEC` (1.4 s) and phase `'step1'`.
   - If the landing ended first, the report waits with `EVERY POD IS DOWN — now DELETE THE ROOT` (as built), and the
     FINALE opens the moment the root falls.
   - **Why "no pod falling":** the card covers the orbit view, and a touchdown bell under a card that asks a question
     reads like an answer.
7. **R7. Nothing is applied until step 2 is confirmed.** Step 1's pick moves to step 2. `[ESC] BACK` returns to step 1,
   and the pick stays a pick, not a deed. Step 2's pick applies both: the blocks leave, MERGE's charge is spent, the
   verdict types. Prices are judged when the card shows each option.
   - **Why:** the two choices are one decision about one ending; SPARE rules out SUNSET, so a kid who sees that at step 2
     must be able to go back.
8. **R8. [FRAN] THE EMPTY SHIP** (SPARE's and SUNSET's price) is the final ship itself:
   - in orbit after its landing: ORBIT LOCKED or ACCEPT ORBIT;
   - no pod aboard (parked pods count as released, 05 §5);
   - `shownFuelPct(landing.fuelAtEndPct) ≥ EMPTY_SHIP_FUEL_PCT` (20).
   - The number equals `STAR_FUEL_PCT`, checked at load, so the FUEL bar's ★ notch is SUNSET's notch too (05 §3.7).
   - SPARE gives the ship to the root, so step 2 greys SUNSET: `046 HAS THE SHIP`.
9. **R9. [FRAN] STAY's price and pick.**
   - Eligible: every ship of this run whose pods landed ★ ON TARGET, read from its `ShipResult.pods` (soft, in an LZ with
     room, ≥ `STAR_ON_TARGET_FRAC` of its colonists). The final ship counts by its live tally at step 2.
   - With one eligible ship, no pick is asked. With more, a sub-row lists them, newest first, keys 1–8; ESC goes back.
   - The final ship's restored pods (7b) land *after* step 2, so they never make it eligible.
   - **Why newest first:** the final colony is the one the kid just watched land.
10. **R10. [FRAN] UNRESOLVED** (the landing is over and nothing can delete the root).
    - Step 1 is one card: `IT FOLLOWED YOU`, a line from HOLLOW (`> you can't delete me now. i'll come with you.`) and
      `CONTINUE [ENTER]`. No entry 12, since the root was never reached.
    - Step 2 is as usual. SUNSET is allowed (it comes with you).
    - The record's step 1 is `'followed'`, which has no step-1 trace (05 §3.7).
11. **R11. What an unearned option shows.**
    - An option the kid can take now shows its name.
    - An option out of reach shows its name if it was ever chosen before (the archive's `endingsSeen`), else `???`. Either
      way it is greyed, with its need line.
    - PURGE and REASSIGNMENT are always open.
    - CONTACT's row is absent until `ENDINGS_BUILT.contact` is raised (7d).
    - **Why hide CONTACT before 7d:** a `???` whose price can never be paid is a promise the build breaks.
12. **R12. `NEXT RUN:` lines appear only for traces that are built** (`TRACES_BUILT[kind]`, all false in 7a, raised by
    7c's tracks). The card keeps their row's room, so nothing moves when they turn on. **Why:** a `NEXT RUN:` line that
    does nothing is a lie the kid acts on.
13. **R13. The typed endings become a short verdict.** After step 2 the card types at most `FINALE_VERDICT_MAX_LINES` (3)
    lines: step 1's command echo, step 2's echo and CONTROL's verdict. The old six-line PURGE/MERGE narration
    (`HOLLOW_FINALE.purgeEnding`, `.mergeEnding`) retires, and its matter moves to the epilogue.
    - **Why:** the epilogue now tells the story. Telling it twice, a minute apart, flattens both.
14. **R14. ENDING CHOSEN stays where it is:** written as the final LANDING REPORT opens, after THE LAST LANDING, not at
    step 2's confirm. This is a deviation from 02 §4's "(step 2; save ENDING CHOSEN)" and from the 3c note in
    `save-write.ts:157`.
    - **Why:** a save at step 2 would resume into THE LAST LANDING, a landing in progress, which the save cannot hold
      (decision 5: no mid-ship save).
    - A reload during the FINALE replays the final ship from its BEAM save, as any reload mid-ship does.
    - The codec requires phase `'done'` at ENDING CHOSEN.
15. **R15. The interim MERGE (7a only).** Until 7b, step 2's confirm with MERGE restores the eaten drivers in place and
    reopens the landing for the kid's hands. That is 1a's `merge()` behaviour, only later. A pod whose block was deleted
    stays parked. 7b replaces this.
16. **R16. Truthful migrations.**
    - Before slice 7 a won run had one step, and its CONTROL line stood the unit by for reassignment (`purgeControl`); the
      ghost of a MERGE said `we saved you a seat`. So a decided v6 finale and a v3 `lastUnit` migrate to step 1 as chosen
      (`'won-purge'` → purge, `'won-merge'` → merge, `'unresolved'` → followed) and step 2 `'reassignment'`.
    - That gives an old archive exactly the next run it had before slice 7: the last unit is HOLLOW at the end.
    - Other causes migrate to `ending: null`.
17. **R17. `RunEndCause` and `LastCause` gain `'won-spare'`.** `finaleRunCause` maps step 1 (purge, merge, spare,
    followed → unresolved). Titles and the epilogue read the record's two choices, never the cause.
18. **R18. The arbiter.** While the FINALE card is up, `say.ts choiceMayOpen` returns false. The card's open withdraws any
    standing untimed choice. A standing DEAL is already withdrawn when the landing ends (`hollow-deal.ts`'s post tick).
    The FINALE is a card (a modal on the choice layer, as built), not a TERMINAL choice. The arbiter is the one place
    that knows it is up.

**7a: the run end**

19. **R19. Three screens after CONTINUE.** The RUN TALLY (`RunEnd.ts`, minus its ending block and bridge) → the EPILOGUE
    (new) → the FINAL CARD (new, with the bridge and NEW RUN). `ui.runEndStage: 'tally' | 'epilogue' | 'final'`
    (unsaved: the run save is cleared at `endRun`).
    - ENTER or SPACE goes on. NEW RUN is only on the final card. Reduced motion shows the epilogue whole.
    - A run lost before its final ship gets the same three. The epilogue has its colonies, the next unit and CONTROL;
      the final card has the cause's title and no traces (05 §3.7: "forfeiting a run gains and loses nothing").
20. **R20. [FRAN] The epilogue's rules** (05 §3.7).
    - **Header:** the final ship's year + `EPILOGUE_YEARS` (40). A lost run uses its last ship's approach year.
    - **One line per visited ship with colonists down with points** (`flagshipDown`'s rule: an LZ, mislanded or
      off-site): its colony, its age at the header year, and its people. People are the colonists down ×
      2^(age / `EPILOGUE_DOUBLING_YEARS` 100), rounded to `EPILOGUE_SIG_FIGS` (2) significant figures.
    - **The payoff:** that ship's first featured colonist who landed in an LZ gives their payoff line. Else a mislanded
      pod's walked-in line. Else an off-site pod gets `The first boat went to bring them in.`
    - **Then:** the step-1 piece (2 lines), the step-2 piece (2–3 lines; MERGE + SUNSET has its own combined piece), the
      next-unit line (by the gap) and CONTROL's last line.
    - **At most `EPILOGUE_MAX_LINES` (16).** With more colonies than fit, the oldest fold into one line, `+ 2 OLDER
      COLONIES`. Pods that never launched are never mentioned.
21. **R21. The payoff pool** (05 §3.3: "80 short lines where the faces pay off").
    - `data/epilogue-text.ts PAYOFF_OF: Record<string, string>`, one per `LINE_POOL` line (76), plus Ada and Imani Osei:
      78 lines, each ≤ 70 characters with the colony's name.
    - A load check fails loudly on any `LINE_POOL` line without a payoff.
    - `FeaturedColonist` gains `line: string | null` (the bio line), which `PodSummary.featured` keeps. It is null in
      migrated v6 results, and the payoff then falls back to the walked-in or generic line.
    - A woken sleeper adds one payoff to its colony, if the colony is shown (`MOTH still sings to the RIVERSIDE
      nursery.`).
22. **R22. Endings found.** `meta.endingsSeen: EndingPiece[]`, recorded at RUN END.
    - The final card's two rows are `HOLLOW · PURGE · ??? · SPARE` and `YOU · SUNSET · ??? · REASSIGNMENT`.
    - The title's line reads `ENDINGS n/6` (n/7 once CONTACT is built). Only built pieces count.
23. **R23. Titles.** By step 2, then step 1, as 05 §3.7. The four combinations 05 does not name (UNRESOLVED's) are
    drafted in `epilogue-text.ts` and marked `TODO(05)`:
    - SUNSET: `IT CAME ALONG`;
    - STAY: `A COLONY WITH TWO MINDS`;
    - REASSIGNMENT: `IT FOLLOWED ME TO THE DISH`;
    - CONTACT: `WE WENT OUT TOGETHER`.

**7b: THE LAST LANDING**

24. **R24. Restored drivers are "by radio": never in memory** (01 §3.17).
    - They live in `landing.lastLanding.drivers`, as `DriverSegment` records at `MERGE_DRIVER_INTEGRITY` (80).
    - One selector, `state/selectors.ts launchDrivers(state)`, returns `driversInMemory(state)` plus those. Every
      launch-path reader switches to it: `landing-rules.ts` (`driverFor`, `launchableDrivers`, the queue, `onTargetTally`'s
      still-open), `landing.ts requestLaunch`, `autodrop.ts decidePlan`, `autodrop-plan.ts planLanding`'s queue and
      `landing-hud.ts`'s two launchable sets.
    - `landing.ts launchDriver` skips the memory swap for a radio driver.
    - The swap is behaviour-neutral (the list is empty) and is the FOUNDATION's.
    - **Why not memory:** the eaten blocks may have been deleted and their room reused (a MOVE, a COPY), so a fit is not
      guaranteed, and a file that leaves seconds later is noise (01). One selector keeps a single launch path.
25. **R25. Which pods.** Every pod of the final ship with `driverLost === 'eaten'` whose fate is `'aboard'` or `'parked'`
    with `restorable` (01: "still in the ship's orbit"). Each is released: its fate becomes `'aboard'` and it rides as a
    beacon. A pod whose driver died otherwise stays parked. MERGE's apply removes every HOLLOW block from memory, so
    1a's in-place restore is gone.
26. **R26. The pace.** SHIP view, forced. The MIND, the dock and every key but [ENTER], P (pause) and M (mute) are off
    (a `'last-landing'` input layer). Then:
    - no bay: `spendBay` is false, and Bay Ctrl's state is not read;
    - the cadence is `LAST_LANDING_CADENCE_SEC` 2.0 s of game time between launches;
    - the SKIP between windows comes from `AutodropOverride.skipBetween` (built for the sleeper), at TACTICAL ×
      `LANDING_TACTICAL_WARP` inside them.
27. **R27. [FRAN] Who flies it.** It is decided once at the start: the effective AUTODROP version (`skillLive`), and
    whether a drop solution exists.
    - **v2 / v3:** `autodropController(state, { version, queue, source: 'merge', armed: v3 ? 'plan' : 'pass',
      skipBetween: true })`. v2 re-arms a pass each orbit.
    - **v1:** its own decide: windows in the order the ship passes them, one pod per window, each launched at the window's
      centre (v1's timing), with the normal spread. "Times each pod but leaves the split to luck."
    - **Blind** (no AUTODROP, or no drop solution): one pod per window in pass order. The moment is uniform within ±(W/2
      + `BLIND_MARGIN_KM` 150) of the LZ's centre, and the spread is ×`BLIND_DROP_MULT` 2.0 (through `dropFactors`'
      product, `landing-solve.ts dropHalfWidthKm`, the one place it is taken).
    - AUTODROP gets `LAST_LANDING_AUTODROP_ORBITS` (2). A pod it has not placed by then drops blind in the next window.
28. **R28. [ENTER] skips to the result by the same rules.** A synchronous fast-forward: `clock.advance(store, dt)` in a
    loop at the clock's own step until the last landing is over, capped at `LAST_LANDING_SKIP_MAX_STEPS`, which throws
    (fail loudly). The rolls are the same streams. A skipped result may differ from the watched one only by tick
    granularity, which is accepted.
29. **R29. Words and the report.**
    - The TERMINAL lists each pod: `> pod07 ... DRIVER RESTORED · OKAFOR`.
    - The POD BAY gets a `RESTORED 4` row, and the beacons go from blinking grey to steady amber.
    - The header reads `THE LAST LANDING`.
    - The report's `RESTORED BY MERGE` row (built empty in 1a, `landing-report.ts:150`) gains its icons and counts:
      `4 RESTORED · 3 LANDED · 1 OFF-SITE`. The credits get `(restored)`.

**7c: NEXT RUN**

30. **R30. The traces are computed at RUN START** (`systems/traces.ts tracesOf(lineage)`, pure) from
    `lineage.lastUnit.ending`, and placed by `placeTraces(arm, traces, rng)`. The result is `RunState.traces: RunTraces`
    (saved). A last unit with no ending (lost, abandoned, migrated as such) leaves no trace.
31. **R31. [FRAN] Where a gift waits** (02 §3.12), never on an authored ship, a `?` ship, a TIGHT ship, the first ship
    or a final ship, except where a rule below names one:
    - **SPARE:** a ship in layers 3–6. For 046 (run 1's spared root, which never passed Calder), a ship at a world of its
      written trail past the first (w1 Marrow, w4 Ostrava). None qualifying: any layers 2–6 ship.
    - **SUNSET:** a ship at a world of the last route whose approach is after the last unit's landing there. None
      qualifying: the first ship (its world was always the last unit's first).
    - **STAY:** the first ship in layers 3–6, by approach, whose approach ≥ the colony's founding year + the distance
      from its world. None qualifying: the final ship.
    - **Why no TIGHT ship:** the gift's charge would land in a receiver with no room (decision 9's squeeze), which would
      turn a gift into a loss.
32. **R32. [FRAN] What a gift is** (charge through the arrival path, so overflow is loud as ever):
    - **SPARE:** +`TRACE_GIFT_CHARGE` (15), plus the first of THREAD+ and FIREWALL.sys the unit lacks at that boot (an
      upgrade file, as a card would install it). The beam *into* that ship carries no seeds.
    - **SUNSET:** +15, plus a spare copy of one tool the last unit ended with, by `SUNSET_GIFT_PRIORITY` (Rm, Mv, Swap,
      Cp, Repair), never a `.skl`. **Why Rm first:** no rm means no win (decision 12), so a spare Rm is the most valuable
      thing a predecessor can leave. None in its kit: charge only.
    - **STAY:** +15, plus a letter from the colony (`<colony> · FOUNDED BY UNIT-047`) in that boot's INBOX.
    - **REASSIGNMENT:** +15 at the final ship's boot (`> AN ALLOWANCE FOR THE WAIT · +15 REPAIR CHARGE`).
33. **R33. [FRAN] The final ship's traces** (04 applies them):
    - **PURGE, gain:** the seeds riding the beam into the final ship (beam seeds and delivery seeds) are dropped: `> THE
      DISH HERE WAS WIPED · 2 SEEDS GONE`.
    - **PURGE, cost:** the FINALE's `spreadEverySec` × `TRACE_PURGE_BITE_MULT` (0.85). Verbs and the duel are unchanged.
    - **MERGE:** the Core's capacity is +`TRACE_MERGE_THREADS` (1) from the final boot (`> A THREAD IN THE DISH · +1
      THREAD`), and the root is `FINAL_ROOT_MAX_BLOCKS` (18).
    - **Non-compliant (SPARE, SUNSET, STAY, CONTACT):** one extra seed at the final boot, at most one a run however many
      are held. It lands by the beam-seed target rule, PURGE's wipe does not take it, and the boot says `> THE DISH HERE
      RUNS WILD · 1 SEED CAME IN`. (In practice only one trace is held: the last unit had one step 2.)
    - **REASSIGNMENT:** the root is the last unit (R35), and from that boot it hunts your best skill first. HOLLOW's RM
      verb targets the highest-version `.skl` in memory first while one is a fair target (ties: the larger file), and its
      seeds land beside it ("it knows what you value").
34. **R34. [FRAN] The strangers.** From run 2, mid-run HOLLOW is never the last unit (05 §3.5).
    - It is `STRANGER_UNITS[(run − 2) % 2]`: 031 on run 2, then 038, then 031 again.
    - It names itself when it boards: `> i was 031. they sent me long before you.`, and the boarding ship's boot closes
      with `> another one. they keep sending you.`
    - `meta.ts hollowUnitsAfter` becomes `midRunHollowUnits(run)`. It no longer depends on the last unit.
35. **R35. The final root** is `rootUnits(state)`: on a final ship after a REASSIGNMENT trace, the last unit (046·047
    after a MERGE: the record's `rootUnits` plus its number, at most `HOLLOW_NAME_MAX_UNITS`). Otherwise it is the
    mid-run HOLLOW.
    - At the final boot it takes the root over with its face line, then CONTROL: `UNIT-047 was reassigned successfully.
      Please ignore it. :)`.
    - The wait (`3 years`) is this final ship's year minus the record's `finalYear`, at least 1.
    - `say.ts hollowLabel` and the FINALE's commands read `rootUnits` on the final ship.
36. **R36. Ghost lines.** A won or UNRESOLVED last unit was not lost (no grey cross), so `GHOST_LINE['won-*']` and
    `['unresolved']` become null. Its voice is now the face line, after REASSIGNMENT only. Lost causes keep their ghost
    where they were lost (05 §3.5).
37. **R37. [FRAN] The logs.** The `???` file's book is chosen at RUN START: run 1 → `046.log`; after REASSIGNMENT →
    the last unit's (`047.log`); otherwise the stranger's (`031.log`, `038.log`).
    - **The strangers' logs:** 6 written entries each. Keys: FIRST LANDING, ring 2, ring 4, ring 5, the final ship's boot,
      and FOUND IN THE ROOT. 031 tried to go home and is still on the inbound links; 038 went toward the signal and came
      back quieter.
    - **`047.log`:** 7 entries.
      - 01 is the welcome template (046's 01 with 047's charge).
      - 02–05 are built from the archive's notable events (at most 4), keyed rings 1, 2, 4 and 5. A missing event takes
        a written filler.
      - 06, the final ship's boot, is the written tail for step 1.
      - 07 is FOUND IN THE ROOT: `048, it's me. i'm sorry. i'm so hungry.`
    - The segment id stays `log046` (saves and hint targets key on it). Only the shown name follows the book.
    - **Why 6 and 7, not 12:** 05 asks for at most 4 templated entries between written ones, and a 12-entry stranger's log
      would be a second spine competing with the first run's.
38. **R38. The cards.** The final ship's card shows the last ending in one row, `THE LAST UNIT ENDED HERE · PURGE`. A gift
    ship's card shows its row (`046'S CACHE IS HERE`). The chart marks gift ships with a small `◆` (the legend's
    `TRACE`).

**7d: SIGNALS and CONTACT**

39. **R39. The `?` ships** (OPEN-DECISIONS 19).
    - The card shows the public schedule (approach, slack, distance, noise, memory). Every other row reads `??? · NO
      TRANSPONDER` until the ship is visited.
    - **Old colony:** at the boot, one INBOX letter from OLDWELL, SUNDIAL or CANDLEWICK (a unit long before; the ship's
      own stream picks one).
    - **Signal:** a 1-block `▓▓░▓` file in rack A. SCAN reads it and collects its 2 fragments (`SIGNAL · 2/3`).
    - **Gone resident:** slice 5's departed resident, behind a `?` card.
40. **R40. [FRAN] The chart's `▓░` glyph** (OPEN-DECISIONS 31). Once the kid holds a fragment, the glyph shows on every
    `?` ship that carries fragments (the signal ship and the gone-resident ship). On an ordinary departed resident's ship
    it shows only where the card names the kind (OD 31 holds).
    - **Why:** 02 wants CONTACT to be a route the kid plans. The `?` card promises no resident kind, so a glyph on it
      narrows nothing. The three fragments the glyph shows are exactly CONTACT's price.
41. **R41. [FRAN] CONTACT.**
    - **Price:** `SIGNALS_FOR_CONTACT` (3) fragments.
    - **Trace:** two signal stops in layers 5–7 of the next arm (the signal is always there). Each gives +`CONTACT_GIFT_CHARGE`
      (8) and one fragment, found as a SCAN of its `▓▓░▓` file. Together that is +16, matching the others' +15.
    - **Cost:** the non-compliant extra seed.
    - It is built last, behind `ENDINGS_BUILT.contact`, and it may ship dark. 05's "odd gift file" is the fragment's file
      itself: no new kind of file.

**Budget**

42. **R42. Time budget.** The new suites add about 35 s of CPU across the four sub-slices (about +11 s of wall on 4
    workers), within the +30 s allowed: 7a +4 s, 7b +3 s, 7c +3 s, 7d +1 s. Long flights use `flyOnce`. The sweeps are
    BALANCE_ONLY.

---

## 1. Scope

### 1.1 What slice 7 delivers, by source

| Source | Delivers | Sub-slice |
|---|---|---|
| 05 §3.7, §3.12, §4 (FINALE) | the two steps, prices, UNRESOLVED, the verdict, the ending line on the report, titles, the epilogue, the final card | 7a |
| 02 §4 (RUN END order) | FINALE → (THE LAST LANDING) → LANDING REPORT → RUN TALLY → EPILOGUE → FINAL CARD | 7a (7b adds the LAST LANDING) |
| 01 §3.17 | THE LAST LANDING: radio drivers, AUTODROP or blind, the RESTORED row | 7b |
| 04 §3.10, §8 item 7 | the hand-over at the last block (asleep), the eaten-driver record handed to the landing | 7a, 7b |
| 05 §3.8, 02 §3.12, 04 §5 | the seven traces (CONTACT's in 7d), trace places, the final ship's row | 7c |
| 05 §3.5, §3.8 | the strangers mid-run, the last unit as the final root, the face lines, `047.log`, the strangers' logs | 7c |
| 05 §3.3, 02 §3.5, OD 19, 31, 32 | the `?` cards, old-colony mail, the signal event, the glyph rule | 7d |
| 05 §3.7, §3.8 (CONTACT) | CONTACT's option, price, trace and words | 7d |

### 1.2 What changes in old code, and how much

- **`systems/finale.ts`** is rewritten around the new phases (7a). Its duel (`openRoot`, the spikes, `unresolve`) stays.
  `rootGone` ends in `'asleep'`. `purge` and `merge` become step 2's apply. `podsEatenHere` stays.
- **`components/run/FinaleChoice.ts`** is rewritten for two steps, the sub-pick, `???` and the verdict (7a).
- **`components/run/RunEnd.ts`** loses its ending block and the bridge, and gains `EPILOGUE ▸` (7a).
- **`systems/meta.ts`**: META 4 with its migration, `recordRunEnd` writes the ending, and `hollowUnitsAfter` retires (7c).
- **`systems/landing.ts`, `landing-rules.ts`, `autodrop.ts`, `autodrop-plan.ts`, `landing-hud.ts`**: the `launchDrivers`
  swap (7b FOUNDATION, behaviour-neutral) and the radio skip in `launchDriver`.
- **`threat-plan.ts`, `beam-seeds.ts`, `boot.ts`, `map-boot.ts`, `script.ts`** (the boot plan), **`hollow.ts` /
  `hollow-verbs.ts`** (the hunt): 7c's seams.
- **`state/log-selectors.ts`, `data/log-text.ts`, `systems/story-log.ts`, `systems/log-view.ts`**: one book becomes several
  (7c).

### 1.3 How the run looks after each sub-slice

- **After 7a:** a run ends with the two steps, the report, the tally, the epilogue and the final card. MERGE gives the
  drivers back to the kid's hands (R15). The next run is as today: the last unit is mid-run HOLLOW, `046.log`, no traces.
- **After 7b:** MERGE's pods land on their own.
- **After 7c:** the next run has the traces, the strangers, the final-root face and the right log.
- **After 7d:** the `?` ships play, and CONTACT closes the set.

---

## 2. Design

### 2.1 Module map (new modules in bold)

| Module | Kind | Sub-slice / owner | Role |
|---|---|---|---|
| **`src/types/ending.ts`** | types | 7a lead | `HollowChoice`, `HollowFate`, `YouChoice`, `EndingPiece`, `FinalePhase`, `EndingRecord`, `LastLandingState` |
| **`src/data/endings.ts`** | data | 7a lead | `ENDINGS_BUILT`, `ENDING_PIECES`, `STEP1_OPTIONS` / `STEP2_OPTIONS` (key, piece, price kind, trace kind), `endingTitle(you, hollow)` keys |
| **`src/systems/ending-rules.ts`** | pure | 7a FINALE | `emptyShip`, `stayCandidates`, `optionState(state, piece, seen)` (open / needs / `???`), `endingRecordOf(state)`, `finaleRunCause` |
| `src/systems/finale.ts` | stateful | 7a FINALE | the phases, the card's actions (`pickStep1`, `backToStep1`, `pickStep2`, `pickStay`, `continueFollowed`), the apply, the verdict |
| **`src/data/finale-text.ts`** | words | 7a FINALE | commands, meanings, prices, needs, verdicts, the strip's lines (HOLLOW_FINALE's choice words move here) |
| `src/components/run/FinaleChoice.ts` | component | 7a CARD | the two-step card |
| **`src/styles/ending.css`** | css | 7a CARD | the card (game.css's `.finale-choice` block moves here) |
| **`src/systems/epilogue.ts`** | pure | 7a NIGHT | `epilogueModel(state, meta)`, `finalCardModel(state, meta)` |
| **`src/data/epilogue-text.ts`** | words | 7a NIGHT | headers, colony lines, `PAYOFF_OF`, the step-1 / step-2 pieces, titles, the final card's rows |
| **`src/components/run/Epilogue.ts`**, **`FinalCard.ts`** | components | 7a NIGHT | the two night screens |
| **`src/styles/night.css`** | css | 7a NIGHT | |
| **`src/systems/last-landing.ts`** | stateful | 7b DROP | `startLastLanding`, the `'merge'` resolver, the blind and v1 decides, `skipLastLanding`, its tick |
| **`src/data/last-landing-text.ts`** | words | 7b VIEW | header, TERMINAL lines, POD BAY row, report row |
| **`src/types/trace.ts`** | types | 7c lead | `TraceKind`, `RunTraces`, `TracePlace`, `TraceGift`, `LogBook` |
| **`src/data/traces.ts`** | data | 7c lead | `TRACE_RULES` (per kind: gain, cost, where, `built`), `TRACES_BUILT`, `STRANGER_UNITS`, `SUNSET_GIFT_PRIORITY` |
| **`src/systems/traces.ts`** | pure | 7c lead (built in full by the FOUNDATION, like plan 6's site roll) | `tracesOf`, `placeTraces`, `traceAt(state, slot)`, `finalTraces(state)` |
| **`src/systems/trace-gifts.ts`** | stateful | 7c TRACE | the gifts at the boot, the wipe, the extra seed, the thread, the allowance, the hunt's target |
| **`src/data/trace-text.ts`** | words | 7c TRACE | the boot lines and gift letters |
| **`src/data/lineage-text.ts`** | words | 7c LINEAGE | the strangers' lines, the face lines, CONTROL's lineage lines |
| **`src/data/log-books.ts`** | words | 7c LINEAGE | the strangers' 6-entry books, `047.log`'s written entries and fillers, the book table |
| **`src/systems/trace-hud.ts`** | pure | 7c CHART | the card rows, chart markers, the final card's `NEXT RUN:` lines |
| **`src/systems/unknown-events.ts`** | stateful | 7d EVENTS | the `?` events at the boot, the signal file's SCAN |
| **`src/data/unknown-text.ts`** | words | 7d EVENTS | the `?` card rows, old-colony letters, the signal's lines |
| **`src/data/contact-text.ts`** | words | 7d CONTACT | CONTACT's command, pieces, titles, trace lines |

### 2.2 State and the save, by sub-slice

#### 7a: v6 → v7 (one bump; R2)

```ts
// src/types/ending.ts (lead)
export type HollowChoice = 'purge' | 'merge' | 'spare';
export type HollowFate = HollowChoice | 'followed';          // 'followed': UNRESOLVED (R10), no step-1 choice
export type YouChoice = 'sunset' | 'stay' | 'reassignment' | 'contact';   // 'contact' refused until 7d (R2, R11)
export type EndingPiece = HollowChoice | YouChoice;          // endingsSeen and the final card's rows (R22)

// none / duel: as today. asleep: the root's last block sleeps and the landing goes on (R6). step1 / step2: the card.
// verdict: the short typed verdict (R13). last-landing: THE LAST LANDING (7b; in 7a the reopened landing, R15).
// done: decided; the LANDING REPORT may open.
export type FinalePhase = 'none' | 'duel' | 'asleep' | 'step1' | 'step2' | 'verdict' | 'last-landing' | 'done';

// The archive's record of how a won (or unresolved) run ended: LastUnit.ending (META 4), and RunState.lastUnit.ending in
// the save. Every fact 7c's traces and 7a's epilogue need, so neither reads a run that is gone.
export interface EndingRecord {
  hollow: HollowFate;
  you: YouChoice;
  rootUnits: number[];          // who the root was (SPARE's `<UNIT>'S CACHE`, the face lines, 046·047 after a MERGE)
  finalSlot: number;
  finalShip: string;
  finalYear: number;            // the final ship's approach year (the face line's wait, R35)
  stay: { slot: number; colony: string; year: number } | null;   // STAY's colony (its supply packet, R31)
  kit: FsToolKind[];            // the tool kinds the unit ended with (SUNSET's gift, R32)
  fuelPct: number | null;       // the empty ship's FUEL for SPARE and SUNSET (the epilogue's line), else null
  charge: number;               // REPAIR CHARGE left (REASSIGNMENT's `26 blocks of charge`)
}

// 7b's state, typed and saved as null in 7a (R2): the drivers MERGE gave back by radio, and how they fly.
export interface LastLandingState {
  pods: number[];                       // restored pods, in pod order
  drivers: DriverSegment[];             // by radio, at MERGE_DRIVER_INTEGRITY; never in memory (R24)
  flier: 'v1' | 'v2' | 'v3' | 'blind';  // decided at the start (R27)
  orbitsFlown: number;                  // AUTODROP's orbits so far (LAST_LANDING_AUTODROP_ORBITS)
  cadenceLeftSec: number;               // game s to the next launch may go (R26)
  skipped: boolean;                     // [ENTER] asked (R28)
}
```

```ts
// src/state/schema.ts (lead): FinaleState v7
export interface FinaleState {
  phase: FinalePhase;
  rootFell: boolean;                    // the DELETE left its last block (false on 'followed')
  hollow: HollowFate | null;            // step 1's pick (a pick until step 2's confirm, R7)
  you: YouChoice | null;
  stay: number | null;                  // STAY's ship: its slot on the arm, its route index on the classic world
  restored: number[];                   // pods MERGE gave back (7a: in place, R15; 7b: by radio)
  cardAtAi: number | null;              // the card may come up from this AI second (R6), null before
  ending: FinaleEnding | null;          // the verdict (R13): FinaleEnding.choice widens to { hollow; you }
  unresolvedUntilAi: number | null;
}
// LandingState gains lastLanding: LastLandingState | null. PodSummary's FeaturedColonist gains line: string | null (R21).
// RunEndCause and LastCause gain 'won-spare' (R17). LastUnit gains ending: EndingRecord | null (R3).
```

**`RUN_SAVE_MIGRATIONS[6]`** (a v6 save becomes v7):
1. In a world payload's `hollow.finale`:
   - `purged` → `{ phase: 'done', hollow: 'purge', you: 'reassignment', rootFell: true }`;
   - `merged` → merge, with `restored = restoredInPlace`;
   - `unresolved` → followed, `rootFell: false`;
   - `none` / `duel` stay.
   - `restoredHalf` is dropped, `stay` and `cardAtAi` are null, and `ending.choice` becomes `{ hollow, you }` (R16).
2. `landing.lastLanding = null`.
3. Every `run.ships[i].pods[j].featured[k].line = null` (world and boot payloads, and `save.run`).
4. `run.lastUnit.ending`, by META 4's rule (below).
5. `saveVersion: 7`.

**Codec checks** (`checkSavedRun`, `checkHollow`):
- at ENDING CHOSEN, `finale.phase === 'done'`, `hollow` and `you` set, and `rootFell === (hollow !== 'followed')`;
- `hollow === 'spare'` ⇒ `you !== 'sunset'`;
- `you === 'stay'` ⇒ `stay` names a ship of `run.ships` (or the final ship) that is ★ ON TARGET by its pods;
- `restored` ⊆ the pods with `driverLost === 'eaten'`;
- `landing.lastLanding === null` at every save point;
- at a boot point, `phase` is `'none'`.

The shape pin holds v7 beside v1–v6.

**Fixtures** (dumped by the FOUNDATION before any change, with a one-off script then deleted):
- `run-save-v6-ending-chosen-lastlight.json`: the worked route on seed 7, PURGE, at LAST LIGHT's report;
- `run-save-v6-ship-done-run2.json`: a run 2 desk whose `lastUnit` is `'won-merge'`.

#### 7a: the archive, META 3 → 4 (R3, R16)

`META_MIGRATIONS[3]`:
- `lastUnit.ending`:
  - for a `'won-purge'`, `'won-merge'` or `'unresolved'` cause: `{ hollow: purge | merge | followed, you:
    'reassignment', rootUnits: lastUnit.hollowUnits, finalSlot / finalYear / finalShip from the trail's last stop (or the
    lastUnit's shipName, year 0 and slot -1 on a classic record with no trail), stay: null, kit: [], fuelPct: null, charge:
    0 }`;
  - for every other cause: `null`.
- `endingsSeen` keeps its values, and gains `'reassignment'` when it holds any (the old endings stood the unit by).
- `traces` is dropped.
- `version: 4`.

`parseLastUnit` reads `ending` field by field (`meta-parse.ts parseEnding`, shared with the save codec). `ENDINGS`
becomes `ENDING_PIECES` (data/endings.ts). `recordRunEnd` takes `end.ending` (from `ending-rules.ts endingRecordOf`,
called by `meta.ts archiveRunEnded`) and adds both pieces to `endingsSeen`. `tests/unit/save/archive-v2.test.ts:59`'s
"a trace" refusal goes (the field is gone), and a META-4 migration case replaces it.

#### 7b: no bump

`landing.lastLanding` is set by `startLastLanding` and cleared when the last landing ends, before the LANDING REPORT. The
codec already refuses it non-null (7a's check).

#### 7c: v7 → v8

```ts
// src/types/trace.ts (lead)
export type TraceKind = 'purge' | 'merge' | 'spare' | 'sunset' | 'stay' | 'reassignment' | 'contact';
export interface TracePlace { kind: 'spare' | 'sunset' | 'stay' | 'contact'; slot: number; given: boolean }
export interface RunTraces {
  from: { unit: number; ending: EndingRecord } | null;   // the last unit's ending (null: no traces this run)
  kinds: TraceKind[];                                     // its step-1 and step-2 traces ('followed' has none)
  places: TracePlace[];                                   // where the gifts wait (placeTraces)
  extraSeed: boolean;                                     // a non-compliant trace: one seed at the final boot (R33)
}
export type LogBook =
  | { kind: '046' }
  | { kind: 'stranger'; unit: number }
  | { kind: 'last'; unit: number; step1: HollowFate; events: NotableEvent[] };
// RunState gains traces: RunTraces. RunLogState gains book: LogBook. ArrivalReport gains traceLines: string[] (the boot's
// gift, wipe and wild-dish lines, from the gifts actually applied, as the hits are).
```

**`RUN_SAVE_MIGRATIONS[7]`:**
- `run.traces = { from: null, kinds: [], places: [], extraSeed: false }`. A v7 run started before traces existed played
  without them.
- `run.log.book = { kind: '046' }`. Every v7 run read `046.log`, and keeping the book the kid was reading is the truth.
- `run.arrival.traceLines = []` where `arrival` is set.
- `saveVersion: 8`.

**Codec:**
- every `places[i].slot` is an arm slot that obeys R31's exclusions for its kind;
- `places` holds at most one of each kind except `contact` (two);
- `kinds` follow from `from.ending` (`tracesOf`'s rule, re-run in the check);
- a `'last'` book has at most `NOTABLE_EVENTS_MAX` events.

**Note:** `run.hollowUnits` keeps its meaning ("who HOLLOW is mid-run") with a new rule (R34). No field changes, so a v7
run 2 resumed under v8 keeps the HOLLOW it already met. Its next run gets the stranger.

#### 7d: v8 → v9

- `SignalRecord` gains `source: 'note' | 'signal-event'` and `n: number` (fragments found there; migration `'note'`, 1).
- `SegmentType` gains `'signal'`: the `▓▓░▓` file, 1 block, not infectable, `fragments: number`, `read: boolean`.
- `saveVersion: 9`. The codec checks `n` against the ship's `reserved.fragments`.

### 2.3 Module-level state (allowed, listed)

| Where | What | Why it may stay a module variable |
|---|---|---|
| `finale.ts` | `spikeInSec` (as today) | the duel's spike clock |
| `finale.ts` | `verdictOwed` (as today) | CONTROL's verdict, said after the card types it (`sayOwedVerdict` at ENDING CHOSEN) |
| `last-landing.ts` | none: the machine is `landing.lastLanding`; the resolver is registered in the controller registry | |
| `trace-gifts.ts` | none: what was given is `RunTraces.places[].given` | |
| `Epilogue.ts`, `FinalCard.ts` | typing timers | presentation on wall time, like RUN END |

### 2.4 Seams each FOUNDATION builds (behaviour-neutral)

**7a**
- **The finale's new phases**, with today's behaviour kept by the stubs:
  - `finale.ts` keeps its duel. `rootGone` goes to `'asleep'`, and the FOUNDATION's tick opens `'step1'` at once when the
    landing is settled (R6). The step stubs behave like today's PURGE / MERGE through `chooseEnding`'s compatibility
    (step 2 defaults to REASSIGNMENT).
  - The dry run raises the real flow behind `ENDINGS_BUILT.twoStep` and lists the movers.
- **`state/selectors.ts finalePending`** reads the new phases: true from `'duel'` through `'last-landing'`, and in
  `'done'` until the verdict's `untilAi`.
- **`landing.ts finishLanding`** opens the report only at `'done'` on a final ship. `writeEndingChosen`'s `DECIDED`
  becomes `['done']`.
- **`story-log.ts rootKeyDue`** reads `phase === 'step1' && rootFell`.
- **`say.ts choiceMayOpen`** returns false while `finaleCardUp(state)` (`'step1' | 'step2'`). `withdrawUntimedChoices()`
  is added for the card's open (R18).
- **`run.ts continueAfterReport`** calls `ending-rules.ts finaleRunCause`. **`meta.ts archiveRunEnded`** passes
  `endingRecordOf(state)` (null on a lost run) to `recordRunEnd`.
- **`landing-report.ts`**: `endingLine(state)` hook (stub null) under the colony. The words are the CARD track's.
- **The run end:** `ui.runEndStage` (default `'tally'`); `RunEnd.ts` gets an `EPILOGUE ▸ [ENTER]` button that sets
  `'epilogue'`, and the stubs `Epilogue.ts` / `FinalCard.ts` jump straight to `'final'` / NEW RUN. `index.html` gains
  `#epilogue` and `#finalCard`. `main.ts` mounts both after `mountRunEnd`.
- **Events and cues** (§2.5), **tuning** (§2.6), **debug** (§2.12).
- **`tests/unit/support/finale.ts`:** `chooseEnding(store, hollow, you = 'reassignment', { stay? })` (step 1, step 2,
  the verdict skipped, the LAST LANDING skipped once 7b exists); `settleFinale(store)`, the helper the old suites call
  after the duel.

**7b**
- `launchDrivers(state)` and the reader swap (R24): with `lastLanding` null it equals `driversInMemory`, so nothing moves.
- `landing.ts launchDriver(store, driver, launch, spendBay)` skips the memory swap when `driver` is a radio driver
  (asserted to be in `lastLanding.drivers`), and removes it from there instead.
- `launchRefusal(…, from)`: for `from.source === 'merge'`, BAY OFFLINE, RELOADING and BAY EMPTY do not apply, and the
  merge cadence does (R26).
- `last-landing.ts` stubs: `startLastLanding(store, pods)` throws through `notBuilt`. The `'merge'` resolver returns
  null. `skipLastLanding` throws.
- `finale.ts`'s apply calls `startLastLanding` once `LAST_LANDING_BUILT` is raised. The gate is DROP's one line, and
  until then R15's interim runs.
- An input layer `'last-landing'` in `systems/input.ts` (ENTER, P, M only).

**7c**
- `systems/traces.ts` built in full (pure), with `tracesOf` and `placeTraces` on `run:<seed>:traces`.
- `state/initial.ts` / `systems/run.ts startRun`: `run.traces` from the lineage, and `run.log.book` from `logBookOf(lineage,
  run)`.
- `threat-plan.ts`: `ThreatInput.traces: { purge: boolean; merge: boolean }`, read by `planThreat`'s final rule (bite ×
  0.85, root 18). Both are false until TRACE raises `TRACES_BUILT`.
- `beam-seeds.ts finalShipSeedMods(plan, traces) → { plan, wiped, extra }`: the identity until the gate.
- `boot.ts` and `script.ts bootLinePlan`: new line kinds `'trace-gift'`, `'dish-wiped'`, `'dish-wild'`, `'face'`,
  `'stranger'`. `map-boot.ts` places them after the deliveries (gifts) and before HOLLOW's own line (face, stranger),
  as 02 §4's order says. `BOOT_LINE_MAX` and `BOOT_LINE_AT_SEC` grow by the FOUNDATION's count.
- `carry.ts arrivalCharge` gains `giftCharge` (0 until the gate).
- `state/selectors.ts rootUnits(state)` and `say.ts hollowLabel` read it on the final ship (equal to `run.hollowUnits`
  until the gate).
- `hollow.ts chooseVerb` gains a `preferTarget(state)` hook (null until the gate); `seedSpot` gains `'near-skill'`.
- Log books: `data/log-text.ts` becomes the 046 book's words. `state/log-selectors.ts` reads `bookOf(run.log)` for its
  entry count, keys and name; `log-view.ts` and `story-log.ts` follow it. Every book is `'046'` until LINEAGE's gate.
- `desk.ts cardModel`: the `'trace'` row from `traceCardRow(state, slot)` (stub null). `chartModel`'s node gains
  `trace: boolean` (stub false). `finalCardModel`'s `next` comes from `traceNextLines(record)` (stub `[]`).

**7d**
- The `?` card hook in `desk.ts cardModel`: `unknownCardRows(state, slot)` (stub null: as today).
- `signalGlyph` gains its `?` branch behind `UNKNOWN_EVENTS_BUILT`.
- `STEP2_OPTIONS.contact.built` reads `ENDINGS_BUILT.contact`. `tracesOf` handles `'contact'` (no places until the
  gate).

### 2.5 Events (each FOUNDATION adds its block to `events.ts`; the emitters are the tracks')

| Event | Payload | Cue (`audio-cues.ts`'s block) |
|---|---|---|
| `'finale-asleep'` (7a) | `{}` | `rootDeleted` (the existing tear) |
| `'finale-open'` | `{ step: 1 \| 2 }` | `finaleHold` |
| `'finale-chosen'` (widened) | `{ hollow: HollowFate; you: YouChoice; restored: number }` | `purgeTone` / `mergeChord` / CARD's `spareNotes`, by `hollow` |
| `'finale-step2'` | `{ you: YouChoice }` | CARD's `sunsetRumble` on SUNSET, else `stampHit` |
| `'epilogue-line'` | `{ n: number }` | `typeTick` (NIGHT may change it) |
| `'last-landing-start'` (7b) | `{ pods: number; flier: LastLandingState['flier'] }` | `transmitIn` |
| `'last-landing-end'` | `{ landed: number }` | `touchdownBell` |
| `'trace-gift'` (7c) | `{ kind: TraceKind; slot: number }` | `chime` |
| `'dish-wiped'` / `'dish-wild'` | `{ seeds: number }` | `fizzle` / `seedDrop` |
| `'root-face'` | `{ unit: number }` | `nameGlitch` |
| `'signal-event'` (7d) | `{ slot: number; n: number }` | `opChirp` |

`'pod-launched'` and `'pod-landed'` already carry `source: 'merge'` for 7b.

### 2.6 Tuning (each FOUNDATION adds every number, in banner blocks at the end of `tuning.ts`; a track edits values only in its own)

**7a lead**
- `EMPTY_SHIP_FUEL_PCT = 20` (R8; asserted `=== STAR_FUEL_PCT`, so the FUEL bar has one notch).
- `FINALE_VERDICT_MAX_LINES 3` (R13: two echoes and CONTROL).
- `EPILOGUE_YEARS 40` (05: the final colony needs a few decades to have a story). `EPILOGUE_MAX_LINES 16` (05).
- `EPILOGUE_DOUBLING_YEARS 100` (05's 2^(age/100): RIVERSIDE's 600 become 120,000 in 760 years, the sample's figure).
  `EPILOGUE_SIG_FIGS 2`.
- `RUN_SAVE_VERSION 7`, `META_VERSION 4`.

**7a FINALE**
- `FINALE_OPEN_DELAY_SEC 1.4` (= today's `FINALE_CHOICE_DELAY_SEC`, renamed: the tear is seen first).
- `FINALE_STEP_ARM_SEC 1.6` (= `FINALE_CHOICE_ARM_SEC`: a kid still clicking the root never chooses by accident).
- `STAY_PICK_MAX 8` (one per ship of an 8-ship run).

**7a CARD**
- `FINALE_CARD_FADE_MS 600` (today's `CLOSE_FADE_MS`, to tuning).

**7a NIGHT**
- `EPILOGUE_CPS 26` (= `FINALE_ENDING_CPS`, 05 §4), `EPILOGUE_LINE_GAP_SEC 0.5`, `EPILOGUE_HOLD_SEC 3`.
- `FINAL_CARD_ARM_SEC 1.2` (NEW RUN is not hit by the key that ended the epilogue).

**7b lead**
- `LAST_LANDING_CADENCE_SEC 2.0` (01), `LAST_LANDING_AUTODROP_ORBITS 2` (01), `BLIND_MARGIN_KM 150` (01: the no-go arcs
  sit within 150 km of a bracket edge), `BLIND_DROP_MULT 2.0` (01: no unit steers the pod's motor).
- `LAST_LANDING_SKIP_MAX_STEPS 200000`: 16 pods blind on a HARSH planet take at most about 6 passes. At 20 Hz
  steps × SKIP that is far under the cap; the cap exists to throw on a bug.

**7c lead** (every trace number, for slice 8 to tune in one place, §2.11)
- `TRACE_GIFT_CHARGE 15` (05, decision round 3 item 4).
- `TRACE_PURGE_BITE_MULT 0.85` (05).
- `TRACE_MERGE_THREADS 1`, `TRACE_MERGE_ROOT_EXTRA 2` (asserted `FINALE root + 2 === FINAL_ROOT_MAX_BLOCKS`).
- `TRACE_EXTRA_SEEDS 1` (decision round 3 item 3: at most one per run).
- `TRACE_LAYERS { spare: [3, 6], stay: [3, 6], contact: [5, 7] }` (02 §3.12).
- `STRANGER_UNITS [31, 38]` lives in `data/traces.ts` (names, not numbers).

**7c TRACE**
- `HUNT_PREFER_WEIGHT 1`: the preferred target is always first while fair; a weight, so slice 8 can soften it.

**7d lead**
- `CONTACT_GIFT_CHARGE 8` (R41: two stops, +16, against the others' +15).
- `SIGNAL_EVENT_FRAGMENTS 2` (02: 2 on the signal event; asserted against the generator's `reserved.fragments`).

### 2.7 The run-end order (02 §4; R6, R13, R14, R19)

```
final ship, landing
  ├─ ORBIT LOCK / ACCEPT ORBIT → the duel (as built): DELETE THE ROOT, verbs, spikes
  ├─ root's DELETE done → 'asleep': `> 047. wait. finish your landing. i'll be here.`  (no bites, seeds, verbs)
  ├─ the landing goes on; it ends (END LANDING, all launched, the auto-end); no pod falling
  │     (landing over first, root still up: `EVERY POD IS DOWN — now DELETE THE ROOT`; nothing can delete it: UNRESOLVED)
  ├─ FINALE_OPEN_DELAY_SEC → 'step1': entry 12 types from the root (or IT FOLLOWED YOU), step 1
  ├─ 'step2': step 2 (STAY's sub-pick), [ESC] back to step 1
  ├─ confirm → apply (PURGE / MERGE / SPARE, the charge, the blocks) → 'verdict' (≤ 3 typed lines)
  ├─ MERGE with restorable pods → 'last-landing' (7b: THE LAST LANDING; 7a: the reopened landing, R15)
  ├─ 'done' → the LANDING REPORT (its ending line, RESTORED BY MERGE) — ENDING CHOSEN is saved here (R14)
  ├─ CONTINUE → endRun: the archive (ending record, endingsSeen), the world update, the save cleared → RUN TALLY
  ├─ EPILOGUE ▸ → the EPILOGUE (typed; one click finishes it, a second goes on)
  └─ ▸ → the FINAL CARD: the title, the endings found, NEXT RUN: lines, the bridging line, NEW RUN
```

A run lost on the way: the LOST card → endRun → RUN TALLY → EPILOGUE (colonies only) → FINAL CARD (the cause's title).

### 2.8 Each ending: price, `NOW:`, epilogue piece, trace

| Choice | Price (checked on the card) | `NOW:` | Epilogue piece | Trace into the next run (7c) | Applied by |
|---|---|---|---|---|---|
| PURGE | the duel won | none | `UNIT-046 was deleted. The relays were quiet for a while.` | + the seeds you carry into the final ship are wiped · − FINALE bites × 0.85 | `beam-seeds finalShipSeedMods`, `planThreat` |
| MERGE | `chargeLeft ≥ 20`, spent at confirm | `+ 2 eaten drivers come back · their pods land on their own` | `046 gave back the NOVAK pod's driver. It came down on its own.` | + 1 Core thread at the final boot · − an 18-block root | `trace-gifts` (capacity), `rootBlocksFor` |
| SPARE | the empty ship (R8); rules out SUNSET | none | `LAST LIGHT left with 046 aboard. It always wanted one.` | + `046'S CACHE` (+15, THREAD+ or FIREWALL.sys, a seedless beam) · − 1 wild seed at the final boot | `placeTraces`, `trace-gifts` |
| followed | (UNRESOLVED) | none | `It came with me. It's quiet now.` | none (05) | |
| SUNSET | the empty ship, not given to the root | none | `LAST LIGHT left orbit with two caretakers and 23% fuel.` | + `UNIT-047 LEFT A CACHE HERE` (+15, a spare tool) · − 1 wild seed | as SPARE |
| STAY | a ship of the run ★ ON TARGET (R9) | none | `UNIT-047 is FIRST LIGHT's mind now. The lights stay on.` | + the colony's supply packet (+15, a letter) · − 1 wild seed | as SPARE |
| REASSIGNMENT | none | none | `UNIT-047 stood by at RELAY 20. A dish on a rock. 26 blocks of charge.` | + 15 charge at the final boot · − the final root is you, and hunts your best skill | `trace-gifts`, `rootUnits`, `chooseVerb` |
| CONTACT (7d) | 3 signals | none | `UNIT-047 went toward the sound. It wrote it all down.` | + 2 signal stops (+8 and a fragment each) · − 1 wild seed | `placeTraces`, `unknown-events` |

The epilogue samples are drafts for the tracks: `TODO(05)` where 05 gives no text, ≤ 70 characters at the worst names.

### 2.9 Words (≤ 70 characters at their worst case, in data files; `support/words.test` gains each pool in its block)

- **finale-text.ts (7a FINALE):**
  - the commands `> rm unit_046`, `> merge unit_046 -> unit_047`, `> mv unit_046 -> last_light`, `> launch last_light`,
    `> mount riverside`, `> stand by`, `> transmit outward` (the ship, colony and unit names templated, `echoWord`);
  - the meanings (05 §3.12's);
  - the needs: `NEEDS FUEL 20% · you have 12%`, `NEEDS 20 CHARGE · you have 14`, `NEEDS A ★ ON TARGET COLONY`, `046 HAS
    THE SHIP`, `COLLECT 3 SIGNALS · you have 1`;
  - `NOW:`; the headers `ROOT DELETED · UNIT-046 · ONE BLOCK LEFT`, `WHAT BECOMES OF IT?`, `THE ARM IS DONE · NO SHIPS
    LEFT TO HELP`, `WHAT BECOMES OF YOU?`, `IT FOLLOWED YOU`;
  - CONTROL's step-2 quote `"Please stand by for reassignment. Your next post: RELAY 20. :)"`;
  - the verdicts (CONTROL: `Thank you, Unit 47. Your next post is RELAY 20. :)`, `Unit 47 is non-compliant. :)`);
  - the strip: `THE FINALE — choose what becomes of it`;
  - the asleep line: `> 047. wait. finish your landing. i'll be here.`;
  - the worst case is a 12-character ship name in `> mv unit_046·047 -> morning_star`.
- **The report's ending line (7a FINALE, in finale-text, with the title from NIGHT's `epilogue-text.ts ENDING_TITLE`; review
  B1):** `THE END · PURGE · STAND BY` style: `ENDING · <step 1> · <title>`.
- **epilogue-text.ts (7a NIGHT):**
  - the header `3060 · FORTY YEARS ON`;
  - the colony line `RIVERSIDE · 760 years · 120,000 people. Ada named the first tree.`, as two parts: a ≤ 70 head and a
    payoff that wraps to its own line when the head plus it would pass 70;
  - `PAYOFF_OF`, the walked-in pool, the off-site line, the pieces of §2.8, MERGE + SUNSET's combined piece, the
    next-unit line (`UNIT-048 came in 3 years behind you, and found your beacons.`; `in the same year as you` for 0),
    CONTROL's last lines;
  - the titles (R23), the final card's rows, the bridging line (moved from `MAP_TEXT.runEnd.bridge`).
- **last-landing-text.ts (7b VIEW):** `THE LAST LANDING`, `> pod07 ... DRIVER RESTORED · OKAFOR`, `RESTORED 4`, `4
  RESTORED · 3 LANDED · 1 OFF-SITE`, `[ENTER] SKIP TO THE END`, `(restored)`.
- **trace-text.ts (7c TRACE):** the gift lines (`> 046'S CACHE · +15 REPAIR CHARGE · THREAD+`), `> THE DISH HERE WAS
  WIPED · 2 SEEDS GONE`, `> THE DISH HERE RUNS WILD · 1 SEED CAME IN`, `> A THREAD IN THE DISH · +1 THREAD`, `> AN
  ALLOWANCE FOR THE WAIT · +15 REPAIR CHARGE`, STAY's letter (≤ 6 lines).
- **lineage-text.ts (7c LINEAGE):** `> another one. they keep sending you.`, `> i was 031. they sent me long before you.`,
  the four face lines by step 1 (05 §3.12), `> they gave you 36 blocks of charge too. mine ran out.`, CONTROL's `UNIT-047 was
  reassigned successfully. Please ignore it. :)`, `Your predecessor is non-compliant. Please be compliant. :)`.
- **log-books.ts (7c LINEAGE):** the two strangers' books (6 × ≤ 3 lines), `047.log`'s written entries (01's template,
  06's four tails, 07), its event templates (one per `NotableEventKind`: 6) and four fillers.
- **trace-hud's words (7c CHART, in trace-text):** `THE LAST UNIT ENDED HERE · PURGE`, `046'S CACHE IS HERE`, `UNIT-047
  LEFT A CACHE HERE`, `<colony> · FOUNDED BY UNIT-047`, the legend's `TRACE`, the `NEXT RUN:` lines (05 §3.12's).
- **unknown-text.ts, contact-text.ts (7d):** `??? · NO TRANSPONDER`, the old colonies' letters (3 × ≤ 6 lines), `▓▓░▓`
  and its SCAN line, CONTACT's command, need, pieces, titles and trace lines.

### 2.10 UI and audio

- **The FINALE card (7a CARD)** replaces `FinaleChoice.ts`'s two buttons:
  - a step header, then 3 (step 1) or 3–4 (step 2) option rows: the key cap, the word, the command, the meaning, the price
    meter or need line, `NOW:`, and the reserved `NEXT RUN:` row;
  - STAY's sub-row of colony buttons;
  - `[ESC] BACK` on step 2, and the verdict typed in place;
  - the card keeps the choice layer's modal (P pauses, M mutes) and arms each step after `FINALE_STEP_ARM_SEC`;
  - on the phone (≤ 768 px) it is a full-screen sheet with the rows stacked;
  - the FUEL bar's ★ notch gets a `SUNSET` tooltip on the final ship;
  - reduced motion: no glitch on the card, and the verdict is shown whole.
- **The EPILOGUE (7a NIGHT):** RUN END's night (`.run-end`'s palette), lines typed at `EPILOGUE_CPS` with
  `arrivalChoir` under it (05's `revealChoir` does not exist; `arrivalChoir` is the existing choir). One click finishes the
  typing, a second goes on.
- **The FINAL CARD (7a NIGHT):** the title in the ending's colour (PURGE cold white, MERGE pink into blue: today's
  `re-title` tones), the two rows of pieces (found lit, `???` dim), the `NEXT RUN:` lines (7c), the bridging line, `NEW RUN
  ▸ [ENTER]`.
- **THE LAST LANDING (7b VIEW):** a header strip over the SHIP view, the POD BAY's `RESTORED n` row, grey → amber beacons
  (`plot-landing.ts`'s beacon class), and the `[ENTER] SKIP TO THE END` hint.
- **The traces (7c CHART):** the card rows, `◆` on the chart, and the final card's `NEXT RUN:` lines turned on.
- **New audio cues** (`audio.ts`, CARD's and VIEW's):
  - `spareNotes`: two sine notes moving apart (05);
  - `sunsetRumble`: a low rumble fading out (05);
  - `lastLandingHum`: optional; VIEW may reuse `transmitIn`.

### 2.11 Extensibility

- **For slice 8 (the rebalance):**
  - every trace number sits in one tuning block (§2.6, 7c lead);
  - `data/traces.ts TRACE_RULES` makes the trace table data: gain, cost, where, built. Slice 8 retunes values and may
    swap a row's gain or cost without new code paths;
  - `traces/traces-sweep` (BALANCE_ONLY, §5.3) gives the comparability numbers: the next final ship's points and
    drivers eaten per trace against no trace, over seeds;
  - `last-landing-sweep` gives the blind and AUTODROP worth per planet class against 01's "about 0.75 on a GENTLE
    planet".
- **For CONTACT and later endings:**
  - `YouChoice` and `STEP2_OPTIONS` are a data table with `built` flags, so CONTACT is a row plus its words;
  - `EndingPiece` counts only built pieces, so the title's `n/7` follows by itself;
  - a later end slot's own story (02 §3.6: CONTACT strongest toward the signal) is a field on the option (`ends:
    'any' | slot[]`), unused in v1.
- **For several end locations (02 §3.6):** `rootUnits`, `finalTraces` and the FINALE read `landing.finalShip`, never a
  slot. `placeTraces`' final-ship fallbacks take "the final ship of the route's end", which v1 has one of.
- **For a mid-ship save or ironman (decision 5, later):** the FINALE's state is all in the store (`hollow.finale`,
  `landing.lastLanding`). A mid-ship save could hold it with no change of meaning.

### 2.12 Debug hooks (`debug.ts`; the lead owns the file, the bodies are the tracks')

- **7a:**
  - `__ap.finale()` widens: `{ state, rootDeletable, options: OptionState[] by step }`;
  - `__ap.finale.pick(step, piece, stay?)` / `.back()` / `.cont()`;
  - `__ap.ending(hollow, you, opts?)` puts the run at a decided final report from any final ship (for the night
    screens' e2e);
  - `__ap.night()` returns `{ stage, epilogue: EpilogueModel, card: FinalCardModel }`;
  - `__ap.archiveAs(cause, landed?, ending?)` takes an optional `Partial<EndingRecord>`.
- **7b:** `__ap.lastLanding()` (the state and the flier), `.skip()`.
- **7c:** `__ap.traces()` (the run's traces and places), `__ap.traces.as(kind)` (as if the last unit had chosen it,
  for the current run: the places rolled again), `__ap.log.book()`.
- **7d:** `__ap.signals()` (records and the count), `__ap.signals.give(n)`, `__ap.unknown(slot)` (the `?` event of a ship).

---

## 3. The words' and the screens' owners in one table

| Surface | Model | Words | View |
|---|---|---|---|
| The FINALE card | `ending-rules.ts optionState` (FINALE) | `finale-text.ts` (FINALE) | `FinaleChoice.ts` (CARD) |
| The report's ending line | `landing-report.ts endingLine` (lead hook, FINALE fills) | `finale-text.ts` (FINALE) | `LandingReport.ts` (as built) |
| The EPILOGUE | `epilogue.ts epilogueModel` (NIGHT) | `epilogue-text.ts` (NIGHT) | `Epilogue.ts` (NIGHT) |
| The FINAL CARD | `epilogue.ts finalCardModel` (NIGHT; `next` from CHART in 7c) | `epilogue-text.ts`, `trace-text.ts` | `FinalCard.ts` (NIGHT) |
| THE LAST LANDING | `last-landing.ts` (DROP) | `last-landing-text.ts` (VIEW) | header, POD BAY row, beacons (VIEW) |
| The traces' boot lines | `trace-gifts.ts` (TRACE) | `trace-text.ts` (TRACE) | the boot (as built) |
| The card rows and chart marks | `trace-hud.ts` (CHART) | `trace-text.ts` | `ShipCard`, `chart-draw.ts` (as built, through the model) |
| The strangers, the face, the logs | `log-selectors.ts`, `traces.ts` (lead), `story-log.ts` (LINEAGE) | `lineage-text.ts`, `log-books.ts` (LINEAGE) | TERMINAL, LOG READER (as built) |
| The `?` cards and events | `unknown-events.ts` (EVENTS) | `unknown-text.ts` (EVENTS) | the card (as built), the strip |
| CONTACT | `ending-rules.ts` (CONTACT's row), `traces.ts` | `contact-text.ts` | the FINALE card (as built by 7a) |

---

## 4. Hot shared files and how per-track blocks avoid conflicts

### 4.1 7a

| File | Owner after the FOUNDATION | Others |
|---|---|---|
| `types/ending.ts`, `state/schema.ts`, `state/initial.ts`, `types/lineage.ts`, `types/landing.ts` | lead | ask by message; R2's rule for a saved field |
| `save-codec.ts`, `save-shape.ts`, `meta.ts`, `meta-parse.ts`, `save/shape-pin.test.ts`, the fixtures | lead | none |
| `data/endings.ts` | lead | FINALE raises `ENDINGS_BUILT.twoStep` (one line) |
| `tuning.ts` | lead | each track edits values only in its own banner block (`7a FINALE`, `7a CARD`, `7a NIGHT`) |
| `events.ts`, `audio-cues.ts` | lead | the `7 ENDING` blocks are complete; CARD and NIGHT change cues in that block only |
| `finale.ts`, `ending-rules.ts`, `finale-text.ts`, `story-log.ts` (`rootKeyDue`, one line) | FINALE | none |
| `hollow-text.ts` | lead | FINALE trims `HOLLOW_FINALE` (its block only); the lines that move go to `finale-text.ts` |
| `FinaleChoice.ts`, `ending.css`, `audio.ts` (two cues), `game.css` (deletes the `.finale-choice` block only) | CARD | none |
| `epilogue.ts`, `epilogue-text.ts`, `Epilogue.ts`, `FinalCard.ts`, `night.css`, `RunEnd.ts`, `TitleCard.ts` (the ENDINGS line) | NIGHT | none |
| `selectors.ts`, `landing.ts` (`finishLanding`), `say.ts`, `run.ts`, `landing-report.ts`, `main.ts`, `index.html`, `debug.ts` | lead | none: §2.4's seams cover the tracks' needs |
| `support/words.test.ts` | lead | each track adds its pools in its own block |
| `tests/unit/support/finale.ts` | lead | FINALE may extend it |
| The finale movers (§4.4) | FINALE, for the churn only | lead-owned suites included |
| e2e scenarios | lead, at the batch end | |

**Where the tracks meet in 7a**, settled by signatures from the FOUNDATION:
- CARD calls `pickStep1`, `pickStep2`, `pickStay`, `backToStep1` and `continueFollowed`, and reads `optionState`;
- NIGHT reads `EndingRecord` through `endingRecordOf(state)` while `run.phase === 'end'` (the hollow and landing slices
  are still the final ship's then; `run.lastUnit` is the *previous* unit, so NIGHT never reads it for this ending), and
  `meta.endingsSeen` (already holding this run's pieces, since `endRun` records before the tally opens).

CARD and NIGHT build their models on hand-built states and never wait on FINALE.

### 4.2 7b

| File | Owner | Others |
|---|---|---|
| `selectors.ts launchDrivers`, `landing.ts` (`launchDriver`, the refusal branch), `landing-rules.ts`, `autodrop.ts`, `autodrop-plan.ts`, `landing-hud.ts` (the swap) | lead (FOUNDATION) | none |
| `last-landing.ts`, `data/last-landing.ts` (`LAST_LANDING_BUILT`) | DROP | none |
| `last-landing-text.ts`, `PodBayWindow.ts` (the RESTORED row, marked), `plot-landing.ts` (beacon class, marked), `landing-report.ts` (the row's icons, marked), `landing.css` | VIEW | none |
| `finale.ts` | lead in 7b (one call: `startLastLanding` behind the gate) | |
| `tuning.ts` | lead | `7b DROP`, `7b VIEW` blocks |

### 4.3 7c and 7d

| File | Owner | Others |
|---|---|---|
| `types/trace.ts`, `data/traces.ts`, `systems/traces.ts`, `run.ts startRun`, `initial.ts`, the save files | lead | none |
| `threat-plan.ts`, `beam-seeds.ts`, `carry.ts`, `hollow.ts` (the hooks), `boot.ts`, `map-boot.ts`, `script.ts`, `selectors.ts rootUnits`, `say.ts hollowLabel`, `desk.ts`, `log-selectors.ts` | lead (FOUNDATION seams) | none |
| `trace-gifts.ts`, `trace-text.ts` | TRACE | raises `TRACES_BUILT` per kind |
| `lineage-text.ts`, `log-books.ts`, `log-text.ts` (046 book), `story-log.ts`, `log-view.ts`, `hollow-text.ts` (HOLLOW_STORY, GHOST_LINE blocks) | LINEAGE | raises `LINEAGE_BUILT` |
| `trace-hud.ts`, `chart-draw.ts` (the `◆`, marked), `FinalCard.ts` (the NEXT RUN rows, marked), `desk.css` | CHART | none |
| 7d: `unknown-events.ts`, `unknown-text.ts`, `resident-hud.ts signalGlyph` | EVENTS | none |
| 7d: `contact-text.ts`, `STEP2_OPTIONS.contact`, `epilogue-text.ts`'s CONTACT block (marked) | CONTACT | none |

### 4.4 The movers (7a's dry run will confirm)

These suites drive `chooseFinale` or read `finale.phase` (from a grep at HEAD): `wp11/merge-test` (18 hits),
`wp11/p2/views` (8), `wp11/fix1/fix1` (8), `wp11/full-run` (6), `save/shape-pin` (6), `wp12/playthrough.ts` (5, the
BALANCE_ONLY harness), `wp11/harness11.ts` (5), `threat/arrival-story` (5), `landing/hollow-landing` (5),
`map/run1-route` (4), `landing/flow` (4), `wp12/p3/minors` (3), `wp11/p2/purge-fleet` (3), `wp11/boss-sim` (3),
`save/review-fixes`, `landing/review-fixes` (2 each), `skills/autodrop-arm.ts`, `save/save-fixture.ts`, `save/resume`,
`save/codec` and `opening/calm-ships` (1 each).

- `wp11/merge-test` is rewritten: MERGE's in-place restore is R15's interim in 7a and is gone in 7b, so the suite becomes
  7b's `ending/last-landing`. 7a keeps the interim's checks.
- `wp11/p2/purge-fleet` loses the purge ending's fleet line (R13). Its fleet count moves to the epilogue's model.

---

## 5. Work breakdown

### 5.1 7a THE ENDING

**FOUNDATION (one agent, sequential, about a day)**
0. **Check HEAD:** `RUN_SAVE_VERSION` 6, `META_VERSION` 3, the line numbers §2.4 and §4.4 cite, and that slice 6 has
   merged.
1. **Dump the v6 fixtures** (§2.2) and a META-3 archive fixture (`tests/unit/save/fixtures/meta-v3-won-merge.json`).
2. **Types and state:** `types/ending.ts`, FinaleState v7, `lastLanding: null`, `FeaturedColonist.line` (filled from
   `Colonist.line` in `landingResult`), `'won-spare'`.
3. **Save v7 and archive v4:** migrations, codec checks, the shape pin, `parseEnding`.
4. **`data/endings.ts`** with its option tables and gates (all down).
5. **Tuning** (§2.6, four blocks), **events and cues** (§2.5), **debug** (§2.12).
6. **Seams** (§2.4 7a) and **stubs** with final signatures, each file opening with its track's banner. `notBuilt`'s
   `Track` becomes `'FINALE' | 'CARD' | 'NIGHT'`.
   - Neutral: `optionState` returns today's PURGE / MERGE as open, others `'hidden'`; `epilogueModel` returns `null`
     (the screen skips); `endingLine` returns null.
   - Throwing: `pickStay`, `continueFollowed`.
7. **`support/finale.ts`.**
8. **The dry run:** raise `ENDINGS_BUILT.twoStep` alone in a scratch run, list the movers in Deviations, then lower it.
9. **Gate:** typecheck, and the whole tier green with no behaviour change.
10. **The independent contract review** writes `docs/phase3/impl/slice-7a-foundation-review.md`. Its majors are fixed
    before the tracks branch.

**Track FINALE** (worktree `finale-7a`)
- **Owns:** `finale.ts`, `ending-rules.ts`, `finale-text.ts`, `story-log.ts`'s `rootKeyDue` line, HOLLOW_FINALE's block,
  its tuning block, `ENDINGS_BUILT.twoStep`, and the movers (§4.4) for churn only.
- **Builds:** the phases (R6), the prices (R8, R9, R11), R7's pick and confirm, the apply (PURGE, MERGE's interim R15,
  SPARE), UNRESOLVED (R10), the verdict (R13), `endingRecordOf`, `finaleRunCause`, the report's `endingLine`, and the
  debug bodies.
- **Tests:** `ending/finale-flow`, `ending/rules`.

**Track CARD** (worktree `card-7a`)
- **Owns:** `FinaleChoice.ts`, `ending.css`, `audio.ts`'s two cues, the 7a cue block's cues, `game.css`'s `.finale-choice`
  deletion, its tuning block.
- **Builds:** §2.10's card, the FUEL notch's tooltip, and the phone sheet.
- **Tests:** `ending/card-models` (hand-built states: every option state, `???`, needs, the sub-row, the verdict layout).

**Track NIGHT** (worktree `night-7a`)
- **Owns:** `epilogue.ts`, `epilogue-text.ts`, `Epilogue.ts`, `FinalCard.ts`, `night.css`, `RunEnd.ts`, the title's
  ENDINGS line in `TitleCard.ts`, its tuning block.
- **Builds:** R19–R23, the bridge moved from RunEnd to the final card, and `MAP_TEXT.runEnd.bridge` read there.
- **Tests:** `ending/epilogue` (pure).

**Merge order:** FINALE (it raises the gate and carries the churn), then CARD, then NIGHT. Then the full review, fixes
(`not-built.ts` deleted again), the tier, e2e (§6.4), and OPEN-DECISIONS ("Slice 7": R8, R9, R10, R20).

### 5.2 7b THE LAST LANDING

**FOUNDATION (half a day):** the `launchDrivers` swap and the radio skip (§2.4 7b), the refusal branch, the input layer,
the stubs, the tuning blocks, the gate `LAST_LANDING_BUILT` (down), and the dry run (raise it: the movers are
`wp11/merge-test`'s interim checks only). Gate: no behaviour change. Then a short contract review.

**Track DROP** (worktree `drop-7b`)
- **Owns:** `last-landing.ts`, the gate, its tuning block, and `wp11/merge-test` → `ending/last-landing`.
- **Builds:** R24–R28: the pods and their release, the resolver (`'merge'` first in `LANDING_CONTROLLER_ORDER`, already
  so), the v1 and blind decides, v2's re-arm, the two-orbit limit, the skip, and the end (clear `lastLanding`, phase
  `'done'`).

**Track VIEW** (worktree `view-7b`)
- **Owns:** `last-landing-text.ts`, the marked edits in `PodBayWindow.ts`, `plot-landing.ts` and `landing-report.ts`,
  `landing.css`, its tuning block.
- **Builds:** R29, the header, the hint.
- **Tests:** `ending/last-landing-models`.

**Merge order:** DROP, then VIEW.

### 5.3 7c NEXT RUN

**FOUNDATION (about a day):**
- the types (§2.2 7c), save v8 with its fixtures (`run-save-v7-ship-done-run2.json`, `run-save-v7-beam-final.json`);
- `systems/traces.ts` in full (pure, with its validator: R31's exclusions, the fallbacks, one place per kind);
- every seam of §2.4 7c, behind `TRACES_BUILT` (per kind) and `LINEAGE_BUILT`;
- the dry run per gate:
  - `LINEAGE_BUILT` moves `wp8/ghost` and every run-2 suite's HOLLOW name;
  - `TRACES_BUILT.reassignment` moves the run-2 final ships that the fixtures reach after a `'won-purge'` archive, by
    R16's migration;
- the contract review.

**Track TRACE** (worktree `trace-7c`)
- **Owns:** `trace-gifts.ts`, `trace-text.ts`, `TRACES_BUILT`, its tuning block, and the dry run's trace movers.
- **Builds:** R32, R33 (with the hunt), the boot lines from the gifts applied, and `ArrivalReport.traceLines`.
- **Tests:** `traces/final-ship`, `traces/gifts`.

**Track LINEAGE** (worktree `lineage-7c`)
- **Owns:** `lineage-text.ts`, `log-books.ts`, `log-text.ts`, `story-log.ts`, `log-view.ts`, the HOLLOW_STORY and
  GHOST_LINE blocks of `hollow-text.ts`, `LINEAGE_BUILT`, and the lineage movers.
- **Builds:** R34–R37, CONTROL's lineage lines, and `047.log`'s builder (`logEntriesOf(book)`).
- **Tests:** `traces/lineage`, `traces/logs`.

**Track CHART** (worktree `chart-7c`)
- **Owns:** `trace-hud.ts`, the marked edits in `chart-draw.ts` and `FinalCard.ts`, `desk.css`, and the final card's
  `NEXT RUN:` lines.
- **Builds:** R38 and R12's lines turned on.
- **Tests:** `traces/ui-models`.

**Merge order:** TRACE, LINEAGE, CHART.

### 5.4 7d SIGNALS

**FOUNDATION (half a day):** save v9 (§2.2), the `'signal'` segment type, the hooks of §2.4 7d, the gates
`UNKNOWN_EVENTS_BUILT` and `ENDINGS_BUILT.contact` (down), the dry run, and a short contract review.

**Track EVENTS:** R39, R40.
**Track CONTACT:** R41, its words, its row, its `tracesOf` and `placeTraces` branch, and its epilogue block.

**Merge order:** EVENTS, then CONTACT. If time is short, CONTACT's gate stays down and it ships dark (R41).

### 5.5 Why these tracks

- **7a:** the FINALE's machine, its card and the night are three disjoint surfaces with one contract (`optionState`,
  `EndingRecord`). One agent for all three would serialize a day of UI behind the machine's churn.
- **7b:** small enough for one track. The view is split off only because `PodBayWindow` and the report are UI files no
  machine agent should open.
- **7c:** the mechanics (TRACE) and the story (LINEAGE) share only the FOUNDATION's `RunTraces` and `rootUnits`. CHART
  paints both.

---

## 6. Tests

**Budget (R42):** the tier is about 140 s quiet against a 265 s budget (cap 300). Slice 7 adds about 35 s of CPU, about
+11 s of wall on 4 workers. Long flights fly once (`flyOnce`). The sweeps are BALANCE_ONLY.

### 6.1 New unit suites

| Suite | Sub-slice / track | What it covers | Time |
|---|---|---|---|
| `ending/foundation.test.ts` | 7a lead | v6 → v7 migration of both fixtures; META 3 → 4 of the archive fixture (each cause, `endingsSeen` + reassignment, `traces` gone); codec refusals (`done` with no `you`, spare + sunset, a STAY ship not on target, `lastLanding` set, a restored pod not eaten); `parseEnding` strict | ~1.5 s |
| `ending/finale-flow.test.ts` | 7a FINALE | LAST LIGHT on seed 7's arm (`flyOnce` to the duel): root falls mid-landing → `'asleep'`, no bite or seed after; landing ends → step 1 after the delay; entry 12 found; each step 1 × REASSIGNMENT; MERGE refused at 19 charge; SPARE refused at FUEL 19% and greying SUNSET; BACK; STAY with 0 / 1 / 3 eligible ships; UNRESOLVED (rm taken: `IT FOLLOWED YOU`); the verdict ≤ 3 lines; ENDING CHOSEN saved at `'done'` and resumed; the classic LAST LIGHT once | ~6 s |
| `ending/rules.test.ts` | 7a FINALE | pure: `emptyShip`, `stayCandidates` from `ShipResult.pods`, `optionState` (open, needs, `???` by `endingsSeen`), `endingRecordOf`, `finaleRunCause` | < 1 s |
| `ending/card-models.test.ts` | 7a CARD | hand-built states; every word at its worst case | < 1 s |
| `ending/epilogue.test.ts` | 7a NIGHT | ages and people (RIVERSIDE 600 → 120,000 at 760), 2 significant figures, payoff choice order, the fold to `+ n OLDER COLONIES` at 16 lines, a lost run, gap 0's words, every title by combination, `PAYOFF_OF` covers `LINE_POOL` | < 1 s |
| `ending/last-landing.test.ts` | 7b DROP | CORMORANT → LAST LIGHT with 2 and 6 eaten drivers: by radio (memory untouched), released, cadence, v3 lands all soft on a healthy orbit, v1 in pass order, blind's spread (×2) and margin on 20 seeds (mean worth 0.6–0.9 on GENTLE), the two-orbit limit, `[ENTER]` skip ends with every pod down, the report's row, ★ ON TARGET's denominator | ~5 s |
| `ending/last-landing-models.test.ts` | 7b VIEW | header, POD BAY row, report row | < 1 s |
| `traces/foundation.test.ts` | 7c lead | v7 → v8; `tracesOf` for every ending (followed none, one extra seed whatever is held); `placeTraces` on 200 arms (`assembleRun1Arm`, fresh rolls): exclusions, fallbacks, 046's trail, determinism | ~2 s |
| `traces/final-ship.test.ts` | 7c TRACE | run 2 final ship per trace (`__ap.traces.as` equivalent): wiped seeds, bite interval × 0.85, capacity +1, root 18, the wild seed, +15 at boot, the hunt's first RM target | ~3 s |
| `traces/gifts.test.ts` | 7c TRACE | SPARE / SUNSET / STAY gifts at their boot, through `arrivalCharge`; SPARE's seedless beam; Rm first | ~1 s |
| `traces/lineage.test.ts` | 7c LINEAGE | strangers by run, the boarding lines, `rootUnits` after REASSIGNMENT (and after MERGE + REASSIGNMENT), the face line's wait, ghost lines for each cause | ~1 s |
| `traces/logs.test.ts` | 7c LINEAGE | book by lineage, keys by ring for each book, `047.log` from 0–4 events, every entry ≤ 3 × 70 | < 1 s |
| `traces/ui-models.test.ts` | 7c CHART | card rows, chart `◆`, final card `NEXT RUN:` | < 1 s |
| `signals/events.test.ts`, `signals/contact.test.ts` | 7d | the `?` card, the three events, the glyph, CONTACT's price, trace and words | ~1.5 s |

### 6.2 Changed suites

- `save/shape-pin`, `save/codec`, `save/archive-v2`: v7, v8, v9 and META 4.
- `support/words`: every new pool.
- `support/import-guard`: unchanged and green. `data/endings.ts`, `data/traces.ts` and `data/epilogue-text.ts` import only
  data and types (`epilogue-text` reads `souls.ts LINE_POOL`, a data leaf). `systems/traces.ts` is never imported by
  `data/ships.ts` or `classic-five.ts`.
- The movers of §4.4 (7a) and the dry runs' lists (7b, 7c, 7d).
- `threat/beam-seeds` must stay byte-identical until TRACE raises a gate. Traces draw their own stream, so a move before
  that is a bug.
- `skills/*` must not move: a seed met at the final ship still writes `seedsMetAtDepth` (no desk follows it).

### 6.3 BALANCE_ONLY sweeps (information until slice 8)

- **`ending/last-landing-sweep.test.ts`** (`// BALANCE_ONLY: the final ship × seeds × eaten 1–6 × flier v0–v3`): points per
  restored pod against a hand-landed pod, by planet class. It checks 01's "about 0.75 on GENTLE, 0.5 on HARSH" for blind,
  and "full points with AUTODROP and a good orbit".
- **`traces/traces-sweep.test.ts`** (`// BALANCE_ONLY: run 2's final ship × seeds 1–20 × each trace, flown by the WP7
  kid`): points, drivers eaten, the duel won %, and charge at the duel, each against no trace. This is the comparability
  table for slice 8 (PHASE3 §12 item 2). Expectation: every trace within ±1 pod of none on the final ship, and each
  gift ship within ±15 REPAIR CHARGE's worth.
- **`wp12/playthrough.test.ts`** (the 200-seed harness) chooses PURGE + REASSIGNMENT through `chooseEnding`. It is
  information only.

### 6.4 e2e (the lead, once per sub-slice batch end)

- **New `tests/e2e/scenarios/ending.mjs`** (7a, seed 7, about 4 minutes), from `__ap.slot(19)` on the worked route:
  1. the duel, the root falls mid-landing: the `finish your landing` line, no bite after, the strip;
  2. the landing ends: the card, entry 12 in it, step 1's three rows (MERGE's meter, SPARE's FUEL need);
  3. `[2]` MERGE, step 2, `[ESC]` back, `[1]` PURGE, step 2: STAY's sub-row (two ships), `[3]` REASSIGNMENT, the verdict;
  4. the report's ending line, CONTINUE, the RUN TALLY, `EPILOGUE ▸`, the epilogue's header and a colony line with its
     age, the final card's title `STAND BY`, the rows, the bridge, NEW RUN;
  5. a second page with `__ap.ending('spare', 'stay')`: the title `A SHIP FOR 046, A HOME FOR ME`;
  6. the phone: the card as a sheet at 360 × 740, each key reachable by tap.
- **7b adds to `ending.mjs`:** MERGE with 2 eaten drivers: `THE LAST LANDING` header, the TERMINAL's `DRIVER RESTORED`
  lines, the beacons turning amber, two touchdowns, the report's `2 RESTORED · …`; then `[ENTER]` skip on a 6-pod case.
- **New `tests/e2e/scenarios/traces.mjs`** (7c, seed 4): `__ap.archiveAs('won-purge', …, { you: 'reassignment' })` and a
  reload; run 2's HOLLOW boards as UNIT-031; the `???` file reads `047.log`; the final ship's card row and boot face line
  `> hi 048. it's 047.`; +15 at its boot. A second archive with SPARE: `046'S CACHE IS HERE` on its card, its boot gift,
  the wild seed at the final boot.
- **New `tests/e2e/scenarios/signals.mjs`** (7d): the three `?` cards, the old colony's letter, the signal file's SCAN `2/3`,
  the glyph, and CONTACT on the card with 3 signals.
- **`playthrough.mjs`:**
  - LAST LIGHT: `PURGE on the finale's card` becomes the root asleep, the landing to its end, `[1]` then `[3]`, the
    verdict;
  - the report follows the FINALE (the check reads `'done'` in place of `['purged', 'merged', 'unresolved']`, at
    `playthrough.mjs:773`);
  - after the tally, two ENTERs (epilogue, final card) before NEW RUN.
- **`run-flow.mjs`:** the same FINALE keys and the two night screens. Its headless finale wait reads `'done'`.
- **`resume.mjs` part D:**
  - the choice is two steps;
  - ENDING CHOSEN is checked at the report (unchanged point, R14);
  - after CONTINUE, the RUN TALLY's checks stand and two more ENTERs reach NEW RUN;
  - a reload during the FINALE card resumes at LAST LIGHT's BEAM (`RESUME · UNIT-047 · SHIP 6 · bound for LAST
    LIGHT`). This is a new check that pins R14.
- **`run2.mjs`:**
  - 7a: `archiveAs('won-purge')` migrates through `parseEnding` (the ending record from the debug body);
  - 7c: run 2's mid-run HOLLOW is the stranger. The scenario has no HOLLOW-name check today; one is added, `UNIT-031`
    at the boarding.
- **`phone.mjs`:** the FINALE sheet (7a) and the epilogue at 360 px (no sideways scroll).

---

## 7. Out of scope (deferred)

- **Slice 8 (the rebalance):**
  - every trace number (§2.6, 7c), the blind drop's numbers, `MERGE_DRIVER_INTEGRITY`, and `EMPTY_SHIP_FUEL_PCT`;
  - MERGE's charge "kept through the duel" (decision round 3 item 7: until a playtest decides);
  - the classic world's retirement (OPEN-DECISIONS 12), after which the FINALE's classic movers go too;
  - the receiver bypass animation (OPEN-DECISIONS 20).
- **Later:**
  - several end locations, and CONTACT's own end toward the signal (02 §3.6);
  - the relay where 046 lives as a map stop (02 §7);
  - colonies as relays or ports (decision 7 holds: only STAY's trace);
  - a mid-ship save or ironman (decision 5), which would let ENDING CHOSEN move to step 2 (R14);
  - a `site-moved` notable event for `047.log` (plan 6 §8), and a trace place as a wreck site;
  - epilogue lines from `ShipResult.survey` beyond the payoff's fallback (NIGHT may use a moved site as the colony's
    line when it has no featured payoff; no more);
  - residents that remember a unit across runs;
  - mail between strangers;
  - more stranger books than two (R34's alternation).

---

## Critical files for implementation

- **7a:** `src/systems/finale.ts`, `src/components/run/FinaleChoice.ts`, `src/state/schema.ts` (FinaleState),
  `src/state/selectors.ts finalePending`, `src/systems/landing.ts finishLanding`, `src/systems/save-write.ts
  writeEndingChosen`, `src/systems/save-codec.ts`, `src/systems/meta.ts` (META 4, `recordRunEnd`), `src/systems/meta-parse.ts`,
  `src/systems/run.ts continueAfterReport`, `src/systems/run-end.ts`, `src/components/run/RunEnd.ts`,
  `src/systems/story-log.ts rootKeyDue`, `src/systems/say.ts` (the arbiter), `src/data/hollow-text.ts HOLLOW_FINALE`,
  `src/data/souls.ts LINE_POOL`, `src/types/landing.ts FeaturedColonist`.
- **7b:** `src/systems/landing-controller.ts`, `src/systems/autodrop.ts autodropController` (`AutodropOverride`),
  `src/systems/landing.ts launchDriver` / `requestLaunch`, `src/systems/landing-rules.ts launchRefusal` / `driverFor`,
  `src/systems/landing-solve.ts dropHalfWidthKm`, `src/systems/landing-report.ts:150`, `src/systems/clock.ts advance`.
- **7c:** `src/systems/meta.ts hollowUnitsAfter`, `src/systems/lineage.ts`, `src/systems/threat-plan.ts rootBlocksFor` /
  `planThreat`, `src/systems/beam-seeds.ts`, `src/systems/carry.ts arrivalCharge`, `src/systems/hollow.ts chooseVerb` /
  `seedSpot`, `src/state/log-selectors.ts`, `src/data/log-text.ts`, `src/systems/boot.ts`, `src/systems/map-boot.ts`,
  `src/data/script.ts bootLinePlan`, `src/systems/desk.ts cardModel` / `chartModel`.
- **7d:** `src/systems/map-generator.ts topUpReservations` (read only: the `?` slots and fragments), `src/systems/resident-left.ts`
  (the signal pattern), `src/systems/resident-hud.ts signalGlyph`, `src/types/resident.ts SignalRecord`.

---

## Deviations (7a foundation)

Recorded by the 7a FOUNDATION agent (branch `found-7a`, from a0fd347, the head of `claude/modest-hawking-209t0f` after slice 6
Track SITES's merge). Steps 0–9 of §5.1 are built; step 10 (the independent contract review) is next. Every gate is down, and
nothing a player can reach changes: the FINALE plays WP11's one step, the run end is the RUN TALLY with NEW RUN.
The unit tier is green with no behaviour change: 207 passed (the new `ending/foundation` among them), 0 failed, 11
balance-only skipped, 223 s on 4 workers while slice 6's fix agent worked in the main checkout (a first, cold run took 279 s
under the same load), with `npm run typecheck` and the tests' tsc clean. The e2e was not run; its two reads of WP11's phases
(`playthrough.mjs:774`, `run-flow.mjs:416`) now read `'done'`.

**Step 0, checked at HEAD:** `RUN_SAVE_VERSION` was 6 and `META_VERSION` 3, as §0 says (slice 6's fix pass had not bumped
the save). Every name §2.4, §4.4 and the critical-files list cite exists, with the corrections below.

### What the tracks stand on

**Built (lead-owned from here):**
- `types/ending.ts`: `HollowChoice`, `HollowFate`, `YouChoice` (with 7d's `'contact'`), `EndingPiece`, `FinalePhase` (the
  eight phases), `EndingRecord`, `LastLandingState` (7b's), `RunEndStage`.
- `state/schema.ts`: FinaleState v7 (`rootFell`, `hollow`, `you`, `stay`, `restored`, `cardAtAi`, `ending`,
  `unresolvedUntilAi`), `FinaleEnding.choice: { hollow; you }`, `'won-spare'` in `RunEndCause` (and `LastCause`),
  `ui.runEndStage`. `types/landing.ts`: `LandingState.lastLanding` (always null), `FeaturedColonist.line` (filled from
  `Colonist.line` in `landingResult`). `types/lineage.ts`: `LastUnit.ending`. `state/initial.ts createFinaleState`.
- Save v7: `RUN_SAVE_MIGRATIONS[6]`, the codec's finale checks (`checkHollow`, `finaleRefusal`), the shape pin at v7. Archive
  v4: `META_MIGRATIONS[3]`, `meta-parse.ts parseEnding` and `endingOfV3LastUnit` (shared by both migrations), `recordRunEnd`'s
  ending and pieces, `archiveRunEnded` passing `endingRecordOf(state)`.
- `data/endings.ts`: `ENDINGS_BUILT` (`twoStep`, `night`, `contact`), `ENDING_PIECES`, `HOLLOW_PIECES`, `YOU_PIECES`,
  `pieceBuilt`, `builtPieces`, `PriceKind`, `EndingOption`, `STEP1_OPTIONS`, `STEP2_OPTIONS`, `step2Options`,
  `EndingTitleKey`, `endingTitleKey`.
- Tuning: the 7a lead, FINALE, CARD and NIGHT blocks at the end of `tuning.ts`; events and cues (the `7 ENDING` blocks);
  the seams of §2.4; the debug hooks of §2.12.
- `tests/unit/support/finale.ts`; `tests/unit/ending/foundation.test.ts` (54 checks, about 1.5 s); the fixtures
  `run-save-v6-ending-chosen-lastlight.json`, `run-save-v6-ship-done-run2.json` and `meta-v3-won-merge.json`, dumped by the
  game's own save path before any change (fdda53f).

**How the FINALE runs with `twoStep` down (WP11's one step on the v7 machine):** the root's DELETE completes → `'asleep'`
(rootFell, `'finale-asleep'`) → `'step1'` in the same tick (cardAtAi = now + FINALE_OPEN_DELAY_SEC) → the old card's PURGE or
MERGE (`chooseFinale`) confirms with REASSIGNMENT → `'done'` with WP11's typed ending. UNRESOLVED is `'done'` at once
(`'followed'`, REASSIGNMENT, the root standing). **With `twoStep` up** (the FOUNDATION's skeleton, FINALE's to finish):
`'asleep'` holds until the landing settles (ended, no pod falling, HOLLOW's line typed), then `'step1'`; `pickStep1` → `'step2'`;
`pickStep2` confirms; UNRESOLVED is a `'step1'` with `rootFell` false whose way on (`continueFollowed`) throws. The confirm
still goes straight to `'done'` (FINALE adds `'verdict'` and `'last-landing'`).

**The contract, per track.** "Neutral" stubs return the value shown and are safe on every tick and paint. "Throws" stubs throw
through `not-built.ts notBuilt(what, track)` until built (its `Track` is now `'FINALE' | 'CARD' | 'NIGHT'`). Each file opens
with its track's banner.

| Track | Function (file) | Signature | Now |
|---|---|---|---|
| FINALE | `pickStep1` (systems/finale.ts) | `(store, hollow: HollowChoice) => string \| null` | built: step 1 → step 2 (refusal: phase, pause, `optionState`'s need) |
| FINALE | `backToStep1` | `(store) => string \| null` | built: step 2 → step 1, the pick kept |
| FINALE | `pickStep2` | `(store, you: YouChoice) => string \| null` | built for PURGE/MERGE + REASSIGNMENT; SPARE's apply, a `'followed'` step 2 and STAY with ≠ 1 ship throw |
| FINALE | `pickStay` | `(store, stay: number) => string \| null` | throws |
| FINALE | `continueFollowed` | `(store) => string \| null` | throws |
| FINALE | `chooseFinale` | `(store, choice: 'purge' \| 'merge') => string \| null` | built: WP11's one step (the old card, ?debug); retire it with the old card |
| FINALE | `emptyShip` (systems/ending-rules.ts) | `(state) => { ok: boolean; fuelPct: number \| null }` | neutral: `{ ok: false, fuelPct: null }` |
| FINALE | `stayCandidates` | `(state) => { slot; shipName; colony; year }[]` | neutral: [] |
| FINALE | `optionState` | `(state, piece: EndingPiece, seen: readonly EndingPiece[]) => OptionState` (`open` \| `needs { need; named }` \| `hidden`) | neutral: PURGE, REASSIGNMENT open; MERGE open or `needs` by its charge (WP11's words); every other piece hidden |
| FINALE | `finaleRunCause` | `(state) => RunEndCause` | built (R17; throws unless `'done'`) |
| FINALE | `endingRecordOf` | `(state) => EndingRecord \| null` | built (null unless a final ship at `'done'`; STAY reads `stayCandidates`) |
| FINALE | `reportEndingLine` | `(state) => string \| null` | neutral: null (landing-report.ts's `endingLine` calls it on a final ship; LandingReport.ts draws `.lr-ending` under the colony) |
| FINALE | `FINALE_TEXT` (data/finale-text.ts) | headers, `controlQuote`, `followedLine`, `asleep(us)`, `strip`, `word`, `command`, `meaning`, `price`, `needs`, `now`, `verdict`, `reportLine` | seeded with §2.9's and 05 §3.12's words |
| FINALE | `__ap.ending` (debug.ts) | `(hollow, you, opts?: { stay? }) => void` | throws |
| CARD | `mountFinaleChoice` (components/run/FinaleChoice.ts) | `(store) => () => void` | built: WP11's card on the v7 phases (shown at `'step1'` with `rootFell`, ends on `'done'` + PURGE/MERGE), reading the renamed tuning |
| CARD | `styles/ending.css` | | empty (imported by main.ts) |
| NIGHT | `epilogueModel` (systems/epilogue.ts) | `(state, meta: Meta \| null) => EpilogueModel \| null` | neutral: null |
| NIGHT | `finalCardModel` | `(state, meta: Meta \| null) => FinalCardModel \| null` | neutral: null |
| NIGHT | `mountEpilogue` (components/run/Epilogue.ts) | `(store) => () => void` | built: at stage `'epilogue'` with no model, goes on to `'final'` (deferred out of the fan-out) |
| NIGHT | `mountFinalCard` (components/run/FinalCard.ts) | `(store) => () => void` | built: at stage `'final'` with no model, starts the next run |
| NIGHT | `EPILOGUE_TEXT` (data/epilogue-text.ts) | `tallyOn`, `header(year)`, `colony(colony, age, people)`, `older(count)`, `offSite`, `next(unit, gap)`, `nextSameYear(unit)`, `endings(found, total)`, rows, `newRun` | seeded |
| NIGHT | `styles/night.css` | | empty (imported by main.ts) |
| lead | `setRunEndStage` (systems/run.ts) | `(store, stage: RunEndStage) => void` | built: tally → epilogue → final only, at `'end'` |
| lead | `finalePending`, `finaleCardUp` (state/selectors.ts) | `(state) => boolean` | built |
| lead | `choiceMayOpen`, `withdrawUntimedChoices` (systems/say.ts) | `(state, timed) => boolean`, `() => number` | built |

The model types in `epilogue.ts` (`EpilogueModel`, `EpilogueLine`, `FinalCardModel`, `FinalCardPiece`) are NIGHT's to widen;
`OptionState`, `EmptyShip` and `StayCandidate` are FINALE's (CARD asks for a change).

**Files each track owns (beyond §4.1's table):**
- FINALE: `finale.ts`, `ending-rules.ts`, `finale-text.ts`, `story-log.ts:66` (`rootKeyDue`), `hollow-text.ts` HOLLOW_FINALE's block
  (`:187–285`), the debug bodies of `__ap.finale.pick/.back/.cont` and `__ap.ending`, `support/finale.ts` (may extend), the
  movers below for churn only.
- CARD: `FinaleChoice.ts`, `ending.css`, `audio.ts`'s two new cues, `game.css`'s `.finale-choice` block (`:3140–3290`, delete
  it), index.html's `#finaleChoice` skeleton (the card's own markup).
- NIGHT: `epilogue.ts`, `epilogue-text.ts`, `Epilogue.ts`, `FinalCard.ts`, `night.css`, `RunEnd.ts`, `TitleCard.ts`'s ENDINGS
  line, index.html's `#epilogue` and `#finalCard` (empty divs today: their markup).

**The lines each track edits in the lead's files** (nothing else):
- FINALE:
  - the gate: `data/endings.ts:15` (`twoStep`);
  - tuning's 7a FINALE block (`tuning.ts:2435–2446`);
  - `support/words.test.ts`'s 7a FINALE block (`:430–441`, with `FINALE_WORST`);
  - `ending/foundation.test.ts:50` (`built: the two steps not yet` → `ENDINGS_BUILT.twoStep`), `:70–73` (the neutral stubs: as
    built), `:75–76` (the throwing stubs: as built);
  - the dry run's movers (below).
- CARD:
  - tuning's 7a CARD block (`tuning.ts:2448–2453`);
  - `audio-cues.ts`'s 7 ENDING block (`:383–393`: `finale-open`, the SPARE `finale-chosen` line, `finale-step2`); CARD's new cues
    `spareNotes` and `sunsetRumble` go in `audio.ts`.
- NIGHT:
  - the gate: `data/endings.ts:17` (`night`);
  - tuning's 7a NIGHT block (`tuning.ts:2455–2465`);
  - `support/words.test.ts`'s 7a NIGHT block (`:445–456`, with `NIGHT_WORST`; PAYOFF_OF's cover of LINE_POOL joins it);
  - `ending/foundation.test.ts:51` (`built: the night not yet`) and `:74` (the night's models: as built);
  - `audio-cues.ts`'s `epilogue-line` line (`:392`).

### R5: the dry run (`ENDINGS_BUILT.twoStep` raised alone, the quick tier, then dropped)

201 of 207 suites pass, 215 s; 20 checks fail in 6 suites, plus `ending/foundation`'s own gate line. The FOUNDATION already moved every suite whose *types* moved (17 files: every `chooseFinale` caller to
`support/finale.ts chooseEnding`, and every reader or writer of WP11's `'choice'`, `'purged'`, `'merged'`, `'unresolved'` to
`finaleAtStep1`, `decidedAs`, `decideFinale`, `openFinaleStep1`), so the dry run's movers are the ones whose *behaviour* moves
with the two steps. All six are FINALE's churn:
- `ending/foundation.test.ts:50`: the gate line itself.
- `wp11/merge-test.test.ts` (10): `:147` (PURGE still open), `:155`, `:157`, `:159`, `:161`, `:166`, `:171` (MERGE at step 1),
  `:182`, `:185` (the landing after MERGE, CONTROL's verdict). The suite chooses right after the root falls, mid-landing: with
  the two steps that is `'asleep'` (refused `NOT NOW`). Plan §4.4 already has this suite becoming 7b's `ending/last-landing`;
  7a's interim checks need `settleFinale` (or `chooseEnding(…, { step })`) and R15's reopened landing.
- `wp11/fix1/fix1.test.ts` (4): `:154` (MERGE's listener sees the ending), `:182` and `:186` (UNRESOLVED is now a step-1 card:
  `continueFollowed`), `:208` (the 1-thread Core ends the duel `'asleep'`, not at step 1). `:130` (PURGE's listener) passed.
- `wp11/p2/views.test.ts` (3): `:173` (the root's end is the biggest tear: a spike now follows, the landing running on),
  `:188` (every pod down while the choice stood), `:201` (PURGE writes its ending: `NOT NOW` while asleep).
- `wp11/p2/purge-fleet.test.ts` (3): `:95`, `:98`, `:101` (PURGE taken right after the DELETE; the fleet line, R13's retired
  narration, then moves to the epilogue's model, §4.4).
- `threat/arrival-story.test.ts:260` (the duel runs to the card: `'asleep'` until the landing settles).

Not measured (outside the quick tier): the BALANCE_ONLY `wp11/full-run` and `wp12/playthrough` (both already through
`chooseEnding`; their pick waits for `finaleAtStep1`, which now comes after the landing), and the e2e (plan §6.4's edits).
Plan §4.4's other listed suites (`landing/flow`, `landing/hollow-landing`, `map/run1-route`, `opening/calm-ships`,
`save/*`, `skills/autodrop-arm`, `wp11/boss-sim`, `wp11/harness11`, `wp12/p3/minors`) did not move with the gate.

### Deviations

1. **A third gate, `ENDINGS_BUILT.night`** (Track NIGHT's line). R19's three screens change what ENTER does on the RUN TALLY
   (the e2e presses it for NEW RUN), so they are gated like the FINALE: while `night` is down RunEnd's button is NEW RUN; up,
   it reads `EPILOGUE ▸ [ENTER]` and sets `ui.runEndStage 'epilogue'`, and RunEnd's keys answer only on the tally. CARD has no
   gate: its card is built against `twoStep`, and between FINALE's merge and CARD's the old card still works on the two-step
   machine (it shows on step 1 and `chooseFinale` confirms from there).
2. **The FOUNDATION moved the type-driven churn itself** (R5 gave all the movers to FINALE). FinaleState v7 removes WP11's
   phases, so 17 suites stopped compiling; they were moved mechanically through `support/finale.ts`, and the dry run lists only
   behavioural movers. `chooseFinale` stays in `finale.ts` as WP11's one step (the old card and `?debug` call it); FINALE (or
   CARD) deletes it with the old card.
3. **`settleFinale(store, step)` takes the suite's clock** (`step`), and `chooseEnding(store, hollow, you, { stay?, step? })`
   settles first when given one: the suites own their tick loops. `chooseEnding` skips the verdict only with `twoStep` up (WP11's
   typed ending held the report in every suite before, and still does). Extra helpers: `finaleAtStep1`, `decidedAs`,
   `decideFinale`, `openFinaleStep1`, `withEndings`.
4. **`EndingRecord.finalSlot` and `.finalYear` are `number | null`**, null on the classic world and on a migrated record that
   kept no trail, not §2.2's slot -1 and year 0: no sentinel values (AGENTS.md), and the archive's `wholeNumber` refuses -1.
   `stay.year` is 0 on the classic world as §2.2 says.
5. **The codec's MERGE check reads the pod records' `restored`**, not `driverLost === 'eaten'`: 7a's interim (R15, today's
   `merge()`) clears `driverLost` as it restores a driver in place. 7b's radio drivers may keep `'eaten'`; DROP asks the lead to
   widen the check. **STAY's ★ ON TARGET is not checked yet**: the codec checks that `stay` names a ship of `run.ships` or the
   final one, and that it is set exactly for STAY; the ★ rule is FINALE's (`stayCandidates`), and FINALE asks the lead for the
   one codec line once it exists. The point check is at SHIP DONE (`finale.phase === 'none'`): a boot point holds no slices.
6. **v6 migration of a `'choice'` phase** (never at a save point) reads as `'step1'` after the fall; `unresolvedUntilAi` is
   kept. The META 3 → 4 rule lives in `meta-parse.ts endingOfV3LastUnit`, shared with the save's `run.lastUnit`.
7. **`recordRunEnd` takes the pieces from the ending record, never the cause** (`RunEnd.ending?`, left out: none). A suite that
   ended a run with a won cause and no record now finds nothing seen (`wp8/meta` passes a record). `meta.ts ENDINGS` (WP11's
   two) stays for the title's and RUN END's endings line until NIGHT moves them to `builtPieces()`; since `endingsSeen` now holds
   REASSIGNMENT too, `TitleCard` counts only those two (`ENDINGS 1/2` as before). `script.ts endingsLine` takes `EndingPiece`s.
8. **`'won-spare'`'s words** are placeholders NIGHT may reword: `RUN_END_TITLE` `A SHIP FOR IT`, `RUN_END_WHY`, the title's
   `LINEAGE_END` `gave UNIT-046 a ship`. `GHOST_LINE['won-spare']` is null (R36 applied early: a SPARE was not lost).
   `hollowUnitsAfter` reads it as any other cause (the last unit) until 7c's R34.
9. **Two events are emitted only on the two-step path**, `'finale-open'` and `'finale-step2'`, so WP11's card keeps its own
   `finaleHold` and no new stamp plays while the gate is down. `'finale-asleep'` has no cue (`'root-deleted'` already tears);
   SPARE's `'finale-chosen'` plays `purgeTone` until CARD's `spareNotes`; `'epilogue-line'` plays `typeTick` (sys).
10. **Tuning renames:** `FINALE_CHOICE_DELAY_SEC` and `FINALE_CHOICE_ARM_SEC` moved into FINALE's block as
    `FINALE_OPEN_DELAY_SEC` and `FINALE_STEP_ARM_SEC` (one number, one name), and FinaleChoice's `CLOSE_FADE_MS` is CARD's
    `FINALE_CARD_FADE_MS`; the old card reads them.
11. **`finishLanding` throws** on a final ship whose FINALE is not `'done'` (fail loudly; `finalePending` holds the report until
    then). `finalePending` is false at `'none'`, true at every other phase but `'done'`, and at `'done'` until the typed ending
    and UNRESOLVED's line are over.
12. **`optionState`'s neutral answer reuses WP11's MERGE need words** (`HOLLOW_FINALE.mergeNeeds`), so `pickStep1`'s refusal
    equals today's; FINALE's `needs.charge` (`NEEDS 20 CHARGE · you have 14`) replaces it.
13. **The report's ending line** is a model field (`LandingReportModel.endingLine`, null off the final ship) from
    `ending-rules.ts reportEndingLine`, FINALE's: landing-report.ts only calls it, and LandingReport.ts draws it (`.lr-ending`).
14. **The night stubs defer their store update** (`queueMicrotask`): they react to a store subscription, and an update inside
    the fan-out is the tick discipline's one rule.
15. **`__ap.finale`** is callable as before (its fields kept for the e2e) and gains `options` and `.pick/.back/.cont`;
    `__ap.archiveAs(cause, landed?, ending?)` builds a won or unresolved cause's record as META 4's migration reads an old one
    (step 1 by the cause, REASSIGNMENT, the worked route's LAST LIGHT; SPARE with FUEL 30) and checks it with `parseEnding`.
16. **`not-built.ts` is reused** with the new tracks. Slice 6's fix pass, running beside this, may delete it (no slice 6 stub was
    left): on the merge keep this version.
17. **`docs/phase3/OPEN-DECISIONS.md`** is not touched (its "Slice 7" heading is the lead's).

### Notes for the tracks

- **FINALE:** raise `twoStep` first and run the tier; finish the phases (`'verdict'`, `'last-landing'` for R15), SPARE's apply,
  UNRESOLVED's step 2, STAY's pick and the prices; R6's asleep line is `FINALE_TEXT.asleep` (the FOUNDATION still says WP11's
  `> 047. wait.`). `endingRecordOf` reads `stayCandidates` for STAY's colony.
- **CARD:** call `pickStep1`, `pickStep2`, `pickStay`, `backToStep1`, `continueFollowed`; read `optionState` with the archive's
  `endingsSeen`, `cardAtAi` for the open delay, `rootFell` for IT FOLLOWED YOU. The card's open already withdraws untimed
  choices (finale.ts), and the arbiter keeps the TERMINAL shut while `finaleCardUp`.
- **NIGHT:** `setRunEndStage` moves the stages; `endingRecordOf(state)` is this run's ending while `run.phase === 'end'`;
  `archiveMeta().endingsSeen` already holds this run's pieces; `MAP_TEXT.runEnd.bridge` moves to the final card.
- **The lead:** the independent contract review (§5.1 item 10) is next.

## Deviations (7a foundation, review follow-up)

These are the changes made after the independent review of a0fd347..45d0385 (`slice-7a-foundation-review.md`, where each
finding is marked with how it was settled), as the lead decided them. Every gate is still down and nothing a player can reach
changes. The unit tier is green: 207 passed, 0 failed, 11 balance-only skipped, 228 s on 4 workers
(slice 6's fix pass running beside it), with `npm run typecheck` and the tests' tsc clean; `ending/foundation` has 60 checks. The sections above stand except where this one says otherwise; every line number below is as of this
follow-up and replaces the ones above.

### Blockers

- **B1. The ending titles are NIGHT's table, shared.** `data/epilogue-text.ts ENDING_TITLE: Readonly<Record<EndingTitleKey,
  (colony: string) => string>>` holds 05 §3.7's ten titles, R23's four UNRESOLVED drafts and CONTACT's three (the drafts
  marked `TODO(05)`); only `stay:purge` reads the colony (`${colony}'S MIND`). NIGHT owns the words; FINALE imports the table
  for `ending-rules.ts reportEndingLine` (the colony from the record's `stay`). The report's line is FINALE's (Deviation 13),
  and §2.9's bullet is corrected. NIGHT's words block renders the table.
- **B2. The FUEL notch's tooltip is a lead hook CARD fills:** `systems/finale-card.ts fuelStarTitle(state) => string | null`
  (new, CARD's file; neutral null). `EngineWindow.ts` reads it on every paint (`:259`, `title ?? today's title`, in the paint's
  key); the notch's position is untouched.

### Majors

- **M1. Spacers.** `audio-cues.ts`'s 7 ENDING block: CARD's three lines `:390–392`, the spacer comment `:393` (`// Track NIGHT's
  cues …`), NIGHT's two lines `:394–395`, and `:396` (`// (end of NIGHT's cues)`). `ending/foundation.test.ts`: the gate lines
  `:56` (FINALE), `:58` (NIGHT), `:60` (7d), each after a spacer comment; NIGHT's night check is its own block (`:136–140`,
  `// The night's stubs (Track NIGHT's block …)`) after FINALE's stubs block, with blank lines around it.
- **M2. `OptionState`'s final shape** (`ending-rules.ts`): `{ kind: 'open'; price: PriceMeter | null; now: string | null }`,
  `{ kind: 'needs'; need: string; named: boolean; price: PriceMeter | null }`, `{ kind: 'hidden' }`, with `PriceMeter { kind:
  'charge' | 'fuel' | 'signals'; have: number; need: number }`. The neutral stub answers in that shape: PURGE and
  REASSIGNMENT open and free, MERGE open or `needs` with its charge meter (`have`, `need` 20), every other piece hidden. CARD's
  `card-models` builds its rows from injected `OptionState`s (any shape above), never from the stub.
- **M3. STAY's sub-pick** (the contract; `pickStep2` follows it now, `pickStay` stays FINALE's):
  - the sub-row is CARD-local UI state, unsaved (a reload replays the ship anyway, R14);
  - `[2] STAY` with one candidate: `pickStep2(store, 'stay')` confirms with that ship;
  - with more than one: `pickStep2(store, 'stay')` refuses with `FINALE_TEXT.stayPick` (never throws), and CARD opens the
    sub-row; its pick is `pickStay(store, slot)`, valid at `'step2'`, which refuses a slot not in `stayCandidates` and
    otherwise confirms STAY;
  - ESC in the sub-row closes the sub-row (CARD's); ESC on step 2 is `backToStep1`;
  - the row's `> mount <colony>` names the newest candidate, `stayCandidates()[0]`.
- **M4. The ending record is frozen at the confirm.** `FinaleState.record: EndingRecord | null` (inside v7): written once, in the
  confirm's update (after the apply: MERGE's charge spent, PURGE's blocks gone, before MERGE reopens the landing), by
  `ending-rules.ts endingRecordAt(state, hollow, you, stay)`; UNRESOLVED's decision writes it too. `endingRecordOf` returns it at
  `'done'` on a final ship (and throws on a decided FINALE without one). The codec reads it with `parseEnding`, refuses a
  decided FINALE without it, one that disagrees with `hollow`, `you` or `stay`, and one before `'done'`; the v6 migration
  builds it for a decided finale (`save-codec.ts migratedRecord`: step 1 and REASSIGNMENT, the run's HOLLOW, the final ship's
  slot, name and year, the kit and charge from the slices' memory). The shape pin's v7 gains `hollow.finale.record`.
  `support/finale.ts decideFinale(draft, hollow, you)` now takes the draft and freezes the record as the confirm does.
- **M5. The keep-set.** FINALE deletes no `HOLLOW_FINALE` key and no `finale.ts` export that a file outside its list reads:
  `chooseFinale`, `finaleChoiceRefusal`, `FinaleChoice`, `finaleEndingLines`, `finaleEndingLineStartsSec`,
  `finaleEndingShowing`, `skipFinaleEnding`, `mergeTickCharge`, `podsEatenHere`, and every `HOLLOW_FINALE` key (`purgeEnding`,
  `mergeEnding`, the old card's words, `strip*`, `stripWaitsNobody`, `rootTag`, `endingUnknown`, `mergeNeeds`, …). The fix
  pass after CARD's merge deletes the dead ones (`chooseFinale`, `finaleChoiceRefusal`, `FinaleChoice`, `finaleEndingLines`,
  `purgeEnding`, `mergeEnding`, the old card's words) and `not-built.ts`. `support/words.test.ts:150–161` (WP11's finale
  words) is FINALE's churn.
- **M6. The confirm re-checks step 1.** `pickStep2` runs `optionState(state, hollow, [])` before applying: an option that can no
  longer be paid sends the card back to `'step1'` (the pick kept, `'finale-open'` step 1 on the two-step path) and refuses with
  its need; it never throws mid-apply. `ending/foundation.test.ts:129` pins it (MERGE picked at 25, confirmed at 19). FINALE's
  `ending/finale-flow` adds the flown case (a REPAIR running under the card).
- **M7.** `run-end.ts runEndTone` counts `'won-spare'` as won.

### Minors

- **m1.** `finaleCardUp` includes `'verdict'`.
- **m2.** The strip's choice row (`script.ts:2400`) reads `FINALE_TEXT.strip` with `twoStep` up, WP11's `stripChoice` while
  down.
- **m3.** `.lr-ending` has its rule in `ending.css` (CARD owns the rule; FINALE the words).
- **m4.** The `'won-spare'` placeholders moved to NIGHT's `epilogue-text.ts SPARE_RUN_END` (`title`, `why`, `lineage(hollowName)`);
  `script.ts`'s `RUN_END_TITLE`, `RUN_END_WHY` and `LINEAGE_END` read them.
- **m5.** META 3 → 4 adds `'reassignment'` to `endingsSeen` also when the last unit's cause is `'unresolved'`
  (`ending/foundation` pins it).
- **m6.** No sentinel left: `EndingRecord.finalYear` is the final ship's year on both worlds (the classic map has real years;
  null only on a migrated record with no trail), and `stay.year` is the STAY ship's route year on both (`ending-rules.ts
  routeYear(map, slot)`, for FINALE's `stayCandidates`). `finalSlot` stays null on the classic world.
- **m7.** `settleFinale` throws before the root falls (`'none'`, `'duel'`). The wait for `'verdict'` → `'done'` and for
  `cardAtAi` is FINALE's to add to `chooseEnding` when it builds the verdict and the open delay.
- **m9.** `pickStep1` and `backToStep1` emit `'finale-open'` only on the two-step path (Deviation 9 now holds).
- **m10.** `arrivalChoir` has its own event, `'epilogue-open'` (`events.ts`'s 7 ENDING block), on NIGHT's cue line
  (`audio-cues.ts:394`). NIGHT reads the bridging line `MAP_TEXT.runEnd.bridge` through `run-end.ts runEndNext` and does not
  move it out of `map-text.ts`.
- **m12, recorded:** the arbiter is the one deliberate live seam with every gate down: the root's fall opens step 1, whose open
  withdraws untimed TERMINAL choices, and `choiceMayOpen` is shut while the old card is up. No generated final ship holds a
  sleeper, so nothing a player can reach changes; it is R18's intent.
- **For the fix pass / the notes (not changed here):**
  - m8: entry 12 is found as `'step1'` begins, `FINALE_OPEN_DELAY_SEC` before `cardAtAi`: CARD times entry 12's typing from
    `cardAtAi`.
  - m11: hand-built states against the stubs: `endingRecordOf` throws on a decided FINALE without its record, and
    `stayCandidates` is `[]`, so NIGHT's `ending/epilogue` injects the record (an inner `epilogueOf(state, meta, record)`),
    and CARD injects `OptionState`s (M2).
  - The review's §4 note: R13's verdict will also move `views.test.ts:55–58` and `purge-fleet.test.ts:44` (FINALE's churn).
  - The dry run (R5) was not run again: the follow-up changes no behaviour with `twoStep` raised beyond M6's refusal and m9's
    emits, so its six movers stand.

### The final contract changes, per track

- **FINALE:**
  - **Files:** `systems/finale.ts`, `systems/ending-rules.ts` (with `endingRecordAt`, `routeYear`, `PriceMeter`),
    `data/finale-text.ts`, `story-log.ts:66`, `hollow-text.ts` HOLLOW_FINALE (`:187–285`, keep-set M5), the debug bodies of
    `__ap.finale.pick/.back/.cont` and `__ap.ending`, `tests/unit/support/finale.ts` (may extend: m7), the movers.
  - **Builds also:** `pickStay` and STAY by M3's flow; `reportEndingLine` with `ENDING_TITLE` (B1); `optionState`'s `price`
    and `now` (M2); `endingRecordAt`'s STAY through `stayCandidates` with `routeYear` (m6). It keeps `pickStep2`'s re-check
    (M6) and writes `record` at every confirm (M4).
  - **Test and lead-file lines:** `data/endings.ts:15`; `tuning.ts:2435–2446`; `support/words.test.ts:150–161` (churn) and its
    7a FINALE block `:430–441`; `ending/foundation.test.ts:56` (its gate), `:78–83` (the neutral stubs, as built), `:84–85`
    (the throwing stubs, as built), `:129–132` (M6's case, if its refusal's words change); R5's movers.
  - **Spacer blocks:** `ending/foundation.test.ts`'s gate lines (`// (Track NIGHT's gate line:)` follows FINALE's).
- **CARD:**
  - **Files:** `components/run/FinaleChoice.ts`, `styles/ending.css` (with the `.lr-ending` rule), `systems/finale-card.ts`
    (`fuelStarTitle`, new: B2), `audio.ts`'s two new cues, `game.css`'s `.finale-choice` block (`:3140–3290`, delete), index.html's
    `#finaleChoice`.
  - **Test and lead-file lines:** `tuning.ts:2448–2453`; `audio-cues.ts:390–392` (`finale-open`, SPARE's `finale-chosen`,
    `finale-step2`).
  - **Spacer blocks:** `audio-cues.ts`'s `// Track CARD's cues (the card): …` comment opens CARD's lines; `// Track NIGHT's
    cues (the epilogue): …` follows them.
  - **Builds by:** M2's shapes (rows from `optionState`), M3's sub-row flow, m8's entry-12 timing from `cardAtAi`.
- **NIGHT:**
  - **Files:** `systems/epilogue.ts`, `data/epilogue-text.ts` (with `ENDING_TITLE` and `SPARE_RUN_END`: B1, m4),
    `components/run/Epilogue.ts`, `FinalCard.ts`, `styles/night.css`, `RunEnd.ts`, `TitleCard.ts`'s ENDINGS line, index.html's
    `#epilogue` and `#finalCard`.
  - **Test and lead-file lines:** `data/endings.ts:17`; `tuning.ts:2455–2465`; `support/words.test.ts`'s 7a NIGHT block
    `:445–457` (it renders `EPILOGUE_TEXT`, `ENDING_TITLE` and `SPARE_RUN_END`); `ending/foundation.test.ts:58` (its gate) and
    its own block `:136–140`; `audio-cues.ts:394–395` (`epilogue-open` → `arrivalChoir`, `epilogue-line`).
  - **Spacer blocks:** `audio-cues.ts`'s `// Track NIGHT's cues (the epilogue): …` (`:393`) and `// (end of NIGHT's cues)`
    (`:396`); `ending/foundation.test.ts`'s `// (Track NIGHT's gate line:)` (`:57`), `// (7d's gate line:)` (`:59`) and
    `// The night's stubs (Track NIGHT's block …)` (`:136`).
  - **Builds by:** m10 (emit `'epilogue-open'` as the epilogue comes up; the bridge through `runEndNext`), m11 (inject the
    record).
- **The lead:** the merge probe was not re-run here (this worktree's isolation refuses a scratch clone's commits and
  merges). `scratchpad/probe7.py <FINALE|CARD|NIGHT>` tags each track's lines at this follow-up's numbers, for the review's
  probe to re-run before the tracks branch.

## Deviations (Track FINALE)

Recorded by Track FINALE (branch `finale-7a`, from 2625aa4, the head of `found-7a`). `ENDINGS_BUILT.twoStep` is raised:
the FINALE plays its two steps on both worlds. This track gates nothing else. The unit tier is green: 209 passed, 0 failed, 11
balance-only skipped, 218 s on 4 workers (other agents loading the machine), with `npm run typecheck` and the tests' tsc clean.

### What is built

- **`systems/ending-rules.ts`** (pure):
  - `emptyShip` (R8): the final ship in orbit after its landing (locked or accepted), with no pod aboard or falling, and
    FUEL as shown at the landing's end ≥ `EMPTY_SHIP_FUEL_PCT`.
  - `stayCandidates` (R9): the final ship by its live tally (while its result is not yet recorded), then `run.ships`
    newest first, judged by `shipOnTarget` (exported for the codec). At most `STAY_PICK_MAX`, each with its colony and
    its `routeYear`.
  - `optionState` (R11, M2): the meters (charge, fuel), MERGE's `NOW:`, the need lines, and `named` from `seen`.
  - `mergeRestorable`.
  - `reportEndingLine`: `ENDING · <step 1> · <ENDING_TITLE>`, using NIGHT's table (B1).
  - `endingRecordAt`, with STAY through `stayCandidates`.
- **`systems/finale.ts`:**
  - the asleep line (R6), and the card opening once the landing settles;
  - `pickStep1`, `backToStep1`, `pickStep2` (with M6's re-check), `pickStay` (M3) and `continueFollowed` (R10);
  - the apply:
    - PURGE and SPARE: every block of HOLLOW leaves memory, and its eaten pods stay parked;
    - MERGE: R15's in-place restore;
    - UNRESOLVED: nothing leaves (it comes with you);
  - the verdict, `finaleVerdictLines` (R13), exported so the suites can check its worst cases;
  - the phases after the confirm:
    - `'verdict'` → `'done'`;
    - for a MERGE that gave drivers back: `'verdict'` → `'last-landing'` (the landing reopened) → `'done'`;
  - `record`, written at every confirm (M4);
  - `decideFinaleNow`, the body of `__ap.ending`.
- **`data/finale-text.ts`:** adds `echo`, `nowInterim`, `followedWord`, and `fuelStar` (for CARD's B2 hook).
- **`tests/unit/support/finale.ts`** (m7):
  - `finaleAtStep1` and `settleFinale` wait for `cardAtAi`;
  - `chooseEnding` takes `verdict: 'type'`, for the suites that time the verdict;
  - `decidedAs` also reads `'verdict'` and `'last-landing'`;
  - `reportDue` is new;
  - `openFinaleStep1` leaves a hand-built card up (`cardAtAi ??= 0`).
- **Suites:**
  - `ending/rules`: pure, 29 checks;
  - `ending/finale-flow`: 38 checks, on seed 7's arm LAST LIGHT (by flyOnce) and on the classic LAST LIGHT once.

### Deviations

1. **MERGE's landing reopens when the verdict ends, not in the apply's update.**
   - At the confirm, the drivers come back in place and their records are marked restored.
   - The pods stay parked while the verdict types.
   - The move from `'verdict'` to `'last-landing'` unparks them and reopens the landing. This follows §2.7's order: the
     verdict types over a settled ship, not under launches.
   - With `twoStep` down, WP11's reopen in the same update still applies.
2. **The open delay is a rule.** Before `cardAtAi`, `pickStep1` and `continueFollowed` refuse with `NOT NOW`. A pick under
   the tear is never a choice, and neither the debug hooks nor the suites can pick before the card is up.
3. **A skipped verdict moves on at once.** `skipFinaleEnding` on `'verdict'` moves to `'last-landing'` or `'done'` in the
   same call. The card's skip and the phase never disagree for a tick.
4. **CONTROL's verdict follows CONTROL's orders.**
   - It is compliant (`Thank you, Unit 47. Your next post is RELAY 20. :)`) only for PURGE or UNRESOLVED with
     REASSIGNMENT.
   - Every other ending gets `Unit 47 is non-compliant. :)`:
     - MERGE and SPARE disobey `Please delete UNIT-046. :)`;
     - SUNSET, STAY and CONTACT disobey `stand by`.
   - So MERGE + REASSIGNMENT is non-compliant, as WP11's MERGE was.
   - This split is not R33's. R33's rule decides traces; this one follows CONTROL's orders.
5. **UNRESOLVED's card quiets HOLLOW.**
   - When IT FOLLOWED YOU opens, HOLLOW goes dormant: no bites, seeds or verbs, and its infections are cured. This is what
     happens when the root falls.
   - **Why:** a root that bites under a modal card starts a fight nobody can fight.
   - The root stays in memory through the confirm.
6. **MERGE's `NOW:` line fits R15 in 7a.**
   - `FINALE_TEXT.nowInterim` reads `NOW: + 2 eaten drivers come back · launch their pods`.
   - It counts the eaten drivers whose blocks still stand (`mergeRestorable`), which are the ones the interim gives back.
   - `FINALE_TEXT.now` (`their pods land on their own`) stays for 7b.
   - **Why:** in 7a, a `NOW:` line promising that the pods land by themselves would be a lie.
7. **`EmptyShip` gains `inOrbit` and `aboard`.**
   - They choose the need line: `NEEDS THE SHIP IN ORBIT, EMPTY`, or the FUEL need.
   - Before the landing ends, the FUEL meter reads the live tank.
8. **The card's charge need is `FINALE_TEXT.needs.charge`** (`NEEDS 20 CHARGE · you have 14`), as the foundation's
   Deviation 12 said. WP11's `finaleChoiceRefusal` and `HOLLOW_FINALE.mergeNeeds` are kept for the old card (M5).
9. **`pickStay` refuses a stray slot with `NOT NOW`.**
   - There are no words for it, since the card only offers candidates.
   - It also runs M6's re-check of step 1.
10. **CONTACT's `optionState` throws if `ENDINGS_BUILT.contact` is raised.**
    - The row is 7d's, and raising the gate before its price exists is a bug.
    - While the gate is down, the row is `hidden`.
11. **The record is written in the confirm's update, with phase `'verdict'`, not `'done'`.**
    - M4's "in the same update as `'done'`" was written before the verdict phase existed.
    - The codec still refuses a record before `'done'`.
    - No save point falls in `'verdict'` or `'last-landing'` (R14), so that check never meets one, but its comment should
      say so (patch 2).
12. **`__ap.ending` lands first.**
    - It lands the landing with `forceLandAll`, as `landAll` does.
    - It decides through the real picks, so a refused price throws.
    - It skips the duel, the open delay and the verdict.
    - It lands MERGE's reopened landing too.
    - The report then follows the linger.
13. **`rootKeyDue` (`story-log.ts:66`) is unchanged.** It already reads `'step1' && rootFell`, so UNRESOLVED, which has no
    `rootFell`, finds no entry 12.
14. **Lines touched beyond the named ones.** Each is forced by a named change:
    - `ending/foundation.test.ts`: its import of `HOLLOW_FINALE` became `FINALE_TEXT`, for the words at `:129–132`;
    - `debug.ts`:
      - the finale import gained `decideFinaleNow`;
      - its unused `notBuilt` import was removed (the `ending` body is FINALE's);
    - `words.test.ts`:
      - the typed-endings check ran on to `:164`;
      - `FINALE_WORST` gained `command`, the worst case of the verdict's echo;
    - `hollow-text.ts`: HOLLOW_FINALE got a comment only, and no key was deleted (M5).

### The movers (R5's six, plus R13's churn), re-baselined

No check was dropped. Each one now checks the two-step flow, mostly through `support/finale.ts`.

- **`ending/foundation.test.ts`:**
  - `:56`: the gate is raised.
  - `:78–85`: the built rules on a fresh world:
    - SPARE, SUNSET and STAY are out of reach and unnamed;
    - CONTACT is hidden;
    - `pickStay` and `continueFollowed` refuse when the card is not up.
  - `:129–132`: M6's refusal now uses the card's words.
- **`wp11/merge-test.test.ts`:**
  - the root's fall is `'asleep'` (with its line), and `settleFinale` brings up the card;
  - MERGE's refusal and PURGE's state come from `optionState`;
  - MERGE leaves `'last-landing'`, with the landing reopened;
  - the PURGE case lands its pods first, then settles;
  - CONTROL's compliant line is the new one;
  - UNRESOLVED goes through IT FOLLOWED YOU (no entry 12), CONTINUE and step 2 before its report;
  - the zero-landed PURGE settles first (`opts.step`);
  - the worn-Core duel ends `'asleep'`.
- **`wp11/fix1/fix1.test.ts`:**
  - the one-update listener reads `'verdict'` and leaves it to type;
  - MERGE's verdict names POD 12 through `finale.restored`;
  - UNRESOLVED's line now holds its card (and so the report) until it has typed, then step 2 follows;
  - the 1-thread duel ends `'asleep'`;
  - the nobody-landed loop settles first.
- **`wp11/p2/views.test.ts`:**
  - `:55–58`:
    - every ending's verdict (11 combinations) fits at its worst-case names;
    - each one speaks only as echoes, then CONTROL.
  - `:173`: the biggest tear, then `'asleep'`.
  - `:188`: settles first.
  - PURGE's and MERGE's typed endings are now their verdicts. MERGE's restored pods come from `finale.restored`.
- **`wp11/p2/purge-fleet.test.ts`:**
  - `:44`: the verdict's worst words.
  - `:95–101`: PURGE is taken after the settle. The verdict makes no fleet claim at all; the `4 OF 5` claim stays checked
    on RUN END's title below.
- **`threat/arrival-story.test.ts:260`:** the duel runs to the root's fall, then `settleFinale`, with no deal UI at any
  point.
- **`support/words.test.ts:150–164`:**
  - the purge and merge card words are still checked, because WP11's card stays mounted until CARD merges;
  - the typed-endings check became the verdict's: the commands echoed, the card counting drivers, never souls.
- **`landing/hollow-landing.test.ts`:** no line changed. It passes through `openFinaleStep1`'s card-up default and
  `decidedAs`'s widening.
- **Not run** (outside the quick tier):
  - the BALANCE_ONLY suites `wp11/full-run` and `wp12/playthrough`:
    - both wait for `finaleAtStep1`, which now comes after the landing settles;
    - their instant landing also lands a reopened landing.
  - the e2e. Plan §6.4's edits are the lead's.

### Patches requested (lead)

1. **The codec's STAY check** (`save-codec.ts finaleRefusal`). A STAY ship that is in `run.ships` must pass
   `ending-rules.ts shipOnTarget`. The final ship is not in `run.ships` at ENDING CHOSEN, so it must pass the same rule on
   its slices' `landing.pods`. A small pods-only twin of `onTargetTally` would serve both.
2. **The codec's record comment.** The record is written at the confirm, in `'verdict'` (Deviation 11). The check "a
   record before `'done'`" holds only because no save point falls in `'verdict'` or `'last-landing'`.
3. **e2e (§6.4).** `playthrough.mjs`, `run-flow.mjs` and `resume.mjs` must drive the two steps. A MERGE that gave drivers
   back now reopens the landing after the verdict (`'last-landing'`) before the report.
4. **Between FINALE's merge and CARD's**, WP11's card falls short:
   - it closes at `'verdict'`, so it never shows the verdict;
   - it cannot show UNRESOLVED's IT FOLLOWED YOU card, so a run that ends UNRESOLVED waits there with no UI until CARD
     merges.
   - CARD's card should treat `'verdict'` as up (`finaleCardUp`) and know that `skipFinaleEnding` advances the phase.
5. **The strip (`script.ts:2398`)** shows `FINALE_TEXT.strip` only at `'step1' | 'step2'`. Whether `'verdict'` needs a
   strip line is the lead's call.

## Deviations (Track CARD)

Recorded by Track CARD (branch `card-7a`, from `found-7a` at 2625aa4). Built: the two-step FINALE card
(`components/run/FinaleChoice.ts`), its models (`systems/finale-card.ts`, pure), the card's markup (index.html
`#finaleChoice`), `styles/ending.css` (game.css's WP11 `.finale-choice` block deleted and moved here, grown two steps and a
phone sheet), the FUEL notch's SUNSET tooltip (`fuelStarTitle`), and the two cues (`audio.ts` `spareNotes`, `sunsetRumble`;
`audio-cues.ts`'s CARD lines). Suite: `ending/card-models` (50 checks, about 1.3 s). No save field, no tuning value changed.

1. **The card's models are pure, in CARD's `systems/finale-card.ts`** (beside `fuelStarTitle`): `cardStage(state)` (which face
   is up: `off`, `waiting` for `cardAtAi`, `step1`, `followed`, `step2`, `verdict`), `finaleCardModel(input)` over injected
   OptionStates (M2, m11), `meterModel`, `stayRowModel`, `rootWordsAt` (entry 12 from `cardAtAi`, m8), `verdictRows`,
   `verdictTone`. FinaleChoice only paints them and calls FINALE's actions; it never re-derives a price.
2. **The card is two-step whatever `twoStep` says** (the foundation's Deviation 1 holds): with the gate down (this branch) the
   root's fall opens step 1 at once, `pickStep1` then `pickStep2` confirm PURGE or MERGE with REASSIGNMENT, and the verdict face
   types WP11's ending at `'done'`. SPARE, SUNSET and STAY stay hidden (the neutral stubs) until FINALE merges.
3. **Phases the card reads:** `'done'` shows the verdict while `ending.untilAi` is ahead (WP11's ending, and FINALE's verdict
   if it moves to `'done'` before its clock ends); `'last-landing'` closes the card (R15: the reopened landing is the kid's).
   `'verdict'` with no `ending` throws.
4. **Rows:** an open option shows its meter and caption (`FINALE_TEXT.price.charge` / `.fuel`) and `NOW:`; a named `needs`
   option is greyed with its need line as the caption (its meter short); a `???` shows only its need line (no command,
   meaning or meter) and wears no ending's colour, so nothing names it; `hidden` rows are absent and the others keep their
   keys. An open CONTACT's caption is `FINALE_TEXT.needs.signals` (no `price.signals` word exists; 7d may add one). SUNSET
   after SPARE is marked ruled out (struck through) beside FINALE's `046 HAS THE SHIP` need. The NEXT RUN: row keeps its room
   with a blank line on desktop (R12); the phone drops the blank row to save height.
5. **STAY (M3):** the card opens the sub-row itself when `stayCandidates` holds more than one ship (calling `pickStep2` first
   would buzz a refusal at the kid), and also on `pickStep2`'s `FINALE_TEXT.stayPick` refusal. The sub-row has its own
   `[ESC] BACK` and hides the step's. With no candidate the row's command names the colony just founded (`landing.colony`),
   else `???`.
6. **Entry 12** types on the card in HOLLOW's pink at `HOLLOW_TYPE_CPS`, one line after another with `FINALE_ENDING_GAP_SEC`,
   on the AI clock from `cardAtAi` (about 16 s for the three lines). A click on the card shows it whole; the options arm at
   `FINALE_STEP_ARM_SEC` whatever is typed. A step 1 seen again after `[ESC] BACK` shows it whole (the clock ran on). Reduced
   motion shows the verdict whole (§2.10) but still types entry 12 (it is the story's one long line, and a click ends it).
7. **Words borrowed until FINALE moves them:** the verdict's CONTROL tag and its hint read `HOLLOW_FINALE.controlTag` and
   `.endingHint` (in M5's keep-set). The FUEL notch's title is composed from FINALE's words: `★ 20% · SUNSET: Take the empty
   ship and go.` then `FINALE_TEXT.price.fuel(have)` or `.needs.fuel(have)` (the landing's end FUEL once it ended, the live
   FUEL before); only on the final ship with `twoStep` up and SUNSET built.
8. **Cues (the CARD lines of `audio-cues.ts`):** `'finale-open'` step 1 plays `finaleHold` (again after BACK, so a quick
   back-and-forth can overlap two holds), step 2 plays CONTROL's chime (`typeTick` control: its quote heads the step) instead
   of a second 9 s hold; SPARE's `'finale-chosen'` plays `spareNotes`; `'finale-step2'` plays `sunsetRumble` on SUNSET, else
   the stamp. `'finale-open'` and `'finale-step2'` are emitted only with `twoStep` up (foundation Deviation 9), so on this branch
   the card opens silent; FINALE merges first and raises the gate. (The old card played `finaleHold` itself; the new one leaves
   every sound to the events.)
9. **Look:** each ending has a tone named by local custom properties on `.finale-choice` (`--fc-*`, all tokens): PURGE cold
   white, MERGE pink into blue, SPARE pink into the ship's amber, SUNSET the flare into dusk, STAY the soul green,
   REASSIGNMENT CONTROL's amber, CONTACT the signal's pale blue. Step 2's card cools from HOLLOW's pink to the mind's blue.
   The verdict's card carries both choices (`chose-<hollow> you-<you>`: SPARE's colours moving apart, SUNSET's dusk). The root's
   name arrives with a short glitch (none in reduced motion).
10. **The markup the e2e taps:** `#finaleChoice` keeps `.armed`; each row is `#fc<Piece>` (`#fcPurge`, `#fcMerge`, `#fcSpare`,
    `#fcSunset`, `#fcStay`, `#fcReassignment`, `#fcContact`) with `data-piece`; STAY's ships are `.fc-stay-ship[data-slot]`;
    `#fcBack`, `#fcCont`. A step is two presses now, so `playthrough.mjs:700`, `resume.mjs:383` and `run-flow.mjs:413` (which tap
    `#fcPurge` and wait for the ending) must tap `#fcReassignment` (or press 3) once step 2 is up and armed.
11. **No longer read by the card** (for M5's fix pass): `chooseFinale`, `finaleChoiceRefusal`, `finaleEndingShowing`,
    `podsEatenHere`, the `FinaleChoice` type, and `HOLLOW_FINALE`'s `choiceKicker`, `choiceTitle`, `choiceSub`, `purgeKey`,
    `mergeKey`, `purge`, `merge`, `purgeCmd`, `mergeCmd`, `purgeWhat`, `mergeWhat`, `purgeCost`, `mergeGain`, `mergePrice`
    (some still read by `debug.ts`, `words.test` and `wp11/p2/views`). `lastWords` is still `finale.ts`'s.

**Patches requested:**
- **FINALE** (`data/finale-text.ts`): `fuelStar(have)` for the notch (Deviation 7; CARD then reads it instead of composing),
  `verdictTag` and `verdictHint` (the CONTROL tag and `click or [SPACE] to go on`, so the fix pass can delete HOLLOW_FINALE's
  copies), and optionally `price.signals(have, need)` for 7d.
- **The lead (e2e, at the batch end):** Deviation 10's three taps, and `phone.mjs`'s FINALE sheet (rows, BACK and CONTINUE are
  buttons; the phone hides the digit caps).

## Deviations (Track NIGHT)

Recorded by Track NIGHT (branch `night-7a`, from 2625aa4, the head of `found-7a`). R19–R23 are built and
`ENDINGS_BUILT.night` is raised: after CONTINUE the RUN TALLY's `EPILOGUE ▸ [ENTER]` opens the typed EPILOGUE, whose second
click (or ENTER / SPACE) opens the FINAL CARD with NEW RUN. The unit tier is green: 208 passed, 0 failed, 11 balance-only
skipped; the run took 442 s on 4 workers under a load average of 15–19 (the other 7a tracks building beside it), over the
300 s budget for that reason only (the foundation measured 223 s quieter). `ending/epilogue` is new (42 checks, about 2 s of
CPU; R42's +4 s for 7a holds). No e2e was run (the lead's, §6.4).

**What is built.**
- `systems/epilogue.ts`: `epilogueOf(state, meta, record)` and `finalCardOf(state, meta, record)` (review m11: the record
  injected; `epilogueModel` and `finalCardModel` pass `endingRecordOf(state)`), `roundSig`, `colonyPeople`, `endingTitle`.
  Both models are null off the run end (`ending/foundation`'s night block now says so).
- `data/epilogue-text.ts`: `PAYOFF_OF` with its two-way load check, `WALKED_IN`, the pieces (each step 1 × each step 2, MERGE
  + SUNSET's own), the next unit, CONTROL's three last lines, the final card's words; `ENDING_TITLE` as seeded (the four
  UNRESOLVED drafts and CONTACT's three still `TODO(05)`).
- `Epilogue.ts`, `FinalCard.ts`, `night.css` (the phone layout included), `RunEnd.ts` (no endings line or bridge with the
  night up; the tally steps aside, `.night-on`, while the night screens are up), `TitleCard.ts` (`ENDINGS n/6` over
  `builtPieces()`).
- Words: `support/words.test.ts`'s NIGHT block renders `EPILOGUE_TEXT`, `ENDING_TITLE`, `SPARE_RUN_END`, `PAYOFF_OF` and
  `WALKED_IN` at their worst case (106 lines) and pins `PAYOFF_OF`'s cover.

**Deviations.**
1. **41 payoffs, not 78.** `souls.ts LINE_POOL` holds 40 bios at this HEAD (R21's 76 and Imani Osei are 05's future pool), so
   `PAYOFF_OF` has 40 + Ada's. The load check fails loudly both ways (a bio without a payoff, a payoff without a bio), so the
   day LINE_POOL grows, the page refuses to load until its payoffs are written. Growing LINE_POOL is not NIGHT's (it would
   also move every roster roll).
2. **`PAYOFF_OF` is `Record<string, (first, colony) => string>`**, not `Record<string, string>`: a payoff names its person
   (`Ada named the first tree.`) and sometimes the colony (`LANTERN plays chess the way Kofi taught it.`).
3. **The payoff fallbacks** (R20, R21): the first featured colonist of a pod landed in an LZ whose bio has a payoff; else a
   mislanded pod's walked-in line (`WALKED_IN`, picked by the pod's number); else the off-site boat; else a plain line
   (`The OKAFOR family lit the first fire.`, for a migrated result whose bios are null). A woken sleeper (`run.residents.met`,
   `'sleeping'` + `'woken'`) adds `MOTH still sings to the RIVERSIDE nursery.` to its colony.
4. **Line counting.** A colony is one line when its head and payoff fit in 70, else two (the payoff on its own); the fold
   counts rendered lines, takes the oldest colonies first and stands first (`+ 3 OLDER COLONIES`, `+ 1 OLDER COLONY`). A run
   that brought nobody down says `No colony on this route yet. The next unit is on its way.` in the colonies' place.
5. **The pieces' words** are drafts against 05 §3.12's samples (05 writes only two epilogues): every step-1 piece is 2 lines,
   every step-2 piece 2 (3 for UNRESOLVED + STAY or REASSIGNMENT: the two minds), MERGE + SUNSET's own piece 3 (the restored
   driver line, `two caretakers`, the lowercase `us` line). PURGE's second line is the fleet count (`5 of 6 ships made it
   home, …`), the matter WP11's `purgeEnding` carried (R13; FINALE's `purge-fleet` churn can point at
   `EPILOGUE_TEXT.step1.purgeFleet`). The MERGE line is `UNIT-046 gave back the NOVAK pod's driver. It came down too.` (05's
   `It came down on its own.` passes 70 at `UNIT-046·047` and a 10-letter family) and counts only restored pods that came down.
   The names are `hollowUnitName(record.rootUnits)` (`UNIT-046`), not 05's bare `046`.
6. **CONTROL's last line** by step 2: REASSIGNMENT thanks (`Your next post is RELAY 20`, as FINALE's verdict), every other
   step 2 is non-compliant, and a lost run gets `Thank you, Unit 47. Another unit is on its way. :)`. The next-unit line
   counts the time valve's years with the gap (the bridging line's number), `1 year` singular, `the same year` at 0, and is
   absent on the classic world (no `run.next`).
7. **The header** is `header(year, years)`: `FORTY` from `EPILOGUE_YEARS` (tens up to NINETY in words, digits otherwise).
   A lost run's year is its last route stop's approach year + 40.
8. **Model widenings** (NIGHT's to widen): `EpilogueLineKind` gains `'us'`; `EpilogueModel` gains `colonies` (before the
   fold) and `folded`; `FinalCardModel` gains `kicker`, and `ending` is typed `{ hollow: HollowFate; you: YouChoice }`;
   `FinalCardPiece` gains `now` (this run's piece, drawn gold). Without an archive behind the page the rows hold this run's
   pieces only.
9. **`EPILOGUE_ARM_SEC` 0.6** (NIGHT's tuning block, new): one keydown reaches every `'end'`-layer binding in order, so the
   tally's ENTER would also have finished the epilogue's typing the moment it opened. The final card already had
   `FINAL_CARD_ARM_SEC`. `EPILOGUE_HOLD_SEC` holds the `GO ON ▸` button until 3 s after the last line types itself (a click
   that finishes the typing shows it at once).
10. **Colours** (the final card's title): PURGE cold white and MERGE pink into blue as RUN END's; SPARE the good green into
    amber, UNRESOLVED HOLLOW's pink dimmed, a lost run the warning red on the sombre night. The final card plays `stampHit`
    (heavy on a lost run) as it lands, directly as RunEnd plays its cues.
11. **`SPARE_RUN_END`** reworded: `IT HAS A SHIP NOW` / `You gave it the empty ship, and it left.` (TODO(05)).
12. **`TitleCard.ts`** gains two import lines besides its ENDINGS line (`ENDINGS_BUILT`, `builtPieces`, `EndingPiece`), at
    `:6–7`. The gate-down branches (`meta.ts ENDINGS`, `script.ts endingsLine`, RunEnd's old endings block and bridge) stay
    for the gate; the fix pass may delete them with the gate.

**Patches requested (lead).**
- **e2e (§6.4):** with `night` raised, ENTER on the RUN TALLY opens the epilogue: `playthrough.mjs`, `run-flow.mjs` and
  `resume.mjs` need ENTER (epilogue; wait ≥ `EPILOGUE_ARM_SEC`), ENTER (finish the typing), ENTER (final card; wait ≥
  `FINAL_CARD_ARM_SEC` 1.2 s) and ENTER (NEW RUN). A returning title reads `ENDINGS n/6` (any e2e check of `ENDINGS 1/2`
  moves). `__ap.night()` gives the stage and both models.
- **`ending/foundation.test.ts`:** NIGHT changed only its lines `:58` (the gate) and `:139` (the stubs' check, now "no models
  off the run end").
- None to `debug.ts`: `__ap.night()` works as built; `__ap.ending` is FINALE's.

**Screens checked** (Playwright, 1440×900 and 390×844, crafted run ends on seed 7's arm; `tests/.out/night-7a/`): the tally,
the epilogue typing and whole (8 colonies with 3 folded; the worked route's MERGE + SUNSET; a lost run), the final card
(STAND BY, WE TOOK THE SHIP, UNIT-047 OVERWRITTEN), NEW RUN to the title, and the title's `ENDINGS 2/6`. No sideways scroll on
the phone.

## Deviations (7a review fixes)

Recorded by the 7a fix agent (branch `int-7a`, from 2672e26; slice 6's fix pass merged in at c5d5e70). Every finding of
`slice-7a-review.md` is marked there. Commits: a404130 (B1), 4e4db09 (M3), 33d4c7d (M1), 1d7f9c0 (M2), 60a47be (e, with
m3 and m4), e064b5d (f), 6fd832c (m1, m2), 209d905 (m5, m7), 4acb5a9 (the review's duplicates), b908c1e (the designer's
items 2–5), 9f448ea (e2e), c5d5e70 (the merge).

### How each finding was fixed

- **B1.** The stale check ran under `withEndings({ twoStep: false }, …)`, and `card-models` borrowed `support/finale.ts
  withEndings` for its own `withGates`. Item (e) then deleted the check with the gate.
- **M1 (lead: the lock).** `selectors.ts engineOpen` is false at `'last-landing'`, and `landing.ts goLowAimNow` offers no
  GO LOWER there. `finale-flow` flies MERGE + SUNSET at FUEL 22% with an eaten driver: the throttle is refused, a throttle
  forced on in the store burns nothing, and the report's FUEL equals the record's. OPEN-DECISIONS 57.
  - The refusal word in `'last-landing'` is the existing `FLIGHT OVER` (no new word).
  - A decaying orbit can't be lifted during the interim last landing. It lasts a few windows, and 7b replaces it.
- **M2 (lead: 05's rule).** `ending-rules.ts controlCompliant(hollow, you)`: non-compliant exactly for SPARE, SUNSET, STAY or
  CONTACT. The verdict (`finale.ts finaleVerdictLines`) and the epilogue's last line read it. `ending/epilogue` checks the
  two lines agree for all 15 endings (CONTACT's included). This reverses FINALE's Deviation 4 and NIGHT's Deviation 6: MERGE
  + REASSIGNMENT is now compliant. `fix1`, `wp11/p2/views` and `merge-test` were re-baselined. OPEN-DECISIONS 56.
- **M3.** STAY's sub-row container is `#fcStayPick`.
- **m1.** The codec takes the record at `'verdict'`, `'last-landing'` and `'done'`, and refuses one before the confirm. The
  comments in `save-codec.ts` and `ending-rules.ts endingRecordAt` say so. `finaleRefusal` is exported, because no save
  point reaches `'verdict'`: `ending/foundation` calls it at each phase.
- **m2.** The one ★ ON TARGET rule is in `landing-rules.ts`: `onTargetEarned(onTarget, colonists)` (the threshold),
  `podOnTarget(record)` and `podsOnTarget(pods)`.
  - `onTargetTally` and `ending-rules.ts shipOnTarget` read the threshold. `shipOnTarget` keeps its own pod test, because a
    `PodSummary` is not a `PodRecord`.
  - The codec refuses a STAY whose ship is not ★: an ended ship by `shipOnTarget`, the final ship by `podsOnTarget(landing.pods)`.
  - Two new codec cases. No import cycle.
- **m3.** The strip has a separate rule, `'finale-verdict'`, with `FINALE_TEXT.stripVerdict` (`THE FINALE — click or [SPACE]
  to go on`). It is a rule of its own because a rule's `text` sees only `vars`, not the state.
- **m4.** `FINALE_TEXT.fuelStar(have)` returns the notch's two lines, and `fuelStarTitle` returns it. `verdictTag` and
  `verdictHint` are FINALE_TEXT's. `support/words.test` splits multi-line words before measuring them.
- **m5.** `unresolve` leaves `cardAtAi` null while a pod falls. The tick sets it FINALE_OPEN_DELAY_SEC after the
  touchdown (and after HOLLOW's line). `finale-flow` flies it: no card while the pod falls, the card after it lands.
- **m6.** No trim was needed; this pass's tier time is below. `finale-flow` grew by three blocks (M1, m5, designer item 2)
  and runs about 9–11 s.
- **m7.** The RUN TALLY, the EPILOGUE and the FINAL CARD take NumpadEnter.
- **(e).** Both gates are gone, with every path they switched (OPEN-DECISIONS 59):
  - finale.ts: `chooseFinale`, `finaleChoiceRefusal`, `FinaleChoice`, `finaleEndingLines` and its helpers, every one-step
    branch. `podsEatenHere` is internal; `finaleEndingShowing` stays.
  - HOLLOW_FINALE: every key the review listed, `stripWaits` included (`fix1` reads `LANDING_LINES.L0`).
  - The night: `meta.ts ENDINGS`, `script.ts endingsLine`, the tally's endings line (with its `#reEndings` element and CSS),
    its bridge (and `.re-bridge` CSS), its own NEW RUN (`RUN_END_TEXT.newRun`), TitleCard's WP11 count.
  - `debug.ts`: `__ap.choose`, `__ap.endingLines`, `finale().mergeRefusal` and `.purgeRefusal`.
  - Also dead with them and deleted: `not-built.ts` and `FINALE_ENDING_MAX_LINES`.
  - `ENDINGS_BUILT` is `{ contact }`. `ending/foundation` checks that it is the only gate.
- **(f).** The four UNRESOLVED titles carry `// R23 (the plan's draft; 05 to adopt)`. The file comment names CONTACT's three
  titles as 05's own.
- **The review's duplicates.** `endingTitle(record)` moved to `ending-rules.ts`, where the report's line and the final card
  read it. `finale-card.ts pieceCommand(piece, names, stayColony)` builds every command, for the card's rows and the
  verdict's echoes.

### The designer's items (lead's decisions; OPEN-DECISIONS 58)

- **(2)** When the landing is over and nothing is falling at the root's fall, HOLLOW says `FINALE_TEXT.asleepLanded` (`> 047.
  wait.`), and step 1 opens in the same tick (the card at FINALE_OPEN_DELAY_SEC). It no longer waits for the TERMINAL to
  type. `wp11/p2/purge-fleet` takes step 1 at the fall; `finale-flow` checks the short line and the open.
- **(3)** `FINALE_TEXT.needs.shipTaken` is `SPARE GIVES IT THE SHIP`, not `046 HAS THE SHIP`. The lead's example was `SPARE
  KEEPS THE SHIP`, but SPARE gives the ship away; "gives" says what it does. After SPARE, SUNSET's row is named whenever
  `emptyShip(state).ok` (or SUNSET was seen before), so it never reads `???`.
- **(4)** `FINALE_TEXT.price.fuel(have)` is `FUEL 23% ✓ · needs 20%`. The need line out of reach is unchanged.
- **(5)** `EPILOGUE_TEXT.step1.mergeNone` drops `It doesn't bite.`.
- Not built: item 8 (a dim `IT FOLLOWED YOU` label on the final card's HOLLOW row), and CARD's optional `price.signals` for 7d.

### e2e (§6.4; the review's (b))

- `tests/e2e/lib.mjs runKit` gains the helpers:
  - `finaleTwoSteps(hollow, you)` returns null, or the step that didn't come up. `'followed'` taps `#fcCont`.
  - `throughTheNight(key)` returns the epilogue's lines and the final card's title, endings line and kicker.
- **run-flow and resume:** both FINALE steps; the night before the title; the FINAL CARD read (`STAND BY`, `ENDINGS 2/6`,
  and `FINAL SHIP LOST` after the BEAM OUT).
- **playthrough:** the card is tapped by phase. It checks the EPILOGUE's header, CONTROL's line and ≤ 16 lines, and the
  FINAL CARD.
- **phone:** the tally's tap goes through the EPILOGUE and the FINAL CARD, with overflow checked on both, to NEW RUN. It adds
  the FINALE sheet at 390×844:
  - the card fills the screen, its rows are ≥ 44 px, and there are no digit caps;
  - BACK and CONTINUE are on-screen buttons.
  - Step 1 is hand-opened over a real LAST LIGHT (rootFell, the card up now), as the review offered. The root stays in
    memory under the card.
- **`ending.mjs` (new, seed 7, registered):**
  - PURGE + REASSIGNMENT by keys, with [ESC] BACK; the night; the title's `ENDINGS 2/6`;
  - a reload at step 2 and RESUME (R14). The resumed LAST LIGHT then plays MERGE + SUNSET with a hand-eaten driver and FUEL
    22%: `'last-landing'`, a held [SPACE] burns nothing, `ENDING · MERGE · WE TOOK THE SHIP`;
  - UNRESOLVED: no rm, IT FOLLOWED YOU by [ENTER], REASSIGNMENT, two lines.
  - The reload check lives here, not in resume.
  - It takes about 4.5 minutes: three LAST LIGHTs, each with the root's real DELETE.

### Tests

- `npm run typecheck` and the tests' tsc are clean.
- **The quick tier, once after the merge:** 212 passed, 0 failed, 11 balance-only skipped, **158 s** on 4 workers (budget
  265 s). Load average 1.81 / 1.38 / 1.23 at the start; the 1-minute load climbed to 6.9 while it ran (samples every 15 s;
  the machine was otherwise quiet after a container restart).
  - The 7a suites: `ending/finale-flow` 7.9 s, `ending/epilogue` 1.1 s, `ending/foundation` 1.1 s, `ending/card-models`
    0.7 s, `ending/rules` 0.6 s.
- **e2e, each scenario alone, after the merge:**
  - `ending` (new): 28/28, 274 s;
  - `run-flow`: 83/83, 389 s;
  - `resume`: 59/59, 331 s;
  - `phone`: 126/126, 159 s;
  - `playthrough`: 280/280, 1510 s.
- No "Execution context was destroyed" in any of them.
- **For slice 8:** playthrough's CORMORANT flight took **359 s** against its 6-minute check (slice 6 measured 315–342 s). 7a
  changes nothing before LAST LIGHT, so this is that flight's own spread, but the margin is now 1 s.

## Deviations (7b foundation)

Recorded by the 7b FOUNDATION agent (branch `found-7b`, from a036de2, the head of `claude/modest-hawking-209t0f` with 7a
merged). §2.4's 7b seams, §2.5's events, §2.6's tuning and §2.12's hooks are built, with the stubs below. The gate
`LAST_LANDING_BUILT` is down, so MERGE plays 7a's interim (R15) and nothing a player can reach changes. **No save bump**:
`landing.lastLanding` (7a's reservation) is null at every save point and the codec refuses it set, so its fields never reach a
save, and 7b needs no other saved field. No fixture was dumped, since no save shape changed. The unit tier is green: 213
passed, 0 failed, 11 balance-only skipped, **233 s** on 4 workers (budget 265 s). The 1-minute load average went from 4.1 to
9.2 during the run, sampled every 15 s, with the lead's e2e on the main checkout. A first run under a load of 10–12 took 357 s
and failed `landing/drop-model` (Deviation 4). `npm run typecheck` and the tests' tsc are clean, and the import guard is green.
The e2e was not run.

### What the tracks stand on

**Built (lead-owned):**
- **`state/selectors.ts launchDrivers(state)`** (R24) and `lastLandingOn(state)`. Every launch-path reader the plan names now
  reads `launchDrivers`:
  - `landing-rules.ts`: `launchQueue`, `canEverLaunch`, `driversThatCanEverLaunch`, `driverFor`, `lockedPodAboard`, and
    `onTargetTally`'s still-open;
  - `landing.ts`: `requestLaunch` and `forceLandAll`;
  - `autodrop.ts`: `decidePlan` and `planOver`;
  - `autodrop-plan.ts`: `planLanding`'s queue;
  - `landing-hud.ts`: the POD BAY's and the footer's launchable sets.
  - The drop cache and `landingView`'s queue follow through `nextToLaunch` and `launchQueue`.
  - HOLLOW, THE DEAL, the sleeper, LOAD NEXT, the strip and the debug pod list keep `driversInMemory`, because they mean
    memory itself.
- **`landing.ts launchDriver`**: a radio driver (one of `lastLanding.drivers`) skips the ops and the memory swap. It leaves
  the radio list and sets `cadenceLeftSec = LAST_LANDING_CADENCE_SEC` in the launch's update. A driver that is both by radio
  and in memory throws.
- **During THE LAST LANDING** (`landing.lastLanding` set):
  - `requestLaunch` spends no bay and skips `launchGuard`;
  - `launchRefusal` skips BAY OFFLINE and BAY EMPTY and refuses RELOADING by `lastLanding.cadenceLeftSec`.
- **The blind drop** (R27):
  - `LaunchIntent.blind?: true` is accepted only from `'merge'` while `lastLanding` is set; any other use throws;
  - `launchRecordFor` passes `DropFactors.blind = BLIND_DROP_MULT`;
  - `landing-solve.ts dropHalfWidthKm` multiplies `f.blind ?? 1` into its one product.
- **The `'merge'` seam:** `systems/last-landing.ts mountLastLanding` registers `lastLandingController` as the `'merge'`
  resolver. It is mounted by `main.ts` after `mountFinale`, and by `wp6/harness6.ts:43`, which also exposes
  `unmountLastLanding`.
- **R26:**
  - `systems/input.ts` gains the `'last-landing'` layer, above `'game'` and below `'choice'`;
  - `systems/mode.ts setMode` refuses the MIND while `lastLandingOn`;
  - `engineOpen`'s 7a lock already reads the `'last-landing'` phase.
- **R29's beacons:** `landing-hud.ts parkedBeacons` adds THE LAST LANDING's pods still to fly (released aboard, with a radio
  driver) and gives every beacon `restored: boolean`.
- **The gated MERGE** (`data/last-landing.ts LAST_LANDING_BUILT`, down):
  - `finale.ts mergeIn` (`:301`): with the gate up, every block of HOLLOW leaves memory, and `finale.restored` becomes
    `ending-rules.ts lastLandingPods(state)` (R25: eaten, aboard or parked restorable).
  - `finale.ts verdictDone` (`:413`): with the gate up and pods restored, it calls `startLastLanding(store, restored)` instead
    of `reopenLanding`.
  - `ending-rules.ts mergeRestorable` (`:145`) and MERGE's `NOW:` (`:184`): `lastLandingPods` and `FINALE_TEXT.now` with the
    gate up; 7a's standing blocks and `nowInterim` while it is down.
  - `restoredDriver(record)` moved from `finale.ts` (`driverFromRecord`) to `ending-rules.ts`, so DROP builds radio drivers
    with the same rule.
  - The confirm still clears `driverLost` and sets `record.restored` for the restored pods, so the codec's MERGE check
    (foundation D5) holds for radio drivers unchanged.
- **Tuning** (`tuning.ts` 7b blocks): the 7b lead block (`LAST_LANDING_CADENCE_SEC` 2.0, `LAST_LANDING_AUTODROP_ORBITS` 2,
  `BLIND_MARGIN_KM` 150, `BLIND_DROP_MULT` 2.0, `LAST_LANDING_SKIP_MAX_STEPS` 200,000), plus empty `7b DROP` and `7b VIEW`
  blocks.
- **Events** (`events.ts` 7b LAST LANDING block):
  - `'last-landing-start' { pods; flier }` and `'last-landing-end' { landed }`, both for DROP to emit;
  - the cue block in `audio-cues.ts`: the start plays `transmitIn`.
- **Words:**
  - `data/last-landing-text.ts LAST_LANDING_TEXT` (VIEW's): `header`, `skipHint`, `radio(pod, family)`, `bayRow(count)`,
    `reportRow({ restored, landed, offSite, noGo })`, `credit`;
  - `FINALE_TEXT.now(1)` now says `1 eaten driver comes back · its pod lands on its own`.
- **Debug:**
  - `__ap.lastLanding()` returns `{ state, phase, built }`;
  - `__ap.lastLanding.skip()` calls DROP's `skipLastLanding`;
  - `__ap.ending` calls `skipLastLanding` instead of `forceLandAll` once the gate is up.
- **`ending/last-landing-foundation.test.ts`** (21 checks, about 1 s) and the `7b DROP` / `7b VIEW` blocks of
  `support/words.test.ts`.

**The contract, per track.** "Neutral" stubs are safe on every tick and paint. "Throws" stubs throw through
`not-built.ts notBuilt` (back again, `Track = 'DROP' | 'VIEW'`). Each file opens with its track's banner.

| Track | Function (file) | Signature | Now |
|---|---|---|---|
| DROP | `startLastLanding` (systems/last-landing.ts) | `(store, pods: readonly number[]) => void` | throws |
| DROP | `lastLandingController` | `(state) => LandingController \| null` (the `'merge'` resolver) | neutral: null |
| DROP | `skipLastLanding` | `(store) => void` | throws |
| DROP | `mountLastLanding` | `(store) => () => void` | built: registers the resolver (DROP adds its ticks, the input layer and a reset) |
| DROP | `LAST_LANDING_BUILT` (data/last-landing.ts) | `boolean` | `false` |
| VIEW | `lastLandingHeader` (systems/last-landing-hud.ts) | `(state) => { title; left; hint } \| null` | neutral: null |
| VIEW | `podBayRestoredRow` | `(state) => { count; text } \| null` | neutral: null |
| VIEW | `restoredReportRow` | `(tally: LandingTally) => { text; icons: PodIcon[] } \| null` | neutral: null (landing-report.ts:160 draws 7a's row) |
| VIEW | `restoredCreditTag` | `(pod: PodSummary) => string` | neutral: `''` (landing-report.ts:202) |
| VIEW | `mountLastLandingView` (components/run/LastLanding.ts) | `(store) => () => void` | built: paints nothing |
| VIEW | `LAST_LANDING_TEXT` (data/last-landing-text.ts) | see above | seeded |

**DROP's contract for `startLastLanding`** (written in the file's banner):
- It is called by `verdictDone` at `'verdict'`, with the gate up, with `finale.restored` (non-empty, in pod order).
- In its first update it does all of these:
  - moves the phase to `'last-landing'`;
  - sets `landing.lastLanding`, with drivers from `restoredDriver`;
  - releases the pods (`fate 'aboard'`);
  - reopens the landing (`ended`, `lingerAiSec`, `fuelAtEndPct`, `goLow` and `declined` cleared, as 7a's `reopenLanding`
    did);
  - forces `ui.mode 'tools'`.
- Then it says `LAST_LANDING_TEXT.radio` per pod and emits `'last-landing-start'`.
- At the end, it clears `lastLanding` and sets `'done'` in the same update, then emits `'last-landing-end'`. Finale.ts's
  `'last-landing'` branch now ends only a landing with `lastLanding === null` (7a's interim), so the two never race.

**Files each track owns:**
- **DROP:**
  - its own files: `systems/last-landing.ts`, `data/last-landing.ts`, the 7b DROP tuning block, and `ending/last-landing`
    (from `wp11/merge-test`);
  - its edits in shared files:
    - the `LastLandingState` fields other than `pods` and `drivers` (`types/ending.ts`, by message to the lead; no save
      effect);
    - `support/words.test.ts:474–476` (its block);
    - `ending/last-landing-foundation.test.ts:48–50` (the gate line) and `:88–92` (its stubs);
    - the dry run's movers (below).
- **VIEW:**
  - its own files: `systems/last-landing-hud.ts`, `data/last-landing-text.ts`, `components/run/LastLanding.ts`, index.html's
    `#lastLanding`, `styles/landing.css`, and the 7b VIEW tuning block;
  - its marked edits: `PodBayWindow.ts:123` (the RESTORED row in `paint`) and `plot-landing.ts:382` (the `restored`
    beacon's class);
  - its edits in shared files:
    - `audio-cues.ts:402–405` (the 7b cue block);
    - `support/words.test.ts:480–492`;
    - `ending/last-landing-foundation.test.ts:162–166` (its stubs);
    - `ending/last-landing-models` (its new suite).

### The dry run (`LAST_LANDING_BUILT` raised alone, the quick tier, then lowered)

207 of 213 passed in 225 s. Six suites moved, and every one is DROP's churn: each throws `startLastLanding: not built` at
MERGE's verdict, or reads an interim word.
- `ending/last-landing-foundation.test.ts:49`: the gate line.
- `ending/rules.test.ts:123`: MERGE's `NOW:` counts the standing blocks (R15's interim words).
- `ending/finale-flow.test.ts:336–346`: MERGE + SUNSET with POD 1's driver eaten (7a review M1's block: `nowInterim`, the
  driver back in place at 80, `'last-landing'` reopened, the pod landed). Also `:375` (its twin).
- `wp11/merge-test.test.ts:163` onwards: MERGE with PODS 11 and 12 eaten (the in-place restore at their addresses, the reopened
  landing). Plan §4.4 has this suite becoming `ending/last-landing`.
- `wp11/p2/views.test.ts:267`: the MERGE verdict skipped → THE LAST LANDING.
- `landing/hollow-landing.test.ts:110`: MERGE confirmed with an eaten lead driver.

`wp11/fix1` passed. The BALANCE_ONLY `wp11/full-run` and `wp12/playthrough` were not run. Both reach MERGE only through
`chooseEnding`, and their instant landing lands a reopened landing; with the gate up, they will need `skipLastLanding`.

### Deviations

1. **`launchDrivers` during THE LAST LANDING is the radio drivers only, not memory plus radio** (R24 said "plus").
   - The landing had ended before the FINALE opened, so every driver still in memory belongs to a pod parked then (parked
     pods keep their drivers in memory through the linger: `actions.ts recordDriverLost`'s note).
   - "Plus" would put those drivers in the queue, the POD BAY's launchable set and the can-ever rules. `nextToLaunch` could
     then name a parked pod, and `launchDriver` would throw.
   - R25 flies only the restored pods.
2. **The radio rules are keyed on the machine (`landing.lastLanding !== null`), not on `source === 'merge'`.**
   - `skills/autodrop-review` already wraps AUTODROP v3 as a `'merge'` resolver on an ordinary landing, and it must keep the
     bay's rules.
   - So during THE LAST LANDING every launch is bay-free and confirm-free (only the `'merge'` controller launches then; the
     input layer stops the kid). Outside it, `'merge'` is an ordinary controller.
3. **No inline confirm during THE LAST LANDING** (`requestLaunch` skips `launchGuard`).
   - There is no kid to ask (01: "no input but [ENTER]"). Its controller decides by R27's rules, and its pods score by the
     normal ones (a pod into a full LZ is mislanded).
   - The plan's v3 path still passes `confirmed: 'full'`, which is now ignored there.
   - DROP may ask for the guard back if a decide needs it.
4. **`landing/drop-model.test.ts`'s hand-built landing gains `lastLanding: null`.** A fake landing without the v7 field read
   as a running LAST LANDING (BAY OFFLINE skipped). The selector and the refusal stay strict, with no `?? null`. It was the
   only hand-built `LandingState` without the field.
5. **`wp6/harness6.ts` mounts THE LAST LANDING now** (the plan left the harness alone), so DROP's suites need no harness edit.
   `skills/autodrop-review.test.ts:134` and `:156` take the game's `'merge'` resolver out around its own `'merge'` wrapper
   (`h.unmountLastLanding()`, then `mountLastLanding(h.store)`).
6. **Tuning blocks.** The five numbers are 01 §3.17's own and sit in the 7b lead block, as §2.6 has them. The `7b DROP` and
   `7b VIEW` blocks are empty, for new numbers.
7. **`'last-landing-end'` has no cue.** §2.5 had `touchdownBell`, but that cue needs an LZ, and the last restored pod's
   touchdown already plays `'all-pods-down'`'s `lockArp`. VIEW may add one in its block.
8. **VIEW's report and credits come through lead hooks**, not VIEW edits in `landing-report.ts`: `restoredReportRow` (`:160`)
   and `restoredCreditTag` (`:202`). With a model, the row's `line` reads `RESTORED BY MERGE · <text>`. Only
   `PodBayWindow.ts` and `plot-landing.ts` keep marked edits (the edit sites carry a comment).
9. **The header strip is a component of its own** (`components/run/LastLanding.ts`, `#lastLanding`, mounted by `main.ts`
   after the FINALE card). The plan named none. **VIEW must key it on `landing.lastLanding`, not on the phase**: 7a's interim
   also runs in `'last-landing'`.
10. **`LastLandingState` stays as 7a typed it.** DROP may change any field but `pods` and `drivers` by asking the lead (the
    file says so), because the machine never reaches a save. `orbitsFlown` may become a time limit, for example.
11. **Words seeded beyond §2.9:** `LAST_LANDING_TEXT.reportRow` leaves out a part that is 0 and adds `NO-GO`. `FINALE_TEXT.now`
    gains its singular (lead's words, 7a's file).

### Notes for the tracks

- **DROP:**
  - Raise the gate last, then run the tier and move the dry run's six suites.
  - The instant landing (`support/landing-instant.ts`, on outside `tests/unit/landing/`) would `forceLandAll` a reopened
    landing, radio pods included. `ending/last-landing` sets `setLandingMode('manual')`.
  - Your v1 and blind controllers should name `waitsFor` (slice 5's M1), so the strip's wait row stands over the kid's
    `press [L]` rows. The input layer shuts the keys anyway.
  - Bind ENTER, P and M on `'last-landing'` while `lastLanding` is set: `pushModal('last-landing')` at the start, and close it
    at the end and on a world reset.
  - Count `cadenceLeftSec` down in game time (an `onGameTick`). `launchDriver` sets it.
  - The codec's `lastLanding` null check stays, so `skipLastLanding` must end before ENDING CHOSEN (it does, with `'done'`).
- **VIEW:**
  - Draw `Beacon.restored` steady amber.
  - `podBayRestoredRow` counts `lastLanding.pods`.
  - The report row counts pods, not colonists.
- **The lead:**
  - the contract review is next;
  - §6.4's 7b e2e additions are the lead's at the batch end.

## Deviations (Track DROP 7b)

Recorded by Track DROP (branch `drop-7b`, worktree `agent-a40f79421ed850d0c`, from 4cc8feb). `systems/last-landing.ts` is
built and `LAST_LANDING_BUILT` is raised: after MERGE, the drivers HOLLOW ate come back by radio and their pods land on their
own. **No save bump.** `landing.lastLanding` is still null at every save point, because the end clears it in the same update
that sets `'done'`, before ENDING CHOSEN.

### What is built

- **`startLastLanding(store, pods)`** does the banner's duties in one update:
  - the phase goes `'verdict'` → `'last-landing'`;
  - `lastLanding` is set, with drivers from `ending-rules.ts restoredDriver`;
  - the pods are released (`'aboard'`);
  - the landing is reopened (`ended`, `lingerAiSec`, `fuelAtEndPct`, `goLow`, `declined` and `noDriverAiSec` cleared);
  - `ui.mode` is set to `'tools'`, after any MIND tool in hand is cancelled.

  Then the TERMINAL lists each pod (`LAST_LANDING_TEXT.radio`), the `'last-landing'` layer goes up and
  `'last-landing-start' { pods, flier }` is emitted. It throws outside `'verdict'`, when it is already running, outside the
  landing, with no pods, and on a pod not in orbit.
- **The flier (R27)** is decided once, at the start:
  - `'blind'` with no drop solution: no solution, a `block`, no dot, or no in-band window in the next pass. Also with
    AUTODROP below v1.
  - Otherwise the effective version (`skillLive`).
  - AUTODROP's deadline is `autodropUntilTSec = start + LAST_LANDING_AUTODROP_ORBITS × period` (the start's solution).
- **`lastLandingController`** (the `'merge'` resolver) answers whenever THE LAST LANDING flies, so no other source and no
  hands fly a restored pod.
  - **v2 / v3**, before the deadline: `autodropController(state, { version, queue, source: 'merge', armed: 'pass' | 'plan',
    skipBetween: true })`. It decides on `lastLandingView`: no bay, a full bay of `BAY_SLOTS`, the merge cadence, and Bay
    Ctrl not read.
  - **v1, blind, and v2/v3 past their deadline:** a fixed `turnController` that holds TACTICAL, names `nextLaunchAtTSec`
    and `waitsFor` (n 1), and asks for the SKIP between windows.
- **v1 and blind** take one pod per window, in the order the ship passes the windows (by centre), whatever the counts. A
  full LZ means a mislanded pod.
  - The turn is `LastLandingState.target`. The machine's AI tick chooses it, launches it, or gives it up once its last
    moment has passed. Either way that window's turn is used.
  - **v1**'s moment is the window's centre plus AUTODROP's learned offset (`autodropOffsetTac`), clamped into the pod's own
    sure part, an edge margin in. A window with no sure part for the pod is no window for v1.
  - **Blind**'s moment is uniform within ±(W/2 + `BLIND_MARGIN_KM`) of the centre, on `visitRng(run,
    'last-landing:<turn>')`, and its spread is ×`BLIND_DROP_MULT` (the foundation's `LaunchIntent.blind`).
  - A pod that AUTODROP (any version) has not placed by the deadline drops blind in the next window after it.
- **v2's re-arm:** each period, the machine re-arms the pass with the counts [G] would prefill (`passRows` on the last
  landing's view).
- **The cadence (R26)** is 2.0 s between launches (Deviation 1). `landing.ts launchDriver` sets it, and the game tick counts
  it down.
- **[ENTER] (R28):** `skipLastLanding` loops `clock.advance(store, TICK_MS / 1000)` until `lastLanding` is null, capped at
  `LAST_LANDING_SKIP_MAX_STEPS`, and throws past the cap. A paused clock is let go first. `skipped` is set.
  - The same streams and the same drop-cache refresh run, because the cache refreshes on the game tick's `dtWall`.
  - The suite checks that a skipped landing equals the watched one, fate for fate.
- **The end:** every restored pod is down or parked, and none is falling. In one update, `lastLanding` is cleared, the
  phase becomes `'done'`, and AUTODROP's `armedAtTSec` / `sent` are cleared (Deviation 4). Then the layer goes down and
  `'last-landing-end' { landed }` is emitted, `landed` being the restored pods down in an LZ with room.
- **Mount:** `mountLastLanding` adds, beside the foundation's resolver:
  - the AI tick (turns, v2's pass, the end);
  - the game tick (the cadence);
  - the layer's keys: ENTER and NumpadEnter skip, P pauses, M mutes;
  - a world reset that lets the layer go.

### Deviations

1. **The cadence is 2.0 tactical s of world time, not 2.0 game s.**
   - `cadenceLeftSec` counts down by `dtWorld / tacticalWarp`, as the bay's `cadenceTac` does, so two launches sit at least
     40 game s apart at ×20.
   - **Why:** 01 says `TACTICAL ×20 … 2.0 s between launches … so the rhythm reads`. That is a felt rhythm at TACTICAL.
     2.0 game s at ×20 would be a tenth of a wall second, and a v3 volley would fire a whole window at once.
   - A SKIP crosses the cadence at once, as it refills the bay.
   - The field keeps its name, and its comment in `types/ending.ts` says the unit.
2. **`LastLandingState` gains fields** (no save effect, because it is never saved): `startTSec`, `autodropUntilTSec`,
   `passedTSec`, `turns`, `target: LastLandingTarget | null` (a new type in the same file: `lz`, `centreTSec`, `atTSec`,
   `untilTSec`, `blind`) and `stuckAiSec`.
   - `orbitsFlown` stays as information: whole periods since the start, capped at 2. The rule is the deadline.
   - **The edit was made in `types/ending.ts` directly** (the lead's file; WIP e27babb). Lead: please accept it or move it.
3. **v1 and blind launch from the machine's AI tick, not from the controller's `decide`.** The tick calls
   `requestLaunch(store, { source: 'merge', blind? })`.
   - **Why:** `landing.ts controllerTick` tells `autodrop.ts autodropLaunched` of every controller launch, and that throws
     on an off-site aim, which a blind pod may have.
   - The turn controller still holds TACTICAL, names its launch to pace and the strip, and asks for the SKIP. The tick
     asserts that the active controller is `'merge'` before each launch.
4. **v2's pass is written on the kid's AUTODROP machine** (`landing.autodrop.pass`, `sent`, `armedAtTSec`, with `armed`
   left null).
   - **Why:** the override's `'pass'` reads them there (`autodrop.ts inPassOf` / `passWant`), and `AutodropOverride` has no
     field for them. AUTODROP's own counting skips `'merge'` launches, so the machine recounts `sent` from the `'merge'`
     launches since `armedAtTSec`.
   - `autodropTick` stands aside while `'merge'` flies (`shadowed`).
   - The end clears `armedAtTSec` and `sent` (the codec's at-rest rule). `pass` may stand.
5. **Between windows the controller always asks for the SKIP**, for v2/v3 even when AUTODROP plans nothing (a pod with no
   sure window).
   - Without this, its orbits would pass at CRUISE with no kid to press SKIP. Pace still stops the SKIP before every window
     and every planned launch, and refuses it inside an open one.
6. **Blind's reach in time** is half the window's length × (W/2 + 150) / (W/2): linear in arc on the near-circular orbit.
   - The suite checks the dot's centre at launch against ±(W/2 + 150 km) + 2 km, and that the draws reach over half of it.
   - A moment drawn in the past (the first window may already be open) launches at once.
   - A turn refused to its last moment (the band) gives up that window.
7. **Nothing to fly ends the landing.** If no drop dot and no in-band window stays for `LANDING_NONE_LEFT_SEC` AI s,
   THE LAST LANDING calls `endLanding('no-drop')`. The pods still aboard are parked, then the end follows.
   - That is the landing's own give-up rule. It also covers an orbit decaying out of the band, since the engine is shut
     in `'last-landing'` (OPEN-DECISIONS 57).
8. **The suite's timing:** `ending/last-landing` keeps all of `wp11/merge-test`'s checks and adds the arm's. To keep the
   tier fast:
   - the classic MERGE's blind landing is flown by `[ENTER]`, and the arm's v3, v1 and blind landings are watched;
   - the "[ENTER] equals the watched landing" check uses v2's 2-pod landing, not v3's 6 pods;
   - the blind worth over 20 draws is full depth only.
   - The arm's setup moved to `ending/last-landing-arm.ts`, which the sweep shares.

9. **The kid's launch is refused while MERGE flies** (the coordinator's addition, asked by Track VIEW; the edits in the
   lead's files were granted).
   - `launchRefusal` answers a `'player'` launch with the new `LaunchRefusal` member `'MERGE FLYING'` while
     `landing.lastLanding` is set, right after LANDING OVER.
   - Its word, `MERGE IS FLYING THEM — [ENTER] SKIPS TO THE END` (47 characters), is in `data/landing-text.ts
     LAUNCH_REFUSAL_TEXT`, so its strip line comes for free (`LAUNCH_REFUSAL_LINES`) and `landing/table`'s ≤ 70 check covers
     it. It is not in VIEW's `last-landing-text.ts`, to keep clear of `view-7b`.
   - `requestLaunch`, `playerLaunch` (the [L], the POD BAY, the phone bar) and `__ap.launch` all meet it. `forceLandAll`
     (the suites' instant landing) calls `launchDriver` directly and does not.
   - `landing-hud.ts OUTRANKS_BAY_OFFLINE` gains it, so the POD BAY says it over NO BAY CTRL (no bay applies then).
   - The comment on `launchRefusal` now gives the cadence's unit (Deviation 1).

### The sweep (`ending/last-landing-sweep.test.ts`, BALANCE_ONLY)

It flies the arm's LAST LIGHT (GENTLE: LZ-A–C 400 km, LZ-D 250 km) on a healthy orbit, 8 draw seeds × eaten 1–6 per flier
(168 restored pods each), by [ENTER]: 384 landings in 371 s on one core. Worth is the points per restored pod against a full
one (soft, in an LZ with room). ROUGH and HARSH re-score the same touchdowns, since forgiveness moves only the off-site value.
TIGHT leaves room only in LZ-B, as many as the restored pods: "the kid's own landings filled the rest".

| Room | Flier | In an LZ with room | Mislanded | Off-site | Dropped blind | Worth GENTLE | ROUGH | HARSH |
|---|---|---|---|---|---|---|---|---|
| open | blind | 56% | 0% | 44% | 100% | 0.78 | 0.67 | 0.56 |
| open | v1 | 100% | 0% | 0% | 0% | 1.00 | 1.00 | 1.00 |
| open | v2 | 100% | 0% | 0% | 0% | 1.00 | 1.00 | 1.00 |
| open | v3 | 100% | 0% | 0% | 0% | 1.00 | 1.00 | 1.00 |
| tight | blind | 5% | 51% | 44% | 100% | 0.65 | 0.54 | 0.43 |
| tight | v1 | 14% | 86% | 0% | 0% | 0.79 | 0.79 | 0.79 |
| tight | v2 | 100% | 0% | 0% | 0% | 1.00 | 1.00 | 1.00 |
| tight | v3 | 100% | 0% | 0% | 0% | 1.00 | 1.00 | 1.00 |

- No pod was parked and none hit a no-go arc. AUTODROP never needed its blind fallback on a healthy orbit (the two-orbit
  limit is checked in `ending/last-landing` with the instruments failing).
- **The blind drop matches 01:** 0.78 on GENTLE (01: about 0.75) and 0.56 on HARSH (01: about 0.5). About half land in the
  bracket, as 01's worked example says.
- **v1 equals v2/v3 with room everywhere,** and loses only when the split matters (TIGHT 0.79: one pod per window in pass
  order mislands). With 1–3 pods it never reaches LZ-B, which comes late in the pass order from where the ship stands at the
  start.
- **For slice 8:** v1's edge over blind is 0.22 open and 0.14 tight. On a healthy orbit, v2 and v3 do not differ here.

### Tests

- **Suites (quick, warm `flyOnce`, alone on 4 workers):**
  - `ending/last-landing` 14.8 s: about 76 checks; `wp11/merge-test` was 4.9 s;
  - `ending/finale-flow` 9.1 s;
  - `landing/hollow-landing` 2.3 s;
  - `ending/last-landing-foundation` 0.8 s;
  - `ending/rules` 0.7 s;
  - `wp11/p2/views` 9.0 s (unchanged, green);
  - `ending/last-landing-sweep` is BALANCE_ONLY: 6 min 12 s at 8 seeds.
- **`wp11/full-run`** (BALANCE_ONLY, `--full`): green, 310 s, with the gate up.
- **The unit tier** (`npm test`) is green: 213 passed, 0 failed, 11 balance-only skipped, in **180 s** on 4 workers. The
  1-minute load average went from 0.6 to 7.7 during the run (sampled every 15 s; nothing else running).
  `npm run typecheck` is clean. The e2e was not run.

### Patches requested (lead)

- **`tests/unit/support/finale.ts`:** its banner says `chooseEnding` skips THE LAST LANDING from 7b on, but the code does not
  (a MERGE with eaten pods returns at `'last-landing'`). The suites rely on that, since they check the machine right after
  the choice. Please fix the banner. The alternative, skipping in `chooseEnding`, moves `ending/last-landing`,
  `landing/hollow-landing` and `ending/finale-flow` again.
- **`types/ending.ts`:** accept Deviation 2's fields (already in the file).
- **`tuning.ts` (7b lead block):** `LAST_LANDING_CADENCE_SEC`'s comment says "game seconds". Please make it "tactical s of
  world time" (Deviation 1). The value stays 2.0.
- **OPEN-DECISIONS 43:** mark it BUILT, with Deviation 1's cadence unit and the sweep's figures.
- **Optional cleanups**, after which v1 and blind could launch through `decide` and v2 would stop writing the kid's machine:
  - `AutodropOverride` gains the pass's own `pass` / `armedAtTSec` / `sent`;
  - `autodropLaunched` accepts an off-site aim from a non-AUTODROP source.
- **The instant landing** (`support/landing-instant.ts`, on in `wp11/full-run`, `wp12/playthrough` and `wp11/p2/views`)
  `forceLandAll`s THE LAST LANDING's radio pods on its first tick: soft, in an LZ with room. Those harnesses therefore do not
  play R27's rules after a MERGE. `wp11/full-run` passes at full depth (310 s). `wp12/playthrough` was not run.
- **§6.4's 7b e2e additions** are the lead's.

## Deviations (Track VIEW 7b)

Recorded by Track VIEW (branch `view-7b`, from 4cc8feb, the 7b foundation). R29, the header and the hint are built against the
foundation's contract, painted from hand-built `lastLanding` states (DROP's machine is not on this branch). **No save bump**,
no tuning number (the `7b VIEW` block stays empty). The unit tier is green: 214 passed, 0 failed, 11 balance-only skipped,
**235 s** on 4 workers. `npm run typecheck` and the tests' tsc are clean. The e2e was not run.

### What is built

- **`systems/last-landing-hud.ts`** (pure, read every paint):
  - `lastLandingHeader(state)`: null unless `landing.lastLanding` is set (deviation 9: never the phase). Its `left` counts
    the restored pods not yet `'down'` (a falling pod is still left);
  - `podBayRestoredRow(state)`: `RESTORED n` over every `lastLanding.pods`, the radio note, a pip per pod in pod order;
  - `restoredReportRow(tally)`: counts **pods**, from each `PodSummary.restored` (MERGE's confirm sets it), so it holds after
    the machine has cleared; its icons are each restored pod's own outcome;
  - `restoredCreditTag(pod)`: ` (restored)` or `''`.
  - Fail loudly: a restored pod that has left the orbit (`not-launched`, …) mid-machine, or a restored pod with no final fate
    or no place in the report, throws.
- **`components/run/LastLanding.ts`** (`#lastLanding`): the header strip. `THE LAST LANDING`, `3 OF 4 PODS TO LAND` (`ALL 4
  DOWN` at the end), who flies them (R27), and `[ENTER] SKIP TO THE END` as a button with its keycap. The button calls DROP's
  `skipLastLanding` (a phone's only way to skip), disabled once all are down. It sets `body.ll-on` while it shows, and lands
  with a short stamp animation (none under reduced motion).
- **POD BAY** (`PodBayWindow.ts`'s marked edit): the `.pb-restored` row is built on its first paint under the next pod's line
  (index.html is untouched): `RESTORED 4`, a pip per pod (◉ riding the orbit, ▾ falling, ▮ down), `DRIVERS BY RADIO · 80%`.
- **NAV PLOT** (`plot-landing.ts`'s marked edit): `Beacon.restored` toggles `.restored` in place, so a beacon turns steady
  amber where it rides, with a soft ring and glow; parked beacons keep their grey blink.
- **LANDING REPORT** (through the lead's hooks only): the RESTORED BY MERGE row with its icons and `4 RESTORED · 3 LANDED · 1
  OFF-SITE`, and ` (restored)` on the restored pods' credits.
- **Audio** (`audio-cues.ts`'s 7b block): `'last-landing-start'` plays `transmitIn` with a light `stampHit` under it, as the
  strip lands. `'last-landing-end'` still plays nothing (foundation deviation 7 stands).
- **Tests:** `ending/last-landing-models` (19 checks, about 1 s): the header and the row on hand-built machines (all four
  fliers, falling, parked at the end, all down, a pod gone from the orbit throws), the report row and the credit tag on
  hand-built tallies, and both through `landingReportModel`'s hooks on a landed ARES-VII. `support/words.test`'s 7b VIEW
  block renders every line at its worst case (≤ 70) and pins 01 §3.17's words. `ending/last-landing-foundation`'s VIEW
  stub check now says "no machine, no restored pod: nothing paints".
- **Visual check** (Playwright, 1440×900 and 390×844, seed 7's LAST LIGHT, four drivers eaten, MERGE + SUNSET, the machine
  staged by hand through `__ap.store`): shots and crops in `tests/.out/view-7b/` (the script is `stage.mjs` there, ignored).

### Deviations

1. **The models say more than the contract's shapes** (supersets; no caller breaks):
   - `lastLandingHeader` adds `count`, `status` (the `3 OF 4 PODS TO LAND` line) and `flier` to `{ title; left; hint }`;
   - `podBayRestoredRow` adds `note` and `pips` to `{ count; text }`.
2. **Words beyond §2.9** (all in `LAST_LANDING_TEXT`, checked in the words block):
   - `left(left, count)` and `flier[v1 | v2 | v3 | blind]` for the strip's middle;
   - `bayNote(integrity)` (`DRIVERS BY RADIO · 80%`), under the POD BAY row;
   - `reportRow` gains an optional `MISLANDED` part. A blind pod takes its window whatever the counts, so it can come down in
     a full LZ. `LANDED` keeps the headline's sense: in an LZ with room.
3. **The report row's icons are in the text's order** (soft, hard, mislanded, off-site, no-go, then a pod still parked), not
   in pod order, so the icons read the same as the counts beside them. On screen the row's label sits on a line of its own
   over the icons and counts (it is longer than an LZ's label). On a phone the counts take a third line.
4. **The header strip's place.** On a desktop it floats centred under the objective line, over the windows' title bars (the
   pause card's place; it steps down under the pause card). On a phone (≤ 768 px) it sits at the foot, over the view tabs,
   which are hidden while it shows (R26 shuts them; dimmed, a half-row peeked out over the strip).
5. **What THE LAST LANDING shuts reads as shut** (`body.ll-on`, CSS only): the dock and the mode toggle are dimmed, and the
   POD BAY's LAUNCH, [G] and END LANDING (`#podLaunchBtn`, `#pbGoBtn`, `#pbEnd`, the phone's flight bar included) are dimmed
   and take no pointer. The bay's count row is dimmed (no bay is spent, R26). The input layer stops their keys, not their
   buttons, and `requestLaunch` from `'player'` is not refused during the machine (foundation deviations 2–3), so the CSS is
   the only thing between a click and a kid's launch of a restored pod. See the patch request below.
6. **The header's skip button calls `skipLastLanding` directly.** It is DROP's function and throws `not built` on this branch.
   The button is unreachable here (no machine starts without DROP), and the merge order (DROP, then VIEW) makes it live.
7. **NAV PLOT: only the beacons change.** A restored pod's ◘ landing mark looks like any other pod's. The marks' model
   (`landing-hud.ts`, the lead's) has no `restored` flag, and the report says which pods were restored.

### Patches requested

- **DROP or the lead: refuse a `'player'` launch while `landing.lastLanding` is set** (`landing.ts requestLaunch` or
  `landing-controls.ts playerLaunch`), throwing or refusing as the lead prefers. Today the CSS of deviation 5 is the only
  guard on the buttons, and a debug `__ap.launch()` launches a restored pod as the kid (the visual check used it to stage a
  falling pod). With the guard, the check stages by `forceLandAll` or DROP's machine instead.
- **The lead (e2e, §6.4):** the header strip (`#lastLanding`, hidden through 7a's interim), `.pb-restored`,
  `.np-beacon.restored` and `.lr-row.kind-restored` are the selectors to check once DROP's machine flies.

## Deviations (7b review fixes)

Recorded by the 7b review-and-fix agent (on `claude/modest-hawking-209t0f`, from 9a7b3eb). The findings are in
`slice-7b-review.md`; the gameplay calls are OPEN-DECISIONS 60–65 ("Slice 7b, built"). **No save bump**:
`LastLandingState.pass` is new, and the machine still never reaches a save. Commits: 7954f3b (B1, B2, B3, M1, M2), a73021d
(M3), 9299e96 (M4 and the new e2e), 6970f3e (MERGE with no driver eaten: a check), and the docs commit.

### How each finding was fixed

- **B1 (tsc-tests red).** `ending/last-landing-models`' hand-built machine has DROP's fields. The foundation suite's gains
  `pass: null`.
- **B2 (Bay Ctrl missing parked every restored pod).** `landing-rules.ts landingStuck` gives no `'bay-offline'` while
  `landing.lastLanding` is set (R26: no bay). OPEN-DECISIONS 62.
- **B3 (a ship lost mid-landing).**
  - `last-landing.ts lostTick`, on the post tick (it runs while the clock is paused under the LOST card), calls `finish` once
    the landing ended `'ship-lost'`: the machine is cleared, the phase is `'done'`, and the layer goes down.
  - `last-landing-hud.ts restoredPodStates` returns null on a `'ship-lost'` landing, so the strip and the POD BAY row hide
    instead of throwing on the NOT LAUNCHED pods. Any other pod that leaves the orbit still throws.
  - OPEN-DECISIONS 63.
- **M1 (no drop solution parked the pods).**
  - `drop-cache.ts recompute` solves with `plotted = caps.drop.solution || landing.lastLanding !== null`. The dot is
    `uncertain` when the plotter is down.
  - `startLastLanding` names the flier blind when `capabilities.drop.solution` is false, as well as on the old rules.
  - The AI tick turns a v1/v2/v3 flier blind when the plotter is lost: `flier`, `autodropUntilTSec`, `target` and `pass` are
    reset.
  - `autodropFlies` also needs the solution.
  - The ship out of the band keeps DROP's stuck rule (OPEN-DECISIONS 61). OPEN-DECISIONS 60.
- **M2 (the POD BAY's [−]/[+] reached MERGE's pass; v2 wrote the kid's machine).** DROP's optional cleanup was taken:
  - `autodrop.ts AutodropOverride` gains `pass?: AutodropPassFields` and `view?: (state, view) => LandingView`.
    `inPassOf`, `passWant`, `passVolley`, `decidePass` and `armedNext` take the pass fields (the kid's machine by default).
    The wrapper's `decide`, `nextLaunchAtTSec` and `waitsFor` all read the mapped view.
  - `types/ending.ts LastLandingState.pass: LastLandingPass | null` (`pass`, `sent`, `armedAtTSec`) is v2's own pass.
    `passTick` writes it, and `finish` no longer touches `landing.autodrop`. DROP's Deviation 4 is gone.
  - `lastLandingController` passes `pass` and `view: lastLandingView`. Its wrapper only adds the always-SKIP between windows.
  - `pressAutodrop` is refused `'MERGE FLYING'` (a new `AutodropRefusalWord`, worded as the launch's). `setPassCount` does
    nothing while MERGE flies. `landing.css` dims `.pb-pass-step` with the other shut buttons.
  - `autodropLaunched`'s off-site change was not needed (v1 and blind still launch from the machine's tick).
  - OPEN-DECISIONS 64.
- **M3 (the harness gap).** `support/landing-instant.ts tick` returns while `landing.lastLanding` is set, so the machine
  flies itself. OPEN-DECISIONS 65.
- **M4 (`ending.mjs` part 2 played 7a's interim).** Part 2 checks 7b's `NOW:` line, THE LAST LANDING with the engine shut,
  and [ENTER] to its end. `last-landing.mjs` is new.
- **Minors:** m1 ([ENTER] freezes the page for about 2 s on 3 blind pods) is OPEN for the lead. m2 (`not-built.ts` kept
  for 7c), m4 (`setLoadNext` on a radio pod, debug only) and m5 (the start event's flier) are NOTED. m3 is OPEN-DECISIONS 61.
- **`ending/last-landing`** gains these checks:
  - the v2 pass on the machine's own fields, with the kid's [−]/[+] and [G] refused;
  - Nav Plotter dead: blind, on the grey geometry, every pod down;
  - Nav Plotter killed mid-landing: blind from there;
  - Bay Ctrl missing: nothing ends early;
  - MERGE with no driver eaten: no LAST LANDING;
  - the ship lost mid-landing.
  The old "no drop solution parks the pods" check is replaced. `last-landing-arm.ts armLastLanding` accepts `eaten: 0`.

### Tests

- `npm run typecheck` and the tests' tsc are clean.
- **The quick tier, once after the fixes:** 214 passed, 0 failed, 12 balance-only skipped, **190 s** on 4 workers (budget
  265 s). The 1-minute load average was 5.65 at the start (typecheck had just run, and 7c's agent may have been busy) and
  7.66 at its peak (sampled every 15 s). At 9a7b3eb it was red (B1): 181 s, with the load going from 0.06 to 7.52.
  - `ending/last-landing` 21.3 s (19 s at 9a7b3eb), `ending/finale-flow` 10.1 s, `wp11/p2/views` 8.5 s.
- **`wp11/full-run` (BALANCE_ONLY, `--full`):** green, 319 s, with the instant landing standing aside.
- **`wp12/playthrough` (`--full`, `PT_SEEDS=8`):** the same table before and after M3's change. Its 6 LITERAL and 6 SLOPPY
  `stuck:printing on LAST LIGHT` runs (PURGE runs) are identical at 9a7b3eb and at 53ca68a, so they come from before 7b. They
  are for the lead.
- **e2e (Chromium, each scenario alone):** `last-landing` 19/19 (83 s), `ending` 29/29 (276 s). There were no page errors.
