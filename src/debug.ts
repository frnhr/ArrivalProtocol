// Slice 6: the lead owns this file (docs/phase3/impl/slice-6-plan.md §2.15, §5); the 4c–4e, slice 5 and slice 6 hooks'
// bodies are in the track modules (autodrop.ts, sentry.ts, beam-seeds.ts, autoburn-v3.ts; resident-corrupted.ts,
// resident-sleeper.ts; survey.ts). Tracks ask by message.
import type { Store } from '@state/store';
import type { GameState, Speaker, ObjectiveLine, LogEntry, ViewMode, TerminalStatus, EndingLine } from '@state/schema';
import { getPrediction, getSensedPrediction, type Prediction } from '@systems/predict';
import { capabilitiesNow, CAPABILITY_ROLES, type Capabilities } from '@systems/capabilities';
import { installTool } from '@systems/licences';
import { getByRole, hasIntegrity, driversInMemory, colonistCounts, type ColonistCounts } from '@state/selectors';
import { requestLaunch, forceLandAll, endLanding, setLoadNext } from '@systems/landing';
import { getDropSolution } from '@systems/drop-cache';
import { onTargetTally } from '@systems/landing-rules';
import { landingReportModel, type LandingReportModel } from '@systems/landing-report';
import type { LaunchIntent, LaunchResult, OnTargetTally, DropSolution, LzDef } from '@/types/landing';
import { createLandingState } from '@state/initial';
import { endFlight } from '@systems/orbit-sim';
import { setIntegrity } from '@state/actions';
import type { SegmentRole } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { resetWorld, listResets, resetReport, type ResetDrift } from '@systems/reset';
import {
  startShip, boardedBy, continueAfterLoss, continueAfterReport, transmitNext, startBeamOut, cancelBeamOut, setCourse,
  type LossPlan,
} from '@systems/run';
import { packUnit, layoutCarried } from '@systems/carry';
import { movePreview, type MovePreview } from '@systems/move-preview';
import { newRunSeed } from '@systems/rng';
import { requestSkip, mainCountdown, setDebugWarp, skipBlockReason, type SkipResult, type Countdown } from '@systems/pace';
import {
  buildFlightContext, flightObjective, buildLandingContext, landingObjective, landingFlightOf, type FlightObjective, type LandingObjective,
} from '@systems/guidance';
import { stateFromElements } from '@/types/orbit';
import {
  countdownChip, paceLabel, skipButton, plotChip, plotReadouts, plotMarkers, burnButton, presetHint,
  fuelModel, acceptModel, telemetryModel, thrustLimitModel, reactorModel, windowPip, toggleAlert, mindChipModel,
  plotZones, rackZoneTags, autoButton, type PlotZoneModel, type RackZoneTag, type AutoButtonModel,
  choiceTicker,
} from '@systems/flight-hud';
import { say, sayChoice, tickerEntry, queuedLines, hollowLabel, openChoiceEntry, type SayOpts, type SayResult } from '@systems/say';
import { setMode } from '@systems/mode';
import { receiveTransmission, skipBoot } from '@systems/boot';
import { emit, onAny, type GameEventName, type GameEvents } from '@systems/events';
import {
  isAudioUnlocked, isMuted, setMuted, play, measureCue, recentCues, type Cue, type CueParams, type CueMeasure,
  type MeasurableCue,
} from '@systems/audio';
import { biteClock, reachMarks, miniStripRows, chewLevel, tugTone, amberBite } from '@systems/hollow-hud';
import { transmitModel, toggleDrop, type TransmitModel, type DropRefusal } from '@systems/transmit';
import { runEndModel, type RunEndModel } from '@systems/run-end';
import { beamOutView, type BeamOutView } from '@systems/beam-out';
import { buildShipMemory } from '@data/memory';
import { podCode } from '@data/landing-text';
import type { ShipDef, HollowDef } from '@data/ships';
import { classicShip, CLASSIC_HOPS } from '@data/classic-five';
import { nominalShipThreat, nominalRunThreat, planThreat, threatInputFor, fixedShipFacts } from '@systems/threat-plan';
import { rollBeamSeeds, rollDeliverySeeds, plantBeamSeed, seedTargetsOf, disguiseChanceAt } from '@systems/beam-seeds';
import { autodropDebug, setPassCount, setDropDemos, type AutodropDebug } from '@systems/autodrop';
import { preemptSeed, type PreemptRefusal } from '@systems/sentry';
import { v3Debug, type LandingOrbitAim } from '@systems/autoburn-v3';
import { beamSourceOf, arrivalDeliveries, arrivalSkills } from '@systems/run';
import { playsTutorial } from '@systems/meta';
import type { ResidentKind, ResidentShown, SleeperJob, SignalRecord } from '@/types/resident';
import { residentDebug, type ResidentDebug } from '@systems/residents';
import { wakeResidentNow, lockNow, offerResidentDealNow, angerResidentNow } from '@systems/resident-corrupted';
import { wakeSleeperNow, pickSleeperJob } from '@systems/resident-sleeper';
import { RESIDENT_BUILT } from '@data/residents';
import type { AssignRefusal } from '@/types/survey';
import { surveyDebug, mapNow, assignSite, toggleSurveyPause, type SurveyDebug } from '@systems/survey';
import { SURVEY_BUILT } from '@data/survey';
import { SEED_WORDS_POOL, DISGUISE_POOL } from '@data/threat-text';
import { SEEDS_ONLY_DEF } from '@data/threats';
import type { ShipThreat } from '@/types/threat';
import { childRng } from '@systems/rng';
import { createHollowState } from '@state/initial';
import { getOps, threadsBusy, threadsTotal, cancelOp, abortAll } from '@systems/ops-core';
import {
  assertMemoryInvariants, segmentStarts, unitInstallAddress, replaceRange, mergeAdjacentFree, newSegId,
} from '@systems/memory-ops';
import { layoutOf } from '@data/memory';
import { META_STORAGE_KEY, RUN_SAVE_KEY, ROOT_BLOCKS, COLONISTS_PER_POD } from '@data/tuning';
import type { SaveState } from '@/types/save';
import { updateArm, updateAfterRun, armStateOfMap, type ArmUpdate } from '@systems/map-update';
import { visitsOf, trailOf, notableEvents } from '@systems/lineage';
import { abandonRun, resumeRun } from '@systems/run-save';
import { runScore, runLanded } from '@systems/run-score';
import type { ShipResult } from '@state/schema';
import type { Segment } from '@/types/segment';
import { showStamp, type StampTone } from '@components/hud/Stamp';
import { shake, recentShakes } from '@components/hud/Juice';
import { renderKeyCaps } from '@components/hud/keycaps';
import { infectNow, cureNow, hollowReach, nameHollow, chooseVerb, verbWeights, type Reach, type Verb, type VerbWeights } from '@systems/hollow';
import { verbNow } from '@systems/hollow-verbs';
import {
  chooseFinale, finaleChoiceRefusal, rootDeletable, skipFinaleEnding, finaleEndingShowing, finaleEndingLines, type FinaleChoice,
} from '@systems/finale';
import { glitchBurst } from '@systems/glitch';
import { infectedSegments, fileLabel } from '@state/selectors';
import type { HollowState } from '@state/schema';
import {
  archiveLineage, archiveMeta, freshMeta, saveMeta, lineageOf, recordRunStart, recordRunEnd, recordTutorialDone, ghostLine, browserStorage,
  LAST_CAUSES, type LastCause, type Meta,
} from '@systems/meta';
import { pickCard, draftContext, cardFiles, planPacket, type PickRefusal } from '@systems/draft';
import { upgradeRepairsToV2 } from '@systems/delivery-boot';
import { REPAIR_V2_VERSION, THREAD_PLUS_THREADS } from '@data/tuning';
import type { UpgradeId, DraftContext, DraftCard, DraftCardId } from '@data/upgrades';
import { skillsModel, type SkillRow } from '@systems/skills';
import { arrivalDamage } from '@systems/carry';
import { autoburnRefusal, toggleAutoburn } from '@systems/autoburn';
import { autoburnDemoSkill, deskBlocker } from '@systems/skill-tree';
import { trainCell, undoPurchase, restoreSkill, setPackAs, commitTraining } from '@systems/training';
import { giveSkill } from '@systems/skill-files';
import { skillLive, type SkillLive } from '@systems/capabilities';
import type { SkillId, SkillVersion, LockLevel, DemoSkill, CellRow, RunSkillState } from '@/types/skill';
import { grantCycles, bankOf, treeCells, visitNow, type TrainRefusal, type TreeCell } from '@systems/skill-tree';
import { skillPacketPlan } from '@systems/skill-files';
import { shipCycles } from '@systems/run-score';
import type { SkillFileSegment } from '@/types/segment';
import { seedSpotFor, seedsInMemory, threateningSeeds } from '@systems/hollow';
import { knownHitRacks } from '@systems/zones';
import { nextZoneEntry, zoneInside } from '@systems/pace';
import type { Zone, ZoneHit } from '@/types/zone';
import { offerDealNow, dealEffectNow } from '@systems/hollow-deal';
import { lastSkipPlanChange } from '@systems/ghost-thrust';
import { visitRng, currentShip, classicRunMap, shipDefAt, currentSlot, hopRng, createRunMap } from '@systems/map-run';
import { hopBetween, reachable, roomFit } from '@systems/map-hop';
import { mapFacts, nominalRouteThreat } from '@systems/map-facts';
import { layerOf } from '@systems/map-geometry';
import { FIRST_SLOT } from '@data/arm';
import { packedFiles, arrivalCharge } from '@systems/carry';
import { resetWorldForShip } from '@systems/run';
import { createRunState } from '@state/initial';
import type { RunMapState, Hop } from '@/types/map';
import type { RepoFileId, RunRepoState, DeliveryChip, RepoRequest } from '@/types/repo';
import type { InboxMessage } from '@/types/inbox';
import { REPO_FILES, repoFileSegments, repoToolKind } from '@data/repository';
import {
  setRequest, recommendation, repoModel, undeliveredFiles, bestRepairVersion, deliveryFirstOfKind, hopOutlook,
  deliveriesForHop, advanceRequests, type RepoModel, type OutlookEntry,
} from '@systems/repository';
import { toggleSendOn, type SendOnRefusal } from '@systems/transmit';
import { inboxMessages, inboxUnread } from '@systems/inbox';

