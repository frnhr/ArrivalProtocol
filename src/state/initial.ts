// Slice 7a: the lead owns this file (slice-7-plan.md §4.1: the finale v7, landing.lastLanding, ui.runEndStage); tracks ask by
// message. Slice 6: the lead owns this file (slice-6-plan.md §5); tracks ask by message.
import type { GameState, RunPhase, RunState, HollowState, RunStats, ArchiveState, HazardsState } from './schema';
import type { Segment } from '@/types/segment';
import type { LandingState, PodRecord, ShipLandingDef, AutodropState } from '@/types/landing';
import type { HollowDef, ShipThreat } from '@/types/threat';
import type { RunMapState } from '@/types/map';
import type { SaveState } from '@/types/save';
import type { FsToolKind } from '@/types/fs-tool';
import type { SkillId, RunSkillState } from '@/types/skill';
import type { ResidentState, RunResidentState, ShipResidentDef, CorruptedState, SleeperState } from '@/types/resident';
import type { SiteData, SurveySite, SurveyState } from '@/types/survey';
import { builtResident, residentRackA } from '@data/residents';
import { signalFileAt } from '@systems/signals';
import { siteDataOf } from '@data/survey';
import { rollSurveySites } from '@data/survey-sites';
import { SKILL_IDS } from '@data/skills';
import { repoToolKind } from '@data/repository';
import { buildShipMemory, type CarriedRacks, type HurtDriver } from '@data/memory';
import { hurtDriversFor } from '@data/driver-damage';
import { shipDefAt, currentSlot, shipRng, createRunMap, noiseRng } from '@systems/map-run';
import { rollNoiseClouds } from '@systems/map-noise';
import { mapAlong, nominalAlong, workedRouteTo, authoredSlot, skippedResult } from '@systems/arm-fixture';
import { shipCycles } from '@systems/run-score';
import { freshUnitRacks } from '@systems/carry';
import { firstShipThreat, applyThreat } from '@systems/threat-plan';
import { createRunLog } from '@state/log-selectors';
import { noTraces, runTracesOf, logBookOf } from '@systems/traces';
import { isDriver } from '@state/selectors';
import { createFlight, createMissionMeta, createClockState } from '@data/mission';
import { hollowLabel } from '@systems/say';
import { flightModsOf } from '@systems/capabilities';
import { resolveZones } from '@systems/zones';
import { FIRST_RUN_LINEAGE, playsTutorial, type RunLineage } from '@systems/meta';
import { LZ_WIDTH_KM, SURVEY_CELLS } from '@data/tuning';

export interface InitialStateOpts {
  seed: number;
  shipIndex?: number;
  // The page opens on the title card ('title'). Headless harnesses fly straight away, so a
  // state built without a phase is already in 'flight'.
  phase?: RunPhase;
  // The session's reduced-motion choice (the page reads prefers-reduced-motion; tests omit it).
  reducedMotion?: boolean;
  // The unit's own files on a ship that does not meet a fresh unit (every ship after ARES-VII): what
  // systems/carry.ts laid out. Required there (buildShipMemory throws without it). 'fresh' (Track RETIRE): a fresh unit's
  // files carried in over the hop that reaches the ship, laid out for its verdict (carry.ts freshUnitRacks), the way a
  // suite that flies a later ship alone wants it (on ship 1: none, it meets a fresh unit by itself).
  carried?: CarriedRacks | 'fresh' | null;
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
  // startRun); left out, the fixture world's (fixtureMap below): run 1's arm with the unit on authored ship `shipIndex`.
  map?: RunMapState;
}

// --- The fixture world (Track RETIRE, slice-4cde-plan §9.2) -------------------------------------------------------------
// The world a state built with no map is on: the headless suites' and the debug warp's. Run 1's arm (createRunMap on the
// seed, so its arm seed is the run seed), the unit on authored ship `shipIndex` (systems/arm-fixture.ts: ARES-VII, HALCYON,
// KESTREL, VESPER, LAST LIGHT) reached along the worked route; run.shipIndex is that stop's depth − 1 (LAST LIGHT is
// depth 6, through CORMORANT). The classic five that were the fixture before it are retired (phase 3).

