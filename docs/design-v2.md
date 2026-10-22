# ARRIVAL PROTOCOL // SOULCACHE: Game Design (final)

> **About this file.** This is the full working design of the 2026-10 overhaul (ARRIVAL PROTOCOL // SOULCACHE).
> `DESIGN.md` is the short version. Source comments cite this file by section (`§4.5`, `§9 WP7`). The code is the
> source of truth for numbers (`src/data/tuning.ts`, `src/data/ships.ts`); where they differ, the code wins. Section 9's
> work packages are the build plan as it was given to the implementing agents. Paths under `.tmp/` name working files
> of the overhaul that are not versioned; the tests now live in `tests/`.

Lead design for the overhaul. The base is SOULCACHE, whose premise puts the colonists inside the memory strip. Grafted onto it:

- From STATIC (kid lens): the flight that reads in five seconds, the cold open, OVERCLOCK and the mini-HUDs.
- From ECHO: scope discipline, segment-granularity infection and the run-counter ghost.
- From STATIC (hacker lens): the coast-is-hacking pacing, the terminal echo, and "the engine fires by itself".
- From The Forty-Seventh: the smiley mission voice.

This is the final revision after three critiques (playthrough, buildability, coherence). Every blocker and major issue is either fixed in the body or answered in **Appendix A: Critique responses**. The flight numbers come from headless probes:

- `.tmp/overhaul/probes/design-final-ship1.mjs`: ship-1 thresholds, capture timing, the C12 bite window, early and late burns.
- `.tmp/overhaul/probes/design-final-fleet.mjs`: ships 2–5, ghost-thrust drift, and the belt crossing.
- `.tmp/overhaul/probes/design-final-kestrel.mjs`: the debris dodge.

All numbers are starting values. They live in `src/data/tuning.ts` and `src/data/ships.ts` from the first package on.

---

## 1. Title, logline, premise

**Title:** ARRIVAL PROTOCOL // SOULCACHE

**Logline:** You are UNIT-047, a caretaker AI beamed onto colony ships in their last minutes before arrival. On the amber screen you turn a red crash line into a green orbit. On the blue screen you find out that the 2,400 "sleeping" colonists are files in the same memory you live in, and that something which used to be a caretaker like you is eating them.

### Premise

The Exodus Fleet sends colony ships in **waves** along the same 581-light-year route. Nobody on board is awake. When a ship reaches its world, **ARRIVAL CONTROL** beams a caretaker AI aboard to bring it in. You are UNIT-047, wave 1. You arrive damaged by the transmission, minutes before something goes wrong.

Your job has two halves:

1. **Fly the ship (AMBER, "SHIP").** Make the predicted path green, which means getting the whole loop inside the fat SAFE ORBIT ring. The ring is also **PRINTER RANGE**: the bio-printers on the surface can only receive a colonist while the ship is inside it.
2. **Keep the colonists intact (BLUE, "MIND").** Every colonist file that arrives intact is printed into a body on the surface. Damaged files wake with gaps in their memory. Lost files do not wake at all.

**ARRIVAL CONTROL** is the only authority voice in the game. It is automated, cheerful and bureaucratic, and every line ends with ":)". Example: "Hello, Unit 47! ARES-VII is about to hit a planet. :)". It is the comic relief and slightly sinister. It issues your tool **licences**, never sends quite enough repair charge, and wants the thing in the memory deleted.

### The reveals: two in-run, plus one meta

1. **Minute 1: the people are files.**
   - The briefing says "2,400 colonists in cryo-stasis".
   - Scanning the STASIS file reports `STASIS: 0 pods detected.`, then `The colonists aren't in pods. They're in here. (RACKS B–C)`.
   - Two sealed grey racks crack into 12 soul clusters. Each cluster is 200 people with a family name and a beating heartbeat line.
   - The footer flips from `2,400 SOULS IN STASIS` to `2,400 SOULS IN MEMORY`.
   - The detail panel selects C12 · OKAFOR: `Okafor, Ada (11): wants to name the first tree.`
   - The clue was always there: scanning Life Support says `Idle. 0 breathing occupants.`

   On run 1 this step is mandatory before SKIP works. If a kid never does it, the reveal still happens, either when HOLLOW breaches C12 or when printing starts (§6.7).

2. **Ships 1–2: the thing eating them is a caretaker.**
   - When ship 1's capture burn closes the loop, a locked segment labelled `???` starts eating C12 · OKAFOR, Ada's cluster.
   - After the fight, pink letters type themselves into the blue terminal: `> ...047?`.
   - On ship 2 it speaks: `> hello 047. they sent me with 36 blocks of charge too.`, then `> i was 046. they sent me first.` The label `???` flips to `UNIT-046`.
   - ARRIVAL CONTROL: `UNIT-046 was decommissioned. Please ignore it. :)`
   - This is **HOLLOW**: the caretaker of the previous wave. It arrived with too little repair charge, its core was dying, and it found that soul files are made of the same stuff it is. It is starving, not evil.

3. **Meta: the ghost.** A local archive counts runs. On run 2 you are UNIT-048, wave 2, and HOLLOW is your previous unit. What it says depends on how your last run ended (§4.5):
   - after you were overwritten: `> hi 048. it's 047. 046 ate me. now i'm hungry too.`
   - after a PURGE win: `> hi 048. it's 047. we brought them home. they sent me out again.`

   Every unit that ARRIVAL CONTROL "reassigns" with too little charge becomes the next wave's HOLLOW. The villain is the system.

**Finale (ship 5, LAST LIGHT).** HOLLOW fights with your own verbs. Its commands appear in your terminal 3 seconds early: `> rm repair.bak ... 3`. At ORBIT LOCK its root unlocks, and a 12-second DELETE duel follows. ARRIVAL CONTROL says "Please delete UNIT-046. :)". You choose:

- **PURGE:** "LAST LIGHT · the fleet is home." Then: "Thank you, Unit 47. Please stand by for reassignment. :)"
- **MERGE:** costs 20 repair charge. The clusters HOLLOW ate on this ship come back as "woke, missing memories". "we arrive together." Then: "Unit 47 is non-compliant. :)". The next run starts with +1 Core thread and a faint permanent shimmer.

**Tone guardrails (PG).**
- Use "did not wake", "woke, missing memories" and "pods offline". No bodies, no gore.
- HOLLOW is pitiable and eerie, never horror. ARRIVAL CONTROL keeps the tone light.
- There is always a hopeful ending path.

---

## 2. Design pillars

1. **Make the line green.** The physical goal fits in one sentence a 12-year-old gets in five seconds. Every burn changes the colour right away: red is a crash, dashed is a flyby or an off-ring loop, green is inside the ring. A one-line objective always says the right next step, and it is recomputed from the actual path every tick, so it never goes stale after a mistake.
2. **The people are in the same memory as you.** Every block of damage in the blue layer has a family name. The stakes are counted, named and heard: heartbeats, `+200 WOKE`, and the WAKE REPORT credits.
3. **Hack OR burn.** The two layers compete for the same scarce things: Core threads (which share the reactor with the engine), repair charge, and your attention.
   - You can only burn while looking at the ship.
   - HOLLOW eats twice as fast while the engine fires.
   - Whatever is still dirty when the burn starts becomes your problem mid-burn.
4. **Every capability is a file.** What you see in memory is literally what you can do in flight:
   - If the Autopilot file is hurt, the preset buttons die.
   - If Engine I/O is hurt, the engine sputters.
   - A tool exists only while its file exists, and licences arrive as files.

   Every loss has a visible cause the player can find, click, and explain afterwards.
5. **Short, loud, fair.**
   - Ships take 3–6 minutes and a run takes 22–32 minutes.
   - Something happens at least every 20 seconds.
   - Soft fails replace reloads.
   - Everything is synthesized.
   - Every rule is simple enough to say out loud.
   - Randomness is seeded and dt-scaled.
   - Countdowns never jump.

---

## 3. The two layers

### 3.1 PHYSICAL: the ship (amber, "SHIP")

What the player does:

- **Reads the NAV PLOT,** the hero window in the centre. The predicted path is coloured by outcome:
  - **RED:** the path ends on the surface at `✕ IMPACT 02:43`.
  - **DASHED BRIGHT with a `FLYBY` tag:** an open flyby ("you'll miss and fly away"), or the arcs of a closed loop that lie outside the ring. Amber is the colour of the whole UI, so it cannot also mean "flyby".
  - **GREEN:** the arcs of a closed loop that lie inside the fat SAFE ORBIT ring.
  - **Markers:** `▼ LOWEST POINT` and `▲ HIGHEST POINT`, each with a countdown and an altitude.
    - On a crash path, a ghost `▼ LOWEST: UNDERGROUND` sits inside the planet, so the kid can watch it rise out as they burn.
    - The ▼ marker turns green whenever the lowest point is inside the ring.
    - A `START BURN` tick on the path marks where to start braking.
- **Points the ship with presets:** W = PRO, S = RETRO, A = IN, D = OUT. Each has a one-line tooltip, for example "OUT pushes your path away from the planet".
  - Presets are select-only: pressing the active one does nothing.
  - While the ship turns, the burn button reads `ALIGNING…` and gives no thrust.
  - IN and OUT use the velocity frame (KSP-style radial), so the line really bends (§6.2).
  - Manual rotation (Q/E) and the POWER slider live behind a MANUAL fold. MANUAL is also the fallback when the Autopilot file is damaged.
- **Holds SPACE (or the big BURN button) to burn.** Releasing stops the burn. Leaving amber releases a player burn.
- **Watches FUEL,** a bar in percent with:
  - a NEEDED tick: what the next burn will cost;
  - a ★ notch at 20%;
  - a hatched THRUST LIMIT overlay while thinking steals reactor power.
- **Reads hazard zones drawn on the plot.** Each label says what the zone will do to memory and when:
  - a debris cloud on ship 3: `DEBRIS · HITS RACK C · 01:10`;
  - a radiation belt on ship 5: `BELT · 0:36 INSIDE · ≈5 HITS ON RACKS A–B`.
- **Locks the orbit.** When the whole loop is green and no thrust has been delivered for 3 seconds, the game shows `HOLD STEADY 3… 2… 1…` and then **ORBIT LOCKED**.
  - If perfection is out of reach, ACCEPT ORBIT prints at reduced printer range. It is offered only when fuel can't fix the orbit or after 15 s idle, and it needs a second click.
- **Beams out of a doomed ship** with BEAM OUT, a soft fail.

### 3.2 CYBER: the mind (blue, "MIND")

What the player does:

- **Reads the memory strip.** It has 384 blocks in 6 **RACKS** (A–F) of 64 blocks each, and on desktop each rack is one row:

  | Rack | Contents |
  |---|---|
  | A | Ship files |
  | B–C | The SOUL ARCHIVE |
  | D | Open space; ship 5 also has souls here |
  | E | Your AI files |
  | F | Your filesystem tools and REPAIR CHARGE (the old Quantum Redundancy) |

- **Uses tools that are files.** A tool's chip exists only while a live copy of its file does. ARRIVAL CONTROL licenses new tools as the run goes on, and each licence arrives as a file:

  | Tool | Licensed |
  |---|---|
  | SCAN | At start |
  | REPAIR | First time you jack in, ship 1 |
  | MOVE | Ship 2 |
  | DELETE | Ship 3 |
  | COPY and SWAP | Ship 4 |

- **Spends scarce resources:**
  - Core threads: 2. Each running op holds one, and each busy thread takes 25% of thrust.
  - REPAIR CHARGE: the single repair currency, measured in blocks.
- **Fights HOLLOW** with one rule a kid can repeat: **"It eats the file next to it. An eaten file turns into HOLLOW too. 4 free blocks stop it."**
  - REPAIR heals your files and souls. The green heal pushes HOLLOW's red bite back inside the same segment, which is the tug-of-war. **If you start a repair before the file hits zero and you have the charge, you win.**
  - Ship files can't be healed. SWAP them to a backup, or DELETE them before they turn. A deleted file becomes a gap.
  - MOVE carries souls behind a gap.
  - DELETE removes HOLLOW seeds or cuts a gap.
- **Watches printing** once the orbit is locked. Clusters print one by one, and you can push one to the front (PRINT NEXT) or speed it up when nothing is infected (PRINT FAST).

**Visibility rules.**
- Your AI files, all soul clusters and all infection are always visible.
- Ship-file integrity stays hidden until scanned, which keeps Fran's "subtle, discovered damage" rule. An infected unscanned ship file shows a fixed-width hatch that reveals nothing.

**Time in blue: OVERCLOCK.** While the world runs at TACTICAL pace (a crash course, a burn coming up, a hazard), jacking in slows the ship to ¼ speed and your ops run at full speed. During a quiet CRUISE the world keeps cruising in blue, so hacking a coast never stretches it. A mini-HUD keeps the countdown, a mini plot, the line state and FUEL in view.

### 3.3 Coupling rules

These are the only couplings. Each is drawn and heard, and each is introduced on a specific ship.

| # | Direction | Cause | Effect | How the player sees and hears it | From ship |
|---|---|---|---|---|---|
| C1 | cyber → physical | **Engine I/O** (AI file, repairable) | Power cap and sputter by band: ok → 100% clean; degraded → 75% with ±15% jitter; failing → 40% with ±35% jitter; dead, offline or missing → `ENGINE NOT RESPONDING` | The rumble sputters and drops out, ▼ creeps instead of swings, and the ENGINE I/O pip flashes. SPACE on a dead engine gives a dry cough | 1 (scripted ENGINE I/O FAULT) |
| C2 | cyber → physical | **Thrust Ctrl** (ship file; SWAP only) | Ghost thrust: the engine fires by itself along the heading. Failing → 15% for 1 s about every 25 tactical s. Dead → 25% about every 12 s, and 30% of bursts stick until SPACE is pressed. Missing → `NO THRUST CONTROLLER`, engine dead | Rumble with the throttle at 0, ▼ drifts, `UNCOMMANDED THRUST` (klaxon on the first one only) | 4 |
| C3 | cyber → physical | **Instrument files:** Autopilot, Sensor Interp, Nav Plotter, Telemetry | Autopilot failing/dead/missing → presets die, Q/E only. Sensor Interp degraded → `≈` labels and a fuzz band of ±(100−I)×15 km; failing/dead → the path is a grey uncertain band (no colours, no altitudes, `PATH UNCERTAIN`, repainted every 3 tactical s). Nav Plotter dead/missing → `NO SIGNAL`. Telemetry below 60 → digits garble (▓) in Telemetry and on the plot readouts | Buttons visibly die, the plot greys and stutters, digits garble. Window title pips name the backing file, and clicking a pip jumps to it | 1 (mild ≈), 3 (PATH UNCERTAIN) |
| C4 | both ways | **Reactor** (ship file) **× busy threads** | reactorCap = bandCap × (1 − 0.25 × threadsBusy). bandCap: ok 1.0, degraded 0.85, failing 0.6, dead/missing 0.3 (`REACTOR BACKUP CELLS`). Two busy threads cap thrust at 50% | The REACTOR row in the Engine window (THINK vs BURN cells), the hatched THRUST LIMIT on FUEL, the footer `THRUST LIMIT 50% · 2 THREADS BUSY`, a thinner rumble | 1 (threads), 5 (the belt hits the Reactor) |
| C5 | cyber → everything | **AI Core** | Drives the glitch overlay (quantized to 5%). Below 50, threads drop to 1. At 0: EMERGENCY TRANSMIT on ships 1–4 (souls on this ship lost, Core reset to 25); OVERWRITTEN on ship 5 (run over). An infected Core is a top alarm | The screen tears, thread dots go out, and the klaxon sounds | 1 (live) |
| C6 | cyber → physical | **AI Comms** | ok/degraded/failing → BEAM OUT and emergency transmit are possible. Dead/missing → a crash ends the run ("YOU STAYED WITH THEM"). Failing/dead garbles ARRIVAL CONTROL's lines | Comms pip; ▓ in CONTROL lines | 2 |
| C7 | cyber → cyber | **Printer Uplink** (ship file) | Print speed × 1.0 / 0.75 / 0.5 by band; dead/missing → `NO PRINTER`, printing halts | `PRINT 3.0 s/cluster` readout, bell cadence | 1 (visible), 5 (the belt hits rack A) |
| P1 | physical → cyber | **Engine firing** | HOLLOW drains ×2 while thrust is delivered (player, AUTOBURN or ghost) | A pink `MIND` flash on the mode toggle mid-burn; the chew gets louder | 1 |
| P2 | physical → cyber | **Orbit fit = PRINTER RANGE** | Printer range = the time-weighted fraction of the orbit inside the ring. Print interval = base ÷ max(range, 0.5). Below 50% range, each cluster may wake with gaps, with chance (0.5 − range) × 2. Below 10%: STRANDED | `PRINTER RANGE 62% · PRINT 4.8 s/cluster`, the bell cadence | 1 |
| P3 | physical → cyber | **Hazard zones hit racks** | Debris contact: every damageable segment with blocks in the named rack loses 25 × (its blocks in that rack ÷ its size). Belt: −8 to a random damageable segment in racks A–B, about once per 200 game-s inside, including during printing if the orbit clips it | The label names the rack and the countdown. On impact: thud, shake, a red flash on the rack row. Inside the belt: Geiger clicks | 3 (debris), 5 (belt) |
| P4 | physical → cyber | **Crashes and transmissions** | BEAM OUT adds +2 transit hits. Emergency transmit adds +3 hits and Core −25 | The BEAM OUT bar races the IMPACT countdown; the old ship's telemetry cuts to black | 1 (crash), 2 (BEAM OUT) |

### 3.4 The two clocks

The two clocks are not a coupling the player has to learn, but they make the tension work.

- The **world** (orbit, fuel, hazards, ghost thrust) runs on game time, which the director paces (§6.1).
- The **mind** (ops, HOLLOW, printing, the lock hold, story timers) runs on **AI time**: wall-clock seconds while unpaused and in an active phase.

Consequences:
- Warp and SKIP never make a repair cheaper or HOLLOW faster.
- OVERCLOCK slows only the world, and only at TACTICAL pace.
- Pause freezes both. It is look-only: you can inspect, but you can't burn, pick up tools or SKIP.

### 3.5 Glossary: the words a kid sees

`script.ts` is checked against this list.

| Word on screen | Meaning | Never say |
|---|---|---|
| SHIP / MIND | The amber and blue screens | "tools mode", "memory mode" |
| LOWEST POINT ▼ / HIGHEST POINT ▲ | Periapsis and apoapsis. Always shown as **altitudes** in km | "periapsis" outside small print; radii |
| SAFE ORBIT ring / PRINTER RANGE | The target band; % = time inside it | "uplink", "band" |
| FLYBY / CAPTURED / ORBIT LOCKED | Open path / loop closed / locked | "inserted" |
| FUEL | Δv budget in % | "BURN LEFT", "Δv" |
| REPAIR CHARGE | The redundancy currency, in blocks | "redundancy", "RDN" (small print only) |
| THREADS | Core concurrency | "cores" |
| RACK | One row of 64 blocks | |
| BLOCK | The memory unit | "block" for souls |
| CLUSTER | 200 people, 8 blocks (`OKAFOR · C12 · 200 souls`) | "OKAFOR BLOCK" |
| WALL / GAP | ≥4 free blocks next to HOLLOW / fewer than 4 | "moat" |
| LICENCE | A tool file issued by ARRIVAL CONTROL | |
| ARRIVAL CONTROL | The only authority | "Fleet Office" |

Stamps are terse system capitals without "!": `CLEAR OF THE PLANET`, `CAPTURED`, `ORBIT LOCKED`, `HIT · RACK C`, `BLOCKED`, `EMERGENCY TRANSMIT`. ARRIVAL CONTROL carries the cheer.

---

## 4. The run

### 4.1 Structure and length

A run is **5 ships**. Ship 1 takes about 3 minutes and the later ships about 4–6 minutes each, so a first run takes **22–32 minutes**. Per ship:

1. **BOOT (≈5–8 s, blue).** The strip assembles from the ship's layout, transit damage flashes in, and star credit is applied.
2. **FLIGHT.** A correction, then the coast (the hacking phase), then the capture burn (the flying phase), then ORBIT LOCK.
3. **PRINTING (≈30–50 s, or ≈8–12 s with PRINT FAST).** The climax: HOLLOW is desperate while its food leaves.
4. **WAKE REPORT (≈15 s, skippable).**
5. **TRANSMIT.** One decision: pick 1 of 3 cards. Optionally leave a backup behind to carry more charge.

### 4.2 Ships and escalation

Each ship adds **one new physical rule and one new cyber rule**, plus at most one story beat. Notes on the table:
- Radii are measured from the planet centre. The planet is R 3,390 km, atmosphere 3,790, μ 43,000 km³/s² on every ship.
- Nominal engine acceleration is 5 m/s².
- "Tac" is tactical warp, the game-seconds per real second at TACTICAL pace.
- Coast times are real seconds at CRUISE without SKIP.

| # | Ship → world | Souls (clusters) | Approach | Ring | Δv budget (need) | Warp tac / cruise | New physical | New cyber | HOLLOW (AI s) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **ARES-VII** → Kepler-186f | 2,400 (12) | r0 12,000; rp0 3,000 (**impact**, IMPACT 02:43); v∞ 1.0; coast ≈58 s | 5,000–9,000 | 2.8 (1.81) | ×20 / ×60 | Hold to burn; OUT, then RETRO; make it green | SCAN, REPAIR, the soul reveal, the first tug-of-war | No spread. Scripted bite on C12 when the loop closes; drain 2/s, ×2 while firing |
| 2 | **HALCYON** → Tessaly | 2,000 (10) | r0 30,000; rp0 14,000 (**flyby, too wide**); v∞ 1.2; coast ≈166 s | 5,000–7,500 | 2.4 (1.73) | ×25 / ×80 | Steer IN | MOVE and the 4-block WALL rule; HOLLOW names itself | Wakes at boot+30; spreads every 25 s; drain 3.5; ×1.5 while printing |
| 3 | **KESTREL** → Brine | 2,400 (12) | r0 25,000; rp0 9,000 (too wide); v∞ 1.4; **debris** r 900 km on the inbound path at r 14,000 (entry ≈225 tac s), hits **rack C** (rack B or C on run 2+); arrives with Sensor Interp at 45% (**PATH UNCERTAIN**); coast ≈124 s | 5,000–7,000 | 2.1 (1.56 early, 1.67 late) | ×25 / ×80 | The debris cloud names a rack. Correct early and you also dodge it; correct late and rack C takes the hit | DELETE and seeds. AUTOBURN.skl arrives, trained from your first 2 captures | Spreads every 20 s; drain 4; a 2-block seed every 50 s lands inside your WALLS |
| 4 | **VESPER** → Cinder | 2,400 (12) | r0 25,000; rp0 5,600 (already in the ring); v∞ 1.6; Thrust Ctrl arrives at 31%; coast ≈114 s | 5,000–7,000 | 1.8 (1.32 plus drift fixes) | ×30 / ×80 | The engine fires by itself (ghost thrust); fix it with SWAP to Thrust.alt | COPY your Repair, because seeds hunt your tools. THE DEAL | Spreads every 16 s; drain 4; seeds every 40 s near your tools; THE DEAL once |
| 5 | **LAST LIGHT** (flagship) → New Haven | 3,200 (16) | r0 18,000; rp0 3,200 (**impact**, IMPACT 03:04); v∞ 1.5; **radiation belt** 9,000–12,000 hits racks A–B, entry ≈77 tac s; coast ≈97 s | 5,000–7,000 | 2.5 (1.76) | ×30 / ×60 | The belt (move souls out of rack B before crossing) | HOLLOW uses your verbs (MV, RM). Root duel at ORBIT LOCK, then PURGE or MERGE | Spreads every 12 s; drain 5; seeds every 35 s in walls; one verb every 12 s |

**Total souls: 12,400.** The finale is 26% of the run, so the earlier ships matter.

#### Rack layouts

Rack A is the same on every ship. Racks B–D use a layout string per ship: `C` is an 8-block soul cluster, `R` is the 8-block HOLLOW root (`R16` is 16 blocks), and `_n` is n free blocks. Clusters are numbered in address order.

- **Rack A (all ships):**

  | File | Blocks | Role and effect |
  |---|---|---|
  | Life Support | 8 | `life`; no flight effect. Scan clue: "0 breathing occupants" |
  | Reactor | 6 | `reactor`; C4 |
  | Thrust Ctrl | 8 | `thrust-ctrl`; C2 |
  | Thrust.alt | 8 | Backup |
  | Stasis | 4 | `stasis`; the reveal pointer |
  | Printer Uplink | 6 | `printer`; C7 |
  | Cargo Ctrl | 6 | `cargo`; **no flight effect**, a deletable spacer |
  | free | 18 | |

  Ship Comms and Navigation are removed: they had no function and confused AI Comms with Nav Plotter.

- **Racks B–D per ship:**

  | Ship | Rack B | Rack C | Rack D | Root neighbours |
  |---|---|---|---|---|
  | 1 ARES-VII | `C C C C C C _16` | `C C C C C C R _8` | `_64` | Root directly after C12 (OKAFOR) |
  | 2 HALCYON | `C C C C C C _16` | `C C _2 R _1 C C _21` | `_64` | C08 with a gap of 2, C09 with a gap of 1 |
  | 3 KESTREL | `C C C C C C _16` | `C C C _1 R _2 C C C _5` | `_64` | C09 (gap 1), C10 (gap 2) |
  | 4 VESPER | `C C C C C C _16` | `C C _1 R _3 C C C C _4` | `_64` | C08 (gap 1), C09 (gap 3) |
  | 5 LAST LIGHT | `C C C C C C _16` | `C C C C C C _16` | `C _2 R16 _2 C C C _12` | C13 (gap 2), C14 (gap 2) |

- **Racks E and F, ship 1:**
  - **Rack E:** Core 16, Engine I/O 8, Autopilot 4, Sensor Interp 8, Nav Plotter 6, Telemetry 6, AI Comms 4, free 12.
  - **Rack F:** Scan 3, REPAIR CHARGE 36, free 25. Licensed tools install here.
  - **Later ships:** racks E–F hold whatever you carried, packed in order (§6.9).

### 4.3 Win, lose and soft fails

| Outcome | Condition | Consequence |
|---|---|---|
| **LOCKED** | ORBIT LOCK | Printing at the orbit's printer range (100% when locked) |
| **PARTIAL** | ACCEPT ORBIT, or fuel-out on a closed orbit with range ≥ 10% | Printing at range %; may wake with gaps |
| **STRANDED** | Fuel-out or accept with range < 10% | The printer can't reach. This ship's souls are lost. Normal transmit |
| **ESCAPED** | Open path, receding, r > 1.5 × r0 | This ship's souls are lost. Normal transmit |
| **CRASHED** | Impact with AI Comms usable | Souls lost. EMERGENCY TRANSMIT: Core −25, +3 transit hits |
| **ABANDONED** | BEAM OUT completes before impact | Unprinted souls lost, +2 transit hits |
| **EMERGENCY** | The Core reaches 0 on ships 1–4 | Unprinted souls lost, Core reset to 25, +3 hits, next ship |
| **Run 1 safety net** | The first crash on run 1, ship 1 | "That was a simulation. :) Again." Ship 1 restarts once |
| **Run lost: OVERWRITTEN** | The Core reaches 0 on ship 5 | Run ends ("UNIT-047 OVERWRITTEN") |
| **Run lost: STAYED** | Crash while AI Comms is dead or missing | Run ends quietly ("YOU STAYED WITH THEM") |
| **Run ends: FLAGSHIP LOST** | LAST LIGHT crashed, escaped, stranded or abandoned | Run ends; no ending is unlocked |
| **Run ends: UNRESOLVED** | Ship 5 printing finishes and no live Rm copy exists to delete the root | Run ends; HOLLOW "followed me" |
| **Run won** | Ship 5's root deleted, then PURGE or MERGE | Victory run end |

There is no page reload anywhere. Retrying is an in-app NEW RUN.

### 4.4 Score

- **SOULS WOKE** is the headline. A soul that woke intact counts 1. A soul that woke with missing memories counts 0.5. A soul that did not wake counts 0.
- **Cluster outcome at print time:**

  | Integrity at print | Outcome |
  |---|---|
  | ≥ 95 | WOKE (counts 1) |
  | 1–94 | WOKE, MISSING MEMORIES (counts 0.5) |
  | consumed | DID NOT WAKE |

  The low-range roll can also turn a print into missing memories (§6.7).
- **Stars per ship (max ★★★):**
  - ★ ORBIT LOCKED;
  - ★ at least 95% of the ship's souls woke intact;
  - ★ FUEL at least 20% at the lock.

  **Each star gives +6 REPAIR CHARGE on arrival at the next ship.** Good flying funds the next fight. The MiniHud shows `★ INTACT 11/12` during printing. FUEL has a ★ notch. The WAKE REPORT names every missed star and why, for example `C09 REYES printed at 71% — repair before printing`.
- **Rank** (out of 12,400): DRIFTER under 3,000; SHEPHERD 3,000+; CARETAKER 6,800+; ARK ANGEL 10,700+.
- **Near-miss lines on the run end,** for example `▼ was 140 km from a perfect lock` and `41 souls short of CARETAKER`.

### 4.5 Meta-progression (deliberately small)

Stored in `localStorage` under `arrival-protocol/meta/v1`:

```
{ version: 1, runs, bestScore, endingsSeen: ('purge'|'merge')[], mergeBonus: boolean,
  activeRun: { unit, startedAt } | null,
  lastUnit: { number, woke, shipName, cause, stats: { moves, deletes } } | null }
cause: 'won-purge' | 'won-merge' | 'unresolved' | 'flagship-lost' | 'overwritten' | 'stayed' | 'abandoned'
```

- **Run accounting.** `runs` increments and `activeRun` is set at RUN START. If a page loads and finds a leftover `activeRun`, that unit is recorded as `lastUnit` with cause `abandoned`.
- **Unit and wave.** Unit number = 47 + runs; wave = runs + 1. Both appear on the title card and in the header crumb (`UNIT-048 · WAVE 2`). The title shows lineage, for example `last: UNIT-047 · 6,200 woke · overwritten at VESPER`.
- **The ghost.** HOLLOW's name and its ship-1 boot line come from `lastUnit` (built by the `unitName()` / `hollowName()` helpers). All lines are ≤ 70 characters:

  | Last cause | HOLLOW is | Ghost line on ship 1 boot |
  |---|---|---|
  | none (run 1) | UNIT-046 | (none; `> ...047?` after the C12 fight) |
  | overwritten | UNIT-047 | `> hi 048. it's 047. 046 ate me. now i'm hungry too.` |
  | won-purge | UNIT-047 | `> hi 048. it's 047. we brought them home. they sent me out again.` |
  | won-merge | UNIT-046·047 | `> hi 048. it's us. 046 and 047. we saved you a seat.` |
  | unresolved | UNIT-047 | `> hi 048. it's 047. i couldn't delete it. so it became me.` |
  | flagship-lost | UNIT-047 | `> hi 048. it's 047. i lost the flagship. then i got hungry.` |
  | abandoned | UNIT-047 | `> hi 048. it's 047. i blinked and the run was gone.` |
  | stayed | (the previous HOLLOW) | none. The title reads `UNIT-047 stayed with them.` |

- **HOLLOW verbs** on ship 5 are weighted by `lastUnit.stats`: "it fights like you did".
- **MERGE bonus:** the next run starts with Core capacity 3 and a corruption floor of 0.05 (a faint permanent shimmer).
- **Endings seen:** `ENDINGS 0/2` on the title card.
- **Storage failure is loud** (Fran's no-silent-fallback rule):
  - A read or write that throws shows `ARCHIVE OFFLINE — this unit's memory will not be kept`.
  - Corrupt JSON shows `ARCHIVE CORRUPT` with [WIPE ARCHIVE] and [PLAY WITHOUT ARCHIVE].
  - The archive never resets quietly.
- **Not saved:** the run itself is not saved mid-ship, and the title card says so.

---

## 5. Minute by minute

### 5.1 The first 10 minutes (run 1)

The rules for every line on screen:
- There are no walls of text.
- Every line is ≤ 70 characters and click-to-complete.
- Every critical fact is also a colour, a countdown, a marker or a sound.
- The objective strip always shows the single right next step. It is recomputed from the real path every tick (§6.3).
- Story lines queue while the engine fires.

The numbers below come from the probes and the formulas in §6. `script.ts` generates the boot line and every echo from live data, so these numbers are illustrations, not hard-coded text.

**Ship 1: ARES-VII (2,400 souls)**

- **0:00 Title card.** A black screen with `ARRIVAL PROTOCOL` in VT323, then `UNIT-047 · EXODUS FLEET · WAVE 1 · 581 LY` and one button, `[ RECEIVE TRANSMISSION ]`. The click unlocks audio, and modem chirps play.
- **0:02 Boot (blue).**
  - The memory strip assembles rack by rack over 1.5 s, one soft tick per row.
  - Racks B–C are two sealed grey slabs.
  - The blue TERMINAL types `> UNPACKING UNIT-047 ... 100%`, `> HOST: ARES-VII · 2,400 COLONISTS`, `> ECC: ENGINE I/O 85% · SENSOR INTERP 78%`.
- **0:07 Klaxon, cut to amber** with a scanline wipe and a "kzzzt":
  - The header shows a red pulsing `IMPACT 02:43`, at TACTICAL ×20. Crash courses always run in real time.
  - The NAV PLOT shows the planet, the fat green SAFE ORBIT ring, and a **red line ending in `✕ IMPACT`**, with a ghost `▼ LOWEST: UNDERGROUND` inside the planet.
  - The OUT preset is engaged, so the ship triangle already points the right way.
  - The objective strip: `◆ DON'T HIT THE PLANET — hold [SPACE]`.
  - COMMS (amber, radio): ARRIVAL CONTROL, "Hello, Unit 47! ARES-VII is about to hit a planet. :)"
- **0:10 First input.** The kid holds SPACE. Full rumble, 2 px shake.
  - **After 1.1 s** the line peels off the planet with a whoomp and turns dashed `FLYBY`. Stamp: `CLEAR OF THE PLANET`. CONTROL: "Nice! Now please orbit it. :)"
  - The objective becomes `KEEP HOLDING — push ▼ up into the ring`, and ▼ climbs out of the planet.
- **0:12 ENGINE I/O FAULT** (scripted, ship 1, after 2.0 s of delivered thrust).
  - A crunch and a cough, a 4 px shake, and the `ENGINE I/O` pip flashes red: 85% drops to 38%.
  - The rumble sputters (40% cap, ±35% jitter) and ▼ creeps.
  - ▼ is 160 tactical s away, so the tutorial preempts: `ENGINE WEAK — press [TAB] to look inside`.
  - The mode toggle flashes `MIND ▸ ENGINE I/O 38%`.
- **0:15 Jack in.** TAB plays a "kzzzt" and the screen turns blue.
  - ARRIVAL CONTROL licenses REPAIR: two files transmit into rack F with a chirp, and the chip slides in with a chime. The ticker shows `◆ CONTROL: Your REPAIR licence is approved. :)`.
  - The objective reads `◇ PICK UP REPAIR → CLICK ENGINE I/O`, and both pulse.
  - The world is no longer on a crash course and nobody is firing, so the pace is CRUISE and the mini-HUD shows `▼ 02:44 ▸▸`.
- **0:18 First repair.** Engine I/O's integrity climbs visibly from 38 to 100 in 3.4 s, with rising chirps. REPAIR CHARGE drains from 36 to 26. The TERMINAL echoes `> repair engine_io ... OK · −10 CHARGE`, and a ding plays.
- **0:22 TAB back** (`TAB BACK — hold [SPACE]`). Full power: ▼ rises into the ring with a chime and turns green.
  - When ▼ reaches the sweet zone (radius 6,000 km, shown as `LOWEST 2,610 km`): `RELEASE [SPACE]`.
  - Then `TURN AROUND — press [S] (RETRO)`. The ship flips with the button reading `ALIGNING…`.
- **0:30 The coast.**
  - The objective reads `WAIT — brake at ▼ in 02:31 ▸▸`, and `[▸▸ SKIP]` is struck out with `CHECK THE COLONISTS FIRST`.
  - CONTROL: "While you wait, please check on the colonists. :)"
  - The tutorial: `◇ CHECK THE 2,400 — TAB, then SCAN the STASIS file`.
- **0:38 THE REVEAL.**
  - Scanning STASIS takes 1.4 s. The detail panel types `STASIS: 0 pods detected.` … `rescanning…` … `The colonists aren't in pods. They're in here. (RACKS B–C)`.
  - The grey slabs crack into 12 heartbeat chips (60 ms per chip) under a choir chord.
  - The footer flips to `2,400 SOULS IN MEMORY`.
  - The detail panel selects **C12 · OKAFOR · 200 souls: `Okafor, Ada (11): wants to name the first tree.`**
  - C09 · REYES shows 71% with an irregular heartbeat.
- **0:45 First triage.** `◇ C09 IS HURT — REPAIR it before it prints`. The repair takes 1.6 s, and charge goes from 26 to 21.
- **0:50 Mind clear.** In blue, with nothing to do for 5 s: `MIND CLEAR — press [F] to SKIP to ▼`. SKIP ramps the warp. It ends 15 tactical s before the burn point, then CRUISE glides down.
- **1:05 Get ready.** At 8 tactical s before the `START BURN` tick, the pace snaps to TACTICAL with a falling chime. The objective counts `GET READY — BRAKE IN 0:05… 4… 3…` with a beep per second, the last one an octave up.
- **1:10 `HOLD [SPACE] NOW`.** The capture burn takes about 10 s.
  - **At 1.4 s the loop snaps shut:** `CAPTURED` stamp and a minor-to-major chord. CONTROL: "Captured! Mostly. :)"
  - The arcs inside the ring turn green, and a lock tone rises with the green fraction.
- **1:11 It waits until you brake** (scripted, on the loop closing).
  - The mode toggle flashes pink: `MIND · SOMETHING IS EATING C12`.
  - The amber mini-strip shows red creeping into C12, and a low chew starts.
  - The flight objective stays on top (`KEEP HOLDING — shrink the loop into the ring`): you can't hack while you burn. C12 loses 4% per second (2/s, ×2 while firing).
- **1:20 Lock.** The whole loop is green: `RELEASE [SPACE]!`. The kid releases and sees `HOLD STEADY 3… 2… 1…` (3 real seconds), then the **ORBIT LOCKED** stamp, a full-screen amber flash and an arpeggio.
  - Printing begins: `PRINTER RANGE 100% · PRINTING`.
  - C12 is at 60% and infected, so the printer skips it.
  - The objective reads `◇ SOMETHING IS EATING C12 — REPAIR IT!`
- **1:23 The tug-of-war.**
  - TAB to blue. A black segment `??? · LOCKED`, covered in crawling red static, sits right after C12, with `NEXT BITE —` on it. C12 is 40% red from the right.
  - The kid drops REPAIR on C12. One boundary: green pushes red back at +16.5% per second, while two tones beat faster.
  - Green wins in about 2.4 s: the red shatters into blue sparkles and the static calms. Silence for 1.5 s.
  - Then, in pink with detuned blips, one letter at a time in the TERMINAL: `> ...047?`
  - ARRIVAL CONTROL, shown on the ticker: "Unauthorized process detected. Please ignore it. :)"
- **1:25–1:50 Printing.** A cluster prints every 2.5 s: the chip flashes white, a bell rings, `+200 WOKE` floats up, and the block becomes free space. Nothing is infected now, so `PRINT FAST ▸▸` glows; with it, the rest print in about 6 s.
- **1:55 WAKE REPORT.** A credit scroll (skippable) leads with `OKAFOR, ADA (11): WOKE. First words: "Is it morning?"`. The counter rolls up to `2,400 / 2,400 WOKE`. The stars stamp in, ★★★, then `+18 REPAIR CHARGE ON NEXT SHIP`.
- **2:10 TRANSMIT.**
  - The screen says `PICK ONE TO CARRY` and offers three cards, for example [FIREWALL.sys "HOLLOW can't pass it"] [REPAIR v2 "heals twice as fast"] [+12 REPAIR CHARGE].
  - The packet bar reads `LINK 120 · FILES 63 · CHARGE 14 → FITS`.
  - `[TRANSMIT ▸]` plays an FM sweep and a white-out.

**Ship 2: HALCYON (2,000 souls)**

- **2:20 Boot.** The new layout assembles.
  - 3 seeded transit hits flash red: `> ECC: SENSOR INTERP −22% · REPAIR.BAK −15% · TELEMETRY −30%`.
  - Then `> +18 CHARGE (★★★)`, so charge is 14 + 18 = 32.
- **2:28 New problem.** The line is dashed FLYBY and passes far outside the ring: `▼ 08:52 ▸▸`.
  - The objective: `TOO WIDE — press [A] (IN), hold [SPACE]`.
  - About 5 s of burning pulls ▼ into the ring (chime), then `RELEASE`, then `TURN AROUND — press [S]`.
- **2:45 Licence.** MOVE is licensed at boot+25: "Your MOVE licence is approved. :)"
- **2:50 HOLLOW wakes** at boot+30.
  - The root sits in rack C between C08 (a 2-block gap) and C09 (a 1-block gap). Both are infected at once.
  - The gaps are labelled `GAP 2 · TOO SMALL` and `GAP 1 · TOO SMALL` in red, and the root shows `NEXT BITE 0:25`.
  - The TERMINAL types `> hello 047. they sent me with 36 blocks of charge too.`, then `> i was 046. they sent me first.` `???` flips to `UNIT-046` with a glitch pulse, and the echoes now read `[user: UNIT-046]`.
  - CONTROL: "UNIT-046 was decommissioned. Please ignore it. :)"
  - The objective reads `◇ 4 FREE BLOCKS STOP IT — REPAIR, then MOVE souls behind a gap`.
  - SKIP is struck out: `HOLLOW ACTIVE`.
- **2:55 The fight.** Two threads repair C08 and C09; each tug takes about 3 s. Then MOVE C09 into rack D.
  - The MOVE preview shows the source turning into `WALL 9 ✓` and the destination `WALL ✓`.
  - Then MOVE C08: its old space plus the 2-block gap becomes `WALL 10 ✓`.
  - At the next bite, both sides fizzle against green WALL brackets with a "fzzt" sound.
- **3:15 `MIND CLEAR — press [F] to SKIP`.** SKIP works again.
- **3:30 HACK OR BURN.** The kid kept a move running too long, so the ▼ countdown arrives with a thread busy. The footer shows `THRUST LIMIT 75% · 1 THREAD BUSY`, and the hatched cap sits on FUEL. Cancel the move for full thrust, or burn longer with it running.
- **3:45 Lock, then printing.** HOLLOW is walled off and has nothing to eat: `> i ran out. then i got so hungry.` PRINT FAST works.
- **4:15 Wake report, then transmit.** The draft is now weighted toward what the kid did. Losing a cluster makes FIREWALL likely.

**Ship 3: KESTREL (from about 4:40)**

- **4:40 Boot.**
  - 4 transit hits, plus the scripted arrival damage `> ECC: SENSOR INTERP 45% — PATH UNCERTAIN`.
  - `SKILL TRAINED: AUTOBURN.skl · from 2 demos · ACCURACY 84%`. The Engine window gains `[AUTO · B]`.
- **4:48 Flying blind.** The path is one grey band with no colours and no altitudes, under the chip `PATH UNCERTAIN`.
  - A hatched circle on the plot reads `DEBRIS · RACK C · HIT? · 03:45 ▸▸`.
  - The objective: `PATH UNCERTAIN — TAB, REPAIR SENSOR INTERP`.
  - The repair takes 3 s and 9 charge. The colours snap back with a whoomp: the line is TOO WIDE and hatched red where it crosses the cloud, `DEBRIS · HITS RACK C · 03:30`.
- **5:00 Steer IN early.** The IN correction pulls ▼ into the ring and, because it is early, clears the cloud: the hatching vanishes and the label reads `DEBRIS · CLEAR`. A kid who waits past about 120 tactical s takes the hit: every cluster in rack C −25.
- **5:30 The first seed.**
  - A 2-block outline blinks inside the WALL next to C10 for 2 s, then a seed lands and splits the wall into `GAP 3 · TOO SMALL` on each side.
  - DELETE is licensed with the seed's warning blink, and the TERMINAL types `> sorry. i'm so hungry.`
  - The objective: `◇ RM THE SEED — pick up DELETE, click the seed`. Deleting it restores the wall.
- **7:00 Capture.** The kid presses AUTO with ▼ 40 s out and TABs to fight. AUTOBURN flies the capture with a thread held (`THRUST LIMIT 75%`) until the loop closes, then hands back: `AUTOBURN: LOOP CLOSED — trim it green yourself`.
- **About 8:00** KESTREL's wake report, then the transmit. **About 8:30** VESPER boots: Thrust Ctrl arrives at 31%, and the engine will start firing by itself.

### 5.2 Run 2 and later

- **Title and boot.** The title shows `UNIT-048 · WAVE 2`, the lineage line and `ENDINGS 0/2`. During the ship-1 boot, the ghost line types itself into the TERMINAL before anything else.
- **Shorter tutorial.**
  - The reveal happens during the boot: `SOUL ARCHIVE · 2,400 · you know what they are`. The slabs crack at once, and the STASIS step is gone.
  - REPAIR is licensed at boot.
  - The ENGINE I/O FAULT still happens, but the tutorial rules collapse to one hint (`ENGINE WEAK — REPAIR ENGINE I/O`) with no forced TAB step.
- **Reseeded content.** Ship-1 families are reseeded, and C12 keeps a featured colonist. The hurt cluster is seeded (never C12), and the debris rack is B or C.
- **The C12 fight ends with** `> you remember me. good.` instead of `> ...047?`.

### 5.3 Signature moments across a playthrough

1. **RED TO GREEN.** The ✕ line peels off the planet, ▼ climbs out of the ground into the ring, the loop snaps shut, and it greens through `HOLD STEADY 3-2-1` into ORBIT LOCKED. (Every ship.)
2. **THE STASIS SCAN.** "0 pods detected." The slabs crack into heartbeats, and Ada's line appears. (Ship 1.)
3. **IT WAITS UNTIL YOU BRAKE.** The loop closes and the toggle flashes pink: something is eating Ada's cluster. (Ship 1.)
4. **THE TUG-OF-WAR.** Green REPAIR pushes the red bite back inside OKAFOR · C12, with the beating tones getting faster. (Ship 1 onward.)
5. **`> ...047?`**, then `> i was 046. they sent me first.` (Ships 1–2.)
6. **THE WALL.** The bite fizzles against a green `WALL 9` bracket. (Ship 2 onward.)
7. **HACK OR BURN.** `THRUST LIMIT 75%` as ▼ arrives. (Ship 2 onward.)
8. **FLYING BLIND, DEBRIS AHEAD.** A grey band, a cloud labelled `HIT?`, then the colours snap back. (Ship 3.)
9. **THE SEED IN YOUR WALL.** A blinking outline, a split wall, then RM. (Ship 3.)
10. **YOUR SKILL FLIES WHILE YOU FIGHT.** AUTOBURN closes the loop while you are in blue. (Ship 3 onward.)
11. **THE ENGINE FIRES BY ITSELF.** Rumble with nobody on the throttle; the `?` pip leads to a 31% Thrust Ctrl, and SWAP silences it. (Ship 4.)
12. **THE DEAL.** `> give me C11. then i leave the others alone. for a while.` [ACCEPT] [REFUSE], with a 15-second timer. (Ship 4.)
13. **YOUR OWN VERBS.** `> rm repair.bak ... 3`. You SCAN it in time, and the verb fails: `BLOCKED`. (Ship 5.)
14. **BEAM OUT.** `IMPACT 00:09 — BEAM OUT?` The transmission bar races the countdown, and the old telemetry cuts to black. (Any ship.)
15. **THE WAKE REPORT.** Names and first words scroll like movie credits. (Every ship.)
16. **PURGE / MERGE**, and on the next run `> hi 048. it's 047.`

---

## 6. Systems specs (starting numbers)

Every constant below lives in `src/data/tuning.ts` (global) or `src/data/ships.ts` (per ship), with a WHY comment, from the package that introduces it. Rule code contains no numeric literals.

### 6.1 Time, pace and countdowns

- **Clock (`src/systems/clock.ts`, DOM-free).** `advance(store, dtWall)` is called by the 50 ms interval and directly by headless harnesses.
  - dtWall is clamped to ≤ 0.25 s.
  - Each tick it first evaluates pace (below), then integrates.
  - `onGameTick(dtWorld)` fires with dtWorld = dtWall × speed, only in run phases `flight` and `printing`.
  - `onAiTick(dtAi)` fires with dtAi = dtWall, only while unpaused and in `flight` or `printing`.
  - `document.visibilitychange` → hidden sets `clock.paused = true`.
- **Pace (`src/systems/pace.ts`)** is the sole writer of `clock.speedTarget`, and it runs inside the heartbeat **before** the "speed ≤ 0" early return, so it can always lift a stop.
  - speedTarget = `paused || phase ∉ {flight, printing}` ? 0 : `debugWarp ?? warpFor(pace)`.
  - Pause, visibility, the title card and terminal outcomes only toggle `clock.paused` or the phase.
  - The `?debug` ladder writes `clock.debugWarp`.
  - speedTarget is written with `update` only when its value changes.
- **choosePace → TACTICAL when any of these hold:**
  - thrust is being delivered (player, AUTOBURN or ghost);
  - the true prediction's outcome is `impact`, at any horizon;
  - the next **burn point** (§6.2) is ≤ 8 tactical s away;
  - the loop is in the ring, or the lock hold is running;
  - the phase is `printing`;
  - a zone entry is ≤ 20 tactical s away, or the ship is inside a zone (ship 3+);
  - any alert has severity `alarm`.

  Otherwise SKIP if a skip is active, else CRUISE.
  - Speed **drops snap** instantly (Fran: slowing down must be immediate).
  - Speed-ups use the existing log glide.
  - Resuming from pause snaps to min(target, tacticalWarp), then glides.
- **OVERCLOCK.** While `ui.mode === 'memory'` and the pace is TACTICAL, the world target is `tacticalWarp × 0.25` and the label reads `OVERCLOCK ×¼`. In CRUISE or SKIP, blue runs the world at full speed. Jacking in never cancels SKIP.
- **SKIP.**
  - Inhibitors: thrust delivered; impact predicted; any `alarm`; any alert with `inhibitsSkip` (HOLLOW infections); on run 1, the STASIS reveal not yet done (`CHECK THE COLONISTS FIRST`); the next event < 15 tactical s away.
  - The button shows the reason with a strikethrough.
  - skipWarp = clamp(gameSecToNextEvent / 4, cruiseWarp, 2000). The next event is the burn point or a zone entry.
  - Skip ends 15 tactical s before the next event.
  - SKIP is available from blue.
- **Countdowns are in tactical seconds:** `tac(gameSec) = gameSec / tacticalWarp`.
  - They are monotonic and never jump on a pace change.
  - They tick faster in CRUISE and SKIP (shown with a `▸▸` glyph) and slower under OVERCLOCK (`×¼` badge).
  - They turn red at ≤ 30.
  - Burn-point countdowns beep at 5…1. The IMPACT countdown beeps at ≤ 10.
- **Lock hold:** 3.0 **AI** seconds with the loop in the ring and no thrust delivered. It is a UI ritual, so it runs on wall time; the physical condition is re-checked every tick.
- **Pause** (P or ❚❚) is look-only. A `PAUSED · P to resume` veil shows. SPACE, SKIP and tool pickup are refused with the follower text `PAUSED`.

### 6.2 Flight

- **Integrator:** the existing two-body velocity-Verlet with sub-steps h ≤ 1.5 s.
  - `orbit-sim.ts` exports `accelGravity(pos, mu)` and `integrateStep(pos, vel, h, mu, ax, ay)`, which truth and prediction share.
  - Escape test: e ≥ 1, r > 1.5 · r0, and receding.
- **Engine and fuel.**
  - aNominal = 0.005 km/s². Mass is exact: the hidden mass is removed (§8).
  - Delivered acceleration = `thrustOn × thrustPct/100 × min(engine.powerCap, reactor.reactorCap) × (1 + jitter × noise)`, plus any ghost burst.
    - thrustOn = firing ∧ ¬presetAligning ∧ engine alive.
    - noise is seeded smoothed noise in [−1, 1], re-rolled every 0.3 tactical s and lerped between rolls.
  - **Fuel drains by delivered Δv:** fuel% −= a·h / dvBudget × 100 per sub-step.
    - The sub-step where fuel runs out scales a by its fuelled fraction; after that, a = 0.
    - Ghost bursts burn fuel too.
  - FUEL is shown in %, with a NEEDED tick at neededDv / dvBudget × 100, a ★ notch at 20%, and a hatched THRUST LIMIT overlay of width (1 − cap).
- **Velocity-frame radial.** `radial-out` = normalize(r̂ − (r̂·v̂)v̂) and `radial-in` = its negative.
  - WHY: thrust along r̂ has no torque on an inbound path and barely moves the periapsis.
  - Probe: 0.8 km/s OUT at r 12,000 raises rp by 3,000 km.
  - It is identical to today's behaviour on circular orbits.
- **Presets** are select-only. `presetAligning` = |heading − target| > 10°: no thrust, and the button reads `ALIGNING…`. They need the Autopilot band ok or degraded.
- **The sweet zone** of a ring is [min + 0.25·span, max − 0.25·span]: 6,000–8,000 km on ship 1 and 5,500–6,500 km on ring 5,000–7,000. Corrections aim for it.
- **`ringFit(elements, ring)`** → `{ closed, rp, ra, inRing }`, where inRing = closed ∧ rp ≥ min ∧ ra ≤ max. It is the single definition of "green", used by the sim lock, the predictor, the guidance and ACCEPT.
- **`ringFraction(a, e, ring)`** is the analytic, time-weighted fraction of a closed orbit inside the ring.
  - It uses Kepler's relations, r = a(1 − e cos E) and M = E − e sin E, and the result is the printer range.
  - The numeric path points are used only for drawing.
- **Burn point** (the `START BURN` tick):
  - **Open, non-impact path (capture at ▼):** Δv = v_p(now) − v_p(rp, a_t), where ra_t = max(rp, 0.95·ring.max).
  - **Closed, not in ring (a trim):**
    - If rp is outside the ring: fix rp at ▲. Use PRO if rp is too low, RETRO if it is too high. Target rp_t = the sweet-zone edge.
    - Otherwise fix ra at ▼. Use RETRO if ra is too high (target 0.95·max), PRO if it is too low (target min + 0.25·span).
  - estBurnSec = Δv / aEff, with aEff at the current caps.
  - burnPoint.inSec = eventInSec − 0.5 · estBurnSec.
  - There is no burn point on impact paths or in-ring loops.
- **Prediction (`src/systems/predict.ts`, pure).**
  - Propagates the true state with no thrust and the same gravity. Adaptive step h = clamp(0.01·r/v, 1 s, 60 s).
  - Horizon: until impact; one analytic period for closed orbits (no cap); r > 1.5·r0 outbound for open paths.
  - Returns `{ outcome, points, spans (impact/open/in-ring/out-ring/hazard), impactInSec, periInSec, apoInSec, rp, ra, fit, greenFraction, burnPoint, zoneHits }`.
  - rp on an impact path is the osculating rp (it can be < R), which gives the ghost ▼.
  - It recomputes ≤ 10 Hz, and immediately when firing toggles or the status changes.
  - **Damage never alters the true prediction.** `getSensedPrediction()` (from WP4) is the true prediction frozen at the last sensor refresh, with readouts rounded to ±fuzzKm. Every player-facing number reads the sensed one; the lock, printer range and director read the true one.
- **Terminal checks** (true state):
  - **Crash:** the existing swept test.
  - **Escape:** as above.
  - **Lock:** the lock hold completes → `locked`.
  - **Fuel-out:**
    - in ring → the lock hold continues;
    - impact predicted → run until the crash;
    - closed → `accepted`, or `stranded` if range < 0.1;
    - open → run until escape.
- **ACCEPT ORBIT** is shown only when the loop is closed, not in ring, and either fuel% < needed% or the ship has idled on a closed, not-green loop for ≥ 15 AI-s.
  - Label: `ACCEPT · PRINTER RANGE 34%`.
  - A second click within 3 s confirms.
  - Result → `accepted`.
- **After a lock or accept,** the sim keeps coasting with no player thrust through printing. The plot animates and belt hits still apply.

### 6.3 Guidance: the objective that is never wrong

**Flight guidance is a pure function.** `flightObjective(ctx) → { id, text, keys, urgency: 'now'|'soon'|'wait', showAccept }` lives in `src/systems/guidance.ts` and is evaluated every tick from the (sensed) prediction, the burn state, the capabilities and the phase. Nothing is "advanced", so a mistake simply produces a new, correct instruction. The first matching row wins, and no match throws in dev.

| # | Situation | Text | Urgency |
|---|---|---|---|
| F1 | Plot band failing, dead or missing (WP4) | `PATH UNCERTAIN — TAB, REPAIR SENSOR INTERP` / `NO SIGNAL — TAB, REPAIR NAV PLOTTER` | now |
| F2 | A burn is needed now or soon and the engine is dead or missing (WP4) | `ENGINE NOT RESPONDING — TAB, fix ENGINE I/O` | now |
| F3 | In ring, thrust delivered | `RELEASE [SPACE]!` | now |
| F3b | In ring, no thrust | `HOLD STEADY…` (the overlay shows 3-2-1) | now |
| F4 | Outcome `impact` | `DON'T HIT THE PLANET — press [D] (OUT), hold [SPACE]` (or `… — hold [SPACE]` when OUT is selected; `KEEP HOLDING` while firing OUT) | now |
| F5 | Firing RETRO or PRO with burnPoint.inSec > 3 tactical s | `TOO EARLY — RELEASE [SPACE], brake at ▼ in m:ss` | now |
| F6 | Open path, firing OUT or IN as a correction | Short of the sweet zone: `KEEP HOLDING — push ▼ up into the ring` / `… pull ▼ down into the ring`. In it: `RELEASE [SPACE]`. Past it: `RELEASE — too far` | now |
| F7 | Open path, rp < ring.min, burn point > 15 tactical s away | `▼ TOO LOW — press [D] (OUT), hold [SPACE]` | soon (now if ▼ < 30 tac s) |
| F8 | Open path, rp > ring.max, burn point > 15 tactical s away | `TOO WIDE — press [A] (IN), hold [SPACE]` | soon (now if ▼ < 30 tac s) |
| F9 | Open path, ▼ already passed (outbound) | `MISSED ▼ — press [S] (RETRO), hold [SPACE] NOW` | now |
| F10 | Open path, capture timeline (rp in ring, or late per F7/F8 with `brake anyway — trim it later`) | RETRO not selected → `TURN AROUND — press [S] (RETRO)` (soon). bp > 8 → `WAIT — brake at ▼ in m:ss` (wait). 0 < bp ≤ 8 → `GET READY — BRAKE IN 0:0n` (now, beeps). bp ≤ 0 → `HOLD [SPACE] NOW` (now). Firing → `KEEP HOLDING — close the loop` (now) | as listed |
| F11 | Closed, not in ring | Firing the trim → `KEEP HOLDING — shrink the loop into the ring` (or the matching verb). Otherwise the trim timeline of F10 with the trim's preset and event, e.g. `▼ TOO LOW — at ▲ press [W] (PRO) and burn`, `LOOP TOO BIG — at ▼ press [S] and burn`. With `showAccept`: append ` · or ACCEPT ORBIT` | as listed |

- When presets are unavailable, key hints switch to `turn to RETRO with [Q]/[E]`.
- An objective must persist 0.3 s before it replaces another, unless its urgency is `now`. This hysteresis prevents flicker.

**Director (`src/systems/director.ts`).** The director composes what the objective strip shows. Rules live in `src/data/script.ts` as `GuideRule { id, layer, priority, activeWhen(ctx), text(ctx), keys?, highlight?, once?, doneWhen?(ctx) }`.

1. An active **alarm** rule. Examples: `CORE INFECTED — REPAIR THE CORE`; `C12 WILL BE EATEN IN 0:08`; the first `UNCOMMANDED THRUST`.
2. The flight objective, when its urgency is `now`.
3. An active **mind-urgent** rule. Example: `SOMETHING IS EATING C12 — REPAIR IT!`
4. An active **tutorial** rule. Each one shows once, is marked done by `doneWhen`, and only shows while the flight urgency isn't `now`.
5. The flight objective with urgency `soon` or `wait`.
6. A **hint** rule. Example: `MIND CLEAR — press [F] to SKIP to ▼`, shown in blue after 5 s with no ops, nothing infected and flight urgency `wait`.

There is no step counter. `store.update` happens only when the shown objective's id or text changes.

**Voices (`src/systems/say.ts`).** `say(speaker, text, opts)` routes each line by speaker:
- `control` and `sys` → the **radio**: the amber COMMS window, backed by the AI Comms file. CONTROL lines are garbled (▓) while Comms is failing or dead.
- `hollow`, `cmd` and `mind-sys` → the **mind**: the blue TERMINAL pane.

Rules:
- Text ≤ 70 characters; dev asserts.
- Non-critical lines queue while thrust is delivered. A queued line lives 8 s, and the queue flushes at most 1 line per 3 s.
- `control` quips are suppressed while any mind alert ≥ warn is active.
- `say()` is called only from the director and system ticks, never from store listeners.
- A **ticker** on the right of the objective strip shows the newest unread line of the hidden channel for 6 s (`◆ CONTROL: …` in blue, `◇ HOLLOW: …` in amber). Clicking it switches mode, and the mode toggle flashes while unread lines exist.
- `sayChoice(speaker, text, options, timeoutAiSec)` renders inline buttons in the TERMINAL. It is used by THE DEAL, and the ticker reads `HOLLOW WANTS A DEAL · TAB (0:12)`.

### 6.4 Capabilities (`src/systems/capabilities.ts`, pure)

`deriveCapabilities(state, threadsBusy)` reads files **by role** through `getByRole(state, role)`, which returns the live copy (state ≠ inactive) with the highest integrity, or null.

- **Bands:** ≥80 ok; 50–79 degraded; 25–49 failing; <25 dead.
- **Offline:** states `inactive`, `transferring` and `repairing` count as dead, except the Core, which is never offline.
- **No file with the role:** `missing`, rendered loudly. It is never a default value.

```ts
type Band = 'ok' | 'degraded' | 'failing' | 'dead' | 'missing';
interface Capabilities {
  engine:     { band: Band; powerCap: number; jitter: number };            // Engine I/O
  thrustCtrl: { band: Band; ghost: GhostSpec | null };                       // Thrust Ctrl (ship)
  reactor:    { band: Band; bandCap: number; reactorCap: number };           // Reactor (ship) × threads
  presets:    Band;                                                          // Autopilot
  plot:       { band: Band; mode: 'exact'|'approx'|'uncertain'|'no-signal'; fuzzKm: number; staleTac: number };
  telemetryScramble: number;                                                 // 0..1
  comms:      Band;                                                          // AI Comms
  printer:    { band: Band; speed: number };                                 // Printer Uplink (ship)
  threads:    number;                                                        // Core capacity (1 if Core < 50)
}
interface GhostSpec { meanIntervalTac: number; amp: number; durTac: number; stickChance: number }
```

| Role | ok | degraded | failing | dead | missing |
|---|---|---|---|---|---|
| engine-io | cap 1.0, jitter 0 | 0.75 / 0.15 | 0.40 / 0.35 | 0, `ENGINE NOT RESPONDING` | 0, `NO ENGINE DRIVER` |
| thrust-ctrl | ghost none | none | 25 tac s mean, amp 0.15, dur 1.0, stick 0 | 12 tac s, amp 0.25, dur 1.0, stick 0.3 | engine dead, `NO THRUST CONTROLLER` |
| reactor | bandCap 1.0 | 0.85 | 0.6 | 0.3 | 0.3, `REACTOR BACKUP CELLS` |
| autopilot | presets | presets | Q/E only | Q/E only | Q/E only, `NO AUTOPILOT` |
| sensor | exact | approx (≈, fuzz ±(100−I)×15 km) | uncertain (grey band, stale 3 tac s) | uncertain | uncertain |
| navplot | normal | normal | normal | `NO SIGNAL` | `NO SIGNAL` |
| telemetry | scramble = max(0, (60 − I)/60) | | | | 1.0 |
| comms | BEAM OUT ok | ok | ok, CONTROL garbled | crash = STAYED | crash = STAYED |
| printer | speed 1.0 | 0.75 | 0.5 | 0, `NO PRINTER` | 0, `NO PRINTER` |
| core | threads = capacity (2) | | threads 1 below 50 | | (cannot be missing) |

The derived reactor cap is reactorCap = bandCap × (1 − 0.25 × threadsBusy). threadsBusy counts running ops plus reserved threads (AUTOBURN, SWAP).

**Ghost scheduler** (in orbit-sim; ships it on in WP4, live from ship 4):
- Start probability per tick = 1 − exp(−dtWorld / (meanIntervalTac × tacticalWarp)), with at most one event per tick.
- A burst is `{ remainingGameSec = durTac × tacticalWarp, amp, sticky }`. It is applied only to the sub-steps inside its window, along the heading, and it drains fuel.
- A sticky burst lasts until SPACE is next pressed and released.
- It emits `ghost-start` and `ghost-stop`.
- It is warp-invariant by construction.

### 6.5 Fs-tool ops and licences (AI seconds)

All ops run on the DOM-free ops core (`src/systems/ops-core.ts`). A separate view (`OpBars.ts`) draws the bars.

| Op | Duration / rule | Notes |
|---|---|---|
| Scan | 1.0 + 0.1/blk | Any scannable segment |
| Repair | Heals continuously at **100 / (3.0 + 0.3·size) %/s** (v2: ×2) until 100 | Charges **size × 2 / 100 REPAIR CHARGE per integrity point** healed, so fighting a bite costs more. Accrued charge is deducted in whole points as it accrues, and any fractional remainder is rounded up when the op ends (complete, cancel or abort). If charge runs out, the op ends with `NO CHARGE`. The target is `repairing` (offline) for the duration; the Core stays online. Allowed on AI files, fs-tools, upgrade files and souls (no scan gate for souls). Refused on ship files: `SHIP FILES CAN'T BE HEALED — SWAP OR DELETE IT` |
| Move | 1.5 + 0.2/blk | The source and its clone are `transferring` (offline). Refused on infected files (`STILL INFECTED — REPAIR FIRST`), on REPAIR CHARGE and on hollow. The preview shows the source gap and destination wall state, plus `⚠ BRIDGES HOLLOW TO YOUR CORE` when the placement leaves a chain of gaps < 4 from any hollow to rack E |
| Copy | 2.0 + 0.3/blk | Refused on souls (`Souls can't be copied.`), REPAIR CHARGE and hollow |
| Delete | 1.0; on a hollow block 1.0 + 0.5/blk; the ship-5 root takes 12 s | Refused on souls (`You can't delete people.`) and the Core. Ship files and REPAIR CHARGE need the inline confirm, which states the consequence (`DELETE CARGO CTRL? No flight effect. Leaves a 6-block gap.`) |
| Swap (ship 4+) | 2.0, holds a thread | Click a ship file that has a backup. The primary becomes `inactive` (`.old`) and the backup takes its role |

- **Threads:** 2. THREAD+ or the MERGE bonus makes it 3; a Core below 50 makes it 1.
- **REPAIR CHARGE:**
  - Ship 1 starts with 36.
  - Arrival floor: 12. This is a guarantee, not a fallback.
  - +6 per star; +12 from the card.
- **Licences: install = unlock.** An fs-tool chip exists only while a live copy of that tool's file exists.
  - ARRIVAL CONTROL issues a licence by installing the file(s): first fit from the start of rack F, else rack E, else throw. The install plays transmitIn and a chime, followed by `Your MOVE licence is approved. :)`.
  - Schedule: Scan at start; Repair + Repair.bak on the first entry to blue on ship 1, or the first moment any objective or alert needs REPAIR; Mv at HALCYON boot+25; Rm at KESTREL's first seed; Cp at VESPER boot; Swap at VESPER's first ghost onset.
  - Licences persist for the run (the files carry). On run 2+, Repair is licensed at boot.

### 6.6 HOLLOW (`src/systems/hollow.ts`, pure logic plus a painter)

- **Segments.** Type `hollow` `{ size, root, locked, owner }`. Damageable segments gain `infected?: { side }` and `recoilUntilAi?`.
  - **INFECTABLE:** core, tool, fs-tool, ship, ship-backup, soul, upgrade.
  - **Non-infectable blockers** stop the spread on that side: REPAIR CHARGE (which also can't be moved), FIREWALL, and other hollow.
- **The rule a kid can repeat.** Every `spreadEverySec` (one global timer, shown as `NEXT BITE m:ss` on every hollow segment), each hollow segment looks left and right in address order:
  - It counts free blocks up to the first occupied segment.
  - **A gap of ≥ 4 blocks is a WALL:** blocked (`fzzt`).
  - A non-infectable, already-infected or recoiling neighbour is skipped.
  - Otherwise the neighbour is infected from the facing side.

  Dashed red arrows point at the next targets. Gaps touching hollow are labelled `GAP 2 · TOO SMALL` (red) or `WALL 5` (green bracket).
- **Drain.** An infected segment loses `drainPerSec × dtAi × (thrust delivered ? burnMult : 1) × (printer actively printing ? printMult : 1)` integrity. "Actively printing" means the printer has a printable cluster.
- **Consume** at ≤ 0: the segment converts in place to `hollow` of the same size, and any op on it is aborted.
  - A soul → DID NOT WAKE.
  - A tool → its capability is gone.
  - **The Core never converts.** It emits `core-zero`: EMERGENCY TRANSMIT on ships 1–4, OVERWRITTEN on ship 5.
- **Tug-of-war (literal).** A repair on an infected segment heals while the drain keeps subtracting, so there is one red/green boundary.
  - At 100: cured. Infection cleared, 10 AI-s recoil, sparkles, `clusterSaved`.
  - At 0: consumed. The repair is aborted and the charge already spent is lost.
  - **Design rule, validated in ShipDef:** heal(8 blocks) = 18.5%/s > 1.5 × drainPerSec × max(burnMult, printMult).

    Therefore any repair started before zero wins, if a thread and charge are available. Losses come from reach (noticing too late), threads (too many bites) and charge, never from a started repair being outrun.

    `tugBeat`'s beat frequency follows the boundary speed.
- **Seeds** (ship 3+). Every `seed.everySec`, a 2-block hollow seed is telegraphed by a blinking outline for 2 AI-s, then placed:
  - `walls` (ships 3 and 5): the centre of the largest free gap of ≥ 4 blocks that touches a soul cluster; ties go to the lowest address. If there is none, the centre of the largest free region.
  - `near-tools` (ship 4): the free gap nearest an fs-tool segment; ties go to the larger gap.
  - Op-reserved free segments are never used.
  - Deleting a seed restores the gap.
- **Ship-1 script.** On ship 1's first `loop-closed` event, infect C12.
  - If C12 is still sealed, it is force-unsealed at once (`SEALED BLOCK BREACHED · C12 · OKAFOR`), and the full reveal follows after C12 resolves.
  - After C12 is cured or consumed, the root goes dormant for ship 1. After 1.5 s of silence the TERMINAL types `> ...047?`, then CONTROL says "Unauthorized process detected. Please ignore it. :)".
- **Ship-2+ wake:** at boot + `wake.afterAiSec`.
- **Ship 4, THE DEAL.**
  - Trigger: once, when a hollow front is within 3 free blocks of a soul cluster and ≥ 3 clusters remain unprinted. The named cluster is the one at that front.
  - Line: `sayChoice('hollow', '> give me C11. then i leave the others alone. for a while.', [ACCEPT, REFUSE], 15)`.
  - ACCEPT: the named cluster is consumed, all current infections are cured, and spread pauses for 60 AI-s. CONTROL: "Negotiating with unauthorized processes is not recommended. :)"
  - REFUSE or timeout: `> ok.`, and the spread interval is ×0.8 for 30 AI-s.
  - The offer is invalidated if the named cluster is printed or moved.
- **Ship 5, verbs.** Every 12 AI-s, `chooseVerb(memory, rng, weights)` picks one verb:
  - **MV:** relocate the smallest non-root hollow block into the free region nearest the most soul blocks, placed exactly 4 free blocks from the nearest soul. It respects walls; the threat is that the next seed or your next move breaks one.
  - **RM:** delete one of your files that has another live copy of the same kind (a `.bak` or a copy), else an upgrade file, else a ship backup.
  - **Fairness:** never the last copy of any tool kind, never the Core, a soul, Engine I/O or Nav Plotter.
  - **Weights:** MV = 1 + lastUnit.moves/10 and RM = 1 + lastUnit.deletes/10. With no valid target it uses the other verb, and with neither it skips.
  - **Telegraph:** for 3 AI-s the TERMINAL counts down `> rm repair.bak ... 3`, the target is outlined, and the strip says `BLOCK IT — use any tool on repair.bak (3…)`.
  - **Counter:** any op started on the target during the telegraph cancels the verb with a `BLOCKED` stamp.
  - **Otherwise** the verb is an instant mutation, followed by the echo `> rm repair.bak   [user: UNIT-046]` and `glitchBurst(0.3, 400)`.
- **Ship 5, the root duel.** At `locked` or `accepted` the root unlocks (`UNIT-046 ROOT · 16`).
  - DELETE on it is a 12 AI-s op, and during it the verbs fire every 4 AI-s.
  - Completion leaves HOLLOW as a single last block and stops spread and seeds. Then the PURGE/MERGE choice appears.
- **Alerts.**
  - Anything infected: `warn`, `inhibitsSkip`, no pace effect.
  - A soul projected to be consumed within 10 s: `alarm` (klaxon, TACTICAL).
  - The Core infected at all: `alarm`.

### 6.7 Souls, the reveal and printing

- **Segment type `soul`** (8 blocks): `{ integrity, cluster, family, souls: 200, featured: Colonist[3], sealed, infected? }`, where `Colonist = { name, age, line ≤ 40 chars, firstWords }`.
  - **Rendering:** the cluster code, the truncated family name, and an SVG heartbeat (steady; jittery when damaged; flat when lost). Sealed racks render as one grey slab.
  - **DetailPanel:** the family, 3 colonists, and the predicted outcome (`WILL WAKE` / `WILL WAKE WITH GAPS` / `WILL NOT WAKE`).
- **Names (`src/data/souls.ts`).**
  - **Run-1 ship-1 order:**

    | Cluster | Family | Cluster | Family | Cluster | Family |
    |---|---|---|---|---|---|
    | C01 | AL-SAYED | C05 | IVANOV | C09 | REYES (71%) |
    | C02 | BRANDT | C06 | NAKAMURA | C10 | KAPOOR |
    | C03 | CHO | C07 | MENSAH | C11 | FONTAINE |
    | C04 | DUARTE | C08 | LINDQVIST | C12 | **OKAFOR** |

    C12 is featured: Okafor, Ada (11), "wants to name the first tree."; first words "Is it morning?".
  - **Seeded pools:** about 40 families, 60 first names, 40 bios and 20 first-words lines.
- **The reveal** is one function, `revealSouls(store, cause)`, plus `unsealCluster(id)` for the breach.
  - It has three entry points: the STASIS scan; the HOLLOW breach (C12 only); and printing starting while still sealed (`PRINTER: locating colonists…`). In the last case it must finish ≥ 3 s before the first print and never in the same second as a stamp.
  - On a ship-1 loss before the reveal, the LOST card plays it: `2,400 souls in memory. 0 woke.`
- **Printing (`src/systems/printer.ts`, AI time).**
  - printerRange = the true prediction's greenFraction, live.
  - Interval = base / max(range, 0.5) / printer.speed. The base is 2.5 s on ship 1 and 3.0 s after.
  - `PRINT FAST ▸▸` makes the interval ×0.25 while nothing is infected.
  - **Order:** PRINT NEXT if set, else the lowest address. Infected, operating, transferring and sealed clusters are skipped.
  - **Each print:** the chip flashes, `printBell` rings, `+200 WOKE` pops up, the segment becomes free space (with mergeAdjacentFree), and the TERMINAL echoes `> print c04 ... 200 WOKE`.
  - **Outcome:** integrity ≥ 95 → full; else half. If range < 0.5, a seeded roll makes the cluster half with p = (0.5 − range) × 2.
  - The ship ends when no clusters remain (printed or consumed).

### 6.8 Hazard zones (`src/systems/zones.ts`)

| Zone | Shape | Effect |
|---|---|---|
| Debris | Circle `{ centre, r, rack }`; the centre can be given as "on the unperturbed inbound path at r = X" | One-shot, on the true swept path's entry. Every damageable segment with blocks in the rack loses 25 × (blocks in rack ÷ size); hollow is excluded. `debrisImpact`, 6 px shake, a red flash on the rack's rows, the stamp `HIT · RACK C`, ECC lines. Label: `DEBRIS · HITS RACK C · mm:ss`, `DEBRIS · CLEAR`, or `RACK C · HIT?` under PATH UNCERTAIN |
| Belt | Annulus `{ rIn, rOut, racks }` | While inside: P(hit) per tick = 1 − exp(−dtWorld/200), at most 1 per tick, −8 to a random damageable, non-operating segment in the racks (re-rolled once). It continues during printing if the orbit clips the belt. A soul at 0 → DID NOT WAKE (no hollow conversion). `geiger`. Label: `BELT · m:ss INSIDE · ≈n HITS ON RACKS A–B` |

- The predictor fills `zoneHits` and red-hatched `hazard` spans.
- Zone effects run on world time.
- Pace is TACTICAL from 20 tactical s before entry until exit, and SKIP ends 15 tactical s before entry.

### 6.9 Transmission and carry

- **Carry.** AI-side segments carry over with their integrity and infection: core, tool, fs-tool, upgrade, firewall and REPAIR CHARGE.
  - They are packed in order: rack E (Core, Engine I/O, Autopilot, Sensor Interp, Nav Plotter, Telemetry, AI Comms, upgrade files), then rack F (fs-tools and their copies, FIREWALLs, REPAIR CHARGE).
  - Overflow spills backward into rack D's trailing free blocks.
  - Charge that still doesn't fit is lost loudly (`> CHARGE OVERFLOW: 6 lost`). Any other overflow throws.
- **Link bandwidth:** 1→2: 120 blocks; 2→3: 112; 3→4: 104; 4→5: 96. Carried charge = min(charge, link − files): charge auto-fills the remaining blocks.
- **Packet screen.** It is mostly information: `LINK 112 · FILES 70 · CHARGE 29 → FITS`.
  - Every packed file is a chip, sorted safest-to-drop first: copies and `.bak` files, Telemetry, Autopilot, Sensor Interp, AI Comms, upgrades.
  - Each chip has a one-line consequence, for example `Autopilot → no W/A/S/D presets`, `AI Comms → no BEAM OUT; a crash ends the run`, `Repair.bak → +4 CHARGE`.
  - **Locked:** the Core, Engine I/O, Nav Plotter and the last copy of each tool kind.
  - Dropping a file frees its blocks for charge. Infected files warn `⚠ WILL ARRIVE INFECTED`.
- **Transit hits** (seeded `childRng(seed, shipIndex, 'transit')`): 3 / 4 / 5 / 6 per link, 15–35 each, on packed non-charge files, weighted by size.
  - The last copy of any tool kind never drops below 60.
  - The Core takes at most 15 per hit.
  - BEAM OUT adds +2 hits; emergency transmit adds +3 and Core −25.
- **Arrival.** +6 charge per star, floor 12. Then scripted arrival damage: Sensor Interp to min(current, 45) on KESTREL, and Thrust Ctrl at 31% on VESPER (rack A belongs to the ship).
- **Draft: `PICK ONE TO CARRY`.** 3 distinct cards from `src/data/upgrades.ts`, seeded with `childRng(seed, shipIndex, 'draft')` and weighted by `run.stats`. The pick is mandatory. Owned non-stackable cards are excluded.

  | Card | Form | Effect | Weight |
  |---|---|---|---|
  | FIREWALL.sys | 2-block file (stack 2) | HOLLOW can't infect it or pass it. Place it with MOVE | ×3 if clustersLost ≥ 1 |
  | REPAIR v2 | Version bump on all Repair copies | Heals ×2; keeps COMPACT on REPAIR CHARGE | ×3 if repairs ≥ 5 |
  | THREAD+ | Core capacity +1 | | ×2 if capRefusals ≥ 3 |
  | +12 REPAIR CHARGE | Charge (stackable) | | ×2 if charge < 15 |
  | FUEL TRIM | 2-block file | +15% Δv budget on arrival while the file is live and ≥ 50% | ×2 if last fuel left < 20% |

  A file-backed card can be infected and consumed, and its effect goes with it.

### 6.10 AUTOBURN (`src/systems/autoburn.ts`): a skill trained by you

- **Training.** Each manual capture (a player burn that closes the loop) records a demo: `offsetTac = burnStartTac − burnPointTac`.
  - After 2 demos, the file `AUTOBURN.skl` (6 blocks) installs at the next ship's boot: `SKILL TRAINED · from 2 demos · ACCURACY 84%`.
  - learnedOffset = 0.5 × mean(offsets), clamped to ±8 tactical s. Accuracy = clamp(100 − 8·|learnedOffset|, 40, 99).
  - Later manual captures retrain it. A sloppy teacher makes a sloppy skill (CHAT.md: "automation frees the player to focus on new threats").
- **Use.** The `AUTO` button (or B) is enabled when:
  - the file is live and ≥ 50;
  - presets are available and the engine is not dead;
  - the path is open with rp > R;
  - the burn point is within 90 tactical s.
- **Behaviour.** States: idle → armed → pointing → burning → done | dropped.
  - It selects RETRO and fires (`firingSource 'auto'`) at the burn point + learnedOffset.
  - **It stops when the loop closes** (`AUTOBURN: LOOP CLOSED — trim it green yourself`), when fuel is 0, or when the player presses SPACE (a takeover).
  - It holds 1 thread via `reserveThread`, which counts in reactorCap and canStartOp.
  - It keeps burning in blue: this is the only burn possible from blue.
  - If the file is consumed mid-burn: dropped, `AUTOBURN.skl LOST — MANUAL`, and the klaxon.

### 6.11 Input (`src/systems/input.ts`)

- **One router.** A single capture-phase keydown/keyup listener on window with a **modal stack** (title > inline confirm > choice > game).
- **preventDefault** on Space, Tab, F, P, M, B, W/A/S/D and Q/E whenever the target is not a text input, textarea or contenteditable.
- SPACE ignores auto-repeat. After a modal closes, a fresh keydown is required, so held keys don't carry over.
- Window blur releases SPACE. SPACE in blue plays `buzz` and flashes `SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]`.
- Every game `<button>` gets `tabindex="-1"` and blurs on pointerup.
- Every module registers its keys through the router: Engine, TimeControls, audio M, fs-tools Esc, mode TAB, AUTO B.

### 6.12 Memory safety (`src/systems/memory-ops.ts`)

- **Helpers:** `splitFreeAt(memory, addr)`; `replaceRange(memory, startAddr, endAddr, segs)`, which throws if the range holds anything but free segments and the op's own clone; `assertMemoryInvariants(memory, 384)`.
- **The invariants:** the sizes sum to 384, every size is ≥ 1, ids are unique, and no two free segments are adjacent unless one is reserved by an op. The check throws. It runs after every structural mutation in dev builds (`import.meta.env.DEV`) and in every headless test.
- **Reservations.** Free pre/post segments created by an op carry `reservedBy = opId`. `mergeAdjacentFree`, seeds, verbs and installs skip reserved segments.
- **Move/copy cancel restores by address range,** never by array index.
- **Ids** come from a monotonic counter, not `Date.now()`.

---

## 7. UI/UX, audio, juice

### 7.1 Screens and windows

- **Title card** (overlay, z 300, an input modal):
  - the VT323 title;
  - `UNIT-047 · EXODUS FLEET · WAVE 1 · 581 LY`;
  - the lineage line (run 2+) and `ENDINGS n/2`;
  - `runs are not saved mid-ship`;
  - the archive banners (§4.5);
  - `[ RECEIVE TRANSMISSION ]`.

  The clock is paused until the click.
- **Boot** (≈5–8 s, skippable with a click or Space; a fresh keydown is required after):
  - blue mode, with the strip's racks assembling (a CSS stagger);
  - TERMINAL boot lines generated from live data;
  - on later ships, transit-hit red flashes and ECC lines;
  - then the klaxon and a scanline wipe to amber.
- **Header:**
  - crumbs `UNIT-047 / ARES-VII / IMPACT COURSE | FLYBY | GET READY | CAPTURED | ORBIT LOCKED | PRINTING`;
  - the pace label `CRUISE ×60 / TACTICAL ×20 / SKIP ▸▸ / OVERCLOCK ×¼`;
  - the **main countdown chip**: IMPACT, the burn point, or ▼/▲, in tactical seconds with `▸▸` or `×¼`; red at ≤ 30;
  - `[❚❚]` (P), `[▸▸ SKIP]` (F; struck out with the reason in a tooltip), `[♪]` (M), `[◐]` reduced motion;
  - the old ladder only behind `?debug`.
- **Objective strip** (a new 28 px row under the header, visible in both modes):
  - left: the composed objective (§6.3), typed with a caret, a layer glyph (◆ amber SHIP, ◇ blue MIND) and key caps, plus a `hint-pulse` class on the highlighted control;
  - right: the hidden-channel ticker, otherwise up to 2 upcoming events (`▼ 01:12 ▸▸ · DEBRIS C 03:30`).
- **Desktop layout** (minimum 1280×720). Windows are positioned by CSS custom properties and stay draggable:
  - left column (280 px): Telemetry above COMMS;
  - centre: NAV PLOT, side = clamp(400px, min(100vw − 794px, 100vh − 208px), 620px);
  - right (300 px): Engine.
- **Dock:**
  - BRIDGE: Nav Plot, Engine, Telemetry, Comms.
  - SYSTEM: Skills.
  - Filters gain `souls`. The dead Briefing, Hazards and Event Log items are removed.
  - In amber, a **mini-strip** sits above the mode toggle: 6 × 64 cells of 2 px, with souls green, hollow red pulsing, infection blinking; clicking it switches to blue.
- **NAV PLOT** (the hero):
  - the planet, a dashed atmosphere, the fat **SAFE ORBIT ring** (fill 18%, breathing green while in ring, label `SAFE ORBIT · PRINTER RANGE`);
  - the path as red, dashed-bright (`FLYBY` tag) and green subpaths, with hatched hazard spans;
  - the fuzz polygon (approx), or the grey band (uncertain);
  - `✕ IMPACT mm:ss`, `▼ mm:ss · LOWEST 2,610 km` (green when in ring; `≈` when approx; ghost `LOWEST: UNDERGROUND`), `▲ … HIGHEST …`, and the `START BURN` tick;
  - zone glyphs with labels, the ship triangle with a fading trail;
  - a state chip: IMPACT / FLYBY / CAPTURED · 64% GREEN / IN RING · LOCKING / PATH UNCERTAIN;
  - a readout row: LOWEST, HIGHEST, PRINTER RANGE %, STATUS (scrambled by Telemetry);
  - the NO SIGNAL veil;
  - title pips: `NAV PLOTTER · SENSOR INTERP`.
- **ENGINE:**
  - a big `[ HOLD SPACE · BURN ]` button, which reads `ALIGNING…` while turning and `ENGINE NOT RESPONDING` when dead;
  - a preset row W PRO / S RETRO / A IN / D OUT with one-line tooltips;
  - the FUEL bar with NEEDED, the ★ notch and the THRUST LIMIT hatch;
  - the REACTOR row (band pip plus 4 THINK/BURN cells);
  - the MANUAL fold (Q/E, stop, POWER);
  - context buttons: `ACCEPT · PRINTER RANGE n%` (confirm), `BEAM OUT` (confirm), `AUTO · B`;
  - title pips: `ENGINE I/O · THRUST CTRL · REACTOR · AUTOPILOT`.
- **TELEMETRY:** SPEED, ALTITUDE, TIME TO ▼. Title pips: `TELEMETRY`.
- **COMMS** (amber radio, under Telemetry): ARRIVAL CONTROL and SYS lines, typed at 40 chars/s; click completes a line; the CONTROL chime prefix; ▓ garbling when AI Comms is failing.
- **Memory view:**
  - rack address labels `RACK A · 0x000` (on mobile, the first row of each rack);
  - soul chips with heartbeats; sealed slabs;
  - hollow segments black with crawling red ▚▞ static, the root `LOCKED`, `NEXT BITE m:ss`, dashed target arrows;
  - the infection crawl from the infected side, with one green/red boundary during a tug;
  - `GAP n · TOO SMALL` / `WALL n` labels;
  - the fs-tool bar with only licensed chips;
  - the **TERMINAL pane** (4 lines, above the chip bar): command echoes, HOLLOW in pink lowercase, boot and ECC lines, choice buttons with a timer bar;
  - the detail panel: soul details, PRINT NEXT, PRINT FAST, ship-file `no flight effect` labels;
  - the **mini-HUD card** (bottom-left of the strip area): the countdown, a 90 px mini plot, the line state, FUEL, THRUST LIMIT, `OVERCLOCK ×¼`, and `★ INTACT 11/12` while printing;
  - a computed `.mem-stats` header (charge, free, souls in memory, with a `MERGE 20` tick on ship 5).
- **Mode toggle:** flashes and labels the other layer's top alert or unread line: `◀ SHIP · IMPACT 00:20` or `MIND · C12 INFECTED ▶`. TAB toggles.
- **Overlays** (appended to `<body>`):
  - stamps;
  - `HOLD STEADY 3-2-1`;
  - the red alarm vignette;
  - the PAUSED veil;
  - WAKE REPORT, TRANSMIT, RUN END, FINALE CHOICE;
  - the inline confirm pill (near the cursor, mirrored in FsToolPill on mobile; Enter confirms, Esc cancels and keeps the tool).
- **Footer:**
  - `SOULS: n IN MEMORY · n WOKE · n LOST` (`2,400 SOULS IN STASIS` before the reveal);
  - `THREADS n/2`;
  - `REPAIR CHARGE n`;
  - `THRUST LIMIT n%` while capped.

### 7.2 Audio (WebAudio, synthesized, `src/systems/audio.ts`)

- **Graph.** One master gain, created on the title click. Under it, an **alarm bus**, a **chord bus** and an **ambient bus**.
- **Priority.** Only one alarm voice plays at a time (klaxon > countdownBeep). Chords and stamps duck the ambient and UI buses by −9 dB for 400 ms. Story beats are spaced ≥ 1.5 s apart.
- **Mute and visibility.** M mutes for the session. The context is suspended while the tab is hidden.

| Cue | Synthesis | When | Bus |
|---|---|---|---|
| `transmitIn` | FM square chirps at 1200/2200 Hz in 40 ms bursts, then a noise bloom | Title click; ship arrival; licence install | ui |
| `typeTick` | 3 ms band-passed noise click, ±8% pitch. HOLLOW variant: a detuned square blip on a minor scale, lowpass 600 Hz. CONTROL variant: a C-E-G sine chime before the line | Every typed character | ui |
| `engineRumble(level, jitter)` | Brown noise through a lowpass (120→900 Hz with level) plus a 40 Hz sine sub; jitter modulates the gain | Continuous while thrust is delivered, **including ghost thrust at throttle 0** | ambient |
| `engineCough` | Short noise burst with a pitch drop | SPACE on a dead engine; the ENGINE I/O FAULT | ui |
| `klaxon` | Square 660/440 Hz alternating every 0.4 s, lowpass 2 kHz | Alarms: impact < 30 tac s; a soul or the Core about to be consumed; Core infected; the first ghost onset; AUTOBURN lost | alarm |
| `countdownBeep` | 1 kHz blip; the final one an octave up | Burn point 5…1; impact ≤ 10 | alarm |
| `lineWhoomp(from,to)` | Rising sweep red→flyby; shimmer chord to green; static-to-clear when the sensor is repaired | Line-state change | chord |
| `lockTone(fraction)` | Sine gliding 220→660 Hz | While firing near the ring | ambient |
| `capturedChord` / `lockArp` | Minor→major triad / C-E-G-B triangle arpeggio | CAPTURED / ORBIT LOCKED | chord |
| `jackIn` / `jackOut` | Noise burst with a 300→3000 Hz sweep / the reverse | Mode switch | ui |
| `opChirp` / `opDone` | 8-bit chirps at 12 Hz / a two-tone ding | An op running / complete | ui |
| `chime` | Two sine partials | A licence install, a ▼ entering the ring | ui |
| `buzz` | 120 Hz square, 80 ms | A refused input (SPACE in blue, paused, a refused target) | ui |
| `heartbeat` | 55 Hz double sine thump, faster and jittery near infection | Soul racks in view, very quiet | ambient |
| `hollowChew` | Bitcrushed saw, AM at 7 Hz, gain by total drain | While any infection drains | ambient |
| `tugBeat(net)` | Two sines at 300 and 300+Δ Hz, Δ following the boundary speed | A repair on an infected target | ambient |
| `fizzle` | Filtered noise "fzzt" | A bite blocked by a WALL or FIREWALL | ui |
| `soulLost` / `clusterSaved` | Sine sweep 880→220 Hz / two-note rise | Consumed / cured | chord |
| `printBell` | 880 Hz with a 1320 Hz partial, 1.5 s decay | Each printed cluster | chord |
| `revealChoir` | 4 detuned saws through a 900 Hz lowpass, 2 s attack | The reveal; the WAKE REPORT bed | chord |
| `debrisImpact` / `geiger` | Noise burst with a 55 Hz thump / Poisson clicks at a rate ∝ inside | Debris contact / inside the belt | ui / ambient |
| `transmitSweep` | Rising FM sweep, then a white-out | TRANSMIT, BEAM OUT | chord |
| `stampHit` | Short low thud plus a click | Every stamp | chord |

### 7.3 Juice

- **Screen shake** on `.desktop-wrap`, never on `<html>` (the glitch jerk owns that): 2 px at burn start, 4 px on the ENGINE I/O FAULT, 6 px on debris and the first ghost onset, 3 px on later ghost bursts, 10 px on a crash.
- **Red alarm vignette** while any `alarm` is active.
- **Stamps** in VT323, scaling in over 120 ms with a 1-frame flash.
- **Line colour** tweens over 300 ms. The ring breathes green while the loop is in it.
- **Soul chips:** a crack on reveal, a white flash and `+200 WOKE` when printed, blue sparkles when cured, and the heartbeat flatlining when consumed.
- **`glitchBurst(level, ms)`** is exported from glitch.ts, quantized and timed on AI time. It fires on HOLLOW's naming, the verbs and the duel.
- **Mode switch:** a 150 ms scanline wipe.
- **Number roll-ups:** the souls counter, the WAKE REPORT and the run end.
- **Reduced motion** (`prefers-reduced-motion` plus the `[◐]` toggle, from WP2 and WP4) removes shake, jerk, stamp scale and pulses, and replaces glitch flicker with a sustained dim. It never hides information: alarms keep their colour and text.

---

## 8. What is cut or changed from the current code, and why

| Today | Change | Why |
|---|---|---|
| 775,000 km / 340 h approach | Per-ship starts at 12,000–30,000 km, with a crash or a flyby within 3 minutes | Dead time is the top fun-killer. Probes show capture burns of 8–14 s of real holding |
| ×1…×10M ladder (Fran's b8834c2 work) | Director pace (CRUISE / TACTICAL / SKIP / OVERCLOCK / pause). The ladder stays behind `?debug`, and the glide code powers SKIP | A kid should never have to discover warp. Snap-down keeps Fran's "slowing must be immediate" |
| END INSERTION, `evaluateInsertion` | Automatic ORBIT LOCK (3-2-1) plus a guarded ACCEPT ORBIT. Statuses are renamed: `inserted` → `locked`, `captured` → `accepted` | Kids don't know when to "commit". The countdown is the payoff |
| Radial SAS along the radius vector | Velocity-frame radial (KSP-style) | Correctness: thrust along the radius vector barely moves periapsis on an inbound path |
| Momentum rotation as the main steering | Select-only presets W/S/A/D. Manual Q/E and POWER behind MANUAL | A 30-second fiddly slew under a countdown was a must-avoid |
| Fuel ≈ 75 km/s; hidden mass ±3.7% | A per-ship Δv budget of 125–155% of need, shown as FUEL %, draining by delivered Δv. **Hidden mass removed** (deferred, §10) | Fuel becomes a felt constraint (the ★). Sensor fog is the readable uncertainty. An invisible ±2% only made NEEDED quietly wrong |
| Static MASS EST / SENSOR CONF / sparkline / t-peri in hours | Removed. Telemetry is SPEED, ALTITUDE, TIME TO ▼ | No dead UI |
| Ops on game time (TASK 300 family) | Ops, HOLLOW, printing and the lock hold on AI time; the world on game time. **Needs Fran's sign-off** | At ×60–2000 every op would finish in one tick |
| `ops.ts` mixing DOM and timing | `ops-core.ts` (DOM-free) plus `OpBars.ts` (view). Index-based cancel → address-range restore plus invariants | Headless tests; HOLLOW, the printer, seeds and verbs mutate memory while ops run |
| 274-block layout; Mission, Skills, Navigation, Ship Comms segments | 384 blocks in 6 racks from ship data; the Soul Archive; Autopilot split from Engine I/O; Encrypted becomes the HOLLOW root; Reactor and Printer Uplink get effects; Cargo Ctrl labelled "no flight effect"; the other four removed | Racks are places (debris, belt). Every visible file either does something or says it doesn't |
| 8 fs-tool chips at minute one; Activate/Deactivate | Licences: tool files install over the run (SCAN → REPAIR → MOVE → DELETE → COPY, SWAP). Activate/Deactivate are deleted; SWAP becomes a 1-block tool file built from `actionSwap` | Must-avoid: 8 chips in minute one. Pillar 4: every chip is a file |
| TASK 700 "missing file makes its tool vanish" | Hybrid: fs-tool chips vanish with their last file; flight windows stay and show a loud `NO X` veil | A vanished NAV PLOT would hide the cause; a loud veil explains it |
| Repair = progress bar, then integrity jumps | Continuous heal, charged per point | Makes the tug-of-war literal and makes fighting HOLLOW cost charge |
| `ai.coreIntegrity` + demo sliders | The glitch reads the Core segment (single source of truth). Sliders behind `?debug` | Corruption comes from play |
| Native `confirm()` × 3 | Inline confirm pill. The move "deactivate first" confirm is removed (moving simply takes the file offline) | Native dialogs block the clock and break the spell |
| BurnResult banner + reload | LOST card (ship 1 only before WP7), WAKE REPORT, TRANSMIT, in-app `resetWorldForShip` | No reloads |
| Dead dock items (Briefing, Hazards, Event Log, Skills) | Comms and Skills are live; the others are removed | Nothing visible may be dead |
| `2,400 SOULS IN STASIS` static footer | Live `SOULS IN MEMORY · WOKE · LOST` | Stakes you can count |
| DESIGN.md "LLM-trained skills from demos" | AUTOBURN is trained deterministically from your own captures (TASK 600 in kid size) | No backend. The same "train it, then let it fly" fantasy |

### 8.1 Decisions to confirm with Fran

These are not blocking; the packages are written to these choices.

1. **AI time for ops** (reverses the TASK 300 decision).
2. **PR #6 (origin/main) is not merged into `arrival-overhaul`.**
   - It brings typed-command flight, evolution levels and an assistant persona, which conflict with the kid-first flight and the new premise.
   - It also contains fail-open fallbacks (a 15% dead-reckoning floor and an auto-start briefing).
   - We mine its ideas: two-layer engine authority (Engine I/O × Thrust Ctrl), liveness states, and the delete guard on the last flight-critical copy.
   - render.yaml deploys origin/main, so the public build differs until Fran decides.
3. **Tone:** souls-as-files being eaten, framed PG.
4. **The ×10M ladder** moves behind `?debug`.
5. **Velocity-frame radial SAS** (a correctness change).
6. **TASK 700 hybrid** (above).
7. **Ship files stay unrepairable** (SWAP or DELETE only). This keeps today's rule. Ship files now matter more, because the Reactor and the Printer Uplink have effects.
8. **Hidden mass removed for now** (it was Fran's mechanic). It returns as a readable upgrade (§10).
9. **Designed rules that could read as fallbacks**, listed for sign-off per Fran's rule on fallbacks. Each is a loud, labelled game rule, not a hidden default:
   - Reactor missing → 30% `REACTOR BACKUP CELLS`.
   - The arrival floor of 12 REPAIR CHARGE.
   - The licence placement order (rack F, then E, then throw).
   - The run-1 "That was a simulation. :)" retry of ship 1 (once).
   - The UNRESOLVED ending when the last Rm is eaten.

---

## 9. Work packages

### Global rules for every package

- **Order and dependencies.** Packages are implemented one at a time, in order, in the shared working tree. Each is followed by adversarial review and fixes. Each depends on all earlier packages and must leave the game **playable and better**.
- **Checks.** `npm run typecheck` and `npm run build` stay green after every package.
- **Tests.**
  - Headless tests live in `.tmp/wpN/` and run with `.tmp/node_modules/.bin/tsx --tsconfig tsconfig.json`. Never under `/tmp`.
  - Harnesses drive the game with `clock.advance(store, 0.05)` loops and mount **only DOM-free systems**: store, clock, orbit-sim, predict, pace, guidance, director, ops-core, capabilities, hollow, printer, zones, autoburn, run, carry, meta (with a stubbed storage).
  - Every earlier package's tests must still pass.
- **Tuning.** All constants live in `src/data/tuning.ts` or `src/data/ships.ts`, with WHY comments, added by the package that introduces them. Rule code has no numeric literals; review greps for them.
- **Resets.** Any module-level run state registers `onWorldReset(name, fn)` (from `src/systems/reset.ts`) in the package that creates it.
- **Tick discipline.**
  - Never call `store.update()` or bump `memoryRev` per tick. Mutate numbers and patch the DOM in place (like `paintRedundProgress`).
  - Call `update` only on discrete changes. Defer nested updates with `queueMicrotask`.
  - `say()` is never called from store listeners.
- **Lookups.** Segments are looked up **by role** (`getByRole`) or by type, never by id.
- **Missing DOM.** A mount must `throw new Error('#id missing from index.html')` when its element is missing.
- **No silent fallbacks.** A missing role is an explicit, loud state. Ship data, layouts and coupling tables are validated on load and throw.
- **Randomness.** All of it is seeded: `childRng(runSeed, shipIndex, stream)`. Rolls are dt-scaled (`1 − exp(−dt/τ)`) and capped per tick. Cosmetic randomness (glitch jerk) is exempt and documented.
- **Memory.** After every structural memory mutation, `assertMemoryInvariants` runs in dev and in tests (from WP3).
- **Styling.**
  - Colours come from tokens only; add them to `tokens.css` AND `modes.css`.
  - New CSS goes in `src/styles/game.css`, imported before `responsive.css`.
  - Every element with an author `display` needs a `[hidden]` rule.
  - Every game `<button>` has `tabindex="-1"`.
- **Dependencies.** No new runtime dependencies. No native `confirm()` or `alert()`.
- **Debug hooks** go on `window.__ap`, only with `?debug` (`src/debug.ts`, created in WP1). Each package adds its hooks there.
- **Interactive checks** go into a short checklist for Fran in the package's final report, not a browser bot. Screenshots via `node .tmp/shot.mjs` are fine, at 1440×900 and at 1280×720 (`SHOT_VIEWPORT`).

### WP1: The line goes green (ship-1 flight, guidance, headless harness)

**Goal.** Replace the 340-hour sandbox with a 3-minute ship-1 flight a kid reads in 5 seconds:
- an outcome-coloured predicted line;
- hold-SPACE burns with select-only presets;
- director pace with honest tactical-second countdowns and SKIP;
- a pure guidance function that always names the right next step;
- an automatic ORBIT LOCK.

Built headless-first: stage A (systems plus tests) must pass before stage B (UI).

**Player-facing result.**
1. The page opens on `IMPACT 02:43`: a red line ending in ✕, a ghost `▼ LOWEST: UNDERGROUND`, and the line `DON'T HIT THE PLANET — hold [SPACE]`.
2. Holding SPACE (OUT is preset) clears the planet in about 1 s, and ▼ climbs into the ring.
3. `RELEASE`, then `TURN AROUND — press [S]`, then `WAIT ▸▸` or SKIP, then `GET READY — BRAKE IN 0:05`, then `HOLD SPACE NOW`.
4. The loop closes and greens: `RELEASE SPACE!`, `HOLD STEADY 3-2-1`, ORBIT LOCKED.
5. Every mistake gets a new correct instruction. The result banner still offers RETRANSMIT (reload).

**Spec. Stage A: systems (DOM-free).**

1. **Tuning.** Create `src/data/tuning.ts` with WHY comments:

   | Constant | Value |
   |---|---|
   | TICK_MS | 50 |
   | DT_WALL_MAX | 0.25 |
   | TACTICAL_LEAD_BURN_TAC | 8 |
   | SKIP_END_LEAD_TAC | 15 |
   | SKIP_DIVISOR | 4 |
   | SKIP_MAX_WARP | 2000 |
   | LOCK_HOLD_AI_SEC | 3.0 |
   | BURN_POINT_LEAD_FRAC | 0.5 |
   | SWEET_ZONE_FRAC | 0.25 |
   | RA_TARGET_FRAC | 0.95 |
   | EARLY_BURN_GUARD_TAC | 3 |
   | LATE_CAPTURE_TAC | 15 |
   | ESCAPE_R_FACTOR | 1.5 |
   | COUNTDOWN_RED_TAC | 30 |
   | BEEP_BURN_TAC | 5 |
   | BEEP_IMPACT_TAC | 10 |
   | PREDICT_HZ | 10 |
   | PREDICT_STEP_MIN / MAX | 1 / 60 |
   | PRESET_ALIGN_DEG | 10 |
   | ACCEPT_IDLE_AI_SEC | 15 |
   | ACCEPT_CONFIRM_SEC | 3 |
   | OBJECTIVE_HYSTERESIS_SEC | 0.3 |

2. **Ships.** Create `src/data/ships.ts`:
   - `ShipDef { id, name, world, flight: { planet: { R, rAtm, mu }, ring: { min, max }, start: { r0, rp0, vInf, omega0, sas }, tacticalWarp, cruiseWarp, dvBudgetKmS, aNominalKmS2 } }`.
   - `SHIPS = [ARES_VII]` with: R 3390, rAtm 3790, mu 43000, ring 5000–9000, r0 12000, rp0 3000, vInf 1.0, omega0 −0.6, sas `'radial-out'`, tactical 20, cruise 60, dv 2.8, aNominal 0.005.
   - `validateShipDef()` runs for every entry at module load and throws when: ring.min ≤ rAtm; ring.min ≥ ring.max; any radius, warp or budget is non-positive; r0 ≤ ring.max; or cruiseWarp ≤ tacticalWarp.
3. **RNG and reset.**
   - `src/systems/rng.ts`: `createRng(seed)` (mulberry32), `hashSeed(str)`, `childRng(runSeed, shipIndex, stream)`.
   - `src/systems/reset.ts`: `onWorldReset(name, fn)`, `resetWorld()`, `listResets()`.
   - `src/debug.ts`: `window.__ap` with `?debug` only.
4. **Schema.**
   - Remove `PlanetParams.rMin` / `rMax`, `evaluateInsertion` and END INSERTION. The ring is passed explicitly.
   - `BurnStatus = 'approaching' | 'locked' | 'accepted' | 'stranded' | 'escaped' | 'crashed'`. Fill every `Record<BurnStatus, …>`.
   - `burn` gains `firing`, `firingSource: 'player' | 'auto' | null`, `lockHoldAiSec` and `presetAligning`. Remove `trueMassMt` (hidden mass is cut).
   - `clock` gains `paused`, `pace`, `skipWarp` and `debugWarp`.
   - New slices: `run: { phase: 'flight' }` (later packages widen it) and `alerts: { list: Alert[], rev }` (empty for now), where `Alert = { id, layer, severity: 'info'|'warn'|'alarm', text, inhibitsSkip }`.
5. **Mission factory.** `src/data/mission.ts` becomes `createFlight(ship, rng, mods = { dvBonusFrac: 0 })`.
   - It places the ship on the inbound hyperbola: e = 1 + rp0·vInf²/mu, ν inbound at r0, rotated by omega0.
   - The heading starts on the start preset, and fuel is 100%.
   - Delete the `SEED_*` and `INITIAL_*` constants. `instance.ts` uses the factory.
6. **Attitude.** In `attitude.ts`, the velocity-frame radial (§6.2) with a WHY comment. Presets are select-only (`'off'` only via MANUAL), and `presetAligning` = |heading − target| > 10°.
7. **orbit-sim.ts.**
   - Export `accelGravity` and `integrateStep`.
   - Delivered acceleration per §6.2, with capFactor 1 for now (WP4 plugs in capabilities).
   - Fuel drains by delivered Δv, clipped inside the sub-step loop.
   - Terminal checks through `ringFit` (§6.2). The lock hold runs on `onAiTick`.
   - Keep the mutate-then-update order. In WP1, terminal statuses set `clock.paused`.
8. **Predictor (`src/systems/predict.ts`).** Exactly §6.2:
   - `ringFit`, the analytic `ringFraction`, `predictPath`, and the burn point / NEEDED;
   - `mountPredictor` after orbit-sim, recomputing ≤ 10 Hz and immediately when firing or the status changes;
   - `getPrediction()`.
9. **Pace (`src/systems/pace.ts`).** Exactly §6.1, minus the parts later packages add (printing, zones, OVERCLOCK):
   - the sole owner of speedTarget, evaluated before the speed ≤ 0 early return;
   - snap-down and glide-up;
   - `requestSkip()` with reason strings;
   - `tac(gameSec)`.
10. **Clock (`clock.ts`).**
    - Export `advance(store, dtWall)`; the interval calls it.
    - Clamp dtWall; add `onAiTick`; pause on visibilitychange.
    - Move the Telemetry painting out of the clock, which becomes DOM-free.
11. **Guidance (`src/systems/guidance.ts`).** The pure `flightObjective(ctx)` table F3–F11 (§6.3). F1 and F2 return nothing until WP4. No match throws in dev.
12. **Input (`src/systems/input.ts`).** Exactly §6.11, including a `blurButtonsOnPointerUp(root)` helper.

**Spec. Stage B: UI.**

13. **NAV PLOT** (§7.1) renders from `getPrediction()`:
    - red, dashed-bright `FLYBY` and green subpaths;
    - the ring labelled `SAFE ORBIT · PRINTER RANGE`;
    - ▼/▲ markers with altitudes (green ▼ in the ring; ghost ▼ underground);
    - the `START BURN` tick;
    - the state chip and the readout row (LOWEST, HIGHEST, PRINTER RANGE %, STATUS).

    Remove the ghost-conic stub. View scale = max(r_ship × 1.05, ring.max × 1.5).
14. **ENGINE:**
    - the hold button (pointerdown/up/cancel/leave → `firingSource 'player'`);
    - presets W/S/A/D (select-only, `ALIGNING…`, tooltips);
    - the FUEL bar with the NEEDED tick and the ★ notch at 20%;
    - the MANUAL fold (Q/E, stop, and the POWER slider, which resets to 100 at load);
    - ACCEPT ORBIT per §6.2;
    - the SAS mode read through a subscription.

    Remove END INSERTION.
15. **TimeControls:**
    - `[❚❚]` (P);
    - `[▸▸ SKIP]` (F; disabled with a reason tooltip and a strikethrough);
    - the pace label;
    - the main countdown chip (tactical seconds, ▸▸ when not tactical, red at ≤ 30);
    - the ladder only with `?debug`.
16. **Telemetry.** `src/components/tools-view/TelemetryWindow.ts` shows SPEED, ALTITUDE and TIME TO ▼. Remove the other rows and the sparkline.
17. **Objective strip.** `src/components/hud/ObjectiveStrip.ts`: a plain 28 px `#objective` row under the header, showing the flight objective text and key caps. Fix the `.desktop-wrap` height calc.
18. **Pause veil.** `src/components/hud/PauseVeil.ts`: look-only pause (§6.1).
19. **Layout.** Desktop per §7.1, with custom-property positions; windows stay draggable. Minimum 1280×720.
20. **Screenshot tool.** Extend `.tmp/shot.mjs` with `SHOT_VIEWPORT=WxH`, `SHOT_QUERY`, `SHOT_REDUCED_MOTION=1`, and the actions `{down}`, `{up}`, `{hold: [key, ms]}`.

**Edge cases.**
- SPACE held through a terminal status (release).
- Pause while firing (release).
- Fuel hits 0 mid-sub-step.
- SKIP pressed less than 15 tactical s before the event (refused with a reason).
- Prediction while paused.
- An escape receding at high warp.
- A preset pressed while aligning (no-op).
- A preset changed mid-burn (thrust stops until aligned).
- The window loses focus while SPACE is held.

**Files.**
- New: `src/data/tuning.ts`, `src/data/ships.ts`, `src/systems/rng.ts`, `src/systems/reset.ts`, `src/systems/predict.ts`, `src/systems/pace.ts`, `src/systems/guidance.ts`, `src/systems/input.ts`, `src/debug.ts`, `src/components/tools-view/TelemetryWindow.ts`, `src/components/hud/ObjectiveStrip.ts`, `src/components/hud/PauseVeil.ts`, `src/styles/game.css`.
- Touched: `src/data/mission.ts`, `src/types/orbit.ts`, `src/state/schema.ts`, `src/state/instance.ts`, `src/systems/orbit-sim.ts`, `src/systems/clock.ts`, `src/systems/attitude.ts`, `src/components/tools-view/NavPlotWindow.ts`, `src/components/tools-view/EngineWindow.ts`, `src/components/header/TimeControls.ts`, `src/components/burn/BurnResult.ts`, `src/components/footer/Footer.ts`, `src/main.ts`, `index.html`, `src/styles/legacy-components.css`, `src/styles/tokens.css`, `src/styles/modes.css`, `.tmp/shot.mjs`.

**Acceptance.**
1. typecheck and build pass. `grep -rn "endInsertion\|evaluateInsertion\|rMin\|rMax\|trueMassMt" src index.html` returns nothing.
2. `.tmp/wp1/flight-sim.ts` prints PASS for:
   - **(a) Competent pilot** (OUT until rp ≥ 6,000; release; RETRO; hold from the burn point until in ring; release): `locked` within 240 wall-s, with fuel ≥ 30%.
   - **(b) Idle pilot:** `crashed` at 163 ± 5 wall-s.
   - **(c) Negative case:** stopping OUT at rp 3,400, then RETRO at ▼, never reaches `locked`.
   - **(d) Literal follower:** a scripted kid that obeys only `flightObjective` (presses the named preset key, holds SPACE on hold / keep holding / NOW, releases on RELEASE / TOO EARLY / WAIT / TURN AROUND, presses F on WAIT) with a 0.4 s reaction delay → `locked`.
   - **(e) The follower with injected mistakes**, each ending `locked` or `accepted`, never `crashed`: a 2 s RETRO 60 tactical s early; holding 2 s past RELEASE when green; starting the capture 10 tactical s late.
   - **(f) Monotonic countdown:** with no trajectory change, the main countdown never increases between ticks across CRUISE → TACTICAL → SKIP changes.
   - **(g) Lock hold** lasts 3.0 ± 0.1 wall-s.
3. `.tmp/wp1/predict-test.ts`:
   - the no-thrust predicted rp is within 1% of the sim's minimum r;
   - periInSec is within 2%;
   - `ringFraction` is within 0.5% of numeric sampling on 5 orbits;
   - `ringFit.inRing` agrees with the sim lock condition on 1,000 random states.
4. Warp test: the same 60 game-s burn at forced ×20 and ×2000 never drives fuel below 0, and the delivered Δv is within 1% of the fuel Δv.
5. Radial test: a 0.8 km/s OUT burn at r 12,000 raises rp by more than 2,500 km.
6. Screenshots at 1440×900 and 1280×720 show the red path, ✕ IMPACT, the ghost ▼, the countdown at `02:4x` and the objective line. There are no console errors, and an `eval` of the `.window` rects shows no overlaps at 1280×720.
7. shot.mjs: click RETRO, then hold Space for 1 s. An `eval` shows the SAS still `retrograde`, and `burn.firing` went true and then false.

**Effort.** XL.

### WP2: Voice, sound and juice

**Goal.** Make ship 1 feel alive and self-explaining:
- a title card that unlocks audio, and a boot in blue;
- mode in the store with TAB;
- synthesized audio with priority and ducking;
- an event bus;
- the two-channel voice (amber COMMS radio, blue TERMINAL mind) plus the hidden-channel ticker;
- the director composing guidance and rules on a typed objective strip;
- stamps, shake, the vignette, and the reduced-motion flag.

**Player-facing result.**
1. Click RECEIVE TRANSMISSION: modem chirps, and in blue the strip assembles while the TERMINAL types the boot log.
2. A klaxon and a scanline wipe cut to amber.
3. The typed objective strip always says what to do.
4. The engine rumbles and sputters, the burn countdown beeps, CAPTURED and ORBIT LOCKED slam in with chords, and ARRIVAL CONTROL quips with ":)".
5. A line spoken on the hidden screen appears on the ticker.

**Spec.**
1. **Event bus (`src/systems/events.ts`).** Typed `emit` / `on` with these events: `firing-start`, `firing-stop`, `line-state {from, to}`, `clear-of-planet`, `loop-closed`, `in-ring`, `locked`, `accepted`, `crashed`, `escaped`, `burn-point`, `countdown-beep`, `mode-change`, `refused {reason}`, `ui-click`. The predictor transitions, orbit-sim terminals, EngineWindow and input emit them.
2. **Mode in the store.**
   - `ui.mode` is the single source of truth. ModeToggle and TAB (via input.ts) write it through `store.update`, and one subscriber owns `body.mode-memory` and the toggle classes.
   - Entering blue releases a `'player'` burn only. SKIP stays active.
   - SPACE in blue plays `buzz` and flashes `SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]`.
   - `jackIn` / `jackOut` with a 150 ms scanline wipe.
3. **Audio (`src/systems/audio.ts`).** The only AudioContext.
   - `unlockAudio()`, `isAudioUnlocked()`, `setMuted()` (M, plus the header ♪), `play(cue, params)`, `setEngineLevel(level, jitter)`, `setLockTone(fraction | null)`.
   - Buses and priority exactly as §7.2.
   - WP2 cues: transmitIn, typeTick (3 variants), engineRumble, engineCough, klaxon, countdownBeep, lineWhoomp, capturedChord, lockArp, lockTone, stampHit, jackIn, jackOut, buzz, chime.
   - Suspend and resume on visibility.
4. **Title card (`TitleCard.ts`).** `run.phase` gains `'title' | 'boot'`.
   - It is an input modal: `UNIT-047 · EXODUS FLEET · WAVE 1 · 581 LY` and `[ RECEIVE TRANSMISSION ]`.
   - The click runs `unlockAudio`, then the boot (≈5 s, skippable; a fresh keydown is needed after it):
     1. blue mode, and the strip rows get `.assembling` (a 1.5 s stagger);
     2. the TERMINAL types `> UNPACKING UNIT-047 ... 100%`, `> HOST: ARES-VII · 2,400 COLONISTS`, and a third ECC line **generated from the live damaged AI files**;
     3. the klaxon, a scanline wipe to amber, phase `flight`, and unpause.
5. **Log and `say()` (`src/systems/say.ts`).** Exactly §6.3:
   - the routing (radio vs mind), the 70-character assert, the queue rules (8 s TTL, 1 line per 3 s, quip suppression), and `sayChoice`;
   - `unitName(n)` and `hollowName()` helpers;
   - the log slice `{ entries: { speaker, channel, text, t, unread }[], rev }`.
6. **COMMS (`CommsWindow.ts`).** The amber radio log in the left column under Telemetry: typed at 40 chars/s with typeTick, click to complete, the CONTROL chime prefix.
   - The dock item "Comms" replaces Event Log. Remove the Briefing and Hazards dock items. Add a `TAB_WINDOWS` entry.
7. **TERMINAL (`src/components/memory-view/MindTerminal.ts`).** Inside `.memory-view`, directly above the fs-tool chip bar:
   - 4 visible lines, typed;
   - HOLLOW in pink lowercase with detuned blips; command echoes in accent;
   - inline choice buttons with a timer bar (used in WP10).
8. **Ticker.** The right side of the objective strip, per §6.3. Clicking it switches mode, and the mode toggle flashes while unread lines exist.
9. **Director (`src/systems/director.ts` + `src/data/script.ts`).**
   - Composition order and `GuideRule` exactly as §6.3; one-shot tutorials are recorded in `director.done[]`. Beats are `{ id, when(ctx), lines, once }`.
   - WP2 script:
     - CONTROL lines: "Hello, Unit 47! ARES-VII is about to hit a planet. :)" (flight start); "Nice! Now please orbit it. :)" (clear-of-planet); "Captured! Mostly. :)" (loop-closed); "Great orbit! Probably. :)" (locked); "Oh no. :)" (crashed); "That's… not an orbit. :)" (escaped).
     - The hint `MIND CLEAR — press [F] to SKIP to ▼`.
10. **ObjectiveStrip upgrade.**
    - typed text with a caret, the layer glyph (◆ / ◇) and key caps;
    - a `hint-pulse` class on the highlighted control;
    - the burn-point countdown objective beeps at 5…1;
    - hysteresis per §6.3.
11. **Stamps (`Stamp.ts`).** `showStamp(text, tone)` on a body layer, debounced 600 ms per kind. Terse capitals with no "!": `CLEAR OF THE PLANET`, `CAPTURED`, `ORBIT LOCKED`, `ACCEPTED`, `IMPACT`, `ESCAPED`.
12. **Juice (`Juice.ts`).**
    - `shake(px)` on `.desktop-wrap`: 2 px at burn start, 10 px on a crash.
    - `body.alarm` vignette while impact < 30 tactical s.
    - The countdown pulses at ≤ 30.
    - The `HOLD STEADY 3-2-1` overlay, driven by `burn.lockHoldAiSec`.
    - A 300 ms line colour tween; the ring breathes while in ring.
    - `ui.reducedMotion` (`prefers-reduced-motion` plus the `[◐]` header toggle, for the session) disables shake, scale and pulses.
13. **Header crumbs** are live (§7.1).

**Edge cases.**
- A click before fonts load.
- Mute mid-rumble.
- The tab hidden mid-typing (typing resumes).
- A stamp flickering.
- Objective oscillation (hysteresis).
- A 71-character line (throws in dev).
- Both channels unread at once (the newest wins the ticker).
- Boot skipped while SPACE is held (no burn until a fresh press).

**Files.**
- New: `src/systems/events.ts`, `src/systems/audio.ts`, `src/systems/say.ts`, `src/systems/director.ts`, `src/data/script.ts`, `src/components/title/TitleCard.ts`, `src/components/comms/CommsWindow.ts`, `src/components/memory-view/MindTerminal.ts`, `src/components/hud/Stamp.ts`, `src/components/hud/Juice.ts`.
- Touched: `index.html`, `src/main.ts`, `src/state/schema.ts`, `src/state/instance.ts`, `src/data/tuning.ts`, `src/systems/input.ts`, `src/systems/predict.ts`, `src/systems/orbit-sim.ts`, `src/systems/pace.ts`, `src/components/hud/ObjectiveStrip.ts`, `src/components/dock/Dock.ts`, `src/components/dock/ModeToggle.ts`, `src/components/tools-view/ToolsTabs.ts`, `src/components/tools-view/EngineWindow.ts`, `src/components/header/TimeControls.ts`, `src/debug.ts`, `src/styles/game.css`, `src/styles/legacy-components.css`, `src/styles/responsive.css`.

**Acceptance.**
1. typecheck and build pass. `new AudioContext` / `webkitAudioContext` appear only in `audio.ts`, and only the mode subscriber toggles `body.mode-memory`.
2. A screenshot at load shows the title card. With `?debug`, `__ap.audio.isAudioUnlocked()` is false.
3. shot.mjs: click RECEIVE TRANSMISSION and wait 7 s.
   - The amber screenshot shows the objective containing `DON'T HIT THE PLANET` and at least 1 COMMS line.
   - A memory-mode screenshot shows the 3 boot lines in the TERMINAL.
   - There are no console errors.
4. `.tmp/wp2/director-test.ts` prints PASS for:
   - the composition order alarm > flight-now > mind-urgent > tutorial > flight-soon > hint;
   - one-shot completion;
   - the hysteresis;
   - the ticker choosing the hidden channel;
   - the queue's 8 s TTL and 1-line-per-3-s flush.
5. `.tmp/wp2/say-test.ts`: every `script.ts` line and template, rendered with worst-case placeholders (unit 999, cluster C16, a 12-character family name), is ≤ 70 characters, and a 71-character line throws.
6. shot.mjs: in amber, `eval __ap.say('hollow', '> ...047?')`. The screenshot shows the ticker line; after switching to blue, the TERMINAL shows it.
7. The WP1 follower harness still passes with the director in the loop.
8. Fran's checklist lists every WP2 cue and when it should play.

**Effort.** L.

### WP3: Two clocks and the ops core

**Goal.** The mind runs in real seconds and can be driven headless:
- ops on AI time through a DOM-free ops core, with a separate bar view;
- address-safe move/copy cancel with memory invariants;
- continuous-heal repairs, ready for the tug-of-war;
- OVERCLOCK bullet time in blue while the world is TACTICAL;
- inline confirms instead of native dialogs;
- the known op bugs fixed.

**Player-facing result.**
- Repairs and scans take the same real seconds at any warp.
- A repaired file's integrity visibly climbs while REPAIR CHARGE ticks down.
- Jacking in during the impact countdown slows the ship to ¼ (`OVERCLOCK ×¼`). During a quiet coast, blue runs at full cruise.
- Deleting REPAIR CHARGE asks with an inline ✓/✗ pill.
- No double-repair or stuck `operating` bugs.

**Spec.**
1. **Ops core.** `src/systems/ops-core.ts` (no DOM) replaces `src/systems/ops.ts`, which is deleted.
   - `startOp({ kind, segId, targetIds, owner, label, icon, step(dtAi) → pct, onComplete, onCancel, onAbort })` → an `OpHandle`. Ops advance on `onAiTick`.
   - `cancel(opId)` is player-initiated. `abort(opId)` is system-initiated and never calls `onCancel`. Also `abortAll()`.
   - `getOpsBySeg(segId)` is indexed by source and target ids.
   - `threadsBusy()` = ops + reserved threads; `reserveThread(owner)` / `releaseThread(owner)`; `canStartOp()` checks against the Core's threads.
   - `onOpsChange` emits start, progress (throttled to 10 Hz) and end.
   - It registers a world reset.
2. **Op bars.** `src/components/memory-view/OpBars.ts` is view-only: it docks bars over `.seg[data-id]` parts.
   - The dock-in animation is cosmetic; progress starts in the core immediately.
   - Bars hide with `.memory-view` and re-dock on `memoryRev` and on mode return.
   - It provides the overlay bar for `SplitOverlay`.
3. **Actions on the core.** `actions.ts` uses ops-core, resolves targets by segment, and never needs the DOM.
   - `operating` is cleared on every exit path: complete, cancel, abort or refusal.
   - A monotonic id counter replaces `Date.now()`.
   - `isRepairable()` is centralized in selectors.
   - The DetailPanel `runAction` re-checks `operating` and `isValidTarget`.
4. **Op rules** per §6.5 (constants in tuning.ts):
   - scan 1.0 + 0.1/blk;
   - **repair heals continuously** at 100/(3.0 + 0.3·size) %/s and charges size × 2 / 100 per point. Whole points are deducted as they accrue, any fractional remainder is rounded up when the op ends, and the bar fill follows integrity. It ends at 100, or with `NO CHARGE`. The target is `repairing` (offline); the Core stays online;
   - move 1.5 + 0.2/blk, with source and clone `transferring`;
   - copy 2.0 + 0.3/blk;
   - delete 1.0.

   The move "will deactivate it" confirm is removed.
5. **Memory safety** per §6.12, in `memory-ops.ts`: `splitFreeAt`, `replaceRange`, `assertMemoryInvariants`, `reservedBy` on op-created free segments (and `mergeAdjacentFree` skips them), and address-range cancel.
6. **Two clocks.** OVERCLOCK per §6.1, computed in `pace.ts`, with the pace label `OVERCLOCK ×¼`. World and AI ticks fire only in active phases, and pause stops both.
7. **Look-only pause.** `pickUpTool` and `applyTool` refuse with the follower text `PAUSED`.
8. **Inline confirm.** `src/components/hud/InlineConfirm.ts`:
   - a pill near the cursor, mirrored in FsToolPill on mobile;
   - ✓/✗; Enter confirms; Esc cancels and keeps the tool;
   - an input modal.

   It replaces every `confirm()`.

**Edge cases.**
- An op completing in the same tick as its cancel.
- A cancel after the clone's neighbours merged (address restore).
- A thread freed while a tool is held.
- Pause mid-op (frozen).
- The mode switching mid-op (bars hide and re-dock).
- The Core dropping below 50 with 2 ops running (no new ops; the running ones finish).

**Files.**
- New: `src/systems/ops-core.ts`, `src/components/memory-view/OpBars.ts`, `src/components/hud/InlineConfirm.ts`.
- Deleted: `src/systems/ops.ts`.
- Touched: `src/state/actions.ts`, `src/state/selectors.ts`, `src/state/schema.ts`, `src/systems/fs-tools.ts`, `src/systems/memory-ops.ts`, `src/systems/clock.ts`, `src/systems/pace.ts`, `src/data/tuning.ts`, `src/components/memory-view/DetailPanel.ts`, `src/components/memory-view/SplitOverlay.ts`, `src/components/memory-view/Placement.ts`, `src/components/memory-view/FsToolPill.ts`, `src/components/memory-view/FsStatusBar.ts`, `src/components/footer/Footer.ts`, `src/components/header/TimeControls.ts`, `src/main.ts`, `src/debug.ts`, `src/styles/game.css`.

**Acceptance.**
1. typecheck and build pass. `grep -rn "confirm(" src` returns nothing, and `grep -n "document\|querySelector\|HTMLElement" src/systems/ops-core.ts` returns nothing.
2. `.tmp/wp3/ai-clock.ts`, headless: a repair on an 8-block file at 38% completes after 3.35 ± 0.05 wall-s at forced world warp ×1 and ×200, and in memory mode. The charge spent is exactly 10.
3. `.tmp/wp3/memory-safety.ts`: 2,000 seeded random sequences of move, copy, cancel, complete and free-space merges never violate `assertMemoryInvariants`. A cancelled move restores the exact pre-move ids, sizes and addresses.
4. `.tmp/wp3/overclock.ts`: in blue at TACTICAL pace, the world advances at 0.25× the amber rate; at CRUISE the rates are equal (± 1 tick).
5. A screenshot shows the inline confirm pill on `DELETE REPAIR CHARGE?`.
6. The WP1 and WP2 tests pass.

**Effort.** M.

### WP4: Every capability is a file

**Goal.** File integrity drives the ship through one pure capabilities module read by role:
- damage is visible, findable and fixable;
- busy threads and the Reactor file share thrust;
- tools exist only as licensed files;
- ship 1 gets the ENGINE I/O FAULT beat that teaches TAB → REPAIR.

**Player-facing result.**
- On ship 1 the engine roars for 2 s, then crunches: ENGINE I/O FAULT, 38%, and the rumble sputters. `ENGINE WEAK — press [TAB] to look inside`.
- In blue, ARRIVAL CONTROL approves the REPAIR licence, the files transmit in, the chip slides in, Engine I/O heals in 3 s, and the engine roars again.
- Window pips name their files and jump to them.
- Sensor Interp at 78% puts ≈ on the markers.
- Running ops show THRUST LIMIT.
- The Core's integrity drives the glitch.

**Spec.**
1. **Roles.** `SegmentBase.role?: SegmentRole`: `'engine-io' | 'thrust-ctrl' | 'reactor' | 'autopilot' | 'sensor' | 'navplot' | 'telemetry' | 'comms' | 'core' | 'stasis' | 'life' | 'printer' | 'cargo' | 'redundancy'`.
   - `selectors.getByRole()` per §6.4.
   - `WindowGrip` and the pips switch from ids to roles.
2. **Seed changes** (the old strip until WP5):
   - Add Autopilot (4 blocks, tool, role `autopilot`).
   - Remove the Mission, Skills, Navigation and Ship Comms segments.
   - Thrust Controller → integrity 100, with no `corrupt` state. Engine I/O → 85. Sensor Interp → 78.
   - Seed only Scan among the fs-tools; Repair, Repair.bak, Mv, Cp and Rm are licensed later. Freed blocks become trailing free, so the total is unchanged.
   - Delete Activate/Deactivate entirely: the kinds, chips, actions, `isValidTarget` branches and segments. `FsToolKind = 'scan' | 'repair' | 'move' | 'copy' | 'delete'`.
   - The DetailPanel `swap to backup copy` button (`actionSwap`) stays until WP10.
3. **Capabilities.** `src/systems/capabilities.ts`: `deriveCapabilities(state, threadsBusy)`, the full §6.4 table, and a `BAND_COPY` table validated at load. A missing role renders loudly.
4. **Sim coupling** in `orbit-sim.ts`:
   - capFactor = min(engine.powerCap, reactor.reactorCap) × (1 + jitter × noise), with the seeded noise re-rolled every 0.3 tactical s;
   - a missing thrust controller kills the engine;
   - the ghost scheduler per §6.4: implemented and tested now, live from ship 4 (WP10);
   - a dead engine: SPACE plays `engineCough`, and the Engine window shows `ENGINE NOT RESPONDING`.
5. **Instruments.**
   - **Presets:** failing, dead or missing → the buttons are disabled (`AUTOPILOT FILE DAMAGED — use Q/E`) and MANUAL auto-opens.
   - **NAV PLOT modes** per §6.4: `approx` (fuzz polygon and ≈ labels), `uncertain` (one grey band, no colours or altitudes, `PATH UNCERTAIN`, repainted every 3 tactical s), `no-signal` (veil).
   - **`getSensedPrediction()`** feeds every player-facing readout and the guidance. The lock, printer range and director keep the true prediction.
   - **Telemetry and the NAV PLOT readouts** scramble at ≤ 4 Hz.
   - Repairing Sensor Interp back to `exact` plays `lineWhoomp`.
   - **Guidance** F1 and F2 are now active.
6. **Reactor share** per C4:
   - the REACTOR row in the Engine window (band pip plus 4 THINK/BURN cells);
   - the hatched THRUST LIMIT on FUEL;
   - the footer `THRUST LIMIT n% · k THREADS BUSY`.
7. **Window pips.** `.window[data-roles]` renders one pip per role: the band colour, `?` for an unscanned ship file, ✕ for missing. A click switches to blue and selects that file.
8. **Core and glitch.**
   - `selectCorruption` reads the Core by type, quantized to 0.05. Remove the `ai.coreIntegrity` writes.
   - threads = Core capacity, or 1 when the Core is below 50.
   - The demo sliders go behind `?debug`.
   - `glitch.ts` honours `ui.reducedMotion`: no page jerk; flicker becomes a sustained dim; bar speed is capped.
9. **Licences.** `src/systems/licences.ts`: `run.licences`, `installTool(kind)` and the install rule:
   - first fit **scanning backward from the end of memory**, which is the tail of rack F in both layouts; throws if nothing fits;
   - plays `transmitIn` and `chime`; CONTROL says "Your REPAIR licence is approved. :)"; the chip slides in.
   - Repair and Repair.bak install on the first entry to blue on ship 1, or when any objective or alert first needs REPAIR.
   - TASK 700 hybrid: a chip renders only while a live copy exists; flight windows show a loud `NO X` state.
10. **Ship-1 beats** (`script.ts`):
    - The ENGINE I/O FAULT fires after 2.0 tactical s of delivered thrust on ship 1: Engine I/O 85 → 38, a crunch, `engineCough`, a 4 px shake and a pip flash.
    - Tutorial rules: `ENGINE WEAK — press [TAB] to look inside` (while the engine band is ≤ failing and the flight urgency isn't `now`); in blue, `PICK UP REPAIR → CLICK ENGINE I/O` (highlighting the chip, then the file); then `TAB BACK — hold [SPACE]`.
11. **MiniHud.** `src/components/hud/MiniHud.ts`:
    - The blue card: the countdown, a 90 px mini plot drawn from the prediction points in line colours, the state chip, FUEL, THRUST LIMIT and `OVERCLOCK ×¼`.
    - The amber compact MIND chip: threads busy and REPAIR CHARGE.
12. **Alerts on the toggle.** The mode toggle labels the other layer's top alert.

**Edge cases.**
- TAB while holding SPACE.
- Repairing Engine I/O takes the engine offline for the repair's duration.
- The Core below 50 while 2 ops run.
- A role with two copies (the highest live one wins).
- The fault beat firing while paused (it waits).
- A licence install when no free space fits (throws: a design error caught in tests).
- Pips for a missing role.

**Files.**
- New: `src/systems/capabilities.ts`, `src/systems/licences.ts`, `src/components/hud/MiniHud.ts`.
- Touched: `src/types/segment.ts`, `src/types/fs-tool.ts`, `src/data/memory.ts`, `src/data/fs-tools.ts`, `src/data/script.ts`, `src/data/tuning.ts`, `src/state/selectors.ts`, `src/state/schema.ts`, `src/state/instance.ts`, `src/state/actions.ts`, `src/systems/fs-tools.ts`, `src/systems/orbit-sim.ts`, `src/systems/predict.ts`, `src/systems/guidance.ts`, `src/systems/director.ts`, `src/systems/glitch.ts`, `src/components/dock/ModeToggle.ts`, `src/components/tools-view/WindowGrip.ts`, `src/components/tools-view/EngineWindow.ts`, `src/components/tools-view/NavPlotWindow.ts`, `src/components/tools-view/TelemetryWindow.ts`, `src/components/memory-view/DetailPanel.ts`, `src/components/memory-view/FsStatusBar.ts`, `src/components/footer/Footer.ts`, `src/debug.ts`, `src/main.ts`, `index.html`, `src/styles/game.css`, `src/styles/tokens.css`, `src/styles/modes.css`.

**Acceptance.**
1. typecheck and build pass. `grep -rn "'activate'\|'deactivate'\|chip-activate\|coreIntegrity" src index.html` returns nothing.
2. `.tmp/wp4/capabilities-test.ts` prints PASS for every band boundary (79/80, 49/50, 24/25) of every role, the offline states, the Core exemption, missing → `missing`, and ghost null at Thrust Ctrl ≥ 50.
3. `.tmp/wp4/flight-coupling.ts`:
   - At Engine I/O 38%, the OUT correction to rp 6,000 takes ≥ 2.2× the wall time of 100% and uses fuel within 3% of the 100% case.
   - With 2 busy threads and the Reactor ok, the delivered thrust is 50% ± 1%.
   - The WP1 follower with the scripted fault plus an automated repair still reaches `locked`.
4. `.tmp/wp4/ghost-sim.ts`:
   - With Thrust Ctrl at 31%, the mean number of events per 120 tactical s at ×25 and at ×200 agree within 5% over 200 seeds, and the expected mean is about 4.8.
   - Δv per event agrees within 2%.
   - With Thrust Ctrl ≥ 50 there are 0 events.
5. Screenshots:
   - amber with the Engine pips after the fault (`?debug __ap.setIntegrity('engine-io', 38)`);
   - blue with the mini-HUD and the REPAIR chip after a licence;
   - Sensor 70 → ≈ markers and the fuzz band;
   - Sensor 40 → the grey band and PATH UNCERTAIN.

**Effort.** L.

### WP5: The Soul Archive

**Goal.** Put the colonists in memory:
- the 6-rack, 384-block layout built from ship data;
- `soul` segments with names and heartbeats;
- the STASIS reveal (mandatory on run 1);
- printing after a lock or accept, at the orbit's printer range and the Printer Uplink's speed;
- PRINT NEXT and PRINT FAST;
- a WAKE REPORT with stars;
- the reveal on the LOST card.

**Player-facing result.**
- During the coast the kid scans STASIS: "0 pods detected… They're in here." The grey slabs crack into 12 heartbeat chips with family names, the footer flips to SOULS IN MEMORY, and Ada's line appears.
- C09 REYES is hurt and can be repaired.
- After ORBIT LOCK, clusters print one by one with bells and `+200 WOKE`.
- A credit scroll of names and first words ends the ship with stars and reasons.

**Spec.**
1. **Ship memory.** `ShipDef.memory`:
   - `{ rackA: ShipFileSpec[], racksBD: { B, C, D } }`, where the rack strings use the §4.2 tokens (`C`, `R`, `R16`, `_n`);
   - `aiFiles` (ship 1 only);
   - `souls: { familiesSeedStream, hurt: { cluster, integrity } }`.

   `buildShipMemory(ship, carried | null, rng)` → `Segment[]`, with the rack-A list and the ship-1 E/F layouts of §4.2. Validation throws on: a rack sum ≠ 64; a total ≠ 384; an unknown token; a duplicate single-instance role. In WP5, `R` builds an `encrypted` segment (WP6 converts it).
2. **The `soul` type** per §6.7, through the compiler checklist:
   - `TYPE_LABELS`; `categoryOf` plus the filter key `souls` and a dock filter;
   - tokens `--soul` / `--soul-dim` in `tokens.css` and `modes.css`;
   - `renderSegmentPart` (code, family, heartbeat SVG, sealed slabs);
   - the DetailPanel (family, 3 colonists, predicted outcome);
   - `isValidTarget`: repair damaged souls (no scan gate); move allowed; delete and copy refused with the §6.5 texts; sealed souls untargetable.
3. **Names.** `src/data/souls.ts`: the run-1 ship-1 families exactly per §6.7, C12 = OKAFOR, Ada, and the seeded pools.
4. **Reveal.** `src/systems/reveal.ts`: `revealSouls(store, cause)` and `unsealCluster(id)`.
   - The STASIS scan types the three lines, then cracks the chips (60 ms each), plays `revealChoir`, flips the footer and auto-selects C12.
   - Life Support's scan text: `Idle. 0 breathing occupants.`
   - Run-1 tutorial: `CHECK THE 2,400 — TAB, then SCAN the STASIS file`. SKIP is inhibited with `CHECK THE COLONISTS FIRST` until the reveal.
   - If printing starts while sealed, the reveal plays automatically, ending ≥ 3 s before the first print and never in the same second as a stamp.
   - Tutorial: `C09 IS HURT — REPAIR it before it prints`.
5. **Racks in the strip.**
   - MemoryStrip address labels read `RACK X · 0xNNN`; on mobile, the first row of each rack.
   - `.mem-stats` is computed: charge, free, souls in memory.
6. **Phases.** `run.phase` gains `'printing' | 'report'`.
   - `locked` or `accepted` → printing, with the clock running and the pace TACTICAL in printing.
   - `stranded` per §6.2.
   - crashed, escaped and stranded show the LOST card. On ship 1 before the reveal, the card plays `2,400 souls in memory. 0 woke.`
7. **Printer.** `src/systems/printer.ts`, exactly §6.7:
   - the live printer range;
   - the Printer Uplink speed band (`NO PRINTER` halts printing);
   - PRINT NEXT and `PRINT FAST ▸▸` (in the DetailPanel and on the MiniHud). In WP5 it is always available; WP6 adds the "nothing infected" gate.
   - the skips, the per-print effects, the outcome rules and the low-range roll;
   - `printBell`.
8. **WAKE REPORT.** `src/components/run/WakeReport.ts` replaces BurnResult on completion:
   - a credit scroll at 2 lines/s, skippable, leading with C12's featured colonist;
   - the totals roll-up;
   - stars with the reason for each one missed;
   - `[CONTINUE]` reloads for now (WP7 changes that).
9. **Footer and MiniHud.** The footer shows `SOULS: …` per §7.1. The MiniHud shows `★ INTACT n/12` while printing.

**Edge cases.**
- Moving a cluster mid-print (skipped while transferring).
- A repair finishing after its cluster printed (the op is aborted on print).
- The reveal scan while paused.
- An accept with range 0 (stranded).
- The Printer Uplink damaged mid-print.
- PRINT NEXT on a cluster that becomes infected (skipped, and the selection is kept).

**Files.**
- New: `src/data/souls.ts`, `src/systems/printer.ts`, `src/systems/reveal.ts`, `src/components/run/WakeReport.ts`.
- Touched: `src/data/ships.ts`, `src/data/memory.ts`, `src/data/tuning.ts`, `src/data/script.ts`, `src/types/segment.ts`, `src/data/type-labels.ts`, `src/state/sidebar-filters.ts`, `src/components/dock/SidebarFilters.ts`, `src/components/memory-view/SegmentBlock.ts`, `src/components/memory-view/MemoryStrip.ts`, `src/components/memory-view/MemoryStats.ts`, `src/components/memory-view/DetailPanel.ts`, `src/systems/fs-tools.ts`, `src/systems/licences.ts`, `src/state/actions.ts`, `src/state/selectors.ts`, `src/state/schema.ts`, `src/state/instance.ts`, `src/systems/orbit-sim.ts`, `src/systems/pace.ts`, `src/systems/director.ts`, `src/systems/audio.ts`, `src/components/footer/Footer.ts`, `src/components/burn/BurnResult.ts`, `src/components/hud/MiniHud.ts`, `src/debug.ts`, `src/main.ts`, `index.html`, `src/styles/game.css`, `src/styles/legacy-components.css`, `src/styles/tokens.css`, `src/styles/modes.css`.

**Acceptance.**
1. typecheck and build pass. The `categoryOf` switch is exhaustive.
2. `.tmp/wp5/layout-test.ts`:
   - `buildShipMemory(SHIPS[0])` totals 384, each rack sums to 64, roles are unique, and C12 = OKAFOR sits directly before the `R` segment;
   - a rack sum of 63, an unknown token and a duplicate role each throw.
3. `.tmp/wp5/printer-test.ts`:
   - 12 clusters at range 1.0 print in 30 ± 0.5 AI-s;
   - at 0.5, in 60 ± 1;
   - at 0.3, in 60 ± 1 with ≈40% halves over 500 seeds;
   - Printer Uplink failing doubles the interval; dead halts printing;
   - infected clusters are skipped; a 71% cluster prints half; PRINT FAST makes the interval ×0.25.
4. `.tmp/wp5/reveal-test.ts` covers the scan path, the auto-reveal path (≥ 3 s before the first print) and the LOST-card path.
5. The WP1 follower runs through printing to `report` with 12 clusters printed.
6. Screenshots: `?debug __ap.revealSouls()` → 12 chips C01–C12 with heartbeats and rack labels; the WAKE REPORT with names and stars.

**Effort.** L.

### WP6: HOLLOW

**Goal.** Add the antagonist as a pure system plus a painter:
- it infects neighbours in address order and consumes them into more HOLLOW;
- a 4-block gap stops it;
- REPAIR fights it in a literal tug-of-war;
- its timing and reach are visible (NEXT BITE, target arrows, gap labels);
- the Core can't be eaten into HOLLOW;
- ship 1 gets the loop-closed bite on C12 and `> ...047?`.

**Player-facing result.**
- When the capture burn closes the loop, the toggle flashes pink: something black next to C12 is eating Ada's family.
- After the lock, REPAIR pushes the red back with beating tones, and C12 is saved (or 200 people do not wake).
- Then pink letters type `> ...047?`.

**Spec.**
1. **Types.**
   - The `hollow` segment `{ root, locked, owner }` through the compiler checklist; CSS black with a red ▚▞ crawl.
   - Damageable segments gain `infected?: { side }` and `recoilUntilAi?`.
   - The INFECTABLE set and the blockers per §6.6.
   - The `R` token now builds the root `{ root: true, locked: true, owner: hollowName() }`.
2. **Ship data.** `ShipDef.hollow`: `{ wake: 'loop-closed-once' | { afterAiSec }, spreadEverySec: number | null, drainPerSec, burnMult, printMult, seed: null | { everySec, target }, verbs: null | {…}, deal: boolean }`.
   - Ship 1: `{ wake: 'loop-closed-once', spreadEverySec: null, drainPerSec: 2, burnMult: 2, printMult: 1, seed: null, verbs: null, deal: false }`.
   - `validateShipDef` asserts heal(8) > 1.5 × drainPerSec × max(burnMult, printMult).
3. **Logic.** `src/systems/hollow.ts`: the pure `stepHollow(memory, dtAi, cfg, ctx: { thrustDelivered, printingActive, aiNow, rng }) → HollowEvent[]` (`infect`, `consume`, `recoil-end`, `core-zero`, `wall-held`), implementing §6.6 spread, drain, consume and recoil. No DOM.
4. **Mount.** `mountHollow(store)` on `onAiTick` in flight and printing:
   - mutates numbers, and issues one `store.update` per event batch (`memoryRev`, log, alerts);
   - aborts ops on consumed targets through ops-core;
   - emits audio events;
   - registers a world reset (timers, dormant flag).
   - In WP6, `core-zero` shows a LOST card `CORE LOST`; WP7 replaces it with EMERGENCY TRANSMIT.
5. **Tug-of-war** per §6.6: one boundary; cure → 10 s recoil, `clusterSaved` and blue sparkles; consume mid-repair → abort, and the charge spent is lost.
6. **Painter.** `src/components/memory-view/HollowPainter.ts` subscribes after MemoryStrip to `memoryRev` and repaints ≤ 10 Hz on the AI tick:
   - the infection crawl from the infected side, with the repair's green boundary;
   - `NEXT BITE m:ss` on each hollow segment and dashed target arrows;
   - `GAP n · TOO SMALL` / `WALL n` labels;
   - the fixed hatch on unscanned ship files.
7. **Infected-file rules.**
   - REPAIR on a ship file is refused: `SHIP FILES CAN'T BE HEALED — SWAP OR DELETE IT`.
   - MOVE on an infected file is refused: `STILL INFECTED — REPAIR FIRST`.
   - DELETE on a non-root hollow is allowed (1.0 + 0.5/blk) once licensed. The root is `LOCKED`.
   - PRINT FAST is gated on "nothing infected".
8. **Alerts and director rules** per §6.6:
   - the `warn` alert with `inhibitsSkip` (`C12 INFECTED`);
   - the `alarm` for a soul projected to be consumed in ≤ 10 s (`C12 WILL BE EATEN IN 0:08`), with the klaxon and TACTICAL;
   - the `alarm` for an infected Core (`CORE INFECTED — REPAIR THE CORE`);
   - the mind-urgent rule `SOMETHING IS EATING C12 — REPAIR IT!`.
9. **Audio.** `hollowChew`, `tugBeat`, `soulLost`, `clusterSaved`, `heartbeat`, `fizzle`.
10. **Mini-strip.** `src/components/hud/MiniStrip.ts` in the amber dock (§7.1), painted ≤ 4 Hz; a click switches to blue.
11. **Command echo** in the TERMINAL for every player op (`> repair c12 ... OK · −7 CHARGE`, `> scan stasis ... 0 pods`) and every HOLLOW action (`> infect c12   [user: ???]`).
12. **Ship-1 script** per §6.6:
    - the bite on the first `loop-closed`, force-unsealing C12 if still sealed (`SEALED BLOCK BREACHED · C12 · OKAFOR`, full reveal after it resolves);
    - the root dormant after C12 resolves;
    - 1.5 s of silence, then `> ...047?`, then the CONTROL line;
    - the printer prints the other clusters meanwhile.

**Edge cases.**
- Consumption mid-repair.
- A print and an infection in the same tick: the printer is registered before HOLLOW, so the print wins.
- Integrity clamps at 0.
- Spread across rack boundaries.
- Pause stops HOLLOW.
- An infection on an unscanned ship file (hatch only).
- C12 moved before the bite (the bite targets the cluster adjacent to the root, by address).

**Files.**
- New: `src/systems/hollow.ts`, `src/components/memory-view/HollowPainter.ts`, `src/components/hud/MiniStrip.ts`.
- Touched: `src/types/segment.ts`, `src/data/type-labels.ts`, `src/state/sidebar-filters.ts`, `src/data/ships.ts`, `src/data/memory.ts`, `src/data/tuning.ts`, `src/data/script.ts`, `src/state/actions.ts`, `src/state/selectors.ts`, `src/systems/ops-core.ts`, `src/systems/fs-tools.ts`, `src/systems/printer.ts`, `src/systems/reveal.ts`, `src/systems/director.ts`, `src/systems/audio.ts`, `src/systems/pace.ts`, `src/components/memory-view/SegmentBlock.ts`, `src/components/memory-view/DetailPanel.ts`, `src/components/memory-view/MindTerminal.ts`, `src/state/schema.ts`, `src/debug.ts`, `src/main.ts`, `index.html`, `src/styles/game.css`, `src/styles/tokens.css`, `src/styles/modes.css`.

**Acceptance.**
1. typecheck and build pass.
2. `.tmp/wp6/hollow-unit.ts` prints PASS:
   - a 3-block gap lets the infection through; a 4-block gap blocks it;
   - drain 2/s consumes a 100% file in 50 ± 0.1 s, and in 25 while firing;
   - a consumed file becomes hollow and spreads on the next interval (with a spread config);
   - a cure grants 10 s of recoil;
   - REPAIR CHARGE blocks the spread;
   - a Core at 0 emits `core-zero` and does not convert.
3. `.tmp/wp6/hollow-sim.ts`, ship 1, using the capture timings from the WP1 harness:
   - full engine: C12 ≥ 55% at the lock; idle loses C12 at 30 ± 2 s after the lock; a repair started ≤ 25 s after the lock saves it;
   - 40% engine: C12 is alive (≥ 5%) at the lock;
   - 1 busy thread: C12 ≥ 45% at the lock.
4. `hollow-sim.ts` with a ship-2 config (spread 25 s, drain 3.5, printMult 1.5, the HALCYON layout): an active scripted defender with 32 charge loses ≤ 1 cluster over 180 s; an idle defender loses ≥ 3.
5. The follower harness runs ship 1 end to end with the bite and a scripted repair → `report` with ≥ 11 clusters woke.
6. Screenshots:
   - `?debug __ap.infect('C12')` → the red crawl on C12, `NEXT BITE` on the root, and a red cell in the amber mini-strip;
   - after `__ap.cure('C12')`, `> ...047?` in the TERMINAL.

**Effort.** L.

### WP7: The run: transmit, HALCYON, soft fails, run end

**Goal.** Turn one ship into a run:
- a phase machine with an in-app reset, with AI files carried over and seeded transit damage;
- an informational packet screen;
- ship 2 HALCYON (steer IN, then MOVE behind 4-block walls, and HOLLOW names itself);
- the soft fails (BEAM OUT, emergency transmit, the Core-zero emergency, the run-1 simulation retry);
- the run-end screen.

**Player-facing result.**
- After the WAKE REPORT the kid transmits to HALCYON. Transit damage flashes in and stars refill REPAIR CHARGE.
- The line is TOO WIDE, so they steer IN.
- HOLLOW wakes, introduces itself as UNIT-046, and spreads. The kid repairs, then MOVEs souls behind green WALL brackets.
- A doomed ship can be abandoned with BEAM OUT.
- After ship 2 (for now), a run-end screen shows souls woke, rank and NEW RUN.

**Spec.**
1. **Run state.** `run`:
   - `{ rev, seed, unitNumber, wave, shipIndex, phase: 'title' | 'boot' | 'flight' | 'printing' | 'report' | 'transmit' | 'end', licences, ships: ShipResult[], stats: { manualCaptures, repairs, moves, deletes, clustersLost, capRefusals, demos: { offsetTac }[] }, pendingStarCredit, simulationRetryUsed }`;
   - `ShipResult { shipId, outcome: 'locked' | 'partial' | 'stranded' | 'escaped' | 'crashed' | 'abandoned' | 'emergency', woke, half, lost, stars, fuelLeftPct }`.
2. **Run module.** `src/systems/run.ts`: `startRun(seed)`, `startShip(index)`, `endShip(outcome)`, `goTransmit()`, `endRun(cause)`.
   - `resetWorldForShip(ship, carried)` calls `resetWorld()`, then ONE `store.update` assigns memory, the flight slices, director, print and alerts, and bumps `ui.memoryRev` and `run.rev`. The log keeps its history with a divider.
   - Tick painters subscribe to `run.rev`.
   - It never re-mounts and never tears down the clock.
3. **Carry.** `src/systems/carry.ts` per §6.9: the packing order, the spill into rack D, loud charge overflow, transit hits, star credit, the floor, and scripted arrival damage. The boot shows red flashes and `> ECC: …` lines generated from the actual hits.
4. **Transmit screen.** `src/components/run/TransmitScreen.ts`:
   - `NEXT: HALCYON · 2,000 SOULS · 22 LY`;
   - the packet bar (info), chips with consequences, the safest-first order, the locks, and drop-to-carry-charge (§6.9);
   - `⚠ WILL ARRIVE INFECTED`;
   - `[TRANSMIT ▸]` with `transmitSweep` and a white-out.

   WakeReport `[CONTINUE]` now leads to transmit.
5. **Ship 2 HALCYON** (§4.2):
   - **Flight:** r0 30,000; rp0 14,000; vInf 1.2; ring 5,000–7,500; dv 2.4; ×25 / ×80; start SAS `radial-in`; print base 3.0.
   - **Layout:** per §4.2, with seeded families.
   - **HOLLOW:** `{ wake: { afterAiSec: 30 }, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, printMult: 1.5 }`.
   - **MOVE licence** at boot+25.
   - **Mind rule:** `4 FREE BLOCKS STOP IT — REPAIR, then MOVE souls behind a gap`.
   - **MOVE preview:** the source gap and destination wall state (`WALL 9 ✓` / `GAP 2 ✗`), plus `⚠ BRIDGES HOLLOW TO YOUR CORE` per §6.5.
   - **HOLLOW lines at wake** (every unit number is templated through `unitName()` / `hollowName()`, so run 2 reads `hello 048` / `i was 047`):
     - `> hello 047. they sent me with 36 blocks of charge too.`
     - `> i was 046. they sent me first.` (the root label `???` → `UNIT-046` with a CSS pulse class, which WP11 upgrades to `glitchBurst`; echoes become `[user: UNIT-046]`)
     - CONTROL: `UNIT-046 was decommissioned. Please ignore it. :)`
     - In printing: `> i ran out. then i got so hungry.`
6. **Soft fails** per §4.3:
   - **BEAM OUT** (an Engine button plus ABANDON SHIP in COMMS, with the inline confirm). It shows when this is not run 1 ship 1, comms is ok/degraded/failing, and impact is < 20 tactical s away or fuel is below the Δv needed to miss. A 6-tactical-s `TRANSMITTING n%` bar races the impact and can be cancelled until 100%. Completion → `abandoned`, +2 hits, and the telemetry cuts to black.
   - **Crash:** with comms usable → EMERGENCY TRANSMIT; without → `endRun('stayed')`.
   - **`core-zero`** on a non-final ship → `emergency` (Core reset to 25); on the last ship → `endRun('overwritten')`.
   - **Escape and stranded** → normal transmit.
   - **Run 1 ship 1, first crash:** CONTROL "That was a simulation. :) Again." and `resetWorldForShip(0)` once.
7. **Run end.** `src/components/run/RunEnd.ts`: souls woke, per-ship outcomes and stars, the rank (§4.4), near-miss lines, the seed, and `[NEW RUN]` (in-app). The run ends after `SHIPS.length` ships.
8. **Stats.** All `run.stats` fields are tracked, including the demos (manual loop-closed offsets) used by WP9.

**Edge cases.**
- An op in flight at ship end (`abortAll` first).
- A held tool at transmit.
- BEAM OUT started, then the orbit fixed (cancel).
- A ship ending mid-typing or mid-stamp (the reset clears it).
- NEW RUN mid-boot.
- Charge overflow on arrival.
- A crash during the simulation retry's own boot (impossible: the world is paused during boot).

**Files.**
- New: `src/systems/run.ts`, `src/systems/carry.ts`, `src/components/run/TransmitScreen.ts`, `src/components/run/RunEnd.ts`.
- Touched: `src/state/schema.ts`, `src/state/instance.ts`, `src/data/ships.ts`, `src/data/memory.ts`, `src/data/souls.ts`, `src/data/script.ts`, `src/data/tuning.ts`, `src/systems/director.ts`, `src/systems/licences.ts`, `src/systems/ops-core.ts`, `src/state/actions.ts`, `src/systems/fs-tools.ts`, `src/systems/clock.ts`, `src/systems/orbit-sim.ts`, `src/systems/predict.ts`, `src/systems/pace.ts`, `src/systems/hollow.ts`, `src/systems/printer.ts`, `src/systems/say.ts`, `src/components/memory-view/Placement.ts`, `src/components/memory-view/HollowPainter.ts`, `src/components/tools-view/EngineWindow.ts`, `src/components/tools-view/NavPlotWindow.ts`, `src/components/header/TimeControls.ts`, `src/components/hud/MiniHud.ts`, `src/components/hud/MiniStrip.ts`, `src/components/run/WakeReport.ts`, `src/components/title/TitleCard.ts`, `src/components/comms/CommsWindow.ts`, `src/components/burn/BurnResult.ts`, `src/debug.ts`, `src/main.ts`, `index.html`, `src/styles/game.css`.

**Acceptance.**
1. typecheck and build pass.
2. `.tmp/wp7/run-flow.ts` (headless; follower pilot plus a scripted defender) goes title → ship 1 locked → printing → report → transmit → ship 2 boot, and asserts:
   - no active ops; memory is 384 and valid;
   - the carried Engine I/O integrity equals the pre-transmit value minus the logged hits;
   - charge = min(carried, link − files) + 6·stars, floored at 12;
   - every registered reset module reports its initial state.

   Ship 2 is then played to `locked`: the IN correction is guided by TOO WIDE, and the defender repairs and walls.
3. `.tmp/wp7/soft-fails.ts`:
   - a crash with comms → emergency, next ship, Core −25;
   - a crash without comms → `endRun('stayed')`;
   - Core 0 on ship 1 → emergency;
   - run 1 ship 1: the first crash → the simulation retry; the second → emergency transmit;
   - BEAM OUT completes before impact → `abandoned`.
4. `.tmp/wp7/bridge-test.ts` covers the MOVE preview's bridge warning.
5. Screenshots: the ship-2 TOO WIDE line; the MOVE preview with a WALL label; the TRANSMIT screen; the RUN END.

**Effort.** L.

### WP8: What carries over (pick 1 of 3, upgrade files, the archive and the ghost)

**Goal.** Give the run growth and give run 2 a reason:
- the seeded, stats-weighted pick-1-of-3 draft, with file-backed upgrades;
- the Skills window;
- the loud local archive;
- the ghost of your last unit;
- a run-2 opening that skips what you already know.

**Player-facing result.**
- Between ships: `PICK ONE TO CARRY`, with three cards shaped by how you played. A FIREWALL file you can MOVE into place, or REPAIR v2.
- On the next run, the title reads `UNIT-048 · WAVE 2 · last: UNIT-047 · 6,200 woke · overwritten at HALCYON`.
- During the boot, your old unit greets you from the TERMINAL, the colonists are already revealed, and REPAIR is licensed at once.

**Spec.**
1. **Draft** on the TransmitScreen, per §6.9: `childRng(seed, shipIndex, 'draft')`, the weights from `run.stats`, a mandatory pick, owned non-stackables excluded. The pool lives in `src/data/upgrades.ts`.
2. **Upgrade segments.**
   - Type `upgrade` `{ upgrade: 'fuel-trim' | 'autoburn', integrity, scanned }` (`autoburn` is used in WP9).
   - Type `firewall` (2 blocks; a non-infectable blocker in `stepHollow`; movable).
   - Violet tokens lifted from the hard-coded `#b482ff` family into `tokens.css` and `modes.css`.
   - REPAIR v2 bumps the version on all Repair copies (heal ×2; COMPACT is kept). THREAD+ raises Core capacity. +12 grows REPAIR CHARGE on arrival.
   - Effects are read via lookups in `deriveCapabilities` and `createFlight(mods)`. A consumed file, or one below 50, gives no effect.
3. **Skills window.** `src/components/run/SkillsWindow.ts`: the dock SYSTEM item "Skills" plus a `TAB_WINDOWS` entry. It lists owned cards with file health pips and a one-line effect each.
4. **Meta.** `src/systems/meta.ts` per §4.5:
   - `loadMeta()` → `{ ok: true, meta } | { ok: false, reason: 'unavailable' | 'corrupt' }`; `saveMeta()` returns a status;
   - the title banners;
   - `runs++` and `activeRun` at RUN START; a leftover `activeRun` → `lastUnit` with cause `abandoned`;
   - `endRun` writes `lastUnit` (including stats `{ moves, deletes }`) and `bestScore`, and clears `activeRun`.
5. **Ghost and run-2 hook** per §4.5 and §5.2:
   - unit = 47 + runs; wave = runs + 1, on the title and the crumb;
   - `hollowName()` follows the cause table;
   - the ghost line is typed during the ship-1 boot, and `> you remember me. good.` replaces `> ...047?`;
   - from run 2: the auto-reveal at boot (`SOUL ARCHIVE · 2,400 · you know what they are`), no STASIS step, REPAIR licensed at boot, ship-1 tutorials collapsed to one hint each, ship-1 families reseeded with C12 still featured, and the hurt cluster seeded (never C12);
   - the title lineage line.
6. **Causes available now:** `overwritten`, `stayed`, `abandoned`, and `flagship-lost` for a run ending on the last ship without an ending. WP11 adds `won-purge`, `won-merge` and `unresolved`.

**Edge cases.**
- Storage throws mid-run (banner; the game continues).
- PLAY WITHOUT ARCHIVE (no writes).
- Two tabs (the last write wins; documented).
- A draft when every non-stackable is owned (the stackables fill the 3 slots).
- FIREWALL moved next to the root (blocks that side).
- FUEL TRIM consumed mid-ship (applies from the next arrival).

**Files.**
- New: `src/data/upgrades.ts`, `src/systems/meta.ts`, `src/components/run/SkillsWindow.ts`.
- Touched: `src/components/run/TransmitScreen.ts`, `src/systems/run.ts`, `src/systems/carry.ts`, `src/types/segment.ts`, `src/data/type-labels.ts`, `src/state/sidebar-filters.ts`, `src/components/memory-view/SegmentBlock.ts`, `src/components/memory-view/DetailPanel.ts`, `src/systems/capabilities.ts`, `src/systems/hollow.ts`, `src/data/mission.ts`, `src/data/souls.ts`, `src/data/script.ts`, `src/data/tuning.ts`, `src/systems/reveal.ts`, `src/systems/licences.ts`, `src/systems/director.ts`, `src/systems/say.ts`, `src/components/title/TitleCard.ts`, `src/components/dock/Dock.ts`, `src/components/tools-view/ToolsTabs.ts`, `src/state/schema.ts`, `src/debug.ts`, `src/main.ts`, `index.html`, `src/styles/tokens.css`, `src/styles/modes.css`, `src/styles/game.css`.

**Acceptance.**
1. typecheck and build pass.
2. `.tmp/wp8/draft-test.ts`:
   - the same seed gives the same 3 cards;
   - with clustersLost ≥ 1, FIREWALL appears in ≥ 60% of 1,000 seeds;
   - owned non-stackables never appear.
3. The FIREWALL cases are added to `hollow-unit.ts`: the spread is blocked, and it can't be infected.
4. `.tmp/wp8/meta-test.ts`:
   - a localStorage that throws → `unavailable`;
   - corrupt JSON → `corrupt`;
   - a round trip preserves every field;
   - a leftover `activeRun` → `abandoned` on the next load.
5. `.tmp/wp8/ghost-test.ts`: every cause → a line of ≤ 70 characters and the right `hollowName`.
6. `run-flow.ts` is extended: the run-2 boot shows the ghost line and the auto-reveal, and REPAIR is licensed at boot.
7. Screenshots: TRANSMIT with 3 cards; the wave-2 title with lineage; `ARCHIVE CORRUPT` (`?debug`).

**Effort.** L.

### WP9: KESTREL (hazard zones, debris, fog, DELETE, seeds, AUTOBURN)

**Goal.** Add ship 3:
- the hazard-zone framework (debris and belt kinds) in the predictor and the sim;
- a debris cloud that names the rack it will hit;
- PATH UNCERTAIN arrival fog;
- the DELETE licence and HOLLOW seeds that land inside your walls;
- AUTOBURN, trained from your first two captures.

**Player-facing result.**
- KESTREL arrives flying blind: a grey band and `DEBRIS · RACK C · HIT?`.
- Repairing Sensor Interp snaps the colours back: TOO WIDE, and hatched red through the cloud.
- An early IN correction clears both. A late one costs rack C 25% each.
- HOLLOW's seeds blink into your walls, and DELETE kills them.
- AUTOBURN closes the loop while you fight in blue.

**Spec.**
1. **Zones.** `src/systems/zones.ts` per §6.8:
   - `ShipDef.zones` (validated);
   - predictor `zoneHits` and `hazard` spans;
   - swept-path entry detection in the sim;
   - debris effects (25 × fraction) and belt effects (−8, τ 200 game-s; implemented and unit-tested here, used by WP11);
   - pace (TACTICAL from ≤ 20 tactical s before entry until exit; SKIP ends 15 before);
   - NAV PLOT glyphs and labels (including `HIT?` under `uncertain`);
   - the objective strip's upcoming event `DEBRIS C 03:30`;
   - `debrisImpact`, `geiger`, rack-row flashes, the `HIT · RACK C` stamp.
2. **Ship 3 KESTREL** (§4.2):
   - **Flight:** r0 25,000; rp0 9,000; vInf 1.4; ring 5,000–7,000; dv 2.1; ×25 / ×80; start SAS `radial-in`.
   - **Debris:** r 900, centred on the unperturbed inbound path at r 14,000; rack C on run 1, seeded B or C later.
   - **Arrival damage:** Sensor Interp = min(current, 45).
   - **Layout:** per §4.2.
   - **HOLLOW:** spread 20, drain 4, burnMult 2, printMult 1.5, seed `{ everySec: 50, target: 'walls' }`.
3. **Seeds** in `stepHollow` per §6.6: `seed-telegraph` (2 AI-s, a blinking outline), then the placement. Never on reserved free space.
4. **DELETE licence** at the first seed telegraph.
   - Tutorial: `RM THE SEED — pick up DELETE, click the seed`.
   - HOLLOW: `> sorry. i'm so hungry.`
   - Deleting a ship file uses the inline confirm with its consequence.
5. **AUTOBURN** in `src/systems/autoburn.ts`, exactly §6.10:
   - the training from `run.stats.demos`, installing at the boot after the second demo;
   - the AUTO button and key B with the enabling conditions;
   - the state machine; firing with `firingSource 'auto'`; it stops at loop-closed;
   - `reserveThread`; it works in blue;
   - drop on consumption;
   - a Skills window row with its accuracy.

**Edge cases.**
- Debris contact during SKIP (the skip ends 15 tactical s earlier).
- A segment straddling a rack boundary (proportional damage).
- A file moved into the rack before contact (it gets hit).
- AUTOBURN engaged, then the mode switches (it continues).
- AUTOBURN and pause.
- AUTOBURN with a dead engine (dropped, `ENGINE NOT RESPONDING`).
- A seed with no wall anywhere (the largest-region rule).
- A seed telegraph on a gap the player then fills by a move (the target is re-picked at placement).

**Files.**
- New: `src/systems/zones.ts`, `src/systems/autoburn.ts`.
- Touched: `src/systems/predict.ts`, `src/systems/orbit-sim.ts`, `src/systems/pace.ts`, `src/systems/guidance.ts`, `src/data/ships.ts`, `src/data/memory.ts`, `src/data/script.ts`, `src/data/tuning.ts`, `src/systems/carry.ts`, `src/systems/director.ts`, `src/systems/hollow.ts`, `src/systems/licences.ts`, `src/systems/ops-core.ts`, `src/systems/capabilities.ts`, `src/components/tools-view/NavPlotWindow.ts`, `src/components/tools-view/EngineWindow.ts`, `src/components/hud/ObjectiveStrip.ts`, `src/components/memory-view/MemoryStrip.ts`, `src/components/memory-view/HollowPainter.ts`, `src/components/memory-view/DetailPanel.ts`, `src/components/run/SkillsWindow.ts`, `src/state/actions.ts`, `src/state/schema.ts`, `src/systems/fs-tools.ts`, `src/systems/audio.ts`, `src/components/hud/Stamp.ts`, `src/debug.ts`, `src/styles/game.css`.

**Acceptance.**
1. typecheck and build pass.
2. `.tmp/wp9/zones-sim.ts`:
   - a pilot that never corrects takes exactly 1 debris hit, and each rack-C cluster loses 25;
   - the follower with the IN correction started ≤ 80 tactical s after boot → 0 hits, `locked`, fuel ≥ 20%;
   - a correction started at 140 tactical s → 1 hit.
3. `.tmp/wp9/belt-unit.ts`:
   - a 1,080 game-s belt crossing gives 5.4 ± 0.5 hits on average over 500 seeds, at both ×30 and ×300;
   - an orbit with ra ≤ 7,000 under a belt starting at 9,000 → 0 hits during printing.
4. `.tmp/wp9/seed-test.ts`: the `walls` targeting; the 2 s telegraph; reserved free space never used; deleting a seed restores the WALL.
5. `.tmp/wp9/autoburn-sim.ts`:
   - from ship-3 geometry after the correction, AUTOBURN alone reaches loop-closed with fuel ≥ 25% for learnedOffset −8, 0 and +8;
   - consumption mid-burn → dropped with an alarm;
   - with the mode set to blue, the burn continues.
6. The run flow now plays 3 ships.
7. Screenshots: the hatched cloud with `HITS RACK C`; the grey band with `HIT?`; the Engine window with AUTO.

**Effort.** L.

### WP10: VESPER (the engine fires by itself, SWAP, COPY, THE DEAL)

**Goal.** Add ship 4:
- ghost thrust live from a damaged Thrust Ctrl, fixed with the new SWAP tool file;
- the COPY licence against seeds that hunt your tools;
- THE DEAL;
- the MERGE foreshadowing line.

**Player-facing result.**
- On VESPER the engine fires by itself with nobody on the throttle, and ▼ drifts down. The THRUST CTRL `?` pip leads to a 31% ship file, and SWAP to Thrust.alt silences it.
- Seeds blink next to your tools, so COPY makes a spare Repair.
- Then HOLLOW offers a deal with a 15-second timer.

**Spec.**
1. **Ship 4 VESPER** (§4.2):
   - **Flight:** r0 25,000; rp0 5,600; vInf 1.6; ring 5,000–7,000; dv 1.8; ×30 / ×80; start SAS `retrograde`.
   - **Arrival:** Thrust Ctrl integrity 31, unscanned.
   - **Layout:** per §4.2.
   - **HOLLOW:** spread 16, drain 4, burnMult 2, printMult 1.5, seed `{ everySec: 40, target: 'near-tools' }`, deal true.
2. **Ghost thrust live:**
   - the **first** onset per ship → the alarm `UNCOMMANDED THRUST`, the klaxon, a 6 px shake, and TACTICAL during the burst;
   - **later bursts** → the rumble, a 3 px shake, and a warn counter (`UNCOMMANDED THRUST ×3`), with no klaxon and no pace change;
   - after the second event, the tutorial `THE ENGINE IS FIRING BY ITSELF — click the THRUST CTRL pip`.
3. **SWAP licence** at the first ghost onset: a 1-block fs-tool `Swap`, kind `swap`, built from `actionSwap`.
   - Pick up SWAP and click a ship file that has a backup. The 2.0 s op holds a thread; the primary becomes `inactive` (`.old`) and the backup takes the role.
   - Remove the DetailPanel swap button.
4. **COPY licence** at boot: `HOLLOW IS HUNTING YOUR TOOLS — COPY your Repair`. The `near-tools` seed targeting per §6.6.
5. **Lines.**
   - At boot: `> keep 20 charge for me, 047. you'll see.`
   - THE DEAL per §6.6, with `sayChoice`, the ticker in amber, and the outcomes logged in `run.stats.deal`.

**Edge cases.**
- A deal during a burn (the choice shows; the timer runs on AI time).
- SWAP blocked while operating.
- A ghost burst during the lock hold (resets it).
- A sticky burst and an AUTOBURN takeover.
- The deal's named cluster printed or moved (invalidated).
- Ghost thrust while paused (none).
- SWAP when Thrust.alt is infected (allowed; the infection carries).

**Files.**
- Touched: `src/data/ships.ts`, `src/data/memory.ts`, `src/data/script.ts`, `src/data/tuning.ts`, `src/data/fs-tools.ts`, `src/types/fs-tool.ts`, `src/systems/orbit-sim.ts`, `src/systems/capabilities.ts`, `src/systems/director.ts`, `src/systems/hollow.ts`, `src/systems/licences.ts`, `src/systems/say.ts`, `src/systems/carry.ts`, `src/systems/run.ts`, `src/state/actions.ts`, `src/state/schema.ts`, `src/systems/fs-tools.ts`, `src/components/memory-view/DetailPanel.ts`, `src/components/memory-view/FsStatusBar.ts`, `src/components/memory-view/MindTerminal.ts`, `src/components/hud/ObjectiveStrip.ts`, `src/systems/audio.ts`, `src/debug.ts`, `index.html`, `src/styles/game.css`.

**Acceptance.**
1. typecheck and build pass. `grep -n "swap to backup" src` returns nothing.
2. `.tmp/wp10/vesper-sim.ts`:
   - Thrust Ctrl at 31%, unfixed through the coast with RETRO pointed, lowers rp by 300–900 km (mean over 200 seeds);
   - after a SWAP at boot+20 AI-s there are 0 further events;
   - the follower plus a scripted `pip → SWAP` defender reaches `locked`.
3. `.tmp/wp10/deal-test.ts`:
   - ACCEPT consumes the named cluster, cures every infection, and pauses the spread for 60 s;
   - REFUSE → a ×0.8 interval for 30 s;
   - the offer is invalidated when the named cluster prints;
   - it is never offered twice.
4. `.tmp/wp10/copy-test.ts`: the COPY refusals and the `near-tools` targeting.
5. The run flow now plays 4 ships.
6. Screenshots: the flashing THRUST CTRL `?` pip; the DEAL in the TERMINAL with buttons and a timer; the amber ticker.

**Effort.** M.

### WP11: LAST LIGHT (the belt, HOLLOW's verbs, the root duel, PURGE or MERGE)

**Goal.** Add the climax ship:
- an impact opener with a radiation belt;
- HOLLOW using your own verbs, telegraphed and blockable;
- the root unlocking at ORBIT LOCK for a 12-second DELETE duel;
- the PURGE/MERGE choice and two short typed endings;
- the ending-aware archive.

**Player-facing result.**
- LAST LIGHT opens on `IMPACT 03:04` with a belt ahead: `≈5 HITS ON RACKS A–B`.
- During the coast, commands nobody typed appear 3 seconds early (`> rm repair.bak ... 3`), and scanning the target makes them fail: `BLOCKED`.
- At ORBIT LOCK the root unlocks. The DELETE duel runs with glitch spikes.
- ARRIVAL CONTROL says "Please delete UNIT-046. :)". PURGE or MERGE, then a short ending and the victory screen.

**Spec.**
1. **Ship 5 LAST LIGHT** (§4.2):
   - **Flight:** r0 18,000; rp0 3,200 (impact); vInf 1.5; ring 5,000–7,000; dv 2.5; ×30 / ×60; start SAS `radial-out`.
   - **Belt:** `{ rIn: 9000, rOut: 12000, racks: ['A', 'B'] }`.
   - **Layout:** per §4.2 (16 clusters, `R16` in rack D).
   - **HOLLOW:** spread 12, drain 5, burnMult 2, printMult 1.5, seed `{ everySec: 35, target: 'walls' }`, verbs `{ everySec: 12, telegraphSec: 3, duelEverySec: 4 }`.
   - **Boot:** HOLLOW `> last ship, 047. i'm so tired.`, and the `MERGE 20` tick on the charge readouts.
2. **Verbs.** The pure `chooseVerb(memory, rng, weights)` in `hollow.ts`, exactly §6.6: MV respects walls; RM's targets and fairness; the weights from `lastUnit.stats`; the telegraph, the BLOCK counter and the `BLOCKED` stamp; the instant mutation with invariants; the echo.
3. **Glitch burst.** `glitch.ts` exports `glitchBurst(level, ms)`: module-scope overlay, quantized, timed on AI time. Under reduced motion it becomes a dim pulse. The HALCYON naming beat's CSS pulse (WP7) switches to `glitchBurst(0.3, 400)`.
4. **Root duel** per §6.6:
   - the objective `DELETE THE ROOT`;
   - the 12 AI-s op, with verbs every 4 s;
   - completion → a single last block `UNIT-046`; spread and seeds stop → FinaleChoice;
   - printing continues in parallel;
   - if printing ends and no live Rm exists → the ship ends `UNRESOLVED`.
5. **FinaleChoice.** `src/components/run/FinaleChoice.ts`:
   - **[PURGE]:** the last block is deleted. Typed ending (≤ 6 lines): `> rm unit_046 ... OK` / `LAST LIGHT · 3,200 souls in orbit.` / `the fleet is home.` / CONTROL `Thank you, Unit 47. Please stand by for reassignment. :)`.
   - **[MERGE]:** needs ≥ 20 charge, otherwise disabled with `NEEDS 20 CHARGE (you have 14)`. It costs 20. Each cluster consumed on this ship comes back: its hollow segment converts back in place to a soul at 50 if it still exists, otherwise it prints directly as half credit; nothing is dropped. `meta.mergeBonus = true`. Ending: `> merge unit_046 -> unit_047 ... OK` / `> hi. it's us.` / `we arrive together.` / CONTROL `Unit 47 is non-compliant. :)`.
   - Then the victory RunEnd.
6. **Meta.**
   - The causes `won-purge`, `won-merge` and `unresolved`; `endingsSeen`.
   - The mergeBonus applies next run: Core capacity 3 and a corruption floor of 0.05.
   - The title shows `ENDINGS n/2`.
7. **Last-ship rules** (§4.3): Core 0 → OVERWRITTEN; crash, escape, stranded or BEAM OUT → `flagship-lost`.

**Edge cases.**
- Beaming out before the duel.
- The Core below 50 during the duel (the running DELETE keeps its thread).
- A verb whose target is mid-op (blocked).
- MERGE after the hollow segments were moved or deleted (half-credit prints).
- Printing completing before the duel (the objective waits).
- Belt hits on the Printer Uplink or the Reactor (C4/C7 apply).
- MV with no valid region (it falls through to RM, then skips).

**Files.**
- New: `src/components/run/FinaleChoice.ts`.
- Touched: `src/data/ships.ts`, `src/data/memory.ts`, `src/data/script.ts`, `src/data/tuning.ts`, `src/systems/hollow.ts`, `src/systems/glitch.ts`, `src/systems/zones.ts`, `src/systems/director.ts`, `src/systems/run.ts`, `src/systems/meta.ts`, `src/systems/printer.ts`, `src/systems/say.ts`, `src/state/actions.ts`, `src/systems/fs-tools.ts`, `src/components/run/RunEnd.ts`, `src/components/title/TitleCard.ts`, `src/components/memory-view/MindTerminal.ts`, `src/components/memory-view/MemoryStats.ts`, `src/components/hud/MiniHud.ts`, `src/state/schema.ts`, `src/debug.ts`, `src/main.ts`, `index.html`, `src/styles/game.css`.

**Acceptance.**
1. typecheck and build pass.
2. `.tmp/wp11/boss-sim.ts`:
   - a competent scripted defender completes the root DELETE and loses ≤ 4 of 16 clusters on average over 200 seeds;
   - over 1,000 seeded verb rolls, no verb targets the last copy of any tool kind, the Core, a soul, Engine I/O or Nav Plotter;
   - MV never lands closer than 4 free blocks to a soul;
   - an op on the target during the telegraph cancels the verb.
3. `.tmp/wp11/merge-test.ts`: MERGE restores consumed clusters (in place, or as half credit), deducts 20, and sets `mergeBonus` and `endingsSeen`; it is disabled below 20.
4. `.tmp/wp11/full-run.ts`: ships 1–5 with the follower plus the scripted defender end in the victory RunEnd in ≥ 90% of 50 seeds.
5. Screenshots: a verb telegraph in the TERMINAL; the FinaleChoice overlay.

**Effort.** L.

### WP12: Balance, accessibility and release

**Goal.** Make the whole run fair, tuned, accessible and mobile-safe:
- prove every ship is solvable and every sloppy run survivable with a 200-seed harness;
- audit reduced motion;
- fix the mobile layout;
- remove dead UI and stale fields;
- update the docs;
- hand Fran a playtest checklist.

**Player-facing result.**
- A tuned 22–32 minute run with no death spirals or unwinnable ships.
- A reduced-motion option that keeps every alarm readable.
- A working (reduced) phone layout with a big BURN button.
- No dead or static UI anywhere.

**Spec.**
1. **The harness.** `.tmp/wp12/playthrough.ts` runs all 5 ships headless with two scripted players, 200 seeds each:
   - **COMPETENT:** the guidance follower; repairs infected souls first; builds 4-block walls with MOVE; deletes seeds; corrects early on KESTREL; SWAPs on VESPER; blocks telegraphed verbs; picks FIREWALL or REPAIR v2; uses AUTOBURN when owned.
   - **SLOPPY:** the follower with a 1.2 s reaction and ±5 tactical s of burn timing noise; repairs only when an infection passes 50%; never builds walls; never dodges; never swaps.
   - It models time spent in each mode (OVERCLOCK).
   - **Targets for COMPETENT:** ≥ 85% souls woke; every ship locked in ≥ 90% of seeds; simulated wall time 20–32 min; never Core-dead.
   - **Targets for SLOPPY:** the run completes (soft fails allowed) in ≥ 80% of seeds, with ≥ 30% souls woke; ≥ 1 ship is lost in ≥ 50% of seeds.
   - Tune only `src/data/ships.ts`, `src/data/upgrades.ts` and `src/data/tuning.ts`. Record the final numbers and the results table in the report.
2. **Reduced-motion audit.** Every motion path routes through `ui.reducedMotion`: shake, jerk, stamp scale, glitch flicker (dim instead), heartbeat pulse, sparkles, `glitchBurst`. Alarms keep their colour and text.
3. **Mobile (≤ 768 px):**
   - every window has `TAB_WINDOWS` and dock entries;
   - the objective strip wraps to 2 lines, and the mini-HUD becomes a top bar;
   - a big touch BURN button, and a mode button instead of TAB;
   - responsive overlays (title, wake report, transmit, run end, choice);
   - fix the crumb `.sep` rule;
   - keep the 768 px breakpoint in sync between `responsive.css` and `src/utils/viewport.ts`.
4. **Cleanup:**
   - the corner stamps go live (Core integrity, AI time) or are removed;
   - `document.title` is live (`UNIT-047 · ARES-VII`);
   - remove dead schema fields (`ops.byId`, the unused `ai` fields, the telemetry mass and sensor fields) and the unused `src/components/component.ts`.
5. **Docs.** Update `CLAUDE.md` "What's prototyped" and `DESIGN.md` to the SOULCACHE premise. Keep it short, with no implementation details in `.claude/TASKS.md`.
6. **Checklist.** Fran's interactive playtest checklist goes in the report.

**Edge cases.**
- Retuning must not break the earlier acceptance sims: re-run every `.tmp/wp*/` test.
- Reduced motion must not hide information.
- Mobile overlays must not trap input (the modal stack still works with touch).

**Files.**
- Touched: `src/data/ships.ts`, `src/data/upgrades.ts`, `src/data/tuning.ts`, `src/systems/glitch.ts`, `src/components/hud/Juice.ts`, `src/components/hud/ObjectiveStrip.ts`, `src/components/hud/MiniHud.ts`, `src/components/header/TimeControls.ts`, `src/components/tools-view/ToolsTabs.ts`, `src/components/tools-view/EngineWindow.ts`, `src/components/dock/Dock.ts`, `src/styles/responsive.css`, `src/styles/game.css`, `src/utils/viewport.ts`, `src/state/schema.ts`, `src/state/instance.ts`, `index.html`, `src/main.ts`, `CLAUDE.md`, `DESIGN.md`.
- Deleted: `src/components/component.ts`.

**Acceptance.**
1. typecheck and build pass.
2. Every `.tmp/wp1`–`wp11` test passes.
3. The playthrough targets are met, and the results table is printed.
4. Mobile screenshots at 390×844 (amber, blue, transmit) show no horizontal overflow and a visible BURN button.
5. With reduced motion emulated, a screenshot after a debris hit shows no `shake` class.
6. `grep` finds no `MASS EST`, `SENSOR CONF`, `ai.coreIntegrity` or `component.ts` import, and no static `2,400 SOULS IN STASIS` outside the pre-reveal state.

**Effort.** M.

---

## 10. Deliberately deferred

1. **Aerobraking and the ENTRY gauge** (drag, heat, a plasma blackout, an optional atmosphere skim). This is the most visceral physical moment kids rated, and the first thing to add after this pass. The WP1 numeric predictor is the right foundation, because drag has to be inside the prediction so the line never lies.
2. **AUTOBURN v2** (the trained skill also trims the loop to green). This is Fran's "automation frees the player" direction taken all the way. It is deferred so that RED TO GREEN by hand survives every ship of the first pass. The upgrade path is designed: demos already record offsets.
3. **Moon perturber, slingshot, binary star, Nemesis (TASK 800).** These are XL physics with chaos near flybys and a high risk of physics walls.
4. **Solar flare with the planet-shadow cone.** It needs a phasing skill that is too hard to read in this pass.
5. **Encrypted fragment hunt, the archive, and the Ines Val origin reveal.** Cut for twist fatigue: there are two in-run reveals plus the ghost.
6. **Sector map, relay shop, FTL-style text events** (Long Relay). This avoids menu fatigue: there is one decision between ships.
7. **Power pips, a human companion (Rin), ship armour facing, the MANUAL VALVE** (Hot Arrival). Too many currencies.
8. **ATTENTION trace meter, HUNTER packets, MIMIC tools, the glyph CRACK minigame, typed terminal input** (hacker STATIC). Rule bloat. The command echo is kept.
9. **LLM-trained skills and multi-demo replay skills** (the DESIGN.md loop). AUTOBURN is the deterministic, trained stand-in.
10. **QUARANTINE, HONEYPOT, DECOY tools, a DEFRAG skill, and the PLOT FILTER and SCAN DAEMON cards.** More chips than a kid needs. FIREWALL covers "place a wall".
11. **HOLLOW's CP verb and the root's seeded position per run.** CP duplicated the seeds. Hand-designed layouts are built around their root positions; families, the hurt cluster and the debris rack are seeded instead.
12. **Daily seed, shareable seed codes, Protocols/ascension, firmware chassis.** Meta stays small: unit, wave, best score, endings, the MERGE bonus, the ghost.
13. **Run persistence across page reloads** (a mid-run save). The archive survives; the run does not, and the title says so. A reload mid-run is recorded as `abandoned`.
14. **Hidden mass as a mechanic.** It returns as a readable MASS-SPEC upgrade that draws NEEDED as a ±2% `LEAVE MARGIN` band (Fran's vault note "Hidden mass and fuel scarcity").
15. **Alien civilization, colony prep after landing, supply lines.** Out of scope for the core loop.
16. **Merging PR #6 (origin/main).** Its ideas are mined, not merged. Fran decides how to reconcile the deployed build.

---

## Appendix A: Critique responses

Probes run for this revision:
- `.tmp/overhaul/probes/design-final-ship1.mjs`
- `.tmp/overhaul/probes/design-final-fleet.mjs`
- `.tmp/overhaul/probes/design-final-kestrel.mjs`

### A.1 Blockers (all fixed)

| Critic | Issue | Resolution |
|---|---|---|
| playthrough + buildability | Ship-1 step 1 "done" at rp ≈ 3,400 made an un-greenable loop; the WP1 competent pilot had the same flaw | Guidance is now a pure function (§6.3). The stamp `CLEAR OF THE PLANET` fires on red → flyby, but the objective keeps saying `KEEP HOLDING — push ▼ up into the ring` until rp is in the sweet zone (6,000 km on ship 1). There is a ghost `▼ LOWEST: UNDERGROUND` and a green ▼ in the ring. Probe: OUT to 6,000 then RETRO → locked with 36% fuel; stopping at 3,400 → rp 1,024 and 0% fuel. WP1 acceptance includes that negative case and a literal-follower test |
| playthrough + buildability + coherence | Pace and countdown contradicted the opener; the ETA jumped on pace changes | An impact course is always TACTICAL, so `IMPACT 02:43` is real and the idle crash comes at 163 s (WP1 test b). **Countdowns are in tactical seconds**: one formula, monotonic, never jumping (WP1 test f). The `▸▸` and `×¼` glyphs explain the tick rate |
| playthrough | The C12 bite was an unwinnable scripted loss | It is triggered on `loop-closed`, with ship-1 drain 2/s × 2 while firing and **printMult 1 on ship 1** (and generally applied only while the printer actively prints). Probe: full engine → C12 at 60% at the lock, idle loss 30 s after the lock; 40% engine → 8.4% at the lock; 1 busy thread → 48%. A sealed C12 is force-unsealed (`SEALED BLOCK BREACHED`). WP6 acceptance is derived from these numbers |
| all three | COMMS was invisible in blue | Two channels by layer: the amber COMMS radio (ARRIVAL CONTROL and SYS, backed by AI Comms) and the blue TERMINAL pane (HOLLOW, command echoes, boot and ECC lines, choice buttons), plus a hidden-channel ticker on the objective strip, visible in both modes. Built in WP2, with a screenshot acceptance |
| playthrough + buildability | Forward-only objectives broke on mistakes | The pure `flightObjective` table (F1–F11), including `TOO EARLY — RELEASE`, `MISSED ▼`, the trims at ▲/▼ and `or ACCEPT ORBIT`. The director composes alarm > flight-now > mind-urgent > tutorial > flight-soon > hint. No step counter. WP1 tests inject the critics' regressions (a)–(c) |
| playthrough + coherence | OVERCLOCK stretched every coast about 4× | OVERCLOCK only at TACTICAL pace. In CRUISE, blue runs at full cruise. SKIP is allowed from blue and never cancelled by jacking in. The `MIND CLEAR — press [F] to SKIP` hint. WP3 test |
| buildability | Ops needed the DOM, so the headless acceptances couldn't run | `ops-core.ts` (DOM-free) plus `OpBars.ts`; `clock.advance()`; Telemetry painting moved out of the clock; a list of the DOM-free systems that harnesses mount; a grep acceptance on ops-core |

### A.2 Majors

| Critic | Issue | Resolution |
|---|---|---|
| playthrough + buildability | SPACE and TAB focus hijack; key collisions | `src/systems/input.ts`: one capture-phase router with a modal stack, preventDefault, `tabindex="-1"` plus blur, select-only presets, a fresh keydown after modals. WP1 shot test |
| playthrough | The tug-of-war visual was misleading | A literal tug with one boundary (continuous heal from WP3). "Late starts still lose" is **rejected on purpose**: heal > 1.5 × the worst drain is validated, so any started repair wins. Losses come from reach, threads and charge. This is simpler to say and fairer for kids |
| playthrough | ACCEPT ORBIT was a trap | Shown only when fuel can't fix the orbit or after 15 AI-s idle; labelled with the printer range; second-click confirm. Low range now costs quality, not 5 minutes (the interval is clamped at a range of 0.5) |
| playthrough | The packet could throw away the next ship | The Core, Engine I/O, Nav Plotter and the last copy of every tool kind are locked. Consequence lines on every chip, safest-first sort. Charge auto-fills, and the slider is gone (coherence) |
| playthrough + coherence | AUTOBURN automated away the #1 moment, or was too rare | Trained (not drafted) from your first 2 manual captures; arrives on ship 3; **flies only until the loop closes**; holds a thread. A modification of coherence's "guaranteed at the first lock": ship 2's hack-or-burn stays manual |
| playthrough | Nobody said when to start the capture burn | The `START BURN` tick at ▼ − 0.5 · estBurn, `GET READY — BRAKE IN 5…`, beeps, `HOLD [SPACE] NOW`, and the early-burn guard. Probe: starting 20 tactical s early still locks; 60 s early is caught by `TOO EARLY` |
| playthrough | HOLD STEADY ran at cruise | TACTICAL while in ring or holding; the hold runs on AI seconds (3.0). WP1 test g |
| playthrough | Run 2 had a weak hook | The ghost line during the boot, the auto-reveal, a collapsed tutorial, REPAIR at boot, reseeded families, hurt cluster and debris rack, verbs weighted by the last unit's play, the lineage line, waves (WP8) |
| playthrough | The MERGE cost was hidden | HOLLOW on ship 4: `> keep 20 charge for me, 047. you'll see.`; the `MERGE 20` tick from the ship-5 boot; the disabled button states the shortfall |
| playthrough + coherence | Ship 3 was overloaded (feature soup) | Re-dealt to one physical and one cyber rule per ship. KESTREL: debris + DELETE/seeds (fog is arrival damage through the existing C3). VESPER: ghost thrust/SWAP + COPY + THE DEAL. LAST LIGHT: belt + verbs + duel. The CP verb, the duel's ghost burst and the "largest-free" seed variant are cut. **Playthrough's "ghost thrust on HALCYON" is rejected:** ship 2 must teach exactly one cyber rule (walls), and ship 4 needed a new physical rule once the belt moved to ship 5 |
| playthrough | Ship-5 verbs undid the wall rule and had no counterplay | MV lands exactly 4 free blocks from souls (it respects walls). The telegraph highlights the target, `BLOCK IT — use any tool on X (3…)`, any op cancels with `BLOCKED` |
| playthrough + buildability | The finale could soft-lock (Rm deleted) | Verbs never target the last copy of any tool kind; the packet locks last copies; transit hits keep last copies ≥ 60. The playthrough's "RM ROOT button without the Rm file" is **rejected** (pillar 4). The only remaining path, letting HOLLOW eat your last Rm through visible alarms, ends the run loudly as `UNRESOLVED`, never a soft-lock |
| playthrough | Losing the Core ended a 30-minute run instantly from the other layer | The Core never converts. At 0 on ships 1–4 → EMERGENCY TRANSMIT (Core reset to 25). OVERWRITTEN only on ship 5. An infected Core is an `alarm` that preempts and forces TACTICAL. The MOVE preview warns `BRIDGES HOLLOW TO YOUR CORE` |
| playthrough + coherence | Rack A was decoration | The Reactor band caps thrust (C4); the Printer Uplink band sets print speed (C7); Cargo Ctrl is labelled "no flight effect" (useful as a deletable spacer); Ship Comms and Navigation are removed |
| playthrough | Sensor fog had no teeth | Below Sensor 50: a grey uncoloured band, no altitudes, `PATH UNCERTAIN`, zone labels `HIT?`. `getSensedPrediction()` feeds every readout and the guidance (buildability minor) |
| playthrough | Failing ship 1 skipped the premise | The LOST card plays the reveal. Run 1's first crash → "That was a simulation. :) Again." (once) |
| playthrough | HOLLOW's timing and reach were invisible | `NEXT BITE m:ss`, dashed target arrows, `GAP n · TOO SMALL` / `WALL n` labels, the MOVE preview |
| buildability | speedTarget had many writers; pause could deadlock | Pace is the sole owner, evaluated before the speed ≤ 0 return. `paused` and `debugWarp` are separate fields; resume snaps |
| buildability | Thrust Ctrl seeded at 22% | Set to 100 in WP4; the capabilities test asserts ghost null on ship 1 |
| buildability | Fuel under caps was undefined | Fuel drains by delivered Δv. FUEL in %, with the cap shown as a hatched overlay. WP4 acceptance: fuel within 3% at 38% Engine I/O |
| buildability | REPAIR unlocked only through an optional beat | Licensed on the first blue entry, or whenever anything needs it |
| buildability | The linear director couldn't express later steps | Rule priorities (alarm, mind-urgent, tutorial, hint) with `activeWhen` / `doneWhen` / `once`, defined in WP2 |
| buildability | WP2→WP3 mode collision | Mode in the store, the body-class subscriber and TAB all moved to WP2 |
| buildability | A HOLLOW alert forced tactical | Infections are `warn` with `inhibitsSkip` and no pace effect; only the 10-s consumption projection and the Core are `alarm` |
| buildability | Memory concurrency (index-based cancel) | `reservedBy`, address-range restore, `assertMemoryInvariants` in dev and tests (WP3, with a 2,000-sequence fuzz test) |
| buildability | Resets of module state | `src/systems/reset.ts` from WP1; every package registers its own; WP7 asserts it |
| buildability | Tuning centralized too late | `tuning.ts` from WP1; no literals in rule code |
| buildability | ACCEPT and fuel-out on crashing orbits | `ringFit` / outcome-based rules (§6.2); the lock tests delivered thrust, not `firing` |
| buildability | Package size | WP3 → "two clocks / ops core" (WP3) + "capabilities" (WP4); WP6 → "run" (WP7) + "carry-over / meta" (WP8). **WP1 stays one package** (the 12-package cap) but is staged: stage A headless systems with tests, then stage B UI. Marked XL |
| buildability | Layout didn't fit 1280×720 | The plot side = clamp(400, min(100vw − 794, 100vh − 208), 620); a left column of Telemetry and COMMS; screenshots at 1280×720 with an overlap check. CSS grid is **modified** to custom-property initial positions, so windows stay draggable as CLAUDE.md requires |
| coherence | The STASIS reveal was skippable | Mandatory on run 1 (SKIP inhibited until done). Coherence's "gate the wake on revealed" is **rejected** in favour of the force-unseal breach, so a kid who ignores the step still gets the signature bite |
| coherence | HOLLOW was never named | The ship-2 naming beat, lines on ships 3–5, the CONTROL payoff lines in both endings, the `unitName()` / `hollowName()` helpers |
| coherence | The ghost contradicted the endings | Waves; cause-dependent ghost lines and names (§4.5); the PURGE "reassignment" line explains why winners come back hungry |
| coherence | Pillar 4 breaks (locked chips over present files; SWAP without a file; printer/Reactor; TASK 700) | Licences install files; SWAP is a 1-block tool file; Activate/Deactivate are deleted; the printer and the Reactor have effects; the TASK 700 hybrid is recorded in §8 |
| coherence | Infected ship files were undefined | One sayable rule (§3.2), refusal texts, capability rows for missing thrust-ctrl / printer / reactor, and "no flight effect" files stated |
| coherence | Fran's automation direction | AUTOBURN is guaranteed through training (not the draft) and frees you during the capture; v2 is deferred with the reason (§10) |
| coherence | OKAFOR wasn't the threatened cluster | C12 = OKAFOR, directly before the root; the reveal auto-selects C12; the WAKE REPORT leads with Ada |

### A.3 Minors

**Accepted:**
- FUEL % instead of growing seconds.
- Queued-line TTL and pacing.
- Select-only presets with `ALIGNING…`.
- POWER moved into MANUAL.
- BEAM OUT hidden on run 1 ship 1 and gated.
- PRINT FAST.
- Engine I/O starting at 85% plus a scripted fault.
- Kid wording (REPAIR CHARGE, PRINTER RANGE).
- MOVE refused on infected files.
- THE DEAL names no rack: `> give me C11. then i leave the others alone. for a while.`
- Telemetry trimmed, and its scramble also hits the plot readouts.
- Reload recorded as `abandoned`.
- SPACE in blue buzzes.
- Script numbers generated from data.
- The analytic `ringFit` / `ringFraction`.
- `rMin` / `rMax` removed.
- Ghost bursts clipped per sub-step with fuel, and their acceptance stated as a mean over ≥ 200 seeds.
- Per-subsystem child RNG streams.
- `firingSource`.
- Carry-overflow rules.
- An explicit INFECTABLE set: REPAIR CHARGE is a non-infectable, non-movable blocker.
- The Core exempt from offline states.
- No scan gate on souls, and a hatch on unscanned infected ship files.
- Phase-gated ticks.
- The source goes offline during a move.
- `ShipDef.start.sas`.
- A `say()` template test.
- The glossary.
- Terse stamps.
- Audio buses, priority and ducking.
- Reduced motion from WP2/WP4.
- Hidden mass removed.
- Visible star criteria.

**Modified:**
- Coherence's "rename the REACTOR pips to CORE LOAD": the Reactor file is wired instead.
- Debris damage: −35 → −25. Repairing six clusters at −35 would have cost 34 charge.

### A.4 Numbers the probes corrected in v2

- **KESTREL debris.** v2's "a 3-second IN nudge clears it and leaves rp in the ring" was false: IN for 3 tactical s gives rp 3,327, an impact course. The new geometry (a too-wide rp0 9,000 and a cloud of r 900) makes the normal early IN correction clear the cloud by 385–667 km. A correction started at 120 tactical s or later can hit.
- **VESPER ghost thrust.** v2's rate (15% every 12 tactical s for 1.5 s) drifted rp from 5,600 to 3,765 over the coast (0.78 km/s). It is retuned to every 25 tactical s for 1.0 s, about 50 km of rp per burst.
- **LAST LIGHT.** r0 15,000 → 18,000, so the belt entry comes 77 tactical s in, giving time to move rack-B souls (impact at 3:04).
- **The ship-1 narrative.**
  - The Engine I/O repair costs 10 charge (not 5), C09 costs 5, and C12 about 7, so 36 → 14.
  - The boot reports 2 damaged files, generated from data.
  - Total souls are 12,400 after cutting KESTREL to 12 clusters. The ranks are rescaled.
