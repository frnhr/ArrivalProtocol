# AGENTS.md — Arrival Protocol

Project context for coding agents (Claude Code reads this file when there is no CLAUDE.md). Read `DESIGN.md` before
making non-trivial changes; the full design is `docs/design-v2.md`, which source comments cite by section (`§4.5`).
The agreed direction for the next phase is `docs/PHASE3.md`.

## What this project is

A browser-based roguelike sci-fi game with a strong Uplink/Defrag aesthetic: ARRIVAL PROTOCOL // SOULCACHE. You are
UNIT-047, a caretaker AI beamed onto colony ships minutes before arrival. In amber (SHIP) you turn a red crash line into a
green orbit; in blue (MIND) you keep the 2,400 "sleeping" colonists, who are files in your own memory, from being eaten
by HOLLOW, the previous wave's caretaker. Everything is UI: windows, terminals, readouts, memory racks. No 3D scenes.

## Tech stack

- **Current**: Vite + strict TypeScript, vanilla DOM (no framework), no runtime dependencies beyond Google Fonts.
  Sound is synthesized (WebAudio). Avoid React unless a strong reason emerges.
- **Distribution**: long-term, wrap in Electron or Tauri for desktop. Web playable in the meantime (Render deploys
  `main`, see `render.yaml`).
- **Fonts**: JetBrains Mono (primary) and VT323 (retro digital display) via Google Fonts.

## Commands

- `npm run dev` — Vite dev server on port 5173 (in a headless VM: `npm run dev -- --host 0.0.0.0 --open false`).
  Add `?debug` to the URL for a warp ladder and the console helper `__ap` (`__ap.ship(1)`…`__ap.ship(4)` jump to run 1's
  HALCYON … LAST LIGHT along the worked route, run 1 only; `__ap.route([...])`, `__ap.slot(s)`, `__ap.newRun()`,
  `__ap.archiveClear()`).
