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

| Suite | Why it fails | Plan |
|---|---|---|
| wp6/edges | bites on ship 1's root (`no hollow block`) | re-key with `support/hollow-world.ts` (`plantRoot`) |
| wp6/p2-echo | ship 1's root geometry | re-key |
| wp6/p2-hud | ship 1's root and walls | re-key |
| wp6/hollow-ship2 | HALCYON's root (now: no slot) | re-key |
| wp7/bridge-test | the MOVE preview against HALCYON's root | re-key (`plantRoot`) |
| wp7/halcyon-story | HALCYON no longer has HOLLOW (no wake, no MOVE) | delete; its content moves to `threat/arrival-story` |
| lead1/story | ship 1's scripted fight | rewrite: story timing on VESPER's ARRIVAL |
| lead1/fix1/story-landing | the same, during the landing (caught by the `landing` filter) | rewrite with lead1/story |
| wp10/deal-test | THE DEAL left VESPER (folded into LAST LIGHT) | rewrite: LAST LIGHT's folded deal, verbs waiting |
| wp10/copy-test | VESPER's near-tools seed and hunting gap (HUNT stage) | near-tools → a HUNT-stage pure test; the COPY licence part stays |
| wp10/fix1/fixes | `SEED NEXT TO …` on VESPER's near-tools seeds | HUNT stage |
| wp12/p3/minors | VESPER's first seed holding SKIP | HUNT stage |
| final-fix/seed-spots | VESPER's seed spots; the fresh rack F order (046.log after Scan) | VESPER part → HUNT stage |
| wp9/seed-test | KESTREL's own HOLLOW seeds | the walls part stays for FINALE; KESTREL is beam seeds now |
| wp9/fix1/fixes | KESTREL's HOLLOW wake and first seed vs SKIP | SEEDS stage, or the seeds-only calm clock |
| wp9/fix2/fixes2 | KESTREL's wake held by the debris dodge | as above |
| lead2/dodge-rules | a seeding HOLLOW awake on KESTREL | as above |
| wp9/autoburn-sim | `infectNow` on KESTREL with no hollow block | plant a seed or root in the fixture |
| wp9/belt-unit | expects KESTREL's root (one hollow block) | count with no root |
| wp7/carry | 046.log in the packet (+2 link blocks, rack F order) | update the numbers (risk 7) |
| wp7/soft-fails | `infectNow` on a calm ship | plant a root (`hollow-world.ts`) |
| wp7/p2-models | `infectNow` on a calm ship | plant a root |
| wp12/p3/repair-renewed | `infectNow` on a calm ship | plant a root |
| wp12/fix1/fixes | the WALL lessons and an infect on a calm ship | triage: plant a root |
| wp8/fix1/fixes | the FIREWALL-next-to-HOLLOW lesson with no HOLLOW aboard | triage: plant a root |
| final-fix/two-screens | KESTREL's FIREWALL lesson needs HOLLOW aboard | move it to VESPER, or plant a root |

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
