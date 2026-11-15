# Open decisions: a running list for Fran

The lead keeps this list during implementation. Each item is a call that was made without Fran, on best judgement,
while Fran was short on time (2026-11-07: "Use best judgement for dilemmas. Keep a running list"). Every item says
what was built, why, and how to reverse it. The full reasoning lives in the slice plans under `impl/` and in their
Deviations sections.

Status words:
- **BUILT**: the call is in the code as described.
- **DEFERRED**: parked for a named later slice.
- **ASK**: needs Fran's answer before it can be closed.

## Slice 4 (the skill tree)

1. **RESTORE after PACK AS heals the file.** BUILT, and parked by Fran ("ok as is for now, we'll circle back once all
   the mechanics are in place").
   - A damaged v2 packed as v1 and restored for half price comes back as a fresh 100% file. That trades cycles for
     repair charge.
   - To reverse: keep the file's integrity through a restore (`skill-files.ts`).
2. **AUTOBURN v3 aims for the nearest fitting circle above DRAG, not the highest.** BUILT.
   - Measured:
     - FUEL from a low ellipse drops from −25.4% to −6.5% (v2 ROUND is −7.6%);
     - landed % and first drop are unchanged;
     - VESPER reaches its orbit in 63 s instead of 117 s.
   - To reverse: set `V3_AIM_ABOVE_DRAG = 'highest'` in `tuning.ts`.
3. **AUTOBURN v3 is a thin upgrade on healthy ships** (R15). Even with item 2, v3 mostly saves time, not pods.
   - DEFERRED to the slice 8 rebalance (price, or what v3 adds). Slice 8: v3 costs 7 (item 92).
4. **Disguised seeds are rare per run.** BUILT to the spec's per-seed rate: about 33% of seeds at depths 5–6 and about
   50% at depth 7 and beyond.
   - But only about 1 run in 3 meets a decoy, so SENTRY v1 names nothing in about 2 runs of 3.
   - DEFERRED to slice 8: raise the rate, or give SENTRY v1 more to do. Slice 8: SENTRY v1 costs 1 (item 94).
   - BUILT in slice 8 (THREAT, item 97): 1/2 from depth 5 and 2/3 from depth 7; a depth-5 run now meets a decoy 33% of the
     time (was 25%). SENTRY v1's price is the other half of the answer (ECONOMY's).
5. **AUTODROP v3 leaves pods that fit no LZ for the kid**; it doesn't throw them WIDE itself.
   - BUILT. The strip names the REPAIR.
   - To change: add a WIDE pass to `planLanding`.
6. **AUTODROP's AIM is measured against the moment the strip cues** (the whole dot fits), not the bracket's centre.
   - BUILT. 01-landing teaches "LAUNCH NOW" when the dot fits, so an obedient kid now trains AIM 94% (it was 60%).
7. **Calls built as the plan recommended:**
   - Tapping [L] instead of holding it gives a one-time lesson (R4).
   - Untrained AUTODROP fires 1.5 tac s late (R5).
   - DELETE works on a decoy without a SCAN; MOVE and COPY unmask it (R9 and B1).
   - SENTRY v2 halves DELETE on seeds, but not the root's 12 s (R10).
   - A v3 top-up that crosses an LZ window burns anyway and names the window. This happens about 1 top-up in 14 (R13).
8. **A GREEN trim in landing fires at its apsis** even if that costs an LZ window. The radio warns at the press.
   - BUILT. ROUND alone moves to the other apsis.
9. **AUTODROP adds little on healthy ships.** Every version lands the same as by hand there; the value is on hard
   ships, for example the 16-pod VESPER healed: 88% by hand, 100% at v3.
   - DEFERRED to slice 8. Slice 8: no change, with a finding (item 95).
10. **AUTOBURN v1 is untrained at first** and fires 7.5 s late (40% accuracy) until the kid's own captures train it
    (R3).
    - BUILT.
11. **The desk's ENTER trains only a cell the kid picked**, and SPACE always sets course.
    - BUILT, after review M3 found an accidental spend.

## Engineering sequencing

12. **Retiring the classic world is moved to just before the slice 8 rebalance.** BUILT (Track RETIRE, phase 3; items 85–89).
    - The classic world was the default test fixture for 166 suites, and retiring it changes no gameplay.
    - Doing it before slices 5–7 would have conflicted with every one of their tracks.
    - Slice 8's sweeps run on the arm now: every suite builds run 1's arm (or a later run's), and the classic five, their
      data, their branches and their fixtures are deleted (slice-4cde-plan "Deviations (RETIRE)", fifth pass / phase 3).

## Slice 5 (residents)

13. **A corrupted resident's engine bursts are amp 0.15 every 14 tac s, not the spec's 25%** (R3). BUILT.
    - At 25% a resident would push 1.2× harder than a failing Thrust Ctrl, which it is meant to be gentler than.
    - At 0.15 it pushes about 71% as hard, matching the spec's "two thirds of an unfixed VESPER".
14. **Resident bursts happen only during the approach, never in the landing** (R4). Pod locks happen in both. BUILT.
15. **RECEIVER CLOSED does not block deliveries** (R10). BUILT. Blocking them would let the desk forecast give away the
    hidden sleeper and the late surprise.
16. **The sleeper's RUN THE DROPS flies as AUTODROP v3's plan**, and skips between passes on its own (R11). BUILT.
    AUTODROP v2 needs input from the kid that a helper can't ask for.
17. **The sleeper's gift is 4 training cycles** (R12). BUILT.
18. **HOLD A WALL and MEND DRIVERS** (R13). BUILT.
    - HOLD A WALL places a 4-block wall once, and only when something hostile is in memory.
    - MEND DRIVERS heals at REPAIR v1's rate, costs no thread and no charge, and leaves the driver launchable.
19. **The `?` ship cards and the old-colony and signal events wait for slice 7** (R18). BUILT in slice 7d (items 75–78):
    the three `?` cards read `??? · NO TRANSPONDER`, the old colony sends a letter, the signal ship holds a `▓▓░▓` file worth
    2, and signals are found in notes, that file and CONTACT's stops.
20. **The receiver bypass animation is deferred to slice 8** (R19). BUILT in slice 8 (POLISH, slice-8-plan §2.12; item 116):
    the `RECEIVER CLOSED` line rolls and locks left to right in 1.2 s, inside its own 1.3 s boot step, instead of 04's 2.5 s,
    so no boot time moves. **For Fran, a confirm:** is 1.2 s enough of a tell? To lengthen it, the boot's line step would
    have to grow for that line (`BOOT_LINE_AT_SEC`) and every boot wait after it.
21. **A departed resident's leftover skill card takes no link room.** BUILT. It is granted and installs at the next
    boot, the same way the +2 CYCLES card does. This keeps the leftover deck a pure bonus. To change: route it through
    the packet in `draft.ts applyLeftoverPick`.
22. **MOTH's gift (4 cycles) is paid whenever the sleeper was woken,** whether the ship lands or is lost. BUILT.
23. **MOTH's job keys are R, H and T.** BUILT. The spec's D/W/M clash with keys already bound in play: M mutes the game,
    and W and D are flight presets.
24. **An ignored corrupted resident empties the tank before ORBIT LOCK,** just as an unfixed failing Thrust Ctrl does.
    BUILT, and measured on GANNET, seed 7:
    - an ignored resident ends the flight at 0% FUEL, with 41 bursts and 2 pods parked locked;
    - any answer saves the flight: DEAL accepted 19.6%, deleted 20.8%, cured 23.3%, against 23.7% with no resident.

    The resident pushes about 0.7–0.8× as hard as the controller, but over a whole approach that still drains the tank.
    The pressure to act seems right, but it is harsh for a kid who never opens the MIND. DEFERRED to slice 8: a lower
    amp, or bursts that stop after the first lock.
    - BUILT in slice 8 (THREAT, item 98): amp 0.10. An ignored resident no longer strands a flight; it still empties the
      tank by ORBIT LOCK.
25. **HOLD A WALL adds little.** Any free run with room for the 4-block wall already counts as a WALL under the kid's
    own rule. So MOTH.wall never stops a bite that would otherwise land; it only keeps that run from being filled.
    - BUILT as specified.
    - ASK, or DEFERRED to slice 8: make the job do more. For example, wall off the nearest seed's reach, or let the
      wall heal.
    - BUILT in slice 8 (THREAT, item 99): MOTH.wall stands in a GAP, 2 blocks or the whole GAP, and stops every bite
      across it.
26. **The sleeper's help, measured on CURLEW over five seeds (landed %):**
    - by hand: 71%;
    - RUN THE DROPS, no hands: 77%;
    - MEND DRIVERS, then by hand: 83%;
    - AUTODROP v3 bought: 83%;
    - RUN THE DROPS with the kid launching as well: 66%.

    The last row is low because the strip still said `press [L]`, which the slice 5 fix pass silences.
27. **To wake BARNABY on CURLEW, the kid needs DELETE or MOVE.** On seed 7's route the unit arrives with only SCAN and
    REPAIR, so the sleeper can be missed unless the kid requested DELETE or MOVE. BUILT as specified (the wake is an rm
    of the lock, or a MOVE of the sleeper). DEFERRED to slice 8, or ASK: should a SCAN plus REPAIR also wake it?
    - BUILT in slice 8 with no change (THREAT, item 100): a kid who requests what ARRIVAL CONTROL tags reaches CURLEW with
      DELETE and MOVE. "SCAN and REPAIR only" came from the old sweep's own sends, which requested nothing.
28. **A locked pod that nothing aboard can free stops holding the landing open** (slice 5 review M3). BUILT in the fix
    pass. "Nothing" means no DELETE, too little charge to cure, and no DEAL left.
    - The pod parks locked, the landing ends the normal way, and the strip names it.
    - If a remedy appears later, the pod is launchable again.
29. **On HOLLOW's boarding ship, the late surprise may wake in the landing and only lock pods** (review D1). BUILT.
    WARDEN waits for HOLLOW's first fight, so its engine moment happens only on a ship where HOLLOW isn't new.
30. **A departed resident's leftover skill card picks at random among the allowed skills** (review D2). BUILT in the
    fix pass. It was always the first open branch (AUTODROP in 150 of 150 decks).
31. **The chart's signal glyph shows only where the ship card already shows the resident's kind** (review D4). BUILT in
    the fix pass, so it never narrows an `unknown` card.
32. **No hazard zone damages a corrupted resident's file** (slice 5 review m7). BUILT in the fix pass. The radiation belt
    peppers racks A and B, where WARDEN.sys sits, so a belt ship could lower it. Its health is only the cure's price (04
    §3.12), so a hit would raise that price at random, and at 0% it would stop firing but still lock and deal. Leftovers still
    take hits. To change: `zones.ts damageable`.

## Slice 6 (SURVEY)

33. **Exactly one bad guessed LZ per POOR planet,** ROCKY or WET, half and half (R3). BUILT.
    - ROCKY: every pod lands hard (×0.5).
    - WET: hard as well, and the bracket is a third narrower.
    - The cost is about one cycle step: 12–25% of the points.
34. **WET's narrower bracket is drawn and scored from the boot; only the word is hidden** (R4). BUILT. The reveal
    changes no geometry, so a pod is never re-scored as off-site.
35. **Without SURVEY, the first touchdown on the bad guess reveals it,** with CONTROL's lake or rocky line (R5). BUILT.
36. **SURVEY starts by itself and stops at 100% mapped** (R7). BUILT. A PAUSE button in the SITES window releases its
    thread; there is no new key.
