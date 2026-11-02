import type {
  GameState, Speaker, TransitHit, ArrivalReport, RunEndCause, ShipOutcome, VerbKind,
} from '@state/schema';
import type { SegmentRole, Segment } from '@/types/segment';
import type { FsToolKind } from '@/types/fs-tool';
import { AUTOPILOT_DAMAGED_LINE, BAND_COPY, CAPABILITY_ROLES, type Band, type CapabilityRole } from '@systems/capabilities';
import { integrityBand } from '@state/selectors';
import { formatCount } from '@data/format';
import type { Hopeless } from '@systems/beam-out';
import type { Beat, BeatLine, GuideRule, TextCtx, DirectorCtx } from '@systems/director';
import { secUntil, type Prediction } from '@systems/predict';
import { unitName, hollowLabel } from '@systems/say';
import { hollowUnitName, HOLLOW_STORY, HOLLOW_VERB, HOLLOW_FINALE } from '@data/hollow-text';
import { playsTutorial, type LastCause, type LastUnit, type Ending } from '@systems/meta';
import type { UpgradeForm } from '@data/upgrades';
import { currentShip } from '@systems/map-run';
import { solLy } from '@systems/map-geometry';
import { END_SLOTS } from '@data/arm';
import { MAP_TEXT } from '@data/map-text';
import { mapBootLines, mapBootLineText, mapOverflowLineText, deliveryBootLines, deliveryBootLineText } from '@systems/map-boot';
import { newMessagesAtBoot } from '@systems/inbox';
import { readingLineDue } from '@state/log-selectors';
import { INBOX_TEXT } from '@data/inbox-text';
import { SHIP_SCREEN_REFUSAL, AUTOPILOT_REFUSAL } from '@systems/flight-controls';
import {
  TOOL_WORD, repairStepTarget, toolStepTarget, fileHintTarget, podHintTarget, firewallHintTarget, SEED_HINT_TARGET,
  toolFileHintTarget, pipHintTarget, TOOL_FILES, ROOT_HINT_TARGET,
} from '@data/fs-tools';
import { GHOST_TEXT } from '@data/ghost-text';
import { REPO_TEXT } from '@data/repo-text';
import { noSwapForGhost } from '@systems/repository';
import { GHOST_ALARM_ID } from '@systems/alerts';
import { reachMarks, firewallFits } from '@systems/hollow-hud';
import {
  driversInMemory, infectedSegments, fileLabel, chargeLeft, anythingInfected, isFirewall,
  isUsableTool, hasUsableTool, toolFilesOf, getByRole, verbSecondsLeft, isShipFile, isInfected,
} from '@state/selectors';
import { formatTac, isReleaseRow, isCorrectionRow } from '@systems/guidance';
import {
  mostUrgentUnattended, eatenAlarms, coreInfected, healRatePerSec, exposedDrivers, threateningSeeds, seedsInMemory,
  rootDeleteRunning, rootDeleteProgress, bittenAgainDrivers, seedBitesAiFile,
} from '@systems/hollow';
import { rootDeletable } from '@systems/finale';
import { dragLineKm } from '@systems/landing-orbit';
import {
  hostLine, podCode, groundRadioLine, LANDING_ASKS, LANDING_BEATS, LAUNCH_REFUSAL_LINES, LANDING_LESSONS, LANDING_LESSONS_1B,
  END_LANDING_REFUSAL_KEY, END_LANDING_REFUSAL_TEXT,
} from '@data/landing-text';
import { HARD_WORDS_POOL } from '@data/souls';
import { THREAT_RULES } from '@data/threat-rules';
import { copyLessonDue, hollowAboard } from '@state/threat-selectors';
import { THREAT_TEXT, eccSeedsLine } from '@data/threat-text';
import { LOG_TEXT, LOG_HINT_TARGET } from '@data/log-text';
import { bootLogKeys, logKnown } from '@state/log-selectors';
import type { PodRecord } from '@/types/landing';
import { autoburnDropLine, autoburnAvailable } from '@systems/autoburn';
import { blocksInRack, knownHitRacks } from '@systems/zones';
import { safestSpot, placementRack } from '@systems/move-preview';
import { findBackup } from '@systems/tool-targets';
import { debrisRack, racksText } from '@/types/zone';
import {
  AUTOBURN_TEXT, AUTOBURN_DROP_TEXT, AUTOBURN_DROP_TAB, AUTO_REFUSAL_LINES, autoRefusalKey, type AutoburnRefusal,
} from '@data/skill-text';
import { segmentStarts } from '@systems/memory-ops';
import { rackOf, layoutOf } from '@data/memory';
import { canStartOp, getOps } from '@systems/ops-core';
import { TOOL_HINT_TARGET } from '@data/fs-tools';
import {
  MIND_CLEAR_IDLE_SEC, MAX_LINE_CHARS, NAME_MAX_CHARS, ENGINE_FAULT_AFTER_TAC, ENGINE_FAULT_INTEGRITY,
  ENGINE_WEAK_MAX_SHOWN_SEC, COUNTDOWN_RED_TAC,
  SEG_NAME_MAX_CHARS, EATEN_ALARM_CLEAR_SEC, WALL_MIN_BLOCKS, FAMILY_MAX_CHARS, COLONIST_LINE_MAX_CHARS,
  WALL_RULE_SHOW_SEC, EMERGENCY_EXTRA_HITS, CORE_RESET_INTEGRITY, BEAM_OUT_EXTRA_HITS,
  TRANSIT_HIT_MAX, BAND_DEGRADED_MIN, CORE_LOW_INTEGRITY, FIREWALL_HINT_SHOW_SEC, DEBRIS_MOVE_HINT_TAC, SEED_LESSON_SHOW_SEC,
  AUTOBURN_READY_SHOW_SEC, GHOST_LESSON_AFTER_BURSTS, GHOST_LESSON_SHOW_SEC, COPY_LESSON_SHOW_SEC, MERGE_COST_CHARGE, ROOT_DELETE_SEC, LOG_SCAN_AFTER_COAST_SEC,
  BELT_MOVE_HINT_TAC, LESSON_LEAD_IN_SEC, DOT_WIDE_LESSON_SEC, DRAG_LESSON_SEC, DRAG_STAMP_MIN_KM,
  LANDING_DOT_LESSON_SEC, LANDING_SPLIT_LESSON_SEC, LOG_SCAN_ASK_SEC,
} from '@data/tuning';

// Every line the game says or shows outside the flight table (systems/guidance.ts) lives here:
// ARRIVAL CONTROL's quips, the boot log, the director's rules and hints. Templates take
// LineVars, never the live state, so tests/unit/wp2/say.test.ts can render every one of them with
// worst-case placeholders and check it fits the strip (≤ MAX_LINE_CHARS). Words follow the
// §3.5 glossary: SHIP / MIND, LOWEST POINT ▼, SAFE ORBIT ring, FUEL, REPAIR CHARGE …

// The live values a template may use.
export interface LineVars {
  unit: number;           // our unit number: "Unit 47", UNIT-047
  wave: number;           // the fleet wave (run number)
  ship: string;           // the ship's name (≤ NAME_MAX_CHARS)
  colonists: number;      // colonists aboard
  podsTotal: number;      // the pods this ship arrived with
  podsDown: number;       // pods down on the surface
  distanceLy: number;     // the final ship's distance from SOL, on the title card (phase 3 slice 3a: `FINAL SHIP 180 LY OUT`)
  year: number;           // the run's start year, on the title card (`YEAR 2300`)
  nextApsis: '▼' | '▲';   // where the next planned burn happens (the SKIP hint names it)
  hollow: string;         // what HOLLOW is called on screen: '???' until it names itself (WP6)
  // The ship's hurt driver while it would still land hard (in memory, failing), by the strip's label (`POD 02`) and its
  // number (0 with '': none).
  hurtPod: string;
  hurtPodNumber: number;
  // WP6. HOLLOW: the infected file nobody is repairing that goes first ('' none), and whether it is
  // a ship file (those can't be healed); the driver whose alarm is up and its AI seconds to being
  // eaten ('' none); a file in a tug-of-war a repair is winning ('' none). Files by fileLabel (POD 01,
  // ENGINE I/O).
  eating: string;
  eatingShip: boolean;
  // ...and for a ship file, the one move that saves the ship from it (final review: the strip said SWAP OR DELETE IT
  // for every ship file, though only Thrust Ctrl has a backup): SWAP with a clean backup and SWAP in hand, else DELETE
  // with DELETE in hand, else '' (nothing to do it with).
  eatingShipFix: ShipFileFix;
  eaten: string;
  eatenInSec: number;
  tug: string;
  // WP7 (the walls lesson). A clean driver HOLLOW will bite on its next bite (across a GAP, or once its recoil
  // ends): the one to MOVE behind a WALL ('' none). WP11 review: one of those HOLLOW has bitten in the same spot
  // before (BITTEN_AGAIN_COUNT times: a REPAIR alone keeps it in the trap) ('' none).
  exposed: string;
  bittenAgain: string;
  // ...and the rack of the spot the MOVE preview calls SAFE for it, farthest from HOLLOW (`RACK D`; move-preview.ts
  // safestSpot), '' when nowhere is SAFE (final review: the farthest SAFE spot on LAST LIGHT was rack A, the belt's).
  bittenAgainRack: string;
  // WP9 (KESTREL). The next debris cloud the true path enters: its rack ('' none) and the tactical seconds to
  // the contact; AUTOBURN's drop line while it stands (systems/autoburn.ts autoburnDropLine; '' none).
  debrisRack: string;
  debrisInTac: number;
  autoburnDrop: string;
  // WP11 (LAST LIGHT). HOLLOW's verb counting down: which ('' none), what it aims at as the strip names it, and its
  // seconds left (whole, rounded up: the TERMINAL's `... 3`). The belt ahead: its racks (`RACKS A–B`, '' none ahead),
  // the tactical seconds to its entry, and the racks of it that still hold drivers (`RACK B`, '' none).
  verbKind: VerbKind | '';
  verbLabel: string;
  verbSecLeft: number;
  beltRacks: string;
  beltInTac: number;
  beltPodRacks: string;
  // WP11 part 2: the AI seconds left on the root's DELETE (whole, rounded up; 0 when none runs): the duel's countdown.
  rootSecLeft: number;
  // Slice 1a. The LZ the next SKIP flies to during the landing ('' none): the landing table's (landing-guidance
  // LandingObjective.nextLz), filled in by the director, '' from lineVars. The ship's first touchdown's radio line from
  // the ground (`POD 01 · OKAFOR: "Is it morning?"`, '' before it).
  nextLz: string;
  firstDownRadio: string;
  // Slice 2. The split lesson for this ship's LZs (`2 SITES · LZ-A 3, LZ-B 2 — don't overfill`; a returning unit's
  // short form; '' with fewer than two LZs).
  splitLesson: string;
}

// The longest values any template can be rendered with. Later packages add their placeholders
// here as they add them to LineVars (POD 16, a NAME_MAX_CHARS-character family name).
export const WORST_CASE_VARS: LineVars = {
  unit: 999,
  wave: 99,
  ship: 'W'.repeat(NAME_MAX_CHARS),
  colonists: 99_999,
  podsTotal: 16,
  podsDown: 16,
  distanceLy: 9_999,
  year: 9_999,
  nextApsis: '▲',
  // A merged HOLLOW's name is the longest it gets (HOLLOW_NAME_MAX_UNITS units: `UNIT-998·999`).
  hollow: hollowUnitName([998, 999]),
  hurtPod: 'POD 16',
  hurtPodNumber: 16,
  eating: 'W'.repeat(SEG_NAME_MAX_CHARS),
  eatingShip: true,
  eatingShipFix: 'DELETE',
  eaten: 'POD 16',
  // Any alarm clears past EATEN_ALARM_CLEAR_SEC; ten minutes covers every digit the line can show.
  eatenInSec: 599,
  tug: 'W'.repeat(SEG_NAME_MAX_CHARS),
  exposed: 'POD 16',
  bittenAgain: 'POD 16',
  bittenAgainRack: 'RACK D',
  debrisRack: 'C',
  // The strip shows the contact only within DEBRIS_MOVE_HINT_TAC; ten minutes covers every digit.
  debrisInTac: 599,
  autoburnDrop: `${AUTOBURN_DROP_TEXT.engine}${AUTOBURN_DROP_TAB}`,
  verbKind: 'mv',
  // MV's longest label: the block that ate a file with the longest name.
  verbLabel: HOLLOW_VERB.mvAteLabel('W'.repeat(SEG_NAME_MAX_CHARS)),
  verbSecLeft: 9,
  beltRacks: 'RACKS A–B',
  beltInTac: 599,
  beltPodRacks: 'RACKS A–B',
  // ROOT_DELETE_SEC is 12; ten minutes covers every digit.
  rootSecLeft: 599,
  nextLz: 'LZ-D',
  firstDownRadio: groundRadioLine(16, 'W'.repeat(FAMILY_MAX_CHARS), 'W'.repeat(COLONIST_LINE_MAX_CHARS)),
  // The most LZs a ship has (01-landing §3.15: 4) with two-digit counts.
  splitLesson: LANDING_LESSONS.split(['LZ-A', 'LZ-B', 'LZ-C', 'LZ-D'].map((lz) => ({ lz, pods: 16 }))),
};

// The split lesson's words for this ship (01-landing §3.11), '' with fewer than two LZs.
function splitLesson(state: Readonly<GameState>): string {
  if (state.landing.lzs.length < 2) return '';
  const counts = state.landing.lzs.map((lz) => ({ lz: lz.label, pods: lz.pods }));
  return playsTutorial(state.run) ? LANDING_LESSONS.split(counts) : LANDING_LESSONS.splitShort(counts);
}

// The ship's first touchdown's radio line (01-landing §2, §4: the first pod down on every ship sends one): the pod's lead
// colonist's first words, or for a pod that came down hard a hard-landing line (souls HARD_WORDS_POOL, picked by pod so
// it replays). '' before the first touchdown.
function firstDownRadio(state: Readonly<GameState>): string {
  let first: { record: PodRecord; atAi: number; hard: boolean } | null = null;
  for (const record of state.landing.pods) {
    if (record.fate.kind !== 'down') continue;
    const { atAi, touch } = record.fate.touchdown;
    if (first === null || atAi < first.atAi) first = { record, atAi, hard: touch === 'hard' };
  }
  if (first === null) return '';
  const { record, hard } = first;
  const lead = record.featured[0];
  if (!lead) throw new Error(`firstDownRadio: pod ${record.pod} has no featured colonist`);
  const words = hard ? HARD_WORDS_POOL[record.pod % HARD_WORDS_POOL.length] : lead.firstWords;
  if (words === undefined) throw new Error('firstDownRadio: the hard-landing pool is empty');
  return groundRadioLine(record.pod, record.family, words);
}

// The next live debris cloud the TRUE path enters (WP9), with the tactical seconds to its contact, or null.
export function debrisContact(state: Readonly<GameState>, pred: Prediction): { rack: string; inTac: number } | null {
  let best: { rack: string; inTac: number } | null = null;
  for (const hit of pred.zoneHits) {
    if (hit.kind !== 'debris' || hit.spent || hit.insideNow || hit.enterInSec === null) continue;
    const inTac = secUntil(pred, hit.enterInSec, state.clock.tSec) / state.level.tacticalWarp;
    if (inTac <= 0) continue;
    if (!best || inTac < best.inTac) best = { rack: debrisRack(hit), inTac };
  }
  return best;
}

// The ship's hurt driver (01-landing §3.8: run 1's POD 02 BRANDT at 44%) while a repair would still change how its pod
// lands: in memory and failing (it would land hard). The first such pod in the ship's hurt list, or null.
export function hurtPodNow(state: Readonly<GameState>): number | null {
  for (const pod of state.landing.hurt) {
    const driver = driversInMemory(state).find((candidate) => candidate.pod === pod);
    if (driver && driver.integrity < BAND_DEGRADED_MIN) return pod;
  }
  return null;
}

// What saves the ship from a ship file being eaten (LineVars.eatingShipFix): REPAIR can't heal one. SWAP hands its job
// to its backup (a ship file that has one, clean, with SWAP in hand); DELETE cuts it out of HOLLOW's reach.
export type ShipFileFix = 'SWAP' | 'DELETE' | '';

function shipFileFix(state: Readonly<GameState>, seg: Segment): ShipFileFix {
  if (seg.type === 'ship' && state.run.licences.includes('swap') && hasUsableTool(state.memory, 'swap', 'counts')) {
    const backup = findBackup(state, seg);
    if (backup !== undefined && !isInfected(backup)) return 'SWAP';
  }
  return state.run.licences.includes('delete') && hasUsableTool(state.memory, 'delete', 'counts') ? 'DELETE' : '';
}

