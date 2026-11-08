// =====================================================================================================================
// Slice 7c: Track CHART owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §2.10, §4.3, §5.3; R12, R38). Pure: read on
// every desk paint and by the final card's model, so the FOUNDATION's stubs are neutral (the desk and the night show what
// they showed in 7b). The words are data/trace-text.ts's TRACE_HUD_TEXT (CHART's block).
// =====================================================================================================================
// The traces on screen (R38, R12):
// • traceCardRow: the SHIP CARD's 'trace' row (systems/desk.ts cardModel, after the history and trail rows): on the final
//   ship the last ending in one row, `THE LAST UNIT ENDED HERE · PURGE`, so the FINALE's changes are never a surprise; on a
//   gift ship its row (`046'S CACHE IS HERE`, `UNIT-047 LEFT A CACHE HERE`, `RIVERSIDE · FOUNDED BY UNIT-047`). Only for a
//   built trace (R12; data/traces.ts TRACES_BUILT).
// • traceOnChart: a gift ship's `◆` on the STAR CHART (desk.ts chartModel's node `trace`; CHART's marked edit in
//   components/desk/chart-draw.ts draws it, with the legend's `TRACE`).
// • traceNextLines: the FINAL CARD's `NEXT RUN:` lines for this run's ending (systems/epilogue.ts finalCardOf's `next`; CHART's
//   marked edit in components/run/FinalCard.ts draws them in the room the card keeps, R12), one per built trace.
// The rules CHART reads are the lead's (systems/traces.ts): traceAt (a ship's place), run.traces.from (the last ending),
// finalTraces, traceKindsOf (an ending's kinds, for the final card's lines), and data/traces.ts TRACE_RULES / traceBuilt.
import type { GameState } from '@state/schema';
import type { EndingRecord } from '@/types/ending';
import type { CardRow } from '@systems/desk';

// The SHIP CARD's trace row for the ship in `slot`, or null (no row). Neutral: null.
export function traceCardRow(state: Readonly<GameState>, slot: number): Pick<CardRow, 'label' | 'value' | 'tone'> | null {
  void state; void slot;
  return null;
}

// Does the ship in `slot` wear the chart's `◆` (a built trace's gift waits there)? Neutral: false.
export function traceOnChart(state: Readonly<GameState>, slot: number): boolean {
  void state; void slot;
  return false;
}

// The FINAL CARD's `NEXT RUN:` lines for this run's ending (05 §3.12), one per built trace it leaves. Neutral: none.
export function traceNextLines(record: Readonly<EndingRecord>): string[] {
  void record;
  return [];
}
