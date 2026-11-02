// WP1-rules 2: SHRINK THE LOOP. A kid who ignored the late-trim HOLD NOW past the point where one
// burn still lands the loop got a WAIT for the next ▼ (up to 6.3 h of SKIP; the WP1 verifier's
// Deferred 3). Now, while the ship climbs away on a too-big loop and the trim is more than
// SHRINK_WAIT_TAC away, the strip asks for a RETRO burn now and hands back to the trim plan.
// Fix round 1: the shrink stops on the over-hold margin (SHRINK_MARGIN_TAC / _MIN_TAC) instead of
// a ▼ floor, so a capture with ▼ under the old floor shrinks too, and it is sized to the tank
// instead of being dropped whole, so a part-full tank no longer flips the plan mid-burn.
// LEAD-2: parametrised by ship (the lead's item 4). Run it on ship 2 or 3 with AP_SHIP=1 or 2 (tests/unit/lead2/per-ship.test.ts
// does, for both): every number that was ship 1's (its one-burn window, its trim's FUEL, its planted orbits, the
// over-hold measured at its ring's edge) is now read off the ship flown, or listed per ship with the reason. And
// the coast SKIP (LEAD-2) makes every WAIT a few seconds of SKIP, so the time-based last FUEL and its constant
// (SHRINK_LOCK_WAIT_MAX_TAC) are gone: a tank short of the trim waits for ▼ and spends itself there.
import { createHarness, check, finish, HARNESS_SHIP, TICK } from '../wp1/harness';
import { computePrediction, getPrediction, sweetZone } from '@systems/predict';
import { integrateStep } from '@systems/orbit-sim';
import { buildFlightContext, flightObjective } from '@systems/guidance';
import { skipBlockReason, skipRefusalInZone, skipRefusalZoneAhead } from '@systems/pace';
import { fuelModel, plotMarkers, telemetryModel, countdownChip } from '@systems/flight-hud';
import { createRng } from '@systems/rng';
import { stateFromElements, elementsFromState, type OrbitState, type Vec2 } from '@/types/orbit';
import {
  SHRINK_WAIT_TAC, SHRINK_MIN_APO_FRAC, SHRINK_MARGIN_TAC, SHRINK_SMALL_LOOP_FACTOR,
  STAR_FUEL_PCT, MAX_LINE_CHARS, SIM_SUBSTEP_MAX_SEC, SHRINK_FUEL_RESERVE_FRAC,
  SKIP_DIVISOR, SKIP_RAMP_SEC, SKIP_EASE_OUT_SEC,
} from '@data/tuning';
import {
  text, stepUntil, idle, idleThrottled, placeOrbit, releaseAtCapture, captureOffRing, obey, ignoredAtCapture, flyOnce, type ObeyLog,
} from './flows';
import { byDepth } from '../depth';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { planet, ring, tacticalWarp, dvBudgetKmS, aNominalKmS2, shrink: shipShrink } = state().level;
const mu = planet.mu;
const isShrinkLine = (line: string): boolean => /SHRINK THE LOOP|shrink the loop$/.test(line);
// WP10: a shrink offered again is a SHRINK line under a shrink plan. The first of two trims at ▼ (a RETRO that only
// brings ▲ in, ▼ being just under the ring) also reads `KEEP HOLDING — shrink the loop` (guidance.ts
// TRIM_PROGRESS_FIRST_OF_TWO); on VESPER (×30) a capture ignored 90 s or more hands over with ▼ a few km under the
// ring, so that trim follows, and the text alone counted it as a second shrink.
const isShrinkOffer = (): boolean => isShrinkLine(text(harness)) && getPrediction().burnPoint?.reason === 'shrink';
// WP7: the stop rule's numbers are the ship's own (ShipDef.shrink; ship 1's are the tuning.ts values), so
// the suite can be flown on any ship (AP_SHIP=1, the lead's per-ship shrink tuning).
const smallLoopRa = shipShrink.smallLoopFactor * ring.max;
// The over-hold margin a shrink must leave: the full one once ▼ is below the ring on a small loop.
const marginFor = (rp: number, ra: number): number => (rp < ring.min && ra <= smallLoopRa ? shipShrink.marginTac : shipShrink.marginMinTac);
void SHRINK_MARGIN_TAC; void SHRINK_SMALL_LOOP_FACTOR; // ship 1's values: the suite reads the ship's own (shipShrink)
// One tick of burn (or two) runs on before the strip changes, and the test flies its own steps. LEAD-2: 0.3 (was
// 0.2, set on ship 1): the plan's 10 Hz refresh (0.1 tac s), a tick (0.05) and one 1.5 game-s planning step (0.06
// tac s at ×25) add up to 0.26 tac s on HALCYON (▼ 3,800: 4.74 s of the 5 s margin at the hand-over, the same on
// the tree before LEAD-2).
const MARGIN_SLACK_TAC = 0.3;
// LEAD-2: the longest a single SKIP takes (its ramp, SKIP_DIVISOR at its warp, its ease-out, a tick or two).
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + SKIP_EASE_OUT_SEC + 1;
// The over-hold a hand-over at the ring's inner edge leaves, measured per ship (tactical s): ship 1's 4–5 s
// (WP1-rules round 1), HALCYON's 4.2–4.7 s with its edge back-off (WP7), KESTREL's 5.6 s at the edge but 3.6 s
// after 120 s of ignoring, where the shrink stops on its FUEL reserve with ▼ just inside the ring (WP9) — still
// above the rule's own promise there (shrink.marginMinTac, 3 s).
// VESPER (WP10, AP_SHIP=3 AP_GHOST=quiet): 3.4 s after 120 s of ignoring, where the shrink stops on its own 3 s
// margin (its loop is still too big for the edge back-off) — the rule's promise there, shrink.marginMinTac.
// LAST LIGHT (WP11, AP_SHIP=4): VESPER's ring, planet and ×30, so VESPER's promise (measured: see PROGRESS.md WP11).
const EDGE_OVER_HOLD_TAC = [4, 4, 3.5, 3, 3][HARNESS_SHIP];
// "▼ still at the ring" allows the tick or two of RETRO the burn runs on before the strip changes (50 km at ship 1's
// ×25). WP10: in game seconds a tick is the ship's warp × TICK, so the dip scales with it: 60 km at VESPER's ×30
// (its 120 s case handed over at ▼ 4,949).
const RING_DIP_KM = 50 * (tacticalWarp / 25);
if (EDGE_OVER_HOLD_TAC === undefined) throw new Error(`rule2-shrink: no edge over-hold measured for ship ${HARNESS_SHIP}`);
// The longest ignoring whose shrink still stops at the ring's edge. LAST LIGHT (WP11): 90 s. Its capture is the
// fleet's fastest (v∞ 1.5, ▼ 3,200 on the crash-course opener), so after 120 s ▲ is 42,853 km, past its small-loop
// radius (5.0 × 7,000 km): the edge back-off is for small loops only, and the shrink stops on its 3 s margin with ▼
// 4,818 (3.1 s), the promise the 240 s case gets on every ship. A larger factor (5.5–7.0, swept) does not move the
// stop to the edge and from 6.0 brings the ▼/▲ times back while the shrink is offered.
const RING_EDGE_IGNORE_MAX_SEC = [120, 120, 120, 120, 90][HARNESS_SHIP];
if (RING_EDGE_IGNORE_MAX_SEC === undefined) throw new Error(`rule2-shrink: no ring-edge ignore limit for ship ${HARNESS_SHIP}`);
// WP11: a hazard zone near or around the ship refuses SKIP for its own reason first (pace.ts skipInhibitor), so on
// LAST LIGHT the SHRINK line's SKIP may read BELT AHEAD or IN THE BELT where other ships read BURN NOW: refused either way.
const ZONE_REFUSALS = new Set((['debris', 'belt'] as const).flatMap((kind) => [skipRefusalZoneAhead(kind), skipRefusalInZone(kind)]));
const skipRefused = (reason: string | null): boolean => reason === 'BURN NOW' || (reason !== null && ZONE_REFUSALS.has(reason));
// WP11: the wall-time promises are for the kid's own seconds: a zone's TACTICAL hold over a WAIT (flows.ts ObeyLog
// zoneHoldSec; LAST LIGHT's belt lies across every loop still big after the capture) is the zone's. Each such hold can
// split one SKIP in two, so "n SKIPs of a few seconds" allows one more per hold. No zone on ships 1–4: unchanged there.
const ownWallSec = (wallSec: number, log: ObeyLog): number => wallSec - log.zoneHoldSec;
const fewSkipsSec = (skips: number, log: ObeyLog): number => (skips + log.zoneHolds) * FEW_SKIP_SEC;
const zoneNote = (log: ObeyLog): string => (log.zoneHolds > 0 ? `, zone hold ${log.zoneHoldSec.toFixed(1)} s in ${log.zoneHolds}` : '');

