# CLAUDE.md — Arrival Protocol

Project context for Claude Code. Read `DESIGN.md` for the full game design before making non-trivial changes.

## What this project is

A browser-based roguelike sci-fi game with strong Uplink/Defrag aesthetic. The player is an AI being transmitted between colony ships across the galaxy. Gameplay lives entirely in a UI of windows, terminals, and memory maps — no 3D scenes.

## Tech stack

- **Current**: single-file `prototype.html` (vanilla HTML/CSS/JS, no build, no dependencies beyond Google Fonts)
- **Likely target**: still vanilla until the core loop is locked in; then probably a small build (Vite + plain JS/TS, or maybe Svelte). Avoid React unless a strong reason emerges
- **Distribution**: long-term, wrap in Electron or Tauri for desktop. Web playable in the meantime
- **Fonts**: JetBrains Mono (primary) and VT323 (retro digital display) via Google Fonts

## Aesthetic constants

These are non-negotiable design tokens. Lifting these from `prototype.html` into CSS variables is one of the first refactors worth doing.

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

- ES6+ vanilla JS, no transpilation needed yet
- Prefer functions and data over classes for game state
- CSS custom properties for all theming
- Comments explain WHY, not WHAT
- Keep things readable over clever; this is a small team project

## What's prototyped vs designed-but-not-built

**Prototyped and working in `prototype.html`:**
- Two-mode UI with reskin on toggle
- Continuous memory strip with variable-size segments
- Filesystem tools as memory residents (Scan, Repair, Move, Copy, Delete)
- Interactive repair flow with offline state and progress bar
- Quantum redundancy block that depletes and frees space when exhausted
- AI Core corruption demo (slider in detail panel) with full glitch overlay
- Ship-system backup swap mechanic
- Scan-required ship status (corruption invisible until scanned)
- Tools-mode windows: Telemetry, Engine Control (with thrust slider, time controls)

**Designed but not yet implemented:**
- The actual braking burn simulation loop (math is just `velocity -= thrust * dt / mass`)
- Move/Copy file operations with progressive transfer animations
- Transmission setup screen (allocate bandwidth between core/tools/skills/redundancy)
- Skill-training UI (capture session data → produce reusable skill)
- Autonomous skill execution view (player watches AI fly the burn)
- Hazard events (asteroid clusters, gravity anomalies, alien encounter)
- AI Core integrity wired to live glitch level (currently demo-only)
- Inter-level transmission scene
- Mass uncertainty as a real gameplay constraint

## Next logical steps

1. **Refactor `prototype.html` into a sensible structure.** Single file is too big now. Suggested: `index.html`, `styles/` (variables, layout, tools-mode, memory-mode), `src/` (state, memory, fs-tools, burn-sim, glitch). Discuss split before writing code.
2. **Implement the burn simulation loop** so the time-advance buttons actually do something meaningful.
3. **Add Move/Copy animations** in memory view — same pattern as the existing repair-bar fill, but bidirectional between source and destination.
4. **Wire AI Core integrity** to the glitch overlay so damage in gameplay actually causes the UI to degrade.

## External tools

- **Cinematic intro video generation**: Pixverse — https://app.pixverse.ai/

## Working preferences

- Show specific options before committing to large refactors
- Build small playable vertical slices before adding breadth
- Keep the Uplink "spreadsheet that feels dangerous" philosophy — UI tension, not simulation depth
