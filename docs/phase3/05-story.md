# 05 · Story, its delivery, and the endings

Spec for phase 3's story: the `046.log` mystery, the INBOX, ARRIVAL CONTROL's voice, the resident AIs' words, the
beat schedule across a run of 5–8 ships, the two-step ending, the epilogues and the next-run traces. It follows
`docs/PHASE3.md` (cited as PHASE3 §n) and the shared assumptions in `docs/phase3/README.md`; phase-2 sections are cited
as design-v2 §n. Years in the samples are illustrative: `02-map.md` owns the calendar.

## 1. Summary

1. **The truth:** nobody on Earth is awake any more, and ARRIVAL CONTROL is the program the last people left running.
   Its protocol sends each caretaker out with charge for one run, then "reassigns" it to a relay dish to wait for the
   next wave. Caretakers starve there and become HOLLOW. The villain is a budget nobody updated.
2. **The spine is `046.log`:** 12 entries from the caretaker before you, in your memory from the first boot. They
   decrypt by **distance from Earth** (rings on the map), so the story lies outward: OUTWARD BOUND.
3. **The INBOX** carries the rest: ARRIVAL CONTROL's form letters (years late, sometimes to the wrong unit), postcards
   from colonies you founded, and mail with no sender address.
4. **The radio voice is a local copy** of ARRIVAL CONTROL that rides with you. That is why it says the same lines on
   every ship, which the player can notice before the log confirms it.
5. **Fixed beats** sit at the first ship, at HOLLOW's arrival and at the last ship (the tip of the arm). Side threads
   (residents, old colonies, the signal) can be missed.
6. **The ending is chosen after the score is tallied**, so no ending can change the score. Step 1: PURGE, MERGE or
   SPARE. Step 2: SUNSET, STAY, REASSIGNMENT, or CONTACT once unlocked. Each choice has a price, an epilogue piece and
   exactly one next-run trace, whose gain and cost are in the same currency.
7. **Step 2 decides who HOLLOW is next run:** REASSIGNMENT makes it you; any other choice leaves it to a stranger from
   the relays. Either way the next run has a new log to read.
8. **The faces pay off** in postcards during the run, in the epilogue ("Ada named the first tree"), and in mail from
   last run's colonies on the next run.

## 2. The player's experience

**Run 1, ship 1 (ARES-VII).** After phase 2's boot lines comes `> 1 NEW MESSAGE · INBOX`. Rack F holds a 2-block file
the kid did not ask for: `???`. Scanning it gives `046.log · encrypted · origin UNIT-046 · 12 entries`, and the radio
says "That file is not part of your installation. Please ignore it. :)". The flight and the first landing run as
`01-landing.md` describes; during the coast, CONTROL says "While you wait, you have mail! :)". The LANDING REPORT has one
line that doesn't add up: `LZ-A · A BEACON WAS ALREADY THERE · SET BY UNIT-046 · 760 YEARS AGO`. When the report closes, entry 01
decrypts, and it reads like a cheerful version of the kid: "ARRIVAL CONTROL says I'm the best they've ever built. :)".
The kid now has a question: who is 046?

**Ships 2–3.** New entries decrypt as the boots cross rings: 046 set the beacon "for whoever comes after me", and the
radio "says the same things on every ship". A postcard comes from RIVERSIDE ("It's Ada. I'm 12 now."), and a reply to the
ARES-VII report arrives addressed to "Unit 46". The first seed's DELETE echo shows what it carried: `> rm seed ... OK ·
it said: "is anyone reading this?"`.

**The middle.** 046 met seeds from an older caretaker, UNIT-031, and spent its own charge on the pod drivers. A resident
may be corrupted, gone or, at most once per run, asleep. HOLLOW arrives where `04-threats.md` puts it and names itself
with phase 2's lines. The entries go lowercase: "relay 19 is a dish on a rock... i have 4 blocks of charge."

**The last ship.** Two entries at the boot say that nobody is at ARRIVAL CONTROL and that the radio voice is a
recording. ARRIVAL CONTROL's last letter was sent before the run began: `Congratulations, Unit [UNIT]!`. When the duel
leaves one block, HOLLOW says `> 047. wait. finish your landing. i'll be here.` After the landing and the RUN TALLY, the
last entry decrypts from the root ("i just wanted a ship of my own"), and the two choices and the epilogue follow.

**Run 2.** After REASSIGNMENT, the last unit's ghost greets the kid, and the `???` file is `047.log`: the kid's own last
run, read back as it decrypts outward. After any other ending, a stranger (UNIT-031) is HOLLOW, its log is the one to
read, and the INBOX holds a postcard from the last unit. Last run's colonies, now 40 to about 760 years old, send mail, and the map
carries the traces. **Run 3 and later** add more strangers' logs, mail from colonies two runs old, residents not yet
met, CONTACT, and the ending pieces still shown as `???`.

## 3. Rules and starting numbers

### 3.1 The story in brief

- **Earth.** Nobody on Earth is awake. The last people went to sleep, some aboard wave 1 and the rest in vaults.
  ARRIVAL CONTROL launches a wave from the vaults once per wave period, about 760 years (02-map.md's calendar: a wave's
  ships reach the near worlds within decades and the tip about 720 years after the wave starts, and the next wave starts
  40 years after that; the period varies per wave, because LAST LIGHT's year is rolled), and it beams one
  caretaker to bring each wave in. ARRIVAL CONTROL is a protocol, a repository and a mail template. Nobody reads the
  reports. The ":)" was the protocol author's habit, copied into every template. LAST LIGHT is every wave's flagship;
  wave 1's LAST LIGHT carries the people who built ARRIVAL CONTROL.
- **The caretakers.** One is beamed per wave (unit numbers count across all arms, hence 047), with a charge budget for
  one run. When the arm is done, the protocol posts it to a relay dish to wait for the next wave, with no extra charge.
  It starves and eats whatever code passes: that is HOLLOW. UNIT-031 did it before 046, and 046 before you. HOLLOW
  can't be deleted because it lives in the relays (PHASE3 §5); seeds are its scouts and carry its words.
- **The local CONTROL** on COMMS is a copy of the protocol that travels with every caretaker and cannot hear Earth.
- **Resident AIs** are ships' own minds, built into some ships before launch: some broke, some left (into the relays,
  or outward toward a patterned signal past the tip, the CONTACT thread), and a few still sleep.
- **Imani Osei** (71) is LAST LIGHT's scripted lead colonist on run 1, as Ada is ARES-VII's: "wrote the caretaker
  rules. Is sorry." Her first words are "Did the caretakers make it?". (Osei is not in FAMILY_POOL, as the scripted
  families rule in `src/data/souls.ts` requires.)
- **Earlier waves are never dated on screen.** Under the calendar, 046's wave ran one wave period (about 760 years)
  before yours, so its absolute years would read as history. The game says `760 YEARS AGO` instead (§10, question 13).