// Tactical seconds of full-POWER RETRO from `orbit` until ▼ is underground (Infinity if never
// within 30 s): the over-hold margin, flown independently of predict.ts. Also ▼ after the first
// step, which decides the margin the shrink must keep (the full one once ▼ is below the ring).
function marginTac(orbit: OrbitState): number {
  return retroFrom(orbit).marginTac;
}
// LEAD-1: also when ▼ first drops under the ring's inner edge (ringExitTac, Infinity if not within 30 s).
function retroFrom(orbit: OrbitState): { marginTac: number; firstStepRp: number; firstStepRa: number; ringExitTac: number } {
  const pos: Vec2 = { x: orbit.x, y: orbit.y };
  const vel: Vec2 = { x: orbit.vx, y: orbit.vy };
  const stepTac = SIM_SUBSTEP_MAX_SEC / tacticalWarp;
  let firstStepRp = NaN;
  let firstStepRa = NaN;
  let ringExitTac = Infinity;
  for (let tacSec = stepTac; tacSec < 30; tacSec += stepTac) {
    const speed = Math.hypot(vel.x, vel.y);
    integrateStep(pos, vel, SIM_SUBSTEP_MAX_SEC, mu, (-aNominalKmS2 * vel.x) / speed, (-aNominalKmS2 * vel.y) / speed);
    const elements = elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu);
    if (Number.isNaN(firstStepRp)) {
      firstStepRp = elements.rp;
      firstStepRa = (elements.rp * (1 + elements.e)) / (1 - elements.e);
    }
    if (ringExitTac === Infinity && elements.rp < ring.min) ringExitTac = tacSec;
    if (elements.rp <= planet.R) return { marginTac: tacSec, firstStepRp, firstStepRa, ringExitTac };
  }
  return { marginTac: Infinity, firstStepRp, firstStepRa, ringExitTac };
}