// Debug hooks on window.__ap, installed ONLY with ?debug in the URL. Screenshot scripts and
// manual poking use them; the shipped game never depends on them. Each package adds its own.

interface DebugHooks {
  store: Store<GameState>;
  getPrediction: () => Prediction;
  objective: () => FlightObjective | null;
  countdown: () => Countdown | null;
  hud: () => Record<string, unknown>;
  requestSkip: () => SkipResult;
  setDebugWarp: (warp: number | null) => void;
  resetWorld: () => void;
  listResets: () => string[];
  // WP2
  say: (speaker: Speaker, text: string, opts?: SayOpts) => SayResult;
  // A TERMINAL line with inline buttons; the answer (or null on timeout) lands in __ap.lastChoice.
  sayChoice: (speaker: Speaker, text: string, options: string[], timeoutAiSec: number) => number;
  lastChoice: string | null | undefined;
  log: () => LogEntry[];
  queued: () => readonly { speaker: Speaker; text: string }[];
  ticker: () => LogEntry | null;
  director: () => { shown: ObjectiveLine | null; done: string[] };
  setMode: (mode: ViewMode) => void;
  receive: () => boolean;
  skipBoot: () => boolean;
  emit: <Name extends GameEventName>(name: Name, payload: GameEvents[Name]) => void;
  stamp: (text: string, tone?: StampTone) => boolean;
  shake: (px: number) => void;
  // WP3
  ops: () => { id: number; kind: string; segId: string; pct: number; aiSec: number }[];
  threads: () => { busy: number; total: number };
  cancelOp: (opId: number) => boolean;
  // Throws on a broken strip, true otherwise.
  checkMemory: () => true;
  // A segment by its on-screen name (debug only: game code looks segments up by role or type).
  seg: (name: string) => Segment | undefined;
  // WP4
  caps: () => Capabilities;
  sensed: () => Prediction;
  // Sets the integrity of a role's counting copy (its health word follows); returns the file.
  setIntegrity: (role: SegmentRole, integrity: number) => Segment;
  install: (kind: FsToolKind) => Segment[];
  // WP4 part 2: the files on screen, as data (window pips, THRUST LIMIT, REACTOR, the toggle's
  // alert, the MIND chip) and the director's line with its highlight.
  files: () => Record<string, unknown>;
  // Slice 1a: the landing. pods lists the drivers in memory; landing is the landing slice with the colonists' counts
  // and the live drop solution; endFlight ends the flight as `status` where the ship is (locked / accepted start the
  // landing); launch goes through the one launch path (requestLaunch) as the kid's [L] does; landAll lands every
  // pod whose driver is in memory at once (forceLandAll), so the LANDING REPORT is a moment away; endLanding is
  // END LANDING; loadNext is LOAD NEXT; landingReport is the report's tally and stars; onTarget the live ★ ON TARGET.
  pods: () => { pod: number; code: string; family: string; integrity: number; state: string | undefined }[];
  landing: () => { state: GameState['landing']; counts: ColonistCounts; solution: DropSolution | null };
  endFlight: (status: TerminalStatus) => void;
  launch: (intent?: Partial<LaunchIntent>) => LaunchResult;
  landAll: () => number;
  endLanding: () => string | null;
  loadNext: (pod: number) => string | null;
  landingReport: () => LandingReportModel;
  onTarget: () => OnTargetTally;
  // The landing table's line now (landing-guidance landingObjective, before the director's composition), null outside
  // LANDING; lockOn puts the ship straight into an orbit (▼ `r` km, default the ring's middle; eccentricity `e`) and ends
  // the flight there as `status` (default locked), so a landing starts with no capture flown.
  landingTable: () => LandingObjective | null;
  lockOn: (opts?: { r?: number; e?: number; status?: 'locked' | 'accepted' }) => void;
  // WP6: HOLLOW. infect / cure take a cluster code (C12) or a file name (Engine I/O): infect bites it
  // now from the side facing HOLLOW (on an ARRIVAL ship before the loop closed, that IS the scripted bite);
  // cure heals it to 100 and cures it at once, exactly as a winning repair does (recoil, sparkles, the
  // ARRIVAL stage's story). hollow is its phase, bite timer and reach (the painter's arrows and GAP/WALL
  // labels) plus what is infected.
  infect: (target: string) => void;
  cure: (target: string) => void;
  hollow: () => { state: HollowState; reach: Reach[]; infected: { file: string; integrity: number; side: string }[] };
  nameHollow: () => void;
  // WP6 part 2: what the painter, the mini-strip and the sound read (systems/hollow-hud.ts).
  hollowHud: () => Record<string, unknown>;
  // WP6 part 2: a ship-2 look at HOLLOW on ship 1 (kept for WP6's browser suite; the real ship is ship(1)).
  hollowDemo: () => void;
  // WP7: the run. ship(i) jumps to ship i (debugJump below); run is the run slice; resetReport lists the
  // modules not in their initial state (empty right after a reset); continueLoss / continueReport press
  // the LOST card's and the WAKE REPORT's buttons; transmit sends the packet ('transmit');
  // beamOut / cancelBeamOut drive BEAM OUT (refusal or null); newRun starts a NEW RUN;
  // movePreview judges MOVE of the named file into the free region holding `addr`.
  ship: (index: number) => void;
  // Phase 3 slice 2 (THREAT): a beam seed behind this file now (returns its id); HOLLOW boards on the beam into this ship
  // (its boot replayed with the 108% unpack; VESPER on the fixed five).
  // Slice 4d: `{ disguise: 'cache.tmp' }` lands it as that decoy (a name from threat-text.ts DISGUISE_POOL).
  seed: (target: string, opts?: { disguise?: string }) => string;
  board: () => ShipThreat;
  // Phase 3 slice 3a (the galaxy map; Track GEN owns them, DESK and TESTS request more): slot(s) jumps to the ship in
  // slot s as a beam from the current ship would bring it; route([...]) flies the route's ships headless to its last one;
  // runNumber(n) makes the next NEW RUN run n (its arm, its ARES and final-ship names); arm() is the run's map; hop(a, b)
  // the beam between two slots; course(s) is the desk's SET COURSE to slot s (the e2e fallback when a click misses).
  slot: (slot: number) => void;
  route: (slots: readonly number[]) => void;
  runNumber: (run: number) => void;
  arm: () => RunMapState;
  hop: (from: number, to: number) => Hop;
  course: (slot: number) => void;
  run: () => GameState['run'];
  resetReport: () => ResetDrift[];
  continueLoss: () => LossPlan;
  continueReport: () => void;
  transmit: () => void;
  beamOut: () => string | null;
  cancelBeamOut: () => boolean;
  newRun: (seed?: number) => void;
  movePreview: (name: string, addr: number) => MovePreview | null;
  // WP7 part 2: the run's screens as data. transmitModel is the TRANSMIT screen's model ('transmit');
  // dropFile toggles leaving a packed file behind (by name: refusal or null); runEndModel is RUN END's;
  // beamOutView is what the Engine button, COMMS and the strip show of BEAM OUT; amberBite is the amber
  // strip's BITE slot.
  transmitModel: () => TransmitModel;
  dropFile: (name: string) => DropRefusal | null;
  runEndModel: () => RunEndModel;
  beamOutView: () => BeamOutView;
  amberBite: () => { text: string; urgent: boolean } | null;
  // WP8: the archive and the draft. archive is the page's status and its session record; archiveAs writes
  // an archive as if UNIT-047's run had just ended with `cause` on HALCYON (reload, then meet its ghost at HALCYON's boot:
  // __ap.ship(1)), archiveCorrupt writes JSON that does not read (reload: ARCHIVE CORRUPT), archiveClear forgets everything
  // (a first run); ghost is this run's ghost line, wherever it speaks (systems/meta.ts ghostShipIndex); draft is the TRANSMIT's offer, pick and what weighted it; pick takes a
  // card (refusal or null).
  archive: () => { status: string; meta: Readonly<Meta> };
  // Slice 3c (archive v2, plan §5.0 item 9): UNIT-047's run 1 on the worked route (ARES-VII, HALCYON, KESTREL, VESPER,
  // CORMORANT, LAST LIGHT) on this page's arm seed, ended with `cause`, written through the real record and the real world
  // update (its trail, colonies, route, events and the next arm), with the run save cleared: a reload meets UNIT-048 on
  // the updated arm. `landed`: the colonists each ship that reached orbit landed (default: all its pods); a lost cause
  // ends on LAST LIGHT (crashed, or eaten for 'overwritten'), 'abandoned' while still on it.
  archiveAs: (cause: LastCause, landed?: number) => Meta;
  archiveCorrupt: () => void;
  archiveClear: () => void;
  // Phase 3 slice 3c: the run save. save is the page's save state and what is stored under RUN_SAVE_KEY; saveCorrupt
  // writes JSON that does not read (reload: RUN SAVE CAN'T RESUME); saveClear forgets the save; updateArm runs the world
  // update on this run's arm as if the run ended after `route` (default: the route so far; colony where a pod landed).
  save: () => { state: SaveState; stored: string | null };
  saveCorrupt: () => void;
  saveClear: () => void;
  // Track SAVE: the title's [RESUME ▸] and [ABANDON RUN] / NEW RUN over a save (systems/run-save.ts resumeRun, abandonRun), for
  // the e2e scripts and a page without the title's RESUME block.
  resume: () => void;
  abandon: () => void;
  updateArm: (route?: readonly number[]) => ArmUpdate;
  ghost: () => string | null;
  draft: () => { offer: DraftCard[]; pick: DraftCardId | null; context: DraftContext } | null;
  pick: (id: DraftCardId) => PickRefusal | null;
  // Gives the unit a card now, on the ship being flown, as if it had been picked and carried here (a look at
  // FIREWALL.sys or FUEL TRIM on the strip without flying to a TRANSMIT; FUEL TRIM's Δv applies from the next
  // arrival, as it would).
  giveCard: (id: UpgradeId) => Segment[];
  // Phase 3 slice 3b (the repository, deliveries, the INBOX; Track REPO owns them, UI and TESTS request more): request(f)
  // is the desk's REQUEST toggle (null clears it); repo is the run's requests, this desk's pick, the recommendation, the
  // REPOSITORY window's model and the outlook (systems/repository.ts hopOutlook) for the selected ship, and the PACKET's
  // delivery chips; inbox is every message received, the
  // unread ones and the read marks; give(f) writes a repository file into memory now, as a delivery's boot would unpack it
  // (a tool kind's first copy is its licence and arrives untried; a spare is just a file; the REPAIR v2 patch installs at
  // once: every Repair copy becomes v2 and the patch is used up).
  request: (file: RepoFileId | null) => void;
  repo: () => {
    state: RunRepoState; recommendation: RepoFileId | null; model: RepoModel; outlook: OutlookEntry[] | null;
    deliveries: DeliveryChip[] | null; undelivered: RepoRequest[];
  };
  inbox: () => { messages: InboxMessage[]; unread: string[]; read: string[] };
  give: (file: RepoFileId) => Segment[];
  // The PACKET's SEND ON on delivery chip `key` (a request id, as __ap.repo().deliveries lists them): refusal or null.
  sendOn: (key: string) => SendOnRefusal | null;
  // WP8 part 2: the Skills window's rows (the cards carried, their files, what each is doing now).
  skills: () => SkillRow[];
  // WP9 (KESTREL). zones: this flight's hazard zones, what was hit, and what the true and sensed paths do with
  // them; seedNow telegraphs a seed at once (HOLLOW must be awake on a seeding ship); seeds lists them with the
  // ones that can bite; autoburn is the machine's state, what the demos taught the skill, how its file works now
  // (skillLive) and why [B] would be refused; auto toggles it.
  zones: () => { zones: readonly Zone[]; hitIds: string[]; truth: ZoneHit[]; sensed: ZoneHit[]; inside: string | null; nextEntryTac: number | null };
  seedNow: () => void;
  seeds: () => { seeds: string[]; threatening: string[]; next: ReturnType<typeof seedSpotFor> | null; state: GameState['hollow'] };
  autoburn: () => { auto: GameState['burn']['auto']; skill: DemoSkill; live: SkillLive; refusal: string | null };
  auto: () => string | null;
  // Slice 4: a skill file at a version (and AUTOBURN's lock) given now, as the suites' giveSkillFile gives it (any old file
  // of the skill replaced, a free purchase recorded: skill-files.ts giveSkill); and n cycles into the bank (a 'story'
  // grant labelled DEBUG).
  skill: (id: SkillId, version: SkillVersion, lock?: LockLevel) => SkillFileSegment;
  cycles: (n: number) => void;
  // The tree at the desk, as the TRAINING tab drives it (training.ts): the bank; train a cell (`{kind:'version',version:2}`
  // or `{kind:'lock',level:1}`; the refusal, or null); UNDO a pending purchase (the last by default); RESTORE a lost skill;
  // PACK AS on the PACKET (a skill file's id and the version to pack it as, the lock kept; null: as it is); and the grid's
  // cells with the run's skill history.
  bank: () => number;
  train: (id: SkillId, row: CellRow) => TrainRefusal | null;
  undo: (index?: number) => void;
  restore: (id: SkillId) => TrainRefusal | null;
  packAs: (segId: string, version: SkillVersion | null) => void;
  tree: () => { bank: number; cells: TreeCell[]; skills: RunSkillState };
  // Slices 4c–4e (slice-4cde-plan §3.8, §4.6, §5.4); each body is its track module's. autodrop: AUTODROP's machine, the
  // version it works as, the volley, the pass rows and the plan; dropPass sets this pass's counts per LZ (`{ 'LZ-A': 2 }`);
  // dropDemos sets the kid's drop demos (tactical s from each window's centre); disguiseOdds is the chance a beam seed lands
  // disguised at a depth; preempt arms SENTRY v2's DELETE on HOLLOW's blinking outline; v3 is AUTOBURN v3's aim and its key.
  autodrop: () => AutodropDebug;
  dropPass: (counts: Readonly<Record<string, number>>) => void;
  dropDemos: (offsets: readonly number[]) => void;
  disguiseOdds: (depth: number) => number;
  preempt: () => PreemptRefusal | null;
  v3: () => { aim: LandingOrbitAim | null; key: string | null };
  // Slice 5 (slice-5-plan §2.12). resident(): the ship's resident slice and the run's records (met, signals). resident.place
  // writes a resident of `kind` into this ship's reservation (shown, name and fragments default to faulty or unknown, WARDEN
  // or MOTH, 0) and restarts the ship from its boot, so any arm ship but the first and the final can host any kind (a kind
  // not built plays as none). WARDEN's: wake, lock (a pod, default the next in launch order), deal, angry. KIN's: the
  // sleeper's wake and job, and the signals found.
  resident: (() => ResidentDebug) & {
    place: (kind: ResidentKind, opts?: { shown?: ResidentShown; name?: string; fragments?: number }) => void;
    wake: () => void;
    lock: (pod?: number) => void;
    deal: () => void;
    angry: () => void;
  };
  sleeper: { wake: () => void; job: (job: SleeperJob) => void };
  signals: () => SignalRecord[];
  // Slice 6 (slice-6-plan §2.15). survey(): the ship's survey (the sites, mapped %, paused, claimed, the best version it ran at,
  // the moves and reveals, the version it works at now). survey.poor writes POOR site data into this ship's reservation and
  // restarts the ship from its boot (it plays POOR once SURVEY_BUILT.poor is raised). SWATH's: map (mark `pct` of the rim,
  // default 100, finding and rating as the tick would), set (assignSite: the refusal or null), pause.
  survey: (() => SurveyDebug) & {
    poor: () => void;
    map: (pct?: number) => void;
    set: (lz: string, siteId: string) => AssignRefusal | null;
    pause: () => void;
  };
  // WP9 part 2: what the screens show of the zones and AUTOBURN, as data: the NAV PLOT's zone glyphs and labels,
  // the MIND's rack tags (both from the sensed prediction) and the Engine window's AUTO button.
  zonesHud: () => { plot: PlotZoneModel[]; racks: RackZoneTag[]; auto: AutoButtonModel };
  // WP10 (VESPER). thrust: the controller's band and ghost spec, the bursts so far, the one running, and why a SKIP
  // last stopped at a burst (null: it flew on); dealNow offers THE DEAL at once (naming `pod`: P03, or the one at the
  // front); deal is its state and what it bought (the pause, the haste, the bite interval now).
  thrust: () => { band: string; ghost: unknown; bursts: number; running: GameState['burn']['ghost']; lastSkipStop: string | null };
  dealNow: (pod?: string) => void;
  deal: () => { state: GameState['hollow']['deal']; stats: GameState['run']['stats']['deal']; effect: ReturnType<typeof dealEffectNow> };
  // WP10 part 2: the shakes asked for lately (px, newest last), and the TERMINAL choice standing now as the ticker
  // shows it (null: none, or none with ticker words).
  shakeLog: () => number[];
  choiceTicker: () => { text: string; urgent: boolean } | null;
  // WP11 (LAST LIGHT): verbs is HOLLOW's verb state (the one counting down, its clock, how many came, were telegraphed,
  // landed and were blocked) with what it would pick now and the tools it spares (licensed here, not used yet); verbNow
  // runs its clock out (the next tick telegraphs one); finale is the duel's and the choice's state, whether the root can
  // still be deleted and why MERGE would be refused; choose makes the choice (as FinaleChoice's buttons do); glitch fires
  // a glitchBurst (level 0..1, ms). WP11 part 2: finale also says whether the typed ending is on screen and for how many
  // AI s more; skipEnding ends it early (as a click on it does); endingLines writes what an ending would say now.
  verbs: () => {
    verb: GameState['hollow']['verb']; inSec: number | null; moments: number; telegraphs: number; landed: number; blocked: number;
    wouldPick: Verb | null; weights: VerbWeights; untried: readonly FsToolKind[];
  };
  verbNow: () => void;
  finale: () => {
    state: GameState['hollow']['finale']; rootDeletable: boolean; mergeRefusal: string | null; purgeRefusal: string | null;
    endingShowing: boolean; endingLeftSec: number | null;
  };
  choose: (choice: FinaleChoice) => string | null;
  skipEnding: () => boolean;
  endingLines: (choice: FinaleChoice) => EndingLine[];
  // WP11 part 2: the game's events lately (name and payload, newest last; DEBUG_EVENT_KEEP of them), so a browser run
  // can count what happened (belt hits on racks A–B, BLOCKED, the duel's spikes) without a listener of its own.
  events: (name?: GameEventName) => { name: GameEventName; payload: unknown; aiSec: number }[];
  glitch: (level: number, ms: number) => void;
  // WP12 part 2 (the phone's two-line strip): renders each text into the objective strip as it would be shown and
  // returns the ones that wrap to more than `maxLines` lines, with the lines they take (the strip's own text is put
  // back after). Synchronous, so no tick repaints in between.
  stripOverflow: (texts: string[], maxLines: number) => { text: string; lines: number }[];
  audio: {
    isAudioUnlocked: () => boolean;
    isMuted: () => boolean;
    setMuted: (on: boolean) => void;
    play: (cue: Cue, params?: CueParams[Cue]) => void;
    measure: (cue: MeasurableCue, params?: unknown, seconds?: number, level?: number) => Promise<CueMeasure>;
    // The cues played lately, newest last (`hollowChew:on` when a continuous voice starts).
    cues: () => readonly string[];
  };
}

