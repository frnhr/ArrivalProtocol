// Slice 3c Track WORLD: the world update over consecutive runs against the simulator (slice-3c-plan §4.5, §6.1; 02 §3.13;
// docs/phase3/map-sim/results.txt), the tier's quick sample: 3 chains × 40 runs by the mixed player (best or random, run by
// run; 15% of runs end before the final ship), at bands widened for 120 runs (tests/unit/world/stats.ts QUICK_BANDS). The
// full sample (20 chains × 200 runs × three players, the plan's own bands) is world/update-stats-full, BALANCE_ONLY.
// Pure (~2 s).
import { finish } from '../landing/checks';
import { chain } from './chain';
import { checkBands, QUICK_BANDS } from './stats';

const started = Date.now();
const chains = [7001, 7002, 7003].map((seed) => chain(seed, 40, 'mix'));
console.log(`INFO  ${chains.length} chains × ${chains[0]!.length} runs in ${Date.now() - started} ms`);
checkBands('mix, 3 × 40', chains, QUICK_BANDS);

finish();
