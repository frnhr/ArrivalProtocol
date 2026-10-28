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

**Rework, 2026-10-28.** Fran answered the open decisions (`DECISIONS.md`). Three authors reworked the specs to match
(map and story together, for the new timeline; landing, for per-ship memory; skills and threats), and a second critic
read all five against the answers: 1 blocker and 6 major findings, routed back and fixed. The map's simulator is now in
`map-sim/`. The specs are long (about 9,000–11,000 words each); read this page first, then `DECISIONS.md`, then
`SCRATCHBOOK.md` for the points that are least set in stone.

## What a run looks like now

You are a caretaker, a core beamed outward along one arm of the galaxy. **The arm** holds 20 worlds in 8 layers, from
Kepler-186f near Earth to an end slot at the tip. A beam reaches 58 light-years, so a route visits 5–8 ships, and a long
hop means fewer ships (`02-map.md`).

**Runs follow each other on the same arm.** The next run is the next core version (UNIT-047, then UNIT-048), launched
about a year later. The arm keeps its state: ships the last unit visited are colonies now, ships it skipped are a run
older (some leave: saved by another core, or came in on their own), and new ships report home. Every run starts at a
new calm ARES ship (ARES-VII, VIII, …). A "steady arm" rule keeps every run's arm the same shape, so the last route
decides which ships wait, never how many or how big. You trail your predecessor by a year: its colonies, its trail, its
letters. **The final ship** is a role, an end slot on the chart; run 1's is LAST LIGHT, and later runs get new ones.

**Time is in years.** You arrive at each ship early and sleep in its receiver until its approach; a ship you can't reach
before its approach is TOO LATE and is never scored. The biggest ships (arks) approach early and only a long hop gets
there in time; that is why a short route can win. Over 12,000 simulated consecutive runs the best route is 6 or 7
ships (each 40–60% of runs, depending on how the last unit played), with no drift over 200 runs and no snowball.

**Ships differ in memory.** FULL ships have phase 2's 384 blocks, COMPACT 320 and TIGHT (light ships) 256, which leaves
only 88 blocks for the unit you carry. The PACKET checks both the link and the next ship's room, so a tight ship is
easy early and costs files late, and the card says so before you pick it (`01-landing.md` §3.16).

**On each ship** the flight is phase 2's: turn the red line green. Then comes **LANDING** (`01-landing.md`): the pod's
arc ends in a dot sliding along the planet, each landing zone is a bracket, and [L] launches while the dot is inside.
Each zone has a count; overfill one and the extra pods are mislanded (¾ points), miss them all and the planet decides
(½, ¼ or 0). The dot widens with altitude and with damaged instruments and pod drivers, so you either repair (charge)
or fly lower (fuel, because a low orbit decays). The pod drivers are files in the MIND: that is where the blue half
earns its keep.

**Threats grow by act** (`04-threats.md`). Ships 1–2 are calm: repairs under scarcity, no adversary. From ship 3,
seeds ride in on noisy beams; rm removes one in 2 seconds, but every seed left behind "reports home" on a visible
TRACE meter. At TRACE 3, or at the latest one hop before a final ship, HOLLOW boards: a locked chip in your packet
that can't be deleted, and that brings phase 2's HOLLOW mechanics back one per ship, ending in the root duel. Some
ships carry a **resident AI**: corrupted (fires the engine, locks pods, deletable or healable; announced early, and
sometimes a surprise in the last layers), gone (logs and salvage), or, rarely and hidden, asleep and friendly.

**Between ships** comes the LANDING REPORT, then the **DESK**, then the PACKET and the beam. The DESK holds the star
chart, the ship cards, the repository, TRAINING and the INBOX.
- **The repository** sends one requested file per beam. It travels by light, so near Earth it arrives in time; far out
  it trails you and catches up later, or never.
- **TRAINING** (`03-skills.md`) spends the cycles your landings earned on skills: AUTOBURN ([B] makes the orbit green,
  [B] on green makes it round; later it picks a landing orbit), AUTODROP, SURVEY and SENTRY. Each skill is a file that
  grows with its version, so it costs link room and memory, and can be bitten.
- **The PACKET screen** is phase 2's TRANSMIT screen, with the salvage pick on top.

**The story** (`05-story.md`) is carried by `046.log`, an encrypted log from a predecessor that ran out of charge
halfway along the arm, which opens ring by ring as you go outward, and by the INBOX: late form letters from ARRIVAL
CONTROL, postcards from colonies, and mail with no sender. Earth is not empty, and the game doesn't explain it; the
story looks outward. Caretakers left at relay dishes with too little charge starve and become HOLLOW.

**The ending** is chosen at the final ship, before the score screen: the FINALE (the root duel, then what becomes of
HOLLOW, PURGE, MERGE or SPARE, and of you, SUNSET, STAY, REASSIGNMENT, later CONTACT), then the final LANDING REPORT and
the RUN TALLY. MERGE restores the pods HOLLOW ate, which then land (by AUTODROP or blind) and score by their landing. Each choice has its own epilogue and one trace in the next run.

## Decisions for Fran

Fran's answers of 2026-10-28 are in `DECISIONS.md`, with the list as it was asked. No decision is final: one that
hinders good gameplay is raised again with the argument.

**The 20 questions the rework raised were answered on 2026-10-28** (round 2 in `DECISIONS.md`). Several change the
specs, which have not been updated for them yet: a random launch gap of 0–35 years, hitchhikers (HOLLOW's root and
seeds) riding free, no charge floor on TIGHT ships, up to two TIGHT ships per late layer, no rm meaning no win (with a
warning before the last hop), and MERGE's restored pods landing on their own.

Decision 18 (cycles from points only, unspent only shown, no SKIP chaining) is deferred; the specs keep it as a working
value.

## Known tensions for the rebalance

Balance is low priority until the end (PHASE3 §11), but these are already visible:
- **The last hop into the final ship is tight.** With HOLLOW's root and `046.log` locked in the packet on a long hop's
  link, the skills spec's sample player leaves AUTOBURN, Telemetry and AI Comms behind and arrives with only the charge
  floor, and MERGE needs 20 charge kept through the duel. Knobs: the link formula's slope, the root's link cost.
- **Long hops and TIGHT ships squeeze the packet** whenever skills grow to v3 (a full skill set is 34 blocks; a TIGHT
  ship takes at most 76 blocks of files).
- **A 5-ship run compresses HOLLOW** into one ship before the finale (never the best route, but a player can choose it).
- **Late ships may overload the MIND** (HOLLOW, seeds, a resident, possibly a surprise one, and 16 pods at once).
- **AUTOBURN v3 may be a weak power spike** on healthy ships, where every orbit already fits.
- **The 200-seed balance harness breaks** with the landing slice; it is information only until the rebalance.

## Shared assumptions

Every spec uses these, so the five fit together. A spec that needed one changed said so under its "Deviations".

1. **One ship, in order:** BOOT (the beam arrives, transit damage, deliveries unpacked, seeds land) → FLIGHT (the
   phase-2 correction, coast and capture burn, then ORBIT LOCK) → LANDING (passes over the LZs; replaces PRINTING) →
   LANDING REPORT (replaces the WAKE REPORT) → BETWEEN SHIPS.
2. **Between ships** (owned by `02-map.md`, final): LANDING REPORT → DESK (star chart, ship card, repository, TRAINING,
   INBOX; SET COURSE) → PACKET (salvage, then the packet) → BEAM. The run saves at RUN START, SHIP DONE, BEAM and
   ENDING CHOSEN.
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
