# 01 · Landing and pods

Spec for PHASE3 §3 and the pod-driver half of §2. It builds on `docs/design-v2.md` (cited as v2 §n) and the code as
built. Constants named here are new entries for `src/data/tuning.ts` unless said otherwise.

## 1. Summary

- After ORBIT LOCK a new run phase, **LANDING**, replaces `printing`. Each pod carries 200 colonists and is flown by an
  8-block **pod driver** file in the pod racks (`POD 03 · OKAFOR`).
- The NAV PLOT draws the pod's arc to a **drop dot** sliding along the planet; each landing zone (LZ) is a **bracket**;
  a GROUND TRACK strip shows both at readable scale. **[L]** launches while the dot is inside. The **bay** holds 4.
- The dot widens with altitude and with Sensor Interp, Nav Plotter and driver damage; a failing driver lands hard.
  Damage pushes you lower, and a low orbit decays and costs FUEL: pay with REPAIR CHARGE or with FUEL.
- **The planet does not rotate**: one window per LZ per orbit, SKIP between windows, about 24–30 real seconds per
  window. Score per pod = 200 × where × how it landed; a **LANDING REPORT** follows.
- **Memory varies by ship** in whole racks: FULL 384, COMPACT 320, TIGHT 256. A TIGHT (light) ship has one receiver
  rack, room for 88 blocks of you and no charge floor: early it costs REPAIR CHARGE, late files. Pods stay at most 16.

## 2. The player's experience

**First time: run 1, ship 1, ARES-VII → Kepler-186f (3 pods, one WIDE site, a GENTLE planet).**

The boot shows three drivers in rack B: `POD 01 · OKAFOR`, `POD 02 · BRANDT 44%` with a ragged trace, and
`POD 03 · AL-SAYED`. The TERMINAL types `> HOST: ARES-VII · 3 PODS · 600 COLONISTS`. The crash course, the ENGINE I/O
FAULT and the capture play as in v2 §5.1. On the coast the strip suggests `◇ POD 02 WILL LAND HARD — REPAIR its
driver`. The repair takes about 3 s and 9 charge, and the detail panel flips from `WILL LAND HARD` to `WILL LAND SOFT`.

At ORBIT LOCK the ring's label changes from SAFE ORBIT to LAUNCH BAND, a bracket `LZ-A · 600 · 0/3` lights up on the
rim, and a dotted arc runs from the ship down to a glowing dot about a quarter turn ahead. The GROUND TRACK opens
under the plot and a POD BAY window slides in with `BAY ▮▮▮▯ 3/4`. CONTROL: "Lovely orbit! Let's get them down. :)"
The strip: `WAIT — LZ-A in 3:40 ▸▸ · [F] to SKIP`.

The kid presses F, and six seconds later the pace snaps to TACTICAL: `GET READY — LZ-A IN 0:05… 4…` with the familiar beeps. On the
ground strip the bracket scrolls in toward the dot, which stays in the middle like a bombsight. When the dot is
inside, the bracket turns green with a chime, a tone rises toward the bracket's centre, and the strip says
`LAUNCH NOW — press [L] · LZ-A 0/3`.

[L] gives a thunk and a hiss. A bright pod streaks down the arc, flares white-orange where it hits the atmosphere and
lands with a bell. `+200 LANDED · LZ-A` floats up from the bracket, a `FIRST LANDING` stamp hits, CONTROL says
"They're down! :)", and the radio carries one line from the ground: `POD 01 · OKAFOR: "Is it morning?"`. Two more
taps at the 2-second rhythm land the others. `LZ-A 3/3 ✓` plays a chord, the stamp `ALL PODS DOWN` follows, and then
the LANDING REPORT. The landing took about 40 seconds.

**Ship 2 (HALCYON at Tessaly, layer 2, a standard COMPACT ship: 5 pods, LZ-A 3 and LZ-B 2, GENTLE).** Two brackets,
and the lesson is the split. A transit hit left Sensor
Interp at 62%, so the dot is half again as wide and no longer fits the narrower LZ-B: `DROP TOO WIDE FOR LZ-B —
REPAIR SENSOR INTERP, or fly lower`. Repairing costs charge the kid will want on ship 3. Flying lower is one RETRO
burn that the strip times and releases, but below the DRAG line the orbit sinks a little every pass and costs FUEL.
After three LZ-A pods, `LZ-A FULL — hold the pods for LZ-B` stops the classic mistake.

**Later (a layer-7 standard ship on a volcanic world, HOLLOW awake).** Ten pods go to three sites (4, 3 and 3), with a red lava arc 100 km past
LZ-B. HOLLOW bites a driver in the bay, so the kid TABs in mid-window: OVERCLOCK slows the world to a quarter, the
window waits, the repair wins, and the kid TABs back for the last two pods. With AUTODROP the kid stays in blue while
the pods go down on their own; without it, a 16-pod ark is 5–7 windows by hand, which Fran wants felt.

**A tight ship, early and late.** At ship 1's DESK the kid looks at PETREL, a light ship with 3 pods. Its card reads
`MEMORY 256 · TIGHT · ROOM FOR YOU 88` and, under it, `YOU FIT · CHARGE SQUEEZED: 15 ARRIVES`. CONTROL: "Cosy little
ship! Pack light. :)" The kid goes anyway: a calm ship with three pods needs little charge. At depth 6 the card
of WAYFARER, a light ship, says `LEAVE 8 BEHIND · NO CHARGE ARRIVES`. On the PACKET screen a second bar sits under the
link, `ROOM AT WAYFARER 88`, and TRANSMIT ▸ waits until the kid has left Autopilot and Repair.bak behind. The charge
line turns red, `CHARGE 38 → 0 ON ARRIVAL · 38 WON'T FIT`, and TRANSMIT asks `ARRIVE WITH NO REPAIR CHARGE?`. Or the
kid picks the 9-pod ship on the noisy link instead.

**Why ships 1–2 are fun with no adversary.** The landing is a new verb with a skill test (dot in the bracket) and
instant, loud feedback: a streak, a bell, a counter, a voice from the ground. The crash course keeps the flight tense.
MIND has real work (hurt drivers, a hurt sensor) and a real trade, because charge spent now is charge missing on
ship 3. Both ships are short (about 3 minutes each). A second run is pulled by the stars, the near-miss lines
(`POD 05 landed 40 km outside LZ-B`), and planets that behave differently (an ocean world forgives nothing).

## 3. Rules and starting numbers

### 3.1 The planet, and why it does not rotate

The planet keeps v2 §4.2's constants: R 3,390 km, atmosphere 3,790 km, μ 43,000 km³/s², two-body and 2D.

**Decision: the planet does not rotate.** In 2D, rotation only shifts where each window falls, and with SKIP taking
about 6 s whatever it crosses (LEAD-2, `src/systems/pace.ts`) it would not change the real time between windows
either. It would cost a moving surface frame, drifting LZs and landing points that move during a fall. Without it the
dot moves exactly as the ship does, and brackets and launched arcs stay still on the plot. Rotation can return later
as a planet modifier.

### 3.2 Window frequency and length, worked out

Every LZ gets one window per orbit. For a circular orbit of radius r the period is T = 2π √(r³/μ). The pod's landing
point leads the ship by a fixed angle, so the dot slides along the surface at the ship's angular speed: ground speed
= 2πR / T.

| Orbit r (km) | Period (game s) | One orbit at TACTICAL ×20 | At CRUISE ×60 | Dot speed (km per game s) | Dot speed at ×20 (km per tactical s) |
|---|---|---|---|---|---|
| 5,000 | 10,713 | 536 s (8.9 min) | 179 s | 1.99 | 39.8 |
| 6,000 | 14,082 | 704 s (11.7 min) | 235 s | 1.51 | 30.3 |
| 7,000 | 17,746 | 887 s (14.8 min) | 296 s | 1.20 | 24.0 |
| 9,000 | 25,871 | 1,294 s (21.6 min) | 431 s | 0.82 | 16.5 |

Waiting a whole orbit at TACTICAL is 9–22 minutes and at CRUISE 3–7 minutes, so **SKIP is how you cross between
windows**. Phase 2's rule "in the ring, so TACTICAL" must not apply during LANDING (§3.12).

A window is open while the dot's centre is inside the bracket. It is **sure** while the whole dot (centre ± its
half-width s) is inside. Sure length in tactical seconds = (W − 2s) / (dot speed × warp). Launches that fit in it =
the sure length ÷ the 2.0 s cadence, plus one, capped by the bay's 4. With `DROP_KM_PER_1000` = 30 (§3.3) and m the
damage multiplier, for a STANDARD 400 km LZ at ×20:

| r (km) | m = 1 (healthy) | m = 1.5 (a degraded driver or Sensor Interp) | m = 2 (failing driver) | m = 3 (failing driver and degraded Sensor Interp) |
|---|---|---|---|---|
| 5,000 | ±48 km · 7.6 s · 4 pods | ±72 · 6.4 s · 4 | ±97 · 5.2 s · 3 | ±145 · 2.8 s · 2 |
| 6,000 | ±78 · 8.0 s · 4 | ±117 · 5.5 s · 3 | ±157 · 2.9 s · 2 | never fits |
| 7,000 | ±108 · 7.6 s · 4 | ±162 · 3.1 s · 2 | never fits | never fits |
| 9,000 | ±168 · 3.9 s · 2 | never fits | never fits | never fits |

A healthy drop gets about 8 sure seconds anywhere in a 5,000–7,000 band: four calm taps, never twitchy. Damage makes
the high orbit unusable first, which is the orbit choice. A WIDE 500 km LZ adds 2–3 s; a NARROW 250 km one gives 3–4 s
(two pods) even healthy and low.

