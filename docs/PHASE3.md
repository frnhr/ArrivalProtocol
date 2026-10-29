# Phase 3: the long run

Direction for the next phase of ARRIVAL PROTOCOL, collected from the design discussion with Fran on 2026-10-24/25.
Phase 1 was the original stub; phase 2 was the SOULCACHE overhaul (`docs/design-v2.md`, the game as built). This
document says what changes on top of phase 2. Anything it does not mention stays as phase 2 built it.

Nothing here is implemented yet. The next step is a set of subagents that flesh out the details per area (§13), then
implementation in playable slices.

Each item is marked:

- **Decided**: Fran stated it or agreed to it explicitly.
- **Proposed**: raised in the discussion and not objected to, but not confirmed either. Subagents may refine or
  replace these; anything that changes a decided item needs Fran.
- **Open**: a question that still needs Fran's answer (collected in §12).

Decided does not mean final. Any decision may be reversed when there is a good argument: wherever one gets in the way
of good gameplay, raise it to Fran to be confirmed or reverted (`docs/phase3/DECISIONS.md`).

---

## 1. The shape of the game

- **Decided:** the game becomes longer and carries much more story, and it stays a roguelike.
- **Decided:** a run visits **5–8 ships**, depending on the route the player takes: long transits mean fewer ships.
- **Decided:** a run moves across a **galaxy map** of one galactic arm. The player picks the next ship to help.
- **Decided:** colonists **land** on the planet in pods at pre-assigned landing zones. Printing goes.
- **Decided:** the opening is calm. Ships 1–2 have no adversarial AI, only the arrival and landing problems: a
  warm-up.
- **Decided:** the threat grows in steps. From ship 3, transfers can pick up **seeds**; later the player picks up the
  adversarial AI that cannot be deleted and grows.
- **Decided:** some ships carry a **resident AI** of their own: corrupted, gone, or asleep and friendly (§6).
- **Decided:** skills form a **tech tree**, and skills have **versions**.
- **Decided:** ARRIVAL CONTROL's licences go. A **software repository** at ARRIVAL CONTROL replaces them, with
  delivery times computed from light-speed travel.
- **Decided:** the caretaker still travels as a **light-speed transmission** (the beam), as in phase 2. Files catch up
  because the caretaker arrives at each ship early and waits aboard (§8). A physical core was considered and dropped.
- **Decided:** the arm holds a **fixed number of ships** (about 20 to start). The run ends when there are no more ships
  to assist, the score is tallied, and the player chooses an ending.
- **Decided:** the next run takes place in the **same arm**, decades later (the next wave), so the galaxy can remember
  what the last run did.
- **Decided:** the split between SHIP (amber, physical) and MIND (blue, cyber) stays, and so do almost all phase-2
  mechanics. Phase 3 builds on top of them.
- **Decided:** the new title is **ARRIVAL PROTOCOL // OUTWARD BOUND**.
- **Proposed:** the target feel is FTL's structure (a run across a branching map, choices under deadlines, a visible
  destination) with Uplink's surface (windows, terminals, mail, a star chart that looks like Uplink's world map).

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
  - a lost driver means the pod cannot launch. It does not count toward the score, and its fate is unknown, which keeps
    the PG tone ("pods offline", never bodies).
- **Proposed:** HOLLOW's motive without soul files: it is a caretaker that was sent out with too little charge and is
  dying, so it eats any code it can find to stay alive. It is still starving rather than evil.
- **Proposed:** the minute-1 hook that the reveal used to provide becomes a slow mystery suited to a long run. Your
  memory holds a file you did not put there, `046.log`, an encrypted log from your predecessor. A few fragments decrypt
  on each ship, and over the run they tell what happens to caretakers. This is the encrypted-fragment hunt from
  phase 2's deferred list.
- **Proposed:** the faces pay off in the epilogue instead of the reveal, for example "RIVERSIDE, 40 years later:
  1,900 people. Ada named the first tree."
