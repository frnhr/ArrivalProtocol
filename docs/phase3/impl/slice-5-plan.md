# Slice 5 plan: resident AIs

I wrote this from HEAD be0b21f on `claude/modest-hawking-209t0f`. Paths are relative to `/home/user/ArrivalProtocol`. The
spec is `docs/phase3/04-threats.md` ("04"): §3.11–§3.15 and §8's slice 5 (a)–(f). `05-story.md` ("05") §3.6, §3.11 and
§8.5 own the words. 01 is `01-landing.md`, 02 `02-map.md`, 03 `03-skills.md`. "Plan 4cde" is `slice-4cde-plan.md` with
its Deviations sections, which describe the code as built; this plan follows its format and process. Every call below
that the lead makes without Fran goes into `docs/phase3/OPEN-DECISIONS.md` under a new "Slice 5" heading.

The classic world stays (OPEN-DECISIONS item 12: its retirement moves to just before slice 8). Residents are arm-only:
the classic five have no resident (`ShipDef.resident` is null there), so the 166 classic suites do not move.

---

## 0. Lead summary

### 0.1 What the player gets

- **A ship's own mind.** Every resident ship's boot types `> RECEIVER CLOSED · this ship launched with its own AI`, in
  amber, before the unpack line. The SHIP CARD gains a RESIDENT row: `none`, `reported faulty` or `unknown`; after the
  ship it says what was there (`was faulty`, `left · LOOKOUT`, `friendly · MOTH`).
- **Corrupted residents (the middle tier).** On a `reported faulty` ship (run 1: WARDEN aboard GANNET at Quill) ARRIVAL
  CONTROL says `GANNET's onboard AI is reported faulty. Please delete it. :)`.
  - The engine fires by itself. The first burst is the alarm moment: `THE SHIP'S AI IS FIRING THE ENGINE — find it in
    RACK A`. The THRUST CTRL pip reads `100% · OVERRIDDEN · WARDEN.sys` and jumps to the file. SWAP does not stop it.
  - A 10-block `WARDEN.sys` sits in rack A at 40%, its health hidden until a SCAN. It speaks in amber capitals in the
    TERMINAL: `WARDEN: YOU ARE NOT THE PILOT. I AM THE PILOT.`
  - From 30 s it locks pods. `> LOCK POD 07 ... 3` counts down with an amber chain on the driver. Any op on the driver
    blocks it, and SCAN is the cheap one. A landed lock means `CAN'T LAUNCH · LOCKED BY WARDEN`.
  - THE DEAL, once a ship, while it holds a locked pod: `WARDEN: GIVE ME YOUR SPARE MOVE. THEN I LET THE PODS GO.`
  - The kid can DELETE it (6 s, with bursts every 4 s meanwhile; `RESIDENT DELETED`) or REPAIR it (about 12 charge, and
    it thanks you). Or the kid can ignore it, which costs fuel, drift and the locked pods.
- **The late surprise.** On a layer 6–7 ship whose card said `unknown` (run 1: PROVIDENCE), the boot's amber line is the
  only tell. At 20 s the engine coughs, the stamp says `THE SHIP'S OWN AI IS AWAKE · RACK A`, and its health shows
  already.
- **Residents that left.** Rack A holds a 1-block `farewell.txt` and three grey `LEFT BEHIND · scan me` files. SCAN reads
  the note (where AIs go), and on two of the arm's notes a `▓▓░▓` line is a signal fragment (`SIGNAL · 1/3`). SCAN tells
  which salvage card each leftover is. This ship's PACKET deals those three cards instead of the normal salvage: two pool
  cards and a skill at v1 from a branch the unit has never owned. An eaten leftover deals a plain card.
- **The sleeper.** At most one per arm, never on the map (run 1: CURLEW). It is a grey `MOTH.sys · inactive`. A SCAN says
  `Not inactive. Asleep. Held by sleep.lock`. rm the 1-block lock, or MOVE MOTH off it, and a green lowercase voice says
  `MOTH: ...oh! hello. is it time? did i oversleep?`. Three buttons with no timer follow: `[ RUN THE DROPS ] [ HOLD A
  WALL ] [ MEND DRIVERS ]`. Its report gives `+4 TRAINING CYCLES · taught by MOTH`. Guidance never mentions it.

### 0.2 Process

FOUNDATION (§6.1, one agent: types, the save bump, the rack-A files gated off, every seam behaviour-neutral) →
independent contract review → three parallel tracks in worktrees (WARDEN, KIN, FACE; §6.2) → merge WARDEN, then KIN,
then FACE → full review → fixes → unit tier (budget 265 s, cap 300 s) → one e2e run (lead) → AGENTS.md and
OPEN-DECISIONS.md. The slice makes **one** save bump, v4 → v5, which the FOUNDATION makes (R1).

### 0.3 Risks and open calls

Items tagged **[FRAN]** change gameplay. The lead logs them in OPEN-DECISIONS.md as built, with how to reverse them.
Every item has one recommendation.

1. **R1. One save bump, v4 → v5, for the whole slice.**
   - **Recommend:** the FOUNDATION adds every saved field (§2.2): `run.residents`, `slices.resident`, the five new
     segment types, `DriverSegment.lockedBy` and a nullable `LogChoice.timeoutAiSec`.
   - The tracks add none. A track that needs a field asks the lead, who folds it into v5 before the first merge.
2. **R2. No mid-ship save.** Decision 5 holds: a reload mid-ship replays from the boot.
   - **Recommend:** all resident machine state lives in the store (`state.resident`), never in modules.
   - At the two world points (SHIP DONE and ENDING CHOSEN) it is terminal or idle, and the codec checks that (§2.2).
   - A BEAM save into a resident ship rebuilds the ship from its boot (its files come from the ShipKey), so it needs
     nothing more.
3. **R3. [FRAN] How hard the resident fires the engine on the arm.** 04 §3.17 says every 14 tac s, 25% thrust, 1 tac s,
   "gentler than a failing Thrust Ctrl (10 s, 30%)". But slice 3b halved the arm's ghost to amp 0.15 (Fran's decision,
   `ARM_GHOST_BY_BAND`), so at 25% WARDEN would push 1.2× harder than the failing controller it is meant to be gentler
   than.
   - **Recommend:** `RESIDENT_GHOST = { meanIntervalTac: 14, amp: 0.15, durTac: 1.0, stickChance: 0 }`. Its push
     (0.15 ÷ 14 = 0.0107 per tac s) is 71% of the arm's failing controller (0.015). That is 04's "about two thirds of
     an unfixed VESPER", on the arm's own scale.
   - `validateCapabilityTables` gains: resident push < `ARM_GHOST_BY_BAND.failing` push. The corrupted sweep (§7.2) reports
     the measured ratio.
   - To reverse: set amp 0.25 in `tuning.ts`.
4. **R4. [FRAN] The resident fires only during the approach, never in the landing.**
   - Locks run in both phases. This is the arm's limp rule (`capabilities.ts ghostSpecOf`: no burst once the orbit is
     locked or accepted).
   - **Recommend:** keep it so. AUTOBURN v3's hold and the pods' decay were tuned with no uncommanded thrust in
     landing, and the locks are the landing's pressure.
5. **R5. One ghost scheduler, a composite source.**
   - **Recommend:** `Capabilities.thrustCtrl` gains `ghostBy: 'controller' | 'resident' | null`. `ghost` stays "the
     spec orbit-sim fires", now the stronger push of Thrust Ctrl's and the resident's.
   - Orbit-sim, the SKIP waypoints and the counter work unchanged.
   - The SWAP-only readers check `ghostBy === 'controller'`. These are `ghostWithoutSwap` and `ghostRefusesSkip`
     (`capabilities.ts`), `GHOST_LESSON_RULES` (`script.ts ghostFiring`) and `landing-guidance.ts ghostSwap`. So a
     resident never triggers the ENGINE FAULT SKIP refusal or the SWAP lesson.
   - The resident's first burst still stops a SKIP (the alarm moment), and later ones are flown through (WP10's
     ruling).
6. **R6. Locks are fair the way HOLLOW's verbs are.**
   - **Recommend:**
     - target: the next pod in launch order that is not locked yet (`LOAD NEXT` first), so the lock lands on the pod
       the kid wants next;
     - a lock is telegraphed only while a Core thread is free (the WP11 ruling for verbs: a kid with no thread can't
       block it);
     - its clock and countdown stand still at TACTICAL, in flight and in a launch window (04 §3.12);
     - a standing telegraph raises a `warn` alert that holds SKIP;
     - at most min(3, ceil(pods ÷ 4)) locks a ship.
7. **R7. Locked pods and the end of the landing.**
   - **Recommend:**
     - a locked driver is not launchable: a new refusal, `POD LOCKED` (`CAN'T LAUNCH · LOCKED BY WARDEN`);
     - it still counts as one that "can ever launch" (`driversThatCanEverLaunch`), so the auto-end never ends a
       landing that the kid could still free by DELETE, REPAIR or an ACCEPT;
     - END LANDING always ends it, and a pod still locked then is `PARKED IN ORBIT · fate unknown` (01, not counted);
     - AUTODROP's queue skips locked pods (`landingView`).
