// WP1 units: guidance coverage and line length, the strip hysteresis, the F4 outbound rule,
// seeded RNG, ship validation.
import { createHarness, check, finish } from './harness';
import {
  buildFlightContext, flightObjective, createObjectiveFilter, formatTac, type FlightObjective,
} from '@systems/guidance';
import { computePrediction } from '@systems/predict';
import { integrateStep } from '@systems/orbit-sim';
import { presetHeading } from '@systems/attitude';
import { createRng, childRng, smoothNoise } from '@systems/rng';
import { validateShipDef, type ShipDef } from '@data/ships';
import { stateFromElements, elementsFromState, type Vec2 } from '@/types/orbit';
import type { PresetMode, SasMode } from '@state/schema';
import { MAX_LINE_CHARS } from '@data/tuning';
import { fixtureShip } from '../support/arm-ship';

const harness = createHarness(21);
const store = harness.store;

// --- Fuzz: every reachable flight state yields one valid objective ---------------------
{
  const rng = createRng(99);
  const modes: SasMode[] = ['off', 'prograde', 'retrograde', 'radial-in', 'radial-out'];
  let evaluated = 0;
  let longest = '';
  const ids = new Set<string>();
  // WP1-rules fix round 1 variants the ids don't tell apart: MISSED ▼ once SKIP is allowed (3a),
  // and the hand-over for a hold pressed for another burn along the same preset (burn.firingFor).
  const variants = new Set<string>();
  // LEAD-2: the last-FUEL shrink's key ('shrink+last|now|due') went with the last FUEL; a due trim at ▲ takes its
  // place, so the list keeps its length and the random sequence stays as it was.
  const pressedFor = [null, 'shrink|now|due', 'rp-low|apo|due', 'capture|peri|ahead', 'ra-high|peri|due', 'ra-high|peri|ahead', 'rp-low|apo|ahead'];
  // LEAD-1 review round 2: some states carry the ACCEPT-only latch (Rule 4, burn.acceptOnly), so the fuzz also
  // covers F11-accept (a latched ACCEPT that reaches the printers; on ship 1 only the latch leads there) and the
  // latch under every other row's conditions. Its own RNG keeps the rest of the random sequence as it was.
  const latchRng = createRng(4);
  let failure = '';
  for (let i = 0; i < 4000 && !failure; i++) {
    harness.reset();
    const mu = store.getState().level.planet.mu;
    const rp = 2000 + rng() * 14000;
    const e = rng() * 1.5;
    const nuMax = e < 1 ? Math.PI : Math.acos(-1 / e) * 0.95;
    const nu = (rng() * 2 - 1) * nuMax;
    const s = stateFromElements(rp, e, rng() * 6.28, nu, mu);
    if (Math.hypot(s.x, s.y) <= store.getState().level.planet.R + 1) continue; // underground: not a state
    const firing = rng() < 0.5;
    const mode = modes[Math.floor(rng() * modes.length)] ?? 'off';
    const fuel = rng() < 0.2 ? 0 : rng() * 100;
    const idle = rng() < 0.2 ? 20 : 0;
    store.mutate((d) => {
      d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy;
      d.burn.firing = firing; d.burn.firingSource = firing ? 'player' : null;
      d.burn.firingFor = firing ? pressedFor[Math.floor(rng() * pressedFor.length)] ?? null : null;
      d.burn.missedIdleTac = rng() < 0.3 ? 30 : 0;
      d.burn.sasMode = mode; d.burn.fuelPct = fuel; d.burn.closedIdleAiSec = idle;
      d.burn.presetAligning = rng() < 0.3;
      d.burn.acceptOnly = latchRng() < 0.08;
      d.clock.tSec = rng() * 50;
    });
    try {
      const pred = computePrediction(store.getState());
      const objective = flightObjective(buildFlightContext(store.getState(), pred));
      if (!objective) { failure = `null objective while approaching (rp ${rp.toFixed(0)}, e ${e.toFixed(2)})`; break; }
      ids.add(objective.id.replace(/-(rp|ra)-(low|high)$/, '-trim'));
      if (/^F9-(press|hold)$/.test(objective.id) && objective.text.endsWith('· [F] SKIP')) variants.add('F9+skip');
      if (objective.id === 'F5-next' && pred.burnPoint?.preset === store.getState().burn.sasMode) variants.add('F5-next-same-preset');
      // LEAD-1 review round 1: a trim the tank can't pay for keeps its WAIT and SKIP while the burn there
      // still saves the ship, and names no ACCEPT that strands it.
      if (objective.id === 'F11-wait' && pred.burnPoint && store.getState().burn.fuelPct < pred.neededPct
        && !pred.strandedAnyway && objective.text.includes('[F] SKIP') && pred.greenFraction < 0.1) {
        variants.add('F11-wait-short+skip');
      }
      if (objective.text.length > longest.length) longest = objective.text;
      // LEAD-1: the same state with a damaged Autopilot (Q/E key hints, the longest wording of every
      // press line) must fit too: `LOOP TOO BIG — at ▼ turn to RETRO with [Q]/[E] and burn · or ACCEPT
      // ORBIT` ran to 73 characters.
      const turnWords = flightObjective({ ...buildFlightContext(store.getState(), pred), presetsAvailable: false });
      if (turnWords && turnWords.text.length > longest.length) longest = turnWords.text;
      evaluated++;
    } catch (err) {
      failure = `rp ${rp.toFixed(0)} e ${e.toFixed(3)} nu ${nu.toFixed(2)} mode ${mode} firing ${firing}: ${String(err)}`;
    }
  }
  check('guidance: never throws on 4,000 random flight states', failure === '', failure || `${evaluated} evaluated`);
  check(`guidance: every line ≤ ${MAX_LINE_CHARS} chars`, longest.length <= MAX_LINE_CHARS, `longest ${longest.length}: '${longest}'`);
  // F5-next, SHRINK-* and LOWFUEL-open are the WP1-rules rows (the hand-over line, shrinking
  // the loop, and a flyby the tank can no longer catch). F11-stranded is LEAD-1's loop no burn can save, F11-accept
  // review round 2's ACCEPT ORBIT as the only way on when that ACCEPT reaches the printers. LEAD-2: the last FUEL's
  // SHRINK-last-* rows are gone (the coast SKIP made the WAIT for the trim's apsis cheap, and the tank does more
  // there); a trim the tank can't pay for, held, says F11-keep-dry (`KEEP HOLDING — it may take all your FUEL`).
  const expected = ['F3', 'F3b', 'F4-press', 'F4-hold', 'F4-keep', 'F5', 'F5-next', 'F6-keep', 'F6-release', 'F6-past',
    'F7-press', 'F8-press', 'F9-press', 'F9-keep', 'F10-turn', 'F10-wait', 'F10-keep', 'F11-trim', 'F11-keep', 'F11-keep-dry', 'F11-wait',
    'F11-stranded', 'SHRINK-press', 'SHRINK-hold', 'SHRINK-keep', 'LOWFUEL-open', 'F11-accept'];
  const missing = expected.filter((id) => !ids.has(id));
  check('guidance: the fuzz reaches every main row', missing.length === 0, `missing: ${missing.join(',') || 'none'}; saw ${ids.size} ids`);
  const missingVariants = ['F9+skip', 'F5-next-same-preset', 'F11-wait-short+skip'].filter((variant) => !variants.has(variant));
  check('guidance: the fuzz reaches MISSED ▼ with SKIP, the same-preset hand-over and an unpaid trim that still saves the ship',
    missingVariants.length === 0, `missing: ${missingVariants.join(',') || 'none'}`);
}

