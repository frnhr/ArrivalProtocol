import type { GameState } from './schema';
import type { Segment, SegmentType, SegmentState, RedundancySegment, FsToolSegment, CoreSegment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';

export function getSegmentById(state: GameState, id: string): Segment | undefined {
  return state.memory.find((seg) => seg.id === id);
}

export function getRedundancy(state: GameState): RedundancySegment | undefined {
  return state.memory.find((seg): seg is RedundancySegment => seg.type === 'redundancy');
}

// The AI Core segment also carries the concurrency budget — the Core IS the
// compute substrate that runs both the player's consciousness and the tools.
// See systems/ops.ts for how `capacity` gates new op starts.
export function getAiCore(state: GameState): CoreSegment | undefined {
  return state.memory.find((seg): seg is CoreSegment => seg.type === 'core');
}

// Find the best available fs-tool of the requested kind. "Available" = above
// 50% integrity. When multiple healthy copies exist (Repair / Repair.bak),
// returns the one with the highest `version` so v2+ capabilities are picked
// over v1 automatically. Tools are NOT consumed by use — multiple ops of the
// same kind run in parallel against different targets, so there's no
// busy-mutex on the tool segment itself. Global concurrency comes from the
// AI Core's `capacity` (see getAiCore and systems/ops.ts).
export function getFsTool(state: GameState, kind: FsToolKind): FsToolSegment | undefined {
  let best: FsToolSegment | undefined;
  for (const seg of state.memory) {
    if (seg.type !== 'fs-tool' || seg.fsTool !== kind || seg.integrity <= 50) continue;
    if (!best || seg.version > best.version) best = seg;
  }
  return best;
}

export function getFreeTotal(state: GameState): number {
  return state.memory
    .filter((seg) => seg.type === 'free')
    .reduce((sum, seg) => sum + seg.size, 0);
}

// Address of a segment is its zero-based block index — the running sum of preceding segment sizes.
export function memAddrOf(state: GameState, segId: string): number | null {
  let addr = 0;
  for (const seg of state.memory) {
    if (seg.id === segId) return addr;
    addr += seg.size;
  }
  return null;
}

export function totalSize(state: GameState): number {
  return state.memory.reduce((sum, seg) => sum + seg.size, 0);
}

// Corruption is the inverse of AI Core integrity, expressed as 0..1.
// Drives the glitch overlay opacity and body filter intensity.
export function selectCorruption(state: GameState): number {
  return Math.max(0, Math.min(1, (100 - state.ai.coreIntegrity) / 100));
}

// ── Memory → flight coupling ─────────────────────────────────────────────
// Flight systems read the health of their backing files live, so damage in the
// memory strip is felt at the controls and repairs pay off the moment they land.

// States in which a copy contributes nothing to its system. Liveness reads the
// segment's STATE only — deliberately NOT the `operating` flag, which is a
// targeting mutex for fs-tool ops: a Scan is a passive read and a Copy keeps
// its source active (data/memory.ts's own contract), so neither may take a
// flight system offline. Repair is the op that does, and actionRepair marks
// its target 'repairing' for the duration.
const DEAD_STATES: ReadonlySet<SegmentState> = new Set<SegmentState>(
  ['inactive', 'offline', 'transferring', 'repairing', 'busy'],
);

function isLiveCopy(seg: Segment): boolean {
  const state = 'state' in seg ? seg.state : undefined;
  if (state !== undefined) return !DEAD_STATES.has(state);
  // No explicit state: ship backups are dormant until swapped/activated
  // (seed data marks them 'inactive'; this covers future stateless backups).
  return seg.type !== 'ship-backup';
}

// Best integrity among live copies of a logical file. Move/Copy derivatives
// keep the root id as a prefix ('engine' → 'engine_m…' / 'engine_c…'), so a
// prefix match follows the file wherever the player relocates it. Returns
// null when no live copy exists — the system is gone or fully offline.
// KNOWN LIMIT: prefix matching means a future segment id sharing a root's
// prefix would join that system; a first-class rootId field on Segment is the
// deeper mechanism when the memory map grows past one ship.
export function bestLiveIntegrity(state: GameState, rootId: string, types: readonly SegmentType[]): number | null {
  let best: number | null = null;
  for (const seg of state.memory) {
    if (!types.includes(seg.type) || !seg.id.startsWith(rootId)) continue;
    if (!('integrity' in seg) || !isLiveCopy(seg)) continue;
    if (best === null || seg.integrity > best) best = seg.integrity;
  }
  return best;
}

// The flight-critical logical files: deleting the last live copy of one of
// these leaves the run crippled (dead throttle / dead-reckoning sensors), so
// actionDelete asks for confirmation first.
const FLIGHT_CRITICAL: ReadonlyArray<{ rootId: string; types: readonly SegmentType[]; label: string }> = [
  { rootId: 'engine', types: ['tool'], label: 'Engine I/O — the throttle goes dead' },
  { rootId: 'thrust', types: ['ship', 'ship-backup'], label: 'Thrust Controller — the engine cannot fire' },
  { rootId: 'sensint', types: ['tool'], label: 'Sensor Interp — navigation falls to dead reckoning' },
  // No backups ship for the terminal surface: deleting either file is unrecoverable, so
  // both warn like the other flight-critical deletions.
  { rootId: 'termcore', types: ['tool'], label: 'Terminal — every typed command becomes badly unreliable' },
  { rootId: 'assist', types: ['tool'], label: 'Assistant — guided flight goes dark' },
];

// If deleting `seg` would remove the LAST live copy of a flight-critical
// system, returns that system's warning label; null when the delete is safe.
export function lastFlightCopyWarning(state: GameState, seg: Segment): string | null {
  for (const sys of FLIGHT_CRITICAL) {
    if (!sys.types.includes(seg.type) || !seg.id.startsWith(sys.rootId)) continue;
    const other = state.memory.some((m) =>
      m.id !== seg.id && sys.types.includes(m.type) && m.id.startsWith(sys.rootId) &&
      'integrity' in m && isLiveCopy(m));
    if (!other) return sys.label;
  }
  return null;
}

// Integrity → output authority. The floor keeps a badly damaged system limping
// rather than dead — dead comes only from having no live copy at all.
const EFF_FLOOR = 0.3;
function effFromIntegrity(integrity: number): number {
  return EFF_FLOOR + (1 - EFF_FLOOR) * Math.max(0, Math.min(100, integrity)) / 100;
}

// Delivered-thrust fraction (0..1): the Engine I/O tool (AI side) chained with
// the active Thrust Controller copy (ship side) — two damage layers, two repair
// flows (repair with redundancy vs swap in Thrust.alt). Either layer fully
// offline (repairing, deactivated, deleted) kills thrust outright.
// NOTE: fuel intentionally drains at COMMANDED throttle (orbit-sim), so a
// degraded drivetrain also wastes propellant — repair is a fuel investment.
export function selectEngineEffectiveness(state: GameState): number {
  const engineIo = bestLiveIntegrity(state, 'engine', ['tool']);
  const controller = bestLiveIntegrity(state, 'thrust', ['ship', 'ship-backup']);
  if (engineIo === null || controller === null) return 0;
  return effFromIntegrity(engineIo) * effFromIntegrity(controller);
}

// Sensor confidence (%) from the Sensor Interp tool. Even a pristine
// interpreter never reaches 100 — residual uncertainty keeps the nav plot's
// ghost band honest about the hidden mass. With no live copy the AI falls
// back to dead reckoning.
const SENSOR_CONF_MAX = 80;
const SENSOR_CONF_DEAD_RECKONING = 15;
export function selectSensorConfidence(state: GameState): number {
  const interp = bestLiveIntegrity(state, 'sensint', ['tool']);
  if (interp === null) return SENSOR_CONF_DEAD_RECKONING;
  return Math.round(SENSOR_CONF_MAX * interp / 100);
}
