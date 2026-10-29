import type { Store } from '@state/store';
import type { GameState, Speaker, ObjectiveLine, LogEntry, ViewMode, TerminalStatus, EndingLine } from '@state/schema';
import { getPrediction, getSensedPrediction, type Prediction } from '@systems/predict';
import { capabilitiesNow, CAPABILITY_ROLES, type Capabilities } from '@systems/capabilities';
import { installTool } from '@systems/licences';
import { getByRole, hasIntegrity, driversInMemory, colonistCounts, type ColonistCounts } from '@state/selectors';
import { requestLaunch, forceLandAll, endLanding, setLoadNext } from '@systems/landing';
import { getDropSolution } from '@systems/drop-cache';
import { landingResult, onTargetTally } from '@systems/landing-rules';
import { shipStars, type ShipStar } from '@systems/stars';
import type { LaunchIntent, LaunchResult, LandingTally, OnTargetTally, DropSolution, LzDef } from '@/types/landing';
import { createLandingState } from '@state/initial';
import { shipOutcomeOf } from '@systems/run';
import { endFlight } from '@systems/orbit-sim';
import { setIntegrity } from '@state/actions';
import type { SegmentRole } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { resetWorld, listResets, resetReport, type ResetDrift } from '@systems/reset';
import {
  startShip, startRun, continueAfterLoss, continueAfterReport, transmitNext, startBeamOut, cancelBeamOut, type LossPlan,
} from '@systems/run';
import { packUnit, layoutCarried } from '@systems/carry';
import { movePreview, type MovePreview } from '@systems/move-preview';
import { newRunSeed } from '@systems/rng';
import { requestSkip, mainCountdown, setDebugWarp, type SkipResult, type Countdown } from '@systems/pace';
import { buildFlightContext, flightObjective, type FlightObjective } from '@systems/guidance';
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
import { getShip, type ShipDef, type HollowDef } from '@data/ships';
import { childRng } from '@systems/rng';
import { createHollowState } from '@state/initial';
import { getOps, threadsBusy, threadsTotal, cancelOp, abortAll } from '@systems/ops-core';
import { assertMemoryInvariants, segmentStarts } from '@systems/memory-ops';
import { MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { META_STORAGE_KEY } from '@data/tuning';
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
  type LastCause, type Meta,
} from '@systems/meta';
import { pickCard, draftContext, cardFiles, type PickRefusal } from '@systems/draft';
import { installAddress } from '@systems/licences';
import { replaceRange, mergeAdjacentFree, newSegId } from '@systems/memory-ops';
import { REPAIR_V2_VERSION, THREAD_PLUS_THREADS } from '@data/tuning';
import type { UpgradeId, DraftContext, DraftCard } from '@data/upgrades';
import { skillsModel, type SkillRow } from '@systems/skills';
import { arrivalDamage } from '@systems/carry';
import { autoburnSkill, autoburnRefusal, toggleAutoburn, trainSkillAtBoot, skillBootDue, type AutoburnSkill } from '@systems/autoburn';
import { seedSpotFor, seedsInMemory, threateningSeeds } from '@systems/hollow';
import { knownHitRacks } from '@systems/zones';
import { nextZoneEntry, zoneInside } from '@systems/pace';
import type { Zone, ZoneHit } from '@/types/zone';
import { offerDealNow, dealEffectNow } from '@systems/hollow-deal';
import { lastSkipPlanChange } from '@systems/ghost-thrust';

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
  landingReport: () => { tally: LandingTally; stars: ShipStar[] };
  onTarget: () => OnTargetTally;
  // WP6: HOLLOW. infect / cure take a cluster code (C12) or a file name (Engine I/O): infect bites it
  // now from the side facing HOLLOW (on ship 1 before the loop closed, that IS the scripted bite);
  // cure heals it to 100 and cures it at once, exactly as a winning repair does (recoil, sparkles, the
  // ship-1 story). hollow is its phase, bite timer and reach (the painter's arrows and GAP/WALL
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
  // an archive as if UNIT-047's run had just ended with `cause` (reload to meet its ghost), archiveCorrupt
  // writes JSON that does not read (reload: ARCHIVE CORRUPT), archiveClear forgets everything (a first run);
  // ghost is this run's ghost line; draft is the TRANSMIT's offer, pick and what weighted it; pick takes a
  // card (refusal or null).
  archive: () => { status: string; meta: Readonly<Meta> };
  archiveAs: (cause: LastCause, woke?: number) => Meta;
  archiveCorrupt: () => void;
  archiveClear: () => void;
  ghost: () => string | null;
  draft: () => { offer: DraftCard[]; pick: UpgradeId | null; context: DraftContext } | null;
  pick: (id: UpgradeId) => PickRefusal | null;
  // Gives the unit a card now, on the ship being flown, as if it had been picked and carried here (a look at
  // FIREWALL.sys or FUEL TRIM on the strip without flying to a TRANSMIT; FUEL TRIM's Δv applies from the next
  // arrival, as it would).
  giveCard: (id: UpgradeId) => Segment[];
  // WP8 part 2: the Skills window's rows (the cards carried, their files, what each is doing now).
  skills: () => SkillRow[];
  // WP9 (KESTREL). zones: this flight's hazard zones, what was hit, and what the true and sensed paths do with
  // them; seedNow telegraphs a seed at once (HOLLOW must be awake on a seeding ship); seeds lists them with the
  // ones that can bite; autoburn is the machine's state, the skill and why [B] would be refused; auto toggles
  // it; trainAutoburn records manual captures with these START BURN offsets (tactical s) and installs or
  // retrains AUTOBURN.skl now, as the next boot would.
  zones: () => { zones: readonly Zone[]; hitIds: string[]; truth: ZoneHit[]; sensed: ZoneHit[]; inside: string | null; nextEntryTac: number | null };
  seedNow: () => void;
  seeds: () => { seeds: string[]; threatening: string[]; next: ReturnType<typeof seedSpotFor> | null; state: GameState['hollow'] };
  autoburn: () => { auto: GameState['burn']['auto']; skill: AutoburnSkill | null; refusal: string | null };
  auto: () => string | null;
  trainAutoburn: (offsetsTac: number[]) => string;
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

