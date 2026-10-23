// LEAD-1 items 2 and 3, as reworked in review round 1: the shrink and a tank that is short.
// (2) After a let-go-at-CAPTURED capture left to ride 60 s, a tank of 10–32% used to get
//     `WAIT — brake at ▼ in 35364:28 · [F] SKIP` (about six wall hours of SKIP;
//     .tmp/verify-wp1-rules/logs/spec-fuel-band2.log). Now (the trim at ▼ costs 31.4% here):
//     • a tank that can bring the WAIT down to SHRINK_LOCK_WAIT_MAX_TAC (about a minute of SKIP; ≈ 32.5% and
//       up here) gets the shrink, and it locks, for an instant kid and for a 0.3 / 0.5 s reaction alike;
//     • a tank that can't pay for the trim, or can but would still leave more than that (31.4–32%: review
//       round 1 measured up to `WAIT — brake at ▼ in 4829:39` after 120 s of ignoring), spends its last FUEL
//       now when that ends on a loop the printers reach: ORBIT ACCEPTED within seconds, with no RELEASE
//       before the tank is dry (it used to stop a step short, or at the over-hold margin);
//     • when no burn the tank can make reaches the printers (≤ 12% here), the strip says so and names
//       ACCEPT ORBIT, and SKIP is refused (`NOT ENOUGH FUEL`).
//     A hold pressed for the shrink is never turned into the last FUEL (review round 1: held 0.15 s past its
//     stop, the strip flipped from RELEASE to `KEEP HOLDING — until the FUEL runs out` and the lock was lost).
// (3) The reserve has a floor (SHRINK_FUEL_RESERVE_MIN_TAC of burning), so a 1.2 s late release of a
//     FUEL-limited shrink no longer empties the tank (it ended ORBIT ACCEPTED instead of LOCKED).
// LEAD-2 (the coast SKIP): every WAIT now takes a few seconds of SKIP, so the time-based branch is gone: no last
// FUEL, no SHRINK_LOCK_WAIT_MAX_TAC (tuning.ts says why). A tank short of the trim waits for ▼ and spends itself
// there (`KEEP HOLDING — it may take all your FUEL`, LEAD-2 review round 1's wording), which ends ORBIT ACCEPTED on a better loop than the last FUEL
// did (30%: 84% printer range against 48%); a tank that pays for the trim locks. The checks below keep LEAD-1's
// structure; each changed one says what it used to check.
import { createHarness, check, finish, followStrip, TICK } from '../wp1/harness';
import { getPrediction, computePrediction } from '@systems/predict';
import { skipBlockReason, SKIP_REFUSAL_STRANDED } from '@systems/pace';
import { buildFlightContext, flightObjective, STRANDED_LINE, KEEP_TO_EMPTY_LINE } from '@systems/guidance';
import { text, stepUntil, obey, ignoredAtCapture } from '../wp1-rules/flows';
import { byDepth } from '../depth';
import {
  STRANDED_RANGE_FRAC, MAX_LINE_CHARS, SKIP_DIVISOR, SKIP_RAMP_SEC, SKIP_EASE_OUT_SEC,
} from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { tacticalWarp, aNominalKmS2, dvBudgetKmS } = state().level;
// WP7 fix round 1: the reserve's floor is the ship's own shrink.marginMinTac (SHRINK_FUEL_RESERVE_MIN_TAC,
// which only restated it, is gone).
const floorPct = (100 * state().level.shrink.marginMinTac * tacticalWarp * aNominalKmS2) / dvBudgetKmS;
// LEAD-2: the longest a single SKIP may take (its ramp, SKIP_DIVISOR at its warp, its ease-out and a tick or two).
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + SKIP_EASE_OUT_SEC + 1;

// The verifier's state: let go at CAPTURED, `ignoreSec` ignored (SHRINK THE LOOP is up with a full tank),
// then the tank set to `fuelPct` (as if the kid had wasted the rest earlier).
// The capture and the ignore are flown once per ignore time and restored after that (flows.ts ignoredAtCapture).
function lowTank(fuelPct: number, ignoreSec = 60): void {
  ignoredAtCapture(harness, ignoreSec);
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; });
  for (let i = 0; i < 4; i++) harness.step();
}

