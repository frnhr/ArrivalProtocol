// Slice 7a: Track FINALE owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.1, §4.1, §5.1): the
// FINALE's rules, pure (no store, no module state): THE EMPTY SHIP (R8), STAY's ships (R9), each option's state on the card
// (R11), the ending record the archive keeps (R3) and the run's cause (R17), and the report's ending line. Track CARD reads
// optionState; Track NIGHT reads endingRecordOf while run.phase is 'end' (the hollow and landing slices are still the final
// ship's then).
// The FOUNDATION built finaleRunCause, endingRecordAt (the record frozen at the confirm, review M4) and endingRecordOf; the
// rest are neutral stubs: optionState answers WP11's card in the final shape (PURGE open, MERGE open or short by its charge
// meter, REASSIGNMENT open, every other option hidden), emptyShip says no, stayCandidates and reportEndingLine say nothing.
import type { GameState, RunEndCause } from '@state/schema';
import type { EndingPiece, EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import type { RunMapState } from '@/types/map';
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
// final ship by its live tally), newest first: `> mount <colony>` on the row names the first. `slot`: the arm slot (the
// route index on the classic world); `year`: its approach year (routeYear).
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

// A ship's approach year on the route (both worlds have real years: review m6); the first ship's is the run's start year.
export function routeYear(map: Readonly<RunMapState>, slot: number): number {
  const stop = map.route.find((candidate) => candidate.slot === slot);
  if (stop === undefined) throw new Error(`routeYear: slot ${slot} is not on the route`);
  return stop.hop?.approachYear ?? map.startYear;
}

// An option's price as the card's meter shows it (review M2): REPAIR CHARGE against MERGE's 20, FUEL against the empty
// ship's 20%, signals against CONTACT's 3. `have` and `need` in the meter's own unit.
export interface PriceMeter {
  kind: 'charge' | 'fuel' | 'signals';
  have: number;
  need: number;
}

// An option's state on the card (R11; review M2):
// • open: the kid can take it now; `price` its meter (null: free), `now` its `NOW:` line (MERGE's restored drivers, null
//   for the rest);
// • needs: out of reach, greyed, with its need line (`NEEDS FUEL 20% · you have 12%`) and its meter; `named` when it was
//   ever chosen before (the archive's endingsSeen), else the card reads `???`;
// • hidden: not on the card (CONTACT before 7d; the FOUNDATION's answer for every row not yet built).
export type OptionState =
  | { kind: 'open'; price: PriceMeter | null; now: string | null }
  | { kind: 'needs'; need: string; named: boolean; price: PriceMeter | null }
  | { kind: 'hidden' };

export function optionState(state: Readonly<GameState>, piece: EndingPiece, seen: readonly EndingPiece[]): OptionState {
  switch (piece) {
    case 'purge':
    case 'reassignment':
      return { kind: 'open', price: null, now: null };
    case 'merge': {
      const have = chargeLeft(state);
      const price: PriceMeter = { kind: 'charge', have, need: MERGE_COST_CHARGE };
      return have >= MERGE_COST_CHARGE ? { kind: 'open', price, now: null }
        : { kind: 'needs', need: HOLLOW_FINALE.mergeNeeds(have), named: seen.includes(piece), price };
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

// The ending record as the confirm writes it (review M4: systems/finale.ts, in the same update as 'done', after the apply:
// MERGE's charge spent, PURGE's blocks gone), from the world at that moment and the two choices (STAY's ship by `stay`).
export function endingRecordAt(state: Readonly<GameState>, hollow: HollowFate, you: YouChoice, stay: number | null): EndingRecord {
  if ((you === 'stay') !== (stay !== null)) throw new Error(`endingRecordAt: STAY's ship ${String(stay)} with step 2 '${you}'`);
  let stayed: EndingRecord['stay'] = null;
  if (stay !== null) {
    const candidate = stayCandidates(state).find((ship) => ship.slot === stay);
    if (candidate === undefined) throw new Error(`endingRecordAt: STAY's ship ${stay} is not a candidate`);
    stayed = { slot: candidate.slot, colony: candidate.colony, year: candidate.year };
  }
  const shipFuel = hollow === 'spare' || you === 'sunset';
  const slot = currentSlot(state.run);
  return {
    hollow,
    you,
    rootUnits: [...state.run.hollowUnits],
    finalSlot: state.run.map.world === 'arm' ? slot : null,
    finalShip: state.level.shipName,
    finalYear: state.run.map.galaxyYear,
    stay: stayed,
    kit: FS_TOOL_KINDS.filter((kind) => hasUsableTool(state.memory, kind, 'counts')),
    fuelPct: shipFuel ? shownFuelPct(state.landing.fuelAtEndPct ?? state.burn.fuelPct) : null,
    charge: chargeLeft(state),
  };
}

// The ending record of a decided FINALE (R3; the archive's LastUnit.ending, written at RUN END by systems/meta.ts
// archiveRunEnded): the one frozen at the confirm, or null: the run was lost or abandoned on the way (no final ship, or its
// FINALE not decided). A decided FINALE without its record is a bug.
export function endingRecordOf(state: Readonly<GameState>): EndingRecord | null {
  const finale = state.hollow.finale;
  if (!state.landing.finalShip || finale.phase !== 'done') return null;
  if (finale.record === null) throw new Error('endingRecordOf: a decided FINALE without its record');
  return finale.record;
}

// The final LANDING REPORT's ending line under the colony (`ENDING · PURGE · STAND BY`: data/finale-text.ts reportLine with
// the title from data/epilogue-text.ts ENDING_TITLE, NIGHT's words, review B1), or null: not the final ship, or no line (the
// FOUNDATION's stub: none).
export function reportEndingLine(state: Readonly<GameState>): string | null {
  void state;
  return null;
}
