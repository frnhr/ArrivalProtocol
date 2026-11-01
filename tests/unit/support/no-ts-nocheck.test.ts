// Guard (slice 1a, Track TESTS): no test file may switch the type checker off. Slice 1a's first pass parked the suites
// it broke behind a ts-nocheck directive with a TODO; every one was rewritten for the current design, and this suite
// keeps the directive (and ts-ignore, its per-line cousin) from coming back anywhere under tests/: tsx strips types, so
// a file the checker skips would run against a design it no longer matches without a word from `tsc -p tests`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { check, finish } from '../wp1/harness';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const TESTS = join(ROOT, 'tests');
const SKIP = new Set(['node_modules', '.out']);
// The marker spelled in two pieces, so this file does not match itself.
const MARKERS = [new RegExp(['@ts-', 'nocheck'].join('')), new RegExp(['@ts-', 'ignore'].join(''))];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

const all = files(TESTS);
const hits = all.flatMap((path) => readFileSync(path, 'utf8').split('\n').flatMap((line, index) =>
  MARKERS.some((marker) => marker.test(line)) ? [`${relative(ROOT, path)}:${index + 1}`] : []));
check('the guard sees the test tree (more than 100 files)', all.length > 100, `${all.length} files`);
check('no test file switches the type checker off (no ts-nocheck / ts-ignore marker)', hits.length === 0, hits.join(', '));

finish();
