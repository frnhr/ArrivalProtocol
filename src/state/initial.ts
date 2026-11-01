import type { GameState, RunPhase, RunState, HollowState, RunStats, ArchiveState, HazardsState } from './schema';
import type { Segment } from '@/types/segment';
import type { LandingState, PodRecord, ShipLandingDef } from '@/types/landing';
import type { HollowDef, ShipThreat } from '@/types/threat';
import { buildShipMemory, type CarriedRacks, type HurtDriver } from '@data/memory';
import { hurtDriversFor } from '@data/driver-damage';
import { getShip } from '@data/ships';
import { nominalRunThreat, nominalShipThreat, createRunThreat, applyThreat } from '@systems/threat-plan';
import { createRunLog } from '@systems/story-log';
import { isDriver } from '@state/selectors';
import { createFlight, createMissionMeta, createClockState } from '@data/mission';
import { childRng } from '@systems/rng';
import { hollowLabel } from '@systems/say';
import { flightModsOf } from '@systems/capabilities';
import { resolveZones } from '@systems/zones';
import { FIRST_RUN_LINEAGE, playsTutorial, type RunLineage } from '@systems/meta';
import { MERGE_BONUS_CORE_CAPACITY, LZ_WIDTH_KM } from '@data/tuning';

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
  // The ship's threat (systems/threat-plan.ts): left out, the nominal run's for shipIndex (every ship before it flown
  // with TRACE 0 and no DEAL, slice-2-plan risk 14), which run.threat matches. A suite that wants another verdict (a
  // seeds-only ship with seeds, a HUNT stage) passes its own.
  threat?: ShipThreat;
  // Who this run's unit is, from the archive (WP8, systems/meta.ts): the page passes the archive's; a
  // headless world without one flies the first run (FIRST_RUN_LINEAGE), as an empty archive would.
  lineage?: Readonly<RunLineage>;
  // The page's archive status (state/instance.ts openRunArchive); a headless world has none ('none').
  archive?: ArchiveState;
}

export function createRunStats(): RunStats {
  return { manualCaptures: 0, demos: [], repairs: 0, moves: 0, deletes: 0, driversLost: 0, driversBitten: 0, capRefusals: 0, deal: null };
}

// A fresh run (§4.1): its unit, wave, last unit and HOLLOW from the archive's lineage (§4.5: UNIT-047 on
// wave 1 the first time), and the tutorial until a unit has flown ARES-VII through. SCAN comes with the
// unit; every other tool is licensed during the run
// (systems/licences). HOLLOW starts unnamed on every run and names itself on the ship it boards (VESPER on the fixed
// five; a run that lost VESPER first hears it at the final ship's wake). A later run's ghost still types at ship 1's boot,
// but no longer names it (slice 2, risk 11). The threat ladder's memory starts as the nominal run's for
// `shipIndex` (ship 1: nothing reported, HOLLOW not aboard; a later ship built alone: as if flown with TRACE 0); with
// `threat` (a fixture's own verdict for the ship) it is the nominal run before the ship with that verdict applied, so
// run.threat never disagrees with the HOLLOW the ship is built with.
export function createRunState(
  seed: number, phase: RunPhase, shipIndex: number, lineage: Readonly<RunLineage>, threat?: Readonly<ShipThreat>,
): RunState {
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
    threat: threat === undefined
      ? nominalRunThreat(shipIndex)
      : applyThreat(shipIndex === 0 ? createRunThreat() : nominalRunThreat(shipIndex - 1), threat),
    log: createRunLog(),
  };
}

// The slices that belong to one ship (§9 WP7 item 2: systems/run.ts resetWorldForShip assigns them in
// one update): the mission line, memory, both clocks, the flight, the pods and their landing, and HOLLOW.
// `run` gives the seed, the ship, the unit and what HOLLOW is called by now. `threat` is the ladder's verdict for this
// ship (systems/threat-plan.ts planThreat): HOLLOW's config, and its root in the layout's slot (buildShipMemory lays it
// out from the verdict's rootBlocks; the Packet carries no root, slice 2 review follow-up M5).
export type ShipSlices = Pick<GameState, 'mission' | 'memory' | 'clock' | 'burn' | 'orbit' | 'level' | 'landing' | 'hollow' | 'hazards'>;

