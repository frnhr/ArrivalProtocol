// LEAD-1 review round 2: the lead's acceptance sweep for Rule 4 ("a WAIT longer than the SKIP budget is not
// an option", PROGRESS.md 09:40 and 10:50). After a let-go-at-CAPTURED capture left to ride 60 / 90 / 120 s,
// the tank is set to 10–46% FUEL in 0.5% steps and three kids fly the strip: `obey` (instant) and the WP1
// followStrip kid at 0.3 and 0.5 s. A kid shown ACCEPT ORBIT as the only way on presses it.
// Every one of the 657 flights must end (no `appr` row: before this round 36 of them were still flying after
// 1,500 wall s of SKIP, toward `WAIT — brake at ▼ in 35364:28`), the strip must never turn a RELEASE into
// `KEEP HOLDING — until the FUEL runs out` (FLIP), no single SKIP may run longer than SKIP_BUDGET_WALL_SEC,
// and no WAIT offered with [F] SKIP may be one that SKIP can't cross within it.
// Same rows as `tests/unit/lead1/fix1/probes/sweep.ts` (IGNORES=60,90,120 FUELS=10,46,0.5 KIDS=obey,f0.3,f0.5). For
// speed the capture and the ignore are flown once per ignore time per process (flows.ts ignoredAtCapture) and
// restored for each row (checked below against a row flown from scratch).
// Review round 3 (the lead's ruling of 13:21) adds the verifier's off-ring captures: ▼ at 4,300 / 4,700 /
// 4,900 km, the same ignores, 10–46% FUEL in OFFRING_FUEL_STEP steps (1% here, 0.5% by hand:
// OFFRING_FUEL_STEP=0.5), the same three kids. Before that round the first of the two trims (a PRO at ▲, 0.1%)
// counted as paid and 8 of the verifier's 20 rows were still flying after 300–1,200 s of SKIP toward it (a
// SKIP of 2.6 wall hours). The ruling's acceptance for them: every flight ends, no SKIP over the budget.
// LEAD-2 (the coast SKIP; the lead's items 2–4):
// • the budget is gone: every SKIP crosses its WAIT in a few seconds, so no single SKIP may last longer than
//   FEW_SKIP_SEC (the ramp, SKIP_DIVISOR at its warp, the ease-out and a tick or two), and no flight may still be flying;
// • a FLIP (within one hold, a KEEP HOLDING line after a RELEASE) and a FLICKER (within one hold, a KEEP HOLDING
//   line back after another one: LEAD-1 round 3's deferred dry-end flicker) fail the sweep, in both sections;
// • it runs on any ship (AP_SHIP=1 or 2; tests/unit/lead2/per-ship.test.ts runs both): its captures are the ship's own,
//   and the off-ring ▼ heights (4,300 / 4,700 / 4,900 km) sit under every ship's ring (they all start at 5,000).
// The FUEL band is 10–46% on ship 1; on a ship whose trim at ▼ costs more (HALCYON 42%, KESTREL 50%), the band
// reaches 15 points above it, so every row family (STRANDED, ACCEPTED, LOCKED) is flown.
import { createHarness, check, finish, followStrip, TICK } from '../../wp1/harness';
import { getPrediction, computePrediction } from '@systems/predict';
import { acceptOrbit } from '@systems/flight-controls';
import { STRANDED_LINE, ACCEPT_ONLY_LINE } from '@systems/guidance';
import { idle, releaseAtCapture, captureOffRing, obey, text, stepUntil, ignoredAtCapture } from '../../wp1-rules/flows';
import { SKIP_DIVISOR, SKIP_RAMP_SEC, SKIP_EASE_OUT_SEC } from '@data/tuning';
import type { GameState } from '@state/schema';
import { byDepth } from '../../depth';

