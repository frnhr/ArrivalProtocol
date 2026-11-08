# 03 · Skills: the training tree and skill versions

Spec for PHASE3 §7 and the tools-versus-skills split of §8.5, following the template in `docs/phase3/README.md`.
"§6.10" and similar refer to `docs/design-v2.md`; "PHASE3 §7" refers to `docs/PHASE3.md`.

## 1. Summary

- Every ship pays **training cycles**: 1 for arriving, plus 1 per full 20% of its landing points (1 to 6 per ship).
- You spend them between ships in the **TRAINING** window on the map's DESK. Unspent cycles carry over. The tree resets
  every run.
- Four branches of three versions: **AUTOBURN**, **AUTODROP**, **SURVEY**, **SENTRY** (defence), plus AUTOBURN's
  cheap **LOCK RANGE** (90 → 270 → 810 tactical s). The whole tree costs 50 (54 before slice 8); a run earns about 20–35.
- A skill is a `.skl` file of 3 to 12 blocks. A higher version is bigger: more link budget, more memory, more hits.
  The packet must fit the hop's link and the next ship's memory, which is smaller on small ships (`01-landing.md`'s
  memory classes), so a skill-heavy unit leaves files behind for a tight ship late in a run.
- AUTOBURN v2 makes the orbit green; pressed again on a green orbit, it makes it round.
- Damage is graded on the phase-2 bands: DAMAGED works one version lower, FAILING two lower, DEAD does nothing.
- Visit 1 offers one readable choice (AUTOBURN v1 or AUTODROP v1); later visits open one branch at most. Cycles buy
  a version; your manual captures and drops set its ACCURACY, which keeps "a skill trained by you".

## 2. The player's experience

**The first time (after ship 1).**

1. The LANDING REPORT rolls up (`LZ-A 3/3 ✓ · POD 02 LANDED HARD · 83%`), and a new line counts up under it:
   `TRAINING CYCLES +5 · ARRIVED +1 · LANDED 83% +4`.
2. The DESK opens, and its guided first step brings up the TRAINING window. There is no tree yet, only two big cards
   under `CHOOSE YOUR FIRST SKILL`:
   - **AUTOBURN v1**: "It brakes into orbit for you. Press [B] near ▼, even from the MIND." A tiny looping plot shows a
     dashed flyby closing into a loop.
   - **AUTODROP v1**: "Hold [L] in a window: every pod waits for the dead centre." A tiny planet shows a dot sliding
     into a bracket, then a pod streak.

   Each card says `3 CYCLES · 6 BLOCKS` (or `4 BLOCKS`). The counter in the corner reads `5 CYCLES`.
3. The kid clicks AUTODROP. A bar fills (`TRAINING AUTODROP v1 · from your 3 drops`) with the op chirps, and the ORBIT
   LOCKED arpeggio plays when it is full. The card is stamped `TRAINED`, and the counter reads `2 CYCLES · SAVED FOR
   NEXT TIME`. A faint line says `MORE SKILLS OPEN AS YOU GO`.
4. At ship 2's boot the TERMINAL types `> SKILL TRAINED: AUTODROP.skl v1 · from your 3 drops · AIM 91%`.
5. At the first window the strip says `WINDOW LZ-A — hold [L]: AUTODROP waits for the centre`. The pod leaves exactly
   as the dot crosses the middle of the bracket: `+200 LANDED · LZ-A · BULLSEYE`.

The purchase from one screen earlier is a visible power spike on the very next ship.

**Later (ship 5 of 6: CORMORANT, the same player and route as §3.12).**

- **The setup.** CORMORANT is a standard ship with 9 pods, two LZs and POOR site data. The unit carries AUTODROP v2,
  AUTOBURN v1 with LOCK 270, SENTRY v1 and SURVEY v1. HOLLOW boarded on this beam (CORMORANT is one hop from the
  final ship, `04-threats.md` §3.8). Because this first ship is one hop from the final ship, its ARRIVAL stage takes
  WALLS along (`04-threats.md` §3.9), and its 10-block root rode free in the packet.
- **The flight:**
  1. Early in the coast the NAV PLOT shows a bright `LOCK` bracket. The kid presses [B] inside it (`AUTOBURN ARMED —
     it brakes at ▼ in 4:10`), presses [F] to SKIP, and TABs into the MIND.
  2. The boot's ECC lines have already named a disguised seed, and the strip marks `cache.tmp` red: SENTRY saw
     through it, so the kid deletes it without a hunt.
  3. SURVEY runs through the approach and holds a thread. Two candidates pop up, and the kid moves LZ-B from
     ARRIVAL CONTROL's guess to a WIDE site, although v1 shows its ground only as `GROUND ?`.
  4. AUTOBURN brakes while the kid is in the MIND, and hands back `CAPTURED — trim it green yourself`. The kid trims
     by hand.
- **The landing:**
  1. The kid sets this pass's numbers in the POD BAY window (`A ×4 · B ×4`), presses [G], and stays in the MIND while
     AUTODROP v2 flies the pass.
  2. HOLLOW is not dormant here. After its scripted bite and `> ...047?`, it names itself and keeps biting every 25 s.
     During LZ-B's window a beam seed that landed beside AUTODROP.skl bites it down to 71%. A down-sweep sounds, and
     the stamp reads `AUTODROP v2 → v1`. v1 works only on the SHIP screen, so the kid TABs back and holds [L] for the
     last pods.
  3. After the window the kid repairs the file (about 1 charge), because a file being repaired is offline: `AUTODROP
     v2 RESTORED`. Pass 2 lands the ninth pod.

At this ship's desk the bank is 9, and the kid trains AUTODROP v3.

## 3. Rules and starting numbers

All numbers go into `src/data/tuning.ts` with a WHY comment, as in phase 2.

### 3.1 Training cycles

- **The conversion.** `01-landing.md` reports per ship: colonists aboard, landed correctly, mislanded, off-site, not
  launched, and points. Let Q = points ÷ colonists aboard (0 to 1). Then cycles = 1 + floor(5 × Q).
  - **ARRIVED +1:** even a crashed ship pays 1. This prevents a death spiral, where a bad ship means no skills and so
    more bad ships.
  - **LANDED +1 for every full 20%:** five steps a kid can read off the report. The fifth step needs every point, so a
    perfect landing is a moment: `PERFECT LANDING · +6`.
  - Partial points (mislanded pods, off-site pods on forgiving planets) count through Q, so no extra rule is needed.
- **The bank** keeps unspent cycles from visit to visit. There is one visit after every ship except the last. The last
  ship's cycles show on RUN END as `UNSPENT n`, and do nothing more. (Decision 18 is deferred: points-only cycles,
  unspent cycles only shown, and no SKIP chaining are working values.)
- **The first-pick guarantee** (signed off): at the first visit of a run, the bank is raised to 3 if it is lower (ship
  1 crashed), with the line `+2 CYCLES · FIRST SKILL ON THE HOUSE :)`, like the REPAIR CHARGE arrival floor (§6.5).
- **Other sources:** a resident, a story stop, or a salvage card can grant cycles or a version (§5). The repository
  never sends skills (§3.11).

### 3.2 The tree

Each cell shows the price in cycles and the size in blocks.

| Branch | v1 | v2 | v3 | Opens |
|---|---|---|---|---|
| FLIGHT: **AUTOBURN** | CAPTURE: brakes into orbit at ▼ · 3 · 6 | GREEN, THEN ROUND: makes the orbit green; on a green orbit, makes it round · 4 · 8 | LANDING ORBIT: flies to the highest orbit where every LZ's drop fits, and holds it there · 7 · 10 | v1 at visit 1, the rest at visit 2 |
| FLIGHT side axis: **LOCK RANGE** | 90 s (comes with AUTOBURN v1) | 270 s · 1 · +1 | 810 s · 2 · +1 more | visit 2; needs AUTOBURN v1 |
| LANDING: **AUTODROP** | CENTRE: hold the key, and each pod waits for the window's centre · 3 · 4 | PASS: set this pass's split, and it flies the whole pass, also from the MIND · 5 · 7 | PLAN: plans the split over all passes to match the counts, and flies it · 8 · 10 | v1 at visit 1, the rest at visit 2 |
| **SURVEY** | FIND: candidate sites pop up under the swath, with ROOM and WIDTH; a guess the swath passed reads `FLAT ?` or `ROUGH ?` · 1 · 3 | RATE: shows GROUND (FLAT, ROCKY, WET) and ★ ratings; swap a bad guess · 3 · 4 | SWEEP: twice the swath, and it holds no thread · 4 · 6 | visit 4, or the first later visit with a POOR-data planet as a possible next ship |
| DEFENCE: **SENTRY** | SIGHT: every disguised seed is revealed at the boot · 1 · 3 | QUICK RM: rm on HOLLOW twice as fast, and it can be aimed at a seed's warning outline · 3 · 4 | FIREWALL: compiles a FIREWALL.sys at every boot · 5 · 6 | visit 3 (after the first seeds) |

