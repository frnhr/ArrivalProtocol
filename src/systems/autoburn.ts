// Slice 4: Track FLIGHT owns this file (docs/phase3/impl/slice-4-plan.md §5.2): versions and modes, LOCK RANGE, the
// claim, takeovers. Others ask by message.
import type { Store } from '@state/store';
import type { GameState, AutoburnPhase, AutoburnEnd, AutoburnState, AutoburnBurn } from '@state/schema';
import type { Segment, SkillFileSegment } from '@/types/segment';
import type { AutoMode, SkillVersion } from '@/types/skill';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { stopSkipOnPress } from '@systems/pace';
import {
  getPrediction, secUntil, burnKey, planModeBurn, circleStep, atCircle, loopEccentricity,
  type Prediction, type BurnPoint, type BurnReason,
} from '@systems/predict';
import { capabilitiesNow, engineFault, presetsAvailable, skillLive, type SkillLive } from '@systems/capabilities';
import { reserveThread, releaseThread, canStartOp } from '@systems/ops-core';
import { isPresetAligning } from '@systems/attitude';
import { registerKeys } from '@systems/input';
import { say } from '@systems/say';
import { emit } from '@systems/events';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { skillFilesOf, engineOpen } from '@state/selectors';
import { autoburnDemoSkill } from '@systems/skill-tree';
import { paid } from '@systems/skill-levels';
import { getDropSolution } from '@systems/drop-cache';
import { burnSpanBlocks } from '@systems/landing-rules';
import {
  AUTOBURN_TEXT, AUTOBURN_DROP_TEXT, AUTOBURN_DROP_TAB, AUTOBURN_REFUSAL, AUTOBURN_SKILL_ROW, autoRefusalKey, type AutoburnRefusal,
} from '@data/skill-text';
import { ringFit, elementsFromState, type RingFit } from '@/types/orbit';
import {
  LOCK_RANGE_TAC, AUTOBURN_LOST_ALARM_SEC, BAND_DEGRADED_MIN, AUTO_THREAD_CLAIM_TAC, AUTO_THREAD_RELEASE_TAC, AUTO_FUEL_RESERVE_PCT,
  ROUND_E_TOL, AUTOBURN_DONE_LINE_SEC,
} from '@data/tuning';

// AUTOBURN (§6.10, §9 WP9 item 5; phase 3 slice 4, 03 §3.6–§3.7): a skill the kid trained by capturing by hand, DOM-free.
//
// • TRAINING (03 §3.3). AUTOBURN.skl is bought at a desk (systems/training.ts) and arrives in the packet. Every manual
//   capture (a player burn that closed the loop) is a demo: how late the kid started against the START BURN tick
//   (run.stats.demos, systems/run.ts), and the skill learns half the mean offset of the last AUTO_DEMO_WINDOW
//   (skill-tree.ts demoSkill; with none it is UNTRAINED and fires AUTOBURN_UNTRAINED_OFFSET_TAC late, plan §7 R3). Its
//   version and lock under damage are capabilities.ts skillLive's (03 §3.5: one version per colour of damage).
// • MODES (autoModeFor: "[B] makes it green; [B] on green makes it round"). v1 flies the CAPTURE. v2 flies GREEN (the
//   capture if there is one, then the ring trims at ▲ and ▼, the cheapest green the planner knows) on anything that is not
//   fully green, and ROUND (burns at ▼ and ▲ to a circle at ▼'s altitude, e < ROUND_E_TOL) on a green loop. The mode is
//   fixed at engagement; while engaged the planner flies it (predict.ts computePrediction), so every START BURN tick on
//   the plot is AUTOBURN's. In LANDING (v2 only) a locked orbit is green, so [B] there offers ROUND; an accepted one GREEN.
// • USE. [B] (or the Engine window's AUTO button) engages it when the file works, the presets and the engine work, the
//   mode has a burn, and that burn's START BURN is within the file's LOCK RANGE (90 / 270 / 810 tac s, effective lock).
//   It holds no Core thread while it waits.
// • THE MACHINE. idle → armed (waiting; AUTO_THREAD_CLAIM_TAC before its burn it CLAIMS a Core thread (ops-core
//   reserveThread: THRUST LIMIT 75%, one op fewer) and selects the burn's preset; no thread free: it waits, the strip says
//   `× AN OP`, and it fires late, as soon as one frees) → pointing (its moment came, the ship still turns) → burning (it
//   holds the throttle, firingSource 'auto', at the burn point + its learned offset) → back to armed between v2's burns
//   (the thread let go) → done (CAPTURED, GREEN ORBIT, ROUND ORBIT, SAVING FUEL, a downgrade, the tank dry) | dropped (the
//   file eaten or hurt to OFF, the engine dead, the presets gone: the klaxon and `AUTOBURN.skl LOST — MANUAL`). It flies
//   from blue too (the mode switch only lets go of a PLAYER burn): the only burn the MIND can make.
// • TAKEOVERS. While it only waits, the kid's IN/OUT correction and any preset choice are not a takeover: it selects its
//   own preset once, as it enters the claim window, lets a preset the kid picks after that stand (an IN correction at
//   T−5 is the kid's to fly), and takes its preset back at the fire moment, once the kid is not firing (review M2). SPACE
//   on PRO or RETRO is a takeover. While it points or burns, any player burn or another preset is.
//   [B] again lets go of it. Pause freezes it like everything (pause lets go of the throttle); it takes the throttle again
//   once the world moves.
// • THE FUEL RESERVE. It never starts a trim or a ROUND burn that would leave less than AUTO_FUEL_RESERVE_PCT (03 §3.6),
//   and says so (`GREEN, NOT ROUND — SAVING FUEL`). Never the capture (plan §7 R4).
// • GRADED DAMAGE (4b). A fall below what the mode needs finishes the burn v1 can (the capture), then hands back
//   (`'downgraded'`); a fall to OFF is the drop.
//   (§6.10 stopped it the moment the loop closes. On KESTREL that is about a fifth of the capture's braking, and its
//   `trim it green yourself` sent the kid back to fly the other four fifths by hand: WP9 review round 1. A capture now
//   brakes on for as long as the strip would tell a kid to KEEP HOLDING.)