const harness = createHarness(1);
const state = () => harness.store.getState();
// Quick depth (tests/unit/depth.ts) flies a coarse sample of each grid (the shortest and longest ignore, every 12% of
// the band: 10, 22, 34, 46 on ship 1, which still meets STRANDED, ACCEPTED and LOCKED, the instant and the slowest
// kid); the full grid is the lead's.
const ignores = byDepth([60, 120], [60, 90, 120]);
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + SKIP_EASE_OUT_SEC + 1;
// The band's top: ship 1's 46%, or 15 points over the ship's own trim at ▼ (priced on the 60 s capture loop).
ignoredAtCapture(harness, 60);
const trimAtPeriPct = computePrediction({ ...state(), burn: { ...state().burn, fuelPct: 0.5 } }).neededPct;
const FUEL_TOP = Math.max(46, Math.ceil(trimAtPeriPct + 15));
const CANONICAL_STEP = Number(process.env.CANONICAL_FUEL_STEP ?? byDepth('12', '0.5'));
const fuels: number[] = [];
for (let fuel = 10; fuel <= FUEL_TOP + 1e-9; fuel += CANONICAL_STEP) fuels.push(Number(fuel.toFixed(1)));
const KIDS = ['obey', 'f0.3', 'f0.5'] as const;
const kids = byDepth<readonly typeof KIDS[number][]>(['obey', 'f0.5'], KIDS);

interface Row {
  status: string;
  offer: string;
  wallSec: number;
  longestSkipSec: number;      // the longest single stretch at SKIP pace
  flip: boolean;               // within one hold: a KEEP HOLDING line after a RELEASE line
  flicker: boolean;            // within one hold: a KEEP HOLDING line back after another KEEP HOLDING line
  holdLines: string;           // the lines of the hold that flipped or flickered
  acceptOnly: boolean;         // the kid was shown ACCEPT ORBIT as the only way on
  fuelLeft: number;
}

// Flown once per ignore time per process (flows.ts flyOnce), so the sweep, the restore check and the STRANDED check
// share one capture each.
function snapshotAfterIgnore(ignoreSec: number): GameState {
  ignoredAtCapture(harness, ignoreSec);
  return structuredClone(state());
}

function restore(snapshot: GameState, fuelPct: number): void {
  harness.reset(1);
  harness.store.update((d) => { Object.assign(d, structuredClone(snapshot)); });
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; });
  for (let i = 0; i < 4; i++) harness.step();
}

function fly(kid: typeof KIDS[number]): Row {
  const row: Row = {
    status: '', offer: text(harness), wallSec: 0, longestSkipSec: 0, flip: false, flicker: false, holdLines: '', acceptOnly: false, fuelLeft: 0,
  };
  let skipRun = 0;
  // The distinct lines shown during the current hold of the throttle (empty while it is let go).
  let hold: string[] = [];
  const watch = (): void => {
    skipRun = state().clock.pace === 'skip' ? skipRun + TICK : 0;
    row.longestSkipSec = Math.max(row.longestSkipSec, skipRun);
    const line = text(harness);
    if (!state().burn.firing) {
      hold = [];
    } else if (hold[hold.length - 1] !== line) {
      const keep = /^KEEP HOLDING/.test(line);
      const flip = keep && hold.some((shown) => /^RELEASE/.test(shown));
      const flicker = keep && hold.includes(line) && hold.some((shown) => /^KEEP HOLDING/.test(shown) && shown !== line);
      hold.push(line);
      if ((flip || flicker) && !row.holdLines) row.holdLines = hold.join(' → ');
      row.flip ||= flip;
      row.flicker ||= flicker;
    }
    if ((line === STRANDED_LINE || line === ACCEPT_ONLY_LINE) && harness.status() === 'approaching') {
      row.acceptOnly = true;
      acceptOrbit(harness.store);
    }
  };
  const start = harness.wall();
  watch();
  if (kid === 'obey') obey(harness, 600, watch);
  else followStrip(harness, Number(kid.slice(1)), 600, watch);
  row.status = harness.status();
  row.wallSec = harness.wall() - start;
  row.fuelLeft = state().burn.fuelPct;
  return row;
}

const describe = (row: Row): string =>
  `${row.status} ${row.wallSec.toFixed(0)} s, longest SKIP ${row.longestSkipSec.toFixed(1)} s${row.flip ? ', FLIP' : ''}`
  + `${row.flicker ? ', FLICKER' : ''}${row.holdLines ? ` (${row.holdLines})` : ''}${row.acceptOnly ? ', ACCEPT only' : ''}, FUEL ${row.fuelLeft.toFixed(1)}%`;