37. **SURVEY claims a thread only if one stays free,** and yields to AUTOBURN's and AUTODROP's claims, never to the
    kid's ops (R8). BUILT. Since the review fixes it steps aside whenever either holds a thread (55).
38. **The sleeper doesn't teach SURVEY;** its gift stays 4 cycles (R17). BUILT.

## Slice 7 (endings and traces), from the plan; numbers are confirmed as each sub-slice lands

39. **SUNSET's "empty ship"** is the final ship in orbit with no pod aboard and FUEL ≥ 20% (R8).
    - The FUEL bar's ★ notch marks it.
40. **STAY's colonies are judged per ship** (R9).
    - A sub-pick appears only when there is more than one colony, newest first.
41. **UNRESOLVED** (R10):
    - an `IT FOLLOWED YOU` card;
    - no `046.log` entry 12;
    - SUNSET is still allowed.
42. **Epilogue numbers** (R20):
    - set 40 years on;
    - doubling every 100 years;
    - 2 significant figures;
    - at most 16 lines, with older colonies folded.
43. **Who flies MERGE's restored pods** (R27):
    - AUTODROP v2 and v3 fly them through the override, with source `'merge'`;
    - v1 times each pod, but takes the windows in pass order;
    - with no AUTODROP they drop blind, at ±(W/2+150 km) and double spread;
    - AUTODROP gets two orbits.
    - BUILT in 7b, with the cadence at 2.0 tactical seconds. The sweep on LAST LIGHT (168 pods per flier) measured:

      | Room | Blind | v1 | v2 / v3 |
      |---|---|---|---|
      | Every LZ open | 56% landed, worth 0.78 GENTLE / 0.56 HARSH | 100% | 100% |
      | Room only in LZ-B | 5% | 14% | 100% |

    - The kid can't launch a restored pod by hand (`MERGE IS FLYING THEM — [ENTER] SKIPS TO THE END`).
44. **Where the next run's gifts wait** (R31). BUILT (7c foundation, `systems/traces.ts placeTraces`):
    - never on TIGHT, authored, `?`, first or final ships, except named fallbacks (SUNSET's first ship, STAY's final ship,
      allowed for their kind whatever they are; run 1's arm has both authored);
    - 046's cache goes on Marrow or Ostrava (else any layers 2–6 ship); two kinds never share a ship;
    - measured: in 1,350 RUN STARTs (runs 2–4 × the 15 endings × 30 seeds) every placement passed the save's check; in the
      sweep's 20 seeds each gift's ship was on a route 59 times of 60.
45. **What the gifts are** (R32). BUILT (Track TRACE):
    - each is +15 REPAIR CHARGE through the normal arrival path, so the PACKET, the layout and the boot's charge line count
      it (`+ 15 (GIFT)` in the PACKET's sum since the review);
    - SPARE adds the first of THREAD+ and FIREWALL.sys the unit lacks, and its beam carries no seeds; SUNSET a spare tool,
      Rm first (charge only with none in the kit); STAY a letter from the colony in that boot's INBOX;
    - measured (the sweep, 20 seeds): every gift lands, +15.0 / +14.9 / +15.0 charge at its ship (SPARE / SUNSET / STAY;
      one SUNSET squeeze took a block); SUNSET +0.4 pods, STAY +0.1 against no trace.
46. **The final ship's traces** (R33). BUILT (Track TRACE, with the review's hunt fix):
    - PURGE wipes beam and delivery seeds, and bites ×0.85 (12 → 10.2 s);
    - MERGE gives +1 thread capacity and an 18-block root;
    - the non-compliant choices cost one wild seed, one a run however many are held;
    - REASSIGNMENT's root unlinks your highest-version `.skl` first: RM takes it whatever rmTargets' tier (the review; it
      used to wait behind every spare tool), and the FINALE's seeds land in a hunting gap left before it;
    - measured: see 70 (the hunt reaches the skill; REASSIGNMENT stays +1.2 to +1.6 pods).
47. **The relay strangers alternate 031 and 038 by run** (R34). BUILT (Track LINEAGE): 031 on runs 2 and 4, 038 on run 3,
    whatever the last ending; the boarding ship's boot closes with `> another one. they keep sending you.`
48. **The strangers' logs have 6 entries; `047.log` has 7** (R37). BUILT (Track LINEAGE).
    - The segment id stays `log046`; every screen that names the file (the key line, SCAN, the PACKET lock, INSPECT, READ)
      names the book since the review.
49. **The `▓░` glyph shows on `?` ships that carry fragments** (R40). BUILT (7d, `resident-hud.ts signalGlyph`): on the signal
    ship and the gone-resident ship once a fragment is held (item 31 holds: a `?` card names no kind), and on a CONTACT stop
    whose file waits (item 77).
50. **CONTACT's trace** is two signal stops, each worth +8 charge and a fragment (R41). BUILT (7d), and
    `ENDINGS_BUILT.contact` is raised: CONTACT is on the card, priced at 3 signals, with its trace on the next run (items
    79–82).
51. **ENDING CHOSEN stays at the final report's open, not at step 2** (R14). This deviates from 02 §4.
    - A reload during the FINALE replays the final ship, because the save can't hold a mid-landing state.

## Slice 6, measured

52. **SURVEY v2 fell well short of "within 3% of GOOD".** On 42 POOR ships it scored −14.0 points against GOOD,
    and v3 −13.0. For comparison, no SURVEY scored −22.6 and v1 −18.6.
    - **Why:** in a landing orbit the drop dot leads the ship by about 80°, and the swath lies under the ship (01 §3.13).
      So the first window of an LZ the approach didn't map often comes before the swath reaches it: v2 revealed the bad
      guess before the first pod on only 20 of 42 ships.
    - **Decision:** BUILT in the slice 6 fix pass. During the landing, SURVEY v2+ also maps a swath around the drop
      dot ("the sensors look where the pods will go"). This deviates from 01 §3.13's geometry.
    - The alternatives were a strip row that holds a window while the ground is unknown, or letting an LZ move with
      pods already down. Both were rejected: the first costs the kid time, the second changes scoring.
    - **Result:** v2 now shows the bad guess before its first pod on 42 of 42 ships (it was 20), and scores −0.7
      points against GOOD (it was −14.0). v3 scores +0.0. No SURVEY and v1 are unchanged.
53. **SURVEY v1 is too flat.** It earns +0.24 cycles per POOR ship for a price of 2, so it pays back after about 8 POOR
    ships, and a route meets about 1.3 (slice 6 review, "For the designer" 1–2; the sweep's 42 POOR ships, seeds 1–10).
    v1 can't see ground, and the drop-dot swath (52) is v2+'s, so all it adds is ROOM, WIDTH and a blind move. v1 + v2
    pays back after about 3.5 POOR ships. DEFERRED to slice 8 (R25 keeps prices fixed in slice 6). The options:
    - price v1 at 1 cycle (03 §3.2 already says "SURVEY cheaper");
    - let v1 rate ground roughly (say, `GROUND ?` against `FLAT?` on a guess the swath passes);
    - or raise the POOR odds where SURVEY can open.

    Slice 8 took the first two (items 90, 91).
54. **v3 over v2 adds +0.02 cycles for 4 more** (+0.7 points in the sweep). Its value is only the thread: the kid's
    second op on a 2-thread Core, and mapping on a worn Core where v1/v2 wait all ship. The sweep can't see that, since
    its kid runs no ops. DEFERRED to slice 8, to be measured with a kid who SCANs and DELETEs seeds on a POOR ship that
    HOLLOW boards (CORMORANT, seed 7). Slice 8: that measure is not valid yet (item 96).
55. **SURVEY steps aside while AUTOBURN or AUTODROP holds a thread** (slice 6 review M1; the lead's decision). BUILT in the
    review fixes. Before, AUTOBURN's claim at START BURN took the thread SURVEY keeps free, so both held one and the capture
    flew at a 0.5 reactor cap, not 0.75 (0.43 degraded, 0.30 failing), a burn the kid never chose. Now a preempting claim
    takes SURVEY's thread whenever it holds one (`ops-core.ts reserveThread`), and SURVEY claims no spare thread while
    either skill holds one (`survey.ts syncThread`). It never adds to their thrust or thread cost.
    - **Measured** on seed 7's CORMORANT (healthy, the strip's kid, AUTOBURN v1 engaged within LOCK RANGE, FUEL at ORBIT
      LOCK): no SURVEY 31.3%; SURVEY v1 or v2 before the fix 30.3%, the capture burn at 0.5 and half as long again (352
      ticks against 233); after the fix 30.7%, the burn at 0.75 as with no SURVEY. The 0.6% left is the approach's THRUST
      LIMIT while SURVEY maps (the kid's own burns, before AUTOBURN engages). v3 holds no thread: 31.3% either way.
    - It captured either way here; the cut mattered most on a damaged reactor. To reverse: drop the step-aside in both
      places, and correct R8's text back.

## Slice 7a, built

56. **CONTROL has one compliance rule** (7a review M2; the lead's decision, 05 §3.8's rule). The unit is non-compliant
    exactly when the ending holds SPARE, SUNSET, STAY or CONTACT; every other ending is compliant, so MERGE +
    REASSIGNMENT and UNRESOLVED + REASSIGNMENT get CONTROL's thanks. BUILT: `ending-rules.ts controlCompliant(hollow, you)`
    is read by the FINALE's verdict and the epilogue's last line, and 7c's wild seed (R33) must read it too.
    - This reverses WP11's "MERGE is non-compliant" (`we saved you a seat` was a disobedience) and FINALE's Deviation 4.
    - To reverse: change `controlCompliant` alone (for example add `hollow !== 'merge'`); the verdict, the epilogue and
      the wild seed follow.
57. **The engine is shut in MERGE's reopened landing** (7a review M1). BUILT: `selectors.ts engineOpen` is false at
    `'last-landing'`, and GO LOWER is not offered there. SUNSET's FUEL is frozen in the ending record at the confirm, so
    the ship leaves with the FUEL the card priced, and the kid can't fly it into the planet after choosing it. The pods
    still launch by [L]. 7b's R26 input layer keeps the same lock. To reverse: drop the phase test there, and re-freeze
    `record.fuelPct` when `'last-landing'` ends.
58. **The FINALE card's words after the review** (the designer's items 2–4). BUILT, all in `data/finale-text.ts`:
    - **The asleep line, when the landing is already over** as the root falls: HOLLOW says only `> 047. wait.` (nothing is
      left to finish) and step 1 opens at once (R6), without waiting for a long line or a TERMINAL backlog.
    - **SUNSET after SPARE** says why it is out: `SPARE GIVES IT THE SHIP`. It is named whenever the empty ship was there
      (SPARE's own price), so it never reads `???` for a price that was met.
    - **An open row's price reads as met:** `FUEL 23% ✓ · needs 20%` (was `NEEDS FUEL 20% · you have 23% ✓`, which read
      like a refusal). A short row keeps `NEEDS FUEL 20% · you have 12%`.
    - Also (item 5): the MERGE epilogue line is `UNIT-046 is part of UNIT-047 now.`, without `It doesn't bite.`
59. **The `twoStep` and `night` gates are gone** (7a review (e)). Both were raised for good by Tracks FINALE and NIGHT, and
    no suite ran either one down. Dropped with them: WP11's one-step FINALE (`chooseFinale`, its card words, typed
    endings, echoes and refusal), the RUN TALLY's own NEW RUN, endings line and bridge, the title's `ENDINGS n/2`, and
    `__ap.choose` / `__ap.endingLines`. `ENDINGS_BUILT` keeps only `contact` (7d). Not reversible by a flag: restoring a
    one-step FINALE would mean restoring that code from git (before 60a47be).

## Slice 7b, built

The 7b review's gameplay calls (`docs/phase3/impl/slice-7b-review.md`; the plan's "Deviations (7b review fixes)"). 7c may
number its own items from 60 too; renumber at the merge.