Real time per window: a SKIP of about 6 s landing 8 tactical s before the window, the 8 s GET READY, a 6–8 s window
and the last pod's 3.5 s descent, so **about 24–30 real seconds**. A 3-pod ship needs one window, an 8-pod ship 3–4,
a 16-pod ship 5–7 (about 3 minutes by hand).

LANDING uses its own warps on every ship, `LANDING_TACTICAL_WARP` 20 and `LANDING_CRUISE_WARP` 60, so the table holds
on every planet; ×20 is ship 1's flight warp. The switch happens at ORBIT LOCK, where the header's countdown changes
from ▼/▲ to the next window anyway, so no visible countdown jumps.

### 3.3 The pod's arc and the drop dot

- **The arc.** While the ship is in the band, the predictor (`src/systems/predict.ts`) also propagates a pod from the
  ship's true state with a fixed retro kick from the pod's own motor (no ship FUEL), aimed so the pod's lowest point
  is `POD_AIM_RP_FRAC` 0.6 × R. Why: the arc lands 70–88° ahead of the ship on every band (70° from 5,000 km, 88° from
  9,000), reads as "down and forward" and never wraps around the planet. It is exact Kepler math between drag kicks
  (§3.7), so it is cheap at 10 Hz.
- **The dot** is where the arc meets the surface. Its half-width, the **drop width**, is
  s = `DROP_KM_PER_1000` × (launch radius − R) ÷ 1,000 × Sensor Interp factor × Nav Plotter factor × driver factor,
  with `DROP_KM_PER_1000` 30 (the factors are in §3.8; a degraded Nav Plotter alone makes m = 1.25).
  Why 30: a healthy drop fits a STANDARD LZ anywhere in a 5,000–7,000 band, and only damage forces a choice.
  On screen it reads `DROP ±78 km`.
- **Where a pod lands** is decided at launch: the dot's centre plus u × s, with u uniform in [−1, 1] from the seeded
  stream `childRng(seed, shipIndex, 'drop')`. The landing point is then classified as in an LZ, in a no-go arc, or
  off-site.
