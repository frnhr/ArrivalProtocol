# 02 · The galaxy map, time and the run

Spec for PHASE3 §9, the run structure of §1, the delivery rule of §8.3, the repository of §8.5, the between-ships flow,
the save and the persistent arm. Template: `docs/phase3/README.md`; Fran's answers: `docs/phase3/DECISIONS.md`. All
numbers are starting values for `src/data/tuning.ts`, each with a one-line WHY here; balance is low priority (PHASE3 §11).

## 1. Summary

- A run crosses one **hand-placed arm of 20 worlds in 8 layers**, from Kepler-186f near Earth (SOL, where ARRIVAL
  CONTROL sits) to **the final ship** at the tip. The final ship is a role: on run 1 it is LAST LIGHT. The chart shows it
  from the title card on.
- **The next run is the next core version** (UNIT-047, then UNIT-048), on the same arm with the same ships, launched
  **0 to 35 years later**: usually a year or two, now and then a long wait (2.8 years on average). The arm keeps its
  state. Ships the last unit visited are taken, and
  their colonies show their real age as you pass. Ships it skipped mostly wait for you. For a few, another core is on its
  way, or they will come in on their own. New ships have **reported home** in their place, and every run's first ship is a new calm ship near Earth (ARES-VIII, ARES-IX, …).
- **The steady-arm rule** keeps runs comparable. Every world holds one ship at RUN START. A skipped ship stays at most 3
  runs. New ships restore the arm's shape: the ark pattern, the share of light ships, the story and resident quotas. In
  12,000 simulated consecutive runs (random gaps included) the best route is worth about a pod more than on a fresh roll, whoever played the last run. It does not drift over 200 runs,
  and it does not depend on how well the last run went.
- A beam reaches at most **58 LY**, so a hop crosses one or two layers, and every route visits **5–8 ships**. You leave a
  ship at its approach year. A ship you can't reach before its approach is TOO LATE.
- **The long-hop answer:** the biggest ships (ARKS, 15–16 pods) approach early, and only a long hop reaches them in time.
  Slack pays (deliveries catch up, ECC repairs hits while you sleep). A long hop costs link blocks and hits.
