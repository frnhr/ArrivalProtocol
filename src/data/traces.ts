// Slice 7c: the lead owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §4.3). Track TRACE raises TRACES_BUILT's lines
// (one line per kind) and Track LINEAGE raises LINEAGE_BUILT (one line); others ask by message. Data and types only
// (support/import-guard): no system state is read here.
// The next run's traces as data (05-story §3.8's table, R30–R38): what each trace gives and costs, where it acts, the gates,
// the relay strangers and SUNSET's gift order. systems/traces.ts reads it (pure); every number is tuning.ts's 7c blocks'.
import type { TraceKind, PlacedTraceKind } from '@/types/trace';
import type { FsToolKind } from '@/types/fs-tool';

// What this build plays of the traces (R12: a `NEXT RUN:` line, a card row and every effect only for a built kind). While a
// kind is down its trace is still rolled and saved at RUN START (run.traces: the record is the record), but nothing reads
// it: no gift, no wipe, no thread, no wild seed, no root of its own. Track TRACE raises each line once its gain and its cost
// are both built. CONTACT's is 7d's.
export const TRACES_BUILT: Readonly<Record<TraceKind, boolean>> = {
  // Track TRACE's lines (one per kind):
  purge: false,
  merge: false,
  spare: false,
  sunset: false,
  stay: false,
  reassignment: false,
  // (7d's line:)
  contact: false,
};

// The lineage this build plays (R34–R37): the relay strangers mid-run from run 2 (meta.ts lineageAt reads
// systems/traces.ts midRunHollowUnits), the books (state/log-selectors.ts logBookOf), the face line and CONTROL's lineage
// lines at the boot. Down: run 2's HOLLOW is the last unit and every book is 046.log, as before slice 7c.
// Track LINEAGE raises this line.
export const LINEAGE_BUILT: boolean = true;

export function traceBuilt(kind: TraceKind): boolean {
  return TRACES_BUILT[kind];
}

// The trace table (05 §3.8; R31–R33), one row per kind: where it acts (at the next final ship, or as a gift that waits on
// a ship of the arm), what it gives and what it costs. Slice 8 retunes the numbers (tuning.ts's 7c blocks) and may swap a
// row's gain or cost without a new code path (§2.11).
// • gains: wipe-seeds (the seeds the unit carries into the final ship are gone), thread (+TRACE_MERGE_THREADS Core
//   threads at the final boot), cache (+TRACE_GIFT_CHARGE and the first of THREAD+ / FIREWALL.sys the unit lacks; the
//   beam into that ship carries no seeds), tool-cache (+TRACE_GIFT_CHARGE and a spare of a tool the last unit ended with,
//   by SUNSET_GIFT_PRIORITY), supply (+TRACE_GIFT_CHARGE and the colony's letter), allowance (+TRACE_GIFT_CHARGE at the
//   final boot), signal-stops (7d: two stops, +CONTACT_GIFT_CHARGE and a fragment each);
// • costs: hungrier (the FINALE's bite interval × TRACE_PURGE_BITE_MULT), bigger-root (the final root
//   FINAL_ROOT_MAX_BLOCKS), wild-seed (one extra seed at the final boot, once a run however many are held), root-is-you
//   (the final root is the last unit, and its RM hunts the highest-version skill first).
export type TraceGain = 'wipe-seeds' | 'thread' | 'cache' | 'tool-cache' | 'supply' | 'allowance' | 'signal-stops';
export type TraceCost = 'hungrier' | 'bigger-root' | 'wild-seed' | 'root-is-you';

export interface TraceRule {
  where: 'final' | PlacedTraceKind;   // 'final': it acts at the final ship; else the kind whose place holds its gift
  gain: TraceGain;
  cost: TraceCost;
}

export const TRACE_RULES: Readonly<Record<TraceKind, TraceRule>> = {
  purge: { where: 'final', gain: 'wipe-seeds', cost: 'hungrier' },
  merge: { where: 'final', gain: 'thread', cost: 'bigger-root' },
  spare: { where: 'spare', gain: 'cache', cost: 'wild-seed' },
  sunset: { where: 'sunset', gain: 'tool-cache', cost: 'wild-seed' },
  stay: { where: 'stay', gain: 'supply', cost: 'wild-seed' },
  reassignment: { where: 'final', gain: 'allowance', cost: 'root-is-you' },
  contact: { where: 'contact', gain: 'signal-stops', cost: 'wild-seed' },
};

// How many places each placed kind holds (R31, R41): one, CONTACT's two signal stops.
export const TRACE_PLACE_COUNT: Readonly<Record<PlacedTraceKind, number>> = { spare: 1, sunset: 1, stay: 1, contact: 2 };

// The relay strangers (R34; 05 §3.5): mid-run HOLLOW from run 2, alternating by run (031 on run 2, 038 on run 3, 031
// again on run 4). Names, not numbers: they are unit numbers of the story's, not tuning.
export const STRANGER_UNITS: readonly number[] = [31, 38];

// SUNSET's gift (R32): a spare copy of the first of these tools the last unit ended with (EndingRecord.kit), never a `.skl`.
// Rm first: no rm means no win (decision 12), so a spare Rm is the most a predecessor can leave.
export const SUNSET_GIFT_PRIORITY: readonly FsToolKind[] = ['delete', 'move', 'swap', 'copy', 'repair'];
