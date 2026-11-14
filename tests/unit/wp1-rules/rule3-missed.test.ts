// WP1-rules 3: a missed ▼ on an open path. (b) The flight ends as ESCAPED the moment the ship
// recedes with less FUEL than it takes to close the loop at all. (a) A missed ▼ the kid lets ride
// for IGNORED_NOW_TAC drops to CRUISE and lets SKIP jump to the escape, the strip still saying how
// to save it. Covers the WP1 verifier's Deferred 1 (about 5.5 min idle at TACTICAL after a missed
// ▼; `scenarios.mjs mashlong` flew away 334 s after the burn with 0.2% FUEL left).
// Fix round 1: "close the loop" reaches out to the printers' reach when that is wider than the
// escape radius (closeBoundRadius), a held burn is never cut off, the strip only says MISSED ▼
// while a RETRO burn can still close the loop, and the line is drawn out to the escape radius.
import { createHarness, check, finish, TICK } from '../wp1/harness';
import { computePrediction, getPrediction, secUntil } from '@systems/predict';
import { integrateStep, closeLoopDvKmS, closeBoundRadius, bandReachRadius } from '@systems/orbit-sim';
import { skipBlockReason } from '@systems/pace';
import { plotMarkers } from '@systems/flight-hud';
import { RESULT_SUB } from '@components/burn/BurnResult';
import { createRng } from '@systems/rng';
import { stateFromElements, elementsFromState, ringFit, ringFraction, semiMajorAxis, type Vec2 } from '@/types/orbit';
import { IGNORED_NOW_TAC, ESCAPE_R_FACTOR, SIM_SUBSTEP_MAX_SEC, STRANDED_RANGE_FRAC } from '@data/tuning';
import { text, stepUntil, placeOrbit, flyToCapture } from './flows';

const harness = createHarness(1);
const state = () => harness.store.getState();
const { planet, ring, r0, tacticalWarp, aNominalKmS2, dvBudgetKmS } = state().level;
const mu = planet.mu;
const escapeRadius = ESCAPE_R_FACTOR * r0;
const boundRadius = closeBoundRadius(state().level);
const fuelPctFor = (dvKmS: number): number => (dvKmS / dvBudgetKmS) * 100;
const isOutbound = (): boolean => { const o = state().orbit; return o.x * o.vx + o.y * o.vy > 0; };

// --- (b) The bound: no RETRO burn closes the loop with less Δv; on a coast it only grows --------
{
  const rng = createRng(5);
  let worstRatio = Infinity;
  let worstGap = 0;
  let notMonotone = '';
  for (let i = 0; i < 60; i++) {
    const rp = 5000 + rng() * 5000;
    const e = 1.02 + rng() * 0.5;
    const nu = 0.02 + rng() * 1.0;
    const start = stateFromElements(rp, e, 0, nu, mu);
    const startRadius = Math.hypot(start.x, start.y);
    if (startRadius >= escapeRadius) continue;
    const bound = closeLoopDvKmS(startRadius, Math.hypot(start.vx, start.vy), mu, escapeRadius);
    // The sim's finite RETRO burn at full POWER, until ▲ is inside the escape radius.
    const pos: Vec2 = { x: start.x, y: start.y };
    const vel: Vec2 = { x: start.vx, y: start.vy };
    let spent = 0;
    for (; spent < 6; spent += aNominalKmS2 * SIM_SUBSTEP_MAX_SEC) {
      const fit = ringFit(elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu), { min: 0, max: 1 });
      if (fit.closed && fit.ra < escapeRadius) break;
      const speed = Math.hypot(vel.x, vel.y);
      integrateStep(pos, vel, SIM_SUBSTEP_MAX_SEC, mu, (-aNominalKmS2 * vel.x) / speed, (-aNominalKmS2 * vel.y) / speed);
    }
    worstRatio = Math.min(worstRatio, spent / bound);
    worstGap = Math.max(worstGap, spent - bound);
    // Coasting outward, the bound never falls.
    const coastPos: Vec2 = { x: start.x, y: start.y };
    const coastVel: Vec2 = { x: start.vx, y: start.vy };
    let previous = bound;
    while (Math.hypot(coastPos.x, coastPos.y) < escapeRadius && !notMonotone) {
      integrateStep(coastPos, coastVel, 20, mu, 0, 0);
      const now = closeLoopDvKmS(Math.hypot(coastPos.x, coastPos.y), Math.hypot(coastVel.x, coastVel.y), mu, escapeRadius);
      if (now < previous - 1e-9) notMonotone = `rp ${rp.toFixed(0)} e ${e.toFixed(2)}: ${previous.toFixed(4)} → ${now.toFixed(4)}`;
      previous = now;
    }
  }
  check('3b: no RETRO burn closes the loop with less Δv than closeLoopDvKmS (ending is never premature)',
    worstRatio >= 1, `worst sim/bound ${worstRatio.toFixed(3)}, largest gap ${worstGap.toFixed(3)} km/s`);
  check('3b: on a coast the close-the-loop Δv only grows, so the verdict never flips back', notMonotone === '', notMonotone);
}

