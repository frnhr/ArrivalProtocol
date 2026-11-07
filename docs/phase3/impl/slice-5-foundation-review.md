# Slice 5 foundation: contract review

> Every finding below is marked with how the lead settled it; the changes are in slice-5-plan.md "Deviations (foundation, review follow-up)".

Reviewer: the independent contract review (plan §6.1 item 8). Scope: `git diff e5a9d47..HEAD` on
`claude/modest-hawking-209t0f` (15 commits, 0097fa2..31a42df), read against slice-5-plan.md (R1–R28, §1–§7, "Deviations
(foundation)"), 04-threats.md §3.11–§3.15 and §8, 05-story.md §3.6, §3.11, §8.5, and AGENTS.md.

What I ran:
- `npm run typecheck`: clean.
- **Merge probe.** I made a scratch clone with one branch per track. Each branch made its own edits: raised its
  `RESIDENT_BUILT` line(s), flipped its `built:` check in `residents/foundation.test`, changed a value and appended a
  constant at the end of its tuning block, added a check inside its `support/words.test` block, and (FACE only) changed
  one cue line and added another in the `audio-cues` resident block. I merged WARDEN, then KIN, then FACE.
  - All three merged with no conflict.
  - The merged tree (every kind raised) passed the whole unit tier: **195 passed, 0 failed**, 8 balance-only skipped,
    139 s on 4 workers.
- **Import probe.** Each track added one import line at the top of `support/words.test.ts`, the one it needs for its own
  block. KIN's and FACE's merges then **conflicted** (M1).
- **Blast-radius probe for R22.** The merged tree was instrumented to log each ship built with a resident, and each PACKET
  dealt on a departed resident's ship (which KIN's leftover deck will replace). The results are under M6.
- I did not run the e2e tier.

The foundation is careful and mostly right. With every flag false the game is unchanged. The throwing stubs are reachable
only through `__ap`. The save bump, its migration and the at-rest checks are correct at every save point. The tool-rule
ordering, `POD LOCKED`, the untimed choice and the controller seam work as described. The two blockers are surfaces the
contract does not reach:
- the leftover deck's **skill card** has no identity in the pick model, and no hook at the send;
- the **THRUST CTRL pip's jump and look** live in a component that no track owns.

---

## Blockers

### B1. The leftover skill card cannot be picked or applied by KIN alone (KIN, FACE)

> **Settled (9bef943): fixed as proposed.** `DraftCardId`, `applyLeftoverPick` before `commitTraining`, no arrival card, a skill tag. Lead decision: no link room, through the grant path; KIN skips a skill pending at the desk (§2.8).

Where: `src/state/schema.ts:390` (`TransitPlan.pick: UpgradeId | null`) and `:332` (`ArrivalReport.card`);
`src/systems/run.ts:466`, `:534`, `:541`; `src/systems/transmit.ts:445–446`; `src/systems/draft.ts:196`
(`pickCard(store, id: UpgradeId)`); `src/systems/training.ts:118`.

Plan §2.8 and R14 want a deck of pool, pool and skill. Picking the skill card calls `grantSkill(…, 'card')`, and its file
"joins the packet at once, takes link room like a purchase". Four things stop that.

1. **The card has no identity.** `DraftCard.id`, `TransitPlan.pick` and `pickCard` are all `UpgradeId`, and no
   `UpgradeId` means "a skill". The other ids fail in two ways:
   - an existing id would collide with a pool card;
   - `'cycles'` would make `training.ts:118 commitTraining` record a +2 CYCLES grant as well.
   `transmit.ts:446` marks a card picked by `card.id === plan.pick`, so two cards with one id both light up. Its
   `getUpgrade(card.id)` tag (`:445`) would print a pool card's form on the skill card.
2. **No hook at the send.** The grant must happen at TRANSMIT ▸, because the pick can still change before then. But
   `transmitNext` is in `run.ts`, which the lead owns. Granting in `pickCard`, which KIN owns, would need an undo on every
   re-pick and on ◀ CHART.
3. **No link room.** The grant path is `skillGrants`, installed by the next boot's `applySkillBootLine` →
   `installSkillFile`. It never crosses in the packet, so it takes no link room. "Takes link room like a purchase" (§2.8)
   is not what the built grant path does.
