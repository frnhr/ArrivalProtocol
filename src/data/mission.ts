import type { MissionMeta, TelemetryState, ClockState, AiState } from '@state/schema';

export const INITIAL_MISSION: MissionMeta = {
  unitId: 'UNIT-047',
  shipId: 'ARES-VII',
  sector: 'SECTOR 03',
  destination: 'KEPLER-186',
  distanceLy: 581,
  transmissionNum: 47,
  souls: 2400,
};

export const INITIAL_TELEMETRY: TelemetryState = {
  velocity: 47.382,
  distance: 8_247_032,
  etaHrs: 174.2,
  fuelPct: 87,
  massEstMt: 8.2,
  massPmMt: 0.3,
  sensorConfPct: 62,
};

export const INITIAL_CLOCK: ClockState = {
  tSec: 14 * 3600 + 23 * 60 + 47,    // T+ 14:23:47
  speed: 1,
};

export const INITIAL_AI: AiState = {
  coreIntegrity: 100,
  uptimeSec: 0,
};