// --- Terminal: no objective -------------------------------------------------------------------
{
  harness.reset();
  store.mutate((d) => { d.burn.status = 'crashed'; });
  check('guidance: no objective after the flight', flightObjective(buildFlightContext(store.getState(), computePrediction(store.getState()))) === null);
}

// --- Opening line --------------------------------------------------------------------------
{
  harness.reset();
  const objective = harness.objective();
  check("opening objective: DON'T HIT THE PLANET — hold [SPACE]",
    objective?.text === "DON'T HIT THE PLANET — hold [SPACE]" && objective.urgency === 'now', objective?.text);
}

// --- F4 when outbound: OUT would lower ▼, PRO raises it -------------------------------------
{
  harness.reset();
  const mu = store.getState().level.planet.mu;
  // A closed loop whose ▼ is underground, ship climbing toward ▲.
  const s = stateFromElements(3000, 0.6, 0, 2.0, mu);
  const rpAfter = (mode: PresetMode): number => {
    const pos: Vec2 = { x: s.x, y: s.y };
    const vel: Vec2 = { x: s.vx, y: s.vy };
    for (let i = 0; i < 40; i++) {
      const heading = presetHeading(mode, { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y });
      integrateStep(pos, vel, 1, mu, 0.005 * Math.cos(heading), 0.005 * Math.sin(heading));
    }
    return elementsFromState({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y }, mu).rp;
  };
  const rpOut = rpAfter('radial-out');
  const rpPro = rpAfter('prograde');
  check('F4 outbound: OUT lowers ▼ there, PRO raises it', rpOut < 3000 && rpPro > 3000,
    `OUT → ${rpOut.toFixed(0)}, PRO → ${rpPro.toFixed(0)} (from 3,000)`);
  store.mutate((d) => { d.orbit.x = s.x; d.orbit.y = s.y; d.orbit.vx = s.vx; d.orbit.vy = s.vy; d.burn.sasMode = 'radial-out'; });
  const objective = flightObjective(buildFlightContext(store.getState(), computePrediction(store.getState())));
  check('F4 outbound: guidance asks for PRO', objective?.text === "DON'T HIT THE PLANET — press [W] (PRO), hold [SPACE]", objective?.text);
}

