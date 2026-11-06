# Slice 4c–4e review: AUTODROP, SENTRY, AUTOBURN v3

Reviewer: independent, from HEAD 632365a on `claude/modest-hawking-209t0f`, diff `0a6b211..HEAD`. No source file was edited.
The experiments ran in a scratch copy of `src/` and `tests/`. Their scripts are named below, and every number here comes
from a run, unless the item is marked **unverified**.

- `npm run typecheck`: clean.
- Unit tier at quick depth: 191 passed, 0 failed, 8 BALANCE_ONLY skipped, **144 s** on 4 workers. My own sweeps were
  sharing the CPU during the run.
- No new runtime import cycle. A regex SCC pass over `src/` finds only the existing `actions ↔ orbit-sim ↔ say` cycle,
  which is also present at 0a6b211.

Counts: **2 B, 6 M, 14 m.** Seven questions for the designer, with numbers.

---

## B — correctness bugs a player hits

### B1. MOVE and COPY give away a disguised seed for free, and REPAIR's words do too

- **Where:** `src/systems/tool-targets.ts:172` (`disguisedRefusal`), with `src/systems/fs-tools.ts:230`
  (`paintTargetClasses`).
- **Problem:** a decoy is drawn as one of the unit's own `tool` files (`decoyFileView`). Real unit tools are valid MOVE
  and COPY sources, but `disguisedRefusal` answers `TEMP FILE — NOTHING TO DO` for MOVE, COPY and REPAIR. No other file
  in the game gives that refusal.
  - `paintTargetClasses` marks every `.seg` valid or invalid as soon as a tool is in hand. With MOVE or COPY in hand,
    every AI file lights valid **except the decoy**.
  - Hovering also shows the unique words.
  - REPAIR is worse in a quieter way: every healthy unit tool says `ALREADY 100%`, and the decoy, drawn at 100%, says
    `TEMP FILE`.
  - So the detective work that R9 meant SCAN (1.2 s, a thread) or DELETE to be is free, with no op, no thread and no
    time.
- **Repro:** a scratch probe (`tests/unit/threat/probe-leak.ts` in the scratch copy) plants `cache.tmp` behind KESTREL's
  Telemetry and calls `targetRefusal` on each AI tool:

  ```
  move    Engine I/O=valid | Autopilot=valid | Sensor Interp=valid | Nav Plotter=valid | Telemetry=valid | *DECOY*=TEMP FILE — NOTHING TO DO | AI Comms=valid
  copy    (same)
  repair  … Autopilot=ALREADY 100% | Nav Plotter=ALREADY 100% | Telemetry=ALREADY 100% | *DECOY*=TEMP FILE — NOTHING TO DO
  ```

  `threat/disguise.test.ts:225` asserts this behaviour as intended.
- **Fix:** a decoy must answer every tool exactly as its `decoyFileView` would.
  - REPAIR: `TOOL_REFUSAL.healthy`.
  - MOVE and COPY: a valid source. Picking it (or the op's first tick) unmasks it as a SCAN does (`NOT A FILE`,
    `seen: 'scan'`), and the op is refused there. The kid who tries to move `cache.tmp` finds the seed, at the price of
    a click and a stamp, not a free glance.
  - SWAP is already right (`swapShipOnly`, as on any unit file).
  - Re-pin `disguise.test:225`, and add a check that no tool's valid/invalid class differs between a decoy and a
    healthy unit tool.

### B2. AUTODROP v3's PLAN never ends when only wrong-split leftovers are left: the landing stays open