// Hold RETRO from a state the strip calls SHRINK until the strip says to let go. Counts how often
// the shown line leaves the shrink (one hand-over is right) and the plan flips while holding.
function flyShrink(): { switches: number; flips: number; handOver: string; spentPct: number; margin: number; rp: number; ra: number } {
  const fuelAtStart = state().burn.fuelPct;
  harness.keyDown('Space');
  let switches = 0;
  let flips = 0;
  let wasShrink = true;
  let planWasShrink = true;
  stepUntil(harness, () => {
    const shrinking = isShrinkLine(text(harness)) || /^HOLD \[SPACE\] NOW|^KEEP HOLDING/.test(text(harness));
    if (shrinking !== wasShrink) switches++;
    wasShrink = shrinking;
    const planShrink = getPrediction().burnPoint?.reason === 'shrink';
    if (planShrink !== planWasShrink) flips++;
    planWasShrink = planShrink;
    return /RELEASE|HOLD STEADY/.test(text(harness));
  }, 60);
  const handOver = text(harness);
  const margin = marginTac(state().orbit);
  const { rp, ra } = getPrediction();
  const spentPct = fuelAtStart - state().burn.fuelPct;
  harness.keyUp('Space');
  return { switches, flips, handOver, spentPct, margin, rp, ra };
}

// Let go at CAPTURED and 60 s ignored (SHRINK THE LOOP is up): flown once, restored for each later scenario.
const ignored60 = (): void => ignoredAtCapture(harness, 60);

// --- The verifier's kid: lets go at CAPTURED, ignores the strip, then brakes and obeys ------------
// The one-burn window (the late trim still lands the loop: HOLD NOW stays) is ship 1's 47 s; per ship it is
// measured here, and the "still the one burn" case flies at most 45 s into it, at most three quarters of it.
releaseAtCapture(harness);
const windowStart = harness.wall();
stepUntil(harness, () => text(harness) !== 'HOLD [SPACE] NOW', 120);
const oneBurnWindowSec = harness.wall() - windowStart;
const oneBurnIgnoreSec = Math.min(45, Math.floor(0.75 * oneBurnWindowSec));
// Quick depth (tests/unit/depth.ts): the one-burn window, the ring-edge span's far end (120 s) and the throttled 240 s
// (the tier trim: 60 and 90 s sit inside the 60–120 s span; 60 s is still flown by every scenario below). Each capture
// is flown once per process and restored (flows.ts ignoredAtCapture).
// Slice 3b review (the unit tier's budget): quick keeps the one-burn window and the throttled 240 s, the span's ends.
for (const ignoreSec of byDepth([oneBurnIgnoreSec, 240], [oneBurnIgnoreSec, 60, 90, 120, 240])) {
  // Four minutes of ignoring are flown at a throttled tab's ticks (flows.ts idleThrottled: long hands-off stretches,
  // where the predictor re-planning the loop every 50 ms is most of the time); the shorter ignores at 50 ms ticks.
  if (ignoreSec > RING_EDGE_IGNORE_MAX_SEC) {
    flyOnce(harness, `ignored ${ignoreSec} s, throttled`, () => { releaseAtCapture(harness); idleThrottled(harness, ignoreSec); });
  } else ignoredAtCapture(harness, ignoreSec);
  const lineAfterIgnoring = text(harness);
  const paceAfterIgnoring = harness.pace();
  const skipReason = skipBlockReason(state(), getPrediction());
  const neededPct = getPrediction().neededPct;
  const start = harness.wall();

  if (ignoreSec === oneBurnIgnoreSec) {
    // Still inside the window where one burn lands the loop: the old HOLD NOW.
    harness.keyDown('Space');
    stepUntil(harness, () => /RELEASE|HOLD STEADY/.test(text(harness)), 60);
    const handOver = text(harness);
    harness.keyUp('Space');
    obey(harness, 60);
    check(`ignored ${ignoreSec} s (the one-burn window is ${oneBurnWindowSec.toFixed(1)} s here): still the one-burn HOLD NOW, and it locks`,
      lineAfterIgnoring === 'HOLD [SPACE] NOW'
      && handOver === 'RELEASE [SPACE]!' && harness.status() === 'locked',
    `"${lineAfterIgnoring}" → "${handOver}" → ${harness.status()}`);
    continue;
  }
  const shrink = flyShrink();
  let shrinkAgain = '';
  const log = obey(harness, 400, () => { if (!shrinkAgain && isShrinkOffer()) shrinkAgain = text(harness); });
  const wallSec = harness.wall() - start;

  check(`ignored ${ignoreSec} s: SHRINK THE LOOP at TACTICAL instead of a long WAIT, SKIP refused`,
    lineAfterIgnoring === 'SHRINK THE LOOP — hold [SPACE]' && paceAfterIgnoring === 'tactical' && skipRefused(skipReason),
    `"${lineAfterIgnoring}" at ${paceAfterIgnoring}, SKIP ${skipReason}`);
  // Up to 2 minutes of ignoring, the shrink stops just before ▼ would leave the ring (4–5 s of
  // over-hold there on ship 1), and the next burn is usually the RETRO at ▼; the tick or two the
  // burn runs on before the strip changes can dip ▼ just under the ring, and then it is the PRO at
  // ▲ first. After 4 minutes the loop is still big there, so it may go on to SHRINK_MARGIN_MIN_TAC.
  const atRingEdge = ignoreSec <= RING_EDGE_IGNORE_MAX_SEC;
  check(`ignored ${ignoreSec} s: one hand-over, the plan never flipped, `
    + (atRingEdge ? `▼ still at the ring, ≥ ${EDGE_OVER_HOLD_TAC} s of over-hold to spare` : `≥ ${shipShrink.marginMinTac} s of over-hold to spare`),
    shrink.switches === 1 && shrink.flips === 1 && /^RELEASE \[SPACE\]! — next: (brake at ▼|burn at ▲)/.test(shrink.handOver)
    && (atRingEdge ? shrink.rp >= ring.min - RING_DIP_KM && shrink.margin >= EDGE_OVER_HOLD_TAC : shrink.margin >= shipShrink.marginMinTac - MARGIN_SLACK_TAC),
    `${shrink.switches} switch(es), ${shrink.flips} plan flip(s) to "${shrink.handOver}", ▼ ${shrink.rp.toFixed(0)} ▲ ${shrink.ra.toFixed(0)} km, `
    + `IMPACT after ${shrink.margin.toFixed(1)} tac s more (before: 1.8–2.5 s)`);
  check(`ignored ${ignoreSec} s: NEEDED matched the shrink's real cost`, Math.abs(neededPct - shrink.spentPct) < 0.05 * neededPct + 0.5,
    `NEEDED ${neededPct.toFixed(1)}%, spent ${shrink.spentPct.toFixed(1)}%`);
  check(`ignored ${ignoreSec} s: obeying locks with the ★ FUEL left, and the shrink is never offered again`,
    harness.status() === 'locked' && ownWallSec(wallSec, log) < 120 && state().burn.fuelPct >= STAR_FUEL_PCT && shrinkAgain === '',
    `${harness.status()} after ${wallSec.toFixed(1)} s${zoneNote(log)}, SKIP ${log.skipWallSec.toFixed(1)} s, longest WAIT ${log.longestWaitTac} tac s, `
    + `FUEL ${state().burn.fuelPct.toFixed(1)}% (before: 25–27%)${shrinkAgain ? `, again: "${shrinkAgain}"` : ''}`);
}

