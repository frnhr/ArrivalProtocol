// Guard (slice 5 review fix pass, review item 5 and architecture item 4): data/ships.ts, and the classic five's load
// (data/classic-five.ts), never reach a stateful system again. Slice 5 met the trap twice (WARDEN's Deviation 1, KIN's
// lead patch): data/ships.ts imported systems/zones for a load-time check, that system reached state/actions → the
// residents' dispatcher → a resident module → hollow.ts → carry.ts → classic-five, and classic-five's own load-time check
// then ran before data/ships.ts had loaded (`__name is not a function` in every suite). data/zone-check.ts broke the
// cycle; this suite keeps it broken.
// • Statically: the runtime import graph of src (type-only imports dropped: tsx erases them), walked from both roots, may
//   reach only data/*, types/* and the few pure helpers listed below, and data/ships.ts must not reach classic-five.
// • Dynamically: then this file's one game import, data/ships.ts, is loaded alone (no harness, no store). It is a dynamic
//   import so the static checks print first: a cycle would throw at the load.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { check, finish } from '../landing/checks';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');
const ALIASES: readonly [string, string][] = [['@state/', 'state/'], ['@systems/', 'systems/'], ['@data/', 'data/'], ['@components/', 'components/'], ['@/', '']];

// The modules outside data/ and types/ that a data module may load: pure helpers with no module state and no import of a
// system with state. A new entry needs the same proof (its own imports are walked here too).
const PURE_HELPERS = new Set(['state/selectors.ts', 'systems/memory-ops.ts', 'systems/rng.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string | null = null;
  for (const [alias, dir] of ALIASES) {
    if (spec.startsWith(alias)) {
      base = join(SRC, dir + spec.slice(alias.length));
      break;
    }
  }
  if (base === null) {
    if (!spec.startsWith('.')) return null;    // a package (none at run time today) or node:
    base = resolve(dirname(from), spec);
  }
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  return null;
}

// Runtime edges only: `import type`, and `import { type A, type B }` with nothing else, are erased by tsx.
function runtimeImports(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const out: string[] = [];
  const from = /^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+'([^']+)'/gms;
  for (let match = from.exec(text); match !== null; match = from.exec(text)) {
    if (match[1] !== undefined) continue;
    const body = match[2]!.trim();
    if (/^\{[^}]*\}$/.test(body) && body.replace(/[{}\s]/g, '').split(',').filter(Boolean).every((name) => name.startsWith('type'))) continue;
    const target = resolveSpec(path, match[3]!);
    if (target !== null) out.push(target);
  }
  const bare = /^\s*import\s+'([^']+)'/gm;
  for (let match = bare.exec(text); match !== null; match = bare.exec(text)) {
    const target = resolveSpec(path, match[1]!);
    if (target !== null) out.push(target);
  }
  return out;
}

const graph = new Map(files(SRC).map((path) => [path, runtimeImports(path)] as const));
const rel = (path: string): string => relative(SRC, path).split('\\').join('/');

// Every module `start` loads, with the path that first reaches each (for the failure's detail).
function reach(start: string): Map<string, string | null> {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (const next of graph.get(at) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, at);
      queue.push(next);
    }
  }
  return prev;
}

function pathTo(prev: ReadonlyMap<string, string | null>, end: string): string {
  const out: string[] = [];
  for (let at: string | null = end; at !== null; at = prev.get(at) ?? null) out.unshift(rel(at));
  return out.join(' → ');
}

const allowed = (path: string): boolean => {
  const name = rel(path);
  return name.startsWith('data/') || name.startsWith('types/') || PURE_HELPERS.has(name);
};

check('the guard sees the source tree (more than 200 modules, the import walk finds edges)',
  graph.size > 200 && [...graph.values()].reduce((sum, deps) => sum + deps.length, 0) > 1000, `${graph.size} modules`);

const ships = join(SRC, 'data', 'ships.ts');
const five = join(SRC, 'data', 'classic-five.ts');
for (const [label, root] of [['data/ships.ts', ships], ['data/classic-five.ts', five]] as const) {
  const prev = reach(root);
  const bad = [...prev.keys()].filter((path) => !allowed(path));
  check(`${label} loads only data, types and pure helpers (no system with state, no resident module, not state/actions)`,
    bad.length === 0, bad.slice(0, 3).map((path) => pathTo(prev, path)).join(' | '));
}
{
  const prev = reach(ships);
  check('data/ships.ts does not reach data/classic-five.ts (the load cycle slice 5 met)', !prev.has(five), prev.has(five) ? pathTo(prev, five) : '');
  // The guard's own sanity: the walk does find the stateful modules where they are.
  const actions = reach(join(SRC, 'systems', 'residents.ts'));
  check('…and the walk is live: systems/residents.ts does reach state/actions.ts and classic-five', actions.has(join(SRC, 'state', 'actions.ts')) && actions.has(five));
}

const { shipDefOf } = await import('@data/ships');
check('data/ships.ts loads alone, first, in a process with no harness (its export is a function)', typeof shipDefOf === 'function');

finish();
