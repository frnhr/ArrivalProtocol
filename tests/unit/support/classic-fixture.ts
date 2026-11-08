// Track RETIRE: a suite on run 1's arm that still checks one of the classic world's own branches (the ones phase 3 deletes
// with the classic five: no repository, no tree, no traces, no years on the classic route) builds that state inside
// withClassicWorld, so it is on the classic five and nothing else in the suite is.
import { inFixtureWorld } from '@state/initial';

export function withClassicWorld<T>(fn: () => T): T {
  return inFixtureWorld('classic', fn);
}
