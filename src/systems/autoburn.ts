import type { Store } from '@state/store';
import type { GameState, AutoburnPhase, AutoburnEnd, RunStats } from '@state/schema';
import type { Segment, UpgradeSegment } from '@/types/segment';
import { onPostTick } from '@systems/clock';
import { stopSkipOnPress } from '@systems/pace';
import { getPrediction, secUntil, burnKey, type Prediction } from '@systems/predict';
import { capabilitiesNow, engineFault, presetsAvailable, liveUpgrades } from '@systems/capabilities';
import { reserveThread, releaseThread, canStartOp } from '@systems/ops-core';
import { isPresetAligning } from '@systems/attitude';
import { registerKeys } from '@systems/input';
import { say } from '@systems/say';
import { emit } from '@systems/events';
import { raiseAlert, clearAlert } from '@systems/alerts';
import { replaceRange, segmentStarts, newSegId, assertMemoryInvariants } from '@systems/memory-ops';
import { upgradeFiles } from '@state/selectors';
import { isOpenFree } from '@systems/tool-targets';
import { UNIT_RACKS_START, MEMORY_TOTAL_BLOCKS } from '@data/memory';
import { UPGRADE_FILE_TEXT } from '@data/upgrades';
import {
  AUTOBURN_TEXT, AUTOBURN_DROP_TEXT, AUTOBURN_DROP_TAB, AUTOBURN_REFUSAL, autoRefusalKey, type AutoburnRefusal,
} from '@data/skill-text';
import { ringFit, elementsFromState, type RingFit } from '@/types/orbit';
import { IS_DEV } from '@/env';
import {
  AUTOBURN_DEMOS_TO_TRAIN, AUTOBURN_OFFSET_FACTOR, AUTOBURN_OFFSET_MAX_TAC, AUTOBURN_ACCURACY_PER_TAC,
  AUTOBURN_ACCURACY_MIN, AUTOBURN_ACCURACY_MAX, AUTOBURN_SKILL_BLOCKS, AUTOBURN_WINDOW_TAC, AUTOBURN_LOST_ALARM_SEC,
  INTEGRITY_MAX,
} from '@data/tuning';

// AUTOBURN (§6.10, §9 WP9 item 5): a skill the kid trained by capturing by hand, DOM-free.
//
// • TRAINING. Every manual capture (a player burn that closed the loop) is a demo: how late the kid started
//   against the START BURN tick (run.stats.demos, systems/run.ts). Once AUTOBURN_DEMOS_TO_TRAIN are in, the
//   next ship's boot installs AUTOBURN.skl (6 blocks, rack E) and says so: `> SKILL TRAINED: AUTOBURN.skl ·
//   from your 2 captures · ACCURACY 84%`. It learns half the kid's mean offset (a sloppy teacher makes a
//   sloppy skill), clamped to ±8 tactical s; later manual captures retrain it at the next boot. A skill that
//   was eaten installs again only after a new capture.
// • USE. [B] (or the Engine window's AUTO button) engages it when the file is live and healthy, the presets and the engine
//   work, the path is a flyby above the surface, the capture's START BURN is within 90 tactical s, and a Core
//   thread is free: it holds that thread (ops-core reserveThread: THRUST LIMIT 75%, one op fewer) until it ends.
// • THE MACHINE. idle → armed (RETRO selected at once, waiting) → pointing (its moment came, the ship still
//   turns) → burning (it holds the throttle, firingSource 'auto', at the burn point + its learned offset) →
//   done (it flew the capture through, brakingEnd: the loop in the ring, or braked as far as this burn goes:
//   `AUTOBURN: CAPTURED — trim it green yourself`; or the tank ran dry) | dropped (the file eaten or hurt below
//   50, the engine dead, the presets gone: the klaxon and `AUTOBURN.skl LOST — MANUAL`). It flies from blue too
//   (the mode switch only lets go of a PLAYER burn): the only burn the MIND can make. SPACE, or another preset,
//   is the kid taking over; [B] again lets go of it. Pause freezes it like everything (pause lets go of the
//   throttle); it takes the throttle again once the world moves.
//   (§6.10 stops it the moment the loop closes. On KESTREL that is about a fifth of the capture's braking, 11 wall s
//   under OVERCLOCK, and its `trim it green yourself` sent the kid back to fly the other four fifths by hand: WP9
//   review round 1. It now brakes on for as long as the strip would tell a kid to KEEP HOLDING.)

const OWNER = 'autoburn';

// --- The skill ------------------------------------------------------------------------------------------

export interface AutoburnSkill {
  demos: number;
  learnedOffsetTac: number;   // + late, − early: when it fires against the START BURN tick
  accuracy: number;           // % (the boot line, the Skills row)
}

