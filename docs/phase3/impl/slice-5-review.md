# Slice 5 review: the resident AIs (tracks WARDEN, KIN, FACE)

Independent review of `git diff 2f3c2de..HEAD` on `claude/modest-hawking-209t0f` (HEAD d22c025). The sources were 04 §3.11–§3.15
and §8, 05, DECISIONS, OPEN-DECISIONS 13–27, slice-5-plan.md (R1–R28, each Deviations section and the contract tables) and
AGENTS.md. No source file was edited. The scratch scripts named below are in the session scratchpad and are not committed.

**Fix pass (2026-11-07).** Every finding below is marked **FIXED**, **DECIDED** or **VERIFIED** with how; the details are in
`slice-5-plan.md`, "Deviations (review fixes)". Nothing is left open.

**Verdict.** I found no blocker. No path I tried crashes, softlocks, fails to save or fails to resume. The slice is in
good shape. There are four majors. Two are known items: the `press [L]` race, and the copy of the fair tiers, which can now
simply be imported. The other two are new: the late surprise gives itself away in the MIND strip before it wakes, and a
locked pod can hold a landing open with a strip line that asks for tools the kid may not have.

**Quiet tier time: 135.6 s** for `npm test` (200 passed, 0 failed, 10 balance-only skipped, 4 workers). It ran once, as the
first thing in the session, with nothing else on the machine. That is well under ~190 s, so no trim is needed. The new
suites are cheap: corrupted-flow 6.9 s, sleeper 4.7 s, foundation-flight 2.9 s, left 1.5 s, corrupted-model 1.2 s, ui-models
1.1 s, foundation 1.2 s. The slowest suites predate this slice (`skills/autodrop-review` 22 s, `skills/landing-v3` 20 s,
`skills/autoburn-modes` 17 s). WARDEN's 274 s was load from the parallel tracks, not the slice.

`npm run typecheck` passes.

---

## Repros run (what was verified)

| Probe | Result |
|---|---|
| SHIP DONE and BEAM save on GANNET (a lock mid-count and the DEAL standing at the end), CURLEW (offering, mending, running the drops), HERON (note read) and PROVIDENCE (surprise awake). Each save is decoded, RESUMEd, checked with `resetReport()`, and the run goes on to the next ship. HERON's next ship picks the skill card. | 42/42 pass. Every save decodes. RESUME leaves no module state behind. The skill card installs with `> SKILL TRAINED: AUTODROP.skl v1 · from the resident that left HERON`. |
| RUN THE DROPS on CURLEW with three drivers at 15%, 35%, 50% and 60% | See "Known items". Not a softlock. |
| GANNET with all 7 pods locked (`lockNow`), in the landing | The strip shows `POD 01 LOCKED — [TAB], DELETE or REPAIR WARDEN.sys` (2398 ticks), and L11's wrong `REPAIR its driver` stays hidden under it. The landing waits. |
| PROVIDENCE's late surprise by route (seed 7) | `2>5>11>16`: HOLLOW boards there, and the surprise wakes **in the landing** at 269.6 AI s with 0 bursts. `2>5>11>15>16` (HOLLOW boarded at CORMORANT): it wakes at 30.0 AI s in flight. |
| PROVIDENCE before the wake, in the browser (`__ap.route([0,2,5,11,16])`, 0.8 s in) | `PILOT.SYS` is drawn amber-edged in rack A (`res-mind res-corrupted`; screenshot `providence-prewake.png`). |
| CURLEW's untimed offer at 360×740 | Once the line has typed, all three buttons fit on one row (right edge 346 px). The page does not scroll sideways. No page errors. |
| R23 with a non-DEAL choice opened while MOTH's offer stands | Both choices stay open. `openChoiceEntry` returns MOTH's (m1). |
| `rmTargets` imported straight from `hollow.ts` into `resident-corrupted.ts` (scratch copy) | Typecheck is clean and the whole tier is green (200 passed, 146 s). The load cycle is gone. |
| Prototype of the `press [L]` silence (scratch copy), then `residents/sleeper-sweep` (5 seeds) | RUN THE DROPS plus the kid's hands goes from **65.6% to 88.4%**. The related suites (`residents autodrop landing skills`: 38) stay green. |
| Runtime import graph (type-only imports dropped) | `data/ships.ts` reaches 26 modules: no system with state, no resident module, not `state/actions` or `hollow`. The classic-five load trap is closed. |
| Baseline sweeps re-run at HEAD | Both sleeper-sweep and corrupted-sweep reproduce the plan's tables exactly. |

