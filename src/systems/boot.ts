// Slice 4c–4e: Track SENTRY owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2): the SENTRY lines as they are
// said (a disguised seed named, the FIREWALL compiled), and the ECC seeds line's drop leaving a disguised seed out. Others
// ask by message. Playtest 1 (C-UNROLL): the SELF-CHECK's stage machine.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { CheckStage, CheckStep, FirstKind } from '@/types/self-check';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { pushModal, registerKeys } from '@systems/input';
import { getPrediction } from '@systems/predict';
import { say, typingSec } from '@systems/say';
import { setMode } from '@systems/mode';
import { play } from '@systems/audio';
import { emit } from '@systems/events';
import { archiveRunStarted, ghostLineDue, playWithoutArchive } from '@systems/meta';
import { installBootLicences, renewRepairAtBoot } from '@systems/licences';
import { skillBootLines, applySkillBootLine, type SkillBootLine } from '@systems/skill-files';
import { bootLine, bootLinePlan, bootLineSpeaker, bootLineTone, bootLineTyped, bootLogEntries, lineVars, type BootLineKind } from '@data/script';
import { beamSeedTarget } from '@systems/beam-seeds';
import { traceBootLineSaid } from '@systems/trace-gifts';
import { titleEraseAsking } from '@systems/title';
import { lineageBootLineSaid } from '@systems/lineage-boot';
import { sentrySeedSaid, compileFirewall } from '@systems/sentry';
import { receiveDeliveryAtBoot } from '@systems/delivery-boot';
import { newMessagesAtBoot } from '@systems/inbox';
import { writeRunSave } from '@systems/save-write';
import { firstShipThreat } from '@systems/threat-plan';
import { findFault } from '@systems/faults';
import { palLines } from '@systems/companion';
import { HOLLOW_STORY } from '@data/hollow-text';
import { SELF_CHECK_TEXT } from '@data/self-check-text';
import {
  planSelfCheck, beginCheckView, setCheckStage, lightFiles, setCheckTag, setCheckHold, endCheckView, resetCheckView, checkSnapshot,
  checkFault, faultTag, hollowWordSaid, CHECK_FIRST_ID, CHECK_NAMED_HOLLOW,
} from '@systems/self-check';
import {
  BOOT_END_AFTER_KLAXON_SEC, BOOT_SKIP_GRACE_SEC, BOOT_GHOST_AT_SEC, BOOT_AFTER_GHOST_SEC, BOOT_AFTER_HOLLOW_LINE_SEC,
  SELF_CHECK_START_SEC, SELF_CHECK_LINE_GAP_SEC, SELF_CHECK_FILE_SEC, SELF_CHECK_FINDING_SEC, SELF_CHECK_FAULT_SEC,
  SELF_CHECK_FIRST_SHIP_PACE, SELF_CHECK_STAGE_GAP_SEC, SELF_CHECK_HOLD_SEC, SELF_CHECK_SENSORS_SEC, SELF_CHECK_SKIP_SEEN_SEC,
} from '@data/tuning';
import { playsTutorial } from '@systems/meta';

