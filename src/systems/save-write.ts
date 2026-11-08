// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SavePoint, BootParts, SaveState, RunSave, SaveRefusal } from '@/types/save';
import type { StorageProvider } from '@systems/storage';
import type { Meta } from '@systems/meta';
import { archiveMeta } from '@systems/meta';
import { emit, NO_PAYLOAD } from '@systems/events';
import { abortAll } from '@systems/ops-core';
import { buildRunSave, encodeRunSave, decodeRunSave, saveRefusal } from '@systems/save-codec';
import { RUN_SAVE_KEY } from '@data/tuning';

// The page's run save, the live half (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.1 "Storage"): one session
// `{ provider, status }` mirroring the archive's. The status goes ok → offline on the first read or write that throws
// (QuotaExceeded included) and on a save that can't be built or encoded (a bug, said loudly on the console): nothing more
// is written this page and 'save-lost' is emitted (a TERMINAL line, a buzz, the footer's NO SAVE), and play goes on. A
// headless world (GameState.save.status 'none') never writes, so the suites are untouched.
// A leaf below run.ts and boot.ts (slice 3c foundation deviation, the plan's cycle guard): they call writeRunSave at the
// points; resume and abandon (systems/run-save.ts) import run.ts, never the other way.
//
// Two tabs (documented, as the archive's): each tab writes the one slot whole, and the last write wins. The other tab's
// run then reads as stale on its next page open (the archive's run in progress is the tab that wrote it last, or none),
// so that tab gets RUN SAVE CAN'T RESUME · THAT RUN ALREADY ENDED and ABANDON RUN, never someone else's run.
//
// Ironman's seams (3c plan §1.3, not built): writeRunSave is the one entry point (ironman adds a 'tab-hidden' point), and
// the stale rule below is not a rewind guard; ironman's later check is `resume.depth >= activeRun.trail.stops.length`.

interface SaveSession {
  provider: StorageProvider;
  status: 'ok' | 'offline';
  // The save read at the page's open that the title offers to RESUME (systems/run-save.ts resumeRun takes it), or null.
  pending: RunSave | null;
}

let session: SaveSession | null = null;

const OK_NONE: SaveState = { status: 'ok', resume: null, refusal: null };

// Opens the page's run save (state/instance.ts, after openRunArchive and before the store exists): reads RUN_SAVE_KEY,
// decodes it (save-codec decodeRunSave) and checks it against the archive (saveRefusal; `meta` null: the archive can't be
// read). Returns the SaveState the store starts with: 'ok' with the RESUME line, 'ok' with none (nothing saved),
// 'cant-resume' with the reason (the detail on the console only), or 'offline' (the read threw: nothing will be written
// this page).
export function openRunSave(provider: StorageProvider, meta: Readonly<Meta> | null): SaveState {
  let raw: string | null;
  try {
    raw = provider().getItem(RUN_SAVE_KEY);
  } catch (error) {
    session = { provider, status: 'offline', pending: null };
    console.error(`[run save] offline: the read failed (${(error as Error).message})`);
    return { status: 'offline', resume: null, refusal: null };
  }
  session = { provider, status: 'ok', pending: null };
  if (raw === null) return OK_NONE;
  const decoded = decodeRunSave(raw);
  const refusal: SaveRefusal | null = decoded.ok ? saveRefusal(decoded.save, meta) : decoded.refusal;
  if (refusal !== null) {
    console.error(`[run save] can't resume (${refusal.kind}): ${refusal.detail}`);
    return { status: 'cant-resume', resume: null, refusal };
  }
  if (!decoded.ok) throw new Error('openRunSave: a refused save without a refusal');
  session.pending = decoded.save;
  return { status: 'ok', resume: structuredClone(decoded.save.resume), refusal: null };
}

// The save the title offers to RESUME (read at the page's open), or null: systems/run-save.ts takes it, the page's first
// title is built from it (state/instance.ts).
export function pendingRunSave(): Readonly<RunSave> | null {
  return session?.pending ?? null;
}

// The pending save is used (resumed) or set aside (abandoned): the title no longer offers it.
export function takePendingRunSave(): RunSave | null {
  if (session === null) return null;
  const pending = session.pending;
  session.pending = null;
  return pending;
}

// Forgets the page's run save (headless suites between scenarios).
export function closeRunSave(): void {
  session = null;
}

// The page's save session's status ('none': no session, a headless world).
export function runSaveSessionStatus(): 'none' | 'ok' | 'offline' {
  return session === null ? 'none' : session.status;
}

// A read, write or remove threw, a save could not be built, or the archive can't vouch for one: OFFLINE for the rest of the
// page, said once ('save-lost': a TERMINAL line, a buzz, the footer's NO SAVE). The slot is emptied too (review fix M2: the
// last save written stayed behind, so a reload resumed an older point of this run, or after a NEW RUN met a save of a run
// the archive had moved past); when even that throws, the line says a reload may go back ('save-stale').
function goOffline(store: Store<GameState> | null, why: string, error: unknown): void {
  const wasOk = session !== null && session.status === 'ok';
  console.error(`[run save] offline: ${why}`, error ?? '');
  let staleLeft = false;
  if (session !== null) {
    session.status = 'offline';
    session.pending = null;
    try {
      session.provider().removeItem(RUN_SAVE_KEY);
    } catch (removeError) {
      staleLeft = true;
      console.error('[run save] the last save could not be removed either: a reload may resume it', removeError);
    }
  }
  if (store !== null && store.getState().save.status !== 'none') {
    store.update((draft) => { draft.save = { status: 'offline', resume: null, refusal: null }; });
  }
  if (wasOk) emit(staleLeft ? 'save-stale' : 'save-lost', NO_PAYLOAD);
}

