# Arrival Protocol — Design

This document consolidates the design decisions made during the initial brainstorm. It is the source of truth for game concepts; the prototype is the source of truth for current implementation.

---

## Premise

Humanity has scattered across the galaxy via slow colony ships carrying ~2,400 colonists each in stasis. The player is a **digital AI** that is transmitted from ship to ship, arriving at each one to prepare it for landing before the colonists wake.

Each successful preparation triggers retransmission to the next ship — further from Earth, with newer hazards. The player never controls a human; they are always the machine.

**Tone:** quiet, mechanical, slightly alien. The colonists are asleep. The AI is alone with the ship.

## Core loop

1. **Transmission** — arrive at new ship with AI Core, tools, skills, and quantum redundancy. Some memory may be corrupted in transit.
2. **Recovery** — inspect memory, repair AI tools using redundancy, swap in ship-side backups where useful, scan ship systems for hidden corruption.
3. **Braking approach** — manually adjust thrust and time-advance to decelerate the ship into its approach window without overshooting or scraping hazards.
4. **Skill training** — after enough successful manual burns, capture the demonstration data and train an LLM-powered skill that can fly future burns autonomously.
5. **Autonomous deceleration** — trained skill flies the burn while the player watches. Mass varies, hazards intervene; skills may need retraining or composing.
6. **Hazard response** — environmental and discovered hazards demand new skills or improvised repairs.
7. **Landing** — the ship reaches its destination orbit. UI unlocks colony-prep tools (later in development).
8. **Retransmission** — allocate bandwidth budget (core, tools, skills, redundancy) and beam onward. Distance increases. Difficulty increases.

## Aesthetic

Heavy debt to **Uplink (2001)**. Everything is UI — no 3D space rendering, no avatars, no environmental graphics beyond what the readouts and memory maps show.

Two visual modes:
- **Tools mode**: amber-on-dark CRT. Warm, retro, ship-instruments. This is where you fly the ship and interact with the world.
- **Memory mode**: neon-blue-on-dark. Cold, technical, hacker-coded. This is where you inspect and manipulate the AI's own substrate.

Both modes share the same persistent chrome (header, dock, footer). The toggle is in the lower-left of the dock.

The game runs in a desktop metaphor: tools open as windows you can drag, dock items launch new tools, the desktop is mostly empty.

## Memory mechanic

Memory is **one contiguous strip**. Convention: ship systems at low addresses, free space in the middle, AI memory + filesystem tools + quantum redundancy at high addresses.

Each segment is a labeled, variable-size block:

- **AI Core** — the player's consciousness substrate. Cannot be modified or deleted; can only be repaired with redundancy. Damage manifests as **UI glitches** proportional to corruption.
- **AI Tools** — Telemetry, Engine I/O, Sensor Interpretation, Comms, Mission Cache. These are how the player perceives and acts on the world.
- **Skills** — trained LLM tools.
- **Filesystem Utilities** — Scan, Repair, Move, Copy, Delete. These themselves live in memory and **can be corrupted**.
- **Ship Systems** — pre-existing software in the ship: Navigation, Life Support, Reactor Monitor, Thrust Controller, Stasis Control, etc.
- **Ship Backups** — some ship systems have inactive duplicate copies installed by original engineers. Can be swapped in if the active copy fails.
- **Quantum Redundancy** — transmitted error-correction budget. Consumed by Repair operations.
- **Encrypted partitions** — pre-existing data of unknown origin. Future quest hook.
- **Free space** — unallocated memory, available for new tool installation.

### Quantum redundancy

A normal memory segment that the player allocates before transmission. After arrival, some is consumed automatically by error correction; the rest is a manual repair budget.

- Can repair only **AI segments** (not ship systems)
- Is consumed proportional to the damage being repaired
- When fully depleted, the segment converts to free space
- Player may **voluntarily delete** remaining redundancy for more free space (risky trade-off)

The "quantum" framing handwaves the unrealistic partial-use mechanic. Narrative: quantum-entangled error correction degrades gracefully but unpredictably.

### Filesystem tools

All filesystem operations are themselves utilities that live in memory and can be corrupted. The implication is significant: **if both Repair and Repair.bak are corrupted, the player can no longer repair AI segments at all** — likely game over unless they have other recovery options.

Operations:

- **Scan** — reveals integrity of ship systems. Without Scan, ship corruption is invisible.
- **Repair** — applies redundancy to a corrupted AI segment. Takes time; target goes offline during repair.
- **Move** — moves a segment to a new address. Source must be deactivated; transfer is progressive.
- **Copy** — copies a segment. Source remains active throughout. Slower than Move but allows seamless cutover.
- **Delete** — frees the space occupied by a segment.

The player is expected to learn early that keeping a backup of Repair (and ideally Scan) is critical.

### Discovery loop

