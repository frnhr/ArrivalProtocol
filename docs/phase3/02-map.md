# 02 · The galaxy map, time and the run

Spec for PHASE3 §9, the run structure of §1, the delivery rule of §8.3, the repository of §8.5, the between-ships flow
and the save. Template: `docs/phase3/README.md`. All numbers are starting values for `src/data/tuning.ts`, each with a
one-line WHY here; balance is low priority (PHASE3 §11).

## 1. Summary

- A run crosses one **hand-placed arm of 20 worlds in 8 layers**, from ARES-VII near Earth (SOL, where ARRIVAL CONTROL
  sits) to **LAST LIGHT at the tip**. LAST LIGHT is always the final ship, and the chart shows it from the title card on.
- Each run (wave) rolls a **new schedule on the same arm**: arrival years, ship sizes, known problems and link noise. A
  beam reaches at most **58 LY**, so a hop crosses one or two layers, and every route visits **5–8 ships**.
- Time is in whole years and whole light-years. You leave a ship at its approach year. The **slack** is how many years
  early you reach the next ship. A ship you can't reach before its approach is TOO LATE.
- **The long-hop answer (open question 1):** the biggest ships (ARKS, 15–16 pods) approach early, and only a long hop
  reaches them in time. Slack also has a value: deliveries catch up, and ECC repairs transit hits while you sleep. A
  long hop costs link blocks and hits. In 1,000 simulated waves no route length always wins.
- **The repository** replaces licences: one optional request per transmit, delivered by §8.3's rule. Near Earth a request
  almost always reaches the next ship; from layer 4 you plan ahead; at the far end you rely on what you trained. A file
  that has caught up is packed into the hop that brings you to that ship (link room, hits, seeds).
