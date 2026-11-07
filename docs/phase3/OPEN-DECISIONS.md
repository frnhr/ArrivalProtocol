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
