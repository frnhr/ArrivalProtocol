import type { Store } from '@state/store';
import type { GameState, RevealCause } from '@state/schema';
import type { Segment, SoulSegment } from '@/types/segment';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on, emit } from '@systems/events';
import { cancelTool } from '@systems/fs-tools';
import { say } from '@systems/say';
import { archiveSealed, revealUnderway, soulsInMemory, soulCounts, getByRole, getSegmentById } from '@state/selectors';
import { racksLabel } from '@data/memory';
import { revealLines, lostSoulsLine } from '@data/script';
import {
  REVEAL_LINE_AT_SEC, REVEAL_CRACK_AT_SEC, REVEAL_CRACK_STAGGER_SEC, REVEAL_CRACK_ANIM_SEC, REVEAL_SELECT_AFTER_SEC,
  REVEAL_AUTO_DELAY_SEC, REVEAL_VIEW_WAIT_MAX_SEC,
} from '@data/tuning';

// The STASIS reveal (§1, §6.7, §9 WP5 item 4): the moment the game turns. The briefing said 2,400
// colonists in cryo-stasis; the STASIS file says `0 pods detected`; the grey slabs in racks B–C
// crack into twelve families with heartbeats, the footer flips to SOULS IN MEMORY and INSPECT
// names a girl called Ada. It must have time, sound and motion, so it is a sequence on AI time
// (frozen by pause, like every story timer, §3.4):
//   0.0  line 1 (`STASIS: 0 pods detected.`)      1.8  line 2 (`rescanning…`)
//   3.6  line 3 (`… They're in here. (RACKS B–C)`) 6.2  the slabs crack, one chip per 60 ms,
//        under the choir                             +1.4 the lead cluster (C12 · OKAFOR) is selected
// The crack waits for the kid to look at the mind (at most REVEAL_VIEW_WAIT_MAX_SEC): it is the
// picture of the whole moment, and a burn can pull the kid back to amber halfway through.
// INSPECT types the lines (it shows STASIS while they land), audio-cues plays the pings, the cracks
// and the choir from the events, and the strip draws each chip cracking in order (crackDelaySec).
// The picture belongs to the kid's first look: when the cap cracks the slabs while the kid is in
// amber, the chips keep their crack until the mind is shown ('crack-shown').
//
// Entry points (one function, revealSouls(store, cause)):
// • 'scan': the kid scans the STASIS file (§5.1 0:38), the run-1 tutorial's ask;
// • 'printing': printing starts with the archive still sealed (`PRINTER: locating colonists…`). It
//   starts REVEAL_AUTO_DELAY_SEC after the lock, clear of ORBIT LOCKED's stamp, and the printer
//   waits REVEAL_PRINT_GAP_SEC after it ends (printer.ts). Not while ship 1's bite owes the fight's
//   own reveal (hollow.revealOwed): that one comes after the fight's echo;
// • 'breach': HOLLOW bites a sealed cluster: unsealCluster opens that one at once, and
//   systems/hollow.ts plays the full reveal once that fight is decided (cured or eaten);
// • 'lost': the ship is lost before anyone looked. The clock is stopped, so the slabs open at once
//   and the LOST card plays the moment (`2,400 souls in memory. 0 woke.`);
// • 'known': a returning unit (run 2+, §5.2) already knows what the slabs hold. Its ship-1 boot says
//   `> SOUL ARCHIVE · 2,400 · you know what they are` (systems/boot.ts) and the slabs crack at once, with
//   the choir, no lines and no STASIS step; the lead cluster is selected, as after the scan.
// SKIP stays held on run 1 while anything is sealed (pace.ts), until the strip's ask for the colonists
// has stood SOULS_ASK_HOLD_SEC (LEAD-1); the footer reads SOULS IN STASIS. Nothing reveals itself
// mid-flight for a kid who ignores the ask: the breach and the printer's find are the ways in.