---

## Blockers

None found.

## Majors

### M1. The kid's `press [L]` races MOTH's RUN THE DROPS (known item a) — FIXED

> **Fixed** (`ec1f442`): `LandingController.waitsFor` and `autodrop.ts controllerWaitLine`, keyed on any controller that is not
> AUTODROP's own, so MERGE inherits it. The wrapper owns every window while its plan has rows (no `planPin` clause: it runs no
> `pinTick`). Re-measured: **88.4%** with the kid's hands. Tested in `residents/sleeper` both ways.

- **Where.** `src/systems/autodrop.ts:656`. `autodropLineOf` returns null when `shadowed(state)`, so under the `'resident'`
  controller the window rows L4, L5 and L3b (`press [L]`) in `landing-guidance.ts:440–465` come back.
- **Problem.** The kid launches out of MOTH's plan. Measured at HEAD (sleeper-sweep, seeds 1, 3, 5, 7 and 9), RUN THE DROPS with
  hands lands **65.6%**. That is worse than RUN THE DROPS with no hands (77.2%) and worse than by hand (71.4%).
- **Fix (prototyped and measured).** When the active controller is `'resident'`, the window is open, and v3's plan for MOTH has
  rows and owns that window, return a wait row with no key. This is the same rule `armedFor` applies to an armed v3. The
  prototype adds this to `autodropLineOf`:

  ```ts
  if (shadowed(state)) {
    if (activeLandingController(state)?.source !== 'resident' || state.landing.window === null) return null;
    const view = viewOf(state, sol);
    if (planLanding(state, view).rows.length === 0) return null;            // plan exhausted: the kid's rows come back
    const lz = state.landing.window.lz;
    if (!(planUses(state, view, lz) || planPin(state, view) === null)) return null;
    const next = armedNext(state, view, 'plan');
    return { row: { id: 'landing-AD-armed', text: /* LANDING_LINES.L13-style WAIT, no [L], no name (R21) */, keys: [],
      urgency: 'wait', layer: 'ship' }, tail: null };
  }
  ```

  The result is **88.4%** (71, 100, 100, 100, 71). That is above AUTODROP v3 bought (82.8%) and MEND then by hand (82.8%).
- **Details for the real fix.**
  - Put the words in `landing-text.ts`, not inline. R21 forbids a sleeper line, so use a plain `WAIT — LZ-A in 0:12`.
  - Keep the id `landing-AD-armed`, so that L10's decay row still outranks it (review m4 of 4c).
  - The early return when the plan has no rows is load-bearing. Without it the strip would also hide the L9 and L11 rows the
    kid needs once MOTH has finished (see "Known items", the softlock question).
  - MOTH has no `pinTick`, because AUTODROP's machine is shadowed. In a window of an LZ the plan does not fly, the kid's [L]
    therefore launches `queue[0]`, which may be a pod MOTH holds for a later window. Either run `pinTick` for the
    `'resident'` source too, or drop the `planPin` clause so that MOTH owns every window while its plan has rows.
- **Test.** Add a check to `residents/sleeper.test` that the strip offers no `[L]` in a window MOTH owns, and offers it again
  once the plan is empty.

### M2. The late surprise is visible in rack A from the boot — FIXED

> **Fixed** (`431ff8a`): `ResidentSegment.hidden`, set on a surprise and cleared at its wake; the strip draws it as a ship
> file. Tested in `ui-models` and `corrupted-flow`, and in the page (`residents.mjs`).

