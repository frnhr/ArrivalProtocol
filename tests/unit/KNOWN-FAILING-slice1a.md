# Unit tier: known failures during slice 1a (Track TESTS)

The regression signal for slice 1a. A suite that fails and is NOT listed here is a regression. At the first commit
(a185afb, from the foundation's c885639) 51 of Track TESTS' suites failed (76 passed, 51 failed in 237 s). Every one has
since been fixed or rewritten for the current design, on the state with Tracks SIM (d9d484a) and UI (004039d) merged.
No test file switches the type checker off (tests/unit/support/no-ts-nocheck.test.ts guards it).

Last measured on the merged state (004039d merged): `npm test` on 4 workers, **135 passed, 0 failed in 270 s**; the
slowest suite took 47 s (lead1/low-tank).

## Track TESTS' suites

None failing.

## Not Track TESTS' (reported, not edited)

None failing. landing/solve's `one full drop solve costs under 5 ms` measured 5.1–7.3 ms under tier load; 5f7ed72 times
it by its fastest run, and it passed in the last run.

## Information-only checks (print INFO, do not fail)

| Suite | What it prints, and why it does not fail |
|---|---|
| wp12/playthrough | Every design target (souls woke, ships locked, wall time, Core never lost, MERGE availability, SLOPPY's endings) prints INFO with its number; `PT_STRICT=1` makes them checks. The kids were written for phase 2; only "each kid's run ends" is a hard check. |
| wp11/fix1/fix1 | `stripWaitsNobody`: with every driver lost before the root, the strip waits on `finale-waits`, which says L0's `EVERY POD IS DOWN` though no pod is down (data/script.ts, Track SIM's). |
