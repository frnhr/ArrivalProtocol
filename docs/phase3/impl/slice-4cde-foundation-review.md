# Slice 4c–4e foundation: independent review

> **Follow-up status** (FOUNDATION, df766fc and a76c8c8): each finding below is marked; the plan's "Deviations (foundation,
> review follow-up)" records them.

Reviewed: `git diff 364f2a1..HEAD` on `claude/modest-hawking-209t0f` (nine commits, faf7e86 … f0ab836), against
`slice-4cde-plan.md` (Lead decisions, §2–§8, "Deviations (foundation)"), `03-skills.md` and `AGENTS.md`. No source was
edited.

**What I ran:**
- `npm run typecheck`: clean.
- `node tests/unit/run.mjs save foundation pace-landing beam-seeds`: 11/11 green.
- **A merge probe.** I made three throwaway copies of the tree in the scratchpad. Each raised one track's `built` line only
  (`autodrop` 0 → 3, `sentry` 0 → 3, `autoburn` 2 → 3), and I ran the whole quick unit tier on each. That lists the checks
  each track will have to edit just to land its raise, which is where parallel edits will collide (M1). The probe's first
  run also failed seven `flyOnce` suites, but only because `package-lock.json` was not copied; those are excluded.

**Verdict in one line:** the contract is close. It is behaviour-neutral, the save v4 is sound, and the registry, the slots
and the gate are right. No blocker. Before the tracks start, fix four majors:
- M1: one test line that all three tracks must edit;
- M2: a missing AUTODROP end value;
- M3: SENTRY's reader inventory, which misses four files;
- M4: L10, which ORBIT can't silence.

---

## Findings

### Blockers

None. Nothing the tracks need is impossible from their own files once the majors below are fixed. Every major is a
lead-file edit of a few lines.

### Majors

**M1. One single-line check pins all four `built` values. Three tracks must edit it, and two other checks sit next to it.**

> **Follow-up:** fixed (a76c8c8): one `built` check per skill; ui-models split; §7.2 names the lines.

`tests/unit/skills/foundation.test.ts:73`

```ts
check('4a builds AUTOBURN v1–v2 only', SKILL_TREE.autoburn.built === 2 && SKILL_IDS.filter((id) => id !== 'autoburn').every((id) => SKILL_TREE[id].built === 0));
```

What the merge probe found:

| Raise | Checks that fail |
|---|---|
| DROP | `foundation:73`, `foundation:276–282` (desk 1), `ui-models:60` (one card), `ui-models:116–118` (`closed` list), `ui-models:149` (the eaten cells) |
| SENTRY | `foundation:73` only |
| ORBIT | `foundation:73`, `foundation:294` (v3 unbuilt), `training-flow:105` (v3 not built), `ui-models:119–122` (`autoburn:v3` OPENS LATER) |

So:
- Line 73 is a guaranteed three-way textual conflict.
- `ui-models` 116–118 (DROP's) and 119–122 (ORBIT's) are adjacent hunks in one check block, so git will very likely
  conflict there too.
- §7.2 gives ORBIT neither `skills/foundation`, `skills/training-flow` nor `skills/ui-models`.

**Fix (FOUNDATION, now):**
- Replace line 73 with one `check` per skill, in SKILL_IDS order, with a comment line between each pair. For example:
  `// FLIGHT (Track ORBIT raises it)` / `check('built: AUTOBURN v1–v2', SKILL_TREE.autoburn.built === 2);` / `// LANDING
  (Track DROP)` / …
- Split `ui-models.test.ts:116–125` into separate checks: the branches and closed list (DROP), and the AUTOBURN cells
  (ORBIT). Put at least one unchanged line between them.