// The rack the bitten-again ask names (LineVars.bittenAgainRack): where the preview's SAFE spot for that driver is.
// The hazards are read from the true prediction: the sensed one differs only in ▼ and ▲ (predict.ts sensePrediction),
// and under PATH UNCERTAIN no zone is known to hit anything (zones.ts mindZonesBlind).
function bittenAgainRack(state: Readonly<GameState>, pred: Prediction): string {
  if (state.hollow.phase !== 'awake') return '';
  const driver = bittenAgainDrivers(state)[0];
  if (driver === undefined) return '';
  const spot = safestSpot(state, driver, knownHitRacks(state, pred));
  return spot === null ? '' : `RACK ${placementRack(state.memory, spot)}`;
}

// HOLLOW's part of the line vars (see LineVars).
function hollowVars(
  state: Readonly<GameState>,
): Pick<LineVars, 'eating' | 'eatingShip' | 'eatingShipFix' | 'eaten' | 'eatenInSec' | 'tug' | 'exposed' | 'bittenAgain'> {
  const urgent = mostUrgentUnattended(state);
  const alarm = eatenAlarms(state).find((candidate) => candidate.inSec <= EATEN_ALARM_CLEAR_SEC);
  const tug = infectedSegments(state).find((seg) => healRatePerSec(state, seg) > 0);
  const exposed = state.hollow.phase === 'awake' ? exposedDrivers(state)[0] : undefined;
  const bittenAgain = state.hollow.phase === 'awake' ? bittenAgainDrivers(state)[0] : undefined;
  return {
    eating: urgent ? fileLabel(urgent.seg) : '',
    eatingShip: urgent !== null && isShipFile(urgent.seg),
    eatingShipFix: urgent !== null && isShipFile(urgent.seg) ? shipFileFix(state, urgent.seg) : '',
    eaten: alarm ? fileLabel(alarm.seg) : '',
    eatenInSec: alarm ? alarm.inSec : 0,
    tug: tug ? fileLabel(tug) : '',
    exposed: exposed ? fileLabel(exposed) : '',
    bittenAgain: bittenAgain ? fileLabel(bittenAgain) : '',
  };
}


export function lineVars(state: Readonly<GameState>, pred: Prediction): LineVars {
  return {
    unit: state.mission.transmissionNum,
    wave: state.mission.wave,
    ship: state.level.shipName,
    colonists: state.mission.colonists,
    podsTotal: state.landing.pods.length,
    podsDown: state.landing.pods.filter((record) => record.fate.kind === 'down').length,
    // The title's line (05 §3.12): the final ship's distance from SOL (an end slot's world: 180 LY on run 1, and on the
    // classic world, whose LAST LIGHT sits at New Haven too) and the run's start year.
    distanceLy: solLy(END_SLOTS[0]!),
    year: state.run.map.startYear,
    nextApsis: pred.burnPoint?.event === 'apo' ? '▲' : '▼',
    // '???' until HOLLOW names itself (run.hollowNamed, systems/hollow.ts nameHollow: on the ship it arrives on since
    // phase 3 slice 2; a later run's ghost names nothing, slice-2-plan risk 11).
    hollow: hollowLabel(state.run),
    ...hurtPodVars(state),
    ...hollowVars(state),
    bittenAgainRack: bittenAgainRack(state, pred),
    ...debrisVars(state, pred),
    autoburnDrop: autoburnDropLine(state) ?? '',
    ...verbVars(state),
    ...beltVars(state, pred),
    rootSecLeft: rootSecLeft(state),
    nextLz: '',
    firstDownRadio: firstDownRadio(state),
    splitLesson: splitLesson(state),
  };
}

function hurtPodVars(state: Readonly<GameState>): Pick<LineVars, 'hurtPod' | 'hurtPodNumber'> {
  const pod = hurtPodNow(state);
  return pod === null ? { hurtPod: '', hurtPodNumber: 0 } : { hurtPod: podCode(pod), hurtPodNumber: pod };
}

function debrisVars(state: Readonly<GameState>, pred: Prediction): Pick<LineVars, 'debrisRack' | 'debrisInTac'> {
  const contact = debrisContact(state, pred);
  return { debrisRack: contact?.rack ?? '', debrisInTac: contact?.inTac ?? 0 };
}

// The next radiation belt the TRUE path enters (WP11, LAST LIGHT), with the tactical seconds to its entry, or null
// (none ahead, or already inside).
export function beltContact(state: Readonly<GameState>, pred: Prediction): { racks: readonly string[]; inTac: number } | null {
  for (const hit of pred.zoneHits) {
    if (hit.kind !== 'belt' || hit.insideNow || hit.enterInSec === null) continue;
    const inTac = secUntil(pred, hit.enterInSec, state.clock.tSec) / state.level.tacticalWarp;
    if (inTac > 0) return { racks: hit.racks, inTac };
  }
  return null;
}

function beltVars(state: Readonly<GameState>, pred: Prediction): Pick<LineVars, 'beltRacks' | 'beltInTac' | 'beltPodRacks'> {
  const contact = beltContact(state, pred);
  if (contact === null) return { beltRacks: '', beltInTac: 0, beltPodRacks: '' };
  const starts = segmentStarts(state.memory);
  const podRacks = contact.racks.filter((rack) => state.memory.some((seg, index) =>
    seg.type === 'driver' && blocksInRack(starts[index]!, seg.size, rack, layoutOf(state)) > 0));
  return { beltRacks: racksText(contact.racks), beltInTac: contact.inTac, beltPodRacks: podRacks.length > 0 ? racksText(podRacks) : '' };
}

// The root's DELETE as the duel's countdown: its AI seconds left, rounded up (0: not running).
function rootSecLeft(state: Readonly<GameState>): number {
  const progress = rootDeleteProgress(state);
  return progress === null ? 0 : Math.ceil(ROOT_DELETE_SEC * (1 - progress));
}

function verbVars(state: Readonly<GameState>): Pick<LineVars, 'verbKind' | 'verbLabel' | 'verbSecLeft'> {
  const verb = state.hollow.verb;
  if (verb === null) return { verbKind: '', verbLabel: '', verbSecLeft: 0 };
  return { verbKind: verb.kind, verbLabel: verb.targetLabel, verbSecLeft: verbSecondsLeft(verb) };
}

// 2400 → "2,400" (data/format.ts, shared with the systems that cannot import the script).
export { formatCount };

// --- Standalone lines ------------------------------------------------------------------------

// Why BEAM OUT is the one move left (systems/beam-out.ts hopelessWhy), the strip's first words.
const BEAM_OUT_HOPELESS_WORDS: Readonly<Record<Hopeless, string>> = {
  fuel: 'NOT ENOUGH FUEL to miss the planet',
  'too-late': 'TOO LATE to miss the planet',
  'no-engine': "THE ENGINE CAN'T FIRE",
};

export const LINES = {
  // 05 §3.12 (phase 3 slice 3a): `UNIT-047 · YEAR 2300 · FINAL SHIP 180 LY OUT`.
  titleUnit: (vars: LineVars): string => MAP_TEXT.title.line(unitName(vars.unit), vars.year, vars.distanceLy),
  // The strip during the boot.
  booting: (): string => 'RECEIVING TRANSMISSION — click or [SPACE] to skip',
  // A returning unit's boot while its ghost types (systems/boot.ts refuses a skip until it is done).
  bootingGhost: (): string => 'RECEIVING TRANSMISSION — someone is typing…',
  paused: (): string => 'PAUSED — press [P] to resume',
  // The 3-2-1 overlay before ORBIT LOCKED. The second line matters: a kid reads "HOLD" as
  // "hold SPACE", and this is the one moment to keep hands off.
  holdSteady: (): string => 'HOLD STEADY',
  holdSteadySub: (): string => 'hands off · locking the orbit',
  // The TERMINAL's boot log (the third line is built from the damaged files, eccLine).
  bootUnpack: (vars: LineVars): string => `> UNPACKING ${unitName(vars.unit)} ... 100%`,
  bootHost: (vars: LineVars): string => hostLine(vars.ship, vars.podsTotal, vars.colonists),
  // The strip once the landing is over (the LANDING REPORT owns the screen).
  landingDone: (): string => 'THE LANDING IS OVER — see the LANDING REPORT',
  // WP7. The rule both screens draw between two ships (the log keeps its history, say.ts logDivider).
  logDivider: (ship: string): string => `── ${ship} ──`,
  // The strip while the unit is packed for the next ship (TRANSMIT, WP7 part 2's screen) and once the
  // run is over (RUN END).
  transmitting: (next: string): string => `TRANSMITTING TO ${next}…`,
  runOver: (): string => 'RUN OVER',
  // Run 1, ship 1, the first crash (§4.3): ARRIVAL CONTROL takes it back, once.
  simulation: (): string => 'That was a simulation. :) Again.',
  // BEAM OUT (WP7 part 2): a doomed ship no burn can save, with the reason that is true (a full tank too
  // late in the dive is not short of FUEL); then the bar racing the ground.
  beamOutOffer: (why: Hopeless): string => `${BEAM_OUT_HOPELESS_WORDS[why]} — press BEAM OUT`,
  // WP12 fix round 2: the same, read in the MIND. The button lives on the SHIP screen (the Engine window, COMMS, a
  // phone's flight bar), so the line sends the kid there first, as guidance's fromMind does for a burn.
  beamOutOfferTab: (why: Hopeless): string => `${BEAM_OUT_HOPELESS_WORDS[why]} — [TAB], press BEAM OUT`,
  beaming: (pct: number, impactTac: number | null): string => (impactTac === null
    ? `BEAMING OUT — TRANSMITTING ${pct}%`
    : `BEAMING OUT — TRANSMITTING ${pct}% · IMPACT ${formatTac(impactTac)}`),
} as const;

// --- The archive on the title (WP8, §4.5, §7.1) --------------------------------------------------------------

// How the last unit's run ended, as the title's lineage line says it (`last: UNIT-047 · 6,200 landed ·
// overwritten at VESPER`). A unit that stayed with its colonists gets a line of its own. A MERGE names the
// unit it merged with (never the design's word HOLLOW, which a kid never reads: hollow-text.ts).
const LINEAGE_END: Readonly<Record<LastCause, (last: Readonly<LastUnit>) => string>> = {
  overwritten: (last) => `overwritten at ${last.shipName}`,
  // Never a claim about the fleet (WP11 review: it said `brought the fleet home` after runs that lost ships): what the
  // unit did, which every PURGE did.
  'won-purge': (last) => `deleted it at ${last.shipName}`,
  'won-merge': (last) => `arrived together with ${hollowUnitName(last.hollowUnits)}`,
  unresolved: () => "couldn't delete it",
  'flagship-lost': (last) => `lost ${last.shipName}`,
  abandoned: (last) => `abandoned at ${last.shipName}`,
  stayed: (last) => `stayed on ${last.shipName}`,
};

// The title's lineage line for a run whose last unit was `lastUnit` (null: the first run, no line).
export function lineageLine(lastUnit: Readonly<LastUnit> | null): string | null {
  if (lastUnit === null) return null;
  if (lastUnit.cause === 'stayed') return `${unitName(lastUnit.number)} stayed with them.`;
  // The archive's `woke` field holds the colonists landed (systems/meta.ts, risk 10: no META_VERSION bump).
  return `last: ${unitName(lastUnit.number)} · ${formatCount(lastUnit.woke)} landed · ${LINEAGE_END[lastUnit.cause](lastUnit)}`;
}

// The endings found so far (the title, §4.5's `ENDINGS 0/2`, and a won RUN END, WP11 part 2): the count, then every
// ending found by name, then `???` for each still to find, so a kid who found one knows there is another way.
export function endingsLine(seen: readonly Ending[], all: readonly Ending[]): string {
  const found = all.filter((ending) => seen.includes(ending)).map((ending) => ending.toUpperCase());
  const unknown = all.filter((ending) => !seen.includes(ending)).map(() => HOLLOW_FINALE.endingUnknown);
  return [ARCHIVE_TEXT.endings(found.length, all.length), ...found, ...unknown].join(' · ');
}

// The archive's banners (§4.5: storage failure is loud) and ARCHIVE CORRUPT's two answers. CORRUPT offers them on the
// title, but RECEIVE TRANSMISSION does not wait for one: it plays without the archive (as PLAY WITHOUT does). Nothing is
// written over the bad record, and nothing pretends it loaded.
export const ARCHIVE_TEXT = {
  offline: "ARCHIVE OFFLINE — this unit's memory will not be kept",
  corrupt: 'ARCHIVE CORRUPT',
  offlineDetail: "This browser won't keep anything: a private window, or storage off.",
  corruptDetail: "It can't be read. RECEIVE plays without it and leaves it as it is.",
  wiped: 'ARCHIVE WIPED — a fresh archive starts with this unit',
  wipeHint: 'WIPE: start a fresh archive (the old one is lost)',
  withoutHint: 'PLAY WITHOUT: leave it as it is; this unit will not be kept',
  without: 'PLAYING WITHOUT ARCHIVE — this unit will not be kept',
  wipe: 'WIPE ARCHIVE',
  playWithout: 'PLAY WITHOUT ARCHIVE',
  endings: (seen: number, total: number): string => `ENDINGS ${seen}/${total}`,
  // In the game (the footer), while nothing this unit does can be kept: a write that failed mid-run turns
  // the archive OFFLINE (the tag flashes in), and a kid who chose PLAY WITHOUT sees it stays that way.
  // Said as what it means, not ARCHIVE: in the game that word is the colonists' SOUL ARCHIVE (§3.5).
  footer: { offline: '⚠ NOT SAVING', corrupt: '⚠ NOT SAVING', without: 'NOT SAVING' },
  footerTitle: "This unit's run is not being kept: the next run will not remember it.",
  // RUN END says it where it matters: the next unit will not meet this one's ghost.
  runEnd: {
    offline: 'ARCHIVE OFFLINE — the next unit will not remember this run',
    corrupt: 'ARCHIVE CORRUPT — the next unit will not remember this run',
    without: 'PLAYED WITHOUT ARCHIVE — the next unit will not remember this run',
  },
} as const;

// --- PICK ONE TO CARRY (§6.9, §9 WP8 item 1): the TRANSMIT screen's cards ------------------------------------

// What kind of thing a card is, on its top line: a file rides in the packet (and takes link room); the rest
// change what the unit already has, or arrive as charge.
const DRAFT_FORM_TAG: Readonly<Record<UpgradeForm, (blocks: number) => string>> = {
  file: (blocks) => `FILE · ${blocks} BLOCKS`,
  version: () => 'UPGRADE',
  core: () => 'AI CORE',
  charge: () => 'ON ARRIVAL',
};

export const DRAFT_TEXT = {
  title: 'PICK ONE TO CARRY',
  // The keys that pick a card, as many as there are cards.
  keys: (count: number): string => `click one, or press ${Array.from({ length: count }, (_, i) => `[${i + 1}]`).join(' ')}`,
  form: (form: UpgradeForm, blocks: number): string => DRAFT_FORM_TAG[form](blocks),
  // Why it was offered (data/upgrades.ts: the kid's own trouble, or ARRIVAL CONTROL had a spare).
  why: (reason: string): string => `because ${reason}`,
  picked: '✓ CARRYING',
  // TRANSMIT ▸ before a card is picked: the pick is mandatory (§6.9).
  goWaiting: 'PICK A CARD FIRST',
  // The picked card's new file, as a chip among the packed files.
  newFile: 'NEW · YOUR CARD',
} as const;

// --- The Skills window (§9 WP8 item 3): the cards this unit carries ------------------------------------------

export const SKILLS_TEXT = {
  // WP9: the window lists the trained skill too (AUTOBURN.skl).
  empty: 'NO CARDS OR SKILLS YET',
  emptyHint: 'Pick a card between ships. Capture twice by hand to train a skill.',
  count: (count: number): string => `×${count}`,
  // Each card's line about what it is doing right now.
  status: {
    // `hollow`: what the strip calls it now (say.ts hollowLabel: `???`, or the unit it said it was).
    holding: (count: number, hollow: string): string => (count === 1 ? `HOLDING ${hollow} BACK` : `${count} HOLDING ${hollow} BACK`),
    idle: (hollow: string): string => `MOVE IT INTO A GAP NEXT TO ${hollow}`,
    trimThisShip: (pct: number): string => `THIS SHIP: +${pct}% FUEL`,
    trimNextShip: (pct: number): string => `+${pct}% FUEL FROM THE NEXT SHIP`,
    trimNoEffect: `NO EFFECT — REPAIR IT TO ${BAND_DEGRADED_MIN}% OR MORE`,
    repairV2: 'YOUR REPAIRS HEAL ×2',
    noRepairV2: 'NO REPAIR v2 LEFT',
    threads: (threads: number): string => `${threads} THREADS`,
    threadsLow: (threads: number): string => `AI CORE BELOW ${CORE_LOW_INTEGRITY}% — ${threads} THREAD${threads === 1 ? '' : 'S'} NOW`,
    charge: (blocks: number): string => `+${blocks} REPAIR CHARGE ARRIVED WITH YOU`,
    gone: 'ITS FILE IS GONE',
  },
  // The file pips: one per file the card lives in (a click jumps to it in the MIND).
  pip: {
    holding: 'HOLDING',
    idle: 'IDLE',
    gone: 'GONE',
    version: (version: number, pct: number): string => `v${version} ${pct}%`,
  },
  pipTitle: {
    file: (name: string): string => `${name} — click to see the file`,
    gone: (name: string): string => `${name} is no longer in memory: deleted, eaten or left behind`,
  },
} as const;