export function createShipSlices(run: Readonly<RunState>, carried: CarriedRacks | null, threat: Readonly<ShipThreat>): ShipSlices {
  const ship = getShip(run.shipIndex);
  const mission = createMissionMeta(ship, run.unitNumber, run.wave);
  // The tutorial run always meets the same ARES-VII families and its hurt POD 02 (01-landing §2); a returning unit
  // meets ship 1 reseeded, the hurt driver too (never the lead, §5.2).
  const firstRun = playsTutorial(run);
  const hurt = hurtDriversFor(ship, firstRun, childRng(run.seed, run.shipIndex, 'hurt'));
  const memory = buildShipMemory(
    ship, carried, childRng(run.seed, run.shipIndex, ship.memory.drivers.familiesSeedStream), firstRun,
    hollowLabel(run), threat.rootBlocks === null ? null : { blocks: threat.rootBlocks }, hurt,
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
  const landing = createLandingState(ship.landing, memory, {
    finalShip: ship.flagship, lead: ship.memory.drivers.lead, hurt, planetR: ship.flight.planet.R,
  });
  mission.colonists = landing.pods.reduce((sum, record) => sum + record.colonists, 0);
  return {
    mission,
    memory,
    clock: createClockState(),
    burn: flight.burn,
    orbit: flight.orbit,
    level: flight.level,
    landing,
    hollow: createHollowState(threat.hollow),
    hazards: createHazardsState(),
  };
}

// Nothing has hit the ship yet (WP9).
export function createHazardsState(): HazardsState {
  return { hitIds: [], debrisHits: [] };
}

// The ship's landing slice (01-landing; plan §1.7 "generator-made ships"): built from the ship's landing def, its
// memory and a few facts copied from the ShipDef, never by looking the ship up again at runtime, so a ship the map's
// generator rolls needs nothing new here. One PodRecord per driver in memory (address order: POD 01 first), each aboard;
// the bay is filled by actions.ts beginLanding at the lock. Angles turn from the def's degrees into world radians and
// widths into half-angles over the planet's radius here, once.
export interface LandingSliceOpts {
  finalShip: boolean;               // ShipDef.flagship
  lead: number;                     // the story pod (ShipDef.memory.drivers.lead)
  hurt: readonly HurtDriver[];      // the drivers the memory was built hurt with
  planetR: number;
}

export function createLandingState(def: ShipLandingDef, memory: readonly Segment[], opts: LandingSliceOpts): LandingState {
  const toRad = Math.PI / 180;
  const pods: PodRecord[] = memory.filter(isDriver).map((driver) => ({
    pod: driver.pod,
    family: driver.family,
    colonists: driver.colonists,
    featured: structuredClone(driver.featured),
    driverLost: null,
    restored: false,
    fate: { kind: 'aboard' },
  }));
  pods.forEach((record, index) => {
    if (record.pod !== index + 1) throw new Error(`createLandingState: pod ${record.pod} is driver ${index + 1} in address order`);
  });
  const podTotal = def.lzs.reduce((sum, lz) => sum + lz.pods, 0);
  if (pods.length !== podTotal) throw new Error(`createLandingState: ${pods.length} drivers in memory for ${podTotal} pods in the LZs`);
  return {
    lzs: def.lzs.map((lz) => {
      const widthKm = LZ_WIDTH_KM[lz.width];
      return { label: lz.label, centreRad: lz.centreDeg * toRad, halfWidthRad: widthKm / 2 / opts.planetR, widthKm, pods: lz.pods, ground: 'flat' };
    }),
    noGo: def.noGo.map((arc) => ({ centreRad: arc.centreDeg * toRad, halfWidthRad: (arc.widthDeg / 2) * toRad, word: arc.word })),
    forgiveness: def.forgiveness,
    terrain: def.terrain,
    drag: def.drag,
    finalShip: opts.finalShip,
    lead: opts.lead,
    hurt: opts.hurt.map((driver) => driver.pod),
    colonyFirstRun: def.colonyFirstRun,
    colony: null,
    pods,
    bay: { loaded: 0, reloadTac: 0, cadenceLeftTac: 0 },
    loadNext: null,
    startedAtTSec: null,
    ended: null,
    lingerAiSec: null,
    noDriverAiSec: 0,
    window: null,
    fuelAtEndPct: null,
    orbitEpoch: 0,
    decay: { lastKickTSec: null, kicks: 0, last: null },
    goLow: null,
    declined: null,
    ghostBursts: 0,
  };
}

// HOLLOW sleeps in its root until the ship's wake (systems/hollow.ts). `cfg` is the ladder's config for the ship
// (ShipThreat.hollow), copied.
export function createHollowState(cfg: Readonly<HollowDef>): HollowState {
  return {
    cfg: structuredClone(cfg) as HollowDef, phase: 'asleep', story: 'none', scriptTargetId: null, biteInSec: null, wakeAtAi: null,
    seedInSec: null, seedTelegraph: null, seedMoments: 0, seedsLanded: 0, wakeHeld: false, wakeHoldEndedAtAi: null,
    deal: createDealState(),
    verbInSec: null, verb: null, verbMoments: 0, verbTelegraphs: 0, verbsLanded: 0, verbsBlocked: 0, untriedTools: [], bitesAt: [],
    finale: { phase: 'none', restoredInPlace: [], restoredHalf: [], ending: null, unresolvedUntilAi: null },
    calmAiSec: 0, unlinkedLastSpare: false,
  };
}

// THE DEAL before anything was offered (WP10).
export function createDealState(): HollowState['deal'] {
  return { phase: 'none', pod: null, segId: null, startAddr: null, entryId: null, pauseUntilAi: null, hasteUntilAi: null };
}

// A complete, fresh GameState for one ship of a fresh run. The live store and every headless
// harness build their state here, so a test flies exactly the flight the page opens on.
export function createInitialState(opts: InitialStateOpts): GameState {
  const phase = opts.phase ?? 'flight';
  const run = createRunState(opts.seed, phase, opts.shipIndex ?? 0, opts.lineage ?? FIRST_RUN_LINEAGE, opts.threat);
  return {
    ...createShipSlices(run, opts.carried ?? null, opts.threat ?? nominalShipThreat(run.shipIndex)),
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
    logReader: null,
  };
}