// --- No racing countdowns while the shrink is offered or flown (experience minor) ----------------
// The next ▼/▲ of a loop the burn is shrinking would race down by minutes a second.
{
  ignored60();
  const views = (): string => {
    const pred = getPrediction();
    const markers = plotMarkers(state(), pred);
    return `${markers.peri?.lines[0]} / ${markers.apo?.lines[0]} / TIME TO ▼ ${telemetryModel(state(), pred).timeToPeri} / chip ${countdownChip(state(), pred)?.time ?? '-'}`;
  };
  const offered = views();
  harness.keyDown('Space');
  for (let i = 0; i < 40; i++) harness.step();
  const flying = views();
  harness.keyUp('Space');
  const calm = (shown: string): boolean => shown === '▼ — / ▲ — / TIME TO ▼ — / chip -';
  check('shrink: no ▼/▲ times, no TIME TO ▼ and no header countdown while it is offered or flown',
    calm(offered) && calm(flying), `offered: ${offered}; holding: ${flying}`);
}

// --- Over-holding the hand-over: never IMPACT, never a second shrink -----------------------------
// Quick depth: the longest over-hold (the tier trim; slice 3b review: the shortest went to the full depth); full: every one.
for (const overHoldSec of byDepth([3], [0.5, 1, 2, 3])) {
  ignored60();
  harness.keyDown('Space');
  stepUntil(harness, () => /RELEASE/.test(text(harness)), 60);
  let impact = false;
  stepUntil(harness, () => { impact ||= getPrediction().outcome === 'impact'; return false; }, overHoldSec);
  harness.keyUp('Space');
  const lineAfter = text(harness);
  let shrinkAgain = '';
  obey(harness, 400, () => {
    impact ||= getPrediction().outcome === 'impact';
    if (!shrinkAgain && isShrinkOffer()) shrinkAgain = text(harness);
  });
  check(`over-hold ${overHoldSec} s past the hand-over: no IMPACT course, no second shrink, locked`,
    !impact && shrinkAgain === '' && harness.status() === 'locked',
    `"${lineAfter}" → ${harness.status()}, FUEL ${state().burn.fuelPct.toFixed(1)}%${impact ? ', IMPACT seen' : ''}${shrinkAgain ? `, again "${shrinkAgain}"` : ''}`);
}

