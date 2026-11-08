# Slice 7a THE ENDING: independent review

> **Fix pass (2026-11-08):** every finding below is marked FIXED, DONE, NOTED or OPEN; the details are in
> `slice-7-plan.md`, "Deviations (7a review fixes)".

Reviewed: `git diff 2625aa4..int-7a` (the FINALE, CARD and NIGHT tracks, merged; head 2672e26) in the worktree
`.claude/worktrees/int-7a`. The foundation (a0fd347..2625aa4) was read only where the new code stands on it. Sources: plan §0
(R1–R42), §2.7–§2.12, every Deviations section (7a foundation, its review follow-up, FINALE, CARD, NIGHT); 05 §3.7/§3.12;
OPEN-DECISIONS 39–51; AGENTS.md.

**What I ran**
- `npm run typecheck`: clean.
- The quick tier, once (below): 210 passed, **1 failed** (`ending/card-models`, item (a)), 11 balance-only skipped, **229 s**.
- A headless probe (scratchpad `probe/merge-sunset.test.ts`, on the FINALE suite's own setup): MERGE + SUNSET with one
  eaten driver, through `'last-landing'`.
- Playwright against the worktree's dev server (`?seed=7&debug`, the real card, real keys and taps, 1440×900 and
  390×844), scratchpad `pw/finale.mjs` and `pw/reload.mjs`:
  - MERGE + REASSIGNMENT (no eaten driver: verdict → `'done'`);
  - SPARE + REASSIGNMENT on the phone (SUNSET greyed);
  - UNRESOLVED (every DELETE taken) → IT FOLLOWED YOU → ENTER → STAY, on the phone;
  - a reload at step 2 (R14);
  - each run through the report, the tally, the epilogue, the final card, NEW RUN and the title.
  - No page errors in any of them.
- No e2e tier.

**Verdict in one line:** no crash, softlock or broken save found in the paths a player can reach. The tier is red on one
stale test check (B1). Three majors need a lead decision before the e2e pass:
- MERGE's reopened landing leaves the engine open (M1);
- the verdict and the epilogue disagree about CONTROL's compliance (M2);
- the card has a duplicate DOM id that the e2e plan taps (M3).

---

## The tier time (h)

| | |
|---|---|
| Wall time | **229 s**, quick, 4 workers (budget 265 s, cap 300 s) |
| Load average when it started | 2.08 / 7.07 / 8.35 (1 / 5 / 15 min). Other agents' baseline was about 2. |
| Load average while it ran | 1 min: 7.3–8.3 (sampled every 15 s). 5 min: 7.6–7.8. 15 min: 8.3–8.4. |

Slowest suites: `skills/autodrop-review` 35 s, `skills/landing-v3` 34 s, `skills/autoburn-modes` 28 s, `survey/flow` 22 s,
`residents/sleeper` 22 s, `wp12/fix1/entries` 20 s, `skills/autoburn-v3` 19 s, `residents/corrupted-flow` 19 s,
`map/run1-route` 18 s, `landing/review-1b` 17 s.

7a's new suites:

| Suite | Time |
|---|---|
| `ending/finale-flow` | 8.7 s (the plan says about 6 s) |
| `ending/epilogue` | 1.3 s |
| `ending/foundation` | 1.6 s |
| `ending/rules` | 0.9 s |
| `ending/card-models` | 0.7 s |

That is about 12 s of CPU against R42's +4 s for 7a: about +3 s of wall on 4 workers.

**No trim is needed** at 229 s. If a later run under heavy load passes 265 s, these are the first candidates:
- `skills/autodrop-review` and `skills/landing-v3`: 70 s between them. Sample their grids more coarsely in quick mode, as
  the runner's header allows.
- `finale-flow`: its classic LAST LIGHT pass could share `flyOnce` with `wp11/merge-test`, which already flies the
  classic duel.

---

## Blockers

### B1. The tier is red: `ending/card-models` "FUEL notch: its own title while the two steps are not built" (a)

> **FIXED** (a404130): wrapped in `withEndings({ twoStep: false }, …)`, the suite borrowing `support/finale.ts withEndings`; the check then went with the gate in (e) (60a47be).
- **Where:** `tests/unit/ending/card-models.test.ts:282`.
- **Problem:** the check reads the live gate, and FINALE raised `twoStep`.
- **Fix** (one line, the same shape as its neighbours):
  ```ts
  check('FUEL notch: its own title while the two steps are not built', withGates({ twoStep: false }, () => fuelStarTitle(flying(30, true))) === null);
  ```
  While you are there: the suite's own `withGates` (`:41`) duplicates `support/finale.ts withEndings`. Import that one
  instead.