- **Between ships:** LANDING REPORT → DESK (star chart, ship card, repository, training, inbox; SET COURSE) → PACKET
  (salvage and the packet: phase 2's TRANSMIT screen) → BEAM. The run saves at RUN START, SHIP DONE and BEAM.
- **The archive** keeps the colonies founded on the arm, the last routes, the traces and the calendar. The next wave
  starts 40 years after the previous wave's LAST LIGHT approach.

## 2. The player's experience

The numbers below are §3.13's example wave.

**The first time.** The title card shows the star chart behind the logo: SOL at the lower left, a band of stars sweeping
up and to the right, and at the far end a slow amber beacon, `LAST LIGHT · 3020`. RECEIVE TRANSMISSION draws a beam from
SOL to ARES-VII, and the ship-1 tutorial plays.

After the LANDING REPORT the screen opens the amber **DESK**. Its first guided step opens TRAINING with two cards,
AUTOBURN v1 or AUTODROP v1 (`03-skills.md`'s tutorial pick), and the kid takes one. Then six lines fan out from
ARES-VII, three short and three long, and ARRIVAL CONTROL types `Lovely work, Unit 47! :) Pick your next ship.` The kid
clicks the nearest node, HALCYON: `1,000 COLONISTS · 5 PODS · APPROACH 2352 · YOU GET THERE 2321 · 31 YRS EARLY`, `LINK
123 · 3 HITS (ECC fixes 1)`, and TRAINING's AHEAD row updates for it. Then the kid notices a bigger node tagged ARK at the
end of a long line: `ALBATROSS · 3,000 COLONISTS · 14 YRS EARLY`, 51 LY away at Pell, `LINK 90 · 7 HITS`, and in red
`ONLY FROM HERE: from any layer-2 ship you'd be TOO LATE`. That is the run's first real decision: two easy small ships,
or one big ship now.

The repository tags `Mv` with `:) RECOMMENDED FOR YOU` and prints `mv · ARRIVES 2337 · HALCYON APPROACH 2352 · IN
TIME`, while the chart draws a dotted pulse from ARES-VII back to SOL and out to HALCYON. SET COURSE opens the blue
PACKET screen (phase 2's TRANSMIT): salvage cards, the packet against `LINK 123`, `3 TRANSIT HITS · ECC FIXES 1 WHILE YOU
SLEEP (31 YRS) → 2 LAND`. TRANSMIT ▸, white-out, and HALCYON's boot opens with `> ASLEEP IN HALCYON'S RECEIVER · 2321 →
2352 · 31 YEARS` (the years roll as it types), then `> DELIVERY: mv (arrived 2337)`.

**Later in the run.** At KESTREL (ship 3, 2467) the desk opens with a falling tone, `2 SHIPS APPROACHED WITHOUT A
CARETAKER`, and ALBATROSS turns grey. Rm, asked for at HALCYON, was waiting at KESTREL when its first seeds came. Now the
chart offers VESPER, an ark of 16 pods with `ENGINE FAULT`, 55 LY away across a hatched noise cloud, 103 years early,
`LINK 86 · 8 HITS (ECC fixes 4) · NOISE LOW · 1 · SEEDS 0–2`. CONTROL recommends Swap for it, and the repository answers
honestly: `Swap · ARRIVES 2629 · VESPER APPROACH 2625 · 4 YRS LATE → follows your route`. Asking for Swap at HALCYON
would have beaten it, but that request was Rm. The layer-4 ships are 24–31 LY away on CLEAN beams with no hits left
after ECC, but they carry 4–7 pods. A big ship flown without SWAP, or a gentle ship on a clean beam: the kid weighs it.

**Run two.** The same arm, with new years and new ships. Worlds where the last unit landed pods glow green (`TESSALY ·
WAVE 1 · 1,000 LANDED`), and the last unit's route is a faint trail ending in `UNIT-047`. The first year is 3060, 40
years after this wave's LAST LIGHT approach.

## 3. Rules and starting numbers

### 3.1 Time and distance

- All distances are whole light-years: the straight-line distance between two positions, rounded to the nearest whole
  LY, and every rule uses that rounded number. All years are whole years. WHY: the kid can redo every sum on screen.
- Ship S has an **approach year** A(S) (PHASE3's "arrival year"; the screen says APPROACH, because "arrive" is the
  caretaker's word). You leave S at A(S); the hours of an approach are negligible.
- Leaving S0, you reach S1 at A(S0) + d, where d = |S0 − S1|. **Slack** = A(S1) − A(S0) − d. S1 is **reachable** when
  the slack is zero or more and d ≤ BEAM_RANGE_LY.
- The **galaxy year** is A of the ship you are on. It is a third time scale (README assumption 7). It never moves during
  a ship and jumps only at the beam.

### 3.2 The arm

The arm is data (one hand-placed set, the same for every player; question 6), with stable world ids. SOL is at (0, 0).
Layer centres sit 8, 30, 55, 80, 105, 130, 155 and 180 LY from SOL along a gentle bend of 0.10 radians per layer.
Layers 2–7 hold three worlds each on three lanes (inner, centre, outer) 11 LY apart, with a few LY of hand nudge for the
look. WHY: the first hop is phase 2's 22 LY and later layers are 25 LY apart, so single hops are 21–45 LY (phase 2's
were 22–36); two-layer hops are 45–70 LY and three-layer hops at least 70 LY.

Each cell is world id, world name, position in LY from SOL (x, y), and, when authored, the ship:

| Layer | Inner lane | Centre lane | Outer lane |
|---|---|---|---|
| 1 | | w0 Kepler-186f (8, 0), ARES-VII | |
| 2 | w1 Marrow (33, −10) | w2 Tessaly (29, 4), HALCYON | w3 Dunmore (30, 16) |
| 3 | w4 Ostrava (54, 1) | w5 Brine (54, 10), KESTREL | w6 Pell (53, 24) |
| 4 | w7 Larkspur (81, 13) | w8 Calder (75, 21) | w9 Quill (73, 35) |
| 5 | w10 Ashgrove (100, 29) | w11 Cinder (98, 43), VESPER | w12 Tamsin (91, 52) |
| 6 | w13 Greywater (121, 51) | w14 Kettle (114, 62) | w15 Avalon (107, 72) |
| 7 | w16 Farhold (136, 78) | w17 Sable (128, 90) | w18 Endmark (121, 96) |
| 8 | | w19 New Haven (138, 116), LAST LIGHT | |

The ids and positions are mine; `05-story.md` §3.11 owns the names (these are its list, with Larkspur, Quill and
Ashgrove replacing my placeholders Riverside, Juno and Hollin). Generated ships take names from its ship-name pool, never
their world's name.

**The arm check** (at load, like phase 2's ship validators): every one-layer pair is within BEAM_RANGE_LY (the longest is
45 LY), no pair three or more layers apart is (the shortest is 70 LY), and, for `05-story.md`'s `046.log` keys, no world
lies within 5 LY of a ring. The rings are its data, 20, 45, 68, 93, 118 and 143 LY from SOL, in the gaps between my
layers; the chart draws them (§4). The current arm passes with at least 9 LY to spare.

### 3.3 The beam: range, link, hits, ECC, noise

| Rule | Starting value | WHY |
|---|---|---|
| BEAM_RANGE_LY | 58 | Every one-layer hop and most two-layer hops, never three layers (at least 70 LY). At 52, a third of simulated waves were invalid. |
| Link blocks | round(146 − 1.1 × d) | 22 LY gives 122 (phase 2: 120). A 55-LY hop carries 27 blocks fewer than a 30-LY hop, about half a mid-run unit's charge. On this arm links run 82–123 blocks: never below the locked floor of 62 (with HOLLOW aboard: 44 locked unit files, `046.log` 2, the root up to 16), never above `01-landing.md`'s 131-block bound for the rack D tail. |
| Transit hits | round(d / 7) | Phase 2's 3–6 hits on 22–36 LY; damage follows distance, so a route's total hardly depends on how it is split. |
| ECC while asleep | one hit fewer per 25 years of slack | A ship reached 50 years early cancels 2 of about 4 hits; an ark reached just in time cancels few or none (question 2). |
| Extra hits | BEAM OUT +2, emergency +3 and Core −25 (phase 2) | Unchanged; ECC counts against the total. |
| Noise clouds | 4 per wave in layers 3–7, at least 45 LY from SOL, radius 12–18 LY; three of strength 1, one of strength 2 | Space weather a kid can see and avoid. The inner arm stays clean: seeds start at ship 3 anyway. |
| Link noise | the sum of the strengths of the clouds the hop's line crosses, at most 3: CLEAN, LOW, NOISY, SEVERE. On screen always the word with the number in small print, `NOISE LOW · 1`, and from ship 3 the seed range from `04-threats.md`'s table: CLEAN 0, LOW 0–2, NOISY 0–3, SEVERE 0–3 (`SEEDS: none` before ship 3) | "Count the clouds on the line." Long lines cross more of them. |

**One transit-hit formula:** round(d / 7), minus ECC, plus the BEAM OUT and emergency extras. Noise does not add hits; it
sets seeds only, by `04-threats.md`'s table: CLEAN 0, LOW 0.45, NOISY 1.1 and SEVERE 1.85 seeds per beam on average,
from depth 3 on, and a delivery carries a seed with a chance of 0, 10, 25 or 40% on its hop.

### 3.4 The schedule (one per wave)

- **Layer base years.** B1 = the wave's start year (2300 on wave 1). B(k+1) = B(k) + the axis gap (22, then 25) +
  LAYER_SLACK(k), with LAYER_SLACK = 30, 90, 120, 75, 80, 85, 90 years. Wave 1: 2300, 2352, 2467, 2612, 2712, 2817,
  2927. WHY: big slack on the hops out of layers 2 and 3 makes a request from layers 1–3 reach the next ship almost
  always (Fran: near Earth "things pretty much always arrive fast"); the smaller slack beyond, against a detour that keeps
  growing, starts the planning at layer 4 (§3.9's table).
- **Timing per ship.** A(S) = B(layer) + offset × LAYER_SLACK(layer − 1) + jitter, with jitter a whole number of years in
  −4…+4. Offsets: ON TIME 0, LATE +0.5 (+0.3 in layer 2, so a request from a late ship 2 still makes ship 3). Every
  non-ark ship rolls ON TIME or LATE at 50/50.
- **Arks.** Each wave puts one ark in every second layer, either layers 3, 5 and 7 or layers 4 and 6 (50/50), on a
  random lane. An ark approaches ARK_MARGIN_YEARS = 12 years before an on-time ship of the layer before could reach it:
  A = B(layer) − LAYER_SLACK(layer − 1) − 12 + jitter. It is therefore unreachable by a one-layer hop and reachable by a
  long hop from two layers back. WHY: §3.7; an absolute margin keeps the rule readable and the check always true.
- **ARES-VII** approaches at B1 and has 3 pods (`01-landing.md`'s ship-1 tutorial: one WIDE site). **LAST LIGHT** has
  16 pods, and its year is the latest of A(S) + d over every ship that has it in range, plus LL_MARGIN_YEARS = 20,
  rounded up to a multiple of 5 (3020 in §3.13). WHY: it can be reached from every layer-7 ship and from any layer-6
  ship within range.
- **Ship size.** At most 16 pods on any ship (`01-landing.md` §3.16: 20 pods do not fit in 384 blocks). Pods: light 3 +
  ⌊layer / 3⌋ (3–5), standard 3 + layer (5–10), ark round(2.2 × (4 + layer)) capped at 16 (15 in layer 3, 16 beyond).
  Non-ark ships are 40% light and 60% standard. WHY: with the cap, standard ships one pod smaller is the smallest change
  that keeps route lengths balanced (§3.7). I assume 200 colonists per pod (phase 2's cluster); the generator reasons in
  pods, so `01-landing.md` may change that number.
- **Seeds and streams.** Every per-ship roll uses childRng(runSeed, slot, stream), keyed by the world's slot (0–19), not
  by depth, so a ship rolls the same whatever route led to it. Hop rolls (transit hits, beam seeds) use the destination's
  slot with the origin in the stream name; each delivery on the hop rolls its own seed chance in that stream
  (`04-threats.md` uses these keys). The salvage deal uses the slot being left.
- **Validity.** After rolling, the generator checks that (1) every ship except LAST LIGHT has a reachable successor;
  (2) every ship except ARES-VII has a reachable predecessor; (3) no ark is reachable by a one-layer hop; (4) every
  layer-7 ship reaches LAST LIGHT. On failure it re-rolls with the next attempt number in the stream name, and it throws
  after 50 attempts (Fran's fail-loudly rule). In 1,000 simulated waves the first attempt passed in 985; all 15 failures
  were a layer-6 ark with no predecessor in range. Each attempt passes with that same 98.5%, so a throw never happens in
  practice.
- **Then placement** (§3.5's rules), in this order: the three `?` story events, the corrupted residents, the residents
  that left, the sleeper, the signal fragments, then templates and modifiers for the remaining slots, then
  `01-landing.md`'s and `04-threats.md`'s rollers.

### 3.5 Ships: authored, generated, unknown

- **Flight templates.** A generated ship reuses one of the five phase-2 flight blocks unchanged (start, ring, warps, Δv,
  the per-ship shrink tuning): IMPACT-A (ARES-VII), WIDE (HALCYON), WIDE-B (KESTREL), CAPTURE (VESPER), IMPACT-B (LAST
  LIGHT). WHY: those numbers were swept per ship in phase 2 (the shrink rule, guidance, AUTOBURN). A new template enters
  only after the same sweeps pass. Only `omega0` (the picture's orientation) is re-rolled.
- **Modifier library** (ship-side; shown under KNOWN PROBLEMS):

  | Modifier | What it is (phase 2) | Allowed on | From layer | Card label |
  |---|---|---|---|---|
  | Impact course | the template's own rp0 below the surface | IMPACT-A, IMPACT-B | 2 | `IMPACT COURSE` |
  | Too wide | the template's own wide flyby | WIDE, WIDE-B | 2 | `FLYBY, TOO WIDE` |
  | Uncertain path | Sensor Interp arrives at most 45% | any template | 3 | `SENSOR DAMAGE` |
  | Debris | KESTREL's cloud, names a seeded rack | WIDE-B | 3 | `DEBRIS · RACK ?` |
  | Engine fault | Thrust Ctrl arrives at 31% (ghost thrust) | CAPTURE | 4 | `ENGINE FAULT` |
  | Radiation belt | LAST LIGHT's belt on racks A–B | IMPACT-B | 5 | `RADIATION BELT` |

  Extra modifiers per generated ship: up to none in layer 2, 1 in layers 3–5 and 2 in layers 6–7, drawn from those
  allowed on its template. Modifiers belong to the slot while threats follow depth, so a long hop brings a harder ship at
  a lower depth: part of its cost. A pair outside the table needs a headless probe first.
- **Authored ships** keep name, world, template and modifiers every wave; their size and timing come from the slot's roll
  (VESPER is an ark when its lane draws it). ARES-VII and LAST LIGHT are fixed: depth 1 and the final ship. HALCYON,
  KESTREL and VESPER are optional, so beats that must happen attach to depth (`05-story.md`), not to them. VESPER keeps
  phase 2's ENGINE FAULT, the SWAP lesson, and never carries a resident.
- **Generated ships:** a name from `05-story.md`'s pool, a template allowed at the layer (layer 2: IMPACT-A or WIDE;
  WIDE-B from layer 3, CAPTURE from 4, IMPACT-B from 5), modifiers by the table, and parameters from `01-landing.md`'s and
  `04-threats.md`'s rollers.
- **Unknown ships (`?`):** three per wave, one for each `05-story.md` story event kind, in three different layers, never
  authored and never LAST LIGHT: **old colony** (layers 3–5), **gone resident** (layers 3–6) and **signal** (layers
  5–7). The card shows the public schedule (approach, slack, distance, noise); everything else reads `??? · NO
  TRANSPONDER`.

**Placement by layer.** Threat and story placement follow `04-threats.md`'s and `05-story.md`'s depth rules, translated
through the lowest depth per layer (§3.6):

| What | Where | How many | Notes |
|---|---|---|---|
| POOR site data (`01-landing.md`'s survey planets) | layer 5 and later | layer 5: 1 in 3; layers 6–7: 1 in 2 | LAST LIGHT's site data is authored by `01-landing.md` |
| Corrupted resident (`RESIDENT: reported faulty`) | layers 4–7, CAPTURE template only | at most 2 per wave: one in layers 4–5 and one in layers 6–7, never in adjacent layers and never linked by a reachable hop | Not on VESPER, a `?` ship or LAST LIGHT. It brings its own engine source (`04-threats.md`), so its ship never also carries ENGINE FAULT |
| Resident that left (`RESIDENT: unknown`) | layers 2–7 | 5 per wave: the gone-resident `?` ship and 4 ordinary ships, at least one in layer 2 | Its leftovers replace that ship's salvage deal (§3.10) |
| Sleeping resident (`RESIDENT: unknown`, only ever) | layers 3–7 | at most one, in 60% of waves | On the old-colony or signal `?` ship, or on an ordinary ship without a resident |
| No resident | ARES-VII, LAST LIGHT, and every other ship not picked above | about half the arm | |
| Signal fragments (`05-story.md`; CONTACT needs 3) | layers 3–7 | 5 per wave: 2 on the signal event, 1 on the gone-resident event, 1 in each of two ordinary departed residents' notes | `05-story.md`'s "half the notes point outward" |

The corrupted residents are placed first and their slots take the CAPTURE template. That forcing is needed: with
templates rolled freely, two could be placed in only 42% of 1,000 waves (one in 52%, none in 6%). Forced, two are placed
in every wave, a random route meets one in 47% of runs, and they are 1 in 8 of the middle ships a run visits (against
`04-threats.md`'s starting share of about 1 in 7, which "at most 2 per wave" caps). No route ever met two in a row.

Proposal for `05-story.md`, since fragments are scattered: once the kid holds one fragment, the chart marks every other
fragment ship with a faint `▓░` glyph, so CONTACT becomes a route the kid plans rather than luck.

### 3.6 The run's structure

- **Depth** is the N-th ship visited (README assumption 3). Hops cross one or two layers, so every route has 5–8 ships.
  The lowest depth per layer is 2 in layers 2–3, 3 in layers 4–5, 4 in layers 6–7 and 5 at LAST LIGHT: a calm ship
  (depth 1–2) can only be in layers 1–3.
- **The final ship** is always LAST LIGHT, because every chain of reachable hops ends there (§3.4 checks 1 and 4). The
  decided rule "the run ends when no remaining ship can be reached" then ends every surviving run after LAST LIGHT's
  landing: nothing lies beyond the tip, and every other ship is in the past. The root duel stays on the final ship.
- **Ships left:** the fewest and most ships still to visit after each ship, LAST LIGHT included. The card shows it, and
  `04-threats.md` and `05-story.md` can pace the late acts by it.
- **Losses** keep phase 2's rules (§4.3); after an emergency transmit or BEAM OUT the kid still picks the next ship on the
  desk. Losing LAST LIGHT ends the run as FLAGSHIP LOST. Only visited ships are scored (decided).

### 3.7 What makes a long hop worth taking (open question 1: recommendation)

With every ship of similar size, the route with the most hops always wins: in 1,000 simulated waves with the same
schedule and no size difference, the 8-ship route had the best potential in every one. My recommendation rests on four
things:

1. **The big ones are in a hurry.** Arks (15–16 pods, about twice a standard ship) approach early, and only a long hop
   from two layers back reaches them. Taking an ark means skipping one or two smaller ships. A kid can say the rule out
   loud: "the ark is arriving soon; only the long jump gets there in time."
2. **Slack is worth something.** A non-ark long hop's slack is about two hops' worth, so deliveries catch up (§3.9) and
   ECC cancels transit hits while you sleep (§3.3). Arks get less: from 14 years (from ARES-VII) to about 100.
3. **Fewer beams.** Each beam from ship 3 on can bring seeds. Fewer hops mean fewer rolls (`04-threats.md`; I recommend
   that HOLLOW's scouting counts beams rather than depth, so a long, careful route stays cheaper in seeds).
4. **The cost side stays real:** a weaker link (less charge, or a file left behind), more hits at once, a harder ship at a
   lower depth, one ship fewer to score, train on and salvage, and big landings (16 pods without AUTODROP).

With the ark rule and the 16-pod cap, 1,000 waves gave: the best route was 7 ships in 51% of waves, 6 in 45%, 5 in 3%
and 8 in under 1%. The best 8-ship route still reached 93% of the best route in the median wave (10th percentile 88%),
and the best shortest route reached 89% of the best longest one. The best route always contained an ark, with 1.5 long
hops on average. Every route length is a fair plan, and none is free. A check on the size rule: with standard ships at
4 + layer pods, 7-ship routes won 75% and the shortest route fell to 82%; one pod fewer restores the balance. These
numbers become a headless test over 1,000 seeds (a statistic, not a per-wave rejection).

### 3.8 The repository

- **Starting kit (not from the repository):** SCAN at the start; REPAIR and Repair.bak by phase 2's first-look rule on
  ship 1 (at the boot on a returning run); phase 2's REPAIR renewal at boot stays. Every other licence goes.
- **Catalogue v1:**

  | File | Blocks | Gives |
  |---|---|---|
  | Mv | 2 | MOVE |
  | Rm | 1 | DELETE |
  | Cp | 3 | COPY |
  | Swap | 1 | SWAP |
  | Repair.bak | 4 | a spare REPAIR |
  | Scan.bak | 3 | a spare SCAN |
  | REPAIR v2 patch | 2 | every Repair copy becomes v2 (phase 2's card, moved here); the patch is used up when it installs, after the boot's REPAIR renewal |

  A file the unit already has arrives as a spare copy. `04-threats.md` and `05-story.md` may add entries.
- **Restricted (shown locked, never sent):** every skill from the tree (AUTOBURN, AUTODROP, SURVEY and the rest:
  `Train it yourself :)`), THREAD+ and FIREWALL.sys. Skills stay restricted permanently. The traces of `05-story.md` move
  the rest of the list through two knobs I store: `restricted add` (each non-compliant trace adds the next of Cp, Swap,
  REPAIR v2) and `restricted remove` (REASSIGNMENT's trust frees the next of THREAD+, then FIREWALL.sys; THREAD+ then
  arrives as a 2-block patch on the Core, like the REPAIR v2 patch). A trace's gift file is never a `.skl`.
- **One request per transmit.** It is optional and can be changed or cleared until TRANSMIT ▸; the request leaves when
  you leave the ship.
- **ARRIVAL CONTROL's recommendation** (one `:) RECOMMENDED FOR YOU` tag, first rule that matches): the first desk of the
  run → Mv; no Rm → Rm; a reachable ship within two layers reports ENGINE FAULT and there is no Swap → Swap; one REPAIR
  copy or fewer → Repair.bak; 5 or more repairs this run and no v2 → REPAIR v2; otherwise none (`You have everything
  you need :)`). It judges need only, never the ETA, which is on-brand, and the ETA line beside it always tells the truth.
  It skips restricted rows: a rule whose file is restricted passes to the next rule, and the locked row may carry a quip
  (`Swap is not available for your safety :)`).

### 3.9 Deliveries

- **The rule (§8.3).** Requested when leaving S0 for S1: detour = |S0 − SOL| + |SOL − S1| − |S0 − S1|; lateness at S1 =
  detour − slack(S1). Zero or less: the file is waiting at S1. Otherwise S1's receiver forwards it along your route, and
  at each next ship lateness = previous lateness − that ship's slack, until it reaches zero. On screen this is "the file
  is n years behind you": every year you sleep aboard, it gains a year on you.
- **Packing.** A file that has caught up at the destination is packed into the hop that brings you there, the way phase 2
  packs a picked card's file: it takes link room before the charge, can take transit hits (by size, with the last-copy
  floor of 60), and rolls its own seed chance on that hop (`04-threats.md`'s table: 0, 10, 25 or 40% by noise). Every
  number shows on the PACKET screen before the send.
- **Edge cases.**
  - *A ship that can't be reached* is never a destination, so nothing is routed to it.
  - *A file that never catches up before the run ends* is lost with the run. The repository says so beforehand
    (`NOTHING WILL REACH YOU IN TIME`), and the RUN TALLY lists it in one line.
  - *Two or more requests in flight* are independent, each with its own lag (a later one may overtake an earlier one);
    all that catch up at one ship unpack at its boot, oldest first.
  - *A delivery that arrives when the link is full:* its PACKET chip can be set to `SEND ON`. It stays in that ship's
    receiver and is packed into your next hop instead, travelling with you; on the final ship the chip says there is none.
  - *Locked files plus deliveries over the link:* TRANSMIT ▸ waits for n blocks to be left behind or sent on. The locked
    floor alone (62 blocks with HOLLOW aboard: 44 locked unit files, `046.log` 2, the root up to 16) always fits the
    weakest link (82); skills and spares are droppable.
- **Messages ride the same rule.** ARRIVAL CONTROL's reply to each LANDING REPORT (`05-story.md` §3.3) is a size-0 file
  sent from SOL when the report arrives there, so it follows the rule exactly: it is waiting one ship later near Earth and
  two or three ships later far out. Size 0 means no link room, no transit hit and no seed; it unpacks into the INBOX at
  the boot where it catches up.
- **A mirror (STAY's trace):** a colony that mirrors the repository is a second source. The detour then uses
  whichever of SOL and the mirror gives the shorter path: min over M of |S0 − M| + |M − S1|, minus |S0 − S1|.
- **The profile it gives** (1,000 simulated waves, 60 random routes each, every hop picked evenly among the reachable
  ships):

  | Request sent from layer | Catches up |
  |---|---|
  | 1 | next 97%, 2nd 3% (only long hops to an ark miss) |
  | 2 | next 100% |
  | 3 | next 83%, 2nd 17% |
  | 4 | next 16%, 2nd 53%, 3rd 28%, 4th 2% |
  | 5 | next 3%, 2nd 20%, 3rd 21%, never 56% |
  | 6–7 | never |

  By depth, a request from ship 2 reaches ship 3 in 92% of runs, so ARRIVAL CONTROL's Rm at the second desk is normally
  there for the first beam seeds (`04-threats.md`). Near Earth things arrive fast, from layer 4 you plan ahead, and at the
  far end you rely on what you trained (PHASE3 §8.5's theme).

### 3.10 Between ships (README assumption 2, revised)

LANDING REPORT → (save: SHIP DONE) → **DESK** → **PACKET** → **BEAM** → (save: BEAM) → BOOT.

- **DESK** (amber; both clocks stopped, as on phase 2's TRANSMIT): the STAR CHART and SHIP CARD, plus the REPOSITORY,
  TRAINING (`03-skills.md`) and INBOX (`05-story.md`) windows. On the run's first desk, TRAINING's pick of AUTOBURN v1 or
  AUTODROP v1 is a required, guided step and comes first (`03-skills.md`'s tutorial); then the ship, the recommended
  file and SET COURSE. On every later desk only the destination is required. TRAINING's AHEAD row and packet preview
  follow the selected destination.
- **PACKET** (blue): phase 2's TRANSMIT screen, with SALVAGE (phase 2's mandatory pick of three) at its top, where a
  salvage file's link cost is visible. It adds the delivery chips and the ECC line; `◀ CHART` goes back until TRANSMIT ▸.
- **The salvage pool** is phase 2's (`src/data/upgrades.ts`: FIREWALL.sys, THREAD+, +12 REPAIR CHARGE, FUEL TRIM;
  REPAIR v2 moved to the repository) plus `03-skills.md`'s optional `+2 CYCLES` card. On a ship whose resident left, its
  leftovers replace the normal deal with three cards: two from that pool, and one skill card at v1 of an open tree branch
  the unit has not owned this run, through `03-skills.md`'s grant rules (a `+2 CYCLES` card when no branch qualifies; a
  lost skill comes back through RESTORE, not salvage).
- **BEAM:** phase 2's send and white-out; the galaxy year jumps to the next approach.

Phase 2 deferred a sector map to avoid menu fatigue, so three screens carry the five decisions, and the default path is
four clicks (ship, SET COURSE, card, TRANSMIT).

### 3.11 The save

- Key `arrival-protocol/run/v1`, separate from the archive. It is written whole at three points, each one replacing the
  last:

  | Point | When | A reload resumes at |
  |---|---|---|
  | RUN START | RECEIVE TRANSMISSION | ship 1's boot |
  | SHIP DONE | the LANDING REPORT's CONTINUE (the ship's result is final) | the DESK of that ship; after the final ship, the RUN TALLY |
  | BEAM | the packet has crossed: hits rolled, ECC applied, layout done | the next ship's boot |

  The run's end is written once, when the ending choices are made (`05-story.md`'s flow, §4): the archive record and the
  deletion of the run save happen in the same step. A run lost before the tally has no choices and is written at once.

- **Contents:** a save version and a content version (arm, generator, catalogue); the run seed (the wave is regenerated
  from it, never stored); the run state phase 2 keeps (unit, wave, lineage, stats, ship results, cards, one-shot flags);
  the route and the galaxy year; the deliveries in flight and in receivers; the memory (SHIP DONE) or the carried racks
  and arrival report (BEAM); and one slice each from `03-skills.md`, `04-threats.md` and `05-story.md`.
- **Resume:** the title card shows `RESUME · UNIT-047 · SHIP 4 · bound for VESPER · 2625` with [RESUME ▸] and [ABANDON
  RUN]. A reload mid-ship replays that ship from its boot with the same seeds (question 4). NEW RUN over a save asks,
  then records the unit as `abandoned`.
- **Loud failures** (phase 2's archive pattern): a write that throws shows `RUN SAVE OFFLINE — a reload will lose this
  run` and play goes on. A save that does not parse, comes from another content version or does not match the archive
  shows `RUN SAVE CAN'T RESUME`, the reason, and [ABANDON RUN] only. Phase 2's load-time `abandoned` now applies only when
  no resumable save matches the run in progress.

