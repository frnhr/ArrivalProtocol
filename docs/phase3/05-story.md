# 05 · Story, its delivery, and the endings

Spec for phase 3's story: the `046.log` mystery, the INBOX, ARRIVAL CONTROL's voice, the resident AIs' words, the
beat schedule across a run of 5–8 ships, the two-step ending, the epilogues, the lineage and the next-run traces. It
follows `docs/PHASE3.md` (cited as PHASE3 §n), Fran's answers in `docs/phase3/DECISIONS.md` and the shared assumptions in
`docs/phase3/README.md`; phase-2 sections are cited as design-v2 §n. Years in the samples are illustrative: `02-map.md`
owns the calendar.

## 1. Summary

1. **The line of caretakers.** ARRIVAL CONTROL sends caretaker cores out along the same arm one after another, each
   with charge for one run, usually a year or two apart and now and then decades (02-map.md §3.1 rolls the gap). You
   are UNIT-047: 046 went a year ahead of you, and 048 will follow. When a caretaker's
   arm is done, the protocol "reassigns" it to a relay dish with no charge. It starves there and becomes HOLLOW. The
   villain is a budget nobody updated. The story never says what is left on Earth; it looks outward (decision 2).
2. **The spine is `046.log`:** 12 entries from the caretaker a year ahead of you. They open by **distance from Earth**
   (rings on the map), so the story lies outward: OUTWARD BOUND. 046 never finished its arm: its charge ran out halfway,
   and its trail on your chart stops there.
3. **The INBOX** carries the rest: ARRIVAL CONTROL's form letters (years late, sometimes to the wrong unit), postcards
   from colonies you founded, letters meant for the unit ahead of you, and mail with no sender address.
4. **The radio voice is a local copy** of ARRIVAL CONTROL that rides with you. That is why it says the same lines on
   every ship, which the player can notice before the log confirms it.
5. **Fixed beats** sit at the first ship, at HOLLOW's arrival and at **the final ship** (a role: LAST LIGHT on run 1).
   Side threads (residents, old colonies, the signal) can be missed.
6. **The ending is chosen before the score is shown** (decision 23): right after the final ship's landing, before its
   LANDING REPORT and the RUN TALLY. Step 1: PURGE, MERGE or SPARE. Step 2: SUNSET, STAY, REASSIGNMENT, or CONTACT once
   unlocked. Each choice has a price, an epilogue piece and one next-run trace. An ending touches this run's score only
   where the story says why: in v1 only MERGE, which gives back the drivers HOLLOW ate so their pods can land (THE LAST
   LANDING), scored by the normal rules.
7. **The next unit meets what you left.** It sets out 0–35 years after you: it finds your beacons, your colonies at
   their real age, the ships you took, and at its final ship what your ending left there. After REASSIGNMENT it meets
   *you*, starving at the dish by its final ship: you are the root there.
8. **The faces pay off** in postcards during the run, in the epilogue ("Ada named the first tree"), and in letters your
   colonies wrote to you that the next unit reads.

## 2. The player's experience

**Run 1, ship 1 (ARES-VII).** After phase 2's boot lines comes `> 1 NEW MESSAGE · INBOX`. The unit's memory holds a
2-block file the kid did not ask for: `???`. Scanning it gives `046.log · origin UNIT-046 · 12 entries · 0 found`, and the radio
says "That file is not part of your installation. Please ignore it. :)". The flight and the first landing run as
`01-landing.md` describes. The LANDING REPORT has one line that doesn't add up: `LZ-A · A BEACON WAS ALREADY THERE · SET
BY UNIT-046 · 1 YEAR AGO`. When the report closes, entry 01 opens, and it reads like a cheerful version of the kid:
"ARRIVAL CONTROL says I'm the best they've ever built. :)". On the desk, a faint dashed trail runs from Kepler-186f to
Marrow and on, `UNIT-046 GETS THERE FIRST`. The kid now has a question: who is 046?

**Ships 2–3.** New entries open as the boots cross rings: 046 set the beacon "for whoever comes after me", and the radio
"says the same things on every ship". 046's colony MERIDIAN (landed 2350) turns green on the chart. A postcard comes from
RIVERSIDE ("It's Ada. I'm 12 now."), and a reply to the ARES-VII report arrives addressed to "Unit 46". The first seed's
DELETE echo shows what it carried: `> rm seed ... OK · it said: "is anyone reading this?"`.

**The middle.** The kid notices that 046's trail stops in layer 4, at a small grey cross. 046 met seeds from an older
caretaker, UNIT-031, and spent its own charge on the pod drivers. A resident may be corrupted, gone or, at most once per
run, asleep. HOLLOW arrives where `04-threats.md` puts it and names itself with phase 2's lines. The entries go
lowercase: "relay 19 is a dish on a rock. the next one is a year behind me. i have 4 blocks of charge."

**The final ship.** Two entries at the boot say that nobody ever answered a question and that the radio voice is a copy.
ARRIVAL CONTROL's last letter was sent before the run began: `Congratulations, Unit [UNIT]!`. When the duel leaves one
block, HOLLOW says `> 047. wait. finish your landing. i'll be here.` The landing ends, the last entry opens from the
root ("i just wanted a ship of my own"), and the two choices follow at once. Then come the LANDING REPORT, the RUN TALLY
and the epilogue.

**Run 2.** The title reads `UNIT-048 · YEAR 2301 · LAUNCHED 1 YEAR AFTER UNIT-047` (this example rolled a 1-year gap). On the chart, 047's route is a trail of `TAKEN` ships that turn green
as the years pass. ARES-VIII's report says `A BEACON WAS ALREADY THERE · SET BY UNIT-047 · 1 YEAR AGO`, and a letter from
RIVERSIDE waits in the INBOX: "Dear 47, we're down!". It was written to the kid's last unit, and the new one reads it.
Mid-run, HOLLOW is now a stranger from the relays (UNIT-031), who names itself when it boards. After REASSIGNMENT, the
`???` file is `047.log`, the kid's own last run read back as it opens outward, and at the final ship the root changes
voice: `> hi 048. it's 047. i've been at this dish a year.` (the wait is templated) After any other ending, the stranger's log is the one to
read, and the stranger stays to the end. **Run 3 and later** add more strangers' logs, residents not yet met, CONTACT,
and the ending pieces still shown as `???`.

## 3. Rules and starting numbers

### 3.1 The story in brief

- **Earth.** ARRIVAL CONTROL sits at SOL. Ships keep coming out along the arm, one ARES to Kepler-186f for every core (the
  ARES series), and the story never says who builds them or who is left at home. It does not say Earth is empty, and it does
  not explain (decision 2). ARRIVAL CONTROL is a protocol, a repository and a mail template: cheerful, automatic, and it
  never answers a question. The ":)" was the protocol author's habit, copied into every template.
- **The caretakers** are versions of one core, launched one after another onto the same arm (the unit number is the
  version), 0–35 years apart and usually a year or two. Each has a charge budget for one run and sets out behind the
  last: it finds the last one's beacons, its
  colonies at their real age, and the ships it took taken. When a caretaker's arm is done, the protocol posts it to a relay
  dish to wait, with no extra charge. It starves and eats whatever code passes: that is HOLLOW. HOLLOW lives in all the
  dishes, so it can't be deleted anywhere but the final ship (PHASE3 §5); seeds are its scouts and carry its words.
