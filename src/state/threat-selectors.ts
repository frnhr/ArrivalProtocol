import type { GameState } from '@state/schema';
import type { Segment, HollowSegment } from '@/types/segment';
import type { ThreatTally } from '@/types/threat';
import { isHollow, hasUsableTool } from '@state/selectors';
import { TRACE_CELLS } from '@data/tuning';

// Pure reads of the threat ladder's state (docs/phase3/04-threats.md §3.3–§3.8; slice-2-plan §2.1). Track THREAT owns this
// file after the slice 2 foundation; UI reads it for the TRACE meter, the LANDING REPORT's TRACE line and the PACKET's
// chips, and THREAT's endShip applies tallyPreview's result. DOM-free and store-free.

// The beam-born hollow blocks in memory (04 §3.7): beam seeds, and blocks a beam-born block made by eating a file.
export function beamSeedsInMemory(memory: readonly Segment[]): HollowSegment[] {
  return memory.filter((seg): seg is HollowSegment => isHollow(seg) && seg.beam === true);
}

// What this ship's end will do with the beam-born blocks still in memory (04 §3.7), computed from the live state: the
// LANDING REPORT shows it before CONTINUE (endShip runs on CONTINUE, so run.threat.lastTally is still the last ship's),
// and THREAT's endShip calls this very function to apply it. With HOLLOW aboard they feed its next root (TRACE stands);
// otherwise each adds 1 to TRACE.
export function tallyPreview(state: Readonly<GameState>): ThreatTally {
  const left = beamSeedsInMemory(state.memory).length;
  const traceBefore = state.run.threat.trace;
  const fed = state.run.threat.aboard;
  return { left, traceBefore, traceAfter: fed ? traceBefore : traceBefore + left, fed };
}

// The TRACE meter as cells (04 §4: `TRACE ■■□`, then `■■■ +1`): how many of TRACE_CELLS are filled, and the reports past a
// full meter. data/threat-text.ts traceCells(trace) draws the same numbers as text.
export function traceCells(state: Readonly<GameState>): { filled: number; total: number; over: number } {
  const trace = state.run.threat.trace;
  return { filled: Math.min(trace, TRACE_CELLS), total: TRACE_CELLS, over: Math.max(0, trace - TRACE_CELLS) };
}

// HOLLOW is aboard this ship (it boarded on this beam or an earlier one, or this is the final ship).
export function hollowAboard(state: Readonly<GameState>): boolean {
  return state.run.threat.aboard;
}

// No working rm in memory (04 §3.3): no usable DELETE file that is not being eaten. Information only: the last-rm stamp
// and echo, `NO RM · YOU CAN'T DELETE THE ROOT` on the PACKET, and the no-rm seed line.
export function noWorkingRm(state: Readonly<GameState>): boolean {
  return !hasUsableTool(state.memory, 'delete', 'excluded');
}

// Slice 5's hook (a corrupted resident wakes after it): on the ship HOLLOW boarded, its first fight has been decided (the
// scripted bite cured or eaten, or a timed wake's first bite landed).
// TODO(slice2-THREAT): implement with the 'arrives' story (decideScript's moment on a folded ship); false until then.
export function hollowFirstFightDecided(state: Readonly<GameState>): boolean {
  void state;
  return false;
}
