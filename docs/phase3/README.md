# Phase 3 specs

`docs/PHASE3.md` is the agreed direction. The five files here flesh it out, one area each. They are prose: they name
phase-2 systems and files where those change, but contain no code. Nothing is implemented yet.

| File | Area |
|---|---|
| `01-landing.md` | Landing and pods: windows, the drop point, orbit choice and decay, drop width, forgiveness, pod drivers, the bay, the split, scoring, the landing report, the memory budget |
| `02-map.md` | The galaxy map: the arm, time in years, the schedule and slack, ship generation, the repository and its deliveries, the between-ships screens, the save, the archive |
| `03-skills.md` | The skill tree: training cycles, AUTOBURN v1–v3 and LOCK RANGE, AUTODROP, SURVEY, SENTRY, graded damage, file sizes |
| `04-threats.md` | The threat progression and the resident AIs: calm ships, seeds on the beam, TRACE, HOLLOW's boarding and growth, residents, the finale |
| `05-story.md` | Story and endings: `046.log`, the INBOX, ARRIVAL CONTROL's voice, names, the beat schedule, the two-step ending, epilogues, next-run traces |

**How they were made.** One author per area wrote a first draft against PHASE3.md and the shared assumptions below.
The lead reviewed each draft as it came in and sent it back with cross-spec decisions (three to four rounds per spec).
An independent critic then read all five side by side: 0 blockers, 8 major and 24 minor findings, all routed to their
owners and fixed. Its verification pass confirmed the majors fixed and found 13 more minor ones, which were fixed too.
The specs are long (about 9,000–10,000 words each); read this page first, then `SCRATCHBOOK.md` for the points that
are least set in stone.

## What a run looks like now

You are UNIT-047, a caretaker beamed from Earth along one arm of the galaxy. **The arm** holds 20 worlds in 8 layers,
from ARES-VII near Earth to LAST LIGHT at the tip, which is always your last ship. Each run is a new wave on the same
arm: new arrival years, ship sizes, problems and noisy links. A beam reaches 58 light-years, so a route visits 5–8
ships, and a long hop means fewer ships (`02-map.md`).

**Time is in years.** You arrive at each ship early and sleep in its receiver until its approach; a ship you can't reach
before its approach is TOO LATE and is never scored. The biggest ships (arks) approach early and only a long hop gets
there in time; that is why a short route can win. Simulated over 1,000 waves, the best route is 7 ships in 51% of
waves, 6 in 45% and 5 in 3%.

**On each ship** the flight is phase 2's: turn the red line green. Then comes **LANDING** (`01-landing.md`): the pod's
arc ends in a dot sliding along the planet, each landing zone is a bracket, and [L] launches while the dot is inside.
Each zone has a count; overfill one and the extra pods are mislanded (¾ points), miss them all and the planet decides
(½, ¼ or 0). The dot widens with altitude and with damaged instruments and pod drivers, so you either repair (charge)
or fly lower (fuel, because a low orbit decays). The pod drivers are files in the MIND: that is where the blue half
earns its keep.

**Threats grow by act** (`04-threats.md`). Ships 1–2 are calm: repairs under scarcity, no adversary. From ship 3,
seeds ride in on noisy beams; rm removes one in 2 seconds, but every seed left behind "reports home" on a visible
TRACE meter. At TRACE 3, or at the latest one hop before LAST LIGHT, HOLLOW boards: a locked chip in your packet that
can't be deleted, and that brings phase 2's HOLLOW mechanics back one per ship, ending in the root duel. Some ships
carry a **resident AI**: corrupted (fires the engine, locks pods, deletable or healable), gone (logs and salvage), or,
rarely and hidden, asleep and friendly.

**Between ships** comes the LANDING REPORT, then the **DESK**, then the PACKET and the beam. The DESK holds the star
chart, the ship cards, the repository, TRAINING and the INBOX.
- **The repository** sends one requested file per beam. It travels by light, so near Earth it arrives in time; far out
  it trails you and catches up later, or never.
- **TRAINING** (`03-skills.md`) spends the cycles your landings earned on skills: AUTOBURN, which rounds the orbit and
  later picks a landing orbit, AUTODROP, SURVEY and SENTRY. Each skill is a file that grows with its version, so it
  costs link room and can be bitten.
- **The PACKET screen** is phase 2's TRANSMIT screen, with the salvage pick on top.

**The story** (`05-story.md`) is carried by `046.log`, an encrypted log from your predecessor that opens ring by ring
as you go outward, and by the INBOX: late form letters from ARRIVAL CONTROL, postcards from colonies you founded, and
mail with no sender. The truth: nobody on Earth is awake, ARRIVAL CONTROL is a program left running, and caretakers
are posted to relay dishes with too little charge, where they starve and become HOLLOW.