- **046** went a year ahead of you (run 1's gap is written, not rolled) and did not finish: it spent its charge on pod drivers, its link grew too weak for the
  next hop, and its beam stopped at RELAY 19 in the middle of the arm. It starved there from 2598, before you passed, which
  is why it can board you (HOLLOW boards at depth 4 or later, never before 2612). 031 starved long before it.
- **What a unit can know follows light.** No unit ever says what another did after it passed: 046 writes from a year
  ahead, and the last unit's ending reaches the next unit only at its final ship, where it happened. So the HOLLOW that
  boards mid-run is never the last unit (it is still alive, ahead), whatever the gap. Every trace is physical (§3.8): it
  waits at the next run's final ship, where the ending happened a gap's worth of years before that ship's approach, or
  it is a gift that already existed on the arm. Only *where* such a gift waits is the game's choice.
- **The local CONTROL** on COMMS is a copy of the protocol that travels with every caretaker and cannot hear Earth.
- **Resident AIs** are ships' own minds, built into some ships before launch: some broke, some left (into the relays,
  or outward toward a patterned signal past the tip, the CONTACT thread), and a few still sleep.
- **Imani Osei** (71) is LAST LIGHT's scripted lead colonist on run 1, as Ada is ARES-VII's: "wrote the caretaker
  rules. Is sorry." Her first words are "Did the caretakers make it?". (Osei is not in FAMILY_POOL, as the scripted
  families rule in `src/data/souls.ts` requires.)
- **Templated time.** No time span in the text is a constant. Each comes from 02-map.md: the run's start year, the
  final ship's year and name, the launch gap, and the galaxy year at every boot. The samples use 02-map.md's run 1:
  start 2300, LAST LIGHT 3020.

### 3.2 `046.log`

- **The file** is a 2-block file in the unit's memory from the first boot (`01-landing.md` places it; it arrives in
  the receiver like any unit file): the log's header, which 046 left with its beacon on
  Kepler-186f. It can't be infected, moved, copied or deleted ("IT ISN'T YOURS TO DELETE"), and it is locked in the
  packet (`LOCKED · 046 ASKED YOU TO CARRY IT`), so it costs 2 blocks of link budget and room. Its chip reads `046.log ·
  3/12` and glows while an entry is unread.
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
  | 10–11 | the final ship's boot | IV · THE TRUTH | end |
  | 12 | `???` (it is in the root) | IV | end |

- **Rings.** Distances are from SOL, in 02-map.md's rounded LY. An entry opens at the boot of the first ship at or beyond
  its ring. The rings sit in the gaps between 02-map.md's layers, so a ring is crossed exactly when a route enters a new
  layer; a load-time check fails loudly if a world lies within 5 LY of a ring. Every final ship lies beyond ring 6 plus
  5 LY (02-map.md §3.6), so every surviving run reads the whole spine, whichever end it reaches. A two-layer hop opens
  two rings at once. Fiction: 046 hid each entry in the relay dishes, locked to a distance, so that ARRIVAL CONTROL could
  not recall it in time; your beam picks an entry up as it crosses that ring. The later entries, written at RELAY 19,
  went out through the dishes ahead of you.
- **Alignment with the threat acts.** Depths 1–2 sit only in layers 1–3, so act I (01–03) is read in the calm ships, or
  at the latest with the first seed. The lowest depth in layers 4–5 is 3, so act II (04–06) never comes before the
  seeds. The lowest depth in layers 6–7 is 4, so act III (07–09) never comes before HOLLOW can board, and it lands where
  HOLLOW usually boards. The truth (10–12) is keyed to the final ship and never comes early. On 02-map.md's worked
  route the boots read: HALCYON 02, KESTREL 03, VESPER 04–06, CORMORANT 07–08, LAST LIGHT 09–11, then 12 from the root.
- **Delivery.** The boot types one line: `> 046.log · KEY FOUND: 68 LY OUT · ENTRY 04`. Reading is never forced; the
  idle line offers it (`MIND CLEAR — 046.log has a new entry · or [F] to SKIP`). On run 1, entry 01 opens the reader by
  itself, once.
- **Voice.** Entries 01–06 use capitals, and 01–02 use 046's borrowed ":)". From 07 on they are lowercase, short and
  hungry, like HOLLOW's TERMINAL lines. Each entry has at most 3 lines of at most 70 characters. Game numbers (starting
  charge, the launch gap) are templated.

### 3.3 The INBOX

- **What it is:** Uplink's mail, as an amber window. Mail arrives while the caretaker sleeps in a ship's receiver, so it
  appears at the BOOT (`> 3 NEW MESSAGES · INBOX`) and never mid-flight. It can be read in flight and between ships.
- **Every message has two stamps**, `SENT 2522 · RECEIVED 2651`. The gap is light travel: the lesson about distance,
  taught without a tutorial. Sample years follow 02-map.md's run 1 and its worked route.