// --- (b) The bound reaches the printers: no loop wider than it can be ACCEPTED ------------------
{
  const reach = bandReachRadius(planet.R, ring);
  let best = 0;
  for (let i = 0; i <= 200; i++) {
    const rp = planet.R + ((ring.max - planet.R) * i) / 200;
    const ra = reach * 1.001;
    best = Math.max(best, ringFraction((rp + ra) / 2, (ra - rp) / (ra + rp), ring));
  }
  const atReach = ringFraction((ring.min + reach) / 2, (reach - ring.min) / (reach + ring.min), ring);
  check('3b: the close bound is the printers\' reach (wider than the escape radius), and past it no loop is ACCEPTED',
    boundRadius === reach && reach > escapeRadius && best < STRANDED_RANGE_FRAC && atReach >= STRANDED_RANGE_FRAC - 1e-6,
    `bound ${boundRadius.toFixed(0)} km (escape radius ${escapeRadius}), best range just past it ${(best * 100).toFixed(2)}%, at it ${(atReach * 100).toFixed(2)}%`);
}

// --- (b) The verifier's mashlong: hold SPACE from the start until a sliver of FUEL is left --------
{
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(harness, () => state().burn.fuelPct < 0.3, 60);
  harness.keyUp('Space');
  const releasedAt = harness.wall();
  const sliver = state().burn.fuelPct;
  let lowestPassedAt = -1;
  const lines = new Set<string>();
  stepUntil(harness, () => {
    if (harness.status() === 'approaching') lines.add(text(harness).replace(/ · hold \[F\]$/, ''));
    if (lowestPassedAt < 0 && isOutbound()) lowestPassedAt = harness.wall();
    return false;
  }, 400);
  check('3b mashlong: the strip says NOT ENOUGH FUEL instead of asking for a burn that cannot catch the planet',
    [...lines].every((line) => line === 'NOT ENOUGH FUEL — the ship will fly past'), [...lines].join(' | '));
  check('3b mashlong: with a sliver of FUEL the flight ends as FLEW AWAY right as the ship passes ▼',
    harness.status() === 'escaped' && lowestPassedAt > 0 && harness.wall() - lowestPassedAt <= TICK + 1e-9,
    `FUEL ${sliver.toFixed(2)}%: ${harness.status()} ${(harness.wall() - releasedAt).toFixed(1)} s after letting go `
    + `(▼ at ${(lowestPassedAt - releasedAt).toFixed(1)} s; before: 334 s)`);
  check('3b: the banner keeps the normal FLEW AWAY line', RESULT_SUB.escaped === 'The ship never caught the planet and is heading back into deep space.',
    RESULT_SUB.escaped);
}