- `npm run typecheck` — strict TypeScript (`tsc --noEmit`).
- `npm run build` — type check + production bundle to `dist/`.
- `npm test` — the unit tier (`tests/unit/`, under 5 minutes, enforced): every headless suite plus a strict tsc over
  them, in parallel on all cores, slowest first. The suites run the real DOM-free systems on a private store (no
  browser); the sweeps among them fly a coarse sample of their grids (`tests/unit/depth.ts`), and long setups are flown
  once and restored (`flyOnce` in `tests/unit/wp1-rules/flows.ts`; kept on disk in `tests/.out/fly-once` under a hash of every
  source and test file, so a re-run of an unchanged tree skips them; `AP_FLY_ONCE=fresh` flies them). The runner fails the run over 300 s or
  any suite over 90 s: a suite that outgrows that samples more coarsely in quick depth, it does not raise the budget.
  `node tests/unit/run.mjs wp9 -sim` runs the suites whose path contains `wp9`, minus those containing `sim`. A suite
  whose header carries `// BALANCE_ONLY: <why>` (the full run, the 200-seed playthrough, LEAD-1's sentinels) runs
  only at full depth: the quick run lists it as SKIP.
- `npm run test:e2e` — the e2e tier (`tests/e2e/`): Playwright scripts that drive the game in Chromium, against a Vite
  server the runner starts itself (`E2E_BASE_URL` to use a running one). The playthrough plays a whole run by the
  strip (keys for the SHIP, clicks for the MIND) and checks every ship's boot, flight, lines, landing (ships 1, 2 and 5 by the strip), LANDING
  REPORT, LEAVE ORBIT and the beam, then RUN END and NEW RUN; the other scenarios cover every screen, the phone layout and
  the desk. About 40 minutes, about 900 checks; logs and shots in `tests/.out/e2e/`. `node tests/e2e/run.mjs phone desk` runs
  some. Chromium: `E2E_CHROMIUM`, else `$PLAYWRIGHT_BROWSERS_PATH/chromium`, else the installed Google Chrome.
- `npm run balance` — not a test suite: the unit tier at full depth (`--full`), every sweep at the resolution its review
  round asked for, every guidance suite on all five ships, the BALANCE_ONLY suites and the 200-seed balance harness
  (`tests/unit/wp12/playthrough.test.ts`, whose hard checks are the game's balance targets). About two hours on four cores (the per-ship sweeps take most of it); run it
  when `tuning.ts` or `ships.ts` change.

Headless suites are `tests/unit/**/*.test.ts` (run with `tsx`; each exits non-zero on failure); generated output goes
to the ignored `tests/.out/`. `.tmp/` is scratch space and is git-ignored.

## Aesthetic constants

These are non-negotiable design tokens, defined as CSS custom properties in `src/styles/tokens.css`.

**Tools mode (amber CRT):**
- bg `#0a0805`, accent `#ffa726`, accent-bright `#ffd180`, text `#f5e6c8`
- Subtle scanlines and noise overlay
- Warm radial gradient ambient lighting

**Memory mode (neon blue):**
- bg `#04080d`, accent `#00d4ff`, accent-bright `#b3e5fc`, text `#d6f0ff`
- Same scanline/noise treatment, swapped to blue
- Warning color `#ff4e7a`, good color `#7dffb2`

**Layout:**
- Persistent header (mission ID + time controls + clock)
- Left dock (text-based tool launcher)
- Empty desktop with floating draggable windows in tools mode
- Continuous memory strip in memory mode
- Persistent footer (status indicators)
- Lower-left mode toggle

## Code style

- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`), vanilla DOM, no
  framework
- Prefer functions and data over classes for game state
- CSS custom properties for all theming
- Numbers that tune the game live in `src/data/tuning.ts` and `src/data/ships.ts`, each with a WHY comment
- Fail loudly: throw on states that should not happen instead of falling back silently
- Comments explain WHY, not WHAT
- Keep things readable over clever; this is a small team project

## What's built

- The galaxy map (phase 3 slice 3a, `docs/phase3/02-map.md`): one arm of 20 worlds in 8 layers; run 1 is an authored
  arm, later runs a fresh roll (`src/systems/map-generator.ts`) with ships generated from five flight templates. Years,
  hops (hits, ECC, noise; the link limit went in playtest 1), memory classes FULL / COMPACT / TIGHT, the DESK (STAR CHART,
  SHIP CARD, SET COURSE) between ships, the PACKET's room bar and the RUN TALLY. A state built with no map (the headless suites')
  is run 1's arm, the unit on authored ship n along the worked route (`state/initial.ts`, `systems/arm-fixture.ts`; Track
  RETIRE, `docs/phase3/impl/slice-4cde-plan.md` "Deviations (RETIRE)"). The classic world (phase 2's frozen five, the old
  fixture) is gone: the arm is the only world (`RunMapState.world` stays the literal `'arm'`; the save codec refuses any
  other value as `shape`). `__ap.ship(n)`, `__ap.route`, `__ap.slot` and `__ap.course` drive the arm; a suite flies a
  ship alone with `tests/unit/support/arm-ship.ts` (`fixtureShip`, `fixtureHop`, `fixtureVerdict`, `WORKED_KIT`),
  phase 2's FULL geometry with `support/hollow-world.ts phase2Ship`, and sails the desk with `support/desk.ts`.
- The repository and the INBOX (slice 3b): one request per beam from ARRIVAL CONTROL's repository (FROM EARTH: tools, spares, the
  REPAIR v2 patch); requests travel by light, so far out they trail the unit or never arrive (`src/systems/
  delivery-rule.ts`); deliveries ride the packet as chips (SEND ON), can carry seeds, and are the only source of tools
  besides REPAIR's first look. The INBOX (desk tab and flight window) holds CONTROL's replies, colony postcards and
  046's mail, all derived from the route. An ENGINE FAULT ship without Swap limps, and REPAIR calms Thrust Ctrl.
- Runs that follow each other (slice 3c): one run save at RUN START, every LEAVE ORBIT and desk, every beam and the ending, with
  RESUME on the title (a reload mid-ship replays the ship from its boot; `src/systems/save-*.ts`, `run-save.ts`).
  Archive v2 (`meta.ts`, key `meta/v2`, migrated in place) keeps the lineage; at each run's end a pure, seeded world
  update (`src/systems/map-update.ts`, matched to `docs/phase3/map-sim/`) moves the same arm on: the next unit launches
  0–35 years later, visited ships are colonies, skipped ships age or leave, new ships report home, and the last unit's
  trail, grey cross, beacon and letters are found where it went.
- The skill tree, batch 4a+4b (phase 3 slice 4, `docs/phase3/03-skills.md`; plan and deviations in
  `docs/phase3/impl/slice-4-plan.md`): four skills as data (`src/data/skills.ts`; AUTOBURN, AUTODROP and SENTRY built to
  v3 by slices 4a–4e, SURVEY by slice 6), bought with CYCLES that every ship pays (ARRIVED +1, LANDED up to +5; the LANDING
  REPORT and the LOST card say them) in the REPOSITORY's COMPILE HERE half ([T]; `TrainingWindow.ts` inside
  `RepositoryWindow.ts`, model `systems/training-model.ts`, the cycles ledger `systems/cycles-ledger.ts`): the required
  first pick at the run's first desk ([1], then ENTER: the 1.5 s bar), the grid
  from desk 2 (ENTER trains only a cell the kid picked, SPACE always sets course), UNDO until TRANSMIT ▸. Skills are files
  (`AUTOBURN.skl`) that cross in the packet: PACK AS a lower version, RESTORE at half price what was lost (eaten, deleted,
  left behind, packed lower). Graded damage costs a version per colour of damage (`capabilities.ts skillLive`), stamped
  `v2 → v1` / `RESTORED`. AUTOBURN v1 flies the capture, v2 GREEN (capture, then trims) and ROUND (`[B] makes it green; [B]
  on green makes it round`), each within its LOCK RANGE (90 / 270 / 810 tac s, the NAV PLOT's bracket), claiming a Core
  thread for each burn (`× AN OP` when none is free), never steering (`systems/autoburn.ts`).
- The skill tree, batch 4c–4e (`docs/phase3/impl/slice-4cde-plan.md` with its Deviations): desk 1 offers two cards,
  AUTOBURN v1 and AUTODROP v1, each with a looping mini-demo. **AUTODROP** (the LANDING branch, `systems/autodrop*.ts`,
  a resolver in the LandingController registry `landing-controller.ts`): v1 CENTRE (armed by [G] or the POD BAY's `AUTO ·
  CENTRE [G]` for one window since playtest 1: the volley straddles the bracket's centre, trained by the kid's own launches
  as AIM; [L] is always a plain launch), v2 PASS (the POD BAY's `A [−] 2 [+]` rows, [G], flies from the MIND too, a Core
  thread per window, its pods timed from the window's cue), v3 PLAN (the plan table and its check line; one [G], one hold
  of [F] carries the whole plan).
  **SENTRY** (the DEFENCE branch, `systems/sentry.ts`) and disguised seeds: from depth 5 a beam seed may wear a harmless
  name (`cache.tmp`, `threat-selectors.ts isDisguised`) and answers every tool as the file it shows until a SCAN, a DELETE,
  a MOVE or COPY op, or SENTRY unmasks it; v1 SIGHT names them at the boot, v2 QUICK RM halves rm on HOLLOW blocks and
  pre-empts a seed on HOLLOW's blinking outline (`PRE-EMPTED`), v3 compiles a FIREWALL.sys at every boot. **AUTOBURN v3**
  LANDING ORBIT (`systems/autoburn-v3.ts`, `data/autoburn-modes.ts MODE_RULES`): the highest round orbit where every LZ
  with room gets a sure window, a dashed ghost circle with its label, held with top-ups away from the windows, `GOES
  LOWER` when a bite widens a drop. The save is v4 (one bump for the batch).
- A full run (phase 2's, now on the arm): ships with their own rules (run 1's authored ARES-VII, HALCYON, KESTREL, VESPER
  and LAST LIGHT among them), the beam between them (transit damage, one SALVAGE card of three taken at LEAVE ORBIT), soft
  fails instead of reloads, RUN END with score, rank and ending (PURGE or MERGE), and a small local archive (unit number,
  wave, the last unit as next run's ghost).
- The threat ladder (phase 3 slice 2, `docs/phase3/04-threats.md`): ARES-VII and HALCYON are calm (driver arrival
  damage, transit hits, the `???` file that is `046.log`); KESTREL brings a seed on the beam (rm it, or it reports home
  on the TRACE meter); HOLLOW boards one hop from the final ship (or at TRACE 3) and fights
  there; the final ship is the FINALE with THE DEAL. The ladder is data (`src/systems/threat-plan.ts`), fed by the map.
- SHIP: a two-body orbital capture with a predicted path coloured by outcome, presets, hold-to-burn, a guidance line
  that always names the next step, director-paced time (CRUISE / TACTICAL, and hold [F] to fast-forward), hazard zones
  (debris, a belt).
- MIND: up to 384 blocks in up to six racks (the memory class), tools that are files (SCAN, REPAIR, MOVE, DELETE, COPY,
  SWAP: REPAIR licensed in the run, the rest by request), REPAIR CHARGE, HOLLOW (bites, walls, seeds, THE DEAL, verbs, the root duel), and the pod drivers.
- LANDING (phase 3 slice 1a, `docs/phase3/01-landing.md`): after a STABLE ORBIT each pod (200 colonists, flown by an
  8-block driver file in the MIND) is launched with [L] while the drop dot is inside a landing zone's bracket; the bay
  holds 4, a hold of [F] fast-forwards to the next window, a GROUND TRACK and a POD BAY window show it, and a LANDING REPORT scores
  every pod by where and how it landed. Pods that can't land are parked in orbit. Damage widens the drop (Sensor
  Interp, Nav Plotter, the drivers), lava and cliffs score 0, Bay Ctrl sets the cadence, a low orbit decays below the
  DRAG line, and the engine stays open: trims, GO LOWER and the lift.
- Couplings both ways: files drive the engine and instruments, threads take thrust, burning feeds HOLLOW, the orbit's
  fit is the launch band; the AI Core drives the glitch overlay.
- A phone layout (≤ 768 px), reduced motion, synthesized audio.
- **Playtest 1** (Fran's 24 notes on 07c1343; `docs/phase3/impl/playtest-1-plan.md`, every track's Deviations, and
  OPEN-DECISIONS 123–174). Batch A, the quick fixes:
  - A-WORDS: no meta-lingo (a `meta` rule in `support/words.test.ts`), `STABLE ORBIT` for ORBIT LOCKED, `PASSED OVER ONCE`
    for the runs on the chart, `SLEEP 89 YRS` for "years early", `NOT IN YOUR PACKET`, and `??? WILL FIND YOU` until
    HOLLOW is named;
  - A-UI: every amber window's × closes it (the − is gone), MANUAL Q/E stops when let go, the belt is one steady bed of
    noise and static (geiger only on hits), `ERASE ALL RECORDS` on the title, the dock's `Mind`;
  - A-LAND: the launch band's view fixed per orbit with crisp edges and an amber in-band path, `DOT OFF-SITE` / `LZ-A
    FULL`, the REPOSITORY's `YOU HAVE n · n ON THE WAY`, the +12 REPAIR CHARGE card counted after the arrival floor, and
    the centred over-plan confirm (`[L] YES  [N] NO`).

  Batch B, the redesigns:
  - B-TIME: hold [F] to fast-forward (`pace.ts`): HARD stops end the hold, SOFT stops dwell and go on, WAIT stops let a
    controller fly its window, and zones and story beats run CAPPED; the tap SKIP stays only for controllers and harnesses;
  - B-DROP: AUTODROP v1 is an arm button ([G], the POD BAY's `AUTO · CENTRE [G]`), [L] is always a plain launch, v2 times
    its pods from the cue, and no WIDE [L] while an arm still has a launch to fly;
  - B-VOICE: ARRIVAL CONTROL is official and cold (no `:)`), and PAL, the companion (CHIPPER, DEADPAN, WORRIER;
    `data/companion-text.ts`, `systems/companion.ts`), keeps the personality;
  - B-DESK: one REPOSITORY with FROM EARTH over COMPILE HERE, and a cycles ledger that adds up to the bank;
  - B-ORDER: LEAVE ORBIT (`LeaveOrbitScreen.ts`, `systems/leave-orbit.ts`) comes after the report and before the desk, with
    the SALVAGE deal held in `run.leave` and its grants at ENTER; the PACKET opens only when `transmit.ts packetAsks` has a
    question, else SET COURSE beams at once; no link limit (the destination's room is the one limit). Save v10
    (`RUN_SAVE_MIGRATIONS[9]`: the link fields, `run.leave`, the resume stage, AUTODROP's `held` and end `released`).

## Designed but not built (deliberately deferred)

- Aerobraking and an ENTRY gauge; moons, slingshots, binary stars (TASK 800); a solar
  flare; the encrypted-fragment hunt; a sector map; LLM-trained skills (AUTOBURN is the deterministic stand-in); a mid-run
  save; mass uncertainty as a readable upgrade; alien contact and colony prep.

## Next logical steps

1. **Fran's playtest**: one full run by `docs/playtest-checklist.md`.
2. **Phase 3** (`docs/PHASE3.md`, specs in `docs/phase3/`, plans and deviations in `docs/phase3/impl/`) is built
   through slice 8:
   - 1a/1b landing, 2 the calm opening, 3a–3c the galaxy map, the repository, the save and the arm;
   - 4 the skill tree (AUTOBURN, AUTODROP, SENTRY, SURVEY);
   - 5 resident AIs;
   - 6 SURVEY;
   - 7a–7d the endings, THE LAST LANDING, next-run traces and lineage, signals and CONTACT;
   - the classic world retired;
   - 8 the first rebalance pass.

   Playtest 1's Batch A and Batch B are built and merged (above). Every call made without Fran is in
   `docs/phase3/OPEN-DECISIONS.md`. The latest balance report is `docs/phase3/impl/balance-report-playtest1.md` (with a
   before / after Batch B comparison against `balance-report-slice8.md`); re-run it with
   `npm run balance:report -- --quick`.
   The next steps:
   - Fran plays the Batch A + B build by `docs/playtest-checklist.md` (items 50–60 are new);
   - playtest 1's Batch C: C-UNROLL (the self-check unroll, notes 13 and 17, plan §3.5) and C-SITES (open a site as an LZ,
     note 18, plan §3.13), after B;
   - Fran's answers to the ASK and [FRAN] items (OPEN-DECISIONS 123–174 among them);
   - MERGE's price re-read against the balance report (16 or back to 20, OPEN-DECISIONS 108, 131, 174);
   - SLOPPY's win rate (OPEN-DECISIONS 103);
   - a full-profile balance run (`npm run balance`, due after Batch B).
3. **The refactors parked until after the playtest** (discuss the split before writing code): `src/data/script.ts`
   into its text and its director rules, `src/styles/game.css` by surface, `tuning.ts` and `script.ts` grouped by
   domain.
4. **The deferred designs** above, as the playtest asks for them.

## Task tracking

Tasks live in `.claude/TASKS.md`; see its header for the numbering and status-icon conventions.

## External tools

- **Cinematic intro video generation**: Pixverse — https://app.pixverse.ai/

## Working preferences

- Show specific options before committing to large refactors
- Build small playable vertical slices before adding breadth
- Keep the Uplink "spreadsheet that feels dangerous" philosophy — UI tension, not simulation depth
