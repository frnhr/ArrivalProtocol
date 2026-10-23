# Arrival Protocol // SOULCACHE

A roguelike sci-fi browser game. You are UNIT-047, a caretaker AI that ARRIVAL CONTROL beams onto colony ships minutes
before they arrive. The 2,400 sleeping colonists on each ship are files in your own memory, and something in that memory
is eating them: HOLLOW, the caretaker of the wave before yours.

Heavy aesthetic debt to *Uplink* (2001): the whole game lives in a UI of windows, terminals and memory maps. No 3D space
rendering; the readouts carry the drama.

## The game

- **SHIP (amber):** fly a two-body orbital capture. Turn the predicted path green, inside the ring where the bio-printers
  can reach. Presets, hold SPACE to burn, a guidance line that always names the next step, and a director that paces
  time (CRUISE, TACTICAL, SKIP).
- **MIND (blue):** 384 blocks of memory in six racks. Your tools are files (SCAN, REPAIR, MOVE, DELETE, COPY, SWAP).
  HOLLOW eats the file next to it; four free blocks stop it.
- The two halves pull on each other: burning feeds HOLLOW, damaged files weaken the engine and the instruments, and the
  orbit's fit decides how many colonists can be printed.
- One run is five ships (ARES-VII, HALCYON, KESTREL, VESPER, LAST LIGHT), each adding one rule, and it ends in a duel
  with HOLLOW and a choice: PURGE or MERGE.

`DESIGN.md` is the short design; `docs/design-v2.md` is the full one; `docs/playtest-checklist.md` walks a full run.

## Running

```
npm install
npm run dev          # Vite dev server on http://localhost:5173/ (add ?debug for the __ap console helper)
npm run build        # type check + production bundle to dist/
npm test             # unit tier: every headless suite, in parallel (under 5 min)
npm run test:e2e     # e2e tier: a whole run and every screen played in Chromium (~15 min)
npm run balance      # the full-resolution sweeps and the 200-seed balance targets (about two hours)
```

The original single-file mockup is preserved at `legacy/prototype.html` as a behavioural reference.

## Origin

The design and the first prototype were developed in conversation with Claude (web); development continued in
Claude Code, including the 2026-10 overhaul into SOULCACHE.