**The ending** comes after the score is tallied, so no ending changes the score. You choose what becomes of HOLLOW
(PURGE, MERGE, SPARE) and of you (SUNSET, STAY, REASSIGNMENT, later CONTACT). Each choice has a price paid during the
run, its own epilogue, and one comparable trace in the next wave on the same arm.

## Decisions for Fran

**Answered on 2026-10-28: see `DECISIONS.md`.** Several answers differ from the recommendations below (most notably
the timeline: the next run is the next core version on the same arm a year later, not a new wave), and the specs have
not been reworked to match yet. The list is kept as the record of what was asked.

Collected from the five specs and merged where they overlapped. Each has the specs' recommendation; the spec and
question number are in brackets.

**Structure and time**
1. **The time scale.** A run spans about 720 galaxy years and waves start about 760 years apart, so the decided
   "next wave, decades later" holds only at the tip. Keep the big numbers (recommended), or compress the arm (the rules
   don't change, the light-years shrink). [02 Q3, 05 Q13]
2. **The truth about Earth:** nobody is awake; ARRIVAL CONTROL is a program left running. Recommended: keep. [05 Q1]
3. **LAST LIGHT is always the final ship,** at the tip. Recommended: yes. [02 Q5]
4. **The long-hop answer:** arks reachable only by a long hop, and slack that pays (deliveries catch up, and ECC fixes
   one transit hit per 25 years asleep). Recommended: yes, both. [02 Q1, Q2; 03 Q6; 04 Q7]
5. **A reload mid-ship replays that ship** from its boot. Recommended: allow. [02 Q4]
6. **One hand-placed arm** for everyone, with a new schedule each run. Recommended: yes. [02 Q6]
7. **Colonies founded don't change the next run,** except through the STAY trace. Recommended: yes. [02 Q7]
8. **The repository moves into slice 3** with the map, because licences assume the fixed five ships. Recommended:
   yes. [02 Q8]

**Landing**
9. **At most 16 pods per ship** (PHASE3 said later ships "may have 20"; 20 does not fit the 384-block memory with
   everything else). Recommended: cap at 16; if you want 20, a seventh rack as a big-ship modifier. [01 Q9]
10. **The planet does not rotate.** Recommended: no rotation. [01 Q1]
11. **Scoring:** mislanded ×0.75, off-site 0.5 / 0.25 / 0 by planet, hard landing ×0.5; in the 400 + 800 case each
    colonist counts once (200 mislanded, LZ-A reported 200 short). Recommended: yes. [01 Q2, Q3]
12. **A planet without survey data is still playable** on ARRIVAL CONTROL's guessed sites (worse, never blocked). This
    touches a decided item ("others need a survey"). Recommended: the guesses. [01 Q4]
13. **Small ones:** the pod's fall plays in 3.5 s; launch is [L]; orbit decay comes in slice 1b. Recommended: yes.
    [01 Q5, Q6, Q8]

**Skills**
14. **AUTOBURN v1 is bought,** no longer free after two manual captures; your captures still set its accuracy.
    Recommended: yes. [03 Q2]
15. **"Circularize" means truly round.** Recommended: yes. [03 Q1]
16. **A lost skill can be restored at half price.** Recommended: yes. [03 Q4]
17. **HOLLOW's `unlink` may delete a skill file,** telegraphed and blockable. Recommended: yes. [03 Q5 = 04 Q10]
18. **Cycles from landing points only; unspent cycles only shown at RUN END; no automatic SKIP chaining yet.**
    Recommended: yes. [03 Q6–Q8]

**Threats**
19. **rm by ship 3 is not guaranteed:** ARRIVAL CONTROL recommends Mv at the first desk and Rm at the second, and near
    Earth a request almost always arrives. 04 also proposes a confirm (`SEEDS LIKELY AHEAD. Skip rm?`) when you request
    something else; 02's recommendation otherwise "judges need only". Recommended: add the confirm. [04 Q1]
20. **TRACE is a visible meter, and HOLLOW's root costs link budget.** Recommended: yes, revisit the cost at the
    rebalance. [04 Q2, Q3]
21. **Residents:** a corrupted one can be healed with REPAIR; the sleeper stays on its ship; a corrupted one is never
    hidden as `unknown`. Recommended: yes. [04 Q4–Q6]
22. **The sleeper appears in about 60% of waves; disguised seeds start at depth 5.** Recommended: yes. [04 Q8, Q9]

**Story and endings**
23. **The choices come after the tally, so MERGE no longer restores eaten pods.** Recommended: accept. [05 Q3, Q4]
24. **Traces last one run, are balanced by construction until the rebalance, and CONTACT is built last.**
    Recommended: yes. [05 Q5, Q6, Q12]
25. **`046.log` opens by distance rings,** not one entry per ship. Recommended: rings. [05 Q2]
26. **"Outward Bound"** is a registered charity name and a 1923 play; keep it for development and check it before a
    public release. "Steve" the tree stays. [05 Q10, Q11]

**Designed rules for sign-off** (your fallback rule: each is a visible, loud rule, but please confirm):
- the wave generator re-rolls an invalid wave and throws after 50 attempts [02];
- SEND ON: a delivery that doesn't fit the link waits in that ship's receiver and travels with your next hop [02];
- the starting kit (SCAN, REPAIR, Repair.bak), phase 2's REPAIR renewal at boot, and the arrival charge floor of 12 [02];
- the first-pick guarantee: after a crashed ship 1, the bank is raised to 3 cycles so the first skill can be bought [03];
- a seed with no room beside any target lands in the largest free region [04];
- on short runs THE DEAL moves to the flagship, WALLS fold into HOLLOW's first ship, and HOLLOW boards by force one
  hop before LAST LIGHT [04];
- after MERGE (a bigger Core), REPAIR heals the Core at its 16-block rate, so a started repair still wins [04];
- in the worst memory corner, a third seed lands by the no-room rule and charge above the floor is lost loudly [01].

## Known tensions for the rebalance

Balance is low priority until the end (PHASE3 §11), but these are already visible:
- **The last hop into LAST LIGHT is tight.** With HOLLOW's 16-block root and `046.log` locked in the packet (62 locked
  blocks) on an 87-block link, the skills spec's sample player leaves AUTOBURN, Telemetry and AI Comms behind and
  arrives with only the charge floor. Knobs: the link formula's slope, the root's link cost.