- **Where.** `src/systems/resident-hud.ts:136`. An unscanned `resident` file is always `res-mind res-corrupted`, which
  `resident.css:37–43` draws amber-edged.
- **Problem.** R9 puts the amber RECEIVER CLOSED line on every resident ship precisely so that colour cannot give the surprise
  away on an `unknown` card. The strip undoes that. On PROVIDENCE, 0.8 s into the flight, `PILOT.SYS` sits amber-edged among the
  ship's files (screenshot). On the other `unknown` ships the sleeper's file is a grey dashed `IDLE` and the leftovers are grey.
  A kid who looks at rack A therefore knows 20 s early that this ship's AI is corrupted. 04 §3.12's surprise ("the boot's
  amber line is the only tell") is gone.
- **Fix.** Before the wake on a surprise ship (`def.shown === 'unknown' && corrupted.phase === 'dormant'`), draw the file as a
  plain ship file. `residentSegmentLook` takes only the segment today, so either:
  - KIN or WARDEN writes a segment flag (`awake: boolean`, as the sleeper has) at the wake; or
  - the look takes `shown`.

  The type line `Ship System · Onboard AI` and the name `PILOT.sys` in INSPECT are a softer tell. They are acceptable, because
  the kid has to go and look.
- **Test.** In `ui-models`, a dormant surprise's look is not `res-corrupted`.

### M3. A locked pod with no remedy holds the landing open, and the strip asks for tools the kid may not have — FIXED

> **Fixed** (`d9732d2`, the lead's decision, close to option a): with no remedy (no DELETE, too little charge for the cure,
> no DEAL left or standing, no op on the file) a locked pod can never launch, so it parks locked and the landing ends the
> normal way; the strip says `POD 07 STAYS LOCKED — nothing aboard can free it`. A remedy later makes it launchable again.
> Tested both ways in `corrupted-flow`.

- **Where.** `landing-rules.ts:92–94` (`driverCanEverLaunch`: a lock counts as "can ever") and `resident-rules.ts:69` and `:135`
  (`resident-locked`: `DELETE or REPAIR WARDEN.sys`).
- **Problem.** R7 counts every locked pod as launchable some day, so the auto-end never fires while one is aboard. The kid may
  have no way to free it:
  - no DELETE in hand;
  - REPAIR charge below the cure's cost (12 from 40%; more if a hit lowered the file);
  - the ship's one DEAL already spent (timed out, refused or withdrawn).

  The landing then waits forever, and the strip keeps saying `POD 01 LOCKED — [TAB], DELETE or REPAIR WARDEN.sys`, which the
  kid cannot do. END LANDING (the POD BAY) is the only way out, and nothing says so. My repro (all 7 pods locked) shows that
  line for the whole 120 s. On seed 7's GANNET the unit has SCAN, REPAIR and 24 charge, so the cure is possible there. The
  no-remedy case is reasoned from the code, not reproduced on a real route.
- **Fix (pick one).**
  - (a) `driverCanEverLaunch` treats a locked driver as "can ever" only while a remedy exists: DELETE in hand, or chargeLeft ≥
    the cure's cost, or the DEAL not yet offered. The existing L12 and auto-end rules then apply.
  - (b) Simpler: when no remedy exists, `resident-locked` words itself `POD 01 LOCKED — END LANDING parks it` (≤ 70).
- **Test.** In corrupted-flow, a GANNET with no DELETE and 5 charge: the strip names END LANDING.

### M4. The fair tiers are copied (known item b): the import is now safe — FIXED

> **Fixed** (`397ab78`): `fairDealTargets` deleted, `rmTargets` imported. The pin had nothing left to compare and went; the
> `Thrust.alt` check stays.

- **Where.** `resident-corrupted.ts:249–291` (`fairDealTargets`, `spareKindOf`, `worksAsCopy`, `SPARE_NAME`). A test pins the
  copy (`residents/corrupted-model`).
- **Finding.** The cycle WARDEN met is gone. KIN's `data/zone-check.ts` took `data/ships.ts` off `systems/zones`, and
  `resident-sleeper.ts` already imports `@systems/hollow` (`cureNow`) at HEAD.
- **Verified.** In a scratch copy I replaced the call with `import { rmTargets } from '@systems/hollow'`. Typecheck is clean and
  the whole tier is green (200/200).
- **Fix.** Delete the copy and import `rmTargets`. Keep one check in `corrupted-model` that the DEAL's file is
  `rmTargets(...)[0]` on GANNET. The 8-ship pin then has nothing to pin. No new module is needed. Moving `toolKindOf` and
  `rmTargets` out of `hollow.ts` and `carry.ts` is still a fair tidy-up for slice 8, but nothing needs it now.

## Minors

- **m1. R23's "any other choice" generalisation does not work** — **FIXED** (`6a28e1a`: one arbiter in `say.ts`,
  `choiceMayOpen` / `otherOpenChoice`, `openChoiceEntry` the newest; tested with a second, non-DEAL choice) (`resident-sleeper.ts:329`; `say.ts:336`).
  - `openChoiceEntry` returns the oldest open choice, so while MOTH's offer stands it always returns MOTH's own entry, and
    `other.id !== entryId` is never true.
  - Repro (scratch `r23.ts`): MOTH offering, then any `sayChoice` with a 15 s timer. Both stay open, MOTH stays `offering`, and
    `openChoiceEntry` names MOTH's. So audio-cues' tock and anything else that reads "the open choice" sees the untimed one.
  - Today only HOLLOW's DEAL can collide on a sleeper ship, and the explicit `hollow.deal.phase === 'offered'` clause catches
    it, so no player meets this yet. Slice 7's choices (CONTACT, STAY, the endings) will.
  - Fix: add `say.ts otherOpenChoice(state, entryId)` (any open entry with another id), use it here, and have
    `openChoiceEntry` return the newest.