// What a kid saw on the way to the end of the flight: the strip's lines and the failures review round 1
// found. `kid` is 'obey' (flows.obey, instant) or a followStrip reaction in seconds.
interface Flown {
  offer: string;
  status: string;
  wallSec: number;
  range: number;
  flipToLast: boolean;        // RELEASE → `KEEP HOLDING — it may take all your FUEL`
  // FUEL left when `… it may take all your FUEL` turned into a RELEASE. LEAD-2: only a fault when the flight then did not
  // lock: a tank a hair short of the impulsive estimate reaches the ring after all (obeyed trims spend less than it),
  // and RELEASE there is the lock, a better end than the one promised.
  releaseInLast: number | null;
  longestSkipSec: number;     // LEAD-2: the longest single SKIP, wall s (it was the longest WAIT shown with [F] SKIP)
  lines: string[];
}

function fly(fuelPct: number, ignoreSec: number, kid: 'obey' | number, maxWall = 300): Flown {
  lowTank(fuelPct, ignoreSec);
  const offer = text(harness);
  const flown: Flown = {
    offer, status: '', wallSec: 0, range: 0, flipToLast: false, releaseInLast: null, longestSkipSec: 0, lines: [],
  };
  let prev = '';
  let skipRun = 0;
  const watch = (): void => {
    const line = text(harness);
    const normal = line.replace(/\d+:\d+/g, 'm:ss');
    if (flown.lines[flown.lines.length - 1] !== normal) flown.lines.push(normal);
    if (/^RELEASE/.test(prev) && /may take all your FUEL/.test(line)) flown.flipToLast = true;
    if (/may take all your FUEL/.test(prev) && /^RELEASE/.test(line) && flown.releaseInLast === null) flown.releaseInLast = state().burn.fuelPct;
    if (harness.status() === 'locked') flown.releaseInLast = null;
    skipRun = state().clock.pace === 'skip' ? skipRun + TICK : 0;
    flown.longestSkipSec = Math.max(flown.longestSkipSec, skipRun);
    prev = line;
  };
  const start = harness.wall();
  if (kid === 'obey') obey(harness, maxWall, watch);
  else followStrip(harness, kid, maxWall, watch);
  flown.status = harness.status();
  flown.wallSec = harness.wall() - start;
  flown.range = computePrediction(state()).greenFraction;
  return flown;
}

const describe = (flown: Flown): string =>
  `"${flown.offer}" → ${flown.status} after ${flown.wallSec.toFixed(1)} s, range ${(flown.range * 100).toFixed(0)}%, `
  + `longest SKIP ${flown.longestSkipSec.toFixed(1)} s${flown.flipToLast ? ', FLIP to the empty-tank line' : ''}`
  + `${flown.releaseInLast !== null ? `, RELEASE with ${flown.releaseInLast.toFixed(2)}% left` : ''}`;

// What the trim at ▼ would cost from that state (read with a dry tank, where no shrink is planned).
lowTank(0.5);
const trimPct = getPrediction().neededPct;
check('setup: the trim at ▼ the shrink replaces costs about 31% here, and it is hours away',
  getPrediction().burnPoint?.reason === 'ra-high' && trimPct > 30 && trimPct < 33, `${trimPct.toFixed(1)}%`);

// --- 14–31%: short of the trim: the brake at ▼ with the whole tank, ORBIT ACCEPTED ------------------------------
// LEAD-2: it was the last FUEL at once (ORBIT ACCEPTED at 10–52% printer range). Now the WAIT for ▼ (a few seconds
// of SKIP), the brake there held to the empty tank (`KEEP HOLDING — it may take all your FUEL`, no RELEASE first),
// and ORBIT ACCEPTED at 12–84%. The 31% tank, a hair short of the impulsive estimate, often locks: obeyed trims
// spend less than it (RELEASE comes where the loop enters the ring).
for (const fuelPct of byDepth([14, 31], [14, 20, 25, 31])) {
  lowTank(fuelPct);
  const pred = getPrediction();
  const offer = text(harness);
  const instant = fly(fuelPct, 60, 'obey');
  const human = fly(fuelPct, 60, 0.3);
  check(`${fuelPct}% (short of the ${trimPct.toFixed(1)}% trim): the WAIT for ▼ with [F] SKIP; held to the empty tank it ends ACCEPTED (or locks), no RELEASE first`,
    pred.burnPoint?.reason === 'ra-high' && /^WAIT — brake at ▼ in \d+:\d\d · \[F\] SKIP$/.test(offer)
    && [instant, human].every((flown) => ['accepted', 'locked'].includes(flown.status) && flown.releaseInLast === null
      && flown.range >= STRANDED_RANGE_FRAC && flown.longestSkipSec <= FEW_SKIP_SEC
      && (flown.status === 'locked' || flown.lines.includes(KEEP_TO_EMPTY_LINE))),
    `instant: ${describe(instant)} | 0.3 s: ${describe(human)}`);
}

