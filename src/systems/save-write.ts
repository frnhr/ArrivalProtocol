// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import type { SavePoint, BootParts, SaveState } from '@/types/save';
import type { StorageProvider } from '@systems/storage';
import type { Meta } from '@systems/meta';

// The page's run save, the live half (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.1 "Storage"): one session
// `{ provider, status }` mirroring the archive's. The status goes ok → offline on the first read or write that throws
// (QuotaExceeded included): nothing more is written this page and 'save-lost' is emitted (a TERMINAL line, a buzz, the
// footer's NO SAVE), and play goes on. A headless world (GameState.save.status 'none') never writes, so the suites are
// untouched; the classic world is never saved.
// A leaf below run.ts and boot.ts (slice 3c foundation deviation, the plan's cycle guard): they call writeRunSave at the
// points; resume and abandon (systems/run-save.ts) import run.ts, never the other way.
// The foundation laid down the final signatures; the bodies are Track SAVE's (TODO(3c-SAVE)).

interface SaveSession {
  provider: StorageProvider;
  status: 'ok' | 'offline';
}

let session: SaveSession | null = null;

// Opens the page's run save (state/instance.ts, after openRunArchive and before the store exists): reads RUN_SAVE_KEY,
// decodes it (save-codec decodeRunSave) and checks it against the archive (saveRefusal; `meta` null: the archive can't be
// read). Returns the SaveState the store starts with: 'ok' with the RESUME line, 'ok' with none (nothing saved),
// 'cant-resume' with the reason, or 'offline'.
// TODO(3c-SAVE): plan §2.1, §2.2.
export function openRunSave(provider: StorageProvider, meta: Readonly<Meta> | null): SaveState {
  void provider;
  void meta;
  throw new Error('openRunSave: TODO(3c-SAVE)');
}

// Forgets the page's run save (headless suites between scenarios).
export function closeRunSave(): void {
  session = null;
}

// The one entry point for every save point (3c plan §1.3: ironman later adds a 'tab-hidden' point here): builds the save
// (save-codec buildRunSave), encodes it and writes it whole over the last one. `boot`: the BEAM point's racks and verdict
// (startShip's; the store no longer holds them once the ship is built), null at the other points. A no-op while the page
// has no working save (status 'none' in a headless world, 'offline', 'cant-resume') and on the classic world.
// TODO(3c-SAVE): the write itself, the offline path and 'save-lost' (plan §2.1).
export function writeRunSave(store: Store<GameState>, point: SavePoint, boot: Readonly<BootParts> | null = null): void {
  const state = store.getState();
  if (state.save.status !== 'ok' || state.run.map.world !== 'arm') return;
  void boot;
  throw new Error(`writeRunSave(${point}): TODO(3c-SAVE)`);
}

// Deletes the run save (RUN END's one step, abandoning a run). A no-op with no session (headless).
// TODO(3c-SAVE): the remove, and a throw there turns the save offline (plan §2.1).
export function clearRunSave(): void {
  if (session === null) return;
  throw new Error('clearRunSave: TODO(3c-SAVE)');
}