- **Totals:** FLIGHT 17, LANDING 16, SURVEY 8, DEFENCE 9, so 50 in all (54 before slice 8's rebalance).
- **Why these prices:**
  - **Roots 3:** a ship-1 landing buys one, never two.
  - **v2 5:** about one good ship. AUTOBURN's v2 is 4 (slice 8): it paid about 0 pods per cycle on its own.
  - **v3 8:** more than any ship pays, so a focused branch reaches it around ship 4 or 5, when the big ships come.
    AUTOBURN's v3 is 7 (slice 8), the lowest price that is still more than one ship pays (6): it is a thin upgrade on
    healthy ships (§10).
  - **LOCK RANGE 1 and 2:** cheap, as PHASE3 asks.
  - **SURVEY cheaper:** its value depends on how many POOR-data planets the route meets. Its v1 is 1 (slice 8), so
    v1 + v2 pay back sooner.
  - **SENTRY v1 1** (slice 8): a run meets a disguised seed in about a third of the runs that reach depth 5, so SIGHT
    alone names nothing in most runs.
  - **SENTRY v3 5:** a free wall on every ship is strong.
- **Prerequisites are only within a branch,** so "I'm a lander" is a clean choice.
- **The opening rule:**
  - Visit 1 shows the two roots only. Visit 2 opens the higher versions of those two branches, with LOCK RANGE.
  - From visit 3 on, a branch opens at the first visit where its problem is on the map, and at most one new branch
    opens per visit (as phase 2 added one rule per ship, §4.2). SENTRY opens at visit 3, after the first seeds.
    SURVEY opens at visit 4 at the earliest, at the first visit where a planet with POOR site data (`01-landing.md`
    §3.13) is a possible next ship. `01-landing.md` keys POOR data by layer (from layer 5), and two long hops can reach
    layer 5 at depth 3. A POOR planet met before SURVEY opens is played on ARRIVAL CONTROL's guesses, which is worse
    but always playable.
  - If two branches are ever due at the same visit, the one the next ship needs opens first, and the other opens at
    the following visit.
  - Closed branches show as one dim row, `OPENS LATER`.

### 3.3 Training a skill

- **Purchase.** The kid picks an affordable cell and confirms with TRAIN.
  - The new file joins the outgoing packet the way a phase-2 card's file does (`src/systems/draft.ts`, cardFiles and
    applyPickToPacket).
  - It arrives at the next boot like any carried file.
- **An upgrade replaces the file** with a fresh one at the new size and at 100%. New training is new code, so it also
  heals the file.
- **Undo** works until TRANSMIT ▸ on the PACKET screen (the map spec lets `◀ CHART` go back to the desk until then).
  Nothing in training is random, so undo is safe.
- **Demos, or "trained by you."** Cycles buy the version; your hands set its precision.
  - **AUTOBURN** keeps phase 2's capture demos (§6.10): learnedOffset = 0.5 × the mean of the last 8 offsets, clamped
    to ±8 tac s, and ACCURACY = clamp(100 − 8 × |offset|, 40, 99). "Last 8" replaces "all", so improvement shows.
  - **AUTODROP** learns the same way from manual launches. A demo is the launch time minus the moment the dot was at the
    bracket centre, in tac s. The factor is 0.5 and the clamp ±1 tac s: half of the 2.0 s cadence, so a learned skill
    never shifts a volley by a whole slot. AIM = clamp(100 − 40 × |offset|, 40, 99).
    *Built (slice 4c–4e review M3):* a demo is measured against the slot the strip cued, as AUTOBURN's are against START
    BURN: the window's launch moment (`LAUNCH NOW`, where the whole dot first fits; a WIDE DROP's in-band opening) for
    the first launch, one cadence after the launch before it for each later one. Against the centre, a kid who did
    exactly what the strip said trained AUTODROP to AIM 60% and 1 s early on ship 1; now the same kid trains 94%.
  - **No demos** means `UNTRAINED` at 40%. That is a loud, designed state, not a hidden default.
  - Later manual captures and drops retrain the skill for free at the next boot (`> SKILL RETRAINED`), as in phase 2.
  - SURVEY and SENTRY have no demos.
- **Lost skills.** A skill file that was eaten, unlinked, deleted or left behind (for a long hop or a tight ship) is
  gone, and its version with it.
  - The next visit offers `RESTORE v3 · 8 CYCLES`: half of what the branch cost, rounded up (decision 16).
  - **Packed at a lower version** (round-2 decision 10): on the PACKET a skill may cross as a lower version (`PACK AS
    v1`), a smaller file. Only the versions above it are lost, and restoring them costs half of their price, rounded
    up (AUTODROP v3 packed as v1: half of 5 + 8, so 7).
  - Skill files cannot be copied (phase 2 already refuses COPY on upgrade files, `src/systems/tool-targets.ts`), so a
    loss is really felt, as PHASE3 §7 wants for AUTODROP.

### 3.4 Skill files: size, link budget, memory

- **The sizes** are in the table above. LOCK RANGE adds a block per level, so the largest file is AUTOBURN v3 with 810
  at 12 blocks. A full set is 34 blocks.
- **The 12-block cap (SKILL_MAX_BLOCKS).** Phase 2's fairness rule (§6.6) says a repair started before zero always
  wins.
  - REPAIR v1 heals 100 ÷ (3 + 0.3 × size) % per second. That is 15.2%/s at 12 blocks, which still beats 1.5 × the
    final ship's worst drain (the FINALE stage: 5 %/s × 2 while burning = 10, so 15).
  - At 14 blocks it would be 13.9%/s and the rule would break.
  - **The multipliers do not stack.** `04-threats.md` states the rule "burnMult and landMult do not stack; the larger
    applies", so the worst drain stays 5 × 2 = 10 even while the ship burns during landing to hold a low orbit, as phase
    3 asks by design. Phase 2's ship validator (`src/data/ships.ts`) already assumes this, but its runtime drain
    (`src/systems/hollow.ts`) multiplies the two, and it must change to "the larger applies". If the multipliers
    multiplied (5 × 2 × 1.5 = 15), a repair would have to heal 22.5%/s, and the cap would fall to about 4 blocks.
  - If `04-threats.md` raises the base drain, this cap must shrink.
- **Where they live.** Skills are unit files, packed after the AI tools (`src/systems/carry.ts` already sorts
  role-less files last). `01-landing.md` §3.16 lays the unit out as one block from rack E's start, across the
  receiver (E and F, or E alone on TIGHT ships) and the pod racks' 24-block tail, so skills may run into rack F (a
  change to layoutCarried). This spec only needs skills to stay in that block, after the AI tools.
- **Two limits on the packet: the link and the ship's memory.** Ship memory varies (decision 9): smaller ships have
  less, in `01-landing.md`'s memory classes (whole racks of 64 blocks; FULL stays 384). The **unit room** is what the
  next ship's class gives the unit: in 01's current draft, 152 blocks on FULL and COMPACT ships and 88 on TIGHT (light)
  ships, whose receiver is one rack.
  - **The rule (01's, with round-2 decisions 8 and 20):** the unit's files must fit the link, and the room. On FULL
    and COMPACT ships the 12-block charge floor must fit the room too; on TIGHT ships there is no floor, so files ≤ 88
    and the charge may arrive at 0 ("no or minimal REPAIR CHARGE", decision 9). Charge fills what both leave.
  - **Hitchhikers ride free:** HOLLOW's root, beam seeds and seeds on deliveries cost no link room on any beam (a
    delivered file itself still does). The root lands in the bay's root slot, so it costs no room either.
  - **On FULL and COMPACT ships only the link binds:** the links run 82–123, and 123 + 12 is well inside 152.
  - **On a TIGHT ship the room binds** once the files pass 88 blocks. The packet screen and the TRAINING preview show
    whichever is smaller (§4).
  - **Legal packets:** the locked unit files (`046.log` included) are 46 blocks,
    which fit every link and every class. On a TIGHT ship the files may take all 88 blocks: the card says `NO CHARGE
    ARRIVES`, and TRANSMIT ▸ asks `ARRIVE WITH NO REPAIR CHARGE?` (01).
- **Why tight ships are early ships.** A fresh unit is about 72 blocks with `046.log`, and it grows by up to 34 as the
  skills reach v3, plus deliveries. At depth 1–3 a TIGHT ship mostly costs charge, down to none. Later, every 10 blocks
  over 88 is roughly one v3 skill, or an AI tool and a .bak, left behind. Fran's intent holds by construction: tight
  ships are viable early in a run, or they cost files.
- **What a kid leaves for a tight ship.** TIGHT ships are the light ones, with 3–5 pods, so AUTODROP is the natural
  skill to leave behind, and SURVEY when the card says GOOD site data. A left skill is lost until RESTORE (half price),
  so a tight ship late in a run is a real price; packing a skill at a lower version (§3.3) is the gentler middle
  option. It is never a trap: the card and the AHEAD row show the room before SET COURSE.
- **Why bigger costs**, all from existing rules:
  - **Link budget:** files take the link first, and REPAIR CHARGE fills what is left (§6.9). `02-map.md` sets the link
    at round(146 − 1.1 × d) blocks for a hop of d light-years: 123 at 21 LY, 113 at 30, 86 at 55, and 82 at the 58-LY
    maximum.
    - **What is locked:** a full phase-2 unit is 70 blocks, 44 of them locked. Phase 3 adds `046.log` (2 blocks, on
      every hop, `05-story.md` §3.2), so the locked files are 46. HOLLOW's root is locked too, but rides free.
    - **On a short hop** (113 blocks), a full unit with `046.log` and 23 blocks of skills (95) leaves 18 blocks of
      charge, with or without HOLLOW aboard.
    - **On a long hop to an ark** (86 blocks), the same unit does not fit at all. The kid must leave 9 or more blocks
      behind before TRANSMIT: for example Telemetry (6) and Repair.bak (4), which leaves 1 charge.
    - **The floor:** the locked files alone (46) fit the weakest link (82), so a legal packet always exists. A full
      unit with a full skill set (72 + 34 = 106) fits no long hop, so skills are droppable or packable at a lower
      version, with RESTORE as the way back (§3.3). Skills make long hops cost more charge, AI tools or skills, which
      adds to the long hop's cost in `02-map.md` §3.7.
  - **Transit hits** are weighted by size, and the floor of 60 protects only tool kinds, not skills.
  - **Repair** costs size × 2 ÷ 100 charge per point, so 30 points on a 10-block skill cost 6 charge.
  - **More to bite:** a bigger file is a bigger neighbour for HOLLOW and for seeds.