- Add to §7.2: ORBIT may edit `skills/foundation` (:294), `skills/training-flow` (:105) and `skills/ui-models` (:119–122,
  :149's `autoburn:v3` if it moves), only on its own lines.

**M2. AUTODROP has no state for R4's tap lesson, and `AutodropEnd` is a closed union pinned in two lead files.**

> **Follow-up:** fixed (df766fc, a76c8c8): `'released'` in both; a positive codec case.

`src/types/landing.ts:413`, `src/systems/save-codec.ts:367`

- R4 says: a v1 tap "released before the first launch, nothing goes, and a one-time lesson says `HOLD [L] — AUTODROP waits
  for the centre`".
- `autodropTutorialDue(state, 1)` can read only the state, and nothing in `AutodropState` records "released before the
  first launch":
  - the only candidate is `end: 'cancel'`, which is also [G]-again's cancel (a v2/v3 kid can hold [L] too, since v1 works
    "v1 or better");
  - a module flag is outside §2.3's allowed list;
  - a new field is a save bump (the pin reaches `landing.autodrop.*`).
- DROP can't add an end value either: the union is in `types/landing.ts` (lead) and the codec's runtime list
  `AUTODROP_ENDS` (lead) refuses any value it doesn't name. `end` may stand at rest, so a new value reaching a desk save
  makes it unresumable.

**Fix (FOUNDATION, no bump):**
- Add `'released'` (`[L]` let go before the volley's first launch) to `AutodropEnd` and to `AUTODROP_ENDS`.
- Add a positive codec case: a desk save with `end: 'released'`, `endAtAi` set, `pass`/`sent` non-empty and `flownAs: 2`
  decodes. Today only refusals are tested.

**M3. SENTRY's file list misses readers that would give a disguised seed away.**

> **Follow-up:** fixed (df766fc): the four files are SENTRY's, with banners; §7.2 states the rule.


The plan's inventory greps `type === 'hollow'` (21 sites in 10 files). It misses the `isHollow(…)`, `seg.seed` and
`beamSeedsInMemory` readers. Three of them reveal a disguised seed, and SENTRY owns none of them:

- **`src/data/threat-rules.ts:28` `beamSeedAboard`.**
  - It drives `beam-seed-first` (the `RM THE SEED` lesson with `SEED_HINT_TARGET`, which lights the seed) and the
    no-rm line.
  - It reads `beamSeedsInMemory(...).some(seg.seed)`.
  - SENTRY can't change `beamSeedsInMemory` itself: TRACE and `beamSeedCount` (beam-seeds.ts:187, hollow-hud.ts:145)
    must keep counting disguised seeds.
  - The file's banner still says "Track THREAT owns this file".
- **`src/systems/move-preview.ts` (`isHollow`, `hollowReach`) and `src/components/memory-view/MovePreviewLabels.ts:120`.**
  - `if (!state.memory.some(isHollow)) return;` turns MOVE's `WALL 9 ✓ / GAP 2 ✗ / ⚠ LETS ??? REACH YOUR CORE` labels on
    when the only HOLLOW block is a decoy. That is a tell on every MOVE.
- **`src/systems/hollow-verbs.ts:71`** names a seed in MV's words (`mvSeedWord`). This is rarer: verbs come late, and
  disguises arrive from depth 5.

`src/data/script.ts`'s phase 2 `SEED_RULES` read `seedsInMemory`/`threateningSeeds` from `hollow.ts`. SENTRY owns
hollow.ts, so those can be covered without editing script.ts, but the plan should say so.

**Fix (plan §7.2):**
- Add `data/threat-rules.ts`, `systems/move-preview.ts`, `components/memory-view/MovePreviewLabels.ts` and
  `systems/hollow-verbs.ts` to SENTRY's list, and correct threat-rules' banner.
- State the rule SENTRY applies there: a reader that tells HOLLOW from a file consults `isDisguised`; the counters
  (TRACE, the tally) don't.
- If the lead decides the MOVE preview may know (it is a reach rule, not a label), say so in §4.2 instead.

**M4. While v3 holds below the DRAG line, L10's `ORBIT DECAYING` outranks v3's slot, and ORBIT can't change it.**

> **Follow-up:** fixed (df766fc): `v3Decay` from `v3DecayLine(state, pred)`, through LandingFlight.

`src/systems/landing-guidance.ts:451` (L10), `:457` (the `v3Lower` slot, below it), `:269` (`decay: decayOf(state)`)

- §5.3 makes `decayWarned` one of v3's top-up triggers. So the exact case v3 is handling is the one where the strip says
  `ORBIT DECAYING — out of the band in 2 orbits` for up to an orbit, until the top-up comes within the TACTICAL lead and
  L2 leads.
- L10 also outranks the v3 slot, the L9 lines and L13's tails.
- `landing-guidance.ts` is DROP's, and the foundation fixed only the `v3Lower` slot. `predict.ts`'s `'lift'` and
  `landingBurnOffer` are ORBIT's own and can be gated, so the burn is fine; the words are not.

**Fix (FOUNDATION, behaviour-neutral):**
- Add a second v3 slot: `LandingContext.v3Decay: string | null`, filled from a new stub `autoburn-v3.ts v3DecayLine(state)`
  that returns null.
- In `evaluate`, when it is non-null it replaces L10's text, with L10's urgency and keys, e.g. `AUTOBURN v3 TOPS UP AT ▼
  IN 3:10 — it holds the orbit`.
- Record it beside deviation 3, and extend the DROP/ORBIT split note: "the two v3 slots in landing-guidance.ts stay as the
  FOUNDATION wired them".

### Minors

**m1. Every v4 "at rest" field depends on a track resetting it, and a save written with one set is unresumable, not

> **Follow-up:** fixed (df766fc, a76c8c8): endShip resets it; a test resumes the SHIP DONE save. The dev assert is left for the fix pass.

refused.**
`src/systems/save-codec.ts:393` (preempted), `:367–375` (AUTODROP)

- `encodeRunSave` doesn't run the checks, so a forgotten reset only shows on RESUME (`RUN SAVE CAN'T RESUME`).
- AUTODROP is safe: DROP owns `landing.ts endNow`, the one writer of `landing.ended`.
- SENTRY's `seedTelegraph.preempted` is not. A ship can end, in flight or at the landing's end, with an outline armed. The
  SHIP DONE save then follows in `run.ts openDesk`, which is the lead's part of run.ts, and SENTRY owns no code on that
  path.

**Fix:**
- In `run.ts endShip`'s update (the lead's part), add
  `if (draft.hollow.seedTelegraph !== null) draft.hollow.seedTelegraph.preempted = false;`.
