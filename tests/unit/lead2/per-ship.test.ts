// LEAD-2 item 4: the guidance suites run on ships 2 and 3 (HALCYON, KESTREL) as well as ship 1 (WP10: and ship 4,
// VESPER; WP11: and ship 5, LAST LIGHT). Each suite flies one ship per process (the harness reads AP_SHIP once: systems are module singletons), so
// this runs them as child processes with AP_SHIP=1, 2 and 3; the normal runner already runs them on ship 1. A suite
// passes here only if it exits 0 on every ship.
// The suites read every number that was ship 1's off the ship they fly (rule2-shrink, the Rule 4 sweep, the coast
// SKIP). The Rule 4 sweep runs here at 1% FUEL steps on the canonical capture and 2% on the off-ring ones (half its
// own resolution: about 4 minutes a ship instead of 12); the full-resolution runs are logged in tests/unit/lead2/
// (rule4-sweep-ship1.log, rule4-sweep-ship2.log).
// Quick depth (tests/unit/depth.ts, npm test): VESPER flies the suites marked `quick` (a few seconds); the
// rest are ship 1's in the unit tier and every ship's in `npm run balance` (about two hours: 32 child runs, one at a
// time).
import { spawnSync } from 'node:child_process';
import { check, finish } from '../wp1/harness';
import { FULL } from '../depth';

interface Suite {
  file: string;
  env?: Record<string, string>;
  quick?: boolean;
}

const SUITES: Suite[] = [
  { file: 'tests/unit/wp1-rules/rule2-shrink.test.ts' },
  { file: 'tests/unit/lead1/fix2/rule4-sweep.test.ts', env: { CANONICAL_FUEL_STEP: '1', OFFRING_FUEL_STEP: '2' } },
  { file: 'tests/unit/lead1/fix3/rule4-two-trims.test.ts', quick: true },
  { file: 'tests/unit/lead2/coast-skip.test.ts' },
  { file: 'tests/unit/lead2/rule4-fuel.test.ts' },
  // Review round 1: no false CRASHED far out, far loops' SKIPs land on time, the FUEL readout agrees with the strip.
  { file: 'tests/unit/lead2/fix1/far-reach.test.ts' },
  // Review round 2: DON'T HIT THE PLANET never asks for a burn that opens the loop (the far-out SPACE grid, obeyed).
  { file: 'tests/unit/lead2/fix2/far-lift.test.ts' },
  // Review round 3: a press during a SKIP burns under a line that asks for SPACE, and only stops the SKIP otherwise.
  { file: 'tests/unit/lead2/fix3/skip-press.test.ts' },
];

// WP10 (the lead's item 2): VESPER (AP_SHIP=3) too, flown as after its SWAP (AP_GHOST=quiet: the Thrust Ctrl in the
// role is healthy), which is how its rule 2 / Rule 4 constants are re-checked the way the earlier ships' were. The same
// suites with its ghost thrust live are a measurement, not a gate (a failing controller drains the tank over any long
// WAIT, which is the problem SWAP solves): tests/unit/wp10/sweeps/run-suites.sh live, logs in tests/unit/wp10/sweeps/.
// WP11 (the lead's item 3): LAST LIGHT (AP_SHIP=4) too, with its radiation belt taken out (AP_ZONES=none): the belt lies
// across every loop bigger than the ring, and §6.8's TACTICAL from its lead to its exit ends each SKIP there and adds the
// crossing's wall time, which the suites' one-SKIP and wall-time rows do not expect. With the belt kept the suites are a
// measurement (tests/unit/wp11/sweeps/run-suites.sh live, PROGRESS.md WP11); rule2-shrink counts the belt's hold itself and
// passes with it (tests/unit/wp11/sweeps/rule2-shrink-ship5-r4.log).
const SHIP_RUNS: { ship: number; env?: Record<string, string> }[] = [
  { ship: 1 }, { ship: 2 }, { ship: 3, env: { AP_GHOST: 'quiet' } }, { ship: 4, env: { AP_ZONES: 'none' } },
];

// Quick depth flies the `quick` suites on VESPER alone (slice 3b review, the unit tier's budget: the other ships are
// ship 1's own runs in the tier and every ship's in `npm run balance`).
for (const { ship, env: shipEnv } of SHIP_RUNS.filter((run) => FULL || run.ship === 3)) {
  for (const suite of SUITES.filter((candidate) => FULL || candidate.quick)) {
    const started = Date.now();
    // tsx's loader in the child itself (as tests/unit/run.mjs runs the suites), not the tsx CLI's second node process.
    const run = spawnSync(process.execPath, ['--import', 'tsx', suite.file], {
      env: { ...process.env, ...suite.env, ...shipEnv, AP_SHIP: String(ship), TSX_TSCONFIG_PATH: 'tsconfig.json' }, encoding: 'utf8', maxBuffer: 1 << 26,
    });
    const lines = `${run.stdout}\n${run.stderr}`.split('\n');
    const summary = lines.filter((line) => line.startsWith('----')).pop() ?? '(no summary)';
    const failures = lines.filter((line) => line.startsWith('FAIL')).map((line) => line.slice(0, 300));
    const envShown = { ...suite.env, ...shipEnv };
    check(`ship ${ship + 1}: ${suite.file}${Object.keys(envShown).length ? ` (${Object.entries(envShown).map(([name, value]) => `${name}=${value}`).join(' ')})` : ''}`,
      run.status === 0, `${summary.replace(/^-+\s*/, '')} in ${((Date.now() - started) / 1000).toFixed(0)} s${failures.length ? ` | ${failures.join(' | ')}` : ''}`);
  }
}

finish();
