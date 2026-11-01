# Unit tier: known failures during slice 2

This page is slice 2's regression signal. A suite that fails and is NOT listed here is a regression. Each listed suite has
an owning track (slice-2-plan §5.1–§5.3, §6.2), and that track fixes, rewrites or deletes it. A track that turns a suite
green removes its row. Since the foundation, no suite runs to its wall-clock limit: wp11/full-run used to spin for 445 s
on a stuck flight, and its per-seed loop now stops a seed that makes no progress (slice-2-plan Deviations (foundation)
31).

**Foundation result** (`node tests/unit/run.mjs`, 4 workers, quick depth): **100 passed, 41 failed in 259 s**. The
slowest suite took 35 s (lead2/coast-skip and wp10/skip-through). The baseline before slice 2 was 141 suites, all
passing, in about 159 s. tsc-tests passes. `node tests/unit/run.mjs landing entries words` passes except
lead1/fix1/story-landing, which the `landing` filter catches (listed below, Track THREAT).

Most failures have one of four causes:
- **No HOLLOW on ships 1–2.** Fixtures that bite on ARES-VII or HALCYON throw `hollow: there is no hollow block in
  memory`, or expect phase 2's root geometry.
- **HOLLOW re-keyed by stage.** VESPER plays ARRIVAL + WALLS, THE DEAL folds into LAST LIGHT, KESTREL has no HOLLOW of its
  own, and the HUNT stage's near-tools seeds are on no ship of the fixed five.
- **Layouts and the log.** The calm layouts and the `S` slot moved the pods. 046.log takes 2 blocks of rack F and of the
  link.
- **Licences re-flowed.** MOVE left HALCYON for KESTREL, and DELETE comes at KESTREL's start.

## Track THREAT

All 26 rows are green after Track THREAT (branch `threat-2`). wp7/halcyon-story is deleted (its content is
threat/arrival-story); the rest were re-keyed (support/hollow-world.ts, harness9 `phase2Hollow`, harness10 `hunt`) or
rewritten (slice-2-plan Deviations (Track THREAT) 18–20). New suites: threat/plan, threat/beam-seeds, threat/arrival-story.

## Track OPENING

| Suite | Why it fails | Plan |
|---|---|---|
| wp7/run-flow | HALCYON's HOLLOW story and MOVE | delete; folded into wp11/full-run's per-ship checks |
| wp9/run-flow | KESTREL's HOLLOW seeds | delete; folded into wp11/full-run |
| wp10/run-flow | VESPER's deal and near-tools seeds | delete; folded into wp11/full-run |
| wp11/full-run | runs end, but "≥ half reach the choice with 20 MERGE charge" (0/2) and "both endings" fail: the charge at the choice is about 15 | re-fly after THREAT merges (§5.2's last task) |

## Track UI

None. wp10/p2/views was re-keyed to LAST LIGHT's folded deal and its closing boot line (Track UI), and passes.

## Information-only checks

wp12/playthrough stays INFO-only. It passes after the foundation, and its kids still need the slice 2 update (rm the
seed, refuse the deal on LAST LIGHT; slice-2-plan §6.2).
