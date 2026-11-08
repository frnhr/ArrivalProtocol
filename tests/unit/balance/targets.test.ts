// Slice 8 Step 0 (slice-8-plan R8, §3.3): the balance report's rows are well formed, in under a second (the quick tier's only
// new suite). Every row of balance/targets.ts names its sweep, its metric id and its OD items (or none); every §1 metric id
// is a row; every row's id is one its sweep writes: the playthrough's by running balance/playthrough-metrics.ts on made-up
// records, every other sweep's by its source spelling the id (or its stem) beside a writeMetrics call; every knob the report
// sets is one its sweep reads.
import { existsSync, readFileSync } from 'node:fs';
import { check, finish } from '../wp1/harness';
import { TARGETS, SECTION1_METRICS, SWEEPS, DERIVED, LOO_VARIANTS, targetStatus, bandText, type SweepId, type Target } from './targets';
import { playthroughMetrics, worthMetrics } from './playthrough-metrics';
import { ROUTE_SET } from './routes';
import type { RunRecord, ShipRecord, PlayerId } from '../wp12/playthrough';

const started = Date.now();

// --- The rows themselves ------------------------------------------------------------------------------------------------
const ids = TARGETS.map((target) => target.metric);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
check('every row has its own metric id', dupes.length === 0, dupes.join(', '));
const sources = new Set(SWEEPS.map((job) => job.source));
const malformed = TARGETS.filter((target) => target.goal === '' || target.label === '' || target.metric === '' || !sources.has(target.source)
  || !target.od.every((od) => Number.isInteger(od) && od > 0) || (target.min !== undefined && target.max !== undefined && target.min > target.max));
check('every row names its goal, its sweep (one the report runs), its metric id and its OD items (whole numbers, or none)',
  malformed.length === 0, malformed.map((target) => target.metric).join(', '));
const missing = SECTION1_METRICS.filter((id) => !ids.includes(id));
check(`every metric id of the plan's §1 is a row (${SECTION1_METRICS.length})`, missing.length === 0, missing.join(', '));
const bare: Target = { goal: 'G0', label: 'a row', metric: 'x', unit: '', source: 'playthrough', od: [], lever: '' };
check('a row\'s status reads its band: OK inside, LOW / HIGH outside, INFO without one, — unmeasured',
  targetStatus({ ...bare, min: 10, max: 20 }, 15) === 'OK' && targetStatus({ ...bare, min: 10, max: 20 }, 5) === 'LOW'
  && targetStatus({ ...bare, min: 10, max: 20 }, 25) === 'HIGH' && targetStatus(bare, 3) === 'INFO'
  && targetStatus({ ...bare, min: 1 }, null) === '—' && bandText({ ...bare, min: -1, max: 1, unit: 'pods' }) === '±1');

// --- The sweeps write them -------------------------------------------------------------------------------------------------
const filesOf = (source: SweepId): string[] => {
  const files = SWEEPS.filter((job) => job.source === source).map((job) => job.file);
  // The playthrough's metrics are worked out in playthrough-metrics (the suite calls it); its knobs are read by the harness.
  return source.startsWith('playthrough') ? [...new Set([...files, 'tests/unit/balance/playthrough-metrics.ts', 'tests/unit/wp12/playthrough.ts'])] : [...new Set(files)];
};
const text = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const noFile = SWEEPS.filter((job) => !existsSync(job.file));
check('every sweep the report runs exists', noFile.length === 0, noFile.map((job) => job.file).join(', '));
const derived = new Set(DERIVED.map((row) => row.metric));
const unwritten = TARGETS.filter((target) => !target.source.startsWith('playthrough') && !derived.has(target.metric)).filter((target) => {
  const sourceText = filesOf(target.source).map(text).join('\n');
  return !sourceText.includes('writeMetrics(') || !sourceText.includes(target.stem ?? target.metric);
});
check('every other sweep\'s row is spelled out (or its stem) in a sweep that calls writeMetrics', unwritten.length === 0,
  unwritten.map((target) => `${target.metric} (${target.source})`).join(', '));
const badDerived = DERIVED.filter((row) => !row.ratio.every((id) => ids.includes(id)) || !ids.includes(row.metric));
check('every derived row is a row, from two rows', badDerived.length === 0, badDerived.map((row) => row.metric).join(', '));
const knobs = SWEEPS.flatMap((job) => [...Object.keys(job.quick ?? {}), ...Object.keys(job.full ?? {})].map((knob) => ({ job, knob })));
const unread = knobs.filter(({ job, knob }) => !filesOf(job.source).map(text).join('\n').includes(knob));
check('every knob the report sets is one its sweep reads', unread.length === 0, [...new Set(unread.map(({ job, knob }) => `${job.id}:${knob}`))].join(', '));

