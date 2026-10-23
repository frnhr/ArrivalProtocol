// WP4 part 2: the pure HUD models behind the new UI (systems/flight-hud.ts, systems/garble.ts,
// say.ts receivedText): what the NAV PLOT shows per sensor mode (item 5), the Autopilot hint, the
// THRUST LIMIT and the REACTOR row (item 6), the window pips (item 7), the toggle's alert (item
// 12), the MIND chip (item 11), and the ▓ of a damaged Telemetry / AI Comms file.
import { check, finish } from '../wp1/harness';
import { createHarness4 } from './harness4';
import { getSensedPrediction } from '@systems/predict';
import { reserveThread, releaseThread } from '@systems/ops-core';
import { pickUpTool, applyTool, cancelTool, type ToolDeps } from '@systems/fs-tools';
import {
  plotChip, plotReadouts, plotMarkers, presetHint, thrustLimitModel, reactorModel, windowPip, toggleAlert, mindChipModel,
} from '@systems/flight-hud';
import { garbleText, scrambleDigits, newMask } from '@systems/garble';
import { say, receivedText } from '@systems/say';
import { raiseAlert } from '@systems/alerts';
import { SCRAMBLE_GLYPH, MAX_LINE_CHARS } from '@data/tuning';
import { FAULT_STAMP, REFUSAL_LINES } from '@data/script';
import { AUTOPILOT_REFUSAL } from '@systems/flight-controls';
import { BAND_COPY } from '@systems/capabilities';

const h = createHarness4(1);
const deps: ToolDeps = { ask: () => { throw new Error('no question expected'); } };

// A flyby with ▼ to show: burn OUT off the opening crash course, then coast.
function flyby(): void {
  h.resetTo('flight');
  h.noFault();
  h.keyDown('Space');
  while (h.pred().outcome === 'impact' && h.wall() < 20) h.step();
  for (let i = 0; i < 10; i++) h.step();
  h.keyUp('Space');
  for (let i = 0; i < 4; i++) h.step();
}

// --- Item 5: the NAV PLOT per sensor mode ------------------------------------------------------------
{
  flyby();
  const state = (): ReturnType<typeof h.store.getState> => h.store.getState();
  h.setIntegrity('sensor', 100);
  h.step();
  let pred = getSensedPrediction();
  const exact = plotReadouts(state(), pred);
  check('exact: LOWEST in km, no ≈', /^\d[\d,]* km$/.test(exact.lowest.text), exact.lowest.text);

  h.setIntegrity('sensor', 70);
  h.step();
  pred = getSensedPrediction();
  const approx = plotReadouts(state(), pred);
  const approxMarkers = plotMarkers(state(), pred);
  check('approx (70%): LOWEST ≈, rounded to 450 km steps', approx.lowest.text.startsWith('≈')
    && Number(approx.lowest.text.replace(/[^\d]/g, '')) % 450 === 0, approx.lowest.text);
  check('approx: the ▼ marker reads LOWEST ≈…', approxMarkers.peri?.lines[1]?.startsWith('LOWEST ≈') === true, JSON.stringify(approxMarkers.peri?.lines));
  check('approx: the chip still reads the line (FLYBY)', plotChip(state(), pred).text === 'FLYBY');

  h.setIntegrity('sensor', 40);
  h.step();
  pred = getSensedPrediction();
  const blind = plotReadouts(state(), pred);
  const blindMarkers = plotMarkers(state(), pred);
  check('uncertain (40%): PATH UNCERTAIN chip, ??? altitudes and range', plotChip(state(), pred).text === 'PATH UNCERTAIN'
    && blind.lowest.text === '???' && blind.lowest.tone === 'unknown', JSON.stringify(blind));
  check('uncertain: no ▼, ▲, START BURN or FLYBY tag', blindMarkers.peri === null && blindMarkers.apo === null
    && blindMarkers.startBurn === null && blindMarkers.flyby === null);

  h.setIntegrity('sensor', 100);
  h.setIntegrity('navplot', 10);
  h.step();
  pred = getSensedPrediction();
  const dark = plotReadouts(state(), pred);
  const darkMarkers = plotMarkers(state(), pred);
  check('no signal (Nav Plotter 10%): NO SIGNAL chip, — readouts, no markers', plotChip(state(), pred).text === 'NO SIGNAL'
    && dark.lowest.text === '—' && dark.range.text === '—' && Object.values(darkMarkers).every((marker) => marker === null), JSON.stringify(dark));
  h.setIntegrity('navplot', 100);

  // A crash course under a blind sensor still says IMPACT and UNDERGROUND (the strip says DON'T HIT
  // THE PLANET; deviation 10 of part 1).
  h.resetTo('flight');
  h.noFault();
  h.setIntegrity('sensor', 40);
  h.step();
  pred = getSensedPrediction();
  check('uncertain on a crash course: IMPACT chip, ✕ kept, ▼ UNDERGROUND', plotChip(h.store.getState(), pred).text === 'IMPACT'
    && plotMarkers(h.store.getState(), pred).impact !== null && plotReadouts(h.store.getState(), pred).lowest.text === 'UNDERGROUND');
}