const OWNER = 'autoburn';

// The version each mode needs (03 §3.6; 4e's landing orbit is v3's).
const MODE_NEEDS: Readonly<Record<AutoMode, SkillVersion>> = { capture: 1, green: 2, round: 2, 'landing-orbit': 3 };

// The burn in hand (state.burn.auto.flying) and whether this engagement captured (auto.captured) live in the saved state
// (review fix, FLIGHT deviation 7: 4c saves inside a flight). Only the chime's edge stays here: the ship was inside the
// LOCK range at the last tick ('autoburn-in-lock' sounds on the way in); a reload re-reads it on its first tick, silent.
let wasInLock: boolean | null = null;

// --- The skill (slice 4) ------------------------------------------------------------------------------------------------

// The unit's AUTOBURN.skl copies, whatever their health (skillLive picks the one that counts).
export function skillFiles(memory: readonly Segment[]): SkillFileSegment[] {
  return skillFilesOf(memory, 'autoburn');
}

// The run has bought AUTOBURN (at a desk, or a migrated save's free one): a unit without the file has lost it, rather than
// never trained it (the refusal's words, the AUTO button and the Skills row).
export function autoburnEverTrained(state: Readonly<GameState>): boolean {
  return paid(state.run.skills, 'autoburn') !== null;
}

// What AUTOBURN is doing now, for the Skills window's row (Track UI's skills.ts skillRow reads it; the words and the rule are
// this file's): its file gone, too damaged to work, working as a lower version (4b), armed in its mode, waiting for a
// thread, flying, or trained and how well (UNTRAINED with no demos). Pure.
export interface AutoburnStatus {
  text: string;
  tone: 'good' | 'warn';
}

export function autoburnStatus(state: Readonly<GameState>): AutoburnStatus {
  const live = skillLive(state.memory, 'autoburn');
  if (live.file === null) return { text: AUTOBURN_SKILL_ROW.gone, tone: 'warn' };
  if (live.version === 0) return { text: AUTOBURN_SKILL_ROW.damaged(BAND_DEGRADED_MIN), tone: 'warn' };
  const auto = state.burn.auto;
  if (auto.phase === 'armed') {
    if (auto.waitingSinceTSec !== null) return { text: AUTOBURN_SKILL_ROW.waiting, tone: 'warn' };
    if (auto.mode === null) throw new Error('autoburnStatus: armed without a mode');
    return { text: AUTOBURN_SKILL_ROW.armed[auto.mode], tone: 'good' };
  }
  if (isEngaged(auto.phase)) return { text: AUTOBURN_SKILL_ROW.flying, tone: 'good' };
  if (live.nominal !== null && live.version < live.nominal.version) {
    return { text: AUTOBURN_SKILL_ROW.worksAs(live.version, live.nominal.version), tone: 'warn' };
  }
  const skill = autoburnDemoSkill(state.run.stats);
  if (skill.untrained) return { text: AUTOBURN_SKILL_ROW.untrained(skill.accuracy), tone: 'warn' };
  return { text: AUTOBURN_SKILL_ROW.trained(skill.accuracy, skill.demos), tone: 'good' };
}

// What [B] would fly now (03 §3.6: "[B] makes it green; [B] on green makes it round"), from the effective version: v1 the
// capture on an open path, in the flight only; v2+ GREEN on anything not fully green (an open path, a closed loop outside
// the ring), ROUND on a loop in the ring while e ≥ ROUND_E_TOL; null with nothing to fly (an impact course is the kid's:
// AUTOBURN never steers). In LANDING a locked orbit is in the ring (ROUND), an accepted one is not (GREEN). Pure.
// One entry per version (a Record, so a new version is a type error until it has its row): 4e's v3 adds the landing orbit
// in its own row; until then v3 flies v2's modes (it holds every version below it).
const MODES_BY_VERSION: Readonly<Record<SkillVersion, (state: Readonly<GameState>, pred: Prediction) => AutoMode | null>> = {
  1: (state, pred) => (state.run.phase !== 'landing' && pred.outcome === 'open' ? 'capture' : null),
  2: (_state, pred) => {
    if (pred.outcome === 'open' || !pred.fit.inRing) return 'green';
    return loopEccentricity(pred.fit) >= ROUND_E_TOL ? 'round' : null;
  },
  3: (state, pred) => MODES_BY_VERSION[2](state, pred),
};

export function autoModeFor(state: Readonly<GameState>, pred: Prediction, live: Readonly<SkillLive>): AutoMode | null {
  if (live.version === 0 || pred.outcome === 'impact') return null;
  const modes = MODES_BY_VERSION[live.version];
  if (modes === undefined) throw new Error(`autoModeFor: no modes for AUTOBURN v${String(live.version)}`);
  return modes(state, pred);
}

// The lock range in tactical seconds at the file's effective lock (LOCK_RANGE_TAC; null: the skill does not work).
export function lockRangeTac(live: Readonly<SkillLive>): number | null {
  if (live.version === 0 || live.lock === null) return null;
  return LOCK_RANGE_TAC[live.lock];
}

