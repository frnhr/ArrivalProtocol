# IDEAS

Scratch pad for ideas that come up during development but are not ready to build yet. Move items out of here and into a plan or directly into code once they're ripe.

---

## Inline confirmation for destructive tools

Some filesystem tools should require an inline yes/no confirmation before they actually fire. Candidates:

- **Delete** — obvious; irreversible.
- **Move** — deactivates the source file during transfer, which can be disruptive mid-burn.

The confirmation should live on the floating tool pill (the one that sticks to the cursor) *before* it transforms into the progress bar. Flow:

1. Player picks up the tool — pill follows cursor.
2. Player clicks a valid target.
3. Pill anchors to the target file and shows a compact `[ ✓ ] [ ✗ ]` prompt (or `yes / no`).
4. On confirm → pill morphs into the progress bar and the op begins.
5. On cancel → tool returns to cursor-stick state (or fully drops, TBD).

Open questions:
- Does the cancel path keep the tool active on the cursor, or drop it entirely? Probably keep active — feels less punishing for misclicks.
- Should the confirmation also appear for Copy? Copy is non-destructive but it consumes free space; maybe not worth a prompt.
- Keyboard shortcuts (Enter to confirm, Esc to cancel) would be nice once we have any keyboard interaction.

---

## Random memory damage hazards

Two distinct sources of randomized memory corruption, both expressed as per-tick chance of damaging a random memory segment (any AI tool, fs-tool, redundancy block — possibly even AI Core).

### 1. Radiation (environmental)

Mission-level hazard, present on certain runs. Some destinations sit in radiation-heavy regions (near a pulsar, inside a dust-shielded but cosmic-ray-soaked corridor, etc.). While the hazard is active, every game tick has a small chance of flipping bits in a random memory location.

- Telegraphed in the mission briefing for *known* radiation zones.
- *Unknown* radiation pockets discovered mid-burn create a panic moment — player has to notice the damage accumulating and decide whether to keep burning, divert resources to repairs, or accept the loss.
- Could be countered by a transmitted "shielding" tool/segment, or by parking in the lee of a planet/asteroid (ties into future hazard navigation).

### 2. Electrical-system corruption (ship-side)

There's a ship system module — call it **Power Regulator** or **EM Shielding** — that lives in the ship-side memory range. While healthy, it suppresses electrical noise from the ship's own power systems. While damaged, it leaks: per-tick chance to corrupt a random memory segment elsewhere.

- Creates a **runaway damage feedback loop** — if the regulator itself takes damage from its own leakage, the chance ramps up. Untreated, the ship eats itself.
- Forces a priority decision: do you repair the regulator first (stop the bleeding) or the tool you actually need for the next burn step?
- Like other ship systems, may have a backup copy somewhere in memory the player can swap in instead of repairing.
- Hidden by default — needs a Scan to even see the regulator's state. A player who never scans might attribute the random damage to radiation and miss the real cause.

### Design notes

- Both hazards share the same underlying mechanic (per-tick RNG → pick a segment → reduce integrity), so they're cheap to implement together.
- The two are differentiable in-fiction: radiation is announced (or discoverable as an environmental fact), regulator damage is a ship-internal cascade that the player has to diagnose.
- Need to decide damage distribution: uniform across segments, or weighted (e.g., larger segments more likely, since they have more "surface area").
- AI Core damage from these effects feeds directly into the glitch overlay — chef's kiss for a doom-spiral scenario.
