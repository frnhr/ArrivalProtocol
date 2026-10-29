// LEAD-2 item 2: Rule 4 strands only when the FUEL is to blame. Runs on any ship (AP_SHIP; per-ship.test.ts).
//  1. The verifier's paid-but-stranded rows (.tmp/verify-lead1-r3/paid-but-stranded.ts): ▼ under the ring at the
//     capture (4,300 km), ignored 120 s, a tank about the size of the whole two-burn fix. The strip used to say
//     `NOT ENOUGH FUEL to reach the printers` beside a tank that paid for the fix (the WAIT was beyond the SKIP
//     budget); now a paid fix keeps its WAIT (a few seconds of SKIP) and locks, and a short one still ends ACCEPTED.
//  2. A save the strip promises is kept: across the band where the whole tank braked at ▼ crosses the strand line,
//     every tank shown a WAIT (not the STRANDED line) ends ORBIT ACCEPTED or LOCKED for kids reacting at once, 0.3 s
//     and 0.5 s late, and every tank shown the STRANDED line really could not reach the printers there.
//  3. No time-based branch is left: no line says LAST FUEL, and no WAIT is beyond a few seconds of SKIP.
import { createHarness, check, finish, followStrip, TICK, HARNESS_SHIP } from '../wp1/harness';
import { getPrediction, computePrediction } from '@systems/predict';
import { STRANDED_LINE } from '@systems/guidance';
import { captureOffRing, releaseAtCapture, idle, obey, text, stepUntil } from '../wp1-rules/flows';
import { loopRange } from '@/types/orbit';
import { STRANDED_RANGE_FRAC, SKIP_DIVISOR, SKIP_RAMP_SEC, SKIP_EASE_OUT_SEC } from '@data/tuning';
import { byDepth } from '../depth';
import type { GameState } from '@state/schema';

const harness = createHarness(1);
const state = () => harness.store.getState();
const ship = `ship ${HARNESS_SHIP + 1}`;
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + SKIP_EASE_OUT_SEC + 1;
const KIDS = ['obey', 0.3, 0.5] as const;
// Quick depth (tests/unit/depth.ts): the instant and the slowest kid (as the other sweeps); full: all three.
const kids = byDepth<readonly typeof KIDS[number][]>(['obey', 0.5], KIDS);

function restore(snapshot: GameState, fuelPct: number): void {
  harness.reset(1);
  harness.store.update((d) => { Object.assign(d, structuredClone(snapshot)); });
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; d.burn.acceptOnly = false; });
  for (let i = 0; i < 4; i++) harness.step();
}

interface Flown { status: string; longestSkipSec: number; lines: string[] }

function fly(kid: typeof KIDS[number]): Flown {
  let run = 0;
  let longest = 0;
  const lines: string[] = [];
  const watch = (): void => {
    run = state().clock.pace === 'skip' ? run + TICK : 0;
    longest = Math.max(longest, run);
    const line = text(harness).replace(/\d+:\d+/g, 'm:ss');
    if (lines[lines.length - 1] !== line) lines.push(line);
  };
  if (kid === 'obey') obey(harness, 400, watch);
  else followStrip(harness, kid, 400, watch);
  return { status: harness.status(), longestSkipSec: longest, lines };
}

