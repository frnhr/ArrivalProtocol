// Slice 7b: the lead owns this file's MERGE lines (slice-7-plan.md §4.2): restoredDriver, lastLandingPods and the gated
// mergeRestorable and `NOW:` (data/last-landing.ts LAST_LANDING_BUILT, Track DROP's line).
// Slice 7a: Track FINALE owns this file after the FOUNDATION (docs/phase3/impl/slice-7-plan.md §2.1, §4.1, §5.1): the
// FINALE's rules, pure (no store, no module state): THE EMPTY SHIP (R8), STAY's ships (R9), each option's state on the card
// (R11), the ending record the archive keeps (R3) and the run's cause (R17), and the report's ending line. Track CARD reads
// optionState; Track NIGHT reads endingRecordOf while run.phase is 'end' (the hollow and landing slices are still the final
// ship's then).
import type { GameState, RunEndCause, ShipResult } from '@state/schema';
import type { EndingPiece, EndingRecord, HollowFate, YouChoice } from '@/types/ending';
import type { RunMapState } from '@/types/map';
import type { DriverSegment } from '@/types/segment';
import type { PodRecord } from '@/types/landing';
import { chargeLeft, hasUsableTool, integrityState, isHollow } from '@state/selectors';
import { currentSlot } from '@systems/map-streams';
import { shownFuelPct } from '@systems/flight-hud';
import { onTargetTally, onTargetEarned } from '@systems/landing-rules';
import { FS_TOOL_KINDS } from '@data/fs-tools';
import { FINALE_TEXT } from '@data/finale-text';
import { ENDING_TITLE } from '@data/epilogue-text';
import { ENDINGS_BUILT, endingTitleKey } from '@data/endings';
import { LAST_LANDING_BUILT } from '@data/last-landing';
import { driverName } from '@data/landing-text';
import { driverSegId } from '@data/pod-ids';
import { DRIVER_BLOCKS, EMPTY_SHIP_FUEL_PCT, MERGE_COST_CHARGE, MERGE_DRIVER_INTEGRITY, STAY_PICK_MAX } from '@data/tuning';

// THE EMPTY SHIP (R8): the final ship in orbit after its landing (ORBIT LOCKED or ACCEPT ORBIT), no pod aboard (a parked
// pod counts as released), and FUEL as shown at the landing's end ≥ EMPTY_SHIP_FUEL_PCT. `fuelPct` is that FUEL (null
// before the landing ended).
// `inOrbit` and `aboard` say which part is missing (the need line): the ship is not in its orbit after the landing, or a
// pod is still aboard or falling.
export interface EmptyShip {
  ok: boolean;
  fuelPct: number | null;
  inOrbit: boolean;
  aboard: boolean;
}