// The title card and the boot (§5.1, §7.1), DOM-free. The page opens in phase 'title': the clock does not run and an input
// modal owns the keyboard. RECEIVE TRANSMISSION (a click, or SPACE / ENTER) starts the boot in blue, then the klaxon, the cut
// to amber and phase 'flight'. The modal stays up until the flight starts, so a key held through the boot (SPACE!) needs a
// fresh press before it does anything in the game.
// Playtest 1, C-UNROLL (playtest-1-plan §3.5, Fran's notes 13 and 17): the boot is the SELF-CHECK, the unit coming online and
// looking around, in six stages (types/self-check.ts): RECEIVE (the racks assemble, the unpack and the host type), SELF (racks
// E/F a file at a time: what the crossing took, what ECC put back, the charge that came), SHIP (rack A, the ship's own arrival
// damage, ship 1's ENGINE I/O FAULT found as the check reaches the engine), HOLD (the pod drivers), MANIFEST (what the packet
// did not carry: 046.log, deliveries, seeds, HOLLOW's blocks; the first of each kind on the run holds the sweep until a click
// or SELF_CHECK_HOLD_SEC, and is named there: CONTROL says HOLLOW at the first seed), SENSORS, then the klaxon.
// systems/self-check.ts plans the steps once, at the boot's first tick, from the state and the boot's line plan
// (data/script.ts bootLinePlan, which keeps every line's words and effects); this file plays them on wall time. A line is
// said as its step starts: typed on the TERMINAL (bootLineTyped), or as a mark, the unit's record that never types while the
// strip's tag shows it (say.ts `mark`). Each line's effects fire as it is said, whichever way, so a skipped check still
// installs a patch, unpacks a delivery, compiles a FIREWALL.
// A press (click, SPACE, ENTER) after BOOT_SKIP_GRACE_SEC: on a hold, it is the click that lets the sweep go on; else the first
// press hurries the stage (all of it at once) and the next skips to SENSORS (every step at once). A skip never cuts out what
// the check found: when it shows a finding the cut to amber waits SELF_CHECK_SKIP_SEEN_SEC (the old ECC flashes' rule).
// A returning unit (run 2+, §5.2) boots ship 1 differently: REPAIR is licensed as the host line is said, so the chip is there
// before the ENGINE I/O FAULT asks for it.
// Its last unit's ghost (05 §3.5) speaks first, at the boot of the first ship in or past the layer where that unit was lost
// (systems/meta.ts ghostLineDue), once a run (run.ghostSpoken), in HOLLOW's slow pink; the check starts BOOT_AFTER_GHOST_SEC
// after its last letter. While the ghost speaks, the strip does not offer the skip (bootSkipWaits), and a press is refused
// with a buzz (§6.11).
// On a ship whose HOLLOW asks for charge (VESPER, WP10), its own line closes the MANIFEST in its slow pink (`> keep 20 charge
// for me, 047. you'll see.`): its step lasts until it has typed (plus BOOT_AFTER_HOLLOW_LINE_SEC), and a skip that says it
// waits for it too, so a kid mashing SPACE still reads the price of a MERGE.
// RECEIVE TRANSMISSION is RUN START for the archive (runs + 1, the run in progress: systems/meta.ts). An archive that can't be
// read (CORRUPT) does not hold the run back: RECEIVE plays on without it, as PLAY WITHOUT ARCHIVE does, and its red box stays
// on the title (the lead's note: the game continues without saving, and says so).

export interface BootHooks {
  // Runs synchronously inside the user gesture that receives the transmission: the only
  // moment the browser lets the page start audio.
  onReceive?: () => void;
}

// A returning unit's ghost in this boot: its line, and the boot second by which it has typed out (from
// then a skip is honoured). Planned at the boot's first tick; null for every other boot.
interface GhostBeat {
  text: string;
  typedAtSec: number;
  said: boolean;
}

// The step being played: when it started and the boot second its wait ends (a hold ends earlier on a press).
interface ActiveStep {
  index: number;
  endsAtSec: number;
  released: boolean;
}

let hooks: BootHooks = {};
let elapsedSec = 0;
let klaxonPlayed = false;
let ghost: GhostBeat | null = null;
let ghostPlanned = false;
// The boot's lines (bootLinePlan) and the check's steps (planSelfCheck), planned at its first tick; null before. Its skill
// lines (slice 4) are planned with it: saying one records it, so they are read once, not re-derived as they are said.
let plan: BootLineKind[] | null = null;
let steps: CheckStep[] | null = null;
let skillLines: SkillBootLine[] = [];
// The next step to start, the boot second it starts at, the step playing, the stage shown, and once every step has played,
// the second SENSORS began (the klaxon follows it).
let cursor = 0;
let cursorAtSec = 0;
let active: ActiveStep | null = null;
let shownStage: CheckStage | null = null;
let sensorsAtSec: number | null = null;
// Presses honoured so far (the first hurries a stage, the next skips the rest).
let hurried = false;
let skipped = false;
// ?debug's skip asked for before a press could be honoured (inside the grace, while the ghost types): made as soon as it can.
let skipQueued = false;
// The lines said, by plan index (none twice).
let saidLines = new Set<number>();
let closeModal: (() => void) | null = null;

