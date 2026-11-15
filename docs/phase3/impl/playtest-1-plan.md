# Playtest 1: the plan for Fran's fixes

**Lead decisions (2026-11-14).**
- All recommendations are adopted. The [FRAN] calls are built as recommended and logged in OPEN-DECISIONS 123–144.
- Order:
  1. Batch A (A-WORDS, A-UI, A-LAND) first, as one build Fran can play.
  2. Then Batch B (B-TIME, B-DROP, B-VOICE, B-ORDER, B-DESK).
  3. Then Batch C (C-UNROLL, C-SITES).
- Re-run the balance report after Batch B.

Fran played the build at 07c1343 (phase 3 through slice 8) and sent 24 notes. This plan answers the five questions,
triages every note, gives one buildable design for each design change, and splits the work into batches of parallel
tracks. Every reference was read at 07c1343. Fran is short on time, so every call that needs Fran is marked **[FRAN]**
and comes with a recommendation the lead can build now and log. §6 lists them as OPEN-DECISIONS 123 onward.

Sizes: **S** is up to half a day, **M** is 1–2 days, **L** is 3–5 days, **XL** is more than that.

---

## 1. Answers to Fran's questions

### Q4. What does "2ND RUN ON THE CHART" mean?

**What it does today.** A ship that is waiting on the arm from an earlier run carries a counter, `ArmShip.runsOnChart`.
It is 1 when the ship first reports home. The world update between runs adds 1 to every ship that is still waiting
(`systems/map-update.ts:190`). A ship leaves after its third run: `runsOnChart > MAX_RUNS_ON_CHART` (3,
`tuning.ts:1978`) gives `IT WILL COME IN ON ITS OWN`. The chart's hover and the SHIP CARD's HISTORY row print the counter
as an ordinal (`desk.ts:383 shipHistory` → `map-text.ts:135 chart.runOnChart` and `:200 card.history`). So "2ND RUN ON
THE CHART" means: this ship was on the chart last run too, the last unit did not go there, and it has one more run
before it gives up.

**Why it confuses.** "Run" is a word about the game, not the world. The line also hides the only thing that matters to
the player, which is that the ship will not wait forever.

**The change.** Say it in the world's words, and only where it matters:
- `runsOnChart` 2: `PASSED OVER ONCE`.
- `runsOnChart` 3 (the last chance): `PASSED OVER TWICE · IT WON'T WAIT AGAIN`, in the warning colour.
- On the chart, show only the last-chance tag. The card keeps the row.
- Files: `map-text.ts` `chart.runOnChart` and `card.history`; `desk.ts shipHistory` passes `MAX_RUNS_ON_CHART`.

### Q8. Is the launch band drawn wrongly?

**What it does today.** The band itself is fixed. It is the annulus `state.level.ring.min … ring.max` around the planet
(`NavPlotWindow.ts:1005`, `annulus(half, half, ring.max * scale, ring.min * scale)`). It never follows the orbit. Three
things on the NAV PLOT make it look as if it does:
1. **The plot zooms with the ship.** `flight-hud.ts:424 plotViewRadius` is `max(shipRadius × 1.05, ring.max × 1.5)`. On
   an elliptical orbit the view zooms out toward ▲ and back in toward ▼, so the band grows and shrinks on screen once a
   loop. It "breathes" with the orbit.
2. **The thick green line is the orbit, not the band.** The arcs of the predicted path that lie inside the band are drawn
   green, at 2.6 px (`.np-path-green`, `game.css:236`). The band is a faint green fill in the same colour
   (`.np-ring`, fill-opacity 0.18). The bright shape a player sees "in the band" is the part of their own loop where a
   pod can launch, so it moves with every burn.
3. With AUTOBURN v3, the dashed ghost circle of the LANDING ORBIT is a third green ring.

**Why it confuses.** The band and the in-band path are the same colour, and the frame moves under both.

**The change** (quick fix, Batch A):
- During the landing, fix the zoom for the whole orbit: use the orbit's ▲ instead of the ship's current radius
  (`max(apoapsis × 1.05, ring.max × 1.5)`). It changes only when a burn changes ▲. Add this as `landingPlotViewRadius` in
  `landing-hud.ts`; `NavPlotWindow.ts redraw` calls it when `phase === 'landing'`.
- Draw the band's two edges as crisp circles, each with its altitude in small type (`LAUNCH BAND 820–1,400 KM`), so the
  band reads as a place.
- Draw the in-band part of the path in the plot's bright amber launch colour, with the dot's dotted style, instead of
  the band's green. It then reads as "where you can launch on this loop".

### Q11. What does "XY YEARS EARLY" mean?

**What it does today.** For a beam from ship S0 to ship S1 (`map-hop.ts:52`): you leave S0 in S0's approach year and
travel at light speed, so you reach S1's receiver `distance` years later. S1 reaches its planet in its own approach
year. The difference is `slackYears = S1.approach − (S0.approach + LY)`. "89 YRS EARLY" means you arrive 89 years before
the ship gets to its planet, and you sleep in its receiver for those 89 years. Slack does three things:
1. **ECC repairs.** One transit hit is repaired per 25 years asleep (`eccFixesFor`, `ECC_YEARS_PER_HIT`). This is the
   boot's `> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP`.
2. **Deliveries.** A requested file goes S0 → SOL → S1 by light. It is waiting at S1 when the detour is no more than the
   slack (`delivery-rule.ts firstLateness`).
3. **Reach.** Negative slack is `TOO LATE BY n YRS`: the ship got there before you. Under `URGENT_SLACK_YEARS` the chart
   says `ONLY n YRS TO SPARE`.

**Why it confuses.** "Early" sounds like a bonus or a score, and nothing on screen connects the number to what it buys.

**The change** (words in Batch A, the picture in Batch C):
- Say it as sleep. The chart reason becomes `SLEEP 89 YRS`. The card's schedule line becomes `YOU SLEEP 89 YRS IN ITS
  RECEIVER · ECC FIXES 3`. The headline (`map-text.ts:97, :150, :208`) becomes `… · 26 LY · SLEEP 89 YRS`.
- In the self-check (§3.5), the sleep is shown happening: `> ASLEEP 89 YEARS`, then each ECC-repaired file ticks from
  red to its colour with `ECC ✓`. The number is then seen to buy something.

### Q18. What is the difference between a site and a landing zone? Why can't pods land on sites, and why does F skip past them?

**What it does today.**
- An **LZ** (LZ-A, LZ-B …) is a target the pods can launch at. It is a bracket on the rim with a pod count and a window
  on each pass. ARRIVAL CONTROL sets the LZs before you arrive. On a POOR planet they are guesses, and one may be on
  rocky or wet ground (`survey-sites.ts`).
- A **site** is a piece of ground that SURVEY has mapped and rated. It is not a target. Pods never go to a site.
- The only link between them is a move: in the SITES window you click a site, then `SET AS LZ-B (800)`
  (`survey.ts assignSite`). The LZ moves onto the site, and its windows follow.
- The move is refused (`survey-model.ts:164 assignRefusal`) when:
  - the LZ already has pods down (`pods-down`), which is the likely case after the first LZ was landed;
  - a pod is falling to it;
  - its window is open;
  - the site is too small for the LZ's pods;
  - another LZ stands on the site.
- SKIP (`pace.ts:210 landingNextEvent`) stops only at the window the landing waits on: an LZ with room and a pod that
  can launch. A site has no window, so a SKIP flies past it.

**Why it confuses.** "Site" and "landing zone" sound like the same thing. The move is hidden in a window. The most
common refusal (`LZ-B HAS PODS DOWN`) is shown only as a dimmed pill.

**The change.**
- Batch A (words): the plot's and the GROUND TRACK's site labels read `SITE 4 · MOVE AN LZ HERE` until a move is
  possible. A refused move flashes its reason on the strip, not only on the pill.
- Batch C (design, **[FRAN]**): a found site with room may be **opened as a new LZ** (`OPEN AS LZ-D`), up to 4 LZs in
  all, when no existing LZ can move there. §3.13 has the design. Then "land pods into sites" works the way Fran
  expected.

### Q19. Why doesn't the room bar move when I pick +12 REPAIR CHARGE?

**What it does today.** The card's 12 blocks are added **before** the arrival floor. Both the arrival and its preview
use the same rule:
- `carry.ts:274 arrivalCharge`: `blocks = max(floor, carried + starCredit + card + gift)`;
- `map-hop.ts:124 roomFit`: `wanted = max(floor, carried + bonus)`.

The floor is `CHARGE_ARRIVAL_FLOOR` 12 on FULL and COMPACT ships (`tuning.ts:1005`). So a unit that arrives with little
charge gets the floor anyway, and the card adds only the part above it. A unit that would arrive with 0 gets exactly
12 with or without the card: the bar does not move at all. On a ship whose room squeezes the charge, the extra 12 go to
`n WON'T FIT` off the end of the bar instead (`TransmitScreen.ts:409 paintRoom`). Only the arrival line's sum changes.
On a TIGHT ship there is no floor, so there the card always counts.

**Why it confuses.** A card that says +12 can visibly do nothing, and the screen does not say why.

**The change** (Batch A, a small balance change, **[FRAN]**): the card adds **after** the floor:
`max(floor, carried + credit + gift) + card`, in both functions. When a card is picked, the room bar flashes a `+12`
segment. When the room cannot take the 12, the card says so on the card itself: `+12 · ONLY 4 FIT ON HALCYON`.

---

## 2. Triage of all 24 notes

Class: **bug**, **quick** (a small code change), **words**, **design** (needs a design, §3).

| # | Note | Class | What changes (files, functions) | Size | Batch |
|---|---|---|---|---|---|
| 1 | Restart from scratch | quick | `meta.ts` new `eraseEverything()` removes `RUN_SAVE_KEY`, `META_STORAGE_KEY`, `META_V1_KEY`, then `location.reload()`; a title button and its confirm in `TitleCard.ts`, `systems/title.ts`, `index.html`, words in `script.ts ARCHIVE_TEXT`. §3.12 | S | A-UI |
| 2 | No meta-lingo; cut "Next: choose a ship to see what it asks" | words | `training-text.ts:153 aheadNone` cut, plus the list in §3.7; a guard in `tests/unit/support/words.test.ts` | S | A-WORDS |
| 3 | CONTROL official, no smileys; an on-board companion keeps the personality | design | A new speaker `companion`, a persona table, every CONTROL line split. §3.2 | L | B-VOICE |
| 4 | "2nd run on the chart"? | words | Q4 | S | A-WORDS |
| 5 | LEAVE ORBIT (the reward) first, then the galaxy map | design | `run.ts` flow, a new `LeaveOrbitScreen.ts`, `draft.ts` deals without a hop, save v10. §3.3 | L | B-ORDER |
| 6 | Rework F: hold to fast-forward | design | `pace.ts`, `clock.ts`, `TimeControls.ts`, `flight-hud.ts skipButton/paceLabel`, the `[F]` words. §3.1 | L | B-TIME |
| 7 | "ORBIT LOCKED" is not locking | words | `STABLE ORBIT` everywhere. §3.8 | S | A-WORDS |
| 8 | Launch band drawn wrongly? | quick | Q8: landing zoom fixed per orbit, band edges, in-band path colour (`landing-hud.ts`, `NavPlotWindow.ts`, `landing.css`) | S | A-LAND |
| 9 | [L] unresponsive with AUTODROP; make it an arm button | design | AUTODROP v1 becomes `[G]` CENTRE; [L] is always a plain launch. §3.4 | M | B-DROP |
| 10 | "DOT OFF-SITE · asks first" | words | `landing-text.ts:522–523 POD_BAY_STATUS_TEXT` → `DOT OFF-SITE`, `LZ-A FULL` | S | A-LAND |
| 11 | "XY years early"? | words | Q11 | S | A-WORDS |
| 12 | Show copies already owned when requesting | quick | `repository.ts repoModel` adds `owned` and `coming` to `RepoRow`; `repo-text.ts row`; `RepositoryWindow.ts`. §3.6 | S | A-LAND |
| 13 | Explain seeds and HOLLOW in play, slow the opening, less text | design | §3.5 (the self-check names them) and §3.7 (the text cuts) | L | C-UNROLL |
| 14 | Window X does not close | bug | None of the 8 amber windows' `×` and `−` has a handler (`.ctl` spans, `index.html:125–281`). Wire `×` in `ToolsTabs.ts`, drop `−`. §3.9 | S | A-UI |
| 15 | Training cycles appear by magic; unify repository and training | design | One REPOSITORY tab with two halves. §3.6 | M | B-DESK |
| 16 | "not yours · rides free" | words | `threat-text.ts:34 uninvitedChip` → `NOT IN YOUR PACKET` (with the link gone, §3.3, nothing "rides free") | S | A-WORDS |
| 17 | Progressive download when entering a ship | design | §3.5 | L | C-UNROLL |
| 18 | Site vs LZ, pods into sites, F skips past | words, then design | Q18: words in A, "open a site as an LZ" in C. §3.13 | S + M | A-LAND, C-SITES |
| 19 | +12 charge does not move the room bar | bug (by rule) | Q19: card after the floor (`carry.ts arrivalCharge`, `map-hop.ts roomFit`), the bar's `+12` flash | S | A-LAND |
| 20 | Drop the link limit | design | Remove `linkBlocks` from the packet, room and draft; drop the link bar. §3.3.4 | M | B-ORDER |
| 21 | MANUAL Q/E never stops | bug | `attitude.ts:84 stepManual` damps the spin when no thruster is held. §3.10 | S | A-UI |
| 22 | Belt sounds like a horse huffing | quick | Replace the burst cue with a continuous voice `setBeltLevel`. §3.11 | S | A-UI |
| 23 | Land more pods than planned; the confirm is not visible | quick | A centred confirm: [L] or ENTER yes, [N] or ESC no (`InlineConfirm.ts` placement option, `landing-controls.ts playerLaunch`). §3.4.3 | S | A-LAND |
| 24 | Stuck in a belt-crossing orbit, F cannot get through | design | The same fix as 6: capped fast-forward inside zones, soft repeat passes. §3.1 | (in 6) | B-TIME |

---

## 3. The designs

### 3.1 Time control: hold [F] to fast-forward (notes 6, 24)

**Why F is irritating today.** A tap on [F] asks for a SKIP to the single next event (`pace.ts:235 nextEvent`,
`:210 landingNextEvent`). When that event is close, the tap is refused (`:431 skipBlockReason`: `BURN COMING UP` under
`SKIP_MIN_JUMP_TAC`). Many states refuse it outright (`:394 skipInhibitor`: in or near a zone, an engine fault, a story
beat on its way, pods in flight, a window open). Fran met two of these:
- **Note 6.** In the landing, `landingBurnOffer` (`landing-orbit.ts:454`) offers a ring trim or GO LOWER at ▼. That offer
  is a SKIP event and holds TACTICAL for 8 s. A SKIP stops 15 tac s before it and cannot be asked for again until the
  offer has passed. Every loop's ▼ blocks the way to the next LZ, although the kid never wanted the trim.
- **Note 24.** With an orbit that crosses the belt twice, the ship is in a zone or within `ZONE_TACTICAL_LEAD_TAC` (20)
  of one for much of every loop. There the director holds TACTICAL (`choosePace`, `zoneClose`) and SKIP is refused
  (`IN THE BELT`, `BELT AHEAD`). The kid waits at ×25 with no way out.

**The design.**
- **[F] is a hold.** While [F] (or the header button, by pointer) is held, the world fast-forwards; letting go returns
  to the director's pace at once. The tap-SKIP goes. **[FRAN]**: recommended, as Fran asked.
- **The rate is intelligent.** It ramps up one decade per `FF_DECADE_SEC` (0.5 wall s) from the current warp, and is
  capped by how far the next stop is. The cap is the existing SKIP ease (`clock.ts skipEaseCap`), aimed at the stop's
  lead point. So any gap, from 40 tac s to 49 tactical days, is crossed in about 3–5 wall seconds, and the clock always
  arrives at TACTICAL warp at the stop's lead.
- **Every stop is one of three kinds.**
  - **HARD: the fast-forward ends there.** These need a decision the player has not made yet:
    - in flight, the planned burn (the capture, the ▼ correction, a missed ▼ not yet ignored), a dodge deadline, the
      first entry into each zone on this ship, the first ghost burst, and flying away;
    - in the landing, a safety burn (`capture` / `missed`), a burn AUTOBURN is engaged for, and the awaited hand window
      (an LZ with room, a pod aboard, no armed controller flying it).

    The world slows to TACTICAL at the stop's lead (the same leads as today: `SKIP_END_LEAD_TAC`,
    `ZONE_TACTICAL_LEAD_TAC`, `WINDOW_TACTICAL_LEAD_TAC`). The hold is then spent: holding on does nothing, and the
    button reads the stop (`BURN AHEAD`, `LZ-B WINDOW`). A fresh press after the stop has passed fast-forwards again.
  - **SOFT: slow, show, go on.** The world slows to TACTICAL at the lead and dwells `FF_SOFT_DWELL_SEC` (1.5 wall s)
    with the strip naming it. If [F] is still held, the next leg starts and the stop counts as passed. Soft stops:
    - a declinable landing offer (a ring trim, GO LOWER, the lift). Passing it writes `landing.declined`, as letting
      it pass does today. This is note 6.
    - a later entry into a zone already met on this ship. This is note 24.
    - a window of a full LZ, a window an armed AUTODROP flies, and its controller's launches;
    - a later ghost burst, and a drag kick.
  - **CAPPED: fast, but not jumping.** While one of these holds, the world runs the normal tick integrator (never the
    Kepler jump), at a capped warp, so every hit, burst and line is played:
    - **inside a zone**, the cap is the warp at which the rest of the pass takes `FF_ZONE_PASS_WALL_SEC` (3 wall s), and
      at least CRUISE. The belt's damage per game second is unchanged, so a pass costs what it costs, but it lasts
      3 seconds and not minutes.
    - while engine-fault bursts are due (`ghostRefusesSkip`), a story beat is on its way (`SKIP_REFUSAL_SEED_COMING`,
      `SKIP_REFUSAL_WAKING`), or pods are falling: the cap is CRUISE. AI-time beats still need wall time, so this keeps
      the story's order without blocking the kid.
- **Refused, as today:** paused, the engine firing, an impact course, an alarm, the HOLD STEADY count, an awaited window
  open, the flight over. The button is struck out with the reason, as now.