// ROUND's circle (03 §3.6: "at ▼'s altitude"), and in LANDING the other-apsis rule (plan §7 R2): a burn at ▼ whose span
// crosses an in-band window of an LZ with room (launches are refused while firing, and the planet does not rotate, so a
// blocked ▼ is blocked every pass) rounds at ▲'s altitude instead, one burn at ▲; when that one crosses a window too it
// rounds at ▼ anyway, and names the LZ whose window it costs.
export interface RoundAim {
  targetKm: number;
  costsLz: string | null;
}

export function roundAim(state: Readonly<GameState>, pred: Prediction): RoundAim {
  const low: RoundAim = { targetKm: pred.fit.rp, costsLz: null };
  if (state.run.phase !== 'landing' || pred.outcome !== 'closed') return low;
  if (getDropSolution() === null) return low;
  const lowCosts = burnCostsLz(state, pred, planModeBurn(state, pred, 'round', low.targetKm));
  if (lowCosts === null) return low;
  if (burnCostsLz(state, pred, planModeBurn(state, pred, 'round', pred.fit.ra)) === null) return { targetKm: pred.fit.ra, costsLz: null };
  return { targetKm: low.targetKm, costsLz: lowCosts };
}

// The LZ whose in-band window a planned burn's span crosses (landing-rules.ts burnSpanBlocks), or null: none, no burn, or
// outside LANDING.
function burnCostsLz(state: Readonly<GameState>, pred: Prediction, burnPoint: Readonly<BurnPoint> | null): string | null {
  const sol = getDropSolution();
  if (state.run.phase !== 'landing' || sol === null || burnPoint === null) return null;
  const startInSec = secUntil(pred, burnPoint.inSec, state.clock.tSec);
  return burnSpanBlocks(state, sol, startInSec, Number.isFinite(burnPoint.estBurnSec) ? burnPoint.estBurnSec : 0);
}

// GREEN in LANDING (an accepted orbit) fires its trim at the apsis whatever the window (FLIGHT deviation 1, kept by the
// lead's ruling): the LZ its first trim costs, for the press's radio line, or null.
export function greenCostsLz(state: Readonly<GameState>, pred: Prediction): string | null {
  return burnCostsLz(state, pred, planModeBurn(state, pred, 'green', null));
}

// The burn `mode` would fly first (the NAV PLOT's ghost and LOCK bracket before the press, the lock range at the press),
// from `pred` (the cached true prediction when none is given). While engaged in that mode it is the plan itself.
export function previewModeBurn(state: Readonly<GameState>, mode: AutoMode, pred: Prediction = getPrediction()): BurnPoint | null {
  return planModeBurn(state, pred, mode, modeTargetKm(state, pred, mode));
}

// The circle `mode` aims at: the engaged one's own, else ROUND's aim as a press now would take it; null for GREEN and CAPTURE.
export function modeTargetKm(state: Readonly<GameState>, pred: Prediction, mode: AutoMode): number | null {
  const auto = state.burn.auto;
  if (isEngaged(auto.phase) && auto.mode === mode) return auto.targetKm;
  return mode === 'round' ? roundAim(state, pred).targetKm : null;
}

// --- Using it --------------------------------------------------------------------------------------------

export function isEngaged(phase: AutoburnPhase): boolean {
  return phase === 'armed' || phase === 'pointing' || phase === 'burning';
}

function isCaptureBurn(reason: BurnReason): boolean {
  return reason === 'capture' || reason === 'missed';
}

// FUEL % a burn would leave (impulsive: what the plan's NEEDED reads).
function fuelAfterPct(state: Readonly<GameState>, burnPoint: Readonly<BurnPoint>): number {
  return state.burn.fuelPct - (burnPoint.dvKmS / state.level.dvBudgetKmS) * 100;
}

// The reserve refuses this burn (03 §3.6): a trim or a ROUND burn, never the capture (plan §7 R4).
function reserveRefuses(state: Readonly<GameState>, burnPoint: Readonly<BurnPoint>): boolean {
  return !isCaptureBurn(burnPoint.reason) && fuelAfterPct(state, burnPoint) < AUTO_FUEL_RESERVE_PCT;
}

// Why B can't engage AUTOBURN right now (§6.10), or null when it can. Pure (reads the cached drop solution in LANDING for
// ROUND's aim). Slice 4: the engine is open in LANDING too (selectors engineOpen), where only v2+ flies (ROUND, or GREEN on
// an accepted orbit): v1 refuses there as the flight being over. The Core thread is no longer a refusal: it is claimed
// AUTO_THREAD_CLAIM_TAC before the burn.
export function autoburnRefusal(state: Readonly<GameState>, pred: Prediction): AutoburnRefusal | null {
  if (!engineOpen(state)) return AUTOBURN_REFUSAL.over;
  const live = skillLive(state.memory, 'autoburn');
  if (state.run.phase === 'landing' && live.version < 2) return AUTOBURN_REFUSAL.over;
  if (state.clock.paused) return AUTOBURN_REFUSAL.paused;
  if (live.file === null) return autoburnEverTrained(state) ? AUTOBURN_REFUSAL.noFile : AUTOBURN_REFUSAL.untrained;
  if (live.version === 0) return AUTOBURN_REFUSAL.damaged;
  const caps = capabilitiesNow(state);
  if (!presetsAvailable(caps)) return AUTOBURN_REFUSAL.presets;
  if (engineFault(caps) !== null) return AUTOBURN_REFUSAL.engine;
  const mode = autoModeFor(state, pred, live);
  // v2 has nothing to fly only on an impact course or a loop that is already round.
  if (mode === null) {
    if (live.version === 1) return AUTOBURN_REFUSAL.noCapture;
    return pred.outcome === 'impact' ? AUTOBURN_REFUSAL.impact : AUTOBURN_REFUSAL.round;
  }
  if (mode === 'capture' && !(pred.rp > state.level.planet.R)) return AUTOBURN_REFUSAL.noCapture;
  const burnPoint = previewModeBurn(state, mode, pred);
  if (burnPoint === null) return AUTOBURN_REFUSAL.noCapture;
  const range = lockRangeTac(live);
  if (range === null) throw new Error('autoburnRefusal: a working AUTOBURN without a lock range');
  if (secUntil(pred, burnPoint.inSec, state.clock.tSec) / state.level.tacticalWarp > range) return AUTOBURN_REFUSAL.tooFar;
  if (reserveRefuses(state, burnPoint)) return AUTOBURN_REFUSAL.reserve;
  if (state.burn.firing && state.burn.firingSource === 'player') return AUTOBURN_REFUSAL.burning;
  // Last, so it only stands for "[B] would engage it, but a press during a SKIP only stops the SKIP" (pressAutoburn):
  // the strip's ` · or [B] AUTO` and the HUD's AUTO never offer a press that would not engage it.
  if (state.clock.skipWarp !== null) return AUTOBURN_REFUSAL.skipping;
  return null;
}

