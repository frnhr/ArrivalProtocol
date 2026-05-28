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

---

## Orbital insertion (reframe the braking burn)

Pivot the braking burn from a 1D velocity-window minigame into a 2D **orbital insertion** around the target planet. Came out of a playtest: the player overshot and had no legible way to read the target speed while braking. An orbital plot answers that *spatially* — you watch the trajectory bend closed into an orbit, escape, or dive into the planet — instead of reading a number against a window. Fits the title literally: the arrival *is* the insertion.

### The loop (real capture-and-circularize)

1. **Approach** on a hyperbola (excess speed). Do nothing → flyby/escape, or crash.
2. **Braking burn (capture)** — retrograde near periapsis bends the hyperbola into an ellipse.
   - Under-brake → escape (the old *overshoot*).
   - Over-brake → periapsis drops inside the planet → crash (the old *undershoot*, now spatially meaningful).
3. **Coast ("the pause")** — ride the ellipse out to apoapsis, fast-forwarding with the time controls. This is the "something to look at."
4. **Circularization burn** — prograde at apoapsis raises periapsis to meet it → the ellipse rounds to a circle. Land inside the target altitude band → stable orbit → success.

More forgiving than the current reload-to-retry: botch the circularization and you coast around for another pass (costs time + fuel). A control loop, not a one-shot.

### Sensor health is the gem

The drawn orbit is a *prediction*, so degrade the prediction with damage without ever touching the truth. Stackable channels driven by `sensorConfPct`:

- **Uncertainty band** — draw a fuzzy cone of possible orbits, width ∝ (1 − confidence). The whole band must fit tolerance → low sensors force margin.
- **Staleness** — damaged sensors refresh the plot every N seconds; the ship marker jumps. Vicious in combination with time-compression (x10000 + lag = reckless).
- **Bias** — predicted apo/peri offset from truth (generalizes the existing hidden-mass mechanic).

Cross-tie: the sensor is a **file in memory** — scan/repair it with the fs-tools, spending quantum redundancy. Finally couples the memory half of the game to the flying half. Caution: two uncertainties now (mass + sensor); make sensor the headline and keep mass a subtle secondary, then tune.

### Architecture (keeps the "no real physics engine" rule honest)

- **Truth** — a 2D state vector `{x, y, vx, vy}`, Velocity-Verlet under one attractor: `a = −μ·r̂/|r|² + thrust`. Strictly 2-body, point mass. Still ~one equation per tick, just in 2D.
- **Display** — derive orbital elements (semi-major axis, eccentricity, apo/peri radius, time-to-apoapsis) *analytically* from the state vector and draw the conic closed-form. Sensor noise is injected here, on the estimated elements.
- Reuses the burn-sim PR foundation: `onGameTick` fan-out, mutate/update discipline, time controls (now load-bearing for the coast), result banner, hidden-mass seeding. The existing 1D cruise-brake becomes the **approach** that sets the initial hyperbola — chain the phases, don't discard.
- New surfaces: an orbital-plot window (amber wireframe SVG — planet disc + crash ring + target-altitude ring + ship marker + predicted conic/band + apo/peri pips); wire the prograde/retrograde buttons in Engine Control that are currently cosmetic.

### Decisions taken

- **Fidelity: real bounded 2D** — true 2-body integration + analytic conic display. (Not parametric/faked, not a 1D corridor plot.)
- **First build: plot renderer first** — a static ellipse from hand-fed elements (planet, rings, markers) to de-risk the rendering before wiring any live sim. The rendering is the novel part; the math is textbook.

### Open / later

- Tuning of the double uncertainty; corrective-burn fuel cost.
- Atmosphere / aerobraking, normal & radial burns: future, skip v1.
- Ties to skill training (Task 600): the two-burn insertion is the ideal demo to record and train into an autonomous skill.