function resetBootTimers(): void {
  elapsedSec = 0;
  klaxonPlayed = false;
  ghost = null;
  ghostPlanned = false;
  plan = null;
  steps = null;
  skillLines = [];
  cursor = 0;
  cursorAtSec = 0;
  active = null;
  shownStage = null;
  sensorsAtSec = null;
  hurried = false;
  skipped = false;
  skipQueued = false;
  saidLines = new Set();
  resetCheckView();
}

function linePlan(store: Store<GameState>): BootLineKind[] {
  if (plan === null) {
    const state = store.getState();
    skillLines = skillBootLines(state);
    plan = bootLinePlan(state, skillLines.length);
  }
  return plan;
}

function checkSteps(store: Store<GameState>): CheckStep[] {
  if (steps === null) {
    steps = planSelfCheck(store.getState(), linePlan(store));
    beginCheckView(steps);
    shownStage = 'receive';
  }
  return steps;
}

// The ghost speaks on the boot of the first ship at or past where the last unit's run ended, once a run (systems/meta.ts
// ghostLineDue). Every other boot has none.
function planGhost(state: Readonly<GameState>): GhostBeat | null {
  const text = ghostLineDue(state.run);
  if (text === null) return null;
  return { text, typedAtSec: BOOT_GHOST_AT_SEC + typingSec('hollow', text), said: false };
}

function ensurePlanned(store: Store<GameState>): void {
  if (!ghostPlanned) {
    ghostPlanned = true;
    ghost = planGhost(store.getState());
    cursorAtSec = ghost === null ? SELF_CHECK_START_SEC : ghost.typedAtSec + BOOT_AFTER_GHOST_SEC;
  }
  checkSteps(store);
}

function plannedSkillLine(ordinal: number): SkillBootLine {
  const line = skillLines[ordinal];
  if (line === undefined) throw new Error(`boot: no skill line ${ordinal} in this boot's plan`);
  return line;
}

// The ghost's line at BOOT_GHOST_AT_SEC (at once, when the boot is finished early). The run notes it has spoken, so no
// later boot repeats it.
function advanceGhost(store: Store<GameState>, all: boolean): void {
  if (ghost === null || ghost.said || !(all || elapsedSec >= BOOT_GHOST_AT_SEC)) return;
  ghost.said = true;
  say('hollow', ghost.text, { critical: true });
  store.update((draft) => { draft.run.ghostSpoken = true; });
}

// A skip is honoured once the ghost has had its say (its line typed).
function ghostSeenAtSec(): number {
  return ghost === null ? 0 : ghost.typedAtSec;
}

// The boot is in its ghost beat, when a skip waits (the director's strip line says so instead of offering
// the skip). Before the boot's first tick the ghost is not planned yet: whether it will be is read from the
// state, so the strip never offers a skip for one frame.
export function bootSkipWaits(state: Readonly<GameState>): boolean {
  if (state.run.phase !== 'boot') return false;
  if (!ghostPlanned) return planGhost(state) !== null;
  return elapsedSec < ghostSeenAtSec();
}

// The SELF-CHECK as the strip's line says it (systems/director.ts): the stage, and whether it holds on the first of a kind.
export function bootCheckLine(state: Readonly<GameState>): { stage: CheckStage; held: boolean } {
  if (state.run.phase !== 'boot' || shownStage === null) return { stage: 'receive', held: false };
  const step = active === null ? null : steps?.[active.index] ?? null;
  return { stage: shownStage, held: step !== null && step.kind === 'first' && step.hold && !active!.released };
}

// The check's progress, for the suites and ?debug: the steps planned, how many have started, the stage, the boot second.
export function bootCheckProgress(): { steps: readonly CheckStep[]; started: number; stage: CheckStage | null; elapsedSec: number; held: boolean } {
  const step = active === null ? null : steps?.[active.index] ?? null;
  return {
    steps: steps ?? [], started: cursor, stage: shownStage, elapsedSec,
    held: step !== null && step.kind === 'first' && step.hold && active !== null && !active.released,
  };
}