let storeRef: Store<GameState> | null = null;
let pendingCause: RevealCause | null = null;   // set by an event, acted on in the next tick
let delayLeftSec = 0;                           // 'pending': AI s before the sequence starts
let elapsedSec = 0;                             // 'playing': AI s since it started
let crackAtSec = 0;
let selectAtSec = 0;
let cracked = false;
let viewWaitSec = 0;                            // AI s the crack has waited for the kid to look
// The chips of the last crack, in crack order, until their animation has played (the strip animates
// them), and the AI second the kid first saw it (null: it cracked out of sight and still waits).
let crackCodes: string[] = [];
let crackShownAiSec: number | null = null;
// INSPECT's selection right after the crack (STASIS and its lines). finish() moves it to the lead
// only if the kid has not moved on since.
let selectionAtCrack: string | null = null;

function resetReveal(): void {
  pendingCause = null;
  delayLeftSec = 0;
  elapsedSec = 0;
  crackAtSec = 0;
  selectAtSec = 0;
  cracked = false;
  viewWaitSec = 0;
  crackCodes = [];
  crackShownAiSec = null;
  selectionAtCrack = null;
}

function sealedSouls(state: Readonly<GameState>): SoulSegment[] {
  return soulsInMemory(state).filter((soul) => soul.sealed);
}

// Where the colonists are, as the reveal's last line names them (`RACKS B–C`).
function archiveRacks(state: Readonly<GameState>): string {
  return racksLabel(state.memory, soulsInMemory(state));
}

// Opens `souls` in one update and announces the crack. The chips crack on screen one by one
// (REVEAL_CRACK_STAGGER_SEC apart, in address order), while the state flips at once.
function crack(store: Store<GameState>, souls: readonly SoulSegment[], cause: RevealCause, animate: boolean): void {
  if (souls.length === 0) return;
  const codes = souls.map((soul) => soul.cluster);
  crackCodes = animate ? codes : [];
  crackShownAiSec = null;
  store.update((draft) => {
    for (const soul of souls) soul.sealed = false;
    draft.ui.memoryRev++;
  });
  emit('souls-unsealed', { codes, cause });
  showCrackIfLooking(store);
}

// The crack plays the first time the kid looks at the mind after it (at once if they already are).
// Once every chip's animation has run, the crack is over: a later rebuild or a TAB back draws the
// chips settled, never a second crack.
function showCrackIfLooking(store: Store<GameState>): void {
  if (crackCodes.length === 0) return;
  const state = store.getState();
  if (crackShownAiSec === null) {
    if (state.ui.mode !== 'memory') return;
    crackShownAiSec = state.clock.aiSec;
    emit('crack-shown', { count: crackCodes.length });
    return;
  }
  const lastEndsAt = crackShownAiSec + (crackCodes.length - 1) * REVEAL_CRACK_STAGGER_SEC + REVEAL_CRACK_ANIM_SEC;
  if (state.clock.aiSec > lastEndsAt) {
    crackCodes = [];
    crackShownAiSec = null;
  }
}

// When a chip's crack animation starts, in seconds from now, or null when it has none to play.
// Negative: the crack is that far along, so a strip rebuilt mid-crack (an op starting, a REPAIR on
// C09) continues each chip where it was instead of turning them all back into slabs. Out of sight,
// the whole crack waits for the first look (the hidden strip runs no animation until it is shown).
export function crackDelaySec(code: string): number | null {
  const index = crackCodes.indexOf(code);
  if (index < 0 || !storeRef) return null;
  const startsIn = index * REVEAL_CRACK_STAGGER_SEC;
  if (crackShownAiSec === null) return startsIn;
  const delay = startsIn - (storeRef.getState().clock.aiSec - crackShownAiSec);
  return delay + REVEAL_CRACK_ANIM_SEC > 0 ? delay : null;
}

