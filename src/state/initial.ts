// Slice 5: the lead owns this file (slice-5-plan.md §5); tracks ask by message.
import type { GameState, RunPhase, RunState, HollowState, RunStats, ArchiveState, HazardsState } from './schema';
import type { Segment } from '@/types/segment';
import type { LandingState, PodRecord, ShipLandingDef, AutodropState } from '@/types/landing';
import type { HollowDef, ShipThreat } from '@/types/threat';
import type { RunMapState } from '@/types/map';
import type { SaveState } from '@/types/save';
import type { FsToolKind } from '@/types/fs-tool';
import type { SkillId, RunSkillState } from '@/types/skill';
import type { ResidentState, RunResidentState, ShipResidentDef, CorruptedState, SleeperState } from '@/types/resident';
import { builtResident, residentRackA } from '@data/residents';
import { SKILL_IDS } from '@data/skills';
import { repoToolKind } from '@data/repository';
import { buildShipMemory, type CarriedRacks, type HurtDriver } from '@data/memory';
import { hurtDriversFor } from '@data/driver-damage';
import { classicRunMap, shipDefAt, currentSlot, shipRng } from '@systems/map-run';
import { nominalRunThreat, nominalShipThreat, createRunThreat, applyThreat } from '@systems/threat-plan';
import { createRunLog } from '@state/log-selectors';
import { isDriver } from '@state/selectors';
import { createFlight, createMissionMeta, createClockState } from '@data/mission';
import { hollowLabel } from '@systems/say';
import { flightModsOf } from '@systems/capabilities';
import { resolveZones } from '@systems/zones';
import { FIRST_RUN_LINEAGE, playsTutorial, type RunLineage } from '@systems/meta';
import { LZ_WIDTH_KM } from '@data/tuning';

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
  // The page's run save (slice 3c, systems/save-write.ts openRunSave); a headless world has none ('none': never written).
  save?: SaveState;
  // The run's map at ship 1 (slice 3a): the page's first run is on the arm (systems/map-run.ts createRunMap, as NEW RUN's
  // startRun); left out, the classic world with the unit on classic ship `shipIndex` (the suites' fixture world).
  map?: RunMapState;
}

export function createRunStats(): RunStats {
  return {
    manualCaptures: 0, demos: [], dropDemos: [], repairs: 0, moves: 0, deletes: 0, driversLost: 0, driversBitten: 0, capRefusals: 0,
    deal: null,
  };
}

// A fresh unit's skill history (phase 3 slice 4, 03 §3.11: NEW RUN empties the bank, the skills and the demos; a new core is
// untrained): nothing earned, granted, bought or opened.
export function createRunSkills(): RunSkillState {
  return {
    earned: [], grants: [], bought: [], pending: [], skillGrants: [], opened: [],
    announced: Object.fromEntries(SKILL_IDS.map((id) => [id, null])) as Record<SkillId, number | null>,
  };
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
    upgrades: [],
    tutorial: !lineage.tutorialDone,
    shipIndex,
    // The classic world (data/classic-five.ts): `shipIndex` is classic ship n, as it always meant here. The page's runs
    // get their map from systems/run.ts startRun.
    map: classicRunMap(seed, shipIndex, lineage.wave),
    licences: ['scan'],
    hollowNamed: false,
    coreLost: false,
    skills: createRunSkills(),
    repairRenewedOn: null,
    ships: [],
    stats: createRunStats(),
    pendingStarCredit: 0,
    pendingStars: 0,
    simulationRetryUsed: false,
    ghostSpoken: false,
    beamOut: null,
    transit: null,
    arrival: null,
    endCause: null,
    threat: threat === undefined
      ? nominalRunThreat(shipIndex)
      : applyThreat(shipIndex === 0 ? createRunThreat() : nominalRunThreat(shipIndex - 1), threat),
    log: createRunLog(),
    // Phase 3 slice 3b: no request yet (the first desk's pick is the first), no mail opened.
    repo: { pick: null, requests: [], nextId: 1 },
    inbox: { read: [] },
    // Phase 3 slice 3c: the world update fills it at RUN END.
    next: null,
    // Phase 3 slice 5: no resident met yet.
    residents: createRunResidents(),
  };
}

// A run that has met no resident and found no signal (slice 5, plan §2.2): every new run, and the v4 → v5 migration (no
// resident was ever built before v5, so this is the truth for every older save).
export function createRunResidents(): RunResidentState {
  return { met: [], signals: [] };
}

// The slices that belong to one ship (§9 WP7 item 2: systems/run.ts resetWorldForShip assigns them in
// one update): the mission line, memory, both clocks, the flight, the pods and their landing, and HOLLOW.
// `run` gives the seed, the ship, the unit and what HOLLOW is called by now. `threat` is the ladder's verdict for this
// ship (systems/threat-plan.ts planThreat): HOLLOW's config, and its root in the layout's slot (buildShipMemory lays it
// out from the verdict's rootBlocks; the Packet carries no root, slice 2 review follow-up M5).
// Slice 5: and the ship's resident (createResidentState), built only for a kind this build plays (data/residents.ts
// builtResident): its rack-A files from the ship's own stream ('resident-files'), so the same ship rolls the same files on
// any route and on a resumed BEAM.
export type ShipSlices = Pick<GameState, 'mission' | 'memory' | 'clock' | 'burn' | 'orbit' | 'level' | 'landing' | 'hollow' | 'hazards' | 'resident'>;