- **The descent is shown on AI time.** A real fall takes 2,100–5,400 game s (105–270 tactical s at ×20), far too long
  for the payoff of a key press. The streak runs along its true, fixed arc in `POD_DESCENT_SEC` 3.5 AI seconds (5.0
  for run 1's first pod), a ritual like the lock hold (v2 §6.1); the result was decided at launch.
- **Launch is refused** while the engine delivers thrust (yours, AUTOBURN's, or ghost thrust: `ENGINE FIRING`),
  outside the band (`OUT OF THE LAUNCH BAND`), and with no drop solution (§3.8).
- **Guards.** [L] with the dot outside every bracket asks for the v2 inline confirm: `LAUNCH OFF-SITE? PLAINS ·
  scores 100`. [L] at a full LZ asks `LZ-A IS FULL — LAUNCH ANYWAY? scores 150`. Enter confirms. Holding [L] does not
  repeat a launch (that is AUTODROP v1's hook, §3.14).

### 3.4 The bay

- `BAY_SLOTS` 4: PHASE3's "3–4", and four launches fill one healthy sure window.
- `BAY_CADENCE_TAC` 2.0 tactical s between launches: a rhythm a kid can tap, four pods in 6 s.
- `BAY_RELOAD_TAC` 20 tactical s per pod, in world time: any SKIP refills the bay. Two LZs closer than about 40° of
  arc (four reloads at 6,000 km) share one bay load, and the kid decides how to spend it. That is PHASE3's split
  decision, placed by the generator as a "double window" (§3.15).
- **Which pod goes next:** the LOAD NEXT pin if that pod can launch, else the lowest address that can. Drivers that
  are infected, under repair, moving or below 25 are skipped, like `isPrintable` in `src/systems/printer.ts`. The bay
  count is only a launch budget, so an infection never ejects anything; the next 4 launchable drivers show `BAY` in
  MIND, and the first `NEXT`.
- **Bay Ctrl** (rack A, replacing Printer Uplink, same 6 blocks, a ship file: SWAP only) sets the cadence by band, as
  C7 did: ok 2.0 s, degraded 2.7 s, failing 4.0 s, dead 10.0 s (`BAY CTRL DEAD · ONE POD AT A TIME`), missing:
  `BAY OFFLINE`, no launches.

### 3.5 Landing zones, counts and the split

- Each LZ has a bracket on the rim (a centre angle and a width) and a **count** in colonists (always a multiple of
  200, shown as pods too: `LZ-A · 600 · 3 PODS`). Sites keep their labels (LZ-A, LZ-B, LZ-C). The colony has **one
  name per ship**, given by `05-story.md`'s rule at the first touchdown (run 1's ARES-VII: RIVERSIDE); it appears on
  the GROUND TRACK header and the LANDING REPORT.
- Widths: WIDE 500 km, STANDARD 400 km, NARROW 250 km. Brackets sit at least 12° apart edge to edge, so their windows
  never overlap. The sum of the counts equals the colonists aboard, unless a story beat says otherwise.
- An LZ's slots fill in touchdown order. The pod that lands when its LZ is already at its count is **mislanded**. Pods
  are interchangeable, so a pod is never "for" one LZ; it counts wherever it lands.
- The counters show everywhere: on the bracket, on the GROUND TRACK, in the POD BAY window and on the header crumb.

### 3.6 Forgiveness classes and no-go zones

Each planet has one forgiveness class. It sets what an off-site pod scores, so it gives the planet its personality:

| Class | Example worlds | Off-site pod scores |
|---|---|---|
| GENTLE | grassland, plains | 0.5 |
| ROUGH | desert, tundra, highlands, volcanic | 0.25 |
| HARSH | ocean, ice shelf | 0 |

Any planet may add **no-go arcs** (lava, cliffs, a lake): 3–8° wide, drawn red-hatched, scoring 0 whatever the class.
The generator places at least one within 150 km of a bracket edge on the ships that have them, so a wide dot is a real
risk. The four phase-2 worlds fit their names: Kepler-186f and New Haven GENTLE, Tessaly GENTLE, Brine HARSH (ocean),
Cinder ROUGH with lava no-go arcs.

### 3.7 The orbit choice and decay

- **High orbit:** stable, longer windows, but a wide dot. Fine while your files are healthy.
- **Low orbit:** a tight dot that forgives damaged drivers and sensors, short fast windows, and decay that costs FUEL.
- **The DRAG line** is a dashed circle inside the band, at the sweet zone's lower edge (ring.min + 0.25 × span):
  6,000 km on ship 1's band, 5,500 km on a 5,000–7,000 band. Why there: phase-2 corrections aim for the sweet zone, so
  an ordinary lock sits on or above the line and does not decay. Going low is a choice.
- **Decay** is a drag kick at each ▼ while ▼ is below the line: a retrograde Δv of `DRAG_DV_MAX_KMS` 0.030 ×
  (line − rp) ÷ (line − ring.min), stamped `DRAG · ▲ −110 km`. Discrete kicks keep the predictor exact between them.
  Worked example on a 5,000–7,000 band from a circular 5,250 km orbit: kicks of 15, 22 and 24 m/s take ▼ to 4,973 km,
  out of the band, after three orbits. Holding that orbit costs about 1% of a 2.1 km/s tank per orbit; letting it sink
  and trimming back to the line later (F11) costs 3–6%. Why 0.030: felt over a long landing, never ruinous.
- **GO LOWER** is a burn the strip offers (never forces) when the next LZ has no sure window and a lower launch point
  would give one. It reuses the `START BURN` timeline (v2 F10) with a new reason, `go-low`: RETRO, centred 180° before
  that LZ's launch point, `KEEP HOLDING — until LZ-B's dot fits`, then RELEASE once the sure window reaches
  `LANDING_SURE_MIN_TAC` 4 s (three pods) or ▼ is 100 km above the band floor. If even the floor can't fit it, the
  strip names the REPAIR instead.
- **Leaving the band.** The phase-2 trims (F11) apply as they are, and windows launched from outside the band read
  `LZ-B · OUT OF BAND`. The decay forecast warns `DECAY_WARN_ORBITS` 2 orbits ahead. SKIP's exact conic jumps
  (`src/systems/orbit-sim.ts`) must stop at each ▼ below the line to apply the kick.

### 3.8 MIND: pod drivers and instruments

**Drivers.** A new segment type `driver` replaces `soul`: 8 blocks, an integrity, a pod number, a family, 200
colonists and three featured colonists (`src/data/souls.ts` keeps the pools). Why 8 blocks: v2 §6.6's validated rule
(heal of an 8-block file > 1.5 × drain) then holds unchanged for whatever `04-threats.md` does to drivers.

- **Placement:** address order from rack B, around the root slot, by the layouts in §3.16.
- **Visible** like souls: integrity always shown, the heartbeat SVG kept as the pod's stasis monitor. Why: the drivers
  are the stakes, and a hidden number would make a wide dot or a hard landing look random. SCAN's discovery job stays
  with rack A's ship files and disguised seeds.
- **Ops:** REPAIR and MOVE as on souls. COPY is refused (`ONE POD, ONE DRIVER`), and so is DELETE (`You can't delete a
  pod's driver.`), so a mistake never costs a pod.
- **At launch** the driver uploads into its pod and leaves memory as a print did: chip flash, `POD 03 · LAUNCHED`,
  free blocks (`mergeAdjacentFree`), the echo `> launch pod03 ... LZ-A`, and at touchdown `> pod03 ... LANDED`.
  Nothing in memory can hurt a launched pod.
- **Detail panel:** family, colonists, the predicted outcome (`WILL LAND SOFT · DROP ±78 km`, `WILL LAND HARD`,
  `CAN'T LAUNCH — REPAIR IT`), the `BAY`/`NEXT` tag, and **LOAD NEXT** (PRINT NEXT renamed).

**Driver integrity → landing**, using the capability bands (v2 §6.4):

| Driver band | Integrity | Drop width × | Landing |
|---|---|---|---|
| ok | ≥ 80 | 1.0 | soft |
| degraded | 50–79 | 1.5 | soft |
| failing | 25–49 | 2.0 | HARD (half points) |
| dead | < 25 | — | can't launch until repaired |
| consumed | — | — | no driver: can't launch; parked in orbit when the landing ends (§3.10) |

**Instruments** (extending C3):

| File | ok | degraded | failing or dead | missing |
|---|---|---|---|---|
| Sensor Interp | dot ×1.0 | ×1.5 | ×2.5, grey dot, `DROP UNCERTAIN`, `≈` labels | as failing |
| Nav Plotter | dot ×1.0 | ×1.25 | failing ×1.5; dead: `NO DROP SOLUTION`, no arc, no launch | `NO DROP SOLUTION` |

The two instrument factors multiply with each other and with the driver's (PHASE3 §3.2: the scatter comes from Nav
Plotter and Sensor Interp). Why Nav Plotter is gentler: Sensor Interp already greys the whole plot when it fails, so
the plotter's hits read as "a bit sloppier", and only its death stops the drop.

Telemetry below 60 garbles (▓) the LZ counters, drop widths and window countdowns, as in v2.

The calm ships get their MIND work from **arrival damage on drivers** that sat for decades: ship 1's scripted POD 02
at 44% (it would land hard), then `ceil(pods ÷ 5)` rolled drivers at 55–79%, plus one at 30–45% from layer 4. This
spec owns driver arrival damage on every ship; `04-threats.md` refers to it instead of its own "voyage wear".
Repairing costs charge, which carries to the next ship; flying lower costs FUEL, which does not. That is the calm
ships' real decision.

### 3.9 Scoring and stars

**Per pod:** points = 200 × place × touch.

| Place | Value |
|---|---|
| In an LZ that still has room | 1.0 |
| Mislanded: in an LZ that is already at its count | 0.75 |
| Off-site | the class: 0.5 GENTLE, 0.25 ROUGH, 0 HARSH |
| In a no-go arc | 0 |

touch = 1.0 for a soft landing and 0.5 for a hard one. A pod that never launched adds nothing and is parked in orbit
(§3.10). **Per ship:** the sum over launched pods. The run's total is the sum over visited
ships. Said out loud: "Land in a bracket with room: full points. Too many in one bracket: three quarters. Outside a
bracket: what the planet allows. A bad driver lands hard: half."

Fran's "400 + 800" case: LZ-A gets 400 (all correct), LZ-B gets 600 correct plus 200 mislanded. This spec counts each
colonist once: 1,000 × 1 + 200 × 0.75 = 1,150 points, and the report says `LZ-A 200 SHORT` (decision 11).

**Stars** stay three, and each still carries +6 REPAIR CHARGE (`STAR_CHARGE_BONUS`):
- ★ ORBIT LOCKED (unchanged);
- ★ ON TARGET: at least 95% of the colonists aboard landed soft in an LZ with room (replacing "woke intact"). The
  denominator includes pods that never launched;
- ★ FUEL at least 20% **at the end of the landing** instead of at the lock, so FUEL spent on decay counts.

### 3.10 Soft fails during landing

v2 §4.3's outcomes keep their names. LOCKED lands with the full band; PARTIAL (`ACCEPT · IN BAND 34%`) lands only
through windows launched from inside the band. **END LANDING** (POD BAY window, inline confirm `2 PODS WILL BE PARKED
IN ORBIT · NOT COUNTED`) ends the landing at any time, the way out when drivers can't be repaired.

**No pod stays aboard.** Whenever a landing ends with the ship in orbit (every pod launched, END LANDING, no pod able
to launch, STRANDED, or EMERGENCY), the bay releases every pod still aboard, with or without a driver, and parks it in
the ship's orbit with its beacon on: `POD 07 · PARKED IN ORBIT · fate unknown`. Parked pods are not counted, and the
ship is empty, which `05-story.md`'s SPARE and SUNSET endings need on the final ship. The result keeps each parked pod
and why it stayed (driver eaten, dead, or no time); MERGE brings the eaten ones back and lands them (§3.17). On the
plot they ride the ship's orbit as small blinking beacons. Only a ship that leaves orbit (ESCAPED, CRASHED, ABANDONED) takes its remaining pods
with it: `POD 07 · NOT LAUNCHED`. A crash after decay with an empty tank is rare and plays as CRASHED. The result
record keeps the README's category name, "not launched", for both.

**One word per state** (05 owns the words; this is the decided set): `CAN'T LAUNCH` while a pod is aboard and cannot
launch; `PARKED IN ORBIT · fate unknown` after a landing that ended in orbit; `NOT LAUNCHED` only when the ship left
orbit with pods aboard. A pod is never called "lost", "offline" or "not recovered". An off-site pod on a HARSH world
simply scores 0 (05's epilogue says they were fetched).

With the ship empty the landing lingers `LANDING_DONE_LINGER_SEC` 1.5 s, then the report. **On the final ship the
report waits for the finale**, as phase 2's printer waited (`finalePending`). If every pod is down or parked before
the root is deleted, the strip says `EVERY POD IS DOWN — now DELETE THE ROOT` (row L0 in §3.11), and the LANDING REPORT
comes after the duel. The run-end order is `02-map.md` §4's: the FINALE (with the ending's two steps, decision 23),
then this final LANDING REPORT, then the RUN TALLY.

### 3.11 Guidance: the landing table

`landingObjective(ctx)` is a new pure function in `src/systems/guidance.ts`, evaluated every tick like
`flightObjective`. The first match wins, and no match throws in dev (v2 §6.3).

| # | Situation | Text | Urgency |
|---|---|---|---|
| L0 | The final ship: it is empty and the root is not deleted yet | `EVERY POD IS DOWN — now DELETE THE ROOT` | now |
| L1 | Nav Plotter dead or missing | `NO DROP SOLUTION — TAB, REPAIR NAV PLOTTER` | now |
| L2 | Thrust delivered, or a trim or GO LOWER burn ≤ 8 tactical s away, or the next window is out of band | the flight table's row (F3–F11, GO LOWER's KEEP HOLDING) | as the F row |
| L3 | A window is open and its LZ is full | `LZ-A FULL — hold the pods for LZ-B` | now |
| L4 | Window open, dot fits, bay ready | `LAUNCH NOW — press [L] · LZ-A 1/3` | now |
| L5 | Window open, dot's centre in, its edges out | `LAUNCH — press [L] · WIDE DROP, some may miss` | now |
| L6 | Window open, bay reloading or at its cadence | `RELOADING — next pod in 0:02` | now |
| L7 | A window opens within 8 tactical s | `GET READY — LZ-A IN 0:05` (beeps 5…1) | now |
| L8 | Sensor Interp failing or worse, next window ≤ 60 tactical s | `DROP UNCERTAIN — TAB, REPAIR SENSOR INTERP` | soon |
| L9 | Next LZ has no sure window, and a REPAIR or GO LOWER would give one | `DROP TOO WIDE FOR LZ-B — REPAIR POD 05, or fly lower` (it names the file whose repair helps most: the next driver, Sensor Interp or Nav Plotter) | soon |
| L10 | Decay leaves the band within 2 orbits | `ORBIT DECAYING — out of the band in 2 orbits` plus the trim's key | soon |
| L11 | A pod can't launch and nothing above applies | `POD 07 CAN'T LAUNCH — TAB, REPAIR its driver` | soon |
| L12 | Pods are aboard but none can ever launch | `NO POD CAN LAUNCH — END LANDING parks them in orbit` | now |
| L13 | Otherwise | `WAIT — LZ-B in 2:10 ▸▸` | wait |

The director (`src/systems/director.ts`) composes LANDING as it composes FLIGHT, with the landing line in the flight
line's places (alarm, landing `now`, lessons, mind-urgent, tutorial, landing `soon`, a hint such as `MIND CLEAR —
press [F] to SKIP to LZ-B`, landing `wait`). The `printing` priority goes; the 0.3 s hysteresis stays. Lessons, once
each: `◆ PODS LAND WHERE THE DOT IS`, `◇ POD 02 WILL LAND HARD — REPAIR its driver`, `◆ 2 SITES · LZ-A 3, LZ-B 2 — don't
overfill`, `◆ BELOW THE DRAG LINE THE ORBIT SINKS`, `◆ THE DOT IS WIDE — REPAIR, or fly lower`. Run 2+ shortens them
as v2 §5.2 does.

### 3.12 Pace during landing

`choosePace` in `src/systems/pace.ts` gets landing rules in place of "phase printing → TACTICAL" and "in ring →
TACTICAL":
- **TACTICAL** while a window is open or opens within `WINDOW_TACTICAL_LEAD_TAC` 8 (the burn lead's value), while a
  pod is descending, while thrust is delivered, with a trim burn ≤ 8 tactical s away, with an alarm, or near or inside
  a zone (v2 §6.8). Otherwise CRUISE, or SKIP when asked.
- **SKIP** gains a `window` event. It lands 8 tactical s before the window, straight into GET READY, so no CRUISE
  dead time is left. New inhibitors: `WINDOW OPEN` and `PODS IN FLIGHT`. The others (alarms, HOLLOW, decay trims as
  burn points) stay.
- **OVERCLOCK** works as before. TAB into MIND during a window slows the world to ¼, so the window lasts four times
  as long in real seconds while you repair. Launching is a SHIP control: [L] in blue plays `buzz` and flashes `SHIP
  CONTROLS ARE ON THE AMBER SCREEN — [TAB]`. The mode toggle flashes `◀ SHIP · LZ-A OPEN`.

### 3.13 Surveying (how it plays; versions are 03's)

- **Planets have GOOD or POOR site data.** On GOOD planets ARRIVAL CONTROL's pre-set LZs are sound. On POOR ones,
  ARRIVAL CONTROL gives the counts and its guesses, flagged `UNSURVEYED`. A guess often has a hidden bad trait, and
  CONTROL may even joke about it ("LZ-B is in a lake :)").
- **Site traits:** ROOM (the most colonists it can take), WIDTH (WIDE, STANDARD or NARROW), and GROUND: FLAT (normal),
  ROCKY (every landing there is hard) or WET (hard, and the bracket shrinks by a third).
- **Running SURVEY** holds one thread (like AUTOBURN's reservation, so 25% of thrust, C4). While it runs, the surface
  within ±`SURVEY_SWATH_DEG` 20° of the point under the ship is mapped: terrain fills the GROUND TRACK's overview line,
  and candidates in the swath pop up as dashed brackets, `SITE 4 · ROOM 800 · WIDE · FLAT` (GROUND needs the version
  that rates sites).
- **It starts on the approach, in every version, v1 included.** SURVEY maps from the boot on: the hyperbola sweeps about
  half the planet before the capture and the first orbit the rest, so the coast gets a job, and surveying during the
  capture burn is a real HACK OR BURN cost. A higher version therefore needs a different gain than "active earlier".
- **Choosing:** click a candidate; a pill offers `SET AS LZ-A (800)` for each LZ whose count fits its ROOM, and the
  guess is dropped. One LZ per site; an LZ can't move once a pod has landed in it.
- **Without SURVEY** a POOR planet is still playable on the guesses, only worse. A survey ship never blocks the run
  (decision 12).
- **Candidates:** the LZ count plus 3, with at least one FLAT site with enough ROOM per LZ.

### 3.14 Hooks for AUTODROP (03 owns its versions)

AUTODROP can take over exactly what the player does, through the same calls:
- **the launch action**, with the same refusals and guards;
- **the window list:** each LZ's next open, sure and close times, the launch radius and the drop width there;
- **the bay state and LOAD NEXT**, so a version can send the healthiest drivers to the narrowest LZ;
- **the LZ remaining counts**, so it stops at full;
- **a thread reservation** (`reserveThread`, as AUTOBURN does), and launching from blue: like AUTOBURN, the only launch
  allowed from MIND;
- **a SKIP request** between windows, for a version that chains a whole landing.

PHASE3's v1 ("drops the next pod at the window's centre while you hold") maps onto holding [L]. **v2 is armed with
[G]** (free today in `src/systems/input.ts`; it registers through the router and joins `PREVENTED_CODES`), from SHIP
or MIND, as 03 suggested. A higher version may
drop without the TACTICAL hold (§3.12's window rule counting only for hand drops), so an automated pass can run
inside a SKIP. The friendly resident that "runs the drops" (PHASE3 §6.2) uses the same hook, and so does MERGE's
landing of the restored pods (§3.17).

### 3.15 Landing parameters for the map's ship generator

`02-map.md` rolls every world slot's size and pods by slot, never by route: 20 worlds in 8 layers. Its formulas are the
reference: light 3 + ⌊layer ÷ 3⌋ pods (3–5), standard 3 + layer (5–10), ark round(2.2 × (4 + layer)) capped at 16
(decision 9; 15 in layer 3, 16 beyond), ARES-VII 3 and the final ship 16 (v1: LAST LIGHT). The sizes in the layer
table below are computed from them, and the memory class follows from size and pods (§3.16). This spec's roller turns
them into landing parameters. Bay, cadence and reload are the same everywhere.

**The roller.** It takes (slot, layer, pods) and draws from `childRng(runSeed, slot, 'landing')`, so a ship lands the
same whatever route led to it. It returns:
- the LZs, each with its label, centre angle, width and count in pods;
- the forgiveness class with its card label, and the no-go arcs;
- the site data: GOOD, or POOR with ARRIVAL CONTROL's guesses and the hidden candidates (§3.13);
- the driver arrival damage, and whether drag is on.

Authored slots override what their world fixes (below). The roller throws on pods outside 3–16 or a layer outside 1–8.
It also checks its own output: the counts sum to the pods, the bracket spacing holds, and a POOR planet has a FLAT
candidate with enough ROOM for each LZ.

**LZ count and counts follow the pod count:**

| Pods | LZs | Counts, as even as possible, larger first |
|---|---|---|
| 3 | 1 on ARES-VII, otherwise 2 | 3, or 2 · 1 |
| 4–9 | 2 | 4 → 2 · 2, 6 → 3 · 3, 9 → 5 · 4 |
| 10–13 | 3 | 10 → 4 · 3 · 3, 13 → 5 · 4 · 4 |
| 14–16 | 3 in layers 3–5, 4 in layers 6–8 | 15 → 5 · 5 · 5, 16 → 4 · 4 · 4 · 4 |

From layer 2, one roll in two makes the split uneven: one pod moves from the smallest LZ to the largest, if the
smallest keeps at least one (6 → 4 · 2).

**By layer:**

| Layer | Sizes (02) | Widths | Class | No-go arcs | Site data | Driver arrival damage (§3.8) | Drag |
|---|---|---|---|---|---|---|---|
| 1 | ARES-VII: 3 | WIDE | GENTLE | 0 | GOOD | scripted: POD 02 at 44% | off |
| 2 | light 3, standard 5 | LZ-A WIDE, the rest STANDARD; one NARROW 1 in 2 | GENTLE 2/3, ROUGH 1/3 | 0 | GOOD | ceil(pods ÷ 5) at 55–79% | on |
| 3 | light 4, standard 6, ark 15 | as layer 2 | GENTLE 2/3, ROUGH 1/3 | 0–1 | GOOD | as layer 2 | on |
| 4 | light 4, standard 7, ark 16 | STANDARD, one NARROW | each class 1/3 | 1 | GOOD | as layer 2, plus 1 at 30–45% | on |
| 5 | light 4, standard 8, ark 16 | STANDARD, one NARROW | each class 1/3 | 1 | POOR 1 in 3 | as layer 4 | on |
| 6 | light 5, standard 9, ark 16 | rolled, at least one STANDARD | each class 1/3 | 1–2 | POOR 1 in 2 | as layer 4 | on |
| 7 | light 5, standard 10, ark 16 | as layer 6 | each class 1/3 | 2 | POOR 1 in 2 | as layer 4 | on |
| 8 | New Haven's end slot: the final ship, 16 | STANDARD ×3, NARROW ×1 | GENTLE (New Haven) | 1 | GOOD | as layer 4 | on |

**Authored worlds:**
- ARES-VII is the layer-1 row as written: POD 01 OKAFOR, POD 02 BRANDT at 44%, POD 03 AL-SAYED.
- HALCYON's Tessaly is GENTLE.
- KESTREL's Brine (layer 3) is HARSH, an ocean. It may be a calm ship, so its LZs are all WIDE and it has no no-go arcs.
- VESPER's Cinder (layer 5) is ROUGH, with two lava no-go arcs.
- The layer-8 row is New Haven's end slot alone (v1 has one end slot; run 1's final ship there is LAST LIGHT). The
  final ship is a role (02 §3.6): each future end slot needs its own authored row.
Their sizes come from 02's slot rolls like any other ship.

**The calm ships** (depth 1–2) can only be in layers 1–3 (02). Those layers roll no failing drivers, at most one no-go
arc and GOOD site data, and never HARSH except KESTREL's ocean, whose WIDE sites keep it fair. A layer-3 ark reached
by a long hop at depth 2 is the opening's big prize: 15 pods, about 6 windows by hand.

**Card labels** (02's ship card):
- the class, with a terrain word rolled from the class's examples in §3.6: `PLAINS · off-site pods score half`,
  `ROCKY · off-site pods score a quarter`, `OCEAN · off-site pods score nothing`;
- `NO-GO ZONES` when the planet has arcs;
- `LZ: 2 · SET BY ARRIVAL CONTROL`, or `LZ: 3 · SURVEY NEEDED` on POOR planets;
- the memory row and its fit line (§3.16): `MEMORY 320`, or `MEMORY 256 · TIGHT · ROOM FOR YOU 88`.

**Placement rules** (unchanged):
- brackets at least 12° apart edge to edge;
- from layer 3, one LZ pair may be a double window (12–30° apart, sharing a bay load);
- no-go arcs within 150 km of a bracket edge;
- no POOR planet before layer 5;
- **at most 16 pods on any ship** (decision 9), and no more than the ship's memory class holds (§3.16).

Two long hops can reach a layer-5 POOR ship at depth 3, before 03's SURVEY can be trained. ARRIVAL CONTROL's guesses
keep that ship playable (decision 12).

### 3.16 Memory classes and the block budget

This spec owns the memory model and the rack layouts. Decision 9: pods stay capped at 16, and smaller ships have less
memory, so some are tight for the unit.

**The parts of memory**, in address order, with what the other specs ask of each:
- **Rack A, the ship's own files:** phase 2's 46 blocks (Bay Ctrl takes Printer Uplink's 6) and 18 free. Every ship
  has it. 04 needs at least 14 free on resident ships (WARDEN.sys 10; MOTH.sys 12 plus sleep.lock 1; a left resident's
  log and leftovers at most 14), which leaves at least 4. No conflict. Rack A is the same in every class; the lead's
  placement rules still apply: no hidden corrupted resident on a TIGHT ship (a sleeper is allowed there), and no corrupted
  resident on any ark.
- **The pod racks (B, C, and D on big ships):** 8 blocks per driver, and 04's root slot (the root plus GAPs of 1 and 2,
  11–19 blocks; plain free space with no HOLLOW aboard). They keep **at least 40 free blocks** (the root's gaps not
  counted): the 24-block **tail** at the end of the last pod rack, which the unit may spill into, plus 16 for walls
  and MOVEs (phase 2's calm-rack margin).
- **The receiver (E, and F on all but TIGHT ships):** where the unit lands. It holds 05's locked 2-block `046.log`,
  03's skills (up to 34 blocks), 04's beam seeds (7 blocks each: GAP 1, seed 2, WALL 4; 0–3 per beam) and the charge.
  No next-run trace changes the unit's own files (05's MERGE trace acts at the next run's final ship).

**The classes.** Memory comes in whole racks of 64. Racks keep their names on every ship, so rack E is always you.

| Class | Racks | Blocks | Pod racks | Receiver | Room for you | Most pods | Ships (recommended) |
|---|---|---|---|---|---|---|---|
| FULL | A B C D E F | 384 | B–D, 192 | E–F, 128 | 152 | 16 | arks, standard ships with 9–10 pods (layers 6–7), the final ship (always) |
| COMPACT | A B C E F | 320 | B–C, 128 | E–F, 128 | 152 | 8 | ARES-VII, standard ships with 5–8 pods (layers 2–5) |
| TIGHT | A B C E | 256 | B–C, 128 | E, 64 | 88, no charge floor | 8 (light ships have 3–5) | light ships; from layer 5 at most two per layer (02 places them) |

Why:
- **Whole racks:** the strip draws one row per rack, the addresses and the dev invariant count in racks, and a kid can
  count rows. A half rack would need a new strip.
- **A smaller ship drops rack D first.** Pods fill from rack B, so D is the rack a ship of 8 pods or fewer leaves
  empty. Eight pods with the largest root slot take 64 + 19 + 40 = 123 of 128 blocks; nine would leave 37 free. A ship
  of 9 pods or more is FULL even where HOLLOW never boards, because the class belongs to the ship, not to the run.
- **TIGHT drops rack F.** Only a smaller receiver makes the unit's room smaller, and the unit is what grows over a run.
  Light ships take it because they carry the fewest pods, so the ship that squeezes you is also the one worth least.
  The reason reads in one line: "a small ship has a small receiver." TIGHT keeps two pod racks, because a light ship
  late in a run may still carry HOLLOW's root. Fran (round 2, Q7): up to two TIGHT ships per layer from layer 5, the
  room stays 88, and no late route is forced through one.
- **Room for you = the receiver plus the 24-block tail**, even when the pod racks have more free. One fixed number per
  class goes on the card. Today's `layoutCarried` spills into all of rack D's trailing free; phase 3 caps it at the tail.

**What fills the room**, in the order the boot lays it out:
1. the files as one block from rack E's start, rack E's list and rack F's list back to back;
2. on FULL and COMPACT ships, the floor's 12 blocks of REPAIR CHARGE. **TIGHT ships have no floor** (round 2, Q8:
   decision 9's "no or minimal REPAIR CHARGE"), so there the charge can arrive at 0;
3. deliveries that caught up at this ship (02); one that does not fit stays in the receiver, and the PACKET screen
   shows it as a `SEND ON` chip;
4. each beam seed behind its target while there is room; a seed with no room lands by 04's signed-off rule, in the
   centre of the largest free region, which on a full receiver is usually in the pod racks;
5. the rest of the charge, star credit included. What doesn't fit is lost loudly (phase 2's `CHARGE OVERFLOW`, naming
   the ship and the number).

Only a block longer than the receiver is right-aligned to the end of memory, its start moving back into the tail, so
the Core stays at rack E's start on almost every ship, as today. Nothing throws, and no file is ever dropped at the boot.

**The PACKET screen checks the room before the beam.** The packet must fit the link (files plus charge, phase 2) and the
destination's room: **files + the floor ≤ room**, that is files ≤ 140 on FULL and COMPACT ships and files ≤ 88 on TIGHT
ones. TRANSMIT ▸ waits until enough files are left behind or sent on, as it does for the link. Hitchhikers ride free
(round 2, Q20): HOLLOW's root, beam seeds and seeds on deliveries cost no link room; the root lands in the root slot and
takes no receiver room, and seeds take receiver room only on arrival. The locked files (46 with `046.log`) fit every
class. The charge preview names the loss before it happens: `CHARGE 38 → 12 ON ARRIVAL · 26 WON'T FIT`, and on a noisy
link `SEEDS TAKE ROOM FROM YOUR CHARGE`. **Arriving with 0 charge is never a surprise:** the card's fit line says `NO
CHARGE ARRIVES`, the PACKET's charge line reads `→ 0 ON ARRIVAL` in red with `buzz`, ARRIVAL CONTROL says "Travelling
light! Very light. :)", and TRANSMIT ▸ asks the v2 inline confirm `ARRIVE WITH NO REPAIR CHARGE?` (Enter confirms). On a
noisy link the line gives the range: `CHARGE → 0–4 · SEEDS FIRST`.

**Why TIGHT is viable early and painful late.** The rooms are fixed; the unit grows:

| The unit (files, `046.log` included) | Files | FULL or COMPACT (room 152, floor 12) | TIGHT (room 88, no floor) |
|---|---|---|---|
| Ship 1: the starting kit (SCAN, REPAIR, Repair.bak) | 65 | fits (ship 1's written racks E–F) | ship 1 is never TIGHT |
| Depth 2: + Mv, AUTOBURN v1 (6) | 73 | fits; a ~120 link caps the charge at 47, not the room | fits; 15 blocks left: arrives with 15 |
| Depth 4: every filesystem tool, 12 skill blocks | 84 | fits; 56 above the floor, less 7 per seed | fits; 4 blocks left: arrives with 4, and a seed finds no room behind its target |
| Depth 7: 30 skill blocks, a FIREWALL | 104 | fits; 36 above the floor | 16 over: leave the FIREWALL, Repair.bak, Autopilot and Telemetry, or 16 blocks of skills; arrives with 0 |

So a TIGHT ship costs charge early (15 at depth 2, almost none by depth 4) and files late (a .bak and tools, or
skills; a kid who also leaves Sensor Interp makes every drop ×2.5 wide). No rule says "late"; the unit's growth does.
**The player sees it coming** on the ship card's memory row and fit line, computed against the unit as it is now
(`YOU FIT`, `CHARGE SQUEEZED: 15 ARRIVES`, `NO CHARGE ARRIVES`, `LEAVE 8 BEHIND`), in TRAINING's AHEAD row (03), and
on the PACKET's room bar. At the boot the TERMINAL types `> RECEIVER: 1 RACK · ROOM 88`, and on 0 charge
`> REPAIR CHARGE 0 · NO ROOM ON WAYFARER`.

**FULL and COMPACT, the worst case on 02's longest link (123 blocks):** files are bounded by the link (a full kit is
114 with `046.log`). A FIREWALL that SENTRY compiles at boot adds 2 (only while fewer than two are
owned) and the floor 12: 137 blocks, 9 into the tail. Seeds then have 15 blocks, so two fit behind their targets and a
third lands by 04's no-room rule; charge above the floor fills the rest or is lost loudly. Files, a FIREWALL and the
floor fit any link up to 138, so 02's links (82–123) and its 131-block bound are inside. A normal mid-run unit (about
100 blocks, one seed) never leaves racks E–F.

| Case | Class | Rack A (64) | Pod racks, as layout strings (`P` a pod driver, `R n` the root slot) | Receiver |
|---|---|---|---|---|
| Layer 1, ARES-VII: 3 pods, calm, fresh unit | COMPACT | 46 used, 18 free | B `P P P _40` · C `_64` (104 free) | E 52 + 12 free · F 49 + 15 free |
| Layer 2, light: 3 pods, calm, the depth-2 unit | TIGHT | 46 used, 18 free | B `P P P _40` · C `_64`, its last 24 taken by the unit | 73 files + 15 charge = 88: E full, 24 in C's tail |
| Layer 5, standard: 8 pods, R14, a resident, 2 seeds, a 113 link, the depth-4 unit | COMPACT | 60 used, 4 free | B `P P P P P P _16` · C `P _2 R14 _1 P _31` (47 free) | 84 + 12 + 14 = 110 before the rest of the charge: inside E–F |
| Layer 7, light: 5 pods, R14 (04 caps the root at 14 before the final ship), the depth-7 unit cut to 88 | TIGHT | 46 used, 18 free | B `P P P _40` · C `P _2 R14 _1 P _31` (71 free) | 88 files, 0 charge: E full, 24 in C's tail; seeds land among the pods by the no-room rule (round 2, Q9) |
| Layer 7, standard: 10 pods, R14, a resident, 3 seeds, a 123 link | FULL | 60 used, 4 free | B `P P P P P P _16` · C `P P _2 R14 _1 P _23` · D `P _56` (95 free) | 144 needed: E–F full, 16 into D's tail |
| Layer 8, the final ship: 16 pods, R16, no resident (a layer 4–7 ark: R14, 47 free) | FULL | 46 used, 18 free | B `P P P P P P P _8` · C `P P P P _2 R16 _1 P _5` · D `P P P P _32` (45 free; phase 2's LAST LIGHT had 48) | up to 144, as above |
| The final ship after last run's MERGE trace: R18 (04 §5: slot 21) | FULL | 46 used, 18 free | B as above · C `P P P P _2 R18 _1 P _3` · D `P P P P _32` (43 free, 32 trailing: still above 40) | up to 144, as above |

**Beyond 16 pods.** Twenty pods do not fit in 384 blocks: with a 14-block root and a resident they leave 15 free, 25
short of the 40. Decision 9 caps pods at 16. If 20 come back, a seventh rack on big ships (`RACK G · BAY`) is a fourth
class: once memory varies by ship it costs little more than splitting the bay around the receiver, it keeps every
driver at 8 blocks, and it fits 20 pods with 79 free. Shrinking drivers to 6 blocks would weaken HOLLOW everywhere.

**The generator's rule for the pod racks:** pods fill rack B (at most 7, leaving two to flank the root slot in rack C),
then rack C around the slot, then rack D, keeping the 40 free blocks with 24 trailing in the last pod rack. The slot
reads `P _2 R n _1 P`: the root sits between a driver at GAP 2 and the lead family's driver at GAP 1, which is bitten
first (04's `POD 11` at GAP 2, `POD 12 · OKAFOR` at GAP 1). The root's size is known at boot because it is carried, so
the slot is sized then; with no HOLLOW aboard it is plain free space.

### 3.17 MERGE: the restored pods land

Round 2, Q15: after MERGE the drivers HOLLOW ate come back, and their pods land on their own before the final LANDING
REPORT. They score by the normal rules (§3.9); there is no flat bonus. This spec owns how that landing plays.

- **Which pods.** Every pod on the final ship whose driver HOLLOW ate (`04-threats.md`'s eaten state) and that is still
  in the ship's orbit, aboard or parked. A pod whose driver died some other way stays parked. Pods a ship took out of
  orbit (`NOT LAUNCHED`) are gone with it.
- **Where the drivers appear.** Nowhere in memory: MERGE hands each driver straight back to its pod by radio. Any pod
  still aboard is released first, so every restored pod is a beacon riding the ship's orbit. The TERMINAL lists them
  (`> pod07 ... DRIVER RESTORED · OKAFOR`), the POD BAY window opens a `RESTORED 4` row, and the beacons turn from
  blinking grey to steady amber. Why no memory: the finale's memory is HOLLOW's wreckage, and a file that leaves again
  seconds later would only be noise.
- **Their health.** Each comes back at `MERGE_DRIVER_INTEGRITY` 80, the bottom of the ok band, so the driver never makes
  a pod land hard. Why: the people come back whole; what decides the landing is the player's orbit, instruments and
  skill.
- **When.** After the FINALE's two steps and before the final LANDING REPORT (02 §4's order), as the report's lead-in,
  under the header `THE LAST LANDING`. The ship does not burn: the pods launch from the orbit the player left it in.
- **The pace.** SHIP view, no input but [ENTER] (skip to the result, rolled by the same rules). SKIP runs from window
  to window by itself, TACTICAL ×20 inside them, 2.0 s between launches (pods outside the bay still keep the cadence,
  so the rhythm reads). Blind drops take as many passes as they need (below); AUTODROP gets at most two orbits.
  Restored pods are at most the drivers HOLLOW ate, so this is about 30 s to 2 minutes.
- **With AUTODROP** (any version the unit still holds, at its graded quality): it flies the restored pods through
  §3.14's hook exactly as its version flies a landing (`03-skills.md` §3.8): v1 times each pod but leaves the split to
  luck, v2 flies a pass and can mislay a late pod, v3 plans the split to the LZs with room. Each landing point
  is the normal one: the dot's centre plus u × s, with s from altitude, Sensor Interp and Nav Plotter (§3.3). With a
  good orbit and healthy instruments every pod lands soft in an LZ with room: full points. A pod AUTODROP can't place
  in two orbits (no sure window) drops blind in the last window.
- **Without AUTODROP, or with no drop solution** (Nav Plotter dead or missing, the ship out of the band): the pods
  **drop blind**.
  - No LZ choice: the pods take the windows in the order the ship passes over the LZs, one pod per window in turn,
    whatever the counts, so a full LZ means a mislanded pod. With more restored pods than LZs the pods keep going
    round, pass after pass, one per window, until all are down. Why not several per window: one pod per window keeps
    the blind landings spread over the sites, and each extra pass is only a SKIP of about 6 s.
  - The moment is random: the dot's centre lands uniformly within ±(W ÷ 2 + `BLIND_MARGIN_KM` 150) of the LZ's
    centre, W the bracket's width.
  - The spread is double: s × `BLIND_DROP_MULT` 2.0.
  - Worked example: a STANDARD 400 km LZ from 6,000 km with healthy instruments (s = 78 km): the centre falls within
    ±350 km and the pod ±156 km around it, so about half land in the bracket. On a GENTLE planet a blind pod is worth
    about 0.75 of a full one, on a HARSH one about 0.5, less near no-go arcs.
  - Why 150 km: the no-go arcs sit within 150 km of a bracket edge (§3.15), so a blind drop can find one. Why ×2: the
    pod's own motor flies with no unit steering it.
- **On the final LANDING REPORT** they count in their LZ rows like any pod, and a row `RESTORED BY MERGE` shows them
  with their own icons (`4 RESTORED · 3 LANDED · 1 OFF-SITE`), between the LZ rows and PARKED IN ORBIT. They join the
  credits tagged `(restored)`, leave the parked list, and count for ★ ON TARGET, whose denominator already included
  them. Their first radio line is 05's (`POD 07 · OKAFOR: "Where did we go?"` is a placeholder).

## 4. Screens, UI, audio, juice

- **NAV PLOT** (`src/components/tools-view/NavPlotWindow.ts`): the ring reads `SAFE ORBIT · LAUNCH BAND` in flight and
  `LAUNCH BAND` in landing, with the DRAG line as a faint dashed circle. LZ brackets are thick rim arcs (`LZ-A 1/3`,
  at least 4 viewBox units), no-go arcs red-hatched. The pod arc is dotted bright amber, grey outside the band. A
  launched pod draws a streak with a trail, turns white-hot below the atmosphere line and leaves a mark `◘` where it
  landed. `PRINTER RANGE n%` becomes `IN BAND n%`.
- **GROUND TRACK** (new, a 56 px panel under the NAV PLOT, LANDING only). Its header names the planet, and from the
  first touchdown the colony (`KEPLER-186F · RIVERSIDE`). Its top line is the whole planet unrolled:
  LZ ticks, no-go arcs, the dot, out-of-band stretches hatched, and mapped terrain on survey ships. The main strip is
  3,000 km of surface scrolling under a fixed central dot, in glyph rows (`≈` water, `·` plains, `^` rock, red `////`
  no-go). Brackets read `[ LZ-A · 1/3 ]`, green while the dot fits, bright dashed while only its centre is in; the next
  LZs wait at the right edge (`LZ-B ▸ 2:10`); landed pods leave marks. The panel is mandatory: on the whole plot a
  400 km bracket is only 8–10 px.
