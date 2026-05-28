# AGENTS.md

## Cursor Cloud specific instructions

**Arrival Protocol** is a client-side-only roguelike browser game (no backend, no database). All dev commands are in `package.json`:

- `npm run dev` — Vite dev server on port 5173 (add `-- --host 0.0.0.0 --open false` in headless environments)
- `npm run typecheck` — TypeScript strict type checking (`tsc --noEmit`)
- `npm run build` — type check + production bundle to `dist/`

There are no lint or test scripts configured; `typecheck` is the primary static analysis check.

When starting the dev server in a Cloud Agent VM, pass `--open false` to avoid trying to open a browser, e.g.:
```
npm run dev -- --host 0.0.0.0 --open false
```

Task tracking lives in `.claude/TASKS.md` — see its header for conventions on task numbering and status icons.