export function createShipSlices(run: Readonly<RunState>, carried: CarriedRacks | null, threat: Readonly<ShipThreat>): ShipSlices {
  const slot = currentSlot(run);
  const ship = shipDefAt(run.map, slot);
  const mission = createMissionMeta(ship, run.unitNumber, run.wave);
  // The tutorial run always meets the same ARES-VII families and its hurt POD 02 (01-landing §2); a returning unit
  // meets ship 1 reseeded, the hurt driver too (never the lead, §5.2).
  const firstRun = playsTutorial(run);
  const hurt = hurtDriversFor(ship, firstRun, shipRng(run, slot, 'hurt'));
  const resident = builtResident(ship.resident);
  const memory = buildShipMemory(
    ship, carried, shipRng(run, slot, ship.memory.drivers.familiesSeedStream), firstRun,
    hollowLabel(run), threat.rootBlocks === null ? null : { blocks: threat.rootBlocks }, hurt,
    resident === null ? [] : residentRackA(resident, shipRng(run, slot, 'resident-files')),
  );
  // The ship's hazard zones for this run (WP9): the written debris rack on the tutorial run, a seeded one later.
  const zones = resolveZones(ship.zones, ship.flight, firstRun, shipRng(run, slot, 'zones'));
  // The carried upgrade files that work on arrival widen this ship's flight (FUEL TRIM, §6.9).
  const flight = createFlight(ship, shipRng(run, slot, 'flight'), flightModsOf(memory), zones);
  const landing = createLandingState(ship.landing, memory, {
    finalShip: ship.final, lead: ship.memory.drivers.lead, hurt, planetR: ship.flight.planet.R,
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
    hollow: { ...createHollowState(threat.hollow), untriedTools: untriedOnArrival(run) },
    hazards: createHazardsState(),
    resident: createResidentState(resident),
  };
}

// The ship's resident slice (slice 5, plan §2.2) for the resident this build plays here (data/residents.ts builtResident's
// answer; null: none): its kind's machine at the start of the ship, every other machine null. The codec's reference is
// createResidentState(null).
export function createResidentState(def: Readonly<ShipResidentDef> | null): ResidentState {
  return {
    def: def === null ? null : { ...def },
    corrupted: def?.kind === 'corrupted' ? createCorruptedState(def.shown === 'unknown') : null,
    sleeper: def?.kind === 'sleeping' ? createSleeperState() : null,
    left: def?.kind === 'left' ? { noteRead: false } : null,
  };
}

// A corrupted resident before its wake (04 §3.12): dormant, nothing telegraphed, no deal yet. `surprise`: its card said
// `unknown` (the late surprise's grace and stamp, no SCAN hunt).
export function createCorruptedState(surprise: boolean): CorruptedState {
  return {
    phase: 'dormant', surprise, calmAiSec: 0, wokeAtAi: null, lockInSec: null, lock: null, locksLanded: 0, locksBlocked: 0,
    deal: { phase: 'none', fileId: null, fileName: null, entryId: null, outcome: null },
    angryUntilAi: null, line: 0,
  };
}

// The sleeper before anything woke it (04 §3.14).
export function createSleeperState(): SleeperState {
  return { phase: 'asleep', wokenBy: null, wokeAtAi: null, job: null, entryId: null, mendingId: null, wallId: null };
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
  finalShip: boolean;               // ShipDef.final
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
    autodrop: createAutodropState(),
  };
}

// AUTODROP at rest (slice 4c, slice-4cde-plan §2.2): nothing held or armed, no pass set. Every landing starts here, and
// the migration to save v4 writes it into a saved world.
export function createAutodropState(): AutodropState {
  return {
    held: false, armed: null, pass: {}, sent: {}, armedAtTSec: null, claimed: false, waitingSinceTSec: null, flownAs: 0,
    end: null, endAtAi: null,
  };
}

// The tool kinds that arrive untried with this ship's deliveries (phase 3 slice 3b, 04 §3.3: the lesson is never eaten):
// the first of each kind, as the send marked it (systems/repository.ts deliveryFirstOfKind, read when the chips were made,
// before the send added the kind to run.licences). Spares are not untried. Empty on ship 1 and on the classic world.
function untriedOnArrival(run: Readonly<RunState>): FsToolKind[] {
  const kinds = (run.arrival?.deliveries ?? []).filter((delivery) => delivery.firstOfKind).map((delivery) => repoToolKind(delivery.file));
  return kinds.filter((kind): kind is FsToolKind => kind !== null);
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
  const created = createRunState(opts.seed, phase, opts.shipIndex ?? 0, opts.lineage ?? FIRST_RUN_LINEAGE, opts.threat);
  if (opts.map !== undefined && (opts.map.route.length !== 1 || (opts.shipIndex ?? 0) !== 0)) {
    throw new Error('createInitialState: a map is given for ship 1 only (a later arm ship is reached by its hop)');
  }
  const run = opts.map === undefined ? created : { ...created, map: structuredClone(opts.map) as RunMapState };
  return {
    ...createShipSlices(run, opts.carried ?? null, opts.threat ?? nominalShipThreat(run.shipIndex)),
    run,
    alerts: { list: [], rev: 0 },
    log: { entries: [], rev: 0 },
    director: { shown: null, done: [] },
    ui: createUiState(phase, opts.reducedMotion ?? false),
    archive: opts.archive ?? { status: 'none' },
    save: opts.save ?? { status: 'none', resume: null, refusal: null },
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
    deskSelected: null,
    deskWindow: null,
    trainingSel: null,
    trainingHoldSec: null,
    trainingArmed: false,
  };
}
