// LEAD-1 review round 3 (the major): Rule 4 judges "the FUEL is to blame" on the trim's whole fix. A first of
// two trims (both ends of the loop out of the ring, WP1-rules 1) does not lock the orbit by itself, so a tank
// that pays for the first burn alone is still short. Before this round, after a capture with ▼ under the ring,
// the PRO at ▲ cost 0.1% and counted as paid, the RETRO at ▼ after it cost 31%, and 10–30% FUEL was offered
// `WAIT — burn at ▲ in m:ss · [F] SKIP`: a SKIP of 2.6 wall hours.
// Planted loops with ▼ under the ring and ▲ far above it, the ship on its climb with no shrink offered, so the
// plan is the first of two trims, the PRO at ▲:
// • beyond the budget: the first burn paid but not the whole fix → ACCEPT ORBIT only; the whole fix paid →
//   the WAIT stays (deviation 1: it locks);
// • within the budget: the whole tank spent on the fix still strands → ACCEPT ORBIT only (the strand verdict is
//   priced the same way); it does not strand → the WAIT and its SKIP stay.
// LEAD-2: the budget is gone (the coast SKIP crosses any WAIT in seconds), so "beyond the budget" is now about the
// ▲ far out: there the PRO at ▲'s whole ring is narrower than one tick of thrust (predict.ts trimFlyable), so the
// first of the two is the RETRO at ▼, and the tank is judged on that pair. Short of the whole fix it keeps its
// WAIT while the rest reaches the printers, and paid it locks; either way the WAIT is a few seconds of SKIP.
import { createHarness, check, finish, TICK } from '../../wp1/harness';
import { getPrediction, computePrediction, sweetZone } from '@systems/predict';
import { engineAccel } from '@systems/orbit-sim';
import { STRANDED_LINE } from '@systems/guidance';
import { stateFromElements } from '@/types/orbit';
import { text, placeOrbit, obey } from '../../wp1-rules/flows';
import { RA_TARGET_FRAC, SKIP_DIVISOR, SKIP_RAMP_SEC } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { planet, ring, tacticalWarp } = state().level;
const mu = planet.mu;
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + 1;

// The ship on a loop rp × ra, `trueAnomalyDeg` past ▼ (outbound), with `fuelPct` FUEL, at rest.
function plant(rp: number, ra: number, trueAnomalyDeg: number, fuelPct: number): void {
  harness.reset(1);
  placeOrbit(harness, stateFromElements(rp, (ra - rp) / (ra + rp), 0, (trueAnomalyDeg * Math.PI) / 180, mu));
  harness.store.mutate((d) => {
    d.burn.fuelPct = fuelPct; d.burn.acceptOnly = false; d.burn.sasMode = 'off'; d.burn.closedIdleAiSec = 0;
  });
  for (let i = 0; i < 4; i++) harness.step();
}

// The whole fix in FUEL %: the first burn is the plan's own; the second is the plan of the loop the first leaves
// (▼ at its target, the sweet zone's low edge), seen on its way in to ▼, where it is a single RETRO trim.
function wholeFixPct(rp: number, ra: number, trueAnomalyDeg: number): number {
  plant(rp, ra, trueAnomalyDeg, 100);
  const firstPct = getPrediction().neededPct;
  const raisedRp = sweetZone(ring).lo;
  plant(raisedRp, ra, -30, 100);
  const second = getPrediction();
  if (second.burnPoint?.reason !== 'ra-high') throw new Error(`wholeFixPct: the loop after the first trim plans ${second.burnPoint?.reason}`);
  return firstPct + second.neededPct;
}

interface Seen {
  reason: string | undefined;
  firstOfTwo: boolean;
  event: string | undefined;
  neededPct: number;
  waitTac: number;
  acceptOnly: boolean;
  strandedAnyway: boolean;
  line: string;
}

function look(): Seen {
  const pred = getPrediction();
  const burnPoint = pred.burnPoint;
  return {
    reason: burnPoint?.reason, firstOfTwo: burnPoint?.firstOfTwo ?? false, event: burnPoint?.event, neededPct: pred.neededPct,
    waitTac: burnPoint ? burnPoint.inSec / tacticalWarp : NaN,
    acceptOnly: pred.acceptOnly, strandedAnyway: pred.strandedAnyway, line: text(harness),
  };
}

const describe = (seen: Seen): string =>
  `${seen.reason}${seen.firstOfTwo ? ' (first of two)' : ''} at ${seen.event}, first ${seen.neededPct.toFixed(2)}%, `
  + `WAIT ${seen.waitTac.toFixed(0)} tac s, acceptOnly ${seen.acceptOnly}, stranded ${seen.strandedAnyway}: "${seen.line}"`;

const isFirstOfTwoAtApo = (seen: Seen): boolean => seen.reason === 'rp-low' && seen.firstOfTwo && seen.event === 'apo';
const isFirstOfTwoAtPeri = (seen: Seen): boolean => seen.reason === 'ra-high' && seen.firstOfTwo && seen.event === 'peri';

