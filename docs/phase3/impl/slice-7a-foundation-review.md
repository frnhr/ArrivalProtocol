# Slice 7a FOUNDATION: independent contract review

Reviewed: `git diff a0fd347..found-7a` (5 commits, 45d0385 at the tip) in the worktree
`.claude/worktrees/agent-ab565afb755a92c08`. I read plan §0–§6 and its "Deviations (7a foundation)", 05 §3.7/§3.12, 04's
sleeping last block, 02 §4, OPEN-DECISIONS 39–51 and AGENTS.md.

**What I ran**
- `npm run typecheck`: clean.
- `node tests/unit/run.mjs ending/foundation`, then `save`, then `wp11`: all green (2 + 8 + 7 suites).
- A merge probe in a scratch clone (`scratchpad/probe`; the real repo was not touched). I made three branches from
  found-7a, and each edited only the lines the Deviations hand its track. Then I merged FINALE, CARD and NIGHT in that
  order. Results are under M1.
- No e2e.

**Verdict in one line:** the seams are sound and the run end is neutral with every gate down. Before the tracks branch,
two blockers (B1, B2) and five majors need a lead decision. Each one is small.

---

## Blockers (a track cannot build a 7a design point inside its own files)

### B1. The report's ending line needs the ending titles, and no file the tracks can share holds them
- **Where:**
  - `src/systems/ending-rules.ts:114` `reportEndingLine` (FINALE's, per Deviation 13);
  - `src/data/finale-text.ts:77` `reportLine(fate, title)`;
  - `src/data/epilogue-text.ts` (NIGHT's) has no titles yet.
- **Problem:**
  - The line is `ENDING · <step 1> · <title>`, and the title is R23's table (`STAND BY`, `RIVERSIDE'S MIND`, …).
  - The plan puts the titles in `epilogue-text.ts`, which is NIGHT's file and is still empty of them.
  - So FINALE cannot fill `reportEndingLine` without one of these:
    - waiting for NIGHT's merge;
    - writing a second copy of the titles in `finale-text.ts`, which could disagree with the final card;
    - editing NIGHT's file.
  - (Plan §2.9 also still gives this line to CARD, while Deviation 13 gives it to FINALE.)
- **Fix (lead, now):**
  - Seed this in `src/data/epilogue-text.ts`:
    `export const ENDING_TITLE: Readonly<Record<EndingTitleKey, (colony: string) => string>>`, with 05 §3.7's ten titles,
    R23's four `TODO(05)` drafts and CONTACT's three. Use the colony argument only for `stay:purge` (`${colony}'S MIND`).
  - NIGHT owns the words. FINALE imports the table for `reportEndingLine`, with the colony from `EndingRecord.stay`.
  - Say this in the Deviations, and drop "7a CARD" from §2.9's report-line bullet.
  - NIGHT's words.test block renders the table. FINALE's `FINALE_WORST.title` already covers the report line's worst case.

- **Settled (lead, fixed in the follow-up):** `epilogue-text.ts ENDING_TITLE: Record<EndingTitleKey, (colony) => string>` is seeded with the R23 titles; NIGHT owns the words and FINALE imports the table for `reportEndingLine`. The report line is FINALE's (Deviation 13); §2.9's bullet is corrected.

### B2. CARD's FUEL-notch `SUNSET` tooltip lives in a file nobody gave it
- **Where:** `src/components/tools-view/EngineWindow.ts:244–246` (`fuelStar.title = '★ Lock the orbit with at least …'`).
  This is Track ORBIT's file from 4c–4e and is not in any 7a list.
- **Problem:** §2.10 and §5.1 give CARD "the FUEL notch's tooltip". CARD owns `FinaleChoice.ts`, `ending.css`, `audio.ts`
  and the `game.css` block only, so this design point cannot be built.
- **Fix:** do one of these.
  - Name `EngineWindow.ts:245` as CARD's one line, plus the words in `finale-text.ts`
    (`FINALE_TEXT.fuelStar(pct)`, asked of FINALE).
  - Or the lead adds a pure hook now, `fuelStarTitle(state): string | null` in `ending-rules.ts` (null off the final ship),
    and EngineWindow reads `hook ?? today's title`.
  - Either way the notch's position is not touched (`EMPTY_SHIP_FUEL_PCT === STAR_FUEL_PCT` is asserted).
- **Settled (lead, fixed):** a lead hook `fuelStarTitle(state) => string | null` (null: today's title) in the new CARD-owned `systems/finale-card.ts`; EngineWindow reads it on every paint. CARD fills it.

---

## Majors

### M1. Three parallel edits do NOT merge cleanly: two files conflict (merge probe)
- **Probe result:**
  - FINALE then CARD merged cleanly: `tuning.ts`, `index.html`, `game.css`, `hollow-text.ts` and `words.test.ts` were
    fine, and the tuning blocks auto-merged.
  - NIGHT then conflicted in two files.
- **Conflict 1, `src/systems/audio-cues.ts:389–392`:**
  - CARD's lines (`finale-open`, `finale-chosen`, `finale-step2`) sit directly against NIGHT's `epilogue-line` line.
  - Git treats edits to adjacent lines as one hunk, so they conflict.
- **Conflict 2, `tests/unit/ending/foundation.test.ts`:**
  - `:50` (FINALE's gate check) sits against `:51` (NIGHT's).
  - `:70–73` and `:75–76` (FINALE's stubs) sit around `:74` (NIGHT's "the night has no models yet").
- **Fix (lead, before branching):** give every track line at least one untouched line on each side.
  - In `audio-cues.ts`, add a comment line between CARD's three lines and NIGHT's line:
    `// Track NIGHT's cue (the epilogue):`.
  - In `foundation.test.ts`, put a comment line between the `twoStep` and `night` checks. Also move the night-models
    check (`:74`) out of the stubs check into its own block, after the throwing-stubs check, with a blank line around it.
  - Then update the Deviations' line numbers.
  - Re-run the probe; my script is
    `/tmp/claude-0/-home-user-ArrivalProtocol/76e4d092-2879-5dcd-8be6-93995faeadbb/scratchpad/probe-edit.py`.
- **Checked clean:**
  - `data/endings.ts:15/17` (one comment line between them is enough);
  - `words.test.ts` (FINALE `:430–441` and NIGHT `:445–456`; NIGHT may widen its own import line `:35` for `PAYOFF_OF`
    without touching FINALE's `:34`);
  - `index.html` (`#finaleChoice` at `:521` against `#epilogue`/`#finalCard` at `:596–597`);
  - the `.finale-choice` block in `game.css` (CARD's alone).

- **Settled (lead, fixed):** a spacer line between each track's lines in `audio-cues.ts`'s 7 ENDING block, and the night check of `ending/foundation.test.ts` in its own block with a spacer; every line number in the Deviations is updated.

### M2. `OptionState` does not carry what CARD paints, and CARD has to fix its shape before FINALE fills it
- **Where:** `src/systems/ending-rules.ts:50–53`.
- **Problem:**
  - Each row shows a price **meter** for an open option (`COSTS 20 REPAIR CHARGE · you have 34`, `NEEDS FUEL 20% · you
    have 31% ✓`), the `NOW:` line (MERGE's restored drivers) and the greyed reason (`046 HAS THE SHIP`).
  - `{ kind: 'open' }` carries none of this. So CARD would have to re-derive FINALE's rules: `chargeLeft`,
    `emptyShip().fuelPct`, and which eaten pods count (R25).
  - The stubs also return `hidden`, `[]` and `fuelPct: null`, so CARD's `card-models` suite cannot get a SPARE meter or a
    STAY row out of a hand-built state.
  - The Deviations make the type FINALE's ("CARD asks for a change"), but the two tracks build in parallel. The shape is
    a contract and has to be fixed now.
- **Fix (lead, in `ending-rules.ts`, type only; the stub's answers stay neutral):**

  ```ts
  export interface PriceMeter { kind: 'charge' | 'fuel' | 'signals'; have: number; need: number }
  export type OptionState =
    | { kind: 'open'; price: PriceMeter | null; now: string | null }
    | { kind: 'needs'; need: string; named: boolean; price: PriceMeter | null }
    | { kind: 'hidden' };
  ```

  - Then CARD's model is a pure map over `optionState` results, which its suite can inject.
  - FINALE fills `price` and `now` (words from `FINALE_TEXT.price` and `.now`).
  - The neutral stub returns `price: null, now: null`.
  - `debug.ts`'s `__ap.finale().options` follows by itself.

- **Settled (lead, fixed):** `OptionState` is `open { price: PriceMeter | null; now }`, `needs { need; named; price }`, `hidden`, with `PriceMeter { kind; have; need }`; the neutral stub returns the full shape (MERGE's charge meter) and hidden rows.

### M3. STAY's sub-pick has no contract: who opens the sub-row, what `pickStep2('stay')` does with several ships, where ESC goes
- **Where:**
  - `src/systems/finale.ts:488–506`;
  - `src/debug.ts` (`__ap.finale.pick(2, piece, stay)` calls `pickStay` straight from step 2);
  - Deviations table.
- **Problem:**
  - `pickStep2('stay')` throws through `notBuilt` when there are ≠ 1 candidates.
  - Nothing in `FinaleState` says the sub-row is open.
  - The debug hook implies "`pickStay` confirms from `'step2'`", but no line of the contract says so.
  - CARD and FINALE could easily build two different flows.
- **Fix (write it into the Deviations' contract table):**
  - The sub-row is CARD-local UI state, unsaved. It is lost on a reload, which replays the ship anyway (R14).
  - `[2] STAY` with one candidate calls `pickStep2(store, 'stay')`, which confirms.
  - With more than one, CARD opens the sub-row and calls `pickStay(store, slot)`. `pickStay` is valid at `'step2'`,
    refuses a slot outside `stayCandidates`, and confirms STAY.
  - `pickStep2('stay')` with more than one candidate returns the refusal `FINALE_TEXT.stayPick` and does not throw.
  - ESC in the sub-row closes the sub-row (CARD). ESC on step 2 calls `backToStep1`.
  - Also say which colony `> mount <colony>` names on the row with several candidates: the newest, which is
    `stayCandidates()[0]`.

- **Settled (lead, fixed in the contract and the code):** the review's flow, written into the follow-up's contract; `pickStep2('stay')` with more than one ship refuses `FINALE_TEXT.stayPick` and never throws.

### M4. The ending record is built at RUN END, not at the confirm. Freeze it in the v7 bump while one is still allowed
- **Where:**
  - `src/systems/ending-rules.ts:86–110`;
  - `src/types/ending.ts:47–51` (whose own comments say "a usable copy in memory **at the FINALE's confirm**");
  - `src/state/schema.ts:618` (`stay: number | null`).
- **Problem:** `endingRecordOf` recomputes everything from the world as `endRun` sees it, and the world moves after
  step 2.
  - **STAY is recomputed through `stayCandidates`.**
    - At `endRun` the final ship is in `run.ships` (since `endShip`) and in the live landing. Under R15, the MERGE pods the
      kid relaunches after step 2 can also pull the final ship under `STAR_ON_TARGET_FRAC`.
    - If the candidate list moved, `endingRecordOf` throws inside `archiveRunEnded`. The run then ends with no archive
      record (endRun's policy: "the error goes on up").
  - **`fuelPct` is read at RUN END.**
    - R15's reopened landing sets `fuelAtEndPct = null` and notes it again later (GO LOWER can burn).
    - So MERGE + SUNSET can record and say `left orbit with … 12% fuel` after the card required 20%.
  - **`kit` and `charge`** are read after the reopened landing (charge from REPAIRs run in it), not at the confirm.
  - The record also has to survive the ENDING CHOSEN save and resume, and a second save bump is forbidden.
- **Fix (lead, now, inside v7):**
  - Add `FinaleState.record: EndingRecord | null`:
    - written once, in the confirm's update, by a pure `endingRecordAt(state, hollow, you, stay)` in `ending-rules.ts`
      (FINALE's body);
    - null until then.
  - `endingRecordOf(state)` returns `finale.phase === 'done' && landing.finalShip ? finale.record : null`.
  - The codec checks it with `parseEnding` and, at `'done'`, its agreement with `hollow`, `you` and `stay`.
  - `migrateRunSave6` builds it for a decided v6 finale with `endingOfV3LastUnit`'s rule from `run` plus slices: final
    slot, ship and year from the slices, `kit` from memory, `charge` from `chargeLeft`.
  - Smaller alternative: widen `FinaleState.stay` to `{ slot; colony; year } | null` and record `fuelPct` and `kit` there.
    That fixes STAY and the fuel, but keeps the end-of-run read for the rest.

- **Settled (lead, fixed inside v7):** `FinaleState.record: EndingRecord | null`, written at the confirm by `ending-rules.ts endingRecordAt`; `endingRecordOf` reads it; shape pin, v6 migration default and codec checks.

### M5. Retiring `HOLLOW_FINALE` breaks files FINALE does not own, and `words.test.ts:150–161` has no owner
- **Where:**
  - `src/data/hollow-text.ts:187–288` (FINALE "trims HOLLOW_FINALE");
  - readers outside FINALE's files:
    - `FinaleChoice.ts` (CARD's): `choiceKicker`…`endingHint`, `purgeCost`, `mergeGain`, `mergePrice`, `lastWords`;
    - `script.ts:450`, `:2396–2453` (lead's): `endingUnknown`, `strip*`;
    - `landing-guidance.ts:40/410`: `stripWaitsNobody`;
    - `SegmentBlock.ts:111`: `rootTag`;
    - `debug.ts`: `chooseFinale`, `finaleChoiceRefusal`, `finaleEndingLines`, `type FinaleChoice`;
  - `tests/unit/support/words.test.ts:150–161` (lead's), which reads `purgeCost`, `mergeGain`, `purgeEnding` and
    `mergeEnding`.
- **Problem:**
  - R13 retires `purgeEnding` and `mergeEnding`, and the Deviations say FINALE "(or CARD) deletes `chooseFinale` with the
    old card".
  - Deleting any of these in FINALE's branch breaks the typecheck at FINALE's merge, because CARD's old card is still
    there until CARD merges second.
  - `words.test.ts:150–161` would break and is in no track's list. R5's measured movers do not include it, because the
    dry run did not retire anything.
- **Fix:**
  - State a keep-set in the Deviations: FINALE deletes no `HOLLOW_FINALE` key or `finale.ts` export that a file outside its
    list reads.
  - The fix pass deletes the dead ones after CARD's merge: `chooseFinale`, `finaleChoiceRefusal`, `FinaleChoice`,
    `finaleEndingLines`, `purgeEnding`, `mergeEnding`, the old card's words, and `not-built.ts`.
  - Give FINALE `words.test.ts:150–161` (the WP11 finale words) as churn lines.

- **Settled (lead):** the keep-set is in the follow-up's Deviations (`HOLLOW_FINALE` and `chooseFinale` and their kin stay until the fix pass after CARD's merge, which deletes the dead keys); `words.test.ts:150–161` goes to FINALE.

### M6. Step 2's confirm does not re-check step 1's price, so MERGE can throw at the confirm
- **Where:** `src/systems/finale.ts:490–499` (`pickStep2`, then `confirm`, then `merge`, then `spendCharge`).
- **Problem:**
  - `pickRefusal(state, 'step2', you)` checks only step 2's option.
  - The AI clock runs under the card (the landing "goes on underneath"), so a REPAIR started before the card can drain
    charge while step 2 is up. Example: 21 at the step-1 pick, 19 at the confirm.
  - `spendCharge(20)` then throws (`spendCharge: 20 charge asked, 19 held`) mid-confirm.
  - R7 says "Prices are judged when the card shows each option". The same holds for SPARE's empty ship.
- **Fix (FINALE, in its file; flag it in "Notes for the tracks"):**
  - `pickStep2` first runs `optionState(state, hollow, [])`. If it is not open, it refuses with step 1's need, and either
    stays on step 2 with the reason or bounces to step 1 (FINALE decides).
  - Add the case to `ending/finale-flow` ("MERGE at 21, a REPAIR running, confirm at 19").

- **Settled (lead, fixed):** `pickStep2` re-checks step 1's price at the confirm; if it can no longer be paid it goes back to step 1 with the reason and refuses, never throws. `ending/foundation` tests it.

### M7. A SPARE win plays the RUN TALLY as a loss, and `systems/run-end.ts` has no 7a owner
- **Where:** `src/systems/run-end.ts:145–147` (`runEndTone`: `won = cause === 'won-purge' || cause === 'won-merge'`), and
  `:272` (`ending: …` purge or merge, else null).
- **Problem:**
  - `'won-spare'` (R17) reads as `'sombre'`: no victory glow or music for a won run.
  - No 7a list names this file. NIGHT owns `RunEnd.ts` but not its model.
- **Fix (lead, now; neutral, since SPARE is unreachable until FINALE):**
  - Add `'won-spare'` to `won`.
  - Leave `ending` as is: NIGHT removes the tally's ending block, and the final card reads the record.
  - Or name `run-end.ts`'s tone line as NIGHT's.
- **Settled (lead, fixed):** `run-end.ts runEndTone` counts `'won-spare'` as won.

---

## Minors

- **m1. `finaleCardUp` leaves out `'verdict'`** (`src/state/selectors.ts:419`).
  - **Settled (fixed):** `finaleCardUp` includes `'verdict'`.
  - R13 says the verdict types on the card, and R18 says nothing opens while the card is up.
  - Fix now (`'verdict'` is unreachable until FINALE builds it): return true for `'step1' | 'step2' | 'verdict'`.
  - Today no TERMINAL choice can open on a final ship after its landing ends: the DEAL and WARDEN's deal are withdrawn at
    the landing's end, and generated arms put no sleeper on the final ship. So this is spec hygiene, not a live bug.
- **m2. Two strip lines.**
  - **Settled (fixed):** the strip's choice line is `FINALE_TEXT.strip` behind `ENDINGS_BUILT.twoStep` (`HOLLOW_FINALE.stripChoice` while down).
  - `FINALE_TEXT.strip` (`finale-text.ts:26`) is unused. The strip's rule (`script.ts:2396`, lead's) reads
    `HOLLOW_FINALE.stripChoice` = `PURGE OR MERGE — …`, which is wrong once SPARE exists.
  - Fix: either FINALE rewords `stripChoice` inside its `HOLLOW_FINALE` block and `FINALE_TEXT.strip` goes, or
    `script.ts:2396` is named as FINALE's line.
- **m3. `.lr-ending` (`LandingReport.ts:136`) has no CSS and no owner.**
  - **Settled (fixed):** `.lr-ending` has its rule in `ending.css`; CARD owns the rule, FINALE the words.
  - Fix: name it in CARD's `ending.css`, or the lead adds one rule in `landing.css`.
- **m4. The `'won-spare'` placeholders NIGHT "may reword" are in `script.ts`**, which is the lead's file:
  - **Settled (fixed):** the `'won-spare'` placeholders moved to NIGHT's `epilogue-text.ts SPARE_RUN_END`; `script.ts` reads them.
  `RUN_END_TITLE`, `RUN_END_WHY`, `LINEAGE_END` (`:429`, `:637`, `:670`).
  - Fix: name the three lines as NIGHT's, or move them to "ask the lead".
- **m5. META 3 → 4: an archive whose only ending was UNRESOLVED** gets `lastUnit.ending = followed + REASSIGNMENT`, but
  - **Settled (fixed):** META 3 → 4 also adds `'reassignment'` when the last unit's cause is `'unresolved'`.
  `endingsSeen` stays `[]`. The rule is "gains 'reassignment' when it holds any" (`meta.ts:262`).
  - Meanwhile `recordRunEnd` adds `'reassignment'` for a new `'followed'` end.
  - R16 reads `'unresolved'` as stood by, so add `'reassignment'` also when `lastUnit.cause === 'unresolved'`.
  - Or record in the Deviations why not.
- **m6. A sentinel left in.**
  - **Settled (fixed):** `stay.year` and `finalYear` take the classic map's real years too; `finalYear` stays nullable only for a migrated record with no trail.
  - Deviation 4 drops sentinels (`finalSlot` and `finalYear` are null on the classic world), yet `stay.year` is `0` on
    the classic world (`types/ending.ts:43–45`, `ending-rules.ts`).
  - The classic map has real approach years (`map-run.ts classicRunMap`, `route[i].hop.approachYear`).
  - Fix: use the route's year for `stay.year`, or make it `number | null` like `finalYear`. Also consider recording
    classic `finalYear` from `galaxyYear`, which is real there.
- **m7. `tests/unit/support/finale.ts`:**
  - **Settled (fixed, first half):** `settleFinale` throws before the root falls. The verdict wait is FINALE's (notes).
  - `settleFinale` (`:66–74`) returns silently at `'none'` or `'duel'`, so a suite that calls it before the root falls gets
    a later `NOT NOW` instead of a loud failure. Fix: throw unless the phase is `'asleep'` or later.
  - `chooseEnding` (`:86–91`) skips the typed verdict but never waits for `'verdict'` → `'done'`, or for `cardAtAi`.
  - Both are FINALE's to extend once it adds `'verdict'`, or if it enforces the open delay in `pickRefusal`. Say so in
    "Notes for the tracks".
- **m8. Entry 12 is found at the `'step1'` phase change** (`story-log.ts:66`).
  - **Settled (notes):** in the CARD notes.
  - That is `FINALE_OPEN_DELAY_SEC` before `cardAtAi`, when the card shows.
  - CARD should time entry 12's typing from `cardAtAi`. Add one line to the CARD notes.
- **m9. `pickStep1` and `backToStep1` emit `'finale-open'` with `twoStep` down** (`finale.ts:476`, `:484`). Deviation 9
  - **Settled (fixed):** `pickStep1` and `backToStep1` emit `'finale-open'` only on the two-step path.
  says this happens only on the two-step path.
  - It can be reached only from `?debug` or the new card, so it is harmless. Either guard both with `ENDINGS_BUILT.twoStep`
    or reword the Deviation.
- **m10. NIGHT's `arrivalChoir` under the epilogue (§2.10) has no event of its own**, and `events.ts`' block is
  - **Settled (fixed):** `arrivalChoir` gets its own event, `'epilogue-open'` (NIGHT's cue line); the bridge note is in the NIGHT notes.
  "complete".
  - Fix: write in the NIGHT notes that NIGHT plays it on `'epilogue-line'` with `n === 0`, on its own line `:392`.
  - Also settle §2.9 against §5.1 on the bridge: NIGHT **reads** `MAP_TEXT.runEnd.bridge`, through
    `run-end.ts runEndNext`, and does not move it out of `map-text.ts`, which is not its file.
- **m11. Hand-built states against the stubs.**
  - **Settled (notes):** in the NIGHT and CARD notes.
  - `endingRecordOf` throws for STAY while `stayCandidates` is the stub `[]`.
  - So NIGHT's `ending/epilogue` cases for STAY's title and piece must inject the record, for example through an inner
    `epilogueOf(state, meta, record)`.
  - CARD's must inject `OptionState`s (M2).
  - Add both to "Notes for the tracks".
- **m12. The arbiter is live with every gate down.**
  - **Settled (recorded):** in the follow-up's Deviations as the one deliberate live seam.
  - `rootGone` → `openStep1` withdraws untimed choices at the root's fall, and `choiceMayOpen` is shut through the old
    card (`finale.ts:274–281`).
  - This is a behaviour change from a0fd347. No generated final ship can hold a sleeper, so it cannot be seen, and it is
    R18's intent.
  - Record it in the Deviations as the one deliberate live seam.

---

## The points asked

### 1. Contract sufficiency, per design point
- **FINALE.** Everything is reachable in its files, with these gaps:
  - B1 (titles for the report line);
  - M4 (freeze the record);
  - M5 (keep-set, `words.test` lines);
  - M6 (re-check at confirm);
  - m2 (the strip).
- Each FINALE input was checked:
  - R6 timing (`landingSettled`: ended, nothing falling, `mindTypedByAi`);
  - R8 (`landing.fuelAtEndPct`, fates, outcome);
  - R9 (`ShipResult.pods`, `.colony`, route years);
  - R10, R13 (`EndingVoice` covers the echoes and CONTROL; the codec's strict `voice` check accepts them);
  - R15 (merge's reopen stays in `finale.ts`; `finalePending` holds the report through `'last-landing'`);
  - entry 12 (`rootKeyDue` is its line);
  - the debug bodies.
- **CARD paints from state:** step, `rootFell`, `cardAtAi`, `hollow` (for SPARE's rule-out), the verdict
  (`FinaleEnding` + `finaleEndingLineStartsSec`), keys (`EndingOption.key`), the rows (`STEP1_OPTIONS`/`step2Options()`),
  `???` (`needs.named` with `archiveMeta().endingsSeen`), words (`FINALE_TEXT`), arming (`FINALE_STEP_ARM_SEC`).
- **Missing for CARD:**
  - the price meter and `NOW:` (M2);
  - the STAY sub-row flow (M3);
  - the FUEL tooltip file (B2).
- **NIGHT: all reachable from `state` and `meta` at `run.phase === 'end'`.**
  - colonies: `run.ships` (which includes the final ship after `endShip`), `.colony`, `.pods[].fate/.place/.lz`;
  - years: `run.map.route[i].hop.approachYear` (arm and classic), header from `run.map.galaxyYear`;
  - featured lines: `PodSummary.featured[].line` (null after migration, as R21 says);
  - the record: `endingRecordOf`, with the slices still the final ship's;
  - restored families: `finale.restored` + `landing.pods[].family`;
  - the next unit and gap: `run.next`, `meta.arm.gap`;
  - `endingsSeen`, which already holds this run's pieces;
  - lost runs: `run.endCause`, record null.
- **Missing for NIGHT:** the shared titles (B1), and m10 and m11.
- **R14 works with the seams.**
  - The only save between the BEAM into the final ship (a boot payload) and ENDING CHOSEN is none at all.
  - `finishLanding` writes ENDING CHOSEN only at `'done'`, which is after any `'verdict'` and `'last-landing'`.
  - The codec refuses anything else at that point.
  - So a reload anywhere in the FINALE resumes the BEAM and replays the ship. The module state (`spikeInSec`,
    `verdictOwed`) is reset through `onWorldReset`, and `sayOwedVerdict` flushes into the save's log.

### 2. Save v7 and META 4
- **Missing field:** only M4's frozen record (or STAY's colony). Nothing else is needed:
  - 7b's `lastLanding` is reserved and refused set;
  - its codec widening (Deviation 5) is codec-only;
  - CARD and NIGHT save nothing.
- **Migrations are correct at every point:**
  - world payloads (SHIP DONE `'none'`, ENDING CHOSEN purged, merged or unresolved);
  - boot payloads (`run.ships[].pods[].featured[].line`, `run.lastUnit.ending`);
  - v1–v5 chain through v6.
- **The save's `run.lastUnit` and the archive's `lastUnit` migrate through the same `endingOfV3LastUnit`,** so they stay
  equal. Old archives (R16) take the trail's last stop, or the classic name only. The m5 nuance stands.
- **Codec:** I found nothing legitimate refused.
  - SHIP DONE is always `'none'`.
  - STAY's slot check accepts the final ship, which is not yet in `run.ships` at ENDING CHOSEN.
  - `restored` is checked against the pods' `restored` flags.
  - The strict `ending.lines[].voice` matches `EndingVoice`.
  - `pods: list(anyRecord)` leaves `featured.line` unchecked, which is lenient and harmless.
  - The record's numbers pass `wholeNumber`: `chargeLeft` is integral, `shownFuelPct` is a ceil, and the years are whole.
  - The new `endingsSeen` duplicate refusal cannot hit an old archive: the old `recordRunEnd` guarded against duplicates.

### 3. Neutrality (every gate down)
The run end is unchanged:
- **Old card:** it shows at `'step1' && rootFell`, from the same delay through `cardAtAi`, and types WP11's ending at
  `'done'`.
- **PURGE and MERGE:** same apply and same cues; the old card confirms REASSIGNMENT, which nobody sees.
- **UNRESOLVED:** goes straight to `'done'`, `'followed'`; `finalePending` waits on `unresolvedUntilAi` as before.
- **REASSIGNMENT and endings:** REASSIGNMENT only enters `endingsSeen`. The title's and RUN END's endings lines filter on
  WP11's two (`ENDINGS 1/2` as before).
- **Next run:** `hollowUnitsAfter` and lineage read the cause, not the record.
- **NEW RUN:** RUN END's NEW RUN is unchanged, with `night` down.
- **One deliberate live seam:** the arbiter (m12).
- **e2e:** `playthrough.mjs:774` and `run-flow.mjs:416` now read `'done'` and are right. `resume.mjs`'s report-phase
  compare reads `'done'` on both sides. `run2.mjs`'s `archiveAs('won-purge')` passes `parseEnding`. Nothing else in e2e
  reads WP11's phase names or `restoredInPlace`.

### 4. Hot files and R5's churn
- **Merge:** see M1. `audio-cues` and `ending/foundation.test` conflict; everything else merges.
- **R5's measured movers are all FINALE's,** and none sits in a CARD or NIGHT file:
  - `ending/foundation:50`, `wp11/merge-test`, `wp11/fix1`, `wp11/p2/views`, `wp11/p2/purge-fleet`,
    `threat/arrival-story`;
  - `night` moves no unit suite: only components and the e2e read it.
- **The dry run under-counts FINALE's eventual churn,** because it raised a skeleton that still types WP11's endings.
  R13's verdict will also move:
  - `words.test.ts:150–161` (unowned, M5);
  - `views.test:55–58`;
  - `purge-fleet:44`.

### 5. Bugs in what's built
- **asleep → step1:** correct.
  - With the gate down it is the same tick.
  - With the gate up it waits for ended, nothing falling, and the line typed.
  - The report cannot deadlock, because the phase stays `'landing'` while `finalePending` holds the linger.
- **`rootKeyDue`, `writeEndingChosen`:** correct. Timing note in m8.
- **`finishLanding`'s throw:** correct. No path reaches it on a final ship below `'done'`, because `finalePending` is
  true from `'duel'` up.
- **`endingRecordOf`:** M4, and m6.
- **`parseEnding`:** strict and right: SPARE+SUNSET, STAY exactly for STAY, fuel exactly for SPARE and SUNSET, no
  duplicate kit, `fuelPct ≤ 100`.
- **`endingsSeen`:** m5.
- **The arbiter:** m1, m12.
- **`support/finale.ts`:** m7.
- **New bug:** M6, the unchecked step-1 price at the confirm.

---

## Per-track verdict

- **FINALE: GO once B1, M4, M5 and M6 are settled.**
  - B1: the lead seeds `ENDING_TITLE`.
  - M4: the lead decides on freezing the record.
  - M5: the keep-set and the `words.test` lines.
  - M6: written in its notes.
- **CARD: GO once B2, M2 and M3 are settled.**
  - B2: the tooltip's line or hook.
  - M2: `OptionState`'s final shape.
  - M3: the STAY sub-pick contract.
  - M1's `audio-cues` spacer line must be in before it branches.
- **NIGHT: GO once B1 and M1 are in.**
  - B1: the titles table seeded in its file, with an export name it keeps.
  - M1: the `foundation.test` and `audio-cues` spacers.
  - M7 is optional for NIGHT (the tally's tone after SPARE). m10 and m11 belong in its notes.
