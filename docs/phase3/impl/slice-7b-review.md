# Slice 7b THE LAST LANDING: independent review

> **Fix pass (2026-11-08, same agent):** every finding below is marked FIXED, NOTED or OPEN, with its commit. The details
> are in `slice-7-plan.md`, "Deviations (7b review fixes)", and the gameplay calls are OPEN-DECISIONS 60–65.

Reviewed: `git diff 53ca68a..9a7b3eb` on `claude/modest-hawking-209t0f`: the foundation (the `launchDrivers` swap, the radio
launch path, the `'merge'` seam, the input layer), Track DROP (`systems/last-landing.ts`) and Track VIEW (the header, the
POD BAY row, the beacons, the report's row and credits). Sources: plan R24–R29 and the Deviations sections (7b foundation,
Track DROP 7b, Track VIEW 7b); 01-landing §3.17; OPEN-DECISIONS 43, 51, 57; AGENTS.md.

**What I ran**
- The quick tier once at 9a7b3eb (below): **red**, 213 passed, 1 failed (`tsc-tests`, B1), 12 balance-only skipped, 181 s.
- A headless probe (a scratch suite on `ending/last-landing-arm.ts`, deleted after): Bay Ctrl missing, Nav Plotter dead
  from the start, Nav Plotter killed mid-landing (v3), the ship lost mid-landing, and [ENTER]'s cost by flier.
- `wp11/full-run` at full depth, and `wp12/playthrough` at full depth on 8 seeds (`PT_SEEDS=8`), on 9a7b3eb, on 53ca68a
  and after the fixes (harness gap, M3).
- Playwright (Chromium, seed 7, 1440×900): the new `last-landing.mjs` and the updated `ending.mjs` (e2e, below).

**Verdict in one line:** the machine is sound on a healthy ship, but three ships a player can bring to MERGE broke it: Bay
Ctrl missing parks every restored pod (B2), a dead Nav Plotter parks them instead of dropping them blind (M1), and a ship
lost mid-landing throws in the page (B3). The POD BAY's [−]/[+] still reached MERGE's own v2 pass (M2). The tier was red
on a stale hand-built state (B1). All fixed.

---

## The tier time

| | At 9a7b3eb (review) | After the fixes |
|---|---|---|
| Result | 213 passed, **1 failed** (`tsc-tests`), 12 skipped | 214 passed, 0 failed, 12 skipped |
| Wall time | **181 s**, quick, 4 workers (budget 265 s) | **190 s**, quick, 4 workers |
| 1-min load average | 0.06 at the start, 7.52 at its peak (sampled every 15 s; nothing else running) | 5.65 at the start (typecheck just before; 7c's agent may have been busy), 7.66 at its peak |

The slowest suites at 9a7b3eb: `skills/autodrop-review` 25 s, `skills/landing-v3` 24 s, `survey/flow` 23 s,
`skills/autoburn-modes` 23 s, `ending/last-landing` 19 s.

---

## Blockers

### B1. The tier is red: `tsc-tests` on `ending/last-landing-models.test.ts:46` — FIXED (7954f3b)

VIEW's hand-built `LastLandingState` has only 7a's six fields; DROP's merge added `startTSec` … `stuckAiSec`, so the tests'
strict tsc fails (`TS2740`). Each track's tier was green alone; the merged tree was not run.
- **Fix:** the machine in the test gains DROP's fields (and the review's `pass`), as `last-landing-foundation`'s already did.

### B2. Bay Ctrl missing ends THE LAST LANDING in 6 s, every restored pod parked — FIXED (7954f3b)

`landing-rules.ts:454 landingStuck` returns `'bay-offline'` whenever Bay Ctrl is missing, and `landing.ts noneLeftTick` ends
the landing after `LANDING_NONE_LEFT_SEC`. THE LAST LANDING launches from no bay (R26), but this rule still reads it. The
probe: v3, 3 pods, Bay Ctrl deleted → `ended 'bay-offline'`, all three parked, `'done'`. HOLLOW eating Bay Ctrl on the
final ship is an ordinary way for the kid's own landing to have ended, so MERGE would then give back drivers that never fly.
- **Fix:** `landingStuck` skips `'bay-offline'` while `landing.lastLanding` is set. Checked in `ending/last-landing`.