// The title and the boot hold the 'title' input layer; the flight releases it.
function syncModal(store: Store<GameState>): void {
  const phase = store.getState().run.phase;
  const wantModal = phase === 'title' || phase === 'boot';
  if (wantModal && !closeModal) closeModal = pushModal('title');
  if (!wantModal && closeModal) {
    closeModal();
    closeModal = null;
  }
}

// One boot line said, rendered from the live state (the ECC line names the files damaged right then), typed or as a mark,
// with its effects. Returns how long its step lasts: a typed line until it has typed (HOLLOW's own line a beat more), a mark
// no time at all (the sweep's tags show it).
function sayBootLine(store: Store<GameState>, index: number, kind: BootLineKind, ordinal: number): number {
  if (saidLines.has(index)) throw new Error(`boot: line ${index} (${kind}) said twice`);
  saidLines.add(index);
  const state = store.getState();
  let text: string;
  if (kind === 'skill') {
    const line = plannedSkillLine(ordinal);
    applySkillBootLine(store, line);
    text = line.text;
  } else {
    text = bootLine(kind, state, lineVars(state, getPrediction()), ordinal);
  }
  const speaker = bootLineSpeaker(kind);
  const typed = bootLineTyped(kind, state);
  // Slice 5: the RECEIVER CLOSED line's amber (script.ts bootLineTone); every other line plain, as before.
  const tone = bootLineTone(kind);
  say(speaker, text, { critical: true, ...(tone === null ? {} : { tone }), ...(typed ? {} : { mark: true }) });
  const arrival = state.run.arrival;
  // HOLLOW boarded on this beam (phase 3 slice 2, 04 §4): its 108% unpack is the boarding moment (the shake, the tear,
  // the hollowBoard cue hang on the event; Track UI).
  if (kind === 'board' && arrival !== null && arrival.boarded !== null) emit('hollow-boarded', { ...arrival.boarded });
  // The beam's seeds (phase 3 slice 2, 04 §4): the ECC seeds line names each, and each is found as it is said (the flash and
  // the seedLand thunk hang on the event; Track UI). A seed already gone (rm'd in a skipped boot) says nothing; a stray (the
  // no-room rule) is next to no file it was named for (targetId null: the review's minor 4).
  // Slice 4d (04 §3.6): a disguised seed is not on that line and lands with no thunk; SENTRY v1's own line names it.
  if (kind === 'seeds' && arrival !== null) {
    for (const seed of arrival.seeds) {
      if (seed.disguise !== null || !state.memory.some((seg) => seg.id === seed.segId)) continue;
      const target = seed.loose ? null : beamSeedTarget(state.memory, seed.segId);
      if (seed.loose || target !== null) emit('seed-landed-beam', { segId: seed.segId, targetId: target?.id ?? null });
    }
  }
  // 046.log's keys (05 §3.2): the entries this line names, as planned (systems/story-log.ts marks them found on it).
  if (kind === 'log') emit('log-key', { entries: bootLogEntries(state) });
  // The INBOX's new mail (phase 3 slice 3b, 05 §4): the count this line names (the chime and the badge hang on the event).
  if (kind === 'inbox') emit('inbox-new', { count: newMessagesAtBoot(state).length });
  // HOLLOW's reading line (phase 3 slice 3b, 05 §3.5) is said once a run: marked as it is said, as keepCharge is below.
  if (kind === 'reading') store.update((draft) => { draft.run.log.toldReading = true; });
  // HOLLOW's `keep 20 charge for me` (the HUNT stage's boot line) is told once a run (04 §3.9, slice 3's routes).
  if (kind === 'hollow' && state.hollow.cfg.story === 'wants-charge') store.update((draft) => { draft.run.threat.told.keepCharge = true; });
  // A returning unit's ship-1 boot licenses REPAIR as it names the host (§5.2; phase 2 did it as the archive opened):
  // the chip is there before the flight, as on every later ship.
  if (kind === 'host' && state.run.arrival === null) installBootLicences(store);
  // The deliveries this line names unpack as it is said (phase 3 slice 3b: the chime and the chip on the 'delivery' event,
  // the patch's install; systems/delivery-boot.ts). A skip says every line, so it still unpacks them.
  if (kind === 'delivery') receiveDeliveryAtBoot(store, ordinal);
  // A unit that crossed with no working REPAIR gets it back with its charge (WP12: licences.ts renewRepairAtBoot). Since
  // C-UNROLL the charge (SELF) is said before the deliveries (MANIFEST): the renewal happens here, and the first delivery
  // line's call is the no-op (it leaves the delivered copies out either way, so a patch still upgrades the renewed REPAIR).
  if (kind === 'charge') renewRepairAtBoot(store);
  // Slice 4d: SENTRY v1 names a disguised seed (it is unmasked, and lands with the ECC line's drop); v3 compiles its
  // FIREWALL.sys as its line is said (a line that said NO ROOM writes nothing).
  if (kind === 'sentry-seed') sentrySeedSaid(store, ordinal);
  if (kind === 'firewall') compileFirewall(store);
  // Slice 7c: a trace's line gives what it says (Track TRACE's), a lineage line does its own (Track LINEAGE's: the face takes
  // the root over). A skip says every line, so a skipped boot still gives its gifts.
  if (kind === 'trace-gift' || kind === 'dish-wiped' || kind === 'dish-wild') traceBootLineSaid(store, kind, ordinal);
  if (kind === 'face' || kind === 'lineage-control' || kind === 'stranger') lineageBootLineSaid(store, kind, ordinal);
  if (!typed) return 0;
  const typing = typingSec(speaker, text);
  return typing + (kind === 'hollow' ? BOOT_AFTER_HOLLOW_LINE_SEC : SELF_CHECK_LINE_GAP_SEC);
}

