// The unit tier's runner: every headless suite (tests/unit/**/*.test.ts, each a tsx process that exits non-zero on a
// failure) plus a strict tsc over them (tsx only strips types), in parallel, slowest first.
// Usage: node tests/unit/run.mjs [--full] [filter ...]    (npm test; npm run balance passes --full)
// • AP_DEPTH=quick (default): the sweeps sample their grids (tests/unit/depth.ts) and the run must finish inside
//   UNIT_BUDGET_SEC (300: the tier's five-minute promise) with no suite over SUITE_BUDGET_SEC (90), else it FAILs. A
//   suite that outgrows its share samples more coarsely in quick mode; its full grid stays in `npm run balance`.
// • --full (or AP_DEPTH=full): every grid at full resolution and the 200-seed balance targets; no time budget (about
//   two hours on four cores).
// • UNIT_WORKERS: parallel suites (default: the machine's cores). A filter keeps only the suites whose path contains
//   one of the given substrings, a `-substring` filter drops the ones that contain it (the tsc pass always runs).
// Per-suite wall times are kept in tests/.out/unit-timings.json and order the next run (longest first), so one slow
// suite does not start last and hold the whole run.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const DEPTH = args.includes('--full') ? 'full' : process.env.AP_DEPTH ?? 'quick';
if (DEPTH !== 'quick' && DEPTH !== 'full') throw new Error(`AP_DEPTH=${DEPTH} is neither quick nor full`);
const QUICK = DEPTH === 'quick';
const num = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}=${process.env[name]} is not a positive number`);
  return value;
};
const WORKERS = num('UNIT_WORKERS', availableParallelism());
const BUDGET_SEC = QUICK ? num('UNIT_BUDGET_SEC', 300) : Infinity;
const SUITE_BUDGET_SEC = QUICK ? num('SUITE_BUDGET_SEC', 90) : Infinity;
const TIMINGS = join(ROOT, 'tests', '.out', 'unit-timings.json');
const filterArgs = args.filter((arg) => arg !== '--full');
const includes = filterArgs.filter((arg) => !arg.startsWith('-'));
const excludes = filterArgs.filter((arg) => arg.startsWith('-')).map((arg) => arg.slice(1));

function suites(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...suites(path));
    else if (name.endsWith('.test.ts')) out.push(relative(ROOT, path));
  }
  return out;
}

let timings = {};
try { timings = JSON.parse(readFileSync(TIMINGS, 'utf8')); } catch { /* first run: no order yet */ }
const known = timings[DEPTH] ?? {};

const jobs = [
  { label: 'tsc-tests', cmd: 'node_modules/.bin/tsc', args: ['-p', 'tests/tsconfig.json'] },
  ...suites(join(ROOT, 'tests', 'unit'))
    .filter((file) => includes.length === 0 || includes.some((filter) => file.includes(filter)))
    .filter((file) => !excludes.some((filter) => file.includes(filter)))
    // tsx's loader in the suite's own process (`node --import tsx`, the tsconfig from TSX_TSCONFIG_PATH below), not the
    // tsx CLI, which starts a second node process to run the file: about 0.1 s of CPU a suite.
    .map((file) => ({ label: file, cmd: process.execPath, args: ['--import', 'tsx', file] })),
];
// Longest first by the last run's times; a suite never timed goes first (it may be slow).
jobs.sort((a, b) => (known[b.label] ?? Infinity) - (known[a.label] ?? Infinity));
if (jobs.length < 2) { console.error(`no suite matches ${filterArgs.join(' ')}`); process.exit(2); }

const started = Date.now();
const results = [];
const env = { ...process.env, AP_DEPTH: DEPTH, TSX_TSCONFIG_PATH: 'tsconfig.json' };

function runJob(job) {
  return new Promise((resolve) => {
    const jobStarted = Date.now();
    const child = spawn(job.cmd, job.args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => {
      const sec = (Date.now() - jobStarted) / 1000;
      const slow = sec > SUITE_BUDGET_SEC;
      const ok = code === 0 && !slow;
      results.push({ label: job.label, ok, sec });
      const why = code !== 0 ? '' : slow ? `  — over the ${SUITE_BUDGET_SEC} s per-suite budget: sample its grid in quick mode (tests/unit/depth.ts)` : '';
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${sec.toFixed(1).padStart(5)}s  ${job.label}${why}`);
      if (code !== 0) console.log(out.trimEnd().split('\n').slice(-25).map((line) => `      ${line}`).join('\n'));
      resolve();
    });
  });
}

const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
  while (queue.length) await runJob(queue.shift());
}));

const wallSec = (Date.now() - started) / 1000;
mkdirSync(join(ROOT, 'tests', '.out'), { recursive: true });
writeFileSync(TIMINGS, JSON.stringify({ ...timings, [DEPTH]: { ...known, ...Object.fromEntries(results.map((r) => [r.label, r.sec])) } }, null, 1));

const failed = results.filter((r) => !r.ok);
const slowest = [...results].sort((a, b) => b.sec - a.sec).slice(0, 5);
console.log(`---- slowest: ${slowest.map((r) => `${r.label.replace(/^tests\/unit\//, '')} ${r.sec.toFixed(0)}s`).join(', ')}`);
const overBudget = wallSec > BUDGET_SEC;
if (overBudget) console.log(`FAIL  the run took ${wallSec.toFixed(0)} s, over the unit tier's ${BUDGET_SEC} s budget (UNIT_BUDGET_SEC)`);
console.log(`---- ${results.length - failed.length} passed, ${failed.length} failed in ${wallSec.toFixed(0)} s (${DEPTH}, ${WORKERS} workers)`);
for (const r of failed) console.log(`      failed: ${r.label}`);
process.exit(failed.length === 0 && !overBudget ? 0 : 1);