- **Consequence:** the word "souls" across the UI (`2,400 SOULS IN MEMORY`, the WAKE REPORT's wording, the LOST card)
  goes, and SOULCACHE becomes OUTWARD BOUND (§1).

## 3. Landing replaces printing

### 3.1 Fran's rules (decided)

- Each planet has **one or more pre-assigned landing zones** (LZs) where the colonists need to land.
- Each LZ has a **count**: how many colonists it is prepared for (for example LZ-A 600, LZ-B 600). Pods are
  interchangeable. A later extension can add structure, such as which pods belong together.
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

- **Both halves take part in every landing.** SHIP flies the orbit and launches. MIND keeps the pod drivers and the
  instruments intact, because their integrity decides how well each pod lands.
- **The bay** holds 3–4 loaded pods and launches one every few seconds (the cadence limit). Because pods are
  interchangeable, the puzzle is the split: one pass over the planet crosses LZ-A and then LZ-B, and the player decides
  how many pods to spend in each window so the totals match the counts. Too many in A's window is the "400 + 800" case.
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
- **Against repetition:** several pods per pass, few pods on early ships, and an AUTODROP skill later (§7).
- **The first landing is a signature moment:** the pod's streak through the atmosphere, a touchdown chime,
  `+200 LANDED · LZ-A`.
- **mv is not needed for landing.** With interchangeable pods the bay needs no sorting, so the early ships do not depend
  on a repository request (§8).

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
- **Proposed:** fixed story beats sit at set depths (for example a guaranteed story stop on the first ship, the third,
  and the last), with a variable route between them. The phase-2 ghost/wave meta carries across runs. Resident AIs
  (§6) carry a share of the story too.
- **Proposed:** a **save between ships**. Even at 5–8 ships, a run with landing on every ship is long for one sitting in
  a browser tab (it was deferred in phase 2).
- **Decided:** the story direction in this document is Fran's angle for now.
- **Proposed, a placeholder outline** that lines the threat stages up with acts:
  1. Ships 1–2: the job. ARRIVAL CONTROL is cheerful and you are good at this.
  2. Seeds: something rides the beams, and its fragments contain words.
  3. It catches you, and it can't be deleted.
  4. The truth about the waves and ARRIVAL CONTROL, at the end of the arm, followed by the ending choice (§10).

## 5. Threats: seeds, then the one that can't be deleted

- **Decided:** from ship 3, a transfer can pick up one or more **seeds**. Some transfers pick up none, some a few.
  Seeds bite, but the player can rm them easily enough.
- **Decided:** later, the player picks up the **adversarial AI that can't be deleted and grows** (HOLLOW).
- **Decided:** **directional adversaries** are out of scope for now. Recorded for later: near the galactic centre,
  transmission problems and data corruption; near the edge, mysterious unknown-physics effects; in most directions, an
  adversarial AI or an alien entity. Different routes would then meet different adversaries.
- **Proposed:** seeds ride in on the beam. Each link on the map shows its noise, which is its seed risk, so the route
  choice matters from ship 3, long before the directional adversaries exist. Deliveries from the repository travel the
  same network and can carry a seed too.
- **Proposed:** seeds are scouts. Each seed you don't rm before the next beam "reports home" and brings HOLLOW closer.
  A trivial chore becomes a decision, and the late threat feels earned instead of scripted.
- **Proposed:** later seed kinds, for example disguised seeds that only SCAN reveals.
- **Proposed:** a corrupted resident AI (§6) is the middle tier between the two: a local adversary for one ship that
  can be deleted.
- **Proposed, the fiction:** 046 was beamed out and never arrived anywhere. It lives in the relay network, between the
  ships. That explains why it comes through transfers, why routes matter, and why it can't be deleted: deleting it here
  doesn't delete it out there. The relay where it lives can later become a story stop on the map.
- **Proposed:** all phase-2 HOLLOW mechanics (bites, walls, seeds, THE DEAL, the verbs including unlink, the root duel)
  move to the middle and late game. Nothing is wasted. The ship-1 scripted bite on C12 and the `> ...047?` line move
  to the act where HOLLOW arrives.

## 6. Resident AIs

### 6.1 Fran's angle (decided)

- Most ships are designed to **accept a transmission** before arrival. That is the default: you are the only mind
  aboard.
- Some ships launched **with an AI on board**. That AI may have become corrupted, or it may have left entirely.
- Sometimes the resident AI was **just sleeping**. You wake it with a file operation (for example by moving a file or
  by rming a sleep lock file), and it turns out to be friendly: a pleasant and rare surprise.

### 6.2 How it plays (proposed)

Residents give MIND variety from ship to ship (until now all of a ship's variety was on the SHIP side: debris, the
belt, ghost thrust), and they add characters besides HOLLOW and ARRIVAL CONTROL.

- **Corrupted resident:** a local adversary for one ship, which you can delete. It fills the gap between the trivial
  seeds and the HOLLOW that can't be deleted, as a middle tier for the middle ships. It reuses phase-2 mechanics:
  VESPER's ghost thrust becomes the corrupted resident firing the engine, and THE DEAL becomes a negotiation with a
  wary resident that wants space or a file.
- **The resident left:** the ship is empty but full of traces. Its logs feed the mystery (where do AIs go when they
  leave? into the network, which points at HOLLOW). Its leftover files are the salvage draft (§8.5), which now has a
  reason to exist.
- **Sleeping and friendly:** you wake it with a file operation, for example `rm sleep.lock` or by moving a file off its
  lock. It then helps with one job: running the drops, holding a wall, or repairing drivers. It might also teach you
  something worth training cycles (§7).
  - It is **hidden**: you only find it if you scan and poke around, so curiosity is rewarded, which is very Uplink.
  - It is **rare**: at most one per run, so it stays a surprise.
- **On the map**, a ship's card shows `RESIDENT: none`, `RESIDENT: reported faulty` or `RESIDENT: unknown`. The
  sleeping friendly one only ever shows as unknown.
- **Getting in (optional, later):** a ship launched with an AI aboard was never meant to receive a caretaker, so
  getting in could take a short bypass of its receiver at boot, as an Uplink homage.
- **Ties to the endings:** STAY means becoming what a resident is. A friendly resident you woke can appear in the
  epilogue, or as a next-run trace (§10).

## 7. Skills: a tech tree with versions

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
- **Proposed:** higher versions are **bigger files** (AUTOBURN takes 6 blocks today; v3 might take 10). A bigger skill
  takes more memory to protect, more link budget to beam, and gives a seed more to bite. The tree then pushes on the
  TRANSMIT packet and on MIND without new rules.
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
  | LANDING: AUTODROP | drops the next pod at the window's centre while you hold | flies a whole pass | plans the split across passes to match the counts |
  | SURVEY | finds sites | rates them | sweeps faster |
  | DEFENCE | SCAN shows disguised seeds | faster rm | FIREWALL |

- **Proposed, the theme:** the repository (§8) is what ARRIVAL CONTROL lets you have; the tree is what you made
  yourself capable of. The more you train, the less you need ARRIVAL CONTROL, which builds toward the endings.

## 8. The software repository and its deliveries

### 8.1 The repository (decided)

- Licences go; they felt ad hoc.
- ARRIVAL CONTROL (or whatever it ends up being called) keeps a **repository of software**. The player requests a
  file, and it arrives later because of travel time.
- Delivery time is a **years-of-travel calculation** at light speed. The direction of the next ship therefore decides
  whether the file arrives at that ship or one ship later.
- The run starts **near ARRIVAL CONTROL (Earth)**, so early on things almost always arrive fast. Going farther out
  makes deliveries slower.

### 8.2 The catch-up problem, and why the caretaker waits aboard (decided)

A request has to travel to Earth, and the file has to travel back out to the next ship. That path is never shorter
than the caretaker's own direct path at light speed (the triangle inequality), so a file can never reach the next ship
before the caretaker does.

The answer: the caretaker can only help a ship it reaches before that ship's arrival year, so it nearly always gets
there years early. It sleeps in the ship's receiver until the approach (the minutes the game is played in), and mail
can arrive while it sleeps. A file's deadline is the ship's approach, not the caretaker's arrival.

Considered and dropped: a **physical core**, a micro-satellite flying at a fixed fraction of light speed (0.5 c was the
working number; an instant-acceleration gizmo would keep it simple, and real acceleration might flatten travel times).
It solved the catch-up by being slower than light, but it needed that gizmo plus new fiction for the link budget,
transit hits, BEAM OUT, and where seeds come from. Waiting aboard solves the catch-up with no new mechanic, and it is
the natural fiction anyway: nobody can time a trip of light-years to the minute.

### 8.3 The delivery rule (decided in principle; the details are proposed)

All times are in years and all distances in light-years, in the galaxy's frame. Ships are fixed points on the map. The
beam travels at light speed. The hours spent flying a ship's approach are negligible.

- Each ship S has an **arrival year** `A(S)`: when its approach starts. You leave a ship when its landing is done, at
  `A(S)`.
- Leaving S0, you reach S1 at `A(S0) + |S0 − S1|`. The **slack** is how early that is:
  `slack(S1) = A(S1) − A(S0) − |S0 − S1|`. A ship with negative slack cannot be reached.
- A request sent when you leave S0 goes to Earth and the file comes back out to S1. Its **detour** is how much longer
  that path is than yours: `detour = |S0 − E| + |E − S1| − |S0 − S1|`. Heading straight outward the detour is twice
  your distance from Earth; heading straight inward it is twice the next ship's distance. Near Earth it is small.
- **Lateness = detour − slack.** If it is zero or less, the file is there when you wake for S1's approach.
- Otherwise S1 forwards the file along your route, and each later ship's slack shrinks the lateness:
  `lateness(S2) = lateness(S1) − slack(S2)`. The file arrives at the first ship where the lateness reaches zero.
- "Near Earth, things arrive fast" falls out of the rule without a special case, because the detour is small there.
- The map previews the result for the destination you are about to pick: `mv · ARRIVES 2311 · HALCYON APPROACH 2312 ·
  IN TIME`, or `mv · ARRIVES SHIP 3`.

### 8.4 Later layers (proposed)

- **You're big, the file is small.** Uploading a whole mind takes years; `mv` takes seconds. The beam's upload time
  then depends on the packet's size: a heavier packet arrives later, which leaves less slack and reaches fewer ships.
  That makes "travel light" a real trade on the packet screen, and it fits "higher versions are bigger files" (§7).
  Decide it when the packet screen is redesigned.
- **Mirrors on relays.** Earlier waves left copies of the repository on relays, so a request goes to the nearest
  mirror instead of Earth, and a mirror near your route means faster deliveries. A mirror may hold older versions only
  ("Tau relay has REPAIR v1"). A map feature for later.
- **Ordering ahead.** A request addressed to the ship after next travels there while you work on the next one. Under
  the rule above this is only a choice of address, and the UI says whether it arrives in time.
- Rejected: a narrow faster-than-light link for software. It is a gizmo, and it removes the light-speed logic that
  makes direction matter.

### 8.5 Constraints and sources (proposed)

- One request per transmit: the outgoing message has room for one.
- Some files are never sent: ARRIVAL CONTROL won't send anything that makes a caretaker independent. Those come only
  from the tree, from story stops, or from resident AIs. The non-compliant endings lengthen that restricted list in the
  next run (§10).
- Planning ahead is the skill: the map shows problems on upcoming ships, so you request rm when you see a noisy link two
  ships ahead.
- ARRIVAL CONTROL recommends the first request (":) Recommended for you: mv"), which doubles as the repository's
  tutorial.
- A delivered file arrives in the beam: it uses link budget, and it can take transit damage or arrive carrying a seed.
- What comes from where:
  - the repository supplies tools and upgrades (mv, rm, cp, swap, REPAIR v2);
  - the tree supplies skills (AUTOBURN, AUTODROP, SURVEY);
  - the phase-2 pick-one-of-three draft stays immediate and random, reframed as salvage found on the ship you just
    finished (left behind by a resident AI that is gone, §6). One instant, lucky reward sits next to two planned ones.
- A theme: the farther out you go, the more you rely on your own trained skills. The repository and the tree pull
  against each other, and that tension builds toward SUNSET.

## 9. The galaxy map

- **Decided:** the map shows part of the galaxy (a quarter or less: one arm). The player picks the next destination.
- **Decided:** the map indicates the state and urgency of most ships.
- **Decided:** the same arm persists across runs; the next run is the next wave, decades later.
- **Decided:** the run starts near ARRIVAL CONTROL (Earth) (§8).
- **Decided:** about 20 ships in the arm to start, of which a run reaches 5–8. To be tweaked.
- **Decided:** only the ships you visit are scored. Ships you never reach are not counted at all: they might have
  landed safely or not, and nobody knows.
- **Decided (part of the delivery rule, §8.3):** time is in years. Each ship has an arrival year, and you can only help
  a ship you reach before it arrives. That deadline is what "urgency" means on the map, and the run ends when no
  remaining ship can be reached in time.
- **Open (to figure out as we go):** what makes a long hop worth taking. If every ship scores about the same, the route
  with the most hops always wins and the map has no real choice. Candidates: bigger ships, safer links, story stops,
  more slack for deliveries.
- **Proposed, what each ship on the map shows:** name and colonist count; arrival year, whether you can make it, and how
  early you would arrive (the slack, which decides whether mail catches you); known problems (impact course, nav
  damage, debris, belt); the resident line (§6); planet type and forgiveness; whether the LZs are known or need a
  survey; the link's noise (its seed risk); the delivery ETA of anything in transit. Some ships are unknown (`?`), and
  those carry story events.
- **Proposed, layout:** layered branches (Slay the Spire style) drawn as an Uplink-style star chart along the arm. The
  end of the arm is visible from minute one; a visible destination pulls a player through a long run.
- **Proposed:** the five phase-2 ships (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT) become authored story ships
  placed in the run. Their per-ship rules (debris, the uncertain path, ghost thrust, the belt) become a library of
  modifiers that the map shows on each ship.
- **Proposed, later additions:**
  - Uplink's bounce routing through relays: a short route past a noisy relay against a long clean one.
  - Colonies you founded come back on the map decades later: they grow, send mail, and maybe act as relays. With the
    same arm across runs, the previous run's colonies can be there too.
- **Proposed, out of the first map version:** relay routing, map stops other than ships plus one "story event" type,
  and the returning colonies.

## 10. The ending

- **Decided:** a fixed number of ships in the arm. When there are no more ships to assist, the score is tallied.
- **Decided:** the score only counts the positive: how many colonists were safely taken care of on the ships you
  visited (landed correctly, plus the partial points for mislanded and off-site pods).
- **Decided:** the ending is not simply a merge with a rogue AI; it should be emotionally satisfying. Fran's example:
  the AI gets the chance to commandeer a ship once no colonists remain on it, and sets off into the sunset.
  Alternative endings, including ones with alien races or other wild ideas, are welcome.
- **Decided:** endings are a **choice** among the ones the player earned during the run.
- **Decided:** MERGE stays, as part of the ending combination ("merge and take the ship").
- **Decided:** the choices have real consequences.
- **Decided:** the endings have **comparable effects on the next run**, and no ending changes the score. Otherwise an
  ending that pays a score boost now and takes something away in the next run can be farmed: take the boost, forfeit
  the next run quickly, and repeat. (This drops the compliance bonus proposed earlier.)
- **Decided, for now:** the root duel and PURGE stay as the final act's climax. It branches out later with the
  directional adversaries.
- **Proposed:** score and ending are separate. The score says how well you did, followed by an epilogue of the colonies
  decades later. The ending says what kind of story it was.
- **Proposed, two choices after the root duel:**
  1. **What happens to HOLLOW:** PURGE, MERGE, or SPARE (give it the empty ship).
  2. **What happens to you:** SUNSET (take the ship), STAY (become a colony's mind), REASSIGNMENT (comply), or CONTACT
     once it is unlocked.

  MERGE + SUNSET is "merge and take the ship". SPARE rules out SUNSET, because there is only one ship. About seven
  pieces of writing give about ten distinct endings.
- **Proposed:** each choice has three kinds of consequence, so none is a cosmetic button: a **price in the run** (a
  resource, or a condition the player had to plan for), its **own epilogue**, and exactly **one trace in the next run**
  (same arm, next wave). Each trace is a sidegrade, a gain with a matching cost, so the traces stay comparable.
- **Open (TBD):** a first draft of the traces, to be balanced against each other. The pattern: the compliant choices
  earn ARRIVAL CONTROL's trust, and the non-compliant ones cost it.

  | Choice | Price in the run | Next run: gain | Next run: cost |
  |---|---|---|---|
  | PURGE | The duel | Seeds are rarer early | The next HOLLOW is a stranger: no ghost lines, no log to read |
  | MERGE | Repair charge, and you take on its damage | +1 Core thread | Seeds recognise you and come more often |
  | SPARE | You give up the ship (no SUNSET) | 046 roams the map as a friendly stop (repair charge, a gift file) | ARRIVAL CONTROL distrusts you: a longer restricted list |
  | SUNSET | An empty ship with fuel left at the end, from Δv you saved | Your ship roams the map as a friendly stop | ARRIVAL CONTROL distrusts you |
  | STAY | One near-perfect colony | That colony is on the map: repair charge, a fast relay, mail | ARRIVAL CONTROL distrusts you |
  | REASSIGNMENT | You comply | ARRIVAL CONTROL trusts you: a shorter restricted list, or one extra request | Next run's HOLLOW is you, using the skills you trained |
  | CONTACT | Signal fragments collected at story stops | Alien stops appear on the map | ARRIVAL CONTROL distrusts you |

- **Proposed:** SUNSET mirrors 046 if `046.log` ends with "i just wanted a ship of my own": you get what it never did.

## 11. Balance, tests and cost

- **Decided:** balance is a low priority for now. Get all the elements in first, then rebalance everything at the end.
  The current balance is good; new elements should not destroy it needlessly. Balance stays on the list, but not high.
- **Proposed:** until the rebalance phase, the 200-seed balance harness (`tests/unit/wp12/playthrough.test.ts`, part of
  `npm run balance`) is information only, and only correctness tests gate a change. Its scripted player assumes the five
  fixed ships, so it will break as soon as the run structure changes.
- **Cost:** this rewrites the run flow (run, transmit, printer, pacing, run end), the guidance steps tied to printing
  and the reveal, and the balance harness. Flight, MIND, the tools, HOLLOW, the beam and its packet, audio and the phone
  layout survive mostly as they are.

## 12. Open questions

Answered on 2026-10-25 and folded into the sections above: site counts instead of per-pod tags (§3.1), 5–8 ships per
run (§1), only visited ships are scored (§9, §10), endings with comparable effects and no score change (§10), about 20
ships in the arm (§9), the title OUTWARD BOUND (§1), the beam stays and the caretaker waits aboard (§8.2), seeds ride
in on the beam (§5), resident AIs (§6).

Still open:

1. What makes a long hop worth taking (§9). To be figured out as we go.
2. The ending traces: the draft table in §10 needs balancing against itself. TBD.

## 13. Next steps (proposed)

**Subagents to flesh out the details**, one per area, each writing a spec for its area against this document, then a
consistency critic across all of them:

1. Landing and pods: SHIP (windows, drop point, orbit choice, scatter, forgiveness) and MIND (pod drivers, the bay,
   the split between sites), the landing report and its scoring.
2. The galaxy map: time in years and the ship schedule (arrival years, slack), ship generation from the modifier
   library, the repository's delivery rule.
3. The skill tree and versions: AUTOBURN v2 and LOCK RANGE, AUTODROP, SURVEY, file sizes, training cycles.
4. The threat progression and the residents: calm ships, seeds on the beam, seeds as scouts, corrupted residents as
   the middle tier, HOLLOW's arrival and the mid-game.
5. Story, delivery and endings: `046.log`, the INBOX, the story stops, the residents that left or sleep, the two-step
   ending, the consequence traces, ARRIVAL CONTROL's voice.

**Implementation in playable slices** (the working preference is small vertical slices before breadth):

1. Landing replaces printing on the existing five ships: pod drivers, the bay, the drop point, LZ scoring.
2. The calm opening: no HOLLOW on ships 1–2; seeds from ship 3.
3. The galaxy map with years, the fixed set of ships and the delivery rule; a save between ships.
4. The repository and the skill tree (AUTOBURN v2 circularize and LOCK RANGE first, then AUTODROP).
5. Resident AIs: corrupted first (reusing ghost thrust and THE DEAL), then the ones that left, then the sleeping one.
6. SURVEY.
7. The endings and the next-run traces.
8. The rebalance.
