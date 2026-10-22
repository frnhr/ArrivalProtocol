# AGENTS.md — Arrival Protocol

Project context for coding agents (Claude Code reads this file when there is no CLAUDE.md). Read `DESIGN.md` before
making non-trivial changes; the full design is `docs/design-v2.md`, which source comments cite by section (`§4.5`).

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
  Add `?debug` to the URL for a warp ladder and the console helper `__ap` (`__ap.ship(1)`…`__ap.ship(4)` jump to
  HALCYON … LAST LIGHT, `__ap.newRun()`, `__ap.archiveClear()`).
- `npm run typecheck` — strict TypeScript (`tsc --noEmit`).
- `npm run build` — type check + production bundle to `dist/`.
- `npm run test:smoke` — the fast headless subset (about 2.5 minutes): strict tsc over the tests, every quick suite,
  and one whole five-ship run.
- `npm test` — every headless suite (1.5–3 hours: the per-ship sweeps and the 200-seed playthrough are slow).
- `npm run test:browser` — scripted browser checks against a running dev server (`TEST_BASE_URL`, default
  `http://localhost:5173/`).

Tests live in `tests/` (headless suites are `*.test.ts`, run with `tsx`; each exits non-zero on failure; generated
output goes to the ignored `tests/.out/`). The 200-seed balance harness is `tests/wp12/playthrough.test.ts`; its hard
checks are the game's balance targets. `.tmp/` is scratch space and is git-ignored.

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

- A full run: five ships (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT), each with its own rule, TRANSMIT between
  them (a link budget, transit damage, one card of three to carry), soft fails instead of reloads, RUN END with score,
  rank and ending (PURGE or MERGE), and a small local archive (unit number, wave, the last unit as next run's ghost).
- SHIP: a two-body orbital capture with a predicted path coloured by outcome, presets, hold-to-burn, a guidance line
  that always names the next step, director-paced time (CRUISE / TACTICAL / SKIP), hazard zones (debris, a belt).
- MIND: 384 blocks in six racks, tools that are files (SCAN, REPAIR, MOVE, DELETE, COPY, SWAP, licensed through the
  run), REPAIR CHARGE, HOLLOW (bites, walls, seeds, THE DEAL, verbs, the root duel), the colonist reveal and printing.
- Couplings both ways: files drive the engine and instruments, threads take thrust, burning feeds HOLLOW, the orbit's
  fit is the printer range; the AI Core drives the glitch overlay.
- A phone layout (≤ 768 px), reduced motion, synthesized audio.

## Designed but not built (deliberately deferred)

- Aerobraking and an ENTRY gauge; AUTOBURN v2 (trims to green); moons, slingshots, binary stars (TASK 800); a solar
  flare; the encrypted-fragment hunt; a sector map; LLM-trained skills (AUTOBURN is the deterministic stand-in); a mid-run
  save; mass uncertainty as a readable upgrade; alien contact and colony prep.

## Next logical steps

1. **Fran's playtest**: one full run by `docs/playtest-checklist.md`.
2. **The story revision** Fran has in mind (angles that allow longer runs), on top of the current mechanics.
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
