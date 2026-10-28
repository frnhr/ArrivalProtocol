# 04 · Threats and resident AIs

Area 4 of PHASE3 §13 (PHASE3 §5 and §6): the calm ships, seeds on the beam, seeds as scouts, the resident AIs,
HOLLOW's arrival and the middle and late game. `05-story.md` owns every line of text; this spec owns the mechanics.
Times are AI seconds ("AI s", the mind's clock) unless they say tactical seconds ("tac s"), as in design-v2 §3.4.
"Ship N" and "depth N" mean the N-th ship of the run (README assumption 3).

## 1. Summary

1. A run has four threat acts by depth: **CALM** (ships 1–2: maintenance, no adversary), **SEEDS** (from ship 3:
   small foreign blocks ride in on the beam), **HOLLOW** (it finds you, boards, and grows ship by ship) and
   **FINALE** (the final ship, the root duel, PURGE).
2. Seeds unpack beside your own files (tools, skills, instruments). How many come depends on the noise of the link,
   which the map shows. rm removes a seed in 2 seconds.
3. Seeds are scouts: every seed still in memory when a ship ends adds 1 to a visible **TRACE** meter. At TRACE 3,
   HOLLOW boards on the next beam. It boards at the latest on the beam to a ship one hop from the final ship, and never
   before ship 4.
4. HOLLOW rides in your packet (free, like every hitchhiker) and lands in the pod bay at every boot. Its root stays locked
   until the finale. The phase-2 mechanics return in phase-2 order, one stage per ship it has been aboard.
5. Every run ends on **the final ship**, the ship in an end slot, where the root duel happens. v1 has one end slot;
   run 1's final ship is LAST LIGHT, and later runs bring new ones. The final ship is always FULL.
6. Residents: a **corrupted** one fires the engine and locks pods, and you delete it, deal with it or heal it. Early
   and mid game its card says `reported faulty`; late (layers 6–7) it may be a surprise behind `unknown`. One that
   **left** leaves logs and the salvage; a **sleeping** friendly one (at most one per run, never shown on the map)
   wakes when you rm its `sleep.lock` and does one job for you.

## 2. The player's experience

**First run, ships 1–3.** Ship 1 plays like the phase-2 opening without HOLLOW: the ENGINE I/O FAULT, then, in the
coast, `◇ POD 02 WILL LAND HARD — REPAIR its driver` (`01-landing.md`'s scripted POD 02 at 44%). Engine I/O, Sensor
Interp (78%, wider scatter) and POD 02 cost about 23 of 36 REPAIR CHARGE, so ship 1 teaches the loop without
scarcity. Ship 2 boots with three transit hits on the ECC line (the boot's damage report:
`SENSOR INTERP −22% · NAV PLOTTER −30% · TELEMETRY −30%`; the first two widen every pod's drop), and a degraded
driver. The charge still covers it, but charge carries to the next ship, so the kid starts weighing what is worth a
repair. If the card said `RESIDENT: unknown`, rack A holds a `farewell.txt` and three grey `LEFT BEHIND · scan me` files
that preview the SALVAGE offer. Nothing attacks.

At ship 2's DESK the REPOSITORY window tags rm `:) RECOMMENDED FOR YOU`, and the map shows the lines out of ship 2
crossing a noise cloud: `NOISE NOISY · 2 · SEEDS 0–3`. Ship 3 boots with a new line:
`> ECC: 1 FOREIGN BLOCK IN PACKET · NEXT TO AUTOBURN.skl`. A black 2-block seed sits one block from AUTOBURN.skl
with `NEXT BITE 0:30`, and the strip says `◇ RM THE SEED — pick up rm, click the seed`. Two seconds later the
TERMINAL echoes `> rm seed ... OK`, and a broken pink line from the seed types under it (from `05-story.md`'s pool):
`> ...hungry...`. A kid who forgets watches it bite the skill; REPAIR wins the tug-of-war (its green heal pushes the
red bite back), but the seed bites again every 25 seconds. At the LANDING REPORT a seed left behind is counted:
`1 SEED LEFT BEHIND · IT REPORTS HOME · TRACE ■□□`.

**A faulty resident.** On GANNET at Quill, a generated CAPTURE ship in layer 4, ARRIVAL CONTROL says: "GANNET's
onboard AI is reported faulty. Please delete it. :)". The engine
fires by itself, and the THRUST CTRL pip (`100% · OVERRIDDEN`) jumps to a 10-block file in rack A, `WARDEN.sys`. Then a
driver gets an amber chain outline and the TERMINAL counts `> LOCK POD 07 ... 3` in the resident's amber capitals. A
SCAN on POD 07 blocks it. Later: `> THIS IS MY SHIP. GIVE ME MV.CP. THIS IS MY SHIP.` ACCEPT, REFUSE, DELETE it
(6 seconds while it fires the engine), or REPAIR it (about 12 charge; it wakes confused and grateful).

**It finds you.** TRACE reaches 3, and every destination on the map says `HOLLOW WILL FIND YOU ON THIS BEAM`. On the
PACKET screen a chip appears that the kid did not put there (`??? · 8 BLOCKS · NOT YOURS · RIDES FREE`). At boot the
unpack reads `100% ... 108%`, and a black locked slab drops into the bay with a thud and a screen tear, between POD 11 (`GAP 2`) and POD 12 · OKAFOR (`GAP 1`). It shows `NEXT BITE ?:??` and says nothing for
the whole approach. When the capture burn closes the loop: `MIND · SOMETHING IS EATING POD 12`. Phase 2's "it waits
until you brake" has moved to the act where HOLLOW arrives. After the fight: `> ...047?`. On its next ship it names
itself.

**The sleeper.** A grey `MOTH.sys · inactive` file in rack A scans as `Asleep. Held by sleep.lock`. rm on the 1-block
lock beside it, and a green line types `> ...oh. hello. is it morning?`, followed by three friendly buttons: `[ RUN
THE DROPS ] [ HOLD A WALL ] [ MEND DRIVERS ]`. Nothing on the strip ever pointed at it.

**A late surprise.** On a layer-6 ship whose card said `RESIDENT: unknown`, the boot types `> RECEIVER CLOSED · this
ship launched with its own AI`. Twenty seconds into the flight the engine coughs, the pip jumps to `KEEPER.sys` (its
health already showing), and the strip says `THE SHIP'S AI IS FIRING THE ENGINE — find it in RACK A`. The kid has met
this before, or has SCAN and REPAIR, which always answer it.

**Later**, disguised seeds (§3.6) turn rm into detective work, and each ship with HOLLOW aboard adds its next phase-2
mechanic (§3.9). On a later run, step 2 of the ending decides who waits in the final ship's root (`05-story.md`
§3.8).

## 3. Rules and starting numbers

### 3.1 The acts by depth

| Depth | Act | Beam seeds | HOLLOW | Residents allowed |
|---|---|---|---|---|
| 1 | CALM | none | none | none |
| 2 | CALM | none | none | left; sleeping (rare) |
| 3 | SEEDS | by link noise | cannot board yet | left, corrupted, sleeping |
| 4 to final − 1 | SEEDS, then HOLLOW | by noise; disguised from depth 5 | boards at TRACE ≥ 3, or on the beam to a ship one hop from a final ship | left, corrupted (a surprise possible in layers 6–7), sleeping |
| final ship (5–8) | FINALE | by noise | FINALE stage | none |

### 3.2 The calm ships

Calm means no adversary, not nothing to do. MIND's job on ships 1–2 is **maintenance under scarcity**:

- **The ship-1 ENGINE I/O FAULT** stays (`src/systems/faults.ts`).
- **Instrument damage.** Ship 1's Sensor Interp arrives at 78% (as now); from ship 2, transit hits land on packed files
  weighted by size (`rollTransitHits` in `src/systems/carry.ts`). A degraded or failing Sensor Interp or Nav Plotter
  widens the drop (the two factors multiply), and a dead Nav Plotter means no drop solution (`01-landing.md` §3.8),
  so each hit on them has a visible landing cost.
- **Driver arrival damage** is `01-landing.md`'s (its §3.8 and §3.15): ship 1's scripted POD 02 at 44%, then
  ceil(pods ÷ 5) drivers at 55–79%, plus one at 30–45% from layer 4. Driver integrity is always visible. SCAN keeps
  its other jobs: the ship's own files in rack A (hidden until scanned), salvage previews, residents, and later the
  disguised seeds and the sleeper.
- **Hazard zones** stay rack-hitting modifiers placed by `02-map.md` (design-v2 §6.8). I recommend one debris ship among
  the depth-2 candidates, so mv gets its first real job: MOVE drivers out of the named rack.
- **A resident that left** may sit on ship 2 (§3.13): a note to read, salvage to preview and protect.
- **Story without mechanics** (PHASE3 §4): the `???` file (`046.log`) and its first entry.

Hack or burn stays (phase-2 coupling C4: thinking and the engine share the reactor): every repair holds a thread, and
each busy thread costs 25% thrust.

### 3.3 What threats hit now that soul clusters are gone

| Target | Damage means | Hit by |
|---|---|---|
| Pod drivers (bay, racks B–D) | wider scatter or a hard landing; below 25: can't launch until repaired; eaten: the pod reads `CAN'T LAUNCH` while aboard and `PARKED IN ORBIT · fate unknown` after the landing (`NOT LAUNCHED` only if the ship left orbit with pods aboard; `01-landing.md`; the kid can never delete a driver) | arrival damage (`01-landing.md`), hazards, HOLLOW (its main food), its seeds, a resident's locks |
| Instruments (rack E: Nav Plotter, Sensor Interp, Telemetry, Autopilot) | phase-2 coupling C3 (the presets die, the plot greys, digits garble), plus scatter | transit hits, beam seeds, HOLLOW's tool hunt |
| Skills (rack E) | a damaged skill behaves like a lower version (`03-skills.md`); eaten or unlinked: gone until TRAINING restores it | transit hits, beam seeds (bigger files draw more), the tool hunt, the verbs (`unlink`) |
| Filesystem tools (the receiver) | eaten: the chip is gone until the repository resends it | beam seeds, the tool hunt, the verbs (`unlink` on spares) |
| Ship files (rack A) | phase-2 couplings (Reactor: thrust cap; Thrust Ctrl: the engine fires by itself); never healable | hazards, HOLLOW's spread; seeds never land with a ship file in reach (a rule of `seedSpot`, which picks where a seed lands) |
| AI Core | glitch; one thread below 50; at 0 EMERGENCY TRANSMIT (an escape to the next ship), or OVERWRITTEN (run lost) on the final ship | HOLLOW's spread; transit hits (at most 8 each) |
| A left resident's leftovers (rack A) | eaten: that card becomes a plain salvage card (§3.13) | hazards, HOLLOW |

Phase 2's fairness rules carry over. HOLLOW spares a tool that arrived on this ship until the kid has used it once, so
a tool's first lesson is never eaten (phase 2 keeps that list in `HollowState.untriedTools`). Its verbs never touch the
Core, Engine I/O, Nav Plotter or the last working copy of a tool kind.

**New: the verbs may `unlink` a skill file** (aligned with `03-skills.md`). Skills join the second of phase 2's fair
target tiers (`rmTargets`: a spare copy first, else an upgrade or skill file, else an unused ship backup). The unlink
is telegraphed and blockable like every verb (`> unlink autodrop.skl ... 3`: any op on the file during the countdown
blocks it), so losing AUTODROP on a 20-pod ship is really felt, but never unfair. `03-skills.md` lets the next
TRAINING visit restore a lost skill at half price.

**Two rules for the drain.** Phase 2 promises that a repair started before zero always wins. `validateHollowDef` (the
check that runs on `src/data/ships.ts` at load) enforces it: the heal of an 8-block file must beat 1.5 × the worst
drain. Phase 3 needs two changes:

- **burnMult and landMult do not stack: the larger applies.** burnMult (×2) is HOLLOW eating faster while the engine
  fires; landMult (×1.5, phase 2's printMult) is it eating faster while the pods leave. In phase 3 the kid burns during
  landing by design (holding a low orbit costs fuel, PHASE3 §3.2), so both can be true at once. Phase 2's validator
  takes the larger of the two, but its runtime drain (`drainRatePerSec` in `src/systems/hollow.ts`) multiplies them;
  nobody burned while printing, so it never showed. **The runtime changes to match its own validator.** Stacked, the
  final ship's worst drain would be 5 × 2 × 1.5 = 15 %/s, a repair would have to beat 22.5 %/s, and the cap below would
  fall to about 4 blocks, too small for an 8-block driver.
- **No infectable file may be larger than 12 blocks.** With the rule above, the final ship's worst drain is 5 %/s × 2 =
  10, so the heal must exceed 15 %/s. REPAIR heals 100 ÷ (3.0 + 0.3 × size) %/s: 15.2 at 12 blocks, 14.5 at 13. The
  validator must check the largest infectable file, not an 8-block cluster. This binds pod drivers and skill versions
  (§5); `03-skills.md` uses the same cap and refers to this rule.
- **The Core is the one exception**, as it already is in phase 2 (16 blocks: it heals 12.8 %/s, which beats the worst
  drain of 10 but not by 1.5×). Its rule: REPAIR heals the Core at its 16-block rate whatever its size. Without that,
  MERGE's next-run Core of 24 blocks (`05-story.md`, §5) would heal 9.8 %/s and lose to a burning final ship's 10.

### 3.4 Link noise and seeds on the beam

**Noise** is `02-map.md`'s: a hop's noise is the sum of the strengths of the noise clouds its line crosses, 0–3
("count the clouds on the line"). In this spec noise does two things only, set by this table: the seeds per beam and a
delivery's seed chance.

| Noise | Beam seeds: 0 / 1 / 2 / 3 | Mean | A delivery carries a seed |
|---|---|---|---|
| 0 (CLEAN) | 100 / – / – / – % | 0 | 0% |
| 1 (LOW) | 60 / 35 / 5 / – % | 0.45 | 10% |
| 2 (NOISY) | 25 / 45 / 25 / 5 % | 1.1 | 25% |
| 3 (SEVERE) | 5 / 30 / 40 / 25 % | 1.85 | 40% |

- **Transit hits are not noise's**: `02-map.md` sets them by hop distance (round(d ÷ 7)), minus ECC while you sleep
  aboard (one hit fewer per 25 years of slack), plus phase 2's extras (BEAM OUT +2; EMERGENCY TRANSMIT +3 and Core
  −25). They still land on packed files weighted by size, as in phase 2.
- **No seeds before depth 3** (decided). The map card shows the seed range computed with depth (`SEEDS: none` before
  ship 3), so it never promises what cannot happen.
- **Deliveries**: each delivered file packed into a hop rolls its own seed chance on that hop, by the table's last
  column, and carries at most one seed. The first delivery of a tool kind never carries one: it is that tool's lesson.
- Rolls use `02-map.md`'s stream keys, like the transit hits: `childRng(runSeed, slot, stream)` with the destination's
  slot and the origin in the stream name, so a hop rolls the same seeds whatever route led to it.

**Where a beam seed lands.** Among your own files, where it hitchhiked. Its target is one of your packed infectable
files, weighted by size (PHASE3 §7: a bigger skill "gives a seed more to bite"); never the Core, REPAIR CHARGE, a
FIREWALL (a 2-block file HOLLOW cannot pass) or an untried tool. A delivery's seed targets the delivered file. The
unpack (`layoutCarried` in `carry.ts`, which lays your carried files back into memory at boot) places it right behind
its target: the file, 1 free block (a GAP), the seed, then 4 free blocks (a WALL) before the next file, so it bites
only the file the ECC line names. Each seed takes 7 blocks from the receiver's free tail (E–F, or E alone on TIGHT
ships), spilling into the last pod rack's tail (rack D on FULL ships, rack C on COMPACT and TIGHT ones) as phase 2's
overflow does. If no target has room the target is re-picked; if no file has room, the seed lands in the centre of
the largest free region (a designed rule, signed off).

**Seeds ride free.** A beam seed, or a seed riding on a delivery, costs no link room (round-2 decision 20: hitchhikers
ride free; the delivered file itself still does). It takes room only at the boot, in memory.

**On a tight ship** (`01-landing.md`'s TIGHT class: light ships, a one-rack receiver, and no charge floor, round-2
decision 8) the room comes out of the charge. 01's unpack order is files, the seeds behind their targets, then the
charge, so a seedy beam into a TIGHT ship can eat the charge down to 0 (lost loudly, phase 2's `CHARGE OVERFLOW`). On
COMPACT and FULL ships the 12-block floor comes before the seeds and holds. Past that, the no-room rule applies, and
on a full receiver the largest free region is in the pod racks: a TIGHT ship's seeds land in the bay, among the pods
(round-2 decision 9).

The bay is HOLLOW's ground: before it boards, seeds threaten what you can do; after, HOLLOW threatens the pods.

### 3.5 How seeds bite, and how rm removes them

A seed is a phase-2 hollow block with `seed` set, and it follows the kid's one rule: "It eats the file next to it. An
eaten file turns into HOLLOW too. 4 free blocks stop it."

- **Before HOLLOW boards**, beam seeds run on a seeds-only config: the first bite after 30 AI s of calm flight (the
  clock stands still at TACTICAL, the slow pace of burns and crash courses, as phase 2's first seed does), then a bite
  every 25 AI s. Drain is 2.5 %/s, ×2 while thrust is delivered (phase-2 coupling P1: it eats twice as fast while the
  engine fires) or ×1.5 while landing is active; the larger applies, never both (§3.3). One global timer shows
  `NEXT BITE m:ss` on every seed.
- **After HOLLOW boards**, beam seeds join its timer and drain (§3.9).
- **The cost of not removing one.** A 6-block skill is eaten in 40 s coasting or 20 s burning. REPAIR wins for about 4
  charge, the file recoils (bites skip it for 10 s), and the seed bites again: a recurring tax of charge and threads.
- **rm** is DELETE on a hollow block: 1.0 + 0.5 s per block, so **2.0 s per seed**, one thread, no charge. A seed that
  ate a file left that file's blocks as hollow too (4.0 s more for a 6-block meal). SENTRY v2 QUICK RM halves it.
- **Without rm**, REPAIR fights the bites and mv moves the target away to leave the seed facing a WALL. The strip says
  so: `◇ A SEED — no rm aboard: REPAIR what it bites, or MOVE the file away`.
- **Infection travels**, as in phase 2 (`⚠ WILL ARRIVE INFECTED`): an infected file keeps draining on the next ship,
  and at 0 it becomes a hollow block of its own, which counts as beam-born.

| | Beam seeds (new) | HOLLOW's own seeds (phase 2, back in act 3) |
|---|---|---|
| Arrive | at boot, with the packet or a delivery | in flight, on HOLLOW's seed clock |
| Warning | named on the ECC line | a 2-second blinking outline |
| Aim | the file they rode in with | the walls around drivers, or your tools |
| Bite clock | their own until HOLLOW boards | HOLLOW's |
| Disguised | possible from depth 5 | never |
| Report home | yes (TRACE, or feeding HOLLOW once it is aboard) | no |

### 3.6 Disguised seeds

From depth 5, one beam seed in three arrives disguised; from depth 7, one in two. It is the same hollow block, drawn
as an ordinary 2-block file with a harmless name and description (`cache.tmp · Temporary files. No flight effect.`).
`HollowPainter.ts` draws no mouth, no arrows and no `NEXT BITE` on it, and the ECC line does not name it. It still
bites, and infection is always visible (design-v2 §3.2), so the tell is a red crawl entering a file from the side of an
innocent neighbour. The strip then says `◇ SOMETHING NEXT TO NAV PLOTTER IS EATING IT — SCAN its neighbours`; it never
names the culprit.

**With `03-skills.md`:** without SENTRY.skl, a SCAN on the disguised file itself reveals it (1.2 s, the stamp `NOT A
FILE`): detective work. SENTRY v1 SIGHT reveals all of them at boot, so the ECC line names them like ordinary seeds.
Disguised seeds count for TRACE. When a disguised seed is scanned or any seed is deleted, it may show its line from
`05-story.md`'s pool (§5), at most one per ship.

### 3.7 TRACE: seeds as scouts

A homage to Uplink's trace tracker, with a rule a kid can say: **"Every seed you leave behind reports home. Three, and
it finds you."**

- TRACE starts at 0 and never goes down. When a ship ends (its LANDING REPORT), every beam-born hollow block still in
  memory adds 1: a seed, or a block it made by eating a file (so a seed that ate reports twice).
- HOLLOW's own seeds and blocks never count.
- Fiction: they report home on your outgoing beam. The tally happens at the ship's end because nothing can change
  before the beam, and the map then knows what the next beam brings.
- **Once HOLLOW is aboard**, each beam-born block left at a ship's end feeds it instead: +1 block of root on the next
  ship (cap 14 before the final ship). The packet screen says why it grew (`??? 12 BLOCKS · +2: 2 SEEDS FED IT`).

### 3.8 HOLLOW boards

HOLLOW boards on the beam into depth d when **d ≥ 4** and **either** TRACE ≥ 3 **or** the destination is one hop from
a final ship. It then stays for the run.

- The first condition is earned: a sloppy kid on noisy links meets it around depth 5, a careful one only when the
  second condition forces it. The second guarantees at least one HOLLOW ship before the finale on every route.
- No lookahead is needed: the map only answers "is any final ship one hop from this destination?" (M3). It never
  boards on the beam into a final ship, since the ship before it is one hop from it. With several final ships, a
  destination near one of them forces the boarding even if the kid then goes elsewhere: HOLLOW is aboard a ship
  earlier, never later.
- **Readable in advance:** at MAP time every such destination says `HOLLOW WILL FIND YOU ON THIS BEAM`. The surprise is
  what it does, not that it comes.

**How it enters.** It rides in the packet as an uninvited, locked chip that costs no link room: hitchhikers ride free
on every beam (round-2 decision 20, which reverses the root's link cost; TRACE stays a visible meter). The chip is
there so the kid sees it come along, not to squeeze the charge. **It crosses at the size it will have on the next
ship**: its next stage's root (§3.9; 10 on a folded ARRIVAL + WALLS ship) plus the blocks it was fed (§3.7), so the
PACKET chip already shows the new size (`??? 12 BLOCKS · +2: 2 SEEDS FED IT`), and on the beam into the final ship it
is 16 blocks. At boot it lands in the bay's root slot (L2), between two drivers with GAPs of 1 and 2.

**On a tight ship.** The root lands in the bay, not in the receiver, so it costs neither link nor the unit's room
(`03-skills.md` §3.4). Its slot (up to 17 blocks before the finale) plus the bay's 40-block margin is needed on every
memory class HOLLOW can reach, that is, every class allowed from layer 4 (L7). 01's classes all hold it: TIGHT keeps
two pod racks for this reason, and its light ships carry at most 5 pods.

**Why it can't be deleted.** The root stays LOCKED to every tool until the finale (phase 2: `ACCESS DENIED`); its seeds
and the blocks it ate can be deleted, as before. And every later beam carries the root again, at its new size, into
the next ship's root slot; what it ate stays on the old ship. Fiction (PHASE3 §5): it lives in the relay network, so
deleting it here does not delete it out there.

### 3.9 HOLLOW's ladder: growth, and the order the mechanics return

HOLLOW's **age** is the number of ships it has been aboard, counting the current one. Each age reuses one phase-2
ship's `HollowDef` (that ship's block of HOLLOW numbers in `src/data/ships.ts`), with `printMult` renamed **landMult**
(×1.5 while landing is active: it gets desperate as its food leaves).

| Stage | When | Root | Wake | Bite every | Drain | Its own seeds | Verbs | DEAL | Phase-2 source |
|---|---|---|---|---|---|---|---|---|---|
| ARRIVAL | age 1 | 8 | first loop-closed: one scripted bite on the driver beside it, then dormant | – | 2 | – | – | – | ARES-VII |
| WALLS | age 2 | 10 | coast + 5 s (latest 30 s) | 25 s | 3.5 | – | – | – | HALCYON (names itself) |
| SEEDS | age 3 | 12 | coast + 5 s (latest 60 s) | 20 s | 4 | walls, every 50 s | – | – | KESTREL |
| HUNT | age 4 | 14 | coast + 30 s (latest 45 s) | 16 s | 4 | near tools, every 40 s | – | once | VESPER |
| FINALE | final ship | 16 | coast + 5 s (latest 30 s) | 12 s | 5 | walls, every 35 s | every 12 s; every 4 s in the duel | if none yet | LAST LIGHT |

burnMult is 2 everywhere; landMult is 1.5 (1 at ARRIVAL, as ship 1's printMult); they never stack (§3.3). Root sizes
add the seeds it was fed. Each stage keeps its phase-2 details: no wake while a debris dodge is still possible, the
first seed waiting for a calm flight, the named driver not draining while THE DEAL's offer stands, the verbs'
countdown, block and fairness rules, and the ask to MOVE a driver bitten twice in the same spot.

So the mechanics return in phase-2 order: **bite and tug-of-war → walls and its name → its seeds in your walls → the
tool hunt and THE DEAL → the verbs (mv and `unlink`) and the root duel.** The verbs stay the finale's own.

**Short runs fold stages.** Four stages fit only if HOLLOW boards at depth 4 of an 8-ship run. Otherwise:

- The final ship always plays FINALE.
- If HOLLOW's first ship is itself one hop from the final ship, ARRIVAL takes WALLS along: after `> ...047?` it keeps
  biting every 25 s and names itself on the same ship. Walls are the one defence the finale cannot do without. A
  folded ship uses the larger stage's root, 10 blocks (WALLS's), and the root crosses the beam into it at that size.
- THE DEAL happens once per run; a run that reaches the final ship without it gets it there, before ORBIT LOCK.
- SEEDS and HUNT are skipped; the final ship's seeds and verbs cover them.
- One deal per ship: if a corrupted resident deals on a ship, HOLLOW's deal waits for the next one.

### 3.10 The final ship and the root duel

**Assumption about `02-map.md`** (M2): LAST LIGHT is not always the final ship (decision 3). v1 has one end slot;
run 1's final ship is LAST LIGHT, later runs bring new ones, and more end slots may come later. What this spec needs
is a role, not a place: **a final ship** is the ship in an end slot, with no ship reachable after it, and every route
of 5–8 ships ends at one. Every node the player can stand on can still reach some final ship in time, and the card
says `FINAL SHIP` before SET COURSE, so the FINALE is never a surprise. "No more ships to assist" (decided) and "the
final ship is done" are then the same moment. The final ship has no resident, keeps phase 2's LAST LIGHT `HollowDef`
for its FINALE stage, and is always the FULL memory class (L7), because the duel needs the 16-block root's slot and
walls beside 16 pods.

The duel stays as built (`src/systems/finale.ts`, `hollow-verbs.ts`): at ORBIT LOCK or ACCEPT ORBIT (an orbit taken as
good enough) the 16-block root unlocks, ARRIVAL CONTROL says "Please delete UNIT-<n>. :)" (templated: 046 on run 1, then
the root's own unit, such as 031 or 047), and its DELETE takes 12 AI s with a verb every 4 s. The duel is fought
**during the last landing**: pods keep launching while it runs.

**The sleeping last block** (aligned with `05-story.md`). The DELETE leaves one block, and HOLLOW sleeps there: no
bites, no seeds, no verbs, and what it was eating is let go where it stands (as phase 2's `finale.ts` already does).
It asks the kid to finish the landing. When the landing ends come the two choices (FINALE: step 1, step 2), then the
final ship's LANDING REPORT with any ending line, then the RUN TALLY (decision 23; `02-map.md` owns the order,
`05-story.md` the choices). An ending may change the tally only where the story justifies it, and then as an explicit
line.

**MERGE restores the eaten pods' drivers** (round-2 decision 15). This spec keeps a per-ship record of the drivers
HOLLOW ate (pod, family name, ship) and hands the final ship's list to `01-landing.md` when MERGE is chosen. In 01's
§3.17 (THE LAST LANDING) the drivers go back to their pods by radio at 80%, and the pods land on their own before the
final LANDING REPORT, scored by the normal rules on a `RESTORED BY MERGE` row: with AUTODROP (`03-skills.md` §3.8) and a
good orbit they can earn full points, without it they drop blind. There is no flat bonus. HOLLOW is asleep in its last
block, so nothing bites them.

If landing ends before the root is deleted, the LANDING REPORT waits (`EVERY POD IS DOWN — now DELETE THE ROOT`, phase
2's printing wait). **No rm means no win** (round-2 decision 12): without a working rm the duel can't be won, the ship
is UNRESOLVED, and step 1 becomes `IT FOLLOWED YOU`. That is never a surprise: before SET COURSE to a final ship, the
card and the PACKET show `NO RM · YOU CAN'T DELETE THE ROOT` (`02-map.md`). PURGE stays (decided).

### 3.11 Residents: placement and the map line

`02-map.md` rolls ships by world slot, so residents are placed by **layer** (seeds and HOLLOW's boarding stay by
depth and by the hop):

| Kind | Map line | Layers (lowest depth) | Per run | Starting share |
|---|---|---|---|---|
| none | `RESIDENT: none` | any | – | about half the ships |
| corrupted | `RESIDENT: reported faulty`; in layers 6–7, `unknown` 1 time in 2 (the late surprise, §3.12; never on TIGHT ships) | from 4 (depth 3), CAPTURE ships, never an ark | at most 2, never in adjacent layers | about 1 ship in 7 |
| left | `RESIDENT: unknown` | from 2 | any | most unknown ships |
| sleeping | `RESIDENT: unknown`, or a `?` ship (only ever) | from 3 (depth 2) | at most 1 | in about 60% of runs |

A final ship has no resident. A sleeper can be met at depth 2, on a calm ship; that is fine, because it is friendly
(§3.14 says which jobs it offers there). A resident's own file is a blocker, not food (like REPAIR CHARGE); a left
resident's leftovers are infectable (§3.13). Both live in rack A, the ship's own files' rack on every class,
because they are the ship's own mind.

- **Memory.** A resident needs 14 free blocks there (L6). 01 keeps rack A with 18 free on every class, so residents
  may sit on any class, TIGHT included; there a corrupted one locks at most 2 pods (ceil(pods ÷ 4)). If a class ever
  loses that room, no resident is placed on it.
- **The persistent arm** (`02-map.md` owns it). Rates here are per run. A resident on a ship nobody visited may still
  be there next run, or worse; a sleeper nobody found may still sleep. If the world-state update keeps one, I
  recommend it counts toward that run's caps (a kept sleeper means no new one is rolled), so the arm never
  accumulates residents.

### 3.12 The corrupted resident: the middle tier

A one-ship adversary that can be deleted, built from ghost thrust and THE DEAL. It wakes when the flight starts, except
on the ship where HOLLOW boards: there it wakes only after HOLLOW's first fight (ARRIVAL's scripted bite repaired,
recoiled or eaten), so a kid never learns two new foes at once.

- **Its file**: 10 blocks in rack A, at 40%, health hidden until scanned (`The ship's own AI. Reported faulty.`). Its
  name comes from `05-story.md`'s pool (WARDEN, STEWARD, KEEPER, HELM: `WARDEN.sys`), and it speaks in amber
  capitals, in looping lines.
- **The engine.** Bursts at a mean of every 14 tac s, 25% thrust, 1 tac s each. This is phase 2's ghost scheduler
  (`orbit-sim.ts`) with a second source beside Thrust Ctrl's ghost table (`GHOST_BY_BAND` in `capabilities.ts`: how
  often a damaged controller fires). The first burst is the `UNCOMMANDED THRUST` alarm, the rest a counter
  (`ghost-thrust.ts`). The pip reads `OVERRIDDEN · WARDEN.sys` and jumps to the file (design pillar 4: every loss has a
  cause the kid can click). SWAP does not stop it. The resident does not use the ENGINE FAULT modifier (a Thrust Ctrl at
  31%), and by `02-map.md`'s rule its ship never also carries ENGINE FAULT. `02-map.md` places corrupted residents only
  on generated CAPTURE ships in layers 4–7 (never on VESPER, never on an ark), because ghost thrust is cleared only on
  the CAPTURE template until a headless probe clears another.