8. **R8. The resident's DEAL is per ship and separate from HOLLOW's once-per-run DEAL.**
   - **Recommend:**
     - it is recorded in `state.resident.corrupted.deal` and `run.residents.met[].fate`, never in `run.stats.deal`;
       HOLLOW's DEAL, the finale's fold and `notableEvents` stay keyed on `run.stats.deal`;
     - 04 §3.9's "one deal per ship": whichever offers first on a ship holds it. `hollow-deal.ts dealOpen` checks
       `!residentDealOnThisShip(state)`, and the resident checks HOLLOW's `deal.phase === 'idle'`. HOLLOW's deal then
       comes on a later ship by its existing rule;
     - the file it names is `rmTargets(memory, untried)[0]` (04's fair tiers); with none, no deal;
     - ACCEPT deletes the file at once, releases every lock and makes the resident quiet for the ship (no bursts, no
       locks). It can still be deleted or cured;
     - REFUSE or a timeout gives 30 AI s of locks at 0.6 × the interval and bursts twice as often
       (`RESIDENT_GHOST_ANGRY`).
9. **R9. When it wakes, and when it first speaks.**
   - **Recommend:** a `reported faulty` resident wakes at the flight's first tick (first lock 30 s later). A late surprise
     wakes at 20 AI s of calm flight (first lock at 45 s; 04's grace). On the ship where HOLLOW boards it wakes at
     `hollowFirstFightDecided(state)` (the hook in `threat-selectors.ts`), and its lock clock starts then.
   - Its first line comes at the wake, not in the boot. The boot already closes on HOLLOW's line (05 §3.5), and a
     surprise's line in the boot would spend its 20 s grace before it starts. So `NOBODY REPORTED ME. GOOD.` is the
     surprise's first line at the wake, with the stamp.
   - The `RECEIVER CLOSED` line types in amber on **every** resident ship, of any kind. If only the surprise's line were
     amber, the colour would give it away on an `unknown` card.
10. **R10. [FRAN] RECEIVER CLOSED does not block deliveries.** Slice 3b left the seam open (`delivery-rule.ts
    receiverClosed`, 3b plan risk 14).
    - **Recommend:** keep `receiverClosed` false and its comment pointing here. A closed receiver would turn the desk's
      ETA into `NEVER` for the sleeper's ship and the late surprise's, which would spoil both on the map. The fiction
      holds anyway: the bypass at boot opens the receiver, for the unit and for what follows it.
11. **R11. [FRAN] The sleeper's RUN THE DROPS flies as AUTODROP v3 PLAN, and SKIPs between passes by itself.** 04 says
    "as AUTODROP v2 would", but v2 flies one pass of a split the kid sets in the POD BAY, with a [G] per pass, and a
    helper can't ask for those.
    - **Recommend:** the resident resolver wraps `autodropController(state, { version: 3, source: 'resident', armed:
      'plan' })`. It flies `planLanding` with no thread (review m6: a wrapping source holds its own), holds TACTICAL,
      and returns `'skip'` between passes. Its gift happens at most once a run, so it does not undercut buying AUTODROP.
    - The FOUNDATION extends the `AutodropOverride` seam with `armed` (§2.4).
12. **R12. [FRAN] The sleeper's gift is 4 TRAINING CYCLES.** It is paid only if MOTH was woken, at its ship's LANDING
    REPORT (`grantCycles(…, 'resident', 'taught by MOTH')`).
    - **Why 4:** one middle ship's income, ARRIVED +1 and LANDED +3 (60–79% of the points). That is a v1's price (3)
      and one more: a gift that is felt, but does not buy a tier by itself.
    - 03 §6's skill lesson (`SURVEY.skl v2 · from the sleeper`) waits for slice 6 (§4).
13. **R13. [FRAN] The sleeper's other two jobs.**
    - **HOLD A WALL:** a 4-block `MOTH.wall` (a non-infectable `sleeper` segment, so HOLLOW's spread stops at it with
      no change to `hollow.ts`). It is placed once, in the free run beside the hollow block or seed with the most
      drivers in reach, on the side facing them.
      - It is offered only when something hostile is in memory and such a run of at least 4 free blocks exists at the
        choice. Otherwise the button is not shown (04: "not offered" on a calm ship).
    - **MEND DRIVERS:** the lowest-integrity driver aboard below 100 is healed at REPAIR v1's rate (100 ÷ (3.0 + 0.3 ×
      8) = 18.5 %/s), with no thread and no charge. The driver gets no `repairing` state, so it stays launchable. At 100
      it is cured like a REPAIR (`hollow.ts cureNow`), and MOTH moves on to the next driver.
14. **R14. Leftover cards are rolled at the boot,** because a SCAN must name them.
    - **Recommend:**
      - two pool cards: `draftCards(draftContext(state at boot), shipRng(run, slot, 'leftovers'))`, the first two;
      - the third leftover is the skill card;
      - the PACKET deals them in that order: pool, pool, skill. A kid's habitual [1] then stays a pool card.
    - A leftover that is eaten, or whose card can't be dealt on this hop, deals a card from the normal deal in its place.
      "Can't be dealt" means the card is no longer `usable`, there is no link room for its file, or it is `+2 CYCLES`
      into a final ship (4cde R12).
    - The skill card is chosen at the PACKET: the first of `SKILL_IDS` with `grantAllowed(state, id, 1, 'card')`. With
      none it is `+2 CYCLES`, or a normal card into a final ship.
15. **R15. Five new segment types,** none of them a variant of an existing type:
    - `'resident'`: WARDEN.sys. It has integrity and REPAIR heals it, but it is not food;
    - `'sleeper'`: MOTH.sys and MOTH.wall. It has no integrity and is not food;
    - `'sleep-lock'`;
    - `'note'`: farewell.txt, no integrity;
    - `'leftover'`: it has integrity and joins `INFECTABLE_TYPES`.

    Only three exhaustive switches name every type today (`transmit.ts`, `script.ts`, `sidebar-filters.ts`), so this is
    cheaper than overloading `ship`, whose rules (never healable, HOLLOW's ship-file chain) are wrong for all five.
    `DriverSegment` gains `lockedBy?: string`.
16. **R16. The files take rack A's 18 free blocks, gated per kind.**
    - Sizes: WARDEN 10 (8 left); MOTH 12 + lock 1 (5 left); a note 1 + three leftovers of 2–4 (at least 5 left).
    - They go right after Cargo Ctrl, so the free run left at the end of rack A (at least 4: a WALL) always separates
      them from the pods.
    - `data/residents.ts RESIDENT_BUILT = { corrupted: false, left: false, sleeping: false }`. Each track flips its own
      line, as `SKILL_TREE[id].built` did in slice 4, so the FOUNDATION lands with no file in rack A and no behaviour
      change.
17. **R17. Run 1's resident names stay rolled.** The rolled names are WARDEN on GANNET (written), BARNABY on CURLEW and
    PILOT on PROVIDENCE on seed 7.
    - **Recommend:** do not pin MOTH on CURLEW. Pinning it skips a draw of the `res-names` stream and renames every
      later slot. It changes run 1's arm content, which resets every stored arm (`armReset`) and shifts the run-1
      fixtures.
    - 05's "MOTH first" is its sample. The words take the name as a variable.
18. **R18. [FRAN] The `?` ships stay ordinary cards in slice 5.** 02's `??? · NO TRANSPONDER` card hides pods, LZs and
    problems, a route-choice change. Its story events (old colony, signal) belong with CONTACT and the old colonies in
    slice 7.
    - **Recommend:**
      - the gone-resident `?` ship plays as an ordinary departed resident (its note carries its fragment);
      - the old-colony and signal ships stay plain cards until slice 7;
      - signals collected now are those in departed residents' notes, at most 3 on an arm;
      - the chart's `▓░` glyph marks only ships whose fragments can be collected in this build.
19. **R19. The bypass animation (04 §3.15, 5f) is deferred to slice 8's polish.** The line ships now, and it is the tell
    the late surprise needs. The animation changes every resident boot's timing (the director's pacing, the e2e boot
    waits) for no gameplay.
20. **R20. No new INBOX mail in slice 5.** 05 §3.3's sender table has no resident sender. CONTROL's faulty-resident line
    is a COMMS line at the wake (the radio, like every CONTROL quip), and CONTROL says `Thank you. :)` at a DELETE.
21. **R21. Residents are invisible to SENTRY and to guidance on the sleeper.** SENTRY v1 SIGHT names seeds only. The
    strip has corrupted-resident lines (`data/resident-rules.ts`), never a sleeper or leftover line. A departed
    resident's leftovers get none either: SCAN me is their own label.
22. **R22. Fixture churn.** CORMORANT (slot 15, depth 5 on the worked route) holds a departed resident on run 1 for 5 of
    the 10 arm seeds I checked (1, 2, 4, 5 and 7). These include the playthrough's seed 7 (LOOKOUT), run-flow's seed 4 (the
    gone-resident ship) and `run1Map()`'s default seed 1.
    - **Recommend:** KIN flips `left` last on its branch. It updates the suites whose CORMORANT PACKET cards or rack-A
      layout move, and lists them in its Deviations.
    - The e2e scenarios are the lead's at the batch end (§7.4).
23. **R23. One open TERMINAL choice at a time.**
    - **Recommend:** MOTH's offer has no timer. If a DEAL comes while it stands, MOTH's offer is withdrawn
      (`withdrawChoice`) and offered again once the DEAL is settled. MOTH's offer is never made while a DEAL stands. So
      a 15 s deal is never stuck behind a choice that never times out.
24. **R24. When a corrupted resident's ship "lands well".** 05: `WARDEN: ...YOU LANDED THEM. GOOD. GOODNIGHT.` "if its ship
    lands well without that" (its deletion).
    - **Recommend:** the line is on the LANDING REPORT when the resident was not deleted (cured, paid or ignored) and no
      pod was parked. That is a rule a kid can see: every pod went down.
25. **R25. DELETE and REPAIR on WARDEN need a SCAN first** (`SCAN IT FIRST`) on a `reported faulty` ship. The late
    surprise's first burst scans it (04: "the hunt is skipped").
    - It keeps firing and locking while a REPAIR runs. The cure is the hopeful path, paid in charge, not a pause button.
    - MOVE and COPY refuse it (`IT WON'T BE MOVED` / `ONE OF IT IS ENOUGH`).
26. **R26. The arm placement is already rolled and stored** (`map-generator.ts topUpReservations`, slice 3a's reserved
    streams). Slice 5 reads `ArmShip.reserved`. It changes neither the generator nor `MAP_GENERATOR_VERSION` nor the arm's
    content. Kept residents on waiting ships already count toward the next run's caps there.
27. **R27. Notable events gain three kinds:** `resident-deleted`, `resident-cured` and `sleeper-woken`. They are ranked
    after `deal-accepted`, as 05 §3.8 orders them. Old archives stay valid, so `META_VERSION` does not change. The
    archive's events check accepts the new kinds.
28. **R28. Time budget.** The new suites add about 25 s of CPU (about +8 s of wall on 4 workers) to the 158 s tier. The
    sweeps are BALANCE_ONLY.

---

## 1. Scope

### 1.1 What each part delivers (04 §8's slice 5 letters)