### B3. A ship lost mid-landing throws in the page, and the machine never ends — FIXED (7954f3b)

When the ship leaves orbit during THE LAST LANDING (`orbit-sim.ts endLandingLost`, then `landing.ts endNow('ship-lost')`),
the restored pods aboard go `NOT LAUNCHED`. `last-landing-hud.ts:32` then throws (`restored pod … has left the orbit`) from
the header strip's store subscriber, inside the tick's update. Even without the view, the clock is paused under the LOST
card, so no AI tick comes: `landing.lastLanding` stays set, the `'last-landing'` layer stays up, and an [ENTER] would loop
`advance` to `LAST_LANDING_SKIP_MAX_STEPS` and throw. Probe: `endLandingLost(store, 'crashed')` mid-landing.
- **Reachable?** The engine is shut in `'last-landing'` (OPEN-DECISIONS 57) and the drag kicks go on, so a low, decaying
  orbit can take the ship down during a long blind landing. **Not reproduced by flying**; forced in the probe.
- **Fix:** `last-landing.ts lostTick` (a post tick, which runs while paused) ends the machine when the landing ended
  `'ship-lost'`: cleared, `'done'`, the layer down. The models paint nothing once the landing ended `'ship-lost'` (the LOST
  card owns the screen). A pod gone from the orbit any other way still throws. OPEN-DECISIONS 63.

---

## Majors

### M1. No drop solution parks the pods; 01 §3.17 drops them blind — FIXED (7954f3b)

01 §3.17: "Without AUTODROP, **or with no drop solution (Nav Plotter dead or missing, the ship out of the band): the pods drop
blind**." R27 says the same. DROP names the flier `'blind'` (`last-landing.ts:220`) but nothing can launch without a dot
(`launchRefusal` NO DROP SOLUTION), so the tick (`:355–361`) ends the landing `'no-drop'` after 6 s with every pod parked.
The suite pinned it (`Nav Plotter dead … the pods parked`). A belt hit that kills Nav Plotter mid-landing (the MIND is shut,
so nothing repairs it) did the same to a v3 landing. The header meanwhile said `BLIND DROP · NOBODY STEERS THEM`.
- **Fix (gameplay call, OPEN-DECISIONS 60):**
  - `drop-cache.ts recompute` solves the geometry while THE LAST LANDING runs, even without the plotter (`plotted`), and
    marks the dot uncertain (grey, `≈`) when the plotter is down: the pods' own motors find their fall, nobody aboard plots it;
  - the flier is blind when `capabilities.drop.solution` is false at the start, and a flier that loses the plotter mid-landing
    turns blind there (`flier`, deadline, target and pass reset; the strip says it);
  - `autodropFlies` also needs the solution, so AUTODROP never decides on the plotter-free geometry.
