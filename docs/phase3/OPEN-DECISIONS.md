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
   - DEFERRED to the slice 8 rebalance (price, or what v3 adds).
4. **Disguised seeds are rare per run.** BUILT to the spec's per-seed rate: about 33% of seeds at depths 5–6 and about
   50% at depth 7 and beyond.
   - But only about 1 run in 3 meets a decoy, so SENTRY v1 names nothing in about 2 runs of 3.
   - DEFERRED to slice 8: raise the rate, or give SENTRY v1 more to do.
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
   - DEFERRED to slice 8.
10. **AUTOBURN v1 is untrained at first** and fires 7.5 s late (40% accuracy) until the kid's own captures train it
    (R3).
    - BUILT.
11. **The desk's ENTER trains only a cell the kid picked**, and SPACE always sets course.
    - BUILT, after review M3 found an accidental spend.

## Engineering sequencing

12. **Retiring the classic world is moved to just before the slice 8 rebalance.**
    - The classic world is still the default test fixture for 166 suites, and retiring it changes no gameplay.
    - Doing it before slices 5–7 would conflict with every one of their tracks.
    - Slice 8's sweeps should run on the arm, so that is when it has to be done.

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
20. **The receiver bypass animation is deferred to slice 8** (R19). DEFERRED. The line is in slice 5.
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
25. **HOLD A WALL adds little.** Any free run with room for the 4-block wall already counts as a WALL under the kid's
    own rule. So MOTH.wall never stops a bite that would otherwise land; it only keeps that run from being filled.
    - BUILT as specified.
    - ASK, or DEFERRED to slice 8: make the job do more. For example, wall off the nearest seed's reach, or let the
      wall heal.
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
54. **v3 over v2 adds +0.02 cycles for 4 more** (+0.7 points in the sweep). Its value is only the thread: the kid's
    second op on a 2-thread Core, and mapping on a worn Core where v1/v2 wait all ship. The sweep can't see that, since
    its kid runs no ops. DEFERRED to slice 8, to be measured with a kid who SCANs and DELETEs seeds on a POOR ship that
    HOLLOW boards (CORMORANT, seed 7).
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
66. **Known engineering debt, carried to slice 8:**
    - **[ENTER] in THE LAST LANDING freezes the page while it fast-forwards.** It took 2.1 s for 3 blind pods in
      Chromium. The fix is to fast-forward over several frames.
    - **The BALANCE_ONLY `wp12/playthrough` on the classic five has stuck runs** (`stuck:printing on LAST LIGHT`,
      6 LITERAL and 6 SLOPPY PURGE runs). They predate slices 6 and 7: the classic world's scripted kids have rotted.
      They go with the classic world's retirement (item 12).

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

## Retiring the classic world

Track RETIRE (slice-4cde-plan §9; item 12). Phase 1 is done. Phase 2 is done for 168 of the 223 quick suites and for both
BALANCE_ONLY playthrough harnesses. The other 55 suites still build the classic five, and phase 3 waits on them. The
plan's "Deviations (RETIRE)" has the details and the list.

85. **The headless fixture world is run 1's arm.** BUILT: `createInitialState` with no map builds run 1's arm on the seed,
    with the unit on authored ship `shipIndex` (0 ARES-VII … 4 LAST LIGHT) along the worked route. Each stop carries its
    real hop, the nominal route's threat and a passed result. `run.shipIndex` is that stop's depth − 1, so LAST LIGHT is
    depth 6, through CORMORANT. `carried: 'fresh'` lays a fresh unit out for the hop. A suite not moved yet imports
    `support/classic-world` first and stays on the classic five. `AP_RETIRE_PROBE=arm` shows how far it gets on the arm.
    The probe: 135 of 223 quick suites passed unchanged, each with the same number of checks. 33 more moved after fixes:
    the harness helpers learned the class's memory size, the worked-route desk, the kit and the passed results. Of those
    33, 17 keep a check of a classic-only branch, built with `withClassicWorld`; those checks go in phase 3. `map/arm-parity` pins run 1's seed-7 arm (its 20
    ShipDefs, its built ships, a flown run) and did not move.
86. **A ship alone on the arm carries the worked route's kit** (`support/arm-ship.ts WORKED_KIT`, opt-in `kit`): MOVE by
    HALCYON, DELETE by KESTREL, SWAP by CORMORANT (VESPER: none, it arrives 4 years late), COPY by LAST LIGHT. That is
    what 02 §3.14's requests deliver (`map/run1-route` pins each delivery). The classic five's licence schedule played
    this part. **For the lead:** the alternative is a kit per suite, which would make each suite's tools explicit.
87. **The save codec refuses a `'classic'` world; it does not migrate one.** RECOMMENDED. No save ever held one: encode
    always threw on it (3c), and the page never routes through the classic five. There is nothing to migrate to. A
    classic save's route and ships have no arm counterpart: VESPER → LAST LIGHT is 83 LY, out of range. When phase 3
    narrows `RunMapState.world` to `'arm'`, keep the field (no save bump). Let the codec's `oneOf('arm')` refuse any other
    value as `shape`, and drop the separate `'classic'` refusal and its text (`map-text.ts`). Keep a codec check that a
    hand-edited `world: 'classic'` payload is refused cleanly (`kind === 'shape'`), not thrown.
88. **The BALANCE_ONLY harnesses fly the arm** (slice 8 needs them there). BUILT:
    - `wp12/playthrough` plays the worked route (or `PT_ROUTE`). At each desk its kid makes the first pick, trains its
      `buys` list (COMPETENT and LITERAL buy down AUTOBURN, AUTODROP and SENTRY; SLOPPY only the pick), requests the tag
      and sets course.
    - The strip-asked kids now read the landing's L0 row (`EVERY POD IS DOWN — now DELETE THE ROOT`) as the ask. That
      ended item 66's `stuck:printing on LAST LIGHT` runs: 2 seeds each of COMPETENT, SLOPPY and LITERAL end.
    - `wp11/full-run` checks the arm's facts (tools by request, the forced boarding at CORMORANT, VESPER without SWAP).
    - **Known gap for slice 8:** on the worked route the MERGE-saving kid reaches the choice with 9–13 charge (seeds 1,
      2, 4), short of MERGE's 20. `full-run`'s "both endings reached" fails in `npm run balance` until the rebalance
      (slice-3a risk 6: "the MERGE margin moves to the route").
