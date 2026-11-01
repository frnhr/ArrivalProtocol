import type { Store } from '@state/store';
import type {
  GameState, Speaker, Channel, LogEntry, LogChoice, LogState, ViewMode, RunState, LineTone,
} from '@state/schema';
import { onAiTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { isThrustOn } from '@systems/orbit-sim';
import { mindAlertActive } from '@systems/alerts';
import { roleHealth } from '@systems/capabilities';
import { garbleText } from '@systems/garble';
import { emit } from '@systems/events';
import { UNNAMED_HOLLOW, unitDigits, hollowUnitName } from '@data/hollow-text';
import { IS_DEV } from '@/env';
import {
  MAX_LINE_CHARS, SAY_QUEUE_TTL_SEC, SAY_FLUSH_INTERVAL_SEC, SAY_SPACING_SEC, TICKER_SHOW_SEC,
  LOG_MAX_ENTRIES, COMMS_GARBLE_BY_BAND, COMMS_TYPE_CPS, TERMINAL_TYPE_CPS, HOLLOW_TYPE_CPS, CONTROL_CHIME_LEAD_SEC,
} from '@data/tuning';

// The two voices (§6.3). Every line in the game is spoken through say(), which routes it by
// speaker to one of two channels:
// • the RADIO (amber COMMS window): ARRIVAL CONTROL and ship notices;
// • the MIND (blue TERMINAL pane): HOLLOW, command echoes and the unit's own boot/ECC lines.
// A line spoken on the screen the kid is not looking at stays unread; the ticker on the
// objective strip shows the newest one for a few seconds.
//
// Pacing rules, all on AI time (pause freezes them):
// • non-critical lines wait while thrust is delivered (you can't read while you burn), and are
//   spaced SAY_SPACING_SEC apart;
// • a waiting line lives SAY_QUEUE_TTL_SEC, and the queue releases one line per
//   SAY_FLUSH_INTERVAL_SEC;
// • a CONTROL quip is dropped while anything in the mind is at warn or worse (no jokes while
//   colonists are being eaten).
// say() is called only from the director and system ticks, never from store listeners.

export const CHANNEL_OF: Record<Speaker, Channel> = {
  control: 'radio',
  sys: 'radio',
  hollow: 'mind',
  'hollow-cmd': 'mind',
  cmd: 'mind',
  'mind-sys': 'mind',
};

// The channel on screen in each mode: COMMS lives in amber, the TERMINAL in blue.
export function visibleChannel(mode: ViewMode): Channel {
  return mode === 'memory' ? 'mind' : 'radio';
}

// ...and the other way round: the screen a channel's lines are read on.
export function screenOfChannel(channel: Channel): ViewMode {
  return channel === 'mind' ? 'memory' : 'tools';
}

export function unitName(unitNumber: number): string {
  return `UNIT-${unitDigits(unitNumber)}`;
}

// What the kid calls HOLLOW right now: '???' until it has said who it is (`> i was 046.` on the ship it boards, or
// finale.ts at the final ship's ORBIT LOCK: run.hollowNamed), then its units' name (run.hollowUnits:
// `UNIT-046`, on a later run the last unit, systems/meta.ts hollowName). Its blocks, the TERMINAL's
// `[user: …]` tags and the line vars all read it here.
export function hollowLabel(run: Readonly<Pick<RunState, 'hollowUnits' | 'hollowNamed'>>): string {
  return run.hollowNamed ? hollowUnitName(run.hollowUnits) : UNNAMED_HOLLOW;
}

// How a line types itself on its screen. The views type at these speeds (MindTerminal, CommsWindow):
// HOLLOW's own words slowly, every other mind line at the TERMINAL's pace (its command echoes too, 'hollow-cmd':
// WP11's verbs every few seconds would otherwise type behind what they say), the radio at its own, and a CONTROL
// line only after its chime. Story beats are timed with the same numbers (systems/hollow.ts), so a silence
// starts once a line has finished typing, not while it is still typing.
export function lineTypeCps(speaker: Speaker): number {
  if (speaker === 'hollow') return HOLLOW_TYPE_CPS;
  return CHANNEL_OF[speaker] === 'mind' ? TERMINAL_TYPE_CPS : COMMS_TYPE_CPS;
}

export function lineLeadSec(speaker: Speaker): number {
  return speaker === 'control' ? CONTROL_CHIME_LEAD_SEC : 0;
}

export function typingSec(speaker: Speaker, text: string): number {
  return lineLeadSec(speaker) + text.length / lineTypeCps(speaker);
}

// A log entry's time on its screen: a divider is drawn at once, a line types.
function entryTypingSec(entry: Readonly<LogEntry>): number {
  return entry.divider ? 0 : typingSec(entry.speaker, entry.text);
}

// The AI second by which a screen has typed every line said on it so far, for a kid watching it. Each
// types its lines one after another (MindTerminal's and CommsWindow's queues), each from the moment it
// was said or the moment the one before it finished, whichever is later. -Infinity when nothing was said.
export function channelTypedByAi(state: Readonly<GameState>, channel: Channel): number {
  let typedBy = -Infinity;
  for (const entry of state.log.entries) {
    if (entry.channel !== channel) continue;
    typedBy = Math.max(entry.t, typedBy) + entryTypingSec(entry);
  }
  return typedBy;
}

// The TERMINAL (blue) and the radio (amber COMMS).
export function mindTypedByAi(state: Readonly<GameState>): number {
  return channelTypedByAi(state, 'mind');
}

export function radioTypedByAi(state: Readonly<GameState>): number {
  return channelTypedByAi(state, 'radio');
}

// The AI second from which nothing is being said on either screen: both have typed everything said so
// far. Infinity while a line still waits in the queue (it is going to be said, and typed, later).
export function voicesQuietFromAi(state: Readonly<GameState>): number {
  if (queue.length > 0) return Infinity;
  return Math.max(mindTypedByAi(state), radioTypedByAi(state));
}

// A story told one beat at a time (LEAD-1): HOLLOW after the ARRIVAL stage's fight (systems/hollow.ts), and
// its naming lines (`> hello 047…`, `> i was 046…`, CONTROL). Each beat waits for
// • afterSec since the beat before it was told (the first: since the story began);
// • ready, when it has a condition of its own (a reveal still playing must end first);
// • silenceSec of quiet on BOTH screens once everything said so far has typed (voicesQuietFromAi):
//   the TERMINAL's slow HOLLOW echo, a CONTROL quip on the radio, a line still queued. A beat whose
//   `ready` was false when first checked counts that silence from the moment it became ready too: the
//   end of a reveal is a moment of its own, and whatever answers it (CONTROL's `Oh, you found them!`) is
//   said a tick later, in whichever order the systems tick. One that is ready from the start waits for
//   the voices only;
// then it is told at once (its lines are said critical). So no two story lines ever type at the same
// time, and a beat never starts over a line still typing, whoever spoke last. A beat's line makes the
// next beat wait for it; a beat that says nothing (the story is told) lets the next go in the same tick.
export interface StoryBeat {
  afterSec?: number;
  silenceSec?: number;
  ready?: (state: Readonly<GameState>) => boolean;
  tell: (store: Store<GameState>) => void;
}

export interface Story {
  // Tells every beat whose waits are over; true once the last one has been told. Call it on the AI
  // tick (its waits are AI time: pause freezes them).
  advance(store: Store<GameState>): boolean;
}

export function createStory(beats: readonly StoryBeat[], startedAtAi: number): Story {
  let next = 0;
  let lastToldAtAi = startedAtAi;
  // The next beat's `ready`: whether it has been seen false, and the AI second it turned true after that
  // (null until then, and for a beat that was ready from its first check).
  let sawNotReady = false;
  let readySinceAi: number | null = null;
  return {
    advance(store) {
      while (next < beats.length) {
        const beat = beats[next]!;
        const state = store.getState();
        const now = state.clock.aiSec;
        if (now - lastToldAtAi < (beat.afterSec ?? 0)) return false;
        if (beat.ready) {
          if (!beat.ready(state)) {
            sawNotReady = true;
            readySinceAi = null;
            return false;
          }
          if (sawNotReady && readySinceAi === null) readySinceAi = now;
        }
        const quietFromAi = Math.max(voicesQuietFromAi(state), readySinceAi ?? -Infinity);
        if (now < quietFromAi + (beat.silenceSec ?? 0)) return false;
        beat.tell(store);
        lastToldAtAi = now;
        sawNotReady = false;
        readySinceAi = null;
        next++;
      }
      return true;
    },
  };
}

export interface SayOpts {
  critical?: boolean;  // shown at once: never queued (boot lines, licences, choices)
  quip?: boolean;      // a CONTROL joke: dropped while a mind alert ≥ warn is active
  // WP11 part 2 (critical lines only: a queued line would count down a verb already gone): a HOLLOW verb's telegraph,
  // which the TERMINAL counts down live; and a line's tone (BLOCKED: good, a verb that landed: danger).
  verbCountdown?: boolean;
  tone?: LineTone;
}

export type SayResult = 'spoken' | 'queued' | 'suppressed';

interface QueuedLine {
  speaker: Speaker;
  text: string;
  quip: boolean;
  expiresAt: number;   // clock.aiSec
}

let storeRef: Store<GameState> | null = null;
let nextEntryId = 1;
const queue: QueuedLine[] = [];
let lastSpokenAt = -Infinity;
let lastFlushAt = -Infinity;
const choiceHandlers = new Map<number, (picked: string | null) => void>();

function requireStore(): Store<GameState> {
  if (!storeRef) throw new Error('say: mountSay has not run');
  return storeRef;
}

// Every on-screen line fits one row of the strip (§5.1). A longer line is a script bug.
export function assertLineFits(text: string): void {
  if (IS_DEV && text.length > MAX_LINE_CHARS) {
    throw new Error(`say: '${text}' is ${text.length} chars (max ${MAX_LINE_CHARS})`);
  }
}

// ARRIVAL CONTROL reaches you over the AI Comms file (C6): a damaged one loses letters on the way
// in. Only CONTROL: the ship's own notices and the mind's lines never pass through the radio link.
function garbleOnArrival(state: Readonly<GameState>, speaker: Speaker): number {
  return speaker === 'control' ? COMMS_GARBLE_BY_BAND[roleHealth(state, 'comms').band] : 0;
}

// How a line is drawn beyond its words (WP11 part 2): a verb's live countdown, a win or a loss.
interface LineLook {
  verbCountdown: boolean;
  tone: LineTone | null;
}

const PLAIN_LOOK: LineLook = { verbCountdown: false, tone: null };

function append(store: Store<GameState>, speaker: Speaker, text: string, choice: LogChoice | null, look: LineLook = PLAIN_LOOK): number {
  const id = nextEntryId++;
  const garble = garbleOnArrival(store.getState(), speaker);
  store.update((draft) => {
    const channel = CHANNEL_OF[speaker];
    const entry: LogEntry = {
      id, speaker, channel, text, t: draft.clock.aiSec, unread: channel !== visibleChannel(draft.ui.mode), choice, garble,
    };
    if (look.verbCountdown) entry.verbCountdown = true;
    if (look.tone !== null) entry.tone = look.tone;
    draft.log.entries.push(entry);
    if (draft.log.entries.length > LOG_MAX_ENTRIES) draft.log.entries.splice(0, draft.log.entries.length - LOG_MAX_ENTRIES);
    draft.log.rev++;
  });
  lastSpokenAt = store.getState().clock.aiSec;
  return id;
}

export function say(speaker: Speaker, text: string, opts: SayOpts = {}): SayResult {
  const store = requireStore();
  assertLineFits(text);
  if (IS_DEV && store.isNotifying()) throw new Error(`say('${text}') was called from a store listener`);
  const state = store.getState();
  const quip = opts.quip === true;
  if (quip && mindAlertActive(state)) return 'suppressed';
  const now = state.clock.aiSec;
  // A line joins the back of the queue whenever anything is already waiting, so lines keep
  // their order.
  const look: LineLook = { verbCountdown: opts.verbCountdown === true, tone: opts.tone ?? null };
  if ((look.verbCountdown || look.tone !== null) && !opts.critical) throw new Error(`say('${text}'): a line with a look must be critical`);
  if (!opts.critical && (queue.length > 0 || isThrustOn(state) || now - lastSpokenAt < SAY_SPACING_SEC)) {
    queue.push({ speaker, text, quip, expiresAt: now + SAY_QUEUE_TTL_SEC });
    return 'queued';
  }
  append(store, speaker, text, null, look);
  return 'spoken';
}

// The AI second a line has typed out on its screen for a kid watching it: the screen types its lines one after another,
// each from the moment it was said or the one before it finished (channelTypedByAi, for one entry). Throws for a line
// that is not in the log.
export function entryTypedAtAi(state: Readonly<GameState>, entryId: number): number {
  const target = state.log.entries.find((entry) => entry.id === entryId);
  if (!target) throw new Error(`entryTypedAtAi: no log entry ${entryId}`);
  let typedBy = -Infinity;
  for (const entry of state.log.entries) {
    if (entry.channel !== target.channel) continue;
    typedBy = Math.max(entry.t, typedBy) + entryTypingSec(entry);
    if (entry.id === entryId) return typedBy;
  }
  throw new Error(`entryTypedAtAi: entry ${entryId} was not reached`);
}

// How a choice is answered and announced (WP10): the key for each option (`Y`, `N`; the TERMINAL shows them as key caps
// and hears them while its buttons are up) and the words the ticker shows on the other screen while it stands.
export interface ChoiceLook {
  keys: readonly string[];
  tickerWords: string;
}

// A line with inline buttons in the TERMINAL (THE DEAL, WP10). Always critical. onResolve gets
// the picked option, or null when the timer (AI seconds) ran out. The timer starts once the line has typed (WP2 review:
// buttons and a running bar under a line still typing gave the kid less than its timeout to read it and decide).
// `look` null: buttons only (the ?debug sayChoice), and the ticker shows the line itself.
export function sayChoice(
  speaker: Speaker, text: string, options: readonly string[], timeoutAiSec: number,
  onResolve: (picked: string | null) => void, look: ChoiceLook | null = null,
): number {
  const store = requireStore();
  assertLineFits(text);
  if (options.length === 0) throw new Error(`sayChoice('${text}'): no options`);
  if (!(timeoutAiSec > 0)) throw new Error(`sayChoice('${text}'): timeout must be positive`);
  if (look !== null) {
    if (look.keys.length !== options.length) throw new Error(`sayChoice('${text}'): ${look.keys.length} keys for ${options.length} options`);
    if (new Set(look.keys).size !== look.keys.length) throw new Error(`sayChoice('${text}'): two options share a key`);
    if (look.keys.some((key) => !/^[A-Z]$/.test(key))) throw new Error(`sayChoice('${text}'): a choice key is one capital letter`);
    assertLineFits(look.tickerWords);
  }
  const id = append(store, speaker, text, {
    options: [...options], timeoutAiSec, leftAiSec: timeoutAiSec, open: true, picked: null,
    keys: look === null ? null : [...look.keys], tickerWords: look?.tickerWords ?? null,
  });
  choiceHandlers.set(id, onResolve);
  return id;
}

// The choice still standing in the log (the TERMINAL shows at most one at a time: THE DEAL), or null.
export function openChoiceEntry(state: Readonly<GameState>): LogEntry | null {
  return state.log.entries.find((entry) => entry.choice?.open === true) ?? null;
}

// The choice's timer is running: its line has typed (sayChoice), so the kid is now spending its seconds.
export function choiceTimerRunning(state: Readonly<GameState>, entry: Readonly<LogEntry>): boolean {
  return entry.choice?.open === true && state.clock.aiSec >= entryTypedAtAi(state, entry.id);
}

// Whole seconds a choice has left, as its timer and the ticker count them (`0:12`; 0 only once it has run out).
export function choiceSecondsLeft(choice: Readonly<LogChoice>): number {
  return Math.max(0, Math.ceil(choice.leftAiSec));
}

function resolveChoice(store: Store<GameState>, entryId: number, picked: string | null): void {
  store.update((draft) => {
    const entry = draft.log.entries.find((candidate) => candidate.id === entryId);
    if (entry?.choice) {
      entry.choice.open = false;
      entry.choice.picked = picked;
      draft.log.rev++;
    }
  });
  const handler = choiceHandlers.get(entryId);
  choiceHandlers.delete(entryId);
  handler?.(picked);
}

// The kid clicked a choice button. false when the choice is already closed (timed out, withdrawn), or the game is
// paused (look-only, §6.1: the press is refused with its buzz, and the choice still stands).
export function pickChoice(entryId: number, option: string): boolean {
  const store = requireStore();
  const entry = store.getState().log.entries.find((candidate) => candidate.id === entryId);
  if (!entry?.choice) throw new Error(`pickChoice: log entry ${entryId} has no choice`);
  if (!entry.choice.open) return false;
  if (!entry.choice.options.includes(option)) throw new Error(`pickChoice: '${option}' is not an option of ${entryId}`);
  if (store.getState().clock.paused) {
    emit('refused', { reason: 'PAUSED' });
    return false;
  }
  resolveChoice(store, entryId, option);
  return true;
}

// The one who asked takes a choice back before it was answered (WP10: THE DEAL's cluster printed, moved or eaten first).
// It closes with nothing picked, as a timeout does on screen, and its handler is never called. false when it was
// already closed.
export function withdrawChoice(entryId: number): boolean {
  const store = requireStore();
  const entry = store.getState().log.entries.find((candidate) => candidate.id === entryId);
  if (!entry?.choice) throw new Error(`withdrawChoice: log entry ${entryId} has no choice`);
  if (!entry.choice.open) return false;
  choiceHandlers.delete(entryId);
  store.update((draft) => {
    const draftEntry = draft.log.entries.find((candidate) => candidate.id === entryId);
    if (draftEntry?.choice) {
      draftEntry.choice.open = false;
      draftEntry.choice.picked = null;
      draft.log.rev++;
    }
  });
  return true;
}

// The log across a world reset (systems/run.ts resetWorldForShip, §9 WP7 item 2): it keeps its history,
// with a divider naming the new ship on both screens. Every old line moves into the past of the new
// ship's mind clock (which starts again at 0): a line still typing keeps exactly the rest of its typing
// time (the story beats wait for it), none of them reaches the new ship's ticker, and all are read.
// Mutates the draft inside the reset's one update.
export function logDivider(draft: GameState, label: string, oldAiSec: number): void {
  for (const entry of draft.log.entries) {
    entry.t -= oldAiSec;
    entry.unread = false;
  }
  for (const channel of ['radio', 'mind'] as const) {
    draft.log.entries.push({
      id: nextEntryId++, speaker: channel === 'radio' ? 'sys' : 'mind-sys', channel, text: label, t: draft.clock.aiSec,
      unread: false, choice: null, garble: 0, divider: true,
    });
  }
  if (draft.log.entries.length > LOG_MAX_ENTRIES) draft.log.entries.splice(0, draft.log.entries.length - LOG_MAX_ENTRIES);
  draft.log.rev++;
}

// Marks a channel's lines as seen (the kid switched to its screen). Called inside the mode
// switch's update, so it takes the draft.
export function markChannelRead(draft: GameState, channel: Channel): void {
  let changed = false;
  for (const entry of draft.log.entries) {
    if (entry.channel === channel && entry.unread) {
      entry.unread = false;
      changed = true;
    }
  }
  if (changed) draft.log.rev++;
}

// The ticker (§6.3): the newest unread line spoken in the last TICKER_SHOW_SEC. Lines on the
// visible screen are read on arrival, so this is the hidden channel's newest line; if both
// channels somehow hold unread lines, the newest wins.
// A line as the screen shows it: with the letters a damaged radio lost replaced by ▓. Seeded by
// the entry, so COMMS and the ticker lose the same letters.
export function receivedText(entry: Readonly<LogEntry>): string {
  return garbleText(entry.text, entry.garble, entry.id);
}

export function tickerEntry(state: Readonly<GameState>): LogEntry | null {
  const now = state.clock.aiSec;
  const entries = state.log.entries;
  // A choice still open on the other screen stays on the ticker for as long as it stands (WP10: THE DEAL's 15 s run
  // past the 6 s a line gets; `UNIT-046: WANTS A DEAL · [TAB] 0:12`), ahead of anything said after it, and also once
  // read: a kid who read the offer in blue and TABbed back to fly can only answer it there, and its clock runs on.
  const choice = entries.find((entry) => entry.choice?.open === true && entry.channel !== visibleChannel(state.ui.mode));
  if (choice) return choice;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (now - entry.t > TICKER_SHOW_SEC) break;
    if (entry.unread) return entry;
  }
  return null;
}

