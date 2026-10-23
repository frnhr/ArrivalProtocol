// WP4 acceptance 2: the capabilities table (§6.4), pure. Every band boundary (79/80, 49/50,
// 24/25) of every capability role, the offline states, the Core exemption, missing → 'missing',
// and no ghost thrust while Thrust Ctrl is at 50 or better. Plus the derived numbers each band
// sets, the reactor's thread share, two copies of one role, and the loud copy table.
import { check, finish } from '../wp1/harness';
import { createInitialState } from '@state/initial';
import type { GameState } from '@state/schema';
import type { SegmentRole, SegmentState } from '@/types/segment';
import {
  deriveCapabilities, roleHealth, thrustCap, engineFault, presetsAvailable, BAND_COPY, BANDS, CAPABILITY_ROLES,
  type Band, type Capabilities,
} from '@systems/capabilities';
import { hasIntegrity, coreThreads } from '@state/selectors';
import {
  ENGINE_POWER_BY_BAND, ENGINE_JITTER_BY_BAND, REACTOR_CAP_BY_BAND, GHOST_BY_BAND, PRINTER_SPEED_BY_BAND,
  SENSOR_FUZZ_KM_PER_POINT, PLOT_STALE_TAC, MAX_LINE_CHARS,
} from '@data/tuning';

function fresh(): GameState {
  return createInitialState({ seed: 1 });
}

function fileOf(state: GameState, role: SegmentRole) {
  const found = state.memory.filter((seg) => seg.role === role);
  if (found.length !== 1) throw new Error(`seed has ${found.length} files with role ${role}`);
  const seg = found[0]!;
  if (!hasIntegrity(seg)) throw new Error(`${role} has no integrity`);
  return seg;
}

function withIntegrity(role: SegmentRole, integrity: number, state?: SegmentState): GameState {
  const game = fresh();
  const seg = fileOf(game, role);
  seg.integrity = integrity;
  if (state) seg.state = state;
  return game;
}

function without(role: SegmentRole): GameState {
  const game = fresh();
  const seg = fileOf(game, role);
  game.memory[game.memory.indexOf(seg)] = { id: `gone-${role}`, name: 'Free', type: 'free', size: seg.size };
  return game;
}

const caps = (game: GameState, busy = 0): Capabilities => deriveCapabilities(game, busy);

// --- The seed: every flight role is present once, healthy except the two arrival hurts -----------
{
  const game = fresh();
  for (const role of CAPABILITY_ROLES) {
    check(`seed: one file has role ${role}`, game.memory.filter((seg) => seg.role === role).length === 1);
  }
  const base = caps(game);
  check('seed: Engine I/O 85 → ok, full power, clean', base.engine.band === 'ok' && base.engine.powerCap === 1 && base.engine.jitter === 0);
  check('seed: Sensor Interp 78 → approx, fuzz 330 km', base.plot.mode === 'approx' && base.plot.fuzzKm === 330, JSON.stringify(base.plot));
  check('seed: Thrust Ctrl 100 → no ghost', base.thrustCtrl.band === 'ok' && base.thrustCtrl.ghost === null);
  check('seed: 2 threads, reactor ok', base.threads === 2 && base.reactor.reactorCap === 1);
  check('seed: presets available', presetsAvailable(base));
  check('seed: the engine can fire, at full power', engineFault(base) === null && thrustCap(base) === 1);
}

// --- Band boundaries for every role ---------------------------------------------------------------
const BOUNDARIES: ReadonlyArray<[number, Band]> = [
  [100, 'ok'], [80, 'ok'], [79, 'degraded'], [50, 'degraded'], [49, 'failing'], [25, 'failing'], [24, 'dead'], [0, 'dead'],
];
for (const role of CAPABILITY_ROLES) {
  const wrong = BOUNDARIES.filter(([integrity, band]) => roleHealth(withIntegrity(role, integrity), role).band !== band);
  check(`bands: ${role} at 80/79, 50/49, 25/24`, wrong.length === 0, wrong.map(([integrity]) => integrity).join(','));
}