**Fixed (landing fix pass).** Both parts: `nextLaunchAtTSec` feeds pace, and v3 holds only the LZs it flies. The backstop is left (not needed once the moment is declared). Suite `skills/autodrop-review` (see the plan's "Deviations (review fixes, landing)").

- **Where:**
  - `src/systems/autodrop-plan.ts:449–458`: the leftovers go "into a fitting LZ" that is already full;
  - `src/systems/pace.ts:150–200`: the landing's awaited window is "an in-band window of an LZ with room";
  - `src/systems/autodrop.ts:592` (`armedFor`): v3 owns every open window while its plan has rows.
- **Problem:** once LZ-A and LZ-B are full and only the never-fit LZ-C has room, the plan's remaining rows are leftovers
  into **full** LZ-A and LZ-B (`mislanded: 1`).
  1. Pace's window rule waits on LZ-C's window, so the full LZs' windows pass at CRUISE.
  2. The strip's L13 offers `[F] to SKIP`, and the SKIP lands before LZ-C.
  3. The leftover row's moment is skipped every pass, and it re-plans one period on.
  4. `planOver` never fires.
  5. In LZ-C's window, AD-armed (`AUTODROP ARMED — next LZ-A ×1 in 3:59 · [G] to cancel`) replaces L5's manual `press
     [L]`, so the kid is never asked to throw LZ-C's WIDE drops either.

  The landing loops until the kid cancels [G] or picks END LANDING, and nothing tells them to do either.
- **Repro:** `tests/unit/skills/probe-v3.ts` in the scratch copy, on run 1's VESPER locked mid-band with **drivers
  healthy and the ship's own Sensor Interp damage**. That is `armLanding`'s default instruments, and a common in-game
  state: the kid repaired drivers, not the sensor. A kid who obeys the strip ([G], [F] when lit):
  - the plan was 15 rows, the last 4 of them leftovers (`7:LZ-Bx1M … 8:LZ-Ax1M`), with LZ-C NEVER FITS;
  - the 11 count rows flew by t=426 s;
  - nothing launched after that; at the 1,500 s cap 5 pods (7–11, all at 100%) were still aboard;
  - `PLANNOW [{LZ-A ×1 pods [7] mis 1 in 230 tac}, {LZ-B ×1 [8] mis 1 in 465}, …] remaining {LZ-A:0, LZ-B:0, LZ-C:5}`.

  The sweep's `VESPER busy v3 … 1500 wall s` row has the same cause: pods 9 and 10 left as leftovers.
- **Fix:** both of these, because the first is the general seam.
  1. Let the active controller declare its next launch moment: `LandingController.nextLaunchAtTSec?(state)`, or read it
     in `landingMoment`. `landingPace` and `landingNextEvent` then treat it as a window: TACTICAL inside its lead, and a
     SKIP stops before it. A controller that `holdsTactical` must never have its own moments skipped. This also covers
     a v2 pass whose window is of an LZ that `landingMoment` does not await.
  2. `armedFor` (v3) owns only the window its next row flies. In other windows, L4–L6 stand for the pods the plan does
     not use.

  As a backstop, `planOver` should also end the plan when every row left is a leftover whose LZ has had no TACTICAL
  window for a full period.

---

## M — gameplay or major problems

### M1. AUTODROP v1 held does worse than by hand when the queue mixes sure and WIDE pods (item (b), root cause)

**Fixed.** The hold lets go in a window with nothing more to fly; the sweep's kid lets go with the strip. VESPER busy 50 → 81%.

- **Where:** `src/systems/autodrop.ts:501–528` (`autodropTick`), and the v1 flow in general.
- **Root cause.** It is **not** the REPAIRs taking queued drivers offline mid-volley (the busy kid's REPAIRs mostly
  stall, see the probe).
  1. The strip says `hold [L]` only when the **next** pod's window has a sure part.
  2. The volley centres a single pod at the bracket's centre. On VESPER the sure part takes one launch.
  3. After that launch the next pod is a WIDE one. The key is still down, so nothing launches for the rest of the
     window, while the strip shows `LAUNCH — press [L] · WIDE DROP` to a kid who is holding [L].
  4. The hand kid, by contrast, throws 3–4 pods through the same window at the bay's cadence.

  The busy kid makes this more likely: its partial REPAIRs leave a queue of healthy pods mixed with WIDE ones.
- **Evidence:** `tests/unit/skills/probe-v1busy.ts` (scratch).
  - LZ-B's first window: by hand, pods 1–4 left and all landed. With v1 held, pod 1 went by hand, pod 2 was held to the
    centre, and pods 3–4 never left. Pod 3 was launched after the window closed, when the sweep kid let go.
- **Fix (measured):** while held, when a window is open and v1 has nothing more to fly in it (`heldVolley` is null, or
  is another window), let go of the hold. No lesson is shown: `held = false`, and `end` stays as it was. The strip's
  L5 `press [L]` is then true, and the kid re-presses.

  Sweep results (`autodrop-sweep` with that patch, `V1_FIX=1`):

  | VESPER kid | v0 | v1 now | v1 with the fix |
  |---|---|---|---|
  | healed | 88% | 88% | **94%** |
  | as arrived | 69% | 75% | **81%** |
  | busy (REPAIRs) | 69% | **50%** | **81%** |

  HALCYON and CORMORANT are unchanged in every row.
  - The sweep's v1 kid also lets go only after the window closes. Have it let go when the strip stops saying HOLD, as a
    real kid would.
  - Add an `autodrop-flow` check: held, the next pod WIDE → the hold lets go and `press [L]` launches it.

### M2. AUTODROP v3 on damaged VESPER is slow (item (c)): one pod per window, and every other window is held back

**Fixed.** v3 leaves the windows of LZs it does not fly, with LOAD NEXT pinned to a pod outside the plan: 75% / 494 s → 81% / 400 s. Q3 (v3 throwing WIDE drops itself) stays open.

- **Probe:** `probe-v3.ts`, VESPER as arrived. Sensor ×2.5, and drivers 1–4 and 13 at 1.5–2.
  - The plan is **11 one-pod volleys over 6 passes** (`1:LZ-Bx1, 1:LZ-Ax1, … 6:LZ-Ax1`), with LZ-C NEVER FITS.
  - Volleys flew at t = 80, 132, 160, 211, 239, 290, 318, 369, 397, 446 and 497 s, then `PLAN DONE · A +6 · B +5` at
    497 s.
  - Only then did the kid throw the 5 WIDE pods by hand into LZ-C (t = 517–541).
  - Result: 75%, 494 wall s.
- **Why:**
  1. With Sensor ×2.5, every healthy pod's sure part takes exactly one launch (sure ÷ cadence + 1 = 1).
  2. While the plan has rows, `armedFor` holds **every** window, LZ-C's WIDE ones included (AD-armed beats L4–L6). The 5
     pods the plan cannot use (they fit nowhere, so they are not leftovers either) wait for PLAN DONE.
- **Tried:** letting the kid's [L] through in windows that have no plan row (`V3_FIX=1`): **56% in 149 s.** That is
  faster, but the kid's manual [L] launches `nextToLaunch`, which is often a pod the plan had kept for a sure window.
- **Recommend:** the plan pins LOAD NEXT to an unplanned pod in a window it does not use. AD-armed there reads `LZ-C
  — press [L] · POD 01 isn't in the plan`. That is the B2 fix 2 with the right pod. Whether v3 should throw those WIDE
  drops itself is the designer question (Q3).

### M3. The kid's own launches teach AUTODROP to fire early: an obedient ship 1 gives AIM 60% (new)

**Fixed** by measuring against the cued slot (Q4's first option, consistent with 01-landing's `LAUNCH NOW`): an obedient ship 1 trains 94%.

- **Where:** `src/systems/landing.ts:172` (`dropDemoOffset` per manual launch), as 03 §3.3 specifies.
- **Problem:** the strip's `LAUNCH — press [L]` comes at the launch moment, where the whole dot **first** fits (pace's
  `launchMomentInSec`), not at the centre. Each following launch comes 2 s later. So a kid who does exactly what the
  strip says launches early, every ship.