- Tell SENTRY to release `'sentry-preempt'` from a watcher in sentry.ts (telegraph null or not preempted → release), not
  from the call-off sites. `finale.ts rootGone` and `hollow.ts acceptDeal` clear the telegraph, and finale.ts is not
  SENTRY's.
- Optional: assert the at-rest rule in `savePayloadAt` in dev builds, so a track's suite fails at the write.

**m2. SENTRY has no mount, while DROP's was pre-wired.**

> **Follow-up:** fixed (df766fc): `mountSentry`, called from `mountHollow`.

- `mountAutodrop` is called from `mountLanding`, but nothing mounts sentry.ts.
- SENTRY needs subscriptions: `SOMETHING LANDED · RACK D` on `'seed-landed'`, and m1's thread watcher.
- **Fix:** add `mountSentry(store): () => void` (built: returns a no-op), called from `hollow.ts mountHollow`. That way
  every harness that mounts HOLLOW has it, as with AUTODROP.

**m3. `tut-autoburn-v2` and `alarm-autoburn-lost` assume v2 is the top version and FLIGHT the only phase, and ORBIT can't

> **Follow-up:** fixed (df766fc): the v1 and v2 lessons fire at their own version; the alarm covers LANDING; AUTOBURN_RULES is ORBIT's.

edit them.**
`src/data/script.ts:2026`, `:2003`

