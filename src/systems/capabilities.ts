import type { GameState } from '@state/schema';
import type { Segment, SegmentRole, SegmentState, UpgradeKind } from '@/types/segment';
import type { FlightMods } from '@data/mission';
import {
  filesWithRole, hasIntegrity, integrityBand, coreThreads, upgradeFiles, type HealthSegment,
} from '@state/selectors';
import { threadsBusy } from '@systems/ops-core';
import {
  ENGINE_POWER_BY_BAND, ENGINE_JITTER_BY_BAND, REACTOR_CAP_BY_BAND, REACTOR_THREAD_SHARE, GHOST_BY_BAND,
  SENSOR_FUZZ_KM_PER_POINT, PLOT_STALE_TAC, TELEMETRY_SCRAMBLE_BELOW, BAY_CADENCE_TAC, INTEGRITY_MAX,
  MAX_LINE_CHARS, COMMS_GARBLE_BY_BAND, FUEL_TRIM_DV_BONUS_FRAC,
} from '@data/tuning';

// Every capability is a file (§3.3, §6.4, pillar 4). What the ship can do right now is a pure
// function of the files in memory: each role's best working copy sets a band, and the band sets
// the numbers the sim, the predictor, guidance and the HUD read. Nothing here is remembered, so
// a repair, a delete, a move or a bite changes the ship on the very next tick, and every loss
// has a file the kid can find, click and explain.
//
// • A role's copies: every file with that role (a .cp, a swapped-in backup). The highest-integrity
//   copy that is ONLINE counts. A copy that is inactive, moving (transferring) or being repaired
//   is offline, except the Core, which is you and never goes offline.
// • No file with the role at all: 'missing', shown loudly (BAND_COPY), never a default.
// • Every copy offline: 'dead', with the reason (repairing, moving …) so guidance can say why.

export type Band = 'ok' | 'degraded' | 'failing' | 'dead' | 'missing';
export type PlotMode = 'exact' | 'approx' | 'uncertain' | 'no-signal';

// Uncommanded thrust from a damaged Thrust Ctrl (C2), in tactical seconds and shares of nominal
// thrust. Rolled by orbit-sim (ghost scheduler).
export interface GhostSpec {
  meanIntervalTac: number;
  amp: number;
  durTac: number;
  stickChance: number;
}

// Why every copy of a role is offline (the states that count as dead).
export type OfflineReason = Extract<SegmentState, 'inactive' | 'transferring' | 'repairing'>;

export interface RoleHealth {
  band: Band;
  integrity: number | null;       // the counting copy's integrity (null when missing)
  offline: OfflineReason | null;  // set when the band is dead because every copy is offline
}

export interface Capabilities {
  engine: { band: Band; powerCap: number; jitter: number; offline: OfflineReason | null };  // Engine I/O
  thrustCtrl: { band: Band; ghost: GhostSpec | null };                                       // Thrust Ctrl (ship)
  reactor: { band: Band; bandCap: number; reactorCap: number };                              // Reactor (ship) × threads
  presets: Band;                                                                             // Autopilot
  // Sensor Interp + Nav Plotter; offline: why the file that blinds the plot is offline, if it is.
  plot: { band: Band; mode: PlotMode; fuzzKm: number; staleTac: number; offline: OfflineReason | null };
  telemetryScramble: number;                                                                 // 0..1
  comms: Band;                                                                               // AI Comms
  // Bay Ctrl (ship, 01-landing §3.4): its band, and the tactical seconds between launches (BAY_CADENCE_BY_BAND); with
  // the file missing, cadenceTac is null and `offline` is true (BAY OFFLINE: no launch, L12-bay, the auto-end).
  // TODO(slice1b-DROP): the per-band cadence and `offline`; until then BAY_CADENCE_TAC whatever the band.
  bay: { band: Band; cadenceTac: number | null; offline: boolean };
  // The drop (01-landing §3.8): whether a drop solution exists (false with Nav Plotter dead or missing: NO DROP
  // SOLUTION), the instruments' factors on the drop width (SENSOR_ / PLOTTER_DROP_FACTOR_BY_BAND), and `uncertain`
  // (Sensor Interp failing, dead or missing: the grey dot, DROP UNCERTAIN). TODO(slice1b-DROP): factors 1 and
  // `uncertain` false until DROP fills them from the bands.
  drop: { solution: boolean; sensorFactor: number; plotterFactor: number; uncertain: boolean };
  threads: number;                                                                           // Core capacity (1 below 50)
  // Carried upgrade files that work right now, by kind (§6.9, WP8: FUEL TRIM; AUTOBURN.skl in WP9).
  upgrades: Readonly<Record<UpgradeKind, number>>;
}