- **m2. MOTH's gift is paid silently on a lost ship** — **FIXED** (`b570834`: the gift row on the LOST card) (`components/burn/BurnResult.ts:88`).
  - R12's decision pays 4 cycles landed or lost, but the LOST card shows only `shipCycles(result)`. The gift row is on the
    LANDING REPORT only.
  - Fix: add `residentReportRows(state).filter(r => r.kind === 'gift')` under the LOST card's cycles line.
- **m3. The surprise's wake coughs the engine in the landing** — **FIXED** (`b570834`: the cough only in flight) (`audio-cues.ts:329–331`).
  - When HOLLOW decides its first fight only after ORBIT LOCK, the surprise wakes in the landing (WARDEN Deviation 8, and the
    PROVIDENCE route above). It never fires there (R4), but FACE still plays `engineCough`.
  - Fix: play the cough only when `run.phase === 'flight'`, and keep the blip and stamp.
- **m4. MOTH's launches emit no `'autodrop-volley'`** — **FIXED** (`ec1f442`: any controller's launch emits it) (`landing.ts:449`: `autodropLaunched` only for source `'autodrop'`).
  - The volley cue and anything else hung on that event stay silent for MOTH, and MERGE will meet the same in slice 7.
  - Fix: call it for any source whose controller wraps `autodropController`, or emit the volley from the wrapper.
- **m5. HOLLOW's DEAL standing does not hold WARDEN's lock clock** — **VERIFIED and FIXED** (`b28b0da`; tested) (`resident-corrupted.ts:94–98`).
  - The clock holds for WARDEN's own DEAL (Deviation 10) but not HOLLOW's, so a lock can land while the kid reads HOLLOW's
    15 s offer. HOLLOW's verbs do wait on HOLLOW's DEAL.
  - Fix: `if (corrupted.deal.phase === 'offered' || state.hollow.deal.phase === 'offered') return true;`.
  - Not reproduced. It needs HOLLOW awake and offering on a corrupted ship, which the ladder allows at depth 4 or more.
