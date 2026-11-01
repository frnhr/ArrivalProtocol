import type { GameState, RunLogState } from '@state/schema';
import type { LogSegment } from '@/types/segment';
import { LOG_NAME } from '@data/log-text';
import { currentSlot, isEndSlot } from '@systems/map-streams';

// 046.log's pure rules (docs/phase3/05-story.md §3.2; slice-2-plan §1.1 items 14–15): what a fresh run's log is, when the
// kid knows the file, and which entries a boot finds. Store-free and DOM-free, so data (script.ts's boot plan and SCAN
// lesson), the initial state, the stateful mount (systems/story-log.ts) and the views (systems/log-view.ts) share one rule
// without importing a mount module (the review's minor 7: two `logKnown`s disagreed, and data imported the mount).
// Slice 3 replaces logEntriesAtBoot with the rings (05 §3.2: an entry opens at the boot of the first ship at or beyond
// its ring) behind bootLogKeys, which data/script.ts's boot plan calls (Track GEN owns it; script.ts is DESK's).

// A run's log before anything is found.
export function createRunLog(): RunLogState {
  return { scanned: false, found: [], read: [], autoOpened: false };
}

// The kid knows what the file is (slice-2-plan risk 5): scanned, or a key found. The chip's name derives from this, not
// the other way round: the segment is rebuilt with `???` by the simulation retry and copied through every packet, so
// the run's log is the one truth and story-log brings the segment in line with it every tick.
export function logKnown(log: Readonly<RunLogState>): boolean {
  return log.scanned || log.found.length > 0;
}

export function logDisplayName(log: Readonly<RunLogState>): LogSegment['name'] {
  return logKnown(log) ? LOG_NAME.known : LOG_NAME.unknown;
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

// The entries this boot's keys open, before the run's found ones are taken out (data/script.ts bootLogEntries). Track
// GEN's seam (slice-3a review follow-up M3): TODO(3a-GEN) the rings (logEntriesAtBoot(solLy, isFinal), a two-layer hop
// opening two); today the interim keys by route position, the final ship's at its boot.
export function bootLogKeys(state: Readonly<Pick<GameState, 'run'>>): number[] {
  return logEntriesAtBoot(state.run.shipIndex, isEndSlot(state.run.map, currentSlot(state.run)));
}