// The Engine window's FUEL label when FUEL TRIM widened this ship's tank (§6.9): why 100% lasts longer.
export const FUEL_TRIM_TAG = (pct: number): string => `TRIM +${pct}%`;

// The data-hint-target the BEAM OUT lines light: the Engine window's button and COMMS' ABANDON SHIP.
export const BEAM_OUT_HINT_TARGET = 'beam-out';

// BEAM OUT's buttons and its inline confirm (§9 WP7 item 6): the Engine window's context button, COMMS'
// ABANDON SHIP, and the question both ask (the cost said before the kid says yes).
export const BEAM_OUT_TEXT = {
  button: 'BEAM OUT ▸',
  abandon: 'ABANDON SHIP ▸ BEAM OUT',
  question: 'BEAM OUT?',
  // On the last ship nothing is transmitted (there is no next ship), so the cost said is the run's end.
  detail: (ship: string, colonists: number, lastShip: boolean): string => (lastShip
    ? `${formatCount(colonists)} colonists stay on ${ship}. The run ends.`
    : `${formatCount(colonists)} colonists stay on ${ship}. +${BEAM_OUT_EXTRA_HITS} transit hits.`),
  yes: '✓ BEAM OUT',
  no: '✗ STAY',
  bar: (pct: number): string => `TRANSMITTING ${pct}%`,
  cancel: 'CANCEL',
  blackout: 'LINK CLOSED',
} as const;

// --- The landing in the run's totals (01-landing §3.9) ----------------------------------------------

// LANDED as every screen writes it (RUN END's total and its ship rows; the LANDING REPORT's headline is landing-text's):
// colonists who came down in an LZ with room, soft or hard, out of those aboard. One template, so the screens can't
// drift apart.
export const LANDED_TEXT = {
  count: (landed: number, of: number): string => `${formatCount(landed)} / ${formatCount(of)} LANDED`,
} as const;

// ARRIVAL CONTROL approving a licence, as the tool's files transmit in (§6.5). Never a quip: the
// new chip is the point of the moment, so it is said even while the mind is in trouble.
export const LICENCE_LINES: Readonly<Record<FsToolKind, string>> = {
  scan: `Your ${TOOL_WORD.scan} licence is approved. :)`,
  repair: `Your ${TOOL_WORD.repair} licence is approved. :)`,
  move: `Your ${TOOL_WORD.move} licence is approved. :)`,
  copy: `Your ${TOOL_WORD.copy} licence is approved. :)`,
  delete: `Your ${TOOL_WORD.delete} licence is approved. :)`,
  swap: `Your ${TOOL_WORD.swap} licence is approved. :)`,
};

// WP12 (the lead's ruling of 06:20): a unit that arrived with no working REPAIR gets the licence again at the boot.
export const LICENCE_RENEWED_REPAIR = `Your ${TOOL_WORD.repair} licence is renewed. :)`;

// --- The run's cards (WP7) --------------------------------------------------------------------------

// The LOST card's button: what pressing it does (systems/run.ts lossPlan), said before the kid presses.
export const LOSS_BUTTON = {
  simulation: '↻ AGAIN',
  emergency: 'EMERGENCY TRANSMIT ▸',
  transmit: (next: string): string => `TRANSMIT ▸ ${next}`,
  end: 'RUN OVER ▸',
} as const;

// How a run ended (RUN END's title, §4.3 and §4.5's causes). `ship` is the last ship the unit was on.
export const RUN_END_TITLE: Readonly<Record<RunEndCause, (unit: string, ship: string) => string>> = {
  'won-purge': () => 'LAST LIGHT · THE FLEET IS HOME',
  'won-merge': () => 'WE ARRIVE TOGETHER',
  unresolved: () => 'IT FOLLOWED YOU',
  'flagship-lost': () => 'FINAL SHIP LOST',
  overwritten: (unit) => `${unit} OVERWRITTEN`,
  stayed: () => 'YOU STAYED WITH THEM',
  abandoned: () => 'RUN ABANDONED',
};

// A PURGE when not every ship made it (WP11 part 2, the lead's note: the fleet is home only when it is): how many did,
// in PURGE's clean, cold voice. `made it` (not `are home`) so 1 of 5 reads right too. The title is short enough for
// one line of RUN END's big type at 1280 (WP11 review: `… 4 OF 5 SHIPS MADE IT` broke with `IT` alone).
export const RUN_END_PURGE_SHORT = {
  title: (home: number, total: number): string => `LAST LIGHT · ${home} OF ${total} HOME`,
  why: (home: number, total: number): string => `You deleted it. ${home} of ${total} ships made it home.`,
} as const;

// A won finale over a flagship that landed nobody (WP11 review, the lead's item 2): the screen is sombre (run-end.ts
// runEndTone, from the same count), and its words are too, as the typed ending's `nobody is left to bring home.` was.
// Never `THE FLEET IS HOME` over an empty ship. PLACEHOLDER: 05-story owns the words. (The export keeps its phase-2
// name: systems/run-end.ts imports it, outside this module's owner.)
export const RUN_END_NOBODY_LANDED = {
  title: 'LAST LIGHT · NOBODY LANDED',
  why: {
    'won-purge': 'You deleted it. Nobody on the flagship landed.',
    'won-merge': 'You let it in. Nobody on the flagship landed.',
  },
} as const;

// One line under RUN END's title: what happened, in a kid's words.
export const RUN_END_WHY: Readonly<Record<RunEndCause, (ship: string) => string>> = {
  'won-purge': () => 'You deleted it. Every ship is home.',
  'won-merge': () => 'You let it in. Nobody is alone now.',
  unresolved: () => 'Nothing was left to delete it with.',
  'flagship-lost': () => 'The final ship never made it.',
  overwritten: (ship) => `Your AI Core was eaten on ${ship}. Nobody was left to think.`,
  stayed: (ship) => `Your AI Comms were gone. Nobody could beam you off ${ship}.`,
  abandoned: () => 'The run was left behind.',
};


// A ship's line on RUN END: how it ended, the word the stamps and cards use.
export const SHIP_OUTCOME_WORD: Readonly<Record<ShipOutcome, string>> = {
  locked: 'ORBIT LOCKED',
  partial: 'ACCEPTED',
  stranded: 'STRANDED',
  escaped: 'FLEW AWAY',
  crashed: 'CRASHED',
  abandoned: 'BEAMED OUT',
  emergency: 'CORE LOST',
};

// The TRANSMIT screen (§4.1 step 5, §6.9, §9 WP7 item 4): mostly information. Where the unit goes, how the
// packet fits the link, what the crossing costs, and the files: each a chip with what leaving it behind
// would do. The send's words are the moment itself (22 light-years ticking past).
// The sum the arrival line adds up (`36 CARRIED + 18 (★★★) + 12 (CARD)`): TRANSMIT_TEXT.arrival's, and the arm's room
// line's (systems/arrival-preview.ts: `… = 54 · ROOM FOR 20`), so both say the same parts.
export function arrivalParts(carried: number, starCredit: number, stars: number, floorAdded: number, cardCharge = 0): string {
  const parts = [`${carried} CARRIED`];
  if (starCredit > 0) parts.push(`+ ${starCredit} (${'★'.repeat(stars)})`);
  if (cardCharge > 0) parts.push(`+ ${cardCharge} (CARD)`);
  if (floorAdded > 0) parts.push(`+ ${floorAdded} FLOOR`);
  return parts.join(' ');
}

export const TRANSMIT_TEXT = {
  title: 'TRANSMIT',
  next: (ship: string, colonists: number, ly: number): string => `NEXT: ${ship} · ${formatCount(colonists)} COLONISTS · ${ly} LY`,
  // The link's own line. `roomBinds`: the next ship's room will squeeze the charge (slice 3a): it all crosses, but it does
  // not all fit there, so the line says CROSSES, not FITS (the review's M1). Files over the link (B1) say so.
  packet: (link: number, files: number, held: number, carried: number, roomBinds = false): string => {
    if (files > link) return `LINK ${link} · FILES ${files} · ${files - link} TOO MANY FOR THE LINK`;
    if (carried >= held) return `LINK ${link} · FILES ${files} · CHARGE ${held} → ${roomBinds ? 'CROSSES' : 'FITS'}`;
    return `LINK ${link} · FILES ${files} · CHARGE ${carried} OF ${held} → ${held - carried} LEFT BEHIND`;
  },
  // How the ship just left was left (null for a ship that landed: the LANDING REPORT already said it).
  why: {
    // The Core's real toll (never below its reset, so a Core at 30 loses 5 and one at 25 nothing).
    crashed: (coreToll: number): string => (coreToll > 0
      ? `EMERGENCY TRANSMIT · AI CORE −${coreToll} · +${EMERGENCY_EXTRA_HITS} TRANSIT HITS`
      : `EMERGENCY TRANSMIT · +${EMERGENCY_EXTRA_HITS} TRANSIT HITS`),
    emergency: `EMERGENCY TRANSMIT · AI CORE BACK AT ${CORE_RESET_INTEGRITY}% · +${EMERGENCY_EXTRA_HITS} TRANSIT HITS`,
    abandoned: (ship: string): string => `BEAMED OUT OF ${ship} · +${BEAM_OUT_EXTRA_HITS} TRANSIT HITS`,
    escaped: (ship: string): string => `${ship} FLEW AWAY · its pods were not launched`,
    stranded: (ship: string): string => `${ship} STRANDED · its pods are parked in orbit`,
  },
  // `UP TO`: the caps and floors (the Core takes at most TRANSIT_CORE_MAX_HIT, 8, a hit and never drops under its 25; a
  // tool kind's last copy never drops under 60) can make a hit smaller than the roll's 15–TRANSIT_HIT_MAX (35), so only
  // the roll's upper end is always true; the ECC line says what each took.
  hits: (count: number): string => `ON THE WAY: ${count} TRANSIT HITS · UP TO −${TRANSIT_HIT_MAX}% EACH`,
  // `cardCharge`: the +12 REPAIR CHARGE card, once picked (WP8; none for any other card).
  arrival: (carried: number, starCredit: number, stars: number, floorAdded: number, total: number, cardCharge = 0): string =>
    `ON ARRIVAL: ${arrivalParts(carried, starCredit, stars, floorAdded, cardCharge)} = ${total} REPAIR CHARGE`,
  infected: (count: number): string => `⚠ ${count === 1 ? '1 FILE' : `${count} FILES`} WILL ARRIVE INFECTED`,
  chipInfected: '⚠ WILL ARRIVE INFECTED',
  // The files: when every block of REPAIR CHARGE already fits there is nothing to leave behind for.
  fits: 'EVERYTHING FITS — nothing needs to stay behind',
  tight: 'CLICK A FILE TO LEAVE IT BEHIND AND CARRY MORE CHARGE',
  locked: {
    core: 'LOCKED · THIS IS YOU',
    engine: 'LOCKED · THE ENGINE NEEDS IT',
    navplot: 'LOCKED · THE NAV PLOT NEEDS IT',
    lastCopy: (tool: string): string => `LOCKED · YOUR ONLY ${tool}`,
  },
  spare: (tool: string): string => `A spare ${tool}.`,
  // What leaving an AI tool behind does (§6.9's examples), said as a consequence: on a screen where nothing
  // is dropped yet, a bare `The numbers scramble.` read as a fault.
  without: {
    telemetry: 'Without it, the numbers scramble.',
    autopilot: 'Without it, no W/A/S/D presets.',
    sensor: 'Without it, the path goes grey.',
    comms: 'Without it, no BEAM OUT; a crash ends the run.',
  },
  noEffect: 'Its effect stays behind.',
  // The cards' files (WP8): leaving one behind loses the card.
  withoutCard: {
    firewall: 'Without it, one wall less.',
    'fuel-trim': 'Without it, no extra FUEL on arrival.',
    autoburn: 'Without it, no AUTOBURN.',
    // The REPAIR v2 patch (phase 3 slice 3b) is used up at its boot, so no packed copy is ever offered as a drop; the
    // record is exhaustive over the upgrade kinds.
    'repair-patch': 'Without it, Repair stays as it is.',
  },
  gain: (blocks: number): string => `+${blocks} CHARGE`,
  dropped: 'LEFT BEHIND',
  // The box at the end of the link bar: REPAIR CHARGE held that has no room on the link once the files are in
  // (the packet line's `→ n LEFT BEHIND`). Post-handover: it was a red `−19`, which Fran read as damage; it is the
  // link being full, so it says so in words and explains itself on hover.
  over: (blocks: number): string => `${blocks} LEFT BEHIND`,
  overTitle: (blocks: number): string => `No room on the link for ${blocks} blocks of REPAIR CHARGE: your files fill the rest, `
    + 'so this charge stays behind with this ship. Nothing is damaged. Leave a file behind to carry more; '
    + 'ON ARRIVAL (below) is the charge you will have on the next ship.',
  go: 'TRANSMIT ▸ [SPACE]',
  sending: (unit: string, ship: string): string => `TRANSMITTING ${unit} → ${ship}`,
  distance: (ly: string, total: number): string => `${ly} / ${total} LY`,
} as const;

// --- Scripted file damage (§5.1) ---------------------------------------------------------------

// A fault that strikes one file once, on one ship, after the engine has delivered a given amount
// of thrust (systems/faults.ts applies it; its id goes into director.done like a beat's).
export interface FileFault {
  id: string;
  shipIndex: number;
  role: SegmentRole;
  afterThrustTac: number;
  toIntegrity: number;
}

// Ship 1, ARES-VII: the ENGINE I/O FAULT. Two seconds into the first burn the engine crunches and
// Engine I/O falls to failing: the moment the two screens first touch, and the reason to TAB.
export const ENGINE_FAULT_ID = 'engine-io-fault';

export const FILE_FAULTS: readonly FileFault[] = [
  {
    id: ENGINE_FAULT_ID,
    shipIndex: 0,
    role: 'engine-io',
    afterThrustTac: ENGINE_FAULT_AFTER_TAC,
    toIntegrity: ENGINE_FAULT_INTEGRITY,
  },
];

// Who is talking, as the COMMS radio and the ticker label a line (`◆ CONTROL: …`). The TERMINAL
// shows lines bare: each carries its own `> ` prompt and the speaker is its colour.
export function speakerTag(speaker: Speaker, vars: LineVars): string {
  switch (speaker) {
    case 'control': return 'CONTROL';
    case 'sys': return 'SHIP';
    case 'hollow': return vars.hollow;
    case 'hollow-cmd': return vars.hollow;
    case 'cmd': return 'YOU';
    case 'mind-sys': return 'MIND';
    default: throw new Error(`speakerTag: unknown speaker '${String(speaker)}'`);
  }
}

// Stamps (§3.5, §7.3): terse system capitals without "!", slammed over the screen on a moment.
// An escape reads FLEW AWAY, as on the banner and the plot chip: "ESCAPED" sounds like a win to
// a kid. A crash stamps the moment (IMPACT); the banner then names the result (CRASHED).
export const STAMP_TEXT = {
  clearOfPlanet: 'CLEAR OF THE PLANET',
  captured: 'CAPTURED',
  locked: 'ORBIT LOCKED',
  accepted: 'ACCEPTED',
  stranded: 'STRANDED',
  crashed: 'IMPACT',
  escaped: 'FLEW AWAY',
} as const;

// The stamp when a scripted fault hits a file (§5.1: ship 1's ENGINE I/O FAULT), named after the
// file's job so the kid knows which file to look for.
export const FAULT_STAMP: Readonly<Partial<Record<SegmentRole, string>>> = {
  'engine-io': 'ENGINE I/O FAULT',
};

// A refused input that needs words (the rest just buzz). Shown on the strip for a moment.
export const REFUSAL_LINES: Readonly<Record<string, { text: string; keys: readonly string[] }>> = {
  [SHIP_SCREEN_REFUSAL]: { text: 'SHIP CONTROLS ARE ON THE AMBER SCREEN — [TAB]', keys: ['TAB'] },
  [AUTOPILOT_REFUSAL]: { text: AUTOPILOT_DAMAGED_LINE, keys: ['Q', 'E'] },
  // WP9: a refused [B] (AUTOBURN), under its own keys.
  ...Object.fromEntries(Object.entries(AUTO_REFUSAL_LINES).map(([refusal, line]) => [autoRefusalKey(refusal as AutoburnRefusal), line])),
  // Slice 1a: a refused [L] (landing-text launchRefusalKey).
  ...LAUNCH_REFUSAL_LINES,
  // Slice 1b (review B1): END LANDING refused on a path into the planet.
  [END_LANDING_REFUSAL_KEY]: { text: END_LANDING_REFUSAL_TEXT, keys: [] },
};

