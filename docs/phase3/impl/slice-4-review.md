# Slice 4 review: batch 4a+4b (the skill tree)

Independent review of `git diff f9ee3c1..HEAD` on `claude/modest-hawking-209t0f` (HEAD 8cbd2aa: TREE, FLIGHT and UI
merged). I checked it against 03-skills.md, DECISIONS.md, slice-4-plan.md (the lead decisions, §1–§7 and every
Deviations section) and AGENTS.md.

**What I ran:**
- `npm run typecheck`: clean.
- `node tests/unit/run.mjs skills/ wp9/ save/`: 23 passed, 21 s wall on 4 workers.
- Four throwaway repros. They ran from `tests/.out/review4/` (git-ignored; the suites' relative imports need that) and
  were then moved out of the tree to the session scratchpad:
  - `claim-in.test.ts` / `claim-in2.test.ts`: an IN correction inside the claim window (M2);
  - `rearm-claim.test.ts`: whether v2's later burns claim a thread (M1);
  - `trim-wait.test.ts`: a thread wait through a trim (M1);
  - `desk-enter.test.ts`: what ENTER does at desk 2 with TRAINING open, and SET COURSE while the bar fills (M3, M4).

  Each finding says whether it was reproduced or found by reading the code.

**Verdict:** no blocker. Nothing I tried crashes, softlocks, refuses a save or leaves the desk stuck:
- desk 1 with the first pick, on the arm and on the classic world;
- RESUME at RUN START, SHIP DONE and BEAM;
- UNDO, RESTORE, PACK AS (with damage too);
- the room limit, the +2 CYCLES card, the bank.

Two AUTOBURN rule bugs a player meets (M1, M2) and the desk's ENTER (M3, M4) should be fixed before the e2e run.

---

## Findings

### Blockers

None found.

### Majors

**M1. Every v2 burn after the first flies without claiming a Core thread.** `src/systems/autoburn.ts:382-387` (`rearm`),
with `setPhase` at `:321-333` and the claim at `:500-508`.

> **Fix pass: fixed.** `rearm` clears the claim and the wait; a claim or wait for a burn that moved past `AUTO_THREAD_RELEASE_TAC` (2 × the claim lead) is let go (the follow-on). `autoburn-modes` samples the threads outside the claim window, checks each GREEN burn holds one thread, and flies a trim with every thread busy (`NEEDS A THREAD IN 0:08`, then `NOW`, fired late on the release).

- **What is wrong:**
  - `rearm` releases the thread (`releaseThread(OWNER)`), then calls `setPhase(store, 'armed', null)`.
  - `setPhase` clears `claimed` and `waitingSinceTSec` only for phases that are not engaged, and `armed` is engaged. So
    `burn.auto.claimed` stays `true` while no thread is held.
  - At the next burn `armedTick` skips the claim (`if (!auto.claimed)`) and fires anyway.
  - So GREEN's trims and ROUND's later burns are never hack-or-burn (03 §3.6: "It holds it to the end of that burn"),
    never show `NEEDS A THREAD … × AN OP`, and fire even with every thread busy.
- **Repro (`rearm-claim.test.ts`, KESTREL, v2 + LOCK 810):**

  ```
  capture burning: claimed true threadsBusy 1
  re-armed after capture: claimed true threadsBusy 0 next rp-high
  trim burning : claimed true threadsBusy 0 firingSource auto
  ```

  `trim-wait.test.ts` reserved both threads for test owners before the trim, and the trim still fired on time.
- **Fix:** `setPhase(store, 'armed', null, { claimed: false, waitingSinceTSec: null })` in `rearm`.
- **Test:** add a check to `autoburn-modes`' GREEN case that the trim holds one thread while it burns and none before its
  claim. Today `flyEngaged`'s `heldWhileWaiting` is only sampled while `!claimed`, so after the first burn it measures
  nothing.
- **Follow-on (not verified, since the bug hides it):** once the claim works for trims, a wait that outlasts the
  trim's apsis leaves `waitingSinceTSec` set. The plan's next burn is then a loop away, `fireIn > AUTO_THREAD_CLAIM_TAC`
  returns before the claim code, and nothing clears the flag, so the strip would say `AUTOBURN NEEDS A THREAD IN 7:xx` for
  a whole orbit.
  - Clear `waitingSinceTSec` when `fireIn > AUTO_THREAD_CLAIM_TAC`.
  - Release the claim when the burn it was made for moves out of the window.

**M2. Inside the 8 tac s claim window the kid cannot fly an IN/OUT correction.** `src/systems/autoburn.ts:509`.

> **Fix pass: fixed.** The preset is selected once, on the way into the claim window; a preset the kid picks after that stands; at the fire moment, with the kid not firing, it takes its preset back. Tested: [A] at T−5, an IN burn, then the capture flies on RETRO.

- **What is wrong:**
  - `if (!playerFiring) selectPreset(store, burnPoint.preset)` runs on every armed tick once `fireIn ≤ 8`.
  - So the kid's [A] (IN) is undone one tick later. When the kid then holds SPACE, the ship fires RETRO, which is a
    takeover (`:473`), and AUTOBURN quits with `AUTOBURN OFF — you have the controls`.
  - 03 §3.6 says AUTOBURN "never steers … the IN/OUT correction … stay[s] the player's", and plan §2.9 says "while
    armed, only the kid firing PRO or RETRO is a takeover (an IN/OUT burn is not, and neither is a preset selection)".
- **Repro (`claim-in.test.ts`, KESTREL, v1):**

  ```
  claimed; sas retrograde strip AUTO-armed AUTOBURN ARMED — it brakes at ▼ in 0:08
  after [A] same tick: sas radial-in
  after one tick: sas retrograde phase armed
  SPACE held: sas retrograde phase idle end takeover firingSource player
  ```

  The suite's own takeover case (`autoburn-modes.test.ts:279-301`) presses [A] before the claim, so it never meets this.
- **Not verified:** on KESTREL the strip had already gone to the ARMED row at T−8. I did not find out whether a
  correction or debris-dodge row can still be on the strip inside the window.
- **Fix:** re-select the preset once, at the claim (or when the kid's preset was AUTOBURN's own), and let a preset the
  kid picks inside the window stand until the fire moment. At the fire moment, either:
  - wait while the kid holds a non-PRO/RETRO preset, the same way it already waits while `playerFiring`; or
  - take the preset back only if the kid is not firing.
- **Test:** an IN correction started at T−5 that does not cancel it.

**M3. At desk 2+, ENTER trains a cell the kid never chose, and sometimes cannot set course.**
`src/components/desk/DeskScreen.ts:421`, `src/components/desk/TrainingWindow.ts:338-348`,
`src/systems/training-model.ts:235` (`defaultSel`). This is the lead's question (b).

> **Fix pass: fixed** by the lead's ruling: `ui.trainingArmed` (a pick this visit), `desk.ts deskEnter` the one rule; the bar shows `TRAIN ▸ n CYCLES [ENTER]` while armed (a click on it trains), the step says `[SPACE]`; ESC or another tab disarms. Tested at the model in `skills/ui-models`; the e2e specs make the first pick by keys.

- **What is wrong:** while TRAINING is open, the model always selects a cell: the first affordable one, else the first
  lost one, else the first dim one. Any selected cell with an action swallows ENTER:
  - if the cell is affordable, ENTER starts the 1.5 s bar and buys it;
  - if it is dim, ENTER buzzes and does nothing (`press` returns `true` after `startTrainingHold` fails).
- Meanwhile the SET COURSE bar still reads `SET COURSE ▸ HALCYON [ENTER]`, and the TRAIN button reads
  `TRAIN ▸ 1 CYCLE [ENTER]`.
- **Repro (`desk-enter.test.ts`):**

  ```
  desk 2 bank 1 default selection autoburn:L1 affordable action {"kind":"train","cost":1,"label":"TRAIN ▸ 1 CYCLE [ENTER]","enabled":true,…}
  ENTER starts the bar: true
  ```

  A kid who opened [T] to look and pressed ENTER to sail buys LOCK 270. With a bank too small for anything, ENTER buzzes,
  and only SPACE or a click sets course. The opposite mistake (setting course while meaning to train) only happens when
  the selected cell has no action (owned, pending or closed), so it is the rarer one.
- **It is recoverable:** UNDO works until TRANSMIT, and the PACKET shows a locked `TRAINED HERE` chip. But it is a silent
  spend on the desk's main key.
- **Fix options** (the designer's call; see "For the designer" Q2):
  1. With TRAINING open, show `[SPACE]` on the SET COURSE bar and let ENTER train only a cell the kid selected (a click,
     [1]/[2], ↑↓). Give the default selection no action until it is confirmed, and fall through to SET COURSE when the
     cell is not affordable.
  2. Make TRAIN a real hold: ENTER held for 1.5 s, and a release cancels it.

  Either way, a disabled action should not swallow ENTER without saying why on the strip.

**M4. SET COURSE while the TRAIN bar fills leaves a ghost purchase.** `src/components/desk/DeskScreen.ts:262-277` (`go`),
`src/components/desk/TrainingWindow.ts:311`, `:320-332`.

> **Fix pass: fixed.** `goTransmit` clears a filling bar and disarms; tested (SET COURSE mid-bar, then ◀ CHART: nothing lands).

- **What is wrong:** `go` (SPACE, or a click on the bar) does not cancel `ui.trainingHoldSec`.
  - On the PACKET the bar freezes (`onFrame` returns outside the desk). The purchase is not made and not in the packet,
    although the kid heard the chirps.
  - After ◀ CHART, `paint()` sees `hold !== null`, restarts the frame loop, and the purchase lands with no input.
- **Repro (`desk-enter.test.ts`):**

  ```
  SPACE mid-bar: phase transmit hold 0 pending 0
  ◀ CHART: hold 0 → the view resumes the bar: done pending [{"skill":"autoburn","kind":"lock",…}]
  ```

  (TRANSMIT clears it, because the next ship's world reset rebuilds `ui`.)
- **Fix:** while a bar fills, either refuse `go` with a buzz, or cancel the bar in `go`. Call `cancelTrainingHold` in
  `setCourse`'s UI path, or clear `trainingHoldSec` in `goTransmit`.

### Minors

**m1. A spurious `AUTOBURN v2 RESTORED` stamp and sparkle after the kid moves or repairs a healthy skill file.**
`src/systems/skills.ts:288-301`. Found by reading; the watcher's sequence is in `training-flow`'s own checks.

> **Fix pass: fixed.** The watcher measures a spell offline from the version before it to the one after (`training-flow` covers the top-up REPAIR, a v1 repaired to v2, and a file that comes back dead).

- **What is wrong:**
  - Going offline (v2 → 0) is rightly silent.
  - Coming back (0 → v2) satisfies `to >= full`, so it stamps RESTORED and plays `driverSaved`, although no version was
    lost to damage. An `mv` of a healthy AUTOBURN.skl, or a top-up REPAIR from 85%, both celebrate.
- **Fix:** stamp RESTORED only when the step up crosses from a damage-lowered version (keep the last non-offline version
  per skill in the watcher), or stay silent when `from === 0` was an offline fall.

**m2. Repairing an armed AUTOBURN sounds the klaxon with `AUTOBURN.skl DAMAGED — MANUAL`.** `src/systems/autoburn.ts:466`.

> **Fix pass: fixed.** A new end, `'offline'`: idle, no klaxon, `AUTOBURN OFF WHILE IT IS REPAIRED — you have the controls` (per offline reason). Tested.

- **What is wrong:** `live.version === 0` while the file is offline ends the engagement `'dropped'` / `'damaged'`. 03 §3.5
  makes repair-offline a real choice, but the kid caused this one, and the words say "DAMAGED".
- **Fix:** use a `'offline'` end with its own line (`AUTOBURN OFF WHILE IT IS REPAIRED`), no klaxon, or at least read
  `live.offline` for the wording.

**m3. The `'autoburn-in-lock'` chime can repeat inside the bracket.** `src/systems/autoburn.ts:598-604`.

> **Fix pass: fixed.** `inLockRange` reads the mode's first burn against the effective lock range; the refusals that mean "can't fly at all" stay out. Tested (two IN corrections inside the bracket, one chime).

- **What is wrong:** `inLock` is `refusal === null || skipping`. Inside the bracket the refusal flips to `burning` while
  the kid fires (an IN correction), to `paused`, or to `reserve`, then back. Every flip back chimes again.
- **Fix:** compute "inside the LOCK range" from the burn's time against `lockRangeTac` alone, not from the whole refusal.

**m4. Plural slips.**

> **Fix pass: fixed** (`1 CAPTURE`, `[B]`).

- `src/data/skill-text.ts:188` `AUTOBURN_SKILL_ROW.trained` reads `FROM YOUR 1 CAPTURES`.
- `AUTOBURN_SKILL_ROW.effect` writes `press B` without the key's brackets (`[B]` everywhere else).

**m5. The TRAINING strings are capture-only, and 4c will trip over them.**

> **Fix pass: fixed.** `DEMO_SOURCES` per demo kind, `DEMO_WORDS` (AUTODROP: landings), the bar and the head count per kind, the boot lines take the kind.

- **What is wrong:**
  - `TRAINING_TEXT.demos`, `fromDemos` and `BOOT_SKILL_TEXT.captures` hard-code "capture".
  - `training-model.ts:200` passes `state.run.stats.demos.length` (captures) as the hold text's count for every skill.
  - AUTODROP v1 would read `TRAINING AUTODROP v1 · from your 1 capture`.
- **Fix:** take the demo kind from `SKILL_TREE[id].demos` and the count from `skillDemos`, and add AUTODROP's word now
  or in 4c.

**m6. The v2 one-time tutorial line is missing.**

> **Fix pass: fixed.** `tut-autoburn-v2`, once, the flight's (as READY); READY steps aside while v2 works. Tested in `autoburn-modes`.

- 03 §4 asks for `AUTOBURN v2 — [B] makes it green. [B] on green makes it round.` the first time v2 can act.
- FLIGHT asked the lead for it. It is not in `script.ts`; only the AUTO button's tooltip (`skill-text.ts:147`) carries
  the rule.

**m7. Dead code.**

> **Fix pass: fixed** (both deleted).

- `src/systems/not-built.ts` has no callers. FOUNDATION deviation: "the batch review deletes that file once nothing
  calls it".
- `training.ts:22 FIRST_PICK_ENFORCED` is now a constant `true`, still read in four places (`desk.ts firstPickWaits`,
  `training-model.ts:358`, the suite's support helpers).
- **Fix:** delete both and fold the switch away.

**m8. The view timings live outside `tuning.ts`.**

> **Fix pass: fixed** (`tuning.ts`, with their WHYs).

- **Where:** `TRAINING_HOLD_SEC` (training-model.ts:40), `BANK_ROLL_SEC`, `HOLD_CHIRP_SEC` (TrainingWindow.ts:46-48),
  `REPORT_CYCLES_START_SEC` (LandingReport.ts:46), `SKILL_FLICKER_MS` (Stamp.ts:69).
- **What is wrong:** AGENTS.md puts tuning numbers in `tuning.ts`. UI deviation 2 explains the choice, but the
  neighbouring `REPORT_*` numbers already live in `tuning.ts`, and 03 §4 names the 1.5 s and the 400 ms as design numbers.
- **Fix:** move them, now that FOUNDATION's ownership split is over.

**m9. The first desk's TRAINING overrides the REPOSITORY's last-rm prompt.** `src/systems/run.ts:361`.

> **Fix pass: left as a choice**, named in the plan's review-fix deviations (ship 1 is calm: no seed can take the last rm before desk 1).

- **What is wrong:** `firstPickDue ? 'training' : deskWindowOnOpen(state)` drops 3b's last-rm tab at desk 1 without a
  word.
- **Fix:** acceptable as a choice. Name it in a deviation, or open the REPOSITORY after the pick.

**m10. TransmitScreen slices TREE's chip note at `'→'`.** `src/components/run/TransmitScreen.ts:117`.

> **Fix pass: fixed.** `SkillChip.without`; the view composes `PACKET_SKILL_TEXT.loss`.

- **What is wrong:** the UI parses the words to show only `→ brake by hand · RESTORE 5`. A reword would break it quietly.
- **Fix:** give `SkillChip` the `without` text and the RESTORE price as fields, and let UI compose them.

**m11. `trainedChips` derives the fresh file's preview id itself.** `src/systems/transmit.ts:570-581`.

> **Fix pass: fixed.** `trainedChips` reads `packet.skills` (`how === 'fresh'`).

- **What is wrong:** it calls `skillFile(…, PREVIEW_ID)` instead of reading `packet.skills`. That works only while
  `planPacket` names fresh files the same way.
- **Fix:** read the ids from `transitPacket(state, plan).skills` (`how === 'fresh'`).

**m12. A new runtime import cycle.** `src/systems/landing-orbit.ts:12` ↔ `src/systems/landing-rules.ts:13-17`.

> **Fix pass: fixed.** `burnSpanBlocks` moved into `landing-rules.ts` (`burnSpanClear` had no callers and went).

- **What is wrong:** `burnSpanBlocks` imports `driversThatCanEverLaunch` and `lzRemaining`. Both sides use only
  functions, so it loads today. But TREE deviation 1 shows how such a cycle breaks the load order (`layoutFor`
  undefined).
- **Fix:** pass the room and the "a pod can launch" bit into `burnSpanBlocks` from its callers, or move it into
  `landing-rules`.

**m13. The per-tick planner work in LANDING is unmeasured.** Found by reading.

> **Fix pass: left** for 4e (it adds `highestFittingRadius` here and should memoise `roundAim` per prediction then).

- **What is wrong:** while a v2 file is aboard, `lockTick` calls `autoburnRefusal` every post-tick. In LANDING that runs
  `roundAim` (two `planModeBurn` and `burnSpanBlocks` over three passes) plus `previewModeBurn`. The HUD's
  `autoOfferMode`, the guidance and `lockBracket` repeat it each frame.
- **Fix:** probably cheap, since everything comes from scalars, but 4e adds `highestFittingRadius` here. Memoise
  `roundAim` per prediction (`pred.asOfTSec`) before 4e.

**m14. `firstDesk` has two predicates.**

> **Fix pass: fixed.** `skill-tree.ts isFirstDesk` / `firstPickOwed`; `deskSteps`, `deskBlocker`, `run.ts` and the model read them.

- `desk.ts:614` uses `route.length === 1`. `skill-tree.ts`, `run.ts` and `training-model.ts` use
  `visitNow(run) === 1` (`ships.length`).
- They agree today. Use one helper (`skill-tree.ts deskBlocker` / `firstPickDue`), so a later debug jump or a migrated
  route cannot split them.

---

## For the designer

1. **(a) A GREEN trim in LANDING ignores the LZ windows** (FLIGHT deviation 1).
   - **Fix pass:** kept as built; the press says `AUTOBURN: GREEN COSTS LZ-x's WINDOW` (lead decision 5). Tested.
   - **My reading:** acceptable as built, with a warning. The trim fires once, not every pass. Moving it to the other
     apsis would fix the other end of the loop, and waiting cannot help on a planet that does not rotate. So the cost is
     one window pass on one LZ, plus a few seconds of launch refusal.
   - **Recommend:** use ROUND's radio line at the press (`AUTOBURN: GREEN COSTS LZ-B's WINDOW`) from the same
     `burnSpanBlocks` check, so the kid can drop that window first and press [B] after it. Do not adopt the other-apsis
     rule for GREEN.
   - **Not measured:** how often an accepted landing orbit's trim crosses a window.
2. **(b) ENTER at the desk** (M3).
   - **Fix pass:** answered by the lead (M3).
   - **What happens now:** a kid can spend cycles by mistake. It can be undone, but nothing says so loudly. The opposite
     mistake is rare.
   - **Question:** should ENTER at desk 2+ be SET COURSE only, with TRAIN on a click or a key of its own? Or should TRAIN
     be a true hold-to-train, which is what "the bar fills over 1.5 s" suggests?
   - **Recommend:** keep ENTER = TRAIN only on visit 1 (where SET COURSE is blocked anyway), and at desk 2+ train only
     from a cell the kid selected, with the bar's key reading `[SPACE]` while TRAINING is open.
3. **ROUND re-aimed to ▲'s altitude raises the orbit** (FLIGHT deviation 1). 03 §3.6 rounds "at ▼'s altitude".
   - **Fix pass: measured** (plan, review-fix deviations): on KESTREL, HALCYON and VESPER no LZ goes from fitting to not; VESPER's narrow LZ-C is under 4 tac s at both apsides. Behaviour unchanged.
   - **The trade:** the other-apsis rule rounds at ▲, so the orbit climbs on the ▼ side and the drop dot widens with
     altitude (01 §3.3). It keeps one window, but it can make a narrow LZ stop fitting on every pass, which is worse than
     losing one window.
   - **Measured:** KESTREL lost no window.
   - **Not measured:** whether the fit survived.
   - **Recommend:** re-aim to ▲ only when every LZ with room still fits at that radius (`sureTacAt` ≥
     `LANDING_SURE_MIN_TAC`), else round at ▼ and say which window it costs. Alternatively keep ▼ and only warn.
4. **A lost ship's +1 is never shown.**
   - **Fix pass:** the LOST card shows the cycles line (same model).
   - **What happens now:** the cycles line is a LANDING REPORT line, and BEAM OUT and EMERGENCY ships have no report.
     Their ARRIVED +1 reaches the bank silently. At desk 1 the house top-up then shows `+2`, so the kid sees "3"
     appear from "+2".
   - **Question:** should the LOST card, or the desk's TRAINING head, say `+1 CYCLE · ARRIVED`?
5. **The AHEAD row drops SITE DATA** (UI deviation 6).
   - **Why:** POOR plays like GOOD until slice 6.
   - **Recommend:** fine for 4a+4b. Note that slice 6 must restore it, and 03 §4's example line is longer than 70
     characters with it, so it will need a second line or shorter words.
6. **Damaged files heal through PACK AS.**
   - **Fix pass:** behaviour kept; 03 §3.3 counts a PACK AS as a loss that RESTORE answers (see the plan's note for the designer).
   - **How:** a 64% AUTOBURN v2 (works as v1) can be packed as v1, then RESTOREd at the next desk for 3 cycles. It comes
     back as a fresh v2 at 100%, cleaned.
   - **Why it happens:** that is 03 §3.3's "new code heals" applied to PACK AS, and REPAIR would cost about 3 charge
     instead.
   - **Recommend:** keep it, since it costs cycles and a version for a ship. Flag it for the playtest, next to R7.

---

## Architecture (4c AUTODROP, 4d SENTRY, 4e AUTOBURN v3)

> **Fix pass:** the scattered edits below are now data or one home each: `DEMO_SOURCES` / `DEMO_WORDS` / `TRAINING_DEMO_ART`
> (skillDemos, the words, demoSvg), `skills.ts SKILL_ROW_HOOKS`, `autoburn.ts MODES_BY_VERSION` / `stoppedLine` /
> `AUTOBURN_SKILL_ROW.armed[mode]` (an unknown mode or version throws), `restoreCostOf`, `isFirstDesk` / `firstPickOwed`,
> `fileWorksAs`; m10, m11 and m12 are fixed; `flying` and `captured` are in `burn.auto` (save v3). Left: the preview's
> FILES head (`fit.files − heldSkillBlocks`), `AUTO_MINI_TEXT.armed`'s kinds (4e), m13.

**What is data-driven and will extend cleanly:**
- **The tree:**
  - `SKILL_TREE` / `SKILL_IDS` / `skillBlocks` / `levelPrice` and the validator;
  - `treeCells` and `trainCell` (one rule for look and buy);
  - `openBranchesAt` and `branchToLatch` (raise `built`, and the 'start', 'after-seeds' and 'poor-ahead' rules apply);
  - `held` / `paid` / `lostLevels` / `restorePrice`;
  - RESTORE and PACK AS (`lowerLevels`, `skillRelief`), the packet plan and the boot lines.
- **Effective versions and words:**
  - effective version and lock (`capabilities.ts`), the watcher, the stamps, the tick zones (`skillTickZones` reads
    `effectiveVersion`);
  - the version badge;
  - TRAINING's cards (visit 1 shows every open root, so AUTODROP's card appears when `built` rises);
  - the cells' NEXT SHIP words (`TRAINING_TEXT.skills`) and the PACKET's `without` words.
- **The save:** checked per `SKILL_IDS`.
- **4e's planner:** `planToCircle`, the `'landing-orbit'` mode in `computePrediction` and `planModeBurn`, and
  `MODE_NEEDS`. 4e needs no planner surgery, as planned.

**Where a new skill or version still needs scattered edits** (list these in the 4c / 4e plans):
- `skill-tree.ts:248` `skillDemos`: `demos === 'captures' ? autoburnDemoSkill : null`. Make it a
  `DEMO_TUNING: Record<'captures' | 'drops', DemoTuning>` with a stats field per kind.
- The capture-only words in training-text and boot (m5).
- `skills.ts:267-273`: `id === 'autoburn'` picks the title, effect and status. Make it a
  `SKILL_STATUS: Partial<Record<SkillId, (state) => Status>>` registry, so 4c and 4d register `autodropStatus` and
  `sentryStatus` instead of growing a ternary.
- `TrainingWindow.ts:53` `demoSvg`: a switch on `'autoburn-1'` strings. New skills fall to the plain loop. Move the
  per-cell demo kinds into data.
- `autoburn.ts`:
  - `autoModeFor` (`:132`) branches on `version === 1` / `≥ 2`;
  - `autoburnStatus`'s armed text (`:116`) knows only green and round;
  - `endLine` and `AUTO_MINI_TEXT.armed`'s kinds have no landing-orbit case.

  4e will touch all four. That is expected, but a `MODE_WORDS: Record<AutoMode, …>` table would keep it in one place.

**Duplicated logic:**
- **RESTORE's price for a skill now** is composed three times:
  - `training-model.ts:194 restoreCost` (held);
  - `transmit.ts:539 restoreAt` (a level);
  - `skills.ts:243` (fileLevel).

  Add `restoreCostOf(state, id, level?)` to `skill-levels.ts`.
- **"First desk / first pick"** has five readers:
  - `deskBlocker`;
  - `run.ts firstPickDue` and `firstPickTopUp`;
  - `desk.ts firstPickWaits`;
  - `training-model`'s inline `blocked` / `picked` / `firstPick`;
  - `deskSteps`' `firstDesk` with its own predicate (m14).

  Keep `deskBlocker` and one `isFirstDesk(run)`, and delete `FIRST_PICK_ENFORCED` (m7).
- **What a file works as** (offline → 0, else `effectiveVersion(version, band)`) is written twice: in
  `capabilities.ts skillLive`'s per-copy read and in `skills.ts skillFileView`. Export one `fileWorksAs(seg)`.
- **The preview's FILES head** is `fit.files − heldSkillBlocks(state)` (`training-model.ts:259`), a second derivation
  of the skills' share. Reading `packet.skills` / the plan's fresh levels would keep it right if the desk ever previews
  PACK AS or a grant.

**Ownership:**
- **What is clean:** UI reads TREE's models; FLIGHT's `autoburnStatus` is read by UI's row.
- **Leaks:** m10 (UI parses TREE's words) and m11 (TREE re-derives `planPacket`'s ids).
- **Lead requests still open:** the v2 tutorial (m6), and AGENTS.md's "AUTOBURN v2 … designed but not built".

**Module-level state** (FLIGHT deviation 7: `flying`, `captured`, `wasInLock` in `autoburn.ts`; the watcher's closure in
`skill-files.ts`; `cachedAuto` in `predict.ts`):
- **Safe today.** Saves are written only at RUN START, SHIP DONE, BEAM and the ending (`writeRunSave` callers:
  `run.ts:263`, `:333`, `:637`, `boot.ts:298`).
- **Why a reload is safe:** a reload mid-ship replays from the boot through `resetWorldForShip` → `resetWorld()`. That
  runs autoburn's `onWorldReset` (all three flags cleared), `createShipSlices` rebuilds `burn.auto` at idle, and
  `resumeRun` resets too (`run-save.ts:138`, `:182`).
- **The watcher:** keyed by `run.rev`, silent on a ship's first tick.
- **Latent risk for 4c / 4e:**
  - If any later slice adds a save inside a flight or a landing (4c's `landing.autodrop` bump is the likely place),
    `flying` must move into `burn.auto`. `burnTick` throws `burning with no burn in hand` (`autoburn.ts:522`) when
    `phase` is pointing or burning and `flying` is null.
  - `captured` changes the hand-back words.
  - `ui.trainingHoldSec` is not saved, which is right, but it outlives a SET COURSE (M4).

**Import cycles:** one new (m12). The old `say` / `actions` / `orbit-sim` cycle predates the batch. The skill modules
themselves are acyclic: TREE's `skill-levels.ts` leaf works.

---

## Tests

**Timings** (this run, 4 workers):

| Suite | Time |
|---|---|
| `skills/autoburn-modes` | 12.2 s |
| `skills/lock-range` | 4.3 s |
| `skills/cycles` | 1.1 s |
| `skills/guidance-auto` | 0.9 s |
| `skills/foundation` | 0.9 s |
| `skills/packet` | 0.7 s |
| `skills/training-flow` | 0.7 s |
| `skills/ui-models` | 0.7 s |

- The new suites add about 21 s of CPU, well inside the 265 s budget against today's 105–187 s.
- The wp9 trio is 6–8.5 s each, down from 20–23 s.
- No suite is slow.

**Gaps on the risky paths:**

> **Fix pass:** M1 (the later burns' claim, a trim's wait), M2 (a correction in the window), the desk's key routing and
> SET COURSE mid-bar (at the model), and the watcher's offline spells are covered now. Still open: RESUME at a SHIP DONE
> desk with a lost skill, a downgrade during a GREEN trim or an armed ROUND in LANDING, ROUND flown at ▲ (its fit is
> measured in the plan, not flown).

- The claim for v2's later burns (M1), and an IN/OUT correction inside the claim window (M2). Both are missing from
  `autoburn-modes`.
- A GREEN trim (not a capture) whose thread wait outlasts its apsis (M1's follow-on).
- The desk's key routing: ENTER with TRAINING open at desk 2, with an affordable or a dim default; SET COURSE while the
  bar fills. Nothing covers `DeskScreen` / `TrainingWindow` key routing headless. A `ui-models`-level check of
  `defaultSel` plus `press` semantics would catch M3/M4, or the e2e `map-desk` could.
- **RESUME at a SHIP DONE desk with a lost skill:** the save round-trip of a `bought` whose file is gone, and RESTORE
  offered after the reload. `training-flow` reloads desk 1 and the BEAM only.
- A downgrade v2 → v1 during a GREEN trim and while ROUND is armed in LANDING (`'downgraded'`, `downgradedRound`). Only
  the mid-capture case is tested.
- The watcher's RESTORED stamp after an offline fall from a healthy file (m1): `skillVersionStamp` has no test for
  `from === 0`.
- ROUND's other-apsis rule is checked as an aim (`roundAim`), not flown. No check reads the LZ fit after the climb to ▲
  (designer Q3).

---

## Words

- **Length:** every TRAINING, PACKET, BOOT, AUTOBURN and Skills-row string I evaluated with worst-case arguments is
  ≤ 70 characters.
  - The longest: `NEXT SHIP: [AUTO · B] LIGHTS UP · IT BRAKES WHILE YOU'RE IN THE MIND` (68), and
    `NEXT: GOOD HOPE · ARK · 16 PODS · MEMORY 384 COMPACT · NOISE SEVERE 3` (69).
  - The suites' `support/words` checks agree.
- **No hard-coded player strings** in the new components and systems. The literals that remain (`'TOO WIDE'` in
  guidance) predate the batch.
- **Glossary:** no "XP", "points", "tech tree" or "upgrade" for a skill on screen. One inconsistency: the refusal key
  `AUTOBURN_REFUSAL.untrained` is still `NOT TRAINED YET` (`skill-text.ts:82`), shown as the AUTO button's tooltip,
  while the strip says `NO AUTOBURN — train it between ships`. Make the short form `NO AUTOBURN YET` or `NOT TRAINED`.
- **Slips:** m4.

> **Fix pass:** `AUTOBURN_REFUSAL.untrained` reads `NO AUTOBURN YET`.