// --- The restore is faithful: a row flown from scratch ends the same way -----------------------------------
// On the sweep's first ignore time (its capture is the sweep's own, flown once): 90 s at full depth, 60 s in quick.
{
  const ignoreSec = byDepth(60, 90);
  const snapshot = snapshotAfterIgnore(ignoreSec);
  restore(snapshot, 33.5);
  const restored = fly('f0.3');
  releaseAtCapture(harness);
  idle(harness, ignoreSec);
  harness.store.mutate((d) => { d.burn.fuelPct = 33.5; });
  for (let i = 0; i < 4; i++) harness.step();
  const fresh = fly('f0.3');
  check(`setup: a restored row flies like one flown from scratch (ignore ${ignoreSec} s, 33.5%, 0.3 s kid)`,
    restored.status === fresh.status && Math.abs(restored.wallSec - fresh.wallSec) < 0.5
    && Math.abs(restored.fuelLeft - fresh.fuelLeft) < 0.05, `restored: ${describe(restored)} | fresh: ${describe(fresh)}`);
}

// --- The sweep ---------------------------------------------------------------------------------------------
const outcomes = new Map<string, number>();
const bad: string[] = [];
let flights = 0;
let longestSkip = 0;
const bands: string[] = [];
for (const ignoreSec of ignores) {
  const snapshot = snapshotAfterIgnore(ignoreSec);
  let band = '';
  let bandFrom = 0;
  const closeBand = (upTo: number): void => { if (band) bands.push(`${ignoreSec} s ${bandFrom}–${upTo}% ${band}`); };
  for (const fuelPct of fuels) {
    const rows = kids.map((kid) => {
      restore(snapshot, fuelPct);
      return fly(kid);
    });
    for (const [i, row] of rows.entries()) {
      flights++;
      outcomes.set(row.status, (outcomes.get(row.status) ?? 0) + 1);
      longestSkip = Math.max(longestSkip, row.longestSkipSec);
      if (row.status === 'approaching' || row.flip || row.flicker || row.longestSkipSec > FEW_SKIP_SEC) {
        bad.push(`ignore ${ignoreSec} s, ${fuelPct}%, ${kids[i]}: "${row.offer}" → ${describe(row)}`);
      }
    }
    const kind = rows[0]!.acceptOnly ? 'ACCEPT only' : rows[0]!.status;
    if (kind !== band) { closeBand(Number((fuelPct - CANONICAL_STEP).toFixed(1))); band = kind; bandFrom = fuelPct; }
  }
  closeBand(FUEL_TOP);
}
check(`Rule 4 sweep: ${flights} flights (ignore ${ignores.join('/')} s × 10–${FUEL_TOP}% FUEL in ${CANONICAL_STEP}% steps × ${kids.join('/')}) all end; no FLIP or FLICKER; `
  + `no SKIP over ${FEW_SKIP_SEC} s`,
bad.length === 0 && flights === ignores.length * fuels.length * kids.length,
bad.slice(0, 6).join(' | ') || `${[...outcomes].map(([status, count]) => `${count} ${status}`).join(', ')}; `
  + `longest SKIP ${longestSkip.toFixed(1)} s; bands (obey): ${bands.join(' / ')}`);

// Below the band where the whole tank braked at ▼ still reaches the printers: the STRANDED line, with SKIP refused.
// LEAD-2: on ship 1 that is up to 12% (it was 13%, the old dead end: the brake at ▼ that would save it was beyond
// the SKIP budget).
{
  restore(snapshotAfterIgnore(60), 10);
  const pred = getPrediction();
  check('10% after 60 s of ignoring: ACCEPT ORBIT only, it strands, the STRANDED line',
    pred.acceptOnly && pred.strandedAnyway && text(harness) === STRANDED_LINE, `"${text(harness)}"`);
}