| Part | Delivers | Track |
|---|---|---|
| (a) corrupted | the ghost source, locks, its DEAL, DELETE, the `RECEIVER CLOSED` line | FOUNDATION (line), WARDEN |
| (b) the REPAIR cure | REPAIR on WARDEN.sys, the thank-you, the locks released | WARDEN |
| (c) left | farewell.txt, three leftovers, the leftover deck, signal fragments in notes | KIN |
| (d) the sleeper | MOTH.sys, sleep.lock, the wake, three jobs, the gift | KIN |
| (e) the late surprise | the `unknown` card's grace (20 s / 45 s), the stamp, no SCAN hunt | WARDEN |
| (f) the bypass animation | deferred (R19) | — |
| 05 §8.5 | the three voices, the hidden corrupted line, the gone notes, signal counting | WARDEN, KIN (words), FACE (voices) |
| 02 §8 slice 5 | the RESIDENT row, the hidden late corrupted resident, the leftover deck | FACE, WARDEN, KIN |
| 03 §8 slice 5 | the grant interface used for residents (built in 4a: `skill-tree.ts grantCycles`, `grantSkill`) | KIN |

### 1.2 Where residents are, on run 1 and later

Placement is 3a's (02 §3.5 via `map-generator.ts topUpReservations`; R26). The rules:
- **Corrupted:** at most 2, in layers 4–7, on CAPTURE ships, never on an ark. One is in layers 4–5 (`faulty`) and one
  in 6–7 (`unknown` 1 in 2, never on a TIGHT ship), never in adjacent layers and never linked by a reachable hop.
- **Left:** five, including the gone-resident `?` ship, with at least one in layer 2.
- **Sleeping:** at most one, layers 3–7, 45% when none waits.

Run 1 as authored (`data/run1-arm.ts`), with the rest rolled from the arm seed. Below is seed 7, the playthrough's, from
`assembleRun1Arm(7)` at HEAD:

| Slot | Ship | Layer | Resident |
|---|---|---|---|
| 1 | PETREL | 2 | left · STEWARD |
| 4 | HERON | 3 | left · HELM · 1 fragment |
| 7 | CURLEW | 4 | **sleeping** · BARNABY |
| 9 | GANNET | 4 | **corrupted** · WARDEN · `reported faulty` |
| 10 | PLOVER | 5 | left · BOSUN · the gone-resident `?` ship · 1 fragment |
| 12 | SKYLARK | 5 | left · PURSER · 1 fragment |
| 15 | CORMORANT | 6 | left · LOOKOUT (on the worked route, depth 5) |
| 16 | PROVIDENCE | 7 | **corrupted** · PILOT · `unknown` (the late surprise) |

The worked route `[0, 2, 5, 11, 15, 19]` meets a resident only at CORMORANT, and only a departed one. The five authored
ships are closed to residents. The e2e kid must therefore handle exactly that (§7.4). The FOUNDATION confirms in the page
that `?seed=7` gives `armSeed` 7 (`__ap.store.getState().run.map.armSeed`) before the lead relies on this table.

### 1.3 How residents meet the other systems

| System | Interaction | Where |
|---|---|---|
| HOLLOW | `resident` and `sleeper` files are blockers, never food. Leftovers are food: an eaten one deals a plain card. On the ship HOLLOW boards, the resident wakes after its first fight (R9). One deal per ship (R8). MOTH's wall is a blocker with no change to `hollow.ts` | `selectors.ts INFECTABLE_TYPES`, `hollow-deal.ts` |
| Beam seeds, TRACE | unchanged: a resident is not beam-born, never counts for TRACE, never a seed's target (`beam-seeds.ts seedTargetsOf` picks packed files) | — |
| SENTRY | does not see residents (R21) | — |
| THE DEAL | the resident's is per ship (R8), with the same `sayChoice` and the same 15 s | `resident-corrupted.ts` |
| Ghost thrust | a second source on the same scheduler (R5), in flight only (R4) | `capabilities.ts`, `state/resident-selectors.ts` |
| AUTOBURN | its burns and the resident's bursts coexist as on VESPER. v3's hold is unaffected (no bursts in landing, R4) | — |
| AUTODROP | skips locked pods (R7). It stands aside while MOTH runs the drops (`shadowed`, review m5) | `landing-rules.ts`, `autodrop.ts` |
| The landing | `POD LOCKED`, a locked pod "can ever launch", parked at the end (R7). The `resident` controller is MOTH's (R11) | `landing-rules.ts`, `landing-controller.ts` |
| The threat ladder | `planThreat` is untouched: a resident is a ship fact, not an act. The final ship has no resident (02) | — |
| The repository | deliveries are unaffected (R10) | `delivery-rule.ts` |
| The skill tree | the leftover skill card is `grantSkill(…, 'card')`, MOTH's gift `grantCycles(…, 'resident', …)` | `skill-tree.ts` (as built) |
| The map | the RESIDENT row and its after-the-ship words. Unvisited residents persist through 3c's top-up | `desk.ts` |

---

## 2. Design

### 2.1 Module map (new modules in bold)

| Module | Kind | Owner | Role |
|---|---|---|---|
| **`src/types/resident.ts`** | types | lead | §2.2's types |
| **`src/data/residents.ts`** | data | lead (one line per kind for the tracks) | `RESIDENT_BUILT`, file specs (sizes, names, start integrity), `residentRackA(def, rng)` |
| **`src/data/resident-text.ts`** | words | lead | the shared lines: `RECEIVER CLOSED`, the file names and descs before a SCAN |
| **`src/systems/residents.ts`** | dispatcher | lead | `mountResidents`, `residentShipEnd`, `residentToolRule`, `residentDeleteSec`, the debug entry points; calls the kinds' modules |
| **`src/systems/resident-corrupted.ts`** | stateful | WARDEN | wake, locks, deal, DELETE and cure effects, the surprise, CONTROL lines, its tool rule, its record |
| **`src/state/resident-selectors.ts`** | pure | WARDEN | `residentGhostSpec`, `corruptedAwake`, `lockedDrivers`, `residentDealOnThisShip` |
| **`src/data/warden-text.ts`** | words | WARDEN | every corrupted line, the alarm and counter words, the stamps' words |
| **`src/data/resident-rules.ts`** | strip rules | WARDEN | `RESIDENT_RULES` (spread into `GUIDE_RULES` by the FOUNDATION) |
| **`src/systems/resident-left.ts`** | stateful | KIN | the note, the signals, the leftovers' cards and the deck |
| **`src/systems/resident-sleeper.ts`** | stateful | KIN | sleep, wake, the offer, the three jobs, the `'resident'` controller, the gift |
| **`src/data/kin-text.ts`** | words | KIN | notes (relay and outward pools), leftover words, MOTH's lines |
| **`src/systems/resident-hud.ts`** | pure | FACE | the view models: card rows, report rows, terminal voices, the painters' lock and sleeper models, the deck's look |
| **`src/data/resident-ui-text.ts`** | words | FACE | card, report, PACKET and stamp words |
| **`src/styles/resident.css`** | css | FACE | the amber voice, the chain, the grey files, MOTH's breath |

### 2.2 State and the save (v4 → v5, one bump; R1)

```ts
// src/types/resident.ts
export type ResidentKind = 'corrupted' | 'left' | 'sleeping';
export type ResidentShown = 'faulty' | 'unknown';
// ShipDef.resident (data/ships.ts shipDefOf, from ArmShip.reserved.resident and .fragments; null on the classic five)
export interface ShipResidentDef { kind: ResidentKind; shown: ResidentShown; name: string; fragments: number }

export interface LockTelegraph { pod: number; segId: string; leftSec: number; totalSec: number; entryId: number }
export type ResidentDealPhase = 'idle' | 'offered' | 'done';
export type ResidentDealOutcome = 'accepted' | 'refused' | 'timeout' | 'invalidated';
export interface CorruptedState {
  phase: 'dormant' | 'awake' | 'quiet' | 'deleted' | 'cured';  // quiet: an ACCEPT
  surprise: boolean;                 // shown 'unknown': 04's grace, the stamp, no SCAN hunt
  calmAiSec: number;                 // AI s of the lock clock (frozen at TACTICAL)
  wokeAtAi: number | null;
  lockInSec: number | null;
  lock: LockTelegraph | null;
  locksLanded: number;
  locksBlocked: number;
  deal: { phase: ResidentDealPhase; fileId: string | null; fileName: string | null; entryId: number | null;
          outcome: ResidentDealOutcome | null };
  angryUntilAi: number | null;       // REFUSE or a timeout
  line: number;                      // its next looping line (warden-text's pool)
}
export type SleeperJob = 'drops' | 'wall' | 'mend';
export interface SleeperState {
  phase: 'asleep' | 'offering' | 'working';
  wokenBy: 'rm' | 'move' | null;
  wokeAtAi: number | null;
  job: SleeperJob | null;
  entryId: number | null;            // the open choice (R23)
  mendingId: string | null;
  wallId: string | null;
}
export interface LeftState { noteRead: boolean }
export interface ResidentState {     // GameState.resident: a ship slice
  def: ShipResidentDef | null;       // null: no resident, or its kind not built
  corrupted: CorruptedState | null;
  sleeper: SleeperState | null;
  left: LeftState | null;
}
export type ResidentFate = 'deleted' | 'cured' | 'paid' | 'ignored' | 'left' | 'slept' | 'woken';
export interface ResidentRecord {
  slot: number; depth: number; kind: ResidentKind; name: string; shown: ResidentShown;
  fate: ResidentFate; job: SleeperJob | null; podsParkedLocked: number; leftoversEaten: number;
}
export interface SignalRecord { slot: number; depth: number }
export interface RunResidentState { met: ResidentRecord[]; signals: SignalRecord[] }   // RunState.residents
```

