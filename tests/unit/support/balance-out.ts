// Slice 8 Step 0 (docs/phase3/impl/slice-8-plan.md §3.2): a sweep's metrics for the balance report (tests/unit/balance/
// report.mjs). Each sweep calls writeMetrics once at its end, beside its usual table, with the metric ids of the plan's §1
// and §2 (balance/targets.ts names the ids the report reads). It writes nothing unless BALANCE_JSON names a file, so a sweep
// run by `npm run balance` or by hand prints and does exactly what it did before.
// • A metric is a number, or null when the run measured nothing for it (no seed reached the choice, a row not flown in
//   this profile): the report shows `—` for it, never 0.
// • `meta` is free information for the report's header and its JSON (seeds, cases, knobs): numbers or strings.
// Called before the suite's finish(): finish() exits the process, and a sweep whose own checks fail still has numbers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type Metrics = Record<string, number | null>;

export interface MetricsFile {
  suite: string;
  written: string;
  metrics: Metrics;
  meta: Record<string, number | string | null>;
}

// A finite number, or null (NaN, ±Infinity and undefined all mean "not measured").
export function metric(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}

export function writeMetrics(suite: string, metrics: Readonly<Metrics>, meta: Readonly<MetricsFile['meta']> = {}): void {
  const path = process.env.BALANCE_JSON;
  if (path === undefined || path === '') return;
  const clean: Metrics = {};
  for (const [id, value] of Object.entries(metrics)) {
    if (!/^[A-Za-z0-9.+Δ_-]+$/.test(id)) throw new Error(`writeMetrics(${suite}): '${id}' is not a metric id (letters, digits, . + Δ _ -)`);
    clean[id] = metric(value);
  }
  const file: MetricsFile = { suite, written: new Date().toISOString(), metrics: clean, meta: { ...meta } };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
}