// --- Hysteresis -----------------------------------------------------------------------------
{
  const make = (id: string, urgency: FlightObjective['urgency']): FlightObjective =>
    ({ id, text: id, keys: [], urgency, showAccept: false });
  const filter = createObjectiveFilter();
  filter.next(make('A', 'soon'), 0.05);
  let shown = filter.next(make('B', 'wait'), 0.05);
  check('hysteresis: a non-urgent change waits', shown?.id === 'A');
  let ticks = 0;
  while (shown?.id !== 'B' && ticks < 20) { shown = filter.next(make('B', 'wait'), 0.05); ticks++; }
  check('hysteresis: it switches after 0.3 s', shown?.id === 'B' && Math.abs(ticks * 0.05 - 0.3) < 0.051, `${(ticks * 0.05).toFixed(2)} s`);
  shown = filter.next(make('C', 'now'), 0.05);
  check('hysteresis: an urgent objective switches at once', shown?.id === 'C');
  filter.next(make('D', 'soon'), 0.05);
  shown = filter.next(make('C', 'now'), 0.05);
  check('hysteresis: a flicker back never shows the blip', shown?.id === 'C');
}

// --- Formatting -----------------------------------------------------------------------------
check('formatTac rounds up to whole seconds', formatTac(163.25) === '2:44' && formatTac(4.01) === '0:05' && formatTac(0) === '0:00' && formatTac(-3) === '0:00',
  `${formatTac(163.25)} ${formatTac(4.01)} ${formatTac(0)} ${formatTac(-3)}`);

// --- RNG -------------------------------------------------------------------------------------
{
  const first = childRng(42, 0, 'flight');
  const again = childRng(42, 0, 'flight');
  const other = childRng(42, 0, 'hollow');
  const seqA = [first(), first(), first()];
  const seqB = [again(), again(), again()];
  const seqC = [other(), other(), other()];
  check('rng: same seed and stream replay exactly', seqA.every((value, i) => value === seqB[i]));
  check('rng: streams are independent', seqA.some((value, i) => value !== seqC[i]));
  const rng = createRng(1);
  let sum = 0;
  for (let i = 0; i < 10000; i++) sum += rng();
  check('rng: uniform-ish mean', Math.abs(sum / 10000 - 0.5) < 0.02, (sum / 10000).toFixed(4));
  const sampled = smoothNoise(7, 123.4, 6);
  check('noise: a pure function of time (warp-invariant)', sampled === smoothNoise(7, 123.4, 6) && sampled >= -1 && sampled <= 1);
}

// --- Ship validation ---------------------------------------------------------------------------
{
  const base = fixtureShip(0);
  const broken = (patch: (ship: ShipDef) => void): boolean => {
    const ship = structuredClone(base) as ShipDef;
    patch(ship);
    try { validateShipDef(ship); return false; } catch { return true; }
  };
  check('ships: ARES-VII validates', !broken(() => {}));
  check('ships: ring inside the atmosphere throws', broken((ship) => { ship.flight.ring.min = 3700; }));
  check('ships: inverted ring throws', broken((ship) => { ship.flight.ring.max = 4000; }));
  check('ships: start inside the ring throws', broken((ship) => { ship.flight.start.r0 = 8000; }));
  check('ships: cruise not faster than tactical throws', broken((ship) => { ship.flight.cruiseWarp = 20; }));
  check('ships: non-positive budget throws', broken((ship) => { ship.flight.dvBudgetKmS = 0; }));
}

finish();
