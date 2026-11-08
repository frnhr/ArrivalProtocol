// Slice 3c: Track WORLD owns this file (docs/phase3/impl/slice-3c-plan.md §5.1); SAVE and UI request changes by message.
import type { GameState } from '@state/schema';
import type { RunLineage } from '@systems/meta';
import { shipDefOf, type ShipDef } from '@data/ships';
import { freshArmState, armContent } from '@systems/map-update';
import type { ArmState } from '@/types/lineage';
import { rollNoiseClouds } from '@systems/map-noise';
import { FIRST_SLOT } from '@data/arm';
import type { Hop, RunMapState, ShipSummary } from '@/types/map';
import type { MapHistory } from '@/types/lineage';
import { WORLDS } from '@data/arm';
import { RUN_START_YEAR, COLONISTS_PER_POD, RUN1_SHIP_LAUNCH_YEAR } from '@data/tuning';
import { currentSlot, armShipAt, worldSlotOf, noiseRng } from '@systems/map-streams';
import { MAP_STATE_VERSION, EMPTY_HISTORY } from '@data/map-state';

export {
  currentStop, currentSlot, armShipAt, armShipId, shipKeyOf, keyRng, shipRng, visitRng, hopRng, worldSlotOf, isEndSlot,
  noiseRng,
} from '@systems/map-streams';

// The run on its map (phase 3 slice 3a, slice-3a-plan §2.2, §2.5): which ship the unit is on and how a ship's ShipDef is
// found (the route position and the random streams live in systems/map-streams.ts, re-exported here). Every read that
// means "which ship" goes through currentShip(state) or shipDefAt(map, slot), never an index into a fleet: on the arm the
// route's position (run.shipIndex = depth − 1) and the ship's slot differ. (Track RETIRE retired the classic five's world.)
// Track GEN owns this file after the foundation (createRunMap, the arm's shipDefAt).

// The map a NEW RUN starts on (systems/run.ts startRun, state/instance.ts's first page): the run number is the lineage's
// wave (1 on run 1).
// • A stored arm (`lineage.arm`, the world update's output kept in the archive, slice 3c): its ships, start year and arm
//   seed as they are; its run must be the wave and its content this build's (the archive resets a stale arm first, and
//   systems/meta.ts lineageOf hands a run only its own wave's arm, so a mismatch here is a bug).
// • Else run 1: run 1's arm (§3.14's structure, details rolled from the arm seed: map-generator assembleRun1Arm), from
//   RUN_START_YEAR.
// • Else (a suite's run ≥ 2, `__ap.runNumber`): a fresh roll for the run (map-update freshArmState), from RUN_START_YEAR,
//   its final ship named by serial run − 1 (3a's interim), which the history records so the next update names on from it.
// The arm seed is the archive's (`lineage.armSeed`; null or left out, the run seed: the suites' worlds and a headless
// archive, so their run-1 arm is the one they always had). The noise clouds roll fresh every run, from the run seed (02:
// noise per run). The map's history: the lineage's last unit, colonies and routes (left out: none), and the arm's own gap,
// valve years, serial and departures, read off the arm (review fix, minor 5: never copied beside it, so nothing can
// disagree at the page's open).
export function createRunMap(
  lineage: Readonly<Pick<RunLineage, 'wave'> & Partial<Pick<RunLineage, 'armSeed' | 'arm' | 'history'>>>, seed: number,
): RunMapState {
  const run = lineage.wave;
  if (!(Number.isInteger(run) && run >= 1)) throw new Error(`createRunMap: run ${run}`);
  const kept = lineage.history ?? EMPTY_HISTORY;
  const base = { lastUnitNumber: kept.lastUnitNumber, colonies: structuredClone(kept.colonies), routes: structuredClone(kept.routes) };
  const stored = lineage.arm ?? null;
  let arm: Pick<ArmState, 'armSeed' | 'startYear' | 'ships'>;
  let history: MapHistory;
  if (stored !== null) {
    if (stored.run !== run) throw new Error(`createRunMap: the stored arm is for run ${stored.run}, the lineage's wave is ${run}`);
    if (JSON.stringify(stored.content) !== JSON.stringify(armContent())) {
      throw new Error(`createRunMap: the stored arm was made by content ${JSON.stringify(stored.content)}, this build is ${JSON.stringify(armContent())}`);
    }
    arm = { armSeed: stored.armSeed, startYear: stored.startYear, ships: structuredClone(stored.ships) };
    history = {
      ...base, gap: stored.gap, valveYears: stored.valveYears, finalSerial: stored.finalSerial, departures: structuredClone(stored.departures),
    };
  } else {
    const armSeed = (lineage.armSeed ?? seed) >>> 0;
    const fresh = freshArmState(armSeed, run, RUN_START_YEAR, null);
    history = { ...base, gap: 0, valveYears: 0, finalSerial: run > 1 ? fresh.finalSerial : 0, departures: [] };
    arm = fresh;
  }
  return {
    version: MAP_STATE_VERSION, world: 'arm', run, armSeed: arm.armSeed >>> 0, startYear: arm.startYear, arm: arm.ships,
    noise: rollNoiseClouds(noiseRng(seed >>> 0)),
    route: [{ slot: FIRST_SLOT, depth: 1, hop: null }], galaxyYear: arm.startYear, pendingExtra: null,
    history,
  };
}