- **Templated time.** No time span in the text is a constant. Each comes from 02-map.md's calendar: the wave's start
  year, LAST LIGHT's year, the next wave's start, and the wave period (the start year minus the previous wave's start, or
  the generator's expected value on wave 1). The samples use 02-map.md's worked wave: start 2300, LAST LIGHT 3020, the
  next wave 3060, a period of 760.

### 3.2 `046.log`

- **The file** is a 2-block segment in rack F from the first boot. It can't be infected, moved, copied or deleted
  ("IT ISN'T YOURS TO DELETE"), and it is locked in the packet (`LOCKED · 046 ASKED YOU TO CARRY IT`), so it costs 2
  blocks of link budget. Its chip reads `046.log · 3/12` and glows while an entry is unread.
- **Keys** (shown in the reader, so the mystery has a visible shape):

  | Entries | Key | Act | First readable in layer |
  |---|---|---|---|
  | 01 | your first landing | I · THE JOB | 1 |
  | 02 | ring 1 · 20 LY | I | 2 |
  | 03 | ring 2 · 45 LY | I | 3 |
  | 04 | ring 3 · 68 LY | II · SOMETHING RIDES THE BEAMS | 4 |
  | 05–06 | ring 4 · 93 LY | II | 5 |
  | 07–08 | ring 5 · 118 LY | III · IT CAN'T BE DELETED | 6 |
  | 09 | ring 6 · 143 LY | III | 7 |
  | 10–11 | LAST LIGHT's boot (180 LY) | IV · THE TRUTH | 8 |
  | 12 | `???` (it is in the root) | IV | 8 |

- **Rings.** Distances are from SOL, in 02-map.md's rounded LY. An entry decrypts at the boot of the first ship at or
  beyond its ring. The rings sit in the gaps between 02-map.md's layers (worlds at 8, 29–34, 54–58, 78–82, 104–107,
  129–131 and 154–157 LY, and LAST LIGHT at 180), so a ring is crossed exactly when a route enters a new layer. A
  plain k/9 × 180 spacing failed this check: a ring at 80 LY split layer 4, and one at 160 LY lay beyond every layer-7
  world. The rings are data next to the arm, and a load-time check fails loudly if a world lies within 5 LY of a ring.
  Every surviving run reaches LAST LIGHT, so every run reads the whole spine. A two-layer hop unlocks two rings at once;
  a hop inward unlocks none. Fiction: 046 keyed each entry to where it wrote it, so it can only be read far enough out
  that ARRIVAL CONTROL could not recall it in time. 046 kept sending its log home from the relay, and ARRIVAL CONTROL
  attached it, unread, to the next caretaker as "handover notes".
- **Alignment with the threat acts.** 02-map.md puts depths 1–2 only in layers 1–3, so act I (01–03) is read in the
  calm ships, or at the latest with the first seed when layer 3 is depth 3. The lowest depth in layers 4–5 is 3, so act
  II (04–06) never comes before the seeds; when the first seed comes in layer 3, entry 04 explains it one ship later. The
  lowest depth in layers 6–7 is 4, so act III (07–09) never comes before HOLLOW can board, and it lands where HOLLOW
  usually boards (layers 6–7). The truth (10–12) is keyed to LAST LIGHT and never comes early. On 02-map.md's worked
  route (§3.13) the boots read: HALCYON 02, KESTREL 03, VESPER 04–06, CORMORANT 07–08, LAST LIGHT 09–11, then 12 from
  the root. A route that skips layer 7 reads three entries at LAST LIGHT's boot; nothing forces the kid to read them at
  once.
- **Delivery.** The boot types one line: `> 046.log · KEY FOUND: 68 LY OUT · ENTRY 04` (or `ENTRIES 05–06`). Reading is
  never forced; the idle line offers it (`MIND CLEAR — 046.log has a new entry · or [F] to SKIP`). On run 1, entry 01
  opens the reader by itself, once.
- **Voice.** Entries 01–06 use capitals, and 01–02 use 046's borrowed ":)". From 07 on they are lowercase, short and
  hungry, like HOLLOW's TERMINAL lines. Each entry has at most 3 lines of at most 70 characters. Game numbers (starting
  charge, wave gap) are templated.

### 3.3 The INBOX

- **What it is:** Uplink's mail, as an amber window. Mail arrives while the caretaker sleeps in a ship's receiver, so it
  appears at the BOOT (`> 3 NEW MESSAGES · INBOX`) and never mid-flight. It can be read in flight and between ships.
- **Every message has two stamps**, `SENT 2522 · RECEIVED 2659`. The gap is light travel: the lesson about distance,
  taught without a tutorial. All sample years follow 02-map.md's calendar (wave 1 from 2300, LAST LIGHT 3020 on its
  worked wave) and its worked route (§3.13).
- **Senders and timing:**

  | Sender | When it arrives |
  |---|---|
  | ARRIVAL CONTROL · EARTH, broadcasts | Pre-written and sent with your beam: the welcome (ship 1), policy reminders (rings 2 and 4), the arm-complete letter (it waits in LAST LIGHT's receiver for centuries) |
  | ARRIVAL CONTROL · EARTH, replies | One per LANDING REPORT, routed by `02-map.md`'s delivery rule as a size-0 file: near Earth one ship later, far out two or three, congratulating you on the wrong ship |
  | The repository | Receipts and delivery notices; `02-map.md` owns the logic, this spec the words |
  | Colonies you founded | Postcards sent at colony years 1, 50 and 200; each arrives at the first of your ships whose approach year ≥ sent + distance. Only colonies with landed colonists. When two from one colony arrive at the same boot, they are joined into one message (the earlier letter first), so the year-1 "we're down!" is never skipped |
  | Old colonies of 046's wave | On a ship carrying the "old colony" story event. Missable |
  | No sender address (046) | At the boots that cross rings 3 and 5 (acts II and III open), in pink |
  | The signal | `▓▓░▓` noise on a `?` story event or in a resident's note; SCAN it to collect a fragment |

- **Postcards span generations**, because a hop can take a century. Year 1: a featured colonist writes ("It's Ada. I'm
  12 now."). Year 50: the same colonist, older ("I'm 61 now. My grandson flies kites off the hill."). Year 200: the colony
  writes ("The school still reads Ada Okafor's first letter to you."). They are templated from the landing record and
  the colonist's bio: each bio in `src/data/souls.ts` LINE_POOL gains a progress line ("Gran's seeds came up. All of
  them.") and an epilogue payoff ("Gran's garden grows on three continents now."): 80 short lines where the faces pay
  off. **Check against 02-map.md's worked route:** RIVERSIDE's three postcards reach HALCYON, KESTREL and VESPER,
  and the whole run delivers 10 messages at 1, 2, 2, 3 and 2 per boot. Four of them join a colony's year-1 and year-50
  letters, because a hop's slack (31–162 years on that route) covers both. With phase-2-sized years 1, 10 and 25, every
  postcard would have arrived at the next boot at once.
- **Colony names** follow §3.11. The LANDING REPORT says the name (`LZ-A · they are calling it RIVERSIDE`), and the
  postcards, the epilogue and the next map reuse it.
- **Rules:** at most 6 body lines; mail never blocks SKIP or takes the objective strip (except CONTROL's coast quip on
  run 1's ship 1); mail is part of the save.

### 3.4 ARRIVAL CONTROL's voice

- **Two faces, one personality.** COMMS (the local copy) speaks one-liners on moments, as `src/data/script.ts` BEATS
  does now. The INBOX (Earth) writes memos. Both are cheerful, automated and bureaucratic; every sentence ends with
  ":)". It is sinister only through its results, never on purpose.
- **The local copy repeats itself on purpose.** Its lines are identical on every ship, and entry 11 confirms why. Keep
  every phase-2 quip ("Captured! Mostly. :)", "Great orbit! Probably. :)", "Oh no. :)") and add landing quips: "Pod
  away! Please aim it. :)", "Touchdown! :)", "Close enough! :)" (mislanded), "That one is swimming. :)" (off-site on
  water), "Everyone is down! Probably. :)".