- **POD BAY window** (new, under ENGINE, opened at ORBIT LOCK with `transmitIn`): `[ L · LAUNCH POD ]`, `▮▮▮▯ 3/4 ·
  RELOAD 0:12`, `NEXT POD 01 · OKAFOR · SOFT · ±78 km`, the LZ counters, END LANDING, and the pip `BAY CTRL`.
- **Header** crumbs `ORBIT LOCKED | LANDING · 2/6 DOWN | ALL DOWN`, and the countdown chip shows the next window.
  **MIND:** `BAY`/`NEXT` tags; footer `PODS: 8 ABOARD · 3 LANDED · 1 CAN'T LAUNCH`; the mini-HUD shows the next window,
  the bay and `★ ON TARGET 5/6`. **Phone:** the GROUND TRACK replaces the readout row; LAUNCH joins `PhoneFlightBar`.
  **Input:** `KeyL` (launch) and `KeyG` (AUTODROP v2), both free today, through `src/systems/input.ts`; no auto-repeat.
- **Audio:** `podLaunch` (a low thump and a pneumatic hiss); `podEntry` (a noise roar rising over 1.2 s at the
  atmosphere); **touchdown is `printBell`**, pitched per LZ (LZ-B a fifth above LZ-A, so a split is audible), dull
  when hard, a minor second sour when mislanded, a low bonk off-site. The window tone is `lockTone(fraction)` with
  fraction = how centred the dot is. An LZ full plays `capturedChord`, ALL PODS DOWN `lockArp`, a drag kick a soft hiss.
