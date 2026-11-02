// BALANCE_ONLY: slice 3b review (the unit tier's budget): a regression sentinel for LEAD-1's premise, which LEAD-2 rewrote;
// lead1/fix2/rule4-sweep and lead2/rule4-fuel keep Rule 4 in the quick tier.
// LEAD-1 review round 2: the lead's Rule 4, "a WAIT longer than the SKIP budget is not an option" (PROGRESS.md
// 09:40, binding; follow-up 10:50). A WAIT the FUEL is to blame for (the brake at ▼ the tank can't pay for in
// full, or the WAIT a FUEL-limited shrink leaves) is an option only while SKIP crosses it within
// SKIP_BUDGET_WALL_SEC. Otherwise the last FUEL where it beats ACCEPT now, else ACCEPT ORBIT is the only way on
// (Prediction.acceptOnly): one line, latched for the rest of the flight, SKIP refused, and (the verifier's
// minor) no countdown toward the burn that was dropped.
// LEAD-2 (the coast SKIP) rewrote the rule's premise: every SKIP now crosses any WAIT in a few seconds, so the
// budget decided nothing and is gone (tuning.ts), and so is the last FUEL. Rule 4 now strands only when the FUEL
// is to blame: ACCEPT ORBIT is the only way on when even the whole tank, spent at the trim's apsis, can't reach
// the printers. The checks below keep LEAD-1's structure; each changed one says what changed.
import { createHarness, check, finish, TICK } from '../../wp1/harness';
import { getPrediction, computePrediction } from '@systems/predict';
import {
  buildFlightContext, flightObjective, canAccept, STRANDED_LINE, ACCEPT_ONLY_LINE,
} from '@systems/guidance';
import { skipBlockReason, mainCountdown, SKIP_REFUSAL_STRANDED } from '@systems/pace';
import { countdownChip, plotMarkers, telemetryModel, fuelModel, upcomingEvents } from '@systems/flight-hud';
import { elementsFromState, stateFromElements } from '@/types/orbit';
import { idle, idleThrottled, releaseAtCapture, obey, text, stepUntil, placeOrbit, ignoredAtCapture } from '../../wp1-rules/flows';
import { byDepth } from '../../depth';
import { STRANDED_RANGE_FRAC, SKIP_DIVISOR, SKIP_RAMP_SEC } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const mu = state().level.planet.mu;
// LEAD-2: what "a few seconds" of SKIP means: the ramp plus SKIP_DIVISOR at the warp, and a tick or two.
const FEW_SKIP_SEC = SKIP_RAMP_SEC + SKIP_DIVISOR + 1;

// The capture and the ignore are flown once per ignore time and restored after that (flows.ts ignoredAtCapture).
function lowTank(fuelPct: number, ignoreSec = 60): void {
  ignoredAtCapture(harness, ignoreSec);
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; });
  for (let i = 0; i < 4; i++) harness.step();
}

// --- A tank the whole brake at ▼ can't save: 12% after 60 s of ignoring the capture -----------------------------
// LEAD-2: LEAD-1's dead end was 13% (its brake at ▼ was six wall hours of SKIP away); with the coast SKIP 13–14%
// is the save (`WAIT — brake at ▼ …`, ACCEPTED at 10–12%), and only a tank whose whole brake at ▼ ends under the
// strand line (12%: 9% printer range) gets the STRANDED line.
{
  lowTank(12);
  const pred = getPrediction();
  const objective = flightObjective(buildFlightContext(state(), pred));
  const skip = skipBlockReason(state(), pred);
  harness.press('KeyF');
  harness.step();
  const skipping = state().clock.skipWarp !== null;
  check('12%: even the whole tank braked at ▼ strands → ACCEPT ORBIT only; it strands, so the STRANDED line',
    pred.acceptOnly && pred.strandedAnyway && state().burn.acceptOnly && objective?.id === 'F11-stranded'
    && objective.text === STRANDED_LINE && objective.showAccept && canAccept(state(), pred),
    `"${objective?.text}"`);
  check('12%: SKIP refused (NOT ENOUGH FUEL) and F does nothing', skip === SKIP_REFUSAL_STRANDED && !skipping, `SKIP ${skip}`);
  // The verifier's minor: the header still read `BRAKE IN 35364:26 ▸▸` and the plot `▼ 35364:31`.
  const markers = plotMarkers(state(), pred);
  const fuel = fuelModel(state(), pred);
  check('12%: no countdown toward the dropped burn (header chip, plot ▼/▲ times, START BURN, TIME TO ▼, upcoming), no NEEDED tick',
    mainCountdown(state(), pred) === null && countdownChip(state(), pred) === null
    && markers.peri?.lines[0] === '▼ —' && markers.apo?.lines[0] === '▲ —' && markers.startBurn === null
    && telemetryModel(state(), pred).timeToPeri === '—' && upcomingEvents(state(), pred) === ''
    && fuel.neededPct === null && fuel.needText === '',
    `chip ${JSON.stringify(countdownChip(state(), pred))}, ▼ "${markers.peri?.lines[0]}", ▲ "${markers.apo?.lines[0]}", `
    + `TIME TO ▼ ${telemetryModel(state(), pred).timeToPeri}, FUEL "${fuel.needText}"`);
}