declare global {
  interface Window {
    __ap?: DebugHooks;
  }
}

// __ap.hollowDemo(): HOLLOW as ship 2 meets it, on the ship being flown: rack C becomes `P P _2 S _1 P P _29` with an 8-block root in its slot (the
// root between POD 08 behind a 2-block GAP and POD 09 behind a 1-block GAP; one LZ takes all ten pods), MOVE is licensed, and HOLLOW wakes HOLLOW_DEMO_WAKE_SEC from now with the WALLS stage's numbers (phase 2's HALCYON)
// and no story. WP6's browser checks were built on it; the real HALCYON is
// __ap.ship(1) (WP7).
const HOLLOW_DEMO_RACKS = { B: 'P P P P P P _16', C: 'P P _2 S _1 P P _29', D: '_64' } as const;
// POD 09 leads (the pod right of the root, behind the 1-block GAP).
const HOLLOW_DEMO_LEAD = 9;
const HOLLOW_DEMO_WAKE_SEC = 12;
// __ap.archiveAs: run 1's worked route (02 §3.14; tests/unit/map/run1-fixture.ts WORKED_ROUTE).
const DEBUG_WORKED_ROUTE: readonly number[] = [0, 2, 5, 11, 15, 19];

// __ap.archiveAs: the archive as if UNIT-047 had played run 1 on the worked route and ended with `cause`, through the real
// record steps and the real world update (see DebugHooks.archiveAs).
function debugArchiveAs(store: Store<GameState>, cause: LastCause, landed: number | undefined): Meta {
  // A typo'd cause would be written and read back as ARCHIVE CORRUPT on the next page (review fix, minor 9).
  if (!(LAST_CAUSES as readonly unknown[]).includes(cause)) throw new Error(`__ap.archiveAs: '${String(cause)}' is not a cause (${LAST_CAUSES.join(', ')})`);
  if (landed !== undefined && !(Number.isInteger(landed) && landed >= 0)) throw new Error(`__ap.archiveAs: landed ${landed} is not a whole number`);
  const page = store.getState().run.map;
  const armSeed = page.world === 'arm' ? page.armSeed : newRunSeed();
  const first = lineageOf(freshMeta(armSeed));
  const map = createRunMap(first, armSeed);
  map.route = DEBUG_WORKED_ROUTE.map((slot, i) => ({ slot, depth: i + 1, hop: i === 0 ? null : hopBetween(map, DEBUG_WORKED_ROUTE[i - 1]!, slot) }));
  map.galaxyYear = map.route.at(-1)!.hop!.approachYear;
  const lost = cause === 'flagship-lost' || cause === 'stayed' || cause === 'overwritten';
  const ended = cause === 'abandoned' || cause === 'signal-lost' ? DEBUG_WORKED_ROUTE.length - 1 : DEBUG_WORKED_ROUTE.length;
  const ships: ShipResult[] = DEBUG_WORKED_ROUTE.slice(0, ended).map((slot, i): ShipResult => {
    const def = shipDefAt(map, slot);
    const last = i === DEBUG_WORKED_ROUTE.length - 1;
    const outcome = last && lost ? (cause === 'overwritten' ? 'emergency' : 'crashed') : 'locked';
    const aboard = map.arm[slot]!.pods * COLONISTS_PER_POD;
    const down = outcome === 'locked' ? Math.min(aboard, landed ?? aboard) : 0;
    return {
      shipId: def.id, shipName: def.name, slot, depth: i + 1, outcome, stars: down > 0 ? 2 : 0, fuelLeftPct: 30, ringMiss: null,
      colonistsAboard: aboard, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: aboard - down, landedInLz: down,
      points: down, colony: down > 0 ? (def.landing.colonyFirstRun ?? def.world.toUpperCase()) : null, pods: [], survey: null,
    };
  });
  const run = { ...createRunState(armSeed, 'end', 0, first), map, shipIndex: DEBUG_WORKED_ROUTE.length - 1, ships, tutorial: false };
  const trail = trailOf(run, cause);
  const progress = {
    unit: first.unitNumber, shipName: map.arm[DEBUG_WORKED_ROUTE.at(-1)!]!.name, landed: runLanded(ships), stats: { moves: 0, deletes: 0 },
    hollowUnits: first.hollowUnits, trail,
  };
  const started = recordTutorialDone(recordRunStart(freshMeta(armSeed), progress, Date.now()));
  const { update } = updateAfterRun(run);
  const meta = recordRunEnd(started, { ...progress, cause, score: runScore(ships), nextArm: update.next, events: notableEvents(run) });
  if (saveMeta(browserStorage, meta) !== 'ok') throw new Error('__ap.archiveAs: the archive could not be written');
  browserStorage().removeItem(RUN_SAVE_KEY);
  return meta;
}
const HOLLOW_DEMO: HollowDef = {
  wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, landMult: 1.5, seed: null, verbs: null, deal: false,
  story: 'none',
};