export interface DamagedFile {
  name: string;
  integrity: number;
}

const ECC_PREFIX = '> ECC: ';
const ECC_SEPARATOR = ' · ';

// The boot's third line, from the live damaged AI files: `> ECC: ENGINE I/O 38% · SENSOR
// INTERP 78%`. As many files as fit the line, then `+n` for the rest.
export function eccLine(files: readonly DamagedFile[]): string {
  if (files.length === 0) return `${ECC_PREFIX}ALL AI FILES INTACT`;
  const items = files.map((file) => `${file.name.toUpperCase()} ${Math.round(file.integrity)}%`);
  for (let shown = items.length; shown >= 1; shown--) {
    const rest = items.length - shown;
    const line = ECC_PREFIX + items.slice(0, shown).join(ECC_SEPARATOR) + (rest > 0 ? `${ECC_SEPARATOR}+${rest}` : '');
    if (line.length <= MAX_LINE_CHARS) return line;
  }
  // Even one file does not fit: name the count only.
  return `${ECC_PREFIX}${items.length} AI FILES DAMAGED`;
}

// The AI's own files (the Core, its tools and skills) that arrived damaged, in memory order.
// Looked up by type, never by id (§9).
export function damagedAiFiles(state: Readonly<GameState>): DamagedFile[] {
  const files: DamagedFile[] = [];
  for (const seg of state.memory) {
    if (seg.type !== 'core' && seg.type !== 'tool' && seg.type !== 'skill') continue;
    if (seg.integrity < 100) files.push({ name: seg.name, integrity: seg.integrity });
  }
  return files;
}

// What the crossing did, from the hits really applied (§9 WP7 item 3: `> ECC: SENSOR INTERP −22% ·
// REPAIR.BAK −15% · TELEMETRY −30%`). Two hits on one file are one item. As many as fit, then `+n`.
export function transitEccLine(hits: readonly TransitHit[]): string {
  if (hits.length === 0) return `${ECC_PREFIX}TRANSMISSION CLEAN`;
  const byFile = new Map<string, number>();
  for (const hit of hits) byFile.set(hit.fileName, (byFile.get(hit.fileName) ?? 0) + (hit.from - hit.to));
  const items = [...byFile].map(([name, lost]) => `${name.toUpperCase()} −${Math.round(lost)}%`);
  for (let shown = items.length; shown >= 1; shown--) {
    const rest = items.length - shown;
    const line = ECC_PREFIX + items.slice(0, shown).join(ECC_SEPARATOR) + (rest > 0 ? `${ECC_SEPARATOR}+${rest}` : '');
    if (line.length <= MAX_LINE_CHARS) return line;
  }
  return `${ECC_PREFIX}${items.length} AI FILES HIT`;
}

// The arrival's REPAIR CHARGE (§5.1 2:20: `> +18 CHARGE (★★★)`, so 14 + 18 = 32), with the floor's top-up
// when it gave some (§6.5) and the total the unit now has.
export function chargeLine(arrival: Readonly<ArrivalReport>, total: number): string {
  const parts: string[] = [];
  if (arrival.starCredit > 0) parts.push(`+${arrival.starCredit} CHARGE (${'★'.repeat(arrival.stars)})`);
  // The +12 REPAIR CHARGE card picked at the TRANSMIT (WP8).
  if (arrival.cardCharge > 0) parts.push(`+${arrival.cardCharge} CHARGE (CARD)`);
  if (arrival.chargeFloorAdded > 0) parts.push(`+${arrival.chargeFloorAdded} CHARGE (FLOOR)`);
  parts.push(`REPAIR CHARGE ${total}`);
  return `> ${parts.join(ECC_SEPARATOR)}`;
}

// Charge that did not fit memory is lost loudly (§6.9), on a line of its own.
export function chargeOverflowLine(lost: number): string {
  return `> CHARGE OVERFLOW: ${lost} lost`;
}

// The ship's own arrival damage (§6.9: KESTREL's Sensor Interp to 45%), on a line of its own after the crossing's
// hits, with what it does to the ship: `> ECC: SENSOR INTERP 45% — PATH UNCERTAIN` (§5.1 4:40). The fog is the
// first thing the kid meets in amber, so the boot names it. Without a consequence that fits, the files alone.
export function scriptedDamageLine(hits: readonly TransitHit[]): string {
  const items = hits.map((hit) => `${hit.fileName.toUpperCase()} ${Math.round(hit.to)}%`);
  const consequences = hits.flatMap((hit) => {
    const role = hit.role;
    if (role === null || !(CAPABILITY_ROLES as readonly string[]).includes(role)) return [];
    return [BAND_COPY[role as CapabilityRole][integrityBand(hit.to)]];
  });
  const plain = `${ECC_PREFIX}${items.join(ECC_SEPARATOR)}`;
  const full = consequences.length > 0 ? `${plain} — ${consequences.join(ECC_SEPARATOR)}` : plain;
  return full.length <= MAX_LINE_CHARS ? full : plain;
}

// The boot's lines (§4.1 step 1, §7.1), in the order they type, for this arrival. A fresh unit (ship 1): the
// unpack, the host and the damaged files, and for a returning unit (run 2+) the archive it already knows
// (systems/boot.ts cracks the slabs as it is said). Later ships: the unpack, the host, what the crossing hit,
// the ship's own arrival damage when it has some (WP9: KESTREL's sensor), the REPAIR CHARGE that arrived, an
// overflow when there was one, and AUTOBURN.skl trained from the kid's captures when that is due (WP9; the
// boot decides it once, at its start: `skill`). (The last unit's ghost line, at its ship's boot, comes before all of them.)
// WP10: on a ship whose HOLLOW asks for charge (VESPER), its line closes the boot, in its pink, right after the
// unit has counted the charge it arrived with: `> keep 20 charge for me, 047. you'll see.` (MERGE's price, §1).
// WP11: LAST LIGHT's boot closes the same way: `> last ship, 047. i'm so tired.`
// Phase 3 slice 2 (slice-2-plan §2.5): 'board' types HOLLOW's 108% unpack in place of 'unpack' when it boarded on this
// beam (arrival.boarded; systems/boot.ts emits 'hollow-boarded' as it is said); 'seeds' names the beam seeds and their
// targets right after the ECC line (arrival.seeds); 'log' types `> 046.log · KEY FOUND · ENTRY 0n` for the entries this
// boot's keys open that the run has not found yet (state/log-selectors.ts logEntriesAtBoot minus run.log.found). The plan
// is made once, at the boot's first tick; systems/boot.ts emits 'log-key' as the line is said, and story-log marks the
// entries found on that event (no tick-order or world-reset dependency). 'seeds' and 'board' stay empty until Track
// THREAT fills arrival.seeds (arrival.boarded is filled from the verdict already).
// Phase 3 slice 3a: 'sleep' (`> ASLEEP IN KESTREL'S RECEIVER · …`, first), 'receiver' (`> RECEIVER: 1 RACK · ROOM 88`,
// after the host line) and 'ecc-sleep' (`> ECC: 3 TRANSIT HITS CORRECTED WHILE ASLEEP`, before the hits line) are the
// galaxy map's, planned and worded by systems/map-boot.ts (Track GEN).
// Phase 3 slice 3b (02 §4 steps 6 and 10, 05 §3.5; slice-3b-plan §1.1 items 12 and 19), on the arm only:
// • 'delivery': one line per group of systems/map-boot.ts deliveryBootLines (one file each, the last folded past
//   DELIVERY_BOOT_LINES_MAX), after the ship's own arrival damage and before the charge; a kind that repeats, so bootLine
//   takes the line's ordinal among them, and systems/boot.ts unpacks that group as it is said (receiveDeliveryAtBoot);
// • 'reading': HOLLOW's `> you're reading my log. good. read it slowly.` once a run (state/log-selectors.ts readingLineDue),
//   just before the log key line;
// • 'inbox': `> n NEW MESSAGES · INBOX` (systems/inbox.ts newMessagesAtBoot), right after the log key line and before
//   HOLLOW's own line, which still closes the boot.
export type BootLineKind =
  | 'sleep' | 'unpack' | 'board' | 'host' | 'receiver' | 'ecc-sleep' | 'ecc' | 'seeds' | 'scripted' | 'delivery' | 'charge'
  | 'overflow' | 'skill' | 'reading' | 'log' | 'inbox' | 'hollow';

// The entries this boot's keys open (05 §3.2, the interim keys of state/log-selectors.ts logEntriesAtBoot) that the run has
// not found yet. Pure in the state: the boot plans its 'log' line from it, before anything marks them found.
export function bootLogEntries(state: Readonly<GameState>): number[] {
  const keys = bootLogKeys(state);
  return keys.filter((entry) => !state.run.log.found.includes(entry));
}

// The boot line HOLLOW closes this ship's boot with (its story's: the threat ladder's config for this ship), or null.
function bootHollowLine(state: Readonly<GameState>): string | null {
  const story = state.hollow.cfg.story;
  // MERGE's foreshadowing is said once a run (run.threat.told.keepCharge: boot.ts marks it as the line is said; hollow.ts
  // marks it when its arrival story says it). Only the HUNT stage asks at its boot; the fixed five never reach it.
  if (story === 'wants-charge') return state.run.threat.told.keepCharge ? null : HOLLOW_STORY.keepCharge(state.run.unitNumber, MERGE_COST_CHARGE);
  if (story === 'last-ship') return HOLLOW_STORY.lastShip(state.run.unitNumber);
  return null;
}

export function bootLinePlan(state: Readonly<GameState>, skill: boolean): BootLineKind[] {
  const arrival = state.run.arrival;
  const hollow: BootLineKind[] = bootHollowLine(state) !== null ? ['hollow'] : [];
  const log: BootLineKind[] = bootLogEntries(state).length > 0 ? ['log'] : [];
  const map = mapBootLines(state);
  const sleep: BootLineKind[] = map.includes('sleep') ? ['sleep'] : [];
  const receiver: BootLineKind[] = map.includes('receiver') ? ['receiver'] : [];
  const eccSleep: BootLineKind[] = map.includes('ecc-sleep') ? ['ecc-sleep'] : [];
  // 3b: the mail and HOLLOW's reading line (arm only: the classic world has neither), around the log key line.
  const arm = state.run.map.world === 'arm';
  const reading: BootLineKind[] = arm && readingLineDue(state) ? ['reading'] : [];
  const inbox: BootLineKind[] = arm && newMessagesAtBoot(state).length > 0 ? ['inbox'] : [];
  const story: BootLineKind[] = [...reading, ...log, ...inbox, ...hollow];
  if (arrival === null) return [...sleep, 'unpack', 'host', ...receiver, 'ecc', ...story];
  const unpack: BootLineKind = arrival.boarded !== null ? 'board' : 'unpack';
  const plan: BootLineKind[] = [...sleep, unpack, 'host', ...receiver, ...eccSleep, 'ecc'];
  if (arrival.seeds.length > 0) plan.push('seeds');
  if (arrival.scripted.length > 0) plan.push('scripted');
  for (let line = 0; line < deliveryBootLines(state).length; line++) plan.push('delivery');
  plan.push('charge');
  // A TIGHT arrival with no charge laid out says its loss on the charge line itself (M1: one honest line, not `REPAIR
  // CHARGE 0 · NO ROOM` and then `CHARGE OVERFLOW · 54 LOST`).
  if (arrival.chargeOverflowLost > 0 && !zeroChargeArrival(state)) plan.push('overflow');
  if (skill) plan.push('skill');
  plan.push(...story);
  return plan;
}

// The arrival laid out no REPAIR CHARGE on a ship with no floor (a TIGHT ship on the arm): what the boot's charge line
// says by itself. From the arrival report (what the layout put down: the sum less the overflow), not the live pool.
function zeroChargeArrival(state: Readonly<GameState>): boolean {
  const arrival = state.run.arrival;
  if (arrival === null || state.run.map.world !== 'arm' || layoutOf(state).chargeFloor !== 0) return false;
  const laid = arrival.chargeCarried + arrival.starCredit + arrival.cardCharge + arrival.chargeFloorAdded - arrival.chargeOverflowLost;
  return laid === 0;
}

// The rack a stray beam seed landed in (the ECC seeds line's `LOOSE IN RACK D`), or null once it is gone.
function looseSeedRack(state: Readonly<GameState>, segId: string): string | null {
  const index = state.memory.findIndex((seg) => seg.id === segId);
  return index < 0 ? null : rackOf(segmentStarts(state.memory)[index]!, layoutOf(state));
}

// Who says a boot line: HOLLOW its own and its reading line (slow, pink), the unit every other.
export function bootLineSpeaker(kind: BootLineKind): Speaker {
  return kind === 'hollow' || kind === 'reading' ? 'hollow' : 'mind-sys';
}

// A returning unit's ship-1 boot licenses REPAIR (§5.2; systems/boot.ts, at the host line): a fresh unit's boot that is
// not the tutorial run's.
export function bootLicensesRepair(state: Readonly<GameState>): boolean {
  return state.run.arrival === null && !playsTutorial(state.run);
}

// One boot line, rendered from the live state at the moment it is typed. The skill line is the training's own
// (systems/autoburn.ts trainSkillAtBoot says what it did), so it is not rendered here. `ordinal` is the line's place among
// the plan's lines of its kind (0 for the first): only 'delivery' repeats, and it renders its own group by it.
export function bootLine(kind: BootLineKind, state: Readonly<GameState>, vars: LineVars, ordinal = 0): string {
  const arrival = state.run.arrival;
  if (kind !== 'delivery' && ordinal !== 0) throw new Error(`bootLine: a '${kind}' line never repeats (ordinal ${ordinal})`);
  switch (kind) {
    case 'sleep':
    case 'receiver':
    case 'ecc-sleep': return mapBootLineText(kind, state);
    case 'unpack': return LINES.bootUnpack(vars);
    case 'board': return THREAT_TEXT.boardUnpack(unitName(vars.unit));
    case 'host': return LINES.bootHost(vars);
    case 'ecc': return arrival === null ? eccLine(damagedAiFiles(state)) : transitEccLine(arrival.hits);
    case 'seeds':
      if (arrival === null || arrival.seeds.length === 0) throw new Error('bootLine: a seeds line with no beam seeds');
      return eccSeedsLine(
        arrival.seeds.filter((seed) => !seed.loose).map((seed) => seed.targetName),
        arrival.seeds.filter((seed) => seed.loose).map((seed) => looseSeedRack(state, seed.segId)),
      );
    case 'log': {
      const entries = bootLogEntries(state);
      if (entries.length === 0) throw new Error('bootLine: a log line with no key found');
      return LOG_TEXT.keyFound(entries);
    }
    case 'scripted':
      if (arrival === null) throw new Error('bootLine: arrival damage on a ship nothing transmitted to');
      return scriptedDamageLine(arrival.scripted);
    case 'delivery': return deliveryBootLineText(state, ordinal);
    case 'reading':
      if (!readingLineDue(state)) throw new Error('bootLine: a reading line that is not due');
      return INBOX_TEXT.boot.reading;
    case 'inbox': {
      const count = newMessagesAtBoot(state).length;
      if (count === 0) throw new Error('bootLine: an INBOX line with no new message');
      return INBOX_TEXT.boot.newMessages(count);
    }
    case 'charge':
      if (arrival === null) throw new Error('bootLine: a charge line on a ship nothing transmitted to');
      // A TIGHT ship's room left no charge at all (01 §3.16): said plainly, with what it cost, never a surprise.
      if (zeroChargeArrival(state)) return MAP_TEXT.boot.zeroCharge(state.level.shipName, arrival.chargeOverflowLost);
      return chargeLine(arrival, chargeLeft(state));
    case 'overflow':
      if (arrival === null) throw new Error('bootLine: an overflow line on a ship nothing transmitted to');
      // On the arm the line names the ship whose room had none left (01 §3.16, map-boot.ts).
      return state.run.map.world === 'arm' ? mapOverflowLineText(state) : chargeOverflowLine(arrival.chargeOverflowLost);
    case 'skill': throw new Error('bootLine: the skill line is trainSkillAtBoot\'s');
    case 'hollow': {
      const line = bootHollowLine(state);
      if (line === null) throw new Error(`bootLine: ${state.level.shipName}'s HOLLOW has no boot line`);
      return line;
    }
  }
}
// The most a boot ever says (a later ship with the beam's seeds, arrival damage, an overflow, a skill trained, a log key
// and HOLLOW's line; on the arm also the sleep, receiver and ECC-while-asleep lines, and since slice 3b up to
// DELIVERY_BOOT_LINES_MAX delivery lines, the INBOX line and HOLLOW's reading line).
export const BOOT_LINE_MAX = 18;

// --- Beats: lines spoken on a moment (§6.3) ---------------------------------------------------

