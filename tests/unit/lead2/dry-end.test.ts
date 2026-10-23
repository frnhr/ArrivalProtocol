// LEAD-2 item 3: the check that came with LEAD-1 round 3's deferred dry-end patch
// (tests/unit/lead1/fix3/deferred/last-fuel-dry-end.check.ts), on the rows it was written for, against this tree.
// The patch itself is moot: the flicker was a held LAST FUEL whose empty tank and ▼'s fall to the surface came
// within a step of each other, and LEAD-2 removed the last FUEL (a short tank now waits for the trim's apsis and
// brakes there to the empty tank; the coast SKIP makes that WAIT seconds). What the check asked still has to hold:
// across the boundary it found, every hold keeps one KEEP HOLDING line (no FLICKER), never turns a RELEASE back into
// KEEP HOLDING (no FLIP), and every flight ends, none crashed, with ▼ clear of the surface.
// Rows: the verifier's off-ring capture, ▼ at 4,700 km, ignored 90 s, 18–32% FUEL in 0.25% steps (the check's own
// 171 flights), plus round 3's other flicker rows (▼ 4,900 km, ignored 90 s, 30–34%), × the three kids. Ship 1, as
// the check was.
import { createHarness, check, finish, followStrip } from '../wp1/harness';
import { getPrediction } from '@systems/predict';
import { acceptOrbit } from '@systems/flight-controls';
import { STRANDED_LINE, ACCEPT_ONLY_LINE } from '@systems/guidance';
import { idle, captureOffRing, obey, text, stepUntil } from '../wp1-rules/flows';
import type { GameState } from '@state/schema';
import { byDepth } from '../depth';

const harness = createHarness(1);
const state = () => harness.store.getState();
const KIDS = ['obey', 'f0.3', 'f0.5'] as const;
// Quick depth (tests/unit/depth.ts): every 3% of each band, the instant and the slowest kid; full: the check's own rows.
const kids = byDepth<readonly typeof KIDS[number][]>(['obey', 'f0.5'], KIDS);
const FUEL_STEP = byDepth(3, 0.25);

function snapshotOffRing(periKm: number, ignoreSec: number): GameState {
  captureOffRing(harness, periKm);
  stepUntil(harness, () => /HOLD \[SPACE\] NOW/.test(text(harness)), 120);
  harness.keyDown('Space');
  stepUntil(harness, () => getPrediction().outcome === 'closed', 60);
  harness.keyUp('Space');
  idle(harness, ignoreSec);
  return structuredClone(state());
}

function restore(snapshot: GameState, fuelPct: number): void {
  harness.reset(1);
  harness.store.update((d) => { Object.assign(d, structuredClone(snapshot)); });
  harness.store.mutate((d) => { d.burn.fuelPct = fuelPct; d.burn.acceptOnly = false; });
  for (let i = 0; i < 4; i++) harness.step();
}

interface Flight {
  offer: string;
  status: string;
  flip: boolean;
  flicker: boolean;
  holdLines: string;
  lastFuelLine: boolean;
  rpAltKm: number;  // ▼ above the surface when the flight ended
}

function fly(kid: typeof KIDS[number]): Flight {
  const flight: Flight = { offer: text(harness), status: '', flip: false, flicker: false, holdLines: '', lastFuelLine: false, rpAltKm: 0 };
  let hold: string[] = [];
  const watch = (): void => {
    const line = text(harness);
    if (/LAST FUEL/.test(line)) flight.lastFuelLine = true;
    if (!state().burn.firing) {
      hold = [];
    } else if (hold[hold.length - 1] !== line) {
      const keep = /^KEEP HOLDING/.test(line);
      const flip = keep && hold.some((shown) => /^RELEASE/.test(shown));
      const flicker = keep && hold.includes(line) && hold.some((shown) => /^KEEP HOLDING/.test(shown) && shown !== line);
      hold.push(line);
      if ((flip || flicker) && !flight.holdLines) flight.holdLines = hold.join(' → ');
      flight.flip ||= flip;
      flight.flicker ||= flicker;
    }
    if ((line === STRANDED_LINE || line === ACCEPT_ONLY_LINE) && harness.status() === 'approaching') acceptOrbit(harness.store);
  };
  watch();
  if (kid === 'obey') obey(harness, 600, watch);
  else followStrip(harness, Number(kid.slice(1)), 600, watch);
  flight.status = harness.status();
  flight.rpAltKm = getPrediction().rp - state().level.planet.R;
  return flight;
}

const rowsets = [
  { periKm: 4700, ignoreSec: 90, from: 18, to: 32 },
  { periKm: 4900, ignoreSec: 90, from: 30, to: 34 },
];
const bad: string[] = [];
const outcomes = new Map<string, number>();
let flights = 0;
let lowestAltKm = Infinity;
let lowestAt = '';
for (const rowset of rowsets) {
  const snapshot = snapshotOffRing(rowset.periKm, rowset.ignoreSec);
  for (let fuel = rowset.from; fuel <= rowset.to + 1e-9; fuel += FUEL_STEP) {
    const fuelPct = Number(fuel.toFixed(2));
    for (const kid of kids) {
      restore(snapshot, fuelPct);
      const flight = fly(kid);
      flights++;
      outcomes.set(flight.status, (outcomes.get(flight.status) ?? 0) + 1);
      const where = `▼ ${rowset.periKm} / ${rowset.ignoreSec} s / ${fuelPct}% ${kid}`;
      if (flight.status !== 'crashed' && flight.rpAltKm < lowestAltKm) { lowestAltKm = flight.rpAltKm; lowestAt = where; }
      if (flight.flicker || flight.flip || flight.lastFuelLine || flight.status === 'crashed' || flight.status === 'approaching') {
        bad.push(`${where}: "${flight.offer}" → ${flight.status}, ▼ ${flight.rpAltKm.toFixed(0)} km${flight.flip ? ', FLIP' : ''}`
          + `${flight.flicker ? ', FLICKER' : ''}${flight.lastFuelLine ? ', a LAST FUEL line' : ''}${flight.holdLines ? ` (${flight.holdLines})` : ''}`);
      }
    }
  }
}
const tally = [...outcomes].map(([status, count]) => `${count} ${status}`).join(', ');
check(`the deferred dry-end check's rows: ${flights} flights (▼ 4,700 km 18–32% and ▼ 4,900 km 30–34%, ignored 90 s, `
  + `${FUEL_STEP}% steps × ${kids.join('/')}): no FLICKER, no FLIP, no LAST FUEL line, none crashed or still flying`,
bad.length === 0, bad.slice(0, 5).join(' | ') || tally);
// The patch asked a dry end to leave ▼ at least 20 km up (it was 17 km on the round-2 tree); the brake at ▼ only
// brings ▲ down, so ▼ stays where the capture and the trims left it.
check('every flight ends with ▼ at least 20 km above the surface', lowestAltKm >= 20,
  `lowest ▼ ${lowestAltKm.toFixed(0)} km above the surface (${lowestAt})`);

finish();