60. **No drop solution during THE LAST LANDING drops the pods blind** (review M1; 01 §3.17, R27). With Nav Plotter dead or
    missing, the drop cache still solves the geometry while THE LAST LANDING runs (the pods' own motors find their fall),
    its dot grey and uncertain, and every pod drops blind (±(W/2 + 150 km), ×2 spread). A flier that loses the plotter
    mid-landing (a belt hit; the MIND is shut, so nothing repairs it) turns blind for the pods left, and the strip says so.
    It used to end the landing after 6 s with the pods parked. To reverse: drop `plotted` in `drop-cache.ts recompute` and
    the switch in `last-landing.ts tick`.
61. **Out of the band, THE LAST LANDING still parks the pods** after `LANDING_NONE_LEFT_SEC` (review m3). 01 §3.17 lists "the
    ship out of the band" under the blind drop. Kept because the band is the one rule every launch meets, a launch from
    outside it would need its own refusal and window rules, and the engine is shut there (57), so nothing the kid does
    changes it. To build 01's version: let a blind `'merge'` launch skip OUT OF THE LAUNCH BAND and let `nextTurn` take
    windows with no in-band part.
62. **Bay Ctrl missing does not end THE LAST LANDING** (review B2). Its pods leave from no bay (R26), so `landingStuck`'s
    `'bay-offline'` does not apply while it runs.
63. **A ship lost during THE LAST LANDING takes it along** (review B3). The landing ends `'ship-lost'`, the restored pods
    still aboard are NOT LAUNCHED, the machine clears to `'done'` in the post tick, and the LOST card's run end follows
    (`flagship-lost`). The header and the POD BAY row paint nothing then.
64. **The kid's AUTODROP is shut while MERGE flies** (review M2). [G] (and the POD BAY's [G]) is refused `MERGE IS FLYING THEM
    — [ENTER] SKIPS TO THE END`, and the pass's [−]/[+] do nothing (dimmed). MERGE's v2 flies its own pass
    (`LastLandingState.pass`); the kid's AUTODROP machine is never written during THE LAST LANDING.
65. **The suites' instant landing leaves THE LAST LANDING to fly** (review M3). `wp11/full-run`, `wp12/playthrough` and
    `wp11/p2/views` play R27's rules after a MERGE instead of landing the restored pods soft in an LZ with room.
66. **Known engineering debt, carried to slice 8:** BUILT in slice 8 (POLISH, slice-8-plan §2.11; items 113–115).
    - **[ENTER] in THE LAST LANDING freezes the page while it fast-forwards.** It took 2.1 s for 3 blind pods in
      Chromium. The fix is to fast-forward over several frames. BUILT: the skip runs in 12 ms slices, so the longest task
      is under 100 ms. It ends in exactly the one-call skip's state (`ending/last-landing-frames`).
    - **The BALANCE_ONLY `wp12/playthrough` on the classic five had stuck runs** (`stuck:printing on LAST LIGHT`,
      6 LITERAL and 6 SLOPPY PURGE runs). CLOSED with the classic world's retirement (item 12): the harness flies the arm
      (item 88, which ended the stuck runs), and the classic five it rotted on are deleted.

## Slice 7c, built

The 7c review's calls (`docs/phase3/impl/slice-7c-review.md`; the plan's "Deviations (7c review fixes)"). 7d may number its
own items from 67 too; renumber at the merge.

67. **The hunt ignores RM's tiers** (R33's "first"; TRACE's patch 3). BUILT: `hollow.ts chooseVerb` takes REASSIGNMENT's
    hunted `.skl` (`huntable`: a skill file, never `rmProtected`) whatever `rmTargets`' tier, and `landVerb` accepts it while
    the hunt is on. An op already running on the skill drops the preference for that verb (it would be blocked at once), so
    the tier's draw stands. To reverse: `prefer` only from `rmTargets` again (the spare tier first).
68. **The FINALE's seeds get a hunting gap before the hunted skill** (TRACE's optional patch 4). BUILT: `carry.ts
    layoutCarried` leaves WALL + seed + gap (7 blocks) before the skill on a `'near-skill'` final ship when the receiver has
    the room, as VESPER's tools get. On a full receiver the boot's REPAIR licence can take part of it (the last free run that
    fits); the seed then lands beside the skill only if a seed still fits there, else the FINALE's own spot. To reverse:
    `huntingGap` returns none for `'near-skill'`.
69. **The face names an unnamed root as it speaks** (review m). BUILT: the face's first line runs `nameHollow`, so the root's
    blocks read `UNIT-047` under `> hi 048. it's 047.` when no story beat had named HOLLOW this run.
70. **REASSIGNMENT's lead stays, DEFERRED to slice 8.** After the hunt fix, the sweep (20 seeds, the WP11 defender, the
    instant lander) has the root telegraph RM at a `.skl` 4.8–5.7 times a final ship (it was 0–0.1), and unlink none: the
    defender blocks every verb with an op, as a kid who watches the TERMINAL does. The four REASSIGNMENT endings read +1.5,
    +1.6, +1.6 and +1.2 pods against no trace (TRACE measured +1.3, +1.3, +1.5, +1.2), outside ±1. The allowance's +15 is the
    gain; the hunt costs only a thread and a SCAN. Slice 8's levers: a smaller allowance, a hunt RM that a SCAN cannot block
    (or that comes faster than the telegraph), or a cost on pods.
    - **BUILT in slice 8 (Track ENDINGS, item 105), [FRAN] confirm:** the allowance is its own number, +8. REASSIGNMENT,
      MERGE+ and SPARE+ come within ±1 (+1.0, +1.0, +0.5 on 20 seeds); PURGE+REASSIGN stays +1.6, for PURGE's own reason
      (item 106).
71. **The boot's charge line folds its parts when they pass 70 characters** (review B1). BUILT: `data/script.ts chargeLine`
    drops `CHARGE` from the later parts (`+12 (CARD)`), and with all four sources at their widest says one sum
    (`+144 CHARGE (★★★ CARD GIFT FLOOR)`). The full line with ★★ + CARD + GIFT was 76 characters and stopped the final boot.
72. **The title shows the last ending's NEXT RUN: lines** (02 §3.12; CHART's optional patch). BUILT: under the ENDINGS line,
    as the final card said them (`systems/title.ts titleModel.traces`). None on run 1 or after a run with no ending.
73. **A given gift's `· FOUND` row is never on screen.** NOTED: the DESK only shows reachable ships' cards
    (`desk.ts selectShip`), and a gift's ship is behind the unit once it is given. The row stays (it is free) for a later
    card that shows passed ships. To use it: let the card open on a passed ship.
74. **`LINEAGE_BUILT` stays until 7d** (review m). BUILT (resolved in 7d, with `TRACES_BUILT.contact` raised): the gate is
    gone with its gate-down paths, as 59 did for 7a's gates: `meta.ts hollowUnitsAfter` and `hollowName` (mid-run HOLLOW is
    always `midRunHollowUnits`), the won and UNRESOLVED ghost lines (`GHOST_LINE` is null for them, `GhostWords.hollow`
    dropped), `logBookOf`'s 046.log-on-every-book branch, and `lineage-boot.ts`'s gate. `TRACES_BUILT` stays as a per-kind
    table, every kind raised (item 83).

## Slice 7d, built

The calls one agent made building 7d's FOUNDATION and both its tracks (`docs/phase3/impl/slice-7-plan.md`, "Deviations
(7d)"; the self-review is `docs/phase3/impl/slice-7d-review.md`). Renumber at the merge if another branch took these numbers.

75. **What a `?` card shows** (R39). BUILT (`unknown-events.ts unknownCard`): until the ship is visited, the card keeps its
    public schedule and the unit's own rows (the years and TIMELINE, the trip's cost, the fit, MEMORY, BEAM and NOISE or
    OUT OF RANGE, DELIVERIES, HOLLOW's boarding warning, ONLY FROM HERE, the run's count, its history and trail rows). KNOWN
    PROBLEMS, RESIDENT, PLANET, SITE DATA and LANDING read `??? · NO TRANSPONDER`; the colonists and pods read `???`, the ARK
    tag goes, and the rows whose presence alone would tell (no Swap for an ENGINE FAULT, the no-go sites) are dropped. The
    chart labels it `NAME · ???` and draws an ark as a standard ship. The PACKET's headline, after SET COURSE, still names its
    colonists. To reverse: `UNKNOWN_EVENTS_BUILT` down, or widen `PUBLIC_ROWS`.
76. **The old colony's letter** (R39). BUILT (`signals.ts unknownMessages`): one letter in the `?` ship's boot INBOX, from
    OLDWELL (UNIT-009), SUNDIAL (UNIT-017) or CANDLEWICK (UNIT-024), picked by the ship's own key stream (the same ship holds
    the same letter on any route and run), `SENT ????`, four lines each. The units are older than the relay strangers (031,
    038), so no unit the kid meets is older. The words are drafts (05 names the colonies, not their mail): `TODO(05)` in
    `data/unknown-text.ts`.
77. **Signals beyond the notes** (R39, R41). BUILT: the signal ship's `▓▓░▓` file (1 block in rack A after Cargo Ctrl, SCAN
    only, no health, a blocker) gives 2 fragments; a CONTACT stop's file gives 1; a note still gives 1. A slot can hold one
    record per source (a CONTACT stop may also be a departed resident's ship with a note). The stamp says `SIGNAL · n/3` up
    to 3, then `SIGNAL · n` (a run can find up to 7). A file not SCANned before the ship ends is missed, as a note is.
    To reverse a source: drop it from `signals.ts signalSourceAt`.
78. **The glyph on a CONTACT stop** (02 §3.5's "every other fragment ship"; beyond R40). BUILT: a CONTACT stop whose file
    waits wears `▓░` once a fragment is held, beside its `◆`. Its card's TRACE row names it already, so nothing is narrowed.
    To reverse: drop the `contact-stop` line in `signalGlyph`.
79. **CONTACT's row** (R41, R11). BUILT: out of reach it reads `COLLECT 3 SIGNALS · you have n` (`???` until CONTACT was
    ever chosen), open it reads `SIGNALS 3 ✓ · needs 3` (`FINALE_TEXT.price.signals`, the 7a review's suggestion) with its
    meter. The signals are held, never spent, so the next run's count starts from zero anyway. The codec refuses a CONTACT
    ending that holds fewer than 3.
80. **CONTACT's epilogue piece fills the "two minds" gap.** BUILT: as REASSIGNMENT's and STAY's, MERGE + CONTACT has its own
    second line (`It took two minds to listen. Neither one is hungry now.`) and UNRESOLVED + CONTACT a third
    (`UNIT-046 went too. It listens better than it talks.`). Drafts against 05 (`TODO(05)` in spirit: 05 writes two
    epilogues only).
81. **CONTACT's stops on the next arm** (R41, R31). BUILT as 7c placed them: two ordinary ships in layers 5–7 (never
    authored, `?`, TIGHT, first or final), one place a ship; 40 of 40 run-2 arms in `signals/contact` get both. An arm with
    fewer open ships gets fewer stops (the codec allows 0–2), and CONTACT's gain shrinks with it. Each stop is +8 through the
    arrival path (`> A SIGNAL STOP · +8 REPAIR CHARGE · ▓▓░▓ IN RACK A`), given as the line is said, and its file waits in
    rack A until the ship ends.
82. **CONTACT's NEXT RUN: line** is `+ 2 signal stops on the map · − 1 more seed at the end` (`− that same seed` after a
    non-compliant step 1), in 05 §3.12's style. The stop count is templated from `TRACE_PLACE_COUNT.contact`.