- **Measured** (`probe-aim.ts`: `followLanding`, no demos before):

  | Ship | Demos (tac s) | AIM | Learned offset |
  |---|---|---|---|
  | ARES-VII | −5.6, −3.3, −1.0 | **60%** | −1.00 (clamped) |
  | HALCYON | −3.7 … −0.8 | 60% | −1.00 |
  | KESTREL | — | 80% | −0.50 |
  | VESPER (healed) | — | 96% | −0.09 |

  - The first-pick AUTODROP is trained on ARES-VII, so the kid who picks it boots ship 2 with `AIM 60%`, and it fires
    1 s early.
  - On CORMORANT as arrived, the hand kid's WIDE drops pulled a seeded AIM 99% down to 60% within 3 drops.
- **Designer question Q4.** The fix is in the rule, not the code: measure a demo against the slot the strip asked for,
  as AUTOBURN measures against START BURN. That is the first launch against the launch moment, and each later launch
  against its cadence slot. Or measure the volley's mean against the centre of the span the kid actually used. Either
  way, an obedient kid scores high, and AUTODROP's centring stays its own.

### M4. On CORMORANT as arrived (all WIDE), nothing says why AUTODROP does nothing; [G]'s refusal points at the wrong fix (item (d))

**Fixed.** `NO SURE WINDOW — REPAIR …`, v3's `NOTHING TO PLAN`, the lessons gated, v2's rows, and DROP's patch 1. The optional L5 tail is left.