- **Out of the band** (01's other case) still parks the pods: kept as a call, OPEN-DECISIONS 61 (m3 below).

### M2. The POD BAY's [−]/[+] rewrite MERGE's v2 pass; [G] is guarded only by CSS — FIXED (7954f3b)

DROP's v2 flies from the kid's AUTODROP fields (its Deviation 4: `landing.autodrop.pass`, `sent`, `armedAtTSec`). The POD
BAY's pass steppers stay clickable under THE LAST LANDING (`landing.css:624` dims only LAUNCH, [G] and END LANDING), and
`autodrop.ts:472–482 setPassCount` writes `landing.autodrop.pass` while the landing is on: the kid's click changes MERGE's
split for the rest of that pass. `pressAutodrop` (`:402`) has no guard either; the [G] key is shut by the layer and the
button by `pointer-events: none` only, and an arm made then would reach ENDING CHOSEN armed (the codec refuses it).
Verified by reading; I did not click the steppers in the page.
- Also: v2/v3's `nextLaunchAtTSec` and `waitsFor` (`autodrop.ts:218`, `:229`) read the landing's own view (Bay Ctrl's
  cadence, the bay's loaded count), while `decide` reads `lastLandingView`, so pace and the strip timed MERGE's next launch
  by a bay it does not use.
- **Fix (DROP's optional suggestion, taken):** `AutodropOverride` gains `pass` (the wrapper's own pass fields) and `view` (the
  view the wrapper flies by, for the decision and for what it names to pace and the strip). v2's pass lives on
  `LastLandingState.pass`; the kid's machine is never written, and `finish` no longer clears it. `setPassCount` does nothing
  and `pressAutodrop` is refused `MERGE FLYING` (a new `AUTODROP_TEXT.refusal` word) while MERGE flies; the steppers are
  dimmed with the other shut buttons. `autodropLaunched`'s off-site change was not needed and is left. OPEN-DECISIONS 64.

### M3. The harness gap: the instant landing flies THE LAST LANDING for the kid — FIXED (a73021d)

`support/landing-instant.ts:61–69` lands every pod it can on the landing's first tick after a reopen, radio pods included
(`forceLandAll` reads `launchDrivers`): soft, in an LZ with room. In `wp11/full-run`, `wp12/playthrough` and `wp11/p2/views`
this means:
- R27 never runs there: no flier, no blind draw, no stuck rule, no cadence. B2 and M1 (both on states those harnesses reach:
  HOLLOW eats ship files on the final ship) were invisible to them;
- the balance harness scores every restored pod as a full one, whatever AUTODROP the unit holds (blind is worth about 0.78
  on GENTLE, 0.56 on HARSH: DROP's sweep);
- it hides nothing in the machine's own suites (`ending/last-landing` sets `'manual'`).
- **Fix:** the instant landing stands aside while `landing.lastLanding` is set; the machine flies with its own SKIPs. After
  it: `wp11/full-run` at full depth green in 319 s (DROP: 310 s); `wp11/p2/views` green in the quick tier;
  `wp12/playthrough` on 8 seeds gives the same table as before the change.
- **Pre-existing, not 7b:** that 8-seed playthrough has 6 LITERAL and 6 SLOPPY runs `stuck:printing on LAST LIGHT` (PURGE
  runs whose choice never comes), identical at 9a7b3eb and at 53ca68a (7a merged). For the lead; I did not dig into it.

### M4. The e2e `ending.mjs` part 2 still played 7a's interim — FIXED (9299e96)

With the gate up, MERGE + SUNSET's card says `its pod lands on its own`, not `launch its pod` (`ending.mjs:191`), and the
landing it waits for (`:202`, `landing.ended === null`) is THE LAST LANDING, which `__ap.landAll()` (`:217`) then lands by
hand. The e2e was not run in 7b, so this went unseen.
- **Fix:** part 2 checks 7b's `NOW:` line, THE LAST LANDING (the pod released by radio, the strip, the SHIP view), the engine
  shut under it (the held [SPACE]), and [ENTER] to its end, then the report as before. The new `last-landing.mjs` covers the
  rest (e2e below).

---

## Minors

- **m1. [ENTER] freezes the page while it flies** — OPEN (the lead). R28 asks for a synchronous fast-forward; each step is a
  whole tick with its store fan-out. Measured: **2.1 s** in Chromium for 3 blind pods (`last-landing.mjs`); headless (no
  DOM) 1.2 s / 1,451 steps for 3 blind pods, 2.9 s / 3,925 steps for 8 blind, 3.1 s / 2,827 steps for v3 with 6. Sixteen blind
  pods on a HARSH planet would hold the page for several seconds with no paint. Options: a store hold that fires the
  subscribers once at the end of the loop, or the loop spread over a few frames behind a `SKIPPING` stamp. Not small, so
  not done here.
- **m2. `not-built.ts` is back with no caller** (`src/systems/not-built.ts`; 7a's fix pass had deleted it, and its banner says
  the batch's fix pass deletes it) — NOTED. Left because 7c's foundation branched from 9a7b3eb and may reuse it; delete it
  once 7d lands.
- **m3. Out of the band, THE LAST LANDING still parks the pods** (`last-landing.ts` tick's stuck rule) — OPEN-DECISIONS 61. 01
  lists "the ship out of the band" under blind. A blind launch from outside the band would need its own refusal and window
  rules; with the engine shut the kid can't fix the orbit either way.
- **m4. `landing.ts:663 setLoadNext` throws for a radio pod** (`driver … is not in memory`) — NOTED. Only `__ap.loadNext`
  reaches it: LOAD NEXT is a MIND action, and the MIND is shut.
- **m5. `'last-landing-start'`'s `flier`** is the starting one; a plotter lost mid-landing turns it blind with no event
  (M1's fix) — NOTED. Only the cue reads the event.
- **m6. The cues during [ENTER]** — not verified by ear. Each launch and touchdown of the skip plays its cue within one
  frame (`audio-cues` dedupes per tick, and the skip runs many ticks).

---

## Checked and sound

- **R14:** no save point inside THE LAST LANDING. `writeEndingChosen` is called only by `landing.ts finishLanding` (the report's
  open), which a final ship reaches only at `'done'`; `finish` clears the machine and sets `'done'` in one update; the codec
  refuses `lastLanding` set. A reload replays LAST LIGHT from its boot (OPEN-DECISIONS 51; `ending.mjs` part 2's reload).
- **[ENTER] vs a watched landing:** `ending/last-landing`'s v2 equality holds after M2's change. A paused clock is let go.
- **MERGE with 0 eaten drivers:** `'done'` at once, no machine, the layer and the resolver idle (a check added).
- **MERGE + SUNSET:** the engine stays shut under THE LAST LANDING (a held [SPACE] burns nothing), the report reads `ENDING ·
  MERGE · WE TOOK THE SHIP` with the record's FUEL (e2e).
- **AUTODROP with damage:** Sensor Interp and Nav Plotter failing (the two-orbit limit, DROP's suite); Nav Plotter dead at the
  start and killed mid-landing (M1); the radio drivers are not in memory, so no bite or belt hit reaches them.
- **The `'merge'` controller does not leak:** the resolver answers only while `landing.lastLanding` is set and the landing
  flies; `finish` and every world reset let go of the layer; the next ship's landing state starts with `lastLanding: null`.
  **Not verified:** a NEW RUN from the debug ladder in the middle of THE LAST LANDING.
- **Keys:** the layer sits above `'game'`, so [L], [G], TAB, SPACE and the burn keys do nothing; key repeats are ignored, so a
  held ENTER from the card cannot skip the landing (the verdict's own key is SPACE). TAB checked in the page.
- **The kid's launch:** `MERGE FLYING` on `requestLaunch` from `'player'` covers [L], the POD BAY, the phone bar and
  `__ap.launch` (page: `[L]` launches nothing, `__ap.launch` refused, the POD BAY says it).
- **A pod that never launches:** every flier ends — v2/v3 by their deadline, then blind; blind takes every in-band window, a
  fresh draw each turn; no window at all ends the landing after 6 s.

---

## Architecture (7c, 7d)

- **The record** (`EndingRecord`) is frozen at the confirm, before THE LAST LANDING. What the restored pods did reaches the
  epilogue only through the final `ShipResult` (each `PodSummary.restored`; `epilogue.ts:170`). A 7c trace that should depend
  on the restored pods (MERGE's, for example) must read the ship result, not the record.
- **The save:** ENDING CHOSEN stays after THE LAST LANDING (R14), so 7c's v7 → v8 bump is unaffected. `landing.lastLanding`
  (now with `pass`) never reaches a save; keep the codec's null check.
- **Module state:** `last-landing.ts` holds only `mounted` and `closeLayer` (UI glue, let go at the end, the unmount and every
  reset). `drop-cache.ts` now reads `landing.lastLanding` (M1): during THE LAST LANDING `sol.block` no longer means "no
  plotter"; read `capabilities.drop.solution`.
- **`AutodropOverride.pass` and `.view`** are the seam for any later wrapper that flies AUTODROP's rules on a view of its own,
  without writing the kid's machine.
- **OPEN-DECISIONS numbering:** this pass adds 60–65 under "Slice 7b, built". 7c's foundation may number its own items from
  60 too; renumber at the merge.

---

## e2e (Chromium, seed 7, each scenario alone)

- `last-landing` (new): **19/19**, 83 s. The strip read `3 OF 3 PODS TO LAND · BLIND DROP · NOBODY STEERS THEM`; [ENTER] took
  2,148 ms; the report row read `RESTORED BY MERGE · 3 RESTORED · 1 LANDED · 1 MISLANDED · 1 OFF-SITE`.
- `ending` (part 2 updated): **29/29**, 276 s.
- No page errors in either.

## Not verified

- The ship lost mid-landing by flying (B3 was forced).
- A click on the POD BAY's steppers in the page (M2 is by reading; the fix is in the system rule and the CSS).
- The full e2e tier and the 200-seed playthrough.
- The phone layout of THE LAST LANDING (VIEW's own visual check covered it; not re-run).