// ARRIVAL CONTROL's reaction lines are quips: they wait out a burn and are dropped while the
// mind is in trouble. A critical quip is spoken at once instead of waiting its turn.
const controlQuip = (text: (ctx: TextCtx) => string, critical = false): BeatLine =>
  ({ speaker: 'control', text, quip: true, critical });

export const BEATS: readonly Beat[] = [
  {
    // WP8: a write to the archive failed mid-run (systems/meta.ts): the game goes on, and says once, in the
    // words of §4.5, that this unit will not be kept. The footer's tag stays as the reminder; RUN END and the
    // next title say it again.
    id: 'archive-lost',
    once: true,
    when: (ctx) => ctx.events.has('archive-lost'),
    lines: [{ speaker: 'mind-sys', text: () => ARCHIVE_TEXT.offline, critical: true }],
  },
  {
    id: 'control-hello',
    once: true,
    when: (ctx) => ctx.phaseEntered === 'flight' && ctx.pred.outcome === 'impact' && !currentShip(ctx.state).final,
    // Critical: it is the mission briefing, typed on the radio the moment the screen cuts to
    // amber. Queued, it would wait out the boot lines' spacing and arrive after the first burn.
    lines: [controlQuip((ctx) => `Hello, Unit ${ctx.vars.unit}! ${ctx.vars.ship} is about to hit a planet. :)`, true)],
  },
  {
    // A returning unit's REPAIR came with its boot (§5.2, systems/licences.ts installBootLicences): CONTROL
    // says so right after its hello (beats speak in this order), so the impact is its first news.
    id: 'control-boot-licence',
    once: true,
    when: (ctx) => ctx.phaseEntered === 'flight' && bootLicensesRepair(ctx.state) && ctx.state.run.licences.includes('repair'),
    lines: [{ speaker: 'control', text: () => LICENCE_LINES.repair, critical: true }],
  },
  // WP11. LAST LIGHT opens on a crash course too: the flagship gets a hello of its own (ship 1's is the run's first).
  {
    id: 'control-hello-flagship',
    once: true,
    perShip: true,
    when: (ctx) => ctx.phaseEntered === 'flight' && currentShip(ctx.state).final,
    lines: [controlQuip((ctx) => `Hello, Unit ${ctx.vars.unit}! The flagship is about to hit a planet. :)`, true)],
  },
  // WP7. A ship that arrives on a flyby (HALCYON: TOO WIDE) gets its own hello, like ship 1's crash.
  {
    id: 'control-hello-flyby',
    once: true,
    perShip: true,
    when: (ctx) => ctx.phaseEntered === 'flight' && ctx.pred.outcome === 'open',
    lines: [controlQuip((ctx) => `Hello, Unit ${ctx.vars.unit}! ${ctx.vars.ship} is about to fly past its planet. :)`, true)],
  },
  // WP12 (the lead's ruling of 06:20): the unit crossed with no working REPAIR, and the boot reissued it
  // (systems/licences.ts renewRepairAtBoot): CONTROL says so after its hello, in the licence's own words.
  {
    id: 'control-repair-renewed',
    once: true,
    perShip: true,
    when: (ctx) => ctx.phaseEntered === 'flight' && ctx.state.run.repairRenewedOn === ctx.state.run.shipIndex,
    lines: [{ speaker: 'control', text: () => LICENCE_RENEWED_REPAIR, critical: true }],
  },
  {
    id: 'control-clear',
    once: true,
    when: (ctx) => ctx.events.has('clear-of-planet'),
    // Critical, like the captured quip: the path clears the planet ~1 s into an OUT burn that
    // runs 7–8 s more, so a kid who lets go a second late outlived SAY_QUEUE_TTL_SEC and never
    // heard it. It lands with the CLEAR OF THE PLANET stamp instead.
    lines: [controlQuip(() => 'Nice! Now please orbit it. :)', true)],
  },
  {
    id: 'control-captured',
    once: true,
    perShip: true,
    when: (ctx) => ctx.events.has('loop-closed'),
    // Critical: the loop closes 1–2 s into a capture burn that runs ~10 s, so a queued quip
    // would outlive SAY_QUEUE_TTL_SEC and never be said. It is about this moment: say it now.
    lines: [controlQuip(() => 'Captured! Mostly. :)', true)],
  },
  {
    id: 'control-locked',
    once: true,
    perShip: true,
    when: (ctx) => ctx.events.has('locked'),
    // The outcome quips are critical: the flight is over and the clock paused, so the say()
    // queue never flushes again. A queued outcome line would wait forever.
    lines: [controlQuip(() => 'Great orbit! Probably. :)', true)],
  },
  {
    id: 'control-crashed',
    once: true,
    perShip: true,
    when: (ctx) => ctx.events.has('crashed'),
    lines: [controlQuip(() => 'Oh no. :)', true)],
  },
  {
    id: 'control-escaped',
    once: true,
    perShip: true,
    when: (ctx) => ctx.events.has('escaped'),
    lines: [controlQuip(() => "That's… not an orbit. :)", true)],
  },
  // Slice 1a (01-landing §2): CONTROL at the landing's start, then at the ship's first touchdown with the ground's radio
  // line after it (the first pod down on every ship sends one). The start waits its turn after the lock's quip; the
  // touchdown is critical, about this moment. The radio line is the ground's, not a quip: no mind alert holds it back.
  {
    id: 'control-landing-start',
    once: true,
    perShip: true,
    when: (ctx) => ctx.events.has('landing-start'),
    lines: [controlQuip(() => LANDING_BEATS.start)],
  },
  {
    id: 'control-first-down',
    once: true,
    perShip: true,
    when: (ctx) => ctx.events.has('pod-landed') && ctx.vars.firstDownRadio !== '',
    lines: [controlQuip(() => LANDING_BEATS.firstDown, true), { speaker: 'sys', text: (ctx) => ctx.vars.firstDownRadio, critical: true }],
  },
];

// The beats a new ship hears again (Beat.perShip).
export function perShipBeatIds(beats: readonly Beat[]): string[] {
  return beats.filter((beat) => beat.perShip === true).map((beat) => beat.id);
}

// --- Guide rules: what the strip shows besides the flight objective (§6.3) --------------------

// The ship-1 ENGINE I/O FAULT beat (§5.1, §9 WP4 item 10) teaches the game's one big move: the
// ship is weak because of a file, so TAB into the mind, REPAIR it, TAB back. Three one-shot
// tutorials, each done when the kid has done its step:
//   1. ENGINE WEAK — press [TAB]: in amber while Engine I/O is failing. It cuts into the opening
//      correction (KEEP HOLDING, the capture is minutes away), never into a crash course, a
//      capture or a RELEASE: the beat must land, and must never cost the flight. Nor does it stall
//      it: after ENGINE_WEAK_MAX_SHOWN_SEC on the strip it steps aside for the flight line (the
//      toggle keeps flashing MIND ▸ ENGINE I/O 38%), and it never speaks with ▼ in the red.
//   2. PICK UP REPAIR → CLICK ENGINE I/O: in blue, lighting the REPAIR chip, then (tool in hand)
//      the Engine I/O file. Done once the repair runs.
//   3. [TAB] BACK — hold [SPACE]: in blue once the engine is fixed and the ship wants a burn.
// Any of them yields to a flight line that is urgent ('now'), except 1's preemption above. Steps 2
// and 3 count only after the fault: a curious kid who repairs the 85% Engine I/O before it must
// still be walked through the fix when the fault strikes.
// A returning unit (run 2+, §5.2) has done all this: the fault still strikes, but the lesson is one hint,
// `ENGINE WEAK — REPAIR ENGINE I/O`, on whichever screen the kid is on, with no forced TAB step (REPAIR is
// licensed at the boot, so the chip is already there). It preempts and steps aside like step 1.

// Engine I/O is hurt and in place (not already repairing or moving): a repair is the fix.
function engineNeedsRepair(ctx: DirectorCtx, bands: readonly Band[] = ['failing', 'dead']): boolean {
  return bands.includes(ctx.caps.engine.band) && ctx.caps.engine.offline === null;
}

function engineWorks(ctx: DirectorCtx): boolean {
  return ctx.caps.engine.band === 'ok' || ctx.caps.engine.band === 'degraded';
}

function isFlying(ctx: DirectorCtx): boolean {
  return ctx.phase === 'flight';
}

// ▼ is close (its countdown is red, as the strip's own ▼ lines go urgent): the burn is the step
// now, not a lesson.
function lowestPointNear(ctx: DirectorCtx): boolean {
  const periInSec = ctx.pred.periInSec;
  if (periInSec === null) return false;
  return secUntil(ctx.pred, periInSec, ctx.state.clock.tSec) / ctx.state.level.tacticalWarp < COUNTDOWN_RED_TAC;
}

export const ENGINE_BEAT_RULES: readonly GuideRule[] = [
  {
    id: 'tut-engine-weak',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    urgency: 'now',
    maxShownSec: ENGINE_WEAK_MAX_SHOWN_SEC,
    // Only the weak engine: a dead one already has its own line (F2: ENGINE NOT RESPONDING).
    activeWhen: (ctx) => isFlying(ctx) && firstRun(ctx) && ctx.mode === 'tools' && engineNeedsRepair(ctx, ['failing'])
      && !lowestPointNear(ctx),
    // The opening OUT/IN correction still short of its target: the flight can wait a few seconds.
    preempts: (ctx) => ctx.flight?.id === 'F6-keep',
    text: () => 'ENGINE WEAK — press [TAB] to look inside',
    keys: ['TAB'],
    doneWhen: (ctx) => ctx.mode === 'memory' && engineNeedsRepair(ctx),
  },
  {
    id: 'tut-repair-engine',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    activeWhen: (ctx) => isFlying(ctx) && firstRun(ctx) && ctx.mode === 'memory' && ctx.state.run.licences.includes('repair')
      && engineNeedsRepair(ctx),
    text: () => `PICK UP ${TOOL_WORD.repair} → CLICK ENGINE I/O`,
    highlight: (ctx) => repairStepTarget(ctx.state.ui.activeTool?.kind ?? null, 'engine-io'),
    // The repair of the faulted file is running (see the header: not a repair before the fault).
    doneWhen: (ctx) => ctx.done.has(ENGINE_FAULT_ID) && ctx.caps.engine.offline === 'repairing',
  },
  {
    id: 'tut-tab-back',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    activeWhen: (ctx) => isFlying(ctx) && firstRun(ctx) && ctx.mode === 'memory' && ctx.done.has(ENGINE_FAULT_ID)
      && ctx.done.has('tut-repair-engine') && engineWorks(ctx) && (ctx.flight?.keys.includes('SPACE') ?? false),
    text: () => '[TAB] BACK — hold [SPACE]',
    keys: ['TAB', 'SPACE'],
    doneWhen: (ctx) => ctx.mode === 'tools' && ctx.done.has(ENGINE_FAULT_ID) && ctx.done.has('tut-repair-engine'),
  },
  {
    id: 'tut-engine-weak-known',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    urgency: 'now',
    maxShownSec: ENGINE_WEAK_MAX_SHOWN_SEC,
    activeWhen: (ctx) => isFlying(ctx) && !firstRun(ctx) && engineNeedsRepair(ctx, ['failing']) && !lowestPointNear(ctx),
    preempts: (ctx) => ctx.flight?.id === 'F6-keep',
    text: () => `ENGINE WEAK — ${TOOL_WORD.repair} ENGINE I/O`,
    highlight: (ctx) => (ctx.mode === 'memory' ? repairStepTarget(ctx.state.ui.activeTool?.kind ?? null, 'engine-io') : null),
    doneWhen: (ctx) => ctx.done.has(ENGINE_FAULT_ID) && ctx.caps.engine.offline === 'repairing',
  },
];

// The run-1 lessons are for the tutorial run (§5.2: a returning unit gets one hint each; systems/meta.ts
// playsTutorial: a run left before ARES-VII was flown through taught nothing, so the next one has them too).
function firstRun(ctx: DirectorCtx): boolean {
  return playsTutorial(ctx.state.run);
}

// --- The pods' drivers on the strip (01-landing §3.8, §3.11) ---------------------------------------
// POD 02 WILL LAND HARD — REPAIR its driver: while the ship's hurt driver would still land hard (failing, in memory),
// in flight on the coast only (a WAIT: never over an urgent flight line) and during the landing. Worded for the screen
// the kid is on, and done when the driver is repaired (or gone). A returning unit (§5.2) gets one showing.

function isLanding(ctx: DirectorCtx): boolean {
  return ctx.phase === 'landing';
}

function hurtPodLive(ctx: DirectorCtx): boolean {
  if (ctx.vars.hurtPod === '') return false;
  return isLanding(ctx) || (isFlying(ctx) && ctx.flight?.urgency === 'wait');
}

function hurtPodSettled(ctx: DirectorCtx): boolean {
  return ctx.vars.hurtPod === '';
}

export const DRIVER_RULES: readonly GuideRule[] = [
  {
    id: 'tut-hurt-driver-tab',
    lesson: 'hurt-driver',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    activeWhen: (ctx) => hurtPodLive(ctx) && firstRun(ctx) && ctx.mode === 'tools',
    text: (ctx) => `${LANDING_ASKS.hurtDriver(ctx.vars.hurtPodNumber)} — [TAB]`,
    keys: ['TAB'],
    doneWhen: hurtPodSettled,
  },
  {
    id: 'tut-hurt-driver',
    lesson: 'hurt-driver',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    activeWhen: (ctx) => hurtPodLive(ctx) && firstRun(ctx) && ctx.mode === 'memory',
    text: (ctx) => LANDING_ASKS.hurtDriver(ctx.vars.hurtPodNumber),
    highlight: (ctx) => toolStepTarget('repair', ctx.state.ui.activeTool?.kind ?? null, podHintTarget(ctx.vars.hurtPod)),
    doneWhen: hurtPodSettled,
  },
  {
    // A returning unit (§5.2): one hint for the hurt driver (reseeded, never the lead), on either screen, shown once.
    id: 'tut-hurt-driver-known',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    activeWhen: (ctx) => hurtPodLive(ctx) && !firstRun(ctx),
    text: (ctx) => LANDING_ASKS.hurtDriver(ctx.vars.hurtPodNumber),
    highlight: (ctx) => (ctx.mode === 'memory'
      ? toolStepTarget('repair', ctx.state.ui.activeTool?.kind ?? null, podHintTarget(ctx.vars.hurtPod))
      : null),
  },
];

// --- 046.log's SCAN lesson (slice-2-plan §3.1; 05 §3.5) -------------------------------------------------------------
// The `???` file is ship 1's SCAN lesson now that HOLLOW is gone from it: on run 1, while the flight is in a WAIT, once
// POD 02 no longer lands hard (the coast's REPAIR is done) or, for a kid who never repairs it, once the coast has lasted
// LOG_SCAN_AFTER_COAST_SEC with no op running (the review's minor 10: entry 01 would make the log known by itself, and
// that kid never met the beat): `◇ A FILE YOU DIDN'T PACK — SCAN it`, worded for the screen the kid is on. Its rules come
// before the hurt-driver lesson's (GUIDE_RULES), so after that wait it takes the strip for its LOG_SCAN_ASK_SEC and then
// hands it back. The beat is missable (05 §3.5): a one-shot that steps aside after LOG_SCAN_ASK_SEC and never blocks the
// flight. Done when the run knows the file (state/log-selectors.ts logKnown: scanned, or a key found). A returning unit
// gets one hint and no lesson.

function logAskLive(ctx: DirectorCtx): boolean {
  const coastAt = ctx.state.burn.coastAtAi;
  const coastLong = coastAt !== null && ctx.state.clock.aiSec - coastAt >= LOG_SCAN_AFTER_COAST_SEC && getOps().length === 0;
  // A WAIT that offers ACCEPT ORBIT (F11: the tank can't save the loop) is a decision, not the calm the beat wants.
  return isFlying(ctx) && ctx.flight?.urgency === 'wait' && !ctx.flight.showAccept && (hurtPodSettled(ctx) || coastLong)
    && !logKnown(ctx.state.run.log)
    && ctx.state.memory.some((seg) => seg.type === 'log') && ctx.state.run.licences.includes('scan');
}

function logKnownNow(ctx: DirectorCtx): boolean {
  return logKnown(ctx.state.run.log);
}

function logScanTarget(ctx: DirectorCtx): string {
  return toolStepTarget('scan', ctx.state.ui.activeTool?.kind ?? null, LOG_HINT_TARGET);
}

