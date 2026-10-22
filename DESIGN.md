# Arrival Protocol // SOULCACHE — Design

The game's concepts, short. The code is the source of truth for numbers (`src/data/tuning.ts`, `src/data/ships.ts`).
The original brainstorm (a braking-burn sim with LLM-trained skills) was replaced in the 2026-10 overhaul; what was kept
and what was cut is listed at the end.

---

## Premise

The Exodus Fleet sends colony ships in **waves** along one 581-light-year route. Nobody on board is awake. When a ship
reaches its world, **ARRIVAL CONTROL** beams a caretaker AI aboard to bring it in. You are **UNIT-047**, wave 1,
arriving damaged by the transmission, minutes before something goes wrong.

Two jobs, two screens:

1. **SHIP (amber): fly it.** Turn the predicted path green: get the whole loop inside the fat SAFE ORBIT ring. The ring
   is also PRINTER RANGE: the bio-printers on the surface only receive colonists while the ship is in it.
2. **MIND (blue): keep the colonists intact.** The 2,400 "sleeping" colonists are files in the same memory you live in.
   Intact files are printed into bodies; damaged ones wake with gaps; lost ones do not wake.

**ARRIVAL CONTROL** is the only authority voice: automated, cheerful, bureaucratic, every line ends with ":)". It issues
your tool licences, never sends quite enough repair charge, and wants the thing in the memory deleted.

### The reveals

1. **Minute 1: the people are files.** STASIS reports `0 pods detected`; two sealed racks crack open into soul clusters
   of 200 people each, with family names and heartbeats.
2. **Ships 1–2: the thing eating them was a caretaker too.** A locked `???` segment starts eating a cluster. On ship 2
   it names itself: `UNIT-046`, the previous wave's unit, sent with too little charge, starving, not evil.
3. **Meta: the ghost.** A local archive counts runs. On run 2 you are UNIT-048, and HOLLOW is your previous unit.

**Finale (ship 5, LAST LIGHT):** HOLLOW fights with your own verbs (telegraphed 3 s early). At ORBIT LOCK its root
opens for a DELETE duel, then a choice: **PURGE** (the fleet is home, CONTROL thanks you) or **MERGE** (costs 20
charge, the clusters it ate come back with gaps, CONTROL calls you non-compliant, the next run starts stronger).

**Tone (PG):** "did not wake", "woke, missing memories". HOLLOW is pitiable and eerie; CONTROL keeps it light; there is
always a hopeful ending.

## Pillars

1. **Make the line green.** The flight goal fits in one sentence. One objective line always says the right next step,
   recomputed from the actual path every tick.
2. **The people are in the same memory as you.** Every block of damage has a family name.
3. **Hack OR burn.** Both screens compete for Core threads (which share the reactor with the engine), repair charge and
   attention. You can only burn while looking at the ship; HOLLOW eats twice as fast while the engine fires.
4. **Every capability is a file.** A hurt Autopilot file kills the presets, a hurt Engine I/O makes the engine sputter,
   a tool exists only while its file does, licences arrive as files.
5. **Short, loud, fair.** Ships of a few minutes, something happening every ~20 s, soft fails instead of reloads,
   synthesized sound, seeded randomness, countdowns that never jump.

## The two layers

**SHIP (amber).** The NAV PLOT is the hero window: the predicted path is red (impact), dashed (flyby or loop outside the
ring) or green (in the ring), with ▼ LOWEST / ▲ HIGHEST markers, a START BURN tick and hazard zones. Presets PRO / RETRO /
IN / OUT, hold SPACE (or BURN) to burn, FUEL in percent with a NEEDED tick. ORBIT LOCKED after 3 s steady in the ring;
ACCEPT ORBIT prints at reduced range; BEAM OUT leaves a doomed ship. The director paces the world: CRUISE, TACTICAL,
and SKIP to the next event.

**MIND (blue).** 384 blocks in six racks: A ship files, B–C the soul archive, D open space, E your AI files, F your
filesystem tools and REPAIR CHARGE. Tools are files: SCAN, REPAIR (licensed on ship 1), MOVE (2), DELETE (3), COPY and
SWAP (4). HOLLOW's one rule: *it eats the file next to it; an eaten file turns into HOLLOW too; 4 free blocks stop it.*
REPAIR pushes its bite back; MOVE carries souls behind a WALL; DELETE removes seeds or cuts a gap; SWAP puts a ship
file's backup into service. While the world is TACTICAL, jacking in slows the ship to ¼ (OVERCLOCK).

**Couplings** (each is drawn and heard): Engine I/O caps and sputters thrust; Thrust Ctrl fires the engine by itself
when hurt (SWAP it); Autopilot / Sensor Interp / Nav Plotter / Telemetry degrade the instruments; busy Core threads take
thrust from the reactor; the AI Core's health drives the glitch overlay (at 0 the ship is lost); AI Comms gates BEAM OUT
and a crash's emergency transmit (without it, a crash ends the run); the Printer Uplink sets print speed. The other way: firing the engine doubles HOLLOW's drain, the orbit's fit is the
printer range, hazard zones hit racks, crashes and transmissions damage the unit.

**Two clocks.** The world (orbit, fuel, hazards) runs on game time that the director paces; the mind (ops, HOLLOW,
printing) runs on AI time, which is wall time while unpaused. SKIP never makes a repair cheaper; pause freezes both.

## The run

Five ships, each a new rule:

| Ship | New |
|---|---|
| ARES-VII | the crash course, the reveal, the scripted first bite, REPAIR |
| HALCYON | a flyby to capture, HOLLOW names itself, MOVE |
| KESTREL | a debris cloud to dodge, blind instruments, seeds, DELETE, AUTOBURN trained from your captures |
| VESPER | the engine fires by itself (SWAP), seeds that hunt your tools (COPY), THE DEAL |
| LAST LIGHT | the radiation belt, HOLLOW's verbs, the root duel, PURGE or MERGE |

Between ships: the WAKE REPORT (who woke, stars), TRANSMIT (your files cross a link of limited size; the crossing
damages them; pick one of three cards to carry), then the next ship's boot. Losing a ship (crash, flyby, stranded, the
Core eaten) is a soft fail: the run goes on to the next ship, unless AI Comms is gone when the ship crashes (nothing can
beam you off: YOU STAYED WITH THEM ends the run there). Otherwise the run ends on LAST LIGHT with RUN END (score, rank
and how it ended): PURGE or MERGE (the root deleted, then your choice), UNRESOLVED (printing ended with the root still
there), FLAGSHIP LOST (LAST LIGHT itself lost) or OVERWRITTEN (the Core eaten there).

**Meta (small):** the archive keeps the unit number, the wave, the ending and the last unit's fate; MERGE gives the
next run a thread and a shimmer.

## Kept from the first design, and cut

**Kept:** the Uplink look (everything is UI), the amber / blue split, memory as one strip of labelled segments, files
that can be corrupted (tools included), scan-to-reveal ship damage, ship-file backups, the repair budget (now REPAIR
CHARGE), the AI Core glitch overlay, skills learned from your own flying (AUTOBURN), transmission with a budget.

**Cut:** the braking-burn equation and mass uncertainty (now a two-body orbital capture with presets), LLM-trained
skills and skill composition, the bandwidth allocation screen (now a link size and a card pick), encrypted partitions,
alien civilizations, galactic positioning effects, colony preparation after landing.

**Still not doing:** 3D rendering, a physics engine beyond two-body gravity, colony politics, supply lines to Earth.