export function emptyShip(state: Readonly<GameState>): EmptyShip {
  const { landing, burn } = state;
  const ended = landing.ended !== null;
  const inOrbit = landing.finalShip && ended && (burn.status === 'locked' || burn.status === 'accepted');
  const aboard = landing.pods.some((record) => record.fate.kind === 'aboard' || record.fate.kind === 'falling');
  const fuelPct = ended && landing.fuelAtEndPct !== null ? shownFuelPct(landing.fuelAtEndPct) : null;
  return { ok: inOrbit && !aboard && fuelPct !== null && fuelPct >= EMPTY_SHIP_FUEL_PCT, fuelPct, inOrbit, aboard };
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

// A ship of the run is ★ ON TARGET by its pods (R9): landing-rules onTargetEarned, the one ★ rule (review m2), over its
// summaries (a pod down soft in an LZ with room counts). Exported for the save codec's STAY check (a ship of run.ships
// named by the record must be one).
export function shipOnTarget(result: Readonly<Pick<ShipResult, 'pods'>>): boolean {
  let colonists = 0;
  let onTarget = 0;
  for (const pod of result.pods) {
    colonists += pod.colonists;
    if (pod.fate === 'down' && pod.place === 'lz' && pod.touch === 'soft') onTarget += pod.colonists;
  }
  return onTargetEarned(onTarget, colonists);
}

export function stayCandidates(state: Readonly<GameState>): StayCandidate[] {
  const ships: StayCandidate[] = [];
  const map = state.run.map;
  const named = (colony: string | null, shipName: string): string => {
    if (colony === null) throw new Error(`stayCandidates: ${shipName} is ★ ON TARGET with no colony`);
    return colony;
  };
  // The final ship by its live tally (R9), while it is still the ship being landed (its result is not recorded yet).
  const slot = currentSlot(state.run);
  const recorded = state.run.ships.some((ship) => ship.slot === slot);
  if (state.landing.finalShip && !recorded && onTargetTally(state).earned) {
    ships.push({ slot, shipName: state.level.shipName, colony: named(state.landing.colony, state.level.shipName), year: routeYear(map, slot) });
  }
  for (const result of [...state.run.ships].reverse()) {
    if (!shipOnTarget(result)) continue;
    ships.push({ slot: result.slot, shipName: result.shipName, colony: named(result.colony, result.shipName), year: routeYear(map, result.slot) });
  }
  return ships.slice(0, STAY_PICK_MAX);
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

// THE LAST LANDING's pods (7b; R25, 01 §3.17): every pod of this ship whose driver HOLLOW ate and which is still in the
// ship's orbit, aboard or parked restorable. A pod whose driver died some other way stays parked; one the ship took out of
// orbit is gone with it. Read before MERGE's confirm (the confirm clears their driverLost: finale.restored keeps them).
export function lastLandingPods(state: Readonly<GameState>): number[] {
  const inOrbit = (record: Readonly<PodRecord>): boolean => record.fate.kind === 'aboard' || (record.fate.kind === 'parked' && record.fate.restorable);
  return state.landing.pods.filter((record) => record.driverLost === 'eaten' && inOrbit(record)).map((record) => record.pod);
}

// A driver HOLLOW ate, back from its pod's record (the pod outlived it), at MERGE_DRIVER_INTEGRITY: in place in memory (7a's
// interim, finale.ts mergeIn) or by radio (7b: landing.lastLanding.drivers, never in memory, R24).
export function restoredDriver(record: Readonly<PodRecord>): DriverSegment {
  return {
    id: driverSegId(record.pod),
    name: driverName(record.pod, record.family),
    type: 'driver',
    size: DRIVER_BLOCKS,
    integrity: MERGE_DRIVER_INTEGRITY,
    state: integrityState(MERGE_DRIVER_INTEGRITY),
    pod: record.pod,
    family: record.family,
    colonists: record.colonists,
    featured: structuredClone(record.featured),
  };
}

// The drivers MERGE would give back now. 7a's interim (R15): every pod whose driver HOLLOW ate on this ship and whose block
// still stands in memory (finale.ts restores those in place; a block the kid DELETEd is gone, and its pod stays parked).
// 7b, once its gate is raised: THE LAST LANDING's pods, by radio (lastLandingPods), whatever became of the blocks.
export function mergeRestorable(state: Readonly<GameState>): number[] {
  if (LAST_LANDING_BUILT) return lastLandingPods(state);
  const standing = new Set(state.memory.filter(isHollow).map((seg) => seg.atePod).filter((pod) => pod !== undefined));
  return state.landing.pods.filter((record) => record.driverLost === 'eaten' && standing.has(record.pod)).map((record) => record.pod);
}

// What an option out of reach shows (R11): its need line and meter, named when it was ever chosen before, else `???`.
function needs(piece: EndingPiece, seen: readonly EndingPiece[], need: string, price: PriceMeter | null): OptionState {
  return { kind: 'needs', need, named: seen.includes(piece), price };
}

// THE EMPTY SHIP's row (SPARE at step 1, SUNSET at step 2; R8): its FUEL meter (the tank as shown at the landing's end, the
// live tank before it), open when the ship is in orbit, empty and fuelled.
function emptyShipOption(state: Readonly<GameState>, piece: EndingPiece, seen: readonly EndingPiece[]): OptionState {
  const ship = emptyShip(state);
  const have = ship.fuelPct ?? shownFuelPct(state.burn.fuelPct);
  const price: PriceMeter = { kind: 'fuel', have, need: EMPTY_SHIP_FUEL_PCT };
  if (ship.ok) return { kind: 'open', price, now: null };
  if (!ship.inOrbit || ship.aboard) return needs(piece, seen, FINALE_TEXT.needs.shipInOrbit, price);
  return needs(piece, seen, FINALE_TEXT.needs.fuel(have), price);
}

// Each option as the card shows it now (R11; prices are judged when the card shows them, R7). `seen` is the archive's
// endingsSeen (the card's `???`); the rules' own checks pass [] (only the kind matters there).
// • PURGE, REASSIGNMENT: always open, free.
// • MERGE: MERGE_COST_CHARGE REPAIR CHARGE (its meter); `NOW:` names the drivers it would give back (R15's interim words).
// • SPARE: THE EMPTY SHIP. SUNSET: THE EMPTY SHIP, unless step 1's pick gave it to the root (`SPARE GIVES IT THE SHIP`, R8).
// • STAY: a ★ ON TARGET ship of this run (R9).
// • CONTACT: absent until 7d (R11).
export function optionState(state: Readonly<GameState>, piece: EndingPiece, seen: readonly EndingPiece[]): OptionState {
  switch (piece) {
    case 'purge':
    case 'reassignment':
      return { kind: 'open', price: null, now: null };
    case 'merge': {
      const have = chargeLeft(state);
      const price: PriceMeter = { kind: 'charge', have, need: MERGE_COST_CHARGE };
      if (have < MERGE_COST_CHARGE) return needs(piece, seen, FINALE_TEXT.needs.charge(have), price);
      const back = mergeRestorable(state).length;
      // 7b's gate: the pods land on their own (FINALE_TEXT.now); until it is raised the kid launches them (nowInterim).
      const now = LAST_LANDING_BUILT ? FINALE_TEXT.now : FINALE_TEXT.nowInterim;
      return { kind: 'open', price, now: back > 0 ? now(back) : null };
    }
    case 'spare':
      return emptyShipOption(state, piece, seen);
    case 'sunset':
      // Designer item 3: after SPARE the row says why, and it is named whenever its price was met (the empty ship was
      // there: SPARE's own price), never `???`.
      if (state.hollow.finale.hollow === 'spare') {
        return { kind: 'needs', need: FINALE_TEXT.needs.shipTaken, named: emptyShip(state).ok || seen.includes(piece), price: null };
      }
      return emptyShipOption(state, piece, seen);
    case 'stay':
      return stayCandidates(state).length > 0 ? { kind: 'open', price: null, now: null } : needs(piece, seen, FINALE_TEXT.needs.onTarget, null);
    case 'contact':
      if (!ENDINGS_BUILT.contact) return { kind: 'hidden' };
      throw new Error("optionState: CONTACT's row is 7d's (ENDINGS_BUILT.contact raised before its price was built)");
    default:
      throw new Error(`optionState: unknown piece '${String(piece)}'`);
  }
}

// CONTROL's one rule on an ending (review M2; 05 §3.8, R33): the unit is non-compliant exactly when it chose SPARE, SUNSET,
// STAY or CONTACT (nobody stood by at the end, or the root was given a ship); everything else is compliant, so MERGE +
// REASSIGNMENT and UNRESOLVED + REASSIGNMENT are. The FINALE's verdict, the epilogue's last line and 7c's wild seed read
// this, never their own copy.
export function controlCompliant(hollow: HollowFate, you: YouChoice): boolean {
  return hollow !== 'spare' && you !== 'sunset' && you !== 'stay' && you !== 'contact';
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

// The ending record as the confirm writes it (review M4, FINALE D11: systems/finale.ts, in the confirm's update, at
// 'verdict', after the apply: MERGE's charge spent, PURGE's blocks gone), from the world at that moment and the two choices (STAY's ship by `stay`).
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

// The ending's title (R23): by step 2, then step 1; STAY's names its colony. One place (review's architecture note): the
// report's ending line here and the final card (systems/epilogue.ts) both read it.
export function endingTitle(record: Readonly<EndingRecord>): string {
  return ENDING_TITLE[endingTitleKey(record.you, record.hollow)](record.stay?.colony ?? '');
}

// The final LANDING REPORT's ending line under the colony (`ENDING · PURGE · STAND BY`: data/finale-text.ts reportLine with
// the title from data/epilogue-text.ts ENDING_TITLE, NIGHT's words, review B1), or null: not the final ship, or its FINALE
// not decided. STAY + PURGE's title is the colony's (`RIVERSIDE'S MIND`, from the record).
export function reportEndingLine(state: Readonly<GameState>): string | null {
  const record = endingRecordOf(state);
  if (record === null) return null;
  const fate = record.hollow === 'followed' ? FINALE_TEXT.followedWord : FINALE_TEXT.word[record.hollow];
  return FINALE_TEXT.reportLine(fate, endingTitle(record));
}