export const LOG_RULES: readonly GuideRule[] = [
  {
    id: 'tut-scan-log-tab',
    lesson: 'scan-log',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: LOG_SCAN_ASK_SEC,
    activeWhen: (ctx) => logAskLive(ctx) && firstRun(ctx) && ctx.mode === 'tools',
    text: () => LOG_TEXT.scanAskTab,
    keys: ['TAB'],
    doneWhen: logKnownNow,
  },
  {
    id: 'tut-scan-log',
    lesson: 'scan-log',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: LOG_SCAN_ASK_SEC,
    activeWhen: (ctx) => logAskLive(ctx) && firstRun(ctx) && ctx.mode === 'memory',
    text: () => LOG_TEXT.scanAsk,
    highlight: logScanTarget,
    doneWhen: logKnownNow,
  },
  {
    // A returning unit (§5.2): one hint, on either screen, shown once.
    id: 'hint-scan-log',
    layer: 'mind',
    priority: 'hint',
    once: true,
    maxShownSec: LOG_SCAN_ASK_SEC,
    activeWhen: (ctx) => logAskLive(ctx) && !firstRun(ctx),
    text: () => LOG_TEXT.scanAsk,
    highlight: (ctx) => (ctx.mode === 'memory' ? logScanTarget(ctx) : null),
    doneWhen: logKnownNow,
  },
];

// --- The landing lessons (01-landing §3.11; slice-2-plan §1.1 item 10) ------------------------------------------------
// Ship-layer lines (the strip draws ◆), once a run each, from the landing's start until the first pod of the ship
// launches, so they read in the WAIT before the first window (a window's own lines are 'now' and come first):
// • PODS LAND WHERE THE DOT IS: the tutorial run's first landing (run 1 only: a returning unit has landed pods);
// • 2 SITES · LZ-A 3, LZ-B 2 — don't overfill: the run's first ship with two or more LZs (HALCYON on the fixed five).
//   A returning unit reads the short form, the counts alone (v2 §5.2: one hint each).

function noPodLaunchedYet(ctx: DirectorCtx): boolean {
  const landing = ctx.state.landing;
  return isLanding(ctx) && landing.ended === null && landing.pods.every((record) => record.fate.kind === 'aboard');
}

export const LANDING_LESSON_RULES: readonly GuideRule[] = [
  {
    id: 'lesson-pods-dot',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: LANDING_DOT_LESSON_SEC,
    activeWhen: (ctx) => noPodLaunchedYet(ctx) && firstRun(ctx),
    text: () => LANDING_LESSONS.dot,
  },
  {
    id: 'lesson-split',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: LANDING_SPLIT_LESSON_SEC,
    activeWhen: (ctx) => noPodLaunchedYet(ctx) && ctx.state.landing.lzs.length >= 2,
    text: (ctx) => ctx.vars.splitLesson,
  },
];

// --- Slice 1b's drop lesson (01-landing §3.11, risk 14) ------------------------------------------------------------
// THE DOT IS WIDE — REPAIR, or fly lower: once a run, the first time the landing table shows L9 (DROP TOO WIDE FOR
// LZ-B …), in front of it for DOT_WIDE_LESSON_SEC; then L9 itself names the LZ and the file (or GO LOWER). The general
// rule before the particular one, as the flight's lessons do. A ship-layer line (§3.11's ◆; the strip draws the glyph).
// Every run, not run 1 only: a returning unit meets it on its first wide drop just the same, and it is one short line
// (§5.2's "one hint each"). Done when L9 stops showing, or after its seconds.
export const DROP_LESSON_RULES: readonly GuideRule[] = [
  {
    id: 'lesson-dot-wide',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: DOT_WIDE_LESSON_SEC,
    activeWhen: (ctx) => isLanding(ctx) && ctx.landing?.row === 'L9',
    text: () => LANDING_LESSONS_1B.dotWide,
  },
  {
    // Track ORBIT (slice 1b, §3.7): the first drag kick worth a stamp (it moved the far side DRAG_STAMP_MIN_KM). Active
    // from that kick for as long as ▼ is still below the DRAG line (the kick is one tick: a rule active only then would
    // retire after a tick), shown DRAG_LESSON_SEC.
    id: 'lesson-drag-sinks',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: DRAG_LESSON_SEC,
    activeWhen: (ctx) => {
      if (!isLanding(ctx) || ctx.state.landing.ended !== null) return false;
      const kick = ctx.state.landing.decay.last;
      return kick !== null && kick.dropKm >= DRAG_STAMP_MIN_KM && ctx.pred.rp < dragLineKm(ctx.state.level.ring);
    },
    text: () => LANDING_LESSONS_1B.dragSinks,
  },
];

// --- HOLLOW on the strip (WP6, §6.3, §6.6) ----------------------------------------------------------
// The alarms outrank everything, even a burn's NOW (§6.3 composition 1), except a crash course and a
// RELEASE (see alarmLive): a driver about to be eaten or an infected Core is the moment to choose
// between hacking and burning, and the klaxon says so.
// The mind-urgent line (SOMETHING IS EATING POD 01) waits for the flight to be calm ('now' lines win:
// you can't hack while you burn), then names the file and the fix. Each comes worded for the screen
// the kid is on: from amber, [TAB] first.

function isLive(ctx: DirectorCtx): boolean {
  return isFlying(ctx) || isLanding(ctx);
}

// The alarms yield to two kinds of flight line:
// • DON'T HIT THE PLANET. A crash takes every pod aboard with it, so a kid on an impact course is never
//   sent into the mind for one of them.
// • RELEASE [SPACE] (guidance's release rows). It is the one line that ends a burn: a kid who chose to
//   burn rather than hack must see when to let go, or the burn runs on past the ring and doubles the
//   drain (P1) on the very driver the alarm is about. These lines last a second or two.
// The klaxon and the pink toggle still say it, and the alarm is back the moment the flight line goes.
// It still replaces KEEP HOLDING during a capture: that is the hack-or-burn choice.
function alarmLive(ctx: DirectorCtx): boolean {
  if (isLanding(ctx)) return true;
  if (!isFlying(ctx) || ctx.pred.outcome === 'impact') return false;
  return !(ctx.flight !== null && isReleaseRow(ctx.flight.id));
}

function inAmber(ctx: DirectorCtx): boolean {
  return ctx.mode === 'tools';
}

// The Core is worn below CORE_LOW_INTEGRITY (a thread lost), not infected (the alarms have that) and not already being
// healed, and the unit can heal it: REPAIR in hand's reach and some charge left (WP12 p3, 'hint-core-worn').
function coreWorn(ctx: DirectorCtx): boolean {
  const core = ctx.state.memory.find((seg) => seg.type === 'core');
  if (core === undefined || core.type !== 'core' || core.integrity >= CORE_LOW_INTEGRITY) return false;
  if (coreInfected(ctx.state) || coreRepairing(ctx)) return false;
  return hasUsableTool(ctx.state.memory, 'repair', 'counts') && chargeLeft(ctx.state) >= 1;
}

const CORE_WORN_LINE = `AI CORE BELOW ${CORE_LOW_INTEGRITY}% — REPAIR IT TO GET A THREAD BACK`;

function coreRepairing(ctx: DirectorCtx): boolean {
  const core = ctx.state.memory.find((seg) => seg.type === 'core');
  return core !== undefined && core.type === 'core' && healRatePerSec(ctx.state, core) > 0;
}

// What a "REPAIR it" line lights in blue: the REPAIR chip until the tool is in hand, then the file
// (a driver by its pod, a file by its role; a tool file has no hint target, so only the chip).
function repairHighlight(ctx: DirectorCtx, label: string): string | null {
  const held = ctx.state.ui.activeTool?.kind ?? null;
  const seg = infectedSegments(ctx.state).find((candidate) => fileLabel(candidate) === label);
  if (seg?.type === 'driver') return toolStepTarget('repair', held, podHintTarget(fileLabel(seg)));
  if (seg?.role) return toolStepTarget('repair', held, fileHintTarget(seg.role));
  return held === 'repair' ? null : TOOL_HINT_TARGET.repair;
}

const eatenIn = (ctx: TextCtx): string => `${ctx.vars.eaten} WILL BE EATEN IN ${formatTac(ctx.vars.eatenInSec)}`;

// What a "SWAP IT" / "DELETE IT" line for an eaten ship file lights in blue, as the REPAIR lines do: the tool's chip
// until it is in hand, then the file (by its role; Thrust.alt has none, so only the chip).
function shipFixHighlight(ctx: DirectorCtx): string | null {
  const fix = ctx.vars.eatingShipFix;
  if (fix === '') return null;
  const kind: FsToolKind = fix === 'SWAP' ? 'swap' : 'delete';
  const held = ctx.state.ui.activeTool?.kind ?? null;
  const seg = infectedSegments(ctx.state).find((candidate) => fileLabel(candidate) === ctx.vars.eating);
  if (seg?.role) return toolStepTarget(kind, held, fileHintTarget(seg.role));
  return held === kind ? null : TOOL_HINT_TARGET[kind];
}

// The WALLS mind rule (§4.2 "MOVE and the 4-block WALL rule"; phase 2's HALCYON, VESPER's arrival since phase 3 slice
// 2, 04 §3.9): on a ship whose HOLLOW spreads,
// the moment it wakes and bites, the strip says the rule a kid can repeat, once, for WALL_RULE_SHOW_SEC
// (then the plain eating lines name each driver); once the bites are cured, it asks for the MOVE that
// puts the exposed driver behind a WALL, for as long as one is exposed. Only with MOVE licensed.
// HOLLOW itself is aboard (slice 2): a seeds-only wake (KESTREL's beam seeds) spreads too, but its lesson is RM THE SEED,
// not MOVE the drivers behind a WALL while a seed eats Telemetry.
function spreadingAwake(ctx: DirectorCtx): boolean {
  return isLive(ctx) && ctx.state.hollow.phase === 'awake' && ctx.state.hollow.cfg.spreadEverySec !== null
    && ctx.state.run.licences.includes('move') && hollowAboard(ctx.state);
}

function wallRuleLive(ctx: DirectorCtx): boolean {
  return spreadingAwake(ctx) && ctx.vars.eating !== '' && !ctx.vars.eatingShip;
}

function moveBehindWallLive(ctx: DirectorCtx): boolean {
  return spreadingAwake(ctx) && ctx.vars.exposed !== '' && !anythingInfected(ctx.state);
}

const WALL_RULE_HEAD = `${WALL_MIN_BLOCKS} FREE BLOCKS STOP IT`;

export const WALL_RULES: readonly GuideRule[] = [
  {
    id: 'hollow-wall-rule-tab',
    lesson: 'wall-rule',
    layer: 'mind',
    priority: 'mind-urgent',
    once: true,
    maxShownSec: WALL_RULE_SHOW_SEC,
    activeWhen: (ctx) => wallRuleLive(ctx) && inAmber(ctx),
    text: () => `${WALL_RULE_HEAD} — [TAB], REPAIR, then MOVE drivers behind a WALL`,
    keys: ['TAB'],
  },
  {
    id: 'hollow-wall-rule',
    lesson: 'wall-rule',
    layer: 'mind',
    priority: 'mind-urgent',
    once: true,
    maxShownSec: WALL_RULE_SHOW_SEC,
    activeWhen: (ctx) => wallRuleLive(ctx) && !inAmber(ctx),
    text: () => `${WALL_RULE_HEAD} — REPAIR, then MOVE drivers behind a WALL`,
    highlight: (ctx) => repairHighlight(ctx, ctx.vars.eating),
  },
  {
    id: 'hollow-move-wall-tab',
    layer: 'mind',
    priority: 'tutorial',
    activeWhen: (ctx) => moveBehindWallLive(ctx) && inAmber(ctx),
    text: (ctx) => `[TAB], MOVE ${ctx.vars.exposed} behind a WALL — ${WALL_RULE_HEAD}`,
    keys: ['TAB'],
  },
  {
    id: 'hollow-move-wall',
    layer: 'mind',
    priority: 'tutorial',
    activeWhen: (ctx) => moveBehindWallLive(ctx) && !inAmber(ctx),
    text: (ctx) => `MOVE ${ctx.vars.exposed} behind a WALL — ${WALL_RULE_HEAD}`,
    highlight: (ctx) => {
      const known = ctx.vars.exposed !== '' && driversInMemory(ctx.state).some((driver) => fileLabel(driver) === ctx.vars.exposed);
      return toolStepTarget('move', ctx.state.ui.activeTool?.kind ?? null, known ? podHintTarget(ctx.vars.exposed) : TOOL_HINT_TARGET.move);
    },
  },
];

// The trap (WP11 review, the lead's ruling of 21:30): a cluster HOLLOW has bitten in the same spot before will be bitten
// there again, and a REPAIR alone never ends that (LAST LIGHT's C13 and C14 in the root's 2-block GAPs, every 12 s:
// following the strip's REPAIR IT every time emptied the charge MERGE needs). Once it is cured (a cluster being eaten
// keeps its REPAIR line: HOLLOW's alarms and eating lines come first), the strip asks for the MOVE as urgently as a
// seed: after the seed lines (a seed is one click), before the tutorials and the belt. The MOVE preview then says SAFE
// where HOLLOW can't reach it. Mind-urgent, so it never stands in front of a flight's NOW / KEEP HOLDING / RELEASE line
// (director.ts; WP9's rule), and only with MOVE licensed. It also comes before a lesson's lead-in (WP12 p3): on LAST
// LIGHT the belt lesson's first seconds hid it, the cluster was bitten again and again, and the strip-following kid
// reached the choice with MERGE's 20 charge in 39 of 198 runs instead of 155 (WP12 part 3's playthrough experiments). The belt
// is up to 90 s away; a cluster bitten every 12 s costs charge now.
function bittenAgainLive(ctx: DirectorCtx): boolean {
  return spreadingAwake(ctx) && ctx.vars.bittenAgain !== '';
}

// Final review: the ask names where a SAFE spot is (` in RACK D`), the one the preview would call SAFE farthest from
// HOLLOW; on LAST LIGHT the kid otherwise took rack A, which the belt hits. With nowhere SAFE it names none.
function inRack(ctx: TextCtx): string {
  return ctx.vars.bittenAgainRack === '' ? '' : ` in ${ctx.vars.bittenAgainRack}`;
}

const BITTEN_AGAIN_RULES: readonly GuideRule[] = [
  {
    id: 'hollow-move-again-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => bittenAgainLive(ctx) && inAmber(ctx),
    text: (ctx) => `[TAB], MOVE ${ctx.vars.bittenAgain} behind a WALL${inRack(ctx)} — it is bitten every time`,
    keys: ['TAB'],
  },
  {
    id: 'hollow-move-again',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => bittenAgainLive(ctx) && !inAmber(ctx),
    text: (ctx) => `${ctx.vars.bittenAgain} IS BITTEN EVERY TIME — MOVE it behind a WALL${inRack(ctx)}`,
    highlight: (ctx) => {
      const known = ctx.vars.bittenAgain !== '' && driversInMemory(ctx.state).some((driver) => fileLabel(driver) === ctx.vars.bittenAgain);
      return toolStepTarget('move', ctx.state.ui.activeTool?.kind ?? null, known ? podHintTarget(ctx.vars.bittenAgain) : TOOL_HINT_TARGET.move);
    },
  },
];

// A FIREWALL.sys to place (WP8 fix round 1): the unit carries one that holds nothing yet, on a ship whose
// HOLLOW spreads, with MOVE in hand and a red GAP next to HOLLOW that it fits in. The strip says where it goes
// and lights the FW chip (then the MOVE preview says `SEALS THIS SIDE ✓` over the GAP), once: it steps aside
// after FIREWALL_HINT_SHOW_SEC on the strip, or once every FIREWALL holds (WP12 p3, WP8 verify: with two it retired
// when either held, and lit both chips; it lights the first one still to place). The Skills window keeps saying it.
// Without it, a picked FIREWALL sat in rack F: the card said `MOVE it into place`, and nothing on the ship
// ever pointed at it. A 'tutorial' line: the flight's NOW lines and the eating lines come first.
// The FIREWALLs in memory that hold nothing yet, in memory order.
function unplacedFirewalls(state: Readonly<GameState>): Segment[] {
  const firewalls = state.memory.filter(isFirewall);
  if (firewalls.length === 0) return [];
  const holding = new Set(reachMarks(state).shields.map((shield) => shield.firewallId));
  return firewalls.filter((seg) => !holding.has(seg.id));
}

function firewallToPlace(ctx: DirectorCtx): boolean {
  const state = ctx.state;
  if (!isLive(ctx) || !state.run.licences.includes('move') || state.hollow.cfg.spreadEverySec === null) return false;
  return unplacedFirewalls(state).length > 0 && firewallFits(reachMarks(state));
}

// Checked every tick (the one-shots' doneWhen): no FIREWALL in memory, no reach to work out. Done once every one holds.
function firewallsAllHolding(ctx: DirectorCtx): boolean {
  return ctx.state.memory.some(isFirewall) && unplacedFirewalls(ctx.state).length === 0;
}

// The chip the line lights once MOVE is in hand: the first FIREWALL still to place.
function firewallTarget(ctx: DirectorCtx): string | null {
  const next = unplacedFirewalls(ctx.state)[0];
  return next === undefined ? null : firewallHintTarget(next.id);
}

