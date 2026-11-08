// Slice 8 Step 0 (docs/phase3/impl/slice-8-plan.md R2): an A/B copy of src/ with some tuning values changed, so a track
// measures a candidate on any sweep while other agents run on the real tree. Nothing in src/ changes.
//   node tests/unit/balance/ab.mjs <name> <overrides.json>
// • Copies src/ to .tmp/balance/<name>/src (a fresh copy each time) and writes .tmp/balance/<name>/tsconfig.json, the
//   project's with its `paths` pointing at the copy. A sweep run with TSX_TSCONFIG_PATH (and the playthrough's PT_TSCONFIG)
//   set to it resolves every `@data/…`, `@systems/…` import into the copy: `npm run balance:report -- --ab <name>` does.
// • overrides.json maps a name to its new value, in the copy's data/tuning.ts or data/skills.ts:
//     { "MERGE_COST_CHARGE": 16,
//       "RESIDENT_GHOST.amp": 0.10,
//       "SKILL_TREE.survey.versions[0].price": 1,
//       "DISGUISE_CHANCE_BY_DEPTH": "[{ fromDepth: 5, chance: 1 / 2 }, { fromDepth: 7, chance: 2 / 3 }]" }
//   The name is a top-level `export const` (or a plain `const`, such as skills.ts's SPEC_TREE_CYCLES, which a re-price must
//   move with it: the tree's validator throws at load otherwise), found exactly once across the two files (it throws
//   otherwise), then optional `.key` and `[index]` steps into its object and array literals. A number or JSON value is written as JSON; a string is written as
//   TypeScript source, verbatim. The value replaced must be a literal (the path can't step into a call or a spread).
// • Prints each change (old → new), and writes the overrides beside the copy (overrides.json) so the report names them.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FILES = ['src/data/tuning.ts', 'src/data/skills.ts'];

// --- A small scanner over TypeScript source: strings, template literals and comments skipped, brackets matched ----------
function skipNoise(text, at) {
  // Past whitespace and comments from `at`.
  for (;;) {
    while (at < text.length && /\s/.test(text[at])) at++;
    if (text.startsWith('//', at)) { at = text.indexOf('\n', at); if (at < 0) return text.length; continue; }
    if (text.startsWith('/*', at)) { at = text.indexOf('*/', at) + 2; continue; }
    return at;
  }
}

// The index just past the token starting at `at` that is a string or comment, or `at` when it is neither.
function pastQuoted(text, at) {
  const c = text[at];
  if (c === '"' || c === "'" || c === '`') {
    for (let i = at + 1; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === c) return i + 1;
    }
    throw new Error('ab: an unclosed string');
  }
  if (text.startsWith('//', at)) { const end = text.indexOf('\n', at); return end < 0 ? text.length : end; }
  if (text.startsWith('/*', at)) return text.indexOf('*/', at) + 2;
  return at;
}

// The end (exclusive) of the expression starting at `at`: the first `stops` character at bracket depth 0.
function exprEnd(text, at, stops) {
  let depth = 0;
  for (let i = at; i < text.length;) {
    const past = pastQuoted(text, i);
    if (past !== i) { i = past; continue; }
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) return i; depth--; }
    else if (depth === 0 && stops.includes(c)) return i;
    i++;
  }
  return text.length;
}

// The span [start, end) of an `export const NAME`'s initializer, or null.
function constSpan(text, name) {
  const re = new RegExp(`^(?:export )?const ${name}\\b`, 'gm');
  const hits = [...text.matchAll(re)];
  if (hits.length === 0) return null;
  if (hits.length > 1) throw new Error(`ab: const ${name} is declared ${hits.length} times`);
  let at = hits[0].index + hits[0][0].length;
  // Past the type annotation to its `=` (not an arrow's `=>`).
  for (;;) {
    const past = pastQuoted(text, at);
    if (past !== at) { at = past; continue; }
    if (text[at] === '=' && text[at + 1] !== '>' && text[at - 1] !== '=' && text[at - 1] !== '!' && text[at - 1] !== '<' && text[at - 1] !== '>') break;
    if (at >= text.length) throw new Error(`ab: no initializer for ${name}`);
    at++;
  }
  const start = skipNoise(text, at + 1);
  return [start, exprEnd(text, start, ';')];
}