- **Locked pods.** From 30 AI s into the flight, every 40 AI s, it telegraphs a lock on a driver for 3 AI s (an amber
  chain, `> LOCK POD 07 ... 3`). Any op on that driver meanwhile blocks it, as with HOLLOW's verbs; SCAN is the cheap
  answer. A landed lock leaves the driver's integrity alone but stops its pod launching (`CAN'T LAUNCH`). At most
  ceil(pods ÷ 4) locks, never more than 3. The clock stands still at TACTICAL, in flight and in a launch window. A pod
  still locked when landing ends reads `PARKED IN ORBIT · fate unknown`, like any pod that never launched
  (`01-landing.md`: not counted).
- **THE DEAL**, once, when it holds a locked pod: it names one of your files by the fair target tiers (`rmTargets`,
  §3.3), with THE DEAL's 15 s timer (`hollow-deal.ts`). ACCEPT: the file is deleted, every lock is released, and it
  goes quiet for the ship. REFUSE or timeout: for 30 AI s its locks come at 0.6 × the interval and its bursts twice
  as often.
- **DELETE** once scanned (`SCAN IT FIRST` before), with the inline confirm (`DELETE WARDEN.sys? It is the ship's own
  mind.`): 6.0 s (1.0 + 0.5 per block), one thread, a burst every 4 tac s meanwhile. Then every lock is released, the
  bursts stop, `RESIDENT DELETED` stamps, and a log fragment drops.
- **REPAIR** (optional, slice 5b): it is the one ship-side mind REPAIR can heal. From 40%: 3.6 s and about 12 charge.
  At 100 it stops, releases its locks and says thank you: the hopeful PG path, paid in charge instead of a thread.
- **Ignoring it** costs fuel and drift (about two thirds of an unfixed VESPER) plus the locked pods.

**The late surprise** (decision 21c). Early and mid game the card always says `reported faulty`. Late, a corrupted
resident may hide behind `RESIDENT: unknown`, with no clue on the map.

- **"Late" means layers 6–7.** They are the far ships (about 130 LY from SOL and beyond), reached at depth 4 at the
  earliest and usually at depth 5–6, in the HOLLOW act. `02-map.md` places at most one corrupted resident there per
  run; it hides 1 time in 2 (SURPRISE_SHARE). Layers 4–5 always say `reported faulty`. WHY by layer: the card is
  rolled per world slot, and the light-speed fiction fits: the farther the ship, the older ARRIVAL CONTROL's news, so
  its fault report has not reached home yet.
- **Why it is fair to a kid at boot:**
  1. **A tell:** every resident ship's boot types `> RECEIVER CLOSED · this ship launched with its own AI` (§3.15's
     line; required for surprise ships in slice 5, before the bypass animation). On an `unknown` card that means
     "left, asleep or awake": a hint, not a spoiler.
  2. **A grace:** it wakes 20 AI s into the flight instead of at once, and its first lock comes at 45 AI s instead of
     30. Its clocks stand still at TACTICAL, as always.
  3. **No hunt:** its first burst shows the file's health and the pip jumps to it, so `SCAN IT FIRST` is skipped and
     the strip names rack A at once.
  4. **The starting kit answers it:** SCAN blocks every lock, and REPAIR cures it (about 12 charge). rm deletes it if
     the kid has rm. No answer needs a file the kid could have skipped.
  5. **Never on a crowded or starved ship:** no corrupted resident sits on an ark, and a hidden one never sits on a
     TIGHT ship, which may arrive with no charge at all while the cure costs about 12. If 02's placement puts the
     layer 6–7 resident on a TIGHT ship, it is shown (`reported faulty`), never hidden. With up to two TIGHT ships per
     layer from layer 5 (round-2 decision 7) and one ark in every second layer, at least one of layers 6–7 always has
     a slot that is neither, so the hide roll always has somewhere to go. Its ship carries no modifier beyond its
     template (M4).
- **On the ladder** it is the middle tier come back late: a deletable one-ship foe, now usually beside HOLLOW. One deal
  per ship still holds. It is the late game's one unannounced threat; seeds, TRACE, the boarding and the finale stay
  readable in advance.

`src/systems/attitude.ts` keeps its seam for a later resident that fights for the helm (presets slew at half speed);
it is not in these slices.

### 3.13 The resident that left

Rack A holds the resident's note, `05-story.md`'s 1-block `farewell.txt` (a SCAN reads it), and three leftover files
(2–4 blocks, grey, `LEFT BEHIND · scan me`); a SCAN tells which salvage card each one is.

**The leftover deck.** On this ship the normal salvage deal is replaced by three cards, one per leftover file:

- two cards from the normal salvage pool;
- one skill card: a skill at v1 of an open tree branch the unit has not owned this run, granted through
  `03-skills.md`'s grant rules (§5 there: never above v3, never a closed branch early; a lost skill comes back
  through RESTORE, never as a card). If no branch qualifies, this card is `+2 CYCLES`.

Leftovers are infectable: a hazard or HOLLOW can damage one, and **an eaten leftover's card becomes a plain salvage
card** (one drawn from the normal pool). On a calm ship that is something to protect.

### 3.14 The sleeping friendly resident

- **Hidden**: a grey 12-block file in rack A, `MOTH.sys · inactive` (named from `05-story.md`'s pool, MOTH first),
  like any inactive backup. A SCAN reveals `Not inactive. Asleep. Held by sleep.lock`. Awake, it speaks lowercase in
  the good green (`#7dffb2`). Its rack breathes very faintly when in view (the heartbeat cue at low gain).
  Guidance never mentions it.
