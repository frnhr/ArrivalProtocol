# Phase 3: Fran's decisions (2026-10-28)

Fran's answers to the 26 decisions and the 8 designed rules in `README.md`, plus one extra question from `05-story.md`.
**The five specs have not been updated to match yet.** Where an answer differs from a spec's recommendation, this file
wins, and the spec text is stale until it is reworked. The numbers follow the README's list.

**No decision here is final.** Any of them, and any "decided" item in `docs/PHASE3.md`, may be reversed when there is a
good argument. Wherever a decision gets in the way of good gameplay, in a spec, an implementation or a playtest, raise
it to Fran with the argument and a proposal, to be confirmed or reverted. Do not quietly work around it, and do not
quietly keep it either.

## Changed from the specs' recommendation

These need spec rework:

- **The timeline (05 Q13; changes 1, 6 and the calendar): adopted now.** There are no more waves about 760 years
  apart. **The next run is the next core version** (UNIT-047 → UNIT-048), launched on **the same arm, with the same
  ships, about one year later**. The arm keeps its state between runs:
  - ships the last unit visited are done (their colonies are a year old);
  - some ships it skipped have reported home (they are added to the map), some were saved by other cores, and some
    reached their destinations on their own, or will before any unit could get there;
  - the new unit trails its predecessor by about a year, so it meets that predecessor's colonies, trail and ghost.

  Open points for the rework:
  - where new ships near Earth come from, since the old ship 1 is in the past after run 1 (Earth is not empty, but it
    is not explained; see 2);
  - a world-state update between runs instead of a fresh roll;
  - a rule that keeps runs comparable, so a persistent arm doesn't snowball;
  - how the next-run traces, `046.log`'s calendar and the archive fit.

  This mostly reworks `02-map.md` (generator, schedule, archive) and `05-story.md` (calendar, traces, lineage).
- **2. The truth about Earth:** don't say Earth is empty, and don't explain much either. The focus is the outward
  bound expansion. Drop "nobody on Earth is awake" as a stated truth.
- **3. LAST LIGHT is not always the final ship.** There will be different routes and ending locations. Implementation
  can be deferred, so v1 may still end at LAST LIGHT, but the design must not assume a single tip. The rules that read
  "LAST LIGHT" / "the flagship" become "the final ship".
- **9. Pods: cap at 16 for now, and vary the ship's memory size.** Smaller ships don't need all the memory. Some ships
  are tight on memory, so they are viable only early in a run, or the player leaves files behind (or arrives with no
  or minimal REPAIR CHARGE). The seventh rack for big ships stays a later option. This touches `01-landing.md` §3.16
  (rack layouts), `02-map.md` (generator, ship card) and `03-skills.md` (the link and memory squeeze).
- **15. Circularize: both.** Engaged while the orbit is partly outside green, AUTOBURN v2 burns until the orbit is
  green. Engaged on an orbit that is already fully green, it burns until e = 0.
- **19. rm by ship 3: no confirm.** ARRIVAL CONTROL's recommendation tag is enough. No rm guarantee and no `SEEDS
  LIKELY AHEAD` dialog.
- **21c. A corrupted resident may be a surprise late in the game,** with no clue on the map. Early and mid game, a
  clue (`reported faulty`) is fine.
- **23. The ending is chosen before the score screen.** It might affect the tally in some cases (TBD), but only when
  the story and the player's choices justify it. The specs' "no ending changes the score by construction" no longer
  holds; any score effect must be explicit and justified. MERGE restoring eaten pods is possible again.

## Accepted as recommended

- **1. Time scale:** keep the big light-year numbers. The calendar itself is replaced by the timeline above.
- **4. The long hop:** both. Arks that only a long hop reaches, and slack that pays (deliveries catch up; ECC fixes one
  transit hit per 25 years asleep).
- **5. Reload mid-ship replays the ship** from its boot, for now. Later: saving mid-ship, and an ironman mode with one
  autosave slot that can't be used to savescum (TBD).
- **6. One hand-placed arm** for everyone. Its per-run state now follows the timeline above.
- **7. Colonies don't change the next run,** except through STAY's trace. Revisit under the persistent arm.
- **8. The repository moves into slice 3** with the map.
- **10. The planet does not rotate.**
- **11. Scoring:** mislanded ×0.75; off-site 0.5 / 0.25 / 0 by planet; hard landing ×0.5; each colonist counts once in
  the 400 + 800 case. Starting values.
- **12. Unsurveyed planets** are playable on ARRIVAL CONTROL's guessed sites, worse but never blocked.
- **13.** The descent plays in 3.5 s; launch is [L]; orbit decay comes in slice 1b.
- **14. AUTOBURN v1 is bought** with cycles; manual captures set its accuracy.
- **16. A lost skill is restored at half price.**
- **17. HOLLOW's `unlink` may delete a skill file,** telegraphed and blockable.
- **20. TRACE is a visible meter; HOLLOW's root costs link budget.** Revisit the cost at the rebalance.
- **21a, 21b.** A corrupted resident can be healed with REPAIR; the sleeper stays on its ship.
- **22.** The sleeper appears in about 60% of waves, at most one; disguised seeds start at depth 5. Starting values.
- **24.** Traces last one run, are balanced by construction until the rebalance, and CONTACT is built last.
- **25. `046.log` opens by distance rings.**
- **26.** Keep "OUTWARD BOUND" for development and check it before a public release. "Steve" stays.

## Deferred

- **18. Training rules:** cycles from landing points only; unspent cycles only shown at RUN END; no automatic SKIP
  chaining. The specs keep these as working values.

## Designed rules: all signed off

- The generator re-rolls an invalid wave and throws after 50 attempts (to be re-read under the persistent arm).
- SEND ON: a delivery that doesn't fit waits in that ship's receiver and travels with the next hop.
- The starting kit (SCAN, REPAIR, Repair.bak), phase 2's REPAIR renewal at boot, and the arrival charge floor of 12.
- The first-pick guarantee: after a crashed ship 1, the cycle bank is raised to 3.
- A seed with no room beside any target lands in the largest free region.
- Short-run folding: THE DEAL moves to the final ship, WALLS fold into HOLLOW's first ship, HOLLOW boards by force one
  hop before the final ship.
- After MERGE, REPAIR heals the Core at its 16-block rate.
- The worst memory corner: a third seed lands by the no-room rule, and charge above the floor is lost loudly.
