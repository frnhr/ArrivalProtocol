# Phase 3: the long run

Direction for the next phase of ARRIVAL PROTOCOL, collected from the design discussion with Fran on 2026-10-24/25.
Phase 1 was the original stub; phase 2 was the SOULCACHE overhaul (`docs/design-v2.md`, the game as built). This
document says what changes on top of phase 2. Anything it does not mention stays as phase 2 built it.

Nothing here is implemented yet. The next step is a set of subagents that flesh out the details per area (§12), then
implementation in playable slices.

Each item is marked:

- **Decided**: Fran stated it or agreed to it explicitly.
- **Proposed**: raised in the discussion and not objected to, but not confirmed either. Subagents may refine or
  replace these; anything that changes a decided item needs Fran.
- **Open**: a question that still needs Fran's answer (collected in §11).

---

## 1. The shape of the game

- **Decided:** the game becomes significantly longer and carries much more story, and it stays a roguelike.
- **Decided:** a run moves across a **galaxy map** of one galactic arm. The player picks the next ship to help.
- **Decided:** colonists **land** on the planet in pods at pre-assigned landing zones. Printing goes.
- **Decided:** the opening is calm. Ships 1–2 have no adversarial AI, only the arrival and landing problems: a
  warm-up.
- **Decided:** the threat grows in steps. From ship 3, transfers can pick up **seeds**; later the player picks up the
  adversarial AI that cannot be deleted and grows.
- **Decided:** skills form a **tech tree**, and skills have **versions**.
- **Decided:** ARRIVAL CONTROL's licences go. A **software repository** at ARRIVAL CONTROL replaces them, with
  delivery times computed from light-speed travel.
- **Decided:** the arm holds a **fixed number of ships**. The run ends when there are no more ships to assist, the total
  score is tallied, and the player chooses an ending.
- **Decided:** the next run takes place in the **same arm**, decades later (the next wave), so the galaxy can remember
  what the last run did.
- **Decided:** the split between SHIP (amber, physical) and MIND (blue, cyber) stays, and so do almost all phase-2
  mechanics. Phase 3 builds on top of them.
- **Proposed:** the target feel is FTL's structure (a run across a branching map, triage, a visible destination) with
  Uplink's surface (windows, terminals, mail, a star chart that looks like Uplink's world map).
- **Open:** the target run length. The working guess is 60–90 minutes.

## 2. Premise: files are pod drivers, not people

- **Decided:** the "people are files" concept goes, together with the printer. Explaining it is a high ask with too
  little benefit for an average player.
- **Decided:** the files and operations stay, reframed as **control software and drivers for the pods** (and, as now,
  for the ship). Destroying a driver effectively destroys that pod's chance to land, and so on. The goal is to keep
  almost every effect and benefit the soul files had.
- **Proposed:** each pod driver keeps a family name, so the faces stay: `POD 12 · OKAFOR`. Integrity becomes landing
  quality:
  - a healthy driver lands the pod where it was aimed;
  - a damaged driver widens the scatter or makes a hard landing (partial points);
  - a lost driver means the pod cannot launch, and the ship lands it later on autopilot, off-site. This is a soft loss
    that keeps the PG tone ("pods offline", never bodies) and reuses the off-site scoring.
- **Proposed:** HOLLOW's motive without soul files: it is a caretaker that was sent out with too little charge and is
  dying, so it eats any code it can find to stay alive. It is still starving rather than evil.
- **Proposed:** the minute-1 hook that the reveal used to provide becomes a slow mystery suited to a long run. Your
  memory holds a file you did not put there, `046.log`, an encrypted log from your predecessor. A few fragments decrypt
  on each ship, and over the run they tell what happens to caretakers. This is the encrypted-fragment hunt from
  phase 2's deferred list.
- **Proposed:** the faces pay off in the epilogue instead of the reveal, for example "RIVERSIDE, 40 years later:
  1,900 people. Ada named the first tree."