// --- The latch: once said, the plan never flips back ----------------------------------------------------------
{
  lowTank(12);
  const latched = state().burn.acceptOnly;
  // As if the kid found FUEL somewhere (a ?debug edit): unlatched, 40% would get SHRINK THE LOOP.
  harness.store.mutate((d) => { d.burn.fuelPct = 40; });
  const unlatched = computePrediction({ ...state(), burn: { ...state().burn, acceptOnly: false } });
  for (let i = 0; i < 4; i++) harness.step();
  const afterFuel = text(harness);
  harness.press('KeyS');
  harness.keyDown('Space');
  const heldLines = new Set<string>();
  for (let i = 0; i < 20; i++) { harness.step(); heldLines.add(text(harness)); }
  harness.keyUp('Space');
  for (let i = 0; i < 20; i++) { harness.step(); heldLines.add(text(harness)); }
  check('latched: more FUEL, a held burn and its release all keep the one line (no shrink, no F5, no WAIT)',
    latched && unlatched.burnPoint?.reason === 'shrink' && afterFuel === STRANDED_LINE
    && [...heldLines].every((line) => line === STRANDED_LINE) && getPrediction().acceptOnly,
    `unlatched plan: ${unlatched.burnPoint?.reason}; lines: ${[...heldLines].join(' | ')}`);
}

// --- Judged only at rest: a held burn's plan ends early on purpose, and must not latch the verdict -----------
// The tank turns short of the trim under a hold pressed for SHRINK THE LOOP: the plan says RELEASE toward the
// brake at ▼. Held, nothing is latched; after the release the plan at rest decides. LEAD-2: with the last FUEL
// gone that is the brake at ▼ with the whole tank (13% still reaches the printers there), its WAIT a few seconds
// of SKIP, and the flight ends ORBIT ACCEPTED.
{
  ignoredAtCapture(harness, 60);
  harness.keyDown('Space');                       // pressed for SHRINK THE LOOP
  for (let i = 0; i < 4; i++) harness.step();
  harness.store.mutate((d) => { d.burn.fuelPct = 13; });
  let latchedWhileHeld = false;
  for (let i = 0; i < 6; i++) { harness.step(); latchedWhileHeld ||= state().burn.acceptOnly; }
  const heldLine = text(harness);
  const heldPlan = getPrediction();
  harness.keyUp('Space');
  for (let i = 0; i < 3; i++) harness.step();
  const afterLine = text(harness);
  const log = obey(harness, 60);
  check('a burn held when the tank turns short: no verdict while held; at rest the plan decides (the brake at ▼), and it ends ACCEPTED',
    !latchedWhileHeld && !heldPlan.acceptOnly && /^RELEASE \[SPACE\]! — next: brake at ▼/.test(heldLine)
    && /^WAIT — brake at ▼ in \d+:\d\d · \[F\] SKIP$/.test(afterLine) && !state().burn.acceptOnly && harness.status() === 'accepted'
    && log.skipWallSec <= FEW_SKIP_SEC,
    `held: "${heldLine}", after: "${afterLine}" → ${harness.status()}, SKIP ${log.skipWallSec.toFixed(1)} s`);
}

// --- A short tank keeps its WAIT and its SKIP (LEAD-2: it was the last FUEL, or the STRANDED line once that lapsed) --
// 15/25/31% are short of the trim at ▼. They used to get `LAST FUEL: SHRINK THE LOOP` (ORBIT ACCEPTED at 10–52%
// printer range), and the STRANDED line once that offer lapsed. Now the brake at ▼ with the whole tank, a few
// seconds of SKIP away, and left alone the offer never lapses into a worse one.
{
  const rows: string[] = [];
  let bad = '';
  // Quick depth (tests/unit/depth.ts): the band's top end, next to the trim (slice 3a's review fixes, the unit tier's budget:
  // the low end is low-tank.test.ts's 14% row, the same short tank's WAIT and SKIP, held to the empty tank); full: 15/25/31.
  for (const fuelPct of byDepth([31], [15, 25, 31])) {
    lowTank(fuelPct);
    const offer = text(harness);
    idle(harness, 120);
    const later = text(harness);
    const log = obey(harness, 120);
    rows.push(`${fuelPct}%: "${offer}", 2 minutes later "${later}" → ${harness.status()}, SKIP ${log.skipWallSec.toFixed(1)} s`);
    if (!/^WAIT — brake at ▼ in \d+:\d\d · \[F\] SKIP$/.test(offer) || !/^WAIT — brake at ▼/.test(later)
      || !['accepted', 'locked'].includes(harness.status()) || log.skipWallSec > FEW_SKIP_SEC || state().burn.acceptOnly) bad ||= rows[rows.length - 1]!;
  }
  // 31% is short of the impulsive estimate (31.4%) and locks anyway: the strip says RELEASE where the loop enters the
  // ring, short of the trim's aim (obeyed trims spend 2.5–7.6% less than the estimate, WP1-rules round 1).
  check('a short tank: `WAIT — brake at ▼ … · [F] SKIP`, still offered after 2 minutes, a few seconds of SKIP, ACCEPTED (or locked)',
    bad === '', bad || rows.join(' | '));
}

