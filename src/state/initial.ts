import type { GameState, RunPhase, RunState, SoulsState, PrinterState, HollowState, RunStats, ArchiveState, HazardsState } from './schema';
import type { Segment } from '@/types/segment';
import { buildShipMemory, clusterCode, hurtClusterFor, type CarriedRacks, type HurtCluster } from '@data/memory';
import { getShip, type ShipDef } from '@data/ships';
import { createFlight, createMissionMeta, createClockState } from '@data/mission';
import { childRng } from '@systems/rng';
import { hollowLabel } from '@systems/say';
import { flightModsOf } from '@systems/capabilities';
import { resolveZones } from '@systems/zones';
import { FIRST_RUN_LINEAGE, playsTutorial, type RunLineage } from '@systems/meta';
import { MERGE_BONUS_CORE_CAPACITY } from '@data/tuning';

export interface InitialStateOpts {
  seed: number;
  shipIndex?: number;
  // The page opens on the title card ('title'). Headless harnesses fly straight away, so a
  // state built without a phase is already in 'flight'.
  phase?: RunPhase;
  // The session's reduced-motion choice (the page reads prefers-reduced-motion; tests omit it).
  reducedMotion?: boolean;
  // The unit's own files on a ship that does not meet a fresh unit (every ship after ARES-VII): what
  // systems/carry.ts laid out. Required there (buildShipMemory throws without it); a test that flies a
  // later ship alone passes carry.ts freshUnitRacks(ship) explicitly.
  carried?: CarriedRacks | null;
  // Who this run's unit is, from the archive (WP8, systems/meta.ts): the page passes the archive's; a
  // headless world without one flies the first run (FIRST_RUN_LINEAGE), as an empty archive would.
  lineage?: Readonly<RunLineage>;
  // The page's archive status (state/instance.ts openRunArchive); a headless world has none ('none').
  archive?: ArchiveState;
}

export function createRunStats(): RunStats {
  return { manualCaptures: 0, demos: [], repairs: 0, moves: 0, deletes: 0, clustersLost: 0, clustersBitten: 0, capRefusals: 0, deal: null };
}

// A fresh run (§4.1): its unit, wave, last unit and HOLLOW from the archive's lineage (§4.5: UNIT-047 on
// wave 1 the first time), and the tutorial until a unit has flown ARES-VII through. SCAN comes with the
// unit; every other tool is licensed during the run
// (systems/licences). HOLLOW starts unnamed on every run: on a later run its ghost names it during the
// ship-1 boot (systems/boot.ts), on the first HALCYON does.
export function createRunState(seed: number, phase: RunPhase, shipIndex: number, lineage: Readonly<RunLineage>): RunState {
  return {
    rev: 0,
    phase,
    seed: seed >>> 0,
    unitNumber: lineage.unitNumber,
    wave: lineage.wave,
    lastUnit: lineage.lastUnit === null ? null : structuredClone(lineage.lastUnit),
    hollowUnits: [...lineage.hollowUnits],
    mergeBonus: lineage.mergeBonus,
    upgrades: [],
    tutorial: !lineage.tutorialDone,
    shipIndex,
    licences: ['scan'],
    hollowNamed: false,
    coreLost: false,
    skillTrainedOn: null,
    repairRenewedOn: null,
    ships: [],
    stats: createRunStats(),
    pendingStarCredit: 0,
    pendingStars: 0,
    simulationRetryUsed: false,
    beamOut: null,
    transit: null,
    arrival: null,
    endCause: null,
  };
}

// The slices that belong to one ship (§9 WP7 item 2: systems/run.ts resetWorldForShip assigns them in
// one update): the mission line, memory, both clocks, the flight, the archive, the printer and HOLLOW.
// `run` gives the seed, the ship, the unit and what HOLLOW is called by now.
export type ShipSlices = Pick<GameState, 'mission' | 'memory' | 'clock' | 'burn' | 'orbit' | 'level' | 'souls' | 'printer' | 'hollow' | 'hazards'>;