// AUTOBURN can be engaged right now (and is not already).
export function autoburnAvailable(state: Readonly<GameState>, pred: Prediction): boolean {
  return !isEngaged(state.burn.auto.phase) && autoburnRefusal(state, pred) === null;
}

// The mode a press of [B] would engage now (the AUTO button's head, the guidance tails, the ghost), or null when [B]
// would not engage it.
export function autoOfferMode(state: Readonly<GameState>, pred: Prediction): AutoMode | null {
  if (!autoburnAvailable(state, pred)) return null;
  return autoModeFor(state, pred, skillLive(state.memory, 'autoburn'));
}

// Tactical seconds until AUTOBURN fires `burnPoint` (its START BURN tick + its learned offset). A late skill can still
// be waiting when ▼ goes by: the capture is then MISSED ▼, due now, and it fires at once (its START BURN stays a few
// seconds behind the ship, so the offset would never come round).
function fireInTac(state: Readonly<GameState>, pred: Prediction, burnPoint: Readonly<BurnPoint>): number {
  const offset = autoburnDemoSkill(state.run.stats).learnedOffsetTac;
  const inTac = secUntil(pred, burnPoint.inSec, state.clock.tSec) / state.level.tacticalWarp;
  if (burnPoint.reason === 'missed') return Math.min(0, inTac + offset);
  return inTac + offset;
}

// Tactical seconds until AUTOBURN fires the plan's next burn, or null with none (the plan is its mode's while engaged).
export function autoburnFireInTac(state: Readonly<GameState>, pred: Prediction): number | null {
  const burnPoint = pred.burnPoint;
  return burnPoint === null ? null : fireInTac(state, pred, burnPoint);
}

// The armed countdown every HUD shows (the strip, the AUTO button, the mini-HUD): tactical seconds until it fires,
// 0 once due. A burn that has just gone away reads 0 for the tick until the machine stands down (its post tick).
export function autoburnArmedInTac(state: Readonly<GameState>, pred: Prediction): number {
  return Math.max(0, autoburnFireInTac(state, pred) ?? 0);
}

// What the armed AUTOBURN waits for, for the strip and the button: the capture, a trim or a ROUND burn, and at which apsis.
export interface AutoArmedBurn {
  kind: 'capture' | 'trim' | 'round';
  glyph: '▼' | '▲';
  inTac: number;
  waiting: boolean;   // its claim found no thread free (03 §3.6): `× AN OP`
}

export function autoArmedBurn(state: Readonly<GameState>, pred: Prediction): AutoArmedBurn | null {
  const auto = state.burn.auto;
  if (auto.phase !== 'armed') return null;
  const burnPoint = pred.burnPoint;
  const kind = burnPoint === null || isCaptureBurn(burnPoint.reason) ? 'capture' : burnPoint.reason === 'round' ? 'round' : 'trim';
  return {
    kind, glyph: burnPoint?.event === 'apo' ? '▲' : '▼', inTac: autoburnArmedInTac(state, pred), waiting: auto.waitingSinceTSec !== null,
  };
}

// What the burn it is flying now is (the strip's BRAKING / TRIMMING / ROUNDING), or null while it does not fly.
export function autoFlyingKind(state: Readonly<GameState>): AutoArmedBurn['kind'] | null {
  const { phase, flying } = state.burn.auto;
  if ((phase !== 'pointing' && phase !== 'burning') || flying === null) return null;
  return isCaptureBurn(flying.reason) ? 'capture' : flying.reason === 'round' ? 'round' : 'trim';
}

// The hand-back line of the engagement that just ended (its end, for AUTOBURN_DONE_LINE_SEC), or null: GREEN, ROUND,
// SAVING FUEL and a downgrade (phase 2's CAPTURED and IN THE RING keep their own rows in guidance).
export function autoburnDoneLine(state: Readonly<GameState>): string | null {
  const auto = state.burn.auto;
  if (auto.phase !== 'done' || state.clock.aiSec - auto.atAi >= AUTOBURN_DONE_LINE_SEC) return null;
  return endLine(auto, state.run.phase === 'landing');
}