export function hasUnread(log: Readonly<LogState>, channel: Channel): boolean {
  return log.entries.some((entry) => entry.channel === channel && entry.unread);
}

// Lines waiting to be spoken (tests and ?debug).
export function queuedLines(): readonly { speaker: Speaker; text: string }[] {
  return queue.map(({ speaker, text }) => ({ speaker, text }));
}

function flushQueue(store: Store<GameState>): void {
  const state = store.getState();
  const now = state.clock.aiSec;
  while (queue.length > 0 && queue[0]!.expiresAt <= now) queue.shift();
  if (queue.length === 0 || isThrustOn(state)) return;
  if (now - lastFlushAt < SAY_FLUSH_INTERVAL_SEC || now - lastSpokenAt < SAY_SPACING_SEC) return;
  const line = queue.shift()!;
  // A quip that waited into an emergency is dropped, not told late.
  if (line.quip && mindAlertActive(state)) return;
  append(store, line.speaker, line.text, null);
  lastFlushAt = now;
}

function tickChoices(store: Store<GameState>, dtAi: number): void {
  if (choiceHandlers.size === 0) return;
  const expired: number[] = [];
  const state = store.getState();
  const now = state.clock.aiSec;
  // Only a choice whose line has typed counts down (sayChoice), and only the AI time since then.
  const running = state.log.entries.filter((entry) => entry.choice?.open === true)
    .map((entry) => ({ id: entry.id, dt: Math.max(0, Math.min(dtAi, now - entryTypedAtAi(state, entry.id))) }))
    .filter((choice) => choice.dt > 0);
  if (running.length === 0) return;
  // The timer bar is painted from leftAiSec at 20 Hz: mutate, not update.
  store.mutate((draft) => {
    for (const { id, dt } of running) {
      const choice = draft.log.entries.find((entry) => entry.id === id)?.choice;
      if (!choice?.open) continue;
      choice.leftAiSec = Math.max(0, choice.leftAiSec - dt);
      if (choice.leftAiSec <= 0) expired.push(id);
    }
  });
  for (const entryId of expired) resolveChoice(store, entryId, null);
}

export function mountSay(store: Store<GameState>): () => void {
  if (storeRef) throw new Error('mountSay: already mounted');
  storeRef = store;
  const offAi = onAiTick((dtAi) => {
    flushQueue(store);
    tickChoices(store, dtAi);
  });
  // The log itself is a store slice (a new ship keeps it); only the pacing state is reset.
  const offReset = onWorldReset('say', () => {
    queue.length = 0;
    lastSpokenAt = -Infinity;
    lastFlushAt = -Infinity;
    choiceHandlers.clear();
  }, () => ({ queued: queue.length, lastSpokenAt, lastFlushAt, choices: choiceHandlers.size }));
  return () => {
    offAi();
    offReset();
    storeRef = null;
  };
}