// __ap.hollowDemo(): HOLLOW as ship 2 meets it, on the ship being flown: rack C becomes `P P _2 R _1 P P _21` (the
// root between POD 08 behind a 2-block GAP and POD 09 behind a 1-block GAP; one LZ takes all ten pods), MOVE is licensed, and HOLLOW wakes HOLLOW_DEMO_WAKE_SEC from now with HALCYON's numbers
// and no story. WP6's browser checks were built on it; the real HALCYON is
// __ap.ship(1) (WP7).
const HOLLOW_DEMO_RACKS = { B: 'P P P P P P _16', C: 'P P _2 R _1 P P _21', D: '_64' } as const;
// POD 09 leads (the pod right of the root, behind the 1-block GAP).
const HOLLOW_DEMO_LEAD = 9;
const HOLLOW_DEMO_WAKE_SEC = 12;
// __ap.archiveAs: the souls a written-in last run woke (HALCYON reached: ship 1's 2,400 and some).
const DEBUG_ARCHIVE_WOKE = 3400;
const HOLLOW_DEMO: HollowDef = {
  wake: { afterAiSec: 0, coastLeadSec: null }, spreadEverySec: 25, drainPerSec: 3.5, burnMult: 2, landMult: 1.5, seed: null, verbs: null, deal: false,
  story: 'none',
};

