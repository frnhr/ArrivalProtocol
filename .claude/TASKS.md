# TASKS.md

This file provides a list of tasks and TODOs in the codebase. It serves as a reminder for developers working on the project.

### About task numbers

They are mostly meaningless. When adding a new task, and it's supposed to go between existing tasks, just choose a number between those tasks' numbers and do not edit existing task numbers.

When adding a new task, add 100 to the last task number, and round up to the next 100 (so that there is at least 100 numbers between the tasks, and the new task is a round number with "00").


### Task status icons

When creating a task, mark it by appending ⬅️ emoji to the title.

When starting a task, mark it with 🈺 emoji. Do this first, before any other actions or tools.

When a task is finished (and confirmed by the user that it works, not before), mark it with ✅ .

Tasks marked with ❎ are postponed or canceled.

Never add implementation details unless explicitly asked to. Only update the emoji.


### Dependent tasks

If a task is dependent on another task(s), add the relevant numbers after the status icon, e.g:
```
## 200. Implement user model ⬅️

## 300. Add authorization ⬅️ 200
```

If a task has multiple direct dependencies, list all number, CSV list. Include only direct dependencies (no need to track second-order dependencies).

When finalizing a task, always update dependencies as appropriate (remove the task that 's being finalized form dependencies in other tasks)


## 100. Add Activate and Deactivate file system tools ✅

## 200. File move tool should work across free space chunks ✅

## 300. AI glitch animations affected only decoratively by in-game clock and paused on pause ✅

Also, the glitches should be much more severe. The UI is very slightly hard to read at 100% now. Should be totally unreadable at 100%, and very hard to see what's what at 50%. Current 100% is ok for about 15%.

## 400. Ensure all files can be scanned and improve initial health display ✅

See [TASK-400-scannable-files.md](TASK-400-scannable-files.md) for details.

## 500. Add software cores system to limit and progress parallel tool execution ✅

## 600. Automatic skill development mechanic with tool progression ⬅️

See [TASK-600-skill-development.md](TASK-600-skill-development.md) for details.

## 700. Tighter coupling between tools and their backing files ⬅️

Deleting a tool's backing file should make the corresponding tool vanish from the UI (dock launcher + window), not just go inert. Design to work out first:
- Multi-copy behavior: some tools/systems have multiple copies (e.g. Repair + Repair.bak, ship-system backups). Does the tool stay available while ≥1 copy exists, and only vanish when the last copy is deleted?
- How a dock launcher / window maps to "any copy present" vs one specific segment.
- Relationship to deactivation (inactive file → tool disabled) vs deletion (file gone → tool removed).

## 800. Multi-body gravity system — feasibility & implementation planning ⬅️

Plan and implement a multi-body gravity model for the approach & orbit-insertion phase of travel. The most common case is arriving in a sun-bound (heliocentric) orbit and then performing the maneuvers needed to drop into orbit around the target planet.

Complications to consider and design for:

- **Dual-star system** — two gravitational primaries at the system level.
- **Moon orbiting the target planet** — a secondary body around the destination creates additional perturbations and may itself be a valid orbit target.
- **"Nemesis"-type planet** — a body sharing the target planet's orbital radius but located at the opposite side of the orbit (e.g. a Trojan or co-orbital companion).

## 900. Damaged engine control — thrust deviation effects ⬅️

Adjust the effects of a damaged engine control tool to produce realistic, damage-scaled thrust noise:

- **Random short deviations** — brief spikes/dips of actual thrust away from the set value, including when the set value is zero (ghost thrust).
- **Sticking chance** — each deviation has a probability of persisting (becoming the new effective thrust level) rather than snapping back.
- **Game-time scheduling** — deviations must fire on game-time intervals, not wall-clock time; needs care at high warp factors (×1 M) where ticks are large and naive timers will miss or bunch events.
- **Damage-scaled parameters** — the worse the damage, the higher the deviation frequency, the larger the amplitude, and the higher the sticking chance; gated thresholds apply (e.g. sticking cannot occur below ~20% damage, ghost-thrust only above some threshold, etc.).
