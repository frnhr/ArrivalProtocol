// LEAD-2 review round 2: DON'T HIT THE PLANET (F4) never asks for a burn that opens the loop (any ship: AP_SHIP=1, 2).
// The verifier's case: SPACE held with RETRO during the long SKIP, far out on a just-captured loop, reverses the slow
// velocity and leaves a near-radial path with ▼ under the surface. F4 asked for PRO whenever the ship was outbound;
// along a near-radial path PRO adds energy and almost no angular momentum, so obeying it ended ESCAPED while the strip
// said `KEEP HOLDING [SPACE] — lift ▼ out of the planet` (ship 1: 4 of 20 rows, KESTREL at 38% FUEL: 2 of 20). F4 now
// reads predict.ts liftPreset: outbound PRO only where, pushed to a parabola, it leaves ▼ LIFT_PRO_CLEARANCE above the
// surface; otherwise IN, which adds no energy.
// • The verifier's grid (tests/lead2/verify1/probes/far-escape.ts): SPACE 2.5–5.5 s into the long SKIP, held 0.5–2 s,
//   then the strip obeyed (F included) until the flight ends or ACCEPT ORBIT has been the line for 3 s. Since the
//   lead's ruling of 21:40 that hold only stops the SKIP: every flight locks or is accepted. The same grid with SPACE
//   pressed again after the stop (a fresh RETRO hold far out, which still burns): no flight ends ESCAPED or CRASHED
//   while the strip's last line asked for a burn, every flight ends or reaches ACCEPT ORBIT, and the lift's line never
//   flickers between presets while the burn is held.
// • WP7's doomed-but-savable ship (200 km up, near ▲ of a low loop), obeyed: ▼ lifts, with one or two switches.
// • The lift itself, held as the strip (and BEAM OUT's liftOutDvKmS) chooses it on every sub-step, from planted loops
//   with ▼ under the surface, near and far: it never opens the loop before ▼ clears the planet. WP1's PRO-outbound rule
//   is flown on the same loops for the record.
// • The planted cases: WP1's outbound loop keeps PRO, the far near-radial path asks IN outbound and OUT inbound, and
//   the IN line fits the strip in both wordings.
import { createHarness, check, finish, HARNESS_SHIP, TICK } from '../../wp1/harness';
import { getPrediction, computePrediction, liftPreset } from '@systems/predict';
import { buildFlightContext, flightObjective } from '@systems/guidance';
import { integrateStep } from '@systems/orbit-sim';
import { presetHeading } from '@systems/attitude';
import { releaseAtCapture, stepUntil, idle, text } from '../../wp1-rules/flows';
import { stateFromElements, elementsFromState, type OrbitState } from '@/types/orbit';
import type { PresetMode } from '@state/schema';
import { SIM_SUBSTEP_MAX_SEC, MAX_LINE_CHARS } from '@data/tuning';

const harness = createHarness(1);
const state = () => harness.store.getState();
const ship = `ship ${HARNESS_SHIP + 1}`;
// 25% is inside KESTREL's STRANDED band after a let-go-at-CAPTURED capture (no long WAIT to SKIP), so it flies 38%.
// WP10: VESPER's tank is 1.8 km/s, so its 25% (0.45 km/s) is ACCEPT ORBIT there (NOT ENOUGH FUEL to reach the
// printers, no WAIT); it flies KESTREL's 38% in km/s (0.8 km/s: 44%). WP11: LAST LIGHT (2.5 km/s), the same 0.8 km/s: 32%.
const FUEL_PCT_BY_SHIP = [25, 25, 38, 44, 32];
const FUEL_PCT: number = FUEL_PCT_BY_SHIP[HARNESS_SHIP] ?? ((): never => { throw new Error(`far-lift: no FUEL set for ship ${HARNESS_SHIP}`); })();
const OBEY_WALL_SEC = 300;
const ACCEPT_STOP_SEC = 3;
const BURN_LINE = /KEEP HOLDING|hold \[SPACE\]|NOW/;
// A preset the line comes back to within this long after leaving it was a flicker: the strip's own hysteresis is 0.3 s,
// and turning to a preset 90° away takes the Autopilot about 0.5 s.
const LIFT_FLICKER_SEC = 0.5;
const PRESET_OF_KEY: Record<string, PresetMode> = { W: 'prograde', S: 'retrograde', A: 'radial-in', D: 'radial-out' };