// --- 31.5–32%: the trim is paid for: it locks ---------------------------------------------------------------
// LEAD-2: these got the last FUEL (ORBIT ACCEPTED) because the shrink could not bring the WAIT under a minute
// of SKIP. Every WAIT is a few seconds of SKIP now, so the lock is kept.
for (const fuelPct of [31.5, 32]) {
  const flown = fly(fuelPct, 60, 0.3);
  check(`${fuelPct}%: pays for the trim → it locks, with a few seconds of SKIP`,
    fuelPct > trimPct && flown.status === 'locked' && flown.longestSkipSec <= FEW_SKIP_SEC, describe(flown));
}

// --- From about 32.5%: the shrink, sized to the spare FUEL; every kid locks --------------------------------------
// LEAD-2: its WAIT used to be bounded by SHRINK_LOCK_WAIT_MAX_TAC / SHRINK_RESERVE_WAIT_TAC tactical s; what matters
// now is that its SKIP takes a few seconds.
for (const fuelPct of [32.5, 34, 36, 40]) {
  const runs = (['obey', 0.3, 0.5] as const).map((kid) => fly(fuelPct, 60, kid));
  check(`${fuelPct}%: SHRINK THE LOOP; obeyed instantly or at a 0.3 / 0.5 s reaction it locks, every SKIP a few seconds`,
    runs.every((flown) => /^SHRINK THE LOOP/.test(flown.offer) && flown.status === 'locked' && !flown.flipToLast
      && flown.longestSkipSec <= FEW_SKIP_SEC),
    runs.map(describe).join(' | '));
}

// --- Review round 1, the band sweep: no flip, no early RELEASE, no long SKIP, whatever the ignore time -------
// The reviewers' band (31.5–35% FUEL; ignore 60–120 s) with the WP1 followStrip kid at human reactions:
// each flight ends LOCKED or ACCEPTED, the strip never turns a RELEASE into `… it may take all your FUEL`, a
// burn to the empty tank never says RELEASE before the tank is dry, and every SKIP takes a few seconds
// (LEAD-2; it was "no WAIT with [F] SKIP over SHRINK_LOCK_WAIT_MAX_TAC", once up to 4829:39).
{
  const bad: string[] = [];
  let flights = 0;
  // Quick depth (tests/unit/depth.ts): the band's ends and middle after the shortest and longest ignore.
  for (const ignoreSec of byDepth([60, 120], [60, 90, 120])) {
    for (const fuelPct of byDepth([31.5, 33.5, 35.5], [31.5, 32.5, 33.5, 34.5, 35.5])) {
      for (const reaction of ignoreSec === 60 ? [0.3, 0.5] : [0.3]) {
        const flown = fly(fuelPct, ignoreSec, reaction);
        flights++;
        if ((flown.status !== 'locked' && flown.status !== 'accepted') || flown.flipToLast || flown.releaseInLast !== null
          || flown.longestSkipSec > FEW_SKIP_SEC) {
          bad.push(`ignore ${ignoreSec} s, ${fuelPct}%, ${reaction} s: ${describe(flown)}`);
        }
      }
    }
  }
  check(`band sweep: ${flights} flights, all LOCKED or ACCEPTED, no flip, no early RELEASE, no SKIP over ${FEW_SKIP_SEC} s`,
    bad.length === 0, bad.join(' | ') || `${flights} flights clean`);
}