// The playthrough: made-up records of every kid on every route, through the suite's own metric code.
function ship(name: string): ShipRecord {
  return {
    ship: name, outcome: 'locked', woke: 1000, half: 0, lost: 0, stars: 1, fuelPct: 30, wallSec: 100, chargeIn: 10, coreIn: 100, chargeOut: 10,
    coreOut: 100, filesEaten: 0, repairLeft: true, repairEaten: [], pods: 5, landed: 4, points: 900, filesLeft: 1,
  };
}
function record(player: PlayerId, seed: number, route: readonly number[], variant: string | null): RunRecord {
  return {
    player, seed, cause: seed % 3 === 0 ? 'unresolved' : 'won-purge', completed: true, woke: 9000, score: 9000, souls: 11000, phaseSec: {},
    ships: route.map((slot) => ship(`S${slot}`)), shipsLost: seed % 2, simulationRetries: 0, coreLost: 0, coreMin: 70, wallSec: 900, mindSec: 0,
    overclockSec: 0, tacticalSec: 0, skipSec: 0, chargeAtChoice: 10 + seed, verbs: null, lastLightLost: 0, playedFor: seed % 2 === 0 ? 'merge' : 'purge',
    opsDone: {}, bought: [], route: [...route], planned: [...route], mergeCost: 20, signalsForContact: 3, variant,
    cycles: { earned: 28, granted: 0, spent: 25, unspentLastDesk: 3, trained: 25, tree: 54, floor: seed === 1 ? 2 : 0 },
    purchases: [
      { skill: 'autoburn', kind: 'train', version: 2, cost: 5, visit: 2 }, { skill: 'autoburn', kind: 'train', version: 3, cost: 8, visit: 4 },
      { skill: 'autodrop', kind: 'train', version: 1, cost: 3, visit: 2 }, { skill: 'autodrop', kind: 'train', version: 3, cost: 8, visit: 5 },
      { skill: 'sentry', kind: 'train', version: 1, cost: 2, visit: 3 }, { skill: 'sentry', kind: 'train', version: 3, cost: 5, visit: 5 },
    ],
    pods: { aboard: 55, landed: variant === null ? 50 : 48 }, boardedBy: seed % 4 === 0 ? 'trace' : 'forced', driversEaten: 2, waits: 1,
    mindBusySec: 10, mindAiSec: 100, signals: seed % 3, restores: 0, restoresHealed: 0, emptyShip: seed % 2 === 0, reserveRefusals: 0, landingsEnded: 0,
  };
}
const routesFlown = Object.values(ROUTE_SET);
const fake = new Map<PlayerId, RunRecord[]>((['COMPETENT', 'SLOPPY', 'LITERAL'] as const).map((player) => [player,
  routesFlown.flatMap((route) => [1, 2, 3, 4].map((seed) => record(player, seed, route, null)))]));
const written = new Set(Object.keys(playthroughMetrics(fake)));
for (const variant of LOO_VARIANTS.full) {
  const base = fake.get('COMPETENT')!;
  for (const id of Object.keys(worthMetrics(variant, base, base.map((run) => ({ ...run, variant, pods: { ...run.pods, landed: run.pods.landed - 1 } }))))) written.add(id);
}
const notWritten = TARGETS.filter((target) => target.source.startsWith('playthrough') && !derived.has(target.metric) && !written.has(target.metric));
check('every playthrough row is written by playthrough-metrics (the main run on every route, and each leave-one-out variant)',
  notWritten.length === 0, notWritten.map((target) => target.metric).join(', '));
const worth = worthMetrics('no-autoburn-v3', [record('COMPETENT', 1, ROUTE_SET.worked, null), record('COMPETENT', 2, ROUTE_SET.worked, null)],
  [record('COMPETENT', 1, ROUTE_SET.worked, 'no-autoburn-v3'), record('COMPETENT', 2, ROUTE_SET.worked, 'no-autoburn-v3')]);
check('the leave-one-out\'s worth is the paired pods over the dropped cells\' price (2 pods ÷ 8 cycles = 0.25)',
  Math.abs((worth['worth.autoburn.v3'] ?? NaN) - 0.25) < 1e-9 && worth['worth.autoburn.v3.pairs'] === 2, JSON.stringify(worth));

const sec = (Date.now() - started) / 1000;
check('…in under a second', sec < 1, `${sec.toFixed(2)} s`);
finish();
