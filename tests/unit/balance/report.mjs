// Slice 8 Step 0 (docs/phase3/impl/slice-8-plan.md §3.3): the balance report, for Fran. One table: each goal's target,
// today's number, the last run's, OK / LOW / HIGH (INFO for a row with no band), the sweep it came from and the OPEN-DECISIONS
// item it answers. Not a suite: tests/unit/run.mjs never picks it up (.mjs, outside the *.test.ts glob).
//   npm run balance:report                       the quick profile (§3.1's quick column)
//   npm run balance:report -- --full             the full profile (the baseline's and CLOSE's)
//   npm run balance:report -- --only merge.,win. only the sweeps that feed rows whose metric id starts so (a track's rows)
//   npm run balance:report -- --ab <name>        against tests/unit/balance/ab.mjs's copy .tmp/balance/<name> (R2)
//   npm run balance:report -- --strict           exit 1 on any LOW / HIGH (a track's own check; Fran runs it plain)
// • How it runs: the rows and the sweeps are balance/targets.ts (read through tsx). The playthrough jobs run first, one after
//   the other (each shards itself over PT_WORKERS = BALANCE_WORKERS); then the single-process sweeps in a pool of
//   BALANCE_WORKERS (default 4), longest first by the last run's times, each spawned as run.mjs spawns a suite
//   (`node --import tsx`, AP_DEPTH=full, the profile's knobs, BALANCE_JSON). A sweep that crashes (no metrics written) prints
//   its tail and leaves its rows ERR; one whose own checks fail still gives its numbers (noted under the table).
// • Output: the table on stdout and in tests/.out/balance/report.md, report.json beside it (the "Last" column of the next run),
//   each sweep's log in logs/ and its metrics in metrics/. An A/B run writes to tests/.out/balance/ab-<name>/ instead, so its
//   "Last" is the previous run of that copy; the real tree's report.json is never overwritten by one.
// • Exit 0 unless a sweep crashed (or --strict and a row is LOW / HIGH).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';
import { tsImport } from 'tsx/esm/api';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const { TARGETS, SWEEPS, DERIVED, targetStatus, bandText } = await tsImport('./targets.ts', import.meta.url);

// --- Arguments ------------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  if (at < 0) return null;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`report: ${flag} needs a value`);
  return value;
};
const PROFILE = args.includes('--full') ? 'full' : 'quick';
const ONLY = (valueOf('--only') ?? '').split(',').filter((prefix) => prefix !== '');
const AB = valueOf('--ab');
const STRICT = args.includes('--strict');
const known = new Set(['--full', '--quick', '--only', '--ab', '--strict', ...[valueOf('--only'), valueOf('--ab')].filter(Boolean)]);
for (const arg of args) if (!known.has(arg)) throw new Error(`report: unknown argument ${arg} (--quick, --full, --only <prefixes>, --ab <name>, --strict)`);
const WORKERS = Number(process.env.BALANCE_WORKERS ?? Math.min(4, availableParallelism()));
if (!Number.isInteger(WORKERS) || WORKERS < 1) throw new Error(`BALANCE_WORKERS=${process.env.BALANCE_WORKERS} is not a worker count`);

const OUT_BASE = 'tests/.out/balance';
const OUT = AB === null ? OUT_BASE : `${OUT_BASE}/ab-${AB}`;
const abTsconfig = AB === null ? null : `.tmp/balance/${AB}/tsconfig.json`;
if (abTsconfig !== null && !existsSync(join(ROOT, abTsconfig))) throw new Error(`report: no A/B copy ${AB} (node tests/unit/balance/ab.mjs ${AB} <overrides.json> first)`);

// --- The rows and the jobs they need ----------------------------------------------------------------------------------------
const rows = TARGETS.filter((target) => ONLY.length === 0 || ONLY.some((prefix) => target.metric.startsWith(prefix)));
if (rows.length === 0) throw new Error(`report: no row's metric starts with ${ONLY.join(', ')}`);
const neededSources = new Set(rows.map((target) => target.source));
// A leave-one-out pairs with the main playthrough's records: it needs the main run too.
if (neededSources.has('playthrough-loo')) neededSources.add('playthrough');
const jobs = SWEEPS.filter((job) => neededSources.has(job.source) && job[PROFILE] !== null);
const outPath = (path) => (path.startsWith(`${OUT_BASE}/`) && AB !== null ? `${OUT}/${path.slice(OUT_BASE.length + 1)}` : path);

