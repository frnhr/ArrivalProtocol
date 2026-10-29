// WP12 fix round 1 (the correctness review's import cycle): every DOM-free module under src/systems, src/data and
// src/state loads as the FIRST import of a fresh process. WP12 part 3 had added pace → hollow, which closed the cycle
// guidance → pace → hollow → printer → data/script → flight-controls → guidance; flight-controls and script read
// imported values at load (PRESET_KEY, SHIP_SCREEN_REFUSAL), so an entry reaching the cycle through guidance, director
// or flight-controls threw a ReferenceError, and the game only loaded because main.ts imports pace first.
// Each module runs in its own process (module singletons and load order are per process), 4 at a time (the unit tier's
// workers), under `node --import tsx` rather than the tsx CLI, which would start a second node process per module.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { check, finish } from '../../wp1/harness';

// Modules that touch the browser at load (the store instance reads window): not DOM-free, so not loadable headless by design.
const BROWSER_ONLY = new Set(['state/instance.ts']);
const DIRS = ['systems', 'data', 'state'];
const PARALLEL = 4;
const ENTRY_DIR = 'tests/.out/entries';
mkdirSync(ENTRY_DIR, { recursive: true });

const modules = DIRS.flatMap((dir) => readdirSync(`src/${dir}`).filter((file) => file.endsWith('.ts')).map((file) => `${dir}/${file}`))
  .filter((module) => !BROWSER_ONLY.has(module));

function load(module: string): Promise<string | null> {
  const entry = `${ENTRY_DIR}/${module.replace(/[/.]/g, '_')}.ts`;
  writeFileSync(entry, `import * as loaded from '@/${module.replace(/\.ts$/, '')}';\nconsole.log(Object.keys(loaded).length);\n`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', entry], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.json' },
    });
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