- **m6. WARDEN waits for HOLLOW's first fight on every ship HOLLOW is aboard, not only the boarding ship** — **FIXED**
  (`b28b0da`: the boarding ship only, `threat.age === 1`, as R9 says; recorded as a deviation; PROVIDENCE via CORMORANT
  now wakes at 20 s in flight) (`:114–119`).
  - R9 names the boarding ship. The code (`threat.aboard`) applies the rule to every later ship too, which delays a `reported
    faulty` wake past "the flight's first tick". It is not recorded as a deviation.
  - Either record it (it does keep "never two new foes at once") or limit it to the boarding ship (`threat` stage `board`).
- **m7. A debris or belt hit can lower WARDEN.sys.** — **VERIFIED and DECIDED** (`b28b0da`: the radiation belt does reach rack
  A; zones no longer damage the resident's file, whose health is only the cure's price; tested) `zones.ts damageable = hasIntegrity` includes `resident`.
  - At 0% it stops firing (`residentGhostSpec` checks `integrity <= 0`) but keeps locking and dealing, and the cure costs up to
    20 charge.
  - Not verified: the arm's `debrisRack` is a pod rack, so this may need a belt that reaches rack A.
  - If it can happen, either exclude `resident` from the zones' `damageable` or make 0% quiet.
- **m8. `applyLeftoverPick`'s silent skip is probably unreachable.** — **VERIFIED and FIXED** (`c326213`: unreachable, so it
  throws) ◀ CHART discards the plan, and training needs the desk.
  If it can ever happen, the kid loses the pick with no word. Either say a line, or drop the branch and assert instead.
  Unverified beyond reading `run.ts backToChart` and `goTransmit`.
- **m9. Test gaps on risky paths.** — **FIXED** (`2d37857` and the commits above; `residents/saves` new. The v3 case lets its
  thread go while it waits, rather than holding it: the check pins that) Each would be about 1–3 s:
  - v3 armed with a locked pod (review m8 of the foundation): the thread stays claimed and there is no PLAN DONE until freed;
  - the strip in a landing with only locked pods (my repro, made a check);
  - RUN THE DROPS leaving hurt pods: the landing waits, and L9 or L11 is shown;
  - the M1 silence;
  - M2's dormant look;
  - SHIP DONE, BEAM and RESUME on CURLEW, HERON and PROVIDENCE with `resetReport()` empty. My `saves.ts` does all of these;
    trim it to one case per kind.
- **m10. `DetailPanel` writes `seg.desc` unescaped** — **FIXED** (`3fd13ec`) (`${seg.desc || '—'}`). The text is only ever data-file text, so this is
  not exploitable, but the resident rows beside it are escaped. Escape it for consistency.

## Known items: verdicts

- **(a) Silence `press [L]` under the `'resident'` controller.** Agreed. Fix and numbers are in M1.
- **(b) A cycle-free home for `rmTargets` and `toolKindOf`.** None is needed now (M4): import from `hollow.ts`.
- **(c) SCAN on the driver a lock aims at (`tool-targets.ts:141`).** Keep it as is.
  - It is one line, it reads the pure `lockAimsAt`, and every other driver still refuses with `NO SCAN NEEDED`.
  - `fs-tools.ts paintTargetClasses` repaints on every store notify, so the aimed driver lights as a valid target the tick the
    telegraph starts.
  - SCAN's completion on a driver is harmless: no `scanned` field, so the early return.
- **(d) `data/zone-check.ts`.** Keep it.
  - It is pure: it imports only `types/orbit` and a type from `data/ships`.
  - `zones.ts` re-exports both names, so no caller moved.
  - The graph check shows `data/ships.ts` now reaches no system with state.
  - Add a guard test (architecture item 4) so the trap cannot come back silently.
- **(e) Tier time.** 135.6 s on a quiet machine. No trim needed.
- **RUN THE DROPS leaves pods too hurt for any LZ: is that a softlock?** No.
  - At 15% the drivers can't launch at all. MOTH launches the 4 healthy pods, the plan is then empty (`next null`, no
    SKIP request), and the strip shows `POD 01 CAN'T LAUNCH — TAB, REPAIR its driver` (L11).
  - At 35%: `DROP TOO WIDE FOR LZ-A — TAB, REPAIR POD 01, or fly lower · [F]` (L9), with L5's `LAUNCH — press [L] · WIDE DROP`
    in the windows.
  - At 50% and 60%, MOTH launches all 7.
  - The landing waits exactly as it would for the kid alone. Pace is unaffected: `windowRuleHolds` is the same rule as for
    hand drops.
  - The only way this becomes a trap is M1's fix done without the "plan has rows" guard.