mkdirSync(join(ROOT, OUT, 'logs'), { recursive: true });
mkdirSync(join(ROOT, OUT, 'metrics'), { recursive: true });
let last = null;
try { last = JSON.parse(readFileSync(join(ROOT, OUT, 'report.json'), 'utf8')); } catch { /* the first run: no Last column yet */ }
const lastTimes = last?.jobs ? Object.fromEntries(last.jobs.map((job) => [job.id, job.sec])) : {};

const git = (...gitArgs) => spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const head = `${git('rev-parse', '--short', 'HEAD') || '?'}${git('status', '--porcelain', '--untracked-files=no') === '' ? '' : '+'}`;

// --- Running ----------------------------------------------------------------------------------------------------------------
const results = new Map();
function runJob(job) {
  return new Promise((resolve) => {
    const metricsFile = `${OUT}/metrics/${job.id}.json`;
    rmSync(join(ROOT, metricsFile), { force: true });
    const knobs = Object.fromEntries(Object.entries(job[PROFILE]).map(([key, value]) => [key, key === 'PT_OUT' || key === 'PT_BASE' ? outPath(value) : value]));
    const env = {
      ...process.env, AP_DEPTH: 'full', TSX_TSCONFIG_PATH: abTsconfig ?? 'tsconfig.json', BALANCE_JSON: metricsFile, ...knobs,
      ...(job.group === 'playthrough' ? { PT_WORKERS: String(WORKERS), PT_TSCONFIG: abTsconfig ?? 'tsconfig.json' } : {}),
    };
    const started = Date.now();
    const child = spawn(process.execPath, ['--import', 'tsx', job.file], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => {
      const sec = (Date.now() - started) / 1000;
      writeFileSync(join(ROOT, OUT, 'logs', `${job.id}.log`), out);
      let file = null;
      try { file = JSON.parse(readFileSync(join(ROOT, metricsFile), 'utf8')); } catch { /* crashed before its metrics */ }
      results.set(job.id, { job, code, sec, file });
      const what = file === null ? 'CRASHED (no metrics)' : code === 0 ? 'ok' : `its own checks failed (exit ${code})`;
      console.log(`${file === null ? 'ERR ' : 'done'}  ${sec.toFixed(0).padStart(5)} s  ${job.id}  ${what}`);
      if (file === null) console.log(out.trimEnd().split('\n').slice(-15).map((line) => `      ${line}`).join('\n'));
      resolve();
    });
  });
}

const started = Date.now();
console.log(`balance report: ${PROFILE}${AB === null ? '' : ` · A/B ${AB}`}${ONLY.length === 0 ? '' : ` · only ${ONLY.join(',')}`} · ${jobs.length} sweeps, ${WORKERS} workers`);
for (const job of jobs.filter((one) => one.group === 'playthrough')) await runJob(job);
const pool = jobs.filter((job) => job.group === 'pool').sort((a, b) => (lastTimes[b.id] ?? Infinity) - (lastTimes[a.id] ?? Infinity));
await Promise.all(Array.from({ length: Math.min(WORKERS, pool.length) }, async () => {
  while (pool.length > 0) await runJob(pool.shift());
}));
const minutes = (Date.now() - started) / 60000;

// --- The table ---------------------------------------------------------------------------------------------------------------
const metrics = {};
const seedsBySource = {};
const crashedSources = new Set();
const ranSources = new Set();
for (const { job, file } of results.values()) {
  ranSources.add(job.source);
  if (file === null) { crashedSources.add(job.source); continue; }
  Object.assign(metrics, file.metrics);
  seedsBySource[job.source] ??= file.meta?.seeds ?? file.meta?.runs ?? file.meta?.arms ?? (file.meta?.landings === undefined ? '' : `${file.meta.landings} ldg`);
}
for (const row of DERIVED) {
  const [a, b] = row.ratio.map((id) => metrics[id]);
  metrics[row.metric] = a === null || a === undefined || b === null || b === undefined || b === 0 ? null : a / b;
}

