// Slice 4: the FOUNDATION built skillLive; Track TREE owns this file after it (docs/phase3/impl/slice-4-plan.md §5.2);
// FLIGHT and UI read it.
import type { GameState } from '@state/schema';
import type { Segment, SegmentRole, SegmentState, CardFileKind, SkillFileSegment } from '@/types/segment';
import type { SkillId, SkillLevel, EffectiveVersion, LockLevel, SkillVersion } from '@/types/skill';
import type { FlightMods } from '@data/mission';
import {
  filesWithRole, hasIntegrity, integrityBand, coreThreads, upgradeFiles, skillFilesOf, swapAboard, type HealthSegment,
} from '@state/selectors';
import { threadsBusy } from '@systems/ops-core';
import { SKILL_IDS } from '@data/skills';
import {
  ENGINE_POWER_BY_BAND, ENGINE_JITTER_BY_BAND, REACTOR_CAP_BY_BAND, REACTOR_THREAD_SHARE, GHOST_BY_BAND, ARM_GHOST_BY_BAND,
  SENSOR_FUZZ_KM_PER_POINT, PLOT_STALE_TAC, TELEMETRY_SCRAMBLE_BELOW, INTEGRITY_MAX,
  MAX_LINE_CHARS, COMMS_GARBLE_BY_BAND, FUEL_TRIM_DV_BONUS_FRAC,
  BAY_CADENCE_BY_BAND, SENSOR_DROP_FACTOR_BY_BAND, PLOTTER_DROP_FACTOR_BY_BAND, DRIVER_DROP_FACTOR_BY_BAND,
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

// Bay Ctrl as the landing reads it (§3.4): its band, the cadence between launches, and BAY OFFLINE (the file missing).
export interface BayCapability {
  band: Band;
  cadenceTac: number | null;   // null only with `offline`
  offline: boolean;
}

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
  bay: BayCapability;
  // The drop (01-landing §3.8): whether a drop solution exists (false with Nav Plotter dead or missing: NO DROP
  // SOLUTION), the instruments' factors on the drop width (SENSOR_ / PLOTTER_DROP_FACTOR_BY_BAND), and `uncertain`
  // (Sensor Interp failing, dead or missing: the grey dot, DROP UNCERTAIN).
  drop: { solution: boolean; sensorFactor: number; plotterFactor: number; uncertain: boolean };
  threads: number;                                                                           // Core capacity (1 below 50)
  // Carried card files that work right now, by kind (§6.9, WP8: FUEL TRIM).
  upgrades: Readonly<Record<CardFileKind, number>>;
  // Each skill as it works right now (phase 3 slice 4, skillLive): its effective version and lock under damage.
  skills: Readonly<Record<SkillId, SkillLive>>;
}