// --- (b) Enough FUEL to close the loop but not to reach the ring: keep flying ---------------------
{
  harness.reset(1);
  placeOrbit(harness, stateFromElements(6500, 1.15, 0, 0.15, mu)); // just past ▼, receding
  const orbit = state().orbit;
  const bound = closeLoopDvKmS(Math.hypot(orbit.x, orbit.y), Math.hypot(orbit.vx, orbit.vy), mu, escapeRadius);
  harness.store.mutate((d) => { d.burn.fuelPct = 0; });
  const capture = computePrediction(state()); // the dv of the 'missed' burn to the ring, read with any fuel
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPctFor(bound * 1.15); });
  const missed = computePrediction(state()).burnPoint;
  harness.step();
  const line = text(harness);
  const flying = harness.status() === 'approaching';
  harness.press('KeyS');
  harness.keyDown('Space');
  stepUntil(harness, () => false, 120);
  harness.keyUp('Space');
  check('3b: FUEL to close the loop but not to reach the ring → keeps flying, braking ends ACCEPTED or STRANDED',
    flying && line.startsWith('MISSED ▼') && missed !== null && missed.dvKmS > bound * 1.15
    && (harness.status() === 'accepted' || harness.status() === 'stranded'),
    `bound ${bound.toFixed(3)} km/s, tank ${(bound * 1.15).toFixed(3)}, to the ring ${missed?.dvKmS.toFixed(3)}; "${line}" → ${harness.status()}`
    + ` (impact-free prediction ${capture.outcome})`);
}

// --- (b) An empty tank with ▼ far ahead: SKIP to ▼, where it ends ----------------------------------
{
  harness.reset(1);
  const orbit = stateFromElements(6000, 1.2, 0, -1.6, mu); // inbound, ▼ minutes away
  placeOrbit(harness, orbit);
  harness.store.mutate((d) => { d.burn.fuelPct = 0; });
  harness.step();
  const pred = getPrediction();
  const line = text(harness);
  const start = harness.wall();
  harness.press('KeyF');
  stepUntil(harness, () => false, 120);
  check('3b: empty tank, ▼ far ahead → OUT OF FUEL · hold [F], the escape is at ▼, and F ends it in seconds',
    line === 'OUT OF FUEL — the ship will fly past · hold [F]' && pred.escapeInSec !== null && pred.periInSec !== null
    && Math.abs(pred.escapeInSec - pred.periInSec) < 1e-6 && harness.status() === 'escaped' && harness.wall() - start < 15,
    `"${line}", escape ${(pred.escapeInSec ?? 0).toFixed(0)} s vs ▼ ${(pred.periInSec ?? 0).toFixed(0)} s, `
    + `${harness.status()} ${(harness.wall() - start).toFixed(1)} s after F`);
}

// --- (b) Mid-climb: the predicted escape is where the tank stops covering the close ---------------
{
  harness.reset(1);
  placeOrbit(harness, stateFromElements(6500, 1.15, 0, 0.1, mu));
  const orbit = state().orbit;
  const bound = closeLoopDvKmS(Math.hypot(orbit.x, orbit.y), Math.hypot(orbit.vx, orbit.vy), mu, boundRadius);
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPctFor(bound + 0.05); });
  const predicted = computePrediction(state()).escapeInSec ?? NaN;
  const startT = state().clock.tSec;
  let worstTickSec = 0;
  stepUntil(harness, () => { worstTickSec = Math.max(worstTickSec, state().clock.speed * TICK); return false; }, 400);
  const actual = state().clock.tSec - startT;
  check('3b: the predicted escape time matches the real one (within a tick)',
    harness.status() === 'escaped' && Math.abs(actual - predicted) <= worstTickSec + 1e-6
    && Math.hypot(state().orbit.x, state().orbit.y) < escapeRadius,
    `predicted ${predicted.toFixed(1)} game s, actual ${actual.toFixed(1)} (tick ≤ ${worstTickSec.toFixed(1)}), `
    + `ended at ${Math.hypot(state().orbit.x, state().orbit.y).toFixed(0)} km, inside the ${escapeRadius} km escape radius`);
}