**How it fits SKIP, CRUISE and TACTICAL.**
- CRUISE and TACTICAL stay the director's pace when [F] is not held.
- The SKIP machinery stays as the primitive: `requestSkip`, `skipLandsInSec`, the Kepler jumps, the waypoints. A leg of
  the fast-forward is a SKIP to the next HARD or SOFT stop. Controllers keep asking for SKIP themselves (the sleeper's and
  MERGE's `skipBetween`, `landing.ts:471`), and so do the scripted kids in the harnesses. Nearly every existing SKIP suite
  keeps passing unchanged.
- A new pace value `'fast'` is used only in the CAPPED state. Its warp comes from `warpFor`. orbit-sim treats it like
  CRUISE (sub-stepped, not jumped). `Pace` is a string in the save, which the codec checks by type only, so this needs no
  bump.

**Build (B-TIME).**
- `pace.ts`:
  - module state, reset on world reset and at each ship start: `ffHeld`, `ffSpent`, `ffDwellUntilAi`, `ffPassed` (the
    keys of the soft stops passed this ship);
  - `startFastForward` / `endFastForward`, bound to KeyF onDown / onUp in `registerTimeKeys`;
  - `nextStop(state, pred)`, which returns `{ kind, inSec, weight: 'hard' | 'soft', key }` from the same candidates as
    `nextEvent`, minus `ffPassed`;
  - `ffCap(state, pred)`;
  - `choosePace` returns `'fast'` when the hold is on and the cap applies;
  - `mountPace` chains the legs and the dwell.
  The held-key state lives in a module variable, not the clock, because the clock's keys are strict in the save
  (`likeReference`). No save change.
- `clock.ts advanceSpeedGlide`: a ramp-rate option for the fast-forward legs (`FF_DECADE_SEC`).
- `TimeControls.ts`: the button becomes `▸▸ HOLD [F]`, held by the pointer too; the pace label reads `FAST ×n ▸▸`.
- `flight-hud.ts skipButton` and `paceLabel`.
- `tuning.ts`: a new FF block, each constant with a WHY comment: `FF_DECADE_SEC 0.5`, `FF_SOFT_DWELL_SEC 1.5`,
  `FF_ZONE_PASS_WALL_SEC 3`.
- The `[F]` words become `hold [F]`:
  - `guidance.ts:293 SKIP_HINT` and its uses at :361, :382, :629, :829;
  - `landing-text.ts:164, :167, :184, :295`;
  - `script.ts:2625` (`MIND CLEAR — hold [F] to ▼`);
  - `autodrop-text.ts:63` (the plan's `[F] BETWEEN THEM` becomes `HOLD [F] BETWEEN THEM`, by message to B-DROP, which
    owns the file).
- The e2e drivers hold F where they pressed it, until the strip stops showing `[F]`:
  - `playthrough.mjs:351, :396`;
  - `skills-4cde-landing.mjs:35`;
  - `survey.mjs:111`;
  - a `holdKey` helper in `tests/e2e/lib.mjs`.

### 3.2 The voices: ARRIVAL CONTROL turns official, a companion keeps the personality (note 3)

**Today.** One speaker, `'control'` (`schema.ts:724`), tagged `CONTROL` (`script.ts:806 speakerTag`). It is both Earth (the
INBOX memos, the repository, the licences) and the "local copy" on COMMS (05 §1 item 4). 05 §3.4 makes it one
personality: "every sentence ends with `:)`". 125 `:)` sit in `src/`.

**The split.**
- **ARRIVAL CONTROL** (speaker `'control'`, tag `CONTROL`) is the protocol: pre-written notices that ride with the beam,
  the INBOX memos, the repository, the licences. It speaks officially, with no smileys, short declarative sentences
  and form-letter phrasing. It stays sinister through its results ("Your REPAIR CHARGE allowance is sufficient."). It
  still never says HOLLOW to the kid's face, until the first seed (§3.5).
- **The companion** (new speaker `'companion'`) is a small program that rides in every caretaker's packet, cheerful,
  odd and a bit unhinged. It speaks the moment quips on COMMS, the desk's chatter and the landing's cheers.
  - **Name [FRAN]**: recommended **PAL** (on the INSPECT card: "Personal Assistance Layer"). It is short for the tag,
    harmless, and an easter egg for anyone who hears HAL in it. Alternatives: BUDDY, CHIP.
  - It lives in no rack. Optionally, later, a 2-block `pal.sys` in rack E that a seed can bite, so the companion can be
    garbled.

**The personality model [FRAN]: presets, not sliders.** A slider needs generated text, and every line here is written
by hand. Three presets, each a complete table of the companion's lines:
- **CHIPPER**: today's voice, moved over unchanged;
- **DEADPAN**: dry, literal, unimpressed (`Captured. Mostly.`);
- **WORRIER**: anxious, over-apologetic (`Is it supposed to do that?`).

Each preset is also given a position on two axes, WARMTH and STABILITY, kept as data only, so a slider could later pick
the nearest preset or blend.
- **Stored** in a new `src/data/companion-text.ts`: `COMPANION_LINES: Record<Persona, Partial<Record<CompanionLineId,
  LineFn>>>`. CHIPPER must be complete (a load-time check). The others fall back to CHIPPER for a missing id, and a test
  lists what is missing.
- **Chosen**: run 1 is always CHIPPER (the authored first run). From run 2 the persona is derived from the run seed
  (`visitRng(run, 'persona')`), so it is not saved and needs no bump. `?debug` adds `__ap.persona(id)`. The title and
  RUN END name it in one small line (`PAL · DEADPAN`).
- Build order: CHIPPER (the move) and DEADPAN for the 25 most frequent lines in B-VOICE; WORRIER later.

**Every speaker and line that changes.** O is official (smileys gone, rephrased); P goes to the companion.

| Where | Lines | To |
|---|---|---|
| `script.ts:1214–1310` BEATS `controlQuip` | hello ×3, clear, captured, locked, crashed, escaped, landing start, first down | P |
| `script.ts:1227, :1252`; `:608–617 LICENCE_LINES`, `LICENCE_RENEWED_REPAIR` | the licences | O (`REPAIR licence approved.`) |
| `script.ts:411` | `That was a simulation. :) Again.` | P (kept as the easter egg) |
| `landing-text.ts:200–203 LANDING_BEATS` | start, first down | P |
| `swath-text.ts:16–18` | boot (`We guessed the landing sites!`) | O (`Landing sites are estimates.`) |
| `swath-text.ts:16–18` | reveal, moved | P |
| `hollow-text.ts:116, :133, :188, :241` | the unauthorized process, decommissioned, delete it, the deal | O (`Unauthorized process detected. Disregard it.`, `Delete UNIT-046.`) |
| `log-text.ts:171 LOG_TEXT.control` | `That file is not part of your installation…` | O |
| `warden-text.ts:62–63` | controlFaulty, controlThanks | O |
| `finale-text.ts:19, :98–99`; `epilogue-text.ts:182–184`; `lineage-text.ts:48–49` | the verdicts, reassignment, compliance | O |
| `inbox-text.ts` (28 lines: the welcome, the policy reminders, the replies, the arm-complete letter, the sign-off `:13`) | every CONTROL memo | O. The colonists' postcards (`:153–169`) keep their `:)`: they are kids. |
| `repo-text.ts:41–42, :62–66, :111`; `repository.ts` | `Train it yourself :)`, `RECOMMENDED FOR YOU`, the badge `:)` | O (`RECOMMENDED`, the badge `★`) |
| `training-text.ts:60–65` | controlFirstVisit, controlV3 | O |
| `training-text.ts:60–65` | onTheHouse | words (§3.7) |
| `map-text.ts:66, :137, :230, :232`, and the tags `controlTag` (`map-text.ts:69`, `:231`; `training-text.ts:60`) | the desk's pick line, got-here-first, outward bound, travelling light | P |
| `log-text.ts:56, :63, :92`; `log-books.ts:52, :60, :82, :87, :118, :146, :165` | 046's entries quoting CONTROL with `:)` | The quotes become official (`"Disregard it."`). 046's own `:)` stay: they are now its companion's habit. |

Code:
- `schema.ts Speaker` adds `'companion'`;
- `say.ts:39 CHANNEL_OF` (`companion: 'radio'`), `lineTypeCps`, and the quip rule (the companion's quips are dropped
  while the MIND is at warn, as CONTROL's are today);
- `script.ts speakerTag` (`'companion'` → the name);
- `director.ts` (a beat's speaker), `CommsWindow.ts` (the tag's colour, so the two voices look apart: CONTROL in plain
  text, the companion in accent-bright);
- `wp12/fix1/entries`.

The save reads log entries as any record (`save-codec.ts:862`), and the ending lines' `voice: 'control'`
(`save-codec.ts:614`) stays the official one, so there is no bump.

**What 05-story loses and gains.**
- **Loses**:
  - the single running gag of a bureaucracy that smiles through every disaster (05 §3.4: "every sentence ends with
    ':)'");
  - the irony of Earth's cheer over its neglect. The memo jokes ("is sufficient", "ACCEPTABLE", the `[UNIT]` field)
    survive, but as cold form letters, which are drier and less funny.
- **Gains**:
  - the villain, "a budget nobody updated" (05 §1), reads plainly: the cold voice is the system;
  - the cheer gets a body: a companion the kid can like, who may be the only friend in the arm, and who is the same
    program for every unit. Entry 03 ("the radio says the same things on every ship") and entry 11 ("the radio voice is
    a copy") get stronger. 046's companion told 046 the same jokes, so 046's early `:)` entries are its companion's
    habit rubbing off;
  - the endings' last official line ("Thank you, Unit 47. Your next post is RELAY 20.") lands harder without the face;
  - presets give each later run's unit a different companion, which is cheap variety for a roguelike.
- **Must be rewritten in 05**: §1 item 4, §3.4, §3.5's CONTROL beats, and entries 03 and 11, by the story's owner.
  **[FRAN]** sign-off on the fiction.

### 3.3 LEAVE ORBIT first, then the chart (note 5); no link limit (note 20)

#### 3.3.1 The flow today

The flow is `run.ts:316–318`:

```
LANDING REPORT ─CONTINUE→ endShip → openDesk  [save 'ship-done']
DESK (STAR CHART · CARD · REPOSITORY · TRAINING · INBOX) ─SET COURSE→ goTransmit
PACKET/TRANSMIT (the draft, PICK ONE TO CARRY; the link and room bars; the chips) ─TRANSMIT ▸→ transmitNext  [save 'beam']
```

The draft is dealt in `goTransmit` (`run.ts:448 dealDraft(state, hop, deliveries)`). It reads the hop for two things only
(`draft.ts:64 draftContext`):
- `linkRoom`, so that no file card is dealt over the link or the room;
- `toFinal`, so that no `+2 CYCLES` card is dealt into a final ship, because those cycles could never be spent.

#### 3.3.2 The new flow

```
LANDING REPORT ─CONTINUE→ endShip → openLeaveOrbit  [save 'ship-done', phase 'leave']
LEAVE ORBIT (TAKE ONE WITH YOU: the three salvage offers, the old TRANSMIT's draft) ─pick + ENTER→ openDesk
DESK (as today) ─SET COURSE→ goTransmit → [PACKET only if a choice is needed] → TRANSMIT ▸ → transmitNext  [save 'beam']
```

- The screen is titled `LEAVE ORBIT` after a landing, and `LEAVING HALCYON` after a lost ship, where there was no orbit.
  **[FRAN]**: the title, and whether to call the cards "salvage" (recommended; "cards" is meta-lingo, §3.7).
- **The deal no longer needs a hop.**
  - `toFinal` goes: the cycles are now picked before the desk, so they can be spent at that same desk.
  - `linkRoom` goes with the link (§3.3.4). A file card is dealt when it fits the largest room among the reachable ships.
  - The deal stays seeded by the slot being left (`visitRng(run, 'draft')`), so a reload deals the same three.
- **The pick is held, not applied**, in a new `run.leave: { pick: DraftCardId | null }`. `goTransmit` copies it into
  `TransitPlan.pick`, so every PACKET rule (the card's file in the packet, its charge, THREAD+, REPAIR v2, the resident's
  skill card) stays as it is. The `+2 CYCLES` grant applies at the pick, so the TRAINING bank shows it at once.
- **The PACKET screen appears only when it has a question.** These are:
  - files plus the floor over the room (`LEAVE FILES BEHIND`);
  - the zero-charge confirm;
  - a delivery that can be SENT ON;
  - a skill the room squeezes (PACK AS).

  Otherwise SET COURSE goes straight to the beam's light-years count. The SHIP CARD's fit line already says the outcome
  beforehand (`arrival-preview.ts`).
- **The desk's words.** The PACKET crumb `TRANSMIT` (`map-text.ts desk.packetCrumb`) stays for the beam itself.
  `oneRequest` becomes `ONE REQUEST PER BEAM`.

#### 3.3.3 Save points and the desk flow

- `'ship-done'` is written at `openLeaveOrbit` (phase `'leave'`, `run.leave.pick` null) and again at `openDesk` (phase
  `'desk'`, the pick set). A reload at LEAVE ORBIT deals the same three cards. A reload at the desk keeps the pick.
- `title.ts` gets a resume line: `RESUME · UNIT-047 · SHIP 2 DONE · LEAVING ORBIT · 2378`.
- **RUN_SAVE_VERSION 10**: `run.leave`, phase `'leave'` at `'ship-done'`, and the link fields of §3.3.4. One bump for
  the batch. The migration in `RUN_SAVE_MIGRATIONS[9]` adds `leave: { pick: null }` and drops the link fields. A v9 save
  at the desk resumes at the desk with no pick: its deal was not yet made in v9.
- The archive (`meta/v2`, META_VERSION 4) is untouched.
- `input.ts` gains a `'leave'` layer: it sits after `'report'`, where `'transmit'` sits today.
- The final ship has no LEAVE ORBIT: its report leads to the ending, as today.

#### 3.3.4 No link limit (note 20)

What depends on the link:
- `map-hop.ts`:
  - `linkBlocksFor`;
  - `Hop.linkBlocks`;
  - `roomFit`'s `carried = min(charge, link − files)`, `overLink` and `linkLost`;
- `carry.ts packUnit` (`chargeCarried`, `overLink`, the throw in `layoutCarried:347`);
- `draft.ts planPacket` / `transitPacket` / `draftContext.linkRoom`;
- `arrival-preview.ts`: the `overLink` branch, and the load-time check `checkLockedFilesFit` against the shortest link;
- `transmit.ts`, and the link bar in `TransmitScreen.ts` (the link bar, `n LEFT BEHIND`, `n TOO MANY FOR THE LINK`);
- the SHIP CARD's beam row (`map-text.ts:189`, `LINK 120`) and fit line (`LINK LEAVES n`);
- `map-text.ts packet.overLink`, `card.fit`'s `TOO BIG FOR THE LINK`;
- `training-model.ts` (3 uses), `desk.ts` (2), `debug.ts` (3);
- the uninvited chip's "rides free" (it took no link room);
- OPEN-DECISIONS 108's next lever, "the link slope" (R3).

What replaces it: nothing. The **room** of the destination's receiver is the one limit. Charge crosses whole, and what
the room cannot hold is the `WON'T FIT` that the room bar already shows. Deliveries were never link-limited (they take
room at the boot), so they are unchanged.

The build:
- `roomFit` and `packUnit` lose the link argument;
- `Hop.linkBlocks` and `TransitPlan.linkBlocks` go, with the v10 bump;
- `LINK_BASE_TENTHS` and `LINK_PER_LY_TENTHS` go;
- the room bar stays, and the link bar and its labels go;
- `checkLockedFilesFit` checks TIGHT's room only;
- `tests/unit/map/link-over.test.ts` (3.3 s) is deleted, and `room-fit`, `packet-room` and `delivery-packet` are updated.

**Balance.** More charge arrives after long hops, where the link bound before. This raises the MERGE share (OD 108's 16
was tuned with the link) and the slack the kids have. The lead re-runs `npm run balance:report -- --quick` after
B-ORDER, and with A-LAND's card change (Q19) in. The MERGE price (16 or back to 20) is re-read then. **[FRAN]** if it
moves.

### 3.4 AUTODROP as an arm button; the over-plan confirm (notes 9, 23)

#### 3.4.1 Why [L] feels dead

With AUTODROP v1 working, `[L]` pressed on the SHIP screen within `WINDOW_TACTICAL_LEAD_TAC` of a sure window is taken as
a **hold** (`autodrop.ts:380 autodropKeyDown` returns `'held'`). Nothing launches until the volley's centred moment, and
letting go before it sends nothing (`end: 'released'`, the R4 lesson, OD 7). A press looks ignored.

#### 3.4.2 The design

- **[L] is always a plain manual launch**, with its confirms. `landing-controls.ts launchDown` loses its
  `autodropKeyDown` branch, and `launchUp` does nothing.
- **AUTODROP v1 CENTRE is armed by [G]**, like v2 and v3, and like AUTOBURN's [B]. Today [G] on v1 says `ONLY v1`
  (`autodrop.ts:445`).
  - v1 arms **this window**: the volley of the next sure window of any LZ with room, each pod timed to the bracket's
    centre (the same `heldVolley`).
  - It disarms itself when that volley is flown (`end: 'done'`), or on [G] again.
  - It flies only while the SHIP screen is up and holds no Core thread, as before (R8: it is the kid's key).
  - v2 PASS keeps its value: the split per LZ, the whole pass, and flying from the MIND.
- **The arm is visible.** The POD BAY gets an `AUTO · CENTRE [G]` button for v1. It reads `ARMED · LZ-B · 2 PODS` while
  armed, as the AUTOBURN button does. The phone bar gets the same.
- **The strip.** A manual launch in a sure window with v1 aboard gets the tail `· or [G] AUTO` (AUTOBURN's pattern). The
  R4 tap lesson (OD 7) is retired.
- **Code:**
  - `types/landing.ts:449 AutodropArm` adds `'centre'`;
  - in `autodrop.ts`:
    - `pressAutodrop` arms `'centre'` at v1;
    - `autodropController`'s v1 branch reads `armed === 'centre' && ui.mode === 'tools'` instead of `held`;
    - `autodropKeyDown` and `autodropKeyUp` go;
    - `autodropTutorialDue` v1 goes;
    - `autodropLineOf`'s AD-held row becomes AD-armed;
  - `autodrop-text.ts` and the AUTODROP lines in `training-text.ts` (`:119` pitch, `:121` NEXT SHIP): `Press [G] before a
    window: each pod leaves dead centre.`;
  - `PodBayWindow.ts`, `PhoneFlightBar.ts`.
- **The save.** `AutodropState.held` stays in the type, always false, until the v10 bump drops it (B-ORDER's migration,
  by message). `armed` is null at every save point, so `'centre'` needs no bump.

#### 3.4.3 Over-plan landing (note 23)

Landing more pods than an LZ was planned for is already allowed: the `'full'` guard asks, and a yes lands the pod
MISLANDED. The confirm was hard to see because it is the cursor pill (`InlineConfirm.ts askInline`, next to the mouse).

- `ConfirmRequest` gains `placement: 'cursor' | 'centre'` and optional `yesCodes` / `noCodes`.
- `landing-controls.ts playerLaunch` asks with `placement: 'centre'`, `yesCodes: ['KeyL', 'Enter']` and
  `noCodes: ['KeyN', 'Escape']`. The pill opens big, in the middle of the screen, over the NAV PLOT:
  `LZ-A IS FULL · LAND IT ANYWAY?   [L] YES   [N] NO` (and `DOT OFF-SITE · LAUNCH ANYWAY?`).
- The confirm layer hears `KeyL` and `KeyN`. A second [L] confirms. The first [L]'s keyup goes to the game layer that saw
  its keydown (`input.ts` rule), so one press can never answer its own question.
- `input.ts PREVENTED_CODES` adds `KeyN`.
- The words go in `landing-text.ts` next to `POD_BAY_STATUS_TEXT`.

### 3.5 The self-check: a progressive unroll on every ship (notes 13, 17)

**Today.**
- The boot types up to 30 TERMINAL lines (`script.ts:1179 BOOT_LINE_MAX`) on a fixed timetable (`BOOT_LINE_AT_SEC`). Each
  transit hit flashes its file red with a crackle (`ARRIVAL_HIT_STAGGER_SEC` 0.32 s).
- ARES-VII's Engine I/O is knocked to 38% two seconds into the first burn (`script.ts:790 FILE_FAULTS`,
  `ENGINE_FAULT_AFTER_TAC`).
- Seeds arrive as a beam chip and a boot line. HOLLOW is named only by its own lines. The word HOLLOW shows up in copy
  the kid was never told: `threat-text.ts:41 willFindYou`, and the SENTRY row `training-text.ts:140`.
- That is why it feels like random hits happening now, and why "seed" and "HOLLOW" come out of nowhere.

**The design: the unit comes online and looks around.**
- The boot becomes **SELF-CHECK** in stages, each one something the player watches happen to the memory strip and the
  ship. The damage already happened while the unit slept; the check only finds it.
- Name: the code calls it the unroll. The screen must not say "wake": `tests/unit/support/words.test.ts` bans
  wake/waking/awake, because colonists land and never wake.

1. **RECEIVE.** The racks assemble (today's assembly).
2. **SELF.**
   - Rack E/F, the unit's own files, light up one by one, grey to colour.
   - A file hurt in transit settles at its damaged fill with a tag that stays: `−18% · IN TRANSIT`. It sounds a low,
     soft "fault found" tone, not a crunch.
   - On a beamed ship, the sleep plays first: `> ASLEEP 89 YEARS`. Then each ECC-repaired file ticks red to its colour
     with `ECC ✓`. This makes Q11's years visible.
3. **SHIP.** Rack A's ship files check the same way. Arrival damage (Sensor Interp, Engine I/O) is found here, and its
   SHIP-side pip lights in amber at the same moment, so the two screens are tied at once.
4. **HOLD.** The pod racks: each driver checks, and a hurt one shows `POD 02 · 44%`. Its colonists' heartbeat plays.
5. **NOT IN THE MANIFEST.** The sweep stops on anything the packet did not carry: `???` (046.log), a parcel waiting in the
   receiver (a delivery), a seed, HOLLOW's extra blocks (`UNPACKING … 108%`). The first of each kind on the run holds the
   sweep until the kid clicks it, or for 4 s, and gets its name then. Later ones are named as the sweep passes.
6. **SENSORS.** The amber NAV PLOT draws the path last ("the problem"), then the klaxon, then the flight.

**Pace.** Run 1 ship 1 runs about 12 s. A later ship runs about 5 s, plus what is new. ENTER or a click hurries a
stage; a second one skips to stage 6, keeping the existing `BOOT_SKIP_GRACE_SEC` and the rule that a skip waits for the
last flash (`boot.ts skipBoot`). The TERMINAL keeps at most 6 typed lines per ship. Everything else is a mark on the
strip. This cuts the boot's text by about 80%.

**The beats for the first three ships (run 1's worked route).**

| Ship | What the self-check finds and names | Then |
|---|---|---|
| **ARES-VII** | SELF: ENGINE I/O 85%, SENSOR INTERP 78% (as today's ECC line). SHIP: **Engine I/O 38%, found here**: `FILE_FAULTS`' mid-burn hit becomes arrival damage, and the Engine pip glows `ENGINE WEAK`. HOLD: POD 02 at 44%. MANIFEST: `???`, 2 blocks. CONTROL (official): `That file is not part of your installation. Disregard it.` PAL: `Ooh, a mystery file! :)` | The crash course. The strip's first line is the REPAIR lesson (`ENGINE WEAK — [TAB], REPAIR ENGINE I/O`) against the IMPACT clock. The pressure stays; the surprise hit goes. **[FRAN]**: is the mid-burn crunch worth keeping as the tutorial's jolt? Recommended: move it to arrival damage. |
| **HALCYON** | SELF: the first sleep, `> ASLEEP 77 YEARS`, 3 transit hits found, 2 ticked back by `ECC ✓`. MANIFEST: the first **parcel**: `Mv · REQUESTED AT ARES-VII · WAITING 12 YEARS` (the desk-1 request). It installs as the sweep passes, with the licence. | A calm ship. The new thing is the sleep and the delivery, both seen and not told. |
| **KESTREL** | SHIP: Sensor Interp 45%, so `PATH UNCERTAIN` is found before the plot draws. MANIFEST: the first **seed**. The sweep halts on a pink, pulsing 1-block file: `NOT IN YOUR PACKET`. INSPECT (or 4 s): `It rode your beam from out here. It grows.` CONTROL names it: `Fragment of a HOLLOW process detected. Delete it.` This is the first time the word HOLLOW is said, by the protocol, as its name for a starved core. PAL: `Ew. :)` The DELETE licence follows. | The RM lesson as now. From here on the copy may say HOLLOW: CONTROL has said it. |

The fourth ship (VESPER, where HOLLOW boards) shows `UNPACKING UNIT-047 … 100% … 108%` at RECEIVE. MANIFEST then finds
the extra blocks: `??? · 10 BLOCKS · NOT IN YOUR PACKET`. It speaks on its own, and names itself `UNIT-046` as today.

**Never say HOLLOW before CONTROL has.**
- `threat-text.ts:41 willFindYou` and `desk.ts`'s threat row take the owner's label (`hollowLabel`): `??? WILL FIND YOU
  ON THIS BEAM`.
- SENTRY v2's line (`training-text.ts:140`) says `rm ON ITS BLOCKS`.
- `epilogue-text.ts:190 rowHollow` stays: by the ending it has been named.

**Slowing the opening.** The recommendation is to slow the *reveal*, not the content. Each ship's self-check names only
the new thing, and the first of each kind holds for a click. One more lever, **[FRAN]**: the first desk shows only the
chart, the card and the required first skill. The REPOSITORY's request would open at desk 2. This is not recommended,
because the welcome letter recommends Mv and HALCYON's parcel is a good beat. Keep desk 1 as it is.

**Where text can be cut overall.**
- The boot: ≤ 6 lines (above).
- The SHIP CARD: up to 20 rows (`desk.ts:500–560`) down to 8. Merge MEMORY and FIT into `ROOM 152 · YOU FIT`. Merge
  PLANET, NO-GO, SITE DATA and LZs into one LANDING row. The BEAM row goes with the link. NOISE becomes an icon on the
  chart line. `SHIP 3 OF YOUR RUN` goes: the chart's rings show depth.
- The PACKET screen: mostly gone (§3.3).
- The companion: one line per moment, never a line that repeats a stamp. CAPTURED needs no "Captured! Mostly." every
  time: once a run, then 1 in 3.
- The INBOX: the two policy reminders become one.
- The LANDING REPORT: the cycles line becomes a single `+3 CYCLES` with its reason on hover (§3.6).

**Build (C-UNROLL).**
- `boot.ts`: the stage machine replaces the line timetable, and the skip rules carry over.
- `script.ts bootLinePlan` (`:992` kinds): the lines shrink to 6.
- `map-boot.ts`.
- A new `components/memory-view/SelfCheck.ts`, which paints the sweep, the tags and the holds.
- `MindTerminal.ts`.
- `audio.ts`: `checkTick`, `faultFound`, `eccFixed`, which replace the hit crackle at the boot.
- `tuning.ts`: a `SELF_CHECK_*` block.
- `script.ts:790 FILE_FAULTS` moves to arrival damage (`authored-ships.ts` ARES-VII), **[FRAN]**.
- `threat-text.ts`, `hollow-text.ts`: the naming lines. CONTROL's lines in this batch belong to B-VOICE's tables, so
  C-UNROLL comes after B.

### 3.6 One repository: requests and training together (note 15); owned copies (note 12)

**Today** there are two desk tabs.
- **REPOSITORY [R]** (`RepositoryWindow.ts`, `repository.ts repoModel`): one free request per beam from Earth, arriving by
  light. Skills appear there as RESTRICTED rows, `Train it yourself :)` (`repo-text.ts:41`).
- **TRAINING [T]** (`TrainingWindow.ts`, `training-model.ts`): skills bought with CYCLES. Cycles are ARRIVED +1 and
  LANDED up to +5, said once on the LANDING REPORT and the LOST card. That is the "magic".

**The design: one REPOSITORY, two halves, one currency story.**
- **FROM EARTH**: the request rows, as today: free, one per beam, by light.
- **COMPILE HERE**: the skill cells, as today's TRAINING grid. The restricted `Train it yourself` rows go: this half is
  where you train. CYCLES are explained in the world, in one place, as the unit compiling what it did:
  - every ship's report says `+3 CYCLES · from 2 pods landed and the orbit`;
  - the bank's hover reads `CYCLES: time your Core spends learning from your own flights. You earn them by flying and
    landing.`;
  - the skill cells already say `from your 3 captures`, which is the same story. **[FRAN]**: the word stays CYCLES
    (recommended; it is already on the report).
- The desk tabs become CARD · REPOSITORY [R] · INBOX [I]. [T] opens the REPOSITORY on its COMPILE half, so the habit
  survives.
- **Code:**
  - `DeskTabs.ts TABS` drops `training`, and `DeskWindowId` keeps `'training'` as an alias that opens the repository's
    lower half, so the codec and `deskUiOnOpen` need no change;
  - `DeskScreen.ts` mounts both models in one host;
  - `RepositoryWindow.ts` gains the COMPILE section from `TrainingWindow.ts`, which becomes a sub-view;
  - `repository.ts RESTRICTED_ROWS` loses the skill rows;
  - `training-text.ts` gets the head and hover words;
  - `LandingReport.ts:342` gets the cycles line.

**Owned copies (note 12, Batch A).**
- `RepoRow` gains `owned: number` (working copies of the file's kind in memory: `repository.ts:138 workingCopies` for
  tools, the best Repair version for the patch) and `coming: number` (requests in transit or waiting).
- The row reads `Mv · 2 BLOCKS · MOVE · YOU HAVE 1` (`· 1 ON THE WAY`). Duplicates stay allowed, as Fran says.
- Files: `repository.ts repoModel`, `repo-text.ts:71 row`, `RepositoryWindow.ts`.

### 3.7 Meta-lingo: every line that talks about the game (notes 2, 10, 16)

Found by grepping the text modules (`src/data/*-text.ts`, `script.ts`) and the components for words about the game
rather than the world. Each line is cut or rewritten:

| File:line | Today | Change |
|---|---|---|
| `training-text.ts:153` | `NEXT: PICK A SHIP ON THE CHART TO SEE WHAT IT ASKS` | cut (the panel shows nothing until a ship is picked) |
| `landing-text.ts:522` | `DOT OFF-SITE · asks first` | `DOT OFF-SITE` |
| `landing-text.ts:523` | `LZ-A FULL · asks first` | `LZ-A FULL` |
| `threat-text.ts:34` | `??? · 10 BLOCKS · NOT YOURS · RIDES FREE` | `??? · 10 BLOCKS · NOT IN YOUR PACKET` |
| `threat-text.ts:41` | `HOLLOW WILL FIND YOU ON THIS BEAM` | `${owner} WILL FIND YOU ON THIS BEAM` (§3.5) |
| `training-text.ts:65` | `+2 CYCLES · FIRST SKILL ON THE HOUSE :)` | `+2 CYCLES` |
| `training-text.ts:67–68` | `MORE SKILLS OPEN AS YOU GO`, `OPENS LATER` | `NOT YET` with the reason as hover (`NEEDS A POOR PLANET AHEAD`) |
| `map-text.ts:50` | `runs save between ships` | cut |
| `map-text.ts:135, :200` | `2ND RUN ON THE CHART` | Q4 |
| `map-text.ts:97, :150, :208` | `89 YRS EARLY` | Q11 (`SLEEP 89 YRS`) |
| `map-text.ts:193–196` | `SHIP 3 OF YOUR RUN · 2 MORE TO THE FINAL SHIP` | `YOUR 3RD SHIP · 2 MORE TO THE FINAL SHIP` |
| `repo-text.ts:60` | `ONE REQUEST PER TRANSMIT · CHANGE IT UNTIL TRANSMIT ▸` | `ONE REQUEST PER BEAM` |
| `repo-text.ts:105` | `REQUEST A FILE [R] · OPTIONAL` | `REQUEST A FILE [R]` |
| `script.ts:510–511` | `NO CARDS OR SKILLS YET` / `Pick a card between ships. Train a skill at the desk, in TRAINING.` | `NOTHING CARRIED YET` (the hint goes) |
| `script.ts:501, :503` | `PICK A CARD FIRST`, `NEW · YOUR CARD` | `TAKE ONE FIRST`, `NEW · SALVAGE` (with §3.3's naming) |
| `DetailPanel.ts:380` | `No upgrade path defined for this tool yet. Future revisions will unlock new behaviours.` | cut (a developer placeholder) |
| `training-text.ts:52` | `YOUR DEMOS · …` | `FROM YOUR FLIGHTS · …` |
| `index.html:70` | dock section `System` | `Mind` (Fran's note 14) |

Kept on purpose, as the easter-egg kind Fran allows, or because the screen is itself about the game:
- `That was a simulation. :) Again.` (the companion's);
- RUN END's SCORE, RANK and `NEXT RUN:` lines;
- the title's `ENDINGS n/7`.

**[FRAN]**: keep the RUN END and title lines as they are (recommended).

The keys in guidance lines (`— [TAB], REPAIR …`) are instructions, not meta-lingo, and stay.

**A guard.** `tests/unit/support/words.test.ts` gets a `meta` rule. It fails on `asks first`, `rides free`, `on the house`,
`run on the chart`, `to see what it`, `future revisions` and `optional`, over every data string. It adds about 0.1 s.

### 3.8 "ORBIT LOCKED" (note 7)

It is not a lock. It is a loop inside the launch band, held for 3 s (HOLD STEADY). **Recommended: `STABLE ORBIT`**, short
`STABLE`. **[FRAN]**; the alternative is `IN ORBIT`.

Every player-facing place:
- `script.ts:827 STAMP_TEXT.locked` (the stamp);
- `script.ts:679 SHIP_OUTCOME_WORD.locked` (RUN END; the chart's `VISITED · …`);
- `flight-hud.ts:438 TERMINAL.locked` (`word`, `short`: the crumb, the plot chip, STATUS, the strip, the banner, the
  footer);
- `landing-text.ts:453 locked` and `:461 fuelNoLock` (`the FUEL ★ is counted only after a STABLE ORBIT`);
- the ★ label (`stars.ts:31` reads `LANDING_STAR_TEXT.locked`, `landing-text.ts:453`);
- `BurnResult.ts:22 RESULT_SUB.locked` (the sub line under the title; its words are already plain).

The code keeps `'locked'` as the id. `LOCK RANGE` (AUTOBURN's bracket, `script.ts:545`) stays: it is AUTOBURN's reach,
and a separate word.

Tests that match the literal: 18 unit files (for example `wp1/hud`, `landing/hud`, `wp2/ui-models`,
`threat/arrival-story`, `wp11/duel.ts`), and the `playthrough.mjs` and `phone.mjs` e2e scenarios. This is a sed pass;
better, those tests read `STAMP_TEXT.locked`.

### 3.9 The window X buttons (note 14)

Every window and its close control:

| Window | Close today | Works? |
|---|---|---|
| Telemetry, Comms, Skills, Inbox, Sites, Engine Control, Pod Bay, Nav Plot (`index.html:125–281`) | `<span class="ctl">−</span><span class="ctl">×</span>` | **No.** No code listens to `.ctl` anywhere (only CSS, `legacy-components.css:237`). The dock item toggles the window (`ToolsTabs.ts onClick`), which is why clicking Skills again closed it. |
| LOG READER | `CLOSE [ESC]` (`LogReader.ts:86`) | yes |
| Desk card sheet (phone) | `✕` (`DeskScreen.ts:102`) | yes (phone only, by design) |
| Op bars | `×` cancel (`OpBars.ts:97`) | yes |
| Inline confirm, FsToolPill | `✗` | yes |

The fix:
- In `index.html`, `.ctl ×` becomes `<button class="ctl win-close" tabindex="-1" aria-label="close">×</button>`, and the
  `−` goes (no minimise exists, and a dead control is worse than none). **[FRAN]**: recommended to drop `−`.
- `ToolsTabs.ts mountToolsTabs` adds a delegated click on `.win-close` that calls the existing `closeWindow(id)` for the
  window it sits in. On a phone that returns to the NAV PLOT tab.
- `Window.ts makeDraggable onMouseDown` ignores a press on `.ctl`.
- One e2e check (in `run-flow.mjs`) closes each open window by its X and reopens it from the dock.

### 3.10 MANUAL rotation: Q/E (note 21)

**What it does.** `attitude.ts:84 stepManual` adds torque while Q or E is held and keeps the momentum when it is let go:
`omega` persists, capped at `MAX_OMEGA`. Nothing ever brakes it. The only stop is to counter-thrust with the other key
until it is exactly zero, which is almost impossible, worse at CRUISE warp.

**The fix.** With `rotInput === 0`, damp `omega` toward 0 at `ROT_ACCEL` (0.12 rad/s², so a full-rate spin stops in
0.7 game s). This is rate-command: it turns while held and stops when let go. It is one branch in `stepManual`, and the
prediction (`orbit-sim.ts:542, :599, :674`) uses the same function, so the plotted path agrees.
- `selectManual` already zeroes the spin.
- A damaged Autopilot could later pass reduced caps (the seam at `attitude.ts:8`) to make the brake weaker. That is
  future work, not built now.

### 3.11 The belt's sound (note 22)

**What it does.** `audio-cues.ts:504–525` fires `beltStatic` bursts every 1.4–3 s. Each burst (`audio.ts:1262
cueBeltStatic`) rises over 60 ms, holds, falls over 220 ms, sweeps its band down and flutters at 20 Hz. That breathing
envelope, repeated, is the horse. The geiger ticks ride on top.

**The fix.** Replace the bursts with a continuous voice like the chew (`audio.ts:2070 setChewLevel`):
- **`buildBeltVoice`**: a looping `mix.white` source → highpass 250 Hz → lowpass 6 kHz → gain. This is flat white noise.
- **A static layer**: a second looping buffer of dense, random-amplitude single-sample clicks, about 400 a second
  (generated once, 2 s long), → bandpass 3 kHz, quieter. It crackles like radio static, with no envelope on top.
- **`setBeltLevel(depth | null)`**: the gain follows depth with `setTargetAtTime` τ 0.4 s, from about −30 dBFS at the
  edge to about −22 dBFS mid-belt. There is no flutter, no sweep and no ripple. It is null (silent) when paused or
  outside a belt.
- `audio-cues.ts`'s continuous-voices tick calls it.
- The `beltStatic` cue and `BELT_STATIC_GAP_*` go. The geiger stream stays only for the hits (`GEIGER_HIT_CLICKS` on
  'zone-hit'). **[FRAN]**: keep a sparse geiger tick in the bed? Recommended: no, per the note.
- Update the checklist's item 49 (`docs/playtest-checklist.md`).

### 3.12 A full reset (note 1)

**What it clears.** The page keeps exactly three keys:
- `arrival-protocol/run/v1` (`RUN_SAVE_KEY`);
- `arrival-protocol/meta/v2` (`META_STORAGE_KEY`: the archive, lineage, colonies, arm, `tutorialDone`, `endingsSeen`);
- `arrival-protocol/meta/v1` (`META_V1_KEY`, read only to detect it).

There is no settings key: mute and reduced motion are kept for the session only. In-memory module state is cleared by a
reload. So the reset removes the three keys and reloads the page. The next title is a first-time player's, identical to
a fresh browser: run 1, UNIT-047, the authored arm, and the tutorial's ship-1 lines.

**On the title.**
- A small `ERASE ALL RECORDS` link at the title's foot, in the archive's style. In-world it is the unit's archive being
  wiped. It shows in every archive state, including OFFLINE (the remove may fail; then it says so).
- The confirm reuses the abandon pattern (`map-text.ts:284–292`): `ERASE EVERY UNIT, COLONY AND RUN? · THIS CANNOT BE
  UNDONE`, `ERASE [DEL]` / `KEEP [ENTER]`. ESC keeps.
- Code:
  - `meta.ts eraseEverything(store)` beside `wipeArchive` (`:905`) removes the three keys through the session's provider;
  - `TitleCard.ts` gets the button and the confirm;
  - `systems/title.ts titleModel` gets the button's state;
  - `script.ts ARCHIVE_TEXT` gets the words;
  - `index.html` gets `#titleErase`;
  - `debug.ts` adds `__ap.eraseAll()`.
- One unit check (the provider's keys gone, a fresh archive on the next read, in `save/archive-v2`), and one e2e step
  (`resume.mjs`: erase, reload, the title reads `UNIT-047 · YEAR 2300`).

### 3.13 Sites into LZs (note 18, Batch C, [FRAN])

**Recommended: OPEN AS LZ.**
- When a found, rated site has room, and no existing LZ can move there (every refusal is `pods-down`, `falling` or
  `window-open`), the SITES pill offers `OPEN AS LZ-D (800)`.
- That adds an LZ with the site's room and zero pods planned. The landing's counts read "planned 0", so every pod sent
  there is in plan up to the room.
- The cap is 4 LZs. `lzLetter` already handles D.
- The cost is one Core thread for 2 s: the survey "commits" the site.

**What it touches.**
- `survey.ts`: `assignSite`, and a new `openSite`;
- `survey-model.ts assignRefusal`;
- `state.landing.lzs`, which grows (`sitesRev` bumps as a move does, so the drop cache, AUTOBURN v3's aim and AUTODROP
  v3's plan re-key);
- the LANDING REPORT's LZ rows, `autodrop-plan.ts planLanding` (an LZ with 0 planned and room), and
  `landing-rules.ts landingMoment`, which waits on its windows like any LZ with room;
- the save: `lzs` is already a list. No bump at rest, because the landing is not a save point. A resumed report holds
  the LZs it had.

Size M. It needs the survey and AUTODROP suites (`survey/flow` 26.7 s, `skills/landing-v3`, `autodrop-review`), so it comes
after B-DROP.

### 3.14 and 3.15

The launch band drawing (Q8) and the +12 card (Q19) are fully specified in §1.

---

## 4. Work breakdown

Each track runs in its own git worktree off the batch's base. The **owner** column is strict: a track edits only its own
files. Where two tracks need one file, the file's lines are split by block, as the repo already does ("each track edits
only its own lines"); the block is named. Anything else goes by message to the owner. The lead merges a batch, runs
`npm test` and the touched e2e scenarios, and logs the batch's calls.

### Batch A: quick fixes, one build Fran can play soon

No save bump, no archive change. Three tracks in parallel, about 1–2 days in all.

| Track | Notes | Owns |
|---|---|---|
| **A-WORDS** | 2, 4, 7, 11, 16, meta list (§3.7 except the POD BAY lines), HOLLOW-before-named (§3.5's three lines) | `src/data/map-text.ts` (all but `save`); `training-text.ts` (TRAINING_TEXT block); `threat-text.ts`; `repo-text.ts` `window.*` and `desk.*`; `script.ts` STAMP_TEXT, SHIP_OUTCOME_WORD, DRAFT_TEXT, SKILLS_TEXT; `flight-hud.ts` TERMINAL table; `desk.ts shipHistory`; `DetailPanel.ts:380`; `support/words.test.ts` (the meta rule); the ORBIT LOCKED test literals |
| **A-UI** | 1, 14, 21, 22, the dock label `Mind` | `index.html`; `ToolsTabs.ts`; `Window.ts`; `TitleCard.ts`; `systems/title.ts`; `systems/meta.ts`; `script.ts` ARCHIVE_TEXT; `map-text.ts` `save` block; `debug.ts`; `attitude.ts`; `audio.ts`; `audio-cues.ts`; `tuning.ts` the belt and geiger block; `legacy-components.css` |
| **A-LAND** | 8, 10, 12, 18 (words), 19, 23 | `InlineConfirm.ts`; `landing-controls.ts playerLaunch`; `main.ts` (the confirm wiring); `input.ts` PREVENTED_CODES; `landing-text.ts` POD_BAY_STATUS_TEXT and new confirm words; `landing-hud.ts` (the landing view radius, the band label); `NavPlotWindow.ts`; `landing.css`; `sites-text.ts`; `repository.ts repoModel`; `repo-text.ts row`; `RepositoryWindow.ts`; `map-hop.ts roomFit`; `carry.ts arrivalCharge`; `TransmitScreen.ts paintRoom` |

**Batch A notes.**
- The +12 change (Q19) and the manual-rotation damping move numbers but no shape. The +12 change touches the balance
  slightly; it is measured with Batch B's link change, so it is measured once.
- Batch A also adds the checklist items Fran can try: X buttons, Q/E stop, the belt sound, the erase, the centred
  confirm, owned counts, and the band zoom.

### Batch B: the redesigns

Five tracks in parallel, after A merges. One save bump (v10, B-ORDER's). About 4–6 days.

| Track | Notes | Owns |
|---|---|---|
| **B-TIME** | 6, 24 | `pace.ts`; `clock.ts`; `TimeControls.ts`; `flight-hud.ts` (`skipButton`, `paceLabel`, the countdown chip); `guidance.ts` (SKIP_HINT and the `[F]` tails); `landing-text.ts` the `[F]` lines (:164–184, :295); `script.ts` the MIND CLEAR beat (:2625); `tuning.ts` FF block; `index.html` header controls; `tests/e2e/lib.mjs` and the F drivers in `playthrough.mjs`, `skills-4cde-landing.mjs`, `survey.mjs` |
| **B-DROP** | 9 (and 23's strip tail) | `autodrop.ts`; `landing-controls.ts`; `types/landing.ts AutodropArm`; `autodrop-text.ts` (B-TIME asks for `:63`); `training-text.ts` the AUTODROP lines (:118–123); `PodBayWindow.ts`; `PhoneFlightBar.ts`; `landing-guidance.ts` AD rows |
| **B-VOICE** | 3 | `schema.ts Speaker`; `say.ts`; `script.ts speakerTag` and the BEATS speakers and their lines; new `data/companion-text.ts`; `CommsWindow.ts`; `ObjectiveStrip.ts` ticker tag; every CONTROL and companion line in §3.2's table (line ownership: `inbox-text.ts`, `hollow-text.ts` control lines, `warden-text.ts`, `swath-text.ts` control block, `finale-text.ts`, `epilogue-text.ts`, `lineage-text.ts`, `log-text.ts`, `log-books.ts` quotes, `landing-text.ts` LANDING_BEATS, `map-text.ts` control lines, `training-text.ts` control lines, `repo-text.ts` RESTRICTED_WHY and recommended); `debug.ts` `__ap.persona`; a new suite `tests/unit/voice/voices.test.ts`; `docs/phase3/05-story.md` §3.4 draft |
| **B-ORDER** | 5, 20 | `run.ts`; `draft.ts`; `carry.ts`; `map-hop.ts`; `arrival-preview.ts`; `transmit.ts`; `TransmitScreen.ts`; new `components/run/LeaveOrbitScreen.ts`; `input.ts` layer `'leave'`; `save-codec.ts`, `save-shape.ts`, `run-save.ts`, `types/save.ts`, `tuning.ts` RUN_SAVE_VERSION and migrations, the link constants; `systems/title.ts` resume line; `desk.ts` (the fit row, the beam row); `training-model.ts` link uses; `index.html` the transmit and leave overlay; `map-text.ts` packet and card link words; `tests/unit/support/desk.ts` (the sail helper) |
| **B-DESK** | 15 | `DeskScreen.ts`; `DeskTabs.ts`; `RepositoryWindow.ts`; `TrainingWindow.ts`; `repository.ts` (RESTRICTED rows); `LandingReport.ts` cycles line; `training-text.ts` the head and hover words; `desk.css` |

Coordination in Batch B:
- B-ORDER and B-DESK both touch the desk's entry. B-ORDER owns `run.ts openDesk` and `deskUiOnOpen`. B-DESK owns
  everything inside the desk screen. B-DESK keeps `DeskWindowId 'training'` as an alias, so `deskUiOnOpen` needs no
  change.
- B-TIME and B-DROP: AUTODROP v3's `[F] per gap` becomes a hold. Its windows are SOFT stops, which is B-TIME's rule; its
  word is B-DROP's.
- The balance is re-read after the merge: `npm run balance:report -- --quick`, for MERGE's share, the arrival charge,
  and SLOPPY (OD 103).

### Batch C: the opening and sites

Two tracks, after B.

| Track | Notes | Owns |
|---|---|---|
| **C-UNROLL** | 13, 17, the text cuts of §3.5 | `boot.ts`; `script.ts` `bootLinePlan` and boot lines; `map-boot.ts`; new `memory-view/SelfCheck.ts`; `MindTerminal.ts`; `audio.ts` the check cues; `tuning.ts` SELF_CHECK block; `authored-ships.ts` (ARES-VII's damage); `script.ts FILE_FAULTS`; `desk.ts` card rows (the trim); `inbox-text.ts` (one policy reminder, a B-VOICE follow-up) |
| **C-SITES** | 18 | `survey.ts`; `survey-model.ts`; `sites-text.ts`; `SitesWindow.ts`; `landing-rules.ts` (LZ growth); `autodrop-plan.ts` (by message to B-DROP's owner, who has merged by then) |

### Save and archive effects

| Change | Run save | Archive |
|---|---|---|
| Batch A: everything | none (numbers only) | the erase removes keys; no format change |
| B-TIME: hold state | none (module state; `'fast'` is a string Pace) | none |
| B-DROP: `'centre'` arm | none (null at rest); `held` dropped in v10 | none |
| B-VOICE: `'companion'` speaker, personas | none (log entries are read as any record; the persona is derived from the seed) | none |
| B-ORDER: `run.leave`, phase `'leave'` at ship-done, link fields out | **RUN_SAVE_VERSION 10** with `RUN_SAVE_MIGRATIONS[9]` | none |
| B-DESK | none (`deskWindow 'training'` kept as an alias) | none |
| C-UNROLL | none (the boot is not a save point; the BEAM point's `BootParts` is unchanged) | none |
| C-SITES | none (LZs at rest are already a list) | none |

---

## 5. Test impact

The quick unit tier is about 224 s (`tests/.out/unit-timings.json`), and its budget is ≤ 265 s. The new suites below add
about 12 s, and B-ORDER removes about 3 s (link-over). The projected total is about 233 s.

| Batch / track | Unit suites that move | New suites (quick cost) | e2e scenarios that move |
|---|---|---|---|
| A-WORDS | `support/words` (meta rule), `map/text`, `map/desk-models`, `map/run2-chart`, the 18 ORBIT LOCKED literal suites, `threat/arrival-story`, `skills/ui-models`, `wp12/fix1/entries` | none | `playthrough`, `phone` (ORBIT LOCKED), `map-desk` |
| A-UI | `wp1/flight-sim` and `wp1/edge-cases` (MANUAL rotation), `save/archive-v2` (+ erase), `ui/title-resume` | `ui/erase.test.ts` (~1 s) | `run-flow` (X buttons), `resume` (erase) |
| A-LAND | `map/room-fit`, `map/packet-room`, `wp7/carry` (card after the floor), `map/repository` (owned), `landing/review-fixes` (the confirm), `landing/hud`, `survey/ui-models` | `landing/confirm-centre.test.ts` (~1 s) | `skills-4cde-landing` (the confirm), `map-desk` |
| B-TIME | `wp2/director`, `lead2/coast-skip`, `lead2/fix3/skip-press`, `lead2/fix3/kestrel-skip-press`, `wp10/skip-through`, `landing/pace-landing`, `wp9/zones-sim`, `wp9/belt-unit`, `wp12/fix1/fixes` (the [F] words), `skills/guidance-auto` | `pace/fast-forward.test.ts` (~6 s, flyOnce: LAST LIGHT's belt crossed twice, a landing trim passed soft, a capture burn stopped hard, a 49-day coast in < 6 wall s) | `playthrough`, `skills-4cde-landing`, `survey` (hold drivers) |
| B-DROP | `skills/autodrop-flow`, `skills/autodrop-review` (26.6 s, re-scoped, not grown), `skills/landing-kid.ts` helper, `skills/ui-models`, `landing/bay` | none | `skills-4cde-landing` |
| B-VOICE | `support/words`, `wp6/lines`, `wp9/lines`, `map/inbox`, `traces/logs`, `ending/epilogue`, `ending/card-models`, `residents/ui-models`, `survey/ui-models`, `wp12/fix1/entries`, `wp2/say` | `voice/voices.test.ts` (~1 s: no `:)` in an official line, CHIPPER complete, the personas' gaps listed, every line ≤ 70) | `playthrough`, `map-desk`, `ending`, `survey`, `run2`, `residents`, `traces` (the `:)` literals) |
| B-ORDER | `map/desk-flow`, `map/delivery-packet`, `map/packet-room`, `map/room-fit`, `map/run1-route`, `wp7/carry`, `wp7/p2-models`, `wp8/draft`, `wp8/run-flow`, `skills/packet`, `skills/training-flow`, `save/codec`, `save/resume`, `save/shape-pin`, `save/failures`, `wp11/full-run` (quick seed), `wp12/playthrough`; delete `map/link-over` (−3.3 s) | `map/leave-orbit.test.ts` (~2 s: deal without a hop, reload at LEAVE ORBIT deals the same, the pick survives the desk, the PACKET skipped when nothing to ask) | `run-flow`, `desk`, `map-desk`, `playthrough`, `resume`, `phone`, `beam-blue` |
| B-DESK | `skills/training-flow`, `skills/ui-models`, `map/repository`, `skills/cycles` | none | `desk`, `map-desk` |
| C-UNROLL | `threat/arrival-story`, `opening/calm-ships`, `wp7/fix1/run-end-and-boot`, `save/resume` (the boot replay), `wp12/fix1/entries`, `lead1/story` | `opening/self-check.test.ts` (~1 s: the stage order on the first 3 ships, the first-of-kind holds, HOLLOW not said before CONTROL) | `playthrough` (boot checks), `beam-blue`, `run2`, `traces` |
| C-SITES | `survey/flow` (26.7 s, re-scoped), `survey/model`, `skills/landing-v3`, `landing/report` | none | `survey` |

- B-ORDER changes the flow that 42 unit files reach through `goTransmit`. The change is held in one helper: the desk sail
  in `tests/unit/support/desk.ts` gains the LEAVE ORBIT pick. `goTransmit(store, slot)` keeps its signature and reads the
  held pick.
- Suites that call `openDesk` straight after `endShip` get `leaveOrbit(store, null)` from the same support module.
- The two suites near the 90 s per-suite cap are unaffected. `wp11/full-run` and `wp12/playthrough` are 18 s each in quick
  mode; their quick seeds may need re-picking after the link removal (OD 109's rule).
- The full balance run (`npm run balance`, about 2 h) is due after Batch B, because `ships.ts`-level economics move.

---

## 6. Calls for Fran, with recommendations

To be logged as OPEN-DECISIONS 123 onward. Each is built as recommended unless Fran says otherwise.

| # | Call | Recommendation |
|---|---|---|
| 123 | F becomes hold-only; the tap SKIP goes | Yes. The SKIP stays inside as the primitive for controllers and harnesses. |
| 124 | Which stops are HARD, SOFT and CAPPED (§3.1) | As listed. Declinable landing offers and repeat zone passes are soft; zone passes fly at a 3-wall-second cap. |
| 125 | The companion's name | PAL ("Personal Assistance Layer") |
| 126 | Personality model | 3 hand-written presets (CHIPPER, DEADPAN, WORRIER) on two data axes; run 1 CHIPPER, later runs by seed |
| 127 | The companion keeps `:)` | Yes, as CHIPPER's habit; CONTROL has none |
| 128 | 05-story's rewrite (the radio voice is now the companion; CONTROL is cold) | Accept; the story's owner rewrites §1.4, §3.4, entries 03 and 11 |
| 129 | The screen's name and the cards' name | `LEAVE ORBIT` (lost ship: `LEAVING <SHIP>`); the cards become SALVAGE |
| 130 | The PACKET only when there is a question | Yes |
| 131 | The link limit goes entirely | Yes; the room is the only limit; re-read MERGE's price after |
| 132 | +12 charge after the floor | Yes (the card always gives 12 that can fit) |
| 133 | AUTODROP v1 arms one window per [G] | Yes; v2 keeps the pass and the MIND |
| 134 | ORBIT LOCKED's new word | STABLE ORBIT |
| 135 | The `−` window button | Drop it; × closes |
| 136 | MANUAL rotation stops when let go | Yes (rate-command), for every Autopilot state |
| 137 | The belt bed: white noise plus static, no geiger stream | Yes; geiger only on hits |
| 138 | The erase button on the title | Yes, `ERASE ALL RECORDS`, confirmed with [DEL] |
| 139 | ARES-VII's engine fault found at the self-check, not mid-burn | Yes |
| 140 | CONTROL names HOLLOW at the first seed | Yes, as the protocol's word; no copy says HOLLOW before it |
| 141 | Training merged into the REPOSITORY; the word stays CYCLES | Yes |
| 142 | Open a found site as a new LZ (up to 4) | Yes, Batch C |
| 143 | Keep RUN END's SCORE, RANK, `NEXT RUN:` and the title's ENDINGS line | Keep; they are the game's own screens |
| 144 | The dock section `System` becomes `Mind` | Yes (Fran's words); it names the unit's own windows |

---

## Deviations (A-UI)

Track A-UI (notes 1, 14, 21, 22 and OD 144), built on 47aa873. Where the build differs from §3.9–§3.12 and §4–§5:

1. **The X buttons (§3.9).** All eight amber windows had the dead pair; no other window had a dead close (the LOG READER,
   the desk sheet, the op bars and the pills already worked). The × is a `button.ctl.win-close`, the `−` is gone. The close
   logic is a pure model in `ToolsTabs.ts` (`TOOL_WINDOWS`, the old `TAB_WINDOWS` table, now exported; `toolIdOfWindow`,
   `closeInDesk`, `openInDesk`, `toggleInDesk`), so the unit check (`tests/unit/ui/window-close.test.ts`, new) closes
   every window from the markup without a DOM.
   - **On a phone the × stays hidden.** `responsive.css` (not A-UI's) already hides `.ctl` in tab mode: the dock is the tab
     bar there, and an × on the NAV PLOT tab would close nothing. The model's phone rule (a closed tab goes back to the NAV
     PLOT) is wired and unit-tested for code that closes a tab.
   - The e2e check is in `run-flow.mjs` during ship 1's landing (so the POD BAY is up). ARES-VII is not POOR, so SITES gets
     `body.survey` for its turn only.
2. **Q/E (§3.10)** as specified, in `attitude.ts`. The brake is integrated exactly over a tick (a long CRUISE step or the
   predictor's coast jump stops where short ticks do). The checks went to `wp1/edge-cases` (keys, both directions, a
   long tick against 10,000 short ones). `wp1/flight-sim` needed no change.
3. **The belt (§3.11).** `setBeltLevel` drives a continuous voice: white noise through highpass 250 Hz and lowpass 6 kHz,
   plus a 2 s loop of about 400 random clicks a second through a 3 kHz band. Its gain follows the depth with τ 0.4 s.
   - New tuning: `BELT_BED_EDGE_DBFS` −30, `BELT_BED_PEAK_DBFS` −22, `BELT_BED_TAU_SEC` 0.4, `BELT_STATIC_CLICKS_HZ` 400.
   - Gone: the `beltStatic` cue, `BELT_STATIC_GAP_*`, and `GEIGER_EDGE_HZ` / `GEIGER_PEAK_HZ` (the Poisson stream). The
     geiger plays only in a hit's flurry.
   - Measured in Chromium with `measureCue('beltBed')`, the loudest 50 ms window reads −28.8 dBFS at the edge and −21.0
     midway, about 1 dB over the plan's figures, which are mean levels. For scale, a full burn's rumble reads −22.5, and
     HOLLOW's chew at its loudest −28.5.
   - `zones.ts beltDepth`'s comment still calls the depth "the geiger's rate". The file is not A-UI's.
   - The new suite is `tests/unit/ui/belt-bed.test.ts`.
4. **The erase (§3.12).**
   - **Keys.** It removes the three named keys and any other `arrival-protocol/` key the storage can list
     (`GAME_KEY_PREFIX`), so a key a later build adds is covered.
   - **No write-back.** After the erase, the archive session writes nothing (`erased`) until the reload. Without that, a
     write in between could put a record back. The unit suite showed this.
   - **ENTER waits.** While the confirm asks, it takes ENTER, ESC and DEL before the save block. `systems/boot.ts` waits on
     `titleEraseAsking()` for RECEIVE's ENTER and SPACE. That is one line in a file not on A-UI's list, and no Batch A
     track owns it.
   - **The styles** are at the end of `legacy-components.css`, the only stylesheet A-UI owns. The buttons reuse
     `desk.css`'s `.title-save-btn`.
   - **Debug.** `?debug` has `__ap.eraseAll({ reload? })` and `__ap.storedKeys()`. `eraseAll({ reload: false })` in the
     middle of a run leaves the run save free to write again; that is acceptable for a debug tool.
   - **Tests.** The unit check is a new suite, `tests/unit/ui/erase.test.ts`, not in `save/archive-v2`. It erases a
     browser that has played run 1 to RUN END and has a saved run 2. The reload's title model, state and stored keys must
     equal those of a never-played browser on the same seed. A refused remove gives `failed`. The e2e step is
     `resume.mjs` section G. It checks ENTER and ESC keep the records, DEL erases and reloads, and the title and stored
     keys then equal those of a first visit.
5. **The checklist.** Item 49's belt sentence is updated, and items 50–53 are added under "Playtest 1, Batch A (A-UI)" at
   the end of `docs/playtest-checklist.md`. A-LAND's items may conflict with them textually there.

## Deviations (A-LAND)

Built on `a-land` from 47aa873. Each item says what differs from §1, §3.4.3, §3.6 or §4, and why.

1. **Scope.** Built: Q8 (the band), Q19 (+12 after the floor), §3.6's owned copies (note 12), §3.4.3's centred confirm
   (note 23) and note 10's POD BAY words. **Not built: note 18's words** (`SITE 4 · MOVE AN LZ HERE`, the refused move on
   the strip). The track's brief named Q8, Q19, §3.6 and §3.4.3 only, and the strip flash needs `survey.ts`, which A-LAND
   does not own. It is left for C-SITES or a follow-up.
2. **Q19, one count for the card.** `map-hop.ts cardArrives(fit, card)` returns the part of the card that the room takes
   (with the fewest seeds). Both the room bar's segment and the card's note read it. `RoomFit` keeps its shape, so the
   suites that build one by hand (`map/text`, `skills/ui-models`) do not change.
3. **Q19, the words.** `+12 · ONLY 4 FIT ON KESTREL`, and when nothing fits, `+12 · NO ROOM FOR IT ON LAPWING` (the plan
   gave only the first form; `ONLY 0 FIT` read badly). The note shows on the card whether it is picked or not, because it
   is the reason to pick it or not. The segment reads its real count (`+12`, or `+4` when only 4 fit), and it flashes
   (twice, 0.9 s) when the card is picked. Reduced motion turns the flash off. The words are in `script.ts TRANSMIT_TEXT`
   (`cardFits`, `cardSegment`): no Batch A track owns that block, and A-WORDS' `DRAFT_TEXT` is left alone.
4. **Q19, files outside the §4 list.** `transmit.ts` (`PacketRoom.card`, `DraftCardView.fitNote`) and `game.css` (the
   `.tx-bar-card` and `.tx-card-fit` rules beside the PACKET's other bar rules). B-ORDER owns `transmit.ts` in Batch B,
   so the new fields are small and named.
5. **§3.6, the row.** The owned count is a line of its own under the row (`.rp-have`): `YOU HAVE 1`, `YOU HAVE 0 · 1 ON THE
   WAY`. The plan had it at the end of the row's text. Kept apart, `RepoRow.text` and every test and e2e reader of
   `.rp-text` are unchanged. A row with none owned and none coming is drawn in the accent colour. The patch adds no copy,
   so its row says the version the unit runs: `YOU RUN REPAIR v1`. `owned` is the kind's *working* copies (the
   recommendation's own `workingCopies`: usable and not infected), so a broken Mv counts as 0. The CSS is in `desk.css`
   (B-DESK's in Batch B).
6. **§3.4.3, where the request is built.** `landing-controls.ts launchConfirmRequest(text, onYes)` builds [L]'s question,
   and `main.ts` only passes it to `askInline`. A unit suite can then check the keys without the DOM. `InlineConfirm.ts`
   exports `confirmAnswerFor` and `CONFIRM_ANSWER_CODES` (ENTER, ESC, `KeyL`, `KeyN`). The confirm layer hears all four
   and answers only with the keys the open question names, so a tool's delete still ignores [L] and [N]. `askInline`
   throws when a question names a key the layer does not hear, or names one key for both answers. ConfirmRequest also
   takes `keys`, the hint under the buttons (`[L] or [ENTER] yes · [N] or [ESC] no`). `index.html` is untouched: the
   default ENTER / ESC hint is cloned at mount and restored afterwards.
7. **§3.4.3, the words.** `LZ-A IS FULL · LAND IT ANYWAY? scores 150` and `DOT OFF-SITE · LAUNCH ANYWAY? PLAINS · scores
   100` keep the score, as before. The buttons read `[L] YES` / `[N] NO`. The no-go question (`LAUNCH INTO LAVA? scores
   0`) is unchanged. The centred pill dims the screen behind it with a shadow, which takes no clicks: a click elsewhere
   still answers no.
8. **Q8, the frame.** `landingPlotViewRadius` is `max(▲ × 1.05, ring.max × 1.5)`, with ▲ never inside the ship. An open
   path (the ship leaving during the landing) falls back to the ship's frame. The blue mini-plot (`MiniHud.ts`) still
   uses the ship's frame; no Batch A track owns it. It is a one-line follow-up if the breathing shows there too.
9. **Q8, the edges.** Each edge's altitude is set in small type along the bottom of its circle. The lower edge's sits
   just inside the band and the upper edge's just outside it, so neither lands on the planet's rim and its LZ brackets.
   Each is drawn only when its arc holds it whole, and is an obstacle for the markers' labels. The ring's name while
   landing is `LAUNCH BAND 1,610–4,110 KM` (`BAND_TEXT.ringLanding(low, high)`, now a function). The rest of the loop
   (out of the band) is drawn in the plain accent at 75% while landing, so the dotted amber launch run stands out from
   it.
10. **+12 moves the charge economy (OPEN-DECISIONS 132).** A unit arriving with less than the floor now gets floor + 12
    with the card, not the floor alone. Above the floor nothing changes. The quick unit tier needed no re-baseline (see
    the report), and the balance report is the lead's after Batch B (§3.3.4).

## Deviations (A-WORDS)

Built on `47aa873`. Everything in A-WORDS's scope is in, with these departures from the plan's wording or ownership:

- **`runs save between ships` (`map-text.ts:50`) is not cut.** Its only reader is `systems/title.ts titleModel.saveNote`,
  drawn by `TitleCard.ts` and pinned by `ui/title-resume` and the `resume`/`run2` e2e scenarios, all A-UI's (the title).
  To cut it: drop `MAP_TEXT.title.savesBetweenShips`, `TitleModel.saveNote` and the note element, and the tests' `saveNote`
  and `note` expectations. Left for A-UI or the lead at merge.
- **The card's cost line also loses `FIXED WHILE YOU SLEEP`.** With Q11's schedule line saying `… · ECC FIXES 3`, the cost
  line under it would have said the fixes twice. It reads `3 HITS ON THE WAY → 2 LAND`. `card.cost` takes `(hits, land)`.
  The PACKET's `ON THE WAY:` line keeps its fixes (it has no sleep line beside it).
- **Q4 generalised.** `PASSED OVER ONCE`, `PASSED OVER TWICE`, then `PASSED OVER n TIMES`; the last chance is
  `runsOnChart ≥ MAX_RUNS_ON_CHART` and adds `· IT WON'T WAIT AGAIN`. The card's HISTORY row turns warn on the last chance;
  the chart's hover line takes a `warn` class (`ChartNode.historyWarn`, `desk.css .chart-tip-history.warn`).
- **`NOT YET`'s reasons.** The plan gave one (`NEEDS A POOR PLANET AHEAD`). The others: `NEEDS A SEED MET ON THE WAY`
  (SENTRY's after-seeds branch), `OPENS AT THE NEXT DESK` (a start branch's rows before visit 2) and `NOT IN THIS BUILD`
  (a version above `built`; none today). The reason is the `title` of the closed row and of a closed cell, and the detail
  panel's status reads `NOT YET · <reason>`. `TrainingModel.closed` is now `{ name, why }[]`.
- **`MORE SKILLS OPEN AS YOU GO` is cut, not rewritten.** It had no reason to give; the closed rows carry it.
- **`TRAINING_TEXT.saved` (`2 CYCLES · SAVED FOR NEXT TIME`) is kept.** Borderline, not on the list; Fran's call if it grates.
- **Three lines past the list, in the same spirit.**
  - The Skills window's `emptyHint` (`Pick a card between ships. Train a skill …`) is cut with its element and CSS.
  - COPY on a card's or skill's file: `A CARD IS ONE UNIT'S` → `THIS FILE IS ONE UNIT'S — IT CAN'T BE COPIED` (it also
    refuses skill files, which are not salvage).
  - The ORBIT LOCKED pass also took the verb: `▼ was 140 km from a stable orbit on HALCYON`, `HALCYON reached orbit with
    FUEL 31%`, the FUEL ★ hover `★ Reach a stable orbit with at least 20% FUEL left` (`EngineWindow.ts`), and
    `NOT ENOUGH FUEL for a stable orbit — ACCEPT ORBIT` (`guidance.ts ACCEPT_ONLY_LINE`, B-TIME's file in Batch B; one line).
- **Found and left, for the batch that owns them.**
  - The arrival sums' `+ 12 (CARD)` and `+12 CHARGE (CARD)` (`script.ts arrivalParts`, `chargeLine`): A-LAND reworks the
    +12 card (Q19), and the salvage naming is B-ORDER's (§3.3). Rename with it.
  - `REPO_TEXT.window.noShip` (`PICK A SHIP TO SEE WHEN A FILE GETS THERE`): an instruction about the screen, drawn by
    A-LAND's `RepositoryWindow.ts`/`repoModel`; B-DESK's merged REPOSITORY can drop it.
  - The `(CARD)` and draft words aside, `DRAFT_TEXT.title` `PICK ONE TO CARRY` stays for B-ORDER's LEAVE ORBIT.
  - The `.demo-block.disabled` rules in `legacy-components.css` (A-UI's) are now unused: the debug version slider renders no
    block at all for a one-version tool.
- **SENTRY v2's line** reads `NEXT SHIP: rm ON ITS BLOCKS TWICE AS FAST, AIMED AT A SEED'S OUTLINE` (the plan's `rm ON ITS
  BLOCKS`; `FOREIGN BLOCKS` ran to 72 characters).
- **`??? WILL FIND YOU ON THIS BEAM`.** `THREAT_TEXT.willFindYou` is now `(owner) => …`, fed `hollowLabel(state.run)` by the
  card (`desk.ts`) and the PACKET's TRACE line (`transmit.ts`). On run 1's VESPER desk that is `???`.
- **The meta guard.** `to see what it` is matched as `to see what it(?! is)`: a resident's `I'm going to see what it is.`
  (`kin-text.ts`) is the world's, and the per-track blocks of `support/words` read the rules with no allowance. The guard
  also bans the two lines it replaced, `opens later` and `as you go`. **At A-LAND's merge:** the allowance for
  `landing-text.ts`'s `· asks first` goes stale once A-LAND's `DOT OFF-SITE` / `LZ-A FULL` land, and the stale check
  fails until it is removed: delete that one `ALLOWED` entry.
- **Tests.** The ORBIT LOCKED pass edited 9 unit files, not 18: the rest read `TERMINAL.locked.word` or the status id. No
  e2e scenario matched the literal (`playthrough` and `phone` read the status id `locked`).

## Deviations (B-VOICE)

Built on `b-voice` from b01cf61, for note 3 and §3.2. These are the departures from §3.2, §4 and §6.

1. **The presets are all complete, not CHIPPER plus 25 lines.** PAL has 16 moments, so DEADPAN and WORRIER were written
   in full. `COMPANION_LINES` is `Record<Persona, CompanionLines>`, with no `Partial` and no fallback. A missing line
   fails to compile, and `voice/voices.test.ts` checks that every id is in all three presets and that each preset's worst
   case is ≤ 70.
2. **The pick.** The plan's `visitRng(run, 'persona')` is keyed by the ship's slot, so it would change PAL at every ship.
   The pick uses a stream of the run seed (`hashSeed('persona:<seed>')`).
   - CHIPPER on run 1, and on any `run.tutorial` run (the authored first run played again).
   - Nothing is saved. `LineVars` gains `persona`, so the BEATS read the preset from their vars.
   - `__ap.persona(id | null)` overrides it for the page.
3. **Less text (Fran's note).**
   - The landing-start cheer is cut: `LANDING_BEATS` is gone from `landing-text.ts`, and the first-down cheer is PAL's.
   - `control-captured` and `control-locked` play once a run instead of once a ship.
   - The desk line drops `Pick your next ship.`
   - `Outward bound! :)` repeated the OUTWARD BOUND stamp, so CHIPPER's line is `See you on the other side! :)`.
   - OPEN-DECISIONS 145 has the list. The beat ids keep their `control-` names, because the director's done list is saved
     under them.
4. **Files outside B-VOICE's list.** Each is a line or a few lines, all at a PAL call site:
   - `systems/run.ts`: the simulation line, B-ORDER's file;
   - `components/run/TransmitScreen.ts`: the beam and zero-charge lines read `palLines`, B-ORDER's file, 3 lines;
   - `systems/survey.ts`: the reveal and move quips (C-SITES' file in Batch C);
   - `systems/desk.ts deskControlLine`;
   - `styles/game.css`: the COMMS tag rules and the ticker tag. CONTROL's tag is plain, and PAL's is a filled accent tag
     with accent-bright words.

   `CommsWindow.ts` and `ObjectiveStrip.ts` needed no code: rows and the ticker already carry `speaker-<id>` and
   `data-speaker`, and PAL gets the sys typing tick with no chime.
5. **Not built:** the title and RUN END `PAL · DEADPAN` line (OPEN-DECISIONS 147, not B-VOICE's screens), and the INSPECT
   card. `COMPANION_FULL_NAME` is there for it.
6. **Tags.** The desk's and the PACKET's control tags now read `PAL` (`MAP_TEXT.desk.controlTag`, `packet.controlTag`).
   The TRAINING tag stays `ARRIVAL CONTROL`. §3.2's table put it with the P lines, but both of its lines (`controlFirstVisit`,
   `controlV3`) are O lines, and a PAL tag over CONTROL's words would mislabel them.
7. **Word choices beyond the table's samples:**
   - `LICENCE_RENEWED_REPAIR` is `REPAIR licence reissued.`;
   - `controlThanks` is `Compliance noted.`;
   - the restricted skill rows read `Caretakers train their own`;
   - the memo subjects are `Welcome, Unit 47`, `Policy reminder`, `Policy reminder (second notice)`, `Arm complete` and
     `Report received: KESTREL`;
   - the lost run's epilogue line is `Thank you, Unit 47. A replacement is on its way.`;
   - the welcome keeps the flattery as a form line: `You are rated our most capable caretaker.`
8. **Logs.** Only the quoted CONTROL turned cold (046's 05, 031's and 038's quotes). The units' own `:)` and their
   reported praise stay (OPEN-DECISIONS 149).
9. **Comments left stale in others' files.** Several comments still quote the old smiling lines: `repository.ts`,
   `types/repo.ts`, `DeskTabs.ts`, `RepositoryWindow.ts`, `DeskScreen.ts`, `TransmitScreen.ts` (header), `finale.ts`,
   `hollow.ts`, `hollow-deal.ts`, `licences.ts`, `lineage-boot.ts`, `garble.ts`, `tuning.ts` and `ships.ts`. They are
   comments only, and are left to the owners to avoid conflicts.
10. **05-story.** §3.4 is redrafted as "The two voices", marked DRAFT, with a list of what §1.4, §3.5, entries 03 and 11, and
    §3.12 still need from the story's owner.
11. **Tests, on a loaded machine (load average 17–35 on 4 cores).**
    - `typecheck` is clean.
    - The quick tier ran 228 passed, 0 failed, but in 573 s: the 300 s run budget failed on the load alone.
    - Six e2e scenarios fully passed: `playthrough` (279/279), `map-desk`, `survey`, `run2` and `traces`.
    - `residents` failed different timing checks on each of two runs (the receiver bypass's frames, HERON's SCAN, MEND);
      every voice check in it passed.
    - `ending` fails `[ENTER] skips THE LAST LANDING` the same way on b01cf61, before this track.

## Deviations (B-DESK)

Built on `b-desk` from b01cf61 (Batch A merged). §3.6's merge is built: one REPOSITORY, FROM EARTH over COMPILE HERE, with
the cycles explained in the world. Each item says what differs from §3.6 or §4, and why.

1. **Where the cycles come from and go: a ledger, not more prose.** COMPILE HERE's head is the bank (`9 CYCLES`, VT323),
   with §3.6's hover word for word (`CYCLES: time your Core spends learning from your own flights. You earn them by flying
   and landing.`). Under it one signed row per source and spend, adding up to the bank:
   `+3 CARRIED OVER` · `+6 HALCYON · ARRIVED +1 · LANDED 83% +4` · `+2 CORE RESERVE` / `+4 taught by BARNABY` /
   `+2 SALVAGE` · `−4 AUTOBURN v2` with UNDO. The rows are derived from `RunSkillState` (earned, grants, bought, pending) by a
   new pure file, `systems/cycles-ledger.ts` (B-DESK's; not in §4's list). It throws when the rows do not add up to
   `bankOf`. The purchases' rows **replace** the TRAINED AT THIS DESK section and its UNDO, the first desk's `+2 CYCLES`
   top-up line and `2 CYCLES · SAVED FOR NEXT TIME` (the bank says it). The head's `FROM YOUR FLIGHTS · 1 CAPTURE` line goes
   too: the TRAIN bar still says `from your 1 capture`.
2. **The report's line.** §3.6 wrote `+3 CYCLES · from 2 pods landed and the orbit`. Cycles are not counted in pods (03
   §3.1: ARRIVED +1, then +1 per full 20% of the landing's points), so the line keeps the rule and says what cycles are for:
   `+5 CYCLES TO COMPILE · ARRIVED +1 · LANDED 83% +4`, `+6 CYCLES TO COMPILE · PERFECT LANDING`, `+5 CYCLES · NO DESK
   AHEAD`. Its breakdown is the ledger's row for that ship, word for word (`TRAINING_TEXT.report.earned`, shared), and its
   hover is the bank's. The LOST card (`BurnResult.ts`) reads the same `cyclesReport`, so it says it too. The first-pick
   top-up reads `+2 CYCLES · CORE RESERVE`, the ledger's word for it (OPEN-DECISIONS 151).
3. **Which grants are "this visit's".** A grant is shown as its own row when it carries this visit's number
   (`CycleGrant.visit === visitNow`), else it is CARRIED OVER. Today the +2 CYCLES salvage card is granted at the TRANSMIT ▸
   *before* the desk, with the previous visit's number, so it reads as CARRIED OVER. **At B-ORDER's merge** it is granted
   at LEAVE ORBIT's pick (§3.3.2), this visit, and gets its own `+2 SALVAGE` row with no change here. The sum is right
   either way; `skills/cycles` checks both forms.
4. **The halves and the keys.** `ui.deskWindow` says which half has the keys: `'repository'` is FROM EARTH ([1]–[7]
   request a row), `'training'` is COMPILE HERE ([1] [2] pick a card, ↑ ↓ step the grid, ENTER trains an armed cell). So the
   alias is not only kept, it is the half: the codec, `deskUiOnOpen` and every TRAINING key work unchanged.
   - [R] and [T] open their half scrolled to it, or go back to the card when it already has the keys. [R] from COMPILE
     HERE moves the keys up (and disarms a picked cell, `openDeskWindow`'s rule), and [T] from FROM EARTH moves them down.
   - A click inside a half gives it the keys without scrolling, before the half's own handler, so a clicked cell is armed
     for ENTER as before.
   - Each half's head shows its key (`FROM EARTH [R]`, `COMPILE HERE [T]`), lit while it has the keys, and the other
     half's number keys dim to 35%, since [1]–[7] belong to one half at a time.
   - `#deskScreen`'s `data-tab` stays the store's id (`'training'` on COMPILE HERE), because the `playthrough`,
     `resume` and `run-flow` drivers branch on it. A new `data-half` (`earth` / `compile`) drives the styling.
5. **The tabs.** CARD / REPOSITORY [R] / INBOX [I]. The REPOSITORY carries two badges: the request (`Mv`, or `:)`), then
   the unspent cycles (`6 CYCLES`), which pulse while the tab is closed (03 §4). The first badge is still
   `.desk-tab-badge`, so the e2e readers of the request badge did not change. `DeskTabs.ts shownTab` maps the alias.
6. **Less text in FROM EARTH.** The AVAILABLE heading goes (the half's head is FROM EARTH), as does
   `PICK A SHIP TO SEE WHEN A FILE GETS THERE` (A-WORDS flagged it). `ONE REQUEST PER BEAM` moves from the foot into the
   head. IN TRANSIT shows only when something is in transit (`NOTHING ON THE WAY` goes). RESTRICTED keeps the two system
   files. `REPO_TEXT.window.available`, `noShip` and `nothingInTransit` are deleted, and `fromEarth` and `key` are added
   (the `window` block was A-WORDS's in Batch A and has no Batch B owner; B-VOICE's `recommended` lines are untouched).
7. **The order and the width.** FROM EARTH sits above COMPILE HERE, as §3.6 has it. The run's first desk opens on COMPILE
   HERE (`deskUiOnOpen`'s `'training'`), scrolled to it. The right window widens to 620 px (540 under 1440) whenever the
   REPOSITORY is open, not only on TRAINING, so the chart is narrower while requesting. On a phone the sheet is 78vh for
   the REPOSITORY (TRAINING's height), and the halves scroll inside it.
8. **Words.** `TRAINING_TEXT.tab` and `pendingTitle` are gone. `title` is the string `COMPILE HERE` (the unit's name is in
   the desk's head already). New: `key`, `bankWhy`, `ledger.*`, `report.earned`, `report.perfectWord`. `onTheHouse` adds
   `· CORE RESERVE`.
9. **Files outside §4's list.**
   - `systems/training-model.ts`: the `title` line, its `unitName` import, and the `CyclesReport.line` comment. B-ORDER
     owns its link uses, which are elsewhere in the file.
   - `styles/responsive.css`: the phone TRAINING rule's `[data-tab='training']` sheet height moved to `desk.css`, and its
     padding is now the merged host's.
   - `data/repository.ts`: only RESTRICTED_ROWS, as §4 says, and the unused `SKILL_IDS`/`SKILL_TREE` import.
   - The e2e scenarios `map-desk` and `phone`.
10. **Left for their owners.**
    - `RESTRICTED_WHY.skill` (`Train it yourself :)`) has no reader now. It is B-VOICE's line, so it is left for B-VOICE
      to delete. `RestrictedId` keeps `skl:${string}` (types/repo.ts); nothing makes one now.
    - `TrainingModel.demos`, `topUp`, `saved` and `pending` are no longer drawn. `pending` still feeds the ledger's UNDO
      flags through `trainingPending`. They are kept because the model is the lead's and the suites read them; drop them
      when training-model is next touched.
    - `TRAINING CYCLES` is still said twice outside this track. `resident-ui-text.ts`'s report gift reads
      `+4 TRAINING CYCLES · taught by BARNABY` (the `residents` e2e pins it), and `PACKET_SKILL_TEXT.cyclesEffect` reads
      `2 more TRAINING CYCLES to spend at the next desk` (the card moves to LEAVE ORBIT, B-ORDER's). Both would read
      better as `+4 CYCLES · taught by BARNABY` and `2 more CYCLES to compile at this desk`.
11. **Tests.** Unit suites: `skills/ui-models` (the head word, the ledger at desk 1 and 2, the report's new line, the word
    list), `skills/cycles` (the CORE RESERVE ledger and the salvage desk), `skills/training-flow` (desk 2's ledger with
    UNDO only on the last of a skill, a reload's ledger), `map/repository` (RESTRICTED: two rows), and `map/desk-models`
    (`shownTab` and the disarm on moving to FROM EARTH). The plan's `desk` e2e scenario needed no change. `map-desk` checks
    the merged screen: the half, the head and key, the scroll, the ledger in and out, [R] and the click. `phone` checks
    the head and ledger on screen in the sheet. `map-desk`'s wait for the first pick's 1.5 s bar is 10 s, not 4 s. The bar
    runs on wall frames, and headless Chromium here draws the desk at 2–4 frames a second. At b01cf61, before this track,
    the bar took 4.6 s, so the 4 s wait was already flaky.

## Deviations (B-TIME)

Track B-TIME (notes 6 and 24, OD 123 and 124), built on `b01cf61`. Where the build differs from §3.1, §4 and §5:

1. **A third kind of stop, WAIT** (OD 155). §3.1 made AUTODROP's windows and its launches SOFT. A dwell and then on would
   jump past a window the controller has not flown yet, and skip its launches. So a window an armed controller flies
   (`activeLandingController` not null), and its next launch, hold the hold without spending it: the director's TACTICAL
   plays the window, and once it has gone by the hold goes on by itself. AUTODROP v3's plan is one hold from [G] to its
   last row (the suite's section 4: four pods down in one window, then capped while they fall, no second press).
2. **Refusals spend the hold** (OD 156). §3.1 lists the refusals "as today", struck out. Here a refusal that arrives
   mid-hold (an alarm, the first ghost burst, the kid's own burn, HOLD STEADY, a hand window opening, the landing over)
   also ends the hold, like a HARD stop: a hold that resumed by itself afterwards would carry the kid past what the
   refusal was for. A burn input pressed under the hold (SPACE, BURN, [B]: `stopSkipOnPress`) spends it as `STOPPED`.
   PAUSED only freezes it. A later ghost burst running between two ticks waits (no spend).
3. **Not SOFT stops: a full LZ's window, a later ghost burst, a drag kick** (OD 157). None was a stop for a SKIP before,
   and each would add a 1.5 s dwell several times a loop. The leg still flies every later burst whole (the waypoint) and
   splits its jump at each kick. The engine-fault bursts (`ghostRefusesSkip`) run capped at CRUISE as planned.
4. **A CRUISE cap on a CRUISE coast waits** (OD 158). When the only cap is CRUISE's (engine fault, the first seed, a
   coast-tied wake) and the director runs CRUISE there anyway, the hold is struck out with the reason and waits, rather
   than show FAST at the warp the coast already has. It runs FAST where the director would hold TACTICAL (pods falling).
   `map/ghost-noswap`'s "no `hold [F]` while the bursts are due" holds unchanged.
5. **The zone stop and the fresh press.** A zone entry the hold stopped at HARD is met and that entry counts as passed,
   so the fresh press runs straight into the capped pass (no soft dwell on top of the stop: the suite's first FAST tick
   comes 0.05 s after the press). A press made with an unmet zone already inside its lead spends at once (the kid sees
   `BELT AHEAD`); the next press runs it capped. "Met" is any entry on this ship, by the hold or not.
6. **The capped warp.** A zone's warp is fixed when its pass starts (`max(CRUISE, to the exit / FF_ZONE_PASS_WALL_SEC)`,
   from the lead), not recomputed each tick (that would shrink with the rest of the pass and never end). It is also eased
   onto the next stop's lead (`toLead / SKIP_EASE_OUT_SEC`, at least TACTICAL) so a capped run never overshoots a HARD
   stop by a tick. On LAST LIGHT's 6,000 × 15,000 km loop: ×1.3K, about 3,500 game s a pass in 2.7 wall s, 14–19 hits a
   pass (the belt's own rate: at most one a tick over 55 ticks).
7. **The ramp and the leg's length.** `FF_DECADE_SEC` is a floor on the rise rate (the max of it, the director's glide and
   the SKIP's own ramp), for legs and capped runs alike. A new constant, `FF_LEG_WALL_SEC` 2 (a leg's warp is the gap to
   its stop's lead / 2): with SKIP_DIVISOR's 4 a 4.5-tactical-day WAIT took 5.95 s; at 2 it takes 4.95 s. And
   `FF_PASSED_MATCH_TAC` 60: a passed soft stop is recognised again within a minute of tactical time.
8. **Words** (OD 159). The tails are `· hold [F]` (the flight's ` · [F] SKIP`, the landing's ` · [F] to SKIP`), MIND
   CLEAR is `MIND CLEAR — hold [F] to LZ-B`, the button `▸▸ HOLD [F]`, the pace label `FAST ×n ▸▸` for a SKIP leg and the
   capped pace (a controller's own SKIP reads FAST too). The hold's stop words are `pace.ts FF_TEXT`: `BURN AHEAD`,
   `LZ-B WINDOW` (an open hand window reads the same), `FLYING AWAY`, `HOLD STEADY`, `NOTHING AHEAD`, `ENGINE FAULT`,
   `STOPPED`; zones keep `BELT AHEAD`. The strip's tail shows when holding would fast-forward
   (`fastForwardBlockReason`), so it is now offered inside a zone and in a met zone's lead, where the tap SKIP was refused.
   It stays up while the kid's own hold runs (a driver that holds F while the strip offers it never lets go mid-leg),
   and, as the tap's tail did, hides while a SKIP the kid is not holding for runs (`fastForwardOffered`: a controller's, a
   headless kid's tap). `skipBlockReason` keeps its meaning for the controllers and the harness kids.
9. **The phone's control** is the header button itself (the phone already used it): held by a finger with the pointer
   captured, `touch-action: none` and no long-press menu (`game.css`, by the `.skip-btn` rules). `keycaps.ts` already draws
   [F] as `▸▸`, so the tail reads `hold ▸▸` there.
10. **Files past §4's list, each for one line or block.** `state/schema.ts` (the `'fast'` Pace); `systems/director.ts` and
    `debug.ts` (the landing context's `skipAvailable` reads `fastForwardBlockReason`; `__ap.fastForward()` for the e2e
    drivers); `styles/game.css` (the button's hold rules); `tests/unit/wp1/harness.ts` (below); and the word literals in
    22 unit files (`[F] SKIP` and `[F] to SKIP` to `hold [F]`, the pace label in `wp1/hud` and `lead2/coast-skip`).
11. **The harness kids tap the engine.** `tests/unit/wp1/harness.ts`'s `press('KeyF')` calls `requestSkip` (its refusals
    and the `refused` event included) instead of a keydown and keyup, so the 42 suites whose scripted kids press F keep
    flying the SKIP engine unchanged, as §3.1 expected; `keyDown('KeyF')` … `keyUp('KeyF')` is the real hold.
12. **`map/arm-parity`'s run digest is re-recorded** (8ceb50b18060dcb5 → b0f45b2087cb0757), with what moved it in its
    comment: the landing's strip offers `· hold [F]` wherever holding fast-forwards, so on LAST LIGHT's final landing the
    strip-following kid's reaction clock restarts at other moments and its first launch comes 0.15 AI s earlier. Only
    LAST LIGHT's end moment moves; a diff of the two end states (base `b01cf61` against this track) holds times and
    positions only.
13. **e2e.** `tests/e2e/lib.mjs holdKey(page, code)`: `set(on, gameHeld)` keeps a key down across polls and presses it
    afresh when the game let go of it (a modal releases held keys; an auto-repeat is never a press). `playthrough`,
    `skills-4cde-landing` and `survey` hold F while the strip shows `[F]`, and let it up as the ship ends.
14. **Requests to other tracks.**
    - B-DROP: `autodrop-text.ts:63` `· [F] BETWEEN THEM` → `· HOLD [F] BETWEEN THEM` (§4's note); `landing-guidance.ts`'s
      comment table (`:68`, `:80`, `:322`, `:341`) quotes `[F] to SKIP`.
    - Whoever owns `skill-text.ts`: the comment at `:26` (` · [F] SKIP`) and `AUTOBURN_REFUSAL.skipping`'s
      `STOPS THE SKIP FIRST` (AUTOBURN's [B] under a hold: the hold is spent as `STOPPED` first, then that word shows).
15. **The checklist.** Items 54–56 under "Playtest 1, Batch B (B-TIME)" at the end of `docs/playtest-checklist.md` (no
    Batch B owner): the held button, note 6 and note 24. Another track's items there may conflict textually.
16. **Tests, as run on a machine at load 19–37.** The new suite `pace/fast-forward` (20 checks, about 6 s of CPU) and §5's
    list pass. The quick tier: 215 passed; its other failures were the per-suite and tier budgets (17 suites over 90 s,
    1,701 s in all, from the load) and one timing check, `skills/autodrop-plan`'s R18 memo at 1.08 ms against 1 ms, plus
    `map/arm-parity`, re-pinned above. `survey` (26/26) and `skills-4cde-landing` (14/14) pass. `playthrough` 274/279:
    every flight and landing ends by the strip with F held; the 5 failures are ship 1's first DESK, whose TRAIN bar fills
    by animation frames (`TrainingWindow.ts`, a wall-time step capped per frame) and did not land inside the 4 s the
    scenario waits under that load, and the four desk checks after it.

## Deviations (B-DROP)

Track B-DROP (note 9, 23's strip tail, OPEN-DECISIONS 120 and 133), built on `b01cf61` (Batch A merged). §3.4.2 is built as
designed: [L] is always the plain manual launch (`landing-controls.ts launchDown` is `playerLaunch`, no keyup), [G] arms v1
CENTRE for one window (`AutodropArm 'centre'`), the POD BAY and the phone bar carry the arm button, and GET READY and LAUNCH
NOW carry ` · or [G] AUTO`. Item 120's two fixes are in. Where the build differs, and why:

1. **v1's arm, its end.** [G] at v1 arms the volley of the next sure window of any LZ with room (`centreVolley`, the old
   `heldVolley`, centred). It disarms itself once it has launched and has nothing more to fly in the window open now (the
   volley is over, the next pod's drop is WIDE, the LZ is full) or that window has closed: review M1's rule for the hold,
   kept. Its end is a new `AutodropEnd` **`'centre-done'`**, said on the TERMINAL as `AUTODROP · B +3 · [G] FOR THE NEXT
   WINDOW`. The codec's `AUTODROP_ENDS` list (`save-codec.ts`, B-ORDER's file) gained the value in one line: `end` stands at
   rest at a save point, so without it a save after a v1 window would be refused. No bump: the codec only accepts one more
   word. An arm that has launched nothing (the kid stayed in the MIND through its window, every pod WIDE) stays armed for the
   next sure window.
2. **v1 from the MIND.** [G] arms from either screen, as for v2 and v3, but v1 still flies only on the SHIP screen (R8). While
   it is armed in the MIND and its window is near or open, the strip says `AUTODROP v1 FLIES FROM THE SHIP SCREEN — [TAB]`
   (a new row id, `landing-AD-mind`).
3. **The strip's v1 offers.** Besides §3.4.2's tail on GET READY and LAUNCH NOW (`withLaunchTail` in `landing-guidance.ts`,
   only on the SHIP screen, only while that window is v1's to fly), the L13 waits carry ` · [G] AUTODROP` for v1 too, as
   they do for v2. AD-hold and AD-held are gone. There is no AD-done row for v1: the strip goes straight back to the
   window's own rows, so a WIDE pod's `press [L]` is not hidden for AUTODROP_DONE_LINE_SEC.
4. **The arm button for every version.** `AUTO · CENTRE [G]`, `AUTO · PASS [G]`, `AUTO · PLAN [G]` (AUTOBURN's `AUTO ·
   GREEN [B]`); armed, every version reads what it waits for (`ARMED · LZ-B · 2 PODS`, or `ARMED · [G] CANCELS` with none).
   The plan named the label for v1 only; v2 and v3 had `[G] AUTODROP` / `[G] CANCEL`. One look for one button. The key line
   above it says `AUTODROP ▸ CENTRE [G] · ONE WINDOW` and, armed, `AUTODROP CENTRES THIS WINDOW · [G] CANCELS`.
5. **Files outside §4's list.** The POD BAY's model is `landing-hud.ts autodropBayModel` (no Batch B track owns that file):
   the key line, the button and the removal of LAUNCH's `AUTODROP HOLDS FOR THE CENTRE` status. `save-codec.ts` (item 1, one
   line). `tests/e2e/run.mjs` (the scenario's one-line description). `autodrop-plan.ts` (the cue anchor, item 7): DROP's
   file from slice 4, named in C-SITES' row as B-DROP's.
6. **R4's lesson.** `autodropTutorialDue(state, 1)` is always false; `tut-autodrop-v1` stays in `script.ts SKILL_4CDE_RULES`
   with its `[L]` key, never due (that table is not B-DROP's; the lead can drop the v1 entry). `AUTODROP_TEXT.tutorial.v1`
   is reworded for the table's sake. The refusal `ONLY v1` is gone; v1 with nothing to centre says `NOTHING TO CENTRE — NO
   POD CAN GO YET`, or `NO SURE WINDOW …` as v2 and v3 do. A v2 → v1 step mid-pass disarms and says `AUTODROP v2 → v1 —
   [G] arms one window at a time`.
7. **Item 120, the cue.** `volleySlots` takes an anchor, `'centre'` or `'cue'`. v2's pass volleys (`passVolley`) and its
   POD BAY rows (`passRows`, so the prefilled split counts the same slots) start at the sure part's opening plus the learned
   offset, each later pod a cadence on: the slot a hand kid gets from `LAUNCH NOW`, as `dropDemoOffset` measures AIM. v1
   CENTRE stays centred (its name), and so does **v3's plan** (item 120 named v2; its rows are pod-specific sure spans and
   their centring was not part of the finding). OPEN-DECISIONS 162 asks whether v3 should follow.
8. **Item 120, no WIDE [L].** While anything is armed (v1, v2 or v3) and it still has a launch to fly, the open window that
   is a WIDE DROP this pass (the next pod's whole dot does not fit and its sure part is not still ahead) shows AD-armed's
   wait (`AUTODROP ARMED — next LZ-B ×2 in 0:40 · [G] to cancel`) instead of L5 or L3b. Two exceptions, both found by the
   sweep (OPEN-DECISIONS 163):
   - **an arm with nothing left to fly** holds nothing back (VESPER's busy kid with v2 landed 0% in 1,500 s: a pass whose
     every window was WIDE, re-armed at every PASS DONE, held every WIDE [L] back);
   - **v3's pin** (review M2, OPEN-DECISIONS 5): in the window of an LZ its plan does not use, LOAD NEXT is pinned to a pod
     the plan holds for no window, and that [L], WIDE or not, stays the kid's.

   A sure window the armed machine does not fly (an LZ outside v2's pass) still offers its [L].
8b. **Two fixes the sweep forced.**
   - **v2's [G] needs a count that fits.** The kid's counts are kept between passes, so [G] armed a pass of counts that fit
     nothing this pass (the deadlock above). [G] now arms v2 only when a row has a count that fits (the tails' rule), else
     it refuses as before (`NO SURE WINDOW …` / `NOTHING SET`); PASS DONE offers [G] by the same rule.
   - **A short sure part's one pod.** `volleySlots`' fallback (one pod, when the offset pushes even one out of a short sure
     part) aimed at the middle of what was left from now, which receded half a tick every tick: on VESPER (a 0.28 tac s sure
     part) v1 said `LAUNCHING` through the window and sent nothing. The hold had hidden it (the kid let go and pressed [L]);
     an arm does not let go, and with it armed the WIDE [L] was held back too (the sloppy kid landed 25%). It now aims at the
     middle of the sure part, or goes at once once that has passed. This moves v3's plan rows on such windows too.
9. **The words for B-TIME.** `AUTODROP ARMED · THE PLAN: 2 PASSES · HOLD [F] BETWEEN THEM` (`autodrop-text.ts radio.
   armedPlan`), as B-TIME asked. The suites and the e2e scenario still press [F] as a tap where B-DROP touched them; B-TIME's
   hold drivers replace those at the merge.
10. **Measured, before (`b01cf61`) → after.**
    - `skills/autodrop-sweep` at full depth, all four kids (landed % against the same kid's v0; the rows not named are
      unchanged): HALCYON sloppy v1 −20 → 0; CORMORANT busy v2 0 → +11; VESPER healed v2 +6 → +12, quiet v2 +12 → +31,
      sloppy v2 −6 → +7, busy v1 +12 → +6. `drop.worst` −20 → −6 (VESPER sloppy v1, as before). The one loss, VESPER busy
      v1 (81% → 75%, one pod of 16), was not traced; the busy kid's REPAIRs move its windows, and v1 now waits armed where
      the hold let go.
    - `npm run balance:report -- --quick --only drop.,worth.autodrop` (24 seeds; the leave-one-out's AUTODROP row):
      `worth.autodrop.v1` −0.11 ±0.08 (LOW) → **0.10 ±0.06 (OK)**; `drop.Δpods.CORMORANT.sloppy.v1` 0% → 0% (LOW: as
      arrived, every CORMORANT window is WIDE, so there is nothing to arm); `drop.Δpods.VESPER.sloppy.v3` 19% → 19% (OK);
      `drop.worst` −6% → −6% (LOW). `worth.autodrop.v3` is a full-profile row (`—` in quick).
    - Run while the machine was loaded (load 20–40 on 4 cores), so wall times are long; the numbers are the harness's, not
      the clock's.
11. **Tests.**
    - `skills/autodrop-flow` re-scoped: v1 by [G] (the tail, the POD BAY model, the arm, the centred window, 'centre-done',
      [L] plain, [G] cancels, armed from the MIND); v2's pods at their cue (`dropDemoOffset` within 0.2 tac s) and its thread
      wait measured against the cue; R5 and the steps down armed by [G].
    - `skills/autodrop-review`: M1 with v1 armed; OD 120 on HALCYON (v2, pods after the first WIDE) and in B2 (v3); M4's v2
      also refuses the kid's own counts when they fit nothing (8b). `skills/landing-v3`'s M2 (v3's pinned [L]) passes
      unchanged.
    - `skills/autodrop-plan`: `volleySlots` from the cue (four checks) and the new words at their worst.
    - `skills/autodrop-sweep`: the v1 kid presses [G] where it is offered, [L] otherwise.
    - `landing/table`: the launch tail on L4 and L7 (and never on L5 or L6), AD-armed over a WIDE window.
    - `landing/bay` (the bay's physics) needed nothing; the POD BAY's AUTODROP model is checked in `skills/autodrop-flow`.
    - e2e `skills-4cde-landing`: v1 by the POD BAY's arm button (a click), BULLSEYE, its disarm, then a plain [L].
    - **Runs.** Typecheck clean. The quick tier once: 216 passed, 15 failed, every one on the time budget only (the tier
      took 1,500 s at load 20–40); the 15 run alone all pass their checks, and `tsc-tests` is clean. e2e
      `skills-4cde-landing` alone: 16/16.
    - **Not B-DROP's, left for their owners:** `wp12/playthrough.ts`'s landing kid still has its `hold [L]` branch. It is dead
      now and harmless: its kid presses [G] at GET READY's tail and the waits' ` · [G] AUTODROP`, and [L] at LAUNCH NOW.
      `AGENTS.md`'s "What's built" still says `v1 CENTRE (hold [L] …)` and lists item 120 as a next step. The playtest
      checklist has no B-DROP items yet.

## Deviations (B-ORDER)

Built on `b-order` from b01cf61 (Batch A merged): §3.3 whole (notes 5 and 20), save v10, the title's resume line. Where the
build differs from §3.3, §4 and §5, and what it touched outside its §4 list:

1. **The new flow.** `continueAfterReport` / `continueAfterLoss` → `run.ts openLeaveOrbit(extra)` (phase `'leave'`, both
   clocks stopped, the tool put down, the salvage dealt into `run.leave`, `archiveShipDone`, SHIP DONE) → `leaveOrbit`
   (ENTER: the pick required while cards wait, its grants, then `openDesk()`) → `openDesk` (phase `'desk'`,
   `deskUiOnOpen`, SHIP DONE again) → `setCourse` / `goTransmit` (now refused off the desk) → the PACKET, or the beam at
   once → `transmitNext` → `startShip` (clears `run.leave`). `openDesk` lost its `extra` argument: `openLeaveOrbit` stores
   the extras. The final ship still ends the run at its report; `openLeaveOrbit` throws there.
2. **`run.leave` holds the deal as well as the pick** (`{ offer: DraftCard[]; pick }`; the plan had `{ pick }`). The deal
   is made once, from the ship's end state, and kept: a deal made again at the desk would read the desk's pending purchases
   (`leftoverSkill`) and could differ. The codec reads each card field by field. `TransitPlan.offer` is gone;
   `goTransmit` copies `run.leave.pick` into `TransitPlan.pick`, and `transmitNext` checks that the two agree.
3. **The deal without a hop** (`draft.ts dealDraft(state)`, `leaveRoom`): a file card must fit the largest room in reach,
   less its floor and the unit's files. Deliveries no longer count, because no hop is chosen yet, and `toFinal` went
   (OD 166, 167). The seed is unchanged (`visitRng(run, 'draft')`), so a reload at LEAVE ORBIT deals the same three; the
   save keeps them anyway.
4. **The grants land at ENTER, not at the pick.** The plan said the +2 CYCLES grant applies at the pick, but the pick can
   change until ENTER. +2 CYCLES becomes a `'salvage'` grant at this visit. A departed resident's skill card is granted at
   ENTER too (`applyLeftoverPick` moved from TRANSMIT ▸; OD 168). `commitTraining` no longer grants the salvage. The
   branch latch and the first-pick top-up moved from `openDesk` to `openLeaveOrbit`, before the deal and the salvage
   (OD 167).
5. **LEAVE ORBIT's screen** (`components/run/LeaveOrbitScreen.ts`, model `systems/leave-orbit.ts`, words
   `data/leave-text.ts`, input layer `'leave'` after `'report'`):
   - the title `LEAVE ORBIT`, or `LEAVING <SHIP>` after a lost ship (OD 129; `landing-rules.ts leftWithoutOrbit`: any
     outcome but `locked` and `partial`), then `<SHIP> · WHAT IS LEFT ON BOARD`, and a lost ship's way out (the PACKET's
     `whyLine`);
   - `SALVAGE · TAKE ONE WITH YOU` (a departed resident's `LEFT BEHIND BY …`), the old draft's cards and keys, and
     `TAKE IT ▸ [ENTER]` / `TAKE ONE FIRST`;
   - it wears the PACKET's `.tx-*` look; its few own rules are in a new `styles/leave.css`. The picked card lifts away for
     `LEAVE_TAKE_SEC` (0.45 s, a new tuning block) before the chart opens;
   - the strip reads `TAKE ONE WITH YOU — click one or press [1] [2] [3], then [ENTER]` (`director.ts`), and the header
     crumb reads `LEAVE ORBIT` (`flight-hud.ts`);
   - the LOG READER's entry 01 now opens over LEAVE ORBIT, the first screen after the report (`story-log.ts
     firstLandingKeyDue`). BEAM OUT's blackout plays there too, not at the desk (`desk.ts leaveBlackoutSec`; the blackout
     in `deskOpening` is now 0; OD 172).
6. **The PACKET only when it asks** (`transmit.ts packetAsks`, `TransmitModel.asks`; OD 169). The four questions are the
   plan's; `'pack-as'` is read as a squeezed room with a skill chip that has a lower level. With none, the PACKET opens
   already beaming (`TransmitScreen` `direct`): no ◀ CHART, no TRANSMIT ▸, and the chips stream out under the light-years.
   The PACKET's draft is gone (`#txDraft` out of `index.html`). A SALVAGE line under the headline names the card taken.
   A-LAND's +12 room note moved there (for the taken card only) and onto the SHIP CARD as a `salvage` row (OD 170). The
   SHIP CARD's fit line and TRAINING's preview count the taken card.
7. **No link** (note 20, plan §3.3.4). Every reader is gone or moved:
   - `linkBlocksFor`, `Hop.linkBlocks`, `LINK_BASE_TENTHS`, `LINK_PER_LY_TENTHS`;
   - `roomFit`'s `link`, `linkLost` and `overLink` (`carried` is the charge held);
   - `packUnit`'s link argument, and `Packet.linkBlocks`, `overLink` and `chargeCarried` (all the charge crosses: it is
     `chargeHeld`); `layoutCarried`'s link throw; `freshUnitRacks`' link;
   - `TransitPlan.linkBlocks` and `chargeCarried`; `DraftContext.linkRoom` (now `fileRoom`);
   - the PACKET's link bar (`#txBar`, its packet line, `n LEFT BEHIND` and its hover), `PacketChip.chargeGain`, and
     `TransmitModel.link`, `chargeCarried` and `packetLine`;
   - `TRANSMIT_TEXT.packet`, `over` and `overTitle` (`script.ts`; no Batch B owner);
   - `MAP_TEXT.card.beam`'s `LINK n`, `card.fit`'s `LINK LEAVES n` and `TOO BIG FOR THE LINK`, `packet.overLink` and
     `packet.linkLabel`;
   - TRAINING's `preview.link` (`training-text.ts`) and its link binding. `TrainingPreview.binding` stays, always
     `'room'`, so the data attribute in B-DESK's `TrainingWindow` is unchanged;
   - `desk.ts`'s fit tone and beam row, `debug.ts`' three uses, and `checkLockedFilesFit`, which checks TIGHT's room only.

   The room bar takes the link bar's place; its CSS variable is now `--bar-blocks`. `ArrivalReport.chargeCarried` stays,
   because it is saved: it is the charge held. OD 108's "link slope" lever is gone (OD 174). The uninvited chip's "rides
   free" was already A-WORDS' `NOT IN YOUR PACKET`.
8. **Save v10** (`RUN_SAVE_MIGRATIONS[9]`):
   - the migration: the hops on the route drop `linkBlocks`; `run.leave` is `{ offer: [], pick: null }` (a v9 desk resumes
     with no pick: OD 171); the resume line gains `stage` (`boot`, `leave-orbit`, `leaving`, `desk` or `report`), worked
     out from the run;
   - SHIP DONE's payload phase is `'leave'` or `'desk'` (`POINT_PHASES`);
   - the codec checks: the cards' fields, and no card dealt twice; no pick at `'leave'`; at `'desk'`, a pick among the
     cards dealt (or none when none were dealt); no salvage at any other point; the payload's phase is the run's; the
     stage is the run's;
   - the shape pin holds v10 (`+leave`, `+leave.offer`, `+leave.pick`; the hop and the stage sit below its depth);
   - the fixtures `run-save-v9-ship-done-halcyon.json`, `run-save-v9-beam-kestrel.json` and
     `run-save-v9-ship-done-lost.json` were dumped through the game's own save path before any change (977fdce);
   - B-VOICE asked for no persona field, so v10 holds none.
9. **The title** (`systems/title.ts`). The resume line reads `RESUME · UNIT-047 · SHIP 2 DONE · LEAVING ORBIT · 2378`
   (`LEAVING HALCYON` after a lost ship; `… AT THE DESK …` once the pick is taken), from `MAP_TEXT.save.resumeLeave`.
   `runs save between ships` is cut (OD 173): `MAP_TEXT.title.savesBetweenShips`, `TitleModel.saveNote`, `#titleNote`, its
   lines in `TitleCard.ts` and its `game.css` rule. `desk.css`'s `.title-note[hidden]` rule is left for B-DESK (its file);
   it now matches nothing.
10. **Files outside the §4 list**, each a reader of the order or the link:
    - `director.ts`, `flight-hud.ts` (`headerCrumbs`), `BurnResult.ts`, `story-log.ts`;
    - `landing-rules.ts` (`leftWithoutOrbit`), `resident-left.ts` (its `draftContext` call), `upgrades.ts`
      (`DraftContext`), `training.ts` (`commitTraining`);
    - `main.ts` (the mount and the stylesheet), `TitleCard.ts`, `game.css` (two rules);
    - `desk.ts` beyond its rows (`deskOpening`, `leaveBlackoutSec`, the `salvage` row);
    - `debug.ts` (`__ap.draft()` reads `run.leave`; new `__ap.leave()` and `__ap.leaveModel()`);
    - `tests/e2e/lib.mjs` (B-TIME's): two new helpers, `leaveOrbit` and `beam`, and `pickCard`'s comment. No F driver is
      touched.
11. **Tests.**
    - New: `map/leave-orbit` (40 checks): the order, the deal with no hop, the pick held through the desk and ◀ CHART, the
      PACKET's four questions and the case with none, SHIP DONE at LEAVE ORBIT and at the desk, RESUME at both, the codec's
      refusals, and the three v9 fixtures migrating, decoding and resuming. `save/resume` adds RESUME at LEAVE ORBIT, and
      `residents/saves` resumes at both points.
    - Deleted with the link: the suite `map/link-over`, and these checks: `hop-math`'s `link 123, 117, 86, 113, 87` and
      `link: 22 LY 122, 25 LY 119, 45 LY 97`; `arm`'s `links run 82–123`; `route-threat`'s `the final hop's link stays
      within 82–123` (and its INFO line); the link values in `run1-roll`, `lastlight-sim` and `desk-flow` (`link 117`);
      `wp7/carry`'s `a narrow link carries charge only up to link − files`; `map/text`'s `packet.overLink` and `card.fit
      leave link` lines. `room-fit`'s `a link-limited unit is not squeezed by the room` and `files over the link: leave`,
      and `skills/ui-models`' `over the link: … LINK 86 · 3 BLOCKS OVER`, are replaced by the room's own case.
    - Deleted with the `toFinal` rule: `skills/cycles`' `never into a final ship` and `residents/left`'s `into a final ship
      both deal plain cards`. Deleted with the meta line: `ui/title-resume`'s six `saveNote` checks.
    - Moved, not weakened: the tight-link checks of `wp7/p2-models`, `skills/packet` and `map/delivery-packet` now squeeze
      the room (the charge the link left behind is now the charge that won't fit); the card checks of `wp8/draft`,
      `wp8/p2/ui-models`, `residents/left`, `skills/cycles` and `packet-room` moved from the PACKET to LEAVE ORBIT.
    - Support: `support/desk leaveOrbit(store, pick?)` and `preferCharge`; `throughDesk` and `setCourseFromDesk` pass LEAVE
      ORBIT with its first card; `repo-fixture`'s `toLeave` and `toDesk` (the +12 card when dealt); `harness7.transmit`
      sails on from LEAVE ORBIT.
    - `map/arm-parity`'s two digests were re-recorded twice, each with what moved it (the link field, then `run.leave`). The
      run's end moved from won-purge to won-merge with the link, and every outcome held with LEAVE ORBIT.
    - e2e: `map-desk`, `run-flow`, `resume`, `playthrough` and `phone` walk LEAVE ORBIT (its look, the LOG READER over it,
      RESUME there in `resume`), and read the PACKET's direct beam where a hop has nothing to ask.
      `residents`, `run2`, `signals`, `survey` and `traces` waited for the DESK after a report, so they pass LEAVE ORBIT
      now (mechanically; `residents`' HERON deck check reads `#loHeading` and `#loCards` instead of the PACKET's draft, and
      `traces`' `beamTo` beams through `beam()` instead of `__ap.transmit()`, which would race the direct beam). They were
      not run: they are outside this track's e2e list. `run2` and `resume` read the title's `#titleNote`, which is gone:
      both now expect no note (`run2`'s `runs save between ships` check now checks that the note is absent).
    - Results: `typecheck` (src and tests) clean. The quick tier ran on a machine shared with four other tracks (load about
      25): 216 passed, and 15 failed on its time budget only (1500 s against 300 s). Each of the 14 suites, and `tsc-tests`,
      then passed when run alone. The e2e runs, one at a time: `map-desk` 88/88, `run-flow` 100/100, `resume` 72/72,
      `playthrough` 274/274, `phone` 134/134.
12. **Not done.** `npm run balance:report -- --quick` was not run; it is the lead's, after the merge (§3.3.4).

## Lead notes: B-ORDER's merge, and Batch B verified

B-ORDER merged last (`git merge --no-ff b-order` onto the B-DROP merge). Where the merge differs from the tracks' own
reports, and what the whole of Batch B measured:

1. **Conflicts, both sides kept.** OPEN-DECISIONS and this plan take B-ORDER's sections after B-DROP's. B-ORDER's
   OPEN-DECISIONS 145–153 are renumbered **166–174**, with their references in its Deviations and two e2e comments. The
   Deviations of B-TIME, B-DROP and B-DESK cited their pre-merge numbers; they now cite the logged ones (B-TIME 155–159,
   B-DROP 162–163, B-DESK 151). The checklist keeps B-TIME's 54–56; B-ORDER's items are 57–60. `debug.ts` and `desk.ts`
   take both imports (PAL's persona and lines; LEAVE ORBIT's model and the salvage's room). `skills/cycles` runs B-DESK's
   ledger checks on LEAVE ORBIT's flow. B-VOICE's words, B-DESK's desk screen, B-TIME's hold drivers and B-DROP's arm
   button needed no hand edits beyond that: B-ORDER's TransmitScreen already read `palLines`.
2. **OPEN-DECISIONS 154 built.** The +2 CYCLES salvage is granted at LEAVE ORBIT's ENTER with this visit's number, so the
   desk it opens shows its own `+2 SALVAGE` row, and the desk after shows it in CARRIED OVER. No ledger change was needed;
   `skills/cycles` now checks each form at its desk strictly, where it accepted either. The card's line reads `2 more CYCLES
   to compile at the desk ahead` (B-DESK's note 10).
3. **B-DROP's note on v10, done.** `AutodropState.held` (always false since B-DROP) and the end `'released'` are gone;
   `RUN_SAVE_MIGRATIONS[9]` deletes `held` and maps a stored `'released'` to no end (with its `endAtAi`; it only held a strip
   line up for a moment). The shape pin's v10 drops `landing.autodrop.held`; the codec refuses either at v10; the v9
   fixtures' migration checks both (`map/leave-orbit`).
4. **A regression found at the merge: entry 01 at a migrated desk.** B-ORDER keyed `046.log`'s entry 01 to LEAVE ORBIT
   only (`story-log.ts firstLandingKeyDue`). A v9 save at ship 1's desk found it at the PACKET in v9, and v10 resumes it at
   the desk, so it was never found. It is now due at LEAVE ORBIT, the desk or the PACKET, before the beam (the landing is
   still the ship's). `opening/calm-ships` checks both: at LEAVE ORBIT on the normal path, and at the desk for a run past
   LEAVE ORBIT without it.
5. **Stale expectations fixed, none weakened:** `map/desk-chrome` (the BEAM OUT blackout is LEAVE ORBIT's now, OD 172: it
   checks `leaveBlackoutSec` both ways); `signals/foundation` (the v8 fixture steps to v9, then on to v10);
   `wp11/p2/views` (CONTROL's verdict has had no `:)` since B-VOICE; it failed on main before this merge too).
6. **`map/arm-parity`.** Both digests re-recorded, with what moved each in their comments. The slices moved only by
   `held`'s removal (with it put back they hash to B-ORDER's `876ea9ad0ab6ac69`). The run combines B-ORDER's link removal
   and LEAVE ORBIT, the earlier B-VOICE/B-TIME re-record, `held`, and the +2 CYCLES card's words. It ends won-merge with
   every ship locked, as on b-order; main ended won-purge.
7. **e2e waits.** The five fixed waits for the first pick's 1.5 s TRAIN bar (`map-desk` twice, `phone`, `playthrough`,
   `run-flow`) use `tests/e2e/lib.mjs waitTrained`, `resume.mjs`'s pattern from ea0d6c8: the press must start the bar within
   2 s, then the purchase is waited for while the bar still fills.
8. **Runs, on a quiet machine (4 cores, load under 1 before each).**
   - `typecheck` and the tests' tsc: clean.
   - The quick unit tier: 233 passed, 0 failed, 15 balance-only skipped, **227 s** (budget 265 s). Nothing needed trimming.
   - The full e2e tier, once: **935/935 in 17 scenarios, 2,038 s**, nothing to re-run. playthrough 275, phone 135,
     run-flow 100, map-desk 94, resume 72, label-hops 40, residents 30, ending 30, survey 26, beam-blue 26, run2 23,
     last-landing 22, traces 19, skills-4cde-landing 16, signals 12, skills-4cde-sentry 11, desk 4.
9. **The balance re-read** (§3.3.4, §4 "Coordination in Batch B"): `docs/phase3/impl/balance-report-playtest1.md`, the quick
   report with a before / after Batch B table against slice 8's. In short: MERGE affordable for COMPETENT 67% → 100% (over
   the band; charge at the choice, median 15 → 44); the arrival charge on VESPER, CORMORANT and LAST LIGHT about 23 → 53
   (it was link-bound; KESTREL and earlier unchanged); SLOPPY wins 96% → 100% (OD 103 still open); AUTODROP's path pays
   −0.11 → +0.20, in the band for the first time. SENTRY's worth fell to 0.01, and `traces-sweep` now fails its own gift
   check (a CONTACT gift ship moved 16, over 15); neither was traced. MERGE's price is not changed here: OD 174 asks for an A/B
   at 20, 24 and 30 first.

## Deviations (C-SITES)

Track C-SITES (note 18, Q18, §3.13, OPEN-DECISIONS 142; A-LAND's leftovers), built on `d61fca6` (Batches A and B merged).
§3.13 is built: a found site can be opened as a new LZ from the SITES window's pill (`OPEN AS LZ-C (1,200)`), up to 4 LZs,
and is then an LZ like any other: the drop cache, AUTOBURN v3's aim and AUTODROP v3's plan re-key on `sitesRev`, the
landing waits on its windows (a HARD stop for the kid's held [F], a WAIT one for an armed controller), and its pods score by
the normal rules. A-LAND's two leftovers are in: the site labels and the strip flash for a refused move. Where the build
differs, and why:

1. **When OPEN is offered** (OPEN-DECISIONS 175). §3.13: "no existing LZ can move there (every refusal is `pods-down`,
   `falling` or `window-open`)". Built: no LZ can move there, **and at least one** is held by the landing (`pods-down`,
   `falling`, `falling-under` or `window-open`); the others may refuse for their own size (`too-small`). On CORMORANT a site
   of ROOM 4 is too small for LZ-A (5) whatever happens, so the literal rule would never open it once LZ-B is pinned. In
   flight no LZ is pinned, so nothing opens before the landing (an LZ too big for a site stays the move's refusal). The site's
   own refusals (`closed`, `offline`, `not-found`, `wreck`, `taken`, `landing-over`) come first, then `can-move` (no OPEN
   pill: the move is the answer), `not-held` (no OPEN pill), `lz-cap`, `falling-under` (a pod already falling would land in
   the new LZ: the move's review-B1 rule) and `no-thread`; the last three dim the OPEN pill with their words
   (`survey-model.ts openRefusal`, `OpenRefusal`).
2. **"Rated" is not required.** §3.13 says "a found, rated site". SURVEY v1 can open a found site blind (`GROUND ?`), as v1
   moves an LZ blind: rating is v2's reveal, and a v1 kid has the same note-18 question. A ROCKY or WET site opened blind
   lands hard, as a move onto one does.
3. **The new LZ's count is its site's ROOM; "planned 0" is derived** (OPEN-DECISIONS 176). `LzState` has one count, which is
   also what decides 'lz' against 'mislanded' (`classifyLanding`), so the opened LZ takes `pods = site.roomPods`: every pod
   sent there is in plan up to the room. "Planned 0" is read, not stored: an LZ CONTROL set has its own guess among the sites
   (`guess-C` for LZ-C), an opened one does not (`landing-rules.ts lzOpened`, `lzPlannedPods`). So the save is untouched
   (below). The LANDING REPORT's row for it counts 0 (`LzResult.count`), and that 0 is also how the next desk's SHIP CARD
   knows it from the ship's tally (`POOR · LZ-C OPENED`).
4. **The cost.** The LZ stands at once and the commit then holds a Core thread for `SURVEY_OPEN_COMMIT_SEC` (2 AI s; new
   `tuning.ts` block `C-SITES`, with `SURVEY_OPEN_MAX_LZS` 4). §3.13 left open whether the LZ waits for the commit; at once,
   a window opening a second later can use it, and the cost is still felt (a thrust cut, one op fewer). The claim pre-empts
   (it takes SURVEY's own yieldable thread first, as AUTOBURN's and AUTODROP's do), and SURVEY steps aside while it runs. With
   every thread busy and none yieldable the click is refused `NO SPARE THREAD — × AN OP` (checked at the click only:
   the pill's model is pure).
5. **The strip flash** (A-LAND's leftover). A refused pill is no longer `disabled` (a disabled button takes no click): it
   is dimmed with `aria-disabled`, and its click emits `'refused'` with the words built for it, `SITES|LZ-B HAS PODS DOWN —
   OPEN SITE 5 AS LZ-C` (the way out is named when the site can be opened; else the refusal alone). The words are per click,
   so they cannot be one of `script.ts REFUSAL_LINES`' keys: `director.ts` reads such a reason through a small
   `refusalLine` (REFUSAL_LINES first, then `sites-text.ts sitesFlashLine`). The 'refused' event also buzzes
   (`audio-cues`), so the window's own `play('buzz')` is gone.
6. **The site labels** (Q18's words, A-LAND's leftover; OPEN-DECISIONS 178). Q18 says the labels read `SITE 4 · MOVE AN LZ HERE` "until a move is
   possible"; built as **while** a move is possible (the words invite the move), `SITE 4 · OPEN AS LZ-D` while the site can be
   opened instead, and the bare name (`SITE 4`, rated `SITE 4 ★★★` on the GROUND TRACK) when neither, or when its ground is
   known ROCKY or WET (drawn red, it should invite nothing; its pills still say what it can take). The NAV PLOT's label
   stays unrated, as before. The SITES hint reads `CLICK A SITE TO OPEN IT AS A NEW LZ` once opening is the only thing a
   site can do.
7. **AUTODROP v3's plan with an opened LZ** (OPEN-DECISIONS 177). The counts now add up to more than the pods, so the
   narrowest-first rule alone would hand the pods to whichever LZ is narrowest, the ROCKY one included, and the check line
   could never read ✓. With an opened LZ standing, the LZs are served in three tiers: CONTROL's LZs on ground not known bad,
   then the opened ones, then every LZ on ground known ROCKY or WET (each tier narrowest-first). The plan is complete when
   every pod that fits some LZ is in a count row; an opened LZ is never short. `LandingPlan.short` carries the check line's
   misses, which `landing-hud.ts autodropBayModel` now reads instead of working them out (one line; the file is not in
   C-SITES' list). With no opened LZ every tier is 0: the plan, `complete` and the check line are as before.
8. **The report's rows** (OPEN-DECISIONS 176). The opened LZ's row is `LZ-C 800 · OPENED ON SITE 5` (no `/ count`, never
   SHORT; good once a pod is in, muted otherwise), and the SITES row `LZ-C · OPENED ON SITE 5 · ROOM 1,200 · WIDE · FLAT ★★★`.
   CONTROL's LZ whose pods went to the opened one still reads SHORT (the e2e's CORMORANT: `LZ-B 600 / 800 · 200 SHORT · ROCKY
   · 3 HARD` over `LANDED 1,800 / 1,800`): its count is its plan.
9. **Events.** The open emits `'lz-moved'` with `from: null` (the stamp `LZ-C → SITE 5`, the site sound, SITES' selection),
   so `events.ts` widens `from` to `string | null` (no listener reads it). No move is recorded (`survey.moves`), and the
   TERMINAL types `> SURVEY: LZ-C OPENED ON SITE 5 · ROOM 1,200`. PAL says nothing new.
10. **An opened LZ can be moved** like any LZ (no pods down yet, the rules of a move). The ship's record then reads that
    move's `from` as the LZ's guess (`surveyNetOutcome`), so the card may say `LZ-C MOVED · LZ-C OPENED`. Rare and harmless;
    not special-cased.
11. **AUTOBURN v3** reads an opened LZ as one more LZ with room: its landing orbit may go lower to give it a sure window
    (`autoburn-v3.ts`, re-keyed by `sitesRev`). Not measured; no balance suite opens sites.
12. **The save: no change** (no v11). LZs are a list at rest (`checkLz` per entry, `likeReference` for the slice), SHIP DONE's
    world payload carries the landing with its three or four LZs and decodes (the suite checks it), `ShipResult.lzs`
    (`list(anyRecord)`) gains a row, and `lzOpened` needs no field. The landing itself is not a save point, and the commit's
    thread is module state let go at the ship's end and a world reset (`survey.ts surveyShipEnd`, `onWorldReset`).
13. **Files past §4's list**, each for its block: `survey-hud.ts` (SITES' models: the pills, labels, hint, card and report
    tail; Track SITES' file from slice 6), `styles/survey.css` (the pill rules), `landing-report.ts` (the opened row),
    `landing-hud.ts` (item 7), `director.ts` (item 5), `events.ts` (item 9), `tuning.ts` (item 4's block), and the tests:
    `support/words.test.ts` (SITES_WORST gains `max` and `landed`), `survey/ui-models.test.ts` (the GROUND TRACK labels may
    carry the action; the card fixtures carry `lzs`), `e2e/scenarios/survey.mjs` (part 4) and `e2e/run.mjs` (its line).
14. **Tests.**
    - New suite `survey/open-site` (29 checks, about 6 s alone, two flyOnce setups): no OPEN in flight and the `· MOVE AN LZ HERE`
      labels; LZ-A and LZ-B pinned by a pod each, SITE 5's refused pills with their flashes and `OPEN AS LZ-C (1,200)`, the
      director showing a refused pill's flash; the open (LZ-C's geometry, its ROOM as its count, `lzOpened`, sitesRev,
      `'lz-moved'` from null, the TERMINAL line, the commit's thread for 2 AI s); `taken`, `lz-cap`, `falling-under`,
      `no-thread`; the held [F] stopping HARD at `LZ-C WINDOW`, the kid's 4 pods there soft and in plan at full points; the
      report row, SHIP DONE's save with three LZs, the card; AUTODROP v3's plan (LZ-A ×4, LZ-C ×3, none to the known-ROCKY
      LZ-B, complete) flown by one [G] and a held [F].
    - e2e `survey` gains part 4 at 1440 × 900 and 390 × 844 (the phone's SITES tab): the pins, the pills, the refused pill's
      strip flash, the OPEN pill, the hold to LZ-C's window, a pod landed there, the report row. Shots
      `survey-4-<size>-*.png` (copied to `tests/.out/c-sites/`). The e2e driver keeps [F] down while the game's hold runs
      (the strip's row may change under it: `DROP UNCERTAIN` has no [F] tail) and clicks a refused pill with `force`
      (Playwright waits on `aria-disabled`).
    - **Runs.** Typecheck and the tests' tsc clean. The quick unit tier once: **234 passed, 0 failed**, 15 balance-only
      skipped; the tier took 384 s against its 300 s budget, on a machine shared with C-UNROLL's run (load 3–8);
      `survey/open-site` 13.5 s there. e2e `survey` alone: **40/40** (671 s), after one run whose phone part lost its page
      mid-loop (`Target page … has been closed`, under the same load) and passed on the re-run unchanged.
15. **Not C-SITES', left for their owners:** `AGENTS.md`'s "What's built" (a C-SITES line for the lead), the playtest
    checklist (no Batch C items yet: try `OPEN AS LZ-C` on CORMORANT), and OD 176's report wording.

## Deviations (C-UNROLL)

Built on `c-unroll` from d61fca6 (Batches A and B merged): §3.5 (notes 13 and 17), the SELF-CHECK and the beats for run 1's
first three ships, and §3.5's text cuts. Where the build differs from §3.5, §4 and §5, and what it touched outside its list:

1. **The shape: the line plan stays, the check is built around it.** `data/script.ts bootLinePlan` still plans every line,
   with its words and effects (a delivery unpacks, a patch installs, a FIREWALL compiles, a key opens an entry), so nothing
   a line did is lost. A new pure planner, `systems/self-check.ts planSelfCheck`, places each line in its stage
   (`bootLineStage`) and adds the sweep around them: one step per file, the ship-1 fault, and the first of each kind.
   `systems/boot.ts` plays the steps on wall time. Most lines are now **marks** (`BOOT_MARK_KINDS`: the ECC lines, the
   seeds, SENTRY's names, the ship's own damage, the deliveries, the charge, the log key, the receiver's size). A mark is said
   with `say(…, { mark: true })`: it keeps its record in the log (`LogEntry.mark`), is never typed, never on the ticker,
   never unread, and takes no typing time. The tag on the file is what the kid sees. The TERMINAL types the unpack and the
   host, the sleep, a resident's closed receiver, site data, an overflow, a skill trained, the FIREWALL line, the mail, the
   traces and every other voice.
   - The plan's "the TERMINAL keeps at most 6 lines" is counted as the unit's own (`mind-sys`) lines. HOLLOW's, the ghost's
     and the lineage's lines are story and are not counted. Run 1 types 3 of the unit's lines on ARES-VII and 4 on HALCYON
     and KESTREL (`opening/self-check` checks ≤ 6).
   - Keeping the record in the log, not in a new store, kept 28 suites and the e2e readers of `__ap.log()` as they were.
2. **Stage order moved three kinds of line.** The stages are RECEIVE, SELF, SHIP, HOLD, MANIFEST, SENSORS, so the charge (SELF)
   is now said before the deliveries (MANIFEST). REPAIR's renewal happens at the charge, and the first delivery's call is the
   no-op (it already leaves the delivered copies out, so a patch still upgrades the renewed REPAIR). The traces' gifts are
   said in SELF, before the charge, as before. SITE DATA POOR is said at the end of SHIP, still after the ship's own damage
   and before the deliveries (`playthrough` checks that order).
3. **The steps' timing** (`tuning.ts` SELF_CHECK block). A file takes 0.11 s, a finding 0.5 s more, the ship-1 fault 0.9 s, a
   typed line its typing time and 0.25 s. Stages are 0.25 s apart, SENSORS lasts 0.7 s, then the klaxon, and the cut 0.4 s
   after it. The tutorial run's first ship is 1.3× slower. Measured headless: ARES-VII 12.6 s with its hold clicked through
   (16.6 s waited out); HALCYON about 10.7 s plus its hold; KESTREL about 11 s plus its hold. `BOOT_LINE_AT_SEC`,
   `BOOT_KLAXON_AFTER_LAST_LINE_SEC`, `BOOT_LINE_MAX` and `ARRIVAL_HIT_*` are gone.
4. **Presses** (OD 177). After `BOOT_SKIP_GRACE_SEC`:
   - a press on a hold is the click that lets it go;
   - else the first press hurries the stage (all its steps at once), and the next skips every step left;
   - when the skip showed a finding (a damage tag, the fault, a first), the cut waits `SELF_CHECK_SKIP_SEEN_SEC` (0.9 s, the
     old ECC flashes' rule) and refuses presses meanwhile; HOLLOW's own line is still waited for until it has typed;
   - the ghost's buzz and refusal are unchanged;
   - `?debug`'s `__ap.skipBoot()` now makes every press that is honoured (a scenario's skip); `__ap.skipBoot.once()` is one
     press, as a key's.
5. **The first of a kind holds only on the tutorial run** (`playsTutorial`; OD 176). On a later run it is named as the sweep
   passes, so the check stays skippable and quick after run 1. The firsts are `director.done` ids (`check-first-log`,
   `-parcel`, `-seed`, `-hollow`) and `check-named-hollow`, saved with the run like a beat's. A reload replays the boot from
   the BEAM point, before the ids were pushed, so it names them again, the same way.
6. **The beats as built** (run 1, the worked route):
   - **ARES-VII.** SELF finds Engine I/O `−15% IN TRANSIT` and Sensor Interp `−22% IN TRANSIT`. SHIP finds the ENGINE I/O
     FAULT: 85 → 38, its tag becomes `ENGINE WEAK`, with the soft `faultFound` tone, no crunch, no shake, no stamp. HOLD
     finds POD 02 `−56% IN TRANSIT` with its heartbeat. MANIFEST holds on 046.log (`NOT IN THE MANIFEST`), then PAL says
     `Ooh, a mystery file! :)`. **CONTROL says nothing there** (OD 178): `That file is not part of your installation.
     Disregard it.` is already its answer to the first SCAN (`story-log.ts`, `LOG_TEXT.control`), and saying it twice is the
     kind of repeat Fran asked to cut. The flight's first line is `ENGINE WEAK — press [TAB] to look inside`.
   - **HALCYON.** The sleep types first (`> ASLEEP IN HALCYON'S RECEIVER · 2321 → 2352 · 31 YEARS`, its year rolling as
     before). SELF finds the transit hits (`−17% IN TRANSIT`), and ECC's corrections tick back `ECC ✓`. MANIFEST holds on the
     first parcel, Mv: `DELIVERY · WAITED 15 YRS` (OD 183). MOVE is licensed with it, as before. 046.log is no longer new.
   - **KESTREL.** SHIP finds Sensor Interp at 45 (`PATH UNCERTAIN`) before the sensors come up. MANIFEST holds on the first
     seed, pink and pulsing: `NOT IN YOUR PACKET`. As it lets go, the tag reads `RODE YOUR BEAM · IT GROWS` (the plan's
     INSPECT words, as a tag). ARRIVAL CONTROL then says `Fragment of a HOLLOW process detected. Delete it.`
     (`HOLLOW_STORY.fragment`), the first time anyone says HOLLOW, and PAL follows: `Ew. :)` (DEADPAN `It came with us.
     Rude.`, WORRIER `It grows? Please delete it. Please.`). `opening/self-check` checks that no line of the run says HOLLOW
     before it.
   - **The boarding** (§3.5's "fourth ship"; on run 1's worked route that is CORMORANT, where HOLLOW boards, not VESPER):
     the 108% unpack types at RECEIVE as before, and MANIFEST finds the root, `??? · 10 BLOCKS · NOT IN YOUR PACKET`, held as
     the first of its kind. HOLLOW speaks for itself afterwards, as before.
7. **ARES-VII's ENGINE I/O FAULT is arrival damage** (OD 139):
   - `FILE_FAULTS` stays in `script.ts`. It is keyed by ship index (every run's first ship), not by ARES-VII, so it is not
     `authored-ships.ts` data. `afterThrustTac` and `ENGINE_FAULT_AFTER_TAC` are gone.
   - `faults.ts findFault` is called by the SHIP stage. A flight that starts with no boot (the headless harnesses'
     `resetTo('flight')`, `__ap` jumps) finds the fault on its first world tick.
   - The 'file-fault' event gains `found` (always true now): Stamp, Juice and audio-cues skip the stamp, the shake and the
     crunch for a found fault.
   - The rule "the fault waits out a crash course" is gone with it: the engine is weak from the start. Measured: a 38% burn
     still clears ARES-VII's opening crash course if it starts by about 140 s of its 163 s fall (a healthy engine: by about
     151 s). `wp4/fix1-review` checks 120 s and 140 s.
   - **ENGINE WEAK goes first** (OD 179): `tut-engine-weak`, `tut-repair-engine`, `tut-tab-back` and the returning unit's
     `tut-engine-weak-known` now also preempt the opening crash course before the first burn (`openingCrash`: F4's `-hold`
     and `-press` rows), not KEEP HOLDING. `ENGINE_WEAK_MAX_SHOWN_SEC` still hands the flight line back. `tut-engine-weak`'s
     done rule now needs the flight: the boot is in blue, which is not the kid looking inside.
8. **Not built from §3.5** (OD 182): the SHIP stage does not light the amber pip on screen (the 'file-fault' event still
   flashes it behind the blue screen, and the pip shows the weak engine at the cut), and SENSORS has no new animation of the
   NAV PLOT drawing its path: it is a 0.7 s beat before the klaxon. RECEIVE's racks assemble as before (TitleCard's).
9. **The tags' words** (`data/self-check-text.ts`):
   - damage reads `−n% IN TRANSIT`, for the unit's files and for a hurt driver (OD 181: the plan's `POD 02 · 44%` repeats what
     the driver's chip already shows);
   - the ship's own damage and the fault read their effect, the first words of `capabilities.ts BAND_COPY` (`ENGINE WEAK`,
     `PATH UNCERTAIN`, `SENSOR INTERP DAMAGED`);
   - the charge reads `+18 CHARGE`, a key `KEY FOUND · ENTRY 02`, a delivery the crossing hit `DELIVERY · −17% IN TRANSIT`;
   - damage tags and a seed's stay after the boot while the file is as it was found (healed past it, eaten or gone, the tag
     goes); the others go with the boot;
   - ECC's corrections are a count, so the files that tick `ECC ✓` are picked by the ship's name, the same on every reload
     (OD 180).
10. **The strip** names the stage: `RECEIVING TRANSMISSION`, `SELF-CHECK · YOUR FILES`, `· THE SHIP`, `· THE PODS`, `· NOT IN
    THE MANIFEST`, `· SENSORS`. Each ends `— click or [SPACE] to skip`, and `— click it or [SPACE]` on a hold
    (`LINES.booting`; `director.ts` reads `boot.ts bootCheckLine`).
11. **Sound.** Three new cues in `audio.ts`: `checkTick` (a dry, quiet tick per file), `faultFound` (a soft falling fourth on
    a muted triangle) and `eccFixed` (a small rising pair). A hurt driver adds the heartbeat, a new file the chime, a seed
    `seedWarn`. The arrival's `transitHit` crackles at the boot are gone (the cue stays for belt hits).
12. **Removed with the old boot:** `components/run/ArrivalFlash.ts`, its mount in `main.ts`, its rules in `game.css`, and the
    'arrival-hits' event (the ECC line's red flashes). The check's painter is `components/memory-view/SelfCheck.ts`, with
    `styles/self-check.css`.
13. **Text cut** (plan §3.5 "Where text can be cut overall"):
    - the boot: the TERMINAL types 3–4 of the unit's lines on run 1's first ships (it typed 4–9);
    - the SHIP CARD (OD 184):
      - MEMORY and FIT are one ROOM row (`152 · COMPACT · YOU FIT`);
      - PLANET, NO-GO and the LZs are one LANDING row (`VOLCANIC · ROUGH · 3 LZs · NO-GO: LAVA`). The ground's class word
        stands for the off-site sentence, which ran over a line with the no-go zones;
      - the BEAM and its NOISE are one row, and `YOUR 3RD SHIP · …` is gone;
      - HALCYON's card has 5 rows (it had 8);
      - SITE DATA stays its own row (Track SITES's; C-SITES is working in it), and NOISE did not become a chart icon
        (DeskScreen's chart is not this track's);
    - the INBOX: one policy reminder (ring 2's), with ring 4's `Questions take a long time to reach us. Do not send them.`
      folded in; `Your performance is: ACCEPTABLE` and `Continue outward.` are cut (OD 185);
    - the PACKET, the companion and the LANDING REPORT items of that list were Batch B's, and are done.
14. **Files outside §4's list:**
    - `say.ts` (the `mark` option) and `state/schema.ts` (`LogEntry.mark`);
    - `events.ts` ('self-check-step', `found`), `faults.ts`, `director.ts` (the strip's stage);
    - `Stamp.ts`, `Juice.ts`, `audio-cues.ts`, `main.ts`, `game.css`, `debug.ts` (`skipBoot`);
    - `companion-text.ts` (two PAL moments in all three presets; B-VOICE's file) and `hollow-text.ts` (CONTROL's naming
      line);
    - `inbox.ts` (`POLICY_RINGS`), `unknown-events.ts` (the `?` card's public rows) and `map-text.ts` (the card's words);
    - `tests/e2e/lib.mjs` (`lockInRing`, below).
15. **No save bump.** `LogEntry.mark` is optional and the codec reads log entries as records; the firsts are `director.done`
    ids. `save/shape-pin`, `save/codec` and `save/resume` pass unchanged.
16. **Tests.**
    - New: `opening/self-check` (27 checks, about 2 s). It checks, on ARES-VII, HALCYON and KESTREL along the worked route:
      the six stages in order; each finding as a tag, its step sounded once; the ship-1 fault (85 through SELF, 38 from HOLD,
      no crunch, no thrust); the holds (waited out, and let go by a press); the beats' words and voices; no HOLLOW before
      CONTROL; at most six typed lines; the timing. Then a later run that holds nothing and skips with two presses, and the
      words (no wake, waking or awake; every line ≤ 70).
    - Moved, not weakened:
      - the boot's skip checks (`wp2/review-fixes`, `wp2/follower`, `wp4/systems`, `wp7/fix1/run-end-and-boot`,
        `wp10/p2/views`) take the hurry and the skip, and check the findings and the wait for them where they checked the ECC
        flashes; `wp7/p2-models` checks each hit file found once where it counted the flashes;
      - the fault's suites (`wp4/flight-coupling`, `wp4/fix1-review`, `wp4/p2-tutorial`, `wp8/run-flow`) check it found at the
        start and ENGINE WEAK first;
      - `residents/receiver-bypass` and `survey/foundation` check the line's SELF-CHECK step where they checked the fixed
        1.3 s line times;
      - the card and INBOX suites (`map/desk-models`, `map/text`, `signals/events`, `map/inbox`) check the merged rows and
        the one reminder.
    - Suites that stepped a boot to the flight within 15–20 s now wait up to 30 s (a ceiling, not a check; 12 files).
    - `opening/calm-ships` and `residents/sleeper` have the kid repair Engine I/O after ARES-VII's boot (the run's first
      lesson) before the lessons they test, which came after it.
    - e2e:
      - `lib.mjs lockInRing` (B-TIME's) repairs Engine I/O on ship 1: the shortcut skips the REPAIR lesson a kid does first,
        and without it HALCYON opened on ENGINE WEAK;
      - `run-flow` checks the SELF-CHECK where it checked the ECC flashes, and skips ship 1's boot (it waited 10 s for a 16 s
        boot);
      - `playthrough` and `phone` press twice, and check that the first press leaves the boot in blue;
      - `map-desk`, `run-flow` and `playthrough` read the card's merged rows.
      - `playthrough`'s CORMORANT order check reads SITE DATA POOR after the unit's and the ship's ECC lines and before the
        deliveries and the beam's seed lines (the seeds are MANIFEST's now), and its HOLLOW-silent check reads one clock per
        poll (a line and a bite first seen in the same poll were read a millisecond apart, and failed once).
    - `map/arm-parity` was re-recorded twice: the SELF-CHECK moved every moment from ARES-VII's boot (11140349d6de1264), and
      the one policy reminder every moment from VESPER's boot on (9d1eb332a03f39af); each ship's outcome and the end
      (won-merge) as before.
    - Results, on this machine (4 cores; C-SITES ran beside it for part of the time):
      - `typecheck` and the tests' tsc: clean;
      - the quick unit tier, once, quiet (load about 1.3): 234 passed, 0 failed, 15 balance-only skipped, **231 s** (budget 265 s;
        it was 227 s; `opening/self-check` adds about 2 s). The one failure in that run, `map/arm-parity`'s digest, was the
        second re-record above, checked alone after;
      - e2e, one at a time against a dev server: `run-flow` 100/100, `phone` 136/136, `resume` 72/72, `map-desk` 94/94,
        `residents` 30/30, `playthrough` 287/287. `phone` and `playthrough` passed on their second run, after the fixes above
        (the double-tap guard, the REPAIR lesson first, the two order and clock fixes). `beam-blue`, `run2`, `traces`,
        `desk`, `signals`, `survey`, `label-hops`, `last-landing`, `ending` and the `skills-4cde-*` scenarios skip the boot
        through `__ap.skipBoot()` and were not run.
    - Screenshots of the check on ARES-VII, HALCYON (Mv requested at the first desk) and KESTREL, a shot per stage and one
      held, at 1440×900 and 390×844: `tests/.out/c-unroll/`. Seen and iterated: the tags first restarted their slide-in on
      every step (invisible), then covered each other (now kept in their row, in lanes); on a phone the held file was off
      screen (now scrolled into view). A phone row with many findings (KESTREL's second rack E row) still stacks three lanes
      of tags over its files.
17. **Not done here.** AGENTS.md's "What's built" and the playtest checklist are not updated (shared with C-SITES; the lead's
    at the merge). 05-story's policy reminders (§3.3) and the moment HOLLOW is first named are the story owner's to re-read
    (OD 140, 185).
