# Slice 7d SIGNALS: self-review

Reviewed by the agent that built it (branch `signals-7d`, from 5e97825: 7a–7c merged and reviewed), after the FOUNDATION and
both tracks were in: `git diff 5e97825..HEAD`. 7d was small enough for one agent to build in sequence, so this is not an
independent review; it reads the work as a player would meet it and as 7a–7c's contracts expect it. Sources: plan R38–R41
and every 7a–7c Deviations section; slice-5-plan R18 and its signal deviations; 02-map §3.5; 05-story §3.3, §3.7, §3.8,
§3.12; OPEN-DECISIONS 19, 31, 49, 50, 74.

Each finding is marked **FIXED** (with where), **NOTED** (left, with why) or **DEFERRED** (to a named slice).

**What I ran**
- The unit tier with each gate raised in turn (UNKNOWN_EVENTS_BUILT, then CONTACT, then item 74's retirement), and once at
  the end (the numbers are in the plan's "Deviations (7d)").
- A headless probe of RUN START: runs 2, 3 and 4 after each of the 15 endings on 30 seeds (1,350 starts). No throw; every
  run's traces and signal records pass the save's own checks (`traceRefusal`, `signalRefusal`); a ship holds a `▓▓░▓` file
  exactly when it is the signal `?` ship (1,350) or a CONTACT stop (720: both stops on each of the 360 CONTACT runs), and 293
  of the stops are on a resident's ship (one flown in `signals/contact`: both files fit with a WALL's room left).
- Playwright (Chromium, seed 7, 1440×900): the new `signals.mjs`, alone: 12/12, 134 s.

**Verdict in one line:** the `?` ships, the three signal sources and CONTACT play end to end through the real paths and the
save holds them; the review found one save hole (a CONTACT ending was not checked against its price) and two e2e movers, all
fixed, and leaves a short list of NOTED edges for the lead.

---

## Bugs a player hits

### Saves and reloads

- **A CONTACT ending was not checked against its price** (FIXED: `save-codec.ts finaleRefusal`). The price is held, not
  spent, so an ENDING CHOSEN save with CONTACT must still hold 3 signals; a hand-edited save (or a bug that dropped a record)
  could otherwise resume into a CONTACT the run never paid for. The codec now refuses it, as it refuses a STAY whose ship is
  not ★ ON TARGET.
- **A reload at a `?` ship or a CONTACT stop replays its boot** from the BEAM save: the ship is rebuilt from the run (the
  signal file from `signalFileAt`, the old colony's letter derived from the route), and a stop's `given` mark is still false
  there, so its +8 and its line come once, never twice. Checked in `signals/contact` (the arrival, the boot line, the place
  given as the line is said) and by the codec round trips in `signals/events` and `signals/contact`.
- **A SCAN after the BEAM save is lost with a reload**, as every in-ship deed is (decision 5): the file is rebuilt unread and
  can be read again. No double count: one record per ship and source (`signalRefusal`).
- **A v8 save** migrates (`RUN_SAVE_MIGRATIONS[8]`: every record a note's, 1 fragment) and resumes (`signals/foundation`, on
  a v8 fixture dumped by the game's own save path before the bump). NOTED, two edges of a v8 run resumed mid-route:
  - an old colony `?` ship it already passed now has its letter in the INBOX, unread, at that past boot (the mail is derived
    from the route, never stored);
  - a signal `?` ship it already passed never had its file, so those 2 fragments are missed.
  Both are a run started before 7d meeting 7d halfway; neither breaks anything.

### Old archives

- No archive change (META 4 holds). `endingsSeen` already took `'contact'` (7a widened it to the seven pieces), so the title's
  `ENDINGS n/7` and the final card's YOU row count CONTACT once it is chosen. An older archive simply has not seen it.

### The classic world

- Nothing of 7d plays there: no arm, so no `?` card, no letter, no signal file (`signals.ts` answers none off the arm), and
  CONTACT's row on the classic LAST LIGHT reads `???` with `COLLECT 3 SIGNALS · you have 0` (it is never archived, so the
  row is never named). NOTED: `__ap.ship(n)` from an arm run keeps that run's signal records, so a debug jump can open
  CONTACT on the classic LAST LIGHT; debug only, and the classic world is never saved.

### The `?` cards

- **What the card hides** (OPEN-DECISIONS 75): KNOWN PROBLEMS, RESIDENT, PLANET, SITE DATA and LANDING read `??? · NO
  TRANSPONDER`; the colonists, pods and ARK tag go; the no-Swap and no-go rows, whose presence would tell, are dropped; the
  chart labels it `NAME · ???` and draws an ark as a standard ship. Its public schedule and the unit's own rows stay.
- NOTED: **the PACKET's headline names the ship's colonists** (`MAP_TEXT.packet.headline`) after SET COURSE. The kid has
  chosen by then, and the boot names the ship anyway; hiding it is a one-line change in `transmit.ts` if the lead wants it.
- **The e2e's POOR card moved** (FIXED: `map-desk.mjs`): on seed 4 the POOR CORMORANT that slice 6's check reads is the
  gone-resident `?` ship, so its SITE DATA row now reads `??? · NO TRANSPONDER`. The check reads KITTIWAKE (POOR, 2 LZs, in
  reach from VESPER on that seed) instead. Not run here (see e2e below).

### The signals

- **Three sources, one count** (OPEN-DECISIONS 77): a note's 1, the signal ship's file 2, a CONTACT stop's file 1, summed by
  `signalCount`. A stop may also be a departed resident's ship whose note carries one: one record per source, so both count.
- **The stamp past CONTACT's price** would say `SIGNAL · 4/3`, which reads as a bug (FIXED before it shipped: `SIGNAL · 4`
  past 3, and the TERMINAL's line `4 HELD`).
- **The file is a blocker**, never food (not in `INFECTABLE_TYPES`), and takes SCAN only (the log's refusals for the rest),
  so no tool can lose it by mistake. It sits after the resident's files in rack A; the load checks now count it with the
  largest resident (13 + 1 of rack A's 18 free, a WALL's 4 left behind them).
- **The glyph** (R40, OD 31, 49): on the signal ship and the gone-resident ship once a fragment is held, never on an ordinary
  departed resident's `unknown` card; also on a CONTACT stop whose file waits (OPEN-DECISIONS 78), whose TRACE row already
  names it.

### CONTACT

- **Its row** is `???` until chosen once, then named; out of reach it says `COLLECT 3 SIGNALS · you have n`, open `SIGNALS 3 ✓
  · needs 3` with its meter (OPEN-DECISIONS 79). The verdict echoes `> transmit outward` and CONTROL calls it non-compliant
  (the one rule, `controlCompliant`).
- **The epilogue's CONTACT gap** (7a NIGHT's pieces gave REASSIGNMENT and STAY a two-minds line after MERGE or UNRESOLVED,
  CONTACT none): FIXED with `contactUs` (MERGE) and `contactTwo` (UNRESOLVED) (OPEN-DECISIONS 80).
- **Its trace** places two stops in layers 5–7 on 40 of 40 run-2 arms (`signals/contact`), on ordinary ships only (7c's
  `placeExcluded`). The wild seed is owed at the next final ship, the final ship's TRACE row reads `· PURGE · CONTACT`, and
  the NEXT RUN: line says the seed once.
- NOTED: **the phone's FINALE step 2 now has four rows** (CONTACT's). `phone.mjs` checks step 1's sheet only; the step-2
  sheet scrolls by the same CSS, but nobody looked at it on a 390 px screen in this pass.
- DEFERRED to slice 8: CONTACT's worth. `traces/traces-sweep` (BALANCE_ONLY) flies six endings and not CONTACT; two stops of
  +8 against the others' +15 is R41's arithmetic, not a measured result.

---

## How 7d meets 7a–7c

- **7a's contract held.** `'contact'` was reserved in `YouChoice` and `STEP2_OPTIONS`, with throws where a raised gate would
  have met an unbuilt row: `optionState` (now its price), `pickStep2` (through `optionState`), `ENDING_TITLE` (all four keys
  were written; three are 05's, `WE WENT OUT TOGETHER` is R23's draft). `builtPieces` turned `ENDINGS n/6` into `n/7` with no
  other change; the movers were the suites and e2e checks that pinned `6` (ending/foundation, rules, card-models, epilogue;
  `playthrough.mjs`, `ending.mjs`, `run-flow.mjs`).
- **7c's contract held.** `traces.ts` already placed CONTACT's two stops by its rule; 7d added only the effects:
  `trace-gifts.ts` (the stop's +8 through `arrivalCharge`, its line, its `given` mark), `trace-hud.ts` (the card row and the
  NEXT RUN: body, where 7c threw), and the stop's file at the ship's build (`state/initial.ts` through `signals.ts`). The
  `'trace-gift'` line kind carries `trace: 'contact'` (as MERGE's thread and REASSIGNMENT's allowance do), so the boot plan
  needed no new kind and `BOOT_LINE_MAX` holds.
- **Item 74 is resolved as written** (OPEN-DECISIONS 74, 83): with `TRACES_BUILT.contact` raised, `LINEAGE_BUILT` and its
  gate-down paths are gone (`hollowUnitsAfter`, `hollowName`, the won and UNRESOLVED ghost lines, the 046.log-for-every-book
  branch, `lineage-boot.ts`'s gate). `wp8/ghost` now pins R34's stranger and R35's merged pair instead of §4.5's old table.
  `TRACES_BUILT` itself stays (every kind up): retiring it would also remove the `built` rule two 7c suites fly both ways.
- **Slice 5's contract held.** The note's SCAN writes the widened record (`source` 'note', `n` 1); the gone-resident `?` ship
  plays slice 5's departed resident unchanged; R18's three deferrals are closed (OPEN-DECISIONS 19).
- **One save bump** (v8 → v9), with its fixture dumped first, its migration, the shape pin (the keys are v8's: a record's
  fields sit below the pinned depth) and the codec's widened check.

## e2e not run in this pass

The lead runs the full e2e tier. This pass ran `signals.mjs` alone. The scenarios most likely to move with 7d, each read but
not run: `map-desk` (its POOR card moved to KITTIWAKE, above), `playthrough`, `ending` and `run-flow` (`ENDINGS 2/7`), `phone`
(the FINALE sheet's step 2 has four rows), and any scenario whose seed puts a `?` ship on a card it reads (`run2` on seed 4,
whose run-2 arm has OSPREY, CURLEW and PATIENCE as `?` ships).