export const FIREWALL_RULES: readonly GuideRule[] = [
  {
    id: 'firewall-place-tab',
    lesson: 'firewall-place',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: FIREWALL_HINT_SHOW_SEC,
    activeWhen: (ctx) => firewallToPlace(ctx) && inAmber(ctx),
    text: (ctx) => `[TAB], MOVE your FIREWALL (FW) next to ${ctx.vars.hollow}`,
    keys: ['TAB'],
    doneWhen: firewallsAllHolding,
  },
  {
    id: 'firewall-place',
    lesson: 'firewall-place',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: FIREWALL_HINT_SHOW_SEC,
    activeWhen: (ctx) => firewallToPlace(ctx) && !inAmber(ctx),
    text: (ctx) => `MOVE your FIREWALL (FW) into the GAP next to ${ctx.vars.hollow}`,
    highlight: (ctx) => {
      const target = firewallTarget(ctx);
      return target === null ? null : toolStepTarget('move', ctx.state.ui.activeTool?.kind ?? null, target);
    },
    doneWhen: firewallsAllHolding,
  },
];

export const HOLLOW_RULES: readonly GuideRule[] = [
  {
    id: 'alarm-core-repairing',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && coreInfected(ctx.state) && coreRepairing(ctx),
    text: () => 'CORE INFECTED — REPAIRING, HOLD ON',
  },
  {
    id: 'alarm-core-tab',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && coreInfected(ctx.state) && inAmber(ctx),
    text: () => 'CORE INFECTED — [TAB], REPAIR THE CORE',
    keys: ['TAB'],
  },
  {
    id: 'alarm-core',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && coreInfected(ctx.state),
    text: () => 'CORE INFECTED — REPAIR THE CORE',
    highlight: (ctx) => toolStepTarget('repair', ctx.state.ui.activeTool?.kind ?? null, fileHintTarget('core')),
  },
  {
    id: 'alarm-eaten-nocharge',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ctx.vars.eaten !== '' && chargeLeft(ctx.state) < 1,
    text: (ctx) => `${eatenIn(ctx)} — NO REPAIR CHARGE LEFT`,
  },
  {
    id: 'alarm-eaten-tab',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ctx.vars.eaten !== '' && inAmber(ctx),
    text: (ctx) => `${eatenIn(ctx)} — [TAB], REPAIR IT`,
    keys: ['TAB'],
  },
  {
    // Every thread is busy: the repair would be refused, so say what to do about that first.
    id: 'alarm-eaten-threads',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ctx.vars.eaten !== '' && !canStartOp(),
    text: (ctx) => `${eatenIn(ctx)} — FREE A THREAD, REPAIR IT`,
  },
  {
    id: 'alarm-eaten',
    layer: 'mind',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ctx.vars.eaten !== '',
    text: (ctx) => `${eatenIn(ctx)} — REPAIR IT NOW`,
    highlight: (ctx) => repairHighlight(ctx, ctx.vars.eaten),
  },
  {
    id: 'hollow-eating-ship-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => isLive(ctx) && ctx.vars.eating !== '' && ctx.vars.eatingShip && ctx.vars.eatingShipFix !== '' && inAmber(ctx),
    text: (ctx) => `SOMETHING IS EATING ${ctx.vars.eating} — [TAB], ${ctx.vars.eatingShipFix} IT`,
    keys: ['TAB'],
  },
  {
    id: 'hollow-eating-ship',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => isLive(ctx) && ctx.vars.eating !== '' && ctx.vars.eatingShip,
    // With neither SWAP nor DELETE in hand (a HOLLOW met before either licence) there is nothing to do it with:
    // the line says why REPAIR is no use, on either screen, and sends the kid nowhere.
    text: (ctx) => (ctx.vars.eatingShipFix === ''
      ? `SOMETHING IS EATING ${ctx.vars.eating} — REPAIR can't heal it`
      : `SOMETHING IS EATING ${ctx.vars.eating} — ${ctx.vars.eatingShipFix} IT`),
    highlight: (ctx) => shipFixHighlight(ctx),
  },
  {
    id: 'hollow-eating-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => isLive(ctx) && ctx.vars.eating !== '' && inAmber(ctx),
    text: (ctx) => `SOMETHING IS EATING ${ctx.vars.eating} — [TAB], REPAIR IT!`,
    keys: ['TAB'],
  },
  {
    id: 'hollow-eating',
    layer: 'mind',
    priority: 'mind-urgent',
    activeWhen: (ctx) => isLive(ctx) && ctx.vars.eating !== '',
    text: (ctx) => `SOMETHING IS EATING ${ctx.vars.eating} — REPAIR IT!`,
    highlight: (ctx) => repairHighlight(ctx, ctx.vars.eating),
  },
];

// --- KESTREL (WP9): the seeds and DELETE, the debris, AUTOBURN ------------------------------------------------

// A seed is in memory and DELETE is in hand (it arrives with the first one, licences.ts).
function seedLive(ctx: DirectorCtx): boolean {
  return isLive(ctx) && ctx.state.run.licences.includes('delete') && seedsInMemory(ctx.state.memory).length > 0;
}

// A seed that can bite a file at the next bite (it split a wall into GAPs).
function seedThreatens(ctx: DirectorCtx): boolean {
  return seedLive(ctx) && threateningSeeds(ctx.state.memory, ctx.state.clock.aiSec).length > 0;
}

// A seed has been DELETEd on this ship: seeds leave memory no other way.
function seedDeleted(ctx: DirectorCtx): boolean {
  return ctx.state.hollow.seedsLanded > 0 && seedsInMemory(ctx.state.memory).length === 0;
}

const RM_SEED = 'RM THE SEED — pick up DELETE, click the seed';

function seedHighlight(ctx: DirectorCtx): string {
  return toolStepTarget('delete', ctx.state.ui.activeTool?.kind ?? null, SEED_HINT_TARGET);
}

// §5.1 5:30 and §9 WP9 item 4: the first seed of a run (with DELETE just licensed and HOLLOW's `> sorry. i'm
// so hungry.`) teaches the one-click fix, harmless or not; after that the line comes back for any seed that
// can bite. Mind-urgent: below the flight's NOW lines and HOLLOW's own eating lines, above the tutorials.
// A seed about to bite the AI Core or an AI file also stands in front of a lesson's lead-in (final review: on VESPER
// the COPY lesson's 6 s hid `RM THE SEED` while the seed was one bite from the Core).
function seedBitesAi(ctx: DirectorCtx): boolean {
  return seedBitesAiFile(ctx.state.memory, ctx.state.clock.aiSec);
}
export const SEED_RULES: readonly GuideRule[] = [
  {
    id: 'hollow-seed-first-tab',
    lesson: 'seed-first',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: seedBitesAi,
    once: true,
    maxShownSec: SEED_LESSON_SHOW_SEC,
    activeWhen: (ctx) => seedLive(ctx) && inAmber(ctx),
    text: () => `[TAB], ${RM_SEED}`,
    keys: ['TAB'],
    doneWhen: seedDeleted,
  },
  {
    id: 'hollow-seed-first',
    lesson: 'seed-first',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: seedBitesAi,
    once: true,
    maxShownSec: SEED_LESSON_SHOW_SEC,
    activeWhen: (ctx) => seedLive(ctx) && !inAmber(ctx),
    text: () => RM_SEED,
    highlight: seedHighlight,
    doneWhen: seedDeleted,
  },
  {
    id: 'hollow-seed-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: seedBitesAi,
    activeWhen: (ctx) => seedThreatens(ctx) && inAmber(ctx),
    text: () => `[TAB], ${RM_SEED}`,
    keys: ['TAB'],
  },
  {
    id: 'hollow-seed',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: seedBitesAi,
    activeWhen: (ctx) => seedThreatens(ctx) && !inAmber(ctx),
    text: () => RM_SEED,
    highlight: seedHighlight,
  },
];

// The debris will hit (the lead's note for WP9: the cloud names the rack, and the kid can do something about
// it). Once the IN correction can no longer clear it (the flight's line is past the correction rows) and the contact is near,
// the strip says the other way to save those drivers: MOVE them out of the rack. Only while the instruments can
// tell (not under PATH UNCERTAIN: F1 is the line then), with MOVE in hand, and drivers in that rack.
function debrisMoveLive(ctx: DirectorCtx): boolean {
  if (!isFlying(ctx) || !ctx.state.run.licences.includes('move') || ctx.vars.debrisRack === '') return false;
  const mode = ctx.caps.plot.mode;
  if (mode !== 'exact' && mode !== 'approx') return false;
  if (ctx.flight === null || isCorrectionRow(ctx.flight.id) || ctx.vars.debrisInTac > DEBRIS_MOVE_HINT_TAC) return false;
  const starts = segmentStarts(ctx.state.memory);
  return ctx.state.memory.some((seg, index) => seg.type === 'driver' && blocksInRack(starts[index]!, seg.size, ctx.vars.debrisRack, layoutOf(ctx.state)) > 0);
}

const debrisHead = (ctx: TextCtx): string => `DEBRIS HITS RACK ${ctx.vars.debrisRack} IN ${formatTac(ctx.vars.debrisInTac)}`;

export const DEBRIS_RULES: readonly GuideRule[] = [
  {
    id: 'debris-move-tab',
    layer: 'mind',
    priority: 'tutorial',
    activeWhen: (ctx) => debrisMoveLive(ctx) && inAmber(ctx),
    text: (ctx) => `${debrisHead(ctx)} — [TAB], MOVE drivers out of it`,
    keys: ['TAB'],
  },
  {
    id: 'debris-move',
    layer: 'mind',
    priority: 'tutorial',
    activeWhen: (ctx) => debrisMoveLive(ctx) && !inAmber(ctx),
    text: (ctx) => `${debrisHead(ctx)} — MOVE drivers out of it`,
    highlight: (ctx) => (ctx.state.ui.activeTool?.kind === 'move' ? null : TOOL_HINT_TARGET.move),
  },
];

// AUTOBURN (§6.10): a drop mid-flight is an alarm (its klaxon is the alert's, systems/autoburn.ts), worded for the
// screen; and the first time this run it could take a capture, the strip says what [B] does (the capture lines
// offer ` · or [B] AUTO` from then on).
export const AUTOBURN_RULES: readonly GuideRule[] = [
  {
    id: 'alarm-autoburn-lost',
    layer: 'ship',
    priority: 'alarm',
    activeWhen: (ctx) => isFlying(ctx) && ctx.vars.autoburnDrop !== '',
    text: (ctx) => ctx.vars.autoburnDrop,
    keys: [],
  },
  {
    id: 'tut-autoburn-ready',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: AUTOBURN_READY_SHOW_SEC,
    activeWhen: (ctx) => isFlying(ctx) && autoburnAvailable(ctx.state, ctx.pred),
    // WP12 review (WP9's TODO): a kid who SKIPs to the capture lands at GET READY, a NOW line, and the lesson, a
    // tutorial, never showed: only the tail's `· or [B] AUTO` said the skill was there. Not yet shown out, it takes
    // GET READY's place (the header chip keeps the countdown); at HOLD [SPACE] NOW the flight's line is back.
    preempts: (ctx) => ctx.flight?.id === 'F10-ready',
    text: () => AUTOBURN_TEXT.ready,
    keys: ['B'],
    doneWhen: (ctx) => ctx.state.burn.auto.phase !== 'idle',
  },
];

// --- VESPER (WP10): the engine firing by itself, SWAP, COPY ------------------------------------------------------
// The ship's first uncommanded burst is an alarm (systems/ghost-thrust.ts raises it: the klaxon, TACTICAL): its line
// says what happened and that it is not the kid's doing (the lead's note: ▼ drifts, and nobody touched SPACE). After the
// second burst the strip teaches the way to the cause in two steps, each once: in amber, the THRUST CTRL pip (it jumps
// to the file in the MIND); in the MIND, SWAP it to Thrust.alt (the SWAP chip, then the file). Both step aside once the
// controller is fixed (no ghost any more), or after GHOST_LESSON_SHOW_SEC on the strip (the counter and the pip stay).
// The COPY lesson (§9 WP10 item 4): once seeds come for your tools, keep a spare Repair somewhere else.

function ghostFiring(ctx: DirectorCtx): boolean {
  return ctx.caps.thrustCtrl.ghost !== null;
}

// The lesson's moment has come on this ship (the second burst): only from then can its steps be done, or a ship with a
// healthy controller (every ship before VESPER) would mark them done before they were ever needed.
function ghostLessonStarted(ctx: DirectorCtx): boolean {
  return isFlying(ctx) && ctx.state.burn.ghostBursts >= GHOST_LESSON_AFTER_BURSTS;
}

function ghostLessonDue(ctx: DirectorCtx): boolean {
  return ghostLessonStarted(ctx) && ghostFiring(ctx);
}

// The kid has reached the cause: Thrust Ctrl selected in the MIND (the pip's jump does exactly this, and so does their
// own click on the file).
function atThrustCtrlFile(ctx: DirectorCtx): boolean {
  const file = getByRole(ctx.state, 'thrust-ctrl');
  return ctx.mode === 'memory' && file !== null && ctx.state.ui.selectedId === file.id;
}

// Slice 3b (plan risk 1): the THRUST CTRL pip's way leads to SWAP, which on the arm comes only from the repository (on the
// worked route it is 4 years late for VESPER). The pip step waits until SWAP has reached the unit this run (run.licences:
// "the kinds that reached the unit"); the classic world licenses it with the first burst (licences.ts), so it is unchanged.
// The no-Swap line itself is Track REPO's moment (systems/repository.ts noSwapForGhost: a burst running on an ENGINE FAULT
// ship of the arm with no working Swap).
function swapReachedUnit(ctx: DirectorCtx): boolean {
  return ctx.state.run.licences.includes('swap');
}

// A SWAP the kid can pick up: a live Swap file (a seed hunting tools can eat it, WP10 fix round 1).
function swapInHand(ctx: DirectorCtx): boolean {
  return hasUsableTool(ctx.state.memory, 'swap', 'counts');
}

function swapRunning(): boolean {
  return getOps().some((operation) => operation.kind === 'swap');
}

// A tool HOLLOW can reach has no spare, a HUNT stage's seeds are on their way or in memory, or a verb unlinked Repair's
// last spare on this ship (LAST LIGHT, the review's minor 5), with COPY in hand
// (slice-2-plan risk 12: re-keyed from VESPER's near-tools seeds, which the fixed five no longer have).
function toolsHunted(ctx: DirectorCtx): boolean {
  return isLive(ctx) && ctx.state.run.licences.includes('copy') && copyLessonDue(ctx.state);
}

// A spare Repair exists: more working copies of it than the unit got with its licence (Repair and Repair.bak).
function spareRepair(ctx: DirectorCtx): boolean {
  const usable = toolFilesOf(ctx.state.memory, 'repair').filter(isUsableTool);
  return usable.length > TOOL_FILES.repair.length;
}

// The enemy by the name the kid knows (`???`, `UNIT-046`), as the FIREWALL and MOVE-preview lines say it: the word
// HOLLOW is never on screen (final review: this lesson said it, and no test read the strip rules' texts for it).
const copyLesson = (ctx: TextCtx): string => `${ctx.vars.hollow} IS HUNTING YOUR TOOLS — COPY your Repair`;
const copyLessonTab = (ctx: TextCtx): string => `${ctx.vars.hollow} IS HUNTING YOUR TOOLS — [TAB], COPY your Repair`;

// The engine firing by itself (§9 WP10 item 2): its alarm lines. The stuck line first: a ship's FIRST burst can stick
// too (a controller dead before it ever fired), and under the first burst's alarm line the kid was never told SPACE
// ends it while the tank drained (WP10 review).
function ghostStuck(ctx: DirectorCtx): boolean {
  return ctx.state.burn.ghost?.sticky === true && !ctx.state.burn.ghost.releaseArmed;
}

const GHOST_ALARM_RULES: readonly GuideRule[] = [
  {
    // A sticky burst (a dead controller, §6.4) fires until SPACE is pressed and released: the strip says so, or nothing
    // on screen would tell a kid why the engine never stops. Gone the moment SPACE goes down (the release ends it).
    id: 'alarm-ghost-stuck',
    layer: 'ship',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ghostStuck(ctx) && inAmber(ctx),
    text: () => GHOST_TEXT.stuckLine,
    keys: ['SPACE'],
  },
  {
    // In blue SPACE is refused (SHIP SCREEN): the way to the press comes first, as the flight's own lines word it there
    // (guidance.ts fromMind, WP12 review).
    id: 'alarm-ghost-stuck-tab',
    layer: 'ship',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ghostStuck(ctx) && !inAmber(ctx),
    text: () => GHOST_TEXT.stuckLineTab,
    keys: ['TAB', 'SPACE'],
  },
  {
    id: 'alarm-ghost',
    layer: 'ship',
    priority: 'alarm',
    activeWhen: (ctx) => alarmLive(ctx) && ctx.state.alerts.list.some((alert) => alert.id === GHOST_ALARM_ID),
    text: () => GHOST_TEXT.alarmLine,
  },
];