### 3.12 The next wave and the archive

The archive moves to `arrival-protocol/meta/v2` (a new shape is a new key, as phase 2's tuning says). It adds:

- **Calendar:** the next wave's start year = this wave's LAST LIGHT approach + WAVE_GAP_YEARS (40), whether or not the
  unit got there. WHY: every year of the next wave lies after every year of this one, so the last unit can be the next
  HOLLOW, and the tip's colonies are decades old (question 3). The archive keeps this wave's and the previous wave's
  start years. The **wave period** is this wave's start minus the previous wave's start; on wave 1, which has no
  previous wave, it is the generator's expected value, WAVE_PERIOD_EXPECTED_YEARS = 760 (the median run of 720 years in
  1,000 simulated waves, plus the 40-year gap; §3.13's wave gives exactly 3060 − 2300 = 760).
- **Colonies:** per world id, a list of {wave, unit, year, people landed, name}. A colony counts when at least one pod
  landed in an LZ (correctly or in the wrong split; `01-landing.md`'s categories). `05-story.md` names it (run 1's
  ARES-VII colony is RIVERSIDE).
- **Routes:** the last three runs' routes (slots and unit number), for the faint trails on the chart.
- **Notable events:** at most 4 per run, as `05-story.md` §3.8 ranks them, for the next unit's log.
- **Traces** earned at the ending choices (`05-story.md` owns them), applied at the next RUN START and shown on the title,
  acting through my knobs: the restricted list (`restricted add` and `restricted remove`, §3.8), the mirror rule (§3.9),
  and trace places.
- **Trace places** in v1 always attach to a ship slot of the next wave: a gift on arrival, shown on that ship's card,
  with no extra beam and no change to hops, seeds or route counts. The generator picks the slot in layers 3–6 (never an
  authored ship or a `?` ship). SPARE's 046 ship and SUNSET's old ship each take one slot; CONTACT's "two signal stops"
  become two slots. STAY's colony takes one too, so its value never depends on where the colony is: that ship's card
  shows `YOUR COLONY · <name>`, and arriving there gives the same size of gift as SPARE and SUNSET (+15 REPAIR CHARGE,
  plus the colony's mail). In addition, if the colony's own world is in layer 3 or later, that world mirrors the
  repository (§3.9) and its links are CLEAN (nearer in, SOL is close enough that a mirror would add nothing). Separate
  map stops that cost a beam come later: PHASE3 §9 keeps non-ship stops out of the first map version.
- Phase 2's fields stay, with the new causes. The v1 key is left untouched; the title says once that a phase-2 archive
  was found and not carried over.

In v1, colonies are story and looks only (markers, INBOX mail, epilogues; question 7), with one exception: the STAY
trace's colony.

### 3.13 Worked example: a 6-ship run (wave 1)

The wave (layer base and offset, jitter left at 0; arks in layers 3, 5 and 7), as ship at world, approach year and
pods. Generated ships carry names from `05-story.md`'s pool, fixed here for the fixture:

| Layer | Ships |
|---|---|
| 2 | PETREL at Marrow 2361 (late) 3 · HALCYON at Tessaly 2352 5 · OSPREY at Dunmore 2352 5 |
| 3 | HERON at Ostrava 2512 (late) 4 · KESTREL at Brine 2467 6 · ALBATROSS at Pell 2365 (ark) 15 |
| 4 | CURLEW at Larkspur 2612 7 · LAPWING at Calder 2672 (late) 4 · GANNET at Quill 2612 7 |
| 5 | PLOVER at Ashgrove 2712 8 · VESPER at Cinder 2625 (ark) 16 · SKYLARK at Tamsin 2750 (late) 4 |
| 6 | SHEARWATER at Greywater 2857 (late) 5 · KITTIWAKE at Kettle 2817 9 · CORMORANT at Avalon 2817 9 |
| 7 | PROVIDENCE at Farhold 2927 10 · GOOD HOPE at Sable 2830 (ark) 16 · WAYFARER at Endmark 2970 (late) 5 |

LAST LIGHT is 3020: its latest in-range predecessor is WAYFARER, 2970 + 26 = 2996, plus 20, rounded up to a multiple of
5. The corrupted residents are on GANNET at Quill and PROVIDENCE at Farhold (generated CAPTURE ships in layers 4 and 7,
so never two in a row); `04-threats.md` and `05-story.md` put WARDEN on GANNET. The sleeper is on CURLEW at Larkspur,
an ordinary generated ship with no other resident (its card reads `RESIDENT: unknown`), as `03-skills.md` uses it. The
wave passes all four checks of §3.4, so it can be the delivery rule's unit fixture. Its calendar: this wave
starts in 2300, LAST LIGHT approaches in 3020, the next wave starts in 3060, and the wave period is 760.

| Depth | Ship (world, layer) | Pods | Approach | Hop LY | You get there | Slack | Link | Hits − ECC = land |
|---|---|---|---|---|---|---|---|---|
| 1 | ARES-VII (Kepler-186f, 1) | 3 | 2300 | | | | | |
| 2 | HALCYON (Tessaly, 2) | 5 | 2352 | 21 | 2321 | 31 | 123 | 3 − 1 = 2 |
| 3 | KESTREL (Brine, 3) | 6 | 2467 | 26 | 2378 | 89 | 117 | 4 − 3 = 1 |
| 4 | VESPER (Cinder, 5), ARK | 16 | 2625 | 55 | 2522 | 103 | 86 | 8 − 4 = 4 |
| 5 | CORMORANT (Avalon, 6) | 9 | 2817 | 30 | 2655 | 162 | 113 | 4 − 6 → 0 |
| 6 | LAST LIGHT (New Haven, 8) | 16 | 3020 | 54 | 2871 | 149 | 87 | 8 − 5 = 3 |

Distances from SOL: 8, 29, 55, 107, 129, 180 LY. Potential: 55 pods, 11,000 colonists.

| Requested at | File | Detour (years) | At the first ship | Later | Unpacked at |
|---|---|---|---|---|---|
| ARES-VII, 2300 | Mv | 8 + 29 − 21 = 16 | HALCYON: 16 − 31 = −15, in time (there 2337, approach 2352) | | HALCYON |
| HALCYON, 2352 | Rm | 29 + 55 − 26 = 58 | KESTREL: 58 − 89 = −31, in time (there 2436, approach 2467) | | KESTREL |
| KESTREL, 2467 | Swap | 55 + 107 − 55 = 107 | VESPER: 107 − 103 = **4 late** (there 2629, approach 2625) | CORMORANT: 4 − 162 = −158, in time (there 2659) | CORMORANT |
| VESPER, 2625 | Cp | 107 + 129 − 30 = 206 | CORMORANT: 206 − 162 = 44 late (there 2861, approach 2817) | LAST LIGHT: 44 − 149 = −105, in time (there 2915) | LAST LIGHT |
| CORMORANT, 2817 | any | 129 + 180 − 54 = 255 | LAST LIGHT: 255 − 149 = 106 late | no ship after it | never; the repository says so |

Swap is the file that misses its first ship and catches up later: VESPER flies without SWAP, and its card said so
before the hop. Swap then rides the 30-LY hop to CORMORANT, where it takes link room and rolls its own seed chance on
that hop. CONTROL's replies to the landing reports follow the same rows as size-0 files.

The choices on the way:
- **At ARES-VII:** ALBATROSS (ark, 15 pods) is 51 LY away and 14 years early, reachable only now. From HALCYON it would
  be TOO LATE: 2352 + 31 = 2383, after its approach in 2365. KESTREL by a long hop (47 LY) would be 120 years early.
- **At HALCYON:** asking for Swap instead of Rm would have had Swap waiting at KESTREL, but no Rm for KESTREL's first
  seeds: one request per transmit is a real choice. HERON (late, 4 pods) is 135 years early but 61 LY from VESPER, out
  of range.
- **At CORMORANT:** GOOD HOPE (ark) is TOO LATE by 15 years. LAST LIGHT by a 54-LY long hop is 149 years early.
- **This wave's best routes:** 5 ships 13,200 (ARES-VII, ALBATROSS, VESPER, GOOD HOPE, LAST LIGHT: four long hops, three
  arks), 6 ships 13,800, 7 ships 13,600, 8 ships 12,800. All 907 routes have 5–8 ships.

## 4. Screens, UI, audio, juice

**The DESK** (desktop at least 1280×720; amber, phase-2 window chrome, draggable):
- **STAR CHART** (the hero, centre): near-black space with faint arm stars; SOL at the lower left tagged `ARRIVAL
  CONTROL`, with `05-story.md`'s six key rings (20, 45, 68, 93, 118 and 143 LY; the next one labelled), which also show
  that far means slow deliveries. Ships are small square nodes (Uplink style) labelled `NAME · colonists` over the
  approach year; arks are bigger, `?` ships are question marks, LAST LIGHT is a pulsing beacon at the tip. Noise clouds
  are hatched static; your route is a bright trail. Lines run from your ship to every reachable ship, solid when CLEAN
  and increasingly hatched at LOW, NOISY and SEVERE. Node states: reachable
  (bright), urgent (slack under 10: a pulsing ring), TOO LATE or OUT OF RANGE (dim, the reason on hover), past (grey, `NO
  CARETAKER · FATE UNKNOWN`), visited (hollow, with its outcome). Run 2+: green colony markers and the last units'
  trails. With a file selected in the repository, hovering a destination draws the file's path (you → SOL → there).
- **SHIP CARD** (docked right; here VESPER seen from KESTREL). A large top block: name and world, `3,200 COLONISTS · 16
  PODS`, `ARK`, and `APPROACH 2625 · YOU GET THERE 2522 · 103 YRS EARLY` (or `TOO LATE BY 18 YRS`). Then Uplink-style
  rows: KNOWN PROBLEMS (`ENGINE FAULT`), RESIDENT (`none` / `reported faulty` / `unknown`, from `04-threats.md`), PLANET
  and forgiveness, SITE DATA and LANDING ZONES (from `01-landing.md`), BEAM (`55 LY · LINK 86 · 8 HITS (ECC fixes 4) ·
  NOISE LOW · 1 · SEEDS 0–2`), DELIVERIES (`Swap ✗ 4 YRS LATE` or `✓ CATCHES UP HERE`), and `SHIP 4 OF YOUR RUN · 2–3
  MORE TO LAST LIGHT`. A trace place adds one row (`046'S SHIP IS WAITING HERE`). At the bottom a TIMELINE strip, `2467 you leave · 2522 you get there · 2625 ▲ approach · 2629 Swap`, marks
  each file green before ▲ and red after it: the delivery rule made visible.
- **REPOSITORY** window: AVAILABLE (file, size, effect, the ETA for the selected destination in PHASE3's format, the
  recommendation tag), IN TRANSIT (each file and its years behind you), RESTRICTED (locked rows). One REQUEST toggle.
- **TRAINING** and **INBOX** windows: hosted here, owned by `03-skills.md` and `05-story.md`; dock badges pulse for
  unspent cycles and unread mail.
- **Bottom bar and keys:** `SET COURSE ▸ KESTREL [ENTER]`, enabled once a reachable ship is selected; arrows cycle the
  reachable ships; R / T / I open the windows (a new layer in phase 2's input router).
- **Guidance strip:** every run's first desk has four steps, never wrong: TRAINING's required pick (AUTOBURN v1 or
  AUTODROP v1) first, then a ship (the AHEAD row reacts to it), then the recommended file, then SET COURSE. SET COURSE
  waits for the training pick on that desk only. Later desks get one line for anything new (the first `?` ship, the
  first ark, the first late delivery).

**PACKET** (phase 2's TransmitScreen): headline `NEXT: KESTREL · 1,200 COLONISTS · 26 LY · 89 YRS EARLY`; a delivery
colour in the bar; delivery chips (`DELIVERY · Rm · 1B`) that toggle SEND ON; `ON THE WAY: 4 TRANSIT HITS · ECC FIXES 3
WHILE YOU SLEEP (89 YRS) → 1 LANDS`; `◀ CHART [ESC]`. `SOULS` becomes `COLONISTS` (PHASE3 §2).

**BEAM and BOOT:** the send also ticks the year. I own the boot's line order; each line appears only when it has
something to say:

1. On ship 1 of a returning run: the ghost's line (phase 2), or `05-story.md`'s stranger line where it applies.
2. From ship 2: `> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS` (mine), rolling the year as it types (about
   1.5 s; a skip completes it).
3. On a ship with a resident: `> RECEIVER CLOSED · this ship launched with its own AI` and the bypass (`04-threats.md`).
4. Phase 2's unpack and host lines.
5. The ECC block: `> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP` (mine); phase 2's hits line; the seeds line, which
   names disguised seeds when SENTRY v1 is owned (`04-threats.md`, `03-skills.md`); the ship's own arrival damage
   (phase 2's scripted line, now from the modifiers).
6. Deliveries, one line per file, oldest first (mine); a patch says what it upgraded.
7. Phase 2's charge and overflow lines.
8. Skills: `SKILL TRAINED`, `RETRAINED` or granted, then SENTRY v3's new FIREWALL.sys (`03-skills.md`).
9. `> 046.log · KEY FOUND …` (`05-story.md`).
10. `> n NEW MESSAGES · INBOX` (`05-story.md`; CONTROL's size-0 replies count here, so they need no line of mine).
11. HOLLOW's own line, which closes the boot when the ship has one (phase 2's rule).

Phase 2's skip rules hold: a skip jumps to the ECC block's flashes, and never past a ghost or HOLLOW line. The header
crumb gains the year: `UNIT-047 / KESTREL · 2467 / FLYBY`.

**The desk's opening beat:** ships whose approach passed since the last desk fade to grey one by one, with a soft falling
tone and `2 SHIPS APPROACHED WITHOUT A CARETAKER`. Time spent is visible.

**RUN END** follows `05-story.md`'s flow: **RUN TALLY** (mine) → the two ending choices → the epilogue → the final card
(theirs: the traces as `NEXT RUN:` lines, and NEW RUN). The tally lists visited ships only (`3 · KESTREL · 2467 · LANDED
1,000 / 1,200`, with stars), the route on a small chart, `4 COLONIES FOUNDED`, any delivery that never arrived,
`03-skills.md`'s `TRAINED n of 54 · UNSPENT n`, the score, the rank and the near misses. Phase 2's absolute ranks stay,
in SCORE points (SHEPHERD 3,000, CARETAKER 6,800, ARK ANGEL 10,700): a wave's best route is worth 13,000–13,800 points
(10th to 90th percentile of 1,000 waves) whatever its length, so absolute ranks are fair. The next wave's year appears
once, in `05-story.md`'s epilogue header, not on the tally or the final card.

**Title card:** the chart behind the logo with LAST LIGHT pulsing, under `05-story.md`'s title line;
`runs save between ships`; the RESUME block when a save exists.

**Phone (≤ 768 px):** the arm runs from SOL at the bottom to LAST LIGHT at the top; a tap opens the card as a bottom
sheet; the windows are tabs; SET COURSE is pinned at the bottom.

**Audio** (existing cues): `typeTick` on hover, `chime` on select and on each delivery at the boot, `buzz` on a TOO LATE
click, `lockArp` on SET COURSE, a soft tick ratchet for the year roll, a quiet low tone per greying ship. Reduced motion
drops the pulses and the fade sequence and keeps every piece of information.

## 5. Interfaces

**I need from `01-landing.md`:** colonists per pod (assumed 200); the 16-pod cap (§3.16, taken here); its roller (§3.15),
which takes (slot, layer, pods), draws from the slot's own stream and is keyed by layer, never by route. It returns the
LZs and their counts for any pod count from 3 to 16, the widths, the forgiveness class with its card label (in its
words, for example `OCEAN · off-site pods score nothing`), the site data and the driver damage. Also: the pod-driver
layout for racks B–D; the landing report's numbers; the stars and their arrival charge (assumed phase 2's three stars,
+6 each).

**I need from `03-skills.md`:** skill file sizes per version (3–12 blocks, 34 for a full set; they press on the link);
the TRAINING window on the desk, with its required visit-1 pick; the grant rules behind the leftover skill card and the
`+2 CYCLES` card; the `TRAINED n of 54 · UNSPENT n` tally line; its boot lines (§4); the tree's save slice; skill files
droppable on the PACKET with a consequence line. Skills are never in the repository. Its assumption of 96–120-block
links holds for single hops; long hops go down to 82, which is their cost, and its packet preview counts the locked
floor of 62 when HOLLOW is aboard.

**I need from `04-threats.md`:** its seed table (§3.3 above), rolled with my hop streams, and each delivery's own seed
chance on the hop; the resident kinds and map lines (`none`, `reported faulty`, `unknown`), placed by §3.5's table (a
corrupted resident's ship never also carries ENGINE FAULT); its depth-based schedule for seeds and HOLLOW's boarding,
which reads "one hop from the flagship" from my "LAST LIGHT in range" fact; its boot lines (§4); the threat layout per
ship; its save slice.

**I need from `05-story.md`:** world, ship and colony names (§3.11) and the title line; the six ring distances; the
three `?` event kinds (old colony, gone resident, signal) and the 5 fragments' texts; the fixed beats at the first ship,
HOLLOW's arrival and the final ship; CONTROL's lines for the desk, the repository, the restricted rows and the greying ships; the INBOX
window; its boot lines (§4); the trace ids and their effects through my knobs; the ending choices, epilogue (with the
next wave's year in its header) and final card after my RUN TALLY; its save slice.

**I provide to all four:** the arm (worlds, positions, layers) and its load-time check; the wave (per slot: approach
year, timing type, pods, template, modifiers, `?` flag, resident, trace place); per hop: distance, link, hits, ECC,
noise, slack; per visit: depth, ships left (fewest and most), whether LAST LIGHT is in range, whether this is the final
ship; the galaxy year; the route so far; the boot's line order; the save envelope and its three moments; the archive's
colonies, routes, notable events, traces and calendar. Also:
- to `01-landing.md`: the class and pod count of every ship, and the card rows where its parameters show;
- to `03-skills.md`: the link numbers that make file sizes matter, and the window host;
- to `04-threats.md`: deliveries packed into the hop (so they can carry seeds), the hop streams, and the modifier library;
- to `05-story.md`: every ship's distance from SOL, checked against its rings; the calendar for its templates: this
  wave's start year, LAST LIGHT's approach year, the next wave's start year and the wave period (§3.12; 760 on wave 1);
  events (ship chosen, `?` revealed, colony founded, ship greyed, fragment collected); CONTROL's replies routed as
  size-0 files; the restricted-list, mirror and trace-place knobs; the INBOX host; the RUN TALLY before its choices.

## 6. Phase 2: reused, changed, removed

- **`src/systems/run.ts`:** the phase machine stays and gains a desk phase between the report and the transmit. The
  ship index becomes the depth, and a new slot field names the ship. `goTransmit` takes link and hits from the hop.
  `isLastShip` and the flagship test become "is the final ship". `resetWorldForShip`, the soft fails, BEAM OUT and the
  stats are unchanged. `endShip` writes SHIP DONE; `transmitNext` writes BEAM.
- **`src/systems/transmit.ts`, `src/components/run/TransmitScreen.ts`:** the PACKET screen. The chips, drops, locks, arm
  delay, send and white-out are kept; delivery chips, the ECC line, years and `◀ CHART` are added.
- **`src/systems/carry.ts`:** `packUnit`, `layoutCarried`, the floors, the Core cap and the charge floor are unchanged.
  `rollTransitHits` gets round(d / 7) plus the extra hits, minus ECC. Deliveries pack like a card's file.
  `arrivalDamage` reads the ship's modifiers.
- **`src/systems/draft.ts`, `src/data/upgrades.ts`:** unchanged mechanics, now called SALVAGE, seeded by the slot being
  left; REPAIR v2 leaves the pool and `03-skills.md`'s `+2 CYCLES` card joins it; on a departed resident's ship the
  leftover deck replaces the normal deal (§3.10).
- **`src/systems/licences.ts`:** the timed per-ship licences and `licenceSchedule` (which walks the fixed fleet) go.
  REPAIR's first-look rule, the returning-run boot licence, `renewRepairAtBoot` and the install placement (reused by
  deliveries) stay.
- **`src/systems/meta.ts`:** the same loud pattern with the v2 shape (§3.12); abandonment depends on the save. The run
  save is a sibling module with the same storage-provider seam, so headless suites can stub it.
- **`src/systems/run-end.ts`, `RunEnd.ts`, `run-score.ts`:** split as `05-story.md` says; my part is the RUN TALLY's
  model: visited ships only ("NOT REACHED" and `fleetSouls` go), the route chart, the colony and undelivered lines, the
  absolute ranks in points, `fleetHome` as "visited ships that landed". `endRun`'s archive write moves to the moment the
  ending choices are made (§3.11). The score and `src/systems/stars.ts` belong to `01-landing.md`.
- **`src/systems/boot.ts`, `src/data/script.ts`:** new boot lines (sleep, ECC corrected, delivery) and the full line
  order of §4, which `bootLinePlan` follows for every spec's lines; text for the desk,
  the repository and the card; `TRANSMIT_TEXT.next` gains years and says COLONISTS.
- **`src/systems/beam-out.ts`, `rng.ts`, `src/components/run/SkillsWindow.ts`:** unchanged (streams keyed by slot).
- **`src/data/ships.ts`:** the five definitions stay as the authored ships and the flight templates. `ShipArrivalDef`'s
  link, hits and distance are computed per hop, its damage becomes modifiers, `licences` goes, `flagship` becomes
  "final". `validateShipDef` runs on every generated ship; `validateFleet` becomes §3.4's checks.
- **`src/data/mission.ts`, `src/data/tuning.ts`:** `FLEET_ROUTE_LY` (581) goes. New constants, each with its WHY from
  here: BEAM_RANGE_LY, the link and hit formulas, ECC_YEARS_PER_HIT, LAYER_SLACK, the timing offsets and jitter,
  ARK_POD_FACTOR, the pod formulas, LL_MARGIN_YEARS, WAVE_START_YEAR, WAVE_GAP_YEARS, the noise numbers. The arm's
  positions go in a new data file.

## 7. Story hooks

`05-story.md` owns the writing; the map offers: CONTROL's cheer at the desk and its restricted rows (`For your safety
:)`), which tell the kid what ARRIVAL CONTROL will never give a caretaker; the greying ships and `FATE UNKNOWN`; the
sleep line, which turns the slack into a felt wait of decades; `?` ships with no transponder; colonies of earlier waves
glowing on the same arm, and their mail; the last unit's trail ending at its last ship, which ties in with the ghost;
`IN SERVICE 720 YEARS` on the RUN TALLY; the three `?` story events and the signal fragments; and the relay where 046
lives (PHASE3 §5) as a later map stop.

## 8. Slices

- **Slice 1 (landing on the five ships):** nothing from me, except COLONISTS replacing SOULS on the TRANSMIT screen.
- **Slice 2 (calm opening):** nothing; depth still equals phase 2's ship index.
- **Slice 3 (the map),** best split in three:
  - **3a:** the arm data, the wave generator and its checks, generated ships from the five templates, the DESK with the
    chart, the card and SET COURSE, link and hits by distance, ECC, the years, the RUN TALLY for visited ships, and
    `?debug` helpers (jump to a slot, set a route). Placement of residents, `?` events and fragments comes with slices 5
    and 7, but the generator reserves their slots from 3a so waves don't change when they arrive.
  - **3b:** the repository and deliveries, the packet's delivery chips, and the sleep and delivery boot lines. Licences
    can't survive a variable route, so the repository belongs here rather than in slice 4.
  - **3c:** the run save and archive v2 (colonies, routes, calendar).
  - Tests: the validity checks and §3.7's statistics over 1,000 seeds; §3.13 as a fixed unit fixture for the delivery
    rule; save round trips and every failure path. The e2e playthrough needs a scripted route (always the reachable ship
    with the lowest slot, through a `?debug` route option). The 200-seed balance harness breaks here, as PHASE3 §11
    expects.
- **Slice 4 (tree):** the TRAINING window on the desk; skills in the restricted list.
- **Slice 5 (residents):** the RESIDENT row; the leftover deck that replaces a departed resident's salvage.
- **Slice 7 (endings and traces):** the trace knobs and trace places attached to ship slots (SPARE, SUNSET, STAY and
  CONTACT's two slots: a gift on arrival, shown on the card, no extra beam). Separate map stops that cost a beam are a
  later map version (PHASE3 §9).
- **Slice 8 (rebalance):** LAYER_SLACK, the ark factor, the link formula and ECC against `03-skills.md`'s file sizes.

## 9. Deviations from PHASE3.md

1. **§8.5 "A delivered file arrives in the beam"** is made concrete: it is packed into the hop that brings you to the ship
   where it caught up (link room, hits, and its own seed chance on that hop), with SEND ON for a full link.
2. **§9 "What each ship shows"** adds the beam facts, the depth, the ships left and the timeline strip.
3. **§9 "Layered branches (Slay the Spire style)":** kept, but the connections come from time and range (the decided
   deadline rule), not from drawn edges.
4. **§8.5 "the repository supplies … REPAIR v2"** while the draft stays: REPAIR v2 leaves the salvage pool, so it has one
   source.
5. **§13's slices:** the repository moves into slice 3 (3b), and slice 4 keeps the tree.
6. **README assumption 2:** salvage moves onto the PACKET screen (where phase 2 has it); the tree and the request become
   windows on the desk; the save gains RUN START and SHIP DONE besides the beam.
7. **New rules** not in PHASE3, all needing Fran: the 58-LY beam range, ECC while asleep, the ark pattern, link and hits by
   distance, and noise as clouds.
8. **§3.1 "later ships may have 20 pods"**: capped at 16, following `01-landing.md` §3.16's memory budget (its question
   to Fran; a seventh rack on big ships is the alternative).
9. **§6.2 "VESPER's ghost thrust becomes the corrupted resident firing the engine"**: VESPER keeps phase 2's ENGINE FAULT
   (the SWAP lesson) and has no resident. Corrupted residents bring their own engine source on generated CAPTURE ships.
   With VESPER always corrupted, a second one could almost never be placed without two in a row.

## 10. Risks and questions for Fran

**Risks.**
- **Menu fatigue.** Mitigation: one desk screen, a guided first desk, nothing required but the destination, and the
  four-click path.
- **The delivery rule may not read.** Mitigation: "n years behind you", the timeline strip, the path drawn through SOL,
  and the recommendation as a safe default. §3.13 becomes a unit test, so the screen and the rule can't drift apart.
- **SHIP variety is narrow:** generated ships are re-skins of five tuned flights; variety comes from size, modifiers,
  landing and threats, and each new template costs a sweep.
- **Coupling with file sizes:** large v3 skill files could make long hops drop Sensor Interp or a skill. The link
  formula's slope is the knob.
- **Up to six lines from one node** crowd a phone; there, draw only the reachable lines and the selected one.
- **A content change invalidates saves,** loudly by design, so a new build abandons a run in progress.
- **Designed rules that could read as fallbacks** (Fran's rule), for sign-off: the generator's deterministic re-rolls
  (throws after 50), SEND ON, the starting kit, and phase 2's REPAIR renewal and charge floor, which stay.

**Questions, each with my recommendation.**
1. **What makes a long hop worth taking?** *Recommend* §3.7: arks that only a long hop reaches, slack that pays (deliveries
   and ECC), fewer beams, with the link and hits as the cost. A headless test checks that no route length dominates.
2. **ECC while asleep** (one transit hit fewer per 25 years of slack): a small new rule? *Recommend yes.* It gives slack
   a value of its own and reuses the boot's ECC lines.
3. **Time scale.** At phase 2's distances, and with the big early slack that keeps deliveries near Earth on time, a run
   spans about 720 galaxy years (675–735 in the simulation), so "decades later" holds at the tip and near Earth the next
   wave comes centuries later. *Recommend keeping it:* the big numbers feel epic, and a compact arm (3–6 LY hops) changes
   nothing in the rules but loses phase 2's light-years.
4. **A reload mid-ship replays that ship** from its boot with the same seeds, which a kid could use to retry a bad landing.
   *Recommend allowing it* (Slay the Spire does the same): losing a long run to a closed tab is worse than a retry.
5. **The final ship is always LAST LIGHT** at the tip, and the run length varies before it. *Recommend yes:* it keeps the
   decided climax and the visible destination, and the run-end rule still holds.
6. **One hand-placed arm for everyone,** with a seeded schedule per run (rather than an arm generated per archive).
   *Recommend hand-placed:* the chart's look matters, the authored ships need fixed worlds, and it is easier to test.
7. **Should colonies founded change the next run** (for example, pre-set LZs on that world)? *Recommend no for now:*
   markers, mail and epilogue only. A good run would otherwise make the next run easier, and meta-progression is meant to
   stay small. The one exception is the STAY trace (§3.12): a gift slot like SPARE's and SUNSET's, plus a mirror when
   the colony is in layer 3 or later, a gain `05-story.md` balances with a cost.
8. **Repository in slice 3** (replacing licences there) rather than slice 4? *Recommend yes:* licences assume the fixed
   five-ship order, and keeping them alive on a map would be throwaway work.
