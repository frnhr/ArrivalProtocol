import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { RunLogState } from '@state/schema';
import { logDisplayName, bookShape, rootEntryLines } from '@state/log-selectors';
import { onPostTick } from '@systems/clock';
import { onWorldReset } from '@systems/reset';
import { on } from '@systems/events';
import { say } from '@systems/say';
import { playsTutorial } from '@systems/meta';
import { FRESH_UNIT_CHARGE } from '@data/memory';
import { LOG_NAME, LOG_DESC, LOG_TEXT } from '@data/log-text';
import { bookDesc } from '@data/log-books';

// 046.log through the run (docs/phase3/05-story.md §3.2, §3.5; slice-2-plan §1.1 items 14–15), stateful: the keys found
// at the boots (`> 046.log · KEY FOUND · ENTRY 0n`), the SCAN reaction (the header, CONTROL's ignore line, the file
// renamed `046.log`), the reader opening by itself on entry 01 after ship 1's LANDING REPORT (run 1, once), and entry
// 12 typing from the root at its last block. Track OPENING owns this file; it reacts to run.phase changes and events,
// so systems/run.ts needs no edit for it. The pure rules (createRunLog, logKnown, logEntriesAtBoot) are
// state/log-selectors.ts's.

// --- The LOG READER's actions (05 §4): story-log opens it, the reader view (Track UI) closes it and records what it typed.

// Slice 7c (R37): by the run's book (state/log-selectors.ts bookShape; every book is 046.log until LINEAGE_BUILT).
function assertEntry(log: Readonly<RunLogState>, entry: number, who: string): void {
  const count = bookShape(log.book).count;
  if (!(Number.isInteger(entry) && entry >= 1 && entry <= count)) throw new Error(`${who}: no entry ${entry} in a ${count}-entry log`);
}

// Opens the reader on `entry` (ui.logReader). An entry the run has not found yet can't be opened: the reader shows it as
// `[NOT FOUND YET]` in its rows, but never opens on it.
export function openLogReader(store: Store<GameState>, entry: number): void {
  assertEntry(store.getState().run.log, entry, 'openLogReader');
  if (!store.getState().run.log.found.includes(entry)) throw new Error(`openLogReader: entry ${entry} is not found yet`);
  store.update((draft) => { draft.ui.logReader = { entry }; });
}

export function closeLogReader(store: Store<GameState>): void {
  if (store.getState().ui.logReader === null) return;
  store.update((draft) => { draft.ui.logReader = null; });
}

// The reader typed an entry out (it types itself the first time, 05 §4): run.log.read records it, so the chip's glow and
// the idle line know it is read. Once per entry; a found entry only.
export function markLogEntryRead(store: Store<GameState>, entry: number): void {
  const log = store.getState().run.log;
  assertEntry(log, entry, 'markLogEntryRead');
  if (!log.found.includes(entry)) throw new Error(`markLogEntryRead: entry ${entry} is not found yet`);
  if (log.read.includes(entry)) return;
  store.update((draft) => { draft.run.log.read.push(entry); });
}

// --- The mount: keys, the SCAN reaction, entry 01 after the first landing, entry 12 from the root ----------------------

// A pod has come down on the ship being flown (entry 01's key: `FIRST LANDING`).
function podDown(state: Readonly<GameState>): boolean {
  return state.landing.pods.some((record) => record.fate.kind === 'down');
}

// Entry 01 opens when the first LANDING REPORT with a pod down closes (05 §3.5: "Ship 1's report closes"): LEAVE ORBIT is up
// (playtest 1, note 5: the first screen after the report; the TRANSMIT screen before it) and the ship's landing, still in
// the store until the beam, landed someone. On the fixed five that is
// ship 1's, unless ship 1 landed nobody (a later ship's first landing is the key then: 05 keys it to "your first
// landing", not to a ship).
function firstLandingKeyDue(state: Readonly<GameState>): boolean {
  return state.run.phase === 'leave' && !state.run.log.found.includes(1) && podDown(state);
}