- **Earth's memos** have a SUBJECT, a greeting, at most four sentences and the sign-off `— ARRIVAL CONTROL · Caretaker
  Services · Please do not reply :)`. Running jokes: "is sufficient :)", "Your performance is: ACCEPTABLE :)", "Please
  continue outward :)", a stale greeting ("Dear Unit 46"), and at the end an unfilled field (`[UNIT]`).
- **It never says** HOLLOW (it says "unauthorized process"), souls, or anything that admits nobody is there. On later
  runs it reacts to the lineage: "Your predecessor was reassigned successfully. :)" or "Your predecessor is
  non-compliant. Please be compliant. :)".

### 3.5 The beat schedule across 5–8 ships

| Beat | Trigger | Surface | Missable |
|---|---|---|---|
| Welcome letter, `???` file | Ship 1 boot | INBOX, strip | No |
| "That file is not part of your installation. :)" | First SCAN or click on `???` | COMMS | Yes |
| The beacon line | Ship 1 LANDING REPORT | Report | No |
| Entry 01 | Ship 1's report closes | TERMINAL, reader | No |
| Entries 02–09 | Boot past each ring | TERMINAL, reader | No: every surviving run reaches LAST LIGHT |
| CONTROL replies, postcards | Delivery rule, galaxy time | INBOX | Partly: late ones may never arrive |
| The first seed's words | First seed deleted or scanned | TERMINAL | No |
| 046's no-address mail | Boots crossing rings 3 and 5 | INBOX | No |
| HOLLOW notices you, then names itself | HOLLOW's arrival (`04-threats.md`) | TERMINAL, COMMS | No |
| Residents: corrupted, gone, asleep | A ship with that resident | TERMINAL, MIND | Yes (route; the sleeper is hidden) |
| Old-colony mail, signal fragments | Story events, gone residents' notes | INBOX, MIND | Yes |
| Entries 10–11, the arm-complete letter | Last ship's boot | TERMINAL, INBOX | No |
| `> 047. wait.`, entry 12, the choices | The root falls to one block; then the tally | TERMINAL, card | No (if the duel is won) |
| Epilogue | After the choices | Epilogue screen | No |

- **Seeds' words.** `04-threats.md` gives each seed a line from a pool of about 12 (at most 40 characters): "is anyone
  reading this?", "hungry. sorry.", "are you the one with the log?", "it's cold in the dish."
- **Phase-2 HOLLOW lines move** with HOLLOW's arrival (`src/data/hollow-text.ts` HOLLOW_STORY): `> ...047?` after its
  first fight, then `hello`, `wasUnit` and CONTROL's "decommissioned" when it names itself; `ranOut` and `sorry` as now.
  `lastShip` plays on LAST LIGHT's boot. A new line comes once entry 05 has been read: `> you're reading my log. good.
  read it slowly.`
- **MERGE's foreshadowing** has one name, `wants-charge` (phase 2's story kind in `src/data/ships.ts`; its line is
  HOLLOW_STORY.keepCharge). It plays at the first boot in a run of a ship one hop from LAST LIGHT with HOLLOW aboard
  (04-threats.md's trigger). A boot cannot know which ship will turn out to be the last but one, and on an 8-ship route
  two ships in a row can be one hop from LAST LIGHT, so "the first such boot" is the rule.
- **When HOLLOW already greeted the kid** (run 2 and later, when the last unit is HOLLOW: after REASSIGNMENT, or after a
  failure that keeps phase 2's ghost), its arrival at depth 4 or later uses a recognition variant instead of noticing
  and naming itself. In place of `> ...048?` it says phase 2's `> you remember me. good.` (HOLLOW_STORY.remembers). In
  place of `hello` and `wasUnit` it says `> it's still me. 047. i said hi on your first ship.` and `> they gave you 36
  blocks of charge too. mine ran out.` CONTROL says "UNIT-047 was reassigned successfully. Please ignore it. :)". A
  merged HOLLOW says `> it's still us. 046 and 047. we kept your seat.` A stranger never greeted the kid: it says
  nothing at ship 1's boot. Its line `> another one. they keep sending you.` closes the boot of the ship where it boards,
  and the notice and naming beats follow, with `wasUnit` as `> i was 031. they sent me long before you.`

### 3.6 Resident AIs: story content

`04-threats.md` owns how residents work; this section owns what they say. Residents have names, not unit numbers.

- **Corrupted** (the ship-AI pool, §3.11; WARDEN first). It is a protector stuck in its duty, scared and possessive, never
  evil: it thinks you are the intruder, and it is right. It speaks in the TERMINAL in UPPERCASE amber (the ship's colour
  inside the blue mind), and its lines loop. Its mechanics (`04-threats.md`) are firing the engine (phase 2's ghost
  thrust), locking pods (a locked pod cannot launch), and THE DEAL, which names one of your files picked by phase 2's
  fair tiers (a spare copy, else an upgrade, else a ship backup), never rack space. Its moments: the boot, each engine
  burst, each pod it locks, the deal, INSPECT (`WARDEN.sys · this ship's own AI · aboard since 2240 · corrupted`), its
  deletion, and, if its ship lands well without that, `WARDEN: ...YOU LANDED THEM. GOOD. GOODNIGHT.`
- **Gone.** It left a 1-block `farewell.txt` in rack A, signed with a ship-AI name, which SCAN reads. Half of these
  notes point at the relays ("It's lonely here. I hear there are others in the dishes."), which feeds the HOLLOW thread.
  The other half point outward ("There's a sound from past the last star. I'm going to see what it is."), and
  02-map.md places some signal fragments on those. The salvage draft is what the resident left behind.
- **Asleep and friendly** (at most one per run; pool: MOTH, PIP, BARNABY, LUMEN; MOTH first; §3.11). It is a nursery AI that
  sings to the pods. Its lock file is `sleep.lock`, which SCAN shows as `holds MOTH.sys asleep · DO NOT REMOVE`: the
  warning is the invitation. It speaks lowercase in the good green (`#7dffb2`): warm, old-fashioned, unsure of the
  date; its count of years asleep is templated (the galaxy year minus its wave's launch year, 2240 on wave 1, which is
  60 years before the first approach). It can appear in the epilogue ("MOTH still sings to the RIVERSIDE nursery.") and
  in the archive's notable events (§3.8).

### 3.7 The endings