// --- 1. Paid but stranded (the verifier's probe) ------------------------------------------------------------------
{
  captureOffRing(harness, 4300);
  stepUntil(harness, () => /HOLD \[SPACE\] NOW/.test(text(harness)), 120);
  harness.keyDown('Space');
  stepUntil(harness, () => getPrediction().outcome === 'closed', 60);
  harness.keyUp('Space');
  idle(harness, 120);
  const snapshot = structuredClone(state());
  const rows: string[] = [];
  let bad = '';
  // Quick depth: the band's ends and its middle; full: two more points.
  for (const fuelPct of byDepth([30, 34, 44], [30, 32, 34, 38, 44])) {
    restore(snapshot, fuelPct);
    const pred = getPrediction();
    const offer = text(harness);
    const flown = fly('obey');
    rows.push(`${fuelPct}%: "${offer.replace(/\d+:\d+/, 'm:ss')}" → ${flown.status}, SKIP ${flown.longestSkipSec.toFixed(1)} s`);
    if (pred.acceptOnly || offer === STRANDED_LINE || flown.status === 'stranded' || flown.longestSkipSec > FEW_SKIP_SEC) bad ||= rows[rows.length - 1]!;
  }
  check(`${ship}: ▼ under the ring, ignored 120 s, 30–44% FUEL: never the STRANDED line, never STRANDED, every SKIP a few seconds`,
    bad === '', bad || rows.join(' | '));
}

// --- 2. The strand line: the strip's verdict matches the flight, kid by kid ---------------------------------------
// After a let-go-at-CAPTURED capture left 60 s, the tank is stepped across the line where the whole tank braked at
// ▼ stops reaching the printers.
{
  releaseAtCapture(harness);
  idle(harness, 60);
  const snapshot = structuredClone(state());
  const { ring, planet, dvBudgetKmS } = snapshot.level;
  const pred0 = computePrediction({ ...snapshot, burn: { ...snapshot.burn, acceptOnly: false } });
  const vis = (radius: number, semiMajor: number): number => Math.sqrt(planet.mu * (2 / radius - 1 / semiMajor));
  const rangeAtPeri = (fuelPct: number): number => {
    const speed = vis(pred0.rp, (pred0.rp + pred0.ra) / 2) - (fuelPct / 100) * dvBudgetKmS;
    const other = 2 / (2 / pred0.rp - (speed * speed) / planet.mu) - pred0.rp;
    return loopRange(Math.min(pred0.rp, other), Math.max(pred0.rp, other), ring);
  };
  // The tank whose brake at ▼ ends right on the strand line, to half a percent.
  let lineFuel = 1;
  while (rangeAtPeri(lineFuel) < STRANDED_RANGE_FRAC && lineFuel < 100) lineFuel += 0.5;
  const rows: string[] = [];
  let bad = '';
  let saves = 0;
  let strandedLines = 0;
  // Quick depth (tests/unit/depth.ts): the line ±2% in 1% steps; full: in 0.5% steps.
  const step = byDepth(1, 0.5);
  for (let fuelPct = lineFuel - 2; fuelPct <= lineFuel + 2 + 1e-9; fuelPct += step) {
    for (const kid of kids) {
      restore(snapshot, fuelPct);
      const offer = text(harness);
      const estimate = rangeAtPeri(fuelPct);
      if (offer === STRANDED_LINE) {
        strandedLines++;
        if (estimate >= STRANDED_RANGE_FRAC + 0.002) bad ||= `${fuelPct}%: the STRANDED line, but the brake at ▼ reaches ${(estimate * 100).toFixed(2)}%`;
        continue;
      }
      const flown = fly(kid);
      saves++;
      rows.push(`${fuelPct}% ${kid}: ${flown.status}`);
      if (!['accepted', 'locked'].includes(flown.status) || flown.lines.some((line) => /LAST FUEL/.test(line))) {
        bad ||= `${fuelPct}% (${kid}): "${offer}" → ${flown.status}, estimate ${(estimate * 100).toFixed(2)}%`;
      }
    }
  }
  check(`${ship}: across the strand line (${(lineFuel - 2).toFixed(1)}–${(lineFuel + 2).toFixed(1)}% FUEL × ${kids.length} kids): every save the strip `
    + 'promises ends ACCEPTED or LOCKED, and the STRANDED line is shown only where the brake at ▼ really strands',
  bad === '' && saves > 0 && strandedLines > 0, bad || `${saves} saves flown, ${strandedLines} STRANDED lines`);
}

finish();
