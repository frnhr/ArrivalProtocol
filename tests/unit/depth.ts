// How deep the unit tier sweeps. The headless suites fly the real systems at 50 ms ticks and the predictor re-plans the
// whole path on every tick, so a grid of FUEL × ignore × kid × ship rows costs minutes of CPU per suite:
// • quick (the default, `npm test`): each sweep flies a sample of its grid that still reaches every row family it
//   checks (the edges of each band and a point inside it), so the whole tier stays inside its five-minute budget;
// • full (`npm run balance`, AP_DEPTH=full): every grid at the resolution its review round asked for, the 200-seed
//   balance targets, no time budget. Run it when tuning.ts or ships.ts change.
// A suite's own env knobs (CANONICAL_FUEL_STEP, RUN_SEEDS, PT_SEEDS, ...) still override either depth.
export type Depth = 'quick' | 'full';

const raw = process.env.AP_DEPTH ?? 'quick';
if (raw !== 'quick' && raw !== 'full') throw new Error(`AP_DEPTH=${raw} is neither quick nor full`);
export const DEPTH: Depth = raw;
export const FULL = DEPTH === 'full';

// The quick value in the unit tier, the full one under `npm run balance`.
export function byDepth<T>(quick: T, full: T): T {
  return FULL ? full : quick;
}

// A scenario that only the full depth flies (a long-horizon setup that costs a minute or more of CPU by itself):
// quick mode prints a SKIP line naming it, so the unit tier says what it left to `npm run balance`.
export function fullOnly(name: string, run: () => void): void {
  if (FULL) run();
  else console.log(`SKIP  ${name}  — full depth only (npm run balance)`);
}
