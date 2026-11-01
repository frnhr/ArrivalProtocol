import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { pushModal, registerKeys } from '@systems/input';
import { getPrediction } from '@systems/predict';
import { say, typingSec } from '@systems/say';
import { setMode } from '@systems/mode';
import { play } from '@systems/audio';
import { emit } from '@systems/events';
import { archiveRunStarted, ghostLine, playWithoutArchive } from '@systems/meta';
import { installBootLicences, renewRepairAtBoot } from '@systems/licences';
import { nameHollow } from '@systems/hollow';
import { skillBootDue, trainSkillAtBoot } from '@systems/autoburn';
import { bootLine, bootLinePlan, bootLineSpeaker, lineVars, BOOT_LINE_MAX, type BootLineKind } from '@data/script';
import type { Speaker } from '@state/schema';
import {
  BOOT_LINE_AT_SEC, BOOT_KLAXON_AFTER_LAST_LINE_SEC, BOOT_END_AFTER_KLAXON_SEC, BOOT_SKIP_GRACE_SEC,
  ARRIVAL_HIT_STAGGER_SEC, ARRIVAL_HIT_SEEN_SEC, BOOT_GHOST_AT_SEC, BOOT_AFTER_GHOST_SEC, HOLLOW_NAME_AFTER_TYPED_SEC,
  BOOT_AFTER_HOLLOW_LINE_SEC,
} from '@data/tuning';

// The title card and the boot (§5.1, §7.1), DOM-free. The page opens in phase 'title': the
// clock does not run and an input modal owns the keyboard. RECEIVE TRANSMISSION (a click, or
// SPACE / ENTER) starts the boot: about five wall seconds in blue while the TERMINAL types the
// unpack, host and ECC lines, then the klaxon, the cut to amber and phase 'flight'.
// A click, SPACE or ENTER skips the boot, after a short grace (a double-click on RECEIVE must
// not skip it). After a transmission a skip never cuts out what the crossing did: the first one
// jumps to the ECC line (its red flashes start at once), and the cut to amber waits until the last
// flash has been seen. The modal stays up until the flight starts, so a key held through the boot
// (SPACE!) needs a fresh press before it does anything in the game.
// On a later ship the crossing's ECC line flashes the files it hit; the ship's own arrival damage (KESTREL's
// sensor, WP9) has a line of its own that flashes its file; and when the kid's captures have trained AUTOBURN,
// the boot installs AUTOBURN.skl and says so (`> SKILL TRAINED: AUTOBURN.skl · from your 2 captures …`). The
// lines are planned once, at the boot's first tick, so a line said (a skill installed) never changes the count.
// A returning unit (run 2+, §5.2) boots ship 1 differently, so it feels different within seconds:
// • its last unit's ghost types first, in HOLLOW's slow pink (`> hi 048. it's 047. 046 ate me. now i'm
//   hungry too.`), and a moment after its last letter `???` on the root becomes that unit's name; the boot's
//   own lines follow, and a skip waits until the ghost has had its say;
// • after the ECC line, `> SOUL ARCHIVE · 2,400 · you know what they are`: the slabs crack at once (no STASIS
//   step), and REPAIR is licensed in the same moment (the ENGINE I/O FAULT will want it).
//   While the ghost speaks, the strip does not offer the skip (bootSkipWaits), and a press is refused with a
//   buzz (§6.11), so a kid mashing SPACE hears why nothing happens.
// On a ship whose HOLLOW asks for charge (VESPER, WP10), its own line closes the boot in its slow pink (`> keep 20
// charge for me, 047. you'll see.`): the klaxon waits until the TERMINAL has typed it, and a skip jumps to it (after
// the crossing's flashes) rather than past it, so a kid mashing SPACE still reads the price of a MERGE.
// RECEIVE TRANSMISSION is RUN START for the archive (runs + 1, the run in progress: systems/meta.ts). An
// archive that can't be read (CORRUPT) does not hold the run back: RECEIVE plays on without it, as PLAY
// WITHOUT ARCHIVE does, and its red box stays on the title (the lead's note: the game continues without
// saving, and says so).

if (BOOT_LINE_AT_SEC.length < BOOT_LINE_MAX) {
  throw new Error(`boot: BOOT_LINE_AT_SEC has ${BOOT_LINE_AT_SEC.length} times for up to ${BOOT_LINE_MAX} lines`);
}