interface FixtureStop {
  map: RunMapState;
  slots: number[];
  before: ReturnType<typeof nominalAlong>['before'];
  verdict: ShipThreat;
}

// Memoized (pure in their inputs): a suite that builds thousands of states (wp3/memory-safety) would roll the arm and its
// noise clouds for each. The arm is rolled once per arm seed (createRunMap's; the run seed only rolls the noise clouds, as
// createRunMap does), and every caller gets its own copy.
const fixtureStops = new Map<string, FixtureStop>();
const fixtureArms = new Map<string, RunMapState>();

function fixtureArm(lineage: Readonly<RunLineage>, seed: number): RunMapState {
  const armSeed = (lineage.armSeed ?? seed) >>> 0;
  const key = JSON.stringify([armSeed, lineage.wave, lineage.arm ?? null, lineage.history ?? null]);
  let base = fixtureArms.get(key);
  if (base === undefined) {
    base = createRunMap({ ...lineage, armSeed }, seed);
    fixtureArms.set(key, base);
  }
  const map = structuredClone(base);
  map.noise = rollNoiseClouds(noiseRng(seed >>> 0));
  return map;
}

function fixtureStop(seed: number, shipIndex: number, lineage: Readonly<RunLineage>): FixtureStop {
  const key = JSON.stringify([seed >>> 0, shipIndex, lineage.wave, lineage.armSeed ?? null, lineage.arm ?? null, lineage.history ?? null]);
  let stop = fixtureStops.get(key);
  if (stop === undefined) {
    const slots = workedRouteTo(authoredSlot(shipIndex));
    const map = mapAlong(fixtureArm(lineage, seed), slots);
    stop = { map, slots, ...nominalAlong(map, slots) };
    fixtureStops.set(key, stop);
  }
  return structuredClone(stop);
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
// unit; REPAIR is licensed during the run (systems/licences) and every other tool comes by request (the repository).
// HOLLOW starts unnamed on every run and names itself on the ship it boards (CORMORANT on run 1's worked route; a run
// that never meets its boarding first hears it at the final ship's wake). A later run's ghost no longer names it (slice 2,
// risk 11). The threat ladder's memory starts as the nominal route's for
// `shipIndex` (ship 1: nothing reported, HOLLOW not aboard; a later ship built alone: as if flown with TRACE 0); with
// `threat` (a fixture's own verdict for the ship) it is the nominal run before the ship with that verdict applied, so
// run.threat never disagrees with the HOLLOW the ship is built with.
// `map`: the run's own map at ship 1 (NEW RUN's, the page's, __ap.runNumber's; the caller places its traces, withRunMap),
// so no fixture map is built for it: a lineage that carries a stored arm for another run than its wave (__ap.runNumber)
// must never reach createRunMap here.
export function createRunState(
  seed: number, phase: RunPhase, shipIndex: number, lineage: Readonly<RunLineage>, threat?: Readonly<ShipThreat>,
  map?: Readonly<RunMapState>,
): RunState {
  if (map !== undefined && (shipIndex !== 0 || map.route.length !== 1)) throw new Error('createRunState: a map is given for ship 1 only');
  const stop = map !== undefined
    ? { map: structuredClone(map) as RunMapState, slots: [map.route[0]!.slot], ...nominalAlong(map, [map.route[0]!.slot]) }
    : fixtureStop(seed, shipIndex, lineage);
  // Every stop before the fixture's ship has a result (passed in orbit, nobody landed) and its earning, so the route, the
  // results, the trail and RUN END's world update agree (systems/arm-fixture.ts skippedResult, as __ap.route records them).
  const passed = stop.slots.slice(0, -1).map((slot, i) => skippedResult(stop.map, slot, i + 1));
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
    // The fixture world's (above): authored ship `shipIndex` on the worked route. The page's runs get their map from
    // systems/run.ts startRun (withRunMap).
    shipIndex: stop.slots.length - 1,
    map: stop.map,
    licences: ['scan'],
    hollowNamed: false,
    coreLost: false,
    skills: { ...createRunSkills(), earned: passed.map((result) => shipCycles(result)) },
    repairRenewedOn: null,
    ships: passed,
    stats: createRunStats(),
    pendingStarCredit: 0,
    pendingStars: 0,
    simulationRetryUsed: false,
    ghostSpoken: false,
    beamOut: null,
    transit: null,
    arrival: null,
    endCause: null,
    threat: applyThreat(stop.before, threat ?? stop.verdict),
    // Slice 7c (R37): the `???` file's book, chosen once here, at RUN START (046.log until LINEAGE_BUILT).
    log: createRunLog(logBookOf(lineage.wave, lineage.lastUnit, lineage.events)),
    // Phase 3 slice 3b: no request yet (the first desk's pick is the first), no mail opened.
    repo: { pick: null, requests: [], nextId: 1 },
    inbox: { read: [] },
    // Phase 3 slice 3c: the world update fills it at RUN END.
    next: null,
    // Phase 3 slice 5: no resident met yet.
    residents: createRunResidents(),
    // Slice 7c (R30): none yet; a run places them with its map (withRunMap).
    traces: noTraces(),
  };
}