// --- The verifier's grid, obeyed to the end ------------------------------------------------------------------------
interface GridResult {
  tally: Record<string, number>;
  rows: string[];
  lie: string;         // a flight that ended ESCAPED or CRASHED under a burn line
  endless: string;     // a flight that neither ended nor reached ACCEPT ORBIT
  flicker: string;
  switchedBack: number;
  liftRows: number;
  inAsked: number;
}
// `stopFirst`: SPACE is pressed once to stop the SKIP (the lead's ruling: that press only stops it), and the RETRO hold
// is a fresh press after it, so the far-out lift is still flown; otherwise SPACE is held from inside the SKIP.
function flyGrid(stopFirst: boolean): GridResult {
  const result: GridResult = { tally: {}, rows: [], lie: '', endless: '', flicker: '', switchedBack: 0, liftRows: 0, inAsked: 0 };
  for (const intoSkipSec of [2.5, 3.5, 4.5, 5, 5.5]) {
    for (const holdSec of [0.5, 1, 1.5, 2]) {
      releaseAtCapture(harness);
      harness.store.mutate((d) => { d.burn.fuelPct = FUEL_PCT; });
      if (!stepUntil(harness, () => /^WAIT — brake at ▼/.test(text(harness)), 4000)) throw new Error(`far-lift: no WAIT offered: "${text(harness)}"`);
      harness.press('KeyF');
      idle(harness, intoSkipSec);
      const farKm = Math.hypot(state().orbit.x, state().orbit.y);
      if (stopFirst) {
        harness.press('Space');
        harness.step();
      }
      harness.keyDown('Space');
      idle(harness, holdSec);
      harness.keyUp('Space');
      // The first line after the let-go still reads the prediction made under the kid's own RETRO, which turns the
      // slow velocity over every tick; the lift is judged from the first prediction made after it.
      const releasedAtTSec = state().clock.tSec;

      let holding = false;
      let acceptSec = 0;
      let lastLine = '';
      // The lift presets F4 asked for during one hold, in order, with the wall time each was first asked (a hold
      // ends with a let-go).
      let asked: { preset: PresetMode; atWall: number }[] = [];
      let sawLift = false;
      const end = harness.wall() + OBEY_WALL_SEC;
      while (harness.wall() < end && harness.status() === 'approaching') {
        const line = text(harness);
        lastLine = line;
        acceptSec = /— ACCEPT ORBIT$/.test(line) ? acceptSec + 0.05 : 0;
        if (acceptSec >= ACCEPT_STOP_SEC) break;
        const press = line.match(/press \[([WASD])\]/);
        if (/^DON'T HIT THE PLANET|lift ▼ out of the planet/.test(line) && getPrediction().asOfTSec > releasedAtTSec) {
          sawLift = true;
          const preset = press ? PRESET_OF_KEY[press[1] ?? ''] : getPrediction().liftPreset;
          const last = asked[asked.length - 1];
          if (preset && last?.preset !== preset) {
            // A flicker: back to a preset it left less than LIFT_FLICKER_SEC ago. (Near rest one tick of thrust is the
            // whole velocity, so the first PRO tick, up to PRESET_ALIGN_DEG off, can leave the path steep enough that
            // the strip asks IN, and then PRO again once IN has turned it: a switch the kid can follow, not a flicker.)
            const earlier = asked.find((entry) => entry.preset === preset);
            if (holding && earlier && last && harness.wall() - last.atWall < LIFT_FLICKER_SEC) {
              result.flicker ||= `SPACE ${intoSkipSec} s / ${holdSec} s: ${[...asked.map((entry) => entry.preset), preset].join(' → ')}`;
            }
            if (holding && earlier) result.switchedBack++;
            asked.push({ preset, atWall: harness.wall() });
          }
          if (preset === 'radial-in') result.inAsked++;
        }
        if (line.includes('[F]') && state().clock.skipWarp === null) harness.press('KeyF');
        if (press) harness.press(`Key${press[1]}`);
        if (holding && /RELEASE|HOLD STEADY|TOO EARLY|WAIT|TURN AROUND/.test(line)) { harness.keyUp('Space'); holding = false; asked = []; }
        else if (!holding && BURN_LINE.test(line)) { harness.keyDown('Space'); holding = true; }
        harness.step();
      }
      if (holding) harness.keyUp('Space');
      if (sawLift) result.liftRows++;
      const status = harness.status();
      const pred = getPrediction();
      const ending = status !== 'approaching' ? status : acceptSec >= ACCEPT_STOP_SEC ? (pred.strandedAnyway ? 'STRANDED-line' : 'ACCEPT-only') : 'still-flying';
      result.tally[ending] = (result.tally[ending] ?? 0) + 1;
      const row = `SPACE ${intoSkipSec} s into the SKIP at ${(farKm / 1e3).toFixed(0)}k km${stopFirst ? ', pressed again' : ''}, held ${holdSec} s: `
        + `${ending}, FUEL ${state().burn.fuelPct.toFixed(1)}%${sawLift ? ' (lifted)' : ''}, last "${lastLine}"`;
      result.rows.push(row);
      if ((status === 'escaped' || status === 'crashed') && BURN_LINE.test(lastLine)) result.lie ||= row;
      if (ending === 'still-flying') result.endless ||= row;
    }
  }
  console.log(result.rows.join('\n'));
  return result;
}
{
  // As the verifier flew it: the hold starts inside the SKIP, so it only stops the SKIP, and nothing is lifted.
  const held = flyGrid(false);
  check(`${ship} at ${FUEL_PCT}% FUEL: SPACE held with RETRO 2.5–5.5 s into the long SKIP (it only stops the SKIP), then the strip obeyed: `
    + 'every flight locks or is accepted, none ever needs DON\'T HIT THE PLANET',
    Object.keys(held.tally).every((ending) => ending === 'locked' || ending === 'accepted') && held.liftRows === 0, JSON.stringify(held.tally));
  // The far-out RETRO a kid can still make: stopped first, then a fresh press held. Not a lie, never an endless flight,
  // no flicker; and it does lift ▼ (the grid exercises DON'T HIT THE PLANET far out).
  const pressed = flyGrid(true);
  check(`${ship}: …SPACE pressed again after the stop and held with RETRO, then the strip obeyed: no flight ends ESCAPED or CRASHED under a burn line`,
    !pressed.lie, pressed.lie || JSON.stringify(pressed.tally));
  check(`${ship}: …and every one of those flights ends or reaches ACCEPT ORBIT`, !pressed.endless, pressed.endless || JSON.stringify(pressed.tally));
  check(`${ship}: …the lift's line never flickers between presets while the burn is held (${pressed.liftRows} of 20 flights lifted ▼)`,
    !pressed.flicker && pressed.liftRows > 0,
    pressed.flicker || `IN asked on ${pressed.inAsked} ticks; ${pressed.switchedBack} switches back to a preset left ${LIFT_FLICKER_SEC} s or more before`);
}