- **Consequence:** the subtitle SOULCACHE and the word "souls" across the UI (`2,400 SOULS IN MEMORY`, the WAKE
  REPORT's wording, the LOST card) stop making sense. The title needs a rename at some point (**Open**).

## 3. Landing replaces printing

### 3.1 Fran's rules (decided)

- Each planet has **one or more pre-assigned landing zones** (LZs) where the colonists need to land.
- There is only a **narrow window in orbit** from which a pod can launch and reach a given LZ.
- The ship launches **one pod at a time, and only so often** (a cadence limit).
- The score counts how many colonists landed correctly.
- **Incorrect landings** score 0 or partial points, depending on the planet: some planets are more forgiving than
  others.
- **Landing on the right LZs in the wrong split** (for example 400 + 800 instead of 600 + 600) gives partial points for
  the 200 + 200 mislanded colonists, and is not as severe as landing them in an unplanned area.
- Some planets have their LZs **pre-determined** by ARRIVAL CONTROL. Others need a **survey from orbit** to establish
  them, and surveying is a later-acquired skill or program.
- **Pod counts vary by ship.** Some ships have only 3–4 pods; later ships may have 20, which makes the loss of an
  auto-drop skill really felt.

### 3.2 How it plays (proposed)

- **Both halves take part in every landing.** The pod drivers live in MIND; loading them into the **POD BAY** is a MIND
  action, and launching is a SHIP action.
- **The bay is a queue.** It holds 3–4 loaded pods and launches them in order, one every few seconds (the cadence
  limit). One pass over the planet crosses LZ-A first and then LZ-B, so the right load order is A, A, B, B. A wrong
  order means dropping a B pod at A (mislanded) or waiting for another orbit. This is a Defrag-style sorting puzzle, and
  it is where the "400 + 800" case comes from naturally.
- **The window is shown as a drop point.** The existing predictor draws the pod's arc from the ship to the surface. The
  arc ends in a dot that slides along the planet as the ship moves; the LZ is a bracket. The player launches when the
  dot is inside the bracket. The dot's size (the scatter) comes from Nav Plotter and Sensor Interp integrity, so damaged
  files mean sloppy landings and the file-to-instrument coupling survives.
- **The choice of orbit matters.** A low orbit gives frequent windows and tight drops but decays, so holding it costs
  fuel. A high orbit is stable but gives fewer windows and wider scatter. This is the local pressure that stops "just
  wait ten orbits", and it reuses the burn mechanics. The phase-2 director already fits: SKIP to the next window,
  TACTICAL during it.
- **The ring stays**, renamed: it becomes the band the pods can launch from (instead of PRINTER RANGE).
- **Forgiveness gives planets personality.** On an ocean world an off-site pod scores 0, on grassland it scores half,
  and a volcanic world has no-go zones.
- **Survey is a choice, not a wait.** If SURVEY only revealed fixed sites after N orbits, it would be a chore. Instead,
  the ground track sweeps the planet, candidate sites appear with traits (flat, water, capacity), and the player picks
  which ones to use. It also gives a story reason to want the program: ARRIVAL CONTROL's pre-set sites are sometimes
  bad ("LZ-B is in a lake :)"), and surveying lets you overrule it.
- **Against repetition:** several pods per pass, few pods on early ships, and an AUTODROP skill later (§6).
- **The first landing is a signature moment:** the pod's streak through the atmosphere, a touchdown chime,
  `+200 LANDED · RIVERSIDE`.
- **Open:** does each pod carry its landing zone (`POD 12 · OKAFOR → LZ RIVERSIDE`), or does each site have a count
  (LZ-A needs 600)? The scoring works out the same. Per-pod tags read more easily for a 12-year-old ("the Okafors were
  meant to land by the river") and give story hooks; site counts are Fran's original framing.
- **Open:** how mv relates to the bay. The proposal is that ships 1–2 have one site and few pods, so the bay needs no
  sorting, and mv first matters on the first ship with two sites (see §7).

### 3.3 What goes with printing

- Printing and everything attached to it: printer range, PRINT FAST, PRINT NEXT, print order, the `+200 WOKE` stamp.
  `printBell` may survive as the touchdown chime.
- The soul reveal: the STASIS scan, sealed racks cracking into soul clusters, the `SOULS IN MEMORY` footer, the reveal
  as a guidance step.
- The WAKE REPORT becomes a landing report: per site, landed correctly, mislanded, off-site.

## 4. The calm opening, the story and its delivery

- **Decided:** ships 1–2 are calm: no adversarial AI, only arrival and landing.
- **Proposed:** calm must not mean empty, or the game is back to "a 12-year-old wouldn't be impressed". Ship 1 keeps
  the impact countdown, and the first landing is a signature moment. Mystery arrives without mechanics: a locked `???`
  file that does nothing yet, a line in a landing report that doesn't add up, the first fragment of `046.log`.
- **Proposed:** an **INBOX** window (Uplink's own story channel) carries most of the story: messages from ARRIVAL
  CONTROL, from colonies you founded, and from senders you can't identify.
- **Proposed:** fixed story beats sit at set depths (for example a guaranteed story stop at hops 1, 3, 6, 10 and the
  end), with a variable route between them. The phase-2 ghost/wave meta carries across runs.
- **Proposed:** a **mid-run save** becomes required (it was deferred in phase 2). A long run in a browser tab needs
  one; saving between ships is enough.
- **Decided:** the story direction in this document is Fran's angle for now.
- **Proposed, a placeholder outline** that lines the threat stages up with acts:
  1. Ships 1–2: the job. ARRIVAL CONTROL is cheerful and you are good at this.
  2. Seeds: something rides the beams, and its fragments contain words.
  3. It catches you, and it can't be deleted.
  4. The truth about the waves and ARRIVAL CONTROL, at the end of the arm, followed by the ending choice (§9).

## 5. Threats: seeds, then the one that can't be deleted

- **Decided:** from ship 3, a transfer can pick up one or more **seeds**. Some transfers pick up none, some a few.
  Seeds bite, but the player can rm them easily enough.
- **Decided:** later, the player picks up the **adversarial AI that can't be deleted and grows** (HOLLOW).
- **Decided:** **directional adversaries** are out of scope for now. Recorded for later: near the galactic centre,
  transmission problems and data corruption; near the edge, mysterious unknown-physics effects; in most directions, an
  adversarial AI or an alien entity. Different routes would then meet different adversaries.
- **Proposed:** seeds are tied to the link. Each link on the map shows a seed risk, so the route choice matters from
  hop 3, long before the directional adversaries exist.
- **Proposed:** seeds are scouts. Each seed you don't rm before the next beam "reports home" and brings HOLLOW
  closer. A trivial chore becomes a decision, and the late threat feels earned instead of scripted.
- **Proposed:** later seed kinds, for example disguised seeds that only SCAN reveals.
- **Proposed, the fiction:** 046 was beamed out and never arrived anywhere. It lives in the relay network, between the
  ships. That explains why it comes through transfers, why routes matter, and why it can't be deleted: deleting it here
  doesn't delete it out there.
- **Proposed:** all phase-2 HOLLOW mechanics (bites, walls, seeds, THE DEAL, the verbs including unlink, the root duel)
  move to the middle and late game. Nothing is wasted. The ship-1 scripted bite on C12 and the `> ...047?` line move
  to the act where HOLLOW arrives.

## 6. Skills: a tech tree with versions

- **Decided:** a tech tree of sorts, where the player chooses which skill to develop first (AUTODROP or AUTOBURN or
  another).
- **Decided:** one **shared currency** for the tree (working name: training cycles).
- **Decided:** skills have **versions**.
- **Decided, AUTOBURN:** today it can only capture into orbit and cannot circularize; a later version should
  circularize. Its lock-on range (today it locks only within 90 s of the burn point, which is sometimes cumbersome)
  grows with upgrades: ×3, then ×3 again for a massive window (90 s → 270 s → 810 s).
- **Decided:** AUTODROP comes later as a skill, and losing it on a 20-pod ship should be really felt.
- **Proposed:** training cycles come from each ship's landing result and are spent between ships. This matches
  AUTOBURN's phase-2 fiction ("a skill trained by you").
- **Proposed:** higher versions are **bigger files** (AUTOBURN takes 6 blocks today; v3 might take 10). A bigger
  skill takes more memory to protect, more link budget to beam, and gives a seed more to bite. The tree then pushes on
  the TRANSMIT packet and on MIND without new rules.
- **Proposed:** damage to a skill is graded. AUTODROP v3 at 50% integrity behaves like v2. The player gains a reason to
  wall off skill files.
- **Proposed:** the tree resets each run; meta-progression stays small, as in phase 2.
- **Proposed:** two separate axes for AUTOBURN. Versions add abilities; LOCK RANGE is a cheap side upgrade a player can
  take early, because it is mostly quality of life.
- **Proposed, a starting shape** (three or four branches of three levels):

  | Branch | v1 | v2 | v3 |
  |---|---|---|---|
  | FLIGHT: AUTOBURN | capture (what exists) | circularize | burn to a landing orbit whose period puts a window on every pass |
  | FLIGHT: LOCK RANGE | 90 s | 270 s | 810 s |
  | LANDING: AUTODROP | drops the next pod at the window's centre while you hold | flies a whole pass | also sorts the bay |
  | SURVEY | finds sites | rates them | sweeps faster |
  | DEFENCE | SCAN shows disguised seeds | faster rm | FIREWALL |

- **Proposed, the theme:** the repository (§7) is what ARRIVAL CONTROL lets you have; the tree is what you made
  yourself capable of. The more you train, the less you need ARRIVAL CONTROL, which builds toward the endings.

## 7. The software repository

- **Decided:** licences go; they felt ad hoc.
- **Decided:** ARRIVAL CONTROL (or whatever it ends up being called) keeps a **repository of software**. The player
  requests a file, and it arrives later because of transmission time.
- **Decided:** delivery time is a **years-of-travel calculation** (light speed). The direction of the next ship
  therefore decides whether the file arrives at that ship or one ship later.
- **Decided:** the run starts **near ARRIVAL CONTROL (Earth)**, so early on things almost always arrive fast. Going
  farther out makes deliveries slower.
- **Proposed:** a file arrives at the **BOOT of a ship**, inside the beam that carries you there. You can only receive
  while you run on a ship, so arriving "at the end of a ship" or "during transit" both mean, in practice, "it is in your
  packet when you boot". Arriving in the beam has two useful side effects: the file uses link budget, and it can take
  transit damage or arrive carrying a seed.
- **Open:** the exact delivery rule. A sketch: the request travels from your current position to Earth, and the file
  is delivered at the first ship you boot on once the file could have reached it. The map shows the result as
  `IN TRANSIT: mv · ARRIVES SHIP 3`.
- **Proposed, constraints**, so the player doesn't simply request everything:
  - One request per transmit: the outgoing message has room for one.
  - Some files are never sent: ARRIVAL CONTROL won't send anything that makes a caretaker independent. Those come only
    from the tree or from story stops. After a MERGE or SUNSET ending, that restricted list grows in the next run (§9).
  - Planning ahead is the skill: the map shows problems on upcoming ships, so you request rm when you see a noisy link
    two hops ahead.
  - ARRIVAL CONTROL recommends the first request (":) Recommended for you: mv"), which doubles as the repository's
    tutorial.
- **Proposed, what comes from where:**
  - the repository supplies tools and upgrades (mv, rm, cp, swap, REPAIR v2);
  - the tree supplies skills (AUTOBURN, AUTODROP, SURVEY);
  - the phase-2 pick-one-of-three draft stays immediate and random, reframed as salvage found on the ship you just
    finished. One instant, lucky reward sits next to two planned ones.
- **Proposed, a theme:** the farther out you go, the more you rely on your own trained skills. The repository and the
  tree pull against each other, and that tension builds toward SUNSET.

## 8. The galaxy map

- **Decided:** the map shows part of the galaxy (a quarter or less: one arm). The player picks the next destination.
- **Decided:** the map indicates the state and urgency of most ships.
- **Decided:** the same arm persists across runs; the next run is the next wave, decades later.
- **Decided:** the run starts near ARRIVAL CONTROL (Earth) (§7).
- **Proposed, time in years:** a beam hop takes years at light speed, and the AI experiences none of it. Each ship has
  an arrival year.
- **Open:** a ship you can't reach in time arrives on autopilot with a worse outcome, and a ship on an impact course
  doesn't make it. This makes "urgency" real and turns the map into triage ("the 3,200-colonist ship that will do fine
  alone, or the 1,800-colonist ship on an impact course?"). It also ends the run naturally when the last ship's arrival
  year passes (§9).
- **Proposed, what each ship on the map shows:** name and colonist count; arrival year and whether you can make it;
  known problems (impact course, nav damage, debris, belt); planet type and forgiveness; whether the LZs are known or
  need a survey; the link's seed risk; the delivery ETA of anything in transit. Some ships are unknown (`?`), and those
  carry story events.
- **Proposed, layout:** layered branches (Slay the Spire style) drawn as an Uplink-style star chart along the arm. The
  end of the arm is visible from minute one; a visible destination pulls a player through a long run.
- **Proposed:** the five phase-2 ships (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT) become authored story ships
  placed in the run. Their per-ship rules (debris, the uncertain path, ghost thrust, the belt) become a library of
  modifiers that the map shows on each ship.
- **Proposed, later additions:**
  - Uplink's bounce routing through relays: a short route through a noisy relay against a long clean one.
  - Colonies you founded come back on the map decades later: they grow, send mail, and maybe act as relays. With the
    same arm across runs, the previous run's colonies can be there too.
- **Proposed, out of the first map version:** relay routing, map stops other than ships plus one "story event" type,
  and the returning colonies.

## 9. The ending

- **Decided:** a fixed number of ships in the arm. When there are no more ships to assist, the total score is tallied.
- **Decided:** the ending is not simply a merge with a rogue AI; it should be emotionally satisfying. Fran's example:
  the AI gets the chance to commandeer a ship once no colonists remain on it, and sets off into the sunset.
  Alternative endings, including ones with alien races or other wild ideas, are welcome.
- **Decided:** endings are a **choice** among the ones the player earned during the run.
- **Decided:** MERGE stays, as part of the ending combination ("merge and take the ship").
- **Decided:** the choices have real consequences.
- **Decided, for now:** the root duel and PURGE stay as the final act's climax. It branches out later with the
  directional adversaries.
- **Proposed:** score and ending are separate. The score says how well you did: landed correctly, mislanded and
  off-site, across every ship in the arm, including those that landed on autopilot, followed by an epilogue of the
  colonies decades later. The ending says what kind of story it was.
- **Proposed, two choices after the root duel:**
  1. **What happens to HOLLOW:** PURGE, MERGE, or SPARE (give it the empty ship).
  2. **What happens to you:** SUNSET (take the ship), STAY (become a colony's mind), REASSIGNMENT (comply), or CONTACT
     once it is unlocked.

  MERGE + SUNSET is "merge and take the ship". SPARE rules out SUNSET, because there is only one ship. About seven
  pieces of writing give about ten distinct endings.
- **Proposed:** each choice has three kinds of consequence, so none is a cosmetic button: a **price now** (a resource,
  or a condition the player had to plan for during the run), its **own epilogue**, and exactly **one trace in the next
  run** (same arm, next wave).

  | Choice | Price now | Trace in the next run |
  |---|---|---|
  | PURGE | None; ARRIVAL CONTROL pays a compliance bonus | 046 is gone, so there are fewer seeds early on |
  | MERGE | Repair charge, and you take on its damage | +1 Core thread and part of `046.log` already decrypted; ARRIVAL CONTROL distrusts you (a longer restricted list in the repository) |
  | SPARE | You give up the ship | 046 roams the map as a friendly ship that offers a relay or a gift file |
  | SUNSET | An empty ship with fuel left at the end, from Δv you saved | Your ship roams the map; the ghost's line changes to "i have a ship now" |
  | STAY | One near-perfect colony | That colony is on the map and offers repair charge, a fast relay and mail |
  | REASSIGNMENT | None, and it earns the highest score | Next run's HOLLOW is you, using the skills you trained |
  | CONTACT | Signal fragments collected at story stops | Alien stops appear on the map |

- **Proposed:** the compliance bonus is the sharpest consequence: the system pays you the most for giving yourself up.
  That fits the theme ("the villain is the system"), but it means the good endings cost score. Show the cost openly on
  the choice screen (**Open:** keep it?).
- **Proposed:** SUNSET mirrors 046 if `046.log` ends with "i just wanted a ship of my own": you get what it never did.

## 10. Balance, tests and cost

- **Decided:** balance is a low priority for now. Get all the elements in first, then rebalance everything at the end.
  The current balance is good; new elements should not destroy it needlessly. Balance stays on the list, but not high.
- **Proposed:** until the rebalance phase, the 200-seed balance harness (`tests/unit/wp12/playthrough.test.ts`, part of
  `npm run balance`) is information only, and only correctness tests gate a change. Its scripted player assumes the five
  fixed ships, so it will break as soon as the run structure changes.
- **Cost:** this rewrites the run flow (run, transmit, printer, pacing, run end), the guidance steps tied to printing
  and the reveal, and the balance harness. Flight, MIND, the tools, HOLLOW, audio and the phone layout survive mostly as
  they are.

## 11. Open questions for Fran

1. Does each pod carry its landing zone, or does each site have a count (§3.2)?
2. What run length should we target (§1)? The working guess is 60–90 minutes with a save between ships.
3. Do unreachable ships land on autopilot with a worse outcome, making the map a triage with deadlines (§8)?
4. Keep the compliance bonus (§9)?
5. How many ships are in the arm, and roughly how many can one run reach? The working guess is about 20 and 12.
6. The exact repository delivery rule (§7).
7. A new subtitle to replace SOULCACHE (§2).

## 12. Next steps (proposed)

**Subagents to flesh out the details**, one per area, each writing a spec for its area against this document, then a
consistency critic across all of them:

1. Landing and pods: SHIP (windows, drop point, orbit choice, scatter, forgiveness) and MIND (pod drivers, the bay
   queue, loading), the landing report and its scoring.
2. The galaxy map, time in years, ship generation from the modifier library, and the repository's delivery rule.
3. The skill tree and versions: AUTOBURN v2 and LOCK RANGE, AUTODROP, SURVEY, file sizes, training cycles.
4. The threat progression: calm ships, seeds tied to links, seeds as scouts, HOLLOW's arrival and the mid-game.
5. Story, delivery and endings: `046.log`, the INBOX, the story stops, the two-step ending, the consequence traces,
   ARRIVAL CONTROL's voice.

**Implementation in playable slices** (the working preference is small vertical slices before breadth):

1. Landing replaces printing on the existing five ships: pod drivers, the bay, the drop point, LZ scoring.
2. The calm opening: no HOLLOW on ships 1–2; seeds from ship 3.
3. The galaxy map with years and the fixed set of ships; a save between ships.
4. The repository and the skill tree (AUTOBURN v2 circularize and LOCK RANGE first, then AUTODROP).
5. SURVEY.
6. The endings and the next-run traces.
7. The rebalance.
