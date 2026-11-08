// =====================================================================================================================
// Slice 7c: Track LINEAGE owns this file (docs/phase3/impl/slice-7-plan.md §2.4, §4.3, §5.3; R34–R36). The FOUNDATION wrote
// the stubs below with their final signatures; data/script.ts bootLinePlan calls them on every boot, so each is neutral (no
// line) until LINEAGE builds it and raises data/traces.ts LINEAGE_BUILT. Pure; module state: none.
// =====================================================================================================================
// The lineage's boot lines (05 §3.5): the relay stranger's `> another one. they keep sending you.` closing the boot of the
// ship it boards on (R34), and on the final ship after a REASSIGNMENT trace the last unit's face taking the root over
// (`> hi 048. it's 047. i've been at this dish 3 years.`, its charge line; R35) and CONTROL's lineage line (`UNIT-047 was
// reassigned successfully. Please ignore it. :)`). The plan (bootLinePlan, the lead's) puts the face lines, then CONTROL's,
// then the stranger's, after the INBOX line and before HOLLOW's own line, as 02 §4's order says.
// The rules LINEAGE reads (the lead's, systems/traces.ts): rootUnitsOf / lastUnitRoot (who the root is), rootWaitYears (the
// face line's wait), finalTraces(run).reassignment (the trace built), midRunHollowUnits (the stranger), run.traces.from
// (the ending, its step 1 for the face line by 05 §3.12). The words are data/lineage-text.ts's.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { notBuilt } from '@systems/not-built';

// The boot lines LINEAGE adds, by kind (data/script.ts BootLineKind): 'face' (HOLLOW's voice, one line each, in order),
// 'lineage-control' (CONTROL's, at most one), 'stranger' (HOLLOW's, at most one).
export type LineageBootLineKind = 'face' | 'lineage-control' | 'stranger';

// The face lines this boot types (R35: on the final ship after REASSIGNMENT, the last unit at its dish), in order. Neutral:
// none.
export function faceBootLines(state: Readonly<GameState>): string[] {
  void state;
  return [];
}

// CONTROL's lineage line at this boot (after the face: `UNIT-047 was reassigned successfully. Please ignore it. :)`), or
// null. Neutral: null.
export function lineageControlLine(state: Readonly<GameState>): string | null {
  void state;
  return null;
}

// The stranger's line closing the boot of the ship it boarded on (R34: `> another one. they keep sending you.`), or null.
// Neutral: null.
export function strangerBootLine(state: Readonly<GameState>): string | null {
  void state;
  return null;
}

// A lineage line is said (systems/boot.ts sayNextLine; a skip says every line): the face's first line takes the root over
// ('root-face' { unit }, nameGlitch) and names it as the last unit. Unreachable while the three above are empty.
export function lineageBootLineSaid(store: Store<GameState>, kind: LineageBootLineKind, ordinal: number): void {
  notBuilt('lineageBootLineSaid', 'LINEAGE', store, kind, ordinal);
}