- **A corrupted resident plus HOLLOW, DEAL ordering.** Correct.
  - Whichever offers first holds the ship. HOLLOW's `dealOpen` checks `residentDealOnThisShip`; WARDEN's checks
    `hollow.deal.phase === 'none'`.
  - HOLLOW's DEAL tick runs first, so a same-tick tie goes to HOLLOW.
  - In practice HOLLOW's DEAL nearly always comes first on a shared ship, because WARDEN's needs a landed lock, at least 30 s
    after a wake that already waits for HOLLOW's fight.
- **A resident waking in the landing after HOLLOW's fight.** It works: it locks and never fires. Design cost: D1.
- **MOTH's offer withdrawn by a DEAL, then re-offered (R23).** Correct for HOLLOW's DEAL (tested on REFUSE; ACCEPT takes the
  same path). Not correct for any other choice (m1).
- **The leftover skill card when pending, owned or at the cap.** Correct.
  - `leftoverSkill` skips a pending skill.
  - `grantAllowed('card')` refuses one paid for or held.
  - With no skill left, the card falls back to `+2 CYCLES`, or to a plain card into a final ship (tested in `left.test`).
  - There is no branch-count cap in `grantAllowed`, so "at the cap" reduces to "every open branch owned", which is the
    fallback.
- **The late surprise on PROVIDENCE.** It is not a final ship: its next hop on seed 7 is LAST LIGHT. `__ap.resident.place` also
  refuses a final ship.
- **A disguised seed plus a resident.**
  - HOLD A WALL ignores disguised seeds.
  - The DEAL's tiers never name a hollow segment.
  - A seed's decoy is drawn from packed files, never rack A.

  No interaction found.
- **SENTRY v2 pre-empt plus locks fighting for threads.** Fair.
  - The pre-empt is the kid's own click and holds a thread.
  - A due lock waits at 0 until a thread is free (Deviation 9) and then telegraphs, so there is always a free thread for the
    SCAN at the moment of the telegraph.
  - A 2-thread Core with the pre-empt held telegraphs normally. A 1-thread Core sees the lock only after the seed resolves.
- **The resident's locks plus AUTODROP and END LANDING.**
  - The v1, v2 and v3 queues skip locked pods.
  - v3 armed waits for PLAN DONE while a pod is locked (m8 of the foundation), holding its thread. The kid can disarm with [G].
  - END LANDING parks locked pods (`PARKED IN ORBIT`, the amber report row; tested).

---

## For the designer

Numbers are from seed 7 unless stated. The sweeps are `residents/corrupted-sweep` and `residents/sleeper-sweep`, re-run at
HEAD with the same results as the plan.

- **Item 24 (an ignored WARDEN empties the tank).** Confirmed: 41 bursts and 0% FUEL ignored, against 23.7% with no resident.
  - Blocking every lock with SCAN still ends at 0% (20 bursts). The locks are a side show: the fuel is lost to the bursts, and
    only DELETE (20.8%), the cure (23.3%) or ACCEPT (19.6%) save the tank.
  - If the intent is "the locks are the pressure", stop the bursts after the first SCAN of WARDEN.sys, or after the first
    blocked lock. A kid who found it and fought it then keeps most of the tank.
  - Lower the amp only if Fran wants an ignored resident to be survivable.
- **Item 25 (HOLD A WALL adds little).** Agreed. A suggestion: let MOTH.wall heal what is behind it, as a FIREWALL would,
  or place it in the run the nearest seed's telegraph names (SENTRY's own outline), so that it blocks a landing rather than a
  bite.
