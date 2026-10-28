# 01 · Landing and pods

Spec for PHASE3 §3 and the pod-driver half of §2. It builds on `docs/design-v2.md` (cited as v2 §n) and the code as
built. Constants named here are new entries for `src/data/tuning.ts` unless said otherwise.

## 1. Summary

- After ORBIT LOCK a new run phase, **LANDING**, replaces `printing`. Each pod carries 200 colonists and is flown by an
  8-block **pod driver** file in racks B–D (`POD 03 · OKAFOR`).
- The NAV PLOT draws the pod's arc to a **drop dot** sliding along the planet; each landing zone (LZ) is a **bracket**
  on the rim, and a new GROUND TRACK strip shows both at readable scale. **[L]** launches while the dot is inside.
- The **bay** holds 4 pods, fires one every 2 tactical s and reloads one every 20.
- The dot's width grows with altitude and is multiplied by Sensor Interp, Nav Plotter and driver damage; a failing driver also
  lands hard. Damage pushes you lower, and a low orbit decays and costs FUEL: pay with REPAIR CHARGE or with FUEL.
- **The planet does not rotate**: one window per LZ per orbit, SKIP between windows, TACTICAL ×20 inside them, about
  24–30 real seconds per window. Score per pod = 200 × where × how it landed; a **LANDING REPORT** follows.

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

**Ship 2 (HALCYON at Tessaly, layer 2, a standard ship: 5 pods, LZ-A 3 and LZ-B 2, GENTLE).** Two brackets, and the
lesson is the split. A transit hit left Sensor
Interp at 62%, so the dot is half again as wide and no longer fits the narrower LZ-B: `DROP TOO WIDE FOR LZ-B —
REPAIR SENSOR INTERP, or fly lower`. Repairing costs charge the kid will want on ship 3. Flying lower is one RETRO
burn that the strip times and releases, but below the DRAG line the orbit sinks a little every pass and costs FUEL.
After three LZ-A pods, `LZ-A FULL — hold the pods for LZ-B` stops the classic mistake.

**Later (a layer-7 standard ship on a volcanic world, HOLLOW awake).** Ten pods go to three sites (4, 3 and 3), with a red lava arc 100 km past
LZ-B. HOLLOW bites a driver in the bay, so the kid TABs in mid-window: OVERCLOCK slows the world to a quarter, the
window waits, the repair wins, and the kid TABs back for the last two pods. With AUTODROP the kid stays in blue while
the pods go down on their own; without it, a 16-pod ark is 5–7 windows by hand, which Fran wants felt.

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
colonist once: 1,000 × 1 + 200 × 0.75 = 1,150 points, and the report says `LZ-A 200 SHORT`. Question 2 asks about
"200 + 200".

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
ship is empty, which `05-story.md`'s SPARE and SUNSET endings need on the last ship. On the plot they ride the ship's
orbit as small blinking beacons. Only a ship that leaves orbit (ESCAPED, CRASHED, ABANDONED) takes its remaining pods
with it: `POD 07 · NOT LAUNCHED`. A crash after decay with an empty tank is rare and plays as CRASHED. The result
record keeps the README's category name, "not launched", for both.

