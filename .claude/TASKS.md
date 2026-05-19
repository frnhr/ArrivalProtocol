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

## 500. Add software cores system to limit and progress parallel tool execution ⬅️

## 600. Automatic skill development mechanic with tool progression ⬅️

See [TASK-600-skill-development.md](TASK-600-skill-development.md) for details.