// --- F11-accept: ACCEPT ORBIT the only way on, and it does not strand -------------------------------------------
// Not reached on ship 1 by flying (a loop whose ACCEPT reaches the printers has a burn that does better), so the
// latch is set by hand on such a loop: ▼ in the ring, ▲ just above it.
{
  harness.reset(1);
  const rp = 6000;
  const ra = 11000;
  placeOrbit(harness, stateFromElements(rp, (ra - rp) / (ra + rp), 0, 1.0, mu));
  harness.store.mutate((d) => { d.burn.fuelPct = 3; d.burn.acceptOnly = true; d.burn.sasMode = 'off'; });
  for (let i = 0; i < 4; i++) harness.step();
  const pred = getPrediction();
  const objective = flightObjective(buildFlightContext(state(), pred));
  check(`a latched ACCEPT that reaches the printers (${(pred.greenFraction * 100).toFixed(0)}%): "${ACCEPT_ONLY_LINE}", ACCEPT shown, SKIP refused`,
    pred.acceptOnly && !pred.strandedAnyway && pred.greenFraction >= STRANDED_RANGE_FRAC && objective?.id === 'F11-accept'
    && objective.text === ACCEPT_ONLY_LINE && objective.showAccept && skipBlockReason(state(), pred) === SKIP_REFUSAL_STRANDED,
    `"${objective?.text}"`);
}

// --- The boundary: a WAIT for a burn that locks is kept ------------------------------------------------------
// With a full tank, SHRINK THE LOOP ignored for 12 minutes stops at the over-hold margin (the planet, not the
// FUEL, makes the WAIT long). It left about 337 s of SKIP (LEAD-1's deviation 1); LEAD-2's coast SKIP crosses it
// in a few seconds.
{
  releaseAtCapture(harness);
  idleThrottled(harness, 720);                    // hands off for 12 minutes: a throttled tab's ticks (flows.ts)
  let longestSkip = 0;
  let run = 0;
  let acceptOnlySeen = false;
  obey(harness, 900, () => {
    run = state().clock.pace === 'skip' ? run + TICK : 0;
    longestSkip = Math.max(longestSkip, run);
    acceptOnlySeen ||= getPrediction().acceptOnly;
  });
  check('full tank, SHRINK ignored 12 minutes: the lock WAIT stays, its SKIP takes a few seconds, and it locks; never ACCEPT only',
    harness.status() === 'locked' && !acceptOnlySeen && longestSkip <= FEW_SKIP_SEC,
    `${harness.status()}, longest SKIP ${longestSkip.toFixed(0)} s, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- A SKIP lasts a few seconds whatever it crosses (LEAD-2; it was skipWallSec, the warp-limited estimate) ------
// The capture loop past ▲ with 26% (a short tank whose brake at ▼ saves it): the WAIT and its SKIP stay.
{
  releaseAtCapture(harness);
  const elements = elementsFromState(state().orbit, mu);
  placeOrbit(harness, stateFromElements(elements.rp, elements.e, elements.omega, (-150 * Math.PI) / 180, mu));
  harness.store.mutate((d) => { d.burn.fuelPct = 26; d.burn.closedIdleAiSec = 0; });
  for (let i = 0; i < 4; i++) harness.step();
  const pred = getPrediction();
  const line = text(harness);
  harness.press('KeyF');
  let skipSec = 0;
  stepUntil(harness, () => { if (state().clock.pace === 'skip') skipSec += TICK; return state().clock.skipWarp === null; }, 300);
  check('a short tank whose brake at ▼ saves it keeps `WAIT … · [F] SKIP`, and the SKIP takes a few seconds',
    !pred.acceptOnly && /^WAIT — brake at ▼ in \d+:\d\d · \[F\] SKIP$/.test(line) && skipSec >= SKIP_DIVISOR && skipSec <= FEW_SKIP_SEC,
    `"${line}": SKIP ${skipSec.toFixed(2)} s`);
}

finish();