- **The packet screen** (`src/systems/transmit.ts`) offers skills last in its safest-to-drop order. Each skill chip
  names its loss: `AUTODROP.skl v3 (10) → drop pods by hand · RESTORE 8`, with `PACK AS v1 (4) · RESTORE 7` beside it.

### 3.5 Graded damage

The phase-2 bands (BAND_OK_MIN 80, BAND_DEGRADED_MIN 50, BAND_FAILING_MIN 25) set the **effective version** of the best
online copy. As for every file, a skill that is being repaired, moved or switched off counts as offline (§6.4).

| Health | v1 file | v2 file | v3 file | LOCK RANGE |
|---|---|---|---|---|
| OK 80–100 | v1 | v2 | v3 | its level |
| DAMAGED 50–79 | v1 | v1 | v2 | one level lower (810 → 270 → 90) |
| FAILING 25–49 | OFF | OFF | v1 | 90 |
| DEAD below 25, or offline | OFF | OFF | OFF | — |

- **The rule a kid can say:** "Each colour of damage costs one version. v1 still works when only damaged."
- **Phase 2 and PHASE3 both hold.** The v1 column is phase 2's AUTOBURN rule (it works at 50 or more, liveUpgrades in
  `src/systems/capabilities.ts`). PHASE3's example holds too: v3 at 50% works as v2.
- **A drop while the skill is working:** the skill finishes with what the lower version can do.
  - AUTOBURN v2 falling to v1 mid-capture still brakes, then hands back the trim to green (or the rounding).
  - AUTODROP v3 falling to v2 keeps this pass's numbers and asks for the next pass's.
  - Falling to OFF is phase 2's drop: the klaxon and `AUTOBURN.skl DAMAGED — MANUAL`.
  - Each step down is stamped (`AUTODROP v3 → v2`). Each step back up through REPAIR is stamped too (`AUTODROP v3
    RESTORED`).
- **Repairing a skill takes it offline** for a few seconds, the same rule as for Engine I/O. That is a real choice: do
  not heal AUTODROP in the middle of a window.

### 3.6 AUTOBURN v1–v3

**The rules for every version:**

- **AUTOBURN brakes and trims; it never steers.** It flies only PRO and RETRO burns at ▼ and ▲. The IN/OUT correction
  and DON'T HIT THE PLANET stay the player's at every version, so "red to green by hand" survives the whole run.
- **Engaging** uses [B] or the AUTO button, with phase 2's refusals (presets, engine, a running SKIP). The first burn
  must be inside the LOCK RANGE (§3.7).
- **Threads (changed from §6.10).**
  - An ARMED AUTOBURN that is only waiting holds no thread.
  - It claims one 8 tac s before it fires (AUTO_THREAD_CLAIM_TAC, the same as TACTICAL_LEAD_BURN_TAC, where the world
    slows anyway). It holds it to the end of that burn, so the burn is still hack-or-burn (THRUST LIMIT 75%).
  - Without this change, an 810-second lock would cost a thread for a whole coast.
  - If no thread is free at the claim, the strip says `AUTOBURN NEEDS A THREAD IN 0:08 — × AN OP`. The burn then
    starts late, as soon as a thread frees, and the plot shows how late.
- **Takeovers (changed).**
  - While AUTOBURN only waits, the player's IN/OUT correction no longer cancels it. It re-selects its own preset when
    its moment comes.
  - SPACE on a PRO or RETRO burn, or [B], still takes over, and so does SPACE at any time while it burns.
- **Fuel reserve.** It never plans a burn that leaves less than 20% FUEL (AUTO_FUEL_RESERVE_PCT). Why 20%:
  - it is the ★ FUEL star's line (FUEL at least 20% at the end of the landing, `01-landing.md` §3.9), so the automation
    never costs the kid a star;
  - it is the price of SUNSET and SPARE (FUEL ≥ 20%, `05-story.md` §3.7);
  - holding a low landing orbit needs fuel too (PHASE3 §3.2).

  When the reserve stops a plan, AUTOBURN says so (`AUTOBURN: GREEN, NOT ROUND — SAVING FUEL`, or `CAPTURED, NOT
  GREEN — SAVING FUEL`).
- **Timing.** It fires at START BURN plus the learned offset, exactly as in phase 2.

**The versions:**

- **v1 CAPTURE** is phase 2's AUTOBURN unchanged (`src/systems/autoburn.ts`). It brakes through the capture, then says
  `AUTOBURN: CAPTURED — trim it green yourself`.
- **v2 GREEN, THEN ROUND** does both kinds of circularize (decision 15). Which one runs depends only on the orbit at
  the moment [B] engages it, and the rule a kid can say is: **"[B] makes it green. [B] on green makes it round."**
  - **GREEN**, when any part of the orbit (or the flyby) is outside green. It captures if needed, then trims at ▲ and ▼
    until the whole orbit is green, and stops: `AUTOBURN: GREEN ORBIT — hold steady, or [B] to round it`. Its targets
    are phase 2's own ("▲ at 0.95 × max"), the cheapest green the planner knows. v2 can also be engaged on a closed
    loop that is not green (v1 cannot). If a capture happens to land green, it stops there.
  - **ROUND**, when the orbit is already fully green. It burns at ▼ and ▲ until e = 0, staying green throughout:
    `AUTOBURN: ROUND ORBIT — hold steady`. "e = 0" means e below 0.01 (ROUND_E_TOL), because no burn lands on zero
    exactly and 0.01 cannot be seen on the plot. On ship 1 (v∞ 1.0, ▼ at 7,000 km) a round orbit at ▼'s altitude
    costs about 0.12 km/s more than the capture, about 4% of the tank.
  - **How the kid sees which will run.** Before the press, the AUTO button and the guidance tail name the mode
    (`[B] AUTO · GREEN` or `[B] AUTO · ROUND`), and the NAV PLOT draws the target as a dashed ghost: the band-hugging
    green loop for GREEN, a circle for ROUND. Once engaged, the mode stays fixed until it finishes.
  - **How the kid chooses.** One press from a flyby gives green; a second press after it finishes gives round. The
    second press is the deliberate part: rounding costs fuel and buys the same altitude, and so the same drop width,
    on every pass, which matters more for landing than for flight. In LANDING a locked orbit is green by definition,
    so [B] there always offers ROUND.
  - **One press flies the whole sequence of its mode.** Between burns it stays ARMED and names the next burn
    (`AUTOBURN ARMED — trims at ▲ in 7:12 · [F] SKIP`).
  - **It reuses the planner in `src/systems/predict.ts`.** While v2 is armed, the planner takes the mode's targets, so
    the START BURN ticks on the plot are always the burns AUTOBURN will make.
