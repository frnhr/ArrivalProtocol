// The world update's statistics against docs/phase3/map-sim/results.txt's persistent rows (slice-3c-plan §4.5): one set of
// checks over consecutive-run chains (tests/unit/world/chain.ts), at the plan's bands on a full sample (world/update-stats-
// full, BALANCE_ONLY) or at bands widened for a small one's noise (world/update-stats, in the tier). INFO lines report what
// the plan measures without a band: the departure mix, name reuse, the Debris guarantee's reach (risk 4) and the quotas.
import { check } from '../landing/checks';
import { pct, median, mean, corr, LEAVE_REASONS, type RunRow } from './chain';

const share = (n: number, of: number): number => (of === 0 ? 0 : n / of);
const fmt = (x: number): string => `${(100 * x).toFixed(1)}%`;

export interface Bands {
  bestP1: number; bestP10: [number, number]; bestMedian: [number, number]; bestP90: [number, number];
  drift: number; corr: number; waiting: [number, number]; fresh: [number, number];
  ageNew: [number, number]; age2: [number, number]; age3: [number, number];
  gapMean: [number, number]; valve: number; firstTry: [number, number];
  full: [number, number]; compact: [number, number]; tight: [number, number];
  lateTight: [number, number]; tightOnBest: number; finalNew: [number, number]; span: [number, number]; req23: number;
}

// §4.5 as written.
export const FULL_BANDS: Bands = {
  bestP1: 64, bestP10: [66, 68], bestMedian: [67, 69], bestP90: [69, 69], drift: 0.5, corr: 0.15, waiting: [7, 10], fresh: [10, 13],
  ageNew: [0.48, 0.58], age2: [0.25, 0.35], age3: [0.13, 0.21], gapMean: [2.5, 3.1], valve: 0.001, firstTry: [0.70, 0.85],
  full: [0.30, 0.38], compact: [0.33, 0.41], tight: [0.25, 0.33], lateTight: [2.3, 3.1], tightOnBest: 0.02, finalNew: [0.80, 0.92],
  span: [725, 738], req23: 0.88,
};

// A sample of a hundred-odd runs: the same centres, wide enough for its noise (a gap of 35 alone moves the mean by 0.3).
export const QUICK_BANDS: Bands = {
  bestP1: 63, bestP10: [65, 68], bestMedian: [67, 69], bestP90: [69, 69], drift: 1.2, corr: 0.3, waiting: [7, 10], fresh: [10, 13],
  ageNew: [0.44, 0.62], age2: [0.21, 0.39], age3: [0.09, 0.25], gapMean: [1.7, 3.9], valve: 0.01, firstTry: [0.60, 0.92],
  full: [0.28, 0.40], compact: [0.31, 0.43], tight: [0.23, 0.35], lateTight: [2.0, 3.4], tightOnBest: 0.05, finalNew: [0.70, 0.96],
  span: [722, 740], req23: 0.82,
};

const inBand = (x: number, [lo, hi]: [number, number]): boolean => x >= lo && x <= hi;