// The reserve's and the downgrade's words by the mode that stopped (one row per mode: 4e's landing orbit adds its own).
function stoppedLine(auto: Readonly<AutoburnState>, why: 'reserve' | 'downgraded'): string {
  const mode = auto.mode;
  switch (mode) {
    case 'capture':
    case 'green':
      if (why === 'reserve') return auto.captured ? AUTOBURN_TEXT.reserveCaptured : AUTOBURN_TEXT.reserveGreen;
      return auto.captured ? AUTOBURN_TEXT.downgradedCaptured : AUTOBURN_TEXT.downgradedGreen;
    case 'round': return why === 'reserve' ? AUTOBURN_TEXT.reserveRound : AUTOBURN_TEXT.downgradedRound;
    case 'landing-orbit':
    case null:
      throw new Error(`autoburn: no ${why} line for mode ${String(mode)}`);
  }
}

function endLine(auto: Readonly<AutoburnState>, landing: boolean): string | null {
  switch (auto.end) {
    case 'green': return landing ? AUTOBURN_TEXT.greenLanding : AUTOBURN_TEXT.green;
    case 'round': return landing ? AUTOBURN_TEXT.roundLanding : AUTOBURN_TEXT.round;
    case 'reserve':
    case 'downgraded':
      return stoppedLine(auto, auto.end);
    default: return null;
  }
}

// One update of the machine's state: the phase (and when it began), its end, and what the engagement holds. The mode and
// its circle stay readable after it ends (the hand-back's words) and go when it is idle again.
function setPhase(store: Store<GameState>, to: AutoburnPhase, end: AutoburnEnd | null, patch: Partial<AutoburnState> = {}): void {
  const from = store.getState().burn.auto.phase;
  const at = store.getState().clock.aiSec;
  store.update((draft) => {
    const auto = draft.burn.auto;
    auto.phase = to;
    auto.atAi = at;
    auto.end = end;
    if (to === 'idle') { auto.mode = null; auto.targetKm = null; auto.captured = false; }
    if (!isEngaged(to)) { auto.claimed = false; auto.waitingSinceTSec = null; }
    if (to !== 'pointing' && to !== 'burning') auto.flying = null;
    Object.assign(auto, patch);
  });
  emit('autoburn', { from, to, end });
}

// The throttle, as AUTOBURN holds it (the same three fields flight-controls' setFiring writes; AUTOBURN does
// not go through it, so guidance and flight-controls can read this module without a cycle).
function hold(store: Store<GameState>, on: boolean): void {
  const burn = store.getState().burn;
  if (on && !burn.firing) {
    const firingFor = burnKey(getPrediction().burnPoint);
    store.update((draft) => { draft.burn.firing = true; draft.burn.firingSource = 'auto'; draft.burn.firingFor = firingFor; });
  } else if (!on && burn.firing && burn.firingSource === 'auto') {
    store.update((draft) => { draft.burn.firing = false; draft.burn.firingSource = null; draft.burn.firingFor = null; });
  }
}

// Points the ship along `preset` (the claim's selection, and the fire's), as the preset keys do.
function selectPreset(store: Store<GameState>, preset: 'prograde' | 'retrograde'): void {
  const state = store.getState();
  if (state.burn.sasMode === preset) return;
  const aligning = isPresetAligning(preset, state.burn.heading, state.orbit);
  store.update((draft) => {
    draft.burn.sasMode = preset;
    draft.burn.rotInput = 0;
    draft.burn.presetAligning = aligning;
  });
}

const LOST_ALERT_ID = 'autoburn-lost';

// Ends an engagement: lets go of the throttle and the thread, then says why. A drop sounds the klaxon (an alarm
// alert for AUTOBURN_LOST_ALARM_SEC: TACTICAL, the vignette, the strip's alarm line in script.ts).
function finish(store: Store<GameState>, phase: Extract<AutoburnPhase, 'idle' | 'done' | 'dropped'>, end: AutoburnEnd): void {
  const offline = end === 'offline' ? skillLive(store.getState().memory, 'autoburn').offline : null;
  hold(store, false);
  releaseThread(OWNER);
  setPhase(store, phase, end);
  const line = phase === 'done' ? endLine(store.getState().burn.auto, store.getState().run.phase === 'landing') : null;
  if (phase === 'done' && end === 'braked') say('sys', AUTOBURN_TEXT.braked, { critical: true });
  else if (phase === 'done' && end === 'in-ring') say('sys', AUTOBURN_TEXT.inRing, { critical: true });
  else if (line !== null) say('sys', line, { critical: true });
  else if (phase === 'idle' && (end === 'takeover' || end === 'cancel')) say('sys', AUTOBURN_TEXT.off, { critical: true });
  // The kid's own REPAIR or MOVE took the file offline (review m2): said plainly, no klaxon (03 §3.5: a choice, not a loss).
  else if (offline !== null) say('sys', AUTOBURN_TEXT.offline[offline], { critical: true });
  const dropText = AUTOBURN_DROP_TEXT[end];
  if (phase === 'dropped' && dropText) {
    raiseAlert(store, { id: LOST_ALERT_ID, layer: 'ship', severity: 'alarm', text: dropText, inhibitsSkip: true });
    say('sys', dropText, { critical: true });
  }
}

// Between v2's burns: the throttle and the thread let go, armed for the plan's next burn, which claims a thread of its own
// (review M1: 03 §3.6 "It holds it to the end of that burn"; the claim flag stayed set and the next burn flew unclaimed).
function rearm(store: Store<GameState>): void {
  hold(store, false);
  releaseThread(OWNER);
  setPhase(store, 'armed', null, { claimed: false, waitingSinceTSec: null });
}

// The strip's alarm line while a drop stands (script.ts), worded for the screen the kid is on.
export function autoburnDropLine(state: Readonly<GameState>): string | null {
  const auto = state.burn.auto;
  if (auto.phase !== 'dropped' || auto.end === null || state.clock.aiSec - auto.atAi >= AUTOBURN_LOST_ALARM_SEC) return null;
  const text = AUTOBURN_DROP_TEXT[auto.end];
  if (!text) return null;
  return state.ui.mode === 'memory' ? `${text}${AUTOBURN_DROP_TAB}` : text;
}