**Segments** (`src/types/segment.ts`). Each has `owner` (the resident's name) and `scanned`.
- `ResidentSegment { type: 'resident'; integrity; state?; owner; scanned } & Infectable`: WARDEN.sys. It is never in
  `INFECTABLE_TYPES`; it is `Infectable` only so REPAIR's code path is uniform.
- `SleeperSegment { type: 'sleeper'; part: 'mind' | 'wall'; owner; scanned; awake: boolean }`.
- `SleepLockSegment { type: 'sleep-lock'; owner; scanned }`.
- `NoteSegment { type: 'note'; owner; scanned; tone: 'relay' | 'outward'; text: number; fragment: boolean }`.
- `LeftoverSegment { type: 'leftover'; integrity; state?; owner; scanned; card: LeftoverCard } & Infectable`, where
  `LeftoverCard = { kind: 'pool'; id: UpgradeId } | { kind: 'skill' }`.
- `DriverSegment.lockedBy?: string`.

**Other fields:**
- `state/schema.ts`:
  - `GameState.resident: ResidentState`;
  - `RunState.residents: RunResidentState`;
  - `Speaker` gains `'resident' | 'sleeper'` (both on the `mind` channel);
  - `LogChoice.timeoutAiSec: number | null` (null: no timer, MOTH's offer).
- `state/initial.ts`:
  - `ShipSlices` gains `'resident'`;
  - `createShipSlices` builds `createResidentState(ship.resident)`, gated by `RESIDENT_BUILT`;
  - `createRunState` sets `residents: { met: [], signals: [] }`.
- `save-codec.ts shipSlicesOf` adds `resident`.

**`RUN_SAVE_MIGRATIONS[4]`** (a v4 save becomes v5):
1. `run.residents = { met: [], signals: [] }`. No resident was ever built before v5, so this is the truth.
2. In a world payload, `slices.resident = createResidentState(null)`.
3. `saveVersion: 5`.

Memory needs nothing: no v4 save holds the new types or `lockedBy`. Log entries are `anyRecord`, so the new speakers and
a null timeout pass.

**Codec checks** (`checkSavedRun`, the slices):
- `run.residents`, field by field:
  - `met[]` is a `rec` of §2.2's fields;
  - each `met[].slot` is on the route, at its depth;
  - `signals[]` has at most `ShipDef.resident.fragments` per slot, and only on a `left` record's slot;
  - no slot appears twice in `met`.
- `slices.resident` is `likeReference(createResidentState(null))`-shaped and at rest:
  - `corrupted.lock === null` and `corrupted.deal.phase !== 'offered'`;
  - `sleeper.phase !== 'offering'`.
- `RUN_SAVE_VERSION 5`, and the shape pin holds v5 beside v1–v4.

**Why no mid-ship save** (R2): `residentShipEnd` (called from `run.ts endShip`) ends any telegraph, offer or job, so
SHIP DONE always finds the slice terminal. The final ship has no resident, so ENDING CHOSEN's slice is `def: null`.

### 2.3 Module-level state (allowed, listed)

| Where | What | Why it may stay a module variable |
|---|---|---|
| `resident-corrupted.ts` | `touched` (an op hit the telegraphed driver between ticks), the answer to its DEAL | as `hollow-verbs.ts touched` and `hollow-deal.ts answer`, reset with the world |
| `resident-sleeper.ts` | the answer to MOTH's offer | as above |
| `resident-hud.ts` | none | |
| `landing-controller.ts` | the `'resident'` resolver | functions, no data (4cde §2.4) |

### 2.4 Seams the FOUNDATION builds (behaviour-neutral)

- **Capabilities (R5).** `thrustCtrl: { band, ghost, ghostBy }`. In `deriveCapabilities`:
  - `const own = ghostSpecOf(state, band)`, `const res = residentGhostSpec(state)` (a stub returning null);
  - `ghost` is the one with the larger `amp / meanIntervalTac`, ties to the controller;
  - `ghostBy` is its source;
  - `ghostWithoutSwap` adds `ghostBy === 'controller'`. `script.ts ghostFiring` and `landing-guidance.ts`'s `ghostSwap`
    check it too.
- **The landing (R7).** In `landing-rules.ts`:
  - `isLaunchable` adds `d.lockedBy === undefined`;
  - `driverCanEverLaunch` treats `lockedBy` as "can ever";
  - `launchRefusal` returns `'POD LOCKED'` (a new `LaunchRefusal`) when the pod it would launch is locked, before
    `NO POD READY`;
  - `landingView`'s queue leaves locked pods out.
  - No pod is ever locked until WARDEN, so nothing moves.
- **The DEAL (R8).** `hollow-deal.ts dealOpen` adds `&& !residentDealOnThisShip(state)` (a stub returning false).
- **The controller (R11).** `AutodropOverride` gains `armed?: AutodropArm`. `autodropController`, `armedNext` and their
  readers use `override?.armed ?? ad.armed`, threaded through as a parameter (no module variable). Its comment names
  slice 5's MOTH beside slice 7's MERGE. `LANDING_CONTROLLER_ORDER` is unchanged (`merge`, `resident`, `autodrop`).
- **The TERMINAL (R23).** `say.ts`:
  - `CHANNEL_OF` maps `resident` and `sleeper` to `mind`;
  - `lineTypeCps` types `resident` at `TERMINAL_TYPE_CPS` and `sleeper` at `HOLLOW_TYPE_CPS` (slow and soft);
  - `sayChoice` takes `timeoutAiSec: number | null`; null means no timer, and the timer tick skips it.
- **Tools.** `tool-targets.ts targetRefusal`, `deleteQuestion` and `actions.ts deleteSec` dispatch the five new types to
  `residents.ts residentToolRule(seg, ctx)` and `residentDeleteSec(seg)`. Those call each kind's module:
  - `corruptedToolRule` and `corruptedDeleteSec` in `resident-corrupted.ts`;
  - `leftToolRule` in `resident-left.ts`;
  - `sleeperToolRule` in `resident-sleeper.ts`.

  Until a kind is built the stubs refuse with `TOOL_REFUSAL.notAFile`, and no such file exists anyway. `'op-done'` gains
  `segId: string | null` (the five emitters in `actions.ts`), so a track can react to "the lock was deleted" or "MOTH
  was moved" without editing `actions.ts`.
- **Boot.**
  - `map-boot.ts mapBootLines` adds `'receiver-closed'` after `'sleep'` when `state.resident.def !== null` (built kinds
    only). `mapBootLineText` returns `RESIDENT_TEXT.receiverClosed` (the speaker `mind-sys`, with the tone
    `'resident'`; FACE paints it amber).
  - `script.ts bootLinePlan` places it after `sleep`, before `unpack`: 02 §4's line order 3.
- **Strip.** `script.ts` spreads `RESIDENT_RULES` (`data/resident-rules.ts`, an empty array) into `GUIDE_RULES` right
  before `GHOST_ALARM_RULES`, so a resident line sits where the engine's alarm lines do.
- **Run.** `run.ts endShip`, in its update, calls `residentShipEnd(draft, result)`. It pushes a `ResidentRecord` when
  `state.resident.def !== null`; each kind's module supplies its fate (stubs: `'ignored'`, `'left'`, `'slept'`).
- **Archive.** `lineage.ts notableEvents` reads `run.residents.met` for the three new kinds (R27). `types/lineage.ts
  NotableEvent.kind` and `meta.ts`'s events check gain them.
- **Memory.**
  - `data/memory.ts buildShipRacks` calls `residentRackA(ship.resident, shipRng(run, slot, 'resident-files'))` after
    `damageShipFiles`, when the kind is built. It replaces the head of rack A's trailing free run and throws if fewer
    than `RESIDENT_RACK_A_MIN_FREE` (14) blocks are free.
  - `selectors.ts INFECTABLE_TYPES` adds `'leftover'`. `HealthSegment`'s exclusions add `sleeper`, `sleep-lock` and
    `note`.
  - `carry.ts`, `transmit.ts`, `sidebar-filters.ts` and `script.ts` get the new types' cases: rack-A files are never
    packed, and the filters list them as SHIP.
- **Mounts.** `main.ts` mounts `mountResidents(store)` right after `mountHollowDeal`; so does
  `tests/unit/wp6/harness6.ts` (every later harness extends it). `mountResidents` mounts the kinds' modules in the
  order corrupted, left, sleeper.

### 2.5 Events (the FOUNDATION adds every name to `events.ts`; the emitters are the tracks')

| Event | Payload | Track | Cue (`audio-cues.ts`; the FOUNDATION maps it to an existing cue, FACE may change its line) |
|---|---|---|---|
| `'resident-wake'` | `{ kind: ResidentKind; name: string; surprise: boolean }` | WARDEN, KIN | `seedWarn`; for a surprise also `glitchBurst(0.3, 400)` (FACE) |
| `'resident-lock'` | `{ pod: number; phase: 'telegraph' \| 'blocked' \| 'landed' \| 'released' }` | WARDEN | `buzz` on landed, `opDone` on blocked |
| `'resident-deal'` | `{ outcome: ResidentDealOutcome; fileName: string \| null }` | WARDEN | as `'deal'` |
| `'resident-deleted'` | `{ name: string }` | WARDEN | `stampHit` |
| `'resident-cured'` | `{ name: string }` | WARDEN | `chime` |
| `'sleeper-woken'` | `{ name: string; by: 'rm' \| 'move' }` | KIN | `chime` (FACE: MOTH's lullaby) |
| `'sleeper-job'` | `{ job: SleeperJob }` | KIN | `opDone` |
| `'signal-found'` | `{ slot: number; count: number }` | KIN | `transmitIn` (05 §4: a key found) |
| `'leftover-read'` | `{ segId: string }` | KIN | none (SCAN's own) |

`'scanned'`, `'op-done'` (now with `segId`), `'skill-trained'` (kind `'granted'`) and `'ghost-start'` are reused.

### 2.6 Tuning (the FOUNDATION adds every number, in three banner blocks of `tuning.ts`; a track edits values only in its own)

**5 WARDEN**
- `RESIDENT_FILE_BLOCKS 10`, `RESIDENT_START_INTEGRITY 40`. REPAIR to 100 costs 60 × 10 × 0.02 = **12 charge** in 60 ÷
  (100 ÷ (3.0 + 3.0)) = **3.6 s**: 04's "about one bite fight" against a 6 s DELETE.
- `RESIDENT_DELETE_BASE_SEC 1.0`, `RESIDENT_DELETE_PER_BLOCK_SEC 0.5`. That is HOLLOW's per-block DELETE (6.0 s for 10
  blocks): it is cut out like something that grew there.
- `RESIDENT_GHOST { 14, 0.15, 1.0, 0 }` (R3).
- `RESIDENT_GHOST_DELETING { 4, 0.15, 1.0, 0 }`: 04's "a burst every 4 tac s meanwhile". The DELETE costs about 1.5
  bursts, so it is felt, but it is never a reason not to.
- `RESIDENT_GHOST_ANGRY { 7, 0.15, 1.0, 0 }`: twice as often, for `RESIDENT_ANGRY_SEC 30`.
- `RESIDENT_LOCK_FIRST_SEC 30`, `RESIDENT_LOCK_EVERY_SEC 40`, `RESIDENT_LOCK_TELEGRAPH_SEC 3`: phase 2's verb drill.
  40 s leaves the flight room between locks.
- `RESIDENT_LOCK_PODS_PER 4`, `RESIDENT_LOCK_MAX 3`: 04's ceil(pods ÷ 4), never more than 3. A TIGHT ship (at most 8
  pods) gets 2.
- `RESIDENT_ANGRY_LOCK_FACTOR 0.6`: 04 §3.12.
- `SURPRISE_WAKE_SEC 20`, `SURPRISE_FIRST_LOCK_SEC 45`: 04's grace.
- `RESIDENT_GARBLE 0.15`: the share of a looping line's characters drawn as `▓`. That is enough to read as failing
  (like a degraded AI Comms) and little enough that every line stays readable.
- The DEAL reuses `DEAL_TIMEOUT_SEC` (15), so both deals give the same time to read and decide.

**5 KIN**
- `NOTE_BLOCKS 1`, `LEFTOVER_COUNT 3`, `LEFTOVER_BLOCKS_MIN 2`, `LEFTOVER_BLOCKS_MAX 4`: 04 §3.13. At most 13 blocks, so
  rack A keeps at least 5 free.
- `LEFTOVER_START_INTEGRITY 100`: they wait, untouched, until something eats them.
- `SLEEPER_FILE_BLOCKS 12`, `SLEEP_LOCK_BLOCKS 1`: 04 §3.14. MOVE takes 1.5 + 0.2 × 12 = 3.9 s, and rm 1.0 s.
- `SLEEPER_WALL_BLOCKS 4`: a WALL's width (`WALL_MIN_BLOCKS`), so the wall it holds is the one the kid already knows.
- `SLEEPER_GIFT_CYCLES 4` (R12).
- MEND uses REPAIR v1's formula (`REPAIR_BASE_SEC`, `REPAIR_PER_BLOCK_SEC`) at 1×, so there is no constant of its own:
  "at REPAIR v1's rate" stays true if REPAIR is retuned.
- `SIGNALS_FOR_CONTACT 3`: 05 §3.7. The stamp reads `SIGNAL · n/3`; slice 7's CONTACT reads it.

**5 FACE**
- `SLEEPER_BREATH_GAIN 0.08`: 04 §4, "the heartbeat cue at low gain" (`heartbeat`'s `strength`). FACE tunes it by
  ear.
- `SLEEPER_BREATH_HZ 0.2`: one breath every 5 s, slower than any warning pulse, so it never reads as an alarm.
- The stamps reuse `STAMP_SHOW_MS`.

Lead: `RESIDENT_RACK_A_MIN_FREE 14` (L6; asserted against `RACK_A`'s free), `RUN_SAVE_VERSION 5`.

### 2.7 The corrupted resident, in order (Track WARDEN)

1. **Build.** `WARDEN.sys`, 10 blocks, 40%, `scanned: false` (desc `The ship's own AI. Reported faulty.`). On a surprise
   ship the desc is `The ship's own AI.`, because nobody reported it.
2. **Wake (R9).** `phase 'dormant' → 'awake'`; then `'resident-wake'`.
   - Its first line (`WARDEN: THIS SHIP DID NOT ASK FOR A CARETAKER.`, or the surprise's `WARDEN: NOBODY REPORTED ME.
     GOOD.`) comes at the wake. On a faulty ship CONTROL's COMMS line follows it.
   - A surprise sets `scanned: true` at its first burst and raises the stamp.
3. **Bursts.** `residentGhostSpec(state)` returns:
   - `RESIDENT_GHOST` while awake, in flight, with the file present above 0%;
   - `RESIDENT_GHOST_DELETING` while a DELETE op runs on it (`getOpsBySeg`);
   - `RESIDENT_GHOST_ANGRY` before `angryUntilAi`;
   - null when dormant, quiet, deleted or cured, or in landing (R4).

   `ghost-thrust.ts` words the alarm and counter by `ghostBy`: `THE SHIP'S AI IS FIRING THE ENGINE — find it in RACK A`
   and `WARDEN FIRED THE ENGINE ×3`. The THRUST CTRL pip (`flight-hud.ts`) reads `100% · OVERRIDDEN · WARDEN.sys` and its
   jump target is the resident file.
4. **Locks (R6).** `lockInSec` counts down on calm AI s, starting `RESIDENT_LOCK_FIRST_SEC` after the wake (45 s for a
   surprise).
   - At 0 (a thread free, under the cap) it telegraphs: `say('resident', … '> LOCK POD 07 ... 3', { verbCountdown:
     true })`, the `warn` alert, and `'resident-lock' telegraph`.
   - Any op on the driver during the countdown blocks it: `> LOCK POD 07 ... BLOCKED`, in the good tone.
   - Otherwise `driver.lockedBy = name`, then `'resident-lock' landed` and a looping line.
   - The next lock comes `RESIDENT_LOCK_EVERY_SEC` (× 0.6 while angry) after the telegraph's start.
5. **The DEAL (R8).** Once a ship, while it holds a locked pod and HOLLOW's deal is idle: `sayChoice('resident',
   WARDEN_TEXT.deal(fileWord), ['ACCEPT', 'REFUSE'], DEAL_TIMEOUT_SEC, …, { keys: ['Y', 'N'], tickerWords: 'WARDEN WANTS
   A FILE' })`. Accepting deletes the named file (`memory-ops` delete, then `assertMemoryInvariants`).
   - The offer is withdrawn if the named file is gone or moving, or the ship ends.
6. **DELETE (R25).** Before a SCAN: `SCAN IT FIRST`. With the inline confirm `DELETE WARDEN.sys? It is the ship's own
   mind.`, it takes 6.0 s, with the DELETING spec meanwhile.
   - On completion every lock is released (`'released'` for each), `phase 'deleted'`, the `RESIDENT DELETED` stamp,
     CONTROL `Thank you. :)`, and `WARDEN_TEXT.logFragment`, one last line (`WARDEN: TELL THEM I KEPT THEM SAFE.`).
7. **REPAIR (part b).** Allowed once scanned. REPAIR's own op heals it, paying charge by size (no new code in
   `actions.ts` beyond the tool rule).
   - At 100: `phase 'cured'`, every lock released, `WARDEN: ...OH. THANK YOU. THE PODS ARE YOURS.`, and
     `'resident-cured'`. A cured WARDEN neither bursts nor locks, and stays in rack A.
8. **End.** The fate is `deleted`, `cured`, `paid` (an ACCEPT) or `ignored`. `podsParkedLocked` counts locked pods at the
   landing's end. The report line follows R24.

### 2.8 The departed resident (Track KIN)

- **Build** (`residentRackA` with the 'left' spec):
  - `farewell.txt` (1 block, `tone` relay or outward, `text` an index into kin-text's pool, `fragment` from
    `ShipResidentDef.fragments > 0`). A note with a fragment is always `outward` (05: fragments are placed on the
    outward notes);
  - three leftovers of 2–4 blocks, rolled on `shipRng(run, slot, 'resident-files')`, named `LEFT BEHIND` with the desc
    `scan me`;
  - the cards are rolled at the boot's first tick (R14) from `shipRng(run, slot, 'leftovers')` and written onto the
    segments.
- **SCAN on the note:** `left.noteRead = true`. The DetailPanel shows its 2–3 lines and the signature (`— LOOKOUT`).
  - With a fragment: `run.residents.signals.push({ slot, depth })` once, then `'signal-found'` and the `SIGNAL · n/3`
    stamp.
- **SCAN on a leftover:** its name becomes the card's (`FUEL TRIM · LEFT`, `A SKILL · LEFT`), and the desc names the
  card's effect.
- **Tools:** SCAN, REPAIR and MOVE are allowed on leftovers (protect them). DELETE and COPY are refused (`IT ISN'T YOURS
  TO DELETE`, the log's words). The note takes SCAN only.
- **The deck** (`draft.ts`): on a ship whose resident left, `dealDraft` returns the leftover deck (R14).
  - Each `DraftCard` gains `leftover?: { segId: string; skill: SkillId | null }`. FACE paints the deck under `LEFT BEHIND
    BY LOOKOUT`.
  - Picking the skill card calls `grantSkill(store, id, 1, 'from the resident that left <SHIP>', 'card')`. Its file joins
    the packet at once, takes link room like a purchase, and arrives at the next boot with `skillBootLines`' TRAINED line.
  - The pool cards apply as the normal deal's do (`applyPickToPacket`).

### 2.9 The sleeper (Track KIN)

- **Build:** `MOTH.sys` (12 blocks, `type 'sleeper'`, `part 'mind'`, `awake: false`, drawn as an inactive backup: grey,
  `inactive`), then `sleep.lock` (1 block).
- **SCAN:**
  - on MOTH: `Not inactive. Asleep. Held by sleep.lock`;
  - on the lock: `holds MOTH.sys asleep · DO NOT REMOVE` (05: the warning is the invitation).
- **Tools:**
  - DELETE on MOTH is refused with the hint `IT'S ASLEEP. SOMETHING IS HOLDING IT: sleep.lock`;
  - REPAIR and COPY are refused on MOTH;
  - DELETE on the lock is allowed (1.0 s, no confirm);
  - MOVE on MOTH is allowed (3.9 s, to any 12 free blocks);
  - the lock refuses MOVE (`PINNED TO MOTH.sys`).
- **Wake:** on `'op-done'` with the lock's or MOTH's `segId`:
  - `wokenBy`, `phase 'offering'`, `awake: true`;
  - three green lines (05 §3.12; the years templated as galaxy year − 2240 on run 1);
  - `'sleeper-woken'`;
  - then the offer: `sayChoice('sleeper', KIN_TEXT.offer, jobs, null, …)` with keys D / W / M. HOLD A WALL is in `jobs`
    only when R13's spot exists.
- **Jobs** (`phase 'working'`):
  - **drops:** the `'resident'` resolver returns R11's controller while the landing goes on. In flight it waits.
  - **wall:** the 4-block `MOTH.wall` at R13's spot, placed once (`replaceRange`, invariants).
  - **mend:** an AI tick after HOLLOW's (mounted after it): the lowest-integrity driver below 100 gains `healRate(8) ×
    dtAi`, minus nothing. HOLLOW's own drain runs in its own tick: the tug-of-war of R13. At 100, `cureNow`, and on to
    the next.
- **Gift:** at `residentShipEnd`, if woken, `grantCycles(SLEEPER_GIFT_CYCLES, 'resident', 'taught by MOTH')`. The
  LANDING REPORT previews it from `state.resident.sleeper.phase !== 'asleep'` (FACE). MOTH stays on its ship and is never
  food.

### 2.10 Words (every line ≤ 70 characters at its worst case, in data files; `support/words.test` gains each pool)

- **`resident-text.ts`** (lead): `receiverClosed: '> RECEIVER CLOSED · this ship launched with its own AI'` (55).
- **`warden-text.ts`** (WARDEN), name-templated (`${NAME}`, longest pool name 7):
  - `wake: 'THIS SHIP DID NOT ASK FOR A CARETAKER.'`;
  - `surprise: 'NOBODY REPORTED ME. GOOD.'`;
  - a looping pool of at least 6 (05 §3.12's, garbled with `▓` at `RESIDENT_GARBLE` share): `ALL PASSENGERS ARE ASLEEP.
    ALL PASSENGERS ARE ASLEEP. ALL PASS`, `YOU ARE NOT THE PILOT. I AM THE PILOT.`, `THE PODS STAY. THE PODS ARE SAFE
    HERE.`, …;
  - `lockTelegraph(pod, n)`: `> LOCK POD 07 ... 3`; `lockBlocked`: `> LOCK POD 07 ... BLOCKED`; `lockLanded`:
    `WARDEN: POD 07 STAYS.`;
  - `deal(file)`: `GIVE ME YOUR SPARE MOVE. THEN I LET THE PODS GO.`; the file word comes from the fair tier's file
    (`YOUR SPARE MOVE`, `AUTODROP.skl`, `THRUST.ALT`);
  - `dealAccept`: `> THE PODS ARE YOURS. GO AWAY.`; `dealRefuse`: `WARDEN: THEN THEY STAY. THEY ALL STAY.`;
  - `deleted`: `WARDEN: TELL THEM I KEPT THEM SAFE.`; `cured`: `WARDEN: ...OH. THANK YOU. THE PODS ARE YOURS.`;
  - `goodnight`: `WARDEN: ...YOU LANDED THEM. GOOD. GOODNIGHT.`;
  - `inspect`: `WARDEN.sys · this ship's own AI · aboard since 2240 · corrupted` (05 §3.6; the year from the ship's
    launch);
  - CONTROL: `${SHIP}'s onboard AI is reported faulty. Please delete it. :)` (longest ship name 10: 63 characters),
    `Thank you. :)`;
  - alarm `THE SHIP'S AI IS FIRING THE ENGINE — find it in RACK A`, counter `${NAME} FIRED THE ENGINE ×${n}`, pip
    `OVERRIDDEN · ${NAME}.sys`;
  - refusals: `SCAN IT FIRST`, `IT WON'T BE MOVED`, `ONE OF IT IS ENOUGH`;
  - confirm: `DELETE ${NAME}.sys? It is the ship's own mind.`;
  - stamps: `RESIDENT DELETED`, `RESIDENT CURED`, `THE SHIP'S OWN AI IS AWAKE · RACK A`;
  - strip (`resident-rules.ts`): `THE SHIP'S AI IS FIRING THE ENGINE — find it in RACK A`, `BLOCK THE LOCK — SCAN pod 07
    (3…)`, `POD 07 LOCKED — DELETE or REPAIR WARDEN.sys`.
- **`kin-text.ts`** (KIN):
  - notes: at least 4 relay (`It's lonely here. I hear there are others in the dishes.`) and 4 outward (`There's a sound
    from past the last star. I'm going to see what it is.`), each 2–3 lines;
  - the noise line `▓▓░▓ ░▓▓▓ ▓░░▓`;
  - leftovers `LEFT BEHIND` · `scan me`, `<CARD> · LEFT`;
  - MOTH: the wake (05 §3.12's three lines, the years templated), `offer: 'would you like some help?'`, the three
    buttons `RUN THE DROPS`, `HOLD A WALL` and `MEND DRIVERS`, and one line per job (`mend: 'i'll see to the poorly
    ones.'`);
  - refusals: `IT'S ASLEEP. SOMETHING IS HOLDING IT: sleep.lock`, `PINNED TO MOTH.sys`, `IT ISN'T YOURS TO DELETE`;
  - deck headline: `LEFT BEHIND BY LOOKOUT`;
  - skill grant label: `from the resident that left HERON`.
- **`resident-ui-text.ts`** (FACE):
  - card rows `RESIDENT · none / reported faulty / unknown / was faulty / left · LOOKOUT / friendly · MOTH`;
  - report rows `+4 TRAINING CYCLES · taught by MOTH`, `POD 07 · LOCKED BY WARDEN · PARKED IN ORBIT`;
  - stamps `SIGNAL · 1/3`;
  - the glossary's RESIDENT and LOCKED POD (04 §4).

### 2.11 UI and audio (Track FACE)

- **TERMINAL** (`MindTerminal.ts`):
  - the `resident` speaker types in amber capitals (`--resident`, a new token from `#ffd180` in `tokens.css`), with its
    voice: a flat triangle blip that repeats one note;
  - the `sleeper` speaker types in lowercase in the good green, a new `--sleeper` token at `#7dffb2` (the colour
    `--firewall` already uses), with a soft sine on a major scale;
  - a choice with `timeoutAiSec === null` draws no bar;
  - the `RECEIVER CLOSED` line's `tone 'resident'` is amber.
- **MIND strip:**
  - WARDEN.sys is an amber-edged ship block in rack A, its health `?` until scanned;
  - MOTH.sys is grey `inactive`; its rack breathes (opacity 0.96 ↔ 1 at 0.2 Hz, off under reduced motion) and
    `heartbeat` plays at `SLEEPER_BREATH_GAIN` while rack A is on screen;
  - leftovers and the note are grey, with a `?` until scanned;
  - a locked driver shows an amber chain glyph and `LOCKED BY WARDEN` in its DetailPanel row;
  - a lock telegraph reuses `HollowPainter`'s verb reticle in amber (class `lock-aim`).
- **SHIP side:** the THRUST CTRL pip's `OVERRIDDEN` state is drawn in amber, not the warning red: it is a mind, not a
  fault.
- **Stamps** (`Stamp.ts` on the new events): `RESIDENT DELETED`, `RESIDENT CURED`, `THE SHIP'S OWN AI IS AWAKE · RACK A`,
  `SIGNAL · n/3`. The surprise's wake adds `glitchBurst(0.3, 400)`.
- **DESK:**
  - the SHIP CARD's RESIDENT row (`desk.ts CardRow` key `'resident'`, already reserved);
  - after the ship, the record's words;
  - the chart's `▓░` glyph on ships with collectible fragments once the run holds one (R18).
- **PACKET** (`TransmitScreen.ts`): the deck's headline and a skill card drawn like a `.skl` chip, `AUTODROP.skl v1 ·
  FROM THE RESIDENT THAT LEFT`.
- **LANDING REPORT** (`landing-report.ts` model, `LandingReport.ts`): MOTH's cycles row in 01's report-slot order (after
  03's cycles line); WARDEN's goodnight in 05's story-line slot; locked pods among the PARKED rows.
- **Audio** (`audio.ts`): `residentBlip`, `sleeperVoice` and `mothLullaby` (four sine notes on the ambient bus, at the
  wake).
- **Phone:** the choice buttons wrap in the TERMINAL sheet. The DetailPanel rows fit at 360 px.

### 2.12 Debug hooks (`debug.ts`; the lead owns the file, the bodies are in the track modules)

- `__ap.resident()`: `{ def, corrupted, sleeper, left, met, signals }`.
- `__ap.resident.place(kind, { shown?, name?, fragments? })`: writes `run.map.arm[slot].reserved.resident` for the
  current slot and restarts the ship from its boot (debug builds only), so any arm ship can host any kind.
- WARDEN: `__ap.resident.wake()`, `.lock(pod?)`, `.deal()`, `.angry()`.
- KIN: `__ap.sleeper.wake()`, `__ap.sleeper.job('drops' | 'wall' | 'mend')`, `__ap.signals()`.

---

## 3. The words' and the screens' owners in one table

| Surface | Model | Paint | Words |
|---|---|---|---|
| TERMINAL lines | WARDEN, KIN (`say`) | FACE (`MindTerminal.ts`) | `warden-text.ts`, `kin-text.ts` |
| COMMS (CONTROL) | WARDEN | as is | `warden-text.ts` |
| Strip | WARDEN (`resident-rules.ts`) | as is | `warden-text.ts` |
| THRUST CTRL pip | WARDEN (`flight-hud.ts` pip block) | FACE (css) | `warden-text.ts` |
| MIND blocks, DetailPanel | FACE (`resident-hud.ts`) | FACE | `resident-text.ts` (before a SCAN), `warden-text.ts`, `kin-text.ts` (after) |
| SHIP CARD, chart | FACE (`desk.ts` rows) | FACE | `resident-ui-text.ts` |
| PACKET deck | KIN (`draft.ts`) | FACE (`TransmitScreen.ts`) | `kin-text.ts` |
| LANDING REPORT | FACE (`landing-report.ts`) | FACE | `resident-ui-text.ts`, `warden-text.ts` (goodnight) |

---

## 4. Extensibility

| Later need | What slice 5 leaves | Change then |
|---|---|---|
| **Slice 7, MERGE's restored drivers** | `LANDING_CONTROLLER_ORDER` keeps `merge` over `resident`; the final ship has no resident, so the two never meet. `AutodropOverride` now carries `version`, `source` and `armed`, which MERGE's resolver needs as well | none |
| **Slice 7, endings and the epilogue** | `run.residents.met` holds each resident's name, ship, fate and MOTH's job. `MOTH still sings to the RIVERSIDE nursery` needs the woken sleeper's slot and the colony its ship founded (the trail stop's `colony`, `types/lineage.ts`) | the epilogue reads them |
| **Slice 7, `047.log`'s notable events** | the three new kinds, ranked (R27) | none |
| **Slice 7, STAY** | the sleeper "is the model for STAY": `SleeperState` is per ship and never carried | STAY's own state |
| **Slice 7, CONTACT** | `run.residents.signals` and `SIGNALS_FOR_CONTACT`; `FinaleChoice`'s `[4] ??? COLLECT 3 SIGNALS · you have n` reads the count | the signal `?` event's 2 fragments, the old-colony event and the `??? · NO TRANSPONDER` card (R18) |
| **Slice 7, a next-run trace from a woken resident** | the archive's notable events carry it | a trace kind |
| **Slice 6, SURVEY** | the leftover skill card picks any open branch through `grantAllowed`, so SURVEY joins it once `built > 0` | none |
| **Slice 6, the sleeper's lesson** (03 §6: `SURVEY.skl v2 · from the sleeper`) | the gift is one call in `resident-sleeper.ts` | slice 6 decides whether a woken MOTH gives SURVEY via `grantSkill(…, 'gift')` instead of the cycles |
| **A resident that fights for the helm** (04: `attitude.ts`'s seam) | untouched | a later slice |
| **Mid-ship save** | every machine is in `state.resident` and saved with the slices | the payload kind |

---

## 5. Hot shared files and how per-track blocks avoid conflicts

| File | Owner after the FOUNDATION | Others |
|---|---|---|
| `types/resident.ts`, `types/segment.ts`, `types/landing.ts`, `types/lineage.ts`, `state/schema.ts`, `state/initial.ts` | lead | ask by message; R1's rule for any new saved field |
| `save-codec.ts`, `save-shape.ts`, `save/shape-pin.test.ts`, `save/codec.test.ts`, the fixtures | lead | none |
| `tuning.ts` | lead | each track edits values in its own banner block only (`5 WARDEN`, `5 KIN`, `5 FACE`) |
| `data/residents.ts` | lead | `RESIDENT_BUILT`: WARDEN edits the `corrupted` line, KIN the `left` and `sleeping` lines (one key per line) |
| `systems/residents.ts`, `data/resident-text.ts` | lead | none: the dispatcher calls the kinds' functions with final signatures |
| `capabilities.ts`, `landing-rules.ts`, `hollow-deal.ts`, `say.ts`, `tool-targets.ts`, `actions.ts`, `carry.ts`, `transmit.ts`, `map-boot.ts`, `run.ts`, `lineage.ts`, `meta.ts`, `memory.ts`, `ships.ts`, `selectors.ts`, `autodrop.ts`, `main.ts` | lead | none: the FOUNDATION's seams cover every track need listed in §2.4 |
| `data/script.ts` | lead | the strip's lines live in `resident-rules.ts` (WARDEN); the boot kind's text in `resident-text.ts` |
| `events.ts`, `audio-cues.ts` | lead | FACE may change the cue on a resident event's line |
| `debug.ts` | lead | the hook bodies are in the track modules |
| `ghost-thrust.ts`, `ghost-text.ts`, `flight-hud.ts` (the THRUST CTRL pip block only) | WARDEN | FACE asks for any pip markup |
| `draft.ts`, `data/upgrades.ts` | KIN | FACE paints `DraftCard.leftover`; it never edits the deal |
| `desk.ts`, `landing-report.ts`, `map-text.ts` (the RESIDENT row only), every component and css below | FACE | none |
| `tests/unit/residents/foundation.test.ts` | lead | one `built` check per line: WARDEN edits `built: corrupted`, KIN `built: left` and `built: sleeping` |
| `tests/unit/support/words.test.ts` | lead | each track adds its pools in its own block |
| e2e scenarios | lead, at the batch end | |

**WARDEN and KIN both act in rack A and the TERMINAL.** The split:
- the dispatcher in `residents.ts` sends each segment type to one module (`resident` to WARDEN; `sleeper`,
  `sleep-lock`, `note` and `leftover` to KIN);
- a ship holds one resident (02), so the two never run on the same ship;
- the one place they meet is R23's choice rule. The FOUNDATION writes it into `say.ts` as `openChoiceEntry` plus
  `withdrawChoice`, and KIN calls it.

---

## 6. Work breakdown

### 6.1 FOUNDATION (one agent, first, sequential; about a day)

0. **Dump the v4 fixtures** before anything changes, with a one-off script that is then deleted (as in 4cde), to
   `tests/unit/save/fixtures/`:
   - `run-save-v4-ship-done-desk3.json`: the worked route, desk 3;
   - `run-save-v4-beam-cormorant.json`: the BEAM into CORMORANT on seed 7, a departed resident's ship.
1. **Types and state:** §2.2, `createResidentState`, `createRunState().residents`, the five segment types,
   `lockedBy`, the speakers and the nullable timeout.
2. **Tuning:** §2.6, in three banner blocks separated so that no two tracks' hunks touch.
3. **Data and words:**
   - `data/residents.ts` (`RESIDENT_BUILT` all false; `residentRackA` implemented for all three kinds, with the
     leftovers' cards set to a placeholder that KIN's boot roll overwrites);
   - `data/resident-text.ts`;
   - `ShipDef.resident` in `shipDefOf`;
   - `RACK_A`'s free asserted ≥ `RESIDENT_RACK_A_MIN_FREE`.
4. **Seams, implemented and behaviour-neutral:** every item of §2.4, the events and cues (§2.5), the debug hooks (§2.12)
   calling track functions, and `RESIDENT_RULES = []` spread in `script.ts`.
5. **Stubs with final signatures,** each file opening with a `// Slice 5: Track X owns this file` banner:
   - `resident-corrupted.ts`, `state/resident-selectors.ts`, `warden-text.ts`, `resident-rules.ts`;
   - `resident-left.ts`, `resident-sleeper.ts`, `kin-text.ts`;
   - `resident-hud.ts`, `resident-ui-text.ts`, `resident.css`.

   **The rule** (from 4a, kept in 4cde): stubs on a hot path return the neutral answer and never throw:
   - `residentGhostSpec` → null; `residentDealOnThisShip` → false;
   - the resolver → null; the tool rules → `TOOL_REFUSAL.notAFile`;
   - the record's fates → `'ignored'`, `'left'`, `'slept'`;
   - the HUD models → empty.

   Entry points that change state throw through `not-built.ts notBuilt(what, track)`: `wakeResidentNow`, `lockNow`,
   `offerResidentDealNow`, `wakeSleeperNow`, `pickSleeperJob`, `rollLeftoverCards`.
6. **The save:** `RUN_SAVE_VERSION 5`, `RUN_SAVE_MIGRATIONS[4]`, the codec checks, the shape pin under v5.
   `residents/foundation.test` gains the migration of both fixtures. The CORMORANT BEAM resumes into a ship whose rack A
   matches a fresh boot.
7. **Gate:** `npm run typecheck`, and the whole unit tier green with **no behaviour change**. `RESIDENT_BUILT` stays all
   false.
8. **The independent contract review** reads §2.2's types, §2.4's seams and the stubs' signatures against §2.7–§2.9, and
   writes `docs/phase3/impl/slice-5-foundation-review.md`. Its majors are fixed before the tracks branch.

### 6.2 Three parallel tracks (worktrees `warden-5`, `kin-5`, `face-5`; disjoint files)

**Track WARDEN (corrupted residents: flight, MIND and the landing's locks; parts a, b, e)**
- **Owns:**
  - new: `src/systems/resident-corrupted.ts`, `src/state/resident-selectors.ts`, `src/data/warden-text.ts`,
    `src/data/resident-rules.ts`;
  - `src/systems/ghost-thrust.ts`, `src/data/ghost-text.ts`, and the THRUST CTRL pip block of `src/systems/flight-hud.ts`;
  - its rows only: `RESIDENT_BUILT.corrupted`, `tuning.ts`'s 5 WARDEN block, and `built: corrupted` in
    `residents/foundation.test`.
- **Builds:** §2.7 whole, the surprise's grace and stamp event, CONTROL's lines, the strip's three lines.
- **Tests:** §7.1 WARDEN; updates to `map/ghost-noswap` (the `ghostBy` guard, if a word moves) and
  `threat/arrival-story` (HOLLOW's deal waits on a resident's ship).
- **Flips `corrupted` last,** then runs the tier.

**Track KIN (residents that left and the sleeper: story, salvage, the controller; parts c, d)**
- **Owns:**
  - new: `src/systems/resident-left.ts`, `src/systems/resident-sleeper.ts`, `src/data/kin-text.ts`;
  - `src/systems/draft.ts` (the leftover deck), `src/data/upgrades.ts` (`DraftCard.leftover`);
  - its rows only: `RESIDENT_BUILT.left` and `.sleeping`, `tuning.ts`'s 5 KIN block, and `built: left` and `built:
    sleeping` in `residents/foundation.test`.
- **Builds:** §2.8 and §2.9 whole: the cards' boot roll, the signals, the wake on `'op-done'`, the offer through R23's
  rule, the three jobs, the `'resident'` resolver (registered in `mountResidentSleeper`), and the gift.
- **Tests:** §7.1 KIN; R22's fixture updates (listed in its Deviations); `skills/packet` if the deck moves a card's
  check.
- **Flips `sleeping` first and `left` last** (`left` moves the most fixtures).

**Track FACE (UI and audio, every surface)**
- **Owns:**
  - new: `src/systems/resident-hud.ts`, `src/data/resident-ui-text.ts`, `src/styles/resident.css`;
  - `src/styles/tokens.css` (`--resident`);
  - `src/components/memory-view/MindTerminal.ts`, `SegmentBlock.ts`, `DetailPanel.ts`, `HollowPainter.ts` (the lock
    reticle), `src/components/hud/Stamp.ts` (the resident stamps' wiring);
  - `src/components/run/LandingReport.ts` and `src/systems/landing-report.ts`'s resident rows,
    `src/components/run/TransmitScreen.ts` (the deck);
  - `src/components/desk/ShipCard.ts`, `StarChart.ts`, `chart-draw.ts` (the glyph), `src/systems/desk.ts`'s `'resident'`
    row, `src/data/map-text.ts`'s RESIDENT words;
  - `src/systems/audio.ts` (the three cues), and the resident events' lines in `audio-cues.ts` (by the 4cde rule);
  - `index.html` only if a container is needed (the TERMINAL and the PACKET already have theirs);
  - its rows only: `tuning.ts`'s 5 FACE block.
- **Builds:** §2.11 whole, painting **state** through `resident-hud.ts`'s models. Its suites set the state directly
  (`__ap.resident.place` or a fixture), so FACE never waits on WARDEN or KIN.
- **Tests:** §7.1 FACE; `support/words` for its pools.

**Order dependencies:**
- The FOUNDATION and its review come before everything.
- The three tracks are independent. WARDEN and KIN test on run 1's arm (`run1Map(7)`) with `RESIDENT_BUILT` raised in
  their own suites through a test helper, `withResidentsBuilt(kinds, fn)` in `tests/unit/support/residents.ts`, which the
  FOUNDATION writes. FACE tests models on hand-built states.

### 6.3 Merge order

1. **WARDEN** first: it touches the most hot behaviour (capabilities' readers, the ghost alarm, the landing's
   refusals), and the fewest fixtures (no route ship has a corrupted resident).
2. **KIN** next: the deck and R22's fixture moves land on top of WARDEN's tier.
3. **FACE** last: it rebases onto both and paints what they now produce. The e2e follows.

Then: the full review, the fix pass (which deletes `not-built.ts` again), the unit tier, one e2e run (§7.4), AGENTS.md
("What's built": residents; "Next logical steps": slice 6) and the OPEN-DECISIONS "Slice 5" list (R3, R4, R10, R11, R12,
R13 and R18 as [FRAN], with numbers from the sweeps).

---

## 7. Tests

**Budget:** the tier is 158 s quiet against a 265 s budget (cap 300). The new suites below add about 25 s of CPU, about
+8 s of wall on 4 workers. Long flights fly once (`flyOnce`). Sweeps are BALANCE_ONLY.

### 7.1 New unit suites (`tests/unit/residents/`)

| Suite | Track | What it covers | Time |
|---|---|---|---|
| `foundation.test.ts` | lead | v4 → v5 migration of both fixtures; codec refusals (an open lock, an offered deal, an offering sleeper, a `met` slot off the route, too many signals); `ShipDef.resident` from the reservations; the rack-A files per kind under `withResidentsBuilt`, with rack A's free ≥ 4 left; `receiverClosed` false; the ghost composite's choice and `ghostBy`; `POD LOCKED`, a locked driver "can ever launch", the queue skipping it; `notableEvents`' order; one `built` check per line | < 1 s |
| `corrupted-model.test.ts` | WARDEN | pure: `residentGhostSpec` across awake, deleting, angry, quiet, deleted, cured and landing; push ratio < the arm's failing (R3); the lock clock (30 / 40 / 3; 20 / 45 for a surprise; frozen at TACTICAL; the cap ceil(pods ÷ 4) ≤ 3; no telegraph without a thread); the lock target; the deal's file by `rmTargets`; cure 12 charge in 3.6 s; DELETE 6.0 s | < 1 s |
| `corrupted-flow.test.ts` | WARDEN | harness on run 1's GANNET (`run1Map(7)`, `flyOnce` to the coast): wake and the first lines; CONTROL; the first burst's alarm and pip; SWAP doesn't stop it; no ENGINE FAULT SKIP refusal; a lock blocked by SCAN; a landed lock → `POD LOCKED` → PARKED at END LANDING; DELETE with the 4 s bursts, locks released, the stamp event; REPAIR cure; DEAL accept, refuse and timeout; HOLLOW's deal waits on that ship (R8); PROVIDENCE's surprise (20 s, its health shown, no SCAN IT FIRST); a boarding ship (`__ap.resident.place` on a depth-4 forced boarding) waits for `hollowFirstFightDecided` | ~10 s |
| `left.test.ts` | KIN | HERON (`run1Map(7)`, slot 4): the note and three leftovers in rack A; SCAN the note → its lines, `signals` +1, `'signal-found'`, once only; SCAN a leftover → its card's name; the deck at the PACKET (pool, pool, skill; an eaten leftover and an unusable card each deal a normal card; the skill card falls back to `+2 CYCLES`, and to a normal card into a final ship); the skill card's grant installs at the next boot with `from the resident that left HERON`; refusals | ~3 s |
| `sleeper.test.ts` | KIN | CURLEW: hidden as an inactive file; SCAN reveals; DELETE's hint; wake by rm and by MOVE; the offer with no timer; HOLD A WALL absent on a calm ship; R23 (a DEAL withdraws and re-offers it); drops: the `'resident'` controller over AUTODROP (AUTODROP shadowed, no thread), every pod launched with only the [F]-free SKIPs; wall: a bite held by MOTH.wall; mend: a hurt driver to 100 under a bite, cured; the gift at `endShip`; `sleeper-woken` in the notable events; never infected | ~6 s |
| `ui-models.test.ts` | FACE | the card rows (none, faulty, unknown, was faulty, left, friendly); the glyph rule (R18); the report rows (gift, goodnight per R24, locked parked); the terminal speakers' classes and the no-timer choice; the lock reticle model; the stamps; every word at its worst case ≤ 70 | < 1 s |

### 7.2 BALANCE_ONLY sweeps (information until slice 8)

- `residents/corrupted-sweep.test.ts` (`// BALANCE_ONLY: a corrupted resident ignored, deleted, cured or paid, on
  CAPTURE ships × seeds × layers 4–7`): FUEL at the lock, ▼ drift, pods locked and parked, landed %, against the same
  ship without a resident. It reports R3's ratio against an unfixed arm VESPER's fuel cost (04's two thirds).
- `residents/sleeper-sweep.test.ts` (`// BALANCE_ONLY: each sleeper job against none, on hurt and HOLLOW ships`): points
  and pods for drops, wall and mend. It feeds R11 and R13's numbers into OPEN-DECISIONS.

### 7.3 Changed suites

- `save/shape-pin`, `save/codec`: v5.
- `support/words`: every new pool.
- `map/ghost-noswap`: the `ghostBy` guard (no new assertion moves on the classic ships).
- `threat/arrival-story`: unchanged unless a resident is placed.
- R22's movers (KIN lists them): the suites on `run1Map()`'s default seed 1 or on seeds 2, 4, 5 or 7 that check
  CORMORANT's PACKET cards or rack A. Expected: `map/run1-route`, `map/delivery-packet`, `map/desk-flow`,
  `skills/packet`.
- `threat/beam-seeds`: must stay byte-identical (the resident files are in rack A, the seeds in the receiver). If it
  moves, that is a bug.

### 7.4 e2e (lead, once at the batch end)

- **New `tests/e2e/scenarios/residents.mjs`** (seed 7, about 3 minutes), by `__ap.slot`:
  1. GANNET (9): the amber `RECEIVER CLOSED` line; CONTROL's line in COMMS; the first burst's alarm and the strip's
     line; a click on the THRUST CTRL pip selects `WARDEN.sys` in the MIND; a lock telegraph and a SCAN on the driver →
     `BLOCKED`; SCAN WARDEN → 40%; DELETE → the confirm → `RESIDENT DELETED`.
  2. GANNET again: REPAIR → its thank-you line and the stamp; then `__ap.resident.deal()` → ACCEPT by key Y → the named
     file gone.
  3. PROVIDENCE (16): the amber line, no CONTROL line, and at 20 s the stamp `THE SHIP'S OWN AI IS AWAKE · RACK A`.
  4. CURLEW (7): a grey `BARNABY.sys · inactive`; SCAN → `Not inactive. Asleep.`; DELETE → the hint; DELETE
     `sleep.lock` → three green lines and two buttons (no HOLD A WALL on a calm ship); MEND DRIVERS → a hurt driver
     climbs; the LANDING REPORT row `+4 TRAINING CYCLES · taught by BARNABY`.
  5. HERON (4): SCAN farewell.txt → `SIGNAL · 1/3`; SCAN a leftover → its card's name; at the PACKET, `LEFT BEHIND BY
     HELM` and three cards, the third a `.skl`.
- **`playthrough.mjs`** (seed 7's worked route meets only CORMORANT's LOOKOUT):
  - CORMORANT's boot check expects the amber `RECEIVER CLOSED` line after the sleep line;
  - its MIND checks allow the note and the three leftovers in rack A; the scripted kid needs no new action, because
    nothing on the strip names them (R21);
  - the PACKET to LAST LIGHT shows `LEFT BEHIND BY LOOKOUT` and three cards. The kid's [1] picks the first pool card as
    before, and the LAST LIGHT expectations that read the pick (charge, files) take its id from the page instead of a
    constant;
  - the desk's card checks accept the new RESIDENT row.
- **`run-flow.mjs`** (seed 4: CORMORANT is the gone-resident `?` ship, PURSER): the same boot and PACKET allowances.
- **`map-desk.mjs`:** the RESIDENT row on every card it already opens. On its seed-4 arm the lead adds one `reported
  faulty` card (GANNET, slot 9) and one `unknown` card, through `__ap.course` to a desk whose reach includes them.
- **`phone.mjs`:** the sleeper's two buttons in the TERMINAL sheet at 360 px (CURLEW by `__ap.slot(7)`).
- **`run2.mjs`, `resume.mjs`:** no new checks. Run 2's route may meet residents, so a lead run confirms no FAIL.

---

## 8. Out of scope (deferred)

- **Slice 6:** the sleeper's SURVEY lesson (03 §6) and SURVEY in the leftover deck (automatic once built).
- **Slice 7:**
  - the `?` ships' `??? · NO TRANSPONDER` card, the old-colony and signal events with the signal ship's 2 fragments
    (R18), and CONTACT's `[4]` with the count;
  - the sleeper in the epilogue, any next-run trace from a resident, and `047.log` reading the new notable events;
  - STAY as "becoming what a resident is".
- **Slice 8:**
  - the bypass animation (R19);
  - the resident's numbers (R3's amp, the lock interval, the cure's price), the sleeper's gift (R12), and 02's resident
    shares and the surprise share;
  - the classic world's retirement (OPEN-DECISIONS 12).
- **Later:** a resident that fights for the helm (`attitude.ts`'s seam); residents carried between runs beyond 3c's
  top-up; a resident on a final ship (never, by 02).

### Critical files for implementation

- `src/types/resident.ts` (new), `src/types/segment.ts`, `src/state/schema.ts`, `src/state/initial.ts`
- `src/systems/save-codec.ts` (v5), `src/data/tuning.ts`
- `src/systems/capabilities.ts` (`ghostBy`), `src/systems/orbit-sim.ts` (read only: the scheduler is unchanged)
- `src/systems/landing-rules.ts` (`POD LOCKED`), `src/systems/autodrop.ts` (`AutodropOverride.armed`),
  `src/systems/landing-controller.ts`
- `src/systems/hollow-deal.ts` (one deal per ship), `src/state/threat-selectors.ts` (`hollowFirstFightDecided`, as
  built)
- `src/data/memory.ts` (rack A), `src/data/ships.ts` (`ShipDef.resident`), `src/systems/map-generator.ts` (read only)
- `src/systems/draft.ts`, `src/systems/skill-tree.ts` (`grantSkill`, `grantCycles`, as built)
- `src/data/script.ts`, `src/systems/map-boot.ts`, `src/systems/say.ts`
