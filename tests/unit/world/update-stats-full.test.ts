// BALANCE_ONLY: 12,000 consecutive runs (20 chains × 200 runs × three players, about two minutes); world/update-stats keeps a quick sample in the tier.
// Slice 3c Track WORLD: the world update over 200 consecutive runs against the simulator at the plan's own bands
// (slice-3c-plan §4.5, §6.1; 02 §3.13; docs/phase3/map-sim/results.txt, its three persistent rows): the players 'best',
// 'random' and 'mix' (15% of runs end before the final ship), 20 chains each, as arm_sim.py runs them. Best route, no
// drift, no snowball, ships waiting and new, ages, the gap, the valve, first attempts, classes, late TIGHT ships, every
// ship on some route, new final ships, the authored ships' exit, the span, the ship-2 request; INFO: the departure mix,
// name reuse, the Debris guarantee's reach, the quotas. Then the fresh roll every run (the old generator) as the baseline.
import { check, finish } from '../landing/checks';
import { freshArmAttempts, bestRoutePods } from '@systems/map-generator';
import { chain, median, pct, type Player } from './chain';
import { checkBands, FULL_BANDS } from './stats';
import { RUN_START_YEAR } from '@data/tuning';

const CHAINS = 20;
const RUNS = 200;
let persistentMix: number[] = [];
for (const player of ['best', 'random', 'mix'] as Player[]) {
  const started = Date.now();
  const chains = Array.from({ length: CHAINS }, (_, c) => chain(1000 + c, RUNS, player));
  console.log(`INFO  player ${player}: ${CHAINS} × ${RUNS} runs in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  checkBands(`${player}, ${CHAINS} × ${RUNS}`, chains, FULL_BANDS);
  if (player === 'mix') persistentMix = chains.flat().map((row) => row.best);
}

// The baseline: a fresh roll every run (02 §3.13's last column), on 4 chains of 200 (the start years follow the same gaps
// in spirit: the fresh roll does not depend on them beyond the bases).
const fresh = Array.from({ length: 4 * RUNS }, (_, i) => bestRoutePods(freshArmAttempts(5000 + i, 2, RUN_START_YEAR).arm));
console.log(`INFO  fresh roll every run: best pods p1 ${pct(fresh, 0.01)}, p10 ${pct(fresh, 0.1)}, median ${median(fresh)}, p90 ${pct(fresh, 0.9)} (sim 63 / 66 / 67 / 69)`);
check(`the persistent arm is at least as rich as a fresh roll: median ${median(persistentMix)} vs ${median(fresh)}, p10 ${pct(persistentMix, 0.1)} vs ${pct(fresh, 0.1)} (02 §3.13: about a pod richer, a level not a feedback)`,
  median(persistentMix) >= median(fresh) && pct(persistentMix, 0.1) >= pct(fresh, 0.1));

finish();