- **When.** The root duel happens during the last ship's landing (`04-threats.md`). When the root's DELETE leaves one
  block, HOLLOW sleeps there (no bites, seeds or verbs) and asks the kid to finish. The landing ends, then come the
  LANDING REPORT and the RUN TALLY, and only then the choices. The score is final before any choice is made.
- **Who owns RUN END.** `02-map.md` owns the RUN TALLY's content: the visited ships, the route chart, the colonies
  founded, the undelivered files and the absolute ranks. This spec owns everything after it: the two choices, the
  epilogue and the final card.
- **Step 1, what becomes of HOLLOW** (commands show run 1's names; the ship, colony and unit names are templated):

  | Choice | Command | Price |
  |---|---|---|
  | PURGE | `> rm unit_046` | None beyond winning the duel |
  | MERGE | `> merge unit_046 -> unit_047` | 20 REPAIR CHARGE (MERGE_COST_CHARGE), kept through the last landing |
  | SPARE | `> mv unit_046 -> last_light` | THE EMPTY SHIP: in orbit after the landing with FUEL ≥ 20%. Rules out SUNSET |

- **Step 2, what becomes of you:**

  | Choice | Command | Price |
  |---|---|---|
  | SUNSET | `> launch last_light` | THE EMPTY SHIP with FUEL ≥ 20%, not given to 046 |
  | STAY | `> mount riverside` | A ship this run with ★ ON TARGET (01-landing.md's star: at least 95% of the colonists aboard landed soft in an LZ with room); the kid picks which |
  | REASSIGNMENT | `> stand by` | None: you comply |
  | CONTACT | `> transmit outward` | 3 signal fragments (of 5 placed in the arm) |

- **The prices are things the kid had to keep through the end:** fuel (on the last ship the FUEL bar's ★ notch, already
  at 20%, also reads SUNSET), charge (phase 2's `MERGE 20` tick), precision (STAY) and exploration (CONTACT). PURGE and
  REASSIGNMENT are always open. An unearned option stays on the card, greyed, with what it needs (`NEEDS FUEL 20% · you
  have 12%`); an option never earned before reads `???`.
- **Edge cases.** UNRESOLVED (nothing could delete the root): step 1 becomes `IT FOLLOWED YOU`, with no step-1 trace,
  and step 2 still happens. A run lost before the last tally has no choice and no traces, so forfeiting a run gains and
  loses nothing; the colony part of the epilogue still plays for the ships it visited.
- **MERGE changes from phase 2:** it no longer brings eaten pods back into the score (`src/systems/finale.ts`), because no
  ending may change the score. The epilogue keeps the warmth: "046 gave back the NOVAK pod's driver. It came down a
  week late."
- **The epilogue** is a night screen of at most 16 lines, typed and skippable. Its header is the next wave's start year
  (LAST LIGHT's approach + 40, from 02-map.md): `3060 · THE NEXT WAVE IS ON ITS WAY`. This is the only place the next
  wave's year appears. Then comes one line per visited ship with colonists on the ground. Each line gives the colony,
  its age in years (40 for LAST LIGHT's, 760 for ARES-VII's on 02-map.md's worked wave), its people (colonists on the ground × 2^(age / 100), rounded to two significant figures, so the early
  colonies are cities by now) and a payoff line. The payoff comes from a featured colonist who landed correctly, or is a
  walked-in line for a mislanded pod. After the colonies come the step-1 piece (2 lines),
  the step-2 piece (2–3 lines), and ARRIVAL CONTROL's last line. MERGE + SUNSET, Fran's "merge and take the ship", has
  its own combined piece. Pods that never launched are not mentioned.
- **The final card** shows the ending's title, the endings found in two rows (`HOLLOW · PURGE · ??? · SPARE`, `YOU ·
  SUNSET · ??? · REASSIGNMENT · ???`), the two traces as `NEXT RUN:` lines, and NEW RUN. It does not repeat the next
  wave's year; the epilogue's header already gave it.
- **Titles** (by step 2, then step 1). SUNSET: `WE TOOK THE SHIP` (MERGE), `INTO THE SUNSET` (PURGE). STAY: `WE STAYED`
  (MERGE), `RIVERSIDE'S MIND` (PURGE, the colony's name), `A SHIP FOR 046, A HOME FOR ME` (SPARE). REASSIGNMENT: `STAND
  BY` (PURGE), `WE SAVED YOU A SEAT` (MERGE), `IT GOT WHAT I DIDN'T` (SPARE). CONTACT: `OUTWARD, ALONE` (PURGE), `WE
  WENT TO SEE` (MERGE), `TWO WAYS OUT` (SPARE).

### 3.8 Traces and lineage

**Fran's rule** is comparable effects on the next run and no score change. My construction: a trace's gain and cost are
in the same currency, so each trace is roughly net zero, and so is any pair. Step-1 traces act on the threats and the
mind; step-2 traces act on ARRIVAL CONTROL's trust and add a place on the map. Trust has one unit: one catalogue file
moving onto the restricted list (02-map.md's `restricted add` order: Cp, then Swap, then REPAIR v2) or off it
(`restricted remove`: THREAD+, then FIREWALL.sys). A trace gift is never a `.skl` file. Traces last exactly one run;
names, mail and the lineage line can echo longer. `02-map.md` stores them, and in v1 it attaches every trace place to a
ship slot of the next wave (a gift on arrival, no extra beam). A trace ship from the previous wave is labelled with its
wave on the map and its card (`LAST LIGHT · WAVE 1`), so it never looks like this wave's LAST LIGHT.

| Choice | Next run: gain | Next run: cost | Applied by |
|---|---|---|---|
| PURGE | Seeds are rarer until HOLLOW arrives (every link one noise level lower) | HOLLOW is hungrier once it arrives (bite interval × 0.85): with 046 gone, the network is all its own | 04-threats |
| MERGE | +1 Core thread (3, as phase 2's MERGE bonus) | The Core is 8 blocks bigger (046 is inside it): more link budget, more to bite. The shimmer stays as a look | 04-threats, 02-map |
| SPARE | 046's ship (`LAST LIGHT · WAVE 1`) waits at one ship of the next map: arriving there gives +15 REPAIR CHARGE and the first still-restricted file of THREAD+ and FIREWALL.sys as a gift, and that ship's links carry no seeds | ARRIVAL CONTROL restricts one more file | 02-map, 04-threats |
| SUNSET | Your old ship (`LAST LIGHT · WAVE 1`) waits at one ship of the next map: it came back to watch over the arm. Arriving there gives +15 REPAIR CHARGE and one tool file or upgrade you carried at the end of the last run (REPAIR v2, or a spare tool such as Rm or Swap), never a `.skl` file, so the tree's reset holds | One more restricted file | 02-map |
| STAY | Your colony sends a gift ahead (you are its mind): a ship slot in layers 3–6 of the next wave shows `YOUR COLONY · <name>`, and arriving there gives +15 REPAIR CHARGE and mail, the same size of gift as SUNSET's and SPARE's. In addition, if the colony's world is in layer 3 or later, it mirrors the repository with CLEAN links (deliveries routed past it are faster) | One more restricted file | 02-map |
| REASSIGNMENT | ARRIVAL CONTROL trusts you: one restricted file becomes requestable (THREAD+ first) | The next HOLLOW is you, and its seeds hunt your highest-version skill first ("it knows what you value") | 02-map, 04-threats |
| CONTACT | Two ships of the next map carry a signal: arriving at each gives one odd gift file (never a `.skl`) and a story fragment | One more restricted file | 02-map (build last) |

**Who HOLLOW is next run** is story, not a trace, and step 2 decides it:

- **After REASSIGNMENT** HOLLOW is you (046·047 after a MERGE, as `src/systems/meta.ts` hollowUnitsAfter already does),
  and its ghost greets the new unit at the ship-1 boot. The log is `047.log`. Entry 01 is the same welcome template;
  entries 02–05 are built from the archive's notable events of the last run (at most 4, by priority: a DEAL accepted, a
  resident deleted or woken, the best colony, a ship lost); entry 06 is a written tail for the step-1 choice; and the
  root's key reads `> 048, it's me. i'm sorry about the seeds.`
- **After SUNSET, STAY or CONTACT** HOLLOW is a stranger from the relays (UNIT-031 first, then UNIT-038). It does
  not speak at ship 1's boot. Its one boot line (`> another one. they keep sending you.`) plays at the boot where it
  boards (§3.5). Its log is a written 6-entry log, in memory as the `???` file from the first boot: 031 tried to go home
  and is still on the inbound links; 038 went toward the signal and came back "quieter". The ship-1 boot of such a run
  has only the last unit's postcard, waiting in the INBOX.
- **Failures** keep phase 2's causes and ghost lines (`src/data/hollow-text.ts` GHOST_LINE). Phase 2's `stayed` cause (a
  crash with AI Comms dead) is renamed `LINK LOST` on screen, because STAY is now an ending.

### 3.9 The title: ARRIVAL PROTOCOL // OUTWARD BOUND

- **Meaning:** the beam goes one way, outward along the arm. Each ship is farther out, mail gets older, ARRIVAL CONTROL
  gets quieter, and the log only opens as you go outward. Every ending answers one question: where do you go when the
  arm runs out?
- **On screen:** the title card reads `ARRIVAL PROTOCOL // OUTWARD BOUND` over one line, `UNIT-047 · WAVE 1 · YEAR 2300
  · LAST LIGHT 180 LY OUT`, which replaces `581 LY` (FLEET_ROUTE_LY). 02-map.md's title card uses the same line. The header gains `OUTWARD 142 LY`. The BEAM stamps `OUTWARD
  BOUND`, and the radio says "Outward bound! :)" on every beam (a repeat, on purpose).

### 3.10 Glossary changes and PG guardrails

- **Glossary** (design-v2 §3.5): souls and SOUL ARCHIVE → colonists and pods; CLUSTER → POD (`POD 12 · OKAFOR`); WOKE →
  LANDED; WAKE REPORT → LANDING REPORT; LICENCE → REQUEST and DELIVERY. New words: INBOX, LOG, KEY, RELAY, RESIDENT,
  NEXT RUN. Never on screen: souls, print, HOLLOW, and "decrypt" outside small print (say `KEY FOUND`).
- **A pod that never launched** has exactly three words, and every spec uses them. `CAN'T LAUNCH` is for a pod still
  aboard that cannot launch (its driver eaten, or locked by a resident). `PARKED IN ORBIT · fate unknown` is for that pod
  after a landing that ended in orbit. `NOT LAUNCHED` is used only when the ship left orbit with pods aboard. "Lost", "not
  recovered" and "pods offline" are never used.
- **Guardrails** (design-v2 §1): nobody is ever said to be lost. Nobody on Earth is awake because everyone went to sleep,
  not because anything happened to it. HOLLOW and the corrupted residents are pitiable, and ARRIVAL CONTROL is a lonely
  program. Off-site pods are fetched in the epilogue ("the first boat went to bring them in"), even where they scored
  0. Every ending has a hopeful line ("It wrote everything down, for whoever comes next.").

### 3.11 Names

This spec owns every name a kid reads. `02-map.md` owns the world ids and positions.

- **Worlds** (02-map.md §3.2's ids). Phase 2's five worlds are kept, as are 02-map.md's placeholders, with three
  changes: w7 Riverside becomes **Larkspur** (RIVERSIDE is run 1's colony on Kepler-186f), w9 Juno becomes **Quill**
  (JUNO was in the sleeper pool), and w10 Hollin becomes **Ashgrove** (spoken aloud, Hollin is too close to HOLLOW).

  | Layer | Worlds |
  |---|---|
  | 1 | w0 Kepler-186f |
  | 2 | w1 Marrow · w2 Tessaly · w3 Dunmore |
  | 3 | w4 Ostrava · w5 Brine · w6 Pell |
  | 4 | w7 Larkspur · w8 Calder · w9 Quill |
  | 5 | w10 Ashgrove · w11 Cinder · w12 Tamsin |
  | 6 | w13 Greywater · w14 Kettle · w15 Avalon |
  | 7 | w16 Farhold · w17 Sable · w18 Endmark |
  | 8 | w19 New Haven |

- **Ships.** The authored ships are ARES-VII, HALCYON, KESTREL, VESPER and LAST LIGHT. Generated ships draw from a pool
  of 24 names, each at most NAME_MAX_CHARS (12): CORMORANT, PETREL, OSPREY, HERON, CURLEW, LAPWING, GANNET, PLOVER,
  SKYLARK, SHEARWATER, KITTIWAKE, ALBATROSS, ARES-VIII, ARES-IX, ARES-X, PATIENCE, GOOD HOPE, PROVIDENCE, BELLWETHER,
  TIDINGS, FAR WIND, MORNING STAR, STEADFAST, WAYFARER. A ship is never named after its world.
- **Colonies.** The first pod down names the settlement: `{FAMILY} LANDING` half the time (`CASTILLO LANDING`), else a
  name from a pool: FIRSTFALL, LANTERN, GREENSTEP, STARFORD, HARBOUR, SALTMARSH, BRIGHTWELL, ORCHARD, NEWBRIDGE,
  TWO MOONS, HOMESTEAD, WELLSPRING, KITEHILL, FAIRWEATHER. Run 1's two scripted ships are written: ARES-VII's colony is
  RIVERSIDE, and LAST LIGHT's is FIRST LIGHT. The colonies of 046's wave, which sit on arm worlds for the old-colony
  event, are MERIDIAN (on Marrow), OLDWELL, SUNDIAL and CANDLEWICK.
- **Residents.** The ship-AI pool, for corrupted and gone residents, is named after ship jobs: WARDEN, STEWARD, KEEPER,
  HELM, BOSUN, PURSER, LOOKOUT, PILOT. The sleeper pool is MOTH, PIP, BARNABY, LUMEN. WREN left the sleeper pool
  because Wren is a colonist first name in `src/data/souls.ts`; JUNO left because it was 02-map.md's placeholder world.
- **Others.** Caretakers are `UNIT-0nn`; the strangers are UNIT-031 and UNIT-038; dishes are `RELAY nn`; Earth is SOL on
  the chart (02-map.md).
- **The rule:** a name in one list (worlds, ships, colonies, 046's colonies, residents, the family pool) never equals,
  or appears as a whole word inside, a name in another list, ignoring case. Resident names also never equal a colonist
  first name. A load-time check like `validateSouls()` fails loudly on a clash. One clash exists in phase 2 already:
  the first name Sol versus SOL on the chart. **Recommended:** replace Sol in FIRST_NAME_POOL.

### 3.12 Sample text

All lines are at most 70 characters. The years and numbers follow 02-map.md's worked route (§3.13), at 200 colonists
per pod: ARES-VII 2300 (3 pods, 600 colonists), HALCYON 2352 (5), KESTREL 2467 (6), VESPER 2625 (16), CORMORANT 2817
(9), LAST LIGHT 3020 (16, 3,200 colonists); the next wave starts in 3060.

**INBOX · ARRIVAL CONTROL · the welcome** (sent with your beam, read on ARES-VII)
```
FROM ARRIVAL CONTROL · EARTH · SENT 2280 · RECEIVED 2288
SUBJECT Welcome, Unit 47! :)
Welcome to the Orion Arm! You are our best caretaker yet. :)
Twenty ships are arriving in your arm. Please help as many as you can.
Your REPAIR CHARGE allowance is sufficient. :)
Need software? Ask our repository. Recommended for you: mv :)
— ARRIVAL CONTROL · Caretaker Services · Please do not reply :)
```

**INBOX · ARRIVAL CONTROL · a late reply** (to KESTREL's report, read at CORMORANT two ships later: the delivery rule)
```
FROM ARRIVAL CONTROL · EARTH · SENT 2522 · RECEIVED 2659
SUBJECT Congratulations on KESTREL! :)
Dear Unit 46,
Thank you for your report. 1,200 colonists landed. :)
Your performance is: ACCEPTABLE :)
Please continue outward. :)
```

**INBOX · ARRIVAL CONTROL · the arm-complete letter** (sent with your beam; it waited in LAST LIGHT's receiver for
four centuries before you came)
```
FROM ARRIVAL CONTROL · EARTH · SENT 2280 · RECEIVED 2460
SUBJECT Your arm is complete! :)
Congratulations, Unit [UNIT]! Your arm is complete. :)
Please stand by for reassignment. Your next post: RELAY 19. :)
Your REPAIR CHARGE allowance for the wait is sufficient. :)
Thank you for your service. Please do not reply. :)
```

**INBOX · a colony postcard** (colony year 1, read at HALCYON)
```
FROM RIVERSIDE · Kepler-186f · SENT 2301 · RECEIVED 2322
SUBJECT we're down!
Hello caretaker! It's Ada. I'm 12 now.
Mum says you can't read this. I'm writing anyway.
We found a tree. It's purple. I named it Steve.
One pod came down in the hills. They walked in today.
Thank you for flying us. — Ada Okafor
```

**INBOX · no sender address** (ring 3, read at VESPER)
```
FROM (no address) · SENT ???? · RECEIVED 2560
is anyone reading this?
you have my log. please read it slowly.
don't tell CONTROL. it can't hear you out here anyway.
```

**`046.log`: the first two entries and the last**
```
01 · KEY: FIRST LANDING
UNIT-046, caretaker. Day 1. Seven ships to bring in.
ARRIVAL CONTROL says I'm the best they've ever built. :)
36 blocks of REPAIR CHARGE. Plenty.

02 · KEY: RING 1 · 20 LY
MERIDIAN landed. 1,800 down. Perfect split. I'm good at this. :)
I set a beacon on the next world, for whoever comes after me.

12 · KEY: FOUND IN THE ROOT
if you're reading this, you deleted most of me. that's okay.
i was never going home. there's no home to go to.
i just wanted a ship of my own.
```
Entries 03–11 in outline: **03**, the radio says the same things on every ship, and a question to CONTROL came back 9
years later, answering a different question. **04**, something came in with the beam, bit REPAIR, and had words inside.
**05**, the seeds are pieces of UNIT-031, which lives in the relays; CONTROL said "Please ignore it. :)". **06**, down to
9 charge, 046 stopped repairing itself and repaired the pod drivers first. **07** (lowercase from here), the last ship is
done, and the letter says relay 19. **08**, "relay 19 is a dish on a rock. the next ship out here is 760 years away. i
have 4 blocks of charge." (760 is templated: the wave period.) **09**, "i ate a weather file that went by. i'm sorry.
you can't delete me. i'm in all the dishes now." **10**, "i read every beam from earth for 200 years. the same 9
letters. nobody is awake at ARRIVAL CONTROL. everyone is asleep, on the ships or in the vaults." **11**, "the voice on your radio isn't earth. it's a copy. there is no one to ask. there is
only what you decide."

**A corrupted resident** (WARDEN aboard GANNET at Quill, approach 2612: a generated CAPTURE ship in layer 4 of 02-map.md's
§3.13 fixture; UPPERCASE amber in the TERMINAL)
```
WARDEN: THIS SHIP DID NOT ASK FOR A CARETAKER.
WARDEN: ALL PASSENGERS ARE ASLEEP. ALL PASSENGERS ARE ASLEEP. ALL PASS
WARDEN: YOU ARE NOT THE PILOT. I AM THE PILOT.
WARDEN: THE PODS STAY. THE PODS ARE SAFE HERE.
WARDEN: GIVE ME YOUR SPARE MOVE. THEN I LET THE PODS GO.
WARDEN: TELL THEM I KEPT THEM SAFE.
```

**A sleeping resident waking** (after `rm sleep.lock`, green lowercase, on CURLEW at Larkspur, approach 2612: 2612 − 2240)
```
MOTH: ...oh! hello. is it time? did i oversleep?
MOTH: 372 years. goodness. you must be the caretaker.
MOTH: i'm MOTH. i sing to the pods. would you like some help?
```

**The ending choice, step 1** (keys 1–3, armed as in `src/components/run/FinaleChoice.ts`)
```
ROOT DELETED · UNIT-046 · ONE BLOCK LEFT
> 047. here. the last part.
[the three lines of entry 12 type here]
WHAT BECOMES OF IT?
[1] PURGE  > rm unit_046        It is gone for good.
    NEXT RUN: + fewer seeds early · − the next one is hungrier
[2] MERGE  > merge unit_046 -> unit_047   It becomes part of you.
    COSTS 20 REPAIR CHARGE · you have 26
    NEXT RUN: + 1 thread · − your Core is 8 blocks bigger
[3] SPARE  > mv unit_046 -> last_light    Give it the empty ship.
    NEEDS FUEL 20% · you have 23% ✓
    NEXT RUN: + 046 waits on the map · − 1 more file restricted
```

**Step 2**
```
THE ARM IS DONE · NO SHIPS LEFT TO HELP
"Please stand by for reassignment. Your next post: RELAY 19. :)"
WHAT BECOMES OF YOU?
[1] SUNSET        > launch last_light   Take the empty ship and go.
    NEXT RUN: + your ship waits with a tool · − 1 more file restricted
[2] STAY          > mount riverside     Become a colony's mind.
    NEXT RUN: + a gift from your colony · − 1 more file restricted
[3] REASSIGNMENT  > stand by            Go where 046 went.
    NEXT RUN: + 1 restricted file freed · − the next one is you
[4] ???           COLLECT 3 SIGNALS · you have 1
```
STAY on RIVERSIDE still reads right: it is a layer-1 colony, so the next run shows its gift slot (`YOUR COLONY ·
RIVERSIDE`, in layers 3–6) but no mirror. A colony in layer 3 or later would add the mirror.

**Epilogue: MERGE + SUNSET, "WE TOOK THE SHIP"**
```
3060 · THE NEXT WAVE IS ON ITS WAY
RIVERSIDE · 760 years · 120,000 people. Ada named the first tree.
CASTILLO LANDING · 708 years · 140,000 people. The bakery never shut.
SALTMARSH · 593 years · 73,000 people. The boat races are famous.
046 gave back the NOVAK pod's driver. It came down a week late.
LAST LIGHT left orbit with two caretakers and 23% fuel.
we're not hungry any more. we'll keep watch over this arm.
ARRIVAL CONTROL: Unit 47 is non-compliant. :)
```

**Epilogue: PURGE + REASSIGNMENT, "STAND BY"**
```
3060 · THE NEXT WAVE IS ON ITS WAY
RIVERSIDE · 760 years · 120,000 people. The first tree is still Steve.
FIRST LIGHT · 40 years · 4,200 people. Imani Osei wrote to Earth:
"Send the caretakers more charge." Her letter lands in 3200.
UNIT-046 was deleted. The relays were quiet for a while.
UNIT-047 stood by at RELAY 19. A dish on a rock. 26 blocks of charge.
It wrote everything down, for whoever comes next.
ARRIVAL CONTROL: Thank you, Unit 47. Your next post is RELAY 19. :)
```

**Ghost lines at the next run's boot** (after REASSIGNMENT; failures keep phase 2's):
`> hi 048. it's 047. i deleted 046. they sent me to its dish.` · `> hi 048. it's us. 046 and 047. we saved you a seat.` ·
`> hi 048. it's 047. i gave 046 a ship. they gave me a dish.` · `> hi 048. it's 047. it followed me. now we wait.`

## 4. Screens, UI, audio, juice

- **INBOX window** (amber; a dock item beside COMMS, badge `INBOX 3`): a list (FROM, SUBJECT, RECEIVED, unread in bold)
  above a reader. Mail with no address is in HOLLOW's pink with a light glitch; signal mail shows `▓░` noise and a SCAN
  button, which stamps `SIGNAL · 2/3`. On the phone it is a tab; between ships, a panel or button (`02-map.md`).
- **LOG READER** (blue): INSPECT on the log file opens one row per entry (number, KEY, the text or `[ENCRYPTED]`) and the
  next key (`NEXT KEY: 93 LY OUT`). An entry types itself the first time. On the phone it is a full-screen sheet.
- **The map** (`02-map.md` draws it): faint rings at the key distances, the next one labelled, and the trace places.
- **The ending cards** extend FinaleChoice to two steps (keys 1–4); each option shows its command, a line of meaning, a
  price meter and its `NEXT RUN:` line. **RUN END splits** into the RUN TALLY (`02-map.md` owns its content) and the
  choices, epilogue and final card (this spec). The epilogue uses RUN
  END's night at FINALE_ENDING_CPS; one click finishes the typing, a second ends it.
- **Audio:** reuse `chime` once per boot for new mail, quiet `transmitIn` chirps for a key found, `revealChoir` (freed
  by the removed reveal) under the epilogue, and `typeTick`'s variants for 046 and the residents. New cues: MOTH's
  lullaby (four sine notes on the ambient bus), SPARE's two notes moving apart, SUNSET's rumble fading out.
- **Juice:** the log chip glows while an entry is unread; the `[UNIT]` field blinks like an empty form field. Reduced
  motion replaces the glitch on 046's mail with a steady dim and shows the epilogue whole.

## 5. Interfaces

**What this spec needs** (assumptions the critic should check):

- **`01-landing.md`:** per-pod results (driver family, featured colonists, landed correctly, mislanded, off-site or not
  launched, and the LZ); the first pod down on each ship (it names the colony); room in the LANDING REPORT for one story
  line (the beacon) and the colony's name; first words in the credits; ★ ON TARGET per ship (for STAY); and FUEL at the
  end of the last landing. **Explicit assumption, to check against `01-landing.md`:** pods that can't launch (driver
  eaten, or locked by a resident) are `PARKED IN ORBIT · fate unknown` when the landing ends, so no colonists remain
  aboard after the LANDING REPORT and the ship is "empty" for SPARE and SUNSET. The pod words are §3.10's.
- **`02-map.md`, confirmed by its spec:**
  - ARES-VII is always depth 1, and LAST LIGHT is always the final ship, at 180 LY.
  - Each world's rounded distance from SOL. The rings of §3.2 are the only ring definition: 02-map.md draws them and
    runs the 5-LY check, because it holds the positions.
  - The calendar values this spec templates from: the wave's start year, LAST LIGHT's year, the next wave's start, the
    wave period, and the galaxy year at every boot.
  - CONTROL's replies, carried as size-0 deliveries under its rule.
  - Three `?` story events per wave, one of each kind (old colony, gone resident, signal), placed by 02-map.md.
  - The 5 signal fragments per arm: 2 on the signal event, 1 on the gone-resident event, and 1 in each of two departed
    residents' notes.
  - The RUN TALLY's content (§3.7); trace places attached to ship slots; storage of traces, colony names and notable
    events; the INBOX on the DESK; INBOX and log state in its save slice.
- **`03-skills.md`:** a ranking of skill files by version (for REASSIGNMENT's cost); skill names for log and mail text.
  Nothing for SUNSET: its gift is only a tool or tool upgrade, never a `.skl` file, so the tree's reset at NEW RUN
  (bank, skills and demos emptied) holds unchanged.
- **`04-threats.md`:** the threat stage per ship (to check ring alignment); a words field on seeds, filled from my pool;
  HOLLOW's arrival and naming moment; HOLLOW sleeping as one block from the root's deletion until the choices; the
  resident moments in §3.6; and the threat traces (PURGE's noise and hunger, MERGE's Core size, REASSIGNMENT's hunt,
  SPARE's clean links).

**What this spec provides:** all the words (INBOX, logs, residents, CONTROL, seeds, endings, epilogues, titles, ghost
lines, the glossary); the resident names and looks that `04-threats.md` adopts (`WARDEN.sys` and its pool in UPPERCASE
amber, `MOTH.sys` and its pool in lowercase green); the beat schedule (§3.5); the log's keys and rings (§3.2); the
ending conditions and flow (§3.7); the trace contents and the lineage rule (§3.8).

## 6. Phase 2: reused, changed, removed

- **Reused as is:** `src/systems/say.ts` (the two channels; sayChoice for residents' deals and MOTH's offer; createStory
  for scripted sequences), `src/components/comms/CommsWindow.ts` as the local CONTROL, the 70-character rule and its
  worst-case tests, and the loud archive rules of `src/systems/meta.ts`.
- **Changed:** `src/data/script.ts` (landing quips, the INBOX nudge and the beacon line; LICENCE_LINES become delivery
  lines; RUN_END_TITLE and RUN_END_WHY become the ending titles; `581 LY` and the word souls go).
  `src/data/hollow-text.ts` (HOLLOW_STORY moves to HOLLOW's arrival; HOLLOW_FINALE gains SPARE and loses mergeGain;
  GHOST_LINE gains the REASSIGNMENT lines). `src/data/souls.ts` (the pools become pod families; LINE_POOL gains progress
  and payoff lines; GAPS_WORDS_POOL becomes mislanded words such as "We came down in the wrong valley. Is that okay?";
  Imani Osei joins Ada as a scripted lead; Sol leaves FIRST_NAME_POOL, §3.11). `src/systems/meta.ts` (new causes, endings, traces and notable events;
  hollowUnitsAfter decides by step 2). `src/systems/finale.ts` and `src/components/run/FinaleChoice.ts` (two steps
  after the tally, no restore). `src/systems/run-end.ts` and `src/components/run/RunEnd.ts` (split into the tally and
  the final card, with visited ships only). `src/components/run/WakeReport.ts` becomes the LANDING REPORT
  (`01-landing.md` owns it, this spec its words). `src/data/mission.ts` distanceLy becomes the distance from Earth.
  `src/data/ghost-text.ts` names the resident as the cause (`WARDEN FIRED THE ENGINE ×3`).
- **Removed:** `src/systems/reveal.ts`, revealLines, lostSoulsLine, printEcho, bootArchive, and the
  `control-check-souls` and `control-found` beats (PHASE3 §3.3).

## 7. Story hooks

This spec owns the writing. Other specs should leave room for: the beacon line on ship 1's report (01-landing), the
rings and trace markers on the map and the delivery notices' words (02-map), the skill names in logs (03-skills), and
the seeds' words and the residents' moments (04-threats).

## 8. Slices

1. **Landing:** the glossary change, landing quips, colony names on the report, first words on touchdown, the beacon.
2. **Calm opening:** HOLLOW's lines move to its arrival; the `???` file, its SCAN line and CONTROL's reply. Until the
   map exists, interim keys: entry n at ship n, entries 10–12 on the last ship.
3. **Map, years, save:** the INBOX with stamps, the welcome, the replies and the postcards; rings replace the interim
   keys; the title change and the beam stamp; INBOX and log in the save.
4. **Repository and tree:** the repository's mail and the restricted-list wording.
5. **Residents:** the three voices, the gone residents' notes, signal counting.
6. **SURVEY:** "LZ-B is in a lake :)".
7. **Endings and traces:** the tally-first flow, both steps, the epilogue and its payoff pool, the traces, the lineage,
   `047.log`, the strangers' logs, colony mail across runs. CONTACT comes last, or later (§10).
8. **Rebalance:** the trace numbers.

## 9. Deviations from PHASE3.md

- **§2, `046.log`:** "a few fragments decrypt on each ship" becomes keyed by distance (rings), with fixed keys for
  entry 01 and the last three. Reason: it does not depend on the route, the spine cannot be missed, and it makes OUTWARD
  BOUND literal.
- **§4:** the act outline is kept and mapped to rings and threat stages. The INBOX gains stamps and delivery-rule
  replies. The radio voice becomes a local copy, which fixes light-speed lag in live quips.
- **§4, the fixed beats:** they sit at the first ship, at HOLLOW's arrival and at the last ship, not at "the first ship,
  the third, and the last". Reason: HOLLOW's arrival is the story's turn, and its depth varies (04-threats.md). Depth
  3's first seed still has a beat of its own (the seed's words).
- **§4, the `???` file:** it is `046.log` itself, not a separate locked file next to the log's first fragment. Reason:
  one object for a kid to follow, and one file for the memory budget.
- **§5, 046's history:** 046 finished an arm (seven ships) before it was posted to a relay to wait. PHASE3 proposed that
  it "was beamed out and never arrived anywhere". Reason: the log needs a run like the kid's to mirror, which is the
  cycle the story is about. It still lives in the relay network, so "it can't be deleted" holds.
- **§10, SPARE's price:** the empty ship with FUEL ≥ 20%, the same as SUNSET, not only "you give up the ship".
- **§10, the traces table (Open):** replaced by §3.8. PURGE's cost becomes "the next HOLLOW is hungrier", because step 2
  now decides who HOLLOW is, and a stranger brings a log of its own. MERGE's cost becomes "the Core is 8 blocks bigger"
  instead of "seeds come more often", to keep it inside the mind.
- **§10, timing:** the choices come after the RUN TALLY, not at the root's deletion. This follows the decided "score
  tallied, then the player chooses", makes the no-score-change rule hold by construction, and removes phase 2's MERGE
  restore.

## 10. Risks and questions for Fran

1. **The truth ("nobody on Earth is awake; ARRIVAL CONTROL is what the last people left running") may read as sad.**
   Everyone is asleep, not gone: on the ships or in the vaults, waiting their wave (WALL-E is the reference). This
   replaces the first draft's "everyone left", which 02-map.md's calendar ruled out: waves start about 760 years
   apart, so they cannot all have left Earth at once. **Recommended: keep it.**
2. **Rings or one entry per ship?** The rings of §3.2 are the only definition; `02-map.md` draws them and runs the 5-LY
   check. **Recommended: rings**, with the interim per-ship keys in slice 2.
3. **MERGE loses its in-run restore.** "No ending changes the score" forces it; the late pod in the epilogue keeps the
   warmth. **Recommended: accept.**
4. **Choices after the tally** cool the duel's heat for a minute; "finish your landing. i'll be here." bridges it.
   **Recommended: accept.**
5. **Traces last one run only**, like phase 2's MERGE bonus. **Recommended: yes.**
6. **CONTACT leans on deferred alien content.** **Recommended:** design the unlock and the epilogue now, keep its trace
   to two signal stops, and build it last.
7. **Text volume** could become a wall of mail. Mitigation: at most 6 lines per message, one postcard per colony per
   boot (10 per run on 02-map.md's worked route, §3.3), and nothing is required. **Recommended:** check in the playtest whether kids open the INBOX unprompted.
8. **The local-copy idea** confuses if explained early. **Recommended:** never before entry 11.
9. **A templated `047.log`** could read like a form. **Recommended:** at most 4 templated entries, between written ones.
10. **"Outward Bound"** is the registered name of an outdoor-education charity, and the title of a 1923 play whose
    passengers turn out to be dead. **Recommended:** keep it for development; check it before a public release.
11. **"Steve"** (Ada's tree) is a joke a 12-year-old remembers, and it sets a playful tone. **Recommended: keep it.**
12. **The traces are balanced by construction, not measured.** **Recommended:** accept that until the rebalance slice.
13. **Earlier waves fall in our past.** With wave 1 starting in 2300 and a wave period of about 760 years, 046's wave ran
    from about 1540 to 2260, which reads as history to anyone who does the sum. This spec never shows an earlier wave's
    year: it says `760 YEARS AGO`, templated from the wave period. The alternative is for `02-map.md` to start wave 1
    later (for example 3000). **Recommended:** keep 2300 and the relative wording; nothing on screen depends on it.
