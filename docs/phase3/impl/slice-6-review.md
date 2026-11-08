# Slice 6 review: SURVEY (Track SWATH, its drop-dot follow-up, Track SITES)

Independent review of `git diff 0b93e6e..HEAD` (HEAD a0fd347, branch `claude/modest-hawking-209t0f`). I looked at the
foundation (546e56b..0b93e6e) only where the new code depends on it. I edited no source file and committed nothing.

**How I checked.** I read the diff against 03 §3.9, 01 §3.13, DECISIONS, OPEN-DECISIONS 33–38 and 52, and the plan's Lead
decisions, R1–R25, every Deviations section and the contracts. I reproduced with throwaway suites that use the unit
harness (`createHarness7`, seed 7, CORMORANT as `survey/flow.test.ts` reaches it). The scripts are in the session
scratchpad: `repro-falling.test.ts`, `repro-save.test.ts`, `repro-threads.test.ts`, `repro-autoburn.test.ts` and
`phone.mjs`. I also ran a Playwright check at 360×740 (mobile) and at 1440×900. `npm run typecheck` is clean.

**Verdict.** The machine is solid:
- SHIP DONE, RESUME and BEAM round-trip in every survey state I tried;
- the thread reconciles cleanly;
- the drop-dot swath degrades safely;
- the UI fits a 360 px phone.

There is one scoring hole in the move rule (B1). There is one place where R8's stated premise is false: a held thread
stacks with AUTOBURN's and AUTODROP's (M1). The sweep's "no fight for threads" and "v3 ≈ v2" come from a kid who runs no
ops and flies no AUTOBURN, so they understate what the thread costs (see "For the designer").

---

## Findings

### B1. A move can drop an LZ under a pod that is already falling, which re-scores that pod