// The tutorial run's first ship checks slower (SELF_CHECK_FIRST_SHIP_PACE): the kid's first look at the MIND.
function pace(state: Readonly<GameState>): number {
  return playsTutorial(state.run) && state.run.shipIndex === 0 ? SELF_CHECK_FIRST_SHIP_PACE : 1;
}

// The plan index of a line step (its kind's `ordinal`th line in the plan).
function lineIndexOf(store: Store<GameState>, kind: BootLineKind, ordinal: number): number {
  let seen = 0;
  const lines = linePlan(store);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== kind) continue;
    if (seen === ordinal) return i;
    seen++;
  }
  throw new Error(`boot: no '${kind}' line ${ordinal} in this boot's plan`);
}

// A step starts: its line said, its files lit, its fault found, its hold raised. Returns how long it lasts (a hold: the most
// it waits).
function startStep(store: Store<GameState>, step: CheckStep): number {
  const state = store.getState();
  const p = pace(state);
  switch (step.kind) {
    case 'line': {
      const kind = step.line as BootLineKind;
      return sayBootLine(store, lineIndexOf(store, kind, step.ordinal), kind, step.ordinal);
    }
    case 'file': {
      const live = step.segIds.filter((id) => state.memory.some((seg) => seg.id === id));
      lightFiles(live, step.tag);
      if (live.length > 0) emit('self-check-step', { cue: step.cue, segIds: live });
      return (SELF_CHECK_FILE_SEC + (step.tag === null ? 0 : SELF_CHECK_FINDING_SEC)) * p;
    }
    case 'fault': {
      const fault = checkFault(step.faultId);
      const segId = findFault(store, fault);
      if (segId !== null) {
        setCheckTag(segId, faultTag(fault.role, fault.toIntegrity));
        lightFiles([segId], null);
        emit('self-check-step', { cue: 'fault', segIds: [segId] });
      }
      return SELF_CHECK_FAULT_SEC * p;
    }
    case 'first':
      if (step.hold) {
        setCheckHold({ first: step.first, segIds: step.segIds });
        return SELF_CHECK_HOLD_SEC;
      }
      return SELF_CHECK_FINDING_SEC * p;
  }
}

// A step ends. The first of a kind is named as its hold lets go: 046.log gets PAL's reaction; the first seed its INSPECT words
// on its tag and ARRIVAL CONTROL's name for it (the first time anyone says HOLLOW), then PAL's.
function endStep(store: Store<GameState>, step: CheckStep): void {
  if (step.kind !== 'first') return;
  setCheckHold(null);
  nameFirst(store, step.first, step.segIds);
}