// --- What each band does -------------------------------------------------------------------------
{
  const engineAt = (integrity: number) => caps(withIntegrity('engine-io', integrity)).engine;
  check('engine-io ok: cap 1.0, jitter 0', engineAt(80).powerCap === 1 && engineAt(80).jitter === 0);
  check('engine-io degraded: 0.75 / 0.15', engineAt(79).powerCap === 0.75 && engineAt(50).jitter === 0.15);
  check('engine-io failing: 0.40 / 0.35 (the ship-1 fault at 38%)', engineAt(38).powerCap === 0.4 && engineAt(25).jitter === 0.35);
  check('engine-io dead: 0, ENGINE NOT RESPONDING', engineAt(24).powerCap === 0
    && engineFault(caps(withIntegrity('engine-io', 24))) === 'dead' && BAND_COPY['engine-io'].dead === 'ENGINE NOT RESPONDING');
  check('engine-io missing: 0, NO ENGINE DRIVER', caps(without('engine-io')).engine.band === 'missing'
    && caps(without('engine-io')).engine.powerCap === 0 && engineFault(caps(without('engine-io'))) === 'no-driver'
    && BAND_COPY['engine-io'].missing === 'NO ENGINE DRIVER');

  const ghostAt = (integrity: number) => caps(withIntegrity('thrust-ctrl', integrity)).thrustCtrl.ghost;
  const noGhost = [100, 80, 79, 60, 50].filter((integrity) => ghostAt(integrity) !== null);
  check('thrust-ctrl: no ghost at 50 or better', noGhost.length === 0, noGhost.join(','));
  // WP12 part 1 (the 200-seed playthrough) retuned §3.3's numbers (failing 25 tac s / 0.15; dead 12 tac s / 0.25 / stick
  // 0.3) to failing 10 tac s / 0.3 and dead 10 tac s / 0.3 / stick 0.3 (tuning.ts GHOST_BY_BAND has the why).
  check('thrust-ctrl failing: 10 tac s mean, amp 0.3, dur 1.0, no stick (WP12)', JSON.stringify(ghostAt(49)) === JSON.stringify(GHOST_BY_BAND.failing)
    && ghostAt(31)?.meanIntervalTac === 10 && ghostAt(31)?.amp === 0.3 && ghostAt(31)?.durTac === 1 && ghostAt(31)?.stickChance === 0);
  check('thrust-ctrl dead: 10 tac s, amp 0.3, stick 0.3 (WP12: never weaker than failing)', ghostAt(24)?.meanIntervalTac === 10 && ghostAt(0)?.amp === 0.3 && ghostAt(10)?.stickChance === 0.3);
  const noController = caps(without('thrust-ctrl'));
  check('thrust-ctrl missing: engine dead, NO THRUST CONTROLLER', noController.thrustCtrl.band === 'missing'
    && thrustCap(noController) === 0 && engineFault(noController) === 'no-controller' && noController.thrustCtrl.ghost === null);

  const reactorAt = (integrity: number, busy = 0) => caps(withIntegrity('reactor', integrity), busy).reactor;
  check('reactor bandCap 1.0 / 0.85 / 0.6 / 0.3', reactorAt(80).bandCap === 1 && reactorAt(79).bandCap === 0.85
    && reactorAt(49).bandCap === 0.6 && reactorAt(24).bandCap === 0.3);
  check('reactor missing: 0.3, REACTOR BACKUP CELLS', caps(without('reactor')).reactor.bandCap === 0.3
    && BAND_COPY.reactor.missing === 'REACTOR BACKUP CELLS');
  check('reactorCap = bandCap × (1 − 0.25 × threads): 1 / 0.75 / 0.5', reactorAt(100, 0).reactorCap === 1
    && reactorAt(100, 1).reactorCap === 0.75 && reactorAt(100, 2).reactorCap === 0.5);
  check('reactorCap on a degraded reactor with 1 thread: 0.85 × 0.75', Math.abs(reactorAt(79, 1).reactorCap - 0.6375) < 1e-12);
  check('thrust cap = min(engine, reactor): failing engine 0.4 beats 2 threads 0.5',
    thrustCap(caps(withIntegrity('engine-io', 38), 2)) === 0.4);

  const presetsAt = (integrity: number) => presetsAvailable(caps(withIntegrity('autopilot', integrity)));
  check('autopilot: presets at ok and degraded, Q/E only at failing and dead', presetsAt(80) && presetsAt(50) && !presetsAt(49) && !presetsAt(0));
  check('autopilot missing: Q/E only, NO AUTOPILOT', !presetsAvailable(caps(without('autopilot'))) && BAND_COPY.autopilot.missing === 'NO AUTOPILOT');

  const plotAt = (integrity: number) => caps(withIntegrity('sensor', integrity)).plot;
  check('sensor ok: exact, no fuzz', plotAt(80).mode === 'exact' && plotAt(80).fuzzKm === 0 && plotAt(80).staleTac === 0);
  check('sensor degraded: approx, fuzz (100 − I) × 15', plotAt(79).mode === 'approx' && plotAt(70).fuzzKm === 30 * SENSOR_FUZZ_KM_PER_POINT
    && plotAt(50).fuzzKm === 750 && plotAt(50).staleTac === 0);
  check('sensor failing / dead: uncertain, stale 3 tac s', plotAt(49).mode === 'uncertain' && plotAt(24).mode === 'uncertain'
    && plotAt(40).staleTac === PLOT_STALE_TAC);
  check('sensor missing: uncertain', caps(without('sensor')).plot.mode === 'uncertain' && caps(without('sensor')).plot.band === 'missing');
  const navAt = (integrity: number) => caps(withIntegrity('navplot', integrity)).plot;
  check('navplot ok / degraded / failing: normal; dead: NO SIGNAL', navAt(80).mode === 'approx' && navAt(25).mode === 'approx'
    && navAt(24).mode === 'no-signal' && navAt(24).band === 'dead');
  check('navplot missing: NO SIGNAL', caps(without('navplot')).plot.mode === 'no-signal' && BAND_COPY.navplot.missing === 'NO SIGNAL');

  const scrambleAt = (integrity: number) => caps(withIntegrity('telemetry', integrity)).telemetryScramble;
  check('telemetry scramble = max(0, (60 − I) / 60)', scrambleAt(100) === 0 && scrambleAt(60) === 0 && Math.abs(scrambleAt(30) - 0.5) < 1e-12
    && scrambleAt(0) === 1);
  check('telemetry missing: scramble 1.0', caps(without('telemetry')).telemetryScramble === 1);

  check('comms bands follow AI Comms', caps(withIntegrity('comms', 49)).comms === 'failing' && caps(without('comms')).comms === 'missing');

  const printerAt = (integrity: number) => caps(withIntegrity('printer', integrity)).printer.speed;
  check('printer speed 1.0 / 0.75 / 0.5 / 0', printerAt(80) === 1 && printerAt(79) === 0.75 && printerAt(49) === 0.5 && printerAt(24) === 0);
  check('printer missing: 0, NO PRINTER', caps(without('printer')).printer.speed === 0 && BAND_COPY.printer.missing === 'NO PRINTER');

  check('core: threads 2 at 50, 1 at 49', caps(withIntegrity('core', 50)).threads === 2 && caps(withIntegrity('core', 49)).threads === 1);
}

