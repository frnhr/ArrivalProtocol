import type { GameState } from '@state/schema';
import type { Segment, HollowSegment, FsToolSegment } from '@/types/segment';
import type { ThreatTally } from '@/types/threat';
import { isHollow, hasUsableTool, toolFilesOf, isUsableTool } from '@state/selectors';
import { TRACE_CELLS, WALL_MIN_BLOCKS } from '@data/tuning';

// Pure reads of the threat ladder's state (docs/phase3/04-threats.md §3.3–§3.8; slice-2-plan §2.1). Track THREAT owns this
// file after the slice 2 foundation; UI reads it for the TRACE meter, the LANDING REPORT's TRACE line and the PACKET's
// chips, and THREAT's endShip applies tallyPreview's result. DOM-free and store-free.

// The beam-born hollow blocks in memory (04 §3.7): beam seeds, and blocks a beam-born block made by eating a file.
export function beamSeedsInMemory(memory: readonly Segment[]): HollowSegment[] {
  return memory.filter((seg): seg is HollowSegment => isHollow(seg) && seg.beam === true);
}

// The beam-born blocks that are a meal, not a seed (04 §3.7: "a seed that ate reports twice"): a file a beam seed ate. In
// the seeds act it is inert (data/threats.ts SEEDS_ONLY_DEF onlySeedsBite) but still reports home, so the strip asks for
// a DELETE of it too (data/threat-rules.ts).
export function beamEatenInMemory(memory: readonly Segment[]): HollowSegment[] {
  return beamSeedsInMemory(memory).filter((seg) => seg.seed !== true && !seg.root);
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

// `> keep 20 charge for me…` is due on this ship (05 §3.5 'wants-charge', slice-2-plan risk 6): HOLLOW is aboard and the
// ship is one hop from a final ship (run.threat.current, the verdict's facts), so MERGE's price is said one ship before
// MERGE. Not yet told this run. The slice 3 seam: the map's M3 query sets oneHopFromFinal.
export function keepChargeDue(state: Readonly<GameState>): boolean {
  const threat = state.run.threat;
  return threat.aboard && threat.current?.oneHopFromFinal === true && !threat.told.keepCharge;
}

// No working rm in memory (04 §3.3): no usable DELETE file that is not being eaten. Information only: the last-rm stamp
// and echo, `NO RM · YOU CAN'T DELETE THE ROOT` on the PACKET, and the no-rm seed line.
export function noWorkingRm(state: Readonly<GameState>): boolean {
  return !hasUsableTool(state.memory, 'delete', 'excluded');
}

// The COPY lesson's moment (slice-2-plan risk 12, data/script.ts COPY_LESSON_RULES): a hollow block's reach (a seed's
// included) stands beside one of your filesystem tools across less than a WALL, and that tool has no spare (no other
// working copy of its kind), so one bite would take the tool for good. The first such tool in reach order, or null.
// Never keyed on a `NEEDED FOR THE FINALE` tag (round 3, 9). Pure.
export function huntedToolWithoutSpare(state: Readonly<GameState>): FsToolSegment | null {
  const { memory } = state;
  for (let index = 0; index < memory.length; index++) {
    if (!isHollow(memory[index]!)) continue;
    for (const step of [-1, 1] as const) {
      let cursor = index + step;
      let gap = 0;
      for (; cursor >= 0 && cursor < memory.length && memory[cursor]!.type === 'free'; cursor += step) gap += memory[cursor]!.size;
      const neighbour = memory[cursor];
      if (gap >= WALL_MIN_BLOCKS || neighbour === undefined || neighbour.type !== 'fs-tool') continue;
      const spares = toolFilesOf(memory, neighbour.fsTool).filter((copy) => copy !== neighbour && isUsableTool(copy));
      if (spares.length === 0) return neighbour;
    }
  }
  return null;
}

// The COPY lesson is due (risk 12; data/script.ts toolsHunted reads it, with COPY licensed): a tool HOLLOW can reach has
// no spare (huntedToolWithoutSpare), or a HUNT stage's seeds, which aim at your tools, are blinking or have landed, or
// (the review's minor 5: the one moment the fixed five reliably give it) a verb has telegraphed `unlink` on Repair's last
// spare on this ship (HollowState.unlinkedLastSpare, LAST LIGHT; latched, so the lesson follows the verb's BLOCK IT line).
export function copyLessonDue(state: Readonly<GameState>): boolean {
  const hollow = state.hollow;
  const huntSeeds = hollow.cfg.seed?.target === 'near-tools' && (hollow.seedTelegraph !== null || hollow.seedsLanded > 0);
  return huntSeeds || hollow.unlinkedLastSpare || huntedToolWithoutSpare(state) !== null;
}

// Slice 5's hook (a corrupted resident wakes after it): HOLLOW is aboard and its first fight on this ship has been decided:
// the scripted bite cured or eaten, or nobody there to bite (systems/hollow.ts decideScript clears scriptTargetId as it
// wakes or goes dormant), or a timed wake's first bite has landed. Asleep (before the loop closes, before a timed wake),
// or with the scripted target still being fought over, it is not.
export function hollowFirstFightDecided(state: Readonly<GameState>): boolean {
  const hollow = state.hollow;
  return state.run.threat.aboard && hollow.phase !== 'asleep' && hollow.scriptTargetId === null;
}
