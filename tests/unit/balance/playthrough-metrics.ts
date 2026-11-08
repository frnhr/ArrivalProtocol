// Slice 8 Step 0 (slice-8-plan §1, §3.2): the playthrough's records as the balance report's metric ids. Pure (types only from
// the harness), so balance/targets.test feeds it made-up records and checks every playthrough row of balance/targets.ts is
// written.
// • The main run (no PT_VARIANT): §1's G1–G7 rows over every record of a kid (every route flown), plus `.r5` / `.r8` /
//   `.tight` / `.worked` rows by route where PT_ROUTES=set flew them.
// • A variant run (PT_VARIANT=no-<skill>[-v<n>], COMPETENT): `worth.<skill>.v<n>`, the paired leave-one-out (§3.2): over the
//   seeds both runs flew on the same route, the full kid's pods landed minus the variant's, divided by the cycles the full
//   kid spent on the dropped cells, with the standard error of that ratio (`.se`) so 24 seeds' noise is read as noise.
//   (`worth.autoburn.v3ratio`, v3's worth over v2+'s, is derived by the report from the two rows: targets.ts DERIVED.)
import type { RunRecord, PlayerId } from '../wp12/playthrough';
import type { Metrics } from '../support/balance-out';
import { routeName } from './routes';

const WINS: ReadonlySet<string> = new Set(['won-purge', 'won-merge', 'won-spare']);
const SOMBRE: ReadonlySet<string> = new Set(['unresolved', 'overwritten', 'flagship-lost', 'stayed']);
const STAR_FUEL = 20;