function hollowDemo(store: Store<GameState>): void {
  const ship = currentShip(store.getState());
  if (!ship.memory.aiFiles) throw new Error('__ap.hollowDemo: only on a ship that meets a fresh unit (ship 1); HALCYON is __ap.ship(1)');
  // The arm's ARES-n is COMPACT (no rack D): the demo's racks are the ship's class's.
  const podRacks = ship.memoryClass === 'FULL' ? HOLLOW_DEMO_RACKS : { B: HOLLOW_DEMO_RACKS.B, C: HOLLOW_DEMO_RACKS.C };
  const demo: ShipDef = {
    ...ship,
    memory: {
      ...ship.memory,
      podRacks,
      drivers: { ...ship.memory.drivers, lead: HOLLOW_DEMO_LEAD, hurt: [], firstRun: null },
    },
  };
  const pods = Object.values(HOLLOW_DEMO_RACKS).join(' ').split(/\s+/).filter((token) => token === 'P').length;
  const lz: LzDef = { ...ship.landing.lzs[0]!, pods };
  const landingDef = { ...ship.landing, lzs: [lz] };
  const state = store.getState();
  const owner = hollowLabel(state.run);
  const memory = buildShipMemory(demo, null, childRng(state.run.seed, 1, 'families'), false, owner, { blocks: ROOT_BLOCKS }, []);
  const landing = createLandingState(landingDef, memory, { finalShip: false, lead: HOLLOW_DEMO_LEAD, hurt: [], planetR: state.level.planet.R });
  store.update((draft) => {
    draft.memory = memory;
    draft.landing = landing;
    draft.hollow = createHollowState(HOLLOW_DEMO);
    draft.hollow.cfg.wake = { afterAiSec: draft.clock.aiSec + HOLLOW_DEMO_WAKE_SEC, coastLeadSec: null };
    draft.mission.colonists = landing.pods.reduce((sum, record) => sum + record.colonists, 0);
    // The racks were rebuilt for a fresh unit (SCAN only): the licences are issued again below, so
    // their files are back in rack F.
    draft.run.licences = draft.run.licences.filter((kind) => kind === 'scan');
    draft.ui.selectedId = null;
    draft.ui.memoryRev++;
  });
  installTool(store, 'repair');
  installTool(store, 'move');
}

// __ap.giveCard(id): the card's file installed like a licence's (the last free space that fits, from the end
// of memory), or its effect on the files there (REPAIR v2, THREAD+). The charge card's points need blocks of
// REPAIR CHARGE laid out at an arrival: it is refused here (pick it on a TRANSMIT with __ap.pick).
function giveCard(store: Store<GameState>, id: UpgradeId): Segment[] {
  if (id === 'charge') throw new Error('__ap.giveCard: +12 REPAIR CHARGE arrives with a transmission; use __ap.pick on TRANSMIT');
  const files = cardFiles(id, newSegId);
  const memory = store.getState().memory;
  for (const file of files) {
    const addr = unitInstallAddress(memory, file.size);
    replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
  }
  mergeAdjacentFree(memory);
  assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  store.update((draft) => {
    for (const seg of draft.memory) {
      if (id === 'repair-v2' && seg.type === 'fs-tool' && seg.fsTool === 'repair') seg.version = REPAIR_V2_VERSION;
      if (id === 'thread-plus' && seg.type === 'core') seg.capacity += THREAD_PLUS_THREADS;
    }
    draft.run.upgrades.push(id);
    draft.ui.memoryRev++;
  });
  return files;
}

// __ap.give(file): a repository file written into memory now (phase 3 slice 3b), where a licence's files go (the receiver's
// free run after REPAIR CHARGE: memory-ops.ts unitInstallAddress). A tool kind's first delivery (systems/repository.ts
// deliveryFirstOfKind: never REPAIR or SCAN, whose .bak is a spare) is recorded as the send would record it: run.licences,
// and HOLLOW leaves it alone until the kid has tried it (untriedTools); anything else arrives as a spare copy. The REPAIR v2 patch installs at once, as at its boot
// line: every Repair copy becomes v2, run.upgrades gains 'repair-v2', and the patch leaves no file. Emits 'delivery'.
function giveRepoFile(store: Store<GameState>, file: RepoFileId): Segment[] {
  if (!Object.hasOwn(REPO_FILES, file)) throw new Error(`__ap.give: '${String(file)}' is not in the catalogue (${Object.keys(REPO_FILES).join(', ')})`);
  if (file === 'repair-v2') {
    upgradeRepairsToV2(store);
    emit('delivery', { file });
    return [];
  }
  const memory = store.getState().memory;
  const files = repoFileSegments(file, newSegId, bestRepairVersion(memory));
  for (const seg of files) {
    const addr = unitInstallAddress(memory, seg.size);
    replaceRange(memory, addr, addr + seg.size, [seg], { opId: null, own: [] });
  }
  mergeAdjacentFree(memory);
  assertMemoryInvariants(memory, layoutOf(store.getState()).totalBlocks);
  const kind = repoToolKind(file);
  const first = deliveryFirstOfKind(store.getState().run, file);
  store.update((draft) => {
    if (first && kind !== null) {
      draft.run.licences.push(kind);
      draft.hollow.untriedTools.push(kind);
    }
    draft.ui.memoryRev++;
  });
  emit('delivery', { file });
  return files;
}