// The boot's beats: each line at its time, the klaxon a moment after the last one (ship 1's three lines:
// 4.5 s), the cut to amber after that. A later ship says what the crossing did, so its boot runs a line or
// two longer (§4.1: 5–8 s). When HOLLOW's line closes the boot (VESPER), the klaxon waits until it has typed.
function klaxonAtSec(store: Store<GameState>): number {
  const lines = linePlan(store).length;
  const afterLast = lineAtSec(lines - 1) + BOOT_KLAXON_AFTER_LAST_LINE_SEC;
  const hollowLine = lineIndex(store, 'hollow');
  return hollowLine < 0 ? afterLast : Math.max(afterLast, lineTypedAtSec(store, hollowLine) + BOOT_AFTER_HOLLOW_LINE_SEC);
}

function endAtSec(store: Store<GameState>): number {
  return klaxonAtSec(store) + BOOT_END_AFTER_KLAXON_SEC;
}

export interface BootHooks {
  // Runs synchronously inside the user gesture that receives the transmission: the only
  // moment the browser lets the page start audio.
  onReceive?: () => void;
}

// A returning unit's ghost in this boot: its line, and the boot second by which it has typed out (from
// then the name flips and a skip is honoured). Planned at the boot's first tick; null for every other boot.
interface GhostBeat {
  text: string;
  typedAtSec: number;
  said: boolean;
  named: boolean;
}

let hooks: BootHooks = {};
let elapsedSec = 0;
let linesSaid = 0;
// The lines said so far, with the boot second each was said: the TERMINAL types them one after another (say.ts), so
// when a line has typed depends on the ones before it (a skip says several at once).
let saidLines: { speaker: Speaker; text: string; atSec: number }[] = [];
let klaxonPlayed = false;
let ghost: GhostBeat | null = null;
let ghostPlanned = false;
// The boot's lines, planned at its first tick (bootLinePlan); null before.
let plan: BootLineKind[] | null = null;
let closeModal: (() => void) | null = null;

function resetBootTimers(): void {
  elapsedSec = 0;
  linesSaid = 0;
  saidLines = [];
  klaxonPlayed = false;
  ghost = null;
  ghostPlanned = false;
  plan = null;
}

function linePlan(store: Store<GameState>): BootLineKind[] {
  if (plan === null) {
    const state = store.getState();
    plan = bootLinePlan(state, state.run.arrival !== null && skillBootDue(state) !== null);
  }
  return plan;
}

// Where a kind of line sits in the plan (-1: this boot has none).
function lineIndex(store: Store<GameState>, kind: BootLineKind): number {
  return linePlan(store).indexOf(kind);
}

// The ghost speaks on ship 1's boot of a run whose last unit became HOLLOW (systems/meta.ts ghostLine), once:
// HOLLOW is not named yet. Every other boot has none.
function planGhost(state: Readonly<GameState>): GhostBeat | null {
  if (state.run.shipIndex !== 0 || state.run.arrival !== null || state.run.hollowNamed) return null;
  const text = ghostLine(state.run.unitNumber, state.run.lastUnit);
  if (text === null) return null;
  return { text, typedAtSec: BOOT_GHOST_AT_SEC + typingSec('hollow', text), said: false, named: false };
}

function ensureGhostPlanned(store: Store<GameState>): void {
  if (ghostPlanned) return;
  ghostPlanned = true;
  ghost = planGhost(store.getState());
}

// The boot second by which the TERMINAL has typed line `index` of the plan: the lines said so far type one after
// another from the moment each was said; a line not said yet is counted from its time, after the ones before it.
function lineTypedAtSec(store: Store<GameState>, index: number): number {
  let typedBy = -Infinity;
  for (let i = 0; i <= index; i++) {
    const said = saidLines[i];
    const kind = linePlan(store)[i]!;
    const text = said?.text ?? plannedText(store, kind);
    typedBy = Math.max(said?.atSec ?? lineAtSec(i), typedBy) + typingSec(said?.speaker ?? bootLineSpeaker(kind), text);
  }
  return typedBy;
}

// A line's words before it is said: rendered as it would be now (a skill line's are the training's own; its length
// only shifts a later line's typing by a fraction of a second, so an estimate of the same shape is enough).
function plannedText(store: Store<GameState>, kind: BootLineKind): string {
  if (kind === 'skill') return '';
  const state = store.getState();
  return bootLine(kind, state, lineVars(state, getPrediction()));
}