// Starts the reveal for `cause`. Returns false when there is nothing to reveal (the archive is
// open) or one is already under way. 'lost' opens the slabs at once (the clock is stopped under
// the LOST card), also over a reveal that was still playing (a crash in the middle of it), with no
// picture; 'known' cracks them at once in the boot, with the picture; every other cause plays the
// timed sequence.
export function revealSouls(store: Store<GameState>, cause: RevealCause): boolean {
  const state = store.getState();
  if (!archiveSealed(state)) return false;
  if (revealUnderway(state) && cause !== 'lost') return false;
  if (cause === 'lost' || cause === 'known') {
    resetReveal();
    crack(store, sealedSouls(state), cause, cause === 'known');
    const lead = cause === 'known' ? leadCluster(store.getState()) : null;
    store.update((draft) => {
      draft.souls.reveal = { stage: 'revealed', cause, lines: [] };
      if (lead && !draft.ui.activeTool) draft.ui.selectedId = lead.id;
    });
    emit('reveal-done', { cause });
    return true;
  }
  delayLeftSec = cause === 'printing' ? REVEAL_AUTO_DELAY_SEC : 0;
  elapsedSec = 0;
  cracked = false;
  viewWaitSec = 0;
  store.update((draft) => { draft.souls.reveal = { stage: 'pending', cause, lines: [] }; });
  return true;
}

// HOLLOW breached a sealed cluster (§6.6 ship-1 script): that one opens at once, so the kid can see
// what is being eaten. The rest stay sealed; the full reveal follows when systems/hollow.ts calls
// revealSouls(store, 'breach') after the fight.
export function unsealCluster(store: Store<GameState>, id: string): void {
  const seg = getSegmentById(store.getState(), id);
  if (!seg || seg.type !== 'soul') throw new Error(`unsealCluster: ${id} is not a soul cluster in memory`);
  if (!seg.sealed) return;
  crack(store, [seg], 'breach', true);
}

// The playing sequence starts: INSPECT shows STASIS (where the lines type), unless a tool in hand
// already shows the file it was used on (the scanned STASIS itself).
function startPlaying(store: Store<GameState>): void {
  const state = store.getState();
  const stasis = getByRole(state, 'stasis');
  elapsedSec = 0;
  crackAtSec = REVEAL_CRACK_AT_SEC;
  selectAtSec = crackAtSec + sealedSouls(state).length * REVEAL_CRACK_STAGGER_SEC + REVEAL_SELECT_AFTER_SEC;
  store.update((draft) => {
    draft.souls.reveal.stage = 'playing';
    if (stasis && !draft.ui.activeTool) draft.ui.selectedId = stasis.id;
  });
}

function landLine(store: Store<GameState>, index: number): void {
  const state = store.getState();
  const cause = state.souls.reveal.cause;
  if (cause === null) throw new Error('reveal: a line with no cause');
  const line = revealLines(cause, state.mission.souls, archiveRacks(state))[index];
  if (line === undefined) throw new Error(`reveal: no line ${index} for '${cause}'`);
  store.update((draft) => { draft.souls.reveal.lines.push(line); });
  // The printer's version is the machine on the ground talking: a kid still watching ORBIT LOCKED
  // in amber reads it on the radio (the TAB line on the strip leads to the rest). In blue INSPECT
  // types it, and the same line on the ticker would only give the last words away early.
  if (cause === 'printing' && state.ui.mode === 'tools') say('sys', line, { critical: true });
  emit('reveal-line', { index, cause });
}

// The lead cluster (C12 · OKAFOR on ship 1), or the first cluster left when it is gone.
function leadCluster(state: Readonly<GameState>): Segment | null {
  const souls = soulsInMemory(state);
  return souls.find((soul) => soul.cluster === state.souls.lead) ?? souls[0] ?? null;
}

function finish(store: Store<GameState>): void {
  const state = store.getState();
  const cause = state.souls.reveal.cause;
  if (cause === null) throw new Error('reveal: finished with no cause');
  // INSPECT moves from the scan result to a person, unless the kid has already moved on: a tool
  // picked up since the crack (REPAIR, on its way to C09) stays in the hand, and a cluster the kid
  // clicked stays selected. The crack already put down the tool the scan left in the hand.
  const untouched = !state.ui.activeTool && state.ui.selectedId === selectionAtCrack;
  const lead = leadCluster(state);
  store.update((draft) => {
    draft.souls.reveal.stage = 'revealed';
    if (lead && untouched) draft.ui.selectedId = lead.id;
  });
  emit('reveal-done', { cause });
}