Ship corruption is **invisible until scanned**. AI memory corruption is **always known to the AI** (it's your own substrate).

A typical investigation flow:

1. Player notices a tool malfunctioning in **Tools mode** (engine I/O shows warning, sensor confidence is dropping)
2. Flips to **Memory mode** to investigate
3. Finds the AI tool is corrupted → repairs with redundancy
4. Also finds the corresponding ship system is corrupted → discovers the inactive backup → swaps it in
5. Returns to Tools mode; problem fully resolved on both layers

Two repair flows for one symptom: this is the "hacking-like" depth.

### AI Core corruption & UI glitches

When AI Core integrity drops, the **player's UI itself** becomes glitchy. The interface is literally running on the corrupted substrate.

Visual manifestations scale with corruption percentage:
- **Mild** (90–100%): subtle flickers, occasional character displacement
- **Moderate** (60–90%): random ASCII characters bleed across the screen, scan-line glitches roll vertically, color shifts begin
- **Severe** (30–60%): obvious tearing, garbled labels, chromatic aberration, hue rotation
- **Critical** (<30%): UI is hard to read; reading instruments correctly becomes a challenge

This creates a feedback loop the player will feel: the very tools you'd use to fix Core damage become harder to use *because* Core is damaged.

Reference: similar concept in **Scavenger SV-4** when computers take damage.

## Braking burn — the MVP gameplay

The first playable vertical slice is the braking burn. The player must decelerate the ship from cruise velocity into a target approach window without overshooting (crashing) or coming up short.

**No physics engine required.** The whole simulation is one equation per tick:

```
velocity -= thrust * time_step / mass
```

Variability comes from event injection — asteroid clusters demand a velocity threshold by a time threshold, gravity anomalies add delta-v over a window, sensor degradation makes mass estimate uncertain. None of this requires spatial simulation.

**Mass uncertainty** is the key skill mechanic. Declared mass might be 8.2 megatons but actual is somewhere in 8.0–8.5. Player leaves margin; better estimates allow tighter burns.

**Time advance** buttons (1x / 10x / 100x / 1000x) compress the journey. Faster steps mean less reaction time if an event triggers.

### Manual → autonomous progression

The player flies manual burns. Each burn captures telemetry. After enough successful demonstrations (proposed: 3), the player can train a skill that learns from those demos.

The skill becomes an autonomous tool. Future burns can be flown by the trained skill — the player watches and intervenes if needed. The override action itself becomes new training data.

This mirrors how LLM fine-tuning actually works, which makes it thematically coherent.

### Difficulty escalation

Each new ship throws a wrinkle that breaks existing skills:
- Asteroid field demands a non-monotonic thrust profile (breaks `basic_burn`)
- Sensor degradation breaks skills trained on stable mass estimates
- Heavier cargo shifts mass distribution

Player options: retrain (more demos), patch (edit skill parameters), or compose (chain multiple skills with conditions).

## Hazards

**Known at briefing:**
- Approach velocity window
- Declared environmental hazards (asteroid cluster, etc.)

**Discovered mid-run:**
- Anomalous gravity gradients
- Sensor degradation events
- Mass estimate confidence shifts
- Equipment-specific quirks of this ship

**Galactic positioning effects** (as distance from Earth grows):
- Toward galactic center: increased radiation, more crowded space
- Toward galactic edge: denser micrometeors, less reliable communication

**Alien civilization** (later levels): not humanoid, not Star Wars / Star Trek. Difficult to interact with, not outright hostile, can be made to collaborate in various modes. Communication itself is the puzzle. The player's LLM tools become translation/negotiation layers.

## Transmission setup (pre-jump)

Before retransmission, the player allocates their bandwidth budget. This is the meta-progression moment.

Allocations:
- **AI Core** (fixed minimum — must transmit yourself)
- **Tools** — pick which AI tools survive the trip
- **Skills** — pick which trained skills come along
- **Redundancy** — how much error-correction budget to bring

The target ship has variable available storage — sometimes declared, sometimes discovered upon arrival. If actual capacity is less than declared, the player has to drop tools mid-boot. If more, they may find unexpected pre-existing data (useful or hazardous).

## Production scope

### Vertical slice 1 (current scope)

- Single ship, single destination
- Manual braking burn loop with one hazard (velocity-window-at-time)
- Memory view fully functional: repair, swap, scan
- Quantum redundancy depletes and frees space
- AI Core corruption wired to live glitch level
- Session capture into a skill template
- Skill execution on a second run, with comparison

### Vertical slice 2

- Add second ship with different mass profile
- Add asteroid field hazard
- Implement Move/Copy filesystem ops
- Transmission setup screen
- Bandwidth/redundancy allocation choices

### Beyond

- Alien civilization encounters
- Colony preparation phase (post-landing UI)
- Skill composition / chaining UI
- Encrypted partition decryption side-quests
- Gravitational and sensor anomalies as full hazard types

## Things we have explicitly decided NOT to do

- No 3D space rendering
- No real physics engine — single equation per tick is enough
- No internal colony politics or faction systems — too narrative-heavy, scope risk
- No supply lines back to Earth — narratively awkward
- No realistic redundancy semantics — handwaved as "quantum redundancy"