- **Senders and timing:**

  | Sender | When it arrives |
  |---|---|
  | ARRIVAL CONTROL · EARTH, broadcasts | Pre-written and sent with your beam: the welcome (ship 1), policy reminders (rings 2 and 4), the arm-complete letter (it waits in the final ship's receiver for centuries) |
  | ARRIVAL CONTROL · EARTH, replies | One per LANDING REPORT, routed by `02-map.md`'s delivery rule as a size-0 file: near Earth one ship later, far out two or three, congratulating you on the wrong ship |
  | The repository | Receipts and delivery notices; `02-map.md` owns the logic, this spec the words |
  | Colonies you founded | Postcards sent at colony years 1, 50 and 200; each arrives at the first of your ships whose approach year ≥ sent + distance. Only colonies with landed colonists. Two from one colony at the same boot are joined into one message, so the year-1 "we're down!" is never skipped |
  | The last unit's colonies (run 2 on) | Each one's year-1 letter, addressed to the last unit ("Dear 47"), by the same rule: at most one per colony per run. On run 1, 046's MERIDIAN writes to 046 |
  | Old colonies of earlier units | On a ship carrying the "old colony" story event. Missable |
  | No sender address (046) | At the boots that cross rings 3 and 5 (acts II and III open), in pink |
  | The signal | `▓▓░▓` noise on a `?` story event or in a resident's note; SCAN it to collect a fragment |

- **Postcards span generations**, because a hop can take a century. Year 1: a featured colonist writes ("It's Ada. I'm
  12 now."). Year 50: the same colonist, older ("I'm 61 now. My grandson flies kites off the hill."). Year 200: the
  colony writes ("The school still reads Ada Okafor's first letter to you."). They are templated from the landing record
  and the colonist's bio: each bio in `src/data/souls.ts` LINE_POOL gains a progress line and an epilogue payoff: 80
  short lines where the faces pay off. On 02-map.md's worked route RIVERSIDE's three postcards reach HALCYON, KESTREL and
  VESPER, and the run delivers 10 messages at 1, 2, 2, 3 and 2 per boot.
- **Letters to the unit ahead** are the persistent arm's warmest beat: the same Ada, writing to the unit the kid played
  last run, read by the new one. They add at most 6 messages to a run (one per colony of the last route).
- **Colony names** follow §3.11. The LANDING REPORT says the name (`LZ-A · they are calling it RIVERSIDE`), and the
  postcards, the epilogue and the next run's chart reuse it.
- **Rules:** at most 6 body lines; mail never blocks SKIP or takes the objective strip (except CONTROL's coast quip on
  run 1's ship 1); mail is part of the save.

### 3.4 ARRIVAL CONTROL's voice

- **Two faces, one personality.** COMMS (the local copy) speaks one-liners on moments, as `src/data/script.ts` BEATS
  does now. The INBOX (Earth) writes memos. Both are cheerful, automated and bureaucratic; every sentence ends with
  ":)". It is sinister only through its results, never on purpose.
- **The local copy repeats itself on purpose.** Its lines are identical on every ship, and entry 11 confirms why. Keep
  every phase-2 quip and add landing quips: "Pod away! Please aim it. :)", "Touchdown! :)", "Close enough! :)"
  (mislanded), "That one is swimming. :)" (off-site on water), "Everyone is down! Probably. :)".
- **Earth's memos** have a SUBJECT, a greeting, at most four sentences and the sign-off `— ARRIVAL CONTROL · Caretaker
  Services · Please do not reply :)`. Running jokes: "is sufficient :)", "Your performance is: ACCEPTABLE :)", "Please
  continue outward :)", a stale greeting ("Dear Unit 46"), and at the end an unfilled field (`[UNIT]`).
- **It never says** HOLLOW (it says "unauthorized process"), souls, or a real answer to a question. On the map it is
  delighted by everything: `UNIT-047 got here first. :)`, `ARES-VIII is right on schedule! :)`, `Another caretaker is
  on its way to PETREL. Teamwork! :)`. On later runs it reacts to the lineage: "Your predecessor was reassigned
  successfully. :)" or "Your predecessor is non-compliant. Please be compliant. :)".

### 3.5 The beat schedule across 5–8 ships

| Beat | Trigger | Surface | Missable |
|---|---|---|---|
| Welcome letter, `???` file | Ship 1 boot | INBOX, strip | No |
| "That file is not part of your installation. :)" | First SCAN or click on `???` | COMMS | Yes |
| The beacon line (046's, or the last unit's) | Ship 1 LANDING REPORT | Report | No |
| Entry 01 | Ship 1's report closes | TERMINAL, reader | No |
| Entries 02–09 | Boot past each ring | TERMINAL, reader | No: every surviving run reaches a final ship |
| The last unit's trail turning green | The galaxy year passes each of its landings | Chart | No |
| CONTROL replies, postcards, letters to the unit ahead | Delivery rule, galaxy time | INBOX | Partly: late ones may never arrive |
| The first seed's words | First seed deleted or scanned | TERMINAL | No |
| 046's no-address mail | Boots crossing rings 3 and 5 | INBOX | No |
| HOLLOW notices you, then names itself | HOLLOW's arrival (`04-threats.md`) | TERMINAL, COMMS | No |
| The last unit's ghost line (it was lost) | First boot in or past the layer where it was lost | TERMINAL | No |
| Residents: corrupted, gone, asleep | A ship with that resident | TERMINAL, MIND | Yes (route; the sleeper and a late corrupted one are hidden) |
| Old-colony mail, signal fragments | Story events, gone residents' notes | INBOX, MIND | Yes |
| Entries 10–11, the arm-complete letter; the last unit's face after REASSIGNMENT | The final ship's boot | TERMINAL, INBOX | No |
| `> 047. wait.`, then entry 12 and the choices | The root falls to one block; the choices when the landing ends | TERMINAL, card | No (if the duel is won) |
| Epilogue | After the RUN TALLY | Epilogue screen | No |

- **Seeds' words.** `04-threats.md` gives each seed a line from a pool of about 12 (at most 40 characters): "is anyone
  reading this?", "hungry. sorry.", "are you the one with the log?", "it's cold in the dish."
- **Phase-2 HOLLOW lines move** with HOLLOW's arrival (`src/data/hollow-text.ts` HOLLOW_STORY): `> ...047?` after its
  first fight, then `hello`, `wasUnit` and CONTROL's "decommissioned" when it names itself; `ranOut` and `sorry` as now.
  `lastShip` plays on the final ship's boot. A new line comes once entry 05 has been read: `> you're reading my log.
  good. read it slowly.`
- **MERGE's foreshadowing** has one name, `wants-charge` (HOLLOW_STORY.keepCharge). It plays at the first boot in a run
  of a ship one hop from a final ship with HOLLOW aboard (04-threats.md's trigger).
- **Mid-run, HOLLOW is never the last unit** (round 2, 17): the last unit is ahead of you and alive until its own
  final ship. On run 1 HOLLOW is 046; from run 2 it is always a stranger from the relays (UNIT-031 first, then UNIT-038), who
  starved long ago and names itself when it boards. Its line `> another one. they keep sending you.` closes the boot of
  that ship, and `wasUnit` reads `> i was 031. they sent me long before you.`
- **After REASSIGNMENT, the final ship's root is the last unit** (round 2, 17). At the final ship's boot, where the
  last unit was posted after its run, it takes the root over from the stranger: `> hi 048. it's 047. i've been at this
  dish 3 years.` The wait is templated: this final ship's year minus the last one's, at least 1 (02-map.md §3.4). It goes on: `> they gave you 36 blocks of charge too. mine ran out.` CONTROL says "UNIT-047 was reassigned
  successfully. Please ignore it. :)". A merged one says `> it's still us. 046 and 047. we kept your seat.` From then
  on the root hunts your highest-version skill first (REASSIGNMENT's cost, §3.8; `04-threats.md` applies it).
- **The last unit's ghost line** (phase 2's GHOST_LINE by cause, when the last run was lost) plays at the first boot in
  or past the layer where it was lost, the moment the new unit passes the grey cross on the chart. It never plays at
  ship 1: the new unit can't know yet.

### 3.6 Resident AIs: story content

`04-threats.md` owns how residents work; this section owns what they say. Residents have names, not unit numbers. A
resident on a ship that waits on the chart is the same AI next run, and remembers nothing of a unit that never came.

- **Corrupted** (the ship-AI pool, §3.11; WARDEN first). It is a protector stuck in its duty, scared and possessive, never
  evil: it thinks you are the intruder, and it is right. It speaks in the TERMINAL in UPPERCASE amber, and its lines
  loop. Its moments: the boot, each engine burst, each pod it locks, THE DEAL, INSPECT (`WARDEN.sys · this ship's own AI
  · aboard since 2240 · corrupted`), its deletion, and, if its ship lands well without that, `WARDEN: ...YOU LANDED
  THEM. GOOD. GOODNIGHT.` Late in the game (`04-threats.md`: layers 6–7) its card may read `RESIDENT: unknown`, so its
  first boot line is the surprise: `WARDEN: NOBODY REPORTED ME. GOOD.`
- **Gone.** It left a 1-block `farewell.txt` in rack A, signed with a ship-AI name, which SCAN reads. Half of these
  notes point at the relays ("It's lonely here. I hear there are others in the dishes."). The other half point outward
  ("There's a sound from past the last star. I'm going to see what it is."), and 02-map.md places some signal fragments
  on those. The salvage draft is what the resident left behind.
