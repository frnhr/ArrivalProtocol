import type { Store } from '@state/store';
import type { GameState, RunLogState } from '@state/schema';

// 046.log through the run (docs/phase3/05-story.md §3.2, §3.5; slice-2-plan §1.1 items 14–15), stateful: the keys found
// at the boots (`> 046.log · KEY FOUND · ENTRY 0n`), the SCAN reaction (the header, CONTROL's ignore line, the file
// renamed `046.log`), the reader opening by itself on entry 01 after ship 1's LANDING REPORT (run 1, once), and entry
// 12 typing from the root at its last block. Track OPENING owns this file; it reacts to run.phase changes and events,
// so systems/run.ts needs no edit for it. Slice 3 replaces logEntriesAtBoot with the rings (05 §3.2: an entry opens at
// the boot of the first ship at or beyond its ring).

// A run's log before anything is found.
export function createRunLog(): RunLogState {
  return { scanned: false, found: [], read: [], autoOpened: false };
}

// The entries whose keys a boot finds (05 §8.2's interim keys: "entry n at ship n, entries 10–12 on the last ship"):
// 02, 03 and 04 at the boots of ships 2, 3 and 4, 10 and 11 at the final ship's. Entry 01 opens when ship 1's LANDING
// REPORT closes and entry 12 at the root's last block, so no boot finds them.
export function logEntriesAtBoot(shipIndex: number, isFinal: boolean): number[] {
  if (!(Number.isInteger(shipIndex) && shipIndex >= 0)) throw new Error(`logEntriesAtBoot: ship index ${shipIndex}`);
  if (isFinal) return [10, 11];
  if (shipIndex >= 1 && shipIndex <= 3) return [shipIndex + 1];
  return [];
}

let mounted = false;

// STUB (foundation): mounts and unmounts, does nothing yet; Track OPENING fills it in.
export function mountStoryLog(store: Store<GameState>): () => void {
  if (mounted) throw new Error('mountStoryLog: already mounted');
  mounted = true;
  void store;
  return () => { mounted = false; };
}