// Whether a save point writes now (the one gate every point goes through): the page has a working save (not 'none' in a
// headless world, not 'offline' or 'cant-resume'). The archive must vouch for
// it (a save is resumed only when the archive's run in progress is its run, so one written while the archive is corrupt,
// played without or offline could never be resumed): while it can't, the save goes OFFLINE here, the one place it mirrors
// the archive (review fix M1: saves used to stop silently, with no NO SAVE and no TERMINAL line).
function writable(store: Store<GameState>): boolean {
  const state = store.getState();
  if (state.save.status !== 'ok' || session === null || session.status !== 'ok') return false;
  if (state.archive.status === 'ok') return true;
  goOffline(store, `the archive is ${state.archive.status}: a save it can't vouch for could never be resumed`, null);
  return false;
}

// The one entry point for every save point (3c plan §1.3: ironman later adds a 'tab-hidden' point here): builds the save
// (save-codec buildRunSave), encodes it and writes it whole over the last one. `boot`: the BEAM and RUN START points' racks
// and verdict (the store no longer holds them once the ship is built), null at the world points. A no-op unless the page
// can write a save (writable).
// A save that can't be built or encoded (a point called at the wrong moment, a non-finite number) is a bug: the console
// says it loudly with the stack, and the save goes OFFLINE like a write that threw, so play goes on and the kid is told.
export function writeRunSave(store: Store<GameState>, point: SavePoint, boot: Readonly<BootParts> | null = null): void {
  if (!writable(store) || session === null) return;
  let raw: string;
  try {
    raw = encodeRunSave(buildRunSave(store.getState(), point, archiveMeta().runs, boot, Date.now()));
  } catch (error) {
    goOffline(store, `the ${point} save could not be built (a bug): ${(error as Error).message}`, error);
    return;
  }
  try {
    session.provider().setItem(RUN_SAVE_KEY, raw);
  } catch (error) {
    goOffline(store, `the ${point} write failed (${(error as Error).message})`, error);
  }
}

// A finale that has decided how the run ends (slice 7a: 'done', systems/ending-rules.ts finaleRunCause's four).
const DECIDED: readonly GameState['hollow']['finale']['phase'][] = ['done'];

// ENDING CHOSEN (3c plan §2.1, risk 1; systems/landing.ts as the final LANDING REPORT opens with a decided finale): every op
// stops first (none may write into memory under the save, and none is running in the resumed world), no free block is left
// reserved by one, then the save. `flushOwed` says anything the finale still owed the radio (systems/finale.ts
// sayOwedVerdict: CONTROL's verdict waits for the typed ending, and a resumed world has no module state to say it from), so
// the save's log has it. The clock stays as it was (the report's own pause rule). Slice 7a keeps it here, after THE LAST
// LANDING, not at step 2's confirm (slice-7-plan R14: a save there would resume into a landing in progress).
// Only when a save will be written (review fix, minor 3): with no save this page (headless, offline) none
// of it runs, and the finale says its verdict in its own time. A block still reserved after the abort is a bug: said on the
// console, and the save goes OFFLINE rather than crash the final LANDING REPORT.
export function writeEndingChosen(store: Store<GameState>, flushOwed: (store: Store<GameState>) => void): void {
  if (!DECIDED.includes(store.getState().hollow.finale.phase) || !writable(store)) return;
  abortAll();
  const reserved = store.getState().memory.filter((seg) => seg.type === 'free' && seg.reservedBy !== undefined);
  if (reserved.length > 0) {
    goOffline(store, `ENDING CHOSEN: ${reserved.length} free block(s) still reserved after abortAll (a bug)`, null);
    return;
  }
  flushOwed(store);
  writeRunSave(store, 'ending-chosen');
}

// Deletes the run save (RUN END's one step, abandoning a run), whatever the save's status (review fix M2: an OFFLINE page
// used to leave the last save in the slot, stale or worse). A no-op with no session (headless). A remove that throws turns
// a working save offline (said like a write that failed); on a page already offline it is said on the console. Either way
// the stale rule refuses the save left behind on the next page open. `store`: the page's store, whose save status follows.
export function clearRunSave(store: Store<GameState> | null = null): void {
  if (session === null) return;
  session.pending = null;
  try {
    session.provider().removeItem(RUN_SAVE_KEY);
  } catch (error) {
    if (session.status === 'ok') goOffline(store, `the clear failed (${(error as Error).message})`, error);
    else console.error('[run save] the clear failed on an offline page: the save left behind reads stale on the next open', error);
  }
}