// __ap.ship(index): jumps to ship `index` now, the way a transmission would bring the unit there (its own
// files packed for that ship's link, the charge that fits, the ship's own arrival damage), but with no transit
// hits and no stars: a quick way to reach HALCYON or KESTREL for a look (WP7 replaces WP6's hollowDemo). The
// run's licences stay. The threat is the nominal run's (systems/threat-plan.ts, slice-2-plan risk 14): the ships before
// it flown with TRACE 0, so VESPER gets HOLLOW's forced boarding and its 10-block root, LAST LIGHT the FINALE.
// The beam's seeds are rolled as transmitNext rolls them (KESTREL's next to Telemetry on the tutorial run), so the RM
// lesson can be reached in one call. `threat` replaces the nominal verdict (__ap.board).
// The jump always lands on the classic world (data/classic-five.ts: the fixture five, slice-3a-plan §2.3), whatever world
// the run was on: the map becomes the classic route to that ship.
function debugJump(store: Store<GameState>, index: number, threat: ShipThreat = nominalShipThreat(index)): void {
  const ship = classicShip(index);
  const hop = CLASSIC_HOPS[index];
  if (!hop) throw new Error(`__ap.ship(${index}): ${ship.name} meets a fresh unit; use __ap.newRun()`);
  abortAll();
  const state = store.getState();
  const packet = packUnit(state.memory, hop.linkBlocks, []);
  packet.seeds = rollBeamSeeds(packet, beamSourceOf(threat), playsTutorial(state.run), childRng(state.run.seed, index, 'beam-seeds'));
  const layout = layoutCarried(packet, packet.chargeCarried, ship, threat, hollowLabel(state.run));
  // The ship's own arrival damage still applies (WP9: KESTREL's Sensor Interp at 45%, PATH UNCERTAIN).
  const scripted = arrivalDamage(layout.racks.segs, ship.arrivalDamage);
  // The run's threat memory as the nominal run had it before this ship (startShip applies the ship's verdict on top), on
  // the classic world.
  store.update((draft) => {
    draft.run.threat = nominalRunThreat(index - 1);
    // The classic world has no repository: requests made on the arm name its receivers (the review's nit: a waiting one
    // threw at the next send).
    draft.run.repo = { pick: null, requests: [], nextId: draft.run.repo.nextId };
    if (draft.run.map.world !== 'classic') {
      draft.run.map = classicRunMap(draft.run.seed, index - 1, draft.run.wave);
      draft.run.shipIndex = index - 1;
    }
  });
  startShip(store, index, layout.racks, {
    hits: [], chargeCarried: packet.chargeCarried, starCredit: 0, stars: 0, card: null, cardCharge: 0, chargeFloorAdded: 0,
    chargeOverflowLost: 0, scripted, eccCorrected: 0, seeds: layout.seeds, boarded: boardedBy(threat), deliveries: [], skills: [],
  }, threat);
}

// --- The galaxy map's helpers (slice 3a, Track GEN) ----------------------------------------------------------------------

// The unit packed for `hop` and laid out on the ship it reaches, as debugJump does for a classic ship: the current unit's
// files with the charge the link lets cross (no transit hits, no stars, no card), the deliveries that ride the hop (phase 3
// slice 3b: every chip, none sent on; the requests move on and first-of-kind tools are licensed, as transmitNext does), the
// beam's and the deliveries' seeds as transmitNext rolls them, and the ship's own arrival damage. Files over the link or
// the destination's room throw (the PACKET would hold the send).
function debugArrive(store: Store<GameState>, hop: Hop, threat: ShipThreat): void {
  abortAll();
  // The ship being left ends here with a debug result when it has none yet (__ap.slot from a flight; slice 3c review fix:
  // every route stop before the current one has its result, as the trail, the update and the saves expect).
  const left = store.getState().run;
  if (left.ships.length < left.map.route.length) {
    const missing = left.map.route.slice(left.ships.length).map((stop) => debugSkippedResult(left.map, stop.slot, stop.depth));
    console.info(`[debug] ${missing.map((result) => result.shipName).join(', ')} skipped (in orbit, nobody landed)`);
    store.update((draft) => {
      draft.run.ships.push(...missing);
      draft.run.skills.earned.push(...missing.map((result) => shipCycles(result)));
    });
  }
  const state = store.getState();
  const map = state.run.map;
  const ship = shipDefAt(map, hop.to);
  const deliveries = deliveriesForHop(state, hop.from, hop.to, threat);
  // Slice 4: this desk's training (if any) crosses as transmitNext sends it, and is bought as it does.
  const packet = planPacket(state.memory, { linkBlocks: hop.linkBlocks, dropped: [], pick: null, deliveries, skills: skillPacketPlan(state, {}) }, newSegId);
  const fit = roomFit({ files: packedFiles(packet), charge: packet.chargeHeld }, hop);
  if (fit.over > 0 || fit.overLink > 0) throw new Error(`__ap: the unit's ${fit.files} blocks of files (and a floor of ${fit.floor}) are over ${ship.name}'s link (${fit.link}) or room (${fit.room})`);
  const delivered = packet.deliveries.flatMap((group) => group.segIds);
  const deliverySeeds = rollDeliverySeeds(deliveries, packet, hopRng(state.run, hop.from, hop.to, 'delivery-seeds'));
  packet.seeds = [
    ...rollBeamSeeds(packet, beamSourceOf(threat), playsTutorial(state.run), hopRng(state.run, hop.from, hop.to, 'beam-seeds'), delivered),
    ...deliverySeeds,
  ];
  const charge = arrivalCharge(packet.chargeCarried, 0, 0, hop.chargeFloor);
  const layout = layoutCarried(packet, charge.blocks, ship, threat, hollowLabel(state.run));
  const scripted = arrivalDamage(layout.racks.segs, ship.arrivalDamage);
  const plan = { toSlot: hop.to, hop, deliveries };
  commitTraining(store);
  store.update((draft) => {
    draft.run.transit = null;
    draft.run.repo = advanceRequests(draft.run.repo, plan, draft.run.map);
    for (const chip of deliveries) {
      const kind = repoToolKind(chip.file);
      if (chip.firstOfKind && kind !== null && !draft.run.licences.includes(kind)) draft.run.licences.push(kind);
    }
  });
  startShip(store, hop.to, layout.racks, {
    hits: [], chargeCarried: packet.chargeCarried, starCredit: 0, stars: 0, card: null, cardCharge: 0, chargeFloorAdded: charge.floorAdded,
    chargeOverflowLost: layout.overflowLost, scripted, eccCorrected: 0, seeds: layout.seeds, boarded: boardedBy(threat),
    deliveries: arrivalDeliveries(deliveries, packet.deliveries, deliverySeeds.map((seed) => seed.targetId)),
    skills: arrivalSkills(state, packet, layout.racks.segs),
  }, threat, hop);
}

function armMapOf(store: Store<GameState>, what: string): RunMapState {
  const map = store.getState().run.map;
  if (map.world !== 'arm') throw new Error(`__ap.${what}: the run is on the classic world (__ap.ship's); start an arm run with __ap.newRun()`);
  return map;
}

// __ap.slot(s): the ship in slot `s`, as a beam from the current ship would bring the unit there (the hop's link and
// room, the ladder's verdict from the map's facts and the run's threat, no transit hits), reachable or not (a quick look
// at any ship further out). The route gains the stop.
function debugSlot(store: Store<GameState>, slot: number): Hop {
  const map = armMapOf(store, 'slot');
  const state = store.getState();
  const from = currentSlot(state.run);
  if (layerOf(slot) <= layerOf(from)) throw new Error(`__ap.slot(${slot}): not further out than slot ${from}`);
  const hop = hopBetween(map, from, slot);
  const facts = mapFacts(map, from, slot, state.run.shipIndex + 2);
  const threat = planThreat(threatInputFor(state.run.threat, facts, state.run.stats.deal !== null));
  debugArrive(store, hop, threat);
  return hop;
}

// The result of a ship __ap.route skipped (slice 3c review fix: the route's stops had no results, so the trail, RUN END's
// update and a BEAM save disagreed with the route and threw or read DAMAGED): the ship reached orbit and nobody went down
// (no colony, no stars, every colonist not launched). A debug result: nothing a played ship ends with looks like it (no
// LZ, no pod records, 0 % fuel), and the console says which ships were skipped.
function debugSkippedResult(map: Readonly<RunMapState>, slot: number, depth: number): ShipResult {
  const def = shipDefAt(map, slot);
  const aboard = map.arm[slot]!.pods * COLONISTS_PER_POD;
  return {
    shipId: def.id, shipName: def.name, slot, depth, outcome: 'locked', stars: 0, fuelLeftPct: 0, ringMiss: null,
    colonistsAboard: aboard, lzs: [], offSite: 0, noGo: 0, restored: 0, parked: [], notLaunched: aboard, landedInLz: 0, points: 0,
    colony: null, pods: [], survey: null,
  };
}

