// LEAD-1 item 4: while a short Sensor Interp (or Nav Plotter) repair or move runs, `PATH UNCERTAIN —
// SENSOR INTERP IS REPAIRING…` used to replace even the capture's `HOLD [SPACE] NOW`, although the
// engine works and the repair needs nothing from the kid. Now F1-repairing/-moving yields to the
// path's NOW lines (as F1 already yields to F4), except the OUT/IN correction (F6, and since review round 1
// the F7/F8 rows that start it), which steers by the reading itself. A waiting line still shows the repair.
import { check, finish } from '../wp1/harness';
import { createHarness4 } from '../wp4/harness4';
import { text, stepUntil } from '../wp1-rules/flows';
import { getSensedPrediction } from '@systems/predict';
import { buildFlightContext, flightObjective, type FlightContext } from '@systems/guidance';
import { plotFault } from '@systems/capabilities';
import { setMode } from '@systems/mode';
import { installTool } from '@systems/licences';
import { actionRepair } from '@state/actions';
import type { PlotFault } from '@systems/capabilities';

const h = createHarness4(1);
const state = () => h.store.getState();
const fault = (): PlotFault | null => plotFault(h.caps());

// The opening by the book with a healthy engine, to the capture's countdown.
function toCapture(): void {
  h.resetTo('flight');
  h.noFault();
  installTool(h.store, 'repair');
  h.keyDown('Space');
  stepUntil(h, () => /^RELEASE/.test(text(h)), 30);
  h.keyUp('Space');
  stepUntil(h, () => /TURN AROUND/.test(text(h)), 5);
  h.press('KeyS');
  stepUntil(h, () => /^WAIT/.test(text(h)), 10);
}

// --- The capture's HOLD [SPACE] NOW while Sensor Interp repairs ------------------------------------------
{
  toCapture();
  h.press('KeyF');
  stepUntil(h, () => /HOLD \[SPACE\] NOW/.test(text(h)), 120);
  const refused = actionRepair(h.store, h.file('sensor'));
  h.step();
  const amber = h.shown();
  setMode(h.store, 'memory');
  h.step();
  const blue = h.shown();
  check('a Sensor Interp repair is under way at the capture (PATH UNCERTAIN, repairing)',
    refused === null && fault()?.role === 'sensor' && fault()?.cause === 'repairing', JSON.stringify(fault()));
  check('amber: the strip keeps HOLD [SPACE] NOW (it was PATH UNCERTAIN — SENSOR INTERP IS REPAIRING…)',
    amber?.text === 'HOLD [SPACE] NOW' && amber.urgency === 'now' && amber.layer === 'ship', amber?.text);
  // WP12 fix round 1 (the lead's ruling of 17:45): in blue a ship line asking for the burn says [TAB] first; the same row
  // (its id), so the toggle still lights the way back.
  check('blue: the same ship line, worded `[TAB] BACK — HOLD [SPACE] NOW`, so the TAB toggle lights the way back to the burn',
    blue?.text === '[TAB] BACK — HOLD [SPACE] NOW' && blue.id === amber?.id && blue.layer === 'ship' && blue.keys[0] === 'TAB',
    `${blue?.text} (${blue?.layer})`);
  setMode(h.store, 'tools');
  h.keyDown('Space');
  stepUntil(h, () => state().burn.status !== 'approaching' || /^RELEASE|HOLD STEADY/.test(text(h)), 60);
  h.keyUp('Space');
  check('…and the kid who held it closed the loop (CAPTURED)', getSensedPrediction().outcome !== 'open', getSensedPrediction().outcome);
}

// --- A WAIT keeps the repair on the strip, at the path's calm urgency ------------------------------------
{
  toCapture();
  h.stepFor(1); // the strip's hysteresis lets the calm WAIT replace the opening's RELEASE
  actionRepair(h.store, h.file('sensor'));
  h.stepFor(0.5);
  const shown = h.shown();
  check('on the coast (a WAIT) the repair still shows: PATH UNCERTAIN — SENSOR INTERP IS REPAIRING…',
    shown?.id === 'F1-uncertain-repairing' && shown.urgency === 'wait', `${shown?.id}: ${shown?.text} (${shown?.urgency})`);
}

// --- The table itself: every repairing/moving fault against the path's rows -----------------------------
{
  toCapture();
  h.press('KeyF');
  stepUntil(h, () => /HOLD \[SPACE\] NOW/.test(text(h)), 120);
  const base = buildFlightContext(state(), getSensedPrediction());
  const lines: string[] = [];
  let ok = true;
  for (const role of ['sensor', 'navplot'] as const) {
    for (const cause of ['repairing', 'moving'] as const) {
      const line = flightObjective({ ...base, plotFault: { role, cause } });
      lines.push(`${role}/${cause}: ${line?.text}`);
      ok &&= line?.text === 'HOLD [SPACE] NOW';
    }
  }
  const hurt = flightObjective({ ...base, plotFault: { role: 'sensor', cause: 'hurt' } });
  check('HOLD [SPACE] NOW beats a repair or a move of either plot file', ok, lines.join(' | '));
  check('a HURT sensor still asks for its repair first (F1 is unchanged there)',
    hurt?.id === 'F1-uncertain' && /REPAIR SENSOR INTERP/.test(hurt.text), hurt?.text);
}

