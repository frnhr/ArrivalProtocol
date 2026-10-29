# Unit tier: known failures during slice 1a

The regression signal for slice 1a: a suite that fails and is NOT listed here is a regression. During the slice, 51
suites failed after the switch-over; every one has since been fixed or rewritten for the landing design. No test file
switches the type checker off (`tests/unit/support/no-ts-nocheck.test.ts` guards it), and no phase-2 word for a pod is
left in the game's text (`tests/unit/support/words.test.ts`).

At the end of slice 1a (all tracks, the review fixes and the tier trims merged): `npm test` on 4 workers, **137 passed,
0 failed in 231 s**; the slowest suite took 39 s (lead2/coast-skip). The e2e tier: 317 of 319 checks in 1,120 s, see
the end of this page.

## Track TESTS' suites

None failing.

## Not Track TESTS' (reported, not edited)

None failing. landing/solve's `one full drop solve costs under 5 ms` measured 5.1–7.3 ms under tier load; 5f7ed72 times
it by its fastest run, and it passed in the last run.

## Information-only checks (print INFO, do not fail)

| Suite | What it prints, and why it does not fail |
|---|---|
| wp12/playthrough | Every design target (souls woke, ships locked, wall time, Core never lost, MERGE availability, SLOPPY's endings) prints INFO with its number; `PT_STRICT=1` makes them checks. The kids were written for phase 2; only "each kid's run ends" is a hard check. |

## e2e (one full run at the end of slice 1a)

- `playthrough`, ship 1: "the credits roll names a colonist per pod that scored" read the roll after a SPACE had
  skipped it (a test timing flaw; the report was right). Fixed in the scenario after the run; not re-run.
- `playthrough`, LAST LIGHT: "the flight ends by the strip within 6 minutes" timed out at 360 s while the kid, out of
  REPAIR CHARGE, could not act on `MOVE POD 10 behind a WALL`. It fails the same way on the phase-2 tree (2cc8f49), so
  it predates slice 1a; the kid's MOVE handling or the limit needs a look with the rebalance.