4. **Pending purchases.** `grantAllowed(…, 'card')` (`skill-tree.ts:358`) does not look at
   `state.run.skills.pending`. At the PACKET the kid may already have trained that same skill at this desk. The grant
   would then be followed by `commitTraining`'s purchase of the same file.

**Fix (lead, before the tracks branch):**
- `data/upgrades.ts` (KIN's file, so the lead makes this edit now): add `export type DraftCardId = UpgradeId | 'skill'`
  and make `DraftCard.id: DraftCardId`. A deck holds at most one `'skill'`, and KIN's deal keeps ids unique within a deck.
  When there is no branch for the skill card, KIN falls back to `+2 CYCLES` (`'cycles'`) only if no pool card is
  `'cycles'`, else to a normal card.
- `schema.ts`: `TransitPlan.pick: DraftCardId | null`.
  - `ArrivalReport.card` stays `UpgradeId | null`: `transmitNext` writes `plan.pick === 'skill' ? null : plan.pick`.
  - The codec needs no change, because `transit` is null at every save point.
- `run.ts transmitNext`:
  - `:534` skips `'skill'` as it skips `'cycles'`;
  - right before `commitTraining(store)` (`:541`), add `applyLeftoverPick(store, plan)`, a new export of `draft.ts`
    (KIN's), stubbed as a no-op. KIN calls `grantSkill` there.
- `draft.ts`:
  - `pickCard(store, id: DraftCardId)`;
  - `cardFiles`, `pickCharge` and `applyPickToPacket` take `DraftCardId` and treat `'skill'` as a card with no file;
  - add the `applyLeftoverPick` stub.
- `transmit.ts:445`: for `card.id === 'skill'` use a skill tag (`DRAFT_TEXT` or the `.skl` chip words). FACE paints it
  from `card.leftover.skill`.
- `arrival-preview.ts:90`: the `pick` type follows `DraftCardId`.
- **Decide R14's link room now and write the decision into §2.8.** I recommend the grant semantics: no link room, the
  file installed at the next boot with the TRAINED line `from the resident that left <SHIP>`. A packet-borne file would
  need a second install path.
- Tell KIN: choose the skill with `grantAllowed(…, 1, 'card')` **and** no pending purchase of that skill
  (`state.run.skills.pending`). Otherwise the grant and the desk's training double up.

### B2. The THRUST CTRL pip's jump and its OVERRIDDEN look are in `WindowGrip.ts`, which no track owns (WARDEN, FACE)

> **Settled (9bef943): fixed as proposed.** `PipModel.jumpId` and `.override`; `WindowGrip` jumps to `jumpId ?? getByRole(…)` and paints `data-override`. `WindowGrip.ts` is the lead's (§5).

Where:
- `src/components/tools-view/WindowGrip.ts:172–179`: the click handler jumps to `getByRole(state, role)`, which is
  always Thrust Ctrl's own file;
- `WindowGrip.ts:99–110`: `paintPip` writes only `look`, `reading`, `title` and `count`;
- `src/systems/flight-hud.ts:1105–1117`: the `PipLook` union and `PipModel`.

The spec needs two things here:
- the pip "jumps to the file" WARDEN.sys (04 §3.12, pillar 4; e2e §7.4 step 1: "a click on the THRUST CTRL pip selects
  `WARDEN.sys`");
- FACE draws OVERRIDDEN in amber (§2.11).

WARDEN owns only the pip block of `flight-hud.ts`. A new `PipLook` would break `PIP_GLYPH` and `worseGrip`, and the click
target sits in `WindowGrip.ts`. FACE has no attribute to style.

**Fix (lead, now):**
- add `jumpId: string | null` and `override: string | null` to `PipModel`;
- `filePip` sets both to `null`;
- `WindowGrip.ts`:
  - the click selects `windowPip(state, role).jumpId ?? getByRole(state, role)?.id`;
  - `paintPip` sets `button.dataset.override = model.override ?? ''` and adds it to its key.

WARDEN then fills both in its pip block. FACE styles `.pip[data-override]:not([data-override=""])` in `resident.css`.

---

## Majors

### M1. Three tracks must add an import at the same line of `support/words.test.ts` (WARDEN, KIN, FACE)

> **Settled (2b466f3): fixed as proposed.** The three imports, and one placeholder check in each block.

`tests/unit/support/words.test.ts:22–26` imports none of `WARDEN_TEXT`, `KIN_TEXT` or `RESIDENT_UI_TEXT`. Each track's
block needs its own text module. With `noUnusedLocals` on, the lead cannot leave the imports in unused. The import probe
showed it: the second and third merges conflict at `:26`.

**Fix:** add the three imports after `:26`. Give each block one placeholder use that the track replaces, for example
`check('5 WARDEN words: the pool exists', Object.keys(WARDEN_TEXT).length > 0);` and the same for KIN and FACE. Then a
track only ever edits inside its own block.

### M2. FACE paints words that §2.10 puts in WARDEN's and KIN's files, and the stubs don't have them yet (FACE)

> **Settled (2b466f3): option (a), for every word FACE paints.** `resident-ui-text.ts` seeded with final keys (stamps, goodnight, INSPECT, the deck's headline, tag and chip, the noise line, rows, glossary). The rule is in §2.10. The `WARDEN_TEXT` check is now shape-only.

FACE needs these words, which plan §2.10 and §3 place in other tracks' files:
- the stamps `RESIDENT DELETED`, `RESIDENT CURED` and `THE SHIP'S OWN AI IS AWAKE · RACK A` (in `warden-text`; §2.11
  wires them in `Stamp.ts`);
- WARDEN's `goodnight` on the LANDING REPORT (in `warden-text`; R24, `landing-report.ts` is FACE's);
- the deck headline `LEFT BEHIND BY LOOKOUT` and the `.skl` chip line (in `kin-text`; `TransmitScreen.ts` is FACE's);
- the noise line `▓▓░▓ ░▓▓▓ ▓░░▓` in the note's DetailPanel (in `kin-text`; `DetailPanel.ts` is FACE's);
- INSPECT's `WARDEN.sys · this ship's own AI · aboard since 2240 · corrupted` (in `warden-text`).

`WARDEN_TEXT` has only `wake` and `surprise`, and `KIN_TEXT` only `notes`. FACE would therefore have to add keys to two
files it does not own, which conflicts at merge.

**Fix (pick one now and write it into §2.10):**
- (a) Move these lines to `resident-ui-text.ts`, which FACE owns, as Deviation 6 did for the refusals. I recommend this
  for the stamps, the headline and the chip.
- (b) The lead seeds the keys now, with final signatures and the plan's words:
  - `WARDEN_TEXT.stamp.{deleted, cured, awake}`, `WARDEN_TEXT.goodnight(name)` and `WARDEN_TEXT.inspect(name, year)`;
  - `KIN_TEXT.noise` and `KIN_TEXT.deckHeadline(name)`.
  The owning track then edits only the values.

Either way, state the rule: "after a SCAN, WARDEN and KIN write their words into the segment's `name`/`desc`, and FACE
paints segment fields". This avoids more cross-imports.

Also: `residents/foundation.test.ts:390` renders `WARDEN_TEXT.wake` and `WARDEN_TEXT.surprise`, but the `warden-text`
header says WARDEN "rewords freely". Either freeze those two keys as part of the contract, or move that check into WARDEN's
`words.test` block.

### M3. Save v5 lacks the resident's own burst count (WARDEN)

> **Settled (c7d4044): fixed as proposed.** `CorruptedState.bursts`, read `whole` by the codec.

`CorruptedState` (`src/types/resident.ts:52–66`) has no burst counter. The only one is `burn.ghostBursts`, shared with
Thrust Ctrl's ghost. On an arm ship whose Thrust Ctrl is rolled hurt, the resident and the controller both add to it.

That count drives three things, and none of them can then be built correctly:
- WARDEN's counter `WARDEN FIRED THE ENGINE ×3` (`ghost-thrust.ts ghostCountShown`);
- the "first burst" alarm moment;
- the surprise's scan-at-first-burst.

Corrupted ships carry no modifier (I checked 200 run-1 arms: 0 of 400 corrupted residents had one), but the rolled
arrival damage can still hurt Thrust Ctrl.

Rule R1 forbids adding a field after the merge. **Fix:** add `bursts: number` to `CorruptedState` now:
- `createCorruptedState` gives 0;
- the codec's `checkCorrupted` reads `bursts: whole`.

WARDEN increments it on `'ghost-start'` while `capabilitiesNow(state).thrustCtrl.ghostBy === 'resident'`.

### M4. The sleeper has no phase for "woken, no job" at rest (KIN)

> **Settled (c7d4044): fixed as proposed.** `SleeperPhase 'awake'`, allowed at rest.

`SleeperPhase` (`types/resident.ts:71`) is `'asleep' | 'offering' | 'working'`, and the codec refuses `'offering'` at
rest. But the offer has no timer (R23). A kid can wake MOTH and never answer. `sleeperShipEnd` must then leave the slice
at rest, and its only choices are wrong ones:
- `'asleep'` with `wokenBy` set;
- `'working'` with `job: null`.

**Fix (now, it is saved):** add `'awake'` (woken, offer withdrawn or never answered, no job) to `SleeperPhase`. Add it to
the codec's `oneOf`. FACE's gift preview stays `phase !== 'asleep'`.

### M5. The ghost composite hides Thrust Ctrl's own ghost while the resident pushes harder (WARDEN; lead's files)

> **Settled (c7d4044): option (a).** `thrustCtrl.controllerGhost`. The no-Swap line, the ENGINE FAULT SKIP refusal, the SWAP lesson and landing's SWAP line read it.

Where: `src/systems/capabilities.ts:457–462` (`ghostOf`), `:558–561` (`ghostWithoutSwap`); `data/script.ts:2105`
(`ghostFiring`); `landing-guidance.ts:282`.

`RESIDENT_GHOST_DELETING` (0.0375/tac s) and `RESIDENT_GHOST_ANGRY` (0.021) both outpush
`ARM_GHOST_BY_BAND.failing` (0.015). A degraded controller is outpushed even by `RESIDENT_GHOST`. Then `ghostBy` is
`'resident'`, and every SWAP-only reader goes quiet, although the controller is still broken and only a SWAP fixes it:
- the no-Swap strip line;
- the ENGINE FAULT SKIP refusal;
- the SWAP lesson (`ghostFiring`).

It flips back when the DELETE ends or the anger runs out. This is defensible: one scheduler, and the resident's bursts
are the ones firing. But it is not what R5 says ("the SWAP-only readers check `ghostBy === 'controller'`" assumes the
controller wins whenever it fires at all).

**Fix (lead decision now, since WARDEN cannot edit these):** either
- (a) add `controllerGhost: GhostSpec | null` to `Capabilities.thrustCtrl` (Thrust Ctrl's own spec, whatever wins). The
  SWAP-only readers then test `controllerGhost !== null`, and the scheduler keeps using `ghost`; or
- (b) record (b) as a deviation, with `map/ghost-noswap` pinning it.

I recommend (a).

### M6. R22's list of moving suites is incomplete (KIN; lead-owned suites)

> **Settled (docs): the list replaces §7.3's.** R22 gives KIN edit rights on those suites for churn only. KIN measures early in a scratch commit and flips last. The harness-only pick rule is not taken.

Plan §7.3 expects `map/run1-route`, `map/delivery-packet`, `map/desk-flow` and `skills/packet` to move. With every kind
raised, the probe logged the PACKETs dealt on a departed resident's ship, which are the ones KIN's leftover deck will
replace:

| Suite | PACKETs dealt on a departed resident's ship |
|---|---|
| `map/delivery-packet` | ≈ 120 (many seeds; CORMORANT 8 times) |
| `map/repository` | ≈ 70 |
| `threat/disguise` | ≈ 55 |
| `save/failures` | 15 (PLOVER, CORMORANT on seed 5) |
| `save/review-fixes` | 8 |
| `save/codec` | 1 (CORMORANT, seed 7) |
| `save/resume` | 1 (PETREL, seed 11) |
| `residents/foundation-flight` | 1 (PETREL) |

- **None** were logged in `map/run1-route`, `map/desk-flow` or `skills/packet`. They never deal on a resident ship that
  `createShipSlices` built.
- The same suites build corrupted ships too: delivery-packet 58, repository 20, disguise 24, save/failures 12. WARDEN
  should run them once its bursts are in.
- The harnesses pick `offer[0]` or `charge`. Each replaced deal changes the packet, so it can also change the beam seeds'
  targets (`rollBeamSeeds` picks packed files) and the next ship.

**Fix:**
- Replace §7.3's list with this one.
- Have KIN raise `left` in a scratch commit **early**, to measure the breakage; keep "flip last" for the real commit.
- Write the lead's permission into R22 for KIN to edit those lead-owned `save/*` and `threat/disguise` suites, limited to
  the card and pick lines.
- Most of the churn is the leftover deck itself, and the files alone move nothing (the tier passed). So it is worth
  asking whether a harness-only pick rule would keep most suites still, for example "pick by id from the normal deal when
  present".

---

## Minors

**m1.** MOTH's keys D / W / M (§2.9) all collide with `'game'`-layer keys. `input.ts dispatch` fires every binding for a
code, and the choice handler (`MindTerminal.ts:192–200`) is itself on `'game'`. So:
- [M] picks MEND DRIVERS **and** mutes the game (`audio-cues.ts:460`);
- [D] and [W] also reach the flight presets, RADIAL-OUT and PROGRADE (`flight-controls.ts:250–268`, from
  `guidance.ts PRESET_KEY`).
*Settled (b90c60c): R / H / T, `SLEEPER_JOB_KEYS`, §2.9.*

In the MIND a preset press is refused, so the kid gets a refusal on top of the pick. **Fix:** choose letters bound on no
`'game'` key. Taken: W, A, S, D, Q, E, F, B, L, G, M, P, Space and Tab. Free: R and T (bound only on `'desk'`) and H. For
example R (RUN THE DROPS), H (HOLD A WALL) and T (tend: MEND DRIVERS). Write the keys into §2.9.

**m2.** `residentShipEnd` (`src/systems/residents.ts:88`) checks for a slot recorded twice **after** the kind's
`…ShipEnd` has already run. On that path the sleeper's gift would be paid before the throw. **Fix:** move the
`met.some(…)` check above the `switch`.
*Settled (b90c60c): the check runs before the kind's `…ShipEnd`.*

**m3.** A lock's TERMINAL line said with `verbCountdown: true` (§2.7 step 4) is painted from `hollow.verb`:
- `MindTerminal.ts:231` and `paintVerbRow` end a resident's row at once, because `hollow.verb` is null;
- the row would show HOLLOW's verb text if both counted together;
- the ticker's `liveVerbText` (`flight-hud.ts:1233`, outside WARDEN's pip block) and `ObjectiveStrip.ts:183`, which no
  track owns, cannot count a lock.
*Settled (b90c60c): `liveLockText` (WARDEN's stub); `liveVerbText(state, speaker)`; the ticker passes the speaker. FACE keys `MindTerminal`'s row by speaker.*

**Fix:**
- FACE keys `verbRow` by speaker and reads `state.resident.corrupted.lock` for `'resident'` entries;
- the lead makes `liveVerbText` fall back to a WARDEN-supplied `liveLockText(state)` (an export of
  `resident-selectors.ts`, null until built). Without it, the lock's ticker reads `... 3` and never counts down.

**m4.** The resident's first burst is meant to stop a SKIP (R5). But `pace.ts:256` stops only at the **first ghost burst
of the phase**. On a ship whose Thrust Ctrl fired first, the resident's alarm moment flies by. **Fix:** with M3's field,
make `:256` read `ghostBurstsThisPhase(state) === 0 || (corrupted awake && corrupted.bursts === 0)`. Or accept this, and
record it as a deviation.
*Settled (b90c60c): fixed, with M3's field.*

**m5.** The sleeper's breath (§2.11: `heartbeat` at `SLEEPER_BREATH_GAIN` while rack A is on screen) is a per-tick
sound. The heartbeat bed is in `audio-cues.ts:391–407`, outside the resident block, and §5 only lets FACE "change the cue
on a resident event's line". **Fix:** say in §5 that FACE may add `onAiTick` entries inside the `audio-cues` resident
block (they go in the same `offs` array). Otherwise FACE has nowhere to put it.
*Settled (b90c60c): FACE may add per-tick entries in its block (§5).*

**m6.** `ToolRefusal` is a closed union. The kinds will need words that are not in `RESIDENT_REFUSAL`:
- REPAIR and COPY on MOTH.sys;
- MOVE on the note;
- DELETE and MOVE on `MOTH.wall`.
*Settled (b90c60c): the five words are added to `RESIDENT_REFUSAL`; KIN asks the lead to reword.*

The log's (`logMove`, `logCopy`, `logRepair`) and `residentCopy` can stand in. But any new word goes through the lead.
**Fix:** decide those four now, or add an escape hatch: a `RESIDENT_REFUSAL` key the owning track may reword.

**m7.** "aboard since 2240" (05 §3.6 INSPECT) and MOTH's years asleep both need the ship's launch year, which is not
stored on `ArmShip`. It can be derived from `reportedRun` and the run history. **Fix:** add a lead helper now
(`shipLaunchYear(map, slot)` in `map-run.ts`), so WARDEN and KIN don't each write their own.
*Settled (b90c60c): `map-run.ts shipLaunchYear`, `RUN1_SHIP_LAUNCH_YEAR`.*

**m8.** AUTODROP v3 `planOver` with locked pods: the locked pods leave the queue, so `doneTick` (`autodrop.ts:550`) can
end the plan with `PLAN DONE` while pods are still locked. A later DELETE, cure or ACCEPT frees them into a landing that
the kid's AUTODROP no longer flies. That is acceptable, but WARDEN's flow suite should pin it. Alternatively, make
`planOver` treat `lockedDrivers(state).length > 0` as not over.
*Settled (b90c60c): `planOver` waits while a pod aboard is locked.*

**m9.** Smaller things:
- With `left` raised, `POD LOCKED` with no pod named also wins over `NO POD READY` when unlocked pods aboard are merely
  repairing (Deviation 10 says so). That is fine, but name the case in the deviation.
- `MemoryStats.ts:40` counts WARDEN.sys's hidden 60% damage in the MIND's damage total, as it already does for unscanned
  ship files. That is consistent, so no change is needed.
- `checkResidentHistory` does not compare `met[].shown` with the reservation. This is harmless.
*Settled (docs): the case is named in the follow-up's m9; nothing else changes.*

**m10.** `sleeperShipEnd` on a **lost** ship: R12 pays the gift "at its ship's LANDING REPORT", and a lost ship has none.
State whether a lost ship pays.
*Settled (docs): lead decision, paid whenever woken, landed or lost (R12, §2.9).*

---

## Checked and sound

- **Neutrality.** With `RESIDENT_BUILT` all false:
  - `builtResident` is null, so there are no files, no boot line and no machines;
  - `residentShipEnd` returns at once;
  - the composite always picks the controller;
  - `dealOpen`'s extra term is false, `lockedBy` is never set, and `RESIDENT_RULES` is empty;
  - `BOOT_LINE_MAX` is only a floor for the `BOOT_LINE_AT_SEC` table, and the times `boot.ts lineAtSec` gives to existing
    lines are unchanged.

  The throwing entry points (`wakeResidentNow`, `lockNow`, `offerResidentDealNow`, `angerResidentNow`, `wakeSleeperNow`,
  `pickSleeperJob`, `rollLeftoverCards`) are reachable only from `__ap`. `rollLeftoverCards` has no caller at all.
- **Save v5.** The migration (`save-codec.ts migrateRunSave4`) covers:
  - BOOT payloads (RUN START, BEAM), through `payload.run.residents`;
  - WORLD payloads (SHIP DONE, ENDING CHOSEN), through `slices.resident`.

  Every way a ship ends goes through `endShip`, and so through `residentShipEnd`, before `openDesk`'s save: CONTINUE,
  LOST, and BEAM OUT's loss. The simulation retry on ship 1 skips it, and ship 1 never has a resident. The at-rest
  refusals (lock, offered DEAL, offering sleeper) are all states a kind's `…ShipEnd` can clear. Nothing legitimate is
  refused, except M4's missing phase. `rec` is exact, so M3 and M4 must go in before the first merge.
- **Dispatcher and ordering.** The kind's rule runs after `isBusy` and the disguise check, and before the tools'
  switch. MOVE/COPY stage 2 (`placeRefusal`) is untouched. On a `null` answer:
  - REPAIR's charge and `ALREADY 100%` still apply;
  - the infection checks still apply;
  - `notAFile` still applies to the files with no health.

  `actionRefusal` goes through `targetRefusal`, so DetailPanel's buttons agree.
- **Segment ids.** `'op-done'`'s `segId` is right for KIN's wake. A non-slide MOVE gives the clone `newSegId` while the
  op runs, but `onComplete` restores `clone.id = source.id` before the emit (`actions.ts:700–706`). So "MOVE MOTH"
  arrives as `segId === 'sleeper'`, and DELETE of `sleep.lock` as `'sleep_lock'`.
- **Rack-A builder.** It places the files right after Cargo Ctrl, keeps at least `WALL_MIN_BLOCKS` behind them, checks
  `RACK_A` at load, and gives fixed ids that collide with no rack-A id. `structuredClone` keeps the spec shared-free. The
  `resident-files` stream is separate, so a rebuilt (BEAM) ship matches; this is tested.
- **No zone hits a resident's own file.** Debris clouds target only pod racks (`ArmShip.debrisRack: PodRackName`). The
  RADIATION BELT (racks A–B) is only on IMPACT-B, and corrupted residents are only on CAPTURE ships. So WARDEN.sys is never
  a zone target. Leftovers on an IMPACT-B belt ship are belt targets, as 04 §3.13 intends.
- **`isRepairable`.** Its four callers (tool-targets, actions, DetailPanel) all gate on scanned or integrity first.
  `rmTargets` never names a resident's file.
- **`speakerTag`, `CHANNEL_OF`, `lineTypeCps`.** No other `Record<Speaker, …>` or exhaustive speaker switch exists.
- **The deal path.** `dealOpen` waits on `residentDealOnThisShip`. WARDEN is mounted after HOLLOW's deal, so on a tie
  tick HOLLOW offers first and WARDEN sees `deal.phase !== 'none'`. That is consistent with R8's "whichever offers
  first". `rmTargets`, `sayChoice` with a look, `withdrawChoice`, `DEAL_TIMEOUT_SEC` and `getOpsBySeg` are all exported.
  WARDEN needs nothing in `hollow-deal.ts`.
- **RUN THE DROPS through the `'resident'` slot.** It needs nothing in `autodrop.ts`:
  - `autodropController(state, { version: 3, queue: [], source: 'resident', armed: 'plan' })` returns an armed v3
    controller with `claimed` true (no thread) and `holdsTactical`;
  - `decidePlan` and `planLanding` read only `isLaunchable` drivers, never the kid's machine (`pinTick` and `doneTick`
    run only for the kid's own arm);
  - `shadowed()` stands AUTODROP aside;
  - KIN wraps `decide` to return `'skip'` between passes, and `landing.ts controllerTick` honours it;
  - `autodropLaunched` is called only for `source === 'autodrop'`.
- **The untimed choice.**
  - `tickChoices` and `choiceTimerRunning` skip it;
  - the ticker shows `WORDS · [TAB]` with no clock;
  - `MindTerminal`'s clock still prints `0:00` for it (FACE's, Deviation 13).
- **Hot shared lines.** The merge probe showed no conflicts in the `RESIDENT_BUILT` lines (one comment line between
  each), the foundation.test built lines, the three tuning blocks (including appends at the block ends), the words.test
  blocks or the audio-cues block. The one single-line conflict is M1's imports.

---

## Per-track verdict

- **WARDEN: go after B2, M3 and M5** (and M2(b) if the lead keeps the stamp and goodnight words in `warden-text`).
  With those, everything else in §2.7 can be built in WARDEN's files.
- **KIN: go after B1, M1 and M4.** Also take m1 (all three choice keys collide). Re-baseline R22 from M6's list before flipping `left`.
- **FACE: go after B2, M1 and M2.** Also take m3's MindTerminal note and m5. Every state field FACE paints from exists;
  the gaps are words and DOM hooks, not state.
