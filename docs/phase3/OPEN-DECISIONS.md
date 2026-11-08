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