const mean = (values: readonly number[]): number => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);
const median = (values: readonly number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const share = (records: readonly RunRecord[], test: (run: RunRecord) => boolean): number => (records.length === 0 ? NaN : (100 * records.filter(test).length) / records.length);
const podsPct = (run: RunRecord): number => (run.pods.aboard === 0 ? 0 : (100 * run.pods.landed) / run.pods.aboard);

// One kid's rows (`kid` lower case), over `records`.
function kidMetrics(kid: string, records: readonly RunRecord[]): Metrics {
  const out: Metrics = {};
  out[`win.${kid}`] = share(records, (run) => WINS.has(run.cause));
  out[`sombre.${kid}`] = share(records, (run) => SOMBRE.has(run.cause));
  out[`pods.${kid}`] = mean(records.map(podsPct));
  out[`pods.${kid}.worst`] = records.length === 0 ? NaN : Math.min(...records.map(podsPct));
  out[`lost.${kid}`] = mean(records.map((run) => run.shipsLost));
  out[`lost1.${kid}`] = share(records, (run) => run.shipsLost >= 1);
  out[`cyc.earned.${kid}`] = mean(records.map((run) => run.cycles.earned));
  out[`cyc.floor.${kid}`] = share(records, (run) => run.cycles.floor > 0);
  out[`board.trace.${kid}`] = share(records, (run) => run.boardedBy === 'trace');
  out[`eaten.${kid}`] = mean(records.map((run) => run.driversEaten));
  out[`core.dead.${kid}`] = share(records, (run) => run.coreLost > 0 || run.cause === 'overwritten');
  const atChoice = records.filter((run) => run.chargeAtChoice !== null && run.playedFor === 'merge');
  out[`merge.afford.${kid}`] = atChoice.length === 0 ? NaN : share(atChoice, (run) => run.chargeAtChoice! >= run.mergeCost);
  out[`merge.charge.${kid}`] = median(records.filter((run) => run.chargeAtChoice !== null).map((run) => run.chargeAtChoice!));
  const reached = records.filter((run) => run.emptyShip !== null);
  out[`empty.${kid}`] = reached.length === 0 ? NaN : share(reached, (run) => run.emptyShip === true);
  out[`contact.open.${kid}`] = share(records, (run) => run.signals >= run.signalsForContact);
  out[`wall.${kid}`] = median(records.map((run) => run.wallSec / 60));
  return out;
}

export function playthroughMetrics(results: ReadonlyMap<PlayerId, readonly RunRecord[]>): Metrics {
  const out: Metrics = {};
  for (const [player, records] of results) {
    const kid = player.toLowerCase();
    Object.assign(out, kidMetrics(kid, records));
    for (const name of ['worked', 'r5', 'r8', 'tight'] as const) {
      const onRoute = records.filter((run) => routeName(run.planned) === name);
      if (onRoute.length === 0) continue;
      out[`win.${kid}.${name}`] = share(onRoute, (run) => WINS.has(run.cause));
      out[`pods.${kid}.${name}`] = mean(onRoute.map(podsPct));
    }
  }
  const competent = results.get('COMPETENT') ?? [];
  // G3 (worked route: the cycle numbers are 03 §3.12's sample's) and the COMPETENT-only rows of §1 and §2.
  const worked = competent.filter((run) => routeName(run.planned) === 'worked');
  const g3 = worked.length > 0 ? worked : competent;
  out['cyc.spent'] = mean(g3.map((run) => run.cycles.spent));
  out['cyc.unspentLastDesk'] = mean(g3.flatMap((run) => (run.cycles.unspentLastDesk === null ? [] : [run.cycles.unspentLastDesk])));
  out['cyc.treeShare'] = mean(g3.map((run) => (100 * run.cycles.trained) / run.cycles.tree));
  out['core.min'] = median(competent.map((run) => run.coreMin));
  const busyAi = competent.reduce((sum, run) => sum + run.mindAiSec, 0);
  out['mind.busy'] = busyAi === 0 ? NaN : (100 * competent.reduce((sum, run) => sum + run.mindBusySec, 0)) / busyAi;
  const ships = competent.reduce((sum, run) => sum + run.ships.length, 0);
  out.waits = ships === 0 ? NaN : competent.reduce((sum, run) => sum + run.waits, 0) / ships;
  out['contact.open'] = out['contact.open.competent'] ?? null;
  out['wall.competent'] = out['wall.competent'] ?? null;
  const allShips = competent.flatMap((run) => run.ships);
  out['fuel.under20.competent'] = allShips.length === 0 ? NaN : (100 * allShips.filter((ship) => ship.fuelPct < STAR_FUEL).length) / allShips.length;
  out['reserve.refusals'] = mean(competent.map((run) => run.reserveRefusals));
  out['restore.healed'] = mean([...results.values()].flat().map((run) => run.restoresHealed));
  const tight = [...results.values()].flat().filter((run) => routeName(run.planned) === 'tight');
  const tightShips = tight.flatMap((run) => run.ships.slice(1));
  out['files.left.tight'] = tightShips.length === 0 ? NaN : mean(tightShips.map((ship) => ship.filesLeft));
  return out;
}

// The cycles the full run spent on the cells a variant drops (`no-<skill>[-v<n>]`).
function droppedCost(run: Readonly<RunRecord>, skill: string, fromVersion: number): number {
  return run.purchases.filter((purchase) => purchase.skill === skill && purchase.kind === 'train' && purchase.version >= fromVersion)
    .reduce((sum, purchase) => sum + purchase.cost, 0);
}

export function variantId(variant: string): { skill: string; fromVersion: number; metric: string } {
  const match = /^no-([a-z]+)(?:-v([123]))?$/.exec(variant);
  if (match === null) throw new Error(`playthrough-metrics: '${variant}' is not a variant`);
  const fromVersion = Number(match[2] ?? 1);
  return { skill: match[1]!, fromVersion, metric: `worth.${match[1]!}.v${fromVersion}` };
}

// The paired worth of the dropped cells: Σ(full − variant pods) ÷ Σ(cycles the full run spent on them), over the seeds both
// flew on the same route, with the ratio's standard error (the pod differences' spread, over the same price).
export function worthMetrics(variant: string, base: readonly RunRecord[], mine: readonly RunRecord[]): Metrics {
  const { skill, fromVersion, metric } = variantId(variant);
  const key = (run: RunRecord): string => `${run.seed}:${run.planned.join(',')}`;
  const full = new Map(base.map((run) => [key(run), run]));
  const pairs = mine.flatMap((run) => (full.has(key(run)) ? [{ full: full.get(key(run))!, variant: run }] : []));
  const diffs = pairs.map((pair) => pair.full.pods.landed - pair.variant.pods.landed);
  const price = mean(pairs.map((pair) => droppedCost(pair.full, skill, fromVersion)));
  const d = mean(diffs);
  const sd = diffs.length < 2 ? NaN : Math.sqrt(diffs.reduce((sum, value) => sum + (value - d) ** 2, 0) / (diffs.length - 1));
  return {
    [metric]: price > 0 ? d / price : NaN,
    [`${metric}.se`]: price > 0 ? sd / Math.sqrt(diffs.length) / price : NaN,
    [`${metric}.Δpods`]: d,
    [`${metric}.cycles`]: price,
    [`${metric}.pairs`]: pairs.length,
  };
}