// --- Item 5: the Autopilot hint -------------------------------------------------------------------------
{
  h.resetTo('flight');
  const hint = (integrity: number): string => { h.setIntegrity('autopilot', integrity); return presetHint(h.store.getState()); };
  check('autopilot 80/50: the preset tip', hint(80) === 'OUT pushes your path away from the planet' && hint(50) === 'OUT pushes your path away from the planet');
  // WP4 fix round 1: one Autopilot line for the hint, the refusal and (plain) the pip tooltip.
  check('autopilot 49 / 10: AUTOPILOT FILE DAMAGED — use [Q] / [E]', hint(49) === 'AUTOPILOT FILE DAMAGED — use [Q] / [E]'
    && hint(10) === 'AUTOPILOT FILE DAMAGED — use [Q] / [E]' && hint(10) === REFUSAL_LINES[AUTOPILOT_REFUSAL]!.text
    && BAND_COPY.autopilot.failing === 'AUTOPILOT FILE DAMAGED — use Q / E');
  h.setIntegrity('autopilot', 100);
}

// --- Item 6: THRUST LIMIT and the REACTOR row -------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  const limit = (): string => thrustLimitModel(h.store.getState()).text;
  const cells = (): string => reactorModel(h.store.getState()).cells.join();
  h.setIntegrity('engine-io', 100);
  check('no cap: no THRUST LIMIT, REACTOR all BURN', !thrustLimitModel(h.store.getState()).limited && cells() === 'burn,burn,burn,burn'
    && reactorModel(h.store.getState()).text === 'BURN 100%');
  reserveThread('model-a');
  check('1 busy thread: THRUST LIMIT 75% · 1 THREAD BUSY, one THINK cell', limit() === 'THRUST LIMIT 75% · 1 THREAD BUSY'
    && cells() === 'think,burn,burn,burn' && reactorModel(h.store.getState()).text === 'BURN 75%', `${limit()} ${cells()}`);
  reserveThread('model-b');
  check('2 busy threads: THRUST LIMIT 50% · 2 THREADS BUSY', limit() === 'THRUST LIMIT 50% · 2 THREADS BUSY'
    && cells() === 'think,think,burn,burn', `${limit()} ${cells()}`);
  h.setIntegrity('engine-io', 38);
  check('Engine I/O 38% binds below 2 threads: THRUST LIMIT 40% · ENGINE I/O 38%', limit() === 'THRUST LIMIT 40% · ENGINE I/O 38%', limit());
  releaseThread('model-a');
  releaseThread('model-b');
  check('Engine I/O 38% alone: the same', limit() === 'THRUST LIMIT 40% · ENGINE I/O 38%', limit());
  h.setIntegrity('engine-io', 100);
  h.setIntegrity('reactor', 45);
  check('a failing, unscanned Reactor: THRUST LIMIT 60% · REACTOR (no number: not scanned)', limit() === 'THRUST LIMIT 60% · REACTOR', limit());
  h.store.update((d) => { const reactor = d.memory.find((seg) => seg.role === 'reactor'); if (reactor && 'scanned' in reactor) reactor.scanned = true; });
  check('…scanned: THRUST LIMIT 60% · REACTOR 45%', limit() === 'THRUST LIMIT 60% · REACTOR 45%', limit());
  h.setIntegrity('reactor', 100);

  // The engine offline for its repair: the limit names the fault.
  h.setIntegrity('engine-io', 38);
  h.press('Tab');
  h.step();
  pickUpTool(h.store, 'repair');
  applyTool(h.store, h.file('engine-io'), deps);
  h.step();
  check('Engine I/O repairing: ENGINE OFFLINE · REPAIRING (0%)', limit() === 'ENGINE OFFLINE · REPAIRING'
    && thrustLimitModel(h.store.getState()).capPct === 0, limit());
  h.runOps();
  cancelTool(h.store);
  check('…repaired: no limit', !thrustLimitModel(h.store.getState()).limited, limit());
}