function nameFirst(store: Store<GameState>, first: FirstKind, segIds: readonly string[]): void {
  const state = store.getState();
  const pal = palLines(state.run);
  const ids = [CHECK_FIRST_ID[first]];
  if (first === 'log') say('companion', pal.mysteryFile, { critical: true });
  if (first === 'seed') {
    for (const id of segIds) setCheckTag(id, { text: SELF_CHECK_TEXT.tag.seedNamed, tone: 'seed', stays: true });
    if (!hollowWordSaid(state)) {
      say('control', HOLLOW_STORY.fragment, { critical: true });
      ids.push(CHECK_NAMED_HOLLOW);
    }
    say('companion', pal.firstSeed, { critical: true });
  }
  store.update((draft) => {
    for (const id of ids) if (!draft.director.done.includes(id)) draft.director.done.push(id);
  });
}

function stepAt(index: number): CheckStep {
  const step = steps?.[index];
  if (step === undefined) throw new Error(`boot: no step ${index}`);
  return step;
}

// Plays the check up to the boot's clock: the step playing ends when its time is up (a hold when released or timed out), the
// next starts at the second the last one ended (a new stage after SELF_CHECK_STAGE_GAP_SEC), and once all have played SENSORS
// runs, then the klaxon and the cut to amber.
function pump(store: Store<GameState>): void {
  const all = checkSteps(store);
  for (;;) {
    if (active !== null) {
      const step = stepAt(active.index);
      if (!active.released && elapsedSec < active.endsAtSec) return;
      cursorAtSec = active.released ? Math.max(cursorAtSec, Math.min(elapsedSec, active.endsAtSec)) : active.endsAtSec;
      active = null;
      endStep(store, step);
    }
    if (cursor < all.length) {
      const step = all[cursor]!;
      if (step.stage !== shownStage) {
        // A new stage: its line on the strip at once, its first step after the gap.
        if (shownStage !== 'receive' || cursor > 0) cursorAtSec += SELF_CHECK_STAGE_GAP_SEC;
        shownStage = step.stage;
        setCheckStage(step.stage);
      }
      if (elapsedSec < cursorAtSec) return;
      const index = cursor++;
      const lasts = startStep(store, step);
      active = { index, endsAtSec: cursorAtSec + lasts, released: false };
      continue;
    }
    if (sensorsAtSec === null) {
      sensorsAtSec = cursorAtSec + (shownStage === null ? 0 : SELF_CHECK_STAGE_GAP_SEC);
      shownStage = 'sensors';
      setCheckStage('sensors');
    }
    const klaxonAt = sensorsAtSec + SELF_CHECK_SENSORS_SEC;
    if (!klaxonPlayed && elapsedSec >= klaxonAt) {
      play('klaxon');
      klaxonPlayed = true;
    }
    if (elapsedSec >= klaxonAt + BOOT_END_AFTER_KLAXON_SEC) finishBoot(store);
    return;
  }
}

// Plays every step left in `stage` at once (null: every step left), holds released and named. Returns the boot seconds by
// which what it said has been seen: `seenAt`, a finding shown (SELF_CHECK_SKIP_SEEN_SEC from now); `typedAt`, HOLLOW's own line
// typed (it may already be typing). 0 for nothing.
function playAtOnce(store: Store<GameState>, stage: CheckStage | null): { seenAt: number; typedAt: number } {
  const all = checkSteps(store);
  let seenAt = 0;
  let typedAt = 0;
  if (active !== null) {
    const step = stepAt(active.index);
    if (step.kind === 'line' && step.line === 'hollow') typedAt = active.endsAtSec;
    active = null;
    endStep(store, step);
  }
  while (cursor < all.length && (stage === null || all[cursor]!.stage === stage)) {
    const step = all[cursor++]!;
    if (step.stage !== shownStage) {
      shownStage = step.stage;
      setCheckStage(step.stage);
    }
    const lasts = startStep(store, step);
    if (step.kind === 'line' && step.line === 'hollow') typedAt = Math.max(typedAt, elapsedSec + lasts);
    if ((step.kind === 'file' && step.tag !== null && step.tag.stays) || step.kind === 'fault' || step.kind === 'first') {
      seenAt = Math.max(seenAt, elapsedSec + SELF_CHECK_SKIP_SEEN_SEC);
    }
    endStep(store, step);
  }
  cursorAtSec = Math.max(cursorAtSec, elapsedSec);
  return { seenAt, typedAt };
}