// --- (a) The verifier's `missed` kid who never brakes (FUEL to spare): CRUISE after 20 tac s ------
function missTheLowest(): number {
  flyToCapture(harness);           // "HOLD [SPACE] NOW" for the capture, ignored
  stepUntil(harness, isOutbound, 60);
  return state().clock.tSec;
}
{
  const lowestT = missTheLowest();
  let cruiseAtTac = -1;
  let skipAtTac = -1;
  let lineAtCruise = '';
  stepUntil(harness, () => {
    const sinceTac = (state().clock.tSec - lowestT) / tacticalWarp;
    if (cruiseAtTac < 0 && harness.pace() === 'cruise') { cruiseAtTac = sinceTac; lineAtCruise = text(harness); }
    if (skipAtTac < 0 && skipBlockReason(state(), getPrediction()) === null) skipAtTac = sinceTac;
    return cruiseAtTac >= 0 && skipAtTac >= 0;
  }, 60);
  check('3a: ignored MISSED ▼ stays TACTICAL for IGNORED_NOW_TAC, then CRUISE with SKIP; the strip keeps MISSED ▼ and names F',
    Math.abs(cruiseAtTac - IGNORED_NOW_TAC) <= 0.1 && Math.abs(skipAtTac - cruiseAtTac) <= 0.1
    && lineAtCruise === 'MISSED ▼ — hold [SPACE] NOW · hold [F]',
    `CRUISE at ${cruiseAtTac.toFixed(2)} tac s after ▼, SKIP at ${skipAtTac.toFixed(2)}, line "${lineAtCruise}"`);
  const pressedAt = harness.wall();
  harness.press('KeyF');
  stepUntil(harness, () => false, 400);
  check('3a: F then ends it as FLEW AWAY within seconds (before: about 341 s at TACTICAL)',
    harness.status() === 'escaped' && harness.wall() - pressedAt < 15, `${harness.status()} ${(harness.wall() - pressedAt).toFixed(1)} s after F`);
}
{
  missTheLowest();
  const start = harness.wall();
  stepUntil(harness, () => false, 400);
  // 20 tac s at TACTICAL, then CRUISE (3× faster) out to the escape radius: under half the old time.
  check('3a: not pressing F, CRUISE alone still ends it in under half the old time',
    harness.status() === 'escaped' && harness.wall() - start < 341 / 2, `${harness.status()} ${(harness.wall() - start).toFixed(1)} s after ▼ (before: about 341 s)`);
}
{
  // Burning again brings TACTICAL back at once and cancels the SKIP; letting go restarts the count.
  // LEAD-2 review round 2 made the first SPACE during a SKIP only stop it; review round 3 narrowed that to the lines
  // that do not ask for SPACE. This SKIP runs under `MISSED ▼ — hold [SPACE] NOW`, so the press brakes at once again.
  const lowestT = missTheLowest();
  stepUntil(harness, () => harness.pace() === 'cruise', 60);
  harness.press('KeyF');
  stepUntil(harness, () => state().clock.skipWarp !== null, 2);
  harness.keyDown('Space');
  const firingAtPress = state().burn.firing;
  harness.step();
  const paceHeld = harness.pace();
  const skipHeld = state().clock.skipWarp;
  for (let i = 0; i < 4; i++) harness.step();
  harness.keyUp('Space');
  const releasedT = state().clock.tSec;
  stepUntil(harness, () => harness.pace() === 'cruise', 60);
  const againTac = (state().clock.tSec - releasedT) / tacticalWarp;
  check('3a: SPACE during the SKIP after the drop → it burns at once, the SKIP stops, TACTICAL; letting go gives another 20 tac s',
    firingAtPress && paceHeld === 'tactical' && skipHeld === null && Math.abs(againTac - IGNORED_NOW_TAC) <= 0.1,
    `firing at the press ${firingAtPress}, pace ${paceHeld}, skip ${skipHeld}, CRUISE again ${againTac.toFixed(2)} tac s after letting go (▼ was ${((releasedT - lowestT) / tacticalWarp).toFixed(1)} tac s ago)`);
}
{
  // The verifier's `missed`: brakes 4 s after MISSED appears and holds to the end. Still locks.
  flyToCapture(harness);
  stepUntil(harness, () => /MISSED/.test(text(harness)), 30);
  stepUntil(harness, () => false, 4);
  harness.keyDown('Space');
  stepUntil(harness, () => /RELEASE|HOLD STEADY/.test(text(harness)), 40);
  harness.keyUp('Space');
  stepUntil(harness, () => false, 60);
  check('3a: a late brake inside the 20 s still captures and locks (the verifier\'s `missed`)', harness.status() === 'locked',
    `${harness.status()}, FUEL ${state().burn.fuelPct.toFixed(1)}%`);
}