// --- Item 7: window pips ----------------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  const pip = (role: Parameters<typeof windowPip>[1]): string => {
    const model = windowPip(h.store.getState(), role);
    return `${model.look}|${model.glyph}|${model.label}|${model.reading}`;
  };
  check('Engine I/O 85% (ok): a green ● with no number', pip('engine-io') === 'ok|●|ENGINE I/O|', pip('engine-io'));
  check('Sensor Interp 78% (degraded): ● 78%', pip('sensor') === 'degraded|●|SENSOR INTERP|78%', pip('sensor'));
  h.setIntegrity('engine-io', 38);
  check('Engine I/O 38% (failing): ● 38%', pip('engine-io') === 'failing|●|ENGINE I/O|38%', pip('engine-io'));
  h.setIntegrity('engine-io', 10);
  check('Engine I/O 10% (dead): ● 10%', pip('engine-io') === 'dead|●|ENGINE I/O|10%', pip('engine-io'));
  check('an unscanned ship file is ? whatever its health', pip('reactor') === 'unknown|?|REACTOR|' && pip('thrust-ctrl') === 'unknown|?|THRUST CTRL|');
  h.store.update((d) => { d.memory = d.memory.filter((seg) => seg.role !== 'telemetry'); d.ui.memoryRev++; });
  check('a missing file is ✕ (and says so in its tooltip)', pip('telemetry') === 'missing|✕|TELEMETRY|'
    && windowPip(h.store.getState(), 'telemetry').title === 'NO TELEMETRY', pip('telemetry'));
}

// --- Item 12: the toggle's alert ---------------------------------------------------------------------------
{
  h.resetTo('flight');
  h.noFault();
  const alertText = (): string | null => {
    const alert = toggleAlert(h.store.getState(), getSensedPrediction());
    return alert ? `${alert.head} ${alert.body}|${alert.severity}` : null;
  };
  // Opening crash course, in blue: the ship's IMPACT countdown (an alarm once under 30 s).
  h.press('Tab');
  h.step();
  const impact = alertText();
  check('blue on a crash course: ◀ SHIP · IMPACT mm:ss', impact !== null && /^◀ SHIP · IMPACT \d\d:\d\d\|(warn|alarm)$/.test(impact), String(impact));
  h.press('Tab');
  h.step();
  check('amber with healthy files: no alert', alertText() === null, String(alertText()));
  h.setIntegrity('engine-io', 38);
  check('amber, Engine I/O 38%: MIND ▸ ENGINE I/O 38%', alertText() === 'MIND ▸ ENGINE I/O 38%|warn', String(alertText()));
  h.setIntegrity('sensor', 78);
  check('a degraded Sensor Interp (78%) is no alert (mild ≈)', alertText() === 'MIND ▸ ENGINE I/O 38%|warn');
  raiseAlert(h.store, { id: 'test-mind', layer: 'mind', severity: 'alarm', text: 'C12 WILL BE EATEN', inhibitsSkip: true });
  check('a mind alarm outranks a damaged file', alertText() === 'MIND ▸ C12 WILL BE EATEN|alarm', String(alertText()));
  h.resetTo('boot');
  check('no alert outside the flight (boot)', alertText() === null);
}

