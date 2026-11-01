import type { GameState, RunLogState } from '@state/schema';
import type { LogSegment } from '@/types/segment';
import { LOG_NAME } from '@data/log-text';
import { currentSlot, isEndSlot, worldSlotOf } from '@systems/map-streams';
import { solLy, ringsWithin } from '@systems/map-geometry';
import { RING_LY } from '@data/arm';

// 046.log's pure rules (docs/phase3/05-story.md §3.2; slice-2-plan §1.1 items 14–15): what a fresh run's log is, when the
// kid knows the file, and which entries a boot finds. Store-free and DOM-free, so data (script.ts's boot plan and SCAN
// lesson), the initial state, the stateful mount (systems/story-log.ts) and the views (systems/log-view.ts) share one rule
// without importing a mount module (the review's minor 7: two `logKnown`s disagreed, and data imported the mount).
// Slice 3a keys the boots by the rings (05 §3.2: an entry opens at the boot of the first ship at or beyond its ring)
// behind bootLogKeys, which data/script.ts's boot plan calls (Track GEN owns it; script.ts is DESK's).

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

// The entries each of 046.log's rings opens (05 §3.2's key table), ring 1 (20 LY) first: 02, 03, 04, 05–06, 07–08, 09.
// data/arm.ts RING_LY holds the distances; one entry list per ring.
export const RING_ENTRIES: readonly (readonly number[])[] = [[2], [3], [4], [5, 6], [7, 8], [9]];
// The final ship's boot opens the truth's first two entries (05 §3.2: 10–11; 12 is in the root).
export const FINAL_ENTRIES: readonly number[] = [10, 11];

if (RING_ENTRIES.length !== RING_LY.length) throw new Error(`log-selectors: ${RING_ENTRIES.length} ring entry lists for ${RING_LY.length} rings`);

// The entries whose keys a boot `solLy` LY from SOL finds (05 §3.2; slice 3a: the rings replace 05 §8.2's interim keys):
// every ring at or inside that distance (an entry opens at the boot of the first ship at or beyond its ring, so a
// two-layer hop opens two rings, and a boot past a ring whose entry a lost ship never found finds it now), and on a final
// ship 10–11. Entry 01 opens when ship 1's LANDING REPORT closes and entry 12 at the root's last block, so no boot finds
// them. The boot plan takes out the entries the run has found (data/script.ts bootLogEntries).
export function logEntriesAtBoot(solLy: number, isFinal: boolean): number[] {
  if (!(Number.isInteger(solLy) && solLy >= 0)) throw new Error(`logEntriesAtBoot: ${solLy} LY from SOL`);
  const entries = ringsWithin(solLy).flatMap((ring) => RING_ENTRIES[ring]!);
  return isFinal ? [...entries, ...FINAL_ENTRIES] : entries;
}

// The entries this boot's keys open, before the run's found ones are taken out (data/script.ts bootLogEntries): by the
// current ship's world's distance from SOL (the classic five sit on their arm worlds, 8, 29, 55, 107 and 180 LY, so they
// read the rings too), and the final ship's two. The review follow-up M3: script.ts calls this, never re-derives the rule.
export function bootLogKeys(state: Readonly<Pick<GameState, 'run'>>): number[] {
  const slot = currentSlot(state.run);
  return logEntriesAtBoot(solLy(worldSlotOf(state.run.map, slot)), isEndSlot(state.run.map, slot));
}
