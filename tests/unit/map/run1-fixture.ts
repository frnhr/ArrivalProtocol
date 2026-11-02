// Run 1's arm as a RunMapState (slice-3a-plan §4.3), for the pure map suites: the table's structure with the foundation's
// placeholder details (map-generator assembleRun1Arm), no noise clouds, the unit on ARES-VII in 2300.
import type { RunMapState } from '@/types/map';
import { assembleRun1Arm } from '@systems/map-generator';
import { RUN_START_YEAR } from '@data/tuning';
import { MAP_STATE_VERSION, EMPTY_HISTORY } from '@data/map-state';

export function run1Map(seed = 1): RunMapState {
  return {
    version: MAP_STATE_VERSION, world: 'arm', run: 1, armSeed: seed, startYear: RUN_START_YEAR, arm: assembleRun1Arm(seed), noise: [],
    route: [{ slot: 0, depth: 1, hop: null }], galaxyYear: RUN_START_YEAR, pendingExtra: null,
    history: EMPTY_HISTORY,
  };
}

// The worked route (02 §3.14): ARES-VII, HALCYON, KESTREL, VESPER, CORMORANT, LAST LIGHT.
export const WORKED_ROUTE: readonly number[] = [0, 2, 5, 11, 15, 19];