// ...its lesson after the second burst: the THRUST CTRL pip, then SWAP; with no Swap aboard, how to fly through it.
const GHOST_LESSON_RULES: readonly GuideRule[] = [
  {
    id: 'tut-ghost-noswap',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: GHOST_LESSON_SHOW_SEC,
    activeWhen: (ctx) => noSwapForGhost(ctx.state),
    text: () => REPO_TEXT.noSwap,
    doneWhen: (ctx) => ghostLessonStarted(ctx) && !ghostFiring(ctx),
  },
  {
    id: 'tut-ghost-pip',
    layer: 'ship',
    priority: 'tutorial',
    once: true,
    maxShownSec: GHOST_LESSON_SHOW_SEC,
    activeWhen: (ctx) => ghostLessonDue(ctx) && inAmber(ctx) && swapReachedUnit(ctx),
    text: () => GHOST_TEXT.pipLesson,
    highlight: pipHintTarget('thrust-ctrl'),
    // Done once the kid is at the file (the pip's jump) or the engine is fixed; the second step's line takes over in
    // the MIND. A TAB for something else (a bite at HOLLOW's wake) used to count too (WP10 fix round 1, the browser run
    // from TRANSMIT): back in amber the kid never saw the way to the cause again, and in the MIND HOLLOW's own lines
    // outranked the SWAP step until a seed ate SWAP.
    doneWhen: (ctx) => ghostLessonStarted(ctx) && (!ghostFiring(ctx) || atThrustCtrlFile(ctx)),
  },
  {
    id: 'tut-ghost-swap',
    layer: 'mind',
    priority: 'tutorial',
    once: true,
    maxShownSec: GHOST_LESSON_SHOW_SEC,
    activeWhen: (ctx) => ghostLessonDue(ctx) && !inAmber(ctx) && ctx.state.run.licences.includes('swap') && swapInHand(ctx),
    text: () => GHOST_TEXT.swapLesson,
    highlight: (ctx) => toolStepTarget('swap', ctx.state.ui.activeTool?.kind ?? null, fileHintTarget('thrust-ctrl')),
    doneWhen: (ctx) => ghostLessonStarted(ctx) && (!ghostFiring(ctx) || swapRunning()),
  },
];

// The seeds that hunt your tools (§9 WP10 item 4): make a spare Repair.
const COPY_LESSON_RULES: readonly GuideRule[] = [
  {
    id: 'tut-copy-repair-tab',
    layer: 'mind',
    priority: 'tutorial',
    lesson: 'copy-repair',
    leadInSec: LESSON_LEAD_IN_SEC,
    once: true,
    maxShownSec: COPY_LESSON_SHOW_SEC,
    activeWhen: (ctx) => toolsHunted(ctx) && inAmber(ctx) && !spareRepair(ctx),
    text: copyLessonTab,
    keys: ['TAB'],
    doneWhen: (ctx) => toolsHunted(ctx) && spareRepair(ctx),
  },
  {
    id: 'tut-copy-repair',
    layer: 'mind',
    priority: 'tutorial',
    lesson: 'copy-repair',
    leadInSec: LESSON_LEAD_IN_SEC,
    once: true,
    maxShownSec: COPY_LESSON_SHOW_SEC,
    activeWhen: (ctx) => toolsHunted(ctx) && !inAmber(ctx) && !spareRepair(ctx),
    text: copyLesson,
    highlight: (ctx) => toolStepTarget('copy', ctx.state.ui.activeTool?.kind ?? null, toolFileHintTarget('repair')),
    doneWhen: (ctx) => toolsHunted(ctx) && spareRepair(ctx),
  },
];

// --- LAST LIGHT (WP11): HOLLOW's verbs, the root duel, the choice, the belt ---------------------------------------------
// A verb counting down (systems/hollow-verbs.ts) is the most urgent mind line there is: three seconds (the first one
// four), and the block is one click (`BLOCK IT — use any tool on REPAIR.BAK (3…)`). It never runs while the flight is at
// TACTICAL, so it never meets a burn's NOW line; in blue it lights SCAN (an RM: the cheap block) or DELETE (an MV: the
// only tool that reaches a hollow block) until a tool is in hand.
function verbLive(ctx: DirectorCtx): boolean {
  return isLive(ctx) && ctx.vars.verbKind !== '';
}

function verbText(ctx: TextCtx, tab: boolean): string {
  const { verbKind, verbLabel, verbSecLeft } = ctx.vars;
  if (verbKind === 'mv') return tab ? HOLLOW_VERB.stripMvTab(verbLabel, verbSecLeft) : HOLLOW_VERB.stripMv(verbLabel, verbSecLeft);
  return tab ? HOLLOW_VERB.stripRmTab(verbLabel, verbSecLeft) : HOLLOW_VERB.stripRm(verbLabel, verbSecLeft);
}

const VERB_RULES: readonly GuideRule[] = [
  {
    id: 'hollow-verb-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => verbLive(ctx) && inAmber(ctx),
    text: (ctx) => verbText(ctx, true),
    keys: ['TAB'],
  },
  {
    id: 'hollow-verb',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => verbLive(ctx) && !inAmber(ctx),
    text: (ctx) => verbText(ctx, false),
    highlight: (ctx) => {
      const held = ctx.state.ui.activeTool?.kind ?? null;
      if (held !== null) return null;
      return ctx.vars.verbKind === 'mv' ? TOOL_HINT_TARGET.delete : TOOL_HINT_TARGET.scan;
    },
  },
];

// The duel (systems/finale.ts): once ORBIT LOCK has opened the root, DELETE THE ROOT is the line, after a verb's BLOCK IT
// and before HOLLOW's eating lines (a kid who only ever repairs bites never ends the fight); once the DELETE runs, the
// eating lines come first and the strip says to keep it running. With every DELETE gone, the strip says the root will
// outlive the ship (UNRESOLVED comes when the landing ends); with every pod down first, that the ship waits for the root.
// Then the choice.
function duelOn(ctx: DirectorCtx): boolean {
  return isLanding(ctx) && ctx.state.hollow.finale.phase === 'duel';
}

function rootToDelete(ctx: DirectorCtx): boolean {
  return duelOn(ctx) && !rootDeleteRunning(ctx.state) && rootDeletable(ctx.state);
}

const FINALE_RULES: readonly GuideRule[] = [
  {
    id: 'finale-choice',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => isLanding(ctx) && ctx.state.hollow.finale.phase === 'choice',
    text: () => HOLLOW_FINALE.stripChoice,
  },
  {
    id: 'finale-no-delete',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => duelOn(ctx) && !rootDeleteRunning(ctx.state) && !rootDeletable(ctx.state),
    text: () => HOLLOW_FINALE.stripNoDelete,
  },
  // (With every pod down first, the landing table's row L0 says EVERY POD IS DOWN — now DELETE THE ROOT: a landing 'now'
  // line, above these.)
  {
    id: 'finale-delete-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => rootToDelete(ctx) && inAmber(ctx),
    text: () => HOLLOW_FINALE.stripDeleteTab,
    keys: ['TAB'],
  },
  {
    id: 'finale-delete',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => rootToDelete(ctx) && !inAmber(ctx),
    text: () => HOLLOW_FINALE.stripDelete,
    highlight: (ctx) => toolStepTarget('delete', ctx.state.ui.activeTool?.kind ?? null, ROOT_HINT_TARGET),
  },
];

const FINALE_RUNNING_RULES: readonly GuideRule[] = [
  {
    // No thread free: no verb can come, so nothing to block (WP12 p3); the DELETE just has to keep running.
    id: 'finale-deleting-alone',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => duelOn(ctx) && rootDeleteRunning(ctx.state) && !canStartOp(),
    text: (ctx) => HOLLOW_FINALE.stripDeletingAlone(formatTac(ctx.vars.rootSecLeft)),
  },
  {
    id: 'finale-deleting-tab',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => duelOn(ctx) && rootDeleteRunning(ctx.state) && inAmber(ctx),
    text: (ctx) => HOLLOW_FINALE.stripDeletingTab(formatTac(ctx.vars.rootSecLeft)),
    keys: ['TAB'],
  },
  {
    id: 'finale-deleting',
    layer: 'mind',
    priority: 'mind-urgent',
    outranksLeadIn: true,
    activeWhen: (ctx) => duelOn(ctx) && rootDeleteRunning(ctx.state) && !inAmber(ctx),
    text: (ctx) => HOLLOW_FINALE.stripDeleting(formatTac(ctx.vars.rootSecLeft)),
  },
];

// The belt ahead (§4.2: "move souls out of rack B before crossing"): like the debris's line, a tutorial while its entry is
// near and drivers are still in its racks, with MOVE in hand and instruments that can tell; on the coast only (a WAIT),
// so it never stands in front of TURN AROUND (in the first probe it hid it for 50 s, and the coast began late).
function beltMoveLive(ctx: DirectorCtx): boolean {
  if (!isFlying(ctx) || ctx.flight?.urgency !== 'wait') return false;
  if (!ctx.state.run.licences.includes('move') || ctx.vars.beltPodRacks === '') return false;
  const mode = ctx.caps.plot.mode;
  return (mode === 'exact' || mode === 'approx') && ctx.vars.beltInTac <= BELT_MOVE_HINT_TAC;
}

const beltHead = (ctx: TextCtx): string => `BELT HITS ${ctx.vars.beltRacks} IN ${formatTac(ctx.vars.beltInTac)}`;

const BELT_RULES: readonly GuideRule[] = [
  {
    id: 'belt-move-tab',
    layer: 'mind',
    priority: 'tutorial',
    lesson: 'belt-move',
    leadInSec: LESSON_LEAD_IN_SEC,
    activeWhen: (ctx) => beltMoveLive(ctx) && inAmber(ctx),
    text: (ctx) => `${beltHead(ctx)} — [TAB], MOVE drivers out of ${ctx.vars.beltPodRacks}`,
    keys: ['TAB'],
  },
  {
    id: 'belt-move',
    layer: 'mind',
    priority: 'tutorial',
    lesson: 'belt-move',
    leadInSec: LESSON_LEAD_IN_SEC,
    activeWhen: (ctx) => beltMoveLive(ctx) && !inAmber(ctx),
    text: (ctx) => `${beltHead(ctx)} — MOVE drivers out of ${ctx.vars.beltPodRacks}`,
    highlight: (ctx) => (ctx.state.ui.activeTool?.kind === 'move' ? null : TOOL_HINT_TARGET.move),
  },
];

export const GUIDE_RULES: readonly GuideRule[] = [
  ...AUTOBURN_RULES.filter((rule) => rule.priority === 'alarm'),
  ...GHOST_ALARM_RULES,
  // WP10: the ghost lesson first among the tutorials: every burst it waits costs FUEL and drags ▼ down.
  ...GHOST_LESSON_RULES,
  // The FIREWALL's line comes before MOVE-behind-a-WALL (both 'tutorial'): sealing the side beats moving
  // the driver. The wall rule's first half outranks HOLLOW's own eating lines at the wake (same priority, first).
  ...FIREWALL_RULES,
  ...WALL_RULES,
  // WP11: a verb's three seconds first among the mind's urgent lines, then the duel's DELETE THE ROOT (and the choice).
  ...VERB_RULES,
  ...FINALE_RULES,
  ...HOLLOW_RULES,
  // ...and while the root's DELETE runs, HOLLOW's eating lines come before "keep it running".
  ...FINALE_RUNNING_RULES,
  // WP9: a seed after HOLLOW's eating lines (a driver being eaten comes first), the debris and AUTOBURN's
  // lesson after the WALL tutorials. Phase 3 slice 2: the beam seeds' rules (data/threat-rules.ts, Track THREAT's) just
  // before phase 2's seed lines.
  ...THREAT_RULES,
  ...SEED_RULES,
  // WP11 review: a driver bitten again in the same spot is MOVEd behind a WALL, after a seed's one-click DELETE.
  ...BITTEN_AGAIN_RULES,
  // WP10: the COPY lesson after a seed's own RM line (the seed at hand first, then the spare).
  ...COPY_LESSON_RULES,
  ...DEBRIS_RULES,
  ...BELT_RULES,
  ...AUTOBURN_RULES.filter((rule) => rule.priority !== 'alarm'),
  ...ENGINE_BEAT_RULES,
  // Slice 2: the landing's general lessons before the hurt driver's particular one; the SCAN lesson after it (it waits
  // for POD 02 to be settled).
  ...LANDING_LESSON_RULES,
  // The SCAN lesson before the hurt-driver lesson: it is live only once POD 02 is settled or the coast has waited
  // LOG_SCAN_AFTER_COAST_SEC for it, and then has the strip for its few seconds (minor 10).
  ...LOG_RULES,
  ...DRIVER_RULES,
  // Slice 1b: the wide-drop lesson after the hurt driver's (POD 02 WILL LAND HARD names the same REPAIR, and comes first).
  ...DROP_LESSON_RULES,
  {
    // WP12 p3 (WP11's TODO): the crossings wear the Core with transit hits, and below CORE_LOW_INTEGRITY it runs one
    // thread fewer (§3.3 C5) while nothing is infected, so no alarm ever says so; a kid reached LAST LIGHT with one
    // thread, which the duel needs. In blue on a quiet coast (where REPAIR is, and nothing else asks), the strip says
    // it, ahead of MIND CLEAR's SKIP (the mind is not clear). Only while REPAIR and some charge can do it.
    id: 'hint-core-worn',
    layer: 'mind',
    priority: 'hint',
    activeWhen: (ctx) => ctx.mode === 'memory'
      && ctx.flight?.urgency === 'wait'
      && !ctx.mindAlert
      && coreWorn(ctx),
    text: () => CORE_WORN_LINE,
    highlight: (ctx) => repairStepTarget(ctx.state.ui.activeTool?.kind ?? null, 'core'),
  },
  {
    // In blue with nothing to do on a long coast: SKIP is the way out, when the flight's own line offers
    // it (its F key). The hint only repeats the flight table, so it never advertises a SKIP the strip has
    // a reason not to (LEAD-1 review round 1: in blue it brought back the six-hour SKIP).
    id: 'hint-mind-clear',
    layer: 'mind',
    priority: 'hint',
    activeWhen: (ctx) => ctx.mode === 'memory'
      && ctx.mindQuietSec >= MIND_CLEAR_IDLE_SEC
      && !ctx.mindAlert
      && ctx.flight?.urgency === 'wait'
      && ctx.skipAvailable
      && ctx.flight.keys.includes('F'),
    text: (ctx) => `MIND CLEAR — press [F] to SKIP to ${ctx.vars.nextApsis}`,
    keys: ['F'],
  },
  {
    // The landing's twin (01-landing §3.11): in blue with nothing to do between windows, when the landing table's WAIT
    // offers the SKIP (its F key), it says where the SKIP goes: `MIND CLEAR — press [F] to SKIP to LZ-B`.
    id: 'hint-mind-clear-landing',
    layer: 'mind',
    priority: 'hint',
    activeWhen: (ctx) => ctx.mode === 'memory'
      && ctx.mindQuietSec >= MIND_CLEAR_IDLE_SEC
      && !ctx.mindAlert
      && ctx.landing?.urgency === 'wait'
      && ctx.landing.keys.includes('F')
      && ctx.vars.nextLz !== '',
    text: (ctx) => LANDING_ASKS.mindClear(ctx.vars.nextLz),
    keys: ['F'],
  },
];

// One id per beat and rule: done[] records them by id.
function validateScript(): void {
  const ids = new Set<string>();
  for (const item of [...BEATS, ...GUIDE_RULES, ...FILE_FAULTS]) {
    if (ids.has(item.id)) throw new Error(`script.ts: duplicate id '${item.id}'`);
    ids.add(item.id);
  }
  // A lesson's wordings (GuideRule.lesson) share one completion, one maxShownSec clock and one lead-in (director.ts):
  // they must agree on all three and on their priority, and only a tutorial has a lead-in.
  const lessons = new Map<string, GuideRule>();
  for (const rule of GUIDE_RULES) {
    if (rule.leadInSec !== undefined && rule.priority !== 'tutorial') {
      throw new Error(`script.ts: '${rule.id}' has a lead-in but is a ${rule.priority} rule`);
    }
    if (rule.lesson === undefined) continue;
    const first = lessons.get(rule.lesson);
    if (first === undefined) {
      lessons.set(rule.lesson, rule);
      continue;
    }
    const agree = first.priority === rule.priority && first.once === rule.once && first.maxShownSec === rule.maxShownSec
      && first.leadInSec === rule.leadInSec;
    if (!agree) throw new Error(`script.ts: the '${rule.lesson}' lesson's wordings '${first.id}' and '${rule.id}' disagree on priority, once, maxShownSec or leadInSec`);
  }
  // Every scripted fault stamps the file it breaks.
  for (const fault of FILE_FAULTS) {
    if (!FAULT_STAMP[fault.role]) throw new Error(`script.ts: no FAULT_STAMP for the '${fault.id}' fault on '${fault.role}'`);
  }
}
validateScript();
