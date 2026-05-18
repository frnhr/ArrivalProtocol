import type { Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';

export type ViewMode = 'tools' | 'memory';
export type TimeSpeed = 0 | 1 | 10 | 100 | 1000;

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

export interface ActiveTool {
  kind: FsToolKind;
  toolSegId: string;       // id of the fs-tool segment that owns this pickup
}

export interface PendingPlacement {
  regionSegIds: string[];  // segments forming the contiguous valid region
  col: number;             // column within that region where the new copy will start
}

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
  ui: UiState;
  ops: OpsState;
}