// How many carried upgrade files of a kind work right now (§9 WP8 item 2: "a consumed file, or one below 50,
// gives no effect"): live (not inactive, moving or repairing: offline like any file) and degraded or better.
// A consumed file is gone (it turned into HOLLOW), so it is simply not counted.
export function liveUpgrades(memory: readonly Segment[], kind: CardFileKind): number {
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

// --- Skills (phase 3 slice 4; 03 §3.5, plan §2.7) ----------------------------------------------------------------------
// A skill works at an EFFECTIVE version set by its file's band: "each colour of damage costs one version; v1 still works
// when only damaged". The v1 column is phase 2's AUTOBURN rule (it worked at 50 or more: liveUpgrades), and PHASE3's
// example holds (v3 at 50% works as v2). LOCK RANGE is graded too (810 → 270 → 90).
//
// | band     | v1  | v2  | v3  | lock          |
// | ok       | v1  | v2  | v3  | its level     |
// | degraded | v1  | v1  | v2  | one lower     |
// | failing  | OFF | OFF | v1  | 90 (level 0)  |
// | dead / missing / offline: OFF, no lock      |

export interface SkillLive {
  file: SkillFileSegment | null;     // the copy that counts (null: no file of the skill in memory)
  version: EffectiveVersion;          // what it works as now (0: OFF)
  lock: LockLevel | null;             // its effective LOCK RANGE level (null: it does not work at all)
  band: Band;                         // the counting copy's band ('missing' with no file; 'dead' when every copy is offline)
  offline: OfflineReason | null;      // why every copy is offline, if they are
  nominal: SkillLevel | null;         // the counting copy's own level (what REPAIR brings back)
}

export function effectiveVersion(nominal: SkillVersion, band: Band): EffectiveVersion {
  switch (band) {
    case 'ok': return nominal;
    case 'degraded': return Math.max(1, nominal - 1) as SkillVersion;
    case 'failing': return Math.max(0, nominal - 2) as EffectiveVersion;
    case 'dead':
    case 'missing': return 0;
  }
}

export function effectiveLock(level: LockLevel, band: Band): LockLevel | null {
  switch (band) {
    case 'ok': return level;
    case 'degraded': return Math.max(0, level - 1) as LockLevel;
    case 'failing': return 0;
    case 'dead':
    case 'missing': return null;
  }
}

// What one skill file works as now (the one rule the MIND's chip, INSPECT and skillLive share): OFF while it is offline
// (repairing, moving, switched off), else its version at its band.
export function fileWorksAs(file: Readonly<SkillFileSegment>): EffectiveVersion {
  return offlineReason(file) !== null ? 0 : effectiveVersion(file.version, integrityBand(file.integrity));
}

// How skill `id` works right now (see above). Pure. The copy that counts is the online one that works best (highest
// effective version, then lock, then integrity), as roleHealth counts a role's best online copy; with every copy offline
// (repairing, moving, switched off) the skill is OFF and says why. COPY refuses skill files, so a second copy is rare (a
// test's, a PACK AS mid-flight never happens: the packet is cut at the desk), but the rule is total.
export function skillLive(memory: readonly Segment[], id: SkillId): SkillLive {
  const copies = skillFilesOf(memory, id);
  if (copies.length === 0) return { file: null, version: 0, lock: null, band: 'missing', offline: null, nominal: null };
  let best: { file: SkillFileSegment; band: Band; version: EffectiveVersion; lock: LockLevel | null } | null = null;
  for (const file of copies) {
    if (offlineReason(file) !== null) continue;
    const band = integrityBand(file.integrity);
    const version = fileWorksAs(file);
    const lock = version === 0 ? null : effectiveLock(file.lock, band);
    const better = best === null || version > best.version || (version === best.version && (lock ?? -1) > (best.lock ?? -1))
      || (version === best.version && lock === best.lock && file.integrity > best.file.integrity);
    if (better) best = { file, band, version, lock };
  }
  if (best === null) {
    const file = copies.reduce((a, b) => (b.integrity > a.integrity ? b : a));
    return { file, version: 0, lock: null, band: 'dead', offline: offlineReason(file), nominal: { version: file.version, lock: file.lock } };
  }
  return { file: best.file, version: best.version, lock: best.lock, band: best.band, offline: null, nominal: { version: best.file.version, lock: best.file.lock } };
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
  // §3.4: the cadence by band (BAY_CADENCE_BY_BAND) in the kid's words, the POD BAY pip's states. Missing is §3.4's BAY
  // OFFLINE said as `NO BAY CTRL`: "offline" next to pods would read as theirs (§3.10's word rules).
  bay: {
    ok: 'BAY CTRL OK',
    degraded: 'BAY CTRL DAMAGED · PODS LAUNCH SLOWER',
    failing: 'BAY CTRL FAILING · PODS LAUNCH SLOWLY',
    dead: 'BAY CTRL DEAD · ONE POD AT A TIME',
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
  // The drop width's factors (§3.8): ≥ 1 (damage only ever widens the dot), finite, for every band. The driver table has
  // no 'missing' (a pod with no driver never launches), but DetailPanel asks it for a dead driver, so dead must be there.
  const factorTables = { SENSOR_DROP_FACTOR_BY_BAND, PLOTTER_DROP_FACTOR_BY_BAND };
  for (const [name, table] of Object.entries(factorTables)) {
    for (const band of BANDS) {
      const value = table[band];
      if (!(value >= 1 && Number.isFinite(value))) throw new Error(`capabilities: ${name}.${band} is ${value}, not a factor ≥ 1`);
    }
  }
  for (const band of BANDS) {
    if (band === 'missing') continue;
    const value = DRIVER_DROP_FACTOR_BY_BAND[band];
    if (!(value >= 1 && Number.isFinite(value))) throw new Error(`capabilities: DRIVER_DROP_FACTOR_BY_BAND.${band} is ${value}, not a factor ≥ 1`);
  }
  // Bay Ctrl's cadence (§3.4): a positive number of tactical s for every band the file exists in, rising with damage, and
  // null exactly when it is missing (BAY OFFLINE), so `offline` and a null cadence can never disagree.
  let previous = 0;
  for (const band of BANDS) {
    const cadence = BAY_CADENCE_BY_BAND[band];
    if (band === 'missing') {
      if (cadence !== null) throw new Error(`capabilities: BAY_CADENCE_BY_BAND.missing is ${cadence}, not null (BAY OFFLINE)`);
      continue;
    }
    if (cadence === null || !(cadence > 0 && cadence >= previous)) {
      throw new Error(`capabilities: BAY_CADENCE_BY_BAND.${band} is ${cadence}, not a positive cadence that grows with damage`);
    }
    previous = cadence;
  }
  for (const [name, table] of [['GHOST_BY_BAND', GHOST_BY_BAND], ['ARM_GHOST_BY_BAND', ARM_GHOST_BY_BAND]] as const) {
    for (const [band, ghost] of Object.entries(table)) {
      if (!ghost) continue;
      if (!(ghost.meanIntervalTac > 0 && ghost.amp > 0 && ghost.durTac > 0 && ghost.stickChance >= 0 && ghost.stickChance <= 1)) {
        throw new Error(`capabilities: ${name}.${band} is not a valid ghost spec`);
      }
    }
  }
  // The limp is gentler than phase 2's ghost, and calmer as the controller heals (slice 3b, Fran's decision).
  const push = (spec: GhostSpec | undefined): number => (spec === undefined ? 0 : spec.amp / spec.meanIntervalTac);
  if (!(push(ARM_GHOST_BY_BAND.degraded) < push(ARM_GHOST_BY_BAND.failing) && push(ARM_GHOST_BY_BAND.failing) < push(GHOST_BY_BAND.failing))) {
    throw new Error('capabilities: ARM_GHOST_BY_BAND must push less than GHOST_BY_BAND, and less again in the degraded band');
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
  else if (dropUncertain(sensor.band)) mode = 'uncertain';
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
    thrustCtrl: { band: thrustCtrl.band, ghost: ghostSpecOf(state, thrustCtrl.band) },
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
    bay: bayCapability(bay.band),
    drop: {
      solution: navplot.band !== 'dead' && navplot.band !== 'missing',
      sensorFactor: SENSOR_DROP_FACTOR_BY_BAND[sensor.band],
      plotterFactor: PLOTTER_DROP_FACTOR_BY_BAND[navplot.band],
      uncertain: dropUncertain(sensor.band),
    },
    threads: coreThreads(state),
    upgrades: {
      'fuel-trim': liveUpgrades(state.memory, 'fuel-trim'),
      // Phase 3 slice 3b: the REPAIR v2 patch is a file only between its crossing and its boot line (it is used up there);
      // its effect is the Repair copies' version, not a live capability. Counted like the others for an honest record.
      'repair-patch': liveUpgrades(state.memory, 'repair-patch'),
    },
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, skillLive(state.memory, id)])) as Record<SkillId, SkillLive>,
  };
}