**One word per state** (05 owns the words; this is the decided set): `CAN'T LAUNCH` while a pod is aboard and cannot
launch; `PARKED IN ORBIT · fate unknown` after a landing that ended in orbit; `NOT LAUNCHED` only when the ship left
orbit with pods aboard. A pod is never called "lost", "offline" or "not recovered". An off-site pod on a HARSH world
simply scores 0 (05's epilogue says they were fetched).

With the ship empty the landing lingers `LANDING_DONE_LINGER_SEC` 1.5 s, then the report. **On LAST LIGHT the report
waits for the finale** (04-threats §3.10), as phase 2's printer waited (`finalePending`). If every pod is down or
parked before the root is deleted, the strip says `EVERY POD IS DOWN — now DELETE THE ROOT` (row L0 in §3.11), and the
LANDING REPORT comes after the duel.

### 3.11 Guidance: the landing table

`landingObjective(ctx)` is a new pure function in `src/systems/guidance.ts`, evaluated every tick like
`flightObjective`. The first match wins, and no match throws in dev (v2 §6.3).

| # | Situation | Text | Urgency |
|---|---|---|---|
| L0 | LAST LIGHT: the ship is empty and the root is not deleted yet | `EVERY POD IS DOWN — now DELETE THE ROOT` | now |
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
  (question 4).
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
inside a SKIP. The friendly resident that "runs the drops" (PHASE3 §6.2) uses the same hook.

### 3.15 Landing parameters for the map's ship generator

`02-map.md` rolls every world slot's size and pods by slot, never by route: 20 worlds in 8 layers. Its formulas are the
reference: light 3 + ⌊layer ÷ 3⌋ pods (3–5), standard 3 + layer (5–10), ark round(2.2 × (4 + layer)) capped at 16 by
§3.16 (15 in layer 3, 16 beyond), ARES-VII 3 and LAST LIGHT 16. The sizes in the layer table below are computed from
them. This spec's roller turns them into landing parameters. Bay, cadence
and reload are the same everywhere.

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
| 8 | LAST LIGHT: 16 | STANDARD ×3, NARROW ×1 | GENTLE (New Haven) | 1 | GOOD | as layer 4 | on |

**Authored worlds:**
- ARES-VII is the layer-1 row as written: POD 01 OKAFOR, POD 02 BRANDT at 44%, POD 03 AL-SAYED.
- HALCYON's Tessaly is GENTLE.
- KESTREL's Brine (layer 3) is HARSH, an ocean. It may be a calm ship, so its LZs are all WIDE and it has no no-go arcs.
- VESPER's Cinder (layer 5) is ROUGH, with two lava no-go arcs.
- LAST LIGHT is the layer-8 row.
Their sizes come from 02's slot rolls like any other ship.

**The calm ships** (depth 1–2) can only be in layers 1–3 (02). Those layers roll no failing drivers, at most one no-go
arc and GOOD site data, and never HARSH except KESTREL's ocean, whose WIDE sites keep it fair. A layer-3 ark reached
by a long hop at depth 2 is the opening's big prize: 15 pods, about 6 windows by hand.

**Card labels** (02's ship card):
- the class, with a terrain word rolled from the class's examples in §3.6: `PLAINS · off-site pods score half`,
  `ROCKY · off-site pods score a quarter`, `OCEAN · off-site pods score nothing`;
- `NO-GO ZONES` when the planet has arcs;
- `LZ: 2 · SET BY ARRIVAL CONTROL`, or `LZ: 3 · SURVEY NEEDED` on POOR planets.

**Placement rules** (unchanged):
- brackets at least 12° apart edge to edge;
- from layer 3, one LZ pair may be a double window (12–30° apart, sharing a bay load);
- no-go arcs within 150 km of a bracket edge;
- no POOR planet before layer 5;
- **at most 16 pods on any ship** (§3.16).

Two long hops can reach a layer-5 POOR ship at depth 3, before 03's SURVEY can be trained. ARRIVAL CONTROL's guesses
keep that ship playable (question 4).

### 3.16 The block budget (rack layouts)

This spec owns the rack layouts. The other specs ask for room as follows:
- **Rack A**: 04 needs at least 14 free blocks on resident ships (WARDEN.sys 10; MOTH.sys 12 plus sleep.lock 1; a
  left resident's log and leftovers at most 14).
- **Racks E–F**: 05's locked 2-block `046.log` in rack F. 04's beam seeds take 7 blocks each (GAP 1, seed 2, WALL 4),
  0–3 per beam, in E–F's free tails. 03's skills total up to 34 blocks. 05's MERGE trace makes the Core 8 blocks
  bigger next run.
- **Rack D**: 03 needs 24 or more trailing free blocks for the unit's spill.
- **Racks B–D**: 04 needs a root slot of the root plus GAPs of 1 and 2 (11–19 blocks; plain free space on ships
  without HOLLOW aboard).

Fixed parts:
- **Rack A** keeps phase 2's 46 blocks of ship files (Bay Ctrl takes Printer Uplink's 6) and 18 free. A resident takes at
  most 14, which leaves at least 4. No conflict.
- **Racks E–F hold the unit as one block.** This is a change to `layoutCarried` in `src/systems/carry.ts`.
  - **The problem today:** rack E's list ends where rack F starts, so a big rack E overflows into rack D while rack F
    still has free blocks. AI files 52, skills 34 and two FUEL TRIMs make 90 blocks, which puts 26 into rack D before
    any seed (34 after a MERGE's +8 Core). With seeds behind skills it reaches 55, past the 24-block tail, where
    `trimTrailingFree` (`src/data/memory.ts`) throws.
  - **Phase 3's layout:** rack E's list, rack F's list and REPAIR CHARGE go back to back from rack E's start. Skills
    may run into rack F, and the free space sits after the block, at the end of rack F. Only a block longer than 128 is
    right-aligned to rack F's end, with its start moving back into rack D's tail. Right-aligning only on overflow keeps
    the Core at rack E's start on almost every ship, as today; aligning every block right would be a one-line change.
  - **The order inside the block keeps the arrival floor:** first the files, then the floor's 12 blocks of charge,
    then each beam seed behind its target (04's GAP 1, seed 2, WALL 4) while there is room, then the rest of the
    charge.
- **The worst case on 02's longest link (123 blocks):**
  - Files are bounded by the link, so at most 123 (a full kit is 114 including `046.log`; a MERGE run's is 122).
  - A FIREWALL that SENTRY compiles at boot adds 2, and only while fewer than two are owned. The floor adds 12. That
    makes 137 blocks, 9 into the 24-block tail.
  - Seeds then have 15 blocks of room: two fit behind their targets. In this corner only, a third seed lands by 04's
    own rule for a seed with no room (the centre of the largest free region).
  - Charge above the floor fills what is left, and the rest is lost loudly (phase 2's `CHARGE OVERFLOW`). Nothing
    throws.
  - Files, a compiled FIREWALL and the floor fit for any link up to 138 blocks, so 02's links (82–123) and its
    131-block bound are inside that. A normal mid-run unit (about 100 blocks, one seed) never leaves racks E–F.
- **Racks B–D** take 8 blocks per pod and the root slot. They must keep **at least 40 free blocks** (the root's gaps
  not counted): the 24-block tail, plus 16 for walls and MOVEs (phase 2's calm-rack margin).

| Case | Rack A (64) | Racks B–D (192), as layout strings (`P` a pod driver, `R n` the root slot) | Racks E–F (128) |
|---|---|---|---|
| Layer 1, ARES-VII: 3 pods, calm, fresh unit | 46 used, 18 free | B `P P P _40` · C `_64` · D `_64` (168 free) | E 52 + 12 free · F 49 + 15 free |
| Layer 7, standard: 10 pods, a 14-block root aboard, a resident, 3 seeds, a 123 link | 60 used, 4 free | B `P P P P P P _16` · C `P P _2 R14 _1 P _23` · D `P _56` (95 free; 56 trailing) | 144 needed: E–F full, 16 into the D tail |
| Layer 8, LAST LIGHT: 16 pods, R16, no resident (a layer 4–7 ark is the same with R14 and 47 free) | 46 used, 18 free | B `P P P P P P P _8` · C `P P P P _2 R16 _1 P _5` · D `P P P P _32` (45 free, 32 of them trailing; phase 2's LAST LIGHT had 48) | up to 144, as above |
| An uncapped ark (02's first draft): 20 pods, a 14-block root, a resident, 3 seeds | 60 used, 4 free | 160 + 17 = 177 used, 15 free: **25 short** of 40 | 16 spill with nowhere to go |

**A 20-pod ship does not fit in 384 blocks.** The options:
1. **Cap pods at 16** (the flagship's size). Every case above fits with phase 2's own margins, the memory model is
   unchanged, and 16 pods are still 5–7 windows by hand, so losing AUTODROP is felt.
2. **A seventh rack on big ships** (`RACK G · BAY`, after F, "a bigger ship has a bigger computer"). 20 pods fit with
   79 free. The cost: 384 is a fixed constant in 14 source files today (`MEMORY_TOTAL_BLOCKS`, `RACK_COUNT`), the strip
   gains a row on desktop and phone, and the bay is split around the unit's racks.
3. **6-block drivers**: 20 pods fit in 384, but every driver gets cheaper to repair and lands in phase 2's narrow chip
   rendering (`STRIP_NARROW_MAX_BLOCKS` 6), and HOLLOW gets weaker on every ship.
4. **Cap at 18**: 7 free blocks outside the tail, so HOLLOW can't be walled. Rejected.
5. **Skills spill elsewhere**: there is no elsewhere. Rack A has 4 blocks to spare on a resident ship. Rejected.

**Recommendation: option 1, cap at 16.** PHASE3 §3.1's "later ships may have 20" is an example inside a decided item,
so it goes to Fran (question 9). If he wants 20, option 2 as a big-ship modifier is the better way: it keeps every
driver at 8 blocks and gives the map a visible "big ship".

The generator's rule for B–D: up to 7 pods in rack B, then rack C with the root slot, then rack D, keeping the 40 free
blocks with the last 24 trailing in rack D. The slot reads `P _2 R n _1 P`: the root sits between a driver at GAP 2
and the lead family's driver at GAP 1, which is bitten first (04's `POD 11` at GAP 2, `POD 12 · OKAFOR` at GAP 1). The root's size is known at boot
because it is carried, so the slot is sized then.

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
  OFF-SITE, NO-GO, and PARKED IN ORBIT (`POD 07 · PARKED IN ORBIT · fate unknown`, beacon glyph) or, after a ship left
  orbit, NOT LAUNCHED; the
  credits scroll reused, lead colonist first, each with site and first words (`OKAFOR, ADA (11) · LZ-A · "Is it
  morning?"`), with no line for pods that scored 0 or never launched; the headline `LANDED 1,800 / 2,400` (in an LZ
  with room), the breakdown and the points; the stars, `+18 REPAIR CHARGE ON NEXT SHIP` and 03's training-cycles
  line; up to two near misses (`POD 05 landed 40 km outside LZ-B`); CONTINUE ▸. On LAST LIGHT it comes after the
  finale (§3.10).
- **Report slots other specs fill**, in this order under the stars: 03's cycles line (`+5 TRAINING CYCLES`); the
  sleeper's `+n TRAINING CYCLES · taught by MOTH` (04) when it was woken; 04's TRACE line (`2 SEEDS LEFT BEHIND · THEY
  REPORT HOME · TRACE …`) when seeds were left; and 05's story line. 05 also supplies the colony name in the header.

## 5. Interfaces

**What this spec needs:**
- **From `02-map.md`:** each ship's slot, layer, size class and pods by 02's formulas (§3.15), rolled by slot, and its
  depth on this route; the flight template (the ring, which is the launch band, plus warps and Δv); links of 82–123
  blocks (§3.16); the ship card rows for §3.15's labels; and the save storing each ship's landing result. 02 §3.7
  re-ran its route check with the cap at 16 and standard ships one pod smaller: the best route is 7 ships in 51% of
  waves, 6 in 45% and 5 in 3%.
- **From `03-skills.md`:** AUTODROP and SURVEY versions on the hooks in §3.13–3.14; the conversion from a landing
  result into training cycles. AUTOBURN v3's PHASE3 wording ("a window on every pass") assumes rotation; with this
  spec's planet, every pass already has every window. This spec's proposal for v3: it picks the highest orbit at which
  every LZ's dot fits, flies GO LOWER for you to get there, and holds that orbit against decay. SURVEY maps from the
  approach in every version (§3.13). AUTODROP v2 is armed with [G] (§3.14).
- **From `04-threats.md`:** whether and how HOLLOW and seeds target drivers. Drivers are infectable like souls, and
  THE DEAL names a pod. `printMult` becomes `landMult`, and **this spec's condition is the definition**: landMult
  applies while a window is open with a launchable pod. 04's room requests (rack A, the root slot, beam seeds) are
  budgeted in §3.16, and its "voyage wear" is replaced by this spec's driver arrival damage (§3.8).
- **From `05-story.md`:** every on-screen word in this spec as placeholder text (the state words in §3.10 are the
  decided set), the colony name per ship, the radio lines from the ground, the line pools for hard and off-site
  landings, ARRIVAL CONTROL's site quips, and the report's story line.

**What this spec provides:**
- **To 02:** §3.15's roller, the classes and card labels, the placement rules, the layouts (§3.16), the stars (phase
  2's three, +6 REPAIR CHARGE each), and the per-ship result: ship id, slot, depth, outcome, colonists aboard; per LZ
  its count, landed, mislanded and hard; off-site, no-go and not launched; points, stars, and FUEL at the end. Ranks
  are 02's: phase 2's absolute thresholds in points (this spec's earlier share-based suggestion is superseded).
- **To 03:** the hooks, and the result's points, landed-correct count and stars.
- **To 04:** the driver segment, its bands and their effects (§3.8), the Nav Plotter and Sensor Interp factors on the
  drop (so every non-fatal hit on them costs landing quality), the rule that launch removes a driver from memory, the
  `BAY`/`NEXT` membership, the "actively landing" condition, the root slot with the lead family at GAP 1 (§3.16), and
  the report's TRACE slot and the flagship's wait for the finale.
- **To 05:** per ship, the colony's outcome (landed correctly as a share of colonists aboard; ★ ON TARGET at 95% is
  the STAY condition), the featured colonists and their outcomes for the epilogue, the first-touchdown event, and an
  empty ship after every landing that ends in orbit (§3.10), which SPARE and SUNSET need.

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
- **`carry.ts`:** `layoutCarried` packs racks E–F as one block from rack E's start, right-aligned only on overflow, with
  the floor's charge before the seeds (§3.16); `trimTrailingFree`'s throw (`src/data/memory.ts`) stays as the
  invariant.
- **`reveal.ts`:** removed, with the STASIS scan, the sealed slabs, `SOULS IN MEMORY` and `SKIP_REFUSAL_COLONISTS`.
- **`wake-report.ts` → `landing-report.ts`**, with `creditsOf` reused. **`run-score.ts`:** `runScore` sums ship
  points, `runWoke` becomes `runLanded`, `fleetHome` stays. **`stars.ts`:** §3.9.
- **`src/data/tuning.ts`:** PRINT_*, REVEAL_*, SOULS_ASK_* and `SOUL_WAKE_INTACT_MIN` go; `WOKE_WITH_GAPS_SCORE`
  becomes `HARD_LANDING_FACTOR` 0.5, `PRINTER_SPEED_BY_BAND` becomes `BAY_CADENCE_BY_BAND`; RANKS keep their point thresholds (02).
  **`ships.ts`:** `printBaseSec` goes, each ship gains a landing definition, layouts place drivers, and the "every
  layout has a root" check moves to 04's rules. **`souls.ts`:** pools stay; `GAPS_WORDS_POOL` gives way to the hard
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

05 owns the writing. The slots: one colony name per ship, carried into the epilogue; parked pods' beacons (a colony
might recover them decades later, which is 05's call); one radio line from the ground at
the first touchdown on each ship; ARRIVAL CONTROL's site quips on POOR planets ("LZ-B is in a lake :)"); the
report's odd line; candidate sites as finds, for example `SITE 5 · ROOM 0 · WRECKAGE · WAVE 1 POD`, which can feed the
`046.log` mystery; and "fate unknown" for pods that never launched.

## 8. Slices

- **Slice 1, landing replaces printing on the five ships.** 1a: drivers in §3.16's layouts, bay, [L], arc and dot,
  pre-set LZs, scoring, parking in orbit, LANDING REPORT, the landing table except L8–L10, pace and SKIP to windows,
  GROUND TRACK, POD BAY. 1b: the drop width
  model, forgiveness and no-go, Bay Ctrl, the DRAG line and decay, GO LOWER, L8–L10.
- **Slice 2, the calm opening:** ship 1–2 lessons, driver arrival damage, the first-landing moment.
- **Slice 3, the map:** §3.15's roller in the generator, and the result in the save.
- **Slice 4, the tree:** the AUTODROP hooks and AUTOBURN v3's landing orbit.
- **Slice 5, residents:** the friendly resident's drops through the same hook.
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
   blocked. This touches a decided item; see question 4.
7. **Faces:** the epilogue payoff stays, plus one radio line per ship at the first touchdown and the report's credits.
8. **Stars:** "woke intact" becomes ON TARGET; the FUEL star is judged at the end of the landing.
9. **Pod counts:** "later ships may have 20" becomes at most 16, because 20 do not fit in memory (§3.16). This touches a
   decided item's example; see question 9.

## 10. Risks and questions for Fran

**Risks**
1. **The long-hop balance.** 02 sizes ships by slot, so arks reached by long hops pay for skipping smaller ships. The
   cap at 16 shrinks those arks to 15–16 pods. 02 §3.7 re-ran the check with standard ships one pod smaller: the best
   route is 7 ships in 51% of waves, 6 in 45%, 5 in 3%, so long hops still pay.
2. **Repetition on big ships.** 16 pods is 5–7 windows and about 3 minutes: intended pressure toward AUTODROP, but
   possibly a chore before it exists. Levers: a bigger bay on big ships, wider brackets.
3. **Elliptical orbits** give each LZ its own launch altitude, so one LZ's dot fits and another's doesn't. The per-LZ
   readouts and L9 must say so clearly.
4. **SKIP across drag kicks** needs the conic jump split at each ▼: new code in a sensitive place.
5. **Dense memory.** The flagship's 45 free blocks in B–D are about phase 2's LAST LIGHT (48), but beam seeds that
   spill into the rack D tail eat into its wall room. §3.16's budget assumes 02's links (at most 123 blocks), at most 3
   seeds per beam, and the pooled E–F layout (a change to `carry.ts`). If 02 or 04 raise the links or the seeds, the
   tail must grow and the pod cap may have to drop.

**Questions** (each with my recommendation)
1. **Does the planet rotate?** Recommended: **no**, for the reasons in §3.1. Rotation can return as a planet modifier.
2. **"200 + 200 mislanded" in the 400 + 800 case:** two groups of 200, or one? Recommended: count each colonist once.
   200 are mislanded (in LZ-B, at 0.75), and LZ-A is reported 200 short.
3. **The factors:** mislanded 0.75, off-site 0.5 / 0.25 / 0 by class, hard ×0.5. Recommended: yes as starting values;
   mislanded must stay above the best off-site value, as you ruled.
4. **A POOR planet without SURVEY:** blocked, or ARRIVAL CONTROL's guesses? Recommended: **the guesses**. A blocked
   ship in a roguelike run is a dead end, and the bad guesses give SURVEY its story reason.
5. **The pod's descent on AI time (3.5 s)** instead of minutes of game time. Recommended: yes. The arc stays honest;
   only its playback is fast.
6. **The launch key:** recommended **[L]**, separate from SPACE, so a held burn can never fire a pod.
7. **Pod counts by depth or by ship size?** Resolved: `02-map.md` rolls them by slot (layer and size class), and
   §3.15 is keyed the same way.
8. **Decay in slice 1** or later? Recommended: slice 1b, after the core drop loop is playable, so the first playtest
   judges the drop before the orbit choice.
9. **At most 16 pods per ship?** PHASE3 §3.1 says later ships "may have 20", but 20 pods with HOLLOW aboard, a
   resident and the other specs' room do not fit in 384 blocks (§3.16). Recommended: **cap at 16**, the flagship's
   size. If you want 20, a seventh rack as a big-ship modifier ("a bigger ship has a bigger computer") is the better
   way than shrinking every driver.