export function createShipSlices(run: Readonly<RunState>, carried: CarriedRacks | null): ShipSlices {
  const ship = getShip(run.shipIndex);
  const mission = createMissionMeta(ship, run.unitNumber, run.wave);
  // The tutorial run always meets the same ARES-VII families and its hurt C09 (§6.7); a returning unit meets
  // ship 1 reseeded, the hurt cluster too (never the lead, §5.2).
  const firstRun = playsTutorial(run);
  const hurt = hurtClusterFor(ship, firstRun, childRng(run.seed, run.shipIndex, 'hurt'));
  const memory = buildShipMemory(
    ship, carried, childRng(run.seed, run.shipIndex, ship.memory.souls.familiesSeedStream), firstRun,
    hollowLabel(run), hurt,
  );
  // The run after a MERGE (§4.5, WP11): the fresh unit's Core comes with the unit it merged with, a thread more. Set on
  // the unit ARRIVAL CONTROL builds (ship 1, and ship 1 again after the simulation); later ships carry this very Core.
  if (carried === null && run.mergeBonus) {
    const core = memory.find((seg) => seg.type === 'core');
    if (!core || core.type !== 'core') throw new Error('createShipSlices: a fresh unit with no AI Core');
    core.capacity = MERGE_BONUS_CORE_CAPACITY;
  }
  // The ship's hazard zones for this run (WP9): the written debris rack on the tutorial run, a seeded one later.
  const zones = resolveZones(ship.zones, ship.flight, firstRun, childRng(run.seed, run.shipIndex, 'zones'));
  // The carried upgrade files that work on arrival widen this ship's flight (FUEL TRIM, §6.9).
  const flight = createFlight(ship, childRng(run.seed, run.shipIndex, 'flight'), flightModsOf(memory), zones);
  mission.souls = memory.reduce((sum, seg) => sum + (seg.type === 'soul' ? seg.souls : 0), 0);
  return {
    mission,
    memory,
    clock: createClockState(),
    burn: flight.burn,
    orbit: flight.orbit,
    level: flight.level,
    souls: createSoulsState(ship, memory, hurt),
    printer: createPrinterState(ship),
    hollow: createHollowState(ship),
    hazards: createHazardsState(),
  };
}

// Nothing has hit the ship yet (WP9).
export function createHazardsState(): HazardsState {
  return { hitIds: [], debrisHits: [] };
}

// The archive starts sealed when the ship's data says so (ship 1: the STASIS reveal); an archive
// that arrives open has nothing left to reveal. `hurt` is the cluster the memory was built hurt with.
export function createSoulsState(ship: ShipDef, memory: readonly Segment[], hurt: HurtCluster | null): SoulsState {
  const sealed = memory.some((seg) => seg.type === 'soul' && seg.sealed);
  return {
    lead: clusterCode(ship.memory.souls.lead),
    hurt: hurt === null ? null : clusterCode(hurt.cluster),
    reveal: { stage: sealed ? 'sealed' : 'revealed', cause: null, lines: [] },
    results: [],
  };
}

// Opens the archive without the reveal: every cluster out of its slab, nothing left to reveal. For the
// simulation's ship 1 (the LOST card already showed the colonists) and for flight tests that fly past
// the run-1 STASIS step. (A returning unit's archive cracks open in its boot instead: reveal.ts 'known'.)
// Mutates `state` (a fresh state or a draft).
export function openArchive(state: GameState): void {
  for (const seg of state.memory) if (seg.type === 'soul') seg.sealed = false;
  state.souls.reveal = { stage: 'revealed', cause: null, lines: [] };
}

export function createPrinterState(ship: ShipDef): PrinterState {
  return { baseSec: ship.printBaseSec, progress: 0, waitAiSec: 0, lingerAiSec: null, printNext: null, fast: false };
}

// HOLLOW sleeps in its root until the ship's wake (systems/hollow.ts).
export function createHollowState(ship: ShipDef): HollowState {
  return {
    cfg: structuredClone(ship.hollow), phase: 'asleep', story: 'none', revealOwed: false, biteInSec: null, wakeAtAi: null,
    seedInSec: null, seedTelegraph: null, seedMoments: 0, seedsLanded: 0, wakeHeld: false, wakeHoldEndedAtAi: null,
    deal: createDealState(),
    verbInSec: null, verb: null, verbMoments: 0, verbsLanded: 0, verbsBlocked: 0, untriedTools: [], bitesAt: [],
    finale: { phase: 'none', restoredInPlace: [], restoredHalf: [], ending: null, unresolvedUntilAi: null },
  };
}

// THE DEAL before anything was offered (WP10).
export function createDealState(): HollowState['deal'] {
  return { phase: 'none', cluster: null, segId: null, startAddr: null, entryId: null, pauseUntilAi: null, hasteUntilAi: null };
}

// A complete, fresh GameState for one ship of a fresh run. The live store and every headless
// harness build their state here, so a test flies exactly the flight the page opens on.
export function createInitialState(opts: InitialStateOpts): GameState {
  const phase = opts.phase ?? 'flight';
  const run = createRunState(opts.seed, phase, opts.shipIndex ?? 0, opts.lineage ?? FIRST_RUN_LINEAGE);
  return {
    ...createShipSlices(run, opts.carried ?? null),
    run,
    alerts: { list: [], rev: 0 },
    log: { entries: [], rev: 0 },
    director: { shown: null, done: [] },
    ui: createUiState(phase, opts.reducedMotion ?? false),
    archive: opts.archive ?? { status: 'none' },
  };
}

// The UI slice of a fresh world. The title and the boot happen in blue (the unit wakes up inside the
// mind); the boot cuts to amber when the flight starts.
export function createUiState(phase: RunPhase, reducedMotion: boolean): GameState['ui'] {
  return {
    mode: phase === 'flight' ? 'tools' : 'memory',
    selectedId: null,
    activeTool: null,
    pickedSourceId: null,
    pendingPlacement: null,
    memoryRev: 0,
    filtersOff: [],
    spotlight: [],
    reducedMotion,
  };
}
