// BALANCE_ONLY: slice 8 Step 0 (slice-8-plan §2.4, G5b): disguised seeds per run, worked out from the odds (pure, no flight; the balance report's).
// OD 4: does a run meet a decoy often enough for SENTRY v1 (SIGHT) to name one? Over 800 runs (waves 1–8 × seeds 1–100: each
// wave's arm, createRunMap({ wave }, seed), as Track SENTRY's 800 sent runs did), each on a random route (a walk from the
// first ship to a final ship, one reachable slot at a time, on its own seeded stream), plus run 1's arm on the four pinned
// routes (balance/routes.ts). For each beam into a ship at depth d: the hop's noise (map-hop.ts hopBetween), its seed count
// odds (BEAM_SEED_ODDS) and the disguise chance at d (beam-seeds.ts disguiseChanceAt). The disguise roll takes both its draws
// whatever the chance (rollDisguises), so these odds are the game's: a beam has P(no decoy) = Σₖ odds[k]·(1 − p)ᵏ, a ship
// P(decoy) = 1 − that, and a run P(≥ 1 decoy) = 1 − Π over its beams. Delivery seeds and the traces' wild seed are never
// disguised (they don't count), and a beam into a calm ship carries none (depths under SEEDS_MIN_DEPTH: p is 0 there anyway).
// Prints and emits (BALANCE_JSON) `decoy.run` (runs that reach depth 5), `decoy.ship.d<n>` (ships at depth n) and
// `decoy.run.<route>` for the pinned routes. Its one check: the model reproduces Track SENTRY's measured ships-with-a-decoy
// shares (slice-4cde-plan "Measured": 15% / 7% / 9% at depths 5 / 6 / 7) within sampling error, when the odds are the ones
// that measurement flew (1/3 from depth 5, 1/2 from 7); with other odds it prints the comparison only.
import { check, finish } from '../wp1/harness';
import { createRunMap } from '@systems/map-run';
import { reachableFrom, hopBetween } from '@systems/map-hop';
import { createRng } from '@systems/rng';
import { disguiseChanceAt } from '@systems/beam-seeds';
import { BEAM_SEED_ODDS, DISGUISE_CHANCE_BY_DEPTH } from '@data/tuning';
import type { RunMapState } from '@/types/map';
import { writeMetrics } from '../support/balance-out';
import { ROUTE_SET, ROUTE_NAMES } from './routes';

const WAVES = 8;
const SEEDS = Number(process.env.DECOY_SEEDS ?? 100);
const started = Date.now();

// P(the beam from → to, landing at `depth`, carries at least one decoy).
function decoyChance(map: Readonly<RunMapState>, from: number, to: number, depth: number): number {
  const p = disguiseChanceAt(depth);
  if (p === 0) return 0;
  const odds = BEAM_SEED_ODDS[hopBetween(map, from, to).noise];
  return 1 - odds.reduce((sum, chance, seeds) => sum + chance * (1 - p) ** seeds, 0);
}

// A run's ships (depth 2 on) with their decoy chance, along `route`.
function beams(map: Readonly<RunMapState>, route: readonly number[]): { depth: number; p: number }[] {
  return route.slice(1).map((slot, i) => ({ depth: i + 2, p: decoyChance(map, route[i]!, slot, i + 2) }));
}

function randomRoute(map: Readonly<RunMapState>, rng: () => number): number[] {
  const route = [0];
  for (let guard = 0; guard < 12; guard++) {
    const next = reachableFrom(map, route[route.length - 1]!);
    if (next.length === 0) break;
    route.push(next[Math.floor(rng() * next.length)]!);
  }
  return route;
}

const runChance = (list: readonly { p: number }[]): number => 1 - list.reduce((none, beam) => none * (1 - beam.p), 1);
const byDepth = new Map<number, number[]>();
const deepRuns: number[] = [];
const pinned = new Map<string, number[]>();
for (let wave = 1; wave <= WAVES; wave++) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const map = createRunMap({ wave }, seed);
    const list = beams(map, randomRoute(map, createRng(seed * 31 + wave)));
    for (const beam of list) byDepth.set(beam.depth, [...(byDepth.get(beam.depth) ?? []), beam.p]);
    if (list.length + 1 >= 5) deepRuns.push(runChance(list));
    if (wave === 1) for (const name of ROUTE_NAMES) pinned.set(name, [...(pinned.get(name) ?? []), runChance(beams(map, ROUTE_SET[name]))]);
  }
}

const mean = (values: readonly number[]): number => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);
const pct = (value: number): string => `${(100 * value).toFixed(1)}%`;
console.log(`decoy odds over ${WAVES * SEEDS} runs (waves 1–${WAVES} × seeds 1–${SEEDS}, random routes): DISGUISE_CHANCE_BY_DEPTH ${JSON.stringify(DISGUISE_CHANCE_BY_DEPTH)}`);
for (const [depth, list] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  depth ${depth}: ${list.length} ships, P(decoy) ${pct(mean(list))}`);
}
console.log(`  runs that reach depth 5: ${deepRuns.length}, P(≥ 1 decoy) ${pct(mean(deepRuns))}`);
for (const name of ROUTE_NAMES) console.log(`  run 1's arm, the ${name} route (${ROUTE_SET[name].join(',')}): P(≥ 1 decoy) ${pct(mean(pinned.get(name)!))} over ${SEEDS} arms`);

// Track SENTRY's 800 sent runs (slice-4cde-plan "Measured"), ships with a decoy by depth: within 3 binomial standard errors
// of the model at those odds (the model's own ships at that depth as the sample size).
const MEASURED: readonly (readonly [number, number])[] = [[5, 0.15], [6, 0.07], [7, 0.09]];
const sameOdds = JSON.stringify(DISGUISE_CHANCE_BY_DEPTH) === JSON.stringify([{ fromDepth: 5, chance: 1 / 3 }, { fromDepth: 7, chance: 1 / 2 }]);
const comparison = MEASURED.map(([depth, measured]) => {
  const list = byDepth.get(depth) ?? [];
  const model = mean(list);
  const se = Math.sqrt((model * (1 - model)) / Math.max(1, list.length));
  return { depth, measured, model, ok: Math.abs(model - measured) <= 3 * se + 1e-9, se };
});
const line = comparison.map((row) => `d${row.depth} model ${pct(row.model)} vs measured ${pct(row.measured)} (±${pct(3 * row.se)})`).join(' · ');
check(`${WAVES * SEEDS} runs, each to a final ship, ${deepRuns.length} of them at depth 5 or more`, deepRuns.length > 0 && byDepth.size > 0);
if (sameOdds) check('the model reproduces Track SENTRY\'s measured ships-with-a-decoy shares within 3 standard errors', comparison.every((row) => row.ok), line);
else console.log(`INFO  the odds moved from Track SENTRY's; its measured shares for comparison: ${line}`);

writeMetrics('decoy-stats', {
  'decoy.run': 100 * mean(deepRuns),
  ...Object.fromEntries([...byDepth.entries()].map(([depth, list]) => [`decoy.ship.d${depth}`, 100 * mean(list)])),
  ...Object.fromEntries(ROUTE_NAMES.map((name) => [`decoy.run.${name}`, 100 * mean(pinned.get(name)!)])),
}, { runs: WAVES * SEEDS, deepRuns: deepRuns.length });
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
finish();