export function checkBands(label: string, chains: readonly (readonly RunRow[])[], bands: Bands): void {
  const rows = chains.flat();
  const later = rows.filter((row) => row.update !== null);
  const updates = later.map((row) => row.update!);
  const best = rows.map((row) => row.best);
  check(`${label}: best route pods p1 ${pct(best, 0.01)}, p10 ${pct(best, 0.1)}, median ${median(best)}, p90 ${pct(best, 0.9)}, min ${Math.min(...best)} (sim 65 / 67 / 68 / 69, min 63)`,
    pct(best, 0.01) >= bands.bestP1 && inBand(pct(best, 0.1), bands.bestP10) && inBand(median(best), bands.bestMedian) && inBand(pct(best, 0.9), bands.bestP90));
  const runs = chains[0]!.length;
  const block = Math.max(1, Math.floor(runs / 5));
  const firstBlock = mean(chains.flatMap((rowsOf) => rowsOf.slice(0, block).map((row) => row.best)));
  const lastBlock = mean(chains.flatMap((rowsOf) => rowsOf.slice(runs - block).map((row) => row.best)));
  check(`${label}: no drift: best pods runs 1–${block} ${firstBlock.toFixed(2)} → ${runs - block + 1}–${runs} ${lastBlock.toFixed(2)} (sim 67.7 → 67.9; < ${bands.drift})`,
    Math.abs(lastBlock - firstBlock) < bands.drift);
  const took: number[] = [];
  const next: number[] = [];
  for (const rowsOf of chains) for (let i = 0; i + 1 < rowsOf.length; i++) { took.push(rowsOf[i]!.taken); next.push(rowsOf[i + 1]!.best); }
  const r = corr(took, next);
  check(`${label}: no snowball: corr(pods taken last run, best pods next) ${r >= 0 ? '+' : ''}${r.toFixed(3)} (sim +0.03; |r| < ${bands.corr})`, Math.abs(r) < bands.corr);
  const waiting = later.map((row) => row.waiting);
  const fresh = updates.map((update) => update.next.ships.filter((ship) => ship.runsOnChart === 1).length);
  check(`${label}: ships waiting at RUN START median ${median(waiting)} (p10 ${pct(waiting, 0.1)}, p90 ${pct(waiting, 0.9)}; sim 9), new ships per update median ${median(fresh)} (sim 11)`,
    inBand(median(waiting), bands.waiting) && inBand(median(fresh), bands.fresh));
  const ages = later.flatMap((row) => row.ages);
  const age = (n: number): number => share(ages.filter((a) => a === n).length, ages.length);
  check(`${label}: ages at RUN START new ${fmt(age(0))}, 2nd run ${fmt(age(1))}, 3rd ${fmt(age(2))} (sim 53 / 31 / 17)`,
    inBand(age(0), bands.ageNew) && inBand(age(1), bands.age2) && inBand(age(2), bands.age3) && ages.every((a) => a <= 2));
  const gaps = updates.map((update) => update.next.gap);
  check(`${label}: launch gap mean ${mean(gaps).toFixed(2)}, median ${median(gaps)}, max ${Math.max(...gaps)} (sim 2.69–2.81, 2, 35)`,
    inBand(mean(gaps), bands.gapMean) && Math.max(...gaps) <= 35);
  const valves = updates.filter((update) => update.valveOpened).length;
  check(`${label}: the time valve opened in ${valves} of ${updates.length} updates (sim 0 of 12,000; ≤ ${fmt(bands.valve)})`, share(valves, updates.length) <= bands.valve);
  const firstTry = share(updates.filter((update) => update.attempts === 1).length, updates.length);
  check(`${label}: first attempt passes ${fmt(firstTry)}, worst ${Math.max(...updates.map((update) => update.attempts))} attempts, none threw (sim 77–78%, 12)`,
    inBand(firstTry, bands.firstTry));
  const classes = rows.flatMap((row) => row.classes);
  const cls = (name: string): number => share(classes.filter((c) => c === name).length, classes.length);
  check(`${label}: classes FULL ${fmt(cls('FULL'))}, COMPACT ${fmt(cls('COMPACT'))}, TIGHT ${fmt(cls('TIGHT'))} (sim 34 / 37 / 29)`,
    inBand(cls('FULL'), bands.full) && inBand(cls('COMPACT'), bands.compact) && inBand(cls('TIGHT'), bands.tight));
  const lateTight = mean(rows.map((row) => row.lateTight));
  const onBest = share(rows.filter((row) => row.tightOnBest).length, rows.length);
  check(`${label}: late TIGHT ships ${lateTight.toFixed(2)} per arm, on the best route in ${fmt(onBest)} of runs (sim 2.67, 0%)`,
    inBand(lateTight, bands.lateTight) && onBest <= bands.tightOnBest);
  check(`${label}: all 20 ships on some route, every run (sim: min 20)`, rows.every((row) => row.onRoutes === 20), `min ${Math.min(...rows.map((row) => row.onRoutes))}`);
  const finalNew = share(later.filter((row) => row.finalNew).length, later.length);
  check(`${label}: a new final ship in ${fmt(finalNew)} of runs (sim 85–87%)`, inBand(finalNew, bands.finalNew));
  check(`${label}: HALCYON, KESTREL and VESPER are gone by run 4, visited or not (sim: none at run 10)`,
    chains.every((rowsOf) => rowsOf.slice(3).every((row) => row.authoredLeft === 0)));
  const span = rows.map((row) => row.span);
  check(`${label}: span, first to final ship, median ${median(span)} (p10 ${pct(span, 0.1)}, p90 ${pct(span, 0.9)}; sim 731–732)`, inBand(median(span), bands.span));
  const req = rows.filter((row) => row.req23 !== null);
  const reqOk = share(req.filter((row) => row.req23).length, req.length);
  check(`${label}: a request from ship 2 reaches ship 3 on the route taken in ${fmt(reqOk)} of runs (sim 91–96%)`, reqOk >= bands.req23);
  const reasons = Object.fromEntries(LEAVE_REASONS.map((reason) => [reason, mean(updates.map((update) => update.reasons[reason]))]));
  console.log(`INFO  ${label}: leaving the chart per update: ${LEAVE_REASONS.map((reason) => `${reason} ${reasons[reason]!.toFixed(2)}`).join(', ')}`
    + ' (sim mix: done 6.04, resolved 2.16, aged 2.13, drifted 0.91, unreachable 0.05, made-room 0.03)');
  // Names (risk 5; slice 3c review fix M5): a new generated ship is never named after a ship that left in the same update
  // (hard); how often one takes the name of a ship that left one update before is reported.
  let named = 0;
  let sameUpdate = 0;
  let updateBefore = 0;
  for (const rowsOf of chains) {
    let leftBefore = new Set<string>();
    for (const row of rowsOf) {
      if (row.update === null) continue;
      const left = new Set(row.update.next.departures.map((departure) => departure.name));
      for (const ship of row.update.next.ships) {
        if (ship.runsOnChart !== 1 || ship.kind === 'first' || ship.kind === 'final') continue;
        named++;
        if (left.has(ship.name)) sameUpdate++;
        else if (leftBefore.has(ship.name)) updateBefore++;
      }
      leftBefore = left;
    }
  }
  check(`${label}: no new ship takes the name of a ship that left in the same update (review M5): ${sameUpdate} of ${named}`, sameUpdate === 0);
  console.log(`INFO  ${label}: names: ${sameUpdate} of ${named} new generated ships took the name of a ship that left in the same update, `
    + `${updateBefore} (${fmt(share(updateBefore, named))}) one that left the update before (36 names, 18 slots)`);
  const noDebris = rows.filter((row) => !row.debrisAtDepth2).length;
  console.log(`INFO  ${label}: no DEBRIS ship among the reachable layer-3 ships in ${noDebris} of ${rows.length} runs (${fmt(share(noDebris, rows.length))}; risk 4's lever at 10%)`);
  const quotas = later.filter((row) => {
    const ships = row.update!.next.ships;
    return ships.filter((ship) => ship.reserved.resident?.kind === 'left').length === 5 && ships.filter((ship) => ship.reserved.unknownEvent !== null).length === 3
      && ships.reduce((sum, ship) => sum + ship.reserved.fragments, 0) === 5;
  }).length;
  const sleeper = share(rows.filter((row) => row.update === null || row.update.next.ships.some((ship) => ship.reserved.resident?.kind === 'sleeping')).length, rows.length);
  console.log(`INFO  ${label}: 02 §3.5's quotas exact on ${quotas} of ${later.length} updated arms; a sleeper on the arm in ${fmt(sleeper)} of runs (02: about 60%)`);
  const lengths = new Map<number, number>();
  for (const row of rows) lengths.set(row.bestLen, (lengths.get(row.bestLen) ?? 0) + 1);
  console.log(`INFO  ${label}: best route length ${[...lengths].sort((a, b) => a[0] - b[0]).map(([n, count]) => `${n}: ${fmt(share(count, rows.length))}`).join(', ')} (sim mix 6: 41%, 7: 59%)`);
}