- **Juice:** 2 px shake per launch, the entry flare, a ring pulse at touchdown, `+200 LANDED · LZ-A` (or `+150
  MISLANDED · LZ-B FULL`, `+50 HARD · OFF-SITE`) floating from the bracket, counters filling, PrintFx's chip flash.
- **The first landing** (run 1, first pod): a 5 s descent, the ambient bus ducked, a brighter streak, the `FIRST
  LANDING` stamp, a bigger chord and the radio line. The first pod down on every later ship sends a radio line too.
- **LANDING REPORT** (replaces `src/components/run/WakeReport.ts` and `src/systems/wake-report.ts`; about 15 s,
  skippable): the route and the colony (`KESTREL → BRINE · OCEAN WORLD · HARSH`, then `they are calling it
  LANTERN`); one row per LZ with pod icons by outcome and `600 / 600 ✓` or `200 / 400 · 200 SHORT`; rows for
  OFF-SITE, NO-GO, RESTORED BY MERGE on the final ship (§3.17), and PARKED IN ORBIT (`POD 07 · PARKED IN ORBIT ·
  fate unknown`, beacon glyph) or, after a ship left orbit, NOT LAUNCHED; the
  credits scroll reused, lead colonist first, each with site and first words (`OKAFOR, ADA (11) · LZ-A · "Is it
  morning?"`), with no line for pods that scored 0 or never launched; the headline `LANDED 1,800 / 2,400` (in an LZ
  with room), the breakdown and the points; the stars, `+18 REPAIR CHARGE ON NEXT SHIP` and 03's training-cycles
  line; up to two near misses (`POD 05 landed 40 km outside LZ-B`); CONTINUE ▸. On the final ship it comes after the
  finale (§3.10).