// Refused while the title holds a save (review fix B2): RESUME ▸ / NEW RUN, or CAN'T RESUME's ABANDON RUN, is the way on
// there (components/title/TitleCard.ts), whether by ENTER, SPACE, a click or __ap; counting a run over it would overwrite
// the save and drop its unit from the lineage.
export function receiveTransmission(store: Store<GameState>): boolean {
  const { run, save } = store.getState();
  if (run.phase !== 'title' || save.resume !== null || save.status === 'cant-resume') return false;
  // ARCHIVE CORRUPT: the run plays without the archive (nothing is written over the bad record), and the
  // status says so from here on (the title's box, the footer's NO ARCHIVE, RUN END's line).
  if (store.getState().archive.status === 'corrupt') playWithoutArchive(store);
  startBootFromTitle(store, { countRun: true });
  // RUN START (02 §3.11): the run save's first point, once the archive has counted the run (its runs are the save's).
  writeRunSave(store, 'run-start', { carried: null, threat: firstShipThreat() });
  return true;
}

// The press on the title that starts a run or resumes one is the gesture that unlocks audio (the browser lets a page start
// sound only inside one): RECEIVE TRANSMISSION and a resumed boot through startBootFromTitle, a resumed desk or LANDING
// REPORT directly (slice 3c review follow-up; systems/run-save.ts resumeRun). The hook is the page's (main.ts: unlockAudio);
// a headless world has none.
export function unlockAudioFromGesture(): void {
  hooks.onReceive?.();
}

// The boot starts from the title (slice 3c, factored out of receiveTransmission): the audio unlocked, the boot's timers,
// blue, the unpause and the beam's sound. `countRun`: RUN START for the archive (RECEIVE TRANSMISSION); false for a resumed
// run, which the archive already counted (systems/run-save.ts resumeRun).
export function startBootFromTitle(store: Store<GameState>, opts: { countRun: boolean }): void {
  unlockAudioFromGesture();
  resetBootTimers();
  // The boot happens in blue. The title already is (createInitialState), so this is a no-op
  // unless something switched the screen behind the title card.
  setMode(store, 'memory');
  // The click is the "unpause": a tab hidden while the title was up paused the clock.
  store.update((draft) => {
    draft.run.phase = 'boot';
    draft.clock.paused = false;
  });
  // RUN START (§4.5): the archive counts the run and remembers it is in progress.
  if (opts.countRun) archiveRunStarted(store);
  play('transmitIn');
}

// The end of the boot, on time or skipped: every step has played (every line is in the log, every effect done), the klaxon
// sounds, the screen cuts to amber and the flight starts.
function finishBoot(store: Store<GameState>): void {
  ensurePlanned(store);
  advanceGhost(store, true);
  playAtOnce(store, null);
  endCheckView();
  shownStage = null;
  if (!klaxonPlayed) {
    play('klaxon');
    klaxonPlayed = true;
  }
  setMode(store, 'tools');
  store.update((draft) => { draft.run.phase = 'flight'; });
  syncModal(store);
}

