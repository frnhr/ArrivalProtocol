// The classic world through the DESK (slice 3a foundation F2). A ship's end now opens the DESK (systems/run.ts openDesk)
// before TRANSMIT; the classic world's desk offers its one next ship. The suites written before the desk import these in
// place of systems/run.ts's own, so their "CONTINUE → TRANSMIT" still holds: each sets course to that ship when the call
// left the run on the desk (and does nothing when it ended the run or restarted ship 1). The desk itself is tested by
// the map suites (tests/unit/map/).
import type { Store } from '@state/store';
import type { GameState } from '@state/schema';
import {
  continueAfterReport as runContinueAfterReport, continueAfterLoss as runContinueAfterLoss, setCourse, type LossPlan,
} from '@systems/run';
import { deskCandidates } from '@systems/desk';

export function throughDesk(store: Store<GameState>): void {
  const state = store.getState();
  if (state.run.phase !== 'desk') return;
  if (state.run.map.world !== 'classic') throw new Error('throughDesk: only the classic world has one ship to set course to');
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