- **Item 26 (the sleeper's help).** With M1's silence the table changes:

  | Choice | Landed |
  |---|---|
  | by hand | 71% |
  | RUN THE DROPS, no hands | 77% |
  | **RUN THE DROPS with the kid's hands** | **88%** (was 66%) |
  | MEND, then by hand | 83% |
  | AUTODROP v3 bought | 83% |

  RUN THE DROPS then beats a bought v3. That is fine for a once-a-run gift (R11), but MEND stops being the obvious pick.
- **Item 27 (BARNABY needs DELETE or MOVE).** Still true. Nothing on the strip, the card or the boot (R21) points at it.
  - A run whose unit has only SCAN and REPAIR at CURLEW meets a sleeper it can SCAN (`Held by sleep.lock`) and cannot wake.
  - Lowest-cost suggestion: let REPAIR on `sleep.lock` wake it ("the lock is the fault"). That needs only a new rule in
    `sleeperToolRule` and one more `op-done` kind in the wake.
- **New, D1: on the ship HOLLOW boards, the late surprise wakes in the landing and never fires the engine.** — **DECIDED:
  accepted** (recorded; m3 keeps the cough out of the landing)
  - Seed 7, route `2>5>11>16`: HOLLOW boards PROVIDENCE and sleeps until the loop closes. PILOT wakes at **269.6 AI s, in the
    landing, 0 bursts**. Via CORMORANT (HOLLOW aboard from there): **30.0 AI s, in flight**.
  - The surprise's "the engine coughs" moment happens only when HOLLOW is not new on that ship. Late surprises sit at layers
    6–7, where HOLLOW often boards.
  - Options:
    - wake the surprise at 20 s and hold only its first lock for HOLLOW's fight;
    - never place a surprise on a ship the ladder will board (02's placement knows the forced-boarding depth);
    - accept it.
- **New, D2: the leftover skill card is always the first open branch.** — **FIXED** (`c326213`: drawn among the allowed
  skills; 150 decks: AUTODROP 110, SENTRY 40)
  - KIN measured AUTODROP v1 in 150 of 150 decks. Once SURVEY is built (slice 6), it will still be whichever comes first in
    `SKILL_IDS`.
  - Draw it on the `leftovers` stream among the skills `grantAllowed` permits, if variety is wanted. SCAN already says only
    `A SKILL · LEFT`, so the boot need not know it.
- **New, D3: a locked pod can hold a landing open with no way to free it** (M3). — **DECIDED and FIXED** with M3 Decide whether the landing should end by
  itself in that case, or only the strip should change.
- **New, D4: the `▓░` chart glyph tells a departed resident's ship from the other `unknown` ones** — **DECIDED and FIXED**
  (`3fd13ec`: only where the card already shows the kind, so nowhere in slice 5) once a signal is held (R18
  as built). That is safe, since it points away from the hidden ones, but it narrows "unknown" to sleeper, surprise or a
  fragmentless note.
- **Pressure on a kid who blocks every lock:** the cap counts landed locks only (Deviation 14), so a careful kid meets a
  telegraph every 40 s for the whole ship: 3 blocked on GANNET's 132 s. That is fine. Note it if longer flights come.

---

## Architecture (slice 6 SURVEY, slice 7 endings, MERGE, signals and `?` cards)

1. **The `'resident'` controller slot is registered by the sleeper module** — **FIXED** (`ec1f442`: `residents.ts`, dispatched
   on the kind) (`resident-sleeper.ts:348`).
   - A second resident kind that wants the landing (04's "fights for the helm", or STAY) would have to share or re-register
     it, and `registerLandingController` registers once per source.
   - Move the registration into `residents.ts mountResidents`, dispatching on `state.resident.def.kind` to each kind's
     resolver, as the tool rules already dispatch.
2. **The MOTH wrapper adds "SKIP between passes" around `autodropController`.** — **FIXED** (`ec1f442`:
   `AutodropOverride.skipBetween`; the volley and the window ownership keyed on the controller, not on `'resident'`) MERGE's restored drivers will want the
   same. Move it into the override, as `AutodropOverride.skipBetween?: true`, so both wrappers share one rule. Do the same with
   m4's volley event and M1's window ownership: take `source !== 'autodrop'` rather than `'resident'`, and MERGE inherits them.
   - `LANDING_CONTROLLER_ORDER` (`merge` > `resident` > `autodrop`) and the `version`, `source`, `armed` and `queue` seam hold
     for MERGE. The final ship has no resident, so the two never meet.
3. **Choice arbitration is spread across three modules:** — **FIXED** with m1
   - HOLLOW's `dealOpen` checks `residentDealOnThisShip`;
   - WARDEN checks `hollow.deal` and `openChoiceEntry`;
   - MOTH checks `hollow.deal`, plus a clause that never fires (m1).

   Slice 7 adds more choices (CONTACT, STAY, the endings). Before it does, give `say.ts` one arbiter: `otherOpenChoice`, plus a
   priority (a timed DEAL withdraws an untimed offer).
4. **The import graph.**
   - The classic-five load trap is closed (`data/ships.ts` reaches 26 pure modules).
   - `state/actions` → `residents` → `resident-*` → `say` / `draft` / `tool-targets` → `state/actions` is one large strongly
     connected component. That is safe only while none of those modules runs code at load.
   - **FIXED** (`13fb10f`: `support/import-guard`).
   - Pin it with a cheap unit check: walk the runtime imports from `data/ships.ts` and fail if it reaches `state/actions` or any
     `systems/resident-*`. My scratch `graph.mjs` (a regex walk of `src`, no dependencies) could become
     `support/import-guard.test.ts`.
   - `draft.ts leftoverDeck` repeats `resident-left.ts leftoverAt` because `resident-left` imports `draft`. That is acceptable;
     it is a 3-line lookup.
5. **Module-level state.** Each new variable is registered with `onWorldReset`:
   - WARDEN: `touched`, `answer`, `burstHeard`;
   - KIN: `opsDone`, `scanned`, `answer`;
   - KIN's left module: `scanned`.

   `resetReport()` was empty after RESUME on every resident ship I tried. The only other module state is the `mounted`
   booleans.
6. **Slice 7 signals.** (left for slice 7, as written) `save-codec.ts checkResidentHistory` (around `:295–305`) accepts a signal only on a `left` reservation,
   up to its `fragments`. The `?` signal ship's two fragments (R18) have no resident, so slice 7 must widen that check. Note it
   in the slice 7 plan.
7. **Slice 6 SURVEY.**
   - The leftover skill card picks SURVEY automatically once `built > 0`, but see D2.
   - The sleeper's lesson is one call in `sleeperShipEnd`.
   - `residents.ts`'s dispatcher needs no change.
8. **Slice 7 endings.** `run.residents.met` carries the slot, depth, kind, name, fate and job. The epilogue's `MOTH still
   sings to the RIVERSIDE nursery` needs the colony founded on that slot, which the trail holds. No new field is needed.

## Words and UI

- Every new pool and template renders at its worst case ≤ 70 (`support/words`). I found no literal over 70 outside comments.
  The longest is `resident-ui-text.ts:90`'s INSPECT line at 64 with a 7-letter name.
- I found no hard-coded player-facing words in the FACE components. Everything goes through `resident-ui-text.ts` or KIN's
  and WARDEN's own files.
- The phone layout of the untimed offer is good at 360 px: three buttons on one row, no sideways scroll. The wake lines above
  it truncate with an ellipsis in the 3-line TERMINAL card, which is the pre-existing behaviour.
- `RESIDENT_WAKE_BLIP_AFTER_SEC`, `SURPRISE_GLITCH_*` and `RESIDENT_LINE_EVERY_SEC` are in the right banner blocks.

## Not verified

- M3's no-remedy case on a real route: reasoned, with the all-locked repro as support.
- m5 (HOLLOW's DEAL and the lock clock) and m7 (zone damage to WARDEN.sys): read, not reproduced.
- m8 (whether the skill card's silent skip is reachable).
- e2e was not run. The Playwright look was only PROVIDENCE before the wake and CURLEW's offer at 360 px.