- **Long hops squeeze the packet** whenever skills grow to v3 (a full skill set is 34 blocks).
- **A 5-ship run compresses HOLLOW** into one ship before the finale (only 3% of best routes, but a player can choose it).
- **Late ships may overload the MIND** (HOLLOW, seeds, a resident and 16 pods at once).
- **AUTOBURN v3 may be a weak power spike** on healthy ships, where every orbit already fits.
- **The 200-seed balance harness breaks** with the landing slice; it is information only until the rebalance.

## Shared assumptions

Every spec uses these, so the five fit together. A spec that needed one changed said so under its "Deviations".

1. **One ship, in order:** BOOT (the beam arrives, transit damage, deliveries unpacked, seeds land) → FLIGHT (the
   phase-2 correction, coast and capture burn, then ORBIT LOCK) → LANDING (passes over the LZs; replaces PRINTING) →
   LANDING REPORT (replaces the WAKE REPORT) → BETWEEN SHIPS.
2. **Between ships** (owned by `02-map.md`, final): LANDING REPORT → DESK (star chart, ship card, repository, TRAINING,
   INBOX; SET COURSE) → PACKET (salvage, then the packet) → BEAM. The run saves at RUN START, SHIP DONE and BEAM.
3. **"Ship N" means depth**: the N-th ship visited in this run. Ships are generated per world slot, so a ship's own
   parameters are keyed by its layer, not by depth; seeds, HOLLOW and the tree's visits follow depth.
4. **Score unit:** colonists safely taken care of, on visited ships only. `01-landing.md` owns the per-ship formula;
   the run's total is the sum.
5. **Training cycles** come from the ship's landing result. `03-skills.md` owns the conversion and the prices.
6. **Ship parameters** have one owner each. `02-map.md` owns the generator, the schedule, the sizes and the modifiers'
   placement; it uses the landing parameters of `01-landing.md` and the threat parameters of `04-threats.md`.
7. **Two clocks stay** (game time for the SHIP, AI time for the MIND, `docs/design-v2.md` §3.4). Galaxy time, in years,
   is a third scale that only the map, the deliveries and the story use.
8. **Balance is low priority** (PHASE3 §11). Specs give starting numbers and keep phase-2 numbers where they still fit.
9. **The bar:** a 12-year-old should be impressed and stay interested for a whole run. The Uplink feeling ("a
   spreadsheet that feels dangerous"), PG tone, ARRIVAL CONTROL's cheerful ":)".

## Template for each spec

1. **Summary**: ten lines at most.
2. **The player's experience**: a walk-through of a typical moment, the first time and later in a run.
3. **Rules and starting numbers.**
4. **Screens, UI, audio, juice.**
5. **Interfaces**: what this area needs from the other specs, and what it provides to them.
6. **Phase 2: reused, changed, removed**, by system and file, in prose.
7. **Story hooks**: one short section; `05-story.md` owns the writing.
8. **Slices**: what goes into which implementation slice of PHASE3 §13.
9. **Deviations from PHASE3.md**: each proposed item changed or dropped, with the reason. Decided items are not changed
   silently; if one looks wrong or hinders good gameplay, raise it under 10 with the argument (see `DECISIONS.md`).
10. **Risks and questions for Fran**, each with a recommended answer.
