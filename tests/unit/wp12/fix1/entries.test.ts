// WP12 fix round 1 (the correctness review's import cycle): every DOM-free module under src/systems, src/data and
// src/state loads as the FIRST import of a fresh process. WP12 part 3 had added pace → hollow, which closed the cycle
// guidance → pace → hollow → printer → data/script → flight-controls → guidance; flight-controls and script read
// imported values at load (PRESET_KEY, SHIP_SCREEN_REFUSAL), so an entry reaching the cycle through guidance, director
// or flight-controls threw a ReferenceError, and the game only loaded because main.ts imports pace first.
// Each module runs in its own process (module singletons and load order are per process).
// The unit tier's budget (slice 3a's review fixes): each process used to load its module through tsx (`node --import tsx`,
// about 0.33 s of loader start-up a process, 114 processes: the suite's 34 s held four cores). The modules are now
// transpiled once, file by file, with the esbuild tsx itself uses (the same per-file ESM, the tsconfig's
// verbatimModuleSyntax, aliases resolved to relative paths), and each process imports its module with plain node: the same
// ESM evaluation order a fresh process gives, at about a fifth of the CPU. Two processes at a time, so the suite leaves
// the runner's other workers their cores.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { transformSync } from 'esbuild';
import { check, finish } from '../../wp1/harness';

// Modules that touch the browser at load (the store instance reads window): not DOM-free, so not loadable headless by design.
const BROWSER_ONLY = new Set(['state/instance.ts']);
const DIRS = ['systems', 'data', 'state'];
const PARALLEL = 2;
const OUT = 'tests/.out/entries-js';
const ALIASES: readonly (readonly [string, string])[] = [
  ['@state/', 'state/'], ['@data/', 'data/'], ['@components/', 'components/'], ['@systems/', 'systems/'], ['@styles/', 'styles/'], ['@/', ''],
];
const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8')) as { compilerOptions: Record<string, unknown> };

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [relative('src', path)] : [];
  });
}
const tsFiles = new Set(sources('src'));

// A specifier as the transpiled file must spell it: an alias or an extensionless relative path to the .mjs of its .ts.
function respell(spec: string, from: string): string {
  let target: string | null = null;
  for (const [alias, dir] of ALIASES) if (spec.startsWith(alias)) { target = dir + spec.slice(alias.length); break; }
  if (target === null && (spec.startsWith('./') || spec.startsWith('../'))) target = posix.join(posix.dirname(from), spec);
  if (target === null) return spec;
  const file = tsFiles.has(`${target}.ts`) ? `${target}.ts` : tsFiles.has(`${target}/index.ts`) ? `${target}/index.ts` : null;
  // Not a module of ours (a stylesheet main.ts imports): left as written; a DOM-free module importing one fails to load.
  if (file === null) return spec;
  const rel = posix.relative(posix.dirname(from), file.replace(/\.ts$/, '.mjs'));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

rmSync(OUT, { recursive: true, force: true });
for (const file of tsFiles) {
  const { code } = transformSync(readFileSync(join('src', file), 'utf8'), {
    loader: 'ts', format: 'esm', target: 'node22', sourcefile: file, tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
  });
  const out = code.replace(/(\bfrom\s*|\bimport\s*\(?\s*)"([^"]+)"/g, (_, head: string, spec: string) => `${head}"${respell(spec, file)}"`);
  const path = join(OUT, file.replace(/\.ts$/, '.mjs'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out);
}

const modules = DIRS.flatMap((dir) => readdirSync(`src/${dir}`).filter((file) => file.endsWith('.ts')).map((file) => `${dir}/${file}`))
  .filter((module) => !BROWSER_ONLY.has(module));

function load(module: string): Promise<string | null> {
  const entry = join(OUT, `entry_${module.replace(/[/.]/g, '_')}.mjs`);
  writeFileSync(entry, `import * as loaded from './${module.replace(/\.ts$/, '.mjs')}';\nconsole.log(Object.keys(loaded).length);\n`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });
    child.on('close', (code) => resolve(code === 0 ? null : (err.split('\n').find((line) => /Error/.test(line)) ?? `exit ${code}`)));
  });
}

async function main(): Promise<void> {
  const failures = new Map<string, string>();
  for (let i = 0; i < modules.length; i += PARALLEL) {
    const batch = modules.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(load));
    batch.forEach((module, index) => { const failure = results[index]; if (failure) failures.set(module, failure); });
  }
  for (const module of ['systems/guidance.ts', 'systems/director.ts', 'systems/flight-controls.ts']) {
    check(`${module} loads first (the cycle the review found)`, modules.includes(module) && !failures.has(module), failures.get(module) ?? '');
  }
  check(`every one of the ${modules.length} DOM-free modules loads as a process's first import`, failures.size === 0,
    [...failures].map(([module, why]) => `${module}: ${why}`).join(' | '));
  finish();
}

void main();