// --- The lift, held as the strip chooses it, from planted loops with ▼ under the surface ---------------------------
interface LiftEnd { kind: 'cleared' | 'opened' | 'ground' | 'unfinished'; dvKmS: number; }
// One sub-step per TACTICAL tick, as the sim flies a held burn (thrust re-pointed every tick).
function flyLift(
  start: OrbitState, mu: number, surfaceR: number, accel: number, stepSec: number,
  choose: (orbit: OrbitState, selected: PresetMode) => PresetMode,
): LiftEnd {
  const pos = { x: start.x, y: start.y };
  const vel = { x: start.vx, y: start.vy };
  // The kid comes to it with the WAIT's RETRO selected, then holds whatever the strip names.
  let selected: PresetMode = 'retrograde';
  let dvKmS = 0;
  for (let step = 0; step < 20000; step++) {
    const orbit = { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y };
    const elements = elementsFromState(orbit, mu);
    if ((vel.x * vel.x + vel.y * vel.y) / 2 - mu / Math.hypot(pos.x, pos.y) >= 0) return { kind: 'opened', dvKmS };
    if (elements.rp > surfaceR) return { kind: 'cleared', dvKmS };
    if (Math.hypot(pos.x, pos.y) <= surfaceR) return { kind: 'ground', dvKmS };
    selected = choose(orbit, selected);
    const heading = presetHeading(selected, orbit);
    integrateStep(pos, vel, stepSec, mu, accel * Math.cos(heading), accel * Math.sin(heading));
    dvKmS += accel * stepSec;
  }
  return { kind: 'unfinished', dvKmS };
}
{
  const { planet, aNominalKmS2, tacticalWarp, shrink } = state().level;
  const reactionDvKmS = shrink.reactionTac * tacticalWarp * aNominalKmS2;
  const mu = planet.mu;
  const surfaceR = planet.R;
  const stepSec = Math.min(SIM_SUBSTEP_MAX_SEC, tacticalWarp * TICK);
  const wp1Rule = (orbit: OrbitState): PresetMode => (orbit.x * orbit.vx + orbit.y * orbit.vy > 0 ? 'prograde' : 'radial-out');
  const now: Record<string, number> = {};
  const before: Record<string, number> = {};
  let opened = '';
  let planted = 0;
  // ▼ from just under the surface to almost the centre, ▲ from a small loop to the largest a let-go-at-CAPTURED
  // capture leaves (2.5 million km on ship 1), all around each loop. (On 7.5–10 million km loops a lift near the planet
  // that costs 1.4–2.9 km/s can open the loop even along IN or OUT: the sim re-points the thrust once a tick, so each
  // tick adds (a·dt)²/2 of energy; WP1's OUT inbound does the same. tests/lead2/fix2/probes/lift-planted.ts.)
  for (const rp of [3300, 2500, 1000, 100, 1]) {
    for (const ra of [20000, 200000, 2.5e6]) {
      const ecc = (ra - rp) / (ra + rp);
      for (let k = 1; k < 24; k++) {
        const anomaly = -Math.PI + (k * 2 * Math.PI) / 24;
        const orbit = stateFromElements(rp, ecc, 0, anomaly, mu);
        if (Math.hypot(orbit.x, orbit.y) <= surfaceR * 1.01) continue;
        planted++;
        const lift = flyLift(orbit, mu, surfaceR, aNominalKmS2, stepSec, (current, selected) => liftPreset(current, mu, surfaceR, reactionDvKmS, selected));
        const old = flyLift(orbit, mu, surfaceR, aNominalKmS2, stepSec, wp1Rule);
        now[lift.kind] = (now[lift.kind] ?? 0) + 1;
        before[old.kind] = (before[old.kind] ?? 0) + 1;
        if (lift.kind === 'opened' || lift.kind === 'unfinished') {
          opened ||= `rp ${rp} ra ${ra} ν ${anomaly.toFixed(2)} (r ${Math.hypot(orbit.x, orbit.y).toFixed(0)}): ${lift.kind} after ${lift.dvKmS.toFixed(3)} km/s`;
        }
      }
    }
  }
  check(`${ship}: the lift held as F4 asks for it, from ${planted} loops with ▼ under the surface, never opens the loop before ▼ clears the planet`,
    !opened && (now.cleared ?? 0) > 0, `${opened ? `${opened}; ` : ''}now ${JSON.stringify(now)}; WP1's PRO-outbound rule ${JSON.stringify(before)}`);
}

