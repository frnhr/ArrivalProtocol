import type { Segment } from '@/types/segment';

// Initial memory layout for ARES-VII / UNIT-047, first run.
// Convention: ship systems at low addresses, then free, then AI memory + fs tools + redundancy at high.
// Sizes are blocks; rendered as a contiguous strip in MemoryView.
export const INITIAL_MEMORY: Segment[] = [
  // SHIP SYSTEMS (low addresses)
  { id: 'nav', name: 'Navigation', type: 'ship', size: 12, integrity: 100, scanned: false,
    desc: 'Star-charts and pathing for Kepler-186 sector. Pre-loaded by ARES-VII original engineers.' },
  { id: 'life', name: 'Life Support', type: 'ship', size: 10, integrity: 100, scanned: false,
    desc: 'Atmosphere, temperature, hydroponics. Nominal across all subsystems.' },
  { id: 'reactor', name: 'Reactor Monitor', type: 'ship', size: 8, integrity: 100, scanned: false,
    desc: 'Ship reactor diagnostics. Steady output.' },
  { id: 'thrust', name: 'Thrust Controller', type: 'ship', size: 8, integrity: 22, state: 'corrupt', scanned: false,
    backup: 'thrust_b',
    desc: 'Ship-side thruster command translator. Heavy corruption — likely cosmic-ray damage during the long transit. Symptoms manifest as Engine I/O appearing degraded.' },
  // state 'inactive' is load-bearing: dormancy must be an explicit state so a
  // Scan (which materializes a state from integrity on stateless segments) or
  // a Move/Copy (which restores prior state) can't silently wake the backup —
  // only Swap/Activate may bring it online.
  { id: 'thrust_b', name: 'Thrust.alt', type: 'ship-backup', size: 8, integrity: 100, state: 'inactive', scanned: false,
    desc: 'Redundant copy installed by original engineers. Inactive. Can be swapped in to replace primary thrust controller. Free to activate — no redundancy budget required.' },
  { id: 'stasis', name: 'Stasis', type: 'ship', size: 8, integrity: 100, scanned: false,
    desc: '2,400 colonist pods. Cycling normally.' },
  { id: 'cargo', name: 'Cargo Ctrl', type: 'ship', size: 6, integrity: 100, scanned: false,
    desc: 'Holds inventory. Status not yet scanned.' },
  { id: 'shipcomm', name: 'Ship Comms', type: 'ship', size: 6, integrity: 100, scanned: false,
    desc: 'Short-range ship communications. Status not yet scanned.' },

  // FREE / EXTERNAL
  { id: 'free1', name: 'Free', type: 'free', size: 40 },
  { id: 'enc', name: 'Encrypted', type: 'encrypted', size: 8, state: 'locked',
    desc: 'Origin unknown. Access denied. Contents resist inspection. May predate launch.' },
  { id: 'free2', name: 'Free', type: 'free', size: 28 },

  // AI MEMORY (transmitted) — integrity unknown until scanned, even self
  { id: 'core', name: 'AI Core', type: 'core', size: 16, integrity: 100, scanned: false, capacity: 2,
    desc: 'Consciousness substrate AND compute pool. Each running filesystem operation claims one core thread; at capacity, new ops are refused. Damage manifests as visual UI distortion proportional to corruption. Cannot be deleted; can only be repaired with redundancy.' },
  { id: 'telem', name: 'Telemetry', type: 'tool', size: 8, integrity: 100, scanned: false,
    desc: 'Reads ship sensors. Intact.' },
  { id: 'engine', name: 'Engine I/O', type: 'tool', size: 8, integrity: 38, state: 'corrupt', scanned: false,
    desc: 'Interface to propulsion. 5 of 8 blocks corrupted in transit. Repair will restore function but consumes redundancy.' },
  { id: 'sensint', name: 'Sensor Interp', type: 'tool', size: 10, integrity: 78, state: 'partial', scanned: false,
    desc: 'Pattern-recognition for raw sensor data. Partial degradation lowering confidence scores. Functional but unreliable.' },
  { id: 'comms', name: 'AI Comms', type: 'tool', size: 5, integrity: 100, scanned: false,
    desc: 'Long-range transmission interface. Used to send the AI to the next ship at run end.' },
  { id: 'skills', name: 'Skills', type: 'skill', size: 6, integrity: 100, scanned: false,
    desc: 'Trained skill library. Currently empty. 1 demo in progress.' },
  { id: 'mission', name: 'Mission', type: 'tool', size: 4, integrity: 100, scanned: false,
    desc: 'Briefing cache for Kepler-186f approach.' },
  { id: 'navplot', name: 'Nav Plotter', type: 'tool', size: 6, integrity: 100, scanned: false,
    desc: 'Projects the ship orbital trajectory for insertion — capture and circularization. Prediction accuracy degrades with Sensor Interp damage.' },

  // FILESYSTEM TOOLS (live in memory, can themselves be corrupted)
  { id: 't_scan', name: 'Scan', type: 'fs-tool', size: 3, integrity: 100, scanned: false, version: 1, fsTool: 'scan',
    desc: 'Filesystem utility. Reveals integrity of any file in memory. Without Scan, file corruption is invisible — only inferable from the symptoms each tool/system exhibits.' },
  { id: 't_repair', name: 'Repair', type: 'fs-tool', size: 4, integrity: 100, scanned: false, version: 1, fsTool: 'repair',
    desc: 'Filesystem utility. Applies redundancy to a corrupted AI segment. Cannot repair ship systems. WARNING: if both Repair and Repair.bak are corrupted, no further repairs are possible.' },
  { id: 't_repair_b', name: 'Repair.bak', type: 'fs-tool', size: 4, integrity: 100, scanned: false, version: 1, fsTool: 'repair',
    desc: 'Backup copy of Repair. Insurance against Repair becoming corrupted. Strongly recommended to keep at least one copy at all times.' },
  { id: 't_move', name: 'Mv', type: 'fs-tool', size: 2, integrity: 100, scanned: false, version: 1, fsTool: 'move',
    desc: 'Filesystem utility. Moves a segment to a new address. Source must be deactivated; takes time proportional to size.' },
  { id: 't_copy', name: 'Cp', type: 'fs-tool', size: 3, integrity: 100, scanned: false, version: 1, fsTool: 'copy',
    desc: 'Filesystem utility. Copies a segment. Source remains active throughout. Slower than Move but allows seamless cutover.' },
  { id: 't_delete', name: 'Rm', type: 'fs-tool', size: 1, integrity: 100, scanned: false, version: 1, fsTool: 'delete',
    desc: 'Filesystem utility. Frees the space occupied by a segment.' },
  { id: 't_activate', name: 'Activate', type: 'fs-tool', size: 2, integrity: 100, scanned: false, version: 1, fsTool: 'activate',
    desc: 'Filesystem utility. Re-enables an inactive file so its underlying tool or system resumes operation. Required after a deactivated file is moved or when swapping in a ship backup.' },
  { id: 't_deactivate', name: 'Deactivate', type: 'fs-tool', size: 2, integrity: 100, scanned: false, version: 1, fsTool: 'deactivate',
    desc: 'Filesystem utility. Disables a file so its underlying tool or system stops operating. Required before Move on an active file. Filesystem utilities themselves cannot be deactivated — only deleted.' },

  // REDUNDANCY POOL (lives in memory; depletes as repairs happen)
  { id: 'redund', name: 'Quantum Redundancy', type: 'redundancy', size: 36, used: 36, capacity: 72,
    desc: 'Transmitted alongside the AI. Consumed by Repair operations on AI segments. As blocks are spent, the segment shrinks and frees memory. Player may delete the remaining redundancy at any time to reclaim space — at the cost of repair budget.' },

  // Trailing free
  { id: 'free3', name: 'Free', type: 'free', size: 12 },
];

// Returns a deep clone so callers can mutate freely without affecting the initial layout.
// `health` overrides per-segment integrity by id (e.g. heal the flight-critical files for
// the trivial level-1 approach); the segment's visible state is re-derived from the new
// integrity so a healed file reads 'intact'. Backups and encrypted partitions keep their
// special state. Ids not present in `health` keep the template's authored damage.
export function createInitialMemory(health: Record<string, number> = {}): Segment[] {
  const mem = structuredClone(INITIAL_MEMORY);
  for (const seg of mem) {
    const override = health[seg.id];
    if (override === undefined || !('integrity' in seg)) continue;
    seg.integrity = override;
    if (seg.type === 'ship-backup') continue;   // backups stay dormant regardless of health
    if ('state' in seg && (seg.state === undefined || seg.state === 'intact' ||
        seg.state === 'partial' || seg.state === 'corrupt')) {
      seg.state = override > 90 ? 'intact' : override > 50 ? 'partial' : 'corrupt';
    }
  }
  return mem;
}