// __ap.route([s0, …, sn]): the run on the route's last ship, flown headless: the route's stops and years, the threat as the
// nominal route left it (TRACE 0, no DEAL: map-facts nominalRouteThreat), then the unit beamed into the last ship by its
// hop. The route starts at the first ship and every hop must be reachable; the unit is the current one (from ship 1: the
// fresh unit). `__ap.route([0, 2, 5, 11, 15])` is CORMORANT with HOLLOW's forced boarding on run 1. Every stop before the
// last has a result (the run's own where it already ended that ship there, else debugSkippedResult), so the route, the
// results, the trail, RUN END's update and the saves agree.
function debugRoute(store: Store<GameState>, slots: readonly number[]): Hop {
  const map = armMapOf(store, 'route');
  if (slots.length < 2 || slots[0] !== FIRST_SLOT) throw new Error(`__ap.route: a route from slot ${FIRST_SLOT} with at least two ships (got [${slots.join(', ')}])`);
  slots.forEach((slot, index) => {
    if (index > 0 && !reachable(map, slots[index - 1]!, slot)) throw new Error(`__ap.route: slot ${slot} is not reachable from slot ${slots[index - 1]}`);
  });
  const before = slots.slice(0, -1);
  let route = map.route.slice(0, 1);
  if (route[0]?.slot !== FIRST_SLOT) throw new Error('__ap.route: the run\'s route does not start at the first ship');
  for (let i = 1; i < before.length; i++) {
    const hop = hopBetween(map, before[i - 1]!, before[i]!);
    route = [...route, { slot: before[i]!, depth: i + 1, hop }];
  }
  const prior = nominalRouteThreat(map, before);
  const last = slots[slots.length - 1]!;
  const prev = before[before.length - 1]!;
  const had = store.getState().run.ships;
  const ships = before.map((slot, i) => (had[i]?.slot === slot ? structuredClone(had[i]!) : debugSkippedResult(map, slot, i + 1)));
  const skipped = before.filter((slot, i) => had[i]?.slot !== slot).map((slot) => map.arm[slot]!.name);
  if (skipped.length > 0) console.info(`[debug] __ap.route: ${skipped.join(', ')} skipped (in orbit, nobody landed)`);
  const earned = store.getState().run.skills.earned;
  store.update((draft) => {
    draft.run.ships = ships;
    draft.run.skills.earned = ships.map((result, i) => (had[i]?.slot === result.slot && earned[i] !== undefined ? { ...earned[i]! } : shipCycles(result)));
    draft.run.map.route = structuredClone(route);
    draft.run.map.galaxyYear = route.at(-1)!.hop?.approachYear ?? draft.run.map.startYear;
    draft.run.shipIndex = route.length - 1;
    draft.run.threat = prior;
    // The route is rewritten: requests made on the old one name receivers and years it no longer has (3b).
    draft.run.repo = { pick: null, requests: [], nextId: draft.run.repo.nextId };
  });
  const hop = hopBetween(store.getState().run.map, prev, last);
  const facts = mapFacts(map, prev, last, slots.length);
  debugArrive(store, hop, planThreat(threatInputFor(prior, facts, false)));
  return hop;
}

// __ap.resident.place(kind, opts): this ship's reservation holds a resident of `kind` (02 §3.5's, as the map would have rolled
// it), then the ship restarts from its boot: the route as it stands, re-arrived at its last stop (debugRoute: the unit's
// files as they are now, the nominal route's threat). Not on the first ship (it meets a fresh unit) or a final ship (02: never
// a resident there). A name is 1–7 capitals (the words' worst case, 05 §3.11's pools); fragments only on a departed one.
function debugPlaceResident(store: Store<GameState>, kind: ResidentKind, opts: { shown?: ResidentShown; name?: string; fragments?: number }): void {
  const map = armMapOf(store, 'resident.place');
  const state = store.getState();
  const slot = currentSlot(state.run);
  const route = map.route.map((stop) => stop.slot);
  if (route.length < 2) throw new Error('__ap.resident.place: not on the first ship (it meets a fresh unit); go further out with __ap.slot');
  if (shipDefAt(map, slot).final) throw new Error('__ap.resident.place: a final ship never has a resident (02-map)');
  const name = opts.name ?? (kind === 'sleeping' ? 'MOTH' : 'WARDEN');
  if (!/^[A-Z]{1,7}$/.test(name)) throw new Error(`__ap.resident.place: '${name}' is not 1–7 capital letters`);
  const fragments = opts.fragments ?? 0;
  if (!(Number.isInteger(fragments) && fragments >= 0 && fragments <= 1) || (fragments > 0 && kind !== 'left')) {
    throw new Error(`__ap.resident.place: ${fragments} fragment(s) on a ${kind} resident (a departed resident's note carries 0 or 1)`);
  }
  const shown = opts.shown ?? (kind === 'corrupted' ? 'faulty' : 'unknown');
  store.update((draft) => {
    const reserved = draft.run.map.arm[slot]!.reserved;
    reserved.resident = { kind, shown, name };
    reserved.fragments = fragments;
  });
  if (!RESIDENT_BUILT[kind]) console.info(`[debug] __ap.resident.place: '${kind}' is not built yet: the ship plays with no resident`);
  debugRoute(store, route);
}

// __ap.survey.poor(): this ship's reservation holds POOR site data (02 §3.5's, as the map would have rolled it), then the ship
// restarts from its boot as __ap.resident.place does. Not on the first ship (it meets a fresh unit) or a final ship (02: its
// site data is authored GOOD).
function debugSurveyPoor(store: Store<GameState>): void {
  const map = armMapOf(store, 'survey.poor');
  const slot = currentSlot(store.getState().run);
  const route = map.route.map((stop) => stop.slot);
  if (route.length < 2) throw new Error('__ap.survey.poor: not on the first ship (it meets a fresh unit); go further out with __ap.slot');
  if (shipDefAt(map, slot).final) throw new Error('__ap.survey.poor: a final ship\'s site data is GOOD (02-map)');
  store.update((draft) => { draft.run.map.arm[slot]!.reserved.site = 'poor'; });
  if (!SURVEY_BUILT.poor) console.info('[debug] __ap.survey.poor: POOR is not built yet: the ship plays GOOD');
  debugRoute(store, route);
}

// __ap.runNumber(n): a NEW RUN now, as run `n` of the arm (run 1: run 1's arm; later: a fresh roll with ARES-(VI + n) and
// that run's final ship), on its title card. The archive's lineage is kept (the unit number, the last unit), with its wave
// set to `n`, so run.wave and map.run agree (the review's nit: the map came from `n`, the run state from the archive).
function debugRunNumber(store: Store<GameState>, run: number): void {
  if (!(Number.isInteger(run) && run >= 1)) throw new Error(`__ap.runNumber(${run}): a run number is a whole number ≥ 1`);
  const lineage = { ...archiveLineage(), wave: run };
  const seed = newRunSeed();
  resetWorldForShip(store, {
    phase: 'title', run: { ...createRunState(seed, 'title', 0, lineage), map: createRunMap({ wave: run }, seed) }, carried: null,
    threat: nominalShipThreat(0), freshLog: true, done: [],
  });
}

// __ap.board(): HOLLOW boards on the beam into the ship being flown, now: the ship is entered again through its boot (the
// 108% unpack, 'hollow-boarded': the shake, the tear, the cue), with the verdict of a forced boarding (04 §3.8) on the
// nominal run's history. Only where the ladder lets it board (depth ≥ 4, not a final ship: VESPER on the fixed five).
function debugBoard(store: Store<GameState>): ShipThreat {
  const index = store.getState().run.shipIndex;
  const facts = { ...fixedShipFacts(index), oneHopFromFinal: true };
  const before = { ...nominalRunThreat(index - 1), aboard: false, age: 0 };
  const threat = planThreat(threatInputFor(before, facts, store.getState().run.stats.deal !== null));
  if (threat.boards === null) throw new Error(`__ap.board: HOLLOW never boards on the beam into ${classicShip(index).name} (depth ${facts.depth})`);
  debugJump(store, index, threat);
  return threat;
}

// __ap.seed(target): a beam seed laid out behind this file now, as the unpack lays one (GAP 1, the seed, WALL 4), with
// words from 05's pool. On a calm ship (nothing there would ever wake) HOLLOW takes the seeds-only config, so the seed
// bites after its calm seconds as on KESTREL. Returns the seed's id.
// Slice 4d: `disguise`, a name from DISGUISE_POOL, lands it as that decoy (an unknown name throws).
function debugSeed(store: Store<GameState>, target: string, disguise: string | null): string {
  const decoy = disguise === null ? null : DISGUISE_POOL.find((entry) => entry.name === disguise) ?? null;
  if (disguise !== null && decoy === null) throw new Error(`__ap.seed: '${disguise}' is not a decoy (${DISGUISE_POOL.map((entry) => entry.name).join(', ')})`);
  const seg = debugTarget(store, target);
  if (!seedTargetsOf([seg]).includes(seg)) throw new Error(`__ap.seed: ${seg.name} is never a beam seed's target`);
  abortAll();
  const words = SEED_WORDS_POOL[Math.floor(Math.random() * SEED_WORDS_POOL.length)]!;
  let seedId = '';
  // In the update (the review's nit: the memory was mutated outside it, so subscribers never heard the change).
  store.update((draft) => {
    seedId = plantBeamSeed(draft.memory, seg.id, words, hollowLabel(draft.run), decoy).id;
    assertMemoryInvariants(draft.memory, layoutOf(draft).totalBlocks);
    if (draft.hollow.cfg.wake === 'never') draft.hollow.cfg = structuredClone(SEEDS_ONLY_DEF);
    draft.ui.memoryRev++;
  });
  return seedId;
}

// A driver by its pod's code (P03, or POD 03) or a file by its on-screen name, for the HOLLOW hooks.
function isPodName(seg: Segment, wanted: string): boolean {
  if (seg.type !== 'driver') return false;
  const code = podCode(seg.pod).toLowerCase();
  return code === wanted || `p${String(seg.pod).padStart(2, '0')}` === wanted || code.replace(/\s+/g, '') === wanted.replace(/\s+/g, '');
}