// --- Review round 3: captures with ▼ under the ring -----------------------------------------------------------
// The verifier's capture (.tmp/verify-lead1-r2/offring-rule4.ts): the opening correction cut short at ▼ =
// lowestKm and SKIPped past, held through HOLD [SPACE] NOW until the loop closes, let go, left alone ignoreSec.
// LEAD-2: FLIPs and FLICKERs fail here too (round 3 only counted them: the held last FUEL's dry-end flicker, a burn
// that is gone with the last FUEL).
{
  const lows = byDepth([4300, 4900], [4300, 4700, 4900]);
  const offRingIgnores = byDepth([90], ignores);
  // Quick depth: every 18% (10, 28, 46: ACCEPT only, ACCEPTED and LOCKED on ship 1); full: every 1%.
  const offRingStep = Number(process.env.OFFRING_FUEL_STEP ?? byDepth('18', '1'));
  const offRingFuels: number[] = [];
  for (let fuel = 10; fuel <= FUEL_TOP + 1e-9; fuel += offRingStep) offRingFuels.push(Number(fuel.toFixed(1)));
  const offRingSnapshot = (lowestKm: number, ignoreSec: number): GameState => {
    captureOffRing(harness, lowestKm);
    stepUntil(harness, () => /HOLD \[SPACE\] NOW/.test(text(harness)), 120);
    harness.keyDown('Space');
    stepUntil(harness, () => getPrediction().outcome === 'closed', 60);
    harness.keyUp('Space');
    idle(harness, ignoreSec);
    if (harness.status() !== 'approaching' || getPrediction().outcome !== 'closed' || getPrediction().fit.rp >= state().level.ring.min) {
      throw new Error(`offRingSnapshot(${lowestKm}, ${ignoreSec}): not a closed loop with ▼ under the ring (${harness.status()})`);
    }
    return structuredClone(state());
  };
  const offRingOutcomes = new Map<string, number>();
  const offRingBad: string[] = [];
  const offRingBands: string[] = [];
  let offRingFlights = 0;
  let offRingLongestSkip = 0;
  for (const lowestKm of lows) {
    for (const ignoreSec of offRingIgnores) {
      const snapshot = offRingSnapshot(lowestKm, ignoreSec);
      let band = '';
      let bandFrom = 0;
      const closeBand = (upTo: number): void => { if (band) offRingBands.push(`▼ ${lowestKm} ${ignoreSec} s ${bandFrom}–${upTo}% ${band}`); };
      for (const fuelPct of offRingFuels) {
        const rows = kids.map((kid) => {
          restore(snapshot, fuelPct);
          return fly(kid);
        });
        for (const [i, row] of rows.entries()) {
          offRingFlights++;
          offRingOutcomes.set(row.status, (offRingOutcomes.get(row.status) ?? 0) + 1);
          offRingLongestSkip = Math.max(offRingLongestSkip, row.longestSkipSec);
          const where = `▼ ${lowestKm}, ignore ${ignoreSec} s, ${fuelPct}%, ${kids[i]}`;
          if (row.status === 'approaching' || row.flip || row.flicker || row.longestSkipSec > FEW_SKIP_SEC) {
            offRingBad.push(`${where}: "${row.offer}" → ${describe(row)}`);
          }
        }
        const kind = rows[0]!.acceptOnly ? 'ACCEPT only' : rows[0]!.status;
        if (kind !== band) { closeBand(Number((fuelPct - offRingStep).toFixed(1))); band = kind; bandFrom = fuelPct; }
      }
      closeBand(FUEL_TOP);
    }
  }
  check(`Rule 4 off-ring sweep: ${offRingFlights} flights (▼ ${lows.join('/')} km × ignore ${offRingIgnores.join('/')} s × 10–${FUEL_TOP}% FUEL in `
    + `${offRingStep}% steps × ${kids.join('/')}) all end; no FLIP or FLICKER; no SKIP over ${FEW_SKIP_SEC} s`,
  offRingBad.length === 0 && offRingFlights === lows.length * offRingIgnores.length * offRingFuels.length * kids.length,
  offRingBad.slice(0, 6).join(' | ') || `${[...offRingOutcomes].map(([status, count]) => `${count} ${status}`).join(', ')}; `
    + `longest SKIP ${offRingLongestSkip.toFixed(1)} s; bands (obey): ${offRingBands.join(' / ')}`);
}

finish();
