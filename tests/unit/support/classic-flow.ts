// The run through the DESK for the suites written before it (slice 3a foundation F2). A ship's end now opens the DESK
// (systems/run.ts openDesk) before TRANSMIT. The suites written before the desk import these in place of systems/run.ts's
// own, so their "CONTINUE → TRANSMIT" still holds: each sets course to the next ship when the call left the run on the
// desk (and does nothing when it ended the run or restarted ship 1). The desk itself is tested by the map suites
// (tests/unit/map/).
// • The classic world's desk offers its one next ship.
// • Run 1's arm (Track RETIRE: the fixture world, state/initial.ts): the worked route's next stop (systems/arm-fixture.ts),
//   with the first desk's required pick made (support/desk setCourseFromDesk). Nothing is requested: the suites' tools
//   are their own.
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import {
  continueAfterReport as runContinueAfterReport, continueAfterLoss as runContinueAfterLoss, setCourse, type LossPlan,
} from '@systems/run';
import { deskCandidates } from '@systems/desk';
import { WORKED_ROUTE } from '@systems/arm-fixture';
import { setCourseFromDesk } from './desk';

export function throughDesk(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') return;
  if (state.run.map.world === 'arm') {
    const next = WORKED_ROUTE[state.run.map.route.length];
    if (next === undefined) throw new Error(`throughDesk: the worked route has no stop after depth ${state.run.map.route.length}`);
    setCourseFromDesk(store, next);
    return;
  }
  const [only, ...more] = deskCandidates(state);
  if (only === undefined || more.length > 0) throw new Error(`throughDesk: the classic desk offers ${more.length + (only === undefined ? 0 : 1)} ships`);
  setCourse(store, only);
}

export function continueAfterReport(store: Store<GameState>): void {
  runContinueAfterReport(store);
  throughDesk(store);
}

export function continueAfterLoss(store: Store<GameState>): LossPlan {
  const plan = runContinueAfterLoss(store);
  throughDesk(store);
  return plan;
}
