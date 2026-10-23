// WP1-rules 1: when both ends of a closed loop are out of the ring, the trim plan fixes the end
// whose burn comes first, not §6.2's fixed "▼ at ▲ first". Covers the WP1 verifier's Deferred 4
// (a capture with ▼ below the ring took about 10 minutes, 508–567 s of it SKIP to ▲).
import { createHarness, check, finish } from '../wp1/harness';
import { computePrediction, getPrediction } from '@systems/predict';
import { plotChip } from '@systems/flight-hud';
import { stateFromElements } from '@/types/orbit';
import { STAR_FUEL_PCT } from '@data/tuning';
import { text, stepUntil, placeOrbit, captureOffRing, obey } from './flows';

const harness = createHarness(1);
const state = () => harness.store.getState();
const mu = state().level.planet.mu;

// --- The verifier's low captures: ▼ below the ring, the correction skipped, then obeyed ---------
for (const lowestKm of [4300, 4700, 4900]) {
  captureOffRing(harness, lowestKm);
  const start = harness.wall();
  let closedLine = '';
  let closedChip = '';
  let longestWaitAfterClose = 0;
  const log = obey(harness, 400, () => {
    const pred = getPrediction();
    if (!closedLine && pred.outcome === 'closed') { closedLine = text(harness); closedChip = plotChip(state(), pred).text; }
    const wait = closedLine ? text(harness).match(/^WAIT — .* in (\d+):(\d+)/) : null;
    if (wait) longestWaitAfterClose = Math.max(longestWaitAfterClose, Number(wait[1]) * 60 + Number(wait[2]));
  });
  const wallSec = harness.wall() - start;
  const fuel = state().burn.fuelPct;
  check(`low capture ▼ ${lowestKm}: once the loop closes the kid keeps braking at ▼ (not TOO EARLY, burn at ▲)`,
    closedLine === 'KEEP HOLDING — shrink the loop' && closedChip === 'CAPTURED · LOOP TOO BIG',
    `"${closedLine}" / chip "${closedChip}"`);
  check(`low capture ▼ ${lowestKm}: locks within 90 s with the ★ FUEL left, no WAIT over 500 tac s after closing`,
    harness.status() === 'locked' && wallSec < 90 && fuel >= STAR_FUEL_PCT && longestWaitAfterClose < 500,
    `${harness.status()} after ${wallSec.toFixed(1)} s (was 562–622 s), SKIP ${log.skipWallSec.toFixed(1)} s, `
    + `longest WAIT ${longestWaitAfterClose} tac s, FUEL ${fuel.toFixed(1)}%`);
  check(`low capture ▼ ${lowestKm}: the hand-over names the next burn instead of TOO EARLY`,
    log.lines.includes('RELEASE [SPACE]! — next: burn at ▲ in m:ss') && !log.lines.some((line) => /^TOO EARLY/.test(line)),
    log.lines.slice(3, 8).join(' | '));
}

// --- The plan on one both-out loop at four places around it ------------------------------------
{
  harness.reset(1);
  const rp = 4500;
  const ra = 20000;
  const e = (ra - rp) / (ra + rp);
  const at = (nu: number) => { placeOrbit(harness, stateFromElements(rp, e, 0, nu, mu)); return computePrediction(state()).burnPoint; };
  const beforeLowest = at(-0.3);
  const beforeHighest = at(Math.PI - 0.15);
  // 0.005 rad past ▲ is about 6 tactical s there (▲ is slow), inside LATE_TRIM_TAC.
  const pastHighest = at(-Math.PI + 0.005);
  check('both out, falling toward ▼: fix ▲ at ▼ first (RETRO)',
    beforeLowest?.reason === 'ra-high' && beforeLowest.event === 'peri' && beforeLowest.preset === 'retrograde' && beforeLowest.approaching,
    `${beforeLowest?.reason} at ${beforeLowest?.event}`);
  check('both out, climbing toward ▲: fix ▼ at ▲ first (PRO)',
    beforeHighest?.reason === 'rp-low' && beforeHighest.event === 'apo' && beforeHighest.preset === 'prograde' && beforeHighest.approaching,
    `${beforeHighest?.reason} at ${beforeHighest?.event}`);
  check('both out, just past ▲: the ▼ fix there is still due now',
    pastHighest?.reason === 'rp-low' && pastHighest.eventInSec < 0,
    `${pastHighest?.reason} eventInSec ${pastHighest?.eventInSec.toFixed(0)}`);
}

// --- One end out: unchanged §6.2 (rule 1 only picks between two wrong ends) -------------------
{
  harness.reset(1);
  const rp = 4500;
  const ra = 8000;
  const e = (ra - rp) / (ra + rp);
  placeOrbit(harness, stateFromElements(rp, e, 0, -0.3, mu));
  const nearLowest = computePrediction(state()).burnPoint;
  check('only ▼ out: fixed at ▲ even when ▼ is next', nearLowest?.reason === 'rp-low' && nearLowest.event === 'apo',
    `${nearLowest?.reason} at ${nearLowest?.event}`);
}

// --- ▼ above the ring (TOO WIDE, braked anyway): rule 1 brakes on at ▼ too --------------------
// Both trims are RETRO there (▲ at ▼, ▼ at ▲). Fix round 1: a burn the strip asked for that hands
// over to the other trim reads RELEASE [SPACE]! — next: …, never TOO EARLY (the throttle remembers
// which burn it was pressed for, burn.firingFor).
for (const lowestKm of [9100, 9200, 9300]) {
  captureOffRing(harness, lowestKm);
  const start = harness.wall();
  let closedLine = '';
  const log = obey(harness, 400, () => {
    if (!closedLine && getPrediction().outcome === 'closed' && !/close the loop/.test(text(harness))) closedLine = text(harness);
  });
  const scolded = log.lines.findIndex((line, i) => i > 0 && /^TOO EARLY/.test(line) && /^KEEP HOLDING/.test(log.lines[i - 1]!));
  check(`capture with ▼ at ${lowestKm} (above the ring): obeying locks within 80 s (was 79.9 s at 9,200)`,
    harness.status() === 'locked' && harness.wall() - start < 80,
    `first closed-loop line "${closedLine}", ${harness.status()} after ${(harness.wall() - start).toFixed(1)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
  check(`capture with ▼ at ${lowestKm}: no TOO EARLY right after a KEEP HOLDING for the same RETRO`,
    scolded < 0 && log.lines.includes('RELEASE [SPACE]! — next: burn at ▲ in m:ss'),
    scolded < 0 ? log.lines.slice(3, 12).join(' | ') : `${log.lines[scolded - 1]} → ${log.lines[scolded]}`);
}

// --- The verifier's TOO WIDE kid: overshoots OUT 3.5 s past "too far", then obeys ------------------
{
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(harness, () => /too far/.test(text(harness)), 40);
  for (let i = 0; i < 70; i++) harness.step();
  harness.keyUp('Space');
  const start = harness.wall();
  const log = obey(harness, 400);
  check('overshoot OUT then obey: ends locked or accepted, never crashed or flown away',
    harness.status() === 'locked' || harness.status() === 'accepted',
    `${harness.status()} after ${(harness.wall() - start).toFixed(1)} s, SKIP ${log.skipWallSec.toFixed(1)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

finish();