// --- (b) Short of the escape radius, inside the printers' reach: brake, ACCEPTED (experience major) ---
// The by-the-book coast with ▼ at about 6,009 km. Below the reach bound the strip says the ship
// flies past (braking could at best strand it); above it the capture is planned and braking on,
// whether started before or after ▼, is never cut off while the tank still holds FUEL.
function coastWithFuel(fuelPct: number): void {
  harness.reset(1);
  harness.keyDown('Space');
  stepUntil(harness, () => harness.rp() >= 6000, 60);
  harness.keyUp('Space');
  harness.press('KeyS');
  for (let i = 0; i < 40; i++) harness.step();
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; });
  for (let i = 0; i < 4; i++) harness.step();
}
function brakeFrom(leadTac: number): { status: string; cutOffWithFuel: number | null; range: number } {
  stepUntil(harness, () => {
    const pred = getPrediction();
    return pred.periInSec === null || secUntil(pred, pred.periInSec, state().clock.tSec) / tacticalWarp <= leadTac;
  }, 400);
  harness.keyDown('Space');
  let cutOffWithFuel: number | null = null;
  stepUntil(harness, () => state().burn.fuelPct <= 0, 60);
  if (harness.status() !== 'approaching' && state().burn.fuelPct > 0) cutOffWithFuel = state().burn.fuelPct;
  const after = elementsFromState(state().orbit, mu);
  const range = after.e < 1 ? ringFraction(semiMajorAxis(after), after.e, ring) : 0;
  harness.keyUp('Space');
  stepUntil(harness, () => false, 5);
  return { status: harness.status(), cutOffWithFuel, range };
}
{
  const rows: string[] = [];
  let bad = '';
  for (const fuelPct of [15, 16, 18, 20, 22]) {
    coastWithFuel(fuelPct);
    const line = text(harness);
    const lowFuel = /^NOT ENOUGH FUEL/.test(line);
    const braked = brakeFrom(2);
    rows.push(`${fuelPct}%: "${line.replace(/\d+:\d+/, 'm:ss')}" → ${braked.status} (range ${(braked.range * 100).toFixed(0)}%)`);
    if (braked.status === 'accepted' && lowFuel) bad ||= `${fuelPct}%: the strip said fly past, braking gave ACCEPTED`;
    if (!lowFuel && braked.status !== 'accepted' && braked.status !== 'stranded') bad ||= `${fuelPct}%: planned a burn that flew away`;
    if (braked.cutOffWithFuel !== null) bad ||= `${fuelPct}%: cut off with ${braked.cutOffWithFuel.toFixed(1)}% FUEL`;
  }
  check('3b/LOWFUEL: "the ship will fly past" only where braking can at best strand it; 18%+ is ACCEPTED',
    bad === '' && rows.some((row) => row.startsWith('18%') && row.includes('accepted')), bad || rows.join(' | '));
}
{
  const rows: string[] = [];
  let bad = '';
  for (const fuelPct of [20, 22]) {
    for (const leadTac of [1, 0.5, 0]) {
      coastWithFuel(fuelPct);
      const braked = brakeFrom(leadTac);
      rows.push(`${fuelPct}% from ▼−${leadTac}: ${braked.status}`);
      if (braked.cutOffWithFuel !== null || braked.status === 'escaped') bad ||= `${fuelPct}% from ▼−${leadTac}: ${braked.status}, FUEL ${braked.cutOffWithFuel}`;
    }
  }
  check('3b: a held burn is never cut off as FLEW AWAY while FUEL is left (the reviewer\'s 20–22% cases end ACCEPTED)',
    bad === '', bad || rows.join(' | '));
}

