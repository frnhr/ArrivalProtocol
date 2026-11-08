# Slice 6 FOUNDATION: contract review (SURVEY)

This reviews `git diff 546e56b..c53a7e3`, with the e2e fix `566eebc` left out, against `slice-6-plan.md` (R1–R25, §2,
"Deviations (foundation)"), 01 §3.13, 03 §3.9 and 02 §4. The checkout is `claude/modest-hawking-209t0f`. I made no source
edit and no commit.

**Follow-up.** Every finding below is marked **Settled (follow-up)** with how it was settled; the lead's decisions and the final contract are in `slice-6-plan.md`, "Deviations (foundation, review follow-up)".

**What I ran**
- `npm run typecheck`: clean.
- `node tests/unit/run.mjs survey/foundation`: green (with tsc-tests).
- A merge probe in two scratch worktrees from c53a7e3:
  - **SWATH:** raised both gates, edited `survey/foundation.test.ts:60/62` and `skills/foundation.test.ts:79`, added a
    value at the end of the 6 SWATH tuning block, added a check in the 6 SWATH words block, and added a worst-case key to
    `SLICE6_WORST`.
  - **SITES:** added a value at the end of the 6 SITES tuning block, added a check in its words block and a key in
    `SLICE6_WORST`, changed a cue in the survey block of `audio-cues.ts`, drew the three `demoSvg` cases, and edited the
    `ToolsTabs` entry, both `index.html` spots and `survey.css`.
  - **Merge:** one conflict, `SLICE6_WORST` (M5). Everything else merged cleanly. The quick tier on the result: 202 passed,
    1 failed, 10 skipped, 146 s. The one failure is `skills/sentry.test.ts:110–111`, as R23 predicts.
- Throwaway stress scripts for the site roll (m1) and for reach on seeds 1–30 (R23).

The probe worktrees and branches have been removed.

**Severity key.** B: a track cannot build a design point inside its own files. M: fix before the tracks branch, or it
costs a merge or a rework. m: minor.

---

## B: blocks a track

### B1. GROUND TRACK: SITES cannot paint unmapped ground on the overview line, or make a candidate clickable (SITES)

**Settled (follow-up):** Fixed (lead): `GroundTrack.ts` pools `planet.unmapped` as `gt-p-unmapped`, and both bracket nodes carry `data-site`. SITES needs no edit there.

**Where**
- `src/components/tools-view/GroundTrack.ts:146–176` (`paintPlanet`);
- `GroundTrack.ts:101–122` (`paintBrackets`);
- deviation 7 ("`look-candidate` needs CSS only").

**Problem**
§2.14 asks for two things on the GROUND TRACK: "unmapped ground drawn as `░` on the overview line", and "A click selects
in SITES". Deviation 7 gives SITES CSS-only rights in `GroundTrack.ts`. Two gaps follow:
- The model now carries `planet.unmapped: Span[]`, but `paintPlanet` never reads it. It pools `noGo` and `outOfBand` only,
  so nothing can paint it.
- The bracket nodes carry no site id. A candidate's node is keyed by `bracket.lz`, which is the site id, but it is never
  written to the DOM. Its label goes through `garble(…)` and is scrambled under noise, so SITES cannot even read the label
  back reliably for a delegated click.

The strip's `░` does appear without any edit, because `terrainAt` reads the new `'unmapped'` stretches.

**Fix** (the lead, before branching, in `GroundTrack.ts`)
- In `paintPlanet`, add `unmappedPlanet` to `spanPool`, and
  `pool(spanPool.unmappedPlanet, planet.unmapped.length, planetEl, 'gt-p-unmapped').forEach((node, i) => { … placeSpan(node, wrap(span)); })`,
  as for `noGoPlanet`.
- On both bracket nodes, set `nodes.box.dataset.site = bracket.site ?? ''` and `node.dataset.site = bracket.site ?? ''`.
- Then SITES delegates the click from `SitesWindow.ts`, as
  `document.querySelector('.ground-track')?.addEventListener('click', …closest('[data-site]:not([data-site=""])'))`, and
  styles `.gt-p-unmapped` / `.look-candidate` (with pointer events) in `survey.css`.

