// Slice 7c: the lead owns this file (docs/phase3/impl/slice-7-plan.md §2.2, §4.3); tracks ask by message. A new saved field
// is folded into 7c's one save bump (v7 → v8) by the lead (R2).
// The next run's traces (05-story §3.8, 02-map §3.12, 04-threats §5) and the log book the `???` file holds (R37): what the
// last unit's ending leaves this run, where its gifts wait on the arm, and which unit's log the kid carries. Type-only
// imports; flat and JSON-safe (the run save stores them as they are).
import type { EndingRecord, HollowFate } from '@/types/ending';
import type { NotableEvent } from '@/types/lineage';

// One trace per ending piece (05 §3.8's table): a step-1 trace (PURGE, MERGE, SPARE; 'followed' leaves none) and a step-2
// trace (SUNSET, STAY, REASSIGNMENT, CONTACT). The kinds are the pieces' own names.
export type TraceKind = 'purge' | 'merge' | 'spare' | 'sunset' | 'stay' | 'reassignment' | 'contact';

// The traces whose gift waits on a ship of the arm (R31; 02 §3.12 "trace places"). The others act at the final ship.
export type PlacedTraceKind = 'spare' | 'sunset' | 'stay' | 'contact';

// Where a gift waits (systems/traces.ts placeTraces, at RUN START): the arm slot of its ship, and whether its gift has been
// given (Track TRACE's trace-gifts.ts sets it at that ship's boot; a trace lasts one run, so it is never given twice).
export interface TracePlace {
  kind: PlacedTraceKind;
  slot: number;
  given: boolean;
}

// The run's traces (RunState.traces, saved): rolled once at RUN START from the last unit's ending (R30) on the run's own
// 'traces' stream (R4: no stored arm moves). `from` is null when the last unit left no ending (run 1, a lost or abandoned
// last run, a v7 run resumed under v8): then there are no traces this run.
export interface RunTraces {
  from: { unit: number; ending: EndingRecord } | null;
  kinds: TraceKind[];           // the ending's step-1 and step-2 traces, in that order ('followed' has none)
  places: TracePlace[];         // where the placed kinds' gifts wait
  extraSeed: boolean;           // non-compliant (ending-rules controlCompliant): one wild seed at the final boot (R33)
}

// One trace line of a boot (ArrivalReport.traceLines, from the gifts actually applied, as the hits are): its boot-line kind
// (data/script.ts bootLinePlan places each), the trace it says, and its words, rendered when the trace was applied (Track
// TRACE: data/trace-text.ts). A first ship has no arrival: Track TRACE's trace-gifts.ts traceBootLines reads its lines
// itself.
export interface TraceBootLine {
  kind: 'trace-gift' | 'dish-wiped' | 'dish-wild';
  trace: TraceKind;
  text: string;
}

// The `???` file's book (RunLogState.book, saved; R37): chosen once at RUN START (state/log-selectors.ts logBookOf).
// • '046': run 1, and every run until LINEAGE_BUILT (and a v7 run resumed under v8: the book it was reading);
// • 'stranger': the relay stranger's own written log (031.log, 038.log; 6 entries), after SUNSET, STAY or CONTACT, or a
//   last unit that left no REASSIGNMENT;
// • 'last': after REASSIGNMENT, the last unit's own log (047.log; 7 entries): its step 1's tail and its notable events
//   (at most NOTABLE_EVENTS_MAX, the archive's, R37).
export type LogBook =
  | { kind: '046' }
  | { kind: 'stranger'; unit: number }
  | { kind: 'last'; unit: number; step1: HollowFate; events: NotableEvent[] };