// --- The OUT correction (F6) does not yield: it steers by the reading a blind sensor can't refresh ---------
{
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  stepUntil(h, () => /^KEEP HOLDING — push ▼ up/.test(text(h)), 30);
  const base = buildFlightContext(state(), getSensedPrediction());
  const line = flightObjective({ ...base, plotFault: { role: 'sensor', cause: 'repairing' } });
  h.keyUp('Space');
  check('mid-correction (F6 KEEP HOLDING) a sensor repair still shows PATH UNCERTAIN — … IS REPAIRING…',
    base.firing && line?.id === 'F1-uncertain-repairing', `${line?.id}: ${line?.text}`);
}

// --- Review round 1: nor do the rows that START that correction (F7 ▼ TOO LOW, F8 TOO WIDE) ----------------
// With ▼ under COUNTDOWN_RED_TAC away they are NOW rows, so they used to show during a sensor repair, and the
// moment the kid obeyed, F6 hid the burn behind PATH UNCERTAIN, its own RELEASE lines included
// (.tmp/review/LEAD-1/correctness/f7-starts-blind-correction.ts). Now the whole correction waits for the
// repair (1–3 s), as it did before LEAD-1. Pure: a planted context with ▼ 25 tac s away.
{
  const ring = { min: 5000, max: 7000 } as FlightContext['ring'];
  const base: FlightContext = {
    // LEAD-2 review round 2: the context carries F4's lift preset (null off an impact course).
    status: 'approaching', landing: false, offer: null, goLow: null, outcome: 'open', rp: 4200, inRing: false, outbound: false, liftPreset: null, ring,
    sweetLo: 5600, sweetHi: 6400, sasMode: 'retrograde', firing: false, firingFor: null, thrustOn: false,
    outOfFuel: false, fuelShort: false, acceptOnly: false, strandedAnyway: false, cannotClose: false, presetsAvailable: true,
    plotFault: { role: 'sensor', cause: 'repairing' }, engineFault: null, inMind: false, skipAvailable: false,
    // WP12 p3 (strict test tsc): WP10's spare controller, none here.
    spareController: null,
    // WP12 p3: ▼'s rate under thrust (F6's early RELEASE); 0 keeps this test's rows as written.
    rpRateTac: 0,
    burnPoint: {
      reason: 'capture', preset: 'retrograde', event: 'peri', eventInSec: 400, inSec: 380, dvKmS: 0.5, estBurnSec: 20,
      // LEAD-2: BurnPoint no longer has lastFuel / emptiesTank (the last FUEL is gone); burnTac (WP7's rest of the
      // burn, here its whole 20 game s) was missing, which only a strict tsc of this file sees.
      approaching: true, firstOfTwo: false, inTac: 20, burnTac: 1,
    },
    periTac: 25, showAccept: false,
    // WP9: the context grew a debris cloud ahead and AUTOBURN's state; a planted context has neither (no cloud, idle).
    // (WP9 fix round 1 renamed the cloud's field to `debris`, with its dodge deadline, and gave AUTOBURN's state its end.)
    debris: null, autoburn: { phase: 'idle', sinceSec: 0, armedInTac: 0, end: null }, autoAvailable: false,
  };
  const healthy = flightObjective({ ...base, plotFault: null });
  const rows = [
    ['F7 offered (▼ low)', flightObjective(base)],
    ['F8 offered (▼ wide)', flightObjective({ ...base, rp: 7600 })],
    ['F6 keep (holding OUT)', flightObjective({ ...base, sasMode: 'radial-out', firing: true, thrustOn: true })],
    ['F6 release (▼ in the sweet zone)', flightObjective({ ...base, sasMode: 'radial-out', firing: true, thrustOn: true, rp: 6000 })],
    ['F6 past (▼ past it)', flightObjective({ ...base, sasMode: 'radial-out', firing: true, thrustOn: true, rp: 6600 })],
  ] as const;
  check('setup: without the repair, ▼ low and 25 tac s away is a NOW row of F7', healthy?.id.startsWith('F7') === true && healthy.urgency === 'now',
    `${healthy?.id} ${healthy?.urgency}`);
  check('during a sensor repair the whole OUT/IN correction waits behind PATH UNCERTAIN (F7, F8 and every F6 row)',
    rows.every(([, line]) => line?.id === 'F1-uncertain-repairing'), rows.map(([name, line]) => `${name}: ${line?.id}`).join(' | '));
}

finish();