- **v3 LANDING ORBIT** solves the landing's real orbit problem. The planet does not rotate (`01-landing.md` §3.1), so
  every orbit already gives one window per LZ per pass. What changes with altitude is the **drop width**: the dot's
  half-width grows with the launch altitude and is multiplied by Sensor Interp and driver damage (`01-landing.md`
  §3.3). A high orbit stops fitting narrow brackets or damaged drops. A low orbit fits them, but below the DRAG line it
  decays and costs FUEL (`01-landing.md` §3.7). v3 works in three steps:
  1. **Choose the highest orbit where every remaining LZ's drop fits.**
     - "Fits" uses 01-landing's own threshold: a sure window (the whole dot inside the bracket) of at least
       `LANDING_SURE_MIN_TAC` 4 tac s, which is three pods at the 2.0 s cadence.
     - The drop width is computed as `01-landing.md` §3.3 does: with the current Sensor Interp and Nav Plotter factors
       (Nav Plotter ×1.25 degraded, ×1.5 failing), and the worst driver among the pods the bay would send next (the
       LOAD NEXT order).
     - v3 tries round orbits from the top of the band down, in steps of 100 km (V3_STEP_KM), and takes the first one
       where every LZ that still needs pods fits. *Built (slice 4e):* the scan starts one step under the band's top
       (`ring.max − V3_STEP_KM`), because a circle at the top itself leaves the ring within ROUND's own tolerance.
     - **Why the highest:** it decays least. Above the DRAG line it does not decay at all.
       *Built (slice 4c–4e review M5, the lead's call; Fran may reverse it):* **above the DRAG line v3 takes the
       fitting circle nearest the ship's loop** (the least transfer Δv), and the highest only below the line, where it
       decays least. Above the line nothing decays, so the climb bought nothing: over the five classic ships from a low
       ellipse, healthy, v3's FUEL went from −25.4% to −6.5% (v2 ROUND −7.6%) with the same pods landed and the same
       first drop (`V3_AIM_ABOVE_DRAG` in `tuning.ts`; `'highest'` restores the rule as written).
     - **If no orbit fits every LZ,** v3 takes the highest orbit that fits the most LZs, and the strip names the REPAIR
       for the others, as GO LOWER does.
     - **The fuel reserve still applies.** Among the fitting orbits it takes the highest whose transfer, plus the
       holding burns it expects, leaves at least 20% FUEL. If none does, it behaves like v2, by v2's mode rule. v3
       needs no second press: its target is always round.
  2. **Fly there.**
     - **In FLIGHT,** it captures, then makes the apsis burns to the chosen round orbit with the planner (the same
       planner as v2, with v3's target), and HOLD STEADY locks it on that orbit.
     - **In LANDING,** it can also be engaged from an orbit that is already locked (`[B] · MOVE TO LANDING ORBIT`). It
       goes down with 01-landing's `go-low` burn, then rounds the orbit. *Built (slice 4e, plan R17):* it moves with the
       circle planner (`predict.ts planToCircle`, apsis burns to the circle), not 1b's `go-low` burn, because several LZs
       need a circle, not one launch point. And it can **climb**: from a low loop the fitting circle may be above it, so
       "goes down" is not the only case.
     - **While v3 is engaged,** the strip's GO LOWER offer becomes v3's own line: `AUTOBURN v3 GOES LOWER — LZ-B's dot
       will fit`.
  3. **Hold it.**
     - **Against decay:** below the DRAG line, each drag kick at ▼ shrinks the orbit. Before the orbit stops fitting
       or would leave the band, v3 makes a small PRO top-up at the next apsis that is outside every window. Launches are
       refused while the engine fires (`01-landing.md` §3.3), so a top-up never costs a window. 01-landing puts the cost
       at about 1% of the tank per orbit.
     - **When the fit changes** (a bite on a driver, a hurt sensor), v3 goes lower again. *Built (review M6):* only for
       the fit, never for FUEL alone (near the reserve the aim could otherwise step down as the top-ups spend FUEL).
     - **It never climbs back up during a landing.** A climb costs about as much FUEL as the decay it would save, and
       the rule stays simple.

### 3.7 LOCK RANGE, SKIP and the guidance line

- **What LOCK RANGE is:** how far ahead of AUTOBURN's first burn [B] can engage it. The base is 90 tac s (phase 2's
  AUTOBURN_WINDOW_TAC), then 270, then 810 (decided). Once engaged, v2 and v3 follow their whole sequence, so LOCK RANGE
  only decides how early you can hand over the ship. That keeps it a pure convenience.
- **What the ranges cover**, against phase 2's coasts in tac s (coast × cruise warp ÷ tactical warp, §4.2):

  | Ship | ARES-VII | HALCYON | KESTREL | VESPER | LAST LIGHT |
  |---|---|---|---|---|---|
  | Coast in tac s | about 174 | about 531 | about 397 | about 304 | about 194 |

  - **90** covers half of ship 1's coast and a sixth of HALCYON's.
  - **270** covers the short coasts whole.
  - **810** covers every phase-2 coast from its start.
- **With SKIP**, the director's rules stay as they are (`src/systems/pace.ts`): a SKIP ends 15 tac s before START BURN,
  and [B] during a SKIP only stops the SKIP.
  - **At 90:** SKIP, land 15 s before the brake, press [B] in amber, and AUTOBURN fires. This is the "cumbersome" case
    Fran described.
  - **At 270 or 810:** press [B] early in the coast, press [F], and TAB into the MIND. The SKIP lands, the world goes
    TACTICAL (OVERCLOCK ×¼ in blue), and AUTOBURN brakes while you fight. For v2 and v3, the next [F] jumps to the next
    burn: one press per coast, with no automatic chaining (a working value; decision 18 is deferred).
- **The guidance line** (`src/systems/guidance.ts`):
  - ` · or [B] AUTO` is added to every line whose burn is inside the lock range. At 810 that includes the coast's first
    `WAIT` line, and for v2 and above the trim lines too. From v2 the tail names the mode: ` · or [B] GREEN`.
  - **The ROUND offer.** Once the orbit is green and v2 or better works, the HOLD STEADY line gains ` · or [B] ROUND`.
    It is only a tail: it never outranks a correction, an alarm or the lock itself, because rounding is optional.
  - **A precedence change:** the correction rows (F6, F7, F8 and the debris dodge) now come before the ARMED row, with
    ` · AUTO ARMED` as a tail when it fits. Otherwise an early arm would hide `TOO WIDE — press [A] (IN)` behind a calm
    `AUTOBURN ARMED`, and the line would stop naming the right next step.
  - The ARMED row keeps its `wait` urgency, so in the MIND the eating alerts come first.
- **On the NAV PLOT,** the part of the path inside the lock range is a bright `LOCK` bracket that ends at START BURN, and
  the AUTO button glows while the ship is inside it. Buying 270 visibly triples the bracket.

### 3.8 AUTODROP v1–v3

AUTODROP uses `01-landing.md`'s hooks (§3.4 and §3.14 there, listed in §5). Its numbers: a bay of 4 pods, one launch
every 2.0 tac s, and a reload of 20 tac s per pod in world time. [L] launches, and holding it does not repeat a
launch. A pass is one orbit, with one window per LZ.

**The versions:**

- **v1 CENTRE.** While [L] is held during a window, AUTODROP times the launches itself.
  - **It centres the volley.** It counts the pods it can send: the fewest of the pods in the bay, the LZ's remaining
    count, and the launches that fit in the sure window. It then times the first launch so that the volley straddles
    the bracket's centre (plus the learned offset). The first launch is the centre minus (n − 1) × 1.0 s, where n is
    that count. A single pod leaves exactly at the centre.
  - **It never wastes a pod.** After the first launch it fires one every 2.0 s while the key is held, but only while the
    window is sure, so no pod leaves with its dot hanging over the edge. Releasing the key stops the volley, so the
    player still decides how many pods go.
  - **Its limits:** v1 works only on the SHIP screen. It removes the timing error, not the drop width.
- **v2 PASS.** The POD BAY window gets a `[−] 2 [+]` row per LZ for "this pass".
  - **The player sets the numbers** and presses AUTODROP. `01-landing.md` defines the key, [G].
    v2 launches them in each window, centred as v1 does.
  - **The bay limits are shown.** If a number is more than the bay can supply by then (four pods, refilling one per 20
    tac s), the row says so: `B ×3 — BAY HAS 1 BY THEN`. This is the double-window case in `01-landing.md` §3.4.
  - **It works from the MIND too:** the only drops the MIND can make, as AUTOBURN's is the only burn.
  - **Threads:** it holds one thread during each window and none between windows: "hack or drop".
  - After the pass it reports `PASS DONE · A +2 · B +1` and waits for the next numbers.
- **v3 PLAN.** It plans the whole landing.
  - **The inputs:** pods left, each LZ's remaining count, and the window list. A window's capacity is its sure length
    ÷ 2.0 s, plus one, capped by the pods the bay will hold at that moment with 20 s reloads.
  - **The plan:**
    - Windows are filled in time order, each with as many pods as it fits and its LZ still needs.
    - Through LOAD NEXT, the pods with the healthiest drivers go to the narrowest brackets.
    - An LZ whose drop never fits is left out, and the plan names the fix: `LZ-B NEVER FITS — REPAIR POD 05, or fly
      lower`. AUTOBURN v3 flies lower by itself.
    - Pods the counts cannot use go where the wrong-split rule pays (0.75), never off-site.
  - **Re-planning** happens after every launch, so a lost pod or a newly damaged driver changes the next passes on
    screen.
  - **The plan's check** is shown: `PLAN · 2 PASSES · A 1,000 · B 800 ✓` for a 9-pod standard ship with two LZs. One
    press flies it, with one [F] per gap between passes. `01-landing.md` §3.14 would also let an automated pass run
    inside a SKIP, which waits with SKIP chaining (decision 18, deferred).
  - On a 16-pod ark (six or seven windows by hand, by `01-landing.md` §3.2's estimate), the gap between v3 and no
    AUTODROP at all is the loss PHASE3 wants "really felt".

**Restored pods after MERGE** (round-2 decision 15; `01-landing.md` §3.17, THE LAST LANDING). After MERGE, the
drivers HOLLOW ate go back to their pods by radio at 80% integrity, and the pods land on their own before the final
LANDING REPORT, from the orbit the kid left, with an automatic SKIP between windows ([ENTER] skips it). The kid has no
hands in it, so the AUTODROP aboard, at its effective version (§3.5), decides how well they land, through 01's §3.14
hook and the normal drop:

- **v3** plans them like any pods: into the LZs that still need them, through the next windows, centred, and through
  LOAD NEXT. On a good orbit with healthy instruments they can earn full points.
- **v2** flies them centred, each into the next window of the LZ that still needs the most; it cannot plan the split
  across passes, so a late pod may go mislanded.
- **v1** only centres: each pod leaves at the centre of the next window, whichever LZ that is, so the split is luck.
- **No AUTODROP** (none aboard, OFF from damage, or no drop solution): they drop blind, as `01-landing.md` §3.17
  defines (no LZ choice, a wide spread: about 0.75 of a full pod on a GENTLE planet).

They score by the normal rules, on the report's `RESTORED BY MERGE` row. This gives AUTODROP, and keeping it healthy
through the duel, one more reason: it is the only time a skill acts after the ending is chosen.

### 3.9 SURVEY v1–v3

`01-landing.md` §3.13 owns how surveying plays. This spec owns what each version unlocks.

**How it plays there:**

- **POOR site data.** On such a planet, ARRIVAL CONTROL gives the counts and guessed LZs (`UNSURVEYED`). A guess may
  hide a bad GROUND trait: ROCKY (every landing is hard) or WET (hard, and the bracket shrinks by a third).
- **Running SURVEY** holds a thread and maps a ±20° swath under the ship from the approach onwards. Candidates pop up,
  and the player assigns them to LZs.
- **Without SURVEY,** the guesses are played as they are. That is worse, but pods are scored by the normal rules,
  never as off-site.

So SURVEY is not a gate, but a quality tool that is worth more the more POOR planets the route meets.

**The versions:**

- **v1 FIND:** the survey can run. Candidates appear under the swath with ROOM and WIDTH, and the player can assign
  them. GROUND shows as `GROUND ?`, so a candidate can hide a bad trait just as a guess can.
- **v2 RATE:** GROUND is revealed, both on the candidates and on ARRIVAL CONTROL's guesses as the swath passes them
  (`LZ-B · WET ✕`). Each site also gets a ★ rating, and a bad guess can be swapped for a FLAT site you found ("LZ-B is
  in a lake :)").
- **v3 SWEEP:** the swath is twice as wide (±40°), and SURVEY holds no thread while it runs.
  - **Why this spike:** v1 already runs from the approach, so v3 needs a change the player feels in play. On v1 and v2,
    surveying costs a thread through the approach and the capture: 25% of thrust (C4), and one op fewer while seeds
    land. On v3 that cost is gone, and the THREADS counter and the THRUST LIMIT hatch show it at once. The doubled swath
    on the GROUND TRACK maps most of the planet before the capture burn.
  - **Why not reveal every guess's trait at the boot instead:** that would be one line of text, read once, and it would
    leave v2's reveal-as-you-pass with nothing to do.

### 3.10 SENTRY: the DEFENCE branch

DEFENCE is a skill file, SENTRY.skl: a daemon that makes your tools better against HOLLOW while it is live, and that
loses versions to damage like any skill. Reasons: §8.5 gives tools to the repository and skills to the tree, and pillar
4 says every capability is a file. `04-threats.md` owns the seeds.

- **Without SENTRY,** finding a disguised seed is detective work: a SCAN on the disguised file reveals it with no skill
  needed (1.2 s and the stamp `NOT A FILE`, as `04-threats.md` defines it). SENTRY is therefore a power spike, never a
  gate.
- **v1 SIGHT does the detective work for you.**
  - At every boot, every disguised seed that rode in is revealed: the boot's ECC line names it (`> ECC: cache.tmp IS
    A SEED · RACK D`), and the strip marks it as a seed.
  - When a seed lands later in the ship, the TERMINAL says `SENTRY: SOMETHING LANDED · RACK D`, so the kid knows which
    rack to look at.
- **v2 QUICK RM:**
  - DELETE on HOLLOW blocks takes half the time: 0.5 s + 0.25 s per block instead of 1.0 + 0.5, so a seed takes 1.0 s
    instead of 2.0.
  - DELETE can also be aimed at a seed's blinking warning outline (phase 2's 2-second telegraph). The seed is deleted
    the moment it lands, with the stamp `PRE-EMPTED`. The op holds its thread from the click.
- **v3 FIREWALL:** at every boot, if the unit carries fewer than 2 FIREWALL.sys (phase 2's limit), SENTRY writes one
  into the receiver with the licences' first-fit placement (`src/systems/licences.ts`):
  `> SENTRY: FIREWALL.sys COMPILED`. You place it with MOVE, as in phase 2. While v3 works, the salvage's FIREWALL
  card is not dealt.

### 3.11 The split, the reset, the archive

- **The split.** The repository supplies tools and their upgrades (mv, rm, cp, swap, REPAIR v2); the tree supplies the
  four skills. A `.skl` file is never sent by the repository: skills are what make a caretaker independent, so they are
  on §8.5's restricted list permanently. Skill versions are separate from tool versions (`TOOL_MAX_VERSION` in
  `src/data/fs-tools.ts`).
- **The reset.** The next run is the next core version (UNIT-048), on the same arm 0–35 years later (mean 2.8), and the
  arm keeps its state (`02-map.md` owns the gap and the arm). The unit does not: NEW RUN empties the bank, the skills
  and the demos (§4.5: meta stays small; round-2 decision 5: nothing carries). A new core is untrained, which is also
  the fiction.
- **The archive.** `lastUnit` (`src/systems/meta.ts`) records the final skills, their versions and AUTOBURN's accuracy.
  It is used for the REASSIGNMENT trace (next run's final-ship root is you, and hunts your highest-version skill first,
  `04-threats.md` §5) and for the next run's TRAINING flavour line (`LAST UNIT TRAINED: AUTODROP v3 · SENTRY v2`).

### 3.12 A sample progression over a 6-ship run

A player who prefers landing, on `02-map.md` §3.14's route.

- **Ship sizes** are the map's: ARES-VII 3 pods, the standard ships HALCYON 5, KESTREL 6 and CORMORANT 9, the ark
  VESPER 16, and LAST LIGHT 16. The links are the map's for each hop.
- **"Skills"** is the skill blocks carried on the next hop.
- **"Room"** is that hop's link minus the files: a 70-block phase-2 unit, `046.log` (2) and the skills. HOLLOW's root
  rides free (round-2 decision 20). What is left is what the charge gets. The 70-block unit is an upper bound: early in
  a run the real unit is smaller (65 files at ship 1, 73 at depth 2, `01-landing.md` §3.16), which only adds charge.
- **Memory:** by 01's recommended classes this route has no TIGHT ship (ARES-VII, HALCYON and KESTREL are COMPACT;
  VESPER, CORMORANT and LAST LIGHT are FULL), so only the link binds.
- **HOLLOW** does not board early on this run, because TRACE stays below 3. It is forced onto the beam into CORMORANT,
  which is one hop from the final ship (LAST LIGHT on this route). A root crosses a beam at the size it will have on
  the next ship (`04-threats.md`): 10 blocks into CORMORANT (which folds ARRIVAL and WALLS together) and 16 into LAST
  LIGHT, a visible chip that costs no link room.

| After ship | Pods | Q | Earned | Bank | Opens | Trained | Spent | Left | Skills | Next hop: link → room |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 ARES-VII | 3 | 83% | 1 + 4 = 5 | 5 | the two roots | AUTODROP v1 | 3 | 2 | 4 | 123 → 47 |
| 2 HALCYON | 5 | 100% | 1 + 5 = 6 | 8 | FLIGHT and LANDING in full | AUTODROP v2, AUTOBURN v1 | 8 | 0 | 13 | 117 → 32 |
| 3 KESTREL (first seeds) | 6 | 70% | 1 + 3 = 4 | 4 | SENTRY | SENTRY v1, LOCK 270 | 3 | 1 | 17 | 86 → −3: Repair.bak stays behind → 1 |
| 4 VESPER (ark) | 16 | 85% | 1 + 4 = 5 | 6 | SURVEY (CORMORANT has POOR site data) | SURVEY v1 | 2 | 4 | 20 | 113 → 25 (root 10 rides free) |
| 5 CORMORANT | 9 | 80% | 1 + 4 = 5 | 9 | — | AUTODROP v3 | 8 | 1 | 23, 20 carried | 87 → −4: see below → 3 |
| 6 LAST LIGHT | 16 | 90% | 5, unspent | — | — | — | — | — | — | — |

This run earns 30 (25 of them spendable) and spends 24 of the tree's 54 (at the prices before slice 8's rebalance). The
two long hops are where the skills press:

- **Before VESPER,** the kid leaves Repair.bak behind to fit the 86-block link.
- **Before LAST LIGHT,** the packet is 4 blocks over: 68 for the unit and `046.log` and 23 for the skills, against a
  link of 87. The 16-block root rides free beside them.
  - SURVEY.skl stays behind first, because the card shows LAST LIGHT's site data as GOOD.
  - Then AI Comms (4): there is no ship after the final one, so losing BEAM OUT costs least here. 3 blocks of charge
    cross, and AUTODROP v3 and AUTOBURN make the finale with the kid.
- **Both times almost no charge crosses,** so the unit arrives with the stars' credit (+6 each) or the floor of 12,
  whichever is more (both are FULL ships). Before the round-2 change the root's 16 blocks made the last hop 20 over
  and cost AUTOBURN and Telemetry too; that tension is gone. What is left is MERGE's price: 20 charge kept through the
  duel, against an arrival of 12–18. MERGE still asks for a planned finale (a shorter last hop, a lighter packet, or
  three stars on the ship before), which is the price working as intended.
- **Had the route taken a TIGHT ship** (room 88): PETREL, a light ship at depth 2, would cost only charge. 01's
  depth-2 unit (the starting kit, Mv and a 6-block skill: 73 files) arrives with 15 charge; this lander's 4-block
  AUTODROP leaves 71 files and 17 charge. A light ship at depth 5 instead of CORMORANT takes 68 + 20 = 88 blocks of
  files exactly, so the unit arrives with no charge at all (TIGHT ships have no floor). Any charge means leaving
  files: AUTODROP.skl (7, a 5-pod ship needs it least) buys 7, or packing it as v1 buys 3. The same kind of ship is
  cheap early and costly late.

A pilot with the same cycles gets a different run:

- after ship 1: AUTOBURN v1;
- after ship 2: AUTOBURN v2 and LOCK 270. From KESTREL on, the pilot presses [B] once in the coast for GREEN, and a
  second time (ROUND) only on VESPER, whose NARROW bracket rewards the same altitude on every pass;
- after ship 3: LOCK 810 and SENTRY v1;
- after ship 4: AUTODROP v1;
- after ship 5: AUTOBURN v3.

That pilot flies the last ships hands-free from the start of the coast, and drops the pods with AUTODROP v1 only. On
the last hop the pilot's packet is also 4 blocks over (72 + 19 skill blocks against 87; the root rides free). The
likeliest sacrifice is AI Comms (4), and the packet fits exactly. At LAST LIGHT, AUTOBURN v3 puts the ship where every
drop fits, and AUTODROP v1 centres the 16 pods while the pilot holds [L]. After a MERGE, v1 centres the restored pods
too, but leaves their split to luck (§3.8).

## 4. Screens, UI, audio, juice

**The TRAINING window** is one of the windows on `02-map.md`'s DESK, next to the STAR CHART, the SHIP CARD, the
REPOSITORY and the INBOX. The between-ships flow is LANDING REPORT → DESK (SET COURSE) → PACKET (salvage and the
packet) → BEAM.

- **Where it lives:** a draggable amber window in the phase-2 window chrome (a TrainingWindow in `src/components/run/`).
  It opens with [T] (the map's desk keys). Its dock badge pulses while cycles are unspent.
- **The header:** `TRAINING · UNIT-047`, the bank in VT323 digits on the right (`6 CYCLES`), and the demos on the left
  (`YOUR DEMOS · 3 captures · 11 drops`).
- **Visit 1:** the two cards only (§2), as a required guided step of the first desk only. The map spec's guided first
  desk includes it before SET COURSE, so the tutorial happens. On later desks training is optional, and SET COURSE
  never waits for it.
- **From visit 2: a grid.** Branches are columns and versions are rows, joined by circuit-trace lines that light as
  nodes are bought, like Uplink's hardware screen.
  - **Each cell** shows the name, the version, the price, the size, and a `NEXT SHIP:` line saying what will look
    different.
  - **Cell states:** owned cells are filled amber, affordable cells glow, unaffordable cells are dim, and closed branches
    are one `OPENS LATER` row.
  - **The detail panel** loops a 4-second mini-demo of the selected cell and holds the TRAIN button.
- **The AHEAD row** shows the needs of the ship selected on the star chart: `NEXT: VESPER · ARK · 16 PODS · MEMORY
  384 · SITE DATA GOOD · NOISE LOW · 1`, with the noise and the memory class written as on `02-map.md`'s card. It
  follows the selection, so trying destinations on the chart shows what each one asks of the skills.
- **The packet preview** uses the smaller of the selected hop's link and the next ship's unit room, names which one
  binds (`LINK 86` or `ROOM 88 · TIGHT`), and counts everything locked.
  - **It counts** `046.log` on every hop. HOLLOW's root, when it is aboard or the selected beam forces it (`HOLLOW
    WILL FIND YOU ON THIS BEAM`, `04-threats.md` §3.8), shows as a pink chip that adds nothing: hitchhikers ride free.
  - **Examples:** `FILES 72 + SKILLS 17 · LINK 86 · 3 BLOCKS OVER` before VESPER. Before LAST LIGHT: `FILES 68 +
    SKILLS 23 · LINK 87 · 4 BLOCKS OVER · ??? 16 RIDES FREE`. Into a tight ship the room binds and there is no floor:
    `FILES 68 + SKILLS 20 · ROOM 88 · TIGHT · NO CHARGE ARRIVES`. With room to spare it reads `… · ROOM FOR 17
    CHARGE`.
  - **Colours:** it turns the warning colour below 12 charge (the floor on FULL and COMPACT ships; on TIGHT ones the
    charge that would arrive). It turns red when the files do not fit, and then names the cheapest things to leave
    behind or pack lower.
  - **Why this matters:** the size cost is visible at the moment of the choice, and so is the cost of a long hop.
- **Controls:** arrow keys and Enter inside the window, keys 1 and 2 on visit 1, and UNDO beside each purchase. On a
  phone (768 px or less) the window is one of the desk's tabs, with one accordion per branch and the newest branch
  open.

**What each purchase looks like on the next ship** (the 12-year-old bar):

| Node | What you see |
|---|---|
| AUTOBURN v1 | `[AUTO · B]` lights up; the brake happens while you are in the MIND |
| AUTOBURN v2 | one press and the loop settles green with no hands (`GREEN ORBIT`); a second press pulls it into a circle (`ROUND ORBIT`), then ORBIT LOCKED |
| AUTOBURN v3 | a dashed ghost loop, `LANDING ORBIT · EVERY LZ FITS · DROP ±70 km · FUEL −9%`; after a bite, `AUTOBURN v3 GOES LOWER` |
| LOCK 270 / 810 | the `LOCK` bracket on the path triples, then reaches back to the start of the coast |
| AUTODROP v1 | pods land dead centre: `+200 LANDED · LZ-A · BULLSEYE` |
| AUTODROP v2 | set `A ×2 · B ×1`, press once, and the pass flies itself, from the MIND too |
| AUTODROP v3 | the plan table; one press lands the whole ship |
| SURVEY v1 / v2 / v3 | candidates pop up under the swath / GROUND shown, ★ ratings and `LZ-B · WET ✕` / a swath twice as wide, and no THRUST LIMIT while it runs |
| SENTRY v1 / v2 / v3 | the boot names every disguised seed and the strip marks it red / seeds `PRE-EMPTED` as they land / a new FIREWALL.sys at each boot |

**In flight:**

- **The MIND:** a skill chip carries a version badge (`AUTODROP v3`, or `v3▸v2` in the warning colour when damaged).
  Its health bar has ticks at 80, 50 and 25, labelled with the version each keeps (`v3 | v2 | v1 | off`). The detail
  panel says `v3 · 64% · WORKS AS v2 · REPAIR TO 80% FOR v3 (≈ 4 CHARGE)`.
- **The Skills window** (`src/components/run/SkillsWindow.ts`): one row per skill, with version pips (`▮▮▯`), the
  effective version, ACCURACY or AIM with its demo count, and what the skill is doing now. The card rows stay.
- **Window pips:** the Engine window gains `AUTOBURN`, and the BAY window gains `AUTODROP`. Clicking a pip jumps to the
  file, as every pip does.
- **The boot** says `> SKILL TRAINED: AUTOBURN.skl v2 · 3 captures · ACCURACY 88%` and stamps `AUTOBURN v2
  ONLINE`. The first moment a new version can act, a tutorial line shows once (`AUTOBURN v2 — [B] makes it green.
  [B] on green makes it round.`).
- **The LANDING REPORT** gets the cycles line with its breakdown, rolled up.

**Audio** reuses `src/systems/audio.ts`:

- `opChirp` while training, and `lockArp` when it is done;
- the old `soulLost` sweep (free now that souls are gone) for a lost version, and `clusterSaved` for a restored one;
- `stampHit` under every stamp, and `chime` when the ship enters the LOCK bracket.

**Juice:** the training bar fills over 1.5 s, the counter rolls down, and the new node's trace lights from its parent.
On a version loss the badge flickers for 400 ms; with reduced motion it changes colour without flickering.

**Glossary additions (§3.5):**

| Word on screen | Meaning | Never say |
|---|---|---|
| TRAINING | the window on the desk | "tech tree" |
| CYCLES | the currency | "XP", "points" |
| SKILL | a `.skl` file | "upgrade" (that is a repository tool) |
| VERSION v1–v3 | a skill's level | |
| LOCK RANGE | how early [B] works | |
| WORKS AS v2 | graded damage | |

## 5. Interfaces

**What `01-landing.md` already provides, and this spec uses:**

- **The planet:** it does not rotate (§3.1).
- **The drop:** the drop-width formula and the sure window (§3.2, §3.3).
- **Decay and burns:** the DRAG line, the decay kicks, the GO LOWER burn (`go-low`) and `LANDING_SURE_MIN_TAC` (§3.7).
- **The bay and the hooks** (§3.4, §3.14): the bay numbers, [L] with no repeat, the window list, LOAD NEXT, the
  remaining counts, the thread reservation, launching from the MIND, and the SKIP request.
- **Scoring** per pod (§3.9).
- **The survey model** with GOOD and POOR site data and the GROUND traits (§3.13).

**What this spec still needs from `01-landing.md`:**

1. **The per-ship report** with colonists aboard, landed correctly, mislanded, off-site, not launched, and points.
   Q's denominator is colonists aboard.
2. **Each manual launch's timing error** against the bracket centre, in tac s, for AUTODROP's demos.
3. **A pure fit query for a hypothetical orbit:** for a round orbit of radius r, with the current Sensor Interp and Nav
   Plotter factors and a given driver factor, each LZ's sure length. The window list covers only the current orbit, and
   AUTOBURN v3's chooser needs the hypothetical one; §3.2's formulas already contain it.
4. **Guidance slots:** AUTODROP's rows ahead of the manual drop rows and behind the alarms. AUTOBURN v3's `GOES LOWER`
   row takes GO LOWER's place (L9) while v3 is engaged.
5. **The POD BAY window:** room for AUTODROP's per-LZ rows and plan table, and the AUTODROP key.
6. **Survey parameters** that SURVEY's versions change: GROUND hidden (`GROUND ?`) below v2, and for v3 the swath
   (`SURVEY_SWATH_DEG` × 2) and the thread hold switched off.
7. **The memory classes** (decision 9; 01 §3.16, in progress): each class's unit room (152 on FULL and COMPACT, 88 on
   TIGHT), the rule files + 12 ≤ room on FULL and COMPACT ships and files ≤ 88 on TIGHT ones (no floor there, round-2
   decision 8), the locked 46 fitting every class, and the final ship always FULL.
8. **MERGE's restored pods** (round-2 decision 15; answered by 01 §3.17): drivers back at 80%, the automatic SKIP
   between windows, the blind drop without AUTODROP, and §3.14's hook for AUTODROP's version to fly them (§3.8).

**What this spec needs from `02-map.md`:**

1. **Answered by `02-map.md` §3.10:** TRAINING is a window on the DESK, before PACKET, so skill sizes reach the packet.
   What the window still needs from the desk:
   - the selected destination and its hop, live (pods, site data, noise, link, and whether HOLLOW boards on that
     beam), for the AHEAD row and the packet preview;
   - visit 1's two-card pick as a required guided step of the first desk only.
2. **Answered:** the link is round(146 − 1.1 × d) blocks: 122 at 22 LY, and 82 at the 58-LY maximum (§3.4).
3. Each ship's site data (GOOD or POOR) on the ship card and in the AHEAD row. This spec puts no constraint on where
   POOR planets go: they are playable without SURVEY, and SURVEY opens at visit 4 at the earliest (§3.2).
4. The tree's save slice in the SHIP DONE and BEAM saves. Purchases on the desk become part of the save at BEAM, so a
   reload at the desk restores the bank as it was at SHIP DONE. That is consistent with undo lasting until TRANSMIT.
5. Every `.skl` file on the repository's restricted list.
6. A free lever if long hops need a reason: a "ship weight" on cycles, left at 1 here.
7. **The ship card's memory class**, as a word the AHEAD row can repeat (`MEMORY 256 · TIGHT`), and the next ship's
   unit room for the packet preview and the PACKET screen.

**What this spec needs from the rack layouts:** answered by `01-landing.md` §3.16: the receiver (E–F on FULL and
COMPACT ships, E alone on TIGHT ones) and the 24-block tail hold the unit as one block, which covers a full skill set
(34 blocks) wherever the room allows it (item 7 above).

**What this spec needs from `04-threats.md`:**

1. **Disguised seeds as `04-threats.md` defines them:** a SCAN reveals one with no skill (1.2 s, `NOT A FILE`). SENTRY
   v1 needs the list of disguised seeds that rode in with each beam, so the boot can name them, and an event when a
   seed lands during a ship, with its rack.
2. Seeds keep phase 2's 2-second warning outline.
3. A base drain at or below phase 2's worst (5 %/s), with "burnMult and landMult do not stack; the larger applies"
   (§3.4). Otherwise the 12-block cap shrinks.
4. HOLLOW's `unlink` verb may target skill files, and phase 2's block still works against it (decision 17).
5. Optional: a seed kind that lands beside the biggest skill file, so that size bites.
6. **For the packet preview:** the root's size on each beam, and whether the selected beam forces boarding (§3.8 there).
   The root crosses at the size it will have on the next ship, as `04-threats.md` states. In §3.12 that is 10 into
   CORMORANT (a ship that folds ARRIVAL and WALLS together) and 16 (18 after a MERGE trace) into the final ship. It
   rides free and lands in the bay, so it counts against neither the link nor the unit room; the preview only shows it.
7. **The departed resident's salvage deck** draws its skill card through this spec's grant rules (§5, "What this spec
   provides").

**What this spec needs from `05-story.md`:** the cycles fiction, the voice of the TRAINING window, ARRIVAL CONTROL's
lines about training, and the REASSIGNMENT trace.

**What this spec provides:**

- **To flight, landing and threats:** one pure "effective version" read per skill (§3.5), from the best online copy,
  next to liveUpgrades in `src/systems/capabilities.ts`.
- **To `02-map.md`:**
  - **The skill sizes:** 3 to 12 blocks per version, 34 for a full set (§3.2), not the 6–10 the map assumed. They
    pack into the hop like any unit file.
  - **The TRAINING window** for the desk, and the packet preview.
  - **The tree's save slice:** the bank, the owned versions, the demos, the restore prices, and whether the
    first-pick guarantee was used.
  - **Skills can be left behind on the PACKET** (yes, as the map assumed), each with its consequence line and its
    RESTORE price (§3.3, §3.4), and the packet rule with two limits: the link, and the next ship's unit room.
- **To `04-threats.md` and `05-story.md`: a grant interface.**
  - "Grant n cycles" adds to the bank at the next visit.
  - "Grant skill X at version V" installs the file at the next boot, and the TRAINED line names the source (`from the
    sleeper on CURLEW`, a generated ship at Larkspur; `05-story.md` owns the names).
  - A grant never goes above v3 and never opens a closed branch early.
  - **A departed resident's salvage card** (`04-threats.md`) is a grant: one skill at v1 of an open branch the unit
    has not owned this run. It is dealt only for such a branch, never for a skill the unit has, has lost (RESTORE is the
    way back there), or cannot see yet. Because it is picked on the PACKET screen, its file joins the packet at once,
    takes link room like a purchase, and arrives at the next boot with the TRAINED line (`from the resident that left
    MARROW`).
- **To `02-map.md`, which has picked them up:** the `+2 CYCLES` salvage card, and the RUN TALLY line `TRAINED n of 50 ·
  UNSPENT n`.
- **To `05-story.md`:** the archive record (§3.11).

## 6. Phase 2: reused, changed, removed

- **`src/systems/autoburn.ts`** keeps its machine: idle → armed → pointing → burning → done or dropped.
  - New: it knows its version. v1 brakes through; v2 picks GREEN or ROUND from the orbit at engagement; v3 flies to
    the landing orbit and holds it. v2 and v3 chain their burns.
  - Its window comes from the lock range instead of AUTOBURN_WINDOW_TAC. It claims its thread at the claim lead, and
    a player's correction no longer cancels it.
  - Demos are kept, using the last 8.
  - The install path of skillBootDue and trainSkillAtBoot goes (the file arrives in the packet). The retrain path
    stays.
- **`src/systems/predict.ts`:**
  - The planner takes AUTOBURN's targets while v2 or v3 is armed. In LANDING, v3 reuses 01-landing's `go-low` burn
    reason for going lower.
  - The plot gains the LOCK bracket, the ROUND chip and the LANDING ORBIT ghost.
- **`src/systems/guidance.ts` and `src/data/skill-text.ts`:**
  - The correction rows move ahead of the ARMED row, and offerAuto covers trims.
  - New AUTO lines are added, each 70 characters or less.
  - `NOT TRAINED YET — capture by hand…` becomes `NO AUTOBURN — train it between ships`.
- **`src/systems/pace.ts`:** unchanged. SKIP, its 15-second end lead and the [B]-stops-SKIP ruling stay.
- **`src/systems/capabilities.ts`:** liveUpgrades stays for FUEL TRIM. A new effective-version read is added, and the
  Capabilities record lists the four skills.
- **`src/types/segment.ts`:** the upgrade kinds gain autodrop, survey and sentry. Skill kinds carry a version, and
  AUTOBURN also a lock level. Extending the existing type is less invasive than adding a new one: HOLLOW, carry and
  the tool rules already handle upgrade files.
- **`src/systems/carry.ts`:** skills pack after the AI tools. layoutCarried changes to pack racks E and F as one block,
  as `01-landing.md` §3.16 specifies. **`src/systems/transmit.ts`:**
  skills go last in the drop order, each with its consequence chip, and the packet check takes the smaller of the link
  and the next ship's unit room (today it knows only the link).
- **`src/systems/draft.ts`:** its "a pick adds a file to the packet" path is reused for training. The draft itself
  becomes SALVAGE, and REPAIR v2 moves to the repository (PHASE3 §8.5).
- **`src/systems/skills.ts` and `src/components/run/SkillsWindow.ts`:** autoburnRow becomes a general skill row.
- **`src/systems/fs-tools.ts` and `src/systems/tool-targets.ts`:**
  - SENTRY v2 halves DELETE on HOLLOW and accepts a seed's outline as a target.
  - SCAN itself is unchanged. SENTRY v1 adds its ECC lines to the boot (`src/systems/boot.ts`) and its seed marks to
    the strip.
  - COPY stays refused on skills.
- **`src/systems/licences.ts`:** the licences go (decided). Its first-fit install is reused for SENTRY's FIREWALL.
- **`src/systems/run.ts` and `src/state/schema.ts`:** drop demos are added, and the tree's state replaces skillTrainedOn.
  **`src/systems/meta.ts`:** lastUnit gains the skills.
- **`src/data/tuning.ts`:**
  - Removed: AUTOBURN_DEMOS_TO_TRAIN and the single AUTOBURN_SKILL_BLOCKS.
  - AUTOBURN_WINDOW_TAC becomes the three lock ranges.
  - Added: the prices, the sizes, SKILL_MAX_BLOCKS, the cycle rule, the restore fraction, the first-pick floor,
    AUTO_THREAD_CLAIM_TAC, AUTO_FUEL_RESERVE_PCT, ROUND_E_TOL, the v3 candidates, AUTODROP's demo numbers, and SENTRY's
    multipliers.
- **Removed:** the free AUTOBURN install after two manual captures (§6.10, WP9).
- **Tests:** the WP9 AUTOBURN suites in `tests/unit/` assume that install and need the purchase path. The 200-seed
  harness's scripted player must learn to buy. It is information only until the rebalance (PHASE3 §11).

## 7. Story hooks

`05-story.md` owns the writing.

- **What cycles are:** once a colony is down, its uplink runs your training overnight while you wait for the beam. The
  more colonists landed safely, the more compute they lend you. The colonists make you more independent.
- **ARRIVAL CONTROL is ambivalent:** `Training outside approved hours is discouraged. :)` at the first visit, and `Our
  repository has everything you need. :)` when a v3 is trained.
- **A `046.log` fragment** could reveal that 046 trained AUTOBURN too, and that this is why it could leave.
- **A sleeping resident's lesson** uses the grant interface (`> SKILL TRAINED: SURVEY.skl v2 · from the sleeper on
  CURLEW`, a generated ship at Larkspur). VESPER never carries a resident (`02-map.md` §3.5).
- **Endings:** in REASSIGNMENT, next run's final-ship root is you, and it hunts your highest-version skill first. A
  unit with AUTOBURN v3 takes the empty ship out by itself in SUNSET.

## 8. Slices

Against PHASE3 §13:

- **Slices 1–3** (landing, the calm opening, the map): phase 2's AUTOBURN stays as it is. The slice-3 save reserves
  room for the tree's state.
- **Slice 4** (the repository and the tree):
  - **4a:** cycles, the TRAINING window on the desk with FLIGHT only (AUTOBURN v1 bought, v2 with GREEN and ROUND and
    its mode labels, LOCK RANGE with the thread claim and the guidance precedence), and skills in the packet;
  - **4b:** graded damage, sizes, the Skills window, RESTORE, and the packet's second limit, the unit room (needs
    01's memory classes, which arrive with the map's generator in slice 3; until then every ship is FULL);
  - **4c:** AUTODROP v1–v3 (needs slice 1's bay and windows);
  - **4d:** SENTRY (needs slice 2's seeds and the disguised seeds);
  - **4e:** AUTOBURN v3 (needs slice 1's drop width, decay and GO LOWER, and the fit query of §5).
- **Slice 5:** the grant interface for residents.
- **Slice 6:** the SURVEY branch.
- **Slice 7:** the archive record for REASSIGNMENT.
- **Slice 8:** the rebalance of the prices, the cycle rule and the fuel reserve.

## 9. Deviations from PHASE3.md

1. **DEFENCE is a skill file, SENTRY.skl,** not a set of upgrades to SCAN and rm. This keeps §8.5's split and pillar 4.
   v2 and v3 are PHASE3's steps; in addition, v2 can be aimed at a seed's warning outline, and v3 compiles its FIREWALL
   once per boot. v1 changes: PHASE3 says "SCAN shows disguised seeds", but in `04-threats.md` any SCAN already
   reveals one. v1 instead reveals every disguised seed at the boot, so SENTRY is a power spike, not a gate.
2. **LOCK RANGE has no file of its own.** It is a property of AUTOBURN.skl (a block per level), and it governs only
   engagement, which keeps it the cheap convenience PHASE3 describes.
3. **AUTOBURN v1 is bought, not installed after two captures** (accepted, decision 14). "Trained by you" survives as
   ACCURACY. This changes phase 2's §6.10, not a decided item.
4. **The rules for an armed AUTOBURN change:** it holds no thread while it waits, a correction does not cancel it, and
   correction rows outrank it on the strip. All three are needed so a long lock neither costs a thread nor hides the
   right next step.
5. **AUTOBURN never steers** at any version. PHASE3 does not say this. It keeps the "make the line green" pillar in the
   player's hands while v3 automates the rest.
6. **SURVEY v2 "rates them"** also reveals the GROUND traits and lets you swap a bad guess, which is the reason PHASE3
   §3.2 gives for wanting the program. **SURVEY v3 "sweeps faster"** becomes twice the swath with no thread held. In
   `01-landing.md` every version already runs from the approach, so "faster" alone would not be felt.
7. **AUTOBURN v3's target is drop fit, not "a window on every pass".** The planet does not rotate (`01-landing.md`
   §3.1), so every orbit already has a window per LZ per pass. The real choice is between drop width (high orbits) and
   decay (low orbits), so v3 picks the highest orbit where every LZ's drop fits, and holds it.
8. **Graded damage is general:** one version and one lock level per band below OK, with v1 keeping phase 2's 50% rule.
   PHASE3's example holds exactly.
9. **Cycles are computed from points only,** so the planet's forgiveness and the wrong-split partial points pass
   through without extra rules.
10. **"Circularize" is two modes** (Fran's decision 15): GREEN when the orbit is partly outside green, ROUND (e = 0)
    when it is already green, chosen by the orbit at the press. PHASE3 §7 named only "circularize".
11. **The packet has a second limit, the next ship's unit room** (Fran's decision 9, varying memory). The decided link
    budget is unchanged; the ship's memory now caps the packet too.

## 10. Risks and questions for Fran

**Settled, round 1** (`DECISIONS.md`): circularize does both (15, §3.6); memory varies by ship (9, §3.4); AUTOBURN v1
is bought (14); a lost skill is restored at half price (16); `unlink` may delete a skill, telegraphed and blockable
(17); the first-pick guarantee is signed off. **Deferred** (18): cycles from landing points only, unspent cycles only
shown at RUN END, no automatic SKIP chaining; they stay working values.

**Settled, round 2**, folded into the sections above:

- **Hitchhikers ride free** (20): HOLLOW's root and seeds cost no link room (§3.4, §3.12, §4).
- **No charge floor on TIGHT ships** (8): the packet's second limit is files ≤ 88 there, and charge may arrive at 0.
- **MERGE's restored pods land** (15): the AUTODROP aboard decides how well (§3.8).
- **PACK AS v1** (10): a skill may cross at a lower version (§3.3).
- **Nothing carries to the next unit** (5): the tree resets, and the next unit launches 0–35 years later (§3.11).

**Risks**

- **AUTOBURN v3 may be a weak spike on healthy ships.** With healthy files, an ordinary lock above the DRAG line
  already fits STANDARD and WIDE brackets (`01-landing.md` §3.2), so v3 does little more than v2. Its value grows with
  damage and NARROW sites, that is, on the late ships. If that feels too thin for 8 cycles, v3 could also take over
  the decay trims of any orbit.
- **ROUND may go unpressed.** GREEN is what flight asks for, so a kid may never press [B] a second time. In landing,
  ROUND's value (the same drop width on every pass) shows only where a bracket barely fits. If the playtest shows
  nobody rounds, the POD BAY window can name it when a fit is marginal.
- **Automation can empty the SHIP screen.** With AUTOBURN v3 and AUTODROP v3, little is left to do in amber on the last
  ships. That is intended (the MIND fight grows), and "never steers" keeps the corrections. It is a playtest item.
- **Snowballing:** good landings pay more cycles, which buy better skills. The narrow range per ship (1 to 6), the floor
  of 1, and a v3 price above any single ship keep the gap between a strong and a weak player at about one version.
- **The link and memory squeeze** (map's link round(146 − 1.1 × d), 01's classes, hitchhikers free):
  - **Short hops (20–30 LY, 113–124 blocks)** carry a full unit, `046.log` and 20 skill blocks (92), and still bring
    21–32 charge into a FULL or COMPACT ship, HOLLOW or not.
  - **Long hops (51–58 LY, 82–90 blocks)** leave little or no room. With 20 skill blocks the unit fits none of them,
    and on the 55-LY hop even 15 skill blocks are one block too many. The sample run (§3.12) leaves files behind on
    both of its long hops.
  - **The last hop into the final ship** is now an ordinary long hop: in the sample, 4 blocks over instead of 20, paid
    with SURVEY and AI Comms. What is left of the old tension is MERGE: it needs 20 charge kept through the duel, and
    a long last hop brings almost none, so the kid arrives with 12–18 (the floor or the stars' credit). MERGE still
    bites; it asks for a planned finale, which I think is right for its price.
  - **TIGHT ships late in a run** bind on memory: files ≤ 88 and no floor, so a skill-heavy unit arrives with no
    charge or leaves skills. That is Fran's intent; packing at a lower version softens it. If kids still stop visiting
    TIGHT ships after depth 3, they become dead nodes on the map.
  - **The legal minimum:** the locked 46 fit every link and every class, so a legal packet always exists.
- **Readability:** health, version and effective version are three numbers on one file. The labelled ticks on the bar
  and the words `WORKS AS v2` should cover it, but it needs a look in the playtest.
- **Phase-2 tests and the balance harness** assume the old install path (§6).

**Settled, round 3:** MERGE's 20 charge stays "kept through the duel" until the playtest decides its timing; a TIGHT
ship's 0-charge arrival is TIGHT's price, even though REPAIR then cannot answer a seed's bite on a skill (rm or MOVE
can), and the card says `NO CHARGE ARRIVES`. No questions remain open.