- **Probe:** `probe-corm.ts`, v1, v2 and v3 in turn.
  - **v1:** no AUTODROP line on the strip at all. The Skills row says `CENTRE · AIM 60% · 9 drops`.
  - **v2:**
    - the tutorial `AUTODROP v2 — set the split in the POD BAY, then [G]` fires, on a landing where no split can fly;
    - [G] → `> [G] NOTHING SET — use the POD BAY's [+]`, but [+] cannot help;
    - the POD BAY shows no `NO SURE WINDOW THIS PASS`, because the prefill is 0, so `want > 0 && fits === 0` never
      holds.
  - **v3:** the tutorial `[G] flies the whole plan` fires. [G] answers the same `use the POD BAY's [+]`, and v3 has no
    [+]. Only the POD BAY's notes explain it (`LZ-A NEVER FITS — REPAIR SENSOR INTERP, or fly lower`).
- **Fix:**
  - a new refusal word `NO SURE WINDOW` with the REPAIR named, e.g. `NO SURE WINDOW — REPAIR SENSOR INTERP, or fly
    lower`, from `bestRepairForDrop` as the plan's never-fits note does. Use it whenever no LZ has a sure part (v2 rows
    all `fits 0`; v3 plan with every LZ in `neverFits`);
  - gate `tut-autodrop-v2` and `tut-autodrop-v3` on there being something to fly (`autodropTutorialDue`);
  - v2's rows: `noWindow` whenever `fits === 0`, whatever `want` is;
  - optionally a WIDE-DROP tail on L5 while AUTODROP works: ` · AUTODROP: NO SURE PART`.

### M5. AUTOBURN v3's climb to the highest circle (R15 / item (a)): the "nearest above DRAG" rule removes the cost and changes nothing else