// What the kid's captures taught it (§6.10), or null before AUTOBURN_DEMOS_TO_TRAIN. Pure.
export function autoburnSkill(stats: Readonly<Pick<RunStats, 'demos'>>): AutoburnSkill | null {
  const demos = stats.demos;
  if (demos.length < AUTOBURN_DEMOS_TO_TRAIN) return null;
  const mean = demos.reduce((sum, demo) => sum + demo.offsetTac, 0) / demos.length;
  const learned = Math.max(-AUTOBURN_OFFSET_MAX_TAC, Math.min(AUTOBURN_OFFSET_MAX_TAC, AUTOBURN_OFFSET_FACTOR * mean));
  const accuracy = Math.round(Math.max(AUTOBURN_ACCURACY_MIN, Math.min(AUTOBURN_ACCURACY_MAX, 100 - AUTOBURN_ACCURACY_PER_TAC * Math.abs(learned))));
  return { demos: demos.length, learnedOffsetTac: learned, accuracy };
}

export function skillFiles(memory: readonly Segment[]): UpgradeSegment[] {
  return upgradeFiles(memory, 'autoburn');
}

// What this boot does with the skill: installs it (the first time, or again after the file was lost and a new
// capture came in), retrains the file the unit carries (more captures since), or nothing. Pure.
export type SkillBoot = 'install' | 'retrain' | null;

export function skillBootDue(state: Readonly<GameState>): SkillBoot {
  const skill = autoburnSkill(state.run.stats);
  if (skill === null) return null;
  const trainedOn = state.run.skillTrainedOn;
  if (trainedOn !== null && skill.demos <= trainedOn) return null;
  return skillFiles(state.memory).length > 0 ? 'retrain' : 'install';
}

// The open free space a new skill file goes to: the first that fits from rack E on (the unit's own files), else
// the end of the last one before rack E (rack D's free tail, beside the unit). That second case is real: the star
// credit and the +12 card can fill racks E–F with REPAIR CHARGE past the link (carry.ts spills it into rack D),
// leaving no 6 blocks there; licences spill backward the same way (licences.ts installAddress). WP9 review round 1
// asks Fran to sign this order off (PROGRESS.md). No room anywhere is a layout that can't take its own unit: throws.
function skillAddress(memory: readonly Segment[], size: number): number {
  const starts = segmentStarts(memory);
  const fits = (seg: Segment): boolean => isOpenFree(seg) && seg.size >= size;
  for (let i = 0; i < memory.length; i++) {
    if (starts[i]! >= UNIT_RACKS_START && fits(memory[i]!)) return starts[i]!;
  }
  for (let i = memory.length - 1; i >= 0; i--) {
    if (fits(memory[i]!)) return Math.max(starts[i]!, Math.min(starts[i]! + memory[i]!.size, UNIT_RACKS_START) - size);
  }
  throw new Error(`autoburn: no free space for the ${size}-block skill file`);
}

// The boot's skill line (systems/boot.ts): trains the skill now (installs or retrains it) and returns the line
// that says so. Throws when nothing is due (the boot counted a line it should not have).
export function trainSkillAtBoot(store: Store<GameState>): string {
  const state = store.getState();
  const due = skillBootDue(state);
  const skill = autoburnSkill(state.run.stats);
  if (due === null || skill === null) throw new Error('trainSkillAtBoot: no skill is due at this boot');
  if (due === 'install') {
    const memory = state.memory;
    const addr = skillAddress(memory, AUTOBURN_SKILL_BLOCKS);
    const file: UpgradeSegment = {
      id: newSegId('autoburn'), name: UPGRADE_FILE_TEXT.autoburn.name, type: 'upgrade', upgrade: 'autoburn',
      size: AUTOBURN_SKILL_BLOCKS, integrity: INTEGRITY_MAX, state: 'intact', scanned: true, desc: UPGRADE_FILE_TEXT.autoburn.desc,
    };
    replaceRange(memory, addr, addr + file.size, [file], { opId: null, own: [] });
    if (IS_DEV) assertMemoryInvariants(memory, MEMORY_TOTAL_BLOCKS);
  }
  store.update((draft) => {
    draft.run.skillTrainedOn = skill.demos;
    draft.ui.memoryRev++;
  });
  emit('skill-trained', { demos: skill.demos, accuracy: skill.accuracy, retrained: due === 'retrain' });
  return due === 'install' ? AUTOBURN_TEXT.trained(skill.demos, skill.accuracy) : AUTOBURN_TEXT.retrained(skill.demos, skill.accuracy);
}

// --- Using it --------------------------------------------------------------------------------------------

export function isEngaged(phase: AutoburnPhase): boolean {
  return phase === 'armed' || phase === 'pointing' || phase === 'burning';
}