function hollowDemo(store: Store<GameState>): void {
  const ship = getShip(store.getState().run.shipIndex);
  if (!ship.memory.aiFiles) throw new Error('__ap.hollowDemo: only on a ship that meets a fresh unit (ship 1); HALCYON is __ap.ship(1)');
  const demo: ShipDef = {
    ...ship,
    memory: {
      ...ship.memory,
      podRacks: HOLLOW_DEMO_RACKS,
      drivers: { ...ship.memory.drivers, lead: HOLLOW_DEMO_LEAD, hurt: [], firstRun: null },
    },
    hollow: HOLLOW_DEMO,
  };
  const pods = Object.values(HOLLOW_DEMO_RACKS).join(' ').split(/\s+/).filter((token) => token === 'P').length;
  const lz: LzDef = { ...ship.landing.lzs[0]!, pods };
  const landingDef = { ...ship.landing, lzs: [lz] };
  const state = store.getState();
  const owner = hollowLabel(state.run);
  const memory = buildShipMemory(demo, null, childRng(state.run.seed, 1, 'families'), false, owner, []);
  const landing = createLandingState(landingDef, memory, { finalShip: false, lead: HOLLOW_DEMO_LEAD, hurt: [], planetR: state.level.planet.R });
  store.update((draft) => {
    draft.memory = memory;
    draft.landing = landing;
    draft.hollow = createHollowState(demo);
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
    const addr = installAddress(memory, file.size);
    replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
  }
  mergeAdjacentFree(memory);
  assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
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

// __ap.ship(index): jumps to ship `index` now, the way a transmission would bring the unit there (its own
// files packed for that ship's link, the charge that fits, the ship's own arrival damage), but with no transit
// hits and no stars: a quick way to reach HALCYON or KESTREL for a look (WP7 replaces WP6's hollowDemo). The
// run's licences stay.
function debugJump(store: Store<GameState>, index: number): void {
  const ship = getShip(index);
  if (!ship.arrival) throw new Error(`__ap.ship(${index}): ${ship.name} meets a fresh unit; use __ap.newRun()`);
  abortAll();
  const packet = packUnit(store.getState().memory, ship.arrival.linkBlocks, []);
  const layout = layoutCarried(packet, packet.chargeCarried, ship);
  // The ship's own arrival damage still applies (WP9: KESTREL's Sensor Interp at 45%, PATH UNCERTAIN).
  const scripted = arrivalDamage(layout.racks.segs, ship.arrival.damage);
  startShip(store, index, layout.racks, {
    hits: [], chargeCarried: packet.chargeCarried, starCredit: 0, stars: 0, card: null, cardCharge: 0, chargeFloorAdded: 0,
    chargeOverflowLost: 0, scripted,
  });
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
        countdownChip: countdownChip(state, pred),
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
    checkMemory: () => { assertMemoryInvariants(store.getState().memory, MEMORY_TOTAL_BLOCKS); return true; },
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
    landingReport: () => ({ tally: landingResult(store.getState(), shipOutcomeOf(store.getState())), stars: shipStars(store.getState()) }),
    onTarget: () => onTargetTally(store.getState()),
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
    run: () => store.getState().run,
    resetReport,
    continueLoss: () => continueAfterLoss(store),
    continueReport: () => continueAfterReport(store),
    transmit: () => transmitNext(store),
    beamOut: () => startBeamOut(store),
    cancelBeamOut: () => cancelBeamOut(store),
    newRun: (seed) => startRun(store, seed ?? newRunSeed(), archiveLineage()),
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
    archiveAs: (cause, woke = DEBUG_ARCHIVE_WOKE) => {
      // UNIT-047's run as the archive keeps it: started, ARES-VII flown through (the next run is a returning
      // unit), then ended with `cause` on HALCYON.
      const first = lineageOf(freshMeta());
      const progress = { unit: first.unitNumber, shipName: getShip(1).name, woke, stats: { moves: 0, deletes: 0 }, hollowUnits: first.hollowUnits };
      const started = recordTutorialDone(recordRunStart(freshMeta(), progress, Date.now()));
      const meta = recordRunEnd(started, { ...progress, cause, score: woke });
      if (saveMeta(browserStorage, meta) !== 'ok') throw new Error('__ap.archiveAs: the archive could not be written');
      return meta;
    },
    archiveCorrupt: () => { browserStorage().setItem(META_STORAGE_KEY, '{ this is not an archive'); },
    archiveClear: () => { browserStorage().removeItem(META_STORAGE_KEY); },
    ghost: () => ghostLine(store.getState().run.unitNumber, store.getState().run.lastUnit),
    draft: () => {
      const plan = store.getState().run.transit;
      return plan === null ? null : { offer: plan.offer, pick: plan.pick, context: draftContext(store.getState(), plan.linkBlocks) };
    },
    pick: (id) => pickCard(store, id),
    giveCard: (id) => giveCard(store, id),
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
      return { auto: state.burn.auto, skill: autoburnSkill(state.run.stats), refusal: autoburnRefusal(state, getPrediction()) };
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
        state.memory, childRng(state.run.seed, state.run.shipIndex, 'debug-verb-look'), weights, hollow.untriedTools,
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
    trainAutoburn: (offsetsTac) => {
      store.update((draft) => { draft.run.stats.demos.push(...offsetsTac.map((offsetTac) => ({ offsetTac }))); });
      if (skillBootDue(store.getState()) === null) throw new Error('__ap.trainAutoburn: no skill is due (fewer than 2 captures, or none new)');
      return trainSkillAtBoot(store);
    },
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