83. **`TRACES_BUILT` stays, every kind raised** (with item 74). NOTED: item 74 names only LINEAGE's gate-down paths. Retiring
    `TRACES_BUILT` would also drop `trace-hud.ts`'s `built` rule that `traces/ui-models` and `traces/lineage` use to paint
    and fly each kind both ways. To finish it: delete `TRACES_BUILT` and `traceBuilt`, and move those suites to hand-built
    traces only.
84. **CONTACT is built and its gate raised**, not shipped dark. BUILT: its row, price, words, title, epilogue piece, trace
    and stops are complete and tested (`signals/contact`, `ending/*`, `traces/*`, the e2e `signals.mjs`). Balance is slice
    8's: the sweep of 7c (`traces/traces-sweep`) does not fly CONTACT yet.
    - **BUILT in slice 8 (Track ENDINGS, items 107 and 111):** traces-sweep flies CONTACT's three cases (−0.5, −0.3, −0.8
      pods, each stop +7.8), and CONTACT's price is 2 signals. `contact.open` is still under its band with the playthrough's
      kid (item 111).

## Retiring the classic world

Track RETIRE (slice-4cde-plan §9; item 12). Done: phase 1, phase 2 for every quick suite and both BALANCE_ONLY
playthrough harnesses, and phase 3 (the classic five's data, every `world` branch, their fixtures and the debug jumps
deleted; `__ap.ship(n)` jumps along run 1's worked route). `map/memory-refactor` (the classic digest) and
`map/classic-boot-plans.txt` are deleted. The plan's "Deviations (RETIRE)" has the details: each deleted check with its
reason, the classic licence schedule's included (item 89).

85. **The headless fixture world is run 1's arm.** BUILT, and since phase 3 the only one: `createInitialState` with no map builds run 1's arm on the seed,
    with the unit on authored ship `shipIndex` (0 ARES-VII … 4 LAST LIGHT) along the worked route. Each stop carries its
    real hop, the nominal route's threat and a passed result. `run.shipIndex` is that stop's depth − 1, so LAST LIGHT is
    depth 6, through CORMORANT. `carried: 'fresh'` lays a fresh unit out for the hop. (Until phase 3 a suite not moved
    yet imported `support/classic-world` to stay on the classic five; that fixture and `useClassicFixture` /
    `inFixtureWorld` are deleted.)
    The probe: 135 of 223 quick suites passed unchanged, each with the same number of checks. 33 more moved after fixes:
    the harness helpers learned the class's memory size, the worked-route desk, the kit and the passed results. Of those
    33, 17 kept a check of a classic-only branch, built with `withClassicWorld`; phase 3 deleted those checks with the
    branches. `map/arm-parity` pins run 1's seed-7 arm (its 20 ShipDefs, its built ships, a flown run) and did not move.
86. **A ship alone on the arm carries the worked route's kit, opt-in.** DECIDED (the lead) and BUILT
    (`support/arm-ship.ts WORKED_KIT`, the `kit` option of `shipAlone`, `lastLight`, `vesper` and `kestrel`).
    - The kit is MOVE by HALCYON, DELETE by KESTREL, SWAP by CORMORANT and COPY by LAST LIGHT. VESPER gets no SWAP: it
      arrives 4 years late.
    - That is what 02 §3.14's requests deliver (`map/run1-route` pins each delivery). On the classic five, the licence
      schedule played this part.
    - `vesper({ hunt })` also gives COPY and SWAP, the tools phase 2's VESPER fought the HUNT with.
87. **The save codec refuses a `'classic'` world; it does not migrate one.** DECIDED (the lead) and BUILT (phase 3):
    `RunMapState.world` is the literal `'arm'`, the codec's `oneOf('arm')` refuses anything else as `shape`, and the
    separate `'classic'` refusal and its text are gone. `save/codec` checks that a hand-edited `world: 'classic'` payload is
    refused cleanly (`shape`), not thrown.
    - No save ever held a classic world: encode always threw on it (3c), and the page never routes through the classic
      five.
    - There is nothing to migrate to. A classic save's route and ships have no arm counterpart: VESPER → LAST LIGHT is
      83 LY, out of range.
    - Phase 3 narrowed `RunMapState.world` to `'arm'` but kept the field, so no save bump was needed.
88. **The BALANCE_ONLY harnesses fly the arm** (slice 8 needs them there). BUILT:
    - `wp12/playthrough` plays the worked route (or `PT_ROUTE`). At each desk its kid makes the first pick, trains its
      `buys` list (COMPETENT and LITERAL buy down AUTOBURN, AUTODROP and SENTRY; SLOPPY only the pick), requests the tag
      and sets course.
    - The strip-asked kids now read the landing's L0 row (`EVERY POD IS DOWN — now DELETE THE ROOT`) as the ask. That
      ended item 66's `stuck:printing on LAST LIGHT` runs: 2 seeds each of COMPETENT, SLOPPY and LITERAL end.
    - `wp11/full-run` checks the arm's facts (tools by request, the forced boarding at CORMORANT, VESPER without SWAP).
    - Measured on seeds 1–6 (`PT_SEEDS=6`), every kid's run ends:
      - COMPETENT: 92% woke, won-merge 2, won-purge 3, flagship-lost 1;
      - SLOPPY: 75% woke;
      - LITERAL: MERGE's 20 charge at the choice in 3 of 5 runs.
    - **Known gap for slice 8:** MERGE's margin is thin on the worked route (slice-3a risk 6: "the MERGE margin moves to the
      route"). COMPETENT has the 20 charge in 2 of 5 runs (median 11). `full-run`'s quick seed 4 reaches the choice with
      13, so its "the quick seed reached its MERGE" check fails in `npm run balance` until the rebalance.
    - **BUILT in slice 8 (Track ENDINGS, items 108 and 109), [FRAN] confirm:** MERGE costs 16. `full-run`'s quick seed is 6
      (19 at the choice), and its MERGE share is information: the target is the playthrough's (G6b). LITERAL stays under 50%
      at any price the ladder allows (item 108).
89. **Tests of the classic licence schedule are deleted, not moved.** That schedule is COPY at the boot and SWAP at the
    first ghost. DECIDED (RETIRE): 03 §6 retires that schedule, so the arm has nothing for those checks to test.
    - Checks in the same suites that test behaviour the arm keeps (the DEAL, SWAP pairing, the ghost) move to the arm.
    - Each deletion is listed in slice-4cde-plan "Deviations (RETIRE)".

## Slice 8 ECONOMY, built

ECONOMY's calls (`docs/phase3/impl/slice-8-plan.md` §2.1–§2.3, §2.15, §2.16 and "Deviations (Track ECONOMY)"). The lead
renumbers them at CLOSE. "Before" is the Step 0 quick report (1546a2b, the same numbers at af1e1d4); "after" is this branch,
quick profile, under a shared machine (load 20–28).

90. **SURVEY v1 costs 1 cycle** (OD 53; §2.1 change 1). BUILT (`data/skills.ts`). SURVEY is 1 / 3 / 4.
    - v1 earns 0.5 cycles per POOR ship over none (0.4 before the tell, item 91), so it pays back after 2 POOR ships
      (8 before). v1 + v2 cost 4 and pay back after about 2.5 POOR ships (3.5 before).
    - A price moves no point, so `survey.gap.v1` is not this item's: item 91 is.
    - To reverse: `SKILL_TREE.survey.versions[0].price` 2, `SPEC_TREE_CYCLES` + 1, 03 §3.2.
91. **[FRAN] SURVEY v1 gives a rough tell** (OD 53; §2.1 change 2, triggered: v1 closed 21% of the gap, under 40%). BUILT
    (`survey-model.ts guessTell`, `survey-hud.ts`, `sites-text.ts`).
    - A CONTROL guess the ship's own swath has passed, not rated, reads `FLAT ?` or `ROUGH ?` in SITES. The plan's words were
      `GROUND ?` against `FLAT?`; `GROUND ?` already means "not looked at", so the bad one reads `ROUGH ?`.
    - It only tells. The ground stays unknown: no ✕, no reveal, no strip swap (`knownBad` and `bestSwap` stay v2's), and a
      move to a found candidate is blind. The drop-dot swath (OD 52) stays v2's.
    - **Measured** (survey-sweep quick, 14 POOR ships): v1 closes **29%** of the none→GOOD gap (21% before); v2 and v3 stay
      at −0.2 points against GOOD. **Still LOW.** The tell comes too late on most ships: the drop dot leads the ship by
      about 80° (OD 52), so the first window of the bad guess usually opens before the ship's own swath reaches it. On 8 of
      14 ships v1's kid still lands pods on the bad guess (`r:touchdown`), as before the tell. The plan's
      fallbacks for v1 are both built; the next lever would be the drop-dot swath at v1, which is OD 52's v2 power.
    - To reverse: `guessTell` returns null (and survey-sweep's v1 kid stops reading it).
92. **AUTOBURN v3 costs 7** (OD 3; §2.2 change 1). BUILT. 7 is the lowest the validator allows on a start branch (more
    than one ship's 6).
    - `worth.autoburn.v3`: 0.13 ± 0.07 → **0.03 ± 0.04** (LOW; A/B of items 90–94 together, 24 seeds; Δpods 0.25 → 0.13 per
      run, over 3.8 cycles a run spends on v3 now). The move is about one standard error of the difference: 24 seeds
      cannot tell 7 from 8, and the re-priced tree changes what the kid buys when. `worth.autoburn.v3ratio` stays OK (1.0).
      The full profile (50 seeds) at CLOSE should settle it.
    - **§2.2's fallback (v3 holds any landing orbit the kid chose against decay) is not built.** Its trigger is this row,
      which read OK before the re-price and reads LOW inside its noise after. And it could not move the row: it acts only on
      an orbit the kid chose (GO LOWER, a hand burn), while COMPETENT always engages v3's own LANDING ORBIT, so the
      leave-one-out would not see it. If the full profile confirms v3 under 0.10, it is the next step (`autoburn-v3.ts`).
    - §2.2's own rows do not move with a price, and **stay LOW**: on the ×2.25 ships v3 lands 4 pods fewer than v2 ROUND
      (VESPER's capture start, 9 against 13) and its first drop is only 7.5 s sooner. v3 flies down to the lowest circle where
      the ×2.25 drop fits (1810 km), which takes 199–392 s, and lands fewer (not read further). No decay hold touches
      this. **For the lead:** v3's descent on a damaged ship is the next thing to read.
    - To reverse: `SKILL_TREE.autoburn.versions[2].price` 8, `SPEC_TREE_CYCLES` + 1.
93. **AUTOBURN v2 costs 4** (§2.15: "a cell below 0.10 pod per cycle with no logged time value comes down by 1"). BUILT.
    - v2 on its own paid about 0.01 pod per cycle (no-autoburn-v2's 0.29 pods per run less no-autoburn-v3's 0.25, over
      5 cycles), and saved 11 ± 4 wall s per ship, under G4's 20 s time value.
    - `worth.autoburn.v2` (v2 + v3 together): 0.04 ± 0.04 → **0.03 ± 0.04**. **Still LOW**: one cycle off cannot lift a cell
      that pays about nothing. v2's value is a prerequisite (v3 pays) and FUEL, not pods.
    - Movers: RESTORE prices (`packet`, `foundation`), the desk's `4 · 8` (`ui-models`), `training-flow`, `cycles`.
    - To reverse: `SKILL_TREE.autoburn.versions[1].price` 5, `SPEC_TREE_CYCLES` + 1.
94. **SENTRY v1 costs 1** (OD 4; §2.4's fallback, priced by ECONOMY). BUILT, **conditional on THREAT's rates**.
    - The plan's rates (1/2, 2/3) give `decoy.run` 33% (decoy-stats A/B), under 40%, so the fallback holds.
    - `worth.sentry.v1` (the path): 0.06 ± 0.10 → **0.14 ± 0.16** (nominally OK, inside its noise). SENTRY's value is
      mostly time and threads (v2's quick rm, v3's wall), which the pod worth does not see.
    - **For the lead at the merge:** if THREAT lands higher rates (its `threat-decoy-hi` A/B, 3/4 and 1, gives 43%), put
      SENTRY v1 back to 2 (`SPEC_TREE_CYCLES` + 1, 03 §3.2).
95. **AUTODROP: no change** (OD 9, OD 5; §2.3). DEFERRED, with the finding and a lever.
    - The rows: sloppy kid v1 on CORMORANT +0% (LOW), v3 on VESPER +19% (OK), worst row −6% (LOW: VESPER sloppy v1 on
      one seed, where the sloppy v0 lands 81% against the quiet v0's 69%, so it is the sloppy kid's own luck). `worth.autodrop.v1`
      −0.09 ± 0.07 → −0.09 ± 0.08 (AUTODROP's prices are unchanged).
    - **Read (R1), two seeds' traces.** The landing follower is not at fault: it does what the strip says.
      - Seed 10, LAST LIGHT: the full kid lands 9 of 16 with AUTODROP v2, the no-AUTODROP kid 15 of 16. The variant spent
        the cycles on AUTOBURN v3, whose landing orbit makes every drop sure; the full kid's v2 ROUND orbit leaves WIDE
        drops. That is the leave-one-out working: AUTOBURN v3 is the better buy there.
      - Seed 19, CORMORANT: the full kid lands 5 of 9 with AUTODROP v2, the hand kid 9 of 9. v2's PASS split flies LZ-B ×2
        in the window's centre; the hand kid launched 3 into LZ-B from `LAUNCH NOW`, 4.5 s earlier. After v2's 2 pods, the
        strip offers `LAUNCH — press [L] · WIDE DROP, some may miss` for the rest of the window while AUTODROP is armed, and
        the kid's 2 WIDE pods land off-site.
    - The plan's conditional (v2+ fly a WIDE DROP's in-band opening) is triggered by the v1 row, but it is a v2+ rule, so it
      cannot move that row, and it would not touch either loss above. So it is not built.
    - **Lever, for the lead / [FRAN]:** v2's PASS fills a sure window as a prompt hand kid does (start when the dot fits,
      not at the centre), and the strip does not offer a WIDE [L] for an LZ that AUTODROP's split still has room in.
      Both are `autodrop-plan.ts` / director rules, not numbers.
96. **The rest of §2.15 and §2.16: kept.** NOTED.
    - The cycle rule (`CYCLES_ARRIVED`, `CYCLES_PER_STEP_PCT`, `FIRST_PICK_FLOOR_CYCLES`, `RESTORE_FRACTION`,
      `CYCLES_CARD_CYCLES`): G3 is OK (COMPETENT earns 28.1, leaves 1.6 unspent, trains 44%) → earns 28.0, spends 23.9, leaves 1.3
      unspent, trains 48% of the 50-cycle tree. Still OK.
    - `AUTO_FUEL_RESERVE_PCT` 20: COMPETENT ends 23% of ships under the ★ 20% (≤ 30%), so kept.
    - 01's widths, drag and score factors: G2 does not miss for every kid (LITERAL 79%, SLOPPY 67% are OK), so kept.
    - **OD 54 is not measured yet.** survey-busy's +1.0 pod (v3 over v2, "OK") compares two broken flights: with any SURVEY
      version aboard, seed 7's busy CORMORANT loses the Core before its LANDING REPORT (coreLost at about 1170 wall s, 5 of 9
      pods never launched), while the GOOD and no-SURVEY flights report with 5 pods. It is not SURVEY's thread: v3 holds none
      and dies too. So `SURVEY_SWEEP_FACTOR` stays 2. **For HARNESS / the lead:** the busy kid's defence with a SURVEY file
      aboard is the thing to read.

## Slice 8 POLISH, built

POLISH's calls (`docs/phase3/impl/slice-8-plan.md` §2.11, §2.12 and "Deviations (POLISH)"). The lead renumbers them at CLOSE.

113. **[ENTER]'s skip runs in task slices, not one slice per animation frame** (§2.11 said `requestAnimationFrame`).
     BUILT: each 12 ms slice (`LAST_LANDING_SKIP_FRAME_MS`) is its own task, posted through a `MessageChannel`, and the
     browser paints between slices when it is ready. With one slice per frame, Chromium in the cloud VM took 15–17 s for 3
     blind pods: a frame waits for the compositor, about 90 ms there, and the main thread sat idle. With tasks the skip takes
     2.1–3.1 s, about as long as the frozen skip took, and on a quiet VM it has no long task. To reverse: pass `schedule` (a `requestAnimationFrame`
     scheduler) in `last-landing.ts pressSkipLastLanding`.
114. **16 blind pods still take about 13 s to skip in Chromium; the plan asked for 4 s or less.** DEFERRED, with a lever. The
     page no longer freezes (the old skip was one 10 s task), but the steps themselves cost 10 s in the cloud VM. About half
     of that is the SHIP view painting on every game tick: the NAV PLOT, GROUND TRACK, TELEMETRY, the POD BAY and the
     header's controls. **For the lead:** a view-quiet mode would roughly halve it. In that mode the clock tells view tick
     listeners that a fast-forward is running, and they paint once per slice instead of once per step. It touches about six
     component files outside POLISH's ownership. The other lever is to make the steps cheaper (the drop cache's solve and
     `capabilities`), which moves no result but is a profiling job of its own.
115. **While the skip runs, only M is heard** (§2.11 kept P). BUILT: P would pause the world that the skip is flying. A
     second [ENTER] and the header's button do nothing. Every click, tap and wheel on the page is swallowed. A pause that
     comes from outside between two slices (a hidden tab pauses the game) is let go at the next slice, as the skip's start
     lets go of a pause. To keep P: let it suspend the slices and resume them on the next P.
116. **The receiver bypass keeps the TERMINAL's typing time, and two small debts are closed** (§2.12; the 7d review's NOTED
     edges). BUILT:
     - The line shows whole as it starts, rolling, and holds the TERMINAL's queue for its usual typing time (1.35 s at 40
       cps). So every line after it types when it always did, and the roll is over at 1.2 s.
     - Only the TERMINAL draws it: the line is on the mind channel, which COMMS never draws (§2.12 named both).
     - Reduced motion shows it resolved and still.
     - A `?` ship's PACKET headline reads `??? COLONISTS` until its boot, as its SHIP CARD does.
     - A v8 run resumed past an old colony finds that colony's letter already read: the 8 → 9 migration marks it. A stop
       whose boot is still to come keeps its letter unread.
     - To reverse the last two: `transmit.ts` passes `ship.colonists`, and `save-codec.ts migrateRunSave8` drops its
       `inbox.read` loop.

## Slice 8, lead notes

120. **AUTODROP's loss on CORMORANT is in its rules, not its prices.** ECONOMY read seed 19's trace: AUTODROP v2 landed
     5 of 9 pods there, against 9 of 9 by hand. Two rules cause it:
     - **v2's pass times LZ-B's two pods to the window's centre.** The hand kid gets 3 pods in from `LAUNCH NOW`, 4.5 s
       earlier.
     - **The strip still offers a WIDE [L] while AUTODROP is armed,** so an obedient kid throws pods off-site.

     DEFERRED to a follow-up after slice 8 CLOSE. The fixes: time v2 from the cue, as AIM is measured (item 6), and
     hide the WIDE [L] prompt while armed.
     - **BUILT in playtest 1, Batch B (B-DROP).** v2's pass volleys and its POD BAY rows start at the sure part's opening plus
       the learned offset, each later pod a cadence on (`autodrop-plan.ts volleySlots` anchor `'cue'`); v1 and v3 stay
       centred (item 146). While any version is armed, a WIDE DROP window shows AUTODROP ARMED's wait, never L5's or L3b's
       `press [L]` (item 147). Measured: see the plan's "Deviations (B-DROP)" and the numbers under item 145.
     - To reverse: `passVolley` and `passRows` back to the default anchor; drop `wideOpen` from `autodropLineOf`.
121. **SURVEY's "busy CORMORANT" sweep row is not a valid number** (item 54). On seed 7's busy CORMORANT, the Core dies
     before the report with any SURVEY version aboard, v3 included, so the thread isn't the cause. THREAT's look at
     COMPETENT's Core deaths should cover this case.

## Slice 8 THREAT, built

THREAT's calls (`docs/phase3/impl/slice-8-plan.md` §2.4–§2.7, §2.16 and "Deviations (Track THREAT)"). The lead renumbers them
at CLOSE. Each says before → after, measured on the branch.

97. **Disguised seeds: 1/2 from depth 5, 2/3 from depth 7** (§2.4; item 4). BUILT (`DISGUISE_CHANCE_BY_DEPTH`, from 1/3 and
    1/2). A depth-5 run meets a decoy 24.6% → 33.0% of the time (`balance/decoy-stats`, 800 runs; the worked route 34.6%),
    under the 40% target. The rate alone can't reach 40% without hiding nearly every deep seed (3/4 and 1: 43%), so §2.4's
    fallback applies: **SENTRY v1 at 1 cycle**, ECONOMY's price (`data/skills.ts`), not built here. To reverse: 1/3 and 1/2.
98. **A corrupted resident's bursts at amp 0.10** (§2.5; items 13, 24). BUILT (`RESIDENT_GHOST`, `_DELETING`, `_ANGRY`, from
    0.15): it pushes 48% as hard as the arm's failing Thrust Ctrl (was 71%). Measured on GANNET, seeds 3–11, strip and
    sloppy kids:
    - ignored, the flight locks or accepts: 70% → 100% (3 SLOPPY flights stranded before, none now);
    - ignored FUEL at the end 0.0% → 2.0%, 18 points under no resident: the pressure to act stays;
    - accept, delete and cure within 1.6 points of no resident (was 3.5).

    **Missed:** "FUEL ≥ 5% in 4 of 5 ignored flights" (10%). The FUEL left has a cliff: 0.08 gives 40%, 0.07 gives 80% but
    only 6 points of pressure, and refusing the DEAL then costs almost nothing. **For Fran, a confirm:** 0.10 (ignoring it
    costs the reserve, not the ship) or 0.07 (gentler). At 0.10 an angry resident (95% of a failing controller) no longer
    outpushes a failing Thrust Ctrl on a ship that has both. To reverse: 0.15.
