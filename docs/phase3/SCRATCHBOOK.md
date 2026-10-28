# Phase 3 scratchbook: what is least set in stone

The specs in this folder read as finished, but these points came out of the spec rounds rather than from Fran's
decisions. Each is a working answer, not a commitment: expect any of them to change after Fran's review or the first
playtest. Each item names where the full reasoning lives. Fran's answers are in `DECISIONS.md`; the questions still
open are in `README.md`.

## Structure and numbers

- **The steady arm.** Runs share one persistent arm a year apart, and every run's arm is kept the same shape: every
  world holds one ship at run start, and new ships restore the size mix. Without it a persistent arm drifts or
  snowballs. Over 12,000 simulated consecutive runs the best route stays at 67–69 pods with no drift and almost no
  correlation with the last run (`02-map.md` §3.12–3.13; simulator in `map-sim/`).
- **Exactly one year between runs,** and a new calm ARES ship at the start of every run. Both are working answers to
  "the next core version, a year later"; the ARES series stays unexplained (`02-map.md`, `05-story.md`).
- **At most 16 pods per ship, and three memory classes.** FULL 384, COMPACT 320, TIGHT 256 blocks; the room for the
  unit is 152, 152 and 88. The 88 and the rule that light ships are TIGHT are starting values; a seventh rack for big
  ships remains the route to 20 pods (`01-landing.md` §3.16).
- **At most one TIGHT ship per layer from layer 5,** so no late route is forced through one. Added by the map's
  simulation (`02-map.md`).
- **The long-hop answer rests on arks.** With uniform ship sizes the longest route always won. Arks that only a long hop
  reaches in time balance it: the best route is 6 or 7 ships, never 5 or 8 (`02-map.md` §3.7). Other levers (cycles
  weighted by ship size, story stops) are kept spare.
- **ECC while asleep** (one transit hit repaired per 25 years of slack) is a new rule invented to give slack a value
  (`02-map.md` §3.3).

## Landing

- **The planet does not rotate** (`01-landing.md` §3.1). Because SKIP crosses any gap between windows in about 6 s,
  low versus high orbit is no longer about how often windows come; it became drop width against decay and fuel.
- **The scoring factors** (mislanded ×0.75, off-site 0.5 / 0.25 / 0 by planet, hard landing ×0.5) are starting values
  (`01-landing.md` §3.9).

## Threats

- **The late surprise resident:** layers 6–7, hidden 1 time in 2, never on TIGHT ships or arks (`04-threats.md`
  §3.12). The share is a guess until a playtest.
- **rm at the finale.** With no rm guarantee (decision 19), the specs propose a loud warning and a one-use DELETE at
  the final ship, pending Fran (`04-threats.md`).

## Endings and story

- **The ending is chosen before the score screen** (decision 23). MERGE restores the eaten pods'
  drivers, and the pods land on their own (by AUTODROP, or blind), scoring by the normal landing rules (round 2).
- **Traces under the one-year gap.** An ending can't physically reach the next run before its final ship, so traces
  are game rules no character quotes, and the trace places must not show anything before it could exist
  (`05-story.md` §3.8).
- **046 ran out of charge halfway along the arm,** which lets it board you mid-run without breaking the timeline
  (`05-story.md`).
- **The next-run traces are balanced by construction, not measured.** Each is a gain with a matching cost; the numbers
  wait for the rebalance.

## A phase-2 rule that needs code

- **HOLLOW's drain multipliers must not stack.** While you burn (×2) and while you land (×1.5) HOLLOW eats faster. If
  the two multiply, a repair is no longer guaranteed to beat a bite and the 12-block file cap collapses to about 4
  blocks. Phase 2's validator already assumes "the larger applies", but its runtime drain multiplies them
  (`src/systems/hollow.ts`, `04-threats.md` §3.3). The specs adopt "the larger applies"; the code has to follow.

## Known squeeze

- **The last hop into the final ship is very tight.** HOLLOW's root and `046.log` are locked in the packet on a long
  hop's link, so the skills spec's sample player leaves AUTOBURN, Telemetry and AI Comms behind and arrives with only
  the charge floor, while MERGE needs 20 charge kept through the duel (`03-skills.md` §3.12). The knobs are the link
  formula's slope and the root's link cost (letting it ride free into the final ship is an open question).