// The boot's own lines wait for the ghost to finish: line i at its time, shifted past the ghost's last letter.
function lineShiftSec(): number {
  return ghost === null ? 0 : ghost.typedAtSec + BOOT_AFTER_GHOST_SEC - BOOT_LINE_AT_SEC[0]!;
}

function lineAtSec(index: number): number {
  return BOOT_LINE_AT_SEC[index]! + lineShiftSec();
}

// The ghost's beats: its line at BOOT_GHOST_AT_SEC, its name a moment after it has typed (or both at once,
// when the boot is finished early).
function advanceGhost(store: Store<GameState>, all: boolean): void {
  if (ghost === null) return;
  if (!ghost.said && (all || elapsedSec >= BOOT_GHOST_AT_SEC)) {
    ghost.said = true;
    say('hollow', ghost.text, { critical: true });
  }
  if (!ghost.named && (all || elapsedSec >= ghost.typedAtSec + HOLLOW_NAME_AFTER_TYPED_SEC)) {
    ghost.named = true;
    nameHollow(store);
  }
}

// A skip is honoured once the ghost has had its say (its line typed, its name flipped).
function ghostSeenAtSec(): number {
  return ghost === null ? 0 : ghost.typedAtSec + HOLLOW_NAME_AFTER_TYPED_SEC;
}