**Fix pass: FIXED.** `assignRefusal` runs every falling pod through `pendingTouchdowns` (classifyLanding's rule) against the LZs now and the moved ones, and refuses the new `'falling-under'` (`A POD IS FALLING — WAIT FOR IT`) on any change of place or LZ. Pinned by a `survey/model` case and by this repro as a `survey/flow` case. The optional down-pod refusal is left: a down pod's score is fixed, so it is cosmetic.

`src/systems/survey-model.ts:123-130` (`podFallingTo`), used at `:156`.

**Problem.** `'falling'` refuses a move only when a falling pod is aimed at the LZ being moved (`aimLz`), or will come down
in it *where it stands now* (`pendingTouchdowns`). It never asks where a falling pod will come down once the LZ stands on
the new site.

A pod's fate is decided at touchdown from its fixed `launch.landingRad` against the LZs as they are then
(`landing-rules.ts:756`, `classifyLanding`). So a pod that is falling off-site becomes an in-LZ pod when the kid moves a
free LZ under it.

This breaks the invariant the plan relies on in R4 ("no pod in flight is re-judged"). It is also the very reason OPEN-
DECISIONS 52 gives for rejecting "let an LZ move with pods already down".

**Repro** (`repro-falling.test.ts`, seed 7, CORMORANT, SURVEY v2, landing):
1. Wait until the dot is over SITE 1 (63°, FLAT, ROOM 5), with no window open.
2. Press [L], and confirm the off-site guard. The pod is falling `off-site · 0 points`.
3. Call `assignRefusal(LZ-A, site-1)`. It returns `null`, and `assignSite` succeeds.
4. `pendingTouchdowns` now says `lz LZ-A · 200 points`.
5. The pod lands `place lz, LZ-A, 200, soft`, and the LZ-A row reads `landed 200`.

**Effect.** A kid can launch at any moment the dot crosses a found FLAT site, then move an LZ under the pod while it
falls. Every found site becomes a window. It works at v1 too.

**Fix.** In `assignRefusal`, after the existing checks, simulate the move:
1. Take `landing.lzs` with the moved LZ's geometry and site.
2. Run every falling pod through `classifyLanding` against both the old and the new LZs.
3. If any placement changes (its place or its LZ), refuse the move. Reuse `'falling'` (`A POD IS FALLING TO LZ-B`) or add
   `'falling-under'` with the lead's words.

Optionally, also refuse when a pod that is already **down** lies inside the destination span. Its score is fixed, so this
is cosmetic, but it keeps a bracket from ever containing pods that were scored off-site.

**Test.** Add a `survey/model.test` case: a falling pod whose `landingRad` lies inside a found candidate. The move refuses.

### M1. SURVEY's thread stacks with AUTOBURN's and AUTODROP's: the capture flies at 50% thrust, not 75%

**Fix pass: FIXED (the lead's decision: SURVEY steps aside).** A preempting claim takes SURVEY's yieldable thread whenever one is held (`ops-core.ts reserveThread`), and `survey.ts syncThread` claims no spare thread while AUTOBURN or AUTODROP holds one. R8's text is corrected. Flow cases: the cap stays 0.75 under each claim, and a real AUTOBURN v1 capture flies at 0.75 with SURVEY v1 aboard. Measured FUEL at the lock: 31.3% with no SURVEY; 30.3% with v1 before the fix (cap 0.5, burn half as long again); 30.7% after.

`src/systems/survey.ts:48-65` (`syncThread`); `ops-core.ts:168-180`; plan R8 (`slice-6-plan.md:147`).

**Problem.** R8 says "the thrust cost (C4) is the same whoever holds the thread, so the capture still pays it". That is
true only when no thread is free. SURVEY keeps one thread free (`SURVEY_KEEP_FREE_THREADS 1`), so on a healthy 2-thread
Core, AUTOBURN's claim at START BURN takes the **free** thread (`canStartOp()` is true, so nothing is preempted). Both then
hold: busy 2, and the reactor cap is 1 − 2 × 0.25 = **0.5**.

**Repro** (`repro-threads.test.ts`, case a): SURVEY v1 claimed, then `reserveThread('autoburn', { preempt: true })` (the
claim AUTOBURN makes). The result is `threads 2 busy 2 surveyHolds true reactorCap survey-only 0.75 with autoburn 0.5`.
AUTODROP's claim during a window does the same in the landing, where GO LOWER and trims then fly at half thrust.

**Effect.** Before slice 6, AUTOBURN's capture flew at 75%. With SURVEY v1/v2 aboard, which starts by itself (R7), it flies
at 50%. On a degraded reactor that is 0.43, and on a failing one 0.30. This is the burn that decides CAPTURED or ESCAPED,
and the kid never chose it.

I could not measure the outcome of an AUTOBURN capture. My harness's engage refused (`repro-autoburn.test.ts`), and the
sweep's units carry no AUTOBURN. **Unverified** beyond the cap itself.

**Fix (the lead or Fran).** Either option works:
- SURVEY also yields when a preempting claim finds a free thread: in `syncThread`, release while `holdsThread('autoburn')`
  or `holdsThread('autodrop')`, so a skill's claim never adds a second cut. This is the plan's intent: SURVEY steps aside
  for the skills.
- Keep it, and correct R8's text and the strip. Then the sweep should fly AUTOBURN.

Pin it either way with a flow case: SURVEY v1 claimed, AUTOBURN claims with a thread free, then check `reactorCap`.

### m1. With SURVEY aboard but OFF, the SITES window says there is no SURVEY

**Fix pass: FIXED.** `SURVEY OFFLINE — REPAIR IT` (status and the new `'offline'` refusal), `GROUND ?` on the guesses, and `REPAIR SURVEY.skl …` as the empty line.

`src/systems/survey-hud.ts:301,309,345`, `:83` (`groundShown`); `src/data/sites-text.ts:31,40`.

**Problem.** When SURVEY.skl is aboard but OFF by damage, `surveyVersion` is 0, and the window then:
- says `NO SURVEY · ARRIVAL CONTROL'S GUESSES`;
- says `TRAIN SURVEY AT A DESK TO FIND BETTER SITES`;
- turns every unrated guess back to `UNSURVEYED`.

The kid needs a REPAIR, not a desk. The pills also read `NO SURVEY · SITES STAY AS GUESSED`.

**Fix.** Branch on `fileLevel(state.memory, 'survey') !== null`. Show `SURVEY OFF · REPAIR SURVEY.skl` (a new SITES word),
and keep `GROUND ?` for the guesses.

### m2. PAUSE at v3 claims to free a thread v3 never held

**Fix pass: FIXED.** At v3 the pause reads `SURVEY v3 · PAUSED`, and its title names no thread.

`src/systems/survey-hud.ts:315`; `src/data/sites-text.ts:28`.

**Problem.** PAUSE is offered at v3. Pausing there reads `SURVEY v3 · PAUSED · ITS THREAD IS FREE`, but v3 holds no
thread, so the pause costs mapping and buys nothing.

**Fix.** Hide `[ PAUSE ]` at `version >= SURVEY_SWEEP_VERSION`, or word the v3 pause `PAUSED` alone.

### m3. "n SITES" counts the wreck

**Fix pass: FIXED.** `candidatesFound` counts candidates only: CORMORANT says `4 SITES`. The record's `found` is unchanged (no shape change).

`src/systems/survey.ts:169,303`; `src/systems/survey-hud.ts:305`; `src/data/swath-text.ts:25,37`; `sites-text.ts:29`.

**Problem.** CORMORANT says `PLANET MAPPED · 5 SITES` and `DONE · 5 SITES`. It has 4 places to land and one wreck that can
never be assigned.

**Fix.** Count candidates only. Alternatively, say `4 SITES · 1 WRECK`, which needs a new parameter in both words blocks.

### m4. `1 PODS`

**Fix pass: FIXED.** `1 POD`.

`src/data/sites-text.ts:48` (`row.lz`).

**Problem.** Seed 7's SHEARWATER has a 1-pod LZ-B (the foundation's roll), so its row reads `LZ-B · GUESS · 1 PODS ·
STANDARD · …`.

**Fix.** Use a plural helper, or the house form (`1 POD`).

### m5. The card says `POOR · LZ-B MOVED` when LZ-B went back to its guess

**Fix pass: FIXED** with no `SurveyRecord` change: `state/survey-selectors.ts surveyNetOutcome(record)` gives each LZ's final site against its guess and its ground before and after, and the card's MOVED reads it.

`src/systems/survey-hud.ts:199-200`.

**Problem.** The card's `moved` reads `record.moves`. A kid who moves LZ-B to SITE 5 and back to `guess-B` gets
`POOR · LZ-B MOVED`.

**Fix.** Name only the LZs that ended off their own guess. That needs the record's final site per LZ (see Architecture A1).

### m6. Rating does not wait for SURVEY to be running

**Fix pass: FIXED.** v2 rates only while `surveyRunning` is `running` or `done`.

`src/systems/survey.ts:207`.

**Problem.** The post tick rates every found site whenever v ≥ 2 and the phase is live, whatever `surveyRunning` says:
paused, or waiting on a worn Core. R11 says "while SURVEY works at v2". It is defensible, since rating needs no new cells.
But PAUSE then doesn't stop v2 revealing, and v2 on a 1-thread Core never maps but still rates what v1 found.

**Fix.** Gate it on `surveyRunning ∈ {running, done}`, or write the latitude into R11.

### m7. CONTROL's reveal quip blames CONTROL for the kid's own pick

**Fix pass: FIXED.** CONTROL's quip only on a guess. A candidate gets the TERMINAL line (survey) or the echo's tail (touchdown).

`src/systems/survey.ts:164,190`.

**Problem.** CONTROL's reveal quip (`LZ-B is in a lake :)`) also plays when the bad site is one the kid chose: a v1 move
onto a WET candidate, revealed later by touchdown or by v2. The joke is CONTROL's bad guess.

**Fix.** Say it only when the site is a guess (`site.kind === 'guess'`). For a candidate, a plain TERMINAL line is enough.

### m8. The report row names nothing when an LZ moved onto another LZ's guess

**Fix pass: FIXED.** ` · LZ-A GUESS` for another LZ's guess.

`src/systems/survey-hud.ts:226`.

**Problem.** `surveyLzRowSuffix` appends nothing when the LZ stands on a guess. An LZ that moved onto *another* LZ's guess
(possible once that LZ moved off) therefore reads as if it never moved.

**Fix.** Rare. Append `· LZ-A GUESS` when `site.number` isn't the LZ's own.

### m9. SitesWindow keeps module state the plan doesn't list

**Fix pass: FIXED.** Listed in §2.3 and in the plan's Deviations (review fixes).

`src/components/tools-view/SitesWindow.ts:25-26`.

**Problem.** `selected` and `repaint` are module variables, and §2.3's list doesn't name them. They are reset correctly: on
a world change through `offWorld`, on a move, and at unmount.

**Fix.** List them in §2.3 for the record.

### m10. TRAINING's SURVEY demos hard-code their words

**Fix pass: LEFT,** as the lead decided: it matches the older demos' habit.

`src/components/desk/TrainingWindow.ts:102-112`.

**Problem.** The demos hard-code `LZ-B`, `WET ✕`, `★★★`, `SITE 4` and `THREADS`. That bends §2.13's "every word SITES paints
is in sites-text.ts". It does follow the existing demos' habit (`PLAN ✓`, `A×2 · B×1` in the same function).

**Fix.** A nit. Move them to `SITES_TEXT.demo` if the lead wants the rule strict.

### m11. The drop-dot swath reads a cached dot

**Fix pass: no action,** as the review says. The dead Nav Plotter path is now a flow case.

`src/systems/survey.ts:98-102`. Unverified, and no action is needed.

**Problem.** The dot comes from the PREDICT_HZ cache, so the dot's lead can be up to 100 ms of wall time stale. In a long
SKIP step the shifted arc then lands slightly behind the true dot.

**Why no action.** The ±20° swath dwarfs the error. The ship's own swath covers what lies behind the new dot before its
next window. A dead Nav Plotter gives `dot: null`, so there is no dot swath. That case runs without a throw at v2 in the
landing (`repro-threads.test.ts` case b).

### Checked and fine (the brief's list)

- **assignSite during a GO LOWER.** A held aim refuses `window-open` (review m5). An offered aim is rebuilt from the new
  solution next tick (`sitesRev` makes the cache stale).
- **assignSite under AUTODROP v3's plan or MOTH's RUN THE DROPS.** Both read `landing.lzs`, and `planKey` carries
  `sitesRev`. A move is refused while that LZ's window is open, and v2's pass counts per label.
- **assignSite with pods falling.** Fine for the moved LZ's old place. The new place is B1.
- **The yieldable thread:**
  - preempted by AUTOBURN or AUTODROP only when no thread is free (but see M1);
  - never by the kid's ops or SENTRY's pre-empt (`sentry.ts:212`, a plain reservation), as R8 says;
  - a corrupted resident's lock and HOLLOW's verbs need `canStartOp()`, and SURVEY always leaves one thread free;
  - a worn Core: SURVEY lets go and waits (flow m4).
- **The drop cache and AUTOBURN v3's aim.** Both are keyed on `sitesRev`.
- **SHIP DONE, RESUME and BEAM on CORMORANT** (`repro-save.test.ts`):
  - cases: v1 claimed mid-approach, v2 paused, v1 after a move, v1 claimed mid-landing, and END LANDING then report;
  - each one: `toDesk` writes `ship-done`; a page reload and `resumeRun` land on the desk with `save ok`; the next
    `beamTo` writes `beam`; no thread is held after;
  - the record is right in each, including `movedOff`.
- **Damage from v3 to v2 or v1 mid-map.** v2 claims a thread (flow). v1 drops the dot swath and rating, and keeps what was
  rated.
- **The reveal at the first touchdown without SURVEY.** Covered by flow. It only sets `groundKnown`; scoring reads the true
  ground and the R4 geometry, and nothing reads `groundKnown` for score.
- **The SITES window and the phone tab on leaving the planet.** `closeToolWindow('sites')` runs when the model goes null
  (the desk, or the next GOOD ship). Selection is cleared on `run.rev`, which every ship bumps (`run.ts:201`).
- **The classic-five load trap.** `support/import-guard` passes. `landing-text → swath-text` is data and types only.
  `data/survey-rules.ts` reaches systems, but only through `script.ts`, which is outside the guarded roots, as
  `resident-rules` is.
- **Phone at 360 px** (Playwright, CORMORANT, SURVEY v2, 61% mapped, a site picked). The window is 348 × 284 at x=6. No
  node is wider than the viewport or overflows, `document` is 360 wide, both pills sit on one line, and there are no page
  errors. At 1440 px the window docks under COMMS and the plot labels don't collide. Screenshots are in the scratchpad
  (`shots/sites-360.png`, `shots/sites-1440.png`).
- **Lines over 70 characters.** `support/words` covers every new template through `SWATH_WORST` and `SITES_WORST`, and it
  passes. I found no SITES string outside `sites-text.ts` except m10.

---

## For the designer

The sweep (42 POOR ships, seeds 1–10), with the drop-dot swath:

| | vs GOOD (points) | cycles per ship | over no SURVEY | price (cycles) |
|---|---|---|---|---|
| no SURVEY | −22.6 | 4.14 | — | — |
| v1 FIND | −18.6 | 4.38 | +0.24 | 2 |
| v2 RATE | −0.7 | 5.55 | +1.41 | +3 (5 in all) |
| v3 SWEEP | +0.0 | 5.57 | +1.43 | +4 (9 in all) |

1. **v1 is not worth its price as built.** It returns about 0.24 cycles per POOR ship for 2 cycles, so it pays back after
   about 8 POOR ships. It can't see ground, and since OPEN-DECISIONS 52 it doesn't get the drop-dot swath either. All it
   adds is ROOM, WIDTH and a blind move.

   The sweep's v1 kid only moves NARROW guesses. A kid who moves every LZ off its guess onto a found WIDE or STANDARD
   candidate would do better: guaranteed candidates are always FLAT, and extras are FLAT half the time, so on a 2-LZ
   planet such a candidate is bad about 1 time in 4, against 1 in 2 per guess. That is a rough estimate (**unverified**).
   But nothing in the UI teaches it.

   **So the jump from v1 to v2 is not too steep; v1 is too flat.** v1 is mostly a 2-cycle toll to reach v2. Options:
   - price v1 at 1 cycle;
   - give v1 a weak tell, for example "a guess the swath passes shows `GROUND ?` vs `FLAT?`";
   - make the strip suggest v1's statistical move.
2. **v1 + v2 pays back after about 3.5 POOR ships.** It costs 5 cycles and returns +1.41 cycles per POOR ship. By the roll's
   odds (1/3 in layer 5, 1/2 in layers 6–7, one ship per layer 5–7), a route meets about 1.3 POOR ships, and SURVEY can
   only open at visit 4. On seed 7's worked route the only one is CORMORANT. (**Estimate, not measured per route.**)

   So in cycles, SURVEY is a net loss on most runs. Its case has to rest on points, and on the story beat ("LZ-B is in a
   lake :)"). R25 keeps prices fixed, so this is for slice 8. Either make it cheaper (03 §3.2 already says "SURVEY
   cheaper"), or raise POOR odds where SURVEY can open.
3. **v3 over v2 is +0.02 cycles and +0.7 points in the sweep.** v3's real value is the thread, and the sweep can't see it:
   - it frees the kid's second op on a 2-thread Core;
   - it avoids M1's stacked thrust cut under AUTOBURN and AUTODROP;
   - it still maps on a worn Core, where v1/v2 wait all ship.

   The sweep's kid runs no ops, has no AUTOBURN, and its seeds are freed. Whether 4 cycles for "no thread" is worth it
   depends on M1 and on how often the kid needs both threads. Measure it with a kid who SCANs and DELETEs seeds on a POOR
   ship that HOLLOW boards (CORMORANT, seed 7).
4. **Is "no fight for threads" structural? Only for HOLLOW's verbs.** Verbs are the FINALE's, and the final ship is GOOD by
   construction: `END_SLOTS = [19]`, layer 8, POOR odds 0 (`landing-roller.ts:121`, `arm.ts:44`). An assertion would keep
   that true if an end slot ever moves into layers 5–7. Everything else is behavioural:
   - **The kid's ops.** SURVEY halves the kid's ops on a 2-thread Core (by design, "one op fewer"), on exactly the ships
     where HOLLOW may board. The refusal names no culprit; only the Skills row and SITES say `HOLDS A THREAD`.
   - **AUTOBURN and AUTODROP.** M1.
   - **A corrupted resident's lock.** It waits while SURVEY and one kid op fill the Core, so SURVEY can *shield* the kid
     from a lock. That is a small exploit in the kid's favour.

   The sweep's zeros come from its kid, not from the rules.
5. **Misleading text:**
   - the strip and SITES say `5 SITES` with the wreck counted (m3);
   - an OFF SURVEY reads as "no SURVEY" (m1);
   - PAUSE at v3 promises a thread back (m2).

   The strip's `survey-swap` row is clear and only shows when it can act.

---

## Architecture (for slice 7)

### A1. `SurveyRecord.movedOff` is not yet the epilogue's sentence

**Fix pass:** answered by `surveyNetOutcome(record)` (see m5), with no shape change.

`state/survey-selectors.ts:73-77`.

**Problem.** `movedOff` lists every move off a bad site, including:
- a move that later went back onto the bad site;
- a move from ROCKY onto a WET candidate.

`known: null` means the kid moved off by luck (v1). So "you moved LZ-B off the lake" needs three checks:
- `badKept` has no entry for that LZ;
- the ground was WET (ROCKY needs its own words);
- probably `known !== null`.

**Fix.** Make the record carry the net outcome per LZ: `{ lz, startedOn: BadGround | 'flat', endedOn: LzGround,
endedSite, known }`. Then the epilogue, the card (m5) and the report all read one answer instead of re-deriving it from
`moves`.

### A2. MERGE's restored pods and moved LZs

Restored pods fly on the final ship, which is always GOOD (see designer item 4), so they never meet a moved LZ in play.
The resolver reads `landing.lzs` as they stand, so it would be right anyway.

**Risk.** If slice 7 ever restores pods onto an *earlier* (POOR) ship's colony, the LZ geometry it needs is the ship's
final one. That isn't in `ShipResult`: only the moves are, and the sites aren't saved after the ship. Record the final LZ
centres in the result if that ever becomes possible.

### A3. Trace gifts

None of slice 7's gifts reads survey state (OPEN-DECISIONS 44–46). Gifts avoid TIGHT, authored, `?`, first and final ships,
so a gift may sit on a POOR ship. Nothing here conflicts.

### A4. Duplicated rules

**Fix pass: FIXED** for the two rules: `siteVisible` and `lzOnSite` in `state/survey-selectors.ts`, read by survey-hud, survey-model and survey.ts. The report suffix's own hard count is left.

Three copies of "a site the kid can see" (`site.kind === 'guess' || site.found`):
- `survey-hud.ts:70` (`freeSites`);
- `survey-model.ts:149` (`'not-found'`);
- `survey-model.ts:181` (`bestSwap`).

Three copies of "the LZ standing on a site":
- `survey.ts:118` (`lzOn`);
- `survey-hud.ts:68` and `:275`;
- `survey-model.ts:153`.

Two copies of the hard-pods count: `survey-hud.ts:228` versus `landingResult`'s `LzResult.hard`.

**Fix.** Put `siteVisible(site)` and `lzOnSite(landing, siteId)` in `state/survey-selectors.ts`, and have the report suffix
read the tally's `hard` (it already folds pending pods). The SITES header's own status words, which duplicate
`surveyStatus`'s, are a recorded deviation (SITES 1) and fine.

### A5. Module state

`survey.ts` has its one allowed module variable, `lastRunning`, reset through `onWorldReset`. `SitesWindow.ts` adds two
(m9). `survey-hud.ts` and `survey-model.ts` have none.

---

## Tests

**Quiet tier time: 146 s** (`npm test`, nothing else running). Wall time was 2m26s, with 206 passed, 0 failed and
11 balance-only skipped on 4 workers. That is under the ~190 s mark, so no trims are needed.

The slowest suites:

| Suite | Time |
|---|---|
| `skills/autodrop-review` | 23 s |
| `skills/landing-v3` | 22 s |
| `skills/autoburn-modes` | 18 s |
| `survey/flow` | 14 s |
| `residents/sleeper` | 13 s |
| `skills/autoburn-v3` | 13 s |
| `wp12/fix1/entries` | 12 s |
| `tsc-tests` | 12 s |

The slice adds about 16 s of CPU (`survey/flow` 14 s; the model and UI suites under 1 s each).

**Gaps on the risky paths, in order of value:**
1. **B1:** a falling pod under the destination site (a `survey/model` case), and a flow case that launches off-site and
   tries the move.
2. **M1:** a flow case for SURVEY plus AUTOBURN's claim with a thread free, asserting the reactor cap the lead decides on.
3. **Behaviour after a move:** AUTODROP v3's plan and MOTH's RUN THE DROPS re-planned after `assignSite`. Today only the
   presence of `sitesRev` in `planKey` is pinned (`survey/foundation.test.ts:207`, a source read). One case should arm v3,
   move an LZ between windows, and check that the plan's rows name the new windows.
4. **Reveals beyond the guess:**
   - a touchdown reveal on a mislanded pod;
   - a reveal on a site the kid moved onto (v1 onto a WET candidate, then touchdown, and then v2 rating); the m7 words
     depend on it.
5. **The machine with no dot:** v2 in the landing with the Nav Plotter dead (no dot swath, no throw). It's in
   `ui-models` for the wedge, but not for the machine.
6. **SITES DOM on the next GOOD ship:** the window and the phone tab close. This belongs to the lead's e2e.

The full-depth sweep (`survey/survey-sweep.test.ts`, about 9 minutes) wasn't re-run. I took its numbers from the plan.
