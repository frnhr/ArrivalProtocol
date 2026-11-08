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
19. **The `?` ship cards and the old-colony and signal events wait for slice 7** (R18). DEFERRED. Only the notes
    collect signals now, at most 3 on an arm.
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
44. **Where the next run's gifts wait** (R31):
    - never on TIGHT, authored, `?`, first or final ships, except named fallbacks;
    - 046's cache goes on Marrow or Ostrava.
45. **What the gifts are** (R32):
    - each is +15 REPAIR CHARGE through the normal arrival path;
    - SUNSET adds a spare tool, Rm first.
46. **The final ship's traces** (R33):
    - PURGE wipes beam and delivery seeds, and bites ×0.85;
    - MERGE gives +1 thread capacity and an 18-block root;
    - the non-compliant choices cost one wild seed;
    - REASSIGNMENT's root unlinks your highest-version `.skl` first.
47. **The relay strangers alternate 031 and 038 by run** (R34).
48. **The strangers' logs have 6 entries; `047.log` has 7** (R37).
    - The segment id stays `log046`.
49. **The `▓░` glyph shows on `?` ships that carry fragments** (R40).
50. **CONTACT's trace** is two signal stops, each worth +8 charge and a fragment (R41).
    - It is behind its own gate and may ship dark.
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
