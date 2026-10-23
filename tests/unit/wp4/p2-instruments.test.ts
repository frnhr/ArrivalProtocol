// WP4 part 2, item 5's system halves:
// • a failing Autopilot file (C3) refuses W/A/S/D with a reason, lets go of the preset (MANUAL,
//   the heading held, no spin), and Q/E turn the ship; repaired, the presets work again;
// • the instruments' plot mode is announced as it changes ('plot-mode'), so a Sensor Interp
//   repaired back to exact clears the line with lineWhoomp (audio-cues).
import { check, finish } from '../wp1/harness';
import { createHarness4 } from './harness4';
import { AUTOPILOT_REFUSAL } from '@systems/flight-controls';
import { pickUpTool, applyTool, cancelTool, type ToolDeps } from '@systems/fs-tools';
import { REFUSAL_LINES } from '@data/script';

const h = createHarness4(1);
const deps: ToolDeps = { ask: () => { throw new Error('no question expected'); } };

// --- The Autopilot -----------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  check('at the start the OUT preset is engaged', h.store.getState().burn.sasMode === 'radial-out');
  h.setIntegrity('autopilot', 49);
  h.step();
  const burn = h.store.getState().burn;
  check('Autopilot 49% (failing): the preset lets go: MANUAL, no spin, not aligning', burn.sasMode === 'off' && burn.omega === 0
    && !burn.presetAligning, JSON.stringify({ sas: burn.sasMode, omega: burn.omega }));
  const before = h.events.length;
  h.press('KeyS');
  h.step();
  const refused = h.events.slice(before).find((event) => event.name === 'refused');
  check('S is refused: AUTOPILOT DAMAGED (buzz), the preset stays MANUAL', h.store.getState().burn.sasMode === 'off'
    && JSON.stringify(refused?.payload) === JSON.stringify({ reason: AUTOPILOT_REFUSAL }), JSON.stringify(refused?.payload));
  for (let i = 0; i < 3; i++) h.step();
  check('…and the strip explains it: AUTOPILOT FILE DAMAGED — use [Q] / [E]', h.shown()?.text === REFUSAL_LINES[AUTOPILOT_REFUSAL]!.text,
    String(h.shown()?.text));
  const heading = h.store.getState().burn.heading;
  h.keyDown('KeyQ');
  for (let i = 0; i < 20; i++) h.step();
  h.keyUp('KeyQ');
  check('Q turns the ship by hand', Math.abs(h.store.getState().burn.heading - heading) > 0.01,
    `${heading.toFixed(3)} → ${h.store.getState().burn.heading.toFixed(3)}`);
  const objective = h.objective();
  check('guidance names Q/E, never a dead preset key', objective !== null && !/press \[[WASD]\]/.test(objective.text), String(objective?.text));

  // Repaired: the presets work again.
  h.press('Tab');
  h.step();
  pickUpTool(h.store, 'repair');
  applyTool(h.store, h.file('autopilot'), deps);
  h.runOps();
  cancelTool(h.store);
  h.press('Tab');
  h.step();
  h.press('KeyS');
  h.step();
  check('repaired: S selects RETRO again', h.file('autopilot').integrity === 100 && h.store.getState().burn.sasMode === 'retrograde',
    `${h.file('autopilot').integrity}% ${h.store.getState().burn.sasMode}`);
}

// --- plot-mode: what the instruments can show -------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  for (let i = 0; i < 3; i++) h.step();
  const modes = (): string[] => h.events.filter((event) => event.name === 'plot-mode')
    .map((event) => { const payload = event.payload as { from: string; to: string }; return `${payload.from}>${payload.to}`; });
  check('the ship-1 start (Sensor Interp 78%, approx) is the baseline, not a change', modes().length === 0, modes().join());
  h.setIntegrity('sensor', 40);
  h.step();
  h.setIntegrity('navplot', 10);
  h.step();
  h.setIntegrity('navplot', 100);
  h.step();
  check('worse and back: approx>uncertain, uncertain>no-signal, no-signal>uncertain', modes().join() === 'approx>uncertain,uncertain>no-signal,no-signal>uncertain',
    modes().join());
  // The real repair: Sensor Interp back to 100 ends in 'exact' (the whoomp's cue).
  h.press('Tab');
  h.step();
  pickUpTool(h.store, 'repair');
  applyTool(h.store, h.file('sensor'), deps);
  h.runOps();
  cancelTool(h.store);
  h.step();
  const last = modes()[modes().length - 1];
  check('Sensor Interp repaired: the last change is to exact (lineWhoomp clear)', last?.endsWith('>exact') === true, modes().join());
  check('while it repaired (offline) the plot was uncertain, as a dead sensor', modes().join().includes('uncertain>exact'), modes().join());
}

finish();