---

## Majors

### M1. MERGE's reopened landing (`'last-landing'`) opens the engine too, so SUNSET's FUEL and "the empty ship" stop holding

> **FIXED** (33d4c7d; lead: the lock): `engineOpen` is false at `'last-landing'` and `goLowAimNow` offers nothing there. `finale-flow` flies MERGE + SUNSET at FUEL 22% with an eaten driver: the throttle refused, no FUEL burned under a forced throttle, the report's FUEL equals the record's; `ending.mjs` holds [SPACE] there in the page.
- **Where:**
  - `src/systems/finale.ts:402–413` (`reopenLanding`), `:507–518` (`verdictDone`);
  - `src/state/selectors.ts:269–273` (`engineOpen`: open whenever `landing.ended === null` in orbit);
  - `src/systems/ending-rules.ts:201` (the record's `fuelPct`).
- **Seen** (probe): MERGE at 30 charge with POD 01 eaten, then SUNSET at FUEL 22%:
  - the confirm writes `record.fuelPct` 22;
  - after the verdict, `'last-landing'`, `engineOpen` is true and `goLow` is offered afresh;
  - a burn down to 0.05% is accepted, and the landing ends again with `fuelAtEndPct` 0.05;
  - the record still says 22.
- **What the player sees:**
  - The strip can offer GO LOWER in the reopened landing. The kid burns.
  - The report's FUEL star then reads the new tank.
  - The epilogue says `LAST LIGHT left orbit with two caretakers and 22% fuel.` The ship may have left with under 20%,
    which is SUNSET's own price.
  - With the engine open, the kid can also fly the ship into the planet (`endNow('ship-lost')`) after choosing SUNSET.
    (Not reproduced. The engine is open, so nothing stops it.)
- **Fix** (7a only; 7b's R26 locks every key but ENTER, P and M anyway): close the engine while the interim last landing
  runs.
  ```ts
  return state.run.phase === 'landing' && state.landing.ended === null && inOrbit && state.hollow.finale.phase !== 'last-landing';
  ```
  Also stop `goLowTick` offering in that phase. If you would rather keep the engine, re-freeze `record.fuelPct` at
  `'last-landing'` → `'done'`. That needs an M4 exception, so I prefer the lock. Add a `finale-flow` check: MERGE +
  SUNSET with one eaten driver, engine closed in `'last-landing'`, `record.fuelPct` equals the report's FUEL.

### M2. CONTROL contradicts itself a minute apart: the verdict and the epilogue use different compliance rules

> **FIXED** (1d7f9c0; lead: 05's rule): `ending-rules.ts controlCompliant(hollow, you)`, non-compliant exactly for SPARE, SUNSET, STAY or CONTACT. The verdict and the epilogue read it; `ending/epilogue` checks both lines agree for all 15 endings. OPEN-DECISIONS 56.
- **Where:**
  - `src/systems/finale.ts:441`: compliant iff (PURGE or UNRESOLVED) with REASSIGNMENT (FINALE Deviation 4);
  - `src/systems/epilogue.ts:211–215`: compliant iff REASSIGNMENT (NIGHT Deviation 6);
  - R33 and 05 §3.8 for 7c's wild seed: non-compliant iff SPARE, SUNSET, STAY or CONTACT. So MERGE with REASSIGNMENT is
    compliant there.
- **Seen** (browser):
  - MERGE + REASSIGNMENT: the verdict types `Unit 47 is non-compliant. :)`; the epilogue ends `ARRIVAL CONTROL: Thank you,
    Unit 47. Your next post is RELAY 20. :)`.
  - SPARE + REASSIGNMENT: the same pair.
- **Fix:** one pure predicate, `ending-rules.ts controlCompliant(hollow, you): boolean`. The verdict, the epilogue's last
  line and 7c's R33 seed all read it. Which rule it holds is the designer's call (below). I recommend 05's and R33's:
  compliant iff REASSIGNMENT and step 1 is not SPARE. That keeps WP11's "MERGE is non-compliant" only if the designer
  wants it, and it must then be the rule in all three places. Add an `ending/epilogue` check that the epilogue's CONTROL
  line equals the verdict's for all 11 combinations.

### M3. Duplicate DOM id `fcStay`: the STAY row and STAY's sub-row container

> **FIXED** (4e4db09): the container is `#fcStayPick`.
- **Where:**
  - `src/components/run/FinaleChoice.ts:88` (`rowId('stay')` → `fcStay`) and `:157` (`requireById('fcStay')`);
  - `index.html:531` (`<div class="fc-stay-pick" id="fcStay" hidden>`).
- **Problem:**
  - Once step 2's rows exist, `document.getElementById('fcStay')` returns the row button, because `#fcOptions` comes
    first in the document.
  - Playwright's `#fcStay` fails strict mode (seen).
  - CARD's Deviation 10 promises the e2e `#fcStay` as the row.
  - The card itself works only because it looks the container up once, at mount, before any row exists.
- **Fix:** rename the container to `id="fcStayPick"` (index.html and `requireById('fcStayPick')`), so every row keeps
  `#fc<Piece>`.

---

## Minors

- **m1. The record-before-`'done'` check and its comments are stale (c).**
  - **Where:** `save-codec.ts:1011–1012` and `:1027–1029`; `ending-rules.ts:180` ("in the same update as 'done'").
  - **Problem:** the confirm writes the record at `'verdict'` (FINALE Deviation 11). The codec refuses a record at any
    phase but `'done'`, which is right only because no save point falls in `'verdict'` or `'last-landing'`.
  - **Fix:** make the invariant the machine's own, and fix both comments:
    ```ts
    // Review M4 / FINALE D11: the record is frozen at the confirm ('verdict'), so it stands through 'verdict',
    // 'last-landing' and 'done' (no save point falls in the first two: R14), and before the confirm there is none.
    const decided = finale.phase === 'verdict' || finale.phase === 'last-landing' || finale.phase === 'done';
    if (!decided) return record === null ? null : `an ending record before the confirm ('${finale.phase}')`;
    ```
    The rest of the check stays as it is. ENDING CHOSEN already requires `'done'`, and SHIP DONE requires `'none'`.
  - **FIXED**: the codec takes the record at `'verdict'`, `'last-landing'` and `'done'`; both comments fixed; `finaleRefusal` exported and checked at each phase in `ending/foundation`.
- **m2. The codec's STAY ★ check is still missing (c, FINALE patch 1).**
  - **Where:** `save-codec.ts:1023`, which checks only that the slot is a ship of the run.
  - **Fix:**
    ```ts
    if (finale.stay !== null) {
      const ended = run.ships.find((ship) => ship.slot === finale.stay);
      const onTarget = ended !== undefined ? shipOnTarget(ended) : finale.stay === slot && podsOnTarget(landing.pods);
      if (!onTarget) return `STAY names slot ${finale.stay}, not a ★ ON TARGET ship of this run`;
    }
    ```
    - `shipOnTarget` is `ending-rules.ts:53`.
    - `podsOnTarget(pods: readonly PodRecord[])` is a new pods-only core in `landing-rules.ts`. `onTargetTally` (`:835`)
      and `shipOnTarget` should both call it, so the ★ rule lives once, not three times.
  - **Why the final ship's pods are enough at ENDING CHOSEN:** the tally there is never lower than at the confirm. Pods
    restored by MERGE only add soft LZ landings, since every colonist already counts in the denominator.
  - Check `support/import-guard` for a cycle: save-codec would import ending-rules.
  - **FIXED**: `landing-rules.ts onTargetEarned` / `podOnTarget` / `podsOnTarget` (one rule); `onTargetTally`, `shipOnTarget` and the codec read it; two new codec refusals checked. No import cycle (import guard green).
- **m3. The strip under the verdict (d).**
  - **Where:** `src/data/script.ts:2395–2401`.
  - **Problem:** with the card typing the verdict, the strip falls back to whatever is live. On UNRESOLVED (every seed
    stays) that is `[TAB], A SEED — no rm aboard: REPAIR or MOVE the file away` (seen), an order the kid cannot follow
    under a modal. On PURGE it read `ALL PODS AWAY`.
  - **Fix:** yes, add a line. Widen `finale-choice` to `'verdict'` with its own words:
    `text: (ctx) => ctx.state.hollow.finale.phase === 'verdict' ? FINALE_TEXT.stripVerdict : FINALE_TEXT.strip`, where
    `stripVerdict` is for example `THE FINALE — click or [SPACE] to go on`. `'last-landing'` needs none: the landing's
    own lines are right there.
  - **FIXED**: a `'finale-verdict'` rule with `FINALE_TEXT.stripVerdict` (`THE FINALE — click or [SPACE] to go on`); a rule of its own because a rule's text sees only `vars`.
- **m4. `FINALE_TEXT.fuelStar` is dead and the wrong shape (e, CARD's ask).**
  - **Where:** `finale-text.ts:73` (a string nobody reads); `finale-card.ts:290–295` composes the notch's title itself.
  - **Fix:** `fuelStar: (have: number): string => ...` returns both lines (`★ 20% · SUNSET: Take the empty ship and go.`
    plus `price.fuel(have)` or `needs.fuel(have)`). `fuelStarTitle` calls it. Add `verdictTag: 'ARRIVAL CONTROL'` and
    `verdictHint: 'click or [SPACE] to go on'`, and point `finale-card.ts:277` and `FinaleChoice.ts:458` at them, so
    HOLLOW_FINALE's `controlTag` and `endingHint` can go.
  - **FIXED**: `fuelStar(have)` returns the notch's two lines and `fuelStarTitle` returns it; `verdictTag`, `verdictHint` moved to FINALE_TEXT, HOLLOW_FINALE's copies deleted.
- **m5. UNRESOLVED's card can open over a falling pod.**
  - **Where:** `finale.ts:309–332`, `:716`, `:720`.
  - **Problem:** `unresolve` runs when `landingOver`, which is true once `landing.ended` is set even with a pod still
    falling (END LANDING mid-drop). The card then comes after the line types, not after the landing settles. R6's rule
    ("no pod falling: a touchdown bell under a card that asks a question reads like an answer") is skipped on this path.
  - **Fix:** hold `'step1'`'s `cardAtAi` until `landingSettled` as well (or set it in the `'asleep'`-style tick).
    Unverified in play: it needs a pod still falling when the last DELETE is lost.
  - **FIXED**: `cardAtAi` stays null while a pod falls; the tick sets it FINALE_OPEN_DELAY_SEC after the touchdown. `finale-flow` flies it.
- **m6. The 7a suites run about 12 s against R42's +4 s** (about +3 s of wall). Not over the tier budget. Recorded for
  7b–7d's share.
  - **NOTED**: no trim needed (see the plan's Deviations (7a review fixes) for this pass's tier time); 7b–7d's share stays tight.
- **m7. Only `Space` and `Enter` on the night screens.** `RunEnd`, `Epilogue` and `FinalCard` register `['Space',
  'Enter']`. The FINALE card also takes `NumpadEnter`. For consistency, add it to the three `'end'` bindings.
  - **FIXED**: the RUN TALLY, the EPILOGUE and the FINAL CARD take NumpadEnter.

---

## The known items

**(a)** See B1.

**(b) DONE**: both helpers in `lib.mjs runKit`; run-flow, resume, playthrough and phone edited as listed (phone's FINALE sheet check included); new `ending.mjs` on seed 7 (registered). The reload at step 2 lives in `ending.mjs`, not resume. **(b) e2e.** No scenario reads `ENDINGS 1/2` (grep: none). The title's line is now `ENDINGS n/6`; I saw 2/6 and 1/6. No
scenario MERGEs today, so the `'last-landing'` expectation applies only if one is added. Run-flow is the place for it, on
seed 7's worked route.

Add two helpers to `tests/e2e/lib.mjs runKit`:
```js
// Slice 7a (R6, R7): the card waits for the landing to settle; step 1, then step 2 once armed.
const finaleTwoSteps = async (hollow = 'purge', you = 'reassignment') => {
  await waitFor(() => { const ap = window.__ap; const s = ap.store.getState();
    if (s.run.phase === 'landing' && s.landing.ended === null) ap.landAll();
    return s.hollow.finale.phase === 'step1' && document.getElementById('finaleChoice').classList.contains('armed'); }, 45000, 300);
  await page.locator(`button#fc${hollow[0].toUpperCase()}${hollow.slice(1)}`).click();
  const step2 = await waitFor(() => window.__ap.store.getState().hollow.finale.phase === 'step2'
    && document.getElementById('finaleChoice').classList.contains('armed'), 8000);
  await page.locator(`button#fc${you[0].toUpperCase()}${you.slice(1)}`).click();   // or keyboard 'Digit3'
  return step2;
};
// Slice 7a (R19): the RUN TALLY → EPILOGUE (≥ EPILOGUE_ARM_SEC) → the typing whole → the FINAL CARD (≥ FINAL_CARD_ARM_SEC) → NEW RUN.
const throughTheNight = async (key = 'Enter') => {
  await page.keyboard.press(key);
  await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'epilogue' && !document.getElementById('epilogue').hidden, 4000);
  await page.waitForTimeout(700);  await page.keyboard.press(key);   // finishes the typing
  await page.waitForTimeout(200);  await page.keyboard.press(key);   // the final card
  await waitFor(() => window.__ap.store.getState().ui.runEndStage === 'final' && !document.getElementById('finalCard').hidden, 4000);
  await page.waitForTimeout(1300); await page.keyboard.press(key);   // NEW RUN
};
```

The edits, scenario by scenario:
- **`run-flow.mjs`:**
  - `:409–413`: after the root click, `check('…the card after the landing settles, then step 2', await
    finaleTwoSteps())` replaces the 25 s `choiceUp` and the `#fcPurge` click.
  - `:446` and `:527` (NEW RUN after the arm's end and after BEAM OUT): `await throughTheNight('Space')`. R19 says a lost
    run gets the same three screens.
  - Optionally check that the final card reads `STAND BY` and `FINAL SHIP LOST`.
- **`resume.mjs`:**
  - `:381–383`: `finaleTwoSteps()` in place of `choiceUp` and `#fcPurge`.
  - `:427`: `throughTheNight('Space')` before waiting for the title.
  - Also: the check at `:412` stands, because ENDING CHOSEN is still written at the report's open (R14). A reload at
    step 2 replays LAST LIGHT from its BEAM (`RESUME · UNIT-047 · SHIP 6 · bound for LAST LIGHT`, seen), which would be a
    cheap new check.
- **`playthrough.mjs`:**
  - `:700`: tap by phase.
    ```js
    else if (landView.choice) {
      const step = await st(() => window.__ap.store.getState().hollow.finale.phase);
      if (await tap(page.locator(step === 'step2' ? 'button#fcReassignment' : 'button#fcPurge'))) choiceAt ??= Date.now();
    }
    ```
    `look().choice` already turns false between the steps (`.armed` is dropped and re-added after
    `FINALE_STEP_ARM_SEC`) and on the verdict face.
  - `:1153`: `await throughTheNight('Space')`, then the title waits as now.
  - Add an epilogue check before it: the header `^\d{4} · FORTY YEARS ON$`, the last line starting `ARRIVAL CONTROL:`,
    at most 16 lines.
- **`phone.mjs`:**
  - `:447`: the tap on `#reNew` now opens the epilogue. Tap `#epilogue` twice (the second tap after `.typed` appears),
    then `.nf-new` after 1.3 s. Run `overflow('EPILOGUE')`, `overflow('FINAL CARD')`, `onScreen('…', '.nf-new')`.
  - **A FINALE layout check** (new; at 390×844 I measured what it should assert):
    - Get to LAST LIGHT with `__ap.route([0,2,5,11,15,19])`, `skipBoot`, `lockOn`, `landAll`.
    - Hand-open step 1 (`hollow.finale.phase = 'step1'`, `rootFell = true`, `cardAtAi = clock.aiSec`, the root removed),
      or run the DELETE at desktop size and then `setViewportSize`.
    - Assert:
      - `overflow('FINALE step 1')` (scrollWidth 390, seen);
      - `#fcCard` fills the viewport;
      - each `button.fc-row` is at least 44 px tall (80, 110 and 115 px seen) and inside the width;
      - `.fc-key` is `display:none`.
    - Tap `button#fcPurge`. Step 2's `#fcBack` is a visible button: `onScreen`, then tap it back to step 1.
    - On UNRESOLVED (hand-built `rootFell = false`), `#fcCont` is on screen and a tap goes to step 2.
    - At 844 px the step-1 face fits exactly (scrollHeight 842 = clientHeight 842). Shorter phones scroll (`overflow-y:
      auto` on `.fc-card`), so the check should scroll to `#fcBack`/`#fcCont` before `onScreen`.

**(c)** See m1 and m2.

**(d)** Yes, see m3.

**(e) DONE** (60a47be): both gates dropped with every path, key and hook listed below; `finaleEndingShowing` and the internal `podsEatenHere` kept; `not-built.ts` deleted; also `FINALE_ENDING_MAX_LINES`, `RUN_END_TEXT.newRun` and the tally's `#reEndings` / `.re-bridge` DOM and CSS. **(e) The keep-set cleanup (M5).** Everything below is dead once the fix pass drops the `twoStep` and `night` gates. Both
are raised for good, and no suite runs either one down: there is no `twoStep: false` or `night: false` anywhere. I
recommend dropping both gates; the flag can't be kept without the paths it switches.

- **`finale.ts`:**
  - `chooseFinale`, `finaleChoiceRefusal`, the `FinaleChoice` type, `finaleEndingLines`, `colonistsInOrbit`,
    `colonistsEatenHere`;
  - every `!ENDINGS_BUILT.twoStep` branch: `rootGone`'s `lastWords` and open-at-once, `unresolve`'s done-at-once,
    `confirm`'s WP11 typed ending, its reopen-in-the-same-update and its `purgeEcho`/`mergeEcho`/`purgeControl`/
    `mergeControl`, and the `if (ENDINGS_BUILT.twoStep)` guards on the emits.
- **Keep, but internal:**
  - `podsEatenHere`: `mergeIn` still uses it. Un-export it, or fold it into `mergeRestorable`.
  - `finaleEndingShowing`: read by finale.ts's own tick, `__ap.finale().endingShowing` (the e2e reads it,
    `playthrough.mjs:771`), `fix1`, `views` and `finale-flow`.
  - `finaleEndingLineStartsSec`, `skipFinaleEnding` and `mergeTickCharge` are live.
- **`HOLLOW_FINALE` dead keys:**
  - The old card: `purge`, `merge`, `choiceKicker`, `choiceTitle`, `choiceSub`, `purgeCmd`, `mergeCmd`, `purgeWhat`,
    `purgeCost`, `mergeWhat`, `mergeGain`, `mergePrice`, `purgeKey`, `mergeKey`, `mergeNeeds`.
  - The WP11 endings: `purgeEcho`, `mergeEcho`, `purgeControl`, `mergeControl`, `purgeEnding`, `mergeEnding`,
    `lastWords`.
  - The gate-down strip: `stripChoice`.
  - `stripWaits`: no src reader. `landing-text.ts L0` holds the same words; only `fix1` reads it.
  - `endingHint` and `controlTag`, once m4 moves them to FINALE_TEXT.
  - `endingUnknown` goes with `script.ts endingsLine` (below).
  - **Keep:** `deleteIt`, `rootTag`, `stripDelete`, `stripDeleteTab`, `stripDeleting`, `stripDeletingTab`,
    `stripDeletingAlone`, `stripNoDelete`, `stripWaitsNobody`, `unresolvedLine`.
- **The test churn that goes with it:**
  - `support/words.test.ts:150–164`: WP11's card words;
  - `wp11/p2/views.test.ts`: `choiceTitle`, `purgeCmd`, `mergeCmd`, `purgeCost`, `mergeGain`, `mergePrice`, `mergeNeeds`;
  - `wp11/harness11.ts:30,66`: `FinaleChoice` → `HollowChoice`;
  - `support/finale.ts:102–106`: the `chooseFinale` branch;
  - `debug.ts:96, 410–412, 1175, 1198, 1201`: `__ap.choose`, `__ap.endingLines`, `finale().mergeRefusal`/`purgeRefusal`.
    Replace them with `finale().options` (already there).
- **NIGHT's gate-down branches:**
  - `meta.ts ENDINGS` (TitleCard's and RunEnd's only readers);
  - `script.ts endingsLine`;
  - `RunEnd.ts:236–239` (the endings line), `:258–262` (the bridge), and `:275`/`:298–299` (NEW RUN on the tally);
  - `RUN_END_TEXT.newRun` if nothing else reads it.
- **`not-built.ts`: delete it.** It has no importer since FINALE removed `debug.ts`'s import, and grep `notBuilt` finds
  only its own definition.

**(f) DONE**: `// R23 (the plan's draft; 05 to adopt)` on the four; the file comment no longer calls CONTACT's three drafts. **(f) The UNRESOLVED titles.** R23 drafted exactly these four:

| Key | Title |
|---|---|
| SUNSET | `IT CAME ALONG` |
| STAY | `A COLONY WITH TWO MINDS` |
| REASSIGNMENT | `IT FOLLOWED ME TO THE DISH` |
| CONTACT | `WE WENT OUT TOGETHER` |

`epilogue-text.ts:19, 23, 27, 31` hold them verbatim. Two things to fix:
- Replace `TODO(05)` with `// R23 (the plan's draft; 05 to adopt)` so nobody "fixes" a decided word. The designer should
  copy them into 05 §3.7.
- The file's comment (`:15`) and the foundation follow-up's B1 call CONTACT's three titles drafts. They are not:
  `OUTWARD, ALONE`, `WE WENT TO SEE` and `TWO WAYS OUT` are 05 §3.7's own words. Only `contact:followed` is a draft.

**(g) 41 payoffs, not 78: fine for 7a.**
- The two-way load check (`epilogue-text.ts:93–100`) ties `PAYOFF_OF` exactly to `LINE_POOL` + Ada. Growing LINE_POOL is
  05's content work, and it would move every roster roll.
- The cost is that the check throws at module load, so an unpaired bio takes the whole page down, not just the epilogue.
  That is "fail loudly", and `support/words.test` catches it first.
- For the designer: with 40 bios, two colonies in one epilogue can repeat a template, and 05's sample `Imani Osei wrote to
  Earth` cannot appear until her bio exists.

**(h)** See the tier time above.

---

## For the designer

1. **[DECIDED: 05's rule, OD 56]** **Who is compliant (M2).** CONTROL's verdict, the epilogue's last line and 7c's wild seed must follow one rule. 05 §3.8
   counts SPARE, SUNSET, STAY and CONTACT as non-compliant, so MERGE + REASSIGNMENT is compliant. WP11 had MERGE
   non-compliant (`we saved you a seat` was a disobedience). Pick one.
2. **[BUILT: `> 047. wait.`, the card at once; OD 58]** **The asleep line when the landing is already over.**
   - If the kid lands everything first, then deletes the root (the e2e's way, and a common one), HOLLOW still says
     `> 047. wait. finish your landing. i'll be here.` under `pod16 ... LANDED` (seen). The landing is already finished.
   - R6 also says the FINALE opens "the moment the root falls" in that case. It waits for the line to type: 5–6 s, and
     18 s in my run with a TERMINAL backlog.
   - Suggest WP11's `> 047. wait.` (or `> 047. wait. i'll be here.`) when `landing.ended !== null` at the fall, and the
     card at once after it.
   - Where: `finale.ts:279`, `finale-text.ts:24`.
3. **[BUILT: `SPARE GIVES IT THE SHIP`, named; OD 58]** **SUNSET after SPARE reads `??? · 046 HAS THE SHIP`** for a kid who never chose SUNSET (seen on the phone).
   - R7's whole reason for BACK is that "a kid who sees that at step 2 must be able to go back", but the kid can't see
     what was given up.
   - Its price was met (the ship was in orbit, empty and fuelled), so I'd name it: in `ending-rules.ts:154`, return
     `named: true` when `emptyShip(state).ok`.
4. **[BUILT: `FUEL 23% ✓ · needs 20%`; OD 58]** **An open SPARE or SUNSET reads `NEEDS FUEL 20% · you have 23% ✓`** (`finale-text.ts:53`). "NEEDS" on an open row reads
   like a refusal next to MERGE's `COSTS 20 REPAIR CHARGE`. Suggest `THE EMPTY SHIP · FUEL 23% (★ 20%) ✓`.
5. **[HOLDS after M1's lock]** **MERGE + SUNSET's FUEL** in the epilogue (`… two caretakers and 22% fuel.`) is the FUEL at the choice. After M1's lock
   that is also the FUEL the ship leaves with.
6. **The verdict tone is good.**
   - Two echoes and CONTROL; UNRESOLVED has one echo and CONTROL. It reads as a command log, not a narration.
   - The step-2 face's `"Please stand by for reassignment. Your next post: RELAY 20. :)"` sets up the compliant line well.
7. **The epilogue reads well** (MERGE + REASSIGNMENT, SPARE + REASSIGNMENT, UNRESOLVED + STAY seen).
   - UNRESOLVED + STAY's `UNIT-046 lives there too. They argue about the weather.` is a highlight.
   - `UNIT-046 is part of UNIT-047 now. It doesn't bite.` followed by `It is not hungry any more.` says "not biting" twice
     in two lines. Consider dropping one. **[BUILT: `It doesn't bite.` dropped]**
8. **[OPEN: not built in this pass]** **The final card's HOLLOW row on UNRESOLVED is all `???`**, correctly, since `followed` is no piece. A kid may wonder
   why their ending lit nothing on that row. Consider a dim `IT FOLLOWED YOU` label on that row for this run only.

---

## Architecture (7b, 7c, 7d)

- **7b, THE LAST LANDING.** The interim lives in four places, all small:
  - `finale.ts mergeIn` (`:377–396`: restore in place);
  - `verdictDone` (`:507–518`: `restored.length > 0` → `'last-landing'` + `reopenLanding`);
  - the `'last-landing'` tick branch (`:702–708`);
  - `ending-rules.ts mergeRestorable` with `FINALE_TEXT.nowInterim`.

  7b's controller can replace them one for one:
  - `mergeIn` removes every block and fills `landing.lastLanding.drivers` (R24, R25);
  - `mergeRestorable` widens to R25's pods (eaten, aboard or parked-restorable);
  - `nowInterim` → `now`;
  - `verdictDone` starts the `'merge'` controller instead of `reopenLanding`.

  Notes for 7b:
  - `FinaleChoice` already closes at `'last-landing'`.
  - The epilogue already counts restored pods that came down from `PodSummary.restored`.
  - The codec's MERGE check reads `record.restored` (foundation D5), which radio drivers keep.
  - M1's engine lock becomes R26's input layer.
  - `record` is frozen before the last landing, which is right for 7b: its result belongs to the report, not the ending.
- **7c, the traces.** `EndingRecord` carries everything R31–R35 need: `hollow`, `you`, `rootUnits`, `finalSlot`,
  `finalYear`, `stay` (slot, colony, year), `kit`, `fuelPct`, `charge`. The one gap is M2's shared `controlCompliant`,
  which R33's wild seed must read rather than restate.
- **7d, CONTACT.** It is behind its gate everywhere I looked:
  - `optionState` throws if the gate is raised before the price exists;
  - `step2Options`, `builtPieces` and the final card's rows filter on `pieceBuilt`;
  - the verdict's `stepCommand`, `ENDING_TITLE` (all four keys) and `EPILOGUE_TEXT.step2.contact` exist;
  - key 4 is in the card's digit set;
  - the card captions an open CONTACT with `needs.signals` (CARD D4). A `price.signals` word would read better.
- **Duplicated logic:**
  - **[DONE, m2]** **The ★ ON TARGET rule** exists three times: `onTargetTally` (records), `shipOnTarget` (summaries), and m2's codec
    twin. Use one pods-only core.
  - **[DONE, M2]** **Compliance** is in two places that disagree (M2).
  - **[DONE]** **The ending title** is computed twice: `epilogue.ts endingTitle` and inside `ending-rules.ts reportEndingLine`.
    Move `endingTitle(record)` to ending-rules and have the epilogue import it.
  - **[DONE: `finale-card.ts pieceCommand`]** **Piece → command with names** is built twice: `finale.ts stepCommand` and `finale-card.ts commandOf`. They differ
    only in where STAY's colony comes from. A shared pure `pieceCommand(piece, names, stayColony)` would keep the card's
    row and the verdict's echo from drifting.
  - **[DONE, B1]** **The card-models suite's `withGates`** duplicates `withEndings` (B1).
- **Module state:**
  - `finale.ts` keeps `spikeInSec` and `verdictOwed`, both registered with `onWorldReset` and cleared on unmount.
  - The three night components and FinaleChoice keep only closure state. CARD's `stayOpen` is unsaved by M3's design.
  - Nothing new escapes the reset registry.

---

## Tests: gaps on the risky paths

- **MERGE + SUNSET end to end:** the eaten driver, `'last-landing'`, the second landing end, the record's FUEL against the
  report's. This is M1's check.
- **The epilogue's CONTROL line against the verdict's**, for all 11 combinations. It would have caught M2.
- **MERGE + STAY** through the real machine. `stepCommand` and `endingRecordAt` read `stayCandidates` on the draft after
  `mergeIn`. It holds by the monotone argument in m2, but nothing pins it.
- **The codec:** a STAY save whose ship is not ★ (once m2 lands), and a record at `'verdict'` (m1's invariant).
- **UNRESOLVED with a pod still falling** (m5).
- **The card's DOM** has no unit coverage (`card-models` is pure, by design). The e2e plan in (b) is the only check of the
  two-tap flow, the `fcStay` ids (M3) and the arm timings.
- **The night screens' key flow:**
  - **Verified by hand:** one ENTER on the tally opens the epilogue without skipping its typing; an ENTER 0.3 s after the
    final card opens does not start NEW RUN; `ui.runEndStage` is back to `'tally'` on the new run.
  - **Not pinned:** no suite pins any of it. `throughTheNight` in (b) does.

---

## Verified in play (Playwright, seed 7)

- MERGE + REASSIGNMENT with no eaten driver: verdict → `'done'` → report `ENDING · MERGE · WE SAVED YOU A SEAT` → tally →
  epilogue (9 lines) → final card `WE SAVED YOU A SEAT · ENDINGS 2/6` → NEW RUN → title `ENDINGS 2/6`.
- SPARE + REASSIGNMENT (390×844): SUNSET `??? · 046 HAS THE SHIP`. The card fits with no sideways scroll, the digit caps
  are hidden, and the rows are 80–115 px. Report `ENDING · SPARE · IT GOT WHAT I DIDN'T`, final card 2/6.
- UNRESOLVED → IT FOLLOWED YOU → ENTER → STAY (one candidate confirms) → verdict (one echo and CONTROL) → `ENDING ·
  FOLLOWED · A COLONY WITH TWO MINDS` → epilogue with the two minds → final card `ENDINGS 1/6`, title 1/6.
- A reload at step 2: the title offers `RESUME · UNIT-047 · SHIP 6 · bound for LAST LIGHT · 3020`, and RESUME replays the
  boot with the finale at `'none'` (R14).

## Not verified

- MERGE with an eaten driver in the browser (headless only, M1).
- STAY with several candidates in the browser: `finale-flow` covers it headless.
- A ship crash in `'last-landing'` (M1: possible by code, not reproduced).
- m5's falling pod.
- `wp11/full-run` and `wp12/playthrough` (BALANCE_ONLY), and the e2e tier.