// --- Offline states and the Core exemption -------------------------------------------------------
{
  for (const state of ['inactive', 'transferring', 'repairing'] as const) {
    const game = withIntegrity('engine-io', 100, state);
    const engine = caps(game).engine;
    check(`offline: an Engine I/O that is ${state} counts as dead`, engine.band === 'dead' && engine.powerCap === 0 && engine.offline === state);
  }
  check('offline: a repairing Engine I/O is an engine fault the strip can name', engineFault(caps(withIntegrity('engine-io', 38, 'repairing'))) === 'repairing');
  check('offline: a moving Engine I/O too', engineFault(caps(withIntegrity('engine-io', 85, 'transferring'))) === 'moving');
  for (const state of ['transferring', 'repairing'] as const) {
    const game = withIntegrity('core', 90, state);
    check(`Core exemption: a ${state} Core still counts (threads 2)`, roleHealth(game, 'core').band === 'ok' && coreThreads(game) === 2
      && caps(game).threads === 2);
  }
}

// --- Two copies of one role -----------------------------------------------------------------------
{
  const game = fresh();
  const engine = fileOf(game, 'engine-io');
  engine.integrity = 30;
  const copy = { ...structuredClone(engine), id: 'engine~copy', name: 'Engine I/O.cp', integrity: 90 };
  const freeIdx = game.memory.findIndex((seg) => seg.type === 'free' && seg.size >= copy.size);
  const free = game.memory[freeIdx]!;
  free.size -= copy.size;
  game.memory.splice(freeIdx, 0, copy);
  check('two copies: the healthiest live copy counts (90 beats 30)', caps(game).engine.band === 'ok');
  copy.state = 'transferring';
  check('two copies: an offline copy does not count, the other one does (30 → failing)', caps(game).engine.band === 'failing');
  engine.state = 'repairing';
  check('two copies: both offline → dead', caps(game).engine.band === 'dead');
}

// --- The copy table is complete and fits a row -------------------------------------------------------
{
  const missing: string[] = [];
  for (const role of CAPABILITY_ROLES) for (const band of BANDS) if (!BAND_COPY[role]?.[band]) missing.push(`${role}.${band}`);
  check('BAND_COPY: every role has a line for every band, missing included', missing.length === 0, missing.join(' '));
  const long = CAPABILITY_ROLES.flatMap((role) => BANDS.map((band) => BAND_COPY[role][band])).filter((text) => text.length > MAX_LINE_CHARS);
  check('BAND_COPY: every line fits the strip', long.length === 0, long.join(' | '));
  const tables = [ENGINE_POWER_BY_BAND, ENGINE_JITTER_BY_BAND, REACTOR_CAP_BY_BAND, PRINTER_SPEED_BY_BAND];
  check('band tables: a number for every band', tables.every((table) => BANDS.every((band) => typeof table[band] === 'number')));
}

finish();