// The boot is in its ghost beat, when a skip waits (the director's strip line says so instead of offering
// the skip). Before the boot's first tick the ghost is not planned yet: whether it will be is read from the
// state, so the strip never offers a skip for one frame.
export function bootSkipWaits(state: Readonly<GameState>): boolean {
  if (state.run.phase !== 'boot') return false;
  if (!ghostPlanned) return planGhost(state) !== null;
  return elapsedSec < ghostSeenAtSec();
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

// Each boot line is rendered when it is typed, from the live state: the ECC line names the
// files that are damaged right then. After a transmission the ECC line is the crossing's: as it is
// said, the strip flashes each file a hit landed on (WP7 part 2, 'arrival-hits'); the ship's own damage
// flashes with its own line (WP9).
function sayNextLine(store: Store<GameState>): void {
  const state = store.getState();
  const kind = linePlan(store)[linesSaid];
  if (kind === undefined) throw new Error(`boot: no line ${linesSaid} in this boot's plan`);
  const text = kind === 'skill' ? trainSkillAtBoot(store) : bootLine(kind, state, lineVars(state, getPrediction()));
  const speaker = bootLineSpeaker(kind);
  say(speaker, text, { critical: true });
  saidLines.push({ speaker, text, atSec: elapsedSec });
  const arrival = state.run.arrival;
  if (kind === 'ecc' && arrival !== null && arrival.hits.length > 0) emit('arrival-hits', { hits: [...arrival.hits] });
  if (kind === 'scripted' && arrival !== null) emit('arrival-hits', { hits: [...arrival.scripted] });
  // HOLLOW boarded on this beam (phase 3 slice 2, 04 §4): its 108% unpack is the boarding moment (the shake, the tear,
  // the hollowBoard cue hang on the event; Track UI).
  if (kind === 'board' && arrival !== null && arrival.boarded !== null) emit('hollow-boarded', { ...arrival.boarded });
  // A returning unit's ship-1 boot licenses REPAIR as it names the host (§5.2; phase 2 did it as the archive opened):
  // the chip is there before the flight, as on every later ship.
  if (kind === 'host' && state.run.arrival === null) installBootLicences(store);
  // A unit that crossed with no working REPAIR gets it back with its charge (WP12: licences.ts renewRepairAtBoot).
  if (kind === 'charge') renewRepairAtBoot(store);
  linesSaid++;
}

export function receiveTransmission(store: Store<GameState>): boolean {
  if (store.getState().run.phase !== 'title') return false;
  // The press is the gesture that unlocks audio.
  hooks.onReceive?.();
  // ARCHIVE CORRUPT: the run plays without the archive (nothing is written over the bad record), and the
  // status says so from here on (the title's box, the footer's NO ARCHIVE, RUN END's line).
  if (store.getState().archive.status === 'corrupt') playWithoutArchive(store);
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
  archiveRunStarted(store);
  play('transmitIn');
  return true;
}

// The end of the boot, on time or skipped: every line is in the log, the klaxon sounds, the
// screen cuts to amber and the flight starts.
function finishBoot(store: Store<GameState>): void {
  ensureGhostPlanned(store);
  advanceGhost(store, true);
  while (linesSaid < linePlan(store).length) sayNextLine(store);
  if (!klaxonPlayed) {
    play('klaxon');
    klaxonPlayed = true;
  }
  setMode(store, 'tools');
  store.update((draft) => { draft.run.phase = 'flight'; });
  syncModal(store);
}

// The boot time before which a skip may not cut to amber: the arrival's last flash seen
// (ARRIVAL_HIT_SEEN_SEC after it starts, ARRIVAL_HIT_STAGGER_SEC apart from its line on: the crossing's on
// the ECC line, the ship's own on its line).
function flashesSeenAtSec(store: Store<GameState>, kind: BootLineKind, flashes: number): number {
  const index = lineIndex(store, kind);
  if (flashes === 0 || index < 0) return 0;
  return lineAtSec(index) + (flashes - 1) * ARRIVAL_HIT_STAGGER_SEC + ARRIVAL_HIT_SEEN_SEC;
}

function arrivalSeenAtSec(store: Store<GameState>): number {
  const arrival = store.getState().run.arrival;
  if (arrival === null) return 0;
  return Math.max(flashesSeenAtSec(store, 'ecc', arrival.hits.length), flashesSeenAtSec(store, 'scripted', arrival.scripted.length));
}

// The last line whose flashes the cut to amber waits for (-1: nothing flashes).
function lastFlashLine(store: Store<GameState>): number {
  const arrival = store.getState().run.arrival;
  if (arrival === null) return -1;
  if (arrival.scripted.length > 0) return lineIndex(store, 'scripted');
  return arrival.hits.length > 0 ? lineIndex(store, 'ecc') : -1;
}

export function skipBoot(store: Store<GameState>): boolean {
  const state = store.getState();
  if (state.run.phase !== 'boot' || elapsedSec < BOOT_SKIP_GRACE_SEC) return false;
  ensureGhostPlanned(store);
  if (elapsedSec < ghostSeenAtSec()) {
    play('buzz');
    return false;
  }
  const seenAt = arrivalSeenAtSec(store);
  const flashLine = lastFlashLine(store);
  if (seenAt > 0 && flashLine >= 0 && linesSaid <= flashLine) {
    // Jump to the line that flashes last: the lines up to it are said now (their flashes start), and the boot
    // runs on from there.
    elapsedSec = lineAtSec(flashLine);
    advanceBoot(store, 0);
    return true;
  }
  if (elapsedSec < seenAt) return false;
  // HOLLOW's line (VESPER): a skip jumps to it (the lines before it are said now), and the cut waits until it has typed.
  const hollowLine = lineIndex(store, 'hollow');
  if (hollowLine >= 0) {
    if (linesSaid <= hollowLine) {
      elapsedSec = Math.max(elapsedSec, lineAtSec(hollowLine));
      advanceBoot(store, 0);
      return true;
    }
    if (elapsedSec < lineTypedAtSec(store, hollowLine)) return false;
  }
  finishBoot(store);
  return true;
}

function advanceBoot(store: Store<GameState>, dtWall: number): void {
  ensureGhostPlanned(store);
  elapsedSec += dtWall;
  advanceGhost(store, false);
  const lines = linePlan(store).length;
  while (linesSaid < lines && elapsedSec >= lineAtSec(linesSaid)) sayNextLine(store);
  if (!klaxonPlayed && elapsedSec >= klaxonAtSec(store)) {
    play('klaxon');
    klaxonPlayed = true;
  }
  if (elapsedSec >= endAtSec(store)) finishBoot(store);
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
      if (phase === 'title') receiveTransmission(store);
      else if (phase === 'boot') skipBoot(store);
    },
  });
  // The boot runs on wall time: the world clock does not tick outside 'flight'.
  const offTick = onPostTick((dtWall) => {
    if (store.getState().run.phase === 'boot') advanceBoot(store, dtWall);
  });
  // A reset (a new ship, the simulation retry, a NEW RUN) starts the boot's clock over.
  const offReset = onWorldReset('boot', resetBootTimers, () => ({
    elapsedSec, linesSaid, klaxonPlayed, ghost, ghostPlanned, plan, saidLines: saidLines.length,
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