// --- Where the unit is -------------------------------------------------------------------------------------------------

// The map with the unit arriving on `slot` by `hop` (startShip): the stop is pushed onto the route.
export function mapAtShip(map: Readonly<RunMapState>, slot: number, hop: Hop | null): RunMapState {
  if (hop === null || hop.to !== slot) throw new Error(`mapAtShip: the arm needs the hop that reaches slot ${slot}`);
  const next = structuredClone(map) as RunMapState;
  next.route.push({ slot, depth: map.route.length + 1, hop });
  next.galaxyYear = hop.approachYear;
  next.pendingExtra = null;
  return next;
}

// The map with the unit back on the route's first ship (the run-1 simulation retry: ship 1 again, as the run began it).
export function mapAtFirstShip(map: Readonly<RunMapState>): RunMapState {
  const next = structuredClone(map) as RunMapState;
  next.route = next.route.slice(0, 1);
  next.galaxyYear = map.startYear;
  next.pendingExtra = null;
  return next;
}

// --- Which ship ---------------------------------------------------------------------------------------------------------

// The ShipDef in `slot`: the ship built from its ArmShip (data/ships.ts shipDefOf, pure and memoized: Track GEN).
export function shipDefAt(map: Readonly<RunMapState>, slot: number): ShipDef {
  return shipDefOf(armShipAt(map, slot));
}

// What the desk, the PACKET, the strip and the RUN TALLY may read of the ship in `slot` (review follow-up B1): from its
// ArmShip and world, so nothing that shows a ship needs it built. The desk models read only this.
export function shipSummaryAt(map: Readonly<RunMapState>, slot: number): ShipSummary {
  const worldSlot = worldSlotOf(map, slot);
  const world = WORLDS[worldSlot]!;
  const ship = armShipAt(map, slot);
  return {
    slot, worldSlot, name: ship.name, world: world.name, kind: ship.kind, template: ship.template,
    modifiers: [...ship.modifiers],
    layer: world.layer, pods: ship.pods, colonists: ship.pods * COLONISTS_PER_POD, memoryClass: ship.memoryClass,
    final: ship.kind === 'final', approachYear: ship.approachYear, late: ship.late,
    lzCount: ship.landing.lzs.length, forgiveness: ship.landing.forgiveness, terrain: ship.landing.terrain,
    noGoWords: ship.landing.noGo.map((arc) => arc.word), debrisRack: ship.debrisRack, authored: ship.authored,
    reserved: structuredClone(ship.reserved),
  };
}

// The ship being flown.
export function currentShip(state: Readonly<Pick<GameState, 'run'>>): ShipDef {
  return shipDefAt(state.run.map, currentSlot(state.run));
}

// Every ship the run counts as its fleet (RUN END's rows, the colonists it could have landed, PURGE's `n OF m SHIPS`): the
// ships visited (02 §4: the RUN TALLY has a row per visited ship; Track DESK owns the tally).
export function fleetOf(map: Readonly<RunMapState>): readonly ShipDef[] {
  return map.route.map((stop) => shipDefAt(map, stop.slot));
}

// The year an arm ship launched from SOL (slice 5, review m7; 05 §3.6: WARDEN's `aboard since 2240`, the sleeper's years
// asleep): run 1's ships in RUN1_SHIP_LAUNCH_YEAR, a ship a later run rolled as much later as that run started (its
// timedAgainstStart: the start year it was rolled against, written only at its roll; a re-timed ship is a new roll). Throws
// on a slot the arm does not have.
export function shipLaunchYear(map: Readonly<RunMapState>, slot: number): number {
  const ship = map.arm[slot];
  if (ship === undefined) throw new Error(`shipLaunchYear: no ship in slot ${slot}`);
  return RUN1_SHIP_LAUNCH_YEAR + (ship.timedAgainstStart - RUN_START_YEAR);
}