// --- The planted cases --------------------------------------------------------------------------------------------
{
  const { planet, shrink, tacticalWarp, aNominalKmS2 } = state().level;
  const mu = planet.mu;
  const reactionDvKmS = shrink.reactionTac * tacticalWarp * aNominalKmS2;
  const wp1Case = stateFromElements(3000, 0.6, 0, 2.0, mu);
  const far = 2036885;
  const cases: [string, OrbitState, PresetMode, PresetMode][] = [
    ["WP1's outbound loop, 115° past ▼", wp1Case, 'radial-out', 'prograde'],
    ['2 million km out, climbing along the radius', { x: far, y: 0, vx: 0.002, vy: 0.00001 }, 'retrograde', 'radial-in'],
    ['2 million km out, falling along the radius', { x: far, y: 0, vx: -0.002, vy: 0.00001 }, 'retrograde', 'radial-out'],
    ['…the same with PRO selected', { x: far, y: 0, vx: -0.002, vy: 0.00001 }, 'prograde', 'radial-out'],
    ['2 million km out, just past a far ▲, climbing', { x: far, y: 0, vx: 0.00001, vy: 0.002 }, 'retrograde', 'prograde'],
    ['…just past it, falling, PRO selected', { x: far, y: 0, vx: -0.00001, vy: 0.002 }, 'prograde', 'prograde'],
    ['…falling, OUT selected', { x: far, y: 0, vx: -0.00001, vy: 0.002 }, 'radial-out', 'radial-out'],
  ];
  const got = cases.map(([name, orbit, selected, want]) => ({ name, want, got: liftPreset(orbit, mu, planet.R, reactionDvKmS, selected) }));
  check(`${ship}: liftPreset on the planted cases`, got.every((row) => row.got === row.want),
    got.map((row) => `${row.name}: ${row.got}${row.got === row.want ? '' : ` (want ${row.want})`}`).join(' | '));

  // The strip's IN line, with the Autopilot's presets and with the Q/E wording of a damaged one, fits the strip.
  harness.reset(1);
  harness.store.mutate((d) => {
    Object.assign(d.orbit, { x: far, y: 0, vx: 0.002, vy: 0.00001 });
    d.burn.sasMode = 'retrograde';
  });
  const context = buildFlightContext(state(), computePrediction(state()));
  const lines = [flightObjective(context), flightObjective({ ...context, presetsAvailable: false })];
  check(`${ship}: F4's IN line names IN and fits the strip (≤ ${MAX_LINE_CHARS} characters), also in the Q/E wording`,
    lines.every((line) => line !== null && line.id === 'F4-press' && /\bIN\b/.test(line.text) && line.text.length <= MAX_LINE_CHARS),
    lines.map((line) => `${line?.id} "${line?.text}" (${line?.text.length})`).join(' | '));
}