- **Report slots other specs fill**, in this order under the stars: 03's cycles line (`+5 TRAINING CYCLES`); the
  sleeper's `+n TRAINING CYCLES · taught by MOTH` (04) when it was woken; 04's TRACE line (`2 SEEDS LEFT BEHIND · THEY
  REPORT HOME · TRACE …`) when seeds were left; and 05's story line. 05 also supplies the colony name in the header.
- **Memory classes on screen** (§3.16): the MIND strip draws one row per rack the ship has, 4 to 6, on desktop and
  phone, and its header reads `MEMORY 256 · TIGHT`. A missing rack is simply absent, never a greyed row. At the boot
  the TERMINAL types `> RECEIVER: 1 RACK · ROOM 88` on TIGHT ships, and lost charge reads `CHARGE OVERFLOW · 26 LOST ·
  NO ROOM ON WAYFARER` with `stampHit`. The ship card's memory row and the PACKET's room bar are 02's screens; §3.16
  gives their numbers and words.

## 5. Interfaces

**What this spec needs:**
- **From `02-map.md`:** each ship's slot, layer, size class and pods by 02's formulas (§3.15), rolled by slot, and its
  depth on this route; the flight template (the ring, which is the launch band, plus warps and Δv); links of 82–123
  blocks (§3.16); the ship card rows for §3.15's labels; and the save storing each ship's landing result. 02 §3.7
  re-ran its route check on the persistent arm with the memory classes; its route shares are 02 §3.7's.
  **For memory (§3.16):** each ship's class by the recommended rule (light: TIGHT; standard with 5–8 pods and
  ARES-VII: COMPACT; 9 pods or more, arks and the final ship: FULL; at most two TIGHT ships per layer from layer 5);
  the card row `MEMORY n` with the fit line against the current unit; the PACKET's room bar, and TRANSMIT ▸ waiting
  until files plus the floor (12, or 0 on TIGHT) fit the room; deliveries that don't fit the room waiting as `SEND
  ON`; the route check with TIGHT ships costing files (done: no late TIGHT ship is on a best route); and a validity
  rule that no route is forced through a TIGHT ship from layer 5 on. Modifiers that name a rack (KESTREL's debris)
  name one the ship has: rack D exists only on FULL ships.
- **From `03-skills.md`:** AUTODROP and SURVEY versions on the hooks in §3.13–3.14; the conversion from a landing
  result into training cycles. AUTOBURN v3's PHASE3 wording ("a window on every pass") assumes rotation; with this
  spec's planet, every pass already has every window. This spec's proposal for v3: it picks the highest orbit at which
  every LZ's dot fits, flies GO LOWER for you to get there, and holds that orbit against decay. SURVEY maps from the
  approach in every version (§3.13). AUTODROP v2 is armed with [G] (§3.14). TRAINING's AHEAD row shows the next
  ship's room where it binds, with §3.16's words.
- **From `04-threats.md`:** whether and how HOLLOW and seeds target drivers. Drivers are infectable like souls, and
  THE DEAL names a pod. `printMult` becomes `landMult`, and **this spec's condition is the definition**: landMult
  applies while a window is open with a launchable pod. 04's room requests (rack A, the root slot, beam seeds) are
  budgeted in §3.16, and its "voyage wear" is replaced by this spec's driver arrival damage (§3.8).
- **From `05-story.md`:** every on-screen word in this spec as placeholder text (the state words in §3.10 are the
  decided set), the colony name per ship, the radio lines from the ground, the line pools for hard and off-site
  landings, ARRIVAL CONTROL's site quips, and the report's story line.

**What this spec provides:**
- **To 02:** §3.15's roller, the forgiveness classes and card labels, the placement rules, the memory classes, their
  rooms and the boot's fill order (§3.16), the stars (phase 2's three, +6 REPAIR CHARGE each), and the per-ship
  result: ship id, slot, depth, outcome, colonists aboard; per LZ its count, landed, mislanded and hard; off-site,
  no-go, restored, parked (with why) and not launched; points, stars, and FUEL at the end. Ranks are 02's. The card's
  `NO CHARGE ARRIVES` and the PACKET's 0-charge confirm (§3.16). THE LAST LANDING sits inside 02 §4's order, between
  the FINALE and the final LANDING REPORT, as the report's lead-in (§3.17).
- **To 03:** the hooks, and the result's points, landed-correct count and stars. **For memory:** the room is 152
  blocks on FULL and COMPACT ships with the 12-block floor, and 88 on TIGHT ones with no floor, so files may take all 88
  and the charge may be 0; hitchhikers (the root, seeds) cost no link room; the locked 46 fit every class. 03 may assume
  only the link binds on FULL and COMPACT ships. **For MERGE:** AUTODROP flies the restored pods through §3.14's hook at
  its graded version, and its absence means the blind drop (§3.17); 03 says what each version does there (v1 with its
  key held for it).
- **To 04:** the driver segment, its bands and their effects (§3.8), the Nav Plotter and Sensor Interp factors on the
  drop (so every non-fatal hit on them costs landing quality), the rule that launch removes a driver from memory, the
  `BAY`/`NEXT` membership, the "actively landing" condition, the root slot with the lead family at GAP 1 in every
  class (§3.16), and the report's TRACE slot and the final ship's wait for the finale. Seeds spill into the last pod
  rack's tail (rack C on COMPACT and TIGHT ships, which have no rack D). On a TIGHT ship whose receiver is full, seeds
  land among the pods by the no-room rule (round 2, Q9). **For MERGE (§3.17):** which drivers count as eaten by
  HOLLOW, as opposed to dead by other means, and that MERGE leaves the final ship in orbit.
- **To 05:** per ship, the colony's outcome (landed correctly as a share of colonists aboard; ★ ON TARGET at 95% is
  the STAY condition), the featured colonists and their outcomes for the epilogue, the first-touchdown event, an
  empty ship after every landing that ends in orbit (§3.10), which SPARE and SUNSET need, the parked pods with why,
  and THE LAST LANDING after MERGE (§3.17), whose restored colonists and outcomes feed the epilogue. 05 writes the
  restored pods' radio lines and the header.

## 6. Phase 2: reused, changed, removed

- **`src/systems/printer.ts`** becomes `landing.ts` with the same shape: an AI-time tick, `isLaunchable` and
  `nextToLaunch`, LOAD NEXT, the linger into the report. PRINT FAST, the low-range roll and the NO PRINTER give-up go.
- **`src/systems/predict.ts`:** the pod arc and a drop solution (each LZ's window times, launch radius and drop width,
  by Kepler between drag kicks); `greenFraction` now means the share in band; the trim plan gains `go-low`.
  **`orbit-sim.ts`:** the drag kick at ▼, also inside SKIP's conic jumps.
- **`guidance.ts`:** `landingObjective`, with the F rows reused; "reach the printers" becomes "reach the launch band".
  **`director.ts`:** the `printing` priority goes. **`pace.ts`:** §3.12. **`clock.ts`:** ticks in `flight` and
  `landing`.
- **`capabilities.ts`:** `printer` becomes `bay` (band, cadence); a new `drop` capability from Sensor Interp and Nav
  Plotter. **`flight-hud.ts`, `flight-controls.ts`:** crumbs, the countdown chip, `ACCEPT · IN BAND n%`, LAUNCH, END
  LANDING. **`zones.ts`:** unchanged; belt hits continue during landing as during printing.
- **Memory size per ship (§3.16).** 384 is a constant today: `MEMORY_TOTAL_BLOCKS` (`src/data/memory.ts`, from
  `RACK_COUNT` 6 in `tuning.ts`) is imported by about 14 source files, plus the strip components that use `RACK_NAMES`
  and `rackOf` (`MemoryStrip.ts`, `MemoryStats.ts`, `MiniStrip.ts`, `move-preview.ts`). The ship's class becomes part
  of its memory: the total, its rack names (A B C E for TIGHT) and where rack E starts (`UNIT_RACKS_START`: 256 on
  FULL, 192 on the others) are read from the ship instead of the constants. Most of the 14 files use the total only
  for the dev invariant check (`assertMemoryInvariants`), so they change mechanically. The real work is in
  `memory.ts` (the builder, `rackOf`, `rackDTrailingFree` becoming the last pod rack's tail), `carry.ts`,
  `hollow-hud.ts`'s mini strip rows, `ships.ts`'s empty unit, and the strip's row count on desktop and phone.
- **`carry.ts`:** `layoutCarried` takes the destination's room (receiver plus a tail capped at 24), packs the receiver
  as one block from rack E's start, right-aligned only on overflow, in §3.16's fill order; `packUnit`'s check gains
  "files + floor fit the room" (floor 0 on TIGHT) beside the link, and a 0-charge confirm. `trimTrailingFree`'s throw
  (`src/data/memory.ts`) stays as the invariant.
- **`reveal.ts`:** removed, with the STASIS scan, the sealed slabs, `SOULS IN MEMORY` and `SKIP_REFUSAL_COLONISTS`.
- **`wake-report.ts` → `landing-report.ts`**, with `creditsOf` reused. **`run-score.ts`:** `runScore` sums ship
  points, `runWoke` becomes `runLanded`, `fleetHome` stays. **`stars.ts`:** §3.9.
- **`src/data/tuning.ts`:** PRINT_*, REVEAL_*, SOULS_ASK_* and `SOUL_WAKE_INTACT_MIN` go; `WOKE_WITH_GAPS_SCORE`
  becomes `HARD_LANDING_FACTOR` 0.5, `PRINTER_SPEED_BY_BAND` becomes `BAY_CADENCE_BY_BAND`; RANKS keep their point thresholds (02).
  New: the three classes (TIGHT with no arrival floor), `UNIT_TAIL_BLOCKS` 24, `POD_RACK_MIN_FREE` 40,
  `MERGE_DRIVER_INTEGRITY` 80, `BLIND_MARGIN_KM` 150 and `BLIND_DROP_MULT` 2.0. **`ships.ts`:** `printBaseSec` goes, each
  ship gains a landing definition and a memory class, layouts place drivers, and the "every layout has a root" check
  moves to 04's rules. **`souls.ts`:** pools stay; `GAPS_WORDS_POOL` gives way to the hard
  and off-site pools. **`script.ts`:** printing and reveal text becomes landing text (05 writes it).
- **`PrintFx.ts`** is reused as the launch flash, **`WakeReport.ts`** as the LANDING REPORT.
- **v2 §3.3 couplings:** C7 is now Bay Ctrl → cadence. P2 is now orbit fit → band coverage, and altitude → drop width.
  C3 gains the drop. A new pair: driver integrity → drop width and hard landings.
- **v2 §3.5 glossary** gains POD, DRIVER, BAY, LZ, LAUNCH BAND, DROP, WINDOW, LANDED, MISLANDED, OFF-SITE, HARD
  LANDING, PARKED IN ORBIT, NOT LAUNCHED, DRAG and SITE. Never say "scatter", "deorbit" or "insertion", and never use IMPACT for a pod
  (red IMPACT is the ship's crash).
- **Tests:** the 200-seed balance harness breaks and is information only (PHASE3 §11). The headless suites for the
  printer and the reveal are replaced by suites for the drop solution, the bay, scoring and the landing table.

## 7. Story hooks

05 owns the writing. The slots: one colony name per ship, carried into the epilogue; parked pods' beacons (the next
unit, launched 0–35 years later, 2.8 on average, on the same arm, may find last run's still blinking; 02 and 05's call);
one radio line from the ground at the first touchdown on each ship; ARRIVAL CONTROL's site quips on POOR planets ("LZ-B
is in a lake :)"); the report's odd line; candidate sites as finds, for example `SITE 5 · ROOM 0 · WRECKAGE · OLD POD`,
which can feed the `046.log` mystery; "fate unknown" for pods that never launched; and CONTROL's cheer about tight ships
("Cosy! Pack light. :)"), which never says why a caretaker should arrive with so little.

## 8. Slices

- **Slice 1, landing replaces printing on the five ships.** 1a: drivers in §3.16's layouts, bay, [L], arc and dot,
  pre-set LZs, scoring, parking in orbit, LANDING REPORT, the landing table except L8–L10, pace and SKIP to windows,
  GROUND TRACK, POD BAY. 1b: the drop width
  model, forgiveness and no-go, Bay Ctrl, the DRAG line and decay, GO LOWER, L8–L10.
- **Slice 2, the calm opening:** ship 1–2 lessons, driver arrival damage, the first-landing moment.
- **Slice 3, the map:** §3.15's roller in the generator, and the result in the save. **Variable memory lands here**,
  with the generator that assigns the classes. First a refactor with no visible change (the size and rack names come
  from the ship; every ship FULL; the suites unchanged), then COMPACT and TIGHT, the card row, the PACKET's room
  check and the boot's fill order. Slices 1–2 keep 384 on the five ships; the pooled receiver block (§3.16) needs no
  class and comes with the drivers in slice 1a.
- **Slice 4, the tree:** the AUTODROP hooks and AUTOBURN v3's landing orbit.
- **Slice 5, residents:** the friendly resident's drops through the same hook.
- **Slice 7, the endings:** THE LAST LANDING after MERGE (§3.17), its blind drop and the report's RESTORED row.
- **Slice 6, SURVEY:** POOR planets, candidates, the swath, assigning sites.
- **Slice 8, the rebalance:** widths, `DROP_KM_PER_1000`, drag, the score factors and the layer table.

## 9. Deviations from PHASE3.md

1. **"Low orbit: frequent windows; high orbit: fewer."** Not felt in real time, because SKIP crosses any gap in about
   6 s. The trade moves: low means a tight dot, short fast windows and decay; high means long calm windows and a wide
   dot that damage makes unusable.
2. **The planet does not rotate.** PHASE3 is silent; §3.1 decides.
3. **The bay's "3–4 loaded pods"** becomes 4 slots with a 20 s world-time reload: a limit per window and between close
   LZs, not per pass.
4. **"Launch when the dot is inside the bracket"**: a sure landing needs the whole dot inside; centre-only may miss.
5. **The descent** plays on AI time (3.5 s) along the true arc, not in the real 2–5 minutes.
6. **"Some planets need a survey"** becomes POOR site data with ARRIVAL CONTROL's guesses: worse without SURVEY, never
   blocked. This touched a decided item; Fran accepted it (decision 12).
7. **Faces:** the epilogue payoff stays, plus one radio line per ship at the first touchdown and the report's credits.
8. **Stars:** "woke intact" becomes ON TARGET; the FUEL star is judged at the end of the landing.
9. **Pod counts:** "later ships may have 20" becomes at most 16, because 20 do not fit in 384 blocks (§3.16). Fran
   accepted this (decision 9); a seventh rack for big ships stays a later option.
10. **Memory varies by ship** (decision 9; PHASE3 is silent, phase 2 fixed it at 384): three classes of whole racks,
    and a TIGHT ship's one-rack receiver squeezes the unit (§3.16).

## 10. Risks and questions for Fran

**Risks**
1. **The long-hop balance.** 02 sizes ships by slot, so arks reached by long hops pay for skipping smaller ships. 02
   re-ran its check on the persistent arm with the TIGHT cost (route shares in 02 §3.7): long hops still pay, and no
   late TIGHT ship is on a best route.
2. **Repetition on big ships.** 16 pods is 5–7 windows and about 3 minutes: intended pressure toward AUTODROP, but
   possibly a chore before it exists. Levers: a bigger bay on big ships, wider brackets.
3. **Elliptical orbits** give each LZ its own launch altitude, so one LZ's dot fits and another's doesn't. The per-LZ
   readouts and L9 must say so clearly.
4. **SKIP across drag kicks** needs the conic jump split at each ▼: new code in a sensitive place.
5. **Dense memory.** The final ship's 45 free blocks in the pod racks are about phase 2's LAST LIGHT (48), but seeds that
   spill into the tail eat into its wall room. §3.16 assumes 02's links (at most 123 blocks), at most 3 seeds per beam
   and the pooled receiver. If 02 or 04 raise either, the tail must grow and the pod cap may drop.
6. **A late TIGHT ship can feel like a trap.** At depth 7 it asks for 16 blocks and leaves 0 charge. The card, the
   AHEAD row and the PACKET (with its 0-charge confirm) show it before SET COURSE, and no late route is forced through
   one (§5). If kids still feel cheated, the levers are a bigger TIGHT tail (40 blocks: room 104) or a small floor back.
8. **THE LAST LANDING** lengthens the finale by up to two minutes. [ENTER] skips it, and its rules are the normal
   ones, so the only new code is the blind roll and the scripted pace.
7. **The size refactor** touches about 14 files and the strip. Done first as a refactor with no visible change
   (slice 3), the memory suites catch what it breaks.

**Decided** (Fran, 2026-10-28): the planet does not rotate (§3.1); mislanded ×0.75, off-site 0.5 / 0.25 / 0, hard
×0.5, and each colonist counts once in the 400 + 800 case (§3.9); POOR planets are playable on ARRIVAL CONTROL's
guesses (§3.13); the descent plays in 3.5 s, launch is [L], decay comes in slice 1b; pods are capped at 16 and memory
varies by ship (§3.16); pod counts follow the slot (02); the role "the final ship" replaces LAST LIGHT, which v1 may
still use.

**Decided in round 2** (Fran, after the rework): TIGHT's room stays fixed at 88 (my Q10); a seed on a full TIGHT
receiver lands among the pods (Q11; round 2 Q9); TIGHT ships have no charge floor, so charge may arrive at 0, while
COMPACT and FULL keep the floor of 12 (Q12; round 2 Q8); light ships stay TIGHT in every layer, with up to two TIGHT
ships per layer from layer 5 and no late route forced through one (Q13; round 2 Q7); hitchhikers ride free on the link
(round 2 Q20); every final ship is FULL (round 2 Q3); the run ends FINALE, final LANDING REPORT, RUN TALLY (round 2
Q16); MERGE restores the eaten pods' drivers and their pods land, scored by the normal rules (round 2 Q15; §3.17).

**Decided in round 3** (Fran): the blind drop's numbers as starting values (Q14: ±(W ÷ 2 + 150 km), double spread),
and restored drivers at 80% integrity (Q15; §3.17).

**Questions:** none open. Q1–Q15 are answered.