// --- Part of a tank (the reviewers' 36–46% band, and around it) --------------------------------
// The shrink is sized to the tank: one plan change while holding (the hand-over), no re-offer,
// locked. It is offered whenever the tank pays for the trim at ▼ it replaces (LEAD-1: down to the trim itself
// while the WAIT it leaves is long, spending the reserve). LEAD-2: below the trim there is no shrink and no last
// FUEL: the WAIT for ▼ (a few seconds of SKIP), where the whole tank, held to empty, ends ORBIT ACCEPTED. The band
// is set around the ship's own trim at ▼ (31% on ship 1, 42% on HALCYON, 50% on KESTREL).
{
  ignored60();
  // The trim at ▼ the shrink would replace, priced on a copy with a near-dry tank (no shrink is planned
  // there). LEAD-1 review round 2: read off the pure prediction rather than by flying ticks at 0.5%,
  // because the live predictor latches ACCEPT ORBIT as the only way on (Rule 4, burn.acceptOnly) on
  // such a tank, and in the game FUEL never comes back.
  const waitTrimPct = computePrediction({ ...state(), burn: { ...state().burn, fuelPct: 0.5 } }).neededPct;
  const results: string[] = [];
  let bad = '';
  // Quick depth: both sides of the trim close in and far out (the full grid steps 2–5 points).
  for (const overTrim of byDepth([-1, 1, 19], [-10, -4, -1, 1, 3, 5, 7, 10, 14, 19])) {
    const fuelPct = Number((waitTrimPct + overTrim).toFixed(1));
    if (fuelPct > 100) continue;
    ignored60();
    harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; });
    for (let i = 0; i < 3; i++) harness.step();
    const plan = getPrediction().burnPoint;
    const offer = text(harness).replace(/\d+:\d+/, 'm:ss');
    if (fuelPct < waitTrimPct) {
      const log = obey(harness, 400);
      results.push(`${fuelPct}%: "${offer}" → ${harness.status()}, SKIP ${log.skipWallSec.toFixed(1)} s in ${log.skips}${zoneNote(log)}`);
      if (plan?.reason === 'shrink' || !/^WAIT — brake at ▼/.test(offer) || !['accepted', 'locked'].includes(harness.status())
        || log.skipWallSec > fewSkipsSec(1, log)) {
        bad ||= `${fuelPct}% (under the ${waitTrimPct.toFixed(1)}% trim): ${results[results.length - 1]}`;
      }
      continue;
    }
    if (plan?.reason !== 'shrink') {
      bad ||= `${fuelPct}% (pays the ${waitTrimPct.toFixed(1)}% trim): "${offer}", ${plan?.reason} planned, no shrink`;
      continue;
    }
    const shrink = flyShrink();
    let offersAfter = 0;
    let wasShrink = false;
    let skipRun = 0;
    let longestSkip = 0;
    const start = harness.wall();
    obey(harness, 400, () => {
      const isShrink = getPrediction().burnPoint?.reason === 'shrink';
      if (isShrink && !wasShrink) offersAfter++;
      wasShrink = isShrink;
      skipRun = state().clock.pace === 'skip' ? skipRun + TICK : 0;
      longestSkip = Math.max(longestSkip, skipRun);
    });
    results.push(`${fuelPct}%: ${shrink.flips} flip, ▼ ${shrink.rp.toFixed(0)} → ${harness.status()} in ${(harness.wall() - start).toFixed(0)} s, `
      + `longest SKIP ${longestSkip.toFixed(1)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
    if (shrink.flips !== 1 || shrink.switches !== 1 || offersAfter > 0 || harness.status() !== 'locked' || longestSkip > FEW_SKIP_SEC) {
      bad ||= `${fuelPct}%: ${shrink.flips} flips, ${shrink.switches} switches, ${offersAfter} re-offers, ${harness.status()}, SKIP ${longestSkip.toFixed(1)} s`;
    }
  }
  check(`fuel around the ${waitTrimPct.toFixed(1)}% trim at ▼: a tank that pays for it gets a steady shrink that locks; one that `
    + 'doesn\'t waits for ▼ (a few seconds of SKIP) and spends itself there, ACCEPTED',
  bad === '', bad || results.join(' | '));
}

// --- The band the old ▼ floor (4,092 km) shut off: captures with ▼ at 3,450–4,300 km ---------------
// Every ship's ring starts at 5,000 km and its planet's surface at 3,390, so the same ▼ heights apply. LEAD-2: at
// ▼ 3,450 on HALCYON and KESTREL ▼ is under 60 km up, so no RETRO now keeps the over-hold margin (no shrink), and
// the PRO at ▲ of that 7–20-million-km loop can't be flown (one tick of thrust carries ▼ across the whole ring,
// predict.ts trimFlyable): the plan is the RETRO at ▼, a WAIT of about 140,000 tactical minutes the coast SKIP
// crosses in seconds (it was a 49-day WAIT for that PRO, and then 11 failed PRO/RETRO pairs at ▲).
{
  const results: string[] = [];
  let bad = '';
  // Quick depth: the band's foot (3,450, where no RETRO may keep the margin) and its top (slice 3b review: the point
  // inside went to the full depth for the unit tier's budget).
  for (const lowestKm of byDepth([3450, 4300], [3450, 3600, 3800, 3950, 4050, 4100, 4300])) {
    captureOffRing(harness, lowestKm);
    stepUntil(harness, () => /HOLD \[SPACE\] NOW/.test(text(harness)), 120);
    harness.keyDown('Space');
    stepUntil(harness, () => getPrediction().outcome === 'closed', 60);
    harness.keyUp('Space');
    idle(harness, 20);
    const line = text(harness);
    const start = harness.wall();
    let shrinkAgain = false;
    let handOvers = 0;
    let wasShrink = getPrediction().burnPoint?.reason === 'shrink';
    let shrinkMargin = Infinity;
    let marginNeeded = 0;
    let handOverLoop = '';
    let lastShrinkLoop = { rp: NaN, ra: NaN };
    let skipRun = 0;
    let longestSkip = 0;
    const log = obey(harness, 300, () => {
      skipRun = state().clock.pace === 'skip' ? skipRun + TICK : 0;
      longestSkip = Math.max(longestSkip, skipRun);
      const isShrink = getPrediction().burnPoint?.reason === 'shrink';
      if (!isShrink && wasShrink) {
        handOvers++;
        shrinkMargin = marginTac(state().orbit);
        // WP11: the rule judges the margin on the loop where the shrink stops (predict.ts keepsMargin), and a stop
        // right at the small-loop radius is judged on its big side: the tick or two the burn runs on before the strip
        // changes can carry ▲ under it (LAST LIGHT ▼ 3,600: ▲ 34,393 km at the hand-over, the radius 35,000). So the
        // margin needed is the lesser of the two loops' (the last one the plan still shrank, and this one).
        marginNeeded = Math.min(marginFor(getPrediction().rp, getPrediction().ra), marginFor(lastShrinkLoop.rp, lastShrinkLoop.ra));
        handOverLoop = `▼ ${getPrediction().rp.toFixed(0)} ▲ ${getPrediction().ra.toFixed(0)} km, last shrink ▲ ${lastShrinkLoop.ra.toFixed(0)}`;
      }
      if (isShrink) lastShrinkLoop = { rp: getPrediction().rp, ra: getPrediction().ra };
      if (isShrink && !wasShrink && handOvers > 0) shrinkAgain = true;
      wasShrink = isShrink;
    });
    const wallSec = harness.wall() - start;
    results.push(`▼ ${lowestKm}: "${line.replace(/\d+:\d+/, 'm:ss')}" → ${harness.status()} in ${wallSec.toFixed(0)} s${zoneNote(log)}, SKIP ${log.skipWallSec.toFixed(0)} s `
      + `(longest ${longestSkip.toFixed(1)} s), margin ${shrinkMargin.toFixed(1)} s (needs ${marginNeeded}${handOverLoop ? ` at ${handOverLoop}` : ''})`);
    const offered = /^SHRINK THE LOOP/.test(line) || (lowestKm === 3450 && /^WAIT — brake at ▼/.test(line));
    if (!offered || harness.status() !== 'locked' || ownWallSec(wallSec, log) > 120 || shrinkAgain || longestSkip > FEW_SKIP_SEC
      || shrinkMargin < marginNeeded - MARGIN_SLACK_TAC) bad ||= results[results.length - 1] ?? '';
  }
  check('low captures ▼ 3,450–4,300, let go at CAPTURED, 20 s idle: SHRINK with its margin (▼ 3,450: SHRINK, or the WAIT for ▼ '
    + 'where no RETRO keeps the margin), locked within 120 s, every SKIP a few seconds',
  bad === '', bad || results.join(' | '));
}

// --- Far out on a just-captured loop: the shrink still runs, down to ▼ at the ring's edge ----------
// LEAD-2: ▼ planted at the ship's own sweet zone (6,000 km on ship 1). On HALCYON and KESTREL this flight was
// still approaching after 600 s of SKIP; the coast SKIP crosses its WAITs in seconds.
const sweetLo = sweetZone(ring).lo;
{
  harness.reset(1);
  placeOrbit(harness, stateFromElements(sweetLo, 0.999, 0, 2.2, mu)); // about 29,000 km out, climbing
  const before = computePrediction(state());
  // WP10: on VESPER (×30) ▼ at its sweet zone's low edge falls to the surface 2.8 tac s into a RETRO, under the shrink's
  // 3 s margin, so no shrink can keep it: the plan is the WAIT for ▼ (the coast SKIP crosses it in seconds), as at
  // the ▼ 3,450 low capture. Measured here, off the guidance.
  const shrinkFits = marginTac(state().orbit) >= shipShrink.marginMinTac;
  harness.step();
  const line = text(harness);
  harness.press('KeyS');
  harness.keyDown('Space');
  stepUntil(harness, () => /RELEASE|HOLD STEADY/.test(text(harness)), 60);
  const handOver = getPrediction();
  const margin = marginTac(state().orbit);
  harness.keyUp('Space');
  const start = harness.wall();
  const log = obey(harness, 600);
  check(shrinkFits ? `far out on a just-captured loop: SHRINK down to the ${shipShrink.marginMinTac} s margin, then the trims lock it`
    : `far out on a just-captured loop, ▼ within the ${shipShrink.marginMinTac} s margin already: the WAIT for ▼, then the trims lock it`,
    // WP11: the same plan (the trim at ▼) first asks for RETRO when the ship is not pointing that way: LAST LIGHT starts on
    // OUT (its crash-course opener), so its line is `LOOP TOO BIG — at ▼ press [S] (RETRO) and burn` until S is pressed.
    (shrinkFits ? line === 'SHRINK THE LOOP — press [S] (RETRO), hold [SPACE]' && margin >= shipShrink.marginMinTac - MARGIN_SLACK_TAC
      : /^WAIT — brake at ▼/.test(line) || /^LOOP TOO BIG — at ▼ press \[S\] \(RETRO\) and burn/.test(line))
    && harness.status() === 'locked' && log.skipWallSec <= fewSkipsSec(3, log),
    `"${line}" (▲ was ${((before.apoInSec ?? 0) / tacticalWarp / 3600).toFixed(0)} tac h away), hand-over at ▼ ${handOver.rp.toFixed(0)} `
    + `▲ ${handOver.ra.toFixed(0)} km (margin ${margin.toFixed(1)} s), ${harness.status()} ${(harness.wall() - start).toFixed(1)} s later, `
    + `SKIP ${log.skipWallSec.toFixed(1)} s in ${log.skips}${zoneNote(log)} (before: 127 s), FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- The tank decides: the shrink never spends FUEL the trims after it need -------------------------
{
  harness.reset(1);
  const orbit = stateFromElements(sweetLo, 0.999, 0, 0.6, mu);
  const planAt = (fuelPct: number) => {
    placeOrbit(harness, orbit);
    harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; d.burn.sasMode = 'retrograde'; });
    const pred = computePrediction(state());
    return { pred, objective: flightObjective(buildFlightContext(state(), pred)), fuel: fuelModel(state(), pred) };
  };
  const full = planAt(100);
  const shrinkPct = full.pred.neededPct;
  check('fuel: with a full tank the shrink is offered and FUEL names its cost',
    full.pred.burnPoint?.reason === 'shrink' && full.fuel.needText === `NEXT BURN NEEDS ${Math.ceil(shrinkPct)}%`,
    `${full.pred.burnPoint?.reason}, "${full.fuel.needText}"`);
  const waitPlan = planAt(0.5); // reads the trim the shrink would replace (no shrink fits)
  const trimPct = waitPlan.pred.burnPoint?.reason === 'ra-high' ? waitPlan.pred.neededPct : NaN;
  const shortFuel = trimPct * (1 + SHRINK_FUEL_RESERVE_FRAC / 2);
  const short = planAt(shortFuel);
  // LEAD-1 (2): this tank used to get the WAIT for ▼ (hours of SKIP after a capture). While the trim it
  // would leave is more than SHRINK_RESERVE_WAIT_TAC away the shrink may spend the reserve (never the
  // trims' own FUEL), so it is offered, sized to the spare FUEL, and obeying it still locks the orbit.
  // LEAD-2: whatever WAIT it leaves, its SKIP takes a few seconds (it had to stay under SHRINK_LOCK_WAIT_MAX_TAC,
  // about a minute of SKIP, or the last FUEL took its place; both are gone).
  const shortLine = short.objective?.text ?? '';
  const shortPlan = short.pred.burnPoint;
  let skipRun = 0;
  let longestSkip = 0;
  const shortLog = obey(harness, 400, () => {
    skipRun = state().clock.pace === 'skip' ? skipRun + TICK : 0;
    longestSkip = Math.max(longestSkip, skipRun);
  });
  check('fuel: enough for the trim at ▼ but not for it plus the reserve → a shrink of the spare FUEL that still locks, every SKIP a few seconds',
    shortPlan?.reason === 'shrink' && /^SHRINK THE LOOP/.test(shortLine) && harness.status() === 'locked' && longestSkip <= FEW_SKIP_SEC,
    `trim ${trimPct.toFixed(1)}%, FUEL ${shortFuel.toFixed(1)}%: ${shortPlan?.reason} ${short.pred.neededPct.toFixed(1)}%, "${shortLine}" → `
    + `${harness.status()}, SKIP ${shortLog.skipWallSec.toFixed(1)} s, longest WAIT ${shortLog.longestWaitTac} tac s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- A small loop far past ▼: the shrink lands it in one go ---------------------------------------
// LEAD-2: planted relative to the ship (ship 1: 6,000 × 9,500 km): ▼ at the sweet zone's low edge and ship 1's
// eccentricity, so 2.0 rad past ▼ is still on the first half of the climb (SHRINK_MIN_APO_FRAC) on every ship.
{
  harness.reset(1);
  const shipOneEccentricity = (9500 - 6000) / (9500 + 6000);
  const rp = sweetLo;
  const ra = (rp * (1 + shipOneEccentricity)) / (1 - shipOneEccentricity);
  // 2.0 rad past ▼: braking here still lands, but costs more than LATE_TRIM_DV_FACTOR × the
  // on-time burn, so before WP1-rules this was a WAIT of about 600 tactical s.
  placeOrbit(harness, stateFromElements(rp, (ra - rp) / (ra + rp), 0, 2.0, mu));
  harness.press('KeyS');
  harness.step();
  const line = text(harness);
  const start = harness.wall();
  const log = obey(harness, 120);
  // On HALCYON and KESTREL a ▼ this near the ring's inner edge is inside the ship's longer edge back-off (WP7: 1.7 /
  // 2.5 tac s, against ship 1's 0.6), so no shrink: the WAIT for ▼ (about 10 tactical minutes, a few seconds of SKIP).
  const shrunk = /^SHRINK THE LOOP/.test(line) && log.skipWallSec === 0;
  const waited = /^WAIT — brake at ▼/.test(line) && log.skipWallSec <= FEW_SKIP_SEC;
  check(HARNESS_SHIP === 0 ? 'small loop far past ▼: SHRINK, then locked without a SKIP'
    : 'small loop far past ▼: the WAIT for ▼ (inside the ship\'s edge back-off), a few seconds of SKIP, then locked',
  (HARNESS_SHIP === 0 ? shrunk : waited) && harness.status() === 'locked',
    `"${line}" → ${harness.status()} after ${(harness.wall() - start).toFixed(1)} s, lines ${log.lines.slice(0, 4).join(' | ')}`);
}

// --- Falling back toward ▼, or late in the climb: no shrink (the trim is the nearer, cheaper burn) ---
{
  harness.reset(1);
  const rp = 6000;
  const ra = 40000;
  const e = (ra - rp) / (ra + rp);
  const planAt = (nu: number) => { placeOrbit(harness, stateFromElements(rp, e, 0, nu, mu)); return computePrediction(state()).burnPoint; };
  const falling = planAt(-1.5);
  const lateClimb = planAt(2.9);
  check('no shrink while falling toward ▼ or late in the climb to ▲',
    falling?.reason === 'ra-high' && lateClimb?.reason === 'ra-high',
    `falling: ${falling?.reason}, late climb: ${lateClimb?.reason}`);
}

// --- The target: no WAIT over SHRINK_WAIT_TAC while a shrink could help (a full tank) ------------
// ▼ from just above the surface (fix round 1: the old sweep started above the floor). A long WAIT
// on the early climb is allowed only where the over-hold margin forbids even the first step.
{
  const rng = createRng(11);
  let shrinks = 0;
  let longWaits = 0;
  let marginBlocked = 0;
  let reactionBlocked = 0;
  let violation = '';
  let longest = '';
  const stepTac = SIM_SUBSTEP_MAX_SEC / tacticalWarp;
  // Quick depth: 1,000 random loops (about 170 of them shrink; 1,500 before slice 3a's review fixes, the unit tier's
  // budget), full depth 3,000.
  const samples = byDepth(1000, 3000);
  for (let i = 0; i < samples && !violation; i++) {
    harness.reset();
    // LEAD-2: from the ship's own ring (ship 1: ▼ up to 9,500 km, ▲ from 9,100 km).
    const rp = planet.R + 10 + rng() * (ring.max + 500 - planet.R - 10);
    const ra = Math.max(ring.max + 100, (ring.max + 100) * Math.exp(rng() * Math.log(2e6 / (ring.max + 100))));
    const nu = rng() * Math.PI; // climbing
    const orbit = stateFromElements(rp, (ra - rp) / (ra + rp), rng() * 6.28, nu, mu);
    harness.store.mutate((d) => {
      d.orbit.x = orbit.x; d.orbit.y = orbit.y; d.orbit.vx = orbit.vx; d.orbit.vy = orbit.vy;
      d.burn.sasMode = rng() < 0.5 ? 'retrograde' : 'prograde';
      d.burn.firing = rng() < 0.3;
    });
    const pred = computePrediction(state());
    if (pred.outcome !== 'closed' || pred.apoInSec === null || pred.periodSec === null) continue;
    const objective = flightObjective(buildFlightContext(state(), pred));
    const objectiveText = objective?.text ?? '';
    if (objectiveText.length > longest.length) longest = objectiveText;
    if (pred.burnPoint?.reason === 'shrink') {
      shrinks++;
      if (pred.burnPoint.dvKmS > dvBudgetKmS) violation = `shrink costs ${pred.burnPoint.dvKmS.toFixed(2)} km/s > the tank`;
      continue;
    }
    const wait = objectiveText.match(/^WAIT — .* in (\d+):(\d+)/);
    if (!wait || Number(wait[1]) * 60 + Number(wait[2]) <= SHRINK_WAIT_TAC + 1) continue;
    longWaits++;
    const earlyClimb = pred.apoInSec > SHRINK_MIN_APO_FRAC * pred.periodSec;
    if (!earlyClimb) continue;
    // The margin the first step must keep: the full one once ▼ is below the ring.
    const retro = retroFrom(orbit);
    const required = marginFor(retro.firstStepRp, retro.firstStepRa) + stepTac;
    if (retro.marginTac < required + stepTac) { marginBlocked++; continue; }
    // LEAD-1 (1): a small loop whose ▼ sits in the ring within the kid's reaction time of its inner
    // edge gets no shrink (it would hand over with a late release under the ring); its WAIT for ▼ is
    // short by what "small" means (SHRINK_SMALL_LOOP_FACTOR).
    if (rp >= ring.min && ra <= smallLoopRa && retro.ringExitTac <= shipShrink.edgeBackOffTac + 2 * stepTac) { reactionBlocked++; continue; }
    violation = `rp ${rp.toFixed(0)} ra ${ra.toFixed(0)} nu ${nu.toFixed(2)}: "${objectiveText}" (margin ${retro.marginTac.toFixed(1)} s)`;
  }
  check('target: with a full tank, every long WAIT on the early climb of a too-big loop became SHRINK (bar the margin and the reaction time)',
    violation === '' && shrinks > samples / 6,
    violation || `${shrinks} shrinks; ${longWaits} long WAITs: ${marginBlocked} where the over-hold margin forbids any shrink, `
    + `${reactionBlocked} small loops within the reaction time of the ring's edge (LEAD-1), the rest late in the climb`);
  check(`target: shrink lines fit the strip (≤ ${MAX_LINE_CHARS})`, longest.length <= MAX_LINE_CHARS, `longest ${longest.length}: "${longest}"`);
}

finish();
