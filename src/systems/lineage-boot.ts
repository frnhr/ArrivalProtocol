// =====================================================================================================================
// Slice 7c: Track LINEAGE owns this file (docs/phase3/impl/slice-7-plan.md §2.4, §4.3, §5.3; R34–R36). data/script.ts
// bootLinePlan calls the three line rules on every boot (the plan is made once, at the boot's first tick, and each line is
// rendered from the live state as it is typed), so each rule reads only what the boot does not change. Pure but for
// lineageBootLineSaid; module state: none. Every line waits for data/traces.ts LINEAGE_BUILT, and plays on the arm only (the
// classic world's boots are frozen, and it holds no traces).
// =====================================================================================================================
// The lineage's boot lines (05 §3.5): the relay stranger's `> another one. they keep sending you.` on the boot of the ship
// it boards on (R34), and on the final ship after a REASSIGNMENT trace the last unit's face taking the root over (its
// step-1 line, then its wait and charge; R35) and CONTROL's lineage line (`UNIT-047 was reassigned successfully. Please
// ignore it. :)`; at a wild dish, `Your predecessor is non-compliant. Please be compliant. :)`). The plan puts the face
// lines, then CONTROL's, then the stranger's, after the INBOX line and before HOLLOW's own line, as 02 §4's order says.
// The rules read (the lead's, systems/traces.ts): lastUnitRoot (the root it is), rootWaitYears (the face line's wait),
// finalTraces(run) (REASSIGNMENT and the wild dish, each held and built), onFinalShip; run.traces.from (its step 1 for the
// face line by 05 §3.12). The words are data/lineage-text.ts's.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { emit } from '@systems/events';
import { nameHollow } from '@systems/hollow';
import { finalTraces, lastUnitRoot, onFinalShip, rootWaitYears } from '@systems/traces';
import { LINEAGE_TEXT, strangerOf } from '@data/lineage-text';
import { FRESH_UNIT_CHARGE } from '@data/memory';

// The boot lines LINEAGE adds, by kind (data/script.ts BootLineKind): 'face' (HOLLOW's voice, one line each, in order),
// 'lineage-control' (CONTROL's, at most one), 'stranger' (HOLLOW's, at most one).
export type LineageBootLineKind = 'face' | 'lineage-control' | 'stranger';

function lineagePlays(state: Readonly<GameState>): boolean {
  return state.run.map.world === 'arm';
}

// The last unit's face is due at this boot (R35): the final ship, after a REASSIGNMENT trace (held and built: the root is the
// last unit there, systems/traces.ts rootUnitsOf). Its ending, or null.
function faceFrom(state: Readonly<GameState>): NonNullable<GameState['run']['traces']['from']> | null {
  const run = state.run;
  const from = run.traces.from;
  if (!lineagePlays(state) || from === null || !onFinalShip(run) || !finalTraces(run).reassignment) return null;
  return from;
}

// The face lines this boot types, in order: its step 1's line (05 §3.12), then the wait and the charge (05 §3.5). None
// off the final ship, or with no REASSIGNMENT trace.
export function faceBootLines(state: Readonly<GameState>): string[] {
  const from = faceFrom(state);
  if (from === null) return [];
  const next = state.run.unitNumber;
  const rooted = from.ending.rootUnits;
  const years = rootWaitYears(state.run);
  if (years === null) throw new Error('faceBootLines: a face with no ending to wait from');
  const step1 = from.ending.hollow;
  const first = step1 === 'merge'
    ? LINEAGE_TEXT.faceByStep1.merge(next, lastUnitRoot(from))
    : step1 === 'followed'
      ? LINEAGE_TEXT.faceByStep1.followed(next, from.unit)
      : LINEAGE_TEXT.faceByStep1[step1](next, from.unit, rooted);
  return [first, LINEAGE_TEXT.faceWait(years, FRESH_UNIT_CHARGE, lastUnitRoot(from).length > 1)];
}

// CONTROL's lineage line at this boot, or null: after the face, the last unit reassigned (R35); else on a final ship whose
// dish runs wild (a non-compliant trace held and built, R33: its wild seed comes in at this boot), the predecessor.
export function lineageControlLine(state: Readonly<GameState>): string | null {
  const from = faceFrom(state);
  if (from !== null) return LINEAGE_TEXT.reassigned(from.unit);
  if (!lineagePlays(state) || !onFinalShip(state.run) || !finalTraces(state.run).wild) return null;
  return LINEAGE_TEXT.nonCompliant;
}

// The stranger's line on the boot of the ship it boarded on (R34; arrival.boarded: the 108% unpack), or null. Only a relay
// stranger says it (data/lineage-text.ts strangerOf: never run 1's 046, nor a last unit a v7 run kept), and never at a boot
// whose root the last unit's face takes over (its line would answer the face).
export function strangerBootLine(state: Readonly<GameState>): string | null {
  const arrival = state.run.arrival;
  if (!lineagePlays(state) || arrival === null || arrival.boarded === null) return null;
  if (strangerOf(state.run.hollowUnits) === null || faceFrom(state) !== null) return null;
  return LINEAGE_TEXT.stranger;
}

// A lineage line is said (systems/boot.ts sayNextLine; a skip says every line). The face's first line takes the root over:
// 'root-face' { unit } (its nameGlitch cue). The root's blocks are the last unit's already (they were laid out with
// say.ts hollowLabel, which reads rootUnitsOf on the final ship), so nothing in the store changes. CONTROL's and the
// stranger's lines only speak.
export function lineageBootLineSaid(store: Store<GameState>, kind: LineageBootLineKind, ordinal: number): void {
  if (!(Number.isInteger(ordinal) && ordinal >= 0)) throw new Error(`lineageBootLineSaid: ordinal ${ordinal}`);
  const state = store.getState();
  if (kind === 'face') {
    const from = faceFrom(state);
    if (from === null || ordinal >= faceBootLines(state).length) throw new Error(`lineageBootLineSaid: face line ${ordinal} is not due at this boot`);
    if (ordinal === 0) {
      // The face says who it is (`it's 047`): a root no story beat named this run is named now, as it speaks (the 7c
      // review: its blocks read `???` under a face that had just named itself).
      nameHollow(store);
      emit('root-face', { unit: from.unit });
    }
    return;
  }
  if (kind === 'lineage-control' ? lineageControlLine(state) === null : strangerBootLine(state) === null) {
    throw new Error(`lineageBootLineSaid: a '${kind}' line that is not due at this boot`);
  }
}