const fmt = (target, value) => {
  if (value === null || value === undefined) return '—';
  const digits = target.unit === '%' ? 0 : ['pod/cycle', 'ratio'].includes(target.unit) ? 2 : 1;
  const sign = target.min !== undefined && target.min < 0 && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${target.unit === '%' ? '%' : ''}`;
};
const table = rows.map((target) => {
  const value = metrics[target.metric] ?? null;
  const crashed = crashedSources.has(target.source);
  const status = crashed ? 'ERR' : !ranSources.has(target.source) && targetStatus(target, null) === '—' ? '—' : targetStatus(target, value);
  const se = metrics[`${target.metric}.se`];
  const now = fmt(target, value) + (se !== undefined && se !== null && value !== null ? ` ±${se.toFixed(2)}` : '');
  return {
    goal: target.goal, label: target.label, metric: target.metric, target: bandText(target), now, value,
    last: fmt(target, last?.metrics?.[target.metric] ?? null), status, seeds: String(seedsBySource[target.source] ?? ''),
    source: target.source, od: target.od.join(', '), lever: target.lever,
  };
});
const cols = [
  ['#', (row) => row.goal], ['Goal', (row) => row.label], ['Target', (row) => row.target], ['Now', (row) => row.now], ['Last', (row) => row.last],
  ['', (row) => row.status], ['Seeds', (row) => row.seeds], ['Source', (row) => row.source], ['OD', (row) => row.od],
];
const widths = cols.map(([name, get]) => Math.max(name.length, ...table.map((row) => get(row).length)));
const line = (cells) => `| ${cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ')} |`;
const date = new Date().toISOString().slice(0, 10);
const out = [];
out.push(`ARRIVAL PROTOCOL · BALANCE REPORT · ${head} · ${PROFILE}${AB === null ? '' : ` · A/B ${AB}`} · ${date} · ${minutes.toFixed(0)} min`);
out.push(line(cols.map(([name]) => name)));
out.push(`|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`);
for (const row of table) out.push(line(cols.map(([, get]) => get(row))));
const off = table.filter((row) => row.status === 'LOW' || row.status === 'HIGH');
if (off.length > 0) {
  out.push('');
  for (const row of off) out.push(`${row.status.padEnd(4)} ${row.goal} ${row.metric}: ${row.lever || '(no lever named)'}`);
}
const failedChecks = [...results.values()].filter((result) => result.file !== null && result.code !== 0);
const crashed = [...results.values()].filter((result) => result.file === null);
out.push('');
out.push(`sweeps (${PROFILE}): ${[...results.values()].map((result) => `${result.job.id} ${result.sec.toFixed(0)} s`).join(' · ')}`);
if (failedChecks.length > 0) out.push(`their own checks failed (numbers kept): ${failedChecks.map((result) => `${result.job.id} (exit ${result.code})`).join(', ')}`);
if (crashed.length > 0) out.push(`crashed (rows ERR): ${crashed.map((result) => result.job.id).join(', ')}; logs in ${OUT}/logs`);
if (AB !== null) out.push(`A/B ${AB}: ${readFileSync(join(ROOT, '.tmp', 'balance', AB, 'overrides.json'), 'utf8').replace(/\s+/g, ' ').trim()}`);
const text = out.join('\n');
console.log(`\n${text}`);
writeFileSync(join(ROOT, OUT, 'report.md'), `${text}\n`);
writeFileSync(join(ROOT, OUT, 'report.json'), `${JSON.stringify({
  head, profile: PROFILE, ab: AB, only: ONLY, date, minutes, metrics: { ...(ONLY.length > 0 ? last?.metrics ?? {} : {}), ...metrics },
  rows: table, jobs: [...results.values()].map((result) => ({ id: result.job.id, sec: result.sec, exit: result.code, metrics: result.file !== null })),
}, null, 1)}\n`);
process.exit(crashed.length > 0 || (STRICT && off.length > 0) ? 1 : 0);