// Tactical seconds until the START BURN tick of the capture AUTOBURN would fly, or null with none.
function captureInTac(state: Readonly<GameState>, pred: Prediction): number | null {
  const burnPoint = pred.burnPoint;
  if (!burnPoint || (burnPoint.reason !== 'capture' && burnPoint.reason !== 'missed')) return null;
  return secUntil(pred, burnPoint.inSec, state.clock.tSec) / state.level.tacticalWarp;
}

// Why B can't engage AUTOBURN right now (§6.10), or null when it can. Pure (reads the ops core's threads).
export function autoburnRefusal(state: Readonly<GameState>, pred: Prediction): AutoburnRefusal | null {
  if (state.run.phase !== 'flight' || state.burn.status !== 'approaching') return AUTOBURN_REFUSAL.over;
  if (state.clock.paused) return AUTOBURN_REFUSAL.paused;
  const memory = state.memory;
  if (skillFiles(memory).length === 0) return state.run.skillTrainedOn === null ? AUTOBURN_REFUSAL.untrained : AUTOBURN_REFUSAL.noFile;
  if (liveUpgrades(memory, 'autoburn') === 0) return AUTOBURN_REFUSAL.damaged;
  const caps = capabilitiesNow(state);
  if (!presetsAvailable(caps)) return AUTOBURN_REFUSAL.presets;
  if (engineFault(caps) !== null) return AUTOBURN_REFUSAL.engine;
  if (pred.outcome !== 'open' || !(pred.rp > state.level.planet.R)) return AUTOBURN_REFUSAL.noCapture;
  const inTac = captureInTac(state, pred);
  if (inTac === null) return AUTOBURN_REFUSAL.noCapture;
  if (inTac > AUTOBURN_WINDOW_TAC) return AUTOBURN_REFUSAL.tooFar;
  if (state.burn.firing && state.burn.firingSource === 'player') return AUTOBURN_REFUSAL.burning;
  if (!canStartOp()) return AUTOBURN_REFUSAL.threads;
  // Last, so it only stands for "[B] would engage it, but a press during a SKIP only stops the SKIP" (pressAutoburn):
  // the strip's ` · or [B] AUTO` and the HUD's AUTO never offer a press that would not engage it.
  if (state.clock.skipWarp !== null) return AUTOBURN_REFUSAL.skipping;
  return null;
}

// AUTOBURN can be engaged right now (and is not already).
export function autoburnAvailable(state: Readonly<GameState>, pred: Prediction): boolean {
  return !isEngaged(state.burn.auto.phase) && autoburnRefusal(state, pred) === null;
}

// Tactical seconds until AUTOBURN fires (the START BURN tick + its learned offset), or null when it can't tell.
// A late skill can still be waiting when ▼ goes by: the capture is then MISSED ▼, due now, and it fires at once
// (its START BURN stays a few seconds behind the ship, so the offset would never come round).
export function autoburnFireInTac(state: Readonly<GameState>, pred: Prediction): number | null {
  const skill = autoburnSkill(state.run.stats);
  const inTac = captureInTac(state, pred);
  if (skill === null || inTac === null) return null;
  if (pred.burnPoint?.reason === 'missed') return Math.min(0, inTac + skill.learnedOffsetTac);
  return inTac + skill.learnedOffsetTac;
}

// The armed countdown every HUD shows (the strip, the AUTO button, the mini-HUD): tactical seconds until it fires,
// 0 once due. A capture that has just gone away reads 0 for the tick until the machine stands down (its post tick).
export function autoburnArmedInTac(state: Readonly<GameState>, pred: Prediction): number {
  return Math.max(0, autoburnFireInTac(state, pred) ?? 0);
}

