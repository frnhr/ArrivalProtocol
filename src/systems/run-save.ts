// Slice 3c: Track SAVE owns this file (docs/phase3/impl/slice-3c-plan.md §5.2); WORLD and UI request helpers by message.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';

// Resuming and abandoning a saved run (phase 3 slice 3c, docs/phase3/impl/slice-3c-plan.md §2.2): the stateful half that
// rebuilds the store from a save. The codec and checks are systems/save-codec.ts (pure) and the page's session
// systems/save-write.ts; both are re-exported here so a caller has one import. This file may import systems/run.ts and
// systems/boot.ts (resetWorldForShip, deskUiOnOpen, startRun, startBootFromTitle); they never import it (the plan's cycle
// guard).
// The foundation laid down the final signatures; the bodies are Track SAVE's (TODO(3c-SAVE)).

export {
  SAVE_POINTS, contentVersions, savePayloadAt, resumeLineOf, buildRunSave, encodeRunSave, decodeRunSave, saveRefusal,
} from '@systems/save-codec';
export { openRunSave, closeRunSave, writeRunSave, clearRunSave } from '@systems/save-write';

// [RESUME ▸] (plan §2.2): resetWorld, the id counters reserved past the save's (memory-ops reserveSegIds, say.ts
// reserveLogEntryIds), then a 'boot' payload replays the ship's boot (resetWorldForShip, the saved log plus a divider,
// startBootFromTitle without counting the run) and a 'world' payload restores the desk or the final LANDING REPORT in one
// update (the slices, the run, the log, the director's done list, the clock paused, the UI with deskUiOnOpen), then
// assertMemoryInvariants. A throw in the constructors is RUN SAVE CAN'T RESUME with its message.
// TODO(3c-SAVE).
export function resumeRun(store: Store<GameState>): void {
  void store;
  throw new Error('resumeRun: TODO(3c-SAVE)');
}

// [NEW RUN] over a save (after its inline confirm), [ABANDON RUN] and __ap.newRun (plan §2.2): the archive records the unit
// as 'abandoned' (its ships count as done, and the world update runs with them), the save is cleared, and the next unit's
// title opens (startRun on the arm). A stale save only clears.
// TODO(3c-SAVE).
export function abandonRun(store: Store<GameState>): void {
  void store;
  throw new Error('abandonRun: TODO(3c-SAVE)');
}