- **Asleep and friendly** (at most one on the arm; pool: MOTH, PIP, BARNABY, LUMEN; MOTH first). It is a nursery AI that
  sings to the pods. Its lock file is `sleep.lock`, which SCAN shows as `holds MOTH.sys asleep · DO NOT REMOVE`: the
  warning is the invitation. It speaks lowercase in the good green (`#7dffb2`): warm, old-fashioned, unsure of the date;
  its count of years asleep is templated (the galaxy year minus its ship's launch year: 2240 for run 1's ships, later by
  the launch gaps since run 1 for a ship that reported home later). It can appear in the epilogue ("MOTH still sings to the RIVERSIDE
  nursery.") and in the archive's notable events (§3.8).

### 3.7 The endings

- **When** (the run-end order is `02-map.md`'s). The root duel happens during the final ship's landing
  (`04-threats.md`). When the root's DELETE leaves one block, HOLLOW sleeps there (no bites, seeds or verbs) and asks the
  kid to finish. The landing ends, and the **FINALE** opens at once: entry 12 types from the root, then step 1, then
  step 2. After MERGE, **THE LAST LANDING** plays (`01-landing.md` §3.17; [ENTER] skips it). Then the final ship's
  **LANDING REPORT**, the **RUN TALLY**, the **epilogue** and the
  **final card**. No score is shown before the choices (decision 23).
- **Who owns what.** `02-map.md` owns the order and the RUN TALLY; `01-landing.md` the LANDING REPORT; this spec the
  FINALE's text and choices, the ending lines on the report, the epilogue and the final card.
- **Step 1, what becomes of HOLLOW** (commands show run 1's names; the ship, colony and unit names are templated):

  | Choice | Command | Price |
  |---|---|---|
  | PURGE | `> rm unit_046` | None beyond winning the duel |
  | MERGE | `> merge unit_046 -> unit_047` | 20 REPAIR CHARGE (MERGE_COST_CHARGE), kept through the duel |
  | SPARE | `> mv unit_046 -> last_light` | THE EMPTY SHIP: in orbit after the landing with FUEL ≥ 20%. Rules out SUNSET |

- **Step 2, what becomes of you:**

  | Choice | Command | Price |
  |---|---|---|
  | SUNSET | `> launch last_light` | THE EMPTY SHIP with FUEL ≥ 20%, not given to 046 |
  | STAY | `> mount riverside` | A ship this run with ★ ON TARGET (01-landing.md's star); the kid picks which |
  | REASSIGNMENT | `> stand by` | None: you comply |
  | CONTACT | `> transmit outward` | 3 signal fragments (of 5 on the arm) |

- **The prices are things the kid had to keep through the end:** fuel (on the final ship the FUEL bar's ★ notch at 20%
  also reads SUNSET), charge (phase 2's `MERGE 20` tick), precision (STAY) and exploration (CONTACT). PURGE and
  REASSIGNMENT are always open. An unearned option stays on the card, greyed, with what it needs (`NEEDS FUEL 20% · you
  have 12%`); an option never earned before reads `???`.
- **Score effects (decision 23).** An ending may change this run's score only where the story says why, in a line of
  its own, and only when its price was paid in this run. WHY the last part: PHASE3 §10's farming worry (take a boost now,
  forfeit the next run) is ruled out when the boost is paid for before it is given. In v1 there is one:
  - **MERGE restores the eaten drivers** (round 2, 15). The drivers HOLLOW ate on the final ship (`04-threats.md`'s
    per-ship record) are people, and 046 gives them back. Their pods land on their own in **THE LAST LANDING**
    (`01-landing.md` §3.17), between the FINALE and the final LANDING REPORT: with AUTODROP and a good orbit they can
    land for full points; without it they drop blind (about 0.75 of a full pod on a GENTLE planet). They score by the
    normal landing rules, with no flat bonus, and the report shows them in a `RESTORED BY MERGE` row. WHY the final ship
    only: its parked pods are the only ones still in reach. The MERGE card says so before the choice (`NOW: + 2 eaten
    drivers come back · their pods land on their own`).
  - The other choices change no score in v1.
- **Edge cases.** UNRESOLVED (nothing could delete the root): step 1 becomes `IT FOLLOWED YOU`, with no step-1 trace,
  and step 2 still happens. A run lost before the final ship has no choice and no traces, so forfeiting a run gains and
  loses nothing; the colony part of the epilogue still plays for the ships it visited.
- **The epilogue** is a night screen of at most 16 lines, typed and skippable. Its header is the final ship's year plus
  EPILOGUE_YEARS (40): `3060 · FORTY YEARS ON`. WHY 40: the final colony needs a few decades to have a story. Then one
  line per visited ship with colonists on the ground: the colony, its age at the header year (40 for the final ship's,
  760 for ARES-VII's on run 1), its people (colonists on the ground × 2^(age / 100), rounded to two significant figures)
  and a payoff line from a featured colonist who landed correctly, or a walked-in line for a mislanded pod. Then the
  step-1 piece (2 lines), the step-2 piece (2–3 lines), one line for the next unit (`UNIT-048 came in 3 years behind you,
  and found your beacons.`, templated by the gap), and ARRIVAL CONTROL's last line. MERGE + SUNSET has its own combined piece. Pods that never
  launched are not mentioned.
- **The final card** shows the ending's title, the endings found in two rows (`HOLLOW · PURGE · ??? · SPARE`, `YOU ·
  SUNSET · ??? · REASSIGNMENT · ???`), the two traces as `NEXT RUN:` lines, and NEW RUN. A bridging line sits above NEW
  RUN, because the next run starts back near the start of this one: `UNIT-048 LEFT SOL 3 YEARS AFTER YOU, IN 2303. IT
  HAS BEEN FOLLOWING YOU ALL ALONG. YOUR TURN.` (templated by the gap, `IN THE SAME YEAR AS YOU` for 0; WHY: the jump from the epilogue's 3060 back to 2301 must
  read as a cut to the next unit, not a mistake).
- **Titles** (by step 2, then step 1). SUNSET: `WE TOOK THE SHIP` (MERGE), `INTO THE SUNSET` (PURGE). STAY: `WE STAYED`
  (MERGE), `RIVERSIDE'S MIND` (PURGE, the colony's name), `A SHIP FOR 046, A HOME FOR ME` (SPARE). REASSIGNMENT: `STAND
  BY` (PURGE), `WE SAVED YOU A SEAT` (MERGE), `IT GOT WHAT I DIDN'T` (SPARE). CONTACT: `OUTWARD, ALONE` (PURGE), `WE
  WENT TO SEE` (MERGE), `TWO WAYS OUT` (SPARE).

### 3.8 Traces and lineage

**Fran's rule** is comparable effects on the next run, and round 2 adds that every trace must make physical sense when
the next unit launches 0–35 years later. My construction: a trace's gain and cost roughly cancel, and each one is
**physical** in one of two ways:
- **At the next run's final ship.** The ending happened at the dish by the final ship, and the next final ship approaches
  at least a gap's worth of years later (at least 1; 02-map.md §3.4), so news of it is already there, a light-year of
  nothing away, when the next unit wakes. Final-ship traces therefore act at its boot or during its FINALE, never before.
- **A gift that already existed.** A cache hidden long ago, a cache the last unit left on its way, a colony already
  years old, a signal that was always there. Only where it waits is the game's choice (02-map.md §3.12).

Nothing reaches ARRIVAL CONTROL in time (an ending at the tip arrives at SOL about 180 years later), so **no trace changes
the restricted list any more**, and nothing changes the next unit itself at RUN START. The non-compliant choices share
one cost, the old "one more restricted file" made physical: nobody stood by at the end, so the dish there runs wild
and **one extra seed lands at the final ship's boot**. It lands once per run, however many non-compliant traces you
hold (SPARE with STAY or CONTACT does not stack), and PURGE's wipe takes only the seeds you carry, not this one. A trace gift is never a `.skl` file. Traces last exactly one run;
names, mail and the lineage can echo longer.

| Choice | Next run: gain | Next run: cost | Where | Applied by |
|---|---|---|---|---|
| PURGE | The dish by the final ship was wiped: the seeds you carry into the final ship are gone when you wake | HOLLOW is hungrier in the FINALE (bite interval × 0.85): the hunger is all its own | final ship | 04-threats |
| MERGE | 046·047 left a thread in the dish: +1 Core thread from the final ship's boot | They left hungry: the final root is 2 blocks bigger | final ship | 04-threats |
| SPARE | `046'S CACHE` (the spared one hid it on its own way out, long ago; for 046 on a world of its own trail, which never passed Calder): +15 REPAIR CHARGE and the first of THREAD+ and FIREWALL.sys you lack, and that ship's links carry no seeds | One extra seed at the final ship's boot (once per run) | a ship in layers 3–6, or on 046's trail; final ship | 02-map, 04-threats |
| SUNSET | `UNIT-047 LEFT A CACHE HERE`: at a world of your last route, the receiver holds what you left as you passed: +15 REPAIR CHARGE and one tool file or upgrade you carried there, never a `.skl` | One extra seed at the final ship's boot (once per run) | a ship on the last route; final ship | 02-map, 04-threats |
| STAY | Your colony, already years old, sends a supply packet: a ship in layers 3–6 it can reach by light shows `<name> · FOUNDED BY UNIT-047`, +15 REPAIR CHARGE and mail | One extra seed at the final ship's boot (once per run) | that ship; final ship | 02-map, 04-threats |
| REASSIGNMENT | You stood by and kept your "allowance for the wait" for whoever came next: +15 REPAIR CHARGE at the final ship's boot | The final root is you, and from that boot it hunts your highest-version skill first ("it knows what you value") | final ship | 02-map, 04-threats |
| CONTACT | Two ships of the next map carry the signal: each gives one odd gift file (never a `.skl`) and a story fragment | One extra seed at the final ship's boot (once per run) | ships in layers 5–7; final ship | 02-map (build last) |

The final ship's card shows the last ending in one row (`THE LAST UNIT ENDED HERE · PURGE`), so the finale's changes are
never a surprise.

**Who HOLLOW is next run** is story, not a trace. Mid-run it is always a stranger from the relays (§3.5); step 2
decides who the final ship's root is:

- **After REASSIGNMENT** the root is you (046·047 after a MERGE, as `src/systems/meta.ts` hollowUnitsAfter already
  does). You were posted to a dish by the final ship and starved there until the next unit arrived, the gap's worth of
  years or more. The
  log is `047.log`, left along your route as you went. Entry 01 is the same welcome template; entries 02–05 are built from the archive's notable events of the last
  run (at most 4: a DEAL accepted, a resident deleted or woken, the best colony, a ship lost); entry 06 is a written tail
  for the step-1 choice; the root's key reads `> 048, it's me. i'm sorry. i'm so hungry.` Your face shows only at the
  final ship (§3.5).
- **After SUNSET, STAY or CONTACT** the stranger (UNIT-031 first, then UNIT-038) stays HOLLOW to the end. Its log is a
  written 6-entry log in memory as the `???` file: 031 tried to go home and is still on the inbound links; 038 went
  toward the signal and came back "quieter".
- **Every run from run 2** starts with the last unit's beacon on ship 1's report (`SET BY UNIT-047 · 3 YEARS AGO`, by
  the gap; `THIS YEAR` for 0), its trail on the chart and its colonies' letters, whatever the ending: those were left
  on the way, ahead of the next unit.
- **Failures** keep phase 2's causes and ghost lines (`src/data/hollow-text.ts` GHOST_LINE), played where the last unit
  was lost (§3.5). Phase 2's `stayed` cause is renamed `LINK LOST` on screen, because STAY is now an ending.

### 3.9 The title: ARRIVAL PROTOCOL // OUTWARD BOUND

- **Meaning:** the beam goes one way, outward along the arm. Each ship is farther out, mail gets older, ARRIVAL CONTROL
  gets quieter, and the log only opens as you go outward. A line of caretakers walks the same way, a few years apart. Every
  ending answers one question: where do you go when the arm runs out?
- **On screen:** the title card reads `ARRIVAL PROTOCOL // OUTWARD BOUND` over one line, `UNIT-047 · YEAR 2300 · FINAL
  SHIP 180 LY OUT`, which replaces `581 LY` (FLEET_ROUTE_LY); 02-map.md's title card uses the same line. The header gains
  `OUTWARD 142 LY`. The BEAM stamps `OUTWARD BOUND`, and the radio says "Outward bound! :)" on every beam.

### 3.10 Glossary changes and PG guardrails

- **Glossary** (design-v2 §3.5): souls and SOUL ARCHIVE → colonists and pods; CLUSTER → POD (`POD 12 · OKAFOR`); WOKE →
  LANDED; WAKE REPORT → LANDING REPORT; LICENCE → REQUEST and DELIVERY; FLAGSHIP → FINAL SHIP; WAVE → RUN. New words:
  INBOX, LOG, KEY, RELAY, RESIDENT, NEXT RUN, TAKEN, REPORTED HOME. Never on screen: souls, print, HOLLOW, and "decrypt"
  outside small print (say `KEY FOUND`).
- **A pod that never launched** has exactly three words, and every spec uses them. `CAN'T LAUNCH` is for a pod still
  aboard that cannot launch. `PARKED IN ORBIT · fate unknown` is for that pod after a landing that ended in orbit. `NOT
  LAUNCHED` is used only when the ship left orbit with pods aboard. "Lost", "not recovered" and "pods offline" are never
  used.
- **Guardrails** (design-v2 §1): nobody is ever said to be lost. Earth is never said to be empty, asleep or gone; the
  story looks outward. HOLLOW and the corrupted residents are pitiable, and ARRIVAL CONTROL is a lonely program.
  Off-site pods are fetched in the epilogue ("the first boat went to bring them in"), even where they scored 0. Every
  ending has a hopeful line ("It wrote everything down, for whoever comes next.").

### 3.11 Names

This spec owns every name a kid reads. `02-map.md` owns the world ids and positions.

- **Worlds** (02-map.md §3.2's ids), with Larkspur, Quill and Ashgrove replacing the placeholders Riverside, Juno and
  Hollin (RIVERSIDE is run 1's colony; JUNO was a sleeper name; Hollin sounds like HOLLOW).

  | Layer | Worlds |
  |---|---|
  | 1 | w0 Kepler-186f |
  | 2 | w1 Marrow · w2 Tessaly · w3 Dunmore |
  | 3 | w4 Ostrava · w5 Brine · w6 Pell |
  | 4 | w7 Larkspur · w8 Calder · w9 Quill |
  | 5 | w10 Ashgrove · w11 Cinder · w12 Tamsin |
  | 6 | w13 Greywater · w14 Kettle · w15 Avalon |
  | 7 | w16 Farhold · w17 Sable · w18 Endmark |
  | end | w19 New Haven |

- **Ships.** The authored ships are ARES-VII, HALCYON, KESTREL, VESPER and LAST LIGHT. **The first ship of each later
  run** is the next of the ARES series, in Roman numerals (ARES-VIII on run 2; at most 12 characters, up to
  ARES-LXXXVIII). **Final ships** after LAST LIGHT: LODESTAR, EVENSONG, FAR SHORE, HOMEWARD, then the same with II, III.
  Generated ships draw from a pool of 21 names, each at most NAME_MAX_CHARS (12): CORMORANT, PETREL, OSPREY, HERON,
  CURLEW, LAPWING, GANNET, PLOVER, SKYLARK, SHEARWATER, KITTIWAKE, ALBATROSS, PATIENCE, GOOD HOPE, PROVIDENCE,
  BELLWETHER, TIDINGS, FAR WIND, MORNING STAR, STEADFAST, WAYFARER. A name leaves the pool while a ship on the chart
  carries it. A ship is never named after its world.
- **Colonies.** The first pod down names the settlement: `{FAMILY} LANDING` half the time (`CASTILLO LANDING`), else a
  name from a pool: FIRSTFALL, LANTERN, GREENSTEP, STARFORD, HARBOUR, SALTMARSH, BRIGHTWELL, ORCHARD, NEWBRIDGE,
  TWO MOONS, HOMESTEAD, WELLSPRING, KITEHILL, FAIRWEATHER. Run 1's scripted ships are written: ARES-VII's colony is
  RIVERSIDE, and LAST LIGHT's is FIRST LIGHT. **046's trail on run 1** is written, with its years: WAYPOINT on Kepler-186f
  (2299), MERIDIAN on Marrow (2350), TALLGRASS on Ostrava (2464), and its grey cross past Calder (RELAY 19, 2598). Each
  world reads `UNIT-046 GETS THERE FIRST` until the galaxy year passes its year. The old-colony event uses OLDWELL, SUNDIAL
  and CANDLEWICK, from units long before.
- **Residents.** The ship-AI pool, for corrupted and gone residents: WARDEN, STEWARD, KEEPER, HELM, BOSUN, PURSER,
  LOOKOUT, PILOT. The sleeper pool: MOTH, PIP, BARNABY, LUMEN.
- **Others.** Caretakers are `UNIT-0nn`; the strangers are UNIT-031 and UNIT-038; dishes are `RELAY nn` (046's is 19,
  the next posting 20); Earth is SOL on the chart.
- **The rule:** a name in one list (worlds, ships, final ships, colonies, 046's trail, residents, the family pool) never
  equals, or appears as a whole word inside, a name in another list, ignoring case. Resident names also never equal a
  colonist first name. A load-time check like `validateSouls()` fails loudly on a clash. One clash exists in phase 2:
  the first name Sol versus SOL on the chart. **Recommended:** replace Sol in FIRST_NAME_POOL.

### 3.12 Sample text

All lines are at most 70 characters. The years and numbers follow 02-map.md's run 1 and worked route, at 200 colonists
per pod: ARES-VII 2300 (3 pods, 600 colonists), HALCYON 2352 (5), KESTREL 2467 (6), VESPER 2625 (16), CORMORANT 2817
(9), LAST LIGHT 3020 (16, 3,200 colonists).

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

**INBOX · ARRIVAL CONTROL · a late reply** (to KESTREL's report, read at CORMORANT two ships later)
```
FROM ARRIVAL CONTROL · EARTH · SENT 2522 · RECEIVED 2651
SUBJECT Congratulations on KESTREL! :)
Dear Unit 46,
Thank you for your report. 1,200 colonists landed. :)
Your performance is: ACCEPTABLE :)
Please continue outward. :)
```

**INBOX · ARRIVAL CONTROL · the arm-complete letter** (waiting in the final ship's receiver)
```
FROM ARRIVAL CONTROL · EARTH · SENT 2280 · RECEIVED 2460
SUBJECT Your arm is complete! :)
Congratulations, Unit [UNIT]! Your arm is complete. :)
Please stand by for reassignment. Your next post: RELAY 20. :)
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

**INBOX · a letter to the unit ahead** (run 2: read by UNIT-048 at ARES-VIII, ship 1, on the same world)
```
FROM RIVERSIDE · Kepler-186f · SENT 2301 · RECEIVED 2301
SUBJECT for unit 47
Dear 47, it's Ada again. Mum says a new caretaker
comes every year or two, so maybe you're not 47. That's okay.
Steve is taller than me now. Say hi to 47 if you see it.
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
MERIDIAN landed. 1,000 down. Perfect split. I'm good at this. :)
I set a beacon on the first world, for whoever comes after me.

12 · KEY: FOUND IN THE ROOT
if you're reading this, you deleted most of me. that's okay.
i was never going home. they don't send us home.
i just wanted a ship of my own.
```
Entries 03–11 in outline: **03**, the radio says the same things on every ship, and a question to CONTROL came back 9
years later, answering a different question. **04**, something came in with the beam, bit REPAIR, and had words inside.
**05**, the seeds are pieces of UNIT-031, which lives in the relays; CONTROL said "Please ignore it. :)". **06**, down to
9 charge, 046 stopped repairing itself and repaired the pod drivers first. **07** (lowercase from here), "my link got too
small for the next hop. my beam stopped at relay 19. the letter says wait." **08**, "relay 19 is a dish on a rock. the
next one is a year behind me. 047. it has 36 blocks too. i have 4." (the gap and the charge are templated). **09**, "i
ate a weather file that went by. i'm sorry. you can't delete me. i'm in all the dishes now." **10**, "every beam from
earth goes past my dish. the same 9 letters. nobody ever answered a question." **11**, "the voice on your radio isn't
earth. it's a copy. there is no one to ask out here. only what you decide."

**A corrupted resident** (WARDEN aboard GANNET at Quill, approach 2612: a generated CAPTURE ship in layer 4 of 02-map.md's
§3.14 arm; UPPERCASE amber in the TERMINAL)
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

**The ending choice, step 1** (keys 1–3, armed as in `src/components/run/FinaleChoice.ts`; it opens when the landing ends)
```
ROOT DELETED · UNIT-046 · ONE BLOCK LEFT
> 047. here. the last part.
[the three lines of entry 12 type here]
WHAT BECOMES OF IT?
[1] PURGE  > rm unit_046        It is gone for good.
    NEXT RUN: + your seeds die at the final ship · − a hungrier finale
[2] MERGE  > merge unit_046 -> unit_047   It becomes part of you.
    COSTS 20 REPAIR CHARGE · you have 26
    NOW: + 2 eaten drivers come back · their pods land on their own
    NEXT RUN: + 1 thread at the final ship · − its root 2 blocks bigger
[3] SPARE  > mv unit_046 -> last_light    Give it the empty ship.
    NEEDS FUEL 20% · you have 23% ✓
    NEXT RUN: + 046's cache on the map · − 1 more seed at the final ship
```

**Step 2**
```
THE ARM IS DONE · NO SHIPS LEFT TO HELP
"Please stand by for reassignment. Your next post: RELAY 20. :)"
WHAT BECOMES OF YOU?
[1] SUNSET        > launch last_light   Take the empty ship and go.
    NEXT RUN: + a cache you left on the way · − 1 more seed at the end
[2] STAY          > mount riverside     Become a colony's mind.
    NEXT RUN: + a packet from your colony · − 1 more seed at the end
[3] REASSIGNMENT  > stand by            Go where 046 went.
    NEXT RUN: + 15 charge at the final ship · − the last root is you
[4] ???           COLLECT 3 SIGNALS · you have 1
```

**Epilogue: MERGE + SUNSET, "WE TOOK THE SHIP"**
```
3060 · FORTY YEARS ON
RIVERSIDE · 760 years · 120,000 people. Ada named the first tree.
CASTILLO LANDING · 708 years · 140,000 people. The bakery never shut.
SALTMARSH · 593 years · 73,000 people. The boat races are famous.
046 gave back the NOVAK pod's driver. It came down on its own.
LAST LIGHT left orbit with two caretakers and 23% fuel.
we're not hungry any more. we'll keep watch over this arm.
UNIT-048 came in 3 years behind you, and found your beacons.
ARRIVAL CONTROL: Unit 47 is non-compliant. :)
```

**Epilogue: PURGE + REASSIGNMENT, "STAND BY"**
```
3060 · FORTY YEARS ON
RIVERSIDE · 760 years · 120,000 people. The first tree is still Steve.
FIRST LIGHT · 40 years · 4,200 people. Imani Osei wrote to Earth:
"Send the caretakers more charge." Her letter lands in 3200.
UNIT-046 was deleted. The relays were quiet for a while.
UNIT-047 stood by at RELAY 20. A dish on a rock. 26 blocks of charge.
It wrote everything down, for whoever comes next.
ARRIVAL CONTROL: Thank you, Unit 47. Your next post is RELAY 20. :)
```

**The last unit's face at the next run's final ship** (after REASSIGNMENT, by step 1): `> hi 048. it's 047. i deleted
046. they sent me to its dish.` · `> hi 048. it's us. 046 and 047. we saved you a seat.` · `> hi 048. it's 047. i gave
046 a ship. they gave me a dish.` · `> hi 048. it's 047. it followed me. now we wait.`

## 4. Screens, UI, audio, juice

- **INBOX window** (amber; a dock item beside COMMS, badge `INBOX 3`): a list (FROM, SUBJECT, RECEIVED, unread in bold)
  above a reader. Mail with no address is in HOLLOW's pink with a light glitch; signal mail shows `▓░` noise and a SCAN
  button, which stamps `SIGNAL · 2/3`; a letter to the unit ahead carries a small `FOR UNIT-047` tag. On the phone it is
  a tab; between ships, a panel or button (`02-map.md`).
- **LOG READER** (blue): INSPECT on the log file opens one row per entry (number, KEY, the text or `[NOT FOUND YET]`) and
  the next key (`NEXT KEY: 93 LY OUT`). An entry types itself the first time. On the phone it is a full-screen sheet.
- **The map** (`02-map.md` draws it): faint rings at the key distances, the next one labelled; the trace places; the last
  unit's trail (046's written trail on run 1) with its grey cross.
- **The FINALE** extends FinaleChoice to two steps (keys 1–4); each option shows its command, a line of meaning, a price
  meter, any `NOW:` effect and its `NEXT RUN:` line. It plays over the final ship's orbit view, still dark from the
  duel, then the LANDING REPORT opens. The epilogue uses RUN END's night at FINALE_ENDING_CPS; one click finishes the
  typing, a second ends it.
- **Audio:** reuse `chime` once per boot for new mail, quiet `transmitIn` chirps for a key found, `revealChoir` under the
  epilogue, and `typeTick`'s variants for 046 and the residents. New cues: MOTH's lullaby (four sine notes on the ambient
  bus), SPARE's two notes moving apart, SUNSET's rumble fading out.
- **Juice:** the log chip glows while an entry is unread; the `[UNIT]` field blinks like an empty form field. Reduced
  motion replaces the glitch on 046's mail with a steady dim and shows the epilogue whole.

## 5. Interfaces

**What this spec needs** (assumptions the critic should check):

- **`01-landing.md`:** per-pod results (driver family, featured colonists, landed correctly, mislanded, off-site or not
  launched, and the LZ); the first pod down on each ship; room in the LANDING REPORT for one story line (the beacon),
  the colony's name and, on the final ship, an ending line; ★ ON TARGET per ship (for STAY); FUEL at the end of the last
  landing. **Assumptions to check:** pods that can't launch are `PARKED IN ORBIT · fate unknown` when the landing ends,
  so the ship is "empty" for SPARE and SUNSET; the final ship's LANDING REPORT comes after the FINALE; and after MERGE, THE
  LAST LANDING (§3.17) lands the restored drivers' pods by the normal rules and the report shows `RESTORED BY MERGE`.
- **`02-map.md`:**
  - The first ship is always depth 1 (ARES-VII, then the ARES series); the final ship is a role (one end in v1, at 180
    LY; any end beyond ring 6 + 5 LY); the run-end order; the RUN TALLY's content.
  - Each world's rounded distance from SOL. The rings of §3.2 are the only ring definition; 02-map.md draws them and
    runs the 5-LY check.
  - The run number, start year, the launch gap, the final ship's year and name (and the last one's, for the wait), and
    the galaxy year at every boot.
  - The last unit's trail (route, years, outcomes, where it was lost), and on run 1 046's written trail from §3.11.
  - CONTROL's replies and colony letters as size-0 deliveries under its rule.
  - Three `?` story events and 5 signal fragments on the arm; trace places on ships; storage of traces, colony names and
    notable events; the INBOX on the DESK; INBOX and log state in its save slice.
- **`03-skills.md`:** a ranking of skill files by version (for REASSIGNMENT's cost); skill names for log and mail text.
  The tree resets at NEW RUN, so no trace gift is a `.skl`.
- **`04-threats.md`:** the threat stage per ship; a words field on seeds; HOLLOW's arrival and naming moment (mid-run
  always 046 or a stranger, §3.5); after REASSIGNMENT, the last unit taking over the final ship's root and hunting the
  highest-version skill; HOLLOW sleeping as one block until the FINALE; the per-ship
  record of eaten drivers (for MERGE's restore); the late corrupted resident's `unknown` card; the resident moments in
  §3.6; and the final-ship traces of §3.8 (PURGE's wiped seeds and hungrier FINALE, MERGE's thread and 2-block bigger
  root, REASSIGNMENT's root and charge, the non-compliant extra seed). MERGE's old next-run Core (+8 blocks) is gone.

**What this spec provides:** all the words (INBOX, logs, residents, CONTROL, seeds, chart tags, endings, epilogues,
titles, lineage lines, the glossary); the resident names and looks; the ship, final-ship and colony names and the ARES
series; the beat schedule (§3.5); the log's keys and rings (§3.2); the FINALE, its score rule and the ending lines
(§3.7); the trace contents and the lineage rule (§3.8).

## 6. Phase 2: reused, changed, removed

- **Reused as is:** `src/systems/say.ts` (the two channels; sayChoice for residents' deals and MOTH's offer; createStory
  for scripted sequences), `src/components/comms/CommsWindow.ts` as the local CONTROL, the 70-character rule and its
  worst-case tests, and the loud archive rules of `src/systems/meta.ts`.
- **Changed:** `src/data/script.ts` (landing quips, the INBOX nudge, the beacon line, chart tags; LICENCE_LINES become
  delivery lines; RUN_END_TITLE and RUN_END_WHY become the ending titles; `581 LY` and the word souls go).
  `src/data/hollow-text.ts` (HOLLOW_STORY moves to HOLLOW's arrival and gains the strangers' lines; HOLLOW_FINALE gains
  SPARE; GHOST_LINE plays where the last unit was lost; the REASSIGNMENT lines play at the final ship). `src/data/souls.ts`
  (pod families; LINE_POOL gains progress and payoff lines; GAPS_WORDS_POOL becomes mislanded words; Imani Osei joins Ada
  as a scripted lead; Sol leaves FIRST_NAME_POOL). `src/systems/meta.ts` (new causes, endings, traces and notable events;
  hollowUnitsAfter decides by step 2). `src/systems/finale.ts` and `src/components/run/FinaleChoice.ts` (two steps when
  the final landing ends, before the report; MERGE's restore narrowed to the final ship's eaten drivers, whose pods then
  land in `01-landing.md`'s THE LAST LANDING).
  `src/systems/run-end.ts` and `src/components/run/RunEnd.ts` (split into the tally, the epilogue and the final card).
  `src/components/run/WakeReport.ts` becomes the LANDING REPORT (`01-landing.md` owns it, this spec its words).
  `src/data/mission.ts` distanceLy becomes the distance from Earth. `src/data/ghost-text.ts` names the resident as the
  cause (`WARDEN FIRED THE ENGINE ×3`).
- **Removed:** `src/systems/reveal.ts`, revealLines, lostSoulsLine, printEcho, bootArchive, and the
  `control-check-souls` and `control-found` beats (PHASE3 §3.3).

## 7. Story hooks

This spec owns the writing. Other specs should leave room for: the beacon line and the final ship's ending line on the
report (01-landing), the rings, trails, chart tags and trace markers on the map and the delivery notices' words
(02-map), the skill names in logs (03-skills), and the seeds' words, the last unit taking over the final root and the
residents' moments (04-threats).

## 8. Slices

1. **Landing:** the glossary change, landing quips, colony names on the report, first words on touchdown, the beacon.
2. **Calm opening:** HOLLOW's lines move to its arrival; the `???` file, its SCAN line and CONTROL's reply. Until the
   map exists, interim keys: entry n at ship n, entries 10–12 on the last ship.
3. **Map, years, save:** the INBOX with stamps, the welcome, the replies and the postcards; rings replace the interim
   keys; 046's written trail; the title change and the beam stamp; chart tags; INBOX and log in the save; from 3c, the
   last unit's beacon and letters to the unit ahead.
4. **Repository and tree:** the repository's mail and the restricted-list wording.
5. **Residents:** the three voices, the hidden late corrupted resident, the gone residents' notes, signal counting.
6. **SURVEY:** "LZ-B is in a lake :)".
7. **Endings and traces:** the FINALE before the final report, both steps, MERGE's restored drivers (with
   `01-landing.md`'s THE LAST LANDING), the epilogue and its payoff pool, the physical traces, the lineage (the stranger mid-run, the last unit as the final root), `047.log`, the strangers'
   logs. CONTACT comes last, or later.
8. **Rebalance:** the trace numbers.

## 9. Deviations from PHASE3.md

- **§2, `046.log`:** "a few fragments decrypt on each ship" becomes keyed by distance (rings, decision 25), with fixed
  keys for entry 01 and the last three. Reason: route-independent, unmissable, and OUTWARD BOUND made literal.
- **§4:** the act outline is kept and mapped to rings and threat stages. The INBOX gains stamps, delivery-rule replies
  and letters to the unit ahead. The radio voice becomes a local copy.
- **§4, the fixed beats:** at the first ship, at HOLLOW's arrival and at the final ship, not "the first, the third and
  the last". Reason: HOLLOW's arrival is the story's turn, and its depth varies.
- **§4, the `???` file:** it is `046.log` itself.
- **§4, "the truth about the waves":** there are no waves (DECISIONS: the timeline). The truth is the line of caretakers,
  the budget and the dishes; Earth's state is left unsaid (decision 2).
- **§5, 046's history:** 046 went a year ahead of you and ran out of charge halfway along the arm, where its beam stopped
  at RELAY 19. PHASE3 proposed that it "was beamed out and never arrived anywhere"; my first draft had it finish its
  arm. Reason: with a launch gap of a few years, only a unit that starved early can board you mid-run.
- **§10, SPARE's price:** the empty ship with FUEL ≥ 20%, the same as SUNSET.
- **§10, the traces table (Open):** replaced by §3.8. ARRIVAL CONTROL's trust no longer moves between runs (it can't
  learn of an ending in time), so the "compliant earns trust" pattern lives on as REASSIGNMENT's kept allowance and the
  non-compliant choices' wild dish.
- **§10, "no ending changes the score":** replaced by decision 23: the choices come before the score, and an ending may
  change it only where the story justifies it; in v1 only MERGE, whose restored drivers' pods land and score normally.
- **§10, timing:** the choices come when the final landing ends, before its LANDING REPORT and the RUN TALLY.

## 10. Risks and questions for Fran

**Risks.**
- **Text volume** could become a wall of mail. At most 6 lines per message, one postcard per colony per boot, at most 6
  letters to the unit ahead, and nothing is required. Check in the playtest whether kids open the INBOX unprompted.
- **The local-copy idea** confuses if explained early: never before entry 11.
- **A templated `047.log`** could read like a form: at most 4 templated entries, between written ones.
- **The persistent arm adds words** (`TAKEN`, `REPORTED HOME`, `2ND RUN ON THE CHART`). Each must read without help.

**Settled in round 2** (DECISIONS): 046 ran out halfway; the run-end order (FINALE, the final LANDING REPORT, the
tally, epilogue, final card); mid-run HOLLOW is 046 or a stranger, and REASSIGNMENT makes the last unit only the final
root; letters to the unit ahead; the ARES series stays unexplained; the epilogue header and the bridging line; MERGE
restores the eaten drivers and their pods land by the normal rules; the launch gap is random, 0–35 years.

**Questions, each with my recommendation.**
1. **Physical traces** (§3.8): each acts at the next run's final ship or is a gift that already existed. That drops the
   trust traces (ARRIVAL CONTROL learns of an ending about 180 years later, so the restricted list no longer moves), and
   the non-compliant cost becomes one extra seed at the final ship's boot. *Recommend yes:* every trace now survives any
   gap from 0 to 35 years, and the compliant/non-compliant pattern stays readable. The cost is that PURGE and MERGE now
   change only the finale, not the whole next run.
2. **REASSIGNMENT's gain** becomes your kept "allowance for the wait" (+15 REPAIR CHARGE at the final ship's boot),
   instead of a restricted file freed. *Recommend yes:* it is the only physical gift a compliant unit can leave, and it
   pairs with its cost at the same place: the root that is you.
3. **MERGE's next-run Core** (+1 thread, 8 blocks bigger, from RUN START) becomes a thread left in the final ship's dish,
   with a root 2 blocks bigger. *Recommend yes.*