// [B] / AUTO: engages it in the mode the orbit calls for (armed, no thread held yet), or refuses with its reason (a buzz).
export function engageAutoburn(store: Store<GameState>): AutoburnRefusal | null {
  const state = store.getState();
  if (isEngaged(state.burn.auto.phase)) return null;
  const pred = getPrediction();
  const refusal = autoburnRefusal(state, pred);
  if (refusal !== null) {
    emit('refused', { reason: autoRefusalKey(refusal) });
    return refusal;
  }
  const mode = autoModeFor(state, pred, skillLive(state.memory, 'autoburn'));
  if (mode === null) throw new Error('engageAutoburn: no mode although autoburnRefusal found none');
  const aim = mode === 'round' ? roundAim(state, pred) : null;
  setPhase(store, 'armed', null, { mode, targetKm: aim?.targetKm ?? null, claimed: false, waitingSinceTSec: null, captured: false });
  if (aim?.costsLz) say('sys', AUTOBURN_TEXT.roundCostsWindow(aim.costsLz), { critical: true });
  // A GREEN press in LANDING (an accepted orbit) fires its trim at the apsis whatever the window (FLIGHT deviation 1): the
  // radio names the window it costs, so the kid can drop it first and press [B] after (review (a)).
  const trimCosts = mode === 'green' ? greenCostsLz(state, pred) : null;
  if (trimCosts !== null) say('sys', AUTOBURN_TEXT.greenCostsWindow(trimCosts), { critical: true });
  return null;
}

// [B] again: the kid lets go of it.
export function cancelAutoburn(store: Store<GameState>): boolean {
  if (!isEngaged(store.getState().burn.auto.phase)) return false;
  finish(store, 'idle', 'cancel');
  return true;
}

export function toggleAutoburn(store: Store<GameState>): AutoburnRefusal | null {
  if (cancelAutoburn(store)) return null;
  return engageAutoburn(store);
}

// [B] and the AUTO button, the kid's presses. While a SKIP runs (pace.ts stopSkipOnPress), a [B] that would engage
// AUTOBURN only stops the SKIP (the lead's ruling for LEAD-2 review round 2; AUTO is not offered then, refusal
// SKIPPING), and the next press engages it. A [B] on an armed AUTOBURN stops the SKIP and cancels it, as its strip
// line and button say (`[B] to cancel`, `[B] OFF`). A [B] refused for any other reason (a unit without
// AUTOBURN.skl, nothing to capture) buzzes it and the SKIP runs on (review round 3): a key that does nothing on this
// ship must not cut a SKIP short.
export function pressAutoburn(store: Store<GameState>): AutoburnRefusal | null {
  const state = store.getState();
  if (engineOpen(state) && !state.clock.paused && state.clock.skipWarp !== null) {
    if (isEngaged(state.burn.auto.phase)) {
      stopSkipOnPress(store);
      return toggleAutoburn(store);
    }
    if (autoburnRefusal(state, getPrediction()) === AUTOBURN_REFUSAL.skipping) {
      stopSkipOnPress(store);
      return null;
    }
  }
  return toggleAutoburn(store);
}

// One tick of the machine (see the header). Runs every tick, also while paused (it then only waits).
function tick(store: Store<GameState>): void {
  const state = store.getState();
  const auto = state.burn.auto;
  // The drop's alarm stands AUTOBURN_LOST_ALARM_SEC, or until the kid engages it again, whichever comes first.
  if (auto.phase !== 'dropped' || state.clock.aiSec - auto.atAi >= AUTOBURN_LOST_ALARM_SEC) clearAlert(store, LOST_ALERT_ID);
  if (!isEngaged(auto.phase)) { lockTick(state); return; }
  const mode = auto.mode;
  if (mode === null) throw new Error('autoburn tick: engaged without a mode');
  // v1's capture is the flight's only; v2's modes go on into LANDING on the same orbit (03 §3.6: [B] there offers ROUND).
  if (!engineOpen(state) || (mode === 'capture' && state.run.phase !== 'flight')) { finish(store, 'idle', 'flight-over'); return; }
  if (state.clock.paused) return;
  const playerFiring = state.burn.firing && state.burn.firingSource === 'player';
  const live = skillLive(state.memory, 'autoburn');
  if (live.version === 0) {
    if (live.offline !== null) finish(store, 'idle', 'offline');
    else finish(store, 'dropped', live.file === null ? 'lost' : 'damaged');
    return;
  }
  const caps = capabilitiesNow(state);
  if (engineFault(caps) !== null) { finish(store, 'dropped', 'engine'); return; }
  if (!presetsAvailable(caps)) { finish(store, 'dropped', 'presets'); return; }
  const fit = ringFit(elementsFromState(state.orbit, state.level.planet.mu), state.level.ring);
  if (auto.phase === 'burning' || auto.phase === 'pointing') { burnTick(store, fit, live, playerFiring); return; }
  // Armed: only the kid's own PRO or RETRO burn takes over (03 §3.6: an IN/OUT correction, or a preset choice, does not).
  if (playerFiring && (state.burn.sasMode === 'prograde' || state.burn.sasMode === 'retrograde')) { finish(store, 'idle', 'takeover'); return; }
  armedTick(store, fit, live, playerFiring);
}

