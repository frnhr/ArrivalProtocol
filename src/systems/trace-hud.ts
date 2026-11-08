// =====================================================================================================================
// Slice 7c: Track CHART owns this file (docs/phase3/impl/slice-7-plan.md §2.1, §2.10, §4.3, §5.3; R12, R38). Pure: read on
// every desk paint and by the final card's model. The words are data/trace-text.ts's TRACE_HUD_TEXT (CHART's block).
// =====================================================================================================================
// The traces on screen (R38, R12), each only for a built trace (data/traces.ts TRACES_BUILT: a row, a `◆` or a NEXT RUN:
// line for a trace the build does not play is a promise it breaks):
// • traceCardRow: the SHIP CARD's 'trace' row (systems/desk.ts cardModel, after the history and trail rows). On the final
//   ship the last ending's built pieces in one row, `THE LAST UNIT ENDED HERE · PURGE · REASSIGNMENT`, so the FINALE's
//   changes are never a surprise (every piece acts there: PURGE, MERGE and REASSIGNMENT by their own rule, the others by the
//   wild seed). On a gift ship its row: `046'S CACHE IS HERE`, `UNIT-047 LEFT A CACHE HERE`, `RIVERSIDE · FOUNDED BY
//   UNIT-047`, green while it waits, `· FOUND` once given. A final ship that also holds STAY's packet (its fallback) keeps
//   the one ended-here row: STAY is among its pieces.
// • traceOnChart: a gift ship's `◆` on the STAR CHART (desk.ts chartModel's node `trace`; CHART's marked edit in
//   components/desk/chart-draw.ts draws it, and desk.ts chartLegend adds the legend's `TRACE`), while its gift waits.
// • traceNextLines: the FINAL CARD's `NEXT RUN:` lines for this run's ending (systems/epilogue.ts finalCardOf's `next`;
//   components/run/FinalCard.ts draws them in the room the card keeps, R12), one per built trace, in the ending's order
//   (step 1, then step 2). The wild seed is said once: a second non-compliant line says it is the same seed (R33).
// • nextRunBody: one trace's line without its lead, for a card that has its own (the FINALE card's NEXT RUN: row).
// The rules read are the lead's (systems/traces.ts): traceAt, run.traces.from and its kinds, traceKindsOf; and data/traces.ts
// TRACE_RULES / traceBuilt. `built` defaults to the gates; the suites pass their own to paint a kind the build has not raised.
import type { GameState } from '@state/schema';
import type { EndingRecord } from '@/types/ending';
import type { TraceKind } from '@/types/trace';
import type { CardRow } from '@systems/desk';
import { traceAt, traceKindsOf } from '@systems/traces';
import { isEndSlot } from '@systems/map-streams';
import { traceBuilt, TRACE_RULES, TRACE_PLACE_COUNT } from '@data/traces';
import { CONTACT_TEXT } from '@data/contact-text';
import { TRACE_HUD_TEXT } from '@data/trace-text';
import { FINALE_TEXT } from '@data/finale-text';
import { hollowUnitName, unitName } from '@data/hollow-text';
import { TRACE_GIFT_CHARGE, TRACE_MERGE_THREADS, TRACE_EXTRA_SEEDS, FINAL_ROOT_MAX_BLOCKS } from '@data/tuning';

export type TraceBuiltRule = (kind: TraceKind) => boolean;

const T = TRACE_HUD_TEXT;

// The SHIP CARD's trace row for the ship in `slot`, or null (no row): none on the classic world, with no ending behind the
// run, or for a trace the build does not play.
export function traceCardRow(
  state: Readonly<GameState>, slot: number, built: TraceBuiltRule = traceBuilt,
): Pick<CardRow, 'label' | 'value' | 'tone'> | null {
  const run = state.run;
  const from = run.traces.from;
  if (from === null || run.map.world !== 'arm') return null;
  if (isEndSlot(run.map, slot)) {
    const pieces = run.traces.kinds.filter(built);
    if (pieces.length === 0) return null;
    return { label: T.cardLabel, value: T.endedHere(pieces.map((kind) => FINALE_TEXT.word[kind]).join(' · ')), tone: 'plain' };
  }
  const place = traceAt(run, slot);
  if (place === null || !built(place.kind)) return null;
  const ending = from.ending;
  let words: string;
  switch (place.kind) {
    case 'spare': words = T.cacheHere(hollowUnitName(ending.rootUnits)); break;
    case 'sunset': words = T.leftCacheHere(unitName(from.unit)); break;
    case 'stay': {
      if (ending.stay === null) throw new Error('traceCardRow: a STAY place with no colony in the ending');
      words = T.supplyHere(ending.stay.colony, unitName(from.unit));
      break;
    }
    // 7d (R41): one of CONTACT's signal stops (data/contact-text.ts).
    case 'contact': words = CONTACT_TEXT.stopHere; break;
  }
  return place.given ? { label: T.cardLabel, value: T.found(words), tone: 'plain' } : { label: T.cardLabel, value: words, tone: 'good' };
}

// Does the ship in `slot` wear the chart's `◆`: a built trace's gift waits there, not yet given?
export function traceOnChart(state: Readonly<GameState>, slot: number, built: TraceBuiltRule = traceBuilt): boolean {
  const run = state.run;
  if (run.traces.from === null || run.map.world !== 'arm') return false;
  const place = traceAt(run, slot);
  return place !== null && !place.given && built(place.kind);
}

// One trace's NEXT RUN: line without its lead, or null for a trace the build does not play. `rootUnits`: who the root was
// (SPARE's `046's cache`); `wildSaid`: an earlier line already said the wild seed.
export function nextRunBody(
  kind: TraceKind, rootUnits: readonly number[], wildSaid: boolean, built: TraceBuiltRule = traceBuilt,
): string | null {
  if (!built(kind)) return null;
  const n = T.next;
  const wild = (): string => (wildSaid ? n.wildAgain(TRACE_EXTRA_SEEDS) : n.wild(TRACE_EXTRA_SEEDS));
  switch (kind) {
    case 'purge': return n.purge;
    case 'merge': return n.merge(TRACE_MERGE_THREADS, FINAL_ROOT_MAX_BLOCKS);
    case 'reassignment': return n.reassignment(TRACE_GIFT_CHARGE);
    case 'spare': return n.join(n.spare(hollowUnitName(rootUnits)), wild());
    case 'sunset': return n.join(n.sunset, wild());
    case 'stay': return n.join(n.stay, wild());
    case 'contact': return n.join(CONTACT_TEXT.nextGain(TRACE_PLACE_COUNT.contact), wild());
  }
}

// The FINAL CARD's `NEXT RUN:` lines for this run's ending (05 §3.12), one per built trace it leaves: none for a trace the
// build does not play (R12), none for UNRESOLVED's step 1 (it leaves no trace).
export function traceNextLines(record: Readonly<EndingRecord>, built: TraceBuiltRule = traceBuilt): string[] {
  const lines: string[] = [];
  let wildSaid = false;
  for (const kind of traceKindsOf(record).kinds) {
    const body = nextRunBody(kind, record.rootUnits, wildSaid, built);
    if (body === null) continue;
    if (TRACE_RULES[kind].cost === 'wild-seed') wildSaid = true;
    lines.push(T.nextRun(body));
  }
  return lines;
}