**Fixed** (the lead's call; Fran to confirm): `V3_AIM_ABOVE_DRAG = 'nearest'`. `v3-sweep --full` reproduces the table's numbers.

The alternative was measured with the real `v3-sweep`, `--full`, in a scratch copy of `autoburn-v3.ts computeAim`. Among
the candidates with the best fit count (and pods), the rule picks the one with the least transfer Δv from the current
loop while it is above the DRAG line. Below the line, or with none above it, the rule is today's (the highest).

| Start · state (sum of 5 classic ships) | v2 ROUND FUEL | v3 now FUEL | **v3 nearest FUEL** | landed v2 / now / nearest | first drop now / nearest |
|---|---|---|---|---|---|
| low ellipse · healthy | −7.6% | −25.4% | **−6.5%** | 47 / 47 / 47 of 48 | 28 s / 28 s |
| capture loop · healthy | −35.9% | −25.9% | −25.9% | 47 / 46 / 46 | 27 / 27 |
| low ellipse · damaged | −7.6% | −18.9% | −18.9% | 40 / 40 / 40 | 29 / 29 |
| capture loop · damaged | −35.9% | −35.6% | −35.6% | 41 / 40 / 40 | 28 / 28 |

- **Per ship, healthy low ellipse:**

  | Ship | R* alt now → nearest | FUEL now → nearest |
  |---|---|---|
  | ARES-VII | 5,510 → 3,810 | 0 → 0 |
  | HALCYON | 4,010 → 3,110 | −5.0 → −1.6% |
  | KESTREL | 3,510 → 2,810 | −4.8 → −1.6% |
  | VESPER | 3,510 → 2,810 | −9.1 → −1.9% |
  | LAST LIGHT | 3,510 → 2,810 | −6.5 → −1.4% |

  Time to the landing orbit: VESPER 117 → 63 s, LAST LIGHT 337 → 158 s.
- The damaged and capture rows do not change: damaged aims are below the DRAG line, and from a capture loop the nearest
  circle is the top one anyway.
- **Arm integration** (the lead's §8.3 check, which is still not in any suite; `probe-integ.ts`): healthy VESPER, AUTOBURN
  v3 + AUTODROP v3, [B] [G] [F] only.

  | Setup | Landed | Wall s | FUEL |
  |---|---|---|---|
  | AUTODROP v3 alone | 100% | 179 | 0% |
  | AUTODROP v3 + AUTOBURN v3 | 100% | 222 | −10% (climb 6,000 → 6,900 radius) |

  - No sure-window tick under thrust, and no volley refused for ENGINE FIRING.
  - With the nearest rule, the start circle (6,000, a grid point) is the aim, so the transfer is zero.
- **Recommend** the nearest-above-DRAG rule (Q1). The spec's own WHY ("the highest decays least; above the DRAG line it
  does not decay at all") argues for it.

### M6. A refit-only-lower aim with a FUEL term can walk the circle down as FUEL drains (unverified risk)

**Verified and fixed.** It walks (5,200 → 5,100 at 23% FUEL on a low VESPER); the refit now needs a fit change.

- **Where:** `src/systems/autoburn-v3.ts:146–164`, and the refit at `autoburn.ts:630`.
- `fuelAfterPct` is part of the candidate filter, and FUEL in whole percent is part of the memo key. As the transfer and
  the top-ups spend FUEL, the highest candidate that passes the reserve can drop a step. That triggers `GOES LOWER —
  to 2,810 km` (`lowerAlt`) with no LZ reason, and the circle never climbs back.
- No run in the sweeps showed a `lowerAlt`, because the holds rarely ran. A long below-DRAG hold (LAST LIGHT damaged
  reached its orbit at 375 s and then held to the 1,500 s cap) is where it would show.
- **Fix:** judge the reserve once at engage, or refit only on a fit change (`fits` / `misses`), never on a FUEL-only
  change.

---

## m — minor

1. **The v3 ARMED row never shows its SKIP tail.** **[fixed, landing fix pass]** `guidance.ts:828` `withTail(head, ' · [F] SKIP', '')`, and `armedOrbit`
   is 67 characters at `12:34`, so it reaches 78 with the tail and the tail is dropped. [F] stays lit with no words.
   ROUND's row (67 with the tail) is fine. Shorten it (`AUTOBURN ARMED — orbit at ▲ in 3:10 · [B] to cancel`) or
   pass `' · [F]'` as the short tail.
2. **Exactly circular locks make v3 chase ▲.** **[fixed (planner; lockOn's default kept), landing fix pass]** From an e = 0 lock (`lockOn`'s default, used by `autodrop-arm`), v3's
   first burn read `▲ in 0:15` for **176 wall s**, counting down about 1 s per 12 s, with SKIP blocked (`BURN COMING
   UP`). From e ≥ 1e-4 it is normal. In-game ROUND stops at e ≈ 0.0045, so this is a harness trap for any future
   AUTOBURN + AUTODROP suite on `armLanding`. Pick the burn point at "now + a quarter period" when e < ~1e-5.
   **Mechanism unverified;** the symptom is measured.
3. **The never-fits note's `AUTOBURN v3 GOES LOWER` can be false.** **[fixed, landing fix pass]** `autodrop-text.ts neverFits` says it whenever v3 is
   engaged, even when the LZ is in v3's own `aim.misses`, where v3 has decided it will not go lower for it. Use `REPAIR
   X` alone, or `v3 CAN'T FIT IT`, in that case.
4. **AD rows outrank L9 and L10.** **[fixed (L10 over AD-armed), landing fix pass]** `landing-guidance.ts:417`: while v3 is armed, AD-armed stands in every open window,
   so `ORBIT DECAYING` (L10) is hidden for the window's length. Let L10 win, or give AD-armed a decay tail.
5. **AUTODROP does not know when it is shadowed** **[fixed, landing fix pass]** (needed for slices 5 and 7). `autodropTick`, `claimTick` and
   `autodropLineOf` run whether or not AUTODROP is the active controller. With a MERGE or resident resolver flying,
   an armed AUTODROP would still claim a Core thread at T−8 and say `AUTODROP — LZ-A ×2 · LAUNCHING`. Gate them on
   `activeLandingController(state)?.source === 'autodrop'` (or "no higher source answers").
6. **m9 stands, and goes further than `source`.** **[fixed at the seam (source; machine state left to slice 7), landing fix pass]** `autodropController(state, override)` returns `source: 'autodrop'`,
   so a `'merge'` resolver that wraps it throws in `activeLandingController`. `override.queue` is unread, and every
   `decide*` reads `state.landing.autodrop` (`armed`, `held`, `claimed`). MERGE's restored pods need their own machine
   state, or an override that bypasses it. Today's seam is only the version.
7. **The plan memo can hold a row whose moment passed** **[fixed, landing fix pass]** (**unverified in play**). `planKey` has no "now" and no
   `bay.cadenceLeftTac`. A row whose span passed without a launch (ENGINE FIRING, a late claim) stays row 0 until its
   window closes. Meanwhile the claim is held and AD-fly says `LAUNCHING`. Put `rows[0].atTSec < now − span` into the
   key, or drop the stale row at read.
8. **The pre-empt outline is drawn armed after SENTRY falls below v2.** `HollowPainter.ts:282` uses `telegraph.preempted`
   alone, but `stepSeeds` lands the seed as usual then. Use `preempted && sentry ≥ SENTRY_QUICK_RM_VERSION`.
9. **Hard-coded words in the POD BAY table.** **[fixed, landing fix pass]** `landing-hud.ts:732` builds `'NOW'` and `` `IN ${minSec(tac)}` `` inline;
   move them to `AUTODROP_TEXT.bay`.
10. **The plan's check line wraps at 1440** **[fixed (pods), landing fix pass]** (the known item, not re-checked in a browser).
    `PLAN · 3 PASSES · A 1,200 · B 1,000 · C 1,000 ✓` is 47 characters, and 4 LZs with two misses reach 62. Count pods,
    not colonists (`PLAN · 3 PASSES · A 6 · B 5 · C 5 ✓`, 35), which also matches the split's `A ×2` notation. Or put the
    per-LZ part on a second line.
11. **BULLSEYE is decided in two places.** **[fixed (with DROP's patch 2), landing fix pass]** The echo decides in `landing.ts touchDown`, and the float (patch 2) would
    re-derive it from the record. Put `bullseye: boolean` on `'pod-landed'` (events.ts) and have both read it.
12. **v3 with no fitting aim falls to ROUND silently.** **[fixed (ghost and Skills row), landing fix pass]** The kid sees `[B] · ROUND` with no reason. The ghost could say
    `NO LANDING ORBIT FITS — REPAIR SENSOR INTERP`.
13. **Mode checks outside `MODE_RULES`.** **[fixed, landing fix pass]** `autoburn.ts` still compares `mode === 'landing-orbit'` at five sites (146, 230,
    485, 553, 568). They are fine for now, but a fifth mode would need them found by hand. `then === 'hold'` already
    expresses most of them.
14. **INSPECT parity of a decoy.** It shows title, type, size, INTACT, the desc and `◎ re-scan`. A real healthy tool's
    panel may carry rows the decoy does not (the shared renderer at `DetailPanel.ts:495+`). Compare one rendered panel of
    each side by side (**unverified**: needs the DOM).

---

## Checked and fine

- **AUTODROP at rest after an abrupt end.** `probe-abrupt.ts`: END LANDING mid-volley with v2 and v3 claimed, and with v1
  held.
  - Before: `claimed true · busy 1`. After: `armed null · claimed false · busy 0 · end 'landing-over'`. v1: `held false`.
  - `endNow` is the only writer of `landing.ended` (`landing.ts:245`), so crash, all-launched, END LANDING and
    ship-lost all pass through `autodropLandingOver`. `finale.ts:355`'s MERGE reopen starts from rest.
- **[L] by hand while v2/v3 is armed.** `autodropKeyDown` returns `'manual'` while armed. The manual launch goes through
  `requestLaunch`, and the pass and plan recompute from the launches; nothing double-fires. In the MIND, [L] is refused
  SHIP SCREEN as before.
- **AUTODROP + AUTOBURN v3 in one landing** (healthy VESPER): no sure-window tick under thrust and no ENGINE FIRING refusal.
  Only top-ups have a window rule (R13); transfer burns do not, and one run says nothing general about them.
- **The pre-empt thread.** It is released by the `mountSentry` watcher whenever the outline is not armed. `endShip`
  clears `preempted` before SHIP DONE's save, and the world reset drops the reservation. SENTRY falling below v2 holds the
  thread until the landing moment, then lets it go. The outline's look is m8.
- **The save.** No new saved field. The at-rest fields hold at every save point by the paths above. AUTOBURN v3's
  `holding` is false at `'idle'`; it can stand `true` in `'done'` with mode `'landing-orbit'`, which the codec allows,
  and every reader gates on `engaged`.
- **Desk 1.** Both roots cost 3, and `FIRST_PICK_FLOOR_CYCLES` is 3, so both are always affordable. The first pick has
  no default selection, and [1] = AUTOBURN by `SKILL_IDS` order. A kid who picks AUTODROP and lands ship 2 with no
  AUTOBURN captures by hand as in phase 2, and AUTODROP was trained on ship 1's drops (but see M3).
- **Disguise readers other than B1:**
  - the painter's reach, WALL and FIREWALL flashes, the beam tooltip;
  - `amberBite`, the mini-strip, `seedsInMemory` / `threateningSeeds`, `mvBlock`;
  - the MOVE preview (`isVisibleHollow`), `safestSpot`;
  - INSPECT (m14 aside), and the sidebar category (lead's fix: `'ai'`, correct, since `decoyFileView` is `tool`).

  `nameHollow` renames a decoy's `seg.name`, but every reader draws `disguise.name`. TRACE, the tally and the run end
  count it, as designed.
- **`MODE_RULES`.** It is clean: one row per mode, read by both the machine and `predict.ts` (`noShrink`, `circle`,
  `fromFlyby`), with no behaviour change (G2 green). m13 is the leftover.
- **Module-level state.** Only caches and edges: the plan memo, `landingOrbitAim`'s memo, `roundMemo`, and
  `saidTopUpCosts`. All are reset by the world reset or keyed on `run.rev`.

---

## For the designer

- **Q1 (R15).** Should v3 take the **nearest** fitting circle while it is above the DRAG line, and the highest only
  below it?
  - From a low ellipse it cuts v3's FUEL from −25.4% to −6.5%, cheaper even than v2 ROUND's −7.6%, over the five
    classic ships.
  - Landed (47/48) and first drop (28 s) are unchanged, and the landing orbit is reached up to twice as fast.
  - On the arm, with AUTODROP v3 on healthy VESPER, today's climb costs 10% FUEL and 43 wall s for the same 100%.
  - (M5)
- **Q2 (R13).** No top-up happened before the pods were down in any sweep landing. ORBIT's probe gives 1 in 6 or 7
  costing a window, and the decision can wait for slice 8.
- **Q3.** On a blind ship (VESPER: Sensor ×2.5, LZ-C never fits), v3 takes **494 s for 75%**: 11 one-pod volleys over 6
  passes, with the 5 unplannable pods held until PLAN DONE.
  - Letting the kid hand-drop in unplanned windows: 56% in 149 s.
  - Should v3 (or v2) throw WIDE drops for pods that fit nowhere, against R4's "never flies a WIDE DROP"? Or should the
    plan cap its passes and hand the rest back with a line? (M2)
- **Q4.** AIM punishes obedience: the strip's LAUNCH cue is the window's first sure moment, so a kid who follows it
  trains AUTODROP to **60%** and −1 s on ship 1 (ARES −5.6 / −3.3 / −1.0 tac s).
  - Measure demos against the cued slot (as AUTOBURN does against START BURN) instead of the bracket centre? (M3)
- **Q5 (item (b)).** With M1's fix, v1 beats hand on VESPER in every kid state: 94 / 81 / 81% against 88 / 69 / 69%.
  Without it, the busy kid lands 50%. The hold should hand back as soon as it has nothing to fly in the open window.
- **Q6 (item (e)) Disguise frequency.** It is within the spec's letter: per noise seed, 33–34% at depths 5–6 and 49–51%
  at 7–8. Per ship it is rare: 15% of depth-5 ships, 7% at depth 6, 9% at depth 7 (SENTRY's own 800-run table).
  - Multiplying the per-ship rates over depths 5–8 gives about **1 run in 3** that meets a decoy at all.
  - SENTRY v1 SIGHT, bought at visit 3, then names nothing in about 2 runs of 3.
  - Raise the per-ship rate (e.g. a floor of one decoy candidate per noisy beam at depth ≥ 6), or accept SIGHT as a
    rare spike?
- **Q7 (item (d)).** With every window WIDE, AUTODROP has nothing to fly, and the game says so only in the POD BAY's
  never-fits notes, and only for v3. Is a strip line wanted, or is the POD BAY enough? M4's refusal fix is needed either
  way.

## Architecture

- **The registry holds up as a mechanism.** Sources and order are data, one resolver per source, and a resolver
  answering for another source throws. Two gaps for slices 5 and 7:
  - (i) a controller's *pace needs*: B2 shows that a controller holding TACTICAL must be able to name its own next
    moment, or `landingMoment` decides the SKIP without it;
  - (ii) AUTODROP's side machinery (claim, strip rows) must check that it is the active source (m5).

  `AutodropOverride` needs a `source` and its own machine state (m6, m9).
- **Duplicated window logic.** `autodrop-plan.ts` has its own windows (`windowsAt`, `windowsAhead`, `podSureSpan`'s
  even-sweep approximation, `inPassOf`). Pace and the table use `landing-rules landingMoment`.
  - The two disagree about which window "matters", and B2 is the result.
  - Either make `landingMoment` take the controller's next moment, or have AUTODROP's armed rows defer to `landingMoment`
    and add its moment there.
  - `podSureSpan`'s approximation is fine on near-circular band orbits. A suite comparing it with a re-solve on a 0.03
    ellipse would pin the error.
- **Ownership.** BULLSEYE is derived twice (m11). The never-fits words (`autodrop.ts repairWord`) and v3's ghost
  (`autoburn-v3.ts repairName`) map the same `RepairHint` to the same words in two modules. Lift one helper to
  `landing-text.ts`.
- **`MODE_RULES`.** Clean; see m13.

## Tests

- **Gaps on the risky paths:**
  - B1: a check that the target classes of a decoy and a healthy unit tool match for every tool;
  - B2: v3 with only leftovers left, a strip-following kid with [F] → the plan ends, or TACTICAL holds for its row;
  - M1: v1 held, next pod WIDE → the hold lets go;
  - the lead's §8.3 integration check (AUTOBURN v3 + AUTODROP v3 on the arm), which is still absent. `probe-integ.ts` is
    a ready start: mount AUTOBURN on harness7, and lock with e ≥ 1e-3 (m2);
  - END LANDING mid-volley → at rest, thread released, SHIP DONE save decodes. My probe confirms the state; the save
    leg needs `endShip`, which my shortcut skipped;
  - a higher-order test resolver active → AUTODROP claims nothing (m5).
- **Time:** the tier ran 144 s under load, inside the ~180 s threshold, so no trims are needed. The slowest suites were
  `autoburn-modes` 20 s, `autoburn-v3` 15 s, `tsc-tests` 13 s and `autodrop-flow` 10 s.

## Pending patch requests

| # | Patch | Verdict |
|---|---|---|
| DROP 1 | `REFUSAL_LINES` `AUTODROP|<word>` (`script.ts:829`) | **Right**: same shape as `AUTO_REFUSAL_LINES`, data-only import. Fix the words first (M4): `NOTHING SET`'s `use the POD BAY's [+]` is wrong for v3 and for an all-WIDE ship, and `ONLY v1`'s key `[L]` is refused in the MIND, where [G] also works. **Applied (landing fix pass), words fixed first (M4), no keys.** |
| DROP 2 | BULLSEYE float on `NavPlotWindow.ts:1206` | **Right.** The record is `'down'` when `'pod-landed'` fires, and the fourth argument exists. Prefer a `bullseye` field on the event (m11). **Applied, reading the event's `bullseye` (m11).** |
| DROP 3 | `training-model defaultSel` (`:274`) | **Take it:** prefer a `lost` cell whose RESTORE is affordable, then `affordable`, then `lost`, then `dim`. Today ENTER at desk 2 after a lost AUTOBURN buys AUTODROP v1, another branch, on a default. |
| SENTRY | three mini-demo SVGs + CSS | **Unverified.** The plan's Track SENTRY deviations carry only the one-line note. The SVG text is not in the plan or the repo. Have the fix pass draw all six in one hand (§6) with the existing `tr-demo-*` tokens. |
| ORBIT 1 | `skills.ts:28` comment | **Right.** Suggest: `` `built`: … AUTOBURN, AUTODROP and SENTRY v1–v3 (slices 4a–4e); SURVEY none until slice 6. `` **Applied.** |
| ORBIT 2 | 03 §3.6 step 2 note | **Right** (planToCircle, not go-low, R17; the grid starts one step under the top). Also note that v3 can **climb** from a low loop: "goes down" is not the only case. And flag the "Why the highest" sentence for Q1. **Applied, with the climb and the M5/M6 notes.** |

## Scratch scripts

All are in `/tmp/claude-0/-home-user-ArrivalProtocol/76e4d092-2879-5dcd-8be6-93995faeadbb/scratchpad/alt/tests/unit/`.

| Script | What it does |
|---|---|
| `skills/probe-v1busy.ts` | M1 |
| `skills/probe-v3.ts` (`BUSY=1`, `HD=1`) | B2, M2 |
| `skills/probe-integ.ts` (`HEALED`, `LOCK_E`) | §8.3 integration, m2 |
| `skills/probe-corm.ts` | M4 |
| `skills/probe-aim.ts` | M3 |
| `skills/probe-abrupt.ts` | at rest after an abrupt end |
| `skills/probe-words.ts` | word lengths |
| `threat/probe-leak.ts` | B1 |

The env-gated experiments in the same scratch copy are `V3_RULE=nearest` (`src/systems/autoburn-v3.ts`) and `V1_FIX` /
`V3_FIX` (`src/systems/autodrop.ts`).