// How many carried upgrade files of a kind work right now (§9 WP8 item 2: "a consumed file, or one below 50,
// gives no effect"): live (not inactive, moving or repairing: offline like any file) and degraded or better.
// A consumed file is gone (it turned into HOLLOW), so it is simply not counted.
export function liveUpgrades(memory: readonly Segment[], kind: UpgradeKind): number {
  return upgradeFiles(memory, kind).filter((seg) => {
    const band = integrityBand(seg.integrity);
    return (band === 'ok' || band === 'degraded') && offlineReason(seg) === null;
  }).length;
}

// What the carried files do to a new ship's flight, read once at the arrival (createFlight): every working
// FUEL TRIM widens the Δv budget (§6.9). A FUEL TRIM eaten mid-ship keeps this ship's budget: it applies
// from the next arrival (§9 WP8 edge case).
export function flightModsOf(memory: readonly Segment[]): FlightMods {
  return { dvBonusFrac: FUEL_TRIM_DV_BONUS_FRAC * liveUpgrades(memory, 'fuel-trim') };
}

// The roles that drive a capability, and what each band means for the ship, in the words a pip,
// a tooltip or a veil shows. Every role has a line for every band, 'missing' included, so a lost
// file always reads as a loud state (validated below).
export type CapabilityRole = Extract<SegmentRole,
  'engine-io' | 'thrust-ctrl' | 'reactor' | 'autopilot' | 'sensor' | 'navplot' | 'telemetry' | 'comms' | 'bay' | 'core'>;

export const CAPABILITY_ROLES: readonly CapabilityRole[] = [
  'engine-io', 'thrust-ctrl', 'reactor', 'autopilot', 'sensor', 'navplot', 'telemetry', 'comms', 'bay', 'core',
];

export const BANDS: readonly Band[] = ['ok', 'degraded', 'failing', 'dead', 'missing'];

// What a role's file is called on screen (window pips, the toggle's alert, the THRUST LIMIT
// cause). A table, not the file's own name: a missing file still needs one.
export const ROLE_LABEL: Readonly<Record<CapabilityRole, string>> = {
  'engine-io': 'ENGINE I/O',
  'thrust-ctrl': 'THRUST CTRL',
  reactor: 'REACTOR',
  autopilot: 'AUTOPILOT',
  sensor: 'SENSOR INTERP',
  navplot: 'NAV PLOTTER',
  telemetry: 'TELEMETRY',
  comms: 'AI COMMS',
  bay: 'BAY CTRL',
  core: 'AI CORE',
};

// Presets that can't point the ship (C3): one line wherever it is drawn with key caps (the preset
// hint, the strip after a refused W/A/S/D), and plain in BAND_COPY's tooltip.
export const AUTOPILOT_DAMAGED_LINE = 'AUTOPILOT FILE DAMAGED — use [Q] / [E]';
const AUTOPILOT_DAMAGED_PLAIN = AUTOPILOT_DAMAGED_LINE.replace(/\[([^\]]+)\]/g, '$1');