// What a Thrust Ctrl in `band` fires (null: nothing). The classic world keeps phase 2's GHOST_BY_BAND (SWAP arrives with
// its first burst). The arm's engine limps (slice 3b, Fran's decision): ARM_GHOST_BY_BAND, gentler, a twitch left in the
// degraded band a field repair reaches, and nothing once the orbit is locked or accepted (the landing), so the pods' orbit
// is not decayed by it.
function ghostSpecOf(state: Readonly<GameState>, band: Band): GhostSpec | null {
  if (state.run.map.world !== 'arm') return GHOST_BY_BAND[band] ?? null;
  if (state.run.phase === 'landing') return null;
  return ARM_GHOST_BY_BAND[band] ?? null;
}

// Bay Ctrl's capability for its band (§3.4): the one rule for the cadence and BAY OFFLINE. landing-rules reads it from
// roleHealth directly (launchRefusal, landingStuck), so the bay's answer never depends on the ops core's threads.
export function bayCapability(band: Band): BayCapability {
  const cadenceTac = BAY_CADENCE_BY_BAND[band];
  return { band, cadenceTac, offline: cadenceTac === null };
}

// The drop is uncertain (§3.8: the grey dot, `≈`, DROP UNCERTAIN) while Sensor Interp is failing or worse: the same
// bands that make the NAV PLOT's path uncertain, so the two never disagree.
export function dropUncertain(sensorBand: Band): boolean {
  return sensorBand === 'failing' || sensorBand === 'dead' || sensorBand === 'missing';
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

// The engine fires by itself and nothing aboard can stop it (slice 3b review, item 1): on the arm, Thrust Ctrl is failing or
// dead (a ghost source, whatever put it there: ENGINE FAULT, a transit hit, a bite) and no Swap is aboard (selectors
// swapAboard), with fuel left for a burst. On the arm SWAP comes only by request, so a kid can meet this with no cure; the
// classic world licenses SWAP with the first burst and never meets it. The strip's no-Swap line (repository.ts
// noSwapForGhost) and the flight's ENGINE FAULT SKIP refusal (pace.ts) both read it.
// ...and the bursts are the frequent ones (Thrust Ctrl failing or dead): SKIP is refused then (pace.ts). A field repair to
// the degraded band leaves a rare twitch a SKIP may fly through as WP10 ruled (and re-plan after).
export function ghostRefusesSkip(state: Readonly<GameState>): boolean {
  if (!ghostWithoutSwap(state)) return false;
  const band = capabilitiesNow(state).thrustCtrl.band;
  return band === 'failing' || band === 'dead';
}

export function ghostWithoutSwap(state: Readonly<GameState>): boolean {
  return state.run.map.world === 'arm' && state.burn.fuelPct > 0 && capabilitiesNow(state).thrustCtrl.ghost !== null && !swapAboard(state);
}
