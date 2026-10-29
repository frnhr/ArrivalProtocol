# Phase 3 scratchbook: what is least set in stone

The specs in this folder read as finished, but these points came out of the spec rounds rather than from Fran's
decisions. Each is a working answer, not a commitment: expect any of them to change after Fran's review or the first
playtest. Each item names where the full reasoning lives. Fran's answers are in `DECISIONS.md` (three rounds); nothing
is open at the moment.

## Structure and numbers

- **The steady arm.** Runs share one persistent arm, and every run's arm is kept the same shape: every
  world holds one ship at run start, and new ships restore the size mix. Without it a persistent arm drifts or
  snowballs. Over 12,000 simulated consecutive runs the best route stays at 67–69 pods with no drift and almost no
  correlation with the last run (`02-map.md` §3.12–3.13; simulator in `map-sim/`).
- **The launch gap table** (0–35 years, mostly 0–2, mean 2.8), **the drift limit** (a waiting ship more than 10 years
  off the new schedule leaves) and **the time valve** (11 more years if the next arm's best route is below 63 pods;
  never opened in 12,000 simulated runs) are working answers to "the next core version, launched later" (`02-map.md`
  §3.4, §3.12). A new calm ARES ship starts every run; the ARES series stays unexplained.
- **At most 16 pods per ship, and three memory classes.** FULL 384, COMPACT 320, TIGHT 256 blocks; the room for the
  unit is 152, 152 and 88. The 88 and the rule that light ships are TIGHT are starting values; a seventh rack for big
  ships remains the route to 20 pods (`01-landing.md` §3.16).
- **At most two TIGHT ships per layer from layer 5** (Fran: one was too artificial), and no late route is forced
  through one. TIGHT ships have no charge floor, so a full receiver means arriving with 0 charge (`02-map.md`,
  `01-landing.md` §3.16).
- **The long-hop answer rests on arks.** With uniform ship sizes the longest route always won. Arks that only a long hop
  reaches in time balance it: the best route is 6 or 7 ships, never 5 or 8 (`02-map.md` §3.7). Other levers (cycles
  weighted by ship size, story stops) are kept spare.
- **ECC while asleep** (one transit hit repaired per 25 years of slack) is a new rule invented to give slack a value
  (`02-map.md` §3.3).

## Landing

- **THE LAST LANDING after MERGE:** restored drivers come back at 80%; without AUTODROP the pods drop blind, with the
  dot's centre anywhere within ±(W/2 + 150 km) of the LZ and double spread, one pod per window, taking more passes
  until all are down. All starting values (`01-landing.md` §3.17).

- **The planet does not rotate** (`01-landing.md` §3.1). Because SKIP crosses any gap between windows in about 6 s,
  low versus high orbit is no longer about how often windows come; it became drop width against decay and fuel.
- **The scoring factors** (mislanded ×0.75, off-site 0.5 / 0.25 / 0 by planet, hard landing ×0.5) are starting values
  (`01-landing.md` §3.9).

## Threats

- **The late surprise resident:** layers 6–7, hidden 1 time in 2, never on TIGHT ships or arks (`04-threats.md`
  §3.12). The share is a guess until a playtest.
- **rm at the finale.** Decided: no rm means no win, with a loud warning before the last hop, and the last copy is
  not protected. Watch in the playtest whether losing it late reads as tough or as unfair (`04-threats.md` §3.3).

## Endings and story

- **The ending is chosen before the score screen** (decision 23). MERGE restores the eaten pods'
  drivers, and the pods land on their own (by AUTODROP, or blind), scoring by the normal landing rules (round 2).
- **Physical traces.** An ending can't reach the next unit before late in its run, so each trace acts at the next
  final ship (PURGE: no carried seeds; MERGE: +1 thread and an 18-block root; REASSIGNMENT: +15 charge and the last
  unit as root) or is a gift that already exists on the arm (caches, a colony packet, signal stops). The non-compliant
  endings cost at most one extra seed per run at the final ship's boot (`05-story.md` §3.8).
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

- **MERGE's charge on the last hop.** HOLLOW's root and seeds ride free, so the last hop's file squeeze is small, but a
  long last hop still brings about 12–18 charge against the 20 MERGE needs kept through the duel (`03-skills.md`
  §3.12). The knob is the link formula's slope, or counting MERGE's charge from the root's unlock.
- **0 charge on TIGHT ships** breaks "a started repair always wins" for skill files there; the specs accept it as
  TIGHT's price and keep the first seed ship off such a ship (`03-skills.md`, `04-threats.md`).