export const BAND_COPY: Readonly<Record<CapabilityRole, Readonly<Record<Band, string>>>> = {
  'engine-io': {
    ok: 'ENGINE I/O OK · FULL POWER',
    degraded: 'ENGINE I/O DAMAGED · 75% POWER',
    failing: 'ENGINE WEAK · 40% POWER',
    dead: 'ENGINE NOT RESPONDING',
    missing: 'NO ENGINE DRIVER',
  },
  'thrust-ctrl': {
    ok: 'THRUST CTRL OK',
    degraded: 'THRUST CTRL DAMAGED',
    failing: 'THRUST CTRL FAILING · ENGINE MAY FIRE BY ITSELF',
    dead: 'THRUST CTRL DEAD · ENGINE FIRES BY ITSELF',
    missing: 'NO THRUST CONTROLLER',
  },
  reactor: {
    ok: 'REACTOR OK',
    degraded: 'REACTOR DAMAGED · 85% POWER',
    failing: 'REACTOR FAILING · 60% POWER',
    dead: 'REACTOR DEAD · BACKUP CELLS 30%',
    missing: 'REACTOR BACKUP CELLS',
  },
  autopilot: {
    ok: 'AUTOPILOT OK · W/A/S/D',
    degraded: 'AUTOPILOT DAMAGED · W/A/S/D STILL WORK',
    failing: AUTOPILOT_DAMAGED_PLAIN,
    dead: AUTOPILOT_DAMAGED_PLAIN,
    missing: 'NO AUTOPILOT',
  },
  sensor: {
    ok: 'SENSOR INTERP OK · EXACT PATH',
    degraded: 'SENSOR INTERP DAMAGED · PATH ≈',
    failing: 'PATH UNCERTAIN',
    dead: 'PATH UNCERTAIN',
    missing: 'NO SENSOR INTERP · PATH UNCERTAIN',
  },
  navplot: {
    ok: 'NAV PLOTTER OK',
    degraded: 'NAV PLOTTER DAMAGED · STILL DRAWS',
    failing: 'NAV PLOTTER FAILING · STILL DRAWS',
    dead: 'NO SIGNAL',
    missing: 'NO SIGNAL',
  },
  telemetry: {
    ok: 'TELEMETRY OK',
    degraded: 'TELEMETRY DAMAGED',
    failing: 'TELEMETRY FAILING · DIGITS SCRAMBLE',
    dead: 'TELEMETRY DEAD · DIGITS SCRAMBLED',
    missing: 'NO TELEMETRY',
  },
  comms: {
    ok: 'AI COMMS OK · BEAM OUT READY',
    degraded: 'AI COMMS DAMAGED · BEAM OUT READY',
    failing: 'AI COMMS FAILING · CONTROL GARBLED',
    dead: 'AI COMMS DEAD · NO WAY OUT',
    missing: 'NO AI COMMS · NO WAY OUT',
  },
  // 1a: honest that the damage does nothing yet (slice 1b's cadence by band and BAY OFFLINE replace these).
  bay: {
    ok: 'BAY CTRL OK',
    degraded: 'BAY CTRL DAMAGED',
    failing: 'BAY CTRL FAILING',
    dead: 'BAY CTRL DEAD',
    missing: 'NO BAY CTRL',
  },
  core: {
    ok: 'AI CORE OK',
    degraded: 'AI CORE DAMAGED · GLITCHING',
    failing: 'AI CORE FAILING · 1 THREAD',
    dead: 'AI CORE CRITICAL · 1 THREAD',
    missing: 'NO AI CORE',
  },
};

// The copy tables are checked once at load: every role and band has a line that fits a strip
// row, and every band table in tuning.ts has a sane number for every band. A gap here would be a
// silent default at the worst moment, so it throws instead.
function validateCapabilityTables(): void {
  for (const role of CAPABILITY_ROLES) {
    if (!ROLE_LABEL[role]) throw new Error(`capabilities: ROLE_LABEL has no entry for role '${role}'`);
    const copy = BAND_COPY[role];
    if (!copy) throw new Error(`capabilities: BAND_COPY has no entry for role '${role}'`);
    for (const band of BANDS) {
      const text = copy[band];
      if (!text) throw new Error(`capabilities: BAND_COPY['${role}'] has no '${band}' line`);
      if (text.length > MAX_LINE_CHARS) throw new Error(`capabilities: BAND_COPY['${role}'].${band} is over ${MAX_LINE_CHARS} chars`);
    }
  }
  const tables = { ENGINE_POWER_BY_BAND, ENGINE_JITTER_BY_BAND, REACTOR_CAP_BY_BAND, COMMS_GARBLE_BY_BAND };
  for (const [name, table] of Object.entries(tables)) {
    for (const band of BANDS) {
      const value = table[band];
      if (!(value >= 0 && value <= 1)) throw new Error(`capabilities: ${name}.${band} is ${value}, not in 0..1`);
    }
  }
  for (const [band, ghost] of Object.entries(GHOST_BY_BAND)) {
    if (!ghost) continue;
    if (!(ghost.meanIntervalTac > 0 && ghost.amp > 0 && ghost.durTac > 0 && ghost.stickChance >= 0 && ghost.stickChance <= 1)) {
      throw new Error(`capabilities: GHOST_BY_BAND.${band} is not a valid ghost spec`);
    }
  }
}
validateCapabilityTables();