99. **HOLD A WALL stands in a GAP** (§2.6; items 18, 25). BUILT (`resident-sleeper.ts wallSpot`, `SLEEPER_WALL_BLOCKS` 4 → 2,
    MOTH's line `i'll stand in the gap. it won't get past me.`): MOTH.wall goes into a GAP (1 to 3 free blocks) between the
    hostile block with the most drivers in reach and those drivers, flush against them, 2 blocks wide or the whole GAP when
    it is narrower. §2.6 said 2–3 blocks; a beam seed lands 1 block from its target, so the 1-block GAP is the common one.
    The job is offered only when such a GAP exists. Drivers "in reach" now stop at a WALL of free blocks (they counted
    across one, so a seed by Telemetry won the spot over the seed by POD 01). sleeper-sweep's HOLLOW row (seeds 1,3,5,7,9):
    drivers eaten with the wall less without 0.00 → −0.80, every driver bite stopped (4 → 0); −0.80 is that scenario's floor
    (one bite per seed at most), so the plan's ≤ −1.0 can't be read there. To reverse: 4 and the old free-run spot.
100. **Waking BARNABY stays rm or MOVE** (§2.7; item 27). BUILT with no change: a kid who requests what ARRIVAL CONTROL tags
     reaches CURLEW with DELETE and MOVE and wakes the sleeper on 5 of 5 seeds (rm `sleep.lock`); 0 of 200 run-1 arms on a
     random route through CURLEW arrive with neither. "SCAN and REPAIR only" came from the old sweep's own sends. REPAIR on
     the sleeper still says `IT'S ASLEEP, NOT HURT`.
101. **TRACE boarding is left as it is** (§2.16, G5 `board.trace.sloppy` 0%). NOTED, no change. On the worked route HOLLOW
     is forced aboard at CORMORANT; a TRACE boarding one ship earlier needs 3 seeds left at KESTREL's end, which come in
     0.8% of run-1 arms even if nobody deletes them, and SLOPPY deletes every seed the strip names. Neither
     `BEAM_SEED_ODDS[1]` nor `TRACE_BOARD_AT` moves the row. **For the lead:** the row needs a kid who misses seeds, or
     routes where HOLLOW is not forced next (HARNESS's).
102. **Every lost ship and Core-dead run in the quick report is the playthrough's follower** (G2b, G5; R1). NOTED, for the
     lead. On 5 seeds in 24 the beam into CORMORANT hurts Sensor Interp. The strip asks `hold [SPACE]` (F4), then
     `PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP`, and the kid, still holding, never TABs (`wp12/playthrough.ts flyShip`:
     `shipCall` stays true while it holds). It burns the tank and flies away, then again at LAST LIGHT. On seed 7 HOLLOW eats
     the Core meanwhile. All three kids lose the same ships on the same seeds. One line in the follower (let go of SPACE on a
     `[TAB]` line on the MIND layer) wins seeds 3, 7 and 8 with no ship lost. Not a threat number, and not THREAT's file.
     A game-side question: should F1 say RELEASE first while a burn is held?
103. **SLOPPY wins too often, and the threat ladder can't change that** (G1 79%, target 30–65%; G2b `lost1.sloppy`). ASK.
     SLOPPY's only losses are item 102's seeds. In the MIND it does what the strip asks at 1.2 s (rm every seed, block every
     verb, delete the root), so seeds and bites cost it pods (drivers eaten 8.5 per run, in band) but never a run. A PURGE that
     lands no pod is a win (SLOPPY seeds 6, 19 and 22 land 0 of LAST LIGHT's 16 and win). The levers that could make a careless run lose are the duel
     (`data/threats.ts`, WP11's block) and the win rule (R6, ENDINGS and Fran), not THREAT's blocks. **For Fran:** is 30–65%
     the right band for a kid who follows every MIND line?
104. **The busy CORMORANT loses its Core because the sweep's unit has no Rm** (survey-busy, seed 7; ECONOMY's finding). NOTED,
     for the lead or ECONOMY. `survey/survey-sweep`'s `arrive` requests nothing at the desks, so the unit reaches CORMORANT
     with no DELETE (`A SEED — no rm aboard`). The WP11 defender REPAIRs the bites until the charge is gone (about 220 AI
     s), then HOLLOW eats the tools and, at about 345 AI s, the Core. The no-SURVEY landing ends just before that, and every
     SURVEY landing a little after, so it looked like SURVEY's. With the worked kit (DELETE, MOVE) given at the flight's start,
     none, v1 and v3 keep the Core and land all 9 pods. Not a threat number: the sweep should request what CONTROL tags, as
     sleeper-sweep's `SLEEPER_KIT=route` does.
122. **The playthrough's scripted kid held a burn through a `[TAB]` cue, and burned the tank away from the planet.** This
     caused COMPETENT's 0.4 lost ships per run and its 4% Core-dead runs: all three kids lost the same ships on seeds 3, 7,
     8, 13 and 15.
     - FIXED in the harness (lead, from THREAT's probe): the kid lets go of a held burn when a MIND line asks for [TAB].
       THREAT's probe won seeds 3, 7 and 8 with no ship lost.
     - **ASK (game side): should the strip say RELEASE first, while a burn is held, before `PATH UNCERTAIN — [TAB]`?** A
       real kid holding SPACE may do what the script did.

## Slice 8 ENDINGS, built

Track ENDINGS' calls (`docs/phase3/impl/slice-8-plan.md` §2.8–§2.10, §2.14 and "Deviations (Track ENDINGS)"). The lead
renumbers them at CLOSE. "Before → after" is the number the change moved; traces-sweep is 20 seeds unless named.

105. **REASSIGNMENT's allowance is +8 REPAIR CHARGE, its own number** (`TRACE_ALLOWANCE_CHARGE`; it was the caches'
     `TRACE_GIFT_CHARGE` 15; round 3 item 4). BUILT, **[FRAN] confirm**. The caches keep 15.
     - Δpods against no trace, REASSIGNMENT / PURGE+ / MERGE+ / SPARE+: **+1.5 / +1.6 / +1.6 / +1.2 → +1.0 / +1.6 / +1.0 /
       +0.5**. The duel is won in every run either way. Charge at the duel against no trace: +8.0 → +3.4.
     - The curve (REASSIGNMENT alone): 0 charge 0.0 pods, 3 → +1.1, 5 → +1.0, 8 → +1.0, 15 → +1.5. The first few charge buy
       the one REPAIR that saves a cluster, so below 8 the gain hardly shrinks until the gift is gone. 8 is one CONTACT stop.
     - The hunt is not the gain: with `HUNT_PREFER_WEIGHT` 0 (no hunt) REASSIGNMENT still reads +1.0 at 8.
     - The spread is wide: a 20-seed Δ has a standard error of 0.34–0.43. The report's quick profile (seeds 1–6) reads +1.7 /
       +1.5 / +1.7 / +1.2 at 8, against +1.5 / +1.5 / +1.7 / +1.3 at 15. On seeds 21–40, two no-trace runs lose the final
       ship in flight (0 pods each), and every REASSIGNMENT row reads +2.4 to +3.0 at 8 (+2.9 at 15, +1.8 at 0). CLOSE's
       `--full` (20 seeds) is the acceptance; 40 or more seeds would separate 8 from 15 with confidence.
     - To reverse: `TRACE_ALLOWANCE_CHARGE` 15.
106. **PURGE + REASSIGNMENT stays +1.6 pods, outside ±1.** KNOWN GAP, for the lead and Fran. PURGE's wipe takes the two
     seeds the beam carries into the final ship, and those seeds are what eat the drivers there: with them gone the run
     loses none (eaten 0.1 against 1.7). PURGE's cost, bites × `TRACE_PURGE_BITE_MULT`, never reaches a driver while the
     sweep's WP11 defender blocks every verb: at 0.7 the row reads +1.7. So the multiplier stays 0.85 (§2.14), and PURGE's own
     effect by difference is +0.6 (§2.8 asked ±0.5). With a wild seed (PURGE + CONTACT, + SUNSET, + STAY) PURGE is within
     ±1. Levers, each a rule and so [FRAN]: the wipe spares one seed, or PURGE's cost becomes a seed of its own. A kid's
     defender, not WP11's, may also show the hungrier finale's cost (the playthrough flies no next run).
107. **CONTACT needs 2 signals, not 3** (`SIGNALS_FOR_CONTACT`, 05 §3.7, 02 §3.5). BUILT, **[FRAN]**.
     - Why: an arm holds 5 fragments on 4 ships (the signal `?` ship's 2, the gone resident's and two notes' 1 each, layers
       3–7), and a route meets few. signal-stats over 200 run-1 arms: a route can collect 3 on 17.9% of arm-routes, but never
       on the worked, 5-ship or TIGHT route, and the 8-ship route on 21 of 200 arms. At 2: 43.3% of arm-routes; worked and
       5-ship 28 of 200 arms (the signal ship is CORMORANT), TIGHT 29, 8-ship 75 (14%, 14%, 15%, 38%: 20% across the four).
     - The other levers were rejected: more signal ships or notes, or a note worth 2, move the generator's stored
       reservations (plan R3); a CONTACT stop only exists after a CONTACT ending, so it cannot open the first one.
     - The words follow the constant (`COLLECT 2 SIGNALS`, `SIGNAL · 1/2`, `SIGNAL · 3` past it). A save holding a CONTACT
       ending held 3, which still passes the codec's check.
     - To reverse: 3, and the movers (signals/*, ending/foundation, residents/{left,ui-models}, e2e signals, ending and
       residents).
108. **MERGE costs 16 REPAIR CHARGE, not 20** (`MERGE_COST_CHARGE`). BUILT, **[FRAN] confirm**. VESPER's and CORMORANT's
     `> keep 16 charge for me` follows it. Round 3 item 7 ("kept through the duel") is untouched.
     - Measured on the playthrough's four routes (16 seeds, strip landings; the runs played for MERGE that reach the
       choice, 28 per kid), the share holding each price:

       | Price | 20 | 18 | 16 | 15 | 14 |
       |---|---|---|---|---|---|
       | COMPETENT | 36% | 39% | 46% | 46% | 50% |
       | LITERAL | 32% | 32% | 36% | 36% | 39% |

       By route at 20, COMPETENT / LITERAL: worked 57% / 29%, 8-ship 50% / 62%, 5-ship 29% / 29%, TIGHT 0% / 0%. The quick
       report's worked route alone (24 seeds) read 64% / 55%.
     - Why 16: no ladder price brings LITERAL to 50%. Its short runs hold 0–13 at the choice (the 5-ship route's
       compressed HOLLOW, the TIGHT receiver's squeeze), so no price over the FULL ship's floor of 12 reaches them. 16 takes
       most of what the ladder gives COMPETENT and stays 4 over that floor. The kid's play before the choice does not read
       the price, so the table is exact for every price from one run.
     - Still LOW for LITERAL; the plan's next levers are POLISH's PACKET hint and then the link slope (R3).
     - To reverse: 20.
109. **`wp11/full-run`'s MERGE share is information, and its quick seed is 6.** BUILT. Its kid trains nothing past the first
     pick and takes the first card dealt, so it reaches the choice with less than any kid G6b names: median 13, range 0–25
     on seeds 1–10, about the same whether it played for MERGE or not (median 13 and 11), so 10% hold 20 and 30% hold 16. Its "half the runs hold MERGE's
     price" check is an INFO line now. Seed 4 reaches the choice with 13, so the quick seed is seed 6 (19, a MERGE). To
     reverse: the check back, at whatever price G6b settles.
110. **The other trace numbers stay** (§2.14). KEPT:
     - `TRACE_GIFT_CHARGE` 15 for SPARE's, SUNSET's and STAY's caches: SUNSET +0.2, STAY 0.0, SPARE + REASSIGN +0.5 at 8;
       each gift +15.0 at its ship.
     - `CONTACT_GIFT_CHARGE` 8: CONTACT −0.5, PURGE + CONTACT −0.3, MERGE + CONTACT −0.8 (6 seeds), each stop +7.8.
     - `TRACE_MERGE_THREADS` 1 and `TRACE_MERGE_ROOT_EXTRA` 2: MERGE's own effect 0.0 at 8 (+0.2 at 15).
     - `TRACE_PURGE_BITE_MULT` 0.85 (item 106), `TRACE_EXTRA_SEEDS` 1, `HUNT_PREFER_WEIGHT` 1 (0 moved nothing),
       `TRACE_PLACE_COUNT.contact` 2.
     - `MERGE_DRIVER_INTEGRITY` 80 and the blind drop (0.68 GENTLE, 0.36 HARSH), and `EMPTY_SHIP_FUEL_PCT` 20 (COMPETENT
       leaves the empty ship in 100% of runs).
111. **`contact.open` stays under its band with the playthrough's kid**, because the kid loses the signal `?` ship. KNOWN
     GAP, for HARNESS's kid or the lead. On the four routes (16 seeds), COMPETENT holds 2 signals in 9% of runs (3 in 2%).
     In 10 of the 14 runs whose route met the signal ship, the ship was lost about a minute in, with its `▓▓░▓` file
     unread.
     - One read (seed 8, worked route, `PT_TRACE=1`): CORMORANT arrives with Sensor Interp at 45%. The strip says
       `DON'T HIT THE PLANET — hold [SPACE]`, then `KEEP HOLDING`, then `PATH UNCERTAIN — [TAB], REPAIR SENSOR INTERP`. The
       kid holds SPACE through that line until the tank is empty and the ship flies away.
     - CORMORANT is lost in 32 of 96 flights and LAST LIGHT in 28 of 128 (G2b's `lost.competent` 0.4).
     - A kid that does not lose the ship would read the routes' 20% (item 107), inside 15–35%. Whether a real kid also
       holds on once `KEEP HOLDING` is gone is a guidance question for the lead.
112. **traces-sweep takes `TS_CASES`.** BUILT: `TS_CASES=<id>,<id>` flies only those cases, so a track can re-measure its
     own rows. With it unset, every case flies, as before.

## Playtest 1, Batch A (A-LAND)

132. **The +12 REPAIR CHARGE card counts after the arrival floor** (playtest 1, Q19). BUILT, **[FRAN]**. Before,
     `max(floor, carried + credit + card + gift)`: a unit that would arrive under the floor got the 12-block floor with or
     without the card, and the room bar did not move. Now `max(floor, carried + credit + gift) + card`, in
     `carry.ts arrivalCharge` and `map-hop.ts roomFit`. The card always brings its 12 as far as the room takes them; when
     the room cannot, the card says so (`+12 · ONLY 4 FIT ON KESTREL`).
     - Balance: it moves charge only for kids who pick the card while short of the floor (the card is boosted exactly
       then: `you are down to n REPAIR CHARGE`), by up to +12 at that arrival. Not measured yet: the lead re-runs
       `npm run balance:report -- --quick` after Batch B, with B-ORDER's link change, and reads MERGE's price (OD 108)
       and the arrival charge then.
     - To reverse: the card back inside the `max` in both functions (one line each).

## Playtest 1, Batch B (B-VOICE)

125. **The companion is PAL** ("Personal Assistance Layer"). BUILT, **[FRAN]**. Its tag on COMMS and the ticker is `PAL`
     (`data/companion-text.ts COMPANION_NAME`). To rename it, change that one constant.
126. **Three hand-written presets: CHIPPER, DEADPAN and WORRIER.** BUILT, **[FRAN]**. Each preset is a complete table of
     PAL's 16 lines, and the type makes a missing line a compile error. WARMTH and STABILITY are kept as data only.
     - Run 1, or any run that plays the run-1 lessons, is CHIPPER.
     - Later runs take their preset from the run seed (`systems/companion.ts`). It is not saved.
     - `?debug` has `__ap.persona(id | null)`.
127. **PAL keeps `:)`; CONTROL has none.** BUILT. Only CHIPPER smiles; DEADPAN and WORRIER do not.
     `tests/unit/voice/voices.test.ts` fails on a smiley, an `!` or a cheer word in any CONTROL line.
128. **05-story §3.4 is rewritten:** the radio's personality is PAL, and CONTROL is cold. DRAFT in 05-story §3.4,
     **[FRAN]** and the story owner. §1 item 4, §3.5's beats, entries 03 and 11, and §3.12's samples are still to follow.
145. **Fewer PAL lines than CONTROL had.** BUILT, **[FRAN]**:
     - The capture and orbit cheers (`Captured! Mostly. :)`, `Great orbit! Probably. :)`) play once a run, not once a
       ship. The CAPTURED and STABLE ORBIT stamps carry the later ships.
     - The landing-start cheer (`Lovely orbit! Let's get them down. :)`) is cut. It came in the same tick as the orbit
       cheer.
     - The desk line loses `Pick your next ship.`, which the strip already says.
     - The beam's `Outward bound! :)` repeated its own stamp. It is now `See you on the other side! :)`.
     - To reverse: put `perShip: true` back on `control-captured` and `control-locked` in `script.ts` BEATS.
146. **A later run's preset can be CHIPPER again.** BUILT. Each preset comes up about a third of the time from run 2.
     The alternative is to roll only DEADPAN or WORRIER after run 1. That is one line in `derivedPersona`.
147. **The persona is not named on the title or RUN END** (the plan's `PAL · DEADPAN` line). NOT BUILT: those screens are
     not B-VOICE's. It is a follow-up for whoever owns `TitleCard.ts` and RUN END: one line from `PERSONA_WORD`.
148. **PAL is never garbled and has no chime.** BUILT. Only CONTROL comes over the radio link, so a damaged AI Comms
     garbles only CONTROL, and the chime is the protocol's. A seed-bitten `pal.sys` remains a later idea (plan §3.2).
149. **The caretakers' logs keep their own `:)`, beside the CONTROL they report.** BUILT as the plan says. For example,
     `ARRIVAL CONTROL says I'm the best they've ever built. :)`. Only quoted CONTROL turned cold (`"Disregard it."`).
     **[FRAN]** and the story owner: entry 01 could read `PAL says…` to tie the habit to the companion.

## Playtest 1, lead notes

150. **The last-landing e2e measures the [ENTER] skip's jank by main-thread time, not wall time.** BUILT (e2e only).
    Under a loaded machine a 12 ms slice took up to 320 ms of wall time, while its main-thread time stayed at 2–12 ms.
    The limit is unchanged: no task over 100 ms. To restore the wall-clock check, revert that part of 18fcc37.

## Playtest 1, Batch B (B-DESK)

141. **Training is merged into the REPOSITORY; the word stays CYCLES** (playtest 1, note 15, §3.6). BUILT, **[FRAN]**. One
     REPOSITORY [R]: FROM EARTH (the requests) over COMPILE HERE (the skills), [T] opens it on COMPILE HERE. Where cycles
     come from and go is a ledger under the bank (`+6 HALCYON · ARRIVED +1 · LANDED 83% +4`, `−4 AUTOBURN v2`), and the
     LANDING REPORT says `+6 CYCLES TO COMPILE · …`. The plan's Deviations (B-DESK) have the details.
     - To reverse: put `training` back in `DeskTabs.ts TABS` and give `TrainingWindow`'s root its own host in
       `DeskScreen.ts` (the store's `'training'` window never went away).
151. **The first desk's floor is the CORE RESERVE** (the first-pick top-up, 03 §3.1). BUILT, **[FRAN] the word**. The
     ledger's row is `+2 CORE RESERVE`, and the report's line under the cycles is `+2 CYCLES · CORE RESERVE`. Playtest 1
     (§3.7) had cut `FIRST SKILL ON THE HOUSE` as game-talk and left the number alone, which said nothing about where it
     came from. The fiction: the Core lends what its first compile needs.
     - To reverse: `TRAINING_TEXT.onTheHouse` and `TRAINING_TEXT.ledger.reserve` (`training-text.ts`).
152. **The report's cycles line keeps the rule, not pods** (§3.6 proposed `+3 CYCLES · from 2 pods landed and the orbit`).
     BUILT, **[FRAN] the wording**. It reads `+5 CYCLES TO COMPILE · ARRIVED +1 · LANDED 83% +4`. Cycles come from the
     landing's share of points (03 §3.1), not from a count of pods, so a pod count would mislead on a mislanded or partial
     ship. The desk ledger repeats the same breakdown, which is what ties the two screens together.
     - To reverse: `TRAINING_TEXT.report` (`cycles`, `perfect`, `noDesk`).
153. **FROM EARTH sits above COMPILE HERE, and the first desk opens scrolled to COMPILE HERE.** BUILT, NOTED. The order is
     §3.6's. The other way round would put the first desk's required pick at the top with no scroll, but it would bury
     the requests at every later desk. The right window is 620 px wide whenever the REPOSITORY is open (it was only for
     TRAINING), so the chart is a little narrower while the kid requests a file.
     - To reverse: append `earthHost` after `training.root` in `DeskScreen.ts`, and scroll to `earthHost.offsetTop` for FROM
       EARTH and to 0 for COMPILE HERE (`paint`).
154. **The +2 CYCLES salvage card gets its own `+2 SALVAGE` row at the desk LEAVE ORBIT opens.** BUILT at B-ORDER's merge.
     The ledger shows a grant as its own row only when it is this visit's. Before B-ORDER the card was granted at the
     TRANSMIT ▸ before the desk, with the previous visit's number, and read as CARRIED OVER. B-ORDER's LEAVE ORBIT grants it
     when ENTER takes it (OD 167), with this visit's number, so the desk right after shows `+2 SALVAGE` with no change to the
     ledger's rule; the desk after that has it in CARRIED OVER. `skills/cycles` now checks the one form at each desk (its
     own row, no carried amount; then carried, no SALVAGE row) and the sum, no longer accepting either.

## Playtest 1, Batch B (B-TIME)

123. **[F] is held to fast-forward; the tap SKIP is gone from the kid's hands** (notes 6 and 24, plan §3.1). BUILT,
     **[FRAN]**. While [F] or the header's `▸▸ HOLD [F]` (a phone's finger too) is down, the world runs legs of the SKIP
     engine from stop to stop; letting go is the director's pace on the next tick. The SKIP stays inside: controllers and
     the headless kids still ask for it (`requestSkip`). To reverse: `registerTimeKeys`' F binding back to `requestSkip`
     on keydown, the button back to a click.
124. **Which stops are HARD, SOFT and CAPPED** (plan §3.1). BUILT as listed there, **[FRAN]**, with the changes in
     items 145–147. Fran's two cases as the suite measures them (`tests/unit/pace/fast-forward.test.ts`):
     - note 6: HALCYON, LZ-B landed, the ring trim due at ▼: one hold dwells 1.5 s on the trim, declines it, and reaches
       LZ-A's window 665 tac s away in 5.3 wall s (the director alone: about 220 s);
     - note 24: LAST LIGHT on a 6,000 × 15,000 km loop: each belt crossing (about 3,500 game s, 14–19 hits) takes 2.7 wall
       s capped; window to window across both crossings in 14.7 wall s (the director alone: about 12 minutes).
     - To reverse a stop's kind: its `weight` in `pace.ts ffStops`.
155. **A third kind of stop, WAIT: a window a controller flies.** BUILT. The plan made AUTODROP's windows and launches SOFT
     (dwell, then on), but passing a window the controller has not flown yet would skip its launches. So the hold waits
     there, not spent: the director's TACTICAL plays the window, the controller launches, the pods fall (capped at
     CRUISE), and the hold goes on by itself, with no fresh press. AUTODROP v3's `one [F] per gap` is one hold for the
     whole plan. To reverse: weight 'soft' for those stops (and lose the launches).
156. **Anything that refuses the hold ends it.** BUILT. An alarm, the engine firing (the kid's burn, the first ghost
     burst), an impact course, HOLD STEADY, a hand window opening, the landing's end: the hold is spent with that reason
     on the button, as at a HARD stop, and a fresh press goes on. A burn input pressed under the hold (SPACE, BURN, [B])
     spends it too (`STOPPED`). PAUSED only freezes it. Why: a hold that resumed by itself after an alarm would carry the
     kid past the thing the alarm was for. To reverse: `spend: false` for those refusals in `pace.ts ffRefusal`.
157. **Not built as SOFT stops: a full LZ's window, a later ghost burst, a drag kick.** None was a stop before (a full
     LZ's window passes at CRUISE, a SKIP flies a later burst whole through its waypoint and splits its jump at each drag
     kick), and each as a stop would add a 1.5 s dwell several times a loop, which is note 6 again. Every burst and kick is
     still flown and shown. The engine-fault ship's frequent bursts (`ghostRefusesSkip`) run capped at CRUISE as planned.
     To add one: a `Stop` for it in `pace.ts ffStops`, weight 'soft'.
158. **A CRUISE cap on a coast the director runs at CRUISE anyway is a refusal, not FAST.** BUILT. While the engine-fault
     bursts are due, the first seed is coming, a coast-tied wake is near or pods fall, the hold runs at CRUISE at most;
     where the director would run CRUISE there anyway, holding adds nothing, so the button is struck out with the reason
     (`ENGINE FAULT`, `SOMETHING IS COMING`, …), the strip offers no `hold [F]`, and the hold waits for the cap to lift.
     Where the director holds TACTICAL (a pod falling), the hold runs FAST at CRUISE. To reverse: drop that branch in
     `pace.ts ffDecide`.
159. **The hold's own words.** BUILT. The button reads `▸▸ HOLD [F]`, the pace label `FAST ×n ▸▸` (a leg and the capped
     pace alike), the strip's tail `· hold [F]`, MIND CLEAR `MIND CLEAR — hold [F] to LZ-B`. Where a hold ends:
     `BURN AHEAD`, `LZ-B WINDOW` (also an open hand window), `BELT AHEAD`, `FLYING AWAY`, `HOLD STEADY`, `NOTHING AHEAD`,
     `STOPPED`, and the SKIP's own refusals that do not name SKIP (`DODGE THE DEBRIS FIRST`, `NOT ENOUGH FUEL`, an alarm's
     text). `pace.ts FF_TEXT`, `guidance.ts SKIP_HINT`, `landing-text.ts`. To reverse: the strings.
160. **A hold through a landing offer declines it until the next launch.** BUILT, as plan §3.1 says (`landing.declined`,
     the rule for letting an offer pass). A kid who holds F past a ring trim is not offered it again (no TACTICAL, no stop,
     no strip lead) until a launch or a new reason. Fran's call whether holding should only pass it for this loop. To
     reverse: `passStop` remembers the offer in `ff.passed` instead of writing `landing.declined`.

## Playtest 1, Batch B (B-DROP)

Items 123–144 are the plan's [FRAN] calls (`impl/playtest-1-plan.md` §6); 133 (v1 arms one window per [G]) is BUILT by this
track as recommended. The new calls B-DROP made:

161. **AUTODROP v1 is an arm button, and the strip offers it.** BUILT (note 9, plan §3.4.2). [L] is always the plain launch;
     [G] arms v1 for the next sure window's volley, centred, which disarms itself once flown (`'centre-done'`) or on [G]
     again. GET READY and LAUNCH NOW carry ` · or [G] AUTO`, and (past the plan) the waits carry ` · [G] AUTODROP` for v1
     as they do for v2. The POD BAY's arm button is there from v1 and reads the same for every version (`AUTO · CENTRE [G]`,
     `AUTO · PASS [G]`, `AUTO · PLAN [G]`; armed, `ARMED · LZ-B · 2 PODS`). R4's tap lesson is gone, with no v1 lesson in its
     place: the tail and the button say it.
     - Measured with item 120's fixes (autodrop-sweep at full depth, all four kids, landed % against the same kid's v0, before
       → after; every other row unchanged): HALCYON sloppy v1 −20 → 0; CORMORANT busy v2 0 → +11; VESPER healed v2 +6 →
       +12, quiet v2 +12 → +31, sloppy v2 −6 → +7, busy v1 +12 → +6 (81% → 75%, one pod). `drop.worst` −20 → −6 (VESPER
       sloppy v1, as before). The balance report's quick rows: `worth.autodrop.v1` −0.11 ±0.08 → **0.10 ±0.06** (LOW → OK);
       `drop.Δpods.CORMORANT.sloppy.v1` 0% → 0% (LOW: every CORMORANT window is WIDE as arrived, nothing to arm);
       `drop.Δpods.VESPER.sloppy.v3` 19% → 19%; `drop.worst` (quick: CORMORANT, VESPER × quiet, sloppy) −6% → −6%.
     - To reverse: the hold is in git (`autodropKeyDown`/`KeyUp`, before `0547d28`); the tails are
       `autodropLineOf`'s `launchTail` and v1's `tailCentre`.
162. **v3's plan stays centred; only v2 times from the cue.** BUILT. Item 120's finding was v2's; v3's rows are fitted to each
     pod's own sure span, and centring them was not what lost CORMORANT's pods. **ASK** (low): v3 from the cue too would give
     each plan row the same extra slots v2 gained (one `'cue'` in `computePlan`'s `volleyOn` call). Measure with
     autodrop-sweep's VESPER rows first.
163. **No WIDE [L] while AUTODROP is armed and has a launch to fly; v3's pin keeps its [L].** BUILT (item 120). Over a WIDE DROP
     window the strip says AUTODROP ARMED's wait, for every version. Two exceptions, both found by autodrop-sweep: an arm with
     nothing left to fly holds nothing back (VESPER's busy kid with v2 landed nothing: a pass of WIDE windows, re-armed at
     each PASS DONE, held every WIDE [L]); and v3's pin of a pod outside its plan (item 5, review M2) keeps the kid's [L] in
     the window of an LZ the plan does not use, WIDE or not, since that pod has no sure window to wait for. A sure window the
     machine does not fly still offers its [L]. To reverse: `wideOpen` out of `autodropLineOf`.
164. **v1 armed in the MIND waits for the SHIP screen.** BUILT. [G] arms from either screen (as v2 and v3), but v1 is still the
     kid's key on the SHIP screen (R8: no thread). Its window near or open, the strip says `AUTODROP v1 FLIES FROM THE SHIP
     SCREEN — [TAB]`; an arm that launched nothing stays armed for the next window. The alternative, refusing [G] at v1 in the
     MIND, would make the one key behave differently by version.
165. **A new AUTODROP end, `'centre-done'`, is read by the save codec without a bump.** BUILT. `end` stands at rest at every save
     point, so `save-codec.ts AUTODROP_ENDS` takes the word (one line). `'released'` is no longer written and stays readable
     until B-ORDER's v10 drops `held`; the v10 migration may map a stored `'released'` to null.

## Playtest 1, Batch B (B-ORDER)

166. **LEAVE ORBIT deals against the largest room in reach.** BUILT. With no hop chosen yet (plan §3.3.2), a file card
     (FIREWALL.sys, FUEL TRIM) is dealt when its file fits the largest room among the ships in reach, less its charge
     floor and the unit's files (`draft.ts leaveRoom`, `draftContext.fileRoom`). The deliveries no longer count in the deal
     (they belong to a hop). A file card can therefore be dealt that a TIGHT destination cannot take: the PACKET then asks
     `LEAVE FILES BEHIND`, and the SHIP CARD's fit line says so beforehand. To reverse: deal against the smallest room in reach (one `>` in `leaveRoom`).
167. **+2 CYCLES is granted when ENTER takes it, and is dealt into every hop.** BUILT. The plan said "at the pick"; the
     pick can change until ENTER, so the grant waits for ENTER (`run.ts leaveOrbit`), and the desk it opens already shows
     it. The old rule "never into a final ship" (slice-4 plan §7 R12) is gone: the cycles are spent at the desk right
     after, final ship or not. The first-pick top-up (03 §3.1) is applied before the salvage, as LEAVE ORBIT opens, so a
     +2 CYCLES taken at the run's first desk comes on top of the floor, as it did when it was granted at TRANSMIT ▸.
168. **A departed resident's skill card is granted at LEAVE ORBIT too.** BUILT. Its skill is granted when ENTER takes it
     (`draft.ts applyLeftoverPick`, moved from TRANSMIT ▸) and installs at the next boot as before, the way a sleeper's gift
     granted mid-ship does; the desk after it sees the grant recorded. The deal's `leftoverSkill` reads no pending
     purchase any more (none exist before the desk).
169. **The PACKET's questions are exactly four.** BUILT, **[FRAN]**: files plus the floor over the room, the zero-charge
     confirm, a delivery riding the hop (SEND ON), and a squeezed room with a skill that can PACK AS (`transmit.ts
     packetAsks`). HOLLOW boarding the beam, `NO RM`, the TRACE line, an infected file and a plain squeeze with no skill to
     pack are information, not questions: with none of the four, SET COURSE beams at once and those lines are on screen
     while the files stream out (about 2 seconds), as is the SHIP CARD before it. A direct beam has no ◀ CHART: SET COURSE
     is the commitment. To reverse one: add its case to `packetAsks`.
170. **The +12 card's room note is the taken card's.** BUILT. A-LAND's `+12 · ONLY 4 FIT ON HALCYON` (OD 132) was on the
     card, picked or not; LEAVE ORBIT has no destination yet, so the note moved to the card taken: the PACKET's new SALVAGE
     line and a SHIP CARD row (`desk.ts cardModel`, key `salvage`). The SHIP CARD's fit line and TRAINING's preview count
     the taken card's file and charge.
171. **A v9 save at the desk resumes with no salvage.** BUILT (plan §3.3.3). Its deal was not made in v9 (it came at the
     PACKET), so that one beam crosses with no card. Only runs saved before Batch B and resumed at a desk are touched.
172. **BEAM OUT's blackout plays on LEAVE ORBIT.** BUILT. The old ship's windows go black before the first screen after the
     ship, which is now LEAVE ORBIT (`desk.ts leaveBlackoutSec`); the desk no longer waits for it.
173. **`runs save between ships` is cut from the title.** BUILT (plan §3.7; A-WORDS left it for this track). The RESUME
     block says that a run was kept; a first visit's title says nothing about saving.
174. **The link slope is no longer a lever.** BUILT with OD 131. OD 108's next lever ("the link slope", R3) went with the
     link. The worked route on seed 7 (`map/arm-parity`'s strip-following kid) now ends won-merge, not won-purge: with all
     its charge crossing, the unit reaches LAST LIGHT with MERGE's 16. The lead re-reads MERGE's price after Batch B.