function debugTarget(store: Store<GameState>, target: string): Segment {
  const wanted = target.toLowerCase();
  const seg = store.getState().memory.find((candidate) => isPodName(candidate, wanted) || candidate.name.toLowerCase() === wanted);
  if (!seg) throw new Error(`__ap: no pod or file '${target}' in memory`);
  return seg;
}

export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).has('debug');
}

// The events lately, for __ap.events (a debug page only: recorded from mountDebug on).
const DEBUG_EVENT_KEEP = 400;
const recentEvents: { name: GameEventName; payload: unknown; aiSec: number }[] = [];

export function mountDebug(store: Store<GameState>): void {
  if (!isDebugMode()) return;
  onAny((name, payload) => {
    recentEvents.push({ name, payload, aiSec: store.getState().clock.aiSec });
    if (recentEvents.length > DEBUG_EVENT_KEEP) recentEvents.splice(0, recentEvents.length - DEBUG_EVENT_KEEP);
  });
  window.__ap = {
    store,
    getPrediction,
    // What the strip's flight line says: guidance reads what the instruments show.
    objective: () => flightObjective(buildFlightContext(store.getState(), getSensedPrediction())),
    countdown: () => mainCountdown(store.getState(), getSensedPrediction()),
    // Everything the HUD shows right now, as data (screenshot evals read this).
    hud: () => {
      const state = store.getState();
      const pred = getSensedPrediction();
      return {
        countdownChip: countdownChip(state, pred, getDropSolution()),
        pace: paceLabel(state),
        skip: skipButton(state, pred),
        plotChip: plotChip(state, pred),
        readouts: plotReadouts(state, pred),
        markers: plotMarkers(state, pred),
        burnButton: burnButton(state),
        presetHint: presetHint(state),
        fuel: fuelModel(state, pred),
        accept: acceptModel(state, pred),
        telemetry: telemetryModel(state, pred),
      };
    },
    requestSkip: () => requestSkip(store),
    setDebugWarp: (warp) => setDebugWarp(store, warp),
    resetWorld,
    listResets,
    say: (speaker, text, opts) => say(speaker, text, opts),
    sayChoice: (speaker, text, options, timeoutAiSec) => sayChoice(speaker, text, options, timeoutAiSec, (picked) => {
      if (window.__ap) window.__ap.lastChoice = picked;
    }),
    lastChoice: undefined,
    log: () => store.getState().log.entries,
    queued: queuedLines,
    ticker: () => tickerEntry(store.getState()),
    director: () => store.getState().director,
    setMode: (mode) => setMode(store, mode),
    receive: () => receiveTransmission(store),
    skipBoot: () => skipBoot(store),
    emit,
    stamp: (text, tone = 'plain') => showStamp(text, tone),
    shake,
    ops: () => getOps().map((operation) => ({ id: operation.id, kind: operation.kind, segId: operation.segId, pct: operation.pct, aiSec: operation.aiSec })),
    threads: () => ({ busy: threadsBusy(), total: threadsTotal() }),
    cancelOp,
    checkMemory: () => { assertMemoryInvariants(store.getState().memory, layoutOf(store.getState()).totalBlocks); return true; },
    seg: (name) => store.getState().memory.find((seg) => seg.name.toLowerCase() === name.toLowerCase()),
    caps: () => capabilitiesNow(store.getState()),
    sensed: getSensedPrediction,
    setIntegrity: (role, integrity) => {
      const file = getByRole(store.getState(), role);
      if (!file || !hasIntegrity(file)) throw new Error(`__ap.setIntegrity: no file with role '${role}' and an integrity`);
      store.update((draft) => {
        setIntegrity(file, integrity);
        draft.ui.memoryRev++;
      });
      return file;
    },
    install: (kind) => installTool(store, kind),
    files: () => {
      const state = store.getState();
      return {
        pips: CAPABILITY_ROLES.map((role) => windowPip(state, role)),
        thrustLimit: thrustLimitModel(state),
        reactor: reactorModel(state),
        toggleAlert: toggleAlert(state, getSensedPrediction()),
        mindChip: mindChipModel(state),
        presetHint: presetHint(state),
        strip: state.director.shown,
      };
    },
    pods: () => driversInMemory(store.getState()).map((driver) => ({
      pod: driver.pod, code: podCode(driver.pod), family: driver.family, integrity: driver.integrity, state: driver.state,
    })),
    landing: () => ({ state: store.getState().landing, counts: colonistCounts(store.getState()), solution: getDropSolution() }),
    endFlight: (status) => endFlight(store, status),
    launch: (intent = {}) => requestLaunch(store, { source: 'player', ...intent }),
    landAll: () => forceLandAll(store),
    endLanding: () => endLanding(store),
    loadNext: (pod) => setLoadNext(store, pod),
    landingReport: () => landingReportModel(store.getState()),
    onTarget: () => onTargetTally(store.getState()),
    landingTable: () => {
      const state = store.getState();
      if (state.run.phase !== 'landing') return null;
      const sensed = getSensedPrediction();
      return landingObjective(buildLandingContext(state, getDropSolution(), skipBlockReason(state, sensed) === null, landingFlightOf(state, sensed)));
    },
    lockOn: (opts = {}) => {
      const state = store.getState();
      if (state.run.phase !== 'flight' || state.burn.status !== 'approaching') throw new Error('__ap.lockOn: not in a live flight');
      const { ring, planet } = state.level;
      const orbit = stateFromElements(opts.r ?? (ring.min + ring.max) / 2, opts.e ?? 0, 0, 0, planet.mu);
      store.update((draft) => { draft.orbit = { x: orbit.x, y: orbit.y, vx: orbit.vx, vy: orbit.vy }; });
      endFlight(store, opts.status ?? 'locked');
    },
    infect: (target) => infectNow(store, debugTarget(store, target)),
    cure: (target) => cureNow(store, debugTarget(store, target)),
    hollow: () => {
      const state = store.getState();
      return {
        state: state.hollow,
        reach: hollowReach(state.memory, state.clock.aiSec),
        infected: infectedSegments(state).map((seg) => ({ file: fileLabel(seg), integrity: seg.integrity, side: seg.infected.side })),
      };
    },
    nameHollow: () => nameHollow(store),
    hollowHud: () => {
      const state = store.getState();
      return { bite: biteClock(state), marks: reachMarks(state), mini: miniStripRows(state), chew: chewLevel(state), tug: tugTone(state) };
    },
    hollowDemo: () => hollowDemo(store),
    ship: (index) => debugJump(store, index),
    slot: (slot) => { debugSlot(store, slot); },
    route: (slots) => { debugRoute(store, slots); },
    runNumber: (run) => debugRunNumber(store, run),
    arm: () => structuredClone(store.getState().run.map) as RunMapState,
    hop: (from, to) => hopBetween(store.getState().run.map, from, to),
    // Slice 4: the arm's first desk requires the first skill pick: __ap.course makes it (AUTOBURN v1), so a script that only
    // sails still sails.
    course: (slot) => {
      if (deskBlocker(store.getState()) === 'first-pick') {
        const refusal = trainCell(store, 'autoburn', { kind: 'version', version: 1 });
        if (refusal !== null) throw new Error(`__ap.course: the first pick (AUTOBURN v1) was refused (${refusal})`);
      }
      setCourse(store, slot);
    },
    seed: (target, opts) => debugSeed(store, target, opts?.disguise ?? null),
    board: () => debugBoard(store),
    run: () => store.getState().run,
    resetReport,
    continueLoss: () => continueAfterLoss(store),
    continueReport: () => continueAfterReport(store),
    transmit: () => transmitNext(store),
    beamOut: () => startBeamOut(store),
    cancelBeamOut: () => cancelBeamOut(store),
    // Slice 3c: through abandonRun (plan §2.2), so a run in progress is recorded 'abandoned' with the world update and the save
    // is cleared, as the title's NEW RUN over a save does.
    newRun: (seed) => abandonRun(store, seed ?? newRunSeed()),
    movePreview: (name, addr) => {
      const state = store.getState();
      const source = state.memory.find((seg) => seg.name.toLowerCase() === name.toLowerCase() || isPodName(seg, name.toLowerCase()));
      if (!source) throw new Error(`__ap.movePreview: no file '${name}'`);
      const starts = segmentStarts(state.memory);
      const index = state.memory.findIndex((seg, i) => seg.type === 'free' && starts[i]! <= addr && addr < starts[i]! + seg.size);
      if (index < 0) throw new Error(`__ap.movePreview: no free space at ${addr}`);
      return movePreview(state, source, { regionSegIds: [state.memory[index]!.id], col: addr - starts[index]! }, knownHitRacks(state, getSensedPrediction()));
    },
    transmitModel: () => transmitModel(store.getState()),
    dropFile: (name) => {
      const seg = store.getState().memory.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
      if (!seg) throw new Error(`__ap.dropFile: no file '${name}'`);
      return toggleDrop(store, seg.id);
    },
    runEndModel: () => runEndModel(store.getState()),
    beamOutView: () => beamOutView(store.getState(), getPrediction()),
    amberBite: () => amberBite(store.getState()),
    archive: () => ({ status: store.getState().archive.status, meta: archiveMeta() }),
    archiveAs: (cause, landed) => debugArchiveAs(store, cause, landed),
    archiveCorrupt: () => { browserStorage().setItem(META_STORAGE_KEY, '{ this is not an archive'); },
    archiveClear: () => { browserStorage().removeItem(META_STORAGE_KEY); },
    save: () => ({ state: structuredClone(store.getState().save), stored: browserStorage().getItem(RUN_SAVE_KEY) }),
    saveCorrupt: () => { browserStorage().setItem(RUN_SAVE_KEY, '{ this is not a run save'); },
    saveClear: () => { browserStorage().removeItem(RUN_SAVE_KEY); },
    resume: () => resumeRun(store),
    abandon: () => abandonRun(store),
    updateArm: (route) => {
      const run = store.getState().run;
      const visits = visitsOf(run);
      const visited = route === undefined ? visits
        : route.map((slot) => visits.find((visit) => visit.slot === slot) ?? { slot, colony: false });
      return updateArm({ from: armStateOfMap(run.map), visited });
    },
    ghost: () => ghostLine(store.getState().run.unitNumber, store.getState().run.lastUnit),
    draft: () => {
      const plan = store.getState().run.transit;
      return plan === null ? null : { offer: plan.offer, pick: plan.pick, context: draftContext(store.getState(), plan.linkBlocks, plan.hop, plan.deliveries) };
    },
    pick: (id) => pickCard(store, id),
    giveCard: (id) => giveCard(store, id),
    request: (file) => setRequest(store, file),
    repo: () => {
      const state = store.getState();
      return {
        state: structuredClone(state.run.repo), recommendation: recommendation(state), model: repoModel(state, state.ui.deskSelected),
        // The outlook toward the selected ship on the DESK (or the PACKET's destination).
        outlook: state.run.map.world !== 'arm' || state.ui.deskSelected === null || !['desk', 'transmit'].includes(state.run.phase) ? null
          : hopOutlook(state, currentSlot(state.run), state.ui.deskSelected),
        deliveries: state.run.transit === null ? null : structuredClone(state.run.transit.deliveries), undelivered: undeliveredFiles(state.run),
      };
    },
    inbox: () => {
      const state = store.getState();
      return { messages: inboxMessages(state), unread: inboxUnread(state).map((message) => message.id), read: [...state.run.inbox.read] };
    },
    give: (file) => giveRepoFile(store, file),
    sendOn: (key) => toggleSendOn(store, key),
    skills: () => skillsModel(store.getState()),
    zones: () => {
      const state = store.getState();
      const pred = getPrediction();
      const next = nextZoneEntry(state, pred);
      return {
        zones: state.level.zones,
        hitIds: [...state.hazards.hitIds],
        truth: pred.zoneHits,
        sensed: getSensedPrediction().zoneHits,
        inside: zoneInside(state, pred)?.zoneId ?? null,
        nextEntryTac: next === null ? null : next.inSec / state.level.tacticalWarp,
      };
    },
    seedNow: () => {
      const hollow = store.getState().hollow;
      if (hollow.cfg.seed === null || hollow.phase !== 'awake') throw new Error('__ap.seedNow: HOLLOW is not awake on a ship that seeds');
      store.mutate((draft) => { draft.hollow.seedInSec = 0; });
    },
    seeds: () => {
      const state = store.getState();
      return {
        seeds: seedsInMemory(state.memory).map((seg) => seg.id),
        threatening: threateningSeeds(state.memory, state.clock.aiSec).map((seg) => seg.id),
        next: state.hollow.cfg.seed === null ? null : seedSpotFor(state.memory, state.hollow.cfg.seed.target, state.hollow.untriedTools),
        state: state.hollow,
      };
    },
    autoburn: () => {
      const state = store.getState();
      return {
        auto: state.burn.auto, skill: autoburnDemoSkill(state.run.stats), live: skillLive(state.memory, 'autoburn'),
        refusal: autoburnRefusal(state, getPrediction()),
      };
    },
    auto: () => toggleAutoburn(store),
    zonesHud: () => {
      const state = store.getState();
      const sensed = getSensedPrediction();
      return { plot: plotZones(state, sensed), racks: rackZoneTags(state, sensed), auto: autoButton(state, getPrediction()) };
    },
    thrust: () => {
      const state = store.getState();
      const caps = capabilitiesNow(state);
      return { band: caps.thrustCtrl.band, ghost: caps.thrustCtrl.ghost, bursts: state.burn.ghostBursts, running: state.burn.ghost, lastSkipStop: lastSkipPlanChange() };
    },
    dealNow: (pod) => {
      const driver = pod === undefined ? undefined : debugTarget(store, pod);
      if (driver !== undefined && driver.type !== 'driver') throw new Error(`__ap.dealNow: '${pod}' is not a pod`);
      offerDealNow(store, driver);
    },
    deal: () => {
      const state = store.getState();
      return { state: state.hollow.deal, stats: state.run.stats.deal, effect: dealEffectNow(state) };
    },
    shakeLog: () => [...recentShakes()],
    choiceTicker: () => {
      const entry = openChoiceEntry(store.getState());
      return entry === null ? null : choiceTicker(store.getState(), entry);
    },
    verbs: () => {
      const state = store.getState();
      const hollow = state.hollow;
      const weights = verbWeights(state.run.lastUnit);
      // A look with a throwaway stream: the game's own verb stream is not advanced by asking.
      const wouldPick = chooseVerb(
        state.memory, visitRng(state.run, 'debug-verb-look'), weights, hollow.untriedTools,
      );
      return {
        verb: hollow.verb, inSec: hollow.verbInSec, moments: hollow.verbMoments, telegraphs: hollow.verbTelegraphs,
        landed: hollow.verbsLanded, blocked: hollow.verbsBlocked, wouldPick, weights, untried: hollow.untriedTools,
      };
    },
    verbNow: () => verbNow(store),
    finale: () => {
      const state = store.getState();
      const ending = state.hollow.finale.ending;
      return {
        state: state.hollow.finale, rootDeletable: rootDeletable(state),
        mergeRefusal: finaleChoiceRefusal(state, 'merge'), purgeRefusal: finaleChoiceRefusal(state, 'purge'),
        endingShowing: finaleEndingShowing(state), endingLeftSec: ending === null ? null : Math.max(0, ending.untilAi - state.clock.aiSec),
      };
    },
    choose: (choice) => chooseFinale(store, choice),
    skipEnding: () => skipFinaleEnding(store),
    events: (name) => recentEvents.filter((event) => name === undefined || event.name === name),
    endingLines: (choice) => finaleEndingLines(store.getState(), choice),
    glitch: (level, ms) => glitchBurst(level, ms),
    stripOverflow: (texts, maxLines) => {
      const textEl = document.getElementById('objectiveText');
      if (!textEl) throw new Error('#objectiveText missing from index.html');
      const kept = [...textEl.childNodes];
      const range = document.createRange();
      const over: { text: string; lines: number }[] = [];
      for (const text of texts) {
        renderKeyCaps(textEl, text, { tab: 'MIND' });
        // Lines laid out, clamped or not: the text's boxes grouped by height on the page (a key cap's box sits a few
        // px off its line's text, never half a line).
        range.selectNodeContents(textEl);
        const middles = [...range.getClientRects()].filter((box) => box.width > 0).map((box) => (box.top + box.bottom) / 2).sort((a, b) => a - b);
        const lineGapPx = parseFloat(getComputedStyle(textEl).fontSize) / 2;
        const lines = middles.filter((middle, i) => i === 0 || middle - middles[i - 1]! > lineGapPx).length;
        if (lines > maxLines) over.push({ text, lines });
      }
      textEl.replaceChildren(...kept);
      return over;
    },
    skill: (id, version, lock = 0) => giveSkill(store, id, { version, lock }),
    cycles: (n) => { grantCycles(store, n, 'story', 'DEBUG'); },
    bank: () => bankOf(store.getState().run.skills),
    train: (id, row) => trainCell(store, id, row),
    undo: (index) => { undoPurchase(store, index ?? store.getState().run.skills.pending.length - 1); },
    restore: (id) => restoreSkill(store, id),
    packAs: (segId, version) => {
      const seg = store.getState().memory.find((candidate) => candidate.id === segId);
      if (seg === undefined || seg.type !== 'upgrade' || !('lock' in seg)) throw new Error(`__ap.packAs: ${segId} is not a skill file`);
      setPackAs(store, segId, version === null ? null : { version, lock: seg.lock });
    },
    tree: () => {
      const state = store.getState();
      return { bank: bankOf(state.run.skills), cells: treeCells(state, visitNow(state.run)), skills: structuredClone(state.run.skills) };
    },
    autodrop: () => autodropDebug(store.getState()),
    dropPass: (counts) => { for (const [lz, n] of Object.entries(counts)) setPassCount(store, lz, n); },
    dropDemos: (offsets) => setDropDemos(store, offsets),
    disguiseOdds: (depth) => disguiseChanceAt(depth),
    preempt: () => preemptSeed(store),
    v3: () => v3Debug(store.getState(), getPrediction()),
    resident: Object.assign(() => residentDebug(store.getState()), {
      place: (kind: ResidentKind, opts: { shown?: ResidentShown; name?: string; fragments?: number } = {}) => { debugPlaceResident(store, kind, opts); },
      wake: () => wakeResidentNow(store),
      lock: (pod?: number) => lockNow(store, pod),
      deal: () => offerResidentDealNow(store),
      angry: () => angerResidentNow(store),
    }),
    sleeper: { wake: () => wakeSleeperNow(store), job: (job) => pickSleeperJob(store, job) },
    signals: () => structuredClone(store.getState().run.residents.signals),
    survey: Object.assign(() => surveyDebug(store.getState()), {
      poor: () => { debugSurveyPoor(store); },
      map: (pct = 100) => mapNow(store, pct),
      set: (lz: string, siteId: string) => assignSite(store, lz, siteId),
      pause: () => toggleSurveyPause(store),
    }),
    audio: {
      isAudioUnlocked,
      isMuted,
      setMuted,
      // Lets the checklist audition any cue from the console (after the title click).
      play: (cue, params) => (play as (name: Cue, cueParams?: CueParams[Cue]) => void)(cue, params),
      // Renders one cue offline and measures it (peak, loudness, length, brightness).
      measure: measureCue,
      cues: () => [...recentCues()],
    },
  };
  console.info('[debug] window.__ap is ready');
}
