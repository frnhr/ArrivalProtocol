// LEAD-1 review round 1: when does the strip name ACCEPT ORBIT on a short tank?
// The first LEAD-1 build swapped SKIP for ` · or ACCEPT ORBIT` on any trim the tank could not pay for that was
// more than SHRINK_RESERVE_WAIT_TAC away, even when that ACCEPT strands the ship and burning the tank at the
// trim's apsis would still save it (25–46% printer range: .tmp/review/LEAD-1/quality/late-climb-accept*.ts).
// In the truly hopeless case it still showed a 35,364-minute countdown, a glowing SKIP that runs six wall
// hours (the blue MIND CLEAR hint: stranded-blue.test.ts).
// Now Prediction.strandedAnyway decides: only when no burn the tank can make reaches the printers does the
// strip say `NOT ENOUGH FUEL to reach the printers — ACCEPT ORBIT`, with SKIP refused. Otherwise the WAIT and
// its SKIP stay, and ACCEPT is named only where it does not strand (the WP1 rule).
import { createHarness, check, finish, TICK } from '../../wp1/harness';
import { getPrediction, computePrediction } from '@systems/predict';
import { acceptStrands, buildFlightContext, flightObjective, STRANDED_LINE } from '@systems/guidance';
import { skipBlockReason, SKIP_REFUSAL_STRANDED } from '@systems/pace';
import { elementsFromState, stateFromElements } from '@/types/orbit';
import { releaseAtCapture, placeOrbit, text } from '../../wp1-rules/flows';
import { STRANDED_RANGE_FRAC } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const mu = state().level.planet.mu;

// Burns the whole tank RETRO just before ▼ of this loop and returns the printer range it ends on.
function burnAtPeri(rp: number, ecc: number, omega: number): number {
  placeOrbit(harness, stateFromElements(rp, ecc, omega, -0.02, mu));
  harness.store.mutate((draft) => { draft.burn.sasMode = 'retrograde'; });
  for (let i = 0; i < 4; i++) harness.step();
  harness.keyDown('Space');
  let guard = 0;
  while (harness.status() === 'approaching' && state().burn.fuelPct > 0 && guard++ < 4000) harness.step(TICK);
  harness.keyUp('Space');
  for (let i = 0; i < 10; i++) harness.step();
  return computePrediction(state()).greenFraction;
}

// --- The reviewer's loops: ▼ in the ring, ▲ far above, the ship falling toward ▼, the tank 60% of the trim ---
{
  const rows: string[] = [];
  let bad = '';
  const rp = 5600;
  for (const ra of [30000, 60000, 120000]) {
    for (const nuDeg of [-110, -165]) {
      harness.reset(1);
      const ecc = (ra - rp) / (ra + rp);
      placeOrbit(harness, stateFromElements(rp, ecc, 0, (nuDeg * Math.PI) / 180, mu));
      harness.store.mutate((draft) => { draft.burn.sasMode = 'off'; draft.burn.firing = false; draft.burn.closedIdleAiSec = 0; });
      for (let i = 0; i < 4; i++) harness.step();
      const fuelPct = Math.max(1, getPrediction().neededPct * 0.6);
      harness.store.mutate((draft) => { draft.burn.fuelPct = fuelPct; });
      for (let i = 0; i < 4; i++) harness.step();
      const pred = getPrediction();
      const objective = flightObjective(buildFlightContext(state(), pred));
      const skip = skipBlockReason(state(), pred);
      const strandsNow = acceptStrands(pred);
      const saved = burnAtPeri(rp, ecc, 0);
      rows.push(`▲ ${ra} ν ${nuDeg}°: "${objective?.text}" (ACCEPT now ${(pred.greenFraction * 100).toFixed(1)}%, at ▼ ${(saved * 100).toFixed(1)}%)`);
      if (!strandsNow || saved < STRANDED_RANGE_FRAC) bad ||= `setup: ${rows[rows.length - 1]}`;
      if (pred.strandedAnyway || /ACCEPT/.test(objective?.text ?? '') || objective?.showAccept || skip === SKIP_REFUSAL_STRANDED) {
        bad ||= rows[rows.length - 1]!;
      }
    }
  }
  check('a short tank whose burn at ▼ still saves the ship: no stranding ACCEPT on the strip, SKIP not refused for it',
    bad === '', bad || rows.join(' | '));
}

// --- The capture loop, past ▲ (no shrink there): the WAIT for ▼ and its SKIP stay when the burn there saves ---
{
  const rows: string[] = [];
  let bad = '';
  for (const fuelPct of [18, 26]) {
    releaseAtCapture(harness);
    const elements = elementsFromState(state().orbit, mu);
    placeOrbit(harness, stateFromElements(elements.rp, elements.e, elements.omega, (-150 * Math.PI) / 180, mu));
    harness.store.mutate((draft) => { draft.burn.fuelPct = fuelPct; draft.burn.closedIdleAiSec = 0; });
    for (let i = 0; i < 4; i++) harness.step();
    const pred = getPrediction();
    const line = text(harness);
    const saved = burnAtPeri(elements.rp, elements.e, elements.omega);
    rows.push(`${fuelPct}%: "${line}" (at ▼ ${(saved * 100).toFixed(1)}%)`);
    if (pred.strandedAnyway || !/^WAIT — brake at ▼ in \d+:\d\d · \[F\] SKIP$/.test(line) || saved < STRANDED_RANGE_FRAC) bad ||= rows[rows.length - 1]!;
  }
  check('the capture loop past ▲: `WAIT — brake at ▼ in m:ss · [F] SKIP`, no ACCEPT (it strands; the burn at ▼ does not)',
    bad === '', bad || rows.join(' | '));
}

// --- A loop no burn can save: the strip names ACCEPT ORBIT, SKIP is refused, the countdown is no SKIP target ---
{
  harness.reset(1);
  const rp = 5600;
  const ra = 120000;
  placeOrbit(harness, stateFromElements(rp, (ra - rp) / (ra + rp), 0, (-110 * Math.PI) / 180, mu));
  harness.store.mutate((draft) => { draft.burn.sasMode = 'off'; draft.burn.firing = false; draft.burn.fuelPct = 3; });
  for (let i = 0; i < 4; i++) harness.step();
  const pred = getPrediction();
  const objective = flightObjective(buildFlightContext(state(), pred));
  const skip = skipBlockReason(state(), pred);
  harness.press('KeyF');
  harness.step();
  const skipping = state().clock.skipWarp !== null;
  const saved = burnAtPeri(rp, (ra - rp) / (ra + rp), 0);
  check(`no burn can save it (3% on ▲ 120,000 km): "${STRANDED_LINE}", ACCEPT shown, SKIP refused and F does nothing`,
    pred.strandedAnyway && objective?.id === 'F11-stranded' && objective.showAccept && objective.urgency === 'wait'
    && skip === SKIP_REFUSAL_STRANDED && !skipping && saved < STRANDED_RANGE_FRAC,
    `"${objective?.text}", SKIP ${skip}; the whole tank at ▼ gives ${(saved * 100).toFixed(1)}%`);
}

finish();