// Entry 12 types from the root at its last block (05 §3.5: `> 047. wait.`, then entry 12): finale.ts rootGone moves the
// duel to its choice in the AI tick, after HOLLOW's last words, and this post tick follows it.
function rootKeyDue(state: Readonly<GameState>): boolean {
  return state.hollow.finale.phase === 'step1' && state.hollow.finale.rootFell && !state.run.log.found.includes(bookShape(state.run.log.book).root);
}

// The log's chip says what the run knows (logKnown): `???`, or the book's name (`046.log`, `031.log`, `047.log`) from the SCAN
// or the first key on, with its book's description (slice 7c, R37).
function syncLogName(store: Store<GameState>): void {
  const state = store.getState();
  const name = logDisplayName(state.run.log);
  const index = state.memory.findIndex((seg) => seg.type === 'log');
  const seg = state.memory[index];
  if (seg === undefined || seg.type !== 'log' || seg.name === name) return;
  const desc = name === LOG_NAME.unknown ? LOG_DESC.unknown : bookDesc(state.run.log.book);
  store.update((draft) => {
    const live = draft.memory[index];
    if (live === undefined || live.type !== 'log') throw new Error('story-log: the log segment moved during its rename');
    live.name = name;
    live.desc = desc;
    draft.ui.memoryRev++;
  });
}

let mounted = false;
// Events since the last post tick (listeners never update the store: systems/events.ts).
let keysHeard: number[] = [];
let scanHeard = false;

function resetStoryLog(): void {
  keysHeard = [];
  scanHeard = false;
}

function step(store: Store<GameState>): void {
  const state = store.getState();
  const log = state.run.log;
  const keys = [...new Set(keysHeard)].filter((entry) => !log.found.includes(entry));
  const scan = scanHeard && !log.scanned;
  resetStoryLog();
  const entry01 = firstLandingKeyDue(state);
  const entry12 = rootKeyDue(state);
  // On run 1 entry 01 opens the reader by itself, once (05 §3.2); a returning unit's chip just glows (Track UI).
  const autoOpen = entry01 && playsTutorial(state.run) && !log.autoOpened;
  if (keys.length > 0 || scan || entry01 || entry12) {
    for (const entry of keys) assertEntry(log, entry, 'story-log log-key');
    store.update((draft) => {
      const found = draft.run.log.found;
      found.push(...keys);
      if (entry01) found.push(1);
      if (entry12) found.push(bookShape(draft.run.log.book).root);
      found.sort((a, b) => a - b);
      if (scan) draft.run.log.scanned = true;
      if (autoOpen) draft.run.log.autoOpened = true;
    });
  }
  // The first SCAN (05 §3.5): the op has echoed the header; CONTROL answers it, once a run.
  if (scan) say('control', LOG_TEXT.control, { critical: true });
  if (entry12) {
    const lines = rootEntryLines(state.run.log, { charge: FRESH_UNIT_CHARGE });
    for (const line of lines) say('hollow', LOG_TEXT.rootLine(line), { critical: true });
  }
  if (autoOpen) openLogReader(store, 1);
  syncLogName(store);
}

// Mount after the run (main.ts does): it reacts to run.phase and to the boot's and SCAN's events, so systems/run.ts needs
// no edit for it.
export function mountStoryLog(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountStoryLog: already mounted');
  mounted = true;
  const offKey = on('log-key', ({ entries }) => { keysHeard.push(...entries); });
  const offScan = on('log-scanned', () => { scanHeard = true; });
  const offTick = onPostTick(() => step(store));
  const offReset = onWorldReset('story-log', resetStoryLog, () => ({ keysHeard, scanHeard }));
  return () => { offKey(); offScan(); offTick(); offReset(); resetStoryLog(); mounted = false; };
}