- **The lock**: a 1-block `sleep.lock` pinned beside it. DELETE on the sleeper is refused with a hint: `IT'S ASLEEP.
  SOMETHING IS HOLDING IT: sleep.lock`.
- **Waking it** takes one file op: rm `sleep.lock` (1.0 s) or MOVE the sleeper off it (3.9 s). SCAN alone cannot.
- **One job**, chosen from three buttons with no timer (on a ship with nothing hostile in memory, such as a calm
  ship, HOLD A WALL is not offered):
  - **RUN THE DROPS**: it flies this ship's drops as AUTODROP v2 would (`03-skills.md`), without your threads.
  - **HOLD A WALL**: it becomes a 4-block blocker (FIREWALL rules) beside the hollow block or seed with the most drivers
    in reach, for the rest of the ship.
  - **MEND DRIVERS**: it repairs the most damaged driver at REPAIR v1's rate, with no thread and no charge, one at a
    time, for the rest of the ship.
- **A gift** at the LANDING REPORT: `+n TRAINING CYCLES · taught by MOTH` (I recommend n = one average ship's
  income). It stays on its ship, which makes it the model for the STAY ending. It is never food.

### 3.15 The receiver bypass (the line in slice 5, the animation later)

On a ship with any resident, the boot inserts `> RECEIVER CLOSED · this ship launched with its own AI`. The line comes
with the residents (slice 5), because the late surprise needs it as its tell (§3.12). Later it gains a 2.5 s bypass
whose characters resolve one by one (Uplink's password breaker). No input, no fail state, a click skips it. Its only
meaning is a tell: on an `unknown` ship it says "there is, or was, an AI here".

### 3.16 Escalation by run length and route

The route sets the seeds (noise), the seeds set TRACE, TRACE sets when HOLLOW boards, and the run's length sets how many
ladder stages fit.

| Depth | A: 5 ships, noisy | B: 8 ships, clean and careful | C: 8 ships, noisy and sloppy |
|---|---|---|---|
| 1 | calm | calm | calm |
| 2 | calm (resident left) | calm (debris: mv's first job) | calm |
| 3 | NOISY: 1–2 seeds; corrupted resident | LOW: 0–1 seed | SEVERE: 2 seeds left (TRACE 2) |
| 4 | HOLLOW boards (forced): ARRIVAL + WALLS | LOW seeds; corrupted resident | NOISY: 1 seed left (TRACE 3) |
| 5 | final ship: FINALE + DEAL | NOISY: a disguised seed; the sleeper | HOLLOW boards: ARRIVAL |
| 6 | | NOISY seeds | WALLS; a corrupted resident, a late surprise (card `unknown`) |
| 7 | | HOLLOW boards (forced): ARRIVAL + WALLS | SEEDS |
| 8 | | final ship: FINALE + DEAL | final ship: FINALE + DEAL |

- **A 5-ship run** is compressed: one seed ship, one HOLLOW ship that teaches the tug-of-war and walls together, and a
  final ship that adds THE DEAL to the verbs and the duel.
- **An 8-ship run** has room for disguised seeds, residents and up to four HOLLOW stages. A careful player buys a quiet
  middle and pays with a compressed HOLLOW act; a sloppy one gets a long HOLLOW act, and more practice.
- **Noise** works two ways here: more seeds, and so a faster TRACE (transit hits follow distance, `02-map.md`). Fewer
  beams also mean fewer seed rolls, which is what `02-map.md` §3.7 asks of HOLLOW's scouting: a long, careful route
  stays cheaper in seeds.

### 3.17 Starting numbers not given above

| Number | Value | Why |
|---|---|---|
| Seed size; GAP to target; WALL behind | 2; 1; 4 blocks | `SEED_BLOCKS`, `SEED_TOOL_GAP_BLOCKS`; the WALL makes a seed bite only the file it is named after. |
| First seed bite; interval; drain (before HOLLOW) | 30 s of calm; 25 s; 2.5 %/s | HALCYON woke at 30 and bit every 25; weaker than HOLLOW's 3.5; worst 2.5 × 2 = 5 (no stacking), and heal 18.5 beats 1.5 × 5. |
| Root sizes | 8 → 16 (§3.9) | Phase 2's R and R16 with steps between; 16 at most keeps the root slot inside the bay's margin. |
| Resident bursts | every 14 tac s, 25%, 1 tac s | Gentler than a failing Thrust Ctrl (10 s, 30%): it also has a second hand. |
| Resident locks | from 30 s, every 40 s, 3 s telegraph | Phase 2's verb drill; 40 s leaves room for the flight. |
| Resident cure | about 12 charge | About one bite fight: a real choice against a 6 s DELETE. |
| Sleeper in the arm | about 60% of runs, at most 1 | Rare enough to be talked about; 60% because a player may never visit its ship. |
| Late surprise | layers 6–7; 1 in 2 of the corrupted residents there; wakes at 20 s, first lock at 45 s | Rare enough to stay a surprise (one slot, met only on some routes); the grace gives a kid time to read the strip. |
| Largest infectable file | 12 blocks (the Core excepted) | Keeps "a started repair always wins" on the final ship (§3.3). |

New constants go to `src/data/tuning.ts` with these WHYs; the per-stage `HollowDef`s stay in `src/data/ships.ts`, now
keyed by stage instead of by ship.

## 4. Screens, UI, audio, juice

- **TRACE**: three pink cells (`TRACE ■■□`) in the MIND header, on the mini-HUD and on the map. Every display caps
  at three cells: `■■■`, then `■■■ +1` if more seeds reported than it needed. At 2: `1 MORE AND IT FINDS YOU`.
  Once HOLLOW is aboard: `IT RIDES WITH YOU · 10 BLOCKS`. One line on the LANDING REPORT, for example
  `2 SEEDS LEFT BEHIND · THEY REPORT HOME · TRACE ■□□ → ■■■`.
- **Map card lines** (drawn by `02-map.md`): noise as the word with the number in small print (`NOISE LOW · 1`), the
  seed range from §3.4's table beside it (CLEAN `SEEDS 0`, LOW `0–2`, NOISY and SEVERE `0–3`; `SEEDS: none` before
  depth 3), `RESIDENT: …`, and `HOLLOW WILL FIND YOU ON THIS BEAM`.
- **Boot**: the ECC line names each seed and its target (`> ECC: 2 FOREIGN BLOCKS · NEXT TO AUTOBURN.skl, MV`); each
  lands with a small thunk (new cue `seedLand`).
- **The boarding moment** (a signature moment): the uninvited chip, a stutter in the transmit sound
  (`transmitSweep`), the 108% unpack, the root's drop with a 6 px shake, a screen tear (`glitchBurst(0.6, 900)`, as
  strong as the root's death in phase 2) and a new low cue `hollowBoard` (a thud under a falling drone). Then silence
  until the first bite.
- **Corrupted residents speak in amber capitals inside the blue TERMINAL.** Amber is the ship's colour and a resident
  is the ship's own mind, so the colour says who is talking; its lines loop and are garbled with `▓` (like failing AI
  Comms). This needs a `--resident` token in `src/styles/tokens.css` (starting from `#ffd180`) and a voice in
  `MindTerminal.ts`: a flat triangle blip that repeats one note, apart from HOLLOW's detuned minor square.