Alternatively, give SITES a marked `// Slice 6 SITES` block in `GroundTrack.ts`. Either way, amend deviation 7 and the
SITES test lines.

---

## M: fix before the tracks branch

### M1. Touchdown echo: the tail cannot be written from `landing-text.ts` alone (SWATH)

**Settled (follow-up):** Fixed (lead): `touchDown` works out `revealing` before the emit and passes it as `LANDING_ECHO.touchdown`'s sixth argument (default null); SWATH's marked line in `landing-text.ts` appends the tail.

**Where**
- `src/systems/landing.ts:236–238`;
- `src/data/landing-text.ts:92` (`LANDING_ECHO.touchdown(pod, place, lz, touch, bullseye)`);
- §2.9; SWATH's test lines ("the touchdown echo's tail in `landing-text.ts` (one line, by request)").

**Problem**
The echo text function gets no ground and no "this touchdown reveals" flag. A one-line edit in `landing-text.ts` cannot
produce `> pod03 ... LANDED · HARD · LZ-B IS WET`; `landing.ts` (the lead's) has to pass it. The order matters too:
- `emit('pod-landed')` runs first, and SWATH's synchronous reveal handler sets `groundKnown`;
- the echo is said after it.

So the flag must be computed **before** the emit.

**Fix** (in `landing.ts touchDown`, before the emit)
- Compute `const revealing = placement.lz !== null && groundAt(landing, placement.lz) !== 'flat' && !groundKnownAt(landing, placement.lz) ? groundAt(landing, placement.lz) as BadGround : null;`
- Pass it as a sixth argument, `LANDING_ECHO.touchdown(pod, place, lz, touch, bullseye, revealing)`. Its default is
  `null`, so the classic suites keep their words.
- SWATH's one line in `landing-text.ts` then appends `SWATH_TEXT.echoTail(lz, revealing)` when it is non-null.

### M2. SITES has no pure "what is SURVEY doing" reader, so it would re-derive SWATH's run rule (SITES/SWATH)

**Settled (follow-up):** Fixed: `surveyRunning(state): SurveyRunning` (stub `'off'`) and `swathHalfRad(version)` (stub 0) in `survey-model.ts`, SWATH's to build.

**Where**
- `src/systems/survey-model.ts` (no such export);
- `src/systems/survey-hud.ts:39–48` (`SurveyPlotModel.wedge`);
- §2.14 (the wedge "under the ship", the header's state).

**Problem**
The wedge shows only while SURVEY maps. The SITES header needs `running | waiting | paused | done | off`. That rule is
§2.8 step 1:
- the phase is right, and `landing.ended` is null;
- the clock is not paused;
- the version is at least 1;
- not paused;
- not every cell is mapped;
- and, below v3, a thread is held.

It lives in SWATH's tick. `surveyStatus` returns words, not the state. SITES would have two options, both bad:
- duplicate the rule in `survey-hud.ts`, which then drifts from SWATH's;
- cache the `'survey-state'` events in module state, which breaks "paints state" and §2.3.

**Fix.** Add two final-signature neutral stubs to `survey-model.ts` (SWATH's to build):
- `surveyRunning(state): SurveyRunning`, stub `'off'`. The tick should then use it too.
- `swathHalfRad(version: EffectiveVersion): number`, stub `0`, or built now from the 6 SWATH tuning:
  `SURVEY_SWATH_DEG × (v ≥ SURVEY_SWEEP_VERSION ? SURVEY_SWEEP_FACTOR : 1)`.

List both in the contract table.

### M3. NAV PLOT: the layer order is inverted, so the survey layer would paint over the landing rim (SITES, lead's file)

**Settled (follow-up):** Fixed: the survey layer is made after the landing layer, the comments say why, and its `paint` returns its label boxes (the note taken).

**Where**
- `src/components/tools-view/NavPlotWindow.ts:692–693` (survey layer made **before** the landing layer);
- `plot-landing.ts:139` (`below.after(dragLine, dragLabel, rim)` at creation);
- deviation 8 ("its nodes sit under it").

**Problem**
`Element.after()` inserts directly after the reference node. The layer created **later** therefore sits nearer the
surface, which means lower in the stack. Suppose SITES does the natural thing in `createPlotSurveyLayer`,
`below.after(group)`. The final order is then: surface, landing drag line, label, rim (brackets), survey group. The
mapped-rim stroke and the dashed brackets end up **above** the LZ brackets. The comment at `NavPlotWindow.ts:690–691`
has it backwards.

**Fix**
- Create the survey layer **after** the landing layer (swap lines 692 and 693), so its `below.after(group)` lands
  between the surface and the landing's drag line.
- Fix the comments in `NavPlotWindow.ts` and `plot-survey.ts:15`.

Small related point (m): `plot-survey`'s `paint` returns void. The `SITE 4` labels are therefore not obstacles for the
marker labels, as the landing layer's `bracketBoxes` are. Consider returning boxes, to be concatenated at `:1067`.

### M4. GROUND TRACK: an arc wider than about π lands on the wrong side of the dot on the strip (SITES/lead)

**Settled (follow-up):** Fixed (lead): `landing-hud.ts splitRimArcs` cuts the unmapped arcs into pieces ≤ π inside one turn, for the strip and the overview; tested on the worked example.

**Where**
- `src/systems/landing-hud.ts:536–540` (`stripSpan` uses `angleDelta(centreRad, mid)` ∈ (−π, π]);
- `:599–600` (the terrain stretches);
- `survey-hud.ts RimArc` ("`to` may run past 2π").

**Problem**
`stripSpan(mid, half)` places a stretch by its **middle's** wrapped delta. For a long unmapped arc the middle can be
more than π from the dot, so the whole span is laid out behind the dot. Worked example:
- the arc runs from 0.1 to 6.2 rad, with the dot at 0;
- its middle wraps to about −3.13;
- the span covers −6.03 to −0.23 rad;
- so the ground just ahead of the dot (0.1 to 0.3 rad) reads as mapped.

At the boot, the whole rim is one unmapped arc. The old ground stretches were TERRAIN_STRETCH_DEG wide, so this never
showed before. `planetSpan` has a milder form of the same problem: a span past 0 or 1 is drawn from its middle, and the
part that wraps round is cut off.

**Fix** (either)
- Contract: `surveyUnmapped` returns arcs no wider than `SURVEY_CELL_DEG` (one per unmapped cell, at most 72). Say so in
  the `RimArc` comment.
- Or the lead splits each `unmapped` arc in `terrainStretches` and the `planet.unmapped` map into pieces of at most
  TERRAIN_STRETCH_DEG.

### M5. Shared words test: `SLICE6_WORST` sits outside both track blocks, and the probe conflicted on it (SITES and SWATH)

**Settled (follow-up):** Fixed: a shared base plus `SWATH_WORST` / `SITES_WORST` inside each block; the parser reads destructured, defaulted and `function` templates and throws on what it cannot read.

**Where**
- `tests/unit/support/words.test.ts:292–295`.

**Problem**
Each track's new template parameter must be listed in `SLICE6_WORST`, or `renderSlice6` throws. SITES's words will
plausibly need, for example, `stars`, `hard` and `colonists`; SWATH's, `n` and `from`. Both tracks then edit the same
object literal outside their blocks. The merge probe conflicted there; it was the only conflict.

The parameter parser has two further weaknesses:
- it fails on a destructured parameter (`({ lz, site }) =>`);
- it silently passes no arguments for a default parameter (`(n = 1) =>`) or for a `function` declaration.

**Fix**
- Give `renderSlice6` a third argument, `extra: Record<string, unknown>`, merged over a shared base.
- Each block declares its own `SWATH_WORST` / `SITES_WORST` inside its block.
- Make an unparsable parameter list throw, rather than call with no arguments.

### M6. Opening the SITES window from code (SITES_AUTO_OPEN) needs a ToolsTabs export SITES may not add (SITES)

**Settled (follow-up):** Fixed: `openToolWindow(id, { onPhone })` exported; SITES closes its phone tab when `body.survey` goes away (contract).

**Where**
- `src/components/tools-view/ToolsTabs.ts:139–144`: only `closeToolWindow` is exported;
- the SITES test lines give it only `:16–17`.

**Problem**
SITES_AUTO_OPEN ("the window opens itself at the first find, and once per ship at the boot") needs a programmatic open.
Today the only route is a synthetic `dockItem.click()`, and that has two faults:
- it toggles the window, so it closes an already open one;
- on a phone it steals the active tab from the NAV PLOT at the boot.

**Fix**
- Add `openToolWindow(id, { onPhone: false })` beside `closeToolWindow`. On the desktop it adds the id to `desktopOpen`
  and syncs; on a phone it is a no-op unless asked.
- Or widen SITES's ToolsTabs rights to that export.
- Note for SITES: when `body.survey` goes away, call `closeToolWindow('sites')`. Otherwise a phone left on the SITES tab
  shows a blank panel on the next GOOD ship.

### M7. The record cannot tell slice 7 what an LZ moved off (lead; save)

**Settled (follow-up):** Fixed inside v6: `SurveyMove.from`, `SurveyRecord.movedOff`, in the codec and `surveyRecordOf`; the pin does not move, and no migration default is needed.

**Where**
- `src/types/survey.ts:42–45` (`SurveyMove { lz; site }`) and `:73–79` (`SurveyRecord`);
- §2.12 and §4 ("`RIVERSIDE stayed dry: you moved LZ-B off the lake`").

**Problem**
`ShipResult` keeps no sites, and `badKept` lists only LZs still on bad ground. For an LZ moved off a WET guess, the record
says `moves: [{ lz: 'LZ-B', site: 'site-4' }]` and nothing about the lake. That is exactly the epilogue line the plan
cites. Recovering it would mean re-rolling `rollSurveySites` from the ShipKey in slice 7. A field added later would be a
v7 bump.

**Fix** (now, inside v6)
- `SurveyMove` gains `from: string` (the site left, which `'lz-moved'` already carries).
- `SurveyRecord` gains `movedOff: { lz: string; ground: BadGround; known: RevealBy | null }[]`, the bad grounds an LZ left.
- The changes go in the codec's `checkSurveyMove` and `checkSurveyRecord`, in `surveyRecordOf`, and in the shape pin. The
  pin is unaffected: `moves` items and `run.ships[].survey` sit below its depth.

### M8. `siteStars`, `assignRefusal` and `assignableLzs` are neutral, so SITES's row and pill tests cannot pass in its own worktree (SITES/SWATH)

**Settled (follow-up):** Fixed: `siteStars` built per R11; the contract says SITES's pill checks go green after the rebase onto SWATH.

**Where**
- `src/systems/survey-model.ts:110–135`;
- §5 ("SITES builds every model on hand-built states … so it never waits on SWATH").

**Problem**
On a hand-built state:
- `siteStars` is 0, so every row shows no ★;
- `assignableLzs` is `[]`, so there are no pills.

SITES's `ui-models` checks for `FLAT ★★★`, `SET AS LZ-B (800)` and the dimmed refusals cannot go green until it rebases
on SWATH, which contradicts §5.

**Fix**
- Build `siteStars` in the foundation now. It is pure and fully specified by R11 (3 for FLAT and not NARROW, 2 for FLAT
  NARROW, 1 for ROCKY or WET, 0 for a wreck).
- For the pills, state in the plan that SITES's pill checks are written to `assignableLzs`'s contract and go green after
  the rebase onto SWATH (merge order §6.3). Or `sitesWindowModel` takes the pill provider as an optional argument for its
  tests.

---

## m: minor

- **m1. The site roll throws, very rarely, on a 4-LZ planet.** Where: `src/data/survey-sites.ts:96–106, 152–157`.
  - Measured with stress scripts:
    - 1 throw in 96,000 rolls across layers 5–7 at 4, 8, 12 and 16 pods (a 16-pod, 4-LZ landing,
      `no room on the rim for site 7 of 8 (wide)`);
    - 1 in 300,000 on 4-LZ arks alone.
  - The cause is greedy sequential placement, which can jam.
  - Each ShipKey's stream is deterministic, so a ship that hits it throws at every boot, on every route and next run.
  - **Fix:** retry step 5 (placement only) up to N = 8 times on the continuing stream before throwing. Every draw before
    placement is untouched, and the validator is unchanged.
  - Nit: `placeOn` can return `to` (= 2π) through float rounding of `from + left`. Clamp it to below `to`.
  - **Settled (follow-up):** Fixed: up to `SITE_PLACE_TRIES` (8) placements on the continuing stream, tested with a forced jam; `placeOn` clamped below its span's end.
- **m2. `poorAhead` reads the raw reservation, not the gate.** Where: `src/systems/skill-tree.ts:240–244`
  (`reserved.site === 'poor'`, not `siteDataOf`). With `built` raised and `poor` down (R23's second dry run, or a later
  lowering of `poor` alone), SURVEY opens for planets that play GOOD. **Fix:** go through `siteDataOf({ site: … })`, as
  the card does.
  - **Settled (follow-up):** Fixed: `poorAhead` goes through `siteDataOf`; R23's sentry churn now shows only with both gates up.
- **m3. SWATH's tick needs one module variable.** Plan §2.3 says `survey.ts` holds no module state. To emit
  `'survey-state'` "on a change", SWATH must remember the last state it emitted, and `SurveyState` has no field for it (a
  field would be a save change). **Fix:** amend §2.3 to allow `lastRunning` in `survey.ts`, reset through `onWorldReset`.
  - **Settled (follow-up):** Fixed in the plan: §2.3 allows `lastRunning`.
- **m4. A worn Core's last thread (R8's own case) is not covered.** §2.8 only says when to claim. If the Core drops below
  CORE_LOW_INTEGRITY after the claim (2 threads to 1), SURVEY holds the only thread for minutes.
  - **Fix (SWATH):** while holding, release when `threadsTotal() < 1 + SURVEY_KEEP_FREE_THREADS`. This is not "free <
    1", which would yield to the kid's ops.
  - SWATH's R8 flow case should pin it.
  - **Settled (follow-up):** In SWATH's contract.
- **m5. A move during a held GO LOWER.** `assignRefusal` should also refuse while
  `landing.goLow?.held && goLow.lz === lz` (`landing.ts:487–495` keeps a held aim as it is). Without that, the burn flies
  to the old geometry.
  - **Settled (follow-up):** In SWATH's contract.
- **m6. Gameplay: SURVEY's held thread also mutes threats.** HOLLOW's verbs and the corrupted resident's locks both
  start only when `canStartOp()` (`hollow-verbs.ts:104`, `resident-corrupted.ts:249`). Take a 2-thread Core with SURVEY
  holding a thread and one op of the kid's running: HOLLOW skips its verb moments, and the resident cannot lock, for as
  long as that op runs. Before slice 6, that op left a thread free. AUTOBURN does the same, but only briefly; SURVEY holds
  through the whole approach. This is not a neutrality issue (nothing is yieldable while the gates are down). Ask the
  sweep (§7.3) to count skipped verb moments and lock delays by version, and log the result with R8.
  - **Settled (follow-up):** In SWATH's contract (its sweep counts the muted verbs and locks, and the ties).
- **m7. The test lines cited for SWATH are off by one.** In `survey/foundation.test.ts` the checks are at `:60` (POOR,
  comment `:59`) and `:62` (SURVEY, comment `:61`), not `:61` and `:63`. Every other line cited in the contract table
  matches HEAD.
  - **Settled (follow-up):** Fixed: the lines are corrected in the follow-up's contract (now `:67` and `:69`, after the new imports).
- **m8. The report row order differs from the plan.** The LANDING REPORT row reads `LZ-B 800 / 800 ✓ · SITE 4` (the
  suffix is appended, `landing-report.ts:113`). §0.1 shows `LZ-B · SITE 4 · 800 / 800 ✓`. Pick one and fix the plan
  text.
  - **Settled (follow-up):** Settled: the built order stands; §0.1 corrected.
- **m9. One codec gap.** A GOOD planet's LZ with `ground: 'rocky'` passes (no site, so no geometry check). **Fix:** refuse
  non-FLAT ground when `survey.site === 'good'`.
  - **Settled (follow-up):** Fixed: the codec refuses a non-FLAT LZ on a GOOD planet.
- **m10. The words test misses the longest ground word.** `SLICE6_WORST.ground` is `'rocky'`, but
  `SITES_TEXT.row.site/lz(…, ground: string)` take a display word. Their worst case is `FLAT ★★★` (9 characters), not
  `rocky`. Give display-word parameters a distinct name, such as `groundWord`.
  - **Settled (follow-up):** Fixed: `groundWord` in `SITES_TEXT.row`, worst `FLAT ★★★` in `SITES_WORST`.
- **m11. A note for SITES's card row.** A visited ship that is POOR on the map but was played before v6 (a migrated
  SHIP DONE) has `ShipResult.survey === null`. `surveyCardRow` must not read that as GOOD. It should read
  `POOR · NOT SURVEYED`, or no row.
  - **Settled (follow-up):** In SITES's contract.
- **m12. A note for the lead's e2e.** The SITES dock item and window are now in `index.html`, hidden by
  `body:not(.survey)`. No current scenario iterates dock items, so nothing moves today.
  - **Settled (follow-up):** Noted in the lead's contract.

---

## The four questions, in short

**R23 settled (follow-up):** the review's edit for `skills/sentry.test.ts:110–111` is in SWATH's contract verbatim.

### 1. Contract sufficiency

**SITES can paint every point from state, except:**
- the GROUND TRACK (B1, plus M4);
- the SURVEY run state and the wedge width (M2);
- the auto-open (M6);
- the plot order (M3).

**The yieldable thread is sound:**
- `reserveThread(owner, { yieldable: true })` claims;
- `holdsThread` false means SURVEY yielded;
- `releaseThread` pauses;
- a preempting claim takes the oldest yieldable reservation, and none when dropping it would still leave no thread free.

A worn Core's last thread (m4) is SWATH's rule to add.

**`sitesRev`** (I checked every memo key in `src/systems`):
- it is read by exactly the three keys that cache LZ geometry: `drop-cache fresh()`, `autoburn-v3 aimKey` and
  `autodrop-plan planKey`;
- the other views (brackets, GO LOWER, windows, the GROUND TRACK, the plot) recompute every paint or tick;
- it is bumped only by `assignSite`, the only thing that moves LZ geometry, since WET's width is fixed from the boot.

That is exactly right.

**SWATH can build §2.8 and §2.9, except the echo tail (M1).** The rest is in place:
- the ops-core exports (`threadsTotal`, `threadsBusy`, `holdsThread`);
- `pendingTouchdowns`, for `'falling'`;
- `landing.window`, for `'window-open'`;
- `'pod-landed'` with `lz`;
- the `lines` flags for every once-per-ship line;
- the debug hooks.

### 2. Save v6

- **Migration:** correct at every save point. RUN START and BEAM are boot payloads (`payload.run.ships[].survey = null`).
  SHIP DONE and ENDING CHOSEN are world payloads (the landing slice too). `RunSave.run` is a number, so there is nothing
  else to step.
- **Codec at rest:** it accepts every legitimate state I could construct:
  - an LZ moved back onto another LZ's former guess;
  - reveals of sites no LZ stands on;
  - `sitesRev` greater than the number of moves;
  - `paused` true;
  - a wreck's ROOM 0.
- **Save points at rest:** `endShip` puts the machine at rest before the SHIP DONE save, and ENDING CHOSEN is always on a
  GOOD final ship. The `landing-roller` authors finals GOOD, and layer 8's odds are 0.
- **No missing field for either track,** apart from M7, which is slice 7's need but cheap only now.

### 3. Neutrality with both gates down

**Unchanged.**
- **Ops core:** with nothing yieldable, `canClaimThread()` is `canStartOp()`, and `preempt` is a no-op. SENTRY's pre-empt,
  the resident's locks, HOLLOW's verbs and the kid's `startOp` are untouched.
- **Touchdown:** `groundAt` is always `'flat'`. The `placement.lz` it is given always comes from `landing.lzs`, so it
  cannot throw.
- **Boot line:**
  - `'site-data'` needs `landing.survey.site === 'poor'`, so it never shows on a GOOD ship;
  - the new `BOOT_LINE_AT_SEC[23] = 30.4` equals the old extrapolation for index 23 (29.1 + 1.3), so no boot's timing
    moves.
- **Other seams:**
  - `SKILL_ROW_HOOKS.survey` reproduces the hook-less row exactly;
  - `surveyShipEnd` does nothing on a GOOD ship (the release returns false, and there is no update);
  - the hud stubs answer empty;
  - `survey.css` hides the new DOM.

### 4. Hot files

**Clean in the probe:**
- `tuning.ts` (the blocks are four lines apart);
- `index.html`, `ToolsTabs.ts`, `TrainingWindow.ts`, `audio-cues.ts`: one owner each;
- the SWATH-only test lines.

**One conflict:** `support/words.test.ts`, at `SLICE6_WORST` (M5).

### R23

**Is the measured churn the intended rule? Yes.** `openBranchesAt` gives a visit's one new branch to SURVEY when both are
due (`skill-tree.ts:274`). The check at `sentry.test.ts:110–111` builds a desk 4 at VESPER with CORMORANT in reach, so
SURVEY takes visit 4. The rule is sound: 'after-seeds' stays due once met, while 'poor-ahead' is due only while a POOR
planet is in reach.

**The edit for SWATH.** Keep the check's intent and pin the tie:
```ts
const tie = openBranchesAt(unseeded, 4);
unseeded.run.skills.opened.push({ skill: 'survey', visit: 4 });
check('…a record written at depth 4 opens it at visit 4, or at visit 5 when SURVEY takes visit 4 (R16)',
  shut && (tie.includes('sentry') || (tie.includes('survey') && openBranchesAt(unseeded, 5).includes('sentry'))));
```
Or wrap the original line in `withSurvey({ built: 0 }, …)` and add the tie as a separate check.

**Can SURVEY crowd SENTRY out?** It delays SENTRY by one desk at most. It never crowds it out:
- SURVEY latches once, so a tie happens at most once per run;
- on seeds 1–30, no desk has both the final ship and a POOR ship in reach (checked with `reachableFrom`);
- so a tie desk is always followed by another desk, where SENTRY opens.

The only cost is a ship played without SENTRY that might have had it. Ask the sweep to count ties.

---

## Verdicts

**SWATH: go once M1 is wired.**
- Also take M2, so the tick and SITES share one rule.
- Fold m3, m4 and m5 into its own design.
- Its gates, test lines and R23 churn are as listed (m7 corrects two line numbers).

**SITES: blocked by B1 until the lead adds the GroundTrack hooks** (or a marked SITES block in `GroundTrack.ts`).
- Then go, with M2, M3, M4, M5, M6 and M8 settled in the contract first.
- m10 and m11 are its own to handle.

**The lead, before branching:**
- B1, M1, M3, M5 and M6: small edits in lead-owned files;
- M7: the v6 shape, which is the last chance without a v7;
- M2 and M8: stubs and the plan text;
- m1 and m2: cheap now.
