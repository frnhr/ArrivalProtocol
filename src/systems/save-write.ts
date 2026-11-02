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
// headless world (GameState.save.status 'none') never writes, so the suites are untouched; the classic world is never
// saved.
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

// A read, write or remove threw, or a save could not be built: OFFLINE for the rest of the page, said once.
function goOffline(store: Store<GameState> | null, why: string, error: unknown): void {
  if (session !== null) session.status = 'offline';
  console.error(`[run save] offline: ${why}`, error);
  if (store !== null && store.getState().save.status !== 'none') {
    store.update((draft) => { draft.save = { status: 'offline', resume: null, refusal: null }; });
  }
  emit('save-lost', NO_PAYLOAD);
}

// The one entry point for every save point (3c plan §1.3: ironman later adds a 'tab-hidden' point here): builds the save
// (save-codec buildRunSave), encodes it and writes it whole over the last one. `boot`: the BEAM and RUN START points' racks
// and verdict (the store no longer holds them once the ship is built), null at the world points. A no-op while the page
// has no working save (status 'none' in a headless world, 'offline', 'cant-resume'), on the classic world, and while the
// archive can't vouch for a save (anything but 'ok': a save is resumed only when the archive's run in progress is its run,
// so one written without it could never be resumed).
// A save that can't be built or encoded (a point called at the wrong moment, a non-finite number) is a bug: the console
// says it loudly with the stack, and the save goes OFFLINE like a write that threw, so play goes on and the kid is told.
export function writeRunSave(store: Store<GameState>, point: SavePoint, boot: Readonly<BootParts> | null = null): void {
  const state = store.getState();
  if (state.save.status !== 'ok' || state.run.map.world !== 'arm' || session === null || session.status !== 'ok') return;
  if (state.archive.status !== 'ok') return;
  let raw: string;
  try {
    raw = encodeRunSave(buildRunSave(state, point, archiveMeta().runs, boot, Date.now()));
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

// A finale that has decided how the run ends (systems/finale.ts finaleRunCause's three).
const DECIDED: readonly GameState['hollow']['finale']['phase'][] = ['purged', 'merged', 'unresolved'];

// ENDING CHOSEN (3c plan §2.1, risk 1; systems/landing.ts as the final LANDING REPORT opens with a decided finale): every op
// stops first (none may write into memory under the save, and none is running in the resumed world), no free block is left
// reserved by one, then the save. `flushOwed` says anything the finale still owed the radio (systems/finale.ts
// sayOwedVerdict: CONTROL's verdict waits for the typed ending, and a resumed world has no module state to say it from), so
// the save's log has it. The clock stays as it was (the report's own pause rule). Slice 7 moves this to step 2's confirm.
export function writeEndingChosen(store: Store<GameState>, flushOwed: (store: Store<GameState>) => void): void {
  const state = store.getState();
  if (state.run.map.world !== 'arm' || !DECIDED.includes(state.hollow.finale.phase)) return;
  abortAll();
  const reserved = store.getState().memory.filter((seg) => seg.type === 'free' && seg.reservedBy !== undefined);
  if (reserved.length > 0) throw new Error(`writeEndingChosen: ${reserved.length} free block(s) still reserved after abortAll`);
  flushOwed(store);
  writeRunSave(store, 'ending-chosen');
}

// Deletes the run save (RUN END's one step, abandoning a run). A no-op with no session (headless) and when the save is
// already offline; a remove that throws turns it offline (said like a write that failed: the stale rule still refuses the
// save left behind on the next page open). `store`: the page's store, whose save status follows.
export function clearRunSave(store: Store<GameState> | null = null): void {
  if (session === null || session.status !== 'ok') return;
  session.pending = null;
  try {
    session.provider().removeItem(RUN_SAVE_KEY);
  } catch (error) {
    goOffline(store, `the clear failed (${(error as Error).message})`, error);
  }
}