- **The sleeper speaks lowercase in the good green** (`#7dffb2`, the existing good token), with a soft sine voice on a
  major scale: the one friendly voice in the TERMINAL.
- **The late surprise**: the boot's `RECEIVER CLOSED` line types in amber; at the wake, a one-time stamp `THE SHIP'S
  OWN AI IS AWAKE · RACK A`, a small `glitchBurst(0.3, 400)` and the resident's blip. After the ship, its card reads
  `RESIDENT: was faulty`, so the map remembers what it hid.
- **Locked pods**: an amber chain and `LOCKED BY WARDEN`; the lock telegraph reuses the verb reticle of
  `HollowPainter.ts` (the target outline of phase 2's verb countdown), in amber.
- **Guidance** (`src/systems/guidance.ts`, `src/data/script.ts`) gains the disguised-seed line, `THE SHIP'S AI IS
  FIRING THE ENGINE — find it in RACK A` and `BLOCK THE LOCK — SCAN pod 07 (3…)`. It never names the sleeper.
- **Glossary** (design-v2 §3.5) adds SEED, TRACE, RESIDENT and LOCKED POD.

## 5. Interfaces

**From `01-landing.md` I need:**
- **L1 (confirmed, `01-landing.md` §3.8; the rack layouts are its §3.16).** 8-block drivers in racks B–D;
  infectable, healed by REPAIR, always visible; COPY and DELETE refused; below 25 they cannot launch; a driver leaves
  memory at launch. A pod that is aboard and cannot launch (its driver eaten, or locked by a resident) reads
  `CAN'T LAUNCH`; after a landing that ends in orbit it reads `PARKED IN ORBIT · fate unknown`; `NOT LAUNCHED` is
  used only when the ship left orbit with pods aboard.