// Armed: waiting for its moment, on a burn that is still there and still its to fly.
function armedTick(store: Store<GameState>, fit: RingFit, live: Readonly<SkillLive>, playerFiring: boolean): void {
  const state = store.getState();
  const auto = state.burn.auto;
  const mode = auto.mode!;
  const pred = getPrediction();
  // Nothing left to fly: the mode is done (GREEN in the ring, ROUND at its circle), or the burn it waited for went away.
  if (mode === 'capture' && fit.closed) { finish(store, 'idle', 'no-capture'); return; }
  if (mode === 'green' && fit.inRing) { finish(store, 'done', 'green'); return; }
  if ((mode === 'round' || mode === 'landing-orbit') && auto.targetKm !== null && fit.closed && atCircle(fit, auto.targetKm)) {
    finish(store, 'done', 'round');
    return;
  }
  const burnPoint = pred.burnPoint;
  if (burnPoint === null || (mode === 'capture' && !isCaptureBurn(burnPoint.reason))) { finish(store, 'idle', 'no-capture'); return; }
  const capture = isCaptureBurn(burnPoint.reason);
  // Graded damage (4b): the burn left needs a version the file no longer works as. A capture is v1's, so it goes on.
  if (live.version < MODE_NEEDS[mode] && !capture) { finish(store, 'done', 'downgraded'); return; }
  if (reserveRefuses(state, burnPoint)) { finish(store, 'done', 'reserve'); return; }
  const fireIn = fireInTac(state, pred, burnPoint);
  if (fireIn > AUTO_THREAD_CLAIM_TAC) {
    // The burn it claimed for (or waited for) moved well out of the window (a wait that outlasted a trim's apsis: the plan's
    // next burn is a loop away): it lets the thread go and stops saying it needs one (review M1's follow-on). The margin
    // keeps a START BURN that jitters across the window's edge from claiming and releasing tick by tick.
    if (fireIn > AUTO_THREAD_RELEASE_TAC && (auto.claimed || auto.waitingSinceTSec !== null)) {
      releaseThread(OWNER);
      store.update((draft) => { draft.burn.auto.claimed = false; draft.burn.auto.waitingSinceTSec = null; });
    }
    return;
  }
  // The claim (03 §3.6): a Core thread for the burn, and on the way into the window the burn's preset selected once (never
  // under the kid's own burn, which would turn it into a takeover). After that a preset the kid picks stands (an IN/OUT
  // correction is the kid's, review M2) until the fire moment. No thread free: it waits, late.
  if (!auto.claimed) {
    const entering = auto.waitingSinceTSec === null;
    if (canStartOp()) {
      if (!reserveThread(OWNER)) throw new Error('autoburn claim: no thread although canStartOp found one');
      store.update((draft) => { draft.burn.auto.claimed = true; draft.burn.auto.waitingSinceTSec = null; });
    } else if (entering) {
      const since = state.clock.tSec;
      store.update((draft) => { draft.burn.auto.waitingSinceTSec = since; });
    }
    if (entering && !playerFiring) selectPreset(store, burnPoint.preset);
  }
  if (fireIn > 0 || !store.getState().burn.auto.claimed || playerFiring) return;
  // Its moment: the burn's preset, whatever the kid left selected (the kid is not firing, so nothing is taken from them).
  selectPreset(store, burnPoint.preset);
  const flying: AutoburnBurn = { preset: burnPoint.preset, reason: burnPoint.reason, event: burnPoint.event };
  hold(store, true);
  setPhase(store, store.getState().burn.presetAligning ? 'pointing' : 'burning', null, { flying, captured: auto.captured || capture });
}

// Pointing or burning: hold on until this burn has done its part.
function burnTick(store: Store<GameState>, fit: RingFit, live: Readonly<SkillLive>, playerFiring: boolean): void {
  const state = store.getState();
  const auto = state.burn.auto;
  const mode = auto.mode!;
  const flying = auto.flying;
  if (flying === null) throw new Error('autoburn: burning with no burn in hand');
  if (playerFiring || state.burn.sasMode !== flying.preset) { finish(store, 'idle', 'takeover'); return; }
  if (state.burn.fuelPct <= 0) { finish(store, 'done', 'fuel'); return; }
  const capture = isCaptureBurn(flying.reason);
  if (live.version < MODE_NEEDS[mode] && !capture) { finish(store, 'done', 'downgraded'); return; }
  const verdict = burnVerdict(state, getPrediction(), fit, flying);
  if (verdict === 'rearm') {
    if (live.version < MODE_NEEDS[mode]) { finish(store, 'done', 'downgraded'); return; }
    rearm(store);
    return;
  }
  if (verdict !== null) { finish(store, 'done', verdict); return; }
  // After a pause (which lets go of every throttle) it takes it again.
  hold(store, true);
  const turning = store.getState().burn.presetAligning;
  if (turning && auto.phase === 'burning') setPhase(store, 'pointing', null);
  else if (!turning && auto.phase === 'pointing') setPhase(store, 'burning', null);
}