// --- (b) The grey zone past ▼: above the bound, yet no RETRO burn closes the loop --------------
// The bound holds for any burn direction, so a little above it the best RETRO burn still falls
// short. There the strip says NOT ENOUGH FUEL (no MISSED ▼ for a burn that cannot work), and the
// flight goes on until the tank is below the bound itself. Braking anyway can at best close a loop
// beyond the printers' reach: STRANDED, which loses the souls just like flying away.
{
  harness.reset(1);
  placeOrbit(harness, stateFromElements(6000, 1.3, 0, 1.0, mu)); // receding, well past ▼
  const orbit = state().orbit;
  const bound = closeLoopDvKmS(Math.hypot(orbit.x, orbit.y), Math.hypot(orbit.vx, orbit.vy), mu, boundRadius);
  // Find the least tank the strip still calls MISSED ▼ for, then sit just under it.
  let lo = bound;
  let hi = bound * 2;
  const isMissed = (dvKmS: number): boolean => {
    placeOrbit(harness, orbit);
    harness.store.mutate((d) => { d.burn.fuelPct = fuelPctFor(dvKmS); });
    return computePrediction(state()).burnPoint?.reason === 'missed';
  };
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (isMissed(mid)) hi = mid; else lo = mid; }
  const greyDv = (bound + hi) / 2;
  placeOrbit(harness, orbit);
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPctFor(greyDv); });
  harness.step();
  const line = text(harness);
  const flying = harness.status() === 'approaching';
  // Braking anyway, at full POWER, with the whole tank: it does not close the loop.
  harness.press('KeyS');
  harness.keyDown('Space');
  stepUntil(harness, () => state().burn.fuelPct <= 0, 60);
  harness.keyUp('Space');
  stepUntil(harness, () => false, 2);
  check('3b grey zone: above the bound but beyond any RETRO burn → NOT ENOUGH FUEL, the flight goes on, braking cannot save it',
    flying && /^NOT ENOUGH FUEL — the ship will fly past/.test(line) && (harness.status() === 'escaped' || harness.status() === 'stranded')
    && hi > bound,
    `bound ${bound.toFixed(3)} km/s, RETRO needs ${hi.toFixed(3)}, tank ${greyDv.toFixed(3)}: "${line}", flying ${flying}, after braking ${harness.status()}`);
}

// --- The drawn line of a flyby the tank can't catch still runs out to the escape radius -----------
{
  coastWithFuel(60);
  const base = state();
  const reach = (fuelPct: number) => {
    const probe = { ...base, burn: { ...base.burn, fuelPct } };
    const pred = computePrediction(probe);
    const last = pred.points[pred.points.length - 1]!;
    const flyby = plotMarkers(probe, pred).flyby;
    return {
      lastR: Math.hypot(last.x, last.y),
      tagAtPeri: flyby !== null && Math.abs(Math.hypot(flyby.pos.x, flyby.pos.y) - pred.rp) < 50,
      cannotClose: pred.cannotClose,
    };
  };
  const rows = [60, 25, 10, 0].map((fuelPct) => ({ fuelPct, ...reach(fuelPct) }));
  check('line: an open path is drawn out to the escape radius whatever the tank (LOWFUEL and NOFUEL too), FLYBY not on ▼',
    rows.every((row) => row.lastR >= escapeRadius - 1 && !row.tagAtPeri) && rows.some((row) => row.cannotClose),
    rows.map((row) => `${row.fuelPct}%: ends at ${row.lastR.toFixed(0)} km${row.cannotClose ? ' (cannot close)' : ''}${row.tagAtPeri ? ', FLYBY on ▼' : ''}`).join(' | '));
}

finish();