// Why a file is offline right now (switched off, being moved or copied, being repaired), or null: an offline
// file does nothing for the ship, whatever its health. The Skills window reads it for the cards' files too.
export function offlineReason(seg: HealthSegment): OfflineReason | null {
  const state = seg.state;
  return state === 'inactive' || state === 'transferring' || state === 'repairing' ? state : null;
}

// How a role stands right now (see the header). Pure.
export function roleHealth(state: Readonly<GameState>, role: SegmentRole): RoleHealth {
  const copies = filesWithRole(state, role).filter(hasIntegrity);
  if (copies.length === 0) return { band: 'missing', integrity: null, offline: null };
  let bestOnline: HealthSegment | null = null;
  let bestAny: HealthSegment = copies[0]!;
  for (const copy of copies) {
    if (copy.integrity > bestAny.integrity) bestAny = copy;
    const online = role === 'core' || offlineReason(copy) === null;
    if (online && (!bestOnline || copy.integrity > bestOnline.integrity)) bestOnline = copy;
  }
  if (!bestOnline) return { band: 'dead', integrity: bestAny.integrity, offline: offlineReason(bestAny) };
  return { band: integrityBand(bestOnline.integrity), integrity: bestOnline.integrity, offline: null };
}

// The whole §6.4 table. threadsBusy counts running ops plus reserved threads (ops-core).
export function deriveCapabilities(state: Readonly<GameState>, threadsBusy: number): Capabilities {
  const engine = roleHealth(state, 'engine-io');
  const thrustCtrl = roleHealth(state, 'thrust-ctrl');
  const reactor = roleHealth(state, 'reactor');
  const sensor = roleHealth(state, 'sensor');
  const navplot = roleHealth(state, 'navplot');
  const telemetry = roleHealth(state, 'telemetry');
  const bay = roleHealth(state, 'bay');

  const bandCap = REACTOR_CAP_BY_BAND[reactor.band];
  const reactorCap = Math.max(0, bandCap * (1 - REACTOR_THREAD_SHARE * threadsBusy));

  let mode: PlotMode = 'exact';
  if (navplot.band === 'dead' || navplot.band === 'missing') mode = 'no-signal';
  else if (sensor.band === 'failing' || sensor.band === 'dead' || sensor.band === 'missing') mode = 'uncertain';
  else if (sensor.band === 'degraded') mode = 'approx';
  const plotFile = mode === 'no-signal' ? navplot : sensor;
  const sensorIntegrity = sensor.integrity ?? 0;
  const fuzzKm = mode === 'exact' ? 0 : (INTEGRITY_MAX - sensorIntegrity) * SENSOR_FUZZ_KM_PER_POINT;

  // A telemetry file that is offline or gone sends no numbers at all.
  const telemetryScramble = telemetry.band === 'missing' || telemetry.offline !== null || telemetry.integrity === null
    ? 1
    : Math.max(0, (TELEMETRY_SCRAMBLE_BELOW - telemetry.integrity) / TELEMETRY_SCRAMBLE_BELOW);

  return {
    engine: {
      band: engine.band,
      powerCap: ENGINE_POWER_BY_BAND[engine.band],
      jitter: ENGINE_JITTER_BY_BAND[engine.band],
      offline: engine.offline,
    },
    thrustCtrl: { band: thrustCtrl.band, ghost: GHOST_BY_BAND[thrustCtrl.band] ?? null },
    reactor: { band: reactor.band, bandCap, reactorCap },
    presets: roleHealth(state, 'autopilot').band,
    plot: {
      band: plotFile.band,
      mode,
      fuzzKm,
      staleTac: mode === 'uncertain' ? PLOT_STALE_TAC : 0,
      offline: mode === 'uncertain' || mode === 'no-signal' ? plotFile.offline : null,
    },
    telemetryScramble,
    comms: roleHealth(state, 'comms').band,
    bay: { band: bay.band, cadenceTac: BAY_CADENCE_TAC, offline: false },
    drop: { solution: navplot.band !== 'dead' && navplot.band !== 'missing', sensorFactor: 1, plotterFactor: 1, uncertain: false },
    threads: coreThreads(state),
    upgrades: { 'fuel-trim': liveUpgrades(state.memory, 'fuel-trim'), autoburn: liveUpgrades(state.memory, 'autoburn') },
  };
}