function setPhase(store: Store<GameState>, to: AutoburnPhase, end: AutoburnEnd | null): void {
  const from = store.getState().burn.auto.phase;
  const at = store.getState().clock.aiSec;
  store.update((draft) => { draft.burn.auto = { phase: to, atAi: at, end }; });
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

const LOST_ALERT_ID = 'autoburn-lost';

// Ends an engagement: lets go of the throttle and the thread, then says why. A drop sounds the klaxon (an alarm
// alert for AUTOBURN_LOST_ALARM_SEC: TACTICAL, the vignette, the strip's alarm line in script.ts).
function finish(store: Store<GameState>, phase: Extract<AutoburnPhase, 'idle' | 'done' | 'dropped'>, end: AutoburnEnd): void {
  hold(store, false);
  releaseThread(OWNER);
  setPhase(store, phase, end);
  if (phase === 'done' && end === 'braked') say('sys', AUTOBURN_TEXT.braked, { critical: true });
  else if (phase === 'done' && end === 'in-ring') say('sys', AUTOBURN_TEXT.inRing, { critical: true });
  else if (phase === 'idle' && (end === 'takeover' || end === 'cancel')) say('sys', AUTOBURN_TEXT.off, { critical: true });
  const dropText = AUTOBURN_DROP_TEXT[end];
  if (phase === 'dropped' && dropText) {
    raiseAlert(store, { id: LOST_ALERT_ID, layer: 'ship', severity: 'alarm', text: dropText, inhibitsSkip: true });
    say('sys', dropText, { critical: true });
  }
}

// The strip's alarm line while a drop stands (script.ts), worded for the screen the kid is on.
export function autoburnDropLine(state: Readonly<GameState>): string | null {
  const auto = state.burn.auto;
  if (auto.phase !== 'dropped' || auto.end === null || state.clock.aiSec - auto.atAi >= AUTOBURN_LOST_ALARM_SEC) return null;
  const text = AUTOBURN_DROP_TEXT[auto.end];
  if (!text) return null;
  return state.ui.mode === 'memory' ? `${text}${AUTOBURN_DROP_TAB}` : text;
}

// [B] / AUTO: engages it (RETRO at once, a thread held), or refuses with its reason (a buzz).
export function engageAutoburn(store: Store<GameState>): AutoburnRefusal | null {
  const state = store.getState();
  if (isEngaged(state.burn.auto.phase)) return null;
  const refusal = autoburnRefusal(state, getPrediction());
  if (refusal !== null) {
    emit('refused', { reason: autoRefusalKey(refusal) });
    return refusal;
  }
  if (!reserveThread(OWNER)) throw new Error('engageAutoburn: no thread although autoburnRefusal found one');
  const aligning = isPresetAligning('retrograde', state.burn.heading, state.orbit);
  store.update((draft) => {
    draft.burn.sasMode = 'retrograde';
    draft.burn.rotInput = 0;
    draft.burn.presetAligning = aligning;
  });
  setPhase(store, 'armed', null);
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
  if (state.run.phase === 'flight' && !state.clock.paused && state.clock.skipWarp !== null) {
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
  if (!isEngaged(auto.phase)) return;
  if (state.run.phase !== 'flight' || state.burn.status !== 'approaching') { finish(store, 'idle', 'flight-over'); return; }
  if (state.clock.paused) return;
  if (state.burn.firing && state.burn.firingSource === 'player') { finish(store, 'idle', 'takeover'); return; }
  const memory = state.memory;
  if (liveUpgrades(memory, 'autoburn') === 0) { finish(store, 'dropped', skillFiles(memory).length === 0 ? 'lost' : 'damaged'); return; }
  const caps = capabilitiesNow(state);
  if (engineFault(caps) !== null) { finish(store, 'dropped', 'engine'); return; }
  if (!presetsAvailable(caps)) { finish(store, 'dropped', 'presets'); return; }
  // Another preset is the kid steering by hand: that is a takeover too.
  if (state.burn.sasMode !== 'retrograde') { finish(store, 'idle', 'takeover'); return; }
  const fit = ringFit(elementsFromState(state.orbit, state.level.planet.mu), state.level.ring);

  if (auto.phase === 'burning' || auto.phase === 'pointing') {
    if (state.burn.fuelPct <= 0) { finish(store, 'done', 'fuel'); return; }
    const end = brakingEnd(getPrediction(), fit);
    if (end !== null) { finish(store, 'done', end); return; }
    // After a pause (which lets go of every throttle) it takes it again.
    hold(store, true);
    const turning = store.getState().burn.presetAligning;
    if (turning && auto.phase === 'burning') setPhase(store, 'pointing', null);
    else if (!turning && auto.phase === 'pointing') setPhase(store, 'burning', null);
    return;
  }

  // Armed: waiting for its moment on a capture that is still there.
  if (fit.closed) { finish(store, 'idle', 'no-capture'); return; }
  const fireIn = autoburnFireInTac(state, getPrediction());
  if (fireIn === null) { finish(store, 'idle', 'no-capture'); return; }
  if (fireIn > 0) return;
  hold(store, true);
  setPhase(store, store.getState().burn.presetAligning ? 'pointing' : 'burning', null);
}

// Whether its burn is over (WP9 review round 1: it flies the capture through, not just to the loop closing). Past
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

let mounted = false;

// Mount after the orbit sim and the predictor (it reads the tick's fresh state), in the post-tick chain.
export function mountAutoburn(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountAutoburn: already mounted');
  mounted = true;
  const offTick = onPostTick(() => tick(store));
  return () => { offTick(); mounted = false; };
}

// [B] toggles AUTOBURN, from either screen (§6.10: it flies from blue). Registered by the page and by harnesses.
export function registerAutoburnKeys(store: Store<GameState>): () => void {
  return registerKeys({ layer: 'game', codes: ['KeyB'], onDown: () => { pressAutoburn(store); } });
}