function advance(store: Store<GameState>, dtAi: number): void {
  const reveal = store.getState().souls.reveal;
  if (reveal.stage === 'pending') {
    delayLeftSec -= dtAi;
    if (delayLeftSec > 0) return;
    startPlaying(store);
  }
  if (store.getState().souls.reveal.stage !== 'playing') return;
  elapsedSec += dtAi;
  while (store.getState().souls.reveal.lines.length < REVEAL_LINE_AT_SEC.length
    && elapsedSec >= REVEAL_LINE_AT_SEC[store.getState().souls.reveal.lines.length]!) {
    landLine(store, store.getState().souls.reveal.lines.length);
  }
  if (!cracked && elapsedSec >= crackAtSec) {
    // Nobody is looking at the strip: hold the crack (the rest of the timeline with it) until the
    // kid comes to the mind, for at most REVEAL_VIEW_WAIT_MAX_SEC.
    if (store.getState().ui.mode !== 'memory' && viewWaitSec < REVEAL_VIEW_WAIT_MAX_SEC) {
      viewWaitSec += dtAi;
      elapsedSec = crackAtSec;
      return;
    }
    cracked = true;
    const cause = store.getState().souls.reveal.cause;
    if (cause === null) throw new Error('reveal: a crack with no cause');
    // The tool still in hand (SCAN, after the scan) would dim every chip as "not a target" at the
    // very moment they appear: it is put down, and INSPECT keeps the STASIS lines.
    if (store.getState().ui.activeTool) cancelTool(store);
    selectionAtCrack = store.getState().ui.selectedId;
    crack(store, sealedSouls(store.getState()), cause, true);
  }
  if (cracked && elapsedSec >= selectAtSec) finish(store);
}

// The LOST card's souls line (§9 WP5 item 6): every colonist still in memory did not wake. On a
// ship lost before anyone looked (the 'lost' reveal), the card is where the kid finds out where the
// colonists were, so it plays the moment (typed slowly, under the choir).
export interface LostCardSouls {
  line: string;
  reveals: boolean;
}

export function lostCardSouls(state: Readonly<GameState>): LostCardSouls {
  const counts = soulCounts(state);
  return {
    line: lostSoulsLine(counts.inMemory, counts.heads),
    reveals: state.souls.reveal.cause === 'lost',
  };
}

let mounted = false;

export function mountReveal(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountReveal: already mounted');
  mounted = true;
  storeRef = store;

  // Events only mark what happened; the tick acts on it (never inside an emit).
  const offs = [
    on('scanned', ({ role }) => { if (role === 'stasis') pendingCause = 'scan'; }),
    on('crashed', () => { pendingCause = 'lost'; }),
    on('escaped', () => { pendingCause = 'lost'; }),
    on('stranded', () => { pendingCause = 'lost'; }),
    on('abandoned', () => { pendingCause = 'lost'; }),
    // HOLLOW ate the AI Core (WP6): the ship is lost like a crash.
    on('core-lost', () => { pendingCause = 'lost'; }),
  ];

  // Every tick, in every phase and while paused: the sequence advances on AI time (dtAi is 0 while
  // paused, so it freezes), and a lost ship opens the slabs even though its clock has stopped.
  // A reveal that starts this tick counts its time from the next one (it did not exist for this
  // tick's AI time), so the sequence is advanced first.
  const offTick = onPostTick((_dtWall, dtAi) => {
    advance(store, dtAi);
    showCrackIfLooking(store);
    if (pendingCause !== null) {
      const cause = pendingCause;
      pendingCause = null;
      revealSouls(store, cause);
    }
    // The printer's find waits while ship 1's bite owes the fight's own reveal (hollow.revealOwed): a
    // fight still undecided at the lock had the printer's `2,400 colonists found` typing over HOLLOW's
    // eat echo (LEAD-1 review round 1). The story plays the reveal after the echo instead.
    const state = store.getState();
    if (state.run.phase === 'printing' && state.souls.reveal.stage === 'sealed' && !state.hollow.revealOwed) {
      revealSouls(store, 'printing');
    }
  });

  const offReset = onWorldReset('reveal', resetReveal, () => ({
    pendingCause, delayLeftSec, elapsedSec, crackAtSec, selectAtSec, cracked, viewWaitSec, crackCodes, crackShownAiSec, selectionAtCrack,
  }));
  return () => {
    offs.forEach((off) => off());
    offTick();
    offReset();
    storeRef = null;
    mounted = false;
  };
}
