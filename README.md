# Arrival Protocol

A roguelike sci-fi game where the player is an AI being transmitted between colony ships across the galaxy. Each run is the next ship; each ship is further from Earth and stranger than the last. The player programs LLM-powered skills to handle deceleration, hazards, and colony preparation before the colonists wake.

Heavy aesthetic debt to *Uplink* (2001): the entire game lives in a UI of windows, terminals, and memory maps. No 3D space rendering — the readouts carry the drama.

## Current state

Early prototype. `prototype.html` is a single-file mockup of the in-flight UI, covering:

- A two-mode desktop: **TOOLS** (amber CRT, where you fly the ship) and **MEMORY** (neon blue, where you inspect and repair the AI's own memory)
- An interactive repair flow (offline → progress bar → repaired) consuming quantum redundancy
- A filesystem-tools-as-memory-segments mechanic (Scan, Repair, Move, Copy, Delete all live in memory and can themselves be corrupted)
- A glitch overlay demonstrating AI Core corruption effects

See `DESIGN.md` for the full design rationale and `CLAUDE.md` for working notes.

## Running

Open `prototype.html` in a browser. No build step.

```
open prototype.html      # macOS
xdg-open prototype.html  # Linux
```

## Origin

The design and prototype were developed in conversation with Claude (web). Continuing development in Claude Code from here.