// The capabilities right now, with the ops core's busy threads (running ops plus reserved ones).
// Cheap (one pass per role over a few dozen segments), so callers derive it when they need it
// instead of caching a copy that a repair or a bite could leave stale.
export function capabilitiesNow(state: Readonly<GameState>): Capabilities {
  return deriveCapabilities(state, threadsBusy());
}

// The presets (W/A/S/D) work while the Autopilot is degraded or better (C3).
export function presetsAvailable(caps: Capabilities): boolean {
  return caps.presets === 'ok' || caps.presets === 'degraded';
}

// Why the engine cannot fire at all, or null when it can (at some power). The order is the
// order of the fix: no controller (a ship file, nothing to repair), no driver file, then a
// driver that is offline for an op the kid started, then one that is simply dead.
export type EngineFault = 'no-controller' | 'no-driver' | 'repairing' | 'moving' | 'dead';

export function engineFault(caps: Capabilities): EngineFault | null {
  if (caps.thrustCtrl.band === 'missing') return 'no-controller';
  if (caps.engine.band === 'missing') return 'no-driver';
  if (caps.engine.band !== 'dead') return null;
  if (caps.engine.offline === 'repairing') return 'repairing';
  if (caps.engine.offline === 'transferring') return 'moving';
  return 'dead';
}

// Why the NAV PLOT can't show the path (PATH UNCERTAIN, NO SIGNAL), or null when it can (exact or
// ≈): the file that blinds it, and how. Hurt is the fix-it case (REPAIR the file); a repair or a
// move the kid started only needs waiting out; a missing file has nothing left to repair.
export type PlotFaultCause = 'hurt' | 'repairing' | 'moving' | 'missing';
export interface PlotFault {
  role: Extract<CapabilityRole, 'sensor' | 'navplot'>;
  cause: PlotFaultCause;
}

export function plotFault(caps: Capabilities): PlotFault | null {
  const { mode, band, offline } = caps.plot;
  if (mode === 'exact' || mode === 'approx') return null;
  const role = mode === 'no-signal' ? 'navplot' : 'sensor';
  if (band === 'missing') return { role, cause: 'missing' };
  if (offline === 'repairing') return { role, cause: 'repairing' };
  if (offline === 'transferring') return { role, cause: 'moving' };
  return { role, cause: 'hurt' };
}

// The share of nominal thrust the ship's files let through (§6.2): the engine driver's cap, the
// reactor's share after the busy threads, and nothing at all without a thrust controller.
export function thrustCap(caps: Capabilities): number {
  if (caps.thrustCtrl.band === 'missing') return 0;
  return Math.min(caps.engine.powerCap, caps.reactor.reactorCap);
}

// The share of nominal thrust the flight plan places START BURN with (predict.ts; WP12 p3, the WP4 fixer's proposal for
// the BRAKE IN countdown that jumped 161.7 → 173.5 → 163.6 tac s across the Engine I/O lesson's repair). As thrustCap,
// except while the engine driver is offline for an op the kid started (its REPAIR or MOVE): then as if it were online at
// the band it has now. The tick sits half the burn before its apsis, so an engine at 0 for a 3 s repair put it on the
// apsis itself, and the countdown leapt up and back. Now it moves only as the healing file climbs its bands (a few
// seconds, in steps), the same way it moves for any change of power. The burn itself still waits for the driver.
export function planningThrustCap(state: Readonly<GameState>, caps: Capabilities): number {
  const offline = caps.engine.offline;
  if (offline !== 'repairing' && offline !== 'transferring') return thrustCap(caps);
  if (caps.thrustCtrl.band === 'missing') return 0;
  const integrity = roleHealth(state, 'engine-io').integrity;
  if (integrity === null) throw new Error('planningThrustCap: Engine I/O is offline but has no integrity');
  return Math.min(ENGINE_POWER_BY_BAND[integrityBand(integrity)], caps.reactor.reactorCap);
}