// --- A hold pressed for the shrink and let go late: no flip while held, and it ends well ----------------------
// The reviewers' late-release-flip: hold to RELEASE, then 0.15–0.6 s more. LEAD-2: there is no last FUEL to flip
// to; while still held no KEEP HOLDING may come back after the RELEASE, and the flight ends LOCKED (or, where the
// late release left the trim a hair short, ACCEPTED by the brake at ▼ to the empty tank).
for (const fuelPct of [34, 35]) {
  const lines: string[] = [];
  let bad = '';
  for (const lagSec of [0.15, 0.3, 0.6]) {
    lowTank(fuelPct);
    harness.keyDown('Space');
    stepUntil(harness, () => /^RELEASE/.test(text(harness)), 60);
    for (let held = 0; held < lagSec - 1e-9; held += TICK) {
      harness.step();
      if (/^KEEP HOLDING/.test(text(harness))) bad ||= `${lagSec} s: "${text(harness)}" while still held`;
    }
    harness.keyUp('Space');
    for (let i = 0; i < 3; i++) harness.step();
    const after = text(harness);
    obey(harness, 300);
    lines.push(`${lagSec} s late: "${after}" → ${harness.status()}, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
    if (!['locked', 'accepted'].includes(harness.status())) bad ||= lines[lines.length - 1]!;
  }
  check(`${fuelPct}%: the shrink held 0.15–0.6 s past its RELEASE: no KEEP HOLDING while held, and it ends LOCKED or ACCEPTED`,
    bad === '', bad || lines.join(' | '));
}

// --- 90–120 s of ignoring: a short tank still gets its brake at ▼ ------------------------------------------------
// LEAD-2: it was the last FUEL run to the empty tank (it used to stop at the over-hold margin, review round 1).
for (const [ignoreSec, fuelPct] of [[90, 28], [120, 24], [120, 31]] as const) {
  const instant = fly(fuelPct, ignoreSec, 'obey');
  const human = fly(fuelPct, ignoreSec, 0.3);
  check(`ignored ${ignoreSec} s, ${fuelPct}%: the brake at ▼, held to the empty tank, ACCEPTED (or locked), a few seconds of SKIP (instant and 0.3 s)`,
    [instant, human].every((flown) => ['accepted', 'locked'].includes(flown.status) && flown.releaseInLast === null
      && flown.longestSkipSec <= FEW_SKIP_SEC && flown.range >= STRANDED_RANGE_FRAC),
    `instant: ${describe(instant)} | 0.3 s: ${describe(human)}`);
}

// --- ≤ 12%: no burn reaches the printers: the strip says so and names ACCEPT ORBIT; SKIP is refused ---------
for (const fuelPct of [8, 10, 12]) {
  lowTank(fuelPct);
  const pred = getPrediction();
  const objective = flightObjective(buildFlightContext(state(), pred));
  const skip = skipBlockReason(state(), pred);
  check(`${fuelPct}%: no burn saves the ship: "${STRANDED_LINE}", ACCEPT named, SKIP refused (${SKIP_REFUSAL_STRANDED})`,
    pred.strandedAnyway && pred.burnPoint?.reason === 'ra-high' && objective?.text === STRANDED_LINE && objective.showAccept
    && !objective.keys.includes('F') && skip === SKIP_REFUSAL_STRANDED && STRANDED_LINE.length <= MAX_LINE_CHARS,
    `"${objective?.text}", SKIP ${skip}`);
}

// --- (3) The reserve floor: a FUEL-limited shrink obeyed with a 1.2 s late release still locks ---------
// The floor binds from about 45% here (below it the shrink stops on SHRINK_RESERVE_WAIT_TAC first and keeps
// whatever is left: 9% at 42%). (Unchanged by LEAD-2.)
for (const fuelPct of [42, 45, 48, 52]) {
  lowTank(fuelPct);
  harness.keyDown('Space');
  stepUntil(harness, () => /^RELEASE/.test(text(harness)), 60);
  const handOverPred = getPrediction();
  const spareAtHandOver = state().burn.fuelPct - handOverPred.neededPct;
  for (let held = 0; held < 1.2 - 1e-9; held += TICK) harness.step();
  harness.keyUp('Space');
  const log = obey(harness, 600);
  check(`${fuelPct}%: the hand-over leaves the trim plus a reserve (≥ ${floorPct.toFixed(1)}% where it binds), and a 1.2 s late release still locks`,
    spareAtHandOver >= Math.min(floorPct, 8.5) - 0.3 && harness.status() === 'locked' && state().burn.fuelPct > 0,
    `spare at the hand-over ${spareAtHandOver.toFixed(1)}% (next burn ${handOverPred.neededPct.toFixed(1)}%), `
    + `${harness.status()} with FUEL ${state().burn.fuelPct.toFixed(1)}%, SKIP ${log.skipWallSec.toFixed(1)} s`);
}

finish();
