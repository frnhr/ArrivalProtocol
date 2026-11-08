// Slice 7a: Track FINALE owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.1, §4.1, §5.1): the
// FINALE's rules, pure (no store, no module state): THE EMPTY SHIP (R8), STAY's ships (R9), each option's state on the card
// (R11), the ending record the archive keeps (R3) and the run's cause (R17), and the report's ending line. Track CARD reads
// optionState; Track NIGHT reads endingRecordOf while run.phase is 'end' (the hollow and landing slices are still the final
// ship's then).
// The FOUNDATION built endingRecordOf and finaleRunCause (the archive and run.ts read them from the first commit); the
// rest are neutral stubs: optionState answers WP11's card (PURGE open, MERGE by its price, REASSIGNMENT open, every other
// option hidden), emptyShip says no, stayCandidates and reportEndingLine say nothing.
import type { GameState, RunEndCause } from '@state/schema';
import type { EndingPiece, EndingRecord } from '@/types/ending';
import { chargeLeft, hasUsableTool } from '@state/selectors';
import { currentSlot } from '@systems/map-streams';
import { shownFuelPct } from '@systems/flight-hud';
import { FS_TOOL_KINDS } from '@data/fs-tools';
import { HOLLOW_FINALE } from '@data/hollow-text';
import { MERGE_COST_CHARGE } from '@data/tuning';

// THE EMPTY SHIP (R8): the final ship in orbit after its landing (ORBIT LOCKED or ACCEPT ORBIT), no pod aboard (a parked
// pod counts as released), and FUEL as shown at the landing's end ≥ EMPTY_SHIP_FUEL_PCT. `fuelPct` is that FUEL (null
// before the landing ended).
export interface EmptyShip {
  ok: boolean;
  fuelPct: number | null;
}

export function emptyShip(state: Readonly<GameState>): EmptyShip {
  void state;
  return { ok: false, fuelPct: null };
}

// A ship whose colony STAY may mount (R9): every ship of this run whose pods landed ★ ON TARGET (its ShipResult.pods; the
// final ship by its live tally), newest first. `slot`: the arm slot (the route index on the classic world).
export interface StayCandidate {
  slot: number;
  shipName: string;
  colony: string;
  year: number;
}

export function stayCandidates(state: Readonly<GameState>): StayCandidate[] {
  void state;
  return [];
}

// An option's state on the card (R11):
// • open: the kid can take it now;
// • needs: out of reach, greyed, with its need line (`NEEDS FUEL 20% · you have 12%`); `named` when it was ever chosen
//   before (the archive's endingsSeen), else the card reads `???`;
// • hidden: not on the card (CONTACT before 7d; the FOUNDATION's answer for every row not yet built).
export type OptionState =
  | { kind: 'open' }
  | { kind: 'needs'; need: string; named: boolean }
  | { kind: 'hidden' };

export function optionState(state: Readonly<GameState>, piece: EndingPiece, seen: readonly EndingPiece[]): OptionState {
  switch (piece) {
    case 'purge':
    case 'reassignment':
      return { kind: 'open' };
    case 'merge': {
      const have = chargeLeft(state);
      return have >= MERGE_COST_CHARGE ? { kind: 'open' } : { kind: 'needs', need: HOLLOW_FINALE.mergeNeeds(have), named: seen.includes(piece) };
    }
    default:
      return { kind: 'hidden' };
  }
}

// How the run ends after the final ship's LANDING REPORT (systems/run.ts continueAfterReport; R17): by step 1. The
// FINALE must be decided ('done').
export function finaleRunCause(state: Readonly<GameState>): RunEndCause {
  const finale = state.hollow.finale;
  if (finale.phase !== 'done' || finale.hollow === null) throw new Error(`finaleRunCause: the finale is '${finale.phase}', not decided`);
  switch (finale.hollow) {
    case 'purge': return 'won-purge';
    case 'merge': return 'won-merge';
    case 'spare': return 'won-spare';
    case 'followed': return 'unresolved';
    default: throw new Error(`finaleRunCause: unknown fate '${String(finale.hollow)}'`);
  }
}

// The ending record of a decided FINALE (R3; the archive's LastUnit.ending, written at RUN END by systems/meta.ts
// archiveRunEnded), or null: the run was lost or abandoned on the way (no final ship, or its FINALE not decided). Read
// while the final ship's slices are still the world's (its report, RUN END).
export function endingRecordOf(state: Readonly<GameState>): EndingRecord | null {
  const finale = state.hollow.finale;
  if (!state.landing.finalShip || finale.phase !== 'done') return null;
  if (finale.hollow === null || finale.you === null) throw new Error('endingRecordOf: a decided FINALE without both choices');
  const arm = state.run.map.world === 'arm';
  let stay: EndingRecord['stay'] = null;
  if (finale.you === 'stay') {
    const candidate = stayCandidates(state).find((ship) => ship.slot === finale.stay);
    if (candidate === undefined) throw new Error(`endingRecordOf: STAY's ship ${String(finale.stay)} is not a candidate`);
    stay = { slot: candidate.slot, colony: candidate.colony, year: candidate.year };
  }
  const shipFuel = finale.hollow === 'spare' || finale.you === 'sunset';
  return {
    hollow: finale.hollow,
    you: finale.you,
    rootUnits: [...state.run.hollowUnits],
    finalSlot: arm ? currentSlot(state.run) : null,
    finalShip: state.level.shipName,
    finalYear: arm ? state.run.map.galaxyYear : null,
    stay,
    kit: FS_TOOL_KINDS.filter((kind) => hasUsableTool(state.memory, kind, 'counts')),
    fuelPct: shipFuel ? shownFuelPct(state.landing.fuelAtEndPct ?? state.burn.fuelPct) : null,
    charge: chargeLeft(state),
  };
}

// The final LANDING REPORT's ending line under the colony (`ENDING · PURGE · STAND BY`; the words are data/finale-text.ts's),
// or null: not the final ship, or no line (the FOUNDATION's stub: none).
export function reportEndingLine(state: Readonly<GameState>): string | null {
  void state;
  return null;
}
