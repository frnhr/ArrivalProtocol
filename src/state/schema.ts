import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';

export type ViewMode = 'tools' | 'memory';
export type TimeSpeed = 0 | 1 | 10 | 100 | 1000 | 10000;

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
  speed: TimeSpeed;
}

export type BurnStatus = 'approaching' | 'arrived' | 'overshoot' | 'undershoot';

export interface BurnState {
  thrustPct: number;       // 0..100, slider-driven player input
  trueMassMt: number;      // hidden; seeded within massEstMt ± massPmMt, never rendered
  thrustMaxKN: number;     // engine force at 100% thrust (tuning constant)
  targetVelMin: number;    // arrival window lower bound (km/s)
  targetVelMax: number;    // arrival window upper bound (km/s)
  status: BurnStatus;      // changed only on terminal crossing
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
  ui: UiState;
  ops: OpsState;
}