// --- Item 11: the MIND chip ----------------------------------------------------------------------------------
{
  h.resetTo('flight');
  reserveThread('chip-a');
  const chip = mindChipModel(h.store.getState());
  releaseThread('chip-a');
  check('MIND chip: 1/2 threads, 36 REPAIR CHARGE', chip.busy === 1 && chip.total === 2 && chip.charge === 36, JSON.stringify(chip));
}

// --- ▓: damaged Telemetry digits and a garbled radio -----------------------------------------------------------
{
  const mask = newMask(16);
  check('scramble 0: the text as it is', scrambleDigits('12,345 km', 0, mask) === '12,345 km');
  check('scramble 1: every digit ▓, separators and units kept', scrambleDigits('12,345 km', 1, mask) === `${SCRAMBLE_GLYPH.repeat(2)},${SCRAMBLE_GLYPH.repeat(3)} km`);
  const half = scrambleDigits('9999999999999999', 0.5, mask);
  const more = scrambleDigits('9999999999999999', 0.8, mask);
  const holes = (text: string): number[] => [...text].flatMap((char, i) => (char === SCRAMBLE_GLYPH ? [i] : []));
  check('a worse file only adds holes (same mask)', holes(half).every((i) => holes(more).includes(i)) && holes(more).length >= holes(half).length);
  const line = 'Your REPAIR licence is approved. :)';
  const garbled = garbleText(line, 0.25, 7);
  check('garble: the same seed loses the same letters', garbled === garbleText(line, 0.25, 7) && garbled !== line, garbled);
  check('garble keeps spaces, punctuation and the smiley', garbled.length === line.length && garbled.endsWith('. :)')
    && [...garbled].every((char, i) => char === line[i] || (char === SCRAMBLE_GLYPH && /[A-Za-z0-9]/.test(line[i]!))), garbled);
  check('garble 1: no letter left', !/[A-Za-z0-9]/.test(garbleText(line, 1, 3)), garbleText(line, 1, 3));

  h.resetTo('flight');
  h.setIntegrity('comms', 30);
  say('control', line, { critical: true });
  say('sys', 'Ship notice.', { critical: true });
  const entries = h.log();
  const control = entries.find((entry) => entry.speaker === 'control' && entry.text === line)!;
  const sys = entries.find((entry) => entry.speaker === 'sys')!;
  check('AI Comms failing: a CONTROL line arrives 25% garbled, the log keeps it whole', control.garble === 0.25 && receivedText(control) !== line
    && control.text === line, receivedText(control));
  check('…a ship notice is not garbled (it does not come over the radio link)', sys.garble === 0 && receivedText(sys) === 'Ship notice.');
  h.setIntegrity('comms', 100);
  say('control', 'Hello again. :)', { critical: true });
  const clear = h.log().find((entry) => entry.text === 'Hello again. :)')!;
  check('AI Comms repaired: the next CONTROL line is clean', clear.garble === 0 && receivedText(clear) === 'Hello again. :)');
}

// --- The new words on screen: stamps are terse capitals (§3.5), every line fits the strip ------------------
{
  for (const [role, text] of Object.entries(FAULT_STAMP)) {
    check(`FAULT_STAMP.${role}: capitals, no "!", fits`, !!text && text === text.toUpperCase() && !text.includes('!') && text.length <= MAX_LINE_CHARS, String(text));
  }
  h.resetTo('flight');
  const lines: string[] = [];
  for (const integrity of [100, 79, 49, 24]) {
    h.setIntegrity('autopilot', integrity);
    h.setIntegrity('engine-io', integrity);
    lines.push(presetHint(h.store.getState()), thrustLimitModel(h.store.getState()).text);
    for (const role of ['engine-io', 'autopilot', 'sensor', 'navplot', 'telemetry', 'comms', 'core'] as const) {
      lines.push(windowPip(h.store.getState(), role).title);
    }
  }
  const tooLong = lines.filter((line) => line.length > MAX_LINE_CHARS);
  check('every hint, limit and pip title fits a strip row', tooLong.length === 0, tooLong.join(' | '));
}

finish();