// --- WP7's doomed-but-savable ship, the strip obeyed ------------------------------------------------------------
// 200 km up, falling at 0.8 of the circular speed with a full tank (tests/wp7/p2-models.test.ts): near ▲ of a low
// loop. WP1's OUT inbound / PRO outbound switched the line on every refresh there (387 switches on ship 1), each a turn
// with no thrust, and the strip never lifted ▼ (tests/lead2/fix2/probes/savable-obey.ts on the tree before this round).
{
  harness.reset(1);
  harness.store.mutate((d) => {
    const radius = d.level.planet.R + 200;
    d.burn.fuelPct = 100;
    Object.assign(d.orbit, { x: radius, y: 0, vx: -0.2, vy: 0.8 * Math.sqrt(d.level.planet.mu / radius) });
    d.burn.sasMode = 'retrograde';
  });
  harness.step();
  let holding = false;
  let switches = 0;
  let lastLift: PresetMode | null = null;
  const lines: string[] = [];
  for (let tick = 0; tick < 2000 && harness.status() === 'approaching' && getPrediction().outcome === 'impact'; tick++) {
    const line = text(harness);
    if (lines[lines.length - 1] !== line) lines.push(line);
    const lift = getPrediction().liftPreset;
    if (lift !== null && lift !== lastLift) { if (lastLift !== null) switches++; lastLift = lift; }
    const press = line.match(/press \[([WASD])\]/);
    if (press) harness.press(`Key${press[1]}`);
    if (!holding && BURN_LINE.test(line)) { harness.keyDown('Space'); holding = true; }
    harness.step();
  }
  if (holding) harness.keyUp('Space');
  const outcome = getPrediction().outcome;
  check(`${ship}: WP7's doomed-but-savable ship, the strip obeyed: ▼ lifts out of the planet, with the lift's preset switched at most twice`,
    harness.status() === 'approaching' && outcome !== 'impact' && switches <= 2,
    `${harness.status()} ${outcome}, FUEL ${state().burn.fuelPct.toFixed(1)}%, ${switches} switches: ${lines.slice(0, 6).join(' / ')}`);
}

finish();