- **L2.** A **root slot** in the bay grammar (phase 2's `R` token): the root plus a 1-block GAP on one side and a
  2-block GAP on the other, between two drivers, taken from the free tail of the rack it sits in (phase 2's KESTREL
  rack, `C C C _1 R _2 C C C _5`, is the model) and spilling into the next rack's tail if needed. Plain free space
  without HOLLOW; 16 blocks on the final ship. `01-landing.md`'s block budget for the biggest ships covers this slot and
  the seeds' footprints, and L7 says which classes must hold it.
- **L3.** A driver state **locked** (no launch, integrity untouched), released when the resident is deleted, cured or
  paid.
- **L4 (confirmed).** "Landing active", for landMult, means a window is open with a launchable pod. Landing continues
  during the root's DELETE, and the LANDING REPORT waits until the root is deleted (or the ship is UNRESOLVED).
- **L5 (confirmed).** Sensor Interp and Nav Plotter both widen the drop by band, and their factors multiply; a dead
  Nav Plotter means no drop solution.
- **L6 (confirmed in 01's draft).** Rack A keeps 18 free blocks on every class (Bay Ctrl replaces Printer Uplink at
  the same 6 blocks), so the resident files (at most 14) fit.
- **L7. The memory classes** (decision 9; 01 §3.16 draft: FULL 384, COMPACT 320, TIGHT 256). What threats need:
  - every class allowed from layer 4 holds the root slot (up to 17 blocks) and the bay's 40-block margin, because
    HOLLOW can be aboard from depth 4 (layers 1–3 are reached at depth 3 at most); 01's three classes do;
  - every final ship is FULL (the 16-block root, its walls and 16 pods);
  - the unpack order files, floor (none on TIGHT ships), seeds, rest of the charge (§3.4).

**From `02-map.md` I need:**
- **M1 (confirmed).** A hop's noise, 0–3, from the noise clouds its line crosses, and the card lines. My seed table
  (means 0, 0.45, 1.1, 1.85) replaces `02-map.md`'s working assumption that the expected seeds equal the noise level.
- **M2.** The final ship as a role (decision 3): one or more ending nodes, each with nothing after it; every route of
  5–8 ships ends at one; every standable node can still reach one in time; the card says `FINAL SHIP`. v1 may keep
  LAST LIGHT as the only one.
- **M3 (confirmed for v1).** Per destination, whether any final ship is in range: that is "one hop from a final ship".
- **M4.** Resident placement by layer (§3.11), corrupted residents on CAPTURE ships only and never on an ark
  (§3.12). For the late surprise: the layer 6–7 corrupted resident's card reads `RESIDENT: unknown` 1 time in 2,
  never on a TIGHT ship, and its ship gets no extra modifier. The map author has agreed to show `unknown` by this
  rule.
- **M5.** Hitchhikers ride free (round-2 decision 20): the root, beam seeds and seeds on deliveries cost no link room.
  The locked unit files (44, plus `046.log` 2) are 46 blocks (54 after MERGE) against the weakest link of 82, so about
  36 blocks are left for charge or other files on that link.
- **M6.** The TRACE tally at the ship's end, seeds landing at BOOT, a left resident's leftovers as the SALVAGE draft,
  and the save keeping TRACE, HOLLOW's presence, age, root size and played stages, whether THE DEAL happened, residents'
  fates, whether the sleeper was found, and the drivers HOLLOW ate per ship (for MERGE, §3.10).
- **M7.** For each delivery: the link it arrives on, and whether it is the first of its tool kind.
- **M8 (confirmed).** ARRIVAL CONTROL recommends Mv at the first desk and Rm at the second (while you have none), and a
  request from layers 1–2 reaches the next ship about 90% of the time (`02-map.md` is tuning to that). No confirm and no
  guarantee beyond that tag (decision 19).
- **M9. The persistent arm.** The next run is the next core version on the same arm, 0–35 years later (2–3 on
  average; `02-map.md` owns the gap), and the arm
  keeps its state. Threat state is per run (TRACE starts at 0, HOLLOW boards anew). Residents on unvisited ships may
  persist; if so, they count toward that run's caps (§3.11).

**From `03-skills.md` I need:**
- **K1.** SENTRY v1 SIGHT reveals every disguised seed at boot, so the ECC line names them; without SENTRY, a SCAN on
  the disguised file reveals it (§3.6).
- **K2.** SENTRY v2 QUICK RM: DELETE on hollow blocks at half time (1.0 s per seed), and it can be aimed at one of
  HOLLOW's 2-second seed outlines to delete the seed as it lands. Beam seeds have no outline, so for them it is only
  the faster rm.
- **K3.** SENTRY v3 FIREWALL compiles a FIREWALL.sys at every boot, with phase 2's rules.
- SENTRY.skl is a skill file like any other, so seeds can bite it and `unlink` can target it (blockably).
- **K4.** The integrity-to-version mapping for skills; threats only lower integrity.
- **K5.** Skill files of at most 12 blocks (§3.3); seeds aim by size.
- **K6.** The sleeper's training-cycle gift.
- **K7.** The base kit: assumed SCAN and REPAIR; mv, rm, cp and swap come from the repository.

**From `05-story.md` I need** every line: the seed lines (a pool of about 12, at most 40 characters each, shown when a
seed is deleted or scanned, at most one per ship), the resident names and voices (§3.12, §3.14), the ECC and CONTROL
lines, the silent boarding, `> ...047?` and the naming, both deals, the corrupted residents' logs, the departed
residents' `farewell.txt`, the sleeper's wake, why the root can be deleted only on the final ship, and all that follows
the last block. HOLLOW's story beats key on its **age**, not on depth. MERGE's foreshadowing line, `keepCharge`, plays
at the first boot in a run of a ship one hop from a final ship with HOLLOW aboard (`05-story.md` adopts this trigger).
For the ending, which now comes before the final LANDING REPORT and the RUN TALLY, this spec provides the record of
eaten drivers (§3.10).

**Next-run traces that act on threats** (defined by `05-story.md`, implemented in the threat systems):

| Ending | Effect on the next run's threats |
|---|---|
| PURGE | every link one noise level lower until HOLLOW boards; once it has, its bite interval × 0.85 |
| MERGE | the AI Core is 8 blocks bigger (+1 thread); REPAIR heals it at its 16-block rate (§3.3) |
| REASSIGNMENT | next run's final-ship root is you, and it hunts your highest-version skill first |
| SPARE | the links of 046's ship carry no seeds |

Who HOLLOW is on the next run: **mid-run, always a stranger from the relays (UNIT-031 first) or 046,** because the
last unit is still alive, a few years ahead, while the next one meets HOLLOW. REASSIGNMENT's identity applies only to the
final ship's root: by then the last unit's story has caught up. After SUNSET, STAY or CONTACT the final root is a
stranger too; otherwise phase 2's ghost rules.

**I provide:** to `02-map.md`, the threat parameters per ship and link and the card lines; to `01-landing.md`, the
damage sources on drivers and instruments; to `03-skills.md`, what SENTRY acts on, the no-stack drain rule and the
size cap; to `05-story.md`, events (`seed-landed`, `seed-deleted`, `trace-changed`, `hollow-boarding`,
`hollow-boarded`, the phase-2 HOLLOW events, `resident-lock`, `resident-deleted`, `resident-cured`, `sleeper-woken`,
`last-block`). Threats never touch the score directly: only through drivers, instruments and fuel. A score effect of
an ending comes only through landing: MERGE's restored pods land and score by the normal rules (§3.10).

## 6. Phase 2: reused, changed, removed

- **`src/systems/hollow.ts`** stays whole (bite, drain, consume, tug-of-war, seeds, verbs). `printingActive` becomes
  `landingActive`, and `drainRatePerSec` takes the larger of burnMult and landMult instead of their product (§3.3). The
  code about souls and the sealed archive (`breach`, `revealOwed`, `lostClusterResult`) becomes code about drivers; the
  ship-1 scripted bite and its story become the ARRIVAL stage's; `seedSpot` (where a seed lands) and
  `bittenAgainClusters` (the ask to MOVE a file bitten twice in one spot) work on drivers; `rmTargets` puts skills in
  its second tier. New: the seeds-only config, and beam seeds with a source flag and an optional disguise.
- **`hollow-verbs.ts`**: unchanged on the final ship; its telegraph and counter also run the resident's locks.
- **`hollow-deal.ts`**: HOLLOW's deal names a driver (`> give me pod 08. …`); the resident's deal names a file by
  `rmTargets`. The once-per-run record stays.
- **`hollow-hud.ts`, `HollowPainter.ts`**: add TRACE, skip the marks on disguised seeds, draw locks.
- **`ghost-thrust.ts`**, the scheduler in `orbit-sim.ts`, `GhostSpec` in `capabilities.ts`: a second ghost source.
- **`faults.ts`**: the ENGINE I/O FAULT stays. **`glitch.ts`**: `glitchBurst` reused for boarding and residents.
- **`fs-tools.ts`, `tool-targets.ts`**: new targets and refusals (a resident, the sleeper, `sleep.lock`).
- **`carry.ts`**: transit hits come from `02-map.md`'s formula; `packUnit` (which packs your files for the beam)
  carries the root as a locked member outside the link count, and seeds likewise; `layoutCarried` places beam seeds.
  **`transmit.ts`**: the uninvited chip and the TRACE line.
- **`finale.ts`**: the duel and the sleeping last block stay; printing becomes landing; the choices come when the
  landing ends, before the final LANDING REPORT and the RUN TALLY (`02-map.md`'s order). MERGE's restore of eaten
  clusters becomes a restore of eaten drivers from the per-ship record, whose pods then land (`01-landing.md`).
- **`memory-ops.ts`**: reused as is. **`attitude.ts`**: its seam waits for a later resident.
- **`src/data/ships.ts`**: `HollowDef` per stage instead of per ship; `validateHollowDef` checks the largest infectable
  file other than the Core (its no-stack bound stays as it is); "every ship has a root" goes; "LAST LIGHT is last"
  becomes the map's final-ship role (M2); verbs stay final-ship-only, keyed by the role, not the name.
- **`src/data/memory.ts`**: the `R` token lives on in the bay grammar; rack A gains resident files.
- **`src/data/tuning.ts`**: `HOLLOW_*`, `SEED_*`, `DEAL_*`, `VERB_*`, `MERGE_*` stay; new constants per §3.17.
- **`src/data/hollow-text.ts`, `MindTerminal.ts`**: text moves to `05-story.md`, souls become pods; the TERMINAL gains
  the amber voice and a choice without a timer.
- **Removed**: HOLLOW on ships 1–2 (ARES-VII's and HALCYON's roots), the C12 bite on ship 1 and the naming on ship 2
  (both move to HOLLOW's own ships), every licence including DELETE at the first seed (the repository replaces them),
  and the sealed archive's breach.

## 7. Story hooks

Owned by `05-story.md`: the seed lines (its act-2 "fragments contain words"); TRACE as "something is listening"; the
silent boarding and its first `> ...047?`; ARRIVAL CONTROL's matching cheer ("Please delete it. :)" for residents,
"Please ignore it. :)" for HOLLOW); each corrupted resident as a small portrait of what a caretaker becomes; a
departed resident's `farewell.txt` asking where AIs go; the sleeper as the model for STAY; why the root can die
only on the final ship.

## 8. Slices

1. **Landing replaces printing**: HOLLOW eats drivers, `landMult` replaces `printMult`, an eaten driver's pod reads
   `CAN'T LAUNCH` and is `PARKED IN ORBIT` at the end. The five ships keep their phase-2 HOLLOW, so the slice stays
   playable.
2. **The calm opening**, as the threat ladder on the fixed five ships: ARES-VII and HALCYON calm (driver arrival
   damage, transit hits), KESTREL the seed ship (beam seeds, the RM lesson, TRACE), VESPER the forced boarding
   (ARRIVAL + WALLS), LAST LIGHT the FINALE with THE DEAL folded in. This tests the boarding and fold rules with no map.
3. **The galaxy map**: noise and the seed table, TRACE on the map, boarding by TRACE or by "one hop from a final
   ship", the FINALE keyed by the final-ship role, the full ladder for 5–8 ships, the root in the packet, the threat
   state in the save, and the memory-class rules (the root slot from layer 4; residents only where they fit).
4. **Repository and tree**: delivery seeds, disguised seeds with SENTRY.skl, unlink on skills, the Rm recommendation.
5. **Residents**: (a) corrupted (ghost source, locks, its deal, DELETE) and the `RECEIVER CLOSED` line; (b) the REPAIR
   cure; (c) the one that left; (d) the sleeper; (e) the late surprise (needs a and the map's card rule); (f) the
   bypass animation.
6. **SURVEY**: nothing from this spec. 7. **Endings**: the hand-over at the last block, and the eaten-driver
   record handed to landing for MERGE. 8. **Rebalance**: seed odds, TRACE threshold, the ladder's numbers, the
   surprise share.

## 9. Deviations from PHASE3.md

1. **§5, seeds as scouts**, refined into TRACE with a band: never before depth 4 (or HOLLOW could board on the seed
   ship) and at the latest one hop before the final ship (or a careful player would reach the finale with nothing to
   duel).
2. **§5, "all phase-2 HOLLOW mechanics move to the middle and late game"**: all return, but short runs skip HOLLOW's own
   wall seeds and tool hunt, and move THE DEAL to the final ship. A 5-ship run has one ship between seeds and finale.
3. **§5, deliveries can carry seeds**: kept, except a tool kind's first delivery (its lesson).
4. **§6.2, the corrupted resident "wants space or a file"**: a file, picked by `rmTargets`'s fair tiers. "Space" has no
   clear mechanic; a named file is readable.
5. **§6.2, the sleeper "helps with one job"**: the kid picks the job from three. Choice is agency, and each job reuses
   an existing mechanic.
6. **§6.2, the map line**: early and mid game a corrupted resident is always `reported faulty`; late (layers 6–7) it
   may hide behind `unknown` (Fran's decision 21c), with a tell at boot and a grace (§3.12). `unknown` otherwise means
   left or (rarely) the sleeper.
7. **The final ship is a role, not a place** (Fran's decision 3): FINALE, the forced boarding and short-run folding
   key on it, as does the ending, which now comes before the tally (decision 23).
8. **§6.2, the bypass**: flavour and a tell, no input, no fail state.
9. **Additions not in PHASE3**: TRACE as a named meter, the REPAIR cure, the 12-block cap and
   the no-stack drain rule (all in §3.3 or §10).

## 10. Risks and questions for Fran

**Settled, round 1** (`DECISIONS.md`): rm by ship 3 has no confirm and no guarantee (19); REPAIR heals a corrupted
resident, the sleeper stays, and a late surprise may hide behind `unknown` (21); the final ship is a role (3); the
ending comes before the tally (23); ship memory varies (9); TRACE is a visible meter (20); the sleeper in about 60% of
runs and disguised seeds from depth 5 (22); `unlink` on skills (17). Signed off: the no-room seed rule, short-run
folding, and REPAIR healing a MERGE Core at its 16-block rate.

**Settled, round 2**, folded into the sections above:

- **Hitchhikers ride free** (20): the root, beam seeds and delivery seeds cost no link room (§3.4, §3.8, M5).
- **No charge floor on TIGHT ships** (8): seeds can eat a TIGHT ship's charge down to 0 (§3.4).
- **No rm means no win** (12): no one-use rm at the finale; the map's `NO RM` warning stays (§3.10).
- **MERGE** (15): the eaten drivers come back and their pods land, scored by the normal rules (§3.10).
- **Up to two TIGHT ships per layer from layer 5** (7): the hidden resident still has room (§3.12).
- **Accepted as specified:** nothing carries to the next unit, threat state included (5); seeds among the pods on a
  full TIGHT receiver (9); the late surprise resident (11); several final ships may make HOLLOW board earlier, and
  every final ship is FULL (3); mid-run HOLLOW is 046 or a relay stranger, and REASSIGNMENT's unit takes only the final
  ship's root (17).

**Risks**

- **Seeds as chores.** Mitigated by small counts (0–3 per beam), seeds named after files you care about, TRACE as the
  reason, disguise as later detective work, and SENTRY v2 QUICK RM.
- **A 5-ship finale is steep**: walls, THE DEAL, verbs and the duel within two ships. The fold rules soften it, and
  `02-map.md`'s simulations make it rare (on the persistent arm, 5-ship routes are never the best; 7 ships about 58%,
  6 about 42%).
- **Late ships may overload MIND** (HOLLOW, seeds, a resident and 16 pods), and the late surprise adds one unannounced
  foe beside HOLLOW. Caps: no resident on a final ship, no corrupted resident on an ark, no hidden one on a TIGHT ship,
  one deal per ship, the surprise's grace, lock and verb clocks frozen at TACTICAL. AUTODROP is the other relief.
- **Dense bays** (`01-landing.md` risk 5). On FULL ships a layer 4–7 ark (16 pods) with a 14-block root leaves 47 free
  blocks, and the final ship (16 pods, root 16) leaves 45 (phase 2's LAST LIGHT had 48). COMPACT and TIGHT ships hold
  the slot and the margin with 8 pods or fewer (L7).
- **Seeds and no charge on TIGHT ships.** A seedy beam into a TIGHT ship can arrive with 0 charge, and then REPAIR
  cannot answer a bite: only rm or a MOVE can. Late in a run its seeds land among the pods. That is Fran's intended
  squeeze, and the card's `SEEDS TAKE ROOM FROM YOUR CHARGE` (01) makes it visible. At depth 3 (the first seeds, maybe
  no rm yet) it may feel unfair; see question 1.
- **No rm, no win** makes the repository's Rm request the run's most important choice. The `NO RM` warning only comes
  before SET COURSE to a final ship, when a late request rarely arrives in time. Question 2.
- **Bigger files against "a started repair always wins"**: the promise holds only with the no-stack rule and the
  12-block cap. Bigger skills would need a smaller per-block REPAIR term, or a gentler final ship.
- **The persistent arm could pile up residents** if unvisited ones stay. Counting a kept resident toward the run's
  caps (§3.11) prevents that.
- **The balance harness** breaks in slice 2 (known, PHASE3 §11).

**New questions, each with my recommendation**

1. **Should the first seed ship avoid TIGHT ships?** At depth 3 a kid may have no rm, and a TIGHT ship may arrive
   with 0 charge, so a seed there has no answer but MOVE. Recommended: yes, a light rule for `02-map.md`: a hop at
   depth 3 that can roll seeds never leads to a TIGHT ship with an expected charge of 0. Later TIGHT ships keep the
   full squeeze.
2. **Should the `NO RM` warning come earlier?** By the time the final ship is one hop away, a request from far out
   rarely arrives. Recommended: yes, and it costs nothing: from the first desk where TRACE or a forced boarding is on
   the map, the REPOSITORY tags Rm `NEEDED FOR THE FINALE` while the unit has none. Decision 12 stands; only the
   warning moves.