// A fresh run (createRunState's) on `map`, its traces placed there (slice 7c, R30: from the last unit's ending, on the run's
// own 'traces' stream, systems/traces.ts runTracesOf). Every RUN START on the arm comes through here: the page's first
// title (createInitialState), NEW RUN (systems/run.ts startRun) and ?debug's runs.
export function withRunMap(run: Readonly<RunState>, map: Readonly<RunMapState>): RunState {
  const placed = structuredClone(map) as RunMapState;
  return { ...run, map: placed, traces: runTracesOf(run.lastUnit, placed, run.seed) };
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
// Slice 6: and a POOR planet's sites (data/survey-sites.ts rollSurveySites), for the site data this build plays
// (data/survey.ts siteDataOf: GOOD until SURVEY_BUILT.poor), from the ship's own stream ('survey'): the same sites on any
// route, on a resumed BEAM and next run (plan R2). The LZs stand on CONTROL's guesses (createLandingState).
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
  // Slice 7d (R39, R41): the `▓▓░▓` file after the resident's (the signal `?` ship's, a CONTACT stop's; systems/signals.ts).
  const signal = signalFileAt(run, slot);
  const memory = buildShipMemory(
    ship, carried, shipRng(run, slot, ship.memory.drivers.familiesSeedStream), firstRun,
    hollowLabel(run), threat.rootBlocks === null ? null : { blocks: threat.rootBlocks }, hurt,
    [...(resident === null ? [] : residentRackA(resident, shipRng(run, slot, 'resident-files'))), ...(signal === null ? [] : [signal])],
  );
  // The ship's hazard zones for this run (WP9): the written debris rack on the tutorial run, a seeded one later.
  const zones = resolveZones(ship.zones, ship.flight, firstRun, shipRng(run, slot, 'zones'));
  // The carried upgrade files that work on arrival widen this ship's flight (FUEL TRIM, §6.9).
  const flight = createFlight(ship, shipRng(run, slot, 'flight'), flightModsOf(memory), zones);
  const site = siteDataOf(ship);
  const sites = site === 'poor' ? rollSurveySites(ship.landing, ship.flight.planet.R, shipRng(run, slot, 'survey')) : null;
  const landing = createLandingState(ship.landing, memory, {
    finalShip: ship.final, lead: ship.memory.drivers.lead, hurt, planetR: ship.flight.planet.R, sites,
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
    phase: 'dormant', surprise, calmAiSec: 0, wokeAtAi: null, lockInSec: null, lock: null, locksLanded: 0, locksBlocked: 0, bursts: 0,
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
  // Slice 6: a POOR planet's sites (data/survey-sites.ts rollSurveySites: CONTROL's guesses first, in LZ order), each LZ built
  // on its guess (its centre, width and hidden ground); null or left out: a GOOD planet, the LZs as the def has them.
  sites?: readonly SurveySite[] | null;
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
  const sites = opts.sites ?? null;
  return {
    lzs: def.lzs.map((lz, index) => {
      if (sites !== null) {
        const guess = sites[index];
        if (guess === undefined || guess.kind !== 'guess' || guess.number !== index) throw new Error(`createLandingState: ${lz.label} has no guess site`);
        return {
          label: lz.label, centreRad: guess.centreRad, halfWidthRad: guess.halfWidthRad, widthKm: guess.widthKm, pods: lz.pods,
          ground: guess.ground, site: guess.id,
        };
      }
      const widthKm = LZ_WIDTH_KM[lz.width];
      return {
        label: lz.label, centreRad: lz.centreDeg * toRad, halfWidthRad: widthKm / 2 / opts.planetR, widthKm, pods: lz.pods, ground: 'flat',
        site: null,
      };
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
    survey: createSurveyState(sites === null ? 'good' : 'poor', sites ?? []),
    sitesRev: 0,
    // Slice 7a (R2): 7b's THE LAST LANDING, null until 7b sets it after a MERGE (and at every save point).
    lastLanding: null,
  };
}

// The ship's survey at the boot (slice 6, plan §2.2): nothing mapped, paused, claimed or said; the sites as rolled (none on a
// GOOD planet). The migration to save v6 writes createSurveyState('good', []) into a saved world.
export function createSurveyState(site: SiteData, sites: readonly SurveySite[]): SurveyState {
  if ((site === 'good') !== (sites.length === 0)) throw new Error(`createSurveyState: ${sites.length} sites on a ${site.toUpperCase()} planet`);
  return {
    site, sites: structuredClone(sites) as SurveySite[], mapped: Array.from({ length: SURVEY_CELLS }, () => false), paused: false, claimed: false,
    lastRad: null, ranAt: 0, moves: [], reveals: [], lines: { firstFind: false, mapped: false, controlBoot: false, controlMoved: false },
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
// before the send added the kind to run.licences). Spares are not untried. Empty on ship 1.
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
    finale: createFinaleState(),
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
  const created = createRunState(opts.seed, phase, opts.shipIndex ?? 0, opts.lineage ?? FIRST_RUN_LINEAGE, opts.threat, opts.map);
  if (opts.map !== undefined && (opts.map.route.length !== 1 || (opts.shipIndex ?? 0) !== 0)) {
    throw new Error('createInitialState: a map is given for ship 1 only (a later arm ship is reached by its hop)');
  }
  const shipIndex = opts.shipIndex ?? 0;
  const lineage = opts.lineage ?? FIRST_RUN_LINEAGE;
  let run: RunState;
  let threat: ShipThreat;
  let carried: CarriedRacks | null;
  if (opts.map !== undefined) {
    run = withRunMap(created, opts.map);
    threat = opts.threat ?? firstShipThreat();
    if (opts.carried === 'fresh') throw new Error('createInitialState: a map is given for ship 1, which meets a fresh unit by itself');
    carried = opts.carried ?? null;
  } else {
    const stop = fixtureStop(opts.seed, shipIndex, lineage);
    // Traces placed on the arm as at any RUN START (withRunMap; none on a first run).
    run = withRunMap(created, stop.map);
    threat = opts.threat ?? stop.verdict;
    const hop = stop.map.route.at(-1)!.hop;
    carried = opts.carried === 'fresh'
      ? (hop === null ? null : freshUnitRacks(shipDefAt(stop.map, stop.slots.at(-1)!), threat))
      : opts.carried ?? null;
  }
  return {
    ...createShipSlices(run, carried, threat),
    run,
    alerts: { list: [], rev: 0 },
    log: { entries: [], rev: 0 },
    director: { shown: null, done: [] },
    ui: createUiState(phase, opts.reducedMotion ?? false),
    archive: opts.archive ?? { status: 'none' },
    save: opts.save ?? { status: 'none', resume: null, refusal: null },
  };
}

// The FINALE before anything happened (slice 7a, schema FinaleState): the root still LOCKED.
export function createFinaleState(): HollowState['finale'] {
  return {
    phase: 'none', rootFell: false, hollow: null, you: null, stay: null, restored: [], cardAtAi: null, ending: null,
    unresolvedUntilAi: null, record: null,
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
    runEndStage: 'tally',
  };
}