// Inside the literal at [start, end): the value span of key `key` (an object) or element `index` (an array).
function stepInto(text, [start, end], step) {
  const open = text[start];
  if (step.kind === 'key' && open !== '{') throw new Error(`ab: .${step.key} steps into something that is not an object literal`);
  if (step.kind === 'index' && open !== '[') throw new Error(`ab: [${step.index}] steps into something that is not an array literal`);
  let at = start + 1;
  let index = 0;
  while (at < end - 1) {
    at = skipNoise(text, at);
    if (text[at] === '}' || text[at] === ']') break;
    if (text.startsWith('...', at)) throw new Error('ab: a spread in the literal: the path cannot step past it');
    let valueStart = at;
    let key = null;
    if (open === '{') {
      const m = /^(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)"|(\d+))\s*:/.exec(text.slice(at, at + 200));
      if (m === null) throw new Error(`ab: an object entry ab can't read at ${JSON.stringify(text.slice(at, at + 40))}`);
      key = m[1] ?? m[2] ?? m[3] ?? m[4];
      valueStart = skipNoise(text, at + m[0].length);
    }
    const valueEnd = exprEnd(text, valueStart, ',');
    let trimmed = valueEnd;
    while (trimmed > valueStart && /\s/.test(text[trimmed - 1])) trimmed--;
    if ((step.kind === 'key' && key === step.key) || (step.kind === 'index' && index === step.index)) return [valueStart, trimmed];
    index++;
    at = text[valueEnd] === ',' ? valueEnd + 1 : valueEnd;
  }
  throw new Error(`ab: ${step.kind === 'key' ? `no key .${step.key}` : `no element [${step.index}]`} in the literal`);
}

function parsePath(path) {
  const m = /^([A-Z][A-Z0-9_]*)(.*)$/.exec(path);
  if (m === null) throw new Error(`ab: '${path}' does not start with an export const name`);
  const steps = [];
  const re = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]/y;
  let rest = m[2];
  re.lastIndex = 0;
  while (re.lastIndex < rest.length) {
    const s = re.exec(rest);
    if (s === null) throw new Error(`ab: can't read the path '${path}' at '${rest.slice(re.lastIndex)}'`);
    steps.push(s[1] !== undefined ? { kind: 'key', key: s[1] } : { kind: 'index', index: Number(s[2]) });
  }
  return { name: m[1], steps };
}

// The overrides applied to `texts` (file → source); returns the changes made.
export function applyOverrides(texts, overrides) {
  const changes = [];
  for (const [path, value] of Object.entries(overrides)) {
    const { name, steps } = parsePath(path);
    const owners = Object.keys(texts).filter((file) => constSpan(texts[file], name) !== null);
    if (owners.length !== 1) throw new Error(`ab: const ${name} is in ${owners.length} of ${Object.keys(texts).join(', ')} (it must be in exactly one)`);
    const file = owners[0];
    let span = constSpan(texts[file], name);
    for (const step of steps) span = stepInto(texts[file], span, step);
    const before = texts[file].slice(span[0], span[1]);
    const after = typeof value === 'string' ? value : JSON.stringify(value);
    texts[file] = texts[file].slice(0, span[0]) + after + texts[file].slice(span[1]);
    changes.push({ path, file, before, after });
  }
  return changes;
}

function main() {
  const [name, overridesPath] = process.argv.slice(2);
  if (!name || !overridesPath || !/^[\w.-]+$/.test(name)) {
    console.error('usage: node tests/unit/balance/ab.mjs <name> <overrides.json>   (name: letters, digits, . _ -)');
    process.exit(2);
  }
  const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'));
  const dir = join(ROOT, '.tmp', 'balance', name);
  // Applied to the real sources first, so a bad name throws before anything is copied.
  const texts = Object.fromEntries(FILES.map((file) => [file, readFileSync(join(ROOT, file), 'utf8')]));
  const changes = applyOverrides(texts, overrides);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  for (const file of FILES) writeFileSync(join(dir, file), texts[file]);
  const base = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8'));
  const paths = Object.fromEntries(Object.entries(base.compilerOptions.paths).map(([alias, targets]) => [alias, targets.map((target) => target)]));
  const tsconfig = { compilerOptions: { ...base.compilerOptions, baseUrl: '.', paths }, include: ['src'] };
  writeFileSync(join(dir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  writeFileSync(join(dir, 'overrides.json'), `${JSON.stringify(overrides, null, 2)}\n`);
  for (const change of changes) console.log(`${change.path} (${change.file}): ${change.before} → ${change.after}`);
  console.log(`A/B copy ${name}: ${relative(ROOT, dir)}; run a sweep with TSX_TSCONFIG_PATH=${relative(ROOT, join(dir, 'tsconfig.json'))}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