- **Memory varies by ship** (`01-landing.md`'s classes FULL, COMPACT and TIGHT). Light ships are TIGHT, so they suit
  the start of a run. Late in a run they mean leaving files or charge behind, and no route is ever forced through one.
- **The repository** replaces licences: one optional request per transmit, delivered by §8.3's rule.
- **Between ships:** LANDING REPORT → DESK (star chart, ship card, repository, training, inbox; SET COURSE) → PACKET →
  BEAM. **The run ends** with the final ship's landing, the ending choices, its LANDING REPORT, the RUN TALLY, the
  epilogue and the final card.

## 2. The player's experience

The numbers below are §3.14's example run.

**The first time.** The title card shows the star chart behind the logo: SOL at the lower left, a band of stars sweeping
up and to the right, and at the far end a slow amber beacon, `FINAL SHIP · LAST LIGHT · 3020`. RECEIVE TRANSMISSION draws
a beam from SOL to ARES-VII, and the ship-1 tutorial plays.

After the LANDING REPORT the screen opens the amber **DESK**. Its first guided step opens TRAINING with two cards,
AUTOBURN v1 or AUTODROP v1 (`03-skills.md`'s tutorial pick), and the kid takes one. Then six lines fan out from
ARES-VII, three short and three long, and ARRIVAL CONTROL types `Lovely work, Unit 47! :) Pick your next ship.` The kid
clicks the nearest node, HALCYON: `1,000 COLONISTS · 5 PODS · APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY`,
`MEMORY 320 · COMPACT · ROOM FOR YOU 152 · YOU FIT`, `LINK 123 · 3 HITS (ECC fixes 1)`. Then the kid notices a bigger
node tagged ARK at the end of a long line: `ALBATROSS · 3,000 COLONISTS · 14 YRS EARLY`, 51 LY away at Pell, `LINK 90 ·
7 HITS`, and in red `ONLY FROM HERE: from any layer-2 ship you'd be TOO LATE`. That is the run's first real decision:
two easy small ships, or one big ship now.

The repository tags `Mv` with `:) RECOMMENDED FOR YOU` and prints `mv · ARRIVES 2337 · HALCYON APPROACH 2352 · IN
TIME`. SET COURSE opens the blue PACKET screen: salvage cards, the packet against `LINK 123` and `ROOM 152`, `3 TRANSIT
HITS · ECC FIXES 1 WHILE YOU SLEEP (31 YRS) → 2 LAND`. TRANSMIT ▸, white-out, and HALCYON's boot opens with `> ASLEEP IN
HALCYON'S RECEIVER · 2321 → 2352 · 31 YEARS` (the years roll as it types), then `> DELIVERY: mv (arrived 2337)`.

**Later in the run.** At KESTREL (ship 3, 2467) the desk opens with a falling tone, `2 SHIPS NOW OUT OF YOUR
REACH`, and ALBATROSS turns grey. The chart offers VESPER, an ark of 16 pods with `ENGINE FAULT`, 55 LY away across a
hatched noise cloud, 103 years early, `LINK 86 · 8 HITS (ECC fixes 4) · NOISE LOW · 1 · SEEDS 0–2`. The repository
answers honestly: `Swap · ARRIVES 2629 · VESPER APPROACH 2625 · 4 YRS LATE → follows your route`. The layer-4 ships are
closer on CLEAN beams, and one of them is light: `MEMORY 256 · TIGHT · ROOM FOR YOU 88 · LEAVE 9 BEHIND`. A big ship
flown without SWAP, a gentle ship on a clean beam, or a small ship that won't fit everything: the kid weighs it.

**The next run.** The title reads `UNIT-048 · YEAR 2301 · LAUNCHED 1 YEAR AFTER UNIT-047` (this example rolled a
1-year gap; §3.1). The chart is the same arm, and it remembers. A faint trail runs
along UNIT-047's route, and every ship on it is tagged `TAKEN · UNIT-047 GETS THERE FIRST`. As the galaxy year passes
each of its landings, the ship turns into a colony marker with its real age: at the second desk (2352), `RIVERSIDE · 52
YEARS OLD · UNIT-047`. ALBATROSS is still there, out of reach no longer, with a small tag, `2ND RUN ON THE CHART`; the kid skipped it last time and can go for it now. Where ships have
gone, new ones blink in, tagged `REPORTED HOME`. Two old ones are gone, and the chart says why in one line each
(`PETREL · ANOTHER CORE IS ON ITS WAY`). Ship 1 is ARES-VIII, a calm three-pod ship at the same world as ARES-VII. At
the tip the beacon has a new name: `FINAL SHIP · LODESTAR · 3021`. LAST LIGHT came in last run.

## 3. Rules and starting numbers

### 3.1 Time and distance

- All distances are whole light-years: the straight-line distance between two positions, rounded to the nearest whole
  LY, and every rule uses that rounded number. All years are whole years. WHY: the kid can redo every sum on screen.
- Ship S has an **approach year** A(S) (the screen says APPROACH, because "arrive" is the caretaker's word). You leave
  S at A(S). A ship's approach year never changes while it is on the chart: it is the same ship next run.
- Leaving S0, you reach S1 at A(S0) + d, where d = |S0 − S1|. **Slack** = A(S1) − A(S0) − d. S1 is **reachable** when the
  slack is zero or more, d ≤ BEAM_RANGE_LY, and S1 is in a higher layer. WHY for "higher layer": the run is outward
  bound, and it keeps every route at 5–8 ships.
- The **galaxy year** is A of the ship you are on. It is a third time scale (README assumption 7). It never moves during
  a ship and jumps only at the beam.
- **The run's start year** is the year of its first ship's approach: RUN_START_YEAR (2300) on run 1, then the start
  of the last run plus **the launch gap**, rolled once per run (seeded, in the update) from LAUNCH_GAP_TABLE:

  | Gap | 0 years | 1 year | 2 years | 3 years | 5 years | 10 years | 20 years | 35 years |
  |---|---|---|---|---|---|---|---|---|
  | Share of launches | 10% | 35% | 25% | 12% | 10% | 6% | 1.5% | 0.5% |

  The average is 2.8 years and 7 launches in 10 come 0–2 years apart. WHY: Fran's 0–35 years, weighted to short gaps,
  average 2–3 (round 2, 4 + 13); a short table of round numbers is something a kid can read, and the title says the
  roll: `UNIT-048 · YEAR 2303 · LAUNCHED 3 YEARS AFTER UNIT-047` (`IN THE SAME YEAR AS UNIT-047` for 0). The time valve
  (§3.12) may add years to it. The last unit's colonies are as old as the galaxy year says: RIVERSIDE (2300) is 52
  years old when a unit launched a year later reaches a layer-2 ship in 2352.

### 3.2 The arm

The arm is data (one hand-placed set, the same for every player), with stable world ids. SOL is at (0, 0). Layer
centres sit 8, 30, 55, 80, 105, 130, 155 and 180 LY from SOL along a gentle bend of 0.10 radians per layer. Layers 2–7
hold three worlds each on three lanes (inner, centre, outer) 11 LY apart, with a few LY of hand nudge for the look. WHY:
the first hop is phase 2's 22 LY and later layers are 25 LY apart, so single hops are 21–45 LY; two-layer hops are 45–70
LY and three-layer hops at least 70 LY.

Each cell is world id, world name, position in LY from SOL (x, y), and the ship it holds on run 1 when authored:

| Layer | Inner lane | Centre lane | Outer lane |
|---|---|---|---|
| 1 | | w0 Kepler-186f (8, 0), ARES-VII | |
| 2 | w1 Marrow (33, −10) | w2 Tessaly (29, 4), HALCYON | w3 Dunmore (30, 16) |
| 3 | w4 Ostrava (54, 1) | w5 Brine (54, 10), KESTREL | w6 Pell (53, 24) |
| 4 | w7 Larkspur (81, 13) | w8 Calder (75, 21) | w9 Quill (73, 35) |
| 5 | w10 Ashgrove (100, 29) | w11 Cinder (98, 43), VESPER | w12 Tamsin (91, 52) |
| 6 | w13 Greywater (121, 51) | w14 Kettle (114, 62) | w15 Avalon (107, 72) |
| 7 | w16 Farhold (136, 78) | w17 Sable (128, 90) | w18 Endmark (121, 96) |
| 8 (end) | | w19 New Haven (138, 116), LAST LIGHT | |

A world is a place, not a ship: over the runs one world receives many ships, one at a time. `05-story.md` §3.11 owns
the names. Generated ships take names from its pool, never their world's name.

**The arm check** (at load, like phase 2's ship validators): every one-layer pair is within BEAM_RANGE_LY (the longest
is 45 LY), no pair three or more layers apart is (the shortest is 70 LY), and no world lies within 5 LY of one of
`05-story.md`'s `046.log` rings (20, 45, 68, 93, 118 and 143 LY from SOL, in the gaps between layers). The current arm
passes with at least 9 LY to spare.

### 3.3 The beam: range, link, hits, ECC, noise

| Rule | Starting value | WHY |
|---|---|---|
| BEAM_RANGE_LY | 58 | Every one-layer hop and most two-layer hops, never three layers (at least 70 LY). |
| Link blocks | round(146 − 1.1 × d) | 22 LY gives 122 (phase 2: 120). A 55-LY hop carries 27 blocks fewer than a 30-LY hop, about half a mid-run unit's charge. Links run 82–123 blocks: never below the locked floor of 46 (the locked unit files with `046.log`, per `01-landing.md`; hitchhikers ride free), never above `01-landing.md`'s 131-block bound. |
| Transit hits | round(d / 7) | Phase 2's 3–6 hits on 22–36 LY; a route's total hardly depends on how it is split. |
| ECC while asleep | one hit fewer per 25 years of slack | A ship reached 50 years early cancels 2 of about 4 hits; an ark reached just in time cancels few or none. |
| Extra hits | BEAM OUT +2, emergency +3 and Core −25 (phase 2) | Unchanged; ECC counts against the total. |
| Noise clouds | 4 per run in layers 3–7, at least 45 LY from SOL, radius 12–18 LY; three of strength 1, one of strength 2. Re-rolled every run | Space weather a kid can see and avoid. It is the one thing rolled fresh each run, so a remembered ship can still sit behind a new cloud. |
| Link noise | the sum of the strengths of the clouds the hop's line crosses, at most 3: CLEAN, LOW, NOISY, SEVERE. On screen the word with the number in small print, `NOISE LOW · 1`, and from ship 3 `04-threats.md`'s seed range (`SEEDS: none` before ship 3) | "Count the clouds on the line." |

**One transit-hit formula:** round(d / 7), minus ECC, plus the BEAM OUT and emergency extras. Noise sets seeds only, by
`04-threats.md`'s table: CLEAN 0, LOW 0.45, NOISY 1.1 and SEVERE 1.85 seeds per beam on average, from depth 3 on, and a
delivery carries a seed with a chance of 0, 10, 25 or 40% on its hop.

**Hitchhikers ride free** (round 2, 20): HOLLOW's root, beam seeds and seeds riding on deliveries cost no link room on
any beam; the delivered file itself still does. Where they land in memory is `01-landing.md`'s.

**Memory room** (`01-landing.md` §3.16 owns the classes): besides the link, the packet must fit the next ship's room for
the unit. Files plus the 12-block charge floor must fit both, and charge above the floor fills what is left of the
smaller one. **On a TIGHT ship there is no floor** (round 2, 8): files must fit its 88 blocks, and charge may arrive
at 0. The floor of 12 holds on COMPACT and FULL ships.

### 3.4 Ship timing, size and memory

- **Layer base years** for a run starting in year Y: B1 = Y. B(k+1) = B(k) + the axis gap (22, then 25) +
  LAYER_SLACK(k), with LAYER_SLACK = 30, 90, 120, 75, 80, 85, 90 years. Run 1: 2300, 2352, 2467, 2612, 2712, 2817, 2927.
  WHY: big slack on the hops out of layers 2 and 3 makes a request from layers 1–3 reach the next ship almost always;
  the smaller slack beyond starts the planning at layer 4 (§3.9).
- **Timing of a new ship.** A(S) = B(layer) + offset × LAYER_SLACK(layer − 1) + jitter, jitter a whole number in −4…+4.
  Offsets: ON TIME 0, LATE +0.5 (+0.3 in layer 2, so a request from a late ship 2 still makes ship 3), 50/50. A ship is
  timed against the bases of the run in which it reported home, and keeps that year.
- **Arks.** An ark approaches ARK_MARGIN_YEARS = 12 years, plus 0–4, before the earliest moment any ship of the layer
  before could reach it. It is therefore unreachable by a one-layer hop and reachable by a long hop from two layers back.
  WHY: with ships of different ages on the chart, the margin must be measured from the real neighbours, not from the
  layer's base year (the old rule broke in the simulation once ships persisted).
- **The ark pattern.** The arm holds one ark in every second layer: either layers 3, 5 and 7, or layers 4 and 6, never
  two in adjacent layers. WHY: an ark one layer after another ark would be reachable from it by a one-layer hop.
- **The first ship** (w0, layer 1) approaches at the run's start year and has 3 pods. **The final ship** has 16 pods, and
  its year is the latest of A(S) + d over every ship that has it in range, plus FINAL_MARGIN_YEARS = 20, rounded up to a
  multiple of 5 (3020 on run 1), and at least the last final ship's year at that end plus the launch gap (at least 1).
  WHY: every layer-7 ship and every layer-6 ship within range can reach it, with room for the years that new ships add;
  two final ships never share a year at one end; and a unit posted there after its run has waited at least as long as
  the gap when the next one arrives (`05-story.md` templates the wait).
- **Ship size.** At most 16 pods (`01-landing.md` §3.16). Light 3 + ⌊layer / 3⌋ (3–5), standard 3 + layer (5–10), ark
  round(2.2 × (4 + layer)) capped at 16 (15 in layer 3). The arm holds LIGHT_SHARE = 40% light ships among its non-ark
  ships, and **from layer 5 on at most two light ships per layer** (round 2, 7). WHY: 40% is the old mix; one per layer
  felt artificial, and with two, check 5 (below) still keeps a non-TIGHT way through every late layer. I assume 200 colonists per pod.
- **Memory class** (`01-landing.md`'s classes and rule, placed here): light ships TIGHT (256 blocks, room for the unit
  88); standard ships of 5–8 pods and the first ship COMPACT (320, room 152); ships of 9 or more pods, arks and the final
  ship FULL (384, room 152). On the arm this gives FULL 35%, COMPACT 35%, TIGHT 30%. WHY: smaller ships carry smaller
  computers (Fran's decision 9). A TIGHT ship is easy near Earth, where the unit is small, and a squeeze late in a run.
- **Seeds and streams.** Every roll of a ship uses childRng(armSeed, run it reported home, slot, stream), so a ship rolls
  the same whatever route led to it, and the same next run. Hop rolls (transit hits, beam seeds) use the current run, the
  destination's slot and the origin in the stream name (`04-threats.md` uses these keys). The salvage deal uses the slot
  being left and the current run.
- **Validity** of the arm at RUN START: (1) every ship except the final ship has a reachable successor; (2) every ship
  except the first has a reachable predecessor; (3) no ark is reachable by a one-layer hop; (4) every layer-7 ship
  reaches the final ship; (5) **no route is forced through a TIGHT ship from layer 5 on**: from every ship, at least one
  way on to the final ship avoids them. §3.12 says how a failure is repaired.

### 3.5 Ships: authored, generated, unknown

- **Flight templates.** A generated ship reuses one of the five phase-2 flight blocks unchanged: IMPACT-A (ARES-VII),
  WIDE (HALCYON), WIDE-B (KESTREL), CAPTURE (VESPER), IMPACT-B (LAST LIGHT). WHY: those numbers were swept per ship in
  phase 2. A new template enters only after the same sweeps pass. Only `omega0` is re-rolled.
- **Modifier library** (ship-side; shown under KNOWN PROBLEMS):

  | Modifier | What it is (phase 2) | Allowed on | From layer | Card label |
  |---|---|---|---|---|
  | Impact course | the template's own rp0 below the surface | IMPACT-A, IMPACT-B | 2 | `IMPACT COURSE` |
  | Too wide | the template's own wide flyby | WIDE, WIDE-B | 2 | `FLYBY, TOO WIDE` |
  | Uncertain path | Sensor Interp arrives at most 45% | any template | 3 | `SENSOR DAMAGE` |
  | Debris | KESTREL's cloud, names a seeded rack the ship has (rack D only on a FULL ship) | WIDE-B | 3 | `DEBRIS · RACK ?` |
  | Engine fault | Thrust Ctrl arrives at 31% (ghost thrust) | CAPTURE | 4 | `ENGINE FAULT` |
  | Radiation belt | LAST LIGHT's belt on racks A–B | IMPACT-B | 5 | `RADIATION BELT` |

  Extra modifiers per generated ship: none in layer 2, up to 1 in layers 3–5 and 2 in layers 6–7, drawn from those
  allowed on its template. Modifiers belong to the ship while threats follow depth, so a long hop brings a harder ship at
  a lower depth: part of its cost.
- **The first ship of each run** is calm and tutorial-grade: IMPACT-A, 3 pods, COMPACT, `01-landing.md`'s layer-1 row
  (one WIDE site, GENTLE, one driver at 44%). Run 1's is ARES-VII with the scripted tutorial. From run 2 it is the next of
  the ARES series (ARES-VIII, ARES-IX, …: one for each core, to Kepler-186f), with the same flight and landing and phase 2's
  returning-run guidance instead of the tutorial. WHY: ship 1 must stay a gentle start whatever the last run did, and a
  numbered series says "ships keep coming" without explaining Earth (decision 2).
- **Authored ships** (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT) are run 1's ships at their worlds; their size and
  timing come from run 1's roll (VESPER is an ark when its lane draws it). After run 1 they follow the same rules as
  every ship: done once visited, gone after 3 runs on the chart. Their templates live on in generated ships, and beats
  that must happen attach to depth (`05-story.md`), never to them. VESPER keeps ENGINE FAULT and never carries a resident.
- **Generated ships:** a name from `05-story.md`'s pool, a template allowed at the layer (layer 2: IMPACT-A or WIDE;
  WIDE-B from layer 3, CAPTURE from 4, IMPACT-B from 5), modifiers by the table, a memory class by §3.4, and parameters
  from `01-landing.md`'s and `04-threats.md`'s rollers.
- **Unknown ships (`?`):** the arm holds three, one for each `05-story.md` story event kind, in three different layers,
  never authored and never a final ship: **old colony** (layers 3–5), **gone resident** (layers 3–6) and **signal**
  (layers 5–7). The card shows the public schedule (approach, slack, distance, noise, memory); everything else reads `???
  · NO TRANSPONDER`.

**Placement.** Everything a ship carries stays with it while it is on the chart. Each run's quotas count the ships still
waiting, and only new ships are given what is missing. Threat and story placement follow `04-threats.md`'s and
`05-story.md`'s rules, translated through the lowest depth per layer (§3.6):

| What | Where | How many on the arm | Notes |
|---|---|---|---|
| POOR site data (`01-landing.md`) | layer 5 and later | layer 5: 1 in 3; layers 6–7: 1 in 2, rolled per new ship | The final ship's site data is authored by `01-landing.md` |
| Corrupted resident | layers 4–7, CAPTURE template, never an ark | at most 2: one in layers 4–5 and one in layers 6–7, never in adjacent layers, never linked by a reachable hop | Layers 4–5: `RESIDENT: reported faulty`, always. **Layers 6–7 are late (`04-threats.md`): the card reads `RESIDENT: unknown` 1 time in 2**, with no other clue, and a hidden one is never on a TIGHT ship (a late TIGHT ship is already a squeeze; an unannounced resident there would be a double ambush). Never on VESPER, a `?` ship or a final ship; its ship takes no extra modifier and never ENGINE FAULT |
| Resident that left (`RESIDENT: unknown`) | layers 2–7 | 5: the gone-resident `?` ship and 4 ordinary ships, at least one in layer 2 | Its leftovers replace that ship's salvage deal (§3.10) |
| Sleeping resident (`RESIDENT: unknown`, only ever) | layers 3–7 | at most 1. If none is waiting, a run's new ships get one with chance 45% | 45% gives a sleeper on the arm in about 60% of runs (decision 22), because a placed sleeper waits about 1.7 runs |
| No resident | the first ship, every final ship, and every other ship not picked above | about half the arm | |
| Signal fragments (`05-story.md`; CONTACT needs 3) | layers 3–7 | 5: 2 on the signal event, 1 on the gone-resident event, 1 in each of two departed residents' notes | |

The corrupted residents' slots take the CAPTURE template when they are placed. WHY: with templates rolled freely, two
could be placed in only 42% of arms. A route then meets one in about half the runs, never two in a row. A hidden late
one makes the `unknown` row honest: it really might be anything.

Once the kid holds one fragment, the chart marks every other fragment ship with a faint `▓░` glyph, so CONTACT becomes a
route the kid plans rather than luck.

### 3.6 The run's structure and the final ship

- **Depth** is the N-th ship visited (README assumption 3). Hops cross one or two layers, so every route has 5–8 ships.
  The lowest depth per layer is 2 in layers 2–3, 3 in layers 4–5, 4 in layers 6–7 and 5 at the end: a calm ship (depth
  1–2) can only be in layers 1–3.
- **The final ship** is a role, not a name. It is the ship in an **end slot**: the map marks it `FINAL SHIP` from the
  title card on, nothing comes after it, it is FULL, 16 pods, with no resident, and it hosts the FINALE (`04-threats.md`).
  The run ends at the first final ship you land on: the duel, the ending choices and the run end follow there. Every
  chain of reachable hops ends at a final ship (checks 1 and 4), so the decided rule "the run ends when no remaining ship
  can be reached" ends every surviving run there.
- **v1 has one end slot,** w19 New Haven. Run 1's final ship is LAST LIGHT. Once a unit brings a final ship in, the next
  run's final ship is a new one that reported home there (`05-story.md`'s final-ship names: LODESTAR next). A final ship
  that nobody reached waits for the next run, like any ship, and does not age out (except by the drift limit, §3.12). WHY: the destination is visible from
  minute one, so it must not vanish while nobody has got there.
- **Several end locations (later; the rules are ready for them).** The arm gains two more end slots, for example one past
  the inner lane, toward the core, and one past the outer lane, toward the signal. Each holds its own final ship. The
  rules that change: "one hop from the final ship" reads "one hop from any final ship" (`04-threats.md`'s boarding);
  check 4 reads "reaches at least one final ship", and each final ship needs at least two predecessors; end slots lie at
  least BEAM_RANGE_LY apart, so no route can go on from one to another; each end lies beyond ring 6 (143 LY) plus 5,
  so `05-story.md`'s last entries open at any final ship's boot; and an end may later carry its own story (CONTACT
  felt strongest toward the signal). The final ship is then a route choice: which end you head for.
- **Ships left:** the fewest and most ships still to visit after each ship, the final ship included. The card shows it,
  and `04-threats.md` and `05-story.md` pace the late acts by it.
- **Losses** keep phase 2's rules; after an emergency transmit or BEAM OUT the kid still picks the next ship on the desk.
  Losing the final ship ends the run as FINAL SHIP LOST. Only visited ships are scored (decided).

### 3.7 What makes a long hop worth taking

With every ship of similar size, the route with the most hops always wins. The answer rests on four things:

1. **The big ones are in a hurry.** Arks (15–16 pods) approach early, and only a long hop from two layers back reaches
   them. A kid can say the rule out loud: "the ark is arriving soon; only the long jump gets there in time."
2. **Slack is worth something.** A long hop's slack is about two hops' worth, so deliveries catch up (§3.9) and ECC
   cancels transit hits while you sleep.
3. **Fewer beams.** Each beam from ship 3 on can bring seeds.
4. **The cost side stays real:** a weaker link, more hits at once, a harder ship at a lower depth, one ship fewer to
   score, train on and salvage, and big landings.

The simulation (§3.13) gives (`results.txt`, the mixed player): the best route is 7 ships in 59% of runs, 6 in 41%;
5- and 8-ship routes are never quite the best, but the best 8-ship route reaches 93% of the best route in the median run
(10th percentile 90%) and the best 5-ship route 84% (64%). The best route always contains an ark. **Memory does not
change it:** even with up to two per late layer, TIGHT ships are never on the best route, so pricing them at 2 pods each (files or charge left behind) changes no route
length. Every route length is a fair plan, and none is free.

### 3.8 The repository

- **Starting kit (not from the repository):** SCAN at the start; REPAIR and Repair.bak by phase 2's first-look rule on
  ship 1 (at the boot on a returning run); phase 2's REPAIR renewal at boot stays; the arrival charge floor of 12 holds
  on COMPACT and FULL ships and is waived on TIGHT ones (round 2, 8). Every other licence goes.
- **Catalogue v1:**

  | File | Blocks | Gives |
  |---|---|---|
  | Mv | 2 | MOVE |
  | Rm | 1 | DELETE |
  | Cp | 3 | COPY |
  | Swap | 1 | SWAP |
  | Repair.bak | 4 | a spare REPAIR |
  | Scan.bak | 3 | a spare SCAN |
  | REPAIR v2 patch | 2 | every Repair copy becomes v2; the patch is used up when it installs, after the boot's REPAIR renewal |

  A file the unit already has arrives as a spare copy. `04-threats.md` and `05-story.md` may add entries.
- **Restricted (shown locked, never sent):** every skill from the tree (`Train it yourself :)`), THREAD+ and
  FIREWALL.sys. Skills stay restricted permanently. No trace changes this list: an ending at the tip reaches ARRIVAL
  CONTROL about 180 years later, long after the next unit's run (`05-story.md` §3.8), so the old `restricted add` and
  `restricted remove` knobs are gone. A trace cache may still hold a restricted file (SPARE's THREAD+).
- **One request per transmit.** It is optional and can be changed or cleared until TRANSMIT ▸.
- **ARRIVAL CONTROL's recommendation** (one `:) RECOMMENDED FOR YOU` tag, first rule that matches): the run's first desk
  → Mv; no Rm → Rm; a reachable ship within two layers reports ENGINE FAULT and there is no Swap → Swap; one REPAIR copy
  or fewer → Repair.bak; 5 or more repairs this run and no v2 → REPAIR v2; otherwise none (`You have everything you
  need :)`). It judges need only, never the ETA, and the ETA beside it always tells the truth. It skips restricted rows.
  There is no confirm when the kid requests something else (decision 19): the tag is the advice.

### 3.9 Deliveries

- **The rule (§8.3).** Requested when leaving S0 for S1: detour = |S0 − SOL| + |SOL − S1| − |S0 − S1|; lateness at S1 =
  detour − slack(S1). Zero or less: the file is waiting at S1. Otherwise S1's receiver forwards it along your route, and
  at each next ship lateness = previous lateness − that ship's slack, until it reaches zero. On screen: "the file is n
  years behind you".
- **Packing.** A file that has caught up is packed into the hop that brings you to that ship: it takes link room and
  memory room before the charge, can take transit hits, and rolls its own seed chance on that hop. Every number shows on
  the PACKET screen before the send.
- **Edge cases.**
  - *A file that never catches up before the run ends* is lost with the run. The repository says so beforehand
    (`NOTHING WILL REACH YOU IN TIME`), and the RUN TALLY lists it in one line. It does not wait for the next unit.
  - *Two or more requests in flight* are independent; all that catch up at one ship unpack at its boot, oldest first.
  - *A delivery that doesn't fit the link or the room:* its PACKET chip can be set to `SEND ON`. It stays in that ship's
    receiver and is packed into your next hop instead; on the final ship the chip says there is none.
  - *Locked files plus deliveries over the limit:* TRANSMIT ▸ waits for n blocks to be left behind or sent on. The
    locked floor alone (46 blocks; HOLLOW's root and seeds ride free) fits the weakest link (82) and every room (88).
- **Messages ride the same rule.** ARRIVAL CONTROL's reply to each LANDING REPORT is a size-0 file sent from SOL when the
  report arrives there: one ship later near Earth, two or three far out. Size 0 means no link room, no hit and no seed.
- **Mirrors** (a second source on a relay or colony, PHASE3 §8.3) stay a later addition; no trace makes one any more,
  because a colony's mind only starts at the last unit's ending.
- **The profile** (measured on fresh arms with random routes; the persistent arm keeps the same timing rules, and the
  new simulation reproduces the ship-2 row: a request from ship 2 reaches ship 3 in 91–97% of runs):

  | Request sent from layer | Catches up |
  |---|---|
  | 1 | next 97%, 2nd 3% (only long hops to an ark miss) |
  | 2 | next 100% |
  | 3 | next 83%, 2nd 17% |
  | 4 | next 16%, 2nd 53%, 3rd 28%, 4th 2% |
  | 5 | next 3%, 2nd 20%, 3rd 21%, never 56% |
  | 6–7 | never |

  Near Earth things arrive fast, from layer 4 you plan ahead, and at the far end you rely on what you trained.

### 3.10 Between ships (README assumption 2, revised)

LANDING REPORT → (save: SHIP DONE) → **DESK** → **PACKET** → **BEAM** → (save: BEAM) → BOOT.

- **DESK** (amber; both clocks stopped): the STAR CHART and SHIP CARD, plus the REPOSITORY, TRAINING (`03-skills.md`)
  and INBOX (`05-story.md`) windows. On the run's first desk, TRAINING's pick of AUTOBURN v1 or AUTODROP v1 is a
  required, guided step and comes first; then the ship, the recommended file and SET COURSE. On every later desk only
  the destination is required. TRAINING's AHEAD row and packet preview follow the selected destination.
- **PACKET** (blue): phase 2's TRANSMIT screen, with SALVAGE at its top. It adds the delivery chips, the ECC line and
  `01-landing.md`'s room bar beside the link bar; `◀ CHART` goes back until TRANSMIT ▸.
- **The salvage pool** is phase 2's (`src/data/upgrades.ts`) plus `03-skills.md`'s `+2 CYCLES` card; REPAIR v2 moved to
  the repository. On a ship whose resident left, its leftovers replace the deal: two pool cards and one skill card at v1
  of an open branch, through `03-skills.md`'s grant rules.
- **BEAM:** phase 2's send and white-out; the galaxy year jumps to the next approach.

Three screens carry the five decisions; the default path is four clicks (ship, SET COURSE, card, TRANSMIT).

### 3.11 The save

- Key `arrival-protocol/run/v1`, separate from the archive, written whole at four points, each replacing the last:

  | Point | When | A reload resumes at |
  |---|---|---|
  | RUN START | RECEIVE TRANSMISSION | ship 1's boot |
  | SHIP DONE | the LANDING REPORT's CONTINUE | the DESK of that ship |
  | BEAM | the packet has crossed: hits rolled, ECC applied, layout done | the next ship's boot |
  | ENDING CHOSEN | step 2 of the ending is confirmed on the final ship | the final ship's LANDING REPORT; the choices can't be made again |

  The run's end is written once, when the RUN TALLY opens: the archive record, the world update (§3.12) and the
  deletion of the run save happen in one step. A run lost before the final ship has no choices and is written at once.
- **Contents:** a save version and a content version (arm, generator, catalogue); the run number, its launch gap and
  the arm state it started from (§3.12); the run state phase 2 keeps; the route and the galaxy year; the deliveries in flight and in
  receivers; the memory (SHIP DONE) or the carried racks and arrival report (BEAM); the ending choices (ENDING CHOSEN);
  and one slice each from `03-skills.md`, `04-threats.md` and `05-story.md`.
- **Resume:** the title card shows `RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625`. A reload mid-ship replays that
  ship from its boot with the same seeds (decision 5). NEW RUN over a save asks, then records the unit as `abandoned`;
  the ships it visited count as done.
- **Later** (decision 5): saving mid-ship, and an ironman mode with one autosave slot, written at every point above and
  on leaving the tab, that a reload cannot rewind. Both wait for a playtest of the plain save.
- **Loud failures** (phase 2's archive pattern): a write that throws shows `RUN SAVE OFFLINE — a reload will lose this
  run` and play goes on. A save that does not parse or comes from another content version shows `RUN SAVE CAN'T RESUME`,
  the reason, and [ABANDON RUN] only.

### 3.12 Between runs: the world update and the archive

**The world update** runs once, when a run's end is written. It rolls the launch gap (§3.1) and turns the arm this run
started with, plus this run's route, into the arm the next unit starts with. It is deterministic (childRng(armSeed,
next run, 'update')) and its result is stored in the archive, so a content change can never rewrite an arm silently. In
order:

1. **Done.** Every ship the unit visited leaves the chart as a colony marker (or a grey `NO COLONY` marker when no pod
   landed). The first ship always leaves: its approach is behind the next unit.
2. **Older.** Every other ship stays, one run older. A ship more than DRIFT_LIMIT_YEARS = 10 off the next run's schedule
   (the next start year minus the start year it was timed against) leaves first, final ships included: `IT WILL COME IN
   ON ITS OWN`. A ship on its 3rd run (MAX_RUNS_ON_CHART = 3) leaves the same way. Each other generated ship leaves with
   RESOLVE_CHANCE = 20%: `ANOTHER CORE IS ON ITS WAY` or `IT WILL COME IN ON ITS OWN`, 50/50. Both are said in the future
   tense, because the ship's approach is still ahead of the new unit; it just won't be this unit's. WHY: some turnover
   makes the same arm feel new, and the drift limit keeps every waiting ship inside the margins the timing rules were
   built with (jitter ±4, ark margin 12). A gap of more than 10 years therefore clears the arm, final ship included, which
   reads as "the arm moved on while ARRIVAL CONTROL waited".
3. **The ark pattern.** The arm keeps the pattern that fits the arks still waiting (a tie is a coin flip). An ark in the
   wrong pattern leaves (`ANOTHER CORE IS ON ITS WAY`). A pattern layer without an ark gets a new one in an empty slot;
   with no empty slot, its oldest generated ship leaves to make room.
4. **Reported home.** Every empty slot gets a new ship: the next ARES at w0, a new final ship at an end slot, arks where
   step 3 asked, and otherwise light or standard ships in the number that brings the arm back to 40% light (never a
   third light ship in a layer from 5 on). New ships are timed against the next run's bases (§3.4), take their memory
   class, and fill the placement quotas of §3.5 that the waiting ships leave open. The card tags them `REPORTED HOME`.
5. **The checks** (§3.4, 1–5). On a failure the update re-rolls the new ships' timing with the next attempt number in the
   stream name. From the 5th attempt, a waiting ship that is part of the failure leaves (`IT WILL COME IN ON ITS OWN`,
   or for a late TIGHT ship blocking a layer, `ANOTHER CORE IS ON ITS WAY`) and its slot joins the new ships. It throws
   after 50 attempts (Fran's fail-loudly rule, signed off; it re-rolls only new ships and never touches a waiting ship's
   own numbers). In the simulation the first attempt passed in 77–78% of updates, the worst needed 12, and none threw.
6. **The time valve** (round 2, 1). The update scores the arm it made: the best route's pods, as the simulation does.
   If that is below VALVE_FLOOR_PODS = 63, the fresh roll's 1st percentile, the arm left behind is worse than 99 fresh
   arms in 100. The valve then adds VALVE_YEARS = 11 to the gap and runs steps 2–5 again: every waiting ship is now past
   the drift limit and leaves, so the next arm is a fresh roll around the final ship. The title says so: `UNIT-048 ·
   LAUNCHED 14 YEARS AFTER UNIT-047`. WHY: it is the one lever that fixes any arm without a special rule (time passes,
   ships move on), and it is honest on screen. It never opens upward: a best route can't beat a fresh roll's best
   (69 pods), so a good run can't hand on a richer arm. In 12,000 simulated runs it never opened, as Fran expected.

**The steady-arm rule** (the comparability rule) is steps 2–4 together: every world holds one ship at RUN START, and the
new ships put back exactly the shape a fresh roll would have. So the last route decides *which* ships wait for you, never
*how many* or *how big*. Taking the arks does not leave the next unit without arks; skipping the small ships does not fill
the arm with them; and a ship nobody wants does not sit there forever.

**Run 1** has no previous run: its arm is a fresh roll of the same rules from the archive's armSeed, with the authored
ships placed (§3.5). Its "last unit" is 046, whose trail is written with its years (`05-story.md` §3.11: WAYPOINT on
Kepler-186f in 2299, MERIDIAN on Marrow in 2350, TALLGRASS on Ostrava in 2464, then its beam stops at RELAY 19 past
Calder in 2598). Like any trail, a world reads `UNIT-046 GETS THERE FIRST` until the galaxy year passes its year; it
marks worlds only and takes no ship from the arm.

**The archive** moves to `arrival-protocol/meta/v2`. It adds:
- **The arm state:** the run number, the next start year, and per slot the waiting ship (the run it reported home, its
  attempt number, its runs on the chart, what it carries). Ships regenerate from their keys; only state is stored.
- **The last unit's trail:** its route with the year and outcome per ship, and where it was lost if it was. The next
  run's chart draws it (§4).
- **Colonies:** per world, a list of {run, unit, year, people landed, name}. A colony counts when at least one pod
  landed in an LZ. `05-story.md` names it.
- **Routes:** the last three runs' routes, for faint trails.
- **Notable events:** at most 4 per run, as `05-story.md` §3.8 ranks them.
- **Traces** earned at the ending choices (`05-story.md` §3.8), shown on the title and the final card. Every one is
  physical: it waits at the next run's final ship, where the ending happened at least a gap's worth of years earlier, or
  it is a gift that already existed on the arm before the next unit launched.
- **Trace places** attach to a ship of the next run: a gift on arrival, shown on that ship's card, with no extra beam.
  **The gift is something that already exists when you get there;** the trace only decides where you find it. Never on
  an authored ship or a `?` ship:
  - SPARE: `<UNIT>'S CACHE` (the spared HOLLOW hid it on its own way out, long ago), on a ship in layers 3–6; for 046,
    which never passed Calder, on a ship at a world of its own trail (§3.12, Run 1).
  - SUNSET: `UNIT-047 LEFT A CACHE HERE`, on a ship at a world of the last unit's route whose approach is after the last
    unit's landing there (it left a tool in that world's receiver as it passed); none qualifying, the first ship, whose
    world the last unit always visited first.
  - STAY: `<colony> · FOUNDED BY UNIT-047`, on the first ship in layers 3–6 whose approach is at least the colony's
    founding year plus its distance (its supply packet travels by light); none qualifying, the final ship.
  - CONTACT: two signal stops, on ships in layers 5–7 (the signal is always there).
  - The final ship carries the rest (PURGE, MERGE, REASSIGNMENT and the non-compliant choices' extra seed, at most one per run, which PURGE's wipe does not take), as
    `05-story.md` §3.8 lists, shown on its card as one row (`THE LAST UNIT ENDED HERE · PURGE`).
  A trace place is a tag on a ship for one run; it does not keep the ship on the chart.
- Phase 2's fields stay. The v1 key is left untouched; the title says once that a phase-2 archive was found and not
  carried over.

**Decision 7 under a persistent arm** (colonies don't change the next run): it still holds, and I recommend keeping it.
The last route does change *which* ships are left, but the steady-arm rule makes that neutral (§3.13: what the last run
took and how good the next arm is are uncorrelated). Colonies that made relays or ports would make a good last run feed
this one, which the rule exists to prevent; markers, mail and epilogues are what they do. The one exception stays the
STAY trace. §10 asks it as question 7.

### 3.13 The simulation

Script: `docs/phase3/map-sim/arm_sim.py` (Python; `example.py` beside it builds §3.14, and `results.txt` is the output
quoted here and the single source for these numbers). It runs 20 chains of 200 consecutive runs per player type, with
the random launch gap of §3.1, the update of §3.12 (drift limit and time valve included), every validity check, up to
two TIGHT ships per late layer, 15% of runs ending before the final ship, and three players: one who always takes the
best route, one who picks every hop at random, and one who does either, run by run. A fresh roll every run (the old
generator, with the same size and memory rules) is the baseline. One pod is 200 colonists.

| | Persistent: best player | Persistent: random player | Persistent: mixed | Fresh roll |
|---|---|---|---|---|
| Best route, pods (1st / 10th / median / 90th) | 65 / 67 / 68 / 69 | 65 / 67 / 69 / 69 | 65 / 67 / 68 / 69 | 63 / 66 / 67 / 69 |
| Best route length | 6: 43%, 7: 57% | 6: 52%, 7: 47% | 6: 41%, 7: 59% | 5: 1%, 6: 40%, 7: 60% |
| Best pods, runs 1–40 → 161–200 | 67.8 → 67.8 | 67.9 → 68.0 | 67.7 → 67.9 | 67.6 → 67.6 |
| Correlation: pods taken last run vs next arm's best | +0.06 | +0.03 | +0.03 | +0.02 |
| Ships waiting from last run (median of 20, 10th–90th) | 8 (5–12) | 9 (6–12) | 9 (5–12) | — |
| Launch gap (mean, median, longest) | 2.8, 2, 35 | 2.8, 2, 35 | 2.7, 2, 35 | — |
| Time valve opened | 0 of 4,000 | 0 of 4,000 | 0 of 4,000 | — |
| Run span, first to final ship (median, 10th–90th) | 732 years (726–735) | 731 (725–735) | 731 (725–735) | 721 (686–732) |

What it shows:
- **No snowball.** A good run does not make the next one easier: the correlation is near zero. The persistent arm is
  about a pod richer than a fresh roll at every percentile, whoever played the last run, because the update restores the
  shape exactly where a fresh roll can fall short; it is a level, not a feedback, and absolute ranks allow for it.
- **No decay.** Over 200 consecutive runs the best route's value does not move (67.7 to 67.9 pods).
- **The random gap holds.** Gaps average 2.7–2.8 years. The drift limit sends about one waiting ship a run off the chart
  (`IT WILL COME IN ON ITS OWN`), and a gap over 10 years clears the arm, with no dip in the best route afterwards.
- **The time valve never opened**: no updated arm fell below 63 pods (the persistent minimum is 63, the fresh roll's 1st
  percentile). It stays as the safety Fran asked for.
- **Ship supply.** Every run meets a full arm: all 20 ships lie on some route, in every run. Each update replaces about
  11–12 ships: 6 done, 2.1–2.4 aged out, 2.0–2.2 saved or came in, about 1 drifted. About 8–9 ships wait from the last
  run, so the arm is half familiar and half new. Of the ships at RUN START, 52–55% are new, 28–31% on their 2nd run,
  17% on their 3rd. The first attempt passes in 77–78% of updates, the worst needs 12, and none threw.
- **Memory.** FULL 34%, COMPACT 37%, TIGHT 29% of ships; about 2.7 late TIGHT ships per arm, and none is on the best
  route, so pricing each at 2 pods (files or charge left behind) changes no route length.
- **Near Earth.** Ship 1 is always a new calm ARES. Layer 2 always holds three ships, and a request from ship 2 reaches
  ship 3 in 91–96% of runs.
- **Authored ships** are gone by run 4 when nobody visits them; 85–87% of runs have a new final ship.
- **The span** is about 10 years longer than a fresh roll's because of the final ship's floor (§3.4): once it binds, it
  holds the final year a little above its own sum. It does not grow over the runs.

These become headless tests: the four checks and the update over 200 consecutive runs of several seeds (a statistic,
not a per-run rejection), plus §3.14 as a fixed fixture.

### 3.14 Worked example: run 1, and the update to run 2

Run 1's arm (jitter 0; arks in layers 3, 5 and 7), as ship at world, approach year and pods (L light, TIGHT; S
standard; A ark):

| Layer | Ships |
|---|---|
| 2 | PETREL at Marrow 2361 (late) 3 L · HALCYON at Tessaly 2352 5 S · OSPREY at Dunmore 2352 5 S |
| 3 | HERON at Ostrava 2512 (late) 4 L · KESTREL at Brine 2467 6 S · ALBATROSS at Pell 2365 15 A |
| 4 | CURLEW at Larkspur 2612 7 S · LAPWING at Calder 2672 (late) 4 L · GANNET at Quill 2612 7 S |
| 5 | PLOVER at Ashgrove 2712 8 S · VESPER at Cinder 2625 16 A · SKYLARK at Tamsin 2750 (late) 4 L |
| 6 | SHEARWATER at Greywater 2857 (late) 5 L · KITTIWAKE at Kettle 2817 9 S · CORMORANT at Avalon 2817 9 S |
| 7 | PROVIDENCE at Farhold 2927 10 S · GOOD HOPE at Sable 2830 16 A · WAYFARER at Endmark 2970 (late) 5 L |

LAST LIGHT is 3020: its latest in-range predecessor is WAYFARER, 2970 + 26 = 2996, plus 20, rounded up to a multiple of 5.
The corrupted residents are on GANNET (layer 4, `reported faulty`) and PROVIDENCE (layer 7, late: this arm rolled it
`unknown`); `05-story.md` puts WARDEN on GANNET. The sleeper is on CURLEW. All five checks pass, and there are 907 routes.

| Depth | Ship (world, layer) | Pods | Memory | Approach | Hop LY | You get there | Slack | Link | Hits − ECC = land |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ARES-VII (Kepler-186f, 1) | 3 | COMPACT | 2300 | | | | | |
| 2 | HALCYON (Tessaly, 2) | 5 | COMPACT | 2352 | 21 | 2321 | 31 | 123 | 3 − 1 = 2 |
| 3 | KESTREL (Brine, 3) | 6 | COMPACT | 2467 | 26 | 2378 | 89 | 117 | 4 − 3 = 1 |
| 4 | VESPER (Cinder, 5), ARK | 16 | FULL | 2625 | 55 | 2522 | 103 | 86 | 8 − 4 = 4 |
| 5 | CORMORANT (Avalon, 6) | 9 | FULL | 2817 | 30 | 2655 | 162 | 113 | 4 − 6 → 0 |
| 6 | LAST LIGHT (New Haven, end) | 16 | FULL | 3020 | 54 | 2871 | 149 | 87 | 8 − 5 = 3 |

Distances from SOL: 8, 29, 55, 107, 129, 180 LY. Potential: 55 pods, 11,000 colonists.

| Requested at | File | Detour (years) | At the first ship | Later | Unpacked at |
|---|---|---|---|---|---|
| ARES-VII, 2300 | Mv | 8 + 29 − 21 = 16 | HALCYON: 16 − 31 = −15, in time (there 2337) | | HALCYON |
| HALCYON, 2352 | Rm | 29 + 55 − 26 = 58 | KESTREL: 58 − 89 = −31, in time (there 2436) | | KESTREL |
| KESTREL, 2467 | Swap | 55 + 107 − 55 = 107 | VESPER: 107 − 103 = **4 late** (there 2629, approach 2625) | CORMORANT: 4 − 162, in time | CORMORANT |
| VESPER, 2625 | Cp | 107 + 129 − 30 = 206 | CORMORANT: 206 − 162 = 44 late | LAST LIGHT: 44 − 149, in time | LAST LIGHT |
| CORMORANT, 2817 | any | 129 + 180 − 54 = 255 | LAST LIGHT: 255 − 149 = 106 late | no ship after it | never; the repository says so |

The choices on the way: at ARES-VII, ALBATROSS (ark, 15 pods) is 51 LY away and 14 years early, reachable only now; at
HALCYON, Swap instead of Rm would have been waiting at KESTREL, but no Rm for KESTREL's first seeds; at CORMORANT, GOOD
HOPE (ark) is TOO LATE by 15 years. This run's best routes: 5 ships 13,200, 6 ships 13,800, 7 ships 13,600, 8 ships
12,800.

**The update to run 2** (UNIT-048; this example's rolls are fixed by hand, with a 1-year launch gap, so it starts in
2301; no waiting ship is past the drift limit):
- *Done:* ARES-VII, HALCYON, KESTREL, VESPER, CORMORANT and LAST LIGHT (RIVERSIDE and five more colonies).
- *Leaving:* PETREL (`ANOTHER CORE IS ON ITS WAY`) and SHEARWATER (`IT WILL COME IN ON ITS OWN`). The other 12 wait, on
  their 2nd run.
- *The ark pattern* stays 3, 5, 7: ALBATROSS and GOOD HOPE wait, and layer 5 lost VESPER, so Cinder gets a new ark.
- *Reported home:* ARES-VIII at Kepler-186f 2301 (3, COMPACT); BELLWETHER at Marrow 2362 (late, 3, TIGHT); PATIENCE at
  Tessaly 2353 (5); STEADFAST at Brine 2468 (6); TIDINGS at Cinder 2623 (ark, 16: 12 + 3 years before GANNET could reach
  it); MORNING STAR at Greywater 2858 (late, 5, TIGHT: layer 6 has no light ship left); FAR WIND at Avalon 2818 (9,
  FULL); and the final ship LODESTAR at New Haven: its own sum rounds to 3020 again, so the floor (last final year plus
  the 1-year gap) makes it 3021. The arm is back to 6 light ships and 3 arks.
- *The checks* pass at the first attempt. ALBATROSS is now 13 years early from ARES-VIII (it was 14 from ARES-VII): one
  year of drift, still the opening's big prize. Run 2's best routes: 5 ships 13,200, 6 ships 13,800 (ARES-VIII,
  ALBATROSS, TIDINGS, KITTIWAKE or FAR WIND, PROVIDENCE, LODESTAR), 7 ships 13,600, 8 ships 12,800. The same values as
  run 1, through different ships.

## 4. Screens, UI, audio, juice

**The DESK** (desktop at least 1280×720; amber, phase-2 window chrome, draggable):
- **STAR CHART** (the hero, centre): near-black space with faint arm stars; SOL at the lower left tagged `ARRIVAL
  CONTROL`, with `05-story.md`'s six key rings (the next one labelled). Ships are small square nodes (Uplink style)
  labelled `NAME · colonists` over the approach year; arks are bigger, `?` ships are question marks, TIGHT ships carry a
  small notch, and every final ship is a pulsing beacon tagged `FINAL SHIP`. Noise clouds are hatched static; your route
  is a bright trail. Lines run from your ship to every reachable ship, solid when CLEAN and increasingly hatched at LOW,
  NOISY and SEVERE. Node states: reachable (bright), urgent (slack under 10: a pulsing ring), TOO LATE or OUT OF RANGE
  (dim, the reason on hover), past (grey, `OUT OF YOUR REACH · THE NEXT CORE MAY GET
  THERE`), visited (hollow, with its outcome).
- **The last unit on the chart:** its route is a faint dashed trail (on run 1, 046's written one). While the galaxy year is before its
  landing there, a ship on it reads `TAKEN · UNIT-047 GETS THERE FIRST`; once the year passes, it becomes a colony
  marker with its real age (`RIVERSIDE · 52 YEARS OLD · UNIT-047`), so the kid watches the trail turn green ahead. Where the
  last unit was lost, the trail ends in a small grey cross. A waiting ship shows `2ND RUN ON THE CHART` or `3RD`; a new
  one shows `REPORTED HOME` for its first desk. Older colonies are faint green dots. The opening desk of a run lists, in
  one block, the ships that are no longer this unit's to take (`PETREL · ANOTHER CORE IS ON ITS WAY`).
- **SHIP CARD** (docked right; here VESPER seen from KESTREL). A large top block: name and world, `3,200 COLONISTS · 16
  PODS`, `ARK`, `FINAL SHIP` where it applies, and `APPROACH 2625 · YOU GET THERE 2522 · 103 YRS EARLY` (or `TOO LATE BY
  18 YRS`). Then Uplink-style rows: KNOWN PROBLEMS (`ENGINE FAULT`); RESIDENT (`none` / `reported faulty` / `unknown`);
  MEMORY (`01-landing.md`'s row, `MEMORY 384 · FULL · ROOM FOR YOU 152`, with the fit line against the unit you would
  send: `YOU FIT`, `CHARGE SQUEEZED: 15 ARRIVES`, `LEAVE 20 BEHIND`, or on a TIGHT ship with no floor `NO CHARGE
  ARRIVES`); PLANET and forgiveness, SITE DATA and LANDING
  ZONES (from `01-landing.md`); BEAM (`55 LY · LINK 86 · 8 HITS (ECC fixes 4) · NOISE LOW · 1 · SEEDS 0–2`); DELIVERIES
  (`Swap ✗ 4 YRS LATE` or `✓ CATCHES UP HERE`); its history (`REPORTED HOME` or `2ND RUN ON THE CHART`); and `SHIP 4 OF
  YOUR RUN · 2–3 MORE TO THE FINAL SHIP`. A trace place adds one row (`046'S CACHE IS HERE`). **On a final ship, a
  unit with no working rm gets a red row, `NO RM · YOU CAN'T DELETE THE ROOT`,** and the PACKET repeats it above
  TRANSMIT ▸. No rm means no win (round 2, 12); the warning means it is never lost silently. At the bottom a
  TIMELINE strip, `2467 you leave · 2522 you get there · 2625 ▲ approach · 2629 Swap`, marks each file green before ▲
  and red after it.
- **REPOSITORY** window: AVAILABLE (file, size, effect, the ETA for the selected destination, the recommendation tag), IN
  TRANSIT (each file and its years behind you), RESTRICTED (locked rows). One REQUEST toggle.
- **TRAINING** and **INBOX** windows: hosted here, owned by `03-skills.md` and `05-story.md`; dock badges pulse for
  unspent cycles and unread mail.
- **Bottom bar and keys:** `SET COURSE ▸ KESTREL [ENTER]`; arrows cycle the reachable ships; R / T / I open the windows.
- **Guidance strip:** every run's first desk has four steps: TRAINING's required pick first, then a ship, then the
  recommended file, then SET COURSE. Later desks get one line for anything new (the first `?` ship, the first ark, the
  first TIGHT squeeze, the first late delivery, and on run 2 the first `TAKEN` ship: `UNIT-047 got here first. :)`).

**PACKET** (phase 2's TransmitScreen): headline `NEXT: KESTREL · 1,200 COLONISTS · 26 LY · 89 YRS EARLY`; the link bar
and `01-landing.md`'s room bar; on a TIGHT ship whose room leaves no charge, the charge line turns red (`→ 0 ON
ARRIVAL`) and TRANSMIT ▸ asks `ARRIVE WITH NO REPAIR CHARGE?`; delivery chips that toggle SEND ON; `ON THE WAY: 4 TRANSIT HITS · ECC FIXES 3 WHILE YOU
SLEEP (89 YRS) → 1 LANDS`; `◀ CHART [ESC]`. `SOULS` becomes `COLONISTS`.

**BEAM and BOOT:** the send also ticks the year. I own the boot's line order; each line appears only when it has
something to say:

1. `05-story.md`'s lineage lines where they apply (the last unit's note on ship 1, the ghost line past the place it was
   lost, a stranger's line).
2. From ship 2: `> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS`, rolling the year as it types (about 1.5 s).
3. On a ship with a resident: `> RECEIVER CLOSED · this ship launched with its own AI` (`04-threats.md`).
4. Phase 2's unpack and host lines.
5. The ECC block: `> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP`; phase 2's hits line; the seeds line; the ship's own
   arrival damage (from the modifiers).
6. Deliveries, one line per file, oldest first; a patch says what it upgraded.
7. Phase 2's charge and overflow lines (a TIGHT ship's squeezed charge shows here).
8. Skills: `SKILL TRAINED`, `RETRAINED` or granted (`03-skills.md`).
9. `> 046.log · KEY FOUND …` (`05-story.md`).
10. `> n NEW MESSAGES · INBOX` (`05-story.md`).
11. HOLLOW's own line, which closes the boot when the ship has one (phase 2's rule).

Phase 2's skip rules hold. The header crumb gains the year: `UNIT-047 / KESTREL · 2467 / FLYBY`.

**The desk's opening beat:** ships whose approach passed since the last desk fade to grey one by one, with a soft
falling tone and `2 SHIPS NOW OUT OF YOUR REACH`; the last unit's ships that the year has passed turn green.

**RUN END** (I own the order; `05-story.md` owns the choices, epilogue and final card; `01-landing.md` the report):
the final ship's landing ends → **FINALE** (the root's last block, entry 12, step 1, step 2; save ENDING CHOSEN) →
after MERGE only, **THE LAST LANDING** (`01-landing.md` §3.17: the restored drivers' pods drop, by AUTODROP or blind;
[ENTER] skips the playback) → the final ship's **LANDING REPORT** (with `01-landing.md`'s `RESTORED BY MERGE` row) →
**RUN TALLY**
(mine; archive and update written) → **EPILOGUE** → **FINAL CARD** (the traces as `NEXT RUN:` lines, and NEW RUN). WHY:
the choices come while the duel is still warm and before any score is shown (decision 23), MERGE's pods land and are
scored by the normal rules before the report (round 2, 15), and the tally is the score screen. The tally lists visited ships only (`3 · KESTREL ·
2467 · LANDED 1,000 / 1,200`, with stars), the route on a small chart, `4 COLONIES FOUNDED`, any delivery that never
arrived, `03-skills.md`'s `TRAINED n of 54 · UNSPENT n`, the score, the rank and the near misses. Phase 2's absolute
ranks stay, in SCORE points (SHEPHERD 3,000, CARETAKER 6,800, ARK ANGEL 10,700): a run's best route is worth 13,400–13,800
(10th to 90th percentile) whatever its length and whatever the last run did, so absolute ranks stay fair across runs.

**Title card:** the chart behind the logo with the final ship pulsing, under `05-story.md`'s title line; `runs save
between ships`; the RESUME block when a save exists; from run 2, the last unit's trail.

**Phone (≤ 768 px):** the arm runs from SOL at the bottom to the final ship at the top; a tap opens the card as a bottom
sheet; the windows are tabs; SET COURSE is pinned at the bottom.

**Audio** (existing cues): `typeTick` on hover, `chime` on select and on each delivery at the boot, `buzz` on a TOO LATE
click, `lockArp` on SET COURSE, a soft tick ratchet for the year roll, a quiet low tone per greying ship, a soft rising
note when one of the last unit's ships turns green. Reduced motion drops the pulses and fades and keeps every piece of
information.

## 5. Interfaces

**I need from `01-landing.md`:** colonists per pod (assumed 200); the 16-pod cap; its roller, which takes (slot, layer,
pods) and returns the LZs, widths, forgiveness class and card label, site data and driver damage; **the memory classes**
(FULL 384, COMPACT 320, TIGHT 256), the room for the unit per class (152, 152, 88), its class rule (which I apply), the
MEMORY card row and fit line (`NO CHARGE ARRIVES` on a TIGHT ship), the PACKET's room bar and its no-charge confirm;
THE LAST LANDING after MERGE (§3.17) and the `RESTORED BY MERGE` report row; the locked unit files (46); the rack layouts per class (the Debris modifier names only racks
the ship has); the landing report's numbers; the stars and their arrival charge. Assumed: the room is fixed per class, so
the card can compute the fit before the hop.

**I need from `03-skills.md`:** skill file sizes per version (they press on the link and on the room); the TRAINING
window with its required first pick; the grant rules behind the leftover skill card and the `+2 CYCLES` card; the
`TRAINED n of 54 · UNSPENT n` line; its boot lines; its save slice; the second packet limit (files + 12 ≤ the next
ship's room, files alone on a TIGHT ship). The tree resets each run (UNIT-048 inherits nothing).

**I need from `04-threats.md`:** its seed table, rolled with my hop streams; the resident kinds and map lines; **"late"
for a corrupted resident = layers 6–7**, shown `unknown` 1 time in 2, never on an ark, no extra modifier; its depth-based
schedule, which reads "is any final ship in range of this destination" from me (forced boarding on the beam into a ship
one hop from a final ship); TRACE and HOLLOW start fresh each run; its per-ship record of eaten drivers (for MERGE); its
boot lines; its save slice; hitchhikers (root, beam seeds, seeds on deliveries) riding free of link room; the final-ship
traces of `05-story.md` §3.8 (PURGE's wiped seeds and hungrier FINALE, MERGE's thread and bigger root, the extra seed,
REASSIGNMENT's root). Residents on a waiting ship are the same AI next run and count toward that run's caps.

**I need from `05-story.md`:** world, ship, final-ship and colony names, and the ARES series; the six ring distances;
the three `?` event kinds and the 5 fragments; the beats at the first ship, HOLLOW's arrival and the final ship; CONTROL's
lines for the desk, the repository and the chart (`TAKEN`, `REPORTED HOME`, the leaving reasons); the INBOX window;
its boot lines; the trace ids and where each waits; the choices, the explicit ending lines on the final
LANDING REPORT, the epilogue and the final card; its save slice.

**I provide to all four:** the arm and its load-time check; the arm state (per slot: the waiting ship's approach year,
timing type, pods, memory class, template, modifiers, `?` flag, resident, trace place, runs on the chart); per hop:
distance, link, hits, ECC, noise, slack, the next ship's room; per visit: depth, ships left, whether a final ship is in
range, whether this is a final ship; the galaxy year; the route so far; the last unit's trail; the boot's line order; the
save envelope and its four moments; the run-end order; the world update; the archive. Also:
- to `01-landing.md`: the class, memory class and pod count of every ship, and the card rows where its parameters show;
- to `03-skills.md`: the link and room numbers that make file sizes matter, and the window host;
- to `04-threats.md`: deliveries packed into the hop, the hop streams, the modifier library, the final-ship flags;
- to `05-story.md`: every ship's distance from SOL; the run number, start year, the final ship's year and name; the last
  unit's trail and where it was lost; events (ship chosen, `?` revealed, colony founded, ship greyed, a `TAKEN` ship
  turned colony, fragment collected); the launch gap and any valve years; CONTROL's replies as size-0 files; trace
  places; the INBOX host.

## 6. Phase 2: reused, changed, removed

- **`src/systems/run.ts`:** the phase machine gains a desk phase between the report and the transmit, and a finale
  phase before the final ship's report. The ship index becomes the depth; a slot field names the ship. `goTransmit`
  takes link, room and hits from the hop. `isLastShip` and the flagship test become "is a final ship". `endShip` writes
  SHIP DONE; `transmitNext` writes BEAM.
- **`src/systems/transmit.ts`, `src/components/run/TransmitScreen.ts`:** the PACKET screen. Chips, drops, locks, arm
  delay, send and white-out stay; delivery chips, the ECC line, the room bar, years and `◀ CHART` are added.
- **`src/systems/carry.ts`:** `packUnit`, `layoutCarried`, the floors and the Core cap stay; the room per class comes
  from `01-landing.md`. `rollTransitHits` gets round(d / 7) plus extras, minus ECC. `arrivalDamage` reads the modifiers.
- **`src/systems/draft.ts`, `src/data/upgrades.ts`:** unchanged mechanics, now called SALVAGE; REPAIR v2 leaves the pool.
- **`src/systems/licences.ts`:** the timed licences and `licenceSchedule` go; REPAIR's first-look rule,
  `renewRepairAtBoot` and the install placement (reused by deliveries) stay.
- **`src/systems/meta.ts`:** the same loud pattern with the v2 shape (§3.12), plus the arm state and the world update as
  a sibling module (`arm-update`) with the storage-provider seam, so headless suites can run 200 runs.
- **`src/systems/run-end.ts`, `RunEnd.ts`, `run-score.ts`:** split in the run-end order of §4; my part is the RUN
  TALLY's model (visited ships only; "NOT REACHED" and `fleetSouls` go). The archive write moves to the tally.
- **`src/systems/boot.ts`, `src/data/script.ts`:** the boot lines and line order of §4; text for the desk, card and chart.
- **`src/data/ships.ts`:** the five definitions stay as run 1's authored ships and the flight templates. Link, hits and
  distance are computed per hop, damage becomes modifiers, `licences` goes, `flagship` becomes "final".
  `validateShipDef` runs on every generated ship; `validateFleet` becomes §3.4's checks.
- **`src/data/mission.ts`, `src/data/tuning.ts`:** `FLEET_ROUTE_LY` (581) goes. New constants, each with its WHY from
  here: BEAM_RANGE_LY, the link and hit formulas, ECC_YEARS_PER_HIT, LAYER_SLACK, the timing offsets and jitter,
  ARK_MARGIN_YEARS, the pod formulas, LIGHT_SHARE, MAX_LATE_TIGHT_PER_LAYER, FINAL_MARGIN_YEARS, RUN_START_YEAR,
  LAUNCH_GAP_TABLE, DRIFT_LIMIT_YEARS, VALVE_FLOOR_PODS, VALVE_YEARS, MAX_RUNS_ON_CHART, RESOLVE_CHANCE, the sleeper's
  45%, the noise numbers. The arm's positions go in a new data file.

## 7. Story hooks

`05-story.md` owns the writing; the map offers: the last unit's trail turning green ahead of you; `TAKEN · UNIT-047
GETS THERE FIRST`; the ARES series, one for each core, never explained; the
launch gap on the title; `REPORTED HOME`, `ANOTHER CORE IS ON ITS WAY` and `IT
WILL COME IN ON ITS OWN`, which say the arm goes on without you; the greying ships `OUT OF YOUR REACH`; the sleep line;
`?` ships; the grey cross where the last unit was lost; a new final ship's name at the tip; the three `?` story events
and the signal fragments; and the relay where 046 lives as a later map stop.

## 8. Slices

- **Slice 1 (landing on the five ships):** COLONISTS replacing SOULS on the TRANSMIT screen.
- **Slice 2 (calm opening):** nothing; depth still equals phase 2's ship index.
- **Slice 3 (the map),** in three parts:
  - **3a:** the arm data, run 1's roll and its checks, generated ships from the five templates, memory classes on the
    card, the DESK with the chart, the card and SET COURSE, link, room and hits, ECC, the years, the RUN TALLY for
    visited ships, the final-ship role (one end slot), and `?debug` helpers (jump to a slot, set a route, set the run
    number). The generator reserves resident, `?` and fragment slots from 3a so arms don't change when they arrive.
  - **3b:** the repository and deliveries, the delivery chips, the sleep and delivery boot lines.
  - **3c:** the run save, archive v2 and the world update (the launch gap, the ARES series, the last unit's trail,
    `TAKEN`, the leaving reasons, the drift limit, the steady-arm rule, the time valve).
  - Tests: the checks and §3.13's statistics over 200 consecutive runs; §3.14 as a fixture for the delivery rule and the
    update; save round trips and every failure path. The e2e playthrough needs a scripted route through `?debug`.
- **Slice 4 (tree):** the TRAINING window on the desk; skills in the restricted list.
- **Slice 5 (residents):** the RESIDENT row, the hidden late corrupted resident, the leftover deck.
- **Slice 7 (endings and traces):** the run-end order with the finale and THE LAST LANDING before the final report,
  the final-ship traces and trace places. Several end locations come after slice 7, once one end plays well.
- **Slice 8 (rebalance):** LAYER_SLACK, the ark margin, the link formula, ECC, the TIGHT room against `03-skills.md`'s
  file sizes, and the update's turnover (MAX_RUNS_ON_CHART, RESOLVE_CHANCE).

## 9. Deviations from PHASE3.md

1. **§1, §9 "the next run is the next wave, decades later"** becomes Fran's timeline (DECISIONS): the next core, 0–35
   years later (round 2), on a persistent arm. "Wave" is dropped as the unit; the word is **run**, and the arm between runs is **the arm
   state**.
2. **§8.5 "A delivered file arrives in the beam"** is made concrete: it is packed into the hop that brings you to the ship
   where it caught up, with SEND ON for a full link or room.
3. **§9 "What each ship shows"** adds the beam facts, memory, the depth, the ships left, the run history and the timeline.
4. **§9 "Layered branches"** kept, with connections from time and range, not drawn edges.
5. **§8.5 "the repository supplies … REPAIR v2"** while the draft stays: REPAIR v2 leaves the salvage pool.
6. **§13's slices:** the repository moves into slice 3 (decision 8).
7. **README assumption 2:** salvage on the PACKET screen; the tree and the request as desk windows; the save gains RUN
   START, SHIP DONE and ENDING CHOSEN besides the beam.
8. **§10 "When there are no more ships to assist, the score is tallied"**: the ending choices now come before the tally
   (decision 23), on the final ship, and its LANDING REPORT follows them.
9. **§9 "LAST LIGHT" as the fixed end, and §6.2 "VESPER's ghost thrust becomes the corrupted resident":** the final ship
   is a role (decision 3); VESPER keeps ENGINE FAULT and has no resident.
10. **§9 "Colonies come back on the map decades later"**: the last unit's colonies are on the next run's chart at their
    real age; older ones are faint dots. Relays and ports from colonies stay later.
11. **New rules** not in PHASE3, all signed off or in §10: the 58-LY beam range, ECC while asleep, the ark pattern,
    link and hits by distance, noise as clouds, the steady-arm rule, the 3-run age cap, the drift limit, the time
    valve, the TIGHT check.

## 10. Risks and questions for Fran

**Risks.**
- **Menu fatigue.** One desk screen, a guided first desk, nothing required but the destination, the four-click path.
- **The delivery rule may not read.** "n years behind you", the timeline strip, the path through SOL, and the
  recommendation as a safe default. §3.14 becomes a unit test.
- **The persistent arm may not read either.** Mitigation: one block of "what happened this year" on the opening desk,
  three short tags (`TAKEN`, `REPORTED HOME`, `2ND RUN ON THE CHART`), and nothing else to learn.
- **SHIP variety is narrow:** re-skins of five tuned flights; variety comes from size, memory, modifiers, landing and
  threats.
- **A content change invalidates saves and arm states,** loudly by design: a new build that changes the generator starts
  a fresh arm (run 1's roll at the next run number), with the archive's history kept.

**Settled in round 2** (DECISIONS): the steady arm, plus a time valve (§3.12, 6); authored ships age out; the final ship
is a role, one end in v1, always FULL; up to two TIGHT ships per layer from layer 5, none forced; no charge floor on
TIGHT ships; nothing carries to the next unit; decision 7 holds; no rm means no win, with the warning (§4); the launch
gap is random, 0–35 years (§3.1); hitchhikers ride free.

**Questions, each with my recommendation.**
1. **The drift limit** (a waiting ship more than 10 years off the new schedule leaves), which the random gap needs: a gap
   over 10 years clears the arm. *Recommend yes:* the timing rules only hold within those margins, and "the arm moved
   on while ARRIVAL CONTROL waited" reads well after a long gap (about 2% of launches).
2. **The time valve as defined** (opens below 63 pods, the fresh roll's 1st percentile, and adds 11 years). *Recommend
   yes.* It never opened in the simulation, as you expected, but it costs nothing and catches any arm a future rule
   change might starve.
3. **Traces become physical** (`05-story.md` §3.8): they act at the next run's final ship or are gifts that already
   existed, and none changes the restricted list any more, because ARRIVAL CONTROL learns of an ending about 180 years
   later. *Recommend yes;* 05 Q1 has the details.
