# Phase 3 scratchbook: what is least set in stone

The specs in this folder read as finished, but these points came out of the spec rounds rather than from Fran's
decisions. Each is a working answer, not a commitment: expect any of them to change after Fran's review or the first
playtest. Each item names where the full reasoning lives. The full list of open decisions is in `README.md`.

## Structure and numbers

- **At most 16 pods per ship.** PHASE3 said later ships "may have 20", but 20 pods do not fit the 384-block memory
  together with HOLLOW's root, a resident AI, skills and seeds (`01-landing.md` §3.16). The other route to 20 is a
  seventh memory rack on big ships ("a bigger ship has a bigger computer"). The cap also forced standard ships one pod
  smaller to keep route lengths balanced (`02-map.md` §3.7).
- **Centuries, not decades.** With light-speed deliveries and enough early slack that files arrive fast near Earth,
  one run spans about 720 galaxy years and waves start about 760 years apart (`02-map.md` §3.4, Q3). The decided "next
  wave, decades later" holds only at the tip of the arm. A compact arm would keep the rules and shrink the years.
- **The story's truth followed the calendar.** "Everyone left Earth" became "nobody on Earth is awake; ARRIVAL CONTROL
  is a program left running" because waves 760 years apart cannot all have left at once (`05-story.md` §3.1, Q1). If
  the time scale changes, this can change back.
- **The long-hop answer rests on arks.** With uniform ship sizes the longest route always won the simulations. Arks
  (the biggest ships) that only a long hop reaches in time balance it: best route 7 ships in 51% of waves, 6 in 45%,
  5 in 3% (`02-map.md` §3.7; simulator in `.tmp/map-sim/`). It is one mechanism; others (cycles weighted by ship size,
  story stops) are kept as spare levers.
- **ECC while asleep** (one transit hit repaired per 25 years of slack) is a new rule invented to give slack a value
  (`02-map.md` §3.3, Q2).

## Landing

- **The planet does not rotate** (`01-landing.md` §3.1). Because SKIP crosses any gap between windows in about 6 s,
  low versus high orbit is no longer about how often windows come; it became drop width against decay and fuel.
- **Unsurveyed planets stay playable** on ARRIVAL CONTROL's guessed sites (worse, never blocked). This bends the
  decided "others need to be scanned from orbit" (`01-landing.md` §3.13, Q4).
- **The scoring factors** (mislanded ×0.75, off-site 0.5 / 0.25 / 0 by planet, hard landing ×0.5) and counting each
  mislanded colonist once in the 400 + 800 case are starting values (`01-landing.md` §3.9, Q2–Q3).

## Endings

- **The choices come after the score is tallied,** so no ending can change the score by construction. The price:
  MERGE no longer brings eaten pods back (`05-story.md` §3.7, Q3–Q4).
- **The next-run traces are balanced by construction, not measured** (`05-story.md` §3.8). Each is a gain with a
  matching cost; the numbers wait for the rebalance.

## A phase-2 rule that needs code

- **HOLLOW's drain multipliers must not stack.** While you burn (×2) and while you land (×1.5) HOLLOW eats faster. If
  the two multiply, a repair is no longer guaranteed to beat a bite and the 12-block file cap collapses to about 4
  blocks. Phase 2's validator already assumes "the larger applies", but its runtime drain multiplies them
  (`04-threats.md` §3.3). The specs adopt "the larger applies"; the code has to follow.

## Known squeeze

- **The last hop into LAST LIGHT is very tight.** HOLLOW's 16-block root and `046.log` are locked in the packet
  (62 locked blocks) on an 87-block link, so the skills spec's sample player leaves AUTOBURN, Telemetry and AI Comms
  behind and arrives with only the charge floor (`03-skills.md` §3.12). The knobs are the link formula's slope and the
  root's link cost; it is on the list for the rebalance, not a design goal.
