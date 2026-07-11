import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import type { PlanetParams } from '@/types/orbit';

export type ViewMode = 'tools' | 'memory';
export type TimeSpeed = 0 | 1 | 100 | 10000 | 1000000 | 100000000;

export interface MissionMeta {
  unitId: string;          // e.g. 'UNIT-047'
  shipId: string;          // e.g. 'ARES-VII'
  sector: string;          // e.g. 'SECTOR 03'
  destination: string;     // e.g. 'KEPLER-186'
  distanceLy: number;      // 581
  transmissionNum: number; // 47
  souls: number;           // 2400
}

export interface AiState {
  coreIntegrity: number;   // 0..100, drives glitch overlay
  uptimeSec: number;
}

export interface TelemetryState {
  velocity: number;        // km/s
  distance: number;        // km
  etaHrs: number;
  fuelPct: number;
  massEstMt: number;
  massPmMt: number;
  sensorConfPct: number;
}

export interface ClockState {
  tSec: number;            // mission seconds
  // EFFECTIVE multiplier the sim integrates by — continuous, not a TimeSpeed. It eases
  // toward speedTarget at a fixed log rate (the glide lives in systems/clock.ts), so
  // changing time-warp ramps through the orders of magnitude rather than jumping. 0 = paused.
  speed: number;
  speedTarget: TimeSpeed;  // the discrete value the player selected; speed glides toward this
}

// 'briefing' is the pre-flight hold: the world is paused behind the mission
// briefing overlay until the player commits with BEGIN APPROACH.
export type BurnStatus = 'briefing' | 'approaching' | 'inserted' | 'captured' | 'escaped' | 'crashed';

// Attitude autopilot helpers (SAS-style). 'off' = manual rotation thrusters only; the rest
// auto-slew the heading and hold it — 'hold' locks the current attitude, the others track a
// live direction. Availability is gated per level (LevelState.sasModes).
export type SasMode = 'off' | 'hold' | 'prograde' | 'retrograde' | 'radial-in' | 'radial-out';

export interface BurnState {
  thrustPct: number;        // 0..100, main thrust magnitude (fires along the heading)
  heading: number;          // radians, inertial — direction the ship points / thrust fires
  omega: number;            // rad per game-second — angular velocity (carries momentum)
  rotInput: -1 | 0 | 1;     // rotation thruster input: −1 = CW, +1 = CCW, 0 = none
  sasMode: SasMode;         // active attitude autopilot ('off' = manual rotation)
  holdTarget: number;       // captured heading for sasMode 'hold' (radians, inertial)
  trueMassMt: number;       // hidden; seeded within massEstMt ± massPmMt, never rendered
  thrustForce: number;      // engine constant; max accel = thrustForce / trueMass (km/s²)
  status: BurnStatus;       // changed only on terminal crossing
}

// 2D two-body truth integrated by the orbit sim (planet at origin). SI-ish units
// (km, km/s). The NAV PLOT derives OrbitElements from this each frame.
export interface OrbitVecState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tToPeriHrs: number;       // cheap time-to-periapsis estimate for the HUD
}

// Immutable per run: the planet the AI is inserting around, plus which attitude autopilot
// helpers the engine exposes this level/version (everything else is flown manually).
export interface LevelState {
  planet: PlanetParams;
  sasModes: SasMode[];
}

export interface ActiveTool {
  kind: FsToolKind;
  toolSegId: string;       // id of the fs-tool segment that owns this pickup
}

export interface PendingPlacement {
  regionSegIds: string[];  // segments forming the contiguous valid region
  col: number;             // column within that region where the new copy will start
}

export type FilterKey = 'ai' | 'ship' | 'filesystem' | 'free';
export type StatusKey = 'corrupt' | 'partial' | 'backup';

export interface UiState {
  mode: ViewMode;
  selectedId: string | null;
  activeTool: ActiveTool | null;
  pickedSourceId: string | null;
  pendingPlacement: PendingPlacement | null;
  // Bumped by action functions after in-place memory mutations. Subscribers
  // that need to rebuild on memory shape/state changes watch this counter
  // (with default Object.is equality) instead of using always-false equals,
  // so they don't fan out on every unrelated UI update.
  memoryRev: number;
  // Sidebar filters: which categories are currently muted. Empty = all
  // visible (default). Adding a key dims segments in that category.
  filtersOff: FilterKey[];
  // Sidebar spotlights: which statuses are pinned. Empty = no spotlight
  // (default — all segments at full opacity). When non-empty, segments that
  // don't match ANY active spotlight get dimmed.
  spotlight: StatusKey[];
}

export interface OpRecord {
  segId: string;
  label: string;
  icon: string;
  dur: number;             // ms
  startedAt: number;       // performance.now()
  kind: 'repair' | 'scan' | 'move' | 'copy' | 'delete';
}

export interface OpsState {
  // segId → in-flight op record. Mirrors what the visual progress bar shows.
  byId: Record<string, OpRecord>;
}

export interface GameState {
  mission: MissionMeta;
  memory: Segment[];
  ai: AiState;
  telemetry: TelemetryState;
  clock: ClockState;
  burn: BurnState;
  orbit: OrbitVecState;
  level: LevelState;
  ui: UiState;
  ops: OpsState;
}