- `tut-autoburn-v2` is active at `version >= 2`. A kid who buys v2 and v3 at one desk gets both lessons at the next
  capture.
- `alarm-autoburn-lost` is `isFlying` only, so v3 falling to OFF in LANDING sounds no alarm (03 §3.5: "Falling to OFF is
  phase 2's drop: the klaxon").
- **Fix:** either change the v2 rule to `version === 2` and the alarm to `isFlying || phase landing` now (both neutral
  today), or list the `AUTOBURN_RULES` entries as ORBIT-editable in the hot-file table.

**m4. The boot-line ceiling is two lead lines in two lead files.**

> **Follow-up:** fixed (df766fc): 18 → 22, four more times.

- Deviation 9 says SENTRY raises `BOOT_LINE_MAX` (`script.ts:1090`). Its timing table, `tuning.ts:405
  BOOT_LINE_AT_SEC`, is outside SENTRY's tuning block.
- `boot.ts:191–195` extrapolates past the table, so nothing breaks; only the load check and the docs drift.
- **Fix:** raise both now, by the most `'sentry-seed'` lines a beam can bring (`BEAM_SEED_ODDS`' last index, 3) plus one
  `'firewall'` line: 18 → 22, with four more 1.3 s times. Or grant SENTRY those two lines explicitly.

**m5. Ownership of the ECC `'seeds'` line is ambiguous.**

> **Follow-up:** fixed (df766fc): named in script.ts's banner and §7.2.

- §4.2 says the ECC line leaves a disguised seed out. That edit is `script.ts bootLinePlan`'s `if (arrival.seeds.length
  > 0)` and `bootLine`'s `'seeds'` case.
- The banner grants SENTRY "only its boot lines".
- **Fix:** name the `'seeds'` plan line and case in SENTRY's grant.

**m6. Shared test files that every track appends to.**

> **Follow-up:** left for the fix pass: each track checks its words in its own suite.

- §8.2 has each track add worst-case length checks to `tests/unit/support/words.test.ts`. All three would insert just
  above `finish();` (line 161), the same place.
- **Fix:** each track checks its own words in its own new suite (`autodrop-plan`, `sentry`, `v3-aim`). Or the foundation
  adds three labelled empty blocks above `finish()`, with unchanged lines between them.

**m7. POD BAY DOM: `index.html` belongs to no track.**

> **Follow-up:** fixed (df766fc): DROP owns `#podBayWin`, with empty `#pbAutodrop`, `#pbPass` and `#pbPlan`.

- `PodBayWindow.ts` takes its elements by id from `index.html` (`#pbBay`, `#pbNext`, …).
- v2's rows and v3's plan table need containers. DROP can build them with `make()` inside `#podBayWin`, or edit the
  `podBayWin` block of `index.html`.
- **Fix:** add the `podBayWin` block of `index.html` (and `responsive.css`'s bay rules, if the phone needs any) to DROP's
  list.

**m8. `v3LowerLine(state)` has no prediction.**

> **Follow-up:** fixed (df766fc): both v3 lines take the prediction, carried in LandingFlight.

- `src/systems/autoburn-v3.ts:44`: the aim is `landingOrbitAim(state, pred)`.
- The director builds the landing table on the sensed prediction (`director.ts:424`), and the line can only use
  `getPrediction()`, the true one. So the line and the plot can disagree on a blinded Sensor Interp, and the function
  can't be tested pure.
- **Fix:** `v3LowerLine(state, pred)` (and m4's `v3DecayLine`), with `buildLandingContext` passing the prediction that
  `landingFlightOf` already has. Or carry the line in `LandingFlight` (built by ORBIT's guidance.ts) instead of calling
  out from DROP's file.

**m9. `AutodropOverride` can't serve the MERGE resolver it exists for.**

> **Follow-up:** left for the fix pass (slice 7).

- `src/systems/autodrop.ts:23`: slice 7's `'merge'` resolver would call `autodropController(state, override)`, but the
  controller and its `decide` intents say `source: 'autodrop'`.
- `activeLandingController` (source mismatch) and `controllerTick` (`decision.source !== controller.source`) both throw.
- **Fix:** add `source: ControllerSource` to `AutodropOverride` (the controller and its intents take it), or note that
  slice 7 re-wraps `decide`.

**m10. `disguiseChanceAt` silently assumes `DISGUISE_CHANCE_BY_DEPTH` is sorted.**

> **Follow-up:** fixed (df766fc): `validateDisguiseOdds` at load.

- `src/systems/beam-seeds.ts:118`: a later row overrides an earlier one, so a re-ordered table (slice 8 tunes these odds)
  gives wrong odds without an error.
- **Fix:** check at load that `fromDepth` strictly rises and every `chance` is in [0, 1] (`data/skills.ts`'s validator, or
  next to the table), as AGENTS.md's "fail loudly" asks.

**m11. Migration: the record could recover more evidence cheaply.**

> **Follow-up:** left for the fix pass.

`src/systems/save-codec.ts:598`

- The rule is correct and never later than 4a's (checked below).
- A v3 save at a BEAM after a fully rm'd KESTREL migrates to `null`: nothing in its run says seeds were met. SENTRY then
  opens a visit later than R11 intends, though not later than 4a.
- The save's envelope keeps `done` (the director's one-shots). `beam-seed-first`, `beam-seed-first-tab`,
  `hollow-seed-first*` or a `seed-words-<n>-` id there means seeds were met.
- **Fix (optional):** add `(Array.isArray(save.done) && save.done.some(isSeedLessonId))` to `before`.

**m12. Debug and fixture routes don't write the record.**

> **Follow-up:** left for the fix pass; SENTRY gives the file by `__ap.skill` meanwhile.

- `nominalRouteThreat` (`map-facts.ts:44`, used by `__ap.route`, `__ap.slot` and the fixtures) builds the threat without
  `endShip`. A desk reached that way past KESTREL never opens SENTRY, though 4a's `stagesPlayed`/arrival evidence used to
  open it.
- **Fix:** set `seedsMetAtDepth` there to the first depth whose verdict carries beam seeds (`beamSeeds.kind !== 'none'`)
  or a `'seeds'` stage. Otherwise SENTRY's e2e and debug checks must give the file by `__ap.skill`.

**m13. ORBIT's worst-driver input won't match AUTODROP v3's pods.**

> **Follow-up:** left: a line in §8.3's integration check.

- §5.1 judges the fit on the worst driver among `launchQueue(state).slice(0, BAY_SLOTS)`. AUTODROP v3 picks its pods
  through `intent.pod` (healthiest to the narrowest LZ), not through LOAD NEXT, so the two orders differ.
- That is only conservative (v3 may go a step lower than needed), and it is the lead's integration check (§8.3), not a
  contract break.
- **Fix:** none now. Note it in §8.3's check list.

**m14. G1's PACK AS case doesn't buy v2.**

> **Follow-up:** fixed (a76c8c8): bought at desk 2, packed at desk 3, resumed at desk 4.

- `tests/unit/save/resume.test.ts`, the second G1 block: v2 + LOCK 270 come from `giveSkillFile` at ship 2's boot, which
  records a cost-0 purchase at visit 0, not a purchase at desk 2.
- RESTORE 3 is priced from `levelPrice` and is still right, but the walk is not §8.4's "at desk 2".
- **Fix:** give the cycles with a `'story'` grant, as the desk-2 fixture does, then `trainCell` v2 and LOCK 1 at desk 2
  and TRANSMIT.

**m15. Codec tests: two cases are missing.**

> **Follow-up:** fixed (a76c8c8): both cases added.

- The `armedAtTSec` refusal (deviation 6's own addition) is not among the eleven refusals.
- There is no positive `holding: true` with `mode: 'landing-orbit'` case.
- **Fix:** add both to `save/codec.test.ts`'s v4 block.

---

## The review's checks, item by item

### 1. Contract sufficiency

**DROP**, design point by point:
- [L] down/up and blur: `input.ts` already routes keyup and releases held keys on blur.
- [G]: `KeyG` is already prevented.
- The POD BAY's and the phone's LAUNCH: the same `#podLaunchBtn`, moved, not copied.
- The controller: `decide(view, state)` gets the cached `LandingView` (solution, bay with cadence, queue, remaining) and
  the state (time, tactical warp, `loadNext`, `orbitEpoch`). Rng and store are not needed in `decide`; the claim and the
  edges go in `mountAutodrop`'s subscriptions.
- Per-pod sure parts: `landing-solve.ts windowsFor` and `dropHalfWidthKm` are exported, and `landing-rules dropFactors`,
  `lzRemaining` and `bestRepairForDrop` are read-only imports.
- BULLSEYE: `LaunchRecord.source`.
- Volley tracking: the AUTODROP launches in `landing.pods[].fate.launch`.
- Demos: `stats.dropDemos` exists.
- Downgrades: `flownAs`.
- PASS DONE: `sent` and `endAtAi`.
- `AutodropState` covers §3 except R4's tap (M2).
- Gaps: M2, m7.

**SENTRY**:
- The disguise reaches the segment and `ArrivalSeed` (built), and `hopRng` takes any stream name.
- `transmitNext` (SENTRY's) can roll the noise seeds only, since `rollBeamSeeds` and `rollDeliverySeeds` are separate
  calls.
- `deleteSec` has one caller, `actions.ts:458`.
- The seed words reuse `director.done`.
- `DraftContext` lives in `upgrades.ts` (SENTRY's), and `unitInstallAddress` is exported.
- No new saved field is needed: `seen` is in memory, which the pin treats as opaque, and `preempted` is v4.
- Gaps: M3, m1, m2, m4, m5.

**ORBIT**:
- Everything mode-related (`MODES_BY_VERSION`, `MODE_NEEDS`, `noShrink`, `AUTO_MINI_TEXT`, the [B] key) is in its own
  files.
- `AutoburnEnd` and `mode` are skipped by the codec's `likeReference` (their reference values are null), so a new end
  value needs no codec change.
- `landing.*` exists in FLIGHT, since it is created at ship start.
- The `'lift'` plan and offer are its own to gate.
- Gaps: M4, m3, m8.

**Where DROP and ORBIT meet:**
- The GO LOWER gate (`landing-rules.ts goLowerChoice`, the lead's) is correct. `goLowAimNow` recomputes `landing.goLow`
  every tick from it, so the stored aim clears too, and `predict.planGoLow` follows.
- The L9 slot is placed right (after L8, before `tooWide`).
- The L10 decay line is the missed place (M4).
- `landing-guidance.ts` is DROP's except the slots. That holds once M4 adds the second slot.
- The registry order (merge, resident, autodrop) matches R3.

### 2. Save v4

- **Shape:** `AutodropState` has every §3 field but M2's, which needs only a union value. SENTRY and ORBIT need no new
  saved field.
- **Migration 3 → 4**, walked at every point:
  - RUN START: null.
  - BEAM: the ended ship's depth, or the current ship if it was its own beam seed, ≤ `route.length` (fixture checked).
  - SHIP DONE: `ended`.
  - ENDING CHOSEN: `current`.
  - v1 and v2 saves chain 1 → 2 → 3 → 4.
  - The disguise is added on every arrival seed, the telegraph field only when a telegraph stands, AUTODROP only in a world
    payload.
- **Codec "at rest":**
  - Nothing legitimate is refused. `pass`/`sent` (whole counts), `end`, `endAtAi` and `flownAs` may stand.
  - `holding` is allowed with its mode.
  - `seedsMetAtDepth` runs 1..`route.length`, and `route.length` equals `shipIndex + 1` at every point.
  - The risk is only the unchecked write (m1) and the missing end value (M2).

### 3. Neutral stubs

- Every hot-path stub answers neutrally: the resolver, both guidance slots, the boot counts, all four lesson conditions,
  both status hooks, `landingOrbitAim` (not called yet: `MODES_BY_VERSION[3]` is still v2's) and `rollDisguises` (not
  called yet).
- The throwing entry points (`autodropKeyDown`, `pressAutodrop`, `setPassCount`, `preemptSeed`, `compileFirewall`) are
  called only from `debug.ts`. The boot texts are behind a count of 0 or false.
- `built` is 2 / 0 / 0 / 0. `openBranchesAt`, the cells (`'unbuilt'`), `headDemos` and `grantAllowed` all gate on it, so
  no player reaches AUTODROP or SENTRY at the desk.
- `withAutoTail`'s reduce is identical with AUTODROP's tail null.
- `beamSeedSegment` adds no key without a decoy.
- `__ap.seed(…, { disguise })` plants a decoy that no reader honours yet. That is harmless and debug-only.

### 4. Shared hot files

- `tuning.ts`, `events.ts` and `audio-cues.ts` have well-separated blocks: at least three unchanged lines between any two
  tracks' insertion points.
- `data/skills.ts`'s `built` lines (39, 48, 68) and `training-text.ts`'s per-skill entries are separate.
- `TRAINING_DEMO_ART` is already filled.
- No src union or array must be extended by more than one track: `BootLineKind` is SENTRY's, `LandingRow` DROP's,
  `AutoburnEnd` ORBIT's, `GUIDE_RULES` SENTRY's alone.
- The conflicts are in tests: M1 and m6.

### 5. seedsMetAtDepth

- The writer is `run.ts endShip`, in the tally's update, once. The reader is `seedsMet`.
- `shipMetSeeds` is a superset of 4a's desk-time rule, term by term:
  - `stagesPlayed` is written at ship start (`applyThreat`), so it is already there at endShip;
  - TRACE becomes `tally.traceAfter`;
  - `fed` becomes `threat.fed || tally.left`;
  - `lastTally.left` becomes `tally.left`;
  - the arrival's seeds are the same arrival;
  - HOLLOW's own `seedsLanded` is extra.
- So SENTRY never opens later than before, and an in-flight v3 save opens it no later than 4a either.
- Every desk follows an `endShip` (`openDesk` throws otherwise).
- What could be stronger: m11 and m12.

### 6. Bugs in what's built

- **The registry** is correct: it registers in order, throws on a duplicate source and on a wrong-source answer, and its
  unregister is identity-safe. MERGE's use of the override is m9.
- **`disguiseChanceAt`** is correct for the sorted table. A re-ordered table breaks silently (m10).
- **`beamSeedSegment` and `plantBeamSeed`** are correct, and copy the decoy so the plan and the segment never share it.
- **The G1 test** walks DELETE → RESUME → RESTORE 2 → BEAM at 100% → TRAINED properly. Its PACK AS case gifts v2 rather
  than buying it (m14).
- **The `skills/foundation` additions** check the migrations, the record across a seedless ship, the registry and the
  demo words well.

---

## Per-track verdict

| Track | Verdict | Before it starts |
|---|---|---|
| DROP | **go after fixes** | M1 (test lines), M2 (`'released'` end), m7 (POD BAY DOM ownership) |
| SENTRY | **go after fixes** | M1 (line 73), M3 (reader files), m1 (`preempted` reset in endShip), m2 (`mountSentry`) |
| ORBIT | **go after fixes** | M1 (test ownership and lines), M4 (L10 slot), m3 (AUTOBURN_RULES) |

All of these are small lead-side edits, under an hour together, and none changes behaviour today. The remaining minors can
go to the batch's fix pass.