// Whether the burn in hand is over, and how: null to burn on, 'rearm' for the mode's next burn, or the engagement's end.
// • A capture flies through as phase 2's did (brakingEnd): in v1 that ends it; in GREEN the ring ends it, anything else
//   re-arms for the trims.
// • A GREEN trim ends in the ring, or once the plan's burn is no longer this one (another apsis, the other preset: the
//   moved apsis reached its aim; or the next pass).
// • A ROUND burn reads the ship's exact state (circleStep, every tick, not the 10 Hz plan: e < 0.01 is a few km on a
//   7,000 km orbit): the circle ends it; the step turning to the other apsis or the other preset ends this burn.
function burnVerdict(state: Readonly<GameState>, pred: Prediction, fit: RingFit, burn: Readonly<AutoburnBurn>): AutoburnEnd | 'rearm' | null {
  const auto = state.burn.auto;
  const mode = auto.mode!;
  if (isCaptureBurn(burn.reason)) {
    const end = brakingEnd(pred, fit);
    if (end === null || mode === 'capture') return end;
    return end === 'in-ring' && mode === 'green' ? 'green' : 'rearm';
  }
  if (mode === 'round' || mode === 'landing-orbit') {
    const targetKm = auto.targetKm;
    if (targetKm === null) throw new Error(`autoburn: ${mode} without its circle`);
    if (!fit.closed) return 'rearm';
    const step = circleStep(fit, targetKm);
    if (step === null) return 'round';
    const lowers = step.at === 'peri' ? fit.ra > step.targetRadius : fit.rp > step.targetRadius;
    if (step.at !== burn.event || (lowers ? 'retrograde' : 'prograde') !== burn.preset) {
      return loopEccentricity(fit) < ROUND_E_TOL ? 'round' : 'rearm';
    }
    return null;
  }
  if (fit.inRing) return 'green';
  // The same burn on this pass: its apsis still ahead (its START BURN moves later as the rest shrinks, so not "due"), or
  // behind with the burn due now; the next pass's is a loop away, departing.
  const next = pred.burnPoint;
  const sameBurn = next !== null && next.reason === burn.reason && next.event === burn.event && next.preset === burn.preset
    && (next.approaching || next.eventInSec <= 0);
  return sameBurn ? null : 'rearm';
}

// Whether its capture is over (WP9 review round 1: it flies the capture through, not just to the loop closing). Past
// the loop closing it brakes on for as long as the plan's next burn is still the RETRO burn at THIS pass of ▼: the
// shrink (due now), a trim at ▼ that is due, or one centred on the ▼ the ship is still approaching. That last one
// matters for a skill that learned to start early: it closes the loop seconds before ▼, the rest of the capture
// then reads as a trim at ▼, and each second it brakes on moves that trim's START BURN later, so a kid's "not
// early yet" (guidance F5) would hand the kid back the bulk of the capture. It lets go with the loop in the ring
// (HOLD STEADY does the rest: 'in-ring'), once the plan's next burn is another one, a trim at ▲ or on the next
// pass ('braked'), or on a path into the planet (DON'T HIT THE PLANET takes the strip). The ship's own state
// decides `fit` (like the rest of the machine); the plan is the true prediction's, and for the tick or so that it
// still shows the open path after the loop closed, it brakes on. null: brake on.
function brakingEnd(pred: Prediction, fit: RingFit): AutoburnEnd | null {
  if (fit.inRing) return 'in-ring';
  if (!fit.closed || pred.outcome === 'open') return null;
  const burnPoint = pred.burnPoint;
  if (pred.outcome !== 'closed' || burnPoint === null || burnPoint.preset !== 'retrograde') return 'braked';
  const thisPass = burnPoint.event === 'now' || burnPoint.eventInSec <= 0 || (burnPoint.event === 'peri' && burnPoint.approaching);
  return thisPass ? null : 'braked';
}

// Not engaged: the ship entering the LOCK bracket sounds once ('autoburn-in-lock': audio-cues' chime, 03 §4). "Inside" is the
// mode's first burn against the effective lock range alone (review m3): the whole refusal flips to YOU ARE BURNING, PAUSED
// or SAVING FUEL and back inside the bracket, and each flip back chimed again. Out of the bracket once the burn is past.
export function inLockRange(state: Readonly<GameState>, pred: Prediction): boolean {
  const live = skillLive(state.memory, 'autoburn');
  const range = lockRangeTac(live);
  if (range === null || !engineOpen(state)) return false;
  const mode = autoModeFor(state, pred, live);
  if (mode === null) return false;
  const burnPoint = previewModeBurn(state, mode, pred);
  if (burnPoint === null) return false;
  return secUntil(pred, burnPoint.inSec, state.clock.tSec) / state.level.tacticalWarp <= range;
}

// The refusals that say AUTOBURN can't fly at all here, in the bracket or not: no chime for those.
const CANNOT_FLY: ReadonlySet<AutoburnRefusal> = new Set([
  AUTOBURN_REFUSAL.over, AUTOBURN_REFUSAL.noFile, AUTOBURN_REFUSAL.untrained, AUTOBURN_REFUSAL.damaged, AUTOBURN_REFUSAL.presets,
  AUTOBURN_REFUSAL.engine,
]);

function lockTick(state: Readonly<GameState>): void {
  if (skillFiles(state.memory).length === 0 || !engineOpen(state)) { wasInLock = false; return; }
  const pred = getPrediction();
  const refusal = autoburnRefusal(state, pred);
  const inLock = (refusal === null || !CANNOT_FLY.has(refusal)) && inLockRange(state, pred);
  if (inLock && wasInLock === false) emit('autoburn-in-lock', {});
  wasInLock = inLock;
}

let mounted = false;

// Mount after the orbit sim and the predictor (it reads the tick's fresh state), in the post-tick chain.
export function mountAutoburn(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountAutoburn: already mounted');
  mounted = true;
  const offTick = onPostTick(() => tick(store));
  const offReset = onWorldReset('autoburn', () => { wasInLock = null; }, () => ({ wasInLock }));
  return () => { offTick(); offReset(); wasInLock = null; mounted = false; };
}

// [B] toggles AUTOBURN, from either screen (§6.10: it flies from blue). Registered by the page and by harnesses.
export function registerAutoburnKeys(store: Store<GameState>): () => void {
  return registerKeys({ layer: 'game', codes: ['KeyB'], onDown: () => { pressAutoburn(store); } });
}