// A press during the boot (click, SPACE, ENTER, or ?debug's __ap.skipBoot). True when it did something: let a hold go,
// hurried a stage, skipped to SENSORS or cut to amber. Refused (false) inside the grace, while the ghost types (with a buzz),
// and while a skip's findings or HOLLOW's line are still being seen.
export function skipBoot(store: Store<GameState>): boolean {
  const state = store.getState();
  if (state.run.phase !== 'boot' || elapsedSec < BOOT_SKIP_GRACE_SEC) return false;
  ensurePlanned(store);
  if (elapsedSec < ghostSeenAtSec()) {
    play('buzz');
    return false;
  }
  // A hold: the press is the click that lets the sweep go on.
  if (active !== null && !active.released) {
    const step = stepAt(active.index);
    if (step.kind === 'first' && step.hold) {
      active.released = true;
      pump(store);
      return true;
    }
  }
  if (skipped) {
    // Every step has played: the cut waits until what the skip showed has been seen.
    if (elapsedSec < cursorAtSec) return false;
    finishBoot(store);
    return true;
  }
  const all = checkSteps(store);
  if (!hurried && cursor < all.length) {
    // The first press: the rest of this stage at once.
    hurried = true;
    const stage = active !== null ? stepAt(active.index).stage : all[cursor]!.stage;
    const { seenAt, typedAt } = playAtOnce(store, stage);
    cursorAtSec = Math.max(elapsedSec, typedAt, seenAt === 0 ? elapsedSec : Math.min(seenAt, elapsedSec + SELF_CHECK_FINDING_SEC));
    return true;
  }
  // The next: every step left at once, then SENSORS once what it showed has been seen.
  skipped = true;
  const shown = playAtOnce(store, null);
  const seenAt = Math.max(shown.seenAt, shown.typedAt);
  if (seenAt <= elapsedSec) {
    finishBoot(store);
    return true;
  }
  cursorAtSec = seenAt;
  sensorsAtSec = seenAt - SELF_CHECK_SENSORS_SEC;
  shownStage = 'sensors';
  setCheckStage('sensors');
  return true;
}

// ?debug's `__ap.skipBoot()` (the e2e scenarios' skip): every press that is honoured now, and when none can be yet (the
// grace, the ghost), the same as soon as one can. True when it pressed or queued; false outside the boot.
export function skipBootAll(store: Store<GameState>): boolean {
  if (store.getState().run.phase !== 'boot') return false;
  let honoured = false;
  for (let i = 0; i < 6 && store.getState().run.phase === 'boot' && skipBoot(store); i++) honoured = true;
  if (!honoured && store.getState().run.phase === 'boot') skipQueued = true;
  return true;
}

function advanceBoot(store: Store<GameState>, dtWall: number): void {
  ensurePlanned(store);
  elapsedSec += dtWall;
  advanceGhost(store, false);
  pump(store);
  if (skipQueued && store.getState().run.phase === 'boot' && elapsedSec >= Math.max(BOOT_SKIP_GRACE_SEC, ghostSeenAtSec())) {
    skipQueued = false;
    skipBootAll(store);
  }
}

let mounted = false;

export function mountBoot(store: Store<GameState>, bootHooks: BootHooks = {}): () => void {
  if (mounted) throw new Error('mountBoot: already mounted');
  mounted = true;
  hooks = bootHooks;

  const offKeys = registerKeys({
    layer: 'title',
    codes: ['Space', 'Enter'],
    onDown: () => {
      const phase = store.getState().run.phase;
      // Playtest 1: ERASE ALL RECORDS' confirm owns ENTER while it asks (KEEP), so the key never also starts a run.
      if (phase === 'title' && !titleEraseAsking()) receiveTransmission(store);
      else if (phase === 'boot') skipBoot(store);
    },
  });
  // The boot runs on wall time: the world clock does not tick outside 'flight'.
  const offTick = onPostTick((dtWall) => {
    if (store.getState().run.phase === 'boot') advanceBoot(store, dtWall);
  });
  // A reset (a new ship, the simulation retry, a NEW RUN) starts the boot's clock over.
  const offReset = onWorldReset('boot', resetBootTimers, () => ({
    elapsedSec, klaxonPlayed, ghost, ghostPlanned, plan, steps, cursor, active, sensorsAtSec, hurried, skipped, skipQueued,
    said: saidLines.size, check: checkSnapshot(),
  }));
  // The modal follows the phase: a reset runs before the new ship's slices are in the store
  // (systems/run.ts resetWorldForShip), so a new boot or a NEW RUN's title raises it from here.
  const offPhase = store.subscribe((s) => s.run.phase, () => syncModal(store));
  syncModal(store);

  return () => {
    offKeys();
    offTick();
    offReset();
    offPhase();
    closeModal?.();
    closeModal = null;
    hooks = {};
    mounted = false;
  };
}