// The setup itself: with a full tank no shrink takes the trim's place, so the plan is a trim.
const lowRp = ring.min - 300;
const farRa = 200 * ring.max;
{
  plant(lowRp, farRa, 160, 100);
  const seen = look();
  // The PRO at ▲'s ring window (▼ moved from the ring's inner edge to its outer one) against one TACTICAL tick.
  const vis = (radius: number, semiMajor: number): number => Math.sqrt(mu * (2 / radius - 1 / semiMajor));
  const windowKmS = vis(farRa, (farRa + ring.max) / 2) - vis(farRa, (farRa + ring.min) / 2);
  const tickKmS = engineAccel(state()) * TICK * tacticalWarp;
  check('setup: ▼ under the ring, ▲ far above it: the PRO at ▲ can\'t be flown (its ring is narrower than a tick of thrust), '
    + 'so the first of the two trims is the RETRO at ▼',
  isFirstOfTwoAtPeri(seen) && windowKmS < tickKmS,
  `${describe(seen)}; ring window at ▲ ${(windowKmS * 1000).toFixed(2)} m/s, one tick ${(tickKmS * 1000).toFixed(2)} m/s`);
}

// --- ▲ far out: the pair is the RETRO at ▼, then the PRO at ▲ ---------------------------------------------------
{
  plant(lowRp, farRa, 160, 100);
  const firstPct = getPrediction().neededPct;
  // The second burn: the PRO at ▲ of the loop the first leaves (▲ at RA_TARGET_FRAC of the ring's edge), seen climbing.
  plant(lowRp, RA_TARGET_FRAC * ring.max, 160, 100);
  const second = getPrediction();
  if (second.burnPoint?.reason !== 'rp-low') throw new Error(`the loop after the first trim plans ${second.burnPoint?.reason}`);
  const wholePct = firstPct + second.neededPct;

  // Paid for the first burn, a few % short of the whole fix: the rest at ▲ still reaches the printers.
  const shortPct = wholePct - 3;
  plant(lowRp, farRa, 160, shortPct);
  const short = look();
  const shortLog = obey(harness, 300);
  check(`▲ far out, ${shortPct.toFixed(1)}% (first burn ${firstPct.toFixed(1)}%, whole fix ${wholePct.toFixed(1)}%): the WAIT stays `
    + '(no ACCEPT-only verdict), a few seconds of SKIP, and it ends ACCEPTED or LOCKED',
  isFirstOfTwoAtPeri(short) && shortPct >= firstPct && !short.acceptOnly && /^(WAIT|LOOP TOO BIG)/.test(short.line)
    && ['accepted', 'locked'].includes(harness.status()) && shortLog.skipWallSec <= 2 * FEW_SKIP_SEC,
  `${describe(short)} → ${harness.status()}, SKIP ${shortLog.skipWallSec.toFixed(1)} s (two WAITs)`);

  const paidPct = Math.min(100, wholePct + 3);
  plant(lowRp, farRa, 160, paidPct);
  const paid = look();
  const paidLog = obey(harness, 300);
  check(`▲ far out, ${paidPct.toFixed(1)}% pays for the whole fix: the WAIT stays, a few seconds of SKIP, and it locks`,
    isFirstOfTwoAtPeri(paid) && !paid.acceptOnly && /^(WAIT|LOOP TOO BIG)/.test(paid.line) && harness.status() === 'locked'
    && paidLog.skipWallSec <= 2 * FEW_SKIP_SEC,
    `${describe(paid)} → ${harness.status()}, SKIP ${paidLog.skipWallSec.toFixed(1)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- ▲ nearer: the PRO at ▲ first, and the strand verdict is priced on the whole fix too ------------------------
{
  const nearRa = 3.3 * ring.max;
  plant(lowRp, nearRa, 160, 100);
  const near = look();
  const firstPct = near.neededPct;
  check('▲ nearer: the same kind of loop, the PRO at ▲ (flyable) is the first of two trims', isFirstOfTwoAtApo(near), describe(near));

  // Just past the first burn: what is left can't move ▲ in far enough to reach the printers.
  const strandPct = firstPct + 0.3;
  plant(lowRp, nearRa, 160, strandPct);
  const strands = look();
  check(`▲ nearer, ${strandPct.toFixed(2)}% (first burn ${firstPct.toFixed(2)}% paid, the rest strands at ▼): `
    + 'ACCEPT ORBIT only, the STRANDED line',
  isFirstOfTwoAtApo(strands) && strands.acceptOnly && strands.strandedAnyway && strands.line === STRANDED_LINE, describe(strands));

  // Enough left after the first burn for the RETRO at ▼ to reach the printers, though not to lock.
  const wholePct = wholeFixPct(lowRp, nearRa, 160);
  const savesPct = wholePct - 2;
  plant(lowRp, nearRa, 160, savesPct);
  const saves = look();
  const pure = computePrediction(state());
  // With ▲ seconds away the strip names the preset first (`▼ TOO LOW — at ▲ press [W] (PRO) and burn`), then the WAIT.
  check(`▲ nearer, ${savesPct.toFixed(1)}% (whole fix ${wholePct.toFixed(1)}%): the rest at ▼ still reaches the `
    + 'printers, so the trim and its WAIT stay',
  isFirstOfTwoAtApo(saves) && !saves.acceptOnly && !pure.acceptOnly && /^(▼ TOO LOW|WAIT)/.test(saves.line) && savesPct < wholePct,
  describe(saves));
}

finish();
