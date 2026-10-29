# Unit tier: known failures during slice 1a (Track TESTS)

The regression signal for Tracks SIM and UI: a suite listed here was already failing on Track TESTS' branch with the
instant-landing harness (tests/unit/support/landing-instant.ts), from the foundation's c885639. A suite that fails on
your branch and is NOT listed here is a regression of yours. Track TESTS removes lines as it moves suites over; the
list is empty when slice 1a is done.

Measured: `npm test` on 4 workers, **76 passed, 51 failed in 237 s** (was 74 / 53 in 222 s before the harness change,
with suites spinning to their wall-clock limits). No suite spins any more: the slowest failing suite takes 16 s.

## Phase 1 (Track TESTS) — failing at the first commit

| Suite | Cause |
|---|---|
| final-fix/move-hazard | reads `seg.cluster === 'C13'` (phase-2 cluster codes) |
| final-fix/seed-spots | looks up `C13` by cluster code |
| final-fix/strip-words | imports `RUN_END_TEXT` from data/script (moved to data/landing-text) |
| lead1/fix1/story-printer | imports `COLONISTS_ASK_ID` (the reveal is gone); becomes story-landing |
| lead1/story | imports `HOLLOW_REVEAL_AFTER_FIGHT_SEC` (removed with the reveal) |
| lead2/kestrel-debris | expects phase 2's six debris victims; the debris now hits drivers pod07–pod12 (names changed) |
| wp1/hud | expects `ACCEPT · PRINTER RANGE`; the label is `ACCEPT · IN BAND n%` now |
| wp2/say | glossary refuses the word `band` in `LAUNCH\|OUT OF THE LAUNCH BAND` (a new SIM refusal line vs. an old glossary rule) |
| wp4/capabilities | imports `PRINTER_SPEED_BY_BAND` (now the `bay` role and `drop`) |
| wp5/follower | imports `@systems/printer` (deleted) |
| wp5/layout | phase-2 layout (C01–C12, C09 at 71); rewritten for `R P P P _32` |
| wp5/models | imports `@systems/wake-report` (deleted) |
| wp5/racks | imports `intactHudLine` (now `onTargetTally` / `miniHudLanding`) |
| wp6/edges | imports `@systems/printer` |
| wp6/follower | reads `souls.results` |
| wp6/hollow-ship2 | builds a test ship from `C` tokens (now `P`) |
| wp6/hollow-sim | imports `@systems/printer` |
| wp6/hollow-unit | expects `ateCluster` on a hollowed driver (now `atePod`) |
| wp6/lines | imports `@systems/printer` |
| wp6/p2-echo | looks up `C12` (ARES-VII has 3 pods now) |
| wp6/p2-hud | looks up `C12` |
| wp7/bridge-test | looks up `C09` on HALCYON (5 pods now) |
| wp7/carry | imports `NO_PRINTER_GIVE_UP_SEC` |
| wp7/halcyon-story | imports `REPORT_TEXT` (the WAKE REPORT is gone) |
| wp7/p2-models | imports `RUN_END_TEXT` from data/script |
| wp7/run-flow | imports `@systems/wake-report` |
| wp7/soft-fails | imports `archiveSealed` (the sealed archive is gone) |
| wp8/draft | expects HALCYON's C08/C09 across the root's GAPs (now POD 04/POD 05) |
| wp8/fix1/fixes | imports `archiveSealed` |
| wp8/ghost | calls `LINES.bootArchive` (the archive boot line is gone) |
| wp8/run-flow | imports `COLONISTS_ASK_ID` |
| wp8/p2/ui-models | expects `you lost a cluster to ???` (now `a driver`) |
| wp9/belt-unit | writes `state.printer.waitAiSec` |
| wp9/fix1/fixes | imports `@systems/printer` |
| wp9/fix2/fixes2 | a SKIP-through-printing check (`runs on once the flight is calm again`) |
| wp9/lines | expects the phase-2 words for a cluster that did not wake |
| wp9/run-flow | reads `souls.results` |
| wp9/seed-test | looks up a cluster by code (`.size` of undefined) |
| wp9/zones-sim | looks up a cluster by code (`.size` of undefined) |
| wp10/deal-test | imports `@systems/printer` |
| wp10/held-space | imports `COLONISTS_HOLD_RELEASED` from pace (the colonists' hold is gone) |
| wp10/run-flow | reads `souls.results` |
| wp11/boss-sim | reads `souls.results` |
| wp11/fix1/fix1 | writes `state.printer.waitAiSec` |
| wp11/full-run | reads `souls.results` |
| wp11/lastlight-sim | looks up a cluster by code (`.id` of undefined) |
| wp11/merge-test | writes `state.printer.waitAiSec` |
| wp11/p2/views | writes `state.printer.waitAiSec` |
| wp12/fix1/fixes | the run-2 hurt-cluster hint (now the hurt-driver lesson, `tut-hurt-driver*`) |
| wp12/p3/cleanup | `SOULS IN STASIS` / `archiveSealed` (gone) |
| wp12/p3/minors | writes `state.printer.waitAiSec` |

## Not Track TESTS' (reported, not edited)

| Suite | Cause |
|---|---|
| landing/solve | `one full drop solve costs under 5 ms` measured 5.1–6.8 ms while the tier runs on 4 busy workers (passes alone); a timing threshold under load, Track SIM's to judge |
